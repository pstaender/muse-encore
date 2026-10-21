/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/measures/measuressettingsmodel.h/.cpp: the state of the measures
 * section; its commands are actions ("insert-measures…", "time-delete", "move-measure-to-prev-system",
 * "move-measure-to-next-system", "toggle-system-lock", "make-into-system") the app dispatches.
 */

import { LayoutMode } from '../../engraving/dom/score'
import { AbstractInspectorModel, InspectorSectionType, type IElementRepositoryService } from '../abstractinspectormodel'
import type { PropertyItem } from '../propertyitem'

/** MeasuresSettingsModel::InsertMeasuresTarget and the actions it dispatches */
export const INSERT_MEASURES_ACTIONS = {
    AfterSelection: 'insert-measures-after-selection',
    BeforeSelection: 'insert-measures',
    AtStartOfScore: 'insert-measures-at-start-of-score',
    AtEndOfScore: 'append-measures',
} as const

export class MeasuresSettingsModel extends AbstractInspectorModel {
    private m_allSystemsAreLocked = false
    private m_scoreIsInPageView = true
    private m_isMakeIntoSystemAvailable = false
    private m_systemCount = 0

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setSectionType(InspectorSectionType.SECTION_MEASURES)
        this.setTitle(AbstractInspectorModel.tr('Measures'))
    }

    override properties(): Record<string, PropertyItem> {
        return {}
    }

    override flags(): Record<string, unknown> {
        return {
            allSystemsAreLocked: this.m_allSystemsAreLocked, scoreIsInPageView: this.m_scoreIsInPageView,
            isMakeIntoSystemAvailable: this.m_isMakeIntoSystemAvailable, systemCount: this.m_systemCount,
        }
    }

    override isEmpty(): boolean {
        return !this.m_repository.isRangeSelection()
    }

    override requestElements(): void {
        // the model works on the selection itself
    }

    override loadProperties(): void {
        const score = this.m_repository.score()
        this.m_scoreIsInPageView = !!score && score.layoutMode() !== LayoutMode.LINE
        if (this.isEmpty() || !score) {
            return
        }
        const selection = score.selection()
        const systems = selection.selectedSystems()
        this.m_allSystemsAreLocked = systems.every(s => s.isLocked())
        this.m_systemCount = systems.length
        const startMB = selection.startMeasureBase()
        const endMB = selection.endMeasureBase()
        if (startMB && endMB) {
            this.m_isMakeIntoSystemAvailable = !(startMB.isStartOfSystemLock() && endMB.isEndOfSystemLock()
                && startMB.systemLock() === endMB.systemLock())
        }
    }
}
