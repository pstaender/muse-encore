/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/restlayout.h/.cpp
 *
 * TODO(port): tablature rests, dead slapped, images, MMRest shape
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsNull, lrint } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { SymId } from '../../types/symid'
import { BeamMode, DurationType, ElementType, VOICES, staff2track, type staff_idx_t } from '../../types/types'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { Groups } from '../../dom/groups'
import { SegmentType, type Segment } from '../../dom/segment'
import { collectChordsAndRest, collectChordsOverlappingRests } from '../../dom/utils'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import { Rest, type RestLayoutData } from '../../dom/rest'
import type { Staff } from '../../dom/staff'
import type { System } from '../../dom/system'
import type { LayoutConfiguration, LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'
import { BeamLayout } from './beamlayout'
import type { MMRest } from '../../dom/mmrest'

type RestGroup = Rest[]
type InterruptionPoints = Fraction[][]

export class RestLayout {
    static layoutRest(item: Rest, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (item.isGap()) {
            // TODO(port): debugDrawGap
            ldata.reset()
            return
        }

        for (const e of item.el()) {
            if (e.isSymbol()) {
                TLayout.layoutItem(e, ctx)
            }
            // TODO(port): dead slapped, images
        }

        if (item.deadSlapped()) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        const spatium = item.spatium()

        ldata.setPosX(0.0)
        const stt = item.staffType()
        if (stt && stt.isTabStaff()) {
            if (stt.showRests() && stt.genDurations()) {
                // TODO(port): TabDurationSymbol
                ldata.setPos(0.0, 0.0)
                return
            }
        }

        item.setDotLine(Rest.getDotline(item.durationType().type()))

        const yOff = item.offset().y()
        const stf = item.staff()
        const st = stf ? stf.staffTypeForElement(item) : null
        const lineDist = st ? st.lineDistance().val() : 1.0
        const userLine = RealIsNull(yOff) ? 0 : lrint(yOff / (lineDist * spatium))
        const lines = st ? st.lines() : 5

        const naturalLine = RestLayout.computeNaturalLine(lines) // Measured in 1sp steps
        const voiceOffset = RestLayout.computeVoiceOffset(item, ldata) // Measured in 1sp steps
        const wholeRestOffset = RestLayout.computeWholeOrBreveRestOffset(item, voiceOffset, lines)
        const finalLine = naturalLine + voiceOffset + wholeRestOffset

        ldata.sym = item.getSymbol(item.durationType().type(), finalLine + userLine, lines)

        ldata.setPosY(finalLine * lineDist * spatium)
        if (!item.shouldNotBeDrawn()) {
            RestLayout.fillShape(item, ctx.conf())
        }

        item.checkDots()
        let visibleX = item.symWidthNoLedgerLines(ldata) + ctx.conf().styleMM(Sid.dotNoteDistance) * item.mag()
        const visibleDX = ctx.conf().styleMM(Sid.dotDotDistance) * item.mag()
        let invisibleX = item.symWidthNoLedgerLines(ldata)
        const y = item.dotLine() * item.spatium() * 0.5
        for (const dot of item.dotList()) {
            const dotldata = dot.mutldata()
            TLayout.layoutNoteDot(dot)
            if (dot.visible()) {
                dotldata.setPos(visibleX, y)
                visibleX += visibleDX
            } else {
                invisibleX += 0.1 * item.spatium()
                dotldata.setPos(invisibleX, y)
                invisibleX += item.symWidth(SymId.augmentationDot) * dot.mag()
            }
        }
    }

    static fillShape(item: Rest, conf: LayoutConfiguration): void {
        switch (item.type()) {
        case ElementType.REST:
            RestLayout.fillRestShape(item)
            break
        case ElementType.MMREST:
            RestLayout.fillMMRestShape(item as MMRest, conf)
            break
        default:
            break
        }
    }

    static resolveVerticalRestConflicts(ctx: LayoutContext, segment: Segment, staffIdx: staff_idx_t): void {
        const rests: Rest[] = []
        const chords: Chord[] = []
        collectChordsAndRest(segment, staffIdx, chords, rests)

        if (rests.length === 0) {
            return
        }

        collectChordsOverlappingRests(segment, staffIdx, chords)

        for (const rest of rests) {
            rest.verticalClearance().reset()
        }

        const staff = ctx.dom().staff(staffIdx)!

        if (chords.length) {
            RestLayout.resolveRestVSChord(rests, chords, staff, segment)
        }

        if (rests.length < 2) {
            return
        }

        RestLayout.resolveRestVSRest(rests, staff, segment, ctx)
    }

    static resolveRestVSChord(rests: Rest[], chords: Chord[], staff: Staff, segment: Segment): void {
        const tick = segment.tick()
        const lines = staff.lines(tick)
        const spatium = staff.spatium(tick)
        const lineDistance = staff.lineDistance(tick) * spatium

        for (const rest of rests) {
            if (!rest.visible() || !rest.autoplace()) {
                continue
            }
            const isWholeOrHalf = rest.isWholeRest() || rest.durationType().type() === DurationType.V_HALF
            let minRestToChordClearance = isWholeOrHalf ? 0.55 * spatium : 0.35 * spatium
            const restVerticalClearance = rest.verticalClearance()
            for (const chord of chords) {
                if (!chord.visible() || !chord.autoplace()) {
                    continue
                }

                const restAbove = rest.voice() < chord.voice() || (chord.slash() && !(rest.voice() % 2))
                const upSign = restAbove ? -1 : 1
                const restYOffset = rest.offset().y()
                const ignoreYOffset = (restAbove && restYOffset > 0) || (!restAbove && restYOffset < 0)
                const offset = ignoreYOffset ? new PointF(0, restYOffset) : new PointF(0, 0)

                const chordShape = chord.shape().translate(chord.pos())
                chordShape.removeInvisibles()
                chordShape.removeTypes(new Set([ElementType.ARPEGGIO]))
                if (chordShape.empty()) {
                    continue
                }

                let clearance: number
                const restShape = rest.shape().translate(rest.pos().minus(offset))
                if (chord.segment() === rest.segment()) {
                    clearance = restAbove
                        ? restShape.verticalClearance(chordShape)
                        : chordShape.verticalClearance(restShape)
                } else {
                    const limitNote = restAbove ? chord.upNote() : chord.downNote()
                    const noteShape = limitNote.symBbox(limitNote.noteHead()).translated(limitNote.pos())
                    clearance = restAbove ? noteShape.top() - restShape.bottom() : restShape.top() - noteShape.bottom()
                    minRestToChordClearance = 0.0
                }

                const margin = clearance - minRestToChordClearance
                const marginInSteps = Math.floor(margin / lineDistance)
                if (restAbove) {
                    restVerticalClearance.setBelow(marginInSteps)
                } else {
                    restVerticalClearance.setAbove(marginInSteps)
                }

                if (margin > 0) {
                    continue
                }

                rest.verticalClearance().setLocked(true)
                const outAboveStaff = restAbove && restShape.bottom() + margin < minRestToChordClearance
                const outBelowStaff = !restAbove && restShape.top() - margin > (lines - 1) * lineDistance - minRestToChordClearance
                const useHalfSpaceSteps = (outAboveStaff || outBelowStaff) && !isWholeOrHalf
                let yMove: number
                if (useHalfSpaceSteps) {
                    const steps = Math.ceil(Math.abs(margin) / (lineDistance / 2))
                    yMove = steps * lineDistance / 2 * upSign
                    rest.mutldata().moveY(yMove)
                } else {
                    const steps = Math.ceil(Math.abs(margin) / lineDistance)
                    yMove = steps * lineDistance * upSign
                    rest.mutldata().moveY(yMove)
                }
                for (const mergedRest of rest.ldata().mergedRests) {
                    mergedRest.mutldata().moveY(yMove)
                }
                if (isWholeOrHalf) {
                    RestLayout.updateSymbol(rest, rest.mutldata()) // Because it may need to use the symbol with ledger line now
                }
            }
        }
    }

    static resolveRestVSRest(rests: Rest[], staff: Staff, segment: Segment, ctx: LayoutContext, considerBeams = false): void {
        if (rests.length === 0) {
            return
        }

        const tick = segment.tick()
        const spatium = staff.spatium(tick)
        const lineDistance = staff.lineDistance(tick) * spatium
        const lines = staff.lines(tick)
        const minRestToRestClearance = 0.55 * spatium

        for (let i = 0; i < rests.length - 1; ++i) {
            const rest1 = rests[i]
            if (!rest1.visible() || !rest1.autoplace()) {
                continue
            }

            const rest1Clearance = rest1.verticalClearance()
            let shape1 = rest1.shape().translate(rest1.pos().minus(rest1.offset()))

            const rest2 = rests[i + 1]
            if (!rest2.visible() || !rest2.autoplace()) {
                continue
            }

            if (rest1.ldata().mergedRests.includes(rest2) || rest2.ldata().mergedRests.includes(rest1)) {
                continue
            }

            let shape2 = rest2.shape().translate(rest2.pos().minus(rest2.offset()))
            const rest2Clearance = rest2.verticalClearance()

            let clearance: number
            const firstAbove = rest1.voice() < rest2.voice()
            if (firstAbove) {
                clearance = shape1.verticalClearance(shape2)
            } else {
                clearance = shape2.verticalClearance(shape1)
            }
            const margin = clearance - minRestToRestClearance
            const marginInSteps = Math.floor(margin / lineDistance)
            if (firstAbove) {
                rest1Clearance.setBelow(marginInSteps)
                rest2Clearance.setAbove(marginInSteps)
            } else {
                rest1Clearance.setAbove(marginInSteps)
                rest2Clearance.setBelow(marginInSteps)
            }

            if (margin > 0) {
                continue
            }

            const steps = Math.ceil(Math.abs(margin) / lineDistance)
            // Move the two rests away from each other
            let step1 = Math.floor(steps / 2)
            let step2 = Math.ceil(steps / 2)
            let maxStep1 = firstAbove ? rest1Clearance.above() : rest1Clearance.below()
            let maxStep2 = firstAbove ? rest2Clearance.below() : rest2Clearance.above()
            maxStep1 = Math.max(maxStep1, 0)
            maxStep2 = Math.max(maxStep2, 0)
            if (step1 > maxStep1) {
                step2 += step1 - maxStep1 // First rest is locked, try move the second more
            }
            if (step2 > maxStep2) {
                step1 += step2 - maxStep2 // Second rest is locked, try move the first more
            }
            step1 = Math.min(step1, maxStep1)
            step2 = Math.min(step2, maxStep2)
            rest1.mutldata().moveY(step1 * lineDistance * (firstAbove ? -1 : 1))
            rest2.mutldata().moveY(step2 * lineDistance * (firstAbove ? 1 : -1))

            const beam1 = rest1.beam()
            const beam2 = rest2.beam()
            if (beam1 && beam2 && considerBeams) {
                shape1 = rest1.shape().translate(rest1.pos().minus(rest1.offset()))
                shape2 = rest2.shape().translate(rest2.pos().minus(rest2.offset()))

                const beam1Start = beam1.elements()[0]
                const beam1End = beam1.elements()[beam1.elements().length - 1]
                const y1Start = BeamLayout.chordBeamAnchorY(beam1, beam1Start) - beam1Start.pagePos().y()
                const y1End = BeamLayout.chordBeamAnchorY(beam1, beam1End) - beam1End.pagePos().y()
                const beam1Ymid = 0.5 * (y1Start + y1End)

                const beam2Start = beam2.elements()[0]
                const beam2End = beam2.elements()[beam2.elements().length - 1]
                const y2Start = BeamLayout.chordBeamAnchorY(beam2, beam2Start) - beam2Start.pagePos().y()
                const y2End = BeamLayout.chordBeamAnchorY(beam2, beam2End) - beam2End.pagePos().y()
                const beam2Ymid = 0.5 * (y2Start + y2End)

                const centerY = 0.5 * (beam1Ymid + beam2Ymid)
                const upperBound = shape1.bottom()
                const lowerBound = shape2.top()
                let steps2 = 0
                if (centerY < upperBound) {
                    steps2 = Math.floor((centerY - upperBound) / lineDistance)
                } else if (centerY > lowerBound) {
                    steps2 = Math.ceil((centerY - lowerBound) / lineDistance)
                }
                const moveY = steps2 * lineDistance
                rest1.mutldata().moveY(moveY)
                rest2.mutldata().moveY(moveY)

                shape1.translate(new PointF(0.0, moveY))
                shape2.translate(new PointF(0.0, moveY))
                const halfLineDistance = 0.5 * lineDistance
                if (shape1.bottom() < -halfLineDistance) {
                    rest1.mutldata().moveY(halfLineDistance)
                } else if (centerY >= (lines - 1) * lineDistance + halfLineDistance) {
                    rest2.mutldata().moveY(-halfLineDistance)
                }

                rest1.verticalClearance().setLocked(true)
                rest2.verticalClearance().setLocked(true)
                TLayout.layoutBeam(beam1, ctx)
                TLayout.layoutBeam(beam2, ctx)
            }

            const rest1IsWholeOrHalf = rest1.isWholeRest() || rest1.durationType().type() === DurationType.V_HALF
            const rest2IsWholeOrHalf = rest2.isWholeRest() || rest2.durationType().type() === DurationType.V_HALF
            if (rest1IsWholeOrHalf) {
                RestLayout.updateSymbol(rest1, rest1.mutldata())
            }
            if (rest2IsWholeOrHalf) {
                RestLayout.updateSymbol(rest2, rest2.mutldata())
            }
        }
    }

    static alignRests(system: System, ctx: LayoutContext): void {
        const restGroups = RestLayout.computeRestGroups(system, ctx)
        for (const group of restGroups) {
            if (group.length <= 1) {
                continue
            }

            const firstRest = group[0]
            const alignUpwards = firstRest.voice() === 0
            const lineDist = firstRest.staff()!.lineDistance(firstRest.tick()) * firstRest.spatium()

            let yOuterRest = alignUpwards ? Number.MAX_VALUE : -Number.MAX_VALUE
            for (const rest of group) {
                const yRest = rest.ldata().pos().y()
                yOuterRest = alignUpwards ? Math.min(yOuterRest, yRest) : Math.max(yOuterRest, yRest)
            }

            for (const rest of group) {
                const yCur = rest.ldata().pos().y()
                let yResult = yOuterRest
                let restVertClearance = lineDist * (alignUpwards ? rest.verticalClearance().above() : rest.verticalClearance().below())
                const vertPadding = lineDist
                restVertClearance = Math.max(0.0, restVertClearance - vertPadding)
                const requiredMove = yOuterRest - yCur
                if (Math.abs(requiredMove) > restVertClearance) {
                    yResult = alignUpwards ? yCur - restVertClearance : yCur + restVertClearance
                }
                rest.mutldata().setPosY(yResult)
                if (rest.isWholeRest() || rest.durationType().type() === DurationType.V_HALF) {
                    RestLayout.updateSymbol(rest, rest.mutldata())
                }
            }
        }
    }

    static computeRestGroups(system: System, ctx: LayoutContext): RestGroup[] {
        const restGroups: RestGroup[] = []

        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            for (const mb of system.measures()) {
                if (!(mb.isMeasure() && (mb as Measure).hasVoices(staffIdx))) {
                    continue
                }
                const measure = mb as Measure
                const sTrack = staff2track(staffIdx)
                const interruptionPoints = RestLayout.computeInterruptionPoints(measure, staffIdx)
                for (let voice = 0; voice < VOICES; ++voice) {
                    restGroups.push([])
                    const interruptionPointsOnThisVoice = interruptionPoints[voice]
                    const track = sTrack + voice
                    for (let segment = measure.first(SegmentType.ChordRest); segment; segment = segment.next(SegmentType.ChordRest)) {
                        if (interruptionPointsOnThisVoice.length > 0 && segment.rtick().ge(interruptionPointsOnThisVoice[0])) {
                            restGroups.push([])
                            interruptionPointsOnThisVoice.shift()
                        }
                        const item = segment.element(track)
                        if (!(item && item.isRest() && item.visible())) {
                            continue
                        }
                        const rest = item as Rest
                        if (rest.staffMove() === 0 && !rest.isGap() && rest.alignWithOtherRests()) {
                            restGroups[restGroups.length - 1].push(rest)
                        }
                    }
                }
            }
        }

        return restGroups
    }

    static computeInterruptionPoints(measure: Measure, staffIdx: staff_idx_t): InterruptionPoints {
        // Interruption points are points where the alignment of rests is interrupted
        const interruptionPointSets: Fraction[][] = []
        for (let v = 0; v < VOICES; ++v) {
            interruptionPointSets.push([])
        }
        const insert = (set: Fraction[], f: Fraction): void => {
            if (!set.some(x => x.eq(f))) {
                set.push(f)
            }
        }

        const sTrack = staffIdx * VOICES
        const eTrack = sTrack + VOICES

        for (let segment = measure.first(SegmentType.ChordRest); segment; segment = segment.next(SegmentType.ChordRest)) {
            for (let track = sTrack; track < eTrack; ++track) {
                const item = segment.element(track)
                if (!item) {
                    continue
                }
                const gapRest = item.isRest() && (item as Rest).isGap()
                const hasMergedRest = item.isRest() && (item as Rest).ldata().mergedRests.length > 0
                const invisible = item.isChord() ? (item as Chord).allElementsInvisible() : !item.visible()
                if (gapRest || hasMergedRest || invisible) {
                    for (let voice = 0; voice < VOICES; ++voice) {
                        insert(interruptionPointSets[voice], segment.rtick())
                        insert(interruptionPointSets[voice], segment.rtick().plus((item as ChordRest).actualTicks()))
                    }
                    break
                }
            }
        }

        const interruptHere = (chordRest: ChordRest): boolean => {
            const crTicks = chordRest.ticks()
            if (crTicks.gt(new Fraction(1, 8))) {
                return true
            }
            const beamModeChordRest = Groups.baseBeamMode(chordRest)
            switch (beamModeChordRest) {
            case BeamMode.BEGIN:
                return true
            case BeamMode.BEGIN16:
            case BeamMode.BEGIN32:
            case BeamMode.MID:
            case BeamMode.END:
                return false
            default:
                break
            }
            const groups = chordRest.staff()!.group(chordRest.tick())
            const beamModeMeasure = groups.beamMode(chordRest.rtick().ticks(), chordRest.durationType().type())
            return beamModeMeasure === BeamMode.BEGIN
        }

        for (let voice = 0; voice < VOICES; ++voice) {
            const track = sTrack + voice
            for (let segment = measure.first(SegmentType.ChordRest); segment; segment = segment.next(SegmentType.ChordRest)) {
                const thisCR = segment.element(track) as ChordRest | null
                if (thisCR) {
                    if (thisCR.isRest()) {
                        const prevSegment = segment.prevWithElementsOnTrack(track)
                        const hasAdjacentRest = !!prevSegment && prevSegment.element(track)!.isRest()
                        if (hasAdjacentRest) {
                            continue
                        }
                    }
                    if (interruptHere(thisCR)) {
                        insert(interruptionPointSets[voice], segment.rtick())
                    }
                }
            }
        }

        for (const set of interruptionPointSets) {
            set.sort((a, b) => (a.lt(b) ? -1 : (a.gt(b) ? 1 : 0)))
        }
        return interruptionPointSets
    }

    static checkFullMeasureRestCollisions(system: System, ctx: LayoutContext): void {
        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            for (const mb of system.measures()) {
                if (!(mb.isMeasure() && (mb as Measure).hasVoices(staffIdx))) {
                    continue
                }
                const measure = mb as Measure
                let fullMeasureRest: Rest | null = null
                const firstCRSeg = measure.first(SegmentType.ChordRest)
                if (!firstCRSeg) {
                    continue
                }
                const startTrack = staff2track(staffIdx)
                const endTrack = startTrack + VOICES
                for (let track = startTrack; track < endTrack; ++track) {
                    const item = firstCRSeg.element(track)
                    if (item && item.isRest() && (item as Rest).isFullMeasureRest()) {
                        fullMeasureRest = item as Rest
                        break
                    }
                }
                if (!fullMeasureRest) {
                    continue
                }

                const xRest = fullMeasureRest.pagePos().x() - system.pagePos().x()
                const restShape = fullMeasureRest.shape().translate(new PointF(xRest, fullMeasureRest.ldata().pos().y()))

                const measureShape = new Shape()
                for (let segment = measure.first(); segment; segment = segment.next()) {
                    if (!segment.isActive()) {
                        continue
                    }
                    const xSegment = segment.pagePos().x() - system.pagePos().x()
                    measureShape.add(segment.staffShape(staffIdx).translated(new PointF(xSegment, 0.0)))
                }
                measureShape.remove_if((shapeEl) => {
                    const shapeItem = shapeEl.item()
                    return !!shapeItem && ((shapeItem.isRest() && (shapeItem as Rest).isFullMeasureRest())
                                           || shapeItem.isBarLine() || shapeItem.isAccidental())
                })

                if (measureShape.size() === 0) {
                    continue
                }

                const spatium = fullMeasureRest.spatium()
                const lineDist = fullMeasureRest.staff()!.lineDistance(fullMeasureRest.tick()) * spatium
                const minHorizontalDistance = 4 * spatium
                const minVertClearance = 0.75 * spatium

                const alignAbove = fullMeasureRest.voice() === 0
                const verticalClearance = alignAbove ? restShape.verticalClearance(measureShape, minHorizontalDistance)
                    : measureShape.verticalClearance(restShape, minHorizontalDistance)
                if (verticalClearance < minVertClearance) {
                    const diff = minVertClearance - verticalClearance
                    const stepMoves = Math.ceil(diff / lineDist)
                    const yMove = stepMoves * lineDist
                    fullMeasureRest.mutldata().moveY(alignAbove ? -yMove : yMove)
                    RestLayout.updateSymbol(fullMeasureRest, fullMeasureRest.mutldata())
                }
            }
        }
    }

    /** C++ fillShape(const Rest*, Rest::LayoutData*) */
    static fillMMRestShape(item: MMRest, conf: LayoutConfiguration): void {
        const ldata = item.mutldata()
        const shape = new Shape(undefined, null, ShapeType.Composite)
        const vStrokeHeight = conf.styleMM(Sid.mmRestHBarVStrokeHeight)
        shape.add(new RectF(0.0, -(vStrokeHeight * 0.5), ldata.restWidth, vStrokeHeight), item)
        if (item.showNumber()) {
            shape.add(item.numberRect().translated(item.numberPos()), item)
        }
        ldata.setShape(shape)
    }

    static fillRestShape(item: Rest): void {
        const ldata = item.mutldata()
        const shape = new Shape(undefined, null, ShapeType.Composite)

        if (!item.isGap() && !item.shouldNotBeDrawn()) {
            shape.add(ChordLayout.chordRestShape(item))
            shape.add(item.symBbox(ldata.sym), item)
            for (const dot of item.dotList()) {
                if (dot.addToSkyline()) {
                    shape.add(item.symBbox(SymId.augmentationDot).translated(dot.pos()), dot)
                }
            }
        }

        for (const e of item.el()) {
            if (e.addToSkyline()) {
                shape.add(e.shape().translate(e.pos()))
            }
        }

        ldata.setShape(shape)
    }

    static computeNaturalLine(lines: number): number {
        return (lines % 2) ? Math.floor(lines / 2) : Math.ceil(lines / 2)
    }

    static computeVoiceOffset(item: Rest, ldata: RestLayoutData): number {
        ldata.mergedRests = []
        const s = item.segment()
        const measure = item.measure()
        let offsetVoices = !!s && !!measure && (item.voice() > 0 || measure.hasVoicesInRange(item.staffIdx(), item.tick(), item.actualTicks()))
        if (offsetVoices && item.voice() === 0) {
            // do not offset voice 1 rest if there exists a matching invisible rest in voice 2;
            const e = s!.element(item.track() + 1)
            if (e && e.isRest() && !e.visible() && !(e as Rest).isGap()) {
                const r = e as Rest
                if (r.globalTicks().eq(item.globalTicks())) {
                    offsetVoices = false
                }
            }
        }

        if (offsetVoices && item.voice() < 2) {
            // in slash notation voices 1 and 2 are not offset outside the staff
            // if the staff contains slash notation then only offset rests in voices 3 and 4
            const baseTrack = item.staffIdx() * VOICES
            for (let v = 0; v < VOICES; ++v) {
                const e = s!.element(baseTrack + v)
                if (e && e.isChord() && (e as Chord).slash()) {
                    offsetVoices = false
                    break
                }
            }
        }

        if (offsetVoices && item.staff()!.shouldMergeMatchingRests()) {
            // automatically merge matching rests if nothing in any other voice
            // this is not always the right thing to do do, but is useful in choral music
            // and can be enabled via a staff property
            let matchFound = false
            const baseTrack = item.staffIdx() * VOICES
            for (let v = 0; v < VOICES; ++v) {
                if (v === item.voice()) {
                    continue
                }
                const e = s!.element(baseTrack + v)
                // try to find match in any other voice
                if (e) {
                    if (e.isRest()) {
                        const r = e as Rest
                        if (r.globalTicks().eq(item.globalTicks()) && r.durationType().equals(item.durationType())) {
                            matchFound = true
                            ldata.mergedRests.push(r)
                            continue
                        }
                    }
                    // no match found; no sense looking for anything else
                    matchFound = false
                    break
                }
            }
            if (matchFound) {
                offsetVoices = false
            }
        }

        if (!offsetVoices) {
            return 0
        }

        const up = item.voice() === 0 || item.voice() === 2
        const upSign = up ? -1 : 1
        const voiceLineOffset = item.style().styleB(Sid.multiVoiceRestTwoSpaceOffset) ? 2 : 1

        return voiceLineOffset * upSign
    }

    static computeWholeOrBreveRestOffset(item: Rest, voiceOffset: number, lines: number): number {
        let lineMove = 0
        if (item.isWholeRest()) {
            const moveToLineAbove = (lines > 5)
                                    || ((lines > 1 || voiceOffset === -1 || voiceOffset === 2) && !(voiceOffset === -2 || voiceOffset === 1))
            if (moveToLineAbove) {
                lineMove = -1
            }
        } else if (item.isBreveRest() && lines === 1) {
            lineMove = 1
        }
        return lineMove
    }

    static updateSymbol(item: Rest, ldata: RestLayoutData): void {
        const t = item.tick()
        const st = item.staff()!
        const lineDistance = st.lineDistance(t) * item.spatium()
        const lines = st.lines(t)
        const y = item.pos().y()
        const line = Math.floor(y / lineDistance)
        ldata.sym = item.getSymbol(item.durationType().type(), line, lines)
    }
}
