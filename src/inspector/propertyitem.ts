/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/propertyitem.h/.cpp (and pointfpropertyitem: a point is a value
 * {x, y} here). The value is the one shown in the UI (QVariant in C++: spatium values as numbers, colors as
 * strings, points in sp or mm); undefined means "not defined" (different values in the selection).
 */

import type { Pid } from '../engraving/dom/property'
import { Sid } from '../engraving/style/styledef'
import type { InspectorChange } from './abstractinspectormodel'

/** a value of a property item as the UI shows it (C++ QVariant) */
export type InspectorValue = number | boolean | string | { x: number; y: number } | number[]

export function inspectorValueEquals(a: InspectorValue | undefined, b: InspectorValue | undefined): boolean {
    if (a === b) {
        return true
    }
    if (typeof a !== 'object' || typeof b !== 'object') {
        return false
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
    }
    return a.x === b.x && a.y === b.y
}

export class PropertyItem {
    private m_currentValue: InspectorValue | undefined = undefined
    private m_styleId: Sid = Sid.NOSTYLE
    private m_isEnabled = false
    private m_isVisible = true
    private m_isModified = false

    /** the changes for a new value (C++ signal propertyModified with the model's callback) */
    onModified: (value: InspectorValue) => InspectorChange[] = () => []
    /** the changes for "reset" (C++ signal resetToDefaultRequested with the model's callback) */
    onReset: () => InspectorChange[] = () => []

    constructor(private readonly m_propertyId: Pid) {}

    updateCurrentValue(currentValue: InspectorValue | undefined): void {
        this.m_currentValue = currentValue
    }

    propertyId(): Pid { return this.m_propertyId }
    value(): InspectorValue | undefined { return this.m_currentValue }
    isUndefined(): boolean { return this.m_currentValue === undefined }
    isEnabled(): boolean { return this.m_isEnabled }
    isVisible(): boolean { return this.m_isVisible }
    isStyled(): boolean { return this.m_styleId !== Sid.NOSTYLE }
    isModified(): boolean { return this.m_isModified }
    styleId(): Sid { return this.m_styleId }

    setStyleId(styleId: Sid): void { this.m_styleId = styleId }
    setIsEnabled(isEnabled: boolean): void { this.m_isEnabled = isEnabled }
    setIsVisible(isVisible: boolean): void { this.m_isVisible = isVisible }
    setIsModified(isModified: boolean): void { this.m_isModified = isModified }

    /** PropertyItem::setValue: the changes to apply to the score (empty if the value is the same) */
    setValue(value: InspectorValue): InspectorChange[] {
        if (inspectorValueEquals(this.m_currentValue, value)) {
            return []
        }
        return this.onModified(value)
    }

    /** PropertyItem::resetToDefault */
    resetToDefault(): InspectorChange[] {
        return this.onReset()
    }
}
