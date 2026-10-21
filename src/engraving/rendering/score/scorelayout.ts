/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/scorelayout.h/.cpp and scorepageviewlayout.h/.cpp
 *
 * TODO(port): horizontal (LINE) and vertical (SYSTEM) view layouts
 */

import { Fraction } from '../../types/fraction'
import { nidx } from '../../types/types'
import { LayoutMode, type Score } from '../../dom/score'
import type { MeasureBase } from '../../dom/measurebase'
import type { Measure } from '../../dom/measure'
import { LayoutContext } from './layoutcontext'
import { PassResetLayoutData } from './passes'
import { MeasureLayout } from './measurelayout'
import { SystemLayout } from './systemlayout'
import { PageLayout } from './pagelayout'
import { HeaderFooterLayout } from './headerfooterlayout'
import { TLayout } from './tlayout'

export class ScoreLayout {
    static layoutRange(score: Score, st: Fraction, et: Fraction): void {
        const ctx = new LayoutContext(score)
        let stick = st
        let etick = et

        if (!score.last() || (ctx.conf().isLinearMode() && !score.firstMeasure())) {
            // empty score
            score.setSystems([])
            score.setPages([])
            PageLayout.getNextPage(ctx)
            return
        }

        const isLayoutAll = stick.le(new Fraction(0, 1)) && (etick.lt(new Fraction(0, 1)) || etick.eq(Fraction.max()))
        if (stick.lt(new Fraction(0, 1))) {
            stick = new Fraction(0, 1)
        }
        if (etick.lt(new Fraction(0, 1)) || etick.eq(Fraction.max())) {
            etick = score.last()!.endTick()
        }
        ctx.mutState().setIsLayoutAll(isLayoutAll)

        switch (ctx.conf().viewMode()) {
        case LayoutMode.PAGE:
        case LayoutMode.FLOAT:
            ScorePageViewLayout.layoutPageView(score, ctx, stick, etick)
            break
        default:
            // TODO(port): ScoreHorizontalViewLayout / ScoreVerticalViewLayout
            ScorePageViewLayout.layoutPageView(score, ctx, stick, etick)
            break
        }

        // C++ ~LayoutContext()
        for (const s of ctx.state().processedSpanners()) {
            TLayout.layoutSystemsDone(s)
        }
    }

    /** convenience: layout the whole score */
    static layoutAll(score: Score): void {
        ScoreLayout.layoutRange(score, new Fraction(0, 1), new Fraction(-1, 1))
    }
}

export class ScorePageViewLayout {
    static layoutPageView(score: Score, ctx: LayoutContext, stick: Fraction, etick: Fraction): void {
        ScorePageViewLayout.initLayoutContext(score, ctx, stick, etick)
        ScorePageViewLayout.prepareScore(score, ctx)

        new PassResetLayoutData().run(score, ctx)
        // PassLayoutIndependentItems only runs with MUE_ENABLE_ENGRAVING_LD_PASSES, which is off in release builds

        ScorePageViewLayout.doLayout(ctx)
        ScorePageViewLayout.layoutFinished(score, ctx)
    }

    static layoutHeadersFooters(ctx: LayoutContext): void {
        ScorePageViewLayout.doLayoutHeadersFooters(ctx)
    }

    private static initLayoutContext(score: Score, ctx: LayoutContext, stick: Fraction, etick: Fraction): void {
        const state = ctx.mutState()
        state.setEndTick(etick)

        let m: MeasureBase | null = score.tick2measure(stick)
        if (!m) {
            m = score.first()
        }
        // start layout one measure earlier to handle clefs and cautionary elements
        if (m!.prevMeasureMM()) {
            m = m!.prevMeasureMM()
        } else if (m!.prev()) {
            m = m!.prev()
        }
        while (!m!.isMeasure() && m!.prev()) {
            m = m!.prev()
        }
        // if the first measure of the score is part of a multi measure rest
        // m->system() will return a nullptr. We need to find the multi measure
        // rest which replaces the measure range
        if (!m!.system() && m!.isMeasure() && (m as Measure).hasMMRest()) {
            m = (m as Measure).mmRest()
        }

        if (!state.isLayoutAll() && m!.system()) {
            const system = m!.system()!
            const systemIndex = score.systems().indexOf(system)

            // set current system
            state.setStartTick(system.measures()[0].tick())
            state.setCurSystem(system)
            state.setSystemList(score.systems().slice(systemIndex))

            // set current page
            state.setPage(system.page())
            let pageIdx = score.pageIdx(state.page()!)
            if (pageIdx === nidx) {
                pageIdx = 0
            }
            state.setPageIdx(pageIdx)

            let nextMeasure: MeasureBase | null
            if (systemIndex === 0) {
                nextMeasure = ctx.conf().isShowVBox() ? score.first() : score.firstMeasure()
            } else {
                const prevSystem = score.systems()[systemIndex - 1]
                nextMeasure = prevSystem.measures()[prevSystem.measures().length - 1].next()
            }
            state.setNextMeasure(nextMeasure)

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
                state.setTick(ctx.state().nextMeasure()!.tick())
            }
        } else {
            state.setNextMeasure(ctx.conf().isShowVBox() ? score.first() : score.firstMeasure())
        }
        state.setPrevMeasure(null)
    }

    private static prepareScore(score: Score, ctx: LayoutContext): void {
        if (!ctx.state().isLayoutAll() && ctx.state().curSystem()) {
            const systemIndex = score.systems().indexOf(ctx.state().curSystem()!)
            score.systems().splice(systemIndex)
        } else {
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
        }
    }

    private static doLayout(ctx: LayoutContext): void {
        const state = ctx.mutState()
        MeasureLayout.getNextMeasure(ctx)
        state.setCurSystem(SystemLayout.collectSystem(ctx))

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
            // pageOldMeasure will be last measure from previous layout if range was completed on or before this page
            // it will be nullptr if this page was never laid out or if we collected a system for next page
        } while (state.curSystem() && !(state.rangeDone() && lmb === state.pageOldMeasure()))
    }

    private static layoutFinished(score: Score, ctx: LayoutContext): void {
        const state = ctx.mutState()
        if (!state.curSystem()) {
            // The end of the score. The remaining systems are not needed...
            for (const s of state.systemList()) {
                s.destroy() // C++ muse::DeleteAll(state.systemList())
            }
            state.setSystemList([])
            // ...and the remaining pages too
            while (score.npages() > state.pageIdx()) {
                score.pages().pop()
            }
        }
        score.systems().push(...state.systemList())

        // If the headers/footers involve page count, we need to re-calculate them. This needs to
        // be done after laying out all pages, so that the total number of pages will be known:
        if (state.mustRecomputeHeadersFooters()) {
            ScorePageViewLayout.doLayoutHeadersFooters(ctx)
            state.setMustRecomputeHeadersFooters(false)
        }
    }

    private static doLayoutHeadersFooters(ctx: LayoutContext): void {
        for (const page of ctx.dom().pages()) {
            HeaderFooterLayout.layoutHeaderFooter(ctx, page)
        }
    }
}
