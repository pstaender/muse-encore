/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/drawtypes.h, pen.h, brush.h
 */

import { Color } from './color'

export enum CompositionMode {
    SourceOver,
    HardLight,
}

export enum PolygonMode {
    OddEven,
    Winding,
    Convex,
    Polyline,
}

export enum PenStyle {
    NoPen,
    SolidLine,
    DashLine,
    DotLine,
    DashDotLine,
    DashDotDotLine,
    CustomDashLine,
}

export enum PenCapStyle {
    FlatCap = 0x00,
    SquareCap = 0x10,
    RoundCap = 0x20,
}

export enum PenJoinStyle {
    MiterJoin = 0x00,
    BevelJoin = 0x40,
    RoundJoin = 0x80,
}

export enum BrushStyle {
    NoBrush,
    SolidPattern,
}

export class Pen {
    private m_dashPattern: number[] = []

    constructor(
        private m_color: Color = Color.BLACK,
        private m_width = 1,
        private m_style: PenStyle = PenStyle.SolidLine,
        private m_capStyle: PenCapStyle = PenCapStyle.SquareCap,
        private m_joinStyle: PenJoinStyle = PenJoinStyle.BevelJoin) {
        this.m_color = m_color.clone()
    }

    static noPen(): Pen { return new Pen(Color.BLACK, 1, PenStyle.NoPen) }

    clone(): Pen {
        const p = new Pen(this.m_color, this.m_width, this.m_style, this.m_capStyle, this.m_joinStyle)
        p.m_dashPattern = [...this.m_dashPattern]
        return p
    }

    style(): PenStyle { return this.m_style }
    setStyle(style: PenStyle): void {
        if (this.m_style === style) {
            return
        }
        this.m_style = style
        this.m_dashPattern = []
    }

    /** dash pattern in units of the pen width (Qt semantics) */
    dashPattern(): number[] {
        if (this.m_style === PenStyle.SolidLine || this.m_style === PenStyle.NoPen) {
            return []
        } else if (this.m_dashPattern.length === 0) {
            const space = 2
            const dot = 1
            const dash = 4
            switch (this.m_style) {
            case PenStyle.DashLine: this.m_dashPattern = [dash, space]; break
            case PenStyle.DotLine: this.m_dashPattern = [dot, space]; break
            case PenStyle.DashDotLine: this.m_dashPattern = [dash, space, dot, space]; break
            case PenStyle.DashDotDotLine: this.m_dashPattern = [dash, space, dot, space, dot, space]; break
            default: break
            }
        }
        return this.m_dashPattern
    }

    setDashPattern(pattern: number[]): void {
        if (pattern.length === 0) {
            return
        }
        this.m_dashPattern = [...pattern]
        this.m_style = PenStyle.CustomDashLine
        if (this.m_dashPattern.length % 2 === 1) {
            this.m_dashPattern.push(1)
        }
    }

    widthF(): number { return this.m_width }
    setWidthF(w: number): void { this.m_width = w }
    color(): Color { return this.m_color }
    setColor(c: Color): void { this.m_color = c.clone() }
    capStyle(): PenCapStyle { return this.m_capStyle }
    setCapStyle(c: PenCapStyle): void { this.m_capStyle = c }
    joinStyle(): PenJoinStyle { return this.m_joinStyle }
    setJoinStyle(j: PenJoinStyle): void { this.m_joinStyle = j }
}

export class Brush {
    constructor(private m_color: Color = Color.BLACK, private m_style: BrushStyle = BrushStyle.SolidPattern) {
        this.m_color = m_color.clone()
    }

    static noBrush(): Brush { return new Brush(Color.BLACK, BrushStyle.NoBrush) }

    clone(): Brush { return new Brush(this.m_color, this.m_style) }
    color(): Color { return this.m_color }
    setColor(c: Color): void { this.m_color = c.clone() }
    style(): BrushStyle { return this.m_style }
    setStyle(s: BrushStyle): void { this.m_style = s }
}

/** muse::draw::AlignmentFlag / TextFlag (Qt::AlignmentFlag) */
export enum AlignmentFlag {
    AlignLeft = 0x0001,
    AlignRight = 0x0002,
    AlignHCenter = 0x0004,
    AlignJustify = 0x0008,
    AlignTop = 0x0020,
    AlignBottom = 0x0040,
    AlignVCenter = 0x0080,
    AlignCenter = AlignVCenter | AlignHCenter,
    TextDontClip = 0x0200,
}
