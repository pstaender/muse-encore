/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/tupletlayout.h/.cpp
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { Fraction } from '../../types/fraction'
import { DirectionV, TextStyleType, VOICES, staff2track } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Pid } from '../../dom/property'
import { SegmentType, type Segment } from '../../dom/segment'
import { Text } from '../../dom/text'
import { TupletNumberType, type Tuplet } from '../../dom/tuplet'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { Autoplace } from './autoplace'

export class TupletLayout {
    static layout(item: Tuplet, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (item.elements().length === 0) {
            return
        }

        const stt = item.staffType()
        if (stt && stt.isTabStaff() && stt.stemless()) {
            return
        }

        TupletLayout.createNumber(item, ctx)
        TupletLayout.computeDirection(item)

        const [cr1, cr2] = TupletLayout.computeStartEndCR(item)

        const hasBracket = item.calcHasBracket(cr1, cr2)
        item.setHasBracket(hasBracket)

        const mag = (cr1.mag() + cr2.mag()) / 2
        ldata.setMag(mag)
        item.setPos(0.0, 0.0)

        TupletLayout.layoutBracket(item, cr1, cr2, ctx)

        // collect bounding box
        let r = new RectF()
        const number = item.number()
        if (number) {
            r = r.united(number.ldata().bbox().translated(number.pos()))
            if (item.hasBracket()) {
                const b = new RectF()
                b.setCoords(item.bracketL[1].x(), item.bracketL[1].y(), item.bracketR[2].x(), item.bracketR[2].y())
                r = r.united(b)
            }
        } else if (item.hasBracket()) {
            const b = new RectF()
            b.setCoords(item.bracketL[1].x(), item.bracketL[1].y(), item.bracketL[3].x(), item.bracketL[3].y())
            r = r.united(b)
        }
        item.setbbox(r)

        if (!item.cross()) {
            Autoplace.autoplaceMeasureElement(item, item.mutldata(), item.isUp(), /* add to skyline */ true)
        }
    }

    static layoutTupletAndNestedTuplets(t: Tuplet, ctx: LayoutContext): void {
        const elements = [...t.elements()]
        for (let i = elements.length - 1; i >= 0; --i) {
            const d = elements[i]
            if ((d as unknown) === t) {
                continue
            }
            if (d.isTuplet()) {
                TupletLayout.layoutTupletAndNestedTuplets(d as unknown as Tuplet, ctx)
            }
        }
        TupletLayout.layout(t, ctx)
    }

    static isTopTuplet(cr: ChordRest): boolean {
        let t = cr.tuplet()
        if (t && (t.elements()[0] as unknown) === cr) {
            // find top level tuplet
            while (t.tuplet()) {
                t = t.tuplet()!
            }
            // consider tuplet cross if anything moved within it
            return !t.cross()
        }
        // no tuplet or not first element
        return false
    }

    static notTopTuplet(cr: ChordRest): boolean {
        let t = cr.tuplet()
        if (t && (t.elements()[0] as unknown) === cr) {
            // find top level tuplet
            while (t.tuplet()) {
                t = t.tuplet()!
            }
            // consider tuplet cross if anything moved within it
            return t.cross()
        }
        // no tuplet or not first element
        return false
    }

    private static createNumber(item: Tuplet, ctx: LayoutContext): void {
        if (item.numberType() === TupletNumberType.NO_TEXT) {
            if (item.number()) {
                item.setNumber(null)
            }
            return
        }

        if (!item.number()) {
            const number = new Text(item, TextStyleType.TUPLET)
            number.setComposition(true)
            number.setTrack(item.track())
            number.setParent(item)
            number.setVisible(item.visible())
            number.setColor(item.color())
            item.setNumber(number)
            item.resetNumberProperty()
        }
        const number = item.number()!
        // tuplet properties are propagated to number automatically by setProperty()
        // but we need to make sure flags are as well
        number.setPropertyFlags(Pid.FONT_FACE, item.propertyFlags(Pid.FONT_FACE))
        number.setPropertyFlags(Pid.FONT_SIZE, item.propertyFlags(Pid.FONT_SIZE))
        number.setPropertyFlags(Pid.FONT_STYLE, item.propertyFlags(Pid.FONT_STYLE))
        number.setPropertyFlags(Pid.ALIGN, item.propertyFlags(Pid.ALIGN))
        number.setPropertyFlags(Pid.POSITION, item.propertyFlags(Pid.POSITION))

        const style = ctx.conf().style()
        const numberString = (item.numberType() === TupletNumberType.SHOW_NUMBER)
            ? `${item.ratio().numerator()}`
            : `${item.ratio().numerator()}:${item.ratio().denominator()}`
        if (style.styleB(Sid.tupletUseSymbols)) {
            let smuflNum = ''
            for (const c of numberString) {
                smuflNum += '<sym>tuplet' + c + '</sym>'
            }
            smuflNum = smuflNum.split(':').join('Colon')
            number.setXmlText(smuflNum)
        } else {
            number.setXmlText(numberString)
        }

        item.setIsSmall(true)
        for (const e of item.elements()) {
            if ((e.isChordRest() && !(e as unknown as ChordRest).isSmall()) || (e.isTuplet() && !(e as unknown as Tuplet).isSmall())) {
                item.setIsSmall(false)
                break
            }
        }
        number.mutldata().setMag(item.isSmall() ? style.styleD(Sid.smallNoteMag) : 1.0)
    }

    private static computeDirection(item: Tuplet): void {
        if (item.direction() !== DirectionV.AUTO) {
            item.setIsUp(item.direction() === DirectionV.UP)
            return
        }

        let up = 0
        for (const e of item.elements()) {
            if (e.isChord()) {
                const c = e as unknown as Chord
                if (c.stemDirection() !== DirectionV.AUTO) {
                    up += c.stemDirection() === DirectionV.UP ? 1000 : -1000
                } else {
                    up += c.up() ? 1 : -1
                }
            }
        }
        if (up === 0) {
            const m = item.measure()
            if (m && m.hasVoices(item.staffIdx())) {
                up = item.voice() % 2 === 0 ? 1 : -1
            } else {
                up = 1 // default up
            }
        }
        item.setIsUp(up > 0)
    }

    private static computeStartEndCR(item: Tuplet): [ChordRest, ChordRest] {
        let startEl = item.elements()[0]
        while (startEl.isTuplet()) {
            const t = startEl as unknown as Tuplet
            if (t.elements().length === 0) {
                break
            }
            startEl = t.elements()[0]
        }

        let endEl = item.elements()[item.elements().length - 1]
        while (endEl.isTuplet()) {
            const t = endEl as unknown as Tuplet
            if (t.elements().length === 0) {
                break
            }
            endEl = t.elements()[t.elements().length - 1]
        }

        return [startEl as unknown as ChordRest, endEl as unknown as ChordRest]
    }

    private static layoutBracket(item: Tuplet, cr1: ChordRest, cr2: ChordRest, ctx: LayoutContext): void {
        const style = ctx.conf().style()
        const spatium = item.spatium()

        //
        // shall we draw a bracket?
        //
        const maxSlope = style.styleD(Sid.tupletMaxSlope)
        let outOfStaff = style.styleB(Sid.tupletOutOfStaff)
        let vHeadDistance = style.styleMM(Sid.tupletVHeadDistance) * item.mag()
        const vStemDistance = style.styleMM(Sid.tupletVStemDistance) * item.mag()
        const stemLeft = (style.styleMM(Sid.tupletStemLeftDistance) - style.styleMM(Sid.tupletBracketWidth) / 2) * cr1.mag()
        const stemRight = (style.styleMM(Sid.tupletStemRightDistance) - style.styleMM(Sid.tupletBracketWidth) / 2) * cr2.mag()
        const noteLeft = (style.styleMM(Sid.tupletNoteLeftDistance) - style.styleMM(Sid.tupletBracketWidth) / 2) * cr1.mag()
        const noteRight = (style.styleMM(Sid.tupletNoteRightDistance) - style.styleMM(Sid.tupletBracketWidth) / 2) * cr2.mag()

        let move = 0
        if (outOfStaff && cr1.isChordRest() && cr2.isChordRest()) {
            // account for staff move when adjusting bracket to avoid staff
            // but don't attempt adjustment unless both endpoints are in same staff
            if (cr1.staffMove() === cr2.staffMove()) {
                move = cr1.staffMove()
            } else {
                outOfStaff = false
            }
        }

        const l1 = style.styleMM(Sid.tupletBracketHookHeight) * item.mag()
        let l2l = vHeadDistance // left bracket vertical distance
        let l2r = vHeadDistance // right bracket vertical distance

        if (item.isUp()) {
            vHeadDistance = -vHeadDistance
        }

        item.setP1(cr1.pagePos())
        item.setP2(cr2.pagePos())
        const p1 = item.p1()
        const p2 = item.p2()

        p1.setX(p1.x() - noteLeft)
        p2.setX(p2.x() + ctx.conf().noteHeadWidth() + noteRight)
        p1.setY(p1.y() + vHeadDistance) // TODO: Direction ?
        p2.setY(p2.y() + vHeadDistance)

        let xx1 = p1.x() // use to center the number on the beam

        let leftNoteEdge = 0.0 // page coordinates
        let rightNoteEdge = 0.0
        if (cr1.isChord()) {
            const chord1 = cr1 as Chord
            leftNoteEdge = chord1.up() ? chord1.downNote().pageBoundingRect().left() : chord1.upNote().pageBoundingRect().left()
        }
        if (cr2.isChord()) {
            const chord2 = cr2 as Chord
            rightNoteEdge = chord2.up() ? chord2.downNote().pageBoundingRect().right() : chord2.upNote().pageBoundingRect().right()
        }

        if (item.isUp()) {
            if (cr1.isChord()) {
                const chord1 = cr1 as Chord
                const stem = chord1.stem()
                if (stem) {
                    xx1 = stem.pageBoundingRect().x()
                }
                if (chord1.up() && stem) {
                    p1.setY(stem.pageBoundingRect().y())
                    l2l = vStemDistance
                    p1.setX(stem.pageBoundingRect().left() - stemLeft)
                } else {
                    p1.setY(chord1.upNote().pageBoundingRect().top())
                    p1.setX(leftNoteEdge - noteLeft)
                }
            }

            if (cr2.isChord()) {
                const chord2 = cr2 as Chord
                const stem = chord2.stem()
                if (stem && chord2.up()) {
                    p2.setY(stem.pageBoundingRect().top())
                    l2r = vStemDistance
                    p2.setX(stem.pageBoundingRect().right() + stemRight)
                } else {
                    p2.setY(chord2.upNote().pageBoundingRect().top())
                    p2.setX(rightNoteEdge + noteRight)
                }
            }

            //
            // special case: one of the bracket endpoints is
            // a rest
            //
            if (!cr1.isChord() && cr2.isChord()) {
                if (p2.y() < p1.y()) {
                    p1.setY(p2.y())
                } else {
                    p2.setY(p1.y())
                }
            } else if (cr1.isChord() && !cr2.isChord()) {
                if (p1.y() < p2.y()) {
                    p2.setY(p1.y())
                } else {
                    p1.setY(p2.y())
                }
            }

            // outOfStaff
            if (outOfStaff) {
                let min = cr1.measure()!.staffPageBoundingRect(cr1.staffIdx() + move).y()
                if (min < p1.y()) {
                    p1.setY(min)
                    l2l = vStemDistance
                }
                min = cr2.measure()!.staffPageBoundingRect(cr2.staffIdx() + move).y()
                if (min < p2.y()) {
                    p2.setY(min)
                    l2r = vStemDistance
                }
            }

            // check that slope is no more than max
            let d = (p2.y() - p1.y()) / (p2.x() - p1.x())
            if (d < -maxSlope) {
                // move p1 y up
                p1.setY(p2.y() + maxSlope * (p2.x() - p1.x()))
            } else if (d > maxSlope) {
                // move p2 y up
                p2.setY(p1.y() + maxSlope * (p2.x() - p1.x()))
            }

            // check for collisions
            const n = item.elements().length
            if (n >= 3) {
                d = (p2.y() - p1.y()) / (p2.x() - p1.x())
                for (let i = 1; i < (n - 1); ++i) {
                    const e = item.elements()[i]
                    if (e.isChord()) {
                        const chord = e as unknown as Chord
                        const stem = chord.stem()
                        if (stem) {
                            const r = chord.up() ? stem.pageBoundingRect() : chord.upNote().pageBoundingRect()
                            const y3 = r.top()
                            const x3 = r.x() + r.width() * 0.5
                            const y0 = p1.y() + (x3 - p1.x()) * d
                            const c = y0 - y3
                            if (c > 0) {
                                p1.setY(p1.y() - c)
                                p2.setY(p2.y() - c)
                            }
                        }
                    }
                }
            }
        } else {
            if (cr1.isChord()) {
                const chord1 = cr1 as Chord
                const stem = chord1.stem()
                if (stem) {
                    xx1 = stem.pageBoundingRect().x()
                }
                if (!chord1.up() && stem) {
                    p1.setY(stem.pageBoundingRect().bottom())
                    l2l = vStemDistance
                    p1.setX(stem.pageBoundingRect().left() - stemLeft)
                } else {
                    p1.setY(chord1.downNote().pageBoundingRect().bottom())
                    p1.setX(leftNoteEdge - noteLeft)
                }
            }

            if (cr2.isChord()) {
                const chord2 = cr2 as Chord
                const stem = chord2.stem()
                if (stem && !chord2.up()) {
                    p2.setY(stem.pageBoundingRect().bottom())
                    l2r = vStemDistance
                    p2.setX(stem.pageBoundingRect().right() + stemRight)
                } else {
                    p2.setY(chord2.downNote().pageBoundingRect().bottom())
                    p2.setX(rightNoteEdge + noteRight)
                }
            }
            //
            // special case: one of the bracket endpoints is
            // a rest
            //
            if (!cr1.isChord() && cr2.isChord()) {
                if (p2.y() > p1.y()) {
                    p1.setY(p2.y())
                } else {
                    p2.setY(p1.y())
                }
            } else if (cr1.isChord() && !cr2.isChord()) {
                if (p1.y() > p2.y()) {
                    p2.setY(p1.y())
                } else {
                    p1.setY(p2.y())
                }
            }
            // outOfStaff
            if (outOfStaff) {
                let max = cr1.measure()!.staffPageBoundingRect(cr1.staffIdx() + move).bottom()
                if (max > p1.y()) {
                    p1.setY(max)
                    l2l = vStemDistance
                }
                max = cr2.measure()!.staffPageBoundingRect(cr2.staffIdx() + move).bottom()
                if (max > p2.y()) {
                    p2.setY(max)
                    l2r = vStemDistance
                }
            }
            // check that slope is no more than max
            let d = (p2.y() - p1.y()) / (p2.x() - p1.x())
            if (d < -maxSlope) {
                // move p1 y up
                p2.setY(p1.y() - maxSlope * (p2.x() - p1.x()))
            } else if (d > maxSlope) {
                // move p2 y up
                p1.setY(p2.y() - maxSlope * (p2.x() - p1.x()))
            }

            // check for collisions
            const n = item.elements().length
            if (n >= 3) {
                d = (p2.y() - p1.y()) / (p2.x() - p1.x())
                for (let i = 1; i < (n - 1); ++i) {
                    const e = item.elements()[i]
                    if (e.isChord()) {
                        const chord = e as unknown as Chord
                        const stem = chord.stem()
                        if (stem) {
                            const r = chord.up() ? chord.downNote().pageBoundingRect() : stem.pageBoundingRect()
                            const y3 = r.bottom()
                            const x3 = r.x() + r.width() * 0.5
                            const y0 = p1.y() + (x3 - p1.x()) * d
                            const c = y0 - y3
                            if (c < 0) {
                                p1.setY(p1.y() - c)
                                p2.setY(p2.y() - c)
                            }
                        }
                    }
                }
            }
        }

        if (!cr1.isChord()) {
            p1.setX(cr1.pageBoundingRect().left() - noteLeft)
        }

        if (!cr2.isChord()) {
            const shape = cr2.ldata().shape()
            const shEl = shape.find_if((i) => !!i.item() && i.item()!.isChordRest())
            if (shEl) {
                p2.setX(shEl.translated(cr2.pagePos()).right() + noteRight)
            }
        }

        const mp = item.parentItem()!.pagePos()
        if (item.explicitParent()!.isMeasure()) {
            const s = (item.explicitParent() as unknown as Measure).system()
            if (s) {
                const tupletStaff = s.staff(item.vStaffIdx())
                mp.setY(mp.y() + (tupletStaff ? tupletStaff.y() : 0.0))
            }
        }
        const userP1 = item.userP1()
        const userP2 = item.userP2()
        p1.setX(p1.x() - mp.x() + userP1.x())
        p1.setY(p1.y() - mp.y() + userP1.y())
        p2.setX(p2.x() - mp.x() + userP2.x())
        p2.setY(p2.y() - mp.y() + userP2.y())

        xx1 -= mp.x()

        p1.setY(p1.y() - l2l * (item.isUp() ? 1.0 : -1.0))
        p2.setY(p2.y() - l2r * (item.isUp() ? 1.0 : -1.0))

        // Account for staff offset (tab staves etc.)
        const yOffset = item.staffOffsetY()
        p1.setY(p1.y() - yOffset)
        p2.setY(p2.y() - yOffset)

        if (style.styleB(Sid.tupletExtendToEndOfDuration)) {
            TupletLayout.extendToEndOfDuration(item, cr2)
        }

        // center number
        let xNumber = 0.0
        let numberWidth = 0.0
        const number = item.number()
        if (number) {
            const numLdata = number.mutldata()
            TLayout.layoutText(number, ctx)
            numberWidth = numLdata.bbox().width()

            const yNumber = p1.y() + (p2.y() - p1.y()) * 0.5 - l1 * (item.isUp() ? 1.0 : -1.0)
            if (TupletLayout.placeNumberOnRhythmicCenter(item, cr1, cr2, ctx)) {
                xNumber = TupletLayout.computeRhythmicCenter(item, cr2)
            } else if (cr1.beam() && cr2.beam() && cr1.beam() === cr2.beam() && !item.hasBracket()) {
                // for beamed tuplets, center number on beam - if they don't have a bracket
                if (item.isUp() === cr1.up()) {
                    const deltax = cr2.pagePos().x() - cr1.pagePos().x()
                    xNumber = xx1 + deltax * 0.5
                } else {
                    const deltax = p2.x() - p1.x()
                    xNumber = p1.x() + deltax * 0.5
                }
            } else {
                // otherwise center on the bracket (TODO: make centering rules customizable?)
                const deltax = p2.x() - p1.x()
                xNumber = p1.x() + deltax * 0.5
            }

            numLdata.setPos(new PointF(xNumber, yNumber).minus(item.ldata().pos()))
        }

        if (item.hasBracket()) {
            const slope = (p2.y() - p1.y()) / (p2.x() - p1.x())
            const numberGap = 0.35 * spatium
            const L = item.bracketL
            const R = item.bracketR

            if (item.isUp()) {
                if (number) {
                    let x = xNumber - numberWidth * 0.5 - numberGap
                    p1.setX(Math.min(p1.x(), x - 0.5 * l1)) // ensure enough space for the number
                    let y = p1.y() + (x - p1.x()) * slope
                    L[0] = new PointF(p1.x(), p1.y())
                    L[1] = new PointF(p1.x(), p1.y() - l1)
                    L[2] = new PointF(x, y - l1)

                    x = xNumber + numberWidth * 0.5 + numberGap
                    p2.setX(Math.max(p2.x(), x + 0.5 * l1)) // ensure enough space for the number
                    y = p1.y() + (x - p1.x()) * slope
                    R[0] = new PointF(x, y - l1)
                    R[1] = new PointF(p2.x(), p2.y() - l1)
                    R[2] = new PointF(p2.x(), p2.y())
                } else {
                    L[0] = new PointF(p1.x(), p1.y())
                    L[1] = new PointF(p1.x(), p1.y() - l1)
                    L[2] = new PointF(p2.x(), p2.y() - l1)
                    L[3] = new PointF(p2.x(), p2.y())
                }
            } else {
                if (number) {
                    let x = xNumber - numberWidth * 0.5 - numberGap
                    p1.setX(Math.min(p1.x(), x - 0.5 * l1)) // ensure enough space for the number
                    let y = p1.y() + (x - p1.x()) * slope
                    L[0] = new PointF(p1.x(), p1.y())
                    L[1] = new PointF(p1.x(), p1.y() + l1)
                    L[2] = new PointF(x, y + l1)

                    x = xNumber + numberWidth * 0.5 + numberGap
                    p2.setX(Math.max(p2.x(), x + 0.5 * l1))
                    y = p1.y() + (x - p1.x()) * slope
                    R[0] = new PointF(x, y + l1)
                    R[1] = new PointF(p2.x(), p2.y() + l1)
                    R[2] = new PointF(p2.x(), p2.y())
                } else {
                    L[0] = new PointF(p1.x(), p1.y())
                    L[1] = new PointF(p1.x(), p1.y() + l1)
                    L[2] = new PointF(p2.x(), p2.y() + l1)
                    L[3] = new PointF(p2.x(), p2.y())
                }
            }
        }
    }

    private static placeNumberOnRhythmicCenter(item: Tuplet, cr1: ChordRest, cr2: ChordRest, ctx: LayoutContext): boolean {
        if (ctx.conf().styleB(Sid.tupletNumberRythmicCenter) && !TupletLayout.isSymmetric(item, cr1, cr2)) {
            const center = TupletLayout.centerTick(item)
            if (cr2.tick().le(center)) {
                return ctx.conf().styleB(Sid.tupletExtendToEndOfDuration)
            }
            return true
        }
        return false
    }

    private static isSymmetric(_item: Tuplet, cr1: ChordRest, cr2: ChordRest): boolean {
        const endTick = cr2.endTick()
        const tupletSegments: Segment[] = []
        for (let segment: Segment | null = cr1.segment(); segment && segment.tick().lt(endTick); segment = segment.nextActive()) {
            tupletSegments.push(segment)
        }

        const segmentsCount = tupletSegments.length
        for (let i = 0; i < segmentsCount; ++i) {
            const j = segmentsCount - 1 - i
            if (j <= i) {
                break
            }
            const firstSeg = tupletSegments[i]
            const secondSeg = tupletSegments[j]
            if (!firstSeg.ticks().eq(secondSeg.ticks())) {
                return false
            }
        }

        return true
    }

    private static computeRhythmicCenter(item: Tuplet, endChord: ChordRest): number {
        const center = TupletLayout.centerTick(item)
        const track = item.track()

        let refSeg: Segment | null = null
        let refCR: ChordRest | null = null
        for (let seg: Segment | null = endChord.segment(); seg; seg = seg.prev(SegmentType.ChordRest)) {
            refSeg = seg
            refCR = seg.element(track) as ChordRest | null
            if (!refCR) {
                continue
            }
            if (seg.tick().le(center)) {
                break
            }
        }

        if (!refSeg || !refCR) {
            return 0.0
        }

        if (refSeg.tick().eq(center)) {
            let xRef: number
            if (refCR.isChord()) {
                const chord = refCR as Chord
                const chordUp = chord.up()
                const tupletPlaceAbove = item.isUp()
                xRef = 0.5 * chord.upNote().headWidth()
                if (chordUp === tupletPlaceAbove) {
                    xRef += (chordUp ? 0.25 : -0.25) * chord.upNote().headWidth()
                }
            } else {
                xRef = 0.5 * refCR.width()
            }
            return refSeg.x() + xRef
        }

        const refCRTicks = refCR.actualTicks()
        const tickDiff = center.minus(refCR.tick())
        const tickRatio = tickDiff.div(refCRTicks).toDouble()

        const nextSeg = item.measure()!.findSegment(SegmentType.ChordRest, refSeg.tick().plus(refCRTicks))
        const xRef = refSeg.x() + (refCR.isChord() ? (refCR as Chord).upNote().headWidth() : refCR.width())
        const refWidth = nextSeg ? nextSeg.x() - xRef : refSeg.width()
        const relativeWidth = refWidth * tickRatio

        return xRef + relativeWidth
    }

    private static centerTick(item: Tuplet): Fraction {
        const startTick = item.tick()
        const baseLen = item.baseLen().ticks()
        const ratio = item.ratio()
        const subdivision = item.baseLen().ticks().div(item.ratio())
        const endTick = startTick.plus(baseLen.times(ratio.denominator()))
        return startTick.plus(endTick).minus(subdivision).div(2)
    }

    private static extendToEndOfDuration(item: Tuplet, endCR: ChordRest): void {
        const baseDuration = item.baseLen().ticks()
        if (endCR.ticks().le(baseDuration)) {
            return
        }

        const lastTupletSubdivision = endCR.endTick().minus(baseDuration.div(item.ratio()))
        let refSegment: Segment = endCR.segment()!
        for (;;) {
            const nextCRSeg = refSegment.next1(SegmentType.ChordRest)
            if (!nextCRSeg || nextCRSeg.tick().gt(lastTupletSubdivision)) {
                break
            }
            refSegment = nextCRSeg
        }

        const tickRatio = lastTupletSubdivision.minus(refSegment.tick()).div(refSegment.ticks())
        let xResult = refSegment.pagePos().x() + refSegment.width() * tickRatio.toDouble() + item.score().noteHeadWidth()

        const padding = 0.6 * item.spatium()
        const nextSeg = refSegment.next1WithElemsOnStaff(endCR.vStaffIdx(), ~SegmentType.TimeTick)
        if (!nextSeg) {
            return
        }
        xResult = Math.min(xResult, nextSeg.pagePos().x() - padding)

        const startTrack = staff2track(endCR.vStaffIdx())
        const endTrack = startTrack + VOICES
        if (nextSeg.isChordRestType()) {
            for (let track = startTrack; track < endTrack; ++track) {
                const chordRest = nextSeg.element(track) as ChordRest | null
                if (chordRest) {
                    const nextTuplet = chordRest.tuplet()
                    if (nextTuplet) {
                        if ((nextTuplet.elements()[0] as unknown) === chordRest && nextTuplet.isUp() === item.isUp()) {
                            const xStartOfNextTuplet = nextTuplet.pagePos().x() + nextTuplet.p1().x()
                            xResult = Math.min(xResult, xStartOfNextTuplet - padding)
                        }
                    }
                }
            }
        }

        const nextSegShape = nextSeg.staffShape(endCR.vStaffIdx()).clone()
        nextSegShape.translate(new PointF(nextSeg.pagePos().x(), nextSeg.system()!.staff(endCR.vStaffIdx())!.y()))
        const yAbove = item.p2().y() - (item.isUp() ? item.style().styleMM(Sid.tupletBracketHookHeight) : 0.0)
        const yBelow = item.p2().y() + (item.isUp() ? 0.0 : item.style().styleMM(Sid.tupletBracketHookHeight))
        const left = nextSegShape.leftMostEdgeAtHeight(yAbove, yBelow)
        xResult = Math.min(xResult, left - padding)

        const curPos = item.p2().x()
        item.p2().setX(Math.max(curPos, xResult - item.measure()!.pagePos().x()))
    }
}
