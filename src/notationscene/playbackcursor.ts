/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/playbackcursor.h/.cpp: the vertical line on the score at the
 * playback position (canvas coordinates). Painting is done by the view (the color is the configuration's
 * playbackCursorColor).
 */

import { RectF } from '../framework/draw/types/geometry'
import type { Score } from '../engraving/dom/score'
import { SegmentType, type Segment } from '../engraving/dom/segment'
import { Fraction } from '../engraving/types/fraction'

export class PlaybackCursor {
    private m_visible = false
    private m_rect = new RectF()

    constructor(private m_score: Score | null = null) {}

    setScore(score: Score | null): void { this.m_score = score }

    move(tick: number): void {
        this.m_rect = this.resolveCursorRectByTick(tick)
    }

    //! NOTE Copied from ScoreView::moveCursor(const Fraction& tick)
    resolveCursorRectByTick(_tick: number): RectF {
        const score = this.m_score
        if (!score) {
            return new RectF()
        }

        const tick = Fraction.fromTicks(_tick)

        const measure = score.tick2measureMM(tick)
        if (!measure) {
            return new RectF()
        }

        const system = measure.system()
        if (!system || !system.page() || !system.staves().length) {
            return new RectF()
        }

        let x = 0.0
        let s: Segment | null = null
        for (s = measure.first(SegmentType.ChordRest); s;) {
            const t1 = s.tick()
            const x1 = Math.trunc(s.canvasPos().x())
            let x2 = 0.0
            let t2: Fraction

            let ns = s.next(SegmentType.ChordRest)
            while (ns && !ns.visible()) {
                ns = ns.next(SegmentType.ChordRest)
            }

            if (ns) {
                t2 = ns.tick()
                x2 = ns.canvasPos().x()
            } else {
                t2 = measure.endTick()
                // measure->width is not good enough because of courtesy keysig, timesig
                const seg = measure.findSegment(SegmentType.EndBarLine, measure.endTick())
                if (seg) {
                    x2 = seg.canvasPos().x()
                } else {
                    x2 = measure.canvasPos().x() + measure.width() // safety, should not happen
                }
            }

            if (tick.ge(t1) && tick.lt(t2)) {
                const dt = t2.minus(t1)
                const dx = x2 - x1
                x = x1 + dx * tick.minus(t1).ticks() / dt.ticks()
                break
            }
            s = ns
        }

        if (!s) {
            return new RectF()
        }

        const _spatium = score.style().spatium()

        x -= _spatium

        const y = system.staffCanvasYpage(0) - 3 * _spatium
        const w = 0.4 * _spatium
        //
        // set cursor height for whole system
        //
        let y2 = 0.0

        for (let i = 0; i < score.nstaves(); ++i) {
            const ss = system.staff(i)
            if (!ss || !ss.show() || !score.staff(i)!.show()) {
                continue
            }
            y2 = ss.bbox().bottom()
        }

        const h = y2 + 6 * _spatium

        return new RectF(x, y, w, h)
    }

    visible(): boolean { return this.m_visible }
    setVisible(arg: boolean): void { this.m_visible = arg }
    rect(): RectF { return this.m_rect }
}
