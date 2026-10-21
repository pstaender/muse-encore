// SPDX-License-Identifier: GPL-3.0-only
// The layout of the changed range after a command (ScorePageViewLayout::initLayoutContext for !isLayoutAll) gives the
// same result as a layout of the whole score.
import { describe, expect, it } from 'vitest'
// first: the library's import order (the DOM modules have import cycles)
import { TEST_FILES, VTEST, hasSubmodule, openScore, scoreHash } from './helpers'
import { Score } from '../src/engraving/dom/score'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { UpDownMode } from '../src/engraving/dom/mscore'
import { AccidentalType } from '../src/engraving/dom/accidentaldata'
import { TDuration } from '../src/engraving/dom/durationtype'
import { DurationType } from '../src/engraving/types/types'
import type { MasterScore } from '../src/engraving/dom/masterscore'
import type { Chord } from '../src/engraving/dom/chord'
import type { ChordRest } from '../src/engraving/dom/chordrest'

function chordRests(score: MasterScore): ChordRest[] {
    const res: ChordRest[] = []
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        for (let track = 0; track < score.ntracks(); ++track) {
            const e = s.element(track)
            if (e && e.isChordRest()) {
                res.push(e as unknown as ChordRest)
            }
        }
    }
    return res
}

/** the hash of a full layout of the score in its current state */
function fullLayoutHash(score: MasterScore): string {
    Score.partialLayout = false
    try {
        score.doLayout()
    } finally {
        Score.partialLayout = true
    }
    return scoreHash(score)
}

const EDITS: [string, (score: MasterScore, cr: ChordRest) => void][] = [
    ['pitch up', (score) => score.upDown(true, UpDownMode.CHROMATIC)],
    ['octave down', (score) => score.upDown(false, UpDownMode.OCTAVE)],
    ['sharp', (score) => score.changeAccidental(AccidentalType.SHARP)],
    ['visible', (score) => score.cmdToggleVisible()],
    ['flip', (score) => score.cmdFlip()],
    ['eighth', (score, cr) => score.changeCRlen(cr, new TDuration(DurationType.V_EIGHTH))],
    ['half', (score, cr) => score.changeCRlen(cr, new TDuration(DurationType.V_HALF))],
    ['delete', (score) => score.cmdDeleteSelection()],
]

describe.runIf(hasSubmodule)('partial layout', () => {
    for (const file of [`${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`, `${VTEST}/beams-1.mscz`, `${VTEST}/accidental-1.mscx`]) {
        it(`equals the full layout after edits: ${file.split('/').pop()}`, async () => {
            const score = await openScore(file)
            const crs = chordRests(score)
            // chords in the middle and near the end of the score
            const picks = [crs[Math.floor(crs.length / 2)], crs[Math.floor(crs.length * 0.8)], crs[3]].filter(Boolean)
            for (const cr of picks) {
                for (const [name, edit] of EDITS) {
                    score.deselectAll()
                    score.select(cr.isChord() ? (cr as Chord).upNote() : cr, SelectType.SINGLE)
                    if (!cr.explicitParent()) {
                        continue
                    }
                    score.startCmd()
                    edit(score, cr)
                    score.endCmd()
                    const partial = scoreHash(score)
                    expect(fullLayoutHash(score), `${name} at tick ${cr.tick().ticks()}`).toBe(partial)
                    score.undoRedo(true)
                    const undone = scoreHash(score)
                    expect(fullLayoutHash(score), `undo ${name} at tick ${cr.tick().ticks()}`).toBe(undone)
                }
            }
        }, 120000)
    }
})
