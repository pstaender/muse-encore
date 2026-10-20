/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/fingering.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, PlacementV, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import type { Note } from './note'
import { Pid } from './property'
import { TextBase } from './textbase'

const fingeringStyle: ElementStyle = [
    { sid: Sid.fingeringPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.fingeringMinDistance, pid: Pid.MIN_DISTANCE },
]

export class Fingering extends TextBase {
    constructor(parent: Note | null, tid: TextStyleType = TextStyleType.FINGERING, ef: number = ElementFlag.NOTHING) {
        super(ElementType.FINGERING, parent, tid, ef)
        this.setPlacement(PlacementV.ABOVE)
        this.initElementStyle(fingeringStyle)
    }

    note(): Note | null {
        const p = this.explicitParent()
        return p && p.isNote() ? p as Note : null
    }

    layoutType(): ElementType {
        switch (this.textStyleType()) {
        case TextStyleType.FINGERING:
        case TextStyleType.RH_GUITAR_FINGERING:
        case TextStyleType.STRING_NUMBER:
            return ElementType.CHORD
        default:
            return ElementType.NOTE
        }
    }

    calculatePlacement(): PlacementV {
        const n = this.note()
        if (!n) {
            return PlacementV.ABOVE
        }
        const chord = n.chord()
        const staff = chord.staff()!
        const part = staff.part()!
        const nstaves = part.nstaves()
        const voices = chord.measure().hasVoicesInRange(staff.idx(), chord.tick(), chord.actualTicks())
        const below = voices ? !chord.up() : (nstaves > 1) && (staff.rstaff() === nstaves - 1)
        return below ? PlacementV.BELOW : PlacementV.ABOVE
    }

    isOnCrossBeamSide(): boolean {
        const n = this.note()
        const chord = n ? n.chord() : null
        if (!chord) {
            return false
        }
        return this.layoutType() === ElementType.CHORD
               && !!chord.beam() && (chord.beam()!.cross() || chord.staffMove() !== 0)
               && this.placeAbove() === chord.up()
    }

    override positionRelativeToNoteheadRest(): boolean { return false }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLACEMENT:
            return this.calculatePlacement()
        case Pid.TEXT_STYLE:
            return TextStyleType.FINGERING
        default:
            return super.propertyDefault(id)
        }
    }
}
