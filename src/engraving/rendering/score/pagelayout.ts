/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/pagelayout.h/.cpp
 *
 * TODO(port): system dividers, masks, arpeggios, tremolos, fingerings on cross-staff beams,
 * system lock / staff visibility indicators
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { BracketType, TimeSigPlacement, track2staff } from '../../types/types'
import { Sid } from '../../style/styledef'
import { LayoutMode } from '../../dom/score'
import { Page } from '../../dom/page'
import { SegmentType } from '../../dom/segment'
import { SpacerType, type Spacer } from '../../dom/spacer'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { DurationElement } from '../../dom/durationelement'
import type { Measure } from '../../dom/measure'
import type { Slur } from '../../dom/slur'
import type { System } from '../../dom/system'
import type { Tuplet } from '../../dom/tuplet'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { SystemLayout } from './systemlayout'
import { MeasureLayout } from './measurelayout'
import { HeaderFooterLayout } from './headerfooterlayout'
import { BeamLayout } from './beamlayout'
import { TupletLayout } from './tupletlayout'
import { ChordLayout } from './chordlayout'
import { SlurTieLayout } from './slurtielayout'
import { VerticalGapData, VerticalGapDataList } from './verticalgapdata'

// MScore::verticalOrientation(), MScore::horizontalPageGapEven/Odd (defaults)
const VERTICAL_ORIENTATION = false
const VERTICAL_PAGE_GAP = 5.0
const HORIZONTAL_PAGE_GAP_EVEN = 1.0
const HORIZONTAL_PAGE_GAP_ODD = 50.0

export class PageLayout {
    //---------------------------------------------------------
    //   getNextPage
    //---------------------------------------------------------

    static getNextPage(ctx: LayoutContext): void {
        const state = ctx.mutState()
        const dom = ctx.mutDom()
        if (!state.page() || state.pageIdx() >= dom.npages()) {
            const page = new Page(null)
            page.setScore(ctx.score())
            state.setPage(page)
            dom.pages().push(page)
            state.setPrevSystem(null)
            state.setPageOldMeasure(null)
        } else {
            state.setPage(dom.pages()[state.pageIdx()])
            const systems = state.page()!.systems()
            state.setPageOldMeasure(systems.length === 0 || systems[systems.length - 1].measures().length === 0
                ? null : systems[systems.length - 1].measures()[systems[systems.length - 1].measures().length - 1])
            const i = state.curSystem() ? systems.indexOf(state.curSystem()!) : -1
            if (i >= 0 && i > 0 && systems[i - 1].page() === state.page()) {
                // Current and previous systems are on the current page.
                // Erase only the current and the following systems
                // as the previous one will not participate in layout.
                systems.splice(i)
            } else { // system is not on the current page (or will be the first one)
                systems.length = 0
            }
            state.setPrevSystem(systems.length === 0 ? null : systems[systems.length - 1])
        }
        const page = state.page()!
        page.mutldata().setBbox(0.0, 0.0, ctx.conf().loWidth(), ctx.conf().loHeight())
        page.setPageNumber(state.pageIdx())

        let x = 0.0
        let y = 0.0
        if (state.pageIdx()) {
            const prevPage = dom.pages()[state.pageIdx() - 1]
            if (VERTICAL_ORIENTATION) {
                y = prevPage.pos().y() + page.height() + VERTICAL_PAGE_GAP
            } else {
                const gap = (state.pageIdx() + ctx.conf().pageNumberOffset()) & 1 ? HORIZONTAL_PAGE_GAP_ODD : HORIZONTAL_PAGE_GAP_EVEN
                x = prevPage.pos().x() + page.width() + gap
            }
        }
        state.setPageIdx(state.pageIdx() + 1)
        page.setPos(x, y)
    }

    //---------------------------------------------------------
    //   collectPage
    //---------------------------------------------------------

    static collectPage(ctx: LayoutContext): void {
        const page = ctx.mutState().page()!
        const conf = ctx.conf()

        /* The page count will be wrong unless this is the final page, but we need to
         * take into account the space taken up by headers/footers, when positioning
         * other elements. If there was a page count involved, all headers/footers will
         * be re-computed after all pages are laid out */
        HeaderFooterLayout.layoutHeaderFooter(ctx, page)

        const slb = conf.styleMM(Sid.staffLowerBorder)
        const breakPages = conf.viewMode() !== LayoutMode.SYSTEM
        const footerExtension = HeaderFooterLayout.footerExtension(ctx, page)
        const headerExtension = HeaderFooterLayout.headerExtension(ctx, page)
        const headerFooterPadding = conf.styleMM(Sid.staffHeaderFooterPadding)
        const endY = page.height() - page.bm()
        let y: number

        let nextSystem: System | null = null
        let systemIdx = -1

        // re-calculate positions for systems before current
        // (they may have been filled on previous layout)
        const pSystems = page.systems().length
        if (pSystems > 0) {
            SystemLayout.restoreLayout2(page.system(0), ctx)
            y = page.system(0).y() + page.system(0).height()
        } else {
            y = page.tm()
        }
        for (let i = 1; i < pSystems; ++i) {
            const cs = page.system(i)
            const ps = page.system(i - 1)
            const distance = SystemLayout.minDistance(ps, cs, ctx)
            y += distance
            cs.setPos(page.lm(), y)
            SystemLayout.restoreLayout2(cs, ctx)
            y += cs.height()
        }

        for (;;) {
            //
            // calculate distance to previous system
            //
            let distance: number
            const curSystem = ctx.state().curSystem()!
            if (ctx.state().prevSystem()) {
                distance = SystemLayout.minDistance(ctx.state().prevSystem()!, curSystem, ctx)
            } else {
                // this is the first system on page
                if (curSystem.vbox()) {
                    // if the header exists and there is a frame, move the frame downwards
                    // to avoid frame-header overlap
                    distance = headerExtension ? headerExtension + headerFooterPadding : 0.0
                } else {
                    distance = ctx.conf().styleMM(Sid.staffUpperBorder)
                    let fixedDistance = false
                    for (const mb of curSystem.measures()) {
                        if (mb.isMeasure()) {
                            const m = mb as Measure
                            const sp = m.vspacerUp(0)
                            if (sp) {
                                if (sp.spacerType() === SpacerType.FIXED) {
                                    distance = sp.absoluteGap()
                                    fixedDistance = true
                                    break
                                } else {
                                    distance = Math.max(distance, sp.absoluteGap())
                                }
                            }
                        }
                    }
                    if (!fixedDistance) {
                        let top = curSystem.minTop()
                        // ensure it doesn't collide with header
                        if (headerExtension > 0.0) {
                            top += headerExtension + headerFooterPadding
                        }
                        distance = Math.max(distance, top)
                    }
                }
            }

            y += distance
            curSystem.setPos(ctx.state().page()!.lm(), y)
            SystemLayout.restoreLayout2(curSystem, ctx)
            ctx.mutState().page()!.appendSystem(curSystem)
            y += curSystem.height()

            //
            //  check for page break or if next system will fit on page
            //
            let collected = false
            if (ctx.state().rangeDone()) {
                // take next system unchanged
                if (systemIdx > 0) {
                    nextSystem = ctx.mutDom().systems()[systemIdx++] ?? null
                } else {
                    nextSystem = ctx.state().systemList().length === 0 ? null : ctx.mutState().systemList().shift()!
                    if (nextSystem) {
                        ctx.mutDom().systems().push(nextSystem)
                    }
                }
            } else {
                nextSystem = SystemLayout.collectSystem(ctx)
                if (nextSystem) {
                    collected = true
                }
            }

            ctx.mutState().setPrevSystem(ctx.mutState().curSystem())
            ctx.mutState().setCurSystem(nextSystem)

            let isPageBreak = !ctx.state().curSystem() || (breakPages && ctx.state().prevSystem()!.pageBreak())
            if (!isPageBreak) {
                const cs = ctx.state().curSystem()!
                let dist = SystemLayout.minDistance(ctx.state().prevSystem()!, cs, ctx) + cs.height()
                const vbox = cs.vbox()
                if (vbox) {
                    if (footerExtension > 0) {
                        dist += footerExtension
                    }
                } else if (!ctx.state().prevSystem()!.hasFixedDownDistance()) {
                    let margin = Math.max(cs.minBottom(), cs.spacerDistance(false))
                    // ensure it doesn't collide with footer
                    if (footerExtension > 0) {
                        margin += footerExtension + headerFooterPadding
                    }
                    dist += Math.max(margin, slb)
                }
                isPageBreak = (y + dist) >= endY && breakPages
            }
            if (isPageBreak) {
                const prev = ctx.state().prevSystem()!
                let dist = Math.max(prev.minBottom(), prev.spacerDistance(false))
                let footerPadding = 0.0
                // ensure it doesn't collide with footer
                if (footerExtension > 0) {
                    footerPadding = footerExtension + headerFooterPadding
                    dist += footerPadding
                }
                dist = Math.max(dist, slb)
                PageLayout.layoutPage(ctx, page, endY - (y + dist), footerPadding)
                // if we collected a system we cannot fit onto this page,
                // we need to collect next page in order to correctly set system positions
                if (collected) {
                    ctx.mutState().setPageOldMeasure(null)
                }
                break
            }
        }

        const pageSystems = ctx.mutState().page()!.systems()
        const lastSys = pageSystems[pageSystems.length - 1]
        const lastSysMeasure = lastSys.firstMeasure()
        if (lastSysMeasure) {
            MeasureLayout.addSystemHeader(lastSysMeasure, false, ctx)
        }

        let stick2 = new Fraction(-1, 1)
        for (const s of page.systems()) {
            for (const mb of s.measures()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const m = mb as Measure
                if (stick2.eq(new Fraction(-1, 1))) {
                    stick2 = m.tick()
                }

                for (let track = 0; track < ctx.dom().ntracks(); ++track) {
                    for (let segment = m.first(); segment; segment = segment.next()) {
                        const e2 = segment.element(track)
                        if (!e2) {
                            continue
                        }

                        if (e2.isChordRest()) {
                            if (!ctx.dom().staff(track2staff(track))!.show()) {
                                continue
                            }
                            const cr = e2 as ChordRest
                            if (BeamLayout.isStartOfCrossBeam(cr)) { // layout cross staff beams
                                TLayout.layoutBeam(cr.beam()!, ctx)
                                BeamLayout.checkCrossPosAndStemConsistency(cr.beam()!, ctx)
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
                                        BeamLayout.checkCrossPosAndStemConsistency(ccb, ctx)
                                    }
                                    ChordLayout.layoutSpanners(cc, ctx)
                                    for (const element of cc.el()) {
                                        if (element.isSlur()) {
                                            TLayout.layoutItem(element, ctx)
                                        }
                                    }
                                }
                                // TODO(port): ArpeggioLayout::layoutArpeggio2
                                ChordLayout.layoutSpanners(c, ctx)
                                // TODO(port): cross-staff two-chord tremolos
                            }
                        } else if (e2.isBarLine()) {
                            TLayout.layoutBarLine2(e2 as BarLine, ctx)
                        }
                    }
                }
                MeasureLayout.layout2(m, ctx)
            }
        }

        // If we are doing a partial layout, we also relayout the barlines of the first measure of the next page
        const lastPageSystems = ctx.mutState().page()!.systems()
        const lastMeasures = lastPageSystems[lastPageSystems.length - 1].measures()
        const lastOfThisPage = lastMeasures[lastMeasures.length - 1]
        const firstOfNextPage = lastOfThisPage ? lastOfThisPage.next() : null
        if (firstOfNextPage && firstOfNextPage.isMeasure() && firstOfNextPage.tick().gt(ctx.state().endTick())) {
            for (let segment = (firstOfNextPage as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isSegType(SegmentType.BarLineType)) {
                    continue
                }
                for (const item of segment.elist()) {
                    if (item && item.isBarLine()) {
                        TLayout.layoutBarLine2(item as BarLine, ctx)
                    }
                }
            }
        }

        if (ctx.conf().isMode(LayoutMode.SYSTEM)) {
            const s = page.systems()[page.systems().length - 1]
            const height = s ? s.pos().y() + s.height() + s.minBottom() : ctx.state().page()!.tm()
            page.mutldata().setBbox(0.0, 0.0, ctx.conf().loWidth(), height + ctx.state().page()!.bm())
        }

        PageLayout.layoutCrossStaffElements(ctx, page)

        for (const system of page.systems()) {
            SystemLayout.centerElementsBetweenStaves(system)
        }

        if ((ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) === TimeSigPlacement.ACROSS_STAVES
            && ctx.conf().styleB(Sid.timeSigCenterAcrossStaveGroup)) {
            for (const system of page.systems()) {
                SystemLayout.centerBigTimeSigsAcrossStaves(system)
            }
        }

        // TODO(port): MaskLayout::computeMasks, layoutSystemDividers
    }

    static layoutCrossStaffElements(ctx: LayoutContext, page: Page): void {
        for (const system of page.systems()) {
            if (!system.firstMeasure()) {
                continue
            }

            const stick = system.firstMeasure()!.tick()
            const etick = system.endTick()
            if (!stick.lt(etick)) {
                continue
            }
            if (etick.le(ctx.state().startTick()) || etick.gt(ctx.state().tick())) {
                continue
            }

            PageLayout.layoutCrossStaffSlurs(ctx, system)
            PageLayout.layoutArticAndFingeringOnCrossStaffBeams(ctx, system)
        }
    }

    static layoutCrossStaffSlurs(ctx: LayoutContext, system: System): void {
        const stick = system.firstMeasure()!.tick()
        const etick = system.endTick()
        const spanners = ctx.dom().spannerMap().findOverlapping(stick.ticks(), etick.ticks())
        for (const sp of spanners) {
            if (!sp.isSlur() || sp.tick().eq(system.endTick())) {
                continue
            }
            const slur = sp as Slur
            if (slur.isCrossStaff() || slur.hasCrossBeams()) {
                SlurTieLayout.layoutSystem(slur, system, ctx)
                const scr = slur.startElement() as ChordRest | null
                const ecr = slur.endElement() as ChordRest | null
                if (scr && scr.isChord()) {
                    ChordLayout.layoutArticulations3(scr as Chord, slur, ctx)
                }
                if (ecr && ecr.isChord()) {
                    ChordLayout.layoutArticulations3(ecr as Chord, slur, ctx)
                }
            }
        }
    }

    static layoutArticAndFingeringOnCrossStaffBeams(ctx: LayoutContext, system: System): void {
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (const item of segment.elist()) {
                    if (!item || !item.isChord()) {
                        continue
                    }
                    const c = item as Chord
                    const hasCrossBeam = !!c.beam() && (c.beam()!.cross() || c.staffMove() !== 0)
                    if (!hasCrossBeam) {
                        continue
                    }
                    ChordLayout.layoutArticulations(c, ctx)
                    ChordLayout.layoutArticulations2(c, ctx, true)
                    // TODO(port): fingerings on the cross-beam side
                }
            }
        }
    }

    //---------------------------------------------------------
    //   layoutPage
    //    increase system distance upto maxSystemDistance
    //    to fill page
    //---------------------------------------------------------

    static layoutPage(ctx: LayoutContext, page: Page, restHeight: number, footerPadding: number): void {
        if (restHeight < 0.0) {
            restHeight = 0
        }

        const systems = page.systems()
        const gaps = systems.length - 1

        const sList: System[] = []

        // build list of systems (excluding last)
        // set initial distance for each to the unstretched minimum distance to the next
        for (let i = 0; i < gaps; ++i) {
            const s1 = systems[i]
            const s2 = systems[i + 1]
            s1.setDistance(s2.y() - s1.y())
            if (s1.vbox() || s2.vbox() || s1.hasFixedDownDistance()) {
                continue
            }
            sList.push(s1)
        }

        // Done for this page?
        // MScore::noVerticalStretch is false
        if (sList.length === 0 || ctx.conf().isVerticalSpreadEnabled() || ctx.conf().viewMode() === LayoutMode.SYSTEM) {
            if (ctx.conf().viewMode() === LayoutMode.FLOAT) {
                for (const system of systems) {
                    system.move(new PointF(0.0, 0.0))
                }
            } else if ((ctx.conf().viewMode() !== LayoutMode.SYSTEM) && ctx.conf().isVerticalSpreadEnabled()) {
                PageLayout.distributeStaves(ctx, page, footerPadding)
            }

            // system dividers
            return
        }

        const maxDist = ctx.conf().maxSystemDistance()

        // allocate space as needed to normalize system distance (bottom of one system to top of next)
        sList.sort((a, b) => (a.distance() - a.height()) - (b.distance() - b.height()))
        const s0 = sList[0]
        let dist = s0.distance() - s0.height() // distance for shortest system
        for (let i = 1; i < sList.length; ++i) {
            const si = sList[i]
            const ndist = si.distance() - si.height() // next taller system
            let fill = ndist - dist // amount by which this system distance exceeds next shorter
            if (fill > 0.0) {
                let totalFill = fill * i // space required to add this amount to all shorter systems
                if (totalFill > restHeight) {
                    totalFill = restHeight // too much; adjust amount
                    fill = restHeight / i
                }
                for (let k = 0; k < i; ++k) { // add amount to all shorter systems
                    const s = sList[k]
                    let d = s.distance() + fill
                    if ((d - s.height()) > maxDist) { // but don't exceed max system distance
                        d = Math.max(maxDist + s.height(), s.distance())
                    }
                    s.setDistance(d)
                }
                restHeight -= totalFill // reduce available space for next iteration
                if (restHeight <= 0) {
                    break // no space left
                }
            }
            dist = ndist // set up for next iteration
        }

        if (restHeight > 0.0) { // space left?
            const fill = restHeight / sList.length
            for (const s of sList) { // allocate it to systems equally
                let d = s.distance() + fill
                if ((d - s.height()) > maxDist) { // but don't exceed max system distance
                    d = Math.max(maxDist + s.height(), s.distance())
                }
                s.setDistance(d)
            }
        }

        let y = systems[0].y()
        for (let i = 0; i < gaps; ++i) {
            const s1 = systems[i]
            s1.mutldata().setPosY(y)
            y += s1.distance()
        }
        systems[systems.length - 1].mutldata().setPosY(y)
    }

    static distributeStaves(ctx: LayoutContext, page: Page, footerPadding: number): void {
        const vgdl = new VerticalGapDataList()

        // Find and classify all gaps between staves.
        let ngaps = 0
        let prevYBottom = page.tm()
        let yBottom = 0.0
        let spacerOffset = 0.0
        let vbox = false
        let nextSpacer: Spacer | null = null
        let transferNormalBracket = false
        let transferCurlyBracket = false
        const style = ctx.conf().style()
        for (const system of page.systems()) {
            if (system.vbox()) {
                const vgd = new VerticalGapData(style, !ngaps++, system, null, null, null, prevYBottom)
                vgd.addSpaceAroundVBox(true)
                prevYBottom = system.y()
                yBottom = system.y() + system.height()
                vbox = true
                vgdl.push(vgd)
                transferNormalBracket = false
                transferCurlyBracket = false
            } else {
                let newSystem = true
                let addSpaceAroundNormalBracket = false
                let addSpaceAroundCurlyBracket = false
                let endNormalBracket = -1
                let endCurlyBracket = -1
                let staffNr = -1
                for (const sysStaff of system.staves()) {
                    const staff = ctx.dom().staff(++staffNr)
                    if (!staff) {
                        break
                    }
                    addSpaceAroundNormalBracket = addSpaceAroundNormalBracket || endNormalBracket === staffNr
                    addSpaceAroundCurlyBracket = addSpaceAroundCurlyBracket || endCurlyBracket === staffNr
                    for (const bi of staff.brackets()) {
                        if (bi.bracketType() === BracketType.NORMAL) {
                            addSpaceAroundNormalBracket = addSpaceAroundNormalBracket || staff.idx() > (endNormalBracket - 1)
                            endNormalBracket = Math.max(endNormalBracket, staff.idx() + bi.bracketSpan())
                        } else if (bi.bracketType() === BracketType.BRACE) {
                            addSpaceAroundCurlyBracket = addSpaceAroundCurlyBracket || staff.idx() > (endCurlyBracket - 1)
                            endCurlyBracket = Math.max(endCurlyBracket, staff.idx() + bi.bracketSpan())
                        }
                    }

                    if (!sysStaff.show()) {
                        continue
                    }

                    const vgd = new VerticalGapData(style, !ngaps++, system, staff, sysStaff, nextSpacer, prevYBottom)
                    nextSpacer = system.downSpacer(staff.idx())

                    if (newSystem) {
                        vgd.addSpaceBetweenSections()
                        newSystem = false
                    }
                    if (addSpaceAroundNormalBracket || transferNormalBracket) {
                        vgd.addSpaceAroundNormalBracket()
                        addSpaceAroundNormalBracket = false
                        transferNormalBracket = false
                    }
                    if (addSpaceAroundCurlyBracket || transferCurlyBracket) {
                        vgd.addSpaceAroundCurlyBracket()
                        addSpaceAroundCurlyBracket = false
                        transferCurlyBracket = false
                    } else if (staffNr < endCurlyBracket) {
                        vgd.insideCurlyBracket()
                    }

                    if (vbox) {
                        vgd.addSpaceAroundVBox(false)
                        vbox = false
                    }

                    prevYBottom = system.y() + sysStaff.bbox().bottom()
                    yBottom = system.y() + sysStaff.y() + sysStaff.skyline().south().max()
                    spacerOffset = sysStaff.skyline().south().max() - sysStaff.bbox().height()
                    vgdl.push(vgd)
                }
                transferNormalBracket = endNormalBracket >= 0
                transferCurlyBracket = endCurlyBracket >= 0
            }
        }
        --ngaps

        const staffLowerBorder = ctx.conf().styleMM(Sid.staffLowerBorder)
        const combinedBottomMargin = page.bm() + footerPadding
        const marginToStaff = page.bm() + staffLowerBorder
        let spaceRemaining = Math.min(page.height() - combinedBottomMargin - yBottom, page.height() - marginToStaff - prevYBottom)

        if (nextSpacer) {
            spaceRemaining -= Math.max(0.0, nextSpacer.absoluteGap() - spacerOffset - staffLowerBorder)
        }
        if (spaceRemaining <= 0.0) {
            return
        }

        // Try to make the gaps equal, taking the spread factors and maximum spacing into account.
        const maxPasses = 20 // Saveguard to prevent endless loops.
        let pass = 0
        while (!RealIsNull(spaceRemaining) && (ngaps > 0) && (++pass < maxPasses)) {
            ngaps = 0
            const smallest = vgdl.smallest()
            let nextSmallest = vgdl.smallest(smallest)
            if (RealIsNull(smallest) || RealIsNull(nextSmallest)) {
                break
            }

            if ((nextSmallest - smallest) * vgdl.sumStretchFactor() > spaceRemaining) {
                nextSmallest = smallest + spaceRemaining / vgdl.sumStretchFactor()
            }

            let addedSpace = 0.0
            const modified: VerticalGapData[] = []
            for (const vgd of vgdl) {
                if (!RealIsNull(vgd.spacing() - smallest)) {
                    continue
                }
                let step = nextSmallest - vgd.spacing()
                if (step < 0.0) {
                    continue
                }
                step = vgd.addSpacing(step)
                if (!RealIsNull(step)) {
                    addedSpace += step * vgd.factor()
                    modified.push(vgd)
                    ++ngaps
                }
                if ((spaceRemaining - addedSpace) <= 0.0) {
                    break
                }
            }
            if ((spaceRemaining - addedSpace) <= 0.0) {
                for (const vgd of modified) {
                    vgd.undoLastAddSpacing()
                }
                ngaps = 0
            } else {
                spaceRemaining -= addedSpace
            }
        }

        // If there is still space left, distribute the space of the staves.
        // However, there is a limit on how much space is added per gap.
        const maxPageFill = ctx.conf().styleMM(Sid.maxPageFillSpread)
        spaceRemaining = Math.min(maxPageFill * vgdl.length, spaceRemaining)
        pass = 0
        ngaps = 1
        while (!RealIsNull(spaceRemaining) && !RealIsNull(maxPageFill) && (ngaps > 0) && (++pass < maxPasses)) {
            ngaps = 0
            let addedSpace = 0.0
            const step = spaceRemaining / vgdl.sumStretchFactor()
            for (const vgd of vgdl) {
                const res = vgd.addFillSpacing(step, maxPageFill)
                if (!RealIsNull(res)) {
                    addedSpace += res * vgd.factor()
                    ++ngaps
                }
            }
            spaceRemaining -= addedSpace
        }

        // std::set<System*> iterates in pointer order; the order is irrelevant here
        const systems = new Set<System>()
        let systemShift = 0.0
        let staffShift = 0.0
        let prvSystem: System | null = null
        for (const vgd of vgdl) {
            if (vgd.sysStaff) {
                systems.add(vgd.system)
            }
            systemShift += vgd.actualAddedSpace()
            if (prvSystem === vgd.system) {
                staffShift += vgd.actualAddedSpace()
            } else {
                vgd.system.mutldata().moveY(systemShift)
                if (prvSystem) {
                    prvSystem.setDistance(vgd.system.y() - prvSystem.y())
                    prvSystem.setHeight(prvSystem.height() + staffShift)
                }
                staffShift = 0.0
            }

            if (vgd.sysStaff) {
                vgd.sysStaff.bbox().translate(0.0, staffShift)
            }

            prvSystem = vgd.system
        }
        if (prvSystem) {
            prvSystem.setHeight(prvSystem.height() + staffShift)
        }

        for (const system of systems) {
            SystemLayout.setMeasureHeight(system, system.height(), ctx)
            SystemLayout.layoutBracketsVertical(system, ctx)
            SystemLayout.layoutInstrumentNames(system, ctx)
        }
    }
}
