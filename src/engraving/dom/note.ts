/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/note.h/.cpp
 *
 * TODO(port): tablature frets, drumsets, guitar bends, jump points, editing/dragging
 */

import { NoteEvent } from './noteevent'
import { NoteVal } from './input'
import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SmuflAnchorId, SymId } from '../types/symid'
import {
    AccidentalRole, AccidentalVal, DirectionH, DirectionV, ElementType, GuitarBendType, Key, NoteHeadGroup, NoteHeadScheme, NoteHeadType,
    INVALID_FRET_INDEX, INVALID_STRING_INDEX, ParenthesesMode, VeloType, VOICES, type track_idx_t,
} from '../types/types'
import { RealIsEqual, RealIsNull } from '../../framework/global/realfn'
import { Sid } from '../style/styledef'
import { TConv } from '../types/typesconv'
import { Transpose } from '../editing/transpose'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { Pid } from './property'
import { Interval } from './interval'
import { NOTE_HEADS } from './noteheadsdata'
import {
    Prefer, STEP_DELTA_OCTAVE, TPC_DELTA_SEMITONE, Tpc, absStep2pitchByKey, clampEnharmonic, clampPitch, pitch2absStepByKey, pitch2tpc,
    pitchIsValid, step2tpcByKey, tpc2alter, tpc2alterByKey, tpc2degree, tpc2pitch, tpc2stepName, tpcIsValid, tpcUserName as tpcUserNameOf,
} from './pitchspelling'
import { absStep, relStep } from './utils'
import { NoteType, type ChordRest } from './chordrest'
import { BagpipeEmbellishment } from './bagpembell'
import { Constants } from '../types/constants'
import { KeyboardModifier, type EditData } from '../editing/editdata'
import type { Chord, NoteParenthesisInfo } from './chord'
import type { NoteDot } from './notedot'
import type { Accidental, AccidentalType } from './accidental'
import type { AccidentalState } from './key'
import type { Spanner } from './spanner'
import type { Tie } from './tie'
import type { GuitarBend } from './guitarbend'
import { FontMetrics } from '../../framework/draw/fontmetrics'
import { ParenthesizeTiedFret, ShowTiedFret, type StaffType } from './stafftype'
import { arg, mtrc } from '../../framework/global/translation'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
// (imports of the drag section)
import { RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { lrint } from '../../framework/global/realfn'
import { absStepFromLine, step2pitch } from './utils'
import { step2tpc } from './pitchspelling'
import { ElementEditData, EditDataType } from '../editing/elementeditdata'

export const INVALID_LINE = -10000

/** factories registered by the corresponding modules (avoid runtime import cycles) */
export const noteFactories: {
    createNoteDot?: (note: Note) => NoteDot
    createAccidental?: (note: Note) => Accidental
    accidental?: {
        subtype2centOffset(t: AccidentalType): number
        centOffset2Subtype(c: number): AccidentalType
        value2subtype(v: AccidentalVal): AccidentalType
        value2MicrotonalSubtype(v: AccidentalVal, quarterToneOffset: number): AccidentalType
        subtype2value(t: AccidentalType): AccidentalVal
        isMicrotonal(t: AccidentalType): boolean
        NONE: AccidentalType
        NATURAL: AccidentalType
    }
} = {}

export enum SlideType {
    Undefined = 0,
    UpToNote,
    DownToNote,
    UpFromNote,
    DownFromNote,
}

export enum DisplayFretOption {
    Hide = -1,
    NoHarmonic,
    NaturalHarmonic,
    ArtificialHarmonic,
}

// LINE ATTACHMENT POINT
// Represents the attachment point of any line (tie, slur, glissando...)
// with respect to the note. Each note can hold a vector of line attach points, which
// it may use to make spacing decision with the surrounding items.
export class LineAttachPoint {
    private m_pos: PointF

    constructor(private m_line: EngravingItem, x: number, y: number, private m_start: boolean) {
        this.m_pos = new PointF(x, y)
    }

    line(): EngravingItem { return this.m_line }
    pos(): PointF { return this.m_pos.clone() }
    start(): boolean { return this.m_start }
}

/** set by editing/editchord.ts (C++ EditChord::addChordParentheses; avoids an import cycle) */
export const noteParenthesesHooks: {
    addChordParentheses?: (chord: Chord, notes: Note[], addToLinked: boolean, generated: boolean) => void
    removeChordParentheses?: (chord: Chord, notes: Note[], addToLinked: boolean, generated: boolean) => void
} = {}

export class NoteLayoutData extends LayoutData {
    useTablature = false
    cachedNoteheadSym: SymId = SymId.noSym // use in draw to avoid recomputing at every update
    cachedSymNull: SymId = SymId.noSym // additional symbol for some transparent notehead
    mirror = false // True if note is mirrored at stem.
    hasGeneratedParens = false
}

export class Note extends EngravingItem {
    private m_ghost = false
    private m_overrideBendVisibilityRules = false
    private m_deadNote = false
    private m_isTrillCueNote = false
    private m_hidden = false // marks this note as the hidden one if there are overlapping notes
    private m_dotsHidden = false
    private m_lineAttachPoints: LineAttachPoint[] = []
    private m_fretConflict = false
    private m_isSmall = false
    private m_play = true
    private m_fixed = false // for slash notation
    private m_hideGeneratedParens = false
    private m_slideToType = SlideType.Undefined
    private m_slideFromType = SlideType.Undefined

    private m_userMirror: DirectionH = DirectionH.AUTO
    private m_userDotPosition: DirectionV = DirectionV.AUTO
    private m_dotPosition: DirectionV = DirectionV.AUTO // used as an intermediate step when resolving dot conflicts

    private m_headScheme: NoteHeadScheme = NoteHeadScheme.HEAD_AUTO
    private m_headGroup: NoteHeadGroup = NoteHeadGroup.HEAD_NORMAL
    private m_headType: NoteHeadType = NoteHeadType.HEAD_AUTO
    private m_veloType: VeloType = VeloType.USER_VAL

    private m_offTimeType = 0
    private m_onTimeType = 0
    private m_subchannel = 0
    private m_line = INVALID_LINE // y-Position; 0 - top line.
    private m_fret = -1 // for tablature view
    private m_harmonicFret = -1.0
    private m_displayFret = DisplayFretOption.NoHarmonic
    private m_string = -1
    private m_tpc: [number, number] = [Tpc.TPC_INVALID, Tpc.TPC_INVALID] // tonal pitch class (concert/transposing)
    private m_pitch = 0 // Note pitch as midi value (0 - 127).
    private m_centOffset = 0.0
    private m_userVelocity = 0
    private m_fixedLine = 0
    private m_tuning = 0.0

    private m_accidental: Accidental | null = null
    private m_tieFor: Tie | null = null
    private m_tieBack: Tie | null = null
    private m_harmonic = false
    private m_hasParens = false

    private m_el: EngravingItem[] = [] // fingering, other text, symbols or images
    private m_playEvents: NoteEvent[] = [new NoteEvent()] // add default play event
    private m_dots: NoteDot[] = []
    private m_spannerFor: Spanner[] = []
    private m_spannerBack: Spanner[] = []
    private m_fretString = ''

    constructor(parent: Chord | null) {
        super(ElementType.NOTE, parent, ElementFlag.MOVABLE)
    }

    /** C++ copy constructor: accidental, attached elements, dots and outgoing ties are copied, other links are not */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_accidental = null
        this.m_el = []
        this.m_dots = []
        this.m_playEvents = original.m_playEvents.map(e => e.clone())
        this.m_tieFor = null
        this.m_tieBack = null
        this.m_spannerFor = []
        this.m_spannerBack = []

        if (original.m_accidental) {
            this.add(original.m_accidental.clone())
        }

        // types in m_el: SYMBOL, IMAGE, FINGERING, TEXT, BEND
        const stf = this.staff()
        const tabFingering = stf ? stf.staffTypeForElement(this).showTabFingering() : false
        for (const e of original.m_el) {
            if (e.isFingering() && stf && stf.isTabStaff(this.tick()) && !tabFingering) { // tablature has no fingering
                continue
            }
            this.add(e.clone())
        }

        if (original.laissezVib() || original.outgoingPartialTie()) {
            const t = original.m_tieFor!.clone() as Tie
            t.setParent(this)
            t.setStartNote(this)
            t.setTick(this.tick())
            this.setTieFor(t)
        } else if (original.m_tieFor) {
            const t = original.m_tieFor.clone() as Tie
            t.setStartNote(this)
            t.setTick(this.tick())
            t.setEndNote(null)
            this.m_tieFor = t
        }

        if (original.incomingPartialTie()) {
            const t = original.m_tieBack!.clone() as Tie
            t.setParent(this)
            t.setEndNote(this)
            t.setTick(this.tick())
            this.setTieBack(t)
        }

        for (const dot of original.m_dots) {
            this.add(dot.clone())
        }
    }

    protected override createLayoutData(): NoteLayoutData { return new NoteLayoutData(this) }
    override ldata(): NoteLayoutData { return super.ldata() as NoteLayoutData }
    override mutldata(): NoteLayoutData { return super.ldata() as NoteLayoutData }

    chord(): Chord { return this.explicitParent() as unknown as Chord }

    override mag(): number {
        const ch = this.explicitParent() ? this.chord() : null
        let m = ch ? ch.mag() : 1.0
        if (this.m_isSmall) {
            m *= this.style().styleD(Sid.smallNoteMag)
        }
        return m
    }

    override elementBase(): EngravingItem { return this.parentItem()! }

    // ---------------------------------------------------------
    //   noteHead
    // ---------------------------------------------------------

    static noteHeadSym(direction: number, group: NoteHeadGroup, t: NoteHeadType, tpc?: number, key: Key = Key.C,
                       scheme: NoteHeadScheme = NoteHeadScheme.HEAD_NORMAL): SymId {
        if (tpc === undefined || scheme === NoteHeadScheme.HEAD_NORMAL) {
            return NOTE_HEADS[direction][group][t]
        }
        if (scheme === NoteHeadScheme.HEAD_PITCHNAME || scheme === NoteHeadScheme.HEAD_PITCHNAME_GERMAN
            || scheme === NoteHeadScheme.HEAD_PITCHNAME_NO_ACCIDENTALS
            || scheme === NoteHeadScheme.HEAD_PITCHNAME_GERMAN_NO_ACCIDENTALS) {
            const noAcc = scheme === NoteHeadScheme.HEAD_PITCHNAME_NO_ACCIDENTALS
                          || scheme === NoteHeadScheme.HEAD_PITCHNAME_GERMAN_NO_ACCIDENTALS
            const german = scheme === NoteHeadScheme.HEAD_PITCHNAME_GERMAN
                           || scheme === NoteHeadScheme.HEAD_PITCHNAME_GERMAN_NO_ACCIDENTALS
            const G = NoteHeadGroup
            const table: Partial<Record<number, NoteHeadGroup>> = {
                [Tpc.TPC_A]: G.HEAD_A,
                [Tpc.TPC_B]: german ? G.HEAD_H : G.HEAD_B,
                [Tpc.TPC_C]: G.HEAD_C,
                [Tpc.TPC_D]: G.HEAD_D,
                [Tpc.TPC_E]: G.HEAD_E,
                [Tpc.TPC_F]: G.HEAD_F,
                [Tpc.TPC_G]: G.HEAD_G,
                [Tpc.TPC_A_S]: noAcc ? G.HEAD_A : G.HEAD_A_SHARP,
                [Tpc.TPC_B_S]: noAcc ? (german ? G.HEAD_H : G.HEAD_B) : (german ? G.HEAD_H_SHARP : G.HEAD_B_SHARP),
                [Tpc.TPC_C_S]: noAcc ? G.HEAD_C : G.HEAD_C_SHARP,
                [Tpc.TPC_D_S]: noAcc ? G.HEAD_D : G.HEAD_D_SHARP,
                [Tpc.TPC_E_S]: noAcc ? G.HEAD_E : G.HEAD_E_SHARP,
                [Tpc.TPC_F_S]: noAcc ? G.HEAD_F : G.HEAD_F_SHARP,
                [Tpc.TPC_G_S]: noAcc ? G.HEAD_G : G.HEAD_G_SHARP,
                [Tpc.TPC_A_B]: noAcc ? G.HEAD_A : G.HEAD_A_FLAT,
                [Tpc.TPC_B_B]: noAcc ? G.HEAD_B : (german ? G.HEAD_B : G.HEAD_B_FLAT),
                [Tpc.TPC_C_B]: noAcc ? G.HEAD_C : G.HEAD_C_FLAT,
                [Tpc.TPC_D_B]: noAcc ? G.HEAD_D : G.HEAD_D_FLAT,
                [Tpc.TPC_E_B]: noAcc ? G.HEAD_E : G.HEAD_E_FLAT,
                [Tpc.TPC_F_B]: noAcc ? G.HEAD_F : G.HEAD_F_FLAT,
                [Tpc.TPC_G_B]: noAcc ? G.HEAD_G : G.HEAD_G_FLAT,
            }
            group = table[tpc] ?? group
        } else if (scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_4) {
            switch (tpc2degree(tpc, key)) {
            case 0:
            case 3:
                group = NoteHeadGroup.HEAD_FA
                break
            case 1:
            case 4:
                group = NoteHeadGroup.HEAD_SOL
                break
            case 2:
            case 5:
                group = NoteHeadGroup.HEAD_LA
                break
            case 6:
                group = NoteHeadGroup.HEAD_MI
                break
            }
        } else if (scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN
                   || scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_7_FUNK
                   || scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_7_WALKER) {
            const pick = (aikin: NoteHeadGroup, funk: NoteHeadGroup, walker: NoteHeadGroup): NoteHeadGroup =>
                scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN ? aikin
                : (scheme === NoteHeadScheme.HEAD_SHAPE_NOTE_7_FUNK ? funk : walker)
            switch (tpc2degree(tpc, key)) {
            case 0: group = pick(NoteHeadGroup.HEAD_DO, NoteHeadGroup.HEAD_DO_FUNK, NoteHeadGroup.HEAD_DO_WALKER); break
            case 1: group = pick(NoteHeadGroup.HEAD_RE, NoteHeadGroup.HEAD_RE_FUNK, NoteHeadGroup.HEAD_RE_WALKER); break
            case 2: group = NoteHeadGroup.HEAD_MI; break
            case 3: group = NoteHeadGroup.HEAD_FA; break
            case 4: group = NoteHeadGroup.HEAD_SOL; break
            case 5: group = NoteHeadGroup.HEAD_LA; break
            case 6: group = pick(NoteHeadGroup.HEAD_TI, NoteHeadGroup.HEAD_TI_FUNK, NoteHeadGroup.HEAD_TI_WALKER); break
            }
        } else if (scheme === NoteHeadScheme.HEAD_SOLFEGE) {
            const degree = tpc2degree(tpc, key)
            const alteration = tpc2alterByKey(tpc, key)
            const G = NoteHeadGroup
            const table: Record<string, NoteHeadGroup> = {
                '0,0': G.HEAD_DO_NAME, '0,1': G.HEAD_DI_NAME,
                '1,-1': G.HEAD_RA_NAME, '1,0': G.HEAD_RE_NAME, '1,1': G.HEAD_RI_NAME,
                '2,-1': G.HEAD_ME_NAME, '2,0': G.HEAD_MI_NAME,
                '3,0': G.HEAD_FA_NAME, '3,1': G.HEAD_FI_NAME,
                '4,-1': G.HEAD_SE_NAME, '4,0': G.HEAD_SOL_NAME, '4,1': G.HEAD_SI_NAME,
                '5,-1': G.HEAD_LE_NAME, '5,0': G.HEAD_LA_NAME, '5,1': G.HEAD_LI_NAME,
                '6,-1': G.HEAD_TE_NAME, '6,0': G.HEAD_TI_NAME,
            }
            group = table[`${degree},${alteration}`] ?? group
        } else if (scheme === NoteHeadScheme.HEAD_SOLFEGE_FIXED) {
            const G = NoteHeadGroup
            const table: Record<string, NoteHeadGroup> = {
                C: G.HEAD_DO_NAME, D: G.HEAD_RE_NAME, E: G.HEAD_MI_NAME, F: G.HEAD_FA_NAME,
                G: G.HEAD_SOL_NAME, A: G.HEAD_LA_NAME, B: G.HEAD_SI_NAME,
            }
            group = table[tpc2stepName(tpc)] ?? group
        }
        return NOTE_HEADS[direction][group][t]
    }

    noteHead(): SymId {
        let up: number
        let ht: NoteHeadType
        const ch = this.explicitParent() ? this.chord() : null
        if (ch) {
            up = ch.up() ? 1 : 0
            ht = ch.durationType().headType()
        } else {
            up = 1
            ht = NoteHeadType.HEAD_QUARTER
        }
        if (this.m_headType !== NoteHeadType.HEAD_AUTO) {
            ht = this.m_headType
        }

        const st = ch ? ch.staff() : null
        let headGroup = this.m_headGroup
        if (this.m_headGroup === NoteHeadGroup.HEAD_CUSTOM) {
            if (st) {
                if (st.staffTypeForElement(ch!).isDrumStaff()) {
                    const d = st.part().instrument(ch!.tick()).drumset()
                    if (d) {
                        return d.noteHeads(this.m_pitch, ht)
                    }
                    return Note.noteHeadSym(up, NoteHeadGroup.HEAD_NORMAL, ht)
                }
                headGroup = NoteHeadGroup.HEAD_NORMAL
            } else {
                return this.ldata().cachedNoteheadSym
            }
        }

        let key = Key.C
        let scheme = this.m_headScheme
        if (st) {
            const tick = ch!.tick()
            if (tick.ge(new Fraction(0, 1))) {
                key = st.key(tick)
                if (scheme === NoteHeadScheme.HEAD_AUTO) {
                    scheme = st.staffTypeForElement(ch!).noteHeadScheme()
                }
            }
        }
        if (scheme === NoteHeadScheme.HEAD_AUTO) {
            scheme = NoteHeadScheme.HEAD_NORMAL
        }
        let t = Note.noteHeadSym(up, headGroup, ht, this.tpc(), key, scheme)
        if (t === SymId.noSym) {
            t = Note.noteHeadSym(up, NoteHeadGroup.HEAD_NORMAL, ht)
        }
        return t
    }

    headWidth(): number { return this.symWidth(this.noteHead()) }
    headHeight(): number { return this.symHeight(this.noteHead()) }

    tabHeadWidth(tab: StaffType | null = null): number {
        let val: number
        if (tab && tab.isTabStaff() && this.m_fret !== INVALID_FRET_INDEX && this.m_string !== INVALID_STRING_INDEX) {
            const f = tab.fretFont().clone()
            f.setPointSizeF(tab.fretFontSize())
            val = FontMetrics.width(f, this.m_fretString) * this.magS()
        } else {
            val = this.headWidth()
        }
        return val
    }

    tabHeadHeight(tab: StaffType | null = null): number {
        if (tab && this.m_fret !== INVALID_FRET_INDEX && this.m_string !== INVALID_STRING_INDEX) {
            return tab.fretBoxH() * this.magS()
        }
        return this.headHeight()
    }

    stemDownNW(): PointF { return this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.stemDownNW) }
    stemUpSE(): PointF { return this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.stemUpSE) }

    bboxXShift(): number {
        const bbox = this.score().engravingFont().bbox(this.noteHead(), this.magS())
        return bbox.bottomLeft().x()
    }

    noteheadCenterX(): number {
        return this.score().engravingFont().width(this.noteHead(), this.magS()) / 2 + this.bboxXShift()
    }

    bboxRightPos(): number {
        const bbox = this.score().engravingFont().bbox(this.noteHead(), this.magS())
        return bbox.right()
    }

    headBodyWidth(): number {
        const st = this.staffType()
        if (st && st.isTabStaff()) {
            return this.tabHeadWidth(st)
        }
        return this.headWidth() + 2 * this.bboxXShift()
    }

    outsideTieAttachX(up: boolean): number {
        let xo = 0
        if (this.staffType()!.isTabStaff()) {
            return this.x() + ((this.width() / 2) * this.mag())
        }
        if (this.m_headGroup === NoteHeadGroup.HEAD_SLASH) {
            xo = up ? this.headWidth() * 0.75 : this.headWidth() * 0.25
            if (this.chord().durationType().hasStem()) {
                xo += this.spatium() * 0.13 * (this.chord().up() ? -this.mag() : this.mag())
            }
            return this.x() + xo
        }
        if (this.m_headGroup === NoteHeadGroup.HEAD_SLASHED1 || this.m_headGroup === NoteHeadGroup.HEAD_SLASHED2) {
            return this.x() + ((this.headBodyWidth() / 2) * this.mag())
        }
        if (up) {
            const xNE = this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.cutOutNE).x()
            const xNW = this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.cutOutNW).x()
            xo = (xNE + xNW) / 2
            if (xNE < xNW) {
                xo = 0
            }
        } else {
            const xSE = this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.cutOutSE).x()
            const xSW = this.symSmuflAnchor(this.noteHead(), SmuflAnchorId.cutOutSW).x()
            xo = (xSE + xSW) / 2
            if (xSE < xSW) {
                xo = 0
            }
        }
        if (xo > 0) {
            return this.x() + xo
        }
        return this.x() + (this.headWidth() / 2)
    }

    headScheme(): NoteHeadScheme { return this.m_headScheme }
    headGroup(): NoteHeadGroup { return this.m_headGroup }
    headType(): NoteHeadType { return this.m_headType }
    setHeadScheme(val: NoteHeadScheme): void { this.m_headScheme = val }
    setHeadGroup(val: NoteHeadGroup): void { this.m_headGroup = val }
    setHeadType(t: NoteHeadType): void { this.m_headType = t }
    override subtype(): number { return this.m_headGroup }

    // ---------------------------------------------------------
    //   pitch
    // ---------------------------------------------------------

    pitch(): number { return this.m_pitch }
    setPitch(val: number, tpc1?: number, tpc2?: number): void {
        if (tpc1 !== undefined && tpc2 !== undefined) {
            this.m_tpc[0] = tpc1
            this.m_tpc[1] = tpc2
        }
        this.m_pitch = val
    }

    /** C++ Note::transposeDiatonic() (TODO(port): undo) */
    transposeDiatonic(interval: number, keepAlterations: boolean, useDoubleAccidentals: boolean): boolean {
        // compute note current absolute step
        const tick = this.chord().segment()!.tick()
        const key = this.staff() ? this.staff()!.key(tick) : Key.C
        const [absStep, alter] = pitch2absStepByKey(this.epitch(), this.tpc(), key)

        // get pitch and tcp corresponding to unaltered degree for this key
        let newPitch = absStep2pitchByKey(absStep + interval, key)
        let newTpc = step2tpcByKey((absStep + interval) % STEP_DELTA_OCTAVE, key)

        if (!pitchIsValid(newPitch)) {
            return false
        }

        // if required, transfer original degree alteration to new pitch and tpc
        if (keepAlterations) {
            newPitch += alter
            newTpc += alter * TPC_DELTA_SEMITONE
        }

        // transpose appropriately
        let newTpc1: number
        let newTpc2: number
        const v = this.staff() ? this.staff()!.transpose(tick).clone() : new Interval(0, 0)
        if (this.concertPitch()) {
            v.flip()
            newTpc1 = clampEnharmonic(newTpc, useDoubleAccidentals)
            newTpc2 = Transpose.transposeTpc(newTpc, v, useDoubleAccidentals)
        } else {
            newPitch += v.chromatic
            newTpc1 = Transpose.transposeTpc(newTpc, v, useDoubleAccidentals)
            newTpc2 = clampEnharmonic(newTpc, useDoubleAccidentals)
        }

        // check pitch is in range
        newPitch = clampPitch(newPitch, true)

        // store new data
        this.setPitch(newPitch, newTpc1, newTpc2)
        return true
    }

    /** C++ Note::transpose() (TODO(port): undo) */
    transpose(interval: Interval, useDoubleSharpsFlats: boolean): boolean {
        const npitch = this.pitch() + interval.chromatic
        if (!pitchIsValid(npitch)) {
            return false
        }
        const ntpc1 = Transpose.transposeTpc(this.tpc1(), interval, useDoubleSharpsFlats)
        let ntpc2 = ntpc1
        if (this.transposition()) {
            if (this.staff()) {
                const v = this.staff()!.transpose(this.tick()).clone()
                v.flip()
                ntpc2 = Transpose.transposeTpc(ntpc1, v, useDoubleSharpsFlats)
            } else {
                ntpc2 = Transpose.transposeTpc(this.tpc2(), interval, useDoubleSharpsFlats)
            }
        }
        this.setPitch(npitch, ntpc1, ntpc2)
        return true
    }

    centOffset(): number { return this.m_centOffset }
    setCentOffset(v: number): void { this.m_centOffset = v }
    quarterToneOffset(): number { return Math.round(this.m_centOffset / 50) }

    ottaveCapoFret(): number {
        // TODO(port): capo
        return this.staff()!.pitchOffset(this.chord().segment().tick())
    }

    /** if an ottava exists in another part but has been excluded from this one, this returns the corresponding pitch offset */
    linkedOttavaPitchOffset(): number {
        let linkedOttavaPitchOffset = 0
        const links = this.links()
        if (links && this.staff()!.pitchOffset(this.tick()) === 0) {
            for (const link of links) {
                const offset = (link as Note).staff()!.pitchOffset(this.tick())
                if (offset !== 0) {
                    linkedOttavaPitchOffset = offset
                    break
                }
            }
        }
        return linkedOttavaPitchOffset
    }

    /** playback pitch */
    ppitch(): number {
        return this.m_pitch + this.ottaveCapoFret() + this.linkedOttavaPitchOffset()
    }

    /** effective pitch */
    epitch(): number {
        return this.m_pitch - (this.concertPitch() ? 0 : this.transposition()) + this.linkedOttavaPitchOffset()
    }

    octave(): number {
        return Math.trunc((this.epitch() + this.ottaveCapoFret() - tpc2alter(this.tpc())) / 12) - 1
    }

    tuning(): number { return this.m_tuning }
    setTuning(v: number): void { this.m_tuning = v }

    transposition(): number {
        const tick = this.explicitParent() ? this.chord().tick() : new Fraction(-1, 1)
        return this.staff() ? this.part()!.instrument(tick).transpose().chromatic : 0
    }

    fixed(): boolean { return this.m_fixed }
    setFixed(v: boolean): void { this.m_fixed = v }
    fixedLine(): number { return this.m_fixedLine }
    setFixedLine(v: number): void { this.m_fixedLine = v }

    private concertPitchIdx(): number { return this.concertPitch() ? 0 : 1 }

    tpc(): number { return this.m_tpc[this.concertPitchIdx()] }
    tpc1(): number { return this.m_tpc[0] } // non transposed tpc
    tpc2(): number { return this.m_tpc[1] } // transposed tpc
    setTpc(v: number): void {
        if (tpcIsValid(v)) {
            this.m_tpc[this.concertPitchIdx()] = v
        }
    }
    setTpc1(v: number): void { this.m_tpc[0] = v }
    setTpc2(v: number): void { this.m_tpc[1] = v }

    setTpcFromPitch(prefer: Prefer = Prefer.NEAREST): void {
        const ch = this.explicitParent() ? this.chord() : null
        const tick = ch ? ch.tick() : new Fraction(-1, 1)
        const v = this.staff() ? this.staff()!.transpose(tick) : new Interval()
        const cKey = (this.staff() && ch) ? this.staff()!.concertKey(ch.tick()) : Key.C
        this.m_tpc[0] = pitch2tpc(this.m_pitch, cKey, prefer)
        if (v.isZero()) {
            this.m_tpc[1] = this.m_tpc[0]
        } else {
            v.flip()
            this.m_tpc[1] = Transpose.transposeTpc(this.m_tpc[0], v, true)
        }
    }

    transposeTpc(tpc: number): number {
        const tick = this.explicitParent() ? this.chord().tick() : new Fraction(-1, 1)
        const v = this.staff()!.transpose(tick)
        if (v.isZero()) {
            return tpc
        }
        if (this.concertPitch()) {
            v.flip()
        }
        return Transpose.transposeTpc(tpc, v, true)
    }

    tpc1default(p: number): number {
        let key = Key.C
        if (this.staff() && this.explicitParent()) {
            const tick = this.chord().tick()
            key = this.staff()!.concertKey(tick)
        }
        return pitch2tpc(p, key, Prefer.NEAREST)
    }

    tpc2default(p: number): number {
        let key = Key.C
        if (this.staff() && this.explicitParent()) {
            const tick = this.chord().tick()
            key = this.staff()!.key(tick)
            if (this.concertPitch()) {
                const interval = this.part()!.instrument(tick).transpose().clone()
                if (!interval.isZero()) {
                    interval.flip()
                    key = Transpose.transposeKey(key, interval)
                }
            }
        }
        return pitch2tpc(p - this.transposition(), key, Prefer.NEAREST)
    }

    setNval(nval: NoteVal, tick: Fraction = new Fraction(-1, 1)): void {
        this.setPitch(nval.pitch)
        this.m_userVelocity = nval.velocityOverride
        this.m_fret = nval.fret
        this.m_string = nval.string

        this.m_tpc[0] = nval.tpc1
        this.m_tpc[1] = nval.tpc2

        if (tick.eq(new Fraction(-1, 1)) && this.explicitParent()) {
            tick = this.chord().tick()
        }
        const v = this.staff()!.transpose(tick)
        if (nval.tpc1 === Tpc.TPC_INVALID) {
            if (nval.tpc2 === Tpc.TPC_INVALID) {
                const key = this.staff()!.concertKey(tick)
                this.m_tpc[0] = pitch2tpc(nval.pitch, key, Prefer.NEAREST)
            } else {
                if (v.isZero()) {
                    this.m_tpc[0] = this.m_tpc[1]
                } else {
                    this.m_tpc[0] = Transpose.transposeTpc(this.m_tpc[1], v, true)
                }
            }
        }
        if (nval.tpc2 === Tpc.TPC_INVALID) {
            if (v.isZero()) {
                this.m_tpc[1] = this.m_tpc[0]
            } else {
                v.flip()
                this.m_tpc[1] = Transpose.transposeTpc(this.m_tpc[0], v, true)
            }
        }

        this.m_headGroup = nval.headGroup
    }

    accidental(): Accidental | null { return this.m_accidental }
    setAccidental(a: Accidental | null): void { this.m_accidental = a }

    accidentalType(): AccidentalType {
        return this.m_accidental ? this.m_accidental.accidentalType() : noteFactories.accidental!.NONE
    }

    /** C++ calls Score::changeAccidental() (TODO(port): editing; only sets or removes the accidental here) */
    setAccidentalType(type: AccidentalType): void {
        if (type === noteFactories.accidental!.NONE) {
            if (this.m_accidental) {
                this.remove(this.m_accidental)
            }
            return
        }
        if (!this.m_accidental) {
            const a = noteFactories.createAccidental!(this)
            a.setParent(this)
            a.setTrack(this.track())
            this.add(a)
        }
        this.m_accidental!.setAccidentalType(type)
        this.m_accidental!.setRole(AccidentalRole.USER)
    }

    hasAnotherStraightAboveOrBelow(above: boolean): boolean {
        const chord = this.chord()
        if (!chord) {
            return false
        }
        const notes = chord.notes()
        if ((above && this === notes[notes.length - 1]) || (!above && this === notes[0])) {
            return false
        }
        const limitDiff = 0.5 * this.spatium()
        for (const note of notes) {
            if (note === this) {
                continue
            }
            if (Math.abs(note.pos().x() - this.pos().x()) > limitDiff) {
                return false
            }
            if ((above && note.line() < this.m_line) || (!above && note.line() > this.m_line)) {
                return true
            }
        }
        return false
    }

    line(): number { return this.fixed() ? this.m_fixedLine : this.m_line }
    setLine(n: number): void { this.m_line = n }

    fret(): number { return this.m_fret }
    setFret(val: number): void { this.m_fret = val }
    harmonicFret(): number { return this.m_harmonicFret }
    setHarmonicFret(val: number): void { this.m_harmonicFret = val }
    displayFret(): DisplayFretOption { return this.m_displayFret }
    setDisplayFret(val: DisplayFretOption): void { this.m_displayFret = val }
    fretString(): string { return this.m_fretString }
    setFretString(s: string): void { this.m_fretString = s }
    string(): number { return this.m_string }
    setString(val: number): void { this.m_string = val }
    isContinuationOfBend(): boolean {
        if (this.bendBack()) {
            return true
        }

        let tie = this.tieBack()
        let note: Note | null = null
        while (tie && tie.startNote()) {
            note = tie.startNote()!
            if (note.bendBack()) {
                return true
            }

            if (tie === note.tieBack()) {
                return false
            }

            tie = note.tieBack()
        }

        return false
    }

    isPreBendOrDiveStart(): boolean {
        if (!this.isGrace()) {
            return false
        }

        const bend = this.bendFor()
        if (!bend) {
            return false
        }

        const bendType = bend.bendType()
        return bendType === GuitarBendType.PRE_BEND || bendType === GuitarBendType.PRE_DIVE
    }

    isGraceBendStart(): boolean {
        if (!this.isGrace()) {
            return false
        }

        const bend = this.bendFor()

        return !!bend && bend.bendType() === GuitarBendType.GRACE_NOTE_BEND
    }

    /** Returns bend or dive going forward from this note. In the edge case of having both, returns the bend. */
    bendFor(): GuitarBend | null {
        let diveFor: GuitarBend | null = null

        for (const sp of this.m_spannerFor) {
            if (!sp.isGuitarBend()) {
                continue
            }

            const bend = sp as GuitarBend
            if (bend.bendType() === GuitarBendType.SCOOP) {
                continue
            }

            if (!bend.isDive()) {
                return bend
            } else {
                diveFor = bend
            }
        }

        return diveFor
    }

    /** Returns bend or dive going back from this note. In the edge case of having both, returns the bend. */
    bendBack(): GuitarBend | null {
        let diveBack: GuitarBend | null = null

        for (const sp of this.m_spannerBack) {
            if (!sp.isGuitarBend()) {
                continue
            }

            const bend = sp as GuitarBend
            if (bend.bendType() === GuitarBendType.SLIGHT_BEND || bend.bendType() === GuitarBendType.DIP) {
                continue
            }

            if (!bend.isDive()) {
                return bend
            } else {
                diveBack = bend
            }
        }

        return diveBack
    }

    diveFor(): GuitarBend | null {
        for (const sp of this.m_spannerFor) {
            if (sp.isGuitarBend() && (sp as GuitarBend).isDive() && (sp as GuitarBend).bendType() !== GuitarBendType.SCOOP) {
                return sp as GuitarBend
            }
        }

        return null
    }

    diveBack(): GuitarBend | null {
        for (const sp of this.m_spannerBack) {
            if (sp.isGuitarBend() && (sp as GuitarBend).isDive() && (sp as GuitarBend).bendType() !== GuitarBendType.DIP) {
                return sp as GuitarBend
            }
        }

        return null
    }

    override setVisible(v: boolean): void {
        super.setVisible(v)
        if (!this.explicitParent() || this.chord().noteParentheses().length === 0) {
            return
        }

        const noteParenInfo = this.chord().findNoteParenthesisInfo(this)

        if (!noteParenInfo) {
            return
        }

        let visible = false
        for (const note of noteParenInfo.notes()) {
            if (note.visible()) {
                visible = true
                break
            }
        }

        if (noteParenInfo.leftParen()) {
            noteParenInfo.leftParen().setVisible(visible)
        }
        if (noteParenInfo.rightParen()) {
            noteParenInfo.rightParen().setVisible(visible)
        }
    }

    overrideBendVisibilityRules(): boolean { return this.m_overrideBendVisibilityRules }
    setOverrideBendVisibilityRules(v: boolean): void { this.m_overrideBendVisibilityRules = v }

    shouldHideFret(): boolean {
        if (!this.tieBack() || this.shouldForceShowFret() || !this.staffType()!.isTabStaff()) {
            return false
        }

        if (this.isContinuationOfBend() && !this.rtick().isZero()) {
            return true
        }

        const showTiedFret = this.style().styleI(Sid.tabShowTiedFret) as ShowTiedFret
        if (showTiedFret === ShowTiedFret.TIE_AND_FRET) {
            return false
        }

        const parenthTiedFret = this.style().styleI(Sid.tabParenthesizeTiedFret) as ParenthesizeTiedFret
        if (parenthTiedFret === ParenthesizeTiedFret.NEVER || !this.rtick().isZero()) {
            return true
        }

        if (parenthTiedFret === ParenthesizeTiedFret.START_OF_MEASURE) {
            return false
        }

        const measure = this.findMeasure()
        const isStartOfSystem = !!measure && !!measure.system() && measure.isFirstInSystem()

        return !isStartOfSystem
    }

    shouldForceShowFret(): boolean {
        if (!this.style().styleB(Sid.parenthesizeTiedFretIfArticulation)) {
            return false
        }

        const ch = this.chord()
        if (!ch) {
            return false
        }

        const hasTremoloBar = (): boolean => {
            for (const item of ch.segment()!.annotations()) {
                if (item && item.isTremoloBar() && item.track() === this.track()) {
                    return true
                }
            }
            return false
        }

        const hasVibratoLine = (): boolean => {
            for (const sp of this.score().spannerMap().findOverlapping(this.tick().ticks(), ch.endTick().ticks())) {
                if (sp.isVibrato() && sp.startElement() === ch) {
                    return true
                }
            }
            return false
        }

        const bendF = this.bendFor()
        const startUnconnectedBend = !!bendF && !bendF.findPrecedingBend()
        const startsNonBendSpanner = this.spannerFor().length > 0 && !bendF

        let chordHasDip = false
        for (const note of ch.notes()) {
            for (const sp of note.spannerFor()) {
                if (sp.isGuitarBend() && (sp as GuitarBend).bendType() === GuitarBendType.DIP) {
                    chordHasDip = true
                    break
                }
            }
            if (chordHasDip) {
                break
            }
        }

        return ch.articulations().length > 0 || !!ch.chordLine() || startsNonBendSpanner || startUnconnectedBend || hasTremoloBar()
               || hasVibratoLine() || chordHasDip
    }

    updateFrettingForTiesAndBends(): void {
        let prevNote: Note | null = null
        if (this.m_tieBack) {
            prevNote = this.m_tieBack.startNote()
        } else {
            const bend = this.bendBack()
            if (bend) {
                prevNote = bend.startNote()
            }
        }

        if (!prevNote) {
            return
        }

        this.setString(prevNote.string())
        this.setFret(prevNote.fret())
    }

    /** C++ checks configuration()->negativeFretsAllowed(), which is off by default */
    negativeFretUsed(): boolean { return false }
    ghost(): boolean { return this.m_ghost }
    setGhost(val: boolean): void { this.m_ghost = val }
    deadNote(): boolean { return this.m_deadNote }
    setDeadNote(v: boolean): void { this.m_deadNote = v }
    fretConflict(): boolean { return this.m_fretConflict }
    setFretConflict(val: boolean): void { this.m_fretConflict = val }
    harmonic(): boolean { return this.m_harmonic }
    setHarmonic(val: boolean): void { this.m_harmonic = val }

    isSmall(): boolean { return this.m_isSmall }
    setSmall(val: boolean): void { this.m_isSmall = val }
    play(): boolean { return this.m_play }
    setPlay(val: boolean): void { this.m_play = val }

    // ---------------------------------------------------------
    //   children
    // ---------------------------------------------------------

    override add(e: EngravingItem): void {
        if (e.explicitParent() !== this) {
            e.setParent(this)
        }
        e.setTrack(this.track())

        switch (e.type()) {
        case ElementType.NOTEDOT:
            this.m_dots.push(e as NoteDot)
            break
        case ElementType.BEND:
        case ElementType.FINGERING:
        case ElementType.IMAGE:
        case ElementType.TEXT:
        case ElementType.SYMBOL:
            this.m_el.push(e)
            break
        case ElementType.LAISSEZ_VIB: {
            const lv = e as unknown as Tie
            lv.setStartNote(this)
            lv.setTick(this.tick())
            this.setTieFor(lv)
            break
        }
        case ElementType.PARTIAL_TIE: {
            const pt = e as unknown as Tie
            pt.setTick(this.tick())
            if (pt.isOutgoing()) {
                pt.setStartNote(this)
                this.setTieFor(pt)
            } else {
                pt.setEndNote(this)
                this.setTieBack(pt)
            }
            break
        }
        case ElementType.TIE: {
            const tie = e as unknown as Tie
            tie.setStartNote(this)
            tie.setTick(this.tick())
            this.setTieFor(tie)
            if (tie.endNote()) {
                tie.endNote()!.setTieBack(tie)
            }
            break
        }
        case ElementType.ACCIDENTAL: {
            const a = e as Accidental
            this.m_accidental = a
            this.m_centOffset = noteFactories.accidental!.subtype2centOffset(a.accidentalType())
            break
        }
        case ElementType.TEXTLINE:
        case ElementType.NOTELINE:
        case ElementType.GLISSANDO:
        case ElementType.GUITAR_BEND:
            this.addSpanner(e as unknown as Spanner)
            break
        default:
            super.add(e)
            break
        }
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.NOTEDOT:
            this.m_dots.pop()
            break
        case ElementType.BEND:
        case ElementType.TEXT:
        case ElementType.IMAGE:
        case ElementType.FINGERING:
        case ElementType.SYMBOL: {
            const i = this.m_el.indexOf(e)
            if (i >= 0) {
                this.m_el.splice(i, 1)
            }
            break
        }
        case ElementType.PARTIAL_TIE: {
            const pt = e as unknown as Tie
            if (pt.isOutgoing()) {
                this.setTieFor(null)
            } else {
                this.setTieBack(null)
            }
            break
        }
        case ElementType.LAISSEZ_VIB:
        case ElementType.TIE: {
            const tie = e as unknown as Tie
            this.setTieFor(null)
            if (tie.endNote()) {
                tie.endNote()!.setTieBack(null)
            }
            break
        }
        case ElementType.ACCIDENTAL:
            this.m_accidental = null
            this.m_centOffset = 0
            break
        case ElementType.TEXTLINE:
        case ElementType.NOTELINE:
        case ElementType.GLISSANDO:
        case ElementType.GUITAR_BEND:
            this.removeSpanner(e as unknown as Spanner)
            break
        default:
            super.remove(e)
            break
        }
    }

    private addSpanner(l: Spanner): void {
        const e = l.endElement()
        if (e && e.isNote()) {
            const note = e as Note
            note.addSpannerBack(l)
            // TODO(port): NoteLine::enforceMinLength()
            if (l.isGlissando() || l.isGuitarBend()) {
                note.chord().setEndsNoteAnchoredLine(true)
            }
        }
        this.addSpannerFor(l)
    }

    private removeSpanner(l: Spanner): void {
        const e = l.endElement()
        if (e && e.isNote()) {
            (e as Note).removeSpannerBack(l)
        }
        this.removeSpannerFor(l)
    }

    el(): EngravingItem[] { return this.m_el }

    // ---------------------------------------------------------
    //   ties
    // ---------------------------------------------------------

    tieFor(): Tie | null { return this.m_tieFor }

    parenthesisInfo(): NoteParenthesisInfo | null { return this.chord() ? this.chord().findNoteParenthesisInfo(this) : null }

    /** notes have chord parentheses (NoteParenthesisInfo) instead of their own Parenthesis items */
    override setParenthesesMode(v: ParenthesesMode, addToLinked = true, generated = false): void {
        if (v !== ParenthesesMode.BOTH && v !== ParenthesesMode.NONE) {
            // C++ logs "Notes cannot set left & right parens individually"
            return
        }

        if ((this.m_hasParens && v === ParenthesesMode.BOTH) || (!this.m_hasParens && v === ParenthesesMode.NONE)) {
            return
        }

        const noteParenInfo = this.parenthesisInfo()

        const leftParen = noteParenInfo ? noteParenInfo.leftParen() : null

        const hasGeneratedParen = !!leftParen && leftParen.generated()
        const hasUserParen = !!leftParen && !leftParen.generated()

        const hasParen = v === ParenthesesMode.BOTH

        if (generated && hasParen === hasGeneratedParen) {
            return
        }

        if (!generated && hasParen === hasUserParen) {
            return
        }

        this.m_hasParens = hasParen

        if (hasParen) {
            noteParenthesesHooks.addChordParentheses!(this.chord(), [this], addToLinked, generated)
        } else {
            noteParenthesesHooks.removeChordParentheses!(this.chord(), [this], addToLinked, generated)
        }
    }
    tieBack(): Tie | null { return this.m_tieBack }
    tieForNonPartial(): Tie | null { return this.m_tieFor && this.m_tieFor.type() === ElementType.TIE ? this.m_tieFor : null }
    tieBackNonPartial(): Tie | null { return this.m_tieBack && this.m_tieBack.type() === ElementType.TIE ? this.m_tieBack : null }
    laissezVib(): Tie | null { return this.m_tieFor && this.m_tieFor.isLaissezVib() ? this.m_tieFor : null }
    incomingPartialTie(): Tie | null { return this.m_tieBack && this.m_tieBack.isPartialTie() ? this.m_tieBack : null }
    outgoingPartialTie(): Tie | null { return this.m_tieFor && this.m_tieFor.isPartialTie() ? this.m_tieFor : null }
    setTieFor(t: Tie | null): void { this.m_tieFor = t }
    setTieBack(t: Tie | null): void { this.m_tieBack = t }

    lastTiedNote(): Note {
        const notes: Note[] = []
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let note: Note = this
        notes.push(note)
        while (note.tieFor()) {
            const end = note.tieFor()!.endNote()
            if (!end || notes.includes(end)) {
                break
            }
            note = end
            notes.push(note)
        }
        return note
    }

    firstTiedNote(): Note {
        const notes: Note[] = []
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let note: Note = this
        notes.push(note)
        while (note.tieBack()) {
            const start = note.tieBack()!.startNote()
            if (!start || notes.includes(start)) {
                break
            }
            note = start
            notes.push(note)
        }
        return note
    }

    tiedNotes(): Note[] {
        let note: Note = this.firstTiedNote()
        const notes: Note[] = [note]
        while (note.tieFor()) {
            const endNote = note.tieFor()!.endNote()
            if (!endNote || notes.includes(endNote)) {
                break
            }
            note = endNote
            notes.push(note)
        }
        return notes
    }

    noteVal(): NoteVal {
        const nval = new NoteVal()
        nval.pitch = this.pitch()
        nval.velocityOverride = this.userVelocity()
        nval.tpc1 = this.tpc1()
        nval.tpc2 = this.tpc2()
        nval.fret = this.fret()
        nval.string = this.string()
        nval.headGroup = this.headGroup()

        return nval
    }

    /** the notes which are changed together with this one (ties, note anchored spanners, beam) */
    compoundNotes(): Note[] {
        const elements: Note[] = []
        const first = this.firstTiedNote()
        if (first) {
            elements.push(first)
        }

        const last = this.lastTiedNote()
        if (last) {
            elements.push(last)
        }

        for (const e of this.m_spannerFor) {
            elements.push(e.endElement() as unknown as Note)
        }
        for (const e of this.m_spannerBack) {
            elements.push(e.startElement() as unknown as Note)
        }

        const beam = this.chord().beam()
        if (beam) {
            for (const e of beam.elements()) {
                if (e && e.isNote() && (e as unknown) !== this) {
                    elements.push(e as unknown as Note)
                }
            }
        }

        return elements
    }

    unisonIndex(): number {
        let index = 0
        for (const n of this.chord().notes()) {
            if (n.pitch() === this.pitch()) {
                if (n === this) {
                    return index
                }
                ++index
            }
        }
        return 0
    }

    disconnectTiedNotes(): void {
        if (this.tieBack() && this.tieBack()!.startNote()) {
            this.tieBack()!.startNote()!.remove(this.tieBack()!)
        }
        if (this.tieFor() && this.tieFor()!.endNote()) {
            this.tieFor()!.endNote()!.setTieBack(null)
        }
    }

    connectTiedNotes(): void {
        if (this.tieBack() && !this.tieBack()!.isPartialTie()) {
            this.tieBack()!.setEndNote(this)
            if (this.tieBack()!.startNote()) {
                this.tieBack()!.startNote()!.add(this.tieBack()!)
            }
        }
        if (this.tieFor() && this.tieFor()!.endNote() && !this.tieFor()!.isPartialTie()) {
            this.tieFor()!.endNote()!.setTieBack(this.tieFor())
        }
    }

    // ---------------------------------------------------------
    //   drop
    // ---------------------------------------------------------

    override acceptDrop(data: EditData): boolean {
        const e = data.dropElement!
        switch (e.type()) {
        case ElementType.GLISSANDO:
        case ElementType.GUITAR_BEND:
            for (const ee of this.m_spannerFor) {
                if (ee.isGlissando() || ee.isGuitarBend()) {
                    return false
                }
            }
            return true
        case ElementType.FINGERING:
            return this.staff()!.isTabStaff(this.tick()) ? this.staffType()!.showTabFingering() : true
        case ElementType.ARTICULATION:
        case ElementType.ORNAMENT:
        case ElementType.TAPPING:
        case ElementType.CHORDLINE:
        case ElementType.TEXT:
        case ElementType.ACCIDENTAL:
        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET:
        case ElementType.NOTEHEAD:
        case ElementType.NOTE:
        case ElementType.TREMOLO_SINGLECHORD:
        case ElementType.TREMOLO_TWOCHORD:
        case ElementType.IMAGE:
        case ElementType.CHORD:
        case ElementType.SYMBOL:
        case ElementType.BAR_LINE:
        case ElementType.STICKING:
        case ElementType.BEND:
        case ElementType.FIGURED_BASS:
        case ElementType.LYRICS:
            return true
        case ElementType.BAGPIPE_EMBELLISHMENT:
            return this.noteType() === NoteType.NORMAL
        // TODO(port): ACTION_ICON (grace notes, parentheses, bends, note anchored lines)
        default:
            if (e.isSpanner()) {
                return e.type() !== ElementType.TIE && e.type() !== ElementType.PARTIAL_TIE
            }
            break
        }
        return this.chord().acceptDrop(data)
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!

        const st = this.staff()!
        const isTablature = st.isTabStaff(this.tick())
        const tabFingering = st.staffTypeForElement(this).showTabFingering()
        const ch = this.chord()

        switch (e.type()) {
        case ElementType.SYMBOL:
        case ElementType.IMAGE:
            e.setParent(this)
            this.score().undoAddElement(e)
            return e

        case ElementType.FINGERING:
            if (!isTablature || tabFingering) {
                e.setParent(this)
                this.score().undoAddElement(e)
                return e
            }
            return null

        case ElementType.LYRICS:
            e.setParent(ch)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            return e

        case ElementType.ACCIDENTAL:
            this.score().changeNoteAccidental(this, (e as Accidental).accidentalType())
            break

        case ElementType.BEND:
            e.setParent(this)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            return e

        case ElementType.NOTEHEAD: {
            let group = (e as unknown as { headGroup(): NoteHeadGroup }).headGroup()
            if (group === NoteHeadGroup.HEAD_INVALID) {
                // C++: LOGD("unknown notehead")
                group = NoteHeadGroup.HEAD_NORMAL
            }

            if (group !== this.m_headGroup) {
                if (this.links()) {
                    for (const se of this.links()!) {
                        se.undoChangeProperty(Pid.HEAD_GROUP, group)
                        const note = se as Note
                        if (note.staff() && !note.staff()!.isDrumStaff(ch.tick())) {
                            se.undoChangeProperty(Pid.DEAD, group === NoteHeadGroup.HEAD_CROSS)
                        }
                    }
                } else {
                    this.undoChangeProperty(Pid.HEAD_GROUP, group)
                    if (!st.isDrumStaff(ch.tick())) {
                        this.undoChangeProperty(Pid.DEAD, group === NoteHeadGroup.HEAD_CROSS)
                    }
                }
            }
            break
        }

        // TODO(port): ACTION_ICON (grace notes, parentheses, bends, note anchored lines), GUITAR_BEND,
        // NOTE (replace the note), GLISSANDO

        case ElementType.BAGPIPE_EMBELLISHMENT: {
            const b = e as unknown as BagpipeEmbellishment
            const nl = b.resolveNoteList()
            // add grace notes in reverse order, as setGraceNote adds a grace note
            // before the current note
            for (let i = nl.length - 1; i >= 0; --i) {
                const p = BagpipeEmbellishment.BAGPIPE_NOTEINFO_LIST[nl[i]].pitch
                this.score().setGraceNote(ch, p, NoteType.GRACE32, Constants.DIVISION / 8)
            }
            break
        }

        case ElementType.CHORD: {
            const c = e as unknown as Chord
            const n = c.upNote()
            const dir = c.stemDirection()
            const t = this.track() // (staff2track(staffIdx()) + n->voice())
            this.score().select(null, 0 /* SelectType::SINGLE */, 0)
            const nval = new NoteVal()
            nval.pitch = n.pitch()
            nval.headGroup = n.headGroup()
            let cr: ChordRest | null = null
            if (data.modifiers & KeyboardModifier.ShiftModifier) {
                // add note to chord
                this.score().addNote(ch, nval)
            } else {
                // replace current chord
                const seg = this.score().setNoteRest(ch.segment(), t, nval, this.score().inputState().duration().fraction(), dir)
                cr = seg ? seg.element(t) as unknown as ChordRest | null : null
            }
            if (cr) {
                this.score().nextInputPos(cr, false)
            }
            break
        }

        case ElementType.CHORDLINE:
            (e as unknown as { setNote(n: Note): void }).setNote(this)
            return ch.drop(data)

        default: {
            if (e.isSpanner() && (e as unknown as Spanner).anchor() === 3 /* Spanner::Anchor::NOTE */) {
                const spanner = e as unknown as Spanner
                spanner.setParent(this)
                spanner.setStartElement(this)
                spanner.setTick(this.tick())
                spanner.setTrack(this.track())
                spanner.setTrack2(this.track())
                spanner.computeEndElement()
                this.score().undoAddElement(spanner)
                return e
            }
            return ch.drop(data)
        }
        }
        return null
    }

    // ---------------------------------------------------------
    //   setupAfterRead
    // ---------------------------------------------------------

    setupAfterRead(ctxTick: Fraction, pasteMode: boolean): void {
        this.m_pitch = Math.min(Math.max(this.m_pitch, 0), 127)
        const ch = this.explicitParent() ? this.chord() : null

        if (!tpcIsValid(this.m_tpc[0]) && !tpcIsValid(this.m_tpc[1])) {
            const key = (this.staff() && ch) ? this.staff()!.key(ch.tick()) : Key.C
            const tpc = pitch2tpc(this.m_pitch, key, Prefer.NEAREST)
            if (this.concertPitch()) {
                this.m_tpc[0] = tpc
            } else {
                this.m_tpc[1] = tpc
            }
        }
        if (!(tpcIsValid(this.m_tpc[0]) && tpcIsValid(this.m_tpc[1]))) {
            const tick = ch ? ch.tick() : new Fraction(-1, 1)
            const v = this.staff() ? this.staff()!.transpose(tick) : new Interval()
            if (tpcIsValid(this.m_tpc[0])) {
                v.flip()
                this.m_tpc[1] = v.isZero() ? this.m_tpc[0] : Transpose.transposeTpc(this.m_tpc[0], v, true)
            } else {
                this.m_tpc[0] = v.isZero() ? this.m_tpc[1] : Transpose.transposeTpc(this.m_tpc[1], v, true)
            }
        }

        // check if note is correct
        if (this.staff() && !this.staff()!.isDrumStaff(ctxTick) && !pasteMode) {
            const tpc1Pitch = (tpc2pitch(this.m_tpc[0]) + 12) % 12
            const tpc2Pitch = (tpc2pitch(this.m_tpc[1]) + 12) % 12
            const soundingPitch = this.m_pitch % 12
            if (tpc1Pitch !== soundingPitch) {
                this.m_pitch += tpc1Pitch - soundingPitch
            }
            const v = this.staff()!.transpose(ctxTick)
            const writtenPitch = (this.m_pitch - v.chromatic) % 12
            if (tpc2Pitch !== writtenPitch) {
                if (this.concertPitch()) {
                    v.flip()
                    this.m_tpc[1] = Transpose.transposeTpc(this.m_tpc[0], v, true)
                } else {
                    this.m_tpc[0] = Transpose.transposeTpc(this.m_tpc[1], v, true)
                    this.m_pitch += tpc2Pitch - writtenPitch
                }
            }
        }
        // TODO(port): tab fret colors
    }

    hidden(): boolean { return this.m_hidden }
    setHidden(val: boolean): void { this.m_hidden = val }
    dotsHidden(): boolean { return this.m_dotsHidden }
    setDotsHidden(val: boolean): void { this.m_dotsHidden = val }

    noteType(): NoteType { return this.chord().noteType() }

    subchannel(): number { return this.m_subchannel }
    setSubchannel(val: number): void { this.m_subchannel = val }

    userMirror(): DirectionH { return this.m_userMirror }
    setUserMirror(d: DirectionH): void { this.m_userMirror = d }
    userDotPosition(): DirectionV { return this.m_userDotPosition }
    setUserDotPosition(d: DirectionV): void { this.m_userDotPosition = d }
    dotPosition(): DirectionV { return this.m_dotPosition }
    setDotPosition(d: DirectionV): void { this.m_dotPosition = d }

    /** actual dot position */
    dotIsUp(): boolean {
        if (this.m_dots.length === 0) {
            return true
        }
        if (this.m_userDotPosition === DirectionV.AUTO) {
            return this.m_dots[0].y() < this.spatium() * 0.1
        }
        return this.m_userDotPosition === DirectionV.UP
    }

    userVelocity(): number { return this.m_userVelocity }
    setUserVelocity(v: number): void { this.m_userVelocity = v }
    veloType(): VeloType { return this.m_veloType }
    setVeloType(v: VeloType): void { this.m_veloType = v }
    setOffTimeType(v: number): void { this.m_offTimeType = v }
    setOnTimeType(v: number): void { this.m_onTimeType = v }
    offTimeType(): number { return this.m_offTimeType }
    onTimeType(): number { return this.m_onTimeType }

    lineAttachPoints(): LineAttachPoint[] { return this.m_lineAttachPoints }
    addStartLineAttachPoint(point: PointF, line: EngravingItem): void { this.addLineAttachPoint(point, line, true) }
    addEndLineAttachPoint(point: PointF, line: EngravingItem): void { this.addLineAttachPoint(point, line, false) }

    private addLineAttachPoint(point: PointF, line: EngravingItem, start: boolean): void {
        // IMPORTANT: the point is expected in *staff* coordinates
        // We transform into note coordinates by subtracting the note position in staff coordinates
        point = point.minus(this.posInStaffCoordinates())
        this.m_lineAttachPoints.push(new LineAttachPoint(line, point.x(), point.y(), start))
    }

    stringOrLine(): number {
        // The number string() returns doesn't count spaces.  This should be used where it is expected even numbers are spaces and odd are lines
        return this.staff()!.staffType(this.tick()).isTabStaff() ? this.string() * 2 : this.line()
    }

    dot(n: number): NoteDot { return this.m_dots[n] }
    dots(): NoteDot[] { return this.m_dots }

    /** sets the number of dots and their vertical position (layout helper) */
    setDotRelativeLine(dotMove: number, layoutDot: (dot: NoteDot) => void): void {
        let y = dotMove / 2.0
        if (this.staff()!.isTabStaff(this.chord().tick())) {
            // with TAB's, dotPosX is not set:
            // get dot X from width of fret text and use TAB default spacing
            const st = this.staff()!
            const tab = st.staffTypeForElement(this)
            if (tab.stemThrough()) {
                // if fret mark on lines, use standard processing
                if (!tab.onLines()) {
                    // if fret marks above lines, raise the dots by half line distance
                    y = -0.5
                }
                if (dotMove === 0) {
                    const oddVoice = (this.voice() & 1) !== 0
                    y = oddVoice ? 0.5 : -0.5
                } else {
                    y = 0.5
                }
            } else {
                // if stems beside staff, do nothing
                return
            }
        }
        y *= this.spatium() * this.staff()!.lineDistance(this.tick())

        const cdots = this.chord().dots()
        const ndots = this.m_dots.length
        const n = cdots - ndots
        for (let i = 0; i < n; ++i) {
            const dot = noteFactories.createNoteDot!(this)
            dot.setParent(this)
            dot.setTrack(this.track()) // needed to know the staff it belongs to (and detect tablature)
            dot.setVisible(this.visible())
            this.add(dot)
        }
        if (n < 0) {
            for (let i = 0; i < -n; ++i) {
                this.remove(this.m_dots[this.m_dots.length - 1])
            }
        }
        for (const dot of this.m_dots) {
            layoutDot(dot)
            dot.mutldata().setPosY(y)
        }
    }

    // ---------------------------------------------------------
    //   updateAccidental
    //    set _accidental and _line depending on tpc
    // ---------------------------------------------------------

    updateAccidental(as: AccidentalState): void {
        const A = noteFactories.accidental!
        const absLine = absStep(this.tpc(), this.epitch())

        // don't touch accidentals that don't concern tpc such as
        // quarter tones
        if (RealIsNull(this.m_centOffset)) {
            if (this.m_accidental && !RealIsNull(A.subtype2centOffset(this.m_accidental.accidentalType()))) {
                this.remove(this.m_accidental)
            }
        } else if (this.m_accidental) {
            const correct = RealIsEqual(A.subtype2centOffset(this.m_accidental.accidentalType()), this.m_centOffset)
            if (!correct) {
                this.m_accidental.setAccidentalType(A.centOffset2Subtype(this.m_centOffset))
            }
        } else {
            const accType = A.value2MicrotonalSubtype(tpc2alter(this.tpc()), this.quarterToneOffset())
            this.updateLine()
            this.changeAccidental(accType)
        }

        if (!(this.m_accidental && A.isMicrotonal(this.m_accidental.accidentalType()))) {
            // calculate accidental
            let acci = A.NONE
            const accVal = tpc2alter(this.tpc())
            const eAbsLine = absStep(this.tpc(), this.epitch())
            const [absLineAccVal, error] = as.accidentalValChecked(eAbsLine)
            if (error) {
                return
            }
            if ((accVal !== absLineAccVal) || this.hidden() || as.tieContext(eAbsLine) || as.forceRestateAccidental(eAbsLine)) {
                as.setAccidentalVal(eAbsLine, accVal, this.m_tieBack !== null && this.m_accidental === null)
                acci = A.value2subtype(accVal)
                // if previous tied note has same tpc, don't show accidental
                if (this.tieBackNonPartial() && this.m_tieBack!.startNote()!.tpc1() === this.tpc1()) {
                    acci = A.NONE
                } else if (acci === A.NONE) {
                    acci = A.NATURAL
                }
            } else if (this.hasAlteredUnison()) {
                if ((acci = A.value2subtype(accVal)) === A.NONE) {
                    acci = A.NATURAL
                }
            }
            if (acci !== A.NONE && !this.m_hidden) {
                if (!this.m_accidental) {
                    const a = noteFactories.createAccidental!(this)
                    a.setParent(this)
                    a.setAccidentalType(acci)
                    a.setVisible(this.visible())
                    this.add(a)
                } else if (this.m_accidental.accidentalType() !== acci) {
                    this.m_accidental.setAccidentalType(acci)
                }
            } else if (this.m_accidental) {
                // remove this if it was AUTO:
                if (this.m_accidental.role() === AccidentalRole.AUTO) {
                    this.remove(this.m_accidental)
                } else {
                    // keep it, but update type if needed
                    acci = A.value2subtype(accVal)
                    if (acci === A.NONE) {
                        acci = A.NATURAL
                    }
                    if (this.m_accidental.accidentalType() !== acci) {
                        this.m_accidental.setAccidentalType(acci)
                    }
                }
            }
        } else {
            // microtonal accidentals playback as naturals
            // in 1.X, they were not taken into account as accidentals
            const accVal = A.subtype2value(this.m_accidental.accidentalType())
            as.setAccidentalVal(absLine, accVal, this.m_tieBack !== null && this.m_accidental === null)
        }
        as.setForceRestateAccidental(absLine, false)
        this.updateRelLine(absLine, true)
    }

    private changeAccidental(accType: AccidentalType): void {
        // simplified Score::changeAccidental (no undo, no linked staves)
        if (accType === noteFactories.accidental!.NONE) {
            if (this.m_accidental) {
                this.remove(this.m_accidental)
            }
            return
        }
        const a = noteFactories.createAccidental!(this)
        a.setParent(this)
        a.setAccidentalType(accType)
        a.setRole(AccidentalRole.USER)
        if (this.m_accidental) {
            this.remove(this.m_accidental)
        }
        this.add(a)
    }

    private hasAlteredUnison(): boolean {
        const chordNotes = this.chord().notes()
        const accVal = tpc2alter(this.tpc())
        const absLine = absStep(this.tpc(), this.epitch())
        return chordNotes.some(n => n !== this && !n.hidden() && absStep(n.tpc(), n.epitch()) === absLine
                                    && tpc2alter(n.tpc()) !== accVal)
    }

    updateLine(): void {
        const absLine = absStep(this.tpc(), this.epitch())
        this.updateRelLine(absLine, false)
    }

    /** calculate the real note line depending on clef, absLine is the absolute line */
    private updateRelLine(absLine: number, _undoable: boolean): void {
        if (!this.staff()) {
            return
        }
        // calculate actual relative line based on clef in effect for the staff
        const idx = this.chord().vStaffIdx()
        const staff = this.score().staff(idx)!
        const st = staff.staffTypeForElement(this)
        if (st.isTabStaff()) {
            // tab staff is already correct, and the following relStep method doesn't apply whatsoever to tab staves
            return
        }
        const clef = staff.clef(this.chord().tick())
        const line = relStep(absLine, clef)
        this.setLine(line)

        const off = st.stepOffset()
        const ld = st.lineDistance().val()
        this.mutldata().setPosY((this.m_line + off * 2.0) * this.spatium() * 0.5 * ld)
    }

    spannerFor(): Spanner[] { return this.m_spannerFor }
    spannerBack(): Spanner[] { return this.m_spannerBack }
    addSpannerBack(e: Spanner): void {
        if (!this.m_spannerBack.includes(e)) {
            this.m_spannerBack.push(e)
        }
    }
    removeSpannerBack(e: Spanner): boolean {
        const i = this.m_spannerBack.indexOf(e)
        if (i >= 0) {
            this.m_spannerBack.splice(i, 1)
            return true
        }
        return false
    }
    addSpannerFor(e: Spanner): void {
        if (!this.m_spannerFor.includes(e)) {
            this.m_spannerFor.push(e)
        }
    }
    removeSpannerFor(e: Spanner): boolean {
        const i = this.m_spannerFor.indexOf(e)
        if (i >= 0) {
            this.m_spannerFor.splice(i, 1)
            return true
        }
        return false
    }

    slideToType(): SlideType { return this.m_slideToType }
    slideFromType(): SlideType { return this.m_slideFromType }
    attachSlide(t: SlideType): void {
        if (t === SlideType.UpToNote || t === SlideType.DownToNote) {
            this.m_slideToType = t
        } else if (t === SlideType.UpFromNote || t === SlideType.DownFromNote) {
            this.m_slideFromType = t
        }
    }
    hasSlideToNote(): boolean { return this.m_slideToType !== SlideType.Undefined }
    hasSlideFromNote(): boolean { return this.m_slideFromType !== SlideType.Undefined }

    hasParens(): boolean { return this.m_hasParens }
    hideGeneratedParens(): boolean { return this.m_hideGeneratedParens }
    setHideGeneratedParens(v: boolean): void { this.m_hideGeneratedParens = v }

    isGrace(): boolean { return this.noteType() !== 0 /* NoteType::NORMAL */ }
    isTrillCueNote(): boolean { return this.m_isTrillCueNote }
    setIsTrillCueNote(v: boolean): void { this.m_isTrillCueNote = v }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)
        const tf = this.m_tieFor
        if (tf) {
            tf.setTrack(val)
            for (const seg of tf.spannerSegments()) {
                seg.setTrack(val)
            }
            if (!this.tieForNonPartial()) {
                tf.setTrack2(val)
            }
        }
        const tb = this.m_tieBack
        if (tb) {
            tb.setTrack2(val)
            if (this.incomingPartialTie()) {
                tb.setTrack(val)
                for (const seg of tb.spannerSegments()) {
                    seg.setTrack(val)
                }
            }
        }
        for (const s of this.m_spannerFor) {
            s.setTrack(val)
        }
        for (const s of this.m_spannerBack) {
            s.setTrack2(val)
        }
        for (const e of this.m_el) {
            e.setTrack(val)
        }
        if (this.m_accidental) {
            this.m_accidental.setTrack(val)
        }
        if (!this.explicitParent()) { // if note is dragged with shift+ctrl
            return
        }
        for (const dot of this.m_dots) {
            dot.setTrack(val)
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        // tie segments are collected from System
        for (const e of this.m_el) {
            e.scanElements(func)
        }
        for (const sp of this.m_spannerFor) {
            sp.scanElements(func)
        }
        if (this.m_accidental) {
            func(this.m_accidental)
        }
        for (const dot of this.m_dots) {
            func(dot)
        }
    }

    // ---------------------------------------------------------
    //   properties
    // ---------------------------------------------------------

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PITCH: return this.pitch()
        case Pid.CENT_OFFSET: return this.centOffset()
        case Pid.TPC1: return this.m_tpc[0]
        case Pid.TPC2: return this.m_tpc[1]
        case Pid.SMALL: return this.isSmall()
        case Pid.MIRROR_HEAD: return this.userMirror()
        case Pid.DOT_POSITION: return this.userDotPosition()
        case Pid.HEAD_SCHEME: return this.headScheme()
        case Pid.HEAD_GROUP: return this.headGroup()
        case Pid.USER_VELOCITY: return this.userVelocity()
        case Pid.TUNING: return this.tuning()
        case Pid.FRET: return this.fret()
        case Pid.STRING: return this.string()
        case Pid.GHOST: return this.ghost()
        case Pid.DEAD: return this.deadNote()
        case Pid.HEAD_TYPE: return this.headType()
        case Pid.VELO_TYPE: return this.m_veloType
        case Pid.PLAY: return this.play()
        case Pid.LINE: return this.m_line
        case Pid.FIXED: return this.fixed()
        case Pid.FIXED_LINE: return this.fixedLine()
        case Pid.HAS_PARENTHESES: return this.m_hasParens ? ParenthesesMode.BOTH : ParenthesesMode.NONE
        case Pid.HIDE_GENERATED_PARENTHESES: return this.m_hideGeneratedParens
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PITCH:
            this.setPitch(v as number)
            break
        case Pid.CENT_OFFSET:
            this.setCentOffset(v as number)
            break
        case Pid.TPC1:
            this.m_tpc[0] = v as number
            break
        case Pid.TPC2:
            this.m_tpc[1] = v as number
            break
        case Pid.LINE:
            this.setLine(v as number)
            break
        case Pid.SMALL:
            this.setSmall(!!v)
            break
        case Pid.MIRROR_HEAD:
            this.setUserMirror(v as DirectionH)
            break
        case Pid.DOT_POSITION:
            this.setUserDotPosition(v as DirectionV)
            break
        case Pid.HEAD_SCHEME:
            this.setHeadScheme(v as NoteHeadScheme)
            break
        case Pid.HEAD_GROUP:
            this.setHeadGroup(v as NoteHeadGroup)
            this.setDeadNote(!!this.staff() && !this.staff()!.isDrumStaff(this.tick())
                             && this.m_headGroup === NoteHeadGroup.HEAD_CROSS)
            break
        case Pid.USER_VELOCITY:
            this.setUserVelocity(v as number)
            break
        case Pid.TUNING:
            this.setTuning(v as number)
            break
        case Pid.FRET:
            this.setFret(v as number)
            break
        case Pid.STRING:
            this.setString(v as number)
            break
        case Pid.GHOST:
            this.setGhost(!!v)
            break
        case Pid.DEAD:
            this.setDeadNote(!!v)
            if (!this.staff()!.isDrumStaff(this.tick())) {
                this.setHeadGroup(this.m_deadNote && this.m_headGroup !== NoteHeadGroup.HEAD_CROSS
                    ? NoteHeadGroup.HEAD_CROSS : NoteHeadGroup.HEAD_NORMAL)
            }
            break
        case Pid.HEAD_TYPE:
            this.setHeadType(v as NoteHeadType)
            break
        case Pid.VELO_TYPE:
            this.m_veloType = v as VeloType
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            if (this.explicitParent() && this.chord().explicitParent()) {
                this.chord().measure().checkMultiVoices(this.chord().staffIdx())
            }
            break
        case Pid.PLAY:
            this.setPlay(!!v)
            break
        case Pid.FIXED:
            this.setFixed(!!v)
            break
        case Pid.FIXED_LINE:
            this.setFixedLine(v as number)
            break
        case Pid.HAS_PARENTHESES:
            this.m_hasParens = v === ParenthesesMode.BOTH
            break
        case Pid.HIDE_GENERATED_PARENTHESES:
            this.setHideGeneratedParens(!!v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.CENT_OFFSET: return 0.0
        case Pid.GHOST:
        case Pid.DEAD:
        case Pid.SMALL:
            return false
        case Pid.MIRROR_HEAD: return DirectionH.AUTO
        case Pid.DOT_POSITION: return DirectionV.AUTO
        case Pid.HEAD_SCHEME: return NoteHeadScheme.HEAD_AUTO
        case Pid.HEAD_GROUP: return NoteHeadGroup.HEAD_NORMAL
        case Pid.USER_VELOCITY: return 0
        case Pid.TUNING: return 0.0
        case Pid.FRET:
        case Pid.STRING:
            return -1
        case Pid.HEAD_TYPE: return NoteHeadType.HEAD_AUTO
        case Pid.VELO_TYPE: return VeloType.USER_VAL
        case Pid.PLAY: return true
        case Pid.FIXED: return false
        case Pid.FIXED_LINE: return 0
        case Pid.TPC2: return this.getProperty(Pid.TPC1)
        case Pid.PITCH:
        case Pid.TPC1:
            return undefined
        case Pid.VISIBLE:
            if (this.staffType() && this.staffType()!.isTabStaff()) {
                const bend = this.bendBack()
                if (bend && !bend.isFullRelease()) {
                    return false
                }
            }
            return super.propertyDefault(propertyId)
        case Pid.HIDE_GENERATED_PARENTHESES: return false
        default:
            return super.propertyDefault(propertyId)
        }
    }

    posInStaffCoordinates(): PointF {
        const x = this.pos().x() + this.chord().pos().x() + this.chord().segment().pos().x()
                  + this.chord().measure().pos().x()
        return new PointF(x, this.pos().y())
    }

    playEvents(): NoteEvent[] { return this.m_playEvents }
    noteEvent(idx: number): NoteEvent { return this.m_playEvents[idx] }
    setPlayEvents(l: readonly NoteEvent[]): void { this.m_playEvents = l.map(e => e.clone()) }

    // accessibility

    override accessibleInfo(): string {
        if (!this.chord() || !this.staff()) {
            return ''
        }

        const duration = this.chord().durationUserName()
        const voice = arg(mtrc('engraving', 'Voice: %1'), this.track() % VOICES + 1)
        let pitchName: string
        let onofftime = ''
        if (this.m_playEvents.length) {
            const on = this.m_playEvents[0].ontime()
            const off = this.m_playEvents[0].offtime()
            if (on !== 0 || off !== NoteEvent.NOTE_LENGTH) {
                //: Note-on and note-off times relative to note duration, expressed in thousandths (per mille)
                onofftime = ' ' + arg(mtrc('engraving', '(on %1‰ off %2‰)'), on, off)
            }
        }

        const drumset = this.part()!.instrument(this.chord().tick()).drumset()
        if (this.fixed() && this.headGroup() === NoteHeadGroup.HEAD_SLASH) {
            pitchName = this.chord().noStem() ? mtrc('engraving', 'Beat slash') : mtrc('engraving', 'Rhythm slash')
        } else if (this.staff()!.isDrumStaff(this.tick()) && drumset) {
            pitchName = mtrc('engraving/drumset', drumset.name(this.pitch()))
        } else if (this.staff()!.isTabStaff(this.tick())) {
            pitchName = arg(mtrc('engraving', '%1; String: %2; Fret: %3'), this.tpcUserName(false), String(this.string() + 1),
                String(this.fret()))
        } else {
            pitchName = this.tpcUserName(false)
        }

        return arg(mtrc('engraving', '%1; Pitch: %2; Duration: %3%4%5'), this.noteTypeUserName(), pitchName, duration, onofftime,
            this.chord().isGrace() ? '' : arg('; %1', voice))
    }

    tpcUserName(explicitAccidental: boolean, full = false): string {
        let pitchName = tpcUserNameOf(this.tpc(), this.epitch() + this.ottaveCapoFret(), explicitAccidental, full)

        pitchName = mtrc('global/pitchName', pitchName)

        if (this.fixed() && this.headGroup() === NoteHeadGroup.HEAD_SLASH) {
            // see Note::accessibleInfo(), but we return what we have
            return pitchName
        }
        if (this.staff()!.isDrumStaff(this.tick()) && this.part()!.instrument().drumset()) {
            // see Note::accessibleInfo(), but we return what we have
            return pitchName
        }
        if (this.staff()!.isTabStaff(this.tick())) {
            // no further translation
            return pitchName
        }

        let pitchOffset = ''
        if (this.tuning() !== 0) {
            pitchOffset = (this.tuning() >= 0 ? '+' : '') + this.tuning().toFixed(3) // "%+.3f"
        }

        if (!this.concertPitch() && this.transposition()) {
            let soundingPitch = tpcUserNameOf(this.tpc1(), this.ppitch(), explicitAccidental)
            soundingPitch = mtrc('global/pitchName', soundingPitch)
            return arg(mtrc('engraving', '%1 (sounding as %2%3)'), pitchName, soundingPitch, pitchOffset)
        }
        return pitchName + pitchOffset
    }

    noteTypeUserName(): string {
        switch (this.noteType()) {
        case 0x1: // NoteType::ACCIACCATURA
            return mtrc('engraving', 'Acciaccatura')
        case 0x2: // NoteType::APPOGGIATURA
            return mtrc('engraving', 'Appoggiatura')
        case 0x20: // NoteType::GRACE8_AFTER
        case 0x40: // NoteType::GRACE16_AFTER
        case 0x80: // NoteType::GRACE32_AFTER
            return mtrc('engraving', 'Grace note after')
        case 0x4: // NoteType::GRACE4
        case 0x8: // NoteType::GRACE16
        case 0x10: // NoteType::GRACE32
            return mtrc('engraving', 'Grace note before')
        default:
            return mtrc('engraving', 'Note')
        }
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameNoteHeadGroup(this.m_headGroup)
    }

    // =================================================================================================================
    //   drag (note.cpp: startDrag, drag, endDrag, dragInEditMode, verticalDrag, horizontalDrag)
    // =================================================================================================================

    override startDrag(ed: EditData): void {
        const ned = new NoteEditData()
        ned.e = this
        ned.line = this.m_line
        ned.string = this.m_string
        ned.pushProperty(Pid.PITCH)
        ned.pushProperty(Pid.TPC1)
        ned.pushProperty(Pid.TPC2)
        ned.pushProperty(Pid.FRET)
        ned.pushProperty(Pid.STRING)

        ed.addData(ned)
    }

    override drag(ed: EditData): RectF {
        const noteEditData = ed.getData(this) as NoteEditData | null
        if (!noteEditData) {
            return new RectF()
        }

        if (ed.isEditMode) {
            this.dragInEditMode(ed)
            return new RectF()
        }

        const delta = ed.evtDelta
        noteEditData.delta = delta.clone()

        if (noteEditData.mode === NoteEditMode.Undefined) {
            noteEditData.mode = NoteEditData.editModeByDragDirection(delta.x(), delta.y())
        }

        const isSingleNoteSelection = this.score().getSelectedElement() === this
        if (noteEditData.mode === NoteEditMode.AddSpacing && isSingleNoteSelection && !(ed.modifiers & KeyboardModifier.ControlModifier)) {
            this.horizontalDrag(ed)
        } else if (noteEditData.mode === NoteEditMode.ChangePitch) {
            this.verticalDrag(ed)
        }

        return new RectF()
    }

    override endDrag(ed: EditData): void {
        const ned = ed.getData(this) as NoteEditData | null
        if (!ned) {
            return
        }
        for (const nn of this.tiedNotes()) {
            for (const { id, data, f } of ned.propertyData) {
                this.setPropertyFlags(id, f) // reset initial property flags state
                this.score().undoPropertyChanged(nn, id, data)
            }
        }
    }

    private dragInEditMode(editData: EditData): void {
        const ch = this.chord()
        const seg = ch.segment()

        if (editData.modifiers & KeyboardModifier.ShiftModifier) {
            const deltaSp = new Spatium(editData.delta.x() / this.spatium())
            seg.undoChangeProperty(Pid.LEADING_SPACE, new Spatium(seg.extraLeadingSpace().val() + deltaSp.val()))
        } else if (ch.notes().length === 1) {
            // if the chord contains only this note, then move the whole chord
            // including stem, flag etc.
            ch.undoChangeProperty(Pid.OFFSET, ch.offset().plus(this.offset()).plus(editData.evtDelta))
            this.setOffset(new PointF())
        } else {
            this.setOffset(this.offset().plus(editData.evtDelta))
        }

        this.triggerLayout()
    }

    private verticalDrag(ed: EditData): void {
        const tick = this.chord().tick()
        if (this.part()!.instrument(tick)!.useDrumset()) {
            return
        }

        const ned = ed.getData(this) as NoteEditData

        const tab = this.staffType()!.isTabStaff()
        const step = this.spatium() * this.staffType()!.lineDistance().val() * (tab ? 1.0 : 0.5)
        const lineOffset = lrint(ed.moveDelta.y() / step)

        if (tab) {
            // TODO(port): tablature (string and fret of the dragged note)
        } else {
            const idx = this.chord().vStaffIdx()
            const firstTied = this.firstTiedNote()
            let [accOffs, error] = firstTied.chord().measure()!.findAccidentalAtLine(firstTied.chord().segment(), idx, ned.line + lineOffset)
            if (error) {
                accOffs = AccidentalVal.NATURAL // Accidental::subtype2value(AccidentalType::NONE)
            }
            let nStep = absStepFromLine(ned.line + lineOffset, this.score().staff(idx)!.clef(tick))
            nStep = Math.max(0, nStep)
            const octave = Math.trunc(nStep / 7)
            let newPitch = step2pitch(nStep) + octave * 12 + accOffs
            newPitch = Math.min(Math.max(newPitch, 0), 127)

            let newTpc1 = step2tpc(nStep % 7, accOffs)
            let newTpc2 = newTpc1
            if (this.concertPitch()) {
                newTpc2 = this.transposeTpc(newTpc1)
            } else {
                newPitch += this.staff()!.transpose(tick).chromatic
                newTpc1 = this.transposeTpc(newTpc2)
            }

            for (const nn of this.tiedNotes()) {
                nn.setAccidentalType(0 as AccidentalType) // AccidentalType::NONE
                nn.setPitch(newPitch, newTpc1, newTpc2)
                nn.triggerLayout()
            }
        }
        this.score().inputState().setAccidentalType(0 as AccidentalType) // AccidentalType::NONE
    }

    private horizontalDrag(ed: EditData): void {
        const ch = this.chord()
        const seg = ch.segment()

        const ned = ed.getData(this) as NoteEditData

        // TODO(port): normalizeLeftDragDelta (HorizontalSpacing::minHorizontalDistance limits the drag to the left)

        const deltaSp = ned.delta.x() / this.spatium()

        if (seg.extraLeadingSpace().val() + deltaSp < 0) {
            return
        }

        seg.undoChangeProperty(Pid.LEADING_SPACE, new Spatium(seg.extraLeadingSpace().val() + deltaSp))

        this.triggerLayout()
    }
}

enum NoteEditMode {
    Undefined,
    ChangePitch,
    AddSpacing,
}

/** C++ NoteEditData */
class NoteEditData extends ElementEditData {
    line = 0
    string = 0
    mode = NoteEditMode.Undefined
    delta = new PointF()

    override type(): EditDataType { return EditDataType.NoteEditData }

    static readonly MODE_TRANSITION_LIMIT_DEGREES = 15.0

    static editModeByDragDirection(deltaX: number, deltaY: number): NoteEditMode {
        const x = Math.abs(deltaX)
        const y = Math.abs(deltaY)

        const len = Math.sqrt(x * x + y * y)
        const nx = len ? x / len : 0

        // C++ computes the dot product in float
        const radians = Math.fround(nx)

        const degrees = (Math.acos(radians) * 180.0) / Math.PI

        if (degrees >= NoteEditData.MODE_TRANSITION_LIMIT_DEGREES) {
            return NoteEditMode.ChangePitch
        } else {
            return NoteEditMode.AddSpacing
        }
    }
}
