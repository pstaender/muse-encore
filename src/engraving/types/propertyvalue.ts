/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/propertyvalue.h
 *
 * In TypeScript a PropertyValue is just the value itself; the P_TYPE is kept
 * separately (style definitions, property tables) where it is needed.
 */

import type { Color } from '../../framework/draw/types/color'
import type { PointF, SizeF } from '../../framework/draw/types/geometry'
import { Spatium } from './dimension'
import { RealIsEqual } from '../../framework/global/realfn'
import { Fraction } from './fraction'
import type { Align } from './types'

export enum P_TYPE {
    UNDEFINED = 0,
    BOOL,
    INT,
    INT_VEC,
    SIZE_T,
    REAL,
    STRING,
    POINT,
    SIZE,
    DRAW_PATH,
    SCALE,
    SPATIUM,
    MILLIMETRE,
    PAIR_REAL,
    SYMID,
    COLOR,
    ORNAMENT_STYLE,
    ORNAMENT_INTERVAL,
    ORNAMENT_SHOW_ACCIDENTAL,
    GLISS_STYLE,
    GLISS_TYPE,
    ALIGN,
    ALIGN_H,
    PLACEMENT_V,
    PLACEMENT_H,
    TEXT_PLACE,
    DIRECTION_V,
    DIRECTION_H,
    ORIENTATION,
    BEAM_MODE,
    ACCIDENTAL_ROLE,
    TIE_PLACEMENT,
    TIE_DOTS_PLACEMENT,
    TIMESIG_PLACEMENT,
    TIMESIG_STYLE,
    TIMESIG_MARGIN,
    NOTE_SPELLING_TYPE,
    CHORD_PRESET_TYPE,
    PARENTHESES_MODE,
    PLAY_COUNT_PRESET,
    FRACTION,
    DURATION_TYPE_WITH_DOTS,
    CHANGE_METHOD,
    PITCH_VALUES,
    TEMPO,
    LAYOUTBREAK_TYPE,
    VELO_TYPE,
    BARLINE_TYPE,
    NOTEHEAD_TYPE,
    NOTEHEAD_SCHEME,
    NOTEHEAD_GROUP,
    CLEF_TYPE,
    CLEF_TO_BARLINE_POS,
    DYNAMIC_TYPE,
    DYNAMIC_SPEED,
    LINE_TYPE,
    HOOK_TYPE,
    KEY_MODE,
    TEXT_STYLE,
    PLAYTECH_TYPE,
    TEMPOCHANGE_TYPE,
    SLUR_STYLE_TYPE,
    NOTELINE_PLACEMENT_TYPE,
    LYRICS_DASH_SYSTEM_START_TYPE,
    PARTIAL_SPANNER_DIRECTION,
    MARKER_TYPE,
    LH_TAPPING_SYMBOL,
    RH_TAPPING_SYMBOL,
    VIBRATO_LINE_TYPE,
    VOICE_ASSIGNMENT,
    AUTO_ON_OFF,
    AUTO_CUSTOM_HIDE,
    MEASURE_NUMBER_PLACEMENT,
    CAPO_TRANSPOSE_MODE,
    GROUPS,
}

export type PropertyValue =
    | number
    | boolean
    | string
    | Spatium
    | PointF
    | SizeF
    | Color
    | Align
    | Fraction
    | number[]
    | object
    | null
    | undefined

/** PropertyValue::operator== */
export function propertyValueEquals(a: PropertyValue | undefined, b: PropertyValue | undefined): boolean {
    if (a === b) {
        return true
    }
    if (a === undefined || b === undefined || a === null || b === null) {
        return false
    }
    //! C++ HACK Temporary hack for bool comparisons (maybe one type is bool and another type is int)
    if (typeof a === 'boolean' || typeof b === 'boolean') {
        return (typeof a === 'boolean' || typeof a === 'number') && (typeof b === 'boolean' || typeof b === 'number')
               && Boolean(a) === Boolean(b)
    }
    //! C++ HACK Temporary hack for Spatium comparisons (maybe one type is Spatium and another type is real)
    const isSpatium = (v: unknown): v is Spatium => v instanceof Spatium
    if ((isSpatium(a) || typeof a === 'number') && (isSpatium(b) || typeof b === 'number')) {
        const x = isSpatium(a) ? a.val() : a
        const y = isSpatium(b) ? b.val() : b
        return x === y || RealIsEqual(x, y)
    }
    if (typeof a !== 'object' || typeof b !== 'object') {
        return false
    }
    if (a instanceof Fraction && b instanceof Fraction) {
        return a.identical(b) // like C++ PropertyValue::operator== ("HACK Temporary hack for Fraction comparisons")
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => propertyValueEquals(v as PropertyValue, b[i] as PropertyValue))
    }
    const eq = (a as { equals?: (o: unknown) => boolean }).equals
    if (typeof eq === 'function') {
        return eq.call(a, b)
    }
    const aeq = (a as { eq?: (o: unknown) => boolean }).eq
    if (typeof aeq === 'function') {
        return aeq.call(a, b)
    }
    return false
}
