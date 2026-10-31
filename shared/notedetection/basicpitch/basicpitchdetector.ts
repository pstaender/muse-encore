/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The NoteDetector on Spotify's basic-pitch (Apache-2.0, see LICENSE; inference.ts, notes.ts, audioinput.ts and
 * transcriber.ts are taken from basic-pitch-ts and its live microphone demo). The detection runs in a Web Worker
 * (worker.ts); here, on the main thread, only the audio input is created (Web Audio is not available in workers): its
 * recorder worklet sends the audio directly to the worker. The model (model/) is served at <base>/basic-pitch/
 * (vite-plugin-basicpitch.ts).
 */
import { DEFAULT_NOTE_DETECTOR_SETTINGS, type DetectedNote, type NoteDetector, type NoteDetectorOptions, type NoteDetectorSettings, type NoteDetectorStats } from '../notedetector'
import { AudioInput } from './audioinput'
import type { FromWorker, ToWorker } from './worker'

let s_worker: Worker | null = null

/** the worker (once: it keeps the model loaded) */
function worker(): Worker {
    s_worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    return s_worker
}

export class BasicPitchDetector implements NoteDetector {
    private readonly options: NoteDetectorOptions
    private m_settings: NoteDetectorSettings
    private input: AudioInput | null = null
    private active: number[] = []
    private m_stats: NoteDetectorStats = { processingMs: 0, latency: 0, updates: 0, rejected: 0, overtones: 0, floorDb: 0 }
    private listener: ((event: MessageEvent<FromWorker>) => void) | null = null

    constructor(options: NoteDetectorOptions) {
        this.options = options
        this.m_settings = { ...DEFAULT_NOTE_DETECTOR_SETTINGS, ...options.settings }
    }

    configure(settings: Partial<NoteDetectorSettings>): void {
        this.m_settings = { ...this.m_settings, ...settings }
        if (this.input) {
            const msg: ToWorker = { type: 'settings', settings: this.m_settings }
            s_worker?.postMessage(msg)
        }
    }

    async start(onNote: (note: DetectedNote) => void): Promise<void> {
        await this.stop()
        const w = worker()
        const channel = new MessageChannel()
        const ready = new Promise<void>((resolve, reject) => {
            this.listener = (event: MessageEvent<FromWorker>): void => {
                const msg = event.data
                if (msg.type === 'ready') {
                    resolve()
                } else if (msg.type === 'error') {
                    reject(new Error(msg.message))
                } else if (msg.type === 'update') {
                    this.active = msg.active
                    this.m_stats = msg.stats
                    for (const note of msg.notes) {
                        onNote(note)
                    }
                }
            }
            w.addEventListener('message', this.listener)
        })
        this.input = new AudioInput(() => {})
        try {
            await this.input.start(this.options.input ?? 'microphone', channel.port1)
            const modelUrl = new URL(`${this.options.baseUrl}basic-pitch/model.json`, location.href).href
            const msg: ToWorker = { type: 'start', modelUrl, sampleRate: this.input.sampleRate!, port: channel.port2, settings: this.m_settings }
            w.postMessage(msg, [channel.port2])
            await ready
        } catch (e) {
            await this.stop()
            throw e
        }
    }

    async stop(): Promise<void> {
        const msg: ToWorker = { type: 'stop' }
        s_worker?.postMessage(msg)
        if (this.listener) {
            s_worker?.removeEventListener('message', this.listener)
            this.listener = null
        }
        const input = this.input
        this.input = null
        this.active = []
        this.m_stats = { processingMs: 0, latency: 0, updates: 0, rejected: 0, overtones: 0, floorDb: 0 }
        await input?.stop()
    }

    activePitches(): number[] {
        return this.active
    }

    stats(): NoteDetectorStats {
        return { ...this.m_stats }
    }
}
