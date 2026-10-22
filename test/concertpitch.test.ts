// SPDX-License-Identifier: GPL-3.0-only
// Concert pitch (Score::cmdConcertPitchChanged, NotationActionController::toggleConcertPitch): MuseScore's keysig test
// (engraving/tests/keysig_tests.cpp concertPitch with its reference files, compared by the staves of writeMscx), chord
// symbols of transposing instruments, and undo/redo of the action (the SVG of all pages).
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { layoutScore, loadScore, redo, undo, writeMscx, type MasterScore } from '../src/index'
import { NotationInteraction } from '../src/notation/internal/notationinteraction'
import { NotationActionController } from '../src/notationscene/notationactioncontroller'
import { Sid } from '../src/engraving/style/styledef'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Harmony } from '../src/engraving/dom/harmony'
import { ROOT, initFonts, scoreHash } from './helpers'

const TESTS = `${ROOT}MuseScore/src/engraving/tests/`
const hasData = existsSync(TESTS)

function open(path: string): MasterScore {
    const score = loadScore(readFileSync(`${TESTS}${path}`))
    layoutScore(score)
    return score
}

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links */
function staves(mscx: string): string {
    const score = mscx.substring(mscx.indexOf('<Score>'))
    return [...score.matchAll(/\n {4}<Staff id="\d+">[\s\S]*?\n {4}<\/Staff>/g)].map(m => m[0]).join('\n')
        .split('\n').filter(l => !/<eid>|<linkedMain|<linked>/.test(l)).join('\n')
}

function concertPitchChanged(score: MasterScore, flag: boolean): void {
    score.startCmd()
    score.cmdConcertPitchChanged(flag)
    score.endCmd()
}

function harmonies(score: MasterScore): string[] {
    const result: string[] = []
    for (let s = score.firstSegment(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        for (const e of s.annotations()) {
            if (e.isHarmony()) {
                result.push((e as unknown as Harmony).harmonyName())
            }
        }
    }
    return result
}

describe.skipIf(!hasData)('concert pitch', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('transposes the key signatures (keysig_tests.cpp concertPitch)', () => {
        const score = open('keysig_data/concert-pitch.mscx')

        concertPitchChanged(score, true)
        expect(score.style().styleB(Sid.concertPitch)).toBe(true)
        expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${TESTS}keysig_data/concert-pitch-01-ref.mscx`, 'utf8')))

        concertPitchChanged(score, false)
        expect(score.style().styleB(Sid.concertPitch)).toBe(false)
        expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${TESTS}keysig_data/concert-pitch-02-ref.mscx`, 'utf8')))
    })

    it('transposes the chord symbols of transposing instruments', () => {
        const score = open('chordsymbol_data/no-system.mscx')
        const written = harmonies(score)
        expect(written.length).toBeGreaterThan(0)

        concertPitchChanged(score, !score.style().styleB(Sid.concertPitch))
        const toggled = harmonies(score)
        expect(toggled).not.toEqual(written)

        concertPitchChanged(score, !score.style().styleB(Sid.concertPitch))
        expect(harmonies(score)).toEqual(written)
    })

    it('is toggled by the concert-pitch action, with undo and redo', () => {
        const score = open('keysig_data/concert-pitch.mscx')
        const controller = new NotationActionController(new NotationInteraction(score))
        expect(NotationActionController.isCheckableAction('concert-pitch')).toBe(true)
        expect(controller.isActionChecked('concert-pitch')).toBe(false)
        const before = scoreHash(score)

        expect(controller.dispatch('concert-pitch')).toBe(true)
        expect(controller.isActionChecked('concert-pitch')).toBe(true)
        const after = scoreHash(score)
        expect(after).not.toBe(before)

        expect(undo(score)).toBe(true)
        expect(score.style().styleB(Sid.concertPitch)).toBe(false)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(score.style().styleB(Sid.concertPitch)).toBe(true)
        expect(scoreHash(score)).toBe(after)
    })
})
