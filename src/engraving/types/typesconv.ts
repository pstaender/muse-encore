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
    ParenthesesMode, LHTappingSymbol, RHTappingSymbol, TappingHand, PlayingTechniqueType, CapoTransposeMode, AccidentalRole,
    type EmbellishmentType,
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

/** C++ TAPPING_HAND, LH_TAPPING_SYMBOL, RH_TAPPING_SYMBOL, PARENTHESES_MODE (not in the generated tables) */
const TAPPING_HAND: readonly Item<TappingHand>[] = [
    { type: TappingHand.INVALID, xml: 'invalid', userName: '' },
    { type: TappingHand.LEFT, xml: 'left', userName: '' },
    { type: TappingHand.RIGHT, xml: 'right', userName: '' },
]
const LH_TAPPING_SYMBOL: readonly Item<LHTappingSymbol>[] = [
    { type: LHTappingSymbol.DOT, xml: 'dot', userName: '' },
    { type: LHTappingSymbol.CIRCLED_T, xml: 'circledT', userName: '' },
]
const RH_TAPPING_SYMBOL: readonly Item<RHTappingSymbol>[] = [
    { type: RHTappingSymbol.T, xml: 'T', userName: '' },
    { type: RHTappingSymbol.PLUS, xml: 'plus', userName: '' },
]
const PARENTHESES_MODE: readonly Item<ParenthesesMode>[] = [
    { type: ParenthesesMode.NONE, xml: 'none', userName: '' },
    { type: ParenthesesMode.BOTH, xml: 'both', userName: '' },
    { type: ParenthesesMode.LEFT, xml: 'left', userName: '' },
    { type: ParenthesesMode.RIGHT, xml: 'right', userName: '' },
]

/** muse::String::number(double, prec): fixed notation, trailing zeros (and a trailing '.') removed, no "-0" */
export function stringNumber(n: number, prec: number): string {
    let s = n.toFixed(prec)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    if (s === '-0') {
        s = '0'
    }
    return s
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

/** C++ easingFactor (typesconv.cpp; float arithmetic) */
function easingFactor(x: number, method: ChangeMethod): number {
    const f = Math.fround
    switch (method) {
    case ChangeMethod.NORMAL:
        return x
    case ChangeMethod.EASE_IN:
        return f(1 - Math.sqrt(1 - x * x))
    case ChangeMethod.EASE_OUT:
        return f(Math.sqrt(1 - (x - 1) * (x - 1)))
    case ChangeMethod.EASE_IN_OUT:
        if (x < 0.5) {
            return f((1 - Math.sqrt(1 - (2 * x) * (2 * x))) / 2)
        } else {
            return f((Math.sqrt(1 - (-2 * x + 2) * (-2 * x + 2)) + 1) / 2)
        }
    case ChangeMethod.EXPONENTIAL:
        if (Math.abs(x - 1) < 1e-6) {
            return x
        } else {
            return f(1 - Math.pow(2, -10 * x))
        }
    }

    return 1
}

/** C++ buildEasedValueCurve: tick position -> value (std::map: the first value of a position is kept) */
function buildEasedValueCurve(ticksDuration: number, stepsCount: number, amplitude: number, method: ChangeMethod,
                              integral: boolean): Map<number, number> {
    const result = new Map<number, number>()
    if (stepsCount <= 0) {
        return result
    }

    const durationStep = Math.fround(ticksDuration / stepsCount)

    for (let i = 0; i <= stepsCount; ++i) {
        const pos = Math.trunc(Math.fround(i * durationStep))
        if (!result.has(pos)) {
            const v = easingFactor(Math.fround(i / stepsCount), method) * amplitude
            result.set(pos, integral ? Math.trunc(v) : v)
        }
    }

    return result
}

export const TConv = {
    /** C++ TConv::easingValueCurve (int and double amplitude overloads); keys are in ascending order */
    easingValueCurve(ticksDuration: number, stepsCount: number, amplitude: number, method: ChangeMethod,
                     integral = false): Map<number, number> {
        return buildEasedValueCurve(ticksDuration, stepsCount, amplitude, method, integral)
    },
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

    // EmbellishmentType (bagpipe embellishments: the index into EMBELLISHMENT_TYPES)
    userNameEmbellishmentType: (v: EmbellishmentType): TranslatableString => TranslatableString.from(D.EMBELLISHMENT_TYPES[v].name),
    translatedUserNameEmbellishmentType: (v: EmbellishmentType): string => TranslatableString.from(D.EMBELLISHMENT_TYPES[v].name).translated(),
    toXmlEmbellishmentType: (v: EmbellishmentType): string => String(v),
    fromXmlEmbellishmentType(tag: string, def: EmbellishmentType): EmbellishmentType {
        // C++ AsciiStringView::toInt
        const t = tag.trim()
        return /^[+-]?\d+$/.test(t) ? Number(t) : def
    },
    embellishmentNotes: (v: EmbellishmentType): string[] => D.EMBELLISHMENT_TYPES[v].notes.split(' '),
    embellishmentsCount: (): number => D.EMBELLISHMENT_TYPES.length,

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
            case 6: // CustomDashLine (muse::draw::PenStyle)
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

    // ---- toXml (used by the writer) ----
    toXmlIntVec: (v: readonly number[]): string => v.map(i => String(i)).join(','),
    toXmlOrnamentInterval: (v: OrnamentInterval): string =>
        `${findXmlTagByType(D.INTERVAL_STEP, v.step)},${findXmlTagByType(D.INTERVAL_TYPE, v.type)}`,
    toXmlTiePlacement: (v: TiePlacement): string => findXmlTagByType(D.TIE_PLACEMENT, v),
    toXmlTieDotsPlacement: (v: TieDotsPlacement): string => findXmlTagByType(D.TIE_DOTS_PLACEMENT, v),
    toXmlTimeSigPlacement: (v: TimeSigPlacement): string => findXmlTagByType(D.TIMESIG_PLACEMENT, v),
    toXmlTimeSigStyle: (v: TimeSigStyle): string => findXmlTagByType(D.TIMESIG_STYLE, v),
    toXmlTimeSigVSMargin: (v: TimeSigVSMargin): string => findXmlTagByType(D.TIMESIG_MARGIN, v),
    toXmlNoteSpellingType: (v: NoteSpellingType): string => findXmlTagByType(D.NOTE_SPELLING_TYPE, v),
    toXmlChordStylePreset: (v: ChordStylePreset): string => findXmlTagByType(D.CHORD_STYLE_PRESET, v),
    toXmlTappingHand: (v: TappingHand): string => findXmlTagByType(TAPPING_HAND, v),
    fromXmlTappingHand: (tag: string, def: TappingHand): TappingHand => findTypeByXmlTag(TAPPING_HAND, tag, def),
    toXmlLHTappingSymbol: (v: LHTappingSymbol): string => findXmlTagByType(LH_TAPPING_SYMBOL, v),
    toXmlRHTappingSymbol: (v: RHTappingSymbol): string => findXmlTagByType(RH_TAPPING_SYMBOL, v),
    toXmlParenthesesMode: (v: ParenthesesMode): string => findXmlTagByType(PARENTHESES_MODE, v),
    fromXmlParenthesesMode: (tag: string, def: ParenthesesMode): ParenthesesMode => findTypeByXmlTag(PARENTHESES_MODE, tag, def),
    toXmlRepeatPlayCountPreset: (v: RepeatPlayCountPreset): string => findXmlTagByType(D.REPEAT_COUNT_PRESET, v),
    toXmlAutoCustomHide: (v: AutoCustomHide): string => findXmlTagByType(D.AUTO_CUSTOM_HIDE, v),
    toXmlVoiceAssignment: (v: VoiceAssignment): string => findXmlTagByType(D.VOICE_ASSIGNMENT, v),
    toXmlAutoOnOff: (v: AutoOnOff): string => findXmlTagByType(D.AUTO_ON_OFF, v),
    toXmlCapoTransposeMode: (v: CapoTransposeMode): string => findXmlTagByType(D.CAPO_TRANSPOSE_MODE, v),
    toXmlPartialSpannerDirection: (v: PartialSpannerDirection): string => findXmlTagByType(D.PARTIAL_SPANNER_DIRECTION, v),
    toXmlOrientation: (v: Orientation): string => findXmlTagByType(D.ORIENTATION, v),
    toXmlNoteHeadType: (v: NoteHeadType): string => findXmlTagByType(D.NOTEHEAD_TYPES, v),
    toXmlNoteHeadScheme: (v: NoteHeadScheme): string => findXmlTagByType(D.NOTEHEAD_SCHEMES, v),
    toXmlNoteHeadGroup: (v: NoteHeadGroup): string => findXmlTagByType(D.NOTEHEAD_GROUPS, v),
    toXmlDynamicSpeed: (v: DynamicSpeed): string => findXmlTagByType(D.DYNAMIC_SPEEDS, v),
    toXmlHookType: (v: HookType): string => String(v),
    toXmlLineType: (v: LineType): string => findXmlTagByType(D.LINE_TYPES, v),
    toXmlKeyMode: (v: KeyMode): string => findXmlTagByType(D.KEY_MODES, v),
    toXmlChangeMethod: (v: ChangeMethod): string => findXmlTagByType(D.CHANGE_METHODS, v),
    toXmlAccidentalRole: (v: AccidentalRole): string => String(v),
    /** TConv::toXml(BeatsPerSecond, precision): String::number(v, precision) */
    toXmlBeatsPerSecond: (v: number, precision: number): string => stringNumber(v, precision),
    toXmlPlayingTechniqueType: (v: PlayingTechniqueType): string => findXmlTagByType(D.PLAY_TECH_TYPES, v),
    fromXmlPlayingTechniqueType: (tag: string, def: PlayingTechniqueType): PlayingTechniqueType =>
        findTypeByXmlTag(D.PLAY_TECH_TYPES, tag, def),
    toXmlGradualTempoChangeType: (v: GradualTempoChangeType): string => findXmlTagByType(D.TEMPO_CHANGE_TYPES, v),
    toXmlOrnamentStyle: (v: OrnamentStyle): string => findXmlTagByType(D.ORNAMENTSTYLE_TYPES, v),
    toXmlPlacementV: (v: PlacementV): string => findXmlTagByType(D.PLACEMENTV_TYPES, v),
    toXmlPlacementH: (v: PlacementH): string => findXmlTagByType(D.PLACEMENTH_TYPES, v),
    toXmlTextPlace: (v: TextPlace): string => findXmlTagByType(D.TEXTPLACE_TYPES, v),
    toXmlDirectionV: (v: DirectionV): string => findXmlTagByType(D.DIRECTIONV_TYPES, v),
    toXmlDirectionH: (v: DirectionH): string => findXmlTagByType(D.DIRECTIONH_TYPES, v),
    toXmlLayoutBreakType: (v: LayoutBreakType): string => findXmlTagByType(D.LAYOUTBREAK_TYPES, v),
    toXmlVeloType: (v: VeloType): string => findXmlTagByType(D.VELO_TYPES, v),
    toXmlBeamMode: (v: BeamMode): string => findXmlTagByType(D.BEAMMODE_TYPES, v),
    toXmlGlissandoStyle: (v: GlissandoStyle): string => findXmlTagByType(D.GLISSANDOSTYLE_TYPES, v),
    toXmlTremoloType: (v: TremoloType): string => findXmlTagByType(D.TREMOLO_TYPES, v),
    toXmlBracketType: (v: BracketType): string => findXmlTagByType(D.BRACKET_TYPES, v),
    toXmlArpeggioType: (v: ArpeggioType): string => findXmlTagByType(D.ARPEGGIO_TYPES, v),
    toXmlGlissandoType: (v: GlissandoType): string => findXmlTagByType(D.GLISSANDO_TYPES, v),
    toXmlJumpType: (v: JumpType): string => findXmlTagByType(D.JUMP_TYPES, v),
    toXmlMarkerType: (v: MarkerType): string => findXmlTagByType(D.MARKER_TYPES, v),
    toXmlStaffGroup: (v: StaffGroup): string => findXmlTagByType(D.STAFFGROUP_TYPES, v),
    toXmlTrillType: (v: TrillType): string => findXmlTagByType(D.TRILL_TYPES, v),
    toXmlVibratoType: (v: VibratoType): string => findXmlTagByType(D.VIBRATO_TYPES, v),
    toXmlArticulationTextType: (v: ArticulationTextType): string => findXmlTagByType(D.ARTICULATIONTEXT_TYPES, v),
    toXmlLyricsSyllabic: (v: LyricsSyllabic): string => findXmlTagByType(D.LYRICSSYLLABIC_TYPES, v),
    toXmlLyricsDashSystemStart: (v: LyricsDashSystemStart): string => findXmlTagByType(D.LYRICS_DASH_SYSTEM_START_TYPES, v),
    toXmlMeasureNumberPlacement: (v: MeasureNumberPlacement): string => findXmlTagByType(D.MEASURE_NUMBER_MODES, v),
}
