/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/ornament.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import {
    AccidentalRole, AccidentalVal, AutoOnOff, ElementType, IntervalStep, IntervalType, NoteHeadType,
    OrnamentInterval, OrnamentShowAccidental, PlacementV, TrillType, type track_idx_t,
} from '../types/types'
import { AccidentalType } from './accidentaldata'
import { Sid } from '../style/styledef'
import { Accidental } from './accidental'
import { Articulation, ArticulationAnchor } from './articulation'
import type { Chord } from './chord'
import type { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Interval } from './interval'
import { AccidentalState } from './key'
import type { Note } from './note'
import { tpc2alter } from './pitchspelling'
import { Pid } from './property'
import type { Segment } from './segment'
import { absStep } from './utils'

const DEFAULT_ORNAMENT_INTERVAL = (): OrnamentInterval => new OrnamentInterval(IntervalStep.SECOND, IntervalType.AUTO)

/** set by dom/factory.ts (avoids a circular import of chord.ts) */
export const ornamentFactories: { createChord?: (parent: Segment) => Chord } = {}

export class Ornament extends Articulation {
    private m_intervalAbove = DEFAULT_ORNAMENT_INTERVAL()
    private m_intervalBelow = DEFAULT_ORNAMENT_INTERVAL()
    private m_showAccidental = OrnamentShowAccidental.DEFAULT
    private m_startOnUpperNote = false

    private m_notesAboveAndBelow: [Note | null, Note | null] = [null, null] // [0] = above, [1] = below
    private m_accidentalsAboveAndBelow: [Accidental | null, Accidental | null] = [null, null] // [0] = above, [1] = below
    private m_cueNoteChord: Chord | null = null
    private m_showCueNote = AutoOnOff.AUTO

    private m_trillOldCompatAccidental: Accidental | null = null // used temporarily to map old (i.e. pre-4.1) trill accidentals

    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.ORNAMENT)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_intervalAbove = new OrnamentInterval(original.m_intervalAbove.step, original.m_intervalAbove.type)
        this.m_intervalBelow = new OrnamentInterval(original.m_intervalBelow.step, original.m_intervalBelow.type)
        this.m_notesAboveAndBelow = [null, null]
        this.m_cueNoteChord = original.m_cueNoteChord ? original.m_cueNoteChord.clone() as Chord : null
        this.m_accidentalsAboveAndBelow = [null, null]
        for (let i = 0; i < 2; ++i) {
            const oldAccidental = original.m_accidentalsAboveAndBelow[i]
            if (!oldAccidental) {
                continue
            }
            const newAccidental = oldAccidental.clone() as Accidental
            newAccidental.setParent(this)
            this.m_accidentalsAboveAndBelow[i] = newAccidental
        }
    }

    intervalAbove(): OrnamentInterval { return this.m_intervalAbove }
    setIntervalAbove(v: OrnamentInterval): void { this.m_intervalAbove = v }
    intervalBelow(): OrnamentInterval { return this.m_intervalBelow }
    setIntervalBelow(v: OrnamentInterval): void { this.m_intervalBelow = v }
    showAccidental(): OrnamentShowAccidental { return this.m_showAccidental }
    setShowAccidental(v: OrnamentShowAccidental): void { this.m_showAccidental = v }
    startOnUpperNote(): boolean { return this.m_startOnUpperNote }
    setStartOnUpperNote(v: boolean): void { this.m_startOnUpperNote = v }

    cueNoteChord(): Chord | null { return this.m_cueNoteChord }
    setCueNoteChord(c: Chord | null): void { this.m_cueNoteChord = c }
    setNoteAbove(n: Note | null): void { this.m_notesAboveAndBelow[0] = n }
    accidentalsAboveAndBelow(): readonly (Accidental | null)[] { return this.m_accidentalsAboveAndBelow }
    accidentalAbove(): Accidental | null { return this.m_accidentalsAboveAndBelow[0] }
    accidentalBelow(): Accidental | null { return this.m_accidentalsAboveAndBelow[1] }
    setAccidentalAbove(a: Accidental | null): void { this.m_accidentalsAboveAndBelow[0] = a }
    setAccidentalBelow(a: Accidental | null): void { this.m_accidentalsAboveAndBelow[1] = a }
    setTrillOldCompatAccidental(a: Accidental | null): void { this.m_trillOldCompatAccidental = a }
    noteAbove(): Note | null { return this.m_notesAboveAndBelow[0] }
    noteBelow(): Note | null { return this.m_notesAboveAndBelow[1] }
    setShowCueNote(show: AutoOnOff): void { this.m_showCueNote = show }

    override remove(e: EngravingItem): void {
        if (e.isAccidental()) {
            for (let i = 0; i < 2; ++i) {
                if (e === this.m_accidentalsAboveAndBelow[i]) {
                    this.m_accidentalsAboveAndBelow[i] = null
                }
            }
        }
    }

    override setTrack(val: track_idx_t): void {
        for (const note of this.m_notesAboveAndBelow) {
            if (note) {
                note.setTrack(val)
            }
        }
        if (this.m_cueNoteChord) {
            this.m_cueNoteChord.setTrack(val)
        }
        super.setTrack(val)
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this)
        for (const accidental of this.m_accidentalsAboveAndBelow) {
            if (accidental) {
                func(accidental)
            }
        }
        if (this.m_cueNoteChord) {
            this.m_cueNoteChord.scanElements(func)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.INTERVAL_ABOVE:
            return this.m_intervalAbove
        case Pid.INTERVAL_BELOW:
            return this.m_intervalBelow
        case Pid.ORNAMENT_SHOW_ACCIDENTAL:
            return this.m_showAccidental
        case Pid.ORNAMENT_SHOW_CUE_NOTE:
            return this.m_showCueNote
        case Pid.START_ON_UPPER_NOTE:
            return this.m_startOnUpperNote
        default:
            return super.getProperty(propertyId)
        }
    }

    override getPropertyStyle(propertyId: Pid): Sid {
        switch (propertyId) {
        case Pid.ARTICULATION_ANCHOR:
            return Sid.articulationAnchorDefault
        default:
            return super.getPropertyStyle(propertyId)
        }
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.INTERVAL_ABOVE:
        case Pid.INTERVAL_BELOW:
            return DEFAULT_ORNAMENT_INTERVAL()
        case Pid.ORNAMENT_SHOW_ACCIDENTAL:
            return OrnamentShowAccidental.DEFAULT
        case Pid.ORNAMENT_SHOW_CUE_NOTE:
            return AutoOnOff.AUTO
        case Pid.START_ON_UPPER_NOTE:
            return false
        case Pid.ARTICULATION_ANCHOR:
            return ArticulationAnchor.AUTO
        default:
            return super.propertyDefault(id)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.INTERVAL_ABOVE:
            this.setIntervalAbove(v as OrnamentInterval)
            break
        case Pid.INTERVAL_BELOW:
            this.setIntervalBelow(v as OrnamentInterval)
            break
        case Pid.ORNAMENT_SHOW_ACCIDENTAL:
            this.setShowAccidental(v as OrnamentShowAccidental)
            break
        case Pid.ORNAMENT_SHOW_CUE_NOTE:
            this.setShowCueNote(v as AutoOnOff)
            break
        case Pid.START_ON_UPPER_NOTE:
            this.setStartOnUpperNote(!!v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    hasIntervalAbove(): boolean {
        const id = this.symId()
        return id === SymId.ornamentTurnInverted
               || id === SymId.ornamentTrill
               || id === SymId.ornamentTurnSlash
               || id === SymId.ornamentTurn
               || id === SymId.ornamentShortTrill
               || id === SymId.ornamentTremblement
               || id === SymId.ornamentPrallMordent
               || id === SymId.ornamentUpPrall
               || id === SymId.ornamentPrecompMordentUpperPrefix
               || id === SymId.ornamentUpMordent
               || id === SymId.ornamentPrallUp
    }

    hasIntervalBelow(): boolean {
        const id = this.symId()
        return id === SymId.ornamentTurnInverted
               || id === SymId.ornamentMordent
               || id === SymId.ornamentTurnSlash
               || id === SymId.ornamentTurn
               || id === SymId.ornamentTremblement
               || id === SymId.ornamentPrallMordent
               || id === SymId.ornamentDownMordent
               || id === SymId.ornamentPrallDown
    }

    hasFullIntervalChoice(): boolean {
        return this.symId() === SymId.ornamentTrill
    }

    showCueNote(): boolean {
        if (this.m_showCueNote === AutoOnOff.AUTO) {
            return (this.hasFullIntervalChoice() && this.style().styleB(Sid.trillAlwaysShowCueNote))
                   || this.m_intervalAbove.step !== IntervalStep.SECOND
        }
        return this.m_showCueNote === AutoOnOff.ON
    }

    computeNotesAboveAndBelow(accState: AccidentalState): void {
        const parentChord = this.explicitParent() ? this.parent() as Chord : null
        const mainNote = parentChord ? parentChord.upNote() : null
        if (!mainNote) {
            return
        }

        if (this.m_cueNoteChord && !this.m_cueNoteChord.explicitParent()) {
            this.m_cueNoteChord.setParent(parentChord!.segment())
        }

        for (let i = 0; i < 2; ++i) {
            const above = (i === 0)
            const hasIntAbove = this.hasIntervalAbove()
            const hasIntBelow = this.hasIntervalBelow()
            if ((above && !hasIntAbove) || (!above && !hasIntBelow)) {
                continue
            }

            let note = this.m_notesAboveAndBelow[i]
            if (!note && above && this.m_cueNoteChord) {
                note = this.m_cueNoteChord.upNote()
            }
            if (!note) {
                note = mainNote.clone() as Note
                const tie = note.tieFor()
                if (tie) {
                    note.remove(tie)
                }
            } else {
                note.setTpc1(mainNote.tpc1())
                note.setTpc2(mainNote.tpc2())
                note.setPitch(mainNote.pitch())
            }
            this.m_notesAboveAndBelow[i] = note

            note.setTrack(this.track())

            if (Accidental.isMicrotonal(note.accidentalType())) {
                // If mainNote has microtonal accidental, don't clone it to the ornament note because microtonal intervals are not supported.
                note.setAccidentalType(Accidental.value2subtype(tpc2alter(note.tpc())))
            }

            const autoMode = (above && this.m_intervalAbove.type === IntervalType.AUTO)
                             || (!above && this.m_intervalBelow.type === IntervalType.AUTO)
            if (autoMode) {
                // NOTE: In AUTO mode, the ornament note should match not only any alteration from the
                // key signature, but also any alteration present in the measure before this point.
                const intervalSteps = above ? this.m_intervalAbove.step : -this.m_intervalBelow.step
                note.transposeDiatonic(intervalSteps, false, true)
                if (this.m_trillOldCompatAccidental) {
                    this.mapOldTrillAccidental(note, mainNote)
                    this.m_trillOldCompatAccidental = null
                } else {
                    const pitchLine = absStep(note.tpc(), note.epitch())
                    const accidentalVal = accState.accidentalVal(pitchLine)
                    const noteAccidentalVal = tpc2alter(note.tpc())
                    const accidentalDiff = accidentalVal - noteAccidentalVal
                    note.transpose(new Interval(0, accidentalDiff), true)
                }
            } else {
                const interval = Interval.fromOrnamentInterval(above ? this.m_intervalAbove : this.m_intervalBelow)
                if (!above) {
                    interval.flip()
                }
                note.transpose(interval, true)
            }

            const copyOfAccState = accState.clone()
            note.updateAccidental(copyOfAccState)
            if (note.accidental()) {
                const pitchLine = absStep(note.tpc(), note.epitch())
                accState.setForceRestateAccidental(pitchLine, true)
            }

            this.manageAccidentalVisibilityRules(note)
        }

        this.updateAccidentalsAboveAndBelow()
        this.updateCueNote()
    }

    private manageAccidentalVisibilityRules(note: Note): void {
        if (this.m_showAccidental === OrnamentShowAccidental.DEFAULT) {
            return
        }

        const accidentalValue = tpc2alter(note.tpc())
        let accidentalType = Accidental.value2subtype(accidentalValue)
        if (accidentalType === AccidentalType.NONE) {
            accidentalType = AccidentalType.NATURAL
        }

        if (note.accidentalType() === accidentalType) {
            return
        }

        let show = false
        if (this.m_showAccidental === OrnamentShowAccidental.ALWAYS) {
            show = true
        } else if (this.m_showAccidental === OrnamentShowAccidental.ANY_ALTERATION) {
            const key = this.staff()!.key(this.tick())
            const unalteredState = new AccidentalState()
            unalteredState.init(key)
            const pitchLine = absStep(note.tpc(), note.epitch() + note.ottaveCapoFret())
            const unalteredAccidentalVal = unalteredState.accidentalVal(pitchLine)
            show = accidentalValue !== unalteredAccidentalVal
        }

        if (show) {
            note.setAccidentalType(accidentalType)
            note.accidental()!.setRole(AccidentalRole.AUTO)
        }
    }

    private updateAccidentalsAboveAndBelow(): void {
        for (let i = 0; i < 2; ++i) {
            const note = this.m_notesAboveAndBelow[i]
            const accidental = note ? note.accidental() : null
            const curAccidental = this.m_accidentalsAboveAndBelow[i]
            if (this.showCueNote() || !accidental) {
                this.m_accidentalsAboveAndBelow[i] = null
                continue
            }
            if (!curAccidental) {
                const newAccidental = accidental.clone() as Accidental
                newAccidental.setParent(this)
                newAccidental.setPlacement(i === 0 ? PlacementV.ABOVE : PlacementV.BELOW)
                this.m_accidentalsAboveAndBelow[i] = newAccidental
            } else {
                curAccidental.setAccidentalType(accidental.accidentalType())
                curAccidental.setRole(accidental.role())
            }
        }
    }

    private updateCueNote(): void {
        if (!this.showCueNote()) {
            if (this.noteAbove() && this.explicitParent()) {
                this.noteAbove()!.setParent(this.parentItem())
            }
            this.m_cueNoteChord = null
            return
        }

        if (!this.explicitParent()) {
            return
        }

        const parentChord = this.parentItem() as Chord
        const cueNote = this.noteAbove()!

        // If needed, create cue note
        if (!this.m_cueNoteChord) {
            this.m_cueNoteChord = ornamentFactories.createChord!(parentChord.segment()!)
            this.m_cueNoteChord.setSmall(true)
            cueNote.setHeadType(NoteHeadType.HEAD_QUARTER)
            this.m_cueNoteChord.add(cueNote)
            cueNote.setParent(this.m_cueNoteChord)

            this.score().cmdAddParenthesesToNotes([cueNote])
        }

        this.m_cueNoteChord.setTrack(this.track())
        this.m_cueNoteChord.setParent(parentChord.segment())
        this.m_cueNoteChord.setStaffMove(parentChord.staffMove())
        cueNote.updateLine()
        cueNote.setIsTrillCueNote(true)
    }

    static fromTrillType(trillType: TrillType): SymId {
        switch (trillType) {
        case TrillType.TRILL_LINE:
            return SymId.ornamentTrill
        case TrillType.UPPRALL_LINE:
            return SymId.ornamentUpPrall
        case TrillType.DOWNPRALL_LINE:
            return SymId.ornamentDownMordent
        case TrillType.PRALLPRALL_LINE:
            return SymId.ornamentTrill
        default:
            return SymId.noSym
        }
    }

    /** Compatibility with trills pre-4.1 */
    private mapOldTrillAccidental(note: Note, mainNote: Note): void {
        const oldCompatValue: AccidentalVal = Accidental.subtype2value(this.m_trillOldCompatAccidental!.accidentalType())
        const noteAccidentalVal = tpc2alter(note.tpc())
        const accidentalDiff = oldCompatValue - noteAccidentalVal
        note.transpose(new Interval(0, accidentalDiff), true)

        const semitones = note.pitch() - mainNote.pitch()
        switch (semitones) {
        case 0:
            this.m_intervalAbove.type = IntervalType.DIMINISHED
            break
        case 1:
            this.m_intervalAbove.type = IntervalType.MINOR
            break
        case 2:
            this.m_intervalAbove.type = IntervalType.MAJOR
            break
        case 3:
            this.m_intervalAbove.type = IntervalType.AUGMENTED
            break
        default:
            break
        }
    }
}
