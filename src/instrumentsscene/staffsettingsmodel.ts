/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/staffsettingsmodel.h/.cpp: the staff settings
 * popup of the Layout panel (staff type, the voices of a staff of a part score, small staff, cutaway, hiding empty
 * staves, creating a linked staff). The model works on the current notation (the master score or a part score) and
 * the master notation, each with its NotationParts and undo stack.
 */

import { Pid } from '../engraving/dom/property'
import { StaffType, type StaffTypes } from '../engraving/dom/stafftype'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { AutoOnOff, StaffGroup } from '../engraving/types/types'
import { TranslatableString } from '../framework/global/types/translatablestring'
import type { StaffConfig } from '../notation/notationtypes'
import type { NotationParts } from '../notation/internal/notationparts'
import type { NotationUndoStack } from '../notation/internal/notationundostack'

/** a notation of the model: the score with its parts commands and undo stack */
export interface StaffSettingsNotation {
    score: Score
    parts: NotationParts
    undoStack: NotationUndoStack
}

/** StaffTypeId of a staff type (C++ StaffType::type(): by its xml name) */
function staffTypeId(type: StaffType): StaffTypes {
    const idx = StaffType.presets().findIndex(p => p.xmlName() === type.xmlName())
    return Math.max(0, idx) as StaffTypes
}

export class StaffSettingsModel {
    private m_staffId = ''
    private m_config: StaffConfig | null = null
    private m_voicesVisibility: boolean[] = []

    constructor(private readonly m_notation: StaffSettingsNotation, private readonly m_masterNotation: StaffSettingsNotation) {}

    load(staffId: string): void {
        const staff = this.notationParts().staff(staffId)
        if (!staff) {
            return
        }

        this.m_staffId = staffId
        this.m_config = this.notationParts().staffConfig(staff)

        this.m_voicesVisibility = [...staff.visibilityVoices()]
    }

    /** title (the voice number) and visibility of the voices */
    voices(): { title: number; isVoiceVisible: boolean }[] {
        return this.m_voicesVisibility.map((visible, i) => ({ title: i + 1, isVoiceVisible: visible }))
    }

    /** the staff types the staff can have: text (the preset's name) and value (StaffTypeId) */
    allStaffTypes(): { text: string; value: number }[] {
        const result: { text: string; value: number }[] = []

        const staff = this.notationParts().staff(this.m_staffId)
        if (!staff) {
            return result
        }

        const part = staff.part()
        if (!part) {
            return result
        }

        let maxLines = 0
        let isPercussion = false

        const instrument = part.instrument()
        if (instrument) {
            maxLines = instrument.stringData().frettedStrings()
            isPercussion = instrument.useDrumset()
        }

        const isTypeAllowed = (type: StaffType): boolean => {
            switch (type.group()) {
            case StaffGroup.PERCUSSION: return isPercussion
            case StaffGroup.TAB: return type.lines() <= maxLines
            case StaffGroup.STANDARD: return true
            }
            return false
        }

        for (const type of StaffType.presets()) {
            if (isTypeAllowed(type)) {
                result.push({ text: type.name(), value: staffTypeId(type) })
            }
        }

        return result
    }

    isMainScore(): boolean {
        return this.m_notation.score === this.m_masterNotation.score
    }

    staffType(): number {
        return this.m_config ? staffTypeId(this.m_config.staffType) : 0
    }

    setStaffType(type: number): void {
        if (!this.m_config || this.staffType() === type) {
            return
        }

        this.notationParts().setStaffType(this.m_staffId, type as StaffTypes)
        this.reloadConfig()
    }

    setVoiceVisible(voiceIndex: number, visible: boolean): void {
        if (this.m_voicesVisibility[voiceIndex] === visible) {
            return
        }

        const ok = this.notationParts().setVoiceVisible(this.m_staffId, voiceIndex, visible)
        if (ok) {
            this.m_voicesVisibility[voiceIndex] = visible
        }
    }

    isSmallStaff(): boolean {
        return !!this.m_config?.staffType.isSmall()
    }

    setIsSmallStaff(value: boolean): void {
        if (!this.m_config || this.m_config.staffType.isSmall() === value) {
            return
        }

        this.m_config.staffType = this.m_config.staffType.clone()
        this.m_config.staffType.setSmall(value)
        this.notationParts().setStaffConfig(this.m_staffId, this.m_config)
        this.reloadConfig()
    }

    cutawayEnabled(): boolean {
        return !!this.m_config?.cutaway
    }

    setCutawayEnabled(value: boolean): void {
        if (!this.m_config || this.m_config.cutaway === value) {
            return
        }

        this.m_config.cutaway = value
        this.notationParts().setStaffConfig(this.m_staffId, this.m_config)
        this.reloadConfig()
    }

    /** AutoOnOff: "Follow instrument" (AUTO), "Always hide" (ON), "Never hide" (OFF) */
    hideWhenEmpty(): AutoOnOff {
        return this.staff()?.hideWhenEmpty() ?? AutoOnOff.AUTO
    }

    setHideWhenEmpty(value: AutoOnOff): void {
        const staff = this.staff()
        if (!staff || staff.hideWhenEmpty() === value) {
            return
        }

        this.m_notation.undoStack.prepareChanges(new TranslatableString('undoableAction', 'Change staff settings'))

        staff.undoChangeProperty(Pid.HIDE_WHEN_EMPTY, value)

        this.m_notation.undoStack.commitChanges()
    }

    showIfEntireSystemEmpty(): boolean {
        return this.staff()?.showIfEntireSystemEmpty() ?? false
    }

    setShowIfEntireSystemEmpty(value: boolean): void {
        const staff = this.staff()
        if (!staff || staff.showIfEntireSystemEmpty() === value) {
            return
        }

        this.m_notation.undoStack.prepareChanges(new TranslatableString('undoableAction', 'Change staff settings'))

        staff.undoChangeProperty(Pid.SHOW_IF_ENTIRE_SYSTEM_EMPTY, value)

        this.m_notation.undoStack.commitChanges()
    }

    /** "Create a linked staff": a linked copy of the staff appended to its part (in the master score and its parts) */
    createLinkedStaff(): void {
        const masterParts = this.m_masterNotation.parts
        const sourceStaff = masterParts.staff(this.m_staffId)
        if (!sourceStaff) {
            return
        }

        const linkedStaff = sourceStaff.clone() as Staff
        if (!masterParts.appendLinkedStaff(linkedStaff, sourceStaff.id(), sourceStaff.part().id())) {
            linkedStaff.setLinks(null)
        }
    }

    private staff(): Staff | null {
        return this.notationParts().staff(this.m_staffId)
    }

    private reloadConfig(): void {
        const staff = this.staff()
        if (staff) {
            this.m_config = this.notationParts().staffConfig(staff)
        }
    }

    private notationParts(): NotationParts {
        return this.m_notation.parts
    }
}
