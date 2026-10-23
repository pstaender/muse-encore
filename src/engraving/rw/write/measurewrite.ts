/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/measurewrite.h/.cpp
 */

import { ElementType, VOICES, AutoOnOff, type staff_idx_t } from '../../types/types'
import { TConv } from '../../types/typesconv'
import { Pid } from '../../dom/property'
import type { Measure } from '../../dom/measure'
import { SpacerType } from '../../dom/spacer'
import { isSystemTextLine } from '../../dom/textlinebase'
import type { XmlWriter } from '../xmlwriter'
import type { WriteContext } from './writecontext'
import { TWrite } from './twrite'

export class MeasureWrite {
    static writeMeasure(measure: Measure, xml: XmlWriter, ctx: WriteContext, staff: staff_idx_t,
                        writeSystemElements: boolean, forceTimeSig: boolean): void {
        if (measure.ticks().ne(measure.timesig())) {
            // this is an irregular measure
            xml.startElement(measure, [['len', measure.ticks().toString()]])
        } else {
            xml.startElement(measure)
        }

        ctx.setCurTick(measure.tick())
        ctx.setCurTrack(staff * VOICES)

        if (measure.mmRestCount() > 0) {
            xml.tag('multiMeasureRest', measure.mmRestCount())
        }
        if (writeSystemElements) {
            TWrite.writeItemEid(measure, xml, ctx)
            if (measure.repeatStart()) {
                xml.tag('startRepeat')
            }
            if (measure.repeatEnd()) {
                xml.tag('endRepeat', measure.repeatCount())
            }
            TWrite.writeProperty(measure, xml, Pid.IRREGULAR)
            TWrite.writeProperty(measure, xml, Pid.BREAK_MMR)
            TWrite.writeProperty(measure, xml, Pid.USER_STRETCH)
            TWrite.writeProperty(measure, xml, Pid.NO_OFFSET)
            TWrite.writeProperty(measure, xml, Pid.MEASURE_NUMBER_MODE)
        }
        const mstaff = measure.mstaves()[staff]
        if (mstaff.measureNumber() && !mstaff.measureNumber()!.generated()) {
            TWrite.writeItem(mstaff.measureNumber()!, xml, ctx)
        }

        if (mstaff.mmRangeText() && !mstaff.mmRangeText()!.generated()) {
            TWrite.writeItem(mstaff.mmRangeText()!, xml, ctx)
        }

        if (mstaff.vspacerUp()) {
            xml.tag('vspacerUp', mstaff.vspacerUp()!.gap().val())
        }
        if (mstaff.vspacerDown()) {
            if (mstaff.vspacerDown()!.spacerType() === SpacerType.FIXED) {
                xml.tag('vspacerFixed', mstaff.vspacerDown()!.gap().val())
            } else {
                xml.tag('vspacerDown', mstaff.vspacerDown()!.gap().val())
            }
        }
        if (!mstaff.visible()) {
            xml.tag('visible', mstaff.visible())
        }
        if (mstaff.stemless()) {
            xml.tag('stemless', mstaff.stemless())
        }
        if (mstaff.hideIfEmpty() !== AutoOnOff.AUTO) {
            xml.tag('hideIfEmpty', TConv.toXmlAutoOnOff(mstaff.hideIfEmpty()))
        }
        if (mstaff.measureRepeatCount()) {
            xml.tag('measureRepeatCount', mstaff.measureRepeatCount())
        }

        const strack = staff * VOICES
        const etrack = strack + VOICES
        for (const e of measure.el()) {
            if (e.generated()) {
                continue
            }

            let writeSystem = writeSystemElements
            if (e.systemFlag()) {
                const et = e.type()
                if ((et === ElementType.REHEARSAL_MARK)
                    || (et === ElementType.SYSTEM_TEXT)
                    || (et === ElementType.TRIPLET_FEEL)
                    || (et === ElementType.PLAYTECH_ANNOTATION)
                    || (et === ElementType.JUMP)
                    || (et === ElementType.MARKER)
                    || (et === ElementType.TEMPO_TEXT)
                    || isSystemTextLine(e)) {
                    writeSystem = (e.staffIdx() === staff) // always show these on appropriate staves
                }
            }

            if (e.staffIdx() !== staff) {
                if (!e.systemFlag() || (e.systemFlag() && !writeSystem)) {
                    continue
                }
            }

            TWrite.writeItem(e, xml, ctx)
        }
        if (measure.first() && measure.last()) {
            TWrite.writeSegments(xml, ctx, strack, etrack, measure.first()!, measure.last()!.next1(), writeSystemElements,
                forceTimeSig)
        }

        xml.endElement()
    }
}
