/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/notation/notationtypes.h that creating a new score needs
 */

import { Fraction } from '../engraving/types/fraction'
import { DurationType, Key } from '../engraving/types/types'
import { TimeSigType } from '../engraving/dom/timesig'
import { ScoreOrder } from '../engraving/dom/scoreorder'
import type { InstrumentTemplate } from '../engraving/dom/instrtemplate'

export class Tempo {
    valueBpm = 0
    duration = DurationType.V_QUARTER
    withDot = false
}

export interface PartInstrument {
    partId: string
    instrumentTemplate: InstrumentTemplate
    isExistingPart: boolean
    isSoloist: boolean
}

export type PartInstrumentList = PartInstrument[]

export class ScoreCreateOptions {
    withTempo = false
    tempo = new Tempo()

    globalTimesig = new Fraction(4, 4)
    timesigType = TimeSigType.NORMAL

    key = Key.C

    totalMeasures = 0

    withPickupMeasure = false
    pickupTimesig = new Fraction(1, 4)

    parts: PartInstrumentList = []
    order = new ScoreOrder()
}

export function customOrder(): ScoreOrder {
    const order = new ScoreOrder()
    order.id = 'custom'
    order.name = 'Custom'
    return order
}
