/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The overtone filter of the note detection (not in basic-pitch): a low piano string has strong overtones (the octave,
 * the octave + fifth, two octaves, ...), which basic-pitch reports as notes of their own, since it rates each pitch
 * separately. A note is taken for an overtone when a lower note starts at the same time at the distance of a harmonic
 * and the note is clearly weaker than that one. Real octaves (often played in the bass) are struck and about as strong
 * as the lower note, so the octave needs a weaker note than the other harmonics.
 */
import type { NoteDetectorSettings, OvertoneParams } from '../notedetector'

/** what the filter needs of a detected note */
export interface OvertoneCandidate {
    pitchMidi: number
    startFrame: number
    /** basic-pitch's mean activation of the note, 0..1 */
    amplitude: number
}

/** the semitones from the fundamental to its harmonics 2..8 (rounded) */
export const HARMONICS = [12, 19, 24, 28, 31, 34, 36]

/** the starts of a note and of its overtone differ by at most this many frames (~11.6 ms each) */
export const OVERTONE_ONSET_FRAMES = 4

export const OVERTONE_LEVELS: Record<'normal' | 'strong', OvertoneParams> = {
    // the bass and tenor range (below C4; the overtones of higher notes are rarely detected), harmonics 2..6
    normal: { maxFundamental: 60, maxInterval: 31, ratio: 0.9, octaveRatio: 0.6 },
    // also middle notes and higher harmonics; an octave as strong as the lower note is still taken for an overtone
    strong: { maxFundamental: 72, maxInterval: 36, ratio: 1.5, octaveRatio: 1.0 },
}

/** the parameters of the settings' filter (null: off; calibrated without a calibration: normal) */
export function overtoneParams(settings: NoteDetectorSettings): OvertoneParams | null {
    switch (settings.overtoneFilter) {
    case 'off':
        return null
    case 'calibrated':
        return settings.calibration?.overtone ?? OVERTONE_LEVELS.normal
    default:
        return OVERTONE_LEVELS[settings.overtoneFilter]
    }
}

/** the lower note of which `note` is an overtone (null: none, a played note; p null: no filter) */
export function overtoneOf<T extends OvertoneCandidate>(note: T, notes: readonly T[], p: OvertoneParams | null): T | null {
    if (!p) {
        return null
    }
    for (const f of notes) {
        const interval = note.pitchMidi - f.pitchMidi
        if (f === note || f.pitchMidi >= p.maxFundamental || interval > p.maxInterval || !HARMONICS.includes(interval)) {
            continue
        }
        if (Math.abs(f.startFrame - note.startFrame) > OVERTONE_ONSET_FRAMES) {
            continue
        }
        if (note.amplitude < (interval === 12 ? p.octaveRatio : p.ratio) * f.amplitude) {
            return f
        }
    }
    return null
}
