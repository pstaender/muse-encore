/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/arpeggio.h/.cpp (editing and chord attaching are not ported)
 */

import { RectF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymId } from '../types/symid'
import { ArpeggioType, ElementType, VOICES, type staff_idx_t, type track_idx_t } from '../types/types'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { Pid } from './property'
import type { Chord } from './chord'

export class ArpeggioLayoutData extends LayoutData {
    top = 0.0
    bottom = 0.0
    magS = 0.0
    maxChordPad = 0.0
    minChordX = 0.0
    symbols: SymId[] = []
    symsBBox = new RectF()
    arpeggioHeight = -1.0
}

export class Arpeggio extends EngravingItem {
    private m_arpeggioType = ArpeggioType.NORMAL
    private m_userLen1 = 0.0
    private m_userLen2 = 0.0
    private m_span = 1 // how many voices the arpeggio spans
    private m_playArpeggio = true
    private m_stretch = 1.0

    constructor(parent: Chord | null, type: ElementType = ElementType.ARPEGGIO) {
        super(type, parent, ElementFlag.MOVABLE)
        if (type === ElementType.ARPEGGIO && parent) {
            parent.setSpanArpeggio(this)
        }
    }

    protected override createLayoutData(): ArpeggioLayoutData { return new ArpeggioLayoutData(this) }
    override ldata(): ArpeggioLayoutData { return super.ldata() as ArpeggioLayoutData }
    override mutldata(): ArpeggioLayoutData { return super.ldata() as ArpeggioLayoutData }

    arpeggioType(): ArpeggioType { return this.m_arpeggioType }
    setArpeggioType(v: ArpeggioType): void { this.m_arpeggioType = v }
    override subtype(): number { return this.m_arpeggioType }
    chord(): Chord | null { return this.explicitParent() as unknown as Chord | null }

    span(): number { return this.m_span }
    setSpan(val: number): void { this.m_span = val }
    endTrack(): track_idx_t { return this.track() + this.m_span - 1 }

    /** C++ Arpeggio::findAndAttachToChords() (TODO(port): rebaseEndAnchor, undo) */
    findAndAttachToChords(): void {
        const strack = this.track()
        const _chord = this.chord()!
        const etrack = strack + (this.m_span - 1)
        let lastTrack = strack
        for (let track = strack; track <= etrack; track++) {
            const e = _chord.segment()!.element(track)
            if (e && e.isChord()) {
                (e as unknown as Chord).setSpanArpeggio(this)
                lastTrack = track
            }
        }

        if (lastTrack !== etrack) {
            this.m_span = lastTrack - strack + 1
        }
    }

    crossStaff(): boolean {
        return Math.trunc((this.track() + this.span() - 1) / VOICES) !== this.vStaffIdx()
    }

    override vStaffIdx(): staff_idx_t {
        const c = this.chord()
        return c ? c.vStaffIdx() : super.vStaffIdx()
    }

    userLen1(): number { return this.m_userLen1 }
    userLen2(): number { return this.m_userLen2 }
    setUserLen1(v: number): void { this.m_userLen1 = v }
    setUserLen2(v: number): void { this.m_userLen2 = v }
    playArpeggio(): boolean { return this.m_playArpeggio }
    setPlayArpeggio(p: boolean): void { this.m_playArpeggio = p }
    Stretch(): number { return this.m_stretch }
    setStretch(val: number): void { this.m_stretch = val }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.ARPEGGIO_TYPE: return this.m_arpeggioType
        case Pid.TIME_STRETCH: return this.Stretch()
        case Pid.ARP_USER_LEN1: return this.userLen1()
        case Pid.ARP_USER_LEN2: return this.userLen2()
        case Pid.PLAY: return this.m_playArpeggio
        case Pid.ARPEGGIO_SPAN: return this.m_span
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.ARPEGGIO_TYPE:
            this.setArpeggioType(val as ArpeggioType)
            break
        case Pid.TIME_STRETCH:
            this.setStretch(val as number)
            break
        case Pid.ARP_USER_LEN1:
            this.setUserLen1(val as number)
            break
        case Pid.ARP_USER_LEN2:
            this.setUserLen2(val as number)
            break
        case Pid.PLAY:
            this.setPlayArpeggio(!!val)
            break
        case Pid.ARPEGGIO_SPAN:
            this.setSpan(val as number)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.ARP_USER_LEN1: return 0.0
        case Pid.ARP_USER_LEN2: return 0.0
        case Pid.TIME_STRETCH: return 1.0
        case Pid.PLAY: return true
        case Pid.ARPEGGIO_SPAN: return 1
        default: return super.propertyDefault(propertyId)
        }
    }
}
