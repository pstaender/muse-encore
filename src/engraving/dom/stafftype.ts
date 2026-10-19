/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafftype.h/.cpp and stafftypelist.h/.cpp
 *
 * TabDurationSymbol is in tabdurationsymbol.ts.
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { Color } from '../../framework/draw/types/color'
import { Font, FontType } from '../../framework/draw/types/font'
import { FontMetrics } from '../../framework/draw/fontmetrics'
import type { PointF, RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import { DurationType, FontStyle, INVALID_FRET_INDEX, NoteHeadScheme, StaffGroup, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'
import { DefaultStyle } from '../style/defaultstyle'
import { textStyle, TextStylePropertyType } from '../style/textstyle'
import { XmlReader } from '../rw/xmlreader'

export const NUM_OF_DIGITFRETS = 100 // the max fret number which can be rendered with numbers
export const NUM_OF_LETTERFRETS = 17 // the max fret number which can be rendered with letters
export const NUM_OF_BASSSTRING_SLASHES = 5 // the max number of slashes supported for French bass strings notation
// the max number of bass strings frettable with letter notation (French)
const NUM_OF_BASSSTRINGS_WITH_LETTER = 4
// the max number of bass strings frettable with number notation (Italian)
const NUM_OF_BASSSTRINGS_WITH_NUMBER = 2
export const STAFFTYPE_TAB_BASSSLASH_YOFFSET = 0.33 // the vertical offset of the bass string slashes (sp)

// all values in sp
export const GRID_BEAM_DEF_WIDTH = 0.25
export const GRID_STEM_DEF_HEIGHT = 1.75
export const GRID_STEM_DEF_WIDTH = 0.125

const TAB_DEFAULT_DUR_YOFFS = -1.0

export class TablatureFretFont {
    family = '' // the family of the physical font to use
    displayName = '' // the name to display to the user
    defSize = 9.0 // the default size of the font
    defYOffset = 0.0 // the default Y displacement
    xChar = 'X' // the char to use for 'x'
    slashChar: string[] = [] // the char used to draw one or more '/' symbols
    displayDigit: string[] = [] // the string to draw for digit frets
    displayLetter: string[] = [] // the char to use for letter frets

    constructor() {
        // Set up defaults
        for (let i = 0; i < NUM_OF_DIGITFRETS; i++) {
            this.displayDigit.push(String(i))
        }
        for (let i = 0; i < NUM_OF_LETTERFRETS; i++) {
            this.displayLetter.push(String.fromCharCode(97 + i))
        }
        for (let i = 0; i < NUM_OF_BASSSTRING_SLASHES; i++) {
            this.slashChar.push('/'.repeat(i))
        }
    }

    clone(): TablatureFretFont {
        const f = new TablatureFretFont()
        Object.assign(f, this)
        f.slashChar = [...this.slashChar]
        f.displayDigit = [...this.displayDigit]
        f.displayLetter = [...this.displayLetter]
        return f
    }

    read(e: XmlReader, mscVersion: number): boolean {
        this.defSize = 9.0
        this.defYOffset = 0.0
        while (e.readNextStartElement()) {
            const tag = e.name()

            const val = e.intAttribute('value')

            if (tag === 'family') {
                this.family = e.readText()
            } else if (tag === 'displayName') {
                this.displayName = e.readText()
            } else if (tag === 'defaultSize' || (tag === 'defaultPitch' && mscVersion < 460)) {
                this.defSize = e.readDouble()
            } else if (tag === 'defaultYOffset') {
                this.defYOffset = e.readDouble()
            } else if (tag === 'mark') {
                const sval = e.attribute('value')
                let num = e.intAttribute('number', 1)
                const txt = e.readText()
                if (sval.length < 1) {
                    return false
                }
                if (sval === 'x') {
                    this.xChar = txt.charAt(0)
                } else if (sval === 'slash') {
                    // limit within legal range
                    if (num < 1) {
                        num = 1
                    }
                    if (num > NUM_OF_BASSSTRING_SLASHES) {
                        num = NUM_OF_BASSSTRING_SLASHES
                    }
                    this.slashChar[num - 1] = txt
                }
            } else if (tag === 'fret') {
                const bLetter = e.intAttribute('letter') !== 0
                const txt = e.readText()
                if (bLetter) {
                    if (val >= 0 && val < NUM_OF_LETTERFRETS) {
                        this.displayLetter[val] = txt.charAt(0)
                    }
                } else {
                    if (val >= 0 && val < NUM_OF_DIGITFRETS) {
                        this.displayDigit[val] = txt
                    }
                }
            } else {
                e.unknown()
                return false
            }
        }
        return true
    }
}

export enum TabVal {
    VAL_LONGA = 0,
    VAL_BREVIS,
    VAL_SEMIBREVIS,
    VAL_MINIMA,
    VAL_SEMIMINIMA,
    VAL_FUSA,
    VAL_SEMIFUSA,
    VAL_32,
    VAL_64,
    VAL_128,
    VAL_256,
    VAL_512,
    VAL_1024,
    NUM_OF,
}

const TAB_VAL_NAMES: Record<string, TabVal> = {
    longa: TabVal.VAL_LONGA, brevis: TabVal.VAL_BREVIS, semibrevis: TabVal.VAL_SEMIBREVIS, minima: TabVal.VAL_MINIMA,
    semiminima: TabVal.VAL_SEMIMINIMA, fusa: TabVal.VAL_FUSA, semifusa: TabVal.VAL_SEMIFUSA, 32: TabVal.VAL_32,
    64: TabVal.VAL_64, 128: TabVal.VAL_128, 256: TabVal.VAL_256, 512: TabVal.VAL_512, 1024: TabVal.VAL_1024,
}

const ZERO_BEAM_VALUES: Record<string, DurationType> = {
    longa: DurationType.V_LONG, brevis: DurationType.V_BREVE, semibrevis: DurationType.V_WHOLE, minima: DurationType.V_HALF,
    semiminima: DurationType.V_QUARTER, fusa: DurationType.V_EIGHTH, semifusa: DurationType.V_16TH, 32: DurationType.V_32ND,
    64: DurationType.V_64TH, 128: DurationType.V_128TH, 256: DurationType.V_256TH, 512: DurationType.V_512TH,
    1024: DurationType.V_1024TH,
}

export class TablatureDurationFont {
    family = '' // the family of the physical font to use
    displayName = '' // the name to display to the user
    defSize = 0.0 // the default size of the font
    defYOffset = 0.0 // the default Y displacement
    gridBeamWidth = GRID_BEAM_DEF_WIDTH // the width of the 'grid'-style beam (in sp)
    gridStemHeight = GRID_STEM_DEF_HEIGHT // the height of the 'grid'-style stem (in sp)
    gridStemWidth = GRID_STEM_DEF_WIDTH // the width of the 'grid'-style stem (in sp)
    // the note value with no beaming in 'grid'-style beaming
    zeroBeamLevel = DurationType.V_QUARTER
    displayDot = '' // the char to use to draw a dot
    displayValue: string[] = new Array<string>(TabVal.NUM_OF).fill('') // the char to use to draw a duration value

    read(e: XmlReader, mscVersion: number): boolean {
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'family') {
                this.family = e.readText()
            } else if (tag === 'displayName') {
                this.displayName = e.readText()
            } else if (tag === 'defaultSize' || (tag === 'defaultPitch' && mscVersion < 460)) {
                this.defSize = e.readDouble()
            } else if (tag === 'defaultYOffset') {
                this.defYOffset = e.readDouble()
            } else if (tag === 'beamWidth') {
                this.gridBeamWidth = e.readDouble()
            } else if (tag === 'stemHeight') {
                this.gridStemHeight = e.readDouble()
            } else if (tag === 'stemWidth') {
                this.gridStemWidth = e.readDouble()
            } else if (tag === 'zeroBeamValue') {
                const val = e.readText()
                if (val in ZERO_BEAM_VALUES) {
                    this.zeroBeamLevel = ZERO_BEAM_VALUES[val]
                } else {
                    e.unknown()
                }
            } else if (tag === 'duration') {
                const val = e.attribute('value')
                const chr = e.readText().charAt(0)
                if (val in TAB_VAL_NAMES) {
                    this.displayValue[TAB_VAL_NAMES[val]] = chr
                } else if (val === 'dot') {
                    this.displayDot = chr
                } else {
                    e.unknown()
                }
            } else {
                e.unknown()
                return false
            }
        }
        return true
    }
}

export enum TablatureMinimStyle {
    NONE = 0, // do not draw half notes at all
    SHORTER, // draw half notes with a shorter stem
    SLASHED, // draw half notes with stem with two slashes
}

export enum TablatureSymbolRepeat {
    NEVER = 0, // never repeat the same duration symbol
    SYSTEM, // repeat at the beginning of a new system
    MEASURE, // repeat at the beginning of a new measure
    ALWAYS, // always repeat
}

export enum ShowTiedFret {
    TIE_AND_FRET,
    TIE,
    NONE,
}

export enum ParenthesizeTiedFret {
    START_OF_SYSTEM,
    START_OF_MEASURE,
    NEVER,
}

export enum StaffTypes {
    STANDARD,
    PERC_1LINE, PERC_2LINE, PERC_3LINE, PERC_5LINE,
    TAB_6SIMPLE, TAB_6COMMON, TAB_6FULL,
    TAB_4SIMPLE, TAB_4COMMON, TAB_4FULL,
    TAB_5SIMPLE, TAB_5COMMON, TAB_5FULL,
    TAB_UKULELE, TAB_BALALAJKA, TAB_DULCIMER,
    TAB_ITALIAN, TAB_FRENCH,
    TAB_7COMMON, TAB_8COMMON, TAB_9COMMON, TAB_10COMMON,
    TAB_7SIMPLE, TAB_8SIMPLE, TAB_9SIMPLE, TAB_10SIMPLE,
    STAFF_TYPES,
}

export class StaffType {
    private m_style: MStyle | null = null
    private m_group: StaffGroup = StaffGroup.STANDARD
    private m_xmlName = '' // the name used to reference this preset in instruments.xml
    private m_name = '' // user visible name
    private m_userMag = 1.0 // allowed 0.1 - 10.0
    private m_yoffset = new Spatium(0)
    private m_small = false
    private m_invisible = false
    private m_color: Color = Color.BLACK
    private m_lines = 5
    private m_stepOffset = 0
    private m_lineDistance = new Spatium(1)
    private m_showBarlines = true
    private m_showLedgerLines = true
    private m_stemless = false // do not show stems
    private m_genClef = true // create clef at beginning of system
    private m_genTimesig = true // whether time signature is shown or not
    private m_genKeysig = true // create key signature at beginning of system
    private m_noteHeadScheme: NoteHeadScheme = NoteHeadScheme.HEAD_NORMAL

    // tablature
    private m_durationFont = new Font() // font used to draw dur. symbols; cached for efficiency
    private m_durationFontIdx = 0 // the index of current dur. font in dur. font array
    private m_durationFontSize = 15.0 // the size (in points) for the duration symbol font
    private m_durationFontUserY = 0.0 // the vertical offset (spatium units) for the duration symb. font
    private m_durationYOffset = 0.0 // the vertical offset to draw duration symbols with respect to the string lines
    private m_durationGridYOffset = 0.0 // the vertical offset to draw the bottom of duration grid with respect to the string lines
    private m_durationBoxH = 0.0
    private m_durationBoxY = 0.0 // the height and the y rect.coord. (relative to staff top line) of a box bounding all duration symbols
    private m_fretFont = new Font() // font used to draw fret marks; cached for efficiency
    private m_fretFontInfo = new TablatureFretFont()
    private m_fretPresetIdx = 0 // the index of current fret font in fret font array
    private m_fretFontSize = 10.0 // the size (in points) for the fret marks font
    private m_fretFontUserY = 0.0 // additional vert. offset of fret marks with respect to the string line (spatium unit)
    private m_fretYOffset = 0.0 // the vertical offset to draw fret marks with respect to the string lines
    private m_fretBoxH = 0.0
    private m_fretBoxY = 0.0 // the height and the y rect.coord. (relative to staff line) of a box bounding all fret characters
    private m_deadFretYOffset = 0.0
    private m_deadFretBoxH = 0.0
    private m_deadFretBoxY = 0.0
    private m_genDurations = false
    private m_linesThrough = false
    private m_minimStyle = TablatureMinimStyle.NONE
    private m_symRepeat = TablatureSymbolRepeat.NEVER
    private m_onLines = true
    private m_showRests = false
    private m_stemsDown = true
    private m_stemsThrough = true
    private m_upsideDown = false
    private m_showTabFingering = false
    private m_useNumbers = true
    private m_showBackTied = true
    private m_fretUseTextStyle = false
    private m_fretTextStyle: TextStyleType = TextStyleType.TAB_FRET_NUMBER

    private static s_presets: StaffType[] | null = null
    private static s_fretFonts: TablatureFretFont[] = []
    private static s_durationFonts: TablatureDurationFont[] = []

    constructor() {
        // set reasonable defaults for type-specific members
        if (StaffType.s_durationFonts.length) {
            this.setDurationFontName(StaffType.s_durationFonts[0].displayName)
            this.setFretPresetIdx(0)
        }
    }

    static make(group: StaffGroup, xml: string, name: string, lines: number, stpOff: number, lineDist: number,
        genClef: boolean, showBarLines: boolean, stemless: boolean, genTimeSig: boolean, genKeySig: boolean,
        showLedgerLines: boolean, invisible: boolean): StaffType {
        const st = new StaffType()
        st.m_group = group
        st.m_xmlName = xml
        st.m_name = name
        st.m_lines = lines
        st.m_stepOffset = stpOff
        st.m_lineDistance = new Spatium(lineDist)
        st.m_genClef = genClef
        st.m_showBarlines = showBarLines
        st.m_stemless = stemless
        st.m_genTimesig = genTimeSig
        st.m_genKeysig = genKeySig
        st.m_showLedgerLines = showLedgerLines
        st.m_invisible = invisible
        return st
    }

    /** C++ tablature constructor of StaffType */
    static makeTab(xml: string, name: string, lines: number, stpOff: number, lineDist: number, genClef: boolean,
        showBarLines: boolean, stemless: boolean, genTimesig: boolean, durFontName: string, durFontSize: number,
        durFontUserY: number, genDur: boolean, fretFontUseTextStyle: boolean, fretFontName: string, fretFontSize: number,
        fretFontUserY: number, symRepeat: TablatureSymbolRepeat, linesThrough: boolean, minimStyle: TablatureMinimStyle,
        onLines: boolean, showRests: boolean, stemsDown: boolean, stemThrough: boolean, upsideDown: boolean,
        showTabFingering: boolean, useNumbers: boolean, showBackTied: boolean): StaffType {
        const st = new StaffType()
        st.m_group = StaffGroup.TAB
        st.m_xmlName = xml
        st.m_name = name
        st.setLines(lines)
        st.setStepOffset(stpOff)
        st.setLineDistance(new Spatium(lineDist))
        st.setGenClef(genClef)
        st.setShowBarlines(showBarLines)
        st.setStemless(stemless)
        st.setGenTimesig(genTimesig)
        st.setGenKeysig(false)
        st.setDurationFontName(durFontName)
        st.setDurationFontSize(durFontSize)
        st.setDurationFontUserY(durFontUserY)
        st.setGenDurations(genDur)
        st.setFretUseTextStyle(fretFontUseTextStyle)
        if (fretFontUseTextStyle) {
            st.setFretTextStyle(TextStyleType.TAB_FRET_NUMBER)
        } else {
            st.setFretPreset(fretFontName)
            st.setFretFontSize(fretFontSize)
            st.setFretFontUserY(fretFontUserY)
        }
        st.setSymbolRepeat(symRepeat)
        st.setLinesThrough(linesThrough)
        st.setMinimStyle(minimStyle)
        st.setOnLines(onLines)
        st.setShowRests(showRests)
        st.setStemsDown(stemsDown)
        st.setStemsThrough(stemThrough)
        st.setUpsideDown(upsideDown)
        st.setShowTabFingering(showTabFingering)
        st.setUseNumbers(useNumbers)
        st.setShowBackTied(showBackTied)
        return st
    }

    clone(): StaffType {
        const st = Object.create(StaffType.prototype) as StaffType
        Object.assign(st, this)
        st.m_durationFont = this.m_durationFont.clone()
        st.m_fretFont = this.m_fretFont.clone()
        st.m_fretFontInfo = this.m_fretFontInfo.clone()
        return st
    }

    setStyle(style: MStyle | null): void { this.m_style = style }

    /** C++ StaffType::style() */
    style(): MStyle { return this.m_style ?? DefaultStyle.defaultStyle() }

    group(): StaffGroup { return this.m_group }
    setGroup(g: StaffGroup): void { this.m_group = g }
    name(): string { return this.m_name }
    xmlName(): string { return this.m_xmlName }
    setName(v: string): void { this.m_name = v }
    setXmlName(v: string): void { this.m_xmlName = v }

    setLines(val: number): void { this.m_lines = val }
    lines(): number { return this.m_lines }
    middleLine(): number { return this.m_lines - 1 - this.m_stepOffset }
    bottomLine(): number { return (this.m_lines - 1) * 2 }
    setStepOffset(v: number): void { this.m_stepOffset = v }
    stepOffset(): number { return this.m_stepOffset }
    setLineDistance(v: Spatium): void { this.m_lineDistance = v }
    lineDistance(): Spatium { return this.m_lineDistance }
    setGenClef(v: boolean): void { this.m_genClef = v }
    genClef(): boolean { return this.m_genClef }
    setShowBarlines(v: boolean): void { this.m_showBarlines = v }
    showBarlines(): boolean { return this.m_showBarlines }
    userMag(): number { return this.m_userMag }
    isSmall(): boolean { return this.m_small }
    invisible(): boolean { return this.m_invisible }
    color(): Color { return this.m_color }
    setUserMag(v: number): void { this.m_userMag = v }
    setSmall(v: boolean): void { this.m_small = v }
    setInvisible(v: boolean): void { this.m_invisible = v }
    setColor(v: Color): void { this.m_color = v }
    yoffset(): Spatium { return this.m_yoffset }
    setYoffset(v: Spatium): void { this.m_yoffset = v }
    setStemless(v: boolean): void { this.m_stemless = v }
    stemless(): boolean { return this.m_stemless }
    genTimesig(): boolean { return this.m_genTimesig }
    setGenTimesig(v: boolean): void { this.m_genTimesig = v }
    setGenKeysig(v: boolean): void { this.m_genKeysig = v }
    genKeysig(): boolean { return this.m_genKeysig }
    setShowLedgerLines(v: boolean): void { this.m_showLedgerLines = v }
    showLedgerLines(): boolean { return this.m_showLedgerLines }
    setNoteHeadScheme(s: NoteHeadScheme): void { this.m_noteHeadScheme = s }
    noteHeadScheme(): NoteHeadScheme { return this.m_noteHeadScheme }

    spatium(): number {
        const style = this.style()
        return style.spatium() * (this.isSmall() ? style.styleD(Sid.smallStaffMag) : 1.0) * this.userMag()
    }

    // tablature
    durationFont(): Font { return this.m_durationFont }
    durationFontName(): string { return StaffType.s_durationFonts[this.m_durationFontIdx]?.displayName ?? '' }
    durationFontSize(): number { return this.m_durationFontSize }
    durationFontUserY(): number { return this.m_durationFontUserY }
    setDurationFontUserY(v: number): void { this.m_durationFontUserY = v }
    fretFont(): Font { return this.m_fretFont }
    fretFontName(): string { return this.m_fretFontInfo.displayName }
    fretFontSize(): number { return this.m_fretFontSize }
    fretFontUserY(): number { return this.m_fretFontUserY }
    setFretFontUserY(v: number): void { this.m_fretFontUserY = v }
    fretPresetIdx(): number { return this.m_fretPresetIdx }
    deadFretBoxH(): number { return this.m_deadFretBoxH }
    fretBoxH(): number { return this.m_fretBoxH }
    deadFretFontYOffset(): number { return this.m_deadFretYOffset + this.m_fretFontUserY * this.defaultSpatium() }
    durationGridYOffset(): number { return this.m_durationGridYOffset }
    zeroBeamLevel(): DurationType { return StaffType.s_durationFonts[this.m_durationFontIdx].zeroBeamLevel }
    gridBeamWidth(): number { return StaffType.s_durationFonts[this.m_durationFontIdx].gridBeamWidth }
    gridStemHeight(): number { return StaffType.s_durationFonts[this.m_durationFontIdx].gridStemHeight }
    gridStemWidth(): number { return StaffType.s_durationFonts[this.m_durationFontIdx].gridStemWidth }
    genDurations(): boolean { return this.m_genDurations }
    setGenDurations(v: boolean): void { this.m_genDurations = v }
    linesThrough(): boolean { return this.m_linesThrough }
    setLinesThrough(v: boolean): void { this.m_linesThrough = v }
    minimStyle(): TablatureMinimStyle { return this.m_minimStyle }
    setMinimStyle(v: TablatureMinimStyle): void { this.m_minimStyle = v }
    symRepeat(): TablatureSymbolRepeat { return this.m_symRepeat }
    setSymbolRepeat(v: TablatureSymbolRepeat): void { this.m_symRepeat = v }
    onLines(): boolean { return this.m_onLines }
    showRests(): boolean { return this.m_showRests }
    setShowRests(v: boolean): void { this.m_showRests = v }
    stemsDown(): boolean { return this.m_stemsDown }
    setStemsDown(v: boolean): void { this.m_stemsDown = v }
    stemThrough(): boolean { return this.m_stemsThrough }
    setStemsThrough(v: boolean): void { this.m_stemsThrough = v }
    upsideDown(): boolean { return this.m_upsideDown }
    setUpsideDown(v: boolean): void { this.m_upsideDown = v }
    showTabFingering(): boolean { return this.m_showTabFingering }
    setShowTabFingering(v: boolean): void { this.m_showTabFingering = v }
    useNumbers(): boolean { return this.m_useNumbers }
    showBackTied(): boolean { return this.m_showBackTied }
    setShowBackTied(v: boolean): void { this.m_showBackTied = v }
    fretUseTextStyle(): boolean { return this.m_fretUseTextStyle }
    setFretUseTextStyle(v: boolean): void { this.m_fretUseTextStyle = v }
    fretTextStyle(): TextStyleType { return this.m_fretTextStyle }

    styleChanged(): void {
        if (!this.m_fretUseTextStyle) {
            return
        }
        this.setFretTextStyle(this.m_fretTextStyle)
    }

    setOnLines(val: boolean): void {
        this.m_onLines = val
        this.setDurationMetrics()
        this.setFretMetrics()
    }

    setUseNumbers(val: boolean): void {
        this.m_useNumbers = val
        this.setFretMetrics()
    }

    setFretTextStyle(val: TextStyleType): void {
        this.m_fretTextStyle = val
        this.m_fretFontInfo = new TablatureFretFont()
        this.m_fretFont = new Font()

        const ts = textStyle(this.m_fretTextStyle)!

        for (const property of ts) {
            switch (property.type) {
            case TextStylePropertyType.FontFace: {
                const fontName = this.style().styleSt(property.sid)
                this.m_fretFontInfo.family = fontName
                this.m_fretFont.setFamily(fontName, FontType.Tablature)
            } break
            case TextStylePropertyType.FontSize: {
                const fontSize = this.style().styleD(property.sid)
                this.setFretFontSize(fontSize)
            } break
            case TextStylePropertyType.Offset: {
                const offset = this.style().styleV(property.sid) as PointF
                this.setFretFontUserY(offset.y())
            } break
            case TextStylePropertyType.FontStyle: {
                const fStyle = this.style().styleV(property.sid) as FontStyle
                this.m_fretFont.setBold(!!(fStyle & FontStyle.Bold))
                this.m_fretFont.setItalic(!!(fStyle & FontStyle.Italic))
                this.m_fretFont.setUnderline(!!(fStyle & FontStyle.Underline))
                this.m_fretFont.setStrike(!!(fStyle & FontStyle.Strike))
            } break
            default:
                continue
            }
        }

        this.setFretMetrics()
    }

    setFretPresetIdx(idx: number): void {
        // Clear all previous formatting
        this.m_fretFont = new Font()
        if (idx >= StaffType.s_fretFonts.length) {
            this.m_fretPresetIdx = 0
            this.m_fretFontInfo = StaffType.s_fretFonts[0].clone()
        } else {
            this.m_fretPresetIdx = idx
            this.m_fretFontInfo = StaffType.s_fretFonts[idx].clone()
        }

        this.m_fretFont.setFamily(this.m_fretFontInfo.family, FontType.Tablature)
        this.setFretFontSize(this.m_fretFontInfo.defSize)
        this.setFretFontUserY(this.m_fretFontInfo.defYOffset)
        this.setFretMetrics()
    }

    setFretPreset(name: string): void {
        let locName = name
        // convert old names for two built-in fonts which have changed of name
        if (name === 'MuseScore Tab Late Renaiss') {
            locName = 'MuseScore Phalèse'
        }
        let idx = 0
        for (idx = 0; idx < StaffType.s_fretFonts.length; idx++) {
            if (StaffType.s_fretFonts[idx].displayName === locName) {
                break
            }
        }

        this.setFretPresetIdx(idx)
    }

    /** checks whether the internally computed metrics are is still valid and re-computes them, if not */
    private setDurationMetrics(): void {
        if (!StaffType.s_durationFonts.length) {
            return
        }
        // FontMetrics returns results unreliably rounded to integral pixels;
        // use a scaled up font and then scale computed values down
        const font = this.durationFont().clone()
        font.setPointSizeF(this.m_durationFontSize)
        const fm = new FontMetrics(font)
        const txt = StaffType.s_durationFonts[this.m_durationFontIdx].displayValue.join('')
        const bb: RectF = fm.tightBoundingRect(txt)
        // raise symbols by a default margin and, if marks are above lines, by half the line distance
        // (converted from spatium units to raster units)
        this.m_durationGridYOffset = (TAB_DEFAULT_DUR_YOFFS - (this.m_onLines ? 0.0 : this.lineDistance().val() * 0.5)) * this.defaultSpatium()
        // this is the bottomest point of any duration sign
        this.m_durationYOffset = this.m_durationGridYOffset
        // move symbols so that the lowest margin 'sits' on the base line:
        // move down by the whole part above (negative) the base line
        // ( -bb.y() ) then up by the whole height ( -bb.height() )
        this.m_durationYOffset -= (bb.height() + bb.y()) / 100.0
        this.m_durationBoxH = bb.height() / 100.0
        this.m_durationBoxY = this.m_durationGridYOffset - bb.height() / 100.0
    }

    private setFretMetrics(): void {
        if (!StaffType.s_fretFonts.length) {
            return
        }
        const fm = new FontMetrics(this.fretFont())
        let bb: RectF
        // compute vertical displacement
        if (this.m_useNumbers) {
            // compute total height of used characters
            let txt = ''
            for (let idx = 0; idx < 10; idx++) { // use only first 10 digits
                txt += this.m_fretFontInfo.displayDigit[idx]
            }
            bb = fm.tightBoundingRect(txt)
            // for numbers: centre on '0': move down by the whole part above (negative)
            // the base line ( -bb.y() ) then up by half the whole height ( -bb.height()/2 )
            const bx = fm.tightBoundingRect(this.m_fretFontInfo.displayDigit[0])
            this.m_fretYOffset = -(bx.y() + bx.height() / 2.0)
        } else {
            // compute total height of used characters
            const txt = this.m_fretFontInfo.displayLetter.slice(0, NUM_OF_LETTERFRETS).join('')
            bb = fm.tightBoundingRect(txt)
            // for letters: centre on the 'a' ascender, by moving down half of the part above the base line in bx
            const bx = fm.tightBoundingRect(this.m_fretFontInfo.displayLetter[0])
            this.m_fretYOffset = -bx.y() / 2.0
        }

        // Calculate position for dead fret marks - these must be centred separately based on their glyph
        const deadBb = fm.tightBoundingRect(this.m_fretFontInfo.xChar)
        const lineThickness = this.style().styleS(Sid.staffLineWidth).val() * this.defaultSpatium() * 0.5
        this.m_deadFretYOffset = -deadBb.y() / 2.0 + lineThickness

        // if on string, we are done; if between strings, raise by half line distance
        if (!this.m_onLines) {
            const lineAdj = this.lineDistance().val() * this.defaultSpatium() * 0.5
            this.m_fretYOffset -= lineAdj
            this.m_deadFretYOffset -= lineAdj
        }

        // from _fretYOffset, compute _fretBoxH and _fretBoxY
        this.m_fretBoxH = bb.height()
        this.m_fretBoxY = bb.y() + this.m_fretYOffset

        this.m_deadFretBoxH = deadBb.height()
        this.m_deadFretBoxY = deadBb.y() + this.m_deadFretYOffset
    }

    setDurationFontName(name: string): void {
        let idx: number
        for (idx = 0; idx < StaffType.s_durationFonts.length; idx++) {
            if (StaffType.s_durationFonts[idx].displayName === name) {
                break
            }
        }
        if (idx >= StaffType.s_durationFonts.length) {
            idx = 0 // if name not found, use first font
        }
        if (!StaffType.s_durationFonts.length) {
            return
        }
        this.m_durationFont.setFamily(StaffType.s_durationFonts[idx].family, FontType.Tablature)
        this.m_durationFontIdx = idx
        this.setDurationMetrics()
    }

    defaultSpatium(): number {
        return DefaultStyle.baseStyle().styleD(Sid.spatium)
    }

    durationBoxH(): number {
        if (!this.m_genDurations && !this.m_stemless) {
            return 0.0
        }
        return this.m_durationBoxH
    }

    durationBoxY(): number {
        if (!this.m_genDurations && !this.m_stemless) {
            return 0.0
        }
        return this.m_durationBoxY + this.m_durationFontUserY * this.defaultSpatium()
    }

    durationFontYOffset(): number {
        return this.m_durationYOffset + this.m_durationFontUserY * this.defaultSpatium()
    }

    fretBoxY(): number {
        return this.m_fretBoxY + this.m_fretFontUserY * this.defaultSpatium()
    }

    deadFretBoxY(): number {
        return this.m_deadFretBoxY + this.m_fretFontUserY * this.defaultSpatium()
    }

    fretMaskH(): number {
        return this.m_lineDistance.val() * this.defaultSpatium()
    }

    fretMaskY(): number {
        return (this.m_onLines ? -0.5 : -1.0) * this.m_lineDistance.val() * this.defaultSpatium()
    }

    fretFontYOffset(): number {
        return this.m_fretYOffset + this.m_fretFontUserY * this.defaultSpatium()
    }

    setDurationFontSize(val: number): void {
        this.m_durationFontSize = val
        this.m_durationFont.setPointSizeF(val)
        this.setDurationMetrics()
    }

    setFretFontSize(val: number): void {
        this.m_fretFontSize = val
        this.m_fretFont.setPointSizeF(val)
        this.setFretMetrics()
    }

    /** construct the text string for a given fret */
    fretString(fret: number, string: number, deadNote: boolean): string {
        const unknownFret = '?'
        if (fret === INVALID_FRET_INDEX) {
            return unknownFret
        }
        if (deadNote) {
            return this.m_fretFontInfo.xChar
        } else {
            const { prefix: text, hasFret } = this.tabBassStringPrefix(string)
            if (!hasFret) { // if the notation does not allow to fret this string,
                return text // return the prefix only
            }
            // otherwise, add to prefix the relevant digit/letter string
            return text
                   + (this.m_useNumbers
                       ? (fret >= NUM_OF_DIGITFRETS ? unknownFret : this.m_fretFontInfo.displayDigit[fret])
                       : (fret >= NUM_OF_LETTERFRETS ? unknownFret : this.m_fretFontInfo.displayLetter[fret]))
        }
    }

    /** construct the text string for a given duration */
    durationString(type: DurationType, dots: number): string {
        const font = StaffType.s_durationFonts[this.m_durationFontIdx]
        let s = font.displayValue[type] ?? ''
        for (let count = 0; count < dots; count++) {
            s += font.displayDot
        }
        return s
    }

    /**
     * returns the prefix identifying a bass string in TAB's (possibly empty) and whether the notation allows
     * to express a fret number (C++ out-param hasFret)
     */
    tabBassStringPrefix(strg: number): { prefix: string; hasFret: boolean } {
        const bassStrgIdx = (strg >= this.m_lines ? strg - this.m_lines + 1 : 0)
        if (this.m_useNumbers) {
            // if above the max bass string which can be fretted with number notation
            // return a number with the string index
            if (bassStrgIdx > NUM_OF_BASSSTRINGS_WITH_NUMBER) {
                return { prefix: this.m_fretFontInfo.displayDigit[strg + 1], hasFret: false }
            }
            // if a frettable bass string, return an empty string
            return { prefix: '', hasFret: true }
        } else {
            // bass string notation
            // if above the max bass string which can be fretted with letter notation
            // return a number with the bass string index itself
            if (bassStrgIdx > NUM_OF_BASSSTRINGS_WITH_LETTER) {
                return { prefix: this.m_fretFontInfo.displayDigit[bassStrgIdx - 1], hasFret: false }
            }
            // if a frettable bass string, return a character with the relevant num. of slashes;
            // note that the number of slashes is bassStrgIdx-1 (1st bass has no slash)
            // and slashChar[] is 0-based (slashChar[0] => 1 slash, ...), whence the -2
            const prefix = bassStrgIdx > 1 ? this.m_fretFontInfo.slashChar[bassStrgIdx - 2] : ''
            return { prefix, hasFret: true }
        }
    }

    /**
     * in TAB's, returns the number of ledgerlines needed by bass lines in some TAB styles.
     * Returns 0 if staff is not a TAB, if a TAB but style does not use ledger lines
     * or ledger lines do not apply to the given string.
     */
    numOfTabLedgerLines(string: number): number {
        if (this.m_group !== StaffGroup.TAB || !this.m_useNumbers) {
            return 0
        }

        const numOfLedgers = string < 0 ? -string : string - this.m_lines + 1
        return numOfLedgers >= 1 && numOfLedgers <= NUM_OF_BASSSTRINGS_WITH_NUMBER ? numOfLedgers : 0
    }

    /** returns the string ordinal in visual order (top to down) from a string ordinal in physical order */
    physStringToVisual(strg: number): number {
        if (strg < 0) { // if above top string, return top string
            strg = 0
        }
        // if TAB upside down, flip around top line
        return this.m_upsideDown ? this.m_lines - 1 - strg : strg
    }

    visualStringToPhys(line: number): number {
        // if TAB upside down, reverse string number
        line = (this.m_upsideDown ? this.m_lines - 1 - line : line)

        if (line < 0) { // if above top string, reduce to top string
            line = 0
        }
        return line
    }

    /**
     * returns the string Y offset (sp, relative to the staff top line) from a string ordinal in physical order:
     * manages upsideDown and extra bass strings.
     */
    physStringToYOffset(strg: number): number {
        let yOffset = strg // the y offset of the visual string, as a multiple of line distance
        if (yOffset < 0) { // if above top physical string, limit to top string
            yOffset = 0
        }
        if (yOffset >= this.m_lines) { // if physical string 'below' tab lines,
            yOffset = this.m_lines // reduce to first string 'below' tab body
            if (!this.m_useNumbers) { // with letters, add some space for the slashes ascender
                yOffset = this.m_onLines ? this.m_lines : this.m_lines + STAFFTYPE_TAB_BASSSLASH_YOFFSET
            }
        }
        // if TAB upside down, flip around top line
        yOffset = this.m_upsideDown ? (this.m_lines - 1) - yOffset : yOffset
        return yOffset * this.m_lineDistance.val()
    }

    /** C++ StaffType::readTabConfigFile() with the content of fonts/fonts_tablature.xml */
    static readTabConfig(xml: string | Uint8Array): boolean {
        StaffType.s_durationFonts = []
        StaffType.s_fretFonts = []
        StaffType.s_presets = null

        const e = new XmlReader(xml)
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                const version = e.attribute('version')
                const sl = version.split('.')
                const mscVersion = sl.length === 2 ? parseInt(sl[0], 10) * 100 + parseInt(sl[1], 10) : 0

                while (e.readNextStartElement()) {
                    const tag = e.name()
                    if (tag === 'fretFont') {
                        const ff = new TablatureFretFont()
                        if (ff.read(e, mscVersion)) {
                            StaffType.s_fretFonts.push(ff)
                        } else {
                            continue
                        }
                    } else if (tag === 'durationFont') {
                        const df = new TablatureDurationFont()
                        if (df.read(e, mscVersion)) {
                            StaffType.s_durationFonts.push(df)
                        } else {
                            continue
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

    isTabStaff(): boolean { return this.m_group === StaffGroup.TAB }
    isDrumStaff(): boolean { return this.m_group === StaffGroup.PERCUSSION }
    isSimpleTabStaff(): boolean { return this.isTabStaff() && !this.m_genDurations && this.m_stemless }
    isCommonTabStaff(): boolean { return this.isTabStaff() && !this.isSimpleTabStaff() }

    isHiddenElementOnTab(commonTabStyle: Sid, simpleTabStyle: Sid): boolean {
        if (!this.m_style) {
            return false
        }
        return (this.isCommonTabStaff() && !this.m_style.styleB(commonTabStyle))
               || (this.isSimpleTabStaff() && !this.m_style.styleB(simpleTabStyle))
    }

    // presets

    static presets(): StaffType[] {
        if (!StaffType.s_presets) {
            const P = StaffGroup.PERCUSSION
            const S = StaffGroup.STANDARD
            const M = TablatureMinimStyle
            const R = TablatureSymbolRepeat
            // keep in sync with enum class StaffTypes
            StaffType.s_presets = [
                //            group, xml-name,  human-readable-name, lin stpOff dist clef  bars  stmless time key   ledger invis
                StaffType.make(S, 'stdNormal', 'Standard', 5, 0, 1, true, true, false, true, true, true, false),
                StaffType.make(P, 'perc1Line', 'Perc. 1 line', 1, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc2Line', 'Perc. 2 lines', 2, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc3Line', 'Perc. 3 lines', 3, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc5Line', 'Perc. 5 lines', 5, 0, 1, true, true, false, true, false, true, false),
                //                 xml-name, human-readable-name, lin stpOff dist clef bars stemless time, duration font, size off genDur textStyle fret font, size off, duration symbol repeat, thru, minim style, onLin rests stmDn stmThr upsDn sTFing nums bkTied
                StaffType.makeTab('tab6StrSimple', 'Tab. 6-str. simple', 6, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab6StrCommon', 'Tab. 6-str. common', 6, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab6StrFull', 'Tab. 6-str. full', 6, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SLASHED, true, true, true, true, false, true, true, true),
                StaffType.makeTab('tab4StrSimple', 'Tab. 4-str. simple', 4, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab4StrCommon', 'Tab. 4-str. common', 4, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab4StrFull', 'Tab. 4-str. full', 4, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SLASHED, true, true, true, true, false, true, true, true),
                StaffType.makeTab('tab5StrSimple', 'Tab. 5-str. simple', 5, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab5StrCommon', 'Tab. 5-str. common', 5, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab5StrFull', 'Tab. 5-str. full', 5, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SLASHED, true, true, true, true, false, true, true, true),
                StaffType.makeTab('tabUkulele', 'Tab. ukulele', 4, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tabBalajka', 'Tab. balalaika', 3, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tabDulcimer', 'Tab. dulcimer', 3, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, true, true, true, true),
                StaffType.makeTab('tab6StrItalian', 'Tab. 6-str. Italian', 6, 0, 1.5, false, true, true, true, 'MuseScore Tab Italian', 15, 0, true, false, 'MuseScore Tab Renaiss', 10, 0, R.NEVER, true, M.NONE, true, true, false, false, true, false, true, false),
                StaffType.makeTab('tab6StrFrench', 'Tab. 6-str. French', 6, 0, 1.5, false, true, true, true, 'MuseScore Tab French', 15, 0, true, false, 'MuseScore Tab Renaiss', 10, 0, R.NEVER, true, M.NONE, false, false, false, false, false, false, false, false),
                StaffType.makeTab('tab7StrCommon', 'Tab. 7-str. common', 7, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab8StrCommon', 'Tab. 8-str. common', 8, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab9StrCommon', 'Tab. 9-str. common', 9, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab10StrCommon', 'Tab. 10-str. common', 10, 0, 1.5, true, true, false, true, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.SHORTER, true, true, true, false, false, true, true, true),
                StaffType.makeTab('tab7StrSimple', 'Tab. 7-str. simple', 7, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab8StrSimple', 'Tab. 8-str. simple', 8, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab9StrSimple', 'Tab. 9-str. simple', 9, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
                StaffType.makeTab('tab10StrSimple', 'Tab. 10-str. simple', 10, 0, 1.5, true, true, true, false, 'MuseScore Tab Modern', 15, 0, false, true, 'MuseScore Tab Sans', 9, 0, R.NEVER, false, M.NONE, true, false, true, false, false, false, true, false),
            ]
        }
        return StaffType.s_presets
    }

    static preset(idx: StaffTypes): StaffType {
        const p = StaffType.presets()
        return p[idx] ?? p[0]
    }

    static presetFromXmlName(xmlName: string): StaffType | null {
        return StaffType.presets().find(p => p.xmlName() === xmlName) ?? null
    }

    static getDefaultPreset(grp: StaffGroup): StaffType {
        const defaultPreset = [StaffTypes.STANDARD, StaffTypes.PERC_5LINE, StaffTypes.TAB_6COMMON]
        return StaffType.presets()[defaultPreset[grp]]
    }
}

export class StaffTypeList {
    private m_firstStaffType = new StaffType()
    private m_staffTypeChanges = new SortedMap<StaffType>()

    uniqueStaffType(): boolean { return this.m_staffTypeChanges.empty() }
    isStaffTypeStartFrom(tick: Fraction): boolean { return this.m_staffTypeChanges.has(tick.ticks()) }

    staffType(tick: Fraction): StaffType {
        if (tick.negative()) {
            return new StaffType()
        }
        if (this.m_staffTypeChanges.empty()) {
            return this.m_firstStaffType
        }
        const i = this.m_staffTypeChanges.upperBound(tick.ticks())
        if (i === 0) {
            return this.m_firstStaffType
        }
        return this.m_staffTypeChanges.valueAt(i - 1)
    }

    setStaffType(tick: Fraction, st: StaffType): StaffType {
        const nst = st.clone()
        if (tick.isZero()) {
            this.m_firstStaffType = nst
            return nst
        }
        this.m_staffTypeChanges.set(tick.ticks(), nst)
        return nst
    }

    removeStaffType(tick: Fraction): boolean {
        if (!this.m_staffTypeChanges.has(tick.ticks())) {
            return false
        }
        this.m_staffTypeChanges.erase(tick.ticks())
        return true
    }

    all(): StaffType[] { return [this.m_firstStaffType, ...this.m_staffTypeChanges.values()] }
}
