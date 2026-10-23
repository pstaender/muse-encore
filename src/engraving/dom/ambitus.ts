/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/ambitus.h/.cpp
 * TODO(port): accessibleInfo, navigation
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import {
    ClefType, DirectionH, ElementType, Key, NoteHeadGroup, NoteHeadType, VOICES, type track_idx_t,
} from '../types/types'
import { AccidentalType } from './accidentaldata'
import { Accidental } from './accidental'
import { ElementFlag, EngravingItem, LayoutData } from './engravingitem'
import { Note } from './note'
import { Pid } from './property'
import {
    INVALID_PITCH, MAX_PITCH, PITCH_DELTA_OCTAVE, Prefer, Tpc, pitch2tpc, pitchIsValid, tpc2alter, tpc2pitch, tpcIsValid,
} from './pitchspelling'
import { absStep, relStep } from './utils'
import { SegmentType, type Segment } from './segment'
import type { Chord } from './chord'

export class AmbitusLayoutData extends LayoutData {
    topPos = new PointF() // position of top note symbol
    bottomPos = new PointF() // position of bottom note symbol
    line = new LineF() // the drawn line
}

interface Ranges {
    topTpc: number
    bottomTpc: number
    topPitch: number
    bottomPitch: number
}

export class Ambitus extends EngravingItem {
    static readonly NOTEHEADGROUP_DEFAULT = NoteHeadGroup.HEAD_NORMAL
    static readonly NOTEHEADTYPE_DEFAULT = NoteHeadType.HEAD_AUTO
    static readonly DIRECTION_DEFAULT = DirectionH.AUTO
    static readonly HASLINE_DEFAULT = true
    static readonly LINEWIDTH_DEFAULT = new Spatium(0.12)
    static readonly LINEOFFSET_DEFAULT = 0.8 // the distance between notehead and line

    private m_noteHeadGroup = Ambitus.NOTEHEADGROUP_DEFAULT
    private m_noteHeadType = Ambitus.NOTEHEADTYPE_DEFAULT
    private m_direction = Ambitus.DIRECTION_DEFAULT
    private m_hasLine = Ambitus.HASLINE_DEFAULT
    private m_lineWidth = Ambitus.LINEWIDTH_DEFAULT
    private m_topAccidental: Accidental
    private m_bottomAccidental: Accidental
    private m_topPitch = INVALID_PITCH
    private m_bottomPitch = INVALID_PITCH
    private m_topTpc: number = Tpc.TPC_INVALID
    private m_bottomTpc: number = Tpc.TPC_INVALID

    constructor(parent: Segment | null) {
        super(ElementType.AMBITUS, parent, ElementFlag.ON_STAFF)
        this.m_topAccidental = new Accidental(this)
        this.m_bottomAccidental = new Accidental(this)
        this.m_topAccidental.setParent(this)
        this.m_bottomAccidental.setParent(this)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_topAccidental = original.m_topAccidental.clone() as Accidental
        this.m_topAccidental.setParent(this)
        this.m_bottomAccidental = original.m_bottomAccidental.clone() as Accidental
        this.m_bottomAccidental.setParent(this)
    }

    protected override createLayoutData(): AmbitusLayoutData { return new AmbitusLayoutData(this) }
    override ldata(): AmbitusLayoutData { return super.ldata() as AmbitusLayoutData }
    override mutldata(): AmbitusLayoutData { return super.ldata() as AmbitusLayoutData }

    override mag(): number {
        return this.staff() ? this.staff()!.staffMag(this.tick()) : 1.0
    }

    initFrom(a: Ambitus): void {
        this.m_noteHeadGroup = a.m_noteHeadGroup
        this.m_noteHeadType = a.m_noteHeadType
        this.m_direction = a.m_direction
        this.m_hasLine = a.m_hasLine
        this.m_lineWidth = a.m_lineWidth
        this.m_topPitch = a.m_topPitch
        this.m_bottomPitch = a.m_bottomPitch
        this.m_topTpc = a.m_topTpc
        this.m_bottomTpc = a.m_bottomTpc
    }

    // getters and setters
    noteHeadGroup(): NoteHeadGroup { return this.m_noteHeadGroup }
    noteHeadType(): NoteHeadType { return this.m_noteHeadType }
    direction(): DirectionH { return this.m_direction }
    hasLine(): boolean { return this.m_hasLine }
    lineWidth(): Spatium { return this.m_lineWidth }
    topOctave(): number { return Math.trunc(this.m_topPitch / PITCH_DELTA_OCTAVE) - 1 }
    bottomOctave(): number { return Math.trunc(this.m_bottomPitch / PITCH_DELTA_OCTAVE) - 1 }
    topPitch(): number { return this.m_topPitch }
    bottomPitch(): number { return this.m_bottomPitch }
    topTpc(): number { return this.m_topTpc }
    bottomTpc(): number { return this.m_bottomTpc }

    topAccidental(): Accidental { return this.m_topAccidental }
    bottomAccidental(): Accidental { return this.m_bottomAccidental }

    setNoteHeadGroup(val: NoteHeadGroup): void { this.m_noteHeadGroup = val }
    setNoteHeadType(val: NoteHeadType): void { this.m_noteHeadType = val }
    setDirection(val: DirectionH): void { this.m_direction = val }
    setHasLine(val: boolean): void { this.m_hasLine = val }
    setLineWidth(val: Spatium): void { this.m_lineWidth = val }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    // ---------------------------------------------------------
    //   setTrack
    //    when the Ambitus element is assigned a track,
    //    initialize top and bottom 'notes' to top and bottom staff lines
    // ---------------------------------------------------------

    override setTrack(t: track_idx_t): void {
        super.setTrack(t)
        // if not initialized and there is a segment and a staff,
        // initialize pitches and tpc's to first and last staff line
        // (for use in palettes)
        if (!pitchIsValid(this.m_topPitch) || !tpcIsValid(this.m_topTpc)
            || !pitchIsValid(this.m_bottomPitch) || !tpcIsValid(this.m_bottomTpc)) {
            if (this.explicitParent() && this.staff()) {
                const ranges = this.estimateRanges()
                this.m_topTpc = ranges.topTpc
                this.m_bottomTpc = ranges.bottomTpc
                this.m_topPitch = ranges.topPitch
                this.m_bottomPitch = ranges.bottomPitch
                this.m_topAccidental.setTrack(t)
                this.m_bottomAccidental.setTrack(t)
            }
        }
    }

    // ---------------------------------------------------------
    //   setTop/BottomPitch
    //    setting either pitch requires to adjust the corresponding tpc
    // ---------------------------------------------------------

    setTopPitch(val: number, applyLogic = true): void {
        if (!applyLogic) {
            this.m_topPitch = val
            return
        }
        // if pitch difference is not an integer number of octaves, adjust tpc
        // (to avoid 'wild' tpc changes with octave changes)
        if ((val - this.topPitch()) % PITCH_DELTA_OCTAVE !== 0) {
            const key = (this.staff() && this.explicitParent()) ? this.staff()!.key(this.segment().tick()) : Key.C
            this.m_topTpc = pitch2tpc(val, key, Prefer.NEAREST)
        }
        this.m_topPitch = val
        this.normalize()
    }

    setBottomPitch(val: number, applyLogic = true): void {
        if (!applyLogic) {
            this.m_bottomPitch = val
            return
        }
        if ((val - this.bottomPitch()) % PITCH_DELTA_OCTAVE !== 0) {
            const key = (this.staff() && this.explicitParent()) ? this.staff()!.key(this.segment().tick()) : Key.C
            this.m_bottomTpc = pitch2tpc(val, key, Prefer.NEAREST)
        }
        this.m_bottomPitch = val
        this.normalize()
    }

    // ---------------------------------------------------------
    //   setTop/BottomTpc
    //    setting either tpc requires to adjust the corresponding pitch
    //    (but remaining in the same octave)
    // ---------------------------------------------------------

    setTopTpc(val: number, applyLogic = true): void {
        this.m_topTpc = val
        if (!applyLogic) {
            return
        }
        const octave = Math.trunc(this.topPitch() / PITCH_DELTA_OCTAVE)
        const newOctavedPitch = (tpc2pitch(val) + PITCH_DELTA_OCTAVE) % PITCH_DELTA_OCTAVE
        this.m_topPitch = (octave * PITCH_DELTA_OCTAVE) + newOctavedPitch
        this.normalize()
    }

    setBottomTpc(val: number, applyLogic = true): void {
        this.m_bottomTpc = val
        if (!applyLogic) {
            return
        }
        const octave = Math.trunc(this.bottomPitch() / PITCH_DELTA_OCTAVE)
        const newOctavedPitch = (tpc2pitch(val) + PITCH_DELTA_OCTAVE) % PITCH_DELTA_OCTAVE
        this.m_bottomPitch = (octave * PITCH_DELTA_OCTAVE) + newOctavedPitch
        this.normalize()
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        if (this.m_topAccidental.accidentalType() !== AccidentalType.NONE) {
            func(this.m_topAccidental)
        }
        if (this.m_bottomAccidental.accidentalType() !== AccidentalType.NONE) {
            func(this.m_bottomAccidental)
        }
    }

    noteHead(): SymId {
        const hg = 1
        let ht = NoteHeadType.HEAD_QUARTER
        if (this.m_noteHeadType !== NoteHeadType.HEAD_AUTO) {
            ht = this.m_noteHeadType
        }
        let t = Note.noteHeadSym(hg, this.m_noteHeadGroup, ht)
        if (t === SymId.noSym) {
            t = Note.noteHeadSym(0, NoteHeadGroup.HEAD_NORMAL, ht)
        }
        return t
    }

    /** returns the width of the notehead symbol */
    headWidth(): number {
        return this.symWidth(this.noteHead())
    }

    /** makes sure topPitch is not < bottomPitch */
    private normalize(): void {
        if (this.m_topPitch < this.m_bottomPitch) {
            [this.m_topPitch, this.m_bottomPitch] = [this.m_bottomPitch, this.m_topPitch];
            [this.m_topTpc, this.m_bottomTpc] = [this.m_bottomTpc, this.m_topTpc]
        }
    }

    /** scans the staff contents up to next section break to update the range pitches/tpc's */
    private estimateRanges(): Ranges {
        const result: Ranges = { topTpc: Tpc.TPC_INVALID, bottomTpc: Tpc.TPC_INVALID, topPitch: INVALID_PITCH, bottomPitch: MAX_PITCH + 1 }
        let s = this.explicitParent() ? this.segment().measure()!.findSegment(SegmentType.ChordRest, this.segment().tick()) : null
        for (; s && !s.measure()!.sectionBreak(); s = s.nextCR()) {
            for (let t = this.track(); t < this.track() + VOICES; t++) {
                const e = s.element(t)
                if (!e || !e.isChord()) {
                    continue
                }
                const chord = e as unknown as Chord
                for (const n of chord.notes()) {
                    if (!n.play()) {
                        continue
                    }
                    const pitch = n.epitch() + n.ottaveCapoFret() // written pitch, accounting for octave offset
                    if (pitch > result.topPitch) {
                        result.topPitch = pitch
                        result.topTpc = n.tpc()
                    }
                    if (pitch < result.bottomPitch) {
                        result.bottomPitch = pitch
                        result.bottomTpc = n.tpc()
                    }
                }
            }
        }
        return result
    }

    override remove(e: EngravingItem): void {
        if (e.isAccidental()) {
            //! NOTE Do nothing (removing _topAccid or _bottomAccid)
            return
        }
        super.remove(e)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.HEAD_GROUP:
            return this.noteHeadGroup()
        case Pid.HEAD_TYPE:
            return this.noteHeadType()
        case Pid.MIRROR_HEAD:
            return this.direction()
        case Pid.GHOST: // recycled property = _hasLine
            return this.hasLine()
        case Pid.LINE_WIDTH:
            return this.lineWidth()
        case Pid.TPC1:
            return this.topTpc()
        case Pid.FBPARENTHESIS1: // recycled property = _bottomTpc
            return this.bottomTpc()
        case Pid.PITCH:
            return this.topPitch()
        case Pid.FBPARENTHESIS2: // recycled property = _bottomPitch
            return this.bottomPitch()
        case Pid.FBPARENTHESIS3: // recycled property = octave of _topPitch
            return this.topOctave()
        case Pid.FBPARENTHESIS4: // recycled property = octave of _bottomPitch
            return this.bottomOctave()
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.HEAD_GROUP:
            this.setNoteHeadGroup(v as NoteHeadGroup)
            break
        case Pid.HEAD_TYPE:
            this.setNoteHeadType(v as NoteHeadType)
            break
        case Pid.MIRROR_HEAD:
            this.setDirection(v as DirectionH)
            break
        case Pid.GHOST: // recycled property = _hasLine
            this.setHasLine(!!v)
            break
        case Pid.LINE_WIDTH:
            this.setLineWidth(v instanceof Spatium ? v : new Spatium(v as number))
            break
        case Pid.TPC1:
            this.setTopTpc(v as number)
            break
        case Pid.FBPARENTHESIS1: // recycled property = _bottomTpc
            this.setBottomTpc(v as number)
            break
        case Pid.PITCH:
            this.setTopPitch(v as number)
            break
        case Pid.FBPARENTHESIS2: // recycled property = _bottomPitch
            this.setBottomPitch(v as number)
            break
        case Pid.FBPARENTHESIS3: // recycled property = octave of _topPitch
            this.setTopPitch(this.topPitch() % PITCH_DELTA_OCTAVE + ((v as number) + 1) * PITCH_DELTA_OCTAVE)
            break
        case Pid.FBPARENTHESIS4: // recycled property = octave of _bottomPitch
            this.setBottomPitch(this.bottomPitch() % PITCH_DELTA_OCTAVE + ((v as number) + 1) * PITCH_DELTA_OCTAVE)
            break
        case Pid.COLOR:
        case Pid.VISIBLE:
            this.m_topAccidental.setProperty(propertyId, v)
            this.m_bottomAccidental.setProperty(propertyId, v)
            super.setProperty(propertyId, v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.HEAD_GROUP:
            return Ambitus.NOTEHEADGROUP_DEFAULT
        case Pid.HEAD_TYPE:
            return Ambitus.NOTEHEADTYPE_DEFAULT
        case Pid.MIRROR_HEAD:
            return Ambitus.DIRECTION_DEFAULT
        case Pid.GHOST:
            return Ambitus.HASLINE_DEFAULT
        case Pid.LINE_WIDTH:
            return Ambitus.LINEWIDTH_DEFAULT
        case Pid.TPC1:
            return this.estimateRanges().topTpc
        case Pid.FBPARENTHESIS1:
            return this.estimateRanges().bottomTpc
        case Pid.PITCH:
            return this.estimateRanges().topPitch
        case Pid.FBPARENTHESIS2:
            return this.estimateRanges().bottomPitch
        case Pid.FBPARENTHESIS3:
            return Math.trunc(this.estimateRanges().topPitch / PITCH_DELTA_OCTAVE) - 1
        case Pid.FBPARENTHESIS4:
            return Math.trunc(this.estimateRanges().bottomPitch / PITCH_DELTA_OCTAVE) - 1
        default:
            return super.propertyDefault(id)
        }
    }

    static accidentalType(tpc: number, key: Key): AccidentalType {
        let accidType = AccidentalType.NONE
        // if (13 <= (tpc - key) <= 19) there is no accidental)
        if (tpc - key >= 13 && tpc - key <= 19) {
            accidType = AccidentalType.NONE
        } else {
            const accidVal = tpc2alter(tpc)
            accidType = Accidental.value2subtype(accidVal)
            if (accidType === AccidentalType.NONE) {
                accidType = AccidentalType.NATURAL
            }
        }
        return accidType
    }

    static staffLine(tpc: number, pitch: number, clf: ClefType): number {
        let line = absStep(tpc, pitch)
        line = relStep(line, clf)
        return line
    }
}
