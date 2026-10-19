/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/tremololayout.h/.cpp
 */

import { LineF, PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsEqualOrMore } from '../../../framework/global/realfn'
import { DirectionV, TremoloStyle } from '../../types/types'
import { Sid } from '../../style/styledef'
import { BeamSegment, ChordBeamAnchorType, NotePosition } from '../../dom/beambase'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import { BeamTremoloLayout } from './beamtremololayout'
import { ChordLayout } from './chordlayout'
import type { LayoutContext } from './layoutcontext'
import { StemLayout } from './stemlayout'

export class TremoloLayout {
    static layoutTwoChord(item: TremoloTwoChord, ctx: LayoutContext): void {
        if (!item.explicitParent()) {
            return
        }

        item.setChord1(item.explicitParent() as unknown as Chord)
        TremoloLayout.layoutTwoNotesTremolo(item, ctx)
    }

    static layoutSingleChord(item: TremoloSingleChord, ctx: LayoutContext): void {
        if (!item.explicitParent()) {
            return
        }

        item.computeShape() // set bbox
        item.setPath(item.basePath())

        const chord = item.chord()!
        const anchor1 = chord.up() ? chord.upNote() : chord.downNote()
        const stem = chord.stem()
        let x: number, y: number, h: number
        if (stem) {
            x = stem.pos().x() + stem.width() / 2 * (chord.up() ? -1.0 : 1.0)
            y = stem.pos().y()
            h = stem.length()
        } else {
            // center tremolo above note
            x = anchor1.x() + anchor1.headWidth() * 0.5
            let hasMirroredNote = false
            for (const n of chord.notes()) {
                if (n.ldata().mirror) {
                    hasMirroredNote = true
                    break
                }
            }
            if (hasMirroredNote) {
                x = StemLayout.stemPosX(chord)
            }
            y = anchor1.y()
            h = (ctx.conf().styleMM(Sid.tremoloNoteSidePadding) + item.ldata().bbox().height()) * chord.intrinsicMag()
        }

        TremoloLayout.layoutOneNoteTremolo(item, ctx, x, y, h, item.spatium())
    }

    static layoutOneNoteTremolo(item: TremoloSingleChord, ctx: LayoutContext, x: number, y: number, h: number, spatium: number): void {
        const chord = item.chord()!
        const staffType = item.staffType()
        if (staffType && staffType.isTabStaff()) {
            x = ChordLayout.centerX(chord)
        }

        const up = chord.up()
        const upValue = up ? -1 : 1
        const mag = chord.intrinsicMag()
        spatium *= mag

        let yOffset = h - ctx.conf().styleMM(Sid.tremoloOutSidePadding) * mag

        const beams = chord.beams()
        if (chord.hook()) {
            // allow for space at the hook side of the stem (yOffset)
            // straight flags and traditional flags have different requirements because of their slopes
            // away from the stem. Straight flags have a shallower slope and a lot more space in general
            // so we can place the trem higher in that case
            const straightFlags = ctx.conf().styleB(Sid.useStraightNoteFlags)
            if (straightFlags) {
                yOffset -= 0.75 * spatium
            } else {
                // up-hooks and down-hooks are shaped differently
                yOffset -= up ? 1.5 * spatium : 1.0 * spatium
            }
            // we need an additional offset for beams > 2 since those beams extend outwards and we don't want to adjust for that
            const beamOffset = straightFlags ? 0.75 : 0.5
            yOffset -= beams >= 2 ? beamOffset * spatium : 0.0
        } else if (beams && staffType && !staffType.isSimpleTabStaff()) {
            yOffset -= (beams * (ctx.conf().styleB(Sid.useWideBeams) ? 1.0 : 0.75) - 0.25) * spatium
        }
        yOffset -= item.isBuzzRoll() && up ? 0.5 * spatium : 0.0
        yOffset -= up ? 0.0 : item.minHeight() * spatium / mag
        yOffset *= upValue

        y += yOffset

        if (up) {
            const height = item.isBuzzRoll() ? 0 : item.minHeight()
            const staveHeight = (((item.staff()!.lines(item.tick()) - 1) - height) * spatium / mag)
            y = Math.min(y, staveHeight)
        } else {
            y = Math.max(y, 0.0)
        }
        item.setPos(x, y)
    }

    static calcIsUp(item: TremoloTwoChord): void {
        const c1 = item.chord1()!
        const c2 = item.chord2()!
        if (item.userModified()) {
            const startChordUp = ChordLayout.isChordPosBelowTrem(c1, item)
            const endChordUp = ChordLayout.isChordPosBelowTrem(c2, item)
            item.setUp(startChordUp || endChordUp)
            c1.setUp(startChordUp)
            c2.setUp(endChordUp)
            return
        }

        let up = 0
        let isUp = item.up()
        const hasVoices = c1.measure()!.hasVoicesInRange(c1.staffIdx(), c1.tick(), c2.tick().minus(c1.tick()))
        if (c1.stemDirection() === DirectionV.AUTO
            && c2.stemDirection() === DirectionV.AUTO
            && c1.staffMove() === c2.staffMove()
            && !hasVoices) {
            const noteDistances: number[] = []
            for (const distance of c1.noteDistances()) {
                noteDistances.push(distance)
            }
            for (const distance of c2.noteDistances()) {
                noteDistances.push(distance)
            }
            noteDistances.sort((a, b) => a - b)
            up = ChordLayout.computeAutoStemDirection(noteDistances)
            isUp = up > 0
        } else if (c1.stemDirection() !== DirectionV.AUTO) {
            isUp = c1.stemDirection() === DirectionV.UP
        } else if (c2.stemDirection() !== DirectionV.AUTO) {
            isUp = c2.stemDirection() === DirectionV.UP
        } else if (c1.staffMove() > 0 || c2.staffMove() > 0) {
            isUp = false
        } else if (c1.staffMove() < 0 || c2.staffMove() < 0) {
            isUp = true
        } else if (hasVoices) {
            isUp = c1.track() % 2 === 0
        }
        item.setUp(isUp)
        c1.setUp(c1.staffMove() === 0 ? isUp : !isUp) // if on a different staff, flip stem dir
        c2.setUp(c2.staffMove() === 0 ? isUp : !isUp)
    }

    static layoutTwoNotesTremolo(item: TremoloTwoChord, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const c1 = item.chord1()!
        const c2 = item.chord2()!

        // make sure both stems are in the same direction
        const b1 = c1.beam()
        if (b1 && b1 === c2.beam()) {
            item.setUp(b1.up())
            item.doSetDirection(b1.direction())
            // stem stuff is already taken care of by the beams
        } else {
            TremoloLayout.calcIsUp(item)
            if (!item.userModified()) {
                // user modified trems will be dealt with later
                ChordLayout.layoutStem(c1, ctx)
                ChordLayout.layoutStem(c2, ctx)
            }
        }

        BeamTremoloLayout.setupLData(item, ldata, ctx)
        item.setStartAnchor(BeamTremoloLayout.chordBeamAnchor(ldata, c1, ChordBeamAnchorType.Start))
        item.setEndAnchor(BeamTremoloLayout.chordBeamAnchor(ldata, c2, ChordBeamAnchorType.End))
        // deal with manual adjustments here and return
        if (item.userModified()) {
            const idx = item.directionIdx()
            let startY = item.beamFragment().py1[idx]
            let endY = item.beamFragment().py2[idx]
            if (ctx.conf().styleB(Sid.snapCustomBeamsToGrid)) {
                const quarterSpace = item.spatium() / 4
                startY = Math.round(startY / quarterSpace) * quarterSpace
                endY = Math.round(endY / quarterSpace) * quarterSpace
            }
            startY += item.pagePos().y()
            endY += item.pagePos().y()
            item.startAnchor().setY(startY)
            item.endAnchor().setY(endY)
            ldata.setAnchors(item.startAnchor(), item.endAnchor())
            ChordLayout.layoutStem(c1, ctx)
            ChordLayout.layoutStem(c2, ctx)
            TremoloLayout.createBeamSegments(item, ctx)
            return
        }
        ldata.setPosY(0.0)
        const chordRests: ChordRest[] = [c1, c2]
        const notes: NotePosition[] = []
        let mag = 0.0

        for (const cr of chordRests) {
            const m = cr.isSmall() ? ctx.conf().styleD(Sid.smallNoteMag) : 1.0
            mag = Math.max(mag, m)
            if (cr.isChord()) {
                const chord = cr as Chord
                for (const distance of chord.noteDistances()) {
                    notes.push(new NotePosition(distance, chord.vStaffIdx()))
                }
            }
        }
        notes.sort((a, b) => (a.lt(b) ? -1 : b.lt(a) ? 1 : 0))
        ldata.setMag(mag)
        BeamTremoloLayout.calculateAnchors(item, ldata, ctx, chordRests, notes)
        item.setStartAnchor(ldata.startAnchor)
        item.setEndAnchor(ldata.endAnchor)
        const idx = item.directionIdx()
        item.beamFragment().py1[idx] = item.startAnchor().y() - item.pagePos().y()
        item.beamFragment().py2[idx] = item.endAnchor().y() - item.pagePos().y()
        TremoloLayout.createBeamSegments(item, ctx)
    }

    /**
     * Goal: To extend stem of one of the chords to make the tremolo less steep
     * Returns a modified pair of stem lengths of two chords
     */
    static extendedStemLenWithTwoNoteTremolo(tremolo: TremoloTwoChord, stemLen1: number, stemLen2: number): [number, number] {
        const spatium = tremolo.spatium()
        const c1 = tremolo.chord1()!
        const c2 = tremolo.chord2()!
        const s1 = c1.stem()
        const s2 = c2.stem()
        const sgn1 = c1.up() ? -1.0 : 1.0
        const sgn2 = c2.up() ? -1.0 : 1.0
        const stemTipDistance = (s1 && s2) ? (s2.pagePos().y() + stemLen2) - (s1.pagePos().y() + stemLen1)
            : (StemLayout.stemPos(c2).y() + (sgn2 * stemLen2)) - (StemLayout.stemPos(c1).y() + (sgn1 * stemLen1))

        // same staff & same direction: extend one of the stems
        if (c1.staffMove() === c2.staffMove() && c1.up() === c2.up()) {
            const stem1Higher = stemTipDistance > 0.0
            if (Math.abs(stemTipDistance) > 1.0 * spatium) {
                if ((c1.up() && !stem1Higher) || (!c1.up() && stem1Higher)) {
                    return [stemLen1 + (Math.abs(stemTipDistance) - spatium), stemLen2]
                } else { /* if ((c1->up() && stem1Higher) || (!c1->up() && !stem1Higher)) */
                    return [stemLen1, stemLen2 + (Math.abs(stemTipDistance) - spatium)]
                }
            }
        }

        return [stemLen1, stemLen2]
    }

    static createBeamSegments(item: TremoloTwoChord, ctx: LayoutContext): void {
        // TODO: This should be a style setting, to replace tremoloStrokeLengthMultiplier
        const stemGapSp = 1.0
        const c1 = item.chord1()!
        const c2 = item.chord2()!

        const defaultStyle = (!item.customStyleApplicable()) || (item.tremoloStyle() === TremoloStyle.DEFAULT)

        item.clearBeamSegments()

        const _isGrace = c1.isGrace()
        const pagePos = item.pagePos()
        let startAnchor = item.ldata().startAnchor.minus(new PointF(0.0, pagePos.y()))
        let endAnchor = item.ldata().endAnchor.minus(new PointF(0.0, pagePos.y()))

        // inset trem from stems for default style
        const dx = endAnchor.x() - startAnchor.x()
        const slope = dx === 0 ? 0.0 : (endAnchor.y() - startAnchor.y()) / dx

        let gapSp = stemGapSp
        if (defaultStyle || item.tremoloStyle() === TremoloStyle.TRADITIONAL_ALTERNATE) {
            // we can eat into the stemGapSp margin if the anchorpoints are sufficiently close together
            const widthSp = (endAnchor.x() - startAnchor.x()) / item.spatium() - (stemGapSp * 2)
            if (!RealIsEqualOrMore(widthSp, 0.6)) {
                // tremolo beam is too short; we can eat into the gap spacing a little
                gapSp = Math.max(stemGapSp - ((0.6 - widthSp) * 0.5), 0.4)
            }
        } else {
            gapSp = 0.0
        }

        const mainStroke = new BeamSegment(item)
        const xOffset = new PointF(gapSp * item.spatium(), 0)
        const yOffset = new PointF(0, gapSp * item.spatium() * slope)
        if (item.tremoloStyle() === TremoloStyle.TRADITIONAL_ALTERNATE) {
            mainStroke.line = new LineF(startAnchor, endAnchor)
            startAnchor = startAnchor.plus(xOffset).plus(yOffset)
            endAnchor = endAnchor.minus(xOffset).minus(yOffset)
        } else {
            startAnchor = startAnchor.plus(xOffset).plus(yOffset)
            endAnchor = endAnchor.minus(xOffset).minus(yOffset)
            mainStroke.line = new LineF(startAnchor, endAnchor)
        }
        mainStroke.level = 0

        item.beamSegments().push(mainStroke)
        const line = mainStroke.line
        const halfWidth = 0.5 * ctx.conf().styleMM(Sid.beamWidth)
        const bboxTop = Math.min(line.y1(), line.y2()) - halfWidth
        const bboxBottom = Math.max(line.y1(), line.y2()) + halfWidth
        let bbox = new RectF(line.x1(), bboxTop, line.x2() - line.x1(), bboxBottom - bboxTop)

        const beamOffset = new PointF(0.0,
            (item.up() ? 1 : -1) * item.spatium() * (ctx.conf().styleB(Sid.useWideBeams) ? 1.0 : 0.75)
            * item.mag() * (_isGrace ? ctx.conf().styleD(Sid.graceNoteMag) : 1.0))

        for (let i = 1; i < item.lines(); ++i) {
            const stroke = new BeamSegment(item)
            stroke.level = i
            stroke.line = new LineF(startAnchor.plus(beamOffset.times(i)), endAnchor.plus(beamOffset.times(i)))
            item.beamSegments().push(stroke)
            bbox = bbox.united(bbox.translated(0.0, beamOffset.y() * i))
        }

        item.setbbox(bbox)

        // size stems properly
        if (c1.stem() && c2.stem() && !(c1.beam() && c1.beam() === c2.beam())) {
            // we don't need to do anything if these chords are part of the same beam--their stems are taken care of
            // by the beam layout
            const beamSpacing = ctx.conf().styleB(Sid.useWideBeams) ? 4 : 3
            for (const chord of [c1, c2]) {
                let addition = 0.0
                if (chord.up() !== item.up() && item.lines() > 1) {
                    // need to adjust further for beams on the opposite side
                    addition += (item.lines() - 1.0) * beamSpacing / 4.0 * item.spatium() * item.mag()
                }
                // calling extendStem with addition 0.0 still sizes the stem to the manually adjusted height of the trem.
                BeamTremoloLayout.extendStem(item.ldata(), chord, addition, ctx)
            }
        }
    }
}
