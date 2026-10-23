/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/utilities/scorerangeutilities.h/.cpp
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../../engraving/types/fraction'
import { nidx, type staff_idx_t } from '../../engraving/types/types'
import type { Score } from '../../engraving/dom/score'
import type { Segment } from '../../engraving/dom/segment'
import type { System } from '../../engraving/dom/system'

interface RangeSection {
    system: System
    startSegment: Segment
    endSegment: Segment
}

export class ScoreRangeUtilities {
    /** the rectangles (canvas coordinates) of a range, one per system */
    static boundingArea(score: Score, startSegment: Segment | null, endSegment: Segment | null,
        startStaffIndex: staff_idx_t, endStaffIndex: staff_idx_t): RectF[] {
        if (!startSegment || !endSegment || startSegment.tick().gt(endSegment.tick())) {
            return []
        }

        const result: RectF[] = []

        const sections = ScoreRangeUtilities.splitRangeBySections(startSegment, endSegment)

        for (const section of sections) {
            const firstStaff = ScoreRangeUtilities.firstVisibleStaffIdx(score, section.system, startStaffIndex)
            const lastStaff = ScoreRangeUtilities.lastVisibleStaffIdx(score, section.system, endStaffIndex)
            if (firstStaff === nidx || lastStaff === nidx) {
                continue
            }

            const segmentFirstStaff = section.system.staff(firstStaff)!
            const segmentLastStaff = section.system.staff(lastStaff)!

            const scoreFirstStaff = score.staff(firstStaff)!
            const scoreLastStaff = score.staff(lastStaff)!

            const standardStaffHeight = 4 * scoreFirstStaff.spatium(new Fraction(0, 1))
            const firstStaffHeight = scoreFirstStaff.staffHeight()
            const lastStaffHeight = scoreLastStaff.staffHeight()

            let topY = 0.0
            if (firstStaffHeight < standardStaffHeight) {
                const diff = standardStaffHeight - firstStaffHeight
                topY -= 0.5 * diff
            }

            let bottomY = lastStaffHeight
            if (lastStaffHeight < standardStaffHeight) {
                const diff = standardStaffHeight - lastStaffHeight
                bottomY += 0.5 * diff
            }

            let x1 = section.startSegment.pagePos().x()
            const x2 = section.endSegment.pageBoundingRect().right()
            const padding = Math.trunc(0.5 * scoreFirstStaff.spatium(startSegment.tick())) // C++ int
            const y1 = topY + segmentFirstStaff.y() + section.startSegment.pagePos().y() - padding
            const y2 = bottomY + segmentLastStaff.y() + section.endSegment.pagePos().y() + padding

            if (section.startSegment.measure().firstEnabled() === section.startSegment) {
                x1 = section.startSegment.measure().pagePos().x()
            }

            const rect = RectF.fromPoints(new PointF(x1, y1), new PointF(x2, y2)).translated(section.system.page()!.pos())
            result.push(rect)
        }

        return result
    }

    private static splitRangeBySections(rangeStartSegment: Segment, rangeEndSegment: Segment): RangeSection[] {
        const sections: RangeSection[] = []

        let startSegment = rangeStartSegment
        const rangeEndTick = rangeEndSegment.tick()

        for (let segment: Segment | null = startSegment; segment && segment !== rangeEndSegment && segment.tick().lt(rangeEndTick);) {
            const currentSegmentSystem = segment.measure().system()!

            let nextSegment = segment.next1MMenabled()
            while (nextSegment && !nextSegment.visible()) {
                nextSegment = nextSegment.next1MMenabled()
            }

            if (!nextSegment) {
                sections.push({ system: currentSegmentSystem, startSegment, endSegment: segment })
                break
            }

            let nextSegmentSystem = nextSegment.measure().system()
            if (!nextSegmentSystem) {
                const mmr = nextSegment.measure().coveringMMRestOrThis()
                if (mmr) {
                    nextSegmentSystem = mmr.system()
                }
                if (!nextSegmentSystem) {
                    break
                }
            }

            if (nextSegmentSystem !== currentSegmentSystem || nextSegment.tick().ge(rangeEndTick)) {
                sections.push({ system: currentSegmentSystem, startSegment, endSegment: segment })
                startSegment = nextSegment
            }

            segment = nextSegment
        }

        return sections
    }

    private static firstVisibleStaffIdx(score: Score, system: System, startStaffIndex: staff_idx_t): staff_idx_t {
        for (let i = startStaffIndex; i < score.nstaves(); ++i) {
            if (system.staff(i)!.show()) {
                return i
            }
        }

        return nidx
    }

    private static lastVisibleStaffIdx(_score: Score, system: System, endStaffIndex: staff_idx_t): staff_idx_t {
        for (let i = endStaffIndex - 1; i >= 0; --i) {
            if (system.staff(i)!.show()) {
                return i
            }
        }

        return nidx
    }
}
