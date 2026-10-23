/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/abstractstyledialogmodel.h/.cpp: the base of the
 * models of the QML pages of the Style dialog. The style is passed in (C++: the current notation's style);
 * deinit() ends the subscription to its styleChanged() notification (C++: Asyncable, when the QML object dies).
 */

import { MStyle } from '../../engraving/style/style'
import type { Sid } from '../../engraving/style/styledef'
import { Spatium } from '../../engraving/types/dimension'
import { P_TYPE, type PropertyValue } from '../../engraving/types/propertyvalue'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { StyleItem } from './styleitem'

export abstract class AbstractStyleDialogModel {
    private m_inited = false
    private m_ids: Set<Sid>
    private m_items = new Map<Sid, StyleItem>()
    private m_unsubscribe: (() => void) | null = null

    protected constructor(private m_style: NotationStyle, ids: Iterable<Sid>) {
        this.m_ids = new Set(ids)
    }

    /** ends the subscription; the items are built again on the next styleItem() call */
    deinit(): void {
        this.m_unsubscribe?.()
        this.m_unsubscribe = null
        this.m_items.clear()
        this.m_inited = false
    }

    protected styleItem(id: Sid): StyleItem {
        if (!this.m_inited) {
            for (const mid of this.m_ids) {
                this.m_items.set(mid, this.buildStyleItem(mid))
            }
            this.m_unsubscribe = this.currentNotationStyle().styleChanged().onNotify(() => {
                for (const [sid, item] of this.m_items) {
                    item.setValue(this.toUiValue(sid, this.currentNotationStyle().styleValue(sid)))
                }
            })
            this.m_inited = true
        }
        const item = this.m_items.get(id)
        if (!item) {
            throw new Error(`style id ${id} is not in the model`)
        }
        return item
    }

    protected currentNotationStyle(): NotationStyle { return this.m_style }

    protected addStyleId(id: Sid): void { this.m_ids.add(id) }

    protected buildStyleItem(id: Sid): StyleItem {
        const value = this.toUiValue(id, this.currentNotationStyle().styleValue(id))
        const defaultValue = this.toUiValue(id, this.currentNotationStyle().defaultStyleValue(id))
        return new StyleItem(value, defaultValue, (newValue) => {
            this.currentNotationStyle().setStyleValue(id, this.fromUiValue(id, newValue))
        })
    }

    private toUiValue(id: Sid, logicalValue: PropertyValue): PropertyValue {
        if (MStyle.valueType(id) === P_TYPE.SPATIUM) {
            return logicalValue instanceof Spatium ? logicalValue.val() : Number(logicalValue)
        }
        return logicalValue
    }

    /** C++ PropertyValue::fromQVariant(uiValue, type): the ui value converted to the style value's type */
    private fromUiValue(id: Sid, uiValue: PropertyValue): PropertyValue {
        switch (MStyle.valueType(id)) {
        case P_TYPE.SPATIUM:
            return new Spatium(Number(uiValue))
        case P_TYPE.BOOL:
            return Boolean(uiValue)
        default:
            return uiValue
        }
    }
}
