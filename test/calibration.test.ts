// SPDX-License-Identifier: GPL-3.0-only
// The calibration of the note detection (shared/notedetection/calibration.ts): the steps of the calibration sheet, the
// advance from step to step, and the filter values from the notes found.
import { describe, expect, it } from 'vitest'
import { openScore } from './helpers'
import { playalongMeasures } from '../src/index'
import { calibrationOf, calibrationSteps, Calibrator, COLLECT_SECONDS, SILENCE_SECONDS } from '../shared/notedetection/calibration'
import type { RawNote } from '../shared/notedetection/notedetector'

const note = (pitch: number, time: number, amplitude: number, levelDb = -30): RawNote => ({ pitch, time, amplitude, levelDb })

describe('calibration', () => {
    it('the calibration sheet of the editor: silence, loud low notes, octaves, soft notes', async () => {
        const score = await openScore('editor/playalong/calibration.mscx')
        const steps = calibrationSteps(playalongMeasures(score).map(m => m.events.flatMap(e => e.pitches)))
        expect(steps.map(s => s.kind)).toEqual(['silence', 'loud', 'loud', 'loud', 'loud', 'octave', 'octave', 'octave', 'soft', 'soft', 'soft'])
        expect(steps[1].pitches).toEqual([36])
        expect(steps[5].pitches).toEqual([36, 48])
    })

    it('steps of the calibration sheet', () => {
        expect(calibrationSteps([[], [38], [38, 50], [60]]).map(s => s.kind)).toEqual(['silence', 'loud', 'octave', 'soft'])
    })

    it('advances, measures the overtones, the octaves and the soft notes', () => {
        const cal = new Calibrator(calibrationSteps([[], [38], [38, 50], [64]]))
        let t = 0
        const update = (raw: RawNote[] = [], floorDb = -70): boolean => cal.onUpdate({ time: t, raw, floorDb })
        // silence
        for (; t < SILENCE_SECONDS; t += 0.1) {
            update()
        }
        expect(update()).toBe(true)
        expect(cal.step()).toBe(1)
        // D2 loud: its octave (0.4) and twelfth (0.3) are found too
        t += 0.5
        update([note(38, t, 0.8), note(50, t, 0.32), note(57, t + 0.01, 0.24)])
        for (const end = t + COLLECT_SECONDS; t < end; t += 0.1) {
            expect(update()).toBe(false)
        }
        expect(update()).toBe(true)
        // the octave D2 + D3, played as strong
        t += 0.5
        update([note(38, t, 0.8), note(50, t, 0.72)])
        for (const end = t + COLLECT_SECONDS + 0.1; t < end; t += 0.1) {
            update()
        }
        expect(cal.step()).toBe(3)
        // E4 softly, 20 dB above the floor
        t += 0.5
        update([note(64, t, 0.5, -50)])
        for (const end = t + COLLECT_SECONDS + 0.1; t < end; t += 0.1) {
            update()
        }
        expect(cal.done()).toBe(true)
        const r = cal.result()
        expect(r.recognized).toBe(3)
        expect(r.steps).toBe(3)
        expect(r.overtones).toBe(2)
        // between the overtone octave (0.4) and the real one (0.9)
        expect(r.calibration.overtone.octaveRatio).toBeCloseTo(0.65, 2)
        expect(r.calibration.overtone.ratio).toBeCloseTo(0.3 * 1.15, 2)
        expect(r.calibration.overFloorDb).toBeCloseTo(16, 1)
    })

    it('skipped steps keep the normal values', () => {
        const cal = new Calibrator(calibrationSteps([[38], [60]]))
        cal.skip()
        cal.skip()
        const r = cal.result()
        expect(cal.done()).toBe(true)
        expect(r.recognized).toBe(0)
        expect(r.calibration.overtone.octaveRatio).toBe(0.6)
        expect(r.calibration.overFloorDb).toBe(15)
    })

    it('keeps real octaves when the overtones are as strong', () => {
        expect(calibrationOf([0.9], [], [0.8], []).overtone.octaveRatio).toBeCloseTo(0.72, 2)
    })
})
