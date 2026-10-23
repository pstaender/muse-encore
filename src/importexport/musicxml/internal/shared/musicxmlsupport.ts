/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/shared/musicxmlsupport.h/.cpp (the functions used by the export)
 *
 * TODO(port): MusicXmlSupport (stringToInt, noteTypeToFraction, calculateFraction), musicXmlString2accSymId,
 * musicXmlString2accidentalType, musicXmlAccidentalTextToChar, microtonalGuess, errorStringWithLocation,
 * checkAtEndElement, harmonyFromXml, setHarmonyRootTpcFromFunction (import only)
 */

import { AccidentalType } from '../../../../engraving/dom/accidentaldata'
import type { Harmony, HarmonyInfo } from '../../../../engraving/dom/harmony'
import { tpc2Function, tpcIsValid } from '../../../../engraving/dom/pitchspelling'
import { SymId } from '../../../../engraving/types/symid'
import { SymNames } from '../../../../engraving/types/symnames'
import { Key } from '../../../../engraving/types/types'

//---------------------------------------------------------
//   accSymId2MusicXmlString
//---------------------------------------------------------

export function accSymId2MusicXmlString(id: SymId): string {
    switch (id) {
    case SymId.accidentalSharp: return 'sharp'
    case SymId.accidentalNatural: return 'natural'
    case SymId.accidentalFlat: return 'flat'
    case SymId.accidentalDoubleSharp: return 'double-sharp'
    case SymId.accidentalDoubleFlat: return 'flat-flat'
    case SymId.accidentalNaturalSharp: return 'natural-sharp'
    case SymId.accidentalNaturalFlat: return 'natural-flat'
    case SymId.accidentalQuarterToneFlatStein: return 'quarter-flat'
    case SymId.accidentalQuarterToneSharpStein: return 'quarter-sharp'
    case SymId.accidentalThreeQuarterTonesFlatZimmermann: return 'three-quarters-flat'
    case SymId.accidentalThreeQuarterTonesSharpStein: return 'three-quarters-sharp'
    case SymId.accidentalQuarterToneSharpArrowDown: return 'sharp-down'
    case SymId.accidentalThreeQuarterTonesSharpArrowUp: return 'sharp-up'
    case SymId.accidentalQuarterToneFlatNaturalArrowDown: return 'natural-down'
    case SymId.accidentalQuarterToneSharpNaturalArrowUp: return 'natural-up'
    case SymId.accidentalThreeQuarterTonesFlatArrowDown: return 'flat-down'
    case SymId.accidentalQuarterToneFlatArrowUp: return 'flat-up'
    case SymId.accidentalThreeQuarterTonesSharpArrowDown: return 'double-sharp-down'
    case SymId.accidentalFiveQuarterTonesSharpArrowUp: return 'double-sharp-up'
    case SymId.accidentalFiveQuarterTonesFlatArrowDown: return 'flat-flat-down'
    case SymId.accidentalThreeQuarterTonesFlatArrowUp: return 'flat-flat-up'

    case SymId.accidentalArrowDown: return 'arrow-down'
    case SymId.accidentalArrowUp: return 'arrow-up'

    case SymId.accidentalTripleSharp: return 'triple-sharp'
    case SymId.accidentalTripleFlat: return 'triple-flat'

    case SymId.accidentalKucukMucennebSharp: return 'slash-quarter-sharp'
    case SymId.accidentalBuyukMucennebSharp: return 'slash-sharp'
    case SymId.accidentalBakiyeFlat: return 'slash-flat'
    case SymId.accidentalBuyukMucennebFlat: return 'double-slash-flat'

    case SymId.accidental1CommaSharp: return 'sharp-1'
    case SymId.accidental2CommaSharp: return 'sharp-2'
    case SymId.accidental3CommaSharp: return 'sharp-3'
    case SymId.accidental5CommaSharp: return 'sharp-5'
    case SymId.accidental1CommaFlat: return 'flat-1'
    case SymId.accidental2CommaFlat: return 'flat-2'
    case SymId.accidental3CommaFlat: return 'flat-3'
    case SymId.accidental4CommaFlat: return 'flat-4'

    case SymId.accidentalSori: return 'sori'
    case SymId.accidentalKoron: return 'koron'
    default:
        return 'other'
    }
}

//---------------------------------------------------------
//   accSymId2SmuflMusicXmlString
//---------------------------------------------------------

export function accSymId2SmuflMusicXmlString(id: SymId): string {
    return SymNames.nameForSymId(id)
}

//---------------------------------------------------------
//   accidentalType2MusicXmlString
//---------------------------------------------------------

export function accidentalType2MusicXmlString(type: AccidentalType): string {
    switch (type) {
    case AccidentalType.SHARP: return 'sharp'
    case AccidentalType.NATURAL: return 'natural'
    case AccidentalType.FLAT: return 'flat'
    case AccidentalType.SHARP2: return 'double-sharp'
    case AccidentalType.FLAT2: return 'flat-flat'
    case AccidentalType.NATURAL_SHARP: return 'natural-sharp'
    case AccidentalType.NATURAL_FLAT: return 'natural-flat'
    case AccidentalType.SHARP_ARROW_UP: return 'sharp-up'
    case AccidentalType.MIRRORED_FLAT: return 'quarter-flat'
    case AccidentalType.SHARP_SLASH: return 'quarter-sharp'
    case AccidentalType.MIRRORED_FLAT2: return 'three-quarters-flat'
    case AccidentalType.SHARP_SLASH4: return 'three-quarters-sharp'
    case AccidentalType.SHARP_ARROW_DOWN: return 'sharp-down'
    case AccidentalType.NATURAL_ARROW_UP: return 'natural-up'
    case AccidentalType.NATURAL_ARROW_DOWN: return 'natural-down'
    case AccidentalType.FLAT_ARROW_DOWN: return 'flat-down'
    case AccidentalType.FLAT_ARROW_UP: return 'flat-up'
    case AccidentalType.SHARP2_ARROW_DOWN: return 'double-sharp-down'
    case AccidentalType.SHARP2_ARROW_UP: return 'double-sharp-up'
    case AccidentalType.FLAT2_ARROW_DOWN: return 'flat-flat-down'
    case AccidentalType.FLAT2_ARROW_UP: return 'flat-flat-up'

    case AccidentalType.ARROW_DOWN: return 'arrow-down'
    case AccidentalType.ARROW_UP: return 'arrow-up'

    case AccidentalType.SHARP3: return 'triple-sharp'
    case AccidentalType.FLAT3: return 'triple-flat'

    case AccidentalType.SHARP_SLASH3: return 'slash-quarter-sharp'
    case AccidentalType.SHARP_SLASH2: return 'slash-sharp'
    case AccidentalType.FLAT_SLASH: return 'slash-flat'
    case AccidentalType.FLAT_SLASH2: return 'double-slash-flat'

    case AccidentalType.ONE_COMMA_SHARP: return 'sharp-1'
    case AccidentalType.TWO_COMMA_SHARP: return 'sharp-2'
    case AccidentalType.THREE_COMMA_SHARP: return 'sharp-3'
    case AccidentalType.FIVE_COMMA_SHARP: return 'sharp-5'
    case AccidentalType.ONE_COMMA_FLAT: return 'flat-1'
    case AccidentalType.TWO_COMMA_FLAT: return 'flat-2'
    case AccidentalType.THREE_COMMA_FLAT: return 'flat-3'
    case AccidentalType.FOUR_COMMA_FLAT: return 'flat-4'

    case AccidentalType.SORI: return 'sori'
    case AccidentalType.KORON: return 'koron'
    default:
        return 'other'
    }
}

/** C++ std::map<String, AccidentalType> smuflAccidentalTypes (sorted by name) */
const smuflAccidentalTypes: ReadonlyArray<readonly [string, AccidentalType]> = ([
    ['accidentalDoubleFlatOneArrowDown', AccidentalType.DOUBLE_FLAT_ONE_ARROW_DOWN],
    ['accidentalFlatOneArrowDown', AccidentalType.FLAT_ONE_ARROW_DOWN],
    ['accidentalNaturalOneArrowDown', AccidentalType.NATURAL_ONE_ARROW_DOWN],
    ['accidentalSharpOneArrowDown', AccidentalType.SHARP_ONE_ARROW_DOWN],
    ['accidentalDoubleSharpOneArrowDown', AccidentalType.DOUBLE_SHARP_ONE_ARROW_DOWN],
    ['accidentalDoubleFlatOneArrowUp', AccidentalType.DOUBLE_FLAT_ONE_ARROW_UP],
    ['accidentalFlatOneArrowUp', AccidentalType.FLAT_ONE_ARROW_UP],
    ['accidentalNaturalOneArrowUp', AccidentalType.NATURAL_ONE_ARROW_UP],
    ['accidentalSharpOneArrowUp', AccidentalType.SHARP_ONE_ARROW_UP],
    ['accidentalDoubleSharpOneArrowUp', AccidentalType.DOUBLE_SHARP_ONE_ARROW_UP],
    ['accidentalDoubleFlatTwoArrowsDown', AccidentalType.DOUBLE_FLAT_TWO_ARROWS_DOWN],
    ['accidentalFlatTwoArrowsDown', AccidentalType.FLAT_TWO_ARROWS_DOWN],
    ['accidentalNaturalTwoArrowsDown', AccidentalType.NATURAL_TWO_ARROWS_DOWN],
    ['accidentalSharpTwoArrowsDown', AccidentalType.SHARP_TWO_ARROWS_DOWN],
    ['accidentalDoubleSharpTwoArrowsDown', AccidentalType.DOUBLE_SHARP_TWO_ARROWS_DOWN],
    ['accidentalDoubleFlatTwoArrowsUp', AccidentalType.DOUBLE_FLAT_TWO_ARROWS_UP],
    ['accidentalFlatTwoArrowsUp', AccidentalType.FLAT_TWO_ARROWS_UP],
    ['accidentalNaturalTwoArrowsUp', AccidentalType.NATURAL_TWO_ARROWS_UP],
    ['accidentalSharpTwoArrowsUp', AccidentalType.SHARP_TWO_ARROWS_UP],
    ['accidentalDoubleSharpTwoArrowsUp', AccidentalType.DOUBLE_SHARP_TWO_ARROWS_UP],
    ['accidentalDoubleFlatThreeArrowsDown', AccidentalType.DOUBLE_FLAT_THREE_ARROWS_DOWN],
    ['accidentalFlatThreeArrowsDown', AccidentalType.FLAT_THREE_ARROWS_DOWN],
    ['accidentalNaturalThreeArrowsDown', AccidentalType.NATURAL_THREE_ARROWS_DOWN],
    ['accidentalSharpThreeArrowsDown', AccidentalType.SHARP_THREE_ARROWS_DOWN],
    ['accidentalDoubleSharpThreeArrowsDown', AccidentalType.DOUBLE_SHARP_THREE_ARROWS_DOWN],
    ['accidentalDoubleFlatThreeArrowsUp', AccidentalType.DOUBLE_FLAT_THREE_ARROWS_UP],
    ['accidentalFlatThreeArrowsUp', AccidentalType.FLAT_THREE_ARROWS_UP],
    ['accidentalNaturalThreeArrowsUp', AccidentalType.NATURAL_THREE_ARROWS_UP],
    ['accidentalSharpThreeArrowsUp', AccidentalType.SHARP_THREE_ARROWS_UP],
    ['accidentalDoubleSharpThreeArrowsUp', AccidentalType.DOUBLE_SHARP_THREE_ARROWS_UP],
    ['accidentalLowerOneSeptimalComma', AccidentalType.LOWER_ONE_SEPTIMAL_COMMA],
    ['accidentalRaiseOneSeptimalComma', AccidentalType.RAISE_ONE_SEPTIMAL_COMMA],
    ['accidentalLowerTwoSeptimalCommas', AccidentalType.LOWER_TWO_SEPTIMAL_COMMAS],
    ['accidentalRaiseTwoSeptimalCommas', AccidentalType.RAISE_TWO_SEPTIMAL_COMMAS],
    ['accidentalLowerOneUndecimalQuartertone', AccidentalType.LOWER_ONE_UNDECIMAL_QUARTERTONE],
    ['accidentalRaiseOneUndecimalQuartertone', AccidentalType.RAISE_ONE_UNDECIMAL_QUARTERTONE],
    ['accidentalLowerOneTridecimalQuartertone', AccidentalType.LOWER_ONE_TRIDECIMAL_QUARTERTONE],
    ['accidentalRaiseOneTridecimalQuartertone', AccidentalType.RAISE_ONE_TRIDECIMAL_QUARTERTONE],
    ['accidentalDoubleFlatEqualTempered', AccidentalType.DOUBLE_FLAT_EQUAL_TEMPERED],
    ['accidentalFlatEqualTempered', AccidentalType.FLAT_EQUAL_TEMPERED],
    ['accidentalNaturalEqualTempered', AccidentalType.NATURAL_EQUAL_TEMPERED],
    ['accidentalSharpEqualTempered', AccidentalType.SHARP_EQUAL_TEMPERED],
    ['accidentalDoubleSharpEqualTempered', AccidentalType.DOUBLE_SHARP_EQUAL_TEMPERED],
    ['accidentalQuarterFlatEqualTempered', AccidentalType.QUARTER_FLAT_EQUAL_TEMPERED],
    ['accidentalQuarterSharpEqualTempered', AccidentalType.QUARTER_SHARP_EQUAL_TEMPERED],
] as Array<readonly [string, AccidentalType]>).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

//---------------------------------------------------------
//   accidentalType2SmuflMusicXmlString
//---------------------------------------------------------

/** muse::key(smuflAccidentalTypes, type): the first name (in map order) of the type, empty if none */
export function accidentalType2SmuflMusicXmlString(type: AccidentalType): string {
    for (const [name, t] of smuflAccidentalTypes) {
        if (t === type) {
            return name
        }
    }
    return ''
}

//---------------------------------------------------------
//   isLaissezVibrer
//---------------------------------------------------------

export function isLaissezVibrer(id: SymId): boolean {
    return id === SymId.articLaissezVibrerAbove || id === SymId.articLaissezVibrerBelow
}

export function harmonyXmlKind(h: HarmonyInfo | null): string {
    if (!h) {
        return ''
    }
    const cd = h.descr()
    return cd ? cd.xmlKind : ''
}

export function harmonyXmlText(h: HarmonyInfo | null): string {
    if (!h) {
        return ''
    }
    const cd = h.descr()
    return cd ? cd.xmlText : ''
}

export function harmonyXmlSymbols(h: HarmonyInfo | null): string {
    if (!h) {
        return ''
    }
    const cd = h.descr()
    return cd ? cd.xmlSymbols : ''
}

export function harmonyXmlParens(h: HarmonyInfo | null): string {
    if (!h) {
        return ''
    }
    const cd = h.descr()
    return cd ? cd.xmlParens : ''
}

export function harmonyXmlDegrees(h: HarmonyInfo | null): string[] {
    if (!h) {
        return []
    }
    const cd = h.descr()
    return cd ? cd.xmlDegrees.slice() : []
}

/** harmonyXmlFunction(info, h) and harmonyXmlFunction(info, h, key) */
export function harmonyXmlFunction(info: HarmonyInfo | null, h: Harmony, key: Key = Key.INVALID): string {
    if (!info || !tpcIsValid(info.rootTpc())) {
        return ''
    }
    if (key === Key.INVALID) {
        const st = h.staff()
        key = st ? st.key(h.tick()) : Key.INVALID
    }
    return tpc2Function(info.rootTpc(), key)
}
