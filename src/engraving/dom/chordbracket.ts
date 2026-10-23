/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordbracket.h/.cpp
 * TODO(port): reset() (EngravingItem::reset is not ported)
 */

import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ArpeggioType, DirectionV, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { Arpeggio } from './arpeggio'
import type { Chord } from './chord'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'

const chordBracketStyle: ElementStyle = [
    { sid: Sid.chordBracketHookLen, pid: Pid.BRACKET_HOOK_LEN },
]

export class ChordBracket extends Arpeggio {
    private m_hookLength = new Spatium(1)
    private m_hookPos = DirectionV.AUTO // AUTO == both up and down hooks
    private m_rightSide = false

    constructor(parent: Chord | null) {
        super(parent, ElementType.CHORD_BRACKET)
        this.setArpeggioType(ArpeggioType.BRACKET)

        this.initElementStyle(chordBracketStyle)
    }

    hookLength(): Spatium { return this.m_hookLength }
    hookPos(): DirectionV { return this.m_hookPos }
    rightSide(): boolean { return this.m_rightSide }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BRACKET_HOOK_LEN:
            return this.m_hookLength
        case Pid.BRACKET_HOOK_POS:
            return this.m_hookPos
        case Pid.BRACKET_RIGHT_SIDE:
            return this.m_rightSide
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.BRACKET_HOOK_LEN:
            this.m_hookLength = val as Spatium
            break
        case Pid.BRACKET_HOOK_POS:
            this.m_hookPos = val as DirectionV
            break
        case Pid.BRACKET_RIGHT_SIDE:
            this.m_rightSide = val as boolean
            break
        default:
            if (!super.setProperty(propertyId, val)) {
                return false
            }
            break
        }
        this.triggerLayout()
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BRACKET_HOOK_LEN:
            return this.style().styleS(Sid.chordBracketHookLen)
        case Pid.BRACKET_HOOK_POS:
            return DirectionV.AUTO // Both
        case Pid.BRACKET_RIGHT_SIDE:
            return false
        default:
            break
        }
        return super.propertyDefault(propertyId)
    }
}
