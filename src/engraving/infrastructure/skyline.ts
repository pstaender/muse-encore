/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/skyline.h/.cpp
 */

import { RealIsEqual, RealIsEqualOrLess, RealIsEqualOrMore } from '../../framework/global/realfn'
import { RectF } from '../../framework/draw/types/geometry'
import { ElementType } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'
import type { Stem } from '../dom/stem'
import type { Arpeggio } from '../dom/arpeggio'
import type { ChordRest } from '../dom/chordrest'
import { Shape, ShapeElement } from './shape'

const DBL_MAX = Number.MAX_VALUE

interface StaffLineEdge {
    top: number
    bottom: number
}

export class SkylineLine {
    private m_shape = new Shape()
    /** sorted by key (x position rounded), like std::map */
    private m_staffLineEdges: [number, StaffLineEdge][] = []

    constructor(private readonly m_isNorth: boolean) {}

    clone(): SkylineLine {
        const s = new SkylineLine(this.m_isNorth)
        s.m_shape = this.m_shape.clone()
        s.m_staffLineEdges = this.m_staffLineEdges.map(([k, v]) => [k, { ...v }])
        return s
    }

    isNorth(): boolean { return this.m_isNorth }
    elements(): ShapeElement[] { return this.m_shape.elements() }

    add(r: ShapeElement | Shape | RectF, item?: EngravingItem | null): void {
        if (r instanceof Shape) {
            for (const se of r.elements()) {
                this.add(se)
            }
            return
        }
        const se = r instanceof ShapeElement && item === undefined ? r : new ShapeElement(r, item ?? null)
        if (se.ignoreForLayout()) {
            return
        }
        const x = se.x()
        const top = se.top()
        const bottom = se.bottom()
        const staffLinesTop = this.staffLinesTopAtX(x)
        const staffLinesBottom = this.staffLinesBottomAtX(x)
        if (se.item() && se.item()!.type() === ElementType.STAFF_LINES) {
            if (!(RealIsEqual(top, staffLinesTop) && RealIsEqual(bottom, staffLinesBottom))) {
                this.emplaceStaffLineEdge(Math.round(x), { top, bottom })
            }
        } else if (this.hasValidStaffLineEdges()) {
            if (this.m_isNorth && RealIsEqualOrMore(top, staffLinesTop)) {
                return // Only add if it pokes above the staff
            }
            if (!this.m_isNorth && RealIsEqualOrLess(bottom, staffLinesBottom)) {
                return // Only add if it pokes below the staff
            }
        }
        this.m_shape.add(se)
    }

    /** std::map::emplace: does not overwrite an existing key */
    private emplaceStaffLineEdge(key: number, edge: StaffLineEdge): void {
        let i = 0
        while (i < this.m_staffLineEdges.length && this.m_staffLineEdges[i][0] < key) {
            ++i
        }
        if (i < this.m_staffLineEdges.length && this.m_staffLineEdges[i][0] === key) {
            return
        }
        this.m_staffLineEdges.splice(i, 0, [key, edge])
    }

    private hasValidStaffLineEdges(): boolean { return this.m_staffLineEdges.length > 0 }

    /** last element with key <= round(x), or the first element */
    private edgeAt(x: number): StaffLineEdge {
        const rx = Math.round(x)
        let found = this.m_staffLineEdges[0][1]
        for (const [k, v] of this.m_staffLineEdges) {
            if (k > rx) {
                break
            }
            found = v
        }
        return found
    }

    private staffLinesTopAtX(x: number): number {
        if (!this.m_staffLineEdges.length) {
            return 0.0
        }
        return this.edgeAt(x).top
    }

    private staffLinesBottomAtX(x: number): number {
        if (!this.m_staffLineEdges.length) {
            return 0.0
        }
        return this.edgeAt(x).bottom
    }

    remove_if(p: (e: ShapeElement) => boolean): boolean { return this.m_shape.remove_if(p) }

    getFilteredCopy(filterOut: (e: ShapeElement) => boolean): SkylineLine {
        const n = this.clone()
        n.m_shape.clear()
        for (const shapeEl of this.m_shape.elements()) {
            if (filterOut(shapeEl)) {
                continue
            }
            n.m_shape.add(shapeEl)
        }
        return n
    }

    clear(): void {
        this.m_staffLineEdges = []
        this.m_shape.clear()
    }

    minDistance(sl: SkylineLine, minHorizontalClearance = 0.0): number {
        return this.m_shape.minVerticalDistance(sl.m_shape, minHorizontalClearance)
    }

    minDistanceToShapeAbove(shapeAbove: Shape, minHorizontalClearance = 0.0): number {
        return shapeAbove.minVerticalDistance(this.m_shape, minHorizontalClearance)
    }

    minDistanceToShapeBelow(shapeBelow: Shape, minHorizontalClearance = 0.0): number {
        return this.m_shape.minVerticalDistance(shapeBelow, minHorizontalClearance)
    }

    verticalClearanceAbove(shapeAbove: Shape): number {
        return shapeAbove.verticalClearance(this.m_shape)
    }

    verticalClaranceBelow(shapeBelow: Shape): number {
        return this.m_shape.verticalClearance(shapeBelow)
    }

    max(): number {
        return this.m_isNorth ? this.m_shape.top() : this.m_shape.bottom()
    }

    valid(): boolean { return !this.m_shape.empty() }

    translateY(y: number): this {
        this.m_shape.translateY(y)
        return this
    }

    top(startX = -DBL_MAX, endX = DBL_MAX): number {
        let top = DBL_MAX
        for (const element of this.m_shape.elements()) {
            if (element.right() > startX && element.left() < endX) {
                top = Math.min(top, element.top())
            }
        }
        if (top === DBL_MAX) {
            top = 0.0
        }
        return top
    }

    bottom(startX = -DBL_MAX, endX = DBL_MAX): number {
        let bottom = -DBL_MAX
        for (const element of this.m_shape.elements()) {
            if (element.right() > startX && element.left() < endX) {
                bottom = Math.max(bottom, element.bottom())
            }
        }
        if (bottom === -DBL_MAX) {
            bottom = 0.0
        }
        return bottom
    }
}

export class Skyline {
    private _north = new SkylineLine(true)
    private _south = new SkylineLine(false)

    north(): SkylineLine { return this._north }
    south(): SkylineLine { return this._south }

    clear(): void {
        this._north.clear()
        this._south.clear()
    }

    add(s: Shape | ShapeElement | RectF, item?: EngravingItem | null): void {
        if (s instanceof Shape) {
            for (const r of s.elements()) {
                this.add(r)
            }
            return
        }
        const r = s instanceof ShapeElement && item === undefined ? s : new ShapeElement(s, item ?? null)
        if (r.ignoreForLayout()) {
            return
        }
        const it = r.item()
        let crossSouth = false
        let crossNorth = false

        if (it && it.type() === ElementType.STEM) {
            const chord = (it as Stem).chord()
            if (chord) {
                const beam = chord.beam()
                const tremolo = chord.tremoloTwoChord()
                const isCross = (beam && beam.cross())
                                || (tremolo && tremolo.chord1()!.staffMove() !== tremolo.chord2()!.staffMove())
                if (isCross) {
                    let elements: readonly ChordRest[] = []
                    if (beam) {
                        elements = beam.elements()
                    } else if (tremolo) {
                        elements = [tremolo.chord1()!, tremolo.chord2()!]
                    }
                    const thisStaffMove = chord.staffMove()
                    if (thisStaffMove < 0) {
                        crossNorth = true
                    } else if (thisStaffMove > 0) {
                        crossSouth = true
                    }
                    for (const element of elements) {
                        const staffMove = element.staffMove()
                        if (staffMove < thisStaffMove) {
                            crossNorth = true
                        }
                        if (staffMove > thisStaffMove) {
                            crossSouth = true
                        }
                    }
                }
            }
        }

        if (it && (it.type() === ElementType.ARPEGGIO || it.type() === ElementType.CHORD_BRACKET)) {
            if ((it as Arpeggio).crossStaff()) {
                crossSouth = true
            }
        }

        if (!crossNorth) {
            this._north.add(r)
        }
        if (!crossSouth) {
            this._south.add(r)
        }
    }

    /**
     * a is located below this skyline.
     * Calculates the minimum distance between two skylines
     */
    minDistance(s: Skyline, minHorizontalClearance = 0.0): number {
        return this._south.minDistance(s._north, minHorizontalClearance)
    }
}
