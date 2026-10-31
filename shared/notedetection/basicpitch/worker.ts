/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The note detection in a Web Worker (basicpitchdetector.ts starts it): the audio comes from the recorder worklet
 * through a MessagePort at the sample rate of the audio context and is resampled to 22050 Hz here; the model runs on
 * the latest window every ~100 ms (LiveTranscriber), the notes of the last seconds are decoded, and each note is
 * reported once when it appears, if it is loud enough (LevelGate: not keys pressed without sounding, clicks, the noise
 * of the room) and not an overtone of a lower note (overtonefilter.ts). So the main thread (the score view) does not slow down the detection, and the other way round.
 */
import * as tf from '@tensorflow/tfjs'
import { DEFAULT_NOTE_DETECTOR_SETTINGS, type DetectedNote, type NoteDetectorSettings, type NoteDetectorStats } from '../notedetector'
import { MODEL_SAMPLE_RATE, StreamResampler } from './audioinput'
import { BasicPitch } from './inference'
import { HOP, LevelGate } from './levelgate'
import { overtoneOf } from './overtonefilter'
import { FRAMES_PER_SECOND, LiveTranscriber, type DetectionSettings, type TranscriptionUpdate } from './transcriber'

/** the messages to the worker */
export type ToWorker =
    | { type: 'start'; modelUrl: string; sampleRate: number; port: MessagePort; settings: NoteDetectorSettings }
    | { type: 'settings'; settings: NoteDetectorSettings }
    | { type: 'stop' }

/** the messages from the worker */
export type FromWorker =
    | { type: 'ready' }
    | { type: 'error'; message: string }
    | { type: 'update'; notes: DetectedNote[]; active: number[]; stats: NoteDetectorStats }

const SETTINGS: DetectionSettings = {
    onsetThreshold: 0.5,
    frameThreshold: 0.3,
    // shorter than basic-pitch's default (11 frames) to report the notes sooner
    minNoteLengthFrames: 7,
    // off: it adds notes without onsets by scanning the whole history once per remaining note, which gets far too slow
    // with many (sustained) notes; the playalong and the note input need the onsets only
    melodiaTrick: false,
}

/** the seconds of output decoded into notes (the notes are reported when they start) */
const HISTORY_SECONDS = 2.5

/** two notes of the same pitch whose starts differ by at most this many frames are the same note (decoded again) */
const SAME_NOTE_FRAMES = 6

/**
 * the frames from the last frame of an update to the end of its audio window: the model's output of a window ends 15
 * frames before it (unwrapOutput), the window is 2 s - 1 hop (171.3 hops)
 */
const LAST_FRAME_TO_WINDOW_END = 15.3

const scope = self as unknown as {
    postMessage(message: FromWorker): void
    onmessage: ((event: MessageEvent<ToWorker>) => void) | null
}

let s_model: BasicPitch | null = null
let s_modelUrl = ''
let s_transcriber: LiveTranscriber | null = null
let s_port: MessagePort | null = null
/** the start frames of the notes reported, by pitch */
let s_reported = new Map<number, number[]>()
let s_stats: NoteDetectorStats = { processingMs: 0, latency: 0, updates: 0, rejected: 0, overtones: 0, floorDb: 0 }
let s_gate = new LevelGate()
let s_settings: NoteDetectorSettings = DEFAULT_NOTE_DETECTOR_SETTINGS

async function start(modelUrl: string, sampleRate: number, port: MessagePort): Promise<void> {
    stop()
    await tf.ready()
    if (!s_model || s_modelUrl !== modelUrl) {
        s_model = new BasicPitch(modelUrl)
        s_modelUrl = modelUrl
        await LiveTranscriber.warmUp(s_model)
    }
    const transcriber = new LiveTranscriber(s_model, () => SETTINGS, onUpdate, HISTORY_SECONDS)
    const resampler = sampleRate === MODEL_SAMPLE_RATE ? null : new StreamResampler(sampleRate, MODEL_SAMPLE_RATE)
    s_transcriber = transcriber
    s_port = port
    const gate = new LevelGate()
    s_gate = gate
    port.onmessage = (event: MessageEvent<Float32Array>) => {
        const samples = resampler ? resampler.process(event.data) : event.data
        gate.push(samples)
        transcriber.pushAudio(samples)
    }
    transcriber.start()
    scope.postMessage({ type: 'ready' })
}

function stop(): void {
    s_transcriber?.stop()
    s_transcriber = null
    s_port?.close()
    s_port = null
    s_reported = new Map()
    s_stats = { processingMs: 0, latency: 0, updates: 0, rejected: 0, overtones: 0, floorDb: 0 }
}

function onUpdate(update: TranscriptionUpdate): void {
    const n = s_stats.updates
    s_stats.updates = n + 1
    s_stats.processingMs = n ? 0.9 * s_stats.processingMs + 0.1 * update.inferenceMs : update.inferenceMs
    const notes: DetectedNote[] = []
    const oldest = update.lastFrame - 2 * HISTORY_SECONDS * FRAMES_PER_SECOND
    for (const note of [...update.notes].sort((a, b) => a.startFrame - b.startFrame)) {
        let starts = s_reported.get(note.pitchMidi)
        if (!starts) {
            starts = []
            s_reported.set(note.pitchMidi, starts)
        }
        if (starts.some(f => Math.abs(f - note.startFrame) <= SAME_NOTE_FRAMES)) {
            continue
        }
        starts.push(note.startFrame)
        // compared with all notes decoded (the lower note may have been reported before)
        if (overtoneOf(note, update.notes, s_settings.overtoneFilter)) {
            ++s_stats.overtones
            continue
        }
        const hop = Math.round(update.endSample / HOP - LAST_FRAME_TO_WINDOW_END - (update.lastFrame - note.startFrame))
        if (!s_gate.accepts(hop)) {
            ++s_stats.rejected
            continue
        }
        s_stats.latency = (update.lastFrame - note.startFrame) / FRAMES_PER_SECOND
        notes.push({ pitch: note.pitchMidi, time: note.startFrame / FRAMES_PER_SECOND, amplitude: note.amplitude })
    }
    for (const [pitch, starts] of s_reported) {
        const kept = starts.filter(f => f >= oldest)
        if (kept.length) {
            s_reported.set(pitch, kept)
        } else {
            s_reported.delete(pitch)
        }
    }
    s_stats.floorDb = s_gate.floorDb()
    scope.postMessage({ type: 'update', notes, active: update.notes.filter(x => x.active).map(x => x.pitchMidi), stats: { ...s_stats } })
}

scope.onmessage = (event: MessageEvent<ToWorker>): void => {
    const msg = event.data
    if (msg.type === 'start') {
        s_settings = msg.settings
        start(msg.modelUrl, msg.sampleRate, msg.port).catch((e: unknown) => {
            scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
        })
    } else if (msg.type === 'settings') {
        s_settings = msg.settings
    } else if (msg.type === 'stop') {
        stop()
    }
}
