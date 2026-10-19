/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/beamtremololayout.h/.cpp
 * (C++ ints passed by reference are emulated with a {dictator, pointer} object)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsEqualOrLess, RealIsEqualOrMore, stdRound } from '../../../framework/global/realfn'
import { ElementType, type staff_idx_t } from '../../types/types'
import { ShapeElement } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { BeamType, ChordBeamAnchorType, CrossStaffBeamPosition, NotePosition, type BeamBase, type BeamBaseLayoutData }
    from '../../dom/beambase'
import type { Beam } from '../../dom/beam'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { LayoutConfiguration, LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'
import { StemLayout } from './stemlayout'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'

/** ldata.trem with chord1/chord2 set (C++ dereferences them without checks) */
interface TremoloWithChords {
    chord1(): Chord
    chord2(): Chord
    lines(): number
    up(): boolean
    setUp(v: boolean): void
    pagePos(): PointF
}

const trem = (ldata: BeamBaseLayoutData): TremoloWithChords => ldata.trem as TremoloTwoChord as TremoloWithChords

enum SlopeConstraint {
    NO_CONSTRAINT,
    FLAT,
    SMALL_SLOPE,
}

interface BeamPos {
    dictator: number
    pointer: number
}

const _maxSlopes = [0, 1, 2, 3, 4, 5, 6, 7]

const npMin = (a: NotePosition, b: NotePosition): NotePosition => (b.lt(a) ? b : a)
const npMax = (a: NotePosition, b: NotePosition): NotePosition => (a.lt(b) ? b : a)

export class BeamTremoloLayout {
    static setupLData(item: BeamBase, ldata: BeamBaseLayoutData, ctx: LayoutContext): void {
        let isGrace = false
        if (item.isBeam()) {
            ldata.beamType = BeamType.BEAM
            ldata.beam = item as Beam
            ldata.up = ldata.beam.up()
            ldata.trem = null // there can be many different trems in a beam, they will all be checked
            isGrace = ldata.beam.elements()[0].isGrace()
        } else {
            ldata.trem = item
            ldata.beamType = BeamType.TREMOLO
            const t = trem(ldata)
            const b1 = t.chord1().beam()
            if (b1 && b1 === t.chord2().beam()) {
                ldata.beam = b1
            } else {
                ldata.beam = null
            }
            ldata.up = BeamTremoloLayout.computeTremoloUp(ldata)
            t.setUp(ldata.up)
            isGrace = t.chord1().isGrace()
        }
        ldata.spatium = item.spatium()
        ldata.tick = item.tick()
        ldata.beamSpacing = ctx.conf().styleB(Sid.useWideBeams) ? 4 : 3
        ldata.beamDist = (ldata.beamSpacing / 4.0) * ldata.spatium * ldata.mag() * (isGrace ? ctx.conf().styleD(Sid.graceNoteMag) : 1.0)
        ldata.beamWidth = (ctx.conf().styleS(Sid.beamWidth).val() * ldata.spatium) * ldata.mag()
        const staffType = item.staffType()
        ldata.tab = (staffType && staffType.isTabStaff()) ? staffType : null
        ldata.isBesideTabStaff = !!ldata.tab && !ldata.tab.stemless() && !ldata.tab.stemThrough()
    }

    static minStemLength(cr: ChordRest, ldata: BeamBaseLayoutData): number {
        const minStemLengths = [11, 13, 15, 18, 21, 24, 27, 30]
        const beams = BeamTremoloLayout.strokeCount(ldata, cr)
        if (beams > minStemLengths.length) {
            return minStemLengths[minStemLengths.length - 1]
        }
        return minStemLengths[Math.max(beams - 1, 0)]
    }

    private static offsetBeamToRemoveCollisions(item: BeamBase, ldata: BeamBaseLayoutData, chordRests: readonly ChordRest[], bp: BeamPos,
                                                startX: number, endX: number, isFlat: boolean, isStartDictator: boolean): void {
        if (endX === startX) {
            return
        }

        // tolerance eliminates all possibilities of floating point rounding errors
        const tolerance = ldata.beamWidth * 0.25 * (ldata.up ? -1 : 1)
        const isSmall = ldata.isGrace || ldata.mag() < 1.0

        let startY = (isStartDictator ? bp.dictator : bp.pointer) * ldata.spatium / 4 + tolerance
        let endY = (isStartDictator ? bp.pointer : bp.dictator) * ldata.spatium / 4 + tolerance

        const firstChordRest = chordRests[0]
        const lastChordRest = chordRests[chordRests.length - 1]
        let curChordRest = 0
        for (const chordRest of chordRests) {
            if (!chordRest.isChord() || chordRest === ldata.elements[ldata.elements.length - 1] || chordRest === ldata.elements[0]) {
                curChordRest++
                continue
            }

            // Beam clearance is reduced by 0.25sp if the inner chord is on the same line as the outer chord
            let sameLineException = 0
            if (chordRest.isChord()
                && ((curChordRest === 1 && firstChordRest.isChord())
                    || (curChordRest === chordRests.length - 2 && lastChordRest.isChord()))) {
                const innerChord = chordRest as Chord
                const outerChord = (curChordRest === 1 && firstChordRest.isChord() ? firstChordRest : lastChordRest) as Chord
                const innerLine = ldata.up ? innerChord.upNote().line() : innerChord.downNote().line()
                const outerLine = ldata.up ? outerChord.upNote().line() : outerChord.downNote().line()
                if (innerLine === outerLine) {
                    sameLineException = 1
                } else if (chordRests.length === 3) {
                    const otherOuterCR = outerChord === firstChordRest ? lastChordRest : firstChordRest
                    const otherOuterChord = otherOuterCR.isChord() ? otherOuterCR as Chord : null
                    if (!otherOuterChord) {
                        continue
                    }
                    const otherOuterLine = ldata.up ? otherOuterChord.upNote().line() : otherOuterChord.downNote().line()
                    if (innerLine === otherOuterLine) {
                        sameLineException = 1
                    }
                }
            }

            const anchor = BeamTremoloLayout.chordBeamAnchor(ldata, chordRest, ChordBeamAnchorType.Middle).minus(item.pagePos())

            const minLen = BeamTremoloLayout.minStemLength(chordRest, ldata) - sameLineException

            if (!RealIsEqual(endX, startX)) {
                const proportionAlongX = (anchor.x() - startX) / (endX - startX)

                for (;;) {
                    const slope = Math.abs(bp.dictator - bp.pointer)
                    let reduction = 0.0
                    if (!isFlat) {
                        if (slope <= 3) {
                            reduction = 0.25 * ldata.spatium
                        } else if (slope <= 6) {
                            reduction = 0.5 * ldata.spatium
                        } else { // slope > 6
                            reduction = 0.75 * ldata.spatium
                        }
                    }

                    const desiredY = proportionAlongX * (endY - startY) + startY // start note stem len + extra for slope
                    const beamClearsAnchor = (ldata.up && RealIsEqualOrLess(desiredY, anchor.y() + reduction))
                                             || (!ldata.up && RealIsEqualOrMore(desiredY, anchor.y() - reduction))
                    const chord = chordRest as Chord
                    const note = ldata.up ? chord.downNote() : chord.upNote()
                    const noteAnchor = (ldata.up ? note.stemUpSE().y() : note.stemDownNW().y()) + note.pagePos().y() - item.pagePos().y()
                    const desiredLen = Math.abs(stdRound((desiredY - noteAnchor) / ldata.spatium * 4)) + 1
                    if (beamClearsAnchor && desiredLen >= stdRound(minLen * chordRest.mag())) {
                        break
                    }

                    if (isFlat || (isSmall && bp.dictator === bp.pointer)) {
                        bp.dictator += ldata.up ? -1 : 1
                        bp.pointer += ldata.up ? -1 : 1
                    } else if (Math.abs(bp.dictator - bp.pointer) === 1) {
                        bp.dictator += ldata.up ? -1 : 1
                    } else {
                        bp.pointer += ldata.up ? -1 : 1
                    }

                    startY = (isStartDictator ? bp.dictator : bp.pointer) * ldata.spatium / 4 + tolerance
                    endY = (isStartDictator ? bp.pointer : bp.dictator) * ldata.spatium / 4 + tolerance
                }
            }
            curChordRest++
        }
    }

    private static offsetBeamWithAnchorShortening(ldata: BeamBaseLayoutData, chordRests: readonly ChordRest[], bp: BeamPos,
                                                  staffLines: number, isStartDictator: boolean, stemLengthDictator: number,
                                                  targetLine: number): void {
        let startChord: Chord | null = null
        let endChord: Chord | null = null
        for (const cr of chordRests) {
            if (cr.isChord()) {
                endChord = cr as Chord
                if (!startChord) {
                    startChord = cr as Chord
                }
            }
        }
        if (!startChord || !endChord) {
            // if beam is all rests, don't do anything
            return
        }

        // min stem lengths according to how many beams there are (starting with 1)
        const minStemLengths = [11, 13, 15, 18, 21, 24, 27, 30]
        const dictatorBeams = BeamTremoloLayout.strokeCount(ldata, isStartDictator ? startChord : endChord)
        const pointerBeams = BeamTremoloLayout.strokeCount(ldata, isStartDictator ? endChord : startChord)
        let maxDictatorReduce = stemLengthDictator - minStemLengths[Math.max(dictatorBeams - 1, 0)]
        maxDictatorReduce = Math.min(Math.abs(bp.dictator - targetLine), maxDictatorReduce)

        const isFlat = bp.dictator === bp.pointer
        const startPos = new NotePosition(startChord.line(), startChord.vStaffIdx())
        const endPos = new NotePosition(endChord.line(), endChord.vStaffIdx())
        const isAscending = startPos.gt(endPos)
        const towardBeam = ldata.up ? -1 : 1
        let newDictator = bp.dictator
        let newPointer = bp.pointer
        let reduce = 0
        const fourBeamException = (beams: number, yPos: number): boolean => {
            yPos += 400 // because there is some weirdness with modular division around zero, add
            // a large multiple of 4 so that we can guarantee that yPos%4 will be correct
            return beams >= 4 && (yPos % 4 === 2)
        }
        const valid = BeamTremoloLayout.isValidBeamPosition
        while (!fourBeamException(dictatorBeams, newDictator)
               && !valid(ldata.up, newDictator, isStartDictator, isAscending, isFlat, staffLines, true)) {
            if (++reduce > maxDictatorReduce) {
                // we can't shorten this stem at all. bring it back to default and start extending
                newDictator = bp.dictator
                newPointer = bp.pointer
                while (!valid(ldata.up, newDictator, isStartDictator, isAscending, isFlat, staffLines, true)) {
                    newDictator += towardBeam
                    newPointer += towardBeam
                }
                break
            }
            newDictator += -towardBeam
            newPointer += -towardBeam
        }

        // newDictator is guaranteed either valid, or ==dictator
        // use this as the base for the beam positions
        newPointer = ldata.up ? Math.min(newPointer, targetLine) : Math.max(newPointer, targetLine)
        while (!fourBeamException(dictatorBeams, newDictator) && !fourBeamException(pointerBeams, newPointer)
               && (!valid(ldata.up, newDictator, isStartDictator, isAscending, isFlat, staffLines, true)
                   || !valid(ldata.up, newPointer, !isStartDictator, isAscending, isFlat, staffLines, true))) {
            if (isFlat) {
                newDictator += towardBeam
                newPointer += towardBeam
            } else if (Math.abs(newDictator - newPointer) === 1) {
                newDictator += towardBeam
            } else {
                newPointer += towardBeam
            }
        }
        bp.dictator = newDictator
        bp.pointer = newPointer
        if (isFlat) {
            bp.pointer = bp.dictator
        }
    }

    static extendStem(ldata: BeamBaseLayoutData, chord: Chord, addition: number, ctx: LayoutContext): void {
        const anchor = BeamTremoloLayout.chordBeamAnchor(ldata, chord, ChordBeamAnchorType.Middle)
        let desiredY: number
        if (ldata.endAnchor.x() > ldata.startAnchor.x()) {
            const proportionAlongX = (anchor.x() - ldata.startAnchor.x()) / (ldata.endAnchor.x() - ldata.startAnchor.x())
            desiredY = proportionAlongX * (ldata.endAnchor.y() - ldata.startAnchor.y()) + ldata.startAnchor.y()
        } else {
            desiredY = Math.max(ldata.endAnchor.y(), ldata.startAnchor.y())
        }

        if (chord.up()) {
            chord.setBeamExtension(anchor.y() - desiredY + addition)
        } else {
            chord.setBeamExtension(desiredY - anchor.y() + addition)
        }
        const stem = chord.stem()!
        TLayout.layoutStem(stem, ctx)
        const stemSlash = chord.stemSlash()
        if (stemSlash) {
            TLayout.layoutStemSlash(stemSlash, ctx)
        }
        // Update the shape element of the stem in the segment shape
        for (const shapeEl of chord.segment()!.staffShape(chord.vStaffIdx()).elements()) {
            if (shapeEl.item() === stem) {
                const r = stem.ldata().bbox().translated(stem.pos().plus(chord.pos()))
                const replacement = new ShapeElement(r, stem)
                shapeEl.setRect(replacement.x(), replacement.y(), replacement.width(), replacement.height())
            }
        }
    }

    private static isBeamInsideStaff(yPos: number, staffLines: number, allowFloater: boolean): boolean {
        const aboveStaff = allowFloater ? -2 : -3
        const belowStaff = (staffLines - 1) * 4 + (allowFloater ? 2 : 3)
        return yPos > aboveStaff && yPos < belowStaff
    }

    private static setSmallInnerBeamPos(ldata: BeamBaseLayoutData, bp: BeamPos, staffLines: number, isFlat: boolean, isSmall: boolean,
                                        ctx: LayoutContext): void {
        if (!isSmall || !isFlat) {
            return
        }
        let noteOutsideStaff = false
        let beamCount = 0
        for (const cr of ldata.elements) {
            if (!cr.isChord()) {
                continue
            }
            const c = cr as Chord
            beamCount = Math.max(beamCount, BeamTremoloLayout.strokeCount(ldata, cr))
            noteOutsideStaff = noteOutsideStaff || (c.downLine() < -2 && !ldata.up) || (c.upLine() >= 11 && ldata.up)
        }
        if (!noteOutsideStaff) {
            return
        }
        const mag = ldata.isGrace ? ctx.conf().styleD(Sid.graceNoteMag) : ldata.mag()
        const innerBeam = bp.dictator + (beamCount - 1) * (ldata.up ? ldata.beamSpacing : -ldata.beamSpacing) * mag
        const aboveStaff = 1
        const belowStaff = (staffLines - 1) * 4 - 1
        let offset = 0
        if (ldata.up) {
            offset = Math.min(offset, Math.floor(belowStaff - innerBeam))
        } else {
            offset = Math.max(offset, Math.ceil(aboveStaff - innerBeam))
        }
        bp.dictator += offset
        bp.pointer = bp.dictator
    }

    private static getOuterBeamPosOffset(ldata: BeamBaseLayoutData, innerBeam: number, beamCount: number, staffLines: number): number {
        const spacing = ldata.up ? -ldata.beamSpacing : ldata.beamSpacing
        let offset = (beamCount - 1) * spacing
        let isInner = false
        while (offset !== 0 && !BeamTremoloLayout.isBeamInsideStaff(innerBeam + offset, staffLines, isInner)) {
            offset -= spacing
            isInner = true
        }
        return offset
    }

    private static isValidBeamPosition(isUp: boolean, yPos: number, isStart: boolean, isAscending: boolean, isFlat: boolean,
                                       staffLines: number, isOuter: boolean): boolean {
        // outside the staff
        const slantsAway = (isUp && isAscending === isStart) || (!isUp && isAscending !== isStart)
        if (!BeamTremoloLayout.isBeamInsideStaff(yPos, staffLines, isOuter && (slantsAway || isFlat))) {
            return true
        }
        // removes modulo weirdness with negative numbers (i.e., right above staff)
        yPos += 8
        // is floating in space
        if (yPos % 4 === 2) {
            return false
        }

        // is on line
        if (isFlat) {
            return true
        }
        if (yPos % 4 === 0) {
            return true
        }
        // is sitting
        if (yPos % 4 === 3) {
            // return true only if we're starting here and descending, or ascending and ending here
            return isAscending !== isStart
        }
        // is straddling
        // return true only if we're starting here and ascending, or descending and ending here
        return isAscending === isStart
    }

    private static is64thBeamPositionException(beamSpacing: number, yPos: number, staffLines: number): boolean {
        if (beamSpacing === 4) {
            return false
        }
        return yPos === 2 || yPos === staffLines * 4 - 2 || yPos === staffLines * 4 - 6 || yPos === -2
    }

    private static findValidBeamOffset(ldata: BeamBaseLayoutData, outer: number, beamCount: number, staffLines: number, isStart: boolean,
                                       isAscending: boolean, isFlat: boolean): number {
        let isBeamValid = false
        let offset = 0
        const innerBeam = outer + (beamCount - 1) * (ldata.up ? ldata.beamSpacing : -ldata.beamSpacing)
        while (!isBeamValid) {
            while (!BeamTremoloLayout.isValidBeamPosition(ldata.up, innerBeam + offset, isStart, isAscending, isFlat, staffLines,
                                                          beamCount < 2)) {
                offset += ldata.up ? -1 : 1
            }
            const outerMostBeam = innerBeam + offset + BeamTremoloLayout.getOuterBeamPosOffset(ldata, innerBeam + offset, beamCount, staffLines)
            if (BeamTremoloLayout.isValidBeamPosition(ldata.up, outerMostBeam, isStart, isAscending, isFlat, staffLines, true)
                || (beamCount === 4 && BeamTremoloLayout.is64thBeamPositionException(ldata.beamSpacing, outerMostBeam, staffLines))) {
                isBeamValid = true
            } else {
                offset += ldata.up ? -1 : 1
            }
        }
        return offset
    }

    private static setValidBeamPositions(ldata: BeamBaseLayoutData, bp: BeamPos, beamCountD: number, beamCountP: number, staffLines: number,
                                         isStartDictator: boolean, isFlat: boolean, isAscending: boolean): void {
        let areBeamsValid = false
        let has3BeamsInsideStaff = beamCountD >= 3 || beamCountP >= 3
        while (!areBeamsValid && has3BeamsInsideStaff && ldata.beamSpacing !== 4) {
            const dictatorInner = bp.dictator + (beamCountD - 1) * (ldata.up ? ldata.beamSpacing : -ldata.beamSpacing)
            // use dictatorInner for both to simulate flat beams
            const outerDictatorOffset = BeamTremoloLayout.getOuterBeamPosOffset(ldata, dictatorInner, beamCountD, staffLines)
            if (Math.abs(outerDictatorOffset) <= ldata.beamSpacing) {
                has3BeamsInsideStaff = false
                break
            }
            const offsetD = BeamTremoloLayout.findValidBeamOffset(ldata, bp.dictator, beamCountD, staffLines, isStartDictator, false, true)
            const offsetP = BeamTremoloLayout.findValidBeamOffset(ldata, bp.pointer, beamCountP, staffLines, isStartDictator, false, true)
            const offset = offsetD === 0 ? offsetP : offsetD
            if (bp.pointer === bp.dictator) {
                bp.dictator += offset
            }
            bp.pointer = bp.dictator
            if (offset === 0) {
                areBeamsValid = true
            }
        }
        if (isFlat) {
            areBeamsValid = false
        }
        while (!areBeamsValid) {
            const dictatorOffset = BeamTremoloLayout.findValidBeamOffset(ldata, bp.dictator, beamCountD, staffLines, isStartDictator,
                                                                         isAscending, isFlat)
            bp.dictator += dictatorOffset
            bp.pointer += dictatorOffset
            if (isFlat) {
                bp.pointer = bp.dictator
                let currOffset = 0
                for (const cr of ldata.elements) {
                    if (!cr.isChord() && (cr !== ldata.elements[0] && cr !== ldata.elements[ldata.elements.length - 1])) {
                        continue
                    }
                    const beamCount = BeamTremoloLayout.strokeCount(ldata, cr)
                    currOffset = BeamTremoloLayout.findValidBeamOffset(ldata, bp.dictator, beamCount, staffLines, isStartDictator,
                                                                       isAscending, isFlat)
                    if (currOffset) {
                        break
                    }
                }
                if (currOffset === 0) {
                    areBeamsValid = true
                } else {
                    bp.dictator += currOffset
                    bp.pointer += currOffset
                }
            } else {
                bp.pointer += BeamTremoloLayout.findValidBeamOffset(ldata, bp.pointer, beamCountP, staffLines, !isStartDictator,
                                                                    isAscending, isFlat)
                if ((ldata.up && bp.pointer <= bp.dictator) || (!ldata.up && bp.pointer >= bp.dictator)) {
                    bp.dictator = bp.pointer + (ldata.up ? -1 : 1)
                } else {
                    areBeamsValid = true
                }
            }
        }
    }

    private static addMiddleLineSlant(ldata: BeamBaseLayoutData, bp: BeamPos, beamCount: number, targetLine: number, interval: number,
                                      desiredSlant: number): void {
        const isSmall = ldata.mag() < 1.0 || ldata.isGrace
        if (interval === 0 || (!isSmall && beamCount > 2 && ldata.beamSpacing !== 4) || BeamTremoloLayout.noSlope(ldata.beam)) {
            return
        }
        const isOnTargetLine = bp.pointer === targetLine && (Math.abs(bp.pointer - bp.dictator) < 2)
        if (isOnTargetLine) {
            if (Math.abs(desiredSlant) === 1 || interval === 1 || (beamCount === 2 && ldata.beamSpacing !== 4 && !isSmall)) {
                bp.dictator = targetLine + (ldata.up ? -1 : 1)
            } else {
                bp.dictator = targetLine + (ldata.up ? -2 : 2)
            }
        }
    }

    private static add8thSpaceSlant(ldata: BeamBaseLayoutData, dictatorAnchor: PointF, dictator: number, pointer: number, beamCount: number,
                                    interval: number, targetLine: number, isFlat: boolean): void {
        if (beamCount !== 3 || BeamTremoloLayout.noSlope(ldata.beam) || ldata.beamSpacing !== 3) {
            return
        }
        if ((isFlat && dictator !== targetLine) || (dictator !== pointer) || interval === 0) {
            return
        }
        if ((ldata.up && (dictator + 4) % 4 === 3) || (!ldata.up && (dictator + 4) % 4 === 1)) {
            return
        }
        dictatorAnchor.setY(dictatorAnchor.y() + (ldata.up ? -0.125 * ldata.spatium : 0.125 * ldata.spatium))
        ldata.beamDist += 0.0625 * ldata.spatium
    }

    private static computeTremoloUp(ldata: BeamBaseLayoutData): boolean {
        const t = trem(ldata)
        if (!ldata.beam || !ldata.beam.cross()) {
            return t.up()
        }
        const c1 = t.chord1()
        const c2 = t.chord2()
        let staffMove = 0
        for (const cr of ldata.beam.elements()) {
            if (cr.staffMove() !== 0) {
                staffMove = cr.staffMove()
                break
            }
        }
        if (c1.staffMove() === c2.staffMove()) {
            if (staffMove < 0) {
                // the chords in this trem are both above the beam
                return c1.staffMove() !== staffMove
            } else {
                return c1.staffMove() === staffMove
            }
        }
        return t.up()
    }

    static strokeCount(ldata: BeamBaseLayoutData, cr: ChordRest): number {
        if (cr.isRest()) {
            return cr.beams()
        }
        let strokes = 0
        const c = cr as Chord
        if (ldata.beamType === BeamType.TREMOLO) {
            strokes = trem(ldata).lines()
        } else if (ldata.beamType === BeamType.BEAM && c.tremoloTwoChord()) {
            strokes = c.tremoloTwoChord()!.lines()
        }
        strokes += ldata.beam ? cr.beams() : 0
        return strokes
    }

    static calculateAnchors(item: BeamBase, ldata: BeamBaseLayoutData, ctx: LayoutContext, chordRests: readonly ChordRest[],
                            notePositions: readonly NotePosition[]): boolean {
        ldata.startAnchor = new PointF()
        ldata.endAnchor = new PointF()
        if (ldata.beamType === BeamType.TREMOLO && ldata.beam) {
            const t = trem(ldata)
            const cr1 = t.chord1()
            const cr2 = t.chord2()
            const anchorX1 = BeamTremoloLayout.chordBeamAnchorX(ldata, cr1, ChordBeamAnchorType.Middle)
            const anchorX2 = BeamTremoloLayout.chordBeamAnchorX(ldata, cr2, ChordBeamAnchorType.Middle)
            for (const ta of ldata.beam.tremAnchors()) {
                if (ta.chord1 === cr1) {
                    ldata.startAnchor = new PointF(anchorX1, ta.y1)
                    ldata.endAnchor = new PointF(anchorX2, ta.y2)
                    ldata.slope = (ta.y2 - ta.y1) / (anchorX2 - anchorX1)
                    return true
                }
            }
            return false
        }
        let startChord: Chord | null = null
        let endChord: Chord | null = null
        let startCr: ChordRest | null = null
        let endCr: ChordRest | null = null
        ldata.elements = [...chordRests]
        if (chordRests.length === 0) {
            return false
        }

        let hasChordAboveBeam = false
        let hasChordBelowBeam = false
        for (const chordRest of chordRests) {
            if (!startCr) {
                startCr = chordRest
            }
            endCr = chordRest
            if (chordRest.isChord()) {
                if (!startChord) {
                    startChord = chordRest as Chord
                    endChord = startChord
                } else {
                    endChord = chordRest as Chord
                }
                ChordLayout.layoutStem(chordRest as Chord, ctx)
            }
            if (chordRest.isBelowCrossBeam(item)) {
                hasChordBelowBeam = true
            } else {
                hasChordAboveBeam = true
            }
        }
        if (!startChord || !endChord) {
            return false
        }

        ldata.isGrace = startChord.isGrace()
        ldata.notePositions = [...notePositions]

        ldata.crossStaffBeamPos = CrossStaffBeamPosition.INVALID
        if (item.minCRMove() !== item.maxCRMove()) {
            if (hasChordAboveBeam && !hasChordBelowBeam) {
                ldata.crossStaffBeamPos = CrossStaffBeamPosition.BELOW
            } else if (hasChordBelowBeam && !hasChordAboveBeam) {
                ldata.crossStaffBeamPos = CrossStaffBeamPosition.ABOVE
            } else if (hasChordAboveBeam && hasChordBelowBeam) {
                ldata.crossStaffBeamPos = CrossStaffBeamPosition.BETWEEN
            }
        }

        if (BeamTremoloLayout.calculateAnchorsCross(item, ldata, ctx.conf())) {
            return true
        }

        const closestMove = ldata.crossStaffBeamPos === CrossStaffBeamPosition.ABOVE ? item.minCRMove() : item.maxCRMove()
        const closestStaffToBeam = ldata.crossStaffBeamPos === CrossStaffBeamPosition.ABOVE
                                   || ldata.crossStaffBeamPos === CrossStaffBeamPosition.BELOW
            ? item.staffIdx() + closestMove : startChord.vStaffIdx()

        const chordsClosestToBeam: Chord[] = []
        for (const cr of ldata.elements) {
            if (cr.isChord() && cr.vStaffIdx() === closestStaffToBeam) {
                chordsClosestToBeam.push(cr as Chord)
            }
        }

        ldata.startAnchor = BeamTremoloLayout.chordBeamAnchor(ldata, startChord, ChordBeamAnchorType.Start)
        ldata.endAnchor = BeamTremoloLayout.chordBeamAnchor(ldata, endChord, ChordBeamAnchorType.End)

        const startLength = startChord.defaultStemLength()
        const endLength = endChord.defaultStemLength()
        const startAnchorBase = ldata.startAnchor.y() + (ldata.up ? startLength : -startLength)
        const endAnchorBase = ldata.endAnchor.y() + (ldata.up ? endLength : -endLength)
        let startNote = ldata.up ? startChord.upNote().line() : startChord.downNote().line()
        let endNote = ldata.up ? endChord.upNote().line() : endChord.downNote().line()
        if (ldata.tab) {
            // TODO(port): Chord::upString()/downString()
            startNote = ldata.up ? startChord.upNote().string() : startChord.downNote().string()
            endNote = ldata.up ? endChord.upNote().string() : endChord.downNote().string()
        }
        const startStaff = startChord.vStaffIdx()
        const endStaff = endChord.vStaffIdx()
        const startPos = new NotePosition(startNote, startStaff)
        const endPos = new NotePosition(endNote, endStaff)
        const interval = Math.abs(startNote - endNote)
        const isStartDictator = ldata.up ? startPos.lt(endPos) : startPos.gt(endPos)
        const quarterSpace = ldata.spatium / 4
        const startAnchor = ldata.startAnchor.minus(item.pagePos())
        const endAnchor = ldata.endAnchor.minus(item.pagePos())
        const bp: BeamPos = {
            dictator: stdRound((isStartDictator ? startAnchor.y() : endAnchor.y()) / quarterSpace),
            pointer: stdRound((isStartDictator ? endAnchor.y() : startAnchor.y()) / quarterSpace),
        }

        const staffLines = ctx.dom().staff(closestStaffToBeam)!.lines(ldata.tick)

        const targetLine = BeamTremoloLayout.getTargetStaffLine(ldata, ctx, startChord, endChord, staffLines, closestStaffToBeam,
                                                                item.staffIdx())

        const slant = BeamTremoloLayout.computeDesiredSlant(item, ldata, startPos, endPos, chordsClosestToBeam, targetLine,
                                                            bp.dictator, bp.pointer)
        const isFlat = slant === 0
        const specialSlant = isFlat ? BeamTremoloLayout.getSlopeConstraint(ldata, startPos, endPos) : SlopeConstraint.NO_CONSTRAINT
        const forceFlat = specialSlant === SlopeConstraint.FLAT
        const smallSlant = specialSlant === SlopeConstraint.SMALL_SLOPE
        if (isFlat) {
            bp.dictator = ldata.up ? Math.min(bp.pointer, bp.dictator) : Math.max(bp.pointer, bp.dictator)
            bp.pointer = bp.dictator
        } else {
            if ((bp.dictator > bp.pointer) !== (isStartDictator ? startPos.gt(endPos) : endPos.gt(startPos))) {
                bp.dictator = bp.pointer - slant
            } else {
                bp.pointer = bp.dictator + slant
            }
        }

        const isAscending = startPos.gt(endPos)
        const beamCountD = BeamTremoloLayout.strokeCount(ldata, isStartDictator ? startChord : endChord)
        const beamCountP = BeamTremoloLayout.strokeCount(ldata, isStartDictator ? endChord : startChord)

        const stemLengthStart = Math.abs(stdRound((startAnchorBase - ldata.startAnchor.y()) / ldata.spatium * 4))
        const stemLengthEnd = Math.abs(stdRound((endAnchorBase - ldata.endAnchor.y()) / ldata.spatium * 4))
        const stemLengthDictator = isStartDictator ? stemLengthStart : stemLengthEnd
        const isSmall = ldata.mag() < 1.0 || ldata.isGrace
        if (endAnchor.x() > startAnchor.x()) {
            /* When beam layout is called before horizontal spacing (see LayoutMeasure::getNextMeasure() to
             * know why) the x positions aren't yet determined and may be all zero, which would cause the
             * following function to get stuck in a loop. The if() condition avoids that case. */
            BeamTremoloLayout.setSmallInnerBeamPos(ldata, bp, staffLines, isFlat, isSmall, ctx)
            if (!isSmall) {
                // Miminum stem lengths are not applied to beams with small notes
                BeamTremoloLayout.offsetBeamWithAnchorShortening(ldata, chordRests, bp, staffLines, isStartDictator, stemLengthDictator,
                                                                 targetLine)
            }
            BeamTremoloLayout.offsetBeamToRemoveCollisions(item, ldata, chordRests, bp, startAnchor.x(), endAnchor.x(), isFlat,
                                                           isStartDictator)
        }
        const beamCount = Math.max(beamCountD, beamCountP)
        if (!ldata.tab) {
            if (!ldata.isGrace) {
                BeamTremoloLayout.setValidBeamPositions(ldata, bp, beamCountD, beamCountP, staffLines, isStartDictator, isFlat, isAscending)
            }
            if (!forceFlat) {
                BeamTremoloLayout.addMiddleLineSlant(ldata, bp, beamCount, targetLine, interval, smallSlant ? 1 : slant)
            }
        }

        ldata.startAnchor.setY(quarterSpace * (isStartDictator ? bp.dictator : bp.pointer) + item.pagePos().y())
        ldata.endAnchor.setY(quarterSpace * (isStartDictator ? bp.pointer : bp.dictator) + item.pagePos().y())

        let add8th = true
        if (item.isType(ElementType.BEAM) && (item as Beam).userModified()) {
            add8th = false
        }
        if (!ldata.tab && add8th) {
            BeamTremoloLayout.add8thSpaceSlant(ldata, isStartDictator ? ldata.startAnchor : ldata.endAnchor, bp.dictator, bp.pointer,
                                               beamCount, interval, targetLine, isFlat)
        }
        ldata.startAnchor.setX(BeamTremoloLayout.chordBeamAnchorX(ldata, startCr!, ChordBeamAnchorType.Start))
        ldata.endAnchor.setX(BeamTremoloLayout.chordBeamAnchorX(ldata, endCr!, ChordBeamAnchorType.End))
        return true
    }

    private static calculateAnchorsCross(item: BeamBase, ldata: BeamBaseLayoutData, conf: LayoutConfiguration): boolean {
        if (ldata.crossStaffBeamPos !== CrossStaffBeamPosition.BETWEEN) {
            return false
        }

        const spatium = conf.spatium()
        const startCr = ldata.elements[0]
        const endCr = ldata.elements[ldata.elements.length - 1]

        const quarterSpace = spatium / 4
        let topFirst: Chord | null = null
        let topLast: Chord | null = null
        let bottomFirst: Chord | null = null
        let bottomLast: Chord | null = null
        let maxMiddleTopLine = -2147483648 // lowest note in the top staff
        let minMiddleBottomLine = 2147483647 // highest note in the bottom staff
        let prevTopLine = maxMiddleTopLine // previous note's line position (top)
        let prevBottomLine = minMiddleBottomLine // previous note's line position (bottom)
        // if the immediate noteheads are on the same line (but not the outer ones), the beam is flat
        let secondTopIsSame = false
        let secondBottomIsSame = false
        let penultimateTopIsSame = false
        let penultimateBottomIsSame = false
        let maxY = Number.MAX_VALUE
        let minY = Number.MIN_VALUE // C++ std::numeric_limits<double>::min()
        let prevBelowBeam = ldata.elements[0].isBelowCrossBeam(item)
        let hasBeamSideSwitch = false
        let beamSideSwitchDirection = 0
        let prevStaff = ldata.elements[0].vStaffIdx()
        let hasStaffSwitch = false
        let staffSwitchDirection = 0
        let checkNextTop = false
        let checkNextBottom = false
        for (const cr of ldata.elements) {
            if (!cr.isChord()) {
                continue
            }
            const c = cr as Chord
            if (c.isBelowCrossBeam(item) === prevBelowBeam) {
                if (prevStaff !== c.vStaffIdx()) {
                    const diff = prevStaff - c.vStaffIdx()
                    staffSwitchDirection = hasStaffSwitch ? 0 : (diff < 0 ? -1 : 1)
                    hasStaffSwitch = true
                }
            }
            prevStaff = c.vStaffIdx()
            if (c.isBelowCrossBeam(item)) {
                // this note is below the beam
                if (penultimateBottomIsSame) {
                    minMiddleBottomLine = Math.min(minMiddleBottomLine, prevBottomLine)
                    penultimateBottomIsSame = false
                }
                checkNextTop = false // we are no longer looking for the second note in the top
                if (!bottomFirst) {
                    bottomFirst = c
                    checkNextBottom = true // this was the first bottom note, so check for second next time
                } else {
                    penultimateBottomIsSame = prevBottomLine === c.line()
                    if (!penultimateBottomIsSame) {
                        minMiddleBottomLine = Math.min(minMiddleBottomLine, prevBottomLine)
                    }
                    if (checkNextBottom) {
                        secondBottomIsSame = c.line() === bottomFirst.line()
                        checkNextBottom = false
                    } else {
                        prevBottomLine = c.line()
                    }
                    bottomLast = c
                }
                if (!prevBelowBeam) {
                    beamSideSwitchDirection = hasBeamSideSwitch ? 0 : -1
                    hasBeamSideSwitch = true
                }
                prevBelowBeam = true
                maxY = Math.min(maxY, BeamTremoloLayout.chordBeamAnchorY(ldata, c))
            } else {
                if (penultimateTopIsSame) {
                    maxMiddleTopLine = Math.max(maxMiddleTopLine, prevTopLine)
                    penultimateTopIsSame = false
                }
                checkNextBottom = false // no longer looking for a bottom second note since this is on top
                if (!topFirst) {
                    topFirst = c
                    checkNextTop = true
                } else {
                    penultimateTopIsSame = prevTopLine === c.line()
                    if (!penultimateTopIsSame) {
                        maxMiddleTopLine = Math.max(maxMiddleTopLine, prevTopLine)
                    }
                    if (checkNextTop) {
                        secondTopIsSame = c.line() === topFirst.line()
                        checkNextTop = false
                    } else {
                        prevTopLine = c.line()
                    }
                    topLast = c
                }
                if (prevBelowBeam) {
                    beamSideSwitchDirection = hasBeamSideSwitch ? 0 : 1
                    hasBeamSideSwitch = true
                }
                prevBelowBeam = false
                minY = Math.max(minY, BeamTremoloLayout.chordBeamAnchorY(ldata, c))
            }
        }

        let yMidPoint = (maxY + minY) / 2
        if (item.isBeam()) {
            // Adjust for staff spacing
            const beam = item as Beam
            const beamSegments = beam.beamSegments()
            const limitingChordAbove = beam.ldata().limitingChordAbove
            const limitingChordBelow = beam.ldata().limitingChordBelow
            if (beamSegments.length && limitingChordAbove && limitingChordBelow) {
                const yCenterSegment = 0.5 * (beamSegments[0].line.y1() + beamSegments[0].line.y2())

                const topBeamSegmentForChordAbove = beam.topLevelSegmentForElement(limitingChordAbove)!
                const yTopSegAbove = 0.5 * (topBeamSegmentForChordAbove.line.y1() + topBeamSegmentForChordAbove.line.y2())
                const distAbove = yTopSegAbove - yCenterSegment

                const topBeamSegmentForChordBelow = beam.topLevelSegmentForElement(limitingChordBelow)!
                const yTopSegBelow = 0.5 * (topBeamSegmentForChordBelow.line.y1() + topBeamSegmentForChordBelow.line.y2())
                const distBelow = yTopSegBelow - yCenterSegment

                const averageDist = 0.5 * (distAbove + distBelow)
                yMidPoint -= 0.5 * averageDist
            }
        }

        ldata.startAnchor.setY(yMidPoint)
        ldata.endAnchor.setY(yMidPoint)
        ldata.startAnchor.setX(BeamTremoloLayout.chordBeamAnchorX(ldata, startCr, ChordBeamAnchorType.Start))
        ldata.endAnchor.setX(BeamTremoloLayout.chordBeamAnchorX(ldata, endCr, ChordBeamAnchorType.End))

        ldata.slope = 0

        if (!BeamTremoloLayout.noSlope(ldata.beam)) {
            const topFirstLine = topFirst ? topFirst.downNote().line() : 0
            const topLastLine = topLast ? topLast.downNote().line() : 0
            const bottomFirstLine = bottomFirst ? bottomFirst.upNote().line() : 0
            const bottomLastLine = bottomLast ? bottomLast.upNote().line() : 0
            let constrainTopToQuarter = false
            let constrainBottomToQuarter = false
            if ((topFirstLine > topLastLine && secondTopIsSame) || (topFirstLine < topLastLine && penultimateTopIsSame)) {
                constrainTopToQuarter = true
            }
            if ((bottomFirstLine < bottomLastLine && secondBottomIsSame) || (bottomFirstLine > bottomLastLine && penultimateBottomIsSame)) {
                constrainBottomToQuarter = true
            }
            if (!topLast && !bottomLast && topFirst && bottomFirst) {
                // if there are only two notes, one on each side of the beam, the beam is slanted
                let yFirst: number
                let yLast: number
                if (ldata.elements[0] === topFirst) {
                    yFirst = StemLayout.stemPos(topFirst).y()
                    yLast = StemLayout.stemPos(bottomFirst).y()
                } else {
                    yFirst = StemLayout.stemPos(bottomFirst).y()
                    yLast = StemLayout.stemPos(topFirst).y()
                }
                const desiredSlant = stdRound((yFirst - yLast) / spatium)
                let slant = Math.min(Math.abs(desiredSlant), BeamTremoloLayout.getMaxSlope(ldata))
                slant *= (desiredSlant < 0) ? -quarterSpace : quarterSpace
                ldata.startAnchor.setY(ldata.startAnchor.y() + slant / 2)
                ldata.endAnchor.setY(ldata.endAnchor.y() - slant / 2)
            } else {
                let forceHoriz = false
                let singleNoteTop = false
                let singleNoteBottom = false
                let topSlant = topFirstLine - topLastLine
                if (constrainTopToQuarter && topSlant !== 0) {
                    topSlant = topFirstLine < topLastLine ? -1 : 1
                }
                if (!topLast) {
                    topSlant = 0
                    singleNoteTop = true
                }
                let bottomSlant = bottomFirstLine - bottomLastLine
                if (constrainBottomToQuarter && bottomSlant !== 0) {
                    bottomSlant = bottomFirstLine < bottomLastLine ? -1 : 1
                }
                if (!bottomLast) {
                    bottomSlant = 0
                    singleNoteBottom = true
                }
                if (maxMiddleTopLine >= Math.max(topFirstLine, topLastLine) || minMiddleBottomLine <= Math.min(bottomFirstLine, bottomLastLine)) {
                    forceHoriz = true
                }
                const topSlantDir = topSlant <= 0 ? (topSlant === 0 ? 0 : -1) : 1
                const bottomSlantDir = bottomSlant <= 0 ? (bottomSlant === 0 ? 0 : -1) : 1
                let overallDirection = 0
                for (const direction of [topSlantDir, bottomSlantDir, beamSideSwitchDirection, staffSwitchDirection]) {
                    if (direction !== 0) {
                        overallDirection = direction
                        break
                    }
                }
                const overallSlantFlat = overallDirection === 0
                const topSlantOverallDiff = topSlantDir !== 0 && topSlantDir !== overallDirection
                const bottomSlantOverallDiff = bottomSlantDir !== 0 && bottomSlantDir !== overallDirection
                const beamSideSwitchOverallDiff = beamSideSwitchDirection !== 0 && beamSideSwitchDirection !== overallDirection
                const staffSwitchOverallDiff = staffSwitchDirection !== 0 && staffSwitchDirection !== overallDirection
                const flattenNeutralBeamSideSwitch = beamSideSwitchDirection === 0 && (topSlantDir !== bottomSlantDir)
                                                     && !(singleNoteTop || singleNoteBottom)
                forceHoriz = forceHoriz || overallSlantFlat || flattenNeutralBeamSideSwitch
                             || (topSlantOverallDiff || bottomSlantOverallDiff || beamSideSwitchOverallDiff || staffSwitchOverallDiff)
                if (!forceHoriz) {
                    let slant: number
                    if (topSlant === 0) {
                        slant = bottomSlant
                    } else if (bottomSlant === 0) {
                        slant = topSlant
                    } else {
                        slant = (Math.abs(topSlant) < Math.abs(bottomSlant)) ? topSlant : bottomSlant
                    }

                    const absSlant = Math.min(Math.abs(slant), BeamTremoloLayout.getMaxSlope(ldata))
                    const slope = absSlant * ((slant < 0) ? -quarterSpace : quarterSpace)
                    ldata.startAnchor.setY(ldata.startAnchor.y() + slope / 2)
                    ldata.endAnchor.setY(ldata.endAnchor.y() - slope / 2)
                } // otherwise, it's flat
            }
            ldata.slope = (ldata.endAnchor.y() - ldata.startAnchor.y()) / (ldata.endAnchor.x() - ldata.startAnchor.x())
        }
        return true
    }

    private static noSlope(beam: Beam | null): boolean {
        return !!beam && beam.noSlope()
    }

    private static getTargetStaffLine(ldata: BeamBaseLayoutData, ctx: LayoutContext, startChord: ChordRest, endChord: ChordRest,
                                      staffLines: number, beamClosestStaffIdx: staff_idx_t, actualBeamStaffIdx: staff_idx_t): number {
        const isFullSize = RealIsEqual(ldata.mag(), 1.0) && !ldata.isGrace
        const useWideBeams = ctx.conf().styleB(Sid.useWideBeams)
        const startBeams = BeamTremoloLayout.strokeCount(ldata, startChord)
        const endBeams = BeamTremoloLayout.strokeCount(ldata, endChord)
        const startTargetLine = StemLayout.minStaffOverlap(ldata.up, staffLines, startBeams, false, ldata.beamSpacing / 4.0, useWideBeams,
                                                           isFullSize)
        const endTargetLine = StemLayout.minStaffOverlap(ldata.up, staffLines, endBeams, false, ldata.beamSpacing / 4.0, useWideBeams,
                                                         !ldata.isGrace)
        let diff = 0
        if (ldata.crossStaffBeamPos === CrossStaffBeamPosition.ABOVE || ldata.crossStaffBeamPos === CrossStaffBeamPosition.BELOW) {
            const curSys = startChord.measure()!.system()
            const dir = ldata.up ? -1 : 1
            if (curSys && beamClosestStaffIdx !== actualBeamStaffIdx) {
                diff = stdRound(Math.abs(curSys.staffYpage(beamClosestStaffIdx) - curSys.staffYpage(actualBeamStaffIdx))
                                / ldata.spatium * 4 * dir)
            }
        }
        if (ldata.up) {
            return Math.min(startTargetLine + diff, endTargetLine + diff) + 1
        }
        return Math.max(startTargetLine + diff, endTargetLine + diff) - 1
    }

    private static computeDesiredSlant(item: BeamBase, ldata: BeamBaseLayoutData, startPos: NotePosition, endPos: NotePosition,
                                       closestChordsToBeam: readonly Chord[], targetLine: number, dictator: number, pointer: number): number {
        if (item.isType(ElementType.BEAM) && (item as Beam).noSlope()) {
            return 0
        }
        let dictatorExtension = targetLine - dictator // we need to make sure that beams extended to the middle line
        let pointerExtension = targetLine - pointer // are properly treated as flat.
        if (ldata.up) {
            dictatorExtension = Math.min(dictatorExtension, 0)
            pointerExtension = Math.min(pointerExtension, 0)
        } else {
            dictatorExtension = Math.max(dictatorExtension, 0)
            pointerExtension = Math.max(pointerExtension, 0)
        }
        if (dictator + dictatorExtension === targetLine && pointer + pointerExtension === targetLine) {
            return 0
        }
        if (startPos.equals(endPos)) {
            return 0
        }

        const slopeConstrained = BeamTremoloLayout.getSlopeConstraint(ldata, startPos, endPos)
        if (slopeConstrained === SlopeConstraint.FLAT) {
            return 0
        } else if (slopeConstrained === SlopeConstraint.SMALL_SLOPE) {
            return dictator > pointer ? -1 : 1
        }

        const maxSlope = BeamTremoloLayout.getMaxSlope(ldata)

        if (ldata.crossStaffBeamPos === CrossStaffBeamPosition.ABOVE || ldata.crossStaffBeamPos === CrossStaffBeamPosition.BELOW) {
            // If the beam is above or below the staff, the slope must follow the staff closest to the beam
            const beamDir = startPos.equals(endPos) ? 0 : (startPos.gt(endPos) ? 1 : -1)
            const closestChordsSize = closestChordsToBeam.length
            const closestStartPos = new NotePosition(closestChordsSize > 0 ? closestChordsToBeam[0].line() : 0,
                                                     closestChordsSize > 0 ? closestChordsToBeam[0].vStaffIdx() : 0)
            const closestEndPos = new NotePosition(closestChordsSize > 0 ? closestChordsToBeam[closestChordsSize - 1].line() : 0,
                                                   closestChordsSize > 0 ? closestChordsToBeam[closestChordsSize - 1].vStaffIdx() : 0)
            const staveClosestToBeamDir = closestStartPos.equals(closestEndPos) ? 0 : (closestStartPos.gt(closestEndPos) ? 1 : -1)

            if (beamDir !== staveClosestToBeamDir && beamDir !== 0 && staveClosestToBeamDir !== 0) {
                return 0
            }
            if (staveClosestToBeamDir === 0 && beamDir !== 0) {
                if (startPos.staff !== endPos.staff) {
                    return Math.abs(beamDir) * (ldata.up ? 1 : -1)
                }
            }
        }

        const interval = Math.min(Math.abs(endPos.line - startPos.line), _maxSlopes.length - 1)
        return Math.min(maxSlope, _maxSlopes[interval]) * (ldata.up ? 1 : -1)
    }

    private static getSlopeConstraint(ldata: BeamBaseLayoutData, startPos: NotePosition, endPos: NotePosition): SlopeConstraint {
        if (ldata.notePositions.length === 0) {
            return SlopeConstraint.NO_CONSTRAINT
        }

        // 0.) a beam with all the same pitches is flat
        if (startPos.equals(endPos)) {
            return SlopeConstraint.FLAT
        } else if (ldata.beamType === BeamType.TREMOLO) {
            return SlopeConstraint.NO_CONSTRAINT
        }

        const elements = ldata.elements
        const notePositions = ldata.notePositions

        // 1.) If there is a note in the middle of the beam more extreme than the ends, the beam is flat
        if (elements.length > 2) {
            if (ldata.up) {
                const higherEnd = npMin(startPos, endPos)
                if (higherEnd.gt(notePositions[0])) {
                    return SlopeConstraint.FLAT // a note is higher in the staff than the highest end
                }
                if (higherEnd.equals(notePositions[0]) && higherEnd.ge(notePositions[1])) {
                    if (higherEnd.gt(notePositions[1])) {
                        return SlopeConstraint.FLAT // a note is higher in the staff than the highest end
                    }

                    const chordCount = elements.length
                    if (chordCount >= 3 && notePositions.length >= 3) {
                        const middleNoteHigherThanHigherEnd = higherEnd.ge(notePositions[2])
                        if (middleNoteHigherThanHigherEnd) {
                            return SlopeConstraint.FLAT // two notes are the same as the highest end
                        }
                        const secondNote = elements[1].isChord() ? elements[1] as Chord : null
                        const secondToLastNote = elements[chordCount - 2].isChord() ? elements[chordCount - 2] as Chord : null
                        const secondNoteSameHeightAsHigherEnd = startPos.lt(endPos) && !!secondNote
                                                                && new NotePosition(secondNote.upLine(), secondNote.vStaffIdx()).equals(higherEnd)
                        const secondToLastNoteSameHeightAsHigherEnd = endPos.line < startPos.line && !!secondToLastNote
                                                                      && new NotePosition(secondToLastNote.upLine(),
                                                                                          secondToLastNote.vStaffIdx()).equals(higherEnd)
                        if (!(secondNoteSameHeightAsHigherEnd || secondToLastNoteSameHeightAsHigherEnd)) {
                            return SlopeConstraint.FLAT // only one note same as higher end, but it is not a neighbor
                        } else {
                            // there is a single note next to the highest one with equivalent height
                            // and they are neighbors. this is our exception, so
                            // the slope may be a max of 0.25.
                            return SlopeConstraint.SMALL_SLOPE
                        }
                    } else {
                        return SlopeConstraint.FLAT // only two notes in entire beam, in this case startNote == endNote
                    }
                }
            } else {
                const lowerEnd = npMax(startPos, endPos)
                if (lowerEnd.lt(notePositions[notePositions.length - 1])) {
                    return SlopeConstraint.FLAT
                }
                if (lowerEnd.equals(notePositions[notePositions.length - 1]) && lowerEnd.le(notePositions[notePositions.length - 2])) {
                    if (lowerEnd.lt(notePositions[notePositions.length - 2])) {
                        return SlopeConstraint.FLAT
                    }
                    const chordCount = elements.length
                    if (chordCount >= 3 && notePositions.length >= 3) {
                        const middleNoteLowerThanLowerEnd = lowerEnd.le(notePositions[notePositions.length - 3])
                        if (middleNoteLowerThanLowerEnd) {
                            return SlopeConstraint.FLAT
                        }
                        const secondNote = elements[1].isChord() ? elements[1] as Chord : null
                        const secondToLastNote = elements[chordCount - 2].isChord() ? elements[chordCount - 2] as Chord : null
                        const secondNotePos = secondNote ? new NotePosition(secondNote.downLine(), secondNote.vStaffIdx())
                            : new NotePosition(0, -1)
                        const secondToLastNotePos = secondToLastNote
                            ? new NotePosition(secondToLastNote.downLine(), secondToLastNote.vStaffIdx()) : new NotePosition(0, -1)
                        const secondNoteSameHeightAsLowerEnd = startPos.line > endPos.line && secondNotePos.equals(lowerEnd)
                        const secondToLastNoteSameHeightAsLowerEnd = endPos.line > startPos.line && secondToLastNotePos.equals(lowerEnd)
                        if (!(secondNoteSameHeightAsLowerEnd || secondToLastNoteSameHeightAsLowerEnd)) {
                            return SlopeConstraint.FLAT
                        } else {
                            return SlopeConstraint.SMALL_SLOPE
                        }
                    } else {
                        return SlopeConstraint.FLAT
                    }
                }
            }
        }
        return SlopeConstraint.NO_CONSTRAINT
    }

    static getMaxSlope(ldata: BeamBaseLayoutData): number {
        // for 2-indexed interval i (seconds, thirds, etc.)
        // maxSlopes[i] = max slope of beam for notes with interval i

        // calculate max slope based on distance between first and last chords
        const endX = BeamTremoloLayout.chordBeamAnchorX(ldata, ldata.elements[ldata.elements.length - 1], ChordBeamAnchorType.Start)
        const startX = BeamTremoloLayout.chordBeamAnchorX(ldata, ldata.elements[0], ChordBeamAnchorType.End)
        let beamWidth = endX - startX
        beamWidth /= ldata.spatium
        let maxSlope: number
        if (beamWidth < 3.0) {
            maxSlope = _maxSlopes[1]
        } else if (beamWidth < 5.0) {
            maxSlope = _maxSlopes[2]
        } else if (beamWidth < 7.5) {
            maxSlope = _maxSlopes[3]
        } else if (beamWidth < 10.0) {
            maxSlope = _maxSlopes[4]
        } else if (beamWidth < 15.0) {
            maxSlope = _maxSlopes[5]
        } else if (beamWidth < 20.0) {
            maxSlope = _maxSlopes[6]
        } else {
            maxSlope = _maxSlopes[7]
        }
        return maxSlope
    }

    static chordBeamAnchorX(ldata: BeamBaseLayoutData, cr: ChordRest, anchorType: ChordBeamAnchorType): number {
        const pagePosX = ldata.trem ? ldata.trem.pagePos().x() : ldata.beam ? ldata.beam.pagePos().x() : 0.0
        let stemPosX = StemLayout.stemPosX(cr) + cr.pagePos().x() - pagePosX

        if (!cr.isChord() || !(cr as Chord).stem()) {
            if (!ldata.up) {
                // rests always return the left side of the stem (?)
                stemPosX -= StemLayout.stemPosX(cr)
            }
            return stemPosX
        }

        const chord = cr as Chord
        const stem = chord.stem()!
        const stemWidth = stem.lineWidthMag()

        switch (anchorType) {
        case ChordBeamAnchorType.Start:
            if (ldata.tab) {
                return stemPosX - 0.5 * stemWidth
            }
            if (chord.up()) {
                return stemPosX - stemWidth
            }
            break
        case ChordBeamAnchorType.Middle:
            if (ldata.tab) {
                return stemPosX
            }
            return chord.up() ? stemPosX - 0.5 * stemWidth : stemPosX + 0.5 * stemWidth
        case ChordBeamAnchorType.End:
            if (ldata.tab) {
                return stemPosX + 0.5 * stemWidth
            }
            if (!chord.up()) {
                return stemPosX + stemWidth
            }
            break
        }

        return stemPosX
    }

    static chordBeamAnchorY(ldata: BeamBaseLayoutData, cr: ChordRest): number {
        if (!cr.isChord()) {
            return cr.pagePos().y()
        }

        const chord = cr as Chord
        const note = cr.up() ? chord.downNote() : chord.upNote()
        const position = note.pagePos()

        const upValue = chord.up() ? -1 : 1
        const beamOffset = ldata.beamWidth / 2 * upValue

        if (ldata.isBesideTabStaff) {
            const stemLength = StemLayout.tabStemLength(chord, ldata.tab!) * (ldata.up ? -1 : 1)
            let y = StemLayout.tabRestStemPosY(chord, ldata.tab!) + stemLength
            y *= ldata.spatium
            y -= beamOffset
            return y + chord.pagePos().y()
        }

        return position.y() - note.offset().y() + (chord.defaultStemLength() * upValue) - beamOffset
    }

    static chordBeamAnchor(ldata: BeamBaseLayoutData, cr: ChordRest, anchorType: ChordBeamAnchorType): PointF {
        return new PointF(BeamTremoloLayout.chordBeamAnchorX(ldata, cr, anchorType), BeamTremoloLayout.chordBeamAnchorY(ldata, cr))
    }
}
