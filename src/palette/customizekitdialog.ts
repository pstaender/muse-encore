/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/widgets/customizekitdialog.h/.cpp (Customize kit, action "customize-kit"): the logic of the
 * dialog without its widgets. The state of the widgets (the pitch list's current item, the name field, the notehead
 * group combo, "Edit noteheads" with its four notehead combos, voice, staff line, stem direction) is kept here; the
 * setters are the widgets' signals (QSignalBlocker'd updates are plain assignments). Every change of a value applies
 * the edited drumset to the score (INotationParts::replaceDrumset); Cancel restores the original one.
 * The example (drumNote) is a palette cell drawn by the app; load/save read and write .drm XML text.
 */

import { Chord } from '../engraving/dom/chord'
import { DRUM_INSTRUMENTS, Drumset } from '../engraving/dom/drumset'
import { Note } from '../engraving/dom/note'
import { gpaletteScore } from '../engraving/dom/palettescore'
import type { Part } from '../engraving/dom/part'
import { Stem } from '../engraving/dom/stem'
import { pitch2string } from '../engraving/dom/utils'
import { scoreDummy } from '../engraving/compat/dummyelement'
import { Smufl } from '../engraving/infrastructure/smufl'
import { ScoreRenderer } from '../engraving/rendering/score/scorerenderer'
import { XmlReader } from '../engraving/rw/xmlreader'
import { XmlWriter } from '../engraving/rw/xmlwriter'
import { Constants } from '../engraving/types/constants'
import type { Fraction } from '../engraving/types/fraction'
import { Spatium } from '../engraving/types/dimension'
import { SymId } from '../engraving/types/symid'
import { SymNames } from '../engraving/types/symnames'
import { DirectionV, DurationType, NoteHeadGroup, NoteHeadType } from '../engraving/types/types'
import { TConv } from '../engraving/types/typesconv'
import type { InstrumentKey } from '../notation/notationtypes'
import { PaletteCell } from './palettecell'

/** the notehead groups of the combo ("Sol" and "Alt. Brevis" omitted, as not being useful for drums) */
export const NOTE_HEAD_NAMES: readonly NoteHeadGroup[] = [
    NoteHeadGroup.HEAD_NORMAL,
    NoteHeadGroup.HEAD_CROSS,
    NoteHeadGroup.HEAD_PLUS,
    NoteHeadGroup.HEAD_XCIRCLE,
    NoteHeadGroup.HEAD_WITHX,
    NoteHeadGroup.HEAD_TRIANGLE_UP,
    NoteHeadGroup.HEAD_TRIANGLE_DOWN,
    NoteHeadGroup.HEAD_SLASH,
    NoteHeadGroup.HEAD_SLASHED1,
    NoteHeadGroup.HEAD_SLASHED2,
    NoteHeadGroup.HEAD_DIAMOND,
    NoteHeadGroup.HEAD_DIAMOND_OLD,
    NoteHeadGroup.HEAD_CIRCLED,
    NoteHeadGroup.HEAD_CIRCLED_LARGE,
    NoteHeadGroup.HEAD_LARGE_ARROW,
    NoteHeadGroup.HEAD_DO,
    NoteHeadGroup.HEAD_RE,
    NoteHeadGroup.HEAD_MI,
    NoteHeadGroup.HEAD_FA,
    NoteHeadGroup.HEAD_LA,
    NoteHeadGroup.HEAD_TI,
    NoteHeadGroup.HEAD_SWISS_RUDIMENTS_FLAM,
    NoteHeadGroup.HEAD_SWISS_RUDIMENTS_DOUBLE,
    NoteHeadGroup.HEAD_CUSTOM,
]

const VALID_NOTEHEAD_RANGES = [
    'Noteheads',
    'Round and square noteheads',
    'Slash noteheads',
    'Shape note noteheads',
    'Shape note noteheads supplement',
    'Techniques noteheads',
]

const EXCLUDED_SYMS = [SymId.noteheadParenthesisLeft, SymId.noteheadParenthesisRight, SymId.noteheadParenthesis, SymId.noteheadNull]

const PRIMARY_NOTEHEADS = [
    SymId.noteheadXOrnate, SymId.noteheadXBlack, SymId.noteheadXHalf, SymId.noteheadXWhole, SymId.noteheadXDoubleWhole,
    SymId.noteheadSlashedBlack1, SymId.noteheadSlashedHalf1, SymId.noteheadSlashedWhole1, SymId.noteheadSlashedDoubleWhole1,
    SymId.noteheadSlashedBlack2, SymId.noteheadSlashedHalf2, SymId.noteheadSlashedWhole2, SymId.noteheadSlashedDoubleWhole2,
    SymId.noteheadSquareBlack, SymId.noteheadMoonBlack, SymId.noteheadTriangleUpRightBlack, SymId.noteheadTriangleDownBlack,
    SymId.noteheadTriangleUpBlack, SymId.noteheadTriangleLeftBlack, SymId.noteheadTriangleRoundDownBlack,
    SymId.noteheadDiamondBlack, SymId.noteheadDiamondHalf, SymId.noteheadDiamondWhole, SymId.noteheadDiamondDoubleWhole,
    SymId.noteheadRoundWhiteWithDot, SymId.noteheadVoidWithX, SymId.noteheadHalfWithX, SymId.noteheadWholeWithX,
    SymId.noteheadDoubleWholeWithX, SymId.noteheadLargeArrowUpBlack, SymId.noteheadLargeArrowUpHalf,
    SymId.noteheadLargeArrowUpWhole, SymId.noteheadLargeArrowUpDoubleWhole,
]

let s_noteheadSymbols: SymId[] | null = null

/** the items of the four notehead combos: the primary noteheads, then the notehead ranges of SMuFL */
export function customizeKitNoteheadSymbols(): readonly SymId[] {
    if (!s_noteheadSymbols) {
        const res = [...PRIMARY_NOTEHEADS]
        for (const range of VALID_NOTEHEAD_RANGES) {
            for (const symId of Smufl.smuflRanges().get(range) ?? []) {
                if (!EXCLUDED_SYMS.includes(symId) && !PRIMARY_NOTEHEADS.includes(symId)) {
                    res.push(symId)
                }
            }
        }
        s_noteheadSymbols = res
    }
    return s_noteheadSymbols
}

/** the combos of "Edit noteheads" by NoteHeadType (whole, half, quarter, double whole) */
export type CustomNoteheads = [whole: SymId, half: SymId, quarter: SymId, brevis: SymId]

export interface CustomizeKitRow {
    pitch: number
    note: string
    shortcut: string
    name: string
}

/** what the dialog needs of the notation (C++ m_notation: parts()->replaceDrumset) */
export interface CustomizeKitNotation {
    replaceDrumset(instrumentKey: InstrumentKey, newDrumset: Drumset): void
}

export class CustomizeKitDialog {
    private m_instrumentKey: InstrumentKey | null = null
    private m_originDrumset = new Drumset()
    private m_editedDrumset = new Drumset()

    /** the pitch list (sorted like the QTreeWidget) and its current item */
    private m_rows: CustomizeKitRow[] = []
    private m_currentPitch = -1

    // the widgets
    private m_name = ''
    private m_noteHead: NoteHeadGroup = NoteHeadGroup.HEAD_NORMAL
    private m_customGroup = false
    private m_noteheads: CustomNoteheads = [SymId.noteheadWhole, SymId.noteheadHalf, SymId.noteheadBlack, SymId.noteheadDoubleWhole]
    private m_staffLine = 0
    private m_voice = 0
    private m_stemDirection = DirectionV.AUTO

    /**
     * `part`/`tick`: the instrument of the hit element or of the note input (C++ initDrumsetAndKey);
     * `originPitch`: the pitch of the context item's note (selected first)
     */
    constructor(private readonly m_notation: CustomizeKitNotation, part: Part, tick: Fraction, originPitch = -1) {
        const inst = part.instrument(tick)
        if (!inst || !inst.useDrumset() || !inst.drumset()) {
            return
        }
        this.m_instrumentKey = { instrumentId: inst.id(), partId: part.id(), tick }
        this.m_originDrumset = inst.drumset()!.clone()
        this.m_editedDrumset = this.m_originDrumset.clone()

        const itemToSelect = this.loadPitchesList(originPitch)
        this.setCurrentPitch(itemToSelect ?? this.m_rows[0].pitch)
    }

    isValid(): boolean { return this.m_instrumentKey !== null }

    rows(): readonly CustomizeKitRow[] { return this.m_rows }
    currentPitch(): number { return this.m_currentPitch }
    editedDrumset(): Drumset { return this.m_editedDrumset }

    name(): string { return this.m_name }
    noteHead(): NoteHeadGroup { return this.m_noteHead }
    customGroup(): boolean { return this.m_customGroup }
    customNoteheads(): Readonly<CustomNoteheads> { return this.m_noteheads }
    staffLine(): number { return this.m_staffLine }
    voice(): number { return this.m_voice }
    stemDirection(): DirectionV { return this.m_stemDirection }
    /** the shortcut button's text (empty: "None") */
    shortcut(): string { return this.m_editedDrumset.shortcut(this.m_currentPitch) }
    /** setEnabledPitchControls: the controls are enabled if the drum has a name */
    pitchControlsEnabled(): boolean { return this.m_name.length > 0 }

    private loadPitchesList(originPitch: number): number | null {
        let itemToSelect: number | null = null
        const rows: CustomizeKitRow[] = []
        for (let i = 0; i < DRUM_INSTRUMENTS; ++i) {
            rows.push({
                pitch: i, note: pitch2string(i), shortcut: this.m_editedDrumset.shortcut(i),
                name: this.m_editedDrumset.translatedName(i),
            })
            if (i === originPitch) {
                itemToSelect = i
            }
        }
        // pitchList->sortItems(Column::NAME, Qt::DescendingOrder) (stable)
        rows.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
        this.m_rows = rows
        return itemToSelect
    }

    /** the pitch list sorted by a column (the header of the QTreeWidget; the pitch column by number) */
    sortRows(column: 'pitch' | 'note' | 'shortcut' | 'name', descending: boolean): void {
        const key = (r: CustomizeKitRow): string | number => column === 'pitch' ? r.pitch : r[column]
        this.m_rows.sort((a, b) => {
            const ka = key(a)
            const kb = key(b)
            const c = ka < kb ? -1 : ka > kb ? 1 : 0
            return descending ? -c : c
        })
    }

    private row(pitch: number): CustomizeKitRow | undefined {
        return this.m_rows.find(r => r.pitch === pitch)
    }

    /** customGboxToggled */
    setCustomGroup(checked: boolean): void {
        this.m_customGroup = checked
        // noteHead->setCurrentIndex(...) emits currentIndexChanged -> valueChanged
        this.setNoteHead(checked ? NoteHeadGroup.HEAD_CUSTOM : NoteHeadGroup.HEAD_NORMAL)
    }

    /** the name field (nameChanged) */
    setName(n: string): void {
        this.m_name = n
        const row = this.row(this.m_currentPitch)
        if (row) {
            row.name = n
            const pitch = this.m_currentPitch
            if (n.length) {
                if (!this.m_editedDrumset.isValid(pitch)) {
                    this.setNoteHead(NOTE_HEAD_NAMES[0])
                }
            } else {
                this.m_editedDrumset.drum(pitch).name = ''
            }
        }
    }

    /** the notehead group combo */
    setNoteHead(group: NoteHeadGroup): void {
        if (this.m_noteHead === group) {
            return
        }
        this.m_noteHead = group
        this.valueChanged()
    }

    /** one of the "Edit noteheads" combos (only the quarter's updates the example, like C++) */
    setCustomNotehead(type: NoteHeadType, sym: SymId): void {
        this.m_noteheads[CustomizeKitDialog.comboIndex(type)] = sym
    }

    setStaffLine(line: number): void {
        line = Math.max(-12, Math.min(99, Math.round(line)))
        if (this.m_staffLine === line) {
            return
        }
        this.m_staffLine = line
        this.valueChanged()
    }

    setVoice(voice: number): void {
        if (this.m_voice === voice) {
            return
        }
        this.m_voice = voice
        this.valueChanged()
    }

    setStemDirection(dir: DirectionV): void {
        if (this.m_stemDirection === dir) {
            return
        }
        this.m_stemDirection = dir
        this.valueChanged()
    }

    private static comboIndex(type: NoteHeadType): number {
        switch (type) {
        case NoteHeadType.HEAD_WHOLE: return 0
        case NoteHeadType.HEAD_HALF: return 1
        case NoteHeadType.HEAD_QUARTER: return 2
        default: return 3
        }
    }

    private fillCustomNoteheadsDataFromComboboxes(pitch: number): void {
        const drum = this.m_editedDrumset.drum(pitch)
        drum.notehead = NoteHeadGroup.HEAD_CUSTOM
        drum.noteheads[NoteHeadType.HEAD_WHOLE] = this.m_noteheads[0]
        drum.noteheads[NoteHeadType.HEAD_QUARTER] = this.m_noteheads[2]
        drum.noteheads[NoteHeadType.HEAD_HALF] = this.m_noteheads[1]
        drum.noteheads[NoteHeadType.HEAD_BREVIS] = this.m_noteheads[3]
    }

    private fillNoteheadsComboboxes(customGroup: boolean, pitch: number): void {
        const ds = this.m_editedDrumset
        if (customGroup) {
            this.m_noteheads = [ds.noteHeads(pitch, NoteHeadType.HEAD_WHOLE), ds.noteHeads(pitch, NoteHeadType.HEAD_HALF),
                ds.noteHeads(pitch, NoteHeadType.HEAD_QUARTER), ds.noteHeads(pitch, NoteHeadType.HEAD_BREVIS)]
        } else {
            const group = ds.drum(pitch).notehead
            if (group === NoteHeadGroup.HEAD_INVALID) {
                return
            }
            const sym = (t: NoteHeadType): SymId => Note.noteHeadSym(0, group, t)
            this.m_noteheads = [sym(NoteHeadType.HEAD_WHOLE), sym(NoteHeadType.HEAD_HALF), sym(NoteHeadType.HEAD_QUARTER),
                sym(NoteHeadType.HEAD_BREVIS)]
        }
    }

    /** itemChanged: another pitch of the list becomes the current one */
    setCurrentPitch(current: number): void {
        const previous = this.m_currentPitch
        if (previous >= 0) {
            const drum = this.m_editedDrumset.drum(previous)
            drum.name = this.m_name
            if (this.m_customGroup) {
                this.fillCustomNoteheadsDataFromComboboxes(previous)
            } else if (NOTE_HEAD_NAMES.includes(this.m_noteHead)) {
                drum.notehead = this.m_noteHead
            }

            drum.line = this.m_staffLine
            drum.voice = this.m_voice
            drum.stemDirection = this.m_stemDirection

            const row = this.row(previous)
            if (row) {
                row.name = this.m_editedDrumset.translatedName(previous)
            }
        }
        if (current < 0) {
            return
        }

        this.m_currentPitch = current
        const ds = this.m_editedDrumset
        this.m_name = ds.translatedName(current)
        this.m_staffLine = ds.line(current)
        this.m_voice = ds.voice(current)
        this.m_stemDirection = ds.stemDirection(current)

        const nh = ds.noteHead(current)
        const isCustomGroup = nh === NoteHeadGroup.HEAD_CUSTOM
        if (ds.isValid(current)) {
            this.setCustomNoteheadsGUIEnabled(isCustomGroup)
        }
        this.m_noteHead = nh
        this.fillNoteheadsComboboxes(isCustomGroup, current)
    }

    private setCustomNoteheadsGUIEnabled(enabled: boolean): void {
        this.m_customGroup = enabled
        if (enabled) {
            this.m_noteHead = NoteHeadGroup.HEAD_CUSTOM
        }
    }

    /** valueChanged: the values of the current pitch into the edited drumset, which is applied to the score */
    valueChanged(): void {
        if (this.m_currentPitch < 0 || !this.m_instrumentKey) {
            return
        }
        const pitch = this.m_currentPitch
        const drum = this.m_editedDrumset.drum(pitch)
        drum.name = this.m_name
        if (this.m_customGroup || this.m_noteHead === NoteHeadGroup.HEAD_CUSTOM) {
            this.fillCustomNoteheadsDataFromComboboxes(pitch)
            this.setCustomNoteheadsGUIEnabled(true)
        } else {
            drum.notehead = this.m_noteHead
            this.fillNoteheadsComboboxes(false, pitch)
            this.setCustomNoteheadsGUIEnabled(false)
        }

        drum.line = this.m_staffLine
        drum.voice = this.m_voice
        drum.stemDirection = this.m_stemDirection

        this.m_notation.replaceDrumset(this.m_instrumentKey, this.m_editedDrumset)
    }

    /** OK / Apply */
    apply(): void {
        this.valueChanged() // save last changes in name
    }

    /** Cancel: the original drumset is restored */
    cancel(): void {
        if (this.m_instrumentKey) {
            this.m_notation.replaceDrumset(this.m_instrumentKey, this.m_originDrumset)
        }
    }

    /** the example (drumNote): a palette cell with a quarter chord of the current drum; null if the drum has no name */
    exampleCell(): PaletteCell | null {
        const pitch = this.m_currentPitch
        if (!this.m_editedDrumset.isValid(pitch)) {
            return null
        }
        const ds = this.m_editedDrumset
        const line = ds.line(pitch)
        const nh = ds.noteHead(pitch)
        const v = ds.voice(pitch)
        const dir = ds.stemDirection(pitch)
        const up = dir === DirectionV.UP || (dir === DirectionV.AUTO && line > 4)
        const score = gpaletteScore()
        const chord = new Chord(scoreDummy(score).segment())
        chord.setDurationType(DurationType.V_QUARTER)
        chord.setStemDirection(dir)
        chord.setTrack(v)
        // C++ chord->setIsUiItem(true): no UI items in the port (the chord is not part of a score)
        const note = new Note(chord)
        note.setParent(chord)
        note.setTrack(v)
        note.setPitch(pitch)
        note.setTpcFromPitch()
        note.setLine(line)
        note.setPos(0.0, score.style().spatium() * 0.5 * line)
        note.setHeadType(NoteHeadType.HEAD_QUARTER)
        note.setHeadGroup(nh)
        note.mutldata().cachedNoteheadSym = this.m_noteheads[2]
        chord.add(note)
        const stem = new Stem(chord)
        stem.setParent(chord)
        stem.setBaseLength(new Spatium(up ? -3.0 : 3.0))
        ScoreRenderer.layoutItem(stem)
        chord.add(stem)
        return new PaletteCell(chord, ds.translatedName(pitch))
    }

    /** load(): a .drm file; 'tooOld' if the file has another version (the app asks; `ignoreVersion` loads it anyway) */
    load(xml: string, ignoreVersion = false): 'ok' | 'tooOld' {
        const e = new XmlReader(xml)
        const edited = new Drumset()
        edited.clear()
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                if (e.attribute('version') !== Constants.MSC_VERSION_STR && !ignoreVersion) {
                    return 'tooOld'
                }
                while (e.readNextStartElement()) {
                    if (e.name() === 'Drum') {
                        edited.loadDrum(e)
                    } else if (e.name() === 'percussionPanelColumns') {
                        edited.setPercussionPanelColumns(e.readInt())
                    } else {
                        e.unknown()
                    }
                }
            }
        }
        this.m_editedDrumset = edited
        this.m_currentPitch = -1
        this.loadPitchesList(-1)
        this.setCurrentPitch(this.m_rows[0].pitch)
        return 'ok'
    }

    /** save(): the .drm file of the edited drumset */
    save(): string {
        this.valueChanged() // save last changes in name
        const xml = new XmlWriter()
        xml.startDocument()
        xml.startElement('museScore', [['version', Constants.MSC_VERSION_STR]])
        this.m_editedDrumset.save(xml)
        xml.endElement()
        xml.flush()
        return xml.text()
    }

    /** the shortcut of the current pitch changed (PercussionUtilities::editPercussionShortcut, then valueChanged) */
    setShortcut(newShortcut: string, conflictDrumPitch = -1): void {
        const pitch = this.m_currentPitch
        if (!this.m_editedDrumset.isValid(pitch)) {
            return
        }
        this.m_editedDrumset.drum(pitch).shortcut = newShortcut
        if (this.m_editedDrumset.isValid(conflictDrumPitch)) {
            this.m_editedDrumset.drum(conflictDrumPitch).shortcut = ''
        }
        for (const row of this.m_rows) {
            row.shortcut = this.m_editedDrumset.shortcut(row.pitch)
        }
        this.valueChanged()
    }

    /** the other drums with a shortcut (for the shortcut dialog: conflicts) */
    drumsWithShortcut(): { pitch: number; title: string; shortcut: string }[] {
        const res: { pitch: number; title: string; shortcut: string }[] = []
        for (let otherPitch = 0; otherPitch < DRUM_INSTRUMENTS; ++otherPitch) {
            if (otherPitch === this.m_currentPitch || !this.m_editedDrumset.isValid(otherPitch)
                || !this.m_editedDrumset.shortcut(otherPitch)) {
                continue
            }
            res.push({ pitch: otherPitch, title: this.m_editedDrumset.translatedName(otherPitch), shortcut: this.m_editedDrumset.shortcut(otherPitch) })
        }
        return res
    }

    static noteHeadName(group: NoteHeadGroup): string {
        return TConv.userNameNoteHeadGroup(group).translated()
    }

    static symbolName(id: SymId): string {
        return SymNames.translatedUserNameForSymId(id)
    }
}
