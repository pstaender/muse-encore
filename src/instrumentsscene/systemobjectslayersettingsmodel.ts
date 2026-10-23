/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/systemobjectslayersettingsmodel.h/.cpp: the
 * settings popup of a system markings layer of the Layout panel ("Display at this position on the score": the groups
 * of system objects of the staff, shown or hidden).
 */

import { ElementType } from '../engraving/types/types'
import { TranslatableString } from '../framework/global/types/translatablestring'
import {
    collectSystemObjectGroupsOfStaff, isSystemObjectsGroupVisible, translatedSystemObjectsGroupCapitalizedName,
    type SystemObjectsGroup,
} from './layoutpanelutils'
import type { StaffSettingsNotation } from './staffsettingsmodel'

export class SystemObjectsLayerSettingsModel {
    private m_systemObjectGroups: SystemObjectsGroup[] = []

    constructor(private readonly m_notation: StaffSettingsNotation) {}

    load(staffId: string): void {
        const staff = this.m_notation.parts.staff(staffId)
        if (!staff) {
            return
        }

        this.m_systemObjectGroups = collectSystemObjectGroupsOfStaff(staff)
    }

    /** the rows: title (TitleRole) and visibility (VisibilityRole) */
    groups(): { title: string; isGroupVisible: boolean }[] {
        return this.m_systemObjectGroups.map(group => ({
            title: translatedSystemObjectsGroupCapitalizedName(group),
            isGroupVisible: isSystemObjectsGroupVisible(group),
        }))
    }

    setSystemObjectsGroupVisible(index: number, visible: boolean): void {
        const group = this.m_systemObjectGroups[index]
        if (!group) {
            return
        }

        const actionName = visible
            ? new TranslatableString('undoableAction', 'Make system marking(s) visible')
            : new TranslatableString('undoableAction', 'Make system marking(s) invisible')

        this.m_notation.undoStack.prepareChanges(actionName)

        if (group.type === ElementType.MEASURE_NUMBER) {
            group.staff?.undoSetShowMeasureNumbers(visible)
        } else {
            for (const item of group.items) {
                item.undoSetVisible(visible)
            }
        }

        this.m_notation.undoStack.commitChanges()
    }
}
