/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/notation/internal/notationparts.cpp and masternotationparts.cpp that creating a new
 * score needs (NotationParts::setParts). There is no undo stack, no notifications and no excerpts.
 * TODO(port): removing parts, changing existing parts, staves and instruments
 */

import { Fraction } from '../../engraving/types/fraction'
import { Factory } from '../../engraving/dom/factory'
import { Instrument } from '../../engraving/dom/instrument'
import { MAX_STAVES, TraitType, type InstrumentTemplate, type Trait } from '../../engraving/dom/instrtemplate'
import { KeyList } from '../../engraving/dom/key'
import { Part } from '../../engraving/dom/part'
import { StaffType, StaffTypes } from '../../engraving/dom/stafftype'
import { EditPart } from '../../engraving/editing/editpart'
import type { Score } from '../../engraving/dom/score'
import type { ScoreOrder } from '../../engraving/dom/scoreorder'
import type { Staff } from '../../engraving/dom/staff'
import type { PartInstrumentList } from '../notationtypes'
import '../../engraving/editing/edit'

function formatInstrumentTitleOnScore(instrumentName: string, trait: Trait, instrumentNumber = 0): string {
    if (instrumentNumber === 0) {
        // Only one instance of this instrument in the score
        if (trait.type === TraitType.Transposition && !trait.isHiddenOnScore) {
            // %1=name ("Horn"), %2=transposition ("C alto"). Example: "Horn in C alto"
            return `${instrumentName} in ${trait.name}`
        }
        return instrumentName // Example: "Flute"
    }

    const num = String(instrumentNumber)

    if (trait.type === TraitType.Transposition && !trait.isHiddenOnScore) {
        // %1=name ("Horn"), %2=transposition ("C alto"), %3=number ("2"). Example: "Horn in C alto 2"
        return `${instrumentName} in ${trait.name} ${num}`
    }

    // %1=name ("Flute"), %2=number ("2"). Example: "Flute 2"
    return `${instrumentName} ${num}`
}

export class NotationParts {
    constructor(private m_score: Score) {}

    score(): Score { return this.m_score }

    /** MasterNotationParts::setParts (TODO(port): excerpts) */
    setParts(parts: PartInstrumentList, order: ScoreOrder): void {
        const keyList = this.score().keyList()

        // TODO(port): endInteractionWithScore(), startGlobalEdit()

        this.doSetScoreOrder(order)
        this.removeMissingParts(parts)
        this.insertNewParts(parts, keyList)
        this.updateSoloist(parts)
        this.sortParts(parts)
        this.setBracketsAndBarlines()

        // TODO(port): excerpts; updatePartsAndSystemObjectStaves() only sends notifications
    }

    doSetScoreOrder(order: ScoreOrder): void {
        EditPart.setScoreOrder(this.score(), order)
    }

    removeMissingParts(newParts: PartInstrumentList): void {
        const needRemove = (part: Part): boolean => !newParts.some(pi => pi.partId === part.id())

        const partsToRemove = this.score().parts().filter(needRemove)
        if (partsToRemove.length) {
            // TODO(port): doRemoveParts
            throw new Error('TODO(port): NotationParts::removeMissingParts')
        }
    }

    insertNewParts(parts: PartInstrumentList, keyList: KeyList): void {
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

            // TODO(port): excerpts (AddPartToExcerpt)
            this.score().undoInsertPart(part, partIdx)
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
            const part = this.score().parts().find(p => p.id() === pi.partId)
            if (pi.isExistingPart && part && pi.isSoloist !== part.soloist()) {
                part.setSoloist(pi.isSoloist) // TODO(port): undo (SetSoloist)
            }
        }
    }

    sortParts(parts: PartInstrumentList): void {
        const staffMapping: number[] = []

        let partIndex = 0
        for (const pi of parts) {
            const currentPart = pi.isExistingPart ? this.score().parts().find(p => p.id() === pi.partId)! : this.score().parts()[partIndex]

            for (const staff of currentPart.staves()) {
                const actualStaffIndex = this.score().staves().indexOf(staff)
                staffMapping.push(actualStaffIndex)
            }
            ++partIndex
        }

        // TODO(port): undo (SortStaves) / Score::sortStaves; new parts are inserted in order (identity mapping)
        if (staffMapping.some((idx, i) => idx !== i)) {
            throw new Error('TODO(port): Score::sortStaves')
        }
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

            if (templ.id === instrument.id) {
                ++count
            }
        }

        return count > 1 ? 1 : 0
    }

    setBracketsAndBarlines(): void {
        this.score().setBracketsAndBarlines()
    }
}
