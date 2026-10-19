/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/stemlayout.h/.cpp
 * (C++ int arithmetic is reproduced with Math.trunc)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsEqualOrMore } from '../../../framework/global/realfn'
import { Sid } from '../../style/styledef'
import { DurationType } from '../../types/types'
import { INVALID_LINE } from '../../dom/note'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Rest } from '../../dom/rest'
import type { StaffType } from '../../dom/stafftype'
import type { LayoutContext } from './layoutcontext'

const trunc = Math.trunc

// TablatureMinimStyle::SHORTER
const TAB_MINIM_SHORTER = 1

export class StemLayout {
    // all in spatium units
    static readonly STAFFTYPE_TAB_DEFAULTSTEMLEN_UP = 3.0
    static readonly STAFFTYPE_TAB_DEFAULTSTEMDIST_UP = 1.0
    static readonly STAFFTYPE_TAB_DEFAULTSTEMPOSY_UP = -StemLayout.STAFFTYPE_TAB_DEFAULTSTEMDIST_UP
    static readonly STAFFTYPE_TAB_DEFAULTSTEMLEN_DN = 3.0
    static readonly STAFFTYPE_TAB_DEFAULTSTEMDIST_DN = 1.0
    static readonly STAFFTYPE_TAB_DEFAULTSTEMPOSY_DN = StemLayout.STAFFTYPE_TAB_DEFAULTSTEMDIST_DN
    static readonly STAFFTYPE_TAB_DEFAULTSTEMLEN_THRU = 3.5
    static readonly STAFFTYPE_TAB_DEFAULTSTEMPOSX = 0.75
    // the ratio between the length of a full stem and the length of a short stem
    static readonly STAFFTYPE_TAB_SHORTSTEMRATIO = 0.5

    //-----------------------------------------------------------------------------
    //   defaultStemLength
    ///   Get the default stem length for this chord
    ///   all internal calculation is done in quarter spaces
    ///   using integers to eliminate all possibilities for rounding errors
    //-----------------------------------------------------------------------------

    static calcDefaultStemLength(item: Chord, ctx: LayoutContext): number {
        // returns default length even if the chord doesn't have a stem
        const style = ctx.conf().style()
        const ldata = item.ldata()
        const staff = item.staff()
        const spatium = item.spatium()
        let lineDistance = staff ? staff.lineDistance(item.tick()) : 1.0

        const staffType = staff ? staff.staffTypeForElement(item) : null
        const tab = (staffType && staffType.isTabStaff()) ? staffType : null

        const isBesideTabStaff = !!tab && !tab.stemless() && !tab.stemThrough()
        if (isBesideTabStaff) {
            return StemLayout.tabStemLength(item, tab!) * spatium
        }

        let defaultStemLength = trunc(style.styleD(Sid.stemLength) * 4)
        defaultStemLength += StemLayout.stemLengthBeamAddition(item, ctx)
        if (tab) {
            defaultStemLength = trunc(defaultStemLength * 1.5)
        }
        // extraHeight represents the extra vertical distance between notehead and stem start
        // eg. slashed noteheads etc
        const extraHeight = (ldata.up ? item.upNote().stemUpSE().y() : item.downNote().stemDownNW().y()) / item.intrinsicMag()
                            / spatium
        const shortestStem = style.styleB(Sid.useWideBeams) ? 12 : trunc((style.styleD(Sid.shortestStem) + Math.abs(extraHeight)) * 4)
        const quarterSpacesPerLine = Math.floor(lineDistance * 2)
        const chordHeight = (item.downLine() - item.upLine()) * quarterSpacesPerLine // convert to quarter spaces
        let stemLength = defaultStemLength

        const minStemLengthQuarterSpaces = StemLayout.calcMinStemLength(item, ctx)
        const staffLineCount = staff ? staff.lines(item.tick()) : 5
        const shortStemStart = style.styleI(Sid.shortStemStartLocation) * quarterSpacesPerLine + 1
        const useWideBeams = style.styleB(Sid.useWideBeams)
        const beamCount = StemLayout.calcBeamCount(item)
        const middleLine = StemLayout.minStaffOverlap(ldata.up, staffLineCount, beamCount, !!item.hook(), useWideBeams ? 4 : 3,
                                                      useWideBeams, !(item.isGrace() || item.isSmall()))
        let idealStemLength = defaultStemLength

        if (ldata.up) {
            const stemEndPosition = item.upLine() * quarterSpacesPerLine - defaultStemLength
            const stemEndPositionMag = item.upLine() * quarterSpacesPerLine - (defaultStemLength * item.intrinsicMag())
            if (stemEndPositionMag <= -shortStemStart) {
                const reduction = StemLayout.maxReduction(item, ctx, Math.abs(Math.floor(stemEndPositionMag) + shortStemStart))
                idealStemLength = Math.max(idealStemLength - reduction, shortestStem)
            } else if (stemEndPosition > middleLine) {
                // this case will be taken care of below; even if we were to adjust here we'd have
                // to adjust again later if the line spacing != 1.0 or if _relativeMag != 1.0
            } else {
                idealStemLength -= StemLayout.stemOpticalAdjustment(item, stemEndPosition)
                idealStemLength = Math.max(idealStemLength, shortestStem)
            }
            stemLength = Math.max(idealStemLength, minStemLengthQuarterSpaces)
        } else {
            const stemEndPosition = item.downLine() * quarterSpacesPerLine + defaultStemLength
            const stemEndPositionMag = item.downLine() * quarterSpacesPerLine + (defaultStemLength * item.intrinsicMag())
            const downShortStemStart = (staffLineCount - 1) * (2 * quarterSpacesPerLine) + shortStemStart
            if (stemEndPositionMag >= downShortStemStart) {
                const reduction = StemLayout.maxReduction(item, ctx, Math.abs(Math.ceil(stemEndPositionMag) - downShortStemStart))
                idealStemLength = Math.max(idealStemLength - reduction, shortestStem)
            } else if (stemEndPosition < middleLine) {
                // this case will be taken care of below; even if we were to adjust here we'd have
                // to adjust again later if the line spacing != 1.0 or if _relativeMag != 1.0
            } else {
                idealStemLength -= StemLayout.stemOpticalAdjustment(item, stemEndPosition)
                idealStemLength = Math.max(idealStemLength, shortestStem)
            }
            stemLength = Math.max(idealStemLength, minStemLengthQuarterSpaces)
        }
        if (beamCount === 4 && !item.hook()) {
            stemLength = StemLayout.calc4BeamsException(item, stemLength)
        }

        const finalStemLength = (chordHeight / 4.0 * spatium) + ((stemLength / 4.0 * spatium) * item.intrinsicMag())
        let extraLength = 0.0
        const startNote = ldata.up ? item.downNote() : item.upNote()
        if (!startNote.fixed()) {
            // when the chord's magnitude is < 1, the stem length with mag can find itself below the middle line.
            // in those cases, we have to add the extra amount to it to bring it to a minimum.
            const upValue = ldata.up ? -1.0 : 1.0
            const stemStart = startNote.ldata().pos().y()
            const stemEndMag = stemStart + (finalStemLength * upValue)
            const topLine = 0.0
            lineDistance *= spatium
            const bottomLine = lineDistance * (staffLineCount - 1.0)
            let target = 0.0
            const midLine = middleLine / 4.0 * lineDistance
            if (RealIsEqualOrMore(lineDistance / spatium, 1.0)) {
                // need to extend to middle line, or to opposite line if staff is < 2sp tall
                if (bottomLine < 2 * spatium) {
                    target = ldata.up ? topLine : bottomLine
                } else {
                    const twoSpIn = ldata.up ? bottomLine - (2 * spatium) : topLine + (2 * spatium)
                    target = RealIsEqual(lineDistance / spatium, 1.0) ? midLine : twoSpIn
                }
            } else {
                // need to extend to second line in staff, or to opposite line if staff has < 3 lines
                if (staffLineCount < 3) {
                    target = ldata.up ? topLine : bottomLine
                } else {
                    target = ldata.up ? bottomLine - (2 * lineDistance) : topLine + (2 * lineDistance)
                }
            }
            extraLength = 0.0
            if (ldata.up && stemEndMag > target) {
                extraLength = stemEndMag - target
            } else if (!ldata.up && stemEndMag < target) {
                extraLength = target - stemEndMag
            }
        }
        return finalStemLength + extraLength
    }

    static minStaffOverlap(up: boolean, staffLines: number, beamCount: number, hasHook: boolean, beamSpacing: number,
                           useWideBeams: boolean, isFullSize: boolean): number {
        let beamOverlap = 8
        if (isFullSize) {
            if (beamCount === 3 && !hasHook) {
                beamOverlap = 12
            } else if (beamCount >= 4 && !hasHook) {
                beamOverlap = trunc((beamCount - 4) * beamSpacing + (useWideBeams ? 16 : 14))
            }
        }

        const staffLineOffset = isFullSize ? 1 : 4
        const staffOverlap = Math.min(beamOverlap, (staffLines - staffLineOffset) * 4)
        if (!up) {
            return staffOverlap
        }
        return (staffLines - 1) * 4 - staffOverlap
    }

    static stemPosX(item: ChordRest): number {
        return item.isChord() ? StemLayout.chordStemPosX(item as Chord) : StemLayout.restStemPosX(item as Rest)
    }

    static chordStemPosX(item: Chord): number {
        const staffType = item.staffType()
        if (!staffType || !staffType.isTabStaff()) {
            const up = item.ldata().up
            const refNote = up ? item.upNote() : item.downNote()
            const stemAttach = up ? refNote.stemUpSE() : refNote.stemDownNW()
            if (stemAttach.isNull()) {
                return up ? item.noteHeadWidth() : 0.0
            }
            const noteWidthOffset = up ? (refNote.headBodyWidth() - item.noteHeadWidth()) : 0.0
            return stemAttach.x() - noteWidthOffset
        }

        const refNote = item.ldata().up ? item.upNote() : item.downNote()
        let xPos = refNote.pos().x() + 0.5 * refNote.width()
        if (item.isGraceBendEnd()) {
            const graceBefore = item.graceNotesBefore()
            const grace = graceBefore.empty() ? null : graceBefore.front()
            if (grace) {
                xPos += grace.pos().x()
            }
        }
        return xPos
    }

    static restStemPosX(item: Rest): number {
        if (item.ldata().up) {
            return item.ldata().bbox().right()
        }
        return item.ldata().bbox().left()
    }

    static stemPos(item: ChordRest): PointF {
        return item.isChord() ? StemLayout.chordStemPos(item as Chord) : item.pagePos()
    }

    static chordStemPos(item: Chord): PointF {
        const staff = item.staff()
        const staffType = staff ? staff.staffTypeForElement(item) : null
        if (staffType && staffType.isTabStaff()) {
            return item.pagePos().plus(StemLayout.tabStemPos(item, staffType).times(item.spatium()))
        }
        if (item.ldata().up) {
            const downNote = item.downNote()
            const nhw = item.notes().length === 1 ? downNote.bboxRightPos() : item.noteHeadWidth()
            return item.pagePos().plus(new PointF(nhw, downNote.pos().y()))
        }
        return item.pagePos().plus(new PointF(0.0, item.upNote().pos().y()))
    }

    //---------------------------------------------------------
    //   tabRestStemPosY
    //          returns the vertical position of stem start point
    //    NOTE: unit: spatium, position: relative to chord
    //---------------------------------------------------------

    static tabRestStemPosY(item: ChordRest, st: StaffType): number {
        if (st.stemThrough()) { // does not make sense for "stems through staves" setting; just return top line vert. position
            return 0.0
        }

        // if stems beside staff, position are fixed, but take into account delta for half notes
        let delta = (st.minimStyle() !== TAB_MINIM_SHORTER || item.durationType().type() !== DurationType.V_HALF)
            ? 0.0
            : (item.up() ? -StemLayout.STAFFTYPE_TAB_DEFAULTSTEMLEN_UP : StemLayout.STAFFTYPE_TAB_DEFAULTSTEMLEN_DN) * 0.5
        // if fret marks above lines and chordRest is up, move half a line distance up
        if (!st.onLines() && item.up()) {
            delta -= st.lineDistance().val() * 0.5
        }
        return (item.up() ? StemLayout.STAFFTYPE_TAB_DEFAULTSTEMPOSY_UP
            : (st.lines() - 1) * st.lineDistance().val() + StemLayout.STAFFTYPE_TAB_DEFAULTSTEMPOSY_DN) + delta
    }

    static tabStemLength(item: Chord, st: StaffType): number {
        // if stems are through staff, length should be computed by relevant chord algorithm;
        // here, just return default length (= 1 'octave' = 3.5 line spaces)
        if (st.stemThrough()) {
            return StemLayout.STAFFTYPE_TAB_DEFAULTSTEMLEN_THRU * st.lineDistance().val()
        }
        // if stems beside staff, length is fixed, but take into account shorter half note stems
        const shrt = (st.minimStyle() === TAB_MINIM_SHORTER) && (item.durationType().type() === DurationType.V_HALF)
        const stemLen = (st.stemsDown() ? StemLayout.STAFFTYPE_TAB_DEFAULTSTEMLEN_DN : StemLayout.STAFFTYPE_TAB_DEFAULTSTEMLEN_UP)
                        * (shrt ? StemLayout.STAFFTYPE_TAB_SHORTSTEMRATIO : 1.0) * (item.style().styleB(Sid.useWideBeams) ? 1.25 : 1.0)
        // scale length by scale of parent chord, but relative to scale of context staff
        return stemLen * item.mag() / item.staff()!.staffMag(item.tick())
    }

    static tabStemPosX(): number { return StemLayout.STAFFTYPE_TAB_DEFAULTSTEMPOSX }

    static tabStemPos(item: Chord, st: StaffType): PointF {
        let y: number
        if (st.stemThrough()) {
            // if stems are through staff, stem goes from farthest note string
            // TODO(port): Chord::upString()/downString() (upside-down tab staves)
            y = (item.up() ? item.downNote().string() : item.upNote().string()) * st.lineDistance().val()
        } else {
            // if stems are beside staff, stem start point has a fixed vertical position,
            // according to TAB parameters and stem up/down
            y = StemLayout.tabRestStemPosY(item, st)
        }
        return new PointF(0.5 * item.score().noteHeadWidth() * item.mag() / item.spatium(), y)
    }

    private static stemLengthBeamAddition(item: Chord, ctx: LayoutContext): number {
        if (item.hook()) {
            return 0
        }
        const beamCount = StemLayout.calcBeamCount(item)
        switch (beamCount) {
        case 0:
        case 1:
        case 2:
            return 0
        case 3:
            return 2
        default:
            return (beamCount - 3) * (ctx.conf().styleB(Sid.useWideBeams) ? 4 : 3)
        }
    }

    private static readonly maxReductions: readonly (readonly number[])[] = [
        //1sp 1.5sp 2sp 2.5sp >=3sp -- extensionOutsideStaff
        [1, 2, 3, 4, 4], // 0 beams
        [0, 1, 2, 3, 3], // 1 beam
        [0, 1, 1, 1, 1], // 2 beams
        [0, 0, 0, 1, 1], // 3 beams
    ]

    private static maxReduction(item: Chord, ctx: LayoutContext, extensionOutsideStaff: number): number {
        if (!ctx.conf().styleB(Sid.shortenStem)) {
            return 0
        }
        let beamCount = 0
        if (!item.hook()) {
            beamCount = StemLayout.calcBeamCount(item)
        }
        const hasTradHook = !!item.hook() && !ctx.conf().styleB(Sid.useStraightNoteFlags)
        if (item.hook() && !hasTradHook) {
            beamCount = Math.min(beamCount, 2) // the straight glyphs extend outwards after 2 beams
        }
        if (beamCount >= 4) {
            return 0
        }
        let extensionHalfSpaces = Math.floor(extensionOutsideStaff / 2.0)
        extensionHalfSpaces = Math.min(extensionHalfSpaces, 4)
        let reduction = StemLayout.maxReductions[beamCount][extensionHalfSpaces]
        if (item.intrinsicMag() < 1) {
            // there is an exception for grace-sized stems with hooks.
            // reducing by the full amount puts the hooks too low. Limit reduction to 0.5sp
            if (hasTradHook) {
                reduction = Math.min(reduction, 1)
            }
        } else {
            // there are a few exceptions for normal-sized (non-grace) beams
            if (beamCount === 1 && extensionHalfSpaces < 2) {
                // 1) if the extension is less than 1sp above or below the staff, they've been adjusted
                //    already to play nicely with staff lines. Reduce by 1sp.
                reduction = 2
            } else if (beamCount === 3 && extensionHalfSpaces === 3) {
                // 2) if there are three beams and it extends 1.5sp above or below the staff, we need to
                //    *extend* the stem rather than reduce it.
                reduction = 0
            }
            if (hasTradHook) {
                reduction = Math.min(reduction, 1)
            } else if (item.hook() && item.beams() > 2) {
                reduction += 1
            }
        }
        return reduction
    }

    private static stemOpticalAdjustment(item: Chord, stemEndPosition: number): number {
        if (item.hook() && !item.beam()) {
            return 0
        }
        const beamCount = StemLayout.calcBeamCount(item)
        if (beamCount === 0 || beamCount > 2) {
            return 0
        }
        // C++ fmod keeps the sign of the dividend
        const isOnEvenLine = ((stemEndPosition + 4) % 4) === 2
        if (isOnEvenLine) {
            return 1
        }
        return 0
    }

    private static calcMinStemLength(item: Chord, ctx: LayoutContext): number {
        let minStemLength = 0 // in quarter spaces
        const spatium = item.spatium()
        const ldata = item.ldata()
        const staff = item.staff()!

        // TODO(port): TremoloSingleChord is not ported; this is its interface as used here
        const tremolo = item.tremoloSingleChord() as unknown as { isBuzzRoll(): boolean, minHeight(): number } | null
        if (tremolo) {
            // buzz roll's height is actually half of the visual height,
            // so we need to multiply it by 2 to get the actual height
            const buzzRollMultiplier = tremolo.isBuzzRoll() ? 2 : 1
            minStemLength += Math.ceil(tremolo.minHeight() / item.intrinsicMag() * 4.0 * buzzRollMultiplier)
            const outSidePadding = trunc(ctx.conf().styleMM(Sid.tremoloOutSidePadding) / spatium * 4.0)
            const noteSidePadding = trunc(ctx.conf().styleMM(Sid.tremoloNoteSidePadding) / spatium * 4.0)

            let outsideStaffOffset = 0
            if (!staff.isTabStaff(item.tick())) {
                const lineNote = ldata.up ? item.upNote() : item.downNote()
                if (lineNote.line() === INVALID_LINE) {
                    lineNote.updateLine()
                }

                let line = lineNote.line()
                line *= 2 // convert to quarter spaces
                if (!ldata.up && line < -2) {
                    outsideStaffOffset = -line
                } else if (ldata.up && line > staff.lines(item.tick()) * 4) {
                    outsideStaffOffset = line - (staff.lines(item.tick()) * 4) + 4
                }
            }
            minStemLength += (outSidePadding + Math.max(noteSidePadding, outsideStaffOffset))

            const hook = item.hook()
            if (hook) {
                const straightFlags = ctx.conf().styleB(Sid.useStraightNoteFlags)
                const smuflAnchor = hook.smuflAnchor().y() * (ldata.up ? 1 : -1)
                let hookOffset = Math.floor((hook.height() / item.intrinsicMag() + smuflAnchor) / spatium * 4) - (straightFlags ? 0 : 2)
                // some fonts have hooks that extend very far down (making the height of the hook very large)
                // so we constrain to a reasonable maximum for hook length
                hookOffset = Math.min(hookOffset, 11)
                let cutout = ldata.up ? 5 : 7
                if (straightFlags) {
                    // don't need cutout for straight flags (they are similar to beams)
                    cutout = 0
                } else if (item.beams() >= 2) {
                    // beams greater than two extend outwards and thus don't factor into the cutout
                    cutout -= 2
                }
                minStemLength += hookOffset - cutout
            }
        }
        if (item.beam() || item.tremoloTwoChord()) {
            const beamCount = StemLayout.calcBeamCount(item)
            const minInnerStemLengths = [10, 9, 8, 7]
            const innerStemLength = minInnerStemLengths[Math.min(beamCount, 3)]
            const beamsHeight = beamCount * (ctx.conf().styleB(Sid.useWideBeams) ? 4 : 3) - 1
            let newMinStemLength = Math.max(minStemLength, innerStemLength)
            newMinStemLength += beamsHeight
            // for 4+ beams, there are a few situations where we need to lengthen the stem by 1
            const noteLine = item.line()
            const staffLines = staff.lines(item.tick())
            const noteInStaff = (ldata.up && noteLine > 0) || (!ldata.up && noteLine < (staffLines - 1) * 2)
            if (beamCount >= 4 && noteInStaff) {
                newMinStemLength++
            }
            minStemLength = Math.max(minStemLength, newMinStemLength)
        }
        return minStemLength
    }

    private static calc4BeamsException(item: Chord, stemLength: number): number {
        const ldata = item.ldata()
        let difference = 0
        const staffLines = (item.staff()!.lines(item.tick()) - 1) * 2
        if (ldata.up && item.upNote().line() > staffLines) {
            difference = item.upNote().line() - staffLines
        } else if (!ldata.up && item.downNote().line() < 0) {
            difference = Math.abs(item.downNote().line())
        }

        switch (difference) {
        case 2:
            return Math.max(stemLength, 21)
        case 3:
        case 4:
            return Math.max(stemLength, 23)
        default:
            return stemLength
        }
    }

    private static calcBeamCount(item: Chord): number {
        const trem = item.tremoloTwoChord() as unknown as { lines(): number } | null // TODO(port): TremoloTwoChord
        return (trem ? trem.lines() : 0) + (item.beam() ? item.beams() : 0)
    }
}
