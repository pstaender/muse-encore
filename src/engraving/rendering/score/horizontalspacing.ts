/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/horizontalspacing.h/.cpp
 *
 * TODO(port): glissandi, guitar bends, note lines
 */

import type { ChordBracket } from '../../dom/chordbracket'
import { RectF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsEqualOrLess, RealIsEqualOrMore, RealIsNull, clamp } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { SymId } from '../../types/symid'
import { ElementType, GlissandoType, LyricsSyllabic, TimeSigVSMargin, VOICES, staff2track, type staff_idx_t } from '../../types/types'
import { Shape, intersects } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { KerningType, type EngravingItem } from '../../dom/engravingitem'
import { SegmentType, type Segment } from '../../dom/segment'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Clef } from '../../dom/clef'
import type { Lyrics } from '../../dom/lyrics'
import type { Measure } from '../../dom/measure'
import type { Note } from '../../dom/note'
import type { Rest } from '../../dom/rest'
import type { Spanner } from '../../dom/spanner'
import type { Glissando } from '../../dom/glissando'
import type { StemSlash } from '../../dom/stemslash'
import type { System } from '../../dom/system'
import type { TimeSig } from '../../dom/timesig'
import { paddingTable } from '../paddingtable'
import type { LyricsLine } from '../../dom/lyricsline'
import { ParenthesisLayout } from './parenthesislayout'

interface HorizontalSpacingContext {
    system: System
    spatium: number
    xCur: number
    xLeftBarrier: number
    systemIsFull: boolean
    startMeas: Measure | null
    stretchReduction: number
    squeezeFactor: number
    spacingDensity: number
    overrideMinMeasureWidth: boolean
}

function newContext(system: System): HorizontalSpacingContext {
    return {
        system,
        spatium: 0.0,
        xCur: 0.0,
        xLeftBarrier: 0.0,
        systemIsFull: false,
        startMeas: null,
        stretchReduction: 1.0,
        squeezeFactor: 1.0,
        spacingDensity: 1.0,
        overrideMinMeasureWidth: false,
    }
}

interface SegmentPosition {
    segment: Segment
    xPosInSystemCoords: number
    ignoreForSpacing: boolean
}

const segPos = (segment: Segment, x: number, ignoreForSpacing = false): SegmentPosition => ({
    segment, xPosInSystemCoords: x, ignoreForSpacing,
})

interface Spring {
    springConst: number
    width: number
    preTension: number
    segment: Segment
}

interface CrossBeamSpacing {
    upDown: boolean
    downUp: boolean
    canBeAdjusted: boolean
    hasOpposingBeamlets: boolean
    preventCrossStaffKerning: boolean
    ensureMinStemDistance: boolean
}

const HEADER_SEGMENT_TYPES = new Set<SegmentType>([
    SegmentType.HeaderClef,
    SegmentType.KeySig,
    SegmentType.KeySigStartRepeatAnnounce,
    SegmentType.Ambitus,
    SegmentType.TimeSig,
    SegmentType.TimeSigStartRepeatAnnounce,
])

export class HorizontalSpacing {
    static computeSpacingForFullSystem(system: System, stretchReduction = 1.0, squeezeFactor = 1.0, overrideMinMeasureWidth = false): number {
        if (system.score().allStavesInvisible()) {
            return 0.0
        }

        const ctx = newContext(system)
        ctx.spatium = system.spatium()
        ctx.stretchReduction = stretchReduction
        ctx.squeezeFactor = squeezeFactor
        ctx.spacingDensity = system.style().styleD(Sid.spacingDensity)
        ctx.overrideMinMeasureWidth = overrideMinMeasureWidth
        ctx.xCur = system.leftMargin()
        ctx.xLeftBarrier = system.leftMargin()
        ctx.systemIsFull = true

        let measureGroup: Measure[] = []

        for (const mb of system.measures()) {
            if (mb.isHBox()) {
                HorizontalSpacing.spaceMeasureGroup(measureGroup, ctx)
                measureGroup = []
                mb.mutldata().setPosX(ctx.xCur)
                mb.computeMinWidth()
                ctx.xCur += mb.width()
            } else {
                measureGroup.push(mb as Measure)
            }
        }

        HorizontalSpacing.spaceMeasureGroup(measureGroup, ctx)

        return ctx.xCur
    }

    static updateSpacingForLastAddedMeasure(system: System, startOfContinuousLayoutRegion = false): number {
        if (system.score().allStavesInvisible()) {
            return 0.0
        }

        const ctx = newContext(system)
        ctx.spatium = system.spatium()
        ctx.xLeftBarrier = system.leftMargin()
        ctx.spacingDensity = system.style().styleD(Sid.spacingDensity)

        const measures = system.measures()
        const measureCount = measures.length
        if (measureCount === 0) {
            return 0.0
        }

        const secondToLast = measureCount >= 2 ? measures[measureCount - 2] : null
        const last = measures[measureCount - 1]

        if (secondToLast) {
            ctx.xCur = secondToLast.x()
            if (secondToLast.isHBox() || last.isHBox() || startOfContinuousLayoutRegion) {
                ctx.xCur += secondToLast.width()
            }
        } else {
            ctx.xCur = system.leftMargin()
        }

        if (last.isHBox()) {
            last.mutldata().setPosX(ctx.xCur)
            last.computeMinWidth()
            ctx.xCur += last.width()
        } else if (!secondToLast || secondToLast.isHBox() || startOfContinuousLayoutRegion) {
            HorizontalSpacing.spaceMeasureGroup([last as Measure], ctx)
        } else {
            ctx.startMeas = last as Measure
            HorizontalSpacing.spaceMeasureGroup([secondToLast as Measure, last as Measure], ctx)
        }

        return ctx.xCur
    }

    /** C++ squeezeSystemToFit(System*, double& curSysWidth, double); returns the new curSysWidth */
    static squeezeSystemToFit(system: System, curSysWidth: number, targetSysWidth: number): number {
        const firstMeasure = system.firstMeasure()
        if (!firstMeasure) {
            return curSysWidth
        }

        const STRETCH_REDUCTION_STEP = 0.33
        const SQUEEZE_STEP = 0.2

        let squeezeFactor = 1 - SQUEEZE_STEP // Reduces shape paddings
        let stretchReduction = 1 - STRETCH_REDUCTION_STEP // Reduces duration stretch

        while (curSysWidth > targetSysWidth && RealIsEqualOrMore(squeezeFactor, 0.0)) {
            curSysWidth = HorizontalSpacing.computeSpacingForFullSystem(system, stretchReduction, squeezeFactor, true)
            squeezeFactor -= SQUEEZE_STEP
            stretchReduction -= STRETCH_REDUCTION_STEP
        }

        if (curSysWidth < targetSysWidth) {
            return curSysWidth
        }

        // Last resort: reduce every chordRest segment width by a small step until it fits
        const smallerStep = 0.25 * SQUEEZE_STEP
        let widthReduction = 1 - smallerStep
        while (curSysWidth > targetSysWidth && RealIsEqualOrMore(widthReduction, 0.0)) {
            for (const mb of system.measures()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const m = mb as Measure
                const prevWidth = m.width()
                for (let segment = m.first(); segment; segment = segment.next()) {
                    if (!segment.isChordRestType()) {
                        continue
                    }
                    const curSegmentWidth = segment.width()
                    segment.setWidth(curSegmentWidth * widthReduction)
                }
                m.respaceSegments()
                curSysWidth += m.width() - prevWidth
            }
            widthReduction -= smallerStep
        }
        return curSysWidth
    }

    static justifySystem(system: System, curSysWidth: number, targetSystemWidth: number): void {
        const rest = targetSystemWidth - curSysWidth
        if (RealIsNull(rest)) {
            return
        }
        if (rest <= 0) {
            return
        }

        const springs: Spring[] = []

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let s = (mb as Measure).first(); s; s = s.next()) {
                if (s.isChordRestType() && s.ticks().gt(new Fraction(0, 1)) && s.visible() && s.enabled() && !s.allElementsInvisible()) {
                    const springConst = 1 / s.stretch()
                    const width = s.width() - s.widthOffset()
                    const preTension = width * springConst
                    springs.push({ springConst, width, preTension, segment: s })
                }
            }
        }

        HorizontalSpacing.stretchSegmentsToWidth(springs, rest)

        let x = system.leftMargin()
        for (const mb of system.measures()) {
            if (mb.isMeasure()) {
                (mb as Measure).respaceSegments()
            }
            mb.mutldata().setPosX(x)
            x += mb.width()
        }
    }

    private static spaceMeasureGroup(measureGroup: readonly Measure[], ctx: HorizontalSpacingContext): void {
        if (measureGroup.length === 0) {
            return
        }

        measureGroup[0].mutldata().setPosX(ctx.xCur)

        const segList: Segment[] = []
        let startSegIdx = -1

        for (const measure of measureGroup) {
            if (measure === ctx.startMeas) {
                startSegIdx = segList.length
            }
            for (let segment = measure.first(); segment; segment = segment.next()) {
                segList.push(segment)
            }
        }

        if (segList.length === 0) {
            return
        }

        const segmentPositions = HorizontalSpacing.spaceSegments(segList, startSegIdx, ctx)

        HorizontalSpacing.moveRightAlignedSegments(segmentPositions, ctx)

        HorizontalSpacing.setPositionsAndWidths(segmentPositions)

        if (!ctx.overrideMinMeasureWidth) {
            HorizontalSpacing.enforceMinimumMeasureWidths(measureGroup)
        }

        const lastMeas = measureGroup[measureGroup.length - 1]
        ctx.xCur = lastMeas.x() + lastMeas.width()
    }

    private static spaceSegments(segList: readonly Segment[], startSegIdx: number, ctx: HorizontalSpacingContext): SegmentPosition[] {
        const placedSegments: SegmentPosition[] = []

        for (let i = 0; i < segList.length; ++i) {
            const curSeg = segList[i]
            if (HorizontalSpacing.ignoreSegmentForSpacing(curSeg)) {
                placedSegments.push(segPos(curSeg, ctx.xCur, /*ignoreForSpacing*/ true))
                continue
            }

            if (i < startSegIdx) {
                // If we're only updating the spacing of the last added measure, segments before startSegIdx are not recomputed
                placedSegments.push(segPos(curSeg, curSeg.xPosInSystemCoords()))
                ctx.xCur = curSeg.xPosInSystemCoords() + curSeg.width()
                continue
            }

            curSeg.clearWidthOffset()

            if (placedSegments.length === 0 || HorizontalSpacing.ignoreAllSegmentsForSpacing(placedSegments)) {
                const xFirst = HorizontalSpacing.getFirstSegmentXPos(curSeg, ctx)
                ctx.xCur += xFirst
                placedSegments.push(segPos(curSeg, ctx.xCur))
            } else {
                HorizontalSpacing.spaceAgainstPreviousSegments(curSeg, placedSegments, ctx)
            }

            const leadingSpace = curSeg.extraLeadingSpace().val() * ctx.spatium
            placedSegments[placedSegments.length - 1].xPosInSystemCoords += leadingSpace

            if (curSeg.isChordRestType()) {
                const isFirstCROfSystem = curSeg.rtick().isZero() && curSeg.measure().isFirstInSystem()
                if (isFirstCROfSystem) {
                    const xMinSystemHeaderDist = ctx.system.leftMargin() + curSeg.style().styleMM(Sid.systemHeaderMinStartOfSystemDistance)
                    const last = placedSegments[placedSegments.length - 1]
                    last.xPosInSystemCoords = Math.max(last.xPosInSystemCoords, xMinSystemHeaderDist)
                    ctx.xCur = Math.max(ctx.xCur, xMinSystemHeaderDist)
                }
                let chordRestSegWidth = HorizontalSpacing.chordRestSegmentNaturalWidth(curSeg, ctx)
                const nextSeg = i < segList.length - 1 ? segList[i + 1] : null
                if (nextSeg) {
                    let nextSegLeadingSpace = nextSeg.extraLeadingSpace().val() * ctx.spatium
                    if (!RealIsNull(nextSegLeadingSpace)) {
                        nextSegLeadingSpace = Math.max(nextSegLeadingSpace, -chordRestSegWidth)
                        curSeg.addWidthOffset(nextSegLeadingSpace)
                    }
                    if (nextSeg.isChordRestType()) {
                        chordRestSegWidth = HorizontalSpacing.applyCrossBeamSpacingCorrection(curSeg, nextSeg, chordRestSegWidth)
                    }
                }
                ctx.xCur += chordRestSegWidth
            }
        }

        if (ctx.systemIsFull) {
            HorizontalSpacing.checkLyricsAgainstRightMargin(placedSegments, ctx)
            HorizontalSpacing.checkLargeTimeSigAgainstRightMargin(placedSegments)
        }

        return placedSegments
    }

    private static ignoreSegmentForSpacing(segment: Segment): boolean {
        return !segment.enabled() || !segment.isActive() || segment.allElementsInvisible()
    }

    private static ignoreAllSegmentsForSpacing(segmentPositions: readonly SegmentPosition[]): boolean {
        for (const sp of segmentPositions) {
            if (!sp.ignoreForSpacing) {
                return false
            }
        }
        return true
    }

    private static spaceAgainstPreviousSegments(segment: Segment, prevSegPositions: SegmentPosition[], ctx: HorizontalSpacingContext): void {
        let x = -Number.MAX_VALUE
        let prevCRSegmentsCount = 0

        if (segment.measure().isFirstInSystem()) {
            x = HorizontalSpacing.checkLyricsAgainstLeftMargin(segment, x, ctx)
        }

        const segmentHasTimeSigAboveStaff = segment.hasTimeSigAboveStaves()

        for (let i = prevSegPositions.length; i > 0; --i) {
            const prevSegPos = prevSegPositions[i - 1]
            if (prevSegPos.ignoreForSpacing) {
                continue
            }

            const prevSeg = prevSegPos.segment
            const xPrevSeg = prevSegPos.xPosInSystemCoords

            if (prevSeg.isChordRestType()) {
                ++prevCRSegmentsCount
            }

            const timeSigAboveBarlineCase = segmentHasTimeSigAboveStaff && prevSeg.isEndBarLineType() && prevSeg.tick().eq(segment.tick())
            const timeSigAboveKeySigCase = segmentHasTimeSigAboveStaff && prevSeg.isSegType(SegmentType.KeySig)
                                           && prevSeg.tick().eq(segment.tick())
            const timeSigAboveRepeatKeySigCase = segmentHasTimeSigAboveStaff && prevSeg.isSegType(SegmentType.KeySigRepeatAnnounce)
                                                 && prevSeg.tick().eq(segment.tick())

            if (timeSigAboveBarlineCase) {
                x = xPrevSeg + prevSeg.minRight() - 0.5 * prevSeg.style().styleMM(Sid.barWidth) // align to the preceding barline
            } else if (timeSigAboveKeySigCase) {
                x = xPrevSeg + segment.minLeft() // align to the preceding keySig
            } else if (timeSigAboveRepeatKeySigCase) {
                x = xPrevSeg + prevSeg.minRight()
            } else {
                let minHorDist = HorizontalSpacing.minHorizontalDistanceSegments(prevSeg, segment, ctx.squeezeFactor)
                minHorDist = Math.max(minHorDist, HorizontalSpacing.spaceLyricsAgainstBarlines(prevSeg, segment, ctx))
                const xNonCollision = xPrevSeg + minHorDist
                x = Math.max(x, xNonCollision)
            }

            if (x > ctx.xCur || timeSigAboveBarlineCase) {
                if (prevCRSegmentsCount > 0) {
                    const spaceIncrease = (x - ctx.xCur) / prevCRSegmentsCount
                    let xMovement = spaceIncrease
                    for (let j = i; j < prevSegPositions.length; ++j) {
                        const sp = prevSegPositions[j]
                        if (sp.ignoreForSpacing) {
                            continue
                        }
                        sp.xPosInSystemCoords += xMovement
                        if (sp.segment.isChordRestType()) {
                            xMovement += spaceIncrease
                        }
                    }
                }
                ctx.xCur = x
            }

            if (HorizontalSpacing.stopCheckingPreviousSegments(prevSegPos, segPos(segment, ctx.xCur))) {
                break
            }
        }

        const xSeg = segment.isRightAligned() ? x : ctx.xCur
        prevSegPositions.push(segPos(segment, xSeg))
    }

    private static stopCheckingPreviousSegments(prevSegPos: SegmentPosition, curSegPos: SegmentPosition): boolean {
        const prevSeg = prevSegPos.segment
        const curSeg = curSegPos.segment

        const prevSegEndTick = prevSeg.tick().plus(prevSeg.ticks())
        const curSegTick = curSeg.tick()
        if (prevSegEndTick.ge(curSegTick) || curSeg.hasTimeSigAboveStaves()) {
            return false
        }

        if (!curSeg.isChordRestType()) {
            return true
        }

        let curHasLyricsOrHarmony = false
        const curX = curSegPos.xPosInSystemCoords
        let curMinLeft = Number.MAX_VALUE
        for (const shape of curSeg.shapes()) {
            for (const shapeEl of shape.elements()) {
                curMinLeft = Math.min(curMinLeft, shapeEl.left())
                const item = shapeEl.item()
                if (item && (item.isLyrics() || item.isHarmony())) {
                    curHasLyricsOrHarmony = true
                }
            }
        }
        curMinLeft += curX

        let prevHasLyricsOrHarmony = false
        const prevX = prevSegPos.xPosInSystemCoords
        let prevMinRight = -Number.MAX_VALUE
        for (const shape of prevSeg.shapes()) {
            for (const shapeEl of shape.elements()) {
                prevMinRight = Math.max(prevMinRight, shapeEl.right())
                const item = shapeEl.item()
                if (item && (item.isLyrics() || item.isHarmony())) {
                    prevHasLyricsOrHarmony = true
                }
            }
        }
        prevMinRight += prevX

        if (curHasLyricsOrHarmony === prevHasLyricsOrHarmony && curMinLeft > prevMinRight) {
            return true
        }

        if (prevSeg.measure() !== curSeg.measure() && prevSeg.measure() !== curSeg.measure().prevMM()) {
            return true
        }

        return false
    }

    private static checkLyricsAgainstLeftMargin(segment: Segment, x: number, ctx: HorizontalSpacingContext): number {
        for (const staffShape of segment.shapes()) {
            for (const shapeEl of staffShape.elements()) {
                const item = shapeEl.item()
                if (item && item.isLyrics()) {
                    x = Math.max(x, ctx.xLeftBarrier - shapeEl.left())
                }
            }
        }
        return x
    }

    private static checkLyricsAgainstRightMargin(segPositions: SegmentPosition[], ctx: HorizontalSpacingContext): void {
        const lastPos = segPositions[segPositions.length - 1]
        const systemEdge = lastPos.xPosInSystemCoords + lastPos.segment.minRight()
        const style = ctx.system.style()
        const lyricsDashForce = style.styleB(Sid.lyricsDashForce)
        const lyricsMelismaForce = style.styleB(Sid.lyricsMelismaForce)
        const minSpaceForDash = lyricsDashForce ? style.styleMM(Sid.lyricsDashPad) + style.styleMM(Sid.lyricsDashMinLength)
                                + style.styleMM(Sid.lineEndToBarlineDistance) + lastPos.segment.minRight() : 0.0
        const minSpaceForMelisma = lyricsMelismaForce ? style.styleMM(Sid.lyricsMelismaPad) + style.styleMM(Sid.lyricsMelismaMinLength)
                                   + style.styleMM(Sid.lineEndToBarlineDistance) + lastPos.segment.minRight() : 0.0

        let chordRestSegmentsCount = 0
        for (let i = segPositions.length; i > 1; --i) {
            const sp = segPositions[i - 1]
            const x = sp.xPosInSystemCoords
            const seg = sp.segment
            if (!seg.measure().isLastInSystem()) {
                break
            }
            if (seg.isChordRestType()) {
                ++chordRestSegmentsCount
            } else {
                continue
            }
            let xMaxLyrics = x
            for (const shape of seg.shapes()) {
                for (const shapeEl of shape.elements()) {
                    const item = shapeEl.item()
                    if (item && item.isLyrics()) {
                        const lyrics = item as Lyrics
                        const separator = lyrics.separator() as LyricsLine | null
                        const hasMelisma = !!separator && separator.isEndMelisma()
                        const hasDash = lyrics.syllabic() === LyricsSyllabic.BEGIN || lyrics.syllabic() === LyricsSyllabic.MIDDLE
                        let rightEdge = x + shapeEl.right()
                        if (hasDash) {
                            rightEdge += minSpaceForDash
                        } else if (hasMelisma) {
                            rightEdge += minSpaceForMelisma
                        }
                        xMaxLyrics = Math.max(xMaxLyrics, rightEdge)
                    }
                }
            }
            if (xMaxLyrics > systemEdge) {
                const lyricsOvershoot = xMaxLyrics - systemEdge
                const spaceIncrease = lyricsOvershoot / chordRestSegmentsCount
                let xMovement = spaceIncrease
                for (let j = i; j < segPositions.length; ++j) {
                    const p = segPositions[j]
                    p.xPosInSystemCoords += xMovement
                    if (p.segment.isChordRestType()) {
                        xMovement += spaceIncrease
                    }
                }
            }
        }
    }

    private static spaceLyricsAgainstBarlines(firstSeg: Segment, secondSeg: Segment, ctx: HorizontalSpacingContext): number {
        if (!(firstSeg.isSegType(SegmentType.ChordRest) && secondSeg.isSegType(SegmentType.BarLineType))
            && !(firstSeg.isSegType(SegmentType.BarLineType) && secondSeg.isSegType(SegmentType.ChordRest))) {
            return 0.0
        }

        let w = 0.0
        const crSegIsBefore = firstSeg.isChordRestType()
        const crSegment = crSegIsBefore ? firstSeg : secondSeg
        const barlineSegment = crSegIsBefore ? secondSeg : firstSeg

        const nstaves = crSegment.score().nstaves()
        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            if (!ctx.system.staff(staffIdx)!.show()) {
                continue
            }
            const nextStaff = ctx.system.nextVisibleStaff(staffIdx)
            if (nextStaff === -1) {
                continue
            }
            const barline = barlineSegment.element(staff2track(staffIdx)) as BarLine | null
            if (!barline || !barline.spanStaff()) {
                continue
            }
            const barlineShape = barline.shape().translate(barline.pos())
            const startTrack = staff2track(staffIdx)
            const endTrack = staff2track(nextStaff) + VOICES
            for (let track = startTrack; track < endTrack; ++track) {
                const chordRest = crSegment.element(track) as ChordRest | null
                if (!chordRest) {
                    continue
                }
                for (const lyrics of chordRest.lyrics()) {
                    if (!(lyrics.avoidBarlines() && lyrics.visible() && lyrics.autoplace())) {
                        continue
                    }
                    const lyricsStaffIdx = lyrics.staffIdx()
                    if ((lyricsStaffIdx === staffIdx && lyrics.placeBelow()) || (lyricsStaffIdx === nextStaff && lyrics.placeAbove())) {
                        const lyricsShape = lyrics.shape().translate(lyrics.pos())
                        let minDist = crSegIsBefore ? lyricsShape.right() + barlineShape.left() : lyricsShape.left() + barlineShape.right()
                        const padding = 0.3 * lyrics.fontMetrics().xHeight()
                        minDist += padding
                        w = Math.max(w, minDist)
                    }
                }
            }
        }

        return w
    }

    private static checkLargeTimeSigAgainstRightMargin(segPositions: SegmentPosition[]): void {
        const cautionaryTSSegPos = segPositions[segPositions.length - 1]
        if (!cautionaryTSSegPos.segment.hasTimeSigAboveStaves()) {
            return
        }

        const style = cautionaryTSSegPos.segment.style()
        const timeSigVSMargin = style.styleB(Sid.timeSigCenterOnBarline)
            ? style.styleV(Sid.timeSigVSMarginCentered) as TimeSigVSMargin
            : style.styleV(Sid.timeSigVSMarginNonCentered) as TimeSigVSMargin

        if (timeSigVSMargin !== TimeSigVSMargin.RIGHT_ALIGN_TO_BARLINE) {
            return
        }

        let xMax = 0.0
        for (let i = segPositions.length - 1; i >= 0; --i) {
            const p = segPositions[i]
            if (p.segment.isSegType(SegmentType.EndBarLine | SegmentType.KeySigAnnounce)) {
                xMax = Math.max(xMax, p.xPosInSystemCoords + p.segment.minRight())
            }
        }

        if (RealIsNull(xMax)) {
            return
        }

        const curTSPos = cautionaryTSSegPos.xPosInSystemCoords
        const xMaxPos = xMax - cautionaryTSSegPos.segment.minRight()
        if (xMaxPos < curTSPos) {
            cautionaryTSSegPos.xPosInSystemCoords = xMaxPos
        }
    }

    private static moveRightAlignedSegments(placedSegments: SegmentPosition[], ctx: HorizontalSpacingContext): void {
        for (let i = 0; i < placedSegments.length; ++i) {
            const segment = placedSegments[i].segment
            if (!segment.isRightAligned()) {
                continue
            }
            let x = Number.MAX_VALUE
            for (let j = i + 1; j < placedSegments.length; ++j) {
                const sp = placedSegments[j]
                if (sp.ignoreForSpacing) {
                    continue
                }
                const followingSeg = sp.segment
                if (followingSeg.hasTimeSigAboveStaves()) {
                    continue
                }
                if (followingSeg.measure() !== segment.measure() && followingSeg.rtick().isNotZero()) {
                    break
                }
                const followingSegX = sp.xPosInSystemCoords
                const minDist = HorizontalSpacing.minHorizontalDistanceSegments(segment, followingSeg, ctx.squeezeFactor)
                if (followingSeg.isRightAligned() && RealIsNull(minDist)) {
                    continue
                }
                x = Math.min(x, followingSegX - minDist)
            }
            if (x !== Number.MAX_VALUE) {
                placedSegments[i].xPosInSystemCoords = x
                // NOTE: the C++ code assigns to a reference here, so placedSegments[i + 1] is overwritten
                const nextSegPos = placedSegments[i + 1]
                for (let j = i + 2; nextSegPos.ignoreForSpacing && j < placedSegments.length; ++j) {
                    Object.assign(nextSegPos, placedSegments[j])
                }
                const nextSegX = nextSegPos.xPosInSystemCoords
                const prevCRSeg = segment.prev(SegmentType.ChordRest)
                if (prevCRSeg) {
                    prevCRSeg.addWidthOffset(-nextSegX + x)
                }
            }
        }
    }

    private static checkCollisionsWithCrossStaffStems(thisSeg: Segment, nextSeg: Segment, staffIdx: staff_idx_t, curMinDist: number): number {
        const itemsToCheck: ChordRest[] = []

        for (const el of nextSeg.elist()) {
            if (el && el.vStaffIdx() === staffIdx) {
                const cr = el as ChordRest
                if (cr.beam() && cr.beam()!.cross()) {
                    itemsToCheck.push(cr)
                }
            }
        }

        for (const cr of itemsToCheck) {
            let potentialCollidingChord: Chord | null = null
            for (const beamElement of cr.beam()!.elements()) {
                if (beamElement.isChord() && beamElement.parent() === thisSeg) {
                    potentialCollidingChord = beamElement as Chord
                    break
                }
            }
            if (!potentialCollidingChord || potentialCollidingChord.up() !== cr.up() || !potentialCollidingChord.stem()) {
                return curMinDist
            }
            const checkStemCollision = (cr.up() && potentialCollidingChord.vStaffIdx() > cr.vStaffIdx())
                                       || (!cr.up() && potentialCollidingChord.vStaffIdx() < cr.vStaffIdx())
            if (!checkStemCollision) {
                return curMinDist
            }
            const stem = potentialCollidingChord.stem()!
            const prevStemShape = stem.shape().translated(stem.pos().plus(potentialCollidingChord.pos()))
            prevStemShape.adjust(0.0, -100000, 0.0, 100000)
            const staffShape = nextSeg.staffShape(staffIdx)
            const minDist = HorizontalSpacing.minHorizontalDistance(prevStemShape, staffShape, stem.spatium())
            curMinDist = Math.max(curMinDist, minDist)
        }
        return curMinDist
    }

    private static chordRestSegmentNaturalWidth(segment: Segment, ctx: HorizontalSpacingContext): number {
        const durationStretch = HorizontalSpacing.computeSegmentDurationStretch(segment, segment.prev(SegmentType.ChordRest))

        const measure = segment.measure()
        const userStretch = clamp(measure.userStretch(), 0.1, 10.0) // TODO: enforce via UI, not here
        const segTotalStretch = durationStretch * userStretch
        segment.setStretch(segTotalStretch)

        const DEFAULT_QUARTER_NOTE_SPACE = 3.5 // In units of spatium
        const defaultQuarterNoteSpace = measure.spatium() * DEFAULT_QUARTER_NOTE_SPACE
        return defaultQuarterNoteSpace * segTotalStretch * ctx.stretchReduction / ctx.spacingDensity
    }

    private static computeSegmentDurationStretch(curSeg: Segment, prevSeg: Segment | null): number {
        if (curSeg.isMMRestSegment()) {
            return HorizontalSpacing.durationStretchForMMRests(curSeg)
        }

        const segTicks = curSeg.ticks()
        const shortestCR = curSeg.shortestChordRest()
        const prevShortestCR = prevSeg ? prevSeg.shortestChordRest() : new Fraction(0, 1)

        const hasAdjacent = curSeg.isChordRestType() && shortestCR.eq(segTicks)
        const prevHasAdjacent = !!prevSeg && (prevSeg.isChordRestType() && prevShortestCR.eq(prevSeg.ticks()))

        let durStretch: number
        const style = curSeg.style()
        const slope = style.styleD(Sid.measureSpacing)
        if (hasAdjacent || curSeg.measure().isMMRest()) {
            durStretch = HorizontalSpacing.durationStretchForTicks(slope, segTicks)
        } else {
            if (prevSeg && !prevHasAdjacent && prevShortestCR.lt(shortestCR)) {
                durStretch = HorizontalSpacing.durationStretchForTicks(slope, prevShortestCR) * segTicks.div(prevShortestCR).toDouble()
            } else {
                durStretch = HorizontalSpacing.durationStretchForTicks(slope, shortestCR) * segTicks.div(shortestCR).toDouble()
            }
        }

        if (style.styleB(Sid.scaleRythmicSpacingForSmallNotes) && HorizontalSpacing.needsCueSizeSpacing(curSeg)) {
            durStretch *= curSeg.style().styleD(Sid.smallNoteMag)
        }

        return durStretch
    }

    private static durationStretchForMMRests(segment: Segment): number {
        const QUARTER = new Fraction(1, 4)
        const MIN_MMREST_COUNT = 2

        const style = segment.style()
        const measure = segment.measure()
        const timeSig = measure.timesig()
        const constantWidth = style.styleB(Sid.mmRestConstantWidth)
        const mmRestWidthIncrementCap = style.styleI(Sid.mmRestMaxWidthIncrease)

        const baseDuration = constantWidth ? QUARTER.times(style.styleI(Sid.mmRestReferenceWidth)) : timeSig
        const durationIncrement = constantWidth ? QUARTER : new Fraction(1, timeSig.denominator())

        let incrementCount = Math.max(measure.mmRestCount() - MIN_MMREST_COUNT, 0)
        incrementCount = Math.min(incrementCount, mmRestWidthIncrementCap)

        const resultDuration = baseDuration.plus(durationIncrement.times(incrementCount))

        return HorizontalSpacing.durationStretchForTicks(style.styleD(Sid.measureSpacing), resultDuration)
    }

    private static durationStretchForTicks(slope: number, ticks: Fraction): number {
        const REFERENCE_DURATION = new Fraction(1, 4)
        const durationRatio = ticks.div(REFERENCE_DURATION)
        return Math.pow(slope, Math.log2(durationRatio.toDouble()))
    }

    private static needsCueSizeSpacing(segment: Segment): boolean {
        if (!segment.isChordRestType()) {
            return false
        }

        let hasCueSizedCR = false
        for (const item of segment.elist()) {
            if (!item) {
                continue
            }
            const cr = item as ChordRest
            if (cr.isSmall()) {
                hasCueSizedCR = true
            } else if (cr.actualTicks().eq(segment.ticks())) {
                return false
            }
        }

        return hasCueSizedCR
    }

    /** returns the corrected width */
    private static applyCrossBeamSpacingCorrection(thisSeg: Segment, nextSeg: Segment, width: number): number {
        const crossBeamSpacing = HorizontalSpacing.computeCrossBeamSpacing(thisSeg, nextSeg)

        const score = thisSeg.score()
        const table = paddingTable(score)
        const style = score.style()

        const displacement = score.noteHeadWidth() - style.styleMM(Sid.stemWidth)

        if (crossBeamSpacing.upDown && crossBeamSpacing.canBeAdjusted) {
            thisSeg.addWidthOffset(displacement)
            width += displacement
        } else if (crossBeamSpacing.downUp && crossBeamSpacing.canBeAdjusted) {
            thisSeg.addWidthOffset(-displacement)
            width -= displacement
        }
        if (crossBeamSpacing.upDown) {
            if (crossBeamSpacing.hasOpposingBeamlets) {
                const minBeamletClearance = style.styleMM(Sid.beamMinLen) * 2.0 + table.at(ElementType.BEAM, ElementType.BEAM)
                width = Math.max(width, displacement + minBeamletClearance)
            } else {
                width = Math.max(width, 2 * displacement)
            }
        }

        if (crossBeamSpacing.preventCrossStaffKerning) {
            const padding = crossBeamSpacing.ensureMinStemDistance ? table.at(ElementType.STEM, ElementType.STEM)
                : style.styleMM(Sid.minNoteDistance)
            width = Math.max(width, score.noteHeadWidth() + padding)
        } else if (crossBeamSpacing.ensureMinStemDistance) {
            width = Math.max(width, table.at(ElementType.STEM, ElementType.STEM))
        }
        return width
    }

    private static minStemDistOnNonAdjacentCross(thisSeg: Segment, nextSeg: Segment): number {
        let dist = -Number.MAX_VALUE
        for (const item of nextSeg.elist()) {
            if (!item || !item.isChord()) {
                continue
            }
            const chord = item as Chord
            if (!chord.stem() || chord.up() || !(chord.beam() && chord.beam()!.cross())) {
                continue
            }
            const beamElements = chord.beam()!.elements()
            let prevChordOnBeam: Chord | null = null
            for (let i = 0; i < beamElements.length; ++i) {
                if (beamElements[i] === chord) {
                    if (i > 0) {
                        const prevChordRest = beamElements[i - 1]
                        prevChordOnBeam = prevChordRest.isChord() ? prevChordRest as Chord : null
                    }
                    break
                }
            }
            if (!prevChordOnBeam || prevChordOnBeam.parent() !== thisSeg || !prevChordOnBeam.up() || !prevChordOnBeam.stem()) {
                continue
            }
            let minStemDist = prevChordOnBeam.x() + prevChordOnBeam.stem()!.x() - (chord.x() + chord.stem()!.x())
            minStemDist += paddingTable(chord.score()).at(ElementType.STEM, ElementType.STEM)
            dist = Math.max(dist, minStemDist)
        }
        return dist
    }

    private static computeCrossBeamSpacing(thisSeg: Segment, nextSeg: Segment | null): CrossBeamSpacing {
        const crossBeamType: CrossBeamSpacing = {
            upDown: false, downUp: false, canBeAdjusted: true, hasOpposingBeamlets: false,
            preventCrossStaffKerning: false, ensureMinStemDistance: false,
        }

        if (!thisSeg.isChordRestType() || !nextSeg || !nextSeg.isChordRestType()) {
            return crossBeamType
        }

        let preventCrossStaffKerning = false
        let ensureMinStemDistance = false
        for (const e of thisSeg.elist()) {
            if (!e || !e.isChord() || !e.visible() || !e.staff()!.visible()) {
                continue
            }
            const thisChord = e as Chord
            const nextCR = nextSeg.element(thisChord.track()) as ChordRest | null
            const nextChord = nextCR && nextCR.isChord() ? nextCR as Chord : null
            if (!nextChord) {
                continue
            }
            const thisStaffMove = thisChord.staffMove()
            const nextStaffMove = nextChord.staffMove()
            if (thisStaffMove === nextStaffMove) {
                continue
            }
            preventCrossStaffKerning = thisStaffMove > nextStaffMove
            ensureMinStemDistance = (thisStaffMove > nextStaffMove && thisChord.up() && !nextChord.up())
                                    || (thisStaffMove < nextStaffMove && thisChord.up() === nextChord.up())
        }

        crossBeamType.preventCrossStaffKerning = preventCrossStaffKerning
        crossBeamType.ensureMinStemDistance = ensureMinStemDistance

        let upDown = false
        let downUp = false
        let canBeAdjusted = true
        let hasOpposingBeamlets = false

        // Spacing can be adjusted for cross-beam cases only if there aren't chords in other voices in this or next segment.
        for (const e of thisSeg.elist()) {
            if (!e || !e.isChordRest() || !e.staff()!.visible()) {
                continue
            }
            const thisCR = e as ChordRest
            if (!thisCR.visible() || thisCR.isFullMeasureRest() || (thisCR.isRest() && (thisCR as Rest).isGap())) {
                continue
            }
            const beam = thisCR.beam()
            if (!beam && thisCR.actualTicks().le(thisSeg.ticks())) {
                canBeAdjusted = false
            }
            if (!beam || (beam.elements().length === 2 && thisCR.up())) {
                continue
            }
            for (const ee of nextSeg.elist()) {
                if (!ee || !ee.isChordRest() || !ee.staff()!.visible()) {
                    continue
                }
                const nextCR = ee as ChordRest
                if (!nextCR.visible() || nextCR.isFullMeasureRest() || (thisCR.isRest() && (thisCR as Rest).isGap())) {
                    continue
                }
                if (!nextCR.beam()) {
                    canBeAdjusted = false
                    continue
                }
                if (nextCR.beam() !== beam) {
                    continue
                }
                if (thisCR.up() === nextCR.up()) {
                    return crossBeamType
                }
                if (thisCR.up() && !nextCR.up()) {
                    if (thisCR.beamlet() && nextCR.beamlet()) {
                        hasOpposingBeamlets = true
                    }
                    upDown = true
                }
                if (!thisCR.up() && nextCR.up()) {
                    downUp = true
                }
                if (upDown && downUp) {
                    return crossBeamType
                }
            }
        }
        crossBeamType.upDown = upDown
        crossBeamType.downUp = downUp
        crossBeamType.canBeAdjusted = canBeAdjusted
        crossBeamType.hasOpposingBeamlets = hasOpposingBeamlets

        return crossBeamType
    }

    private static computeMinMeasureWidth(m: Measure): number {
        const style = m.style()
        let minWidth = style.styleMM(Sid.minMeasureWidth)

        let maxSysWidth = m.system()!.width() - m.system()!.leftMargin()
        if (maxSysWidth <= 0) {
            // System width is not yet known. Use minWidth.
            maxSysWidth = minWidth
        }

        minWidth = Math.min(minWidth, maxSysWidth)

        if (m.ticks().lt(m.timesig())) {
            minWidth *= m.ticks().div(m.timesig()).toDouble()
        }

        const firstCRSegment = m.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))
        if (!firstCRSegment) {
            return minWidth
        }

        if (firstCRSegment === m.firstEnabled()) {
            return minWidth
        }

        let startPosition = firstCRSegment.x() - firstCRSegment.minLeft()
        if (firstCRSegment.hasAccidentals()) {
            startPosition -= style.styleMM(Sid.barAccidentalDistance)
        } else {
            startPosition -= style.styleMM(Sid.barNoteDistance)
        }

        minWidth += startPosition

        minWidth = Math.min(minWidth, maxSysWidth)

        return minWidth
    }

    private static enforceMinimumMeasureWidths(measureGroup: readonly Measure[]): void {
        for (let i = 0; i < measureGroup.length; ++i) {
            const measure = measureGroup[i]
            if (measure.isMMRest()) {
                continue // minimum mmRest width is already enforced during spacing
            }
            const minWidth = HorizontalSpacing.computeMinMeasureWidth(measure)
            const diff = minWidth - measure.width()
            if (diff > 0) {
                HorizontalSpacing.stretchMeasureToTargetWidth(measure, minWidth)
                for (let j = i + 1; j < measureGroup.length; ++j) {
                    measureGroup[j].mutldata().moveX(diff)
                }
            }
        }
    }

    private static stretchMeasureToTargetWidth(m: Measure, targetWidth: number): void {
        if (!(targetWidth > m.width())) {
            return
        }

        const springs: Spring[] = []
        for (let s = m.first(); s; s = s.next()) {
            if (s.isChordRestType() && s.visible() && s.enabled() && !s.allElementsInvisible()) {
                const springConst = 1 / s.stretch()
                const width = s.width() - s.widthOffset()
                const preTension = width * springConst
                springs.push({ springConst, width, preTension, segment: s })
            }
        }

        HorizontalSpacing.stretchSegmentsToWidth(springs, targetWidth - m.width())

        m.respaceSegments()
    }

    private static stretchSegmentsToWidth(springs: Spring[], width: number): void {
        if (springs.length === 0 || RealIsEqualOrLess(width, 0.0)) {
            return
        }

        // std::sort is not stable; ties keep the original order here
        springs.sort((a, b) => a.preTension - b.preTension)

        let inverseSpringConst = 0.0
        let force = 0.0

        let i = 0
        do {
            inverseSpringConst += 1 / springs[i].springConst
            width += springs[i].width
            force = width / inverseSpringConst
            ++i
        } while (i < springs.length && !(force < springs[i].preTension))

        for (const spring2 of springs) {
            if (force > spring2.preTension) {
                const newWidth = force / spring2.springConst
                spring2.segment.setWidth(newWidth + spring2.segment.widthOffset())
            }
        }
    }

    private static setPositionsAndWidths(segmentPositions: readonly SegmentPosition[]): void {
        const segmentsSize = segmentPositions.length
        for (let i = 0; i < segmentsSize; ++i) {
            const sp = segmentPositions[i]
            const curSeg = sp.segment
            const curX = sp.xPosInSystemCoords
            if (sp.ignoreForSpacing) {
                curSeg.setWidth(0.0)
                continue
            }

            let nextSeg = curSeg
            let nextX = curX
            for (let j = i + 1; j < segmentsSize; ++j) {
                const nextSegPos = segmentPositions[j]
                if (!nextSegPos.ignoreForSpacing) {
                    nextSeg = nextSegPos.segment
                    nextX = nextSegPos.xPosInSystemCoords
                    break
                }
            }

            const curSegMeasure = curSeg.measure()
            const nextSegMeasure = nextSeg.measure()

            const leadingNonCRException = ((nextSeg.isKeySigType() || nextSeg.isTimeSigType() || nextSeg.isClefType())
                                           && !curSeg.isSegType(SegmentType.BarLineType))
            const computeWidthByDifferenceFromNext = curSegMeasure === nextSegMeasure || nextSeg.isStartRepeatBarLineType()
                                                     || leadingNonCRException

            const segWidth = computeWidthByDifferenceFromNext ? nextX - curX : curSeg.minRight()
            curSeg.setWidth(segWidth)

            if (curSegMeasure !== nextSegMeasure) {
                curSegMeasure.setWidth(curX + segWidth - curSegMeasure.x())
                nextSegMeasure.mutldata().setPosX(curX + segWidth)
            }

            curSeg.setXPosInSystemCoords(curX)

            if (nextSeg === curSeg) {
                // This is the last segment
                let nextSegWidth: number
                if (nextSeg.hasTimeSigAboveStaves()) {
                    nextSegWidth = 0.0
                    if (nextSeg.makeSpaceForTimeSigAboveStaves()) {
                        nextSegWidth = nextSeg.minRight()
                    }
                    const prevSeg = segmentPositions[i - 1].segment
                    const xDiff = segmentPositions[i - 1].xPosInSystemCoords - curX
                    let minSpaceForPrevSeg = xDiff + prevSeg.minRight()
                    if (prevSeg.trailer()) {
                        minSpaceForPrevSeg += prevSeg.style().styleMM(Sid.systemTrailerRightMargin)
                    }
                    nextSegWidth = Math.max(nextSegWidth, minSpaceForPrevSeg)
                } else if (nextSeg.trailer()) {
                    nextSegWidth = nextSeg.minRight() + nextSeg.style().styleMM(Sid.systemTrailerRightMargin)
                } else {
                    nextSegWidth = nextSeg.minRight()
                }
                nextSeg.setWidth(nextSegWidth)
                nextSegMeasure.setWidth(nextX + nextSegWidth - nextSegMeasure.x())
                nextSeg.setXPosInSystemCoords(nextX)
            }
        }
    }

    private static getFirstSegmentXPos(segment: Segment, ctx: HorizontalSpacingContext): number {
        const style = segment.style()

        let x: number

        switch (segment.segmentType()) {
        case SegmentType.BeginBarLine:
            return 0.0
        case SegmentType.ChordRest: {
            const leftBarrier = new Shape(new RectF(0.0, -0.5 * Number.MAX_VALUE, 0.0, Number.MAX_VALUE))
            x = HorizontalSpacing.minLeft(segment, leftBarrier)
            x += style.styleMM(segment.hasAccidentals() ? Sid.barAccidentalDistance : Sid.barNoteDistance)
            x = Math.max(x, style.styleMM(Sid.systemHeaderMinStartOfSystemDistance))
            break
        }
        case SegmentType.Clef:
        case SegmentType.HeaderClef:
            x = style.styleMM(Sid.clefLeftMargin)
            break
        case SegmentType.KeySig:
            x = style.styleMM(Sid.keysigLeftMargin)
            break
        case SegmentType.TimeSig:
            x = style.styleMM(Sid.timesigLeftMargin)
            break
        default:
            x = 0.0
        }

        return x * ctx.squeezeFactor
    }

    // ---------------------------------------------------------
    //   minHorizontalDistance
    //    a is located right of this shape.
    //    Calculates the minimum horizontal distance between the two shapes
    //    so they don't touch.
    // ---------------------------------------------------------

    static minHorizontalDistance(f: Shape, s: Shape, spatium: number, squeezeFactor = 1.0): number {
        let dist = -Number.MAX_VALUE // min real
        const absoluteMinPadding = 0.1 * spatium * squeezeFactor
        for (const r2 of s.elements()) {
            if (r2.isNull()) {
                continue
            }
            const item2 = r2.item()
            const by1 = r2.top()
            const by2 = r2.bottom()
            for (const r1 of f.elements()) {
                if (r1.isNull()) {
                    continue
                }
                const item1 = r1.item()
                const ay1 = r1.top()
                const ay2 = r1.bottom()
                const verticalClearance = HorizontalSpacing.computeVerticalClearance(item1, item2, spatium) * squeezeFactor
                const intersection = intersects(ay1, ay2, by1, by2, verticalClearance)
                let padding = 0
                let kerningType = KerningType.NON_KERNING
                if (item1 && item2) {
                    padding = HorizontalSpacing.computePadding(item1, item2)
                    padding *= squeezeFactor
                    padding = Math.max(padding, absoluteMinPadding)
                    kerningType = HorizontalSpacing.computeKerning(item1, item2)
                }
                if (kerningType === KerningType.ALLOW_COLLISION) {
                    continue
                }
                if (kerningType === KerningType.NON_KERNING
                    || intersection
                    || (r1.width() === 0 || r2.width() === 0) // Temporary hack: shapes of zero-width are assumed to collide with everyghin
                    || (!item1 && item2 && item2.isLyrics())) {
                    dist = Math.max(dist, r1.right() - r2.left() + padding)
                    continue
                }
                switch (kerningType) {
                case KerningType.KERN_UNTIL_LEFT_EDGE:
                    dist = Math.max(dist, r1.left() - r2.left())
                    break
                case KerningType.KERN_UNTIL_CENTER:
                    dist = Math.max(dist, r1.left() + 0.5 * r1.width() - r2.left())
                    break
                case KerningType.KERN_UNTIL_RIGHT_EDGE:
                    dist = Math.max(dist, r1.right() - r2.left())
                    break
                default:
                    break
                }
            }
        }
        return dist
    }

    //! NOTE Temporary solution
    static shapeSpatium(s: Shape): number {
        for (const e of s.elements()) {
            const item = e.item()
            if (item) {
                return item.spatium()
            }
        }
        return 0.0
    }

    // ---------------------------------------------------------
    //   minHorizontalDistance
    //    calculate the minimum layout distance to Segment ns
    // ---------------------------------------------------------

    /** C++ minHorizontalDistance(const Segment*, const Segment*, double) */
    static minHorizontalDistanceSegments(f: Segment, ns: Segment, squeezeFactor: number): number {
        if (f.segmentType() & SegmentType.BarLineType) {
            if (ns.isStartRepeatBarLineType()) {
                if (f.isBeginBarLineType()) {
                    return 0.0
                }
                // Align the thin barline of the start repeat to the previous barline
                const prevBarlineWidth = f.minRight()
                const thickBarlineWidth = f.style().styleMM(Sid.endBarWidth)
                return Math.max(prevBarlineWidth - thickBarlineWidth, 0.0)
            }
            if (ns.isMMRestSegment()) {
                return f.minRight() + f.style().styleMM(Sid.barNoteDistance)
            }
        }

        if (f.isHeaderClefType() && ns.hasTimeSigAboveStaves()) {
            const possibleKeySig = f.nextActive()
            if (possibleKeySig && possibleKeySig.isKeySigType() && !HorizontalSpacing.ignoreSegmentForSpacing(possibleKeySig)) {
                return 0.0
            }
            return f.minRight() + ns.minLeft() + f.style().styleMM(Sid.headerToLineStartDistance)
        }

        const systemHeaderGap = HorizontalSpacing.needsHeaderSpacingExceptions(f, ns)

        let ww = -Number.MAX_VALUE // can remain negative
        let d: number
        const score = f.score()
        for (let staffIdx = 0; staffIdx < f.shapes().length; ++staffIdx) {
            if (score.staff(staffIdx) && !score.staff(staffIdx)!.show()) {
                continue
            }
            const fshape = f.staffShape(staffIdx)
            const sp = HorizontalSpacing.shapeSpatium(fshape)
            d = HorizontalSpacing.minHorizontalDistance(fshape, ns.staffShape(staffIdx), sp, squeezeFactor)
            // first chordrest of a staff should clear the widest header for any staff
            // so make sure segment is as wide as it needs to be
            if (systemHeaderGap) {
                d = Math.max(d, f.staffShape(staffIdx).right())
            }
            if (f.isChordRestType() && ns.isChordRestType()) {
                d = HorizontalSpacing.checkCollisionsWithCrossStaffStems(f, ns, staffIdx, d)
            }
            ww = Math.max(ww, d)
        }
        let w = Math.max(ww, 0.0) // non-negative

        // Header exceptions that need additional space (more than the padding)
        const absoluteMinHeaderDist = 1.5 * f.spatium() * squeezeFactor
        if (systemHeaderGap) {
            if (f.isTimeSigType()) {
                const timeSigHeaderDist = squeezeFactor * f.style().styleMM(Sid.systemHeaderTimeSigDistance)
                w = Math.max(w, f.minRight() + timeSigHeaderDist)
            } else {
                const headerDist = squeezeFactor * f.style().styleMM(Sid.systemHeaderDistance)
                w = Math.max(w, f.minRight() + headerDist)
            }
            if (ns && ns.isStartRepeatBarLineType()) {
                // Align the thin barline of the start repeat to the header
                w -= f.style().styleMM(Sid.endBarWidth) + f.style().styleMM(Sid.endBarDistance)
            }
            const diff = w - f.minRight() - ns.minLeft()
            if (diff < absoluteMinHeaderDist) {
                w += absoluteMinHeaderDist - diff
            }
        }

        // Multimeasure rest exceptions that need special handling
        if (f.measure() && f.measure().isMMRest()) {
            if (ns.isChordRestType()) {
                let minDist = f.minRight()
                const table = paddingTable(f.score())
                if (f.isClefType()) {
                    minDist += table.at(ElementType.CLEF, ElementType.REST)
                } else if (f.isKeySigType()) {
                    minDist += table.at(ElementType.KEYSIG, ElementType.REST)
                } else if (f.isTimeSigType()) {
                    minDist += table.at(ElementType.TIMESIG, ElementType.REST)
                }
                w = Math.max(w, minDist)
            } else if (f.isChordRestType()) {
                let minWidth = f.style().styleMM(Sid.minMMRestWidth)
                if (!f.style().styleB(Sid.oldStyleMultiMeasureRests)) {
                    minWidth += f.style().styleMM(Sid.multiMeasureRestMargin)
                }
                w = Math.max(w, minWidth)
            }
        }

        // Allocate space to ensure minimum length of "dangling" ties or gliss at start of system
        if (f.isChordRestType() === ns.isChordRestType()) {
            w = Math.max(w, HorizontalSpacing.minStemDistOnNonAdjacentCross(f, ns))
            return w
        }

        const repeatSeg = f.isStartRepeatBarLineType() || ns.isStartRepeatBarLineType()
        const endOfSystem = f.isChordRestType() && !(ns.isChordRestType() || ns.isStartRepeatBarLineType())
                            && (f.measure().isLastInSystem() || f.measure().next()!.isHBox())
        const systemEnd = repeatSeg || endOfSystem

        w = HorizontalSpacing.computeHangingLineWidth(f, ns, w, systemHeaderGap, systemEnd)

        return w
    }

    private static needsHeaderSpacingExceptions(seg: Segment, nextSeg: Segment): boolean {
        return HEADER_SEGMENT_TYPES.has(seg.segmentType())
               && seg.rtick().isZero() && !seg.hasTimeSigAboveStaves()
               && (nextSeg.measure().isFirstInSystem() || nextSeg.measure().prev()!.isHBox())
               && (nextSeg.isStartRepeatBarLineType() || nextSeg.isChordRestType())
    }

    // ---------------------------------------------------------
    //   minLeft
    //    Calculate minimum distance needed to the left shape
    //    sl. Sl is the same for all staves.
    // ---------------------------------------------------------

    static minLeft(seg: Segment, ls: Shape): number {
        let distance = 0.0
        const sp = HorizontalSpacing.shapeSpatium(ls)
        for (const sh of seg.shapes()) {
            const d = HorizontalSpacing.minHorizontalDistance(ls, sh, sp, 1.0)
            if (d > distance) {
                distance = d
            }
        }
        return distance
    }

    static computePadding(item1: EngravingItem, item2: EngravingItem): number {
        if (item1.isParenthesis() || item2.isParenthesis()) {
            return ParenthesisLayout.computeParenthesisPadding(item1, item2)
        }
        const table = paddingTable(item1.score())
        const type1 = item1.type()
        const type2 = item2.type()

        let padding = table.at(type1, type2)
        const scaling = (item1.mag() + item2.mag()) / 2

        if (type1 === ElementType.NOTE && HorizontalSpacing.isSpecialNotePaddingType(type2)) {
            padding = HorizontalSpacing.computeNotePadding(item1 as Note, item2, padding, scaling)
        } else if (type1 === ElementType.LYRICS && HorizontalSpacing.isSpecialLyricsPaddingType(type2)) {
            padding = HorizontalSpacing.computeLyricsPadding(item1 as Lyrics, item2, padding)
        } else if (type2 === ElementType.CHORD_BRACKET) {
            padding = HorizontalSpacing.computeChordBracketPadding(item1, item2 as ChordBracket, padding)
        } else {
            padding *= scaling
        }

        if (!item1.isLedgerLine() && item2.isRest()) {
            padding = HorizontalSpacing.computeLedgerRestPadding(item2 as Rest, padding)
        }

        return padding
    }

    static computeChordBracketPadding(item1: EngravingItem, chordBracket: ChordBracket, padding: number): number {
        const chord = chordBracket.chord()
        if (chord && chord === item1.findAncestor(ElementType.CHORD)) {
            // Padding a right-handed chord bracket to its own chord: use the same padding values as the left-handed case
            return paddingTable(item1.score()).at(ElementType.CHORD_BRACKET, item1.type())
        }
        return padding
    }

    private static isSpecialNotePaddingType(type: ElementType): boolean {
        switch (type) {
        case ElementType.NOTE:
        case ElementType.REST:
        case ElementType.STEM:
            return true
        default:
            return false
        }
    }

    private static computeNotePadding(note: Note, item2: EngravingItem, padding: number, scaling: number): number {
        const style = note.style()

        const sameVoiceNoteOrStem = (item2.isNote() || item2.isStem()) && note.track() === item2.track()
        const areAdjacentByDuration = note.rtick().plus(note.chord().actualTicks()).eq(item2.rtick())
        if (sameVoiceNoteOrStem || areAdjacentByDuration) {
            const intersection = note.shape().translate(note.pos()).intersects(item2.shape().translate(item2.pos()))
            if (intersection) {
                padding = Math.max(padding, style.styleMM(Sid.minNoteDistance))
            }
        }

        padding *= scaling

        if (!(item2.isNote() || item2.isRest())) {
            return padding
        }

        if (note.isGrace() && item2.isNote() && (item2 as Note).isGrace()) {
            // Grace-to-grace
            padding = Math.max(padding, style.styleMM(Sid.graceToGraceNoteDist))
        } else if (note.isGrace() && (item2.isRest() || (item2.isNote() && !(item2 as Note).isGrace()))) {
            // Grace-to-main
            padding = Math.max(padding, style.styleMM(Sid.graceToMainNoteDist))
        } else if (!note.isGrace() && item2.isNote() && (item2 as Note).isGrace()) {
            // Main-to-grace
            padding = Math.max(padding, style.styleMM(Sid.graceToMainNoteDist))
        }

        if (note.fretString().length && item2.isNote()) { // This is a TAB fret mark
            const tabFretPaddingIncrease = 1.5 // TODO: style?
            padding *= tabFretPaddingIncrease
        }

        if (!item2.isNote()) {
            return padding
        }

        const note2 = item2 as Note
        if (note.lineAttachPoints().length === 0 || note2.lineAttachPoints().length === 0) {
            return padding
        }

        // Allocate space for minTieLength and minGlissandoLength
        for (const laPoint1 of note.lineAttachPoints()) {
            if (!laPoint1.line().addToSkyline()) {
                continue
            }
            for (const laPoint2 of note2.lineAttachPoints()) {
                if (laPoint1.line() !== laPoint2.line()) {
                    continue
                }
                let minEndPointsDistance = 0.0
                if (laPoint1.line().isTie()) {
                    minEndPointsDistance = style.styleMM(Sid.minTieLength)
                } else if (laPoint1.line().isGlissando()) {
                    const straight = (laPoint1.line() as Glissando).glissandoType() === GlissandoType.STRAIGHT
                    const minGlissandoLength = straight
                        ? style.styleMM(Sid.minStraightGlissandoLength)
                        : style.styleMM(Sid.minWigglyGlissandoLength)
                    minEndPointsDistance = minGlissandoLength
                } else if (laPoint1.line().isGuitarBend()) {
                    minEndPointsDistance = 2 * note.spatium() // TODO: style
                } else if (laPoint1.line().isNoteLine()) {
                    minEndPointsDistance = style.styleMM(Sid.minStraightGlissandoLength)
                }
                let lapPadding = (laPoint1.pos().x() - note.width()) + minEndPointsDistance - laPoint2.pos().x()
                lapPadding *= scaling
                padding = Math.max(padding, lapPadding)
            }
        }
        return padding
    }

    private static computeLedgerRestPadding(rest2: Rest, padding: number): number {
        const restSym = rest2.ldata().sym
        switch (restSym) {
        case SymId.restWholeLegerLine:
        case SymId.restDoubleWholeLegerLine:
        case SymId.restHalfLegerLine:
            return padding + rest2.ldata().bbox().left()
        default:
            return padding
        }
    }

    private static isSpecialLyricsPaddingType(type: ElementType): boolean {
        switch (type) {
        case ElementType.NOTE:
        case ElementType.REST:
        case ElementType.LYRICS:
            return true
        default:
            return false
        }
    }

    private static computeLyricsPadding(lyrics1: Lyrics, item2: EngravingItem, padding: number): number {
        const style = lyrics1.style()

        const separator = lyrics1.separator() as LyricsLine | null
        const leaveSpaceForMelisma = !!separator && separator.isEndMelisma() && style.styleB(Sid.lyricsMelismaForce)
        if (leaveSpaceForMelisma) {
            const spaceForMelisma = style.styleMM(Sid.lyricsMelismaMinLength) + 2 * style.styleMM(Sid.lyricsMelismaPad)
            return Math.max(padding, spaceForMelisma)
        }

        if (item2.isLyrics()) {
            const syllabicType = lyrics1.syllabic()
            const leaveSpaceForDash = (syllabicType === LyricsSyllabic.BEGIN || syllabicType === LyricsSyllabic.MIDDLE)
                                      && style.styleB(Sid.lyricsDashForce)
            if (leaveSpaceForDash) {
                const spaceForDash = style.styleMM(Sid.lyricsDashMinLength) + 2 * style.styleMM(Sid.lyricsDashPad)
                padding = Math.max(padding, spaceForDash)
            }
        }
        return padding
    }

    static computeKerning(item1: EngravingItem, item2: EngravingItem): KerningType {
        if (item1.isArticulationOrFermata() || item2.isArticulationOrFermata()) {
            return HorizontalSpacing.computeArticulationAndFermataKerning(item1, item2)
        }

        if (HorizontalSpacing.ignoreItems(item1, item2)) {
            return KerningType.ALLOW_COLLISION
        }

        if (HorizontalSpacing.isSameVoiceKerningLimited(item1) && HorizontalSpacing.isSameVoiceKerningLimited(item2)
            && item1.track() === item2.track()) {
            return KerningType.NON_KERNING
        }

        if ((HorizontalSpacing.isNeverKernable(item1) || HorizontalSpacing.isNeverKernable(item2))
            && !(HorizontalSpacing.isAlwaysKernable(item1) || HorizontalSpacing.isAlwaysKernable(item2))) {
            return KerningType.NON_KERNING
        }

        return HorizontalSpacing.doComputeKerningType(item1, item2)
    }

    static computeVerticalClearance(item1: EngravingItem | null, item2: EngravingItem | null, spatium: number): number {
        if (item2 && item2.isAccidental()) {
            return 0.1 * spatium
        } else if ((item1 && item1.isParenthesis()) || (item2 && item2.isParenthesis())) {
            return 0.1 * spatium
        }
        return 0.2 * spatium
    }

    private static isSameVoiceKerningLimited(item: EngravingItem): boolean {
        switch (item.type()) {
        case ElementType.NOTE:
        case ElementType.NOTEDOT:
        case ElementType.REST:
        case ElementType.STEM:
        case ElementType.CHORDLINE:
        case ElementType.BREATH:
            return true
        default:
            return false
        }
    }

    private static isNeverKernable(item: EngravingItem): boolean {
        switch (item.type()) {
        case ElementType.CLEF:
            if ((item as Clef).isMidMeasureClef()) {
                return false
            }
            return true // fallthrough in C++
        case ElementType.KEYSIG:
        case ElementType.BAR_LINE:
            return true
        case ElementType.TIMESIG:
            return !(item as TimeSig).isAboveStaves()
        default:
            return false
        }
    }

    private static isAlwaysKernable(item: EngravingItem): boolean {
        return item.isTextBase() || item.isChordLine() || item.isParenthesis() || item.isFretDiagram()
    }

    private static ignoreItems(item1: EngravingItem, item2: EngravingItem): boolean {
        if (item1.isRest() && (item1 as Rest).isFullMeasureRest()) {
            return item1.staffIdx() !== item2.staffIdx()
        }
        return false
    }

    private static doComputeKerningType(item1: EngravingItem, item2: EngravingItem): KerningType {
        switch (item1.type()) {
        case ElementType.BAR_LINE:
            return item2.isLyrics() || item2.isHarmony() || item2.isFretDiagram() ? KerningType.ALLOW_COLLISION : KerningType.NON_KERNING
        case ElementType.CHORDLINE:
            return item2.isBarLine() ? KerningType.ALLOW_COLLISION : KerningType.KERNING
        case ElementType.HARMONY:
        case ElementType.FRET_DIAGRAM:
            return item2.isHarmony() || item2.isFretDiagram() ? KerningType.NON_KERNING : KerningType.KERNING
        case ElementType.LYRICS:
            return HorizontalSpacing.computeLyricsKerningType(item1 as Lyrics, item2)
        case ElementType.NOTE:
            return HorizontalSpacing.computeNoteKerningType(item1 as Note, item2)
        case ElementType.CLEF:
            return item2.isNote() ? KerningType.KERN_UNTIL_RIGHT_EDGE : KerningType.KERNING
        case ElementType.STEM_SLASH:
            return HorizontalSpacing.computeStemSlashKerningType(item1 as StemSlash, item2)
        case ElementType.PARENTHESIS:
            return item2.isBarLine() ? KerningType.NON_KERNING : KerningType.KERNING
        case ElementType.GUITAR_BEND_SEGMENT:
            return item2.isNote() || item2.isRest() ? KerningType.NON_KERNING : KerningType.KERNING
        default:
            return KerningType.KERNING
        }
    }

    private static computeNoteKerningType(note: Note, item2: EngravingItem): KerningType {
        if (item2.isClef()) {
            return KerningType.KERN_UNTIL_RIGHT_EDGE
        }

        const nextParent = item2.parentItem(true)
        if (nextParent && nextParent.isNote() && (nextParent as Note).isTrillCueNote()) {
            return KerningType.NON_KERNING
        }

        const c = note.chord()
        if (!c) {
            return KerningType.KERNING
        }

        if (item2.isLyrics() && c.isMelismaEnd()) {
            const melismaEndNote = c.up() ? c.downNote() : c.upNote()
            return note === melismaEndNote ? KerningType.NON_KERNING : KerningType.KERNING
        }

        if (c.allowKerningAbove() && c.allowKerningBelow()) {
            return KerningType.KERNING
        }
        if (c.up() && note.ldata().pos().x() > 0) {
            return KerningType.KERNING
        }
        const kerningAbove = item2.canvasPos().y() < note.canvasPos().y()
        if (kerningAbove && !c.allowKerningAbove()) {
            return KerningType.NON_KERNING
        }
        if (!kerningAbove && !c.allowKerningBelow()) {
            return KerningType.NON_KERNING
        }

        return KerningType.KERNING
    }

    private static computeStemSlashKerningType(stemSlash: StemSlash, item2: EngravingItem): KerningType {
        const chord = stemSlash.chord()
        if (!chord || !chord.beam() || !item2.parentItem()) {
            return KerningType.KERNING
        }

        const nextParent = item2.parentItem()!
        let nextChord: Chord | null = null
        if (nextParent.isChord()) {
            nextChord = nextParent as Chord
        } else if (nextParent.isNote()) {
            nextChord = nextParent.parentItem() as Chord
        }
        if (!nextChord) {
            return KerningType.KERNING
        }

        if (nextChord.beam() && nextChord.beam() === chord.beam()) {
            // Stem slash is allowed to collide with items from the same grace notes group
            return KerningType.ALLOW_COLLISION
        }

        return KerningType.KERNING
    }

    private static computeLyricsKerningType(lyrics1: Lyrics, item2: EngravingItem): KerningType {
        if (item2.isLyrics()) {
            const lyrics2 = item2 as Lyrics
            if (lyrics1.verse() === lyrics2.verse()) {
                return KerningType.NON_KERNING
            }
        }

        if ((item2.isNote() || item2.isRest()) && lyrics1.style().styleB(Sid.lyricsMelismaForce)) {
            const melismaLine = lyrics1.separator() as LyricsLine | null
            if (melismaLine && melismaLine.isEndMelisma() && item2.tick().ge(melismaLine.tick2())) {
                return KerningType.NON_KERNING
            }
        }

        return KerningType.ALLOW_COLLISION
    }

    private static computeArticulationAndFermataKerning(item1: EngravingItem, item2: EngravingItem): KerningType {
        if (item1.isArticulationOrFermata()) {
            if (item2.isArticulationOrFermata()) {
                const firstAbove = item1.isArticulationFamily() ? (item1 as Articulation).up() : item1.placeAbove()
                const secondAbove = item2.isArticulationFamily() ? (item2 as Articulation).up() : item2.placeAbove()
                if (firstAbove === secondAbove) {
                    return KerningType.NON_KERNING
                }
            }
        }

        return KerningType.KERNING
    }

    /** returns the new width */
    private static computeHangingLineWidth(firstSeg: Segment, nextSeg: Segment, width: number, systemHeaderGap: boolean,
                                           systemEnd: boolean): number {
        const style = firstSeg.style()
        const crSeg = firstSeg.isChordRestType() ? firstSeg : nextSeg
        const otherSeg = firstSeg.isChordRestType() ? nextSeg : firstSeg
        const incoming = !firstSeg.isChordRestType()
        const crMeasure = crSeg.measure()
        const ntracks = crSeg.score().ntracks()
        const tieLengths: number[] = []

        for (let track = 0; track < ntracks; track++) {
            const cr = incoming ? crMeasure.firstChordRest(track) : crMeasure.lastChordRest(track)
            if (!cr || !cr.isChord() || cr.segment() !== crSeg) {
                continue
            }
            const headerLineMargin = systemHeaderGap ? otherSeg.style().styleMM(Sid.headerToLineStartDistance)
                : otherSeg.style().styleMM(Sid.repeatBarlineDotSeparation)
            const endSystemMargin = style.styleMM(Sid.lineEndToBarlineDistance)
            for (const note of (cr as Chord).notes()) {
                const lineBack = note.spannerBack().length > 0 || (!!note.tieBack() && !note.tieBack()!.segmentsEmpty())
                const lineFor = note.spannerFor().length > 0 || (!!note.tieFor() && !note.tieFor()!.segmentsEmpty())
                if (!(lineBack || lineFor) || note.lineAttachPoints().length === 0) {
                    continue
                }
                for (const lap of note.lineAttachPoints()) {
                    if (lap.start() === incoming) {
                        continue
                    }
                    const attachedLine = lap.line() as Spanner
                    if (!attachedLine.addToSkyline()) {
                        continue
                    }
                    if (!(systemEnd || systemHeaderGap) && !attachedLine.isPartialTie()) {
                        continue
                    }
                    let minLength = 0.0
                    if (attachedLine.isGlissando()) {
                        const straight = (attachedLine as Glissando).glissandoType() === GlissandoType.STRAIGHT
                        minLength = straight ? style.styleMM(Sid.minStraightGlissandoLength)
                            : style.styleMM(Sid.minWigglyGlissandoLength)
                    } else if (attachedLine.isNoteLine()) {
                        minLength = style.styleMM(Sid.minStraightGlissandoLength)
                    }
                    const notePosX = note.pos().x() + cr.pos().x()
                    const lineNoteEndPos = (incoming ? width : 0.0) + notePosX + lap.pos().x()
                    const lineSegEndPos = incoming ? otherSeg.minRight() + headerLineMargin : width + otherSeg.minLeft() - endSystemMargin
                    const lineStartPointX = incoming ? lineSegEndPos : lineNoteEndPos
                    const lineEndPointX = incoming ? lineNoteEndPos : lineSegEndPos
                    const lineLength = lineEndPointX - lineStartPointX
                    if (attachedLine.isTie()) {
                        tieLengths.push(lineLength)
                        continue
                    }
                    if (lineLength < minLength) {
                        width += minLength - lineLength
                    }
                }
            }
        }

        if (tieLengths.length === 0) {
            return width
        }

        const maxLength = Math.max(...tieLengths)
        const oldWidth = width
        for (let tieLength of tieLengths) {
            tieLength += width - oldWidth
            const minLength = RealIsEqual(tieLength, maxLength) ? style.styleMM(Sid.minHangingTieLength) : style.styleMM(Sid.minTieLength)
            if (tieLength < minLength) {
                width += minLength - tieLength
            }
        }
        return width
    }
}
