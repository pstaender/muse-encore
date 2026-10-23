/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/systemobjectslayertreeitem.h/.cpp
 * TODO(port): the incremental onScoreChanged(ScoreChanges) (added/removed system objects); without the undo stack's
 * change sets the groups are collected again.
 */

import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { arg, qtrc } from '../framework/global/translation'
import { AbstractLayoutPanelTreeItem, type LayoutPanelNotation } from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'
import {
    collectSystemObjectGroupsOfStaff, isSystemObjectsGroupVisible, translatedSystemObjectsGroupCapitalizedName,
    translatedSystemObjectsGroupName, type SystemObjectGroups,
} from './layoutpanelutils'

function formatLayerTitle(groups: SystemObjectGroups): string {
    if (!groups.length) {
        return qtrc('layoutpanel', 'System markings')
    }

    const visibleGroups = groups.filter(isSystemObjectsGroupVisible)
    if (!visibleGroups.length) {
        return qtrc('layoutpanel', 'System markings hidden')
    }

    let title = translatedSystemObjectsGroupCapitalizedName(visibleGroups[0])
    if (visibleGroups.length === 1) {
        return title
    }

    // has at least 2 visible groups. Build list of the form <First>[, <middle>...] & <last>
    //: %1 is the system markings list, %2 is the next system marking name to add to list
    const middleItem = qtrc('layoutpanel', '%1, %2')
    //: %1 is the system markings list, %2 is the last system marking name to add to list
    const lastItem = qtrc('layoutpanel', '%1 & %2')

    const lastIdx = visibleGroups.length - 1
    for (let i = 1; i < lastIdx; ++i) {
        title = arg(middleItem, title, translatedSystemObjectsGroupName(visibleGroups[i]))
    }

    return arg(lastItem, title, translatedSystemObjectsGroupName(visibleGroups[lastIdx]))
}

function isLayerVisible(groups: SystemObjectGroups): boolean {
    return groups.some(isSystemObjectsGroupVisible)
}

export class SystemObjectsLayerTreeItem extends AbstractLayoutPanelTreeItem {
    private m_staff: Staff | null = null
    private m_staffIdx = -1
    private m_systemObjectGroups: SystemObjectGroups = []

    constructor(masterNotation: LayoutPanelNotation, notation: LayoutPanelNotation) {
        super(LayoutPanelItemType.SYSTEM_OBJECTS_LAYER, masterNotation, notation)
        this.setSettingsAvailable(true)
        this.setIsExpandable(false)
    }

    init(staff: Staff, systemObjects: SystemObjectGroups): void {
        this.setStaff(staff)
        this.setSystemObjects(systemObjects)

        const isTopLayer = staff.score().staff(0) === staff
        this.setIsRemovable(!isTopLayer)
        this.setIsSelectable(!isTopLayer)
    }

    staff(): Staff | null { return this.m_staff }

    setStaff(staff: Staff | null): void {
        this.m_staff = staff
        if (staff) {
            this.setId(staff.id())
            this.m_staffIdx = staff.idx() // optimization
        } else {
            this.setId('')
            this.m_staffIdx = -1
        }
    }

    systemObjects(): SystemObjectGroups { return this.m_systemObjectGroups }

    setSystemObjects(systemObjects: SystemObjectGroups): void {
        this.m_systemObjectGroups = systemObjects
        this.updateState()
    }

    staffId(): string {
        return this.m_staff?.id() ?? ''
    }

    override canAcceptDrop(_item: AbstractLayoutPanelTreeItem): boolean {
        return this.m_staffIdx !== 0 // all except the first
    }

    override onScoreChanged(): void {
        if (this.m_staff) {
            this.m_systemObjectGroups = collectSystemObjectGroupsOfStaff(this.m_staff)
            this.updateState()
        }
    }

    private updateState(): void {
        this.setTitle(formatLayerTitle(this.m_systemObjectGroups))
        this.setSettingsEnabled(this.m_systemObjectGroups.length > 0)
        this.setIsVisible(isLayerVisible(this.m_systemObjectGroups))
    }
}
