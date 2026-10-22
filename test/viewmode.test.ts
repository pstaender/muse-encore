// SPDX-License-Identifier: GPL-3.0-only
// View modes (NotationPainting::setViewMode): the continuous views (ScoreHorizontalViewLayout, ScoreVerticalViewLayout),
// the "fit to window" view (not in MuseScore) and the continuous panel; editing and undo in a continuous view.
import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { drawContinuousPanel, executeAction, pageCount, pageSize, redo, setViewMode, undo, viewMode, type MasterScore } from '../src/index'
import { SelectType } from '../src/engraving/dom/select'
import type { Chord } from '../src/engraving/dom/chord'
import { DEMOS, hasSubmodule, openScore, scoreHash as hashWithSelection } from './helpers'

function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

const measureCount = (score: MasterScore): number => {
    let n = 0
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        ++n
    }
    return n
}

describe.skipIf(!hasSubmodule)('view modes', () => {
    it('lays out the continuous view (horizontal) as one system on one page and back', async () => {
        const score = await openScore(`${DEMOS}/Triumph.mscz`)
        const pageView = scoreHash(score)
        const pages = pageCount(score)
        expect(pages).toBeGreaterThan(1)

        expect(setViewMode(score, 'continuous-horizontal')).toBe(true)
        expect(viewMode(score)).toBe('continuous-horizontal')
        expect(pageCount(score)).toBe(1)
        expect(score.systems().length).toBe(1)
        expect(score.systems()[0].measures().filter(m => m.isMeasure()).length).toBe(measureCount(score))
        const size = pageSize(score, 0)
        expect(size.width).toBeGreaterThan(size.height * 5)
        // the measures follow each other
        const ms = score.systems()[0].measures()
        for (let i = 1; i < ms.length; ++i) {
            expect(ms[i].x()).toBeCloseTo(ms[i - 1].x() + ms[i - 1].width(), 3)
        }

        expect(setViewMode(score, 'page')).toBe(true)
        expect(pageCount(score)).toBe(pages)
        expect(scoreHash(score)).toBe(pageView)
    })

    it('lays out the continuous view (vertical) as all systems on one page', async () => {
        const score = await openScore(`${DEMOS}/Reunion.mscz`)
        const systems = score.systems().length
        setViewMode(score, 'continuous-vertical')
        expect(pageCount(score)).toBe(1)
        expect(score.systems().filter(s => !s.vbox()).length).toBe(systems - score.systems().filter(s => s.vbox()).length)
        const size = pageSize(score, 0)
        expect(size.height).toBeGreaterThan(size.width)
        const ys = score.systems().map(s => s.y())
        expect([...ys].sort((a, b) => a - b)).toEqual(ys)
    })

    it('lays out the fit to window view for the width and without system breaks', async () => {
        const score = await openScore(`${DEMOS}/Reunion.mscz`)
        const lineBreaks = (): number => score.systems().filter(s => s.measures().length && s.measures()[s.measures().length - 1].lineBreak()).length
        setViewMode(score, 'fit-width', 20)
        expect(viewMode(score)).toBe('fit-width')
        expect(pageSize(score, 0).width).toBeCloseTo(20, 2)
        const wide = score.systems().length
        expect(setViewMode(score, 'fit-width', 20)).toBe(false) // unchanged
        setViewMode(score, 'fit-width', 5)
        expect(pageSize(score, 0).width).toBeCloseTo(5, 2)
        expect(score.systems().length).toBeGreaterThan(wide)
        // systems end with a system break only where the measures don't fit anyway
        setViewMode(score, 'fit-width', 40)
        expect(lineBreaks()).toBeLessThanOrEqual(1)
    })

    it('edits and undoes in the continuous view (horizontal)', async () => {
        const score = await openScore(`${DEMOS}/Reunion.mscz`)
        setViewMode(score, 'continuous-horizontal')
        const m = score.firstMeasure()!.nextMeasure()!
        const chord = [...m.segments()].map(s => s.element(0)).find(e => e?.isChord()) as Chord
        const edit = (): void => {
            score.select(chord.notes()[0], SelectType.SINGLE, 0)
            expect(executeAction(score, 'pitch-up-octave')).toBe(true)
        }
        // the partial layout of the continuous view keeps the skylines of the other measures (autoplace of lines
        // far away differs from a complete layout): compare with a state after an edit and its undo
        edit()
        undo(score)
        const before = scoreHash(score)
        const width = m.width()
        edit()
        const after = scoreHash(score)
        expect(after).not.toBe(before)
        expect(pageCount(score)).toBe(1)
        expect(score.systems().length).toBe(1)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
        expect(m.width()).toBeCloseTo(width, 3)
        expect(redo(score)).toBe(true)
        expect(scoreHash(score)).toBe(after)
    })

    it('draws the continuous panel once the beginning of the score is scrolled out of the view', async () => {
        const score = await openScore(`${DEMOS}/Reunion.mscz`)
        const canvas = createCanvas(300, 400)
        const ctx = canvas.getContext('2d') as never
        expect(drawContinuousPanel(score, ctx, { dpi: 50, left: 10 })).toBe(null) // page view
        setViewMode(score, 'continuous-horizontal')
        expect(drawContinuousPanel(score, ctx, { dpi: 50, left: 0 })).toBe(null) // the beginning is visible
        // the panel looks at the measure at its right edge: the first paint finds its width
        drawContinuousPanel(score, ctx, { dpi: 50, left: 20 })
        const panel = drawContinuousPanel(score, ctx, { dpi: 50, left: 20 })!
        expect(panel.width).toBeGreaterThan(0.3)
        expect(panel.width).toBeLessThan(3)
        expect(panel.painted).toBe(true)
        // unchanged contents (also a bit further in the same measure) are not painted again
        expect(drawContinuousPanel(score, ctx, { dpi: 50, left: 20.0001, shownKey: panel.key })).toMatchObject({ key: panel.key, painted: false })
        // another measure
        expect(drawContinuousPanel(score, ctx, { dpi: 50, left: 25, shownKey: panel.key })!.painted).toBe(true)
    })
})
