/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/arpeggiolayout.h/.cpp
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { ArpeggioType, ElementType } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { Accidental } from '../../dom/accidental'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Chord } from '../../dom/chord'
import { paddingTable } from '../paddingtable'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'

const ARBITRARY_ARPEGGIO_LENGTH = 2147483647 // INT_MAX

/** C++ std::pair<int, int> operator< */
function pairLess(a1: number, a2: number, b1: number, b2: number): boolean {
    return a1 < b1 || (a1 === b1 && a2 < b2)
}

export class ArpeggioLayout {
    /** called after layout of page */
    static layoutArpeggio2(item: Arpeggio | null, ctx: LayoutContext): void {
        if (!item) {
            return
        }
        TLayout.layoutItem(item, ctx)
    }

    //
    // INSET:
    // Arpeggios have inset white space. For instance, the bracket
    // "[" shape has whitespace inside of the "C". Symbols like
    // accidentals can fit inside this whitespace. These inset
    // functions are used to get the size of the inner dimensions
    // for this area on all arpeggios.
    //

    static insetTop(item: Arpeggio, c: Chord): number {
        let top = c.upNote().y() - c.upNote().height() / 2

        // use wiggle width, not height, since it's rotated 90 degrees
        if (item.arpeggioType() === ArpeggioType.UP) {
            top += item.symBbox(SymId.wiggleArpeggiatoUpArrow).width()
        } else if (item.arpeggioType() === ArpeggioType.UP_STRAIGHT) {
            top += item.symBbox(SymId.arrowheadBlackUp).width()
        }

        return top
    }

    static insetBottom(item: Arpeggio, c: Chord): number {
        let bottom = c.downNote().y() + c.downNote().height() / 2

        // use wiggle width, not height, since it's rotated 90 degrees
        if (item.arpeggioType() === ArpeggioType.DOWN) {
            bottom -= item.symBbox(SymId.wiggleArpeggiatoUpArrow).width()
        } else if (item.arpeggioType() === ArpeggioType.DOWN_STRAIGHT) {
            bottom -= item.symBbox(SymId.arrowheadBlackDown).width()
        }

        return bottom
    }

    static insetWidth(item: Arpeggio): number {
        const lineWidth = item.style().styleMM(item.isChordBracket() ? Sid.chordBracketLineWidth : Sid.arpeggioLineWidth)

        switch (item.arpeggioType()) {
        case ArpeggioType.NORMAL:
            return 0.0
        case ArpeggioType.UP:
        case ArpeggioType.DOWN:
            // use wiggle height, not width, since it's rotated 90 degrees
            return (item.width() - item.symBbox(SymId.wiggleArpeggiatoUp).height()) / 2
        case ArpeggioType.UP_STRAIGHT:
        case ArpeggioType.DOWN_STRAIGHT:
            return (item.width() - lineWidth) / 2
        case ArpeggioType.BRACKET:
            return item.width() - lineWidth / 2
        }
        return 0.0
    }

    /**
     * This function finds collisions with accidentals outside of an arpeggio's span
     * Assumptions are made to deal with cross staff height, as we don't know this yet.
     * Once a chord is found, its shape is stripped down to only accidentals which collide
     * with the arpeggio.  The arpeggio's offset is calculated from the remaining shape
     */
    static clearAccidentals(item: Arpeggio | null, ctx: LayoutContext): void {
        if (!item || !item.chord()) {
            return
        }

        const seg = item.chord()!.segment()!
        const endEl = seg.element(item.endTrack())
        const endChord = endEl && endEl.isChord() ? endEl as Chord : item.chord()!
        const part = item.part()!
        const partStartTrack = part.startTrack()
        const partEndTrack = part.endTrack()
        const table = paddingTable(item.score())
        const arpeggioAccidentalDistance = table.at(ElementType.ARPEGGIO, ElementType.ACCIDENTAL) * item.mag()
        const arpeggioLedgerDistance = table.at(ElementType.ARPEGGIO, ElementType.LEDGER_LINE) * item.mag()

        const arpShape = item.shape().translate(item.pagePos())
        const arpX = arpShape.right()

        let largestOverlap = 0.0

        for (let track = partStartTrack; track < partEndTrack; ++track) {
            const e = seg.element(track)
            if (!e || !e.isChord()) {
                continue
            }

            const chord = e as Chord

            // Only check chords the arpeggio doesn't span on staves the arpeggios span
            // We already calculated the gap between chords it does span in ChordLayout::layoutPitched
            const aboveStart = pairLess(chord.vStaffIdx(), chord.downLine(), item.vStaffIdx(), item.chord()!.upLine())
            const belowEnd = pairLess(endChord.vStaffIdx(), endChord.downLine(), chord.vStaffIdx(), chord.upLine())

            if ((chord.spanArpeggio() === item && !(aboveStart || belowEnd)) || chord.vStaffIdx() < item.vStaffIdx()
                || chord.vStaffIdx() > endChord.vStaffIdx()) {
                continue
            }

            // We don't know the distance between staves, so our arpeggio's height is currently unknown if it spans staves
            // To make sure we spot collisions with non-arpeggio accidentals, extend arpeggio upwards/downwards a large amount
            // depending on if they are the end/start of the arpeggio respectively.
            // This is to find collisions between chords outside the arpeggios track span, but within its "visual span"
            const curArpShape = arpShape.clone()
            const staffIdx = chord.vStaffIdx()
            if (staffIdx === item.chord()!.vStaffIdx() && item.crossStaff()) {
                // Arpeggio doesn't end on this staff, so extend downwards
                const bb = curArpShape.bbox()
                curArpShape.addBBox(new RectF(bb.bottomLeft().x(), bb.bottomLeft().y(), bb.width(), ARBITRARY_ARPEGGIO_LENGTH))
            } else if (staffIdx === endChord.vStaffIdx() && item.crossStaff()) {
                // Arpeggio doesn't start on this staff so move to last note and extend upwards
                curArpShape.translate(new PointF(0.0, endChord.downNote().pagePos().y() - item.pagePos().y()))
                const bb = curArpShape.bbox()
                curArpShape.addBBox(new RectF(bb.topLeft().x(), bb.topLeft().y() - ARBITRARY_ARPEGGIO_LENGTH, bb.width(),
                    ARBITRARY_ARPEGGIO_LENGTH))
            }

            const chordShape = chord.shape().clone()
            chordShape.translate(chord.pagePos())

            // Remove any element which isn't an accidental the arpeggio intersects
            chordShape.remove_if((shapeElement) => {
                const it = shapeElement.item()
                if (!it || !(it.isAccidental() || it.isLedgerLine())) {
                    return true
                }

                if (it.isAccidental()) {
                    // Pad accidentals with Sid::arpeggioAccidentalDistance either side
                    shapeElement.setTopLeft(new PointF(shapeElement.topLeft().x() - arpeggioAccidentalDistance, shapeElement.topLeft().y()))
                    shapeElement.setWidth(shapeElement.width() + 2 * arpeggioAccidentalDistance)
                } else if (it.isLedgerLine()) {
                    shapeElement.setTopLeft(new PointF(shapeElement.topLeft().x() - arpeggioLedgerDistance, shapeElement.topLeft().y()))
                    shapeElement.setWidth(shapeElement.width() + 2 * arpeggioLedgerDistance)
                }

                return !curArpShape.intersects(shapeElement)
            })

            if (chordShape.empty()) {
                // No collisions with accidentals
                continue
            }

            const chordX = -chordShape.left()
            const diff = chordX - arpX

            if (!RealIsNull(diff)) {
                const inset = ArpeggioLayout.insetDistance(item, ctx, item.mag(), chord)
                largestOverlap = Math.min(largestOverlap, diff + inset)
            }
        }

        if (!RealIsNull(largestOverlap)) {
            item.mutldata().moveX(largestOverlap)
        }
    }

    static insetDistance(item: Arpeggio | null, ctx: LayoutContext, mag_: number, chord: Chord | null,
        accidentals: readonly Accidental[] | null = null): number {
        if (!item || !chord) {
            return 0.0
        }

        if (!accidentals) {
            // generate list of accidentals if none provided
            const _accidentals: Accidental[] = []
            for (const note of chord.notes()) {
                const accidental = note.accidental()
                if (accidental && accidental.visible()) {
                    _accidentals.push(accidental)
                }
            }
            accidentals = _accidentals
        }

        if (accidentals.length === 0) {
            return 0.0
        }

        // Only be concerned about the top/bottom of an arpeggio line if this is the start/end chord
        const seg = item.chord()!.segment()!
        let endChord = item.chord()!
        const table = paddingTable(item.score())
        const e = seg.element(item.endTrack())
        if (e) {
            endChord = e.isChord() ? e as Chord : endChord
        }

        const arpStartStave = chord.vStaffIdx() === item.vStaffIdx()
        const arpEndStave = chord.vStaffIdx() === endChord.vStaffIdx()

        const arpeggioTop = arpStartStave ? ArpeggioLayout.insetTop(item, item.chord()!) * mag_ : -ARBITRARY_ARPEGGIO_LENGTH
        const arpeggioBottom = arpEndStave ? ArpeggioLayout.insetBottom(item, endChord) * mag_ : ARBITRARY_ARPEGGIO_LENGTH

        const type = item.arpeggioType()
        const hasTopArrow = type === ArpeggioType.UP
                            || type === ArpeggioType.UP_STRAIGHT
                            || type === ArpeggioType.BRACKET
        const hasBottomArrow = type === ArpeggioType.DOWN
                               || type === ArpeggioType.DOWN_STRAIGHT
                               || type === ArpeggioType.BRACKET

        let furthestAccidental: Accidental | null = null
        for (const accidental of accidentals) {
            if (furthestAccidental) {
                const currentIsFurtherX = accidental.x() < furthestAccidental.x()
                const currentIsSameX = accidental.x() === furthestAccidental.x()
                const accidentalBbox = item.symBbox(accidental.symId())
                const currentTop = accidental.note()!.pos().y() + accidentalBbox.top() * mag_
                const currentBottom = accidental.note()!.pos().y() + accidentalBbox.bottom() * mag_
                const collidesWithTop = currentTop <= arpeggioTop && hasTopArrow
                const collidesWithBottom = currentBottom >= arpeggioBottom && hasBottomArrow

                if (currentIsFurtherX || (currentIsSameX && (collidesWithTop || collidesWithBottom))) {
                    furthestAccidental = accidental
                }
            } else {
                furthestAccidental = accidental
            }
        }

        if (!furthestAccidental) {
            return 0.0
        }

        const maximumInset = (table.at(ElementType.ARPEGGIO, ElementType.ACCIDENTAL)
                              - ctx.conf().styleMM(Sid.arpeggioAccidentalDistanceMin)) * mag_

        const bbox = item.symBbox(furthestAccidental.symId())
        const center = furthestAccidental.note()!.pos().y() * mag_
        const top = center + bbox.top() * mag_
        const bottom = center + bbox.bottom() * mag_
        const collidesWithTop = hasTopArrow && top <= arpeggioTop
        const collidesWithBottom = hasBottomArrow && bottom >= arpeggioBottom

        if (collidesWithTop || collidesWithBottom) {
            return maximumInset
        }

        return ArpeggioLayout.insetWidth(item)
    }

    static computeHeight(item: Arpeggio): number {
        const chord = item.chord()!
        const y = chord.upNote().pagePos().y() - chord.upNote().headHeight() * 0.5

        let downNote = chord.downNote()
        const e = chord.segment()!.element(item.track() + item.span() - 1)
        if (e && e.isChord()) {
            downNote = (e as Chord).downNote()
        }
        const h = downNote.pagePos().y() + downNote.headHeight() * 0.5 - y
        return h
    }

    static calcTop(item: Arpeggio, ctx: LayoutContext): number {
        const top = -item.userLen1()
        switch (item.arpeggioType()) {
        case ArpeggioType.BRACKET: {
            const lineWidth = ctx.conf().styleMM(item.isChordBracket() ? Sid.chordBracketLineWidth : Sid.arpeggioLineWidth)
            return top - lineWidth / 2.0
        }
        case ArpeggioType.NORMAL:
        case ArpeggioType.UP:
        case ArpeggioType.DOWN: {
            // if the top is in the staff on a space, move it up
            // if the bottom note is on a line, the distance is 0.25 spaces
            // if the bottom note is on a space, the distance is 0.5 spaces
            const topNoteLine = item.chord()!.upNote().line()
            const lines = item.staff()!.lines(item.tick())
            const bottomLine = (lines - 1) * 2
            if (topNoteLine <= 0 || topNoteLine % 2 === 0 || topNoteLine >= bottomLine) {
                return top
            }
            const downNoteLine = item.chord()!.downNote().line()
            if (downNoteLine % 2 === 1 && downNoteLine < bottomLine) {
                return top - 0.4 * item.spatium()
            }
            return top - 0.25 * item.spatium()
        }
        default:
            return top - item.spatium() / 4
        }
    }

    static calcBottom(item: Arpeggio, arpeggioHeight: number, ctx: LayoutContext): number {
        const top = -item.userLen1()
        const bottom = arpeggioHeight + item.userLen2()

        switch (item.arpeggioType()) {
        case ArpeggioType.BRACKET: {
            const lineWidth = ctx.conf().styleMM(item.isChordBracket() ? Sid.chordBracketLineWidth : Sid.arpeggioLineWidth)
            return bottom - top + lineWidth
        }
        case ArpeggioType.NORMAL:
        case ArpeggioType.UP:
        case ArpeggioType.DOWN:
            return bottom
        default:
            return bottom - top + item.spatium() / 2
        }
    }
}
