/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/line.h/.cpp
 *
 * TODO(port): editing (grips, dragging, rebasing anchors)
 */

import { Color } from '../../framework/draw/types/color'
import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, LineType } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { Spanner, SpannerAnchor, SpannerSegment } from './spanner'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Segment } from './segment'
import type { System } from './system'

export abstract class LineSegment extends SpannerSegment {
    protected constructor(type: ElementType, sp: Spanner | null, parent: System | null, f: number = ElementFlag.NOTHING) {
        super(type, sp, parent, f)
    }

    line(): SLine { return this.spanner() as SLine }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.DIAGONAL
            || pid === Pid.COLOR
            || pid === Pid.LINE_WIDTH
            || pid === Pid.LINE_STYLE
            || pid === Pid.DASH_LINE_LEN
            || pid === Pid.DASH_GAP_LEN) {
            return this.spanner()
        }
        return super.propertyDelegate(pid)
    }

    lineWidth(): Spatium {
        return this.hasSpanner() ? this.line().lineWidth() : new Spatium(0.0)
    }

    override absoluteFromSpatium(sp: Spatium): number {
        if (!this.hasSpanner()) {
            return super.absoluteFromSpatium(sp)
        }
        return this.line().absoluteFromSpatium(sp)
    }
}

export abstract class SLine extends Spanner {
    private m_lineWidth = new Spatium(0.15)
    private m_lineColor: Color = Color.BLACK.clone()
    private m_lineStyle = LineType.SOLID
    private m_dashLineLen = 5.0
    private m_dashGapLen = 5.0
    private m_diagonal = false

    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
        this.setTrack(0)
    }

    abstract createLineSegment(parent: System | null): LineSegment

    diagonal(): boolean { return this.m_diagonal }
    setDiagonal(v: boolean): void { this.m_diagonal = v }
    lineWidth(): Spatium { return this.m_lineWidth }
    lineColor(): Color { return this.m_lineColor }
    lineStyle(): LineType { return this.m_lineStyle }
    setLineWidth(v: Spatium): void { this.m_lineWidth = v }
    setLineColor(v: Color): void { this.m_lineColor = v.clone() }
    setLineStyle(v: LineType): void { this.m_lineStyle = v }
    dashLineLen(): number { return this.m_dashLineLen }
    setDashLineLen(val: number): void { this.m_dashLineLen = val }
    dashGapLen(): number { return this.m_dashGapLen }
    setDashGapLen(val: number): void { this.m_dashGapLen = val }

    override frontSegment(): LineSegment { return super.frontSegment() as LineSegment }
    override backSegment(): LineSegment { return super.backSegment() as LineSegment }
    override segmentAt(n: number): LineSegment { return super.segmentAt(n) as LineSegment }

    override allowTimeAnchor(): boolean { return true }

    /** C++ linePos(Grip, System** system): returns the position and the system */
    linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        const mmRest = this.style().styleB(Sid.createMultiMeasureRests)

        switch (this.anchor()) {
        case SpannerAnchor.NOTE: {
            const item = start ? this.startElement() : this.endElement()
            const note = item && item.isNote() ? item as Note : null
            if (!note) {
                return { pos: new PointF(), system: null }
            }
            const system = note.chord().segment()!.measure().system()
            if (!system) {
                return { pos: new PointF(), system: null }
            }
            return { pos: note.pagePos().minus(system.pagePos()), system }
        }
        case SpannerAnchor.CHORD:
        case SpannerAnchor.SEGMENT: {
            let segment: Segment | null = start ? this.startSegment() : this.endSegment()
            if (!segment) {
                return { pos: new PointF(), system: null }
            }
            if (this.anchor() === SpannerAnchor.CHORD && !segment.isChordRestType()) {
                return { pos: new PointF(), system: null }
            }
            if (!start) {
                const curTick = segment.tick()
                while (true) {
                    const prevSeg: Segment | null = mmRest ? segment!.prev1MM() : segment!.prev1()
                    if (prevSeg && prevSeg.tick().eq(curTick)) {
                        segment = prevSeg
                    } else {
                        break
                    }
                }
            }
            const system = segment.measure().system()
            const x = segment.x() + segment.measure().x() - (start ? 0.0 : this.spatium())
            return { pos: new PointF(x, 0.0), system }
        }
        case SpannerAnchor.MEASURE: {
            const measure = this.score().tick2measureMM(start ? this.tick() : this.tick2())
            if (!measure) {
                return { pos: new PointF(), system: null }
            }
            return { pos: new PointF(measure.x(), 0.0), system: measure.system() }
        }
        default:
            return { pos: new PointF(), system: null }
        }
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.DIAGONAL: return this.m_diagonal
        case Pid.COLOR: return this.m_lineColor
        case Pid.LINE_WIDTH: return this.m_lineWidth
        case Pid.LINE_STYLE: return this.m_lineStyle
        case Pid.DASH_LINE_LEN: return this.dashLineLen()
        case Pid.DASH_GAP_LEN: return this.dashGapLen()
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.DIAGONAL:
            this.m_diagonal = v as boolean
            break
        case Pid.COLOR:
            this.setLineColor(v as Color)
            break
        case Pid.LINE_WIDTH:
            this.m_lineWidth = v instanceof Spatium ? v : Spatium.fromMM(v as number, this.spatium())
            break
        case Pid.LINE_STYLE:
            this.m_lineStyle = v as LineType
            break
        case Pid.DASH_LINE_LEN:
            this.setDashLineLen(v as number)
            break
        case Pid.DASH_GAP_LEN:
            this.setDashGapLen(v as number)
            break
        default:
            return super.setProperty(id, v)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.DIAGONAL:
            return false
        case Pid.COLOR:
            return Color.BLACK.clone()
        case Pid.LINE_WIDTH:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return new Spatium(0.15)
        case Pid.LINE_STYLE:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return LineType.SOLID
        case Pid.DASH_LINE_LEN:
        case Pid.DASH_GAP_LEN:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return 5.0
        default:
            return super.propertyDefault(pid)
        }
    }

    static guessFinalNote(startNote: Note): Note | null {
        let chord: Chord = startNote.chord()
        if (chord.isGraceBefore()) {
            const parentChord = chord.parent() as unknown as Chord
            const gracesBefore = parentChord.graceNotesBefore().chords()
            const positionOfThis = gracesBefore.indexOf(chord)
            if (positionOfThis >= 0 && positionOfThis + 1 < gracesBefore.length) {
                return gracesBefore[positionOfThis + 1].upNote()
            }
            return parentChord.upNote()
        } else if (chord.isGraceAfter()) {
            const parentChord = chord.parent() as unknown as Chord
            const gracesAfter = parentChord.graceNotesAfter().chords()
            const positionOfThis = gracesAfter.indexOf(chord)
            if (positionOfThis >= 0 && positionOfThis + 1 < gracesAfter.length) {
                return gracesAfter[positionOfThis + 1].upNote()
            }
            chord = parentChord
        } else {
            const graces = chord.graceNotesAfter().chords()
            if (graces.length > 0) {
                return graces[0].upNote()
            }
        }

        if (!chord.explicitParent()!.isSegment()) {
            return null
        }

        let segm = chord.score().tick2rightSegment(chord.endTick())
        while (segm && !segm.isChordRestType()) {
            segm = segm.next1()
        }
        if (!segm) {
            return null
        }

        const chordTrack = chord.track()
        const part = chord.part()
        let target: Chord | null = null
        const e = segm.element(chordTrack)
        if (e && e.isChord()) {
            target = e as Chord
        } else {
            for (const currChord of segm.elist()) {
                if (currChord && currChord.isChord() && currChord.part() === part) {
                    target = currChord as Chord
                    break
                }
            }
        }

        if (target && target.notes().length > 0) {
            const graces = target.graceNotesBefore().chords()
            if (graces.length > 0) {
                return graces[0].upNote()
            }
            // normal case: try to return the note in the next chord that is in the
            // same position as the start note relative to the end chord
            const startNoteIdx = chord.notes().indexOf(startNote)
            const endNoteIdx = Math.min(startNoteIdx, target.notes().length - 1)
            return target.notes()[endNoteIdx]
        }
        return null
    }
}
