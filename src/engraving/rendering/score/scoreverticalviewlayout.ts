/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/scoreverticalviewlayout.h/.cpp: the continuous (vertical) view,
 * all systems on one page whose height grows with the systems (PageLayout::collectPage doesn't break pages in SYSTEM mode)
 */

import { Fraction } from '../../types/fraction'
import { nidx } from '../../types/types'
import type { Score } from '../../dom/score'
import type { MeasureBase } from '../../dom/measurebase'
import type { Measure } from '../../dom/measure'
import type { LayoutContext } from './layoutcontext'
import { PassLayoutIndependentItems, PassResetLayoutData } from './passes'
import { MeasureLayout } from './measurelayout'
import { SystemLayout } from './systemlayout'
import { PageLayout } from './pagelayout'

export class ScoreVerticalViewLayout {
    static layoutVerticalView(score: Score, ctx: LayoutContext, stick: Fraction, etick: Fraction): void {
        const state = ctx.mutState()
        state.setEndTick(etick)

        //---------------------------------------------------
        //    initialize layout context lc
        //---------------------------------------------------

        let m: MeasureBase = score.tick2measure(stick) ?? score.first()!
        // start layout one measure earlier to handle clefs and cautionary elements
        if (m.prevMeasureMM()) {
            m = m.prevMeasureMM()!
        } else if (m.prev()) {
            m = m.prev()!
        }
        while (!m.isMeasure() && m.prev()) {
            m = m.prev()!
        }

        // if the first measure of the score is part of a multi measure rest
        // m->system() will return a nullptr. We need to find the multi measure
        // rest which replaces the measure range
        if (!m.system() && m.isMeasure() && (m as Measure).hasMMRest()) {
            m = (m as Measure).mmRest()!
        }

        if (!state.isLayoutAll() && m.system()) {
            const system = m.system()!
            const systemIndex = score.systems().indexOf(system)
            state.setPage(system.page())
            state.setPageIdx(score.pageIdx(state.page()!))
            if (state.pageIdx() === nidx) {
                state.setPageIdx(0)
            }
            state.setCurSystem(system)
            state.setSystemList(score.systems().slice(systemIndex))

            if (systemIndex === 0) {
                state.setNextMeasure(ctx.conf().isShowVBox() ? score.first() : score.firstMeasure())
            } else {
                const prevSystem = score.systems()[systemIndex - 1]
                state.setNextMeasure(prevSystem.measures()[prevSystem.measures().length - 1].next())
            }

            score.systems().splice(systemIndex)
            if (!state.nextMeasure()!.prevMeasure()) {
                state.setMeasureNo(0)
                state.setTick(new Fraction(0, 1))
            } else {
                let mb: MeasureBase | null = state.nextMeasure()!.prev()
                if (mb) {
                    mb = mb.mbWithPrecedingSectionBreak()
                }

                const layoutBreak = mb!.sectionBreakElement()
                // TODO: also use mb in else clause here?
                // probably not, only actual measures have meaningful numbers
                if (layoutBreak && layoutBreak.startWithMeasureOne()) {
                    state.setMeasureNo(0)
                } else {
                    const prevMeasure = state.nextMeasure()!.prevMeasure()!
                    state.setMeasureNo(prevMeasure.no() // will be adjusted later with respect
                        + (prevMeasure.irregular() ? 0 : 1)) // to the user-defined offset.
                }
                state.setTick(state.nextMeasure()!.tick())
            }
        } else {
            // TODO(port): moving the selection of system brackets to their BracketItems (like ScorePageViewLayout)
            for (const s of score.systems()) {
                s.resetExplicitParent()
            }
            for (let mb = score.first(); mb; mb = mb.next()) {
                mb.resetExplicitParent()
                if (mb.isMeasure() && (mb as Measure).mmRest()) {
                    (mb as Measure).mmRest()!.moveToDummy()
                }
            }
            for (const s of score.systems()) {
                s.destroy() // C++ muse::DeleteAll(score->systems())
            }
            score.setSystems([])
            score.setPages([])

            state.setNextMeasure(ctx.conf().isShowVBox() ? score.first() : score.firstMeasure())
        }

        state.setPrevMeasure(null)

        new PassResetLayoutData().run(score, ctx)

        MeasureLayout.getNextMeasure(ctx)
        state.setCurSystem(SystemLayout.collectSystem(ctx))

        if (state.isLayoutAll()) {
            new PassLayoutIndependentItems().run(score, ctx)
        }

        ScoreVerticalViewLayout.doLayout(ctx)
    }

    private static doLayout(ctx: LayoutContext): void {
        const state = ctx.mutState()
        let lmb: MeasureBase | null = null
        do {
            PageLayout.getNextPage(ctx)
            PageLayout.collectPage(ctx)

            if (state.page() && state.page()!.systems().length) {
                const sys = state.page()!.systems()[state.page()!.systems().length - 1]
                lmb = sys.measures()[sys.measures().length - 1]
            } else {
                lmb = null
            }

            // we can stop collecting pages when:
            // 1) we reach the end of score (curSystem is nullptr)
            // or
            // 2) we have fully processed the range and reached a point of stability:
            //    a) we have completed layout for the range (rangeDone is true)
            //    b) we haven't collected a system that will need to go on the next page
            //    c) this page ends with the same measure as the previous layout
            //    pageOldMeasure will be last measure from previous layout if range was completed on or before this page
            //    it will be nullptr if this page was never laid out or if we collected a system for next page
        } while (state.curSystem() && !(state.rangeDone() && lmb === state.pageOldMeasure()))

        if (!state.curSystem()) {
            // The end of the score. The remaining systems are not needed...
            for (const s of state.systemList()) {
                s.destroy() // C++ muse::DeleteAll(state.systemList())
            }
            state.setSystemList([])
            // ...and the remaining pages too
            while (ctx.dom().npages() > state.pageIdx()) {
                ctx.mutDom().pages().pop()
            }
        }
        ctx.mutDom().systems().push(...state.systemList())
    }
}
