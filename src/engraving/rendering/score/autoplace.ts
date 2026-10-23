/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/autoplace.h/.cpp
 * (C++ double& out-parameters are returned in an object)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { Spatium } from '../../types/dimension'
import { ElementType, PlacementV } from '../../types/types'
import { SkylineLine } from '../../infrastructure/skyline'
import { Sid } from '../../style/styledef'
import { OffsetChange, type EngravingItem, type LayoutData } from '../../dom/engravingitem'
import { Pid, PropertyFlags } from '../../dom/property'
import type { Measure } from '../../dom/measure'
import type { Segment } from '../../dom/segment'
import { SpannerAnchor, type Spanner, type SpannerSegment } from '../../dom/spanner'

const TEXT_BASED_TYPES_WHICH_IGNORE_EACH_OTHER = new Set<ElementType>([
    ElementType.DYNAMIC,
    ElementType.EXPRESSION,
    ElementType.STICKING,
])

export class Autoplace {
    /** C++ autoplaceSegmentElement(item, ldata, above, add) */
    static autoplaceSegmentElement(item: EngravingItem, ldata: LayoutData, above: boolean = item.placeAbove(), add = true): void {
        let rebase = 0.0
        if (ldata.autoplace.offsetChanged !== OffsetChange.NONE) {
            rebase = Autoplace.rebaseOffset(item, ldata)
        }

        const minSkylineHorizontalClearance = item.isArticulationOrFermata() ? 0.0
            : item.style().styleMM(Sid.skylineMinHorizontalClearance) * item.mag()

        if (item.autoplace() && item.explicitParent()) {
            const s = item.findAncestor(ElementType.SEGMENT) as Segment | null
            if (!s) {
                return
            }

            const m = s.measure()

            let sp = item.style().spatium()
            const si = item.effectiveStaffIdx()

            ldata.setIsSkipDraw(si === -1)
            item.setSelectable(!ldata.isSkipDraw())
            if (ldata.isSkipDraw()) {
                return
            }

            const mag = item.staff()!.staffMag(item)
            sp *= mag
            const minDistance = item.minDistance().val() * sp

            const ss = m.system()!.staff(si)!

            const shape = item.ldata().shape().translate(item.systemPos())
            const r = shape.bbox()

            shape.translate(item.staffOffset())

            const staffSkyline = above ? ss.skyline().north() : ss.skyline().south()
            const filteredSkyline = staffSkyline.getFilteredCopy((shapeEl) => {
                const skylineItem = shapeEl.item()
                if (!skylineItem) {
                    return false
                }
                return Autoplace.itemsShouldIgnoreEachOther(item, skylineItem)
            })

            if (filteredSkyline.elements().length === 0) {
                if (add && item.addToSkyline()) {
                    staffSkyline.add(shape)
                }
                return
            }

            const d = above ? filteredSkyline.minDistanceToShapeAbove(shape, minSkylineHorizontalClearance)
                : filteredSkyline.minDistanceToShapeBelow(shape, minSkylineHorizontalClearance)

            if (d > -minDistance) {
                let yd = d + minDistance
                if (above) {
                    yd *= -1.0
                }
                if (ldata.autoplace.offsetChanged !== OffsetChange.NONE) {
                    // user moved element within the skyline
                    // we may need to adjust minDistance, yd, and/or offset
                    const inStaff = above ? r.bottom() + rebase > 0.0 : r.top() + rebase < item.staff()!.staffHeight(item.tick())
                    const res = Autoplace.rebaseMinDistance(item, ldata, minDistance, yd, sp, rebase, above, inStaff)
                    yd = res.yd
                    if (res.rc) {
                        shape.translate(new PointF(0.0, rebase))
                    }
                }
                ldata.moveY(yd)
                shape.translate(new PointF(0.0, yd))
            }
            if (add && item.addToSkyline()) {
                staffSkyline.add(shape)
            }
        }
        Autoplace.setOffsetChanged(item, ldata, false)
    }

    static autoplaceMeasureElement(item: EngravingItem, ldata: LayoutData, above: boolean = item.placeAbove(), add = true): void {
        let rebase = 0.0
        if (ldata.autoplace.offsetChanged !== OffsetChange.NONE) {
            rebase = Autoplace.rebaseOffset(item, ldata)
        }

        if (item.autoplace() && item.explicitParent()) {
            const m = item.explicitParent() as unknown as Measure

            const si = item.effectiveStaffIdx()

            ldata.setIsSkipDraw(si === -1)
            item.setSelectable(!ldata.isSkipDraw())
            if (ldata.isSkipDraw()) {
                return
            }

            const sp = item.style().spatium()
            let minDistance = item.minDistance().val() * sp

            const ss = m.system()!.staff(si)!
            const sh = item.shape().translate(m.pos().plus(item.pos()).plus(item.staffOffset()))

            // compute amount to move
            const sk = new SkylineLine(!above)
            const staffSkyline = above ? ss.skyline().north() : ss.skyline().south()
            const filteredSkyline = staffSkyline.getFilteredCopy((shapeEl) => {
                const skylineItem = shapeEl.item()
                if (!skylineItem) {
                    return false
                }
                return Autoplace.itemsShouldIgnoreEachOther(item, skylineItem)
            })
            let d: number
            sk.add(sh)
            if (above) {
                d = sk.minDistance(filteredSkyline)
            } else {
                d = filteredSkyline.minDistance(sk)
            }
            minDistance *= item.staff()!.staffMag(item)

            if (d > -minDistance) {
                let yd = d + minDistance
                if (above) {
                    yd *= -1.0
                }
                if (ldata.autoplace.offsetChanged !== OffsetChange.NONE) {
                    // user moved element within the skyline
                    // we may need to adjust minDistance, yd, and/or offset
                    const inStaff = above ? sh.bottom() + rebase > 0.0 : sh.top() + rebase < item.staff()!.staffHeight(item.tick())
                    const res = Autoplace.rebaseMinDistance(item, ldata, minDistance, yd, sp, rebase, above, inStaff)
                    yd = res.yd
                    if (res.rc) {
                        sh.translateY(rebase)
                    }
                }
                ldata.moveY(yd)
                sh.translateY(yd)
            }
            if (add && item.addToSkyline()) {
                staffSkyline.add(sh)
            }
        }
        Autoplace.setOffsetChanged(item, ldata, false)
    }

    static autoplaceSpannerSegment(item: SpannerSegment, ldata: LayoutData, sp: number): void {
        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.spanner().propertyDefault(Pid.OFFSET) as PointF)
        }

        if (item.spanner().anchor() === SpannerAnchor.NOTE) {
            return
        }

        let rebase = 0.0
        if (ldata.offsetChanged() !== OffsetChange.NONE) {
            rebase = Autoplace.rebaseOffset(item, ldata)
        }

        if (item.autoplace()) {
            if (!item.systemFlag() && !item.spanner().systemFlag()) {
                sp *= item.staff()!.staffMag(item.spanner().tick())
            }
            const md = item.minDistance().val() * sp
            const above = item.spanner().placeAbove()
            const sl = new SkylineLine(!above)
            const sh = item.shape()
            sl.add(sh.clone().translate(item.pos()))
            let yd = 0.0
            const stfIdx = item.effectiveStaffIdx()
            if (stfIdx === -1) {
                ldata.setIsSkipDraw(true)
                return
            } else {
                ldata.setIsSkipDraw(false)
            }

            const system = item.system()
            if (!system) {
                return
            }
            const staffSkyline = system.staff(stfIdx)!.skyline()
            const skyline = above ? staffSkyline.north() : staffSkyline.south()
            const filteredSkyline = skyline.getFilteredCopy((shapeEl) => {
                const skylineItem = shapeEl.item()
                if (!skylineItem) {
                    return false
                }
                return Autoplace.itemsShouldIgnoreEachOther(item, skylineItem)
            })
            if (above) {
                const d = sl.minDistance(filteredSkyline)
                if (d > -md) {
                    yd = -(d + md)
                }
            } else {
                const d = filteredSkyline.minDistance(sl)
                if (d > -md) {
                    yd = d + md
                }
            }
            if (!RealIsNull(yd)) {
                if (ldata.offsetChanged() !== OffsetChange.NONE) {
                    // user moved element within the skyline
                    // we may need to adjust minDistance, yd, and/or offset
                    const adj = item.pos().y() + rebase
                    const inStaff = above ? sh.bottom() + adj > 0.0 : sh.top() + adj < item.staff()!.staffHeight(item.tick())
                    yd = Autoplace.rebaseMinDistance(item, ldata, md, yd, sp, rebase, above, inStaff).yd
                }
                ldata.moveY(yd)
            }
        }
        Autoplace.setOffsetChanged(item, ldata, false)
    }

    // ---------------------------------------------------------
    //   rebaseOffset
    //    calculates new offset for moved elements
    //    for drag & other actions that result in absolute position, call this
    //    for keyboard nudging, call setOffsetChanged with absolute=false
    // ---------------------------------------------------------

    static rebaseOffset(item: EngravingItem, ldata: LayoutData, nox = true): number {
        const off = item.offset()
        const p = ldata.autoplace.changedPos.minus(item.pos())
        if (nox) {
            p.setX(0.0)
        }
        //OffsetChange saveChangedValue = _offsetChanged;

        const parent = item.explicitParent()
        const staffRelative = !!item.staff() && !!parent && !(parent.isNote() || parent.isRest())
        if (staffRelative && item.propertyFlags(Pid.PLACEMENT) !== PropertyFlags.NOSTYLE) {
            // check if flipped
            // TODO: elements that support PLACEMENT but not as a styled property (add supportsPlacement() method?)
            // TODO: refactor to take advantage of existing cmdFlip() algorithms
            // TODO: adjustPlacement() (from read206.cpp) on read for 3.0 as well
            const r = ldata.bbox().translated(ldata.autoplace.changedPos)
            const staffHeight = item.staff()!.staffHeight(item.tick())
            const e: EngravingItem = item.isSpannerSegment() ? (item as SpannerSegment).spanner() : item
            const multi = e.isSpanner() && (e as Spanner).spannerSegments().length > 1
            const above = e.placeAbove()
            const flipped = above ? r.top() > staffHeight : r.bottom() < 0.0
            if (flipped && !multi) {
                off.setY(off.y() + (above ? -staffHeight : staffHeight))
                item.undoChangeProperty(Pid.OFFSET, off.plus(p))
                ldata.autoplace.offsetChanged = OffsetChange.ABSOLUTE_OFFSET //saveChangedValue;
                ldata.moveY(above ? staffHeight : -staffHeight)
                let pf = e.propertyFlags(Pid.PLACEMENT)
                if (pf === PropertyFlags.STYLED) {
                    pf = PropertyFlags.UNSTYLED
                }
                const place = above ? PlacementV.BELOW : PlacementV.ABOVE
                e.undoChangeProperty(Pid.PLACEMENT, place, pf)
                item.undoResetProperty(Pid.MIN_DISTANCE)
                return 0.0
            }
        }

        if (ldata.autoplace.offsetChanged === OffsetChange.ABSOLUTE_OFFSET) {
            item.undoChangeProperty(Pid.OFFSET, off.plus(p))
            ldata.autoplace.offsetChanged = OffsetChange.ABSOLUTE_OFFSET //saveChangedValue;
            // allow autoplace to manage min distance even when not needed
            item.undoResetProperty(Pid.MIN_DISTANCE)
            return 0.0
        }

        // allow autoplace to manage min distance even when not needed
        item.undoResetProperty(Pid.MIN_DISTANCE)
        return p.y()
    }

    // ---------------------------------------------------------
    //   rebaseMinDistance
    //    calculates new minDistance for moved elements
    //    if necessary, also rebases offset
    //    updates md, yd
    //    returns true if shape needs to be rebased
    // ---------------------------------------------------------

    static rebaseMinDistance(item: EngravingItem, ldata: LayoutData, md: number, yd: number, sp: number, rebase: number, above: boolean,
                             fix: boolean): { rc: boolean, md: number, yd: number } {
        let rc = false
        let pf = item.propertyFlags(Pid.MIN_DISTANCE)
        if (pf === PropertyFlags.STYLED) {
            pf = PropertyFlags.UNSTYLED
        }
        const adjustedY = item.pos().y() + yd
        const diff = ldata.autoplace.changedPos.y() - adjustedY
        if (fix) {
            item.undoChangeProperty(Pid.MIN_DISTANCE, new Spatium(-999.0), pf)
            yd = 0.0
        } else if (!item.isStyled(Pid.MIN_DISTANCE)) {
            md = (above ? md + yd : md - yd) / sp
            item.undoChangeProperty(Pid.MIN_DISTANCE, new Spatium(md), pf)
            yd += diff
        } else {
            // min distance still styled
            // user moved element within skyline
            // but perhaps not really?
            if (ldata.autoplace.offsetChanged === OffsetChange.RELATIVE_OFFSET) {
                // relative movement (cursor): fix only if moving vertically into direction of skyline
                if ((above && diff > 0.0) || (!above && diff < 0.0)) {
                    // rebase offset
                    const p = item.offset()
                    p.setY(p.y() + rebase)
                    item.undoChangeProperty(Pid.OFFSET, p)
                    md = (above ? md - diff : md + diff) / sp
                    item.undoChangeProperty(Pid.MIN_DISTANCE, new Spatium(md), pf)
                    rc = true
                    yd = 0.0
                }
            } else {
                // absolute movement (drag): fix unconditionally
                md = (above ? md + yd : md - yd) / sp
                item.undoChangeProperty(Pid.MIN_DISTANCE, new Spatium(md), pf)
                yd = 0.0
            }
        }
        return { rc, md, yd }
    }

    static setOffsetChanged(item: EngravingItem, ldata: LayoutData, v: boolean, absolute = true, diff: PointF = new PointF()): void {
        if (v) {
            ldata.autoplace.offsetChanged = absolute ? OffsetChange.ABSOLUTE_OFFSET : OffsetChange.RELATIVE_OFFSET
        } else {
            ldata.autoplace.offsetChanged = OffsetChange.NONE
        }
        ldata.autoplace.changedPos = item.pos().plus(diff)
    }

    static itemsShouldIgnoreEachOther(itemToAutoplace: EngravingItem, itemInSkyline: EngravingItem): boolean {
        if (itemToAutoplace === itemInSkyline) {
            return true
        }

        if (itemInSkyline.isText() && itemInSkyline.explicitParent() && itemInSkyline.parent()!.isSLineSegment()) {
            return Autoplace.itemsShouldIgnoreEachOther(itemToAutoplace, itemInSkyline.parentItem()!)
        }

        const type1 = itemToAutoplace.type()
        const type2 = itemInSkyline.type()

        if (type1 === ElementType.TIMESIG) {
            return type2 !== ElementType.KEYSIG
        }

        if (type1 === ElementType.FRET_DIAGRAM && (type2 === ElementType.FRET_DIAGRAM || type2 === ElementType.HARMONY)) {
            const isFretDiagAgainstItsOwnHarmony = itemInSkyline.parentItem() === itemToAutoplace
            const areOnDifferentSegments = itemToAutoplace.findAncestor(ElementType.SEGMENT) !== itemInSkyline.findAncestor(ElementType.SEGMENT)
            return isFretDiagAgainstItsOwnHarmony || areOnDifferentSegments
        }

        if ((type1 === ElementType.DYNAMIC || type1 === ElementType.HAIRPIN_SEGMENT)
            && (type2 === ElementType.DYNAMIC || type2 === ElementType.HAIRPIN_SEGMENT)) {
            return true
        }

        if (type1 === type2) {
            return !itemToAutoplace.isTextBase() || TEXT_BASED_TYPES_WHICH_IGNORE_EACH_OTHER.has(type1)
        }

        if ((type1 === ElementType.DYNAMIC || type1 === ElementType.EXPRESSION)
            && (type2 === ElementType.DYNAMIC || type2 === ElementType.EXPRESSION)) {
            return itemToAutoplace.parent() === itemInSkyline.parent()
        }

        if ((type1 === ElementType.TUPLET || type1 === ElementType.STAFF_LINES)
            && (type2 === ElementType.STAFF_LINES || type2 === ElementType.TUPLET)) {
            const score = itemToAutoplace.score()
            const outOfStaff = score ? !score.style().styleB(Sid.tupletOutOfStaff) : false
            return outOfStaff
        }

        if ((type1 === ElementType.FIGURED_BASS || type1 === ElementType.FIGURED_BASS_ITEM)
            && (type2 === ElementType.FIGURED_BASS || type2 === ElementType.FIGURED_BASS_ITEM)) {
            return true
        }

        if (itemToAutoplace.isArticulationOrFermata() && itemInSkyline.isArticulationOrFermata()) {
            return itemToAutoplace.findAncestor(ElementType.SEGMENT) !== itemInSkyline.findAncestor(ElementType.SEGMENT)
        }

        return itemToAutoplace.ldata().itemSnappedBefore() === itemInSkyline || itemToAutoplace.ldata().itemSnappedAfter() === itemInSkyline
    }
}
