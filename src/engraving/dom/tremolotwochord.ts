/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tremolotwochord.h/.cpp (editing is not ported)
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import { Transform } from '../../framework/draw/types/transform'
import { RealIsEqual } from '../../framework/global/realfn'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionV, DurationType, ElementType, StaffGroup, TremoloChordType, TremoloStyle, TremoloType } from '../types/types'
import { Sid } from '../style/styledef'
import { BeamBase, type BeamFragment } from './beambase'
import { TDuration } from './durationtype'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import type { Chord } from './chord'

const TREMOLO_STYLE: ElementStyle = [
    { sid: Sid.tremoloStyle, pid: Pid.TREMOLO_STYLE },
]

export class TremoloTwoChord extends BeamBase {
    private m_tremoloType = TremoloType.INVALID_TREMOLO
    private m_chord1: Chord | null = null
    private m_chord2: Chord | null = null
    private m_durationType = new TDuration()
    private m_playTremolo = true
    private m_lines = 0 // derived from _subtype
    private m_style = TremoloStyle.DEFAULT
    private m_beamFragment: BeamFragment = { py1: [0, 0], py2: [0, 0] }
    private m_path = new PainterPath()

    constructor(parent: Chord | null) {
        super(ElementType.TREMOLO_TWOCHORD, parent, ElementFlag.MOVABLE)
        this.initElementStyle(TREMOLO_STYLE)
    }

    chord(): Chord | null { return this.explicitParent() as unknown as Chord | null }
    override subtype(): number { return this.m_tremoloType }

    chordMag(): number {
        return this.explicitParent() ? this.chord()!.intrinsicMag() : 1.0
    }

    minHeight(): number {
        const sw = this.style().styleS(Sid.tremoloLineWidth).val() * this.chordMag()
        const td = this.style().styleS(Sid.tremoloDistance).val() * this.chordMag()
        return (this.lines() - 1) * td + sw
    }

    setTremoloType(t: TremoloType): void {
        if (t < TremoloType.C8) {
            return
        }
        this.m_tremoloType = t
        switch (t) {
        case TremoloType.R16:
        case TremoloType.C16:
            this.m_lines = 2
            break
        case TremoloType.R32:
        case TremoloType.C32:
            this.m_lines = 3
            break
        case TremoloType.R64:
        case TremoloType.C64:
            this.m_lines = 4
            break
        default:
            this.m_lines = 1
            break
        }
        this.styleChanged()
    }

    tremoloType(): TremoloType { return this.m_tremoloType }

    chord1(): Chord | null { return this.m_chord1 }
    setChord1(ch: Chord | null): void { this.m_chord1 = ch }
    chord2(): Chord | null { return this.m_chord2 }
    setChord2(ch: Chord | null): void { this.m_chord2 = ch }
    setChords(c1: Chord | null, c2: Chord | null): void {
        this.m_chord1 = c1
        this.m_chord2 = c2
    }

    override setDirection(d: DirectionV): void {
        if (this.direction() === d) {
            return
        }

        this.doSetDirection(d)

        if (d !== DirectionV.AUTO) {
            this.setUp(d === DirectionV.UP)
        }

        if (this.m_chord1) {
            this.m_chord1.setStemDirection(d)
        }
        if (this.m_chord2) {
            this.m_chord2.setStemDirection(d)
        }
    }

    override beamWidthForShape(): number { return this.ldata().beamWidth }

    crossStaffBeamBetween(): boolean {
        const c1 = this.m_chord1!
        const c2 = this.m_chord2!
        return ((c1.staffMove() > c2.staffMove()) && c1.up() && !c2.up())
               || ((c1.staffMove() < c2.staffMove()) && !c1.up() && c2.up())
    }

    durationType(): TDuration { return this.m_durationType }
    setDurationType(d: TDuration): void {
        if (this.m_durationType.equals(d)) {
            return
        }
        this.m_durationType = d
        this.styleChanged()
    }

    tremoloLen(): Fraction {
        switch (this.lines()) {
        case 1: return new Fraction(1, 8)
        case 2: return new Fraction(1, 16)
        case 3: return new Fraction(1, 32)
        case 4: return new Fraction(1, 64)
        }
        return new Fraction(0, 1)
    }

    lines(): number { return this.m_lines }

    tremoloStyle(): TremoloStyle { return this.m_style }
    setTremoloStyle(v: TremoloStyle): void { this.m_style = v }
    beamFragment(): BeamFragment { return this.m_beamFragment }
    setBeamFragment(bf: BeamFragment): void { this.m_beamFragment = bf }

    playTremolo(): boolean { return this.m_playTremolo }
    setPlayTremolo(v: boolean): void { this.m_playTremolo = v }

    customStyleApplicable(): boolean {
        return this.durationType().type() === DurationType.V_HALF
               && this.staffType()!.group() !== StaffGroup.TAB
    }

    private setBeamPos(bp: [number, number]): void {
        const idx = this.directionIdx()
        this.setUserModified(true)
        this.setGenerated(false)

        const _spatium = this.spatium()
        this.m_beamFragment.py1[idx] = bp[0] * _spatium
        this.m_beamFragment.py2[idx] = bp[1] * _spatium
    }

    beamPos(): [number, number] {
        const idx = this.directionIdx()
        const _spatium = this.spatium()
        return [this.m_beamFragment.py1[idx] / _spatium, this.m_beamFragment.py2[idx] / _spatium]
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TREMOLO_TYPE: return this.m_tremoloType
        case Pid.TREMOLO_STYLE: return this.m_style
        case Pid.PLAY: return this.m_playTremolo
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TREMOLO_TYPE:
            this.setTremoloType(val as TremoloType)
            break
        case Pid.TREMOLO_STYLE:
            if (this.customStyleApplicable()) {
                this.setTremoloStyle(val as TremoloStyle)
            }
            break
        case Pid.BEAM_POS:
            if (this.userModified()) {
                this.setBeamPos(val as [number, number])
            }
            break
        case Pid.PLAY:
            this.setPlayTremolo(!!val)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TREMOLO_STYLE: return this.style().styleI(Sid.tremoloStyle)
        case Pid.PLAY: return true
        default: return super.propertyDefault(propertyId)
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        const c = this.chord()
        if (c && c.tremoloChordType() === TremoloChordType.TremoloSecondChord) {
            return
        }
        super.scanElements(func)
    }

    override clearBeamSegments(): void {
        const chord1Segment = this.m_chord1 ? this.m_chord1.beamlet() : null
        const chord2Segment = this.m_chord2 ? this.m_chord2.beamlet() : null

        if (chord1Segment || chord2Segment) {
            for (const segment of this.m_beamSegments) {
                if (chord1Segment && chord1Segment === segment) {
                    this.m_chord1!.setBeamlet(null)
                } else if (chord2Segment && chord2Segment === segment) {
                    this.m_chord2!.setBeamlet(null)
                }
            }
        }

        super.clearBeamSegments()
    }

    override maxCRMove(): number { return Math.max(this.m_chord1!.staffMove(), this.m_chord2!.staffMove()) }
    override minCRMove(): number { return Math.min(this.m_chord1!.staffMove(), this.m_chord2!.staffMove()) }

    /** used for palettes */
    basePath(stretch = 0): PainterPath {
        const tradAlternate = this.m_style === TremoloStyle.TRADITIONAL_ALTERNATE
        if (tradAlternate && RealIsEqual(stretch, 0.0)) {
            // this shape will have to be constructed after the stretch
            // is known
            return new PainterPath()
        }

        // TODO: This should be a style setting, to replace tremoloStrokeLengthMultiplier
        const stemGapSp = 0.65

        const sp = this.spatium() * this.chordMag()

        // overall width of two-note tremolos should not be changed if chordMag() isn't 1.0
        const w2 = sp * this.style().styleS(Sid.tremoloWidth).val() * 0.5 / this.chordMag()
        const lw = sp * this.style().styleS(Sid.tremoloLineWidth).val()
        const td = sp * this.style().styleS(Sid.tremoloDistance).val()

        let ppath = new PainterPath()

        // first line
        ppath.addRect(-w2, 0.0, 2.0 * w2, lw)

        let ty = td

        // other lines
        for (let i = 1; i < this.m_lines; i++) {
            if (tradAlternate) {
                const stemWidth1 = this.m_chord1!.stem()!.lineWidthMag() / stretch
                const stemWidth2 = this.m_chord2!.stem()!.lineWidthMag() / stretch
                const inset = (stemGapSp * this.spatium()) / stretch

                ppath.addRect(-w2 + inset + stemWidth1, ty,
                    2.0 * w2 - (inset * 2.0) - (stemWidth2 + stemWidth1), lw)
            } else {
                ppath.addRect(-w2, ty, 2.0 * w2, lw)
            }
            ty += td
        }

        if (!this.explicitParent()) {
            // for the palette or for one-note tremolos
            const shearTransform = new Transform()
            shearTransform.shear(0.0, -(lw / 2.0) / w2)
            ppath = shearTransform.mapPath(ppath)
        }

        return ppath
    }

    computeShape(): void {
        if (!this.score()) {
            return
        }
        this.m_path = this.basePath()
        this.setbbox(this.m_path.boundingRect())
    }

    path(): PainterPath { return this.m_path }
    setPath(p: PainterPath): void { this.m_path = p }
}
