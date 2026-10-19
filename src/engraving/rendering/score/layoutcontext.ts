/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/layoutcontext.h/.cpp
 *
 * Undo is not ported: the doUndo...() / undo...() functions modify the score directly.
 */

import { Fraction } from '../../types/fraction'
import { DPI, type staff_idx_t, type track_idx_t } from '../../types/types'
import type { Spatium } from '../../types/dimension'
import type { PropertyValue } from '../../types/propertyvalue'
import { Sid } from '../../style/styledef'
import type { MStyle } from '../../style/style'
import type { EngravingFont } from '../../infrastructure/engravingfont'
import { scoreDummy, type DummyElement } from '../../compat/dummyelement'
import { LayoutMode, type Score, type SpannerMap } from '../../dom/score'
import type { ChordRest } from '../../dom/chordrest'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { Page } from '../../dom/page'
import type { Part } from '../../dom/part'
import type { Spanner } from '../../dom/spanner'
import type { Staff } from '../../dom/staff'
import type { System } from '../../dom/system'
import { paddingTable, type PaddingTable } from '../paddingtable'

export class LayoutConfiguration {
    constructor(private m_score: Score) {}

    viewMode(): LayoutMode { return this.m_score.layoutMode() }
    isMode(m: LayoutMode): boolean { return this.viewMode() === m }
    isLineMode(): boolean { return this.isMode(LayoutMode.LINE) }
    isLinearMode(): boolean { return this.isMode(LayoutMode.LINE) || this.isMode(LayoutMode.HORIZONTAL_FIXED) }
    isFloatMode(): boolean { return this.isMode(LayoutMode.FLOAT) }
    isPaletteMode(): boolean { return false }
    isPrintingMode(): boolean { return this.m_score.printing() }
    isShowVBox(): boolean { return true }
    noteHeadWidth(): number { return this.m_score.noteHeadWidth() }
    isShowInvisible(): boolean { return this.m_score.isShowInvisible() }
    pageNumberOffset(): number { return this.m_score.pageNumberOffset() }

    isVerticalSpreadEnabled(): boolean {
        return this.styleB(Sid.enableVerticalSpread) && (this.viewMode() !== LayoutMode.SYSTEM)
    }

    maxSystemDistance(): number {
        if (this.isVerticalSpreadEnabled()) {
            return this.style().styleMM(Sid.maxSystemSpread)
        }
        return this.style().styleMM(Sid.maxSystemDistance)
    }

    isShowInstrumentNames(): boolean { return this.m_score.showInstrumentNames() }
    engravingFont(): EngravingFont { return this.m_score.engravingFont() }
    style(): MStyle { return this.m_score.style() }

    styleV(idx: Sid): PropertyValue { return this.style().styleV(idx) }
    styleS(idx: Sid): Spatium { return this.style().styleS(idx) }
    styleMM(idx: Sid): number { return this.style().styleMM(idx) }
    styleSt(idx: Sid): string { return this.style().styleSt(idx) }
    styleB(idx: Sid): boolean { return this.style().styleB(idx) }
    styleD(idx: Sid): number { return this.style().styleD(idx) }
    styleI(idx: Sid): number { return this.style().styleI(idx) }

    spatium(): number { return this.styleD(Sid.spatium) }
    defaultSpatium(): number { return this.style().defaultSpatium() }
    point(sp: Spatium): number { return sp.val() * this.spatium() }
    magS(mag: number): number { return mag * (this.spatium() / this.defaultSpatium()) }
    loWidth(): number { return this.styleD(Sid.pageWidth) * DPI }
    loHeight(): number { return this.styleD(Sid.pageHeight) * DPI }
    firstSystemIndent(): boolean { return this.styleB(Sid.enableIndentationOnFirstSystem) }
}

export class DomAccessor {
    constructor(private m_score: Score) {}

    parts(): readonly Part[] { return this.m_score.parts() }
    visiblePartCount(): number { return this.m_score.parts().filter(p => p.show()).length }
    npages(): number { return this.m_score.npages() }
    pages(): Page[] { return this.m_score.pages() }
    systems(): System[] { return this.m_score.systems() }
    nstaves(): number { return this.m_score.nstaves() }
    staves(): readonly Staff[] { return this.m_score.staves() }
    staff(idx: staff_idx_t): Staff | null { return this.m_score.staff(idx) }
    allStavesInvisible(): boolean { return this.m_score.allStavesInvisible() }
    ntracks(): number { return this.m_score.ntracks() }
    nmeasures(): number {
        let n = 0
        for (let m = this.m_score.firstMeasure(); m; m = m.nextMeasure()) {
            ++n
        }
        return n
    }
    tick2measure(tick: Fraction): Measure | null { return this.m_score.tick2measure(tick) }
    tick2measureMM(tick: Fraction): Measure | null { return this.m_score.tick2measureMM(tick) }
    first(): MeasureBase | null { return this.m_score.first() }
    firstMeasure(): Measure | null { return this.m_score.firstMeasure() }
    lastMeasure(): Measure | null { return this.m_score.lastMeasure() }
    lastMeasureMM(): Measure | null { return this.m_score.lastMeasureMM() }
    spannerMap(): SpannerMap { return this.m_score.spannerMap() }
    findCR(tick: Fraction, track: track_idx_t): ChordRest | null { return this.m_score.findCR(tick, track) }
    paddingTable(): PaddingTable { return paddingTable(this.m_score) }
    dummyParent(): DummyElement { return scoreDummy(this.m_score) }

    doUndoAddElement(item: EngravingItem): void { this.addElement(item) }
    undoAddElement(item: EngravingItem): void { this.addElement(item) }
    doUndoRemoveElement(item: EngravingItem): void { this.removeElement(item) }
    undoRemoveElement(item: EngravingItem): void { this.removeElement(item) }
    addElement(item: EngravingItem): void { this.m_score.addElement(item) }
    removeElement(item: EngravingItem): void { this.m_score.removeElement(item) }
    addUnmanagedSpanner(s: Spanner): void { this.m_score.addUnmanagedSpanner(s) }
    unmanagedSpanners(): Set<Spanner> { return this.m_score.unmanagedSpanners() }
}

export class LayoutState {
    private m_firstSystem = true
    private m_firstSystemIndent = true
    private m_startWithLongNames = true
    private m_tick = new Fraction(0, 1)
    private m_startTick = new Fraction(0, 1)
    private m_endTick = new Fraction(0, 1)
    private m_isLayoutAll = false
    private m_page: Page | null = null
    private m_pageIdx = 0 // index in Score->page()s
    private m_systemList: System[] = [] // reusable systems
    private m_prevSystem: System | null = null // used during page layout
    private m_curSystem: System | null = null
    private m_prevMeasure: MeasureBase | null = null
    private m_curMeasure: MeasureBase | null = null
    private m_nextMeasure: MeasureBase | null = null
    private m_systemOldMeasure: MeasureBase | null = null
    private m_pageOldMeasure: MeasureBase | null = null
    private m_measureNo = 0
    private m_processedSpanners = new Set<Spanner>()
    private m_rangeDone = false
    private m_mustRecomputeHeadersFooters = false // we may need to re-compute headers/footers after laying out all pages if they contained a page count
    private m_totalBracketsWidth = -1.0

    firstSystem(): boolean { return this.m_firstSystem }
    firstSystemIndent(): boolean { return this.m_firstSystemIndent }
    startWithLongNames(): boolean { return this.m_startWithLongNames }
    tick(): Fraction { return this.m_tick }
    startTick(): Fraction { return this.m_startTick }
    endTick(): Fraction { return this.m_endTick }
    isLayoutAll(): boolean { return this.m_isLayoutAll }
    page(): Page | null { return this.m_page }
    pageIdx(): number { return this.m_pageIdx }
    systemList(): System[] { return this.m_systemList }
    prevSystem(): System | null { return this.m_prevSystem }
    curSystem(): System | null { return this.m_curSystem }
    prevMeasure(): MeasureBase | null { return this.m_prevMeasure }
    curMeasure(): MeasureBase | null { return this.m_curMeasure }
    nextMeasure(): MeasureBase | null { return this.m_nextMeasure }
    systemOldMeasure(): MeasureBase | null { return this.m_systemOldMeasure }
    pageOldMeasure(): MeasureBase | null { return this.m_pageOldMeasure }
    measureNo(): number { return this.m_measureNo }
    rangeDone(): boolean { return this.m_rangeDone }
    mustRecomputeHeadersFooters(): boolean { return this.m_mustRecomputeHeadersFooters }
    totalBracketsWidth(): number { return this.m_totalBracketsWidth }

    setFirstSystem(val: boolean): void { this.m_firstSystem = val }
    setFirstSystemIndent(val: boolean): void { this.m_firstSystemIndent = val }
    setStartWithLongNames(val: boolean): void { this.m_startWithLongNames = val }
    setTick(t: Fraction): void { this.m_tick = t }
    setStartTick(t: Fraction): void { this.m_startTick = t }
    setEndTick(t: Fraction): void { this.m_endTick = t }
    setIsLayoutAll(v: boolean): void { this.m_isLayoutAll = v }
    setPage(p: Page | null): void { this.m_page = p }
    setPageIdx(idx: number): void { this.m_pageIdx = idx }
    setSystemList(l: System[]): void { this.m_systemList = l }
    setPrevSystem(s: System | null): void { this.m_prevSystem = s }
    setCurSystem(s: System | null): void { this.m_curSystem = s }
    setPrevMeasure(m: MeasureBase | null): void { this.m_prevMeasure = m }
    setCurMeasure(m: MeasureBase | null): void { this.m_curMeasure = m }
    setNextMeasure(m: MeasureBase | null): void { this.m_nextMeasure = m }
    setSystemOldMeasure(m: MeasureBase | null): void { this.m_systemOldMeasure = m }
    setPageOldMeasure(m: MeasureBase | null): void { this.m_pageOldMeasure = m }
    setMeasureNo(no: number): void { this.m_measureNo = no }
    processedSpanners(): Set<Spanner> { return this.m_processedSpanners }
    setRangeDone(val: boolean): void { this.m_rangeDone = val }
    setMustRecomputeHeadersFooters(val: boolean): void { this.m_mustRecomputeHeadersFooters = val }
    setTotalBracketsWidth(val: number): void { this.m_totalBracketsWidth = val }
}

export class LayoutContext {
    private m_configuration: LayoutConfiguration
    private m_dom: DomAccessor
    private m_state = new LayoutState()

    constructor(private m_score: Score) {
        this.m_configuration = new LayoutConfiguration(m_score)
        this.m_dom = new DomAccessor(m_score)
        if (m_score) {
            this.m_state.setFirstSystemIndent(m_score.style().styleB(Sid.enableIndentationOnFirstSystem))
        }
    }

    isValid(): boolean { return !!this.m_score }
    engravingFont(): EngravingFont { return this.m_score.engravingFont() }
    conf(): LayoutConfiguration { return this.m_configuration }
    dom(): DomAccessor { return this.m_dom }
    mutDom(): DomAccessor { return this.m_dom }
    state(): LayoutState { return this.m_state }
    mutState(): LayoutState { return this.m_state }

    /** not part of the C++ API: direct access for code that is not ported via DomAccessor */
    score(): Score { return this.m_score }
}
