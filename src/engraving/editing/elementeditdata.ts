/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/elementeditdata.h
 */

import type { PropertyValue } from '../types/propertyvalue'
import type { Pid, PropertyFlags } from '../dom/property'
import type { EngravingItem } from '../dom/engravingitem'

export enum EditDataType {
    ElementEditData,
    TextEditData,
    BarLineEditData,
    BeamEditData,
    NoteEditData,
}

export interface PropertyData {
    id: Pid
    data: PropertyValue
    f: PropertyFlags
}

/**
 * holds element specific data during element editing:
 *
 *    startDragGrip(EditData&)    creates data and attaches it to EditData
 *         dragGrip(EditData&)
 *      endDragGrip(EditData&)    use data to create undo records
 */
export class ElementEditData {
    e: EngravingItem | null = null
    propertyData: PropertyData[] = []

    pushProperty(pid: Pid): void {
        this.propertyData.push({ id: pid, data: this.e!.getProperty(pid), f: this.e!.propertyFlags(pid) })
    }

    type(): EditDataType { return EditDataType.ElementEditData }
}
