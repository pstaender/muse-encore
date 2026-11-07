// SPDX-License-Identifier: GPL-3.0-only
// The view following the playback and the playalong (not in MuseScore, shared/pageturn.ts): the page is turned early.
import { describe, expect, test } from 'vitest'
import { layoutScore, nextPlayedMeasureTicks, notationPlayback } from '../src/index'
import { VTEST, hasSubmodule, openScore } from './helpers'
import { followsInReadingOrder, pageTurnDelta, type ContentBox } from '../shared/pageturn'
import { isJump, jumpIndex, JUMP_PREVIEW_BARS } from '../shared/jumppreview'

const box = (left: number, top: number, width: number, height: number): ContentBox =>
    ({ left, top, right: left + width, bottom: top + height })

describe('page view, the page fits the width', () => {
    // pages side by side: 800 wide, 40 apart; the view shows the first page (1000 x 1200)
    const page1 = box(0, 0, 800, 1100)
    const page2 = box(840, 0, 800, 1100)
    const view = box(-100, -50, 1000, 1200)

    test('stays while the bars are on the page shown, also when the next bar is on the next page', () => {
        expect(pageTurnDelta({ mode: 'page', view, page: page1, current: box(600, 900, 150, 100), ahead: [box(870, 40, 150, 100)], margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
    })

    test('the next page is centered when the current bar is on it', () => {
        const d = pageTurnDelta({ mode: 'page', view, page: page2, current: box(870, 40, 150, 100), ahead: [box(1020, 40, 150, 100)], margin: 10 })
        // the page's middle (1240) in the view's middle (400)
        expect(d).toEqual({ dx: 840, dy: 0 })
    })

    test('the page partly shown is centered when the next bar on it is cut off', () => {
        // the view shows the end of page 1 and the start of page 2
        const v = box(400, -50, 1000, 1200)
        expect(pageTurnDelta({ mode: 'page', view: v, page: page2, current: box(870, 40, 150, 100), ahead: [box(1020, 40, 150, 100)], margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
        expect(pageTurnDelta({ mode: 'page', view: v, page: page2, current: box(1200, 40, 150, 100), ahead: [box(1350, 40, 150, 100)], margin: 10 }))
            .toEqual({ dx: 340, dy: 0 })
    })

    test('vertically: the system of the current bar goes to the top when the next bar is cut off', () => {
        const tall = box(0, 0, 800, 2000)
        const d = pageTurnDelta({ mode: 'page', view: box(-100, 0, 1000, 1000), page: tall, current: box(600, 850, 150, 100), ahead: [box(40, 1000, 150, 100)], margin: 10 })
        expect(d).toEqual({ dx: 0, dy: 840 })
    })

    test('vertically not beyond the end of the page', () => {
        const tall = box(0, 0, 800, 1500)
        const d = pageTurnDelta({ mode: 'page', view: box(-100, 0, 1000, 1000), page: tall, current: box(600, 850, 150, 100), ahead: [box(40, 1000, 150, 100)], margin: 10 })
        // the bottom of the page (1500 + margin) at the bottom of the view
        expect(d).toEqual({ dx: 0, dy: 510 })
    })
})

describe('page view, the page is wider than the view', () => {
    const page = box(0, 0, 2000, 800)
    const view = box(0, 0, 1000, 1000)

    test('stays while the next bar is visible', () => {
        expect(pageTurnDelta({ mode: 'page', view, page, current: box(500, 100, 200, 100), ahead: [box(700, 100, 200, 100)], margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
    })

    test('aligned to the right when the next bar is cut off and the current bar stays visible', () => {
        const d = pageTurnDelta({ mode: 'page', view: box(800, 0, 1000, 1000), page, current: box(1500, 100, 200, 100), ahead: [box(1700, 100, 200, 100)], margin: 10 })
        expect(d).toEqual({ dx: 200, dy: 0 })
    })

    test('else the current bar goes to the left of the view (repeated until the end of the page)', () => {
        const d = pageTurnDelta({ mode: 'page', view, page, current: box(800, 100, 200, 100), ahead: [box(1000, 100, 200, 100)], margin: 10 })
        expect(d).toEqual({ dx: 790, dy: 0 })
    })

    test('the next system: its first bar goes to the left', () => {
        const d = pageTurnDelta({ mode: 'page', view: box(1000, 0, 1000, 1000), page, current: box(20, 300, 200, 100), ahead: [box(220, 300, 200, 100)], margin: 10 })
        expect(d).toEqual({ dx: -990, dy: 0 })
    })
})

describe('bars ahead', () => {
    const page = box(0, 0, 20000, 600)
    const view = box(0, 0, 1000, 600)

    test('none: the view moves only when the current bar is cut off', () => {
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(700, 100, 300, 400), margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(900, 100, 300, 400), margin: 10 }))
            .toEqual({ dx: 890, dy: 0 })
    })

    test('two: moves when the second bar ahead is cut off', () => {
        const ahead = [box(400, 100, 300, 400), box(700, 100, 350, 400)]
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(100, 100, 300, 400), ahead, margin: 10 }))
            .toEqual({ dx: 90, dy: 0 })
    })

    test('a bar that does not fit with the current one is not waited for', () => {
        // the current bar and the two after it are wider than the view: only the next one counts
        const ahead = [box(400, 100, 300, 400), box(700, 100, 500, 400)]
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(100, 100, 300, 400), ahead, margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
    })
})

describe('continuous views', () => {
    const page = box(0, 0, 20000, 600)

    test('horizontal: the current bar goes to the left when the next one is cut off; never vertically', () => {
        const view = box(100, 300, 1000, 500)
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(500, 100, 300, 400), ahead: [box(800, 100, 300, 400)], margin: 10 }))
            .toEqual({ dx: 0, dy: 0 })
        expect(pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(1000, 100, 300, 400), ahead: [box(1300, 100, 300, 400)], margin: 10 }))
            .toEqual({ dx: 890, dy: 0 })
    })

    test('horizontal: the practice context is shown at the left when it fits', () => {
        const view = box(100, 0, 1000, 600)
        const d = pageTurnDelta({ mode: 'continuous-horizontal', view, page, current: box(1000, 100, 300, 400), context: box(700, 100, 600, 400), ahead: [box(1300, 100, 300, 400)], margin: 10 })
        expect(d).toEqual({ dx: 590, dy: 0 })
    })

    test('vertical: the current system goes to the top when the next bar is cut off', () => {
        const tall = box(0, 0, 800, 20000)
        const d = pageTurnDelta({ mode: 'continuous-vertical', view: box(0, 0, 1000, 1000), page: tall, current: box(600, 800, 150, 150), ahead: [box(20, 960, 150, 150)], margin: 10 })
        expect(d).toEqual({ dx: 0, dy: 790 })
    })
})

test('reading order', () => {
    const r = (page: number, x: number, y: number) => ({ page, x, y, width: 1, height: 1 })
    expect(followsInReadingOrder(r(0, 5, 2), r(0, 6, 2))).toBe(true)
    expect(followsInReadingOrder(r(0, 5, 2), r(0, 1, 4))).toBe(true)
    expect(followsInReadingOrder(r(0, 5, 2), r(1, 1, 1))).toBe(true)
    // a repeat back
    expect(followsInReadingOrder(r(0, 5, 4), r(0, 1, 2))).toBe(false)
    expect(followsInReadingOrder(r(1, 5, 4), r(0, 1, 2))).toBe(false)
})

describe.skipIf(!hasSubmodule)('the bars played next (nextPlayedMeasureTicks)', () => {
    test('follows the played order with repeats', async () => {
        const score = await openScore(`${VTEST}/changes-inside-repeats.mscz`)
        layoutScore(score)
        const playback = notationPlayback(score)
        // the measures in the played order: [played start tick, raw tick]
        const played: [number, number][] = []
        for (const rs of score.repeatList(playback.playRepeats)) {
            for (const m of rs.measureList()) {
                played.push([m.tick().ticks() + rs.utick - rs.tick, m.tick().ticks()])
            }
        }
        expect(played.length).toBeGreaterThan(new Set(played.map(p => p[1])).size) // a measure is played twice
        played.forEach(([utick], i) => {
            const sec = playback.playedTickToSec(utick + 10)
            expect(nextPlayedMeasureTicks(score, sec, 3)).toEqual(played.slice(i + 1, i + 4).map(p => p[1]))
        })
    })
})

test('a jump: the next bar is not the following bar of the score (shared/jumppreview.ts)', () => {
    const r = (page: number, x: number, width: number) => ({ page, x, y: 1, width, height: 2 })
    expect(isJump(r(0, 5, 2), r(0, 7, 2))).toBe(false)
    expect(isJump(r(0, 5, 2), r(0, 1, 2))).toBe(true) // a repeat back
    expect(isJump(r(0, 5, 2), r(0, 20, 2))).toBe(true) // to the coda
    expect(isJump(r(0, 5, 2), r(1, 7, 2))).toBe(true)
})

test('the first jump at most JUMP_PREVIEW_BARS bars ahead (jumpIndex)', () => {
    const r = (x: number) => ({ page: 0, x, y: 1, width: 2, height: 2 })
    // bars at 0, 2, 4, ...: a jump back to 0 after the bar at x
    const played = (n: number) => [...Array.from({ length: n + 1 }, (_, i) => r(i * 2)), r(0)]
    expect(jumpIndex([r(0), r(2), r(4)])).toBe(-1)
    expect(jumpIndex(played(0))).toBe(0)
    expect(jumpIndex(played(JUMP_PREVIEW_BARS))).toBe(JUMP_PREVIEW_BARS)
    expect(jumpIndex(played(JUMP_PREVIEW_BARS + 1))).toBe(-1)
})
