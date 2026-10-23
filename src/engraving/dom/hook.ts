/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/hook.h/.cpp
 */

import type { PointF } from '../../framework/draw/types/geometry'
import { SmuflAnchorId, SymId } from '../types/symid'
import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { EngravingItem } from './engravingitem'
import { ElementFlag } from './engravingitem'
import { Symbol } from './symbol'
import { chordFactories, type Chord } from './chord'

export class Hook extends Symbol {
    private m_hookType = 0

    constructor(parent: Chord | null) {
        super(parent, ElementFlag.NOTHING, ElementType.HOOK)
        this.setZ(ElementType.HOOK * 100)
    }

    override mag(): number { return this.parentItem()!.mag() }
    override elementBase(): EngravingItem { return this.parentItem()! }

    setHookType(i: number): void {
        const straight = this.style().styleB(Sid.useStraightNoteFlags)
        this.m_hookType = i
        this.setSym(Hook.symIdForHookIndex(i, straight))
    }

    hookType(): number { return this.m_hookType }
    chord(): Chord { return this.explicitParent() as unknown as Chord }

    smuflAnchor(): PointF {
        return this.symSmuflAnchor(this.m_sym, this.chord().up() ? SmuflAnchorId.stemUpNW : SmuflAnchorId.stemDownSW)
    }

    static symIdForHookIndex(index: number, straight: boolean): SymId {
        switch (index) {
        case 0: return SymId.noSym
        case 1: return straight ? SymId.flag8thUpStraight : SymId.flag8thUp
        case 2: return straight ? SymId.flag16thUpStraight : SymId.flag16thUp
        case 3: return straight ? SymId.flag32ndUpStraight : SymId.flag32ndUp
        case 4: return straight ? SymId.flag64thUpStraight : SymId.flag64thUp
        case 5: return straight ? SymId.flag128thUpStraight : SymId.flag128thUp
        case 6: return straight ? SymId.flag256thUpStraight : SymId.flag256thUp
        case 7: return straight ? SymId.flag512thUpStraight : SymId.flag512thUp
        case 8: return straight ? SymId.flag1024thUpStraight : SymId.flag1024thUp
        case -1: return straight ? SymId.flag8thDownStraight : SymId.flag8thDown
        case -2: return straight ? SymId.flag16thDownStraight : SymId.flag16thDown
        case -3: return straight ? SymId.flag32ndDownStraight : SymId.flag32ndDown
        case -4: return straight ? SymId.flag64thDownStraight : SymId.flag64thDown
        case -5: return straight ? SymId.flag128thDownStraight : SymId.flag128thDown
        case -6: return straight ? SymId.flag256thDownStraight : SymId.flag256thDown
        case -7: return straight ? SymId.flag512thDownStraight : SymId.flag512thDown
        case -8: return straight ? SymId.flag1024thDownStraight : SymId.flag1024thDown
        default:
            return SymId.noSym
        }
    }
}

chordFactories.createHook = (chord: Chord) => new Hook(chord)
