/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/jump.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, JumpType, PlacementV, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Measure } from './measure'
import { Pid } from './property'
import { TextBase } from './textbase'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'

const jumpStyle: ElementStyle = [
    { sid: Sid.repeatRightPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.repeatMinDistance, pid: Pid.MIN_DISTANCE },
]

interface JumpTypeTableItem {
    type: JumpType
    text: string
    jumpTo: string
    playUntil: string
    continueAt: string
}

export const jumpTypeTable: readonly JumpTypeTableItem[] = [
    { type: JumpType.DC, text: 'D.C.', jumpTo: 'start', playUntil: 'end', continueAt: '' },
    { type: JumpType.DC_AL_FINE, text: 'D.C. al Fine', jumpTo: 'start', playUntil: 'fine', continueAt: '' },
    { type: JumpType.DC_AL_CODA, text: 'D.C. al Coda', jumpTo: 'start', playUntil: 'coda', continueAt: 'codab' },
    { type: JumpType.DS_AL_CODA, text: 'D.S. al Coda', jumpTo: 'segno', playUntil: 'coda', continueAt: 'codab' },
    { type: JumpType.DS_AL_FINE, text: 'D.S. al Fine', jumpTo: 'segno', playUntil: 'fine', continueAt: '' },
    { type: JumpType.DS, text: 'D.S.', jumpTo: 'segno', playUntil: 'end', continueAt: '' },
    { type: JumpType.DC_AL_DBLCODA, text: 'D.C. al Doppia Coda', jumpTo: 'start', playUntil: 'varcoda', continueAt: 'codab' },
    { type: JumpType.DS_AL_DBLCODA, text: 'D.S. al Doppia Coda', jumpTo: 'segno', playUntil: 'varcoda', continueAt: 'codab' },
    { type: JumpType.DSS, text: 'Dal Doppio Segno', jumpTo: 'varsegno', playUntil: 'end', continueAt: '' },
    { type: JumpType.DSS_AL_CODA, text: 'D.D.S. al Coda', jumpTo: 'varsegno', playUntil: 'coda', continueAt: 'codab' },
    { type: JumpType.DSS_AL_DBLCODA, text: 'D.D.S. al Doppia Coda', jumpTo: 'varsegno', playUntil: 'varcoda', continueAt: 'codab' },
    { type: JumpType.DSS_AL_FINE, text: 'D.D.S. al Fine', jumpTo: 'varsegno', playUntil: 'fine', continueAt: '' },
]

export class Jump extends TextBase {
    private m_jumpTo = ''
    private m_playUntil = ''
    private m_continueAt = ''
    private m_playRepeats = false

    constructor(parent: EngravingObject | null) {
        super(ElementType.JUMP, parent, TextStyleType.REPEAT_RIGHT, ElementFlag.MOVABLE | ElementFlag.SYSTEM | ElementFlag.ON_STAFF)
        this.initElementStyle(jumpStyle)
        this.m_playRepeats = false
    }

    setJumpType(t: JumpType): void {
        for (const p of jumpTypeTable) {
            if (p.type === t) {
                this.setXmlText(p.text)
                this.setJumpTo(p.jumpTo)
                this.setPlayUntil(p.playUntil)
                this.setContinueAt(p.continueAt)
                this.initTextStyleType(TextStyleType.REPEAT_RIGHT)
                break
            }
        }
    }

    jumpType(): JumpType {
        for (const t of jumpTypeTable) {
            if (this.m_jumpTo === t.jumpTo && this.m_playUntil === t.playUntil && this.m_continueAt === t.continueAt) {
                return t.type
            }
        }
        return JumpType.USER
    }

    override subtype(): number { return this.jumpType() }

    measure(): Measure { return this.explicitParent() as unknown as Measure }

    jumpTo(): string { return this.m_jumpTo }
    playUntil(): string { return this.m_playUntil }
    continueAt(): string { return this.m_continueAt }
    setJumpTo(s: string): void { this.m_jumpTo = s }
    setPlayUntil(s: string): void { this.m_playUntil = s }
    setContinueAt(s: string): void { this.m_continueAt = s }
    playRepeats(): boolean { return this.m_playRepeats }
    setPlayRepeats(val: boolean): void { this.m_playRepeats = val }

    override positionRelativeToNoteheadRest(): boolean { return false }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.JUMP_TO:
            return this.jumpTo()
        case Pid.PLAY_UNTIL:
            return this.playUntil()
        case Pid.CONTINUE_AT:
            return this.continueAt()
        case Pid.PLAY_REPEATS:
            return this.playRepeats()
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.JUMP_TO:
            this.setJumpTo(v as string)
            break
        case Pid.PLAY_UNTIL:
            this.setPlayUntil(v as string)
            break
        case Pid.CONTINUE_AT:
            this.setContinueAt(v as string)
            break
        case Pid.PLAY_REPEATS:
            this.setPlayRepeats(v as boolean)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.JUMP_TO:
        case Pid.PLAY_UNTIL:
        case Pid.CONTINUE_AT:
            return ''
        case Pid.PLAY_REPEATS:
            return false
        case Pid.PLACEMENT:
            return PlacementV.ABOVE
        default:
            break
        }
        return super.propertyDefault(propertyId)
    }

    jumpTypeUserName(): string {
        return TConv.translatedUserNameJumpType(this.jumpType())
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameJumpType(this.jumpType())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.jumpTypeUserName()}`
    }
}
