/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/tdraw.h/.cpp
 *
 * Only the element types of the ported DOM are drawn; the others are skipped.
 * TODO(port): ambitus, chord lines, fret diagrams, harmony, lines (SLine segments), tremolos, MM rests,
 * measure repeats, images, tablature (frets, tab durations, tab stem slashes)
 */

import { Brush, BrushStyle, Pen, PenCapStyle, PenJoinStyle, PenStyle } from '../../../framework/draw/types/drawtypes'
import { Color } from '../../../framework/draw/types/color'
import { LineF, PointF, RectF } from '../../../framework/draw/types/geometry'
import { FillRule } from '../../../framework/draw/types/painterpath'
import type { Painter } from '../../../framework/draw/painter'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { ArpeggioType, ArticulationTextType, BarLineType, BracketType, ElementType, HookType, LineType, Orientation, SlurStyleType, VOICES } from '../../types/types'
import { Sid } from '../../style/styledef'
import { DefaultStyle } from '../../style/defaultstyle'
import { CrossMeasure } from '../../dom/chordrest'
import { Pid } from '../../dom/property'
import type { Accidental } from '../../dom/accidental'
import type { MMRest } from '../../dom/mmrest'
import type { Breath } from '../../dom/breath'
import type { Fermata } from '../../dom/fermata'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Beam } from '../../dom/beam'
import type { Box } from '../../dom/box'
import type { Bracket } from '../../dom/bracket'
import type { Clef } from '../../dom/clef'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Hook } from '../../dom/hook'
import type { KeySig } from '../../dom/keysig'
import type { LedgerLine } from '../../dom/ledgerline'
import { DisplayFretOption, type Note } from '../../dom/note'
import { prevChordRest, type Chord } from '../../dom/chord'
import type { NoteDot } from '../../dom/notedot'
import type { Rest } from '../../dom/rest'
import type { SlurTieSegment } from '../../dom/slurtie'
import type { SlurSegment } from '../../dom/slur'
import type { StaffLines } from '../../dom/stafflines'
import type { Stem } from '../../dom/stem'
import type { StemSlash } from '../../dom/stemslash'
import type { Symbol as SymbolItem } from '../../dom/symbol'
import type { TextBase, TextBlock, TextFragment } from '../../dom/textbase'
import type { TieSegment } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { PaintOptions } from '../paintoptions'
import type { HairpinSegment } from '../../dom/hairpin'
import type { SLine } from '../../dom/line'
import type { LyricsLineSegment } from '../../dom/lyricsline'
import type { TextLineBaseSegment } from '../../dom/textlinebase'
import { TabBeamGrid, type TabDurationSymbol } from '../../dom/tabdurationsymbol'
import { TablatureSymbolRepeat } from '../../dom/stafftype'
import { ChordSymbolParen, TextSegment, type Harmony } from '../../dom/harmony'
import type { Parenthesis } from '../../dom/parenthesis'
import { FretDotType, FretMarkerType, type FretDiagram } from '../../dom/fret'
import { AlignmentFlag } from '../../../framework/draw/types/drawtypes'
import type { TrillSegment } from '../../dom/trill'
import type { Arpeggio } from '../../dom/arpeggio'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { LaissezVibSegment } from '../../dom/laissezvib'

const NOTE_BACKGROUND_COLOR = Color.WHITE

export class TDraw {
    static drawItem(item: EngravingItem, painter: Painter, opt: PaintOptions): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TDraw.drawAccidental(item as Accidental, painter, opt)
            break
        case ElementType.ARTICULATION:
        case ElementType.ORNAMENT:
            TDraw.drawArticulation(item as Articulation, painter, opt)
            break
        case ElementType.BAR_LINE: TDraw.drawBarLine(item as BarLine, painter, opt)
            break
        case ElementType.BEAM: TDraw.drawBeam(item as Beam, painter, opt)
            break
        case ElementType.HBOX:
        case ElementType.VBOX:
        case ElementType.TBOX:
        case ElementType.FBOX: TDraw.drawBox(item as Box, painter, opt)
            break
        case ElementType.BRACKET: TDraw.drawBracket(item as Bracket, painter, opt)
            break
        case ElementType.CLEF: TDraw.drawClef(item as Clef, painter, opt)
            break
        case ElementType.HOOK: TDraw.drawHook(item as Hook, painter, opt)
            break
        case ElementType.KEYSIG: TDraw.drawKeySig(item as KeySig, painter, opt)
            break
        case ElementType.LAYOUT_BREAK: // not printable
        case ElementType.SPACER:
            break
        case ElementType.LEDGER_LINE: TDraw.drawLedgerLine(item as LedgerLine, painter, opt)
            break
        case ElementType.ARPEGGIO: TDraw.drawArpeggio(item as Arpeggio, painter, opt)
            break
        case ElementType.TREMOLO_SINGLECHORD: TDraw.drawTremoloSingleChord(item as TremoloSingleChord, painter, opt)
            break
        case ElementType.TREMOLO_TWOCHORD: TDraw.drawTremoloTwoChord(item as TremoloTwoChord, painter, opt)
            break
        case ElementType.FRET_DIAGRAM: TDraw.drawFretDiagram(item as FretDiagram, painter, opt)
            break
        case ElementType.HARMONY: TDraw.drawHarmony(item as Harmony, painter, opt)
            break
        case ElementType.PARENTHESIS: TDraw.drawParenthesis(item as Parenthesis, painter, opt)
            break
        case ElementType.TAB_DURATION_SYMBOL: TDraw.drawTabDurationSymbol(item as TabDurationSymbol, painter, opt)
            break
        case ElementType.NOTE: TDraw.drawNote(item as Note, painter, opt)
            break
        case ElementType.NOTEDOT: TDraw.drawNoteDot(item as NoteDot, painter, opt)
            break
        case ElementType.REST: TDraw.drawRest(item as Rest, painter, opt)
            break
        case ElementType.MMREST: TDraw.drawMMRest(item as MMRest, painter, opt)
            break
        case ElementType.TRILL_SEGMENT: {
            const ts = item as TrillSegment
            painter.setPen(ts.spanner().curColor(opt))
            ts.drawSymbols(ts.symbols(), painter)
            break
        }
        case ElementType.HAIRPIN_SEGMENT: TDraw.drawHairpinSegment(item as HairpinSegment, painter, opt)
            break
        case ElementType.TEXTLINE_SEGMENT:
        case ElementType.VOLTA_SEGMENT:
        case ElementType.OTTAVA_SEGMENT:
        case ElementType.PEDAL_SEGMENT:
        case ElementType.LET_RING_SEGMENT:
        case ElementType.PALM_MUTE_SEGMENT:
            TDraw.drawTextLineBaseSegment(item as TextLineBaseSegment, painter, opt)
            break
        case ElementType.LYRICSLINE_SEGMENT: TDraw.drawLyricsLineSegment(item as LyricsLineSegment, painter, opt)
            break
        case ElementType.SLUR_SEGMENT: TDraw.drawSlurSegment(item as SlurSegment, painter, opt)
            break
        case ElementType.STAFF_LINES: TDraw.drawStaffLines(item as StaffLines, painter, opt)
            break
        case ElementType.STEM: TDraw.drawStem(item as Stem, painter, opt)
            break
        case ElementType.STEM_SLASH: TDraw.drawStemSlash(item as StemSlash, painter, opt)
            break
        case ElementType.SYMBOL: TDraw.drawSymbol(item as SymbolItem, painter, opt)
            break
        case ElementType.LAISSEZ_VIB_SEGMENT: TDraw.drawLaissezVibSegment(item as LaissezVibSegment, painter, opt)
            break
        case ElementType.TIE_SEGMENT: TDraw.drawTieSegment(item as TieSegment, painter, opt)
            break
        case ElementType.TIMESIG: TDraw.drawTimeSig(item as TimeSig, painter, opt)
            break
        case ElementType.TUPLET: TDraw.drawTuplet(item as Tuplet, painter, opt)
            break
        case ElementType.FERMATA:
            painter.setPen(item.curColor(opt))
            item.drawSymbol((item as Fermata).symId(), painter)
            break
        case ElementType.BREATH:
            painter.setPen(item.curColor(opt))
            item.drawSymbol((item as Breath).symId(), painter)
            break
        case ElementType.TEXT:
        case ElementType.INSTRUMENT_NAME:
        case ElementType.LYRICS:
        case ElementType.MEASURE_NUMBER:
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION:
        case ElementType.STAFF_TEXT:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TEMPO_TEXT:
        case ElementType.REHEARSAL_MARK:
        case ElementType.MARKER:
        case ElementType.JUMP:
            TDraw.drawTextBase(item as TextBase, painter, opt)
            break
        default:
            // PAGE, SYSTEM, MEASURE, SEGMENT, CHORD, ... and types not ported yet
            break
        }
    }

    static drawAccidental(item: Accidental, painter: Painter, opt: PaintOptions): void {
        painter.setPen(item.curColor(opt))
        for (const e of item.ldata().syms) {
            item.drawSymbol(e.sym, painter, new PointF(e.x, e.y))
        }
    }

    static drawArticulation(item: Articulation, painter: Painter, opt: PaintOptions): void {
        painter.setPen(item.curColor(opt))
        if (item.textType() === ArticulationTextType.NO_TEXT) {
            item.drawSymbol(item.symId(), painter)
        } else if (item.text()) {
            TDraw.drawTextBase(item.text()!, painter, opt)
        }
    }

    private static drawDots(item: BarLine, painter: Painter, x: number): void {
        const spatium = item.spatium()
        let y1l: number
        let y2l: number
        if (!item.explicitParent()) { // for use in palette (always Bravura)
            //Bravura shifted repeatDot symbol 0.5sp upper in the font itself (1.272)
            y1l = 1.5 * spatium
            y2l = 2.5 * spatium
        } else {
            const st = item.staffType()!
            const lines = st.lines()
            const lineDistance = st.lineDistance().val() * spatium
            y1l = (Math.trunc((lines - 1) / 2) - 0.5) * lineDistance
            y2l = (Math.trunc(lines / 2) + 0.5) * lineDistance
            //adjust for staffType offset
            const stYOffset = item.staffOffsetY()
            y1l += stYOffset
            y2l += stYOffset
        }
        item.drawSymbol(SymId.repeatDot, painter, new PointF(x, y1l))
        item.drawSymbol(SymId.repeatDot, painter, new PointF(x, y2l))
    }

    private static drawTips(item: BarLine, painter: Painter, reversed: boolean, x: number): void {
        const data = item.ldata()
        if (reversed) {
            if (item.isTop()) {
                item.drawSymbol(SymId.reversedBracketTop, painter, new PointF(x - item.symWidth(SymId.reversedBracketTop), data.y1))
            }
            if (item.isBottom()) {
                item.drawSymbol(SymId.reversedBracketBottom, painter, new PointF(x - item.symWidth(SymId.reversedBracketBottom), data.y2))
            }
        } else {
            if (item.isTop()) {
                item.drawSymbol(SymId.bracketTop, painter, new PointF(x, data.y1))
            }
            if (item.isBottom()) {
                item.drawSymbol(SymId.bracketBottom, painter, new PointF(x, data.y2))
            }
        }
    }

    static drawBarLine(item: BarLine, painter: Painter, opt: PaintOptions): void {
        const data = item.ldata()
        painter.save()
        TDraw.setMask(item, painter)

        const style = item.style()
        const mag = item.mag()
        const color = item.curColor(opt)
        const pen = (lw: number, s = PenStyle.SolidLine): Pen => new Pen(color, lw, s, PenCapStyle.FlatCap)
        const vline = (x: number): void => painter.drawLine(new LineF(x, data.y1, x, data.y2))

        switch (item.barLineType()) {
        case BarLineType.NORMAL: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw))
            vline(lw * 0.5)
        }
            break
        case BarLineType.BROKEN: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw, PenStyle.DashLine))
            vline(lw * 0.5)
        }
            break
        case BarLineType.DOTTED: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw, PenStyle.DotLine))
            vline(lw * 0.5)
        }
            break
        case BarLineType.END: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw))
            let x = lw * 0.5
            vline(x)
            const lw2 = style.styleMM(Sid.endBarWidth) * mag
            painter.setPen(pen(lw2))
            x += ((lw * 0.5) + style.styleMM(Sid.endBarDistance) + (lw2 * 0.5)) * mag
            vline(x)
        }
            break
        case BarLineType.DOUBLE: {
            const lw = style.styleMM(Sid.doubleBarWidth) * mag
            painter.setPen(pen(lw))
            let x = lw * 0.5
            vline(x)
            x += ((lw * 0.5) + style.styleMM(Sid.doubleBarDistance) + (lw * 0.5)) * mag
            vline(x)
        }
            break
        case BarLineType.REVERSE_END: {
            const lw = style.styleMM(Sid.endBarWidth) * mag
            painter.setPen(pen(lw))
            let x = lw * 0.5
            vline(x)
            const lw2 = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw2))
            x += ((lw * 0.5) + style.styleMM(Sid.endBarDistance) + (lw2 * 0.5)) * mag
            vline(x)
        }
            break
        case BarLineType.HEAVY: {
            const lw = style.styleMM(Sid.endBarWidth) * mag
            painter.setPen(pen(lw))
            vline(lw * 0.5)
        }
            break
        case BarLineType.DOUBLE_HEAVY: {
            const lw2 = style.styleMM(Sid.endBarWidth) * mag
            painter.setPen(pen(lw2))
            let x = lw2 * 0.5
            vline(x)
            x += ((lw2 * 0.5) + style.styleMM(Sid.endBarDistance) + (lw2 * 0.5)) * mag
            vline(x)
        }
            break
        case BarLineType.START_REPEAT: {
            const lw2 = style.styleMM(Sid.endBarWidth) * mag
            painter.setPen(pen(lw2))
            let x = lw2 * 0.5
            vline(x)
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw))
            x += ((lw2 * 0.5) + style.styleMM(Sid.endBarDistance) + (lw * 0.5)) * mag
            vline(x)
            x += ((lw * 0.5) + style.styleMM(Sid.repeatBarlineDotSeparation)) * mag
            TDraw.drawDots(item, painter, x)
            if (style.styleB(Sid.repeatBarTips)) {
                TDraw.drawTips(item, painter, false, 0.0)
            }
        }
            break
        case BarLineType.END_REPEAT: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw))
            let x = 0.0
            TDraw.drawDots(item, painter, x)
            x += item.symBbox(SymId.repeatDot).width()
            x += (style.styleMM(Sid.repeatBarlineDotSeparation) + (lw * 0.5)) * mag
            vline(x)
            const lw2 = style.styleMM(Sid.endBarWidth) * mag
            x += ((lw * 0.5) + style.styleMM(Sid.endBarDistance) + (lw2 * 0.5)) * mag
            painter.setPen(pen(lw2))
            vline(x)
            if (style.styleB(Sid.repeatBarTips)) {
                TDraw.drawTips(item, painter, true, x + lw2 * 0.5)
            }
        }
            break
        case BarLineType.END_START_REPEAT: {
            const lw = style.styleMM(Sid.barWidth) * mag
            painter.setPen(pen(lw))
            let x = 0.0
            TDraw.drawDots(item, painter, x)
            x += item.symBbox(SymId.repeatDot).width()
            x += (style.styleMM(Sid.repeatBarlineDotSeparation) + (lw * 0.5)) * mag
            vline(x)
            const lw2 = style.styleMM(Sid.endBarWidth) * mag
            x += ((lw * 0.5) + style.styleMM(Sid.endBarDistance) + (lw2 * 0.5)) * mag
            painter.setPen(pen(lw2))
            vline(x)
            if (style.styleB(Sid.repeatBarTips)) {
                TDraw.drawTips(item, painter, true, x + lw2 * 0.5)
            }
            painter.setPen(pen(lw))
            x += ((lw2 * 0.5) + style.styleMM(Sid.endBarDistance) + (lw * 0.5)) * mag
            vline(x)
            x += ((lw * 0.5) + style.styleMM(Sid.repeatBarlineDotSeparation)) * mag
            TDraw.drawDots(item, painter, x)
            if (style.styleB(Sid.repeatBarTips)) {
                TDraw.drawTips(item, painter, false, 0.0)
            }
        }
            break
        }
        // TODO(port): irregular measure marks (not printed)
        painter.restore()
    }

    static drawBeam(item: Beam, painter: Painter, opt: PaintOptions): void {
        const segments = item.beamSegments()
        if (segments.length === 0) {
            return
        }
        painter.setBrush(new Brush(item.curColor(opt)))
        painter.setNoPen()

        // make beam thickness independent of slant
        // (expression can be simplified?)
        const bs = segments[0].line
        let d = Math.abs(bs.y2() - bs.y1()) / (bs.x2() - bs.x1())
        if (segments.length > 1 && d > Math.PI / 6.0) {
            d = Math.PI / 6.0
        }
        const ww = (item.beamWidth() / 2.0) / Math.sin(Math.PI / 2 - Math.atan(d))

        for (const bs1 of segments) {
            const l = bs1.line
            painter.drawPolygon([
                new PointF(l.x1(), l.y1() - ww),
                new PointF(l.x2(), l.y2() - ww),
                new PointF(l.x2(), l.y2() + ww),
                new PointF(l.x1(), l.y1() + ww),
            ], FillRule.OddEvenFill)
        }
    }

    static drawBox(_item: Box, _painter: Painter, opt: PaintOptions): void {
        if (opt.isPrinting) {
            return
        }
        // TODO(port): frames are only drawn when selected or "show frames" is on (editing only)
    }

    static drawBracket(item: Bracket, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        switch (item.bracketType()) {
        case BracketType.BRACE: {
            if (ldata.braceSymbol === SymId.noSym) {
                painter.setNoPen()
                painter.setBrush(new Brush(item.curColor(opt)))
                painter.drawPath(ldata.path)
            } else {
                const h = ldata.bracketHeight
                const glyphHeight = item.symHeight(ldata.braceSymbol)
                const mag = h / glyphHeight
                painter.setPen(item.curColor(opt))
                painter.save()
                painter.scale(item.magx(), mag)
                item.drawSymbol(ldata.braceSymbol, painter, new PointF(0.0, glyphHeight))
                painter.restore()
            }
        }
            break
        case BracketType.NORMAL: {
            const h = ldata.bracketHeight
            const spatium = item.spatium()
            const w = item.style().styleMM(Sid.bracketWidth)
            const bd = (item.style().styleSt(Sid.musicalSymbolFont) === 'Leland') ? spatium * 0.5 : spatium * 0.25
            painter.setPen(new Pen(item.curColor(opt), w, PenStyle.SolidLine, PenCapStyle.FlatCap))
            painter.drawLine(new LineF(0.0, -bd - w * 0.5, 0.0, h + bd + w * 0.5))
            const x = -w * 0.5
            const y1 = -bd
            const y2 = h + bd
            item.drawSymbol(SymId.bracketTop, painter, new PointF(x, y1))
            item.drawSymbol(SymId.bracketBottom, painter, new PointF(x, y2))
        }
            break
        case BracketType.SQUARE: {
            const h = ldata.bracketHeight
            const lineW = item.style().styleMM(Sid.staffLineWidth)
            const bracketWidth = ldata.bracketWidth - lineW / 2
            painter.setPen(new Pen(item.curColor(opt), lineW, PenStyle.SolidLine, PenCapStyle.FlatCap))
            painter.drawLine(new LineF(0.0, 0.0, 0.0, h))
            painter.drawLine(new LineF(-lineW / 2, 0.0, lineW / 2 + bracketWidth, 0.0))
            painter.drawLine(new LineF(-lineW / 2, h, lineW / 2 + bracketWidth, h))
        }
            break
        case BracketType.LINE: {
            const h = ldata.bracketHeight
            const w = 0.67 * item.style().styleMM(Sid.bracketWidth)
            painter.setPen(new Pen(item.curColor(opt), w, PenStyle.SolidLine, PenCapStyle.FlatCap))
            const bd = item.style().styleMM(Sid.staffLineWidth) * 0.5
            painter.drawLine(new LineF(0.0, -bd, 0.0, h + bd))
        }
            break
        case BracketType.NO_BRACKET:
            break
        }
    }

    static drawClef(item: Clef, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        if (ldata.symId === SymId.noSym || (item.staff() && !item.staff()!.staffType(item.tick()).genClef())) {
            return
        }
        painter.setPen(item.curColor(opt))
        item.drawSymbol(ldata.symId, painter)
    }

    static drawHook(item: Hook, painter: Painter, opt: PaintOptions): void {
        // hide if belonging to the second chord of a cross-measure pair
        if (item.chord() && item.chord()!.crossMeasure() === CrossMeasure.SECOND) {
            return
        }
        painter.setPen(item.curColor(opt))
        item.drawSymbol(item.sym(), painter)
    }

    static drawKeySig(item: KeySig, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        painter.setPen(item.curColor(opt))
        const _spatium = item.spatium()
        const st = item.staff() ? item.staff()!.staffTypeForElement(item) : null
        const step = _spatium * (st ? st.lineDistance().val() * 0.5 : 0.5)
        const lines = st ? st.lines() : 5
        const ledgerLineWidth = item.style().styleMM(Sid.ledgerLineWidth) * item.mag()
        const ledgerExtraLen = item.style().styleS(Sid.ledgerLineLength).val() * _spatium
        for (const ks of ldata.keySymbols) {
            const x = ks.xPos * _spatium
            let y = ks.line * step
            item.drawSymbol(ks.sym, painter, new PointF(x, y))
            // ledger lines
            const _symWidth = item.symWidth(ks.sym)
            const x1 = x - ledgerExtraLen
            const x2 = x + _symWidth + ledgerExtraLen
            painter.setPen(new Pen(item.curColor(opt), ledgerLineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap))
            for (let i = -2; i >= ks.line; i -= 2) { // above
                y = i * step
                painter.drawLine(new LineF(x1, y, x2, y))
            }
            for (let i = lines * 2; i <= ks.line; i += 2) { // below
                y = i * step
                painter.drawLine(new LineF(x1, y, x2, y))
            }
        }
    }

    static drawLedgerLine(item: LedgerLine, painter: Painter, opt: PaintOptions): void {
        if (item.chord().crossMeasure() === CrossMeasure.SECOND) {
            return
        }
        const ldata = item.ldata()
        painter.setPen(new Pen(item.curColor(opt), ldata.lineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap))
        if (item.vertical()) {
            painter.drawLine(new LineF(0.0, 0.0, 0.0, item.len()))
        } else {
            painter.drawLine(new LineF(0.0, 0.0, item.len(), 0.0))
        }
    }

    static drawNote(item: Note, painter: Painter, opt: PaintOptions): void {
        if (item.hidden()) {
            return
        }
        const ldata = item.ldata()
        const staffType = item.staff() ? item.staff()!.staffTypeForElement(item) : null
        const isTabStaff = !!staffType && staffType.isTabStaff()

        // TODO(port): negative frets (configuration()->negativeFretsAllowed() is off by default)
        painter.setPen(item.curColor(opt))

        // tablature
        if (isTabStaff) {
            if (item.displayFret() === DisplayFretOption.Hide || item.shouldHideFret()) {
                return
            }
            const st = item.staff()!
            const tab = st.staffTypeForElement(item)

            // TODO(port): fret conflict marks (shown only when showUnprintable is set and not printing)

            const f = tab.fretFont().clone()
            f.setPointSizeF(f.pointSizeF() * item.magS())
            painter.setFont(f)

            const startPosX = ldata.bbox().x()
            const yOffset = tab.fretFontYOffset()
            painter.drawText(new PointF(startPosX, yOffset * item.magS()), item.fretString())
            return
        }
        // skip drawing, if second note of a cross-measure value
        if (item.chord() && item.chord().crossMeasure() === CrossMeasure.SECOND) {
            return
        }
        // TODO(port): pitch range / harp pedal warnings (not printed)

        // draw blank notehead to avoid staff and ledger lines
        if (ldata.cachedSymNull !== SymId.noSym) {
            painter.save()
            painter.setPen(NOTE_BACKGROUND_COLOR)
            item.drawSymbol(ldata.cachedSymNull, painter)
            painter.restore()
        }
        item.drawSymbol(ldata.cachedNoteheadSym, painter)
    }

    static drawTremoloSingleChord(item: TremoloSingleChord, painter: Painter, opt: PaintOptions): void {
        if (item.isBuzzRoll()) {
            painter.setPen(new Pen(item.curColor(opt)))
            item.drawSymbol(SymId.buzzRoll, painter)
        } else {
            painter.setBrush(new Brush(item.curColor(opt)))
            painter.setNoPen()
            painter.drawPath(item.path())
        }
    }

    static drawTremoloTwoChord(item: TremoloTwoChord, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        const segments = item.beamSegments()

        if (segments.length) {
            // two-note trems act like beams

            // make beam thickness independent of slant
            // (expression can be simplified?)
            const bs = segments[0].line
            let d = Math.abs(bs.y2() - bs.y1()) / (bs.x2() - bs.x1())
            if (segments.length > 1 && d > Math.PI / 6.0) {
                d = Math.PI / 6.0
            }
            const ww = (ldata.beamWidth / 2.0) / Math.sin(Math.PI / 2 - Math.atan(d))
            painter.setBrush(new Brush(item.curColor(opt)))
            painter.setNoPen()
            for (const bs1 of segments) {
                const l = bs1.line
                painter.drawPolygon([
                    new PointF(l.x1(), l.y1() - ww),
                    new PointF(l.x2(), l.y2() - ww),
                    new PointF(l.x2(), l.y2() + ww),
                    new PointF(l.x1(), l.y1() + ww),
                ], FillRule.OddEvenFill)
            }
        }
    }

    static drawArpeggio(item: Arpeggio, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()

        const y1 = ldata.bbox().top()
        const y2 = ldata.bbox().bottom()
        const lineWidth = item.style().styleMM(Sid.arpeggioLineWidth)

        painter.setPen(new Pen(item.curColor(opt), lineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap))
        painter.save()

        switch (item.arpeggioType()) {
        case ArpeggioType.NORMAL:
        case ArpeggioType.UP: {
            const r = ldata.symsBBox
            painter.rotate(-90.0)
            item.drawSymbols(ldata.symbols, painter, new PointF(-r.right() - y1, -r.bottom() + r.height()))
        } break

        case ArpeggioType.DOWN: {
            const r = ldata.symsBBox
            painter.rotate(90.0)
            item.drawSymbols(ldata.symbols, painter, new PointF(-r.left() + y1, -r.top() - r.height()))
        } break

        case ArpeggioType.UP_STRAIGHT: {
            const r = ldata.symsBBox
            const x1 = item.spatium() * 0.5
            item.drawSymbol(SymId.arrowheadBlackUp, painter, new PointF(x1 - r.width() * 0.5, y1 - r.top()))
            const ny1 = y1 - r.top() * 0.5
            painter.drawLine(new LineF(x1, ny1, x1, y2))
        } break

        case ArpeggioType.DOWN_STRAIGHT: {
            const r = ldata.symsBBox
            const x1 = item.spatium() * 0.5
            item.drawSymbol(SymId.arrowheadBlackDown, painter, new PointF(x1 - r.width() * 0.5, y2 - r.bottom()))
            const ny2 = y2 + r.top() * 0.5
            painter.drawLine(new LineF(x1, y1, x1, ny2))
        } break

        case ArpeggioType.BRACKET: {
            const w = item.style().styleS(Sid.arpeggioHookLen).val() * item.spatium()
            painter.drawLine(new LineF(0.0, y1, w, y1))
            painter.drawLine(new LineF(0.0, y2, w, y2))
            painter.drawLine(new LineF(0.0, y1 - lineWidth / 2, 0.0, y2 + lineWidth / 2))
        } break
        }
        painter.restore()
    }

    static drawFretDiagram(item: FretDiagram, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        const translation = new PointF(ldata.stringDist * (item.strings() - 1), 0).times(-1)
        if (item.orientation() === Orientation.HORIZONTAL) {
            painter.save()
            painter.rotate(-90)
            painter.translate(translation)
        }

        // Init pen and other values
        const pen = new Pen(item.curColor(opt))
        pen.setCapStyle(PenCapStyle.FlatCap)
        painter.setBrush(new Brush(painter.pen().color()))

        // x2 is the x val of the rightmost string
        const x2 = (item.strings() - 1) * ldata.stringDist

        // Draw the nut
        pen.setWidthF(ldata.nutLineWidth)
        painter.setPen(pen)
        const nutY = ldata.nutY
        painter.drawLine(new LineF(-ldata.stringLineWidth * 0.5, nutY, x2 + ldata.stringLineWidth * 0.5, nutY))

        // Draw strings and frets
        pen.setWidthF(ldata.stringLineWidth)
        painter.setPen(pen)

        // y2 is the y val of the bottom fretline
        const y1 = ldata.stringExtendTop
        const y2 = ldata.fretDist * item.frets() + 0.5 * ldata.stringLineWidth + ldata.stringExtendBottom
        for (let i = 0; i < item.strings(); ++i) {
            const x = ldata.stringDist * i
            painter.drawLine(new LineF(x, y1, x, y2))
        }
        for (let i = 1; i <= item.frets(); ++i) {
            const y = ldata.fretDist * i
            painter.drawLine(new LineF(0.0, y, x2, y))
        }

        // dotd is the diameter of a dot
        const dotd = ldata.dotDiameter

        // Draw dots, sym pen is used to draw them (and markers)
        const symPen = pen.clone()
        symPen.setCapStyle(PenCapStyle.FlatCap)
        const symPenWidth = ldata.stringLineWidth * 1.2
        symPen.setWidthF(symPenWidth)

        for (const [string, dots] of item.dots()) {
            for (const d of dots) {
                if (!d.exists()) {
                    continue
                }

                const fret = d.fret - 1

                // Calculate coords of the top left corner of the dot
                const x = ldata.stringDist * string - dotd * 0.5
                const y = ldata.fretDist * fret + ldata.fretDist * 0.5 - dotd * 0.5

                // Draw different symbols
                painter.setPen(symPen)
                switch (d.dtype) {
                case FretDotType.CROSS:
                    // Give the cross a slightly larger width
                    symPen.setWidthF(symPenWidth * 1.5)
                    painter.setPen(symPen)
                    painter.drawLine(new LineF(x, y, x + dotd, y + dotd))
                    painter.drawLine(new LineF(x + dotd, y, x, y + dotd))
                    symPen.setWidthF(symPenWidth)
                    break
                case FretDotType.SQUARE:
                    painter.setBrush(BrushStyle.NoBrush)
                    painter.drawRect(new RectF(x, y, dotd, dotd))
                    break
                case FretDotType.TRIANGLE:
                    painter.drawLine(new LineF(x, y + dotd, x + 0.5 * dotd, y))
                    painter.drawLine(new LineF(x + 0.5 * dotd, y, x + dotd, y + dotd))
                    painter.drawLine(new LineF(x + dotd, y + dotd, x, y + dotd))
                    break
                case FretDotType.NORMAL:
                default:
                    painter.setBrush(new Brush(symPen.color()))
                    painter.setNoPen()
                    painter.drawEllipse(new RectF(x, y, dotd, dotd))
                    break
                }
            }
        }

        // Draw markers
        symPen.setWidthF(ldata.stringLineWidth * 1.2)
        painter.setBrush(BrushStyle.NoBrush)
        painter.setPen(symPen)
        for (const [string, marker] of item.markers()) {
            if (!marker.exists()) {
                continue
            }

            const x = ldata.stringDist * string - ldata.markerSize * 0.5
            const y = ldata.markerY
            if (marker.mtype === FretMarkerType.CIRCLE) {
                painter.drawEllipse(new RectF(x, y, ldata.markerSize, ldata.markerSize))
            } else if (marker.mtype === FretMarkerType.CROSS) {
                painter.drawLine(new PointF(x, y), new PointF(x + ldata.markerSize, y + ldata.markerSize))
                painter.drawLine(new PointF(x, y + ldata.markerSize), new PointF(x + ldata.markerSize, y))
            }
        }

        // Draw barres
        for (const [fret, barre] of item.barres()) {
            const startString = barre.startString
            const endString = barre.endString

            const x1 = ldata.stringDist * startString
            const newX2 = endString === -1 ? x2 : ldata.stringDist * endString
            const y = ldata.fretDist * (fret - 1) + ldata.fretDist * 0.5
            if (item.style().styleB(Sid.barreAppearanceSlur)) {
                pen.setWidthF(0.25 * ldata.stringLineWidth)
                pen.setCapStyle(PenCapStyle.RoundCap)
                pen.setJoinStyle(PenJoinStyle.RoundJoin)
                painter.setPen(pen)
                painter.setBrush(new Brush(pen.color()))
                for (const path of ldata.slurPaths) {
                    painter.drawPath(path)
                }
            } else {
                pen.setWidthF(dotd * item.style().styleD(Sid.barreLineWidth))
                pen.setCapStyle(PenCapStyle.RoundCap)
                painter.setPen(pen)
                painter.drawLine(new LineF(x1, y, newX2, y))
            }
        }

        // Draw fret offset number
        if (item.fretOffset() > 0) {
            const scaledFont = item.fretNumFont()
            scaledFont.setPointSizeF(scaledFont.pointSizeF() * (item.spatium() / item.defaultSpatium()))
            painter.setFont(scaledFont)
            const text = ldata.fretText
            const A = AlignmentFlag

            if (item.orientation() === Orientation.VERTICAL) {
                if (item.numPos() === 0) {
                    painter.drawTextInRect(new RectF(-ldata.fretNumPadding, 0.0, 0.0, ldata.fretDist),
                        A.AlignVCenter | A.AlignRight | A.TextDontClip, text)
                } else {
                    painter.drawTextInRect(new RectF(x2 + ldata.fretNumPadding, 0.0, 0.0, ldata.fretDist),
                        A.AlignVCenter | A.AlignLeft | A.TextDontClip, text)
                }
            } else if (item.orientation() === Orientation.HORIZONTAL) {
                painter.save()
                painter.translate(translation.times(-1))
                painter.rotate(90)
                if (item.numPos() === 0) {
                    painter.drawTextInRect(new RectF(0.0, ldata.stringDist * (item.strings() - 1), 0.0, 0.0),
                        A.AlignLeft | A.TextDontClip, text)
                } else {
                    painter.drawTextInRect(new RectF(0.0, 0.0, 0.0, 0.0), A.AlignBottom | A.AlignLeft | A.TextDontClip, text)
                }
                painter.restore()
            }
            painter.setFont(item.fretNumFont())
        }

        for (const fingeringItem of ldata.fingeringItems) {
            painter.save()

            const scaledFont = item.fingeringFont()
            scaledFont.setPointSizeF(scaledFont.pointSizeF() * (item.spatium() / item.defaultSpatium()))
            painter.setFont(scaledFont)
            if (item.orientation() === Orientation.HORIZONTAL) {
                painter.translate(translation.times(-1))
                painter.rotate(90)
            }

            painter.drawText(fingeringItem.pos, fingeringItem.fingerNumber)

            painter.restore()
        }

        if (item.orientation() === Orientation.HORIZONTAL) {
            painter.restore()
        }
    }

    static drawHarmony(item: Harmony, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()

        if (ldata.renderItemList.length === 0) {
            TDraw.drawTextBase(item, painter, opt)
            return
        }

        if (item.hasFrame()) {
            if (!RealIsNull(item.frameWidth().val())) {
                const color = item.frameColor()
                const pen = new Pen(color, item.frameWidth().val() * item.spatium(), PenStyle.SolidLine,
                    PenCapStyle.SquareCap, PenJoinStyle.MiterJoin)
                painter.setPen(pen)
            } else {
                painter.setNoPen()
            }
            const bg = item.bgColor()
            painter.setBrush(bg.alpha() ? new Brush(bg) : BrushStyle.NoBrush)
            if (item.circle()) {
                painter.drawArc(ldata.frame, 0, 5760)
            } else {
                const baseSpatium = DefaultStyle.baseStyle().styleD(Sid.spatium)
                const frameRadius = item.frameRound().val() * (item.sizeIsSpatiumDependent() ? item.spatium() : baseSpatium)
                painter.drawRoundedRect(ldata.frame, frameRadius, frameRadius)
            }
        }
        painter.setBrush(BrushStyle.NoBrush)
        const color = item.textColor(opt)
        painter.setPen(color)
        for (const renderItem of ldata.renderItemList) {
            if (renderItem instanceof TextSegment) {
                painter.setFont(renderItem.font())
                painter.drawText(renderItem.pos(), renderItem.text())
            } else if (renderItem instanceof ChordSymbolParen) {
                const p = renderItem.parenItem
                painter.translate(renderItem.pos())
                TDraw.drawParenthesis(p, painter, opt)
                painter.translate(renderItem.pos().times(-1))
            }
        }

        if (item.isPolychord()) {
            const pen = painter.pen().clone()
            pen.setWidthF(item.style().styleS(Sid.polychordDividerThickness).val() * item.spatium())
            pen.setColor(color)
            painter.setPen(pen)
            for (const line of ldata.polychordDividerLines) {
                painter.drawLine(line.translated(new PointF(0.0, ldata.polychordDividerOffset)))
            }
        }
    }

    static drawParenthesis(item: Parenthesis, painter: Painter, opt: PaintOptions): void {
        const parent = item.parentItem()
        const parentTs = parent && parent.isTimeSig() ? parent as TimeSig : null

        if (parentTs && !parentTs.showOnThisStaff()) {
            return
        }

        const penColor = item.curColor(opt)
        const pen = new Pen(penColor)
        const ldata = item.ldata()

        if (ldata.symId !== SymId.noSym) {
            painter.setPen(pen)
            item.drawSymbol(ldata.symId, painter, new PointF(), ldata.symScale)
            return
        }

        painter.setBrush(new Brush(pen.color()))
        pen.setCapStyle(PenCapStyle.RoundCap)
        pen.setJoinStyle(PenJoinStyle.RoundJoin)
        pen.setWidthF(ldata.endPointThickness * item.spatium() * ldata.intrinsicMag)

        painter.setPen(pen)
        painter.drawPath(ldata.path)
    }

    static drawTabDurationSymbol(item: TabDurationSymbol, painter: Painter, opt: PaintOptions): void {
        const tab = item.tab()
        if (!tab) {
            return
        }

        const ldata = item.ldata()

        if (item.isRepeat() && (tab.symRepeat() === TablatureSymbolRepeat.SYSTEM)) {
            const chord = item.explicitParent() as Chord
            const prevCR = prevChordRest(chord)
            if (prevCR && (chord.measure()!.system() === prevCR.measure()!.system())) {
                return
            }
        }

        const mag = item.magS()
        const imag = 1.0 / mag

        const pen = new Pen(item.curColor(opt))
        painter.setPen(pen)
        painter.scale(mag, mag)
        if (ldata.beamGrid === TabBeamGrid.NONE) {
            // if no beam grid, draw symbol
            painter.setFont(tab.durationFont())
            painter.drawText(new PointF(0.0, 0.0), item.text())
        } else {
            // if beam grid, draw stem line
            const _spatium = item.spatium()
            pen.setCapStyle(PenCapStyle.FlatCap)
            pen.setWidthF(tab.gridStemWidth() * _spatium)
            painter.setPen(pen)
            // take stem height from bbox, but de-magnify it, as drawing is already magnified
            let h = ldata.bbox().y() / mag
            painter.drawLine(new PointF(0.0, h), new PointF(0.0, 0.0))
            // if beam grid is medial/final, draw beam lines too: lines go from mid of
            // previous stem (delta x stored in _beamLength) to mid of this' stem (0.0)
            if (ldata.beamGrid === TabBeamGrid.MEDIALFINAL) {
                pen.setWidthF(tab.gridBeamWidth() * _spatium)
                painter.setPen(pen)
                // lower height available to beams by half a beam width,
                // so that top beam upper border aligns with stem top
                h += (tab.gridBeamWidth() * _spatium) * 0.5
                // draw beams equally spaced within the stem height (this is
                // different from modern engraving, but common in historic prints)
                const step = -h / ldata.beamLevel
                let y = h
                for (let i = 0; i < ldata.beamLevel; i++, y += step) {
                    painter.drawLine(new PointF(ldata.beamLength, y), new PointF(0.0, y))
                }
            }
        }
        painter.scale(imag, imag)
    }

    static drawNoteDot(item: NoteDot, painter: Painter, opt: PaintOptions): void {
        const n = item.note()
        if (n && n.dotsHidden()) { // don't draw dot if note is hidden
            return
        } else if (item.rest() && item.rest()!.isGap()) { // don't draw dot for gap rests
            return
        }
        const tick = n ? n.chord().tick() : item.rest()!.tick()
        const staff = item.staff()!
        // always draw dot for non-tab
        // for tab, draw if on a note and stems through staff or on a rest and rests shown
        if (!staff.isTabStaff(tick)
            || (n && staff.staffType(tick).stemThrough())
            || (!n && staff.staffType(tick).showRests())) {
            painter.setPen(item.curColor(opt))
            item.drawSymbol(SymId.augmentationDot, painter)
        }
    }

    static drawRest(item: Rest, painter: Painter, opt: PaintOptions): void {
        if (item.isGap()) {
            return // only drawn for debugging
        }
        if (item.shouldNotBeDrawn()) {
            return
        }
        painter.setPen(item.curColor(opt))
        // TODO(port): dead slapped rests
        item.drawSymbol(item.ldata().sym, painter)
    }

    static drawMMRest(item: MMRest, painter: Painter, opt: PaintOptions): void {
        if (item.shouldNotBeDrawn() || (item.track() % VOICES)) { //only on voice 1
            return
        }
        const ldata = item.ldata()
        const _spatium = item.spatium()

        // draw number
        painter.setPen(item.curColor(opt))
        const numberBox = item.symBboxList(ldata.numberSym)
        const numberPos = item.numberPos()
        if (item.showNumber()) {
            item.drawSymbols(ldata.numberSym, painter, numberPos)
        }
        const numberBoxT = numberBox.translated(numberPos)

        if (item.isOldStyle()) {
            // draw rest symbols
            let x = (ldata.restWidth - ldata.symsWidth) * 0.5
            const spacing = item.style().styleMM(Sid.mmRestOldStyleSpacing)
            for (const sym of ldata.restSyms) {
                const y = sym === SymId.restWhole ? -_spatium : 0
                item.drawSymbol(sym, painter, new PointF(x, y))
                x += item.symBbox(sym).width() + spacing
            }
        } else {
            const mag = item.staff()!.staffMag(item.tick())
            const pen = painter.pen().clone()
            pen.setCapStyle(PenCapStyle.FlatCap)

            // draw horizontal line
            const hBarThickness = item.style().styleMM(Sid.mmRestHBarThickness) * mag
            if (hBarThickness) { // don't draw at all if 0, QPainter interprets 0 pen width differently
                pen.setWidthF(hBarThickness)
                painter.setPen(pen)
                const halfHBarThickness = hBarThickness * 0.5
                if (item.showNumber() // avoid painting line through number
                    && item.style().styleB(Sid.mmRestNumberMaskHBar)
                    && numberBoxT.bottom() >= -halfHBarThickness
                    && numberBoxT.top() <= halfHBarThickness) {
                    const gapDistance = (numberBoxT.width() + _spatium) * 0.5
                    const midpoint = ldata.restWidth * 0.5
                    painter.drawLine(new LineF(0.0, 0.0, midpoint - gapDistance, 0.0))
                    painter.drawLine(new LineF(midpoint + gapDistance, 0.0, ldata.restWidth, 0.0))
                } else {
                    painter.drawLine(new LineF(0.0, 0.0, ldata.restWidth, 0.0))
                }
            }

            // draw vertical lines
            const vStrokeThickness = item.style().styleMM(Sid.mmRestHBarVStrokeThickness) * mag
            if (vStrokeThickness) {
                pen.setWidthF(vStrokeThickness)
                painter.setPen(pen)
                const halfVStrokeHeight = item.style().styleMM(Sid.mmRestHBarVStrokeHeight) * 0.5 * mag
                painter.drawLine(new LineF(0.0, -halfVStrokeHeight, 0.0, halfVStrokeHeight))
                painter.drawLine(new LineF(ldata.restWidth, -halfVStrokeHeight, ldata.restWidth, halfVStrokeHeight))
            }
        }
    }

    private static setDashAndGapLen(line: SLine, pen: Pen): { dash: number; gap: number } {
        const DOTTED_DASH_LEN = 0.01
        const DOTTED_GAP_LEN = 1.99
        switch (line.lineStyle()) {
        case LineType.DASHED:
            return { dash: line.dashLineLen(), gap: line.dashGapLen() }
        case LineType.DOTTED:
            pen.setCapStyle(PenCapStyle.RoundCap) // round dots
            return { dash: DOTTED_DASH_LEN, gap: DOTTED_GAP_LEN }
        default:
            return { dash: 0, gap: 0 }
        }
    }

    private static distributedDashPattern(dash: number, gap: number, lineLength: number): number[] {
        const numPairs = Math.trunc(Math.max(1.0, lineLength / (dash + gap)))
        const newGap = (lineLength - dash * (numPairs + 1)) / numPairs
        return [dash, newGap]
    }

    static drawTextLineBaseSegment(item: TextLineBaseSegment, painter: Painter, opt: PaintOptions): void {
        const tl = item.textLineBase()
        const ldata = item.ldata()

        if (!item.text().empty()) {
            const pos = item.text().pos()
            painter.translate(pos)
            item.text().setVisible(tl.visible())
            TDraw.drawTextBase(item.text(), painter, opt)
            painter.translate(pos.times(-1))
        }

        if (!item.endText().empty()) {
            const pos = item.endText().pos()
            painter.translate(pos)
            item.endText().setVisible(tl.visible())
            TDraw.drawTextBase(item.endText(), painter, opt)
            painter.translate(pos.times(-1))
        }

        if (ldata.npoints === 0 || ((opt.isPrinting || !item.score().isShowInvisible()) && !tl.lineVisible())) {
            return
        }

        // color for line (text color comes from the text properties)
        const color = item.curColorWith(tl.visible() && tl.lineVisible(), tl.lineColor(), opt)
        const lineWidth = tl.absoluteFromSpatium(tl.lineWidth())

        const solidPen = new Pen(color, lineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap, PenJoinStyle.MiterJoin)
        const pen = solidPen.clone()
        const { dash, gap } = TDraw.setDashAndGapLen(tl, pen)
        const isNonSolid = tl.lineStyle() !== LineType.SOLID

        // Draw lines
        if (item.twoLines()) { // hairpins
            if (isNonSolid) {
                pen.setDashPattern([dash, gap])
            }
            pen.setJoinStyle(PenJoinStyle.BevelJoin)
            painter.setPen(pen)
            if (ldata.joinedHairpin.length && !isNonSolid) {
                painter.drawPolyline(ldata.joinedHairpin)
            } else {
                painter.drawLines([new LineF(ldata.points[0], ldata.points[1]), new LineF(ldata.points[2], ldata.points[3])])
            }
            return
        }

        let start = 0
        let end = ldata.npoints

        const drawHook = (hookType: HookType, arrow: PointF[], fromStart: boolean): void => {
            if (hookType === HookType.ARROW_FILLED) {
                painter.setBrush(new Brush(color, BrushStyle.SolidPattern))
                painter.setNoPen()
                painter.drawPolygon(arrow)
            } else if (hookType === HookType.ARROW) {
                pen.setJoinStyle(PenJoinStyle.MiterJoin)
                painter.setPen(pen)
                painter.drawPolyline(arrow)
            } else {
                const isTHook = hookType === HookType.HOOK_90T
                if (isNonSolid || isTHook) {
                    const p1 = fromStart ? ldata.points[start++] : ldata.points[--end]
                    const p2 = fromStart ? ldata.points[start++] : ldata.points[--end]
                    if (isTHook) {
                        painter.setPen(solidPen)
                    } else {
                        const hookLength = Math.sqrt(PointF.dotProduct(p2.minus(p1), p2.minus(p1)))
                        pen.setDashPattern(TDraw.distributedDashPattern(dash, gap, hookLength / lineWidth))
                        painter.setPen(pen)
                    }
                    painter.drawLine(p1, p2)
                }
            }
        }

        // Draw begin hook, if it needs to be drawn separately
        if (item.isSingleBeginType() && tl.beginHookType() !== HookType.NONE) {
            drawHook(tl.beginHookType(), ldata.beginArrow, true)
        }
        // Draw end hook, if it needs to be drawn separately
        if (item.isSingleEndType() && tl.endHookType() !== HookType.NONE) {
            drawHook(tl.endHookType(), ldata.endArrow, false)
        }

        // Draw the rest
        if (isNonSolid) {
            pen.setDashPattern(TDraw.distributedDashPattern(dash, gap, ldata.lineLength / lineWidth))
        }
        painter.setPen(pen)
        painter.drawPolyline(ldata.points.slice(start, end))
    }

    static drawHairpinSegment(item: HairpinSegment, painter: Painter, opt: PaintOptions): void {
        TDraw.drawTextLineBaseSegment(item, painter, opt)
        if (item.drawCircledTip()) {
            const color = item.curColorWith(item.hairpin().visible(), item.hairpin().lineColor(), opt)
            let w = item.absoluteFromSpatium(item.lineWidth())
            if (item.staff()) {
                w *= item.staff()!.staffMag(item.hairpin().tick())
            }
            painter.setPen(new Pen(color, w))
            painter.setBrush(BrushStyle.NoBrush)
            painter.drawEllipse(item.circledTip(), item.circledTipRadius(), item.circledTipRadius())
        }
    }

    static drawLyricsLineSegment(item: LyricsLineSegment, painter: Painter, opt: PaintOptions): void {
        const pen = new Pen(item.curColor(opt))
        pen.setWidthF(item.absoluteFromSpatium(item.lineWidth()))
        pen.setCapStyle(PenCapStyle.FlatCap)
        painter.setPen(pen)
        for (const dash of item.ldata().dashes()) {
            painter.drawLine(dash)
        }
    }

    private static slurTiePen(item: SlurTieSegment, painter: Painter, penColor: Color, mag: number): Pen {
        const pen = new Pen(penColor)
        //Replace generic Qt dash patterns with improved equivalents to show true dots (keep in sync with tie.cpp)
        const dotted = [0.01, 1.99] // tighter than Qt PenStyle::DotLine equivalent - would be { 0.01, 2.99 }
        const dashed = [3.00, 3.00] // Compensating for caps. Qt default PenStyle::DashLine is { 4.0, 2.0 }
        const wideDashed = [5.00, 6.00]

        switch (item.slurTie().styleType()) {
        case SlurStyleType.Solid:
            painter.setBrush(new Brush(pen.color()))
            pen.setCapStyle(PenCapStyle.RoundCap)
            pen.setJoinStyle(PenJoinStyle.RoundJoin)
            pen.setWidthF(item.endWidth() * mag)
            break
        case SlurStyleType.Dotted:
            painter.setBrush(BrushStyle.NoBrush)
            pen.setCapStyle(PenCapStyle.RoundCap) // round dots
            pen.setDashPattern(dotted)
            pen.setWidthF(item.dottedWidth() * mag)
            break
        case SlurStyleType.Dashed:
            painter.setBrush(BrushStyle.NoBrush)
            pen.setDashPattern(dashed)
            pen.setWidthF(item.dottedWidth() * mag)
            break
        case SlurStyleType.WideDashed:
            painter.setBrush(BrushStyle.NoBrush)
            pen.setDashPattern(wideDashed)
            pen.setWidthF(item.dottedWidth() * mag)
            break
        default:
            break
        }
        return pen
    }

    static drawSlurSegment(item: SlurSegment, painter: Painter, opt: PaintOptions): void {
        painter.save()
        TDraw.setMask(item, painter)
        const mag = item.staff() ? item.staff()!.staffMag(item.slur().tick()) : 1.0
        painter.setPen(TDraw.slurTiePen(item, painter, item.curColor(opt), mag))
        painter.drawPath(item.ldata().path)
        painter.restore()
    }

    static drawLaissezVibSegment(item: LaissezVibSegment, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        if (item.score().style().styleB(Sid.laissezVibUseSmuflSym)) {
            painter.setPen(new Pen(item.curColor(opt)))
            item.drawSymbol(ldata.symbol, painter)
        } else {
            TDraw.drawTieSegment(item, painter, opt)
        }
    }

    static drawTieSegment(item: TieSegment, painter: Painter, opt: PaintOptions): void {
        // hide tie toward the second chord of a cross-measure value
        const endNote = item.tie().endNote()
        if (endNote && endNote.chord().crossMeasure() === CrossMeasure.SECOND) {
            return
        }
        const penColor = item.curColorWith(item.getProperty(Pid.VISIBLE) as boolean, item.getProperty(Pid.COLOR) as Color, opt)
        if (!opt.isPrinting && item.ldata().allJumpPointsInactive) {
            penColor.setAlpha(Math.min(penColor.a, 85))
        }
        const mag = item.staff() ? item.staff()!.staffMag(item.tie().tick()) : 1.0
        painter.setPen(TDraw.slurTiePen(item, painter, penColor, mag))
        painter.drawPath(item.ldata().path)
    }

    static drawStaffLines(item: StaffLines, painter: Painter, opt: PaintOptions): void {
        painter.save()
        TDraw.setMask(item, painter)
        painter.setPen(new Pen(item.curColor(opt), item.lw(), PenStyle.SolidLine, PenCapStyle.FlatCap))
        painter.drawLines(item.lines())
        painter.restore()
    }

    static drawStem(item: Stem, painter: Painter, opt: PaintOptions): void {
        if (!item.chord()) {
            return
        }
        // hide if second chord of a cross-measure pair
        if (item.chord().crossMeasure() === CrossMeasure.SECOND) {
            return
        }
        painter.setPen(new Pen(item.curColor(opt), item.lineWidthMag(), PenStyle.SolidLine, PenCapStyle.FlatCap))
        painter.drawLine(item.ldata().line)
        // TODO(port): tablature stem slashes and dots
    }

    static drawStemSlash(item: StemSlash, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        painter.setPen(new Pen(item.curColor(opt), ldata.stemWidth, PenStyle.SolidLine, PenCapStyle.FlatCap))
        painter.drawLine(ldata.line)
    }

    static drawSymbol(item: SymbolItem, painter: Painter, opt: PaintOptions): void {
        const tabStaff = item.staff() ? item.staff()!.isTabStaff(item.tick()) : false
        if (!item.isNoteDot() || !tabStaff) {
            painter.setPen(item.curColor(opt))
            const sf = item.scoreFont()
            if (sf) {
                sf.draw(item.sym(), painter, item.magS() * item.symbolsSize(), new PointF(), item.symAngle())
            } else {
                item.drawSymbol(item.sym(), painter)
            }
        }
    }

    static drawTimeSig(item: TimeSig, painter: Painter, opt: PaintOptions): void {
        if (item.staff() && !item.staff()!.staffType(item.tick()).genTimesig()) {
            return
        }
        if (!item.showOnThisStaff()) {
            return
        }
        painter.setPen(item.curColor(opt))
        const ldata = item.ldata()
        item.drawSymbols(ldata.ns, painter, ldata.pz, item.scale())
        item.drawSymbols(ldata.ds, painter, ldata.pn, item.scale())
        if (item.largeParentheses()) {
            item.drawSymbol(SymId.timeSigParensLeft, painter, ldata.pointLargeLeftParen, item.scale().width())
            item.drawSymbol(SymId.timeSigParensRight, painter, ldata.pointLargeRightParen, item.scale().width())
        }
    }

    static drawTuplet(item: Tuplet, painter: Painter, opt: PaintOptions): void {
        // if in a TAB without stems, tuplets are not shown
        const stt = item.staffType()
        if (stt && stt.isTabStaff() && stt.stemless()) {
            return
        }
        const color = item.curColor(opt)
        const number = item.number()
        if (number) {
            painter.setPen(color)
            const pos = number.pos()
            painter.translate(pos)
            TDraw.drawTextBase(number, painter, opt)
            painter.translate(pos.times(-1))
        }
        if (item.hasBracket()) {
            const pen = new Pen(color, item.absoluteFromSpatium(item.bracketWidth()))
            pen.setJoinStyle(PenJoinStyle.MiterJoin)
            pen.setCapStyle(PenCapStyle.FlatCap)
            painter.setPen(pen)
            if (!number) {
                painter.drawPolyline(item.bracketL.slice(0, 4))
            } else {
                painter.drawPolyline(item.bracketL.slice(0, 3))
                painter.drawPolyline(item.bracketR.slice(0, 3))
            }
        }
    }

    static drawTextBase(item: TextBase, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()
        if (item.hasFrame()) {
            const baseSpatium = DefaultStyle.baseStyle().styleD(Sid.spatium)
            if (!RealIsNull(item.frameWidth().val())) {
                const fColor = item.curColorWith(item.visible(), item.frameColor(), opt)
                const frameWidthVal = item.frameWidth().val() * (item.sizeIsSpatiumDependent() ? item.spatium() : baseSpatium)
                painter.setPen(new Pen(fColor, frameWidthVal, PenStyle.SolidLine, PenCapStyle.SquareCap, PenJoinStyle.MiterJoin))
            } else {
                painter.setNoPen()
            }
            const bg = item.bgColor()
            painter.setBrush(bg.a ? new Brush(bg) : BrushStyle.NoBrush)
            if (item.circle()) {
                painter.drawEllipse(ldata.frame)
            } else {
                const frameRadius = item.frameRound().val() * (item.sizeIsSpatiumDependent() ? item.spatium() : baseSpatium)
                painter.drawRoundedRect(ldata.frame, frameRadius, frameRadius)
            }
        }
        painter.setBrush(BrushStyle.NoBrush)
        painter.setPen(item.textColor(opt))
        for (const t of ldata.blocks) {
            TDraw.drawTextBlock(t, item, painter)
        }
    }

    private static drawTextBlock(textBlock: TextBlock, item: TextBase, painter: Painter): void {
        painter.translate(0.0, textBlock.y())
        for (const f of textBlock.fragments()) {
            TDraw.drawTextFragment(f, item, painter)
        }
        painter.translate(0.0, -textBlock.y())
    }

    private static drawTextFragment(textFragment: TextFragment, item: TextBase, painter: Painter): void {
        painter.setFont(textFragment.font(item))
        painter.drawText(textFragment.pos, textFragment.text)
    }

    static setMask(item: EngravingItem, painter: Painter): void {
        const ldata = item.ldata()
        const mask = ldata.mask()
        if (!mask || mask.empty()) {
            return
        }
        const background = ldata.bbox().padded(item.spatium())
        painter.setMask(background, mask.toRects())
    }
}

