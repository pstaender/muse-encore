/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The detection of the notes played into the microphone (not in MuseScore; used by the editor's playalong). The app
 * only knows this interface: an implementation is loaded on demand by createNoteDetector, so it can be replaced by
 * another one (or removed) here without touching the app. The current one is Spotify's basic-pitch (basicpitch/).
 */

/** a note that started sounding */
export interface DetectedNote {
    /** MIDI pitch */
    pitch: number
    /** the start in seconds since the detector was started */
    time: number
    /** 0..1 */
    amplitude: number
}

export interface NoteDetectorStatus {
    state: 'loading' | 'listening' | 'stopped' | 'error'
    message?: string
}

export interface NoteDetector {
    /** asks for the microphone and starts listening; calls onNote for each new note */
    start(onNote: (note: DetectedNote) => void): Promise<void>
    stop(): Promise<void>
    /** changes the settings while listening (also taken by the next start) */
    configure(settings: Partial<NoteDetectorSettings>): void
    /** the pitches sounding now (for showing what is heard) */
    activePitches(): number[]
    /** how fast the detection is (for showing it, and for finding problems) */
    stats(): NoteDetectorStats
}

export interface NoteDetectorStats {
    /** the average time of processing the audio once (ms) */
    processingMs: number
    /** how late the last note was reported after it started (s) */
    latency: number
    updates: number
    /** the notes not reported because they were too quiet */
    rejected: number
    /** the notes not reported because they were overtones of a lower note */
    overtones: number
    /** the noise floor of the microphone (dBFS) */
    floorDb: number
}

/**
 * the overtone filter: notes at the distance of a harmonic above a lower note starting at the same time and clearly
 * weaker are not reported (low piano notes); 'strong' also filters higher notes and stronger overtones (and then
 * more real octaves)
 */
export type OvertoneFilterLevel = 'off' | 'normal' | 'strong'

export interface NoteDetectorSettings {
    overtoneFilter: OvertoneFilterLevel
}

export const DEFAULT_NOTE_DETECTOR_SETTINGS: NoteDetectorSettings = { overtoneFilter: 'normal' }

export interface NoteDetectorOptions {
    /** the base URL of the app (the detector's files, e.g. its model, are served below it) */
    baseUrl: string
    /** 'test-melody': a synthesized melody instead of the microphone (development) */
    input?: 'microphone' | 'test-melody'
    settings?: Partial<NoteDetectorSettings>
}

/** the note detector (loaded on first use: its model and libraries are big) */
export async function createNoteDetector(options: NoteDetectorOptions): Promise<NoteDetector> {
    const { BasicPitchDetector } = await import('./basicpitch/basicpitchdetector')
    return new BasicPitchDetector(options)
}
