/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/symbol.h/.cpp (FSymbol is not ported yet)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { engravingFonts, type EngravingFont } from '../infrastructure/engravingfont'
import { BSymbol } from './bsymbol'
import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'

export class Symbol extends BSymbol {
    protected m_sym: SymId = SymId.accidentalSharp // arbitrary valid default
    protected m_scoreFont: EngravingFont | null = null
    protected m_symbolsSize = 1.0
    protected m_symAngle = 0.0

    constructor(parent: EngravingObject | null, f: number = ElementFlag.MOVABLE, type: ElementType = ElementType.SYMBOL) {
        super(type, parent, f)
    }

    setSym(s: SymId, sf: EngravingFont | null = null): void {
        this.m_sym = s
        if (sf) {
            this.m_scoreFont = sf
        }
    }

    sym(): SymId { return this.m_sym }
    scoreFont(): EngravingFont | null { return this.m_scoreFont }
    symbolsSize(): number { return this.m_symbolsSize }
    symAngle(): number { return this.m_symAngle }
    symName(): string { return SymNames.nameForSymId(this.m_sym) }
    override subtype(): number { return this.m_sym }
    override baseLine(): number { return 0.0 }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYMBOL: return this.m_sym
        case Pid.SCORE_FONT: return this.m_scoreFont ? this.m_scoreFont.name() : ''
        case Pid.SYMBOLS_SIZE: return this.m_symbolsSize
        case Pid.SYMBOL_ANGLE: return this.m_symAngle
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SYMBOL:
            this.m_sym = v as SymId
            break
        case Pid.SCORE_FONT:
            this.m_scoreFont = engravingFonts().fontByName(v as string)
            break
        case Pid.SYMBOLS_SIZE:
            this.m_symbolsSize = v as number
            break
        case Pid.SYMBOL_ANGLE:
            this.m_symAngle = v as number
            break
        default:
            break
        }
        return super.setProperty(propertyId, v)
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYMBOL: return SymId.accidentalSharp
        case Pid.SYMBOL_ANGLE: return 0.0
        case Pid.SYMBOLS_SIZE: return 1.0
        case Pid.SCORE_FONT: return this.m_scoreFont ? this.style().styleSt(Sid.musicalSymbolFont) : ''
        default:
            return super.propertyDefault(propertyId)
        }
    }
}
