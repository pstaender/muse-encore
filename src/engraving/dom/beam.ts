/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/beam.h/.cpp (editing is not ported)
 */

import { PointF } from '../../framework/draw/types/geometry'
import { RealIsEqual } from '../../framework/global/realfn'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { BeamMode, DirectionV, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { Skyline } from '../infrastructure/skyline'
import { BeamBase, type BeamFragment, type NotePosition } from './beambase'
import type { EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { TDuration } from './durationtype'
import { Groups } from './groups'
import { SegmentType } from './segment'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { StaffType } from './stafftype'
import type { System } from './system'

const beamStyle: ElementStyle = [
    { sid: Sid.beamNoSlope, pid: Pid.BEAM_NO_SLOPE },
]

export interface TremAnchor {
    chord1: ChordRest | null
    y1: number
    y2: number
}

export class Beam extends BeamBase {
    private m_elements: ChordRest[] = [] // must be sorted by tick
    private m_isGrace = false
    private m_cross = false
    private m_fullCross = false
    private m_growLeft = 1.0 // define "feather" beams
    private m_growRight = 1.0
    private m_beamDist = 0.0
    private m_beamSpacing = 3 // how far apart beams are spaced in quarter spaces
    private m_beamWidth = 0.0 // how wide each beam is
    private m_isBesideTabStaff = false
    private m_tab: StaffType | null = null
    private m_fragments: BeamFragment[] = [] // beam splits across systems
    private m_id = 0 // used in read()/write()
    private m_minCRMove = 0 // set in layout1()
    private m_maxCRMove = 0
    private m_noSlope = false
    private m_slope = 0.0
    private m_notePositions: NotePosition[] = []
    private m_tremAnchors: TremAnchor[] = []

    constructor(parent: EngravingObject | null) {
        super(ElementType.BEAM, parent)
        this.initElementStyle(beamStyle)
        this.resetProperty(Pid.BEAM_CROSS_STAFF_MOVE)
    }

    system(): System { return this.explicitParent() as unknown as System }

    override triggerLayout(): void {
        if (this.m_elements.length) {
            this.m_elements[0].triggerLayout()
            this.m_elements[this.m_elements.length - 1].triggerLayout()
        }
    }

    elements(): ChordRest[] { return this.m_elements }
    clear(): void { this.m_elements = [] }
    empty(): boolean { return this.m_elements.length === 0 }
    /** C++ overloads contains(const ChordRest*) next to EngravingItem::contains(PointF) */
    override contains(p: PointF | ChordRest): boolean {
        return p instanceof PointF ? super.contains(p) : this.m_elements.includes(p)
    }

    override add(e: EngravingItem): void {
        if (e.isChordRest()) {
            this.addChordRest(e as ChordRest)
        }
    }

    override remove(e: EngravingItem): void {
        if (e.isChordRest()) {
            this.removeChordRest(e as ChordRest)
        }
    }

    private addChordRest(a: ChordRest): void {
        a.setBeam(this)
        if (!this.m_elements.includes(a)) {
            // insert element in same order as it appears in the score
            if (a.explicitParent() && this.m_elements.length) {
                for (let i = 0; i < this.m_elements.length; ++i) {
                    const s = this.m_elements[i].segment()
                    if (s.tick().gt(a.segment().tick())
                        || (s.tick().eq(a.segment().tick()) && a.segment().next(SegmentType.ChordRest) === s)) {
                        this.m_elements.splice(i, 0, a)
                        return
                    }
                }
            }
            this.m_elements.push(a)
        }
    }

    private removeChordRest(a: ChordRest): void {
        const i = this.m_elements.indexOf(a)
        if (i >= 0) {
            this.m_elements.splice(i, 1)
        }
        a.setBeam(null)
    }

    findChordWithCustomStemDirection(): Chord | null {
        for (const rest of this.elements()) {
            if (!rest.isChord()) {
                continue
            }
            const chord = rest as Chord
            if (chord.stemDirection() !== DirectionV.AUTO) {
                return chord
            }
        }
        return null
    }

    topLevelSegmentForElement(element: ChordRest): ReturnType<BeamBase['beamSegments']>[number] | null {
        const segments = this.beamSegments()
        if (segments.length === 0) {
            return null
        }
        let curSegment = segments[0]
        if (segments.length === 1) {
            return curSegment
        }
        for (const segment of segments) {
            if (segment.level <= curSegment.level) {
                continue
            }
            const elementTick = element.tick()
            if (segment.startTick.le(elementTick) && segment.endTick.ge(elementTick)) {
                curSegment = segment
            }
        }
        return curSegment
    }

    override move(offset: PointF): void {
        super.move(offset)
        for (const bs of this.m_beamSegments) {
            bs.line.translate(offset)
        }
    }

    /** returns [isBroken16, isBroken32] */
    calcBeamBreaks(cr: ChordRest, prevCr: ChordRest | null, level: number): [boolean, boolean] {
        const beamMode = cr.beamMode()

        // get default beam mode -- based on time signature preferences
        if (cr.isRest() && (beamMode === BeamMode.MID || beamMode === BeamMode.BEGIN16 || beamMode === BeamMode.BEGIN32)) {
            switch (beamMode) {
            case BeamMode.MID: return [false, false]
            case BeamMode.BEGIN16: return [level > 0, false]
            default: return [false, level > 1] // BEGIN32
            }
        }

        const defaultBeamMode = Groups.baseBeamMode(cr, prevCr)

        const isManuallyBroken16 = level >= 1 && beamMode === BeamMode.BEGIN16
        const isManuallyBroken32 = level >= 2 && beamMode === BeamMode.BEGIN32
        const isDefaultBroken16 = beamMode === BeamMode.AUTO && level >= 1 && defaultBeamMode === BeamMode.BEGIN16
        const isDefaultBroken32 = beamMode === BeamMode.AUTO && level >= 2 && defaultBeamMode === BeamMode.BEGIN32

        let isBroken16 = isManuallyBroken16 || isDefaultBroken16
        let isBroken32 = isManuallyBroken32 || isDefaultBroken32

        // deal with beam-embedded triplets by breaking beams as if they were a single beat
        if (level > 0 && prevCr && cr.beamMode() === BeamMode.AUTO) {
            if (cr.tuplet() && cr.tuplet() !== prevCr.tuplet()) {
                const beams = Math.max(new TDuration(cr.tuplet()!.ticks()).hooks(), 1)
                if (beams <= level) {
                    isBroken16 = level === 1
                    isBroken32 = level >= 2
                }
            } else if (prevCr.tuplet() && prevCr.tuplet() !== cr.tuplet()) {
                const beams = Math.max(new TDuration(prevCr.tuplet()!.ticks()).hooks(), 1)
                if (beams <= level) {
                    isBroken16 = level === 1
                    isBroken32 = level >= 2
                }
            }
        }
        return [isBroken16, isBroken32]
    }

    override setDirection(d: DirectionV): void {
        if (this.direction() === d || this.m_cross) {
            return
        }
        this.doSetDirection(d)
        if (d !== DirectionV.AUTO) {
            this.setUp(d === DirectionV.UP)
        }
        for (const e of this.elements()) {
            if (e.isChord()) {
                (e as Chord).setStemDirection(d)
            }
        }
    }

    id(): number { return this.m_id }
    setId(i: number): void { this.m_id = i }

    growLeft(): number { return this.m_growLeft }
    growRight(): number { return this.m_growRight }
    setGrowLeft(val: number): void { this.m_growLeft = val }
    setGrowRight(val: number): void { this.m_growRight = val }

    override reset(): void {
        if (!RealIsEqual(this.growLeft(), 1.0)) {
            this.undoChangeProperty(Pid.GROW_LEFT, 1.0)
        }
        if (!RealIsEqual(this.growRight(), 1.0)) {
            this.undoChangeProperty(Pid.GROW_RIGHT, 1.0)
        }
        if (this.userModified()) {
            this.undoChangeProperty(Pid.BEAM_POS, this.beamPos())
            this.undoChangeProperty(Pid.USER_MODIFIED, false)
        }
        this.undoChangeProperty(Pid.STEM_DIRECTION, DirectionV.AUTO)
        this.undoResetProperty(Pid.BEAM_NO_SLOPE)
        this.undoResetProperty(Pid.BEAM_CROSS_STAFF_MOVE)
        this.undoChangeProperty(Pid.GENERATED, true)
    }

    beamPos(): [number, number] {
        if (this.m_fragments.length === 0) {
            return [0.0, 0.0]
        }
        const f = this.m_fragments[this.m_fragments.length - 1]
        const idx = this.directionIdx()
        const sp = this.spatium()
        return [f.py1[idx] / sp, f.py2[idx] / sp]
    }

    setBeamPos(bp: [number, number]): void {
        if (this.m_fragments.length === 0) {
            this.m_fragments.push({ py1: [0, 0], py2: [0, 0] })
        }
        const f = this.m_fragments[this.m_fragments.length - 1]
        const idx = this.directionIdx()
        this.setUserModified(true)
        this.setGenerated(false)
        const sp = this.spatium()
        if (this.noSlope()) {
            f.py1[idx] = f.py2[idx] = (bp[0] + bp[1]) * 0.5 * sp
        } else {
            f.py1[idx] = bp[0] * sp
            f.py2[idx] = bp[1] * sp
        }
    }

    beamDist(): number { return this.m_beamDist }
    setBeamDist(d: number): void { this.m_beamDist = d }
    beamWidth(): number { return this.m_beamWidth }
    setBeamWidth(w: number): void { this.m_beamWidth = w }
    override beamWidthForShape(): number { return this.m_beamWidth }
    beamSpacing(): number { return this.m_beamSpacing }
    setBeamSpacing(val: number): void { this.m_beamSpacing = val }

    noSlope(): boolean { return this.m_noSlope }
    setNoSlope(b: boolean): void {
        this.m_noSlope = b
        // Make flat if usermodified
        if (this.m_noSlope && this.userModified() && this.m_fragments.length) {
            const idx = this.directionIdx()
            const f = this.m_fragments[this.m_fragments.length - 1]
            f.py1[idx] = f.py2[idx] = (f.py1[idx] + f.py2[idx]) * 0.5
        }
    }

    slope(): number { return this.m_slope }
    setSlope(val: number): void { this.m_slope = val }

    computeAndSetSlope(): void {
        const xDiff = this.m_endAnchor.x() - this.m_startAnchor.x()
        const yDiff = this.m_endAnchor.y() - this.m_startAnchor.y()
        if (Math.abs(xDiff) < 0.5 * this.spatium()) {
            // Temporary safeguard: a beam this short is invisible on the tablature, but it
            // still produces a slope that messes up the beam layout
            this.setSlope(0.0)
        } else {
            this.setSlope(yDiff / xDiff)
        }
    }

    setIsGrace(val: boolean): void { this.m_isGrace = val }
    isGrace(): boolean { return this.m_isGrace }
    cross(): boolean { return this.m_cross }
    setCross(val: boolean): void { this.m_cross = val }
    fullCross(): boolean { return this.m_fullCross }
    setFullCross(v: boolean): void { this.m_fullCross = v }
    override minCRMove(): number { return this.m_minCRMove }
    setMinMove(val: number): void { this.m_minCRMove = val }
    override maxCRMove(): number { return this.m_maxCRMove }
    setMaxMove(val: number): void { this.m_maxCRMove = val }

    addSkyline(sk: Skyline): void {
        if (this.m_beamSegments.length === 0 || !this.addToSkyline()) {
            return
        }
        sk.add(this.m_beamSegments[0].shape())
    }

    tremAnchors(): TremAnchor[] { return this.m_tremAnchors }
    beamFragments(): BeamFragment[] { return this.m_fragments }
    addBeamFragment(f: BeamFragment): void { this.m_fragments.push(f) }

    override clearBeamSegments(): void {
        for (const chordRest of this.m_elements) {
            chordRest.setBeamlet(null)
        }
        super.clearBeamSegments()
    }

    tab(): StaffType | null { return this.m_tab }
    setTab(t: StaffType | null): void { this.m_tab = t }
    isBesideTabStaff(): boolean { return this.m_isBesideTabStaff }
    setIsBesideTabStaff(val: boolean): void { this.m_isBesideTabStaff = val }
    notePositions(): NotePosition[] { return this.m_notePositions }
    setNotePositions(v: NotePosition[]): void { this.m_notePositions = v }

    override tick(): Fraction { return this.m_elements.length === 0 ? new Fraction(0, 1) : this.m_elements[0].segment().tick() }
    override rtick(): Fraction { return this.m_elements.length === 0 ? new Fraction(0, 1) : this.m_elements[0].segment().rtick() }

    ticks(): Fraction {
        let ticks = new Fraction(0, 1)
        for (const cr of this.m_elements) {
            ticks = ticks.plus(cr.actualTicks())
        }
        return ticks
    }

    hasAllRests(): boolean {
        return !this.m_elements.some(cr => cr && cr.isChord())
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GROW_LEFT: return this.growLeft()
        case Pid.GROW_RIGHT: return this.growRight()
        case Pid.BEAM_POS: return this.beamPos()
        case Pid.BEAM_NO_SLOPE: return this.noSlope()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.GROW_LEFT:
            this.setGrowLeft(v as number)
            break
        case Pid.GROW_RIGHT:
            this.setGrowRight(v as number)
            break
        case Pid.BEAM_POS:
            if (this.userModified()) {
                this.setBeamPos(v as [number, number])
            }
            break
        case Pid.BEAM_NO_SLOPE:
            this.setNoSlope(!!v)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.GROW_LEFT: return 1.0
        case Pid.GROW_RIGHT: return 1.0
        case Pid.BEAM_POS: return this.beamPos()
        default: return super.propertyDefault(id)
        }
    }

    override spatiumChanged(oldValue: number, newValue: number): void {
        const idx = this.directionIdx()
        if (this.userModified()) {
            const diff = newValue / oldValue
            for (const f of this.m_fragments) {
                f.py1[idx] = f.py1[idx] * diff
                f.py2[idx] = f.py2[idx] * diff
            }
        }
    }
}
