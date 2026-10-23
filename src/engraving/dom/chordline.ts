/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordline.h/.cpp
 *
 * TODO(port): editing (grips)
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { ChordLineType, ElementType } from '../types/types'
import type { Chord } from './chord'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { SlideType, type Note } from './note'
import { Pid } from './property'

export class ChordLineLayoutData extends LayoutData {
    path = new PainterPath()
}

///    bezier line attached to top note of a chord
///    implements fall, doit, plop, bend
function slideType(type: ChordLineType): SlideType {
    switch (type) {
    case ChordLineType.FALL: return SlideType.DownFromNote
    case ChordLineType.DOIT: return SlideType.UpFromNote
    case ChordLineType.SCOOP: return SlideType.UpToNote
    case ChordLineType.PLOP: return SlideType.DownToNote
    default: return SlideType.Undefined
    }
}

export class ChordLine extends EngravingItem {
    private m_straight = false
    private m_wavy = false
    private m_chordLineType = ChordLineType.NOTYPE
    private m_modified = false
    private m_lengthX = 0.0
    private m_lengthY = 0.0
    private m_playChordLine = true
    private m_note: Note | null = null

    constructor(parent: Chord | null) {
        super(ElementType.CHORDLINE, parent, ElementFlag.MOVABLE)
    }

    protected override createLayoutData(): ChordLineLayoutData { return new ChordLineLayoutData(this) }
    override ldata(): ChordLineLayoutData { return super.ldata() as ChordLineLayoutData }
    override mutldata(): ChordLineLayoutData { return super.ldata() as ChordLineLayoutData }

    chord(): Chord { return this.explicitParent() as Chord }

    setChordLineType(st: ChordLineType): void { this.m_chordLineType = st }
    chordLineType(): ChordLineType { return this.m_chordLineType }
    isStraight(): boolean { return this.m_straight }
    setStraight(straight: boolean): void { this.m_straight = straight }
    isWavy(): boolean { return this.m_wavy }
    setWavy(wavy: boolean): void { this.m_wavy = wavy }
    setLengthX(length: number): void { this.m_lengthX = length }
    lengthX(): number { return this.m_lengthX }
    setLengthY(length: number): void { this.m_lengthY = length }
    lengthY(): number { return this.m_lengthY }
    setModified(m: boolean): void { this.m_modified = m }
    modified(): boolean { return this.m_modified }

    isToTheLeft(): boolean { return this.m_chordLineType === ChordLineType.PLOP || this.m_chordLineType === ChordLineType.SCOOP }
    isBelow(): boolean { return this.m_chordLineType === ChordLineType.SCOOP || this.m_chordLineType === ChordLineType.FALL }

    playChordLine(): boolean { return this.m_playChordLine }
    setPlayChordLine(val: boolean): void { this.m_playChordLine = val }

    setNote(note: Note | null): void {
        this.m_note = note

        if (note) {
            note.attachSlide(slideType(this.m_chordLineType))
        }
    }
    note(): Note | null { return this.m_note }

    waveSym(): SymId {
        if (this.m_chordLineType === ChordLineType.FALL || this.m_chordLineType === ChordLineType.PLOP) {
            return SymId.brassFallRoughShort
        }

        return SymId.brassLiftShort
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PATH:
            return this.ldata().path
        case Pid.CHORD_LINE_TYPE:
            return this.m_chordLineType
        case Pid.CHORD_LINE_STRAIGHT:
            return this.m_straight
        case Pid.CHORD_LINE_WAVY:
            return this.m_wavy
        case Pid.PLAY:
            return this.m_playChordLine
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PATH:
            this.mutldata().path = val as PainterPath
            break
        case Pid.CHORD_LINE_TYPE:
            this.setChordLineType(val as ChordLineType)
            break
        case Pid.CHORD_LINE_STRAIGHT:
            this.setStraight(!!val)
            break
        case Pid.CHORD_LINE_WAVY:
            this.setWavy(!!val)
            break
        case Pid.PLAY:
            this.setPlayChordLine(!!val)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.CHORD_LINE_STRAIGHT:
        case Pid.CHORD_LINE_WAVY:
            return false
        case Pid.PLAY:
            return true
        default:
            break
        }
        return super.propertyDefault(pid)
    }
}
