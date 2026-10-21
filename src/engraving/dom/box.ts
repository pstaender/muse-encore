/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/box.h/.cpp (Box, HBox, VBox, TBox; FBox and editing are not ported)
 */

import { RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { AlignH, ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { FretDiagram } from './fret'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { MeasureBase } from './measurebase'
import { Pid } from './property'
import { Text } from './text'

const boxStyle: ElementStyle = [
    { sid: Sid.systemFrameDistance, pid: Pid.TOP_GAP },
    { sid: Sid.frameSystemDistance, pid: Pid.BOTTOM_GAP },
    { sid: Sid.paddingToNotationAbove, pid: Pid.PADDING_TO_NOTATION_ABOVE },
    { sid: Sid.paddingToNotationBelow, pid: Pid.PADDING_TO_NOTATION_BELOW },
]

const hBoxStyle: ElementStyle = []

export abstract class Box extends MeasureBase {
    private m_boxWidth = new Spatium(0) // only valid for HBox
    private m_boxHeight = new Spatium(0) // only valid for VBox
    private m_topGap = new Spatium(0) // distance from previous system (left border for hbox)
    private m_bottomGap = new Spatium(0) // distance to next system (right border for hbox)
    private m_leftMargin = 0.0
    private m_rightMargin = 0.0 // inner margins in metric mm
    private m_topMargin = 0.0
    private m_bottomMargin = 0.0
    private m_isAutoSizeEnabled = true

    constructor(type: ElementType, parent: EngravingObject | null) {
        super(type, parent)
    }

    override add(e: EngravingItem): void {
        if (e.isText()) {
            (e as Text).setLayoutToParentWidth(true)
        }
        super.add(e)
    }

    override absoluteFromSpatium(val: Spatium): number {
        const sp = this.sizeIsSpatiumDependent() ? this.spatium() : this.style().defaultSpatium()
        return val.val() * sp
    }

    contentRect(): RectF {
        let result = new RectF()
        for (const element of this.el()) {
            result = result.united(element.ldata().bbox())
        }
        return result
    }

    boxWidth(): Spatium { return this.m_boxWidth }
    setBoxWidth(val: Spatium): void { this.m_boxWidth = val }
    boxHeight(): Spatium { return this.m_boxHeight }
    setBoxHeight(val: Spatium): void { this.m_boxHeight = val }
    leftMargin(): number { return this.m_leftMargin }
    rightMargin(): number { return this.m_rightMargin }
    topMargin(): number { return this.m_topMargin }
    bottomMargin(): number { return this.m_bottomMargin }
    setLeftMargin(val: number): void { this.m_leftMargin = val }
    setRightMargin(val: number): void { this.m_rightMargin = val }
    setTopMargin(val: number): void { this.m_topMargin = val }
    setBottomMargin(val: number): void { this.m_bottomMargin = val }
    topGap(): Spatium { return this.m_topGap }
    setTopGap(val: Spatium): void { this.m_topGap = val }
    bottomGap(): Spatium { return this.m_bottomGap }
    setBottomGap(val: Spatium): void { this.m_bottomGap = val }
    isAutoSizeEnabled(): boolean { return this.m_isAutoSizeEnabled }
    setAutoSizeEnabled(val: boolean): void { this.m_isAutoSizeEnabled = val }

    isTitleFrame(): boolean {
        return this.score().first() === (this as unknown as MeasureBase) && this.isVBox()
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BOX_HEIGHT: return this.m_boxHeight
        case Pid.BOX_WIDTH: return this.m_boxWidth
        case Pid.TOP_GAP: return this.m_topGap
        case Pid.BOTTOM_GAP: return this.m_bottomGap
        case Pid.LEFT_MARGIN: return this.m_leftMargin
        case Pid.RIGHT_MARGIN: return this.m_rightMargin
        case Pid.TOP_MARGIN: return this.m_topMargin
        case Pid.BOTTOM_MARGIN: return this.m_bottomMargin
        case Pid.BOX_AUTOSIZE: return (this.score().mscVersion() >= 302) ? this.m_isAutoSizeEnabled : false
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.BOX_HEIGHT:
            this.m_boxHeight = v as Spatium
            break
        case Pid.BOX_WIDTH:
            this.m_boxWidth = v as Spatium
            break
        case Pid.TOP_GAP:
            this.m_topGap = v as Spatium
            break
        case Pid.BOTTOM_GAP:
            this.m_bottomGap = v as Spatium
            break
        case Pid.LEFT_MARGIN:
            this.m_leftMargin = v as number
            break
        case Pid.RIGHT_MARGIN:
            this.m_rightMargin = v as number
            break
        case Pid.TOP_MARGIN:
            this.m_topMargin = v as number
            break
        case Pid.BOTTOM_MARGIN:
            this.m_bottomMargin = v as number
            break
        case Pid.BOX_AUTOSIZE:
            this.m_isAutoSizeEnabled = !!v
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.BOX_HEIGHT:
        case Pid.BOX_WIDTH:
            return new Spatium(0)
        case Pid.TOP_GAP:
            return this.isHBox() ? new Spatium(0) : this.style().styleS(Sid.systemFrameDistance)
        case Pid.BOTTOM_GAP:
            return this.isHBox() ? new Spatium(0) : this.style().styleS(Sid.frameSystemDistance)
        case Pid.LEFT_MARGIN:
        case Pid.RIGHT_MARGIN:
        case Pid.TOP_MARGIN:
        case Pid.BOTTOM_MARGIN:
            return 0.0
        case Pid.BOX_AUTOSIZE:
            return true
        case Pid.SIZE_SPATIUM_DEPENDENT:
            return !this.isTitleFrame()
        default:
            return super.propertyDefault(id)
        }
    }
}

export class HBox extends Box {
    private m_createSystemHeader = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.HBOX, parent)
        this.initElementStyle(hBoxStyle)
        this.resetProperty(Pid.BOX_WIDTH)
    }

    override computeMinWidth(): void {
        // top/bottom is really left/right
        this.setWidth(this.absoluteFromSpatium(this.boxWidth().plus(this.topGap()).plus(this.bottomGap())))
    }

    createSystemHeader(): boolean { return this.m_createSystemHeader }
    setCreateSystemHeader(val: boolean): void { this.m_createSystemHeader = val }

    override isMovable(): boolean {
        const p = this.explicitParent()
        return !!p && (p.isHBox() || p.isVBox())
    }

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.CREATE_SYSTEM_HEADER) {
            return this.createSystemHeader()
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.CREATE_SYSTEM_HEADER) {
            this.setCreateSystemHeader(!!v)
            return true
        }
        return super.setProperty(propertyId, v)
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.CREATE_SYSTEM_HEADER: return true
        case Pid.BOX_WIDTH: return new Spatium(5.0)
        default: return super.propertyDefault(id)
        }
    }
}

export class VBox extends Box {
    private m_paddingToNotationAbove = new Spatium(0)
    private m_paddingToNotationBelow = new Spatium(0)

    constructor(parent: EngravingObject | null, type: ElementType = ElementType.VBOX) {
        super(type, parent)
        this.initElementStyle(boxStyle)
        this.resetProperty(Pid.BOX_HEIGHT)
        this.setLineBreak(true)
    }

    minHeight(): number { return this.absoluteFromSpatium(new Spatium(10)) }
    maxHeight(): number { return this.absoluteFromSpatium(new Spatium(30)) }

    paddingToNotationAbove(): Spatium { return this.m_paddingToNotationAbove }
    paddingToNotationBelow(): Spatium { return this.m_paddingToNotationBelow }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BOX_AUTOSIZE: return this.isAutoSizeEnabled()
        case Pid.PADDING_TO_NOTATION_ABOVE: return this.m_paddingToNotationAbove
        case Pid.PADDING_TO_NOTATION_BELOW: return this.m_paddingToNotationBelow
        default: return super.getProperty(propertyId)
        }
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.BOX_HEIGHT) {
            return new Spatium(10.0)
        }
        return super.propertyDefault(id)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PADDING_TO_NOTATION_ABOVE:
            this.m_paddingToNotationAbove = v as Spatium
            break
        case Pid.PADDING_TO_NOTATION_BELOW:
            this.m_paddingToNotationBelow = v as Spatium
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }
}

export class TBox extends VBox {
    private m_text: Text

    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.TBOX)
        this.resetProperty(Pid.BOX_HEIGHT)
        this.m_text = new Text(this, TextStyleType.FRAME)
        this.m_text.setLayoutToParentWidth(true)
        this.m_text.setParent(this)
    }

    text(): Text { return this.m_text }

    override scanElements(func: (item: EngravingItem) => void): void {
        this.m_text.scanElements(func)
        super.scanElements(func)
    }

    override add(e: EngravingItem): void {
        if (e.isText()) {
            this.m_text = e as Text
            this.m_text.setLayoutToParentWidth(true)
            e.setParent(this)
        } else {
            super.add(e)
        }
    }

    override remove(el: EngravingItem): void {
        if (el === this.m_text) {
            // does not seem to be called
            this.m_text = new Text(this, TextStyleType.FRAME)
            this.m_text.setLayoutToParentWidth(true)
            this.m_text.setParent(this)
        } else {
            super.remove(el)
        }
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.BOX_HEIGHT) {
            return new Spatium(1)
        }
        return super.propertyDefault(id)
    }
}

// ---------------------------------------------------------
//   FBox
//   frame containing fret diagrams
//   TODO(port): init() (rebuilding the diagrams from the chord symbols of the score; only needed when editing),
//   diagrams order
// ---------------------------------------------------------

export class FBox extends VBox {
    private m_textScale = 0.0
    private m_diagramScale = 0.0
    private m_columnGap = new Spatium(0)
    private m_rowGap = new Spatium(0)
    private m_chordsPerRow = 0
    private m_contentAlignmentH = AlignH.HCENTER

    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.FBOX)
        this.resetProperty(Pid.FRET_FRAME_TEXT_SCALE)
        this.resetProperty(Pid.FRET_FRAME_DIAGRAM_SCALE)
        this.resetProperty(Pid.FRET_FRAME_COLUMN_GAP)
        this.resetProperty(Pid.FRET_FRAME_ROW_GAP)
        this.resetProperty(Pid.FRET_FRAME_CHORDS_PER_ROW)
        this.resetProperty(Pid.FRET_FRAME_H_ALIGN)

        this.resetProperty(Pid.LEFT_MARGIN)
        this.resetProperty(Pid.RIGHT_MARGIN)
        this.resetProperty(Pid.TOP_MARGIN)
        this.resetProperty(Pid.BOTTOM_MARGIN)
        this.resetProperty(Pid.TOP_GAP)
        this.resetProperty(Pid.BOTTOM_GAP)
        this.resetProperty(Pid.EXCLUDE_FROM_OTHER_PARTS)
        this.resetProperty(Pid.APPEARANCE_LINKED_TO_MASTER)
        this.resetProperty(Pid.POSITION_LINKED_TO_MASTER)
    }

    override add(e: EngravingItem): void {
        e.setParent(this)
        if (e.isFretDiagram()) {
            this.addAtIdx(e as FretDiagram, -1)
        }
    }

    addAtIdx(fretDiagram: FretDiagram, idx: number): void {
        fretDiagram.setTrack(-1)
        fretDiagram.setFlag(ElementFlag.MOVABLE, false)
        fretDiagram.setFlag(ElementFlag.ON_STAFF, false)

        const harmony = fretDiagram.harmony()
        if (harmony) {
            harmony.setTrack(-1)
            harmony.setFlag(ElementFlag.MOVABLE, false)
            harmony.setFlag(ElementFlag.ON_STAFF, false)
        }

        const el = this.el()
        if (idx >= 0 && idx < el.length) {
            el.splice(idx, 0, fretDiagram)
        } else {
            el.push(fretDiagram)
        }
    }

    textScale(): number { return this.m_textScale }
    diagramScale(): number { return this.m_diagramScale }
    columnGap(): Spatium { return this.m_columnGap }
    rowGap(): Spatium { return this.m_rowGap }
    chordsPerRow(): number { return this.m_chordsPerRow }
    contentHorizontalAlignment(): AlignH { return this.m_contentAlignmentH }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.FRET_FRAME_TEXT_SCALE:
            return this.m_textScale
        case Pid.FRET_FRAME_DIAGRAM_SCALE:
            return this.m_diagramScale
        case Pid.FRET_FRAME_COLUMN_GAP:
            return this.m_columnGap
        case Pid.FRET_FRAME_ROW_GAP:
            return this.m_rowGap
        case Pid.FRET_FRAME_CHORDS_PER_ROW:
            return this.m_chordsPerRow
        case Pid.FRET_FRAME_H_ALIGN:
            return this.m_contentAlignmentH
        case Pid.LEFT_MARGIN:
            return this.m_contentAlignmentH === AlignH.LEFT ? super.getProperty(propertyId) : undefined
        case Pid.RIGHT_MARGIN:
            return this.m_contentAlignmentH === AlignH.RIGHT ? super.getProperty(propertyId) : undefined
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.FRET_FRAME_TEXT_SCALE:
            this.m_textScale = val as number
            break
        case Pid.FRET_FRAME_DIAGRAM_SCALE:
            this.m_diagramScale = val as number
            break
        case Pid.FRET_FRAME_COLUMN_GAP:
            this.m_columnGap = val instanceof Spatium ? val : new Spatium(val as number)
            break
        case Pid.FRET_FRAME_ROW_GAP:
            this.m_rowGap = val instanceof Spatium ? val : new Spatium(val as number)
            break
        case Pid.FRET_FRAME_CHORDS_PER_ROW:
            this.m_chordsPerRow = val as number
            break
        case Pid.FRET_FRAME_H_ALIGN:
            this.m_contentAlignmentH = val as AlignH
            this.resetProperty(Pid.LEFT_MARGIN)
            this.resetProperty(Pid.RIGHT_MARGIN)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.FRET_FRAME_TEXT_SCALE:
        case Pid.FRET_FRAME_DIAGRAM_SCALE:
            return 1.0
        case Pid.FRET_FRAME_COLUMN_GAP:
        case Pid.FRET_FRAME_ROW_GAP:
            return new Spatium(3.0)
        case Pid.FRET_FRAME_CHORDS_PER_ROW:
            return 8
        case Pid.FRET_FRAME_H_ALIGN:
            return AlignH.HCENTER
        case Pid.EXCLUDE_FROM_OTHER_PARTS:
            return true
        case Pid.APPEARANCE_LINKED_TO_MASTER:
        case Pid.POSITION_LINKED_TO_MASTER:
            return false
        default:
            return super.propertyDefault(propertyId)
        }
    }
}
