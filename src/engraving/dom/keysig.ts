/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/keysig.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymId } from '../types/symid'
import { ElementType, Key, KeyMode } from '../types/types'
import { Sid } from '../style/styledef'
import { Transpose } from '../editing/transpose'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { KeySigEvent, type CustDef, type KeySym } from './key'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import type { Measure } from './measure'
import { TConv } from '../types/typesconv'

export class KeySigLayoutData extends LayoutData {
    keySymbols: KeySym[] = []
}

export class KeySig extends EngravingItem {
    private m_isCourtesy = false
    private m_showCourtesy = true
    private m_hideNaturals = false // used in layout to override score style (needed for the Continuous panel)
    private m_sig = new KeySigEvent()

    constructor(s: Segment | null) {
        super(ElementType.KEYSIG, s, ElementFlag.ON_STAFF)
    }

    protected override createLayoutData(): KeySigLayoutData { return new KeySigLayoutData(this) }
    override ldata(): KeySigLayoutData { return super.ldata() as KeySigLayoutData }
    override mutldata(): KeySigLayoutData { return super.ldata() as KeySigLayoutData }

    isCourtesy(): boolean { return this.m_isCourtesy }
    setIsCourtesy(v: boolean): void { this.m_isCourtesy = v }

    override mag(): number { return this.staff() ? this.staff()!.staffMag(this) : 1.0 }

    setKey(concertKey: Key, transposedKey?: Key): void {
        const e = new KeySigEvent()
        e.setConcertKey(concertKey)
        if (transposedKey !== undefined) {
            e.setKey(transposedKey)
        } else if (this.staff() && !this.style().styleB(Sid.concertPitch)) {
            const v = this.staff()!.part().instrument(this.tick()).transpose().clone()
            if (!v.isZero()) {
                v.flip()
                const tk = Transpose.transposeKey(concertKey, v, this.staff()!.part().preferSharpFlat())
                e.setKey(tk)
            }
        }
        this.setKeySigEvent(e)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure | null {
        return this.explicitParent() ? this.explicitParent()!.explicitParent() as unknown as Measure : null
    }

    key(): Key { return this.m_sig.key() }
    concertKey(): Key { return this.m_sig.concertKey() }
    customKeyDefs(): CustDef[] { return this.m_sig.customKeyDefs() }
    degInKey(degree: number): number { return this.m_sig.degInKey(degree) }
    symInKey(sym: SymId, degree: number): SymId { return this.m_sig.symInKey(sym, degree) }
    isCustom(): boolean { return this.m_sig.custom() }
    isAtonal(): boolean { return this.m_sig.isAtonal() }

    isChange(): boolean {
        if (!this.staff()) {
            return false
        }
        if (!this.explicitParent() || this.segment().segmentType() !== SegmentType.KeySig) {
            return false
        }
        const keyTick = this.tick()
        return this.staff()!.currentKeyTick(keyTick).eq(keyTick)
    }

    keySigEvent(): KeySigEvent { return this.m_sig }
    setKeySigEvent(e: KeySigEvent): void { this.m_sig = e.clone() }

    changeKeySigEvent(t: KeySigEvent): void {
        if (this.m_sig.equals(t)) {
            return
        }
        this.setKeySigEvent(t)
    }

    showCourtesy(): boolean { return this.m_showCourtesy }
    setShowCourtesy(v: boolean): void { this.m_showCourtesy = v }
    mode(): KeyMode { return this.m_sig.mode() }
    setMode(v: KeyMode): void { this.m_sig.setMode(v) }

    override staffOffset(): PointF {
        const seg = this.explicitParent() ? this.segment() : null
        const meas = seg ? seg.measure() : null
        if (meas && meas.endTick().eq(this.tick())) {
            return super.staffOffset()
        }
        return new PointF(0.0, 0.0)
    }

    hideNaturals(): boolean { return this.m_hideNaturals }
    setHideNaturals(hide: boolean): void { this.m_hideNaturals = hide }
    setForInstrumentChange(v: boolean): void { this.m_sig.setForInstrumentChange(v) }
    forInstrumentChange(): boolean { return this.m_sig.forInstrumentChange() }

    override subtype(): number { return this.key() + 7 }

    override propertyDelegate(propertyId: Pid): EngravingObject | null {
        if (!this.m_isCourtesy) {
            return null
        }
        switch (propertyId) {
        case Pid.KEY:
        case Pid.KEY_CONCERT:
        case Pid.SHOW_COURTESY:
        case Pid.KEYSIG_MODE:
        case Pid.IS_COURTESY: {
            const thisSeg = this.explicitParent() ? this.segment() : null
            const nextKSSeg = thisSeg ? thisSeg.next1(SegmentType.KeySig) : null
            if (nextKSSeg && nextKSSeg.tick().eq(thisSeg!.tick())) {
                return nextKSSeg.element(this.track())
            }
            break
        }
        default:
            break
        }
        return null
    }

    override getProperty(propertyId: Pid): PropertyValue {
        const e = this.propertyDelegate(propertyId)
        if (e) {
            return e.getProperty(propertyId)
        }
        switch (propertyId) {
        case Pid.KEY: return this.key()
        case Pid.KEY_CONCERT: return this.concertKey()
        case Pid.SHOW_COURTESY: return this.showCourtesy()
        case Pid.KEYSIG_MODE: return this.mode()
        case Pid.IS_COURTESY: return this.m_isCourtesy
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        const e = this.propertyDelegate(propertyId)
        if (e) {
            return e.setProperty(propertyId, v)
        }
        switch (propertyId) {
        case Pid.KEY:
            if (this.generated()) {
                return false
            }
            this.setKey(this.m_sig.concertKey(), v as Key)
            break
        case Pid.KEY_CONCERT:
            if (this.generated()) {
                return false
            }
            this.setKey(v as Key)
            break
        case Pid.SHOW_COURTESY:
            if (this.generated()) {
                return false
            }
            this.setShowCourtesy(!!v)
            break
        case Pid.KEYSIG_MODE:
            if (this.generated()) {
                return false
            }
            this.setMode(v as KeyMode)
            this.staff()!.setKey(this.tick(), this.keySigEvent())
            break
        case Pid.IS_COURTESY:
            this.m_isCourtesy = !!v
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.KEY: return Key.INVALID
        case Pid.KEY_CONCERT: return Key.INVALID
        case Pid.SHOW_COURTESY: return true
        case Pid.KEYSIG_MODE: return KeyMode.UNKNOWN
        case Pid.IS_COURTESY: return false
        default: return super.propertyDefault(id)
        }
    }

    override accessibleInfo(): string {
        const keySigType = TConv.translatedUserNameKey(this.key(), this.isAtonal(), this.isCustom())
        return `${this.translatedTypeUserName()}: ${keySigType}`
    }
}
