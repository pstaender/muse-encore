/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/masternotationparts.h/.cpp: the part commands of the main score, which also change
 * the part scores (excerpts). There are no excerpt notations in the port: the excerpts' parts are changed through
 * NotationParts of the excerpt scores (without interaction; the master score's undo stack is locked meanwhile, so the
 * changes are recorded in the master command, like in C++).
 * TODO(port): replaceDrumset
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { NotationParts } from './notationparts'
import type { MasterScore } from '../../engraving/dom/masterscore'
import { Part } from '../../engraving/dom/part'
import type { ScoreOrder } from '../../engraving/dom/scoreorder'
import type { Staff } from '../../engraving/dom/staff'
import { isMainInstrumentForPart, type InstrumentKey, type PartInstrument, type PartInstrumentList } from '../notationtypes'
import { ChangeExcerptTitle } from '../../engraving/editing/editexcerpt'
import { formatUniqueExcerptName } from '../../engraving/dom/utils'
import type { Excerpt } from '../../engraving/dom/excerpt'
import type { Instrument } from '../../engraving/dom/instrument'
import type { StaffType } from '../../engraving/dom/stafftype'
import { Interval } from '../../engraving/dom/interval'
import { Transpose } from '../../engraving/editing/transpose'
import type { NotationInteraction } from './notationinteraction'
import '../../engraving/editing/editexcerpt'

export class MasterNotationParts extends NotationParts {
    constructor(score: MasterScore, private m_masterInteraction: NotationInteraction | null = null) {
        super(score, m_masterInteraction)
    }

    private masterScore(): MasterScore { return this.score() as MasterScore }

    private startGlobalEdit(actionName: TranslatableString): void {
        super.startEdit(actionName)
        if (this.m_masterInteraction) {
            this.m_masterInteraction.undoStack().lock()
        }
    }

    private endGlobalEdit(): void {
        if (this.m_masterInteraction) {
            this.m_masterInteraction.undoStack().unlock()
        }
        super.apply()
    }

    override setParts(partList: PartInstrumentList, order: ScoreOrder): void {
        const keyList = this.score().keyList()

        this.endInteractionWithScore()
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Add/remove instruments'))

        this.doSetScoreOrder(order)
        this.removeMissingParts(partList)
        this.insertNewParts(partList, keyList)
        this.updateSoloist(partList)
        this.sortParts(partList)
        this.setBracketsAndBarlines()

        for (const impl of this.excerptsParts()) {
            impl.removeMissingParts(partList)

            const excerptPartList: PartInstrumentList = []
            for (const part of impl.score().parts()) {
                excerptPartList.push({ isExistingPart: true, partId: part.id() } as PartInstrument)
            }

            impl.sortParts(excerptPartList)

            impl.setBracketsAndBarlines()
        }

        // updatePartsAndSystemObjectStaves(): notifications only
        this.endGlobalEdit()
    }

    override removeParts(partsIds: readonly string[]): void {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Remove instruments'))

        super.removeParts(partsIds)

        for (const parts of this.excerptsParts()) {
            parts.removeParts(partsIds)
        }

        this.endGlobalEdit()
    }

    override removeStaves(stavesIds: readonly string[]): void {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Remove staves'))

        super.removeStaves(stavesIds)

        for (const parts of this.excerptsParts()) {
            parts.removeStaves(stavesIds)
        }

        this.endGlobalEdit()
    }

    override appendStaff(staff: Staff, destinationPartId: string): boolean {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Add staff'))

        //! NOTE: will be generated later after adding to the score
        staff.setId('')

        super.appendStaff(staff, destinationPartId)

        for (const parts of this.excerptsParts()) {
            const excerptStaff = staff.clone() as Staff
            if (!parts.appendStaffLinkedToMaster(excerptStaff, staff, destinationPartId)) {
                excerptStaff.undoUnlink()
            }
        }

        this.endGlobalEdit()
        return true
    }

    override appendLinkedStaff(staff: Staff, sourceStaffId: string, destinationPartId: string): boolean {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Add linked staff'))

        //! NOTE: will be generated later after adding to the score
        staff.setId('')

        super.appendLinkedStaff(staff, sourceStaffId, destinationPartId)

        for (const parts of this.excerptsParts()) {
            const excerptStaff = staff.clone() as Staff
            if (!parts.appendLinkedStaff(excerptStaff, sourceStaffId, destinationPartId)) {
                excerptStaff.unlink()
            }
        }

        this.endGlobalEdit()
        return true
    }

    protected override onPartsRemoved(parts: readonly Part[]): void {
        const master = this.masterScore()
        const excerpts = [...master.excerpts()]

        for (const excerpt of excerpts) {
            const initialPartId = excerpt.initialPartId()
            if (!initialPartId) {
                continue
            }

            const deleteExcerpt = parts.some(part => part.id() === initialPartId)

            if (deleteExcerpt) {
                master.deleteExcerpt(excerpt)
            }
        }
    }

    override addSystemObjects(stavesIds: readonly string[]): void {
        if (!stavesIds.length) {
            return
        }

        this.startGlobalEdit(new TranslatableString('undoableAction', 'Add system markings'))

        super.addSystemObjects(stavesIds)

        this.endGlobalEdit()
    }

    override removeSystemObjects(stavesIds: readonly string[]): void {
        if (!stavesIds.length) {
            return
        }

        this.startGlobalEdit(new TranslatableString('undoableAction', 'Remove system markings'))

        super.removeSystemObjects(stavesIds)

        this.endGlobalEdit()
    }

    override moveSystemObjects(sourceStaffId: string, destinationStaffId: string): void {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Move system markings'))

        super.moveSystemObjects(sourceStaffId, destinationStaffId)

        for (const parts of this.excerptsParts()) {
            parts.moveSystemObjects(sourceStaffId, destinationStaffId)
        }

        this.endGlobalEdit()
    }

    override moveSystemObjectLayerBelowBottomStaff(): void {
        if (this.score().nstaves() <= 1) {
            return
        }

        this.startGlobalEdit(new TranslatableString('undoableAction', 'Add system object layer below the bottom staff'))

        super.moveSystemObjectLayerBelowBottomStaff()

        this.endGlobalEdit()
    }

    override moveSystemObjectLayerAboveBottomStaff(): void {
        if (this.score().nstaves() <= 1) {
            return
        }

        this.startGlobalEdit(new TranslatableString('undoableAction', 'Remove system object layer below the bottom staff'))

        super.moveSystemObjectLayerAboveBottomStaff()

        this.endGlobalEdit()
    }

    override replaceInstrument(instrumentKey: InstrumentKey, newInstrument: Instrument, newStaffType: StaffType | null = null): void {
        this.startGlobalEdit(new TranslatableString('undoableAction', 'Replace instrument'))

        const part = this.partModifiable(instrumentKey.partId)
        const isMainInstrument = !!part && isMainInstrumentForPart(instrumentKey, part)

        const oldTranspose = part ? part.instrument().transpose().clone() : new Interval(0, 0)

        super.replaceInstrument(instrumentKey, newInstrument, newStaffType)

        for (const parts of this.excerptsParts()) {
            parts.replaceInstrument(instrumentKey, newInstrument, newStaffType)
        }

        // this also transposes all linked parts
        if (part) {
            Transpose.transpositionChangedAt(this.score(), part, Part.MAIN_INSTRUMENT_TICK, oldTranspose)
        }

        if (part && isMainInstrument) {
            const excerpt = this.findExcerpt(part.id())
            if (excerpt) {
                const allExcerptLowerNames = this.masterScore().excerpts().map(e => e.name().toLowerCase())

                const newName = formatUniqueExcerptName(part.partName(), allExcerptLowerNames)
                excerpt.excerptScore()!.undo(new ChangeExcerptTitle(excerpt, newName))
            }
        }

        this.endGlobalEdit()
    }

    private findExcerpt(initialPartId: string): Excerpt | null {
        for (const excerpt of this.masterScore().excerpts()) {
            if (excerpt.initialPartId() === initialPartId) {
                return excerpt
            }
        }

        return null
    }

    /** the NotationParts of the part scores (C++: the excerpt notations' parts) */
    private excerptsParts(): NotationParts[] {
        const result: NotationParts[] = []
        for (const excerpt of this.masterScore().excerpts()) {
            const score = excerpt.excerptScore()
            if (score) {
                result.push(new NotationParts(score))
            }
        }
        return result
    }
}
