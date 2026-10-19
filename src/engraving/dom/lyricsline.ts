/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/lyricsline.h/.cpp
 *
 * TODO(port): PartialLyricsLine
 */

import type { Color } from '../../framework/draw/types/color'
import type { LineF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, track2staff } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SpannerAnchor } from './spanner'
import { LineSegment, SLine } from './line'
import type { Lyrics } from './lyrics'
import type { System } from './system'

const lyricsLineElementStyle: ElementStyle = [
    { sid: Sid.lyricsDashLineThickness, pid: Pid.LINE_WIDTH },
]

export class LyricsLine extends SLine {
    protected m_nextLyrics: Lyrics | null = null

    constructor(parent: EngravingObject | null, type: ElementType = ElementType.LYRICSLINE, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
        this.setDiagonal(false)
        this.initElementStyle(lyricsLineElementStyle)
        this.setAnchor(SpannerAnchor.SEGMENT)
        this.m_nextLyrics = null
        this.setGenerated(true) // no need to save it, as it can be re-generated
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new LyricsLineSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.color())
        return seg
    }

    lyrics(): Lyrics | null {
        const p = this.explicitParent()
        return p ? p as unknown as Lyrics : null
    }
    nextLyrics(): Lyrics | null { return this.m_nextLyrics }
    setNextLyrics(l: Lyrics | null): void { this.m_nextLyrics = l }
    isEndMelisma(): boolean { return !!this.lyrics() && this.lyrics()!.ticks().isNotZero() }
    isDash(): boolean { return !this.isEndMelisma() }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.LINE_WIDTH) {
            return this.styleValue(Pid.LINE_WIDTH, this.getPropertyStyle(Pid.LINE_WIDTH))
        }
        return super.propertyDefault(id)
    }

    override getPropertyStyle(propertyId: Pid): Sid {
        if (propertyId === Pid.LINE_WIDTH) {
            return this.isEndMelisma() ? Sid.lyricsLineThickness : Sid.lyricsDashLineThickness
        }
        return super.getPropertyStyle(propertyId)
    }

    protected override doComputeEndElement(): void {
        if (!this.isEndMelisma()) {
            super.doComputeEndElement()
            return
        }
        this.setEndElement(this.score().findChordRestEndingBeforeTickInTrack(this.tick2(), this.track()))
        if (!this.endElement()) {
            this.setEndElement(this.score().findChordRestEndingBeforeTickInStaff(this.tick2(), track2staff(this.track())))
        }
    }
}

export class LyricsLineSegmentLayoutData extends LayoutData {
    private m_dashes: LineF[] = []
    dashes(): readonly LineF[] { return this.m_dashes }
    clearDashes(): void { this.m_dashes = [] }
    addDash(dash: LineF): void { this.m_dashes.push(dash.clone()) }
}

export class LyricsLineSegment extends LineSegment {
    constructor(sp: LyricsLine | null, parent: System | null, type: ElementType = ElementType.LYRICSLINE_SEGMENT,
                f: number = ElementFlag.ON_STAFF) {
        super(type, sp, parent, f)
        this.setGenerated(true)
    }

    protected override createLayoutData(): LyricsLineSegmentLayoutData { return new LyricsLineSegmentLayoutData(this) }
    override ldata(): LyricsLineSegmentLayoutData { return super.ldata() as LyricsLineSegmentLayoutData }
    override mutldata(): LyricsLineSegmentLayoutData { return super.ldata() as LyricsLineSegmentLayoutData }

    lyricsLine(): LyricsLine { return this.spanner() as LyricsLine }
    lyrics(): Lyrics { return this.lyricsLine().lyrics()! }

    baseLineShift(): number {
        if (this.lyricsLine().isEndMelisma()) {
            return -0.5 * this.absoluteFromSpatium(this.lineWidth())
        }
        return -this.style().styleD(Sid.lyricsDashYposRatio) * this.lyrics().fontMetrics().xHeight()
    }

    verse(): number { return this.lyrics().verse() }
    lyricsPlaceAbove(): boolean { return this.lyrics().placeAbove() }
    lyricsAddToSkyline(): boolean { return this.lyrics().addToSkyline() }
    lineSpacing(): number { return this.lyrics().lineSpacing() }
    override color(): Color { return this.lyrics().color() }
    override allowTimeAnchor(): boolean { return false }

    override getProperty(propertyId: Pid): PropertyValue {
        const delegate = this.propertyDelegate(propertyId)
        return delegate ? delegate.getProperty(propertyId) : super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        const delegate = this.propertyDelegate(propertyId)
        return delegate ? delegate.setProperty(propertyId, val) : super.setProperty(propertyId, val)
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        const delegate = this.propertyDelegate(propertyId)
        return delegate ? delegate.propertyDefault(propertyId) : super.propertyDefault(propertyId)
    }

    override propertyDelegate(propertyId: Pid): EngravingObject | null {
        if (propertyId === Pid.GENERATED) {
            return this.hasSpanner() ? this.spanner() : null
        }
        return super.propertyDelegate(propertyId)
    }
}
