/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/engravingitem.h/.cpp
 *
 * Not ported: editing, drag & drop, accessibility, part linking.
 */

import { Color } from '../../framework/draw/types/color'
import { PointF, RectF, SizeF } from '../../framework/draw/types/geometry'
import type { Painter } from '../../framework/draw/painter'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SmuflAnchorId, SymId, type SymIdList } from '../types/symid'
import {
    ElementType, ParenthesesMode, PlacementV, nidx, staff2track, track2staff, track2voice, VOICES,
    type staff_idx_t, type track_idx_t, type voice_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Shape } from '../infrastructure/shape'
import { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Staff } from './staff'
import type { Part } from './part'
import type { StaffType } from './stafftype'
import type { Segment } from './segment'
import type { MeasureBase } from './measurebase'
import type { Measure } from './measure'
import type { System } from './system'
import type { Page } from './page'

export enum ElementFlag {
    NOTHING = 0x00000000,
    DROP_TARGET = 0x00000001,
    NOT_SELECTABLE = 0x00000002,
    MOVABLE = 0x00000004,
    COMPOSITION = 0x00000008, // true if element is part of another element
    ON_STAFF = 0x00000010,
    SELECTED = 0x00000020,
    GENERATED = 0x00000040,
    INVISIBLE = 0x00000080,
    NO_AUTOPLACE = 0x00000100,
    SYSTEM = 0x00000200,
    PLACE_ABOVE = 0x00000400,
    SIZE_SPATIUM_DEPENDENT = 0x00000800,
    REPEAT_END = 0x00001000,
    REPEAT_START = 0x00002000,
    REPEAT_JUMP = 0x00004000,
    IRREGULAR = 0x00008000,
    LINE_BREAK = 0x00010000,
    PAGE_BREAK = 0x00020000,
    SECTION_BREAK = 0x00040000,
    NO_BREAK = 0x00080000,
    HEADER = 0x00100000,
    TRAILER = 0x00200000, // also used in segment
    COURTESY_KEYSIG = 0x00400000,
    COURTESY_TIMESIG = 0x00800000,
    COURTESY_CLEF = 0x01000000,
    ENABLED = 0x02000000, // used for segments
    EMPTY = 0x04000000,
    WRITTEN = 0x08000000,
    END_OF_MEASURE_CHANGE = 0x10000000,
}

export enum OffsetChange {
    RELATIVE_OFFSET = -1,
    NONE = 0,
    ABSOLUTE_OFFSET = 1,
}

export enum KerningType {
    KERNING,
    NON_KERNING,
    KERN_UNTIL_LEFT_EDGE,
    KERN_UNTIL_CENTER,
    KERN_UNTIL_RIGHT_EDGE,
    SAME_VOICE_LIMIT,
    ALLOW_COLLISION,
}

export interface Autoplace {
    offsetChanged: OffsetChange // set by user actions that change offset, used by autoplace
    changedPos: PointF // position set when changing offset
}

export interface StaffCenteringInfo {
    availableVertSpaceAbove: number
    availableVertSpaceBelow: number
}

/**
 * Hook used by LayoutData.shape() for items whose shape is computed lazily
 * by the layout code (in C++ the dom calls into the rendering module directly).
 */
export const ldataShapeHooks: Partial<Record<ElementType, (item: EngravingItem, ld: LayoutData) => void>> = {}

export class LayoutData {
    autoplace: Autoplace = { offsetChanged: OffsetChange.NONE, changedPos: new PointF() }

    protected m_item: EngravingItem
    protected m_isSkipDraw = false
    protected m_mag = 1.0 // standard magnification (derived value)
    protected m_posSet = false
    protected m_posX = 0
    protected m_posY = 0
    protected m_shape: Shape | null = null
    protected m_mask: Shape | null = null
    protected m_itemSnappedBefore: EngravingItem | null = null
    protected m_itemSnappedAfter: EngravingItem | null = null
    protected m_staffCenteringInfo: StaffCenteringInfo = { availableVertSpaceAbove: 0, availableVertSpaceBelow: 0 }

    constructor(item: EngravingItem) {
        this.m_item = item
    }

    item(): EngravingItem { return this.m_item }

    reset(): void {
        this.m_shape = null
        this.m_mask = null
    }

    isValid(): boolean { return this.m_shape !== null && this.m_shape.bbox().isValid() }

    isSkipDraw(): boolean { return this.m_isSkipDraw }
    setIsSkipDraw(val: boolean): void { this.m_isSkipDraw = val }

    mag(): number { return this.m_mag }
    setMag(val: number): void { this.m_mag = val }

    isSetPos(): boolean { return this.m_posSet }
    pos(): PointF { return new PointF(this.m_posX, this.m_posY) }
    posX(): number { return this.m_posX }
    posY(): number { return this.m_posY }
    setPos(x: number | PointF, y?: number): void {
        if (x instanceof PointF) {
            this.doSetPos(x.x(), x.y())
        } else {
            this.doSetPos(x, y ?? 0)
        }
    }
    setPosX(x: number): void { this.doSetPos(x, this.m_posY) }
    setPosY(y: number): void { this.doSetPos(this.m_posX, y) }
    move(p: PointF): void { this.doSetPos(this.m_posX + p.x(), this.m_posY + p.y()) }
    moveX(x: number): void { this.doSetPos(this.m_posX + x, this.m_posY) }
    moveY(y: number): void { this.doSetPos(this.m_posX, this.m_posY + y) }

    protected doSetPos(x: number, y: number): void {
        this.m_posSet = true
        this.m_posX = x
        this.m_posY = y
    }

    isSetBbox(): boolean { return this.m_shape !== null }
    clearBbox(): void { this.m_shape = null }

    bbox(): RectF {
        const sh = this.m_shape
        if (!sh) {
            return new RectF()
        }
        switch (this.m_item.type()) {
        case ElementType.NOTE:
        case ElementType.ORNAMENT: {
            const els = sh.elements()
            return els.length ? new RectF(els[0].x(), els[0].y(), els[0].width(), els[0].height()) : new RectF()
        }
        default:
            break
        }
        return sh.bbox()
    }

    isSetShape(): boolean { return this.m_shape !== null }
    clearShape(): void { this.m_shape = null }

    /** returns a copy of the shape, including the parentheses of the item */
    shape(checkHook = true): Shape {
        const hook = ldataShapeHooks[this.m_item.type()]
        if (hook && checkHook) {
            hook(this.m_item, this)
        }
        const sh = this.m_shape ? this.m_shape.clone() : new Shape()
        switch (this.m_item.type()) {
        case ElementType.BEAM:
        case ElementType.GRACE_NOTES_GROUP:
        case ElementType.ORNAMENT:
        case ElementType.OTTAVA_SEGMENT:
        case ElementType.VOLTA_SEGMENT:
        case ElementType.PEDAL_SEGMENT:
        case ElementType.TEXTLINE_SEGMENT:
        case ElementType.HARMONIC_MARK_SEGMENT:
        case ElementType.PALM_MUTE_SEGMENT:
        case ElementType.LET_RING_SEGMENT:
        case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT:
        case ElementType.RASGUEADO_SEGMENT:
        case ElementType.WHAMMY_BAR_SEGMENT:
        case ElementType.SLUR_SEGMENT:
        case ElementType.TIE_SEGMENT:
        case ElementType.LAISSEZ_VIB_SEGMENT:
        case ElementType.PARTIAL_TIE_SEGMENT:
        case ElementType.NOTE:
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.MEASURE_REPEAT:
        case ElementType.MMREST:
        case ElementType.TUPLET:
        case ElementType.HAIRPIN_SEGMENT:
        case ElementType.TRILL_SEGMENT:
            return sh
        default:
            break
        }
        const leftParen = this.m_item.leftParen()
        if (leftParen && leftParen.addToSkyline()) {
            sh.add(leftParen.ldata().shape().translated(leftParen.pos()))
        }
        const rightParen = this.m_item.rightParen()
        if (rightParen && rightParen.addToSkyline()) {
            sh.add(rightParen.ldata().shape().translated(rightParen.pos()))
        }
        return sh
    }

    /** direct access to the stored shape (no copy) */
    rawShape(): Shape | null { return this.m_shape }

    setShape(sh: Shape): void { this.m_shape = sh }

    setBbox(r: RectF | number, y?: number, w?: number, h?: number): void {
        const rect = r instanceof RectF ? r : new RectF(r, y, w, h)
        this.m_shape = new Shape(rect, this.m_item, Shape.Type.Fixed)
    }

    addBbox(r: RectF): void {
        if (!this.m_shape) {
            this.m_shape = new Shape()
        }
        this.m_shape.addBBox(r)
    }

    setHeight(v: number): void {
        const r = this.bbox()
        r.setHeight(v)
        this.setBbox(r)
    }

    setWidth(v: number): void {
        const r = this.bbox()
        r.setWidth(v)
        this.setBbox(r)
    }

    setMask(m: Shape): void { this.m_mask = m }
    mask(): Shape | null { return this.m_mask }

    offsetChanged(): OffsetChange { return this.autoplace.offsetChanged }

    connectItemSnappedBefore(itemBefore: EngravingItem): void {
        if (!itemBefore || itemBefore === this.m_item || itemBefore === this.m_itemSnappedAfter
            || itemBefore.ldata().itemSnappedBefore() === this.m_item) {
            return
        }
        this.m_itemSnappedBefore = itemBefore
        itemBefore.mutldata().m_itemSnappedAfter = this.m_item
    }

    disconnectItemSnappedBefore(): void {
        if (!this.m_itemSnappedBefore) {
            return
        }
        this.m_itemSnappedBefore.mutldata().m_itemSnappedAfter = null
        this.m_itemSnappedBefore = null
    }

    connectItemSnappedAfter(itemAfter: EngravingItem): void {
        if (!itemAfter || itemAfter === this.m_item || itemAfter === this.m_itemSnappedBefore
            || itemAfter.ldata().itemSnappedAfter() === this.m_item) {
            return
        }
        this.m_itemSnappedAfter = itemAfter
        itemAfter.mutldata().m_itemSnappedBefore = this.m_item
    }

    disconnectItemSnappedAfter(): void {
        if (!this.m_itemSnappedAfter) {
            return
        }
        this.m_itemSnappedAfter.mutldata().m_itemSnappedBefore = null
        this.m_itemSnappedAfter = null
    }

    disconnectSnappedItems(): void {
        this.disconnectItemSnappedBefore()
        this.disconnectItemSnappedAfter()
    }

    itemSnappedBefore(): EngravingItem | null { return this.m_itemSnappedBefore }
    itemSnappedAfter(): EngravingItem | null { return this.m_itemSnappedAfter }

    staffCenteringInfo(): StaffCenteringInfo { return this.m_staffCenteringInfo }
    setStaffCenteringInfo(availSpaceAbove: number, availSpaceBelow: number): void {
        this.m_staffCenteringInfo = { availableVertSpaceAbove: availSpaceAbove, availableVertSpaceBelow: availSpaceBelow }
    }
}

export abstract class EngravingItem extends EngravingObject {
    protected m_z = -1
    protected m_color: Color = Color.BLACK.clone()
    protected m_track: track_idx_t = nidx // staffIdx * VOICES + voice

    private m_offset = new PointF() // offset from reference position, set by autoplace or user
    private m_minDistance = new Spatium(0) // autoplace min distance
    private m_flags: number = ElementFlag.NOTHING
    private m_excludeVerticalAlign = false
    private m_layoutData: LayoutData | null = null
    private m_leftParenthesis: EngravingItem | null = null
    private m_rightParenthesis: EngravingItem | null = null

    private m_isPositionLinkedToMaster = true
    private m_isAppearanceLinkedToMaster = true
    private m_excludeFromOtherParts = false

    /** helper flag for bsp */
    itemDiscovered = false

    constructor(type: ElementType, parent: EngravingObject | null = null, f: number = ElementFlag.NOTHING) {
        super(type, parent)
        this.m_flags = f
    }

    override isEngravingItem(): boolean { return true }

    parentItem(explicitParent = true): EngravingItem | null {
        const p = explicitParent ? this.explicitParent() : this.parent()
        if (p && p.isEngravingItem()) {
            return p as EngravingItem
        }
        return null
    }

    childrenItems(all = false): EngravingItem[] {
        const list: EngravingItem[] = []
        const collect = (item: EngravingObject): void => {
            for (const ch of item.children()) {
                if (ch.isEngravingItem()) {
                    list.push(ch as EngravingItem)
                    if (all) {
                        collect(ch)
                    }
                }
            }
        }
        collect(this)
        return list
    }

    findAncestor(t: ElementType): EngravingItem | null {
        let e: EngravingItem | null = this
        while (e && e.type() !== t) {
            e = e.parentItem()
        }
        return e
    }

    findMeasure(): Measure | null {
        if (this.isMeasure()) {
            return this as unknown as Measure
        } else if (this.explicitParent()) {
            return this.parentItem()!.findMeasure()
        }
        return null
    }

    findMeasureBase(): MeasureBase | null {
        if (this.isMeasureBase()) {
            return this as unknown as MeasureBase
        } else if (this.explicitParent()) {
            return this.parentItem()!.findMeasureBase()
        }
        return null
    }

    elementBase(): EngravingItem { return this }
    subtype(): number { return -1 }

    spatium(): number {
        const pi = this.explicitParent() ? this.parentItem() : null
        if (this.systemFlag() || (pi && pi.systemFlag())) {
            return this.style().spatium()
        }
        const s = this.staff()
        return s ? s.spatium(this) : this.style().spatium()
    }

    defaultSpatium(): number { return this.style().defaultSpatium() }
    absoluteFromSpatium(sp: Spatium): number { return sp.val() * this.spatium() }

    // flags

    setFlag(f: ElementFlag, v: boolean): void {
        if (v) {
            this.m_flags |= f
        } else {
            this.m_flags &= ~f
        }
    }

    flag(f: ElementFlag): boolean { return (this.m_flags & f) !== 0 }
    flags(): number { return this.m_flags }

    selected(): boolean { return this.flag(ElementFlag.SELECTED) }
    setSelected(f: boolean): void { this.setFlag(ElementFlag.SELECTED, f) }

    visible(): boolean { return !this.flag(ElementFlag.INVISIBLE) }
    setVisible(f: boolean): void { this.setFlag(ElementFlag.INVISIBLE, !f) }

    override sizeIsSpatiumDependent(): boolean { return !this.flag(ElementFlag.SIZE_SPATIUM_DEPENDENT) }
    setSizeIsSpatiumDependent(v: boolean): void { this.setFlag(ElementFlag.SIZE_SPATIUM_DEPENDENT, !v) }

    override offsetIsSpatiumDependent(): boolean {
        return this.sizeIsSpatiumDependent() || this.flag(ElementFlag.ON_STAFF)
    }

    placement(): PlacementV {
        return this.flag(ElementFlag.PLACE_ABOVE) && !this.isSystemObjectBelowBottomStaff() ? PlacementV.ABOVE : PlacementV.BELOW
    }
    setPlacement(val: PlacementV): void { this.setFlag(ElementFlag.PLACE_ABOVE, val === PlacementV.ABOVE) }
    placeAbove(): boolean { return this.placement() === PlacementV.ABOVE }
    placeBelow(): boolean { return this.placement() === PlacementV.BELOW }
    placeMultiple(): boolean { return true }

    generated(): boolean { return this.flag(ElementFlag.GENERATED) }
    setGenerated(val: boolean): void { this.setFlag(ElementFlag.GENERATED, val) }

    minDistance(): Spatium { return this.m_minDistance }
    setMinDistance(v: Spatium): void { this.m_minDistance = v }

    systemFlag(): boolean { return this.flag(ElementFlag.SYSTEM) }
    setSystemFlag(v: boolean): void { this.setFlag(ElementFlag.SYSTEM, v) }

    header(): boolean { return this.flag(ElementFlag.HEADER) }
    setHeader(v: boolean): void { this.setFlag(ElementFlag.HEADER, v) }

    trailer(): boolean { return this.flag(ElementFlag.TRAILER) }
    setTrailer(v: boolean): void { this.setFlag(ElementFlag.TRAILER, v) }

    selectable(): boolean { return !this.flag(ElementFlag.NOT_SELECTABLE) }
    setSelectable(v: boolean): void { this.setFlag(ElementFlag.NOT_SELECTABLE, !v) }

    composition(): boolean { return this.flag(ElementFlag.COMPOSITION) }
    setComposition(v: boolean): void { this.setFlag(ElementFlag.COMPOSITION, v) }

    isMovable(): boolean { return this.flag(ElementFlag.MOVABLE) }

    enabled(): boolean { return this.flag(ElementFlag.ENABLED) }
    setEnabled(v: boolean): void { this.setFlag(ElementFlag.ENABLED, v) }

    autoplace(): boolean {
        if (!this.m_score || !this.style().styleB(Sid.autoplaceEnabled)) {
            return false
        }
        return !this.flag(ElementFlag.NO_AUTOPLACE)
    }
    setAutoplace(v: boolean): void { this.setFlag(ElementFlag.NO_AUTOPLACE, !v) }

    addToSkyline(): boolean {
        return !(this.m_flags & (ElementFlag.INVISIBLE | ElementFlag.NO_AUTOPLACE)) && !this.ldata().isSkipDraw()
    }

    excludeVerticalAlign(): boolean { return this.m_excludeVerticalAlign }
    setExcludeVerticalAlign(v: boolean): void { this.m_excludeVerticalAlign = v }

    isPositionLinkedToMaster(): boolean { return this.m_isPositionLinkedToMaster }
    isAppearanceLinkedToMaster(): boolean { return this.m_isAppearanceLinkedToMaster }
    excludeFromOtherParts(): boolean { return this.m_excludeFromOtherParts }

    // offset

    offset(): PointF { return this.m_offset }
    setOffset(x: number | PointF, y?: number): void {
        if (x instanceof PointF) {
            this.m_offset = x.clone()
        } else {
            this.m_offset = new PointF(x, y ?? 0)
        }
    }
    isNudged(): boolean { return !this.m_offset.isNull() }

    // track / staff

    track(): track_idx_t { return this.m_track }
    setTrack(val: track_idx_t): void {
        this.m_track = val
        this.m_leftParenthesis?.setTrack(val)
        this.m_rightParenthesis?.setTrack(val)
    }

    z(): number {
        if (this.m_z === -1) {
            this.m_z = this.type() * 100
        }
        return this.m_z
    }
    setZ(val: number): void { this.m_z = val }

    staffIdx(): staff_idx_t { return track2staff(this.m_track) }
    setStaffIdx(val: staff_idx_t): void {
        const voiceIdx = this.voice()
        this.setTrack(staff2track(val, voiceIdx === nidx ? 0 : voiceIdx))
    }

    vStaffIdx(): staff_idx_t { return this.staffIdx() }

    effectiveStaffIdx(): staff_idx_t {
        if (!this.systemFlag()) {
            return this.vStaffIdx()
        }
        const system = this.findAncestor(ElementType.SYSTEM) as System | null
        if (!system || system.vbox()) {
            return this.vStaffIdx()
        }
        if (this.isSystemObjectBelowBottomStaff()) {
            return system.lastVisibleStaff()
        }
        const originalStaffIdx = this.staffIdx()
        if (originalStaffIdx === nidx) {
            return nidx
        }
        const m = this.findMeasure()
        const sc = this.score()
        // TODO - make more system markings ignore empty cutaway measures
        const cutawayMeasureNo = (staffIdx: staff_idx_t): boolean => {
            if (!m) {
                return false
            }
            const measureNo = this.isMeasureNumber()
            const staffVisible = m.mstaves()[staffIdx].visible()
            const cutaway = sc.staff(staffIdx)!.cutaway() && m.isEmpty(staffIdx)
            return (cutaway || !staffVisible) && measureNo
        }
        const systemObjectStaves = sc.systemObjectStaves()
        if (originalStaffIdx > 0) {
            let prevSysObjStaffIdx = 0
            for (const sysObjStaff of systemObjectStaves) {
                const sysObjStaffIdx = sysObjStaff.idx()
                if (sysObjStaffIdx > prevSysObjStaffIdx && sysObjStaffIdx < originalStaffIdx) {
                    prevSysObjStaffIdx = sysObjStaffIdx
                }
            }
            let omitObject = true
            for (let stfIdx = prevSysObjStaffIdx; stfIdx < originalStaffIdx; ++stfIdx) {
                if (sc.staff(stfIdx)!.show() && system.staff(stfIdx)!.show() && !cutawayMeasureNo(stfIdx)) {
                    omitObject = false
                    break
                }
            }
            if (omitObject) {
                // If all staves between this and the previous system object are hidden
                // we omit this object because it will be replaced by the upper one
                return nidx
            }
        }
        if (sc.staff(originalStaffIdx)!.show() && system.staff(originalStaffIdx)!.show() && !cutawayMeasureNo(originalStaffIdx)) {
            return originalStaffIdx
        }
        return system.nextVisibleStaff(originalStaffIdx)
    }

    isTopSystemObject(): boolean { return this.systemFlag() && this.track() === 0 }

    voice(): voice_idx_t { return track2voice(this.m_track) }
    setVoice(v: voice_idx_t): void { this.setTrack(Math.trunc(this.m_track / VOICES) * VOICES + v) }

    hasStaff(): boolean { return this.m_track !== nidx }

    staff(): Staff | null {
        if (!this.hasStaff() || !this.m_score || this.score().staves().length === 0) {
            return null
        }
        return this.score().staff(this.staffIdx())
    }

    staffType(): StaffType | null {
        const s = this.staff()
        return s ? s.staffTypeForElement(this) : null
    }

    onTabStaff(): boolean {
        const stt = this.staffType()
        return stt ? stt.isTabStaff() : false
    }

    part(): Part | null {
        const s = this.staff()
        return s ? s.part() : null
    }

    isSystemObjectBelowBottomStaff(): boolean {
        return this.systemFlag() && !!this.staff() && this.staff()!.hasSystemObjectsBelowBottomStaff()
    }

    // ticks

    tick(): Fraction {
        let e: EngravingItem | null = this
        while (e && e.explicitParent()) {
            const p = e.explicitParent()!
            if (p.isSegment()) {
                return (p as unknown as Segment).tick()
            } else if (p.isMeasureBase()) {
                return (p as unknown as MeasureBase).tick()
            }
            e = e.parentItem()
        }
        return new Fraction(0, 1)
    }

    rtick(): Fraction {
        let e: EngravingItem | null = this
        while (e && e.explicitParent()) {
            const p = e.explicitParent()!
            if (p.isSegment()) {
                return (p as unknown as Segment).rtick()
            }
            e = e.parentItem()
        }
        return new Fraction(0, 1)
    }

    // color

    setColor(c: Color): void { this.m_color = c.clone() }
    color(): Color { return this.m_color }

    /** color used for drawing (print mode: no selection etc.) */
    curColor(isVisible: boolean = this.visible(), normalColor: Color = this.color()): Color {
        if (!isVisible) {
            return new Color(0x80, 0x80, 0x80)
        }
        return normalColor
    }

    // positions

    ldata(): LayoutData {
        if (!this.m_layoutData) {
            this.m_layoutData = this.createLayoutData()
        }
        return this.m_layoutData
    }

    mutldata(): LayoutData { return this.ldata() }

    protected createLayoutData(): LayoutData { return new LayoutData(this) }

    mag(): number {
        return this.ldata().mag()
    }

    magS(): number {
        return this.mag() * (this.style().spatium() / this.defaultSpatium())
    }

    shape(): Shape { return this.ldata().shape() }

    baseLine(): number { return -this.height() }

    pos(): PointF {
        const ld = this.ldata()
        return new PointF(ld.posX() + this.m_offset.x(), ld.posY() + this.m_offset.y())
    }
    x(): number { return this.ldata().posX() + this.m_offset.x() }
    y(): number { return this.ldata().posY() + this.m_offset.y() }
    setPos(x: number | PointF, y?: number): void { this.mutldata().setPos(x as number, y) }
    move(s: PointF): void { this.mutldata().move(s) }

    setbbox(r: RectF): void { this.mutldata().setBbox(r) }
    height(): number { return this.ldata().bbox().height() }
    setHeight(v: number): void { this.mutldata().setHeight(v) }
    width(): number { return this.ldata().bbox().width() }
    setWidth(v: number): void { this.mutldata().setWidth(v) }

    pageBoundingRect(): RectF { return this.ldata().bbox().translated(this.pagePos()) }
    canvasBoundingRect(): RectF { return this.ldata().bbox().translated(this.canvasPos()) }

    staffOffset(): PointF {
        const st = this.staffType()
        const yOffset = st ? st.yoffset().val() * this.spatium() : 0.0
        return new PointF(0.0, yOffset)
    }
    staffOffsetY(): number { return this.staffOffset().y() }

    /** Returns position in system coordinates. Only applicable to items that have a System ancestor. */
    systemPos(): PointF {
        const result = this.pos()
        let ancestor = this.parentItem()
        while (ancestor && !ancestor.isSystem()) {
            result.add(ancestor.pos())
            ancestor = ancestor.parentItem()
        }
        return result
    }

    private measureStaffY(measure: Measure | null, idx: staff_idx_t): number {
        if (!measure) {
            return 0.0
        }
        if (measure.mstaves().length <= idx) {
            return 0.0
        }
        return measure.staffLines(idx).y()
    }

    private systemStaffY(system: System | null, idx: staff_idx_t): number {
        if (!system) {
            return 0.0
        }
        if (system.staves().length <= idx) {
            return 0.0
        }
        return system.staffYpage(idx)
    }

    /** position in page coordinates */
    pagePos(): PointF {
        const p = this.pos()
        if (!this.explicitParent()) {
            return p
        }
        let idx = this.effectiveStaffIdx()
        if (idx === nidx) {
            idx = this.vStaffIdx()
        }
        if (this.flag(ElementFlag.ON_STAFF)) {
            // Segments, measures and systems all contain multiple staves
            // Find the position of the stave that this item is on
            const parent = this.parentItem()!
            if (parent.isSegment()) {
                const segment = parent as unknown as Segment
                const measure = segment.measure()
                const system = measure ? measure.system() : null
                p.setY(p.y() + this.measureStaffY(measure, idx) + this.systemStaffY(system, idx))
            } else if (parent.isMeasure()) {
                const measure = parent as unknown as Measure
                const system = measure.system()
                p.setY(p.y() + this.measureStaffY(measure, idx) + this.systemStaffY(system, idx))
            } else if (parent.isSystem()) {
                const system = parent as unknown as System
                p.setY(p.y() + this.systemStaffY(system, idx))
            } else {
                return p.plus(parent.pagePos())
            }
            p.setX(this.pageX())
        } else {
            if (this.explicitParent()!.explicitParent()) {
                p.add(this.parentItem()!.pagePos())
            }
        }
        return p
    }

    /** position in canvas coordinates */
    canvasPos(): PointF {
        const p = this.pos()
        if (!this.explicitParent()) {
            return p
        }
        let idx = this.effectiveStaffIdx()
        if (idx === nidx) {
            idx = this.vStaffIdx()
        }
        const pageY = (page: Page | null): number => page ? page.y() : 0.0
        if (this.flag(ElementFlag.ON_STAFF)) {
            const parent = this.parentItem()!
            if (parent.isSegment()) {
                const segment = parent as unknown as Segment
                const measure = segment.measure()
                const system = measure ? measure.system() : null
                const page = system ? system.page() : null
                p.setY(p.y() + this.measureStaffY(measure, idx) + this.systemStaffY(system, idx) + pageY(page))
            } else if (parent.isMeasure()) {
                const measure = (parent as unknown as Measure).coveringMMRestOrThis()
                const system = measure.system()
                const page = system ? system.page() : null
                p.setY(p.y() + this.measureStaffY(measure, idx) + this.systemStaffY(system, idx) + pageY(page))
            } else if (parent.isSystem()) {
                const system = parent as unknown as System
                p.setY(p.y() + this.systemStaffY(system, idx))
            } else {
                return p.plus(parent.canvasPos())
            }
            p.setX(this.canvasX())
        } else {
            p.add(this.parentItem()!.canvasPos())
        }
        return p
    }

    pageX(): number {
        let xp = this.x()
        for (let e = this.parentItem(); e && e.parentItem(); e = e.parentItem()) {
            xp += e.x()
        }
        return xp
    }

    canvasX(): number {
        let xp = this.x()
        for (let e = this.parentItem(); e; e = e.parentItem()) {
            xp += e.x()
        }
        return xp
    }

    contains(p: PointF): boolean {
        return this.shape().contains(p.minus(this.pagePos()))
    }

    intersects(rr: RectF): boolean {
        return this.shape().intersects(rr.translated(this.pagePos().neg()))
    }

    // children

    add(e: EngravingItem): void {
        if (e.isParenthesis()) {
            const p = e as EngravingItem & { direction(): number }
            e.setVisible(this.visible())
            if (p.direction() === 1 /* DirectionH::LEFT */) {
                this.m_leftParenthesis = e
            } else if (p.direction() === 2 /* DirectionH::RIGHT */) {
                this.m_rightParenthesis = e
            }
        }
    }

    remove(e: EngravingItem): void {
        if (e === this.m_leftParenthesis) {
            this.m_leftParenthesis = null
        }
        if (e === this.m_rightParenthesis) {
            this.m_rightParenthesis = null
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        this.m_leftParenthesis?.scanElements(func)
        this.m_rightParenthesis?.scanElements(func)
        func(this)
    }

    collectForDrawing(): boolean {
        if (!this.visible() && !this.score().isShowInvisible()) {
            return false
        }
        return true
    }

    isPrintable(): boolean {
        switch (this.type()) {
        case ElementType.PAGE:
        case ElementType.SYSTEM:
        case ElementType.MEASURE:
        case ElementType.SEGMENT:
        case ElementType.VBOX:
        case ElementType.HBOX:
        case ElementType.TBOX:
        case ElementType.FBOX:
        case ElementType.SPACER:
        case ElementType.SHADOW_NOTE:
        case ElementType.LASSO:
            return false
        default:
            return true
        }
    }

    leftParen(): EngravingItem | null { return this.m_leftParenthesis }
    rightParen(): EngravingItem | null { return this.m_rightParenthesis }
    paren(dirLeft: boolean): EngravingItem | null { return dirLeft ? this.m_leftParenthesis : this.m_rightParenthesis }

    parenthesesMode(): ParenthesesMode {
        let p = ParenthesesMode.NONE
        if (this.m_leftParenthesis) {
            p |= ParenthesesMode.LEFT
        }
        if (this.m_rightParenthesis) {
            p |= ParenthesesMode.RIGHT
        }
        return p
    }

    // properties

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TICK:
            return this.tick()
        case Pid.TRACK:
            return this.track()
        case Pid.VOICE:
            return this.voice()
        case Pid.GENERATED:
            return this.generated()
        case Pid.COLOR:
            return this.color()
        case Pid.VISIBLE:
            return this.visible()
        case Pid.SELECTED:
            return this.selected()
        case Pid.OFFSET:
            return this.m_offset
        case Pid.MIN_DISTANCE:
            return this.m_minDistance
        case Pid.PLACEMENT:
            return this.placement()
        case Pid.AUTOPLACE:
            return this.autoplace()
        case Pid.Z:
            return this.z()
        case Pid.SYSTEM_FLAG:
            return this.systemFlag()
        case Pid.SIZE_SPATIUM_DEPENDENT:
            return this.sizeIsSpatiumDependent()
        case Pid.POSITION_LINKED_TO_MASTER:
            return this.m_isPositionLinkedToMaster
        case Pid.APPEARANCE_LINKED_TO_MASTER:
            return this.m_isAppearanceLinkedToMaster
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
            return this.m_excludeFromOtherParts
        case Pid.EXCLUDE_VERTICAL_ALIGN:
            return this.m_excludeVerticalAlign
        case Pid.HAS_PARENTHESES:
            return this.parenthesesMode()
        default:
            if (this.explicitParent()) {
                return this.explicitParent()!.getProperty(propertyId)
            }
            return undefined
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TRACK:
            this.setTrack(v as number)
            break
        case Pid.VOICE:
            this.setVoice(v as number)
            break
        case Pid.GENERATED:
            this.setGenerated(!!v)
            break
        case Pid.COLOR:
            this.setColor(v as Color)
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            break
        case Pid.SELECTED:
            this.setSelected(!!v)
            break
        case Pid.OFFSET:
            this.m_offset = (v as PointF).clone()
            break
        case Pid.MIN_DISTANCE:
            this.setMinDistance(v as Spatium)
            break
        case Pid.PLACEMENT:
            this.setPlacement(v as PlacementV)
            break
        case Pid.AUTOPLACE:
            this.setAutoplace(!!v)
            break
        case Pid.Z:
            this.setZ(v as number)
            break
        case Pid.SYSTEM_FLAG:
            this.setSystemFlag(!!v)
            break
        case Pid.SIZE_SPATIUM_DEPENDENT:
            this.setSizeIsSpatiumDependent(!!v)
            break
        case Pid.POSITION_LINKED_TO_MASTER:
            this.m_isPositionLinkedToMaster = !!v
            break
        case Pid.APPEARANCE_LINKED_TO_MASTER:
            this.m_isAppearanceLinkedToMaster = !!v
            break
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
            this.m_excludeFromOtherParts = !!v
            break
        case Pid.EXCLUDE_VERTICAL_ALIGN:
            this.setExcludeVerticalAlign(!!v)
            break
        case Pid.HAS_PARENTHESES:
            // TODO(port): parentheses are created by the reader
            break
        default:
            if (this.explicitParent()) {
                return this.explicitParent()!.setProperty(propertyId, v)
            }
            return false
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.GENERATED:
            return false
        case Pid.VISIBLE:
            return true
        case Pid.COLOR:
            return Color.BLACK
        case Pid.PLACEMENT: {
            const v = super.propertyDefault(pid)
            if (v !== undefined) { // if it's a styled property
                return v
            }
            return PlacementV.BELOW
        }
        case Pid.SELECTED:
            return false
        case Pid.OFFSET: {
            const v = super.propertyDefault(pid)
            if (v !== undefined) { // if it's a styled property
                return v
            }
            return new PointF()
        }
        case Pid.MIN_DISTANCE: {
            const v = super.propertyDefault(pid)
            if (v !== undefined) {
                return v
            }
            return new Spatium(0)
        }
        case Pid.AUTOPLACE:
            return true
        case Pid.Z:
            return this.type() * 100
        case Pid.POSITION_LINKED_TO_MASTER:
        case Pid.APPEARANCE_LINKED_TO_MASTER:
            return true
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
        case Pid.EXCLUDE_VERTICAL_ALIGN:
            return false
        case Pid.HAS_PARENTHESES:
            return ParenthesesMode.NONE
        default: {
            const v = super.propertyDefault(pid)
            if (v !== undefined) {
                return v
            }
            if (this.explicitParent()) {
                return this.explicitParent()!.propertyDefault(pid)
            }
            return undefined
        }
        }
    }

    styleP(idx: Sid): number { return this.style().styleMM(idx) }

    concertPitch(): boolean { return this.style().styleB(Sid.concertPitch) }

    // symbols

    drawSymbol(id: SymId, p: Painter, o: PointF = new PointF(), scale = 1.0): void {
        this.score().engravingFont().draw(id, p, this.magS() * scale, o)
    }

    drawSymbols(symbols: SymIdList, p: Painter, o: PointF = new PointF(), scale: number | SizeF = 1.0): void {
        if (scale instanceof SizeF) {
            this.score().engravingFont().drawList(symbols, p, scale.times(this.magS()), o)
        } else {
            this.score().engravingFont().drawList(symbols, p, this.magS() * scale, o)
        }
    }

    symHeight(id: SymId): number { return this.score().engravingFont().height(id, this.magS()) }
    symWidth(id: SymId): number { return this.score().engravingFont().width(id, this.magS()) }
    symWidthList(symbols: SymIdList): number { return this.score().engravingFont().widthList(symbols, this.magS()) }
    symAdvance(id: SymId): number { return this.score().engravingFont().advance(id, this.magS()) }
    symBbox(id: SymId): RectF { return this.score().engravingFont().bbox(id, this.magS()) }
    symBboxList(symbols: SymIdList): RectF { return this.score().engravingFont().bboxList(symbols, this.magS()) }

    symShapeWithCutouts(id: SymId): Shape {
        const shape = this.score().engravingFont().shapeWithCutouts(id, this.magS())
        for (const element of shape.elements()) {
            element.setItem(this)
        }
        return shape
    }

    symSmuflAnchor(symId: SymId, anchorId: SmuflAnchorId): PointF {
        return this.score().engravingFont().smuflAnchor(symId, anchorId, this.magS())
    }

    symIsValid(id: SymId): boolean { return this.score().engravingFont().isValid(id) }

    /** for debugging */
    override toString(): string { return `${this.typeName()}` }
}
