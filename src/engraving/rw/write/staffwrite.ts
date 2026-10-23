/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/staffwrite.h/.cpp
 */

import { VOICES, type staff_idx_t } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { Staff } from '../../dom/staff'
import type { XmlWriter } from '../xmlwriter'
import type { WriteContext } from './writecontext'
import { TWrite } from './twrite'
import { MeasureWrite } from './measurewrite'

function writeMeasure(xml: XmlWriter, ctx: WriteContext, m: MeasureBase, staffIdx: staff_idx_t,
                      writeSystemElements: boolean, forceTimeSig: boolean): void {
    //
    // special case multi measure rest
    //
    if (m.isMeasure() || staffIdx === 0) {
        if (m.isMeasure()) {
            MeasureWrite.writeMeasure(m as Measure, xml, ctx, staffIdx, writeSystemElements, forceTimeSig)
        } else {
            TWrite.writeItem(m, xml, ctx)
        }
    }

    if (m.score().style().styleB(Sid.createMultiMeasureRests) && m.isMeasure() && (m as Measure).mmRest()) {
        MeasureWrite.writeMeasure((m as Measure).mmRest()!, xml, ctx, staffIdx, writeSystemElements, forceTimeSig)
    }

    ctx.setCurTick(m.endTick())
}

export class StaffWrite {
    static writeStaff(staff: Staff, xml: XmlWriter, ctx: WriteContext, measureStart: MeasureBase,
                      measureEnd: MeasureBase | null, staffStart: staff_idx_t, staffIdx: staff_idx_t): void {
        xml.startElement(staff, [['id', staffIdx + 1 - staffStart]])

        ctx.setCurTick(measureStart.tick())
        ctx.setTickDiff(ctx.curTick())
        ctx.setCurTrack(staffIdx * VOICES)
        const writeSystemElements = (staffIdx === staffStart)
        let firstMeasureWritten = false
        let forceTimeSig = false
        for (let m: MeasureBase | null = measureStart; m && m !== measureEnd; m = m.next()) {
            // force timesig if first measure and range is set
            if (ctx.shouldWriteRange() && m.isMeasure()) {
                if (!firstMeasureWritten) {
                    forceTimeSig = true
                    firstMeasureWritten = true
                } else {
                    forceTimeSig = false
                }
            }
            writeMeasure(xml, ctx, m, staffIdx, writeSystemElements, forceTimeSig)
        }

        xml.endElement()
    }
}
