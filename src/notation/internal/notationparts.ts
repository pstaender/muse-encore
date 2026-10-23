/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationparts.h/.cpp: the part and staff commands of a notation (the Layout panel,
 * the instruments dialog, creating a score). The commands go through the notation's undo stack (startEdit/apply of
 * NotationInteraction); without an interaction (creating a score) the changes are applied directly.
 * The notifications (partList()/staffList() NotifyLists, partsChanged, ...) are not ported: the UI reloads the
 * Layout panel's tree after every change.
 * TODO(port): setInstrumentName, setInstrumentAbbreviature, setVoiceVisible, setStaffType,
 * setStaffConfig (other than the visibility), replacePart, replaceDrumset, insertPart/doInsertPart (parts from another
 * score), EditSystemLocks::removeSystemLocksContainingMMRests (system locks)
 */

import { Fraction } from '../../engraving/types/fraction'
import { Factory } from '../../engraving/dom/factory'
import { Instrument } from '../../engraving/dom/instrument'
import { MAX_STAVES, TraitType, type InstrumentTemplate, type Trait } from '../../engraving/dom/instrtemplate'
import { KeyList } from '../../engraving/dom/key'
import { Part } from '../../engraving/dom/part'
import { StaffType, StaffTypes } from '../../engraving/dom/stafftype'
import { Sid } from '../../engraving/style/styledef'
import { EditPart, SetSoloist } from '../../engraving/editing/editpart'
import { ChangeStaff, ChangeStaffType, SortStaves } from '../../engraving/editing/editstaff'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { mtrc, qtrc } from '../../framework/global/translation'
import type { Score } from '../../engraving/dom/score'
import type { ScoreOrder } from '../../engraving/dom/scoreorder'
import type { Staff } from '../../engraving/dom/staff'
import { formatInstrumentTitle, isMainInstrumentForPart, staffConfigEquals, type StaffConfig, type InstrumentKey, type PartInstrument, type PartInstrumentList } from '../notationtypes'
import { Pid } from '../../engraving/dom/property'
import { PreferSharpFlat } from '../../engraving/types/types'
import type { NotationInteraction } from './notationinteraction'
import '../../engraving/editing/edit'
import { Excerpt } from '../../engraving/dom/excerpt'
import { Link } from '../../engraving/editing/addremoveelement'
import { AddPartToExcerpt } from '../../engraving/editing/editexcerpt'

/** INotationParts::InsertMode */
export enum InsertMode {
    Before,
    After,
}

function formatInstrumentTitleOnScore(instrumentName: string, trait: Trait, instrumentNumber = 0): string {
    // Comments for translators start with //:

    if (instrumentNumber === 0) {
        // Only one instance of this instrument in the score
        if (trait.type === TraitType.Transposition && !trait.isHiddenOnScore) {
            //: %1=name ("Horn"), %2=transposition ("C alto"). Example: "Horn in C alto"
            return qtrc('notation', '%1 in %2', 'Transposing instrument displayed in the score')
                .replace('%1', instrumentName).replace('%2', trait.name)
        }
        return instrumentName // Example: "Flute"
    }

    const num = String(instrumentNumber)

    if (trait.type === TraitType.Transposition && !trait.isHiddenOnScore) {
        //: %1=name ("Horn"), %2=transposition ("C alto"), %3=number ("2"). Example: "Horn in C alto 2"
        return mtrc('notation', '%1 in %2 %3', 'One of several transposing instruments displayed in the score')
            .replace('%1', instrumentName).replace('%2', trait.name).replace('%3', num)
    }

    //: %1=name ("Flute"), %2=number ("2"). Example: "Flute 2"
    return mtrc('notation', '%1 %2', 'One of several instruments displayed in the score')
        .replace('%1', instrumentName).replace('%2', num)
}


export class NotationParts {
    constructor(private m_score: Score, private m_interaction: NotationInteraction | null = null) {}

    score(): Score { return this.m_score }

    hasParts(): boolean {
        return this.score().parts().length > 0
    }

    part(partId: string): Part | null { return this.partModifiable(partId) }
    partExists(partId: string): boolean { return this.part(partId) !== null }
    staff(staffId: string): Staff | null { return this.staffModifiable(staffId) }
    staffExists(staffId: string): boolean { return this.staff(staffId) !== null }

    scoreOrder(): ScoreOrder { return this.score().scoreOrder() }

    protected partModifiable(partId: string): Part | null {
        return this.score().parts().find(p => p.id() === partId) ?? null
    }

    protected staffModifiable(staffId: string): Staff | null {
        return this.score().staves().find(s => s.id() === staffId) ?? null
    }

    staves(stavesIds: readonly string[]): Staff[] {
        if (!stavesIds.length) {
            return []
        }
        return this.score().staves().filter(staff => stavesIds.includes(staff.id()))
    }

    parts(partsIds: readonly string[]): Part[] {
        return this.score().parts().filter(part => partsIds.includes(part.id()))
    }

    setParts(parts: PartInstrumentList, order: ScoreOrder): void {
        this.endInteractionWithScore()
        this.startEdit(new TranslatableString('undoableAction', 'Add/remove instruments'))

        this.doSetScoreOrder(order)
        this.removeMissingParts(parts)
        this.insertNewParts(parts)
        this.updateSoloist(parts)
        this.sortParts(parts)
        this.setBracketsAndBarlines()
        // updatePartsAndSystemObjectStaves(): notifications only

        this.apply()
    }

    setScoreOrder(order: ScoreOrder): void {
        if (this.score().scoreOrder().equals(order)) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Set score order'))

        this.doSetScoreOrder(order)
        this.setBracketsAndBarlines()

        this.apply()
    }

    setPartVisible(partId: string, visible: boolean): void {
        const part = this.partModifiable(partId)
        if (!part) {
            return
        }

        if (part.show() === visible) {
            return
        }

        const actionName = visible
            ? new TranslatableString('undoableAction', 'Show instrument')
            : new TranslatableString('undoableAction', 'Hide instrument')

        this.startEdit(actionName)

        EditPart.setPartVisible(this.score(), part, visible)

        if (visible) {
            // TODO(port): EditSystemLocks::removeSystemLocksContainingMMRests(score())
        }

        this.apply()
    }

    setPartSharpFlat(partId: string, sharpFlat: PreferSharpFlat): void {
        const part = this.partModifiable(partId)
        if (!part) {
            return
        }

        if (part.getProperty(Pid.PREFER_SHARP_FLAT) === sharpFlat) {
            return
        }

        const calcActionName = (sharpFlat: PreferSharpFlat): TranslatableString => {
            switch (sharpFlat) {
            case PreferSharpFlat.NONE: return new TranslatableString('undoableAction', 'Set sharps/flats no preference')
            case PreferSharpFlat.FLATS: return new TranslatableString('undoableAction', 'Set prefer flats')
            case PreferSharpFlat.SHARPS: return new TranslatableString('undoableAction', 'Set prefer sharps')
            case PreferSharpFlat.AUTO: return new TranslatableString('undoableAction', 'Set sharps/flats automatic')
            }
            return new TranslatableString('undoableAction', 'Set sharps/flats preference')
        }

        this.startEdit(calcActionName(sharpFlat))

        EditPart.setPartSharpFlat(this.score(), part, sharpFlat)

        this.apply()
    }

    replaceInstrument(instrumentKey: InstrumentKey, newInstrument: Instrument, newStaffType: StaffType | null = null): void {
        const part = this.partModifiable(instrumentKey.partId)
        if (!part) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Replace instrument'))

        if (isMainInstrumentForPart(instrumentKey, part)) {
            const newInstrumentPartName = formatInstrumentTitle(newInstrument.trackName(), newInstrument.trait())
            EditPart.replacePartInstrument(this.score(), part, newInstrument, newStaffType, newInstrumentPartName)
        } else {
            if (!EditPart.replaceInstrumentAtTick(this.score(), part, instrumentKey.tick, newInstrument)) {
                this.rollback()
                return
            }
        }

        this.apply()
    }

    setStaffVisible(staffId: string, visible: boolean): void {
        const staff = this.staffModifiable(staffId)
        if (!staff) {
            return
        }

        const config = this.staffConfig(staff)
        if (config.visible === visible) {
            return
        }

        const actionName = visible
            ? new TranslatableString('undoableAction', 'Show staff')
            : new TranslatableString('undoableAction', 'Hide staff')

        this.startEdit(actionName)

        config.visible = visible
        this.doSetStaffConfig(staff, config)

        if (visible) {
            // TODO(port): EditSystemLocks::removeSystemLocksContainingMMRests(score())
        }

        this.apply()
    }

    /** C++ staffConfig(staffId) */
    staffConfig(staff: Staff): StaffConfig {
        const staffType = staff.staffType(new Fraction(0, 1))
        return {
            visible: staff.visible(),
            userDistance: staff.userDist(),
            cutaway: staff.cutaway(),
            hideSystemBarline: staff.hideSystemBarLine(),
            mergeMatchingRests: staff.mergeMatchingRests(),
            clefTypeList: staff.defaultClefType().clone(),
            reflectTranspositionInLinkedTab: staff.reflectTranspositionInLinkedTab(),
            staffType: staffType.clone(),
        }
    }

    setStaffConfig(staffId: string, config: StaffConfig): void {
        const staff = this.staffModifiable(staffId)
        if (!staff) {
            return
        }

        if (staffConfigEquals(this.staffConfig(staff), config)) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Edit staff properties'))

        this.doSetStaffConfig(staff, config)

        this.apply()
    }

    appendStaff(staff: Staff, destinationPartId: string): boolean {
        const destinationPart = this.partModifiable(destinationPartId)
        if (!destinationPart) {
            return false
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add staff'))
        this.doAppendStaff(staff, destinationPart)
        this.apply()

        return true
    }

    /** the staff of a part score linked to the master score's staff (the master's MasterNotationParts::appendStaff) */
    appendStaffLinkedToMaster(staff: Staff, masterSourceStaff: Staff, destinationPartId: string): boolean {
        const destinationPart = this.partModifiable(destinationPartId)
        if (!destinationPart) {
            return false
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add staff'))

        this.doAppendStaff(staff, destinationPart, /*createRests*/ false)
        this.score().undo(new Link(staff, masterSourceStaff))

        Excerpt.cloneStaff2(masterSourceStaff, staff, new Fraction(0, 1), this.score().endTick())

        return true
    }

    appendLinkedStaff(staff: Staff, sourceStaffId: string, destinationPartId: string): boolean {
        const sourceStaff = this.staffModifiable(sourceStaffId)
        const destinationPart = this.partModifiable(destinationPartId)
        if (!sourceStaff || !destinationPart) {
            return false
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add linked staff'))

        this.doAppendStaff(staff, destinationPart, false)

        ///! NOTE: need to unlink before linking
        staff.setLinks(null)
        Excerpt.cloneStaff(sourceStaff, staff)

        this.apply()

        return true
    }

    addSystemObjects(stavesIds: readonly string[]): void {
        const staves = this.staves(stavesIds)
        if (!staves.length) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add system markings'))

        EditPart.addSystemObjects(this.score(), staves)

        this.apply()
    }

    removeSystemObjects(stavesIds: readonly string[]): void {
        const staves = this.staves(stavesIds)
        if (!staves.length) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Remove system markings'))

        EditPart.removeSystemObjects(this.score(), staves)

        this.apply()
    }

    moveSystemObjects(sourceStaffId: string, destinationStaffId: string): void {
        const srcStaff = this.staffModifiable(sourceStaffId)
        if (!srcStaff || !srcStaff.isSystemObjectStaff()) {
            return
        }

        const dstStaff = this.staffModifiable(destinationStaffId)
        if (!dstStaff) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Move system markings'))

        EditPart.moveSystemObjects(this.score(), srcStaff, dstStaff)

        this.apply()
    }

    moveSystemObjectLayerBelowBottomStaff(): void {
        this.startEdit(new TranslatableString('undoableAction', 'Add system object layer below the bottom staff'))

        this.score().undoChangeStyleVal(Sid.systemObjectsBelowBottomStaff, true)

        this.apply()
    }

    moveSystemObjectLayerAboveBottomStaff(): void {
        this.startEdit(new TranslatableString('undoableAction', 'Remove system object layer below the bottom staff'))

        this.score().undoChangeStyleVal(Sid.systemObjectsBelowBottomStaff, false)

        this.apply()
    }

    removeParts(partsIds: readonly string[]): void {
        const partsToRemove = this.parts(partsIds)
        if (!partsToRemove.length) {
            return
        }

        this.endInteractionWithScore()
        this.startEdit(new TranslatableString('undoableAction', 'Remove instruments'))

        this.doRemoveParts(partsToRemove)

        const parts: PartInstrumentList = []
        for (const part of this.score().parts()) {
            parts.push({ isExistingPart: true, partId: part.id() } as PartInstrument)
        }

        this.sortParts(parts)

        this.setBracketsAndBarlines()

        this.apply()
    }

    removeStaves(stavesIds: readonly string[]): void {
        const stavesToRemove = this.staves(stavesIds)
        if (!stavesToRemove.length) {
            return
        }

        this.endInteractionWithScore()
        this.startEdit(new TranslatableString('undoableAction', 'Remove staves'))

        EditPart.removeStaves(this.score(), stavesToRemove)

        this.apply()
    }

    moveParts(sourcePartsIds: readonly string[], destinationPartId: string, mode: InsertMode): void {
        const sourceParts = this.parts(sourcePartsIds)
        if (!sourceParts.length) {
            return
        }

        const destinationPart = this.partModifiable(destinationPartId)
        if (!destinationPart) {
            return
        }

        this.endInteractionWithScore()
        this.startEdit(new TranslatableString('undoableAction', 'Move instruments'))

        EditPart.moveParts(this.score(), sourceParts, destinationPart, mode === InsertMode.After)

        this.apply()
    }

    moveStaves(sourceStavesIds: readonly string[], destinationStaffId: string, mode: InsertMode): void {
        const destinationStaff = this.staffModifiable(destinationStaffId)
        if (!destinationStaff) {
            return
        }

        const staves = this.staves(sourceStavesIds)
        if (!staves.length) {
            return
        }

        for (const staff of staves) {
            if (staff.part() !== destinationStaff.part()) {
                return // C++: IF_ASSERT_FAILED_X "All staves must have the same part!"
            }
        }

        this.endInteractionWithScore()
        this.startEdit(new TranslatableString('undoableAction', 'Move staves'))

        EditPart.moveStaves(this.score(), staves, destinationStaff, mode === InsertMode.After)

        this.apply()
    }

    // ---------------------------------------------------------------------------------
    //   protected
    // ---------------------------------------------------------------------------------

    protected startEdit(actionName: TranslatableString): void {
        this.m_interaction?.undoStack().prepareChanges(actionName)
    }

    protected apply(): void {
        if (this.m_interaction) {
            this.m_interaction.undoStack().commitChanges()
            this.m_interaction.notifyAboutNotationChanged()
        }
        // TODO(port): m_partsChanged.notify()
    }

    protected rollback(): void {
        this.m_interaction?.undoStack().rollbackChanges()
    }

    doSetScoreOrder(order: ScoreOrder): void {
        EditPart.setScoreOrder(this.score(), order)
        // TODO(port): m_scoreOrderChanged.notify()
    }

    doRemoveParts(parts: readonly Part[]): void {
        EditPart.removeParts(this.score(), parts)

        this.onPartsRemoved(parts)
    }

    protected onPartsRemoved(_parts: readonly Part[]): void {}

    protected doAppendStaff(staff: Staff, destinationPart: Part, createRests = true): void {
        const staffLocalIndex = destinationPart.nstaves()
        const keyList = new KeyList() // a copy
        for (const [t, ke] of destinationPart.staff(staffLocalIndex - 1)!.keyList().entries()) {
            keyList.set(t, ke.clone())
        }

        staff.setScore(this.score())
        staff.setPart(destinationPart)

        this.insertStaff(staff, staffLocalIndex, createRests)

        const staffGlobalIndex = staff.idx()
        this.score().adjustKeySigs(staffGlobalIndex, staffGlobalIndex + 1, keyList)

        this.score().updateBracesAndBarlines(destinationPart, staffLocalIndex)
        this.setBracketsAndBarlines()

        destinationPart.instrument().setClefType(staffLocalIndex, staff.defaultClefType())
    }

    protected doSetStaffConfig(staff: Staff, config: StaffConfig): void {
        const staffType = staff.staffType(new Fraction(0, 1))
        if (!staffType) {
            return
        }

        this.score().undo(new ChangeStaff(staff, config.visible, config.clefTypeList, config.userDistance, config.cutaway,
            config.hideSystemBarline, config.mergeMatchingRests, config.reflectTranspositionInLinkedTab))

        this.score().undo(new ChangeStaffType(staff, config.staffType))
    }

    removeMissingParts(newParts: PartInstrumentList): void {
        const needRemove = (part: Part): boolean => !newParts.some(pi => pi.partId === part.id())

        const partsToRemove = this.score().parts().filter(needRemove)

        this.doRemoveParts(partsToRemove)
    }

    insertNewParts(parts: PartInstrumentList, keyList: KeyList = this.score().keyList()): void {
        let partIdx = 0

        for (const pi of parts) {
            if (pi.isExistingPart) {
                ++partIdx
                continue
            }

            const instrument = Instrument.fromTemplate(pi.instrumentTemplate)
            const longNames = instrument.longNames()
            const shortNames = instrument.shortNames()

            const part = new Part(this.score())
            part.setSoloist(pi.isSoloist)
            part.setInstrument(instrument)

            const instrumentNumber = this.resolveNewInstrumentNumber(pi.instrumentTemplate, parts)

            const longName = longNames.length ? longNames[0].name() : ''
            const formattedLongName = formatInstrumentTitleOnScore(longName, instrument.trait(), instrumentNumber)
            const shortName = shortNames.length ? shortNames[0].name() : ''
            const formattedShortName = formatInstrumentTitleOnScore(shortName, instrument.trait(), instrumentNumber)

            part.setPartName(formattedLongName)
            part.setLongName(formattedLongName)
            part.setShortName(formattedShortName)

            const excerpt = this.score().excerpt()
            if (excerpt) {
                this.score().undo(new AddPartToExcerpt(excerpt, part, partIdx))
            } else {
                this.score().undoInsertPart(part, partIdx)
            }
            this.appendStaves(part, pi.instrumentTemplate, keyList)
            ++partIdx
        }
    }

    appendStaves(part: Part, templ: InstrumentTemplate, keyList: KeyList): void {
        for (let staffIndex = 0; staffIndex < templ.staffCount; ++staffIndex) {
            const staff = Factory.createStaff(part)
            let staffType = templ.staffTypePreset
            if (!staffType) {
                staffType = StaffType.preset(StaffTypes.STANDARD)
            }
            this.initStaff(staff, templ, staffType, staffIndex)

            this.insertStaff(staff, staffIndex)
        }

        if (!part.nstaves()) {
            return
        }

        const firstStaffIndex = part.staff(0)!.idx()
        const endStaffIndex = firstStaffIndex + part.nstaves()
        this.score().adjustKeySigs(firstStaffIndex, endStaffIndex, keyList)
    }

    insertStaff(staff: Staff, destinationStaffIndex: number, createRest = true): void {
        this.score().undoInsertStaff(staff, destinationStaffIndex, createRest)
    }

    initStaff(staff: Staff, templ: InstrumentTemplate, staffType: StaffType | null, cleffIndex: number): void {
        let staffTypePreset = staffType ? staffType : templ.staffTypePreset
        if (!staffTypePreset) {
            staffTypePreset = StaffType.getDefaultPreset(templ.staffGroup)
        }

        const stt = staff.setStaffType(new Fraction(0, 1), staffTypePreset)
        if (cleffIndex >= MAX_STAVES) {
            stt.setSmall(false)
        } else {
            stt.setSmall(templ.smallStaff[cleffIndex])
            stt.setLines(templ.staffLines[cleffIndex])
            staff.setBracketType(0, templ.bracket[cleffIndex])
            staff.setBracketSpan(0, templ.bracketSpan[cleffIndex])
            staff.setBarLineSpan(templ.barlineSpan[cleffIndex])
        }
        staff.setDefaultClefType(templ.clefType(cleffIndex))
    }

    updateSoloist(parts: PartInstrumentList): void {
        for (const pi of parts) {
            const part = this.partModifiable(pi.partId)

            if (pi.isExistingPart && part && pi.isSoloist !== part.soloist()) {
                this.score().undo(new SetSoloist(part, pi.isSoloist))
            }
        }
    }

    sortParts(parts: PartInstrumentList): void {
        const staffMapping: number[] = []

        let partIndex = 0
        for (const pi of parts) {
            const currentPart = pi.isExistingPart ? this.partModifiable(pi.partId)! : this.score().parts()[partIndex]

            for (const staff of currentPart.staves()) {
                const actualStaffIndex = this.score().staves().indexOf(staff)
                staffMapping.push(actualStaffIndex)
            }
            ++partIndex
        }

        this.score().undo(new SortStaves(this.score(), staffMapping))
    }

    resolveNewInstrumentNumber(instrument: InstrumentTemplate, allNewInstruments: PartInstrumentList): number {
        let count = 0

        for (const part of this.score().parts()) {
            const partInstrument = part.instrument()

            if (partInstrument.id() === instrument.id) {
                ++count
            }
        }

        if (count > 0) {
            return count + 1
        }

        for (const partInstrument of allNewInstruments) {
            const templ = partInstrument.instrumentTemplate

            if (templ && templ.id === instrument.id) {
                ++count
            }
        }

        return count > 1 ? 1 : 0
    }

    setBracketsAndBarlines(): void {
        this.score().setBracketsAndBarlines()
    }

    endInteractionWithScore(): void {
        if (!this.m_interaction) {
            return
        }
        this.m_interaction.clearSelection()
        this.m_interaction.noteInput().endNoteInput(/*resetState=*/ true)
    }
}
