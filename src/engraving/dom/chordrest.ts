/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordrest.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { BeamMode, DurationType, DurationTypeWithDots, ElementType, PlacementV, type staff_idx_t, type track_idx_t } from '../types/types'
import { DurationElement } from './durationelement'
import { TDuration } from './durationtype'
import { EngravingItem, LayoutData } from './engravingitem'
import { Pid } from './property'
import type { EngravingObject } from './engravingobject'
import type { Segment, SegmentType } from './segment'
import type { Beam } from './beam'
import type { Lyrics } from './lyrics'
import type { Chord } from './chord'

/** C++ renderer() calls from the DOM; set by the layout module */
export const chordRestRenderer: {
    layoutBeam1?: (b: Beam) => void
    layoutStem?: (c: Chord) => void
} = {}

export enum CrossMeasure {
    UNKNOWN = -1,
    NONE = 0,
    FIRST,
    SECOND,
}

export enum NoteType {
    NORMAL = 0,
    ACCIACCATURA = 0x1,
    APPOGGIATURA = 0x2, // grace notes
    GRACE4 = 0x4,
    GRACE16 = 0x8,
    GRACE32 = 0x10,
    GRACE8_AFTER = 0x20,
    GRACE16_AFTER = 0x40,
    GRACE32_AFTER = 0x80,
    INVALID = 0xFF,
}

export class ChordRestLayoutData extends LayoutData {
    up = true // actual stem direction
}

export abstract class ChordRest extends DurationElement {
    protected m_lyrics: Lyrics[] = []
    protected m_beam: Beam | null = null
    protected m_beamlet: unknown = null
    protected m_beamMode: BeamMode = BeamMode.AUTO
    protected m_isSmall = false
    protected m_melismaEnd = false
    protected m_crossMeasure: CrossMeasure = CrossMeasure.UNKNOWN
    protected m_crossMeasureTDur = new TDuration()

    private m_el: EngravingItem[] = []
    private m_durationType = new TDuration()
    private m_staffMove = 0 // -1, 0, +1, used for crossbeaming
    private m_storedStaffMove = 0

    constructor(type: ElementType, parent: EngravingObject | null) {
        super(type, parent)
    }

    protected override createLayoutData(): ChordRestLayoutData { return new ChordRestLayoutData(this) }
    override ldata(): ChordRestLayoutData { return super.ldata() as ChordRestLayoutData }
    override mutldata(): ChordRestLayoutData { return super.ldata() as ChordRestLayoutData }

    setUp(val: boolean): void { this.mutldata().up = val }
    up(): boolean { return this.ldata().up }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    setBeamMode(m: BeamMode): void { this.m_beamMode = m }
    beamMode(): BeamMode { return this.m_beamMode }

    setBeam(b: Beam | null): void { this.m_beam = b }
    setBeamlet(b: unknown): void { this.m_beamlet = b }
    beamlet(): unknown { return this.m_beamlet }

    removeDeleteBeam(beamed: boolean): void {
        this.setBeamlet(null)
        if (this.m_beam) {
            const b = this.m_beam
            this.m_beam.remove(this)
            if (b.empty()) {
                this.score().removeElement(b)
            } else {
                chordRestRenderer.layoutBeam1!(b)
            }
        }
        if (!beamed && this.isChord()) {
            const c = this as unknown as Chord
            if (c.shouldHaveHook()) {
                if (!c.hook()) {
                    c.createHook()
                }
            } else if (c.hook()) {
                this.score().removeElement(c.hook()!)
            }
            chordRestRenderer.layoutStem!(c)
        }
    }

    replaceBeam(newBeam: Beam): void {
        if (this.m_beam === newBeam) {
            return
        }
        this.removeDeleteBeam(true)
        newBeam.add(this)
    }

    override beam(): Beam | null {
        const m = this.explicitParent() ? this.measure() : null
        return !(m && m.stemless(this.staffIdx())) ? this.m_beam : null
    }

    beams(): number { return this.m_durationType.hooks() }

    abstract upPos(): number
    abstract downPos(): number
    abstract rightEdge(): number
    abstract intrinsicMag(): number

    isSmall(): boolean { return this.m_isSmall }
    setSmall(val: boolean): void { this.m_isSmall = val }

    staffMove(): number { return this.m_staffMove }
    setStaffMove(val: number): void { this.m_staffMove = val }
    storedStaffMove(): number { return this.m_storedStaffMove }
    override vStaffIdx(): staff_idx_t { return this.staffIdx() + this.m_staffMove }

    checkStaffMoveValidity(): void {
        // TODO(port): validate cross staff moves (needs part/staff type checks)
    }

    durationType(): TDuration {
        return this.m_crossMeasure === CrossMeasure.FIRST ? this.m_crossMeasureTDur : this.m_durationType
    }

    actualDurationType(): TDuration { return this.m_durationType }

    setDurationType(v: DurationType | Fraction | TDuration | DurationTypeWithDots): void {
        if (v instanceof TDuration) {
            this.m_durationType = v.clone()
        } else if (v instanceof Fraction) {
            this.m_durationType = new TDuration()
            this.m_durationType.setVal(v.ticks())
        } else if (v instanceof DurationTypeWithDots) {
            this.m_durationType = new TDuration(v)
        } else {
            this.m_durationType.setType(v)
        }
        this.m_crossMeasure = CrossMeasure.UNKNOWN
    }

    setDots(n: number): void { this.m_durationType.setDots(n) }

    dots(): number {
        return this.m_crossMeasure === CrossMeasure.FIRST
            ? this.m_crossMeasureTDur.dots()
            : (this.m_crossMeasure === CrossMeasure.SECOND ? 0 : this.m_durationType.dots())
    }

    actualDots(): number { return this.m_durationType.dots() }

    durationTypeTicks(): Fraction {
        return this.m_crossMeasure === CrossMeasure.FIRST ? this.m_crossMeasureTDur.ticks() : this.m_durationType.ticks()
    }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)
        this.processSiblings(e => e.setTrack(val))
    }

    private processSiblings(func: (e: EngravingItem) => void): void {
        if (this.m_beam) {
            func(this.m_beam)
        }
        for (const l of this.m_lyrics) {
            func(l)
        }
        const t = this.tuplet()
        if (t) {
            func(t)
        }
        for (const e of this.m_el) {
            func(e)
        }
    }

    lyrics(): Lyrics[] { return this.m_lyrics }

    lyricsVerse(verse: number, p?: PlacementV): Lyrics | null {
        for (const l of this.m_lyrics) {
            if (l.verse() === verse && (p === undefined || l.placement() === p)) {
                return l
            }
        }
        return null
    }

    lastVerse(p: PlacementV): number {
        let lastVerse = -1
        for (const l of this.m_lyrics) {
            if (l.placement() === p && l.verse() > lastVerse) {
                lastVerse = l.verse()
            }
        }
        return lastVerse
    }

    isMelismaEnd(): boolean { return this.m_melismaEnd }
    setMelismaEnd(v: boolean): void { this.m_melismaEnd = v }

    override add(e: EngravingItem): void {
        e.setParent(this)
        e.setTrack(this.track())
        switch (e.type()) {
        case ElementType.ARTICULATION: // for backward compatibility
            break
        case ElementType.LYRICS:
            if (e.isStyled(Pid.OFFSET)) {
                e.setOffset(e.propertyDefault(Pid.OFFSET) as PointF)
            }
            this.m_lyrics.push(e as Lyrics)
            break
        default:
            super.add(e)
            break
        }
    }

    override remove(e: EngravingItem): void {
        if (e.type() === ElementType.LYRICS) {
            const i = this.m_lyrics.indexOf(e as Lyrics)
            if (i >= 0) {
                this.m_lyrics.splice(i, 1)
            }
            return
        }
        super.remove(e)
    }

    el(): EngravingItem[] { return this.m_el }
    protected addEl(e: EngravingItem): void { this.m_el.push(e) }
    protected removeEl(e: EngravingItem): boolean {
        const i = this.m_el.indexOf(e)
        if (i >= 0) {
            this.m_el.splice(i, 1)
            return true
        }
        return false
    }
    addFermata(f: EngravingItem): void { this.addEl(f) }

    crossMeasure(): CrossMeasure { return this.m_crossMeasure }
    setCrossMeasure(val: CrossMeasure): void { this.m_crossMeasure = val }
    crossMeasureDurationType(): TDuration { return this.m_crossMeasureTDur }
    setCrossMeasureDurationType(v: TDuration): void { this.m_crossMeasureTDur = v }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SMALL: return this.isSmall()
        case Pid.BEAM_MODE: return this.beamMode()
        case Pid.STAFF_MOVE: return this.staffMove()
        case Pid.DURATION_TYPE_WITH_DOTS: return this.actualDurationType().typeWithDots()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SMALL:
            this.setSmall(!!v)
            break
        case Pid.BEAM_MODE:
            this.setBeamMode(v as BeamMode)
            break
        case Pid.STAFF_MOVE:
            this.setStaffMove(v as number)
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            if (this.explicitParent()) {
                this.measure().checkMultiVoices(this.staffIdx())
            }
            break
        case Pid.DURATION_TYPE_WITH_DOTS:
            this.setDurationType(v as DurationTypeWithDots)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SMALL:
            return false
        case Pid.BEAM_MODE:
            return BeamMode.AUTO
        case Pid.STAFF_MOVE:
            return 0
        default:
            return super.propertyDefault(propertyId)
        }
    }

    isGrace(): boolean { return false }
    isGraceBefore(): boolean { return false }
    isGraceAfter(): boolean { return false }

    nextSegmentAfterCR(types: SegmentType): Segment | null {
        const end = this.tick().plus(this.actualTicks())
        for (let s = this.segment().next1MM(types); s; s = s.next1MM(types)) {
            if (s.tick().ge(end)) {
                return s
            }
        }
        return null
    }

    computeUp(): void {}

    isFullMeasureRest(): boolean { return this.m_durationType.equals(DurationType.V_MEASURE) }

    isBelowCrossBeam(beamBase: { crossStaffIdx(): number }): boolean {
        return this.staffMove() >= beamBase.crossStaffIdx()
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.m_beam && (this.m_beam.elements()[0] === this)
            && !this.measure().stemless(this.staffIdx())) {
            this.m_beam.scanElements(func)
        }
        for (const l of this.m_lyrics) {
            l.scanElements(func)
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let de: DurationElement = this
        while (de.tuplet() && de.tuplet()!.elements()[0] === de) {
            de.tuplet()!.scanElements(func)
            de = de.tuplet()!
        }
    }
}
