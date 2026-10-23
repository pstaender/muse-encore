/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/trill.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { Color } from '../../framework/draw/types/color'
import { SymId, type SymIdList } from '../types/symid'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, OrnamentStyle, TrillType, track2staff, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import type { Accidental } from './accidental'
import type { Chord } from './chord'
import { ClefInfo } from './clefinfo'
import type { Clef } from './clef'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { GraceNotesGroup } from './chord'
import { LineSegment, SLine } from './line'
import { Ornament } from './ornament'
import { Pid } from './property'
import type { Score } from './score'
import type { System } from './system'
import type { Segment } from './segment'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'
import { linkHooks } from './engravingobject'

const trillStyle: ElementStyle = [
    { sid: Sid.trillPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.trillPosAbove, pid: Pid.OFFSET },
]

const trillSegmentStyle: ElementStyle = [
    { sid: Sid.trillPosAbove, pid: Pid.OFFSET },
    { sid: Sid.trillMinDistance, pid: Pid.MIN_DISTANCE },
]

export class TrillSegment extends LineSegment {
    private m_symbols: SymIdList = []

    constructor(sp: Trill | null, parent: System | null) {
        super(ElementType.TRILL_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
    }

    trill(): Trill { return this.spanner() as Trill }

    symbols(): SymIdList { return this.m_symbols }

    override remove(e: EngravingItem): void {
        if (this.trill().accidental() === e) {
            // accidental is part of trill
            this.trill().setAccidental(null)
        }
    }

    symbolLine(start: SymId, fill: SymId, end: SymId | null = null): void {
        const x1 = 0.0
        const x2 = this.pos2().x()
        const w = x2 - x1
        const mag = this.magS()
        const f = this.score().engravingFont()

        this.m_symbols = []
        this.m_symbols.push(start)
        const w1 = f.advance(start, mag)
        const w2 = f.advance(fill, mag)
        const w3 = end !== null ? f.advance(end, mag) : 0
        const n = Math.round((w - w1 - w3) / w2)
        for (let i = 0; i < n; ++i) {
            this.m_symbols.push(fill)
        }
        if (end !== null) {
            this.m_symbols.push(end)
        }
        const r = f.bboxList(this.m_symbols, mag)
        this.mutldata().setBbox(r)
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        if (this.isSingleType() || this.isBeginType()) {
            const a = this.trill().accidental()
            if (a) {
                func(a)
            }
            const cueNoteChord = this.trill().cueNoteChord()
            if (cueNoteChord) {
                cueNoteChord.scanElements(func)
            }
        }
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.TRILL_TYPE || pid === Pid.ORNAMENT_STYLE || pid === Pid.PLACEMENT) {
            return this.spanner()
        }
        return super.propertyDelegate(pid)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.spanner().placeAbove() ? Sid.trillPosAbove : Sid.trillPosBelow
        }
        return super.getPropertyStyle(pid)
    }
}

export class Trill extends SLine {
    private m_trillType = TrillType.TRILL_LINE
    private m_ornament: Ornament | null = null
    private m_accidental: Accidental | null = null
    private m_cueNoteChord: Chord | null = null
    private m_ornamentStyle = OrnamentStyle.DEFAULT // for use in ornaments such as trill

    constructor(parent: EngravingObject | null) {
        super(ElementType.TRILL, parent)
        this.initElementStyle(trillStyle)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_ornament = original.m_ornament ? original.m_ornament.clone() as Ornament : null
        this.m_accidental = null
        this.m_cueNoteChord = null
    }

    override linkedClone(): EngravingItem {
        const linkedTrill = this.clone() as Trill
        if (this.m_ornament) {
            const linkedOrnament = this.m_ornament.linkedClone() as Ornament
            linkedTrill.setOrnament(linkedOrnament)
        }
        linkedTrill.setAutoplace(true)
        linkHooks.undoLink(linkedTrill, this)
        return linkedTrill
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.placeAbove() ? Sid.trillPosAbove : Sid.trillPosBelow
        }
        return super.getPropertyStyle(pid)
    }

    override remove(e: EngravingItem): void {
        if (e === this.m_accidental) {
            this.m_accidental = null
        } else {
            super.remove(e)
        }
    }

    override setTrack(n: track_idx_t): void {
        super.setTrack(n)
        for (const ss of this.spannerSegments()) {
            ss.setTrack(n)
        }
        if (this.m_ornament) {
            this.m_ornament.setTrack(n)
        }
    }

    override setScore(s: Score): void {
        super.setScore(s)
        if (this.m_ornament) {
            this.m_ornament.setScore(s)
        }
    }

    override computeStartElement(): void {
        super.computeStartElement()

        const start = this.startElement()
        if (start && start.isChord() && this.m_ornament) {
            this.m_ornament.setParent(start)
            const cueChord = this.m_ornament.cueNoteChord()
            if (cueChord) {
                cueChord.setParent((start as Chord).segment())
            }
        }
    }

    static trillLinePos(line: SLine, grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        const mmRest = line.style().styleB(Sid.createMultiMeasureRests)
        let graceOffset = 0.0
        let clefOffset = 0.0
        let segment = start ? line.startSegment() : line.endSegment()
        if (!segment) {
            return { pos: new PointF(), system: null }
        }

        if (start) {
            const x = segment.x() + segment.measure().x()
            return { pos: new PointF(x, 0.0), system: segment.measure().system() }
        }

        let graceNoteSeg = segment.preAppendedItem(line.track2()) ? segment : null
        let clefSeg = segment.isClefType() ? segment : null
        const curTick = segment.tick()
        for (;;) {
            const prevSeg: Segment | null = mmRest ? segment!.prev1MM() : segment!.prev1()
            if (prevSeg && prevSeg.tick().eq(curTick)) {
                graceNoteSeg = prevSeg.preAppendedItem(line.track2()) ? prevSeg : graceNoteSeg
                clefSeg = prevSeg.isClefType() ? prevSeg : clefSeg
                segment = prevSeg
            } else {
                break
            }
        }

        // Stop line before clefs
        if (clefSeg) {
            const clefItem = clefSeg.element(line.track2())
            if (clefItem && clefItem.isClef()) {
                const clef = clefItem as Clef
                const clefSym = ClefInfo.symId(clef.clefType())
                const clefShape = line.symShapeWithCutouts(clefSym).translated(clef.pos())
                clefOffset = segment!.pageX() - clef.pageX() + clefShape.leftMostEdgeAtTop()
            }
        }

        // Stop line before grace notes
        if (graceNoteSeg) {
            const preAppendedItem = graceNoteSeg.preAppendedItem(line.track2())
            if (preAppendedItem && preAppendedItem.isGraceNotesGroup()) {
                // get x position of leftmost grace note
                let leftMostGraceChord: Chord | null = null
                const graceGroup = preAppendedItem as unknown as GraceNotesGroup
                for (const graceChord of graceGroup.chords()) {
                    leftMostGraceChord = leftMostGraceChord && leftMostGraceChord.x() < graceChord.x() ? leftMostGraceChord : graceChord
                }
                if (leftMostGraceChord) {
                    graceOffset = segment!.pageX() - leftMostGraceChord.pageX()
                }
            }
        }

        const offset = Math.max(graceOffset, clefOffset)

        const x = segment!.x() + segment!.measure().x() - line.spatium() - offset
        return { pos: new PointF(x, 0.0), system: segment!.measure().system() }
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        return Trill.trillLinePos(this, grip)
    }

    trillType(): TrillType { return this.m_trillType }

    setTrillType(tt: TrillType): void {
        this.m_trillType = tt
        if (!this.m_ornament) {
            // ornament parent will be explicitely set at layout stage
            // (C++ uses the dummy chord as parent; the trill is used here for the score/style)
            this.m_ornament = new Ornament(this)
        }
        this.m_ornament.setTrack(this.track())
        this.m_ornament.setSymId(Ornament.fromTrillType(tt))
    }

    ornament(): Ornament | null { return this.m_ornament }
    setOrnament(o: Ornament | null): void { this.m_ornament = o }
    accidental(): Accidental | null { return this.m_accidental }
    setAccidental(a: Accidental | null): void { this.m_accidental = a }
    cueNoteChord(): Chord | null { return this.m_cueNoteChord }
    setCueNoteChord(c: Chord | null): void { this.m_cueNoteChord = c }
    ornamentStyle(): OrnamentStyle { return this.m_ornamentStyle }
    setOrnamentStyle(val: OrnamentStyle): void { this.m_ornamentStyle = val }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new TrillSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.lineColor())
        seg.initElementStyle(trillSegmentStyle)
        return seg
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TRILL_TYPE:
            return this.trillType()
        case Pid.ORNAMENT_STYLE:
            return this.ornamentStyle()
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.TRILL_TYPE:
            this.setTrillType(val as TrillType)
            break
        case Pid.ORNAMENT_STYLE:
            this.setOrnamentStyle(val as OrnamentStyle)
            break
        case Pid.COLOR:
            this.setColor(val as Color)
            this.setLineColor(val as Color)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.TRILL_TYPE:
            return TrillType.TRILL_LINE
        case Pid.ORNAMENT_STYLE:
            return OrnamentStyle.DEFAULT
        case Pid.PLACEMENT:
            return this.style().styleV(Sid.trillPlacement)
        default:
            return super.propertyDefault(propertyId)
        }
    }

    protected override doComputeEndElement(): void {
        this.setEndElement(this.score().findChordRestEndingBeforeTickInStaffAndVoice(this.tick2(), track2staff(this.track2()), true,
            this.voice()))
    }

    trillTypeUserName(): string {
        return TConv.translatedUserNameTrillType(this.trillType())
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameTrillType(this.trillType())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.trillTypeUserName()}`
    }
}
