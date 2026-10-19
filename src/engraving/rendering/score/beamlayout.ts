/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/beamlayout.h/.cpp
 */

import { LineF, PointF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, stdRound } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { Constants } from '../../types/constants'
import { BeamMode, DirectionV, DurationType, track2staff } from '../../types/types'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { BeamSegment, ChordBeamAnchorType, NotePosition } from '../../dom/beambase'
import { Factory } from '../../dom/factory'
import { Groups } from '../../dom/groups'
import { Pid } from '../../dom/property'
import { SegmentType } from '../../dom/segment'
import { collectChordsAndRest } from '../../dom/utils'
import type { TDuration } from '../../dom/durationtype'
import type { Beam } from '../../dom/beam'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import type { Rest } from '../../dom/rest'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'
import { RestLayout } from './restlayout'
import { BeamTremoloLayout } from './beamtremololayout'
import { TremoloLayout } from './tremololayout'

export { ChordBeamAnchorType }

// SpannerSegmentType
enum SpannerSegmentType {
    SINGLE, BEGIN, MIDDLE, END,
}

function beamNoContinue(mode: BeamMode): boolean {
    return mode === BeamMode.END || mode === BeamMode.NONE || mode === BeamMode.INVALID
}

function beamModeMid(a: BeamMode): boolean {
    return a === BeamMode.MID || a === BeamMode.BEGIN16 || a === BeamMode.BEGIN32
}

function computeStemLengthAdjustmentSteps(cr: ChordRest, isStartOrEnd: boolean, isAbove: boolean, frenchStyleBeams: boolean,
                                          level: number, beamsAbove: number, beamsBelow: number): number {
    if (isAbove === cr.up()) { // beam segment on opposite side
        if (!frenchStyleBeams || isStartOrEnd) {
            return level - (isAbove ? beamsBelow : beamsAbove)
        }
    } else { // beamlet on the note side
        if (frenchStyleBeams && !isStartOrEnd) {
            return (isAbove ? beamsBelow : beamsAbove) - level
        }
    }
    return 0
}

export class BeamLayout {
    static layout(item: Beam, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        // all of the beam layout code depends on _elements being in order by tick
        // this may not be the case if two cr's were recently swapped.
        item.elements().sort((a, b) => (a.tick().lt(b.tick()) ? -1 : (b.tick().lt(a.tick()) ? 1 : 0)))
        let system = item.elements()[0].measure()!.system()
        item.setParent(system)

        let crl: ChordRest[] = []

        let n = 0
        for (const cr of item.elements()) {
            const newSystem = cr.measure()!.system()
            if (newSystem && newSystem !== system) {
                let st: SpannerSegmentType
                if (n === 0) {
                    st = SpannerSegmentType.BEGIN
                } else {
                    st = SpannerSegmentType.MIDDLE
                }
                ++n
                if (item.beamFragments().length < n) {
                    item.addBeamFragment({ py1: [0, 0], py2: [0, 0] })
                }
                BeamLayout.layout2(item, ctx, crl, st, n - 1)
                crl = []
                system = cr.measure()!.system()
            }
            crl.push(cr)
        }

        const beamShape = new Shape(undefined, null, ShapeType.Composite)

        if (crl.length) {
            let st: SpannerSegmentType
            if (n === 0) {
                st = SpannerSegmentType.SINGLE
            } else {
                st = SpannerSegmentType.END
            }
            if (item.beamFragments().length < (n + 1)) {
                item.addBeamFragment({ py1: [0, 0], py2: [0, 0] })
            }
            BeamLayout.layout2(item, ctx, crl, st, n)

            for (const bs of item.beamSegments()) {
                beamShape.add(bs.shape())
            }
        }

        ldata.setShape(beamShape)

        // The beam may have changed shape. one-note trems within this beam need to be layed out here
        for (const cr of item.elements()) {
            ChordLayout.computeUp(cr, ctx)
            if (cr.isChord() && (cr as Chord).tremoloSingleChord()) {
                TremoloLayout.layoutSingleChord((cr as Chord).tremoloSingleChord()!, ctx)
            }
        }
    }

    static layoutIfNeed(item: Beam, ctx: LayoutContext): void {
        if (!item.ldata().isValid()) {
            BeamLayout.layout(item, ctx)
        }
    }

    // ---------------------------------------------------------
    //   layout1
    // ---------------------------------------------------------

    static layout1(item: Beam, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        item.resetExplicitParent() // parent is System

        const staffType = item.staffType()
        item.setTab((staffType && staffType.isTabStaff()) ? staffType : null)
        item.setIsBesideTabStaff(!!item.tab() && !item.tab()!.stemless() && !item.tab()!.stemThrough())

        // TAB's with stem beside staves have special layout
        if (item.isBesideTabStaff()) {
            item.setUp(!item.tab()!.stemsDown())
            item.setSlope(0.0)
            item.setCross(false)
            item.setMinMove(0)
            item.setMaxMove(0)
            for (const cr of item.elements()) {
                if (cr.isChord()) {
                    item.setUp(cr.up())
                    break
                }
            }
            return
        }

        if (item.staff()!.isDrumStaff(item.tick())) {
            if (item.direction() !== DirectionV.AUTO) {
                item.setUp(item.direction() === DirectionV.UP)
            } else if (item.isGrace()) {
                item.setUp(true)
            } else {
                let firstUp = false
                let firstChord = true
                for (const cr of item.elements()) {
                    if (!cr.isChord()) {
                        item.setUp(firstUp)
                        continue
                    }
                    const chord = cr as Chord
                    const crDirection = chord.stemDirection()
                    if (crDirection !== DirectionV.AUTO) {
                        item.setUp(crDirection === DirectionV.UP)
                        break
                    }
                    if (firstChord) {
                        const staff = item.staff()
                        const part = staff ? staff.part() : null
                        const ds = part ? part.instrument(item.tick()).drumset() : null
                        firstUp = ds ? ds.stemDirection(chord.upNote().pitch()) === DirectionV.UP : chord.up()
                        firstChord = false
                    }
                    item.setUp(firstUp)
                }
            }
            for (const cr of item.elements()) {
                ChordLayout.computeUp(cr, ctx)
                if (cr.isChord()) {
                    ChordLayout.layoutStem(cr as Chord, ctx)
                }
            }
            return
        }

        item.setMinMove(2147483647)
        item.setMaxMove(-2147483648)
        let mag = 0.0

        item.notePositions().length = 0
        let staffIdx = -1
        for (const cr of item.elements()) {
            const m = cr.isSmall() ? ctx.conf().styleD(Sid.smallNoteMag) : 1.0
            mag = Math.max(mag, m)
            if (cr.isChord()) {
                const chord = cr as Chord
                staffIdx = chord.vStaffIdx()
                const i = chord.staffMove()
                item.setMinMove(Math.min(item.minCRMove(), i))
                item.setMaxMove(Math.max(item.maxCRMove(), i))

                for (const distance of chord.noteDistances()) {
                    item.notePositions().push(new NotePosition(distance, cr.vStaffIdx()))
                }
            }
        }

        item.notePositions().sort((a, b) => (a.lt(b) ? -1 : (b.lt(a) ? 1 : 0)))

        ldata.setMag(mag)

        //
        // determine beam stem direction
        //
        item.setCross(item.minCRMove() !== item.maxCRMove())

        if (item.elements().length === 0) {
            return
        }

        const firstNote = item.elements()[0]
        const measure = firstNote.measure()!
        const hasMultipleVoices = measure.hasVoicesInRange(firstNote.staffIdx(), item.tick(), item.ticks())
        if (BeamLayout.computeUpForMovedCross(item)) {
            // up/down was set there
        } else if (item.direction() !== DirectionV.AUTO) {
            item.setUp(item.direction() === DirectionV.UP)
        } else if (item.maxCRMove() > 0) {
            item.setUp(false)
        } else if (item.minCRMove() < 0) {
            item.setUp(true)
        } else if (item.isGrace()) {
            if (hasMultipleVoices) {
                item.setUp(firstNote.track() % 2 === 0)
            } else {
                item.setUp(true)
            }
        } else if (item.notePositions().length) {
            if (hasMultipleVoices) {
                item.setUp(firstNote.track() % 2 === 0)
            } else {
                const chord = item.findChordWithCustomStemDirection()
                if (chord) {
                    item.setUp(chord.stemDirection() === DirectionV.UP)
                } else {
                    // std::set<NotePosition>: unique sorted positions
                    const noteLines: number[] = []
                    let prev: NotePosition | null = null
                    for (const pos of item.notePositions()) {
                        if (!prev || !prev.equals(pos)) {
                            noteLines.push(pos.line)
                        }
                        prev = pos
                    }
                    item.setUp(ChordLayout.computeAutoStemDirection(noteLines) > 0)
                }
            }
        } else {
            item.setUp(true)
        }

        const middleStaffLine = firstNote.staffType()!.middleLine()
        for (const np of item.notePositions()) {
            np.line += middleStaffLine
        }

        let isEntirelyMoved = false
        if (item.minCRMove() === item.maxCRMove() && item.minCRMove() !== 0) {
            isEntirelyMoved = true
            item.setStaffIdx(staffIdx)
            if (item.direction() === DirectionV.AUTO) {
                item.setUp(item.maxCRMove() > 0)
            }
        } else if (item.elements().length) {
            item.setStaffIdx(item.elements()[0].staffIdx())
        }

        item.setFullCross(isEntirelyMoved)

        item.setSlope(0.0)

        for (const cr of item.elements()) {
            const prevUp = cr.up()
            ChordLayout.computeUp(cr, ctx)
            if (cr.isChord() && cr.up() !== prevUp) {
                // Chord has changed direction. Needs re-layout.
                ChordLayout.layoutChords1(ctx, cr.segment()!, cr.staffIdx())
                cr.segment()!.createShape(cr.staffIdx())
                if ((cr as Chord).isGrace()) {
                    ChordLayout.layoutStem(cr as Chord, ctx)
                }
            }
        }
    }

    private static layout2(item: Beam, ctx: LayoutContext, chordRests: readonly ChordRest[], _st: SpannerSegmentType, frag: number): void {
        BeamTremoloLayout.setupLData(item, item.mutldata(), ctx)
        let startChord: Chord | null = null
        let endChord: Chord | null = null
        if (chordRests.length === 0) {
            return
        }

        for (const chordRest of chordRests) {
            if (chordRest.isChord()) {
                if (!startChord) {
                    startChord = chordRest as Chord
                    endChord = startChord
                } else {
                    endChord = chordRest as Chord
                }
                ChordLayout.layoutStem(chordRest as Chord, ctx)
            }
        }
        if (!startChord || !endChord) {
            return
        }

        item.setBeamSpacing(ctx.conf().styleB(Sid.useWideBeams) ? 4 : 3)
        item.setBeamDist((item.beamSpacing() / 4.0) * item.spatium() * item.mag())
        item.setBeamWidth(item.absoluteFromSpatium(ctx.conf().styleS(Sid.beamWidth)) * item.mag())
        item.setStartAnchor(BeamTremoloLayout.chordBeamAnchor(item.ldata(), startChord, ChordBeamAnchorType.Start))
        item.setEndAnchor(BeamTremoloLayout.chordBeamAnchor(item.ldata(), endChord, ChordBeamAnchorType.End))

        if (item.isGrace()) {
            item.setBeamDist(item.beamDist() * ctx.conf().styleD(Sid.graceNoteMag))
            item.setBeamWidth(item.beamWidth() * ctx.conf().styleD(Sid.graceNoteMag))
        }

        const fragmentIndex = item.directionIdx()
        if (item.userModified()) {
            BeamTremoloLayout.setupLData(item, item.mutldata(), ctx)
            let startY = item.beamFragments()[frag].py1[fragmentIndex]
            let endY = item.beamFragments()[frag].py2[fragmentIndex]
            if (ctx.conf().styleB(Sid.snapCustomBeamsToGrid)) {
                const quarterSpace = item.spatium() / 4
                startY = stdRound(startY / quarterSpace) * quarterSpace
                endY = stdRound(endY / quarterSpace) * quarterSpace
            }
            startY += item.pagePos().y()
            endY += item.pagePos().y()
            item.startAnchor().setY(startY)
            item.endAnchor().setY(endY)
            item.mutldata().setAnchors(item.startAnchor(), item.endAnchor())
            item.computeAndSetSlope()
            BeamLayout.createBeamSegments(item, ctx, chordRests)
            BeamLayout.setTremAnchors(item, ctx)
            return
        }

        if (!item.isBesideTabStaff()) {
            BeamTremoloLayout.setupLData(item, item.mutldata(), ctx)
            BeamTremoloLayout.calculateAnchors(item, item.mutldata(), ctx, chordRests, item.notePositions())
            item.setStartAnchor(item.ldata().startAnchor)
            item.setEndAnchor(item.ldata().endAnchor)
            item.computeAndSetSlope()
            item.setBeamDist(item.ldata().beamDist)
        } else {
            item.setSlope(0.0)
            let startChord2: Chord | null = null
            for (const cr of chordRests) {
                if (cr.isChord()) {
                    startChord2 = cr as Chord
                    break
                }
            }
            BeamTremoloLayout.setupLData(item, item.mutldata(), ctx)
            const x1 = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), chordRests[0], ChordBeamAnchorType.Start)
            const x2 = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), chordRests[chordRests.length - 1], ChordBeamAnchorType.End)
            const y = BeamTremoloLayout.chordBeamAnchorY(item.ldata(), startChord2!)
            item.setStartAnchor(new PointF(x1, y))
            item.setEndAnchor(new PointF(x2, y))
            item.mutldata().setAnchors(item.startAnchor(), item.endAnchor())
        }

        // Set the beam fragment positions
        item.beamFragments()[frag].py1[fragmentIndex] = item.startAnchor().y() - item.pagePos().y()
        item.beamFragments()[frag].py2[fragmentIndex] = item.endAnchor().y() - item.pagePos().y()

        BeamLayout.createBeamSegments(item, ctx, chordRests)
        BeamLayout.setTremAnchors(item, ctx)
    }

    static isStartOfNonCrossBeam(cr: ChordRest): boolean {
        const b = cr.beam()
        if (b && b.elements()[0] === cr) {
            if (b.cross()) {
                return false
            }
            return true
        }
        return false
    }

    static isStartOfCrossBeam(cr: ChordRest): boolean {
        const b = cr.beam()
        if (b && b.elements()[0] === cr) {
            if (b.cross()) {
                return true
            }
        }
        return false
    }

    static restoreBeams(m: Measure, ctx: LayoutContext): void {
        for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            for (const e of s.elist()) {
                if (e && e.isChordRest()) {
                    const cr = e as ChordRest
                    const b = cr.beam()
                    if (b && b.elements().length && b.elements()[0] === cr) {
                        TLayout.layoutBeam(b, ctx)
                        b.addSkyline(m.system()!.staff(b.staffIdx())!.skyline())
                    }
                }
            }
        }
    }

    static measureMayHaveBeamsJoinedIntoNext(measure: Measure): boolean {
        const next = measure.next()
        if (!(next && next.isMeasure())) {
            return false
        }
        const nextMeasure = next as Measure
        const firstCrSeg = nextMeasure.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))
        if (!firstCrSeg) {
            return false
        }
        for (const item of firstCrSeg.elist()) {
            if (!item) {
                continue
            }
            const beamMode = (item as ChordRest).beamMode()
            if (beamMode === BeamMode.MID || beamMode === BeamMode.BEGIN16 || beamMode === BeamMode.BEGIN32) {
                return true
            }
        }
        return false
    }

    static breakCrossMeasureBeams(measure: Measure, ctx: LayoutContext): void {
        const mbNext = measure.next()
        if (!mbNext || !mbNext.isMeasure()) {
            return
        }

        const next = mbNext as Measure
        const ntracks = ctx.dom().ntracks()
        const fstSeg = next.first(SegmentType.ChordRest)
        if (!fstSeg) {
            return
        }

        for (let track = 0; track < ntracks; ++track) {
            const stf = ctx.dom().staff(track2staff(track))!

            // dont compute beams for invisible staves and tablature without stems
            if (!stf.show() || (stf.isTabStaff(measure.tick()) && stf.staffType(measure.tick()).stemless())) {
                continue
            }

            const e = fstSeg.element(track)
            if (!e || !e.isChordRest()) {
                continue
            }

            const cr = e as ChordRest
            const beam = cr.beam()
            if (!beam || beam.elements()[0].measure() === next) { // no beam or not cross-measure beam
                continue
            }

            const mElements: ChordRest[] = []
            const nextElements: ChordRest[] = []

            for (const beamCR of beam.elements()) {
                if (beamCR.tick().lt(next.tick())) {
                    mElements.push(beamCR)
                } else {
                    nextElements.push(beamCR)
                }
            }

            if (mElements.length === 1) {
                mElements[0].removeDeleteBeam(false)
            }

            let newBeam: Beam | null = null
            if (nextElements.length > 1) {
                newBeam = Factory.createBeam(ctx.mutDom().dummyParent().system())
                newBeam.setGenerated(true)
                newBeam.setTrack(track)
            }

            const nextBeamed = !!newBeam
            for (const nextCR of nextElements) {
                nextCR.removeDeleteBeam(nextBeamed)
                if (newBeam) {
                    newBeam.add(nextCR)
                }
            }

            if (newBeam) {
                BeamLayout.layout1(newBeam, ctx)
            }
        }
    }

    private static beamGraceNotes(ctx: LayoutContext, mainNote: Chord, after: boolean): void {
        let a1: ChordRest | null = null // start of (potential) beam
        let beam: Beam | null = null // current beam
        let bm: BeamMode
        const graceNotes = after ? mainNote.graceNotesAfter() : mainNote.graceNotesBefore()

        for (let cr of [...graceNotes] as (ChordRest | null)[]) {
            bm = Groups.baseBeamMode(cr!)
            if ((cr!.durationType().type() <= DurationType.V_QUARTER) || (bm === BeamMode.NONE)) {
                if (beam) {
                    beam.setIsGrace(true)
                    BeamLayout.layout1(beam, ctx)
                    beam = null
                }
                if (a1) {
                    a1.removeDeleteBeam(false)
                    a1 = null
                }
                cr!.removeDeleteBeam(false)
                continue
            }
            if (beam) {
                let beamEnd = bm === BeamMode.BEGIN
                if (!beamEnd) {
                    cr!.replaceBeam(beam)
                    cr = null
                    beamEnd = (bm === BeamMode.END)
                }
                if (beamEnd) {
                    beam.setIsGrace(true)
                    BeamLayout.layout1(beam, ctx)
                    beam = null
                }
            }
            if (!cr) {
                continue
            }
            if (!a1) {
                a1 = cr
            } else {
                if (!beamModeMid(bm) && (bm === BeamMode.BEGIN)) {
                    a1.removeDeleteBeam(false)
                    a1 = cr
                } else {
                    beam = a1.beam()
                    if (!beam || beam.elements()[0] !== a1) {
                        beam = Factory.createBeam(ctx.mutDom().dummyParent().system())
                        beam.setGenerated(true)
                        beam.setTrack(mainNote.track())
                        a1.replaceBeam(beam)
                    }
                    cr.replaceBeam(beam)
                    a1 = null
                }
            }
        }
        if (beam) {
            beam.setIsGrace(true)
            BeamLayout.layout1(beam, ctx)
        } else if (a1) {
            a1.removeDeleteBeam(false)
        }
    }

    static createBeams(ctx: LayoutContext, measure: Measure): void {
        for (let track = 0; track < ctx.dom().ntracks(); ++track) {
            const stf = ctx.dom().staff(track2staff(track))!

            // don’t compute beams for invisible staves and tablature without stems
            if (!stf.show() || (stf.isTabStaff(measure.tick()) && stf.staffType(measure.tick()).stemless())) {
                continue
            }

            let a1: ChordRest | null = null // start of (potential) beam
            let firstCR = true
            let beam: Beam | null = null // current beam
            let bm: BeamMode
            let prev: ChordRest | null = null

            const beatSubdivision = new Map<number, TDuration>()

            // if this measure is simple meter (actually X/4),
            // then perform a prepass to determine the subdivision of each beat
            const ts = stf.timeSig(measure.tick())
            const st = SegmentType.ChordRest
            if (ts && ts.denominator() === 4) {
                const stretch = ts.stretch()
                for (let s = measure.first(st); s; s = s.next(st)) {
                    const mcr = s.element(track) as ChordRest | null
                    if (!mcr) {
                        continue
                    }
                    const beat = Math.trunc(mcr.rtick().times(stretch).ticks() / Constants.DIVISION)
                    const cur = beatSubdivision.get(beat)
                    if (cur) {
                        const d = mcr.durationType()
                        beatSubdivision.set(beat, d.lt(cur) ? d : cur)
                    } else {
                        beatSubdivision.set(beat, mcr.durationType())
                    }
                }
            }

            for (let segment = measure.first(st); segment; segment = segment.next(st)) {
                let cr = segment.cr(track)
                if (!cr) {
                    continue
                }

                if (cr.isChord()) {
                    for (const c of (cr as Chord).graceNotes()) {
                        c.setBeamlet(null) // Will be defined during beam layout
                    }
                }
                cr.setBeamlet(null) // Will be defined during beam layout

                if (firstCR) {
                    firstCR = false
                    // Handle cross-measure beams
                    const mode = cr.beamMode()
                    if (mode === BeamMode.MID || mode === BeamMode.END || mode === BeamMode.BEGIN16 || mode === BeamMode.BEGIN32) {
                        const prevCR = ctx.mutDom().findCR(measure.tick().minus(Fraction.eps()), track)
                        if (prevCR) {
                            const prevBeam = prevCR.beam()
                            const pm = prevCR.measure()!
                            if (!beamNoContinue(prevCR.beamMode())
                                && !pm.lineBreak() && !pm.pageBreak() && !pm.sectionBreak()
                                && ctx.state().prevMeasure()
                                && !(prevCR.isChord() && prevCR.durationType().type() <= DurationType.V_QUARTER)) {
                                beam = prevBeam
                                // remove hook from previous chord if it was beamed into this measure
                                if (prevCR.isChord()) {
                                    const hook = (prevCR as Chord).hook()
                                    if (hook) {
                                        ctx.mutDom().doUndoRemoveElement(hook)
                                        prevCR.segment()!.staffShape(prevCR.vStaffIdx()).remove_if(el => el.item() === hook)
                                    }
                                }
                                a1 = beam ? null : prevCR // when beam is found, a1 is no longer required.
                            } else if (prevBeam && prevBeam === cr.beam() && prevBeam.elements()[0] === prevCR) {
                                // remove the beam from the previous chord if it was beamed into this measure
                                prevCR.removeDeleteBeam(false)
                            }
                        }
                    }
                }

                // handle grace notes and cross-measure beaming
                // (tied chords?)
                const hasAllRest = !!cr.beam() && cr.beam()!.hasAllRests()
                const isARestBeamStart = cr.isRest() && cr.beamMode() === BeamMode.BEGIN
                if (hasAllRest && !isARestBeamStart) {
                    cr.removeDeleteBeam(false)
                }

                if (cr.isChord()) {
                    const chord = cr as Chord
                    BeamLayout.beamGraceNotes(ctx, chord, false) // grace before
                    BeamLayout.beamGraceNotes(ctx, chord, true) // grace after
                }

                bm = Groups.actualBeamMode(cr, prev, beatSubdivision)
                prev = cr

                // perform the actual beaming
                const canBeBeamed = cr.durationType().type() > DurationType.V_QUARTER || cr.isRest()
                if (!canBeBeamed || (bm === BeamMode.NONE)) {
                    let removeBeam = true
                    if (beam) {
                        BeamLayout.layout1(beam, ctx)
                        removeBeam = (beam.elements().length <= 1 || beam.hasAllRests())
                        beam = null
                    }
                    if (a1) {
                        if (removeBeam) {
                            a1.removeDeleteBeam(false)
                        }
                        a1 = null
                    }
                    cr.removeDeleteBeam(false)
                    continue
                }

                if (beam) {
                    let beamEnd = (bm === BeamMode.BEGIN)
                    if (!beamEnd) {
                        cr.replaceBeam(beam)
                        cr = null
                        beamEnd = (bm === BeamMode.END)
                    }
                    if (beamEnd) {
                        BeamLayout.layout1(beam, ctx)
                        beam = null
                    }
                }

                if (!cr) {
                    continue
                }

                if (!a1) {
                    a1 = cr
                } else {
                    if (!beamModeMid(bm)
                        && (bm === BeamMode.BEGIN
                            || (a1.segment()!.segmentType() !== cr.segment()!.segmentType())
                            || (a1.endTick().lt(cr.tick())))) {
                        a1.removeDeleteBeam(false)
                        a1 = cr
                    } else {
                        beam = a1.beam()
                        if (!beam || beam.elements()[0] !== a1) {
                            beam = Factory.createBeam(ctx.mutDom().dummyParent().system())
                            beam.setGenerated(true)
                            beam.setTrack(track)
                            a1.replaceBeam(beam)
                        }
                        cr.replaceBeam(beam)
                        a1 = null
                    }
                }
            }

            if (beam) {
                BeamLayout.layout1(beam, ctx)
            } else if (a1) {
                const nextTick = a1.endTick()
                const m = nextTick.ge(measure.endTick()) ? measure.nextMeasure() : measure
                const nextCR = m ? m.findChordRest(nextTick, track) : null
                const b = a1.beam()
                if (!(b && b.elements().length && !b.hasAllRests() && b.elements()[0] === a1 && nextCR
                      && beamModeMid(nextCR.beamMode()))) {
                    a1.removeDeleteBeam(false)
                }
            }
        }
    }

    /************************************************************
     * layoutNonCrossBeams()
     * layout all non-cross-staff beams starting on this segment
     * **********************************************************/

    static layoutNonCrossBeams(cr: ChordRest, ctx: LayoutContext): void {
        if (cr.isChord()) {
            for (const grace of (cr as Chord).graceNotes()) {
                BeamLayout.layoutNonCrossBeams(grace, ctx)
            }
        }
        if (!BeamLayout.isStartOfNonCrossBeam(cr)) {
            return
        }
        const beam = cr.beam()!
        TLayout.layoutBeam(beam, ctx)

        if (beam.tremAnchors().length) {
            // there are inset tremolos in here
            for (const beamCr of beam.elements()) {
                if (!beamCr.isChord()) {
                    continue
                }
                const c = beamCr as Chord
                if (c.tremoloTwoChord()) {
                    TremoloLayout.layoutTwoChord(c.tremoloTwoChord()!, ctx)
                }
            }
        }
        for (const beamCR of beam.elements()) {
            if (beamCR.isRest() && beamCR.vStaffIdx() === beam.staffIdx()) {
                BeamLayout.verticalAdjustBeamedRests(beamCR as Rest, beam, ctx)
            }
        }
    }

    static verticalAdjustBeamedRests(rest: Rest, beam: Beam, ctx: LayoutContext): void {
        const spatium = rest.spatium()
        const rest32nd = new Fraction(1, 32)
        const up = beam.up()

        const restBeamMode = rest.beamMode()
        const firstRest = beam.elements()[0] === rest
                          && (restBeamMode === BeamMode.BEGIN || restBeamMode === BeamMode.BEGIN16 || restBeamMode === BeamMode.BEGIN32
                              || restBeamMode === BeamMode.MID)

        let restToBeamPadding: number
        if (rest.ticks().le(rest32nd)) {
            restToBeamPadding = 0.2 * spatium
        } else {
            restToBeamPadding = 0.35 * spatium
        }

        const beamShape = beam.shape().translate(beam.pagePos())
        const restShape = rest.shape().translate(rest.pagePos().minus(rest.offset()))

        const minBeamToRestXDist = up && firstRest ? 0.1 * spatium : 0.0

        const restToBeamClearance = up
            ? beamShape.verticalClearance(restShape, minBeamToRestXDist)
            : restShape.verticalClearance(beamShape)

        const lineDistance = rest.staff()!.lineDistance(rest.tick()) * spatium
        const clearanceInSteps = Math.ceil(restToBeamClearance / lineDistance)
        if (up) {
            rest.verticalClearance().setAbove(clearanceInSteps)
        } else {
            rest.verticalClearance().setBelow(clearanceInSteps)
        }

        if (restToBeamClearance > restToBeamPadding) {
            return
        }

        const restIsLocked = rest.verticalClearance().locked()
        if (!restIsLocked) {
            const overlap = (restToBeamPadding - restToBeamClearance)
            let lineMoves = Math.ceil(overlap / lineDistance)
            lineMoves *= up ? 1 : -1
            const yMove = lineMoves * lineDistance
            rest.mutldata().moveY(yMove)
            for (const mergedRest of rest.ldata().mergedRests) {
                mergedRest.mutldata().moveY(yMove)
            }
            const segment = rest.segment()!
            const staffIdx = rest.vStaffIdx()
            const staff = ctx.dom().staff(staffIdx)!

            const chords: Chord[] = []
            const rests: Rest[] = []
            collectChordsAndRest(segment, staffIdx, chords, rests)

            RestLayout.resolveRestVSChord(rests, chords, staff, segment)
            RestLayout.resolveRestVSRest(rests, staff, segment, ctx, /*considerBeams*/ true)
        }

        TLayout.layoutBeam(beam, ctx)
        rest.segment()!.createShape(rest.vStaffIdx())
    }

    static checkCrossPosAndStemConsistency(beam: Beam, ctx: LayoutContext): void {
        if (!beam.cross() || !beam.userModified()) {
            return
        }

        let correctCrossStaffIdx = 0
        let inconsistencyFound = false
        for (const cr of beam.elements()) {
            if (!cr.isChord()) {
                continue
            }
            const chord = cr as Chord
            const currentUp = chord.up()
            const actualUp = ChordLayout.isChordPosBelowBeam(chord, beam)
            if (actualUp !== currentUp) {
                inconsistencyFound = true
                chord.setUp(actualUp)
                ChordLayout.layoutChords1(ctx, chord.segment()!, chord.staffIdx())
                chord.segment()!.createShape(chord.staffIdx())
            }
            if (actualUp) {
                correctCrossStaffIdx = Math.min(correctCrossStaffIdx, chord.staffMove())
            } else {
                correctCrossStaffIdx = Math.max(correctCrossStaffIdx, chord.staffMove() + 1)
            }
        }

        const beamCrossStaffIdx = beam.crossStaffIdx()
        if (beamCrossStaffIdx !== correctCrossStaffIdx) {
            inconsistencyFound = true
            const curCrossStaffMove = beam.crossStaffMove()
            const diff = correctCrossStaffIdx - beamCrossStaffIdx
            beam.setProperty(Pid.BEAM_CROSS_STAFF_MOVE, curCrossStaffMove + diff)
        }

        if (inconsistencyFound) {
            BeamLayout.layout(beam, ctx)
        }
    }

    private static createBeamSegments(item: Beam, ctx: LayoutContext, chordRests: readonly ChordRest[]): void {
        item.clearBeamSegments()

        let levelHasBeam: boolean
        let level = 0
        const noLastChord = Number.MAX_SAFE_INTEGER
        const numCr = chordRests.length
        const frenchStyleBeams = ctx.conf().styleB(Sid.frenchStyleBeams)
        do {
            levelHasBeam = false
            let startCr: ChordRest | null = null
            let endCr: ChordRest | null = null
            let breakBeam = false
            let previousBreak16 = false
            let previousBreak32 = false
            let lastChordIndex = noLastChord

            for (let i = 0; i < numCr; i++) {
                const chordRest = chordRests[i]
                const prevChordRest = i < 1 ? null : chordRests[i - 1]

                if (level < chordRest.beams() && !chordRest.isRest()) {
                    levelHasBeam = true
                }
                const [isBroken16, isBroken32] = item.calcBeamBreaks(chordRest, prevChordRest, level)
                breakBeam = isBroken16 || isBroken32

                let skipRest = false
                const beamMode = chordRest.beamMode()
                if (chordRest.isRest() && level >= chordRest.beams()
                    && (beamMode === BeamMode.MID || beamMode === BeamMode.BEGIN16 || beamMode === BeamMode.BEGIN32)) {
                    let nextChordIndex = i + 1
                    while (nextChordIndex < numCr && chordRests[nextChordIndex].isRest()) {
                        ++nextChordIndex
                    }
                    if (lastChordIndex < numCr && nextChordIndex < numCr) {
                        const lastChord = chordRests[lastChordIndex] as Chord
                        const nextChord = chordRests[nextChordIndex] as Chord
                        if (level < lastChord.beams() && level < nextChord.beams()) {
                            skipRest = (isBroken16 && level < 1) || (isBroken32 && level < 2) || (!isBroken16 && !isBroken32)
                        }
                    }
                }

                if ((level < chordRest.beams() && !breakBeam) || skipRest) {
                    endCr = chordRest
                    if (!startCr || (startCr.isRest() && startCr !== item.elements()[0])) {
                        startCr = chordRest
                    }
                } else if (level >= chordRest.beams() && chordRest.isRest() && !breakBeam) {
                    continue
                } else {
                    let beamletIndex = i - 1
                    if (lastChordIndex < item.elements().length && (chordRest.isRest() || (endCr && endCr.isRest()))) {
                        const lastCr = item.elements()[lastChordIndex]
                        if (lastCr && startCr && lastCr.tick().ge(startCr.tick())) {
                            endCr = lastCr
                            beamletIndex = lastChordIndex
                            lastChordIndex = noLastChord
                        }
                    }
                    if (startCr && endCr && levelHasBeam) {
                        if (startCr === endCr && startCr.isChord()) {
                            const isBeamletBefore = BeamLayout.calcIsBeamletBefore(item, startCr as Chord, beamletIndex, level,
                                                                                   previousBreak16, previousBreak32)
                            BeamLayout.createBeamletSegment(item, ctx, startCr as Chord, isBeamletBefore, level)
                        } else if (startCr !== endCr) {
                            BeamLayout.createBeamSegment(item, startCr, endCr, level, frenchStyleBeams, ctx)
                        }
                    }
                    const setCr = !!chordRest && chordRest.isChord() && breakBeam && level < chordRest.beams()
                    startCr = setCr ? chordRest : null
                    endCr = setCr ? chordRest : null
                }
                previousBreak16 = isBroken16
                previousBreak32 = isBroken32
                if (chordRest && chordRest.isChord()) {
                    lastChordIndex = i
                }
            }

            // if the beam ends on the last chord
            if (startCr && (endCr || breakBeam)) {
                if ((startCr === endCr || !endCr) && startCr.isChord()) {
                    // this chord is either the last chord, or the first (and only) chord of a new beamlet
                    const isBefore = !(startCr === chordRests[0])
                    BeamLayout.createBeamletSegment(item, ctx, startCr as Chord, isBefore, level)
                } else {
                    BeamLayout.createBeamSegment(item, startCr, endCr!, level, frenchStyleBeams, ctx)
                }
            }
            level++
        } while (levelHasBeam)
    }

    private static calcIsBeamletBefore(item: Beam, chord: Chord, i: number, level: number, isAfter16Break: boolean,
                                       isAfter32Break: boolean): boolean {
        // if first or last chord in beam group
        if (i === 0) {
            return false
        } else if (i === item.elements().length - 1) {
            return true
        }
        // if first or last chord in tuplet
        const tuplet = chord.tuplet()
        if (tuplet && chord === tuplet.elements()[0]) {
            return false
        } else if (tuplet && chord === tuplet.elements()[tuplet.elements().length - 1]) {
            return true
        }

        // next note has a beam break
        const nextChordRest = item.elements()[i + 1]
        const currChordRest = item.elements()[i]
        const prevChordRest = item.elements()[i - 1]
        if (nextChordRest.isChord()) {
            const [currBreak16] = item.calcBeamBreaks(currChordRest, prevChordRest, prevChordRest.beams())
            const [nextBreak16, nextBreak32] = item.calcBeamBreaks(nextChordRest, currChordRest, level)
            if ((nextBreak16 && level >= 1) || (!currBreak16 && nextBreak32 && level >= 2)) {
                return true
            }
        }

        // if previous or next chord has more beams, point in that direction
        let previousChordLevel = -1
        let nextChordLevel = -1
        let previousOffset = 1
        while (i - previousOffset >= 0) {
            const previous = item.elements()[i - previousOffset]
            if (previous.isChord()) {
                previousChordLevel = (previous as Chord).beams()
                if (isAfter16Break) {
                    previousChordLevel = Math.min(previousChordLevel, 1)
                } else if (isAfter32Break) {
                    previousChordLevel = Math.min(previousChordLevel, 2)
                }
                break
            }
            ++previousOffset
        }

        let nextOffset = 1
        while (i + nextOffset < item.elements().length) {
            const next = item.elements()[i + nextOffset]
            if (next.isChord()) {
                nextChordLevel = (next as Chord).beams()
                break
            }
            ++nextOffset
        }
        const chordLevelDifference = nextChordLevel - previousChordLevel
        if (chordLevelDifference !== 0) {
            return chordLevelDifference < 0
        }

        // if the chord ends a subdivision of the beat
        const baseTick = tuplet ? tuplet.tick() : chord.measure()!.tick()
        const stretch = chord.staff()!.timeStretch(baseTick)
        let tickNext = nextChordRest.tick().minus(baseTick).times(stretch)
        if (tuplet) {
            // for tuplets with odd ratios, apply ratio
            // for tuplets with even ratios, use actual beat
            const ratio = tuplet.ratio()
            if (ratio.numerator() & 1) {
                tickNext = tickNext.times(ratio)
            }
        }

        const BEAM_TUPLET_TOLERANCE = 6
        const tickLargeSize = chord.ticks().ticks() * 2
        const remainder = tickNext.ticks() % tickLargeSize

        if (remainder <= BEAM_TUPLET_TOLERANCE || (tickLargeSize - remainder) <= BEAM_TUPLET_TOLERANCE) {
            return true
        }

        // default case
        return false
    }

    private static createBeamSegment(item: Beam, startCr: ChordRest, endCr: ChordRest, level: number, frenchStyleBeams: boolean,
                                     ctx: LayoutContext): void {
        const isFirstSubgroup = startCr === item.elements()[0]
        const isLastSubgroup = endCr === item.elements()[item.elements().length - 1]
        const firstUp = startCr.up()
        const lastUp = endCr.up()
        let overallUp = item.up()
        if (isFirstSubgroup === isLastSubgroup) {
            // this subgroup is either the whole beam, or a subgroup in the middle
            if (firstUp === lastUp) {
                overallUp = firstUp
            } else {
                // if the first and last chord in this subgroup are going in different directions,
                // we use the direction of the majority of the stems in this subgroup
                let upStems = 0
                let downStems = 0
                for (const cr of item.elements()) {
                    if (!cr.isChord() || cr.tick().lt(startCr.tick())) {
                        continue
                    }
                    if (cr.tick().gt(endCr.tick())) {
                        break
                    }
                    if ((cr as Chord).up()) {
                        ++upStems
                    } else {
                        ++downStems
                    }
                    if (cr === endCr) {
                        break
                    }
                }
                if (upStems === downStems) {
                    overallUp = item.up()
                } else {
                    overallUp = upStems > downStems
                }
            }
        } else if (isFirstSubgroup) {
            overallUp = lastUp
        } else if (isLastSubgroup) {
            overallUp = firstUp
        }

        const startX = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), startCr, ChordBeamAnchorType.Start)
        const endX = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), endCr, ChordBeamAnchorType.End)

        let startY = item.slope() * (startX - item.startAnchor().x()) + item.startAnchor().y() - item.pagePos().y()
        let endY = item.slope() * (endX - item.startAnchor().x()) + item.startAnchor().y() - item.pagePos().y()

        let beamsBelow = 0 // how many beams below level 0?
        let beamsAbove = 0 // how many beams above level 0?

        // avoid adjusting for beams on opposite side of level 0
        if (level !== 0) {
            for (const beam of item.beamSegments()) {
                if (beam.level === 0 || beam.endTick.lt(startCr.tick()) || beam.startTick.gt(endCr.tick())) {
                    continue
                }
                if (beam.above) {
                    ++beamsAbove
                } else {
                    ++beamsBelow
                }
            }

            const upValue = overallUp ? -1 : 1
            const extraBeamAdjust = overallUp ? beamsAbove : beamsBelow
            const verticalOffset = item.beamDist() * (level - extraBeamAdjust) * upValue

            if (RealIsEqual(item.growLeft(), item.growRight())) {
                startY -= verticalOffset * item.growLeft()
                endY -= verticalOffset * item.growLeft()
            } else {
                // Feathered beams
                const startProportionAlongX = (startX - item.startAnchor().x()) / (item.endAnchor().x() - item.startAnchor().x())
                const endProportionAlongX = (endX - item.startAnchor().x()) / (item.endAnchor().x() - item.startAnchor().x())

                const grow1 = startProportionAlongX * (item.growRight() - item.growLeft()) + item.growLeft()
                const grow2 = endProportionAlongX * (item.growRight() - item.growLeft()) + item.growLeft()

                startY -= verticalOffset * grow1
                endY -= verticalOffset * grow2
            }
        }

        const b = new BeamSegment(item)
        b.above = !overallUp
        b.level = level
        b.line = new LineF(startX, startY, endX, endY)
        b.startTick = startCr.tick()
        b.endTick = endCr.tick()
        item.beamSegments().push(b)

        if (level > 0) {
            if (b.above) {
                ++beamsAbove
            } else {
                ++beamsBelow
            }
        }

        // extend stems properly
        for (const cr of item.elements()) {
            if (!cr.isChord() || cr.tick().lt(startCr.tick())) {
                continue
            }
            if (cr.tick().gt(endCr.tick())) {
                break
            }

            const chord = cr as Chord
            const stem = chord.stem()
            if (!stem) {
                continue
            }
            const _up = chord.up() ? -1.0 : 1.0
            if (level === 0) {
                BeamTremoloLayout.extendStem(item.ldata(), chord, 0.0, ctx)
                stem.mutldata().beamCorrection = _up * item.beamWidth() / 2
            } else {
                const isStartOrEnd = cr === startCr || cr === endCr
                const visualStemLengthAdjustmentSteps = computeStemLengthAdjustmentSteps(cr, isStartOrEnd, b.above, frenchStyleBeams,
                                                                                         level, beamsAbove, beamsBelow)
                if (visualStemLengthAdjustmentSteps !== 0) {
                    let grow = item.growLeft()
                    if (!RealIsEqual(item.growLeft(), item.growRight())) {
                        const anchorX = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), chord, ChordBeamAnchorType.Middle)
                        const proportionAlongX = (anchorX - item.startAnchor().x()) / (item.endAnchor().x() - item.startAnchor().x())
                        grow = proportionAlongX * (item.growRight() - item.growLeft()) + item.growLeft()
                    }
                    const visualStemLengthAdjustment = grow * visualStemLengthAdjustmentSteps * item.beamDist()
                    if (frenchStyleBeams) {
                        const bboxStemLengthAdjustmentSteps = computeStemLengthAdjustmentSteps(cr, isStartOrEnd, b.above,
                                                                                               /*frenchStyleBeams*/ false,
                                                                                               level, beamsAbove, beamsBelow)
                        stem.mutldata().beamCorrection = _up * item.beamWidth() / 2 + _up * grow
                                                         * (bboxStemLengthAdjustmentSteps - visualStemLengthAdjustmentSteps)
                                                         * item.beamDist()
                    }
                    BeamTremoloLayout.extendStem(item.ldata(), chord, visualStemLengthAdjustment, ctx)
                }
            }

            if (cr === endCr) {
                break
            }
        }
    }

    private static createBeamletSegment(item: Beam, ctx: LayoutContext, cr: ChordRest, isBefore: boolean, level: number): void {
        const startX = BeamTremoloLayout.chordBeamAnchorX(item.ldata(), cr, isBefore ? ChordBeamAnchorType.End : ChordBeamAnchorType.Start)

        const beamletLength = ctx.conf().styleMM(Sid.beamMinLen) * cr.mag()

        const endX = startX + (isBefore ? -beamletLength : beamletLength)

        let startY = item.slope() * (startX - item.startAnchor().x()) + item.startAnchor().y() - item.pagePos().y()
        let endY = item.slope() * (endX - startX) + startY

        // how many beams past level 0 (i.e. beams on the other side of level 0 for this subgroup)
        let extraBeamAdjust = 0

        // avoid adjusting for beams on opposite side of level 0
        for (const beam of item.beamSegments()) {
            if (beam.level === 0 || beam.line.x2() < startX || beam.line.x1() > endX) {
                continue
            }
            if (cr.up() === beam.above) {
                extraBeamAdjust++
            }
        }

        const upValue = cr.up() ? -1 : 1
        const verticalOffset = item.beamDist() * (level - extraBeamAdjust) * upValue

        if (RealIsEqual(item.growLeft(), item.growRight())) {
            startY -= verticalOffset * item.growLeft()
            endY -= verticalOffset * item.growLeft()
        } else {
            // Feathered beams
            const startProportionAlongX = (startX - item.startAnchor().x()) / (item.endAnchor().x() - item.startAnchor().x())
            const endProportionAlongX = (endX - item.startAnchor().x()) / (item.endAnchor().x() - item.startAnchor().x())

            const grow1 = startProportionAlongX * (item.growRight() - item.growLeft()) + item.growLeft()
            const grow2 = endProportionAlongX * (item.growRight() - item.growLeft()) + item.growLeft()

            startY -= verticalOffset * grow1
            endY -= verticalOffset * grow2
        }

        const b = new BeamSegment(item)
        b.above = !cr.up()
        b.level = level
        b.line = new LineF(startX, startY, endX, endY)
        b.isBeamlet = true
        b.isBefore = isBefore
        cr.setBeamlet(b)
        ChordLayout.fillShape(cr, ctx)
        cr.segment()!.createShape(cr.vStaffIdx())
        item.beamSegments().push(b)
    }

    private static computeUpForMovedCross(item: Beam): boolean {
        if (!item.cross()) {
            return false
        }

        let isAboveAllChords = true
        let isBelowAllChords = true
        for (const cr of item.elements()) {
            if (cr.isBelowCrossBeam(item)) {
                isBelowAllChords = false
            } else {
                isAboveAllChords = false
            }
        }

        if (isAboveAllChords) {
            item.setUp(true)
            return true
        }

        if (isBelowAllChords) {
            item.setUp(false)
            return true
        }

        return false
    }

    static chordBeamAnchor(item: Beam, chord: ChordRest, anchorType: ChordBeamAnchorType): PointF {
        return BeamTremoloLayout.chordBeamAnchor(item.ldata(), chord, anchorType)
    }

    static chordBeamAnchorY(item: Beam, chord: ChordRest): number {
        return BeamTremoloLayout.chordBeamAnchorY(item.ldata(), chord)
    }

    static setTremAnchors(item: Beam, ctx: LayoutContext): void {
        item.tremAnchors().length = 0
        for (const cr of item.elements()) {
            if (!cr || !cr.isChord()) {
                continue
            }
            const c = cr as Chord
            const t = c.tremoloTwoChord()
            if (t && t.chord1() === c && t.chord2()!.beam() === item) {
                // there is an inset tremolo here!
                // figure out up / down
                let tremUp = t.up()
                if (item.userModified()) {
                    tremUp = c.up()
                } else if (item.cross() && t.chord1()!.staffMove() === t.chord2()!.staffMove()) {
                    tremUp = t.chord1()!.staffMove() === item.maxCRMove()
                }
                const regularBeams = c.beams() // non-tremolo strokes
                const scale = t.spatium() * t.mag()

                // find the left-side anchor
                const width = item.endAnchor().x() - item.startAnchor().x()
                const height = item.endAnchor().y() - item.startAnchor().y()
                let x = BeamLayout.chordBeamAnchor(item, c, ChordBeamAnchorType.Middle).x()
                let proportionAlongX = (x - item.startAnchor().x()) / width
                let y = item.startAnchor().y() + (proportionAlongX * height)
                y += regularBeams * (ctx.conf().styleB(Sid.useWideBeams) ? 1.0 : 0.75) * scale * (tremUp ? 1.0 : -1.0)
                const y1 = y
                // find the right-side anchor
                x = BeamLayout.chordBeamAnchor(item, t.chord2()!, ChordBeamAnchorType.Middle).x()
                proportionAlongX = (x - item.startAnchor().x()) / width
                y = item.startAnchor().y() + (proportionAlongX * height)
                y += regularBeams * (ctx.conf().styleB(Sid.useWideBeams) ? 1.0 : 0.75) * scale * (tremUp ? 1.0 : -1.0)
                item.tremAnchors().push({ chord1: c, y1, y2: y })
            }
        }
    }
}
