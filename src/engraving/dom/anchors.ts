/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/anchors.h/.cpp (time tick anchors; the anchors are only drawn in edit mode)
 * TODO(port): EditTimeTickAnchors::updateAnchors, MoveElementAnchors (editing)
 */

import { ElementType, staff2track, type staff_idx_t } from '../types/types'
import type { Fraction } from '../types/fraction'
import { ElementFlag, EngravingItem } from './engravingitem'
import { SegmentType, type Segment } from './segment'
import type { Measure } from './measure'
import type { Staff } from './staff'

/** set by rendering/score/scorerenderer.ts (C++ calls MeasureLayout::layoutTimeTickAnchors directly) */
export const anchorsLayoutHooks: { layoutTimeTickAnchors?: (measure: Measure) => void } = {}

const INT_MAX = 2147483647

export class TimeTickAnchor extends EngravingItem {
    constructor(parent: Segment) {
        super(ElementType.TIME_TICK_ANCHOR, parent, ElementFlag.ON_STAFF | ElementFlag.NOT_SELECTABLE | ElementFlag.GENERATED)
        this.setZ(-INT_MAX) // Make sure it is behind everything
    }

    segment(): Segment { return this.parentItem() as unknown as Segment }
}

export class EditTimeTickAnchors {
    static createTimeTickAnchor(measure: Measure, relTick: Fraction, staffIdx: staff_idx_t): TimeTickAnchor | null {
        let returnAnchor: TimeTickAnchor | null = null

        const staff = measure.score().staff(staffIdx)
        if (!staff) {
            return null
        }

        for (const linkedObj of staff.linkList()) {
            const linkedStaff = linkedObj as Staff
            const linkedMeasure = linkedObj === staff ? measure : linkedStaff.score().tick2measureMM(measure.tick())
            if (!linkedMeasure) {
                continue
            }

            const segment = linkedMeasure.getSegmentR(SegmentType.TimeTick, relTick)
            const track = staff2track(linkedStaff.idx())
            const element = segment.element(track)
            let anchor = element ? element as TimeTickAnchor : null
            if (!anchor) {
                anchor = new TimeTickAnchor(segment)
                anchor.setParent(segment)
                anchor.setTrack(track)
                segment.add(anchor)
            }
            if (linkedMeasure === measure) {
                returnAnchor = anchor
            }
        }

        return returnAnchor
    }

    static updateLayout(measure: Measure): void {
        measure.computeTicks()

        anchorsLayoutHooks.layoutTimeTickAnchors?.(measure)
    }
}
