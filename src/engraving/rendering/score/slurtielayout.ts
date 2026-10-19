/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/slurtielayout.h/.cpp
 *
 * TODO(port): tapping half slurs, guitar bends on tab
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { PainterPath } from '../../../framework/draw/types/painterpath'
import { Transform } from '../../../framework/draw/types/transform'
import { RealIsEqualOrMore, RealIsNull, clamp, stdRound } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { SmuflAnchorId, SymId } from '../../types/symid'
import { DirectionV, ElementType, NoteHeadGroup, SlurStyleType, SpannerSegmentType, TieDotsPlacement, TiePlacement, TimeSigPlacement, VOICES, isUpVoice,
    staff2track, BarLineType, type staff_idx_t } from '../../types/types'
import { Shape, ShapeType, type ShapeElement } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { Grip } from '../../editing/editdata'
import { CubicBezier, type SlurTieSegment } from '../../dom/slurtie'
import { SegmentType, type Segment } from '../../dom/segment'
import type { SpannerSegment } from '../../dom/spanner'
import type { Accidental } from '../../dom/accidental'
import type { Articulation } from '../../dom/articulation'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Measure } from '../../dom/measure'
import type { Note } from '../../dom/note'
import type { Slur, SlurSegment } from '../../dom/slur'
import type { System } from '../../dom/system'
import type { Tie, TieSegment } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'
import { StemLayout } from './stemlayout'
import { ShowTiedFret } from '../../dom/stafftype'
import { TremoloLayout } from './tremololayout'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Ornament } from '../../dom/ornament'
import type { LaissezVib, LaissezVibSegment } from '../../dom/laissezvib'
import type { PartialTie, PartialTieSegment } from '../../dom/partialtie'
import type { BarLine } from '../../dom/barline'

class SlurTiePos {
    p1 = new PointF() // start point of slur
    system1: System | null = null // start system of slur
    p2 = new PointF() // end point of slur
    system2: System | null = null // end system of slur
}

/** dom/utils.cpp compareNotesPos */
function compareNotesPos(n1: Note, n2: Note): number {
    if (n1.line() !== n2.line() && !(n1.staffType()!.isTabStaff())) {
        return n2.line() - n1.line()
    } else if (n1.string() !== n2.string()) {
        return n2.string() - n1.string()
    } else {
        return n1.pitch() - n2.pitch()
    }
}

const IGNORED_TYPES_FOR_TIE_X = new Set<ElementType>([
    ElementType.HOOK,
    ElementType.STEM_SLASH,
    ElementType.LEDGER_LINE,
    ElementType.LYRICS,
    ElementType.HARMONY,
    ElementType.FRET_DIAGRAM,
])

export class SlurTieLayout {
    static layoutSystem(item: Slur, system: System, ctx: LayoutContext): SpannerSegment | null {
        const horizontalTieClearance = 0.35 * item.spatium()
        const tieClearance = 0.65 * item.spatium()
        const continuedSlurOffsetY = item.spatium() * 0.4
        const continuedSlurMaxDiff = 2.5 * item.spatium()
        const stick = system.firstMeasure()!.tick()
        const etick = system.lastMeasure()!.endTick()

        const slurSegment = TLayout.getNextLayoutSystemSegment(item, system, (parent) => item.newSlurTieSegment(parent)) as SlurSegment

        let sst: SpannerSegmentType
        if (item.tick().ge(stick)) {
            //
            // this is the first call to layoutSystem,
            // processing the first line segment
            //
            if (item.track2() === -1) {
                item.setTrack2(item.track())
            }
            if (!item.startCR() || !item.startCR()!.measure()) {
                return slurSegment
            }
            if (!item.endCR()) { // sanity check
                item.setEndElement(item.startCR())
                item.setTick2(item.tick())
            }
            SlurTieLayout.computeUp(item, ctx)
            sst = item.tick2().lt(etick) ? SpannerSegmentType.SINGLE : SpannerSegmentType.BEGIN
        } else if (item.tick().lt(stick) && item.tick2().ge(etick)) {
            sst = SpannerSegmentType.MIDDLE
        } else {
            sst = SpannerSegmentType.END
        }
        slurSegment.setSpannerSegmentType(sst)

        const sPos = new SlurTiePos()
        SlurTieLayout.slurPos(item, sPos, ctx)

        let p1 = sPos.p1.clone()
        let p2 = sPos.p2.clone()
        let constrainLeftAnchor = false

        // start anchor, either on the start chordrest or at the beginning of the system
        const incomingPartialSlur = item.isIncoming()
        const outgoingPartialSlur = item.isOutgoing()
        const startCR = item.startCR()!
        if ((sst === SpannerSegmentType.SINGLE || sst === SpannerSegmentType.BEGIN) && !incomingPartialSlur) {
            const sc = startCR.isChord() ? startCR as Chord : null

            // on chord
            if (sc) {
                let tie = (item.up() ? sc.upNote() : sc.downNote()).tieFor()
                let endPoint = new PointF()
                if (tie && (tie.isInside() || tie.up() !== item.up() || SlurTieLayout.tieSegmentShouldBeSkipped(tie))) {
                    // ignore ties that won't affect the slur
                    tie = null
                }
                if (tie && !tie.segmentsEmpty()) {
                    endPoint = (tie.segmentAt(0) as TieSegment).ups(Grip.START).pos()
                }
                let adjustedVertically = false
                if (tie) {
                    if (item.up() && tie.up()) {
                        if (endPoint.y() - p1.y() < tieClearance) {
                            p1.setY(endPoint.y() - tieClearance)
                            adjustedVertically = true
                        }
                    } else if (!item.up() && !tie.up()) {
                        if (p1.y() - endPoint.y() < tieClearance) {
                            p1.setY(endPoint.y() + tieClearance)
                            adjustedVertically = true
                        }
                    }
                }
                const tieBack = sc.upNote().tieBack()
                if (!adjustedVertically && tieBack && (!tieBack.isInside() || tieBack.isPartialTie())
                    && tieBack.up() === item.up() && !SlurTieLayout.tieSegmentShouldBeSkipped(tieBack)) {
                    // there is a tie that ends on this chordrest
                    tie = tieBack
                    if (!tie.segmentsEmpty()) {
                        endPoint = (tie.segmentAt(tie.nsegments() - 1) as TieSegment).ups(Grip.END).pos()
                        if (Math.abs(endPoint.y() - p1.y()) < tieClearance) {
                            p1.setX(p1.x() + horizontalTieClearance)
                        }
                    }
                }
            }
        } else if (sst === SpannerSegmentType.END || sst === SpannerSegmentType.MIDDLE || incomingPartialSlur) {
            // beginning of system
            const measure = startCR.measure()!
            const firstCr = incomingPartialSlur ? measure.firstChordRest(item.track()) : system.firstChordRest(item.track2())
            const sameStaff = !!firstCr && firstCr.vStaffIdx() === slurSegment.vStaffIdx()
            let y = p1.y()
            if (firstCr && firstCr === item.endCR()) {
                constrainLeftAnchor = true
            }
            if (firstCr && firstCr.isChord() && sameStaff) {
                const chord = firstCr as Chord
                const chordShape = chord.shape()
                chordShape.removeTypes(new Set([ElementType.ACCIDENTAL]))
                y = item.up() ? chordShape.top() : chordShape.bottom()
                const isAboveStem = !!chord.stem() && chord.up() === item.up()
                if (!isAboveStem) {
                    y += continuedSlurOffsetY * (item.up() ? -1 : 1)
                }
            }
            const segmentX = incomingPartialSlur ? measure.firstNoteRestSegmentX(true) : system.firstNoteRestSegmentX(true)
            p1 = new PointF(segmentX, y)

            // adjust for ties at the end of the system
            const cr = incomingPartialSlur ? measure.firstChordRest(item.track()) : system.firstChordRest(item.track())
            const tieSameStaff = !!cr && cr.vStaffIdx() === item.staffIdx()

            if (cr && cr.isChord() && cr.tick().ge(stick) && cr.tick().le(etick) && tieSameStaff) {
                // TODO: can this be done for all chordrests? Or only the first?
                const c = cr as Chord
                let tie: Tie | null = null
                let endPoint = new PointF()
                const tieBack = c.upNote().tieBack()
                if (tieBack && (tieBack.isPartialTie() || !tieBack.isInside()) && tieBack.up() === item.up()
                    && !SlurTieLayout.tieSegmentShouldBeSkipped(tieBack)) {
                    if (!tieBack.segmentsEmpty()) { //Checks for spanner segment esxists
                        tie = tieBack
                        endPoint = (tie.backSegment() as TieSegment).ups(Grip.START).pos()
                    }
                }
                if (tie) {
                    if (tie.isPartialTie()) {
                        p1.setX(endPoint.x())
                    }
                    if (item.up() && tie.up()) {
                        if (endPoint.y() - p1.y() < tieClearance) {
                            p1.setY(endPoint.y() - tieClearance)
                        }
                    } else if (!item.up() && !tie.up()) {
                        if (p1.y() - endPoint.y() < tieClearance) {
                            p1.setY(endPoint.y() + tieClearance)
                        }
                    }
                }
            }
        }

        // end anchor
        if ((sst === SpannerSegmentType.SINGLE || sst === SpannerSegmentType.END) && !outgoingPartialSlur) {
            const endCR = item.endCR()!
            const ec = endCR.isChord() ? endCR as Chord : null

            // on chord
            if (ec) {
                let tie = (item.up() ? ec.upNote() : ec.downNote()).tieBack()
                let endPoint = new PointF()
                if (tie && (tie.isInside() || tie.up() !== item.up() || SlurTieLayout.tieSegmentShouldBeSkipped(tie))) {
                    tie = null
                }
                let adjustedVertically = false
                if (tie && !tie.segmentsEmpty()) {
                    endPoint = (tie.segmentAt(0) as TieSegment).ups(Grip.END).pos()
                    if (item.up() && tie.up()) {
                        if (endPoint.y() - p2.y() < tieClearance) {
                            p2.setY(endPoint.y() - tieClearance)
                            adjustedVertically = true
                        }
                    } else if (!item.up() && !tie.up()) {
                        if (p2.y() - endPoint.y() < tieClearance) {
                            p2.setY(endPoint.y() + tieClearance)
                            adjustedVertically = true
                        }
                    }
                }
                const tieFor = ec.upNote().tieFor()
                if (!adjustedVertically && tieFor && (tieFor.isPartialTie() || !tieFor.isInside()) && tieFor.up() === item.up()
                    && !SlurTieLayout.tieSegmentShouldBeSkipped(tieFor)) {
                    // there is a tie that starts on this chordrest
                    if (!tieFor.segmentsEmpty()
                        && Math.abs((tieFor.frontSegment() as TieSegment).ups(Grip.START).pos().y() - p2.y()) < tieClearance) {
                        p2.setX(p2.x() - horizontalTieClearance)
                    }
                }
            }
        } else {
            // at end of system
            const measure = item.endCR()!.measure()!
            const lastCr = outgoingPartialSlur ? measure.lastChordRest(item.track()) : system.lastChordRest(item.track())
            let y = p1.y()
            const sameStaff = !!lastCr && lastCr.vStaffIdx() === slurSegment.vStaffIdx()
            if (lastCr && lastCr === item.startCR()) {
                y += 0.25 * item.spatium() * (item.up() ? -1 : 1)
            } else if (lastCr && lastCr.isChord() && sameStaff) {
                const chord = lastCr as Chord
                const chordShape = chord.shape()
                chordShape.removeTypes(new Set([ElementType.ACCIDENTAL]))
                y = item.up() ? chordShape.top() : chordShape.bottom()
                const isAboveStem = !!chord.stem() && chord.up() === item.up()
                if (!isAboveStem) {
                    y += continuedSlurOffsetY * (item.up() ? -1 : 1)
                }
                const diff = item.up() ? y - p1.y() : p1.y() - y
                if (diff > continuedSlurMaxDiff) {
                    y = p1.y() + (y > p1.y() ? continuedSlurMaxDiff : -continuedSlurMaxDiff)
                }
            }

            const endingX = outgoingPartialSlur ? measure.endingXForOpenEndedLines() : system.endingXForOpenEndedLines()
            p2 = new PointF(endingX, y)

            // adjust for ties at the end of the system
            const cr = outgoingPartialSlur ? measure.lastChordRest(item.track()) : system.lastChordRest(item.track())
            const tieSameStaff = !!cr && cr.vStaffIdx() === item.staffIdx()

            if (cr && cr.isChord() && cr.tick().ge(stick) && cr.tick().le(etick) && tieSameStaff) {
                // TODO: can this be done for all chordrests? Or only the first?
                const c = cr as Chord
                let tie: Tie | null = null
                let endPoint = new PointF()
                const tieFor = c.upNote().tieFor()
                if (tieFor && (tieFor.isPartialTie() || !tieFor.isInside()) && tieFor.up() === item.up()
                    && !SlurTieLayout.tieSegmentShouldBeSkipped(tieFor)) {
                    if (!tieFor.segmentsEmpty()) { //Checks is spanner segment exists
                        tie = tieFor
                        endPoint = (tie.segmentAt(0) as TieSegment).ups(Grip.END).pos()
                    }
                    if (outgoingPartialSlur && tie && tie.type() === ElementType.TIE && tie.nsegments() === 1) {
                        const tieSeg = tie.frontSegment() as TieSegment
                        const tieShape = tieSeg.shape().translate(tieSeg.pos())
                        if (item.up() && tie.up()) {
                            endPoint.setY(p2.y() + tieShape.topDistance(p2))
                        } else if (!item.up() && !tie.up()) {
                            endPoint.setY(p2.y() - tieShape.bottomDistance(p2))
                        }
                    }
                }
                if (tie) {
                    if (item.up() && tie.up()) {
                        if (endPoint.y() - p2.y() < tieClearance) {
                            p2.setY(endPoint.y() - tieClearance)
                        }
                    } else if (!item.up() && !tie.up()) {
                        if (p2.y() - endPoint.y() < tieClearance) {
                            p2.setY(endPoint.y() + tieClearance)
                        }
                    }
                }
            }
        }

        if (constrainLeftAnchor) {
            p1.setY(p2.y() + (0.25 * item.spatium() * (item.up() ? -1 : 1)))
        }

        // TODO(port): tapping half slurs

        const isHangingSlur = sst === SpannerSegmentType.BEGIN || sst === SpannerSegmentType.END || incomingPartialSlur
                              || outgoingPartialSlur
        if (isHangingSlur && ctx.conf().styleB(Sid.angleHangingSlursAwayFromStaff)) {
            [p1, p2] = SlurTieLayout.adjustSlurFloatingEndPointAngles(slurSegment, p1, p2, incomingPartialSlur, outgoingPartialSlur)
        }

        SlurTieLayout.layoutSegment(slurSegment, p1, p2)

        return slurSegment
    }

    private static adjustSlurFloatingEndPointAngles(slurSeg: SlurSegment, p1: PointF, p2: PointF, incomingPartial: boolean,
                                                    outgoingPartial: boolean): [PointF, PointF] {
        const startIsHanging = slurSeg.spannerSegmentType() === SpannerSegmentType.END || incomingPartial
        const endIsHanging = slurSeg.spannerSegmentType() === SpannerSegmentType.BEGIN || outgoingPartial
        if (startIsHanging === endIsHanging) {
            return [p1, p2]
        }

        const up = slurSeg.slur().up()
        const heightDiff = 1.0 * slurSeg.spatium()

        if (startIsHanging) {
            const yCur = p1.y()
            p1.setY(up ? Math.min(yCur, p2.y() - heightDiff) : Math.max(yCur, p2.y() + heightDiff))
        } else if (endIsHanging) {
            const yCur = p2.y()
            p2.setY(up ? Math.min(yCur, p1.y() - heightDiff) : Math.max(yCur, p1.y() + heightDiff))
        }
        return [p1, p2]
    }

    //---------------------------------------------------------
    //   slurPos
    //    calculate position of start- and endpoint of slur
    //    relative to System() position
    //---------------------------------------------------------

    private static slurPos(item: Slur, sp: SlurTiePos, ctx: LayoutContext): void {
        Object.assign(item.stemFloated(), { left: false, right: false })
        const _spatium = (item.staffType() ? item.staffType()!.lineDistance().val() : 1.0) * item.spatium()
        const stemSideInset = 0.5
        const stemOffsetX = 0.35
        const beamClearance = 0.35
        const beamAnchorInset = 0.15
        const straightStemXOffset = 0.5 // how far down a straight stem a slur attaches (percent)
        const minOffset = 0.2
        // hack alert!! -- fakeCutout
        // The fakeCutout const describes the slope of a line from the top of the stem to the full width of the hook.
        // this is necessary because hooks don't have SMuFL cutouts
        // Gonville and MuseJazz have really weirdly-shaped hooks compared to Leland and Bravura and Emmentaler,
        // so we need to adjust the slope of our hook-avoidance line. this will be unnecessary when hooks have
        // SMuFL anchors
        const fontFamily = ctx.engravingFont().family()
        const bulkyHook = fontFamily === 'Gonville' || fontFamily === 'MuseJazz'
        const fakeCutoutSlope = bulkyHook ? 1.5 : 1.0

        if (!item.endCR()) {
            sp.p1 = item.startCR()!.pagePos()
            sp.p1.setX(sp.p1.x() + item.startCR()!.width())
            sp.p2 = sp.p1.clone()
            sp.p2.setX(sp.p2.x() + 5 * _spatium)
            sp.system1 = item.startCR()!.measure()!.system()
            sp.system2 = sp.system1
            return
        }

        const useTablature = !!item.staff() && item.staff()!.isTabStaff(item.endCR()!.tick())
        let staffHasStems = true // assume staff uses stems
        let stt = null
        if (useTablature) {
            stt = item.staff()!.staffType(item.tick())
            staffHasStems = stt.stemThrough() // if tab with stems beside, stems do not count for slur pos
        }

        // start and end cr, chord and note
        const scr = item.startCR()!
        const ecr = item.endCR()!
        let sc: Chord | null = null
        let note1: Note | null = null
        if (scr.isChord()) {
            sc = scr as Chord
            note1 = item.up() ? sc.upNote() : sc.downNote()
        }
        let ec: Chord | null = null
        let note2: Note | null = null
        if (ecr.isChord()) {
            ec = ecr as Chord
            note2 = item.up() ? ec.upNote() : ec.downNote()
        }

        sp.system1 = scr.measure()!.system()
        sp.system2 = ecr.measure()!.system()

        if (!sp.system1) {
            return
        }

        sp.p1 = scr.pos().plus(scr.segment()!.pos()).plus(scr.measure()!.pos())
        sp.p2 = ecr.pos().plus(ecr.segment()!.pos()).plus(ecr.measure()!.pos())

        // adjust for grace notes
        if (scr.isGrace()) {
            sp.p1 = sp.p1.plus(scr.parentItem()!.pos())
        }
        if (ecr.isGrace()) {
            sp.p2 = sp.p2.plus(ecr.parentItem()!.pos())
        }

        // adjust for cross-staff
        if (scr.vStaffIdx() !== item.vStaffIdx() && sp.system1) {
            const diff = sp.system1.staff(scr.vStaffIdx())!.y() - sp.system1.staff(item.vStaffIdx())!.y()
            sp.p1.setY(sp.p1.y() + diff)
        }
        if (ecr.vStaffIdx() !== item.vStaffIdx() && sp.system2) {
            const diff = sp.system2.staff(ecr.vStaffIdx())!.y() - sp.system2.staff(item.vStaffIdx())!.y()
            sp.p2.setY(sp.p2.y() + diff)
        }

        // account for notehead if not mirrored
        if (note1 && !note1.ldata().mirror) {
            sp.p1.setX(sp.p1.x() + note1.x())
        }
        if (note2 && !note2.ldata().mirror) {
            sp.p2.setX(sp.p2.x() + note2.x())
        }

        let po = new PointF()

        const stem1 = sc && staffHasStems ? sc.stem() : null
        const stem2 = ec && staffHasStems ? ec.stem() : null

        const NONE = 0
        const STEM = 1
        let sa1 = NONE
        let sa2 = NONE
        if (staffHasStems) {
            if (sc && sc.hook() && sc.up() === item.up()) {
                sa1 = STEM
            }
            if (scr.up() === ecr.up() && scr.up() === item.up()) {
                if (stem1 && !SlurTieLayout.stemSideForBeam(item, true)) {
                    sa1 = STEM
                }
                if (stem2 && !SlurTieLayout.stemSideForBeam(item, false)) {
                    sa2 = STEM
                }
            } else if (ecr.segment()!.system() !== scr.segment()!.system()) {
                // in the case of continued slurs, we anchor to stem when necessary
                if (scr.up() === item.up() && stem1 && !scr.beam()) {
                    sa1 = STEM
                }
                if (ecr.up() === item.up() && stem2 && !ecr.beam()) {
                    sa2 = STEM
                }
            }
        }

        const __up = item.up() ? -1.0 : 1.0
        const hw1 = note1 ? (stt ? note1.tabHeadWidth(stt) : note1.headWidth()) : scr.width() * scr.mag() // if stt == 0, tabHeadWidth()
        const hw2 = note2 ? (stt ? note2.tabHeadWidth(stt) : note2.headWidth()) : ecr.width() * ecr.mag() // defaults to headWidth()
        let pt: PointF
        if (sa1 === STEM) { //sc can't be null
            // place slur starting point at stem end point
            pt = StemLayout.chordStemPos(sc!).minus(sc!.pagePos()).plus(sc!.stem()!.ldata().line.p2())
            if (useTablature) { // in tabs, stems are centred on note:
                pt.setX(hw1 * 0.5 + (note1 ? note1.bboxXShift() : 0.0)) // skip half notehead to touch stem
            }
            let yadj = -stemSideInset * sc!.intrinsicMag()
            yadj *= _spatium * __up
            const offset = Math.max(stemOffsetX * sc!.intrinsicMag(), minOffset)
            pt = pt.plus(new PointF(offset * _spatium, yadj))
            // account for articulations
            pt = SlurTieLayout.fixArticulations(item, pt, sc!, __up, true)
            // adjust for hook
            let fakeCutout = 0.0
            if (!ctx.conf().styleB(Sid.useStraightNoteFlags)) {
                const hook = sc!.hook()
                // regular flags
                if (hook && hook.ldata().bbox().translated(hook.pos()).contains(pt)) {
                    // TODO: in the utopian far future where all hooks have SMuFL cutouts, this fakeCutout business will no
                    // longer be used. for the time being fakeCutout describes a point on the line y=mx+b, out from the top of the stem
                    // where y = yadj, m = fakeCutoutSlope, and x = y/m + fakeCutout
                    fakeCutout = Math.min(0.0, Math.abs(yadj) - (hook.width() / fakeCutoutSlope))
                    pt.setX(StemLayout.chordStemPosX(sc!) - fakeCutout)
                }
            } else {
                const hook = sc!.hook()
                // straight flags
                if (hook && hook.ldata().bbox().translated(hook.pos()).contains(pt)) {
                    const hookWidth = hook.width() * hook.mag()
                    pt.setX((hookWidth * straightStemXOffset) + (hook.pos().x() + sc!.x()))
                    if (item.up()) {
                        pt.setY(sc!.downNote().pos().y() - stem1!.height() - (beamClearance * _spatium * 0.7))
                    } else {
                        pt.setY(sc!.upNote().pos().y() + stem1!.height() + (beamClearance * _spatium * 0.7))
                    }
                }
            }
            sp.p1 = sp.p1.plus(pt)
        }
        if (sa2 === STEM) { //ec can't be null
            pt = StemLayout.chordStemPos(ec!).minus(ec!.pagePos()).plus(ec!.stem()!.ldata().line.p2())
            if (useTablature) {
                pt.setX(hw2 * 0.5)
            }
            // don't allow overlap with beam
            let yadj: number
            const ecBeam = ec!.beam()
            if (ecBeam && ecBeam.elements()[0] !== ec) {
                yadj = 0.75
            } else if (ec!.tremoloTwoChord() && ec!.tremoloTwoChord()!.chord2() === ec) {
                yadj = 0.75
            } else {
                yadj = -stemSideInset
            }
            yadj *= _spatium * __up
            const offset = Math.max(stemOffsetX * ec!.intrinsicMag(), minOffset)
            pt = pt.plus(new PointF(-offset * _spatium, yadj))
            // account for articulations
            pt = SlurTieLayout.fixArticulations(item, pt, ec!, __up, true)
            sp.p2 = sp.p2.plus(pt)
        }

        //
        // default position:
        //    horizontal: middle of notehead
        //    vertical:   _spatium * .4 above/below notehead
        //
        //------p1
        // Compute x0, y0 and stemPos
        if (sa1 === NONE || sa2 === NONE) { // need stemPos if sa2 == SlurAnchor::NONE
            let stemPos = false // p1 starts at chord stem side

            // default positions
            po.setX(hw1 * 0.5 + (note1 ? note1.bboxXShift() : 0.0))
            if (note1) {
                po.setY(note1.pos().y())
            } else if (item.up()) {
                po.setY(scr.ldata().bbox().top())
            } else {
                po.setY(scr.ldata().bbox().top() + scr.height())
            }
            const offset = useTablature ? 0.75 : 0.9
            po.setY(po.y() + scr.intrinsicMag() * _spatium * offset * __up)

            // adjustments for stem and/or beam
            const trem = sc ? sc.tremoloTwoChord() : null
            if (stem1 || trem) { //sc not null
                const beam1 = sc!.beam()
                const beam1Elements = beam1 ? beam1.elements() : []
                if (stem1 && beam1 && (beam1Elements[beam1Elements.length - 1] !== sc) && (sc!.up() === item.up())) {
                    // start chord is beamed but not the last chord of beam group
                    // and slur direction is same as start chord (stem side)

                    // in these cases, layout start of slur to stem
                    TLayout.layoutBeam(beam1, ctx)
                    const beamWidthSp = ctx.conf().styleS(Sid.beamWidth).val() * beam1.magS()
                    const offset2 = Math.max(beamClearance * sc!.intrinsicMag(), minOffset) * _spatium
                    const sh = stem1.length() + (beamWidthSp / 2) + offset2
                    if (item.up()) {
                        po.setY(StemLayout.chordStemPos(sc!).y() - sc!.pagePos().y() - sh)
                    } else {
                        po.setY(StemLayout.chordStemPos(sc!).y() - sc!.pagePos().y() + sh)
                    }
                    po.setX(StemLayout.chordStemPosX(sc!) + (beamAnchorInset * _spatium * sc!.intrinsicMag()) + (stem1.lineWidthMag() / 2 * __up))

                    // account for articulations
                    po = SlurTieLayout.fixArticulations(item, po, sc!, __up, true)

                    // force end of slur to layout to stem as well,
                    // if start and end chords have same stem direction
                    stemPos = true
                } else if (trem && trem.chord2() !== sc && sc!.up() === item.up()) {
                    TremoloLayout.layoutTwoChord(trem, ctx)
                    const note = item.up() ? sc!.upNote() : sc!.downNote()
                    const stemHeight = stem1 ? stem1.length() : SlurTieLayout.defaultStemLengthStart(trem)
                    const offset2 = Math.max(beamClearance * sc!.intrinsicMag(), minOffset) * _spatium
                    const sh = stemHeight + offset2

                    if (item.up()) {
                        po.setY(StemLayout.chordStemPos(sc!).y() - sc!.pagePos().y() - sh)
                    } else {
                        po.setY(StemLayout.chordStemPos(sc!).y() - sc!.pagePos().y() + sh)
                    }
                    if (!stem1) {
                        po.setX(note.noteheadCenterX())
                    } else {
                        po.setX(StemLayout.chordStemPosX(sc!) + (beamAnchorInset * _spatium * sc!.intrinsicMag())
                                + (stem1.lineWidthMag() / 2.0 * __up))
                    }
                    po = SlurTieLayout.fixArticulations(item, po, sc!, __up, true)

                    stemPos = true
                } else {
                    // start chord is not beamed or is last chord of beam group
                    // or slur direction is opposite that of start chord

                    // at this point slur is in default position relative to note on slur side
                    // but we may need to make further adjustments

                    // if slur and stem are on same side and the chord has more than one note
                    // that is, the start chord has a stem and the slur is on that side
                    const stemOffsetMag = stemOffsetX * sc!.intrinsicMag()
                    if (sc!.up() && item.up()) {
                        if (useTablature) {
                            po.setX(po.x() + stemOffsetMag * _spatium)
                        } else {
                            po.setX(hw1 + _spatium * stemOffsetMag)
                        }
                    }

                    // TODO: offset start position if there is another slur ending on this cr

                    if ((sc!.up() !== ecr.up()) && (sc!.up() === item.up())) {
                        // stem on start chord is on slur side, but stem on end chord is opposite slur side
                        item.stemFloated().left = true
                        const n1 = sc!.up() ? sc!.upNote() : sc!.downNote()
                        let n2: Note | null = null
                        if (ec) {
                            n2 = ec.up() ? ec.upNote() : ec.downNote()
                        }
                        let yd = (n2 ? n2.pos().y() : ecr.pos().y()) - n1.pos().y()
                        yd *= 0.5
                        const sh = stem1 ? stem1.height() : 0.0 // limit y move
                        if (item.up() && yd < 0.0) {
                            po.setY(Math.max(po.y() + yd, sc!.downNote().pos().y() - sh - _spatium))
                        } else if (!item.up() && yd > 0.0) {
                            po.setY(Math.min(po.y() + yd, sc!.upNote().pos().y() + sh + _spatium))
                        }

                        // account for articulations
                        po = SlurTieLayout.fixArticulations(item, po, sc!, __up, true)

                        // we may wish to force end to align to stem as well,
                        // if it is in same direction
                        // (but it won't be, so this assignment should have no effect)
                        stemPos = true
                    } else {
                        // avoid articulations
                        po = SlurTieLayout.fixArticulations(item, po, sc!, __up, sc!.up() === item.up())
                    }
                }
            } else if (sc) {
                // avoid articulations
                po = SlurTieLayout.fixArticulations(item, po, sc, __up, sc.up() === item.up())
            }

            // TODO: offset start position if there is another slur ending on this cr
            if (sa1 === NONE) {
                sp.p1 = sp.p1.plus(po)
            }

            //------p2
            if (sa2 === NONE) {
                // default positions
                po.setX(hw2 * 0.5 + (note2 ? note2.bboxXShift() : 0.0))
                if (note2) {
                    po.setY(note2.pos().y())
                } else if (item.up()) {
                    po.setY(item.endCR()!.ldata().bbox().top())
                } else {
                    po.setY(item.endCR()!.ldata().bbox().top() + item.endCR()!.height())
                }
                const offset2 = useTablature ? 0.75 : 0.9
                po.setY(po.y() + ecr.intrinsicMag() * _spatium * offset2 * __up)

                // adjustments for stem and/or beam
                const trem2 = ec ? ec.tremoloTwoChord() : null
                if (stem2 || trem2) { //ec can't be null
                    const beam2 = ec!.beam()
                    if ((stemPos && (scr.up() === ec!.up()))
                        || (beam2
                            && beam2.elements().length
                            && (beam2.elements()[0] !== ec)
                            && (ec!.up() === item.up())
                            && sc && (sc.noteType() === 0 /* NoteType::NORMAL */))
                        || (trem2 && ec!.up() === item.up())) {
                        // slur start was laid out to stem and start and end have same direction
                        // OR
                        // end chord is beamed but not the first chord of beam group
                        // and slur direction is same as end chord (stem side)
                        // and start chordrest is not a grace chord

                        // in these cases, layout end of slur to stem
                        if (beam2) {
                            TLayout.layoutBeam(beam2, ctx)
                        }
                        if (trem2) {
                            TremoloLayout.layoutTwoChord(trem2, ctx)
                        }
                        const beamWidthSp = beam2 ? ctx.conf().styleS(Sid.beamWidth).val() : 0
                        const note = item.up() ? ec!.upNote() : ec!.downNote()
                        const stemHeight = stem2 ? stem2.length() + (beamWidthSp / 2) : SlurTieLayout.defaultStemLengthEnd(trem2!)
                        const offset3 = Math.max(beamClearance * ec!.intrinsicMag(), minOffset) * _spatium
                        const sh = stemHeight + offset3

                        if (item.up()) {
                            po.setY(StemLayout.chordStemPos(ec!).y() - ec!.pagePos().y() - sh)
                        } else {
                            po.setY(StemLayout.chordStemPos(ec!).y() - ec!.pagePos().y() + sh)
                        }
                        if (!stem2) {
                            // tremolo whole notes
                            po.setX(note.noteheadCenterX())
                        } else {
                            po.setX(StemLayout.chordStemPosX(ec!) + (stem2.lineWidthMag() / 2 * __up)
                                    - (beamAnchorInset * _spatium * ec!.intrinsicMag()))
                        }

                        // account for articulations
                        po = SlurTieLayout.fixArticulations(item, po, ec!, __up, true)
                    } else {
                        // slur was not aligned to stem or start and end have different direction
                        // AND
                        // end chord is not beamed or is first chord of beam group
                        // or slur direction is opposite that of end chord

                        // if slur and stem are on same side and the chord has more than one note
                        // that is, the end chord has a stem and the slur is on that side
                        const stemOffsetMag = stemOffsetX * ec!.intrinsicMag()
                        if (!ec!.up() && !item.up()) {
                            if (useTablature) {
                                po.setX(po.x() - stemOffsetMag * _spatium)
                            } else {
                                po.setX(-_spatium * stemOffsetMag + note2!.x())
                            }
                        } else if (useTablature && item.up() && ec!.up()) {
                            po.setX(po.x() - _spatium * stemOffsetMag)
                        }

                        // TODO: offset start position if there is another slur ending on this cr

                        if ((scr.up() !== ec!.up()) && (ec!.up() === item.up())) {
                            // stem on end chord is on slur side, but stem on start chord is opposite slur side
                            item.stemFloated().right = true
                            let n1: Note | null = null
                            if (sc) {
                                n1 = sc.up() ? sc.upNote() : sc.downNote()
                            }
                            const n2 = ec!.up() ? ec!.upNote() : ec!.downNote()
                            let yd = n2.pos().y() - (n1 ? n1.pos().y() : item.startCR()!.pos().y())
                            yd *= 0.5
                            const mh = stem2 ? stem2.height() : 0.0 // limit y move
                            if (item.up() && yd > 0.0) {
                                po.setY(Math.max(po.y() - yd, ec!.downNote().pos().y() - mh - _spatium))
                            } else if (!item.up() && yd < 0.0) {
                                po.setY(Math.min(po.y() - yd, ec!.upNote().pos().y() + mh + _spatium))
                            }

                            // account for articulations
                            po = SlurTieLayout.fixArticulations(item, po, ec!, __up, true)
                        } else {
                            // avoid articulations
                            po = SlurTieLayout.fixArticulations(item, po, ec!, __up, ec!.up() === item.up())
                        }
                    }
                } else if (ec) {
                    // avoid articulations
                    po = SlurTieLayout.fixArticulations(item, po, ec, __up, ec.up() === item.up())
                }
                // TODO: offset end position if there is another slur starting on this cr
                sp.p2 = sp.p2.plus(po)
            }
        }

        // TODO(port): avoidPreBendsOnTab, tapping half slurs
    }

    /** returns the adjusted point (C++ passes pt by reference) */
    private static fixArticulations(item: Slur, pt: PointF, c: Chord, up: number, stemSide: boolean): PointF {
        //
        // handle special case of tenuto and staccato
        // yo = current offset of slur from chord position
        // return unchanged position, or position of outmost "close" articulation
        //
        pt = pt.clone()
        const slurTipToArticVertDist = c.spatium() * 0.5 * up
        const slurTipInwardAdjust = 0.1 * item.spatium()
        const start = !!item.startCR() && item.startCR() === c
        const end = !!item.endCR() && item.endCR() === c
        for (const a of c.articulations()) {
            if (!a.layoutCloseToNote() || !a.addToSkyline()) {
                continue
            }
            // skip if articulation on stem side but slur is not or vice versa
            if ((a.up() === c.up()) !== stemSide) {
                continue
            }
            // Correct x-position inwards
            const note = c.up() ? c.downNote() : c.upNote()
            pt.setX(a.x() + 0.5 * a.width() - note.x())
            if (start) {
                pt.setX(pt.x() + slurTipInwardAdjust)
            } else if (end) {
                pt.setX(pt.x() - slurTipInwardAdjust)
            }
            // Adjust y-position
            if (a.up()) {
                pt.setY(Math.min(pt.y(), a.y() + a.height() / 2 * up + slurTipToArticVertDist))
            } else {
                pt.setY(Math.max(pt.y(), a.y() + a.height() / 2 * up + slurTipToArticVertDist))
            }
        }
        return pt
    }

    private static adjustEndPoints(slurSeg: SlurSegment): void {
        const spatium = slurSeg.spatium()
        const lw = (slurSeg.staffType() ? slurSeg.staffType()!.lineDistance().val() : 1.0) * spatium
        const staffLineMargin = 0.175 + (0.5 * slurSeg.style().styleS(Sid.staffLineWidth).val() * (spatium / lw))
        const p1 = slurSeg.ups(Grip.START).p
        const p2 = slurSeg.ups(Grip.END).p

        const y1sp = p1.y() / lw
        const y2sp = p2.y() / lw
        const staff = slurSeg.staff()
        const lines = staff ? staff.lines(slurSeg.tick()) : 0
        const adjustPoint = (up: boolean, ysp: number): number => {
            const y1offset = ysp - Math.floor(ysp)
            let adjust = 0
            if (up) {
                if (y1offset < staffLineMargin) {
                    // endpoint too close to the line above
                    adjust = -(y1offset + staffLineMargin)
                } else if (y1offset > 1 - staffLineMargin) {
                    // endpoint too close to the line below
                    adjust = -(y1offset - (1 - staffLineMargin))
                }
            } else {
                if (y1offset < staffLineMargin) {
                    // endpoint too close to the line above
                    adjust = staffLineMargin - y1offset
                }
                if (y1offset > 1 - staffLineMargin) {
                    // endpoint too close to the line below
                    adjust = (1 - y1offset) + staffLineMargin
                }
            }
            return adjust
        }
        if (y1sp > -staffLineMargin && y1sp < (lines - 1) + staffLineMargin) {
            const up1 = slurSeg.ups(Grip.START)
            up1.p = new PointF(up1.p.x(), up1.p.y() + adjustPoint(slurSeg.slur().up(), y1sp) * lw)
        }
        if (y2sp > -staffLineMargin && y2sp < (lines - 1) + staffLineMargin) {
            const up2 = slurSeg.ups(Grip.END)
            up2.p = new PointF(up2.p.x(), up2.p.y() + adjustPoint(slurSeg.slur().up(), y2sp) * lw)
        }
    }

    /** C++ passes pp1, p2, p3, p4 and slurAngle by reference; the points are mutated in place */
    private static avoidCollisions(slurSeg: SlurSegment, pp1: PointF, p2: PointF, p3: PointF, p4: PointF, toSystemCoordinates: Transform,
                                   slurAngle: number): void {
        const slur = slurSeg.slur()
        const spatium = slurSeg.spatium()
        const slurLength = Math.abs(p2.x() / spatium)
        const slurUp = slur.up()
        const upSign = slurUp ? -1 : 1
        const startCR = slur.startCR()
        const endCR = slur.endCR()

        if (!startCR || !endCR) {
            return
        }

        const segShapes = SlurTieLayout.getSegmentShapes(slurSeg, startCR, endCR) // Shape of the music under this slur
        SlurTieLayout.addMinClearanceToShapes(segShapes, spatium, slurUp, startCR, endCR)
        if (segShapes.empty()) {
            return
        }

        const arcClearance = -upSign * SlurTieLayout.computeArcClearance(spatium, slurLength, slurAngle) // Collision clearance at the center of the slur

        const [leftBalance, rightBalance] = SlurTieLayout.computeAdjustmentBalance(slurSeg, startCR, endCR)

        const MAX_ITER = 30 // Max iterations allowed
        const step = SlurTieLayout.computeAdjustmentStep(upSign, spatium, slurLength)

        const npoints = 20
        const slurRects: RectF[] = []

        const collision = { left: false, mid: false, right: false }
        const set = (p: PointF, v: PointF): void => { p.setX(v.x()); p.setY(v.y()) }

        let iter = 0
        do {
            collision.left = false
            collision.mid = false
            collision.right = false
            toSystemCoordinates.reset()
            toSystemCoordinates.translate(pp1.x(), pp1.y())
            toSystemCoordinates.rotateRadians(slurAngle)
            // Create rectangles that approximate the slur arc
            slurRects.length = 0
            const clearanceBezier = new CubicBezier(new PointF(0, 0), p3.plus(new PointF(0.0, arcClearance)),
                                                    p4.plus(new PointF(0.0, arcClearance)), p2.clone())
            for (let i = 0; i < npoints - 1; i++) {
                let clearancePoint1 = clearanceBezier.pointAtPercent(i / npoints)
                let clearancePoint2 = clearanceBezier.pointAtPercent((i + 1) / npoints)
                clearancePoint1 = toSystemCoordinates.map(clearancePoint1)
                clearancePoint2 = toSystemCoordinates.map(clearancePoint2)
                slurRects.push(RectF.fromPoints(clearancePoint1, clearancePoint2))
            }
            // Check collisions
            for (let i = 0; i < slurRects.length; i++) {
                const leftSection = i < Math.trunc(slurRects.length / 3)
                const midSection = i >= Math.trunc(slurRects.length / 3) && i < Math.trunc(2 * slurRects.length / 3)
                const rightSection = i >= Math.trunc(2 * slurRects.length / 3)
                if ((leftSection && collision.left)
                    || (midSection && collision.mid)
                    || (rightSection && collision.right)) { // If a collision is already found in this section, no need to check again
                    continue
                }
                const intersection = slur.up() ? !new Shape(slurRects[i]).clearsVertically(segShapes)
                    : !segShapes.clearsVertically(new Shape(slurRects[i]))
                if (intersection) {
                    if (leftSection) {
                        collision.left = true
                    }
                    if (midSection) {
                        collision.mid = true
                    }
                    if (rightSection) {
                        collision.right = true
                    }
                }
            }
            // In the even iterations, adjust the shape of the arc
            if (iter % 2 === 0) {
                const SHAPE_PREFER_CENTER_FACTOR = 2.0
                if (collision.left) {
                    // Move left Bezier point up(/down) and outwards
                    const shapeLeftStep = (1 - leftBalance) * step / SHAPE_PREFER_CENTER_FACTOR
                    set(p3, p3.plus(new PointF(-Math.abs(shapeLeftStep), shapeLeftStep)))
                    // and a bit also the right point to compensate asymmetry
                    set(p4, p4.plus(new PointF(Math.abs(shapeLeftStep), shapeLeftStep).times(0.5)))
                }
                if (collision.mid) { // Move both Bezier points up(/down)
                    const shapeLeftStep = (1 - leftBalance) * step
                    const shapeRightStep = (1 - rightBalance) * step
                    set(p3, p3.plus(new PointF(0.0, (shapeLeftStep + shapeRightStep) / 2)))
                    set(p4, p4.plus(new PointF(0.0, (shapeLeftStep + shapeRightStep) / 2)))
                }
                if (collision.right) {
                    // Move right Bezier point up(/down) and outwards
                    const shapeRightStep = (1 - rightBalance) * step / SHAPE_PREFER_CENTER_FACTOR
                    set(p4, p4.plus(new PointF(Math.abs(shapeRightStep), shapeRightStep)))
                    // and a bit also the left point to compensate asymmetry
                    set(p3, p3.plus(new PointF(-Math.abs(shapeRightStep), shapeRightStep).times(0.5)))
                }
            } else if (!slurSeg.isEndPointsEdited()) {
                // In the odd iterations, adjust the end points
                // Slurs steeper than 45° are gradually compensated
                const STEEP_LIMIT = Math.PI / 4
                const SLANT_REDUCTION_ANGLE = 5 * Math.PI / 180
                const SLANT_REDUCTION_LENGTH = 8
                const p2SysCoords = toSystemCoordinates.map(p2)
                const curSlant = (p2SysCoords.y() - pp1.y()) / (p2SysCoords.x() - pp1.x())
                if (collision.left || collision.mid || slurAngle < -STEEP_LIMIT) {
                    // Move start point up(/down)
                    let endPointLeftStep = leftBalance * step
                    if (!collision.left && collision.mid && Math.abs(curSlant) > SLANT_REDUCTION_ANGLE
                        && slurLength > SLANT_REDUCTION_LENGTH) {
                        // If there's only a mid collision and the slur is already inclined, prefer moving the outer end point
                        const slantReductionRatio = Math.abs(curSlant) / SLANT_REDUCTION_ANGLE
                        const leftIsOuter = (slurUp && curSlant > 0) || (!slurUp && curSlant < 0)
                        endPointLeftStep *= leftIsOuter ? (1 / slantReductionRatio) : slantReductionRatio
                    }
                    const stepX = Math.sin(slurAngle) * endPointLeftStep
                    const stepY = Math.cos(slurAngle) * endPointLeftStep
                    const pp1delta = new PointF(stepX, stepY)
                    set(pp1, pp1.plus(new PointF(0.0, endPointLeftStep)))
                    set(p3, p3.plus(pp1delta.times((p2.x() - p3.x()) / p2.x())))
                    set(p4, p4.plus(pp1delta.times((p2.x() - p4.x()) / p2.x())))
                    // Keep p2 still in system coordinates
                    set(p2, p2.minus(pp1delta))
                    set(p3, p3.minus(pp1delta))
                    set(p4, p4.minus(pp1delta))
                }
                if (collision.right || collision.mid || slurAngle > STEEP_LIMIT) {
                    // Move end point up(/down)
                    let endPointRightStep = rightBalance * step
                    if (!collision.right && collision.mid && Math.abs(curSlant) > SLANT_REDUCTION_ANGLE
                        && slurLength > SLANT_REDUCTION_LENGTH) {
                        // If there's only a mid collision and the slur is already inclined, prefer moving the outer end point
                        const slantReductionRatio = Math.abs(curSlant) / SLANT_REDUCTION_ANGLE
                        const rightIsOuter = (slurUp && curSlant < 0) || (!slurUp && curSlant > 0)
                        endPointRightStep *= rightIsOuter ? (1 / slantReductionRatio) : slantReductionRatio
                    }
                    const stepX = Math.sin(slurAngle) * endPointRightStep
                    const stepY = Math.cos(slurAngle) * endPointRightStep
                    const p2delta = new PointF(stepX, stepY)
                    set(p2, p2.plus(p2delta))
                    set(p3, p3.plus(p2delta.times(p3.x() / p2.x())))
                    set(p4, p4.plus(p2delta.times(p4.x() / p2.x())))
                }
            }
            // Enforce non-ugliness rules
            // 1) Slur cannot be taller than it is wide
            const maxRelativeHeight = Math.abs(p2.x())
            set(p3, slur.up() ? new PointF(p3.x(), Math.max(p3.y(), -maxRelativeHeight)) : new PointF(p3.x(), Math.min(p3.y(), maxRelativeHeight)))
            set(p4, slur.up() ? new PointF(p4.x(), Math.max(p4.y(), -maxRelativeHeight)) : new PointF(p4.x(), Math.min(p4.y(), maxRelativeHeight)))
            // 2) Tips of shoulder cannot cross the horizontal end points
            let p3SysCoord = toSystemCoordinates.map(p3)
            let p4SysCoord = toSystemCoordinates.map(p4)
            const p2SysCoord = toSystemCoordinates.map(p2)
            p3SysCoord = new PointF(Math.max(pp1.x(), p3SysCoord.x()), p3SysCoord.y())
            p3SysCoord = new PointF(Math.min(p2SysCoord.x(), p3SysCoord.x()), p3SysCoord.y())
            p4SysCoord = new PointF(Math.max(pp1.x(), p4SysCoord.x()), p4SysCoord.y())
            p4SysCoord = new PointF(Math.min(p2SysCoord.x(), p4SysCoord.x()), p4SysCoord.y())
            set(p3, toSystemCoordinates.inverted().map(p3SysCoord))
            set(p4, toSystemCoordinates.inverted().map(p4SysCoord))

            ++iter
        } while ((collision.left || collision.mid || collision.right) && iter < MAX_ITER)
    }

    private static getSegmentShapes(slurSeg: SlurSegment, startCR: ChordRest, endCR: ChordRest): Shape {
        const segShapes = new Shape()
        let startSeg: Segment | null = null
        if (slurSeg.isSingleBeginType()) {
            if (startCR.isChord() && (startCR as Chord).isGraceAfter()) {
                const parent = startCR.parentItem() as Chord | null
                if (parent) {
                    startSeg = parent.graceNotesAfter().appendedSegment()
                }
            } else {
                startSeg = startCR.segment() // first of the slur
            }
        } else {
            startSeg = slurSeg.system()!.firstMeasure()!.findFirstR(SegmentType.ChordRest, new Fraction(0, 1)) // first of the system
        }
        let endSeg: Segment | null = null
        if (slurSeg.isSingleEndType()) {
            if (endCR.isChord() && (endCR as Chord).isGraceAfter()) {
                const parent = endCR.parentItem() as Chord | null
                if (parent) {
                    endSeg = parent.graceNotesAfter().appendedSegment()
                }
            } else {
                endSeg = endCR.segment() // last of the slur
            }
        } else {
            endSeg = slurSeg.system()!.lastMeasure()!.last() // last of the system
        }
        if (!startSeg || !endSeg) {
            return segShapes
        }
        for (let seg: Segment | null = startSeg; seg && (seg.isBefore(endSeg) || seg === endSeg); seg = seg.next1enabled()) {
            if (seg.isSegType(SegmentType.BarLineType) || seg.isBreathType() || seg.hasTimeSigAboveStaves() || seg.isTimeTickType()) {
                continue
            }
            segShapes.add(SlurTieLayout.getSegmentShape(slurSeg, seg, startCR, endCR))
        }
        return segShapes
    }

    private static getSegmentShape(slurSeg: SlurSegment, seg: Segment, startCR: ChordRest, endCR: ChordRest): Shape {
        const slur = slurSeg.slur()
        const startStaffIdx = startCR.staffIdx()
        let endStaffIdx = endCR.staffIdx()
        const segShape = seg.staffShape(startStaffIdx).translated(seg.pos().plus(seg.measure().pos()))

        // If cross-staff, also add the shape of second staff
        const crossStaffSlur = slur.isCrossStaff() && seg !== startCR.segment()
        if (crossStaffSlur) {
            endStaffIdx = (endCR.staffIdx() !== startStaffIdx) ? endCR.staffIdx() : endCR.vStaffIdx()
            const startStaff = slurSeg.system()!.staves()[startStaffIdx]
            const endStaff = slurSeg.system()!.staves()[endStaffIdx]
            const dist = endStaff.y() - startStaff.y()
            const secondStaffShape = seg.staffShape(endStaffIdx).translated(seg.pos().plus(seg.measure().pos())) // translate horizontally
            secondStaffShape.translate(new PointF(0.0, dist)) // translate vertically
            segShape.add(secondStaffShape)
        }

        // Add ties shapes
        for (let track = staff2track(startStaffIdx); track < staff2track(endStaffIdx) + VOICES; ++track) {
            const e = seg.element(track)
            if (!e || !e.isChordRest()) {
                continue
            }
            if (e.vStaffIdx() !== slurSeg.vStaffIdx() && !crossStaffSlur) {
                continue
            }
            if (e.isChord()) {
                const trem = (e as Chord).tremoloTwoChord()
                if (trem) {
                    segShape.add(trem.shape())
                }
                for (const note of (e as Chord).notes()) {
                    const tieFor = note.tieFor()
                    const tieBack = note.tieBack()
                    if (tieFor && tieFor.up() === slur.up() && !tieFor.segmentsEmpty()) {
                        const tieSegment = tieFor.frontSegment() as TieSegment
                        if (tieSegment.isSingleBeginType()) {
                            segShape.add(tieSegment.shape())
                        }
                    }
                    if (tieBack && tieBack.up() === slur.up() && !tieBack.segmentsEmpty()) {
                        const tieSegment = tieBack.backSegment() as TieSegment
                        if (tieSegment.isEndType()) {
                            segShape.add(tieSegment.shape())
                        }
                    }
                }
            }
        }

        // Remove items that the slur shouldn't try to avoid
        segShape.remove_if((shapeEl: ShapeElement) => {
            const item = shapeEl.item()
            if (!item || !item.parentItem() || !item.visible()) {
                return true
            }
            const parent = item.parentItem()!
            // Don't remove arpeggio starting on a different voice and ending on the same voice as endCR when slur is on the outside
            if ((item.isArpeggio() || item.isChordBracket()) && (endCR.track() === (item as Arpeggio).endTrack())
                && endCR.tick().eq(item.tick())
                && (!slur.up() && (item as Arpeggio).span() > 1)) {
                return false
            }

            // Its own startCR or items belonging to it, lyrics, fingering, ledger lines, articulation on endCR
            if (item === startCR || parent === startCR || item.isTextBase() || item.isLedgerLine()
                || (item.isArticulationFamily() && parent === endCR) || item.isBend() || item.isTappingHalfSlurSegment()) {
                return true
            }
            // Ornament accidentals on start or end chord
            if (item.isAccidental() && parent.isOrnament()) {
                const parentParent = parent.parentItem()
                if (parentParent && (parentParent === startCR || parentParent === endCR)) {
                    return true
                }
            }
            // Items that are on the start segment but in a different voice
            if ((item.tick().eq(startCR.tick()) && item.track() !== startCR.track())
                || (item.tick().eq(endCR.tick()) && item.track() !== endCR.track())) {
                return true
            }
            // Edge-case: multiple voices and slur is on the inside
            if (item.vStaffIdx() === startCR.staffIdx()
                && ((!slur.up() && item.track() > startCR.track()) // slur-down: ignore lower voices
                    || (slur.up() && item.track() < startCR.track()))) { // slur-up: ignore higher voices
                return true
            }
            // Remove arpeggios spanning more than 1 voice starting on endCR's voice when the slur is on the inside
            if ((item.isArpeggio() || item.isChordBracket())
                && (endCR.track() !== item.track() || (!slur.up() && (item as Arpeggio).span() > 1))) {
                return true
            }
            if (item.isTimeSig() && (item as TimeSig).timeSigPlacement() !== TimeSigPlacement.NORMAL) {
                return true
            }
            if (item.isFermata() || item.isFretDiagram()) {
                return true
            }
            if (item.isNote() && (item as Note).shouldHideFret()) {
                return true
            }
            return false
        })
        return segShape
    }

    private static addMinClearanceToShapes(segShapes: Shape, spatium: number, slurUp: boolean, startCR: ChordRest, endCR: ChordRest): void {
        const noteClearance = 0.4 * spatium
        const articulationClearance = 0.20 * spatium
        const itemClearance = 0.1 * spatium
        for (const shapeEl of segShapes.elements()) {
            const item = shapeEl.item()
            if (!item || item.parent() === startCR || item.parent() === endCR) {
                continue
            }
            let clearance: number
            switch (item.type()) {
            case ElementType.NOTE:
                clearance = noteClearance
                break
            case ElementType.ARTICULATION:
            case ElementType.ORNAMENT:
            case ElementType.TAPPING:
                clearance = articulationClearance
                break
            default:
                clearance = itemClearance
                break
            }
            if (slurUp) {
                shapeEl.adjust(0.0, -clearance, 0.0, 0.0)
            } else {
                shapeEl.adjust(0.0, 0.0, 0.0, clearance)
            }
        }
        segShapes.invalidateBBox()
    }

    private static computeArcClearance(spatium: number, slurLength: number, slurAngle: number): number {
        const CLEARANCE_TO_LENGTH_RATIO = 0.04
        const MAX_CLEARANCE = 0.5
        const MIN_CLEARANCE = 0.1
        let clearance = CLEARANCE_TO_LENGTH_RATIO * slurLength * Math.pow(Math.cos(slurAngle), 2)
        clearance = clamp(clearance, MIN_CLEARANCE, MAX_CLEARANCE)
        return clearance * spatium
    }

    private static computeAdjustmentBalance(slurSeg: SlurSegment, startCR: ChordRest, endCR: ChordRest): [number, number] {
        const slur = slurSeg.slur()
        let leftBalance: number
        let rightBalance: number
        // If the slur is attached to a stem, prefer moving the shoulder rather than the end point
        if (slurSeg.isSingleBeginType() && !slur.stemFloated().left) {
            if (slurSeg.isBeginType() || SlurTieLayout.hasArticulationAbove(slurSeg, startCR) || slur.isCrossStaff()) {
                leftBalance = 0.1
            } else {
                leftBalance = 0.4
            }
        } else {
            leftBalance = 0.9
        }
        if (slurSeg.isSingleEndType() && !slur.stemFloated().right) {
            if (slurSeg.isEndType() || SlurTieLayout.hasArticulationAbove(slurSeg, endCR) || slur.isCrossStaff()) {
                rightBalance = 0.1
            } else {
                rightBalance = 0.4
            }
        } else {
            rightBalance = 0.9
        }
        return [leftBalance, rightBalance]
    }

    private static hasArticulationAbove(slurSeg: SlurSegment, chordRest: ChordRest): boolean {
        if (!chordRest.isChord()) {
            return false
        }
        const chord = chordRest as Chord
        const slurUp = slurSeg.slur().up()
        for (const artic of chord.articulations()) {
            if (!artic.layoutCloseToNote() && artic.up() === slurUp) {
                return true
            }
        }
        const ornament = chord.findOrnament() as Ornament | null
        if (ornament) {
            if (ornament.up() === slurUp) {
                return true
            }
        }

        return false
    }

    private static computeAdjustmentStep(upSign: number, spatium: number, slurLength: number): number {
        let step = upSign * 0.30 * spatium
        const LONG_SLUR_LIMIT = 16.0 // in spaces
        if (slurLength > LONG_SLUR_LIMIT) {
            step *= slurLength / LONG_SLUR_LIMIT
            step = Math.min(step, 1.5 * spatium)
        }
        return step
    }

    private static stemSideForBeam(slur: Slur, start: boolean): boolean {
        // determines if the anchor point is exempted from the stem inset due to beams or tremolos.
        const cr = start ? slur.startCR() : slur.endCR()
        const beam = cr ? cr.beam() : null
        let adjustForBeam = !!cr && !!beam && cr.up() === slur.up()
        if (adjustForBeam) {
            const els = beam!.elements()
            if (start) {
                adjustForBeam = els[els.length - 1] !== cr
            } else {
                adjustForBeam = els[0] !== cr
            }
        }
        if (adjustForBeam) {
            return true
        }

        const c = cr && cr.isChord() ? cr as Chord : null
        const trem = c ? c.tremoloTwoChord() : null
        let adjustForTrem = !!trem && trem.up() === slur.up()
        if (start) {
            adjustForTrem = adjustForTrem && trem!.chord2() !== c
        } else {
            adjustForTrem = adjustForTrem && trem!.chord1() !== c
        }
        return adjustForTrem
    }

    private static isOverBeams(slur: Slur): boolean {
        // returns true if all the chords spanned by the slur are beamed, and all beams are on the same side of the slur
        const startCR = slur.startCR()
        const endCR = slur.endCR()
        if (!startCR || !endCR) {
            return false
        }
        if (startCR.track() !== endCR.track() || startCR.tick().ge(endCR.tick())) {
            return false
        }
        const track = startCR.track()
        let seg: Segment | null = startCR.segment()
        while (seg && seg.tick().le(endCR.tick())) {
            const e = seg.elist()[track]
            if (!seg.isChordRestType() || !e || !e.isChordRest()) {
                return false
            }
            const cr = e as ChordRest
            const hasBeam = !!cr.beam() && cr.up() === slur.up()
            let hasTrem = false
            if (cr.isChord()) {
                const c = cr as Chord
                hasTrem = !!c.tremoloTwoChord() && c.up() === slur.up()
            }
            if (!(hasBeam || hasTrem)) {
                return false
            }
            const next = seg.next()
            if ((!next || next.isEndBarLineType()) && seg.measure().nextMeasure()) {
                seg = seg.measure().nextMeasure()!.first()
            } else {
                seg = next
            }
        }
        return true
    }

    private static tieSegmentShouldBeSkipped(item: Tie): boolean {
        const startNote = item.startNote()
        const st = item.staff()!.staffType(startNote ? startNote.tick() : new Fraction(0, 1))
        if (!st || !st.isTabStaff()) {
            return false
        }
        // TODO(port): continuation of bends
        const showTiedFret = item.style().styleI(Sid.tabShowTiedFret) as ShowTiedFret
        return showTiedFret === ShowTiedFret.NONE
    }

    static layoutTieFor(item: Tie, system: System): TieSegment | null {
        item.setPos(0, 0)

        if (!item.startNote()) {
            return null
        }
        if (SlurTieLayout.tieSegmentShouldBeSkipped(item)) {
            if (!item.segmentsEmpty()) {
                item.eraseSpannerSegments()
            }
            return null
        }

        if (item.isPartialTie()) {
            return SlurTieLayout.layoutPartialTie(item as PartialTie)
        }

        SlurTieLayout.calculateDirection(item)
        SlurTieLayout.calculateIsInside(item)

        const sPos = new SlurTiePos()

        sPos.p1 = SlurTieLayout.computeDefaultStartOrEndPoint(item, Grip.START)

        SlurTieLayout.computeStartAndEndSystem(item, sPos)

        const segmentCount = sPos.system1 === sPos.system2 ? 1 : 2

        if (segmentCount === 2) {
            sPos.p2 = new PointF(system.endingXForOpenEndedLines(), sPos.p1.y())
        } else {
            sPos.p2 = SlurTieLayout.computeDefaultStartOrEndPoint(item, Grip.END)
        }

        // Adjust Y pos to staff type yOffset before other calculations
        // TODO(port): staff type offsets for ties (C++ does nothing here either)

        SlurTieLayout.correctForCrossStaff(item, sPos, sPos.system1 !== sPos.system2 ? SpannerSegmentType.BEGIN : SpannerSegmentType.SINGLE)

        SlurTieLayout.forceHorizontal(item, sPos)

        item.fixupSlurTieSegments(segmentCount)
        const segment = item.segmentAt(0) as TieSegment
        segment.setTrack(item.track())
        segment.setSpannerSegmentType(sPos.system1 !== sPos.system2 ? SpannerSegmentType.BEGIN : SpannerSegmentType.SINGLE)
        segment.setSystem(system) // Needed to populate System.spannerSegments
        segment.resetAdjustmentOffset()
        segment.mutldata().allJumpPointsInactive = item.allJumpPointsInactive()

        const startChord = item.startNote()!.chord()
        item.setTick(startChord.tick()) // Why is this here?? (M.S.)

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustX(segment, sPos, Grip.START)
            if (segment.isSingleType()) {
                SlurTieLayout.adjustX(segment, sPos, Grip.END)
            }
        }

        SlurTieLayout.adjustYforLedgerLines(segment, sPos)

        segment.ups(Grip.START).p = sPos.p1.clone()
        segment.ups(Grip.END).p = sPos.p2.clone()

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustY(segment)
        } else {
            SlurTieLayout.computeTieBezier(segment)
        }

        SlurTieLayout.addLineAttachPoints(segment) // add attach points to start and end note
        return segment
    }

    static layoutTieBack(item: Tie, system: System, ctx: LayoutContext): TieSegment | null {
        const chord = item.endNote() ? item.endNote()!.chord() : null
        if (item.staffType() && item.staffType()!.isTabStaff()) {
            // On TAB, the presence of this tie may require to add a parenthesis
            ChordLayout.layout(chord!, ctx)
        }

        if (SlurTieLayout.tieSegmentShouldBeSkipped(item)) {
            if (!item.segmentsEmpty()) {
                item.eraseSpannerSegments()
            }
            return null
        }

        if (item.isPartialTie()) {
            return SlurTieLayout.layoutPartialTie(item as PartialTie)
        }

        const sPos = new SlurTiePos()

        SlurTieLayout.computeStartAndEndSystem(item, sPos)
        sPos.p2 = SlurTieLayout.computeDefaultStartOrEndPoint(item, Grip.END)

        const x = system ? system.firstNoteRestSegmentX(true) : 0
        const y = sPos.p2.y()
        sPos.p1 = new PointF(x, y)

        item.fixupSlurTieSegments(2)
        const segment = item.segmentAt(1) as TieSegment
        segment.setTrack(item.track())
        segment.setSystem(system)
        segment.resetAdjustmentOffset()

        if (chord) {
            segment.setStaffMove(chord.vStaffIdx() - segment.staffIdx())
        }

        SlurTieLayout.adjustY(segment)
        segment.setSpannerSegmentType(SpannerSegmentType.END)

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustX(segment, sPos, Grip.END)
        }

        SlurTieLayout.adjustYforLedgerLines(segment, sPos)

        segment.ups(Grip.START).p = sPos.p1.clone()
        segment.ups(Grip.END).p = sPos.p2.clone()

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustY(segment)
        } else {
            SlurTieLayout.computeTieBezier(segment)
        }

        SlurTieLayout.addLineAttachPoints(segment)
        return segment
    }

    private static computeStartAndEndSystem(item: Tie, slurTiePos: SlurTiePos): void {
        const startChord = item.startNote() ? item.startNote()!.chord() : null
        const endChord = item.endNote() ? item.endNote()!.chord() : null

        const startSystem = startChord ? startChord.measure()!.system() : null
        const endSystem = endChord ? endChord.measure()!.system() : startSystem

        slurTiePos.system1 = startSystem
        slurTiePos.system2 = endSystem
    }

    private static computeDefaultStartOrEndPoint(tie: Tie, startOrEnd: Grip): PointF {
        if (startOrEnd !== Grip.START && startOrEnd !== Grip.END) {
            return new PointF()
        }

        const start = startOrEnd === Grip.START

        const note = start ? tie.startNote() : tie.endNote()
        const chord = note ? note.chord() : null

        if (!note || !chord) {
            return new PointF()
        }

        let result = note.pos().plus(chord.pos()).plus(chord.segment()!.pos()).plus(chord.measure()!.pos())

        const up = tie.up()
        const inside = tie.isInside()
        const noteIsHiddenFret = note.shouldHideFret()
        const upSign = up ? -1 : 1
        const leftRightSign = start ? +1 : -1
        const noteWidth = note.width()
        const noteHeight = note.height()
        const spatium = tie.spatium()

        const baseX = (inside && !noteIsHiddenFret) ? (start ? noteWidth : 0.0) : SlurTieLayout.noteOpticalCenterForTie(note, up)
        const baseY = inside ? 0.0 : upSign * noteHeight / 2
        result = result.plus(new PointF(baseX, baseY))

        let visualInsetSp: number
        if (inside || note.headGroup() === NoteHeadGroup.HEAD_SLASH || noteIsHiddenFret) {
            visualInsetSp = 0.2
        } else if (note.hasAnotherStraightAboveOrBelow(up)) {
            visualInsetSp = 0.45
        } else {
            visualInsetSp = 0.1
        }
        const visualInset = visualInsetSp * spatium * leftRightSign

        const yOffset = 0.20 * spatium * upSign // TODO: style

        return result.plus(new PointF(visualInset, yOffset))
    }

    static noteOpticalCenterForTie(note: Note, up: boolean): number {
        if (note.headGroup() === NoteHeadGroup.HEAD_SLASH) {
            const singleSlashWidth = note.symBbox(SymId.noteheadSlashHorizontalEnds).width()
            const noteWidth = note.headWidth()
            const center = 0.20 * note.spatium() + 0.5 * (noteWidth - singleSlashWidth)
            return up ? note.ldata().bbox().right() - center : note.ldata().bbox().left() + center
        }

        const symId = note.ldata().cachedNoteheadSym
        const cutOutLeft = note.symSmuflAnchor(symId, up ? SmuflAnchorId.cutOutNW : SmuflAnchorId.cutOutSW)
        const cutOutRight = note.symSmuflAnchor(symId, up ? SmuflAnchorId.cutOutNE : SmuflAnchorId.cutOutSE)

        if (cutOutLeft.isNull() || cutOutRight.isNull()) {
            return 0.5 * note.width()
        }

        return 0.5 * (cutOutLeft.x() + cutOutRight.x())
    }

    static createSlurSegments(item: Slur, ctx: LayoutContext): void {
        const startCR = item.startCR()!
        const endCR = item.endCR()!

        const startSys = startCR.measure()!.system()
        const endSys = endCR.measure()!.system()

        const systems = ctx.dom().systems()
        const startSysIdx = startSys ? systems.indexOf(startSys) : -1
        const endSysIdx = endSys ? systems.indexOf(endSys) : -1

        if (startSysIdx === -1 || endSysIdx === -1) {
            return
        }

        let segmentsNeeded = 0
        for (let i = startSysIdx; i <= endSysIdx; ++i) {
            if (systems[i].vbox()) {
                continue
            }
            ++segmentsNeeded
        }

        const currentSegments = item.spannerSegments().length
        if (currentSegments !== segmentsNeeded) {
            item.fixupSlurTieSegments(segmentsNeeded)
        }

        let segIdx = 0
        for (let i = startSysIdx; i <= endSysIdx; ++i) {
            const system = systems[i]
            if (system.vbox()) {
                continue
            }
            const lineSegm = item.segmentAt(segIdx++) as SlurSegment
            lineSegm.setSystem(system)
            if (startSysIdx === endSysIdx) {
                lineSegm.setSpannerSegmentType(SpannerSegmentType.SINGLE)
            } else if (i === startSysIdx) {
                lineSegm.setSpannerSegmentType(SpannerSegmentType.BEGIN)
            } else if (i > 0 && i !== endSysIdx) {
                lineSegm.setSpannerSegmentType(SpannerSegmentType.MIDDLE)
            } else if (i === endSysIdx) {
                lineSegm.setSpannerSegmentType(SpannerSegmentType.END)
            }
        }
    }

    static adjustOverlappingSlurs(spannerSegments: readonly SpannerSegment[]): void {
        const segments: SlurSegment[] = []
        for (const seg of spannerSegments) {
            if (seg.isSlurSegment()) {
                segments.push(seg as SlurSegment)
            }
        }
        if (segments.length <= 1) {
            return
        }
        const spatium = segments[0].spatium()
        const slurCollisionVertOffset = 0.65 * spatium
        const slurCollisionHorizOffset = 0.2 * spatium
        const fuzzyHorizCompare = 0.25 * spatium
        const compare = (x1: number, x2: number): boolean => Math.abs(x1 - x2) < fuzzyHorizCompare
        const moveX = (up: { p: PointF }, dx: number): void => { up.p = new PointF(up.p.x() + dx, up.p.y()) }
        const moveY = (up: { p: PointF }, dy: number): void => { up.p = new PointF(up.p.x(), up.p.y() + dy) }
        for (const slur1 of segments) {
            for (const slur2 of segments) {
                if (slur2 === slur1) {
                    continue
                }
                if (slur1.slur().endChord() === slur2.slur().startChord()
                    && compare(slur1.ups(Grip.END).p.y(), slur2.ups(Grip.START).p.y())) {
                    moveX(slur1.ups(Grip.END), -slurCollisionHorizOffset)
                    moveX(slur2.ups(Grip.START), slurCollisionHorizOffset)
                    SlurTieLayout.computeSlurBezier(slur1)
                    SlurTieLayout.computeSlurBezier(slur2)
                    continue
                }
                const slurTie2 = slur2 as SlurTieSegment
                if (slur1.vStaffIdx() !== slurTie2.vStaffIdx()) {
                    continue
                }
                if (slur1.ups(Grip.END).p.x() < slurTie2.ups(Grip.START).p.x()
                    || slurTie2.ups(Grip.END).p.x() < slur1.ups(Grip.START).p.x()
                    || slur1.slur().up() !== slurTie2.slurTie().up()) {
                    continue
                }
                if (compare(slur1.ups(Grip.START).p.x(), slurTie2.ups(Grip.START).p.x())) {
                    if (slur1.ups(Grip.END).p.x() > slurTie2.ups(Grip.END).p.x() || slurTie2.isTieSegment()) {
                        // slur1 is the outside slur
                        moveY(slur1.ups(Grip.START), slurCollisionVertOffset * (slur1.slur().up() ? -1 : 1))
                        SlurTieLayout.computeSlurBezier(slur1)
                    }
                }
                if (compare(slur1.ups(Grip.END).p.x(), slurTie2.ups(Grip.END).p.x())) {
                    if (slur1.ups(Grip.START).p.x() < slurTie2.ups(Grip.START).p.x() || slurTie2.isTieSegment()) {
                        // slur1 is the outside slur
                        moveY(slur1.ups(Grip.END), slurCollisionVertOffset * (slur1.slur().up() ? -1 : 1))
                        SlurTieLayout.computeSlurBezier(slur1)
                    }
                }
            }
        }
    }

    private static createPartialTieSegment(item: PartialTie): PartialTieSegment {
        const chord = item.isOutgoing() ? item.startNote()!.chord() : item.endNote()!.chord()
        item.setTick(chord.tick())

        SlurTieLayout.calculateDirection(item)
        SlurTieLayout.calculateIsInside(item)

        item.fixupSlurTieSegments(1)
        const segment = item.segmentAt(0) as PartialTieSegment
        segment.setSpannerSegmentType(SpannerSegmentType.SINGLE)
        segment.setSystem(chord.segment()!.measure().system())
        segment.setTrack(item.track())
        segment.resetAdjustmentOffset()
        // TODO(port): ldata allJumpPointsInactive (tie jump points; only used when not printing)

        return segment
    }

    static layoutPartialTie(item: PartialTie): PartialTieSegment {
        const outgoing = item.isOutgoing()
        const segment = SlurTieLayout.createPartialTieSegment(item)
        const sPos = new SlurTiePos()

        SlurTieLayout.computeStartAndEndSystem(item, sPos)
        if (outgoing) {
            sPos.p1 = SlurTieLayout.computeDefaultStartOrEndPoint(item, Grip.START)
        } else {
            sPos.p2 = SlurTieLayout.computeDefaultStartOrEndPoint(item, Grip.END)
        }

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustX(segment, sPos, outgoing ? Grip.START : Grip.END)
        }

        SlurTieLayout.setPartialTieEndPos(item, sPos)

        SlurTieLayout.correctForCrossStaff(item, sPos, SpannerSegmentType.SINGLE)

        SlurTieLayout.adjustYforLedgerLines(segment, sPos)

        segment.ups(Grip.START).p = sPos.p1.clone()
        segment.ups(Grip.END).p = sPos.p2.clone()

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustY(segment)
        } else {
            SlurTieLayout.computeTieBezier(segment)
        }

        SlurTieLayout.addPartialTieLineAttachPoints(segment)

        return segment
    }

    private static setPartialTieEndPos(item: PartialTie, sPos: SlurTiePos): void {
        const outgoing = item.isOutgoing()

        const chord = item.parentNote()!.chord()
        const seg = chord.segment()!
        const measure = seg.measure()
        const system = measure.system()

        if (seg.measure().isFirstInSystem() && !outgoing) {
            sPos.p1 = new PointF(system ? system.firstNoteRestSegmentX(true) : 0, sPos.p2.y())
            return
        }

        const shouldSkipSegment = (adjSeg: Segment, staff: staff_idx_t): boolean => {
            const inactiveOrInvisible = !adjSeg.isActive() || !adjSeg.enabled() || adjSeg.allElementsInvisible()
                                        || !adjSeg.hasElementsInStaff(staff)
            const isAboveStaff = adjSeg.isBreathType() || adjSeg.hasTimeSigAboveStaves()
            return inactiveOrInvisible || isAboveStaff
        }

        let adjSeg = outgoing ? seg.next1() : seg.prev1()
        while (adjSeg && shouldSkipSegment(adjSeg, item.vStaffIdx())) {
            adjSeg = outgoing ? adjSeg.next1() : adjSeg.prev1()
        }

        let widthToSegment = 0.0
        if (adjSeg) {
            const element = adjSeg.element(staff2track(item.vStaffIdx()))
            let elPos = 0.0
            let elementWidth = 0.0
            if (element) {
                const elemShape = element.shape()
                elPos = element.pos().x() + elemShape.bbox().x()
                elementWidth = elemShape.bbox().width()
            }

            const elPosInSystemCoords = adjSeg.xPosInSystemCoords() + elPos
            widthToSegment = outgoing ? elPosInSystemCoords - sPos.p1.x() : sPos.p2.x() - (elPosInSystemCoords + elementWidth)
            const incomingFromBarline = !outgoing && !!element && element.isBarLine()
                                        && (element as BarLine).barLineType() !== BarLineType.START_REPEAT
            widthToSegment -= item.style().styleMM(incomingFromBarline ? Sid.barlineToLineStartDistance : Sid.lineEndToBarlineDistance)
        }

        if (outgoing) {
            sPos.p2 = new PointF(sPos.p1.x() + widthToSegment, sPos.p1.y())
        } else {
            sPos.p1 = new PointF(sPos.p2.x() - widthToSegment, sPos.p2.y())
        }
    }

    /** C++ addLineAttachPoints(PartialTieSegment*) */
    private static addPartialTieLineAttachPoints(segment: PartialTieSegment): void {
        // Add tie attach point to parent note
        const tie = segment.partialTie()
        const note = tie ? tie.note() : null
        if (!note) {
            return
        }

        if (tie.isOutgoing()) {
            note.addStartLineAttachPoint(segment.ups(Grip.START).pos(), tie)
        } else {
            note.addEndLineAttachPoint(segment.ups(Grip.END).pos(), tie)
        }
    }

    static createLaissezVibSegment(item: LaissezVib): LaissezVibSegment {
        const startChord = item.startNote()!.chord()
        item.setTick(startChord.tick())

        SlurTieLayout.calculateDirection(item)
        SlurTieLayout.calculateIsInside(item)

        item.fixupSlurTieSegments(1)
        const segment = item.segmentAt(0) as LaissezVibSegment
        segment.setSpannerSegmentType(SpannerSegmentType.SINGLE)
        segment.setTrack(item.track())
        segment.setSystem(startChord.segment()!.measure().system())
        segment.resetAdjustmentOffset()

        return segment
    }

    private static calculateLaissezVibX(segment: LaissezVibSegment, sPos: SlurTiePos, smufl: boolean): void {
        const lv = segment.laissezVib()

        SlurTieLayout.computeStartAndEndSystem(lv, sPos)
        sPos.p1 = SlurTieLayout.computeDefaultStartOrEndPoint(lv, Grip.START)

        SlurTieLayout.correctForCrossStaff(lv, sPos, SpannerSegmentType.SINGLE)

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustX(segment, sPos, Grip.START)
        }

        if (smufl) {
            const ldata = segment.mutldata()
            ldata.symbol = lv.symId()
            ldata.setBbox(segment.symBbox(ldata.symbol))
            ldata.setShape(new Shape(ldata.bbox(), segment))
            ldata.setMag(lv.startNote()!.mag())
        }

        const width = smufl ? segment.width() : lv.absoluteFromSpatium(lv.minLength())

        sPos.p2 = new PointF(sPos.p1.x() + width, sPos.p1.y())
    }

    private static calculateLaissezVibY(segment: LaissezVibSegment, sPos: SlurTiePos): void {
        SlurTieLayout.adjustYforLedgerLines(segment, sPos)

        // TODO(port): note parentheses (Chord::findNoteParenthesisInfo)

        segment.ups(Grip.START).p = sPos.p1.clone()
        segment.ups(Grip.END).p = sPos.p2.clone()

        if (segment.autoplace() && !segment.isEdited()) {
            SlurTieLayout.adjustY(segment)
        } else {
            SlurTieLayout.computeTieBezier(segment)
        }
    }

    static layoutLaissezVibChord(chord: Chord, ctx: LayoutContext): void {
        // Laissez vib ties should all end at the same rightmost point while honouring each tie's minimum length
        // Ties drawn by MuseScore can start at differing points
        // SMuFL symbols will also start at the same point because they are of fixed length
        let chordLvEndPoint = -Number.MAX_VALUE
        const lvSegmentsWithPositions = new Map<LaissezVibSegment, SlurTiePos>()
        const smuflLayout = ctx.conf().styleB(Sid.laissezVibUseSmuflSym)

        for (const note of chord.notes()) {
            const lv = note.laissezVib() as LaissezVib | null
            if (!lv) {
                continue
            }
            const sPos = new SlurTiePos()
            const lvSeg = SlurTieLayout.createLaissezVibSegment(lv)

            SlurTieLayout.calculateLaissezVibX(lvSeg, sPos, smuflLayout)

            chordLvEndPoint = Math.max(chordLvEndPoint, sPos.p2.x())

            lvSegmentsWithPositions.set(lvSeg, sPos)
        }

        for (const [lvSeg, sPos] of lvSegmentsWithPositions) {
            const note = lvSeg.laissezVib().startNote()!
            const xDiff = chordLvEndPoint - sPos.p2.x()
            sPos.p2.setX(chordLvEndPoint)
            if (smuflLayout) {
                sPos.p1.setX(sPos.p1.x() + xDiff)
            }

            SlurTieLayout.calculateLaissezVibY(lvSeg, sPos)

            const ldata = lvSeg.mutldata()
            if (smuflLayout) {
                ldata.setBbox(lvSeg.symBbox(ldata.symbol))
                ldata.setShape(new Shape(ldata.bbox(), lvSeg))
                ldata.setPos(sPos.p1)
            }

            const yOrigin = sPos.system1!.staff(chord.staffIdx())!.y()
            const yMoved = sPos.system1!.staff(chord.vStaffIdx())!.y()
            const yDiff = yMoved - yOrigin

            const chordPos = chord.pos().plus(chord.segment()!.pos()).plus(chord.measure()!.pos()).plus(new PointF(0.0, yDiff))
            const notePos = chordPos.plus(note.pos())
            ldata.posRelativeToNote = sPos.p1.minus(notePos)

            TLayout.fillNoteShape(note)
        }
    }

    private static correctForCrossStaff(tie: Tie, sPos: SlurTiePos, type: SpannerSegmentType): void {
        const startChord = tie.startNote() ? tie.startNote()!.chord() : null
        const endChord = tie.endNote() ? tie.endNote()!.chord() : null

        if (!startChord) {
            return
        }

        const startStaffDiff = startChord.vStaffIdx() !== tie.staffIdx()
        const endStaffDiff = endChord ? endChord.vStaffIdx() !== tie.staffIdx() : false

        const curY1 = sPos.p1.y()
        const curY2 = sPos.p2.y()

        if (type === SpannerSegmentType.BEGIN) {
            if (startStaffDiff && sPos.system1) {
                const yOrigin = sPos.system1.staff(tie.staffIdx())!.y()
                const yMoved = sPos.system1.staff(startChord.vStaffIdx())!.y()
                const yDiff = yMoved - yOrigin
                sPos.p1.setY(curY1 + yDiff)
                sPos.p2.setY(curY2 + yDiff)
            }
        } else if (type === SpannerSegmentType.SINGLE) {
            if (startStaffDiff && sPos.system1) {
                const yOrigin = sPos.system1.staff(tie.staffIdx())!.y()
                const yMoved = sPos.system1.staff(startChord.vStaffIdx())!.y()
                const yDiff = yMoved - yOrigin
                sPos.p1.setY(curY1 + yDiff)
                if (tie.isLaissezVib()) {
                    sPos.p2.setY(curY2 + yDiff)
                    return
                }
            }
            if (!endChord) {
                return
            }
            if (endStaffDiff && sPos.system2) {
                const yOrigin = sPos.system2.staff(tie.staffIdx())!.y()
                const yMoved = sPos.system2.staff(endChord.vStaffIdx())!.y()
                const yDiff = yMoved - yOrigin
                sPos.p2.setY(curY2 + yDiff)
            }
        }
    }

    private static forceHorizontal(tie: Tie, sPos: SlurTiePos): void {
        // If the tie goes from note to note, the two notes are on the same line and same staff, make it horizontal
        const startNote = tie.startNote()
        const endNote = tie.endNote()
        if (startNote && endNote
            && startNote.line() === endNote.line()
            && startNote.chord().vStaffIdx() === endNote.chord().vStaffIdx()) {
            const y1 = sPos.p1.y()
            const y2 = sPos.p2.y()
            const outerY = tie.up() ? Math.min(y1, y2) : Math.max(y1, y2)
            sPos.p1.setY(outerY)
            sPos.p2.setY(outerY)
        }
    }

    private static adjustX(tieSegment: TieSegment, sPos: SlurTiePos, startOrEnd: Grip): void {
        const start = startOrEnd === Grip.START
        const tiePoint = start ? sPos.p1 : sPos.p2
        let resultingX = tiePoint.x()

        const tie = tieSegment.tie()
        const note = start ? tie.startNote() : tie.endNote()
        const otherNote = start ? tie.endNote() : tie.startNote()
        if (!note || note.shouldHideFret()) {
            return
        }

        const chord = note.chord()
        const otherChord = otherNote ? otherNote.chord() : null
        const chordSeg = chord.segment()!
        const spatium = tieSegment.spatium()
        const padding = 0.20 * spatium * (start ? 1 : -1) // TODO: style
        const isGrace = (chord && chord.isGrace())
                        || ((!!otherChord && otherChord.isGrace()) && chord.segment() === otherChord!.segment())

        let systemPos = chordSeg.pos().plus(chord.measure()!.pos()).plus(isGrace ? chord.pos() : new PointF())
        if (chord.vStaffIdx() !== tieSegment.vStaffIdx()) {
            const system = tieSegment.system()!
            const yDiff = system.staff(chord.vStaffIdx())!.y() - system.staff(tie.staffIdx())!.y()
            systemPos = systemPos.plus(new PointF(0.0, yDiff))
        }

        const isOuterTieOfChord = tie.isOuterTieOfChord(startOrEnd)

        const dotsPlacement = tie.style().styleV(Sid.tieDotsPlacement) as TieDotsPlacement
        const clearAllDots = start && dotsPlacement === TieDotsPlacement.AFTER_DOTS && !isOuterTieOfChord
                             && chord.dots() > 0 && !ChordLayout.chordHasDotsAllInvisible(chord)
        if (clearAllDots) {
            let dotsOuterEdge = -Number.MAX_VALUE
            for (const n of chord.notes()) {
                for (const dot of n.dots()) {
                    dotsOuterEdge = Math.max(dotsOuterEdge, dot.x() + dot.width() + n.x())
                }
            }
            dotsOuterEdge += systemPos.x()
            resultingX = dotsOuterEdge + padding
            tieSegment.addAdjustmentOffset(new PointF(resultingX - tiePoint.x(), 0.0), startOrEnd)
            tiePoint.setX(resultingX)
            return
        }

        if (isOuterTieOfChord) {
            const otherTie = start ? note.tieBack() : note.tieFor()
            const avoidOtherTie = !!otherTie && otherTie.up() === tie.up() && !otherTie.isInside()
            if (avoidOtherTie) {
                resultingX += 0.1 * spatium * (start ? 1 : -1)
            }
        }

        const avoidStem = !!chord.stem() && chord.stem()!.visible() && chord.up() === tie.up()

        if (isOuterTieOfChord && !avoidStem) {
            tieSegment.addAdjustmentOffset(new PointF(resultingX - tiePoint.x(), 0.0), startOrEnd)
            tiePoint.setX(resultingX)
            return
        }

        const shape = isGrace ? chord.shape().translate(systemPos) : chordSeg.staffShape(chord.vStaffIdx()).translated(systemPos)
        const ignoreDot = start && (isOuterTieOfChord || dotsPlacement === TieDotsPlacement.BEFORE_DOTS)
        const ignoreLvSeg = tieSegment.isLaissezVibSegment()
        const ignoreArpeggio = note === chord.downNote() && !tie.up()
        const ignoreParen = tieSegment.isLaissezVibSegment() && start
        const ignoreAccidental = (acc: Accidental): boolean => {
            const accIsInwardOfTie = tie.up() ? acc.line() >= note.line() : acc.line() <= note.line()
            return !start && isOuterTieOfChord && accIsInwardOfTie
        }

        shape.remove_if((s) => {
            const item = s.item()
            return !item || item === note || IGNORED_TYPES_FOR_TIE_X.has(item.type())
                   || (item.isNoteDot() && ignoreDot)
                   || (item.isAccidental() && ignoreAccidental(item as Accidental))
                   || (item.isLaissezVibSegment() && ignoreLvSeg)
                   || ((item.isArpeggio() || item.isChordBracket()) && ignoreArpeggio)
                   || (item.isParenthesis() && ignoreParen)
                   || !item.addToSkyline()
        })

        const arcSideMargin = 0.3 * spatium
        const pointsSideMargin = 0.15 * spatium
        const yBelow = tiePoint.y() - (tie.up() ? arcSideMargin : pointsSideMargin)
        const yAbove = tiePoint.y() + (tie.up() ? pointsSideMargin : arcSideMargin)
        let pointToClear = start ? shape.rightMostEdgeAtHeight(yBelow, yAbove) : shape.leftMostEdgeAtHeight(yBelow, yAbove)
        pointToClear += padding

        resultingX = start ? Math.max(resultingX, pointToClear) : Math.min(resultingX, pointToClear)

        resultingX = SlurTieLayout.adjustXforLedgerLines(tieSegment, start, chord, note, systemPos, padding, resultingX)

        tieSegment.addAdjustmentOffset(new PointF(resultingX - tiePoint.x(), 0.0), startOrEnd)
        tiePoint.setX(resultingX)
    }

    private static adjustXforLedgerLines(tieSegment: TieSegment, start: boolean, chord: Chord, note: Note, chordSystemPos: PointF,
                                         padding: number, resultingX: number): number {
        if (tieSegment.tie().isInside() || chord.ledgerLines().length === 0) {
            return resultingX
        }

        const isOuterNote = note === chord.upNote() || note === chord.downNote()
        if (isOuterNote) {
            return resultingX
        }

        let ledgersAbove = false
        let ledgersBelow = false
        for (const ledger of chord.ledgerLines()) {
            if (ledger.y() < 0.0) {
                ledgersAbove = true
            } else {
                ledgersBelow = true
            }
            if (ledgersAbove && ledgersBelow) {
                break
            }
        }

        const noteLine = note.line()
        const isOddLine = noteLine % 2 !== 0
        const isAboveStaff = noteLine <= 0
        const isBelowStaff = noteLine >= 2 * (note.staff()!.lines(note.tick()) - 1)
        const isInsideStaff = !isAboveStaff && !isBelowStaff
        if (isOddLine || isInsideStaff || (isAboveStaff && !ledgersAbove) || (isBelowStaff && !ledgersBelow)) {
            return resultingX
        }

        const noteShape = note.shape()
        noteShape.remove_if((s) => {
            const item = s.item()!
            return !item.addToSkyline() || item.isNoteDot() || (tieSegment.isLaissezVibSegment() && item.isLaissezVibSegment())
        })
        noteShape.translate(note.pos().plus(chordSystemPos))
        const xNoteEdge = (start ? noteShape.right() : -noteShape.left()) + padding

        return start ? Math.max(resultingX, xNoteEdge) : Math.min(resultingX, xNoteEdge)
    }

    private static adjustYforLedgerLines(tieSegment: TieSegment, sPos: SlurTiePos): void {
        const tie = tieSegment.tie()
        const note = tieSegment.isSingleBeginType() ? tie.startNote() : tie.endNote()
        if (!note) {
            return
        }
        const chord = note.chord()
        if (chord.ledgerLines().length === 0) {
            return
        }

        const chordSystemPos = chord.pos().plus(chord.segment()!.pos()).plus(chord.segment()!.measure().pos())
        const tiePoint = tieSegment.isSingleBeginType() ? sPos.p1 : sPos.p2
        const spatium = tie.spatium()
        const upSign = tie.up() ? -1 : 1
        const margin = 0.4 * spatium

        for (const ledger of chord.ledgerLines()) {
            const ledgerPos = ledger.pos().plus(chordSystemPos)
            const yDiff = upSign * (ledgerPos.y() - tiePoint.y())
            const collision = yDiff > 0 && yDiff < margin
            if (collision) {
                const d = new PointF(0.0, -upSign * (margin - yDiff))
                sPos.p1 = sPos.p1.plus(d)
                sPos.p2 = sPos.p2.plus(d)
                SlurTieLayout.computeTieBezier(tieSegment)
                break
            }
        }
    }

    private static adjustY(tieSegment: TieSegment): void {
        const staff = tieSegment.score() ? tieSegment.score().staff(tieSegment.vStaffIdx()) : null
        if (!staff) {
            return
        }

        const spatium = tieSegment.spatium()
        const ldata = tieSegment.mutldata()
        ldata.setPos(new PointF())
        ldata.moveY(tieSegment.staffOffsetY())

        const tick = tieSegment.tick()

        SlurTieLayout.computeTieBezier(tieSegment)

        const up = tieSegment.tie().up()
        const upSign = up ? -1 : 1

        // 1. Check for bad end point protrusion

        const staffLineDist = staff.lineDistance(tick) * spatium
        const staffLineThickness = tieSegment.style().styleMM(Sid.staffLineWidth) * staff.staffMag(tick)
        const endPointY = tieSegment.ups(Grip.START).p.y()
        const closestLineToEndpoints = up ? Math.floor(endPointY / staffLineDist) : Math.ceil(endPointY / staffLineDist)
        const isEndInsideStaff = closestLineToEndpoints >= 0 && closestLineToEndpoints < staff.lines(tick)
        const isEndInsideLedgerLines = !isEndInsideStaff && !tieSegment.tie().isOuterTieOfChord(Grip.START)

        const halfLineThicknessCorrection = 0.5 * staffLineThickness * upSign
        const protrusion = Math.abs(endPointY - (closestLineToEndpoints * spatium - halfLineThicknessCorrection))
        const badIntersectionLimit = 0.15 * spatium // TODO: style

        const badIntersection = protrusion < badIntersectionLimit && (isEndInsideStaff || isEndInsideLedgerLines)
        if (badIntersection) {
            const correctedY = closestLineToEndpoints * spatium + halfLineThicknessCorrection + badIntersectionLimit * upSign
            tieSegment.addAdjustmentOffset(new PointF(0.0, correctedY - endPointY), Grip.START)
            tieSegment.addAdjustmentOffset(new PointF(0.0, correctedY - endPointY), Grip.END)
            tieSegment.ups(Grip.START).p.setY(correctedY)
            tieSegment.ups(Grip.END).p.setY(correctedY)
            SlurTieLayout.computeTieBezier(tieSegment)
        }

        // 2. Check for bad arc protrusion

        const tieSegmentBBox = tieSegment.ldata().bbox()
        const tieLength = tieSegmentBBox.width()
        const tieHeight = tieSegmentBBox.height()
        const midThickness = tieSegment.ldata().midThickness * 2
        const yOuterApogee = up ? tieSegmentBBox.top() : tieSegmentBBox.bottom()
        const yInnerApogee = yOuterApogee - midThickness * upSign
        const yMidApogee = 0.5 * (yOuterApogee + yInnerApogee)

        const closestLineToArc = stdRound(yMidApogee / staffLineDist)
        const isArcInsideStaff = closestLineToArc >= 0 && closestLineToArc < staff.lines(tick)
        if (!isArcInsideStaff) {
            return
        }

        const outwardMargin = -upSign * (yOuterApogee - (closestLineToArc * staffLineDist - halfLineThicknessCorrection))
        const inwardMargin = upSign * (yInnerApogee - (closestLineToArc * staffLineDist + halfLineThicknessCorrection))
        const badArcIntersectionLimit = tieLength < 3 * spatium ? 0.1 * spatium : 0.15 * spatium

        const increaseArc = outwardMargin - 0.5 * badArcIntersectionLimit < inwardMargin
        let correctOutwards = inwardMargin < badArcIntersectionLimit && increaseArc
        const correctInwards = outwardMargin < badArcIntersectionLimit && !increaseArc

        if (!correctInwards && !correctOutwards) {
            return
        }

        const isSmallTie = tieLength < 2.0 * spatium && tieHeight < 0.7 * spatium
        if (isSmallTie) {
            const tie2 = tieSegment.tie()
            const isInside = tie2.isInside()
            const isOuterOfChord = tie2.isOuterTieOfChord(Grip.START) || tie2.isOuterTieOfChord(Grip.END)
            const hasTiedSecondInside = tie2.hasTiedSecondInside()
            if (!isInside && !isOuterOfChord && !hasTiedSecondInside && !SlurTieLayout.hasEndPointAboveNote(tieSegment)) {
                const currentY = tieSegment.ups(Grip.START).p.y()
                const yCorrection = -upSign * (badArcIntersectionLimit - outwardMargin)
                tieSegment.addAdjustmentOffset(new PointF(0.0, yCorrection), Grip.START)
                tieSegment.addAdjustmentOffset(new PointF(0.0, yCorrection), Grip.END)
                tieSegment.ups(Grip.START).p.setY(currentY + yCorrection)
                tieSegment.ups(Grip.END).p.setY(currentY + yCorrection)
                SlurTieLayout.computeTieBezier(tieSegment)
                return
            } else {
                correctOutwards = true
            }
        }

        let arcCorrection = correctOutwards ? (badArcIntersectionLimit - inwardMargin) : (badArcIntersectionLimit - outwardMargin)
        const maxArcCorrection = 0.75 * tieHeight
        let rest = arcCorrection > maxArcCorrection ? arcCorrection - maxArcCorrection : 0.0
        arcCorrection = Math.min(arcCorrection, maxArcCorrection)

        if (correctOutwards) {
            if (rest > 0) {
                rest *= upSign
                const currentY = tieSegment.ups(Grip.START).p.y()
                tieSegment.addAdjustmentOffset(new PointF(0.0, rest), Grip.START)
                tieSegment.addAdjustmentOffset(new PointF(0.0, rest), Grip.END)
                tieSegment.ups(Grip.START).p.setY(currentY + rest)
                tieSegment.ups(Grip.END).p.setY(currentY + rest)
            }
            SlurTieLayout.computeTieBezier(tieSegment, new PointF(0.0, -arcCorrection))
        } else if (correctInwards) {
            SlurTieLayout.computeTieBezier(tieSegment, new PointF(0.0, arcCorrection))
        }
    }

    private static hasEndPointAboveNote(tieSegment: TieSegment): boolean {
        const startNote = tieSegment.tie().startNote()
        const endNote = tieSegment.tie().endNote()
        if ((tieSegment.isSingleBeginType() && !startNote) || (tieSegment.isSingleEndType() && !endNote)) {
            return false
        }
        if (!startNote || !endNote) {
            return false
        }

        const startChord = startNote.chord()
        const startNotePos = startNote.pos().plus(startChord.pos()).plus(startChord.segment()!.pos()).plus(startChord.measure()!.pos())
        const endChord = endNote.chord()
        const endNotePos = endNote.pos().plus(endChord.pos()).plus(endChord.segment()!.pos()).plus(endChord.measure()!.pos())

        const tieStartPos = tieSegment.ups(Grip.START).pos()
        const tieEndPos = tieSegment.ups(Grip.END).pos()

        return (tieStartPos.x() < startNotePos.x() + startNote.width() && !startNote.shouldHideFret())
               || (tieEndPos.x() > endNotePos.x() && !endNote.shouldHideFret())
    }

    static resolveVerticalTieCollisions(stackedTies: readonly TieSegment[]): void {
        if (stackedTies.length < 2) {
            return
        }

        const downwardTies: TieSegment[] = []
        const upwardTies: TieSegment[] = []

        for (const tieSegment of stackedTies) {
            if (!tieSegment.tie().up()) {
                downwardTies.unshift(tieSegment)
            } else {
                upwardTies.push(tieSegment)
            }
        }

        const fixTieCollision = (thisTie: TieSegment, nextTie: TieSegment): void => {
            const spatium = thisTie.spatium()
            const up = thisTie.tie().up()
            const upSign = up ? -1 : 1
            const thisTieOuterY = up ? thisTie.ldata().bbox().top() : thisTie.ldata().bbox().bottom()
            const nextTieInnerY = (up ? nextTie.ldata().bbox().top() : nextTie.ldata().bbox().bottom())
                                  - upSign * 2 * nextTie.ldata().midThickness
            const clearanceMargin = 0.15 * spatium
            const collision = upSign * (nextTieInnerY - thisTieOuterY) < clearanceMargin
            if (!collision) {
                return
            }

            if (!thisTie.score()) {
                return
            }
            const staff = thisTie.score().staff(thisTie.vStaffIdx())
            if (!staff) {
                return
            }
            const tick = thisTie.tick()
            let yMidPoint = 0.5 * (thisTieOuterY + nextTieInnerY)
            const halfLineDist = 0.5 * staff.lineDistance(tick) * spatium
            const midLine = stdRound(yMidPoint / halfLineDist)
            const insideStaff = midLine >= -1 && midLine <= 2 * (staff.lines(tick) - 1) + 1
            if (insideStaff) {
                yMidPoint = midLine * halfLineDist // If inside staff, center-align with line or space
            }

            const thisTieYCorrection = yMidPoint - upSign * 0.5 * clearanceMargin - thisTieOuterY
            const nextTieYCorrection = yMidPoint + upSign * 0.5 * clearanceMargin - nextTieInnerY

            const thisShoulderOff = thisTie.adjustmentOffset(Grip.BEZIER1).y()
            const nextShoulderOff = nextTie.adjustmentOffset(Grip.BEZIER1).y()
            thisTie.addAdjustmentOffset(new PointF(0.0, -thisShoulderOff), Grip.BEZIER1)
            thisTie.addAdjustmentOffset(new PointF(0.0, -thisShoulderOff), Grip.BEZIER2)
            nextTie.addAdjustmentOffset(new PointF(0.0, -nextShoulderOff), Grip.BEZIER1)
            nextTie.addAdjustmentOffset(new PointF(0.0, -nextShoulderOff), Grip.BEZIER2)

            SlurTieLayout.computeTieBezier(thisTie, new PointF(0.0, -upSign * (thisShoulderOff + thisTieYCorrection)))
            SlurTieLayout.computeTieBezier(nextTie, new PointF(0.0, -upSign * (nextShoulderOff + nextTieYCorrection)))
        }

        for (let i = 0; i + 1 < upwardTies.length; ++i) {
            fixTieCollision(upwardTies[i], upwardTies[i + 1])
        }
        for (let i = 0; i + 1 < downwardTies.length; ++i) {
            fixTieCollision(downwardTies[i], downwardTies[i + 1])
        }
    }

    static computeUp(slur: Slur, ctx: LayoutContext): void {
        switch (slur.slurDirection()) {
        case DirectionV.UP:
            slur.setUp(true)
            break
        case DirectionV.DOWN:
            slur.setUp(false)
            break
        case DirectionV.AUTO: {
            //
            // assumption:
            // slurs have only chords or rests as start/end elements
            //
            const chordRest1 = slur.startCR()
            const chordRest2 = slur.endCR()
            if (!chordRest1 || !chordRest2) {
                slur.setUp(true)
                break
            }
            const chord1 = chordRest1.isChord() ? chordRest1 as Chord : null
            const chord2 = chordRest2.isChord() ? chordRest2 as Chord : null

            if (chord2 && !chord2.staff()!.isDrumStaff(chord2.tick())
                && chordRest1.measure()!.system() !== chordRest2.measure()!.system()) {
                // HACK: if the end chord is in a different system, it may have never been laid out yet.
                // But we need to know its direction to decide slur direction, so need to compute it here.
                for (const note of chord2.notes()) {
                    note.updateLine() // because chord direction is based on note lines
                }
                ChordLayout.computeUp(chord2, ctx)
            }

            if (chord1 && chord1.beam() && chord1.beam()!.cross()) {
                // TODO: stem direction is not finalized, so we cannot use it here
                slur.setUp(true)
                break
            }

            slur.setUp(!chordRest1.up())

            // Check if multiple voices
            let multipleVoices = false
            let m1: Measure | null = chordRest1.measure()
            while (m1 && m1.tick().le(chordRest2.tick())) {
                if (m1.hasVoicesInRange(chordRest1.staffIdx(), slur.tick(), slur.ticks().plus(chordRest2.ticks())) && chord1) {
                    multipleVoices = true
                    break
                }
                m1 = m1.nextMeasure()
            }
            if (multipleVoices) {
                // slurs go above if there are multiple voices in the measure
                if (chordRest1.voice() > 0 || chordRest2.voice() > 0) {
                    slur.setUp(false)
                } else {
                    slur.setUp(true)
                }
            } else if (chord1 && chord2 && !chord1.isGrace() && SlurTieLayout.isDirectionMixture(chord1, chord2, ctx)) {
                // slurs go above if start and end note have different stem directions,
                // but grace notes are exceptions
                slur.setUp(true)
            } else if (chord1 && chord2 && chord1.isGrace() && chord2 !== chord1.parent() && SlurTieLayout.isDirectionMixture(chord1, chord2, ctx)) {
                slur.setUp(true)
            }
        }
            break
        }
    }

    /** C++ computeBezier(TieSegment*, PointF) */
    static computeTieBezier(tieSeg: TieSegment, shoulderOffset: PointF = new PointF()): void {
        const tieStart = tieSeg.ups(Grip.START).p.plus(tieSeg.ups(Grip.START).off)
        const tieEnd = tieSeg.ups(Grip.END).p.plus(tieSeg.ups(Grip.END).off)

        if (!RealIsEqualOrMore(tieEnd.x(), tieStart.x())) {
            return
        }

        let tieEndNormalized = tieEnd.minus(tieStart) // normalize to zero
        if (RealIsNull(tieEndNormalized.x())) {
            return
        }

        const tieAngle = Math.atan(tieEndNormalized.y() / tieEndNormalized.x()) // angle required from tie start to tie end--zero if horizontal
        const t = new Transform()
        t.rotateRadians(-tieAngle) // rotate so that we are working with horizontal ties regardless of endpoint height difference
        tieEndNormalized = t.map(tieEndNormalized) // apply that rotation
        shoulderOffset = t.map(shoulderOffset) // also apply to shoulderOffset

        const _spatium = tieSeg.spatium()
        const tieLengthInSp = tieEndNormalized.x() / _spatium

        const minShoulderHeight = tieSeg.minShoulderHeight()
        const maxShoulderHeight = tieSeg.maxShoulderHeight()
        let shoulderH = minShoulderHeight + _spatium * 0.3 * Math.sqrt(Math.abs(tieLengthInSp - 1))
        shoulderH = clamp(shoulderH, minShoulderHeight, maxShoulderHeight)

        shoulderH -= shoulderOffset.y()

        const shoulderAdjustOffset = tieSeg.tie().up() ? new PointF(0.0, shoulderOffset.y()) : new PointF(0.0, -shoulderOffset.y())
        tieSeg.addAdjustmentOffset(shoulderAdjustOffset, Grip.BEZIER1)
        tieSeg.addAdjustmentOffset(shoulderAdjustOffset, Grip.BEZIER2)

        if (!tieSeg.tie().up()) {
            shoulderH = -shoulderH
        }

        const shoulderW = 0.6 // TODO: style
        const tieWidth = tieEndNormalized.x()
        const bezier1X = (tieWidth - tieWidth * shoulderW) * 0.5 + shoulderOffset.x()
        const bezier2X = bezier1X + tieWidth * shoulderW + shoulderOffset.x()

        const tieDrag = new PointF(tieWidth * 0.5, 0.0)
        const bezier1 = new PointF(bezier1X, -shoulderH)
        const bezier2 = new PointF(bezier2X, -shoulderH)

        SlurTieLayout.computeMidThickness(tieSeg, tieLengthInSp)

        const tieThickness = new PointF(0.0, tieSeg.ldata().midThickness)

        const bezier1Offset = t.map(tieSeg.ups(Grip.BEZIER1).off)
        const bezier2Offset = t.map(tieSeg.ups(Grip.BEZIER2).off)

        //-----------------------------------%<----------------------------------------
        const bezier1Final = bezier1.plus(bezier1Offset)
        const bezier2Final = bezier2.plus(bezier2Offset)

        const tieShoulder = bezier1Final.plus(bezier2Final).times(0.5)
        //-----------------------------------%<----------------------------------------

        let path = new PainterPath()
        path.moveTo(new PointF())
        path.cubicTo(bezier1.plus(bezier1Offset).minus(tieThickness), bezier2.plus(bezier2Offset).minus(tieThickness), tieEndNormalized)
        if (tieSeg.tie().styleType() === SlurStyleType.Solid) {
            path.cubicTo(bezier2.plus(bezier2Offset).plus(tieThickness), bezier1.plus(bezier1Offset).plus(tieThickness), new PointF())
        }

        t.reset()
        t.translate(tieStart.x(), tieStart.y())
        t.rotateRadians(tieAngle)
        path = t.mapPath(path)
        tieSeg.mutldata().path = path

        tieSeg.ups(Grip.BEZIER1).p = t.map(bezier1)
        tieSeg.ups(Grip.BEZIER2).p = t.map(bezier2)
        tieSeg.ups(Grip.END).p = t.map(tieEndNormalized).minus(tieSeg.ups(Grip.END).off)
        tieSeg.ups(Grip.DRAG).p = t.map(tieDrag)
        tieSeg.ups(Grip.SHOULDER).p = t.map(tieShoulder)

        SlurTieLayout.fillShape(tieSeg, tieLengthInSp)
    }

    /** C++ computeBezier(SlurSegment*, PointF) */
    static computeSlurBezier(slurSeg: SlurSegment, shoulderOffset: PointF = new PointF()): void {
        /* ************************************************
         * LEGEND: pp1 = start point
         *         pp2 = end point
         *         p2 = end point (in slur coordinates)
         *         p3 = first bezier point (in slur coord.)
         *         p4 = second bezier point (in slur coord.)
         *         p5 = whole slur drag point (in slur coord.)
         *         p6 = shoulder drag point (in slur coord.)
         * REMEMBER! ups().pos() = ups().p + ups().off
         * ***********************************************/

        // Avoid staff lines
        if (slurSeg.autoplace()) {
            SlurTieLayout.adjustEndPoints(slurSeg)
        }

        // If end point adjustment is locked, restore the endpoints to
        // where they were before
        if (slurSeg.isEndPointsEdited()) {
            slurSeg.ups(Grip.START).off = slurSeg.ups(Grip.START).off.plus(slurSeg.endPointOff1())
            slurSeg.ups(Grip.END).off = slurSeg.ups(Grip.END).off.plus(slurSeg.endPointOff2())
        }

        // Get start and end points (have to be calculated after adjustEndpoints())
        let pp1 = slurSeg.ups(Grip.START).p.plus(slurSeg.ups(Grip.START).off)
        let pp2 = slurSeg.ups(Grip.END).p.plus(slurSeg.ups(Grip.END).off)

        // Keep track of the original endpoints before collision adjustments
        const oldp1 = pp1.clone()
        const oldp2 = pp2.clone()

        // Set up coordinate transforms
        // CAUTION: transform operations are applies in reverse order to how
        // they are added to the transformation.
        const slurAngle = Math.atan((pp2.y() - pp1.y()) / (pp2.x() - pp1.x()))
        const rotate = new Transform()
        rotate.rotateRadians(-slurAngle)
        let toSlurCoordinates = new Transform()
        toSlurCoordinates.rotateRadians(-slurAngle)
        toSlurCoordinates.translate(-pp1.x(), -pp1.y())
        let toSystemCoordinates = toSlurCoordinates.inverted()
        // Transform p2 and shoulder offset
        let p2 = toSlurCoordinates.map(pp2)
        shoulderOffset = rotate.map(shoulderOffset)

        // COMPUTE DEFAULT SLUR SHAPE
        // Compute default shoulder height and width
        const _spatium = slurSeg.spatium()
        let shoulderW: number // expressed as fraction of slur-length
        const d = p2.x() / _spatium
        if (d < 0) {
            return
        }
        if (d < 2) {
            shoulderW = 0.60
        } else if (d < 10) {
            shoulderW = 0.5
        } else if (d < 18) {
            shoulderW = 0.6
        } else {
            shoulderW = 0.7
        }

        const shoulderH = SlurTieLayout.computeShoulderHeight(slurSeg, d, shoulderOffset)

        // Compute bezier point position
        const c = p2.x()
        const c1 = (c - c * shoulderW) * 0.5 + shoulderOffset.x()
        const c2 = c1 + c * shoulderW + shoulderOffset.x()
        const p3 = new PointF(c1, -shoulderH)
        const p4 = new PointF(c2, -shoulderH)
        // Set Bezier points default position
        slurSeg.ups(Grip.BEZIER1).p = toSystemCoordinates.map(p3)
        slurSeg.ups(Grip.BEZIER2).p = toSystemCoordinates.map(p4)
        // Add offsets
        const p3o = p3.plus(shoulderOffset).plus(rotate.map(slurSeg.ups(Grip.BEZIER1).off))
        const p4o = p4.plus(shoulderOffset).plus(rotate.map(slurSeg.ups(Grip.BEZIER2).off))
        p3.setX(p3o.x()); p3.setY(p3o.y())
        p4.setX(p4o.x()); p4.setY(p4o.y())
        slurSeg.ups(Grip.BEZIER1).off = slurSeg.ups(Grip.BEZIER1).off.plus(rotate.inverted().map(shoulderOffset))
        slurSeg.ups(Grip.BEZIER2).off = slurSeg.ups(Grip.BEZIER2).off.plus(rotate.inverted().map(shoulderOffset))

        // ADAPT SLUR SHAPE AND POSITION TO AVOID COLLISIONS
        if (slurSeg.autoplace() && !slurSeg.isTappingHalfSlurSegment()) {
            SlurTieLayout.avoidCollisions(slurSeg, pp1, p2, p3, p4, toSystemCoordinates, slurAngle)
        }

        // Re-check end points for bad staff line collisions
        slurSeg.ups(Grip.START).p = pp1.minus(slurSeg.ups(Grip.START).off)
        slurSeg.ups(Grip.END).p = toSystemCoordinates.map(p2).minus(slurSeg.ups(Grip.END).off)
        SlurTieLayout.adjustEndPoints(slurSeg)
        const newpp1 = slurSeg.ups(Grip.START).p.plus(slurSeg.ups(Grip.START).off)
        const difference = rotate.map(newpp1.minus(pp1))
        pp1 = newpp1
        pp2 = slurSeg.ups(Grip.END).p.plus(slurSeg.ups(Grip.END).off)
        const p3d = p3.minus(difference)
        const p4d = p4.minus(difference)

        // Keep track of the total endpoint adjustments made by collision avoidance,
        // so that they can be restored if needed
        if (!slurSeg.isEndPointsEdited()) {
            slurSeg.setEndPointOff1(pp1.minus(oldp1))
            slurSeg.setEndPointOff2(pp2.minus(oldp2))
        } else {
            slurSeg.setEndPointOff1(new PointF())
            slurSeg.setEndPointOff2(new PointF())
        }

        // Re-compute transforms
        toSlurCoordinates = new Transform()
        toSlurCoordinates.rotateRadians(-slurAngle)
        toSlurCoordinates.translate(-pp1.x(), -pp1.y())
        toSystemCoordinates = toSlurCoordinates.inverted()
        p2 = toSlurCoordinates.map(pp2)

        // Calculate p5 and p6
        const p5 = p2.times(0.5) // mid-point between pp1 and p2
        const p6 = p3d.plus(p4d).times(0.5) // mid-point between p3 and p4

        // Update all slur points
        slurSeg.ups(Grip.BEZIER1).p = toSystemCoordinates.map(p3d).minus(slurSeg.ups(Grip.BEZIER1).off)
        slurSeg.ups(Grip.BEZIER2).p = toSystemCoordinates.map(p4d).minus(slurSeg.ups(Grip.BEZIER2).off)
        slurSeg.ups(Grip.DRAG).p = toSystemCoordinates.map(p5)
        slurSeg.ups(Grip.SHOULDER).p = toSystemCoordinates.map(p6)

        // Calculate slur midpoint thickness
        SlurTieLayout.computeMidThickness(slurSeg, p2.x() / slurSeg.spatium())

        // Create path
        const thick = new PointF(0.0, slurSeg.ldata().midThickness)
        let path = new PainterPath()
        path.moveTo(new PointF())
        path.cubicTo(p3d.minus(thick), p4d.minus(thick), p2)
        if (slurSeg.slur().styleType() === SlurStyleType.Solid) {
            path.cubicTo(p4d.plus(thick), p3d.plus(thick), new PointF())
        }
        path = toSystemCoordinates.mapPath(path)
        slurSeg.mutldata().path = path

        // Fill shape
        SlurTieLayout.fillShape(slurSeg, p2.x() / slurSeg.spatium())
    }

    private static computeShoulderHeight(slurSeg: SlurSegment, slurLengthInSp: number, shoulderOffset: PointF): number {
        const spatium = slurSeg.spatium()

        // TODO(port): tapping half slurs

        let shoulderH = Math.sqrt(slurLengthInSp / 4) * spatium

        const shoulderReduction = 0.75
        if (SlurTieLayout.isOverBeams(slurSeg.slur())) {
            shoulderH *= shoulderReduction
        }

        shoulderH -= shoulderOffset.y()

        if (!slurSeg.slur().up()) {
            shoulderH = -shoulderH
        }

        return shoulderH
    }

    private static isDirectionMixture(c1: Chord, c2: Chord, ctx: LayoutContext): boolean {
        if (c1.track() !== c2.track()) {
            return false
        }
        const up = c1.up()
        if (c2.isGrace() && c2.up() !== up) {
            return true
        }
        if (c1.isGraceBefore() && c2.isGraceAfter() && c1.parentItem() === c2.parentItem()) {
            const parent = c1.parentItem() as Chord
            if (parent.stem() && parent.up() !== up) {
                return true
            }
        }
        const track = c1.track()
        for (let seg: Segment | null = c1.segment(); seg && seg.tick().le(c2.tick()); seg = seg.next1(SegmentType.ChordRest)) {
            if ((c1.isGrace() || c2.isGraceBefore()) && seg.tick().eq(c2.tick())) {
                // if slur goes from a grace note to its parent, or from a chord to a grace note that's attached to the next chord,
                // we don't need to check the direction of the parent
                return false
            }
            const e = seg.element(track)
            if (!e || !e.isChord()) {
                continue
            }
            const c = e as Chord
            const m = c.measure()!
            const c1Sys = c1.measure()!.system()
            const cSys = m.system()
            if (!c.staff()!.isDrumStaff(c.tick()) && c1Sys && cSys && c1Sys !== cSys) {
                // This chord is on a different system and may not have been laid out yet
                for (const note of c.notes()) {
                    note.updateLine() // because chord direction is based on note lines
                }
                ChordLayout.computeUp(c, ctx)
            }

            if (c.up() !== up) {
                return true
            }
        }
        return false
    }

    private static shouldHideSlurSegment(item: SlurSegment): boolean {
        if (item.isHammerOnPullOffSegment()) {
            return false
        }
        const stType = item.staffType()
        if (stType && stType.isHiddenElementOnTab(Sid.slurShowTabCommon, Sid.slurShowTabSimple)) {
            return true
        }
        return false
    }

    private static addLineAttachPoints(segment: TieSegment): void {
        // Add tie attach point to start and end note
        const tie = segment.tie()
        const startNote = tie.startNote()
        const endNote = tie.endNote()
        const singleOrBegin = segment.spannerSegmentType() === SpannerSegmentType.SINGLE
                              || segment.spannerSegmentType() === SpannerSegmentType.BEGIN
        const singleOrEnd = segment.spannerSegmentType() === SpannerSegmentType.SINGLE
                            || segment.spannerSegmentType() === SpannerSegmentType.END
        if (startNote && singleOrBegin) {
            startNote.addStartLineAttachPoint(segment.ups(Grip.START).pos(), tie)
        }
        if (endNote && singleOrEnd) {
            endNote.addEndLineAttachPoint(segment.ups(Grip.END).pos(), tie)
        }
    }

    static calculateDirection(item: Tie): void {
        if (!item.startNote() && !item.endNote()) {
            return
        }

        const tieHasBothNotes = !!item.startNote() && !!item.endNote()
        const primaryNote = item.startNote() ? item.startNote()! : item.endNote()!
        const primaryChord = primaryNote.chord()
        const primaryMeasure = primaryChord.measure()!
        const secondaryNote = tieHasBothNotes ? item.endNote() : null
        const secondaryChord = secondaryNote ? secondaryNote.chord() : null
        const secondaryMeasure = secondaryChord ? secondaryChord.measure() : null

        if (item.slurDirection() === DirectionV.AUTO) {
            const notes = primaryChord.notes()
            const n = notes.length
            const st = item.staff()!.staffType(primaryNote ? primaryNote.tick() : new Fraction(0, 1))
            const simpleException = !!st && st.isSimpleTabStaff()
            // if there are multiple voices, the tie direction goes on stem side
            if (primaryMeasure.hasVoicesInRange(primaryChord.staffIdx(), primaryChord.tick(), primaryChord.actualTicks())) {
                item.setUp(simpleException ? isUpVoice(primaryChord.voice()) : primaryChord.up())
            } else if (tieHasBothNotes && secondaryMeasure!.hasVoicesInRange(secondaryChord!.staffIdx(), secondaryChord!.tick(),
                                                                             secondaryChord!.actualTicks())) {
                item.setUp(simpleException ? isUpVoice(secondaryChord!.voice()) : secondaryChord!.up())
            } else if (n === 1) {
                //
                // single note
                //
                if (tieHasBothNotes && primaryChord.up() !== secondaryChord!.up()) {
                    // if stem directions are mixed, always up
                    item.setUp(true)
                } else {
                    item.setUp(!primaryChord.up())
                }
            } else {
                //
                // chords
                //
                // first, find pivot point in chord (below which all ties curve down and above which all ties curve up)
                let pivotPoint: Note | null = null
                let multiplePivots = false
                for (let i = 0; i < n - 1; ++i) {
                    if (!notes[i].tieFor()) {
                        continue // don't include notes that don't have ties
                    }
                    for (let j = i + 1; j < n; ++j) {
                        if (!notes[j].tieFor()) {
                            continue
                        }
                        const noteDiff = compareNotesPos(notes[i], notes[j])
                        if (!multiplePivots && Math.abs(noteDiff) <= 1) {
                            // TODO: Fix unison ties somehow--if noteDiff == 0 then we need to determine which of the unison is 'lower'
                            if (pivotPoint) {
                                multiplePivots = true
                                pivotPoint = null
                            } else {
                                pivotPoint = noteDiff < 0 ? notes[i] : notes[j]
                            }
                        }
                    }
                }
                if (!pivotPoint) {
                    // if the pivot point was not found (either there are no unisons/seconds or there are more than one),
                    // determine if this note is in the lower or upper half of this chord
                    let notesAbove = 0
                    let tiesAbove = 0
                    let notesBelow = 0
                    let tiesBelow = 0
                    let unisonTies = 0
                    for (let i = 0; i < n; ++i) {
                        if (notes[i] === primaryNote) {
                            // skip counting if this note is the current note or if this note doesn't have a tie
                            continue
                        }
                        const noteDiff = compareNotesPos(primaryNote, notes[i])
                        if (noteDiff === 0) { // unison
                            if (notes[i].tieFor()) {
                                unisonTies++
                            }
                        }
                        if (noteDiff < 0) { // the note is above startNote
                            notesAbove++
                            if (notes[i].tieFor()) {
                                tiesAbove++
                            }
                        }
                        if (noteDiff > 0) { // the note is below startNote
                            notesBelow++
                            if (notes[i].tieFor()) {
                                tiesBelow++
                            }
                        }
                    }

                    if (tiesAbove === 0 && tiesBelow === 0 && unisonTies === 0) {
                        // this is the only tie in the chord.
                        if (notesAbove === notesBelow) {
                            item.setUp(!primaryChord.up())
                        } else {
                            item.setUp(notesAbove < notesBelow)
                        }
                    } else if (tiesAbove === tiesBelow) {
                        // this note is dead center, so its tie should go counter to the stem direction
                        item.setUp(!primaryChord.up())
                    } else {
                        item.setUp(tiesAbove < tiesBelow)
                    }
                } else if (pivotPoint === primaryNote) {
                    // the current note is the lower of the only second or unison in the chord; tie goes down.
                    item.setUp(false)
                } else {
                    // if lower than the pivot, tie goes down, otherwise up
                    const noteDiff = compareNotesPos(primaryNote, pivotPoint)
                    item.setUp(noteDiff >= 0)
                }
            }
        } else {
            item.setUp(item.slurDirection() === DirectionV.UP)
        }
    }

    private static calculateIsInside(item: Tie): void {
        if (item.tiePlacement() !== TiePlacement.AUTO) {
            item.setIsInside(item.tiePlacement() === TiePlacement.INSIDE)
            return
        }

        const startN = item.startNote()
        const startChord = startN ? startN.chord() : null

        const endN = item.endNote()
        const endChord = endN ? endN.chord() : null

        if (!startChord && !endChord) {
            item.setIsInside(false)
            return
        }

        const startIsSingleNote = startChord ? startChord.notes().length <= 1 : false
        const endIsSingleNote = endChord ? endChord.notes().length <= 1 : false

        const shouldPlaceInside = startChord && endChord ? startIsSingleNote && endIsSingleNote : startIsSingleNote || endIsSingleNote
        if (shouldPlaceInside) {
            item.setIsInside((item.style().styleV(Sid.tiePlacementSingleNote) as TiePlacement) === TiePlacement.INSIDE)
        } else {
            item.setIsInside((item.style().styleV(Sid.tiePlacementChord) as TiePlacement) === TiePlacement.INSIDE)
        }
    }

    private static layoutSegment(item: SlurSegment, p1: PointF, p2: PointF): void {
        const ldata = item.mutldata()

        if (SlurTieLayout.shouldHideSlurSegment(item)) {
            ldata.setIsSkipDraw(true)
            return
        }

        ldata.setIsSkipDraw(false)
        ldata.setPos(new PointF())
        item.ups(Grip.START).p = p1.clone()
        item.ups(Grip.END).p = p2.clone()
        item.setExtraHeight(0.0)

        //Adjust Y pos to staff type offset before other calculations
        ldata.moveY(item.staffOffsetY())

        SlurTieLayout.computeSlurBezier(item)
    }

    private static computeMidThickness(slurTieSeg: SlurTieSegment, slurTieLengthInSp: number): void {
        const endWidth = slurTieSeg.endWidth()
        const midWidth = slurTieSeg.midWidth()
        const staff = slurTieSeg.score() ? slurTieSeg.score().staff(slurTieSeg.vStaffIdx()) : null
        const mag = staff ? staff.staffMag(slurTieSeg.slurTie().tick()) : 1.0
        const minTieLength = mag * slurTieSeg.style().styleS(Sid.minTieLength).val()
        const shortTieLimit = mag * 4.0
        const minTieThickness = mag * (0.15 * slurTieSeg.spatium() - endWidth)
        const normalThickness = mag * (midWidth - endWidth)

        const invalid = RealIsEqualOrMore(minTieLength, shortTieLimit)

        let finalThickness: number
        if (slurTieLengthInSp > shortTieLimit || invalid) {
            finalThickness = normalThickness
        } else {
            const A = 1 / (shortTieLimit - minTieLength)
            const B = normalThickness - minTieThickness
            const C = shortTieLimit * minTieThickness - minTieLength * normalThickness
            finalThickness = A * (B * slurTieLengthInSp + C)
        }

        const scalingFactor = slurTieSeg.slurTie().scalingFactor()
        finalThickness = Math.min(finalThickness, normalThickness * scalingFactor)

        slurTieSeg.mutldata().midThickness = finalThickness
    }

    private static fillShape(slurTieSeg: SlurTieSegment, slurTieLengthInSp: number): void {
        const shape = new Shape(undefined, null, ShapeType.Composite)
        let startPoint = slurTieSeg.ups(Grip.START).pos()
        const midThickness = 2 * slurTieSeg.ldata().midThickness
        let nbShapes = stdRound(5.0 * slurTieLengthInSp)
        nbShapes = Math.max(nbShapes, 20)
        nbShapes = Math.min(nbShapes, 50)
        const b = new CubicBezier(startPoint, slurTieSeg.ups(Grip.BEZIER1).pos(), slurTieSeg.ups(Grip.BEZIER2).pos(),
                                  slurTieSeg.ups(Grip.END).pos())
        for (let i = 1; i <= nbShapes; i++) {
            const percent = Math.pow(Math.sin(0.5 * Math.PI * (i / nbShapes)), 2)
            const point = b.pointAtPercent(percent)
            const re = RectF.fromPoints(startPoint, point).normalized()
            const approxThicknessAtPercent = (1 - 2 * Math.abs(0.5 - percent)) * midThickness
            if (re.height() < approxThicknessAtPercent) {
                const adjust = (approxThicknessAtPercent - re.height()) * 0.5
                re.adjust(0.0, -adjust, 0.0, adjust)
            }
            shape.add(re, slurTieSeg)
            startPoint = point
        }

        slurTieSeg.mutldata().setShape(shape)
    }

    static defaultStemLengthStart(tremolo: TremoloTwoChord): number {
        return TremoloLayout.extendedStemLenWithTwoNoteTremolo(tremolo,
            tremolo.chord1()!.defaultStemLength(),
            tremolo.chord2()!.defaultStemLength())[0]
    }

    static defaultStemLengthEnd(tremolo: TremoloTwoChord): number {
        return TremoloLayout.extendedStemLenWithTwoNoteTremolo(tremolo,
            tremolo.chord1()!.defaultStemLength(),
            tremolo.chord2()!.defaultStemLength())[1]
    }
}
