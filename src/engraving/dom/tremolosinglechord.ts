/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tremolosinglechord.h/.cpp (editing is not ported)
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import { Transform } from '../../framework/draw/types/transform'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { ElementType, TremoloChordType, TremoloType, type staff_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { TDuration } from './durationtype'
import { EngravingItem, ElementFlag } from './engravingitem'
import { Pid } from './property'
import type { Chord } from './chord'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'

export class TremoloSingleChord extends EngravingItem {
    private m_tremoloType = TremoloType.INVALID_TREMOLO
    private m_durationType = new TDuration()
    private m_path = new PainterPath()
    private m_playTremolo = true
    private m_lines = 0 // derived from _subtype

    constructor(parent: Chord | null) {
        super(ElementType.TREMOLO_SINGLECHORD, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
    }

    chord(): Chord | null { return this.explicitParent() as unknown as Chord | null }
    override subtype(): number { return this.m_tremoloType }

    chordMag(): number {
        return this.explicitParent() ? this.chord()!.intrinsicMag() : 1.0
    }

    minHeight(): number {
        const sw = this.style().styleS(Sid.tremoloLineWidth).val() * this.chordMag()
        const td = this.style().styleS(Sid.tremoloDistance).val() * this.chordMag()
        return (this.lines() - 1) * td + sw
    }

    setTremoloType(t: TremoloType): void {
        this.m_tremoloType = t
        switch (t) {
        case TremoloType.R16:
        case TremoloType.C16:
            this.m_lines = 2
            break
        case TremoloType.R32:
        case TremoloType.C32:
            this.m_lines = 3
            break
        case TremoloType.R64:
        case TremoloType.C64:
            this.m_lines = 4
            break
        default:
            this.m_lines = 1
            break
        }
        this.styleChanged()
    }

    tremoloType(): TremoloType { return this.m_tremoloType }

    override styleChanged(): void {
        super.styleChanged()
        this.computeShape()
    }

    override vStaffIdx(): staff_idx_t {
        const c = this.chord()
        return c ? c.vStaffIdx() : super.vStaffIdx()
    }

    basePath(_stretch = 0): PainterPath {
        if (this.isBuzzRoll()) {
            return new PainterPath()
        }

        const sp = this.spatium() * this.chordMag()

        const w2 = sp * this.style().styleS(Sid.tremoloWidth).val() * 0.5
        const lw = sp * this.style().styleS(Sid.tremoloLineWidth).val()
        const td = sp * this.style().styleS(Sid.tremoloDistance).val()

        let ppath = new PainterPath()

        // first line
        ppath.addRect(-w2, 0.0, 2.0 * w2, lw)

        let ty = td

        // other lines
        for (let i = 1; i < this.m_lines; i++) {
            ppath.addRect(-w2, ty, 2.0 * w2, lw)
            ty += td
        }

        const shearTransform = new Transform()
        shearTransform.shear(0.0, -(lw / 2.0) / w2)
        ppath = shearTransform.mapPath(ppath)

        return ppath
    }

    computeShape(): void {
        if (!this.score()) {
            return
        }
        if (this.isBuzzRoll()) {
            this.setbbox(this.symBbox(SymId.buzzRoll))
        } else {
            this.m_path = this.basePath()
            this.setbbox(this.m_path.boundingRect())
        }
    }

    path(): PainterPath { return this.m_path }
    setPath(p: PainterPath): void { this.m_path = p }

    durationType(): TDuration { return this.m_durationType }
    setDurationType(d: TDuration): void {
        if (this.m_durationType.equals(d)) {
            return
        }
        this.m_durationType = d
        this.styleChanged()
    }

    tremoloLen(): Fraction {
        switch (this.lines()) {
        case 1: return new Fraction(1, 8)
        case 2: return new Fraction(1, 16)
        case 3: return new Fraction(1, 32)
        case 4: return new Fraction(1, 64)
        }
        return new Fraction(0, 1)
    }

    isBuzzRoll(): boolean { return this.m_tremoloType === TremoloType.BUZZ_ROLL }
    lines(): number { return this.m_lines }
    playTremolo(): boolean { return this.m_playTremolo }
    setPlayTremolo(v: boolean): void { this.m_playTremolo = v }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TREMOLO_TYPE: return this.m_tremoloType
        case Pid.PLAY: return this.m_playTremolo
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TREMOLO_TYPE:
            this.setTremoloType(val as TremoloType)
            break
        case Pid.PLAY:
            this.setPlayTremolo(!!val)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TREMOLO_STYLE: return this.style().styleI(Sid.tremoloStyle)
        case Pid.PLAY: return true
        default: return super.propertyDefault(propertyId)
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        const c = this.chord()
        if (c && c.tremoloChordType() === TremoloChordType.TremoloSecondChord) {
            return
        }
        super.scanElements(func)
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameTremoloType(this.tremoloType())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.translatedSubtypeUserName()}`
    }

    override spatiumChanged(oldValue: number, newValue: number): void {
        super.spatiumChanged(oldValue, newValue)
        this.computeShape()
    }
}
