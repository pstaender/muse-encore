/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/bend.h/.cpp
 *
 * OBSOLETE CLASS: used to represent bends before version 4.2. Now replaced by the GuitarBend class (MuseScore still
 * reads, draws and writes it).
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Font, FontType } from '../../framework/draw/types/font'
import { Spatium } from '../types/dimension'
import { PitchValue, pitchValuesEqual, type PitchValues } from '../types/pitchvalue'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, FontStyle } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag, LayoutData, EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Note } from './note'
import { Pid } from './property'

export enum BendType {
    BEND = 0,
    BEND_RELEASE,
    BEND_RELEASE_BEND,
    PREBEND,
    PREBEND_RELEASE,
    CUSTOM,
}

const bendStyle: ElementStyle = [
    { sid: Sid.bendFontFace, pid: Pid.FONT_FACE },
    { sid: Sid.bendFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.bendFontStyle, pid: Pid.FONT_STYLE },
    { sid: Sid.bendLineWidth, pid: Pid.LINE_WIDTH },
]

const BEND_CURVE: readonly PitchValue[] = [new PitchValue(0, 0), new PitchValue(15, 100), new PitchValue(60, 100)]

const BEND_RELEASE_CURVE: readonly PitchValue[] = [new PitchValue(0, 0), new PitchValue(10, 100), new PitchValue(20, 100),
    new PitchValue(30, 0), new PitchValue(60, 0)]

const BEND_RELEASE_BEND_CURVE: readonly PitchValue[] = [new PitchValue(0, 0), new PitchValue(10, 100), new PitchValue(20, 100),
    new PitchValue(30, 0), new PitchValue(40, 0), new PitchValue(50, 100), new PitchValue(60, 100)]

const PREBEND_CURVE: readonly PitchValue[] = [new PitchValue(0, 100), new PitchValue(60, 100)]

const PREBEND_RELEASE_CURVE: readonly PitchValue[] = [new PitchValue(0, 100), new PitchValue(15, 100), new PitchValue(30, 0),
    new PitchValue(60, 0)]

const copyCurve = (c: readonly PitchValue[]): PitchValues => c.map(v => v.clone())

export class BendLayoutData extends LayoutData {
    // cache
    notePos = new PointF()
    noteWidth = 0.0
    noteHeight = 0.0
}

export class Bend extends EngravingItem {
    static readonly label = [
        '', '1/4', '1/2', '3/4', 'full',
        '1 1/4', '1 1/2', '1 3/4', '2',
        '2 1/4', '2 1/2', '2 3/4', '3',
    ]

    private m_playBend = true
    private m_points: PitchValues = []

    private m_fontFace = ''
    private m_fontSize = 0.0
    private m_fontStyle = FontStyle.Undefined
    private m_lineWidth = new Spatium(0)

    constructor(parent: EngravingObject | null) {
        super(ElementType.BEND, parent, ElementFlag.MOVABLE)
        this.initElementStyle(bendStyle)
    }

    protected override createLayoutData(): BendLayoutData { return new BendLayoutData(this) }
    override ldata(): BendLayoutData { return super.ldata() as BendLayoutData }
    override mutldata(): BendLayoutData { return super.ldata() as BendLayoutData }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_points = copyCurve(original.m_points)
    }

    note(): Note { return this.explicitParent() as unknown as Note }

    points(): PitchValues { return this.m_points }
    addPoint(pv: PitchValue): void { this.m_points.push(pv) }
    setPoints(p: readonly PitchValue[]): void { this.m_points = copyCurve(p) }
    playBend(): boolean { return this.m_playBend }
    setPlayBend(v: boolean): void { this.m_playBend = v }

    fontFace(): string { return this.m_fontFace }
    setFontFace(f: string): void { this.m_fontFace = f }
    fontSize(): number { return this.m_fontSize }
    setFontSize(s: number): void { this.m_fontSize = s }
    fontStyle(): FontStyle { return this.m_fontStyle }
    setFontStyle(s: FontStyle): void { this.m_fontStyle = s }
    lineWidth(): Spatium { return this.m_lineWidth }
    setLineWidth(w: Spatium): void { this.m_lineWidth = w }

    font(sp: number): Font {
        const f = new Font(this.m_fontFace, FontType.Unknown)
        f.setBold((this.m_fontStyle & FontStyle.Bold) !== 0)
        f.setItalic((this.m_fontStyle & FontStyle.Italic) !== 0)
        f.setUnderline((this.m_fontStyle & FontStyle.Underline) !== 0)
        f.setStrike((this.m_fontStyle & FontStyle.Strike) !== 0)
        let m = this.m_fontSize
        m *= sp / this.defaultSpatium()

        f.setPointSizeF(m)
        return f
    }

    private parseBendTypeFromCurve(): BendType {
        if (pitchValuesEqual(this.m_points, BEND_CURVE)) {
            return BendType.BEND
        } else if (pitchValuesEqual(this.m_points, BEND_RELEASE_CURVE)) {
            return BendType.BEND_RELEASE
        } else if (pitchValuesEqual(this.m_points, BEND_RELEASE_BEND_CURVE)) {
            return BendType.BEND_RELEASE_BEND
        } else if (pitchValuesEqual(this.m_points, PREBEND_CURVE)) {
            return BendType.PREBEND
        } else if (pitchValuesEqual(this.m_points, PREBEND_RELEASE_CURVE)) {
            return BendType.PREBEND_RELEASE
        } else {
            return BendType.CUSTOM
        }
    }

    private updatePointsByBendType(bendType: BendType): void {
        switch (bendType) {
        case BendType.BEND:
            this.m_points = copyCurve(BEND_CURVE)
            break
        case BendType.BEND_RELEASE:
            this.m_points = copyCurve(BEND_RELEASE_CURVE)
            break
        case BendType.BEND_RELEASE_BEND:
            this.m_points = copyCurve(BEND_RELEASE_BEND_CURVE)
            break
        case BendType.PREBEND:
            this.m_points = copyCurve(PREBEND_CURVE)
            break
        case BendType.PREBEND_RELEASE:
            this.m_points = copyCurve(PREBEND_RELEASE_CURVE)
            break
        default:
            break
        }
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.FONT_FACE:
            return this.m_fontFace
        case Pid.FONT_SIZE:
            return this.m_fontSize
        case Pid.FONT_STYLE:
            return this.m_fontStyle
        case Pid.PLAY:
            return this.playBend()
        case Pid.LINE_WIDTH:
            return this.m_lineWidth
        case Pid.BEND_TYPE:
            return this.parseBendTypeFromCurve()
        case Pid.BEND_CURVE:
            return copyCurve(this.m_points)
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.FONT_FACE:
            this.m_fontFace = v as string
            break
        case Pid.FONT_SIZE:
            this.m_fontSize = v as number
            break
        case Pid.FONT_STYLE:
            this.m_fontStyle = v as FontStyle
            break
        case Pid.PLAY:
            this.setPlayBend(v as boolean)
            break
        case Pid.LINE_WIDTH:
            this.m_lineWidth = v as Spatium
            break
        case Pid.BEND_TYPE:
            this.updatePointsByBendType(v as BendType)
            break
        case Pid.BEND_CURVE:
            this.setPoints(v as PitchValue[])
            break
        default:
            return super.setProperty(id, v)
        }
        this.triggerLayout()
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY:
            return true
        case Pid.BEND_TYPE:
            return BendType.BEND
        case Pid.BEND_CURVE:
            return copyCurve(BEND_CURVE)
        default:
            return super.propertyDefault(id)
        }
    }
}
