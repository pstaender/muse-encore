// SPDX-License-Identifier: GPL-3.0-only
// "Select > Similar / Similar on this staff / Similar in this range / More…" of the context menu (MuseScore's
// NotationActionController::selectAllSimilarElements*, NotationElements, SelectDialog and SelectNoteDialog).
import { beforeAll, describe, expect, it } from 'vitest'
import {
    SelectDialog, SelectNoteDialog, createSelectDialog, executeAction, isActionEnabled, layoutScore, selectAt, viewMousePress, viewMouseRelease,
    type MasterScore,
} from '../src/index'
import { DPI, ElementType } from '../src/engraving/types/types'
import { SelectType } from '../src/engraving/dom/select'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { Note } from '../src/engraving/dom/note'
import type { Rest } from '../src/engraving/dom/rest'
import { VTEST, hasSubmodule, initFonts, openScore } from './helpers'

function collect(score: MasterScore, pred: (e: EngravingItem) => boolean): EngravingItem[] {
    const res: EngravingItem[] = []
    score.scanElements(e => {
        if (pred(e)) {
            res.push(e)
        }
    })
    return res
}

const isNote = (e: EngravingItem): boolean => e.isNote() && !(e as unknown as Note).chord().isGrace()
const isGraceNote = (e: EngravingItem): boolean => e.isNote() && (e as unknown as Note).chord().isGrace()

/** the center of an element in inches from its page's top left */
function center(e: EngravingItem): { x: number; y: number } {
    const c = e.pageBoundingRect().center()
    return { x: c.x() / DPI, y: c.y() / DPI }
}

/** a right click on the element (NotationViewInputController: the hit element context of the context menu) */
function rightClick(score: MasterScore, e: EngravingItem): void {
    const page = score.pages()[0]
    const c = e.canvasBoundingRect().center()
    const x = (c.x() - page.pos().x()) / DPI
    const y = (c.y() - page.pos().y()) / DPI
    const ev = { page: 0, x, y, clientX: x * 100, clientY: y * 100, button: 2, buttons: 2, shift: false, ctrl: false, alt: false }
    viewMousePress(score, ev)
    viewMouseRelease(score, { ...ev, buttons: 0 })
}

function sameSet(a: readonly EngravingItem[], b: readonly EngravingItem[]): boolean {
    return a.length === b.length && a.every(e => b.includes(e))
}

describe.skipIf(!hasSubmodule)('select similar', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = await openScore(`${VTEST}/grace-6.mscz`)
        layoutScore(score)
    })

    it('needs a selection', () => {
        score.deselectAll()
        expect(isActionEnabled(score, 'select-similar')).toBe(false)
        expect(isActionEnabled(score, 'select-similar-staff')).toBe(false)
        expect(isActionEnabled(score, 'select-similar-range')).toBe(false)
    })

    it('selects all notes of the score (grace notes only for a grace note)', () => {
        const notes = collect(score, isNote)
        const graceNotes = collect(score, isGraceNote)
        expect(notes.length).toBeGreaterThan(0)
        expect(graceNotes.length).toBeGreaterThan(0)

        score.select(notes[0], SelectType.SINGLE, 0)
        expect(executeAction(score, 'select-similar')).toBe(true)
        expect(sameSet(score.selection().elements(), notes)).toBe(true)

        score.select(graceNotes[0], SelectType.SINGLE, 0)
        expect(executeAction(score, 'select-similar')).toBe(true)
        expect(sameSet(score.selection().elements(), graceNotes)).toBe(true)
    })

    it('selects the similar elements on the same staff', () => {
        const notes = collect(score, e => isNote(e) && e.staffIdx() === 1)
        score.select(notes[0], SelectType.SINGLE, 0)
        expect(executeAction(score, 'select-similar-staff')).toBe(true)
        expect(sameSet(score.selection().elements(), notes)).toBe(true)
    })

    it('selects the similar elements in the selected range (the last element hit)', () => {
        const notes = collect(score, e => isNote(e) && e.staffIdx() === 0)
        const first = notes[0]
        const last = notes.find(n => n.findMeasure() !== first.findMeasure())!
        const page = score.pages().indexOf(first.findAncestor(ElementType.PAGE) as never)
        let p = center(first)
        selectAt(score, Math.max(0, page), p.x, p.y, 'single')
        p = center(last)
        selectAt(score, Math.max(0, page), p.x, p.y, 'range')
        expect(score.selection().isRange()).toBe(true)

        const sel = score.selection()
        const expected = collect(score, e => isNote(e) && e.staffIdx() >= sel.staffStart() && e.staffIdx() < sel.staffEnd()
            && e.tick().ge(sel.tickStart()) && e.tick().lt(sel.tickEnd()))
        expect(executeAction(score, 'select-similar-range')).toBe(true)
        expect(score.selection().isList()).toBe(true)
        expect(sameSet(score.selection().elements(), expected)).toBe(true)
    })

    it('"More…" opens the Select notes dialog for a note: same pitch, add and subtract', () => {
        // the note filter (collectNoteMatch) does not tell grace notes apart
        const notes = collect(score, e => e.isNote())
        const note = collect(score, isNote)[0] as unknown as Note
        score.select(note, SelectType.SINGLE, 0)
        const dialog = createSelectDialog(score)
        expect(dialog).toBeInstanceOf(SelectNoteDialog)
        const d = dialog as SelectNoteDialog
        expect(d.inSelectionEnabled).toBe(false)
        expect(d.string).toBe(String(note.string() + 1))

        d.values.samePitch = true
        d.apply()
        const samePitch = notes.filter(n => (n as unknown as Note).pitch() === note.pitch())
        expect(sameSet(score.selection().elements(), samePitch)).toBe(true)

        // add the notes of the note's staff: with several selected elements the context item is the right-clicked one
        expect(createSelectDialog(score)).toBeNull()
        rightClick(score, note)
        expect(sameSet(score.selection().elements(), samePitch)).toBe(true)
        const d2 = createSelectDialog(score) as SelectNoteDialog
        expect(d2.inSelectionEnabled).toBe(samePitch.length > 1)
        d2.values.inSelection = false
        d2.values.sameStaff = true
        d2.values.action = 'add'
        d2.apply()
        const staffNotes = notes.filter(n => n.staffIdx() === note.staffIdx())
        expect(sameSet(score.selection().elements(), [...new Set([...samePitch, ...staffNotes])])).toBe(true)

        // and subtract them again
        const d3 = createSelectDialog(score) as SelectNoteDialog
        d3.values.inSelection = false
        d3.values.sameStaff = true
        d3.values.action = 'subtract'
        d3.apply()
        expect(sameSet(score.selection().elements(), samePitch.filter(n => !staffNotes.includes(n)))).toBe(true)
    })

    it('"More…" opens the Select dialog for a rest: same duration', () => {
        const rests = collect(score, e => e.isRest())
        const rest = rests[0] as unknown as Rest
        score.select(rests[0], SelectType.SINGLE, 0)
        const dialog = createSelectDialog(score)
        expect(dialog).toBeInstanceOf(SelectDialog)
        const d = dialog as SelectDialog
        expect(d.sameDurationEnabled).toBe(true)
        expect(d.type).toBe(rest.translatedTypeUserName())

        d.values.sameDuration = true
        d.apply()
        const expected = rests.filter(r => (r as unknown as Rest).actualTicks().eq(rest.actualTicks()))
        expect(sameSet(score.selection().elements(), expected)).toBe(true)
        expect(expected.length).toBeLessThanOrEqual(rests.length)
    })
})
