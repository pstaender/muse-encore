/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/masklayout.h/.cpp
 */

import { Fraction } from '../../types/fraction'
import { VOICES, staff2track } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Shape, intersects } from '../../infrastructure/shape'
import { Pid } from '../../dom/property'
import { SegmentType, type Segment } from '../../dom/segment'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import type { Page } from '../../dom/page'
import type { StaffLines } from '../../dom/stafflines'
import type { System } from '../../dom/system'
import { FrameType, type TextBase } from '../../dom/textbase'
import type { TextLineBaseSegment } from '../../dom/textlinebase'
import type { LayoutContext } from './layoutcontext'

/** C++ Segment::CHORD_REST_OR_TIME_TICK_TYPE */
const CHORD_REST_OR_TIME_TICK_TYPE = SegmentType.ChordRest | SegmentType.TimeTick

export class MaskLayout {
    static computeMasks(ctx: LayoutContext, page: Page): void {
        const maskBarlines = ctx.conf().styleB(Sid.maskBarlinesForText)

        for (const system of page.systems()) {
            const allSystemText = MaskLayout.collectAllSystemText(system)

            for (const mb of system.measures()) {
                if (!mb.isMeasure()) {
                    continue
                }
                const measure = mb as Measure

                if (maskBarlines) {
                    for (let seg = measure.first(); seg; seg = seg.next()) {
                        if (seg.segmentType() & SegmentType.BarLineType) {
                            MaskLayout.computeBarlineMasks(seg, system, allSystemText, ctx)
                        }
                    }
                }

                const nstaves = ctx.dom().nstaves()
                for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                    if (staffIdx >= system.staves().length || !system.staff(staffIdx)!.show()) {
                        continue
                    }
                    const staff = ctx.dom().staff(staffIdx)!
                    const staffType = staff.staffType(measure.tick())
                    const staffLines = measure.staffLines(staffIdx)
                    if (staffType.isTabStaff()) {
                        MaskLayout.maskTABStringLinesForFrets(staffLines, ctx)
                    }
                }
            }
        }
    }

    private static computeBarlineMasks(barlineSement: Segment, system: System, allSystemText: TextBase[], ctx: LayoutContext): void {
        if (barlineSement.measure().isLastInSystem() && barlineSement === barlineSement.measure().lastEnabled()) {
            return
        }

        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            if (!system.staff(staffIdx)!.show()) {
                continue
            }
            const barline = barlineSement.element(staff2track(staffIdx)) as BarLine | null
            if (!barline || !barline.spanStaff()) {
                continue
            }
            MaskLayout.maskBarlineForText(barline, allSystemText)
        }
    }

    private static maskBarlineForText(barline: BarLine, allSystemText: TextBase[]): void {
        const barlinePos = barline.pagePos()
        const barlineShape = barline.shape().translated(barlinePos)

        const mask = new Shape()
        const spatium = barline.spatium()

        for (const text of allSystemText) {
            const fontSizeScaleFactor = text.size() / 10.0
            const collisionPadding = 0.2 * spatium * fontSizeScaleFactor
            const hasFrame = text.frameType() !== FrameType.NO_FRAME
            const useHighResShape = !text.isDynamic() && !text.hasFrame()
            const maskPadding = hasFrame ? 0.0 : Math.min(Math.max(0.5 * spatium * fontSizeScaleFactor, 0.1 * spatium), spatium)

            const textPos = text.pagePos()
            if (!barlineShape.intersects(text.ldata().bbox().translated(textPos).padded(collisionPadding))) {
                continue
            }

            const textShape = (useHighResShape ? text.ldata().highResShape : text.ldata().shape()).translated(textPos)

            let filteredTextShape = new Shape()
            for (const el of textShape.elements()) {
                if (barlineShape.intersects(el.padded(collisionPadding))) {
                    filteredTextShape.add(el)
                }
            }
            if (filteredTextShape.empty()) {
                continue
            }

            filteredTextShape = new Shape(filteredTextShape.bbox())
            filteredTextShape.pad(maskPadding)

            mask.add(filteredTextShape.translate(barlinePos.times(-1)))
        }

        if (mask.empty()) {
            barline.mutldata().setMask(mask)
            return
        }

        // Ensure that we don't leave tiny barline fragments. If two masking
        // elements are too close to each other we extend them to join.
        barlineShape.translate(barlinePos.times(-1))
        const minFragmentLengh = 0.5 * spatium
        MaskLayout.cleanupMask(barlineShape, mask, minFragmentLengh)

        barline.mutldata().setMask(mask)
    }

    private static cleanupMask(itemShape: Shape, mask: Shape, minFragmentLength: number): void {
        const elements = mask.elements()
        for (let i = 0; i < elements.length; ++i) {
            const el = elements[i]

            if (el.top() - itemShape.top() < minFragmentLength) {
                el.adjust(0.0, -minFragmentLength, 0.0, 0.0)
            }
            if (itemShape.bottom() - el.bottom() < minFragmentLength) {
                el.adjust(0.0, 0.0, 0.0, minFragmentLength)
            }

            if (el.left() + itemShape.left() < minFragmentLength) {
                el.adjust(-minFragmentLength, 0.0, 0.0, 0.0)
            }
            if (itemShape.right() - el.right() < minFragmentLength) {
                el.adjust(0.0, 0.0, minFragmentLength, 0.0)
            }

            for (let j = i + 1; j < elements.length; ++j) {
                const otherEl = elements[j]
                if (intersects(el.left(), el.right(), otherEl.left(), otherEl.right())) {
                    const otherIsBelow = otherEl.y() > el.y()
                    const vertClearance = otherIsBelow ? otherEl.top() - el.bottom() : el.top() - otherEl.bottom()
                    if (vertClearance < minFragmentLength) {
                        (otherIsBelow ? el : otherEl).adjust(0.0, 0.0, 0.0, minFragmentLength)
                    }
                }
                if (intersects(el.top(), el.bottom(), otherEl.top(), el.bottom())) {
                    const otherIsRight = otherEl.x() > el.x()
                    const horClearance = otherIsRight ? otherEl.left() - el.right() : el.left() - otherEl.right()
                    if (horClearance < minFragmentLength) {
                        (otherIsRight ? el : otherEl).adjust(0.0, 0.0, minFragmentLength, 0.0)
                    }
                }
            }
        }
        mask.invalidateBBox()
    }

    private static collectAllSystemText(system: System): TextBase[] {
        const allText: TextBase[] = []

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            const measure = mb as Measure
            for (let i = 0; i < measure.mstaves().length; ++i) {
                if (measure.showMeasureNumberOnStaff(i)) {
                    const measureNumber = measure.measureNumber(i)
                    if (measureNumber) {
                        allText.push(measureNumber as TextBase)
                    }
                }
            }
            for (const item of measure.el()) {
                const staff = system.staff(item.staffIdx())
                const staffVisible = !!staff && staff.show()
                if ((item.isMarker() || item.isJump()) && item.visible() && staffVisible) {
                    allText.push(item as TextBase)
                }
            }
            for (let s = measure.first(); s; s = s.next()) {
                if (!(s.segmentType() & CHORD_REST_OR_TIME_TICK_TYPE) || !s.enabled()) {
                    continue
                }
                for (const annotation of s.annotations()) {
                    const staff = system.staff(annotation.staffIdx())
                    const staffVisible = !!staff && staff.show()
                    if (annotation.isTextBase() && annotation.visible() && staffVisible) {
                        allText.push(annotation as TextBase)
                    }
                }
                if (!s.isChordRestType()) {
                    continue
                }
                for (const chordRest of s.elist()) {
                    if (!chordRest || !system.staff(chordRest.staffIdx())!.show()) {
                        continue
                    }
                    for (const lyr of (chordRest as ChordRest).lyrics()) {
                        if (lyr.visible()) {
                            allText.push(lyr)
                        }
                    }
                }
            }
        }

        for (const spannerSegment of system.spannerSegments()) {
            if (!spannerSegment.isTextLineBaseSegment() || !system.staff(spannerSegment.staffIdx())!.show()
                || !(spannerSegment.getProperty(Pid.VISIBLE) as boolean)) {
                continue
            }
            const textLineBaseSegment = spannerSegment as TextLineBaseSegment
            const beginText = textLineBaseSegment.text()
            const endText = textLineBaseSegment.endText()
            if (beginText && !beginText.empty()) {
                allText.push(beginText)
            }
            if (endText && !endText.empty()) {
                allText.push(endText)
            }
        }

        return allText
    }

    private static maskTABStringLinesForFrets(staffLines: StaffLines, ctx: LayoutContext): void {
        const staffIdx = staffLines.staffIdx()
        const linesThrough = ctx.dom().staff(staffIdx)!.staffType(new Fraction(0, 1)).linesThrough()

        const staffLinesPos = staffLines.pagePos()

        const padding = ctx.conf().styleMM(Sid.tabFretPadding)

        const startTrack = staff2track(staffIdx)
        const endTrack = startTrack + VOICES

        const mask = new Shape()

        const maskFret = (chord: Chord): void => {
            for (const note of chord.notes()) {
                if (!note.visible()) {
                    continue
                }
                if (!note.shouldHideFret() && (!linesThrough || note.fretConflict())) {
                    const noteShape = new Shape(note.ldata().bbox())
                    noteShape.translate(note.pagePos())

                    noteShape.pad(padding)
                    mask.add(noteShape.translated(staffLinesPos.times(-1)))
                }
            }
        }

        const maskParens = (chord: Chord): void => {
            if (linesThrough) {
                return
            }
            for (const i of chord.noteParentheses()) {
                const leftParen = i.leftParen()
                const rightParen = i.rightParen()
                // C++ initialises allHidden with false, so it never skips

                // HACK: Overlapping mask regions which have the same y value and height cause errors
                // Parentheses on single fret marks have the same height as the fret marks
                const PAREN_PADDING_EPSILON = 1.0
                for (const paren of [leftParen, rightParen]) {
                    if (paren && paren.visible()) {
                        const parenShape = new Shape(paren.ldata().bbox().translated(paren.pagePos()))
                        parenShape.pad(padding)
                        parenShape.adjust(0, -PAREN_PADDING_EPSILON, 0, PAREN_PADDING_EPSILON)
                        mask.add(parenShape.translated(staffLinesPos.times(-1)))
                    }
                }
            }
        }

        const measure = staffLines.measure()
        for (let seg = measure.first(SegmentType.ChordRest); seg; seg = seg.next(SegmentType.ChordRest)) {
            for (let track = startTrack; track < endTrack; ++track) {
                const el = seg.element(track)
                if (!el || !el.isChord()) {
                    continue
                }
                maskFret(el as Chord)
                maskParens(el as Chord)
                for (const grace of (el as Chord).graceNotes()) {
                    maskFret(grace)
                    maskParens(grace)
                }
            }
        }

        staffLines.mutldata().setMask(mask)
    }
}
