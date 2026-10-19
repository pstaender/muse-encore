/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/measure.h/.cpp and segmentlist.h/.cpp
 * (editing commands not ported)
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import {
    AccidentalVal, AutoOnOff, BarLineType, DurationType, ElementType, VOICES, nidx, track2voice,
    type staff_idx_t, type track_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag } from './engravingitem'
import { MeasureBase } from './measurebase'
import { Pid } from './property'
import { Segment, SegmentType } from './segment'
import { StaffLines } from './stafflines'
import { AccidentalState } from './key'
import { tpc2alter } from './pitchspelling'
import { absStep, actualTicks, relStep, skipTuplet } from './utils'
import { toDurationList } from './durationtype'
import type { System } from './system'
import type { EngravingObject } from './engravingobject'
import type { Staff } from './staff'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Rest } from './rest'
import type { BarLine } from './barline'
import type { Clef } from './clef'
import type { LayoutBreak } from './layoutbreak'
import type { Spacer } from './spacer'
import type { Tuplet } from './tuplet'

export enum MeasureNumberMode {
    AUTO, // show measure number depending on style
    SHOW, // always show measure number
    HIDE, // don’t show measure number
}

export enum SpacerType {
    UP, DOWN, FIXED,
}

/** factories registered by the corresponding modules (avoid runtime import cycles) */
export const measureFactories: {
    createRest?: (parent: Measure) => Rest
} = {}

export class MStaff {
    private m_measureNumber: EngravingItem | null = null // Measure number text object
    private m_mmRangeText: EngravingItem | null = null // Multi measure rest range text object
    private m_lines: StaffLines | null = null
    private m_vspacerUp: Spacer | null = null
    private m_vspacerDown: Spacer | null = null
    private m_hasVoices = false // indicates that MStaff contains more than one voice
    private m_visible = true
    private m_stemless = false
    private m_hideIfEmpty: AutoOnOff = AutoOnOff.AUTO // whether this MStaff wants its staff to be hidden on its system
    private m_corrupted = false
    private m_measureRepeatCount = 0

    setTrack(track: track_idx_t): void {
        this.m_lines?.setTrack(track)
        this.m_vspacerUp?.setTrack(track)
        this.m_vspacerDown?.setTrack(track)
        this.m_measureNumber?.setTrack(track)
        this.m_mmRangeText?.setTrack(track)
    }

    measureNumber(): EngravingItem | null { return this.m_measureNumber }
    setMeasureNumber(t: EngravingItem | null): void { this.m_measureNumber = t }
    mmRangeText(): EngravingItem | null { return this.m_mmRangeText }
    setMMRangeText(r: EngravingItem | null): void { this.m_mmRangeText = r }
    lines(): StaffLines { return this.m_lines! }
    setLines(l: StaffLines): void { this.m_lines = l }
    vspacerUp(): Spacer | null { return this.m_vspacerUp }
    setVspacerUp(s: Spacer | null): void { this.m_vspacerUp = s }
    vspacerDown(): Spacer | null { return this.m_vspacerDown }
    setVspacerDown(s: Spacer | null): void { this.m_vspacerDown = s }
    hasVoices(): boolean { return this.m_hasVoices }
    setHasVoices(val: boolean): void { this.m_hasVoices = val }
    visible(): boolean { return this.m_visible }
    setVisible(val: boolean): void { this.m_visible = val }
    stemless(): boolean { return this.m_stemless }
    setStemless(val: boolean): void { this.m_stemless = val }
    hideIfEmpty(): AutoOnOff { return this.m_hideIfEmpty }
    setHideIfEmpty(val: AutoOnOff): void { this.m_hideIfEmpty = val }
    corrupted(): boolean { return this.m_corrupted }
    setCorrupted(val: boolean): void { this.m_corrupted = val }
    measureRepeatCount(): number { return this.m_measureRepeatCount }
    setMeasureRepeatCount(n: number): void { this.m_measureRepeatCount = n }
}

export class SegmentList {
    private m_first: Segment | null = null
    private m_last: Segment | null = null
    private m_size = 0

    clear(): void { this.m_first = null; this.m_last = null; this.m_size = 0 }
    size(): number { return this.m_size }

    first(t?: SegmentType | ElementFlag, isFlag = false): Segment | null {
        if (t === undefined) {
            return this.m_first
        }
        for (let s = this.m_first; s; s = s.next()) {
            if (isFlag ? s.flag(t as ElementFlag) : (s.segmentType() & t)) {
                return s
            }
        }
        return null
    }

    firstActive(): Segment | null {
        const segment = this.m_first
        if (segment) {
            return segment.isActive() ? segment : segment.nextActive()
        }
        return null
    }

    last(t?: SegmentType | ElementFlag, isFlag = false): Segment | null {
        if (t === undefined) {
            return this.m_last
        }
        for (let s = this.m_last; s; s = s.prev()) {
            if (isFlag ? s.flag(t as ElementFlag) : (s.segmentType() & t)) {
                return s
            }
        }
        return null
    }

    firstCRSegment(): Segment | null { return this.first(SegmentType.ChordRest) }

    insert(e: Segment, el: Segment | null): void {
        if (!el) {
            this.push_back(e)
        } else if (el === this.m_first) {
            this.push_front(e)
        } else {
            ++this.m_size
            e.setNext(el)
            e.setPrev(el.prev())
            el.prev()!.setNext(e)
            el.setPrev(e)
        }
    }

    remove(e: Segment): void {
        --this.m_size
        if (e === this.m_first) {
            this.m_first = this.m_first.next()
            if (this.m_first) {
                this.m_first.setPrev(null)
            }
            if (e === this.m_last) {
                this.m_last = null
            }
        } else if (e === this.m_last) {
            this.m_last = this.m_last.prev()
            if (this.m_last) {
                this.m_last.setNext(null)
            }
        } else {
            e.prev()!.setNext(e.next())
            e.next()!.setPrev(e.prev())
        }
    }

    push_back(e: Segment): void {
        ++this.m_size
        e.setNext(null)
        if (this.m_last) {
            this.m_last.setNext(e)
        } else {
            this.m_first = e
        }
        e.setPrev(this.m_last)
        this.m_last = e
    }

    push_front(e: Segment): void {
        ++this.m_size
        e.setPrev(null)
        if (this.m_first) {
            this.m_first.setPrev(e)
        } else {
            this.m_last = e
        }
        e.setNext(this.m_first)
        this.m_first = e
    }

    *[Symbol.iterator](): IterableIterator<Segment> {
        for (let s = this.m_first; s; s = s.next()) {
            yield s
        }
    }
}

export class Measure extends MeasureBase {
    private m_mstaves: MStaff[] = []
    private m_segments = new SegmentList()
    private m_mmRest: Measure | null = null // multi measure rest which replaces a measure range
    private m_userStretch = 1.0
    private m_timesig = new Fraction(4, 4)
    private m_mmRestCount = 0 // > 0 if this is a multimeasure rest
    private m_playbackCount = 0
    private m_repeatCount = 2 // end repeat marker and repeat count
    private m_measureNumberMode = MeasureNumberMode.AUTO
    private m_breakMultiMeasureRest = false

    constructor(parent: EngravingObject | null) {
        super(ElementType.MEASURE, parent)
        this.setTicks(new Fraction(4, 4))
        const n = this.score().nstaves()
        for (let staffIdx = 0; staffIdx < n; ++staffIdx) {
            const ms = new MStaff()
            const staff = this.score().staff(staffIdx)!
            ms.setLines(new StaffLines(this))
            ms.lines().setTrack(staffIdx * VOICES)
            ms.lines().setParent(this)
            ms.lines().setVisible(!staff.isLinesInvisible(this.tick()))
            this.m_mstaves.push(ms)
        }
        this.setIrregular(false)
        this.setFlag(ElementFlag.MOVABLE, false)
    }

    createStaves(staffIdx: staff_idx_t): void {
        for (let n = this.m_mstaves.length; n <= staffIdx; ++n) {
            const staff = this.score().staff(n)!
            const s = new MStaff()
            s.setLines(new StaffLines(this))
            s.lines().setParent(this)
            s.lines().setTrack(n * VOICES)
            s.lines().setVisible(!staff.isLinesInvisible(this.tick()))
            this.m_mstaves.push(s)
        }
    }

    private mstaff(staffIndex: staff_idx_t): MStaff | null {
        return staffIndex >= 0 && staffIndex < this.m_mstaves.length ? this.m_mstaves[staffIndex] : null
    }

    override system(): System | null { return this.explicitParent() as unknown as System | null }

    hasVoices(staffIdx: staff_idx_t): boolean {
        const staff = this.mstaff(staffIdx)
        return staff ? staff.hasVoices() : false
    }

    setHasVoices(staffIdx: staff_idx_t, v: boolean): void {
        this.mstaff(staffIdx)?.setHasVoices(v)
    }

    staffPageBoundingRect(staffIdx: staff_idx_t): RectF {
        const s = this.system()
        if (!s) {
            return new RectF()
        }
        const sysStaffPageBbox = s.staff(staffIdx)!.bbox().translated(s.pagePos())
        const measurePageBbox = this.pageBoundingRect()
        return new RectF(measurePageBbox.x(), sysStaffPageBbox.y(), measurePageBbox.width(), sysStaffPageBbox.height())
    }

    staffLines(staffIdx: staff_idx_t): StaffLines {
        return this.mstaff(staffIdx)!.lines()
    }

    vspacerDown(staffIdx: staff_idx_t): Spacer | null { return this.mstaff(staffIdx)?.vspacerDown() ?? null }
    vspacerUp(staffIdx: staff_idx_t): Spacer | null { return this.mstaff(staffIdx)?.vspacerUp() ?? null }

    setStaffVisible(staffIdx: staff_idx_t, visible: boolean): void { this.mstaff(staffIdx)?.setVisible(visible) }
    setStaffStemless(staffIdx: staff_idx_t, stemless: boolean): void { this.mstaff(staffIdx)?.setStemless(stemless) }
    hideStaffIfEmpty(staffIdx: staff_idx_t): AutoOnOff { return this.mstaff(staffIdx)?.hideIfEmpty() ?? AutoOnOff.AUTO }
    setHideStaffIfEmpty(staffIdx: staff_idx_t, v: AutoOnOff): void { this.mstaff(staffIdx)?.setHideIfEmpty(v) }
    corrupted(staffIdx: staff_idx_t): boolean { return this.m_mstaves[staffIdx].corrupted() }
    setCorrupted(staffIdx: staff_idx_t, val: boolean): void { this.m_mstaves[staffIdx].setCorrupted(val) }
    measureNumber(staffIdx: staff_idx_t): EngravingItem | null { return this.m_mstaves[staffIdx].measureNumber() }
    setMeasureNumber(staffIdx: staff_idx_t, t: EngravingItem | null): void { this.m_mstaves[staffIdx].setMeasureNumber(t) }
    mmRangeText(staffIdx: staff_idx_t): EngravingItem | null { return this.m_mstaves[staffIdx].mmRangeText() }
    setMMRangeText(staffIdx: staff_idx_t, t: EngravingItem | null): void { this.m_mstaves[staffIdx].setMMRangeText(t) }

    mstaves(): MStaff[] { return this.m_mstaves }

    // ---------------------------------------------------------
    //   checkMeasure
    //    after opening / paste and every read operation
    //    this method checks for gaps and fills them
    //    with invisible rests (C++: dom/check.cpp)
    // ---------------------------------------------------------

    checkMeasure(staffIdx: staff_idx_t, useGapRests = true): void {
        if (this.isMMRest()) {
            return
        }
        const strack = staffIdx * VOICES
        const dtrack = strack + (this.hasVoices(staffIdx) ? VOICES : 1)
        const stretch = this.score().staff(staffIdx)!.timeStretch(this.tick())
        const f = this.ticks().times(stretch)

        for (let track = strack; track < dtrack; track++) {
            let expectedPos = new Fraction(0, 1)
            let currentPos = new Fraction(0, 1)
            for (let seg = this.first(SegmentType.ChordRest); seg; seg = seg.next(SegmentType.ChordRest)) {
                const e = seg.element(track)
                if (!e) {
                    continue
                }
                const cr = e as unknown as ChordRest
                currentPos = seg.rtick().times(stretch)
                if (currentPos.lt(expectedPos)) {
                    // in measure overrun
                    break
                } else if (currentPos.gt(expectedPos)) {
                    // in measure underrun
                    this.fillGap(expectedPos, currentPos.minus(expectedPos), track, stretch, useGapRests)
                    if (currentPos.ge(f)) {
                        break
                    }
                }
                let de: { ticks(): Fraction } = cr
                const tuplet = cr.topTuplet()
                if (tuplet) {
                    seg = skipTuplet(tuplet)
                    de = tuplet
                }
                expectedPos = currentPos.plus(de.ticks())
            }
            if (f.gt(expectedPos)) {
                // don't fill empty voices
                if (expectedPos.isNotZero() || track2voice(track) === 0) {
                    this.fillGap(expectedPos, f.minus(expectedPos), track, stretch)
                }
            }
        }
    }

    /** fill gap with rests (C++: dom/check.cpp) */
    fillGap(rtickStart: Fraction, len: Fraction, track: track_idx_t, stretch: Fraction, useGapRests = true): void {
        // TODO(port): C++ uses toRhythmicDurationList() which splits the gap at beat boundaries
        const durationList = toDurationList(len, true)
        let curTick = this.tick().plus(actualTicks(rtickStart, null, stretch))
        for (const d of durationList) {
            const rest = measureFactories.createRest!(this)
            rest.setTicks(d.isMeasure() ? this.ticks().times(stretch) : d.fraction())
            rest.setDurationType(d)
            rest.setTrack(track)
            rest.setGap(useGapRests)
            const seg = this.getSegment(SegmentType.ChordRest, curTick)
            seg.add(rest)
            curTick = curTick.plus(rest.actualTicks())
        }
    }

    /** TODO(port): two-chord tremolos are not ported yet */
    connectTremolo(): void {}

    measureNumberMode(): MeasureNumberMode { return this.m_measureNumberMode }
    setMeasureNumberMode(v: MeasureNumberMode): void { this.m_measureNumberMode = v }
    timesig(): Fraction { return this.m_timesig }
    setTimesig(f: Fraction): void { this.m_timesig = f }
    stretchedLen(staff: Staff): Fraction { return this.ticks().times(staff.timeStretch(this.tick())) }
    isIrregular(): boolean { return !this.m_timesig.eq(this.m_len) }

    size(): number { return this.m_segments.size() }
    first(t?: SegmentType): Segment | null { return this.m_segments.first(t) }
    firstEnabled(): Segment | null { return this.m_segments.first(ElementFlag.ENABLED, true) }
    firstActive(): Segment | null { return this.m_segments.firstActive() }
    last(t?: SegmentType): Segment | null { return this.m_segments.last(t) }
    lastEnabled(): Segment | null { return this.m_segments.last(ElementFlag.ENABLED, true) }
    segments(): SegmentList { return this.m_segments }

    userStretch(): number {
        // TODO(port): LayoutMode::FLOAT
        return this.m_userStretch
    }
    setUserStretch(v: number): void { this.m_userStretch = v }

    computeTicks(): void {
        for (let segment = this.firstActive(); segment; segment = segment.nextActive()) {
            const nextSegment = segment.nextActive()
            const nextTick = nextSegment ? nextSegment.rtick() : this.ticks()
            segment.setTicks(nextTick.minus(segment.rtick()))
        }
        for (let segment = this.first(SegmentType.TimeTick); segment; segment = segment.next(SegmentType.TimeTick)) {
            segment.setTicks(new Fraction(0, 1))
            let nextSegment = segment.next()
            while (nextSegment) {
                const tickDiff = nextSegment.rtick().minus(segment.rtick())
                if (!tickDiff.isZero()) {
                    segment.setTicks(tickDiff)
                    break
                }
                nextSegment = nextSegment.next()
            }
            if (segment.ticks().isZero()) {
                segment.setTicks(this.ticks().minus(segment.rtick()))
            }
        }
    }

    anacrusisOffset(): Fraction {
        return this.isAnacrusis() ? this.timesig().minus(this.ticks()) : new Fraction(0, 1)
    }

    maxTicks(): Fraction {
        let s = this.first()
        let maxticks = new Fraction(0, 1)
        if (this.isMMRest()) {
            return this.timesig()
        }
        while (s) {
            if (s.enabled() && s.isChordRestType()) {
                maxticks = Fraction.max2(maxticks, s.ticks())
            }
            s = s.next()
        }
        return maxticks
    }

    showMeasureNumberInAutoMode(): boolean {
        const style = this.style()
        if (!style.styleB(Sid.showMeasureNumber)) {
            return false
        }
        if (this.irregular()) {
            return false
        }
        const interval = style.styleI(Sid.measureNumberInterval)
        const prevMeasure = this.prevMeasure()
        if (this.isFirstInSection() || (prevMeasure && prevMeasure.irregular() && prevMeasure.isFirstInSection() && interval !== 1)) {
            return style.styleB(Sid.showMeasureNumberOne)
        }
        if (style.styleB(Sid.measureNumberSystem)) {
            return this.isFirstInSystem()
                   || (!!prevMeasure && prevMeasure.irregular() && prevMeasure.isFirstInSystem())
        } else {
            if (interval === 1) {
                return true
            }
            return ((this.no() + 1) % interval) === (style.styleB(Sid.showMeasureNumberOne) ? 1 : 0)
        }
    }

    showMeasureNumberOnStaff(staffIdx: staff_idx_t): boolean {
        if (staffIdx >= this.score().nstaves()) {
            return false
        }
        return this.showMeasureNumber() && this.score().staff(staffIdx)!.shouldShowMeasureNumbers()
               && !this.score().allStavesInvisible()
    }

    showMeasureNumber(): boolean {
        switch (this.m_measureNumberMode) {
        case MeasureNumberMode.AUTO:
            return this.showMeasureNumberInAutoMode()
        case MeasureNumberMode.SHOW:
            return true
        case MeasureNumberMode.HIDE:
            break
        }
        return false
    }

    findChord(t: Fraction, track: track_idx_t): Chord | null {
        t = t.minus(this.tick())
        for (let seg = this.last(); seg; seg = seg.prev()) {
            if (seg.rtick().lt(t)) {
                return null
            }
            if (seg.rtick().eq(t)) {
                const el = seg.element(track)
                if (el && el.isChord()) {
                    return el as Chord
                }
            }
        }
        return null
    }

    findChordRest(t: Fraction, track: track_idx_t): ChordRest | null {
        t = t.minus(this.tick())
        for (const seg of this.m_segments) {
            if (seg.rtick().gt(t)) {
                return null
            }
            if (seg.rtick().eq(t)) {
                const el = seg.element(track)
                if (el && el.isChordRest()) {
                    return el as ChordRest
                }
            }
        }
        return null
    }

    tick2segment(t0: Fraction, st: SegmentType = SegmentType.ChordRest): Segment | null {
        const t = t0.minus(this.tick())
        for (const s of this.m_segments) {
            if (s.rtick().eq(t)) {
                if (s.segmentType() & st) {
                    return s
                }
            }
            if (s.rtick().gt(t)) {
                break
            }
        }
        return null
    }

    findSegmentR(st: SegmentType, t: Fraction): Segment | null {
        let s: Segment | null
        if (t.gt(this.ticks().times(new Fraction(1, 2)))) {
            for (s = this.last(); s && s.rtick().gt(t); s = s.prev()) {
                // nothing
            }
            while (s && s.prev() && s.prev()!.rtick().eq(t)) {
                s = s.prev()
            }
        } else {
            for (s = this.first(); s && s.rtick().lt(t); s = s.next()) {
                // nothing
            }
        }
        for (; s && s.rtick().eq(t); s = s.next()) {
            if (s.segmentType() & st) {
                return s
            }
        }
        return null
    }

    findFirstR(st: SegmentType, t: Fraction): Segment | null {
        for (let s = this.first(); s && s.rtick().le(t); s = s.next()) {
            if (s.segmentType() & st) {
                return s
            }
        }
        return null
    }

    getSegmentR(st: SegmentType, t: Fraction): Segment {
        let s = this.findSegmentR(st, t)
        if (!s) {
            s = new Segment(this, st, t)
            this.add(s)
        }
        return s
    }

    /** no undo in the port */
    undoGetSegmentR(st: SegmentType, t: Fraction): Segment { return this.getSegmentR(st, t) }

    findSegment(st: SegmentType, f: Fraction): Segment | null { return this.findSegmentR(st, f.minus(this.tick())) }
    getSegment(st: SegmentType, f: Fraction): Segment { return this.getSegmentR(st, f.minus(this.tick())) }
    undoGetSegment(st: SegmentType, f: Fraction): Segment { return this.getSegment(st, f) }

    getChordRestOrTimeTickSegment(f: Fraction): Segment {
        let seg = this.findSegment(SegmentType.ChordRest, f)
        if (!seg) {
            seg = this.findSegment(SegmentType.TimeTick, f)
        }
        if (!seg) {
            if (f.minus(this.tick()).eq(this.ticks())) { // end of measure
                seg = this.getSegment(SegmentType.TimeTick, f)
            } else {
                seg = this.getSegment(SegmentType.ChordRest, f)
            }
        }
        return seg
    }

    override add(e: EngravingItem): void {
        if (e.explicitParent() !== this) {
            e.setParent(this)
        }
        switch (e.type()) {
        case ElementType.SEGMENT: {
            const seg = e as Segment
            const t = seg.rtick()
            let s: Segment | null
            for (s = this.first(); s && s.rtick().lt(t); s = s.next()) {
                // nothing
            }
            while (s && s.rtick().eq(t)) {
                if (!seg.isChordRestType() && (seg.segmentType() === s.segmentType())) {
                    if (seg.isSegType(SegmentType.BarLineType)) {
                        this.m_segments.remove(s)
                        s = s.next()
                        continue
                    }
                }
                if (seg.goesBefore(s)) {
                    break
                }
                s = s.next()
            }
            seg.setParent(this)
            this.m_segments.insert(seg, s)
            if (seg.header()) {
                seg.measure().setHeader(true)
            }
            if (seg.trailer()) {
                seg.measure().setTrailer(true)
            }
            break
        }
        case ElementType.MEASURE_NUMBER:
            if (e.staffIdx() < this.m_mstaves.length) {
                if (e.isStyled(Pid.OFFSET)) {
                    e.setOffset(e.propertyDefault(Pid.OFFSET) as PointF)
                }
                this.m_mstaves[e.staffIdx()].setMeasureNumber(e)
            }
            break
        case ElementType.MMREST_RANGE:
            if (e.staffIdx() < this.m_mstaves.length) {
                if (e.isStyled(Pid.OFFSET)) {
                    e.setOffset(e.propertyDefault(Pid.OFFSET) as PointF)
                }
                this.m_mstaves[e.staffIdx()].setMMRangeText(e)
            }
            break
        case ElementType.SPACER: {
            const sp = e as Spacer
            switch (sp.spacerType()) {
            case SpacerType.UP:
                this.m_mstaves[e.staffIdx()].setVspacerUp(sp)
                break
            case SpacerType.DOWN:
            case SpacerType.FIXED:
                this.m_mstaves[e.staffIdx()].setVspacerDown(sp)
                break
            }
            break
        }
        case ElementType.JUMP:
        case ElementType.MARKER:
            if (e.isJump() || (e.isMarker() && (e as unknown as { isRightMarker(): boolean }).isRightMarker())) {
                this.setRepeatJump(true)
            }
            this.el().push(e)
            break
        case ElementType.HBOX:
            if (e.staff()) {
                e.mutldata().setMag(e.staff()!.staffMag(this.tick()))
            }
            this.el().push(e)
            break
        case ElementType.MEASURE:
            this.m_mmRest = e as unknown as Measure
            break
        default:
            super.add(e)
            return
        }
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.SEGMENT: {
            const s = e as Segment
            this.m_segments.remove(s)
            if (s.header()) {
                s.measure().checkHeader()
            }
            if (s.trailer()) {
                s.measure().checkTrailer()
            }
            break
        }
        case ElementType.MEASURE_NUMBER:
            this.m_mstaves[e.staffIdx()].setMeasureNumber(null)
            break
        case ElementType.MMREST_RANGE:
            this.m_mstaves[e.staffIdx()].setMMRangeText(null)
            break
        case ElementType.SPACER:
            switch ((e as Spacer).spacerType()) {
            case SpacerType.DOWN:
            case SpacerType.FIXED:
                this.m_mstaves[e.staffIdx()].setVspacerDown(null)
                break
            case SpacerType.UP:
                this.m_mstaves[e.staffIdx()].setVspacerUp(null)
                break
            }
            break
        case ElementType.JUMP:
        case ElementType.MARKER:
        case ElementType.HBOX: {
            const i = this.el().indexOf(e)
            if (i >= 0) {
                this.el().splice(i, 1)
            }
            break
        }
        case ElementType.CLEF:
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.MMREST:
        case ElementType.TIMESIG:
            for (let segment = this.first(); segment; segment = segment.next()) {
                const tracks = this.score().nstaves() * VOICES
                for (let track = 0; track < tracks; ++track) {
                    if (segment.element(track) === e) {
                        segment.setElement(track, null)
                        return
                    }
                }
            }
            break
        case ElementType.MEASURE:
            this.m_mmRest = null
            break
        default:
            super.remove(e)
            return
        }
    }

    override moveTicks(diff: Fraction): void {
        // This part must be run also for diff = 0
        for (let segment = this.last(); segment; segment = segment.prev()) {
            if (segment.segmentType() & (SegmentType.EndBarLine | SegmentType.TimeSigAnnounce)) {
                segment.setRtick(this.ticks())
            }
        }
        if (diff.numerator() === 0) {
            return
        }
        const tuplets = new Set<Tuplet>()
        this.setTick(this.tick().plus(diff))
        for (let segment = this.last(); segment; segment = segment.prev()) {
            if (segment.isChordRestType()) {
                // Tuplet ticks are stored as absolute ticks, so they must be adjusted.
                for (const e of segment.elist()) {
                    if (e) {
                        const tuplet = (e as ChordRest).tuplet()
                        if (tuplet && !tuplets.has(tuplet)) {
                            tuplet.setTick(tuplet.tick().plus(diff))
                            tuplets.add(tuplet)
                        }
                    }
                }
            }
        }
    }

    findAccidental(note: Note): AccidentalVal {
        const chord = note.chord()
        const vStaff = chord.score().staff(chord.vStaffIdx())!
        const tversatz = new AccidentalState() // state of already set accidentals for this measure
        tversatz.init(vStaff.keySigEvent(this.tick()))

        const startTrack = vStaff.part().startTrack()
        const mainTrack = chord.vStaffIdx() * VOICES
        const endTrack = vStaff.part().endTrack()

        for (let segment = this.first(); segment; segment = segment.next()) {
            if (segment.isKeySigType()) {
                const ks = segment.element(mainTrack)
                if (!ks) {
                    continue
                }
                tversatz.init(vStaff.keySigEvent(segment.tick()))
            } else if (segment.segmentType() === SegmentType.ChordRest) {
                for (let track = startTrack; track < endTrack; ++track) {
                    const e = segment.element(track)
                    if (!e || !e.isChord()) {
                        continue
                    }
                    const crd = e as Chord
                    for (const chord1 of crd.graceNotes()) {
                        if (chord1.vStaffIdx() !== chord.vStaffIdx()) {
                            continue
                        }
                        for (const note1 of chord1.notes()) {
                            if (note1.tieBack() && !note1.accidental()) {
                                continue
                            }
                            const tpc = note1.tpc()
                            const line = absStep(tpc, note1.epitch())
                            if (note === note1) {
                                return tversatz.accidentalVal(line)
                            }
                            tversatz.setAccidentalVal(line, tpc2alter(tpc))
                        }
                    }
                    if (crd.vStaffIdx() !== chord.vStaffIdx()) {
                        continue
                    }
                    for (const note1 of crd.notes()) {
                        if (note1.tieBack() && !note1.accidental()) {
                            continue
                        }
                        const tpc = note1.tpc()
                        const line = absStep(tpc, note1.epitch())
                        if (note === note1) {
                            return tversatz.accidentalVal(line)
                        }
                        tversatz.setAccidentalVal(line, tpc2alter(tpc))
                    }
                }
            }
        }
        return AccidentalVal.NATURAL
    }

    /** returns [value, error] */
    findAccidentalAtLine(s: Segment, staffIdx: staff_idx_t, line: number): [AccidentalVal, boolean] {
        const tversatz = new AccidentalState()
        const staff = this.score().staff(staffIdx)!
        tversatz.init(staff.keySigEvent(this.tick()))
        const st = SegmentType.ChordRest
        const startTrack = staff.part().startTrack()
        const endTrack = staff.part().endTrack()
        for (let segment = this.first(st); segment; segment = segment.next(st)) {
            if (segment === s && staff.isPitchedStaff(this.tick())) {
                const clef = staff.clef(s.tick())
                const l = relStep(line, clef)
                return tversatz.accidentalValChecked(l)
            }
            for (let track = startTrack; track < endTrack; ++track) {
                const e = segment.element(track)
                if (!e || !e.isChord()) {
                    continue
                }
                const chord = e as Chord
                for (const chord1 of chord.graceNotes()) {
                    if (chord1.vStaffIdx() !== staffIdx) {
                        continue
                    }
                    for (const note of chord1.notes()) {
                        if (note.tieBack() && !note.accidental()) {
                            continue
                        }
                        const tpc = note.tpc()
                        tversatz.setAccidentalVal(absStep(tpc, note.epitch()), tpc2alter(tpc))
                    }
                }
                if (chord.vStaffIdx() !== staffIdx) {
                    continue
                }
                for (const note of chord.notes()) {
                    if (note.tieBack() && !note.accidental()) {
                        continue
                    }
                    const tpc = note.tpc()
                    tversatz.setAccidentalVal(absStep(tpc, note.epitch()), tpc2alter(tpc))
                }
            }
        }
        return [AccidentalVal.NATURAL, false]
    }

    tick2pos(tck: Fraction): number {
        tck = tck.minus(this.tick())
        if (this.isMMRest()) {
            const s = this.first(SegmentType.ChordRest)!
            const x1 = s.x()
            const w = this.width() - x1
            return x1 + (tck.ticks() * w) / (this.ticks().ticks() * this.mmRestCount())
        }
        let s: Segment | null
        let x1 = 0
        let x2 = 0
        let tick1 = new Fraction(0, 1)
        let tick2 = new Fraction(0, 1)
        for (s = this.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            x2 = s.x()
            tick2 = s.rtick()
            if (tck.eq(tick2)) {
                return x2 + this.pos().x()
            }
            if (tck.le(tick2)) {
                break
            }
            x1 = x2
            tick1 = tick2
        }
        if (!s) {
            x2 = this.width()
            tick2 = this.ticks()
        }
        const dx = x2 - x1
        const dt = tick2.minus(tick1)
        x1 += dt.isZero() ? 0.0 : (dx * (tck.ticks() - tick1.ticks()) / dt.ticks())
        return x1 + this.pos().x()
    }

    checkMultiVoices(staffIdx: staff_idx_t): void {
        this.m_mstaves[staffIdx].setHasVoices(this.hasVoicesInRange(staffIdx, this.tick(), this.ticks()))
    }

    hasVoicesInRange(staffIdx: staff_idx_t, stick: Fraction, len: Fraction, considerInvisible = false): boolean {
        const st = this.score().staff(staffIdx)!
        if (st.isTabStaff(stick)) {
            stick = this.tick()
            len = this.stretchedLen(st)
        }
        const strack = staffIdx * VOICES + 1
        const etrack = staffIdx * VOICES + VOICES
        const etick = stick.plus(len)
        for (let s = this.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            if (s.tick().ge(etick)) {
                break
            }
            for (let track = strack; track < etrack; ++track) {
                const cr = s.element(track) as ChordRest | null
                if (cr) {
                    if (cr.endTick().le(stick)) {
                        continue
                    }
                    if (considerInvisible) {
                        return true
                    }
                    let v = false
                    if (cr.isChord()) {
                        const c = cr as Chord
                        if ((c.stem() && c.stem()!.visible())
                            || (c.hook() && c.hook()!.visible())
                            || (c.beam() && c.beam()!.visible())) {
                            v = true
                        } else {
                            v = c.notes().some(n => n.visible())
                        }
                    } else if (cr.isRest()) {
                        v = cr.visible() && !(cr as Rest).isGap()
                    }
                    if (v) {
                        return true
                    }
                }
            }
        }
        return false
    }

    hasVoice(track: track_idx_t): boolean {
        if (track >= this.score().ntracks()) {
            return false
        }
        for (let s = this.first(); s; s = s.next()) {
            if (s.segmentType() !== SegmentType.ChordRest) {
                continue
            }
            if (s.element(track)) {
                return true
            }
        }
        return false
    }

    isEmpty(staffIdx: staff_idx_t): boolean {
        if (this.isMMRest()) {
            return true
        }
        let strack: number
        let etrack: number
        if (staffIdx === nidx) {
            strack = 0
            etrack = this.score().nstaves() * VOICES
        } else {
            strack = staffIdx * VOICES
            etrack = strack + VOICES
        }
        // TODO(port): measure repeat groups
        for (let s = this.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            for (let track = strack; track < etrack; ++track) {
                let e = s.element(track)
                if (e && !e.isRest()) {
                    return false
                }
                // Check for cross-staff chords
                const hasStaves = this.score().staff(Math.trunc(track / VOICES))!.part().staves().length > 1
                if (hasStaves) {
                    if (strack >= VOICES) {
                        e = s.element(track - VOICES)
                        if (e && !e.isRest() && e.vStaffIdx() === staffIdx) {
                            return false
                        }
                    }
                    if (etrack < this.score().nstaves() * VOICES) {
                        e = s.element(track + VOICES)
                        if (e && !e.isRest() && e.vStaffIdx() === staffIdx) {
                            return false
                        }
                    }
                }
            }
            for (const a of s.annotations()) {
                if (a && staffIdx === nidx) {
                    return false
                }
                if (!a || a.systemFlag() || !a.visible() || a.isFermata()) {
                    continue
                }
                const atrack = a.track()
                if (atrack >= strack && atrack < etrack) {
                    return false
                }
            }
        }
        return true
    }

    isCutawayClef(staffIdx: staff_idx_t): boolean {
        if (!this.score().staff(staffIdx) || !this.m_mstaves[staffIdx]) {
            return false
        }
        const empty = (this.score().staff(staffIdx)!.cutaway() && this.isEmpty(staffIdx)) || !this.m_mstaves[staffIdx].visible()
        if (!empty) {
            return false
        }
        const strack = staffIdx * VOICES
        const etrack = strack + VOICES
        let s: Segment | null = null
        for (let ls = this.last(); ls; ls = ls.prev()) {
            if (ls.segmentType() === SegmentType.EndBarLine) {
                s = ls.prev()
                break
            }
        }
        while (s && (s.isTimeTickType() || s.isBreathType())) {
            s = s.prev()
        }
        if (!s) {
            return false
        }
        for (let track = strack; track < etrack; ++track) {
            const e = s.element(track)
            if (!e || !e.isClef()) {
                continue
            }
            const nm = this.nextMeasure()
            if ((nm && (nm.system() === this.system())) || (e as Clef).showCourtesy()) {
                return true
            }
        }
        return false
    }

    isFullMeasureRest(): boolean {
        const etrack = this.score().nstaves() * VOICES
        const s = this.first(SegmentType.ChordRest)!
        for (let track = 0; track < etrack; ++track) {
            const e = s.element(track)
            if (e) {
                if (!e.isRest()) {
                    return false
                }
                if ((e as Rest).durationType().type() !== DurationType.V_MEASURE) {
                    return false
                }
            }
        }
        return true
    }

    override visible(staffIdx?: staff_idx_t): boolean {
        if (staffIdx === undefined) {
            return super.visible()
        }
        if (staffIdx < 0 || staffIdx >= this.score().staves().length) {
            return false
        }
        const sys = this.system()
        if (sys && (sys.staves().length === 0 || !sys.staff(staffIdx)!.show())) {
            return false
        }
        if (this.score().staff(staffIdx)!.cutaway() && this.isEmpty(staffIdx)) {
            return false
        }
        return this.score().staff(staffIdx)!.show() && this.m_mstaves[staffIdx].visible()
    }

    stemless(staffIdx: staff_idx_t): boolean {
        const staff = this.score().staff(staffIdx)
        if (!staff) {
            return false
        }
        return staff.stemless(this.tick()) || this.m_mstaves[staffIdx].stemless() || staff.staffType(this.tick()).stemless()
    }

    isFinalMeasureOfSection(): boolean {
        let mb: MeasureBase | null = this
        do {
            if (mb.sectionBreak()) {
                return true
            }
            mb = mb.next()
        } while (mb && !mb.isMeasure()) // loop until reach next actual measure or end of score
        return false
    }

    sectionBreakElementIncludingFrames(includeNextFrames = true): LayoutBreak | null {
        let mb: MeasureBase | null = this
        do {
            const sectionBreak = mb.sectionBreakElement()
            if (sectionBreak) {
                return sectionBreak
            }
            mb = mb.next()
        } while (includeNextFrames && mb && !mb.isMeasure())
        return null
    }

    isAnacrusis(): boolean {
        const pm = this.prev()
        if (this.irregular() || !pm || pm.isBox() || pm.lineBreak() || pm.pageBreak() || pm.sectionBreak()) {
            if (this.timesig().minus(this.ticks()).gt(new Fraction(0, 1))) {
                return true
            }
        }
        return false
    }

    isFirstInSystem(): boolean {
        const sys = this.system()
        return !!sys && sys.firstMeasure() === this
    }

    isLastInSystem(): boolean {
        const sys = this.system()
        return !!sys && sys.lastMeasure() === this
    }

    isFirstInSection(): boolean {
        for (let m = this.prev(); m; m = m.prev()) {
            if (m.sectionBreak()) {
                return true
            } else if (m.isMeasure()) {
                return false
            }
        }
        return true
    }

    breakMultiMeasureRest(): boolean { return this.m_breakMultiMeasureRest }
    setBreakMultiMeasureRest(val: boolean): void { this.m_breakMultiMeasureRest = val }

    empty(): boolean {
        if (this.irregular()) {
            return false
        }
        let n = 0
        const tracks = this.m_mstaves.length * VOICES
        const st = SegmentType.ChordRest
        for (let s = this.first(st); s; s = s.next(st)) {
            let restFound = false
            for (let track = 0; track < tracks; ++track) {
                if ((track % VOICES) === 0 && !this.score().staff(Math.trunc(track / VOICES))!.show()) {
                    track += VOICES - 1
                    continue
                }
                if (s.element(track)) {
                    if (!s.element(track)!.isRest()) {
                        return false
                    }
                    restFound = true
                }
            }
            if (restFound) {
                ++n
            }
            if (n > 1) {
                return false
            }
        }
        return true
    }

    isOnlyRests(track: track_idx_t): boolean {
        const st = SegmentType.ChordRest
        for (let s = this.first(st); s; s = s.next(st)) {
            if (s.segmentType() !== st || !s.element(track)) {
                continue
            }
            if (!s.element(track)!.isRest()) {
                return false
            }
        }
        return true
    }

    playbackCount(): number { return this.m_playbackCount }
    setPlaybackCount(val: number): void { this.m_playbackCount = val }

    repeatCount(): number { return this.m_repeatCount }
    setRepeatCount(val: number): void { this.m_repeatCount = val }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TIMESIG_NOMINAL:
            return this.m_timesig
        case Pid.TIMESIG_ACTUAL:
            return this.m_len
        case Pid.MEASURE_NUMBER_MODE:
            return this.measureNumberMode()
        case Pid.BREAK_MMR:
            return this.breakMultiMeasureRest()
        case Pid.REPEAT_COUNT:
            return this.repeatCount()
        case Pid.USER_STRETCH:
            return this.userStretch()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, value: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TIMESIG_NOMINAL:
            this.m_timesig = value as Fraction
            break
        case Pid.TIMESIG_ACTUAL:
            this.m_len = value as Fraction
            break
        case Pid.MEASURE_NUMBER_MODE:
            this.setMeasureNumberMode(value as MeasureNumberMode)
            break
        case Pid.BREAK_MMR:
            this.setBreakMultiMeasureRest(!!value)
            break
        case Pid.REPEAT_COUNT:
            this.setRepeatCount(value as number)
            break
        case Pid.USER_STRETCH:
            this.setUserStretch(value as number)
            break
        default:
            return super.setProperty(propertyId, value)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TIMESIG_NOMINAL:
        case Pid.TIMESIG_ACTUAL:
            return undefined
        case Pid.MEASURE_NUMBER_MODE:
            return MeasureNumberMode.AUTO
        case Pid.BREAK_MMR:
            return false
        case Pid.REPEAT_COUNT:
            return 2
        case Pid.USER_STRETCH:
            return 1.0
        case Pid.NO_OFFSET:
            return 0
        case Pid.IRREGULAR:
            return false
        default:
            return super.propertyDefault(propertyId)
        }
    }

    hasMMRest(): boolean { return this.m_mmRest !== null }
    override isMMRest(): boolean { return this.m_mmRestCount > 0 }
    mmRest(): Measure | null { return this.m_mmRest }
    setMMRest(m: Measure | null): void { this.m_mmRest = m }
    mmRestCount(): number { return this.m_mmRestCount }
    setMMRestCount(n: number): void { this.m_mmRestCount = n }

    mmRestFirst(): Measure | null {
        if (this.prev()) {
            return this.prev()!.next() as unknown as Measure
        }
        return this.score().firstMeasure()
    }

    mmRestLast(): Measure | null {
        if (this.next()) {
            return this.next()!.prev() as unknown as Measure
        }
        return this.score().lastMeasure()
    }

    coveringMMRestOrThis(): Measure {
        if (!this.style().styleB(Sid.createMultiMeasureRests)) {
            return this
        }
        if (this.m_mmRest) {
            return this.m_mmRest
        }
        if (this.m_mmRestCount !== -1) {
            return this
        }
        let m: Measure | null = this
        while (m && !m.m_mmRest) {
            m = m.prevMeasure()
        }
        return m ? m.m_mmRest! : this
    }

    // TODO(port): measure repeats
    measureRepeatCount(staffIdx: staff_idx_t): number {
        return staffIdx < this.m_mstaves.length ? this.m_mstaves[staffIdx].measureRepeatCount() : 0
    }
    setMeasureRepeatCount(n: number, staffIdx: staff_idx_t): void {
        if (staffIdx < this.m_mstaves.length) {
            this.m_mstaves[staffIdx].setMeasureRepeatCount(n)
        }
    }

    isMeasureRepeatGroup(staffIdx: staff_idx_t): boolean { return this.measureRepeatCount(staffIdx) > 0 }
    isOneMeasureRepeat(_staffIdx: staff_idx_t): boolean { return false }

    lastChordRest(track: track_idx_t): ChordRest | null {
        for (let seg = this.last(); seg; seg = seg.prev()) {
            if (!seg.isChordRestType()) {
                continue
            }
            const cr = seg.cr(track)
            if (cr) {
                return cr
            }
        }
        return null
    }

    firstChordRest(track: track_idx_t): ChordRest | null {
        for (let seg = this.first(); seg; seg = seg.next()) {
            if (!seg.isChordRestType()) {
                continue
            }
            const cr = seg.cr(track)
            if (cr) {
                return cr
            }
        }
        return null
    }

    endBarLine(staffIdx: staff_idx_t = 0, first = true): BarLine | null {
        let s = this.last()
        while (s && !s.isEndBarLineType()) {
            s = s.prev()
        }
        if (s) {
            for (const e of s.elist()) {
                if (e && (e.staffIdx() === staffIdx || first)) {
                    return e as BarLine
                }
            }
        }
        return null
    }

    endBarLineType(): BarLineType {
        const bl = this.endBarLine()
        return bl ? bl.barLineType() : BarLineType.NORMAL
    }

    endBarLineVisible(): boolean {
        const bl = this.endBarLine()
        return bl ? bl.visible() : true
    }

    startBarLine(staffIdx: staff_idx_t = 0, firstStaff = true): BarLine | null {
        let s = this.first()
        while (s && !(s.isStartRepeatBarLineType() || s.isBeginBarLineType())) {
            s = s.next()
        }
        if (s) {
            for (const e of s.elist()) {
                if (e && (e.staffIdx() === staffIdx || firstStaff)) {
                    return e as BarLine
                }
            }
        }
        return null
    }

    checkHeader(): void {
        for (let seg = this.first(); seg; seg = seg.next()) {
            if (seg.enabled() && seg.header()) {
                this.setHeader(seg.header())
                break
            }
        }
    }

    checkTrailer(): void {
        for (let seg = this.last(); seg && seg !== this.first(); seg = seg.prev()) {
            if (seg.enabled() && seg.trailer()) {
                this.setTrailer(seg.trailer())
                break
            }
        }
    }

    checkEndOfMeasureChange(): void {
        let found = false
        for (let seg = this.last(); seg && seg !== this.first(); seg = seg.prev()) {
            if (seg.enabled() && seg.endOfMeasureChange()) {
                this.setEndOfMeasureChange(seg.endOfMeasureChange())
                found = true
                break
            }
        }
        if (!found) {
            this.setEndOfMeasureChange(false)
        }
    }

    firstNoteRestSegmentX(leading = false): number {
        const sys = this.system()!
        let margin = this.style().styleMM(Sid.headerToLineStartDistance)
        for (let seg = this.first(); seg; seg = seg.next()) {
            if (seg.isChordRestType()) {
                const noteRestPos = seg.measure().pos().x() + seg.pos().x()
                if (!leading) {
                    return noteRestPos
                }
                // first CR found; back up to previous segment
                let pseg = seg.prevActive()
                while (pseg && (pseg.allElementsInvisible() || pseg.hasTimeSigAboveStaves())) {
                    pseg = pseg.prevActive()
                }
                if (pseg) {
                    // find maximum width
                    let width = 0.0
                    const n = this.score().nstaves()
                    for (let i = 0; i < n; ++i) {
                        if (!sys.staff(i)!.show()) {
                            continue
                        }
                        const e = pseg.element(i * VOICES)
                        if (e && e.addToSkyline()) {
                            width = Math.max(width, e.pos().x() + e.ldata().bbox().right())
                        }
                    }
                    if (pseg.isStartRepeatBarLineType()) {
                        margin = this.style().styleMM(Sid.lineEndToBarlineDistance)
                    }
                    return Math.min(pseg.measure().pos().x() + pseg.pos().x() + width + margin, noteRestPos)
                } else if (!this.isFirstInSystem() && !this.isFirstInSection() && this.prevMeasure()) {
                    const endBl = this.prevMeasure()!.endBarLine()
                    const endBlSeg = endBl ? endBl.segment() : null
                    if (!endBlSeg) {
                        return noteRestPos
                    }
                    let width = 0.0
                    if (endBl && endBl.addToSkyline()) {
                        width = Math.max(width, endBl.pos().x() + endBl.ldata().bbox().right())
                    }
                    const startBlMargin = this.style().styleMM(Sid.barlineToLineStartDistance)
                    return Math.min(endBlSeg.measure().pos().x() + endBlSeg.pos().x() + width + startBlMargin, noteRestPos)
                } else {
                    return noteRestPos
                }
            }
        }
        return margin
    }

    endingXForOpenEndedLines(): number {
        const sys = this.system()!
        const margin = this.style().styleMM(Sid.lineEndToBarlineDistance)
        const systemEndX = sys.ldata().bbox().width()
        let lastSeg = this.last()
        while (lastSeg && !lastSeg.isSegType(SegmentType.BarLineType)) {
            lastSeg = lastSeg.prevEnabled()
        }
        if (!lastSeg) {
            return systemEndX - margin
        }
        return lastSeg.x() + this.x() - margin
    }

    respaceSegments(): void {
        let x = 0.0
        for (const s of this.m_segments) {
            if (s.enabled() && s.visible() && !s.allElementsInvisible()) {
                x = s.x()
                break
            }
        }
        for (const s of this.m_segments) {
            if (s.isTimeTickType()) {
                continue
            }
            s.mutldata().setPosX(x)
            if (s.enabled() && s.visible() && !s.allElementsInvisible()) {
                x += s.width()
            }
        }
        this.setWidth(x)
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        const nstaves = this.score().nstaves()
        if (nstaves === 0) {
            return
        }
        super.scanElements(func)
        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            const ms = this.m_mstaves[staffIdx]
            const measureNumber = ms.measureNumber()
            if (measureNumber && measureNumber.systemFlag() && this.showMeasureNumberOnStaff(staffIdx)) {
                func(measureNumber)
            }
            if (!(this.visible(staffIdx) && this.score().staff(staffIdx)!.show()) && !this.isCutawayClef(staffIdx)) {
                continue
            }
            if (measureNumber && !measureNumber.systemFlag()) {
                func(measureNumber)
            }
            func(ms.lines())
            const up = ms.vspacerUp()
            if (up) {
                func(up)
            }
            const down = ms.vspacerDown()
            if (down) {
                func(down)
            }
            const mmr = ms.mmRangeText()
            if (mmr) {
                func(mmr)
            }
        }
        for (let s = this.first(); s; s = s.next()) {
            if (!s.enabled()) {
                continue
            }
            s.scanElements(func)
        }
    }

    // a Measure must not be used as an int-indexed iterator in TS; segments() is iterable
}
