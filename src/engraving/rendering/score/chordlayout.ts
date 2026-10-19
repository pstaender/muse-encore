/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/chordlayout.h/.cpp
 *
 * TODO(port): fingerings, chord lines, generated parentheses,
 * glissandi/guitar bends/note lines, ornament cue notes
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { RealIsEqualOrLess, RealIsEqualOrMore, RealIsNull, stdRound } from '../../../framework/global/realfn'
import { BeamMode, DirectionH, DirectionV, DurationType, ElementType, track2voice, NoteHeadType, VOICES, staff2track,
    NoteHeadGroup, type staff_idx_t, type track_idx_t } from '../../types/types'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { SymId } from '../../types/symid'
import { Spatium } from '../../types/dimension'
import { Factory } from '../../dom/factory'
import { toDurationList } from '../../dom/durationtype'
import { ArticulationAnchor } from '../../dom/articulation'
import { CrossMeasure, NoteType } from '../../dom/chordrest'
import { SegmentType, type Segment } from '../../dom/segment'
import type { Articulation as ArticulationT } from '../../dom/articulation'
import type { Beam } from '../../dom/beam'
import type { BeamSegment } from '../../dom/beambase'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Accidental } from '../../dom/accidental'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { NoteDot } from '../../dom/notedot'
import { prevChordRest, type Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import type { Note } from '../../dom/note'
import type { Rest } from '../../dom/rest'
import type { Slur } from '../../dom/slur'
import type { Staff } from '../../dom/staff'
import type { System } from '../../dom/system'
import { Grip } from '../../editing/editdata'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { StemLayout } from './stemlayout'
import { AccidentalsLayout } from './accidentalslayout'
import { SlurTieLayout } from './slurtielayout'
import { RestLayout } from './restlayout'
import { BeamLayout, ChordBeamAnchorType } from './beamlayout'
import { Autoplace } from './autoplace'
import { SystemLayout } from './systemlayout'
import { TabDurationSymbol } from '../../dom/tabdurationsymbol'
import { TablatureSymbolRepeat } from '../../dom/stafftype'
import type { Ornament } from '../../dom/ornament'
import { ArpeggioLayout } from './arpeggiolayout'
import { paddingTable } from '../paddingtable'
import { TremoloLayout } from './tremololayout'
import type { MeasureRepeat } from '../../dom/measurerepeat'

export class ChordPosInfo {
    chords: Chord[] = []
    upStemNotes: Note[] = []
    downStemNotes: Note[] = []
    upVoices = 0
    downVoices = 0
    maxUpWidth = 0.0
    maxDownWidth = 0.0
    maxUpMag = 0.0
    maxDownMag = 0.0

    // dots and hooks can affect layout of notes as well as vice versa
    upDots = 0
    downDots = 0
    upHooks = false
    downHooks = false

    // also check for grace notes
    upGrace = false
    downGrace = false
}

export class OffsetInfo {
    upOffset = 0.0 // offset to apply to upstem chords
    downOffset = 0.0 // offset to apply to downstem chords
    dotAdjust = 0.0 // additional chord offset to account for dots
    dotAdjustThreshold = 0.0 // if it exceeds this amount

    // centering adjustments for whole note, breve, and small chords
    centerUp = 0.0 // offset to apply in order to center upstem chords
    oversizeUp = 0.0 // adjustment to oversized upstem chord needed if laid out to the right
    centerDown = 0.0 // offset to apply in order to center downstem chords
    centerAdjustUp = 0.0 // adjustment to upstem chord needed after centering donwstem chord
    centerAdjustDown = 0.0 // adjustment to downstem chord needed after centering upstem chord

    tracksToAdjust = new Set<track_idx_t>()
}

const STAFFTYPE_TAB_DEFAULTDOTDIST_X = 0.75

const layoutDot = (dot: NoteDot): void => TLayout.layoutNoteDot(dot)

const byStringOrLineDesc = (n1: Note, n2: Note): number => n2.stringOrLine() - n1.stringOrLine()

function layoutSegmentElements(segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t, staffIdx: staff_idx_t,
                               ctx: LayoutContext): void {
    for (let track = startTrack; track < endTrack; ++track) {
        const e = segment.element(track)
        if (e) {
            if (e.vStaffIdx() === staffIdx) {
                TLayout.layoutItem(e, ctx)
            }
        }
    }
}

export class ChordLayout {
    static layout(item: Chord, ctx: LayoutContext): void {
        if (item.notes().length === 0) {
            return
        }
        let gi = 0
        for (const c of item.graceNotes()) {
            // HACK: graceIndex is not well-maintained on add & remove
            // so rebuild now
            c.setGraceIndex(gi++)
        }
        if (item.onTabStaff()) {
            ChordLayout.layoutTablature(item, ctx)
        } else {
            ChordLayout.layoutPitched(item, ctx)
        }
    }

    static layoutPitched(item: Chord, ctx: LayoutContext): void {
        for (const c of item.graceNotes()) {
            ChordLayout.layoutPitched(c, ctx)
        }

        item.setTabDur(null) // no TAB? no duration symbol! (may happen when converting a TAB into PITCHED)

        const mag_ = item.staff() ? item.staff()!.staffMag(item) : 1.0 // palette elements do not have a staff
        const dotNoteDistance = ctx.conf().styleMM(Sid.dotNoteDistance) * mag_

        const chordX = (item.noteType() === NoteType.NORMAL) ? item.ldata().pos().x() : 0.0

        let lll = 0.0 // space to leave at left of chord
        let rrr = 0.0 // space to leave at right of chord
        const upnote = item.upNote()
        const downnote = item.downNote()
        let leftNote: Note | null = null

        // Keeps track if there are any accidentals in this chord.
        // Used to remove excess space in front of arpeggios.
        // See GitHub issue #8970 for more details.
        // https://github.com/musescore/MuseScore/issues/8970
        const chordAccidentals: Accidental[] = []

        for (const note of item.notes()) {
            TLayout.layoutNote(note, ctx)

            const x1 = note.pos().x() + chordX
            const x2 = x1 + note.headWidth()
            lll = Math.max(lll, -x1)
            rrr = Math.max(rrr, x2)
            if (!leftNote || note.x() < leftNote.x()) {
                leftNote = note
            }

            const accidental = note.accidental()
            if (accidental && accidental.visible()) {
                chordAccidentals.push(accidental)
            }
            if (accidental && accidental.addToSkyline() && !note.fixed()) {
                // convert x position of accidental to segment coordinate system
                let x = accidental.pos().x() + note.pos().x() + chordX
                // distance from accidental to note already taken into account
                // but here perhaps we create more padding in *front* of accidental?
                x -= ctx.conf().styleMM(Sid.accidentalDistance) * mag_
                lll = Math.max(lll, -x)
            }
            // TODO(port): fingerings
        }

        // A chord can have its own arpeggio and also be part of another arpeggio's span.  We need to lay out both of these arpeggios properly
        const oldSpanArp = item.spanArpeggio() as Arpeggio | null
        let newSpanArp: Arpeggio | null = null

        // If item has an arpeggio: mark chords which are part of the arpeggio
        const itemArp = item.arpeggio() as Arpeggio | null
        if (itemArp) {
            itemArp.findAndAttachToChords()
            itemArp.mutldata().maxChordPad = 0.0
            itemArp.mutldata().minChordX = Number.MAX_VALUE
            TLayout.layoutItem(itemArp, ctx)
        }

        if (item.spanArpeggio() !== oldSpanArp) {
            newSpanArp = item.spanArpeggio() as Arpeggio | null
        }
        // If item is within arpeggio span, keep track of largest space needed between glissando and chord across staves
        let lllMax = lll
        for (const spanArp of [oldSpanArp, newSpanArp]) {
            if (!spanArp || !spanArp.chord()) {
                continue
            }

            const arpldata = spanArp.mutldata()

            const seg = spanArp.chord()!.segment()!
            const endItem = seg.element(spanArp.endTrack())
            let endChord: Chord = item
            if (endItem && endItem.isChord()) {
                endChord = endItem as Chord
            }

            // If a note is covered in the voice span but located outside the visual span of the arpeggio calculate accidental offset later
            const pairLess = (a1: number, a2: number, b1: number, b2: number): boolean => a1 < b1 || (a1 === b1 && a2 < b2)
            const aboveStart = pairLess(item.vStaffIdx(), item.downLine(), spanArp.vStaffIdx(), spanArp.chord()!.upLine())
            const belowEnd = pairLess(endChord.vStaffIdx(), endChord.downLine(), item.vStaffIdx(), item.upLine())

            if (!(aboveStart || belowEnd)) {
                const elType = spanArp.type()
                const table = paddingTable(item.score())
                const arpeggioNoteDistance = table.at(elType, ElementType.NOTE) * mag_
                const arpeggioLedgerDistance = table.at(elType, ElementType.LEDGER_LINE) * mag_
                const firstLedgerBelow = item.staff()!.lines(item.downNote().tick()) * 2 - 1
                const firstLedgerAbove = -1

                let gapSize = arpeggioNoteDistance

                if (leftNote && RealIsNull(leftNote.x())) {
                    if (downnote.line() > firstLedgerBelow || upnote.line() < firstLedgerAbove) {
                        gapSize = arpeggioLedgerDistance + ctx.conf().styleS(Sid.ledgerLineLength).val() * item.spatium()
                    }
                } else if (leftNote && (leftNote.line() > firstLedgerBelow || leftNote.line() < firstLedgerAbove)) {
                    gapSize = arpeggioLedgerDistance + ctx.conf().styleS(Sid.ledgerLineLength).val() * item.spatium()
                }

                const arpChordX = Math.min(chordX, 0.0)

                if (chordAccidentals.length) {
                    const arpeggioAccidentalDistance = table.at(elType, ElementType.ACCIDENTAL) * mag_
                    const accidentalDistance = ctx.conf().styleMM(Sid.accidentalDistance) * mag_
                    gapSize = arpeggioAccidentalDistance - accidentalDistance
                    gapSize -= ArpeggioLayout.insetDistance(spanArp, ctx, mag_, item, chordAccidentals)
                }

                const extraX = spanArp.width() + gapSize

                // Track leftmost chord position, as we we always want the arpeggio to be to the left of this
                arpldata.minChordX = Math.min(arpldata.minChordX, arpChordX)

                // Save this to arpeggio if largest
                arpldata.maxChordPad = Math.max(arpldata.maxChordPad, lll + extraX)

                // If first chord in arpeggio set y
                if (itemArp && itemArp === spanArp) {
                    const y1 = upnote.pos().y() - upnote.headHeight() * 0.5
                    itemArp.mutldata().setPosY(y1)
                }

                const endDownNote = endChord.downNote()

                // If last chord in arpeggio, set x
                if (endDownNote.track() === item.track()) {
                    // Amount to move arpeggio from it's parent chord to factor in chords further to the left
                    const firstChordX = spanArp.chord()!.ldata().pos().x()
                    const xDiff = firstChordX - arpldata.minChordX

                    const offset = -(xDiff + arpldata.maxChordPad)
                    spanArp.mutldata().setPosX(offset)
                    if (spanArp.visible()) {
                        lllMax = Math.max(lllMax, offset)
                    }
                }
            }
        }

        lll = lllMax

        if (item.dots()) {
            let x = item.dotPosX() + dotNoteDistance
                    + (item.dots() - 1) * ctx.conf().styleMM(Sid.dotDotDistance) * mag_
            x += item.symWidth(SymId.augmentationDot)
            rrr = Math.max(rrr, x)
        }

        const hook = item.hook()
        if (hook) {
            if (item.beam()) {
                item.remove(hook)
            } else {
                TLayout.layoutHook(hook, ctx)
                if (item.up() && item.stem()) {
                    // hook position is not set yet
                    const x = hook.ldata().bbox().right() + item.stem()!.flagPosition().x() + chordX
                    rrr = Math.max(rrr, x)
                }
            }
        }

        item.setSpaceLw(lll)
        item.setSpaceRw(rrr)

        for (const note of item.notes()) {
            ChordLayout.layoutNote2(note, ctx)
        }

        for (const e of item.el()) {
            if (e.isSlur() || e.isChordBracket()) { // we cannot at this time as chordpositions are not fixed
                continue
            }
            TLayout.layoutItem(e, ctx)
            // TODO(port): chord lines
        }

        ChordLayout.layoutLvArticulation(item, ctx)

        ChordLayout.fillShape(item, ctx)
    }

    static layoutTablature(item: Chord, ctx: LayoutContext): void {
        const _spatium = item.spatium()
        const mag_ = item.staff() ? item.staff()!.staffMag(item) : 1.0 // palette elements do not have a staff
        const dotNoteDistance = ctx.conf().styleMM(Sid.dotNoteDistance) * mag_
        const minNoteDistance = ctx.conf().styleMM(Sid.minNoteDistance) * mag_
        const minTieLength = ctx.conf().styleMM(Sid.minTieLength) * mag_

        for (const c of item.graceNotes()) {
            ChordLayout.layoutTablature(c, ctx)
        }

        let lll = 0.0 // space to leave at left of chord
        let rrr = 0.0 // space to leave at right of chord
        let headWidth = item.symWidth(SymId.noteheadBlack)
        const st = item.staff()!
        const tab = st.staffTypeForElement(item)
        const lineDist = tab.lineDistance().val() * _spatium
        const stemX = 0.5 * headWidth
        let ledgerLines = 0
        let llY = 0.0

        const numOfNotes = item.notes().length
        let minY = 1000.0 // just a very large value
        for (let i = 0; i < numOfNotes; ++i) {
            const note = item.notes()[i]
            note.updateFrettingForTiesAndBends()
            note.setDotRelativeLine(0, layoutDot)
            TLayout.layoutNote(note, ctx)
            // set headWidth to max fret text width
            const fretWidth = note.ldata().bbox().width()
            if (headWidth < fretWidth) {
                headWidth = fretWidth
            }
            // centre fret string on stem
            const x = stemX - fretWidth * 0.5
            const y = note.fixed() ? note.line() * lineDist / 2 : tab.physStringToYOffset(note.string()) * _spatium
            note.setPos(x, y)
            if (y < minY) {
                minY = y
            }
            const currLedgerLines = tab.numOfTabLedgerLines(note.string())
            if (currLedgerLines > ledgerLines) {
                ledgerLines = currLedgerLines
                llY = y
            }

            // allow extra space for shortened ties; this code must be kept synchronized
            // with the tie positioning code in Tie::slurPos()
            // but the allocation of space needs to be performed here
            const tie = note.tieBack()
            if (tie && tie.addToSkyline()) {
                SlurTieLayout.calculateDirection(tie)
                let overlap = 0.0 // how much tie can overlap start and end notes
                let shortStart = false // whether tie should clear start note or not
                const startNote = tie.startNote()
                const startChord = startNote ? startNote.chord() : null
                if (startChord && startChord.measure() === item.measure() && startChord === prevChordRest(item)) {
                    const startNoteWidth = startNote!.width()
                    // overlap into start chord?
                    // if in start chord, there are several notes or stem and tie in same direction
                    if (startChord.notes().length > 1 || (startChord.stem() && startChord.up() === tie.up())) {
                        // clear start note (1/8 of fret mark width)
                        shortStart = true
                        overlap -= startNoteWidth * 0.125
                    } else { // overlap start note (by ca. 1/3 of fret mark width)
                        overlap += startNoteWidth * 0.35
                    }
                    // overlap into end chord (this)?
                    // if several notes or neither stem or tie are up
                    if (item.notes().length > 1 || (item.stem() && !item.up() && !tie.up())) {
                        // for positive offset:
                        //    use available space
                        // for negative x offset:
                        //    space is allocated elsewhere, so don't re-allocate here
                        if (!RealIsNull(note.ldata().pos().x())) { // this probably does not work for TAB, as
                            overlap += Math.abs(note.ldata().pos().x()) // _pos is used to centre the fret on the stem
                        } else {
                            overlap -= fretWidth * 0.125
                        }
                    } else {
                        if (shortStart) {
                            overlap += fretWidth * 0.15
                        } else {
                            overlap += fretWidth * 0.35
                        }
                    }
                    const d = Math.max(minTieLength - overlap, 0.0)
                    lll = Math.max(lll, d)
                }
            }
        }

        // create ledger lines, if required (in some historic styles)
        if (ledgerLines > 0) {
            item.resizeLedgerLinesTo(ledgerLines)
            const extraLen = 0
            const llX = stemX - (headWidth + extraLen) * 0.5
            for (let i = 0; i < ledgerLines; i++) {
                const ldgLin = item.ledgerLines()[i]
                ldgLin.setParent(item)
                ldgLin.setTrack(item.track())
                ldgLin.setVisible(item.visible())
                ldgLin.setLen(headWidth + extraLen)
                ldgLin.setPos(llX, llY)
                TLayout.layoutLedgerLine(ldgLin, ctx)
                llY += lineDist / ledgerLines
            }
            headWidth += extraLen // include ledger lines extra width in chord width
        }

        // horiz. spacing: leave half width at each side of the (potential) stem
        const halfHeadWidth = headWidth * 0.5
        if (lll < stemX - halfHeadWidth) {
            lll = stemX - halfHeadWidth
        }
        if (rrr < stemX + halfHeadWidth) {
            rrr = stemX + halfHeadWidth
        }
        // align dots to the widest fret mark (not needed in all TAB styles, but harmless anyway)
        item.setDotPosX(headWidth)

        if (item.shouldHaveStem()) {
            // if stem is required but missing, add it;
            // set stem position (stem length is set in Chord:layoutStem() )
            if (!item.stem()) {
                item.createStem()
            }
            item.stem()!.setPos(StemLayout.tabStemPos(item, tab).times(_spatium))
            const hook = item.hook()
            if (hook) {
                if (item.beam()) {
                    ctx.mutDom().undoRemoveElement(hook)
                } else {
                    if (rrr < stemX + hook.width()) {
                        rrr = stemX + hook.width()
                    }

                    hook.setPos(item.stem()!.flagPosition())
                }
            }
        } else {
            if (item.stem()) {
                ctx.mutDom().doUndoRemoveElement(item.stem()!)
                item.remove(item.stem()!)
            }
            if (item.hook()) {
                ctx.mutDom().doUndoRemoveElement(item.hook()!)
                item.remove(item.hook()!)
            }
            if (item.beam()) {
                ctx.mutDom().doUndoRemoveElement(item.beam()!)
                item.remove(item.beam()!)
            }
        }

        if (!tab.genDurations() // if tab is not set for duration symbols
            || track2voice(item.track()) // or not in first voice
            || (item.isGrace() // no tab duration symbols if grace notes
                && item.beamMode() === BeamMode.AUTO)) { // and beammode == AUTO
            item.setTabDur(null) // delete an existing duration symbol
        } else {
            //
            // tab duration symbols
            //
            // if no previous CR
            // OR symbol repeat set to ALWAYS
            // OR symbol repeat condition is triggered
            // OR duration type and/or number of dots is different from current CR
            // OR chord beam mode not AUTO
            // OR previous CR is a rest
            // AND no not-stem
            // set a duration symbol (trying to re-use existing symbols where existing to minimize
            // symbol creation and deletion)
            let needTabDur = false
            let repeat = false
            if (!item.noStem()) {
                // check duration of prev. CR segm
                const prevCR = prevChordRest(item)
                if (!prevCR) {
                    needTabDur = true
                } else if (item.beamMode() !== BeamMode.AUTO
                           || prevCR.durationType().type() !== item.durationType().type()
                           || prevCR.dots() !== item.dots()
                           || prevCR.tuplet() !== item.tuplet()
                           || prevCR.isRest()) {
                    needTabDur = true
                } else if (tab.symRepeat() === TablatureSymbolRepeat.ALWAYS
                           || ((tab.symRepeat() === TablatureSymbolRepeat.MEASURE
                                || tab.symRepeat() === TablatureSymbolRepeat.SYSTEM)
                               && item.measure() !== prevCR.measure())) {
                    needTabDur = true
                    repeat = true
                }
            }
            if (needTabDur) {
                // symbol needed; if not exist, create; if exists, update duration
                if (!item.tabDur()) {
                    item.setTabDur(new TabDurationSymbol(item, tab, item.durationType().type(), item.dots()))
                } else {
                    item.tabDur()!.setDuration(item.durationType().type(), item.dots(), tab)
                }
                const tabDur = item.tabDur()!
                tabDur.setParent(item)
                tabDur.setRepeat(repeat)
                TLayout.layoutTabDurationSymbol(tabDur)
                if (minY < 0) { // if some fret extends above tab body (like bass strings)
                    const tdladata = tabDur.mutldata()
                    tdladata.moveY(minY) // raise duration symbol
                    tdladata.setBbox(tdladata.bbox().translated(0, minY))
                }
            } else { // symbol not needed: if exists, delete
                item.setTabDur(null)
            }
        } // end of if(duration_symbols)

        const arpeggio = item.arpeggio() as Arpeggio | null
        if (arpeggio) {
            arpeggio.findAndAttachToChords()
            const upnote = item.upNote()
            const y = upnote.pos().y() - upnote.headHeight() * 0.5
            TLayout.layoutArpeggio(arpeggio, ctx)
            lll += arpeggio.width() + _spatium * 0.5
            arpeggio.setPos(-lll, y)

            // handle the special case of _arpeggio->span() > 1
            // in layoutArpeggio2() after page layout has done so we
            // know the y position of the next staves
        }

        // allocate enough room for glissandi
        if (item.endsNoteAnchoredLine()) {
            if (!item.rtick().isZero()) { // if not at beginning of measure
                lll += _spatium * 0.5 + minTieLength
            }
            // special case of system-initial glissando final note is handled in Glissando::layout() itself
        }

        if (item.hook()) {
            if (item.beam()) {
                ctx.mutDom().undoRemoveElement(item.hook()!)
            }
            // tab is never null here (C++ lays out the hook only when tab == 0)
        }

        if (item.dots()) {
            let x = 0.0
            // if stems are beside staff, dots are placed near to stem
            if (!tab.stemThrough()) {
                // if there is an unbeamed hook, dots should start after the hook
                if (item.hook() && !item.beam()) {
                    x = item.hook()!.width() + dotNoteDistance
                } else {
                    // if not, dots should start at a fixed distance right after the stem
                    x = STAFFTYPE_TAB_DEFAULTDOTDIST_X * _spatium
                }
                item.setDotPosX(x)
            } else {
                // if stems are through staff, use dot position computed above on fret mark widths
                x = item.dotPosX() + dotNoteDistance
                    + (item.dots() - 1) * ctx.conf().styleS(Sid.dotDotDistance).val() * _spatium
            }
            x += item.symWidth(SymId.augmentationDot)
            rrr = Math.max(rrr, x)
        }

        item.setSpaceLw(lll)
        item.setSpaceRw(rrr)

        const graceMag = ctx.conf().styleD(Sid.graceNoteMag)

        const graceNotesBefore = item.graceNotesBefore().chords()
        const nb = graceNotesBefore.length
        if (nb) {
            let xl = -(item.spaceLw() + minNoteDistance)
            for (let i = nb - 1; i >= 0; --i) {
                const c = graceNotesBefore[i]
                xl -= c.spaceRw()
                c.setPos(xl, 0)
                xl -= c.spaceLw() + minNoteDistance * graceMag
            }
            if (-xl > item.spaceLw()) {
                item.setSpaceLw(item.spaceLw() - xl)
            }
        }
        const gna = item.graceNotesAfter().chords()
        const na = gna.length
        if (na) {
            // get factor for start distance after main note. Values found by testing.
            let fc: number
            switch (item.durationType().type()) {
            case DurationType.V_LONG: fc = 3.8
                break
            case DurationType.V_BREVE: fc = 3.8
                break
            case DurationType.V_WHOLE: fc = 3.8
                break
            case DurationType.V_HALF: fc = 3.6
                break
            case DurationType.V_QUARTER: fc = 2.1
                break
            case DurationType.V_EIGHTH: fc = 1.4
                break
            case DurationType.V_16TH: fc = 1.2
                break
            default: fc = 1
            }
            let xr = fc * (item.spaceRw() + minNoteDistance)
            for (let i = 0; i <= na - 1; i++) {
                const c = gna[i]
                xr += c.spaceLw() * (i === 0 ? 1.3 : 1)
                c.setPos(xr, 0)
                xr += c.spaceRw() + minNoteDistance * graceMag
            }
            if (xr > item.spaceRw()) {
                item.setSpaceRw(xr)
            }
        }
        for (const e of item.el()) {
            TLayout.layoutItem(e, ctx)
            // TODO(port): chord lines
        }

        for (let i = 0; i < numOfNotes; ++i) {
            ChordLayout.layoutNote2(item.notes()[i], ctx)
        }

        if (item.stemSlash()) {
            TLayout.layoutStemSlash(item.stemSlash()!, ctx)
        }

        ChordLayout.layoutLvArticulation(item, ctx)

        // TODO(port): createParenGroups, ParenthesisLayout::layoutChordParentheses

        ChordLayout.fillShape(item, ctx)
    }

    static layoutLvArticulation(item: Chord, ctx: LayoutContext): void {
        for (const a of item.articulations()) {
            if (a.isLaissezVib()) {
                if (item.measure()!.hasVoicesInRange(a.staffIdx(), item.tick(), item.actualTicks()) && a.anchor() === ArticulationAnchor.AUTO) {
                    a.setUp(item.up()) // if there are voices place articulation at stem
                } else if (a.anchor() === ArticulationAnchor.AUTO) {
                    a.setUp(!item.up()) // place articulation at note head
                } else {
                    a.setUp(a.anchor() === ArticulationAnchor.TOP)
                }

                TLayout.layoutItem(a, ctx)

                const ldata = a.ldata()
                const sp = a.spatium()
                const up = a.up()
                const note = up ? item.upNote() : item.downNote()
                const upDir = up ? -1 : 1
                const noteHeight = note.height()

                const result = note.pos().plus(item.pos())
                const center = SlurTieLayout.noteOpticalCenterForTie(note, up)
                let visualInsetSp: number
                if (note.headGroup() === NoteHeadGroup.HEAD_SLASH || note.shouldHideFret()) {
                    visualInsetSp = 0.2
                } else if (item.up() && up) {
                    visualInsetSp = 0.7
                } else {
                    visualInsetSp = 0.1
                }
                const visualInset = visualInsetSp * sp

                result.setX(result.x() + center + visualInset - ldata.bbox().left())
                result.setY(result.y() + (noteHeight / 2 + 0.2 * sp) * upDir)

                a.setPos(result)
            }
        }
    }

    static layoutSpanners(item: Chord, ctx: LayoutContext): void {
        for (const n of item.notes()) {
            const tie = n.tieFor()
            if (tie) {
                TLayout.layoutTie(tie, ctx)
            }
            for (const sp of n.spannerBack()) {
                TLayout.layoutSpanner(sp, ctx)
            }
        }
    }

    static layoutArticulations(item: Chord, ctx: LayoutContext): void {
        for (const gc of item.graceNotes()) {
            ChordLayout.layoutArticulations(gc, ctx)
        }

        if (item.articulations().length === 0) {
            return
        }
        const st = item.staff()!
        const staffType = st.staffTypeForElement(item)
        const mag = (staffType.isSmall() ? ctx.conf().styleD(Sid.smallStaffMag) : 1.0) * staffType.userMag()
        const _spatium = ctx.conf().spatium() * mag
        const _lineDist = _spatium * staffType.lineDistance().val() / 2
        const minDist = ctx.conf().styleMM(Sid.articulationMinDistance) * mag
        const articulationHAlign = ctx.conf().styleV(Sid.articulationStemHAlign) as ArticulationStemSideAlign
        const keepArticsTogether = ctx.conf().styleB(Sid.articulationKeepTogether)
        const stemSideDistance = ctx.conf().styleMM(Sid.propertyDistanceStem) * mag
        const headSideDistance = ctx.conf().styleMM(Sid.propertyDistanceHead) * mag
        const tenutoAdditionalTieDistance = 0.6 * _spatium
        const staccatoAdditionalTieDistance = 0.4 * _spatium

        let numCloseArtics = 0
        let hasStaffArticsUp = false
        let hasStaffArticsDown = false
        if (keepArticsTogether) {
            // count articulations
            for (const a of item.articulations()) {
                if (!a.visible()) {
                    continue
                }
                if (a.layoutCloseToNote()) {
                    ++numCloseArtics
                } else {
                    if (a.up()) {
                        hasStaffArticsUp = true
                    } else {
                        hasStaffArticsDown = true
                    }
                    if (hasStaffArticsDown && hasStaffArticsUp) {
                        break // nothing more to be learned now
                    }
                }
            }
        }

        let prevVisibleArticulation: ArticulationT | null = null
        for (const a of item.articulations()) {
            if (item.measure()!.hasVoicesInRange(a.staffIdx(), item.tick(), item.actualTicks()) && a.anchor() === ArticulationAnchor.AUTO) {
                a.setUp(item.up()) // if there are voices place articulation at stem
            } else if (a.anchor() === ArticulationAnchor.AUTO) {
                if (a.isOrnament()) {
                    const oddVoice = item.track() % 2 !== 0
                    a.setUp(!oddVoice)
                } else if (a.symId() >= SymId.articMarcatoAbove && a.symId() <= SymId.articMarcatoTenutoBelow) {
                    a.setUp(true) // Gould, p. 117: strong accents above staff
                } else {
                    a.setUp(!item.up()) // place articulation at note head
                }
            } else {
                a.setUp(a.anchor() === ArticulationAnchor.TOP)
            }

            if (!a.layoutCloseToNote()) {
                continue
            }

            const bottom = !a.up() // true: articulation is below chord;  false: articulation is above chord
            TLayout.layoutItem(a, ctx) // must be done after assigning direction, or else symId is not reliable

            const leaveTieSpace = ChordLayout.leaveSpaceForTie(a)
            const headSide = bottom === item.up()
            let y = 0.0
            let x: number
            const stem = item.stem()
            if ((!headSide || !a.isBasicArticulation()) && stem) {
                switch (articulationHAlign) {
                case ArticulationStemSideAlign.STEM:
                    x = stem.width() * 0.5
                    break
                case ArticulationStemSideAlign.NOTEHEAD:
                    x = item.up() ? item.downNote().noteheadCenterX() : ChordLayout.centerX(item)
                    break
                case ArticulationStemSideAlign.AVERAGE:
                default:
                    x = item.up() ? (stem.width() * 0.5 + item.downNote().noteheadCenterX()) * 0.5
                        : (stem.width() * 0.5 + ChordLayout.centerX(item)) * 0.5
                    break
                }
                if (item.up()) {
                    x = item.downNote().pos().x() + item.downNote().bboxRightPos() - x
                }
            } else {
                x = ChordLayout.centerX(item)
            }
            if (bottom) {
                if (!headSide && stem) {
                    // Check if there's a hook, because the tip of the hook always extends slightly past the end of the stem
                    const stemBottom = stem.ldata().bbox().translated(stem.pos()).bottom()
                    const hook = item.hook()
                    if (hook) {
                        y = hook.ldata().bbox().translated(hook.pos()).bottom()
                    } else {
                        y = stem.ldata().bbox().translated(stem.pos()).bottom()
                    }
                    let line = stdRound((y + _lineDist) / _lineDist)
                    const lines = 2 * (staffType.lines() - 1)
                    if (line < lines && !(line % 2)) {
                        line += 1
                    }
                    const dist = (line * _lineDist) - stemBottom
                    const hasBeam = !!item.beam() || !!item.tremoloTwoChord()
                    if (line < lines && hasBeam && dist < stemSideDistance) {
                        // if beamed, ensure distance from stem end is at least stemSideDistance
                        line = Math.min(line + 2, lines)
                    }
                    if (line < lines) { // align between staff lines
                        y = line * _lineDist
                        y -= a.height() * 0.5
                    } else if (line === lines) {
                        y = stemSideDistance + (lines * _lineDist)
                    } else {
                        y += stemSideDistance
                    }
                } else {
                    x = ChordLayout.centerX(item)
                    const lines = (staffType.lines() - 1) * 2
                    let line = Math.max(item.downLine(), -1)
                    const adjustArtic = (a.up() && hasStaffArticsUp) || (!a.up() && hasStaffArticsDown)
                    if (keepArticsTogether && adjustArtic && numCloseArtics > 0) {
                        line = Math.max(line, lines - (1 + (numCloseArtics * 2)))
                    }
                    if (line < lines - 1) {
                        if (leaveTieSpace && line % 2) {
                            line += 1
                        }
                        y = ((line & ~1) + 3) * _lineDist
                        y -= a.height() * 0.5
                    } else {
                        y = item.downPos() + 0.5 * item.downNote().headHeight() + headSideDistance
                        if (leaveTieSpace) {
                            y += a.isStaccato() ? staccatoAdditionalTieDistance : tenutoAdditionalTieDistance
                        }
                    }
                }
                if (prevVisibleArticulation && (prevVisibleArticulation.up() === a.up())) {
                    const staffBottom = (staffType.lines() - 2) * 2
                    if ((headSide && item.downLine() < staffBottom)
                        || (!headSide && !RealIsEqualOrMore(y, (staffBottom + 1) * _lineDist))) {
                        y += _spatium
                    } else {
                        y += prevVisibleArticulation.height() + minDist
                    }
                }
            } else { // topside
                if (!headSide && stem) {
                    // Check if there's a hook, because the tip of the hook always extends slightly past the end of the stem
                    const stemTop = stem.ldata().bbox().translated(stem.pos()).top()
                    const hook = item.hook()
                    if (hook) {
                        y = hook.ldata().bbox().translated(hook.pos()).top()
                    } else {
                        y = stem.ldata().bbox().translated(stem.pos()).top()
                    }
                    let line = stdRound((y - _lineDist) / _lineDist)
                    if (line > 0 && !(line % 2)) {
                        line -= 1
                    }
                    const dist = stemTop - (line * _lineDist)
                    const hasBeam = !!item.beam() || !!item.tremoloTwoChord()
                    if (line > 0 && hasBeam && dist < stemSideDistance) {
                        // if beamed, ensure distance from stem end is at least stemSideDistance
                        line = Math.max(line - 2, 0)
                    }
                    if (line > 0) { // align between staff lines
                        y = line * _lineDist
                        y += a.height() * 0.5
                    } else if (line === 0) {
                        y = -stemSideDistance
                    } else {
                        y -= stemSideDistance
                    }
                } else {
                    x = ChordLayout.centerX(item)
                    const lines = (staffType.lines() - 1) * 2
                    let line = Math.min(item.upLine(), lines + 1)
                    const adjustArtic = (a.up() && hasStaffArticsUp) || (!a.up() && hasStaffArticsDown)
                    if (keepArticsTogether && adjustArtic && numCloseArtics > 0) {
                        line = Math.min(line, 1 + (numCloseArtics * 2))
                    }
                    if (line > 1) {
                        if (leaveTieSpace && line % 2) {
                            line -= 1
                        }
                        y = (((line + 1) & ~1) - 3) * _lineDist
                        y += a.height() * 0.5
                    } else {
                        y = item.upPos() - 0.5 * item.downNote().headHeight() - headSideDistance
                        if (leaveTieSpace) {
                            y -= a.isStaccato() ? staccatoAdditionalTieDistance : tenutoAdditionalTieDistance
                        }
                    }
                }
                if (prevVisibleArticulation && (prevVisibleArticulation.up() === a.up())) {
                    if ((headSide && item.upLine() > 2) || (!headSide && !RealIsEqualOrLess(y, 0.0))) {
                        y -= item.spatium()
                    } else {
                        y -= prevVisibleArticulation.height() + minDist
                    }
                }
            }
            x -= a.ldata().opticalCenter()
            a.setPos(x, y)
            if (a.visible()) {
                prevVisibleArticulation = a
            }
        }
    }

    // ---------------------------------------------------------
    //   layoutArticulations2
    //    Called after layouting systems
    //    Tentatively layout all articulations
    //    To be finished after laying out slurs
    // ---------------------------------------------------------

    static layoutArticulations2(item: Chord, ctx: LayoutContext, layoutOnCrossBeamSide = false): void {
        const articulationHAlign = ctx.conf().styleV(Sid.articulationStemHAlign) as ArticulationStemSideAlign
        for (const gc of item.graceNotes()) {
            ChordLayout.layoutArticulations2(gc, ctx)
        }

        if (item.articulations().length === 0) {
            return
        }
        const headSideX = ChordLayout.centerX(item)
        let stemSideX = headSideX
        const stem = item.stem()
        if (stem) {
            switch (articulationHAlign) {
            case ArticulationStemSideAlign.STEM:
                stemSideX = stem.width() * 0.5
                break
            case ArticulationStemSideAlign.NOTEHEAD:
                stemSideX = item.up() ? item.downNote().noteheadCenterX() : ChordLayout.centerX(item)
                break
            case ArticulationStemSideAlign.AVERAGE:
            default:
                stemSideX = item.up() ? (stem.width() * 0.5 + item.downNote().noteheadCenterX()) * 0.5
                    : (stem.width() * 0.5 + ChordLayout.centerX(item)) * 0.5
                break
            }
            if (item.up()) {
                stemSideX = item.downNote().pos().x() + item.downNote().bboxRightPos() - stemSideX
            }
        }

        const stacAccentKern = 0.2 * item.spatium()
        const mag = item.mag()
        const minDist = ctx.conf().styleMM(Sid.articulationMinDistance) * mag
        const staffDist = ctx.conf().styleMM(Sid.propertyDistance) * mag
        const stemDist = ctx.conf().styleMM(Sid.propertyDistanceStem) * mag
        const noteDist = ctx.conf().styleMM(Sid.propertyDistanceHead) * mag

        const yOffset = item.staffOffsetY()

        let chordTopY = item.upPos() - 0.5 * item.upNote().headHeight() + yOffset // note position of highest note
        let chordBotY = item.downPos() + 0.5 * item.upNote().headHeight() + yOffset // note position of lowest note

        let staffTopY = -staffDist + yOffset
        let staffBotY = item.staff()!.staffHeight(item.tick()) + staffDist + yOffset

        // avoid collisions of staff articulations with chord notes:
        // gap between note and staff articulation is distance0 + 0.5 spatium
        if (stem) {
            const hook = item.hook()
            if (item.up()) {
                const tip = hook
                    ? hook.ldata().bbox().translated(hook.pos()).top()
                    : stem.ldata().bbox().translated(stem.pos()).top()
                chordTopY = tip + yOffset
            } else {
                const tip = hook
                    ? hook.ldata().bbox().translated(hook.pos()).bottom()
                    : stem.ldata().bbox().translated(stem.pos()).bottom()
                chordBotY = tip + yOffset
            }
        }

        // with staff articulations, the y-position of chord articulations are adjusted to account for
        // the vertical position of the staff articulations
        chordTopY -= item.up() ? stemDist : noteDist
        chordBotY += item.up() ? noteDist : stemDist

        for (const a of item.articulations()) {
            const aa = a.anchor()
            if (a.layoutCloseToNote() && a.visible() && aa === ArticulationAnchor.AUTO) {
                if (a.up()) {
                    chordTopY = a.y() - a.height() - minDist + yOffset
                } else {
                    chordBotY = a.y() + a.height() + minDist + yOffset
                }
            }
        }

        // Avoid collisions of close articulations with the chord itself
        for (const a of item.articulations()) {
            if (layoutOnCrossBeamSide && !a.isOnCrossBeamSide()) {
                continue
            }
            if (!a.layoutCloseToNote()) {
                continue
            }
            if (a.up()) {
                if (a.visible()) {
                    chordTopY = a.y() - a.height() - minDist + yOffset
                }
            } else {
                if (a.visible()) {
                    chordBotY = a.y() + a.height() + minDist + yOffset
                }
            }
        }

        staffTopY = Math.min(staffTopY, chordTopY)
        staffBotY = Math.max(staffBotY, chordBotY)

        //
        // now place all articulations with staff top or bottom anchor
        //
        let stacc: ArticulationT | null = null
        for (const a of item.articulations()) {
            let kearnHeight = 0.0
            if ((layoutOnCrossBeamSide && !a.isOnCrossBeamSide()) || a.isLaissezVib()) {
                continue
            }
            if (a.isStaccato()) {
                stacc = a
            } else if (stacc && a.isAccent() && stacc.up() === a.up()
                       && (RealIsEqualOrLess(stacc.ldata().pos().y(), 0.0)
                           || RealIsEqualOrMore(stacc.ldata().pos().y(), item.staff()!.staffHeight(item.tick())))) {
                // adjust for staccato-accent kerning
                kearnHeight = stacAccentKern
                stacc = null
            } else {
                stacc = null
            }
            if (!a.layoutCloseToNote()) {
                TLayout.layoutItem(a, ctx)
                if (a.up()) {
                    a.setPos(!item.up() || !a.isBasicArticulation() ? headSideX : stemSideX, staffTopY + kearnHeight - yOffset)
                    if (a.visible()) {
                        staffTopY = a.y() - a.height() - minDist + yOffset
                    }
                } else {
                    a.setPos(item.up() || !a.isBasicArticulation() ? headSideX : stemSideX, staffBotY - kearnHeight - yOffset)
                    if (a.visible()) {
                        staffBotY = a.y() + a.height() + minDist + yOffset
                    }
                }
                a.mutldata().moveX(-a.ldata().opticalCenter())
            }
            if (!a.isOnCrossBeamSide()) {
                if (a.layoutCloseToNote()) {
                    const meas = a.measure()
                    const sys = meas ? meas.system() : null
                    if (sys) {
                        sys.staff(a.vStaffIdx())!.skyline().add(a.shape().translate(a.systemPos().plus(item.staffOffset())))
                    }
                } else {
                    Autoplace.autoplaceSegmentElement(a, a.mutldata(), a.up(), true)
                }
                if (a.addToSkyline()) {
                    a.segment()!.staffShape(a.vStaffIdx()).add(a.shape().translated(a.pos().plus(item.pos()).plus(item.staffOffset())))
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   layoutArticulations3
    //    Called after layouting slurs
    //    Fix up articulations that need to go outside the slur
    // ---------------------------------------------------------

    static layoutArticulations3(item: Chord, slur: Slur, ctx: LayoutContext): void {
        let ss
        if (item === slur.startCR()) {
            ss = slur.frontSegment()
        } else if (item === slur.endCR()) {
            ss = slur.backSegment()
        } else {
            return
        }
        if (!ss) {
            return
        }
        const s = item.segment()!
        const m = item.measure()!
        const itemStaff = m.system() ? m.system()!.staff(item.vStaffIdx()) : null
        const slurStaff = m.system() ? m.system()!.staff(ss.vStaffIdx()) : null
        const itemStaffPos = itemStaff ? new PointF(0.0, itemStaff.y()) : new PointF()
        const slurStaffPos = itemStaff && slurStaff ? new PointF(0.0, slurStaff.y()) : new PointF()
        const artics = item.articulations()
        for (let i = 0; i < artics.length; ++i) {
            const a = artics[i]
            if (a.layoutCloseToNote() || !a.autoplace() || !slur.addToSkyline()) {
                continue
            }
            const aShape = a.shape().translate(a.pos().plus(item.pos()).plus(s.pos()).plus(m.pos()).plus(item.staffOffset()).plus(itemStaffPos))
            const sShape = ss.shape().translate(ss.pos().plus(slurStaffPos))
            sShape.removeTypes(new Set([ElementType.HAMMER_ON_PULL_OFF_TEXT]))
            let minDist = ctx.conf().styleMM(Sid.articulationMinDistance)
            const slurBelowArticulation = a.up() && !(ss.vStaffIdx() < item.vStaffIdx())
            const vertClearance = slurBelowArticulation ? aShape.verticalClearance(sShape) : sShape.verticalClearance(aShape)
            if (vertClearance < minDist) {
                minDist += slur.up()
                    ? Math.max(aShape.minVerticalDistance(sShape), 0.0)
                    : Math.max(sShape.minVerticalDistance(aShape), 0.0)
                minDist *= slur.up() ? -1 : 1
                for (let j = i; j < artics.length; ++j) {
                    const aa = artics[j]
                    aa.mutldata().moveY(minDist)
                    if (itemStaff && aa.addToSkyline()) {
                        SystemLayout.updateSkylineForElement(aa, m.system()!, minDist)
                        for (const sh of s.staffShape(item.vStaffIdx()).elements()) {
                            if (sh.item() === aa) {
                                sh.translate(new PointF(0.0, minDist))
                            }
                        }
                    }
                }
            }
        }
    }

    static layoutStem(item: Chord, ctx: LayoutContext): void {
        const hook = item.hook()
        if (hook) {
            hook.setHookType(item.up() ? item.durationType().hooks() : -item.durationType().hooks())
            TLayout.layoutHook(hook, ctx)
        }

        // Stem needs to know hook's bbox and SMuFL anchors.
        // This is set in TLayout::layoutHook
        item.setDefaultStemLength(StemLayout.calcDefaultStemLength(item, ctx))

        const stem = item.stem()
        if (!stem) {
            return
        }

        stem.mutldata().setPosX(StemLayout.chordStemPosX(item))

        stem.setBaseLength(Spatium.fromMM(item.defaultStemLength(), item.spatium()))
        TLayout.layoutStem(stem, ctx)

        if (hook) {
            hook.setPos(stem.flagPosition())
        }

        // Stem slash
        const beam = item.beam()
        if (item.showStemSlash() && !(beam && beam.elements()[0] !== item)) {
            if (!item.stemSlash()) {
                item.add(Factory.createStemSlash(item))
            }
            TLayout.layoutStemSlash(item.stemSlash()!, ctx)
        } else if (item.stemSlash()) {
            item.remove(item.stemSlash()!)
        }
    }

    static computeUpBeamCase(item: Chord, beam: Beam): boolean {
        if (beam.cross()) {
            return item.isBelowCrossBeam(beam)
        } else if (beam.userModified()) {
            return ChordLayout.isChordPosBelowBeam(item, beam)
        }
        return beam.up()
    }

    // ---------------------------------------------------------
    //   updateLedgerLines
    // ---------------------------------------------------------

    static updateLedgerLines(item: Chord, ctx: LayoutContext): void {
        let track = 0 // the track lines belong to
        // the line pos corresponding to the bottom line of the staff
        let lineBelow = 8 // assuming 5-lined "staff"
        let lineDistance = 1
        let staffVisible = true
        let stepOffset = 0 // for staff type changes with a step offset

        const segment = item.segment()
        if (segment) { //not palette
            const tick = segment.tick()
            const idx = item.staffIdx() + item.staffMove()
            track = staff2track(idx)
            const st = ctx.dom().staff(idx)!
            lineBelow = (st.lines(tick) - 1) * 2
            lineDistance = st.lineDistance(tick)
            staffVisible = !st.isLinesInvisible(tick)
            stepOffset = st.staffType(tick).stepOffset()
        }

        // need ledger lines?
        if (item.downLine() + stepOffset <= lineBelow + 1 && item.upLine() + stepOffset >= -1) {
            item.resizeLedgerLinesTo(0)
            return
        }

        // the extra length of a ledger line to be added on each side of the notehead
        const extraLen = ctx.conf().styleMM(Sid.ledgerLineLength)
        let visible = false

        interface LedgerLineData {
            line: number
            minX: number
            maxX: number
            visible: boolean
            accidental: boolean
        }
        const ledgerLineData: LedgerLineData[] = []

        // scan chord notes, collecting visibility and x and y extrema
        // NOTE: notes are sorted from bottom to top (line no. decreasing)
        // notes are scanned twice from outside (bottom or top) toward the staff
        // each pass stops at the first note without ledger lines
        const n = item.notes().length
        for (const topToBottom of [false, true]) {
            const from = topToBottom ? n - 1 : 0
            const delta = topToBottom ? -1 : 1

            const vecLines: LedgerLineData[] = []
            let hw = 0.0
            let minX = Number.MAX_VALUE
            let maxX = Number.MIN_VALUE // C++ std::numeric_limits<double>::min()
            let minLine = 0
            let maxLine = lineBelow

            for (let i = from; i < n && i >= 0; i += delta) {
                const note = item.notes()[i]
                let l = note.line() + stepOffset

                // if 1st pass and note not below staff or 2nd pass and note not above staff
                if ((!topToBottom && l <= lineBelow + 1) || (topToBottom && l >= -1)) {
                    break // stop this pass
                }
                // round line number to even number toward 0
                if (l < 0) {
                    l = (l + 1) & ~1
                } else {
                    l = l & ~1
                }

                if (note.visible()) { // if one note is visible,
                    visible = true // all lines between it and the staff are visible
                }

                hw = Math.max(hw, note.headWidth())

                //
                // Experimental:
                //  shorten ledger line to avoid collisions with accidentals
                //
                // bboxXShift = 0 for normal noteheads but may be non-zero for slashes
                const x = note.pos().x() + note.bboxXShift()
                if (x - extraLen * note.mag() < minX) {
                    minX = x - extraLen * note.mag()
                    // 'draw' ledger lines from staff to note
                    for (const d of vecLines) {
                        if (!d.accidental && ((l < 0 && d.line >= l) || (l > 0 && d.line <= l))) {
                            d.minX = minX
                        }
                    }
                }
                if (x + hw + extraLen * note.mag() > maxX) {
                    maxX = x + hw + extraLen * note.mag()
                    for (const d of vecLines) {
                        if ((l < 0 && d.line >= l) || (l > 0 && d.line <= l)) {
                            d.maxX = maxX
                        }
                    }
                }

                if (l < minLine) {
                    for (let i1 = l; i1 < minLine; i1 += 2) {
                        vecLines.push({ line: i1, minX, maxX, visible, accidental: false })
                    }
                    minLine = l
                }
                if (l > maxLine) {
                    for (let i1 = maxLine + 2; i1 <= l; i1 += 2) {
                        vecLines.push({ line: i1, minX, maxX, visible, accidental: false })
                    }
                    maxLine = l
                }
            }
            if (minLine < 0 || maxLine > lineBelow) {
                ledgerLineData.push(...vecLines)
            }
        }

        const _spatium = item.spatium()
        const stepDistance = lineDistance * 0.5
        item.resizeLedgerLinesTo(ledgerLineData.length)

        // set up vector of ledger lines
        for (let i = 0; i < ledgerLineData.length; ++i) {
            const lld = ledgerLineData[i]
            const h = item.ledgerLines()[i]
            h.setParent(item)
            h.setTrack(track)
            h.setVisible(lld.visible && staffVisible)
            h.setLen(lld.maxX - lld.minX)
            h.setPos(lld.minX, lld.line * _spatium * stepDistance)
        }

        for (const ll of item.ledgerLines()) {
            TLayout.layoutLedgerLine(ll, ctx)
        }
    }

    static computeUpTremoloCase(item: Chord, tremolo: TremoloTwoChord, ctx: LayoutContext): boolean {
        const c1 = tremolo.chord1()
        const c2 = tremolo.chord2()
        if (!c1 || !c2) {
            return true
        }
        const cross = c1.staffMove() !== c2.staffMove()
        if (item === c1) {
            // we have to lay out the tremolo because it hasn't been laid out at all yet, and we need its direction
            TremoloLayout.layoutTwoChord(tremolo, ctx)
        }

        const measure = item.findMeasure()
        if (!cross && !tremolo.userModified()) {
            return tremolo.up()
        }

        if (!measure!.explicitParent()) {
            // this method will be called later (from Measure::layoutCrossStaff) after the
            // system is completely laid out.
            // this is necessary because otherwise there's no way to deal with cross-staff beams
            // because we don't know how far apart the staves actually are
            return item.ldata().up
        }

        if (tremolo.userModified()) {
            return ChordLayout.isChordPosBelowTrem(item, tremolo)
        }

        // unmodified cross-staff trem, should be one note per staff
        if (item.staffMove() !== 0) {
            return item.staffMove() > 0
        }

        const otherStaffMove = item.staffMove() === c1.staffMove() ? c2.staffMove() : c1.staffMove()
        return otherStaffMove < 0
    }

    static isChordPosBelowTrem(item: Chord | null, trem: TremoloTwoChord | null): boolean {
        if (!item || !trem || !trem.ldata().isValid()) {
            return true
        }

        const baseNote = item.up() ? item.downNote() : item.upNote()
        const noteY = baseNote.pagePos().y()

        const startAnchor = trem.startAnchor()
        const endAnchor = trem.endAnchor()

        if (startAnchor.isNull() || endAnchor.isNull()) {
            return trem.crossStaffBeamBetween() ? item.isBelowCrossBeam(trem) : trem.up()
        }

        if (item === trem.chord1()) {
            return noteY > startAnchor.y()
        }

        return noteY > endAnchor.y()
    }

    static isChordPosBelowBeam(item: Chord, beam: Beam): boolean {
        const baseNote = item.up() ? item.downNote() : item.upNote()
        const noteY = baseNote.pagePos().y()

        const startAnchor = beam.startAnchor()
        const endAnchor = beam.endAnchor()

        if (startAnchor.isNull() || endAnchor.isNull()) {
            return beam.cross() ? item.isBelowCrossBeam(beam) : beam.up()
        }

        if (item === beam.elements()[0]) {
            return noteY > startAnchor.y()
        }

        if (item === beam.elements()[beam.elements().length - 1]) {
            return noteY > endAnchor.y()
        }

        const noteAnchor = BeamLayout.chordBeamAnchor(beam, item, ChordBeamAnchorType.Middle)
        const noteX = noteAnchor.x()

        const proportionAlongX = startAnchor.x() === endAnchor.x() ? 0.0 : (noteX - startAnchor.x()) / (endAnchor.x() - startAnchor.x())
        const desiredY = proportionAlongX * (endAnchor.y() - startAnchor.y()) + startAnchor.y()

        return noteY > desiredY
    }

    static computeUp(item: ChordRest, ctx: LayoutContext): void {
        if (item.isChord()) {
            ChordLayout.computeChordUp(item as Chord, ctx)
        } else {
            // base ChordRest
            const beam = item.beam()
            const hasBeam = !!beam && beam.elements().length > 1
            if (hasBeam) {
                item.mutldata().up = beam!.up()
            } else {
                item.mutldata().up = true
            }
        }
    }

    /** C++ computeUp(const Chord*, Chord::LayoutData*, const LayoutContext&) */
    static computeChordUp(item: Chord, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const beam = item.beam()
        const hasBeam = !!beam && beam.elements().length > 1

        const tab = item.staff() ? item.staff()!.staffTypeForElement(item) : null
        const isTabStaff = !!tab && tab.isTabStaff()
        if (isTabStaff) {
            if (tab!.stemless()) {
                ldata.up = false
                return
            }
            if (!tab!.stemThrough()) {
                const staffHasMultipleVoices = item.measure()!.hasVoicesInRange(item.staffIdx(), item.tick(), item.actualTicks())
                if (staffHasMultipleVoices) {
                    ldata.up = item.track() % 2 === 0
                    return
                }
                ldata.up = !tab!.stemsDown()
                return
            }
        }

        if (item.stemDirection() !== DirectionV.AUTO && !hasBeam && !item.tremoloTwoChord()) {
            ldata.up = item.stemDirection() === DirectionV.UP
            return
        }

        if (hasBeam) {
            ldata.up = ChordLayout.computeUpBeamCase(item, beam!)
            return
        } else if (item.tremoloTwoChord()) {
            ldata.up = ChordLayout.computeUpTremoloCase(item, item.tremoloTwoChord()!, ctx)
            return
        }

        const staffHasMultipleVoices = item.measure()!.hasVoicesInRange(item.staffIdx(), item.tick(), item.actualTicks())
        if (staffHasMultipleVoices) {
            ldata.up = item.track() % 2 === 0
            return
        }

        const isGraceNote = item.noteType() !== NoteType.NORMAL
        if (isGraceNote) {
            ldata.up = true
            return
        }

        const chordIsCrossStaff = item.staffMove() !== 0
        if (chordIsCrossStaff) {
            ldata.up = item.staffMove() > 0
            return
        }

        const distances = item.noteDistances()
        const direction = ChordLayout.computeAutoStemDirection(distances)
        ldata.up = direction > 0
        void ctx
    }

    static computeAutoStemDirection(noteDistances: readonly number[]): number {
        let left = 0
        let right = noteDistances.length - 1

        while (left <= right) {
            const leftNote = noteDistances[left]
            const rightNote = noteDistances[right]
            const netDirecting = leftNote + rightNote
            if (netDirecting === 0) {
                left++
                right--
                continue
            }
            return netDirecting > 0 ? 1 : -1
        }
        return 0
    }

    static skipAccidentals(segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t): void {
        for (let track = startTrack; track < endTrack; ++track) {
            const item = segment.element(track)
            if (item && item.isChord()) {
                for (const note of (item as Chord).notes()) {
                    const acc = note.accidental()
                    if (acc) {
                        acc.mutldata().setIsSkipDraw(true)
                    }
                }
            }
        }
    }

    static calculateChordPosInfo(segment: Segment, staffIdx: staff_idx_t, partStartTrack: track_idx_t, partEndTrack: track_idx_t,
                                 ctx: LayoutContext): ChordPosInfo {
        const staff = ctx.dom().staff(staffIdx)!
        const posInfo = new ChordPosInfo()

        for (let track = partStartTrack; track < partEndTrack; ++track) {
            const e = segment.element(track)
            const calcChordPos = !!e && e.isChord() && e.vStaffIdx() === staffIdx
            if (!calcChordPos) {
                continue
            }

            const chord = e as Chord
            posInfo.chords.push(chord)
            let hasGraceBefore = false
            for (const c of chord.graceNotes()) {
                if (c.isGraceBefore()) {
                    hasGraceBefore = true
                }
                ChordLayout.layoutChords2(c.notes(), c.up(), ctx) // layout grace note noteheads
                ChordLayout.layoutChords3([c], c.notes(), staff, ctx) // layout grace note chords
            }
            if (chord.up()) {
                ++posInfo.upVoices
                posInfo.upStemNotes.push(...chord.notes())
                posInfo.upDots = Math.max(posInfo.upDots, chord.dots())
                posInfo.maxUpMag = Math.max(posInfo.maxUpMag, chord.mag())
                if (!posInfo.upHooks && !chord.beam()) {
                    posInfo.upHooks = !!chord.hook()
                }
                if (hasGraceBefore) {
                    posInfo.upGrace = true
                }
            } else {
                ++posInfo.downVoices
                posInfo.downStemNotes.push(...chord.notes())
                posInfo.downDots = Math.max(posInfo.downDots, chord.dots())
                posInfo.maxDownMag = Math.max(posInfo.maxDownMag, chord.mag())
                if (!posInfo.downHooks && !chord.beam()) {
                    posInfo.downHooks = !!chord.hook()
                }
                if (hasGraceBefore) {
                    posInfo.downGrace = true
                }
            }
        }
        return posInfo
    }

    static calculateMaxNoteWidths(posInfo: ChordPosInfo, tick: import('../../types/fraction').Fraction, staff: Staff,
                                  ctx: LayoutContext): void {
        // only needed for chords on standard staves
        const nominalWidth = ctx.conf().noteHeadWidth() * staff.staffMag(tick)
        posInfo.maxUpWidth = nominalWidth * posInfo.maxUpMag
        posInfo.maxDownWidth = nominalWidth * posInfo.maxDownMag

        // layout upstem noteheads
        if (posInfo.upVoices > 1) {
            posInfo.upStemNotes.sort(byStringOrLineDesc)
        }
        if (posInfo.upVoices) {
            const hw = ChordLayout.layoutChords2(posInfo.upStemNotes, true, ctx)
            posInfo.maxUpWidth = Math.max(posInfo.maxUpWidth, hw)
        }

        // layout downstem noteheads
        if (posInfo.downVoices > 1) {
            posInfo.downStemNotes.sort(byStringOrLineDesc)
        }
        if (posInfo.downVoices) {
            const hw = ChordLayout.layoutChords2(posInfo.downStemNotes, false, ctx)
            posInfo.maxDownWidth = Math.max(posInfo.maxDownWidth, hw)
        }
    }

    static applyChordOffsets(segment: Segment, staffIdx: staff_idx_t, partStartTrack: track_idx_t, partEndTrack: track_idx_t,
                             offsetInfo: OffsetInfo, posInfo: ChordPosInfo, ctx: LayoutContext): void {
        const staff = ctx.dom().staff(staffIdx)!
        const isTab = staff.isTabStaff(segment.tick())
        for (let track = partStartTrack; track < partEndTrack; ++track) {
            const e = segment.element(track)
            const layoutChord = !!e && e.isChord() && e.vStaffIdx() === staffIdx
            if (!layoutChord) {
                continue
            }
            const chord = e as Chord
            const chordLdata = chord.mutldata()
            const combineVoices = chord.shouldCombineVoice()
            if (!combineVoices && !offsetInfo.tracksToAdjust.has(track)) {
                if (chord.up()) {
                    chordLdata.moveX(offsetInfo.centerUp)
                } else {
                    chordLdata.moveX(offsetInfo.centerDown)
                }
                continue
            }
            if (chord.up()) {
                if (!RealIsNull(offsetInfo.upOffset)) {
                    offsetInfo.oversizeUp = isTab ? offsetInfo.oversizeUp / 2 : offsetInfo.oversizeUp
                    chordLdata.moveX(offsetInfo.upOffset + offsetInfo.centerAdjustUp + offsetInfo.oversizeUp)
                    if (posInfo.downDots && !posInfo.upDots) {
                        chordLdata.moveX(offsetInfo.dotAdjust)
                    }
                } else {
                    chordLdata.moveX(offsetInfo.centerUp)
                }
            } else {
                if (!RealIsNull(offsetInfo.downOffset)) {
                    chordLdata.moveX(offsetInfo.downOffset + offsetInfo.centerAdjustDown)
                    if (posInfo.upDots && !posInfo.downDots) {
                        chordLdata.moveX(offsetInfo.dotAdjust)
                    }
                } else {
                    chordLdata.moveX(offsetInfo.centerDown)
                }
            }
        }

        // layout chords
        const notes: Note[] = []
        if (posInfo.upVoices) {
            notes.push(...posInfo.upStemNotes)
        }
        if (posInfo.downVoices) {
            notes.push(...posInfo.downStemNotes)
        }
        if (posInfo.upVoices + posInfo.downVoices > 1) {
            notes.sort(byStringOrLineDesc)
        }
        ChordLayout.layoutChords3(posInfo.chords, notes, staff, ctx)
    }

    static centreChords(segment: Segment, posInfo: ChordPosInfo, staffIdx: staff_idx_t, tick: import('../../types/fraction').Fraction,
                        ctx: LayoutContext): OffsetInfo {
        const staff = ctx.dom().staff(staffIdx)!
        const isTab = staff.isTabStaff(segment.tick())
        const offsetInfo = new OffsetInfo()
        if (isTab) {
            return offsetInfo
        }
        const sp = staff.spatium(tick)
        const nominalWidth = ctx.conf().noteHeadWidth() * staff.staffMag(tick)
        const centerThreshold = 0.01 * sp

        // centering adjustments for whole note, breve, and small chords
        let headDiff = posInfo.maxUpWidth - nominalWidth
        // amount by which actual width exceeds nominal, adjusted for staff mag() only
        const headDiff2 = posInfo.maxUpWidth - nominalWidth * (posInfo.maxUpMag / staff.staffMag(tick))
        if (headDiff > centerThreshold && !isTab) {
            // larger than nominal
            offsetInfo.centerUp = headDiff * -0.5
            // maxUpWidth is true width, but we no longer will care about that
            // instead, we care only about portion to right of origin
            posInfo.maxUpWidth += offsetInfo.centerUp
            // to left of origin is fine
            if (headDiff2 > centerThreshold) {
                // if head is wider than nominal, we need to make sure it is laid out correctly
                offsetInfo.centerUp += headDiff2
                offsetInfo.oversizeUp = headDiff2
            }
        } else if (-headDiff > centerThreshold) {
            // smaller than nominal
            offsetInfo.centerUp = -headDiff * 0.5
            if (headDiff2 > centerThreshold) {
                // max is from an oversized head
                offsetInfo.centerUp += headDiff2
                offsetInfo.oversizeUp = headDiff2
            }
            offsetInfo.centerAdjustDown = offsetInfo.centerUp
        }

        headDiff = posInfo.maxDownWidth - nominalWidth
        if (headDiff > centerThreshold) {
            // larger than nominal
            offsetInfo.centerDown = headDiff * -0.5
            // to right of origin is fine
            posInfo.maxDownWidth = nominalWidth - offsetInfo.centerDown
        } else if (-headDiff > centerThreshold && !isTab) {
            // smaller than nominal
            offsetInfo.centerDown = -headDiff * 0.5
            offsetInfo.centerAdjustUp = offsetInfo.centerDown
        }
        return offsetInfo
    }

    static calculateChordOffsets(segment: Segment, staffIdx: staff_idx_t, tick: import('../../types/fraction').Fraction,
                                 offsetInfo: OffsetInfo, posInfo: ChordPosInfo, ctx: LayoutContext): void {
        if (!posInfo.upVoices || !posInfo.downVoices) {
            return
        }
        const staff = ctx.dom().staff(staffIdx)!
        const sp = staff.spatium(tick)
        const isTab = staff.isTabStaff(segment.tick())

        // only compute offsets if there are both up and down voices
        const bottomUpNote = posInfo.upStemNotes[0]
        const topDownNote = posInfo.downStemNotes[posInfo.downStemNotes.length - 1]
        const separation = topDownNote.stringOrLine() - bottomUpNote.stringOrLine()

        const overlapNotes: Note[] = []

        if (separation === 1) {
            // second
            if (posInfo.upDots && !posInfo.downDots) {
                offsetInfo.upOffset = posInfo.maxDownWidth + 0.1 * sp
                offsetInfo.tracksToAdjust.add(bottomUpNote.track())
            } else {
                offsetInfo.downOffset = posInfo.maxUpWidth
                // align stems if present
                const topDownStem = topDownNote.chord().stem()
                if (topDownStem && bottomUpNote.chord().stem()) {
                    offsetInfo.downOffset -= topDownStem.lineWidthMag()
                } else if (topDownNote.chord().durationType().headType() !== NoteHeadType.HEAD_BREVIS
                           && bottomUpNote.chord().durationType().headType() !== NoteHeadType.HEAD_BREVIS) {
                    // stemless notes should be aligned as is they were stemmed
                    // (except in case of brevis, cause the notehead has the side bars)
                    offsetInfo.downOffset -= ctx.conf().styleMM(Sid.stemWidth) * topDownNote.chord().mag()
                }
                offsetInfo.tracksToAdjust.add(topDownNote.track())
            }
        } else if (separation < 1) {
            // overlap (possibly unison)

            // build list of overlapping notes
            for (let i = 0, n = posInfo.upStemNotes.length; i < n; ++i) {
                if (posInfo.upStemNotes[i].stringOrLine() >= topDownNote.stringOrLine() - 1) {
                    overlapNotes.push(posInfo.upStemNotes[i])
                } else {
                    break
                }
            }
            for (let i = posInfo.downStemNotes.length; i > 0; --i) { // loop most probably needs to be in this reverse order
                if (posInfo.downStemNotes[i - 1].stringOrLine() <= bottomUpNote.stringOrLine() + 1) {
                    overlapNotes.push(posInfo.downStemNotes[i - 1])
                } else {
                    break
                }
            }
            overlapNotes.sort(byStringOrLineDesc)

            // check for conflicts
            let shareHeads = true // can all overlapping notes share heads?
            let matchPending = false // looking for a unison match
            let conflictUnison = false // unison found
            let conflictSecondUpHigher = false // second found
            let conflictSecondDownHigher = false // second found
            let lastLine = 1000
            let lastTrack = -1
            let p = overlapNotes[0]
            for (let i = 0, count = overlapNotes.length; i < count; ++i) {
                const n = overlapNotes[i]
                const nchord = n.chord()
                const pchord = p.chord()
                if (n.ldata().mirror) {
                    if (separation < 0) {
                        // don't try to share heads if there is any mirroring
                        shareHeads = false
                        // don't worry about conflicts involving mirrored notes
                        continue
                    }
                }
                const track = n.track()
                const line = n.stringOrLine()
                const d = lastLine - line
                switch (d) {
                case 0: {
                    // unison
                    conflictUnison = true
                    matchPending = false
                    const nHeadType = (n.headType() === NoteHeadType.HEAD_AUTO) ? n.chord().durationType().headType() : n.headType()
                    const pHeadType = (p.headType() === NoteHeadType.HEAD_AUTO) ? p.chord().durationType().headType() : p.headType()
                    // the most important rules for sharing noteheads on unisons between voices are
                    // that notes must be one same line with same tpc
                    // noteheads must be unmirrored and of same group
                    // and chords must be same size if notehead is not quarter-sized
                    if (n.headGroup() !== p.headGroup() || n.tpc() !== p.tpc() || n.ldata().mirror || p.ldata().mirror
                        || (nchord.isSmall() !== pchord.isSmall()
                            && (nHeadType !== NoteHeadType.HEAD_QUARTER || pHeadType !== NoteHeadType.HEAD_QUARTER))) {
                        shareHeads = false
                    } else {
                        // noteheads are potentially shareable
                        // it is more subjective at this point
                        // current default is to require *either* of the following:
                        //    1) both chords have same number of dots, both have stems, and both noteheads are same type and are full size (automatic match)
                        // or 2) one or more of the noteheads is not of type AUTO, but is explicitly set to match the other (user-forced match)
                        // or 3) exactly one of the noteheads is invisible (user-forced match)
                        // thus user can force notes to be shared despite differing number of dots or either being stemless
                        // by setting one of the notehead types to match the other or by making one notehead invisible
                        // TODO: consider adding a style option, staff properties, or note property to control sharing
                        if ((nchord.dots() !== pchord.dots() || !nchord.stem() || !pchord.stem() || nHeadType !== pHeadType
                             || n.isSmall() || p.isSmall())
                            && ((n.headType() === NoteHeadType.HEAD_AUTO && p.headType() === NoteHeadType.HEAD_AUTO)
                                || nHeadType !== pHeadType)
                            && (n.visible() === p.visible())) {
                            shareHeads = false
                        }
                    }
                    break
                }
                case 1:
                    // second
                    // trust that this won't be a problem for single unison
                    if (separation < 0) {
                        if (n.chord().up()) {
                            conflictSecondUpHigher = true
                        } else {
                            conflictSecondDownHigher = true
                        }
                        shareHeads = false
                    }
                    break
                default:
                    // no conflict
                    if (matchPending) {
                        shareHeads = false
                    }
                    matchPending = true
                }
                if (!shareHeads) {
                    offsetInfo.tracksToAdjust.add(track)
                    offsetInfo.tracksToAdjust.add(lastTrack)
                }
                p = n
                lastLine = line
                lastTrack = track
            }
            if (matchPending) {
                shareHeads = false
            }

            // calculate offsets
            const conflict = conflictUnison || conflictSecondDownHigher || conflictSecondUpHigher
            let ledgerOverlapAbove = false
            let ledgerOverlapBelow = false

            const ledgerGap = 0.15 * sp
            const ledgerLen = ctx.conf().styleS(Sid.ledgerLineLength).val() * sp
            const firstLedgerBelow = staff.lines(bottomUpNote.tick()) * 2
            let topDownStemLen = 0
            const topDownChordStem = topDownNote.chord().stem()
            if (!conflictUnison && topDownChordStem) {
                topDownStemLen = stdRound(topDownChordStem.ldata().bbox().height() / sp * 2)
                if (bottomUpNote.stringOrLine() > firstLedgerBelow - 1 && topDownNote.stringOrLine() < bottomUpNote.stringOrLine()
                    && topDownNote.stringOrLine() + topDownStemLen >= firstLedgerBelow) {
                    ledgerOverlapBelow = true
                }
            }
            const firstLedgerAbove = -2
            let bottomUpStemLen = 0
            const bottomUpChordStem = bottomUpNote.chord().stem()
            if (!conflictUnison && bottomUpChordStem) {
                bottomUpStemLen = stdRound(bottomUpChordStem.ldata().bbox().height() / sp * 2)
                if (topDownNote.stringOrLine() < -1 && topDownNote.stringOrLine() < bottomUpNote.stringOrLine()
                    && bottomUpNote.stringOrLine() - bottomUpStemLen <= firstLedgerAbove) {
                    ledgerOverlapAbove = true
                }
            }

            // centering adjustments for whole note, breve, and small chords
            if (shareHeads) {
                for (let i = overlapNotes.length - 1; i >= 1; i -= 2) {
                    const previousNote = overlapNotes[i - 1]
                    const n = overlapNotes[i]
                    const skipNote = previousNote.chord().isNudged() || n.chord().isNudged()
                    if (skipNote) {
                        continue
                    }
                    const prevChordSmall = previousNote.chord().isSmall()
                    const nChordSmall = n.chord().isSmall()
                    if (previousNote.chord().dots() === n.chord().dots()) {
                        // hide one set of dots
                        const onLine = !(previousNote.line() & 1)
                        if (prevChordSmall) {
                            previousNote.setDotsHidden(true)
                        } else if (nChordSmall) {
                            n.setDotsHidden(true)
                        } else if (onLine) {
                            // hide dots for lower voice
                            if (previousNote.voice() & 1) {
                                previousNote.setDotsHidden(true)
                            } else {
                                n.setDotsHidden(true)
                            }
                        } else {
                            // hide dots for upper voice
                            if (!(previousNote.voice() & 1)) {
                                previousNote.setDotsHidden(true)
                            } else {
                                n.setDotsHidden(true)
                            }
                        }
                    }
                    // If either chord is small, adjust offset
                    let smallChord: Chord | null = prevChordSmall ? previousNote.chord() : null
                    smallChord = nChordSmall ? n.chord() : smallChord
                    if (smallChord && !(prevChordSmall && nChordSmall)) {
                        if (smallChord.up()) {
                            offsetInfo.centerUp *= 2
                        } else {
                            offsetInfo.centerDown = 0
                        }
                    }
                }
            } else if (conflict && (posInfo.upDots && !posInfo.downDots)) {
                offsetInfo.upOffset = posInfo.maxDownWidth + 0.1 * sp
            } else if (conflictUnison && separation === 0 && (!posInfo.downGrace || posInfo.upGrace)) {
                offsetInfo.downOffset = posInfo.maxUpWidth + 0.15 * sp
            } else if (conflictUnison) {
                offsetInfo.upOffset = posInfo.maxDownWidth + 0.15 * sp
            } else if (conflictSecondUpHigher) {
                offsetInfo.upOffset = posInfo.maxDownWidth + 0.15 * sp
            } else if ((posInfo.downHooks && !posInfo.upHooks) && !(posInfo.upDots && !posInfo.downDots)) {
                // Shift by ledger line length if ledger line conflict or just 0.3sp if no ledger lines
                const adjSpace = (ledgerOverlapAbove || ledgerOverlapBelow) ? ledgerGap + ledgerLen : 0.3 * sp
                offsetInfo.downOffset = posInfo.maxUpWidth + adjSpace
            } else if (conflictSecondDownHigher) {
                if (posInfo.downDots && !posInfo.upDots) {
                    const adjSpace = (ledgerOverlapAbove || ledgerOverlapBelow) ? ledgerGap + ledgerLen : 0.2 * sp
                    offsetInfo.downOffset = posInfo.maxUpWidth + adjSpace
                } else {
                    // Prevent ledger line & notehead collision
                    const adjSpace = (topDownNote.stringOrLine() <= firstLedgerAbove || bottomUpNote.stringOrLine() >= firstLedgerBelow)
                        ? ledgerLen - ledgerGap - 0.2 * sp : -0.2 * sp
                    offsetInfo.upOffset = posInfo.maxDownWidth + adjSpace
                    if (posInfo.downHooks) {
                        const needsHookSpace = ledgerOverlapBelow || ledgerOverlapAbove
                        const hook = topDownNote.chord().hook()
                        const hookSpace = hook ? hook.width() : 0.0
                        offsetInfo.upOffset = needsHookSpace ? hookSpace + ledgerLen + ledgerGap : offsetInfo.upOffset + 0.3 * sp
                    }
                }
            } else {
                // no direct conflict, so parts can overlap (downstem on left)
                // just be sure that stems clear opposing noteheads and ledger lines
                let clearLeft = isTab ? StemLayout.chordStemPosX(bottomUpNote.chord()) : 0.0
                let clearRight = isTab ? StemLayout.chordStemPosX(bottomUpNote.chord()) : 0.0
                const overlapPadding = (isTab ? 0 : 0.3) * sp
                if (topDownChordStem) {
                    if (ledgerOverlapBelow) {
                        // Doc says: "Ledger lines on an upstem chord should not touch the downstem chord's stem"
                        clearLeft += ledgerLen + ledgerGap + topDownChordStem.lineWidthMag()
                    } else {
                        clearLeft += topDownChordStem.lineWidthMag() + overlapPadding
                    }
                }
                if (bottomUpChordStem) {
                    if (ledgerOverlapAbove) {
                        clearRight += posInfo.maxDownWidth + ledgerLen + ledgerGap - posInfo.maxUpWidth
                                      + bottomUpChordStem.lineWidthMag()
                    } else {
                        clearRight += bottomUpChordStem.lineWidthMag()
                                      + Math.max(posInfo.maxDownWidth - posInfo.maxUpWidth, 0.0) + overlapPadding
                    }
                } else {
                    posInfo.downDots = 0 // no need to adjust for dots in this case
                }
                offsetInfo.upOffset = Math.max(clearLeft, clearRight)
                // Check if there's enough space to fit the flag
                const topUpNote = posInfo.upStemNotes[posInfo.upStemNotes.length - 1]
                const pad = ctx.conf().styleB(Sid.useStraightNoteFlags) ? 2 : 1
                const overlapsFlag = topDownNote.stringOrLine() + topDownStemLen + pad > topUpNote.stringOrLine()
                if (posInfo.downHooks && (ledgerOverlapBelow || overlapsFlag)) {
                    // we will need more space to avoid collision with hook
                    // but we won't need as much dot adjustment
                    const hook = topDownNote.chord().hook()
                    const hookWidth = hook ? hook.width() : 0.0
                    if (ledgerOverlapBelow) {
                        offsetInfo.upOffset = hookWidth + ledgerLen + ledgerGap
                    }
                    if (isTab) {
                        offsetInfo.upOffset = hookWidth + posInfo.maxDownWidth
                    }
                    offsetInfo.upOffset = Math.max(offsetInfo.upOffset, posInfo.maxDownWidth + 0.1 * sp)
                    offsetInfo.dotAdjustThreshold = posInfo.maxUpWidth - 0.3 * sp
                }
                // if downstem chord is small, don't center
                // and we might not need as much dot adjustment either
                if (offsetInfo.centerDown > 0.0) {
                    offsetInfo.centerDown = 0.0
                    offsetInfo.centerAdjustUp = 0.0
                    offsetInfo.dotAdjustThreshold = (offsetInfo.upOffset - posInfo.maxDownWidth) + posInfo.maxUpWidth - 0.3 * sp
                }
            }
        }

        // adjust for dots
        if ((posInfo.upDots && !posInfo.downDots) || (posInfo.downDots && !posInfo.upDots)) {
            // only one sets of dots
            // place between chords
            let dots: number
            let mag: number
            if (posInfo.upDots) {
                dots = posInfo.upDots
                mag = posInfo.maxUpMag
            } else {
                dots = posInfo.downDots
                mag = posInfo.maxDownMag
            }
            const dotWidth = segment.symWidth(SymId.augmentationDot)
            // first dot
            offsetInfo.dotAdjust = ctx.conf().styleMM(Sid.dotNoteDistance) + dotWidth
            // additional dots
            if (dots > 1) {
                offsetInfo.dotAdjust += ctx.conf().styleMM(Sid.dotDotDistance) * (dots - 1)
            }
            offsetInfo.dotAdjust *= mag
            // only by amount over threshold
            offsetInfo.dotAdjust = Math.max(offsetInfo.dotAdjust - offsetInfo.dotAdjustThreshold, 0.0)
        }
        if (separation === 1) {
            offsetInfo.dotAdjust += 0.1 * sp
        }
    }

    // ---------------------------------------------------------
    //   layoutChords1
    //    - layout upstem and downstem chords
    //    - offset as necessary to avoid conflict
    // ---------------------------------------------------------

    static layoutChords1(ctx: LayoutContext, segment: Segment, staffIdx: staff_idx_t): void {
        const staff = ctx.dom().staff(staffIdx)!
        const isTab = staff.isTabStaff(segment.tick())
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES
        const tick = segment.tick()
        const staffType = staff.staffType(segment.tick())
        const part = staff.part()
        const partStartTrack = part ? part.startTrack() : startTrack
        const partEndTrack = part ? part.endTrack() : endTrack

        if (isTab) {
            ChordLayout.skipAccidentals(segment, startTrack, endTrack)
        }

        const st0 = staff.staffType()
        const isSimpleTab = !st0 || (!st0.stemThrough() && !st0.isCommonTabStaff())
        if (staff.isTabStaff(tick) && isSimpleTab) {
            for (let track = partStartTrack; track < partEndTrack; ++track) {
                const e = segment.element(track)
                if (e && e.isChord() && e.vStaffIdx() === staffIdx) {
                    e.mutldata().setPosX(0.0)
                }
            }
            layoutSegmentElements(segment, startTrack, endTrack, staffIdx, ctx)
            return
        }

        const posInfo = ChordLayout.calculateChordPosInfo(segment, staffIdx, partStartTrack, partEndTrack, ctx)

        if (posInfo.upVoices + posInfo.downVoices && (staffType.stemThrough() || staffType.isCommonTabStaff())) {
            ChordLayout.calculateMaxNoteWidths(posInfo, tick, staff, ctx)
            const offsetInfo = ChordLayout.centreChords(segment, posInfo, staffIdx, tick, ctx)
            ChordLayout.calculateChordOffsets(segment, staffIdx, tick, offsetInfo, posInfo, ctx)
            ChordLayout.applyChordOffsets(segment, staffIdx, partStartTrack, partEndTrack, offsetInfo, posInfo, ctx)
        }

        if (!isTab) {
            ChordLayout.layoutLedgerLines(posInfo.chords, ctx)
            AccidentalsLayout.layoutAccidentals(posInfo.chords, ctx)
            for (const chord of posInfo.chords) {
                for (const grace of chord.graceNotes()) {
                    AccidentalsLayout.layoutAccidentals([grace], ctx)
                }
            }
        }

        layoutSegmentElements(segment, partStartTrack, partEndTrack, staffIdx, ctx)

        for (const chord of posInfo.chords) {
            const ornament = chord.findOrnament() as Ornament | null
            if (ornament && ornament.showCueNote()) {
                TLayout.layoutOrnamentCueNote(ornament, ctx)
            }
        }
    }

    // ---------------------------------------------------------
    //   layoutChords2
    //    - determine which notes need mirroring
    //    - this is called once for each stem direction
    //      eg, once for voices 1&3, once for 2&4
    //      with all notes combined and sorted to resemble one chord
    //    - return maximum non-mirrored notehead width
    // ---------------------------------------------------------

    static layoutChords2(notes: readonly Note[], up: boolean, ctx: LayoutContext): number {
        let startIdx: number
        let endIdx: number
        let incIdx: number
        let maxWidth = 0.0

        // loop in correct direction so that first encountered notehead wins conflict
        if (up) {
            // loop bottom up
            startIdx = 0
            endIdx = notes.length
            incIdx = 1
        } else {
            // loop top down
            startIdx = notes.length - 1
            endIdx = -1
            incIdx = -1
        }

        let prevLine = 1000 // line of previous notehead
        // hack: start high so first note won't show as conflict
        let prevVisible = false // was last note visible?
        let mirror = false // should current notehead be mirrored?
        // value is retained and may be used on next iteration
        // to track mirror status of previous note
        let isLeft = notes[startIdx].chord().up() // is notehead on left?
        let prevChord = notes[startIdx].chord()
        let prevStaffIdx = prevChord.vStaffIdx() // staff of last note (including staffMove)
        let prevTrackIdx = prevChord.track()

        for (let idx = startIdx; idx !== endIdx; idx += incIdx) {
            const note = notes[idx] // current note
            const line = note.stringOrLine() // line of current note
            const chord = note.chord()
            const staffIdx = chord.vStaffIdx() // staff of current note
            const trackIdx = chord.track()
            const st = note.staff()!
            const isTab = st.isTabStaff(chord.tick())

            if (isTab) {
                TLayout.layoutNote(note, ctx)
            }

            // there is a conflict
            // if this same or adjacent line as previous note (and chords are in same direction)
            // but no need to do any of this for hidden notes
            const sameTrack = trackIdx === prevTrackIdx
            const conflict = (Math.abs(prevLine - line) < 2) && (prevStaffIdx === staffIdx) && note.visible() && prevVisible
                             && (sameTrack || Chord_combineVoice(chord, prevChord))

            // conflict on same line or adjacent line
            if (conflict || (chord.up() !== isLeft)) {
                isLeft = !isLeft
            }
            const nmirror = chord.up() !== isLeft

            // by default, notes and dots are not hidden
            // this may be changed later to allow unisons to share note heads
            note.setHidden(false)
            note.setDotsHidden(false)

            // be sure chord position is initialized
            // chord may be moved to the right later
            // if there are conflicts between voices
            if (!chord.isGrace()) {
                chord.mutldata().setPosX(0.0)
            }

            // let user mirror property override the default we calculated
            if (note.userMirror() === DirectionH.AUTO) {
                mirror = nmirror
            } else {
                mirror = note.chord().up()
                if (note.userMirror() === DirectionH.LEFT) {
                    mirror = !mirror
                }
            }
            note.mutldata().mirror = mirror
            const stem = chord.stem()
            if (stem) {
                stem.mutldata().setPosX(StemLayout.chordStemPosX(chord))
                TLayout.layoutStem(stem, ctx) // needed because mirroring can cause stem position to change
            }

            // accumulate return value
            if (!mirror) {
                const fretBackground = ctx.conf().styleS(Sid.tabFretPadding).val() * note.spatium()
                const noteWidth = isTab ? note.tabHeadWidth(st.staffTypeForElement(note)) + 2 * fretBackground : note.bboxRightPos()
                maxWidth = Math.max(maxWidth, noteWidth)
            }

            // prepare for next iteration
            prevChord = chord
            prevVisible = note.visible()
            prevStaffIdx = staffIdx
            prevTrackIdx = trackIdx
            prevLine = line
        }

        return maxWidth
    }

    static chordHasDotsAllInvisible(chord: Chord): boolean {
        if (!chord.dots()) {
            return false
        }
        for (const note of chord.notes()) {
            for (const dot of note.dots()) {
                if (dot.visible()) {
                    return false
                }
            }
        }
        return true
    }

    static centerX(chord: Chord): number {
        const st = chord.staff()!
        const stt = st.staffTypeForElement(chord)
        if (stt.isTabStaff()) {
            return StemLayout.tabStemPosX() * chord.spatium()
        }
        const note = chord.up() ? chord.downNote() : chord.upNote()
        return note.pos().x() + note.noteheadCenterX()
    }

    // ---------------------------------------------------------
    //   placeDots
    // ---------------------------------------------------------

    static placeDots(chords: readonly Chord[], notes: readonly Note[]): void {
        let chord: Chord | null = null
        for (const c of chords) {
            if (c.dots() > 0) {
                chord = c
                break
            } else {
                for (const note of c.notes()) {
                    note.setDotRelativeLine(0, layoutDot) // this manages the deletion of dots
                }
            }
        }
        if (!chord || (chord.staff()!.isTabStaff(chord.tick()) && !chord.staff()!.staffType(chord.tick()).stemThrough())) {
            return
        }
        const topDownNotes: Note[] = []
        const bottomUpNotes: Note[] = []
        const anchoredDots: number[] = []
        // construct combined chords using the notes from overlapping chords
        ChordLayout.getNoteListForDots(chord, topDownNotes, bottomUpNotes, anchoredDots)

        for (const note of notes) {
            const onLine = !(note.line() & 1)
            if (onLine) {
                const alreadyAdded = new Map<number, Note>()
                let finished = false
                for (const otherNote of bottomUpNotes) {
                    if (otherNote.visible() !== note.visible()) {
                        continue
                    }
                    let dotMove = otherNote.dotPosition() === DirectionV.UP ? -1 : 1
                    const otherDotLoc = otherNote.line() + dotMove
                    const added = alreadyAdded.has(otherDotLoc)
                    if (!added && anchoredDots.includes(otherDotLoc)) {
                        dotMove = -dotMove // if the desired space is taken, adjust opposite
                    } else if (added && alreadyAdded.get(otherDotLoc) !== otherNote) {
                        dotMove = -dotMove
                    }
                    // set y for this note
                    if (note === otherNote) {
                        note.setDotRelativeLine(dotMove, layoutDot)
                        finished = true
                        anchoredDots.push(note.line() + dotMove)
                        alreadyAdded.set(otherNote.line() + dotMove, otherNote)
                        break
                    }
                }
                if (!finished) {
                    alreadyAdded.clear()
                    for (const otherNote of topDownNotes) {
                        if (otherNote.visible() !== note.visible()) {
                            continue
                        }
                        let dotMove = otherNote.dotPosition() === DirectionV.DOWN ? 1 : -1
                        const otherDotLoc = otherNote.line() + dotMove
                        const added = alreadyAdded.has(otherDotLoc)
                        if (!added && anchoredDots.includes(otherDotLoc)) {
                            dotMove = -dotMove
                        } else if (added && alreadyAdded.get(otherDotLoc) !== otherNote) {
                            dotMove = -dotMove
                        }
                        // set y for this note
                        if (note === otherNote) {
                            note.setDotRelativeLine(dotMove, layoutDot)
                            finished = true
                            anchoredDots.push(note.line() + dotMove)
                            break
                        }
                        if (!added) {
                            alreadyAdded.set(otherNote.line() + dotMove, otherNote)
                        }
                    }
                }
                if (!finished) {
                    note.setDotRelativeLine(0, layoutDot)
                }
            } else {
                // on a space; usually this means the dot is on this same line, but there is an exception
                // for a unison within the same chord.
                for (const otherNote of note.chord().notes()) {
                    if (note === otherNote) {
                        note.setDotRelativeLine(0, layoutDot) // same space as notehead
                        break
                    }
                    if (note.line() === otherNote.line()) {
                        const adjustDown = (note.chord().voice() & 1) && !note.chord().up()
                        note.setDotRelativeLine(adjustDown ? 2 : -2, layoutDot)
                        break
                    }
                }
            }
        }
    }

    static setDotX(chords: readonly Chord[], dotPos: readonly number[], staff: Staff, upDotPosX: number, downDotPosX: number): void {
        const combineChordConflicts = new Set<track_idx_t>()
        const separateChordConflicts = new Set<track_idx_t>()
        for (const chord1 of chords) {
            for (const chord2 of chords) {
                if ((chord1 !== chord2)
                    && ((chord1.up() && !chord2.up() && chord2.upNote().line() - chord1.downNote().line() < 2)
                        || (!chord1.up() && chord2.up() && chord1.upNote().line() - chord2.downNote().line() < 2))
                    && Chord_combineVoice(chord1, chord2)) {
                    combineChordConflicts.add(chord1.track())
                    combineChordConflicts.add(chord2.track())
                } else if ((chord1 !== chord2)
                           && ((chord1.up() && chord2.up() && chord1.upNote().line() - chord2.downNote().line() < 2)
                               || (!chord1.up() && !chord2.up() && chord1.upNote().line() - chord2.downNote().line() < 2))
                           && !Chord_combineVoice(chord1, chord2)) {
                    separateChordConflicts.add(chord1.track())
                    separateChordConflicts.add(chord2.track())
                }
            }
        }
        const maxPosX = Math.max(upDotPosX, downDotPosX)
        for (const chord of chords) {
            if (ChordLayout.chordHasDotsAllInvisible(chord)) {
                continue
            }
            const combineVoices = chord.shouldCombineVoice()
            const idx = (VOICES * (chord.staffIdx() - staff.idx() + 1)) + chord.voice()
            if (combineChordConflicts.size) {
                if (combineChordConflicts.has(chord.track())) {
                    chord.setDotPosX(maxPosX)
                } else {
                    chord.setDotPosX(combineVoices ? maxPosX : dotPos[idx])
                }
            } else {
                if (combineVoices) {
                    if (separateChordConflicts.has(chord.track())) {
                        chord.setDotPosX(dotPos[idx])
                    } else {
                        if (chord.up()) {
                            chord.setDotPosX(upDotPosX)
                        } else {
                            chord.setDotPosX(downDotPosX)
                        }
                    }
                } else {
                    chord.setDotPosX(dotPos[idx])
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   layoutChords3
    //    - calculate positions of notes, accidentals, dots
    // ---------------------------------------------------------

    static layoutChords3(chords: readonly Chord[], notes: readonly Note[], staff: Staff, ctx: LayoutContext): void {
        const tick = notes[0].chord().segment()!.tick()
        const sp = staff.spatium(tick)
        const stepDistance = sp * staff.lineDistance(tick) * 0.5
        const stepOffset = staff.staffType(tick).stepOffset()

        let upDotPosX = 0.0
        let downDotPosX = 0.0
        const dotPos = new Array<number>(3 * VOICES).fill(0)

        const nNotes = notes.length
        for (let i = nNotes - 1; i >= 0; --i) {
            const note = notes[i]
            let dotPosition = note.userDotPosition()
            const chord = note.chord()
            if (chord.dots()) {
                if (dotPosition === DirectionV.AUTO && nNotes > 1 && note.visible() && !note.dotsHidden()) {
                    // resolve dot conflicts
                    const line = note.line()
                    let above: Note | null = (i < nNotes - 1) ? notes[i + 1] : null
                    if (above
                        && (!above.visible() || above.dotsHidden() || above.chord().dots() === 0
                            || !Chord_combineVoice(chord, above.chord()))) {
                        above = null
                    }
                    const intervalAbove = above ? line - above.line() : 1000
                    let below: Note | null = (i > 0) ? notes[i - 1] : null
                    if (below
                        && (!below.visible() || below.dotsHidden() || below.chord().dots() === 0
                            || !Chord_combineVoice(chord, below.chord()))) {
                        below = null
                    }
                    const intervalBelow = below ? below.line() - line : 1000
                    if ((line & 1) === 0) {
                        // line
                        if (intervalAbove === 1 && intervalBelow !== 1) {
                            dotPosition = DirectionV.DOWN
                        } else if (intervalBelow === 1 && intervalAbove !== 1) {
                            dotPosition = DirectionV.UP
                        } else if (intervalAbove === 0 || intervalBelow === 0) {
                            dotPosition = DirectionV.AUTO // unison conflicts taken care of later
                        }
                    } else {
                        // space
                        if (intervalAbove === 0 && above!.chord().dots()) {
                            // unison
                            if (!(note.voice() & 1)) {
                                dotPosition = DirectionV.UP // space, doesn't matter
                            } else {
                                if (!(above!.voice() & 1)) {
                                    above!.setDotPosition(DirectionV.UP)
                                } else {
                                    dotPosition = DirectionV.DOWN
                                }
                            }
                        }
                    }
                }
            }
            if (dotPosition === DirectionV.AUTO) {
                dotPosition = note.voice() & 1 ? DirectionV.DOWN : DirectionV.UP
            }
            note.setDotPosition(dotPosition)
        }

        // Now, we can resolve note conflicts as a superchord
        ChordLayout.placeDots(chords, notes)

        // Hide unnecessary dots and position notes
        for (const chord of chords) {
            const _up = chord.up()

            const stemSlash = chord.stemSlash()
            if (stemSlash) {
                TLayout.layoutStemSlash(stemSlash, ctx)
            }

            let overlapMirror: number
            const stem = chord.stem()
            if (stem) {
                overlapMirror = stem.lineWidthMag()
            } else if (chord.durationType().headType() === NoteHeadType.HEAD_WHOLE) {
                overlapMirror = ctx.conf().styleMM(Sid.stemWidth) * chord.mag()
            } else {
                overlapMirror = 0.0
            }

            let minDotPosX = 0.0
            const chordNotes = [...chord.notes()]
            chordNotes.sort((n1, n2) => n1.line() - n2.line())
            for (const note of chordNotes) {
                let noteX = 0.0
                if (note.ldata().mirror) {
                    if (_up) {
                        noteX = StemLayout.chordStemPosX(chord) - overlapMirror
                    } else {
                        noteX = -note.headBodyWidth() + overlapMirror
                    }
                } else if (_up) {
                    noteX = chord.noteHeadWidth() - note.headBodyWidth()
                }

                const ny = (note.line() + stepOffset) * stepDistance
                if (note.ldata().pos().y() !== ny) {
                    note.mutldata().setPosY(ny)
                    if (stem) {
                        TLayout.layoutStem(stem, ctx)
                        const hook = chord.hook()
                        if (hook) {
                            hook.mutldata().setPosY(stem.flagPosition().y())
                        }
                    }
                }

                const dotX = noteX + note.headBodyWidth() + chord.pos().x()
                if (chord.dots()) {
                    const idx = (VOICES * (chord.staffIdx() - staff.idx() + 1)) + chord.voice()
                    dotPos[idx] = Math.max(dotPos[idx], dotX)
                }
                note.mutldata().setPosX(noteX)
                minDotPosX = Math.max(minDotPosX, dotX)
            }

            if (chord.dots()) {
                if (ChordLayout.chordHasDotsAllInvisible(chord)) {
                    chord.setDotPosX(minDotPosX)
                } else if (chord.up()) {
                    upDotPosX = Math.max(upDotPosX, minDotPosX)
                } else {
                    downDotPosX = Math.max(downDotPosX, minDotPosX)
                }
            }
        }

        ChordLayout.setDotX(chords, dotPos, staff, upDotPosX, downDotPosX)
    }

    static layoutLedgerLines(chords: readonly Chord[], ctx: LayoutContext): void {
        for (const item of chords) {
            ChordLayout.updateLedgerLines(item, ctx)
            for (const grace of item.graceNotes()) {
                ChordLayout.updateLedgerLines(grace, ctx)
            }
        }
    }

    // ---------------------------------------------------------
    //   getNoteListForDots
    //    This method populates three lists: one for chord notes that need to be checked from the top down,
    //    one for chords from the bottom up, and one for spaces (where the dot will be in that space)
    // ---------------------------------------------------------

    static getNoteListForDots(c: Chord, topDownNotes: Note[], bottomUpNotes: Note[], anchoredDots: number[]): void {
        const measure = c.measure()!
        const hasVoices = measure.hasVoicesInRange(c.vStaffIdx(), c.tick(), c.ticks(), true)
        let hasUpperCrossNotes = false
        let hasLowerCrossNotes = false
        const partTopStaff = Math.floor(c.part()!.startTrack() / VOICES)
        const partBottomStaff = Math.floor(c.part()!.endTrack() / VOICES)
        let startVoice = c.track() - c.voice()
        let lastVoice = Math.min(c.vStaffIdx() + 2, partBottomStaff) * VOICES
        if (partTopStaff !== c.vStaffIdx()) {
            for (let i = partTopStaff * VOICES; i < (partTopStaff + 1) * VOICES; ++i) {
                const voiceChord = measure.findChord(c.tick(), i)
                if (voiceChord) {
                    if (voiceChord.vStaffIdx() === c.vStaffIdx()) {
                        hasUpperCrossNotes = true
                        startVoice = i
                        break
                    }
                }
            }
        }
        if (partBottomStaff !== c.vStaffIdx()) {
            for (let i = (c.vStaffIdx() + 1) * VOICES; i < lastVoice; ++i) {
                const voiceChord = measure.findChord(c.tick(), i)
                if (voiceChord) {
                    if (voiceChord.vStaffIdx() === c.vStaffIdx()) {
                        hasLowerCrossNotes = true
                        break
                    }
                }
            }
        }
        if (!hasVoices && !(hasUpperCrossNotes || hasLowerCrossNotes)) {
            // only this voice, so topDownNotes is just the notes in the chord
            for (const note of c.notes()) {
                if (note.line() & 1) {
                    let newOffset = 0
                    const adjustDown = (c.voice() & 1) && !c.up()
                    if (anchoredDots.length && anchoredDots[anchoredDots.length - 1] === note.line()) {
                        if (anchoredDots.length >= 2 && anchoredDots[anchoredDots.length - 2] === note.line() + (adjustDown ? 2 : -2)) {
                            newOffset = adjustDown ? -2 : 2
                        } else {
                            newOffset = adjustDown ? 2 : -2
                        }
                    }
                    anchoredDots.push(note.line() + newOffset)
                } else {
                    topDownNotes.push(note)
                }
            }
        } else {
            // Get a list of notes in this staff that adjust dots from top down,
            // bottom up, and also notes that are anchored to spaces
            lastVoice = hasLowerCrossNotes ? lastVoice : (c.vStaffIdx() + 1) * VOICES
            for (let i = startVoice; i < lastVoice; ++i) {
                const voiceChord = measure.findChord(c.tick(), i)
                if (voiceChord) {
                    if (voiceChord.vStaffIdx() !== c.vStaffIdx()) {
                        continue
                    }
                    const startFromTop = !((voiceChord.voice() & 1) && !voiceChord.up()) && voiceChord.staffMove() !== -1
                    if (startFromTop) {
                        for (const note of voiceChord.notes()) {
                            if (note.line() & 1) {
                                anchoredDots.push(note.line())
                            } else {
                                topDownNotes.push(note)
                            }
                        }
                    } else {
                        for (const note of voiceChord.notes()) {
                            if (note.line() & 1) {
                                anchoredDots.push(note.line())
                            } else {
                                bottomUpNotes.push(note)
                            }
                        }
                    }
                }
            }
        }
        // our two lists now contain only notes that are on lines
        topDownNotes.sort((n1, n2) => n1.line() - n2.line())
        bottomUpNotes.sort((n1, n2) => n2.line() - n1.line())
    }

    static appendGraceNotes(chord: Chord): void {
        const segment = chord.segment()!
        const measure = chord.measure()!
        const track = chord.track()
        const staffIdx = chord.staffIdx()
        const gnb = chord.graceNotesBefore()
        const gna = chord.graceNotesAfter()

        // Grace notes before
        if (!gnb.empty()) {
            const item = segment.preAppendedItem(track)
            if (item && item.isGraceNotesGroup()) {
                // Theoretically, this should never happen.
                const gng = item as unknown as typeof gnb
                for (const c of gnb) {
                    gng.push(c)
                }
            } else {
                gnb.setAppendedSegment(segment)
                segment.preAppend(gnb, track)
            }
        }

        // Grace notes after
        if (!gna.empty()) {
            let followingSeg = measure.tick2segment(chord.endTick(), SegmentType.All)
            while (followingSeg
                   && (!followingSeg.hasElementsInRange(staff2track(staffIdx), staff2track(staffIdx + 1) - 1) || followingSeg.isTimeTickType())) {
                followingSeg = followingSeg.next()
            }
            if (followingSeg) {
                gna.setAppendedSegment(followingSeg)
                followingSeg.preAppend(gna, track)
            }
        }
    }

    /* Grace-notes-after have the special property of belonging to
    *  a segment but being pre-appended to another. This repositioning
    *  is needed and must be called AFTER horizontal spacing is calculated. */
    static repositionGraceNotesAfter(segment: Segment, tracks: number): void {
        for (let track = 0; track < tracks; track++) {
            const item = segment.preAppendedItem(track)
            if (!item || !item.isGraceNotesGroup()) {
                continue
            }
            const gng = item as unknown as Chord[]
            for (const chord of gng) {
                const offset = segment.ldata().pos().x() - chord.parentItem()!.parentItem()!.ldata().pos().x()
                // Difference between the segment they "belong" and the segment they are "appended" to.
                chord.setPos(chord.ldata().pos().x() + offset, 0.0)
            }
        }
    }

    static clearLineAttachPoints(measure: Measure): void {
        for (let s = measure.first(); s; s = s.next()) {
            if (!s.isChordRestType()) {
                continue
            }
            for (const e of s.elist()) {
                if (!e || !e.isChord()) {
                    continue
                }
                const c = e as Chord
                for (const n of c.notes()) {
                    n.lineAttachPoints().length = 0
                }
                for (const ch of c.graceNotes()) {
                    for (const n of ch.notes()) {
                        n.lineAttachPoints().length = 0
                    }
                }
            }
        }
    }

    /* We perform a pre-layout of ties and glissandi to obtain the attach points and attach them to
     * the notes of the chord. Will be needed for spacing calculation, particularly to
     * enforce minTieLength. The true layout of ties and glissandi is done much later. */
    static updateLineAttachPoints(chord: Chord, isFirstInMeasure: boolean, ctx: LayoutContext): void {
        // TODO(port): glissandi, guitar bends, note lines (chord.endsNoteAnchoredLine())
        if (isFirstInMeasure) {
            for (const note of chord.notes()) {
                const tieBack = note.tieBack()
                if (tieBack && (note.incomingPartialTie() || tieBack.startNote()!.findMeasure() !== note.findMeasure())) {
                    SlurTieLayout.layoutTieBack(tieBack, note.findMeasure()!.system()!, ctx)
                }
            }
        }
        for (const note of chord.notes()) {
            const tie = note.tieFor()
            if (tie) {
                if (tie.isPartialTie()) {
                    SlurTieLayout.layoutTieFor(tie, note.findMeasure()!.system()!) // line attach points are updated here
                }
                const endNote = tie.endNote()
                if (!endNote) {
                    continue
                }
                const endNoteMeasure = endNote.findMeasure()!
                const noteMeasure = note.findMeasure()!
                if (endNoteMeasure === noteMeasure || endNoteMeasure.system() !== noteMeasure.system()) {
                    SlurTieLayout.layoutTieFor(tie, note.findMeasure()!.system()!) // line attach points are updated here
                }
            }
        }
        SlurTieLayout.layoutLaissezVibChord(chord, ctx)
    }

    static layoutChordBaseFingering(_chord: Chord, _system: System, _ctx: LayoutContext): void {
        // TODO(port): fingerings
    }

    static crossMeasureSetup(chord: Chord, on: boolean, ctx: LayoutContext): void {
        if (!on) {
            if (chord.crossMeasure() !== CrossMeasure.UNKNOWN) {
                chord.setCrossMeasure(CrossMeasure.UNKNOWN)
                ChordLayout.layoutStem(chord, ctx)
            }
            return
        }
        if (chord.crossMeasure() === CrossMeasure.UNKNOWN) {
            let tempCross = CrossMeasure.NONE // assume no cross-measure modification
            // if chord has only one note and note is tied forward
            if (chord.notes().length === 1 && chord.notes()[0].tieFor()) {
                const tiedChord = chord.notes()[0].tieFor()!.endNote()!.chord()
                // if tied note belongs to another measure and to a single-note chord
                if (tiedChord.measure() !== chord.measure() && tiedChord.notes().length === 1) {
                    // get total duration
                    const durList = toDurationList(
                        chord.actualDurationType().fraction().plus(tiedChord.actualDurationType().fraction()), true)
                    // if duration can be expressed as a single duration
                    // apply cross-measure modification
                    if (durList.length === 1) {
                        tempCross = CrossMeasure.FIRST
                        chord.setCrossMeasure(tempCross)
                        chord.setCrossMeasureDurationType(durList[0])
                        ChordLayout.layoutStem(chord, ctx)
                    }
                }
                chord.setCrossMeasure(tempCross)
                tiedChord.setCrossMeasure(tempCross === CrossMeasure.FIRST ? CrossMeasure.SECOND : CrossMeasure.NONE)
            }
        }
    }

    static layoutNote2(item: Note, ctx: LayoutContext): void {
        const chord = item.chord()
        const staff = item.staff()
        if (!staff) {
            return
        }
        const staffType = staff.staffTypeForElement(item)
        const isTabStaff = !!staffType && staffType.isTabStaff()
        // TODO(port): generated parentheses (tab tie-back, ghost notes)

        // layout dots
        const dots = chord.dots()
        if (dots && item.dots().length) {
            if (chord.slash() && !item.visible()) {
                item.setDotsHidden(true)
            }
            // if chords have notes with different mag, dots must still  align
            const correctMag = chord.notes().length > 1 ? chord.mag() : item.mag()
            let d = ctx.conf().point(ctx.conf().styleS(Sid.dotNoteDistance)) * correctMag
            let dd = ctx.conf().point(ctx.conf().styleS(Sid.dotDotDistance)) * correctMag
            let x = isTabStaff ? chord.dotPosX() - item.pos().x() : chord.dotPosX() - item.pos().x() - chord.pos().x()
            // in case of dots with different size, center-align them
            if (item.mag() !== chord.mag() && chord.notes().length > 1) {
                const relativeMag = item.mag() / chord.mag()
                const centerAlignOffset = item.dot(0).width() * (1 / relativeMag - 1) / 2
                x += centerAlignOffset
            }
            // adjust dot distance for hooks
            const hook = chord.hook()
            if (chord.up() && hook && hook.visible()) {
                const hookRight = hook.width() + hook.x() + chord.pos().x()
                const hookBottom = hook.height() + hook.y() + chord.pos().y() + (0.25 * item.spatium())
                // the top dot in the chord, not the dot for this particular note:
                const lastNote = chord.notes()[chord.notes().length - 1]
                const dotY = lastNote.y() + lastNote.dots()[0].pos().y()
                if (chord.dotPosX() < hookRight && dotY < hookBottom) {
                    d = hook.width()
                }
            }
            // if TAB and stems through staff
            if (isTabStaff && staffType.stemThrough()) {
                // with TAB's, dot Y is not calculated during layoutChords3(),
                // as layoutChords3() is not even called for TAB's;
                // setDotRelativeLine(, layoutDot) actually manages dot creation/deletion and dot Y position
                item.setDotRelativeLine(0, layoutDot)
                // use TAB default note-to-dot spacing
                dd = STAFFTYPE_TAB_DEFAULTDOTDIST_X * item.spatium()
                d = dd * 0.5
            }

            // apply to dots
            let visibleX = x + d
            let invisibleX = x
            for (const dot of item.dots()) {
                if (dot.visible()) {
                    dot.mutldata().setPosX(visibleX)
                    visibleX += dd
                } else {
                    invisibleX += (0.1 * item.spatium())
                    dot.mutldata().setPosX(invisibleX)
                    invisibleX += item.symWidth(SymId.augmentationDot) * dot.mag()
                }
            }
        }

        // layout elements attached to note
        for (const e of item.el()) {
            if (e.isSymbol()) {
                e.mutldata().setMag(item.mag())
                TLayout.layoutItem(e, ctx)
            } else if (e.isFingering()) {
                // TODO(port): fingerings
            } else {
                e.mutldata().setMag(item.mag())
                TLayout.layoutItem(e, ctx)
            }
        }

        TLayout.fillNoteShape(item)
    }

    static checkStartEndSlurs(chord: Chord, ctx: LayoutContext): void {
        Object.assign(chord.startEndSlurs(), { startUp: false, startDown: false, endUp: false, endDown: false })
        for (const spanner of chord.startingSpanners()) {
            if (!spanner.isSlur()) {
                continue
            }
            const slur = spanner as Slur
            SlurTieLayout.computeUp(slur, ctx)
            if (slur.up()) {
                chord.startEndSlurs().startUp = true
            } else {
                chord.startEndSlurs().startDown = true
            }
            // Check if end chord has been connected to this slur. If not, connect it.
            const endChord = slur.endChord()
            if (!endChord) {
                continue
            }
            endChord.addEndingSpanner(slur)
        }
        for (const spanner of chord.endingSpanners()) {
            if (!spanner.isSlur()) {
                continue
            }
            if ((spanner as Slur).up()) {
                chord.startEndSlurs().endUp = true
            } else {
                chord.startEndSlurs().endDown = true
            }
        }
    }

    static fillShape(item: ChordRest, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.CHORD:
            ChordLayout.fillChordShape(item as Chord)
            break
        case ElementType.MEASURE_REPEAT: {
            const mr = item as MeasureRepeat
            const shape = new Shape(undefined, null, ShapeType.Composite)
            shape.add(mr.numberRect(), mr)
            shape.add(mr.symBbox(mr.ldata().symId), mr)
            mr.mutldata().setShape(shape)
        } break
        default:
            RestLayout.fillShape(item as Rest, ctx.conf())
            break
        }
    }

    static chordRestShape(item: ChordRest): Shape {
        const shape = new Shape()
        for (const l of item.lyrics()) {
            if (!l || !l.addToSkyline() || l.xmlText().length === 0) {
                continue
            }
            const bbox = l.ldata().bbox().translated(l.pos())
            shape.addHorizontalSpacing(l, bbox.left(), bbox.right())
        }
        return shape
    }

    static leaveSpaceForTie(item: ArticulationT): boolean {
        const p = item.explicitParent()
        if (!p || !p.isChord()) {
            return false
        }
        const chord = item.chordRest() as Chord
        const up = item.ldata().up
        const note = up ? chord.upNote() : chord.downNote()
        const tieFor = note.tieFor()
        const tieBack = note.tieBack()

        if (!tieFor && !tieBack) {
            return false
        }

        return (!!tieFor && tieFor.up() === up && tieFor.isOuterTieOfChord(Grip.START))
               || (!!tieBack && tieBack.up() === up && tieBack.isOuterTieOfChord(Grip.END))
    }

    /** C++ fillShape(const Chord*, ChordRest::LayoutData*) */
    static fillChordShape(item: Chord): void {
        const shape = new Shape(undefined, null, ShapeType.Composite)

        const hook = item.hook()
        const stem = item.stem()
        const stemSlash = item.stemSlash()
        const tremolo = item.tremoloSingleChord()
        const arpeggio = item.arpeggio()
        const spanArpeggio = item.spanArpeggio()
        const beamlet = item.beamlet() as BeamSegment | null

        if (hook && hook.addToSkyline()) {
            shape.add(hook.shape().translate(hook.pos()))
        }
        if (stem && stem.addToSkyline()) {
            shape.add(stem.shape().translate(stem.pos()))
        }
        if (stemSlash && stemSlash.addToSkyline()) {
            shape.add(stemSlash.shape().translate(stemSlash.pos()))
        }
        if (tremolo && tremolo.addToSkyline()) {
            shape.add(tremolo.shape().translate(tremolo.pos()))
        }
        if (arpeggio && arpeggio.addToSkyline()) {
            shape.add(arpeggio.shape().translate(arpeggio.pos()))
        }
        if (spanArpeggio && !arpeggio && spanArpeggio.vStaffIdx() !== item.vStaffIdx() && spanArpeggio.addToSkyline()) {
            const spanArpPos = spanArpeggio.pos().minus(item.pagePos().minus((spanArpeggio as Arpeggio).chord()!.pagePos()))
            shape.add(spanArpeggio.shape().translate(spanArpPos))
        }
        for (const note of item.notes()) {
            shape.add(note.shape().translate(note.pos()))
        }
        // TODO(port): note parentheses
        for (const e of item.el()) {
            if (e.addToSkyline()) {
                shape.add(e.shape().translate(e.pos()))
            }
        }
        shape.add(ChordLayout.chordRestShape(item)) // add lyrics
        for (const l of item.ledgerLines()) {
            shape.add(l.shape().translate(l.pos()))
        }
        if (beamlet && stem) {
            let xPos = beamlet.line.p1().x() - stem.ldata().pos().x()
            if (beamlet.isBefore && !item.up()) {
                xPos -= stem.width()
            } else if (!beamlet.isBefore && item.up()) {
                xPos += stem.width()
            }
            shape.add(beamlet.shape().translate(new PointF(-xPos, 0.0)))
        }
        for (const a of item.articulations()) {
            if (a.isLaissezVib()) {
                shape.add(a.shape().translate(a.pos()))
            }
        }
        // TODO(port): chord parentheses

        item.mutldata().setShape(shape)
    }
}

// static Chord::combineVoice(c1, c2) (named combineVoices in TS, Chord.combineVoice() is the property getter)
function Chord_combineVoice(c1: Chord, c2: Chord): boolean {
    return c1.shouldCombineVoice() && c2.shouldCombineVoice()
}

export enum ArticulationStemSideAlign {
    STEM,
    NOTEHEAD,
    AVERAGE,
}
