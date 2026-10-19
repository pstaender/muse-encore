/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/tlayout.h/.cpp
 * All functions take the item and the LayoutContext (the C++ ldata/conf parameters are derived from them).
 *
 * TODO(port): all element types that are not ported in the DOM yet (dynamics, lines, harmony, fret diagrams,
 * fermatas, breath marks, images, tremolos, glissandi, ...)
 */

import { LineF, PointF, RectF, SizeF } from '../../../framework/draw/types/geometry'
import { PainterPath } from '../../../framework/draw/painterpath'
import type { Color } from '../../../framework/draw/types/color'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { Fraction } from '../../types/fraction'
import { SmuflAnchorId, SymId } from '../../types/symid'
import { AlignH, AlignV, BarLineType, BracketType, ClefType, DirectionV, ElementType, Key, KeySigNatural, NoteHeadGroup, NoteHeadType,
    StaffGroup, TextStyleType, TimeSigPlacement, TimeSigStyle, VOICES } from '../../types/types'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { ClefInfo } from '../../dom/clefinfo'
import { SegmentType } from '../../dom/segment'
import { BARLINE_SPAN_1LINESTAFF_FROM, BARLINE_SPAN_1LINESTAFF_TO, type BarLine, type BarLineLayoutData } from '../../dom/barline'
import { SpacerType } from '../../dom/spacer'
import { TimeSigType } from '../../dom/timesig'
import { AccidentalBracket, type Accidental } from '../../dom/accidental'
import { AccidentalType } from '../../dom/accidentaldata'
import { KeySigEvent, type KeySym } from '../../dom/key'
import { Text } from '../../dom/text'
import { timeSigSymIdsFromString } from '../../dom/utils'
import { TConv } from '../../types/typesconv'
import type { Articulation } from '../../dom/articulation'
import type { Beam } from '../../dom/beam'
import type { Bracket } from '../../dom/bracket'
import type { Chord, GraceNotesGroup } from '../../dom/chord'
import type { Clef } from '../../dom/clef'
import type { EngravingItem } from '../../dom/engravingitem'
import type { HBox, TBox, VBox } from '../../dom/box'
import type { Hook } from '../../dom/hook'
import type { InstrumentName } from '../../dom/instrumentname'
import type { KeySig, KeySigLayoutData } from '../../dom/keysig'
import type { LayoutBreak } from '../../dom/layoutbreak'
import type { LedgerLine } from '../../dom/ledgerline'
import type { Lyrics } from '../../dom/lyrics'
import type { MeasureBase } from '../../dom/measurebase'
import type { MeasureNumber } from '../../dom/measurenumber'
import type { Note } from '../../dom/note'
import type { NoteDot } from '../../dom/notedot'
import type { Rest } from '../../dom/rest'
import type { Segment } from '../../dom/segment'
import type { Slur } from '../../dom/slur'
import type { Spacer } from '../../dom/spacer'
import type { Spanner, SpannerSegment } from '../../dom/spanner'
import type { StaffLines } from '../../dom/stafflines'
import type { Stem } from '../../dom/stem'
import type { StemSlash } from '../../dom/stemslash'
import type { Symbol as SymbolItem } from '../../dom/symbol'
import type { System } from '../../dom/system'
import type { TextBase } from '../../dom/textbase'
import type { Tie } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { LayoutContext } from './layoutcontext'
import { ChordLayout } from './chordlayout'
import { BeamLayout } from './beamlayout'
import { RestLayout } from './restlayout'
import { SlurTieLayout } from './slurtielayout'
import { TextLayout } from './textlayout'
import { BoxLayout } from './boxlayout'
import { TupletLayout } from './tupletlayout'
import { LyricsLayout } from './lyricslayout'
import { MeasureNumberLayout } from './measurenumberlayout'
import { HorizontalSpacing } from './horizontalspacing'

function barLineWidth(item: BarLine, ctx: LayoutContext, dotWidth: number): number {
    const conf = ctx.conf()
    let w = 0.0
    switch (item.barLineType()) {
    case BarLineType.DOUBLE:
        w = conf.styleMM(Sid.doubleBarWidth) * 2.0 + conf.styleMM(Sid.doubleBarDistance)
        break
    case BarLineType.DOUBLE_HEAVY:
        w = conf.styleMM(Sid.endBarWidth) * 2.0 + conf.styleMM(Sid.endBarDistance)
        break
    case BarLineType.END_START_REPEAT:
        w = conf.styleMM(Sid.endBarWidth)
            + conf.styleMM(Sid.barWidth) * 2.0
            + conf.styleMM(Sid.endBarDistance) * 2.0
            + conf.styleMM(Sid.repeatBarlineDotSeparation) * 2.0
            + dotWidth * 2
        break
    case BarLineType.START_REPEAT:
    case BarLineType.END_REPEAT:
        w = conf.styleMM(Sid.endBarWidth)
            + conf.styleMM(Sid.barWidth)
            + conf.styleMM(Sid.endBarDistance)
            + conf.styleMM(Sid.repeatBarlineDotSeparation)
            + dotWidth
        break
    case BarLineType.END:
    case BarLineType.REVERSE_END:
        w = conf.styleMM(Sid.endBarWidth) + conf.styleMM(Sid.barWidth) + conf.styleMM(Sid.endBarDistance)
        break
    case BarLineType.BROKEN:
    case BarLineType.NORMAL:
    case BarLineType.DOTTED:
        w = conf.styleMM(Sid.barWidth)
        break
    case BarLineType.HEAVY:
        w = conf.styleMM(Sid.endBarWidth)
        break
    }
    return w
}

function keySigAddLayout(item: KeySig, ctx: LayoutContext, sym: SymId, line: number, ldata: KeySigLayoutData): void {
    const _spatium = item.spatium()
    const step = _spatium * (item.staff() ? item.staff()!.staffTypeForElement(item).lineDistance().val() * 0.5 : 0.5)
    let x = 0.0
    if (ldata.keySymbols.length) {
        const previous = ldata.keySymbols[ldata.keySymbols.length - 1]
        let accidentalGap = ctx.conf().styleS(Sid.keysigAccidentalDistance).val()
        if (previous.sym !== sym) {
            accidentalGap *= 2
        } else if (previous.sym === SymId.accidentalNatural && sym === SymId.accidentalNatural) {
            accidentalGap = ctx.conf().styleS(Sid.keysigNaturalDistance).val()
        }
        const previousWidth = item.symWidth(previous.sym) / _spatium
        x = previous.xPos + previousWidth + accidentalGap
        const isAscending = line < previous.line
        const currentCutout = isAscending ? SmuflAnchorId.cutOutSW : SmuflAnchorId.cutOutNW
        const previousCutout = isAscending ? SmuflAnchorId.cutOutNE : SmuflAnchorId.cutOutSE
        const cutout = item.symSmuflAnchor(sym, currentCutout)
        const currentCutoutY = line * step + cutout.y()
        const previousCutoutY = previous.line * step + item.symSmuflAnchor(previous.sym, previousCutout).y()
        if ((isAscending && currentCutoutY < previousCutoutY) || (!isAscending && currentCutoutY > previousCutoutY)) {
            x -= cutout.x() / _spatium
        }
    }
    ldata.keySymbols.push({ sym, xPos: x, line })
}

export class TLayout {
    static layoutItem(item: EngravingItem, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TLayout.layoutAccidental(item as Accidental, ctx); break
        case ElementType.ARTICULATION: TLayout.layoutArticulation(item as Articulation, ctx); break
        case ElementType.BAR_LINE: TLayout.layoutBarLine(item as BarLine, ctx); break
        case ElementType.BEAM: TLayout.layoutBeam(item as Beam, ctx); break
        case ElementType.HBOX: TLayout.layoutHBox(item as HBox, ctx); break
        case ElementType.VBOX: TLayout.layoutVBox(item as VBox, ctx); break
        case ElementType.TBOX: TLayout.layoutTBox(item as TBox, ctx); break
        case ElementType.BRACKET: TLayout.layoutBracket(item as Bracket, ctx); break
        case ElementType.CHORD: TLayout.layoutChord(item as Chord, ctx); break
        case ElementType.CLEF: TLayout.layoutClef(item as Clef, ctx); break
        case ElementType.HOOK: TLayout.layoutHook(item as Hook, ctx); break
        case ElementType.INSTRUMENT_NAME: TLayout.layoutInstrumentName(item as InstrumentName, ctx); break
        case ElementType.KEYSIG: TLayout.layoutKeySig(item as KeySig, ctx); break
        case ElementType.LAYOUT_BREAK: TLayout.layoutLayoutBreak(item as LayoutBreak, ctx); break
        case ElementType.LEDGER_LINE: TLayout.layoutLedgerLine(item as LedgerLine, ctx); break
        case ElementType.LYRICS: TLayout.layoutLyrics(item as Lyrics, ctx); break
        case ElementType.MEASURE_NUMBER: TLayout.layoutMeasureNumber(item as MeasureNumber, ctx); break
        case ElementType.NOTE: TLayout.layoutNote(item as Note, ctx); break
        case ElementType.NOTEDOT: TLayout.layoutNoteDot(item as NoteDot); break
        case ElementType.REST: TLayout.layoutRest(item as Rest, ctx); break
        case ElementType.SLUR: TLayout.layoutSlur(item as Slur, ctx); break
        case ElementType.SPACER: TLayout.layoutSpacer(item as Spacer, ctx); break
        case ElementType.STEM: TLayout.layoutStem(item as Stem, ctx); break
        case ElementType.STEM_SLASH: TLayout.layoutStemSlash(item as StemSlash, ctx); break
        case ElementType.SYMBOL: TLayout.layoutSymbol(item as SymbolItem, ctx); break
        case ElementType.TEXT: TLayout.layoutText(item as Text, ctx); break
        case ElementType.TIE: TLayout.layoutTie(item as Tie, ctx); break
        case ElementType.TIMESIG: TLayout.layoutTimeSig(item as TimeSig, ctx); break
        case ElementType.TUPLET: TLayout.layoutTuplet(item as Tuplet, ctx); break
        default:
            if (item.isTextBase()) {
                // TODO(port): specific text types (staff text, tempo text, rehearsal marks, ...)
                TextLayout.layoutBaseTextBase(item as unknown as TextBase, ctx)
            }
            // TODO(port): element type not ported yet
            break
        }
    }

    static layoutAccidental(item: Accidental, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (ldata.isValid()) {
            return
        }

        ldata.syms = []

        // TODO: remove Accidental in layout
        // don't show accidentals for tab or slash notation
        if (item.onTabStaff() || (item.note() && item.note()!.fixed())) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        ldata.setPos(new PointF())
        if (item.accidentalType() === AccidentalType.NONE) {
            return
        }

        ldata.column = 0

        const accidentalSingleSym = (): SymId => {
            if (item.bracket() === AccidentalBracket.PARENTHESIS && !item.parentNoteHasParentheses()) {
                switch (item.accidentalType()) {
                case AccidentalType.FLAT: return SymId.accidentalFlatParens
                case AccidentalType.FLAT2: return SymId.accidentalDoubleFlatParens
                case AccidentalType.NATURAL: return SymId.accidentalNaturalParens
                case AccidentalType.SHARP: return SymId.accidentalSharpParens
                case AccidentalType.SHARP2: return SymId.accidentalDoubleSharpParens
                default:
                    break
                }
            }
            return SymId.noSym
        }

        const accidentalBracketSyms = (type: AccidentalBracket): [SymId, SymId] => {
            switch (type) {
            case AccidentalBracket.PARENTHESIS: return [SymId.accidentalParensLeft, SymId.accidentalParensRight]
            case AccidentalBracket.BRACKET: return [SymId.accidentalBracketLeft, SymId.accidentalBracketRight]
            case AccidentalBracket.BRACE: return [SymId.accidentalCombiningOpenCurlyBrace, SymId.accidentalCombiningCloseCurlyBrace]
            case AccidentalBracket.NONE: return [SymId.noSym, SymId.noSym]
            }
            return [SymId.noSym, SymId.noSym]
        }

        const shape = new Shape()

        // Single?
        const singleSym = accidentalSingleSym()
        if (singleSym !== SymId.noSym && ctx.conf().engravingFont().isValid(singleSym)) {
            ldata.syms.push({ sym: singleSym, x: 0.0, y: 0.0 })
            shape.add(item.symShapeWithCutouts(singleSym))
        } else { // Multi
            const margin = ctx.conf().styleMM(Sid.bracketedAccidentalPadding)
            let x = 0.0

            let bracketSyms: [SymId, SymId] = [SymId.noSym, SymId.noSym]
            const isNeedBracket = item.bracket() !== AccidentalBracket.NONE && !item.parentNoteHasParentheses()
            if (isNeedBracket) {
                bracketSyms = accidentalBracketSyms(item.bracket())
            }

            if (bracketSyms[0] !== SymId.noSym) {
                ldata.syms.push({ sym: bracketSyms[0], x: 0.0, y: item.bracket() === AccidentalBracket.BRACE ? item.spatium() * 0.4 : 0.0 })
                shape.add(item.symBbox(bracketSyms[0]), item)
                x += item.symAdvance(bracketSyms[0]) + margin
            }

            const mainSym = item.symId()
            ldata.syms.push({ sym: mainSym, x, y: 0.0 })
            shape.add(item.symShapeWithCutouts(mainSym).translated(new PointF(x, 0.0)))

            if (bracketSyms[1] !== SymId.noSym) {
                x += item.symAdvance(mainSym) + margin
                ldata.syms.push({ sym: bracketSyms[1], x, y: item.bracket() === AccidentalBracket.BRACE ? item.spatium() * 0.4 : 0.0 })
                shape.add(item.symBbox(bracketSyms[1]).translated(new PointF(x, 0.0)), item)
            }
        }

        ldata.setShape(shape)
    }

    static layoutArticulation(item: Articulation, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (item.isHiddenOnTabStaff()) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        ldata.setPos(new PointF())

        if (item.textType() !== 0 /* ArticulationTextType::NO_TEXT */) {
            if (!item.text()) {
                const text = new Text(item, TextStyleType.ARTICULATION)
                text.initElementStyle([])
                item.setText(text)
            }
            const text = item.text()!
            text.setXmlText(TConv.articulationText(item.textType()))
            text.setTrack(item.track())
            text.setParent(item)
            text.setSelected(item.selected())
            TextLayout.layoutBaseTextBase(text, ctx)
        }

        TLayout.fillArticulationShape(item)
    }

    static fillArticulationShape(item: Articulation): void {
        const ldata = item.mutldata()
        const sym = item.symId()
        if (sym === SymId.articAccentAbove || sym === SymId.articAccentBelow) {
            const symBbox = item.symBbox(sym)
            const width = symBbox.width()
            const height = symBbox.height()
            const thirdWidth = width / 3
            const thirdHeight = height / 3
            const base = new RectF(0.0, 0.0, thirdWidth, height)
            const center = new RectF(thirdWidth, thirdHeight, thirdWidth, thirdHeight)
            const tip = new RectF(2 * thirdWidth, 1.25 * thirdHeight, thirdWidth, 0.5 * thirdHeight)
            const shape = new Shape()
            shape.add(base, item)
            shape.add(center, item)
            shape.add(tip, item)
            const translate = new PointF(0.0, sym === SymId.articAccentAbove ? -height : 0.0)
            ldata.setShape(shape.translate(translate))
        } else if (item.textType() === 0 /* ArticulationTextType::NO_TEXT */) {
            ldata.setShape(new Shape(item.symBbox(sym), item))
        } else {
            ldata.setShape(new Shape(item.text()!.ldata().bbox(), item))
        }
    }

    static layoutBarLine(item: BarLine, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const seg = item.segment()
        if (item.staff() && seg) {
            if ((!item.staff()!.staffTypeForElement(item).showBarlines() && seg.segmentType() === SegmentType.EndBarLine)
                || (item.staff()!.hideSystemBarLine() && seg.segmentType() === SegmentType.BeginBarLine)) {
                ldata.setPos(new PointF())
                ldata.setBbox(new RectF())
                ldata.setIsSkipDraw(true)
                return
            }
        }
        ldata.setIsSkipDraw(false)

        ldata.setPos(new PointF())

        ldata.setMag(ctx.conf().styleB(Sid.scaleBarlines) && item.staff() ? item.staff()!.staffMag(item.tick()) : 1.0)
        const spatium = item.spatium()
        ldata.y1 = spatium * 0.5 * item.spanFrom()
        ldata.y2 = spatium * 0.5 * (8.0 + item.spanTo())

        const font = ctx.engravingFont()
        const magS = ctx.conf().magS(ldata.mag())
        const w = barLineWidth(item, ctx, font.width(SymId.repeatDot, magS)) * ldata.mag()
        let r = new RectF(0.0, ldata.y1, w, ldata.y2 - ldata.y1)

        if (ctx.conf().styleB(Sid.repeatBarTips)) {
            switch (item.barLineType()) {
            case BarLineType.START_REPEAT:
                r = r.united(font.bbox(SymId.bracketTop, magS).translated(0, ldata.y1))
                break
            case BarLineType.END_REPEAT: {
                const w1 = 0.0
                r = r.united(font.bbox(SymId.reversedBracketTop, magS).translated(-w1, ldata.y1))
            } break
            case BarLineType.END_START_REPEAT: {
                const w1 = 0.0
                r = r.united(font.bbox(SymId.reversedBracketTop, magS).translated(-w1, ldata.y1))
                r = r.united(font.bbox(SymId.bracketTop, magS).translated(0, ldata.y1))
            } break
            default:
                break
            }
        }
        ldata.setBbox(r)
        TLayout.updateBarlineShape(item, ldata, ctx)

        for (const e of item.el()) {
            switch (e.type()) {
            case ElementType.ARTICULATION: {
                const a = e as Articulation
                const aldata = a.mutldata()
                TLayout.layoutArticulation(a, ctx)
                const dir = a.direction()
                const distance = 0.5 * spatium
                const x = ldata.bbox().width() * 0.5
                if (dir === DirectionV.DOWN) {
                    const botY = ldata.y2 + distance
                    aldata.setPos(new PointF(x, botY))
                } else {
                    const topY = ldata.y1 - distance
                    aldata.setPos(new PointF(x, topY))
                }
            } break
            case ElementType.SYMBOL:
                TLayout.layoutSymbol(e as SymbolItem, ctx)
                break
            default:
                // TODO(port): images
                break
            }
        }
        // TODO(port): fermatas on barlines
    }

    static updateBarlineShape(item: BarLine, ldata: BarLineLayoutData, ctx: LayoutContext): void {
        const bb = ldata.bbox()
        if (item.staff()) {
            const sp = item.spatium()
            const span = item.staff()!.lines(item.tick()) - 1
            let sFrom: number
            let sTo: number
            if (span === 0 && item.spanTo() === 0) {
                sFrom = BARLINE_SPAN_1LINESTAFF_FROM
                sTo = item.spanStaff() ? 0 : BARLINE_SPAN_1LINESTAFF_TO
            } else {
                sFrom = item.spanFrom()
                sTo = item.spanStaff() ? 0 : item.spanTo()
            }
            let y = sp * sFrom * 0.5
            let h = sp * (span + (sTo - sFrom) * 0.5)
            if (ctx.conf().styleB(Sid.repeatBarTips)) {
                switch (item.barLineType()) {
                case BarLineType.START_REPEAT:
                case BarLineType.END_REPEAT:
                case BarLineType.END_START_REPEAT: {
                    if (item.isTop()) {
                        const top = item.symBbox(SymId.bracketTop).height()
                        y -= top
                        h += top
                    }
                    if (item.isBottom()) {
                        const bottom = item.symBbox(SymId.bracketBottom).height()
                        h += bottom
                    }
                } break
                default:
                    break
                }
            }
            bb.setTop(y)
            bb.setHeight(h)
        }
        ldata.setShape(new Shape(bb, item))
    }

    static layoutBarLine2(item: BarLine, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (ldata.isSkipDraw()) {
            return
        }

        item.calcY()

        let bbox = ldata.bbox()
        bbox.setTop(ldata.y1)
        bbox.setBottom(ldata.y2)

        if (ctx.conf().styleB(Sid.repeatBarTips)) {
            switch (item.barLineType()) {
            case BarLineType.START_REPEAT:
                bbox = bbox.united(item.symBbox(SymId.bracketTop).translated(0, ldata.y1))
                bbox = bbox.united(item.symBbox(SymId.bracketBottom).translated(0, ldata.y2))
                break
            case BarLineType.END_REPEAT: {
                const w1 = 0.0 //symBbox(SymId::reversedBracketTop).width();
                bbox = bbox.united(item.symBbox(SymId.reversedBracketTop).translated(-w1, ldata.y1))
                bbox = bbox.united(item.symBbox(SymId.reversedBracketBottom).translated(-w1, ldata.y2))
                break
            }
            case BarLineType.END_START_REPEAT: {
                const w1 = 0.0 //symBbox(SymId::reversedBracketTop).width();
                bbox = bbox.united(item.symBbox(SymId.reversedBracketTop).translated(-w1, ldata.y1))
                bbox = bbox.united(item.symBbox(SymId.reversedBracketBottom).translated(-w1, ldata.y2))
                bbox = bbox.united(item.symBbox(SymId.bracketTop).translated(0, ldata.y1))
                bbox = bbox.united(item.symBbox(SymId.bracketBottom).translated(0, ldata.y2))
                break
            }
            default:
                break
            }
        }

        ldata.setBbox(bbox)
    }

    static layoutBeam(item: Beam, ctx: LayoutContext): void {
        BeamLayout.layout(item, ctx)
    }

    static layoutBeam1(item: Beam, ctx: LayoutContext): void {
        BeamLayout.layout1(item, ctx)
    }

    static layoutHBox(item: HBox, ctx: LayoutContext): void {
        BoxLayout.layoutHBox(item, ctx)
    }

    static layoutVBox(item: VBox, ctx: LayoutContext): void {
        BoxLayout.layoutVBox(item, ctx)
    }

    static layoutTBox(item: TBox, ctx: LayoutContext): void {
        BoxLayout.layoutTBox(item, ctx)
    }

    static layoutBracket(item: Bracket, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const conf = ctx.conf()

        item.setVisible(item.bi().visible())
        ldata.braceSymbol = item.braceSymbol()

        switch (item.bracketType()) {
        case BracketType.BRACE: {
            const musicalSymbolFont = conf.styleSt(Sid.musicalSymbolFont)
            if (musicalSymbolFont === 'Emmentaler' || musicalSymbolFont === 'Gonville') {
                ldata.braceSymbol = SymId.noSym
                const w = conf.styleMM(Sid.akkoladeWidth)
                const h2 = ldata.bracketHeight * 0.5
                const XM = (a: number): number => (a + 700) * w / 700
                const YM = (a: number): number => (a + 7100) * h2 / 7100

                const path = new PainterPath()
                path.moveTo(XM(-8), YM(-2048))
                path.cubicTo(XM(-8), YM(-3192), XM(-360), YM(-4304), XM(-360), YM(-5400)) // c 0
                path.cubicTo(XM(-360), YM(-5952), XM(-264), YM(-6488), XM(32), YM(-6968)) // c 1
                path.cubicTo(XM(36), YM(-6974), XM(38), YM(-6984), XM(38), YM(-6990)) // c 0
                path.cubicTo(XM(38), YM(-7008), XM(16), YM(-7024), XM(0), YM(-7024)) // c 0
                path.cubicTo(XM(-8), YM(-7024), XM(-22), YM(-7022), XM(-32), YM(-7008)) // c 1
                path.cubicTo(XM(-416), YM(-6392), XM(-544), YM(-5680), XM(-544), YM(-4960)) // c 0
                path.cubicTo(XM(-544), YM(-3800), XM(-168), YM(-2680), XM(-168), YM(-1568)) // c 0
                path.cubicTo(XM(-168), YM(-1016), XM(-264), YM(-496), XM(-560), YM(-16)) // c 1
                path.lineTo(XM(-560), YM(0)) //  l 1
                path.lineTo(XM(-560), YM(16)) //  l 1
                path.cubicTo(XM(-264), YM(496), XM(-168), YM(1016), XM(-168), YM(1568)) // c 0
                path.cubicTo(XM(-168), YM(2680), XM(-544), YM(3800), XM(-544), YM(4960)) // c 0
                path.cubicTo(XM(-544), YM(5680), XM(-416), YM(6392), XM(-32), YM(7008)) // c 1
                path.cubicTo(XM(-22), YM(7022), XM(-8), YM(7024), XM(0), YM(7024)) // c 0
                path.cubicTo(XM(16), YM(7024), XM(38), YM(7008), XM(38), YM(6990)) // c 0
                path.cubicTo(XM(38), YM(6984), XM(36), YM(6974), XM(32), YM(6968)) // c 1
                path.cubicTo(XM(-264), YM(6488), XM(-360), YM(5952), XM(-360), YM(5400)) // c 0
                path.cubicTo(XM(-360), YM(4304), XM(-8), YM(3192), XM(-8), YM(2048)) // c 0
                path.cubicTo(XM(-8), YM(1320), XM(-136), YM(624), XM(-512), YM(0)) // c 1
                path.cubicTo(XM(-136), YM(-624), XM(-8), YM(-1320), XM(-8), YM(-2048)) // c 0*/

                ldata.path = path
                ldata.setBbox(path.boundingRect())
                ldata.bracketShape.add(ldata.bbox())
                ldata.bracketWidth = w + conf.styleMM(Sid.akkoladeBarDistance)
            } else {
                if (item.braceSymbol() === SymId.noSym) {
                    ldata.braceSymbol = SymId.brace
                }
                const h = ldata.bracketHeight
                const w = item.symWidth(ldata.braceSymbol) * item.magx()
                ldata.setBbox(new RectF(0, 0, w, h))
                ldata.bracketShape.add(ldata.bbox())
                ldata.bracketWidth = w + conf.styleMM(Sid.akkoladeBarDistance)
            }
        }
            break
        case BracketType.NORMAL: {
            const w = conf.styleMM(Sid.bracketWidth) * 0.5
            const bd = item.spatium() * (conf.styleSt(Sid.musicalSymbolFont) === 'Leland' ? 0.5 : 0.25)
            const shape = new Shape(new RectF(-w, -bd, w * 2, 2 * (ldata.bracketHeight * 0.5 + bd)))
            shape.add(item.symBbox(SymId.bracketTop).translated(new PointF(-w, -bd)))
            shape.add(item.symBbox(SymId.bracketBottom).translated(new PointF(-w, bd + ldata.bracketHeight)))
            ldata.setShape(shape)
            ldata.bracketWidth = conf.styleMM(Sid.bracketWidth) + conf.styleMM(Sid.bracketDistance)
        }
            break
        case BracketType.SQUARE: {
            let w = conf.styleMM(Sid.staffLineWidth) * 0.5
            const x = -w
            const y = -w
            const h = (ldata.bracketHeight * 0.5 + w) * 2
            w += (0.5 * item.spatium() + 3 * w)
            ldata.setBbox(new RectF(x, y, w, h))
            ldata.bracketShape.add(ldata.bbox())
            ldata.bracketWidth = conf.styleMM(Sid.staffLineWidth) / 2 + 0.5 * item.spatium()
        }
            break
        case BracketType.LINE: {
            const _spatium = item.spatium()
            const w = 0.67 * conf.styleMM(Sid.bracketWidth) * 0.5
            const x = -w
            const bd = _spatium * 0.25
            const y = -bd
            const h = (-y + ldata.bracketHeight * 0.5) * 2
            ldata.setBbox(new RectF(x, y, w, h))
            ldata.bracketShape.add(ldata.bbox())
            ldata.bracketWidth = 0.67 * conf.styleMM(Sid.bracketWidth) + conf.styleMM(Sid.bracketDistance)
        }
            break
        case BracketType.NO_BRACKET:
            break
        }
    }

    static layoutChord(item: Chord, ctx: LayoutContext): void {
        ChordLayout.layout(item, ctx)
    }

    static layoutClef(item: Clef, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const conf = ctx.conf()
        // determine current number of lines and line distance
        let lines = 5 // assume a resonable default
        let lineDist = 1.0
        let stepOffset = 0
        let staffOffsetY = 0

        const clefSeg = item.segment()
        // check clef visibility and type compatibility
        if (clefSeg && item.staff()) {
            const stVisibility = item.staff()!.staffType(item.tick())
            let show = stVisibility.genClef() // check staff type allows clef display
            const endOfMeasureClef = clefSeg.rtick().eq(clefSeg.measure().ticks())
            const tick = endOfMeasureClef && !item.isTrailer() ? item.tick() : clefSeg.measure().tick()
            const tickPrev = tick.minus(Fraction.eps())
            const st = item.staff()!.staffType(tick)
            const stPrev = !tickPrev.negative() ? item.staff()!.staffType(tickPrev) : null
            let staffGroup = st.group()
            const hideClef = st.isTabStaff() ? conf.styleB(Sid.hideTabClefAfterFirst) : !conf.styleB(Sid.genClef)

            // if not tab, use instrument->useDrumset to set staffGroup (to allow pitched to unpitched in same staff)
            if (staffGroup !== StaffGroup.TAB) {
                staffGroup = item.staff()!.part().instrument(item.tick()).useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
            }

            // check clef is compatible with staff type group:
            if (ClefInfo.staffGroup(item.clefType()) !== staffGroup) {
                if (tick.gt(new Fraction(0, 1)) && (!item.generated() || hideClef)) { // if clef is not generated, hide it
                    show = false
                } else { // if generated, replace with initial clef type
                    // TODO : instead of initial staff clef (which is assumed to be compatible)
                    // use the last compatible clef previously found in staff
                    item.setClefType(item.staff()!.clefType(new Fraction(0, 1)))
                }
            }

            // if clef not to show or not compatible with staff group
            if (!show) {
                ldata.setBbox(new RectF())
                ldata.symId = SymId.noSym
                return
            }

            lines = st.lines() // init values from staff type
            lineDist = st.lineDistance().val()
            stepOffset = st.stepOffset()

            const stOffset = st.yoffset().val()
            const stPrevOffset = stPrev && !clefSeg.rtick().eq(new Fraction(0, 1)) ? stPrev.yoffset().val() : 0.0
            staffOffsetY = item.isHeader() ? 0.0 : stOffset - stPrevOffset
        }

        const _spatium = item.spatium()
        let yoff = 0.0
        if (item.clefType() !== ClefType.INVALID && item.clefType() !== ClefType.MAX) {
            ldata.symId = ClefInfo.symId(item.clefType())
            yoff = lineDist * (5 - ClefInfo.line(item.clefType()))
        } else {
            ldata.symId = SymId.noSym
        }

        switch (item.clefType()) {
        case ClefType.C_19C: // 19th C clef is like a G clef
            yoff = lineDist * 1.5
            break
        case ClefType.TAB: // TAB clef
        case ClefType.TAB4: // TAB clef 4 strings
        case ClefType.TAB_SERIF: // TAB clef alternate style
        case ClefType.TAB4_SERIF: // TAB clef alternate style
            // on tablature, position clef at half the number of spaces * line distance
            yoff = lineDist * (lines - 1) * 0.5
            stepOffset = 0 //  ignore stepOffset for TAB and percussion clefs
            break
        case ClefType.PERC: // percussion clefs
        case ClefType.PERC2:
            yoff = lineDist * (lines - 1) * 0.5
            stepOffset = 0
            break
        case ClefType.INVALID:
        case ClefType.MAX:
            return
        default:
            break
        }
        // clefs on palette or at start of system/measure are left aligned
        // other clefs are right aligned
        const shape = item.symShapeWithCutouts(ldata.symId)
        const isMidMeasureClef = item.isMidMeasureClef()
        const x = isMidMeasureClef ? -shape.right() : 0.0

        ldata.setPos(new PointF(x, (yoff + (stepOffset * 0.5) + staffOffsetY) * _spatium))

        if (item.isMidMeasureClef()) {
            ldata.setShape(shape)
        } else {
            ldata.setBbox(item.symBbox(ldata.symId))
        }
    }

    static layoutGraceNotesGroup(item: GraceNotesGroup, ctx: LayoutContext): void {
        const parent = item.chordParent()
        const staffType = parent.staffType()
        if (staffType && staffType.isTabStaff() && !item.empty()) {
            // TODO(port): alignTabGraceNotesToMainStave (linked staves)
        }
        const _shape = new Shape()
        for (let i = item.size() - 1; i >= 0; --i) {
            const grace = item.at(i)
            const graceShape = grace.shape()
            const groupShape = _shape.clone()
            groupShape.remove_if((s) => {
                const si = s.item()
                if (!si || (si.isStem() && si.vStaffIdx() !== grace.vStaffIdx())) {
                    return true
                }
                return false
            })
            let offset = -Math.max(HorizontalSpacing.minHorizontalDistance(graceShape, groupShape, grace.spatium()), 0.0)
            // Adjust spacing for cross-beam situations
            if (i < item.size() - 1 && grace.stem()) {
                const prevGrace = item.at(i + 1)
                if (prevGrace.up() !== grace.up()) {
                    const crossCorrection = grace.notes()[0].headWidth() - grace.stem()!.width()
                    if (prevGrace.up() && !grace.up()) {
                        offset += crossCorrection
                    } else {
                        offset -= crossCorrection
                    }
                }
            }
            _shape.add(graceShape.translate(new PointF(offset, 0.0)))
            const xpos = offset - parent.offset().x() - parent.ldata().pos().x()
            grace.setPos(xpos, 0.0)
        }
        const appendedSeg = item.appendedSegment()!
        const staffShape = appendedSeg.staffShape(parent.staffIdx()).clone()
        const isTabStaff = !!parent.staffType() && parent.staffType()!.isTabStaff()
        if (isTabStaff) {
            staffShape.remove_if((el) => !!el.item() && el.item()!.isStem())
        }
        const _shapeSpatium = HorizontalSpacing.shapeSpatium(_shape)
        let xPos = -HorizontalSpacing.minHorizontalDistance(_shape, staffShape, _shapeSpatium)
        // If the parent chord is cross-staff, also check against shape in the other staff and take the minimum
        if (parent.staffMove() !== 0) {
            const xPosCross = -HorizontalSpacing.minHorizontalDistance(_shape, appendedSeg.staffShape(parent.vStaffIdx()), _shapeSpatium)
            xPos = Math.min(xPos, xPosCross)
        }
        // Same if the grace note itself is cross-staff
        const firstGN = item.back()
        if (firstGN.staffMove() !== 0) {
            const xPosCross = -HorizontalSpacing.minHorizontalDistance(_shape, appendedSeg.staffShape(firstGN.vStaffIdx()), _shapeSpatium)
            xPos = Math.min(xPos, xPosCross)
        }
        // Safety net in case the shape checks don't succeed
        xPos = Math.min(xPos, -(ctx.conf().styleMM(Sid.graceToMainNoteDist) + firstGN.notes()[0].headWidth() / 2))
        item.setPos(xPos, 0.0)
        if (isTabStaff) {
            ChordLayout.layoutStem(parent, ctx)
        }
    }

    static layoutHook(item: Hook, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (ldata.isValid()) {
            return
        }
        ldata.setBbox(item.symBbox(item.sym()))
    }

    static layoutInstrumentName(item: InstrumentName, ctx: LayoutContext): void {
        TextLayout.layoutBaseTextBase(item, ctx)
    }

    static layoutKeySig(item: KeySig, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const conf = ctx.conf()
        ldata.setBbox(new RectF())
        ldata.keySymbols = []

        const staff = item.staff()
        const stVisibility = staff ? staff.staffType(item.tick()) : null
        if (stVisibility && !stVisibility.genKeysig()) {
            return
        }

        const st = item.staffType()
        const s = item.segment()
        const track = item.track()
        const spatium = item.spatium()
        const step = spatium * (st ? st.lineDistance().val() * 0.5 : 0.5)

        let clef = ClefType.G
        if (staff) {
            // Look for a clef before the key signature at the same tick
            let c: Clef | null = null
            if (s) {
                for (let seg: Segment | null = s.prev1(); !c && seg && seg.tick().eq(item.tick()); seg = seg.prev1()) {
                    const isClefSeg = seg.isClefType() || seg.isHeaderClefType()
                                      || (seg.isClefRepeatAnnounceType() && s.isKeySigRepeatAnnounceType())
                    if (seg.enabled() && isClefSeg) {
                        c = seg.element(track) as Clef | null
                    }
                }
            }
            clef = c ? c.clefType() : staff.clef(item.tick().minus(Fraction.eps()))
        }

        const t1 = item.key() as number
        const lines = ClefInfo.lines(clef)

        if (item.isCustom() && !item.isAtonal()) {
            // TODO(port): custom key signatures
            for (const cd of item.customKeyDefs()) {
                void cd
            }
        } else {
            const layoutSharpsFlats = (): void => {
                if (Math.abs(t1) > 7) {
                    return
                }
                const symbol = t1 > 0 ? SymId.accidentalSharp : SymId.accidentalFlat
                const lineIndexOffset = t1 > 0 ? 0 : 7
                for (let i = 0; i < Math.abs(t1); ++i) {
                    keySigAddLayout(item, ctx, symbol, lines[lineIndexOffset + i], ldata)
                }
            }

            // Don't repeat naturals if shown in courtesy
            const pm = item.measure() ? item.measure()!.prevMeasureMM() : null
            const isCourtesy = !!s && (s.isSegType(SegmentType.CourtesyKeySigType) || !s.rtick().isZero())
            const prevTrailerCourtesy = !!pm && !pm.sectionBreak() && (!pm.trailer() || !pm.hasCourtesyKeySig())

            if (!item.hideNaturals() && track !== -1
                && (conf.styleI(Sid.keySigNaturals) !== KeySigNatural.NONE || (t1 === 0))
                && (isCourtesy || prevTrailerCourtesy)) {
                // Naturals are shown
                const prevKsEvent = staff ? staff.keySigEvent(item.tick().minus(Fraction.eps())) : new KeySigEvent()
                let t2 = prevKsEvent.key() as number

                // Use the previous courtesy keysig in a repeat continuation
                if (pm && s && s.isSegType(SegmentType.KeySigStartRepeatAnnounce)) {
                    const prevCourtesySeg = pm.findSegmentR(SegmentType.KeySigRepeatAnnounce, pm.ticks())
                    if (prevCourtesySeg && prevCourtesySeg.element(track)) {
                        t2 = (prevCourtesySeg.element(track) as KeySig).key() as number
                    }
                }

                const sameAccidentals = t1 * t2 >= 0
                if (t2 !== 0 && (sameAccidentals || conf.styleB(Sid.keySigShowNaturalsChangingSharpsFlats))) {
                    const key2accidentals = (key: number): number => {
                        switch (Math.abs(key)) {
                        case 7: return 0x7f
                        case 6: return 0x3f
                        case 5: return 0x1f
                        case 4: return 0xf
                        case 3: return 0x7
                        case 2: return 0x3
                        case 1: return 0x1
                        case 0: return 0
                        default:
                            return 0
                        }
                    }

                    let naturals = key2accidentals(t2)
                    // remove redundant naturals
                    if (!((t1 > 0) !== (t2 > 0))) {
                        naturals &= ~key2accidentals(t1)
                    }

                    const layoutNaturals = (): void => {
                        const lineIndexOffset = t2 > 0 ? 0 : 7
                        for (let i = 0; i < 7; ++i) {
                            if (naturals & (1 << i)) {
                                keySigAddLayout(item, ctx, SymId.accidentalNatural, lines[i + lineIndexOffset], ldata)
                            }
                        }
                    }

                    if (conf.styleI(Sid.keySigNaturals) === KeySigNatural.BEFORE || !sameAccidentals) {
                        layoutNaturals()
                        layoutSharpsFlats()
                    } else {
                        layoutSharpsFlats()
                        layoutNaturals()
                    }
                } else if (prevKsEvent.custom()) {
                    // TODO(port): naturals after a custom key signature
                }
            }

            // Naturals not shown
            if (ldata.keySymbols.length === 0) {
                layoutSharpsFlats()
            }
        }

        ldata.setPosY((st ? step * st.stepOffset() : 0.0) + item.staffOffsetY())

        // compute bbox
        const keySigShape = new Shape()
        for (const ks of ldata.keySymbols as KeySym[]) {
            const x = ks.xPos * spatium
            const y = ks.line * step
            keySigShape.add(item.symBbox(ks.sym).translated(x, y), item)
        }
        ldata.setShape(keySigShape)
        void Key
    }

    static layoutLayoutBreak(item: LayoutBreak, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (ldata.isValid()) {
            return
        }
        // layout break icons are only shown in edit mode (configuration()->canLayoutIcons())
        // TODO(port): FontMetrics(item->font()).boundingRect(item->iconCode())
        void FontMetrics
    }

    static layoutLedgerLine(item: LedgerLine, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const chordMag = item.chord()!.mag()
        ldata.setMag(chordMag)
        ldata.lineWidth = ctx.conf().styleMM(Sid.ledgerLineWidth) * chordMag
        if (item.staff()) {
            item.setColor(item.staff()!.staffType(item.tick()).color())
        }
        const w2 = ldata.lineWidth * 0.5

        //! NOTE Can be optimized
        if (item.vertical()) {
            ldata.setBbox(-w2, 0, w2, item.len())
        } else {
            ldata.setBbox(0, -w2, item.len(), 2 * w2)
        }
    }

    static layoutLyrics(item: Lyrics, ctx: LayoutContext): void {
        LyricsLayout.layout(item, ctx)
    }

    static layoutMeasureBase(item: MeasureBase, ctx: LayoutContext): void {
        TLayout.layoutItem(item, ctx)
    }

    static layoutBaseMeasureBase(item: MeasureBase, ctx: LayoutContext): void {
        const ldata = item.ldata()
        let x = ldata.bbox().width()
        for (const e of item.el()) {
            if (e.isLayoutBreak()) {
                TLayout.layoutItem(e, ctx)
                const eldata = e.mutldata()
                const spatium = item.spatium()
                let y: number
                if ((e as LayoutBreak).isNoBreak()) {
                    x -= eldata.bbox().right() * 0.5
                } else {
                    x -= eldata.bbox().right() + 0.5 * spatium
                }
                y = -2.5 * spatium
                eldata.setPos(x, y)
                x += eldata.bbox().left() - 0.5 * spatium
            } else if (e.isMarker() || e.isJump()) {
                // do nothing
            } else {
                TLayout.layoutItem(e, ctx)
            }
        }
    }

    static layoutMeasureNumber(item: MeasureNumber, ctx: LayoutContext): void {
        MeasureNumberLayout.layoutMeasureNumber(item, ctx)
    }

    static layoutNote(item: Note, _ctx?: LayoutContext): void {
        const ldata = item.mutldata()
        if (!ldata.isSetPos()) {
            ldata.setPos(new PointF())
        }

        const useTablature = !!item.staff() && item.staff()!.isTabStaff(item.chord().tick())
        ldata.useTablature = useTablature

        let noteBBox: RectF
        if (useTablature) {
            // TODO(port): tablature notes (fret strings)
            noteBBox = new RectF()
        } else {
            if (item.deadNote()) {
                item.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
            } else if (item.harmonic()) {
                item.setHeadGroup(NoteHeadGroup.HEAD_DIAMOND)
            }
            const nh = item.noteHead()
            ldata.cachedNoteheadSym = nh
            // TODO(port): note names (isNoteName())
            ldata.cachedSymNull = SymId.noSym
            noteBBox = item.symBbox(nh)
        }

        ldata.setBbox(noteBBox)

        TLayout.fillNoteShape(item)
        void NoteHeadType
    }

    static fillNoteShape(item: Note): void {
        const ldata = item.mutldata()
        const noteBBox = ldata.bbox()
        const shape = new Shape(undefined, null, ShapeType.Composite)

        shape.add(noteBBox, item)

        for (const dot of item.dots()) {
            if (!dot.addToSkyline()) {
                continue
            }
            shape.add(item.symBbox(SymId.augmentationDot).translated(dot.pos()), dot)
        }

        const acc = item.accidental()
        if (acc && acc.addToSkyline()) {
            shape.add(acc.ldata().shape().translated(acc.pos()))
        }

        // TODO(port): laissez vibrer segments, guitar bends

        for (const e of item.el()) {
            if (e.addToSkyline()) {
                if (e.isFingering()) {
                    // TODO(port): fingering layout type
                    continue
                }
                shape.add(e.ldata().bbox().translated(e.pos()), e)
            }
        }

        ldata.setShape(shape)
    }

    static layoutNoteDot(item: NoteDot): void {
        const ldata = item.mutldata()
        if (ldata.isValid()) {
            return
        }
        ldata.setBbox(item.symBbox(SymId.augmentationDot))
    }

    static layoutRest(item: Rest, ctx: LayoutContext): void {
        RestLayout.layoutRest(item, ctx)
    }

    static layoutSlur(item: Slur, ctx: LayoutContext): void {
        SlurTieLayout.createSlurSegments(item, ctx)
    }

    static layoutSpacer(item: Spacer, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const spatium = item.spatium()

        const path = new PainterPath()
        const w = spatium
        const b = w * 0.5
        const h = item.explicitParent() ? item.absoluteGap() : Math.min(item.gap().val(), 4.0) * spatium // limit length for palette

        switch (item.spacerType()) {
        case SpacerType.DOWN:
            path.lineTo(w, 0.0)
            path.moveTo(b, 0.0)
            path.lineTo(b, h)
            path.lineTo(0.0, h - b)
            path.moveTo(b, h)
            path.lineTo(w, h - b)
            break
        case SpacerType.UP:
            path.moveTo(b, 0.0)
            path.lineTo(0.0, b)
            path.moveTo(b, 0.0)
            path.lineTo(w, b)
            path.moveTo(b, 0.0)
            path.lineTo(b, h)
            path.moveTo(0.0, h)
            path.lineTo(w, h)
            break
        case SpacerType.FIXED:
            path.lineTo(w, 0.0)
            path.moveTo(b, 0.0)
            path.lineTo(b, h)
            path.moveTo(0.0, h)
            path.lineTo(w, h)
            break
        }

        ldata.path = path

        const lw = spatium * 0.4
        const bb = new RectF(0, 0, w, h)
        bb.adjust(-lw, -lw, lw, lw)
        ldata.setBbox(bb)
        item.setZ(0.0)
    }

    static layoutSpanner(item: Spanner, ctx: LayoutContext): void {
        TLayout.layoutItem(item, ctx)
    }

    static layoutStaffLines(item: StaffLines, ctx: LayoutContext): void {
        TLayout.layoutForWidth(item, item.measure()!.width(), ctx)
    }

    static layoutForWidth(item: StaffLines, w: number, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const s = item.staff()
        const _spatium = item.spatium()
        let dist = _spatium
        item.setPos(new PointF(0.0, 0.0))
        let _lines: number
        const mtick = item.measure()!.tick()
        if (s) {
            ldata.setMag(s.staffMag(mtick))
            item.setVisible(!s.isLinesInvisible(mtick))
            item.setColor(s.staffColor(mtick))
            const st = s.staffType(mtick)
            dist *= st.lineDistance().val()
            _lines = st.lines()
            ldata.setPosY(st.yoffset().val() * _spatium)
        } else {
            _lines = 5
            item.setColor(ctx.conf().styleV(Sid.defaultColor) as Color)
        }
        item.setLw(ctx.conf().styleS(Sid.staffLineWidth).val() * _spatium)
        const x1 = item.pos().x()
        const x2 = x1 + w
        let y = item.pos().y()
        ldata.setBbox(x1, -item.lw() * 0.5 + y, w, (_lines - 1) * dist + item.lw())

        const ll: LineF[] = []
        for (let i = 0; i < _lines; ++i) {
            ll.push(new LineF(x1, y, x2, y))
            y += dist
        }
        item.setLines(ll)
    }

    static layoutStem(item: Stem, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const up = item.up()
        const _up = up ? -1.0 : 1.0

        let y1 = 0.0 // vertical displacement to match note attach point
        let y2 = _up * item.length()

        let isTabStaff = false
        const chord = item.chord()
        if (chord) {
            ldata.setMag(chord.mag())

            const staff = item.staff()
            const staffType = staff ? staff.staffTypeForElement(chord) : null
            isTabStaff = !!staffType && staffType.isTabStaff()

            if (isTabStaff) {
                if (staffType!.stemThrough()) {
                    // TODO(port): Chord::upString()/downString()
                    const staffLinesDistance = staffType!.lineDistance().val() * item.spatium()
                    y1 = (chord.downNote().string() - chord.upNote().string()) * _up * staffLinesDistance
                    if (!staffType!.onLines()) {
                        y1 -= staffLinesDistance * 0.5
                    }
                    y1 += _up * staffLinesDistance * 0.7
                }
            } else { // non-TAB
                // move stem start to note attach point
                const note = up ? chord.downNote() : chord.upNote()
                if ((up && !note.ldata().mirror) || (!up && note.ldata().mirror)) {
                    y1 = note.stemUpSE().y()
                } else {
                    y1 = note.stemDownNW().y()
                }

                ldata.setPosY(note.ldata().pos().y())
            }

            const hook = chord.hook()
            const beam = chord.beam()
            if (hook && !beam) {
                y2 += hook.smuflAnchor().y()
            }

            if (beam) {
                y2 -= _up * beam.absoluteFromSpatium(ctx.conf().styleS(Sid.beamWidth)) * 0.5 * beam.mag()
            }
        }

        const lineWidthCorrection = item.lineWidthMag() * 0.5
        const lineX = isTabStaff ? 0.0 : _up * lineWidthCorrection

        const line = new LineF(lineX, y1, lineX, y2)
        ldata.line = line

        // HACK: if there is a beam, extend the bounding box of the stem (NOT the stem itself) by half beam width.
        // This way the bbox of the stem covers also the beam position. Hugely helps with all the collision checks.
        const rect = RectF.fromPoints(line.p1(), line.p2().plus(new PointF(0.0, ldata.beamCorrection)))
        ldata.setBbox(rect.normalized().adjusted(-lineWidthCorrection, 0, lineWidthCorrection, 0))
    }

    static layoutStemSlash(item: StemSlash, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const conf = ctx.conf()
        if (!item.explicitParent()) {
            return
        }

        const c = item.chord()!
        const stem = c.stem()!
        const hook = c.hook()
        const beam = c.beam()

        const heightReduction = 0.66
        const angleIncrease = 1.2
        const lengthIncrease = 1.1

        const mag = c.mag()

        const up = c.up() ? -1 : 1
        const stemTipY = c.up()
            ? stem.ldata().bbox().translated(stem.pos()).top()
            : stem.ldata().bbox().translated(stem.pos()).bottom()
        const leftHang = conf.noteHeadWidth() * mag / 2
        let angle = conf.styleD(Sid.stemSlashAngle) * Math.PI / 180 // converting to radians
        const straight = conf.styleB(Sid.useStraightNoteFlags)
        const graceNoteMag = mag

        const startX = stem.ldata().bbox().translated(stem.pos()).right() - leftHang

        const startY = stemTipY - up * graceNoteMag * conf.styleMM(Sid.stemSlashPosition) * (straight || !hook ? heightReduction : 1)

        let endX = 0
        let endY = 0

        if (hook) {
            const musicFont = conf.styleSt(Sid.musicalSymbolFont)
            // HACK: adjust slash angle for fonts with "fat" hooks. In future, we must use smufl cutOut
            if (c.beams() >= 2 && !straight && (musicFont === 'Bravura' || musicFont === 'Finale Maestro' || musicFont === 'Gonville')) {
                angle *= angleIncrease
            }
            endX = hook.ldata().bbox().translated(hook.ldata().pos()).right() // always ends at the right bbox margin of the hook
            endY = startY + up * (endX - startX) * Math.tan(angle)
        } else if (beam) {
            const p1 = beam.startAnchor()
            const p2 = beam.endAnchor()
            const beamAngle = p2.x() > p1.x() ? Math.atan((p2.y() - p1.y()) / (p2.x() - p1.x())) : 0
            angle += up * beamAngle / 2
            let length = 2 * item.spatium()
            const obtuseAngle = (c.up() && beamAngle < 0) || (!c.up() && beamAngle > 0)
            if (obtuseAngle) {
                length *= lengthIncrease // needs to be slightly longer
            }
            endX = startX + length * Math.cos(angle)
            endY = startY + up * length * Math.sin(angle)
        } else {
            const rightHang = (conf.noteHeadWidth() * mag / 2) - stem.width() //  subtract the stem width so the slash is optically centered on the stem
            endX = stem.ldata().bbox().translated(stem.pos()).right() + rightHang
            endY = startY + up * (endX - startX) * Math.tan(angle)
        }

        ldata.line = new LineF(new PointF(startX, startY), new PointF(endX, endY))
        ldata.stemWidth = conf.styleMM(Sid.stemSlashThickness) * graceNoteMag

        let bbox = RectF.fromPoints(ldata.line.p1(), ldata.line.p2()).normalized()
        bbox = bbox.adjusted(-ldata.stemWidth / 2, -ldata.stemWidth / 2, ldata.stemWidth, ldata.stemWidth)
        ldata.setBbox(bbox)
    }

    static layoutSymbol(item: SymbolItem, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }
        if (ldata.isValid()) {
            return
        }

        if (item.staff()) {
            ldata.setMag(item.staff()!.staffMag(item.tick()))
        }
        // TODO(port): custom score fonts (scoreFont())
        ldata.setBbox(item.symBbox(item.sym()))
        const w = ldata.bbox().width()
        const p = new PointF()
        if (item.align().vertical === AlignV.BOTTOM) {
            p.setY(-ldata.bbox().height())
        } else if (item.align().vertical === AlignV.VCENTER) {
            p.setY((-ldata.bbox().height()) * 0.5)
        } else if (item.align().vertical === AlignV.BASELINE) {
            p.setY(-item.baseLine())
        }
        if (item.align().horizontal === AlignH.RIGHT) {
            p.setX(-w)
        } else if (item.align().horizontal === AlignH.HCENTER) {
            p.setX(-(w * 0.5))
        }
        ldata.setPos(p)

        for (const e of item.leafs()) {
            if (e.isSymbol()) {
                TLayout.layoutSymbol(e as SymbolItem, ctx)
            }
            // TODO(port): images
        }
    }

    static layoutText(item: Text, ctx: LayoutContext): void {
        TextLayout.layoutBaseTextBase(item, ctx)
    }

    static layoutTie(_item: Tie, _ctx: LayoutContext): void {
        // ties are laid out in SlurTieLayout
    }

    static layoutTimeSig(item: TimeSig, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.setPos(0.0, 0.0)
        const spatium = item.spatium()

        ldata.setBbox(new RectF()) // prepare for an empty time signature

        ldata.pointLargeLeftParen = new PointF()
        ldata.pz = new PointF()
        ldata.pn = new PointF()
        ldata.pointLargeRightParen = new PointF()

        const style = item.style()
        const timeSigPlacement = style.styleV(Sid.timeSigPlacement) as TimeSigPlacement
        if (timeSigPlacement === TimeSigPlacement.NORMAL) {
            item.setSystemFlag(false)
        } else {
            item.setSystemFlag(true)
        }

        let lineDist: number
        let numOfLines: number
        const sigType = item.timeSigType()
        const staff = item.staff()
        const seg = item.segment()
        const meas = seg ? seg.measure() : null
        const tick = meas ? meas.tick() : item.tick()

        if (staff) {
            // if staff is without time sig, format as if no text at all
            const stVisibility = staff.staffType(item.tick())
            if (!stVisibility.genTimesig()) {
                ldata.setBbox(new RectF())
                return
            }
            numOfLines = staff.lines(tick)
            lineDist = staff.lineDistance(tick)
        } else {
            // assume dimensions of a standard staff
            lineDist = 1.0
            numOfLines = 5
        }

        // if some symbol
        // compute vert. displacement to center in the staff height
        // determine middle staff position:

        const yoff = spatium * (numOfLines - 1) * 0.5 * lineDist

        // C++ uses the score's engraving font
        const font = ctx.engravingFont()
        const scale = item.scale()
        const mag = new SizeF(item.magS() * scale.width(), item.magS() * scale.height())
        const timeSigStyle = item.timeSigStyle()

        const numDist = item.numDist() * scale.height()

        const shape = new Shape()

        const singleSym = (sym: SymId): void => {
            ldata.pz = new PointF(0.0, yoff)
            const bbox = font.bbox(sym, mag)
            shape.add(bbox.translated(ldata.pz), item)
            ldata.ns = [sym]
            ldata.ds = []
        }

        if (sigType === TimeSigType.FOUR_FOUR) {
            singleSym(timeSigStyle === TimeSigStyle.LARGE ? SymId.timeSigCommonLarge
                : timeSigStyle === TimeSigStyle.NARROW ? SymId.timeSigCommonNarrow : SymId.timeSigCommon)
        } else if (sigType === TimeSigType.ALLA_BREVE) {
            singleSym(timeSigStyle === TimeSigStyle.LARGE ? SymId.timeSigCutCommonLarge
                : timeSigStyle === TimeSigStyle.NARROW ? SymId.timeSigCutCommonNarrow : SymId.timeSigCutCommon)
        } else if (sigType === TimeSigType.CUT_BACH) {
            singleSym(timeSigStyle === TimeSigStyle.LARGE ? SymId.timeSigCut2Large
                : timeSigStyle === TimeSigStyle.NARROW ? SymId.timeSigCut2Narrow : SymId.timeSigCut2)
        } else if (sigType === TimeSigType.CUT_TRIPLE) {
            singleSym(timeSigStyle === TimeSigStyle.LARGE ? SymId.timeSigCut3Large
                : timeSigStyle === TimeSigStyle.NARROW ? SymId.timeSigCut3Narrow : SymId.timeSigCut3)
        } else {
            if (item.numeratorString().length === 0) {
                ldata.ns = timeSigSymIdsFromString(String(item.sig().numerator()), timeSigStyle)
                ldata.ds = timeSigSymIdsFromString(item.denominatorString().length === 0
                    ? String(item.sig().denominator()) : item.denominatorString(), timeSigStyle)
            } else {
                ldata.ns = timeSigSymIdsFromString(item.numeratorString(), timeSigStyle)
                ldata.ds = timeSigSymIdsFromString(item.denominatorString(), timeSigStyle)
            }

            const numRect = font.bboxList(ldata.ns, mag)
            const denRect = font.bboxList(ldata.ds, mag)

            // position numerator and denominator; vertical displacement:
            // number of lines is odd: 0.0 (strings are directly above and below the middle line)
            // number of lines even:   0.05 (strings are moved up/down to leave 1/10sp between them)

            const pzY = yoff - (denRect.width() < 0.01 ? 0.0 : 0.5 * (numRect.height() + numDist))
            const pnY = yoff + 0.5 * (denRect.height() + numDist)

            // centre numerator and denominator horizontally
            if (numRect.width() >= denRect.width()) {
                ldata.pz = new PointF(0.0, pzY)
                ldata.pn = new PointF((numRect.width() - denRect.width()) * 0.5, pnY)
            } else {
                ldata.pz = new PointF((denRect.width() - numRect.width()) * 0.5, pzY)
                ldata.pn = new PointF(0.0, pnY)
            }

            // centering of parenthesis so the middle of the parenthesis is at the divisor marking level
            const centerY = Math.trunc(yoff / 2 + spatium)
            const widestPortion = Math.trunc(numRect.width() > denRect.width() ? numRect.width() : denRect.width())
            ldata.pointLargeLeftParen = new PointF(-spatium, centerY)
            ldata.pointLargeRightParen = new PointF(widestPortion + spatium, centerY)

            shape.add(numRect.translated(ldata.pz), item) // translate bounding boxes to actual string positions
            shape.add(denRect.translated(ldata.pn), item)
            if (item.largeParentheses()) {
                shape.add(new RectF(ldata.pointLargeLeftParen.x(), ldata.pointLargeLeftParen.y() - denRect.height(), spatium / 2,
                                    numRect.height() + denRect.height()), item)
                shape.add(new RectF(ldata.pointLargeRightParen.x(), ldata.pointLargeRightParen.y() - denRect.height(), spatium / 2,
                                    numRect.height() + denRect.height()), item)
            }
        }

        ldata.setShape(shape)
        // Fix the bbox so that it starts at 0
        ldata.setPosX(-shape.bbox().left())

        if (item.isAboveStaves()) {
            if (staff!.hasSystemObjectsBelowBottomStaff()) {
                const staffHeight = spatium * (numOfLines - 1) * lineDist
                ldata.setPosY(staffHeight - ldata.bbox().top())
            } else {
                ldata.setPosY(-ldata.bbox().bottom())
            }
        } else if (item.isAcrossStaves()) {
            const top = ldata.bbox().top()
            ldata.setPosY(-top)
        }

        ldata.moveY(item.yPos())
    }

    static layoutTuplet(item: Tuplet, ctx: LayoutContext): void {
        TupletLayout.layout(item, ctx)
    }

    static fillTupletShape(item: Tuplet): void {
        const s = new Shape()
        if (item.hasBracket()) {
            // Tuplet brackets are shaped as a series of rectangles
            const tupletRect = (p1: PointF, p2: PointF, height: number): Shape => {
                const shape = new Shape()
                const xLength = p2.x() - p1.x()
                const nSteps = 2 * Math.ceil(xLength / item.spatium())
                const xStep = xLength / nSteps
                const yStep = (p2.y() - p1.y()) / nSteps
                const rectHeight = (item.isUp() ? height : -height) - yStep
                let xCur = p1.x()
                let yCur = p1.y() + yStep
                for (let i = 0; i < nSteps; ++i) {
                    shape.add(new RectF(xCur, yCur, xStep, rectHeight).normalized(), item)
                    xCur += xStep
                    yCur += yStep
                }
                return shape
            }
            const height = item.style().styleMM(Sid.tupletBracketHookHeight)
            s.add(tupletRect(item.bracketL[0], item.bracketL[1], height))
            s.add(tupletRect(item.bracketL[1], item.bracketL[2], height))
            if (item.number()) {
                s.add(tupletRect(item.bracketR[0], item.bracketR[1], height))
                s.add(tupletRect(item.bracketR[1], item.bracketR[2], height))
            } else {
                s.add(tupletRect(item.bracketL[2], item.bracketL[3], height))
            }
        }
        const number = item.number()
        if (number) {
            s.add(number.ldata().bbox().translated(number.pos()))
        }
        item.mutldata().setShape(s)
    }

    // ---------------------------------------------------------
    //   layoutSystem
    //    layout spanner for a system
    // ---------------------------------------------------------

    static layoutSystem(item: Spanner, system: System, ctx: LayoutContext): SpannerSegment | null {
        if (item.isSlur()) {
            return SlurTieLayout.layoutSystem(item as Slur, system, ctx)
        }
        // TODO(port): SLine (hairpins, ottavas, voltas, pedals, ...) and lyrics lines
        return null
    }

    static getNextLayoutSystemSegment(spanner: Spanner, system: System,
                                      createSegment: (parent: System) => SpannerSegment): SpannerSegment {
        let seg: SpannerSegment | null = null
        for (const ss of spanner.spannerSegments()) {
            if (!ss.system()) {
                seg = ss
                break
            }
        }
        if (!seg) {
            seg = spanner.popUnusedSegment()
            if (seg) {
                spanner.reuse(seg)
            } else {
                seg = createSegment(system)
                spanner.add(seg)
            }
        }
        seg.setSystem(system)
        seg.setSpanner(spanner)
        seg.setTrack(spanner.track())
        seg.setVisible(spanner.visible())
        return seg
    }

    static layoutSystemsDone(item: Spanner): void {
        const validSegments: SpannerSegment[] = []
        for (const seg of item.spannerSegments()) {
            if (seg.system()) {
                validSegments.push(seg)
            } else {
                item.pushUnusedSegment(seg)
            }
        }
        item.setSpannerSegments(validSegments)
    }
}

void VOICES
