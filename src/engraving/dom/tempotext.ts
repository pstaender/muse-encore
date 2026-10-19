/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tempotext.h/.cpp
 *
 * TODO(port): tempo map, followText (updating the tempo from the text), accessibility
 */

import type { PropertyValue } from '../types/propertyvalue'
import { Constants } from '../types/constants'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Measure } from './measure'
import type { Segment } from './segment'
import { TextBase } from './textbase'

export enum TempoTextType {
    NORMAL,
    A_TEMPO,
    TEMPO_PRIMO,
}

const tempoStyle: ElementStyle = [
    { sid: Sid.tempoSystemFlag, pid: Pid.SYSTEM_FLAG },
    { sid: Sid.tempoPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.tempoMinDistance, pid: Pid.MIN_DISTANCE },
]

export class TempoText extends TextBase {
    static readonly DEFAULT_SYM_SIZE_RATIO = 5.0 / 3.0

    private m_tempoTextType = TempoTextType.NORMAL
    private m_tempo: number = Constants.DEFAULT_TEMPO // beats per second
    private m_followText = false
    private m_playTempoText = true
    private m_relative = 1.0
    private m_isRelative = false
    private m_alignRightOfRehearsalMark = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.TEMPO_TEXT, parent, TextStyleType.TEMPO, ElementFlag.SYSTEM | ElementFlag.ON_STAFF)
        this.initElementStyle(tempoStyle)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent() as unknown as Measure }

    tempoTextType(): TempoTextType { return this.m_tempoTextType }
    setTempoTextType(ttt: TempoTextType): void { this.m_tempoTextType = ttt }
    tempo(): number { return this.m_tempo }
    setTempo(v: number): void { this.m_tempo = v }
    tempoBpm(): number { return this.m_tempo * 60.0 }
    isRelative(): boolean { return this.m_isRelative }
    setRelative(v: number): void { this.m_isRelative = true; this.m_relative = v }
    playTempoText(): boolean { return this.m_playTempoText }
    setPlayTempoText(v: boolean): void { this.m_playTempoText = v }
    followText(): boolean { return this.m_followText }
    setFollowText(v: boolean): void { this.m_followText = v }
    alignRightOfRehearsalMark(): boolean { return this.m_alignRightOfRehearsalMark }

    override positionRelativeToNoteheadRest(): boolean { return true }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PLAY: return this.m_playTempoText
        case Pid.TEMPO: return this.m_tempo
        case Pid.TEMPO_FOLLOW_TEXT: return this.m_followText
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK: return this.m_alignRightOfRehearsalMark
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLAY:
            this.setPlayTempoText(v as boolean)
            break
        case Pid.TEMPO:
            this.setTempo(v as number)
            break
        case Pid.TEMPO_FOLLOW_TEXT:
            this.setFollowText(v as boolean)
            break
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK:
            this.m_alignRightOfRehearsalMark = v as boolean
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY: return true
        case Pid.TEXT_STYLE: return TextStyleType.TEMPO
        case Pid.TEMPO: return 2.0
        case Pid.TEMPO_FOLLOW_TEXT: return false
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK: return true
        default: return super.propertyDefault(id)
        }
    }
}
