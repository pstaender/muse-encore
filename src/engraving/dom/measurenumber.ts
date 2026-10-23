/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/measurenumber.h/.cpp
 */

import { ElementType, MeasureNumberPlacement, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import { MeasureNumberBase } from './measurenumberbase'
import type { Measure } from './measure'

const measureNumberStyle: ElementStyle = [
    { sid: Sid.measureNumberVPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.measureNumberMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.measureNumberTextStyle, pid: Pid.TEXT_STYLE },
]

export class MeasureNumber extends MeasureNumberBase {
    constructor(parent: Measure | null, tid: TextStyleType = TextStyleType.MEASURE_NUMBER) {
        super(ElementType.MEASURE_NUMBER, parent, tid)
        this.initElementStyle(measureNumberStyle)
    }

    override isSystemObjectBelowBottomStaff(): boolean {
        return this.style().styleV(Sid.measureNumberPlacementMode) === MeasureNumberPlacement.BELOW_SYSTEM
               || super.isSystemObjectBelowBottomStaff()
    }
}
