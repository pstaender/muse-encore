// SPDX-License-Identifier: GPL-3.0-only
// Editing a score with parts: the changes of the score reach the linked parts and the other way round (note input,
// deleting, transposing, measures, time signatures, undo/redo), like MuseScore.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { executeAction, layoutScore, loadScore, undo, redo, type MasterScore } from '../src/index'
import { Excerpt } from '../src/engraving/dom/excerpt'
import '../src/engraving/editing/editexcerpt'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { NoteVal } from '../src/engraving/dom/input'
import { Factory } from '../src/engraving/dom/factory'
import { Pid } from '../src/engraving/dom/property'
import { Fraction } from '../src/engraving/types/fraction'
import { ElementType } from '../src/engraving/types/types'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import type { Chord } from '../src/engraving/dom/chord'
import type { Score } from '../src/engraving/dom/score'
import type { TimeSig } from '../src/engraving/dom/timesig'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/parts_data/`

/** the score part-all.mscx (2 instruments) with a part for each instrument (Excerpt::createExcerptsFromParts) */
function openWithParts(): MasterScore {
    const score = loadScore(readFileSync(`${DATA}part-all.mscx`))
    layoutScore(score)
    score.startCmd(TranslatableString.untranslatable('Create parts'))
    for (const ex of Excerpt.createExcerptsFromParts(score.parts(), score)) {
        score.initAndAddExcerpt(ex, false)
    }
    score.endCmd()
    expect(score.excerpts().length).toBe(2)
    return score
}

const part = (score: MasterScore, i: number): Score => score.excerpts()[i].excerptScore()!

/** the chord/rest at the tick in the first staff of the score (track 0) */
function crAt(score: Score, tick: Fraction, track = 0) {
    const m = score.tick2measure(tick)!
    const s = m.findSegment(SegmentType.ChordRest, tick)
    return s ? s.element(track) : null
}

function cmd(score: Score, f: () => void): void {
    score.startCmd(TranslatableString.untranslatable('Linked editing tests'))
    f()
    score.endCmd()
}

/** the measure ticks of the score */
const measureTicks = (score: Score): string[] => {
    const res: string[] = []
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        res.push(`${m.tick().ticks()}:${m.ticks().ticks()}`)
    }
    return res
}

describe.skipIf(!existsSync(DATA))('linked editing between the score and its parts', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('note input in the score shows in the part, undo/redo', () => {
        const score = openWithParts()
        const p0 = part(score, 0)
        const tick = new Fraction(0, 1)
        const seg = score.firstMeasure()!.findSegment(SegmentType.ChordRest, tick)!
        cmd(score, () => score.setNoteRest(seg, 0, new NoteVal(74), new Fraction(1, 4)))
        const chord = crAt(score, tick) as Chord
        expect(chord.isChord()).toBe(true)
        expect(chord.upNote().pitch()).toBe(74)
        const partChord = crAt(p0, tick) as Chord
        expect(partChord.isChord()).toBe(true)
        expect(partChord.upNote().pitch()).toBe(74)
        expect(partChord.isLinked(chord)).toBe(true)

        expect(undo(score)).toBe(true)
        expect((crAt(p0, tick) as Chord).upNote()?.pitch()).not.toBe(74)
        expect(redo(score)).toBe(true)
        expect((crAt(p0, tick) as Chord).upNote().pitch()).toBe(74)
    })

    it('note input in a part shows in the score', () => {
        const score = openWithParts()
        const p1 = part(score, 1)
        const tick = new Fraction(0, 1)
        const seg = p1.firstMeasure()!.findSegment(SegmentType.ChordRest, tick)!
        cmd(p1, () => p1.setNoteRest(seg, 0, new NoteVal(55), new Fraction(1, 2)))
        // the part's staff 0 is the second staff of the score
        const scoreChord = crAt(score, tick, 4) as Chord
        expect(scoreChord.isChord()).toBe(true)
        expect(scoreChord.upNote().pitch()).toBe(55)
        expect(scoreChord.ticks().eq(new Fraction(1, 2))).toBe(true)
        // the first instrument's part does not get it
        expect(crAt(part(score, 0), tick, 4)).toBeNull()
    })

    it('deleting and transposing a note in the score changes the part', () => {
        const score = openWithParts()
        const p0 = part(score, 0)
        const m = score.firstMeasure()!
        let chord: Chord | null = null
        for (let s = m.first(SegmentType.ChordRest); s && !chord; s = s.next(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e && e.isChord()) {
                chord = e as Chord
            }
        }
        expect(chord).toBeTruthy()
        const tick = chord!.tick()
        const pitch = chord!.upNote().pitch()

        score.select(chord!.upNote(), SelectType.SINGLE)
        expect(executeAction(score, 'pitch-up')).toBe(true)
        expect((crAt(p0, tick) as Chord).upNote().pitch()).toBe(pitch + 1)

        score.select(crAt(score, tick)!, SelectType.SINGLE)
        expect(executeAction(score, 'action://notation/delete')).toBe(true)
        expect(crAt(score, tick)!.isRest()).toBe(true)
        expect(crAt(p0, tick)!.isRest()).toBe(true)

        expect(undo(score)).toBe(true)
        expect((crAt(p0, tick) as Chord).upNote().pitch()).toBe(pitch + 1)
        expect(undo(score)).toBe(true)
        expect((crAt(p0, tick) as Chord).upNote().pitch()).toBe(pitch)
    })

    it('inserting and deleting measures changes all parts', () => {
        const score = openWithParts()
        const before = measureTicks(part(score, 0))
        score.select(score.firstMeasure()!.nextMeasure()!, SelectType.SINGLE)
        expect(executeAction(score, 'insert-measure')).toBe(true)
        for (const s of score.scoreList()) {
            expect(measureTicks(s).length).toBe(before.length + 1)
        }

        score.deselectAll()
        score.select(score.firstMeasure()!, SelectType.RANGE, 0)
        expect(executeAction(score, 'time-delete')).toBe(true)
        for (const s of score.scoreList()) {
            expect(measureTicks(s)).toEqual(before)
        }

        undo(score)
        undo(score)
        for (const s of score.scoreList()) {
            expect(measureTicks(s)).toEqual(before)
        }
    })

    it('a time signature change in the score rewrites the measures of the parts', () => {
        const score = openWithParts()
        const p1 = part(score, 1)
        const fm = score.firstMeasure()!.nextMeasure()!
        const ts = Factory.createItem(ElementType.TIMESIG, score.dummySystem()) as TimeSig
        ts.setSig(new Fraction(3, 4))
        cmd(score, () => score.cmdAddTimeSig(fm, 0, ts, false))
        const pm = p1.tick2measure(fm.tick())!
        expect(pm.timesig().eq(new Fraction(3, 4))).toBe(true)
        expect(pm.ticks().eq(new Fraction(3, 4))).toBe(true)
        const pts = pm.findSegment(SegmentType.TimeSig, pm.tick())?.element(0) as TimeSig | null
        expect(pts && pts.isTimeSig()).toBe(true)
        // the part's time signature is linked to the score's (of the second staff)
        // (rewriteMeasures replaced the measures)
        const nfm = score.tick2measure(fm.tick())!
        const masterTs = nfm.findSegment(SegmentType.TimeSig, nfm.tick())!.element(p1.staff(0)!.findLinkedInScore(score)!.idx() * 4)
        expect(pts!.isLinked(masterTs)).toBe(true)
        expect(measureTicks(p1)).toEqual(measureTicks(score))

        undo(score)
        expect(p1.tick2measure(fm.tick())!.timesig().eq(new Fraction(4, 4))).toBe(true)
    })

    it('a position changed in a part unlinks it from the score (property propagation)', () => {
        const score = openWithParts()
        const p0 = part(score, 0)
        let chord: Chord | null = null
        for (let s = p0.firstMeasure()!.first(SegmentType.ChordRest); s && !chord; s = s.next1(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e && e.isChord()) {
                chord = e as Chord
            }
        }
        const note = chord!.upNote()
        const masterNote = note.findLinkedInScore(score)!
        cmd(p0, () => note.undoChangeProperty(Pid.VISIBLE, false))
        expect(note.visible()).toBe(false)
        // edited in a part: the appearance is unlinked from the score, the score's note stays visible
        expect(masterNote.visible()).toBe(true)
        expect(note.isAppearanceLinkedToMaster()).toBe(false)
        undo(score)
        expect(note.visible()).toBe(true)
        expect(note.isAppearanceLinkedToMaster()).toBe(true)
    })
})

