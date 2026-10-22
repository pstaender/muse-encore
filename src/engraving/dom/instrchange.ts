/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrchange.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType, VOICES } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Instrument } from './instrument'
import { ClefInfo } from './clefinfo'
import { KeySigEvent } from './key'
import { Fraction } from '../types/fraction'
import { arg, mtrc } from '../../framework/global/translation'
import { Transpose } from '../editing/transpose'
import { ChangeInstrument } from '../editing/editinstrumentchange'
import type { EngravingItem } from './engravingitem'
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
    /** C++ setInstrument(Instrument*): this instrument change (and the part, ChangeInstrument) use the object itself */
    setInstrumentPtr(i: Instrument): void { this.m_instrument = i }

    setupInstrument(instrument: Instrument): void {
        if (!this.m_init) {
            return
        }

        const tickStart = this.segment().tick()
        const part = this.staff()!.part()
        const oldV = part.instrument(tickStart).transpose().clone()
        const oldKv = this.staff()!.transpose(tickStart).clone()
        const v = instrument.transpose()
        const concPitch = this.style().styleB(Sid.concertPitch)

        // change the clef for each staff
        for (let i = 0; i < part.nstaves(); i++) {
            const oldClefType = concPitch ? part.instrument(tickStart).clefType(i).concertClef
                : part.instrument(tickStart).clefType(i).transposingClef
            const newClefType = concPitch ? instrument.clefType(i).concertClef
                : instrument.clefType(i).transposingClef
            // Introduce cleff change only if the new clef *symbol* is different from the old one
            if (ClefInfo.symId(oldClefType) !== ClefInfo.symId(newClefType)) {
                // If instrument change is at the start of a measure, use the measure as the element, as this will place the instrument change before the barline.
                const element: EngravingItem = this.rtick().isZero() ? this.findMeasure()! : this
                this.score().undoChangeClef(part.staff(i)!, element, newClefType, true)
            }
        }

        // Change key signature if necessary. CAUTION: not necessary in case of octave-transposing!
        if ((v.chromatic - oldV.chromatic) % 12) {
            for (let i = 0; i < part.nstaves(); i++) {
                if (!part.staff(i)!.keySigEvent(tickStart).isAtonal()) {
                    const ks = new KeySigEvent()
                    // Check, if some key signature is already there, if no, mark new one "for instrument change"
                    const seg = this.segment().prev1(SegmentType.KeySig)
                    const voice = part.staff(i)!.idx() * VOICES
                    const e = seg ? seg.element(voice) : null
                    const ksig = e && e.isKeySig() ? e as unknown as KeySig : null
                    const forInstChange = !(ksig && ksig.tick().eq(tickStart) && !ksig.generated())
                    ks.setForInstrumentChange(forInstChange)
                    const cKey = part.staff(i)!.concertKey(tickStart)
                    ks.setConcertKey(cKey)
                    this.score().undoChangeKeySig(part.staff(i)!, tickStart, ks)
                }
            }
        }

        // change instrument in all linked scores
        for (const se of this.linkList()) {
            const lic = se as InstrumentChange
            const newInstrument = new Instrument()
            newInstrument.assign(instrument)
            lic.score().undo(new ChangeInstrument(lic, newInstrument))
        }

        // transpose for current score only
        // this automatically propagates to linked scores
        if (!part.instrument(tickStart).transpose().equals(oldV)) {
            const instruments = part.instruments()
            const i = instruments.upperBound(tickStart.ticks()) // find(), ++i
            let tickEnd: Fraction
            if (i === instruments.size()) {
                tickEnd = new Fraction(-1, 1)
            } else {
                tickEnd = Fraction.fromTicks(instruments.keyAt(i))
            }
            Transpose.transpositionChanged(this.score(), part, oldKv, tickStart, tickEnd)
        }

        //: The text of an "instrument change" marking. It is an instruction to the player to switch to another instrument.
        const newInstrChangeText = arg(mtrc('engraving', 'To %1'), instrument.trackName())
        this.undoChangeProperty(Pid.TEXT, TextBase.plainToXmlText(newInstrChangeText))
    }

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
