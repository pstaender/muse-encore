/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/segment.h/.cpp (navigation for editing not ported)
 */

import { RealIsEqual } from '../../framework/global/realfn'
import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import {
    ClefToBarlinePosition, ElementType, TimeSigPlacement, TimeSigVSMargin, VOICES, nidx, staff2track, track2staff,
    type staff_idx_t, type track_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Shape, ShapeElement } from '../infrastructure/shape'
import { EngravingItem, ElementFlag } from './engravingitem'
import { Pid } from './property'
import type { Measure } from './measure'
import type { System } from './system'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { DurationElement } from './durationelement'
import type { Rest } from './rest'
import type { Clef } from './clef'
import type { KeySig } from './keysig'
import type { InstrumentChange } from './instrchange'
import type { TimeSig } from './timesig'
import type { Spanner } from './spanner'

export enum SegmentType {
    Invalid = 0x0,
    BeginBarLine = 0x1,
    HeaderClef = 0x2,
    KeySig = 0x4,
    Ambitus = 0x8,
    Breath = 0x10,
    TimeSig = 0x20,
    StartRepeatBarLine = 0x40,
    ClefStartRepeatAnnounce = 0x80,
    KeySigStartRepeatAnnounce = 0x100,
    TimeSigStartRepeatAnnounce = 0x200,
    Clef = 0x400,
    BarLine = 0x800,
    TimeTick = 0x1000,
    ChordRest = 0x2000,
    ClefRepeatAnnounce = 0x4000,
    KeySigRepeatAnnounce = 0x8000,
    TimeSigRepeatAnnounce = 0x10000,
    EndBarLine = 0x20000,
    KeySigAnnounce = 0x40000,
    TimeSigAnnounce = 0x80000,
    All = -1, ///< Includes all barline types
    BarLineType = BeginBarLine | StartRepeatBarLine | BarLine | EndBarLine,
    CourtesyTimeSigType = TimeSigAnnounce | TimeSigRepeatAnnounce | TimeSigStartRepeatAnnounce,
    CourtesyKeySigType = KeySigAnnounce | KeySigRepeatAnnounce | KeySigStartRepeatAnnounce,
    CourtesyClefType = ClefRepeatAnnounce | ClefStartRepeatAnnounce,
    TimeSigType = TimeSig | CourtesyTimeSigType,
    KeySigType = KeySig | CourtesyKeySigType,
    ClefType = Clef | HeaderClef | CourtesyClefType,
}

export const CHORD_REST_OR_TIME_TICK_TYPE = SegmentType.ChordRest | SegmentType.TimeTick
/** segment types which may have non-zero tick length */
export const durationSegmentsMask = CHORD_REST_OR_TIME_TICK_TYPE

export class Segment extends EngravingItem {
    static readonly CHORD_REST_OR_TIME_TICK_TYPE = CHORD_REST_OR_TIME_TICK_TYPE

    private m_segmentType: SegmentType = SegmentType.Invalid
    private m_tick = new Fraction(0, 1)
    private m_ticks = new Fraction(0, 1)
    private m_extraLeadingSpace = new Spatium(0)
    private m_stretch = 1.0
    private m_widthOffset = 0.0 // part of the segment width that will not be stretched during system justification
    private m_next: Segment | null = null // linked list of segments inside a measure
    private m_prev: Segment | null = null
    private m_annotations: EngravingItem[] = []
    private m_elist: (EngravingItem | null)[] = [] // EngravingItem storage, size = staves * VOICES.
    private m_preAppendedItems: (EngravingItem | null)[] = [] // items appended to the left of this segment (example: grace notes)
    private m_shapes: Shape[] = [] // size = staves
    private m_spacing = 0

    constructor(m: Measure, st: SegmentType = SegmentType.Invalid, t: Fraction = new Fraction(0, 1)) {
        super(ElementType.SEGMENT, m, ElementFlag.EMPTY | ElementFlag.ENABLED | ElementFlag.NOT_SELECTABLE)
        this.setParent(m)
        this.m_segmentType = st
        this.m_tick = t
        this.init()
    }

    private init(): void {
        const staves = this.score().nstaves()
        const tracks = staves * VOICES
        this.m_elist = new Array(tracks).fill(null)
        this.m_preAppendedItems = new Array(tracks).fill(null)
        this.m_shapes = []
        for (let i = 0; i < staves; ++i) {
            this.m_shapes.push(new Shape())
        }
    }

    isActive(): boolean { return !this.isTimeTickType() && this.enabled() && this.visible() }

    next(types?: SegmentType): Segment | null {
        if (types === undefined) {
            return this.m_next
        }
        for (let s = this.m_next; s; s = s.m_next) {
            if (s.segmentType() & types) {
                return s
            }
        }
        return null
    }

    setNext(e: Segment | null): void { this.m_next = e }

    prev(types?: SegmentType): Segment | null {
        if (types === undefined) {
            return this.m_prev
        }
        for (let s = this.m_prev; s; s = s.m_prev) {
            if (s.segmentType() & types) {
                return s
            }
        }
        return null
    }

    setPrev(e: Segment | null): void { this.m_prev = e }

    nextActive(): Segment | null {
        let ns = this.next()
        while (ns && !ns.isActive()) {
            ns = ns.next()
        }
        return ns
    }

    nextEnabled(): Segment | null {
        let ns = this.next()
        while (ns && !ns.enabled()) {
            ns = ns.next()
        }
        return ns
    }

    prevActive(): Segment | null {
        let ps = this.prev()
        while (ps && !ps.isActive()) {
            ps = ps.prev()
        }
        return ps
    }

    prevEnabled(): Segment | null {
        let ps = this.prev()
        while (ps && !ps.enabled()) {
            ps = ps.prev()
        }
        return ps
    }

    nextInStaff(staffIdx: staff_idx_t, type: SegmentType = SegmentType.ChordRest): Segment | null {
        let s = this.next(type)
        const minTrack = staffIdx * VOICES
        const maxTrack = (staffIdx + 1) * VOICES - 1
        while (s && !s.hasElementsInRange(minTrack, maxTrack)) {
            s = s.next(type)
        }
        return s
    }

    prevWithElementsOnTrack(trackIdx: track_idx_t, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        let prevSeg = this.prev(segType)
        while (prevSeg && !prevSeg.element(trackIdx)) {
            prevSeg = prevSeg.prev(segType)
        }
        return prevSeg
    }

    next1(types?: SegmentType): Segment | null {
        if (types !== undefined) {
            for (let s = this.next1(); s; s = s.next1()) {
                if (s.segmentType() & types) {
                    return s
                }
            }
            return null
        }
        if (this.m_next) {
            return this.m_next
        }
        const m = this.measure().nextMeasure()
        return m ? m.first() : null
    }

    next1enabled(): Segment | null {
        let s = this.next1()
        while (s && !s.enabled()) {
            s = s.next1()
        }
        return s
    }

    next1MM(types?: SegmentType): Segment | null {
        if (types !== undefined) {
            for (let s = this.next1MM(); s; s = s.next1MM()) {
                if (s.segmentType() & types) {
                    return s
                }
            }
            return null
        }
        if (this.m_next) {
            return this.m_next
        }
        const m = this.measure().nextMeasureMM()
        return m ? m.first() : null
    }

    next1MMenabled(): Segment | null {
        let s = this.next1MM()
        while (s && !s.enabled()) {
            s = s.next1MM()
        }
        return s
    }

    next1WithElemsOnStaff(staffIdx: staff_idx_t, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        let next = this.next1(segType)
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES - 1
        while (next && !next.hasElementsInRange(startTrack, endTrack)) {
            next = next.next1(segType)
        }
        return next
    }

    next1WithElemsOnTrack(trackIdx: track_idx_t, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        let next = this.next1(segType)
        while (next && !next.hasElementsInRange(trackIdx, trackIdx)) {
            next = next.next1(segType)
        }
        return next
    }

    prev1(types?: SegmentType): Segment | null {
        if (types !== undefined) {
            for (let s = this.prev1(); s; s = s.prev1()) {
                if (s.segmentType() & types) {
                    return s
                }
            }
            return null
        }
        if (this.m_prev) {
            return this.m_prev
        }
        const m = this.measure().prevMeasure()
        return m ? m.last() : null
    }

    prev1WithElemsOnStaff(staffIdx: staff_idx_t, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        let prev = this.prev1(segType)
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES - 1
        while (prev && !prev.hasElementsInRange(startTrack, endTrack)) {
            prev = prev.prev1(segType)
        }
        return prev
    }

    prev1WithElemsOnTrack(trackIdx: track_idx_t, segType: SegmentType = SegmentType.ChordRest): Segment | null {
        let prev = this.prev1(segType)
        while (prev && !prev.hasElementsInRange(trackIdx, trackIdx)) {
            prev = prev.prev1(segType)
        }
        return prev
    }

    prev1enabled(): Segment | null {
        let s = this.prev1()
        while (s && !s.enabled()) {
            s = s.prev1()
        }
        return s
    }

    prev1MM(types?: SegmentType): Segment | null {
        if (types !== undefined) {
            for (let s = this.prev1MM(); s; s = s.prev1MM()) {
                if (s.segmentType() & types) {
                    return s
                }
            }
            return null
        }
        if (this.m_prev) {
            return this.m_prev
        }
        const m = this.measure().prevMeasureMM()
        return m ? m.last() : null
    }

    prev1MMenabled(): Segment | null {
        let s = this.prev1MM()
        while (s && !s.enabled()) {
            s = s.prev1MM()
        }
        return s
    }

    nextCR(track: track_idx_t = nidx, sameStaff = false): Segment | null {
        let strack = track
        let etrack: number
        if (sameStaff) {
            strack &= ~(VOICES - 1)
            etrack = strack + VOICES
        } else {
            etrack = strack + 1
        }
        for (let seg = this.next1(); seg; seg = seg.next1()) {
            if (seg.isChordRestType()) {
                if (track === nidx) {
                    return seg
                }
                for (let t = strack; t < etrack; ++t) {
                    if (seg.element(t)) {
                        return seg
                    }
                }
            }
        }
        return null
    }

    nextChordRest(track: track_idx_t, backwards = false, stopAtMeasureBoundary = false): ChordRest | null {
        let seg: Segment | null = this
        while (seg) {
            const el = seg.element(track)
            if (el && el.isChordRest()) {
                return el as ChordRest
            }
            if (backwards) {
                seg = stopAtMeasureBoundary ? seg.prev() : seg.prev1()
                continue
            }
            seg = stopAtMeasureBoundary ? seg.next() : seg.next1()
        }
        return null
    }

    element(track: track_idx_t): EngravingItem | null {
        if (track < 0 || track >= this.m_elist.length) {
            return null
        }
        return this.m_elist[track]
    }

    elist(): (EngravingItem | null)[] { return this.m_elist }

    firstElementOfSegment(activeStaff: staff_idx_t): EngravingItem | null {
        if (this.isTimeTickType()) {
            return null
        }

        for (const i of this.m_elist) {
            if (i && i.staffIdx() === activeStaff) {
                if (i.isDurationElement()) {
                    const tuplet = (i as unknown as DurationElement).tuplet()
                    if (tuplet && i === tuplet.elements()[0]) {
                        return tuplet
                    }
                }

                if (i.isChord()) {
                    return (i as unknown as Chord).firstGraceOrNote()
                } else {
                    return i
                }
            }
        }
        return null
    }

    nextElementOfSegment(e: EngravingItem, activeStaff: staff_idx_t): EngravingItem | null {
        const ntracks = this.score().nstaves() * VOICES
        for (let track = 0; track < ntracks - 1; ++track) {
            if (!this.element(track)) {
                continue
            }
            const el = this.element(track)!
            if (el === e) {
                let next = this.element(track + 1)
                while (track < ntracks - 1 && (!next || next.staffIdx() !== activeStaff)) {
                    next = this.element(++track)
                }
                if (!next || next.staffIdx() !== activeStaff) {
                    return null
                }
                if (next.isChord()) {
                    const notes = (next as unknown as Chord).notes()
                    return notes[notes.length - 1]
                } else {
                    return next
                }
            }
            if (el.isChord()) {
                const notes = (el as unknown as Chord).notes()
                const i = notes.indexOf(e as never)
                if (i === -1) {
                    continue
                }
                if (i !== 0) {
                    return notes[i - 1]
                } else {
                    let nextEl = this.element(++track)
                    while (track < ntracks - 1 && (!nextEl || nextEl.staffIdx() !== activeStaff)) {
                        nextEl = this.element(++track)
                    }
                    if (!nextEl || nextEl.staffIdx() !== activeStaff) {
                        return null
                    }
                    if (nextEl.isChord()) {
                        const n = (nextEl as unknown as Chord).notes()
                        return n[n.length - 1]
                    }
                    return nextEl
                }
            }
        }
        return null
    }

    cr(track: track_idx_t): ChordRest | null { return this.m_elist[track] as ChordRest | null }

    /** the first main element of the staff (the top note of a chord), for navigation and palettes */
    firstElementForNavigation(staff: staff_idx_t): EngravingItem | null {
        if (this.isChordRestType()) {
            const strack = staff * VOICES
            const etrack = strack + VOICES
            for (let v = strack; v < etrack; ++v) {
                const el = this.element(v)
                if (!el) {
                    continue
                }
                if (el.isChord()) {
                    const notes = (el as unknown as Chord).notes()
                    return notes[notes.length - 1] as unknown as EngravingItem
                }
                return el
            }
        } else {
            return this.getElement(staff)
        }
        return null
    }

    getElement(staff: staff_idx_t): EngravingItem | null {
        if (this.segmentType() === SegmentType.ChordRest) {
            return this.firstElementForNavigation(staff)
        } else if (this.segmentType() & (SegmentType.EndBarLine | SegmentType.BarLine | SegmentType.StartRepeatBarLine)) {
            for (let i = staff; i >= 0; i--) {
                const e = this.element(i * VOICES)
                if (!e) {
                    continue
                }
                const b = e as unknown as { spanStaff(): boolean }
                if (i + (b.spanStaff() ? 1 : 0) >= staff) {
                    return e
                }
            }
        } else {
            return this.element(staff * VOICES)
        }
        return null
    }

    swapElements(i1: track_idx_t, i2: track_idx_t): void {
        const e = this.m_elist[i1]
        this.m_elist[i1] = this.m_elist[i2]
        this.m_elist[i2] = e
        if (this.m_elist[i1]) {
            this.m_elist[i1]!.setTrack(i1)
        }
        if (this.m_elist[i2]) {
            this.m_elist[i2]!.setTrack(i2)
        }
        this.triggerLayout()
    }

    setElement(track: track_idx_t, el: EngravingItem | null): void {
        if (el) {
            el.setParent(this)
            this.m_elist[track] = el
            this.setEmpty(false)
        } else {
            this.m_elist[track] = null
            this.checkEmpty()
        }
    }

    measure(): Measure { return this.explicitParent() as unknown as Measure }
    system(): System | null {
        const m = this.explicitParent()
        return m ? (m.explicitParent() as unknown as System | null) : null
    }

    override x(): number { return this.ldata().posX() }

    insertStaff(staff: staff_idx_t): void {
        const track = staff * VOICES
        for (let voice = 0; voice < VOICES; ++voice) {
            this.m_elist.splice(track, 0, null)
            this.m_preAppendedItems.splice(track, 0, null)
        }
        this.m_shapes.splice(staff, 0, new Shape())
        this.fixStaffIdx()
    }

    fixStaffIdx(): void {
        let track = 0
        for (const e of this.m_elist) {
            if (e) {
                e.setTrack(track)
            }
            ++track
        }
    }

    private checkElement(_el: EngravingItem, _track: track_idx_t): void {
        // C++ only logs
    }

    override add(el: EngravingItem): void {
        if (el.explicitParent() !== this) {
            el.setParent(this)
        }
        const track = el.track()

        if (el.isStyled(Pid.OFFSET)) {
            el.setOffset(el.propertyDefault(Pid.OFFSET) as PointF)
        }

        switch (el.type()) {
        case ElementType.MEASURE_REPEAT:
            this.m_elist[track] = el
            this.setEmpty(false)
            break
        case ElementType.HARMONY:
        case ElementType.FRET_DIAGRAM:
        case ElementType.TEMPO_TEXT:
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION:
        case ElementType.SYMBOL:
        case ElementType.STAFF_TEXT:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TRIPLET_FEEL:
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.CAPO:
        case ElementType.REHEARSAL_MARK:
        case ElementType.MARKER:
        case ElementType.IMAGE:
        case ElementType.TEXT:
        case ElementType.TREMOLOBAR:
        case ElementType.TAB_DURATION_SYMBOL:
        case ElementType.FIGURED_BASS:
        case ElementType.FERMATA:
        case ElementType.STICKING:
        case ElementType.STRING_TUNINGS:
        case ElementType.STAFF_STATE:
            this.m_annotations.push(el)
            break
        case ElementType.INSTRUMENT_CHANGE: {
            const part = el.part()!
            part.setInstrument((el as InstrumentChange).instrument(), this.tick())
            this.m_annotations.push(el)
            break
        }
        case ElementType.HARP_DIAGRAM:
            // TODO(port): harp diagrams
            this.m_annotations.push(el)
            break
        case ElementType.PLAY_COUNT_TEXT:
            if (!this.findAnnotation(ElementType.PLAY_COUNT_TEXT, el.track(), el.track())) {
                this.m_annotations.push(el)
            }
            break
        case ElementType.CLEF:
            this.checkElement(el, track)
            this.m_elist[track] = el
            if (!el.generated()) {
                el.staff()!.setClef(el as Clef)
            }
            this.setEmpty(false)
            break
        case ElementType.TIMESIG:
            this.checkElement(el, track)
            this.m_elist[track] = el
            el.staff()!.addTimeSig(el as TimeSig)
            this.setEmpty(false)
            if (this.segmentType() & SegmentType.CourtesyTimeSigType) {
                (el as TimeSig).setIsCourtesy(true)
            }
            break
        case ElementType.KEYSIG:
            this.checkElement(el, track)
            this.m_elist[track] = el
            if (!el.generated()) {
                el.staff()!.setKey(this.tick(), (el as KeySig).keySigEvent())
            }
            this.setEmpty(false)
            if (this.m_segmentType === SegmentType.CourtesyKeySigType) {
                (el as KeySig).setIsCourtesy(true)
            }
            break
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.MMREST: {
            if (track % VOICES) {
                let v: boolean
                if (el.isChord()) {
                    v = (el as Chord).notes().some(n => n.visible())
                } else {
                    v = el.visible()
                }
                if (v && this.measure().score().ntracks() > track) {
                    this.measure().setHasVoices(Math.trunc(track / VOICES), true)
                }
            }
            if (track < this.score().nstaves() * VOICES) {
                this.m_elist[track] = el
            }
            this.setEmpty(false)
            break
        }
        case ElementType.BAR_LINE:
        case ElementType.BREATH:
            if (track < this.score().nstaves() * VOICES) {
                this.checkElement(el, track)
                this.m_elist[track] = el
            }
            this.setEmpty(false)
            break
        case ElementType.AMBITUS:
            this.m_elist[track] = el
            this.setEmpty(false)
            break
        case ElementType.TIME_TICK_ANCHOR:
            this.m_elist[track] = el
            this.setEmpty(false)
            break
        default:
            return
        }
    }

    override remove(el: EngravingItem): void {
        const track = el.track()
        switch (el.type()) {
        case ElementType.CHORD:
        case ElementType.REST:
            this.m_elist[track] = null
            this.measure().checkMultiVoices(el.staffIdx())
            break
        case ElementType.MMREST:
        case ElementType.MEASURE_REPEAT:
        case ElementType.TIME_TICK_ANCHOR:
            this.m_elist[track] = null
            break
        case ElementType.TIMESIG:
            this.m_elist[track] = null
            el.staff()?.removeTimeSig(el as TimeSig)
            break
        case ElementType.KEYSIG:
            this.m_elist[track] = null
            if (!el.generated()) {
                el.staff()?.removeKey(this.tick())
            }
            break
        case ElementType.CLEF:
            el.staff()?.removeClef(el as Clef)
            this.m_elist[track] = null
            break
        case ElementType.BAR_LINE:
        case ElementType.AMBITUS:
        case ElementType.BREATH:
            this.m_elist[track] = null
            break
        case ElementType.INSTRUMENT_CHANGE:
            if (!this.isMMRestSegment()) {
                el.part()!.removeInstrument(this.tick())
            }
            this.removeAnnotation(el)
            break
        default:
            this.removeAnnotation(el)
            break
        }
        this.checkEmpty()
    }

    static segmentTypeForElement(type: ElementType): SegmentType {
        switch (type) {
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.MMREST:
        case ElementType.MEASURE_REPEAT:
        case ElementType.JUMP:
        case ElementType.MARKER:
            return SegmentType.ChordRest
        case ElementType.CLEF:
            return SegmentType.Clef
        case ElementType.KEYSIG:
            return SegmentType.KeySig
        case ElementType.TIMESIG:
            return SegmentType.TimeSig
        case ElementType.BAR_LINE:
            return SegmentType.StartRepeatBarLine
        case ElementType.BREATH:
            return SegmentType.Breath
        default:
            return SegmentType.Invalid
        }
    }

    segmentType(): SegmentType { return this.m_segmentType }
    setSegmentType(t: SegmentType): void { this.m_segmentType = t }

    empty(): boolean { return this.flag(ElementFlag.EMPTY) }
    private setEmpty(val: boolean): void { this.setFlag(ElementFlag.EMPTY, val) }
    written(): boolean { return this.flag(ElementFlag.WRITTEN) }
    setWritten(val: boolean): void { this.setFlag(ElementFlag.WRITTEN, val) }
    /** Key/time sigs which should be placed at the end of the measure */
    endOfMeasureChange(): boolean { return this.flag(ElementFlag.END_OF_MEASURE_CHANGE) }
    setEndOfMeasureChange(val: boolean): void { this.setFlag(ElementFlag.END_OF_MEASURE_CHANGE, val) }

    checkEmpty(): void {
        if (this.m_annotations.length) {
            this.setEmpty(false)
            return
        }
        this.setEmpty(!this.m_elist.some(e => !!e))
    }

    stretch(): number { return this.m_stretch }
    setStretch(v: number): void { this.m_stretch = v }

    override rtick(): Fraction { return this.m_tick }
    setRtick(v: Fraction): void { this.m_tick = v }
    override tick(): Fraction { return this.m_tick.plus(this.measure().tick()) }
    ticks(): Fraction { return this.m_ticks }
    setTicks(v: Fraction): void { this.m_ticks = v }

    widthInStaff(staffIdx: staff_idx_t, nextSegType: SegmentType = SegmentType.ChordRest): number {
        const segX = this.x()
        let nextSegX = segX
        const nextSeg = this.nextInStaff(staffIdx, nextSegType)
        if (nextSeg) {
            nextSegX = nextSeg.x()
        } else {
            const lastSeg = this.measure().lastEnabled()!
            if (lastSeg.segmentType() & nextSegType) {
                nextSegX = lastSeg.x() + lastSeg.width()
            } else {
                nextSegX = lastSeg.x()
            }
        }
        return nextSegX - segX
    }

    ticksInStaff(staffIdx: staff_idx_t): Fraction {
        const segTick = this.tick()
        let nextSegTick = segTick
        const nextSeg = this.nextInStaff(staffIdx, durationSegmentsMask)
        if (nextSeg) {
            nextSegTick = nextSeg.tick()
        } else {
            const lastSeg = this.measure().last()!
            nextSegTick = lastSeg.tick().plus(lastSeg.ticks())
        }
        return nextSegTick.minus(segTick)
    }

    splitsTuplet(): boolean {
        for (const e of this.m_elist) {
            if (!(e && e.isChordRest())) {
                continue
            }
            const cr = e as ChordRest
            let t = cr.tuplet()
            while (t) {
                if (cr !== t.elements()[0]) {
                    return true
                }
                t = t.tuplet()
            }
        }
        return false
    }

    /** this segment is before s */
    lessThan(s: Segment): boolean {
        if (this.tick().lt(s.tick())) {
            return true
        }
        if (this.tick().gt(s.tick())) {
            return false
        }
        for (let ns = this.next1(); ns && ns.tick().eq(s.tick()); ns = ns.next1()) {
            if (ns === s) {
                return true
            }
        }
        return false
    }

    annotations(): readonly EngravingItem[] { return this.m_annotations }

    clearAnnotations(): void { this.m_annotations = [] }

    removeAnnotation(e: EngravingItem): void {
        const i = this.m_annotations.indexOf(e)
        if (i >= 0) {
            this.m_annotations.splice(i, 1)
        }
    }

    firstElement(staffIdx: staff_idx_t): EngravingItem | null {
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES
        for (let track = startTrack; track < endTrack; ++track) {
            const item = this.element(track)
            if (item) {
                return item
            }
        }
        return null
    }

    hasElements(): boolean {
        return this.m_elist.some(e => !!e)
    }

    /** used by the writer: can a spanner start or end of the given track be written at this segment */
    canWriteSpannerStartEnd(track: track_idx_t, spanner: Spanner): boolean {
        const staffIdx = track2staff(track)
        if (this.isChordRestType() && (this.element(track) || (!spanner.isVoiceSpecific() && this.hasElementsInStaff(staffIdx)))) {
            return true
        }

        if (this.isTimeTickType()) {
            const crSegAtSameTick = this.score().tick2segment(this.tick(), true, SegmentType.ChordRest,
                this.style().styleB(Sid.createMultiMeasureRests))
            if (!crSegAtSameTick || !crSegAtSameTick.canWriteSpannerStartEnd(track, spanner)) {
                return true
            }
        }

        return this.score().lastMeasure()!.last() === this
    }

    hasElementsInRange(minTrack: track_idx_t, maxTrack: track_idx_t): boolean {
        for (let curTrack = minTrack; curTrack <= maxTrack; curTrack++) {
            if (this.element(curTrack)) {
                return true
            }
        }
        return false
    }

    hasElementsInStaff(staffIdx: staff_idx_t): boolean {
        const startTrack = staffIdx * VOICES
        return this.hasElementsInRange(startTrack, startTrack + VOICES - 1)
    }

    allElementsInvisible(): boolean {
        if (this.isSegType(SegmentType.TimeTick)) {
            return true
        }
        if (this.isSegType(SegmentType.BarLineType | SegmentType.ChordRest)) {
            return false
        }
        const sys = this.system()
        for (let staffIdx = 0; staffIdx < this.score().nstaves(); ++staffIdx) {
            const staff = this.score().staves()[staffIdx]
            if (!staff.visible()) {
                continue
            }
            if (sys && staffIdx < sys.staves().length && !sys.staves()[staffIdx].show()) {
                continue
            }
            const endTrack = staffIdx * VOICES + VOICES
            for (let track = staffIdx * VOICES; track < endTrack; ++track) {
                const e = this.m_elist[track]
                if (e && e.visible() && !RealIsEqual(e.width(), 0.0)) {
                    return false
                }
            }
        }
        return true
    }

    hasAnnotationOrElement(type: ElementType, minTrack: track_idx_t, maxTrack: track_idx_t): boolean {
        for (const e of this.m_annotations) {
            if (e.type() === type && e.track() >= minTrack && e.track() <= maxTrack) {
                return true
            }
        }
        return this.hasElementsInRange(minTrack, maxTrack)
    }

    findAnnotation(type: ElementType, minTrack: track_idx_t, maxTrack: track_idx_t): EngravingItem | null {
        for (const e of this.m_annotations) {
            if (e.type() === type && e.track() >= minTrack && e.track() <= maxTrack) {
                return e
            }
        }
        return null
    }

    findAnnotations(type: ElementType, minTrack: track_idx_t, maxTrack: track_idx_t): EngravingItem[] {
        return this.m_annotations.filter(e => e.type() === type && e.track() >= minTrack && e.track() <= maxTrack)
    }

    extraLeadingSpace(): Spatium { return this.m_extraLeadingSpace }
    setExtraLeadingSpace(v: Spatium): void { this.m_extraLeadingSpace = v }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TICK:
            return this.m_tick
        case Pid.LEADING_SPACE:
            return this.extraLeadingSpace()
        case Pid.END_OF_MEASURE_CHANGE:
            return this.endOfMeasureChange()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TICK:
            this.setRtick(v as Fraction)
            break
        case Pid.LEADING_SPACE:
            this.setExtraLeadingSpace(v as Spatium)
            for (const e of this.m_elist) {
                if (e) {
                    e.setGenerated(false)
                }
            }
            break
        case Pid.END_OF_MEASURE_CHANGE:
            this.setEndOfMeasureChange(!!v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.LEADING_SPACE) {
            return new Spatium(0)
        }
        return super.propertyDefault(propertyId)
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        const scanAllTimeSigs = this.isSegType(SegmentType.TimeSigType)
                                && this.style().styleV(Sid.timeSigPlacement) !== TimeSigPlacement.NORMAL
        const m = this.measure()
        for (let track = 0; track < this.score().nstaves() * VOICES; ++track) {
            const staffIdx = Math.trunc(track / VOICES)
            const thisMeasureVisible = m.visible(staffIdx) && this.score().staff(staffIdx)!.show()
            if (!scanAllTimeSigs && !thisMeasureVisible) {
                const nextMeasure = m.nextMeasure()
                const nextMeasureVisible = !!nextMeasure
                                           && nextMeasure.system() === m.system()
                                           && nextMeasure.visible(staffIdx)
                                           && this.score().staff(staffIdx)!.show()
                if (!((this.isEndBarLineType() && (nextMeasureVisible || m.isCutawayClef(staffIdx)))
                      || (this.isClefType() && m.isCutawayClef(staffIdx)))) {
                    track += VOICES - 1
                    continue
                }
            }
            const e = this.element(track)
            if (!e) {
                continue
            }
            e.scanElements(func)
        }
        for (const e of this.annotations()) {
            if (!e.systemFlag() && (!m || !m.visible(e.staffIdx()))) {
                continue
            }
            e.scanElements(func)
        }
    }

    // shapes

    shapes(): Shape[] { return this.m_shapes }
    staffShape(staffIdx: staff_idx_t): Shape { return this.m_shapes[staffIdx] }

    createShapes(): void {
        this.setVisible(false)
        for (let staffIdx = 0; staffIdx < this.score().nstaves(); ++staffIdx) {
            this.createShape(staffIdx)
        }
    }

    createShape(staffIdx: staff_idx_t): void {
        const s = new Shape()
        this.m_shapes[staffIdx] = s
        const system = this.system()
        if (system) {
            const staves = system.staves()
            if (staffIdx < staves.length && !staves[staffIdx].show()) {
                return
            }
        }
        if (!this.score().staff(staffIdx)!.show()) {
            return
        }

        const strack = staffIdx * VOICES
        const etrack = strack + VOICES
        for (const e of this.m_elist) {
            if (!e) {
                continue
            }
            const effectiveTrack = e.vStaffIdx() * VOICES + e.voice()
            if (effectiveTrack >= strack && effectiveTrack < etrack) {
                this.setVisible(true)
                if (e.isRest() && (e as Rest).isFullMeasureRest() && this.measure().hasVoices(e.staffIdx())) {
                    let isAllFullRests = true
                    for (let track = strack; track < etrack; ++track) {
                        const element = this.m_elist[track]
                        if (element && !(element.isRest() && (element as Rest).isFullMeasureRest())) {
                            isAllFullRests = false
                            break
                        }
                    }
                    if (!isAllFullRests) {
                        continue
                    }
                }
                if (e.isMMRest() || (e.isMeasureRepeat() && (e as unknown as { numMeasures(): number }).numMeasures() > 1)) {
                    continue
                }
                if (e.addToSkyline() || (e.isChordRest() && (e as ChordRest).lyrics().length > 0)) {
                    const p = e.isClef() ? e.ldata().pos() : e.pos()
                    s.add(e.shape().translate(p.plus(e.staffOffset())))
                }
                if (e.isChord()) {
                    this.addArticulationsToShape(e as Chord, s)
                }
            }
        }

        for (let e of this.m_annotations) {
            if (!e || e.staffIdx() !== staffIdx) {
                continue
            }
            this.setVisible(true)
            if (e.isFretDiagram() && !e.addToSkyline()) {
                const h = (e as unknown as { harmony(): EngravingItem | null }).harmony()
                if (h) {
                    e = h
                }
            }
            if (!e.addToSkyline()) {
                continue
            }
            if (e.isHarmony() || e.isFretDiagram()) {
                let pos = e.pos()
                if (e.isHarmony() && e.parent()!.isFretDiagram()) {
                    pos = pos.plus(e.parentItem()!.pos())
                }
                const bbox = e.ldata().bbox().translated(pos)
                const lp = e.leftParen()
                if (lp) {
                    bbox.unite(lp.ldata().bbox().translated(lp.pos().plus(pos)))
                }
                const rp = e.rightParen()
                if (rp) {
                    bbox.unite(rp.ldata().bbox().translated(rp.pos().plus(pos)))
                }
                s.addHorizontalSpacing(e, bbox.left(), bbox.right())
                if (e.isFretDiagram()) {
                    const harmony = (e as unknown as { harmony(): EngravingItem | null }).harmony()
                    if (harmony) {
                        const hpos = harmony.pos().plus(e.pos())
                        const harmBbox = harmony.ldata().bbox().translated(hpos)
                        const hlp = harmony.leftParen()
                        if (hlp) {
                            harmBbox.unite(hlp.ldata().bbox().translated(hlp.pos().plus(hpos)))
                        }
                        const hrp = harmony.rightParen()
                        if (hrp) {
                            harmBbox.unite(hrp.ldata().bbox().translated(hrp.pos().plus(hpos)))
                        }
                        s.addHorizontalSpacing(harmony, harmBbox.left(), harmBbox.right())
                    }
                }
            } else if (!e.isRehearsalMark()
                       && !e.isFretDiagram()
                       && !e.isHarmony()
                       && !e.isTempoText()
                       && !e.isDynamic()
                       && !e.isExpression()
                       && !e.isFiguredBass()
                       && !e.isSymbol()
                       && !e.isFSymbol()
                       && !e.isSystemText()
                       && !e.isTripletFeel()
                       && !e.isInstrumentChange()
                       && !e.isArticulationFamily()
                       && !e.isStaffText()
                       && !e.isHarpPedalDiagram()
                       && !e.isPlayTechAnnotation()
                       && !e.isCapo()
                       && !e.isStringTunings()
                       && !e.isPlayCountText()) {
                s.add(e.shape().translate(e.pos().plus(e.staffOffset())))
            }
        }

        for (let track = strack; track < etrack; ++track) {
            const item = this.m_preAppendedItems[track]
            if (!item) {
                continue
            }
            if (item.isGraceNotesGroup()) {
                (item as unknown as { addToShape(): void }).addToShape()
            } else {
                const shape = this.m_shapes[item.vStaffIdx()]
                shape.add(item.shape().translate(item.pos().plus(item.staffOffset())))
            }
        }
    }

    private addArticulationsToShape(chord: Chord, shape: Shape): void {
        for (const art of chord.articulations()) {
            if (art.isOrnament() || !art.addToSkyline()) {
                continue
            }
            shape.add(art.shape().translated(art.pos().plus(chord.pos())))
            // TODO(port): tapping half slurs
        }

        const ornament = chord.findOrnament() as unknown as { cueNoteChord(): Chord | null } | null
        if (ornament) {
            const cueNoteChord = ornament.cueNoteChord()
            if (cueNoteChord && cueNoteChord.upNote().addToSkyline()) {
                shape.add(cueNoteChord.shape().translate(cueNoteChord.pos().plus(cueNoteChord.staffOffset())))
            }
        }
    }

    minRight(): number {
        let distance = 0.0
        for (const sh0 of this.m_shapes) {
            const sh = sh0.clone()
            sh.remove_if((el: ShapeElement) => !!el.item() && el.item()!.isArticulationOrFermata())
            distance = Math.max(distance, sh.right())
        }
        return distance
    }

    minLeft(): number {
        let distance = -Number.MAX_VALUE
        for (const sh0 of this.m_shapes) {
            const sh = sh0.clone()
            sh.remove_if((el: ShapeElement) => !!el.item() && el.item()!.isArticulationOrFermata())
            const l = sh.left()
            if (l > distance) {
                distance = l
            }
        }
        return distance !== -Number.MAX_VALUE ? distance : 0.0
    }

    widthOffset(): number { return this.m_widthOffset }
    clearWidthOffset(): void { this.m_widthOffset = 0.0 }
    addWidthOffset(w: number): void { this.m_widthOffset += w }
    setWidthOffset(w: number): void { this.m_widthOffset = w }

    setSpacing(val: number): void { this.m_spacing = val }
    spacing(): number { return this.m_spacing }

    xPosInSystemCoords(): number { return this.ldata().posX() + this.measure().x() }
    setXPosInSystemCoords(x: number): void { this.mutldata().setPosX(x - this.measure().x()) }

    isTupletSubdivisionOnStaff(staffIdx: staff_idx_t): boolean {
        const timeStretch = this.score().staff(staffIdx)!.timeStretch(this.tick())
        const denom = this.m_tick.times(timeStretch).reduced().denominator()
        return (denom & (denom - 1)) !== 0
    }

    isInsideTupletOnStaff(staffIdx: staff_idx_t): boolean {
        const refCRSeg = this.isChordRestType() && this.hasElementsInStaff(staffIdx)
            ? this : this.prev1WithElemsOnStaff(staffIdx, SegmentType.ChordRest)
        if (!refCRSeg || refCRSeg.measure() !== this.measure()) {
            return false
        }
        const startTrack = staff2track(staffIdx)
        for (let track = startTrack; track < startTrack + VOICES; ++track) {
            const chordRest = refCRSeg.element(track) as ChordRest | null
            if (chordRest && chordRest.tuplet() && !this.tick().eq(chordRest.topTuplet()!.tick())) {
                return true
            }
        }
        return false
    }

    hasTimeSigAboveStaves(): boolean {
        return this.isSegType(SegmentType.TimeSigType)
               && this.style().styleV(Sid.timeSigPlacement) === TimeSigPlacement.ABOVE_STAVES
    }

    makeSpaceForTimeSigAboveStaves(): boolean {
        const makeSpace = this.style().styleB(Sid.timeSigCenterOnBarline)
            ? this.style().styleV(Sid.timeSigVSMarginCentered) === TimeSigVSMargin.CREATE_SPACE
            : this.style().styleV(Sid.timeSigVSMarginNonCentered) === TimeSigVSMargin.CREATE_SPACE
        return this.hasTimeSigAboveStaves() && makeSpace
    }

    hasTimeSigAcrossStaves(): boolean {
        return this.isSegType(SegmentType.TimeSigType)
               && this.style().styleV(Sid.timeSigPlacement) === TimeSigPlacement.ACROSS_STAVES
    }

    elementsTopOffsetFromSkyline(staffIndex: staff_idx_t): number {
        const segmentSystem = this.measure().system()
        const staffSystem = segmentSystem ? segmentSystem.staff(staffIndex) : null
        if (!staffSystem) {
            return 0
        }
        const north = staffSystem.skyline().north()
        let topOffset = 2147483647
        for (const element of north.elements()) {
            const seg = this.prev1enabled()
            if (!seg) {
                continue
            }
            const ok = seg.pagePos().x() <= element.left() && element.left() <= this.pagePos().x()
            if (!ok) {
                continue
            }
            if (element.top() < topOffset) {
                topOffset = Math.trunc(element.top())
            }
        }
        if (topOffset === 2147483647) {
            topOffset = 0
        }
        return topOffset
    }

    elementsBottomOffsetFromSkyline(staffIndex: staff_idx_t): number {
        const segmentSystem = this.measure().system()
        const staffSystem = segmentSystem ? segmentSystem.staff(staffIndex) : null
        if (!staffSystem) {
            return 0
        }
        const south = staffSystem.skyline().south()
        let bottomOffset = -2147483648
        for (const element of south.elements()) {
            const seg = this.prev1enabled()
            if (!seg) {
                continue
            }
            const ok = seg.pagePos().x() <= element.left() && element.left() <= this.pagePos().x()
            if (!ok) {
                continue
            }
            if (element.bottom() > bottomOffset) {
                bottomOffset = Math.trunc(element.bottom())
            }
        }
        if (bottomOffset === -2147483648) {
            bottomOffset = staffSystem.bbox().height()
        }
        return bottomOffset
    }

    shortestChordRest(): Fraction {
        let shortest = this.measure().ticks() // Initializing at the highest possible value ( = time signature of the measure)
        for (const elem of this.m_elist) {
            if (!elem || !elem.staff()!.show() || !elem.isChordRest() || (elem.isRest() && (elem as Rest).isGap())
                || (!elem.visible()
                    && this.measure().hasVoicesInRange(elem.staffIdx(), this.measure().tick(), this.measure().ticks(), true))) {
                continue
            }
            const cur = (elem as ChordRest).actualTicks()
            if (cur.lt(shortest)) {
                shortest = cur
            }
        }
        return shortest
    }

    hasAccidentals(): boolean {
        if (!this.isChordRestType()) {
            return false
        }
        for (const e of this.m_elist) {
            if (!e || !e.isChord() || (e.staff() && !e.staff()!.show())) {
                continue
            }
            for (const note of (e as Chord).notes()) {
                const acc = note.accidental()
                if (acc && acc.addToSkyline()) {
                    return true
                }
            }
        }
        return false
    }

    goesBefore(nextSegment: Segment): boolean {
        const meas = this.measure()
        const prevMeasure = meas.prevMeasure()
        const thisMeasureIsStartRepeat = meas.repeatStart()
        const prevMeasureIsEndRepeat = prevMeasure ? prevMeasure.repeatEnd() : false

        const thisIsClef = this.isClefType()
        const nextIsClef = nextSegment.isClefType()
        const thisIsBarline = this.isSegType(SegmentType.BarLine | SegmentType.EndBarLine | SegmentType.StartRepeatBarLine)
        const nextIsBarline = nextSegment.isSegType(SegmentType.BarLine | SegmentType.EndBarLine | SegmentType.StartRepeatBarLine)
        const thisIsStartRepeat = this.isStartRepeatBarLineType()
        const nextIsStartRepeat = nextSegment.isStartRepeatBarLineType()
        const thisIsKeySig = this.isKeySigType()
        const thisIsTimeSig = this.isTimeSigType()
        const nextIsKeySig = nextSegment.isKeySigType()
        const nextIsTimeSig = nextSegment.isTimeSigType()
        const firstSystemMeasure = !!meas.findSegmentR(SegmentType.HeaderClef, new Fraction(0, 1))
        const thisIsHeader = this.isHeaderClefType() || (this.rtick().isZero() && firstSystemMeasure && !thisIsClef)
        const nextIsHeader = nextSegment.isHeaderClefType() || (nextSegment.rtick().isZero() && firstSystemMeasure && !nextIsClef)
        const thisIsEndOfMeasure = this.endOfMeasureChange()

        if (thisIsEndOfMeasure && !nextSegment.tick().eq(meas.endTick())) {
            return false
        }
        if (thisIsEndOfMeasure && nextIsBarline) {
            return true
        }
        if ((thisIsKeySig || thisIsTimeSig || thisIsClef) && nextIsStartRepeat && thisMeasureIsStartRepeat && prevMeasureIsEndRepeat) {
            return this.style().styleB(Sid.changesBetweenEndStartRepeat)
        }
        if ((nextIsKeySig || nextIsTimeSig || nextIsClef) && thisIsStartRepeat && thisMeasureIsStartRepeat && prevMeasureIsEndRepeat) {
            return !this.style().styleB(Sid.changesBetweenEndStartRepeat)
        }
        if (thisIsClef && nextIsBarline) {
            let clefPos = ClefToBarlinePosition.AUTO
            for (const item of this.m_elist) {
                if (item && item.isClef()) {
                    clefPos = (item as Clef).clefToBarlinePosition()
                    break
                }
            }
            return clefPos !== ClefToBarlinePosition.AFTER
        }
        if (thisIsBarline && nextIsClef) {
            let clefPos = ClefToBarlinePosition.AUTO
            for (const item of nextSegment.m_elist) {
                if (item && item.isClef()) {
                    clefPos = (item as Clef).clefToBarlinePosition()
                    break
                }
            }
            return clefPos === ClefToBarlinePosition.AFTER
        }
        if (thisIsClef && (nextIsKeySig || nextIsTimeSig) && this.rtick().isZero() && nextSegment.rtick().isZero()
            && !nextIsHeader && thisMeasureIsStartRepeat && prevMeasureIsEndRepeat) {
            return true
        }
        if ((thisIsKeySig || thisIsTimeSig) && nextIsClef && this.rtick().isZero() && nextSegment.rtick().isZero()
            && !thisIsHeader && thisMeasureIsStartRepeat && prevMeasureIsEndRepeat) {
            return false
        }
        return this.segmentType() < nextSegment.segmentType()
    }

    preAppendedItem(track: track_idx_t): EngravingItem | null { return this.m_preAppendedItems[track] }
    preAppend(item: EngravingItem, track: track_idx_t): void { this.m_preAppendedItems[track] = item }
    clearPreAppended(track: track_idx_t): void { this.m_preAppendedItems[track] = null }

    /** C++: Segment::isType(SegmentType) */
    isSegType(t: SegmentType): boolean { return (this.m_segmentType & t) !== 0 }
    isJustType(t: SegmentType): boolean { return this.m_segmentType === t }
    isBeginBarLineType(): boolean { return this.m_segmentType === SegmentType.BeginBarLine }
    isClefType(): boolean { return this.m_segmentType === SegmentType.Clef }
    isHeaderClefType(): boolean { return this.m_segmentType === SegmentType.HeaderClef }
    isKeySigType(): boolean { return this.m_segmentType === SegmentType.KeySig }
    isAmbitusType(): boolean { return this.m_segmentType === SegmentType.Ambitus }
    isTimeSigType(): boolean { return this.m_segmentType === SegmentType.TimeSig }
    isStartRepeatBarLineType(): boolean { return this.m_segmentType === SegmentType.StartRepeatBarLine }
    isBarLineType(): boolean { return this.m_segmentType === SegmentType.BarLine }
    isBreathType(): boolean { return this.m_segmentType === SegmentType.Breath }
    isChordRestType(): boolean { return this.m_segmentType === SegmentType.ChordRest }
    isClefRepeatAnnounceType(): boolean { return this.m_segmentType === SegmentType.ClefRepeatAnnounce }
    isKeySigRepeatAnnounceType(): boolean { return this.m_segmentType === SegmentType.KeySigRepeatAnnounce }
    isTimeSigRepeatAnnounceType(): boolean { return this.m_segmentType === SegmentType.TimeSigRepeatAnnounce }
    isEndBarLineType(): boolean { return this.m_segmentType === SegmentType.EndBarLine }
    isKeySigAnnounceType(): boolean { return this.m_segmentType === SegmentType.KeySigAnnounce }
    isTimeSigAnnounceType(): boolean { return this.m_segmentType === SegmentType.TimeSigAnnounce }
    isCourtesySegment(): boolean {
        return (this.m_segmentType & (SegmentType.CourtesyTimeSigType | SegmentType.CourtesyKeySigType | SegmentType.CourtesyClefType)) !== 0
    }
    isTimeTickType(): boolean { return this.m_segmentType === SegmentType.TimeTick }
    isRightAligned(): boolean { return this.isClefType() || this.isBreathType() }
    isMMRestSegment(): boolean { return this.isChordRestType() && !!this.m_elist[0] && this.m_elist[0].isMMRest() }

    override toString(): string { return `Segment(${SegmentType[this.m_segmentType]} ${this.tick()})` }
}

export { RectF }
