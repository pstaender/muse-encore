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
let s_formattingColor = Color.fromString('#C31989')
const s_scoreInversionColor = new Color(220, 220, 220)
// C++: uiConfiguration() != nullptr, i.e. not in the converter; here set by an app that shows unprintable items
let s_canLayoutIcons = false

export class EngravingConfiguration {
    /** layout break (and indicator) icons are laid out (and drawn when not printing) */
    static canLayoutIcons(): boolean { return s_canLayoutIcons }
    static setCanLayoutIcons(v: boolean): void { s_canLayoutIcons = v }
    static iconsFontFamily(): string { return 'MusescoreIcon' }
    static defaultColor(): Color { return Color.BLACK }
    static scoreInversionColor(): Color { return s_scoreInversionColor }
    static invisibleColor(): Color { return s_invisibleColor }
    static setInvisibleColor(c: Color): void { s_invisibleColor = c.clone() }
    static frameColor(): Color { return s_frameColor }
    /** the color of anchor lines (C++ engraving/colors/formattingColor) */
    static formattingColor(): Color { return s_formattingColor }
    static setFormattingColor(c: Color): void { s_formattingColor = c.clone() }
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

    /** selectionColor(voice).lighter(135) (QColor::lighter, computed in HSV with 16 bit components like Qt) */
    static highlightSelectionColor(voice: voice_idx_t = 0): Color {
        return qtLighter(EngravingConfiguration.selectionColor(voice), 135)
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
        s_formattingColor = Color.fromString('#C31989')
    }
}

/** QColor::lighter(factor) of an RGB color (via HSV with 16 bit components, back to 8 bit RGB) */
function qtLighter(c: Color, factor: number): Color {
    const USHRT_MAX = 65535
    // QColor::toHsv
    const r = c.r / 255
    const g = c.g / 255
    const b = c.b / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    let v = Math.round(max * USHRT_MAX)
    let s = 0
    let hue = -1
    if (delta !== 0) {
        s = Math.round((delta / max) * USHRT_MAX)
        let h: number
        if (r === max) {
            h = (g - b) / delta
        } else if (g === max) {
            h = 2.0 + (b - r) / delta
        } else {
            h = 4.0 + (r - g) / delta
        }
        h *= 60.0
        if (h < 0.0) {
            h += 360.0
        }
        hue = Math.round(h * 100)
    }

    // QColor::lighter
    v = Math.trunc((factor * v) / 100)
    if (v > USHRT_MAX) {
        s -= v - USHRT_MAX
        if (s < 0) {
            s = 0
        }
        v = USHRT_MAX
    }

    // QColor::toRgb of the HSV color
    let rr: number, gg: number, bb: number
    if (s === 0 || hue === -1) {
        rr = gg = bb = v
    } else {
        const h = hue === 36000 ? 0 : hue / 6000
        const sf = s / USHRT_MAX
        const vf = v / USHRT_MAX
        const i = Math.trunc(h)
        const f = h - i
        const p = vf * (1.0 - sf)
        let rf: number, gf: number, bf: number
        if (i & 1) {
            const q = vf * (1.0 - (sf * f))
            switch (i) {
            case 1: rf = q; gf = vf; bf = p; break
            case 3: rf = p; gf = q; bf = vf; break
            default: rf = vf; gf = p; bf = q; break // 5
            }
        } else {
            const t = vf * (1.0 - (sf * (1.0 - f)))
            switch (i) {
            case 0: rf = vf; gf = t; bf = p; break
            case 2: rf = p; gf = vf; bf = t; break
            default: rf = t; gf = p; bf = vf; break // 4
            }
        }
        rr = Math.round(rf * USHRT_MAX)
        gg = Math.round(gf * USHRT_MAX)
        bb = Math.round(bf * USHRT_MAX)
    }
    // qt_div_257
    const div257 = (x: number): number => Math.trunc((x - (x >> 8) + 0x80) >> 8)
    return new Color(div257(rr), div257(gg), div257(bb), c.a)
}
