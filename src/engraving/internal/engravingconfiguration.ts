/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the colors of src/engraving/internal/engravingconfiguration.h/.cpp (C++ reads them from the settings;
 * here they are module state with the same defaults, set by the app).
 */

import { Color } from '../../framework/draw/types/color'
import { VOICES, type voice_idx_t } from '../types/types'

const DEFAULT_VOICE_COLORS: readonly string[] = [
    '#0065BF',
    '#007F00',
    '#C53F00',
    '#C31989',
    '#6038FC', // "all voices"
]

const UNLINKED_ITEM_COLOR = '#FF9300'

let s_voiceColors: Color[] = DEFAULT_VOICE_COLORS.map(c => Color.fromString(c))
let s_invisibleColor = Color.fromString('#808080')
let s_unlinkedColor = Color.fromString(UNLINKED_ITEM_COLOR)
let s_frameColor = Color.fromString('#A0A0A4')
const s_scoreInversionColor = new Color(220, 220, 220)

export class EngravingConfiguration {
    static defaultColor(): Color { return Color.BLACK }
    static scoreInversionColor(): Color { return s_scoreInversionColor }
    static invisibleColor(): Color { return s_invisibleColor }
    static setInvisibleColor(c: Color): void { s_invisibleColor = c.clone() }
    static frameColor(): Color { return s_frameColor }
    static setFrameColor(c: Color): void { s_frameColor = c.clone() }
    static unlinkedColor(): Color { return s_unlinkedColor }
    static setUnlinkedColor(c: Color): void { s_unlinkedColor = c.clone() }

    /** voiceIndex VOICES: "all voices" */
    static selectionColor(voiceIndex: voice_idx_t = 0, itemVisible = true, itemIsUnlinkedFromScore = false): Color {
        const color = (itemIsUnlinkedFromScore ? s_unlinkedColor : s_voiceColors[voiceIndex]).clone()

        if (itemVisible) {
            return color
        }

        const tint = Math.fround(0.6) // Between 0 and 1. Higher means lighter, lower means darker

        color.applyTint(tint)

        return color
    }

    static setSelectionColor(voiceIndex: voice_idx_t, color: Color): void {
        if (voiceIndex >= 0 && voiceIndex <= VOICES) {
            s_voiceColors[voiceIndex] = color.clone()
        }
    }

    /** restores the default colors */
    static resetColors(): void {
        s_voiceColors = DEFAULT_VOICE_COLORS.map(c => Color.fromString(c))
        s_invisibleColor = Color.fromString('#808080')
        s_unlinkedColor = Color.fromString(UNLINKED_ITEM_COLOR)
        s_frameColor = Color.fromString('#A0A0A4')
    }
}
