/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/staffread.h/.cpp
 */

import { Fraction } from '../../types/fraction'
import { ElementType, VOICES } from '../../types/types'
import { Factory } from '../../dom/factory'
import { Pid } from '../../dom/property'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { Score } from '../../dom/score'
import type { XmlReader } from '../xmlreader'
import type { ReadContext } from './readcontext'
import { MeasureRead } from './measureread'
import { TRead } from './tread'

export class StaffRead {
    static readStaff(score: Score, e: XmlReader, ctx: ReadContext): void {
        const staff = e.intAttribute('id', 1) - 1
        let measureIdx = 0
        ctx.setCurrentMeasureIndex(0)
        ctx.setTick(new Fraction(0, 1))
        ctx.setTrack(staff * VOICES)

        if (staff === 0) {
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'Measure') {
                    const measure = Factory.createItem(ElementType.MEASURE, score) as Measure
                    measure.setTick(ctx.tick())
                    ctx.setCurrentMeasureIndex(measureIdx++)
                    //
                    // inherit timesig from previous measure
                    //
                    const m = ctx.lastMeasure() // measure->prevMeasure();
                    const f = !ctx.timeSigForNextMeasure().eq(new Fraction(0, 1)) ? ctx.timeSigForNextMeasure()
                        : (m ? m.timesig() : new Fraction(4, 4))
                    measure.setTicks(f)
                    measure.setTimesig(f)
                    ctx.setTimeSigForNextMeasure(new Fraction(0, 1))

                    MeasureRead.readMeasure(measure, e, ctx, staff)
                    measure.checkMeasure(staff)
                    if (!measure.isMMRest()) {
                        score.measures().append(measure)
                        if (m && m.mmRest()) {
                            m.mmRest()!.setNext(measure)
                        }
                        score.checkSpanner(ctx.tick(), ctx.tick().plus(measure.ticks()), /*removeOrphans*/ false)
                        ctx.setLastMeasure(measure)
                        ctx.setTick(measure.tick().plus(measure.ticks()))
                    } else {
                        // this is a multi measure rest
                        // always preceded by the first measure it replaces
                        const m1 = ctx.lastMeasure()
                        if (m1) {
                            m1.setMMRest(measure)
                            measure.setTick(m1.tick())
                            measure.setPrev(m1.prev())
                        }
                    }
                } else if (tag === 'HBox' || tag === 'VBox' || tag === 'TBox' || tag === 'FBox') {
                    const mb = Factory.createItemByName(tag, score) as MeasureBase | null
                    if (!mb) {
                        e.skipCurrentElement() // TODO(port): FBox
                        continue
                    }
                    mb.setTick(ctx.tick())
                    score.measures().append(mb)
                    mb.setSizeIsSpatiumDependent(mb.propertyDefault(Pid.SIZE_SPATIUM_DEPENDENT) as boolean)
                    TRead.readItem(mb, e, ctx)
                } else if (tag === 'tick') {
                    ctx.setTick(Fraction.fromTicks(ctx.fileDivision(e.readInt())))
                } else {
                    e.unknown()
                }
            }
        } else {
            let measure = score.firstMeasure()
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'Measure') {
                    if (!measure) {
                        measure = Factory.createItem(ElementType.MEASURE, score) as Measure
                        measure.setTick(ctx.tick())
                        score.measures().append(measure)
                    }
                    ctx.setTick(measure.tick())
                    ctx.setCurrentMeasureIndex(measureIdx++)
                    MeasureRead.readMeasure(measure, e, ctx, staff)
                    measure.checkMeasure(staff)
                    if (measure.isMMRest()) {
                        measure = ctx.lastMeasure()!.nextMeasure()
                    } else {
                        ctx.setLastMeasure(measure)
                        if (measure.mmRest()) {
                            measure = measure.mmRest()
                        } else {
                            measure = measure.nextMeasure()
                        }
                    }
                } else if (tag === 'tick') {
                    ctx.setTick(Fraction.fromTicks(ctx.fileDivision(e.readInt())))
                } else {
                    e.unknown()
                }
            }
        }
    }
}
