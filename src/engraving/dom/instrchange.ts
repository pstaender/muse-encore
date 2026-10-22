/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrchange.h/.cpp
 * TODO(port): setupInstrument (editing)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType, VOICES } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Instrument } from './instrument'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import type { Clef } from './clef'
import type { KeySig } from './keysig'
import { TextBase } from './textbase'

const instrumentChangeStyle: ElementStyle = [
    { sid: Sid.instrumentChangePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.instrumentChangeMinDistance, pid: Pid.MIN_DISTANCE },
]

export class InstrumentChange extends TextBase {
    private m_instrument: Instrument // Staff holds ownership if part of score
    private m_init = false // Set if the instrument has been set by the user, as there is no other way to tell.

    constructor(parent: EngravingObject | null, instrument?: Instrument) {
        super(ElementType.INSTRUMENT_CHANGE, parent, TextStyleType.INSTRUMENT_CHANGE, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(instrumentChangeStyle)
        this.m_instrument = new Instrument()
        if (instrument) {
            this.m_instrument.assign(instrument)
        }
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_instrument = new Instrument()
        this.m_instrument.assign(original.m_instrument)
    }

    instrument(): Instrument { return this.m_instrument }
    setInstrument(i: Instrument): void { this.m_instrument.assign(i) }

    init(): boolean { return this.m_init }
    setInit(init: boolean): void { this.m_init = init }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    keySigs(all = false): KeySig[] {
        const keysigs: KeySig[] = []
        const seg = this.segment().prev1(SegmentType.KeySig)
        if (seg) {
            const part = this.part()!
            const startVoice = part.staff(0)!.idx() * VOICES
            const endVoice = part.staff(part.nstaves() - 1)!.idx() * VOICES
            const t = this.tick()
            for (let i = startVoice; i <= endVoice; i += VOICES) {
                const e = seg.element(i)
                const ks = e && e.isKeySig() ? e as unknown as KeySig : null
                if (ks && (all || ks.forInstrumentChange()) && ks.tick().eq(t)) {
                    keysigs.push(ks)
                }
            }
        }
        return keysigs
    }

    clefs(): Clef[] {
        const clefs: Clef[] = []
        const seg = this.segment().prev1(SegmentType.Clef)
        if (seg) {
            const part = this.part()!
            const startVoice = part.staff(0)!.idx() * VOICES
            const endVoice = part.staff(part.nstaves() - 1)!.idx() * VOICES
            const t = this.tick()
            for (let i = startVoice; i <= endVoice; i += VOICES) {
                const e = seg.element(i)
                const clef = e && e.isClef() ? e as unknown as Clef : null
                if (clef && clef.forInstrumentChange() && clef.tick().eq(t)) {
                    clefs.push(clef)
                }
            }
        }
        return clefs
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TEXT_STYLE:
            return TextStyleType.INSTRUMENT_CHANGE
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override positionRelativeToNoteheadRest(): boolean { return true }

    override placeMultiple(): boolean { return false }
}
