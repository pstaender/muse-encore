/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/breath.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { ElementType, PlacementV } from '../types/types'
import { EngravingItem, ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { SymNames } from '../types/symnames'

export interface BreathType {
    id: SymId
    isCaesura: boolean
    pause: number
}

export class Breath extends EngravingItem {
    static readonly BREATH_LIST: readonly BreathType[] = [
        { id: SymId.breathMarkComma, isCaesura: false, pause: 0.0 },
        { id: SymId.breathMarkTick, isCaesura: false, pause: 0.0 },
        { id: SymId.breathMarkSalzedo, isCaesura: false, pause: 0.0 },
        { id: SymId.breathMarkUpbow, isCaesura: false, pause: 0.0 },
        { id: SymId.caesuraCurved, isCaesura: true, pause: 2.0 },
        { id: SymId.caesura, isCaesura: true, pause: 2.0 },
        { id: SymId.caesuraShort, isCaesura: true, pause: 2.0 },
        { id: SymId.caesuraThick, isCaesura: true, pause: 2.0 },
        { id: SymId.chantCaesura, isCaesura: true, pause: 2.0 },
        { id: SymId.caesuraSingleStroke, isCaesura: true, pause: 2.0 },
    ]

    private m_pause = 0.0
    private m_symId = SymId.breathMarkComma

    constructor(parent: EngravingObject | null) {
        super(ElementType.BREATH, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
    }

    symId(): SymId { return this.m_symId }
    setSymId(id: SymId): void { this.m_symId = id }
    pause(): number { return this.m_pause }
    setPause(v: number): void { this.m_pause = v }
    segment(): Segment { return this.explicitParent() as unknown as Segment }
    override subtype(): number { return this.m_symId }

    isCaesura(): boolean {
        return Breath.BREATH_LIST.find(bt => bt.id === this.m_symId)?.isCaesura ?? false
    }

    override mag(): number {
        return this.staff() ? this.staff()!.staffMag(this.tick()) : 1.0
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYMBOL: return this.m_symId
        case Pid.PAUSE: return this.m_pause
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SYMBOL: this.setSymId(v as SymId); break
        case Pid.PAUSE:
            this.setPause(v as number)
            this.score().setUpTempoMapLater()
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
        case Pid.PAUSE: return 0.0
        case Pid.PLACEMENT: return this.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE
        default: return super.propertyDefault(id)
        }
    }

    override subtypeUserName(): TranslatableString {
        return SymNames.userNameForSymId(this.symId())
    }

    override accessibleInfo(): string {
        return SymNames.translatedUserNameForSymId(this.symId())
    }

    override added(): void {
        this.score().setUpTempoMapLater()
    }

    override removed(): void {
        this.score().setUpTempoMapLater()
    }
}
