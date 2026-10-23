/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
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
import { FretDiagram } from './fret'
import { HarmonyType, type Harmony } from './harmony'
import { SegmentType } from './segment'
import { AddFretDiagramToFretBox, RemoveFretDiagramFromFretBox } from '../editing/editfretboarddiagram'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { MeasureBase } from './measurebase'
import { Pid } from './property'
import { Text } from './text'
import type { InsertMeasureOptions } from '../editing/edit'

const FRET_BOX_DIAGRAMS_SEPARATOR = ','

const boxStyle: ElementStyle = [
    { sid: Sid.systemFrameDistance, pid: Pid.TOP_GAP },
    { sid: Sid.frameSystemDistance, pid: Pid.BOTTOM_GAP },
    { sid: Sid.paddingToNotationAbove, pid: Pid.PADDING_TO_NOTATION_ABOVE },
    { sid: Sid.paddingToNotationBelow, pid: Pid.PADDING_TO_NOTATION_BELOW },
]

const hBoxStyle: ElementStyle = []

export abstract class Box extends MeasureBase {
    override canBeExcludedFromOtherParts(): boolean { return true }

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

    copyValues(origin: Box): void {
        this.m_boxHeight = origin.boxHeight()
        this.m_boxWidth = origin.boxWidth()

        const factor = this.magS() / origin.magS()
        this.m_bottomGap = origin.bottomGap().times(factor)
        this.m_topGap = origin.topGap().times(factor)
        this.m_bottomMargin = origin.bottomMargin() * factor
        this.m_topMargin = origin.topMargin() * factor
        this.m_leftMargin = origin.leftMargin() * factor
        this.m_rightMargin = origin.rightMargin() * factor

        this.setSizeIsSpatiumDependent(origin.sizeIsSpatiumDependent())
    }

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

    override manageExclusionFromParts(exclude: boolean): void {
        // manage Layout Breaks - remove old ones first
        const sectionBreak = this.sectionBreakElement()
        if (sectionBreak) {
            sectionBreak.manageExclusionFromParts(true)
        }

        const titleFrame = this.isTitleFrame()
        if (exclude) {
            const links = [...this.linkList()]
            for (const linkedObject of links) {
                // Only remove title frame from score
                if (linkedObject.score() === this.score()
                    || (!this.score().isMaster() && titleFrame && !linkedObject.score().isMaster())) {
                    continue
                }
                const linkedItem = linkedObject as EngravingItem
                if (linkedItem.selected()) {
                    linkedItem.score().deselect(linkedItem)
                }
                linkedItem.score().undoRemoveElement(linkedItem, false)
                linkedItem.undoUnlink()
            }

            // manage Layout Breaks - there are no linked boxes, so add linked Line Breaks to previous measure
            if (sectionBreak && !titleFrame) {
                const prevMeasure = this.prevMeasure()
                if (prevMeasure) {
                    for (const score of this.masterScore().scoreList()) {
                        if (score === this.score()) {
                            continue
                        }
                        const localPrevMeasure = score.tick2measure(prevMeasure.tick())
                        if (localPrevMeasure) {
                            const newSectionBreak = sectionBreak.linkedClone()
                            newSectionBreak.setScore(score)
                            newSectionBreak.setParent(localPrevMeasure)
                            score.doUndoAddElement(newSectionBreak)
                        }
                    }
                }
            }
        } else {
            for (const score of this.masterScore().scoreList()) {
                if (score === this.score() || (titleFrame && !this.score().isMaster() && !score.isMaster())) {
                    continue
                }

                const newMB = this.next() ? this.next()!.getInScore(score, true) : null
                // Score::InsertMeasureOptions (editing/edit.ts, not imported here: import cycle)
                const options: InsertMeasureOptions = {
                    createEmptyMeasures: false, moveSignaturesClef: true, needDeselectAll: true, cloneBoxToAllParts: false,
                    moveStaffTypeChanges: true, ignoreBarLines: false,
                }
                const newFrame = score.insertBox(this.type(), newMB, options)!
                newFrame.setExcludeFromOtherParts(false)
                // newFrame->setSizeIsSpatiumDependent(!titleFrame);

                if (!this.isFBox()) {
                    for (const item of this.el()) {
                        // Don't add instrument name from current part
                        if (item.isText() && (item as Text).textStyleType() === TextStyleType.INSTRUMENT_EXCERPT) {
                            continue
                        }
                        // add frame items (Layout Break, Title, ...)
                        newFrame.add(item.linkedClone())
                    }
                }

                if (this.isTBox()) {
                    const thisText = (this as unknown as TBox).text()
                    newFrame.add(thisText.linkedClone())
                }

                if (!score.isMaster() && titleFrame) {
                    // Title frame - add part name
                    const partLabel = score.name()
                    if (partLabel) {
                        const txt = new Text(newFrame, TextStyleType.INSTRUMENT_EXCERPT)
                        txt.setPlainText(partLabel)
                        newFrame.add(txt)

                        score.setMetaTag('partName', partLabel)
                    }
                }

                newFrame.linkTo(this)
            }
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
// ---------------------------------------------------------

export class FBox extends VBox {
    private m_textScale = 0.0
    private m_diagramScale = 0.0
    private m_columnGap = new Spatium(0)
    private m_rowGap = new Spatium(0)
    private m_chordsPerRow = 0
    private m_contentAlignmentH = AlignH.HCENTER

    private m_needsRebuild = false

    private m_diagramsOrderInScore: string[] = []

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

    /** rebuilds the diagrams from the chord symbols and fret diagrams of the score (through the undo stack) */
    init(): void {
        const oldDiagramsNames: string[] = []
        const oldDiagrams: FretDiagram[] = []
        for (const element of this.el()) {
            const diagram = element as FretDiagram
            oldDiagrams.push(diagram)
            oldDiagramsNames.push(diagram.harmonyDisplayText())
        }

        const diagramsNamesInScore: string[] = []
        const harmonyOrDiagramsInScore: EngravingItem[] = []
        for (let segment = this.score().firstSegment(SegmentType.ChordRest); segment; segment = segment.next1(SegmentType.ChordRest)) {
            for (const item of segment.annotations()) {
                if (!item || !item.part()) {
                    continue
                }

                if (item.isHarmony() && (item as Harmony).harmonyType() !== HarmonyType.STANDARD) {
                    continue
                }

                if (!(item.isHarmony() || item.isFretDiagram())) {
                    continue
                }

                const harmonyName = item.isHarmony() ? (item as Harmony).displayText()
                    : item.isFretDiagram() ? (item as FretDiagram).harmonyDisplayText()
                        : ''
                if (!harmonyName || diagramsNamesInScore.includes(harmonyName)) {
                    continue
                }

                harmonyOrDiagramsInScore.push(item)
                diagramsNamesInScore.push(harmonyName)
            }
        }

        this.m_diagramsOrderInScore = diagramsNamesInScore

        for (let i = 0; i < oldDiagramsNames.length; ++i) {
            const oldName = oldDiagramsNames[i]
            if (!diagramsNamesInScore.includes(oldName)) {
                this.score().undo(new RemoveFretDiagramFromFretBox(oldDiagrams[i]))
            }
        }

        for (let i = 0; i < diagramsNamesInScore.length; ++i) {
            const newName = diagramsNamesInScore[i]
            if (!oldDiagramsNames.includes(newName)) {
                const newDiagram = FretDiagram.makeFromHarmonyOrFretDiagram(harmonyOrDiagramsInScore[i])!
                newDiagram.setParent(this)
                const nameOfDiagramBeforeThis = i > 0 ? diagramsNamesInScore[i - 1] : ''
                const idx = this.computeInsertionIdx(nameOfDiagramBeforeThis)
                this.score().undo(new AddFretDiagramToFretBox(newDiagram, idx))
            }
        }
    }

    needsRebuild(): boolean { return this.m_needsRebuild }
    setNeedsRebuild(v: boolean): void { this.m_needsRebuild = v }

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

        fretDiagram.added()
    }

    /** -1 (C++ muse::nidx): append */
    computeInsertionIdx(nameOfDiagramBeforeThis: string): number {
        if (!nameOfDiagramBeforeThis) {
            return 0
        }

        const el = this.el()
        for (let i = 0; i < el.length; ++i) {
            const fretDiagram = el[i] as FretDiagram
            if (fretDiagram.harmonyDisplayText() === nameOfDiagramBeforeThis) {
                return i + 1
            }
        }

        return -1
    }

    undoReorderElements(newOrder: readonly string[]): void {
        this.undoChangeProperty(Pid.FRET_FRAME_DIAGRAMS_ORDER, newOrder.join(FRET_BOX_DIAGRAMS_SEPARATOR))
        this.triggerLayout()
    }

    reorderElements(newOrder: readonly string[]): void {
        const pos = (e: EngravingItem): number => {
            const i = newOrder.indexOf((e as FretDiagram).harmonyDisplayText())
            return i < 0 ? newOrder.length : i
        }
        this.el().sort((a, b) => pos(a) - pos(b))
    }

    diagramsOrder(): string[] {
        const result: string[] = []
        for (const item of this.el()) {
            result.push((item as FretDiagram).harmonyDisplayText())
        }

        return result
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
        case Pid.FRET_FRAME_DIAGRAMS_ORDER:
            return this.diagramsOrder().join(FRET_BOX_DIAGRAMS_SEPARATOR)
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
        case Pid.FRET_FRAME_DIAGRAMS_ORDER:
            this.reorderElements((val as string).split(FRET_BOX_DIAGRAMS_SEPARATOR))
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
        case Pid.FRET_FRAME_DIAGRAMS_ORDER:
            return this.m_diagramsOrderInScore.join(FRET_BOX_DIAGRAMS_SEPARATOR)
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
