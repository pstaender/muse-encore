/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/partialtie.h/.cpp
 * TODO(port): tie jump points (only used for drawing inactive partial ties on screen and for editing)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, PartialSpannerDirection } from '../types/types'
import type { Note } from './note'
import { Pid } from './property'
import type { SlurTieSegment } from './slurtie'
import type { System } from './system'
import { Tie, TieSegment } from './tie'

export class PartialTieSegment extends TieSegment {
    constructor(parent: System | null) {
        super(parent, ElementType.PARTIAL_TIE_SEGMENT)
    }

    partialTie(): PartialTie { return this.spanner() as PartialTie }
}

export class PartialTie extends Tie {
    private m_partialSpannerDirection = PartialSpannerDirection.OUTGOING

    constructor(parent: Note | null) {
        super(parent, ElementType.PARTIAL_TIE)
    }

    parentNote(): Note | null { return this.parent() as unknown as Note | null }

    partialSpannerDirection(): PartialSpannerDirection { return this.m_partialSpannerDirection }
    setPartialSpannerDirection(v: PartialSpannerDirection): void { this.m_partialSpannerDirection = v }

    override isOutgoing(): boolean { return this.m_partialSpannerDirection === PartialSpannerDirection.OUTGOING }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PARTIAL_SPANNER_DIRECTION: return this.m_partialSpannerDirection
        default: return super.getProperty(propertyId)
        }
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PARTIAL_SPANNER_DIRECTION: return PartialSpannerDirection.OUTGOING
        default: return super.propertyDefault(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PARTIAL_SPANNER_DIRECTION:
            this.setPartialSpannerDirection(v as PartialSpannerDirection)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override newSlurTieSegment(parent: System | null): SlurTieSegment {
        const seg = new PartialTieSegment(parent)
        seg.setTrack(this.track())
        return seg
    }

    note(): Note | null { return this.isOutgoing() ? this.startNote() : this.endNote() }

    override setStartNote(note: Note | null): void {
        this.setPartialSpannerDirection(PartialSpannerDirection.OUTGOING)
        super.setStartNote(note)
        super.setEndNote(null)
    }

    override setEndNote(note: Note | null): void {
        this.setPartialSpannerDirection(PartialSpannerDirection.INCOMING)
        this.setStartElement(null)
        super.setEndNote(note)
        this.setParent(note)
    }

    /** C++ returns startTie()->startNote() for incoming ties (tie jump points are not ported) */
    override startNote(): Note | null {
        if (this.isOutgoing()) {
            return super.startNote()
        }
        return null
    }
}
