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
    /** the noise floor of the microphone (dBFS) */
    floorDb: number
}

export interface NoteDetectorOptions {
    /** the base URL of the app (the detector's files, e.g. its model, are served below it) */
    baseUrl: string
    /** 'test-melody': a synthesized melody instead of the microphone (development) */
    input?: 'microphone' | 'test-melody'
}

/** the note detector (loaded on first use: its model and libraries are big) */
export async function createNoteDetector(options: NoteDetectorOptions): Promise<NoteDetector> {
    const { BasicPitchDetector } = await import('./basicpitch/basicpitchdetector')
    return new BasicPitchDetector(options)
}
