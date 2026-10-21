/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editpart.h/.cpp: the part undo commands and EditPart (the part and staff editing
 * functions of the Layout panel / NotationParts).
 * TODO(port): ChangePart, ChangeInstrumentLong/Short, ChangeDrumset, ChangePatch,
 * SetUserBankController and the EditPart functions that use them (replacePartInstrument, replaceInstrumentAtTick,
 * setPartSharpFlat, setInstrumentName, setInstrumentAbbreviature, setStaffType, replaceDrumset); appendLinkedStaff
 * and setVoiceVisible (Excerpt::cloneStaff, excerpts); insertPart/replacePart from a template.
 */

import { AutoOnOff, staff2track } from '../types/types'
import { Pid } from '../dom/property'
import { Sid } from '../style/styledef'
import { Factory } from '../dom/factory'
import { KeyList } from '../dom/key'
import { collectSystemObjects } from '../dom/utils'
import { CommandType, UndoCommand } from './undo'
import { AddSystemObjectStaff, RemoveSystemObjectStaff, SortStaves } from './editstaff'
import { ChangeScoreOrder } from './editscoreproperties'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Part } from '../dom/part'
import type { Score } from '../dom/score'
import type { ScoreOrder } from '../dom/scoreorder'
import type { Staff } from '../dom/staff'
import type { EditData } from './editdata'
import type { Instrument } from '../dom/instrument'
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
//   EditPart
// ---------------------------------------------------------

export class EditPart {
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
