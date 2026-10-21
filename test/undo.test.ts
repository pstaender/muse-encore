// SPDX-License-Identifier: GPL-3.0-only
// The undo stack (editing/undo.ts): commands recorded between startCmd/endCmd, relayout, undo/redo restore the
// score (compared via the SVG of all pages), selection restore, rollback.
import { beforeAll, describe, expect, it } from 'vitest'
import { createScore, defaultNewScoreOptions, type MasterScore } from '../src/index'
import { Pid } from '../src/engraving/dom/property'
import { SegmentType } from '../src/engraving/dom/segment'
import { Sid } from '../src/engraving/style/styledef'
import { ChangeStyleValues } from '../src/engraving/editing/editstyle'
import '../src/engraving/editing/cmd'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import { VTEST, hasSubmodule, initFonts, openScore, scoreHash } from './helpers'

function firstChordRest(score: MasterScore, track = 0): EngravingItem {
    const s = score.firstMeasure()!.first(SegmentType.ChordRest)!
    return s.element(track)!
}

describe('undo stack', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
    })

    it('a new score has no undo history and is not modified', () => {
        expect(score.undoStack().canUndo()).toBe(false)
        expect(score.undoStack().canRedo()).toBe(false)
        expect(score.dirty()).toBe(false)
    })

    it('records a property change, relayouts, undoes and redoes it', () => {
        const before = scoreHash(score, false)
        const rest = firstChordRest(score)
        score.startCmd()
        rest.undoChangeProperty(Pid.VISIBLE, false)
        score.endCmd()
        expect(rest.visible()).toBe(false)
        expect(score.undoStack().canUndo()).toBe(true)
        expect(score.dirty()).toBe(true)
        const edited = scoreHash(score, false)
        expect(edited).not.toBe(before)

        score.undoRedo(true)
        expect(rest.visible()).toBe(true)
        expect(score.undoStack().canRedo()).toBe(true)
        expect(score.dirty()).toBe(false)
        expect(scoreHash(score, false)).toBe(before)

        score.undoRedo(false)
        expect(rest.visible()).toBe(false)
        expect(scoreHash(score, false)).toBe(edited)
        score.undoRedo(true)
    })

    it('an empty command is not recorded, a rollback undoes the changes', () => {
        const size = score.undoStack().size()
        score.startCmd()
        score.endCmd()
        expect(score.undoStack().size()).toBe(size)

        const rest = firstChordRest(score)
        score.startCmd()
        rest.undoChangeProperty(Pid.VISIBLE, false)
        score.endCmd(true)
        expect(rest.visible()).toBe(true)
        expect(score.undoStack().size()).toBe(size)
    })

    it('a new command removes the redo history', () => {
        const rest = firstChordRest(score)
        score.startCmd()
        rest.undoChangeProperty(Pid.VISIBLE, false)
        score.endCmd()
        score.undoRedo(true)
        expect(score.undoStack().canRedo()).toBe(true)
        score.startCmd()
        rest.undoChangeProperty(Pid.COLOR, rest.getProperty(Pid.COLOR))
        score.endCmd()
        expect(score.undoStack().canRedo()).toBe(true) // nothing changed: empty command
        score.startCmd()
        rest.undoChangeProperty(Pid.SMALL, true)
        score.endCmd()
        expect(score.undoStack().canRedo()).toBe(false)
        score.undoRedo(true)
    })

    it('restores the selection of the command on undo', () => {
        const rest = firstChordRest(score)
        score.select(rest)
        score.startCmd()
        rest.undoChangeProperty(Pid.VISIBLE, false)
        score.deselectAll()
        score.endCmd()
        expect(score.selection().isNone()).toBe(true)
        score.undoRedo(true)
        expect(score.selection().elements()).toEqual([rest])
        score.deselectAll()
    })

    it('undoes style changes', () => {
        const before = scoreHash(score)
        score.startCmd()
        score.undo(new ChangeStyleValues(score, new Map([[Sid.spatium, 30]])))
        score.endCmd()
        expect(score.style().spatium()).toBe(30)
        expect(scoreHash(score)).not.toBe(before)
        score.undoRedo(true)
        expect(score.style().spatium()).not.toBe(30)
        expect(scoreHash(score)).toBe(before)
    })
})

describe.runIf(hasSubmodule)('undo in a loaded score', () => {
    it('restores the rendering after an edit (chord stem direction)', async () => {
        const score = await openScore(`${VTEST}/beams-1.mscz`)
        const before = scoreHash(score)
        let chord: Chord | null = null
        for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s && !chord; s = s.next1(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e?.isChord()) {
                chord = e as unknown as Chord
            }
        }
        score.startCmd()
        chord!.undoChangeProperty(Pid.STEM_DIRECTION, 1 /* DirectionV::UP */)
        score.endCmd()
        score.undoRedo(true)
        expect(scoreHash(score)).toBe(before)
    })
})
