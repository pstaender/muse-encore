/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Public library API of the layout panel (re-exported by src/index.ts): the tree model of MuseScore's Layout panel
 * (parts, their staves and "Add staff" rows, system markings layers) for a score. Score changes go through the
 * `LayoutPanelNotationParts` the app passes (null: the model is read-only).
 */

import type { Score } from '../engraving/dom/score'
import { AbstractLayoutPanelTreeItem, type LayoutPanelNotationParts } from './abstractlayoutpaneltreeitem'
import { LayoutPanelTreeModel } from './layoutpaneltreemodel'
import { PartTreeItem } from './parttreeitem'

export { LayoutPanelItemType } from './layoutpanelitemtype'
export { InsertMode, type LayoutPanelNotationParts } from './abstractlayoutpaneltreeitem'
export type { AbstractLayoutPanelTreeItem } from './abstractlayoutpaneltreeitem'
export type { PartTreeItem } from './parttreeitem'
export type { StaffTreeItem } from './stafftreeitem'
export type { StaffControlTreeItem } from './staffcontroltreeitem'
export type { SystemObjectsLayerTreeItem } from './systemobjectslayertreeitem'
export type { RootTreeItem } from './roottreeitem'
export { LayoutPanelTreeModel, type SelectModifiers } from './layoutpaneltreemodel'

/**
 * the layout panel's tree of a score (the master score or a part score); `masterParts`: the commands of the master
 * score for a part score (removing instruments and staves, adding staves change the master score and all its parts)
 */
export function createLayoutPanelModel(score: Score, parts: LayoutPanelNotationParts | null = null,
    masterParts: LayoutPanelNotationParts | null = parts): LayoutPanelTreeModel {
    return new LayoutPanelTreeModel(score, parts, masterParts)
}

/** a key that identifies a row across reloads of the model (type and object id; the "Add staff" row by its part) */
export function layoutPanelItemKey(item: AbstractLayoutPanelTreeItem): string {
    const parent = item.parentItem()
    const own = item.id() || `row${item.row()}`
    return parent && parent.parentItem() ? `${item.type()}:${parent.id()}:${own}` : `${item.type()}:${own}`
}

/** the names shown in the instrument settings popup (InstrumentSettingsModel: name and abbreviated name) */
export function layoutPanelPartNames(item: AbstractLayoutPanelTreeItem): { name: string; abbreviature: string } | null {
    const part = item instanceof PartTreeItem ? item.part() : null
    if (!part) {
        return null
    }
    const instrument = part.instrument()
    return {
        name: instrument.longNames()[0]?.toPlainText() ?? '',
        abbreviature: instrument.shortNames()[0]?.toPlainText() ?? '',
    }
}

/** the score's instrument order (LayoutPanelContextMenuModel: the checked item of "Instrument ordering") */
export function layoutPanelScoreOrder(score: Score): { id: string; name: string; customized: boolean } {
    const order = score.scoreOrder()
    return { id: order.id, name: order.name, customized: order.customized }
}
