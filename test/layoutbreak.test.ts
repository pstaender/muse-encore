// SPDX-License-Identifier: GPL-3.0-only
// Layout breaks: the "system-break" / "page-break" / "section-break" actions (Score::cmdToggleLayoutBreak) with undo,
// and their icons (laid out only when the app can show icons, drawn only when not printing, like spacers).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drawPageSvg, executeAction, redo, setCanLayoutIcons, undo, type MasterScore } from '../src/index'
import { SelectType } from '../src/engraving/dom/select'
import type { Measure } from '../src/engraving/dom/measure'
import { DEMOS, hasSubmodule, openScore, scoreHash as hashWithSelection } from './helpers'

/** selected items are painted last: the hash without a selection */
function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

/** the icons of the breaks are glyphs in the formatting color #C31989 (spacers are stroked paths) */
const breakIcons = (svg: string): number => (svg.match(/<g [^>]*fill="#c31989"/gi) ?? []).length

describe.skipIf(!hasSubmodule)('layout breaks', () => {
    let score: MasterScore

    beforeAll(async () => {
        setCanLayoutIcons(true)
        score = await openScore(`${DEMOS}/Reunion.mscz`)
    })

    afterAll(() => setCanLayoutIcons(false))

    function selectMeasure(m: Measure): void {
        score.select(null)
        score.select(m, SelectType.SINGLE, 0)
    }

    it('toggles a system break with the action (Enter) and shows its icon unless printing', () => {
        const m = score.firstMeasure()!.nextMeasure()!
        expect(m.lineBreak()).toBe(false)
        const systemsBefore = m.system()!.measures().length
        const before = scoreHash(score)
        const icons = breakIcons(drawPageSvg(score, 0, { printing: false }))
        expect(icons).toBeGreaterThan(0) // the breaks of the score

        selectMeasure(m)
        expect(executeAction(score, 'system-break')).toBe(true)
        expect(m.lineBreak()).toBe(true)
        expect(m.system()!.last()).toBe(m) // the system ends with the measure
        expect(m.system()!.measures().length).toBeLessThan(systemsBefore)
        score.select(null)
        expect(breakIcons(drawPageSvg(score, 0, { printing: false }))).toBe(icons + 1)
        expect(breakIcons(drawPageSvg(score, 0))).toBe(0) // not printed
        const withBreak = scoreHash(score)

        expect(undo(score)).toBe(true)
        expect(m.lineBreak()).toBe(false)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(scoreHash(score)).toBe(withBreak)

        // toggled off again
        selectMeasure(m)
        expect(executeAction(score, 'system-break')).toBe(true)
        expect(m.lineBreak()).toBe(false)
        expect(undo(score)).toBe(true)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })

    it('replaces a system break by a page break', () => {
        const m = score.firstMeasure()!.nextMeasure()!.nextMeasure()!
        const before = scoreHash(score)
        selectMeasure(m)
        expect(executeAction(score, 'system-break')).toBe(true)
        selectMeasure(m)
        expect(executeAction(score, 'page-break')).toBe(true)
        expect(m.pageBreak()).toBe(true)
        expect(m.lineBreak()).toBe(false)
        expect(undo(score)).toBe(true)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })

    it('is not available without a selection', () => {
        score.select(null)
        expect(executeAction(score, 'system-break')).toBe(false)
    })
})
