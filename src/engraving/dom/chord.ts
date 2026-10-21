/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chord.h/.cpp (and nextChordRest/prevChordRest of navigate.cpp)
 *
 * TODO(port): chord lines, stem slashes, percussion/tab note updates
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import {
    AccidentalRole, AutoOnOff, BeamMode, DirectionV, DurationType, ElementType, GuitarBendType, StaffGroup, TremoloChordType, TremoloType,
    type staff_idx_t, type track_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, itemFactories } from './engravingitem'
import { ChordRest, NoteType } from './chordrest'
import { Pid, PropertyFlags } from './property'
import { SelectType } from './select'
import type { EditData } from '../editing/editdata'
import { SegmentType, type Segment } from './segment'
import type { EngravingObject } from './engravingobject'
import type { Measure } from './measure'
import type { Note } from './note'
import type { Stem } from './stem'
import type { StemSlash } from './stemslash'
import type { Hook } from './hook'
import type { LedgerLine } from './ledgerline'
import { ArticulationAnchor, ArticulationsUpdateMode, splitArticulations, type Articulation } from './articulation'
import type { AccidentalState } from './key'
import type { Spanner } from './spanner'
import type { Tie } from './tie'
import type { TablatureMinimStyle } from './stafftype'
import type { Drumset } from './drumset'
import { TDuration } from './durationtype'
import { SymId } from '../types/symid'
import type { TremoloTwoChord } from './tremolotwochord'
import type { Trill } from './trill'
import type { TremoloSingleChord } from './tremolosinglechord'
import type { Parenthesis } from './parenthesis'

/** factories registered by the corresponding modules (avoid runtime import cycles) */
export const chordFactories: {
    createStem?: (chord: Chord) => Stem
    createHook?: (chord: Chord) => Hook
    createLedgerLine?: (chord: Chord) => LedgerLine
} = {}

export enum PlayEventType {
    Auto, ///< Play events for all notes are calculated by MuseScore.
    User, ///< Some play events are modified by user. Those events are written into the mscx file.
}

export class GraceNotesGroup extends EngravingItem {
    private m_chords: Chord[] = []
    private m_chord: Chord
    private m_appendedSegment: Segment | null = null // the graceNoteGroup is appended to this segment

    constructor(c: Chord) {
        super(ElementType.GRACE_NOTES_GROUP, null)
        this.m_chord = c
    }

    chords(): Chord[] { return this.m_chords }
    clear(): void { this.m_chords = [] }
    push(c: Chord): void { this.m_chords.push(c) }
    size(): number { return this.m_chords.length }
    empty(): boolean { return this.m_chords.length === 0 }
    at(i: number): Chord { return this.m_chords[i] }
    front(): Chord { return this.m_chords[0] }
    back(): Chord { return this.m_chords[this.m_chords.length - 1] }
    [Symbol.iterator](): Iterator<Chord> { return this.m_chords[Symbol.iterator]() }

    chordParent(): Chord { return this.m_chord }
    appendedSegment(): Segment | null { return this.m_appendedSegment }
    setAppendedSegment(s: Segment | null): void { this.m_appendedSegment = s }

    override setPos(x: number | PointF, y?: number): void {
        const p = x instanceof PointF ? x : new PointF(x, y)
        super.setPos(p)
        for (const chord of this.m_chords) {
            chord.mutldata().move(p)
        }
    }

    addToShape(): void {
        for (const grace of this.m_chords) {
            const yOffset = grace.staffOffset()
            const staffIdx = grace.staffIdx()
            const vStaffIdx = grace.vStaffIdx()
            const s = this.m_appendedSegment!.staffShape(staffIdx)
            s.add(grace.shape().translate(grace.pos().plus(yOffset)))
            if (vStaffIdx !== staffIdx) {
                const s2 = this.m_appendedSegment!.staffShape(vStaffIdx)
                s2.add(grace.shape().translate(grace.pos().plus(yOffset)))
            }
        }
    }
}

export interface StartEndSlurs {
    startUp: boolean
    startDown: boolean
    endUp: boolean
    endDown: boolean
}

export function noteIsBefore(n1: Note, n2: Note): boolean {
    const l1 = n1.line()
    const l2 = n2.line()
    if (l1 !== l2) {
        return l1 > l2
    }
    const p1 = n1.pitch()
    const p2 = n2.pitch()
    if (p1 !== p2) {
        return p1 < p2
    }
    if (n1.tieBack()) {
        const t1 = n1.tieBack()!
        const t2 = n2.tieBack()
        if (t2) {
            const sn1 = t1.startNote()
            const sn2 = t2.startNote()
            if (sn1 && sn2) {
                if (sn1.chord() === sn2.chord()) {
                    return sn1.unisonIndex() < sn2.unisonIndex()
                }
                return sn1.chord().segment().lessThan(sn2.chord().segment())
            }
            return false
        } else {
            return true // place tied notes before
        }
    }
    return false
}

function sortByNoteIsBefore(notes: Note[]): void {
    notes.sort((a, b) => noteIsBefore(a, b) ? -1 : (noteIsBefore(b, a) ? 1 : 0))
}

export class NoteParenthesisInfo {
    private m_notes: Note[]

    constructor(private m_leftParen: Parenthesis, private m_rightParen: Parenthesis, nList: Note[]) {
        this.m_notes = [...nList]
        sortByNoteIsBefore(this.m_notes)
    }

    leftParen(): Parenthesis { return this.m_leftParen }
    rightParen(): Parenthesis { return this.m_rightParen }
    notes(): readonly Note[] { return this.m_notes }

    insertNote(note: Note): void {
        let i = 0
        while (i < this.m_notes.length && !noteIsBefore(note, this.m_notes[i])) {
            ++i
        }
        this.m_notes.splice(i, 0, note)
    }

    removeNote(note: Note): void {
        const i = this.m_notes.indexOf(note)
        if (i >= 0) {
            this.m_notes.splice(i, 1)
        }
    }
}

export class Chord extends ChordRest {
    private m_noteParens: NoteParenthesisInfo[] = []
    private m_notes: Note[] = [] // sorted to decreasing line step
    private m_ledgerLines: LedgerLine[] = []
    private m_stem: Stem | null = null
    private m_hook: Hook | null = null
    private m_stemSlash: StemSlash | null = null // for grace notes
    private m_showStemSlash = false
    private m_arpeggio: EngravingItem | null = null
    private m_tremoloTwoChord: TremoloTwoChord | null = null
    private m_tremoloSingleChord: TremoloSingleChord | null = null
    private m_spanArpeggio: EngravingItem | null = null
    private m_endsNoteAnchoredLine = false
    private m_graceNotes: Chord[] = [] // storage for all grace notes
    private m_graceNotesBefore = new GraceNotesGroup(this)
    private m_graceNotesAfter = new GraceNotesGroup(this)
    private m_graceIndex = 0 // if this is a grace note, index in parent list
    private m_isTrillCueNote = false
    private m_stemDirection: DirectionV = DirectionV.AUTO
    private m_noteType: NoteType = NoteType.NORMAL // mark grace notes: acciaccatura and appoggiatura
    private m_noStem = false
    private m_playEventType = PlayEventType.Auto
    private m_spaceLw = 0.0
    private m_spaceRw = 0.0
    private m_defaultStemLength = 0.0
    private m_dotPosX = 0.0
    private m_startEndSlurs: StartEndSlurs = { startUp: false, startDown: false, endUp: false, endDown: false }
    private m_startingSpanners = new Set<Spanner>()
    private m_endingSpanners = new Set<Spanner>()
    private m_allowKerningAbove = true
    private m_allowKerningBelow = true
    private m_combineVoice: AutoOnOff = AutoOnOff.AUTO
    private m_articulations: Articulation[] = []
    private m_isChordPlayable = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.CHORD, parent)
    }

    override intrinsicMag(): number {
        let m = 1.0
        if (this.isSmall()) {
            m *= this.style().styleD(Sid.smallNoteMag)
        }
        if (this.m_noteType !== NoteType.NORMAL) {
            const tabGraceSizeException = this.staffType()!.isTabStaff() && this.isPreBendOrGraceBendStart()
                                          && !this.style().styleB(Sid.useCueSizeFretForGraceBends)
            if (!tabGraceSizeException) {
                m *= this.style().styleD(Sid.graceNoteMag)
            }
        }
        return m
    }

    override mag(): number {
        const st = this.staff()
        return (st ? st.staffMag(this) : 1.0) * this.intrinsicMag()
    }

    noteHeadWidth(): number {
        return this.score().noteHeadWidth() * this.mag()
    }

    setStemDirection(d: DirectionV): void { this.m_stemDirection = d }
    stemDirection(): DirectionV { return this.m_stemDirection }

    prev(): Chord | null {
        const p = prevChordRest(this)
        return p && p.isChord() ? p as Chord : null
    }

    next(): Chord | null {
        const n = nextChordRest(this)
        return n && n.isChord() ? n as Chord : null
    }

    ledgerLines(): LedgerLine[] { return this.m_ledgerLines }

    resizeLedgerLinesTo(newSize: number): void {
        const diff = newSize - this.m_ledgerLines.length
        if (diff > 0) {
            for (let i = 0; i < diff; ++i) {
                this.m_ledgerLines.push(chordFactories.createLedgerLine!(this))
            }
        } else {
            this.m_ledgerLines.length = newSize
        }
    }

    defaultStemLength(): number { return this.m_defaultStemLength }
    setDefaultStemLength(l: number): void { this.m_defaultStemLength = l }

    setBeamExtension(extension: number): void {
        if (this.m_stem) {
            const baseLength = this.m_stem.absoluteFromSpatium(this.m_stem.baseLength())
            this.m_stem.setBaseLength(new Spatium(Math.max((baseLength + extension) / this.spatium(), 0.0)))
            this.m_defaultStemLength = Math.max(this.m_defaultStemLength + extension,
                this.m_stem.absoluteFromSpatium(this.m_stem.baseLength()))
        }
    }

    notes(): Note[] { return this.m_notes }

    allElementsInvisible(): boolean {
        for (const child of this.children()) {
            if ((child as EngravingItem).visible()) {
                return false
            }
        }
        for (const grace of this.graceNotes()) {
            if (!grace.allElementsInvisible()) {
                return false
            }
        }
        return true
    }

    slash(): boolean {
        const n = this.upNote()
        return n.fixed()
    }

    upNote(): Note {
        let result = this.m_notes[this.m_notes.length - 1]
        const stf = this.staff()
        if (!stf) {
            return result
        }
        const st = stf.staffTypeForElement(this)
        if (st.isDrumStaff()) {
            for (const n of this.m_notes) {
                if (n.line() < result.line()) {
                    result = n
                }
            }
        } else if (st.isTabStaff()) {
            // TODO(port): tab staves (physStringToVisual)
        }
        return result
    }

    downNote(): Note {
        let result = this.m_notes[0]
        const stf = this.staff()
        if (!stf) {
            return result
        }
        const st = stf.staffTypeForElement(this)
        if (st.isDrumStaff()) {
            for (const n of this.m_notes) {
                if (n.line() > result.line()) {
                    result = n
                }
            }
        }
        return result
    }

    upLine(): number { return this.onTabStaff() ? this.upString() * 2 : this.upNote().line() }
    downLine(): number { return this.onTabStaff() ? this.downString() * 2 : this.downNote().line() }

    // ---------------------------------------------------------
    //   upString / downString
    //
    //    return the topmost / bottommost string used by chord
    //    Top and bottom refer to the DRAWN position, not the position in the instrument
    //    (i.e., upside-down TAB are taken into account)
    //
    //    If no staff, always return 0
    //    If staff is not a TAB, always returns TOP and BOTTOM staff lines
    // ---------------------------------------------------------

    upString(): number {
        // if no staff or staff not a TAB, return 0 (=topmost line)
        const st = this.staff()
        if (!st) {
            return 0
        }

        const tab = st.staffTypeForElement(this)
        if (!tab.isTabStaff()) {
            return 0
        }

        let line = tab.lines() - 1 // start at bottom line
        // scan each note: if TAB strings are not in sequential order,
        // visual order of notes might not correspond to pitch order
        for (const note of this.m_notes) {
            const noteLine = tab.physStringToVisual(note.string())
            if (noteLine < line) {
                line = noteLine
            }
        }
        return line
    }

    downString(): number {
        const st = this.staff()
        if (!st) { // if no staff, return 0
            return 0
        }

        const tab = st.staffTypeForElement(this)
        if (!tab.isTabStaff()) { // if staff not a TAB, return bottom line
            return st.lines(this.tick()) - 1
        }

        let line = 0 // start at top line
        for (const note of this.m_notes) {
            const noteLine = tab.physStringToVisual(note.string())
            if (noteLine > line) {
                line = noteLine
            }
        }
        return line
    }

    line(up?: boolean): number {
        if (up === undefined) {
            up = this.ldata().up
        }
        return up ? this.upLine() : this.downLine()
    }

    noteDistances(): number[] {
        const staffType = this.staffType()!
        const isTabStaff = staffType.isTabStaff()
        const staffMiddleLine = staffType.middleLine()
        const distances: number[] = []
        for (const note of this.m_notes) {
            const noteLine = isTabStaff ? note.string() : note.line()
            distances.push(noteLine - staffMiddleLine)
        }
        return distances
    }

    maxHeadWidth(): number {
        let hw = 0
        for (const n of this.m_notes) {
            const t = n.headWidth()
            if (t > hw) {
                hw = t
            }
        }
        return hw
    }

    findNote(pitch: number, skip = 0): Note | null {
        let ns = 0
        for (const n of this.m_notes) {
            if (n.pitch() === pitch) {
                if (ns === skip) {
                    return n
                }
                ++ns
            }
        }
        return null
    }

    stem(): Stem | null { return this.m_stem }
    hook(): Hook | null { return this.m_hook }
    setHook(h: Hook | null): void { this.m_hook = h }
    arpeggio(): EngravingItem | null { return this.m_arpeggio }
    spanArpeggio(): EngravingItem | null { return this.m_spanArpeggio }
    setSpanArpeggio(a: EngravingItem | null): void { this.m_spanArpeggio = a }
    setArpeggio(a: EngravingItem | null): void { this.m_arpeggio = a }
    stemSlash(): StemSlash | null { return this.m_stemSlash }
    showStemSlash(): boolean { return this.m_showStemSlash }

    override isUserModified(): boolean {
        if (this.showStemSlash() !== (this.propertyDefault(Pid.SHOW_STEM_SLASH) as boolean)) {
            return true
        }
        return super.isUserModified()
    }
    setShowStemSlash(show: boolean): void { this.m_showStemSlash = show }

    setShowStemSlashInAdvance(): void {
        if (this.m_noteType === NoteType.NORMAL) {
            return
        }
        if (this.isGraceBefore()) {
            const graceBefore = (this.explicitParent() as unknown as Chord).graceNotesBefore()
            const grace = graceBefore.empty() ? null : graceBefore.front()
            if (grace && grace.beamMode() !== BeamMode.NONE && grace.beamMode() !== BeamMode.BEGIN) {
                grace.requestShowStemSlash(this.showStemSlash())
            }
        }
        if (this.isGraceAfter()) {
            const graceAfter = (this.explicitParent() as unknown as Chord).graceNotesAfter()
            const grace = graceAfter.empty() ? null : graceAfter.back()
            if (grace && grace.beamMode() !== BeamMode.NONE) {
                grace.requestShowStemSlash(this.showStemSlash())
            }
        }
    }

    requestShowStemSlash(show: boolean): void {
        if (this.m_noteType === NoteType.NORMAL) {
            return
        }
        const beam = this.beam()
        if (beam) {
            for (const chordRest of beam.elements()) {
                if (chordRest.isChord()) {
                    (chordRest as unknown as Chord).setShowStemSlash(show)
                }
            }
        } else {
            this.setShowStemSlash(show)
        }
    }

    noteParentheses(): readonly NoteParenthesisInfo[] { return this.m_noteParens }

    /** C++ findNoteParenthesisInfo(const Note*) / findNoteParenthesisInfo(const Parenthesis*) */
    findNoteParenthesisInfo(item: Note | Parenthesis): NoteParenthesisInfo | null {
        for (const info of this.m_noteParens) {
            if (item.isParenthesis()) {
                if (item === info.leftParen() || item === info.rightParen()) {
                    return info
                }
            } else if (info.notes().includes(item as Note)) {
                return info
            }
        }
        return null
    }

    addNoteParenthesisInfo(noteParenInfo: NoteParenthesisInfo): void {
        this.m_noteParens.push(noteParenInfo)
    }

    removeNoteParenthesisInfo(noteParenInfo: NoteParenthesisInfo | null): void {
        if (!noteParenInfo) {
            return
        }
        const i = this.m_noteParens.indexOf(noteParenInfo)
        if (i >= 0) {
            this.m_noteParens.splice(i, 1)
        }
    }

    addNoteToParenthesisInfo(note: Note, paren: Parenthesis): void {
        const noteParenInfo = this.findNoteParenthesisInfo(paren)

        if (!noteParenInfo) {
            return
        }

        noteParenInfo.insertNote(note)
    }

    removeNoteFromParenthesisInfo(note: Note, paren: Parenthesis): void {
        const noteParenInfo = this.findNoteParenthesisInfo(paren)

        if (!noteParenInfo) {
            return
        }

        noteParenInfo.removeNote(note)
    }

    tremoloType(): TremoloType {
        if (this.m_tremoloSingleChord) {
            return this.m_tremoloSingleChord.tremoloType()
        } else if (this.m_tremoloTwoChord) {
            return this.m_tremoloTwoChord.tremoloType()
        }
        return TremoloType.INVALID_TREMOLO
    }

    tremoloTwoChord(): TremoloTwoChord | null { return this.m_tremoloTwoChord }
    tremoloSingleChord(): TremoloSingleChord | null { return this.m_tremoloSingleChord }

    setTremoloTwoChord(tr: TremoloTwoChord | null, applyLogic = true): void {
        if (this.m_tremoloTwoChord && tr && tr === this.m_tremoloTwoChord) {
            return
        }

        if (this.m_tremoloTwoChord) {
            this.resetTremoloTwoChordDuration()
        }
        this.m_tremoloSingleChord = null

        if (tr && applyLogic) {
            let d = tr.durationType()
            if (!d.isValid()) {
                d = this.durationType()
                const dots = d.dots()
                d = d.shift(-1)
                d.setDots(dots)
                tr.setDurationType(d)
            }

            this.setDurationType(d)
            const other = tr.chord1() === this ? tr.chord2() : tr.chord1()
            this.m_tremoloTwoChord = tr
            if (other) {
                other.setTremoloTwoChord(tr)
            }
        }

        this.m_tremoloTwoChord = tr
    }

    setTremoloSingleChord(tr: TremoloSingleChord | null): void {
        if (this.m_tremoloSingleChord && tr && tr === this.m_tremoloSingleChord) {
            return
        }

        if (this.m_tremoloTwoChord) {
            this.resetTremoloTwoChordDuration()
        }

        this.m_tremoloSingleChord = tr
    }

    /** common part of C++ setTremoloTwoChord/setTremoloSingleChord */
    private resetTremoloTwoChordDuration(): void {
        const trem = this.m_tremoloTwoChord!
        let d: TDuration
        const f = this.ticks()
        if (f.numerator() > 0) {
            d = new TDuration(f)
        } else {
            d = trem.durationType()
            const dots = d.dots()
            d = d.shift(1)
            d.setDots(dots)
        }

        this.setDurationType(d)
        const other = trem.chord1() === this ? trem.chord2() : trem.chord1()
        this.m_tremoloTwoChord = null
        if (other) {
            other.setTremoloTwoChord(null)
        }
    }

    tremoloChordType(): TremoloChordType {
        if (this.m_tremoloTwoChord) {
            if (this.m_tremoloTwoChord.chord1() === this) {
                return TremoloChordType.TremoloFirstChord
            } else if (this.m_tremoloTwoChord.chord2() === this) {
                return TremoloChordType.TremoloSecondChord
            }
        } else if (this.m_tremoloSingleChord) {
            return TremoloChordType.TremoloSingle
        }
        return TremoloChordType.TremoloNone
    }
    chordLine(): EngravingItem | null {
        for (const item of this.el()) {
            if (item && item.isChordLine()) {
                return item
            }
        }

        return null
    }

    endsNoteAnchoredLine(): boolean { return this.m_endsNoteAnchoredLine }
    setEndsNoteAnchoredLine(val: boolean): void { this.m_endsNoteAnchoredLine = val }

    graceNotes(): Chord[] { return this.m_graceNotes }

    override removeMarkings(keepTremolo = false): void {
        if (this.m_tremoloSingleChord && !keepTremolo) {
            this.remove(this.m_tremoloSingleChord)
        }

        if (this.m_tremoloTwoChord && !keepTremolo) {
            this.remove(this.m_tremoloTwoChord)
        }

        if (this.arpeggio()) {
            this.remove(this.arpeggio()!)
        }

        if (this.m_spanArpeggio) {
            this.m_spanArpeggio = null
        }

        this.m_graceNotes.length = 0
        this.m_articulations.length = 0
        for (const n of this.notes()) {
            for (const e of [...n.el()]) {
                n.remove(e)
            }
        }
        super.removeMarkings(keepTremolo)
    }

    firstGraceOrNote(): Note {
        const graceNotesBefore = this.graceNotesBefore().chords()
        if (graceNotesBefore.length) {
            return graceNotesBefore[0].notes()[0]
        }
        return this.notes()[this.notes().length - 1]
    }

    graceNotesBefore(): GraceNotesGroup {
        this.m_graceNotesBefore.clear()
        for (const c of this.m_graceNotes) {
            if (c.noteType() & (NoteType.ACCIACCATURA | NoteType.APPOGGIATURA | NoteType.GRACE4 | NoteType.GRACE16
                                | NoteType.GRACE32)) {
                this.m_graceNotesBefore.push(c)
            }
        }
        return this.m_graceNotesBefore
    }

    graceNotesAfter(): GraceNotesGroup {
        this.m_graceNotesAfter.clear()
        for (let i = this.m_graceNotes.length - 1; i >= 0; i--) {
            const c = this.m_graceNotes[i]
            if (c.noteType() & (NoteType.GRACE8_AFTER | NoteType.GRACE16_AFTER | NoteType.GRACE32_AFTER)) {
                this.m_graceNotesAfter.push(c)
            }
        }
        return this.m_graceNotesAfter
    }

    graceIndex(): number { return this.m_graceIndex }
    setGraceIndex(val: number): void { this.m_graceIndex = val }

    override rightEdge(): number {
        let right = 0.0
        for (const n of this.m_notes) {
            right = Math.max(right, this.x() + n.x() + n.bboxRightPos())
        }
        return right
    }

    underBeam(): boolean {
        if (this.m_noteType === NoteType.NORMAL) {
            return false
        }
        const cr = this.explicitParent() as unknown as Chord
        const beam = cr.beam()
        if (!beam || !beam.up()) {
            return false
        }
        const s = beam.elements().length
        if (this.isGraceBefore()) {
            if (beam.elements()[0] !== cr) {
                return true
            }
        }
        if (this.isGraceAfter()) {
            if (beam.elements()[s - 1] !== cr) {
                return true
            }
        }
        return false
    }

    override add(e: EngravingItem): void {
        if (e.explicitParent() !== this) {
            e.setParent(this)
        }
        e.setTrack(this.track())
        switch (e.type()) {
        case ElementType.NOTE: {
            const note = e as Note
            const tab = !!this.staff() && this.staff()!.isTabStaff(this.tick())
            let found = false
            for (let idx = 0; idx < this.m_notes.length; ++idx) {
                if (tab) {
                    if (note.string() > this.m_notes[idx].string()) {
                        this.m_notes.splice(idx, 0, note)
                        found = true
                        break
                    }
                } else if (note.pitch() <= this.m_notes[idx].pitch()) {
                    if (note.pitch() === this.m_notes[idx].pitch() && note.line() >= this.m_notes[idx].line()) {
                        this.m_notes.splice(idx + 1, 0, note)
                    } else {
                        this.m_notes.splice(idx, 0, note)
                    }
                    found = true
                    break
                }
            }
            if (!found) {
                this.m_notes.push(note)
            }
            if (this.voice() && this.explicitParent() && note.visible()) {
                const m = this.measure()
                if (m) {
                    m.setHasVoices(this.staffIdx(), true)
                }
            }
            break
        }
        case ElementType.ARPEGGIO:
            this.m_arpeggio = e
            break
        case ElementType.TREMOLO_TWOCHORD:
            this.setTremoloTwoChord(e as TremoloTwoChord)
            break
        case ElementType.TREMOLO_SINGLECHORD:
            this.setTremoloSingleChord(e as TremoloSingleChord)
            break
        case ElementType.CHORD_BRACKET:
        case ElementType.CHORDLINE:
            this.addEl(e)
            break
        case ElementType.GLISSANDO:
            this.m_endsNoteAnchoredLine = true
            break
        case ElementType.STEM:
            this.m_stem = e as Stem
            break
        case ElementType.HOOK:
            this.m_hook = e as Hook
            break
        case ElementType.STEM_SLASH:
            this.m_stemSlash = e as StemSlash
            break
        case ElementType.CHORD: {
            const gc = e as Chord
            const idx = gc.graceIndex()
            gc.setFlag(ElementFlag.MOVABLE, true)
            this.m_graceNotes.splice(idx, 0, gc)
            break
        }
        case ElementType.ARTICULATION:
        case ElementType.ORNAMENT:
        case ElementType.TAPPING: {
            const a = e as Articulation
            if (a.layoutCloseToNote()) {
                if (a.isStaccato()) {
                    this.m_articulations.unshift(a)
                } else {
                    let i = 0
                    while (i < this.m_articulations.length && this.m_articulations[i].layoutCloseToNote()) {
                        i++
                    }
                    this.m_articulations.splice(i, 0, a)
                }
            } else {
                this.m_articulations.push(a)
            }
            break
        }
        default:
            super.add(e)
            return
        }
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.NOTE: {
            const i = this.m_notes.indexOf(e as Note)
            if (i >= 0) {
                this.m_notes.splice(i, 1)
            }
            break
        }
        case ElementType.ARPEGGIO:
            if (this.m_spanArpeggio === this.m_arpeggio) {
                this.m_spanArpeggio = null
            }
            this.m_arpeggio = null
            break
        case ElementType.TREMOLO_TWOCHORD:
            this.setTremoloTwoChord(null)
            break
        case ElementType.TREMOLO_SINGLECHORD:
            this.setTremoloSingleChord(null)
            break
        case ElementType.CHORD_BRACKET:
        case ElementType.CHORDLINE:
            this.removeEl(e)
            break
        case ElementType.STEM:
            this.m_stem = null
            break
        case ElementType.HOOK:
            this.m_hook = null
            break
        case ElementType.STEM_SLASH:
            this.m_stemSlash = null
            break
        case ElementType.CHORD: {
            const i = this.m_graceNotes.indexOf(e as Chord)
            if (i >= 0) {
                (e as Chord).setGraceIndex(i)
                this.m_graceNotes.splice(i, 1)
            }
            break
        }
        case ElementType.ARTICULATION:
        case ElementType.ORNAMENT:
        case ElementType.TAPPING: {
            const i = this.m_articulations.indexOf(e as Articulation)
            if (i >= 0) {
                this.m_articulations.splice(i, 1)
            }
            break
        }
        default:
            super.remove(e)
            return
        }
    }

    hasArticulation(aa: Articulation): Articulation | null {
        for (const a of this.m_articulations) {
            if (a.subtype() === aa.subtype()) {
                return a
            }
        }
        return null
    }

    articulationSymbolIds(): Set<SymId> {
        return new Set(this.m_articulations.map(a => a.symId()))
    }

    updateArticulations(newArticulationIds: ReadonlySet<SymId>, updateMode = ArticulationsUpdateMode.Insert): void {
        const createArticulation = (): Articulation => itemFactories.createItem!(ElementType.ARTICULATION, this) as Articulation
        let staccato: Articulation | null = null
        let accent: Articulation | null = null
        let marcato: Articulation | null = null
        let tenuto: Articulation | null = null
        let overallAnchor = ArticulationAnchor.AUTO
        let mixedDirections = false
        if (this.m_articulations.length) {
            const articsToRemove: Articulation[] = []
            // split all articulations
            for (const artic of [...this.m_articulations]) {
                if (!artic.isDouble()) {
                    continue
                }
                const splitSyms = splitArticulations([artic.symId()])
                for (const id of splitSyms) {
                    const newArticulation = createArticulation()
                    newArticulation.setSymId(id)
                    newArticulation.setAnchor(artic.anchor())
                    newArticulation.setPropertyFlags(Pid.ARTICULATION_ANCHOR, artic.propertyFlags(Pid.ARTICULATION_ANCHOR))
                    if (!this.hasArticulation(newArticulation)) {
                        this.score().toggleArticulation(this, newArticulation)
                    }
                }
                articsToRemove.push(artic)
            }
            for (const artic of articsToRemove) {
                this.score().undoRemoveElement(artic)
            }
            // now we have guaranteed no more combined artics
            // take an inventory of which articulations are already present
            for (const artic of this.m_articulations) {
                const pf = artic.propertyFlags(Pid.ARTICULATION_ANCHOR)
                if (!mixedDirections && pf === PropertyFlags.UNSTYLED && artic.anchor() !== ArticulationAnchor.AUTO) {
                    if (overallAnchor !== ArticulationAnchor.AUTO && artic.anchor() !== overallAnchor) {
                        mixedDirections = true
                        overallAnchor = ArticulationAnchor.AUTO
                    } else {
                        overallAnchor = artic.anchor()
                    }
                }
                if (artic.isStaccato()) {
                    staccato = artic
                } else if (artic.isAccent()) {
                    accent = artic
                } else if (artic.isMarcato()) {
                    marcato = artic
                } else if (artic.isTenuto()) {
                    tenuto = artic
                }
            }
        }
        const newArtics = new Set<SymId>()
        // get symbol id's for correct direction
        for (const id of newArticulationIds) {
            if (id === SymId.articAccentAbove || id === SymId.articAccentBelow) {
                if (marcato && updateMode === ArticulationsUpdateMode.Insert) {
                    // adding an accent, which replaces marcato
                    this.score().undoRemoveElement(marcato)
                }
            } else if (id === SymId.articMarcatoAbove || id === SymId.articMarcatoBelow) {
                if (accent && updateMode === ArticulationsUpdateMode.Insert) {
                    // adding a marcato, which replaces accent
                    this.score().undoRemoveElement(accent)
                }
            }
            newArtics.add(id)
        }

        // newArtics now contains the articulations in the correct direction
        if (updateMode === ArticulationsUpdateMode.Remove) {
            // remove articulations from _articulations that are found in in newArtics
            // (C++ undoRemoveElement(nullptr) does nothing)
            for (const id of [...newArtics].sort((a, b) => a - b)) {
                switch (id) {
                case SymId.articAccentAbove:
                case SymId.articAccentBelow:
                    if (accent) {
                        this.score().undoRemoveElement(accent)
                    }
                    accent = null
                    break
                case SymId.articMarcatoAbove:
                case SymId.articMarcatoBelow:
                    if (marcato) {
                        this.score().undoRemoveElement(marcato)
                    }
                    marcato = null
                    break
                case SymId.articTenutoAbove:
                case SymId.articTenutoBelow:
                    if (tenuto) {
                        this.score().undoRemoveElement(tenuto)
                    }
                    tenuto = null
                    break
                case SymId.articStaccatoAbove:
                case SymId.articStaccatoBelow:
                    if (staccato) {
                        this.score().undoRemoveElement(staccato)
                    }
                    staccato = null
                    break
                default:
                    break
                }
            }
        } else {
            // add articulations from newArtics that are not found in m_articulations
            for (const id of [...newArtics].sort((a, b) => a - b)) {
                const newArticulation = createArticulation()
                newArticulation.setSymId(id)
                if (overallAnchor !== ArticulationAnchor.AUTO) {
                    newArticulation.setAnchor(overallAnchor)
                    newArticulation.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
                }
                if (!this.hasArticulation(newArticulation)) {
                    this.score().toggleArticulation(this, newArticulation)
                }
            }
        }
    }

    /** the only selected note of the chord, null if none or several are selected */
    selectedNote(): Note | null {
        let note: Note | null = null
        for (const currentNote of this.m_notes) {
            if (currentNote.selected()) {
                if (note) {
                    return null
                }
                note = currentNote
            }
        }
        return note
    }

    tapping(): Articulation | null {
        return this.m_articulations.find(a => a.isTapping()) ?? null
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!
        switch (e.type()) {
        case ElementType.ARTICULATION:
        case ElementType.ORNAMENT:
        case ElementType.TAPPING: {
            let atr: Articulation | null = e as unknown as Articulation
            const oa = this.hasArticulation(atr)
            if (oa) {
                atr = null
                // if attribute is already there, remove
                // score()->cmdRemove(oa); // unexpected behaviour?
                this.score().select(oa, SelectType.SINGLE, 0)
            } else {
                // intuit anchor for this accidental based on other accidentals in the chord
                let aboveBelow = 0
                let mixed = false
                for (const a of this.m_articulations) {
                    const pf = a.propertyFlags(Pid.ARTICULATION_ANCHOR)
                    if (pf === PropertyFlags.STYLED) {
                        continue
                    }
                    if (a.anchor() === ArticulationAnchor.TOP) {
                        if (aboveBelow < 0) {
                            mixed = true
                            break
                        }
                        ++aboveBelow
                    } else if (a.anchor() === ArticulationAnchor.BOTTOM) {
                        if (aboveBelow > 0) {
                            mixed = true
                            break
                        }
                        --aboveBelow
                    }
                }
                if (!mixed && aboveBelow !== 0) {
                    if (aboveBelow > 0) {
                        atr.setAnchor(ArticulationAnchor.TOP)
                    } else {
                        atr.setAnchor(ArticulationAnchor.BOTTOM)
                    }
                    atr.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
                }
                atr.setParent(this)
                atr.setTrack(this.track())

                // Immediately add if the chord has no existing articulations, toggle otherwise...
                if (this.m_articulations.length === 0) {
                    this.score().undoAddElement(atr)
                } else {
                    this.score().toggleArticulation(this, atr)
                }
            }
            return atr
        }

        case ElementType.CHORDLINE:
            e.setParent(this)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            break

        case ElementType.TREMOLO_SINGLECHORD:
            if (this.tremoloSingleChord()) {
                const sameType = (e.subtype() === this.tremoloSingleChord()!.subtype())
                this.score().undoRemoveElement(this.tremoloSingleChord())
                if (sameType) {
                    return null
                }
            }
            e.setParent(this)
            e.setTrack(this.track())
            this.score().undoAddElement(e)
            break

        // TODO(port): TREMOLO_TWOCHORD (find the second chord, TremoloTwoChord::setChords)

        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET: {
            const a = e
            if (this.arpeggio() && a.isArpeggio()) {
                this.score().undoRemoveElement(this.arpeggio())
            }
            a.setTrack(this.track())
            a.setParent(this)
            this.score().undoAddElement(a)
            return e
        }

        default:
            return super.drop(data)
        }
        return null
    }

    override upPos(): number { return this.upNote().pos().y() }
    override downPos(): number { return this.downNote().pos().y() }

    override pagePos(): PointF {
        if (!this.isGrace()) {
            return super.pagePos()
        }
        const p = this.pos()
        if (!this.explicitParent()) {
            return p
        }
        p.setX(this.pageX())
        const pc = this.explicitParent() as unknown as Chord
        const system = pc.segment().system()
        if (!system) {
            return p
        }
        p.setY(p.y() + system.staffYpage(this.vStaffIdx()) + this.staffOffsetY())
        return p
    }

    cmdUpdateNotes(as: AccidentalState, staffIdx: staff_idx_t): void {
        const st = this.staff()!
        let staffGroup = st.staffTypeForElement(this).group()
        if (staffGroup === StaffGroup.TAB) {
            const tick = this.tick()
            const stringData = this.part()!.stringData(tick, st.idx())
            for (const ch of this.graceNotes()) {
                stringData.fretChords(ch)
            }
            stringData.fretChords(this)
            return
        } else {
            staffGroup = st.part().instrument(this.tick()).useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
        }

        if (staffGroup === StaffGroup.STANDARD) {
            for (const ch of [...this.graceNotesBefore()]) {
                if (ch.vStaffIdx() !== staffIdx) {
                    continue
                }
                for (const note of [...ch.notes()]) {
                    note.updateAccidental(as)
                }
                ch.sortNotes()
            }
            if (this.vStaffIdx() === staffIdx) {
                for (const note of [...this.notes()]) {
                    const tb = note.tieBack()
                    if (tb && !note.incomingPartialTie() && tb.startNote() && note.tpc() === tb.startNote()!.tpc()) {
                        // same pitch
                        const acc = note.accidental()
                        if (acc && acc.role() === AccidentalRole.AUTO) {
                            note.remove(acc)
                        }
                    }
                    note.updateAccidental(as)
                }
                for (const art of this.m_articulations) {
                    if (!art.isOrnament()) {
                        continue
                    }
                    (art as unknown as { computeNotesAboveAndBelow(as: AccidentalState): void }).computeNotesAboveAndBelow(as)
                }
                for (const spanner of this.m_startingSpanners) {
                    if (spanner.isTrill()) {
                        const ornament = (spanner as unknown as { ornament(): EngravingItem | null }).ornament()
                        if (ornament) {
                            ornament.setParent(this)
                            ;(ornament as unknown as { computeNotesAboveAndBelow(as: AccidentalState): void }).computeNotesAboveAndBelow(as)
                        }
                    }
                }
                this.sortNotes()
            }
            for (const ch of [...this.graceNotesAfter()]) {
                if (ch.vStaffIdx() !== staffIdx) {
                    continue
                }
                for (const note of [...ch.notes()]) {
                    note.updateAccidental(as)
                }
                ch.sortNotes()
            }
        } else if (staffGroup === StaffGroup.PERCUSSION) {
            const instrument = this.part()!.instrument(this.tick())
            updatePercussionNotes(this, instrument.drumset())
            this.sortNotes()
        }
    }

    noteType(): NoteType { return this.m_noteType }

    setNoteType(t: NoteType): void {
        this.m_noteType = t
        this.m_showStemSlash = this.m_noteType === NoteType.ACCIACCATURA
    }

    override isGrace(): boolean { return this.m_noteType !== NoteType.NORMAL }

    override isGraceBefore(): boolean {
        return (this.m_noteType & (NoteType.ACCIACCATURA | NoteType.APPOGGIATURA | NoteType.GRACE4 | NoteType.GRACE16
                                   | NoteType.GRACE32)) !== 0
    }

    override isGraceAfter(): boolean {
        return (this.m_noteType & (NoteType.GRACE8_AFTER | NoteType.GRACE16_AFTER | NoteType.GRACE32_AFTER)) !== 0
    }

    isPreBendOrGraceBendStart(): boolean {
        if (!this.isGrace()) {
            return false
        }

        for (const note of this.m_notes) {
            const gb = note.bendFor()
            if (gb && (gb.bendType() === GuitarBendType.PRE_BEND || gb.bendType() === GuitarBendType.GRACE_NOTE_BEND
                       || gb.bendType() === GuitarBendType.PRE_DIVE)) {
                return true
            }
        }

        return false
    }

    isGraceBendEnd(): boolean {
        if (this.isGrace() || this.m_graceNotes.length === 0) {
            return false
        }

        for (const note of this.m_notes) {
            const bendBack = note.bendBack()
            if (bendBack && bendBack.bendType() === GuitarBendType.GRACE_NOTE_BEND) {
                return true
            }
        }

        return false
    }
    isTrillCueNote(): boolean { return this.m_isTrillCueNote }
    setIsTrillCueNote(v: boolean): void { this.m_isTrillCueNote = v }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)
        const f = (e: EngravingItem): void => e.setTrack(val)
        if (this.m_hook) {
            f(this.m_hook)
        }
        if (this.m_stem) {
            f(this.m_stem)
        }
        if (this.m_stemSlash) {
            f(this.m_stemSlash)
        }
        if (this.m_arpeggio) {
            f(this.m_arpeggio)
        }
        if (this.m_tremoloTwoChord) {
            f(this.m_tremoloTwoChord)
        }
        if (this.m_tremoloSingleChord) {
            f(this.m_tremoloSingleChord)
        }
        for (const ll of this.m_ledgerLines) {
            f(ll)
        }
        for (const a of this.m_articulations) {
            f(a)
        }
        for (const n of this.m_notes) {
            f(n)
        }
        for (const c of this.m_graceNotes) {
            f(c)
        }
    }

    dotPosX(): number { return this.m_dotPosX }
    setDotPosX(x: number): void { this.m_dotPosX = x }
    noStem(): boolean { return this.m_noStem }
    setNoStem(val: boolean): void { this.m_noStem = val }
    spaceLw(): number { return this.m_spaceLw }
    setSpaceLw(lw: number): void { this.m_spaceLw = lw }
    spaceRw(): number { return this.m_spaceRw }
    setSpaceRw(rw: number): void { this.m_spaceRw = rw }

    combineVoice(): AutoOnOff { return this.m_combineVoice }
    setCombineVoice(v: AutoOnOff): void { this.m_combineVoice = v }
    shouldCombineVoice(): boolean {
        return this.combineVoice() === AutoOnOff.ON
               || (this.combineVoice() === AutoOnOff.AUTO && this.style().styleB(Sid.combineVoice))
    }
    static combineVoices(chord1: Chord, chord2: Chord): boolean {
        return chord1.shouldCombineVoice() && chord2.shouldCombineVoice()
    }

    playEventType(): PlayEventType { return this.m_playEventType }
    setPlayEventType(v: PlayEventType): void { this.m_playEventType = v }
    isChordPlayable(): boolean { return this.m_isChordPlayable }
    setIsChordPlayable(v: boolean): void { this.m_isChordPlayable = v }

    articulations(): Articulation[] { return this.m_articulations }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.NO_STEM: return this.noStem()
        case Pid.SHOW_STEM_SLASH: return this.showStemSlash()
        case Pid.STEM_DIRECTION: return this.stemDirection()
        case Pid.PLAY: return this.isChordPlayable()
        case Pid.COMBINE_VOICE: return this.combineVoice()
        case Pid.VISIBLE: return true // Chord cannot be set invisible, only its elements can
        default:
            return super.getProperty(propertyId)
        }
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.NO_STEM: return false
        case Pid.SHOW_STEM_SLASH: return this.noteType() === NoteType.ACCIACCATURA
        case Pid.STEM_DIRECTION: return DirectionV.AUTO
        case Pid.PLAY: return true
        case Pid.COMBINE_VOICE: return AutoOnOff.AUTO
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.NO_STEM:
            this.setNoStem(!!v)
            break
        case Pid.SHOW_STEM_SLASH:
            this.setShowStemSlash(!!v)
            break
        case Pid.STEM_DIRECTION:
            this.setStemDirection(v as DirectionV)
            break
        case Pid.PLAY:
            this.setIsChordPlayable(!!v)
            break
        case Pid.COMBINE_VOICE:
            this.setCombineVoice(v as AutoOnOff)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override segment(): Segment {
        let e = this.parentItem()
        for (; e && !e.isSegment(); e = e.parentItem()) {
            // nothing
        }
        return e as unknown as Segment
    }

    override measure(): Measure {
        let e = this.parentItem()
        for (; e && !e.isMeasure(); e = e.parentItem()) {
            // nothing
        }
        return e as unknown as Measure
    }

    sortNotes(): void { sortByNoteIsBefore(this.m_notes) }

    nextTiedChord(backwards = false, sameSize = true): Chord | null {
        const nextSeg = backwards ? this.segment().prev1(SegmentType.ChordRest) : this.segment().next1(SegmentType.ChordRest)
        if (!nextSeg) {
            return null
        }
        const nextCR = nextSeg.nextChordRest(this.track(), backwards)
        if (!nextCR || !nextCR.isChord()) {
            return null
        }
        const next = nextCR as Chord
        if (sameSize && this.notes().length !== next.notes().length) {
            return null // sizes don't match so some notes can't be tied
        }
        if (this.tuplet() !== next.tuplet()) {
            return null // next chord belongs to a different tuplet
        }
        for (const n of this.m_notes) {
            const tie: Tie | null = backwards ? n.tieBack() : n.tieFor()
            if (!tie) {
                return null // not tied
            }
            const nn = backwards ? tie.startNote() : tie.endNote()
            if (!nn || nn.chord() !== next) {
                return null // tied to note in wrong voice, or tied over rest
            }
        }
        return next // all notes in this chord are tied to notes in next chord
    }

    endTickIncludingTied(): Fraction {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let lastTied: Chord = this
        for (;;) {
            const next = lastTied.nextTiedChord()
            if (!next) {
                break
            }
            lastTied = next
        }
        return lastTied.endTick()
    }

    allowKerningAbove(): boolean { return this.m_allowKerningAbove }
    allowKerningBelow(): boolean { return this.m_allowKerningBelow }

    computeKerningExceptions(): void {
        this.m_allowKerningAbove = true
        this.m_allowKerningBelow = true
        for (const art of this.m_articulations) {
            if (art.up()) {
                this.m_allowKerningAbove = false
            } else {
                this.m_allowKerningBelow = false
            }
        }
        if ((this.m_startEndSlurs.startUp || this.m_startEndSlurs.endUp) && !this.ldata().up) {
            this.m_allowKerningAbove = false
        }
        if ((this.m_startEndSlurs.startDown || this.m_startEndSlurs.endDown) && this.ldata().up) {
            this.m_allowKerningBelow = false
        }
    }

    findOrnament(forPlayback = false): EngravingItem | null {
        for (const art of this.m_articulations) {
            if (art.isOrnament()) {
                return art
            }
        }
        for (const spanner of this.m_startingSpanners) {
            if (spanner.isTrill()) {
                return (spanner as unknown as Trill).ornament()
            }
        }
        if (forPlayback) {
            for (const spanner of this.m_endingSpanners) {
                if (spanner.isTrill()) {
                    return (spanner as unknown as Trill).ornament()
                }
            }
        }
        return null
    }

    startingSpanners(): Set<Spanner> { return this.m_startingSpanners }
    endingSpanners(): Set<Spanner> { return this.m_endingSpanners }
    addStartingSpanner(s: Spanner): void { this.m_startingSpanners.add(s) }
    removeStartingSpanner(s: Spanner): void { this.m_startingSpanners.delete(s) }
    addEndingSpanner(s: Spanner): void { this.m_endingSpanners.add(s) }
    removeEndingSpanner(s: Spanner): void { this.m_endingSpanners.delete(s) }

    shouldHaveStem(): boolean {
        const staff = this.staff()
        const staffType = staff ? staff.staffTypeForElement(this) : null
        return !this.m_noStem
               && this.durationType().hasStem()
               && !(this.durationType().type() === DurationType.V_HALF && staffType && staffType.isTabStaff()
                    && staffType.minimStyle() === (0 as TablatureMinimStyle /* NONE */))
               && !(this.explicitParent() && this.measure() && this.measure().stemless(this.staffIdx()))
               && !(staffType && staffType.isTabStaff() && staffType.stemless())
    }

    shouldHaveHook(): boolean {
        return this.shouldHaveStem()
               && this.durationType().hooks() > 0
               && !this.beam()
               && !this.tremoloTwoChord()
    }

    createStem(): void {
        const stem = chordFactories.createStem!(this)
        stem.setParent(this)
        stem.setGenerated(true)
        this.add(stem)
    }

    removeStem(): void {
        if (this.m_stem) {
            this.remove(this.m_stem)
        }
        if (this.m_hook) {
            this.remove(this.m_hook)
        }
        if (this.m_stemSlash) {
            this.remove(this.m_stemSlash)
        }
    }

    createHook(): void {
        const hook = chordFactories.createHook!(this)
        hook.setParent(this)
        hook.setGenerated(true)
        this.add(hook)
    }

    startEndSlurs(): StartEndSlurs { return this.m_startEndSlurs }

    allNotesTiedToNext(): boolean {
        let tiedChord: Chord | null = null
        for (const note of this.m_notes) {
            const tf = note.tieFor()
            if (!tf) {
                return false
            }
            const endNote = tf.endNote()
            const endChord = endNote ? endNote.chord() : null
            if (!endChord) {
                return false
            }
            if (!tiedChord) {
                tiedChord = endChord
                continue
            }
            if (endChord !== tiedChord) {
                return false
            }
        }
        return true
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        for (const a of this.m_articulations) {
            a.scanElements(func)
        }
        if (this.m_hook) {
            func(this.m_hook)
        }
        if (this.m_stem) {
            func(this.m_stem)
        }
        if (this.m_stemSlash) {
            func(this.m_stemSlash)
        }
        if (this.m_arpeggio) {
            func(this.m_arpeggio)
        }
        if (this.m_tremoloTwoChord && (this.tremoloChordType() !== TremoloChordType.TremoloSecondChord)) {
            func(this.m_tremoloTwoChord)
        }
        if (this.m_tremoloSingleChord) {
            func(this.m_tremoloSingleChord)
        }
        const st = this.staff()
        if ((st && st.showLedgerLines(this.tick())) || !st) { // also for palette
            for (const ll of this.m_ledgerLines) {
                func(ll)
            }
        }
        for (const note of this.m_notes) {
            note.scanElements(func)
        }
        for (const chord of this.m_graceNotes) {
            chord.scanElements(func)
        }
        for (const e of this.el()) {
            e.scanElements(func)
        }
        for (const p of this.m_noteParens) {
            p.leftParen().scanElements(func)
            p.rightParen().scanElements(func)
        }
        super.scanElements(func)
    }
}

// ---------------------------------------------------------------------------------
// navigate.cpp
// ---------------------------------------------------------------------------------

export function nextChordRest(cr: ChordRest | null, skipGrace = false): ChordRest | null {
    if (!cr) {
        return null
    }
    if (cr.isGrace()) {
        const c = cr as Chord
        const pc = cr.explicitParent() as unknown as Chord
        if (skipGrace) {
            cr = pc
        } else if (cr.isGraceBefore()) {
            const group = pc.graceNotesBefore().chords()
            const i = group.indexOf(c)
            if (i < 0) {
                return null
            }
            if (i + 1 < group.length) {
                return group[i + 1]
            }
            // if this was last grace note before, return parent
            return pc
        } else {
            const group = pc.graceNotesAfter().chords()
            const i = group.indexOf(c)
            if (i < 0) {
                return null
            }
            if (i + 1 < group.length) {
                return group[i + 1]
            }
            // if this was last grace note after, fall through to find next main note
            cr = pc
        }
    } else if (cr.isChord() && !skipGrace) {
        const c = cr as Chord
        if (c.graceNotes().length) {
            const group = c.graceNotesAfter()
            if (!group.empty()) {
                return group.front()
            }
        }
    }

    const track = cr.track()
    const st = SegmentType.ChordRest
    for (let seg = cr.segment().next1MM(st); seg; seg = seg.next1MM(st)) {
        const e = seg.element(track) as ChordRest | null
        if (e) {
            if (e.isRest() && e.measure().isMeasureRepeatGroup(Math.trunc(track / 4))) {
                continue // these rests are not shown, skip them
            }
            if (e.isChord() && !skipGrace) {
                const c = e as Chord
                if (c.graceNotes().length) {
                    const group = c.graceNotesBefore()
                    if (!group.empty()) {
                        return group.front()
                    }
                }
            }
            return e
        }
    }
    return null
}

export function prevChordRest(cr: ChordRest | null, skipGrace = false): ChordRest | null {
    if (!cr) {
        return null
    }
    if (cr.isGrace()) {
        const c = cr as Chord
        const pc = cr.explicitParent() as unknown as Chord
        if (skipGrace) {
            cr = pc
        } else if (cr.isGraceBefore()) {
            const group = pc.graceNotesBefore().chords()
            const i = group.indexOf(c)
            if (i < 0) {
                return null
            }
            if (i > 0) {
                return group[i - 1]
            }
            // if this was first grace note before, fall through to find previous main note
            cr = pc
        } else {
            const group = pc.graceNotesAfter().chords()
            const i = group.indexOf(c)
            if (i < 0) {
                return null
            }
            if (i > 0) {
                return group[i - 1]
            }
            // if this was first grace note after, return parent
            return pc
        }
    } else if (cr.isChord() && !skipGrace) {
        const group = (cr as Chord).graceNotesBefore()
        if (!group.empty()) {
            return group.back()
        }
    }

    const track = cr.track()
    const st = SegmentType.ChordRest
    for (let seg = cr.segment().prev1MM(st); seg; seg = seg.prev1MM(st)) {
        const e = seg.element(track) as ChordRest | null
        if (e) {
            if (e.isRest() && e.measure().isMeasureRepeatGroup(Math.trunc(track / 4))) {
                continue
            }
            if (e.isChord() && !skipGrace) {
                const group = (e as Chord).graceNotesAfter()
                if (!group.empty()) {
                    return group.back()
                }
            }
            return e
        }
    }
    return null
}

/** dom/utils.cpp updatePercussionNotes */
export function updatePercussionNotes(c: Chord, drumset: Drumset | null): void {
    for (const ch of c.graceNotes()) {
        updatePercussionNotes(ch, drumset)
    }
    for (const note of [...c.notes()]) {
        if (!drumset) {
            note.setLine(0)
        } else {
            const pitch = note.pitch()
            if (!drumset.isValid(pitch)) {
                note.setLine(0)
            } else if (!note.fixed()) {
                note.undoChangeProperty(Pid.HEAD_GROUP, drumset.noteHead(pitch))
                note.setLine(drumset.line(pitch))
            }
        }
    }
}
