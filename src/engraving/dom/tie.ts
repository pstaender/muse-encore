/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tie.h/.cpp
 *
 * TODO(port): tie jump points (repeats), partial ties, laissez vibrer, editing
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TiePlacement, type staff_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SpannerAnchor } from './spanner'
import { SlurTie, SlurTieSegment, SlurTieSegmentLayoutData } from './slurtie'
import type { Note } from './note'
import type { System } from './system'

export class TieSegmentLayoutData extends SlurTieSegmentLayoutData {
    allJumpPointsInactive = false
}

export class TieSegment extends SlurTieSegment {
    private m_staffMove = 0
    private m_adjustmentOffsets: PointF[] = [new PointF(), new PointF(), new PointF(), new PointF(), new PointF(), new PointF()]

    constructor(parent: System | null, type: ElementType = ElementType.TIE_SEGMENT) {
        super(type, parent)
    }

    protected override createLayoutData(): TieSegmentLayoutData { return new TieSegmentLayoutData(this) }
    override ldata(): TieSegmentLayoutData { return super.ldata() as TieSegmentLayoutData }
    override mutldata(): TieSegmentLayoutData { return super.ldata() as TieSegmentLayoutData }

    addAdjustmentOffset(offset: PointF, grip: Grip): void { this.m_adjustmentOffsets[grip].add(offset) }
    resetAdjustmentOffset(): void { this.m_adjustmentOffsets = this.m_adjustmentOffsets.map(() => new PointF()) }
    adjustmentOffset(grip: Grip): PointF { return this.m_adjustmentOffsets[grip].clone() }

    consolidateAdjustmentOffsetIntoUserOffset(): void {
        for (let i = 0; i < this.m_adjustmentOffsets.length; ++i) {
            const grip = i as Grip
            const adjustOffset = this.m_adjustmentOffsets[i]
            if (!adjustOffset.isNull()) {
                this.ups(grip).p.sub(adjustOffset)
                this.ups(grip).off = adjustOffset.clone()
            }
        }
        this.resetAdjustmentOffset()
    }

    isEdited(): boolean {
        for (let i = 0; i < Grip.GRIPS; ++i) {
            if (!this.m_ups[i].off.isNull()) {
                return true
            }
        }
        return false
    }

    tie(): Tie { return this.spanner() as Tie }
    setStaffMove(val: number): void { this.m_staffMove = val }
    override vStaffIdx(): staff_idx_t { return this.staffIdx() + this.m_staffMove }

    minShoulderHeight(): number { return this.style().styleMM(Sid.tieMinShoulderHeight) }
    maxShoulderHeight(): number { return this.style().styleMM(Sid.tieMaxShoulderHeight) }
    override endWidth(): number { return this.style().styleMM(Sid.tieEndWidth) }
    override midWidth(): number { return this.style().styleMM(Sid.tieMidWidth) }
    override dottedWidth(): number { return this.style().styleMM(Sid.tieDottedWidth) }
}

export class Tie extends SlurTie {
    protected m_isInside = false
    protected m_tiePlacement = TiePlacement.AUTO

    constructor(parent: EngravingObject | null, type: ElementType = ElementType.TIE) {
        super(type, parent)
        this.setAnchor(SpannerAnchor.NOTE)
    }

    startNote(): Note | null { return this.startElement() as unknown as Note | null }
    setStartNote(note: Note | null): void {
        this.setStartElement(note)
        this.setParent(note)
    }
    endNote(): Note | null { return this.endElement() as unknown as Note | null }
    setEndNote(note: Note | null): void { this.setEndElement(note) }

    /** PartialTie::isOutgoing() (partial ties are not ported yet) */
    isOutgoing(): boolean { return true }

    isInside(): boolean { return this.m_isInside }
    setIsInside(val: boolean): void { this.m_isInside = val }

    isOuterTieOfChord(startOrEnd: Grip): boolean {
        if (this.m_isInside) {
            return false
        }
        const start = startOrEnd === Grip.START
        const note = start ? this.startNote() : this.endNote()
        if (!note) {
            return false
        }
        const chord = note.chord()
        return (note === chord.upNote() && this.up()) || (note === chord.downNote() && !this.up())
    }

    hasTiedSecondInside(): boolean {
        const note = this.startNote()
        if (!note) {
            return false
        }
        const chord = note.chord()
        const line = note.line()
        const secondInsideLine = this.up() ? line + 1 : line - 1
        for (const otherNote of chord.notes()) {
            if (otherNote.line() === secondInsideLine && otherNote.tieFor() && otherNote.tieFor()!.up() === this.up()) {
                return true
            }
        }
        return false
    }

    isCrossStaff(): boolean {
        const startN = this.startNote()
        const endN = this.endNote()
        const startChord = startN ? startN.chord() : null
        const endChord = endN ? endN.chord() : null
        const staff = this.staffIdx()
        return (!!startChord && (startChord.staffMove() !== 0 || startChord.vStaffIdx() !== staff))
               || (!!endChord && (endChord.staffMove() !== 0 || endChord.vStaffIdx() !== staff))
    }

    tiePlacement(): TiePlacement { return this.m_tiePlacement }
    setTiePlacement(val: TiePlacement): void { this.m_tiePlacement = val }

    frontTieSegment(): TieSegment { return this.frontSegment() as TieSegment }
    backTieSegment(): TieSegment { return this.backSegment() as TieSegment }

    override newSlurTieSegment(parent: System | null): SlurTieSegment { return new TieSegment(parent) }

    override scalingFactor(): number {
        const hasBothNotes = !!this.startNote() && !!this.endNote()
        const primaryNote = this.startNote() ? this.startNote() : this.endNote()
        const secondaryNote = hasBothNotes ? this.endNote() : null
        if (!primaryNote) {
            return 1.0
        }
        if (primaryNote.isGrace()) {
            return this.style().styleD(Sid.graceNoteMag)
        }
        if (hasBothNotes) {
            return 0.5 * (primaryNote.chord().intrinsicMag() + secondaryNote!.chord().intrinsicMag())
        }
        return primaryNote.chord().intrinsicMag()
    }

    allJumpPointsInactive(): boolean { return false } // TODO(port): jump points

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.TIE_PLACEMENT) {
            return this.tiePlacement()
        }
        return super.getProperty(propertyId)
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.TIE_PLACEMENT) {
            return TiePlacement.AUTO
        }
        return super.propertyDefault(id)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.TIE_PLACEMENT) {
            this.setTiePlacement(v as TiePlacement)
            return true
        }
        return super.setProperty(propertyId, v)
    }
}
