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

export class CompatUtils {
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
}
