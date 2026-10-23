/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/property.h/.cpp (the table is generated into propertydata.ts)
 */

import { P_TYPE } from '../types/propertyvalue'
import { Pid, PROPERTY_LIST, PropertyGroup } from './propertydata'

export { Pid, PropertyGroup }

export enum PropertyFlags {
    NOSTYLE, UNSTYLED, STYLED,
}

let s_nameToPid: Map<string, Pid> | null = null

export function propertyId(name: string): Pid {
    if (!s_nameToPid) {
        s_nameToPid = new Map()
        for (const p of PROPERTY_LIST) {
            if (p[4] && !s_nameToPid.has(p[4])) { // the first property with the name (e.g. "color": COLOR, not STAFF_COLOR)
                s_nameToPid.set(p[4], p[0])
            }
        }
    }
    return s_nameToPid.get(name) ?? Pid.END
}

export function propertyType(id: Pid): P_TYPE {
    return PROPERTY_LIST[id]?.[1] ?? P_TYPE.UNDEFINED
}

export function propertyGroup(id: Pid): PropertyGroup {
    return PROPERTY_LIST[id]?.[2] ?? PropertyGroup.NONE
}

export function propertyLink(id: Pid): boolean {
    return PROPERTY_LIST[id]?.[3] ?? false
}

export function propertyLinkSameScore(id: Pid): boolean {
    switch (id) {
    case Pid.STAFF_BARLINE_SPAN:
    case Pid.STAFF_BARLINE_SPAN_FROM:
    case Pid.STAFF_BARLINE_SPAN_TO:
        return false
    default:
        return true
    }
}

export function propertyName(id: Pid): string {
    return PROPERTY_LIST[id]?.[4] ?? ''
}

export function propertyUserName(id: Pid): string {
    return PROPERTY_LIST[id]?.[5] ?? ''
}
