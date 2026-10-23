/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/barline.h/.cpp (editing is not ported)
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { BarLineType, ElementType, PlacementV, VOICES, type staff_idx_t, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import type { Marker } from './marker'
import type { EditData } from '../editing/editdata'
import type { Measure } from './measure'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { SymNames } from '../types/symnames'
import { SymId } from '../types/symid'

// bar line span for 1-line staves is special: goes from 2sp above the line to 2sp below the line;
export const BARLINE_SPAN_1LINESTAFF_FROM = -4
export const BARLINE_SPAN_1LINESTAFF_TO = 4

// data for some preset bar line span types
export const BARLINE_SPAN_TICK1_FROM = -1
export const BARLINE_SPAN_TICK1_TO = -7
export const BARLINE_SPAN_TICK2_FROM = -2
export const BARLINE_SPAN_TICK2_TO = -6
export const BARLINE_SPAN_SHORT1_FROM = 2
export const BARLINE_SPAN_SHORT1_TO = -2
export const BARLINE_SPAN_SHORT2_FROM = 1
export const BARLINE_SPAN_SHORT2_TO = -1

export class BarLineLayoutData extends LayoutData {
    y1 = 0.0
    y2 = 0.0
}

function prevVisibleSpannedStaff(bl: BarLine): staff_idx_t {
    const score = bl.score()
    const staffIdx = bl.staffIdx()
    const segment = bl.segment()
    for (let i = staffIdx - 1; i >= 0; --i) {
        const nbl = segment.element(i * VOICES) as BarLine | null
        if (!nbl || !nbl.spanStaff()) {
            break
        }
        const s = score.staff(i)!
        if (s.part().show() && bl.measure()!.visible(i)) {
            return i
        }
    }
    return staffIdx
}

function nextVisibleSpannedStaff(bl: BarLine): staff_idx_t {
    const score = bl.score()
    const nstaves = score.nstaves()
    const staffIdx = bl.staffIdx()
    const segment = bl.segment()
    for (let i = staffIdx + 1; i < nstaves; ++i) {
        const s = score.staff(i)!
        if (s.part().show()) {
            // span/show bar line if this measure is visible
            if (bl.measure()!.visible(i)) {
                return i
            }
            // or if this is an endBarLine and:
            if (segment && segment.isEndBarLineType()) {
                // ...this measure contains a (cutaway) courtesy clef only
                if (bl.measure()!.isCutawayClef(i)) {
                    return i
                }
                // ...or next measure is both visible and in the same system
                const nm = bl.measure()!.nextMeasure()
                if ((nm ? nm.visible(i) : false) && (nm ? nm.system() === bl.measure()!.system() : false)) {
                    return i
                }
            }
        }
        const nbl = segment.element(i * VOICES) as BarLine | null
        if (!nbl || !nbl.spanStaff()) {
            break
        }
    }
    return staffIdx
}

/** C++ BarLine::barLineTable (user names: SymNames::userNameForSymId) */
const BAR_LINE_TABLE: readonly { type: BarLineType; symId: SymId }[] = [
    { type: BarLineType.NORMAL, symId: SymId.barlineSingle },
    { type: BarLineType.DOUBLE, symId: SymId.barlineDouble },
    { type: BarLineType.START_REPEAT, symId: SymId.repeatLeft },
    { type: BarLineType.END_REPEAT, symId: SymId.repeatRight },
    { type: BarLineType.BROKEN, symId: SymId.barlineDashed },
    { type: BarLineType.END, symId: SymId.barlineFinal },
    { type: BarLineType.END_START_REPEAT, symId: SymId.repeatRightLeft },
    { type: BarLineType.DOTTED, symId: SymId.barlineDotted },
    { type: BarLineType.REVERSE_END, symId: SymId.barlineReverseFinal },
    { type: BarLineType.HEAVY, symId: SymId.barlineHeavy },
    { type: BarLineType.DOUBLE_HEAVY, symId: SymId.barlineHeavyHeavy },
]

export class BarLine extends EngravingItem {
    private m_spanStaff = false // span barline to next staff if true
    private m_spanFrom = 0 // line number on start and end staves
    private m_spanTo = 0
    private m_barLineType = BarLineType.NORMAL
    private m_el: EngravingItem[] = [] // fermata or other articulations
    private m_playCount = -1 // For use during copy & paste

    constructor(parent: Segment | null) {
        super(ElementType.BAR_LINE, parent)
    }

    protected override createLayoutData(): BarLineLayoutData { return new BarLineLayoutData(this) }
    override ldata(): BarLineLayoutData { return super.ldata() as BarLineLayoutData }
    override mutldata(): BarLineLayoutData { return super.ldata() as BarLineLayoutData }

    override canvasPos(): PointF {
        const pos = super.canvasPos()
        if (this.explicitParent()) {
            const system = this.measure()!.system()
            const yoff = system ? system.staff(this.staffIdx())!.y() : 0.0
            pos.setY(pos.y() + yoff)
        }
        return pos
    }

    override pagePos(): PointF {
        if (!this.explicitParent()) {
            return this.pos()
        }
        const system = this.segment().measure().system()
        let yp = this.y()
        if (system) {
            // get first not hidden staff
            const startIdx = this.staffIdx()
            const endIdx = startIdx + (this.spanStaff() ? 1 : 0)
            let staffIdx1 = startIdx
            let staff1 = this.score().staff(staffIdx1)
            let sysStaff1 = system.staff(staffIdx1)
            while (staff1 && sysStaff1 && !(sysStaff1.show() && staff1.show())) {
                if (++staffIdx1 >= endIdx) {
                    // no visible staves spanned; just use first
                    staffIdx1 = startIdx
                    break
                }
                staff1 = this.score().staff(staffIdx1)
                sysStaff1 = system.staff(staffIdx1)
            }
            yp += system.staffYpage(staffIdx1)
        }
        return new PointF(this.pageX(), yp)
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        for (const e of this.m_el) {
            e.scanElements(func)
        }
    }

    override setTrack(t: track_idx_t): void {
        super.setTrack(t)
        for (const e of this.m_el ?? []) {
            e.setTrack(t)
        }
    }

    override add(e: EngravingItem): void {
        e.setParent(this)
        switch (e.type()) {
        case ElementType.ARTICULATION:
        case ElementType.SYMBOL:
        case ElementType.IMAGE:
            this.m_el.push(e)
            this.setGenerated(false)
            break
        default:
            break
        }
    }

    override remove(e: EngravingItem): void {
        const i = this.m_el.indexOf(e)
        if (i >= 0) {
            this.m_el.splice(i, 1)
        }
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure | null {
        return this.explicitParent() ? this.explicitParent()!.explicitParent() as unknown as Measure : null
    }

    // ---------------------------------------------------------
    //   drop
    // ---------------------------------------------------------

    override acceptDrop(data: EditData): boolean {
        const e = data.dropElement!

        if (e.isBarLine()) {
            return true
        } else if (e.isFermata() || e.isSymbol() || e.isImage()) {
            return !!this.segment() && this.segment().isEndBarLineType()
        } else if (e.isMeasureNumber() || e.isJump() || e.isMarker() || e.isLayoutBreak()) {
            let m = this.measure()
            if (m) {
                const left = (e.isMarker() && !(e as unknown as Marker).isRightMarker()) || e.isMeasureNumber()
                if (left && this.segment().isEndBarLineType() && m.nextMeasureMM()) {
                    m = m.nextMeasureMM()!
                }
                return m.acceptDrop(data)
            }
        }
        return false
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!

        if (e.isBarLine()) {
            const bl = e as BarLine
            const st = bl.barLineType()

            if (this.segment().segmentType() === SegmentType.BarLine) {
                // barline exists mid measure
                this.undoChangeProperty(Pid.BARLINE_TYPE, st)
                this.undoChangeProperty(Pid.BARLINE_SPAN, false)
                this.undoChangeProperty(Pid.BARLINE_SPAN_FROM, bl.spanFrom())
                this.undoChangeProperty(Pid.BARLINE_SPAN_TO, bl.spanTo())
            } else {
                // check if the new property can apply to this single bar line
                const bt = BarLineType.START_REPEAT | BarLineType.END_REPEAT | BarLineType.END_START_REPEAT
                const oldRepeat = (this.barLineType() & bt) !== 0
                const newRepeat = (bl.barLineType() & bt) !== 0

                const m = this.measure()!
                if (bl.playCount() !== -1) {
                    m.undoChangeProperty(Pid.REPEAT_COUNT, bl.playCount())
                }

                // if ctrl was used and repeats are not involved,
                // or if drop refers to span rather than subtype =>
                // single bar line drop

                if ((data.control() && !oldRepeat && !newRepeat) || (bl.spanFrom() || bl.spanTo())) {
                    // if drop refers to span, update this bar line span
                    if (bl.spanFrom() || bl.spanTo()) {
                        // if dropped spanFrom or spanTo are below the middle of standard staff (5 lines)
                        // adjust to the number of staff lines
                        const spanFrom = bl.spanFrom()
                        const spanTo = bl.spanTo()
                        this.undoChangeProperty(Pid.BARLINE_SPAN, false)
                        this.undoChangeProperty(Pid.BARLINE_SPAN_FROM, spanFrom)
                        this.undoChangeProperty(Pid.BARLINE_SPAN_TO, spanTo)
                    } else {
                        // if drop refers to subtype, update this bar line subtype
                        this.score().undoChangeBarLineType(this, st, false)
                    }
                } else {
                    this.score().undoChangeBarLineType(this, st, true)
                }
                this.score().undoUpdatePlayCountText(m)
            }
        } else if (e.isArticulationFamily()) {
            e.setParent(this)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            return e
        } else if (e.isSymbol() || e.isImage()) {
            e.setParent(this)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            return e
        } else if (e.isFermata()) {
            e.setPlacement(this.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
            for (const el of this.segment().annotations()) {
                if (el.isFermata() && (el.track() === this.track())) {
                    if (el.subtype() === e.subtype()) {
                        return el
                    } else {
                        e.setPlacement(el.placement())
                        e.setTrack(this.track())
                        e.setParent(this.segment())
                        this.score().undoChangeElement(el, e)
                        return e
                    }
                }
            }
            e.setTrack(this.track())
            e.setParent(this.segment())
            this.score().undoAddElement(e)
            return e
        } else if (e.isMeasureNumber() || e.isJump() || e.isMarker() || e.isLayoutBreak()) {
            let m = this.measure()
            if (m) {
                const left = (e.isMarker() && !(e as unknown as Marker).isRightMarker()) || e.isMeasureNumber()
                if (left && this.segment().isEndBarLineType() && m.nextMeasureMM()) {
                    m = m.nextMeasureMM()!
                }
                return m.drop(data)
            }
        }
        return null
    }

    setSpanStaff(val: boolean): void { this.m_spanStaff = val }
    setSpanFrom(val: number): void { this.m_spanFrom = val }
    setSpanTo(val: number): void { this.m_spanTo = val }
    spanStaff(): boolean { return this.m_spanStaff }
    spanFrom(): number { return this.m_spanFrom }
    spanTo(): number { return this.m_spanTo }
    showTips(): boolean { return this.style().styleB(Sid.repeatBarTips) }

    el(): EngravingItem[] { return this.m_el }

    setBarLineType(i: BarLineType): void { this.m_barLineType = i }
    barLineType(): BarLineType { return this.m_barLineType }
    override subtype(): number { return this.m_barLineType }

    setPlayCount(playCount: number): void { this.m_playCount = playCount }
    playCount(): number { return this.m_playCount }

    isTop(): boolean {
        const idx = this.staffIdx()
        if (idx === 0) {
            return true
        }
        return prevVisibleSpannedStaff(this) === idx
    }

    isBottom(): boolean {
        if (!this.m_spanStaff) {
            return true
        }
        const idx = this.staffIdx()
        if (idx === this.score().nstaves() - 1) {
            return true
        }
        return nextVisibleSpannedStaff(this) === idx
    }

    // ---------------------------------------------------------
    //   calcY
    // ---------------------------------------------------------

    calcY(): void {
        const data = this.mutldata()
        const sp = this.spatium()
        if (!this.explicitParent()) {
            // for use in palette
            data.y1 = this.m_spanFrom * sp * 0.5
            data.y2 = (8 - this.m_spanTo) * sp * 0.5
            return
        }
        const staffIdx1 = this.staffIdx()
        const staffIdx2 = this.m_spanStaff ? nextVisibleSpannedStaff(this) : staffIdx1
        const spanStaff = staffIdx2 !== staffIdx1

        const measure = this.segment().measure()
        const system = measure.system()
        if (!system) {
            return
        }

        const tick = this.segment().measure().tick()
        const staff1 = this.score().staff(staffIdx1)!
        const staffType1 = staff1.staffType(tick)

        const oneLine = staffType1.lines() <= 1
        let from = this.m_spanFrom
        let to = this.m_spanTo
        if (oneLine && this.m_spanFrom === 0 && this.m_spanTo === 0) {
            from = BARLINE_SPAN_1LINESTAFF_FROM
            if (!spanStaff) {
                to = BARLINE_SPAN_1LINESTAFF_TO
            }
        }
        const spatium1 = staffType1.spatium()
        const lineDistance = staffType1.lineDistance().val() * spatium1
        const offset = staffType1.yoffset().val() * spatium1
        const lineWidth = this.style().styleS(Sid.staffLineWidth).val() * spatium1 * 0.5

        let y1 = offset + from * lineDistance * 0.5 - lineWidth
        let y2 = offset + (staffType1.lines() * 2 - 2 + to) * lineDistance * 0.5 + lineWidth

        if (spanStaff) {
            const staff2 = this.score().staff(staffIdx2)
            const staffType2 = staff2 ? staff2.staffType(tick) : staffType1
            const spatium2 = staffType2.spatium()
            const lineDistance2 = staffType2.lineDistance().val() * spatium2
            const startStaffY = system.staff(staffIdx1)!.y()

            y2 = measure.staffLines(staffIdx2).y1() - startStaffY - to * lineDistance2 * 0.5
            if (staffType2.lines() <= 1) {
                y2 += BARLINE_SPAN_1LINESTAFF_FROM * lineDistance2 * 0.5
            }
        }

        // if stafftype change in next measure, check final barline
        const tickNext = tick.plus(measure.ticks())
        if (staff1.isStaffTypeStartFrom(tickNext)) {
            const measureNext = measure.nextMeasure()
            const systemNext = measureNext ? measureNext.system() : null
            const staffType1Next = staff1.staffType(tickNext)
            const oneLineNext = staffType1Next.lines() <= 1

            if (systemNext && systemNext === system && staffType1Next !== staffType1) {
                if (oneLine && !oneLineNext) {
                    from = this.m_spanFrom
                    to = this.m_spanTo
                }
                if (oneLineNext && this.m_spanFrom === 0 && this.m_spanTo === 0) {
                    from = BARLINE_SPAN_1LINESTAFF_FROM
                    if (!spanStaff) {
                        to = BARLINE_SPAN_1LINESTAFF_TO
                    }
                }
                const spatium1Next = staffType1Next.spatium()
                const lineDistanceNext = staffType1Next.lineDistance().val() * spatium1Next
                const offsetNext = staffType1Next.yoffset().val() * spatium1Next
                const lineWidthNext = this.style().styleS(Sid.staffLineWidth).val() * spatium1Next * 0.5
                const y1Next = Math.trunc(offsetNext + from * lineDistanceNext * 0.5 - lineWidthNext) // int in C++

                if (this.rtick().isNotZero()) {
                    if (y1Next < y1) {
                        y1 = y1Next
                    }
                    if (!spanStaff) {
                        const y2Next = offsetNext + (staffType1Next.lines() * 2 - 2 + to) * lineDistanceNext * 0.5 + lineWidthNext
                        if (y2Next > y2) {
                            y2 = y2Next
                        }
                    }
                }
            }
        }
        data.y1 = y1
        data.y2 = y2
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.REPEAT_COUNT) {
            return this.measure()
        }
        // TODO(port): PLAY_COUNT_TEXT delegation
        return super.propertyDelegate(pid)
    }

    override getProperty(id: Pid): PropertyValue {
        const e = this.propertyDelegate(id)
        if (e) {
            return e.getProperty(id)
        }
        switch (id) {
        case Pid.BARLINE_TYPE: return this.m_barLineType
        case Pid.BARLINE_SPAN: return this.spanStaff()
        case Pid.BARLINE_SPAN_FROM: return this.spanFrom()
        case Pid.BARLINE_SPAN_TO: return this.spanTo()
        case Pid.BARLINE_SHOW_TIPS: return this.showTips()
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        const e = this.propertyDelegate(id)
        if (e) {
            return e.setProperty(id, v)
        }
        switch (id) {
        case Pid.BARLINE_TYPE:
            this.setBarLineType(v as BarLineType)
            break
        case Pid.BARLINE_SPAN:
            this.setSpanStaff(!!v)
            break
        case Pid.BARLINE_SPAN_FROM:
            this.setSpanFrom(v as number)
            break
        case Pid.BARLINE_SPAN_TO:
            this.setSpanTo(v as number)
            break
        case Pid.BARLINE_SHOW_TIPS:
            // TODO(port): changes the style value (undoChangeStyleVal)
            break
        default:
            return super.setProperty(id, v)
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        const e = this.propertyDelegate(propertyId)
        if (e) {
            return e.propertyDefault(propertyId)
        }
        switch (propertyId) {
        case Pid.BARLINE_TYPE: return BarLineType.NORMAL
        case Pid.BARLINE_SPAN: return this.staff() ? this.staff()!.barLineSpan() : false
        case Pid.BARLINE_SPAN_FROM: return this.staff() ? this.staff()!.barLineFrom() : 0
        case Pid.BARLINE_SPAN_TO: return this.staff() ? this.staff()!.barLineTo() : 0
        case Pid.BARLINE_SHOW_TIPS: return false
        default: return super.propertyDefault(propertyId)
        }
    }

    static translatedUserTypeName(t: BarLineType): string {
        for (const i of BAR_LINE_TABLE) {
            if (i.type === t) {
                return SymNames.userNameForSymId(i.symId).translated()
            }
        }
        return ''
    }

    override subtypeUserName(): TranslatableString {
        for (const i of BAR_LINE_TABLE) {
            if (i.type === this.barLineType()) {
                return SymNames.userNameForSymId(i.symId)
            }
        }
        return new TranslatableString()
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${BarLine.translatedUserTypeName(this.barLineType())}`
    }
}
