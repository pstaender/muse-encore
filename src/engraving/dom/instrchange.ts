/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrchange.h/.cpp
 * TODO(port): setupInstrument, keySigs, clefs (editing)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Instrument } from './instrument'
import { Pid } from './property'
import type { Segment } from './segment'
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
