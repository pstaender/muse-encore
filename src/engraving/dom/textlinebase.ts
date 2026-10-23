/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/textlinebase.h/.cpp
 */

import { PointF, PolygonF, RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { Align, AlignH, ElementType, FontStyle, HookType, TextPlace, TextStyleType } from '../types/types'
import { ElementFlag, LayoutData, type EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { LineSegment, SLine } from './line'
import type { Spanner } from './spanner'
import type { System } from './system'
import { Text } from './text'

export const TextLineBasePropertyId: readonly Pid[] = [
    Pid.LINE_VISIBLE,
    Pid.BEGIN_HOOK_TYPE,
    Pid.BEGIN_HOOK_HEIGHT,
    Pid.BEGIN_LINE_ARROW_HEIGHT,
    Pid.BEGIN_LINE_ARROW_WIDTH,
    Pid.BEGIN_FILLED_ARROW_HEIGHT,
    Pid.BEGIN_FILLED_ARROW_WIDTH,
    Pid.END_HOOK_TYPE,
    Pid.END_HOOK_HEIGHT,
    Pid.END_LINE_ARROW_HEIGHT,
    Pid.END_LINE_ARROW_WIDTH,
    Pid.END_FILLED_ARROW_HEIGHT,
    Pid.END_FILLED_ARROW_WIDTH,
    Pid.GAP_BETWEEN_TEXT_AND_LINE,
    Pid.BEGIN_TEXT,
    Pid.BEGIN_TEXT_ALIGN,
    Pid.BEGIN_TEXT_POSITION,
    Pid.BEGIN_TEXT_PLACE,
    Pid.BEGIN_FONT_FACE,
    Pid.BEGIN_FONT_SIZE,
    Pid.BEGIN_FONT_STYLE,
    Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE,
    Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE,
    Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE,
    Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE,
    Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE,
    Pid.END_TEXT_MUSIC_SYMBOLS_SIZE,
    Pid.BEGIN_TEXT_OFFSET,
    Pid.CONTINUE_TEXT,
    Pid.CONTINUE_TEXT_ALIGN,
    Pid.CONTINUE_TEXT_POSITION,
    Pid.CONTINUE_TEXT_PLACE,
    Pid.CONTINUE_FONT_FACE,
    Pid.CONTINUE_FONT_SIZE,
    Pid.CONTINUE_FONT_STYLE,
    Pid.CONTINUE_TEXT_OFFSET,
    Pid.END_TEXT,
    Pid.END_TEXT_ALIGN,
    Pid.END_TEXT_POSITION,
    Pid.END_TEXT_PLACE,
    Pid.END_FONT_FACE,
    Pid.END_FONT_SIZE,
    Pid.END_FONT_STYLE,
    Pid.END_TEXT_OFFSET,
]

export class TextLineBaseSegmentLayoutData extends LayoutData {
    points: PointF[] = [new PointF(), new PointF(), new PointF(), new PointF(), new PointF(), new PointF()]
    joinedHairpin = new PolygonF()
    beginArrow = new PolygonF()
    endArrow = new PolygonF()
    npoints = 0
    lineLength = 0
}

export abstract class TextLineBaseSegment extends LineSegment {
    protected m_text: Text
    protected m_endText: Text
    protected m_twoLines = false

    protected constructor(type: ElementType, sp: Spanner | null, parent: System | null, f: number = ElementFlag.NOTHING) {
        super(type, sp, parent, f)
        this.m_text = new Text(this, TextStyleType.DEFAULT)
        this.m_endText = new Text(this, TextStyleType.DEFAULT)
        this.m_text.setParent(this)
        this.m_endText.setParent(this)
        this.m_text.setFlag(ElementFlag.MOVABLE, false)
        this.m_endText.setFlag(ElementFlag.MOVABLE, false)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_text = original.m_text.clone() as Text
        this.m_endText = original.m_endText.clone() as Text
        this.m_text.setParent(this)
        this.m_endText.setParent(this)
    }

    protected override createLayoutData(): TextLineBaseSegmentLayoutData { return new TextLineBaseSegmentLayoutData(this) }
    override ldata(): TextLineBaseSegmentLayoutData { return super.ldata() as TextLineBaseSegmentLayoutData }
    override mutldata(): TextLineBaseSegmentLayoutData { return super.ldata() as TextLineBaseSegmentLayoutData }

    textLineBase(): TextLineBase { return this.spanner() as TextLineBase }
    twoLines(): boolean { return this.m_twoLines }
    setTwoLines(val: boolean): void { this.m_twoLines = val }
    text(): Text { return this.m_text }
    endText(): Text { return this.m_endText }

    static boundingBoxOfLine(p1: PointF, p2: PointF, lw2: number, isDottedLine: boolean): RectF {
        if (isDottedLine) {
            return RectF.fromPoints(p1, p2).normalized().adjusted(-lw2, -lw2, lw2, lw2)
        }
        const a = p2.minus(p1).normalized().times(lw2)
        const b = new PointF(-a.y(), a.x())
        return RectF.fromPoints(p1.minus(b), p1.plus(b)).normalized().united(RectF.fromPoints(p2.minus(b), p2.plus(b)).normalized())
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        if (id === Pid.COLOR) {
            this.m_text.setColor(v as never)
            this.m_endText.setColor(v as never)
        }
        return super.setProperty(id, v)
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.TEXT_STYLE) {
            return this.spanner()
        }
        if (TextLineBasePropertyId.includes(pid)) {
            return this.spanner()
        }
        return super.propertyDelegate(pid)
    }

    override spatiumChanged(ov: number, nv: number): void {
        super.spatiumChanged(ov, nv)

        // TextLineBase::spatiumChanged does nothing
        this.m_text.spatiumChanged(ov, nv)
        this.m_endText.spatiumChanged(ov, nv)
    }
}

export abstract class TextLineBase extends SLine {
    private m_lineVisible: boolean = true
    private m_beginHookType: HookType = HookType.NONE
    private m_endHookType: HookType = HookType.NONE
    private m_beginHookHeight: Spatium = new Spatium(1.9)
    private m_endHookHeight: Spatium = new Spatium(1.9)
    private m_beginLineArrowHeight: Spatium = new Spatium(0)
    private m_beginLineArrowWidth: Spatium = new Spatium(0)
    private m_beginFilledArrowHeight: Spatium = new Spatium(0)
    private m_beginFilledArrowWidth: Spatium = new Spatium(0)
    private m_endLineArrowHeight: Spatium = new Spatium(0)
    private m_endLineArrowWidth: Spatium = new Spatium(0)
    private m_endFilledArrowHeight: Spatium = new Spatium(0)
    private m_endFilledArrowWidth: Spatium = new Spatium(0)
    private m_gapBetweenTextAndLine: Spatium = new Spatium(0.5)
    private m_beginTextPlace: TextPlace = TextPlace.AUTO
    private m_beginText: string = ''
    private m_beginTextAlign: Align = new Align()
    private m_beginTextPosition: AlignH = AlignH.LEFT
    private m_beginFontFamily: string = ''
    private m_beginFontSize: number = 10.0
    private m_beginFontStyle: FontStyle = FontStyle.Normal
    private m_beginTextMusicalSymbolsScale: number = 1.0
    private m_beginTextMusicSymbolsSize: number = 12.0
    private m_beginTextOffset: PointF = new PointF()
    private m_continueTextPlace: TextPlace = TextPlace.AUTO
    private m_continueTextMusicalSymbolsScale: number = 1.0
    private m_continueTextMusicSymbolsSize: number = 12.0
    private m_continueText: string = ''
    private m_continueTextAlign: Align = new Align()
    private m_continueTextPosition: AlignH = AlignH.LEFT
    private m_continueFontFamily: string = ''
    private m_continueFontSize: number = 10.0
    private m_continueFontStyle: FontStyle = FontStyle.Normal
    private m_continueTextOffset: PointF = new PointF()
    private m_endTextPlace: TextPlace = TextPlace.AUTO
    private m_endTextMusicalSymbolsScale: number = 1.0
    private m_endTextMusicSymbolsSize: number = 12.0
    private m_endText: string = ''
    private m_endTextAlign: Align = new Align()
    private m_endTextPosition: AlignH = AlignH.LEFT
    private m_endFontFamily: string = ''
    private m_endFontSize: number = 10.0
    private m_endFontStyle: FontStyle = FontStyle.Normal
    private m_endTextOffset: PointF = new PointF()
    private m_textSizeSpatiumDependent: boolean = true

    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
        this.setBeginHookHeight(new Spatium(1.9))
        this.setEndHookHeight(new Spatium(1.9))
        this.setGapBetweenTextAndLine(new Spatium(0.5))
    }

    lineVisible(): boolean { return this.m_lineVisible }
    setLineVisible(v: boolean): void { this.m_lineVisible = v }
    beginHookType(): HookType { return this.m_beginHookType }
    setBeginHookType(v: HookType): void { this.m_beginHookType = v }
    endHookType(): HookType { return this.m_endHookType }
    setEndHookType(v: HookType): void { this.m_endHookType = v }
    beginHookHeight(): Spatium { return this.m_beginHookHeight }
    setBeginHookHeight(v: Spatium): void { this.m_beginHookHeight = v }
    endHookHeight(): Spatium { return this.m_endHookHeight }
    setEndHookHeight(v: Spatium): void { this.m_endHookHeight = v }
    beginLineArrowHeight(): Spatium { return this.m_beginLineArrowHeight }
    setBeginLineArrowHeight(v: Spatium): void { this.m_beginLineArrowHeight = v }
    beginLineArrowWidth(): Spatium { return this.m_beginLineArrowWidth }
    setBeginLineArrowWidth(v: Spatium): void { this.m_beginLineArrowWidth = v }
    beginFilledArrowHeight(): Spatium { return this.m_beginFilledArrowHeight }
    setBeginFilledArrowHeight(v: Spatium): void { this.m_beginFilledArrowHeight = v }
    beginFilledArrowWidth(): Spatium { return this.m_beginFilledArrowWidth }
    setBeginFilledArrowWidth(v: Spatium): void { this.m_beginFilledArrowWidth = v }
    endLineArrowHeight(): Spatium { return this.m_endLineArrowHeight }
    setEndLineArrowHeight(v: Spatium): void { this.m_endLineArrowHeight = v }
    endLineArrowWidth(): Spatium { return this.m_endLineArrowWidth }
    setEndLineArrowWidth(v: Spatium): void { this.m_endLineArrowWidth = v }
    endFilledArrowHeight(): Spatium { return this.m_endFilledArrowHeight }
    setEndFilledArrowHeight(v: Spatium): void { this.m_endFilledArrowHeight = v }
    endFilledArrowWidth(): Spatium { return this.m_endFilledArrowWidth }
    setEndFilledArrowWidth(v: Spatium): void { this.m_endFilledArrowWidth = v }
    gapBetweenTextAndLine(): Spatium { return this.m_gapBetweenTextAndLine }
    setGapBetweenTextAndLine(v: Spatium): void { this.m_gapBetweenTextAndLine = v }
    beginTextPlace(): TextPlace { return this.m_beginTextPlace }
    setBeginTextPlace(v: TextPlace): void { this.m_beginTextPlace = v }
    beginText(): string { return this.m_beginText }
    setBeginText(v: string): void { this.m_beginText = v }
    beginTextAlign(): Align { return this.m_beginTextAlign }
    setBeginTextAlign(v: Align): void { this.m_beginTextAlign = v }
    beginTextPosition(): AlignH { return this.m_beginTextPosition }
    setBeginTextPosition(v: AlignH): void { this.m_beginTextPosition = v }
    beginFontFamily(): string { return this.m_beginFontFamily }
    setBeginFontFamily(v: string): void { this.m_beginFontFamily = v }
    beginFontSize(): number { return this.m_beginFontSize }
    setBeginFontSize(v: number): void { this.m_beginFontSize = v }
    beginFontStyle(): FontStyle { return this.m_beginFontStyle }
    setBeginFontStyle(v: FontStyle): void { this.m_beginFontStyle = v }
    beginTextMusicalSymbolsScale(): number { return this.m_beginTextMusicalSymbolsScale }
    setBeginTextMusicalSymbolsScale(v: number): void { this.m_beginTextMusicalSymbolsScale = v }
    beginTextMusicSymbolsSize(): number { return this.m_beginTextMusicSymbolsSize }
    setBeginTextMusicSymbolsSize(v: number): void { this.m_beginTextMusicSymbolsSize = v }
    beginTextOffset(): PointF { return this.m_beginTextOffset }
    setBeginTextOffset(v: PointF): void { this.m_beginTextOffset = v }
    continueTextPlace(): TextPlace { return this.m_continueTextPlace }
    setContinueTextPlace(v: TextPlace): void { this.m_continueTextPlace = v }
    continueTextMusicalSymbolsScale(): number { return this.m_continueTextMusicalSymbolsScale }
    setContinueTextMusicalSymbolsScale(v: number): void { this.m_continueTextMusicalSymbolsScale = v }
    continueTextMusicSymbolsSize(): number { return this.m_continueTextMusicSymbolsSize }
    setContinueTextMusicSymbolsSize(v: number): void { this.m_continueTextMusicSymbolsSize = v }
    continueText(): string { return this.m_continueText }
    setContinueText(v: string): void { this.m_continueText = v }
    continueTextAlign(): Align { return this.m_continueTextAlign }
    setContinueTextAlign(v: Align): void { this.m_continueTextAlign = v }
    continueTextPosition(): AlignH { return this.m_continueTextPosition }
    setContinueTextPosition(v: AlignH): void { this.m_continueTextPosition = v }
    continueFontFamily(): string { return this.m_continueFontFamily }
    setContinueFontFamily(v: string): void { this.m_continueFontFamily = v }
    continueFontSize(): number { return this.m_continueFontSize }
    setContinueFontSize(v: number): void { this.m_continueFontSize = v }
    continueFontStyle(): FontStyle { return this.m_continueFontStyle }
    setContinueFontStyle(v: FontStyle): void { this.m_continueFontStyle = v }
    continueTextOffset(): PointF { return this.m_continueTextOffset }
    setContinueTextOffset(v: PointF): void { this.m_continueTextOffset = v }
    endTextPlace(): TextPlace { return this.m_endTextPlace }
    setEndTextPlace(v: TextPlace): void { this.m_endTextPlace = v }
    endTextMusicalSymbolsScale(): number { return this.m_endTextMusicalSymbolsScale }
    setEndTextMusicalSymbolsScale(v: number): void { this.m_endTextMusicalSymbolsScale = v }
    endTextMusicSymbolsSize(): number { return this.m_endTextMusicSymbolsSize }
    setEndTextMusicSymbolsSize(v: number): void { this.m_endTextMusicSymbolsSize = v }
    endText(): string { return this.m_endText }
    setEndText(v: string): void { this.m_endText = v }
    endTextAlign(): Align { return this.m_endTextAlign }
    setEndTextAlign(v: Align): void { this.m_endTextAlign = v }
    endTextPosition(): AlignH { return this.m_endTextPosition }
    setEndTextPosition(v: AlignH): void { this.m_endTextPosition = v }
    endFontFamily(): string { return this.m_endFontFamily }
    setEndFontFamily(v: string): void { this.m_endFontFamily = v }
    endFontSize(): number { return this.m_endFontSize }
    setEndFontSize(v: number): void { this.m_endFontSize = v }
    endFontStyle(): FontStyle { return this.m_endFontStyle }
    setEndFontStyle(v: FontStyle): void { this.m_endFontStyle = v }
    endTextOffset(): PointF { return this.m_endTextOffset }
    setEndTextOffset(v: PointF): void { this.m_endTextOffset = v }
    textSizeSpatiumDependent(): boolean { return this.m_textSizeSpatiumDependent }
    setTextSizeSpatiumDependent(v: boolean): void { this.m_textSizeSpatiumDependent = v }

    static textLineBasePropertyIds(): readonly Pid[] { return TextLineBasePropertyId }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        // Redirect to begin text...
        case Pid.ALIGN: return this.m_beginTextAlign
        case Pid.POSITION: return this.m_beginTextPosition
        case Pid.FONT_FACE: return this.m_beginFontFamily
        case Pid.FONT_SIZE: return this.m_beginFontSize
        case Pid.FONT_STYLE: return this.m_beginFontStyle
        case Pid.MUSIC_SYMBOL_SIZE: return this.m_beginTextMusicSymbolsSize
        case Pid.MUSICAL_SYMBOLS_SCALE: return this.m_beginTextMusicalSymbolsScale
        case Pid.LINE_VISIBLE: return this.m_lineVisible
        case Pid.BEGIN_HOOK_TYPE: return this.m_beginHookType
        case Pid.END_HOOK_TYPE: return this.m_endHookType
        case Pid.BEGIN_HOOK_HEIGHT: return this.m_beginHookHeight
        case Pid.END_HOOK_HEIGHT: return this.m_endHookHeight
        case Pid.BEGIN_LINE_ARROW_HEIGHT: return this.m_beginLineArrowHeight
        case Pid.BEGIN_LINE_ARROW_WIDTH: return this.m_beginLineArrowWidth
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: return this.m_beginFilledArrowHeight
        case Pid.BEGIN_FILLED_ARROW_WIDTH: return this.m_beginFilledArrowWidth
        case Pid.END_LINE_ARROW_HEIGHT: return this.m_endLineArrowHeight
        case Pid.END_LINE_ARROW_WIDTH: return this.m_endLineArrowWidth
        case Pid.END_FILLED_ARROW_HEIGHT: return this.m_endFilledArrowHeight
        case Pid.END_FILLED_ARROW_WIDTH: return this.m_endFilledArrowWidth
        case Pid.GAP_BETWEEN_TEXT_AND_LINE: return this.m_gapBetweenTextAndLine
        case Pid.BEGIN_TEXT_PLACE: return this.m_beginTextPlace
        case Pid.BEGIN_TEXT: return this.m_beginText
        case Pid.BEGIN_TEXT_ALIGN: return this.m_beginTextAlign
        case Pid.BEGIN_TEXT_POSITION: return this.m_beginTextPosition
        case Pid.BEGIN_FONT_FACE: return this.m_beginFontFamily
        case Pid.BEGIN_FONT_SIZE: return this.m_beginFontSize
        case Pid.BEGIN_FONT_STYLE: return this.m_beginFontStyle
        case Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE: return this.m_beginTextMusicalSymbolsScale
        case Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE: return this.m_beginTextMusicSymbolsSize
        case Pid.BEGIN_TEXT_OFFSET: return this.m_beginTextOffset
        case Pid.CONTINUE_TEXT_PLACE: return this.m_continueTextPlace
        case Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE: return this.m_continueTextMusicalSymbolsScale
        case Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE: return this.m_continueTextMusicSymbolsSize
        case Pid.CONTINUE_TEXT: return this.m_continueText
        case Pid.CONTINUE_TEXT_ALIGN: return this.m_continueTextAlign
        case Pid.CONTINUE_TEXT_POSITION: return this.m_continueTextPosition
        case Pid.CONTINUE_FONT_FACE: return this.m_continueFontFamily
        case Pid.CONTINUE_FONT_SIZE: return this.m_continueFontSize
        case Pid.CONTINUE_FONT_STYLE: return this.m_continueFontStyle
        case Pid.CONTINUE_TEXT_OFFSET: return this.m_continueTextOffset
        case Pid.END_TEXT_PLACE: return this.m_endTextPlace
        case Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE: return this.m_endTextMusicalSymbolsScale
        case Pid.END_TEXT_MUSIC_SYMBOLS_SIZE: return this.m_endTextMusicSymbolsSize
        case Pid.END_TEXT: return this.m_endText
        case Pid.END_TEXT_ALIGN: return this.m_endTextAlign
        case Pid.END_TEXT_POSITION: return this.m_endTextPosition
        case Pid.END_FONT_FACE: return this.m_endFontFamily
        case Pid.END_FONT_SIZE: return this.m_endFontSize
        case Pid.END_FONT_STYLE: return this.m_endFontStyle
        case Pid.END_TEXT_OFFSET: return this.m_endTextOffset
        case Pid.TEXT_SIZE_SPATIUM_DEPENDENT: return this.m_textSizeSpatiumDependent
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.LINE_VISIBLE: this.m_lineVisible = v as boolean; break
        case Pid.BEGIN_HOOK_TYPE: this.m_beginHookType = v as HookType; break
        case Pid.END_HOOK_TYPE: this.m_endHookType = v as HookType; break
        case Pid.BEGIN_HOOK_HEIGHT: this.m_beginHookHeight = v as Spatium; break
        case Pid.END_HOOK_HEIGHT: this.m_endHookHeight = v as Spatium; break
        case Pid.BEGIN_LINE_ARROW_HEIGHT: this.m_beginLineArrowHeight = v as Spatium; break
        case Pid.BEGIN_LINE_ARROW_WIDTH: this.m_beginLineArrowWidth = v as Spatium; break
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: this.m_beginFilledArrowHeight = v as Spatium; break
        case Pid.BEGIN_FILLED_ARROW_WIDTH: this.m_beginFilledArrowWidth = v as Spatium; break
        case Pid.END_LINE_ARROW_HEIGHT: this.m_endLineArrowHeight = v as Spatium; break
        case Pid.END_LINE_ARROW_WIDTH: this.m_endLineArrowWidth = v as Spatium; break
        case Pid.END_FILLED_ARROW_HEIGHT: this.m_endFilledArrowHeight = v as Spatium; break
        case Pid.END_FILLED_ARROW_WIDTH: this.m_endFilledArrowWidth = v as Spatium; break
        case Pid.GAP_BETWEEN_TEXT_AND_LINE: this.m_gapBetweenTextAndLine = v as Spatium; break
        case Pid.BEGIN_TEXT_PLACE: this.m_beginTextPlace = v as TextPlace; break
        case Pid.BEGIN_TEXT: this.m_beginText = v as string; break
        case Pid.BEGIN_TEXT_ALIGN: this.m_beginTextAlign = v as Align; break
        case Pid.BEGIN_TEXT_POSITION: this.m_beginTextPosition = v as AlignH; break
        case Pid.BEGIN_FONT_FACE: this.m_beginFontFamily = v as string; break
        case Pid.BEGIN_FONT_SIZE: this.m_beginFontSize = v as number; break
        case Pid.BEGIN_FONT_STYLE: this.m_beginFontStyle = v as FontStyle; break
        case Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE: this.m_beginTextMusicalSymbolsScale = v as number; break
        case Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE: this.m_beginTextMusicSymbolsSize = v as number; break
        case Pid.BEGIN_TEXT_OFFSET: this.m_beginTextOffset = v as PointF; break
        case Pid.CONTINUE_TEXT_PLACE: this.m_continueTextPlace = v as TextPlace; break
        case Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE: this.m_continueTextMusicalSymbolsScale = v as number; break
        case Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE: this.m_continueTextMusicSymbolsSize = v as number; break
        case Pid.CONTINUE_TEXT: this.m_continueText = v as string; break
        case Pid.CONTINUE_TEXT_ALIGN: this.m_continueTextAlign = v as Align; break
        case Pid.CONTINUE_TEXT_POSITION: this.m_continueTextPosition = v as AlignH; break
        case Pid.CONTINUE_FONT_FACE: this.m_continueFontFamily = v as string; break
        case Pid.CONTINUE_FONT_SIZE: this.m_continueFontSize = v as number; break
        case Pid.CONTINUE_FONT_STYLE: this.m_continueFontStyle = v as FontStyle; break
        case Pid.CONTINUE_TEXT_OFFSET: this.m_continueTextOffset = v as PointF; break
        case Pid.END_TEXT_PLACE: this.m_endTextPlace = v as TextPlace; break
        case Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE: this.m_endTextMusicalSymbolsScale = v as number; break
        case Pid.END_TEXT_MUSIC_SYMBOLS_SIZE: this.m_endTextMusicSymbolsSize = v as number; break
        case Pid.END_TEXT: this.m_endText = v as string; break
        case Pid.END_TEXT_ALIGN: this.m_endTextAlign = v as Align; break
        case Pid.END_TEXT_POSITION: this.m_endTextPosition = v as AlignH; break
        case Pid.END_FONT_FACE: this.m_endFontFamily = v as string; break
        case Pid.END_FONT_SIZE: this.m_endFontSize = v as number; break
        case Pid.END_FONT_STYLE: this.m_endFontStyle = v as FontStyle; break
        case Pid.END_TEXT_OFFSET: this.m_endTextOffset = v as PointF; break
        case Pid.TEXT_SIZE_SPATIUM_DEPENDENT: this.m_textSizeSpatiumDependent = v as boolean; break
        /// In >=4.6 text line begin, continue, and end text should all have the same style. This preserves backwards
        /// compatibility and will allow us to style these text items separately in the future if desired
        // These are TextBase properties - updating these should update begin, continue, and end text...
        case Pid.ALIGN: {
            const align = v as Align
            this.m_beginTextAlign = align.clone()
            this.m_continueTextAlign = align.clone()
            this.m_endTextAlign = align.clone()
            break
        }
        case Pid.POSITION:
            this.m_beginTextPosition = this.m_continueTextPosition = this.m_endTextPosition = v as AlignH
            break
        case Pid.FONT_FACE:
            this.m_beginFontFamily = this.m_continueFontFamily = this.m_endFontFamily = v as string
            break
        case Pid.FONT_SIZE:
            this.m_beginFontSize = this.m_continueFontSize = this.m_endFontSize = v as number
            break
        case Pid.FONT_STYLE:
            this.m_beginFontStyle = this.m_continueFontStyle = this.m_endFontStyle = v as FontStyle
            break
        case Pid.MUSIC_SYMBOL_SIZE:
            this.m_beginTextMusicSymbolsSize = this.m_continueTextMusicSymbolsSize = this.m_endTextMusicSymbolsSize = v as number
            break
        case Pid.MUSICAL_SYMBOLS_SCALE:
            this.m_beginTextMusicalSymbolsScale = this.m_continueTextMusicalSymbolsScale = this.m_endTextMusicalSymbolsScale = v as number
            break
        default:
            return super.setProperty(id, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GAP_BETWEEN_TEXT_AND_LINE: return new Spatium(0.5)
        // Redirect to begin text for these...
        case Pid.ALIGN: return this.propertyDefault(Pid.BEGIN_TEXT_ALIGN)
        case Pid.POSITION: return this.propertyDefault(Pid.BEGIN_TEXT_POSITION)
        case Pid.FONT_FACE: return this.propertyDefault(Pid.BEGIN_FONT_FACE)
        case Pid.FONT_SIZE: return this.propertyDefault(Pid.BEGIN_FONT_SIZE)
        case Pid.FONT_STYLE: return this.propertyDefault(Pid.BEGIN_FONT_STYLE)
        case Pid.MUSICAL_SYMBOLS_SCALE: return this.propertyDefault(Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE)
        case Pid.MUSIC_SYMBOL_SIZE: return this.propertyDefault(Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE)
        default: return super.propertyDefault(propertyId)
        }
    }

    override setPropertyFlags(id: Pid, f: PropertyFlags): void {
        const triple = (a: Pid, b: Pid, c: Pid): void => {
            this.setPropertyFlags(a, f)
            this.setPropertyFlags(b, f)
            this.setPropertyFlags(c, f)
        }
        switch (id) {
        case Pid.ALIGN: triple(Pid.BEGIN_TEXT_ALIGN, Pid.CONTINUE_TEXT_ALIGN, Pid.END_TEXT_ALIGN); break
        case Pid.POSITION: triple(Pid.BEGIN_TEXT_POSITION, Pid.CONTINUE_TEXT_POSITION, Pid.END_TEXT_POSITION); break
        case Pid.FONT_FACE: triple(Pid.BEGIN_FONT_FACE, Pid.CONTINUE_FONT_FACE, Pid.END_FONT_FACE); break
        case Pid.FONT_SIZE: triple(Pid.BEGIN_FONT_SIZE, Pid.CONTINUE_FONT_SIZE, Pid.END_FONT_SIZE); break
        case Pid.FONT_STYLE: triple(Pid.BEGIN_FONT_STYLE, Pid.CONTINUE_FONT_STYLE, Pid.END_FONT_STYLE); break
        case Pid.MUSICAL_SYMBOLS_SCALE:
            triple(Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE, Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE, Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE)
            break
        case Pid.MUSIC_SYMBOL_SIZE:
            triple(Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE, Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE, Pid.END_TEXT_MUSIC_SYMBOLS_SIZE)
            break
        default:
            super.setPropertyFlags(id, f)
        }
    }
}

export function isSystemTextLine(element: EngravingItem | null): boolean {
    return !!element && element instanceof TextLineBase && element.systemFlag()
}
