/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/measurenumberlayout.h/.cpp
 *
 * TODO(port): MMRestRange
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { AlignH, MeasureNumberPlacement, PlacementV, staff2track } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Pid } from '../../dom/property'
import { SegmentType, type Segment } from '../../dom/segment'
import type { BarLine } from '../../dom/barline'
import type { MeasureNumber } from '../../dom/measurenumber'
import type { MeasureNumberBase } from '../../dom/measurenumberbase'
import type { LayoutContext } from './layoutcontext'
import { TextLayout } from './textlayout'
import { MeasureLayout } from './measurelayout'

export class MeasureNumberLayout {
    static layoutMeasureNumber(item: MeasureNumber, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const placementMode = ctx.conf().styleV(Sid.measureNumberPlacementMode) as MeasureNumberPlacement
        if (placementMode !== MeasureNumberPlacement.ON_ALL_STAVES) {
            item.setPlacement(PlacementV.ABOVE)
        }

        MeasureNumberLayout.layoutMeasureNumberBase(item)

        const itemBBox = ldata.bbox()

        const alignToBarline = ctx.conf().styleB(Sid.measureNumberAlignToBarline)
        const hPlacement = ctx.conf().styleV(Sid.measureNumberHPlacement) as AlignH
        const barlineSeg = MeasureNumberLayout.refBarlineSegment(item, alignToBarline, hPlacement)
        const refBarline = barlineSeg ? barlineSeg.element(item.track()) as BarLine | null : null
        const measure = item.measure()!

        if (alignToBarline) {
            if (refBarline) {
                let xRef = refBarline.pageX() - measure.pageX()
                xRef += (hPlacement === AlignH.RIGHT ? 1.0 : hPlacement === AlignH.HCENTER ? 0.5 : 0.0) * refBarline.width()
                ldata.setPosX(xRef)
            } else {
                ldata.setPosX(0.0)
            }
        } else {
            const firstCRSeg = measure.first(SegmentType.ChordRest)!
            const measureStartEndPos = MeasureLayout.getMeasureStartEndPos(measure, firstCRSeg, item.staffIdx(), false, false, ctx)
            if (hPlacement === AlignH.LEFT) {
                if (measure.header()) {
                    ldata.setPosX(measure.firstNoteRestSegmentX(true) - measure.systemPos().x())
                } else {
                    const xRef = refBarline ? refBarline.pageX() - measure.pageX() : 0.0
                    ldata.setPosX(xRef)
                }
            } else if (hPlacement === AlignH.HCENTER) {
                ldata.setPosX(0.5 * (measureStartEndPos.x1 + measureStartEndPos.x2))
            } else {
                if (refBarline) {
                    const xRef = refBarline.pageX() - measure.pageX() + refBarline.width()
                    ldata.setPosX(xRef)
                } else {
                    ldata.setPosX(measureStartEndPos.x2)
                }
            }
        }

        if (hPlacement === AlignH.LEFT) {
            ldata.moveX(-itemBBox.left())
        } else if (hPlacement === AlignH.HCENTER) {
            ldata.moveX(-0.5 * (itemBBox.right() + itemBBox.left()))
        } else {
            ldata.moveX(-itemBBox.right())
        }

        MeasureNumberLayout.checkBarlineCollisions(item, barlineSeg, hPlacement)
    }

    static layoutMeasureNumberBase(item: MeasureNumberBase): void {
        const ldata = item.mutldata()
        ldata.setPos(new PointF())

        TextLayout.layoutBaseTextBase1(item, ldata)

        const effectiveStaffIdx = item.effectiveStaffIdx()
        const staff = item.score().staff(effectiveStaffIdx)
        if (item.placeBelow()) {
            let yoff = ldata.bbox().height()

            // If there is only one line, the barline spans outside the staff lines, so the default position is not correct.
            if (staff && staff.lines(item.tick()) === 1) {
                yoff += 2.0 * item.spatium()
            } else {
                yoff += item.staff()!.staffHeight()
            }

            ldata.setPosY(yoff)
        } else {
            let yoff = 0.0

            // If there is only one line, the barline spans outside the staff lines, so the default position is not correct.
            if (staff && staff.lines(item.tick()) === 1) {
                yoff -= 2.0 * item.spatium()
            }

            ldata.setPosY(yoff)
        }

        if (item.isStyled(Pid.OFFSET)) {
            const offset = (item.propertyDefault(Pid.OFFSET) as PointF).times(item.staff()!.staffMag(item.tick()))
            item.setOffset(offset)
        }
    }

    private static refBarlineSegment(item: MeasureNumber, alignToBarline: boolean, hPlacement: AlignH): Segment | null {
        let barlineSeg: Segment | null = null
        const measure = item.measure()!
        if (alignToBarline || hPlacement === AlignH.LEFT) {
            for (let seg: Segment | null = measure.first(); seg && seg.tick().eq(measure.tick()) && seg.system() === measure.system();
                seg = seg.prev1MMenabled()) {
                if (seg.isSegType(SegmentType.BarLineType) && seg.isActive()) {
                    barlineSeg = seg
                    break
                }
            }
        } else {
            for (let seg: Segment | null = measure.first(SegmentType.ChordRest);
                seg && seg.tick().le(measure.endTick()) && seg.system() === measure.system(); seg = seg.next1enabled()) {
                if (seg.isSegType(SegmentType.BarLineType) && seg.isActive()) {
                    barlineSeg = seg
                    break
                }
            }
        }
        return barlineSeg
    }

    private static checkBarlineCollisions(item: MeasureNumber, barlineSeg: Segment | null, hPlacement: AlignH): void {
        const ldata = item.mutldata()
        if (hPlacement === AlignH.HCENTER || !item.autoplace()) {
            return
        }

        const itemBBox = ldata.bbox()
        const staffIdx = item.staffIdx()
        let barlineStaff: number
        const system = item.measure()!.system()!
        if ((item.getProperty(Pid.PLACEMENT) as PlacementV) === PlacementV.ABOVE) {
            barlineStaff = system.prevVisibleStaff(staffIdx)
        } else {
            barlineStaff = staffIdx
        }
        if (barlineStaff === -1) {
            return
        }

        const minBarLineDistance = 0.25 * item.spatium()

        if (!barlineSeg || (barlineSeg.segmentType() !== SegmentType.BeginBarLine && !item.score().staff(barlineStaff)!.barLineSpan())) {
            return
        }

        const barline = barlineSeg.element(staff2track(barlineStaff)) as BarLine | null
        if (!barline) {
            return
        }

        const xCur = item.pageX()

        if (hPlacement === AlignH.LEFT) {
            const xMin = barline.pageX() + barline.width() - itemBBox.left() + minBarLineDistance
            if (xMin > xCur) {
                ldata.moveX(xMin - xCur)
            }
        } else {
            const xMax = barline.pageX() - itemBBox.right() - minBarLineDistance
            if (xMax < xCur) {
                ldata.moveX(xMax - xCur)
            }
        }
    }
}
