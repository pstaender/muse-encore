/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/compat/compatutils.h/.cpp
 * TODO(port): the other compatibility functions
 */

import type { AlignH } from '../../types/types'
import { Pid, PropertyFlags } from '../../dom/property'
import type { TextLineBase } from '../../dom/textlinebase'
import type { Spatium } from '../../types/dimension'
import { Font, FontType } from '../../../framework/draw/types/font'
import { fontProvider } from '../../infrastructure/engravingcontext'
import { Sid, STYLE_VALUES } from '../../style/styledef'
import { Key } from '../../types/types'
import { function2Tpc } from '../../dom/pitchspelling'
import type { Harmony, HarmonyInfo } from '../../dom/harmony'

export class CompatUtils {
    static setHarmonyRootTpcFromFunction(info: HarmonyInfo, h: Harmony, s: string): void {
        const st = h.staff()
        const key = st ? st.key(h.tick()) : Key.INVALID
        info.setRootTpc(function2Tpc(s, key).tpc)
    }

    /** read400/read410: hook heights of lines below the staff were stored with the opposite sign before 4.6 */
    static resetHookHeightSign(tl: TextLineBase): void {
        if (!tl.placeBelow()) {
            return
        }

        if (!tl.isStyled(Pid.BEGIN_HOOK_HEIGHT)) {
            const beginHookHeight = tl.getProperty(Pid.BEGIN_HOOK_HEIGHT) as Spatium
            tl.setProperty(Pid.BEGIN_HOOK_HEIGHT, beginHookHeight.neg())
        }
        if (!tl.isStyled(Pid.END_HOOK_HEIGHT)) {
            const endHookHeight = tl.getProperty(Pid.END_HOOK_HEIGHT) as Spatium
            tl.setProperty(Pid.END_HOOK_HEIGHT, endHookHeight.neg())
        }
    }

    static setTextLineTextPositionFromAlign(tl: TextLineBase): void {
        tl.setBeginTextPosition(tl.beginTextAlign().horizontal)
        if (tl.beginTextPosition() !== (tl.propertyDefault(Pid.BEGIN_TEXT_POSITION) as AlignH)) {
            tl.setPropertyFlags(Pid.BEGIN_TEXT_POSITION, PropertyFlags.UNSTYLED)
        }
        tl.setContinueTextPosition(tl.continueTextAlign().horizontal)
        if (tl.continueTextPosition() !== (tl.propertyDefault(Pid.CONTINUE_TEXT_POSITION) as AlignH)) {
            tl.setPropertyFlags(Pid.CONTINUE_TEXT_POSITION, PropertyFlags.UNSTYLED)
        }
        tl.setEndTextPosition(tl.endTextAlign().horizontal)
        if (tl.endTextPosition() !== (tl.propertyDefault(Pid.END_TEXT_POSITION) as AlignH)) {
            tl.setPropertyFlags(Pid.END_TEXT_POSITION, PropertyFlags.UNSTYLED)
        }
    }

    static convertChordExtModUnits(val: number): number {
        // Pre 4.6 this value was in 1/5 of a spatium
        // After 4.6 this is in % of root cap height
        // The best we can do for conversion of old files is to assume a default spatium of 1.75mm and a default font size of 10pt
        // The height value is calculated from Edwin at 10pt using FontMetrics::capHeight
        const DEFAULT_SPATIUM = STYLE_VALUES[Sid.spatium].defaultValue as number
        const f = new Font('Edwin', FontType.Text)
        f.setPointSizeF(10)
        const DEFAULT_FONT_CAP_HEIGHT = fontProvider().capHeight(f) || 121 // 121 if the font is not loaded

        return ((val / 5) * DEFAULT_SPATIUM) / DEFAULT_FONT_CAP_HEIGHT
    }
}
