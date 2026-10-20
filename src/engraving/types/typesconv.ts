/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/typesconv.h/.cpp
 *
 * C++ uses overloads of TConv::fromXml/toXml; here every type has its own function
 * (e.g. TConv.fromXmlAlignH). The tables are generated into typesconvdata.ts.
 */

import { SymId } from './symid'
import { SymNames } from './symnames'
import {
    Align, AlignH, AlignV, AutoOnOff, BarLineType, BeamMode, BracketType, ChordStylePreset, ClefType,
    DirectionH, DirectionV, DurationType, ChangeMethod, DynamicSpeed, DynamicType, ElementType, GlissandoStyle, HookType, KeyMode,
    LayoutBreakType, LineType, LyricsSyllabic, MarkerType, MeasureNumberPlacement, NoteHeadGroup, NoteHeadScheme,
    NoteHeadType, NoteSpellingType, Orientation, OrnamentInterval, OrnamentStyle, PlacementH, PlacementV,
    RepeatPlayCountPreset, StaffGroup, TextPlace, TextStyleType, TieDotsPlacement, TiePlacement, TimeSigPlacement,
    TimeSigStyle, TimeSigVSMargin, TremoloType, TrillType, VoiceAssignment, AutoCustomHide, LyricsDashSystemStart,
    ArpeggioType, JumpType, GlissandoType, VeloType, ArticulationTextType, VibratoType, PartialSpannerDirection, GradualTempoChangeType,
} from './types'
import * as D from './typesconvdata'
import type { Item } from './typesconvdata'
import { TranslatableString } from '../../framework/global/types/translatablestring'

function findXmlTagByType<T>(cont: readonly Item<T>[], v: T): string {
    const it = cont.find(i => i.type === v)
    return it ? it.xml : ''
}

/** C++ findUserNameByType (the Item's userName) */
function findTUserNameByType<T>(cont: readonly Item<T>[], v: T): TranslatableString {
    return TranslatableString.from(cont.find(i => i.type === v)?.tUserName)
}

/** C++ findCapitalizedUserNameByType */
function findCapitalizedUserNameByType<T>(cont: readonly Item<T>[], v: T): TranslatableString {
    return TranslatableString.from(cont.find(i => i.type === v)?.tCapitalizedUserName)
}

/** tables of other structs than Item (e.g. DynamicItem) with only one translatable string */
function findSingleUserNameByType<T>(cont: readonly Item<T>[], v: T): TranslatableString {
    const it = cont.find(i => i.type === v)
    return TranslatableString.from(it?.tCapitalizedUserName ?? it?.tUserName)
}

/** C++ KEY_NAMES */
const KEY_NAMES: readonly TranslatableString[] = [
    'C♭ major / A♭ minor', 'G♭ major / E♭ minor', 'D♭ major / B♭ minor', 'A♭ major / F minor', 'E♭ major / C minor',
    'B♭ major / G minor', 'F major / D minor', 'C major / A minor', 'G major / E minor', 'D major / B minor',
    'A major / F♯ minor', 'E major / C♯ minor', 'B major / G♯ minor', 'F♯ major / D♯ minor', 'C♯ major / A♯ minor',
    'Open / Atonal', 'Custom',
].map(s => new TranslatableString('engraving', s))

const ARTICULATION_TEXTS: Partial<Record<ArticulationTextType, string>> = {
    [ArticulationTextType.SLAP]: 'S',
    [ArticulationTextType.POP]: 'P',
    [ArticulationTextType.TD]: 'TD',
    [ArticulationTextType.BD]: 'BD',
    [ArticulationTextType.RT]: 'RT',
    [ArticulationTextType.PL]: 'Pl',
    [ArticulationTextType.SB]: 'SB',
    [ArticulationTextType.VIB]: 'vib.',
}

function findTypeByXmlTag<T>(cont: readonly Item<T>[], tag: string, def: T): T {
    const it = cont.find(i => i.xml === tag)
    return it ? it.type : def
}

/** compatibility: old files may store enums as integers */
function compatInt<T>(tag: string, def: T): T {
    if (/^-?\d+$/.test(tag.trim())) {
        return parseInt(tag, 10) as unknown as T
    }
    return def
}

const OLD_TST_TAGS: Record<string, TextStyleType> = {
    'Default': TextStyleType.DEFAULT,
    'Title': TextStyleType.TITLE,
    'Subtitle': TextStyleType.SUBTITLE,
    'Composer': TextStyleType.COMPOSER,
    'Lyricist': TextStyleType.LYRICIST,
    'Translator': TextStyleType.TRANSLATOR,
    'Frame': TextStyleType.FRAME,
    'Instrument Name (Part)': TextStyleType.INSTRUMENT_EXCERPT,
    'Instrument Name (Long)': TextStyleType.INSTRUMENT_LONG,
    'Instrument Name (Short)': TextStyleType.INSTRUMENT_SHORT,
    'Instrument Change': TextStyleType.INSTRUMENT_CHANGE,
    'Header': TextStyleType.HEADER,
    'Footer': TextStyleType.FOOTER,
    'Copyright': TextStyleType.COPYRIGHT,
    'Page Number': TextStyleType.PAGE_NUMBER,
    'Measure Number': TextStyleType.MEASURE_NUMBER,
    'Multimeasure Rest Range': TextStyleType.MMREST_RANGE,
    'Tempo': TextStyleType.TEMPO,
    'Metronome': TextStyleType.METRONOME,
    'Repeat Text Left': TextStyleType.REPEAT_LEFT,
    'Repeat Text Right': TextStyleType.REPEAT_RIGHT,
    'Rehearsal Mark': TextStyleType.REHEARSAL_MARK,
    'System': TextStyleType.SYSTEM,
    'Staff': TextStyleType.STAFF,
    'Expression': TextStyleType.EXPRESSION,
    'Dynamics': TextStyleType.DYNAMICS,
    'Hairpin': TextStyleType.HAIRPIN,
    'Lyrics Odd Lines': TextStyleType.LYRICS_ODD,
    'Lyrics Even Lines': TextStyleType.LYRICS_EVEN,
    'Chord Symbol': TextStyleType.HARMONY_A,
    'Chord Symbol (Alternate)': TextStyleType.HARMONY_B,
    'Roman Numeral Analysis': TextStyleType.HARMONY_ROMAN,
    'Nashville Number': TextStyleType.HARMONY_NASHVILLE,
    'Tuplet': TextStyleType.TUPLET,
    'Sticking': TextStyleType.STICKING,
    'Fingering': TextStyleType.FINGERING,
    'LH Guitar Fingering': TextStyleType.LH_GUITAR_FINGERING,
    'RH Guitar Fingering': TextStyleType.RH_GUITAR_FINGERING,
    'String Number': TextStyleType.STRING_NUMBER,
    'Text Line': TextStyleType.TEXTLINE,
    'Note-anchored Line': TextStyleType.NOTELINE,
    'Volta': TextStyleType.VOLTA,
    'Ottava': TextStyleType.OTTAVA,
    'Glissando': TextStyleType.GLISSANDO,
    'Pedal': TextStyleType.PEDAL,
    'Bend': TextStyleType.BEND,
    'Let Ring': TextStyleType.LET_RING,
    'Palm Mute': TextStyleType.PALM_MUTE,
    'User-1': TextStyleType.USER1,
    'User-2': TextStyleType.USER2,
    'User-3': TextStyleType.USER3,
    'User-4': TextStyleType.USER4,
    'User-5': TextStyleType.USER5,
    'User-6': TextStyleType.USER6,
    'User-7': TextStyleType.USER7,
    'User-8': TextStyleType.USER8,
    'User-9': TextStyleType.USER9,
    'User-10': TextStyleType.USER10,
    'User-11': TextStyleType.USER11,
    'User-12': TextStyleType.USER12,
    'Technique': TextStyleType.EXPRESSION,
    '12': TextStyleType.DYNAMICS,
    '26': TextStyleType.STAFF,
}

export const TConv = {
    // ElementType
    toXmlElementType: (v: ElementType): string => findXmlTagByType(D.ELEMENT_TYPES, v),
    fromXmlElementType: (tag: string, def: ElementType = ElementType.INVALID): ElementType => findTypeByXmlTag(D.ELEMENT_TYPES, tag, def),
    userNameElementType: (v: ElementType): TranslatableString => findTUserNameByType(D.ELEMENT_TYPES, v),
    capitalizedUserNameElementType: (v: ElementType): TranslatableString => findCapitalizedUserNameByType(D.ELEMENT_TYPES, v),

    // user names (C++ TConv::userName / translatedUserName overloads)
    userNameClefType: (v: ClefType): TranslatableString => findCapitalizedUserNameByType(D.CLEF_TYPES, v),
    translatedUserNameClefType: (v: ClefType): string => findCapitalizedUserNameByType(D.CLEF_TYPES, v).translated(),
    translatedUserNameDurationType: (v: DurationType): string => findCapitalizedUserNameByType(D.DURATION_TYPES, v).translated(),
    userNameNoteHeadGroup: (v: NoteHeadGroup): TranslatableString => findCapitalizedUserNameByType(D.NOTEHEAD_GROUPS, v),
    userNameDynamicType: (v: DynamicType): TranslatableString => findSingleUserNameByType(D.DYNAMIC_TYPES, v),
    translatedUserNameDynamicType: (v: DynamicType): string => findSingleUserNameByType(D.DYNAMIC_TYPES, v).translated(),
    userNameTextStyleType: (v: TextStyleType): TranslatableString => findCapitalizedUserNameByType(D.TEXTSTYLE_TYPES, v),
    userNameLayoutBreakType: (v: LayoutBreakType): TranslatableString => findCapitalizedUserNameByType(D.LAYOUTBREAK_TYPES, v),
    userNameJumpType: (v: JumpType): TranslatableString => findCapitalizedUserNameByType(D.JUMP_TYPES, v),
    translatedUserNameJumpType: (v: JumpType): string => findCapitalizedUserNameByType(D.JUMP_TYPES, v).translated(),
    userNameMarkerType: (v: MarkerType): TranslatableString => findCapitalizedUserNameByType(D.MARKER_TYPES, v),
    translatedUserNameMarkerType: (v: MarkerType): string => findCapitalizedUserNameByType(D.MARKER_TYPES, v).translated(),
    userNameTrillType: (v: TrillType): TranslatableString => findCapitalizedUserNameByType(D.TRILL_TYPES, v),
    translatedUserNameTrillType: (v: TrillType): string => findCapitalizedUserNameByType(D.TRILL_TYPES, v).translated(),
    userNameTremoloType: (v: TremoloType): TranslatableString => findCapitalizedUserNameByType(D.TREMOLO_TYPES, v),
    userNameArticulationTextType: (v: ArticulationTextType): TranslatableString =>
        findCapitalizedUserNameByType(D.ARTICULATIONTEXT_TYPES, v),
    userNameKey: (v: number, isAtonal: boolean, isCustom: boolean): TranslatableString =>
        isAtonal ? KEY_NAMES[15] : isCustom ? KEY_NAMES[16] : KEY_NAMES[v + 7],
    translatedUserNameKey: (v: number, isAtonal: boolean, isCustom: boolean): string =>
        (isAtonal ? KEY_NAMES[15] : isCustom ? KEY_NAMES[16] : KEY_NAMES[v + 7]).translated(),

    // Align
    fromXmlAlignH: (tag: string, def: AlignH): AlignH => findTypeByXmlTag(D.ALIGN_H, tag, def),
    fromXmlAlignV: (tag: string, def: AlignV): AlignV => findTypeByXmlTag(D.ALIGN_V, tag, def),
    toXmlAlignH: (v: AlignH): string => findXmlTagByType(D.ALIGN_H, v),
    toXmlAlignV: (v: AlignV): string => findXmlTagByType(D.ALIGN_V, v),
    toXmlAlign: (v: Align): string => `${findXmlTagByType(D.ALIGN_H, v.horizontal)},${findXmlTagByType(D.ALIGN_V, v.vertical)}`,
    fromXmlAlign(str: string, def: Align = new Align()): Align {
        const sl = str.split(',')
        if (sl.length !== 2) {
            return def.clone()
        }
        return new Align(findTypeByXmlTag(D.ALIGN_H, sl[0], def.horizontal), findTypeByXmlTag(D.ALIGN_V, sl[1], def.vertical))
    },

    fromXmlOrnamentInterval(str: string, def: OrnamentInterval): OrnamentInterval {
        const sl = str.split(',')
        if (sl.length !== 2) {
            return def
        }
        return new OrnamentInterval(findTypeByXmlTag(D.INTERVAL_STEP, sl[0], def.step), findTypeByXmlTag(D.INTERVAL_TYPE, sl[1], def.type))
    },

    fromXmlTiePlacement: (tag: string, def: TiePlacement): TiePlacement => findTypeByXmlTag(D.TIE_PLACEMENT, tag, def),
    fromXmlTieDotsPlacement: (tag: string, def: TieDotsPlacement): TieDotsPlacement => findTypeByXmlTag(D.TIE_DOTS_PLACEMENT, tag, def),
    fromXmlTimeSigPlacement: (tag: string, def: TimeSigPlacement): TimeSigPlacement => findTypeByXmlTag(D.TIMESIG_PLACEMENT, tag, def),
    fromXmlTimeSigStyle: (tag: string, def: TimeSigStyle): TimeSigStyle => findTypeByXmlTag(D.TIMESIG_STYLE, tag, def),
    fromXmlTimeSigVSMargin: (tag: string, def: TimeSigVSMargin): TimeSigVSMargin => findTypeByXmlTag(D.TIMESIG_MARGIN, tag, def),
    fromXmlNoteSpellingType: (tag: string, def: NoteSpellingType): NoteSpellingType => findTypeByXmlTag(D.NOTE_SPELLING_TYPE, tag, def),
    fromXmlChordStylePreset: (tag: string, def: ChordStylePreset): ChordStylePreset => findTypeByXmlTag(D.CHORD_STYLE_PRESET, tag, def),
    fromXmlRepeatPlayCountPreset: (tag: string, def: RepeatPlayCountPreset): RepeatPlayCountPreset => findTypeByXmlTag(D.REPEAT_COUNT_PRESET, tag, def),
    fromXmlAutoCustomHide: (tag: string, def: AutoCustomHide): AutoCustomHide => findTypeByXmlTag(D.AUTO_CUSTOM_HIDE, tag, def),
    fromXmlVoiceAssignment: (tag: string, def: VoiceAssignment): VoiceAssignment => findTypeByXmlTag(D.VOICE_ASSIGNMENT, tag, def),
    fromXmlAutoOnOff: (tag: string, def: AutoOnOff): AutoOnOff => findTypeByXmlTag(D.AUTO_ON_OFF, tag, def),
    fromXmlPartialSpannerDirection: (tag: string, def: PartialSpannerDirection): PartialSpannerDirection =>
        findTypeByXmlTag(D.PARTIAL_SPANNER_DIRECTION, tag, def),

    toXmlSymId: (v: SymId): string => SymNames.nameForSymId(v),
    fromXmlSymId: (tag: string, def: SymId = SymId.noSym): SymId => SymNames.symIdByName(tag, def),

    fromXmlOrientation: (tag: string, def: Orientation): Orientation => findTypeByXmlTag(D.ORIENTATION, tag, def),
    fromXmlNoteHeadType: (tag: string, def: NoteHeadType): NoteHeadType => findTypeByXmlTag(D.NOTEHEAD_TYPES, tag, def),
    fromXmlNoteHeadScheme: (tag: string, def: NoteHeadScheme): NoteHeadScheme => findTypeByXmlTag(D.NOTEHEAD_SCHEMES, tag, def),
    fromXmlNoteHeadGroup: (tag: string, def: NoteHeadGroup): NoteHeadGroup => {
        const it = D.NOTEHEAD_GROUPS.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },

    toXmlClefType: (v: ClefType): string => findXmlTagByType(D.CLEF_TYPES, v),
    fromXmlClefType: (tag: string, def: ClefType): ClefType => {
        const it = D.CLEF_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },

    toXmlDynamicType: (v: DynamicType): string => findXmlTagByType(D.DYNAMIC_TYPES, v),
    fromXmlChangeMethod: (tag: string, def: ChangeMethod): ChangeMethod => findTypeByXmlTag(D.CHANGE_METHODS, tag, def),
    fromXmlTempoChangeType: (tag: string, def: GradualTempoChangeType): GradualTempoChangeType =>
        findTypeByXmlTag(D.TEMPO_CHANGE_TYPES, tag, def),
    fromXmlDynamicSpeed: (tag: string, def: DynamicSpeed): DynamicSpeed => findTypeByXmlTag(D.DYNAMIC_SPEEDS, tag, def),
    fromXmlDynamicType: (tag: string, def: DynamicType): DynamicType => findTypeByXmlTag(D.DYNAMIC_TYPES, tag, def),

    fromXmlHookType: (tag: string, def: HookType): HookType => {
        const it = D.HOOK_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlLineType: (tag: string, def: LineType): LineType => {
        // Pre-4.0 files: Qt pen style
        if (/^\s*-?\d+\s*$/.test(tag)) {
            switch (parseInt(tag, 10)) {
            case 0: // NoPen
                return def
            case 1: // SolidLine
                return LineType.SOLID
            case 2: // DashLine
            case 4: // DashDotLine
            case 0x10: // CustomDashLine
                return LineType.DASHED
            case 3: // DotLine
            case 5: // DashDotDotLine
                return LineType.DOTTED
            default:
                break
            }
        }
        return findTypeByXmlTag(D.LINE_TYPES, tag, def)
    },
    fromXmlKeyMode: (tag: string, def: KeyMode): KeyMode => findTypeByXmlTag(D.KEY_MODES, tag, def),

    toXmlTextStyleType: (v: TextStyleType): string => findXmlTagByType(D.TEXTSTYLE_TYPES, v),
    fromXmlTextStyleType: (tag: string, def: TextStyleType = TextStyleType.DEFAULT): TextStyleType => {
        const it = D.TEXTSTYLE_TYPES.find(i => i.xml === tag)
        if (it) {
            return it.type
        }
        return OLD_TST_TAGS[tag] ?? def
    },

    toXmlDurationType: (v: DurationType): string => findXmlTagByType(D.DURATION_TYPES, v),
    fromXmlDurationType: (tag: string, def: DurationType): DurationType => findTypeByXmlTag(D.DURATION_TYPES, tag, def),

    fromXmlOrnamentStyle: (tag: string, def: OrnamentStyle): OrnamentStyle => findTypeByXmlTag(D.ORNAMENTSTYLE_TYPES, tag, def),
    fromXmlPlacementV: (tag: string, def: PlacementV): PlacementV => {
        const it = D.PLACEMENTV_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlPlacementH: (tag: string, def: PlacementH): PlacementH => {
        const it = D.PLACEMENTH_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlTextPlace: (tag: string, def: TextPlace): TextPlace => {
        const it = D.TEXTPLACE_TYPES.find(i => i.xml === tag) ?? D.OLD_TEXTPLACE_TYPES.find(i => i.xml === tag)
        return it ? it.type : def
    },
    fromXmlDirectionV: (tag: string, def: DirectionV): DirectionV => findTypeByXmlTag(D.DIRECTIONV_TYPES, tag, def),
    fromXmlDirectionH: (tag: string, def: DirectionH): DirectionH => {
        const it = D.DIRECTIONH_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlLayoutBreakType: (tag: string, def: LayoutBreakType): LayoutBreakType => findTypeByXmlTag(D.LAYOUTBREAK_TYPES, tag, def),
    fromXmlVeloType: (tag: string, def: VeloType): VeloType => findTypeByXmlTag(D.VELO_TYPES, tag, def),
    fromXmlBeamMode: (tag: string, def: BeamMode): BeamMode => {
        const it = D.BEAMMODE_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlGlissandoStyle: (tag: string, def: GlissandoStyle): GlissandoStyle => {
        const it = D.GLISSANDOSTYLE_TYPES.find(i => i.xml === tag)
        return it ? it.type : (tag === 'Chromatic' ? GlissandoStyle.CHROMATIC : def)
    },
    toXmlBarLineType: (v: BarLineType): string => findXmlTagByType(D.BARLINE_TYPES, v),
    fromXmlBarLineType: (tag: string, def: BarLineType): BarLineType => {
        const it = D.BARLINE_TYPES.find(i => i.xml === tag)
        return it ? it.type : compatInt(tag, def)
    },
    fromXmlTremoloType: (tag: string, def: TremoloType): TremoloType => findTypeByXmlTag(D.TREMOLO_TYPES, tag, def),
    fromXmlBracketType: (tag: string, def: BracketType): BracketType => {
        const it = D.BRACKET_TYPES.find(i => i.xml === tag)
        return it ? it.type : (tag === 'Akkolade' ? BracketType.BRACE : def)
    },
    fromXmlArpeggioType: (tag: string, def: ArpeggioType): ArpeggioType => findTypeByXmlTag(D.ARPEGGIO_TYPES, tag, def),
    fromXmlGlissandoType: (tag: string, def: GlissandoType): GlissandoType => findTypeByXmlTag(D.GLISSANDO_TYPES, tag, def),
    fromXmlJumpType: (tag: string, def: JumpType): JumpType => findTypeByXmlTag(D.JUMP_TYPES, tag, def),
    fromXmlMarkerType: (tag: string, def: MarkerType): MarkerType => {
        const it = D.MARKER_TYPES.find(i => i.xml === tag)
        return it ? it.type : (tag === 'Repeat' ? MarkerType.TOCODA : def)
    },
    fromXmlStaffGroup: (tag: string, def: StaffGroup): StaffGroup => findTypeByXmlTag(D.STAFFGROUP_TYPES, tag, def),
    fromXmlTrillType: (tag: string, def: TrillType): TrillType => {
        const it = D.TRILL_TYPES.find(i => i.xml === tag)
        if (it) {
            return it.type
        }
        if (tag === '0') {
            return TrillType.TRILL_LINE
        } else if (tag === 'pure') {
            return TrillType.PRALLPRALL_LINE
        }
        return def
    },
    fromXmlVibratoType: (tag: string, def: VibratoType): VibratoType => findTypeByXmlTag(D.VIBRATO_TYPES, tag, def),
    /** TConv::text(ArticulationTextType) */
    articulationText: (v: ArticulationTextType): string => ARTICULATION_TEXTS[v] ?? '',
    fromXmlArticulationTextType: (tag: string, def: ArticulationTextType): ArticulationTextType =>
        findTypeByXmlTag(D.ARTICULATIONTEXT_TYPES, tag, def),
    fromXmlLyricsSyllabic: (tag: string, def: LyricsSyllabic): LyricsSyllabic => findTypeByXmlTag(D.LYRICSSYLLABIC_TYPES, tag, def),
    fromXmlLyricsDashSystemStart: (tag: string, def: LyricsDashSystemStart): LyricsDashSystemStart =>
        findTypeByXmlTag(D.LYRICS_DASH_SYSTEM_START_TYPES, tag, def),
    fromXmlMeasureNumberPlacement: (tag: string, def: MeasureNumberPlacement): MeasureNumberPlacement =>
        findTypeByXmlTag(D.MEASURE_NUMBER_MODES, tag, def),
}
