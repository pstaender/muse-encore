/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafftype.h/.cpp and stafftypelist.h/.cpp
 *
 * TODO(port): tablature fonts (duration/fret fonts) are not ported yet.
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { Color } from '../../framework/draw/types/color'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import { NoteHeadScheme, StaffGroup, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'

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
    private m_durationFontName = 'MuseScore Tab Modern'
    private m_durationFontSize = 15.0
    private m_durationFontUserY = 0.0
    private m_fretFontName = 'MuseScore Tab Sans'
    private m_fretFontSize = 10.0
    private m_fretFontUserY = 0.0
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

    static makeTab(xml: string, name: string, lines: number, genClef: boolean, stemless: boolean, genTimesig: boolean,
        minimStyle: TablatureMinimStyle, onLines: boolean, showRests: boolean, stemsDown: boolean, stemThrough: boolean,
        upsideDown: boolean, showTabFingering: boolean, useNumbers: boolean, showBackTied: boolean, genDur: boolean,
        linesThrough: boolean): StaffType {
        const st = StaffType.make(StaffGroup.TAB, xml, name, lines, 0, 1.5, genClef, true, stemless, genTimesig, false, true, false)
        st.m_minimStyle = minimStyle
        st.m_onLines = onLines
        st.m_showRests = showRests
        st.m_stemsDown = stemsDown
        st.m_stemsThrough = stemThrough
        st.m_upsideDown = upsideDown
        st.m_showTabFingering = showTabFingering
        st.m_useNumbers = useNumbers
        st.m_showBackTied = showBackTied
        st.m_genDurations = genDur
        st.m_linesThrough = linesThrough
        return st
    }

    clone(): StaffType {
        const st = new StaffType()
        Object.assign(st, this)
        return st
    }

    setStyle(style: MStyle | null): void { this.m_style = style }

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
        const style = this.m_style
        if (!style) {
            return 24.8 * this.m_userMag
        }
        return style.spatium() * (this.isSmall() ? style.styleD(Sid.smallStaffMag) : 1.0) * this.userMag()
    }

    // tablature
    durationFontName(): string { return this.m_durationFontName }
    setDurationFontName(v: string): void { this.m_durationFontName = v }
    durationFontSize(): number { return this.m_durationFontSize }
    setDurationFontSize(v: number): void { this.m_durationFontSize = v }
    durationFontUserY(): number { return this.m_durationFontUserY }
    setDurationFontUserY(v: number): void { this.m_durationFontUserY = v }
    fretFontName(): string { return this.m_fretFontName }
    setFretPreset(v: string): void { this.m_fretFontName = v }
    fretFontSize(): number { return this.m_fretFontSize }
    setFretFontSize(v: number): void { this.m_fretFontSize = v }
    fretFontUserY(): number { return this.m_fretFontUserY }
    setFretFontUserY(v: number): void { this.m_fretFontUserY = v }
    genDurations(): boolean { return this.m_genDurations }
    setGenDurations(v: boolean): void { this.m_genDurations = v }
    linesThrough(): boolean { return this.m_linesThrough }
    setLinesThrough(v: boolean): void { this.m_linesThrough = v }
    minimStyle(): TablatureMinimStyle { return this.m_minimStyle }
    setMinimStyle(v: TablatureMinimStyle): void { this.m_minimStyle = v }
    symRepeat(): TablatureSymbolRepeat { return this.m_symRepeat }
    setSymbolRepeat(v: TablatureSymbolRepeat): void { this.m_symRepeat = v }
    onLines(): boolean { return this.m_onLines }
    setOnLines(v: boolean): void { this.m_onLines = v }
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
    setUseNumbers(v: boolean): void { this.m_useNumbers = v }
    showBackTied(): boolean { return this.m_showBackTied }
    setShowBackTied(v: boolean): void { this.m_showBackTied = v }
    fretUseTextStyle(): boolean { return this.m_fretUseTextStyle }
    setFretUseTextStyle(v: boolean): void { this.m_fretUseTextStyle = v }
    fretTextStyle(): TextStyleType { return this.m_fretTextStyle }
    setFretTextStyle(v: TextStyleType): void { this.m_fretTextStyle = v }

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

    private static s_presets: StaffType[] | null = null

    static presets(): StaffType[] {
        if (!StaffType.s_presets) {
            const P = StaffGroup.PERCUSSION
            const S = StaffGroup.STANDARD
            const M = TablatureMinimStyle
            // keep in sync with enum class StaffTypes
            StaffType.s_presets = [
                //            group, xml-name,  human-readable-name, lin stpOff dist clef  bars  stmless time key   ledger invis
                StaffType.make(S, 'stdNormal', 'Standard', 5, 0, 1, true, true, false, true, true, true, false),
                StaffType.make(P, 'perc1Line', 'Perc. 1 line', 1, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc2Line', 'Perc. 2 lines', 2, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc3Line', 'Perc. 3 lines', 3, 0, 1, true, true, false, true, false, true, false),
                StaffType.make(P, 'perc5Line', 'Perc. 5 lines', 5, 0, 1, true, true, false, true, false, true, false),
                //               xml, name, lines, clef, stemless, time, minim, onLines, rests, stemsDown, stemThrough, upsideDown, fingering, numbers, backTied, genDur, linesThrough
                StaffType.makeTab('tab6StrSimple', 'Tab. 6-str. simple', 6, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab6StrCommon', 'Tab. 6-str. common', 6, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab6StrFull', 'Tab. 6-str. full', 6, true, false, true, M.SLASHED, true, true, true, true, false, true, true, true, false, false),
                StaffType.makeTab('tab4StrSimple', 'Tab. 4-str. simple', 4, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab4StrCommon', 'Tab. 4-str. common', 4, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab4StrFull', 'Tab. 4-str. full', 4, true, false, true, M.SLASHED, true, true, true, true, false, true, true, true, false, false),
                StaffType.makeTab('tab5StrSimple', 'Tab. 5-str. simple', 5, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab5StrCommon', 'Tab. 5-str. common', 5, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab5StrFull', 'Tab. 5-str. full', 5, true, false, true, M.SLASHED, true, true, true, true, false, true, true, true, false, false),
                StaffType.makeTab('tabUkulele', 'Tab. ukulele', 4, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tabBalajka', 'Tab. balalaika', 3, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tabDulcimer', 'Tab. dulcimer', 3, true, false, true, M.SHORTER, true, true, true, false, true, true, true, true, false, false),
                StaffType.makeTab('tab6StrItalian', 'Tab. 6-str. Italian', 6, false, true, true, M.NONE, true, true, false, false, true, false, true, false, true, true),
                StaffType.makeTab('tab6StrFrench', 'Tab. 6-str. French', 6, false, true, true, M.NONE, false, false, false, false, false, false, false, false, true, true),
                StaffType.makeTab('tab7StrCommon', 'Tab. 7-str. common', 7, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab8StrCommon', 'Tab. 8-str. common', 8, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab9StrCommon', 'Tab. 9-str. common', 9, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab10StrCommon', 'Tab. 10-str. common', 10, true, false, true, M.SHORTER, true, true, true, false, false, true, true, true, false, false),
                StaffType.makeTab('tab7StrSimple', 'Tab. 7-str. simple', 7, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab8StrSimple', 'Tab. 8-str. simple', 8, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab9StrSimple', 'Tab. 9-str. simple', 9, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
                StaffType.makeTab('tab10StrSimple', 'Tab. 10-str. simple', 10, true, true, false, M.NONE, true, false, true, false, false, false, true, false, false, false),
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
