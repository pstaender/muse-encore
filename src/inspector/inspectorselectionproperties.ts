/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Reading properties of the selected elements, the way AbstractInspectorModel::loadPropertyItem does for one
 * property over all elements that support it (not a C++ function: a small helper of the library API).
 */

import type { Score } from '../engraving/dom/score'
import { Pid, PropertyFlags } from '../engraving/dom/property'
import { Sid } from '../engraving/style/styledef'
import { propertyValueEquals, type PropertyValue } from '../engraving/types/propertyvalue'

export interface InspectorSelectionProperty {
    pid: number
    /** the value of the selected elements that support the property (element units); undefined if none or mixed */
    value: PropertyValue
    /** the selected elements have different values */
    isUndefined: boolean
    /** some selected element supports the property */
    isSupported: boolean
    /** the property has a style value for some element (EngravingObject::getPropertyStyle) */
    isStyled: boolean
    /** some element's value differs from its default or is unstyled */
    isModified: boolean
    /** the default (style) value of the first supporting element */
    defaultValue: PropertyValue
}

/** the given properties (Pid numbers) of the score's selected elements */
export function inspectorSelectionProperties(score: Score, pids: readonly number[]): InspectorSelectionProperty[] {
    const elements = score.selection().elements()
    return pids.map((pid: Pid) => {
        let value: PropertyValue
        let defaultValue: PropertyValue
        let supported = false
        let isUndefined = false
        let isModified = false
        let isStyled = false
        for (const e of elements) {
            const v = e.getProperty(pid)
            if (v === undefined) {
                continue
            }
            const def = e.propertyDefault(pid)
            if (!supported) {
                value = v
                defaultValue = def
                supported = true
            } else if (!isUndefined && !propertyValueEquals(value, v)) {
                isUndefined = true
            }
            if (e.propertyFlags(pid) === PropertyFlags.UNSTYLED || (def !== undefined && !propertyValueEquals(v, def))) {
                isModified = true
            }
            if (e.getPropertyStyle(pid) !== Sid.NOSTYLE) {
                isStyled = true
            }
        }
        return { pid, value: isUndefined ? undefined : value, isUndefined, isSupported: supported, isStyled, isModified, defaultValue }
    })
}
