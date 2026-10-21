/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafftextbase.h/.cpp, stafftext.h/.cpp and systemtext.h/.cpp
 *
 */

import type { PropertyValue } from '../types/propertyvalue'
import { Constants } from '../types/constants'
import { ElementType, TextStyleType, VOICES } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { SoundFlag } from './soundflag'
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
    getAeolusStop(group: number, idx: number): boolean { return (this.m_aeolusStops[group] & (1 << idx)) !== 0 }
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

/** C++ undo command Link (editing/addremoveelement.ts sets it: the DOM cannot create undo commands) */
export const staffTextHooks: {
    undoLink: ((e1: EngravingItem, e2: EngravingItem) => void) | null
} = { undoLink: null }

export class StaffText extends StaffTextBase {
    private m_soundFlag: SoundFlag | null = null

    constructor(parent: EngravingObject | null, tid: TextStyleType = TextStyleType.STAFF) {
        super(ElementType.STAFF_TEXT, parent, tid, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(STAFF_STYLE)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
    }

    /** C++ copy constructor */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_soundFlag = null
        if (original.m_soundFlag) {
            this.setSoundFlag(original.m_soundFlag.clone() as SoundFlag)
        }
    }

    override linkedClone(): EngravingItem {
        const clone = super.linkedClone() as StaffText

        if (clone.m_soundFlag && this.m_soundFlag) {
            staffTextHooks.undoLink?.(clone.m_soundFlag, this.m_soundFlag)
        }

        return clone
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.m_soundFlag) {
            this.m_soundFlag.scanElements(func)
        }

        super.scanElements(func)
    }

    override add(e: EngravingItem): void {
        e.setParent(this)
        e.setTrack(this.track())

        switch (e.type()) {
        case ElementType.SOUND_FLAG:
            this.setSoundFlag(e as SoundFlag)
            e.added()
            return
        default:
            break
        }

        super.add(e)
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.SOUND_FLAG: {
            if (this.soundFlag() === e) {
                this.setSoundFlag(null)
                e.removed()
                return
            }
            // else C++ LOGD("StaffText::remove: %s %p there is already another sound flag")
            break
        }
        default:
            break
        }

        super.remove(e)
    }

    override setTrack(idx: number): void {
        super.setTrack(idx)

        if (this.m_soundFlag) {
            this.m_soundFlag.setTrack(idx)
        }
    }

    hasSoundFlag(): boolean { return this.m_soundFlag !== null }
    soundFlag(): SoundFlag | null { return this.m_soundFlag }

    setSoundFlag(flag: SoundFlag | null): void {
        if (this.m_soundFlag === flag) {
            return
        }

        this.m_soundFlag = flag

        if (this.m_soundFlag) {
            this.m_soundFlag.setParent(this)
            this.m_soundFlag.setTrack(this.track())
        }

        this.triggerLayout()
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
