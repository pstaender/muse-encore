/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tuplet.h/.cpp (editing is not ported)
 */

import type { Color } from '../../framework/draw/types/color'
import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionV, ElementType, TextStyleType, nidx, type staff_idx_t, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { textStyle } from '../style/textstyle'
import { DurationElement } from './durationelement'
import { TDuration } from './durationtype'
import type { EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SegmentType } from './segment'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { Measure } from './measure'
import type { Text } from './text'
import type { Rest } from './rest'

export enum TupletNumberType {
    SHOW_NUMBER, SHOW_RELATION, NO_TEXT,
}

export enum TupletBracketType {
    AUTO_BRACKET, SHOW_BRACKET, SHOW_NO_BRACKET,
}

/** factories registered by the corresponding modules (avoid runtime import cycles) */
export const tupletFactories: {
    createRest?: (parent: EngravingObject) => Rest
} = {}

const tupletStyle: ElementStyle = [
    { sid: Sid.tupletDirection, pid: Pid.DIRECTION },
    { sid: Sid.tupletNumberType, pid: Pid.NUMBER_TYPE },
    { sid: Sid.tupletBracketType, pid: Pid.BRACKET_TYPE },
    { sid: Sid.tupletBracketWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.tupletFontFace, pid: Pid.FONT_FACE },
    { sid: Sid.tupletFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.tupletFontStyle, pid: Pid.FONT_STYLE },
    { sid: Sid.tupletAlign, pid: Pid.ALIGN },
    { sid: Sid.tupletPosition, pid: Pid.POSITION },
    { sid: Sid.tupletMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.tupletFontSpatiumDependent, pid: Pid.SIZE_SPATIUM_DEPENDENT },
]

export class Tuplet extends DurationElement {
    bracketL: PointF[] = [new PointF(), new PointF(), new PointF(), new PointF()]
    bracketR: PointF[] = [new PointF(), new PointF(), new PointF()]

    private m_allElements = new Set<DurationElement>()
    private m_currentElements: DurationElement[] = []
    private m_direction: DirectionV = DirectionV.AUTO
    private m_numberType = TupletNumberType.SHOW_NUMBER
    private m_bracketType = TupletBracketType.AUTO_BRACKET
    private m_bracketWidth = new Spatium(0)
    private m_hasBracket = false
    private m_ratio = new Fraction(1, 1)
    private m_baseLen = new TDuration() // 1/8 for a triplet of 1/8
    private m_isUp = true
    private m_isSmall = true
    private m_tick = new Fraction(0, 1)
    private m_p1 = new PointF()
    private m_p2 = new PointF()
    private m_userP1 = new PointF() // user offset
    private m_userP2 = new PointF()
    private m_id = 0 // used during read/write
    private m_number: Text | null = null

    constructor(parent: Measure | null) {
        super(ElementType.TUPLET, parent)
        this.initElementStyle(tupletStyle)
    }

    override setVisible(f: boolean): void {
        super.setVisible(f)
        if (this.m_number) {
            this.m_number.setVisible(f)
        }
    }

    override setColor(col: Color): void {
        super.setColor(col)
        if (this.m_number) {
            this.m_number.setColor(col)
        }
    }

    override propertyDelegate(id: Pid): EngravingObject | null {
        switch (id) {
        case Pid.FONT_FACE:
        case Pid.FONT_STYLE:
        case Pid.FONT_SIZE:
        case Pid.ALIGN:
        case Pid.POSITION:
        case Pid.SIZE_SPATIUM_DEPENDENT:
            return this.m_number
        default:
            return null
        }
    }

    number(): Text | null { return this.m_number }
    setNumber(t: Text | null): void { this.m_number = t }

    resetNumberProperty(number: Text | null = this.m_number): void {
        for (const p of [Pid.FONT_FACE, Pid.FONT_STYLE, Pid.FONT_SIZE, Pid.ALIGN, Pid.POSITION, Pid.SIZE_SPATIUM_DEPENDENT]) {
            number!.resetProperty(p)
        }
    }

    override measure(): Measure { return this.explicitParent() as unknown as Measure }

    numberType(): TupletNumberType { return this.m_numberType }
    bracketType(): TupletBracketType { return this.m_bracketType }
    setNumberType(val: TupletNumberType): void { this.m_numberType = val }
    setBracketType(val: TupletBracketType): void { this.m_bracketType = val }
    hasBracket(): boolean { return this.m_hasBracket }
    setHasBracket(b: boolean): void { this.m_hasBracket = b }
    bracketWidth(): Spatium { return this.m_bracketWidth }
    setBracketWidth(s: Spatium): void { this.m_bracketWidth = s }
    ratio(): Fraction { return this.m_ratio }
    setRatio(r: Fraction): void { this.m_ratio = r }
    setUserPoint1(p: PointF): void { this.m_userP1 = p.clone() }
    setUserPoint2(p: PointF): void { this.m_userP2 = p.clone() }

    elements(): DurationElement[] { return this.m_currentElements }
    clear(): void { this.m_currentElements = [] }
    /** C++ overloads contains(const DurationElement*) next to EngravingItem::contains(PointF) */
    override contains(p: PointF | DurationElement): boolean {
        return p instanceof PointF ? super.contains(p) : this.m_currentElements.includes(p)
    }

    id(): number { return this.m_id }
    setId(i: number): void { this.m_id = i }
    baseLen(): TDuration { return this.m_baseLen }
    setBaseLen(d: TDuration): void { this.m_baseLen = d.clone() }
    setDirection(d: DirectionV): void { this.m_direction = d }
    direction(): DirectionV { return this.m_direction }
    isUp(): boolean { return this.m_isUp }
    setIsUp(val: boolean): void { this.m_isUp = val }
    isSmall(): boolean { return this.m_isSmall }
    setIsSmall(val: boolean): void { this.m_isSmall = val }

    override tick(): Fraction { return this.m_tick }
    override rtick(): Fraction { return this.tick().minus(this.measure().tick()) }
    setTick(v: Fraction): void { this.m_tick = v }

    p1(): PointF { return this.m_p1 }
    setP1(p: PointF): void { this.m_p1 = p.clone() }
    p2(): PointF { return this.m_p2 }
    setP2(p: PointF): void { this.m_p2 = p.clone() }
    userP1(): PointF { return this.m_userP1 }
    userP2(): PointF { return this.m_userP2 }

    // ---------------------------------------------------------
    //   calcHasBracket
    // ---------------------------------------------------------

    calcHasBracket(cr1: DurationElement, cr2: DurationElement): boolean {
        if (this.m_bracketType !== TupletBracketType.AUTO_BRACKET) {
            return this.m_bracketType !== TupletBracketType.SHOW_NO_BRACKET
        }
        if (cr1 === cr2) { // Degenerate tuplet
            return false
        }
        if (!cr1.isChord() || !cr2.isChord()) {
            return true
        }
        const c1 = cr1 as Chord
        const c2 = cr2 as Chord
        const beamStart = c1.beam()
        const beamEnd = c2.beam()
        if (!beamStart || !beamEnd || beamStart !== beamEnd) {
            return true
        }
        const tupletStartsBeam = beamStart.elements()[0] === c1
        const tupletEndsBeam = beamEnd.elements()[beamEnd.elements().length - 1] === c2
        const headSide = this.isUp() !== (c1.up() || c2.up())
        const isCross = c1.vStaffIdx() !== c2.vStaffIdx()
        if (tupletStartsBeam && tupletEndsBeam && (!headSide || isCross)) {
            return false
        }

        let beamCount = -1
        for (const e of this.m_currentElements) {
            if (e.isTuplet() || e.isRest()) {
                return true
            } else if (e.isChordRest()) {
                const cr = e as ChordRest
                if (!cr.beam()) {
                    return true
                }
                if (beamCount === -1) {
                    beamCount = cr.beams()
                } else if (beamCount !== cr.beams()) {
                    return true
                }
            }
        }
        if (beamCount < 1) {
            return true
        }

        let startChordBreaks32 = false
        let startChordBreaks64 = false
        const prevStartChord = c1.prev()
        if (prevStartChord) {
            [startChordBreaks32, startChordBreaks64] = beamStart.calcBeamBreaks(c1, prevStartChord, beamCount - 1)
        }
        let startChordDefinesTuplet = startChordBreaks32 || startChordBreaks64 || tupletStartsBeam
        if (prevStartChord) {
            startChordDefinesTuplet = startChordDefinesTuplet || prevStartChord.beams() < beamCount
        }

        let endChordBreaks32 = false
        let endChordBreaks64 = false
        const nextEndChord = c2.next()
        if (nextEndChord) {
            [endChordBreaks32, endChordBreaks64] = beamEnd.calcBeamBreaks(nextEndChord, c2, beamCount - 1)
        }
        let endChordDefinesTuplet = endChordBreaks32 || endChordBreaks64 || tupletEndsBeam
        if (nextEndChord) {
            endChordDefinesTuplet = endChordDefinesTuplet || nextEndChord.beams() < beamCount
        }

        if (startChordDefinesTuplet && endChordDefinesTuplet && (!headSide || isCross)) {
            return false
        }
        return true
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.m_number) {
            this.m_number.scanElements(func)
        }
        func(this)
    }

    override add(e: EngravingItem): void {
        if (this.m_currentElements.includes(e as DurationElement)) {
            return
        }
        switch (e.type()) {
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.TUPLET: {
            const de = e as DurationElement
            de.setTuplet(this)
            let found = false
            const tick = de.rtick()
            if (!tick.eq(new Fraction(-1, 1))) {
                for (let i = 0; i < this.m_currentElements.length; ++i) {
                    if (this.m_currentElements[i].rtick().gt(tick)) {
                        this.m_currentElements.splice(i, 0, de)
                        found = true
                        break
                    }
                }
            }
            if (!found) {
                this.m_currentElements.push(de)
            }
            break
        }
        default:
            break
        }
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.CHORD:
        case ElementType.REST:
        case ElementType.TUPLET: {
            const i = this.m_currentElements.indexOf(e as DurationElement)
            if (i >= 0) {
                this.m_currentElements.splice(i, 1)
            }
            break
        }
        default:
            break
        }
    }

    addDurationElement(de: DurationElement): void { this.m_allElements.add(de) }
    removeDurationElement(de: DurationElement): void { this.m_allElements.delete(de) }

    override setTrack(val: track_idx_t): void {
        if (this.tuplet()) {
            this.tuplet()!.setTrack(val)
        }
        if (this.m_number) {
            this.m_number.setTrack(val)
        }
        super.setTrack(val)
    }

    sortElements(): void {
        this.m_currentElements.sort((a, b) => a.tick().compare(b.tick()))
    }

    cross(): boolean {
        for (const de of this.m_currentElements) {
            if (!de) {
                continue
            } else if (de.isChordRest()) {
                if ((de as ChordRest).staffMove()) {
                    return true
                }
            } else if (de.isTuplet()) {
                if ((de as Tuplet).cross()) {
                    return true
                }
            }
        }
        return false
    }

    override vStaffIdx(): staff_idx_t {
        if (this.elements().length === 0) {
            return nidx
        }
        let cr: DurationElement | undefined = this.elements()[0]
        if (!cr) {
            return nidx
        }
        while (cr.isTuplet()) {
            const t = cr as Tuplet
            if (t.elements().length === 0) {
                return nidx
            }
            cr = t.elements()[0]
        }
        return cr.vStaffIdx()
    }

    elementsDuration(): Fraction {
        let f = new Fraction(0, 1)
        for (const el of this.m_currentElements) {
            f = f.plus(el.ticks())
        }
        return f
    }

    override getProperty(propertyId: Pid): PropertyValue {
        const delegate = this.propertyDelegate(propertyId)
        if (delegate) {
            return delegate.getProperty(propertyId)
        }
        switch (propertyId) {
        case Pid.DIRECTION: return this.m_direction
        case Pid.NUMBER_TYPE: return this.m_numberType
        case Pid.BRACKET_TYPE: return this.m_bracketType
        case Pid.LINE_WIDTH: return this.m_bracketWidth
        case Pid.NORMAL_NOTES: return this.m_ratio.denominator()
        case Pid.ACTUAL_NOTES: return this.m_ratio.numerator()
        case Pid.P1: return this.m_userP1
        case Pid.P2: return this.m_userP2
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        const delegate = this.propertyDelegate(propertyId)
        if (delegate) {
            return delegate.setProperty(propertyId, v)
        }
        switch (propertyId) {
        case Pid.DIRECTION:
            this.setDirection(v as DirectionV)
            break
        case Pid.NUMBER_TYPE:
            this.setNumberType(v as TupletNumberType)
            break
        case Pid.BRACKET_TYPE:
            this.setBracketType(v as TupletBracketType)
            break
        case Pid.LINE_WIDTH:
            this.setBracketWidth(v as Spatium)
            break
        case Pid.NORMAL_NOTES:
            this.m_ratio = new Fraction(this.m_ratio.numerator(), v as number)
            break
        case Pid.ACTUAL_NOTES:
            this.m_ratio = new Fraction(v as number, this.m_ratio.denominator())
            break
        case Pid.P1:
            this.m_userP1 = (v as PointF).clone()
            break
        case Pid.P2:
            this.m_userP2 = (v as PointF).clone()
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE: return TextStyleType.TUPLET
        case Pid.SYSTEM_FLAG: return false
        case Pid.TEXT: return ''
        case Pid.NORMAL_NOTES:
        case Pid.ACTUAL_NOTES:
            return 0
        case Pid.P1:
        case Pid.P2:
            return new PointF()
        case Pid.POSITION: return this.style().styleV(Sid.tupletPosition)
        case Pid.ALIGN: return this.style().styleV(Sid.tupletAlign)
        case Pid.FONT_FACE: return this.style().styleV(Sid.tupletFontFace)
        case Pid.FONT_SIZE: return this.style().styleV(Sid.tupletFontSize)
        case Pid.FONT_STYLE: return this.style().styleV(Sid.tupletFontStyle)
        case Pid.SIZE_SPATIUM_DEPENDENT: return this.style().styleV(Sid.tupletFontSpatiumDependent)
        default:
            break
        }
        for (const spp of textStyle(TextStyleType.DEFAULT)!) {
            if (spp.pid === id) {
                return this.styleValue(id, spp.sid)
            }
        }
        return super.propertyDefault(id)
    }

    // ---------------------------------------------------------
    //   sanitizeTuplet
    //    Check validity of tuplets and coherence between duration and baselength.
    //    Needed for importing old files due to a bug in the released version for corner-case tuplets.
    // ---------------------------------------------------------

    sanitizeTuplet(): void {
        if (this.ratio().numerator() === this.ratio().reduced().numerator()) { // return if the ratio is an irreducible fraction
            return
        }
        const baseLenDuration = new Fraction(this.ratio().denominator(), 1).times(this.baseLen().fraction()).reduced()

        // Due to a bug present in 2.1 (and before), a tuplet with non-reduced ratio could be
        // in a corrupted state (mismatch between duration and base length).
        // A tentative will now be made to retrieve the correct duration of this tuplet.
        let testDuration = new Fraction(0, 1)
        for (const de of this.elements()) {
            if (!de) {
                continue
            }
            let elementDuration: Fraction
            if (de.isTuplet()) {
                const t = de as Tuplet
                t.sanitizeTuplet()
                elementDuration = t.ticks()
            } else {
                elementDuration = de.ticks()
            }
            testDuration = testDuration.plus(elementDuration)
        }
        testDuration = testDuration.div(this.ratio()).reduced()

        const els = this.elements()
        if (els[els.length - 1].endTick().minus(els[0].tick()).gt(testDuration)) {
            return // this tuplet has missing elements; do not sanitize
        }
        if (!(testDuration.eq(baseLenDuration) && baseLenDuration.eq(this.ticks()))) {
            const f = testDuration.times(new Fraction(1, this.ratio().denominator())).reduced()
            const fbl = new Fraction(1, f.denominator())
            if (TDuration.isValidFraction(fbl)) {
                this.setTicks(testDuration)
                this.setBaseLen(new TDuration(fbl))
            }
        }
    }

    private addMissingElement(startTick: Fraction, endTick: Fraction): Fraction {
        let f = endTick.minus(startTick).times(this.ratio())
        const d = new TDuration(f, true)
        if (!d.isValid()) {
            return new Fraction(0, 1)
        }
        f = d.fraction()
        const segment = this.measure().getSegment(SegmentType.ChordRest, startTick)
        const rest = tupletFactories.createRest!(segment)
        rest.setDurationType(d)
        rest.setTicks(f)
        rest.setTrack(this.track())
        rest.setVisible(false)
        segment.add(rest)
        this.add(rest)
        return f
    }

    // ---------------------------------------------------------
    //   addMissingElements
    //    Make this tuplet complete by filling in holes where there ought to be rests
    // ---------------------------------------------------------

    addMissingElements(): void {
        if (this.tuplet()) {
            return // do not correct nested tuplets
        }
        if (this.voice() === 0) {
            return // nothing to do for tuplets in voice 1
        }
        let missingElementsDuration = this.ticks().times(this.ratio()).minus(this.elementsDuration())
        if (missingElementsDuration.isZero()) {
            return
        }
        // first, fill in any holes in the middle of the tuplet
        let expectedTick = this.elements()[0].tick()
        for (const de of [...this.elements()]) { // modified during loop
            if (!de) {
                continue
            }
            if (!de.tick().eq(expectedTick)) {
                missingElementsDuration = missingElementsDuration.minus(this.addMissingElement(expectedTick, de.tick()))
                if (missingElementsDuration.isZero()) {
                    return
                }
            }
            expectedTick = expectedTick.plus(de.actualTicks())
        }
        // next, fill in any holes at the beginning of the tuplet
        const first = this.elements()[0]
        expectedTick = first.tick().minus(Fraction.fromTicks(first.tick().ticks() % this.ticks().ticks()))
        if (!expectedTick.eq(first.tick())) {
            // try to fill a hole at the beginning of the tuplet
            let firstAvailableTick = this.measure().tick()
            const segment = this.measure().findSegment(SegmentType.ChordRest, first.tick())
            const prevChordRest = segment && segment.prev() ? segment.prev()!.nextChordRest(this.track(), true) : null
            if (prevChordRest && prevChordRest.measure() === this.measure()) {
                firstAvailableTick = prevChordRest.endTick()
            }
            if (!firstAvailableTick.eq(first.tick())) {
                const ticksRequired = missingElementsDuration.div(this.ratio())
                const endTick = first.tick()
                const t = endTick.minus(ticksRequired)
                let startTick = firstAvailableTick.lt(t) ? t : firstAvailableTick
                if (expectedTick.gt(startTick)) {
                    startTick = expectedTick
                }
                missingElementsDuration = missingElementsDuration.minus(this.addMissingElement(startTick, endTick))
                if (missingElementsDuration.isZero()) {
                    return
                }
            }
        }
        // finally, fill in any holes at the end of the tuplet
        const els = this.elements()
        const startTick = els[els.length - 1].endTick()
        let endTick = els[0].tick().plus(this.ticks())
        const segment = this.measure().findSegment(SegmentType.ChordRest, els[els.length - 1].tick())
        const nextChordRest = segment && segment.next() ? segment.next()!.nextChordRest(this.track(), false) : null
        if (nextChordRest && nextChordRest.tick().lt(endTick)) {
            endTick = nextChordRest.tick()
        }
        this.addMissingElement(startTick, endTick)
    }

    static computeTupletDenominator(numerator: number, totalDuration: Fraction): number {
        if (numerator <= 0) {
            return 0
        }
        const noteDuration = totalDuration.div(numerator)
        let baseLen = new Fraction(1, 1)
        let ratio = totalDuration.div(baseLen).reduced()
        while (ratio.denominator() !== 1 || baseLen.div(2).ge(noteDuration)) {
            baseLen = baseLen.div(2)
            ratio = totalDuration.div(baseLen).reduced()
        }
        return ratio.numerator()
    }
}
