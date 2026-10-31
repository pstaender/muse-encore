/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The calibration of the note detection (not in MuseScore): the player plays the notes of a calibration sheet step by
 * step (silence, loud low notes, octaves in the bass, soft notes); the notes the detector finds before any filtering
 * give the values of the overtone filter (how strong the overtones of a low note are compared to it, and how strong a
 * real octave is) and of the level gate (how loud a soft note is above the noise of the room).
 */
import { HARMONICS, OVERTONE_LEVELS, OVERTONE_ONSET_FRAMES } from './basicpitch/overtonefilter'
import { DEFAULT_LEVEL_GATE } from './basicpitch/levelgate'
import type { DetectionCalibration, DetectionUpdate, RawNote } from './notedetector'

/** silence: the noise of the room; loud: one low note; octave: two notes an octave apart; soft: a quiet note */
export type CalibrationKind = 'silence' | 'loud' | 'octave' | 'soft'

export interface CalibrationStep {
    kind: CalibrationKind
    pitches: number[]
}

/** the steps of the measures' pitches: none = silence, an octave, a note below C4 = loud, else soft */
export function calibrationSteps(measurePitches: readonly (readonly number[])[]): CalibrationStep[] {
    return measurePitches.map(pitches => {
        const p = [...pitches].sort((a, b) => a - b)
        const kind: CalibrationKind = !p.length ? 'silence'
            : p.length === 2 && p[1] - p[0] === 12 ? 'octave'
                : p[0] < 60 ? 'loud' : 'soft'
        return { kind, pitches: p }
    })
}

/** the seconds of silence measured */
export const SILENCE_SECONDS = 3
/** the seconds the notes of a step are collected after they were all found (overtones are decoded a bit later) */
export const COLLECT_SECONDS = 1

/** the seconds between frames of the detection (basic-pitch: 22050 Hz / 256) */
const ONSET_SECONDS = OVERTONE_ONSET_FRAMES * 256 / 22050

export interface CalibrationResult {
    calibration: DetectionCalibration
    /** the steps whose notes were all found, of the steps with notes */
    recognized: number
    steps: number
    /** the overtones found (for showing them) */
    overtones: number
}

interface StepData {
    notes: RawNote[]
    /** the time the step started and the time all its notes were found (-1: not yet) */
    start: number
    found: number
    skipped: boolean
}

export class Calibrator {
    readonly steps: readonly CalibrationStep[]
    private m_step = 0
    private data: StepData[]
    private m_floorDb = -100

    constructor(steps: readonly CalibrationStep[]) {
        this.steps = steps
        this.data = steps.map(() => ({ notes: [], start: -1, found: -1, skipped: false }))
    }

    /** the current step (steps.length: done) */
    step(): number {
        return this.m_step
    }

    done(): boolean {
        return this.m_step >= this.steps.length
    }

    /** takes an update of the detection; true if the step changed */
    onUpdate(update: DetectionUpdate): boolean {
        if (this.done()) {
            return false
        }
        const step = this.steps[this.m_step]
        const d = this.data[this.m_step]
        if (d.start < 0) {
            d.start = update.time
        }
        if (step.kind === 'silence') {
            if (update.time - d.start >= SILENCE_SECONDS) {
                this.m_floorDb = update.floorDb
                return this.next()
            }
            return false
        }
        // notes that started before the step are from the step before
        d.notes.push(...update.raw.filter(n => n.time >= d.start - ONSET_SECONDS))
        if (d.found < 0 && step.pitches.every(p => d.notes.some(n => n.pitch === p))) {
            d.found = update.time
        }
        if (d.found >= 0 && update.time - d.found >= COLLECT_SECONDS) {
            this.m_floorDb = Math.max(this.m_floorDb, update.floorDb)
            return this.next()
        }
        return false
    }

    /** goes on without the notes of the step */
    skip(): void {
        if (!this.done()) {
            this.data[this.m_step].skipped = true
            this.next()
        }
    }

    private next(): boolean {
        ++this.m_step
        return true
    }

    /** the values measured */
    result(): CalibrationResult {
        const octaveOvertones: number[] = []
        const otherOvertones: number[] = []
        const realOctaves: number[] = []
        const softLevels: number[] = []
        let recognized = 0
        let steps = 0
        this.steps.forEach((step, i) => {
            const d = this.data[i]
            if (step.kind === 'silence') {
                return
            }
            ++steps
            if (d.skipped || d.found < 0) {
                return
            }
            ++recognized
            // the strongest note of each expected pitch
            const played = step.pitches.map(p => d.notes.filter(n => n.pitch === p).reduce((a, b) => (b.amplitude > a.amplitude ? b : a)))
            if (step.kind === 'soft') {
                softLevels.push(...played.map(n => n.levelDb - this.m_floorDb))
                return
            }
            const low = played[0]
            if (step.kind === 'octave') {
                realOctaves.push(played[1].amplitude / low.amplitude)
            }
            // the other notes at harmonic distances above the low note, starting with it
            for (const n of d.notes) {
                if (step.pitches.includes(n.pitch) || Math.abs(n.time - low.time) > ONSET_SECONDS) {
                    continue
                }
                const interval = n.pitch - low.pitch
                if (HARMONICS.includes(interval)) {
                    (interval === 12 ? octaveOvertones : otherOvertones).push(n.amplitude / low.amplitude)
                }
            }
        })
        return {
            calibration: calibrationOf(octaveOvertones, otherOvertones, realOctaves, softLevels),
            recognized, steps, overtones: octaveOvertones.length + otherOvertones.length,
        }
    }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const max = (v: number[]): number | null => (v.length ? Math.max(...v) : null)
const min = (v: number[]): number | null => (v.length ? Math.min(...v) : null)

/** the filter values from the ratios measured (the normal level's values where nothing was measured) */
export function calibrationOf(octaveOvertones: number[], otherOvertones: number[], realOctaves: number[], softLevels: number[]): DetectionCalibration {
    const normal = OVERTONE_LEVELS.normal
    const overtoneOctave = max(octaveOvertones)
    const realOctave = min(realOctaves)
    let octaveRatio: number
    if (overtoneOctave === null) {
        octaveRatio = realOctave === null ? normal.octaveRatio : Math.min(normal.octaveRatio, 0.8 * realOctave)
    } else if (realOctave === null) {
        octaveRatio = 1.15 * overtoneOctave
    } else if (overtoneOctave < realOctave) {
        // between the strongest overtone and the weakest octave played
        octaveRatio = (overtoneOctave + realOctave) / 2
    } else {
        // overtones as strong as real octaves: the octaves played are kept
        octaveRatio = 0.9 * realOctave
    }
    const other = max(otherOvertones)
    const softest = min(softLevels)
    return {
        overtone: {
            maxFundamental: normal.maxFundamental,
            maxInterval: 36,
            ratio: clamp(other === null ? normal.ratio : 1.15 * other, 0.3, 3),
            octaveRatio: clamp(octaveRatio, 0.1, 2),
        },
        // a little below the softest note played
        overFloorDb: clamp(softest === null ? DEFAULT_LEVEL_GATE.overFloorDb : softest - 4, 6, 25),
    }
}
