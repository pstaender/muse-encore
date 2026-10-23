/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/instrumentsettingsmodel.h/.cpp: the instrument
 * settings popup of the Layout panel (the names of the instrument on the score or part score, hiding empty staves).
 * "Replace instrument" and "Reset all formatting" are the PartTreeItem's (the app).
 */

import { Part } from '../engraving/dom/part'
import { Pid } from '../engraving/dom/property'
import { AutoOnOff } from '../engraving/types/types'
import { TranslatableString } from '../framework/global/types/translatablestring'
import type { InstrumentKey } from '../notation/notationtypes'
import type { StaffSettingsNotation } from './staffsettingsmodel'

export class InstrumentSettingsModel {
    private m_instrumentKey: InstrumentKey = { partId: '', instrumentId: '', tick: Part.MAIN_INSTRUMENT_TICK }
    private m_instrumentName = ''
    private m_instrumentAbbreviature = ''
    private m_hideWhenEmpty = AutoOnOff.AUTO
    private m_hideStavesWhenIndividuallyEmpty = false
    private m_hasMultipleStaves = false

    constructor(private readonly m_notation: StaffSettingsNotation, private readonly m_masterNotation: StaffSettingsNotation) {}

    load(partId: string, instrumentId: string): void {
        this.m_instrumentKey = { partId, instrumentId, tick: Part.MAIN_INSTRUMENT_TICK }

        const part = this.m_notation.parts.part(partId)
        if (!part) {
            return
        }

        this.m_instrumentName = part.instrument().nameAsPlainText()
        this.m_instrumentAbbreviature = part.instrument().abbreviatureAsPlainText()
        this.m_hideWhenEmpty = part.hideWhenEmpty()
        this.m_hideStavesWhenIndividuallyEmpty = part.hideStavesWhenIndividuallyEmpty()
        this.m_hasMultipleStaves = part.nstaves() > 1
    }

    instrumentName(): string { return this.m_instrumentName }
    abbreviature(): string { return this.m_instrumentAbbreviature }
    hideWhenEmpty(): AutoOnOff { return this.m_hideWhenEmpty }
    hideStavesWhenIndividuallyEmpty(): boolean { return this.m_hideStavesWhenIndividuallyEmpty }
    hasMultipleStaves(): boolean { return this.m_hasMultipleStaves }

    isMainScore(): boolean {
        return this.m_notation.score === this.m_masterNotation.score
    }

    setInstrumentName(name: string): void {
        if (this.m_instrumentName === name) {
            return
        }

        this.m_instrumentName = name
        this.m_notation.parts.setInstrumentName(this.m_instrumentKey, name)
    }

    setAbbreviature(abbreviature: string): void {
        if (this.m_instrumentAbbreviature === abbreviature) {
            return
        }

        this.m_instrumentAbbreviature = abbreviature
        this.m_notation.parts.setInstrumentAbbreviature(this.m_instrumentKey, abbreviature)
    }

    setHideWhenEmpty(value: AutoOnOff): void {
        if (this.m_hideWhenEmpty === value) {
            return
        }

        const part = this.m_notation.parts.part(this.m_instrumentKey.partId)
        if (!part) {
            return
        }

        this.m_notation.undoStack.prepareChanges(new TranslatableString('undoableAction', 'Change instrument settings'))

        part.undoChangeProperty(Pid.HIDE_WHEN_EMPTY, value)

        this.m_notation.undoStack.commitChanges()

        this.m_hideWhenEmpty = value
    }

    setHideStavesWhenIndividuallyEmpty(value: boolean): void {
        if (this.m_hideStavesWhenIndividuallyEmpty === value) {
            return
        }

        const part = this.m_notation.parts.part(this.m_instrumentKey.partId)
        if (!part) {
            return
        }

        this.m_notation.undoStack.prepareChanges(new TranslatableString('undoableAction', 'Change instrument settings'))

        part.undoChangeProperty(Pid.HIDE_STAVES_WHEN_INDIVIDUALLY_EMPTY, value)

        this.m_notation.undoStack.commitChanges()

        this.m_hideStavesWhenIndividuallyEmpty = value
    }
}
