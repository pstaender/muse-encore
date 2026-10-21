/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/stafftreeitem.h/.cpp
 */

import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { Fraction } from '../engraving/types/fraction'
import { TConv } from '../engraving/types/typesconv'
import { arg, qtrc } from '../framework/global/translation'
import { AbstractLayoutPanelTreeItem, staffById, type LayoutPanelNotationParts } from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'

/** C++ Staff::staffName(): the name of the staff's clef */
export function staffName(staff: Staff): string {
    return TConv.translatedUserNameClefType(staff.clefType(new Fraction(0, 1)).transposingClef)
}

export class StaffTreeItem extends AbstractLayoutPanelTreeItem {
    private m_isInited = false

    constructor(score: Score, parts: LayoutPanelNotationParts | null) {
        super(LayoutPanelItemType.STAFF, score, parts)
        this.setSettingsAvailable(true)
        this.setSettingsEnabled(true)
        this.setIsRemovable(true)
        this.setIsSelectable(true)
    }

    init(masterStaff: Staff): void {
        let staff = staffById(this.score(), masterStaff.id())
        const visible = !!staff && staff.show()

        if (!staff) {
            staff = masterStaff
        }

        const name = staffName(staff)
        //: Prefix for the display name for a linked staff. Preferably, keep this short.
        const title = masterStaff.isLinked() ? arg(qtrc('layoutpanel', '[LINK] %1'), name) : name

        this.setId(staff.id())
        this.setTitle(title)
        this.setIsVisible(visible)

        this.m_isInited = true
    }

    protected override onIsVisibleChanged(isVisible: boolean): void {
        if (!this.m_isInited) {
            return
        }
        const parent = this.parentItem()
        if (isVisible && parent && !parent.isVisible()) {
            parent.setIsVisible(true, false)
        }
        this.notationParts()?.setStaffVisible(this.id(), isVisible)
    }
}
