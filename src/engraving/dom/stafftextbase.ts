/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafftextbase.h/.cpp, stafftext.h/.cpp and systemtext.h/.cpp
 *
 * TODO(port): sound flags, playback related properties (midi actions, aeolus stops, swing, capo) are read but unused
 */

import type { PropertyValue } from '../types/propertyvalue'
import { Constants } from '../types/constants'
import { ElementType, TextStyleType, VOICES } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'
import { TextBase } from './textbase'

export interface ChannelActions {
    channel: number
    midiActionNames: string[]
}

export abstract class StaffTextBase extends TextBase {
    private m_channelNames: string[] = ['', '', '', '']
    private m_channelActions: ChannelActions[] = []
    private m_swingParameters = { swingUnit: 0, swingRatio: 0 }
    private m_setAeolusStops = false
    private m_aeolusStops = [0, 0, 0, 0]
    private m_swing = false
    private m_capo = 0

    protected constructor(type: ElementType, parent: EngravingObject | null, tid: TextStyleType, flags: number = ElementFlag.ON_STAFF) {
        super(type, parent, tid, flags)
        this.setSwingParameters(Constants.DIVISION / 2, 60)
    }

    /** C++ StaffTextBase::clear() (hides TextBase::clear()) */
    clearStaffTextBase(): void {
        for (let voice = 0; voice < VOICES; ++voice) {
            this.m_channelNames[voice] = ''
        }
        this.clearAeolusStops()
    }

    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }

    channelName(voice: number): string { return this.m_channelNames[voice] }
    setChannelName(v: number, s: string): void { this.m_channelNames[v] = s }
    setSwingParameters(unit: number, ratio: number): void { this.m_swingParameters = { swingUnit: unit, swingRatio: ratio } }
    swingParameters(): { swingUnit: number; swingRatio: number } { return this.m_swingParameters }
    channelActions(): ChannelActions[] { return this.m_channelActions }
    clearAeolusStops(): void { this.m_aeolusStops = [0, 0, 0, 0] }
    setAeolusStop(group: number, val: number): void { this.m_aeolusStops[group] = val }
    aeolusStop(group: number): number { return this.m_aeolusStops[group] }
    setSetAeolusStops(val: boolean): void { this.m_setAeolusStops = val }
    setAeolusStops(): boolean { return this.m_setAeolusStops }
    setSwing(checked: boolean): void { this.m_swing = checked }
    swing(): boolean { return this.m_swing }
    setCapo(fretId: number): void { this.m_capo = fretId }
    capo(): number { return this.m_capo }

    override positionRelativeToNoteheadRest(): boolean { return true }
}

const STAFF_STYLE: ElementStyle = [
    { sid: Sid.staffTextPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.staffTextMinDistance, pid: Pid.MIN_DISTANCE },
]

export class StaffText extends StaffTextBase {
    constructor(parent: EngravingObject | null, tid: TextStyleType = TextStyleType.STAFF) {
        super(ElementType.STAFF_TEXT, parent, tid, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(STAFF_STYLE)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.STAFF
        default:
            return super.propertyDefault(id)
        }
    }
}

const SYSTEM_STYLE: ElementStyle = [
    { sid: Sid.systemTextPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.systemTextMinDistance, pid: Pid.MIN_DISTANCE },
]

export class SystemText extends StaffTextBase {
    constructor(parent: EngravingObject | null, tid: TextStyleType = TextStyleType.SYSTEM, type: ElementType = ElementType.SYSTEM_TEXT) {
        super(type, parent, tid, ElementFlag.SYSTEM | ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(SYSTEM_STYLE)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.SYSTEM
        default:
            return super.propertyDefault(id)
        }
    }
}
