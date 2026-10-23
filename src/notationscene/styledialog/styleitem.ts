/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/styleitem.h/.cpp: one style value of a page of
 * the Style dialog. The UI value is the PropertyValue (a Spatium as its number). valueChanged() replaces the Qt
 * signal valueChanged (C++ -> UI), the onModified callback the signal valueModified (UI -> C++).
 */

import { propertyValueEquals, type PropertyValue } from '../../engraving/types/propertyvalue'
import { Notification } from '../../notation/internal/notationundostack'

export class StyleItem {
    private m_valueChanged = new Notification()

    constructor(private m_value: PropertyValue, private m_defaultValue: PropertyValue,
        private m_onModified: (newValue: PropertyValue) => void) {}

    value(): PropertyValue { return this.m_value }

    /** C++ -> UI */
    setValue(value: PropertyValue): boolean {
        if (propertyValueEquals(value, this.m_value)) {
            return false
        }

        this.m_value = value
        this.m_valueChanged.notify()
        return true
    }

    /** UI -> C++ (the QML's `styleItem.value = ...`) */
    modifyValue(value: PropertyValue): void {
        if (this.setValue(value)) {
            this.m_onModified(value)
        }
    }

    defaultValue(): PropertyValue { return this.m_defaultValue }

    isDefault(): boolean {
        return propertyValueEquals(this.m_value, this.m_defaultValue)
    }

    reset(): void {
        this.modifyValue(this.m_defaultValue)
    }

    valueChanged(): Notification { return this.m_valueChanged }
}
