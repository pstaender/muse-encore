// SPDX-License-Identifier: GPL-3.0-only
// Linked staves and parts: MuseScore's links_tests.cpp (linked rests in the score and its parts while staves and
// parts are added and removed, undo/redo; a linked staff with a pickup measure).
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadScore, type MasterScore } from '../src/index'
import { Writer } from '../src/engraving/rw/write/writer'
import { MCursor } from '../src/engraving/dom/mcursor'
import { Excerpt } from '../src/engraving/dom/excerpt'
import { AddExcerpt, RemoveExcerpt } from '../src/engraving/editing/editexcerpt'
import { Factory } from '../src/engraving/dom/factory'
import { SegmentType } from '../src/engraving/dom/segment'
import { Text } from '../src/engraving/dom/text'
import { TDuration } from '../src/engraving/dom/durationtype'
import { Fraction } from '../src/engraving/types/fraction'
import { DurationType, ElementType, Key, TextStyleType } from '../src/engraving/types/types'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import type { Score } from '../src/engraving/dom/score'
import type { Staff } from '../src/engraving/dom/staff'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/links_data/`

const cmd = (score: Score, f: () => void): void => {
    score.startCmd(TranslatableString.untranslatable('Engraving links tests'))
    f()
    score.endCmd()
}

function addTitleText(score: Score, title: string): void {
    let measure = score.first()!
    if (!measure.isVBox()) {
        score.insertBox(ElementType.VBOX, measure)
        measure = score.first()!
    }

    const text = new Text(score.dummySystem(), TextStyleType.TITLE)
    text.setPlainText(title)
    measure.add(text)
}

/** the score of the tests: one part, a whole note (deleted: a linkless rest) */
function createTestScore(instrument: string, keyAndTimeSig: boolean, title: boolean): MasterScore {
    const c = new MCursor()
    c.setTimeSig(new Fraction(4, 4))
    c.createScore('test')
    c.addPart(instrument)
    c.move(0, new Fraction(0, 1)) // move to track 0 tick 0

    if (keyAndTimeSig) {
        c.addKeySig(Key.G)
        c.addTimeSig(new Fraction(4, 4))
    }
    c.addChord(60, new TDuration(DurationType.V_WHOLE))

    const score = c.score()
    if (title) {
        addTitleText(score, 'Title')
    }
    score.doLayout()
    return score
}

function addLinkedStaff(score: Score, oStaff: Staff, idx: number): void {
    const staff = Factory.createStaff(oStaff.part())
    staff.setPart(oStaff.part())
    score.undoInsertStaff(staff, idx, false)
    Excerpt.cloneStaff(oStaff, staff)
}

function createExcerpt(score: MasterScore, name: string): { ex: Excerpt; nscore: Score } {
    const nscore = score.createScore()
    const ex = new Excerpt(score)
    ex.setExcerptScore(nscore)
    ex.setName(name)
    ex.setParts([score.parts()[0]])
    Excerpt.createExcerpt(ex)
    score.undo(new AddExcerpt(ex))
    return { ex, nscore }
}

describe('links (MuseScore links_tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const deleteChord = (score: MasterScore): void => {
        const s = score.firstMeasure()!.first(SegmentType.ChordRest)!
        let e = s.element(0)!
        expect(e.isChord()).toBe(true)
        score.select(e)
        score.cmdDeleteSelection()
        e = s.element(0)!
        expect(e.isRest()).toBe(true)
        expect(e.links()).toBeNull()
    }

    const linkCount = (score: MasterScore, track: number): number | null => {
        const e = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(track)!
        expect(e.isRest()).toBe(true)
        return e.links()?.length ?? null
    }

    it('test3LinkedSameScore_99796', () => {
        const score = createTestScore('voice', true, false)
        deleteChord(score)

        // add a linked staff
        cmd(score, () => addLinkedStaff(score, score.staff(0)!, 1))
        expect(linkCount(score, 0)).toBe(2)

        // add a second linked staff
        cmd(score, () => addLinkedStaff(score, score.staff(0)!, 2))

        // we should have now 3 staves and 3 linked rests
        expect(score.staves().length).toBe(3)
        expect(linkCount(score, 0)).toBe(3)
        expect(linkCount(score, 4)).toBe(3)
        expect(linkCount(score, 8)).toBe(3)

        // delete staff
        cmd(score, () => score.cmdRemoveStaff(0))

        // we have now 2 staves
        expect(score.staves().length).toBe(2)
        expect(linkCount(score, 0)).toBe(2)
        expect(linkCount(score, 4)).toBe(2)

        // undo: now 3 staves
        score.undoRedo(true, null)
        expect(score.staves().length).toBe(3)
        expect(linkCount(score, 0)).toBe(3)
        expect(linkCount(score, 4)).toBe(3)
        expect(linkCount(score, 8)).toBe(3)

        // redo, back to 2 staves
        score.undoRedo(false, null)
        expect(score.staves().length).toBe(2)
        expect(linkCount(score, 0)).toBe(2)
        expect(linkCount(score, 4)).toBe(2)
    })

    it('test3LinkedParts_99796', () => {
        const score = createTestScore('voice', true, true)
        deleteChord(score)

        // create parts
        let ex: Excerpt | null = null
        cmd(score, () => {
            ex = createExcerpt(score, 'voice').ex
        })

        // add a linked staff
        cmd(score, () => addLinkedStaff(score, score.staff(0)!, 1))

        // we should have now 2 staves and 3 linked rests
        expect(score.staves().length).toBe(2)
        expect(linkCount(score, 0)).toBe(3)
        expect(linkCount(score, 4)).toBe(3)

        // delete part
        score.startCmd(TranslatableString.untranslatable('Engraving links tests'))
        score.deleteExcerpt(ex!)
        score.undo(new RemoveExcerpt(ex!))

        // we should have now 2 staves and *2* linked rests
        expect(score.staves().length).toBe(2)
        expect(linkCount(score, 0)).toBe(2)
        expect(linkCount(score, 4)).toBe(2)
        score.endCmd()
    })

    it('test5LinkedParts_94911', () => {
        const score = createTestScore('electric-guitar', false, true)
        deleteChord(score)

        // create parts
        let nscore: Score | null = null
        cmd(score, () => {
            nscore = createExcerpt(score, 'Guitar').nscore
        })

        // we should have now 1 staff and 2 linked rests
        expect(score.staves().length).toBe(1)
        expect(linkCount(score, 0)).toBe(2)

        // add a linked staff
        cmd(score, () => addLinkedStaff(score, score.staff(0)!, 1))

        // we should have now 2 staves and 3 linked rests
        expect(score.staves().length).toBe(2)
        expect(nscore!.staves().length).toBe(1)
        expect(score.staves()[0].links()!.length).toBe(3)
        expect(linkCount(score, 0)).toBe(3)
        expect(linkCount(score, 4)).toBe(3)
        expect(score.excerpts().length).toBe(1)

        // undo: we should have now 1 staves and 2 linked rests
        score.undoRedo(true, null)
        expect(score.staves().length).toBe(1)
        expect(score.staves()[0].links()!.length).toBe(2)
        expect(linkCount(score, 0)).toBe(2)
        expect(score.excerpts().length).toBe(1)

        // redo: we should have now 2 staves and 3 linked rests
        score.undoRedo(false, null)
        expect(score.staves().length).toBe(2)
        expect(score.staves()[0].links()!.length).toBe(3)
        expect(linkCount(score, 0)).toBe(3)
        expect(linkCount(score, 4)).toBe(3)
        expect(score.excerpts().length).toBe(1)
    })

    it.skipIf(!existsSync(DATA))('testPickupLinkedStaff', () => {
        const score = loadScore(readFileSync(`${DATA}testPickupLinkedStaff.mscx`))
        for (const s of score.scoreList()) {
            s.doLayout()
        }

        // Create an original staff and a clone of that staff
        const ostaff = score.staff(0)!
        const staff = ostaff.clone() as Staff
        // Set the cloned staff to same score
        staff.setScore(score)
        expect(staff.score()).toBe(score)

        cmd(score, () => {
            staff.setPart(ostaff.part())
            score.undoInsertStaff(staff, 1, /* createRests = */ false)
            Excerpt.cloneStaff(ostaff, staff)
        })

        // Check number of staves
        expect(score.staves().length).toBe(2)

        // Save Cloned staff file, and compare with reference file
        const normalize = (mscx: string): string => mscx.replace(/\n *<Style>[\s\S]*?<\/Style>/g, '')
            .split('\n')
            .filter(l => !/^\s*<(eid|programVersion|programRevision|synti|open|metaTag)\b/.test(l))
            .map(l => l.replace(/<linkedTo>.*<\/linkedTo>/, '<linkedTo/>'))
            .join('\n')
        expect(normalize(Writer.writeScore(score))).toBe(normalize(readFileSync(`${DATA}testPickupLinkedStaff-ref.mscx`, 'utf8')))
    })
})
