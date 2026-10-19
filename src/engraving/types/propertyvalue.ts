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
import type { Spatium } from './dimension'
import type { Fraction } from './fraction'
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
