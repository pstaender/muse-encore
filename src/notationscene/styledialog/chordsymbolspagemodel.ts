/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/chordsymbolspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'
import { qtrc } from '../../framework/global/translation'
import { Notification } from '../../notation/internal/notationundostack'
import { ChordStylePreset, DisplayCapoChordType, NoteSpellingType } from '../../engraving/types/types'
import { HDuration, Voicing } from '../../engraving/dom/realizedharmony'
import { registerChordListFile } from '../../engraving/dom/chordlist'

export class ChordSymbolsPageModel extends AbstractStyleDialogModel {
    private m_changePreset = new Notification()

    constructor(style: NotationStyle) {
        super(style, [
            Sid.chordStyle,
            Sid.chordsXmlFile,
            Sid.chordDescriptionFile,
            Sid.chordExtensionMag,
            Sid.chordExtensionAdjust,
            Sid.chordModifierMag,
            Sid.chordModifierAdjust,
            Sid.verticallyStackModifiers,
            Sid.chordBassNoteStagger,
            Sid.chordBassNoteScale,
            Sid.polychordDividerThickness,
            Sid.polychordDividerSpacing,
            Sid.harmonyParenUseSmuflSym,
            Sid.verticallyAlignChordSymbols,
            Sid.chordSymPosition,
            Sid.chordAlignmentToFretboard,
            Sid.chordAlignmentExcludeModifiers,
            Sid.chordSymbolSpelling,
            Sid.automaticCapitalization,
            Sid.lowerCaseMinorChords,
            Sid.lowerCaseBassNotes,
            Sid.allCapsNoteNames,
            Sid.harmonyFretDist,
            Sid.minHarmonyDistance,
            Sid.harmonyHarmonyDistance,
            Sid.harmonyVoiceLiteral,
            Sid.harmonyVoicing,
            Sid.harmonyDuration,
            Sid.displayCapoChords,
            Sid.capoPosition,
        ])
    }

    chordStylePreset(): StyleItem { return this.styleItem(Sid.chordStyle) }
    chordDescriptionFile(): StyleItem { return this.styleItem(Sid.chordDescriptionFile) }
    extensionMag(): StyleItem { return this.styleItem(Sid.chordExtensionMag) }
    extensionAdjust(): StyleItem { return this.styleItem(Sid.chordExtensionAdjust) }
    modifierMag(): StyleItem { return this.styleItem(Sid.chordModifierMag) }
    modifierAdjust(): StyleItem { return this.styleItem(Sid.chordModifierAdjust) }
    verticallyStackModifiers(): StyleItem { return this.styleItem(Sid.verticallyStackModifiers) }
    chordBassNoteStagger(): StyleItem { return this.styleItem(Sid.chordBassNoteStagger) }
    chordBassNoteScale(): StyleItem { return this.styleItem(Sid.chordBassNoteScale) }
    polychordDividerThickness(): StyleItem { return this.styleItem(Sid.polychordDividerThickness) }
    polychordDividerSpacing(): StyleItem { return this.styleItem(Sid.polychordDividerSpacing) }
    verticallyAlignChordSymbols(): StyleItem { return this.styleItem(Sid.verticallyAlignChordSymbols) }
    chordAlignmentToNotehead(): StyleItem { return this.styleItem(Sid.chordSymPosition) }
    chordAlignmentToFretboard(): StyleItem { return this.styleItem(Sid.chordAlignmentToFretboard) }
    chordAlignmentExcludeModifiers(): StyleItem { return this.styleItem(Sid.chordAlignmentExcludeModifiers) }
    chordSymbolSpelling(): StyleItem { return this.styleItem(Sid.chordSymbolSpelling) }
    automaticCapitalization(): StyleItem { return this.styleItem(Sid.automaticCapitalization) }
    lowerCaseMinorChords(): StyleItem { return this.styleItem(Sid.lowerCaseMinorChords) }
    lowerCaseBassNotes(): StyleItem { return this.styleItem(Sid.lowerCaseBassNotes) }
    allCapsNoteNames(): StyleItem { return this.styleItem(Sid.allCapsNoteNames) }
    harmonyFretDist(): StyleItem { return this.styleItem(Sid.harmonyFretDist) }
    minHarmonyDist(): StyleItem { return this.styleItem(Sid.minHarmonyDistance) }
    harmonyHarmonyDist(): StyleItem { return this.styleItem(Sid.harmonyHarmonyDistance) }
    harmonyVoiceLiteral(): StyleItem { return this.styleItem(Sid.harmonyVoiceLiteral) }
    harmonyVoicing(): StyleItem { return this.styleItem(Sid.harmonyVoicing) }
    harmonyDuration(): StyleItem { return this.styleItem(Sid.harmonyDuration) }
    displayCapoChords(): StyleItem { return this.styleItem(Sid.displayCapoChords) }
    capoPosition(): StyleItem { return this.styleItem(Sid.capoPosition) }
    useSmuflSymbols(): StyleItem { return this.styleItem(Sid.harmonyParenUseSmuflSym) }

    possiblePresetOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Standard'), value: ChordStylePreset.STANDARD },
            { text: qtrc('notation/editstyle/chordsymbols', 'Jazz'), value: ChordStylePreset.JAZZ },
            { text: qtrc('notation/editstyle/chordsymbols', 'Legacy MuseScore'), value: ChordStylePreset.LEGACY },
            { text: qtrc('notation/editstyle/chordsymbols', 'Load custom XML…'), value: ChordStylePreset.CUSTOM },
        ]
    }

    isCustomXml(): boolean {
        return this.chordStylePreset().value() === ChordStylePreset.CUSTOM
    }

    isLegacyXml(): boolean {
        return this.chordStylePreset().value() === ChordStylePreset.LEGACY
    }

    /** the signal changePreset */
    changePreset(): Notification { return this.m_changePreset }

    setChordStyle(selection: ChordStylePreset): void {
        switch (selection) {
        case ChordStylePreset.STANDARD:
            this.chordDescriptionFile().modifyValue('chords_std.xml')
            break
        case ChordStylePreset.JAZZ:
            this.chordDescriptionFile().modifyValue('chords_jazz.xml')
            break
        case ChordStylePreset.LEGACY:
            this.chordBassNoteStagger().modifyValue(false)
            this.chordDescriptionFile().modifyValue('chords_legacy.xml')
            break
        case ChordStylePreset.CUSTOM:
            // Handled on file open
            break
        }

        this.m_changePreset.notify()
    }

    /**
     * C++ asks for a chord description file with the file dialog; here the UI chooses the file and passes its name and
     * content, which is registered for the chord list (registerChordListFile).
     */
    selectChordDescriptionFile(path: string, content: string): void {
        if (!path) {
            return
        }

        registerChordListFile(path, content)
        this.chordDescriptionFile().modifyValue(path)
    }

    possibleChordSymbolSpellings(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Standard'), value: NoteSpellingType.STANDARD },
            { text: qtrc('notation/editstyle/chordsymbols', 'German'), value: NoteSpellingType.GERMAN },
            { text: qtrc('notation/editstyle/chordsymbols', 'Full German'), value: NoteSpellingType.GERMAN_PURE },
            { text: qtrc('notation/editstyle/chordsymbols', 'Solfeggio'), value: NoteSpellingType.SOLFEGGIO },
            { text: qtrc('notation/editstyle/chordsymbols', 'French'), value: NoteSpellingType.FRENCH },
        ]
    }

    possibleHarmonyVoiceLiteralOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Jazz'), value: 0 },
            { text: qtrc('notation/editstyle/chordsymbols', 'Literal'), value: 1 },
        ]
    }

    possibleHarmonyVoicingOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Automatic'), value: Voicing.AUTO },
            { text: qtrc('notation/editstyle/chordsymbols', 'Root only'), value: Voicing.ROOT_ONLY },
            { text: qtrc('notation/editstyle/chordsymbols', 'Close'), value: Voicing.CLOSE },
            { text: qtrc('notation/editstyle/chordsymbols', 'Drop two'), value: Voicing.DROP_2 },
            { text: qtrc('notation/editstyle/chordsymbols', 'Six note'), value: Voicing.SIX_NOTE },
            { text: qtrc('notation/editstyle/chordsymbols', 'Four note'), value: Voicing.FOUR_NOTE },
            { text: qtrc('notation/editstyle/chordsymbols', 'Three note'), value: Voicing.THREE_NOTE },
        ]
    }

    possibleHarmonyDurationOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Until next chord symbol'), value: HDuration.UNTIL_NEXT_CHORD_SYMBOL },
            { text: qtrc('notation/editstyle/chordsymbols', 'Until end of measure'), value: HDuration.STOP_AT_MEASURE_END },
            { text: qtrc('notation/editstyle/chordsymbols', 'Chord/rest duration'), value: HDuration.SEGMENT_DURATION },
        ]
    }

    possibleCapoDisplayOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/chordsymbols', 'Don’t show chord symbols transposed by capo'), value: DisplayCapoChordType.CONCERT },
            { text: qtrc('notation/editstyle/chordsymbols', 'Show chord symbols & transposed symbols'), value: DisplayCapoChordType.BOTH },
            { text: qtrc('notation/editstyle/chordsymbols', 'Show transposed symbols only'), value: DisplayCapoChordType.TRANSPOSED },
        ]
    }
}
