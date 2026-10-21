/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/actionicon.h/.cpp: a dummy element for palette cells that trigger an action
 * (grace notes, beam modes, frames, ...), drawn as a glyph of the UI icon font.
 *
 * Deviation: the icon font (MusescoreIcon) belongs to the app, not to the engraving fonts; the glyph is drawn by
 * the UI (see palette/api.ts), so ActionIcon has no font here and its bbox is the square of the icon size.
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'

/** C++ mscore.h UI_ICONS_DEFAULT_FONT_SIZE (points) */
export const UI_ICONS_DEFAULT_FONT_SIZE = 12.0

export enum ActionIconType {
    UNDEFINED = -1,

    ACCIACCATURA,
    APPOGGIATURA,
    GRACE4,
    GRACE16,
    GRACE32,
    GRACE8_AFTER,
    GRACE16_AFTER,
    GRACE32_AFTER,

    BEAM_AUTO,
    BEAM_NONE,
    BEAM_BREAK_LEFT,
    BEAM_BREAK_INNER_8TH,
    BEAM_BREAK_INNER_16TH,
    BEAM_JOIN,

    BEAM_FEATHERED_DECELERATE,
    BEAM_FEATHERED_ACCELERATE,

    VFRAME,
    HFRAME,
    TFRAME,
    FFRAME,
    STAFF_TYPE_CHANGE,
    MEASURE,

    PARENTHESES,
    BRACKETS,

    STANDARD_BEND,
    PRE_BEND,
    GRACE_NOTE_BEND,
    SLIGHT_BEND,

    DIVE,
    PRE_DIVE,
    DIP,
    SCOOP,

    NOTE_ANCHORED_LINE,

    SYSTEM_LOCK,
}

export class ActionIcon extends EngravingItem {
    private m_actionType = ActionIconType.UNDEFINED
    private m_actionCode = ''
    private m_icon = 0

    constructor(parent: EngravingObject | null) {
        super(ElementType.ACTION_ICON, parent)
    }

    actionType(): ActionIconType { return this.m_actionType }
    setActionType(val: ActionIconType): void { this.m_actionType = val }

    actionCode(): string { return this.m_actionCode }

    setAction(actionCode: string, icon: number): void {
        this.m_actionCode = actionCode
        this.m_icon = icon
    }

    /** the code point in the icon font (0 until the app resolves the action's icon) */
    icon(): number { return this.m_icon }

    override subtype(): number { return this.m_actionType }

    override getProperty(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.ACTION:
            return this.m_actionCode
        default:
            break
        }
        return super.getProperty(pid)
    }

    override setProperty(pid: Pid, v: PropertyValue): boolean {
        switch (pid) {
        case Pid.ACTION:
            this.m_actionCode = v as string
            // TODO(port): triggerLayout()
            break
        default:
            return super.setProperty(pid, v)
        }
        return true
    }
}
