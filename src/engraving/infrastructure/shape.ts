/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/shape.h/.cpp
 */

import { RealIsEqual, RealIsNull } from '../../framework/global/realfn'
import { PointF, RectF, SizeF } from '../../framework/draw/types/geometry'
import type { Painter } from '../../framework/draw/painter'
import { ElementType } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'

const DBL_MAX = Number.MAX_VALUE

export class ShapeElement extends RectF {
    constructor(r: RectF, private m_item: EngravingItem | null = null, private m_ignoreForLayout = false) {
        super(r.x(), r.y(), r.width(), r.height())
    }

    override clone(): ShapeElement {
        return new ShapeElement(this, this.m_item, this.m_ignoreForLayout)
    }

    item(): EngravingItem | null { return this.m_item }
    setItem(item: EngravingItem | null): void { this.m_item = item }
    ignoreForLayout(): boolean { return this.m_ignoreForLayout }
}

export enum ShapeType {
    Fixed, // fixed size, like just bbox
    Composite, // composed of other shapes
}

export function intersects(a: number, b: number, c: number, d: number, minClearance = 0.0): boolean {
    if (a === b || c === d) {
        return false
    }
    // Deviation from C++: exact ties (e.g. a ledger line exactly the clearance away from an accidental) are decided
    // by floating point rounding, which differs between the C++ build and JS; MuseScore treats them as intersecting.
    const TIE = 1e-9
    return (b + minClearance > c - TIE) && (a < d + minClearance + TIE)
}

export class Shape {
    static readonly Type = ShapeType

    private m_type: ShapeType = ShapeType.Fixed
    private m_elements: ShapeElement[] = []
    private m_bbox = new RectF() // cache

    constructor(r?: RectF | readonly RectF[], p: EngravingItem | null = null, t: ShapeType = ShapeType.Fixed) {
        if (Array.isArray(r)) {
            this.m_type = ShapeType.Composite
            for (const rect of r as readonly RectF[]) {
                this.m_elements.push(new ShapeElement(rect, p))
            }
        } else {
            this.m_type = t
            if (r) {
                this.setBBox(r as RectF, p)
            }
        }
    }

    clone(): Shape {
        const s = new Shape()
        s.m_type = this.m_type
        s.m_elements = this.m_elements.map(e => e.clone())
        return s
    }

    type(): ShapeType { return this.m_type }
    isComposite(): boolean { return this.m_type === ShapeType.Composite }
    size(): number { return this.m_elements.length }
    empty(): boolean { return this.m_elements.length === 0 }
    clear(): void { this.m_elements = []; this.invalidateBBox() }

    // Fixed
    setBBox(r: RectF, p: EngravingItem | null = null): void {
        if (this.m_elements.length === 0) {
            this.m_elements.push(new ShapeElement(r, p))
        } else {
            this.m_elements[0] = new ShapeElement(r, p)
        }
        this.invalidateBBox()
    }

    addBBox(r: RectF): void {
        if (this.m_elements.length === 0) {
            this.m_elements.push(new ShapeElement(new RectF()))
        }
        this.m_elements[0].unite(r)
        this.invalidateBBox()
    }

    // Composite
    add(s: Shape | ShapeElement | RectF, p?: EngravingItem | null, ignoreForLayout = false): this {
        this.m_type = ShapeType.Composite
        if (s instanceof Shape) {
            for (const e of s.m_elements) {
                this.m_elements.push(e.clone())
            }
        } else if (s instanceof ShapeElement && p === undefined) {
            this.m_elements.push(s.clone())
        } else {
            this.m_elements.push(new ShapeElement(s, p ?? null, ignoreForLayout))
        }
        this.invalidateBBox()
        return this
    }

    remove(r: RectF | Shape): void {
        if (r instanceof Shape) {
            for (const e of r.m_elements) {
                this.remove(e)
            }
            this.invalidateBBox()
            return
        }
        const i = this.m_elements.findIndex(e => e.equals(r))
        if (i >= 0) {
            this.m_elements.splice(i, 1)
        }
        this.invalidateBBox()
    }

    remove_if(p: (e: ShapeElement) => boolean): boolean {
        const origSize = this.m_elements.length
        this.m_elements = this.m_elements.filter(e => !p(e))
        this.invalidateBBox()
        return origSize !== this.m_elements.length
    }

    elements(): ShapeElement[] { return this.m_elements }

    toRects(): RectF[] { return this.m_elements.map(e => new RectF(e.x(), e.y(), e.width(), e.height())) }

    find_if(func: (e: ShapeElement) => boolean): ShapeElement | null {
        return this.m_elements.find(func) ?? null
    }

    find_first(type: ElementType): ShapeElement | null {
        for (const i of this.m_elements) {
            if (i.item() && i.item()!.type() === type) {
                return i
            }
        }
        return null
    }

    get_first(): ShapeElement | null {
        return this.m_elements.length ? this.m_elements[0] : null
    }

    removeInvisibles(): void {
        this.m_elements = this.m_elements.filter(e => e.item() && e.item()!.visible())
        this.invalidateBBox()
    }

    removeTypes(types: ReadonlySet<ElementType>): void {
        this.m_elements = this.m_elements.filter(e => !(e.item() && types.has(e.item()!.type())))
        this.invalidateBBox()
    }

    /**
     * This methods creates "walls". They are represented by
     * rectangles of zero height, and it is assumed that rectangles
     * of zero height vertically collide with everything. Use this
     * method ONLY when you want to create space that cannot tuck
     * above/below other elements of the staff.
     */
    addHorizontalSpacing(item: EngravingItem | null, leftEdge: number, rightEdge: number): void {
        const eps = 100 * Number.EPSILON
        if (leftEdge === rightEdge) { // HACK zero-width shapes collide with everything currently.
            rightEdge += eps
        }
        this.add(new RectF(leftEdge, 0, rightEdge - leftEdge, 0), item)
    }

    translate(pt: PointF): this {
        for (const r of this.m_elements) {
            r.translate(pt)
        }
        this.invalidateBBox()
        return this
    }

    translateX(xo: number): void {
        for (const r of this.m_elements) {
            r.setLeft(r.left() + xo)
            r.setRight(r.right() + xo)
        }
        this.invalidateBBox()
    }

    translateY(yo: number): void {
        for (const r of this.m_elements) {
            r.setTop(r.top() + yo)
            r.setBottom(r.bottom() + yo)
        }
        this.invalidateBBox()
    }

    translated(pt: PointF): Shape {
        const s = new Shape()
        for (const r of this.m_elements) {
            s.add(r.translated(pt), r.item(), r.ignoreForLayout())
        }
        return s
    }

    scale(mag: SizeF): this {
        for (const r of this.m_elements) {
            r.scale(mag)
        }
        this.invalidateBBox()
        return this
    }

    scaled(mag: SizeF): Shape {
        const s = new Shape()
        for (const r of this.m_elements) {
            s.add(r.scaled(mag), r.item(), r.ignoreForLayout())
        }
        return s
    }

    adjust(xp1: number, yp1: number, xp2: number, yp2: number): this {
        for (const e of this.m_elements) {
            e.adjust(xp1, yp1, xp2, yp2)
        }
        this.invalidateBBox()
        return this
    }

    adjusted(xp1: number, yp1: number, xp2: number, yp2: number): Shape {
        const s = new Shape()
        for (const e of this.m_elements) {
            s.add(e.adjusted(xp1, yp1, xp2, yp2))
        }
        return s
    }

    pad(p: number): this {
        for (const e of this.m_elements) {
            e.pad(p)
        }
        this.invalidateBBox()
        return this
    }

    padded(p: number): Shape {
        const s = new Shape()
        for (const e of this.m_elements) {
            s.add(e.padded(p))
        }
        return s
    }

    invalidateBBox(): void {
        this.m_bbox = new RectF()
    }

    bbox(): RectF {
        if (this.m_elements.length === 0) {
            return new RectF()
        } else if (this.m_elements.length === 1) {
            const e = this.m_elements[0]
            return new RectF(e.x(), e.y(), e.width(), e.height())
        }
        if (this.m_bbox.isNull()) {
            for (const e of this.m_elements) {
                this.m_bbox.unite(e)
            }
        }
        return this.m_bbox.clone()
    }

    /**
     * a is located below this shape.
     * Calculates the minimum distance between two shapes.
     */
    minVerticalDistance(a: Shape, minHorizontalClearance = 0.0): number {
        if (this.empty() || a.empty()) {
            return 0.0
        }
        let dist = -DBL_MAX // min real
        for (const r2 of a.m_elements) {
            if (r2.height() <= 0.0) {
                continue
            }
            const bx1 = r2.left()
            const bx2 = r2.right()
            for (const r1 of this.m_elements) {
                if (r1.height() <= 0.0) {
                    continue
                }
                const ax1 = r1.left()
                const ax2 = r1.right()
                if (intersects(ax1, ax2, bx1, bx2, minHorizontalClearance)) {
                    dist = Math.max(dist, r1.bottom() - r2.top())
                }
            }
        }
        return dist
    }

    /**
     * a is located below this shape.
     * Calculates the amount of clearance between the two shapes.
     * If there is an overlap, returns a negative value corresponging
     * to the amount of overlap.
     */
    verticalClearance(a: Shape, minHorizontalDistance = 0.0): number {
        if (this.empty() || a.empty()) {
            return 0.0
        }
        let dist = DBL_MAX // max real
        for (const r2 of a.m_elements) {
            if (r2.height() <= 0.0) {
                continue
            }
            const bx1 = r2.left()
            const bx2 = r2.right()
            for (const r1 of this.m_elements) {
                if (r1.height() <= 0.0) {
                    continue
                }
                const ax1 = r1.left()
                const ax2 = r1.right()
                if (intersects(ax1, ax2, bx1, bx2, minHorizontalDistance)) {
                    dist = Math.min(dist, r2.top() - r1.bottom())
                }
            }
        }
        return dist
    }

    /**
     * a is located below this shape
     * returns true if, within the horizontal width of both shapes,
     * all parts of this shape are above all parts of a
     */
    clearsVertically(a: Shape): boolean {
        for (const r1 of a.m_elements) {
            for (const r2 of this.m_elements) {
                if (intersects(r1.left(), r1.right(), r2.left(), r2.right())) {
                    if (Math.min(r1.top(), r1.bottom()) <= Math.max(r2.top(), r2.bottom())) {
                        return false
                    }
                }
            }
        }
        return true
    }

    /** compute left border */
    left(): number {
        let dist = DBL_MAX
        for (const r of this.m_elements) {
            // TURBO-HACK: the only purpose of this is to ignore fingering for spacing the first CR segment after the header.
            if (!RealIsNull(r.height()) && !(r.item() && r.item()!.type() === ElementType.FINGERING) && r.left() < dist) {
                dist = r.left()
            }
        }
        return -dist
    }

    /** compute right border */
    right(): number {
        let dist = -DBL_MAX
        for (const r of this.m_elements) {
            if (r.right() > dist) {
                dist = r.right()
            }
        }
        return dist
    }

    top(): number {
        let dist = DBL_MAX
        for (const r of this.m_elements) {
            if (r.top() < dist) {
                dist = r.top()
            }
        }
        return dist
    }

    bottom(): number {
        let dist = -DBL_MAX
        for (const r of this.m_elements) {
            if (r.bottom() > dist) {
                dist = r.bottom()
            }
        }
        return dist
    }

    topAtX(x: number): number {
        let localTop = DBL_MAX
        for (const el of this.m_elements) {
            if (el.left() < x && el.right() > x) {
                localTop = Math.min(localTop, el.top())
            }
        }
        return localTop !== DBL_MAX ? localTop : this.top()
    }

    bottomAtX(x: number): number {
        let localBottom = -DBL_MAX
        for (const el of this.m_elements) {
            if (el.left() < x && el.right() > x) {
                localBottom = Math.max(localBottom, el.bottom())
            }
        }
        // NOTE: C++ compares with DBL_MAX here (always true), kept for identical results
        return localBottom !== DBL_MAX ? localBottom : this.bottom()
    }

    rightMostEdgeAtHeight(yAbove: number, yBelow: number): number {
        let edge = -DBL_MAX
        for (const sh of this.m_elements) {
            if (sh.bottom() > yAbove && sh.top() < yBelow) {
                edge = Math.max(edge, sh.right())
            }
        }
        return edge
    }

    leftMostEdgeAtHeight(yAbove: number, yBelow: number): number {
        let edge = DBL_MAX
        for (const sh of this.m_elements) {
            if (sh.bottom() > yAbove && sh.top() < yBelow) {
                edge = Math.min(edge, sh.left())
            }
        }
        return edge
    }

    leftMostEdgeAtTop(): number {
        let edge = DBL_MAX
        const shapeTop = this.top()
        for (const sh of this.m_elements) {
            if (RealIsEqual(sh.top(), shapeTop)) {
                edge = Math.min(edge, sh.left())
            }
        }
        return edge
    }

    /**
     * p is on top of shape
     * returns negative values if there is an overlap
     */
    topDistance(p: PointF): number {
        let dist = DBL_MAX
        for (const r of this.m_elements) {
            if (p.x() >= r.left() && p.x() < r.right()) {
                dist = Math.min(dist, r.top() - p.y())
            }
        }
        return dist
    }

    /**
     * p is below the shape
     * returns negative values if there is an overlap
     */
    bottomDistance(p: PointF): number {
        let dist = DBL_MAX
        for (const r of this.m_elements) {
            if (p.x() >= r.left() && p.x() < r.right()) {
                dist = Math.min(dist, p.y() - r.bottom())
            }
        }
        return dist
    }

    contains(p: PointF): boolean {
        return this.m_elements.some(r => r.contains(p))
    }

    intersects(other: RectF | Shape): boolean {
        if (other instanceof Shape) {
            return other.m_elements.some(r => this.intersects(r))
        }
        return this.m_elements.some(r => r.intersects(other))
    }

    paint(painter: Painter): void {
        for (const r of this.m_elements) {
            painter.drawRect(r)
        }
    }
}
