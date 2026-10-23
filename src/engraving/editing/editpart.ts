/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editpart.h/.cpp: the part undo commands and EditPart (the part and staff editing
 * functions of the Layout panel / NotationParts).
 * TODO(port): SetUserBankController; insertPart/replacePart from a template.
 */

import { AutoOnOff, ElementType, PreferSharpFlat, staff2track } from '../types/types'
import { Pid } from '../dom/property'
import { Sid } from '../style/styledef'
import { Factory } from '../dom/factory'
import { KeyList } from '../dom/key'
import { collectSystemObjects } from '../dom/utils'
import { CommandType, UndoCommand } from './undo'
import { AddSystemObjectStaff, ChangeStaff, ChangeStaffType, RemoveSystemObjectStaff, SortStaves } from './editstaff'
import { ChangeScoreOrder } from './editscoreproperties'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Part } from '../dom/part'
import type { Score } from '../dom/score'
import type { ScoreOrder } from '../dom/scoreorder'
import type { Staff } from '../dom/staff'
import type { EditData } from './editdata'
import { Instrument, StaffName, type InstrChannel, type StaffNameList } from '../dom/instrument'
import type { MidiPatch } from '../compat/midi/midipatch'
import { Drumset } from '../dom/drumset'
import { Fraction } from '../types/fraction'
import { SegmentType } from '../dom/segment'
import type { InstrumentChange } from '../dom/instrchange'
import { StaffType, type StaffTypes } from '../dom/stafftype'
import { Transpose } from './transpose'
import { StringData } from '../dom/stringdata'
import { stringTuningsHooks, type StringTunings } from '../dom/stringtunings'
import './edit'

// ---------------------------------------------------------
//   InsertPart
// ---------------------------------------------------------

export class InsertPart extends UndoCommand {
    constructor(private m_part: Part, private m_targetPartIdx: number) {
        super()
    }

    override undo(_ed: EditData | null): void {
        this.m_part.score().removePart(this.m_part)
    }

    override redo(_ed: EditData | null): void {
        this.m_part.score().insertPart(this.m_part, this.m_targetPartIdx)
    }

    override type(): CommandType { return CommandType.InsertPart }
    override name(): string { return 'InsertPart' }
    override objectItems(): EngravingObject[] { return [this.m_part] }
}

// ---------------------------------------------------------
//   RemovePart
// ---------------------------------------------------------

export class RemovePart extends UndoCommand {
    private m_partIdx: number

    constructor(private m_part: Part, partIdx = -1) {
        super()
        this.m_partIdx = partIdx === -1 ? m_part.score().parts().indexOf(m_part) : partIdx
    }

    override undo(_ed: EditData | null): void {
        this.m_part.score().insertPart(this.m_part, this.m_partIdx)
    }

    override redo(_ed: EditData | null): void {
        this.m_part.score().removePart(this.m_part)
    }

    override type(): CommandType { return CommandType.RemovePart }
    override name(): string { return 'RemovePart' }
    override objectItems(): EngravingObject[] { return [this.m_part] }
}

// ---------------------------------------------------------
//   SetSoloist
// ---------------------------------------------------------

export class SetSoloist extends UndoCommand {
    constructor(private part: Part, private soloist: boolean) {
        super()
    }

    override undo(_ed: EditData | null): void { this.part.setSoloist(!this.soloist) }
    override redo(_ed: EditData | null): void { this.part.setSoloist(this.soloist) }
    override type(): CommandType { return CommandType.SetSoloist }
    override name(): string { return 'SetSoloist' }
    override objectItems(): EngravingObject[] { return [this.part] }
}

// ---------------------------------------------------------
//   ChangeStringData
// ---------------------------------------------------------

export class ChangeStringData extends UndoCommand {
    private m_instrument: Instrument | null = null
    private m_stringTunings: StringTunings | null = null
    private m_stringData: StringData

    /** C++ ChangeStringData(StringTunings*, const StringData&) and ChangeStringData(Instrument*, const StringData&) */
    constructor(target: { stringTunings: StringTunings } | { instrument: Instrument }, stringData: StringData) {
        super()
        if ('stringTunings' in target) {
            this.m_stringTunings = target.stringTunings
        } else {
            this.m_instrument = target.instrument
        }
        this.m_stringData = stringData.clone()
    }

    protected override flip(_ed: EditData | null): void {
        const stringData = this.m_stringTunings ? this.m_stringTunings.stringData() : this.m_instrument!.stringData()
        const frets = stringData.frets()
        const stringList = stringData.stringList()
        const old = StringData.fromStrings(frets, stringList)

        if (this.m_stringTunings) {
            this.m_stringTunings.setStringData(this.m_stringData)
        } else {
            this.m_instrument!.setStringData(this.m_stringData.clone())
        }

        this.m_stringData.set(old)
    }

    override name(): string { return 'ChangeStringData' }
}

stringTuningsHooks.changeStringData = (st: StringTunings, stringData: StringData): void => {
    st.score().undo(new ChangeStringData({ stringTunings: st }, stringData))
}

// ---------------------------------------------------------
//   ChangePart
// ---------------------------------------------------------

export class ChangePart extends UndoCommand {
    constructor(private part: Part, private instrument: Instrument, private partName: string) {
        super()
    }

    override type(): CommandType { return CommandType.ChangePart }
    override name(): string { return 'ChangePart' }
    override objectItems(): EngravingObject[] { return [this.part] }

    protected override flip(_ed: EditData | null): void {
        const oi = this.part.instrument() //tick?
        const s = this.part.partName()
        this.part.setInstrument(this.instrument)
        this.part.setPartName(this.partName)

        this.part.updateHarmonyChannels(false)

        const score = this.part.score()
        score.masterScore().rebuildMidiMapping()
        score.masterScore().setInstrumentsChanged(true)
        score.masterScore().setPlaylistDirty()

        // check if notes need to be updated
        // true if changing into or away from TAB or from one TAB type to another

        score.setLayoutAll()

        this.partName = s
        this.instrument = oi
    }
}

// ---------------------------------------------------------
//   ChangePatch
// ---------------------------------------------------------

export class ChangePatch extends UndoCommand {
    private patch: MidiPatch

    constructor(private score: Score, private channel: InstrChannel, pt: MidiPatch) {
        super()
        this.patch = { ...pt }
    }

    override name(): string { return 'ChangePatch' }
    override objectItems(): EngravingObject[] { return [this.score] }

    protected override flip(_ed: EditData | null): void {
        const op: MidiPatch = {
            ...this.patch,
            prog: this.channel.program(),
            bank: this.channel.bank(),
            synti: this.channel.synti(),
        }

        this.channel.setProgram(this.patch.prog)
        this.channel.setBank(this.patch.bank)
        this.channel.setSynti(this.patch.synti)

        this.patch = op

        //! TODO Needs porting for MU4 (C++: the controller events to the sequencer are commented out)
        this.score.masterScore().setInstrumentsChanged(true)
    }
}

// ---------------------------------------------------------
//   ChangeDrumset
// ---------------------------------------------------------

// ---------------------------------------------------------
//   ChangeInstrumentLong / ChangeInstrumentShort
// ---------------------------------------------------------

export class ChangeInstrumentLong extends UndoCommand {
    constructor(private tick: Fraction, private part: Part, private text: StaffNameList) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeInstrumentLong }
    override name(): string { return 'ChangeInstrumentLong' }
    override objectItems(): EngravingObject[] { return [this.part] }

    protected override flip(_ed: EditData | null): void {
        const s = this.part.longNames(this.tick)
        this.part.setLongNames(this.text, this.tick)
        this.text = s
        this.part.score().setLayoutAll()
    }
}

export class ChangeInstrumentShort extends UndoCommand {
    constructor(private tick: Fraction, private part: Part, private text: StaffNameList) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeInstrumentShort }
    override name(): string { return 'ChangeInstrumentShort' }
    override objectItems(): EngravingObject[] { return [this.part] }

    protected override flip(_ed: EditData | null): void {
        const s = this.part.shortNames(this.tick)
        this.part.setShortNames(this.text, this.tick)
        this.text = s
        this.part.score().setLayoutAll()
    }
}

export class ChangeDrumset extends UndoCommand {
    private drumset: Drumset

    constructor(private instrument: Instrument, d: Drumset, private part: Part) {
        super()
        this.drumset = d.clone()
    }

    override type(): CommandType { return CommandType.ChangeDrumset }
    override name(): string { return 'ChangeDrumset' }

    protected override flip(_ed: EditData | null): void {
        const d = this.instrument.drumset() ? this.instrument.drumset()!.clone() : new Drumset()
        this.instrument.setDrumset(this.drumset)
        this.drumset = d

        if (this.part.staves().length > 0) {
            this.part.score().setLayoutRange(new Fraction(0, 1), this.part.score().endTick(), this.part.staves()[0].idx(),
                this.part.staves()[this.part.staves().length - 1].idx())
        }
    }
}

/** Helper function to find InstrumentChange element at a given tick */
function findInstrumentChange(score: Score, part: Part, tick: Fraction): InstrumentChange | null {
    const segment = score.tick2segment(tick, true, SegmentType.ChordRest)
    if (!segment) {
        return null
    }

    const item = segment.findAnnotation(ElementType.INSTRUMENT_CHANGE, part.startTrack(), part.endTrack() - 1)
    return item ? item as unknown as InstrumentChange : null
}

// ---------------------------------------------------------
//   EditPart
// ---------------------------------------------------------

export class EditPart {
    static replacePartInstrument(score: Score | null, part: Part | null, newInstrument: Instrument, newStaffType: StaffType | null,
        partName: string): void {
        if (!score || !part) {
            return
        }

        // Change the part's instrument and name
        const newPartName = !partName ? newInstrument.trackName() : partName
        const instrument = new Instrument()
        instrument.assign(newInstrument)
        score.undo(new ChangePart(part, instrument, newPartName))

        // Update clefs and staff type for all staves in the part
        for (let staffIdx = 0; staffIdx < part.nstaves(); ++staffIdx) {
            const staff = part.staves()[staffIdx]
            if (!staff) {
                continue
            }

            // Get current staff properties
            const visible = staff.visible()
            const currentClefType = staff.defaultClefType()
            const userDist = staff.userDist()
            const cutaway = staff.cutaway()
            const hideSystemBarLine = staff.hideSystemBarLine()
            const mergeMatchingRests = staff.mergeMatchingRests()
            const reflectTransposition = staff.reflectTranspositionInLinkedTab()

            // Get new clef type from the new instrument
            const newClefType = newInstrument.clefType(staffIdx)

            // Only update staff if clef type changes
            if (!currentClefType.equals(newClefType)) {
                score.undo(new ChangeStaff(staff, visible, newClefType, userDist, cutaway, hideSystemBarLine, mergeMatchingRests,
                    reflectTransposition))
            }

            // Apply new staff type if provided
            if (newStaffType) {
                score.undo(new ChangeStaffType(staff, newStaffType))
            }
        }
    }

    static replaceInstrumentAtTick(score: Score | null, part: Part | null, tick: Fraction, newInstrument: Instrument): boolean {
        if (!score || !part) {
            return false
        }

        const instrumentChange = findInstrumentChange(score, part, tick)
        if (!instrumentChange) {
            return false
        }

        instrumentChange.setInit(true)
        instrumentChange.setupInstrument(newInstrument)
        return true
    }

    static setPartSharpFlat(score: Score | null, part: Part | null, sharpFlat: PreferSharpFlat): void {
        if (!score || !part) {
            return
        }

        const oldTransposition = part.staff(0)!.transpose(new Fraction(0, 1)).clone()

        part.undoChangeProperty(Pid.PREFER_SHARP_FLAT, sharpFlat)
        Transpose.transpositionChanged(score, part, oldTransposition)
    }

    static setPartVisible(score: Score | null, part: Part | null, visible: boolean): void {
        if (!score || !part) {
            return
        }

        part.undoChangeProperty(Pid.VISIBLE, visible)
    }

    static setStaffVisible(score: Score | null, staff: Staff | null, visible: boolean): void {
        if (!score || !staff) {
            return
        }

        staff.undoChangeProperty(Pid.VISIBLE, visible)
    }

    static replaceDrumset(score: Score | null, part: Part | null, tick: Fraction, newDrumset: Drumset): void {
        if (!score || !part) {
            return
        }

        const instrument = part.instrument(tick)
        if (instrument) {
            score.undo(new ChangeDrumset(instrument, newDrumset, part))
        }
    }

    static setInstrumentName(score: Score | null, part: Part | null, tick: Fraction, name: string): void {
        if (!score || !part) {
            return
        }

        score.undo(new ChangeInstrumentLong(tick, part, [new StaffName(name, 0)]))
    }

    static setInstrumentAbbreviature(score: Score | null, part: Part | null, tick: Fraction, abbreviature: string): void {
        if (!score || !part) {
            return
        }

        score.undo(new ChangeInstrumentShort(tick, part, [new StaffName(abbreviature, 0)]))
    }

    /** the voice of a staff of an excerpt shown or hidden (Excerpt::setVoiceVisible); false if not possible */
    static setVoiceVisible(score: Score | null, staff: Staff | null, voiceIndex: number, visible: boolean): boolean {
        if (!score || !staff) {
            return false
        }

        if (!score.excerpt()) {
            return false
        }

        if (!visible && !staff.canDisableVoice()) {
            return false
        }

        score.excerpt()!.setVoiceVisible(staff, voiceIndex, visible)
        return true
    }

    static setStaffType(score: Score | null, staff: Staff | null, typeId: StaffTypes): void {
        if (!score || !staff) {
            return
        }

        const staffType = StaffType.preset(typeId)
        if (!staffType) {
            return
        }

        score.undo(new ChangeStaffType(staff, staffType))
    }

    static removeParts(score: Score | null, parts: readonly Part[]): void {
        if (!score || !parts.length) {
            return
        }

        for (const part of parts) {
            score.cmdRemovePart(part)
        }

        score.setBracketsAndBarlines()
    }

    static removeStaves(score: Score | null, staves: readonly Staff[]): void {
        if (!score || !staves.length) {
            return
        }

        for (const staff of staves) {
            score.cmdRemoveStaff(staff.idx())
        }

        score.setBracketsAndBarlines()
    }

    static moveParts(score: Score | null, sourceParts: readonly Part[], destinationPart: Part | null, insertAfter: boolean): void {
        if (!score || !sourceParts.length || !destinationPart) {
            return
        }

        // Build new part order: remove source parts, then insert at destination
        const allParts = score.parts().filter(p => !sourceParts.includes(p))

        // Find destination index
        let dstIndex = allParts.indexOf(destinationPart)
        if (dstIndex === -1) {
            return
        }

        if (insertAfter) {
            dstIndex++
        }

        // Insert source parts at destination
        allParts.splice(dstIndex, 0, ...sourceParts)

        // Build staff index mapping from the new part order
        const staffMapping: number[] = []
        for (const part of allParts) {
            for (const staff of part.staves()) {
                staffMapping.push(staff.idx())
            }
        }

        score.undo(new SortStaves(score, staffMapping))
        score.setBracketsAndBarlines()
    }

    static moveStaves(score: Score | null, sourceStaves: readonly Staff[], destinationStaff: Staff | null, insertAfter: boolean): void {
        if (!score || !sourceStaves.length || !destinationStaff) {
            return
        }

        // Build new staff order: remove source staves, then insert at destination
        const allStaves = score.staves().filter(s => !sourceStaves.includes(s))

        // Find destination index
        let dstIndex = allStaves.indexOf(destinationStaff)
        if (dstIndex === -1) {
            return
        }

        if (insertAfter) {
            dstIndex++
        }

        // Insert source staves at destination
        allStaves.splice(dstIndex, 0, ...sourceStaves)

        // Build index mapping
        const sortedIndexes = allStaves.map(staff => staff.idx())

        score.undo(new SortStaves(score, sortedIndexes))
        score.setBracketsAndBarlines()
    }

    static addSystemObjects(score: Score | null, staves: readonly Staff[]): void {
        if (!score || !staves.length) {
            return
        }

        const topSystemObjects = collectSystemObjects(score)

        for (const staff of staves) {
            if (staff.isSystemObjectStaff()) {
                continue
            }

            score.undo(new AddSystemObjectStaff(staff))

            const staffIdx = staff.idx()
            for (const obj of topSystemObjects) {
                if (obj.isTimeSig()) {
                    obj.triggerLayout()
                    continue
                }
                const copy = obj.linkedClone()
                copy.setStaffIdx(staffIdx)
                score.undoAddElement(copy, false /*addToLinkedStaves*/)
            }
        }
    }

    static removeSystemObjects(score: Score | null, staves: readonly Staff[]): void {
        if (!score || !staves.length) {
            return
        }

        const systemObjects = collectSystemObjects(score, staves)

        for (const staff of staves) {
            if (staff.isSystemObjectStaff()) {
                score.undo(new RemoveSystemObjectStaff(staff))
                if (staff.hasSystemObjectsBelowBottomStaff()) {
                    score.undoChangeStyleVal(Sid.systemObjectsBelowBottomStaff, false)
                }
            }
        }

        for (const obj of systemObjects) {
            if (obj.isTimeSig()) {
                obj.triggerLayout()
                continue
            }
            obj.undoUnlink()
            score.undoRemoveElement(obj, false /*removeLinked*/)
        }
    }

    static moveSystemObjects(score: Score | null, sourceStaff: Staff | null, destinationStaff: Staff | null): void {
        if (!score || !sourceStaff || !destinationStaff) {
            return
        }

        if (!sourceStaff.isSystemObjectStaff()) {
            return
        }

        const systemObjects: EngravingItem[] = collectSystemObjects(score, [sourceStaff, destinationStaff])
        const dstStaffIdx = destinationStaff.idx()

        score.undo(new RemoveSystemObjectStaff(sourceStaff))
        if (!destinationStaff.isSystemObjectStaff() && dstStaffIdx !== 0) {
            score.undo(new AddSystemObjectStaff(destinationStaff))
        } else {
            score.undoChangeStyleVal(Sid.systemObjectsBelowBottomStaff, false)
        }

        const showMeasNumOnSrcStaff = sourceStaff.getProperty(Pid.SHOW_MEASURE_NUMBERS) as AutoOnOff
        if (showMeasNumOnSrcStaff !== AutoOnOff.AUTO) {
            destinationStaff.undoChangeProperty(Pid.SHOW_MEASURE_NUMBERS, showMeasNumOnSrcStaff)
            sourceStaff.undoResetProperty(Pid.SHOW_MEASURE_NUMBERS)
        }

        // Remove items from destination first
        for (const item of systemObjects) {
            if (item.isTimeSig()) {
                item.triggerLayout()
                continue
            }

            if (item.staff() === sourceStaff) {
                continue
            }
            item.undoUnlink()
            score.undoRemoveElement(item, false /*removeLinked*/)
        }

        // Move items from source to destination
        for (const item of systemObjects) {
            if (item.isTimeSig()) {
                continue
            }

            if (item.staff() === sourceStaff) {
                item.undoChangeProperty(Pid.TRACK, staff2track(dstStaffIdx, item.voice()))
            }
        }
    }

    static doAppendStaff(score: Score | null, staff: Staff | null, destinationPart: Part | null, createRests = true): void {
        if (!score || !staff || !destinationPart) {
            return
        }

        const staffLocalIndex = destinationPart.nstaves()
        const keyList = new KeyList() // a copy
        for (const [t, ke] of destinationPart.staff(staffLocalIndex - 1)!.keyList().entries()) {
            keyList.set(t, ke.clone())
        }

        staff.setScore(score)
        staff.setPart(destinationPart)

        score.undoInsertStaff(staff, staffLocalIndex, createRests)

        const staffGlobalIndex = staff.idx()
        score.adjustKeySigs(staffGlobalIndex, staffGlobalIndex + 1, keyList)

        score.updateBracesAndBarlines(destinationPart, staffLocalIndex)

        destinationPart.instrument().setClefType(staffLocalIndex, staff.defaultClefType())
    }

    static appendStaff(score: Score | null, destinationPart: Part | null): Staff | null {
        if (!score || !destinationPart) {
            return null
        }

        const staff = Factory.createStaff(destinationPart)
        EditPart.doAppendStaff(score, staff, destinationPart)
        return staff
    }

    static setScoreOrder(score: Score | null, order: ScoreOrder): void {
        if (!score) {
            return
        }

        score.undo(new ChangeScoreOrder(score, order))
        const mutableOrder = order.clone()
        mutableOrder.setBracketsAndBarlines(score)
    }
}
