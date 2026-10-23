/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/style/textstyle.h/.cpp (the tables are in textstyledata.ts)
 */

import { TextStyleType } from '../types/types'
import { TEXT_STYLES, type TextStyle } from './textstyledata'

export { TextStylePropertyType, TEXT_STYLE_SIZE } from './textstyledata'
export type { TextStyle, TextStyleProperty } from './textstyledata'

export function textStyle(idx: TextStyleType): TextStyle | null {
    return TEXT_STYLES.get(idx) ?? null
}

let s_allTextStyles: TextStyleType[] | null = null

export function allTextStyles(): readonly TextStyleType[] {
    if (!s_allTextStyles) {
        s_allTextStyles = []
        for (let t = TextStyleType.DEFAULT + 1; t < TextStyleType.TEXT_TYPES; ++t) {
            s_allTextStyles.push(t as TextStyleType)
        }
    }
    return s_allTextStyles
}

let s_editableTextStyles: TextStyleType[] | null = null

/** the text styles of the Style dialog (all but dynamics) */
export function editableTextStyles(): readonly TextStyleType[] {
    if (!s_editableTextStyles) {
        s_editableTextStyles = allTextStyles().filter(t => t !== TextStyleType.DYNAMICS)
    }
    return s_editableTextStyles
}

export const PRIMARY_TEXT_STYLES: readonly TextStyleType[] = [
    TextStyleType.TITLE,
    TextStyleType.SUBTITLE,
    TextStyleType.COMPOSER,
    TextStyleType.LYRICIST,
    TextStyleType.TRANSLATOR,
    TextStyleType.FRAME,
    TextStyleType.INSTRUMENT_EXCERPT,
    TextStyleType.INSTRUMENT_CHANGE,
    TextStyleType.HEADER,
    TextStyleType.FOOTER,
    TextStyleType.COPYRIGHT,
    TextStyleType.PAGE_NUMBER,
    TextStyleType.MEASURE_NUMBER,
    TextStyleType.MEASURE_NUMBER_ALTERNATE,
    TextStyleType.MMREST_RANGE,
    TextStyleType.TEMPO,
    TextStyleType.REPEAT_PLAY_COUNT,
    TextStyleType.REPEAT_LEFT,
    TextStyleType.REPEAT_RIGHT,
    TextStyleType.REHEARSAL_MARK,
    TextStyleType.SYSTEM,
    TextStyleType.STAFF,
    TextStyleType.EXPRESSION,
    TextStyleType.DYNAMICS,
    TextStyleType.HAIRPIN,
    TextStyleType.LYRICS_ODD,
    TextStyleType.LYRICS_EVEN,
    TextStyleType.HARMONY_A,
    TextStyleType.HARMONY_B,
    TextStyleType.HARMONY_ROMAN,
    TextStyleType.HARMONY_NASHVILLE,
    TextStyleType.STICKING,
    TextStyleType.USER1,
    TextStyleType.USER2,
    TextStyleType.USER3,
    TextStyleType.USER4,
    TextStyleType.USER5,
    TextStyleType.USER6,
    TextStyleType.USER7,
    TextStyleType.USER8,
    TextStyleType.USER9,
    TextStyleType.USER10,
    TextStyleType.USER11,
    TextStyleType.USER12,
]

export function primaryTextStyles(): readonly TextStyleType[] {
    return PRIMARY_TEXT_STYLES
}
