// SPDX-License-Identifier: GPL-3.0-only
// The edit.cpp commands (deleting, ties, flip, visibility, voices, adding rests/chords): each command is done between
// startCmd/endCmd, its result checked, then undone (the rendering must equal the one before) and redone.
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createScore, defaultNewScoreOptions, drawPageSvg, type MasterScore } from '../src/index'
import { Fraction } from '../src/engraving/types/fraction'
import { DirectionV, DurationType } from '../src/engraving/types/types'
import { Pid } from '../src/engraving/dom/property'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { TDuration } from '../src/engraving/dom/durationtype'
import { searchTieNote } from '../src/engraving/dom/utils'
import '../src/engraving/editing/edit'
import '../src/engraving/editing/cmd'
import type { Chord } from '../src/engraving/dom/chord'
import type { Note } from '../src/engraving/dom/note'
import type { Rest } from '../src/engraving/dom/rest'
import type { Measure } from '../src/engraving/dom/measure'
import { VTEST, hasSubmodule, initFonts, openScore } from './helpers'

/** a hash of the SVG of all pages like the notation view (selection colors, invisible elements) */
function selectionHash(score: MasterScore): string {
    const h = createHash('sha256')
    for (let i = 0; i < score.npages(); ++i) {
        h.update(drawPageSvg(score, i, { printing: false }))
    }
    return h.digest('hex')
}

function chords(score: MasterScore, track = 0): Chord[] {
    const res: Chord[] = []
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        const e = s.element(track)
        if (e?.isChord()) {
            res.push(e as unknown as Chord)
        }
    }
    return res
}

/**
 * the printed rendering independent of the selection (selected elements are painted last, so the SVG lines are
 * sorted)
 */
function printedHash(score: MasterScore): string {
    const h = createHash('sha256')
    for (let i = 0; i < score.npages(); ++i) {
        h.update(drawPageSvg(score, i).split('\n').sort().join('\n'))
    }
    return h.digest('hex')
}

/**
 * runs the command in a command frame, checks undo (same rendering as before) and redo (same as after the edit).
 * printing: compare the printed rendering independent of the selection (a selection that UndoMacro cannot record,
 * e.g. of a spanner segment, is not restored); visible: the edit changes the rendering
 */
function checkUndoRedo(score: MasterScore, cmd: () => void, check: () => void, printing = false, visible = true): void {
    const scoreHash = (sc: MasterScore, p: boolean): string => p ? printedHash(sc) : selectionHash(sc)
    const before = scoreHash(score, printing)
    score.startCmd()
    cmd()
    score.endCmd()
    check()
    const after = scoreHash(score, printing)
    if (visible) {
        expect(after).not.toBe(before)
    }
    score.undoRedo(true)
    expect(scoreHash(score, printing)).toBe(before)
    score.undoRedo(false)
    check()
    expect(scoreHash(score, printing)).toBe(after)
    score.undoRedo(true)
    expect(scoreHash(score, printing)).toBe(before)
}

describe('adding rests and chords (new score)', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'piano' }], measures: 4 })
    })

    it('setRests fills a voice 2 range with rests (gaps), undo removes them', () => {
        const m = score.firstMeasure()!
        let rests: Rest[] = []
        checkUndoRedo(score, () => {
            rests = score.setRests(m.tick(), 1, new Fraction(1, 2), true, null)
        }, () => {
            expect(rests.length).toBeGreaterThan(0)
            expect(rests.every(r => r.isGap())).toBe(true) // an empty voice: gap rests (not drawn)
            expect(m.findSegment(SegmentType.ChordRest, m.tick())!.element(1)?.isRest()).toBe(true)
        }, false, false)
        expect(m.findSegment(SegmentType.ChordRest, m.tick())!.element(1)).toBeNull()
    })

    it('addRest/addChord with a tie to the prototype chord', () => {
        const m = score.firstMeasure()!.nextMeasure()!
        const before = selectionHash(score)
        score.startCmd()
        // replace the measure rest by a half rest and a half note tied to the next measure's half note
        const mrest = m.findSegment(SegmentType.ChordRest, m.tick())!.element(0) as unknown as Rest
        score.removeChordRest(mrest, false)
        score.addRest(m.tick(), 0, new TDuration(DurationType.V_HALF), null)
        score.endCmd()
        expect((m.findSegment(SegmentType.ChordRest, m.tick())!.element(0) as unknown as Rest).durationType().type())
            .toBe(DurationType.V_HALF)
        score.undoRedo(true)
        expect(selectionHash(score)).toBe(before)
    })
})

describe.runIf(hasSubmodule)('editing commands on a score with notes', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${VTEST}/slurs-1.mscx`)
    })

    it('deletes a single note: the chord is replaced by a rest', () => {
        const chord = chords(score).find(c => c.notes().length === 1)!
        const seg = chord.segment()
        score.select(chord.notes()[0])
        checkUndoRedo(score, () => score.cmdDeleteSelection(), () => {
            expect(seg.element(0)?.isRest()).toBe(true)
        })
        expect(seg.element(0)).toBe(chord)
    })

    it('deletes a range: the first measure becomes rests (and its slurs are removed)', () => {
        const m = score.firstMeasure()!
        score.select(m, SelectType.SINGLE, 0)
        expect(score.selection().isRange()).toBe(true)
        const spanners = score.spannerMap().all().length
        checkUndoRedo(score, () => score.cmdDeleteSelection(), () => {
            for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                const e = s.element(0)
                expect(!e || e.isRest()).toBe(true)
            }
        })
        expect(score.spannerMap().all().length).toBe(spanners)
        score.deselectAll()
    })

    it('flips the stem of a chord', () => {
        const chord = chords(score).find(c => !c.beam())!
        const up = chord.up()
        const dir = chord.stemDirection()
        score.select(chord.notes()[0])
        checkUndoRedo(score, () => score.cmdFlip(), () => {
            expect(chord.stemDirection()).toBe(up ? DirectionV.DOWN : DirectionV.UP)
        })
        expect(chord.stemDirection()).toBe(dir)
    })

    it('flips a slur', () => {
        const slur = score.spannerMap().all().find(s => s.isSlur())!
        score.select(slur.frontSegment()!)
        checkUndoRedo(score, () => score.cmdFlip(), () => {
            expect(slur.getProperty(Pid.SLUR_DIRECTION)).not.toBe(DirectionV.AUTO)
        }, true)
        score.deselectAll()
    })

    it('makes a note invisible', () => {
        const note = chords(score)[2].notes()[0]
        checkUndoRedo(score, () => score.undoChangeVisible(note, false), () => {
            expect(note.visible()).toBe(false)
        })
        expect(note.visible()).toBe(true)
    })

    it('adds a tie to the next note of the same pitch and removes it again', () => {
        let note: Note | null = null
        for (const c of chords(score)) {
            for (const n of c.notes()) {
                if (!n.tieFor() && !n.tieBack() && searchTieNote(n)) {
                    note = n
                    break
                }
            }
            if (note) {
                break
            }
        }
        expect(note).not.toBeNull()
        if (!note) {
            return
        }
        const next = searchTieNote(note)!
        score.select(note)
        const before = selectionHash(score)
        score.cmdToggleTie() // runs its own command
        expect(note.tieFor()?.endNote()).toBe(next)
        expect(next.tieBack()).toBe(note.tieFor())
        score.undoRedo(true)
        expect(note.tieFor()).toBeNull()
        expect(selectionHash(score)).toBe(before)
        score.undoRedo(false)
        expect(note.tieFor()?.endNote()).toBe(next)

        // toggle it off again
        score.deselectAll()
        score.select(note)
        score.cmdToggleTie()
        expect(note.tieFor()).toBeNull()
        score.undoRedo(true)
        expect(note.tieFor()?.endNote()).toBe(next)
        score.undoRedo(true)
        expect(selectionHash(score)).toBe(before)
        score.deselectAll()
    })

    it('adds a tie with a new note (cmdAddTie: the next chord gets the pitch of the tied note)', () => {
        const chord = chords(score).find(c => c.notes().length === 1 && !c.notes()[0].tieFor() && c.measure() === score.firstMeasure())!
        const note = chord.notes()[0]
        score.select(note)
        const before = selectionHash(score)
        score.cmdAddTie() // runs its own command
        const tie = note.tieFor()
        expect(tie).not.toBeNull()
        expect(tie!.endNote()!.pitch()).toBe(note.pitch())
        score.undoRedo(true)
        expect(note.tieFor()).toBeNull()
        expect(selectionHash(score)).toBe(before)
        score.deselectAll()
    })

    it('deletes a slur (spanner segment)', () => {
        const slur = score.spannerMap().all().find(s => s.isSlur())!
        score.select(slur.frontSegment()!)
        checkUndoRedo(score, () => score.cmdDeleteSelection(), () => {
            expect(score.spannerMap().all().includes(slur)).toBe(false)
        }, true)
        expect(score.spannerMap().all().includes(slur)).toBe(true)
    })

    it('changes the duration of a chord (undoChangeChordRestLen)', () => {
        const chord = chords(score)[1]
        const d = chord.durationType()
        const nd = new TDuration(DurationType.V_32ND)
        checkUndoRedo(score, () => score.undoChangeChordRestLen(chord, nd), () => {
            expect(chord.durationType().equals(nd)).toBe(true)
        })
        expect(chord.durationType().equals(d)).toBe(true)
    })

    it('changes the pitch of a note (undoChangePitch)', () => {
        const note = chords(score)[3].notes()[0]
        const p = note.pitch()
        checkUndoRedo(score, () => score.undoChangePitch(note, p + 2, note.tpc1() + 2, note.tpc2() + 2), () => {
            expect(note.pitch()).toBe(p + 2)
        })
        expect(note.pitch()).toBe(p)
    })
})

describe.runIf(hasSubmodule)('voices', () => {
    it('moves a note into voice 2 (changeSelectedElementsVoice)', async () => {
        const score = await openScore(`${VTEST}/accidental-1.mscx`)
        const chord = chords(score).find(c => c.notes().length === 1 && !c.tuplet())!
        const seg = chord.segment()
        score.select(chord.notes()[0])
        checkUndoRedo(score, () => score.changeSelectedElementsVoice(1), () => {
            expect(seg.element(1)?.isChord()).toBe(true)
            expect(seg.element(0)?.isRest()).toBe(true)
        })
        expect(seg.element(0)).toBe(chord)
        score.deselectAll()
    })

    it('exchanges voices 1 and 2 of a measure', async () => {
        const score = await openScore(`${VTEST}/accidental-1.mscx`)
        const m: Measure = score.firstMeasure()!
        score.select(m, SelectType.SINGLE, 0)
        const first = m.findSegment(SegmentType.ChordRest, m.tick())!.element(0)
        checkUndoRedo(score, () => score.cmdExchangeVoice(0, 1), () => {
            expect(m.findSegment(SegmentType.ChordRest, m.tick())!.element(1)).toBe(first)
        })
        score.deselectAll()
    })
})
