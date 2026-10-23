/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/engravingitem.h/.cpp
 *
 * Not ported: drag & drop editing, accessibility, linking to parts (excerpts).
 */

import { Color } from '../../framework/draw/types/color'
import { PointF, RectF, SizeF } from '../../framework/draw/types/geometry'
import type { Painter } from '../../framework/draw/painter'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import { P_TYPE, propertyValueEquals, type PropertyValue } from '../types/propertyvalue'
import { SmuflAnchorId, SymId, type SymIdList } from '../types/symid'
import {
    AutoOnOff, DirectionH, DirectionV, ElementType, ParenthesesMode, PlacementV, VoiceAssignment, nidx, staff2track, track2staff, track2voice, trackZeroVoice, VOICES,
    type staff_idx_t, type track_idx_t, type voice_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Shape } from '../infrastructure/shape'
import { EngravingObject, PropertyPropagation, linkHooks } from './engravingobject'
import { Pid, PropertyFlags, PropertyGroup, propertyGroup, propertyLink, propertyLinkSameScore, propertyType } from './property'
import type { Staff } from './staff'
import type { Part } from './part'
import type { StaffType } from './stafftype'
import type { Segment } from './segment'
import type { MeasureBase } from './measurebase'
import type { Measure } from './measure'
import type { System } from './system'
import type { Page } from './page'
import type { EditData } from '../editing/editdata'
import type { PaintOptions } from '../rendering/paintoptions'
import { EngravingConfiguration } from '../internal/engravingconfiguration'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { arg, mtrc } from '../../framework/global/translation'
import { RealIsNull } from '../../framework/global/realfn'
import { ticks_beat } from './sig'
// (imports of the editing section)
import { LineF } from '../../framework/draw/types/geometry'
import { lrint } from '../../framework/global/realfn'
import { ElementGroup, SingleElementGroup } from './elementgroup'
import { ElementEditData } from '../editing/elementeditdata'
import { Grip, KeyboardKey, KeyboardModifier } from '../editing/editdata'
import { MScore } from './mscore'
import { RWRegister } from '../rw/rwregister'
import type { XmlWriter } from '../rw/xmlwriter'

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

// Segment::CHORD_REST_OR_TIME_TICK_TYPE (SegmentType::ChordRest | SegmentType::TimeTick); segment.ts can't be imported here
const CHORD_REST_OR_TIME_TICK_TYPE = 0x2000 | 0x1000


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
        case ElementType.GUITAR_BEND_SEGMENT:
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

/** set by dom/parenthesis.ts and dom/factory.ts (avoids circular imports; createItem: C++ Factory::createItem) */
export const itemFactories: {
    createParenthesis?: (parent: EngravingItem) => EngravingItem
    createItem?: (type: ElementType, parent: EngravingObject | null) => EngravingItem | null
} = {}

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

    isBefore(item: EngravingItem | null): boolean {
        if (!item) {
            return false
        }
        if (!this.tick().eq(item.tick())) {
            return this.tick().lt(item.tick())
        }
        const thisMeasure = this.findMeasure()
        const otherMeasure = item.findMeasure()
        if (thisMeasure !== otherMeasure) {
            return thisMeasure!.isBefore(otherMeasure!)
        }
        const thisSeg = this.findAncestor(ElementType.SEGMENT)
        const otherSeg = item.findAncestor(ElementType.SEGMENT)
        if (!thisSeg || !otherSeg || !thisSeg.isSegment() || !otherSeg.isSegment()) {
            return false
        }
        return (thisSeg as Segment).goesBefore(otherSeg as Segment)
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

    isPlayable(): boolean {
        switch (this.type()) {
        case ElementType.NOTE:
        case ElementType.CHORD:
            return true
        case ElementType.HARMONY:
            return !!this.explicitParent() && this.explicitParent()!.isSegment()
        default:
            return false
        }
    }
    /** hooks called after the item was added to / removed from its parent */
    added(): void {}
    removed(): void {}
    subtype(): number { return -1 }

    subtypeUserName(): TranslatableString { return new TranslatableString() }
    translatedSubtypeUserName(): string { return this.subtypeUserName().translated() }

    isUserModified(): boolean {
        for (const spp of this.styledProperties()) {
            const pid = spp.pid
            const val = this.getProperty(pid)
            const defaultValue = this.propertyDefault(pid)

            if (propertyType(pid) === P_TYPE.MILLIMETRE) {
                if (Math.abs((val as number) - (defaultValue as number)) > 0.0001) { // we don’t care spatium diffs that small
                    return true
                }
            } else {
                if (!propertyValueEquals(val, defaultValue)) {
                    return true
                }
            }
        }
        for (const p of [Pid.VISIBLE, Pid.OFFSET, Pid.COLOR, Pid.Z, Pid.AUTOPLACE]) {
            if (!propertyValueEquals(this.getProperty(p), this.propertyDefault(p))) {
                return true
            }
        }
        return false
    }

    // accessibility (the status bar text; TODO(port): screenReaderInfo, accessibleExtraInfo)

    accessibleInfo(): string {
        return this.translatedTypeUserName()
    }

    /** bar and displayed bar 1-based, beat 1-based with the fraction of the beat (C++ float) */
    barbeat(): { bar: number; displayedBar: number; beat: number } {
        let parent: EngravingItem | null = this
        while (parent && !parent.isSegment() && !parent.isMeasure()) {
            parent = parent.parentItem()
        }

        if (!parent) {
            return { bar: 0, displayedBar: 0, beat: 0 }
        }

        let bar = 0
        let displayedBar = 0
        let beat = 0
        let ticks = 0

        const timeSigMap = this.score().sigmap()
        let ticksB = ticks_beat(timeSigMap.timesig(0).timesig().denominator())

        if (parent.isSegment()) {
            const segment = parent as unknown as Segment
            ;[bar, beat, ticks] = timeSigMap.tickValues(segment.tick().ticks())
            ticksB = ticks_beat(timeSigMap.timesig(segment.tick().ticks()).timesig().denominator())
            const measure = segment.findMeasure()
            if (measure) {
                displayedBar = measure.no()
            }
        } else if (parent.isMeasure()) {
            const measure = parent as unknown as Measure
            bar = measure.no()
            displayedBar = bar
            beat = -1
            ticks = 0
        }

        return { bar: bar + 1, displayedBar: displayedBar + 1, beat: Math.fround(beat + 1 + ticks / Math.fround(ticksB)) }
    }

    /** a fraction of ticks for use as a "Beat" reference in the Select All Similar filter */
    beat(): Fraction {
        const tsm = this.score().sigmap()
        let [, beat, ticks] = tsm.tickValues(this.tick().ticks())
        const ticksB = ticks_beat(tsm.timesig(this.tick().ticks()).timesig().denominator())

        const complexFraction = new Fraction((++beat * ticksB) + ticks, ticksB)
        return complexFraction.reduced()
    }

    formatBarsAndBeats(): string {
        let result = ''
        const barbeat = this.barbeat()

        if (barbeat.bar !== 0) {
            result = arg(mtrc('engraving', 'Measure: %1'), barbeat.bar)

            if (barbeat.displayedBar !== barbeat.bar) {
                result += '; ' + arg(mtrc('engraving', 'Displayed measure: %1'), barbeat.displayedBar)
            }

            if (!RealIsNull(barbeat.beat)) {
                result += '; ' + arg(mtrc('engraving', 'Beat: %1'), stringNumber(barbeat.beat))
            }
        }

        return result
    }

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

    dropTarget(): boolean { return this.flag(ElementFlag.DROP_TARGET) }
    setDropTarget(v: boolean): void { this.setFlag(ElementFlag.DROP_TARGET, v) }

    visible(): boolean { return !this.flag(ElementFlag.INVISIBLE) }
    setVisible(f: boolean): void { this.setFlag(ElementFlag.INVISIBLE, !f) }

    override sizeIsSpatiumDependent(): boolean { return !this.flag(ElementFlag.SIZE_SPATIUM_DEPENDENT) }
    setSizeIsSpatiumDependent(v: boolean): void { this.setFlag(ElementFlag.SIZE_SPATIUM_DEPENDENT, !v) }

    override offsetIsSpatiumDependent(): boolean {
        return this.sizeIsSpatiumDependent() || this.flag(ElementFlag.ON_STAFF)
    }

    /** the spatium of the score changed (Score::spatiumChanged) */
    spatiumChanged(oldValue: number, newValue: number): void {
        this.spatiumChangedItem(oldValue, newValue)
    }

    /** EngravingItem::spatiumChanged (non-virtual call of the base implementation) */
    protected spatiumChangedItem(oldValue: number, newValue: number): void {
        if (this.offsetIsSpatiumDependent()) {
            this.m_offset = this.m_offset.times(newValue / oldValue)
        }
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

    override reset(): void {
        this.undoResetProperty(Pid.AUTOPLACE)
        this.undoResetProperty(Pid.PLACEMENT)
        this.undoResetProperty(Pid.MIN_DISTANCE)
        this.undoResetProperty(Pid.OFFSET)
        this.undoResetProperty(Pid.LEADING_SPACE)
        this.setOffsetChanged(false)
        super.reset()
    }

    setOffsetChanged(v: boolean, absolute = true, diff: PointF = new PointF()): void {
        const ldata = this.mutldata()
        if (v) {
            ldata.autoplace.offsetChanged = absolute ? OffsetChange.ABSOLUTE_OFFSET : OffsetChange.RELATIVE_OFFSET
        } else {
            ldata.autoplace.offsetChanged = OffsetChange.NONE
        }
        ldata.autoplace.changedPos = this.pos().plus(diff)
    }
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
    setPositionLinkedToMaster(v: boolean): void { this.m_isPositionLinkedToMaster = v }
    setAppearanceLinkedToMaster(v: boolean): void { this.m_isAppearanceLinkedToMaster = v }
    excludeFromOtherParts(): boolean { return this.m_excludeFromOtherParts }
    setExcludeFromOtherParts(v: boolean): void { this.m_excludeFromOtherParts = v }

    // offset

    offset(): PointF { return this.m_offset.clone() }
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

    allowTimeAnchor(): boolean { return false }

    custom(id: Pid): boolean {
        return !propertyValueEquals(this.propertyDefault(id), this.getProperty(id))
    }

    /** C++ clone() (copy constructor) */
    clone(): EngravingItem {
        return this.cloneObject()
    }

    /** C++ linkedClone() */
    linkedClone(): EngravingItem {
        const e = this.clone()
        linkHooks.undoLink(e, this)
        return e
    }

    /** C++ copy constructor with `link`: a copy whose parts are linked to the original's (Chord, Note, Rest, ...) */
    copyLinked(link = true): this {
        return link ? this.makeLinkedCopy(() => this.clone() as this) : this.clone() as this
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        const link = this.isLinkedCopy(original)
        this.m_layoutData = null
        this.setFlag(ElementFlag.SELECTED, false)
        if (original.m_leftParenthesis) {
            this.m_leftParenthesis = original.m_leftParenthesis.clone()
            this.m_leftParenthesis.setParent(this)
            this.m_leftParenthesis.setTrack(this.track())
            if (link) {
                linkHooks.undoLink(this.m_leftParenthesis, original.m_leftParenthesis)
            }
        }
        if (original.m_rightParenthesis) {
            this.m_rightParenthesis = original.m_rightParenthesis.clone()
            this.m_rightParenthesis.setParent(this)
            this.m_rightParenthesis.setTrack(this.track())
            if (link) {
                linkHooks.undoLink(this.m_rightParenthesis, original.m_rightParenthesis)
            }
        }
    }

    hasVoiceAssignmentProperties(): boolean { return false }

    /** the element (an annotation with a voice assignment) applies to refTrack */
    elementAppliesToTrack(refTrack: track_idx_t): boolean {
        if (!this.hasVoiceAssignmentProperties()) {
            return refTrack === this.track()
        }
        const voiceAssignment = this.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment

        return EngravingItem.elementAppliesToTrackStatic(this.track(), refTrack, voiceAssignment, this.part())
    }

    /** C++ static elementAppliesToTrack(elementTrack, refTrack, voiceAssignment, part) (renamed: no overloads in TS) */
    static elementAppliesToTrackStatic(elementTrack: track_idx_t, refTrack: track_idx_t, voiceAssignment: VoiceAssignment,
        part: Part | null): boolean {
        if (voiceAssignment === VoiceAssignment.CURRENT_VOICE_ONLY && elementTrack === refTrack) {
            return true
        }

        if (voiceAssignment === VoiceAssignment.ALL_VOICE_IN_STAFF && track2staff(elementTrack) === track2staff(refTrack)) {
            return true
        }

        if (!part) {
            return false
        }

        if (voiceAssignment === VoiceAssignment.ALL_VOICE_IN_INSTRUMENT && (part.startTrack() <= refTrack
            && part.endTrack() - 1 >= refTrack)) {
            return true
        }
        return false
    }

    appliesToAllVoicesInInstrument(): boolean {
        return this.hasVoiceAssignmentProperties()
               && (this.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment) === VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
    }

    /** C++ configuration()->dynamicsApplyToAllVoices() is true (the default) */
    setInitialTrackAndVoiceAssignment(track: track_idx_t, curVoiceOnlyOverride: boolean): void {
        if (track === nidx) {
            return
        }

        if (!curVoiceOnlyOverride) {
            this.setTrack(trackZeroVoice(track))
            this.setProperty(Pid.VOICE_ASSIGNMENT, VoiceAssignment.ALL_VOICE_IN_INSTRUMENT)
        } else {
            this.setTrack(track)
            this.setProperty(Pid.VOICE_ASSIGNMENT, VoiceAssignment.CURRENT_VOICE_ONLY)
        }
    }

    setPlacementBasedOnVoiceAssignment(styledDirection: DirectionV): void {
        const oldPlacement = this.placement()
        const offsetIsStyled = this.isStyled(Pid.OFFSET)

        let newPlacement = PlacementV.BELOW

        const internalDirectionProperty = this.getProperty(Pid.DIRECTION) as DirectionV
        const part = this.part()!
        if (internalDirectionProperty !== DirectionV.AUTO) {
            newPlacement = internalDirectionProperty === DirectionV.UP ? PlacementV.ABOVE : PlacementV.BELOW
        } else if (styledDirection !== DirectionV.AUTO) {
            newPlacement = styledDirection === DirectionV.UP ? PlacementV.ABOVE : PlacementV.BELOW
        } else if (part.nstaves() > 1 && (this.getProperty(Pid.CENTER_BETWEEN_STAVES) as AutoOnOff) === AutoOnOff.ON) {
            const staves = part.staves()
            const isOnLastStaffOfInstrument = this.staffIdx() === staves[staves.length - 1].idx()
            newPlacement = isOnLastStaffOfInstrument ? PlacementV.ABOVE : PlacementV.BELOW
        } else {
            const voiceAssignment = this.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
            if (voiceAssignment === VoiceAssignment.ALL_VOICE_IN_INSTRUMENT || voiceAssignment === VoiceAssignment.ALL_VOICE_IN_STAFF) {
                if (this.style().styleB(Sid.dynamicsHairpinsAboveForVocalStaves) && part.instrument().isVocalInstrument()) {
                    newPlacement = PlacementV.ABOVE
                } else {
                    newPlacement = PlacementV.BELOW
                }
            } else if (this.voice() === 0) {
                // Put above the staff only in case of multiple voices at this tick (similar to stem directions)
                let measure = this.score().tick2measure(this.tick())
                let startTick = new Fraction(-1, 1)
                let length = new Fraction(-1, 1)
                const segmentItem = this.findAncestor(ElementType.SEGMENT)
                if (this.isSpanner()) {
                    startTick = this.tick()
                    length = (this as unknown as { ticks(): Fraction }).ticks()
                } else if (segmentItem) {
                    let segment: Segment | null = segmentItem as unknown as Segment
                    if (segment.isTimeTickType() && segment.measure() !== measure) {
                        // Edge case: this is a TimeTick segment at the end of previous measure. Happens only
                        // when dynamic is anchorToEndOfPrevious. In this case look for preceding segment.
                        segment = segment.prev1(CHORD_REST_OR_TIME_TICK_TYPE)!
                        measure = segment.measure()
                    }
                    startTick = segment.tick()
                    length = segment.ticks()
                } else if (measure) {
                    startTick = measure.tick()
                    length = measure.ticks()
                }
                if (measure && measure.hasVoicesInRange(this.staffIdx(), startTick, length)) {
                    newPlacement = PlacementV.ABOVE
                } else {
                    newPlacement = PlacementV.BELOW
                }
            } else {
                newPlacement = this.voice() % 2 ? PlacementV.BELOW : PlacementV.ABOVE
            }
        }

        if (newPlacement !== oldPlacement) {
            this.setPlacement(newPlacement)
            if (offsetIsStyled) {
                this.resetProperty(Pid.OFFSET)
            }
        }
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

    curColor(opt: PaintOptions = {}): Color {
        return this.curColorWith(this.getProperty(Pid.VISIBLE) as boolean, this.color(), opt)
    }

    /** C++ curColor(bool isVisible, Color normalColor, const PaintOptions&) */
    curColorWith(isVisible: boolean, normalColor: Color, opt: PaintOptions = {}): Color {
        // the default element color is always interpreted as black in printing
        if (opt.isPrinting) {
            return normalColor.equals(EngravingConfiguration.defaultColor()) ? Color.BLACK : normalColor
        }

        if (this.flag(ElementFlag.DROP_TARGET)) {
            return EngravingConfiguration.highlightSelectionColor(this.track() === nidx ? 0 : this.voice())
        }

        // TODO(port): Note::mark()
        if (this.selected()) {
            let voiceForColorChoice = this.track() === nidx ? 0 : this.voice()
            if (this.hasVoiceAssignmentProperties()) {
                const voiceAssignment = this.getProperty(Pid.VOICE_ASSIGNMENT) as VoiceAssignment
                if (voiceAssignment !== VoiceAssignment.CURRENT_VOICE_ONLY) {
                    voiceForColorChoice = VOICES
                }
            }
            return EngravingConfiguration.selectionColor(voiceForColorChoice, isVisible, this.isUnlinkedFromMaster())
        }

        if (!isVisible) {
            return EngravingConfiguration.invisibleColor()
        }
        if (opt.invertColors) {
            if (normalColor.equals(EngravingConfiguration.defaultColor())) {
                return EngravingConfiguration.scoreInversionColor()
            }
            return normalColor.inverted()
        }
        return normalColor
    }

    isInteractionAvailable(): boolean {
        if (!(this.getProperty(Pid.VISIBLE) as boolean) && (this.score().printing() || !this.score().isShowInvisible())) {
            return false
        }
        return true
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

    findLinkedInScore(score: import('./score').Score | null): EngravingItem | null {
        const links = this.links()
        if (!score || !this.staff() || !links || links.length === 0) {
            return null
        }

        // If this is a system element it may not be on the same stave, so just check if linked elements are in the score
        if (this.systemFlag() && this.track() === 0) {
            for (const linked of links) {
                if (linked !== this && linked.score() === score) {
                    return linked as EngravingItem
                }
            }
            return null
        }

        const linkedStaffInScore = this.staff()!.findLinkedInScore(score)

        if (!linkedStaffInScore) {
            return null
        }

        return this.findLinkedInStaff(linkedStaffInScore)
    }

    findLinkedInStaff(staff: Staff): EngravingItem | null {
        const links = this.links()
        if (!links || links.length === 0) {
            return null
        }
        for (const linked of links) {
            if ((linked as EngravingItem).staff() === staff) {
                return linked as EngravingItem
            }
        }
        return null
    }
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

    hitBBox(): RectF { return this.ldata().bbox() }
    hitShape(): Shape { return this.shape() }
    canvasHitShape(): Shape { return this.hitShape().translated(this.canvasPos()) }

    hitShapeContains(p: PointF): boolean {
        return this.hitShape().contains(p.minus(this.pagePos()))
    }

    hitShapeIntersects(rr: RectF): boolean {
        return this.hitShape().intersects(rr.translated(this.pagePos().neg()))
    }

    // children

    add(e: EngravingItem): void {
        if (e.isParenthesis()) {
            const p = e as EngravingItem & { direction(): number }
            e.setVisible(this.visible())
            if (p.direction() === DirectionH.LEFT) {
                this.m_leftParenthesis = e
            } else if (p.direction() === DirectionH.RIGHT) {
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

    change(o: EngravingItem, n: EngravingItem): void {
        this.remove(o)
        this.add(n)
    }

    /** true if data.dropElement can be dropped on this element (palettes, drag & drop) */
    acceptDrop(_data: EditData): boolean { return false }

    /** handles a dropped element (data.dropElement); returns the element to select, if any */
    drop(_data: EditData): EngravingItem | null { return null }

    // ---------------------------------------------------------
    //   undo / layout triggers
    // ---------------------------------------------------------

    override undoChangeProperty(pid: Pid, val: PropertyValue, ps: PropertyFlags = this.propertyFlags(pid)): void {
        if (pid === Pid.AUTOPLACE && (val === true && !this.autoplace())) {
            // Switching autoplacement on. Save user-defined
            // placement properties to undo stack.
            this.undoPushProperty(Pid.PLACEMENT)
            this.undoPushProperty(Pid.OFFSET)
        }
        super.undoChangeProperty(pid, val, ps)
    }

    undoSetVisible(v: boolean): void {
        this.undoChangeProperty(Pid.VISIBLE, v)
    }

    undoAddElement(element: EngravingItem, addToLinkedStaves = true): void {
        this.score().undoAddElement(element, addToLinkedStaves)
    }

    isPropertyLinkedToMaster(id: Pid): boolean {
        if (propertyGroup(id) === PropertyGroup.POSITION) {
            return this.isPositionLinkedToMaster()
        }

        if (propertyGroup(id) === PropertyGroup.APPEARANCE) {
            return this.isAppearanceLinkedToMaster()
        }

        return true
    }

    isUnlinkedFromMaster(): boolean {
        return !(this.getProperty(Pid.POSITION_LINKED_TO_MASTER) as boolean
            && this.getProperty(Pid.APPEARANCE_LINKED_TO_MASTER) as boolean)
    }

    unlinkPropertyFromMaster(id: Pid): void {
        if (propertyGroup(id) === PropertyGroup.POSITION) {
            linkHooks.undoChangePropertyCommand(this, Pid.POSITION_LINKED_TO_MASTER, false)
        } else if (propertyGroup(id) === PropertyGroup.APPEARANCE) {
            linkHooks.undoChangePropertyCommand(this, Pid.APPEARANCE_LINKED_TO_MASTER, false)
        }
    }

    private masterElementForRelink(): EngravingObject | null {
        for (const element of this.linkListForPropertyPropagation()) {
            if (element.score().isMaster()) {
                return element
            }
        }
        return null
    }

    relinkPropertiesToMaster(propGroup: PropertyGroup): void {
        const masterElement = this.masterElementForRelink()
        if (!masterElement) {
            return
        }

        for (let i = 0; i < Pid.END; ++i) {
            const propertyId = i as Pid
            if (propertyGroup(propertyId) !== propGroup) {
                continue
            }
            const masterValue = masterElement.getProperty(propertyId)
            const masterFlags = masterElement.propertyFlags(propertyId)
            if (!propertyValueEquals(this.getProperty(propertyId), masterValue)) {
                this.setProperty(propertyId, masterValue)
            }
            if (this.propertyFlags(propertyId) !== masterFlags) {
                this.setPropertyFlags(propertyId, masterFlags)
            }
        }
    }

    relinkPropertyToMaster(propertyId: Pid): void {
        const masterElement = this.masterElementForRelink()
        if (!masterElement) {
            return
        }

        this.setProperty(propertyId, masterElement.getProperty(propertyId))
        this.setPropertyFlags(propertyId, masterElement.propertyFlags(propertyId))
    }

    propertyPropagation(destinationItem: EngravingItem, propertyId: Pid): PropertyPropagation {
        if (propertyLink(propertyId)) {
            return PropertyPropagation.PROPAGATE // These properties are always linked, no matter what
        }

        if (propertyGroup(propertyId) === PropertyGroup.NONE) {
            return PropertyPropagation.NONE
        }

        const sourceScore = this.score()
        const destinationScore = destinationItem.score()
        const sourceStaff = this.staff()
        const destinationStaff = destinationItem.staff()

        if (sourceScore === destinationScore) {
            const diffStaff = sourceStaff !== destinationStaff
            const visiblePositionOrColor = propertyId === Pid.VISIBLE || propertyId === Pid.COLOR
                || propertyGroup(propertyId) === PropertyGroup.POSITION
            const hasParens = propertyId === Pid.HAS_PARENTHESES && this.isNote()
                && (this as unknown as { ghost(): boolean }).ghost()
                && !(this as unknown as { hideGeneratedParens(): boolean }).hideGeneratedParens()
            const linkSameScore = propertyLinkSameScore(propertyId)
            if ((diffStaff && (visiblePositionOrColor || hasParens)) || !linkSameScore) {
                // Allow visibility and position to stay independent
                return PropertyPropagation.NONE
            }
            // Maintain every other property synced
            return PropertyPropagation.PROPAGATE
        }

        const isTextProperty = propertyGroup(propertyId) === PropertyGroup.TEXT
        if (isTextProperty) {
            if (sourceScore.isMaster() && destinationItem.isPropertyLinkedToMaster(propertyId)) {
                // From master score - check if destination part follows master
                return PropertyPropagation.PROPAGATE
            }

            if (!sourceScore.isMaster() && this.isPropertyLinkedToMaster(propertyId)) {
                // From part - check if source part follows master
                return PropertyPropagation.PROPAGATE
            }
        }

        if (!sourceScore.isMaster()) {
            // Properties are only propagated when being edited from master. If this is being edited
            // from a part score, we mark it as unlinked so it becomes independent in the part.
            return PropertyPropagation.UNLINK
        }

        if (this.systemFlag() && !this.isTopSystemObject()) {
            // Let only the top system object propagate
            return PropertyPropagation.NONE
        }

        if (destinationItem.isPropertyLinkedToMaster(propertyId)) {
            return PropertyPropagation.PROPAGATE
        }

        return PropertyPropagation.NONE
    }

    triggerLayout(): void {
        if (this.explicitParent()) {
            this.score().setLayout(this.tick(), this.staffIdx(), this)
        }
    }

    /**
     * CAUTION: This causes a layout of the entire score: extremely expensive and
     * likely unnecessary! Consider overriding triggerLayout() instead.
     */
    triggerLayoutAll(): void {
        if (this.explicitParent()) {
            this.score().setLayoutAll(this.staffIdx(), this)
        }
    }

    triggerLayoutToEnd(): void {
        if (this.explicitParent()) {
            this.score().setLayoutRange(this.tick(), this.score().endTick(), this.staffIdx(), this.staffIdx(), this)
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

    /**
     * C++ EngravingItem::setParenthesesMode(): the parentheses are added/removed directly (C++ with undoAddElement while
     * the HAS_PARENTHESES change is applied); linked elements get the property through the property propagation
     */
    setParenthesesMode(v: ParenthesesMode, _addToLinked = true, generated = false): void {
        this.setHasParenthesis(true, !!(v & ParenthesesMode.LEFT), generated)
        this.setHasParenthesis(false, !!(v & ParenthesesMode.RIGHT), generated)
    }

    /** C++ setHasLeftParenthesis() / setHasRightParenthesis() */
    private setHasParenthesis(left: boolean, v: boolean, generated: boolean): void {
        const paren = left ? this.m_leftParenthesis : this.m_rightParenthesis
        const hasGeneratedParen = !!paren && paren.generated()
        const hasUserParen = !!paren && !paren.generated()

        if (generated && v === hasGeneratedParen) {
            return
        }

        if (!generated && v === hasUserParen) {
            return
        }

        if (v) {
            if (!paren) {
                const p = itemFactories.createParenthesis!(this)
                p.setParent(this)
                p.setTrack(this.track())
                p.setProperty(Pid.HORIZONTAL_DIRECTION, left ? DirectionH.LEFT : DirectionH.RIGHT)
                p.setGenerated(generated)
                this.add(p)
            }
        } else if (paren) {
            this.remove(paren)
        }
    }

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
            if (this.m_isPositionLinkedToMaster === !!v) {
                break
            }
            if (!this.m_isPositionLinkedToMaster) {
                this.relinkPropertiesToMaster(PropertyGroup.POSITION)
            }
            this.m_isPositionLinkedToMaster = !!v
            break
        case Pid.APPEARANCE_LINKED_TO_MASTER:
            if (this.m_isAppearanceLinkedToMaster === !!v) {
                break
            }
            if (!this.m_isAppearanceLinkedToMaster) {
                this.relinkPropertiesToMaster(PropertyGroup.APPEARANCE)
            }
            this.m_isAppearanceLinkedToMaster = !!v
            break
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
            this.m_excludeFromOtherParts = !!v
            break
        case Pid.EXCLUDE_VERTICAL_ALIGN:
            this.setExcludeVerticalAlign(!!v)
            break
        case Pid.HAS_PARENTHESES:
            this.setParenthesesMode(v as ParenthesesMode)
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

    // =================================================================================================================
    //   editing: drag, edit mode, grips, mime data (engravingitem.cpp)
    // =================================================================================================================

    getDragGroup(_isDragged: (e: EngravingItem) => boolean): ElementGroup {
        return new SingleElementGroup(this)
    }

    startDrag(ed: EditData): void {
        if (!this.isMovable()) {
            return
        }
        const eed = new ElementEditData()
        eed.e = this
        eed.pushProperty(Pid.OFFSET)
        eed.pushProperty(Pid.AUTOPLACE)
        ed.addData(eed)
        if (ed.modifiers & KeyboardModifier.AltModifier) {
            this.setAutoplace(false)
        }
    }

    /** Return update Rect relative to canvas. */
    drag(ed: EditData): RectF {
        if (!this.isMovable()) {
            return new RectF()
        }

        const r0 = this.canvasBoundingRect()

        const offset0 = ed.evtDelta.plus(this.offset())
        let x = offset0.x()
        let y = offset0.y()

        const _spatium = this.spatium()
        if (ed.hRaster) {
            const hRaster = _spatium / MScore.hRaster()
            const n = lrint(x / hRaster)
            x = hRaster * n
        }
        if (ed.vRaster) {
            const vRaster = _spatium / MScore.vRaster()
            const n = lrint(y / vRaster)
            y = vRaster * n
        }

        this.setOffset(new PointF(x, y))
        this.setOffsetChanged(true)

        if (this.isTextBase()) { // TODO: check for other types
            //
            // restrict move to page boundaries
            //
            const r = this.canvasBoundingRect()
            let p: EngravingItem | null = null
            let e: EngravingItem | null = this
            while (e) {
                if (e.isPage()) {
                    p = e
                    break
                }
                e = e.parentItem()
            }
            if (p) {
                let move = false
                const pr = p.canvasBoundingRect()
                if (r.right() > pr.right()) {
                    x -= r.right() - pr.right()
                    move = true
                } else if (r.left() < pr.left()) {
                    x += pr.left() - r.left()
                    move = true
                }
                if (r.bottom() > pr.bottom()) {
                    y -= r.bottom() - pr.bottom()
                    move = true
                } else if (r.top() < pr.top()) {
                    y += pr.top() - r.top()
                    move = true
                }
                if (move) {
                    this.setOffset(new PointF(x, y))
                }
            }
        }
        return this.canvasBoundingRect().united(r0)
    }

    endDrag(ed: EditData): void {
        if (!this.isMovable()) {
            return
        }
        const eed = ed.getData(this)
        if (!eed) {
            return
        }
        for (const { id, data: v, f } of eed.propertyData) {
            this.setPropertyFlags(id, f) // reset initial property flags state
            this.score().undoPropertyChangedItem(this, id, v, f === PropertyFlags.STYLED ? PropertyFlags.UNSTYLED : f)
            this.setGenerated(false)
        }
        this.score().hideAnchors()
    }

    /** anchor lines displayed while dragging element in canvas coordinates */
    dragAnchorLines(): LineF[] { return [] }

    /**
     * A generic dragAnchorLines() implementation which can be used in dragAnchorLines() overrides in descendants.
     */
    genericDragAnchorLines(): LineF[] {
        let xp = 0.0
        for (let e = this.parentItem(); e; e = e.parentItem()) {
            xp += e.x()
        }
        let yp: number
        const p = this.explicitParent()!
        if (p.isSegment() || p.isMeasure()) {
            const meas = p.isSegment() ? (p as unknown as Segment).measure() : p as unknown as Measure
            const system = meas.system()
            const stIdx = this.effectiveStaffIdx()
            if (stIdx === nidx) {
                return [new LineF()]
            }
            yp = system ? system.staffCanvasYpage(stIdx) : 0.0
            if (this.placement() === PlacementV.BELOW) {
                yp += system ? system.staff(stIdx)!.bbox().height() : 0.0
            }
            //adjust anchor Y positions to staffType offset
            if (this.staff()) {
                yp += this.staff()!.staffTypeForElement(this).yoffset().val() * this.spatium()
            }
        } else {
            yp = this.parentItem()!.canvasPos().y()
        }
        const p1 = new PointF(xp, yp)
        return [new LineF(p1, this.canvasPos())]
    }

    isEditable(): boolean { return !this.flag(ElementFlag.GENERATED) }
    needStartEditingAfterSelecting(): boolean { return false }

    startEdit(ed: EditData): void {
        const elementData = new ElementEditData()
        elementData.e = this
        ed.addData(elementData)
    }

    isEditAllowed(ed: EditData): boolean {
        return ed.key === KeyboardKey.Key_Home
    }

    /** return true if event is accepted */
    edit(ed: EditData): boolean {
        if (ed.key === KeyboardKey.Key_Home) {
            this.setOffset(new PointF())
            return true
        }
        return false
    }

    startDragGrip(ed: EditData): void {
        let eed = ed.getData(this)
        if (!eed) {
            eed = new ElementEditData()
            eed.e = this
            ed.addData(eed)
        }
        eed.pushProperty(Pid.OFFSET)
        eed.pushProperty(Pid.AUTOPLACE)
        if (ed.modifiers & KeyboardModifier.AltModifier) {
            this.setAutoplace(false)
        }
    }

    dragGrip(ed: EditData): void {
        if (ed.curGrip === Grip.NO_GRIP) {
            return
        }
        this.setOffset(this.offset().plus(ed.delta))
        this.setOffsetChanged(true)
    }

    endDragGrip(ed: EditData): void {
        const eed = ed.getData(this)
        let changed = false
        if (eed) {
            for (const { id, data, f: flags } of eed.propertyData) {
                this.setPropertyFlags(id, flags) // reset initial property flags state
                let f = flags
                if (f === PropertyFlags.STYLED) {
                    f = PropertyFlags.UNSTYLED
                }
                if (this.score().undoPropertyChangedItem(this, id, data, f)) {
                    changed = true
                }
            }
            eed.propertyData = []
        }
        if (changed) {
            this.undoChangeProperty(Pid.GENERATED, false)
        }
        this.score().hideAnchors()
    }

    endEdit(_ed: EditData): void {
        this.score().hideAnchors()
    }

    editCut(_ed: EditData): void {}
    editCopy(_ed: EditData): void {}

    updateGrips(ed: EditData): void {
        const positions = this.gripsPositions(ed)
        for (let i = 0; i < positions.length; ++i) {
            ed.grip[i].translate(positions[i])
        }
    }

    nextGrip(ed: EditData): boolean {
        const i = ed.curGrip + 1
        if (i >= ed.grips) {
            ed.curGrip = 0 as Grip
            return false
        }
        ed.curGrip = i as Grip
        return true
    }

    prevGrip(ed: EditData): boolean {
        const i = ed.curGrip - 1
        if (i < 0) {
            ed.curGrip = (ed.grips - 1) as Grip
            return false
        }
        ed.curGrip = i as Grip
        return true
    }

    /** anchor lines displayed while dragging element's grip in canvas coordinates */
    gripAnchorLines(_grip: Grip): LineF[] { return [] }

    gripsCount(): number { return 0 }
    initialEditModeGrip(): Grip { return Grip.NO_GRIP }
    defaultGrip(): Grip { return Grip.NO_GRIP }
    /** grips positions in page coordinates */
    gripsPositions(_ed?: EditData): PointF[] { return [] }

    hasGrips(): boolean { return this.gripsCount() > 0 }

    /** the element as clipboard / drag and drop data (C++ muse::ByteArray, here the xml text) */
    mimeData(dragOffset: PointF = new PointF()): string {
        const xml: XmlWriter = RWRegister.writer().createXmlWriter()

        xml.startElement('EngravingItem')
        if (this.isNote()) {
            xml.tagFraction('duration', (this as unknown as { chord(): { ticks(): Fraction } }).chord().ticks())
        }
        if (!dragOffset.isNull()) {
            xml.tagPoint('dragOffset', dragOffset)
        }

        RWRegister.writer().writeItem(this, xml)

        xml.endElement()
        xml.flush()
        return xml.text()
    }

    /** for debugging */
    override toString(): string { return `${this.typeName()}` }

    /** the element is excluded from (removed from) or included in (added to) the other scores (parts) */
    manageExclusionFromParts(exclude: boolean): void {
        if (exclude) {
            const links = [...this.linkList()]
            for (const linkedObject of links) {
                if (linkedObject.score() === this.score()) {
                    continue
                }
                const linkedItem = linkedObject as EngravingItem
                if (linkedItem.selected()) {
                    linkedItem.score().deselect(linkedItem)
                }
                linkedItem.score().undoRemoveElement(linkedItem, false)
                linkedItem.undoUnlink()
            }
        } else {
            this.score().undoAddElement(this, /*addToLinkedStaves*/ true, /*ctrlModifier*/ false, this)
        }
    }
}

/** muse::String::number(double, prec = 6): fixed precision without trailing zeros */
export function stringNumber(n: number, prec = 6): string {
    let s = n.toFixed(prec)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s === '-0' ? '0' : s
}
