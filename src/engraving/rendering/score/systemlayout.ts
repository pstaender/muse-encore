/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/systemlayout.h/.cpp
 *
 * TODO(port): system lock indicators, MMRestRange, lines (trills, vibrato, let ring, palm mute, ...),
 * harmony/fret diagrams/figured bass alignment, guitar bends, tremolos, hammer-on/pull-off,
 * centering of whammy bars between staves
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsNull } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { AlignH, AutoOnOff, nidx, BracketType, DPI, ElementType, InstrumentLabelVisibility, TimeSigPlacement,
    VOICES, GuitarBendType, staff2track, track2staff, type staff_idx_t } from '../../types/types'
import { Sid } from '../../style/styledef'
import { DefaultStyle } from '../../style/defaultstyle'
import { LayoutMode } from '../../dom/score'
import { SpacerType } from '../../dom/spacer'
import { BARLINE_SPAN_1LINESTAFF_FROM, BARLINE_SPAN_1LINESTAFF_TO, type BarLine } from '../../dom/barline'
import { CrossStaffBeamPosition } from '../../dom/beambase'
import { Bracket } from '../../dom/bracket'
import { Factory } from '../../dom/factory'
import { Pid } from '../../dom/property'
import { InstrumentName, InstrumentNameType } from '../../dom/instrumentname'
import { SegmentType, type Segment } from '../../dom/segment'
import { System, type SysStaff } from '../../dom/system'
import type { Articulation } from '../../dom/articulation'
import type { BracketItem } from '../../dom/bracketitem'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { EngravingItem } from '../../dom/engravingitem'
import type { FBox, HBox, TBox, VBox } from '../../dom/box'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { MeasureNumber } from '../../dom/measurenumber'
import type { Slur } from '../../dom/slur'
import type { Spanner, SpannerSegment } from '../../dom/spanner'
import type { Staff } from '../../dom/staff'
import type { TieSegment } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { MeasureLayout } from './measurelayout'
import { HorizontalSpacing } from './horizontalspacing'
import { BeamLayout } from './beamlayout'
import { BeamTremoloLayout } from './beamtremololayout'
import { ChordLayout } from './chordlayout'
import { RestLayout } from './restlayout'
import { SlurTieLayout } from './slurtielayout'
import { TupletLayout } from './tupletlayout'
import { LyricsLayout } from './lyricslayout'
import { BoxLayout } from './boxlayout'
import { Autoplace } from './autoplace'
import { AlignmentLayout } from './alignmentlayout'
import type { LyricsLine } from '../../dom/lyricsline'
import type { MMRest } from '../../dom/mmrest'
import type { Shape } from '../../infrastructure/shape'
import type { SkylineLine } from '../../infrastructure/skyline'
import type { FretDiagram } from '../../dom/fret'
import type { Harmony } from '../../dom/harmony'
import type { Ornament } from '../../dom/ornament'
import type { Arpeggio } from '../../dom/arpeggio'
import type { GuitarBend } from '../../dom/guitarbend'
import type { TextLineBaseSegment } from '../../dom/textlinebase'
import type { HammerOnPullOff, HammerOnPullOffSegment } from '../../dom/hammeronpulloff'
import { GuitarDiveLayout } from './guitardivelayout'

class MeasureState {
    measure: Measure | null = null
    measureWidth = 0.0
    measurePos = 0.0
    elementPositions = new Map<EngravingItem, PointF>()
    curHeader = false
    curTrailer = false

    clear(): void {
        this.measure = null
        this.measureWidth = 0.0
        this.measurePos = 0.0
        this.elementPositions.clear()
    }

    restoreMeasure(): void {
        this.measure!.mutldata().setPosX(this.measurePos)
        this.measure!.setWidth(this.measureWidth)
        for (const [item, pos] of this.elementPositions) {
            item.setPos(pos)
        }
    }
}

class ElementsToLayout {
    measures: Measure[] = []
    segments: Segment[] = []

    chordRests: ChordRest[] = []
    chords: Chord[] = []
    barlines: BarLine[] = []
    timeSigAboveStaves: TimeSig[] = []

    measureNumbers: MeasureNumber[] = []
    markersAndJumps: EngravingItem[] = []

    // annotations; most of these element types are not ported yet and are laid out with TLayout::layoutItem
    stickings: EngravingItem[] = []
    fermatasAndTremoloBars: EngravingItem[] = []
    figuredBass: EngravingItem[] = []
    dynamics: EngravingItem[] = []
    expressions: EngravingItem[] = []
    harpDiagrams: EngravingItem[] = []
    fretDiagrams: EngravingItem[] = []
    staffText: EngravingItem[] = []
    instrChanges: EngravingItem[] = []
    systemText: EngravingItem[] = []
    playTechCapoStringTunTripletFeel: EngravingItem[] = []
    rehMarks: EngravingItem[] = []
    tempoText: EngravingItem[] = []
    images: EngravingItem[] = []
    parenthesis: EngravingItem[] = []
    harmonies: EngravingItem[] = []
    playCountText: EngravingItem[] = []

    slurs: Spanner[] = []
    trills: Spanner[] = []
    hairpins: Spanner[] = []
    ottavas: Spanner[] = []
    pedal: Spanner[] = []
    voltas: Spanner[] = []
    tempoChangeLines: Spanner[] = []
    partialLyricsLines: Spanner[] = []
    guitarBends: GuitarBend[] = []
    allOtherSpanners: Spanner[] = []

    constructor(public system: System) {}
}

enum StaffHideMode {
    HIDE_WHEN_STAFF_EMPTY,
    HIDE_WHEN_INSTRUMENT_EMPTY,
    ALWAYS_SHOW,
}

function computeHideMode(system: System, staff: Staff, staffIdx: staff_idx_t, globalHideIfEmpty: boolean,
                         overrides: { hasSystemSpecificOverrides: boolean }): StaffHideMode {
    let hasSystemSpecificOverrideHide = false
    let hasSystemSpecificOverrideDontHide = false
    for (const mb of system.measures()) {
        if (!mb.isMeasure()) {
            continue
        }
        const hideIfEmpty = (mb as Measure).hideStaffIfEmpty(staffIdx)
        hasSystemSpecificOverrideHide = hasSystemSpecificOverrideHide || (hideIfEmpty === AutoOnOff.ON)
        hasSystemSpecificOverrideDontHide = hasSystemSpecificOverrideDontHide || (hideIfEmpty === AutoOnOff.OFF)
    }

    if (hasSystemSpecificOverrideDontHide) {
        overrides.hasSystemSpecificOverrides = true
        return StaffHideMode.ALWAYS_SHOW
    } else if (hasSystemSpecificOverrideHide) {
        overrides.hasSystemSpecificOverrides = true
        return StaffHideMode.HIDE_WHEN_STAFF_EMPTY
    }

    const staffHideMode = staff.hideWhenEmpty()
    switch (staffHideMode) {
    case AutoOnOff.ON:
        return StaffHideMode.HIDE_WHEN_STAFF_EMPTY
    case AutoOnOff.OFF:
        return StaffHideMode.ALWAYS_SHOW
    case AutoOnOff.AUTO:
        break
    }

    const partHideMode = staff.part().hideWhenEmpty()
    switch (partHideMode) {
    case AutoOnOff.ON:
        break
    case AutoOnOff.OFF:
        return StaffHideMode.ALWAYS_SHOW
    case AutoOnOff.AUTO:
        if (!globalHideIfEmpty) {
            return StaffHideMode.ALWAYS_SHOW
        }
    }

    return staff.part().hideStavesWhenIndividuallyEmpty()
        ? StaffHideMode.HIDE_WHEN_STAFF_EMPTY
        : StaffHideMode.HIDE_WHEN_INSTRUMENT_EMPTY
}

interface SpannerInterval {
    start: number
    stop: number
    value: Spanner
}

const toIntervals = (spanners: readonly Spanner[]): SpannerInterval[] =>
    spanners.map(s => ({ start: s.tick().ticks(), stop: s.tick2().ticks(), value: s }))

function computeShowSysStaff(system: System, staff: Staff, staffIdx: staff_idx_t, stick: Fraction, spanners: readonly SpannerInterval[],
                             hideMode: StaffHideMode): boolean {
    if (hideMode === StaffHideMode.ALWAYS_SHOW) {
        return true
    }

    for (const spanner of spanners) {
        if (spanner.value.staff() === staff
            && !spanner.value.systemFlag()
            && !(spanner.stop === stick.ticks() && !spanner.value.isSlur())) {
            return true
        }
    }

    for (const m of system.measures()) {
        if (!m.isMeasure()) {
            continue
        }
        if (!(m as Measure).isEmpty(staffIdx)) {
            return true
        }
    }

    const part = staff.part()
    const n = part.nstaves()
    if (n > 1) {
        const idx = part.staves()[0].idx()
        for (let i = 0; i < n; ++i) {
            const st = idx + i
            for (const mb of system.measures()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const m = mb as Measure
                const empty = m.isEmpty(st)
                if (hideMode === StaffHideMode.HIDE_WHEN_INSTRUMENT_EMPTY && !empty) {
                    return true
                } else if (empty) {
                    continue
                }
                for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                    for (let voice = 0; voice < VOICES; ++voice) {
                        const cr = s.cr(st * VOICES + voice)
                        if (!cr || cr.isRest() || cr.staffMove() === 0) {
                            continue
                        }
                        if (staffIdx === st + cr.staffMove()) {
                            return true
                        }
                    }
                }
            }
        }
    }

    return false
}

export class SystemLayout {
    static collectSystem(ctx: LayoutContext): System | null {
        if (!ctx.state().curMeasure()) {
            return null
        }

        const systems = ctx.dom().systems()
        let measure: MeasureBase | null = systems.length === 0 ? null : systems[systems.length - 1].measures()[systems[systems.length - 1].measures().length - 1]
        if (measure) {
            measure = measure.mbWithPrecedingSectionBreak()
        }

        const firstSysLongName = (ctx.conf().styleV(Sid.firstSystemInstNameVisibility) as InstrumentLabelVisibility)
                                 === InstrumentLabelVisibility.LONG
        const subsSysLongName = (ctx.conf().styleV(Sid.subsSystemInstNameVisibility) as InstrumentLabelVisibility)
                                === InstrumentLabelVisibility.LONG
        if (measure) {
            ctx.mutState().setFirstSystem(measure.sectionBreak() && !ctx.conf().isFloatMode())
            const layoutBreak = measure.sectionBreakElement()
            if (layoutBreak) {
                ctx.mutState().setFirstSystemIndent(ctx.state().firstSystem()
                                                    && ctx.conf().firstSystemIndent()
                                                    && layoutBreak.firstSystemIndentation())
                ctx.mutState().setStartWithLongNames(ctx.state().firstSystem() && firstSysLongName && layoutBreak.startWithLongNames())
            }
        } else {
            ctx.mutState().setStartWithLongNames(ctx.state().firstSystem() && firstSysLongName)
        }

        const system = SystemLayout.getNextSystem(ctx)

        for (const staff of system.staves()) {
            staff.skyline().clear()
        }

        const lcmTick = ctx.state().curMeasure()!.tick()
        const longNames = ctx.state().firstSystem() ? ctx.state().startWithLongNames() : subsSysLongName
        SystemLayout.setInstrumentNames(system, ctx, longNames, lcmTick)

        let curSysWidth = 0.0
        let layoutSystemMinWidth = 0.0
        const targetSystemWidth = ctx.conf().styleD(Sid.pagePrintableWidth) * DPI
        system.setWidth(targetSystemWidth)

        // save state of measure
        let breakMeasure: MeasureBase | null = null

        let oldSystem: System | null = null

        const prevMeasureState = new MeasureState()
        prevMeasureState.curHeader = ctx.state().curMeasure()!.header()
        prevMeasureState.curTrailer = ctx.state().curMeasure()!.trailer()

        const systemLock = ctx.conf().viewMode() === LayoutMode.PAGE || ctx.conf().viewMode() === LayoutMode.SYSTEM
            ? ctx.dom().systemLocks().lockStartingAt(ctx.state().curMeasure()!) : null

        while (ctx.state().curMeasure()) { // collect measure for system
            const curMB = ctx.mutState().curMeasure()!
            oldSystem = curMB.system()
            system.appendMeasure(curMB)
            if (curMB.isMeasure()) {
                const m = curMB as Measure
                if (!(oldSystem && oldSystem.page() && oldSystem.page() !== ctx.state().page())) {
                    MeasureLayout.computePreSpacingItems(m, ctx)
                }

                if (SystemLayout.measureHasCrossStuffOrModifiedBeams(m)) {
                    SystemLayout.updateCrossBeams(system, ctx)
                }

                if (m.isFirstInSystem()) {
                    layoutSystemMinWidth = curSysWidth
                    SystemLayout.layoutSystem(system, ctx, curSysWidth, ctx.state().firstSystem(), ctx.state().firstSystemIndent())
                    MeasureLayout.addSystemHeader(m, ctx.state().firstSystem(), ctx)
                } else {
                    const prev = ctx.state().prevMeasure()!
                    const createHeader = prev.isHBox() && (prev as HBox).createSystemHeader()
                    if (createHeader) {
                        MeasureLayout.addSystemHeader(m, false, ctx)
                    } else if (m.header()) {
                        MeasureLayout.removeSystemHeader(m)
                    }
                }

                MeasureLayout.createEndBarLines(m, true, ctx)
                if (m.noBreak() || systemLock) {
                    MeasureLayout.removeSystemTrailer(m, ctx)
                } else {
                    MeasureLayout.addSystemTrailer(m, m.nextMeasure(), ctx)
                }

                MeasureLayout.setRepeatCourtesiesAndParens(m, ctx)

                MeasureLayout.updateGraceNotes(m, ctx)

                if (!systemLock) {
                    curSysWidth = HorizontalSpacing.updateSpacingForLastAddedMeasure(system)
                }
            } else if (curMB.isHBox()) {
                if (!systemLock) {
                    curSysWidth = HorizontalSpacing.updateSpacingForLastAddedMeasure(system)
                }
            } else {
                // vbox:
                MeasureLayout.getNextMeasure(ctx)
                SystemLayout.layout2(system, ctx) // compute staff distances
                return system
            }

            const doBreak = !systemLock && system.measures().length > 1 && curSysWidth > targetSystemWidth
                            && !ctx.state().prevMeasure()!.noBreak()
            if (doBreak) {
                breakMeasure = ctx.mutState().curMeasure()
                system.removeLastMeasure()
                ctx.mutState().curMeasure()!.setParent(oldSystem)
                while (ctx.state().prevMeasure() && ctx.state().prevMeasure()!.noBreak() && system.measures().length > 1) {
                    // remove however many measures are grouped with nobreak, working backwards
                    // but if too many are grouped, stop before we get 0 measures left on system
                    // TODO: intelligently break group into smaller groups instead
                    ctx.mutState().setTick(ctx.state().tick().minus(ctx.state().curMeasure()!.ticks()))
                    ctx.mutState().setMeasureNo(ctx.state().curMeasure()!.no())

                    ctx.mutState().setNextMeasure(ctx.mutState().curMeasure())
                    ctx.mutState().setCurMeasure(ctx.mutState().prevMeasure())
                    ctx.mutState().setPrevMeasure(ctx.mutState().curMeasure()!.prev())

                    system.removeLastMeasure()
                    ctx.mutState().curMeasure()!.setParent(oldSystem)
                }
                break
            }

            if (oldSystem && system !== oldSystem && ctx.state().systemList().includes(oldSystem)) {
                oldSystem.clear()
            }

            const prevM = ctx.state().prevMeasure()
            if (prevM && prevM.isMeasure() && prevM.system() === system) {
                //
                // now we know that the previous measure is not the last
                // measure in the system and we finally can create the end barline for it
                const m = prevM as Measure
                MeasureLayout.createEndBarLines(m, false, ctx)
                if (m.trailer()) {
                    MeasureLayout.removeSystemTrailer(m, ctx)
                }
                MeasureLayout.setRepeatCourtesiesAndParens(m, ctx)
                MeasureLayout.updateGraceNotes(m, ctx)
                if (!systemLock) {
                    curSysWidth = HorizontalSpacing.updateSpacingForLastAddedMeasure(system)
                }
                const cm = ctx.state().curMeasure()!
                if (cm.isMeasure()) {
                    MeasureLayout.updateKeySignatures(cm as Measure, ctx)
                }
            }

            let mb: MeasureBase | null = ctx.state().curMeasure()!
            const next = mb.nextMM()
            let lineBreak = false
            switch (ctx.conf().viewMode()) {
            case LayoutMode.PAGE:
            case LayoutMode.SYSTEM:
                lineBreak = mb.pageBreak() || mb.lineBreak() || mb.sectionBreak() || mb.isEndOfSystemLock()
                            || (!!next && next.isStartOfSystemLock())
                break
            case LayoutMode.FLOAT:
            case LayoutMode.LINE:
            case LayoutMode.HORIZONTAL_FIXED:
                lineBreak = false
                break
            }

            // preserve state of next measure (which is about to become current measure)
            if (ctx.state().nextMeasure()) {
                let nmb = ctx.mutState().nextMeasure()!
                if (nmb.isMeasure() && ctx.conf().styleB(Sid.createMultiMeasureRests)) {
                    const nm = nmb as Measure
                    if (nm.hasMMRest()) {
                        nmb = nm.mmRest()!
                    }
                }
                if (nmb.isMeasure()) {
                    prevMeasureState.clear()
                    prevMeasureState.measure = nmb as Measure
                    prevMeasureState.measurePos = nmb.x()
                    prevMeasureState.measureWidth = nmb.width()
                    for (let seg = (nmb as Measure).first(); seg; seg = seg.next()) {
                        prevMeasureState.elementPositions.set(seg, seg.ldata().pos())
                        for (const item of seg.annotations()) {
                            if (item.isHarmony() || item.isFretDiagram()) {
                                prevMeasureState.elementPositions.set(item, item.ldata().pos())
                            }
                        }
                    }
                }
                if (!ctx.state().curMeasure()!.noBreak()) {
                    // current measure is not a nobreak,
                    // so next measure could possibly start a system
                    prevMeasureState.curHeader = nmb.header()
                }
                if (!nmb.noBreak()) {
                    // next measure is not a nobreak
                    // so it could possibly end a system
                    prevMeasureState.curTrailer = nmb.trailer()
                }
            }

            MeasureLayout.getNextMeasure(ctx)

            mb = ctx.state().curMeasure()
            if (lineBreak || !mb || mb.isVBoxBase()) {
                break
            }
        }

        if (ctx.state().endTick().lt(ctx.state().prevMeasure()!.tick())) {
            // we've processed the entire range
            // but we need to continue layout until we reach a system whose last measure is the same as previous layout
            const curMB = ctx.mutState().curMeasure()
            let m = curMB && curMB.isMeasure() ? curMB as Measure : null
            const curMeasureMayHaveJoinedBeams = !!m && BeamLayout.measureMayHaveBeamsJoinedIntoNext(m)
            if (ctx.state().prevMeasure() === ctx.state().systemOldMeasure() && !curMeasureMayHaveJoinedBeams) {
                // this system ends in the same place as the previous layout
                // so we can stop
                // but we may need to fix the start repeat barline
                if (m) {
                    if (m.repeatStart()) {
                        const s = m.findSegmentR(SegmentType.StartRepeatBarLine, new Fraction(0, 1))
                        if (s && !s.enabled()) {
                            s.setEnabled(true)
                        }
                    }
                    const pbmb = ctx.state().prevMeasure()!.mbWithPrecedingSectionBreak()!
                    const localFirstSystem = pbmb.sectionBreak() && !ctx.conf().isMode(LayoutMode.FLOAT)
                    const nm = breakMeasure ? breakMeasure : m
                    if (prevMeasureState.curHeader) {
                        MeasureLayout.addSystemHeader(m, localFirstSystem, ctx)
                    } else {
                        MeasureLayout.removeSystemHeader(m)
                    }
                    for (;;) {
                        // TODO: what if the nobreak group takes the entire system - is this correct?
                        if (prevMeasureState.curTrailer && !m.noBreak()) {
                            MeasureLayout.addSystemTrailer(m, m.nextMeasure(), ctx)
                        } else {
                            MeasureLayout.removeSystemTrailer(m, ctx)
                        }

                        MeasureLayout.setRepeatCourtesiesAndParens(m, ctx)

                        MeasureLayout.updateGraceNotes(m, ctx)

                        prevMeasureState.restoreMeasure()
                        MeasureLayout.layoutMeasureElements(m, ctx)
                        BeamLayout.restoreBeams(m, ctx)
                        SystemLayout.restoreOldSystemLayout(m.system()!, ctx)
                        if (m === nm || !m.noBreak()) {
                            break
                        }
                        m = m.nextMeasure()!
                    }
                }
                ctx.mutState().setRangeDone(true)
            }
        }

        if (ctx.dom().allStavesInvisible()) {
            return system
        }

        /*************************************************************
         * SYSTEM NOW HAS A COMPLETE SET OF MEASURES
         * Now perform all operation to finalize system.
         * **********************************************************/

        // Break cross-measure beams
        const pmb = ctx.state().prevMeasure()
        if (pmb && pmb.isMeasure()) {
            BeamLayout.breakCrossMeasureBeams(pmb as Measure, ctx)
        }

        // hide empty staves
        SystemLayout.hideEmptyStaves(system, ctx, ctx.state().firstSystem())
        // Relayout system to account for newly hidden/unhidden staves
        for (const mb of system.measures()) {
            if (mb.isMeasure()) {
                for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                    seg.createShapes()
                }
            }
        }
        SystemLayout.layoutSystem(system, ctx, layoutSystemMinWidth, ctx.state().firstSystem(), ctx.state().firstSystemIndent())

        // Create end barlines and system trailer if needed (cautionary time/key signatures etc)
        const lm = system.lastMeasure()
        if (lm) {
            MeasureLayout.createEndBarLines(lm, true, ctx)
            const nm = lm.nextMeasure()
            if (nm) {
                MeasureLayout.addSystemTrailer(lm, nm, ctx)
            }
        }

        SystemLayout.updateTimeSigAboveStavesXPos(system, ctx)

        // Recompute spacing to account for the last changes (barlines, hidden staves, etc)
        curSysWidth = HorizontalSpacing.computeSpacingForFullSystem(system)

        if (curSysWidth > targetSystemWidth) {
            curSysWidth = HorizontalSpacing.squeezeSystemToFit(system, curSysWidth, targetSystemWidth)
        }

        if (SystemLayout.shouldBeJustified(system, curSysWidth, targetSystemWidth, ctx)) {
            HorizontalSpacing.justifySystem(system, curSysWidth, targetSystemWidth)
        }

        SystemLayout.clearBigTimeSigNotShown(system, ctx)

        // LAYOUT MEASURES
        let createBrackets = false
        for (const mb of system.measures()) {
            if (mb.isMeasure()) {
                mb.setParent(system)
                const m = mb as Measure
                MeasureLayout.layoutMeasureElements(m, ctx)
                MeasureLayout.layoutStaffLines(m, ctx)
                if (createBrackets) {
                    SystemLayout.addBrackets(system, m, ctx)
                    createBrackets = false
                }
            } else if (mb.isHBox()) {
                const curHBox = mb as HBox
                TLayout.layoutMeasureBase(curHBox, ctx)
                createBrackets = curHBox.createSystemHeader()
            }
        }

        SystemLayout.layoutSystemElements(system, ctx)
        SystemLayout.layout2(system, ctx) // compute staff distances

        // TODO: now that the code at the top of this function does this same backwards search,
        // we might be able to eliminate this block
        // but, lc might be used elsewhere so we need to be careful
        if (ctx.state().rangeDone() && oldSystem && oldSystem.measures().length && oldSystem.measures()[0].tick().ge(system.endTick())
            && !(oldSystem.page() && oldSystem.page() !== ctx.state().page())) {
            SystemLayout.restoreOldSystemLayout(oldSystem, ctx)
        }

        return system
    }

    private static shouldBeJustified(system: System, curSysWidth: number, targetSystemWidth: number, ctx: LayoutContext): boolean {
        let shouldJustify = true
        const measures = system.measures()
        const lm = measures[measures.length - 1]
        if ((curSysWidth / targetSystemWidth) < ctx.conf().styleD(Sid.lastSystemFillLimit)) {
            shouldJustify = false
            let lastMb: MeasureBase | null = ctx.state().curMeasure()

            // For systems with a section break, don't justify
            if (lm && lm.sectionBreak()) {
                lastMb = null
            }

            // Justify if system is followed by a measure or HBox
            while (lastMb) {
                if (lastMb.isMeasure() || lastMb.isHBox()) {
                    shouldJustify = true
                    break
                }
                // Frames can contain section breaks too, account for that here
                if (lastMb.sectionBreak()) {
                    shouldJustify = false
                    break
                }
                lastMb = lastMb.nextMeasure()
            }
        }
        // MScore::noHorizontalStretch is false
        return shouldJustify
    }

    private static getNextSystem(ctx: LayoutContext): System {
        const isVBox = ctx.state().curMeasure()!.isVBox()
        let system: System
        if (ctx.state().systemList().length === 0) {
            system = Factory.createSystem(ctx.mutDom().dummyParent().page())
            ctx.mutState().setSystemOldMeasure(null)
        } else {
            system = ctx.mutState().systemList().shift()!
            const ms = system.measures()
            ctx.mutState().setSystemOldMeasure(ms.length === 0 ? null : ms[ms.length - 1])
            system.clear() // remove measures from system
        }
        ctx.mutDom().systems().push(system)
        if (!isVBox) {
            const nstaves = ctx.dom().nstaves()
            system.adjustStavesNumber(nstaves)
            for (let i = 0; i < nstaves; ++i) {
                system.staff(i)!.setShow(ctx.dom().staff(i)!.show())
            }
        }
        return system
    }

    static hideEmptyStaves(system: System, ctx: LayoutContext, isFirstSystem: boolean): void {
        if (ctx.dom().nstaves() === 0) {
            return
        }

        if (ctx.dom().nstaves() === 1) {
            const show = ctx.dom().staves()[0].show()
            system.staves()[0].setShow(show)
            return
        }

        const stick = system.first()!.tick()
        const etick = system.last()!.endTick()
        const spanners = toIntervals(ctx.dom().spannerMap().findOverlapping(stick.ticks(), etick.ticks() - 1))

        const globalHideIfEmpty = ctx.conf().styleB(Sid.hideEmptyStaves)
                                  && !(isFirstSystem && ctx.conf().styleB(Sid.dontHideStavesInFirstSystem))

        const overrides = { hasSystemSpecificOverrides: false }
        let systemIsEmpty = true

        let staffIdx = 0
        for (const staff of ctx.dom().staves()) {
            const ss = system.staff(staffIdx)!
            if (!staff.show()) {
                ss.setShow(false)
                ++staffIdx
                continue
            }

            const hideMode = computeHideMode(system, staff, staffIdx, globalHideIfEmpty, overrides)
            const show = computeShowSysStaff(system, staff, staffIdx, stick, spanners, hideMode)

            ss.setShow(show)
            if (show) {
                systemIsEmpty = false
            }
            ++staffIdx
        }

        let firstVisible: Staff | null = null
        if (systemIsEmpty) {
            for (const staff of ctx.dom().staves()) {
                const ss = system.staff(staff.idx())!
                if (staff.showIfEntireSystemEmpty() && !ss.show()) {
                    ss.setShow(true)
                    systemIsEmpty = false
                } else if (!firstVisible && staff.show()) {
                    firstVisible = staff
                }
            }
        }
        // don’t allow a complete empty system
        if (systemIsEmpty) {
            const staff = firstVisible ? firstVisible : ctx.dom().staves()[0]
            const ss = system.staff(staff.idx())!
            ss.setShow(true)
        }
    }

    private static updateTimeSigAboveStavesXPos(system: System, ctx: LayoutContext): void {
        if ((ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) !== TimeSigPlacement.ABOVE_STAVES) {
            return
        }

        const nstaves = ctx.dom().nstaves()
        const centerOnBarline = ctx.conf().styleB(Sid.timeSigCenterOnBarline)

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            const measure = mb as Measure
            for (let seg = measure.first(); seg; seg = seg.next()) {
                if (!seg.isSegType(SegmentType.TimeSigType)) {
                    continue
                }

                const timeSigToKeep = new Set<TimeSig>()
                for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                    const timeSig = seg.element(staff2track(staffIdx)) as TimeSig | null
                    if (!timeSig || !timeSig.showOnThisStaff()) {
                        continue
                    }

                    timeSigToKeep.add(timeSig)
                    if (system.staff(staffIdx)!.show()) {
                        continue
                    }

                    const nextVisStaff = system.nextVisibleStaff(staffIdx)
                    if (nextVisStaff === nidx) {
                        continue
                    }

                    const nextVisTimeSig = seg.element(staff2track(nextVisStaff)) as TimeSig | null
                    if (nextVisTimeSig) {
                        timeSigToKeep.add(nextVisTimeSig)
                    }
                }

                let prevBarlineSeg: Segment | null = null
                let prevRepeatAnnounceTimeSigSeg: Segment | null = null
                if (centerOnBarline) {
                    for (let prevSeg = seg.prev1(); prevSeg && prevSeg.tick().eq(seg.tick()); prevSeg = prevSeg.prev1()) {
                        if (prevSeg.isEndBarLineType()) {
                            prevBarlineSeg = prevSeg
                        } else if (prevSeg.isTimeSigRepeatAnnounceType()) {
                            prevRepeatAnnounceTimeSigSeg = prevSeg
                        }
                    }
                }

                for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                    const timeSig = seg.element(staff2track(staffIdx)) as TimeSig | null
                    if (!timeSig) {
                        continue
                    }
                    const leftParen = timeSig.leftParen()
                    const rightParen = timeSig.rightParen()
                    if (!timeSigToKeep.has(timeSig)) {
                        timeSig.mutldata().reset() // Eliminates the shape
                        if (leftParen) {
                            leftParen.mutldata().reset()
                        }
                        if (rightParen) {
                            rightParen.mutldata().reset()
                        }
                        continue
                    }

                    if (prevBarlineSeg && prevBarlineSeg.system() === system && !prevRepeatAnnounceTimeSigSeg) {
                        // Center timeSig on its segment
                        const bbox = timeSig.ldata().bbox()
                        const newXPos = -0.5 * (bbox.right() + bbox.left())
                        timeSig.mutldata().setPosX(newXPos)
                    } else if (!seg.isTimeSigRepeatAnnounceType()) {
                        // Left-align to parenthesis if present
                        if (leftParen) {
                            const xLeftParens = leftParen.x() + leftParen.ldata().bbox().left()
                            timeSig.mutldata().moveX(-xLeftParens)
                        }
                    } else {
                        // TimeSigRepeatAnnounce: right-align to segment
                        let xRight = timeSig.shape().right() + timeSig.x()
                        if (leftParen) {
                            xRight = Math.max(xRight, leftParen.ldata().bbox().right() + leftParen.x())
                        }
                        if (rightParen) {
                            xRight = Math.max(xRight, rightParen.ldata().bbox().right() + rightParen.x())
                        }
                        timeSig.mutldata().moveX(-xRight)
                    }
                }

                seg.createShapes()
            }
        }
    }

    private static clearBigTimeSigNotShown(system: System, ctx: LayoutContext): void {
        if ((ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) === TimeSigPlacement.NORMAL) {
            return
        }

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                if (!seg.isSegType(SegmentType.TimeSigType)) {
                    continue
                }
                for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                    const ts = seg.element(staff2track(staffIdx)) as TimeSig | null
                    if (!ts) {
                        continue
                    }
                    if (!ts.showOnThisStaff() || ts.effectiveStaffIdx() === -1) {
                        ts.mutldata().reset() // Deletes shape
                    }
                }
            }
        }
    }

    private static autoplaceHarmony(harmony: EngravingItem): void {
        const fdParent = harmony.parent()!.isFretDiagram() ? harmony.parent() as FretDiagram : null
        if (fdParent && !fdParent.visible()) {
            harmony.mutldata().moveY(-fdParent.pos().y())
        }
        Autoplace.autoplaceSegmentElement(harmony, harmony.mutldata())
    }

    private static layoutFretDiagrams(elements: ElementsToLayout, system: System, ctx: LayoutContext): void {
        const fretDiagrams = elements.fretDiagrams as FretDiagram[]
        const harmonies = elements.harmonies as Harmony[]
        if (!ctx.conf().styleB(Sid.verticallyAlignChordSymbols)) {
            for (const fretDiag of fretDiagrams) {
                Autoplace.autoplaceSegmentElement(fretDiag, fretDiag.mutldata())
            }

            for (const harmony of harmonies) {
                SystemLayout.autoplaceHarmony(harmony)
            }

            for (const fretDiag of fretDiagrams) {
                const harmony = fretDiag.harmony()
                if (harmony) {
                    const skl = system.staff(fretDiag.staffIdx())!.skyline().north()
                    const s = fretDiag.segment()!
                    const harmShape = harmony.ldata().shape().translated(harmony.pos().plus(fretDiag.pos()).plus(s.pos())
                        .plus(s.measure().pos()))
                    skl.add(harmShape)
                }
            }

            return
        }

        // Only vertically align one fd per tick & staff
        const key = (e: EngravingItem): string => `${e.tick().ticks()}:${e.staffIdx()}`
        const fretHarmonyPositions = new Set<string>()
        const fretItemsAlign: EngravingItem[] = []
        const fretOrHarmonyItemsNoAlign: EngravingItem[] = []
        let harmonyItemsAlign: Harmony[] = [...harmonies]

        for (const fd of fretDiagrams) {
            if (fretHarmonyPositions.has(key(fd))) {
                fretOrHarmonyItemsNoAlign.push(fd)
                const fdh = fd.harmony()
                if (fdh) {
                    harmonyItemsAlign = harmonyItemsAlign.filter(h => h !== fdh)
                    fretOrHarmonyItemsNoAlign.push(fdh)
                }
                continue
            }

            TLayout.layoutFretDiagram(fd, ctx)
            Autoplace.autoplaceSegmentElement(fd, fd.mutldata())
            fretItemsAlign.push(fd)
            fretHarmonyPositions.add(key(fd))
        }

        // Find harmony with no fret diagram at the same tick as a fret diagram
        for (const h of harmonies) {
            if (h.getParentFretDiagram()) {
                continue
            }
            if (fretHarmonyPositions.has(key(h))) {
                harmonyItemsAlign = harmonyItemsAlign.filter(x => x !== h)
                fretOrHarmonyItemsNoAlign.push(h)
                continue
            }

            Autoplace.autoplaceSegmentElement(h, h.mutldata())
            fretHarmonyPositions.add(key(h))
        }

        // align 1 fret diagram per tick & staff
        AlignmentLayout.alignItemsForSystem(fretItemsAlign, system)

        SystemLayout.layoutHarmonies(harmonyItemsAlign, system, ctx)

        // autoplace everything else
        for (const item of fretOrHarmonyItemsNoAlign) {
            if (item.isFretDiagram()) {
                Autoplace.autoplaceSegmentElement(item, item.mutldata())
                const harmony = (item as FretDiagram).harmony()
                if (harmony) {
                    SystemLayout.autoplaceHarmony(harmony)
                }
            } else if (item.isHarmony()) {
                SystemLayout.autoplaceHarmony(item)
            }
        }
    }

    private static layoutHarmonies(harmonies: readonly EngravingItem[], system: System, ctx: LayoutContext): void {
        if (!ctx.conf().styleB(Sid.verticallyAlignChordSymbols)) {
            for (const harmony of harmonies) {
                SystemLayout.autoplaceHarmony(harmony)
            }
            return
        }

        // Only vertically align one chord symbol per tick & staff
        const harmonyPositions = new Set<string>()
        const harmonyItemsAlign: EngravingItem[] = []
        const harmonyItemsNoAlign: EngravingItem[] = []

        for (const h of harmonies) {
            const key = `${h.tick().ticks()}:${h.staffIdx()}`
            if (harmonyPositions.has(key)) {
                harmonyItemsNoAlign.push(h)
                continue
            }

            TLayout.layoutItem(h, ctx)
            SystemLayout.autoplaceHarmony(h)
            harmonyItemsAlign.push(h)
            harmonyPositions.add(key)
        }

        AlignmentLayout.alignItemsForSystem(harmonyItemsAlign, system)

        for (const harmony of harmonyItemsNoAlign) {
            SystemLayout.autoplaceHarmony(harmony)
        }
    }

    private static layoutVoltas(elementsToLayout: ElementsToLayout, ctx: LayoutContext): void {
        const system = elementsToLayout.system

        SystemLayout.processLines(system, ctx, elementsToLayout.voltas)

        const alignedVoltas = new Set<Spanner>()
        for (let i = 0; i < elementsToLayout.voltas.length; ++i) {
            let volta1 = elementsToLayout.voltas[i]
            if (alignedVoltas.has(volta1)) {
                continue
            }

            const voltasToAlign: EngravingItem[] = [volta1.backSegment()]

            for (let j = i + 1; j < elementsToLayout.voltas.length; ++j) {
                const volta2 = elementsToLayout.voltas[j]
                if (volta2.staffIdx() === volta1.staffIdx() && volta2.tick().eq(volta1.tick2())) {
                    voltasToAlign.push(volta2.frontSegment())
                    volta1 = volta2
                }
            }

            if (voltasToAlign.length > 1) {
                AlignmentLayout.alignItemsGroup(voltasToAlign, system)
                for (const vs of voltasToAlign) {
                    alignedVoltas.add((vs as SpannerSegment).spanner()!)
                }
            }
        }
    }

    private static layoutSticking(stickings: readonly EngravingItem[], system: System, ctx: LayoutContext): void {
        if (!stickings.length) {
            return
        }

        for (const sticking of stickings) {
            TLayout.layoutItem(sticking, ctx)
        }

        AlignmentLayout.alignItemsForSystem(stickings, system)
    }

    private static layoutLyrics(elements: ElementsToLayout, ctx: LayoutContext): void {
        const system = elements.system
        // NOTE: in continuous view, this means we layout spanners for the entire score.
        // TODO: find way to optimize this and only layout where necessary.
        const measures = system.measures()
        const stick = measures[0].tick()
        const etick = measures[measures.length - 1].endTick()

        for (const sp of elements.partialLyricsLines) {
            TLayout.layoutSystem(sp, system, ctx)
        }

        //-------------------------------------------------------------
        // Lyric
        //-------------------------------------------------------------
        // Layout lyrics dashes and melisma
        // NOTE: loop on a *copy* of unmanagedSpanners because in some cases
        // the underlying operation may invalidate some of the iterators.
        const dashOnFirstNoteSyllable = ctx.conf().styleB(Sid.lyricsShowDashIfSyllableOnFirstNote)
        for (const sp of [...ctx.dom().unmanagedSpanners()]) {
            if (!sp.systemFlag() && sp.staff() && !sp.staff()!.show()) {
                continue
            }
            const dashOnFirst = dashOnFirstNoteSyllable && !(sp as LyricsLine).isEndMelisma()
            if (sp.tick().ge(etick) || sp.tick2().lt(stick) || (sp.tick2().eq(stick) && !dashOnFirst)) {
                continue
            }
            TLayout.layoutSystem(sp, system, ctx)
        }
        LyricsLayout.computeVerticalPositions(system, ctx)
    }

    static layoutSystemElements(system: System, ctx: LayoutContext): void {
        if (ctx.dom().nstaves() === 0) {
            return
        }

        const elementsToLayout = new ElementsToLayout(system)

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }

            if (ctx.conf().isLinearMode() && (mb.tick().lt(ctx.state().startTick()) || mb.tick().gt(ctx.state().endTick()))) {
                continue
            }

            const measure = mb as Measure
            MeasureLayout.layoutMeasureNumber(measure, ctx)
            // TODO(port): MeasureLayout::layoutMMRestRange, layoutPlayCountText
            MeasureLayout.layoutTimeTickAnchors(measure, ctx)

            SystemLayout.collectElementsToLayout(measure, elementsToLayout, ctx)
        }

        const sl = elementsToLayout.segments
        if (sl.length === 0) {
            return
        }

        //-------------------------------------------------------------
        // layout grace notes groups
        //-------------------------------------------------------------

        for (const chord of elementsToLayout.chords) {
            TLayout.layoutGraceNotesGroup2(chord.graceNotesBefore())
            TLayout.layoutGraceNotesGroup2(chord.graceNotesAfter())
        }

        //-------------------------------------------------------------
        // layout non-cross staff beams
        //-------------------------------------------------------------

        for (const cr of elementsToLayout.chordRests) {
            BeamLayout.layoutNonCrossBeams(cr, ctx)
        }

        RestLayout.alignRests(elementsToLayout.system, ctx)
        RestLayout.checkFullMeasureRestCollisions(elementsToLayout.system, ctx)

        for (const bl of elementsToLayout.barlines) {
            TLayout.updateBarlineShape(bl, bl.mutldata(), ctx)
        }

        //-------------------------------------------------------------
        // create skylines
        //-------------------------------------------------------------

        SystemLayout.createSkylines(elementsToLayout, ctx)

        //-------------------------------------------------------------
        // layout ties
        //-------------------------------------------------------------

        SystemLayout.layoutTiesAndBends(elementsToLayout, ctx)

        if (ctx.conf().isLinearMode()) {
            SystemLayout.doLayoutNoteSpannersLinear(system, ctx)
        }

        //-------------------------------------------------------------
        // layout articulations
        //-------------------------------------------------------------

        for (const c of elementsToLayout.chords) {
            ChordLayout.layoutArticulations(c, ctx)
            ChordLayout.layoutArticulations2(c, ctx)
            ChordLayout.layoutChordBaseFingering(c, system, ctx)
        }

        //-------------------------------------------------------------
        // layout tuplets
        //-------------------------------------------------------------

        SystemLayout.layoutTuplets(elementsToLayout.chordRests, ctx)

        //-------------------------------------------------------------
        // Drumline sticking
        //-------------------------------------------------------------

        SystemLayout.collectSpannersToLayout(elementsToLayout, ctx)

        //-------------------------------------------------------------
        // layout slurs
        //-------------------------------------------------------------

        SystemLayout.processLines(system, ctx, elementsToLayout.slurs)
        for (const sp of elementsToLayout.slurs) {
            const slur = sp as Slur
            const scr = slur.startElement() as ChordRest | null
            const ecr = slur.endElement() as ChordRest | null
            if (scr && scr.isChord()) {
                ChordLayout.layoutArticulations3(scr as Chord, slur, ctx)
            }
            if (ecr && ecr.isChord()) {
                ChordLayout.layoutArticulations3(ecr as Chord, slur, ctx)
            }
            if (slur.isHammerOnPullOff()) {
                const staffType = slur.staff()!.staffType(slur.tick())
                if ((staffType.isTabStaff() && ctx.conf().styleB(Sid.hopoAlignLettersTabStaves))
                    || (!staffType.isTabStaff() && ctx.conf().styleB(Sid.hopoAlignLettersStandardStaves))) {
                    AlignmentLayout.alignHopoLetters(slur as HammerOnPullOff, system)
                }
            }
        }

        SystemLayout.processLines(system, ctx, elementsToLayout.trills)

        SystemLayout.layoutSticking(elementsToLayout.stickings, system, ctx)

        for (const item of elementsToLayout.fermatasAndTremoloBars) {
            TLayout.layoutItem(item, ctx)
        }

        for (const item of elementsToLayout.figuredBass) {
            TLayout.layoutItem(item, ctx)
            if (item.autoplace()) {
                Autoplace.autoplaceSegmentElement(item, item.mutldata(), item.placeAbove(), true)
            }
        }

        SystemLayout.layoutDynamicExpressionAndHairpins(elementsToLayout, ctx)

        SystemLayout.processLines(system, ctx, elementsToLayout.allOtherSpanners)

        //-------------------------------------------------------------
        // Measure Numbers
        //-------------------------------------------------------------

        for (const mno of elementsToLayout.measureNumbers) {
            if (!mno.visible()) {
                continue
            }
            Autoplace.autoplaceMeasureElement(mno, mno.mutldata())
            system.staff(mno.staffIdx())!.skyline().add(mno.ldata().bbox().translated(mno.measure()!.pos().plus(mno.pos())
                .plus(mno.staffOffset())), mno)
        }

        // TODO(port): MMRestRange

        SystemLayout.processLines(system, ctx, elementsToLayout.ottavas)
        SystemLayout.processLines(system, ctx, elementsToLayout.pedal, /*align=*/ true)

        //-------------------------------------------------------------
        // Lyric
        //-------------------------------------------------------------

        SystemLayout.layoutLyrics(elementsToLayout, ctx)

        for (const item of elementsToLayout.harpDiagrams) {
            TLayout.layoutItem(item, ctx)
        }

        const hasFretDiagram = elementsToLayout.fretDiagrams.length > 0
        if (!hasFretDiagram) {
            SystemLayout.layoutHarmonies(elementsToLayout.harmonies, system, ctx)
        }

        for (const item of elementsToLayout.staffText) {
            TLayout.layoutItem(item, ctx)
        }
        for (const item of elementsToLayout.instrChanges) {
            TLayout.layoutItem(item, ctx)
        }
        for (const item of elementsToLayout.playTechCapoStringTunTripletFeel) {
            TLayout.layoutItem(item, ctx)
        }

        if (hasFretDiagram) {
            SystemLayout.layoutFretDiagrams(elementsToLayout, system, ctx)
        }

        for (const item of elementsToLayout.systemText) {
            TLayout.layoutItem(item, ctx)
        }

        SystemLayout.layoutVoltas(elementsToLayout, ctx)

        for (const item of elementsToLayout.rehMarks) {
            TLayout.layoutItem(item, ctx)
        }

        const tempoElementsToAlign: EngravingItem[] = []
        for (const item of elementsToLayout.tempoText) {
            TLayout.layoutItem(item, ctx)
            tempoElementsToAlign.push(item)
        }

        SystemLayout.processLines(system, ctx, elementsToLayout.tempoChangeLines)
        for (const spannerSeg of system.spannerSegments()) {
            if (spannerSeg.isGradualTempoChangeSegment()) {
                tempoElementsToAlign.push(spannerSeg)
            }
        }

        for (const item of elementsToLayout.playCountText) {
            TLayout.layoutItem(item, ctx)
            if (item.autoplace()) {
                Autoplace.autoplaceSegmentElement(item, item.mutldata())
            }
        }

        AlignmentLayout.alignItemsWithTheirSnappingChain(tempoElementsToAlign, system)

        for (const rehearsMark of elementsToLayout.rehMarks) {
            Autoplace.autoplaceSegmentElement(rehearsMark, rehearsMark.mutldata())
        }

        for (const item of elementsToLayout.markersAndJumps) {
            TLayout.layoutItem(item, ctx)
        }
        for (const item of elementsToLayout.images) {
            TLayout.layoutItem(item, ctx)
        }

        SystemLayout.layoutParenthesisAndBigTimeSigs(elementsToLayout)
    }

    private static layoutDynamicExpressionAndHairpins(elementsToLayout: ElementsToLayout, ctx: LayoutContext): void {
        const system = elementsToLayout.system
        const dynamicsExprAndHairpinsToAlign: EngravingItem[] = []

        for (const dynamic of elementsToLayout.dynamics) {
            TLayout.layoutItem(dynamic, ctx)
            if (dynamic.autoplace()) {
                Autoplace.autoplaceSegmentElement(dynamic, dynamic.mutldata())
                dynamicsExprAndHairpinsToAlign.push(dynamic)
            }
        }

        for (const e of elementsToLayout.expressions) {
            TLayout.layoutItem(e, ctx)
            if (e.addToSkyline()) {
                dynamicsExprAndHairpinsToAlign.push(e)
            }
        }

        SystemLayout.processLines(system, ctx, elementsToLayout.hairpins)

        for (const spannerSegment of system.spannerSegments()) {
            if (spannerSegment.isHairpinSegment()) {
                dynamicsExprAndHairpinsToAlign.push(spannerSegment)
            }
        }

        AlignmentLayout.alignItemsWithTheirSnappingChain(dynamicsExprAndHairpinsToAlign, system)
    }

    private static layoutParenthesisAndBigTimeSigs(elementsToLayout: ElementsToLayout): void {
        // TODO(port): parentheses
        for (const timeSig of elementsToLayout.timeSigAboveStaves) {
            Autoplace.autoplaceSegmentElement(timeSig, timeSig.mutldata())
        }
    }

    private static collectElementsToLayout(measure: Measure, elements: ElementsToLayout, ctx: LayoutContext): void {
        elements.measures.push(measure)
        const system = elements.system

        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            if (measure.showMeasureNumberOnStaff(staffIdx)) {
                const mno = measure.measureNumber(staffIdx) as MeasureNumber | null
                if (mno) {
                    elements.measureNumbers.push(mno)
                }
            }

            if (!system.staff(staffIdx)!.show()) {
                continue
            }

            // TODO(port): MMRestRange

            for (const item of measure.el()) {
                if (item.effectiveStaffIdx() === staffIdx && (item.isMarker() || item.isJump())) {
                    elements.markersAndJumps.push(item)
                }
            }
        }

        const nTracks = ctx.dom().ntracks()
        for (let s = measure.first(); s; s = s.next()) {
            if (s.isChordRestType() || s.annotations().length) {
                elements.segments.push(s)
            }

            for (let track = 0; track < nTracks;) {
                if (s.hasTimeSigAboveStaves()) {
                    const timeSig = s.element(track) as TimeSig | null
                    if (timeSig && timeSig.showOnThisStaff()) {
                        elements.timeSigAboveStaves.push(timeSig)
                    }
                    track += VOICES
                    continue
                }
                if (!system.staff(track2staff(track))!.show()) {
                    track += VOICES
                    continue
                }
                if (s.isSegType(SegmentType.BarLineType)) {
                    const bl = s.element(track) as BarLine | null
                    if (bl) {
                        elements.barlines.push(bl)
                    }
                    track += VOICES
                    continue
                }
                if (s.isChordRestType()) {
                    const cr = s.element(track) as ChordRest | null
                    if (cr) {
                        elements.chordRests.push(cr)
                        if (cr.isChord()) {
                            elements.chords.push(cr as Chord)

                            const collectBends = (chord: Chord): void => {
                                for (const note of chord.notes()) {
                                    for (const sp of note.spannerBack()) {
                                        if (sp.isGuitarBend()) {
                                            elements.guitarBends.push(sp as GuitarBend)
                                        }
                                    }

                                    for (const sp of note.spannerFor()) {
                                        if (sp.isGuitarBend()) {
                                            const bend = sp as GuitarBend
                                            const endNote = bend.endNote()
                                            if (bend.bendType() === GuitarBendType.SLIGHT_BEND
                                                || (endNote && endNote.tick().ge(system.endTick()))) {
                                                elements.guitarBends.push(bend)
                                            }
                                        }
                                    }
                                }
                            }

                            const chord = cr as Chord
                            for (const grace of chord.graceNotesBefore()) {
                                collectBends(grace)
                            }
                            collectBends(chord)
                            for (const grace of chord.graceNotesAfter()) {
                                collectBends(grace)
                            }
                        }
                    }
                    ++track
                    continue
                }
                ++track
            }

            for (const item of s.annotations()) {
                if (!item.systemFlag() && !system.staff(item.staffIdx())!.show()) {
                    continue
                }
                switch (item.type()) {
                case ElementType.STICKING:
                    elements.stickings.push(item)
                    break
                case ElementType.FERMATA:
                case ElementType.TREMOLOBAR:
                    elements.fermatasAndTremoloBars.push(item)
                    break
                case ElementType.FIGURED_BASS:
                    elements.figuredBass.push(item)
                    break
                case ElementType.DYNAMIC:
                    elements.dynamics.push(item)
                    break
                case ElementType.EXPRESSION:
                    elements.expressions.push(item)
                    break
                case ElementType.HARP_DIAGRAM:
                    elements.harpDiagrams.push(item)
                    break
                case ElementType.FRET_DIAGRAM: {
                    elements.fretDiagrams.push(item)
                    const h = (item as FretDiagram).harmony()
                    if (h) {
                        elements.harmonies.push(h)
                    }
                    break
                }
                case ElementType.STAFF_TEXT:
                    elements.staffText.push(item)
                    break
                case ElementType.INSTRUMENT_CHANGE:
                    elements.instrChanges.push(item)
                    break
                case ElementType.PLAYTECH_ANNOTATION:
                case ElementType.CAPO:
                case ElementType.STRING_TUNINGS:
                case ElementType.TRIPLET_FEEL:
                    elements.playTechCapoStringTunTripletFeel.push(item)
                    break
                case ElementType.SYSTEM_TEXT:
                    elements.systemText.push(item)
                    break
                case ElementType.REHEARSAL_MARK:
                    elements.rehMarks.push(item)
                    break
                case ElementType.TEMPO_TEXT:
                    elements.tempoText.push(item)
                    break
                case ElementType.IMAGE:
                    elements.images.push(item)
                    break
                case ElementType.PARENTHESIS:
                    elements.parenthesis.push(item)
                    break
                case ElementType.HARMONY:
                    elements.harmonies.push(item)
                    break
                case ElementType.PLAY_COUNT_TEXT:
                    elements.playCountText.push(item)
                    break
                default:
                    break
                }
            }
        }
    }

    private static collectSpannersToLayout(elements: ElementsToLayout, ctx: LayoutContext): void {
        const system = elements.system
        const measures = system.measures()
        const stick = measures[0].tick()
        const etick = measures[measures.length - 1].endTick()

        const spanners = toIntervals(ctx.dom().spannerMap().findOverlapping(stick.ticks(), etick.ticks()))
        // C++ uses std::sort (not stable)
        spanners.sort((sp1, sp2) => (sp1.value.tick().lt(sp2.value.tick()) ? -1 : (sp2.value.tick().lt(sp1.value.tick()) ? 1 : 0)))

        for (const item of spanners) {
            const spanner = item.value
            if (!spanner.systemFlag() && !system.staff(spanner.staffIdx())!.show()) {
                continue
            }

            if (spanner.tick().ge(etick) || spanner.tick2().lt(stick)) {
                continue
            }

            if (spanner.tick2().eq(stick)) {
                if (spanner.isSlur() && !(spanner as Slur).isCrossStaff() && !(spanner as Slur).hasCrossBeams()) {
                    // Slur ending on first note of system
                    elements.slurs.push(spanner)
                }
                // TODO(port): pedals connecting to the next system
            } else {
                switch (spanner.type()) {
                case ElementType.SLUR:
                case ElementType.HAMMER_ON_PULL_OFF:
                    if (!(spanner as Slur).isCrossStaff() && !(spanner as Slur).hasCrossBeams()) {
                        elements.slurs.push(spanner)
                    }
                    break
                case ElementType.PEDAL:
                    elements.pedal.push(spanner)
                    break
                case ElementType.TRILL:
                    elements.trills.push(spanner)
                    break
                case ElementType.VOLTA:
                    elements.voltas.push(spanner)
                    break
                case ElementType.HAIRPIN:
                    elements.hairpins.push(spanner)
                    break
                case ElementType.GRADUAL_TEMPO_CHANGE:
                    elements.tempoChangeLines.push(spanner)
                    break
                case ElementType.PARTIAL_LYRICSLINE:
                    elements.partialLyricsLines.push(spanner)
                    break
                case ElementType.OTTAVA:
                    if (!spanner.staff()!.staffType().isTabStaff()) {
                        elements.ottavas.push(spanner)
                    }
                    break
                default:
                    elements.allOtherSpanners.push(spanner)
                    break
                }
            }
        }
    }

    private static createSkylines(elementsToLayout: ElementsToLayout, ctx: LayoutContext): void {
        const system = elementsToLayout.system
        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            const ss = system.staff(staffIdx)!
            const skyline = ss.skyline()
            skyline.clear()
            for (const m of elementsToLayout.measures) {
                const lines = m.staffLines(staffIdx)
                if (lines.addToSkyline()) {
                    ss.skyline().add(lines.ldata().bbox().translated(m.pos()), lines)
                }
                for (let s = m.first(); s; s = s.next()) {
                    if (!s.enabled()) {
                        continue
                    }
                    const p = s.pos().plus(m.pos())
                    if (s.isSegType(SegmentType.BarLineType)) {
                        const bl = s.element(staffIdx * VOICES) as BarLine | null
                        if (bl && bl.addToSkyline()) {
                            skyline.add(bl.shape().translated(bl.pos().plus(p).plus(bl.staffOffset())))
                        }
                    } else if (s.isSegType(SegmentType.TimeSigType)) {
                        const ts = s.element(staffIdx * VOICES) as TimeSig | null
                        if (ts && ts.addToSkyline() && ts.showOnThisStaff()) {
                            const timeSigPlacement = ts.style().styleV(Sid.timeSigPlacement) as TimeSigPlacement
                            if (timeSigPlacement !== TimeSigPlacement.ACROSS_STAVES) {
                                skyline.add(ts.shape().translate(ts.pos().plus(p).plus(ts.staffOffset())))
                            }
                        }
                    } else {
                        const strack = staffIdx * VOICES
                        const etrack = strack + VOICES
                        for (const e of s.elist()) {
                            if (!e) {
                                continue
                            }
                            const effectiveTrack = e.vStaffIdx() * VOICES + e.voice()
                            if (effectiveTrack < strack || effectiveTrack >= etrack) {
                                continue
                            }

                            // add element to skyline
                            if (e.addToSkyline()) {
                                const offset = e.staffOffset()
                                const shape = e.shape()
                                if (e.isChord()) {
                                    const chord = e as Chord
                                    const graceBefore = chord.graceNotesBefore()
                                    const graceAfter = chord.graceNotesAfter()
                                    if (!graceBefore.empty()) {
                                        skyline.add(graceBefore.shape().translate(graceBefore.pos().plus(p).plus(offset))) // hack to get the correct pos
                                    }
                                    if (!graceAfter.empty()) {
                                        skyline.add(graceAfter.shape().translate(graceAfter.pos().plus(p).plus(offset)))
                                    }

                                    // If present, add ornament cue note to skyline
                                    const ornament = chord.findOrnament() as Ornament | null
                                    if (ornament) {
                                        const cue = ornament.cueNoteChord()
                                        if (cue && cue.upNote().visible()) {
                                            skyline.add(cue.shape().translate(cue.pos().plus(p).plus(cue.staffOffset())))
                                        }
                                    }

                                    // Don't include cross-staff arpeggios
                                    shape.remove_if((sh) => {
                                        const it = sh.item()
                                        return !!it && (it.isArpeggio() || it.isChordBracket()) && it === chord.spanArpeggio()
                                    })
                                    const arp = chord.spanArpeggio() as Arpeggio | null
                                    if (arp) {
                                        const staffBbox = ss.bbox().clone()
                                        const arpBbox = arp.ldata().bbox().translated(e.pos().plus(p).plus(offset))
                                        if (chord.track() === arp.track()) {
                                            staffBbox.setTop(arpBbox.top())
                                        } else if (chord.track() === arp.endTrack()) {
                                            staffBbox.setBottom(arpBbox.bottom())
                                        }
                                        shape.add(arpBbox.intersected(staffBbox), arp)
                                    }
                                }
                                skyline.add(shape.translate(e.pos().plus(p).plus(offset)))
                            }

                            // add tremolo to skyline
                            if (e.isChord()) {
                                const ch = e as Chord
                                // tremoloSingleChord is added directly to chord shape
                                const t = ch.tremoloTwoChord()
                                if (t) {
                                    const c1 = t.chord1()
                                    const c2 = t.chord2()
                                    if (c1 && !c1.staffMove() && c2 && !c2.staffMove()) {
                                        if (t.chord() === e && t.addToSkyline()) {
                                            skyline.add(t.shape().translate(t.pos().plus(e.pos()).plus(p)))
                                        }
                                    }
                                }
                            }

                            // add beams to skline
                            if (e.isChordRest()) {
                                const cr = e as ChordRest
                                if (BeamLayout.isStartOfNonCrossBeam(cr)) {
                                    const b = cr.beam()!
                                    b.addSkyline(skyline)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private static layoutTuplets(chordRests: readonly ChordRest[], ctx: LayoutContext): void {
        const laidoutTuplets = new Set<Tuplet>()
        for (let i = chordRests.length - 1; i >= 0; --i) {
            const cr = chordRests[i]
            const tuplet = cr.topTuplet()
            if (!tuplet || laidoutTuplets.has(tuplet)) {
                continue
            }
            TupletLayout.layoutTupletAndNestedTuplets(tuplet, ctx) // this lays out also the inner tuplets
            laidoutTuplets.add(tuplet)
        }
    }

    private static layoutTiesAndBends(elementsToLayout: ElementsToLayout, ctx: LayoutContext): void {
        const system = elementsToLayout.system
        if (elementsToLayout.measures.length === 0) {
            return
        }
        const stick = elementsToLayout.measures[0].tick()
        for (const chord of elementsToLayout.chords) {
            for (const grace of chord.graceNotesBefore()) {
                SystemLayout.layoutTies(grace, system, stick, ctx)
            }
            SystemLayout.layoutTies(chord, system, stick, ctx)
            for (const grace of chord.graceNotesAfter()) {
                SystemLayout.layoutTies(grace, system, stick, ctx)
            }
        }

        GuitarDiveLayout.updateDiveSequences(elementsToLayout.guitarBends, ctx)

        for (const bend of elementsToLayout.guitarBends) {
            /* Bends which cross a system break are collected by both systems they touch, so we
             * lay out only the segment which belongs to this one: */
            TLayout.layoutGuitarBend(bend, ctx, system)
        }
    }

    private static layoutNoteAnchoredSpanners(system: System, chord: Chord): void {
        // Add all spanners attached to notes, otherwise these will be removed if outside of the layout range
        for (const note of chord.notes()) {
            for (const spanner of note.spannerFor()) {
                for (const spannerSeg of spanner.spannerSegments()) {
                    spannerSeg.setSystem(system)
                }
            }
        }
    }

    private static doLayoutNoteSpannersLinear(system: System, ctx: LayoutContext): void {
        const start = new Fraction(0, 1)
        for (let measure = system.firstMeasure(); measure; measure = measure.nextMeasure()) {
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (const e of segment.elist()) {
                    if (!e || !e.isChord()) {
                        continue
                    }
                    const c = e as Chord
                    for (const ch of c.graceNotes()) {
                        SystemLayout.layoutTies(ch, system, start, ctx)
                        SystemLayout.layoutNoteAnchoredSpanners(system, ch)
                    }
                    SystemLayout.layoutTies(c, system, start, ctx)
                    SystemLayout.layoutNoteAnchoredSpanners(system, c)
                }
            }
        }
    }

    private static processLines(system: System, ctx: LayoutContext, lines: readonly Spanner[], align = false): void {
        const segments: SpannerSegment[] = []
        for (const sp of lines) {
            const ss = TLayout.layoutSystem(sp, system, ctx) // create/layout spanner segment for this system
            if (ss && ss.autoplace()) {
                segments.push(ss)
            }
        }

        if (align && segments.length > 1) {
            const nstaves = system.staves().length
            const defaultY = segments[0].ldata().pos().y()
            const yAbove = new Array<number>(nstaves).fill(-Number.MAX_VALUE)
            const yBelow = new Array<number>(nstaves).fill(-Number.MAX_VALUE)

            for (const ss of segments) {
                if (ss.visible()) {
                    const above = !!ss.spanner() && ss.spanner().placeAbove()
                    const arr = above ? yAbove : yBelow
                    arr[ss.staffIdx()] = Math.max(arr[ss.staffIdx()], ss.ldata().pos().y())
                }
            }
            for (const ss of segments) {
                if (!ss.isStyled(Pid.OFFSET)) {
                    continue
                }
                const above = !!ss.spanner() && ss.spanner().placeAbove()
                const staffY = (above ? yAbove : yBelow)[ss.staffIdx()]
                if (staffY > -Number.MAX_VALUE) {
                    ss.mutldata().setPosY(staffY)
                } else {
                    ss.mutldata().setPosY(defaultY)
                }
            }
        }

        if (segments.length > 0 && segments[0].isSlurSegment()) {
            SlurTieLayout.adjustOverlappingSlurs(system.spannerSegments())
        }

        // TODO(port): harmonic mark / vibrato stacking

        //
        // add shapes to skyline
        //
        for (const ss of segments) {
            if (ss.addToSkyline()) {
                const stfIdx = ss.effectiveStaffIdx()
                if (stfIdx === -1) {
                    continue
                }
                system.staff(stfIdx)!.skyline().add(ss.shape().translate(ss.pos()))
                if (ss.isHammerOnPullOffSegment()) {
                    TLayout.layoutHammerOnPullOffSegment(ss as HammerOnPullOffSegment, ctx)
                }
            }
        }
    }

    private static layoutTies(ch: Chord, system: System, stick: Fraction, ctx: LayoutContext): void {
        const staff = system.staff(ch.staffIdx())!
        if (!staff.show()) {
            return
        }
        const stackedForwardTies: TieSegment[] = []
        const stackedBackwardTies: TieSegment[] = []
        for (const note of ch.notes()) {
            let t = note.tieFor()
            if (t && !t.isLaissezVib()) {
                const ts = SlurTieLayout.layoutTieFor(t, system)
                if (ts && ts.addToSkyline()) {
                    staff.skyline().add(ts.shape().translate(ts.pos()))
                    stackedForwardTies.push(ts)
                }
            }
            t = note.tieBack()
            if (t) {
                if (note.incomingPartialTie() || t.startNote()!.tick().lt(stick)) {
                    const ts = SlurTieLayout.layoutTieBack(t, system, ctx)
                    if (ts && ts.addToSkyline()) {
                        staff.skyline().add(ts.shape().translate(ts.pos()))
                        stackedBackwardTies.push(ts)
                    }
                }
            }
        }

        SlurTieLayout.layoutLaissezVibChord(ch, ctx)

        if (!ch.staffType()!.isTabStaff()) {
            SlurTieLayout.resolveVerticalTieCollisions(stackedForwardTies)
            SlurTieLayout.resolveVerticalTieCollisions(stackedBackwardTies)
        }
    }

    private static measureHasCrossStuffOrModifiedBeams(measure: Measure): boolean {
        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (!seg.isChordRestType()) {
                continue
            }
            for (const e of seg.elist()) {
                if (!e || !e.isChordRest()) {
                    continue
                }
                const beam = (e as ChordRest).beam()
                if (beam && (beam.cross() || beam.userModified())) {
                    return true
                }
                const c = e.isChord() ? e as Chord : null
                const trem = c ? c.tremoloTwoChord() : null
                if (trem) {
                    const c1 = trem.chord1()!
                    const c2 = trem.chord2()!
                    if (trem.userModified() || c1.staffMove() !== c2.staffMove()) {
                        return true
                    }
                }
                if (e.isChord() && (e as Chord).graceNotes().length) {
                    for (const grace of (e as Chord).graceNotes()) {
                        const gb = grace.beam()
                        if (gb && (gb.cross() || gb.userModified())) {
                            return true
                        }
                    }
                }
            }
        }
        return false
    }

    private static updateCrossBeams(system: System, ctx: LayoutContext): void {
        SystemLayout.layout2(system, ctx) // Computes staff distances, essential for the rest of the calculations
        // Update grace cross beams
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                if (!seg.isChordRestType()) {
                    continue
                }
                for (const e of seg.elist()) {
                    if (!e || !e.isChord()) {
                        continue
                    }
                    for (const grace of (e as Chord).graceNotes()) {
                        const gb = grace.beam()
                        if (gb && (gb.cross() || gb.userModified()) && gb.elements()[0] === grace) {
                            BeamLayout.layout(gb, ctx)
                        }
                    }
                }
            }
        }
        // Update normal chords cross beams and respective segments
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            let somethingChanged = false
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                if (!seg.isChordRestType()) {
                    continue
                }
                for (const e of seg.elist()) {
                    if (!e || !e.isChord()) {
                        continue
                    }
                    const chord = e as Chord
                    const beam = chord.beam()
                    if (beam && (beam.cross() || beam.userModified()) && beam.elements()[0] === chord) {
                        const prevUp = chord.up()
                        const stem = chord.stem()
                        const prevStemLength = stem ? stem.length() : 0.0
                        BeamLayout.layout(beam, ctx)
                        if (chord.up() !== prevUp || (stem && stem.length() !== prevStemLength)) {
                            // If the chord has changed direction needs to be re-laid out.
                            ChordLayout.layoutChords1(ctx, seg, chord.vStaffIdx())
                            somethingChanged = true
                        }
                    } else if (chord.tremoloTwoChord()) {
                        const t = chord.tremoloTwoChord()!
                        const c1 = t.chord1()!
                        const c2 = t.chord2()!
                        if (t.userModified() || (c1.staffMove() !== 0 || c2.staffMove() !== 0)) {
                            const prevUp = chord.up()
                            ChordLayout.computeUp(chord, ctx)
                            if (chord.up() !== prevUp) {
                                ChordLayout.layoutChords1(ctx, seg, chord.vStaffIdx())
                                somethingChanged = true
                            }
                        }
                    }
                }
                if (somethingChanged) {
                    seg.createShapes()
                }
            }
        }
    }

    private static restoreOldSystemLayout(system: System, ctx: LayoutContext): void {
        // Layout of ties and bends was reset because of the layout of the new system,
        // so it must be restored for the old system
        const elements = new ElementsToLayout(system)
        for (const mb of system.measures()) {
            if (mb.isMeasure()) {
                SystemLayout.collectElementsToLayout(mb as Measure, elements, ctx)
            }
        }
        SystemLayout.layoutTiesAndBends(elements, ctx)
    }

    static layoutSystem(system: System, ctx: LayoutContext, xo1: number, isFirstSystem = false, firstSystemIndent = false): void {
        if (system.staves().length === 0) { // ignore vbox
            return
        }

        // Get standard instrument name distance
        let instrumentNameOffset = ctx.conf().styleMM(Sid.instrumentNameOffset)
        // Now scale it depending on the text size (which also may not follow staff scaling)
        let actualSize: number
        let defaultSize: number
        let followStaffSize: boolean
        if (ctx.state().startWithLongNames()) {
            actualSize = ctx.conf().styleD(Sid.longInstrumentFontSize)
            defaultSize = DefaultStyle.defaultStyle().styleD(Sid.longInstrumentFontSize)
            followStaffSize = ctx.conf().styleB(Sid.longInstrumentFontSpatiumDependent)
        } else {
            actualSize = ctx.conf().styleD(Sid.shortInstrumentFontSize)
            defaultSize = DefaultStyle.defaultStyle().styleD(Sid.shortInstrumentFontSize)
            followStaffSize = ctx.conf().styleB(Sid.shortInstrumentFontSpatiumDependent)
        }
        let textSizeScaling = actualSize / defaultSize
        if (!followStaffSize) {
            textSizeScaling *= DefaultStyle.defaultStyle().styleD(Sid.spatium) / ctx.conf().styleD(Sid.spatium)
        }
        textSizeScaling = Math.max(textSizeScaling, 1.0)
        instrumentNameOffset *= textSizeScaling

        const nstaves = system.staves().length

        //---------------------------------------------------
        //  find x position of staves
        //---------------------------------------------------
        SystemLayout.layoutBrackets(system, ctx)
        const maxBracketsWidth = SystemLayout.totalBracketOffset(ctx)

        let maxNamesWidth = SystemLayout.instrumentNamesWidth(system, ctx, isFirstSystem)

        let indent = maxNamesWidth > 0 ? maxNamesWidth + instrumentNameOffset : 0.0
        if (isFirstSystem && firstSystemIndent) {
            indent = Math.max(indent, system.styleP(Sid.firstSystemIndentationValue) * system.mag() - maxBracketsWidth)
            maxNamesWidth = indent - instrumentNameOffset
        }

        if (RealIsNull(indent)) {
            if (ctx.conf().styleB(Sid.alignSystemToMargin)) {
                system.setLeftMargin(0.0)
            } else {
                system.setLeftMargin(maxBracketsWidth)
            }
        } else {
            system.setLeftMargin(indent + maxBracketsWidth)
        }

        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            const s = system.staves()[staffIdx]
            const staff = ctx.dom().staff(staffIdx)!
            if (!staff.show() || !s.show()) {
                s.setbbox(new RectF())
                continue
            }

            const staffMag = staff.staffMag(new Fraction(0, 1)) // ??? TODO
            const staffLines = staff.lines(new Fraction(0, 1))
            if (staffLines <= 1) {
                const h = staff.lineDistance(new Fraction(0, 1)) * staffMag * system.spatium()
                s.setbbox(new RectF(system.leftMargin() + xo1, -h, 0.0, 2 * h))
            } else {
                let h = (staffLines - 1) * staff.lineDistance(new Fraction(0, 1))
                h = h * staffMag * system.spatium()
                s.setbbox(new RectF(system.leftMargin() + xo1, 0.0, 0.0, h))
            }
        }

        //---------------------------------------------------
        //  layout brackets
        //---------------------------------------------------

        system.setBracketsXPosition(xo1 + system.leftMargin())

        //---------------------------------------------------
        //  layout instrument names x position
        //     at this point it is not clear which staves will
        //     be hidden, so layout all instrument names
        //---------------------------------------------------

        for (const s of system.staves()) {
            for (const t of s.instrumentNames) {
                TLayout.layoutInstrumentName(t, ctx)

                switch (t.align().horizontal) {
                case AlignH.JUSTIFY: // Justify is not supported for instrument names
                case AlignH.LEFT:
                    t.mutldata().setPosX(0)
                    break
                case AlignH.HCENTER:
                    t.mutldata().setPosX(maxNamesWidth * 0.5)
                    break
                case AlignH.RIGHT:
                    t.mutldata().setPosX(maxNamesWidth)
                    break
                }
            }
        }

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            const m = mb as Measure
            if (m === system.measures()[0] || (m.prev() && m.prev()!.isHBox())) {
                MeasureLayout.createSystemBeginBarLine(m, ctx)
            }
        }
    }

    private static instrumentNamesWidth(system: System, ctx: LayoutContext, isFirstSystem: boolean): number {
        let namesWidth = 0.0

        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            const staff = system.staff(staffIdx)
            if (!staff || (isFirstSystem && !staff.show())) {
                continue
            }

            for (const name of staff.instrumentNames) {
                TLayout.layoutInstrumentName(name, ctx)
                namesWidth = Math.max(namesWidth, name.width())
            }
        }

        return namesWidth
    }

    /// Calculates the total width of all brackets together that
    /// would be visible when all staves are visible.
    /// The logic in this method is closely related to the logic in
    /// SystemLayout::layoutBrackets and SystemLayout::createBracket.
    private static totalBracketOffset(ctx: LayoutContext): number {
        if (ctx.state().totalBracketsWidth() >= 0) {
            return ctx.state().totalBracketsWidth()
        }

        const nstaves = ctx.dom().nstaves()
        const bracketWidth = new Array<number>(nstaves).fill(0.0)
        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            const staff = ctx.dom().staff(staffIdx)!
            for (const bi of staff.brackets()) {
                if (bi.bracketType() === BracketType.NO_BRACKET || !bi.visible()) {
                    continue
                }

                //! This logic is partially copied from System::createBracket.
                //! Perhaps this can be unified with that method.
                let firstStaff = staffIdx
                let lastStaff = staffIdx + bi.bracketSpan() - 1
                if (lastStaff >= nstaves) {
                    lastStaff = nstaves - 1
                }

                for (; firstStaff <= lastStaff; ++firstStaff) {
                    if (ctx.dom().staff(firstStaff)!.show()) {
                        break
                    }
                }
                for (; lastStaff >= firstStaff; --lastStaff) {
                    if (ctx.dom().staff(lastStaff)!.show()) {
                        break
                    }
                }

                const span = lastStaff - firstStaff + 1
                if (span > 1
                    || (bi.bracketSpan() === span)
                    || (span === 1 && ctx.conf().styleB(Sid.alwaysShowBracketsWhenEmptyStavesAreHidden))) {
                    const dummyBr = Factory.createBracket(ctx.mutDom().dummyParent())
                    dummyBr.setBracketItem(bi)
                    dummyBr.setStaffSpan(firstStaff, lastStaff)
                    dummyBr.mutldata().bracketHeight = 3.5 * dummyBr.spatium() * 2 // default
                    TLayout.layoutBracket(dummyBr, ctx)
                    for (let stfIdx = firstStaff; stfIdx <= lastStaff; ++stfIdx) {
                        bracketWidth[stfIdx] += dummyBr.ldata().bracketWidth
                    }
                }
            }
        }

        let totalBracketsWidth = 0.0
        for (const w of bracketWidth) {
            totalBracketsWidth = Math.max(totalBracketsWidth, w)
        }
        ctx.mutState().setTotalBracketsWidth(totalBracketsWidth)

        return totalBracketsWidth
    }

    private static layoutBrackets(system: System, ctx: LayoutContext): number {
        const nstaves = system.staves().length
        const columns = system.getBracketsColumnsCount()

        const bracketWidth = new Array<number>(columns).fill(0.0)

        const bl: Bracket[] = system.brackets().splice(0)

        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            const s = ctx.dom().staff(staffIdx)!
            for (let i = 0; i < columns; ++i) {
                for (const bi of s.brackets()) {
                    if (bi.column() !== i || bi.bracketType() === BracketType.NO_BRACKET) {
                        continue
                    }
                    const b = SystemLayout.createBracket(system, ctx, bi, i, staffIdx, bl, system.firstMeasure())
                    if (b) {
                        b.mutldata().bracketHeight = 3.5 * b.spatium() * 2 // dummy
                        TLayout.layoutBracket(b, ctx)
                        bracketWidth[i] = Math.max(bracketWidth[i], b.ldata().bracketWidth)
                    }
                }
            }
        }

        let totalBracketWidth = 0.0

        if (system.brackets().length) {
            for (const w of bracketWidth) {
                totalBracketWidth += w
            }
        }

        return totalBracketWidth
    }

    static addBrackets(system: System, measure: Measure, ctx: LayoutContext): void {
        if (system.staves().length === 0) { // ignore vbox
            return
        }

        const nstaves = system.staves().length

        //---------------------------------------------------
        //  find x position of staves
        //    create brackets
        //---------------------------------------------------

        const columns = system.getBracketsColumnsCount()

        const bl: Bracket[] = system.brackets().splice(0)

        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            const s = ctx.dom().staff(staffIdx)!
            for (let i = 0; i < columns; ++i) {
                for (const bi of s.brackets()) {
                    if (bi.column() !== i || bi.bracketType() === BracketType.NO_BRACKET) {
                        continue
                    }
                    SystemLayout.createBracket(system, ctx, bi, i, staffIdx, bl, measure)
                }
            }
        }

        //---------------------------------------------------
        //  layout brackets
        //---------------------------------------------------
        SystemLayout.layoutBracketsVertical(system, ctx)
        system.setBracketsXPosition(measure.x())

        system.brackets().push(...bl)
    }

    //---------------------------------------------------------
    //   createBracket
    //   Create a bracket if it spans more then one visible system
    //   If measure is NULL adds the bracket in front of the system, else in front of the measure.
    //   Returns the bracket if it got created, else NULL
    //---------------------------------------------------------

    private static createBracket(system: System, ctx: LayoutContext, bi: BracketItem, column: number, staffIdx: staff_idx_t, bl: Bracket[],
                                 measure: Measure | null): Bracket | null {
        if (!measure) {
            return null
        }

        const nstaves = system.staves().length
        let firstStaff = staffIdx
        let lastStaff = staffIdx + bi.bracketSpan() - 1
        if (lastStaff >= nstaves) {
            lastStaff = nstaves - 1
        }

        for (; firstStaff <= lastStaff; ++firstStaff) {
            if (system.staff(firstStaff)!.show()) {
                break
            }
        }
        for (; lastStaff >= firstStaff; --lastStaff) {
            if (system.staff(lastStaff)!.show()) {
                break
            }
        }
        const span = lastStaff - firstStaff + 1
        //
        // do not show bracket if it only spans one
        // system due to some invisible staves
        //
        if (span > 1
            || (bi.bracketSpan() === span)
            || (span === 1 && ctx.conf().styleB(Sid.alwaysShowBracketsWhenEmptyStavesAreHidden)
                && bi.bracketType() !== BracketType.SQUARE)
            || (span === 1 && ctx.conf().styleB(Sid.alwaysShowSquareBracketsWhenEmptyStavesAreHidden)
                && bi.bracketType() === BracketType.SQUARE)) {
            //
            // this bracket is visible
            //
            let b: Bracket | null = null
            const track = staffIdx * VOICES
            for (let k = 0; k < bl.length; ++k) {
                if (bl[k].track() === track && bl[k].column() === column && bl[k].bracketType() === bi.bracketType()
                    && bl[k].measure() === measure) {
                    b = bl.splice(k, 1)[0]
                    break
                }
            }
            if (!b) {
                b = Factory.createBracket(ctx.mutDom().dummyParent())!
                b.setBracketItem(bi)
                b.setGenerated(true)
                b.setTrack(track)
                b.setMeasure(measure)
            }
            system.add(b)
            b.setStaffSpan(firstStaff, lastStaff)
            return b
        }

        return null
    }

    //---------------------------------------------------------
    //   layout2
    //    called after measure layout
    //    adjusts staff distance
    //---------------------------------------------------------

    static layout2(system: System, ctx: LayoutContext): void {
        const vb = system.vbox()
        if (vb) {
            BoxLayout.layoutBox(vb, ctx)
            system.setbbox(vb.ldata().bbox())
            return
        }

        system.setPos(0.0, 0.0)
        const visibleStaves: [number, SysStaff][] = []

        for (let i = 0; i < system.staves().length; ++i) {
            const s = ctx.dom().staff(i)!
            const ss = system.staves()[i]
            if (s.show() && ss.show()) {
                visibleStaves.push([i, ss])
            } else {
                ss.setbbox(new RectF()) // already done in layout() ?
            }
        }

        const _spatium = system.spatium()
        let y = 0.0
        const minVerticalDistance = ctx.conf().styleMM(Sid.minVerticalDistance)
        let staffDistance = ctx.conf().styleMM(Sid.staffDistance)
        let akkoladeDistance = ctx.conf().styleMM(Sid.akkoladeDistance)
        if (ctx.conf().isVerticalSpreadEnabled()) {
            staffDistance = ctx.conf().styleMM(Sid.minStaffSpread)
            akkoladeDistance = ctx.conf().styleMM(Sid.minStaffSpread)
        }

        if (visibleStaves.length === 0) {
            return
        }

        for (let idx = 0; ; ++idx) {
            const [si1, ss] = visibleStaves[idx]
            const staff = ctx.dom().staff(si1)!

            let dist = staff.staffHeight()
            let yOffset: number
            let h: number
            if (staff.lines(new Fraction(0, 1)) === 1) {
                yOffset = _spatium * BARLINE_SPAN_1LINESTAFF_TO * 0.5
                h = _spatium * (BARLINE_SPAN_1LINESTAFF_TO - BARLINE_SPAN_1LINESTAFF_FROM) * 0.5
            } else {
                yOffset = 0.0
                h = staff.staffHeight()
            }
            if (idx + 1 === visibleStaves.length) {
                ss.setYOff(yOffset)
                ss.setbbox(new RectF(system.leftMargin(), y - yOffset, system.width() - system.leftMargin(), h))
                ss.saveLayout()
                break
            }

            const si2 = visibleStaves[idx + 1][0]
            const staff2 = ctx.dom().staff(si2)!

            if (staff.part() === staff2.part()) {
                const m = system.firstMeasure()
                const mag = m ? staff.staffMag(m.tick()) : 1.0
                dist += akkoladeDistance * mag
            } else {
                dist += staffDistance
            }
            dist += staff2.absoluteFromSpatium(staff2.userDist())
            let fixedSpace = false
            for (const mb of system.measures()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const m = mb as Measure
                let sp = m.vspacerDown(si1)
                if (sp) {
                    if (sp.spacerType() === SpacerType.FIXED) {
                        dist = staff.staffHeight(m.tick()) + sp.absoluteGap()
                        fixedSpace = true
                        break
                    } else {
                        dist = Math.max(dist, staff.staffHeight(m.tick()) + sp.absoluteGap())
                    }
                }
                sp = m.vspacerUp(si2)
                if (sp) {
                    dist = Math.max(dist, staff.staffHeight(m.tick()) + sp.absoluteGap())
                }
            }
            if (!fixedSpace) {
                // check minimum distance to next staff
                // note that in continuous view, we normally only have a partial skyline for the system
                // a full one is only built when triggering a full layout
                // therefore, we don't know the value we get from minDistance will actually be enough
                // so we remember the value between layouts and increase it when necessary
                // (the first layout on switching to continuous view gives us good initial values)
                // the result is space is good to start and grows as needed
                // it does not, however, shrink when possible - only by trigger a full layout
                // (such as by toggling to page view and back)
                const minHorizontalClearance = ctx.conf().styleMM(Sid.skylineMinHorizontalClearance)
                let d = ss.skyline().minDistance(system.staff(si2)!.skyline(), minHorizontalClearance)
                if (ctx.conf().isLineMode()) {
                    const previousDist = ss.continuousDist()
                    if (d > previousDist) {
                        ss.setContinuousDist(d)
                    } else {
                        d = previousDist
                    }
                }
                dist = Math.max(dist, d + minVerticalDistance)
                dist = Math.max(dist, SystemLayout.minVertSpaceForCrossStaffBeams(system, si1, si2, ctx))
            }
            ss.setYOff(yOffset)
            ss.setbbox(new RectF(system.leftMargin(), y - yOffset, system.width() - system.leftMargin(), h))
            ss.saveLayout()
            y += dist
        }

        system.setSystemHeight(system.staff(visibleStaves[visibleStaves.length - 1][0])!.bbox().bottom())
        system.setHeight(system.systemHeight())

        SystemLayout.setMeasureHeight(system, system.systemHeight(), ctx)

        //---------------------------------------------------
        //  layout brackets vertical position
        //---------------------------------------------------

        SystemLayout.layoutBracketsVertical(system, ctx)

        //---------------------------------------------------
        //  layout instrument names
        //---------------------------------------------------

        SystemLayout.layoutInstrumentNames(system, ctx)
    }

    private static minVertSpaceForCrossStaffBeams(system: System, staffIdx1: staff_idx_t, staffIdx2: staff_idx_t,
                                                  ctx: LayoutContext): number {
        let minSpace = -Number.MAX_VALUE
        const startTrack = staffIdx1 * VOICES
        const endTrack = staffIdx2 * VOICES + VOICES
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (let track = startTrack; track < endTrack; ++track) {
                    const item = segment.element(track)
                    if (!item || !item.isChord()) {
                        continue
                    }
                    const beam = (item as Chord).beam()
                    if (!beam || !beam.autoplace() || beam.elements()[0] !== item) {
                        continue
                    }
                    if (beam.ldata().crossStaffBeamPos !== CrossStaffBeamPosition.BETWEEN) {
                        continue
                    }
                    let limitingChordAbove: Chord | null = null
                    let limitingChordBelow: Chord | null = null
                    let limitFromAbove = -Number.MAX_VALUE
                    let limitFromBelow = Number.MAX_VALUE
                    for (const cr of beam.elements()) {
                        if (!cr.isChord()) {
                            continue
                        }
                        const chord = cr as Chord
                        const minStemLength = BeamTremoloLayout.minStemLength(chord, beam.ldata()) * (chord.spatium() / 4)
                        const isUnderCrossBeam = cr.isBelowCrossBeam(beam)
                        if (isUnderCrossBeam && chord.vStaffIdx() === staffIdx2) {
                            const topNote = chord.upNote()
                            const noteLimit = topNote.y() - minStemLength
                            if (noteLimit < limitFromBelow) {
                                limitFromBelow = noteLimit
                                limitingChordBelow = chord
                            }
                            limitFromBelow = Math.min(limitFromBelow, noteLimit)
                        } else if (!isUnderCrossBeam && chord.vStaffIdx() === staffIdx1) {
                            const bottomNote = chord.downNote()
                            const noteLimit = bottomNote.y() + minStemLength
                            if (noteLimit > limitFromAbove) {
                                limitFromAbove = noteLimit
                                limitingChordAbove = chord
                            }
                        }
                    }
                    if (limitingChordAbove && limitingChordBelow) {
                        let minSpaceRequired = limitFromAbove - limitFromBelow
                        beam.mutldata().limitingChordAbove = limitingChordAbove
                        beam.mutldata().limitingChordBelow = limitingChordBelow
                        const topBeamSegmentForChordAbove = beam.topLevelSegmentForElement(limitingChordAbove)!
                        const topBeamSegmentForChordBelow = beam.topLevelSegmentForElement(limitingChordBelow)!
                        if (topBeamSegmentForChordAbove.above === topBeamSegmentForChordBelow.above) {
                            const strokeCount = Math.min(BeamTremoloLayout.strokeCount(beam.ldata(), limitingChordAbove),
                                                         BeamTremoloLayout.strokeCount(beam.ldata(), limitingChordBelow))
                            const beamHeight = ctx.conf().styleMM(Sid.beamWidth) + beam.beamDist() * (strokeCount - 1)
                            minSpaceRequired -= beamHeight
                        }
                        minSpace = Math.max(minSpace, minSpaceRequired)
                    }
                }
            }
        }

        return minSpace
    }

    static restoreLayout2(system: System, ctx: LayoutContext): void {
        if (system.vbox()) {
            return
        }

        for (const s of system.staves()) {
            s.restoreLayout()
        }

        system.setHeight(system.systemHeight())
        SystemLayout.setMeasureHeight(system, system.systemHeight(), ctx)
    }

    static setMeasureHeight(system: System, height: number, ctx: LayoutContext): void {
        const spatium = system.spatium()
        for (const m of system.measures()) {
            const mldata = m.mutldata()
            if (m.isMeasure()) {
                // note that the factor 2 * _spatium must be corrected for when exporting
                // system distance in MusicXML (issue #24733)
                mldata.setBbox(0.0, -spatium, m.width(), height + 2.0 * spatium)
            } else if (m.isHBox()) {
                mldata.setBbox(m.absoluteFromSpatium((m as HBox).topGap()), 0.0, m.width(), height)
                BoxLayout.layoutHBox2(m as HBox, ctx)
            } else if (m.isTBox()) {
                BoxLayout.layoutTBox(m as TBox, ctx)
            } else if (m.isFBox()) {
                BoxLayout.layoutFBox(m as FBox, ctx)
            }
        }
    }

    static layoutBracketsVertical(system: System, ctx: LayoutContext): void {
        for (const b of system.brackets()) {
            let staffIdx1 = b.firstStaff()
            let staffIdx2 = b.lastStaff()
            let sy = 0 // assume bracket not visible
            let ey = 0
            // if start staff not visible, try next staff
            while (staffIdx1 <= staffIdx2 && !system.staves()[staffIdx1].show()) {
                ++staffIdx1
            }
            // if end staff not visible, try prev staff
            while (staffIdx1 <= staffIdx2 && !system.staves()[staffIdx2].show()) {
                --staffIdx2
            }
            // the bracket will be shown IF:
            // it spans at least 2 visible staves (staffIdx1 < staffIdx2) OR
            // it spans just one visible staff (staffIdx1 == staffIdx2) but it is required to do so
            // (the second case happens at least when the bracket is initially dropped)
            const notHidden = ctx.conf().styleB(Sid.alwaysShowBracketsWhenEmptyStavesAreHidden)
                ? (staffIdx1 <= staffIdx2) : (staffIdx1 < staffIdx2) || (b.span() === 1 && staffIdx1 === staffIdx2)
            if (notHidden) { // set vert. pos. and height to visible spanned staves
                sy = system.staves()[staffIdx1].bbox().top()
                ey = system.staves()[staffIdx2].bbox().bottom()
            }

            const bldata = b.mutldata()
            bldata.setPosY(sy)
            bldata.bracketHeight = ey - sy
            TLayout.layoutBracket(b, ctx)
        }
    }

    static layoutInstrumentNames(system: System, ctx: LayoutContext): void {
        let staffIdx = 0

        for (const p of ctx.dom().parts()) {
            let s = system.staff(staffIdx)!
            let s2: SysStaff
            const nstaves = p.nstaves()

            const visible = system.firstVisibleSysStaffOfPart(p)
            if (visible !== -1) {
                // The top staff might be invisible but this top staff contains the instrument names.
                // To make sure these instrument name are drawn, even when the top staff is invisible,
                // move the InstrumentName elements to the first visible staff of the part.
                if (visible !== staffIdx) {
                    const vs = system.staff(visible)!
                    for (const t of s.instrumentNames) {
                        t.setTrack(visible * VOICES)
                        t.setSysStaff(vs)
                        vs.instrumentNames.push(t)
                    }
                    s.instrumentNames = []
                    s = vs
                }

                for (const t of s.instrumentNames) {
                    //
                    // override Text->layout()
                    //
                    let y1: number
                    let y2: number
                    switch (t.layoutPos()) {
                    default:
                    case 0: // center at part
                        y1 = s.bbox().top()
                        s2 = system.staff(staffIdx)!
                        for (let i = staffIdx + nstaves - 1; i > 0; --i) {
                            const s3 = system.staff(i)!
                            if (s3.show()) {
                                s2 = s3
                                break
                            }
                        }
                        y2 = s2.bbox().bottom()
                        break
                    case 1: // center at first staff
                        y1 = s.bbox().top()
                        y2 = s.bbox().bottom()
                        break
                    case 2: // center between first and second staff
                        y1 = s.bbox().top()
                        y2 = system.staff(staffIdx + 1)!.bbox().bottom()
                        break
                    case 3: // center at second staff
                        y1 = system.staff(staffIdx + 1)!.bbox().top()
                        y2 = system.staff(staffIdx + 1)!.bbox().bottom()
                        break
                    case 4: // center between first and second staff
                        y1 = system.staff(staffIdx + 1)!.bbox().top()
                        y2 = system.staff(staffIdx + 2)!.bbox().bottom()
                        break
                    case 5: // center at third staff
                        y1 = system.staff(staffIdx + 2)!.bbox().top()
                        y2 = system.staff(staffIdx + 2)!.bbox().bottom()
                        break
                    }
                    t.mutldata().setPosY(y1 + (y2 - y1) * 0.5 + t.offset().y())
                }
            }
            staffIdx += nstaves
        }
    }

    //---------------------------------------------------------
    //   setInstrumentNames
    //---------------------------------------------------------

    static setInstrumentNames(system: System, ctx: LayoutContext, longName: boolean, tick: Fraction = new Fraction(0, 1)): void {
        //
        // remark: add/remove instrument names is not undo/redoable
        //         as add/remove of systems is not undoable
        //
        if (system.vbox()) { // ignore vbox
            return
        }

        if (!ctx.conf().isShowInstrumentNames()
            || (ctx.conf().styleB(Sid.hideInstrumentNameIfOneInstrument) && ctx.dom().visiblePartCount() <= 1)
            || (ctx.state().firstSystem()
                && (ctx.conf().styleV(Sid.firstSystemInstNameVisibility) as InstrumentLabelVisibility) === InstrumentLabelVisibility.HIDE)
            || (!ctx.state().firstSystem()
                && (ctx.conf().styleV(Sid.subsSystemInstNameVisibility) as InstrumentLabelVisibility) === InstrumentLabelVisibility.HIDE)) {
            for (const staff of system.staves()) {
                for (const t of [...staff.instrumentNames]) {
                    ctx.mutDom().removeElement(t)
                }
            }
            return
        }

        let staffIdx = 0
        for (const staff of system.staves()) {
            const s = ctx.dom().staff(staffIdx)!
            const part = s.part()

            let atLeastOneVisibleStaff = false
            for (const partStaff of part.staves()) {
                if (partStaff.show()) {
                    atLeastOneVisibleStaff = true
                    break
                }
            }

            const showName = part.show() && atLeastOneVisibleStaff
            if (!s.isTop() || !showName) {
                for (const t of [...staff.instrumentNames]) {
                    ctx.mutDom().removeElement(t)
                }
                ++staffIdx
                continue
            }

            const names = longName ? part.longNames(tick) : part.shortNames(tick)

            let idx = 0
            for (const sn of names) {
                let iname: InstrumentName | undefined = staff.instrumentNames[idx]
                if (!iname) {
                    iname = new InstrumentName(system)
                    iname.setGenerated(true)
                    iname.setParent(system)
                    iname.setSysStaff(staff)
                    iname.setTrack(staffIdx * VOICES)
                    iname.setInstrumentNameType(longName ? InstrumentNameType.LONG : InstrumentNameType.SHORT)
                    iname.setLayoutPos(sn.pos())
                    ctx.mutDom().addElement(iname)
                }
                iname.setXmlText(sn.name())
                ++idx
            }
            for (const t of staff.instrumentNames.slice(idx)) {
                ctx.mutDom().removeElement(t)
            }
            ++staffIdx
        }
    }

    //---------------------------------------------------------
    //   minDistance
    //    Return the minimum distance between this system and s2
    //    without any element collisions.
    //
    //    top - top system
    //    bottom   - bottom system
    //---------------------------------------------------------

    static minDistance(top: System, bottom: System, ctx: LayoutContext): number {
        const conf = ctx.conf()
        const dom = ctx.dom()

        const topVBox = top.vbox() as VBox | null
        const bottomVBox = bottom.vbox() as VBox | null

        if (topVBox && !bottomVBox) {
            return Math.max(topVBox.absoluteFromSpatium(topVBox.bottomGap()),
                            bottom.minTop() + topVBox.absoluteFromSpatium(topVBox.paddingToNotationBelow()))
        } else if (!topVBox && bottomVBox) {
            return Math.max(bottomVBox.absoluteFromSpatium(bottomVBox.topGap()),
                            top.minBottom() + bottomVBox.absoluteFromSpatium(bottomVBox.paddingToNotationAbove()))
        } else if (topVBox && bottomVBox) {
            const topToBottomGap = topVBox.absoluteFromSpatium(topVBox.bottomGap())
            const bottomToTopGap = bottomVBox.absoluteFromSpatium(bottomVBox.topGap())
            if (topToBottomGap >= 0 && bottomToTopGap >= 0) {
                return Math.max(bottomToTopGap, topToBottomGap)
            } else {
                return topToBottomGap + bottomToTopGap
            }
        }

        if (top.staves().length === 0 || bottom.staves().length === 0) {
            return 0.0
        }

        const minVerticalDistance = conf.styleMM(Sid.minVerticalDistance)
        let dist = conf.isVerticalSpreadEnabled() ? conf.styleMM(Sid.minSystemSpread) : conf.styleMM(Sid.minSystemDistance)
        let firstStaff: number
        let lastStaff: number

        for (firstStaff = 0; firstStaff < top.staves().length - 1; ++firstStaff) {
            if (dom.staff(firstStaff)!.show() && bottom.staff(firstStaff)!.show()) {
                break
            }
        }
        for (lastStaff = top.staves().length - 1; lastStaff > 0; --lastStaff) {
            if (dom.staff(lastStaff)!.show() && top.staff(lastStaff)!.show()) {
                break
            }
        }

        const staff = dom.staff(firstStaff)
        const userDist = staff ? staff.absoluteFromSpatium(staff.userDist()) : 0.0
        dist = Math.max(dist, userDist)
        top.setFixedDownDistance(false)

        const sysStaff = top.staff(lastStaff)
        const minHorizontalClearance = conf.styleMM(Sid.skylineMinHorizontalClearance)
        let sld = sysStaff ? sysStaff.skyline().minDistance(bottom.staff(firstStaff)!.skyline(), minHorizontalClearance) : 0
        sld -= sysStaff ? sysStaff.bbox().height() - minVerticalDistance : 0

        if (conf.isFloatMode()) {
            return Math.max(dist, sld)
        }

        for (const mb1 of top.measures()) {
            if (mb1.isMeasure()) {
                const m = mb1 as Measure
                const sp = m.vspacerDown(lastStaff)
                if (sp) {
                    if (sp.spacerType() === SpacerType.FIXED) {
                        dist = sp.absoluteGap()
                        top.setFixedDownDistance(true)
                        break
                    } else {
                        dist = Math.max(dist, sp.absoluteGap())
                    }
                }
            }
        }
        if (!top.hasFixedDownDistance()) {
            for (const mb2 of bottom.measures()) {
                if (mb2.isMeasure()) {
                    const m = mb2 as Measure
                    const sp = m.vspacerUp(firstStaff)
                    if (sp) {
                        dist = Math.max(dist, sp.absoluteGap())
                    }
                }
            }

            dist = Math.max(dist, sld)
        }
        return dist
    }

    static removeElementFromSkyline(element: EngravingItem, system: System): void {
        const skyline = system.staff(element.staffIdx())!.skyline()
        const isAbove = element.isArticulationFamily() ? (element as Articulation).up() : element.placeAbove()
        const skylineLine = isAbove ? skyline.north() : skyline.south()
        skylineLine.remove_if((shapeEl) => {
            const item = shapeEl.item()
            return !!item && (element === item || element === item.parentItem())
        })
    }

    static updateSkylineForElement(element: EngravingItem, system: System, yMove: number): void {
        const skyline = system.staff(element.staffIdx())!.skyline()
        const isAbove = element.isArticulationFamily() ? (element as Articulation).up() : element.placeAbove()
        const skylineLine = isAbove ? skyline.north() : skyline.south()
        for (const shapeEl of skylineLine.elements()) {
            let itemInSkyline = shapeEl.item()
            if (itemInSkyline && itemInSkyline.isText() && itemInSkyline.explicitParent() && itemInSkyline.parent()!.isSLineSegment()) {
                itemInSkyline = itemInSkyline.parentItem()
            }
            if (itemInSkyline === element) {
                shapeEl.translate(new PointF(0.0, yMove))
            }
        }
    }

    static centerElementsBetweenStaves(system: System): void {
        const centeredItems: EngravingItem[] = []

        for (const spannerSeg of system.spannerSegments()) {
            if (spannerSeg.isHairpinSegment() && SystemLayout.elementShouldBeCenteredBetweenStaves(spannerSeg, system)) {
                SystemLayout.centerElementBetweenStaves(spannerSeg, system)
                centeredItems.push(spannerSeg)
            } else if (spannerSeg.isWhammyBarSegment()
                     && SystemLayout.whammyBarShouldBeCenteredBetweenStaves(spannerSeg as TextLineBaseSegment, system)) {
                SystemLayout.centerElementBetweenStaves(spannerSeg, system)
                centeredItems.push(spannerSeg)
            }
        }

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                for (const item of seg.elist()) {
                    if (item && item.isMMRest() && SystemLayout.mmRestShouldBeCenteredBetweenStaves(item as MMRest, system)) {
                        SystemLayout.centerMMRestBetweenStaves(item as MMRest, system)
                    }
                }
                for (const item of seg.annotations()) {
                    if ((item.isDynamic() || item.isExpression()) && SystemLayout.elementShouldBeCenteredBetweenStaves(item, system)) {
                        SystemLayout.centerElementBetweenStaves(item, system)
                        centeredItems.push(item)
                    }
                }
            }
        }

        AlignmentLayout.alignStaffCenteredItems(centeredItems, system)
    }

    private static whammyBarShouldBeCenteredBetweenStaves(wbar: TextLineBaseSegment, system: System): boolean {
        if (wbar.offset().y() !== (wbar.propertyDefault(Pid.OFFSET) as PointF).y()) {
            // NOTE: because of current limitations of the offset system, we can't center an element that's been manually moved.
            return false
        }

        const staffIdx = wbar.staffIdx()
        const thisStaff = wbar.staff()!
        const nextStaff = wbar.score().staff(staffIdx + 1)
        const nextIsLinkedTab = !!nextStaff && nextStaff.isTabStaff(wbar.tick()) && thisStaff.isLinked(nextStaff)
        const nextSysStaff = system.staff(staffIdx + 1)
        return wbar.placeBelow() && nextIsLinkedTab && !!nextSysStaff && nextSysStaff.show()
    }

    private static elementShouldBeCenteredBetweenStaves(item: EngravingItem, system: System): boolean {
        if (item.offset().y() !== (item.propertyDefault(Pid.OFFSET) as PointF).y()) {
            // NOTE: because of current limitations of the offset system, we can't center an element that's been manually moved.
            return false
        }

        const itemPart = item.part()
        if (!itemPart) {
            return false
        }

        const centerStyle = item.style().styleB(Sid.dynamicsHairpinsAutoCenterOnGrandStaff)
        const centerProperty = item.getProperty(Pid.CENTER_BETWEEN_STAVES) as AutoOnOff
        if (itemPart.nstaves() <= 1 || centerProperty === AutoOnOff.OFF || (!centerStyle && centerProperty !== AutoOnOff.ON)) {
            return false
        }

        if (centerProperty !== AutoOnOff.ON && !itemPart.instrument().isNormallyMultiStaveInstrument()) {
            return false
        }

        const thisStaff = item.staff()!
        const partStaves = itemPart.staves()
        if (partStaves.length === 0) {
            return false
        }

        if ((thisStaff === partStaves[0] && item.placeAbove()) || (thisStaff === partStaves[partStaves.length - 1] && item.placeBelow())) {
            return false
        }

        const thisIdx = thisStaff.idx()
        if (item.placeAbove() && thisIdx === 0) {
            return false
        }

        const nextIdx = item.placeAbove() ? system.prevVisibleStaff(thisIdx) : system.nextVisibleStaff(thisIdx)
        if (nextIdx === nidx || !partStaves.includes(item.score().staff(nextIdx)!)) {
            return false
        }

        return centerProperty === AutoOnOff.ON || item.appliesToAllVoicesInInstrument()
    }

    private static centerElementBetweenStaves(element: EngravingItem, system: System): void {
        const isAbove = element.placeAbove()
        const thisIdx = element.staffIdx()
        if (isAbove && thisIdx === 0) {
            return
        }
        const nextIdx = isAbove ? system.prevVisibleStaff(thisIdx) : system.nextVisibleStaff(thisIdx)
        if (nextIdx === nidx) {
            return
        }

        const thisStaff = system.staff(thisIdx)
        const nextStaff = system.staff(nextIdx)
        if (!thisStaff || !nextStaff) {
            return
        }

        const elementXinSystemCoord = element.pageX() - system.pageX()
        const minHorizontalClearance = system.style().styleMM(Sid.skylineMinHorizontalClearance)

        const elementShape = element.ldata().shape()
            .translated(new PointF(elementXinSystemCoord, element.y()))
            .adjust(-minHorizontalClearance, 0.0, minHorizontalClearance, 0.0)
        elementShape.remove_if((shEl) => shEl.ignoreForLayout())

        const skylineOfThisStaff = isAbove ? thisStaff.skyline().north() : thisStaff.skyline().south()

        if (SystemLayout.elementHasAnotherStackedOutside(element, elementShape, skylineOfThisStaff)) {
            return
        }

        const thisSkyline = skylineOfThisStaff.getFilteredCopy((shEl) => {
            const shapeItem = shEl.item()
            if (!shapeItem) {
                return false
            }
            return shapeItem.isAccidental() || Autoplace.itemsShouldIgnoreEachOther(element, shapeItem)
        })

        const yStaffDiff = nextStaff.y() - thisStaff.y()
        const nextSkyline = (isAbove ? nextStaff.skyline().south() : nextStaff.skyline().north()).clone()
        nextSkyline.translateY(yStaffDiff)

        const elementMinDist = element.minDistance().toAbsolute(element.spatium())
        let availSpaceAbove = (isAbove ? nextSkyline.verticalClaranceBelow(elementShape) : thisSkyline.verticalClaranceBelow(elementShape))
                              - elementMinDist
        let availSpaceBelow = (isAbove ? thisSkyline.verticalClearanceAbove(elementShape) : nextSkyline.verticalClearanceAbove(elementShape))
                              - elementMinDist

        const yMove = 0.5 * (availSpaceBelow - availSpaceAbove)

        element.mutldata().moveY(yMove)

        availSpaceAbove += yMove
        availSpaceBelow -= yMove
        element.mutldata().setStaffCenteringInfo(Math.max(availSpaceAbove, 0.0), Math.max(availSpaceBelow, 0.0))

        SystemLayout.updateSkylineForElement(element, system, yMove)
    }

    private static elementHasAnotherStackedOutside(element: EngravingItem, elementShape: Shape, skylineLine: SkylineLine): boolean {
        const elemShapeLeft = -elementShape.left()
        const elemShapeRight = elementShape.right()
        const elemShapeTop = elementShape.top()
        const elemShapeBottom = elementShape.bottom()

        for (const skylineElement of skylineLine.elements()) {
            const skylineItem = skylineElement.item()
            if (!skylineItem || skylineItem === element || skylineItem.parent() === element
                || Autoplace.itemsShouldIgnoreEachOther(element, skylineItem)) {
                continue
            }
            const intersectHorizontally = elemShapeRight > skylineElement.left() && elemShapeLeft < skylineElement.right()
            if (!intersectHorizontally) {
                continue
            }
            const skylineElementIsStackedOnIt = skylineLine.isNorth() ? skylineElement.top() < elemShapeTop
                : skylineElement.bottom() > elemShapeBottom
            if (skylineElementIsStackedOnIt) {
                return true
            }
        }

        return false
    }

    private static mmRestShouldBeCenteredBetweenStaves(mmRest: MMRest, system: System): boolean {
        if (!mmRest.style().styleB(Sid.mmRestBetweenStaves)) {
            return false
        }

        const itemPart = mmRest.part()!
        if (itemPart.nstaves() <= 1) {
            return false
        }

        const thisStaffIdx = mmRest.staffIdx()
        const prevStaffIdx = system.prevVisibleStaff(thisStaffIdx)

        return prevStaffIdx !== nidx && mmRest.score().staff(prevStaffIdx)!.part() === itemPart
    }

    private static centerMMRestBetweenStaves(mmRest: MMRest, system: System): void {
        const thisIdx = mmRest.staffIdx()
        if (thisIdx === 0) {
            return
        }

        const prevIdx = system.prevVisibleStaff(thisIdx)
        if (prevIdx === nidx) {
            return
        }

        const thisStaff = system.staff(thisIdx)!
        const prevStaff = system.staff(prevIdx)!
        const prevStaffHeight = system.score().staff(prevIdx)!.staffHeight(mmRest.tick())
        const yStaffDiff = prevStaff.y() + prevStaffHeight - thisStaff.y()

        const mmRestDefaultNumberPosition = mmRest.numberPos().minus(new PointF(0.0, mmRest.numberOffset().toAbsolute(mmRest.spatium())))
        const numberBbox = mmRest.numberRect().translated(mmRestDefaultNumberPosition.plus(mmRest.pos()))
        const yBaseLine = 0.5 * (yStaffDiff - numberBbox.height())
        const yDiff = yBaseLine - numberBbox.top()

        mmRest.mutldata().yNumberPos += yDiff
    }

    static centerBigTimeSigsAcrossStaves(system: System): void {
        const nstaves = system.score().nstaves()
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isSegType(SegmentType.TimeSigType)) {
                    continue
                }
                for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                    const timeSig = segment.element(staff2track(staffIdx)) as TimeSig | null
                    if (!timeSig || !timeSig.showOnThisStaff()) {
                        continue
                    }
                    const thisStaffIdx = timeSig.effectiveStaffIdx()
                    if (thisStaffIdx === nidx) {
                        continue
                    }
                    let nextStaffIdx = thisStaffIdx
                    for (let idx = thisStaffIdx + 1; idx < nstaves; ++idx) {
                        const nextTimeSig = segment.element(staff2track(idx)) as TimeSig | null
                        if (nextTimeSig && nextTimeSig.showOnThisStaff()) {
                            const nextTimeSigStave = nextTimeSig.effectiveStaffIdx()
                            if (nextTimeSigStave !== nidx) {
                                nextStaffIdx = system.prevVisibleStaff(nextTimeSigStave)
                                break
                            }
                        }
                        if (idx === nstaves - 1) {
                            nextStaffIdx = system.prevVisibleStaff(nstaves)
                            break
                        }
                    }
                    const yTop = system.staff(thisStaffIdx)!.y() + system.score().staff(thisStaffIdx)!.staffHeight(segment.tick())
                    const yBottom = system.staff(nextStaffIdx)!.y() + system.score().staff(nextStaffIdx)!.staffHeight(segment.tick())
                    const newYPos = 0.5 * (yBottom - yTop)
                    timeSig.mutldata().setPosY(newYPos)
                }
            }
        }
    }
}

void RealIsEqual
void System
void Bracket

