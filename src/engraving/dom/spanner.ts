/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/spanner.h/.cpp
 *
 * TODO(port): navigation, links
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { Color } from '../../framework/draw/types/color'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, SpannerSegmentType, VOICES, nidx, track2staff, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import { EditTimeTickAnchors } from './anchors'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { Measure } from './measure'
import type { Note } from './note'
import type { Score } from './score'
import type { System } from './system'

// ---------------------------------------------------------
//   SpannerSegment
// ---------------------------------------------------------

export abstract class SpannerSegment extends EngravingItem {
    protected m_p2 = new PointF()
    protected m_offset2 = new PointF()
    private m_spanner: Spanner | null = null
    private m_spannerSegmentType = SpannerSegmentType.SINGLE

    protected constructor(type: ElementType, sp: Spanner | null, parent: System | null,
                          f: number = ElementFlag.ON_STAFF | ElementFlag.MOVABLE) {
        super(type, parent, f)
        this.m_spanner = sp
    }

    override mag(): number {
        if (this.spanner().systemFlag()) {
            return 1.0
        }
        return this.staff() ? this.staff()!.staffMag(this.spanner().tick()) : 1.0
    }

    override tick(): Fraction { return this.m_spanner ? this.m_spanner.tick() : new Fraction(0, 1) }

    spanner(): Spanner { return this.m_spanner! }
    hasSpanner(): boolean { return this.m_spanner !== null }
    setSpanner(val: Spanner | null): Spanner | null { return this.m_spanner = val }

    setSpannerSegmentType(s: SpannerSegmentType): void { this.m_spannerSegmentType = s }
    spannerSegmentType(): SpannerSegmentType { return this.m_spannerSegmentType }
    isSingleType(): boolean { return this.spannerSegmentType() === SpannerSegmentType.SINGLE }
    isBeginType(): boolean { return this.spannerSegmentType() === SpannerSegmentType.BEGIN }
    isSingleBeginType(): boolean { return this.isSingleType() || this.isBeginType() }
    isSingleEndType(): boolean { return this.isSingleType() || this.isEndType() }
    isMiddleType(): boolean { return this.spannerSegmentType() === SpannerSegmentType.MIDDLE }
    isEndType(): boolean { return this.spannerSegmentType() === SpannerSegmentType.END }

    override subtype(): number { return this.spanner().subtype() }

    setSystem(s: System | null): void {
        const cur = this.system()
        if (cur !== s) {
            if (cur) {
                cur.remove(this)
            }
            if (s) {
                s.add(this)
            } else {
                this.resetExplicitParent()
            }
        }
    }

    system(): System | null { return this.explicitParent() as unknown as System | null }

    userOff2(): PointF { return this.m_offset2 }
    setUserOff2(o: PointF): void { this.m_offset2 = o.clone() }
    setUserXoffset2(x: number): void { this.m_offset2.setX(x) }
    setUserYoffset2(y: number): void { this.m_offset2.setY(y) }
    setPos2(p: PointF): void { this.m_p2 = p.clone() }
    pos2(): PointF { return this.m_p2.plus(this.m_offset2) }
    ipos2(): PointF { return this.m_p2.clone() }
    /** C++ returns a reference (rpos2()); modify through this object */
    rpos2(): PointF { return this.m_p2 }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        switch (pid) {
        case Pid.PLAY:
        case Pid.COLOR:
        case Pid.Z:
        case Pid.VISIBLE:
        case Pid.PLACEMENT:
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
        case Pid.POSITION_LINKED_TO_MASTER:
        case Pid.APPEARANCE_LINKED_TO_MASTER:
        case Pid.SPANNER_TICK:
        case Pid.SPANNER_TICKS:
        case Pid.SPANNER_TRACK2:
            return this.spanner()
        default:
            return null
        }
    }

    override getProperty(pid: Pid): PropertyValue {
        const e = this.propertyDelegate(pid)
        if (e) {
            return e.getProperty(pid)
        }
        if (pid === Pid.OFFSET2) {
            return this.m_offset2
        }
        return super.getProperty(pid)
    }

    override setProperty(pid: Pid, v: PropertyValue): boolean {
        const e = this.propertyDelegate(pid)
        if (e) {
            return e.setProperty(pid, v)
        }
        if (pid === Pid.OFFSET2) {
            this.m_offset2 = (v as PointF).clone()
            return true
        }
        return super.setProperty(pid, v)
    }

    override propertyDefault(pid: Pid): PropertyValue {
        const e = this.propertyDelegate(pid)
        if (e) {
            return e.propertyDefault(pid)
        }
        if (pid === Pid.OFFSET2) {
            return undefined
        }
        return super.propertyDefault(pid)
    }

    override getPropertyStyle(pid: Pid): Sid {
        const e = this.propertyDelegate(pid)
        if (e) {
            return e.getPropertyStyle(pid)
        }
        return super.getPropertyStyle(pid)
    }

    override resetProperty(pid: Pid): void {
        const e = this.propertyDelegate(pid)
        if (e) {
            e.resetProperty(pid)
            return
        }
        super.resetProperty(pid)
    }

    override styleChanged(): void {
        this.spanner().styleChanged()
    }

    override setVisible(f: boolean): void {
        if (this.m_spanner) {
            this.m_spanner.setVisible(f)
        }
        super.setVisible(f)
    }

    /** EngravingItem::setVisible (C++ calls the base implementation explicitly) */
    baseSetVisible(f: boolean): void { super.setVisible(f) }

    override setColor(col: Color): void {
        if (this.m_spanner) {
            this.m_spanner.setColor(col)
        }
        super.setColor(col)
    }

    baseSetColor(col: Color): void { super.setColor(col) }

    override setZ(val: number): void {
        if (this.m_spanner) {
            this.m_spanner.setZ(val)
        }
        super.setZ(val)
    }

    baseSetZ(val: number): void { super.setZ(val) }

    isUserModified(): boolean {
        const modified = !this.autoplace() || !this.visible()
                         || (this.propertyFlags(Pid.MIN_DISTANCE) === 1 /* PropertyFlags::UNSTYLED */
                             || !(this.getProperty(Pid.MIN_DISTANCE) as { equals(o: unknown): boolean })
                                 .equals(this.propertyDefault(Pid.MIN_DISTANCE)))
                         || (!this.isStyled(Pid.OFFSET) && (!this.offset().isNull() || !this.userOff2().isNull()))
        return modified
    }

    override collectForDrawing(): boolean {
        return super.collectForDrawing() && (this.spanner().eitherEndVisible() || this.systemFlag())
    }

    override accessibleInfo(): string {
        return this.spanner()!.accessibleInfo()
    }
}

// ---------------------------------------------------------
//   Spanner
//    Virtual base class for slurs, ties, lines etc.
// ---------------------------------------------------------

export enum SpannerAnchor {
    SEGMENT, MEASURE, CHORD, NOTE,
}

function isVisibleCR(e: EngravingItem | null): boolean {
    if (!e || !e.isChordRest()) {
        return true // assume visible
    }
    const cr = e as ChordRest
    return cr.measure().visible(cr.staffIdx())
}

export abstract class Spanner extends EngravingItem {
    static readonly Anchor = SpannerAnchor

    private m_startElement: EngravingItem | null = null
    private m_endElement: EngravingItem | null = null
    private m_playSpanner = true
    private m_anchor = SpannerAnchor.SEGMENT
    private m_tick = new Fraction(-1, 1)
    private m_ticks = new Fraction(0, 1)
    private m_track2: track_idx_t = nidx
    private m_broken = false
    private m_segments: SpannerSegment[] = []
    private m_unusedSegments: SpannerSegment[] = [] // Currently unused segments which can be reused later.

    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
    }

    override mag(): number {
        if (this.systemFlag()) {
            return 1.0
        }
        return this.staff() ? this.staff()!.staffMag(this.tick()) : 1.0
    }

    override setScore(s: Score | null): void {
        super.setScore(s)
        for (const seg of this.m_segments ?? []) {
            seg.setScore(s)
        }
    }

    override tick(): Fraction { return this.m_tick }
    tick2(): Fraction { return this.m_tick.plus(this.m_ticks) }
    ticks(): Fraction { return this.m_ticks }

    setTick(v: Fraction): void {
        if (this.m_tick.eq(v)) {
            return
        }
        this.m_tick = v
    }

    setTick2(f: Fraction): void {
        let ticks = f.minus(this.m_tick)
        if (f.lt(this.m_tick)) {
            ticks = this.m_tick.minus(f)
            this.m_tick = f
        }
        this.setTicks(ticks)
    }

    setTicks(f: Fraction): void {
        if (this.m_ticks.eq(f)) {
            return
        }
        this.m_ticks = f.negative() ? f.neg() : f
    }

    isVoiceSpecific(): boolean {
        const t = this.type()
        return t === ElementType.TRILL || t === ElementType.HAIRPIN || t === ElementType.LET_RING
    }

    private canBeCrossStaff(): boolean {
        switch (this.type()) {
        case ElementType.SLUR:
        case ElementType.TIE:
        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET:
        case ElementType.GLISSANDO:
        case ElementType.NOTELINE:
            return true
        default:
            return false
        }
    }

    track2(): track_idx_t { return this.canBeCrossStaff() ? this.m_track2 : this.track() }

    setTrack2(v: track_idx_t): void {
        if (!this.canBeCrossStaff()) {
            return
        }
        this.m_track2 = v
    }

    effectiveTrack2(): track_idx_t {
        return this.canBeCrossStaff() && this.m_track2 !== nidx ? this.m_track2 : this.track()
    }

    broken(): boolean { return this.m_broken }
    setBroken(v: boolean): void { this.m_broken = v }
    playSpanner(): boolean { return this.m_playSpanner }
    setPlaySpanner(p: boolean): void { this.m_playSpanner = p }
    anchor(): SpannerAnchor { return this.m_anchor }
    setAnchor(a: SpannerAnchor): void { this.m_anchor = a }

    /** C++ copy constructor: the segments are cloned */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_segments = []
        for (const segment of original.m_segments) {
            const newSegment = segment.clone() as SpannerSegment
            newSegment.setParent(null)
            this.add(newSegment)
        }
    }

    spannerSegments(): SpannerSegment[] { return this.m_segments }
    setSpannerSegments(s: SpannerSegment[]): void { this.m_segments = s }
    frontSegment(): SpannerSegment { return this.m_segments[0] }
    backSegment(): SpannerSegment { return this.m_segments[this.m_segments.length - 1] }
    segmentAt(n: number): SpannerSegment { return this.m_segments[n] }
    nsegments(): number { return this.m_segments.length }
    segmentsEmpty(): boolean { return this.m_segments.length === 0 }

    removeUnmanaged(): void {
        for (const ss of this.spannerSegments()) {
            if (ss.system()) {
                ss.setSystem(null)
            }
        }
        this.score().removeUnmanagedSpanner(this)
    }

    eraseSpannerSegments(): void {
        for (const seg of this.m_segments) {
            seg.system()?.remove(seg)
        }
        for (const seg of this.m_unusedSegments) {
            seg.system()?.remove(seg)
        }
        this.m_segments = []
        this.m_unusedSegments = []
    }

    eitherEndVisible(): boolean {
        if (this.isVolta()) {
            return true
        }
        if (!this.score().staff(this.staffIdx())!.show()) {
            return false
        }
        return isVisibleCR(this.startElement()) || isVisibleCR(this.endElement())
    }

    override add(e: EngravingItem): void {
        const ls = e as SpannerSegment
        ls.setSpanner(this)
        ls.setTrack(this.track())
        ls.baseSetZ(this.z())
        this.m_segments.push(ls)
    }

    override remove(e: EngravingItem): void {
        const ss = e as SpannerSegment
        if (ss.system()) {
            ss.system()!.remove(ss)
        }
        this.m_segments = this.m_segments.filter(s => s !== ss)
    }

    override scanElements(_func: (item: EngravingItem) => void): void {}

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PLAY: return this.m_playSpanner
        case Pid.SPANNER_TICK: return this.m_tick
        case Pid.SPANNER_TICKS: return this.m_ticks
        case Pid.SPANNER_TRACK2: return this.track2()
        case Pid.ANCHOR: return this.anchor()
        case Pid.LOCATION_STAVES: return Math.trunc(this.track2() / VOICES) - Math.trunc(this.track() / VOICES)
        case Pid.LOCATION_VOICES: return (this.track2() % VOICES) - Math.trunc(this.track() / VOICES)
        case Pid.LOCATION_FRACTIONS: return this.m_ticks
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLAY:
            this.setPlaySpanner(!!v)
            break
        case Pid.SPANNER_TICK:
            this.setTick(v as Fraction)
            break
        case Pid.SPANNER_TICKS:
            this.setTicks(v as Fraction)
            this.setEndElement(null) // invalidate
            break
        case Pid.TRACK:
            this.setTrack(v as number)
            this.setStartElement(null) // invalidate
            break
        case Pid.SPANNER_TRACK2:
            this.setTrack2(v as number)
            this.setEndElement(null) // invalidate
            break
        case Pid.ANCHOR:
            this.setAnchor(v as SpannerAnchor)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PLAY: return true
        case Pid.ANCHOR: return SpannerAnchor.SEGMENT
        default: return super.propertyDefault(propertyId)
        }
    }

    // ---------------------------------------------------------
    //   computeStartElement / computeEndElement
    // ---------------------------------------------------------

    computeStartElement(): void {
        const oldStartElement = this.m_startElement
        this.doComputeStartElement()
        if (oldStartElement && oldStartElement.isChord()) {
            (oldStartElement as unknown as Chord).removeStartingSpanner(this)
        }
        const startChord = this.m_startElement && this.m_startElement.isChord() ? this.m_startElement as unknown as Chord : null
        if (startChord) {
            startChord.addStartingSpanner(this)
        }
    }

    protected doComputeStartElement(): void {
        switch (this.m_anchor) {
        case SpannerAnchor.SEGMENT: {
            const startSeg = this.startSegment()
            if (!startSeg) {
                return
            }
            if (this.systemFlag()) {
                this.m_startElement = startSeg
            } else {
                const startEl = startSeg.element(this.track())
                this.m_startElement = startEl ? startEl : startSeg.firstElement(track2staff(this.track()))
            }
            break
        }
        case SpannerAnchor.MEASURE:
            this.m_startElement = this.score().tick2measure(this.tick())
            break
        case SpannerAnchor.CHORD:
            this.m_startElement = this.startCR()
            break
        case SpannerAnchor.NOTE:
            break
        }
    }

    computeEndElement(): void {
        const oldEndElement = this.m_endElement
        this.doComputeEndElement()
        if (oldEndElement && oldEndElement.isChord()) {
            (oldEndElement as unknown as Chord).removeEndingSpanner(this)
        }
        const endChord = this.m_endElement && this.m_endElement.isChord() ? this.m_endElement as unknown as Chord : null
        if (endChord) {
            endChord.addEndingSpanner(this)
        }
    }

    protected doComputeEndElement(): void {
        switch (this.m_anchor) {
        case SpannerAnchor.SEGMENT: {
            const endSeg = this.endSegment()
            if (!endSeg) {
                return
            }
            if (this.systemFlag()) {
                this.m_endElement = endSeg
            } else {
                const trackIdx = this.effectiveTrack2()
                const endEl = endSeg.element(trackIdx)
                this.m_endElement = endEl ? endEl : endSeg.firstElement(track2staff(trackIdx))
            }
            break
        }
        case SpannerAnchor.MEASURE:
            this.m_endElement = this.score().tick2measure(this.tick2().minus(new Fraction(1, 1920)))
            break
        case SpannerAnchor.NOTE:
            break
        case SpannerAnchor.CHORD:
            this.m_endElement = this.endCR()
            break
        }
    }

    setNoteSpan(startNote: Note | null, endNote: Note | null): void {
        if (this.m_anchor !== SpannerAnchor.NOTE) {
            return
        }
        const score = startNote ? startNote.score() : endNote!.score()
        const parent = startNote ? startNote : endNote!
        const tick = startNote ? startNote.tick() : endNote!.tick()
        const endTick = endNote ? endNote.tick() : startNote!.tick()
        const track = startNote ? startNote.track() : endNote!.track()
        const endTrack = endNote ? endNote.track() : startNote!.track()
        this.setScore(score)
        this.setParent(parent)
        this.setStartElement(startNote)
        this.setEndElement(endNote)
        this.setTick(tick)
        this.setTick2(endTick)
        this.setTrack(track)
        this.setTrack2(endTrack)
    }

    startElement(): EngravingItem | null { return this.m_startElement }
    endElement(): EngravingItem | null { return this.m_endElement }
    setStartElement(e: EngravingItem | null): void { this.m_startElement = e }
    setEndElement(e: EngravingItem | null): void { this.m_endElement = e }

    startMeasure(): Measure | null { return this.m_startElement as unknown as Measure | null }
    endMeasure(): Measure | null { return this.m_endElement as unknown as Measure | null }

    findStartMeasure(): Measure | null {
        if (!this.m_startElement) {
            return null
        }
        return this.m_startElement.findAncestor(ElementType.MEASURE) as unknown as Measure | null
    }

    findEndMeasure(): Measure | null {
        if (!this.m_endElement) {
            return null
        }
        return this.m_endElement.findAncestor(ElementType.MEASURE) as unknown as Measure | null
    }

    startChord(): Chord | null {
        if (this.m_anchor !== SpannerAnchor.CHORD) {
            return null
        }
        if (!this.m_startElement) {
            this.m_startElement = this.findStartChord()
        }
        return this.m_startElement && this.m_startElement.isChord() ? this.m_startElement as unknown as Chord : null
    }

    endChord(): Chord | null {
        if (this.m_anchor !== SpannerAnchor.CHORD) {
            return null
        }
        if (!this.m_endElement && this.type() === ElementType.SLUR) {
            this.m_endElement = this.findEndChord()
        }
        return this.m_endElement && this.m_endElement.isChord() ? this.m_endElement as unknown as Chord : null
    }

    startCR(): ChordRest | null {
        if (!this.m_startElement || this.m_startElement.score() !== this.score()) {
            this.m_startElement = this.findStartCR()
        }
        return this.m_startElement && this.m_startElement.isChordRest() ? this.m_startElement as unknown as ChordRest : null
    }

    endCR(): ChordRest | null {
        if (!this.m_endElement || this.m_endElement.score() !== this.score()) {
            this.m_endElement = this.findEndCR()
        }
        return this.m_endElement && this.m_endElement.isChordRest() ? this.m_endElement as unknown as ChordRest : null
    }

    findStartChord(): Chord | null {
        const cr = this.score().findCR(this.tick(), this.track())
        return cr && cr.isChord() ? cr as unknown as Chord : null
    }

    findEndChord(): Chord | null {
        const s = this.score().tick2segmentMM(this.tick2(), false, SegmentType.ChordRest)
        const endCR = s ? s.element(this.track2()) as unknown as ChordRest | null : null
        return endCR && endCR.isChord() ? endCR as unknown as Chord : null
    }

    findStartCR(): ChordRest | null { return this.score().findCR(this.tick(), this.track()) }

    findEndCR(): ChordRest | null {
        const s = this.score().tick2segmentMM(this.tick2(), false, SegmentType.ChordRest)
        const tr2 = this.effectiveTrack2()
        return s ? s.element(tr2) as unknown as ChordRest | null : null
    }

    startSegment(): Segment | null {
        const mmRest = this.style().styleB(Sid.createMultiMeasureRests)
        const startTick = this.tick()
        const trackIdx = this.track()
        const staffIdx = track2staff(trackIdx)
        let startSeg = this.score().tick2segment(startTick, true, SegmentType.ChordRest, mmRest)
        if (!startSeg || !startSeg.hasElementsInStaff(staffIdx) || (this.isVoiceSpecific() && !startSeg.element(trackIdx))) {
            startSeg = this.score().tick2segment(startTick, true, SegmentType.TimeTick, mmRest)
        }
        if (!startSeg && startTick.lt(this.score().endTick())) {
            const measure = mmRest ? this.score().tick2measureMM(startTick) : this.score().tick2measure(startTick)
            if (measure) {
                const anchor = EditTimeTickAnchors.createTimeTickAnchor(measure, startTick.minus(measure.tick()), track2staff(trackIdx))
                if (!anchor) {
                    return null
                }
                EditTimeTickAnchors.updateLayout(measure)
                return anchor.segment()
            }
        }
        if (!startSeg) {
            startSeg = this.score().tick2rightSegment(startTick, mmRest)
        }
        return startSeg
    }

    endSegment(): Segment | null {
        const mmRest = this.style().styleB(Sid.createMultiMeasureRests)
        const endTick = this.tick2()
        const trackIdx = this.effectiveTrack2()
        const staffIdx = track2staff(trackIdx)
        let endSeg = this.score().tick2segment(endTick, true, SegmentType.ChordRest, mmRest)
        if (!endSeg || !endSeg.hasElementsInStaff(staffIdx) || (this.isVoiceSpecific() && !endSeg.element(trackIdx))) {
            endSeg = this.score().tick2segment(endTick, true, SegmentType.TimeTick, mmRest)
        }
        if (!endSeg && !endTick.isZero()) {
            const measure = mmRest ? this.score().tick2measureMM(endTick) : this.score().tick2measure(endTick)
            if (measure) {
                const anchor = EditTimeTickAnchors.createTimeTickAnchor(measure, endTick.minus(measure.tick()), track2staff(trackIdx))!
                EditTimeTickAnchors.updateLayout(measure)
                return anchor.segment()
            }
        }
        if (!endSeg) {
            endSeg = this.score().tick2leftSegment(endTick, mmRest)
        }
        return endSeg
    }

    override setVisible(f: boolean): void {
        for (const ss of this.m_segments ?? []) {
            ss.baseSetVisible(f)
        }
        super.setVisible(f)
    }

    override setColor(col: Color): void {
        for (const ss of this.m_segments ?? []) {
            ss.baseSetColor(col)
        }
        super.setColor(col)
    }

    override setZ(val: number): void {
        for (const ss of this.m_segments ?? []) {
            ss.baseSetZ(val)
        }
        super.setZ(val)
    }

    pushUnusedSegment(seg: SpannerSegment | null): void {
        if (!seg) {
            return
        }
        seg.setSystem(null)
        this.m_unusedSegments.push(seg)
    }

    popUnusedSegment(): SpannerSegment | null {
        return this.m_unusedSegments.shift() ?? null
    }

    /** called when segment from unusedSegments is added back to the spanner */
    reuse(seg: SpannerSegment): void { this.add(seg) }

    reuseSegments(number: number): number {
        while (number > 0) {
            const seg = this.popUnusedSegment()
            if (!seg) {
                break
            }
            this.reuse(seg)
            --number
        }
        return number
    }

    fixupSegments(targetNumber: number, createSegment: (parent: System | null) => SpannerSegment): void {
        const diff = targetNumber - this.nsegments()
        if (diff === 0) {
            return
        }
        if (diff > 0) {
            const ncreate = this.reuseSegments(diff)
            for (let i = 0; i < ncreate; ++i) {
                const seg = createSegment(this.score().dummySystem())
                seg.setScore(this.score())
                this.add(seg)
            }
        } else { // diff < 0
            const nremove = -diff
            for (let i = 0; i < nremove; ++i) {
                const seg = this.m_segments.pop()!
                this.pushUnusedSegment(seg)
            }
        }
    }

    isUserModified(): boolean {
        return this.m_segments.some(seg => seg.isUserModified())
    }
}
