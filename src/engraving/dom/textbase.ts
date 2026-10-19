/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/textbase.h/.cpp
 *
 * Only the parts needed for reading and layout are ported: text editing (cursor movement,
 * insert/remove, drag, accessibility) is not.
 */

import { Color } from '../../framework/draw/types/color'
import { Font, FontType } from '../../framework/draw/types/font'
import { FontMetrics } from '../../framework/draw/fontmetrics'
import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import {
    Align, AlignH, AlignV, AutoOnOff, DirectionV, FontStyle, TextStyleType, VoiceAssignment, type ElementType,
} from '../types/types'
import { Sid } from '../style/styledef'
import { DEFAULT_SMUFL_POINT_SIZE } from '../infrastructure/engravingfont'
import { textStyle } from '../style/textstyle'
import { Shape } from '../infrastructure/shape'
import { engravingFonts } from '../infrastructure/engravingfont'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import type { PaintOptions } from '../rendering/paintoptions'

export const SUBSCRIPT_SIZE = 0.6
export const SUBSCRIPT_OFFSET = 0.5 // of x-height
export const SUPERSCRIPT_OFFSET = -0.9 // of x-height

const FALLBACK_SYMBOL_FONT = 'Bravura'
const FALLBACK_SYMBOLTEXT_FONT = 'Bravura Text'

export enum FrameType {
    NO_FRAME, SQUARE, CIRCLE,
}

export enum VerticalAlignment {
    AlignUndefined = -1, AlignNormal, AlignSuperScript, AlignSubScript,
}

export enum FormatId {
    Bold, Italic, Underline, Strike, Valign, FontSize, FontFamily,
}

export type FormatValue = boolean | number | string | undefined

function isHighSurrogate(c: number): boolean { return c >= 0xD800 && c <= 0xDBFF }

// ---------------------------------------------------------
//   CharFormat
// ---------------------------------------------------------

export class CharFormat {
    private m_style: FontStyle = FontStyle.Normal
    private m_valign: VerticalAlignment = VerticalAlignment.AlignNormal
    private m_fontSize = 12.0
    private m_fontFamily = ''

    clone(): CharFormat {
        const f = new CharFormat()
        f.assign(this)
        return f
    }

    assign(cf: CharFormat): void {
        this.m_style = cf.m_style
        this.m_valign = cf.m_valign
        this.m_fontSize = cf.m_fontSize
        this.m_fontFamily = cf.m_fontFamily
    }

    equals(cf: CharFormat): boolean {
        return cf.style() === this.style()
               && cf.valign() === this.valign()
               && cf.fontSize() === this.fontSize()
               && cf.fontFamily() === this.fontFamily()
    }

    style(): FontStyle { return this.m_style }
    setStyle(s: FontStyle): void { this.m_style = s }
    bold(): boolean { return (this.m_style & FontStyle.Bold) !== 0 }
    italic(): boolean { return (this.m_style & FontStyle.Italic) !== 0 }
    underline(): boolean { return (this.m_style & FontStyle.Underline) !== 0 }
    strike(): boolean { return (this.m_style & FontStyle.Strike) !== 0 }
    setBold(val: boolean): void { this.setFlag(FontStyle.Bold, val) }
    setItalic(val: boolean): void { this.setFlag(FontStyle.Italic, val) }
    setUnderline(val: boolean): void { this.setFlag(FontStyle.Underline, val) }
    setStrike(val: boolean): void { this.setFlag(FontStyle.Strike, val) }
    private setFlag(f: FontStyle, val: boolean): void { this.m_style = val ? (this.m_style | f) : (this.m_style & ~f) }

    valign(): VerticalAlignment { return this.m_valign }
    fontSize(): number { return this.m_fontSize }
    fontFamily(): string { return this.m_fontFamily }
    setValign(val: VerticalAlignment): void { this.m_valign = val }
    setFontSize(val: number): void { this.m_fontSize = val }
    setFontFamily(val: string): void { this.m_fontFamily = val }

    formatValue(id: FormatId): FormatValue {
        switch (id) {
        case FormatId.Bold: return this.bold()
        case FormatId.Italic: return this.italic()
        case FormatId.Underline: return this.underline()
        case FormatId.Strike: return this.strike()
        case FormatId.Valign: return this.valign()
        case FormatId.FontSize: return this.fontSize()
        case FormatId.FontFamily: return this.fontFamily()
        }
        return undefined
    }

    setFormatValue(id: FormatId, val: FormatValue): void {
        switch (id) {
        case FormatId.Bold: this.setBold(!!val); break
        case FormatId.Italic: this.setItalic(!!val); break
        case FormatId.Underline: this.setUnderline(!!val); break
        case FormatId.Strike: this.setStrike(!!val); break
        case FormatId.Valign: this.m_valign = val as VerticalAlignment; break
        case FormatId.FontSize: this.m_fontSize = val as number; break
        case FormatId.FontFamily: this.m_fontFamily = val as string; break
        }
    }
}

// ---------------------------------------------------------
//   TextCursor (format handling only)
// ---------------------------------------------------------

export class TextCursor {
    private m_text: TextBase
    private m_format = new CharFormat()
    private m_row = 0
    private m_column = 0
    private m_selectLine = 0 // start of selection
    private m_selectColumn = 0
    private m_editing = false

    constructor(t: TextBase) {
        this.m_text = t
    }

    clone(t: TextBase = this.m_text): TextCursor {
        const c = new TextCursor(t)
        c.m_format = this.m_format.clone()
        c.m_row = this.m_row
        c.m_column = this.m_column
        c.m_selectLine = this.m_selectLine
        c.m_selectColumn = this.m_selectColumn
        c.m_editing = this.m_editing
        return c
    }

    text(): TextBase { return this.m_text }
    hasSelection(): boolean { return (this.m_selectLine !== this.m_row) || (this.m_selectColumn !== this.m_column) }

    clearSelection(): void {
        this.m_selectLine = this.m_row
        this.m_selectColumn = this.m_column
    }

    editing(): boolean { return this.m_editing }
    format(): CharFormat { return this.m_format }
    setFormatObj(f: CharFormat): void { this.m_format = f.clone() }

    row(): number { return this.m_row }
    column(): number { return this.m_column }
    selectLine(): number { return this.m_selectLine }
    selectColumn(): number { return this.m_selectColumn }
    setRow(val: number): void { this.m_row = val }
    setColumn(val: number): void { this.m_column = val }
    setSelectLine(val: number): void { this.m_selectLine = val }
    setSelectColumn(val: number): void { this.m_selectColumn = val }

    init(): void {
        this.m_format.setFontFamily(this.m_text.propertyDefault(Pid.FONT_FACE) as string)
        this.m_format.setFontSize(this.m_text.propertyDefault(Pid.FONT_SIZE) as number)
        this.m_format.setStyle(this.m_text.propertyDefault(Pid.FONT_STYLE) as FontStyle)
        this.m_format.setValign(this.m_text.propertyDefault(Pid.TEXT_SCRIPT_ALIGN) as VerticalAlignment)
    }

    curLine(): TextBlock { return this.m_text.ldata().blocks[this.m_row] }

    setFormat(id: FormatId, val: FormatValue): void {
        if (!this.hasSelection()) {
            if (!this.editing()) {
                this.m_text.selectAll(this)
            } else if (this.format().formatValue(id) === val) {
                return
            }
        }
        this.format().setFormatValue(id, val)
        this.changeSelectionFormat(id, val)
        if (this.hasSelection()) {
            this.m_text.setTextInvalid()
        }
        if (!this.editing()) {
            this.clearSelection()
        }
    }

    changeSelectionFormat(id: FormatId, val: FormatValue): void {
        const ldata = this.m_text.mutldata()
        let [r1, c1, r2, c2] = [this.selectLine(), this.selectColumn(), this.row(), this.column()]
        ;[r1, c1, r2, c2] = TextBase.sort(r1, c1, r2, c2)
        for (let row = 0; row < ldata.blocks.length; ++row) {
            const t = ldata.blocks[row]
            if (row < r1) {
                continue
            }
            if (row > r2) {
                break
            }
            if (row === r1 && r1 === r2) {
                t.changeFormat(id, val, c1, c2 - c1)
            } else if (row === r1) {
                t.changeFormat(id, val, c1, t.columns() - c1)
            } else if (row === r2) {
                t.changeFormat(id, val, 0, c2)
            } else {
                t.changeFormat(id, val, 0, t.columns())
            }
        }
        // C++ calls renderer()->layoutText1() here; the layout is done later in the layout pass
    }

    selectedFragmentsFormat(): CharFormat {
        if (!this.hasSelection() && this.editing()) {
            return this.m_format
        }
        const ldata = this.m_text.ldata()
        if (ldata.blocks.length === 0) {
            return this.m_format
        }
        let startRow = this.hasSelection() ? this.m_selectLine : 0
        let endRow = this.hasSelection() ? this.m_row : ldata.blocks.length - 1
        let selectionStartCol = this.hasSelection() ? this.m_selectColumn : 0
        let selectionEndCol = this.hasSelection() ? this.m_column : 1 // corrected below at `endColumn`
        ;[startRow, selectionStartCol, endRow, selectionEndCol] = TextBase.sort(startRow, selectionStartCol, endRow, selectionEndCol)

        const tf = ldata.blocks[startRow].fragment(selectionStartCol)
        const resultFormat = tf ? tf.format.clone() : new CharFormat()
        let allBlocksEmpty = true

        for (let row = startRow; row <= endRow; ++row) {
            const block = ldata.blocks[row]
            if (block.fragments().length === 0) {
                continue
            }
            allBlocksEmpty = false
            const startColumn = (row === startRow) ? selectionStartCol : 0
            const endColumn = (row === endRow && this.hasSelection()) ? selectionEndCol : block.columns()
            let column = 0
            const isSingleFragment = block.fragments().length === 1
            for (const fragment of block.fragments()) {
                const fragCols = fragment.columns()
                if (!isSingleFragment) {
                    if (column + fragCols <= startColumn) {
                        column += fragCols
                        continue
                    }
                    if (column > 0 && column >= endColumn) {
                        break
                    }
                }
                resultFormat.setStyle(resultFormat.style() & fragment.format.style())
                if (resultFormat.fontFamily() === 'ScoreText') {
                    resultFormat.setFontFamily(fragment.format.fontFamily())
                }
                if (fragment.format.fontFamily() !== 'ScoreText' && resultFormat.fontFamily() !== fragment.format.fontFamily()) {
                    resultFormat.setFontFamily(TextBase.UNDEFINED_FONT_FAMILY)
                }
                if (resultFormat.fontSize() !== fragment.format.fontSize()) {
                    resultFormat.setFontSize(TextBase.UNDEFINED_FONT_SIZE)
                }
                if (resultFormat.valign() !== fragment.format.valign()) {
                    resultFormat.setValign(VerticalAlignment.AlignUndefined)
                }
                column += fragCols
            }
        }
        if (!allBlocksEmpty) {
            return resultFormat
        }
        const defaultFormat = new CharFormat()
        defaultFormat.setStyle(this.m_text.propertyDefault(Pid.FONT_STYLE) as FontStyle)
        defaultFormat.setFontFamily(this.m_text.propertyDefault(Pid.FONT_FACE) as string)
        defaultFormat.setFontSize(this.m_text.propertyDefault(Pid.FONT_SIZE) as number)
        defaultFormat.setValign(this.m_text.propertyDefault(Pid.TEXT_SCRIPT_ALIGN) as VerticalAlignment)
        return defaultFormat
    }
}

// ---------------------------------------------------------
//   TextFragment
//    contains a styled text
// ---------------------------------------------------------

export class TextFragment {
    format = new CharFormat()
    pos = new PointF() // y is relative to TextBlock->y()
    text = ''

    constructor(s = '', cursor?: TextCursor) {
        this.text = s
        if (cursor) {
            this.format = cursor.format().clone()
        }
    }

    clone(): TextFragment {
        const f = new TextFragment(this.text)
        f.format = this.format.clone()
        f.pos = this.pos.clone()
        return f
    }

    equals(f: TextFragment): boolean { return this.format.equals(f.format) && this.text === f.text }

    split(column: number): TextFragment {
        let idx = 0
        let col = 0
        const f = new TextFragment()
        f.format = this.format.clone()
        for (let i = 0; i < this.text.length; ++i) {
            const c = this.text.charCodeAt(i)
            if (col === column) {
                if (idx) {
                    if (idx < this.text.length) {
                        f.text = this.text.substring(idx)
                        this.text = this.text.substring(0, idx)
                    }
                }
                return f
            }
            ++idx
            if (isHighSurrogate(c)) {
                continue
            }
            ++col
        }
        return f
    }

    columns(): number {
        let col = 0
        for (let i = 0; i < this.text.length; ++i) {
            if (!isHighSurrogate(this.text.charCodeAt(i))) {
                ++col
            }
        }
        return col
    }

    changeFormat(id: FormatId, data: FormatValue): void { this.format.setFormatValue(id, data) }

    font(t: TextBase): Font {
        const font = new Font()
        let m = this.format.fontSize()
        let spatiumScaling = 0.0
        if (t.isInstrumentName()) {
            spatiumScaling = (t as unknown as { largestStaffSpatium(): number }).largestStaffSpatium() / t.defaultSpatium()
        } else {
            spatiumScaling = t.spatium() / t.defaultSpatium()
        }
        if (t.sizeIsSpatiumDependent()) {
            m *= spatiumScaling
        }
        if (this.format.valign() !== VerticalAlignment.AlignNormal) {
            m *= SUBSCRIPT_SIZE
        }

        let family = ''
        let fontType = FontType.Unknown
        if (this.format.fontFamily() === 'ScoreText') {
            if (t.hasSymbolScale()) {
                family = engravingFonts().fontByName(t.style().styleSt(Sid.musicalSymbolFont)).family()
                fontType = FontType.MusicSymbol
                m = DEFAULT_SMUFL_POINT_SIZE()
                m *= t.getProperty(Pid.MUSICAL_SYMBOLS_SCALE) as number
                if (t.sizeIsSpatiumDependent()) {
                    m *= spatiumScaling
                }
                if (t.style().styleB(Sid.dynamicsOverrideFont)) {
                    family = engravingFonts().fontByName(t.style().styleSt(Sid.dynamicsFont)).family()
                }
                m *= t.mag()
            } else if (t.hasSymbolSize()) {
                family = t.style().styleSt(Sid.musicalTextFont)
                fontType = FontType.MusicSymbolText
                m = t.getProperty(Pid.MUSIC_SYMBOL_SIZE) as number
                if (t.sizeIsSpatiumDependent()) {
                    m *= spatiumScaling
                }
            }
            font.setFamily(family, fontType)
            font.setNoFontMerging(true)
            family = this.resolveFallback(fontType, new FontMetrics(font), family)
        } else {
            family = this.format.fontFamily()
            fontType = FontType.Unknown
            font.setBold(this.format.bold())
            font.setItalic(this.format.italic())
            font.setUnderline(this.format.underline())
            font.setStrike(this.format.strike())
        }

        font.setFamily(family, fontType)
        font.setPointSizeF(m * t.mag())
        return font
    }

    private resolveFallback(fontType: FontType, fm: FontMetrics, family: string): string {
        const missingChars: number[] = []
        for (const ch of this.text) {
            const v = ch.codePointAt(0)!
            if (!fm.inFont(v)) {
                missingChars.push(v)
            }
        }
        if (fontType === FontType.MusicSymbol) {
            const fallbackSymbolFM = new FontMetrics(new Font(FALLBACK_SYMBOL_FONT, FontType.MusicSymbol))
            for (const missingChar of missingChars) {
                if (fallbackSymbolFM.inFont(missingChar)) {
                    return FALLBACK_SYMBOL_FONT
                }
            }
        } else {
            const fallbackSymbolTextFM = new FontMetrics(new Font(FALLBACK_SYMBOLTEXT_FONT, FontType.MusicSymbolText))
            for (const missingChar of missingChars) {
                if (fallbackSymbolTextFM.inFont(missingChar)) {
                    return FALLBACK_SYMBOLTEXT_FONT
                }
            }
        }
        return family
    }
}

// ---------------------------------------------------------
//   TextBlock
//    represents a block of formatted text
// ---------------------------------------------------------

export class TextBlock {
    private m_fragments: TextFragment[] = []
    private m_y = 0.0
    private m_lineSpacing = 0.0
    private m_shape = new Shape()
    private m_eol = false

    clone(): TextBlock {
        const b = new TextBlock()
        b.m_fragments = this.m_fragments.map(f => f.clone())
        b.m_y = this.m_y
        b.m_lineSpacing = this.m_lineSpacing
        b.m_shape = this.m_shape.clone()
        b.m_eol = this.m_eol
        return b
    }

    fragments(): TextFragment[] { return this.m_fragments }
    setFragments(f: TextFragment[]): void { this.m_fragments = f }
    fragmentsWithoutEmpty(): TextFragment[] { return this.m_fragments.filter(x => x.text.length > 0) }

    shape(): Shape { return this.m_shape }
    boundingRect(): RectF { return this.m_shape.bbox() }

    columns(): number {
        let col = 0
        for (const f of this.m_fragments) {
            col += f.columns()
        }
        return col
    }

    insert(cursor: TextCursor, s: string): void {
        this.removeEmptyFragment() // since we are going to write text, we don't need an empty fragment to hold format info. if such exists, delete it
        const [i, rcol, ridx] = this.fragmentIdx(cursor.column())
        if (i < this.m_fragments.length) {
            const f = this.m_fragments[i]
            if (!f.format.equals(cursor.format())) {
                if (rcol === 0) {
                    this.m_fragments.splice(i, 0, new TextFragment(s, cursor))
                } else {
                    const f2 = f.split(rcol)
                    this.m_fragments.splice(i + 1, 0, new TextFragment(s, cursor), f2)
                }
            } else {
                f.text = f.text.substring(0, ridx) + s + f.text.substring(ridx)
            }
        } else {
            const last = this.m_fragments[this.m_fragments.length - 1]
            if (last && last.format.equals(cursor.format())) {
                last.text += s
            } else {
                this.m_fragments.push(new TextFragment(s, cursor))
            }
        }
    }

    /** used to preserve the Font size of the line (font info is held in TextFragments, see PR #5881) */
    insertEmptyFragmentIfNeeded(cursor: TextCursor): void {
        if (this.m_fragments.length === 0 || this.m_fragments[0].text.length === 0) {
            this.m_fragments.unshift(new TextFragment('', cursor))
        }
    }

    removeEmptyFragment(): void {
        if (this.m_fragments.length > 0 && this.m_fragments[0].text.length === 0) {
            this.m_fragments.pop() // sic, same as C++
        }
    }

    /** returns [fragment index, column in fragment, string index in fragment] */
    private fragmentIdx(column: number): [number, number, number] {
        let col = 0
        let rcol = 0
        let ridx = 0
        for (let it = 0; it < this.m_fragments.length; ++it) {
            rcol = 0
            ridx = 0
            const text = this.m_fragments[it].text
            for (let i = 0; i < text.length; ++i) {
                if (col === column) {
                    return [it, rcol, ridx]
                }
                ++ridx
                if (isHighSurrogate(text.charCodeAt(i))) {
                    continue
                }
                ++col
                ++rcol
            }
        }
        return [this.m_fragments.length, rcol, ridx]
    }

    fragment(column: number): TextFragment | null {
        if (this.m_fragments.length === 0) {
            return null
        }
        let col = 0
        for (const f of this.m_fragments) {
            for (let i = 0; i < f.text.length; ++i) {
                if (isHighSurrogate(f.text.charCodeAt(i))) {
                    continue
                }
                if (column === col) {
                    return f
                }
                ++col
            }
        }
        if (column === col) {
            return this.m_fragments[this.m_fragments.length - 1]
        }
        return null
    }

    formatAt(column: number): CharFormat | null {
        const f = this.fragment(column)
        return f ? f.format : null
    }

    xpos(column: number, t: TextBase): number {
        let col = 0
        for (const f of this.m_fragments) {
            if (column === col) {
                return f.pos.x()
            }
            const fm = new FontMetrics(f.font(t))
            let idx = 0
            for (let i = 0; i < f.text.length; ++i) {
                ++idx
                if (isHighSurrogate(f.text.charCodeAt(i))) {
                    continue
                }
                ++col
                if (column === col) {
                    return f.pos.x() + fm.width(f.text.substring(0, idx))
                }
            }
        }
        return this.m_shape.bbox().x()
    }

    y(): number { return this.m_y }
    setY(val: number): void { this.m_y = val }
    lineSpacing(): number { return this.m_lineSpacing }
    setLineSpacing(val: number): void { this.m_lineSpacing = val }
    eol(): boolean { return this.m_eol }
    setEol(val: boolean): void { this.m_eol = val }

    changeFormat(id: FormatId, data: FormatValue, start: number, n: number): void {
        let col = 0
        for (let i = 0; i < this.m_fragments.length; ++i) {
            const f = this.m_fragments[i]
            const columns = f.columns()
            if (start + n <= col) {
                if (columns === 0) {
                    f.changeFormat(id, data)
                }
                break
            }
            if (start >= col + columns) {
                col += columns
                continue
            }
            const endCol = col + columns
            if ((start <= col) && (start < endCol) && ((start + n) < endCol)) {
                // left
                const nf = f.split(start + n - col)
                f.changeFormat(id, data)
                this.m_fragments.splice(++i, 0, nf)
            } else if (start > col && ((start + n) < endCol)) {
                // middle
                const lf = f.split(start + n - col)
                const mf = f.split(start - col)
                mf.changeFormat(id, data)
                this.m_fragments.splice(++i, 0, mf)
                this.m_fragments.splice(++i, 0, lf)
            } else if (start > col) {
                // right
                const nf = f.split(start - col)
                nf.changeFormat(id, data)
                this.m_fragments.splice(++i, 0, nf)
            } else if (!(id === FormatId.FontFamily && f.format.fontFamily() === 'ScoreText')) {
                // complete fragment (leave the ScoreText family as is)
                f.changeFormat(id, data)
            }
            col = endCol
        }
    }

    text(col1: number, len: number, withFormat = false): string {
        let s = ''
        let col = 0
        const curSize = { v: 0 }
        const curFamily = { v: '' }
        for (const f of this.m_fragments) {
            if (f.text.length === 0) {
                continue
            }
            if (withFormat) {
                s += TextBase.getHtmlStartTag(f.format.fontSize(), curSize, f.format.fontFamily(), curFamily,
                    f.format.style(), f.format.valign())
            }
            for (let i = 0; i < f.text.length; ++i) {
                const c = f.text.charCodeAt(i)
                if (col >= col1 && (len < 0 || ((col - col1) < len))) {
                    if (f.format.fontFamily() === 'ScoreText' && withFormat) {
                        s += toSymbolXml(c)
                    } else {
                        s += xmlEscape(f.text[i])
                    }
                }
                if (!isHighSurrogate(c)) {
                    ++col
                }
            }
            if (withFormat) {
                s += TextBase.getHtmlEndTag(f.format.style(), f.format.valign())
            }
        }
        return s
    }
}

function toSymbolXml(c: number): string {
    const symId = engravingFonts().fallbackFont().fromCode(c)
    return `<sym>${SymNames.nameForSymId(symId)}</sym>`
}

function xmlEscape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseStringProperty(s: string): string {
    const i = s.indexOf('"')
    return i >= 0 ? s.substring(0, i) : s
}

function parseNumProperty(s: string): number {
    return parseFloat(parseStringProperty(s)) || 0
}

/** helper for genText(): keeps track of the open html tags */
class XmlNesting {
    private m_stack: string[] = []
    constructor(private m_s: { v: string }) {}

    empty(): boolean { return this.m_stack.length === 0 }

    pushToken(t: string): void {
        this.m_s.v += `<${t}>`
        this.m_stack.push(t)
    }

    popToken(t?: string): string {
        if (t === undefined) {
            const s = this.m_stack.pop()!
            this.m_s.v += `</${s}>`
            return s
        }
        const ps: string[] = []
        for (;;) {
            const s = this.popToken()
            if (s === t) {
                break
            }
            ps.push(s)
        }
        for (const s of ps) {
            this.pushToken(s)
        }
        return t
    }
}

// ---------------------------------------------------------
//   TextBase
// ---------------------------------------------------------

export class TextBaseLayoutData extends LayoutData {
    blocks: TextBlock[] = []
    layoutInvalid = true
    frame = new RectF()
    highResShape = new Shape()

    rows(): number { return this.blocks.length }
    textBlock(i: number): TextBlock { return this.blocks[i] }
}

export abstract class TextBase extends EngravingItem {
    static readonly UNDEFINED_FONT_FAMILY = 'Undefined'
    static readonly UNDEFINED_FONT_SIZE = -1.0

    protected m_layoutToParentWidth = false

    private m_isTextLinkedToMaster = true
    private m_align = new Align(AlignH.LEFT, AlignV.TOP)
    private m_position: AlignH = AlignH.LEFT
    private m_frameType = FrameType.NO_FRAME
    private m_textLineSpacing = 1.0
    private m_bgColor: Color = Color.transparent
    private m_frameColor: Color = Color.BLACK
    private m_frameWidth = new Spatium(0.1)
    private m_paddingWidth = new Spatium(0.2)
    private m_frameRound = new Spatium(0)
    private m_text = '' // cached
    private m_textInvalid = true
    private m_textStyleType: TextStyleType = TextStyleType.DEFAULT
    private m_symbolSize = 18.0
    private m_symbolScale = 1.0
    private m_cursor: TextCursor
    private m_voiceAssignment = VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
    private m_direction: DirectionV = DirectionV.AUTO
    private m_centerBetweenStaves: AutoOnOff = AutoOnOff.AUTO
    private m_anchorToEndOfPrevious = false

    protected constructor(type: ElementType, parent: EngravingObject | null, tid: TextStyleType = TextStyleType.DEFAULT,
                          f: number = ElementFlag.NOTHING) {
        super(type, parent, f | ElementFlag.MOVABLE)
        this.m_textStyleType = tid
        this.m_cursor = new TextCursor(this)
        this.m_cursor.init()
    }

    protected override createLayoutData(): TextBaseLayoutData { return new TextBaseLayoutData(this) }
    override ldata(): TextBaseLayoutData { return super.ldata() as TextBaseLayoutData }
    override mutldata(): TextBaseLayoutData { return super.ldata() as TextBaseLayoutData }

    isTextLinkedToMaster(): boolean { return this.m_isTextLinkedToMaster }
    setTextLinkedToMaster(v: boolean): void { this.m_isTextLinkedToMaster = v }

    align(): Align { return this.m_align }
    setAlign(a: Align): void { this.m_align = a }
    position(): AlignH { return this.m_position }
    setPosition(val: AlignH): void { this.m_position = val }

    static plainToXmlText(s: string): string { return xmlEscape(s) }
    setPlainText(t: string): void { this.setXmlText(TextBase.plainToXmlText(t)) }

    setXmlText(s: string): void {
        this.m_text = s
        this.m_textInvalid = false
        this.mutldata().layoutInvalid = true
    }

    checkCustomFormatting(s: string): void {
        if (s.includes('<font size')) {
            this.setPropertyFlags(Pid.FONT_SIZE, PropertyFlags.UNSTYLED)
        }
        if (s.includes('<b>') || s.includes('<i>') || s.includes('<u>') || s.includes('<s>')) {
            this.setPropertyFlags(Pid.FONT_STYLE, PropertyFlags.UNSTYLED)
        }
    }

    xmlText(): string {
        if (!this.m_textInvalid) {
            return this.m_text
        }
        return this.genTextFrom(this.ldata())
    }

    plainText(): string {
        let ldata = this.ldata()
        if (ldata.layoutInvalid) {
            ldata = new TextBaseLayoutData(this)
            this.createBlocks(ldata)
        }
        let s = ''
        for (const block of ldata.blocks) {
            for (const f of block.fragments()) {
                s += f.text
            }
            if (block.eol()) {
                s += '\n'
            }
        }
        return s
    }

    resetFormatting(): void {
        this.cursor().format().setFontFamily(this.propertyDefault(Pid.FONT_FACE) as string)
        this.cursor().format().setFontSize(this.propertyDefault(Pid.FONT_SIZE) as number)
        this.cursor().format().setStyle(this.propertyDefault(Pid.FONT_STYLE) as FontStyle)
        this.cursor().format().setValign(VerticalAlignment.AlignNormal)
    }

    lineSpacing(): number { return this.fontMetrics().lineSpacing() }
    lineHeight(): number { return this.fontMetrics().height() }
    override baseLine(): number { return this.fontMetrics().ascent() }

    empty(): boolean { return this.xmlText().length === 0 }
    clear(): void { this.setXmlText('') }

    fontStyle(): FontStyle { return this.m_cursor.format().style() }
    family(): string { return this.m_cursor.format().fontFamily() }
    size(): number { return this.m_cursor.format().fontSize() }

    setFontStyle(val: FontStyle): void {
        this.m_cursor.setFormat(FormatId.Bold, (val & FontStyle.Bold) !== 0)
        this.m_cursor.setFormat(FormatId.Italic, (val & FontStyle.Italic) !== 0)
        this.m_cursor.setFormat(FormatId.Underline, (val & FontStyle.Underline) !== 0)
        this.m_cursor.setFormat(FormatId.Strike, (val & FontStyle.Strike) !== 0)
    }

    setFamily(val: string): void { this.m_cursor.setFormat(FormatId.FontFamily, val) }
    setSize(val: number): void { this.m_cursor.setFormat(FormatId.FontSize, val) }

    setBold(val: boolean): void { this.setFontStyle(val ? (this.fontStyle() | FontStyle.Bold) : (this.fontStyle() & ~FontStyle.Bold)) }
    setItalic(val: boolean): void {
        this.setFontStyle(val ? (this.fontStyle() | FontStyle.Italic) : (this.fontStyle() & ~FontStyle.Italic))
    }
    setUnderline(val: boolean): void {
        this.setFontStyle(val ? (this.fontStyle() | FontStyle.Underline) : (this.fontStyle() & ~FontStyle.Underline))
    }
    setStrike(val: boolean): void {
        this.setFontStyle(val ? (this.fontStyle() | FontStyle.Strike) : (this.fontStyle() & ~FontStyle.Strike))
    }
    bold(): boolean { return (this.fontStyle() & FontStyle.Bold) !== 0 }
    italic(): boolean { return (this.fontStyle() & FontStyle.Italic) !== 0 }
    underline(): boolean { return (this.fontStyle() & FontStyle.Underline) !== 0 }
    strike(): boolean { return (this.fontStyle() & FontStyle.Strike) !== 0 }

    anchorToEndOfPrevious(): boolean { return this.m_anchorToEndOfPrevious }
    setAnchorToEndOfPrevious(v: boolean): void { this.m_anchorToEndOfPrevious = v }
    hasParentSegment(): boolean { return !!this.explicitParent() && this.parent()!.isSegment() }

    selectAll(cursor: TextCursor): void {
        const ldata = this.ldata()
        if (ldata.blocks.length === 0) {
            return
        }
        cursor.setSelectColumn(0)
        cursor.setSelectLine(0)
        cursor.setRow(ldata.rows() - 1)
        cursor.setColumn(cursor.curLine().columns())
    }

    static isSorted(r1: number, c1: number, r2: number, c2: number): boolean {
        if (r1 === r2) {
            return c1 <= c2
        }
        return r1 < r2
    }

    /** C++ sorts the references in place; here the sorted values are returned */
    static sort(r1: number, c1: number, r2: number, c2: number): [number, number, number, number] {
        if (!TextBase.isSorted(r1, c1, r2, c2)) {
            return [r2, c2, r1, c1]
        }
        return [r1, c1, r2, c2]
    }

    static unEscape(s: string): string {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&apos;/g, '\'')
            .replace(/&quot;/g, '"')
    }

    static escape(s: string): string {
        return s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;').replace(/'/g, '&apos;')
            .replace(/"/g, '&quot;')
    }

    override subtype(): number { return this.textStyleType() }

    font(): Font {
        let m = this.size()
        if (this.sizeIsSpatiumDependent()) {
            m *= this.spatium() / this.defaultSpatium()
        }
        const f = new Font(this.family(), FontType.Unknown)
        f.setPointSizeF(m)
        f.setBold(this.bold())
        f.setItalic(this.italic())
        if (this.underline()) {
            f.setUnderline(this.underline())
        }
        if (this.strike()) {
            f.setStrike(this.strike())
        }
        return f
    }

    fontMetrics(): FontMetrics { return new FontMetrics(this.font()) }

    cursor(): TextCursor { return this.m_cursor }
    setTextInvalid(): void { this.m_textInvalid = true }
    isTextInvalid(): boolean { return this.m_textInvalid }

    hasFrame(): boolean { return this.m_frameType !== FrameType.NO_FRAME }
    circle(): boolean { return this.m_frameType === FrameType.CIRCLE }
    square(): boolean { return this.m_frameType === FrameType.SQUARE }

    textStyleType(): TextStyleType { return this.m_textStyleType }
    setTextStyleType(id: TextStyleType): void { this.m_textStyleType = id }

    textColor(opt: PaintOptions = {}): Color { return this.curColor(opt) }
    frameType(): FrameType { return this.m_frameType }
    setFrameType(val: FrameType): void { this.m_frameType = val }
    textLineSpacing(): number { return this.m_textLineSpacing }
    setTextLineSpacing(val: number): void { this.m_textLineSpacing = val }
    bgColor(): Color { return this.m_bgColor }
    setBgColor(val: Color): void { this.m_bgColor = val }
    frameColor(): Color { return this.m_frameColor }
    setFrameColor(val: Color): void { this.m_frameColor = val }
    frameWidth(): Spatium { return this.m_frameWidth }
    setFrameWidth(val: Spatium): void { this.m_frameWidth = val }
    paddingWidth(): Spatium { return this.m_paddingWidth }
    setPaddingWidth(val: Spatium): void { this.m_paddingWidth = val }
    frameRound(): Spatium { return this.m_frameRound }
    setFrameRound(val: Spatium): void { this.m_frameRound = val }

    layoutToParentWidth(): boolean { return this.m_layoutToParentWidth }
    abstract positionRelativeToNoteheadRest(): boolean

    setVoiceAssignment(v: VoiceAssignment): void { this.m_voiceAssignment = v }
    voiceAssignment(): VoiceAssignment { return this.m_voiceAssignment }
    setDirection(v: DirectionV): void { this.m_direction = v }
    direction(): DirectionV { return this.m_direction }
    setCenterBetweenStaves(v: AutoOnOff): void { this.m_centerBetweenStaves = v }
    centerBetweenStaves(): AutoOnOff { return this.m_centerBetweenStaves }

    symbolSize(): number { return this.m_symbolSize }
    setSymbolSize(v: number): void { this.m_symbolSize = v }
    symbolScale(): number { return this.m_symbolScale }
    setSymbolScale(v: number): void { this.m_symbolScale = v }

    hasSymbolScale(): boolean {
        const p = this.parent()
        return this.isDynamic()
               || this.isStringTunings()
               || this.isPlayTechAnnotation()
               || (this.isHarpPedalDiagram() && (this as unknown as { isDiagram(): boolean }).isDiagram())
               || (!!p && p.isOttavaSegment())
               || (!!p && p.isTuplet())
               || (!!p && p.isPedalSegment())
    }

    hasSymbolSize(): boolean { return !this.hasSymbolScale() }

    // ---------------------------------------------------------
    //   createBlocks
    //    create text blocks from the xml text
    // ---------------------------------------------------------

    private insertChar(cursor: TextCursor, code: number, ldata: TextBaseLayoutData): void {
        if (cursor.row() >= ldata.blocks.length) {
            ldata.blocks.push(new TextBlock())
        }
        if (code === 0x09 /* \t */) {
            code = 0x20
        }
        if (cursor.row() < ldata.blocks.length) {
            ldata.blocks[cursor.row()].insert(cursor, String.fromCodePoint(code))
        }
        cursor.setColumn(cursor.column() + 1)
        cursor.clearSelection()
    }

    createBlocks(ldata: TextBaseLayoutData = this.mutldata()): void {
        ldata.blocks = []
        const cursor = this.m_cursor.clone()
        cursor.setRow(0)
        cursor.setColumn(0)
        let state = 0
        let token = ''
        let sym = ''
        let symState = false
        const text = this.m_text

        for (let i = 0; i < text.length; i++) {
            const c = text[i]
            if (state === 0) {
                if (c === '<') {
                    state = 1
                    token = ''
                } else if (c === '&') {
                    state = 2
                    token = ''
                } else if (c === '\n') {
                    if (ldata.rows() <= cursor.row()) {
                        ldata.blocks.push(new TextBlock())
                    }
                    if (cursor.row() < ldata.rows()) {
                        if (ldata.blocks[cursor.row()].fragments().length === 0) {
                            ldata.blocks[cursor.row()].insertEmptyFragmentIfNeeded(cursor) // used to preserve the Font size of the line (font info is held in TextFragments, see PR #5881)
                        }
                        ldata.blocks[cursor.row()].setEol(true)
                    }
                    cursor.setRow(cursor.row() + 1)
                    cursor.setColumn(0)
                    if (ldata.rows() <= cursor.row()) {
                        ldata.blocks.push(new TextBlock())
                    }
                    if (cursor.row() < ldata.rows()) {
                        if (ldata.blocks[cursor.row()].fragments().length === 0) {
                            ldata.blocks[cursor.row()].insertEmptyFragmentIfNeeded(cursor) // an empty fragment may be needed on either side of the newline
                        }
                    }
                } else if (symState) {
                    sym += c
                } else {
                    const code = text.codePointAt(i)!
                    if (code > 0xFFFF) {
                        i++
                    }
                    this.insertChar(cursor, code, ldata)
                }
            } else if (state === 1) {
                if (c === '>') {
                    state = 0
                    this.prepareFormatCursor(token, cursor)
                    if (token === 'sym') {
                        symState = true
                        sym = ''
                    } else if (token === '/sym') {
                        symState = false
                        const id = SymNames.symIdByName(sym)
                        if (id !== SymId.noSym) {
                            const fmt = cursor.format().clone() // save format
                            const code = id === SymId.space ? 0x20 : engravingFonts().fallbackFont().symCode(id)
                            cursor.format().setFontFamily('ScoreText')
                            this.insertChar(cursor, code, ldata)
                            cursor.setFormatObj(fmt) // restore format
                        }
                    }
                } else {
                    token += c
                }
            } else if (state === 2) {
                if (c === ';') {
                    state = 0
                    if (token === 'lt') {
                        this.insertChar(cursor, 0x3C, ldata)
                    } else if (token === 'gt') {
                        this.insertChar(cursor, 0x3E, ldata)
                    } else if (token === 'amp') {
                        this.insertChar(cursor, 0x26, ldata)
                    } else if (token === 'quot') {
                        this.insertChar(cursor, 0x22, ldata)
                    } else if (token.startsWith('#')) {
                        // numeric character references are resolved by the xml reader in C++
                        const code = token[1] === 'x' ? parseInt(token.substring(2), 16) : parseInt(token.substring(1), 10)
                        if (!isNaN(code)) {
                            this.insertChar(cursor, code, ldata)
                        }
                    }
                } else {
                    token += c
                }
            }
        }
        if (ldata.blocks.length === 0) {
            ldata.blocks.push(new TextBlock())
        }
        ldata.layoutInvalid = false
    }

    prepareFormat(token: string, format: CharFormat): boolean {
        if (token === 'b') {
            format.setBold(true)
            return true
        } else if (token === '/b') {
            format.setBold(false)
        } else if (token === 'i') {
            format.setItalic(true)
            return true
        } else if (token === '/i') {
            format.setItalic(false)
        } else if (token === 'u') {
            format.setUnderline(true)
            return true
        } else if (token === '/u') {
            format.setUnderline(false)
        } else if (token === 's') {
            format.setStrike(true)
            return true
        } else if (token === '/s') {
            format.setStrike(false)
        } else if (token === 'sub') {
            format.setValign(VerticalAlignment.AlignSubScript)
        } else if (token === '/sub') {
            format.setValign(VerticalAlignment.AlignNormal)
        } else if (token === 'sup') {
            format.setValign(VerticalAlignment.AlignSuperScript)
        } else if (token === '/sup') {
            format.setValign(VerticalAlignment.AlignNormal)
        } else if (token.startsWith('font ')) {
            const remainder = token.substring(5)
            if (remainder.startsWith('size="')) {
                format.setFontSize(parseNumProperty(remainder.substring(6)))
                return true
            } else if (remainder.startsWith('face="')) {
                let face = parseStringProperty(remainder.substring(6))
                face = TextBase.unEscape(face)
                format.setFontFamily(face)
                return true
            }
        }
        return false
    }

    private prepareFormatCursor(token: string, cursor: TextCursor): void {
        if (this.prepareFormat(token, cursor.format()) && cursor.format().fontFamily() !== this.propertyDefault(Pid.FONT_FACE)) {
            this.setPropertyFlags(Pid.FONT_FACE, PropertyFlags.UNSTYLED)
        }
    }

    layoutFrame(ldata: TextBaseLayoutData = this.mutldata()): void {
        if (ldata.bbox().width() <= 1.0 || ldata.bbox().height() < 1.0) { // or bbox.width() <= 1.0
            // this does not work for Harmony:
            const fm = new FontMetrics(this.font())
            const ch = fm.ascent()
            const cw = fm.width('n')
            ldata.frame = new RectF(0.0, -ch, cw, ch)
        } else {
            ldata.frame = ldata.bbox().clone()
        }

        if (this.square()) {
            // make sure width >= height
            if (ldata.frame.height() > ldata.frame.width()) {
                const w = ldata.frame.height() - ldata.frame.width()
                ldata.frame.adjust(-w * 0.5, 0.0, w * 0.5, 0.0)
            }
        } else if (this.circle()) {
            if (ldata.frame.width() > ldata.frame.height()) {
                ldata.frame.setTop(ldata.frame.y() + (ldata.frame.width() - ldata.frame.height()) * -0.5)
                ldata.frame.setHeight(ldata.frame.width())
            } else {
                ldata.frame.setLeft(ldata.frame.x() + (ldata.frame.height() - ldata.frame.width()) * -0.5)
                ldata.frame.setWidth(ldata.frame.height())
            }
        }
        const sp = this.spatium()
        // C++ computes frameWidth() * .5f in float precision
        let w = (this.paddingWidth().val() + Math.fround(this.frameWidth().val() * Math.fround(0.5))) * sp
        ldata.frame.adjust(-w, -w, w, w)
        w = 0.5 * this.frameWidth().val() * sp
        ldata.setBbox(ldata.frame.adjusted(-w, -w, w, w))
    }

    // ---------------------------------------------------------
    //   genText
    // ---------------------------------------------------------

    private genTextFrom(ldata: TextBaseLayoutData): string {
        const text = { v: '' }
        const xmlNesting = new XmlNesting(text)

        let fmt = new CharFormat()
        fmt.setFontFamily(this.propertyDefault(Pid.FONT_FACE) as string)
        fmt.setFontSize(this.propertyDefault(Pid.FONT_SIZE) as number)
        fmt.setStyle(this.propertyDefault(Pid.FONT_STYLE) as FontStyle)

        let bold_ = false
        let italic_ = false
        let underline_ = false
        let strike_ = false
        for (const block of ldata.blocks) {
            for (const f of block.fragments()) {
                if (!f.format.bold() && fmt.bold()) {
                    bold_ = true
                }
                if (!f.format.italic() && fmt.italic()) {
                    italic_ = true
                }
                if (!f.format.underline() && fmt.underline()) {
                    underline_ = true
                }
                if (!f.format.strike() && fmt.strike()) {
                    strike_ = true
                }
            }
        }
        if (bold_) {
            xmlNesting.pushToken('b')
        }
        if (italic_) {
            xmlNesting.pushToken('i')
        }
        if (underline_) {
            xmlNesting.pushToken('u')
        }
        if (strike_) {
            xmlNesting.pushToken('s')
        }

        for (const block of ldata.blocks) {
            for (const f of block.fragments()) {
                const format = f.format
                if (fmt.bold() !== format.bold()) {
                    if (format.bold()) {
                        xmlNesting.pushToken('b')
                    } else {
                        xmlNesting.popToken('b')
                    }
                }
                if (fmt.italic() !== format.italic()) {
                    if (format.italic()) {
                        xmlNesting.pushToken('i')
                    } else {
                        xmlNesting.popToken('i')
                    }
                }
                if (fmt.underline() !== format.underline()) {
                    if (format.underline()) {
                        xmlNesting.pushToken('u')
                    } else {
                        xmlNesting.popToken('u')
                    }
                }
                if (fmt.strike() !== format.strike()) {
                    if (format.strike()) {
                        xmlNesting.pushToken('s')
                    } else {
                        xmlNesting.popToken('s')
                    }
                }
                if (format.fontSize() !== fmt.fontSize()) {
                    text.v += `<font size="${format.fontSize()}"/>`
                }
                if (format.fontFamily() !== 'ScoreText' && format.fontFamily() !== fmt.fontFamily()) {
                    text.v += `<font face="${TextBase.escape(format.fontFamily())}"/>`
                }
                const va = format.valign()
                const cva = fmt.valign()
                if (cva !== va) {
                    switch (va) {
                    case VerticalAlignment.AlignNormal:
                        xmlNesting.popToken(cva === VerticalAlignment.AlignSuperScript ? 'sup' : 'sub')
                        break
                    case VerticalAlignment.AlignSuperScript:
                        xmlNesting.pushToken('sup')
                        break
                    case VerticalAlignment.AlignSubScript:
                        xmlNesting.pushToken('sub')
                        break
                    default:
                        break
                    }
                }
                if (format.fontFamily() === 'ScoreText') {
                    for (let i = 0; i < f.text.length; ++i) {
                        text.v += toSymbolXml(f.text.charCodeAt(i))
                    }
                } else {
                    text.v += xmlEscape(f.text)
                }
                fmt = format.clone()
            }
            if (block.eol()) {
                text.v += '\n'
            }
        }
        while (!xmlNesting.empty()) {
            xmlNesting.popToken()
        }
        return text.v
    }

    genText(): void {
        this.m_text = this.genTextFrom(this.ldata())
        this.m_textInvalid = false
    }

    static getHtmlStartTag(newSize: number, curSize: { v: number }, newFamily: string, curFamily: { v: string },
                           style: FontStyle, vAlign: VerticalAlignment): string {
        let s = ''
        if (Math.abs(newSize - curSize.v) > 0.1) {
            curSize.v = newSize
            s += `<font size="${newSize}"/>`
        }
        if (newFamily !== curFamily.v && newFamily !== 'ScoreText') {
            curFamily.v = newFamily
            s += `<font face="${newFamily}"/>`
        }
        if (style & FontStyle.Bold) {
            s += '<b>'
        }
        if (style & FontStyle.Italic) {
            s += '<i>'
        }
        if (style & FontStyle.Underline) {
            s += '<u>'
        }
        if (style & FontStyle.Strike) {
            s += '<s>'
        }
        if (vAlign === VerticalAlignment.AlignSubScript) {
            s += '<sub>'
        } else if (vAlign === VerticalAlignment.AlignSuperScript) {
            s += '<sup>'
        }
        return s
    }

    static getHtmlEndTag(style: FontStyle, vAlign: VerticalAlignment): string {
        let s = ''
        if (vAlign === VerticalAlignment.AlignSubScript) {
            s += '</sub>'
        } else if (vAlign === VerticalAlignment.AlignSuperScript) {
            s += '</sup>'
        }
        if (style & FontStyle.Strike) {
            s += '</s>'
        }
        if (style & FontStyle.Underline) {
            s += '</u>'
        }
        if (style & FontStyle.Italic) {
            s += '</i>'
        }
        if (style & FontStyle.Bold) {
            s += '</b>'
        }
        return s
    }

    hasCustomFormatting(): boolean {
        const fmt = new CharFormat()
        fmt.setFontFamily(this.family())
        fmt.setFontSize(this.size())
        fmt.setStyle(this.fontStyle())
        fmt.setValign(VerticalAlignment.AlignNormal)
        for (const block of this.ldata().blocks) {
            for (const f of block.fragments()) {
                if (f.text.length === 0) { // skip empty fragments, not to
                    continue // insert extra HTML formatting
                }
                const format = f.format
                if (fmt.style() !== format.style() || format.fontSize() !== fmt.fontSize()
                    || format.fontFamily() !== fmt.fontFamily() || fmt.valign() !== format.valign()) {
                    return true
                }
            }
        }
        return false
    }

    // ---------------------------------------------------------
    //   properties
    // ---------------------------------------------------------

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TEXT_STYLE: return this.textStyleType()
        case Pid.FONT_FACE: return this.m_cursor.selectedFragmentsFormat().fontFamily()
        case Pid.FONT_SIZE: return this.m_cursor.selectedFragmentsFormat().fontSize()
        case Pid.FONT_STYLE: return this.m_cursor.selectedFragmentsFormat().style()
        case Pid.TEXT_LINE_SPACING: return this.textLineSpacing()
        case Pid.FRAME_TYPE: return this.frameType()
        case Pid.FRAME_WIDTH: return this.frameWidth()
        case Pid.FRAME_PADDING: return this.paddingWidth()
        case Pid.FRAME_ROUND: return this.frameRound()
        case Pid.FRAME_FG_COLOR: return this.frameColor()
        case Pid.FRAME_BG_COLOR: return this.bgColor()
        case Pid.ALIGN: return this.align()
        case Pid.POSITION: return this.position()
        case Pid.TEXT_SCRIPT_ALIGN: return this.m_cursor.selectedFragmentsFormat().valign()
        case Pid.TEXT: return this.xmlText()
        case Pid.TEXT_LINKED_TO_MASTER: return this.isTextLinkedToMaster()
        case Pid.DIRECTION: return this.direction()
        case Pid.CENTER_BETWEEN_STAVES: return this.centerBetweenStaves()
        case Pid.VOICE_ASSIGNMENT: return this.voiceAssignment()
        case Pid.MUSIC_SYMBOL_SIZE: return this.symbolSize()
        case Pid.MUSICAL_SYMBOLS_SCALE: return this.symbolScale()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(pid: Pid, v: PropertyValue): boolean {
        if (this.m_textInvalid && this.ldata().isValid()) {
            this.genText()
        }
        let rv = true
        switch (pid) {
        case Pid.COLOR:
            if (this.color().equals(this.frameColor())) {
                this.setFrameColor(v as Color)
            }
            super.setProperty(pid, v)
            break
        case Pid.TEXT_STYLE:
            this.initTextStyleType(v as TextStyleType)
            break
        case Pid.FONT_FACE:
            this.setFamily(v as string)
            break
        case Pid.FONT_SIZE:
            this.setSize(v as number)
            break
        case Pid.FONT_STYLE:
            this.setFontStyle(v as FontStyle)
            break
        case Pid.TEXT_LINE_SPACING:
            this.setTextLineSpacing(v as number)
            break
        case Pid.FRAME_TYPE:
            this.setFrameType(v as FrameType)
            break
        case Pid.FRAME_WIDTH:
            this.setFrameWidth(v as Spatium)
            break
        case Pid.FRAME_PADDING:
            this.setPaddingWidth(v as Spatium)
            break
        case Pid.FRAME_ROUND:
            this.setFrameRound(v as Spatium)
            break
        case Pid.FRAME_FG_COLOR:
            this.setFrameColor(v as Color)
            break
        case Pid.FRAME_BG_COLOR:
            this.setBgColor(v as Color)
            break
        case Pid.TEXT:
            this.setXmlText(v as string)
            break
        case Pid.ALIGN:
            this.setAlign(v as Align)
            break
        case Pid.POSITION:
            this.setPosition(v as AlignH)
            break
        case Pid.TEXT_SCRIPT_ALIGN:
            this.m_cursor.setFormat(FormatId.Valign, v as number)
            break
        case Pid.TEXT_LINKED_TO_MASTER:
            this.setTextLinkedToMaster(!!v)
            break
        case Pid.DIRECTION:
            this.setDirection(v as DirectionV)
            break
        case Pid.CENTER_BETWEEN_STAVES:
            this.setCenterBetweenStaves(v as AutoOnOff)
            break
        case Pid.VOICE_ASSIGNMENT:
            this.setVoiceAssignment(v as VoiceAssignment)
            break
        case Pid.MUSIC_SYMBOL_SIZE:
            this.setSymbolSize(v as number)
            break
        case Pid.MUSICAL_SYMBOLS_SCALE:
            this.setSymbolScale(v as number)
            break
        default:
            rv = super.setProperty(pid, v)
            break
        }
        return rv
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.Z) {
            return super.propertyDefault(id)
        }
        if (this.composition()) {
            const v = this.explicitParent()!.propertyDefault(id)
            if (v !== undefined) {
                return v
            }
        }
        const sid = this.getPropertyStyle(id)
        if (sid !== Sid.NOSTYLE) {
            return this.styleValue(id, sid)
        }
        switch (id) {
        case Pid.TEXT_STYLE: return TextStyleType.DEFAULT
        case Pid.TEXT: return ''
        case Pid.TEXT_SCRIPT_ALIGN: return VerticalAlignment.AlignNormal
        case Pid.TEXT_LINKED_TO_MASTER: return true
        case Pid.DIRECTION: return DirectionV.AUTO
        case Pid.CENTER_BETWEEN_STAVES: return AutoOnOff.AUTO
        case Pid.VOICE_ASSIGNMENT: return VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
        default:
            for (const p of textStyle(TextStyleType.DEFAULT)!) {
                if (p.pid === id) {
                    return this.styleValue(id, p.sid)
                }
            }
        }
        return super.propertyDefault(id)
    }

    protected override getPropertyFlagsIdx(id: Pid): number {
        let i = 0
        for (const p of this.m_elementStyle) {
            if (p.pid === id) {
                return i
            }
            ++i
        }
        for (const p of textStyle(this.textStyleType())!) {
            if (p.pid === id) {
                return i
            }
            ++i
        }
        return -1
    }

    private offsetSid(): Sid {
        const defaultTid = this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType
        if (this.textStyleType() !== defaultTid) {
            return Sid.NOSTYLE
        }
        const above = this.placeAbove()
        switch (this.textStyleType()) {
        case TextStyleType.DYNAMICS: return above ? Sid.dynamicsPosAbove : Sid.dynamicsPosBelow
        case TextStyleType.EXPRESSION: return above ? Sid.expressionPosAbove : Sid.expressionPosBelow
        case TextStyleType.LYRICS_ODD:
        case TextStyleType.LYRICS_EVEN: return above ? Sid.lyricsPosAbove : Sid.lyricsPosBelow
        case TextStyleType.REHEARSAL_MARK: return above ? Sid.rehearsalMarkPosAbove : Sid.rehearsalMarkPosBelow
        case TextStyleType.STAFF: return above ? Sid.staffTextPosAbove : Sid.staffTextPosBelow
        case TextStyleType.STICKING: return above ? Sid.stickingPosAbove : Sid.stickingPosBelow
        case TextStyleType.SYSTEM: return above ? Sid.systemTextPosAbove : Sid.systemTextPosBelow
        case TextStyleType.TEMPO: return above ? Sid.tempoPosAbove : Sid.tempoPosBelow
        case TextStyleType.MEASURE_NUMBER: return above ? Sid.measureNumberPosAbove : Sid.measureNumberPosBelow
        case TextStyleType.MEASURE_NUMBER_ALTERNATE:
            return above ? Sid.measureNumberAlternatePosAbove : Sid.measureNumberAlternatePosBelow
        case TextStyleType.MMREST_RANGE: return above ? Sid.mmRestRangePosAbove : Sid.mmRestRangePosBelow
        default:
            break
        }
        return Sid.NOSTYLE
    }

    override getPropertyStyle(id: Pid): Sid {
        if (id === Pid.OFFSET) {
            const sid = this.offsetSid()
            if (sid !== Sid.NOSTYLE) {
                return sid
            }
        }
        for (const p of this.m_elementStyle) {
            if (p.pid === id) {
                return p.sid
            }
        }
        for (const p of textStyle(this.textStyleType())!) {
            if (p.pid === id) {
                return p.sid
            }
        }
        return Sid.NOSTYLE
    }

    override styleChanged(): void {
        let i = 0
        for (const spp of this.m_elementStyle) {
            if (this.m_propertyFlagsList[i] === PropertyFlags.STYLED) {
                this.setProperty(spp.pid, this.styleValue(spp.pid, this.getPropertyStyle(spp.pid)))
            }
            ++i
        }
        for (const spp of textStyle(this.textStyleType())!) {
            if (this.m_propertyFlagsList[i] === PropertyFlags.STYLED) {
                this.setProperty(spp.pid, this.styleValue(spp.pid, this.getPropertyStyle(spp.pid)))
            }
            ++i
        }
    }

    override initElementStyle(ss: ElementStyle): void {
        this.m_elementStyle = ss
        const n = ss.length + textStyle(TextStyleType.DEFAULT)!.length
        this.m_propertyFlagsList = new Array<PropertyFlags>(n).fill(PropertyFlags.STYLED)
        for (const p of this.m_elementStyle) {
            this.setProperty(p.pid, this.styleValue(p.pid, p.sid))
        }
        for (const p of textStyle(this.textStyleType())!) {
            this.setProperty(p.pid, this.styleValue(p.pid, p.sid))
        }
    }

    initTextStyleType(tid: TextStyleType, preserveDifferent = false): void {
        if (preserveDifferent) {
            if (this.ldata().layoutInvalid) {
                this.createBlocks()
            }
            const hadCustomFragments = this.hasCustomFormatting()
            this.setTextStyleType(tid)
            for (const p of textStyle(tid)!) {
                const isFragmentStyle = p.pid === Pid.FONT_FACE || p.pid === Pid.FONT_SIZE || p.pid === Pid.FONT_STYLE
                if (isFragmentStyle && hadCustomFragments) {
                    continue
                }
                if (propertyValueEquals(this.getProperty(p.pid), this.propertyDefault(p.pid))) {
                    this.setProperty(p.pid, this.styleValue(p.pid, p.sid))
                }
            }
            return
        }

        const TEXT_LINE_PID_MAP: [Pid, Pid][] = [
            [Pid.FONT_FACE, Pid.BEGIN_FONT_FACE],
            [Pid.FONT_SIZE, Pid.BEGIN_FONT_SIZE],
            [Pid.FONT_STYLE, Pid.BEGIN_FONT_STYLE],
            [Pid.ALIGN, Pid.BEGIN_TEXT_ALIGN],
            [Pid.POSITION, Pid.BEGIN_TEXT_POSITION],
        ]
        const getTextPID = (p: Pid): Pid => {
            const isTextLine = !!this.parent() && this.parent()!.isTextLineBaseSegment()
            for (const [textPid, textLinePid] of TEXT_LINE_PID_MAP) {
                if (p === textLinePid || p === textPid) {
                    return isTextLine ? textLinePid : textPid
                }
            }
            return p
        }
        this.setTextStyleType(tid)
        for (const p of textStyle(tid)!) {
            this.setProperty(getTextPID(p.pid), this.styleValue(p.pid, p.sid))
        }
    }
}

function propertyValueEquals(a: PropertyValue, b: PropertyValue): boolean {
    if (a === b) {
        return true
    }
    if (a && b && typeof a === 'object' && 'equals' in a && typeof (a as { equals: unknown }).equals === 'function') {
        return (a as { equals(o: unknown): boolean }).equals(b)
    }
    return false
}
