/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the logic of src/notationscene/widgets/editstafftype.h/.cpp ("Advanced style properties" of the
 * Staff/Part properties dialog): the values of the dialog's controls from a staff type (setValues), the staff type from
 * them (setFromDlg), the compatibility of the tablature options (tab*Compatibility: what the dialog checks and enables),
 * the templates of the instrument (resetToTemplateClicked) and the preview (the staff type on the first staff of
 * MuseScore's std_sample.mscx / tab_sample.mscx, given by the app).
 */

import { Fraction } from '../engraving/types/fraction'
import { Spatium } from '../engraving/types/dimension'
import { NoteHeadScheme, StaffGroup, TextStyleType } from '../engraving/types/types'
import { TConv } from '../engraving/types/typesconv'
import { StaffType, TablatureMinimStyle, TablatureSymbolRepeat, type StaffTypes } from '../engraving/dom/stafftype'
import { allTextStyles } from '../engraving/style/textstyle'
import type { Instrument } from '../engraving/dom/instrument'
import type { MasterScore } from '../engraving/dom/masterscore'
import type { Score } from '../engraving/dom/score'

export const NOTEHEAD_SCHEMES: readonly NoteHeadScheme[] = [
    NoteHeadScheme.HEAD_NORMAL,
    NoteHeadScheme.HEAD_PITCHNAME,
    NoteHeadScheme.HEAD_PITCHNAME_NO_ACCIDENTALS,
    NoteHeadScheme.HEAD_PITCHNAME_GERMAN,
    NoteHeadScheme.HEAD_PITCHNAME_GERMAN_NO_ACCIDENTALS,
    NoteHeadScheme.HEAD_SOLFEGE,
    NoteHeadScheme.HEAD_SOLFEGE_FIXED,
    NoteHeadScheme.HEAD_SHAPE_NOTE_4,
    NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN,
    NoteHeadScheme.HEAD_SHAPE_NOTE_7_FUNK,
    NoteHeadScheme.HEAD_SHAPE_NOTE_7_WALKER,
]

export type TabNoteValues = 'none' | 'symbols' | 'stems'

/** the values of the dialog's controls */
export interface EditStaffTypeValues {
    group: StaffGroup
    name: string
    lines: number
    lineDistance: number
    genClef: boolean
    showBarlines: boolean
    genTimesig: boolean
    // pitched
    genKeysigPitched: boolean
    showLedgerLinesPitched: boolean
    stemlessPitched: boolean
    noteHeadScheme: NoteHeadScheme
    // percussion
    genKeysigPercussion: boolean
    showLedgerLinesPercussion: boolean
    stemlessPercussion: boolean
    // tablature
    upsideDown: boolean
    showTabFingering: boolean
    fretUseTextStyle: boolean
    fretTextStyle: TextStyleType
    fretFontIdx: number
    fretFontSize: number
    fretY: number
    useNumbers: boolean
    onLines: boolean
    linesThrough: boolean
    durFontIdx: number
    durFontSize: number
    durY: number
    stemsDown: boolean
    stemThrough: boolean
    minimStyle: TablatureMinimStyle
    symRepeat: TablatureSymbolRepeat
    noteValues: TabNoteValues
    showRests: boolean
}

/** which tablature controls are enabled (tabStemsCompatibility etc.) */
export interface EditStaffTypeEnabled {
    valuesRepeat: boolean
    stemAboveBelow: boolean
    stemBeside: boolean
    stemThrough: boolean
    minimNone: boolean
    minimShort: boolean
    minimSlashed: boolean
}

export class EditStaffType {
    private staffType: StaffType
    private m_values!: EditStaffTypeValues
    private m_templates: { name: string; idx: number }[] = []

    /** score: the score of the staff (the user names of its text styles) */
    constructor(staffType: StaffType, instrument: Instrument | null, private m_score: Score | null = null) {
        this.staffType = staffType.clone()
        if (instrument) {
            this.setInstrument(instrument)
        }
        this.setValues()
    }

    values(): EditStaffTypeValues { return { ...this.m_values } }
    /** getStaffType(): the staff type of the controls */
    getStaffType(): StaffType {
        this.setFromDlg()
        return this.staffType.clone()
    }

    groupName(): string { return TConv.translatedUserNameStaffGroup(this.m_values.group) }

    static noteHeadSchemeName(s: NoteHeadScheme): string { return TConv.translatedUserNameNoteHeadScheme(s) }
    static fretFontNames(): string[] { return StaffType.tabFontNames(false) }
    static durationFontNames(): string[] { return StaffType.tabFontNames(true) }

    /** textStyleNames(): the translated names of all text styles (the score's user names) */
    textStyleNames(): { style: TextStyleType; name: string }[] {
        const score = this.m_score
        return allTextStyles().map(tid => ({
            style: tid,
            name: (score ? score.getTextStyleUserName(tid) : TConv.userNameTextStyleType(tid)).translated(),
        }))
    }

    /** the template combo: the presets of the instrument's staff groups */
    templates(): { name: string; idx: number }[] { return this.m_templates }

    private setInstrument(instrument: Instrument): void {
        this.m_templates = []
        // standard group also as fall-back (but excluded by percussion)
        const bStandard = !instrument.drumset()
        const bPerc = !!instrument.drumset()
        const bTab = instrument.stringData().frettedStrings() > 0
        let idx = 0
        for (const t of StaffType.presets()) {
            if ((t.group() === StaffGroup.STANDARD && bStandard)
                || (t.group() === StaffGroup.PERCUSSION && bPerc)
                || (t.group() === StaffGroup.TAB && bTab && t.lines() <= instrument.stringData().frettedStrings())) {
                this.m_templates.push({ name: t.name(), idx })
            }
            idx++
        }
    }

    resetToTemplate(idx: number): void {
        if (idx >= 0) {
            this.staffType = StaffType.preset(idx as StaffTypes).clone()
            this.setValues()
        }
    }

    private setValues(): void {
        const st = this.staffType
        const durIdx = Math.max(0, EditStaffType.durationFontNames().findIndex(n => n.toLowerCase() === st.durationFontName().toLowerCase()))
        // convert combined values of genDurations and slashStyle/stemless into noteValuesx radio buttons
        const noteValues: TabNoteValues = st.genDurations() ? 'symbols' : st.stemless() ? 'none' : 'stems'
        this.m_values = {
            group: st.group(),
            name: st.name(),
            lines: st.lines(),
            lineDistance: st.lineDistance().val(),
            genClef: st.genClef(),
            showBarlines: st.showBarlines(),
            genTimesig: st.genTimesig(),
            genKeysigPitched: st.genKeysig(),
            showLedgerLinesPitched: st.showLedgerLines(),
            stemlessPitched: st.stemless(),
            noteHeadScheme: st.noteHeadScheme(),
            genKeysigPercussion: st.genKeysig(),
            showLedgerLinesPercussion: st.showLedgerLines(),
            stemlessPercussion: st.stemless(),
            upsideDown: st.upsideDown(),
            showTabFingering: st.showTabFingering(),
            fretUseTextStyle: st.fretUseTextStyle(),
            fretTextStyle: st.fretTextStyle(),
            fretFontIdx: st.fretPresetIdx(),
            fretFontSize: st.fretFontSize(),
            fretY: st.fretFontUserY(),
            useNumbers: st.useNumbers(),
            onLines: st.onLines(),
            linesThrough: st.linesThrough(),
            durFontIdx: durIdx,
            durFontSize: st.durationFontSize(),
            durY: st.durationFontUserY(),
            // Above/Below, Beside/Through and minim are only used if stems-and-beams
            // but set them from stt values anyway, to ensure preset matching
            stemsDown: st.stemsDown(),
            stemThrough: st.stemThrough(),
            minimStyle: st.minimStyle(),
            symRepeat: st.symRepeat(),
            noteValues,
            showRests: st.showRests(),
        }
        // adjust compatibility across different settings
        this.tabStemThroughCompatibility(this.m_values.stemThrough)
        this.tabMinimShortCompatibility(this.m_values.minimStyle === TablatureMinimStyle.SHORTER)
    }

    /**
     * the changed controls; like the dialog's slots: a font sets its default size and offset
     * (durFontNameChanged / fretFontNameChanged), "minim short" and "stems through" exclude each other
     */
    set(patch: Partial<EditStaffTypeValues>): void {
        this.m_values = { ...this.m_values, ...patch }
        if (patch.durFontIdx !== undefined) {
            const d = StaffType.tabFontData(true, patch.durFontIdx)
            if (d) {
                this.m_values.durFontSize = d.size
                this.m_values.durY = d.yOffset
            }
        }
        if (patch.fretFontIdx !== undefined) {
            const d = StaffType.tabFontData(false, patch.fretFontIdx)
            if (d) {
                this.m_values.fretFontSize = d.size
                this.m_values.fretY = d.yOffset
            }
        }
        if (patch.minimStyle !== undefined) {
            this.tabMinimShortCompatibility(patch.minimStyle === TablatureMinimStyle.SHORTER)
        }
        if (patch.stemThrough !== undefined) {
            this.tabStemThroughCompatibility(patch.stemThrough)
        }
    }

    /** Setting "short minim" stems is incompatible with "stems through": then "stems beside" */
    private tabMinimShortCompatibility(checked: boolean): void {
        if (checked && this.m_values.stemThrough) {
            this.m_values.stemThrough = false
        }
    }

    /** Setting "stems through" is incompatible with "minim short": then "minim slashed" */
    private tabStemThroughCompatibility(checked: boolean): void {
        if (checked && this.m_values.minimStyle === TablatureMinimStyle.SHORTER) {
            this.m_values.minimStyle = TablatureMinimStyle.SLASHED
        }
    }

    /** tabStemsCompatibility / tabMinimShortCompatibility / tabStemThroughCompatibility: the enabled controls */
    enabled(): EditStaffTypeEnabled {
        const v = this.m_values
        const stems = v.noteValues === 'stems'
        const minimShort = v.minimStyle === TablatureMinimStyle.SHORTER
        return {
            valuesRepeat: v.noteValues === 'symbols',
            stemAboveBelow: stems && !v.stemThrough,
            stemBeside: stems,
            stemThrough: stems && !minimShort,
            minimNone: stems,
            minimShort: stems && !v.stemThrough,
            minimSlashed: stems,
        }
    }

    /** initializes the StaffType from dlg controls */
    private setFromDlg(): void {
        const v = this.m_values
        const st = this.staffType
        st.setName(v.name)
        st.setLines(v.lines)
        st.setLineDistance(new Spatium(v.lineDistance))
        st.setGenClef(v.genClef)
        st.setShowBarlines(v.showBarlines)
        st.setGenTimesig(v.genTimesig)
        if (st.group() === StaffGroup.STANDARD) {
            st.setGenKeysig(v.genKeysigPitched)
            st.setShowLedgerLines(v.showLedgerLinesPitched)
            st.setStemless(v.stemlessPitched)
            st.setNoteHeadScheme(v.noteHeadScheme)
        }
        if (st.group() === StaffGroup.PERCUSSION) {
            st.setGenKeysig(v.genKeysigPercussion)
            st.setShowLedgerLines(v.showLedgerLinesPercussion)
            st.setStemless(v.stemlessPercussion)
        }
        if (st.group() === StaffGroup.TAB) {
            st.setDurationFontName(EditStaffType.durationFontNames()[v.durFontIdx] ?? '')
            st.setDurationFontSize(v.durFontSize)
            st.setDurationFontUserY(v.durY)
            st.setFretUseTextStyle(v.fretUseTextStyle)
            if (st.fretUseTextStyle()) {
                st.setFretTextStyle(v.fretTextStyle)
            } else {
                st.setFretPresetIdx(v.fretFontIdx)
                st.setFretFontSize(v.fretFontSize)
                st.setFretFontUserY(v.fretY)
            }
            st.setLinesThrough(v.linesThrough)
            st.setMinimStyle(v.minimStyle)
            st.setSymbolRepeat(v.symRepeat)
            st.setOnLines(v.onLines)
            st.setShowRests(v.showRests)
            st.setUpsideDown(v.upsideDown)
            st.setShowTabFingering(v.showTabFingering)
            st.setUseNumbers(v.useNumbers)
            //note values
            st.setStemsDown(v.stemsDown)
            st.setStemsThrough(v.stemThrough)
            st.setGenKeysig(false)
            st.setStemless(true) // assume no note values
            st.setGenDurations(false) //    "     "
            if (v.noteValues === 'symbols') {
                st.setGenDurations(true)
            }
            if (v.noteValues === 'stems') {
                st.setStemless(false)
            }
        }
    }

    /** the preview: the staff type on the first staff of the sample score (standard or tablature), laid out again */
    updatePreview(preview: MasterScore): void {
        this.setFromDlg()
        preview.staff(0)!.setStaffType(new Fraction(0, 1), this.staffType)
        preview.setLayoutAll()
        preview.doLayout()
    }
}
