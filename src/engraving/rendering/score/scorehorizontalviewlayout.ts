/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/scorehorizontalviewlayout.h/.cpp: the continuous (horizontal) view,
 * one page with one system that contains all measures.
 *
 * TODO(port): HORIZONTAL_FIXED (layoutSegmentsWithDuration, computeCellWidth, stretchMeasureInPracticeMode) is laid out
 * like LINE; system lock indicators
 */

import { Fraction } from '../../types/fraction'
import { RealIsEqual } from '../../../framework/global/realfn'
import { PointF } from '../../../framework/draw/types/geometry'
import { track2staff } from '../../types/types'
import { Page } from '../../dom/page'
import { Factory } from '../../dom/factory'
import { SegmentType } from '../../dom/segment'
import type { Score } from '../../dom/score'
import type { Measure } from '../../dom/measure'
import type { HBox } from '../../dom/box'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { DurationElement } from '../../dom/durationelement'
import type { Slur } from '../../dom/slur'
import type { Tuplet } from '../../dom/tuplet'
import type { Arpeggio } from '../../dom/arpeggio'
import { Sid } from '../../style/styledef'
import type { LayoutContext } from './layoutcontext'
import { PassResetLayoutData } from './passes'
import { TLayout } from './tlayout'
import { SystemLayout } from './systemlayout'
import { MeasureLayout } from './measurelayout'
import { HorizontalSpacing } from './horizontalspacing'
import { BeamLayout } from './beamlayout'
import { TupletLayout } from './tupletlayout'
import { ChordLayout } from './chordlayout'
import { ArpeggioLayout } from './arpeggiolayout'
import { TremoloLayout } from './tremololayout'
import { SlurTieLayout } from './slurtielayout'

export class ScoreHorizontalViewLayout {
    static layoutHorizontalView(score: Score, ctx: LayoutContext, stick: Fraction, etick: Fraction): void {
        ctx.mutState().setEndTick(etick)

        //---------------------------------------------------
        //    initialize layout context lc
        //---------------------------------------------------

        let m = score.tick2measure(stick) ?? score.first()!
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

        ctx.mutState().setPrevMeasure(null)
        ctx.mutState().setNextMeasure(m) //_showVBox ? first() : firstMeasure();
        ctx.mutState().setStartTick(m.tick())

        new PassResetLayoutData().run(score, ctx)

        ScoreHorizontalViewLayout.layoutLinearAll(ctx, ctx.state().isLayoutAll())
    }

    /** C++ layoutLinear(LayoutContext&, bool layoutAll) */
    private static layoutLinearAll(ctx: LayoutContext, layoutAll: boolean): void {
        ScoreHorizontalViewLayout.resetSystems(ctx, layoutAll)

        ScoreHorizontalViewLayout.collectLinearSystem(ctx)

        ScoreHorizontalViewLayout.layoutLinear(ctx)
    }

    //  in linear mode there is only one page
    //  which contains one system
    private static resetSystems(ctx: LayoutContext, layoutAll: boolean): void {
        const score = ctx.score()
        let page: Page
        if (layoutAll) {
            for (const s of score.systems()) {
                for (const ss of s.spannerSegments()) {
                    ss.resetExplicitParent()
                }
            }
            for (const s of score.systems()) {
                s.destroy() // C++ muse::DeleteAll(mutDom.systems())
            }
            score.setSystems([])
            score.setPages([])
            if (!ctx.dom().firstMeasure()) {
                return
            }

            for (let mb = ctx.mutDom().first(); mb; mb = mb.next()) {
                mb.resetExplicitParent()
            }

            page = new Page(null)
            page.setScore(score)
            score.pages().push(page)
            page.mutldata().setBbox(0.0, 0.0, ctx.conf().loWidth(), ctx.conf().loHeight())
            page.setPageNumber(0)

            const system = Factory.createSystem(page)
            score.systems().push(system)
            page.appendSystem(system)
            system.adjustStavesNumber(ctx.dom().nstaves())
        } else {
            if (score.pages().length === 0) {
                return
            }
            page = score.pages()[0]
            const system = score.systems()[0]
            system.clear()
            system.adjustStavesNumber(ctx.dom().nstaves())
        }
        ctx.mutState().setPage(page)
    }

    private static layoutLinear(ctx: LayoutContext): void {
        const system = ctx.mutDom().systems()[0]

        SystemLayout.layoutSystemElements(system, ctx)

        SystemLayout.layout2(system, ctx) // compute staff distances

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            const m = mb as Measure

            for (let track = 0; track < ctx.dom().ntracks(); ++track) {
                for (let segment = m.first(); segment; segment = segment.next()) {
                    const e = segment.element(track)
                    if (!e) {
                        continue
                    }
                    if (e.isChordRest()) {
                        if (m.tick().lt(ctx.state().startTick()) || m.tick().gt(ctx.state().endTick())) {
                            continue
                        }
                        if (!ctx.dom().staff(track2staff(track))!.show()) {
                            continue
                        }
                        const cr = e as ChordRest
                        if (BeamLayout.isStartOfCrossBeam(cr)) { // layout cross staff beams
                            TLayout.layoutBeam(cr.beam()!, ctx)
                        }
                        if (TupletLayout.notTopTuplet(cr)) {
                            // fix layout of tuplets
                            let de: DurationElement = cr
                            while (de.tuplet() && (de.tuplet()!.elements()[0] as unknown) === de) {
                                const t: Tuplet = de.tuplet()!
                                TLayout.layoutTuplet(t, ctx)
                                de = t as unknown as DurationElement
                            }
                        }

                        if (cr.isChord()) {
                            const c = cr as Chord
                            for (const cc of c.graceNotes()) {
                                const ccb = cc.beam()
                                if (ccb && ccb.elements()[0] === cc) {
                                    TLayout.layoutBeam(ccb, ctx)
                                }
                                ChordLayout.layoutSpanners(cc, ctx)
                                for (const element of cc.el()) {
                                    if (element.isSlur()) {
                                        TLayout.layoutItem(element, ctx)
                                    }
                                }
                            }
                            ArpeggioLayout.layoutArpeggio2(c.arpeggio() as Arpeggio | null, ctx)
                            ChordLayout.layoutSpanners(c, ctx)
                            if (c.tremoloSingleChord()) {
                                TremoloLayout.layoutSingleChord(c.tremoloSingleChord()!, ctx)
                            } else if (c.tremoloTwoChord()) {
                                const t = c.tremoloTwoChord()!
                                const c1 = t.chord1()
                                const c2 = t.chord2()
                                if (c1 && c2 && (c1.staffMove() || c2.staffMove())) {
                                    TremoloLayout.layoutTwoChord(t, ctx)
                                }
                            }
                        }
                    } else if (e.isBarLine()) {
                        TLayout.layoutBarLine2(e as BarLine, ctx)
                    }
                }
            }
            MeasureLayout.layout2(m, ctx)
        }

        const ms = system.measures()
        const spanners = ctx.dom().spannerMap().findOverlapping(ms[0].tick().ticks(), system.endTick().ticks())
        for (const sp of spanners) {
            if (sp.isSlur() && ((sp as Slur).isCrossStaff() || (sp as Slur).hasCrossBeams())) {
                SlurTieLayout.layoutSystem(sp as Slur, system, ctx)
            }
        }

        const page = ctx.mutState().page()!
        const lm = page.lm()
        const tm = page.tm() + ctx.conf().styleMM(Sid.staffUpperBorder)
        const rm = page.rm()
        const bm = page.bm() + ctx.conf().styleMM(Sid.staffLowerBorder)

        // TODO(port): layoutSystemLockIndicators(system)

        page.setPos(0, 0)
        system.setPos(lm, tm)
        page.mutldata().setBbox(0.0, 0.0, lm + system.width() + rm, tm + system.height() + bm)
    }

    // Append all measures to System. VBox is not included to System
    private static collectLinearSystem(ctx: LayoutContext): void {
        const system = ctx.mutDom().systems()[0]
        SystemLayout.setInstrumentNames(system, ctx, /* longNames */ true)

        const targetSystemWidth = ctx.dom().nmeasures() * ctx.conf().styleMM(Sid.minMeasureWidth)
        system.setWidth(targetSystemWidth)

        let curSystemWidth = 0.0
        let firstMeasureInScore = true //lc.startTick.isZero();
        let firstMeasureInLayout = true

        //set first measure to lc.nextMeasures for following
        //utilizing in getNextMeasure()
        ctx.mutState().setNextMeasure(ctx.mutDom().first())
        ctx.mutState().setTick(new Fraction(0, 1))
        MeasureLayout.getNextMeasure(ctx)

        const measuresToLayout = new Set<Measure>()

        while (ctx.state().curMeasure()) {
            const cur = ctx.mutState().curMeasure()!
            if (cur.isVBoxBase()) {
                cur.resetExplicitParent()
                MeasureLayout.getNextMeasure(ctx)
                continue
            }
            system.appendMeasure(cur)
            const prev = ctx.state().prevMeasure()
            const createHeader = !!prev && prev.isHBox() && (prev as HBox).createSystemHeader()
            if (cur.isMeasure()) {
                const m = cur as Measure
                if (m.mmRest()) {
                    m.mmRest()!.resetExplicitParent()
                }
                if (firstMeasureInScore) {
                    SystemLayout.layoutSystem(system, ctx, curSystemWidth, true)
                    if (m.repeatStart()) {
                        const s = m.findSegmentR(SegmentType.StartRepeatBarLine, new Fraction(0, 1))!
                        if (!s.enabled()) {
                            s.setEnabled(true)
                        }
                    }
                    MeasureLayout.addSystemHeader(m, true, ctx)
                    curSystemWidth += system.leftMargin()
                    firstMeasureInScore = false
                } else if (createHeader) {
                    MeasureLayout.addSystemHeader(m, false, ctx)
                } else if (m.header()) {
                    MeasureLayout.removeSystemHeader(m)
                }
                if (m.trailer()) {
                    MeasureLayout.removeSystemTrailer(m, ctx)
                }

                if (m.tick().ge(ctx.state().startTick()) && m.tick().le(ctx.state().endTick())) {
                    // for measures in range, do full layout
                    MeasureLayout.computePreSpacingItems(m, ctx)
                    MeasureLayout.createEndBarLines(m, false, ctx)
                    MeasureLayout.setRepeatCourtesiesAndParens(m, ctx)
                    MeasureLayout.updateGraceNotes(m, ctx)
                    curSystemWidth = HorizontalSpacing.updateSpacingForLastAddedMeasure(system, firstMeasureInLayout)
                    measuresToLayout.add(m)
                    if (firstMeasureInLayout) {
                        firstMeasureInLayout = false
                    }
                } else {
                    // for measures not in range, use existing layout
                    const measureWidth = m.width()
                    if (!RealIsEqual(m.x(), curSystemWidth)) {
                        // fix beam positions
                        // other elements with system as parent are processed in layoutSystemElements()
                        // but full beam processing is expensive and not needed if we adjust position here
                        const p = new PointF(curSystemWidth, 0.0).minus(m.pos())
                        for (let s = m.first(); s; s = s.next()) {
                            if (!s.isChordRestType()) {
                                continue
                            }
                            for (let track = 0; track < ctx.dom().ntracks(); ++track) {
                                const e = s.element(track)
                                if (!e) {
                                    continue
                                }
                                const cr = e as ChordRest
                                if (cr.beam() && cr.beam()!.elements()[0] === cr) {
                                    cr.beam()!.mutldata().move(p)
                                }
                            }
                        }
                    }
                    m.setPos(curSystemWidth, m.y())
                    curSystemWidth += measureWidth
                }
            } else if (cur.isHBox()) {
                curSystemWidth = HorizontalSpacing.updateSpacingForLastAddedMeasure(system)
            }

            MeasureLayout.getNextMeasure(ctx)
        }

        for (const m of measuresToLayout) {
            MeasureLayout.layoutMeasureElements(m, ctx)
        }

        for (const m of system.measures()) {
            if (!m.isMeasure()) {
                continue
            }
            MeasureLayout.layoutStaffLines(m as Measure, ctx)
        }

        SystemLayout.hideEmptyStaves(system, ctx, true)

        system.setWidth(curSystemWidth)
    }
}
