/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/score.h/.cpp and masterscore.h/.cpp (read & layout relevant parts;
 * no editing commands, no undo, no playback)
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { DPI, ElementType, INCH, Key, TextStyleType, VOICES, type staff_idx_t, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { SymId } from '../types/symid'
import { MStyle } from '../style/style'
import { DefaultStyle } from '../style/defaultstyle'
import { engravingFonts, type EngravingFont } from '../infrastructure/engravingfont'
import { EngravingObject } from './engravingobject'
import type { EngravingItem } from './engravingitem'
import { MeasureBaseList, type MeasureBase } from './measurebase'
import { SegmentType, type Segment } from './segment'
import { TimeSigMap, TimeSigFrac, BeatType, SigEvent } from './sig'
import { Pid } from './property'
import type { Measure } from './measure'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import { searchTieNote } from './utils'
import type { Staff } from './staff'
import type { Part } from './part'
import type { System } from './system'
import type { Page } from './page'
import type { Spanner } from './spanner'
import type { Text } from './text'
import { SystemLocks, type SystemLock } from './systemlock'
import { ChordList } from './chordlist'
import { ScoreOrder } from './scoreorder'
import type { TimeSig } from './timesig'
import { KeyList, KeySigEvent } from './key'
import { Transpose } from '../editing/transpose'
import { Interval } from './interval'

export enum LayoutMode {
    PAGE, FLOAT, LINE, SYSTEM, HORIZONTAL_FIXED,
}

/**
 * Simplified replacement of the C++ SpannerMap (an interval tree):
 * spanners are kept in a list ordered by start tick.
 */
export class SpannerMap {
    private m_spanners: Spanner[] = []

    addSpanner(s: Spanner): void {
        let i = this.m_spanners.length
        while (i > 0 && this.m_spanners[i - 1].tick().ticks() > s.tick().ticks()) {
            --i
        }
        this.m_spanners.splice(i, 0, s)
    }

    removeSpanner(s: Spanner): boolean {
        const i = this.m_spanners.indexOf(s)
        if (i >= 0) {
            this.m_spanners.splice(i, 1)
            return true
        }
        return false
    }

    /** all spanners overlapping [start, stop] (inclusive like the C++ interval tree query) */
    findOverlapping(start: number, stop: number, excludeCollisions = false): Spanner[] {
        return this.m_spanners.filter(s => {
            const t1 = s.tick().ticks()
            const t2 = s.tick2().ticks()
            if (excludeCollisions) {
                return t1 < stop && t2 > start
            }
            return t1 <= stop && t2 >= start
        })
    }

    findContained(start: number, stop: number): Spanner[] {
        return this.m_spanners.filter(s => s.tick().ticks() >= start && s.tick2().ticks() <= stop)
    }

    all(): readonly Spanner[] { return this.m_spanners }
    clear(): void { this.m_spanners = [] }
}

/** set by compat/dummyelement.ts (C++ Score::dummy()->system(); avoids a circular import) */
export const scoreDummyHooks: { system?: (score: Score) => System } = {}

export class Score extends EngravingObject {
    protected m_style: MStyle
    private m_systemLocks = new SystemLocks()
    protected m_eidRegister = new Map<string, EngravingObject>() // C++ EIDRegister (of the master score)
    protected m_staves: Staff[] = []
    protected m_parts: Part[] = []
    protected m_systemObjectStaves: Staff[] = []
    protected m_measures = new MeasureBaseList()
    protected m_systems: System[] = []
    protected m_pages: Page[] = []
    protected m_spanner = new SpannerMap()
    protected m_unmanagedSpanners = new Set<Spanner>()
    private m_chordList = new ChordList()
    protected m_metaTags = new Map<string, string>()
    protected m_engravingFont: EngravingFont | null = null
    protected m_noteHeadWidth: number | null = null

    protected m_mscVersion = 470
    protected m_fileDivision = 480
    protected m_pageNumberOffset = 0
    protected m_layoutMode = LayoutMode.PAGE
    protected m_showInvisible = true
    protected m_showUnprintable = true
    protected m_showFrames = true
    protected m_showPageborders = false
    protected m_showSoundFlags = true
    protected m_markIrregularMeasures = true
    protected m_showInstrumentNames = true
    protected m_printing = false
    protected m_scoreOrder = new ScoreOrder()

    constructor() {
        super(ElementType.SCORE, null)
        this.m_score = this
        this.m_style = DefaultStyle.defaultStyle().clone()
        this.m_style.precomputeValues()
    }

    override score(): Score { return this }
    isMaster(): boolean { return false }
    override masterScore(): import('./masterscore').MasterScore { return this as unknown as import('./masterscore').MasterScore }

    override style(): MStyle { return this.m_style }
    setStyle(s: MStyle): void {
        this.m_style = s.clone() // C++ copies the style
        this.styleChanged()
    }

    engravingFont(): EngravingFont {
        if (!this.m_engravingFont) {
            this.m_engravingFont = engravingFonts().fontByName(this.m_style.styleSt(Sid.musicalSymbolFont))
        }
        return this.m_engravingFont
    }

    setEngravingFont(f: EngravingFont | null): void { this.m_engravingFont = f }

    /** set by styleChanged() in C++; computed on demand here */
    noteHeadWidth(): number {
        if (this.m_noteHeadWidth === null) {
            this.m_noteHeadWidth = this.engravingFont().width(SymId.noteheadBlack,
                this.m_style.spatium() / this.m_style.defaultSpatium())
        }
        return this.m_noteHeadWidth
    }
    setNoteHeadWidth(n: number | null): void { this.m_noteHeadWidth = n }

    override styleChanged(): void {
        this.m_engravingFont = null
        this.m_noteHeadWidth = null
        this.m_style.precomputeValues()
    }

    mscVersion(): number { return this.m_mscVersion }
    setMscVersion(v: number): void { this.m_mscVersion = v }

    fileDivision(t: number): number {
        return Math.trunc((t * 480 + Math.trunc(this.m_fileDivision / 2)) / this.m_fileDivision)
    }
    setFileDivision(t: number): void { this.m_fileDivision = t }

    pageNumberOffset(): number { return this.m_pageNumberOffset }
    setPageNumberOffset(v: number): void { this.m_pageNumberOffset = v }

    layoutMode(): LayoutMode { return this.m_layoutMode }
    setLayoutMode(m: LayoutMode): void { this.m_layoutMode = m }
    lineMode(): boolean { return this.m_layoutMode === LayoutMode.LINE }
    linearMode(): boolean { return this.m_layoutMode === LayoutMode.LINE || this.m_layoutMode === LayoutMode.HORIZONTAL_FIXED }
    floatMode(): boolean { return this.m_layoutMode === LayoutMode.FLOAT }
    pageMode(): boolean { return this.m_layoutMode === LayoutMode.PAGE }

    isShowInvisible(): boolean { return this.m_showInvisible }
    setShowInvisible(v: boolean): void { this.m_showInvisible = v }
    showUnprintable(): boolean { return this.m_showUnprintable }
    setShowUnprintable(v: boolean): void { this.m_showUnprintable = v }
    showFrames(): boolean { return this.m_showFrames }
    setShowFrames(v: boolean): void { this.m_showFrames = v }
    showPageborders(): boolean { return this.m_showPageborders }
    setShowPageborders(v: boolean): void { this.m_showPageborders = v }
    showSoundFlags(): boolean { return this.m_showSoundFlags }
    setShowSoundFlags(v: boolean): void { this.m_showSoundFlags = v }
    markIrregularMeasures(): boolean { return this.m_markIrregularMeasures }
    setMarkIrregularMeasures(v: boolean): void { this.m_markIrregularMeasures = v }
    showInstrumentNames(): boolean { return this.m_showInstrumentNames }
    setShowInstrumentNames(v: boolean): void { this.m_showInstrumentNames = v }
    printing(): boolean { return this.m_printing }
    setPrinting(v: boolean): void { this.m_printing = v }

    // meta tags

    metaTag(name: string): string { return this.m_metaTags.get(name) ?? '' }
    setMetaTag(name: string, value: string): void { this.m_metaTags.set(name, value) }
    metaTags(): ReadonlyMap<string, string> { return this.m_metaTags }

    // parts & staves

    parts(): Part[] { return this.m_parts }
    appendPart(part: Part): void {
        part.setScore(this)
        this.m_parts.push(part)
    }

    insertPart(part: Part | null, targetPartIdx: number): void {
        if (!part) {
            return
        }

        part.setScore(this)
        this.assignIdIfNeed(part)

        if (targetPartIdx < this.m_parts.length) {
            this.m_parts.splice(targetPartIdx, 0, part)
        } else {
            this.m_parts.push(part)
        }

        // TODO(port): masterScore()->rebuildMidiMapping(), setInstrumentsChanged(true), markInstrumentsAsPrimary(m_parts)
    }

    /** C++ Score::assignIdIfNeed(Part&/Staff&); TODO(port): ids are numbered here, not muse::ID random-ish values */
    assignIdIfNeed(object: Part | Staff): void {
        if (object.id()) {
            return
        }
        const list: readonly (Part | Staff)[] = object.isStaff() ? this.m_staves : this.m_parts
        let id = 1
        for (const o of list) {
            id = Math.max(id, (parseInt(o.id(), 10) || 0) + 1)
        }
        object.setId(String(id))
    }

    staves(): Staff[] { return this.m_staves }
    nstaves(): number { return this.m_staves.length }
    ntracks(): number { return this.m_staves.length * VOICES }
    staff(n: number): Staff | null { return n >= 0 && n < this.m_staves.length ? this.m_staves[n] : null }
    staffIdx(staff: Staff): staff_idx_t { return this.m_staves.indexOf(staff) }

    /** C++ Score::staffIdx(const Part*): index of the first staff of the part */
    staffIdxOfPart(part: Part): staff_idx_t {
        let idx = 0
        for (const p of this.m_parts) {
            if (p === part) {
                break
            }
            idx += p.nstaves()
        }
        return idx
    }

    insertStaff(staff: Staff | null, ridx: staff_idx_t): void {
        if (!staff || !staff.part()) {
            return
        }

        this.assignIdIfNeed(staff)
        staff.part().insertStaff(staff, ridx)

        const idx = this.staffIdxOfPart(staff.part()) + ridx
        this.m_staves.splice(idx, 0, staff)

        // TODO(port): move spanners down (moveDownWhenAddingStaves), updateStavesNumberForSystems()
    }

    /** staves which are not linked to another staff; TODO(port): linked staves */
    uniqueStaves(): staff_idx_t[] {
        return this.m_staves.map((_s, i) => i)
    }

    insertTime(tick: Fraction, len: Fraction): void {
        for (const staff of this.staves()) {
            staff.insertTime(tick, len)
        }
        for (const part of this.parts()) {
            part.insertTime(tick, len)
        }
        // TODO(port): automation (playback)
    }

    /** the key list of the first pitched staff (intersection with the other staves), normalized to concert pitch */
    keyList(): KeyList {
        // find the keylist of the first pitched staff
        let tmpKeymap = new KeyList()
        let firstStaff: Staff | null = null
        let isFirstStaff = true
        for (const s of this.masterScore().staves()) {
            if (!s.isDrumStaff(new Fraction(0, 1))) {
                const km = s.keyList()
                if (isFirstStaff) {
                    isFirstStaff = false
                    for (const [k, v] of km.entries()) {
                        tmpKeymap.set(k, v)
                    }
                    firstStaff = s
                    continue
                }

                // in terms of ticks, tmpKeymap = intersection(tmpKeymap, km)
                // note that if every single staff has a custom local keysig on this tick,
                // we will just copy the one from the top staff.
                const kl = new KeyList()
                for (const [k, v] of tmpKeymap.entries()) {
                    if (km.has(k)) {
                        kl.set(k, v)
                    }
                }
                tmpKeymap = kl
            }
        }
        let normalizedC = Key.C
        const needNormalize = !!firstStaff && !this.masterScore().style().styleB(Sid.concertPitch)
            && (firstStaff.part().instrument().transpose().chromatic !== 0 || firstStaff.part().instruments().size() > 1)
        // normalize the keyevents to concert pitch if necessary
        const nkl = new KeyList()
        for (const [k, v] of tmpKeymap.entries()) {
            if (firstStaff && !v.forInstrumentChange()) {
                const key = v.clone()
                if (needNormalize) {
                    key.setKey(key.concertKey())
                }
                nkl.set(k, key)
            }
        }
        if (needNormalize) {
            const interval = firstStaff!.part().instrument().transpose().chromatic
            normalizedC = Transpose.transposeKey(normalizedC, Interval.fromChromatic(interval))
        }

        // create initial keyevent for transposing instrument if necessary
        if (nkl.empty() || nkl.keyAt(0) !== 0) {
            const ke = nkl.get(0) ?? new KeySigEvent()
            ke.setConcertKey(normalizedC)
            nkl.set(0, ke)
        }

        return nkl
    }

    scoreOrder(): ScoreOrder {
        const order = this.m_scoreOrder.clone()
        order.customized = !order.isScoreOrderOfScore(this)
        return order
    }

    setScoreOrder(order: ScoreOrder): void { this.m_scoreOrder = order }

    setBracketsAndBarlines(): void {
        this.scoreOrder().setBracketsAndBarlines(this)
    }

    /**
     * update measure ticks and the time signature map; this is needed after inserting or removing a measure,
     * changing the sigmap or inserting/deleting time.
     * TODO(port): tempo map (playback), repeat list tempo, anacrusis tempo
     */
    setUpTempoMap(): void {
        let tick = new Fraction(0, 1)
        const fm = this.firstMeasure()
        if (!fm) {
            return
        }

        for (const staff of this.m_staves) {
            staff.clearTimeSig()
        }

        if (this.isMaster()) {
            this.sigmap().clear()
            this.sigmap().addSig(0, new SigEvent(fm.ticks(), fm.timesig(), 0))
        }

        for (let mb = this.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                mb.setTick(tick)
                continue
            }
            const m = mb as Measure
            const mtick = m.tick()
            const diff = tick.minus(mtick)
            const measureTicks = m.ticks()
            m.moveTicks(diff)
            if (m.mmRest()) {
                m.mmRest()!.moveTicks(diff)
            }

            this.rebuildTempoAndTimeSigMaps(m)

            tick = tick.plus(measureTicks)
        }

        this.m_measures.updateTickIndex()
    }

    /** updates the time signature map for a measure; TODO(port): tempo map, pauses, fermatas */
    rebuildTempoAndTimeSigMaps(measure: Measure): void {
        for (let segment = measure.first(); segment; segment = segment.next()) {
            if (segment.isTimeSigType()) {
                for (let staffIdx = 0; staffIdx < this.m_staves.length; ++staffIdx) {
                    const ts = segment.element(staffIdx * VOICES) as TimeSig | null
                    if (ts) {
                        this.staff(staffIdx)!.addTimeSig(ts)
                    }
                }
            }
        }

        // update time signature map
        // create event if measure len and time signature are different
        // even if they are equivalent 4/4 vs 2/2
        // also check if nominal time signature has changed

        if (this.isMaster()) {
            const m = measure
            const mTicks = m.isMMRest() ? m.mmRestFirst()!.ticks() : m.ticks() // for time signature the underlying measure length matters for MM rests

            const pm = measure.prevMeasure()
            // prevMeasure() doesn't return MM rest so we don't handle it here

            if (pm && (!mTicks.identical(pm.ticks()) || !m.timesig().identical(pm.timesig()))) {
                this.sigmap().addSig(m.tick().ticks(), new SigEvent(mTicks, m.timesig(), m.no()))
            }
        }
    }

    autoUpdateSpatium(): void {
        const breathingSpace = 2.5 // allow breathing space between staves
        const minStaffHeight = 2.0 // never make staff smaller than 2.0 mm
        const maxStaffHeight = 7.0 // never make staff bigger than 7.0 mm (default value)

        let availableHeight = (this.style().styleD(Sid.pageHeight)
                               - this.style().styleD(Sid.pageOddTopMargin)
                               - this.style().styleD(Sid.pageOddBottomMargin)) * DPI // convert from inches to DPI
        const titleHeight = (!this.measures().empty() && this.measures().first()!.isVBox()) ? this.measures().first()!.height() : 0.0
        availableHeight -= titleHeight
        const totalNeededSpaces = 4 * this.m_staves.length * breathingSpace
        let targetSpatium = availableHeight / totalNeededSpaces

        let resultingStaffHeight = 4 * targetSpatium / DPI * INCH // conversion from DPI to mm
        resultingStaffHeight = Math.round(resultingStaffHeight * 10) / 10 // round to nearest 0.1 mm
        if (resultingStaffHeight > maxStaffHeight) {
            return
        }
        if (resultingStaffHeight < minStaffHeight) {
            resultingStaffHeight = minStaffHeight
        }

        targetSpatium = (resultingStaffHeight / 4) * DPI / INCH

        this.style().setSpatium(targetSpatium)
        this.styleChanged() // C++ createPaddingTable(); the padding table is computed by the layout here
    }

    appendStaff(staff: Staff): void {
        staff.part().appendStaff(staff)
        this.m_staves.push(staff)
    }

    allStavesInvisible(): boolean {
        return !this.m_staves.some(s => s.show())
    }

    visibleStavesCount(): number {
        return this.m_staves.filter(s => s.show()).length
    }

    systemObjectStaves(): Staff[] { return this.m_systemObjectStaves }
    systemObjectStavesWithTopStaff(): Staff[] {
        const result: Staff[] = []
        const topStaff = this.staff(0)
        if (topStaff) {
            result.push(topStaff)
        }
        return [...result, ...this.m_systemObjectStaves]
    }
    clearSystemObjectStaves(): void { this.m_systemObjectStaves = [] }
    addSystemObjectStaff(staff: Staff): void {
        if (!this.m_systemObjectStaves.includes(staff)) {
            this.m_systemObjectStaves.push(staff)
        }
    }

    // measures

    measures(): MeasureBaseList { return this.m_measures }
    first(): MeasureBase | null { return this.m_measures.first() }
    last(): MeasureBase | null { return this.m_measures.last() }

    firstMeasure(): Measure | null {
        let mb = this.m_measures.first()
        while (mb && !mb.isMeasure()) {
            mb = mb.next()
        }
        return mb as unknown as Measure | null
    }

    firstMeasureMM(): Measure | null {
        const m = this.firstMeasure()
        if (m && this.style().styleB(Sid.createMultiMeasureRests) && m.hasMMRest()) {
            return m.mmRest()
        }
        return m
    }

    /** C++ dummy()->system(): parent for newly created elements */
    dummySystem(): System { return scoreDummyHooks.system!(this) }

    chordList(): ChordList { return this.m_chordList }

    /** C++ Score::checkChordList() (dom/utils.cpp) */
    checkChordList(): void {
        this.m_chordList.checkChordList(this.style())
    }

    lastSegment(): Segment | null {
        const m = this.lastMeasure()
        return m ? m.last() : null
    }

    lastMeasure(): Measure | null {
        let mb = this.m_measures.last()
        while (mb && !mb.isMeasure()) {
            mb = mb.prev()
        }
        return mb as unknown as Measure | null
    }

    lastMeasureMM(): Measure | null {
        const m = this.lastMeasure()
        return m ? m.coveringMMRestOrThis() : null
    }

    endTick(): Fraction {
        const m = this.lastMeasure()
        return m ? m.endTick() : new Fraction(0, 1)
    }

    addMeasure(m: MeasureBase, pos: MeasureBase | null): void {
        m.setNext(pos)
        this.m_measures.add(m)
    }

    tick2measure(tick: Fraction): Measure | null {
        if (tick.eq(new Fraction(-1, 1))) { // special number
            return this.lastMeasure()
        }
        if (tick.le(new Fraction(0, 1))) {
            return this.firstMeasure()
        }
        return this.m_measures.measureByTick(tick.ticks())
    }

    tick2measureMM(t: Fraction): Measure | null {
        if (t.eq(new Fraction(-1, 1))) {
            return this.lastMeasureMM()
        }
        const measure = this.m_measures.measureByTick(t.ticks())
        if (!measure) {
            return null
        }
        return measure.coveringMMRestOrThis()
    }

    tick2measureBase(tick: Fraction): MeasureBase | null {
        for (const mb of this.m_measures.measureBasesAtTick(tick.ticks())) {
            const st = mb.tick()
            const l = mb.ticks()
            if (tick.ge(st) && tick.lt(st.plus(l))) {
                return mb
            }
        }
        return null
    }

    tick2segment(t: Fraction, first = false, st: SegmentType = SegmentType.All, useMMrest = false): Segment | null {
        let tick = t
        let m: Measure | null
        if (useMMrest) {
            m = this.tick2measureMM(tick)
            if (m && m.isMMRest() && !tick.eq(m.endTick())) {
                tick = m.tick()
            }
        } else {
            m = this.tick2measure(tick)
        }
        if (!m) {
            return null
        }
        for (let segment = m.first(st); segment;) {
            const t1 = segment.tick()
            const nsegment = segment.next(st)
            if (tick.eq(t1)) {
                if (first) {
                    return segment
                } else if (!nsegment || tick.lt(nsegment.tick())) {
                    return segment
                }
            }
            segment = nsegment
        }
        return null
    }

    findCR(t: Fraction, track: track_idx_t): ChordRest | null {
        let tick = t
        const m = this.tick2measureMM(tick)
        if (!m) {
            return null
        }
        // attach to first rest all spanner when mmRest
        if (m.isMMRest()) {
            tick = m.tick()
        }
        let s = m.first(SegmentType.ChordRest)
        for (let ns = s; ; ns = ns.next(SegmentType.ChordRest)) {
            if (!ns || ns.tick().gt(tick)) {
                break
            }
            const el = ns.element(track)
            if (el && el.isRest() && (el as unknown as { isGap(): boolean }).isGap()) {
                continue
            } else if (el) {
                s = ns
            }
        }
        if (!s) {
            return null
        }
        const el = s.element(track)
        if (el && el.isRest() && (el as unknown as { isGap(): boolean }).isGap()) {
            return null
        }
        return el as unknown as ChordRest | null
    }

    tick2segmentMM(tick: Fraction, first = false, st: SegmentType = SegmentType.All): Segment | null {
        return this.tick2segment(tick, first, st, true)
    }

    tick2leftSegment(tick: Fraction, useMMrest = false, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        const m = useMMrest ? this.tick2measureMM(tick) : this.tick2measure(tick)
        if (!m) {
            return null
        }
        let ps: Segment | null = null
        for (let s = m.first(segType); s; s = s.next(segType)) {
            if (tick.lt(s.tick())) {
                return ps
            } else if (tick.eq(s.tick())) {
                return s
            }
            ps = s
        }
        return ps
    }

    tick2rightSegment(tick: Fraction, useMMrest = false, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        const m = useMMrest ? this.tick2measureMM(tick) : this.tick2measure(tick)
        if (!m) {
            return null
        }
        for (let s = m.first(segType); s; s = s.next1(segType)) {
            if (tick.le(s.tick())) {
                return s
            }
        }
        return null
    }

    tick2beatType(tick: Fraction): BeatType {
        const m = this.tick2measure(tick)!
        const msrTick = m.tick()
        const timeSig: TimeSigFrac = this.sigmap().timesig(msrTick).nominal()
        let rtick = tick.minus(msrTick).ticks()
        if (m.isAnacrusis()) { // measure is incomplete (anacrusis)
            rtick += timeSig.ticksPerMeasure() - m.ticks().ticks()
        }
        return timeSig.rtick2beatType(rtick)
    }

    // systems & pages

    systems(): System[] { return this.m_systems }
    setSystems(s: System[]): void { this.m_systems = s }
    pages(): Page[] { return this.m_pages }
    setPages(p: Page[]): void { this.m_pages = p }
    npages(): number { return this.m_pages.length }
    pageIdx(page: Page): number { return this.m_pages.indexOf(page) }

    // spanners

    spannerMap(): SpannerMap { return this.m_spanner }
    spanner(): readonly Spanner[] { return this.m_spanner.all() }
    unmanagedSpanners(): Set<Spanner> { return this.m_unmanagedSpanners }

    addSpanner(s: Spanner): void {
        this.m_spanner.addSpanner(s)
        s.added()
    }

    removeSpanner(s: Spanner): void {
        this.m_spanner.removeSpanner(s)
    }

    // ---------------------------------------------------------
    //   checkSpanner
    //    check for spanners that are not attached to anything (C++: editing/edit.cpp)
    // ---------------------------------------------------------

    checkSpanner(_startTick: Fraction, _endTick: Fraction, removeOrphans = true): void {
        const spannersToRemove: Spanner[] = []
        const spannersToShorten: Spanner[] = []
        const lastTick = this.lastMeasure()!.endTick()

        for (const s of [...this.m_spanner.all()]) {
            if (s.isSlur()) {
                let seg = this.tick2segmentMM(s.tick(), false, SegmentType.ChordRest)
                if (!seg || !seg.element(s.track())) {
                    spannersToRemove.push(s)
                } else {
                    seg = this.tick2segmentMM(s.tick2(), false, SegmentType.ChordRest)
                    if (!seg || !seg.element(s.track2())) {
                        spannersToRemove.push(s)
                    }
                }
            } else {
                // remove spanner if there is no start element
                s.computeStartElement()
                if (!s.startElement()) {
                    spannersToRemove.push(s)
                } else if (s.tick2().gt(lastTick)) {
                    spannersToShorten.push(s)
                } else {
                    s.computeEndElement()
                }
            }
        }
        if (removeOrphans) {
            for (const s of spannersToRemove) {
                this.removeSpanner(s)
            }
        }
        for (const s of spannersToShorten) { // shorten spanners that extended past end of score
            s.setTicks(lastTick.minus(s.tick()))
            s.computeEndElement()
        }
    }

    // ---------------------------------------------------------
    //   connectTies
    //    Rebuild tie connections.
    // ---------------------------------------------------------

    connectTies(silent = false): void {
        const tracks = this.nstaves() * VOICES
        const m = this.firstMeasure()
        if (!m) {
            return
        }
        const connectTiesForChord = (c: Chord): void => {
            for (const n of c.notes()) {
                // connect a tie without end note
                if (n.laissezVib()) {
                    continue
                }
                const tie = n.tieFor()
                // TODO(port): tie->updatePossibleJumpPoints()
                if (tie && !tie.isPartialTie() && !tie.endNote()) {
                    const nnote = searchTieNote(n)
                    if (!nnote) {
                        if (!silent) {
                            n.setTieFor(null)
                        }
                    } else {
                        tie.setEndNote(nnote)
                        nnote.setTieBack(tie)
                    }
                }
                // TODO(port): connect a glissando without initial note (old files)
                // spanner with no end element can happen during copy/paste
                for (const spanner of [...n.spannerFor()]) {
                    if (!spanner.endElement()) {
                        n.removeSpannerFor(spanner)
                    }
                }
            }
        }

        const st = SegmentType.ChordRest
        for (let s = m.first(st); s; s = s.next1(st)) {
            for (let track = 0; track < tracks; ++track) {
                const e = s.element(track)
                if (!e || !e.isChord()) {
                    continue
                }
                const c = e as unknown as Chord
                connectTiesForChord(c)
                for (const gc of c.graceNotes()) {
                    connectTiesForChord(gc)
                }
            }
        }
    }

    addUnmanagedSpanner(s: Spanner): void { this.m_unmanagedSpanners.add(s) }
    removeUnmanagedSpanner(s: Spanner): void { this.m_unmanagedSpanners.delete(s) }

    // other

    /** find last chord/rest on staff that ends before tick */
    findChordRestEndingBeforeTickInStaff(tick: Fraction, staffIdx: staff_idx_t): ChordRest | null {
        return this.findChordRestEndingBeforeTickInStaffAndVoice(tick, staffIdx, false, 0)
    }

    findChordRestEndingBeforeTickInTrack(tick: Fraction, trackIdx: track_idx_t): ChordRest | null {
        const m = this.tick2measureMM(tick.minus(Fraction.eps()))
        if (!m) {
            return null
        }
        for (let s = m.last(SegmentType.ChordRest); s; s = s.prev(SegmentType.ChordRest)) {
            const cr = s.element(trackIdx) as ChordRest | null
            if (cr && cr.endTick().le(tick)) {
                return cr
            }
        }
        return null
    }

    /** find last chord/rest on staff and voice that ends before tick (optionally in any voice) */
    findChordRestEndingBeforeTickInStaffAndVoice(tick: Fraction, staffIdx: staff_idx_t, forceVoice: boolean, voice: number): ChordRest | null {
        let ptick = tick.minus(Fraction.eps())
        const m = this.tick2measureMM(ptick)
        if (!m) {
            return null
        }
        // attach to first rest all spanner when mmRest
        if (m.isMMRest()) {
            ptick = m.tick()
        }
        let s = m.first(SegmentType.ChordRest)
        const strack = forceVoice ? staffIdx * VOICES + voice : staffIdx * VOICES
        const etrack = forceVoice ? strack + 1 : strack + VOICES
        let actualTrack = strack
        let lastTick = new Fraction(-1, 1)
        for (let ns = s; ; ns = ns.next(SegmentType.ChordRest)) {
            if (!ns || ns.tick().gt(ptick)) {
                break
            }
            // found a segment; now find longest cr on this staff that does not overlap tick
            for (let t = strack; t < etrack; ++t) {
                const cr = ns.element(t) as ChordRest | null
                if (cr && (!forceVoice || voice === cr.voice())) {
                    const endTick = cr.endTick()
                    if (endTick.ge(lastTick) && endTick.le(tick)) {
                        s = ns
                        actualTrack = t
                        lastTick = endTick
                    }
                }
            }
        }
        return s ? s.element(actualTrack) as ChordRest | null : null
    }

    systemLocks(): SystemLocks { return this.m_systemLocks }
    addSystemLock(lock: SystemLock): void { this.m_systemLocks.add(lock) }
    eidRegister(): Map<string, EngravingObject> { return this.masterScore().m_eidRegister }

    sigmap(): TimeSigMap { return this.masterScore().sigmap() }

    getText(tid: TextStyleType): Text | null {
        const m = this.first()
        if (m && m.isVBox()) {
            for (const e of m.el()) {
                if (e.isText() && (e as Text).textStyleType() === tid) {
                    return e as Text
                }
            }
        }
        return null
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        for (let mb = this.first(); mb; mb = mb.next()) {
            mb.scanElements(func)
            if (mb.isMeasure()) {
                const mmr = (mb as Measure).mmRest()
                if (mmr) {
                    mmr.scanElements(func)
                }
            }
        }
        for (const page of this.m_pages) {
            for (const s of page.systems()) {
                s.scanElements(func)
            }
            func(page)
        }
    }

    override getProperty(_pid: Pid): PropertyValue { return undefined }
    override setProperty(_pid: Pid, _v: PropertyValue): boolean { return false }

    addElement(element: EngravingItem): void {
        const parent = element.parentItem()
        const et = element.type()
        if (et === ElementType.MEASURE
            || (et === ElementType.HBOX && !(parent && parent.isVBox()))
            || et === ElementType.VBOX
            || et === ElementType.TBOX
            || et === ElementType.FBOX) {
            this.measures().add(element as unknown as MeasureBase)
            return
        }
        if (parent) {
            parent.add(element)
        }
        switch (et) {
        case ElementType.BEAM: {
            const b = element as unknown as { elements(): ChordRest[] }
            for (const cr of b.elements()) {
                cr.setBeam(element as never)
            }
            break
        }
        case ElementType.SLUR:
        case ElementType.HAMMER_ON_PULL_OFF:
        case ElementType.VOLTA:
        case ElementType.TRILL:
        case ElementType.VIBRATO:
        case ElementType.PEDAL:
        case ElementType.TEXTLINE:
        case ElementType.HAIRPIN:
        case ElementType.LET_RING:
        case ElementType.GRADUAL_TEMPO_CHANGE:
        case ElementType.PALM_MUTE:
        case ElementType.WHAMMY_BAR:
        case ElementType.RASGUEADO:
        case ElementType.HARMONIC_MARK:
        case ElementType.PICK_SCRAPE:
        case ElementType.PARTIAL_LYRICSLINE:
        case ElementType.OTTAVA: {
            const spanner = element as unknown as Spanner
            if (et === ElementType.TEXTLINE && spanner.anchor() === 3 /* Spanner::Anchor::NOTE */) {
                break
            }
            this.addSpanner(spanner)
            for (const ss of spanner.spannerSegments()) {
                if (ss.system()) {
                    ss.system()!.add(ss)
                }
            }
            // TODO(port): Ottava -> staff()->updateOttava()
            break
        }
        case ElementType.CHORD: {
            const tick = element.tick()
            for (const s of this.m_spanner.findOverlapping(tick.ticks(), tick.ticks())) {
                if (s.track() !== element.track() || !s.isSlur()) {
                    continue
                }
                if (!s.startElement() && s.tick().eq(tick)) {
                    s.setStartElement(element)
                }
                if (!s.endElement() && s.tick2().eq(tick)) {
                    s.setEndElement(element)
                }
            }
            break
        }
        default:
            break
        }
    }

    removeElement(element: EngravingItem): void {
        let parent = element.parentItem()
        const et = element.type()
        const parentIsVBox = !!parent && parent.isVBox()
        if (et === ElementType.MEASURE
            || (et === ElementType.HBOX && !parentIsVBox)
            || et === ElementType.VBOX
            || et === ElementType.TBOX
            || et === ElementType.FBOX) {
            // TODO(port): remove measure from its system/page
            this.measures().remove(element as unknown as MeasureBase)
            return
        }
        if (et === ElementType.BEAM) { // beam parent does not survive layout
            element.resetExplicitParent()
            parent = null
        }
        if (parent) {
            parent.remove(element)
        }
        switch (et) {
        case ElementType.BEAM:
            for (const cr of (element as unknown as { elements(): ChordRest[] }).elements()) {
                cr.setBeam(null)
            }
            break
        case ElementType.SLUR:
        case ElementType.HAMMER_ON_PULL_OFF:
        case ElementType.VOLTA:
        case ElementType.TRILL:
        case ElementType.VIBRATO:
        case ElementType.PEDAL:
        case ElementType.LET_RING:
        case ElementType.GRADUAL_TEMPO_CHANGE:
        case ElementType.PALM_MUTE:
        case ElementType.WHAMMY_BAR:
        case ElementType.RASGUEADO:
        case ElementType.HARMONIC_MARK:
        case ElementType.PICK_SCRAPE:
        case ElementType.TEXTLINE:
        case ElementType.HAIRPIN:
        case ElementType.PARTIAL_LYRICSLINE:
        case ElementType.OTTAVA: {
            const s = element as unknown as Spanner
            this.removeSpanner(s)
            for (const ss of s.spannerSegments()) {
                if (ss.system()) {
                    ss.system()!.remove(ss)
                }
            }
            break
        }
        default:
            break
        }
    }
}
