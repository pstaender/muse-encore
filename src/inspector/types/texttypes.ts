/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/types/texttypes.h (TEXT_ELEMENT_TYPES)
 */

import { ElementType, TextStyleType } from '../../engraving/types/types'

export const TEXT_ELEMENT_TYPES: readonly ElementType[] = [
    ElementType.TEXT,
    ElementType.STAFF_TEXT,
    ElementType.SYSTEM_TEXT,
    ElementType.TRIPLET_FEEL,
    ElementType.DYNAMIC,
    ElementType.EXPRESSION,
    ElementType.FIGURED_BASS,
    ElementType.FINGERING,
    ElementType.HARMONY,
    ElementType.INSTRUMENT_CHANGE,
    ElementType.JUMP,
    ElementType.LYRICS,
    ElementType.MARKER,
    ElementType.MEASURE_NUMBER,
    ElementType.REHEARSAL_MARK,
    ElementType.STICKING,
    ElementType.TEMPO_TEXT,
    ElementType.TUPLET,
    ElementType.PLAY_COUNT_TEXT,
    ElementType.PLAYTECH_ANNOTATION,
    ElementType.CAPO,
    ElementType.STRING_TUNINGS,
    ElementType.HARP_DIAGRAM,
    ElementType.SOUND_FLAG,
    ElementType.HAMMER_ON_PULL_OFF_TEXT,
]

/** TextTypes::FrameType */
export enum FrameType {
    FRAME_TYPE_NONE = 0,
    FRAME_TYPE_SQUARE,
    FRAME_TYPE_CIRCLE,
}

/** TextTypes::TextType::TEXT_TYPE_STAFF */
export const TEXT_TYPE_STAFF: number = TextStyleType.STAFF
