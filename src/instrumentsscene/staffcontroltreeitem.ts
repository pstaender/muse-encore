/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/staffcontroltreeitem.h/.cpp
 */

import type { Score } from '../engraving/dom/score'
import { qtrc } from '../framework/global/translation'
import { AbstractLayoutPanelTreeItem, partById, type LayoutPanelNotationParts } from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'

export class StaffControlTreeItem extends AbstractLayoutPanelTreeItem {
    private m_partId = ''

    constructor(score: Score, parts: LayoutPanelNotationParts | null) {
        super(LayoutPanelItemType.CONTROL_ADD_STAFF, score, parts)
        this.setTitle(qtrc('layoutpanel', 'Add staff'))
    }

    init(partId: string): void {
        this.m_partId = partId
    }

    partId(): string { return this.m_partId }

    override appendNewItem(): void {
        if (!partById(this.score(), this.m_partId)) {
            return
        }
        // C++ creates the staff (Factory::createStaff with the instrument's clef) and calls INotationParts::appendStaff
        this.notationParts()?.appendStaff(this.m_partId)
    }
}
