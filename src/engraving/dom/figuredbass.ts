/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/figuredbass.h/.cpp (FiguredBass, FiguredBassItem, FiguredBassFont, Score::addFiguredBass)
 *
 * NOTE ON ARCHITECTURE (see the C++ header): FiguredBass elements are stored in the annotations of a Segment. A FiguredBass
 * contains its duration (ticks) and a list of FiguredBassItem elements (one per line: prefix, digit, suffix, continuation
 * line and 5 parentheses). If all lines can be parsed, the items are laid out and drawn; otherwise the element is drawn as
 * plain text.
 */

import type { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, VOICES, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { textStyle } from '../style/textstyle'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { XmlReader } from '../rw/xmlreader'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType, type Segment } from './segment'
import { TextBase, TextBaseLayoutData, isTextNavigationKey, textBaseRenderer } from './textbase'
import { KeyboardKey, KeyboardModifier, type EditData } from '../editing/editdata'

export const FBIDigitNone = -1

export enum FiguredBassModifier {
    NONE = 0,
    DOUBLEFLAT,
    FLAT,
    NATURAL,
    SHARP,
    DOUBLESHARP,
    CROSS,
    BACKSLASH,
    SLASH,
    NUMOF,
}

export enum FiguredBassParenthesis {
    NONE = 0,
    ROUNDOPEN,
    ROUNDCLOSED,
    SQUAREDOPEN,
    SQUAREDCLOSED,
    NUMOF,
}

export enum FiguredBassContLine {
    NONE = 0,
    SIMPLE, // cont. line stops at f.b. element end
    EXTENDED, // cont. line joins with next element, if possible
}

export enum FiguredBassStyle {
    MODERN = 0,
    HISTORIC,
    NUMOF,
}

export enum FiguredBassCombination {
    SIMPLE = 0,
    CROSSED,
    BACKSLASHED,
    SLASHED,
    NUMOF,
}

const figuredBassStyle: ElementStyle = [
    { sid: Sid.figuredBassMinDistance, pid: Pid.MIN_DISTANCE },
]

const figuredBassTextStyle: ElementStyle = [
    { sid: Sid.figuredBassFontFace, pid: Pid.FONT_FACE },
    { sid: Sid.figuredBassFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.figuredBassFontStyle, pid: Pid.FONT_STYLE },
]

/** C++ undo/score hooks used by FiguredBass::regenerateText (startCmd/endCmd are in editing/cmd.ts) */
export const figuredBassHooks: {
    startCmd: ((score: EngravingObject, name: TranslatableString) => void) | null
    endCmd: ((score: EngravingObject) => void) | null
} = { startCmd: null, endCmd: null }

//---------------------------------------------------------
//   F I G U R E D   B A S S   I T E M
//---------------------------------------------------------

export class FiguredBassItemLayoutData extends LayoutData {
    displayText = '' // the constructed display text (read-only)
    textWidth = 0.0 // the text width (in raster units)
}

// used for indexed access to parenthesis chars
// (these is no normAccidToChar[], as accidentals may use mult. chars in normalized display):
const NORM_PARENTH_TO_CHAR = ['', '(', ')', '[', ']']

export class FiguredBassItem extends EngravingItem {
    private m_ord = 0 // the line ordinal of this element in the FB stack
    // the parts making a FiguredBassItem up
    private m_prefix = FiguredBassModifier.NONE // the accidental coming before the body
    private m_digit = FBIDigitNone // the main digit (if present)
    private m_suffix = FiguredBassModifier.NONE // the accidental coming after the body
    private m_contLine = FiguredBassContLine.NONE // whether the item has continuation line or not
    // each of the parenthesis: before, between and after parts
    private m_parenth: FiguredBassParenthesis[] = [
        FiguredBassParenthesis.NONE, FiguredBassParenthesis.NONE, FiguredBassParenthesis.NONE, FiguredBassParenthesis.NONE,
        FiguredBassParenthesis.NONE,
    ]

    constructor(parent: FiguredBass | null, line = 0) {
        super(ElementType.FIGURED_BASS_ITEM, parent)
        this.m_ord = line
    }

    protected override createLayoutData(): FiguredBassItemLayoutData { return new FiguredBassItemLayoutData(this) }
    override ldata(): FiguredBassItemLayoutData { return super.ldata() as FiguredBassItemLayoutData }
    override mutldata(): FiguredBassItemLayoutData { return super.ldata() as FiguredBassItemLayoutData }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_parenth = [...original.m_parenth]
    }

    figuredBass(): FiguredBass { return this.explicitParent() as unknown as FiguredBass }

    ord(): number { return this.m_ord }

    prefix(): FiguredBassModifier { return this.m_prefix }
    setPrefix(v: FiguredBassModifier): void { this.m_prefix = v }

    digit(): number { return this.m_digit }
    setDigit(val: number): void { this.m_digit = val }

    suffix(): FiguredBassModifier { return this.m_suffix }
    setSuffix(v: FiguredBassModifier): void { this.m_suffix = v }

    contLine(): FiguredBassContLine { return this.m_contLine }
    setContLine(v: FiguredBassContLine): void { this.m_contLine = v }

    parenth1(): FiguredBassParenthesis { return this.m_parenth[0] }
    parenth2(): FiguredBassParenthesis { return this.m_parenth[1] }
    parenth3(): FiguredBassParenthesis { return this.m_parenth[2] }
    parenth4(): FiguredBassParenthesis { return this.m_parenth[3] }
    parenth5(): FiguredBassParenthesis { return this.m_parenth[4] }

    setParenth1(v: FiguredBassParenthesis): void { this.m_parenth[0] = v }
    setParenth2(v: FiguredBassParenthesis): void { this.m_parenth[1] = v }
    setParenth3(v: FiguredBassParenthesis): void { this.m_parenth[2] = v }
    setParenth4(v: FiguredBassParenthesis): void { this.m_parenth[3] = v }
    setParenth5(v: FiguredBassParenthesis): void { this.m_parenth[4] = v }

    //---------------------------------------------------------
    //   FiguredBassItem parse()
    //
    // converts a string into a property-based representation, if possible;
    // return true on success | false if the string is non-conformant
    //---------------------------------------------------------

    parse(text: { s: string }): boolean {
        this.parseParenthesis(text, 0)
        let retVal = this.parsePrefixSuffix(text, true) // prefix
        if (retVal === -1) {
            return false
        }
        this.parseParenthesis(text, 1)
        retVal = this.parseDigit(text) // digit
        if (retVal === -1) {
            return false
        }
        this.parseParenthesis(text, 2)
        retVal = this.parsePrefixSuffix(text, false) // suffix
        if (retVal === -1) {
            return false
        }
        this.parseParenthesis(text, 3)
        // check for a possible cont. line symbol(s)
        this.m_contLine = FiguredBassContLine.NONE // contLine
        if (text.s.length && (text.s[0] === '-' || text.s[0] === '_')) { // 1 symbol: simple continuation
            this.m_contLine = FiguredBassContLine.SIMPLE
            text.s = text.s.substring(1)
        }
        while (text.s.length && (text.s[0] === '-' || text.s[0] === '_')) { // more than 1 symbol: extended continuation
            this.m_contLine = FiguredBassContLine.EXTENDED
            text.s = text.s.substring(1)
        }
        this.parseParenthesis(text, 4)

        // remove useless parentheses, moving external parentheses toward central digit element
        if (this.m_prefix === FiguredBassModifier.NONE && this.m_parenth[1] === FiguredBassParenthesis.NONE) {
            this.m_parenth[1] = this.m_parenth[0]
            this.m_parenth[0] = FiguredBassParenthesis.NONE
        }
        if (this.m_digit === FBIDigitNone && this.m_parenth[2] === FiguredBassParenthesis.NONE) {
            this.m_parenth[2] = this.m_parenth[1]
            this.m_parenth[1] = FiguredBassParenthesis.NONE
        }
        if (this.m_contLine === FiguredBassContLine.NONE && this.m_parenth[3] === FiguredBassParenthesis.NONE) {
            this.m_parenth[3] = this.m_parenth[4]
            this.m_parenth[4] = FiguredBassParenthesis.NONE
        }
        if (this.m_suffix === FiguredBassModifier.NONE && this.m_parenth[2] === FiguredBassParenthesis.NONE) {
            this.m_parenth[2] = this.m_parenth[3]
            this.m_parenth[3] = FiguredBassParenthesis.NONE
        }

        // some checks:
        // if some extra input, str is not conformant
        if (text.s.length) {
            return false
        }
        // can't have BOTH prefix and suffix
        // prefix, digit, suffix and cont.line cannot be ALL empty
        // suffix cannot combine with empty digit
        if ((this.m_prefix !== FiguredBassModifier.NONE && this.m_suffix !== FiguredBassModifier.NONE)
            || (this.m_prefix === FiguredBassModifier.NONE && this.m_digit === FBIDigitNone && this.m_suffix === FiguredBassModifier.NONE
                && this.m_contLine === FiguredBassContLine.NONE)
            || ((this.m_suffix === FiguredBassModifier.CROSS || this.m_suffix === FiguredBassModifier.BACKSLASH
                 || this.m_suffix === FiguredBassModifier.SLASH)
                && this.m_digit === FBIDigitNone)) {
            return false
        }
        return true
    }

    //---------------------------------------------------------
    //   FiguredBassItem parsePrefixSuffix()
    //
    //    scans str to extract prefix or suffix properties. Stops at the first char which cannot fit.
    //    Fitting chars are removed from str. DOES NOT generate any display text
    //
    // returns the number of Chars read from str or -1 if prefix / suffix has an illegal format
    // (no prefix / suffix at all IS legal)
    //---------------------------------------------------------

    private parsePrefixSuffix(text: { s: string }, bPrefix: boolean): number {
        // C++ Modifier* dest = bPrefix ? &m_prefix : &m_suffix
        const dest = (): FiguredBassModifier => (bPrefix ? this.m_prefix : this.m_suffix)
        const set = (v: FiguredBassModifier): void => {
            if (bPrefix) {
                this.m_prefix = v
            } else {
                this.m_suffix = v
            }
        }
        let done = false
        const size = text.s.length
        text.s = text.s.trim()

        set(FiguredBassModifier.NONE)

        while (text.s.length) {
            switch (text.s[0]) {
            case 'b':
                if (dest() !== FiguredBassModifier.NONE) {
                    if (dest() === FiguredBassModifier.FLAT) { // FLAT may double a previous FLAT
                        set(FiguredBassModifier.DOUBLEFLAT)
                    } else {
                        return -1 // but no other combination is acceptable
                    }
                } else {
                    set(FiguredBassModifier.FLAT)
                }
                break
            case 'h':
                if (dest() !== FiguredBassModifier.NONE) { // cannot combine with any other accidental
                    return -1
                }
                set(FiguredBassModifier.NATURAL)
                break
            case '#':
                if (dest() !== FiguredBassModifier.NONE) {
                    if (dest() === FiguredBassModifier.SHARP) { // SHARP may double a previous SHARP
                        set(FiguredBassModifier.DOUBLESHARP)
                    } else {
                        return -1 // but no other combination is acceptable
                    }
                } else {
                    set(FiguredBassModifier.SHARP)
                }
                break
            case '+':
                // accept '+' as both a prefix and a suffix for harmony notation
                if (dest() !== FiguredBassModifier.NONE) { // cannot combine with any other accidental
                    return -1
                }
                set(FiguredBassModifier.CROSS)
                break
            // '\\' and '/' go into the suffix
            case '\\':
                if (this.m_suffix !== FiguredBassModifier.NONE) { // cannot combine with any other accidental
                    return -1
                }
                this.m_suffix = FiguredBassModifier.BACKSLASH
                break
            case '/':
                if (this.m_suffix !== FiguredBassModifier.NONE) { // cannot combine with any other accidental
                    return -1
                }
                this.m_suffix = FiguredBassModifier.SLASH
                break
            default: // any other char: no longer in prefix/suffix
                done = true
                break
            }
            if (done) {
                break
            }
            text.s = text.s.substring(1) // 'eat' the char and continue
        }

        return size - text.s.length // return how many chars we had read into prefix/suffix
    }

    //---------------------------------------------------------
    //   FiguredBassItem parseDigit()
    //
    //    scans str to extract digit properties. Stops at the first char which cannot belong to digit part.
    //    Fitting chars are removed from str. DOES NOT generate any display text
    //
    // returns the number of Chars read from str or -1 if no legal digit can be constructed
    // (no digit at all IS legal)
    //---------------------------------------------------------

    private parseDigit(text: { s: string }): number {
        const size = text.s.length
        text.s = text.s.trim()

        this.m_digit = FBIDigitNone

        while (text.s.length) {
            // any digit acceptable
            if (text.s[0] >= '0' && text.s[0] <= '9') {
                if (this.m_digit === FBIDigitNone) {
                    this.m_digit = 0
                }
                this.m_digit = this.m_digit * 10 + (text.s.charCodeAt(0) - 48)
                text.s = text.s.substring(1)
            } else {
                // anything else: no longer in digit part
                break
            }
        }

        return size - text.s.length
    }

    //---------------------------------------------------------
    //   FiguredBassItem parseParenthesis()
    //
    //    scans str to extract a (possible) parenthesis, stores its code into parenth[parenthIdx]
    //    and removes it from str. Only looks at first str char.
    //
    // returns the number of Chars read from str (actually 0 or 1).
    //---------------------------------------------------------

    private parseParenthesis(text: { s: string }, parenthIdx: number): number {
        if (!text.s.length) {
            return 0
        }

        const c = text.s[0]
        let code = FiguredBassParenthesis.NONE
        switch (c) {
        case '(':
            code = FiguredBassParenthesis.ROUNDOPEN
            break
        case ')':
            code = FiguredBassParenthesis.ROUNDCLOSED
            break
        case '[':
            code = FiguredBassParenthesis.SQUAREDOPEN
            break
        case ']':
            code = FiguredBassParenthesis.SQUAREDCLOSED
            break
        default:
            break
        }
        this.m_parenth[parenthIdx] = code
        if (code !== FiguredBassParenthesis.NONE) {
            text.s = text.s.substring(1)
            return 1
        }
        return 0
    }

    //---------------------------------------------------------
    //   FiguredBassItem normalizedText()
    //
    // returns a string with the normalized text, i.e. the text displayed while editing;
    // this is a standard textual representation of the item properties
    //---------------------------------------------------------

    normalizedText(): string {
        let str = ''
        if (this.m_parenth[0] !== FiguredBassParenthesis.NONE) {
            str += NORM_PARENTH_TO_CHAR[this.m_parenth[0]]
        }

        if (this.m_prefix !== FiguredBassModifier.NONE) {
            switch (this.m_prefix) {
            case FiguredBassModifier.FLAT: str += 'b'; break
            case FiguredBassModifier.NATURAL: str += 'h'; break
            case FiguredBassModifier.SHARP: str += '#'; break
            case FiguredBassModifier.CROSS: str += '+'; break
            case FiguredBassModifier.DOUBLEFLAT: str += 'bb'; break
            case FiguredBassModifier.DOUBLESHARP: str += '##'; break
            default: break
            }
        }

        if (this.m_parenth[1] !== FiguredBassParenthesis.NONE) {
            str += NORM_PARENTH_TO_CHAR[this.m_parenth[1]]
        }

        // digit
        if (this.m_digit !== FBIDigitNone) {
            str += String(this.m_digit)
        }

        if (this.m_parenth[2] !== FiguredBassParenthesis.NONE) {
            str += NORM_PARENTH_TO_CHAR[this.m_parenth[2]]
        }

        // suffix
        if (this.m_suffix !== FiguredBassModifier.NONE) {
            switch (this.m_suffix) {
            case FiguredBassModifier.FLAT: str += 'b'; break
            case FiguredBassModifier.NATURAL: str += 'h'; break
            case FiguredBassModifier.SHARP: str += '#'; break
            case FiguredBassModifier.CROSS: str += '+'; break
            case FiguredBassModifier.BACKSLASH: str += '\\'; break
            case FiguredBassModifier.SLASH: str += '/'; break
            case FiguredBassModifier.DOUBLEFLAT: str += 'bb'; break
            case FiguredBassModifier.DOUBLESHARP: str += '##'; break
            default: break
            }
        }

        if (this.m_parenth[3] !== FiguredBassParenthesis.NONE) {
            str += NORM_PARENTH_TO_CHAR[this.m_parenth[3]]
        }
        if (this.m_contLine > FiguredBassContLine.NONE) {
            str += '_'
            if (this.m_contLine > FiguredBassContLine.SIMPLE) {
                str += '_'
            }
        }
        if (this.m_parenth[4] !== FiguredBassParenthesis.NONE) {
            str += NORM_PARENTH_TO_CHAR[this.m_parenth[4]]
        }

        return str
    }

    //---------------------------------------------------------
    //   PROPERTY METHODS
    //---------------------------------------------------------

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.FBPREFIX: return this.m_prefix
        case Pid.FBDIGIT: return this.m_digit
        case Pid.FBSUFFIX: return this.m_suffix
        case Pid.FBCONTINUATIONLINE: return this.m_contLine
        case Pid.FBPARENTHESIS1: return this.m_parenth[0]
        case Pid.FBPARENTHESIS2: return this.m_parenth[1]
        case Pid.FBPARENTHESIS3: return this.m_parenth[2]
        case Pid.FBPARENTHESIS4: return this.m_parenth[3]
        case Pid.FBPARENTHESIS5: return this.m_parenth[4]
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        const val = v as number
        const parenthIdx = [Pid.FBPARENTHESIS1, Pid.FBPARENTHESIS2, Pid.FBPARENTHESIS3, Pid.FBPARENTHESIS4, Pid.FBPARENTHESIS5]
            .indexOf(propertyId)
        switch (propertyId) {
        case Pid.FBPREFIX:
            if (val < FiguredBassModifier.NONE || val >= FiguredBassModifier.NUMOF) {
                return false
            }
            this.m_prefix = val
            break
        case Pid.FBDIGIT:
            if (val < 1 || val > 9) {
                return false
            }
            this.m_digit = val
            break
        case Pid.FBSUFFIX:
            if (val < FiguredBassModifier.NONE || val >= FiguredBassModifier.NUMOF) {
                return false
            }
            this.m_suffix = val
            break
        case Pid.FBCONTINUATIONLINE:
            this.m_contLine = val
            break
        case Pid.FBPARENTHESIS1:
        case Pid.FBPARENTHESIS2:
        case Pid.FBPARENTHESIS3:
        case Pid.FBPARENTHESIS4:
        case Pid.FBPARENTHESIS5:
            if (val < FiguredBassParenthesis.NONE || val >= FiguredBassParenthesis.NUMOF) {
                return false
            }
            this.m_parenth[parenthIdx] = val
            break
        default:
            return super.setProperty(propertyId, v)
        }
        this.triggerLayout()
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.FBPREFIX:
        case Pid.FBSUFFIX:
            return FiguredBassModifier.NONE
        case Pid.FBDIGIT:
            return FBIDigitNone
        case Pid.FBCONTINUATIONLINE:
            return FiguredBassContLine.NONE
        default:
            return super.propertyDefault(id)
        }
    }

    private regenerateDisplayText(): void {
        // re-generate displayText
        textBaseRenderer.layoutItem(this)
    }

    //---------------------------------------------------------
    //   UNDOABLE PROPERTY SETTERS
    //---------------------------------------------------------

    undoSetPrefix(pref: FiguredBassModifier): void {
        if (pref <= FiguredBassModifier.CROSS) {
            this.undoChangeProperty(Pid.FBPREFIX, pref)
            // if setting some prefix and there is a suffix already, clear suffix
            if (pref !== FiguredBassModifier.NONE && this.m_suffix !== FiguredBassModifier.NONE) {
                this.undoChangeProperty(Pid.FBSUFFIX, FiguredBassModifier.NONE)
            }
            this.regenerateDisplayText()
        }
    }

    undoSetDigit(digit: number): void {
        if (digit >= 0 && digit <= 9) {
            this.undoChangeProperty(Pid.FBDIGIT, digit)
            this.regenerateDisplayText()
        }
    }

    undoSetSuffix(suff: FiguredBassModifier): void {
        this.undoChangeProperty(Pid.FBSUFFIX, suff)
        // if setting some suffix and there is a prefix already, clear prefix
        if (suff !== FiguredBassModifier.NONE && this.m_prefix !== FiguredBassModifier.NONE) {
            this.undoChangeProperty(Pid.FBPREFIX, FiguredBassModifier.NONE)
        }
        this.regenerateDisplayText()
    }

    undoSetContLine(val: FiguredBassContLine): void {
        this.undoChangeProperty(Pid.FBCONTINUATIONLINE, val)
        this.regenerateDisplayText()
    }

    undoSetParenth(idx: number, par: FiguredBassParenthesis): void {
        const pids = [Pid.FBPARENTHESIS1, Pid.FBPARENTHESIS2, Pid.FBPARENTHESIS3, Pid.FBPARENTHESIS4, Pid.FBPARENTHESIS5]
        this.undoChangeProperty(pids[idx], par)
        this.regenerateDisplayText()
    }

    undoSetParenth1(par: FiguredBassParenthesis): void { this.undoSetParenth(0, par) }
    undoSetParenth2(par: FiguredBassParenthesis): void { this.undoSetParenth(1, par) }
    undoSetParenth3(par: FiguredBassParenthesis): void { this.undoSetParenth(2, par) }
    undoSetParenth4(par: FiguredBassParenthesis): void { this.undoSetParenth(3, par) }
    undoSetParenth5(par: FiguredBassParenthesis): void { this.undoSetParenth(4, par) }

    startsWithParenthesis(): boolean {
        if (this.m_prefix !== FiguredBassModifier.NONE) {
            return this.m_parenth[0] !== FiguredBassParenthesis.NONE
        }
        if (this.m_digit !== FBIDigitNone) {
            return this.m_parenth[1] !== FiguredBassParenthesis.NONE
        }
        if (this.m_suffix !== FiguredBassModifier.NONE) {
            return this.m_parenth[2] !== FiguredBassParenthesis.NONE
        }
        return false
    }
}

//---------------------------------------------------------
//   FiguredBassFont
//---------------------------------------------------------

export class FiguredBassFont {
    family = ''
    displayName = ''
    defPitch = 0.0
    defLineHeight = 0.0
    displayAccidental: string[] = new Array<string>(FiguredBassModifier.NUMOF).fill('')
    displayParenthesis: string[] = new Array<string>(FiguredBassParenthesis.NUMOF).fill('')
    // [style][digit][combination]
    displayDigit: string[][][] = Array.from({ length: FiguredBassStyle.NUMOF },
        () => Array.from({ length: 10 }, () => new Array<string>(FiguredBassCombination.NUMOF).fill('')))

    read(e: XmlReader): boolean {
        const first = (s: string): string => (s.length ? String.fromCodePoint(s.codePointAt(0)!) : '\0')
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'family') {
                this.family = e.readText()
            } else if (tag === 'displayName') {
                this.displayName = e.readText()
            } else if (tag === 'defaultPitch') {
                this.defPitch = e.readDouble()
            } else if (tag === 'defaultLineHeight') {
                this.defLineHeight = e.readDouble()
            } else if (tag === 'parenthesisRoundOpen') {
                this.displayParenthesis[1] = first(e.readText())
            } else if (tag === 'parenthesisRoundClosed') {
                this.displayParenthesis[2] = first(e.readText())
            } else if (tag === 'parenthesisSquareOpen') {
                this.displayParenthesis[3] = first(e.readText())
            } else if (tag === 'parenthesisSquareClosed') {
                this.displayParenthesis[4] = first(e.readText())
            } else if (tag === 'doubleflat') {
                this.displayAccidental[FiguredBassModifier.DOUBLEFLAT] = first(e.readText())
            } else if (tag === 'flat') {
                this.displayAccidental[FiguredBassModifier.FLAT] = first(e.readText())
            } else if (tag === 'natural') {
                this.displayAccidental[FiguredBassModifier.NATURAL] = first(e.readText())
            } else if (tag === 'sharp') {
                this.displayAccidental[FiguredBassModifier.SHARP] = first(e.readText())
            } else if (tag === 'doublesharp') {
                this.displayAccidental[FiguredBassModifier.DOUBLESHARP] = first(e.readText())
            } else if (tag === 'cross') {
                this.displayAccidental[FiguredBassModifier.CROSS] = first(e.readText())
            } else if (tag === 'backslash') {
                this.displayAccidental[FiguredBassModifier.BACKSLASH] = first(e.readText())
            } else if (tag === 'slash') {
                this.displayAccidental[FiguredBassModifier.SLASH] = first(e.readText())
            } else if (tag === 'digit') {
                const digit = e.intAttribute('value')
                if (digit < 0 || digit > 9) {
                    return false
                }
                const MODERN = FiguredBassStyle.MODERN
                const HISTORIC = FiguredBassStyle.HISTORIC
                const C = FiguredBassCombination
                while (e.readNextStartElement()) {
                    const t = e.name()
                    if (t === 'simple') {
                        this.displayDigit[MODERN][digit][C.SIMPLE] = first(e.readText())
                    } else if (t === 'crossed') {
                        this.displayDigit[MODERN][digit][C.CROSSED] = first(e.readText())
                    } else if (t === 'backslashed') {
                        this.displayDigit[MODERN][digit][C.BACKSLASHED] = first(e.readText())
                    } else if (t === 'slashed') {
                        this.displayDigit[MODERN][digit][C.SLASHED] = first(e.readText())
                    } else if (t === 'simpleHistoric') {
                        this.displayDigit[HISTORIC][digit][C.SIMPLE] = first(e.readText())
                    } else if (t === 'crossedHistoric') {
                        this.displayDigit[HISTORIC][digit][C.CROSSED] = first(e.readText())
                    } else if (t === 'backslashedHistoric') {
                        this.displayDigit[HISTORIC][digit][C.BACKSLASHED] = first(e.readText())
                    } else if (t === 'slashedHistoric') {
                        this.displayDigit[HISTORIC][digit][C.SLASHED] = first(e.readText())
                    } else {
                        e.unknown()
                        return false
                    }
                }
            } else {
                e.unknown()
                return false
            }
        }
        this.displayParenthesis[0] = this.displayAccidental[FiguredBassModifier.NONE] = ' '
        return true
    }
}

let g_FBFonts: FiguredBassFont[] = []

//---------------------------------------------------------
//   F I G U R E D   B A S S
//---------------------------------------------------------

export class FiguredBassLayoutData extends TextBaseLayoutData {
    lineLengths: number[] = [] // lengths of duration indicator lines (in raster units)
    printedLineLength = 0.0 // the length of lines actually printed (i.e. continuation lines)

    lineLength(idx: number): number {
        if (idx < this.lineLengths.length) {
            return this.lineLengths[idx]
        }
        return 0.0
    }
}

export class FiguredBass extends TextBase {
    static readonly FB_CONTLINE_HEIGHT = 0.875 // the % of font EM to raise the cont. line at (0 = top of font; 1 = bottom of font)
    static readonly FB_CONTLINE_LEFT_PADDING = 0.1875 // (3/16sp) the blank space at the left of a cont. line (in sp)
    static readonly FB_CONTLINE_OVERLAP = 0.125 // (1/8sp)  the overlap of an extended cont. line (in sp)
    static readonly FB_CONTLINE_THICKNESS = 0.09375 // (3/32sp) the thickness of a cont. line (in sp)

    private m_items: FiguredBassItem[] = [] // the individual lines of the F.B.
    private m_onNote = true // true if this element is on a staff note | false if it is between notes
    private m_ticks = new Fraction(0, 1) // the duration (used for cont. lines and for multiple F.B. under the same note)

    constructor(parent: EngravingObject | null) {
        super(ElementType.FIGURED_BASS, parent, undefined, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(figuredBassStyle)
        // figured bass inherits from TextBase for layout purposes
        // but there is no specific text style to use as a basis for styled properties
        // (this is true for historical reasons due to the special layout of figured bass)
        // override the styled property definitions
        for (const p of textStyle(this.textStyleType()) ?? []) {
            this.setPropertyFlags(p.pid, PropertyFlags.NOSTYLE)
        }
        for (const p of figuredBassTextStyle) {
            this.setPropertyFlags(p.pid, PropertyFlags.STYLED)
            this.setProperty(p.pid, this.styleValue(p.pid, p.sid))
        }
        this.setOnNote(true)
        this.setTicks(new Fraction(0, 1))
        this.m_items = []
    }

    protected override createLayoutData(): FiguredBassLayoutData { return new FiguredBassLayoutData(this) }
    override ldata(): FiguredBassLayoutData { return super.ldata() as FiguredBassLayoutData }
    override mutldata(): FiguredBassLayoutData { return super.ldata() as FiguredBassLayoutData }

    /** C++ copy constructor: deep copy of the items */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_items = []
        for (const i of original.m_items) {
            const fbi = i.clone() as FiguredBassItem
            fbi.setParent(this)
            this.m_items.push(fbi)
        }
    }

    static FBFonts(): readonly FiguredBassFont[] { return g_FBFonts }

    createItem(line: number): FiguredBassItem { return new FiguredBassItem(this, line) }

    override getPropertyStyle(id: Pid): Sid {
        // do not use TextBase::getPropertyStyle
        // as most text style properties do not apply
        for (const p of figuredBassTextStyle) {
            if (p.pid === id) {
                return p.sid
            }
        }
        return EngravingItem.prototype.getPropertyStyle.call(this as unknown as EngravingItem, id)
    }

    override setSelected(flag: boolean): void {
        super.setSelected(flag)
        for (const item of this.m_items) {
            item.setSelected(flag)
        }
    }

    override setVisible(flag: boolean): void {
        super.setVisible(flag)
        for (const item of this.m_items) {
            item.setVisible(flag)
        }
    }

    override startEdit(ed: EditData): void {
        this.clearItems()
        textBaseRenderer.layoutText1(this as unknown as TextBase) // re-layout without F.B.-specific formatting.
        super.startEdit(ed)
    }

    override isEditAllowed(ed: EditData): boolean {
        if (isTextNavigationKey(ed.key, ed.modifiers)) {
            return false
        }

        if ((ed.key === KeyboardKey.Key_Left || ed.key === KeyboardKey.Key_Right) && (ed.modifiers & KeyboardModifier.ControlModifier)) {
            return false
        }

        return super.isEditAllowed(ed)
    }

    override endEdit(ed: EditData): void {
        super.endEdit(ed)
        this.regenerateText()
    }

    regenerateText(): void {
        // as the standard text editor keeps inserting spurious HTML formatting and styles
        // retrieve and work only on the plain text
        const txt = this.plainText()
        if (!txt.length) { // if no text, nothing to do
            return
        }

        // split text into lines and create an item for each line
        const list = txt.split('\n').filter(s => s.length > 0)
        this.clearItems()
        let normalizedText = ''
        let idx = 0
        for (const str of list) {
            const pItem = new FiguredBassItem(this, idx++)
            if (!pItem.parse({ s: str })) { // if any item fails parsing
                this.clearItems()
                // TODO: this `startCmd` call is possibly invalid
                figuredBassHooks.startCmd?.(this.score(), new TranslatableString('undoableAction', 'Regenerate figured bass text'))
                this.triggerLayout()
                figuredBassHooks.endCmd?.(this.score())
                return
            }
            this.addItemToLinked(pItem)

            // add item normalized text
            if (normalizedText.length) {
                normalizedText += '\n'
            }
            normalizedText += pItem.normalizedText()
        }
        // if all items parsed and text is styled, replaced entered text with normalized text
        if (this.m_items.length) {
            this.undoChangeProperty(Pid.TEXT, normalizedText)
        }

        // TODO: this `startCmd` call is possibly invalid
        figuredBassHooks.startCmd?.(this.score(), new TranslatableString('undoableAction', 'Regenerate figured bass text'))
        this.triggerLayout()
        figuredBassHooks.endCmd?.(this.score())
    }

    onNote(): boolean { return this.m_onNote }
    setOnNote(val: boolean): void { this.m_onNote = val }
    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }
    ticks(): Fraction { return this.m_ticks }
    setTicks(v: Fraction): void { this.m_ticks = v }

    //---------------------------------------------------------
    //   nextFiguredBass
    //
    //    returns the next *contiguous* FiguredBass element if it exists,
    //    i.e. the FiguredBass element which starts where 'this' ends
    //    returns 0 if none
    //---------------------------------------------------------

    nextFiguredBass(): FiguredBass | null {
        if (this.m_ticks.le(new Fraction(0, 1))) { // if _ticks unset, no clear idea of when 'this' ends
            return null
        }
        const nextTick = this.segment()!.tick().plus(this.m_ticks) // the tick beyond this' duration

        // locate the ChordRest segment right after this' end
        const nextSegm = this.score().tick2segment(nextTick, true, SegmentType.ChordRest)
        if (!nextSegm) {
            return null
        }

        // scan segment annotations for an existing FB element in the this' staff
        for (const e of nextSegm.annotations()) {
            if (e.isFiguredBass() && e.track() === this.track()) {
                return e as unknown as FiguredBass
            }
        }

        return null
    }

    //---------------------------------------------------------
    //   additionalContLineX
    //
    //    if there is a continuation line, without other text elements, at pagePosY, returns its X coord (in page coords)
    //    returns 0 if no cont.line there or if there are text elements before the cont.line
    //
    //    In practice, returns the X coord of a cont. line which can be the continuation of a previous cont. line
    //
    //    Note: pagePosY is the Y coord of the FiguredBassItem containing the line, not of the line itself,
    //    as line position might depend on styles.
    //---------------------------------------------------------

    additionalContLineX(pagePosY: number): number {
        const pgPos: PointF = this.pagePos()
        for (const fbi of this.m_items) {
            // if item has cont.line but nothing before it
            // and item Y coord near enough to pagePosY
            if (fbi.contLine() !== FiguredBassContLine.NONE
                && fbi.digit() === FBIDigitNone
                && fbi.prefix() === FiguredBassModifier.NONE
                && fbi.suffix() === FiguredBassModifier.NONE
                && fbi.parenth4() === FiguredBassParenthesis.NONE
                && Math.abs(pgPos.y() + fbi.ldata().pos().y() - pagePosY) < 0.05) {
                return pgPos.x() + fbi.ldata().pos().x()
            }
        }

        return 0.0 // no suitable line
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.TEXT_LINKED_TO_MASTER) {
            if (super.setProperty(propertyId, v)) {
                this.regenerateText()
                return true
            }
            return false
        }
        return super.setProperty(propertyId, v)
    }

    override positionRelativeToNoteheadRest(): boolean { return true }

    itemsCount(): number { return this.m_items.length }
    appendItem(item: FiguredBassItem): void { this.m_items.push(item) }
    items(): readonly FiguredBassItem[] { return this.m_items }

    clearItems(): void {
        for (const linkedObject of this.linkList()) {
            if (!linkedObject || !linkedObject.isFiguredBass()) {
                continue
            }
            if (linkedObject === this) {
                this.m_items = []
            } else {
                const isThisTextLinked = this.getProperty(Pid.TEXT_LINKED_TO_MASTER) as boolean
                const isOtherTextLinked = (linkedObject as unknown as FiguredBass).getProperty(Pid.TEXT_LINKED_TO_MASTER) as boolean
                if ((this.score().isMaster() && !isOtherTextLinked)
                    || (!this.score().isMaster() && !isThisTextLinked)) {
                    continue
                }
                const linkedFb = linkedObject as unknown as FiguredBass
                linkedFb.m_items = []
            }
        }
    }

    addItemToLinked(item: FiguredBassItem): void {
        for (const linkedObject of this.linkList()) {
            if (!linkedObject || !linkedObject.isFiguredBass()) {
                continue
            }
            const linkedScore = linkedObject.score()
            if (linkedObject === this) {
                item.setTrack(this.track())
                item.setParent(this)
                this.m_items.push(item)
                this.score().doUndoAddElement(item)
            } else {
                const isThisTextLinked = this.getProperty(Pid.TEXT_LINKED_TO_MASTER) as boolean
                const isOtherTextLinked = (linkedObject as unknown as FiguredBass).getProperty(Pid.TEXT_LINKED_TO_MASTER) as boolean
                if ((this.score().isMaster() && !isOtherTextLinked)
                    || (!this.score().isMaster() && !isThisTextLinked)) {
                    continue
                }
                const linkedFb = linkedObject as unknown as FiguredBass
                const itemClone = item.clone() as FiguredBassItem

                itemClone.linkTo(item)
                itemClone.setTrack(linkedFb.track())
                itemClone.setParent(linkedFb)
                itemClone.setScore(linkedFb.score())
                linkedFb.appendItem(itemClone)
                linkedScore.doUndoAddElement(itemClone)
            }
        }
    }

    //---------------------------------------------------------
    //   STATIC FUNCTION
    //    adding a new FiguredBass to a Segment;
    //    the main purpose of this function is to ensure that ONLY ONE F.b. element exists for each Segment/staff;
    //    it either re-uses an existing FiguredBass or creates a new one if none is found;
    //    returns the FiguredBass and sets pNew to true if it has been newly created.
    //
    //    Sets an initial duration of the element up to the next ChordRest of the same staff.
    //
    //    As the F.b. very concept requires the base chord to have ONLY ONE note,
    //    FiguredBass elements are created and looked for only in the first track of the staff.
    //---------------------------------------------------------

    static addFiguredBassToSegment(seg: Segment, track: track_idx_t, extTicks: Fraction): { fb: FiguredBass | null; isNew: boolean } {
        let endTick: Fraction // where this FB is initially assumed to end
        const staff = Math.trunc(track / VOICES) // convert track to staff
        track = staff * VOICES // first track for this staff
        let isNew = false

        // scan segment annotations for an existing FB element in the same staff
        let fb: FiguredBass | null = null
        for (const e of seg.annotations()) {
            if (e.isFiguredBass() && Math.trunc(e.track() / VOICES) === staff) {
                // an FB already exists in segment: re-use it
                fb = e as unknown as FiguredBass
                isNew = false
                endTick = seg.tick().plus(fb.ticks())
                break
            }
        }
        if (!fb) { // no FB at segment: create new
            fb = new FiguredBass(seg) // C++ Factory::createFiguredBass(seg)
            fb.setTrack(track)
            fb.setParent(seg)

            // locate next SegChordRest in the same staff to estimate presumed duration of element
            endTick = Fraction.max()
            for (let iVoice = 0; iVoice < VOICES; iVoice++) {
                const nextSegm = seg.nextCR(track + iVoice)
                if (nextSegm && nextSegm.tick().lt(endTick)) {
                    endTick = nextSegm.tick()
                }
            }
            if (endTick.eq(Fraction.max())) { // no next segment: set up to score end
                const meas = seg.score().lastMeasure()!
                endTick = meas.endTick()
            }
            fb.setTicks(endTick.minus(seg.tick()))

            // set onNote status
            fb.setOnNote(false) // assume not onNote
            for (let i = track; i < track + VOICES; i++) { // if segment has chord in staff, set onNote
                const el = seg.element(i)
                if (el && el.isChord()) {
                    fb.setOnNote(true)
                    break
                }
            }
            isNew = true
        }

        // if we are extending a previous FB
        if (extTicks.gt(new Fraction(0, 1))) {
            // locate previous FB for same staff
            let prevFB: FiguredBass | null = null
            for (let prevSegm = seg.prev1(CHORD_REST_OR_TIME_TICK_TYPE); prevSegm; prevSegm = prevSegm.prev1(CHORD_REST_OR_TIME_TICK_TYPE)) {
                for (const e of prevSegm.annotations()) {
                    if (e.isFiguredBass() && e.track() === track) {
                        prevFB = e as unknown as FiguredBass // previous FB found
                        break
                    }
                }
                if (prevFB) {
                    // if previous FB did not stop more than extTicks before this FB...
                    const delta = seg.tick().minus(prevFB.segment()!.tick())
                    if (prevFB.ticks().plus(extTicks).ge(delta)) {
                        prevFB.setTicks(delta) // update prev FB ticks to last up to this FB
                    }
                    break
                }
            }
        }
        return { fb, isNew }
    }

    //---------------------------------------------------------
    //   Read Configuration File
    //
    //    C++ readConfigFile(): reads the built-in fonts/fonts_figuredbass.xml (given as content) and resets everything
    //---------------------------------------------------------

    static readConfigFile(xml: string | Uint8Array): boolean {
        g_FBFonts = []
        let text = typeof xml === 'string' ? xml : new TextDecoder().decode(xml)
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.substring(1)
        }
        const e = new XmlReader(text)
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'font') {
                        const f = new FiguredBassFont()
                        if (f.read(e)) {
                            g_FBFonts.push(f)
                        } else {
                            return false
                        }
                    } else {
                        e.unknown()
                    }
                }
                return true
            }
        }
        return false
    }

    static fontNames(): string[] {
        return g_FBFonts.map(f => f.displayName)
    }

    static fontData(nIdx: number): { family: string; displayName: string; size: number; lineHeight: number } | null {
        if (nIdx >= 0 && nIdx < g_FBFonts.length) {
            const f = g_FBFonts[nIdx]
            return { family: f.family, displayName: f.displayName, size: f.defPitch, lineHeight: f.defLineHeight }
        }
        return null
    }

    //---------------------------------------------------------
    //   hasParentheses
    //
    //   return true if any FiguredBassItem starts with a parenthesis
    //---------------------------------------------------------

    /** C++ FiguredBass::parenthesesMode() (hides EngravingItem::parenthesesMode(): renamed) */
    hasParentheses(): boolean {
        for (const item of this.m_items) {
            if (item.startsWithParenthesis()) {
                return true
            }
        }
        return false
    }
}
