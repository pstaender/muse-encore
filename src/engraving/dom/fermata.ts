/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/fermata.h/.cpp
 */

import { LineF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { ElementType, FermataType, PlacementV } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { ChordRest } from './chordrest'
import type { Measure } from './measure'
import type { Segment } from './segment'
import type { TranslatableString } from '../../framework/global/types/translatablestring'

const fermataStyle: ElementStyle = [
    { sid: Sid.fermataPosAbove, pid: Pid.OFFSET },
    { sid: Sid.fermataMinDistance, pid: Pid.MIN_DISTANCE },
]

const FERMATA_TYPES = new Map<SymId, FermataType>([
    [SymId.fermataAbove, FermataType.Normal],
    [SymId.fermataBelow, FermataType.Normal],
    [SymId.fermataLongAbove, FermataType.Long],
    [SymId.fermataLongBelow, FermataType.Long],
    [SymId.fermataLongHenzeAbove, FermataType.LongHenze],
    [SymId.fermataLongHenzeBelow, FermataType.LongHenze],
    [SymId.fermataVeryLongAbove, FermataType.VeryLong],
    [SymId.fermataVeryLongBelow, FermataType.VeryLong],
    [SymId.fermataShortHenzeAbove, FermataType.ShortHenze],
    [SymId.fermataShortHenzeBelow, FermataType.ShortHenze],
    [SymId.fermataVeryShortAbove, FermataType.VeryShort],
    [SymId.fermataVeryShortBelow, FermataType.VeryShort],
    [SymId.fermataShortAbove, FermataType.Short],
    [SymId.fermataShortBelow, FermataType.Short],
])

export class Fermata extends EngravingItem {
    private m_symId = SymId.noSym
    private m_timeStretch = -1.0
    private m_play = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.FERMATA, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.setPlacement(PlacementV.ABOVE)
        this.initElementStyle(fermataStyle)
    }

    symId(): SymId { return this.m_symId }
    setSymId(id: SymId): void { this.m_symId = id }

    setSymIdAndTimeStretch(id: SymId): void {
        this.m_symId = id
        this.m_timeStretch = this.m_timeStretch === -1 ? this.propertyDefault(Pid.TIME_STRETCH) as number : -1
    }

    fermataType(): FermataType { return FERMATA_TYPES.get(this.m_symId) ?? FermataType.Undefined }

    override subtype(): number {
        const s = SymNames.nameForSymId(this.m_symId)
        if (s.endsWith('Below')) {
            return SymNames.symIdByName(s.substring(0, s.length - 5) + 'Above')
        }
        return this.m_symId
    }

    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }

    measure(): Measure | null {
        const s = this.segment()
        return s ? s.explicitParent() as unknown as Measure : null
    }

    timeStretch(): number { return this.m_timeStretch }
    setTimeStretch(val: number): void { this.m_timeStretch = val }
    play(): boolean { return this.m_play }
    setPlay(val: boolean): void { this.m_play = val }

    override mag(): number {
        let m = this.staff() ? this.staff()!.staffMag(this.tick()) * this.style().styleD(Sid.articulationMag) : 1.0
        const seg = this.segment()
        if (seg && seg.isChordRestType() && seg.element(this.track())) {
            m *= (seg.element(this.track()) as ChordRest).intrinsicMag()
        }
        return m
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYMBOL: return this.m_symId
        case Pid.TIME_STRETCH: return this.m_timeStretch
        case Pid.PLAY: return this.m_play
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SYMBOL:
            this.setSymIdAndTimeStretch(v as SymId)
            break
        case Pid.PLACEMENT: {
            const pl = v as PlacementV
            if (pl !== this.placement()) {
                const s = SymNames.nameForSymId(this.m_symId)
                const up = this.placeAbove()
                if (s.endsWith(up ? 'Above' : 'Below')) {
                    this.m_symId = SymNames.symIdByName(s.substring(0, s.length - 5) + (up ? 'Below' : 'Above'))
                }
                this.setPlacement(pl)
            }
        }
            break
        case Pid.PLAY:
            this.setPlay(v as boolean)
            break
        case Pid.TIME_STRETCH:
            this.setTimeStretch(v as number)
            this.score().setUpTempoMapLater()
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PLACEMENT:
            return this.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE
        case Pid.TIME_STRETCH:
            switch (this.fermataType()) {
            case FermataType.VeryShort: return 1.25
            case FermataType.Short:
            case FermataType.ShortHenze: return 1.5
            case FermataType.Normal:
            case FermataType.Undefined: return 2.0
            case FermataType.Long:
            case FermataType.LongHenze: return 3.0
            case FermataType.VeryLong: return 4.0
            }
            break
        case Pid.PLAY:
            return true
        default:
            break
        }
        return super.propertyDefault(propertyId)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.placeAbove() ? Sid.fermataPosAbove : Sid.fermataPosBelow
        }
        return super.getPropertyStyle(pid)
    }

    override subtypeUserName(): TranslatableString {
        return SymNames.userNameForSymId(this.symId())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${SymNames.translatedUserNameForSymId(this.symId())}`
    }

    override added(): void {
        this.score().setUpTempoMapLater()
    }

    override removed(): void {
        this.score().setUpTempoMapLater()
    }

    override dragAnchorLines(): LineF[] {
        const result: LineF[] = []
        result.push(new LineF(this.canvasPos(), this.parentItem()!.canvasPos()))
        return result
    }
}
