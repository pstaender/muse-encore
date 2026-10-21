/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/single/singlelayout.h/.cpp: the layout of single elements outside of a score
 * (palette cells, drag previews). The elements belong to the palette score and have no staff/system.
 *
 * TODO(port): elements not ported yet: Bend, FSymbol,
 * Lyrics, NoteLine, PlayCountText, StaffTypeChange, TremoloBar,
 * Chord/Stem (drumset), text articulations (ArticulationTextType).
 */

import { LineF, PointF, PolygonF, RectF } from '../../../framework/draw/types/geometry'
import { PainterPath } from '../../../framework/draw/types/painterpath'
import { Transform } from '../../../framework/draw/types/transform'
import { RealIsEqual, RealIsNull } from '../../../framework/global/realfn'
import { SmuflAnchorId, SymId } from '../../types/symid'
import { SymNames } from '../../types/symnames'
import {
    AlignH, AlignV, ArpeggioType, BarLineType, BracketType, ClefType, DirectionH, ElementType, HookType,
    LineType, PlacementV, SpannerSegmentType, TextPlace, TrillType, VibratoType, TappingHand,
} from '../../types/types'
import { Align } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { MStyle } from '../../style/style'
import { Shape } from '../../infrastructure/shape'
import type { EngravingFont } from '../../infrastructure/engravingfont'
import { ClefInfo } from '../../dom/clefinfo'
import type { HarpPedalDiagram } from '../../dom/harppedaldiagram'
import type { StringTunings } from '../../dom/stringtunings'
import type { ChordBracket } from '../../dom/chordbracket'
import { TappingText, type Tapping } from '../../dom/tapping'
import type { Image } from '../../dom/image'
import { FontType } from '../../../framework/draw/types/font'
import { Pid, PropertyFlags } from '../../dom/property'
import { scoreDummy, type DummyElement } from '../../compat/dummyelement'
import { timeSigSymIdsFromString } from '../../dom/utils'
import { TimeSigType, type TimeSig } from '../../dom/timesig'
import { SpacerType, type Spacer } from '../../dom/spacer'
import type { KeySym } from '../../dom/key'
import { Glissando, type GlissandoSegment } from '../../dom/glissando'
import { SlurSegment, type Slur } from '../../dom/slur'
import { HammerOnPullOffSegment, HammerOnPullOffText, type HammerOnPullOff } from '../../dom/hammeronpulloff'
import { Grip } from '../../editing/editdata'
import { ArticulationAnchor } from '../../dom/articulation'
import { HairpinType } from '../../dom/hairpin'
import type { Score } from '../../dom/score'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Accidental } from '../../dom/accidental'
import type { ActionIcon } from '../../dom/actionicon'
import { BagpipeEmbellishment } from '../../dom/bagpembell'
import { UI_ICONS_DEFAULT_FONT_SIZE } from '../../dom/actionicon'
import type { Ambitus } from '../../dom/ambitus'
import { Ambitus as AmbitusClass } from '../../dom/ambitus'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Bracket } from '../../dom/bracket'
import type { Breath } from '../../dom/breath'
import type { ChordLine } from '../../dom/chordline'
import type { Clef } from '../../dom/clef'
import type { Fermata } from '../../dom/fermata'
import type { FretDiagram } from '../../dom/fret'
import type { HairpinSegment, Hairpin } from '../../dom/hairpin'
import type { KeySig } from '../../dom/keysig'
import type { LayoutBreak } from '../../dom/layoutbreak'
import type { LineSegment, SLine } from '../../dom/line'
import type { MeasureNumber } from '../../dom/measurenumber'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import type { Symbol as SymbolItem } from '../../dom/symbol'
import type { TextBase, TextBaseLayoutData } from '../../dom/textbase'
import type { Text } from '../../dom/text'
import { TextLineBaseSegment, type TextLineBase } from '../../dom/textlinebase'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { TrillSegment, Trill } from '../../dom/trill'
import type { VibratoSegment } from '../../dom/vibrato'
import type { VoltaSegment } from '../../dom/volta'
import type { Ornament } from '../../dom/ornament'
import { TextLayout } from '../score/textlayout'
import { SlurTieLayout } from '../score/slurtielayout'

/** points of the UI icon font size in engraving units (1200 DPI) */
const ICON_FONT_PIXELS = UI_ICONS_DEFAULT_FONT_SIZE * 1200 / 72

class Context {
    constructor(private m_score: Score) {}

    style(): MStyle { return this.m_score.style() }
    engravingFont(): EngravingFont { return this.m_score.engravingFont() }
    dummyParent(): DummyElement { return scoreDummy(this.m_score) }
    spatium(): number { return this.style().spatium() }
}

export class SingleLayout {
    static layoutItem(item: EngravingItem): void {
        const ctx = new Context(item.score())

        switch (item.type()) {
        case ElementType.ACCIDENTAL: SingleLayout.layoutAccidental(item as Accidental)
            break
        case ElementType.ACTION_ICON: SingleLayout.layoutActionIcon(item as ActionIcon)
            break
        case ElementType.AMBITUS: SingleLayout.layoutAmbitus(item as Ambitus, ctx)
            break
        case ElementType.ARPEGGIO: SingleLayout.layoutArpeggio(item as Arpeggio, ctx)
            break
        case ElementType.ARTICULATION: SingleLayout.layoutArticulation(item as Articulation, ctx)
            break
        case ElementType.BAGPIPE_EMBELLISHMENT: SingleLayout.layoutBagpipeEmbellishment(item as BagpipeEmbellishment, ctx)
            break
        case ElementType.BAR_LINE: SingleLayout.layoutBarLine(item as BarLine, ctx)
            break
        case ElementType.BRACKET: SingleLayout.layoutBracket(item as Bracket, ctx)
            break
        case ElementType.BREATH: SingleLayout.layoutBreath(item as Breath)
            break
        case ElementType.CHORDLINE: SingleLayout.layoutChordLine(item as ChordLine, ctx)
            break
        case ElementType.CLEF: SingleLayout.layoutClef(item as Clef, ctx)
            break
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION:
        case ElementType.FINGERING:
        case ElementType.INSTRUMENT_CHANGE:
        case ElementType.JUMP:
        case ElementType.MARKER:
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.REHEARSAL_MARK:
        case ElementType.STAFF_TEXT:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TEMPO_TEXT:
        case ElementType.TEXT:
        case ElementType.CAPO:
        case ElementType.STICKING:
            SingleLayout.layoutTextBase(item as TextBase, ctx)
            break
        case ElementType.HARP_DIAGRAM:
            (item as HarpPedalDiagram).updateDiagramText()
            SingleLayout.layoutTextBase(item as TextBase, ctx)
            break
        case ElementType.STRING_TUNINGS: SingleLayout.layoutStringTunings(item as StringTunings, ctx)
            break
        case ElementType.CHORD_BRACKET: SingleLayout.layoutChordBracket(item as ChordBracket, ctx)
            break
        case ElementType.TAPPING: SingleLayout.layoutTapping(item as Tapping, ctx)
            break
        case ElementType.IMAGE: SingleLayout.layoutImage(item as Image)
            break
        case ElementType.SOUND_FLAG:
            break
        case ElementType.FERMATA: SingleLayout.layoutFermata(item as Fermata)
            break
        case ElementType.FRET_DIAGRAM: SingleLayout.layoutFretDiagram(item as FretDiagram, ctx)
            break
        case ElementType.GLISSANDO: SingleLayout.layoutGlissando(item as Glissando, ctx)
            break
        case ElementType.HAIRPIN:
            item.setPos(0.0, 0.0)
            SingleLayout.layoutLine(item as Hairpin, ctx)
            break
        case ElementType.GRADUAL_TEMPO_CHANGE:
        case ElementType.LET_RING:
        case ElementType.OTTAVA:
        case ElementType.PALM_MUTE:
        case ElementType.PEDAL:
        case ElementType.TEXTLINE:
        case ElementType.TRILL:
        case ElementType.VIBRATO:
        case ElementType.VOLTA:
        case ElementType.WHAMMY_BAR:
            SingleLayout.layoutLine(item as SLine, ctx)
            break
        case ElementType.HAMMER_ON_PULL_OFF: SingleLayout.layoutHammerOnPullOff(item as HammerOnPullOff, ctx)
            break
        case ElementType.KEYSIG: SingleLayout.layoutKeySig(item as KeySig, ctx)
            break
        case ElementType.LAYOUT_BREAK: SingleLayout.layoutLayoutBreak(item as LayoutBreak)
            break
        case ElementType.MEASURE_NUMBER: SingleLayout.layoutMeasureNumber(item as MeasureNumber, ctx)
            break
        case ElementType.MEASURE_REPEAT: SingleLayout.layoutMeasureRepeat(item as MeasureRepeat, ctx)
            break
        case ElementType.NOTEHEAD:
        case ElementType.SYMBOL:
            SingleLayout.layoutSymbol(item as SymbolItem)
            break
        case ElementType.ORNAMENT: SingleLayout.layoutArticulation(item as Ornament, ctx)
            break
        case ElementType.SLUR: SingleLayout.layoutSlur(item as Slur, ctx)
            break
        case ElementType.SPACER: SingleLayout.layoutSpacer(item as Spacer)
            break
        case ElementType.TIMESIG: SingleLayout.layoutTimeSig(item as TimeSig, ctx)
            break
        case ElementType.TREMOLO_SINGLECHORD:
        case ElementType.TREMOLO_TWOCHORD: {
            const t = item as TremoloSingleChord | TremoloTwoChord
            t.computeShape() // set bbox
            t.setPath(t.basePath())
            break
        }
        default:
            // TODO(port): element type not supported by the single layout yet
            break
        }
    }

    static layoutLineSegment(item: LineSegment, ctx: Context): void {
        switch (item.type()) {
        case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT:
        case ElementType.OTTAVA_SEGMENT:
        case ElementType.PEDAL_SEGMENT:
        case ElementType.TEXTLINE_SEGMENT:
        case ElementType.WHAMMY_BAR_SEGMENT:
            SingleLayout.layoutTextLineBaseSegment(item as TextLineBaseSegment, ctx)
            item.setOffset(new PointF())
            break
        case ElementType.LET_RING_SEGMENT:
        case ElementType.PALM_MUTE_SEGMENT:
            SingleLayout.layoutTextLineBaseSegment(item as TextLineBaseSegment, ctx)
            break
        case ElementType.HAIRPIN_SEGMENT: SingleLayout.layoutHairpinSegment(item as HairpinSegment, ctx)
            break
        case ElementType.TRILL_SEGMENT: SingleLayout.layoutTrillSegment(item as TrillSegment, ctx)
            break
        case ElementType.VIBRATO_SEGMENT: SingleLayout.layoutVibratoSegment(item as VibratoSegment)
            break
        case ElementType.VOLTA_SEGMENT: SingleLayout.layoutVoltaSegment(item as VoltaSegment, ctx)
            break
        default:
            break
        }
    }

    static layoutAccidental(item: Accidental): void {
        const ldata = item.mutldata()
        if (!ldata.isValid()) {
            const symId = item.symId()
            ldata.syms = [{ sym: symId, x: 0.0, y: 0.0 }]
            ldata.setBbox(item.symBbox(symId))
        }
    }

    static layoutBagpipeEmbellishment(item: BagpipeEmbellishment, ctx: Context): void {
        const ldata = item.mutldata()
        const mags = item.magS() * 0.75 // grace head magnification
        const spatium = ctx.style().spatium()

        const nl = item.resolveNoteList()

        ldata.clearBbox()
        ldata.isDrawBeam = nl.length > 1
        ldata.isDrawFlag = nl.length === 1
        ldata.spatium = spatium
        ldata.headsym = SymId.noteheadBlack
        ldata.flagsym = SymId.flag32ndUp
        ldata.stemLineW = ldata.spatium * 0.1
        ldata.notesData.clear()

        const dataBeam = ldata.beamData
        dataBeam.y = (-8 * spatium / 2)
        dataBeam.width = (0.3 * spatium)

        const headBBox = ctx.engravingFont().bbox(ldata.headsym, mags)
        const flagBBox = ctx.engravingFont().bbox(ldata.flagsym, mags)
        const xcorr = spatium * 0.1 // correction to align flag with top of stem

        const headW = headBBox.width()
        const headw = 1.2 * headW // grace head width
        const headp = 1.6 * headW // horizontal head pitch
        const xl = (1 - 1.6 * (nl.length - 1)) * headW / 2 // calc x for stem of leftmost note

        // draw the notes including stem, (optional) flag and (optional) ledger line
        let x = xl
        for (let i = 0; i < nl.length; ++i) {
            const line = BagpipeEmbellishment.BAGPIPE_NOTEINFO_LIST[nl[i]].line
            const y1f = ((line - 6) * spatium / 2) // top of stem for note with flag
            const y2 = (line * spatium / 2) // bottom of stem
            const ycorr = (0.8 * spatium) // correction to align flag with top of stem

            const noteData = { headXY: new PointF(), stemLine: new LineF(), flagXY: new PointF(), ledgerLine: new LineF() }
            ldata.notesData.set(i, noteData)

            // head
            noteData.headXY = new PointF(x - headw, y2)
            ldata.addBbox(headBBox.translated(noteData.headXY))

            // stem
            // top of stems actually used
            const y1 = ldata.isDrawFlag ? y1f : dataBeam.y
            noteData.stemLine = new LineF(x - ldata.stemLineW * 0.5, y1, x - ldata.stemLineW * 0.5, y2)
            ldata.addBbox(new RectF(x - ldata.stemLineW * 0.5 - headw, y1, ldata.stemLineW, y2 - y1))

            // flag
            if (ldata.isDrawFlag) {
                noteData.flagXY = new PointF(x - ldata.stemLineW * 0.5 + xcorr, y1 + ycorr)
                ldata.addBbox(flagBBox.translated(noteData.flagXY))
            }

            // draw the ledger line for high A
            if (line === -2) {
                noteData.ledgerLine = new LineF(x - headw * 1.5 - ldata.stemLineW * 0.5, y2, x + headw * 0.5 - ldata.stemLineW * 0.5, y2)
                ldata.addBbox(new RectF(x - headw * 1.5 - ldata.stemLineW * 0.5, y2 - ldata.stemLineW * 2, headw * 2, ldata.stemLineW))
            }

            // move x to next note x position
            x += headp
        }

        dataBeam.x1 = xl - ldata.stemLineW * 0.5
        dataBeam.x2 = x - headp - ldata.stemLineW * 0.5
    }

    /** deviation: the glyph is drawn by the UI with the icon font; the bbox is the square of the font size */
    static layoutActionIcon(item: ActionIcon): void {
        const s = ICON_FONT_PIXELS * item.mag()
        item.setbbox(new RectF(-s * 0.5, -s * 0.5, s, s))
    }

    static layoutAmbitus(item: Ambitus, ctx: Context): void {
        const ldata = item.mutldata()
        const headWdt = item.headWidth()
        const spatium = item.spatium()

        const lineDist = spatium
        const numOfLines = 3

        // top notehead
        ldata.topPos.setY(0.0)
        // bottom notehead
        ldata.bottomPos.setY((numOfLines - 1) * lineDist)

        SingleLayout.layoutAccidental(item.topAccidental())
        SingleLayout.layoutAccidental(item.bottomAccidental())

        const accNoteDist = item.absoluteFromSpatium(ctx.style().styleS(Sid.accidentalNoteDistance))
        const xAccidOffTop = item.topAccidental().width() + accNoteDist
        const xAccidOffBottom = item.bottomAccidental().width() + accNoteDist

        switch (item.direction()) {
        case DirectionH.AUTO: // noteheads one above the other
            ldata.topPos.setX(0.0)
            ldata.bottomPos.setX(0.0)
            item.topAccidental().mutldata().setPosX(-xAccidOffTop)
            item.bottomAccidental().mutldata().setPosX(-xAccidOffBottom)
            break
        case DirectionH.LEFT: // top notehead at the left of bottom notehead
            ldata.topPos.setX(0.0)
            ldata.bottomPos.setX(headWdt)
            item.topAccidental().mutldata().setPosX(-xAccidOffTop)
            item.bottomAccidental().mutldata().setPosX(headWdt - xAccidOffBottom)
            break
        case DirectionH.RIGHT: // top notehead at the right of bottom notehead
            ldata.bottomPos.setX(0.0)
            ldata.topPos.setX(headWdt)
            item.bottomAccidental().mutldata().setPosX(-xAccidOffBottom)
            item.topAccidental().mutldata().setPosX(headWdt - xAccidOffTop)
            break
        }

        // compute line from top note centre to bottom note centre
        const fullLine = new LineF(ldata.topPos.x() + headWdt * 0.5, ldata.topPos.y(), ldata.bottomPos.x() + headWdt * 0.5, ldata.bottomPos.y())
        // shorten line on each side by offsets
        const yDelta = ldata.bottomPos.y() - ldata.topPos.y()
        if (!RealIsNull(yDelta)) {
            const off = spatium * AmbitusClass.LINEOFFSET_DEFAULT
            ldata.line = new LineF(fullLine.pointAt(off / yDelta), fullLine.pointAt(1 - (off / yDelta)))
        } else {
            ldata.line = fullLine
        }

        const headRect = new RectF(0, -0.5 * spatium, headWdt, 1 * spatium)
        ldata.setBbox(headRect.translated(ldata.topPos).united(headRect.translated(ldata.bottomPos))
            .united(item.topAccidental().ldata().bbox().translated(item.topAccidental().ldata().pos()))
            .united(item.bottomAccidental().ldata().bbox().translated(item.bottomAccidental().ldata().pos())))
    }

    static layoutArpeggio(item: Arpeggio, ctx: Context): void {
        const ldata = item.mutldata()
        const font = ctx.engravingFont()

        const symbolLine = (end: SymId, fill: SymId): void => {
            ldata.symbols = []
            const w = ldata.bottom - ldata.top
            const w1 = font.advance(end, ldata.magS)
            const w2 = font.advance(fill, ldata.magS)
            const n = Math.round((w - w1) / w2)
            for (let i = 0; i < n; ++i) {
                ldata.symbols.push(fill)
            }
            ldata.symbols.push(end)
        }

        ldata.arpeggioHeight = item.spatium() * 4
        ldata.top = 0.0
        ldata.bottom = ldata.arpeggioHeight

        ldata.setMag(item.mag())
        ldata.magS = ldata.mag() * (ctx.style().spatium() / ctx.style().defaultSpatium())

        switch (item.arpeggioType()) {
        case ArpeggioType.NORMAL:
            symbolLine(SymId.wiggleArpeggiatoUp, SymId.wiggleArpeggiatoUp)
            // string is rotated -90 degrees
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, -ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
            break
        case ArpeggioType.UP:
            symbolLine(SymId.wiggleArpeggiatoUpArrow, SymId.wiggleArpeggiatoUp)
            // string is rotated -90 degrees
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, -ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
            break
        case ArpeggioType.DOWN:
            symbolLine(SymId.wiggleArpeggiatoUpArrow, SymId.wiggleArpeggiatoUp)
            // string is rotated +90 degrees (so that UpArrow turns into a DownArrow)
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
            break
        case ArpeggioType.UP_STRAIGHT: {
            const x1 = item.spatium() * 0.5
            ldata.symsBBox = font.bbox(SymId.arrowheadBlackUp, ldata.magS)
            const w = ldata.symsBBox.width()
            ldata.setBbox(new RectF(x1 - w * 0.5, ldata.top, w, ldata.bottom))
            break
        }
        case ArpeggioType.DOWN_STRAIGHT: {
            const x1 = item.spatium() * 0.5
            ldata.symsBBox = font.bbox(SymId.arrowheadBlackDown, ldata.magS)
            const w = ldata.symsBBox.width()
            ldata.setBbox(new RectF(x1 - w * 0.5, ldata.top, w, ldata.bottom))
            break
        }
        case ArpeggioType.BRACKET: {
            const w = ctx.style().styleS(Sid.arpeggioHookLen).val() * item.spatium()
            ldata.setBbox(new RectF(0.0, ldata.top, w, ldata.bottom))
            break
        }
        }
    }

    static layoutArticulation(item: Articulation, _ctx: Context): void {
        // TODO(port): text articulations (ArticulationTextType, handbells)
        let bbox = item.symBbox(item.symId())
        bbox = bbox.translated(-0.5 * bbox.width(), 0.0)
        item.setbbox(bbox)
    }

    static layoutBarLine(item: BarLine, ctx: Context): void {
        const ldata = item.mutldata()
        ldata.setPos(new PointF())
        ldata.setMag(1.0)

        const spatium = item.spatium()
        ldata.y1 = spatium * 0.5 * item.spanFrom()
        if (RealIsEqual(ldata.y2, 0.0)) {
            ldata.y2 = spatium * 0.5 * (8.0 + item.spanTo())
        }

        const style = ctx.style()
        const dotWidth = item.symWidth(SymId.repeatDot)
        let w = 0.0
        switch (item.barLineType()) {
        case BarLineType.DOUBLE:
            w = style.styleMM(Sid.doubleBarWidth) * 2.0 + style.styleMM(Sid.doubleBarDistance)
            break
        case BarLineType.DOUBLE_HEAVY:
            w = style.styleMM(Sid.endBarWidth) * 2.0 + style.styleMM(Sid.endBarDistance)
            break
        case BarLineType.END_START_REPEAT:
            w = style.styleMM(Sid.endBarWidth)
                + style.styleMM(Sid.barWidth) * 2.0
                + style.styleMM(Sid.endBarDistance) * 2.0
                + style.styleMM(Sid.repeatBarlineDotSeparation) * 2.0
                + dotWidth * 2
            break
        case BarLineType.START_REPEAT:
        case BarLineType.END_REPEAT:
            w = style.styleMM(Sid.endBarWidth)
                + style.styleMM(Sid.barWidth)
                + style.styleMM(Sid.endBarDistance)
                + style.styleMM(Sid.repeatBarlineDotSeparation)
                + dotWidth
            break
        case BarLineType.END:
        case BarLineType.REVERSE_END:
            w = style.styleMM(Sid.endBarWidth) + style.styleMM(Sid.barWidth) + style.styleMM(Sid.endBarDistance)
            break
        case BarLineType.BROKEN:
        case BarLineType.NORMAL:
        case BarLineType.DOTTED:
            w = style.styleMM(Sid.barWidth)
            break
        case BarLineType.HEAVY:
            w = style.styleMM(Sid.endBarWidth)
            break
        default:
            break
        }
        w *= ldata.mag()
        ldata.setBbox(new RectF(0.0, ldata.y1, w, ldata.y2 - ldata.y1))
    }

    static layoutBracket(item: Bracket, ctx: Context): void {
        const ldata = item.mutldata()
        const style = ctx.style()

        ldata.bracketHeight = 3.5 * item.spatium() * 2
        ldata.braceSymbol = item.braceSymbol()

        const shape = new Shape()

        switch (item.bracketType()) {
        case BracketType.BRACE: {
            if (item.braceSymbol() === SymId.noSym) {
                ldata.braceSymbol = SymId.brace
            }
            const h = ldata.bracketHeight
            const w = item.symWidth(ldata.braceSymbol) * item.magx()
            ldata.setBbox(new RectF(0, 0, w, h))
            shape.add(ldata.bbox())
            ldata.bracketWidth = w + style.styleMM(Sid.akkoladeBarDistance)
            break
        }
        case BracketType.NORMAL: {
            const spatium = item.spatium()
            let w = style.styleMM(Sid.bracketWidth) * 0.5
            const x = -w

            const bd = spatium * 0.5
            shape.add(new RectF(x, -bd, w * 2, 2 * (ldata.h2() + bd)))
            shape.add(item.symBbox(SymId.bracketTop).translated(new PointF(-w, -bd)))
            shape.add(item.symBbox(SymId.bracketBottom).translated(new PointF(-w, bd + 2 * ldata.h2())))

            w += item.symWidth(SymId.bracketTop)
            const y = -item.symHeight(SymId.bracketTop) - bd
            const h = (-y + ldata.h2()) * 2
            ldata.setBbox(new RectF(x, y, w, h))

            ldata.bracketWidth = style.styleMM(Sid.bracketWidth) + style.styleMM(Sid.bracketDistance)
            break
        }
        case BracketType.SQUARE: {
            let w = style.styleMM(Sid.staffLineWidth) * 0.5
            const x = -w
            const y = -w
            const h = (ldata.h2() + w) * 2
            w += (0.5 * item.spatium() + 3 * w)
            ldata.setBbox(new RectF(x, y, w, h))
            shape.add(ldata.bbox())

            ldata.bracketWidth = style.styleMM(Sid.staffLineWidth) / 2 + 0.5 * item.spatium()
            break
        }
        case BracketType.LINE: {
            const spatium = item.spatium()
            const w = 0.67 * style.styleMM(Sid.bracketWidth) * 0.5
            const x = -w
            const bd = spatium * 0.25
            const y = -bd
            const h = (-y + ldata.h2()) * 2
            ldata.setBbox(new RectF(x, y, w, h))
            shape.add(ldata.bbox())

            ldata.bracketWidth = 0.67 * style.styleMM(Sid.bracketWidth) + style.styleMM(Sid.bracketDistance)
            break
        }
        default:
            break
        }

        ldata.bracketShape = shape
    }

    static layoutBreath(item: Breath): void {
        item.setbbox(item.symBbox(item.symId()))
    }

    static layoutChordLine(item: ChordLine, ctx: Context): void {
        const ldata = item.mutldata()
        ldata.setMag(1.0)
        if (!item.modified()) {
            let x2 = 0
            let y2 = 0
            const baseLength = item.spatium()
            const horBaseLength = 1.2 * baseLength // let the symbols extend a bit more horizontally
            x2 += item.isToTheLeft() ? -horBaseLength : horBaseLength
            y2 += item.isBelow() ? baseLength : -baseLength
            if (item.chordLineType() !== 0 && !item.isWavy()) {
                const path = new PainterPath()
                if (!item.isToTheLeft()) {
                    if (item.isStraight()) {
                        path.lineTo(x2, y2)
                    } else {
                        path.cubicTo(x2 / 2, 0.0, x2, y2 / 2, x2, y2)
                    }
                } else {
                    if (item.isStraight()) {
                        path.lineTo(x2, y2)
                    } else {
                        path.cubicTo(0.0, y2 / 2, x2 / 2, y2, x2, y2)
                    }
                }
                ldata.path = path
            }
        }

        ldata.setPos(0.0, 0.0)

        if (!item.isWavy()) {
            const r = ldata.path.boundingRect()
            // C++ truncates to int
            ldata.setBbox(new RectF(Math.trunc(r.x()), Math.trunc(r.y()), Math.trunc(r.width()), Math.trunc(r.height())))
        } else {
            ldata.setBbox(ctx.engravingFont().bbox(item.waveSym(), item.magS()))
        }
    }

    static layoutClef(item: Clef, ctx: Context): void {
        const ldata = item.mutldata()
        const lines = 5
        const lineDist = 1.0
        const spatium = ctx.spatium()
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
        case ClefType.PERC: // percussion clefs
        case ClefType.PERC2:
            yoff = lineDist * (lines - 1) * 0.5
            break
        default:
            break
        }

        ldata.setPos(0.0, yoff * spatium)
        ldata.setBbox(item.symBbox(ldata.symId))
    }

    static layoutFermata(item: Fermata): void {
        item.setPos(new PointF())
        item.setOffset(new PointF())
        const b = item.symBbox(item.symId())
        item.setbbox(b.translated(-0.5 * b.width(), 0.0))
    }

    static layoutFretDiagram(item: FretDiagram, ctx: Context): void {
        const ldata = item.mutldata()
        const spatium = item.spatium()
        ldata.stringLineWidth = spatium * 0.08
        ldata.nutLineWidth = (item.fretOffset() || !item.showNut()) ? ldata.stringLineWidth : spatium * 0.2
        ldata.stringDist = ctx.style().styleMM(Sid.fretStringSpacing)
        ldata.fretDist = ctx.style().styleMM(Sid.fretFretSpacing)
        ldata.markerSize = ldata.stringDist * 0.8

        let w = ldata.stringDist * (item.strings() - 1) + ldata.markerSize
        let h = (item.frets() + 1) * ldata.fretDist + ldata.markerSize
        let y = -(ldata.markerSize * 0.5 + ldata.fretDist)
        let x = -(ldata.markerSize * 0.5)

        // TODO(port): space for the fret offset number (not used by the palette diagrams)

        if (item.orientation() !== 0) { // Orientation::HORIZONTAL
            [w, h] = [h, w];
            [x, y] = [y, x]
        }

        ldata.setBbox(new RectF(x, y, w, h))
    }

    static layoutGlissando(item: Glissando, ctx: Context): void {
        const spatium = item.spatium()

        if (item.spannerSegments().length === 0) {
            item.add(item.createLineSegment(ctx.dummyParent().system()))
        }
        const s = item.frontSegment() as GlissandoSegment
        s.setPos(new PointF(-spatium * Glissando.GLISS_PALETTE_WIDTH / 2, spatium * Glissando.GLISS_PALETTE_HEIGHT / 2))
        s.setPos2(new PointF(spatium * Glissando.GLISS_PALETTE_WIDTH, -spatium * Glissando.GLISS_PALETTE_HEIGHT))

        // layout(GlissandoSegment)
        if (s.pos2().x() <= 0) {
            s.setbbox(new RectF())
            return
        }
        const r = new RectF(0.0, 0.0, s.pos2().x(), s.pos2().y()).normalized()
        const lw = s.absoluteFromSpatium(item.lineWidth()) * 0.5
        s.setbbox(r.adjusted(-lw, -lw, lw, lw))
    }

    static layoutHammerOnPullOff(item: HammerOnPullOff, ctx: Context): void {
        const spatium = item.spatium()
        let s: HammerOnPullOffSegment
        if (item.spannerSegments().length === 0) {
            s = new HammerOnPullOffSegment(ctx.dummyParent().system())
            s.setTrack(item.track())
            item.add(s)
        } else {
            s = item.frontSegment() as HammerOnPullOffSegment
        }

        s.setSpannerSegmentType(SpannerSegmentType.SINGLE)

        s.setPos(new PointF())
        s.ups(Grip.START).p = new PointF(0, 0)
        s.ups(Grip.END).p = new PointF(spatium * 6, 0)
        s.setExtraHeight(0.0)

        SlurTieLayout.computeSlurBezier(s)

        // layout(HammerOnPullOffSegment)
        if (s.hopoText().length === 0) {
            s.addHopoText(new HammerOnPullOffText(s))
        }
        const hopoText = s.hopoText()[0]
        hopoText.setParent(s)
        hopoText.setXmlText('H/P')
        hopoText.setAlign(new Align(AlignH.HCENTER, AlignV.BASELINE))
        hopoText.setPosition(AlignH.HCENTER)
        SingleLayout.layoutTextBase(hopoText, ctx)

        const bbox = s.ldata().bbox()
        hopoText.mutldata().setPos(0.5 * (bbox.left() + bbox.right()), bbox.top() - 0.5 * s.spatium())

        const itemShape = s.mutldata().shape().clone()
        itemShape.add(hopoText.shape().translated(hopoText.pos()))
        s.mutldata().setShape(itemShape)

        item.setbbox(s.ldata().bbox())
    }

    static layoutHairpinSegment(item: HairpinSegment, ctx: Context): void {
        const spatium = item.spatium()
        const ldata = item.mutldata()

        const hairpin = item.hairpin()
        const type = hairpin.hairpinType()
        if (hairpin.isLineType()) {
            item.setTwoLines(false)
            SingleLayout.layoutTextLineBaseSegment(item, ctx)
            item.setDrawCircledTip(false)
            item.setCircledTipRadius(0.0)
        } else {
            item.setTwoLines(true)

            hairpin.setBeginTextAlign(new Align(AlignH.LEFT, AlignV.VCENTER))
            hairpin.setEndTextAlign(new Align(AlignH.RIGHT, AlignV.VCENTER))

            let x1 = 0.0
            SingleLayout.layoutTextLineBaseSegment(item, ctx)
            if (!item.text().empty()) {
                x1 = item.text().width() + spatium * 0.5
            }

            const t = new Transform()
            const h1 = hairpin.hairpinHeight().val() * spatium * 0.5
            const h2 = hairpin.hairpinContHeight().val() * spatium * 0.5

            let x = item.pos2().x()
            if (!item.endText().empty()) {
                x -= (item.endText().width() + spatium * 0.5) // 0.5 spatium distance
            }
            if (x < spatium) { // minimum size of hairpin
                x = spatium
            }
            const y = item.pos2().y()
            const len = Math.sqrt(x * x + y * y)
            t.rotateRadians(Math.asin(y / len))

            item.setDrawCircledTip(hairpin.hairpinCircledTip())
            item.setCircledTipRadius(item.drawCircledTip() ? 0.6 * spatium * 0.5 : 0.0)

            let l1 = new LineF()
            let l2 = new LineF()
            const sst = item.spannerSegmentType()

            if (type === HairpinType.CRESC_HAIRPIN) {
                if (sst === SpannerSegmentType.SINGLE || sst === SpannerSegmentType.BEGIN) {
                    l1 = new LineF(x1 + item.circledTipRadius() * 2.0, 0.0, len, h1)
                    l2 = new LineF(x1 + item.circledTipRadius() * 2.0, 0.0, len, -h1)
                    item.setCircledTip(new PointF(x1 + item.circledTipRadius(), 0.0))
                } else {
                    item.setDrawCircledTip(false)
                    l1 = new LineF(x1, h2, len, h1)
                    l2 = new LineF(x1, -h2, len, -h1)
                }
            } else if (type === HairpinType.DIM_HAIRPIN) {
                if (sst === SpannerSegmentType.SINGLE || sst === SpannerSegmentType.END) {
                    l1 = new LineF(x1, h1, len - item.circledTipRadius() * 2, 0.0)
                    l2 = new LineF(x1, -h1, len - item.circledTipRadius() * 2, 0.0)
                    item.setCircledTip(new PointF(len - item.circledTipRadius(), 0.0))
                } else {
                    item.setDrawCircledTip(false)
                    l1 = new LineF(x1, h1, len, +h2)
                    l2 = new LineF(x1, -h1, len, -h2)
                }
            }

            // Do Coord rotation
            l1 = t.mapLine(l1)
            l2 = t.mapLine(l2)
            if (item.drawCircledTip()) {
                item.setCircledTip(t.map(item.circledTip()))
            }

            ldata.points[0] = l1.p1()
            ldata.points[1] = l1.p2()
            ldata.points[2] = l2.p1()
            ldata.points[3] = l2.p2()
            ldata.npoints = 4
            // the drawing of this port joins the lines at the tip (like TLayout::layoutHairpinSegment)
            let joined: PointF[] = []
            if (type === HairpinType.DIM_HAIRPIN) {
                joined = [ldata.points[0], ldata.points[1], ldata.points[2]]
            } else if (type === HairpinType.CRESC_HAIRPIN) {
                joined = [ldata.points[1], ldata.points[0], ldata.points[3]]
            }
            ldata.joinedHairpin = new PolygonF(...joined.map(p => p.clone()))

            let r = RectF.fromPoints(l1.p1(), l1.p2()).normalized().united(RectF.fromPoints(l2.p1(), l2.p2()).normalized())
            if (!item.text().empty()) {
                r = r.united(item.text().ldata().bbox())
            }
            if (!item.endText().empty()) {
                r = r.united(item.endText().ldata().bbox().translated(x + item.endText().ldata().bbox().width(), 0.0))
            }
            const w = item.absoluteFromSpatium(ctx.style().styleS(Sid.hairpinLineWidth))
            item.setbbox(r.adjusted(-w * 0.5, -w * 0.5, w, w))
        }

        item.setPos(new PointF())
        item.setOffset(new PointF())
    }

    static layoutKeySig(item: KeySig, ctx: Context): void {
        const ldata = item.mutldata()
        const spatium = item.spatium()
        const step = spatium * 0.5

        ldata.setBbox(new RectF())
        ldata.keySymbols = []

        // determine current clef for this staff
        const clef = ClefType.G
        const key = item.key() as number
        const lines = ClefInfo.lines(clef)

        if (item.isCustom() && !item.isAtonal()) {
            const accidentalGap = ctx.style().styleS(Sid.keysigAccidentalDistance).val()
            // add standard key accidentals first, if necessary
            for (let i = 1; i <= Math.abs(key) && Math.abs(key) <= 7; ++i) {
                let drop = false
                for (const cd of item.customKeyDefs()) {
                    const degree = item.degInKey(cd.degree)
                    // if custom keysig accidental takes place, don't create tonal accidental
                    if ((degree * 2 + 2) % 7 === (key < 0 ? 8 - i : i) % 7) {
                        drop = true
                        break
                    }
                }
                if (!drop) {
                    const lineIndexOffset = key > 0 ? -1 : 6
                    const ks: KeySym = { sym: key > 0 ? SymId.accidentalSharp : SymId.accidentalFlat, line: lines[lineIndexOffset + i], xPos: 0 }
                    if (ldata.keySymbols.length > 0) {
                        const previous = ldata.keySymbols[ldata.keySymbols.length - 1]
                        const previousWidth = item.symWidth(previous.sym) / spatium
                        ks.xPos = previous.xPos + previousWidth + accidentalGap
                    }
                    ldata.keySymbols.push(ks)
                }
            }
            for (const cd of item.customKeyDefs()) {
                let sym = item.symInKey(cd.sym, cd.degree)
                const degree = item.degInKey(cd.degree)
                const flat = SymNames.nameForSymId(sym).includes('Flat')
                let accIdx = (degree * 2 + 1) % 7 // C D E F ... index to F C G D index
                accIdx = flat ? 13 - accIdx : accIdx
                const line = lines[accIdx] + cd.octAlt * 7
                let xpos = cd.xAlt
                if (ldata.keySymbols.length > 0) {
                    const previous = ldata.keySymbols[ldata.keySymbols.length - 1]
                    const previousWidth = item.symWidth(previous.sym) / spatium
                    xpos += previous.xPos + previousWidth + accidentalGap
                }
                // if translated symbol if out of range, add key accidental followed by untranslated symbol
                if (sym === SymId.noSym) {
                    const ks: KeySym = { sym: SymId.noSym, line, xPos: xpos }
                    // for quadruple sharp use two double sharps
                    if (cd.sym === SymId.accidentalTripleSharp) {
                        ks.sym = SymId.accidentalDoubleSharp
                        sym = SymId.accidentalDoubleSharp
                    } else {
                        ks.sym = key > 0 ? SymId.accidentalSharp : SymId.accidentalFlat
                        sym = cd.sym
                    }
                    ldata.keySymbols.push(ks)
                    xpos += key < 0 ? 0.7 : 1 // flats closer
                }
                // create symbol; natural only if is user defined
                if (sym !== SymId.accidentalNatural || sym === cd.sym) {
                    ldata.keySymbols.push({ sym, line, xPos: xpos })
                }
            }
        } else if (Math.abs(key) <= 7) {
            const sym = key > 0 ? SymId.accidentalSharp : SymId.accidentalFlat
            const accidentalGap = ctx.style().styleS(Sid.keysigAccidentalDistance).val()
            const previousWidth = item.symWidth(sym) / spatium
            const lineIndexOffset = key > 0 ? 0 : 7
            for (let i = 0; i < Math.abs(key); ++i) {
                const line = lines[lineIndexOffset + i]
                let x = 0.0
                if (ldata.keySymbols.length > 0) {
                    const previous = ldata.keySymbols[ldata.keySymbols.length - 1]
                    x = previous.xPos + previousWidth + accidentalGap
                    const isAscending = line < previous.line
                    const currentCutout = isAscending ? SmuflAnchorId.cutOutSW : SmuflAnchorId.cutOutNW
                    const previousCutout = isAscending ? SmuflAnchorId.cutOutNE : SmuflAnchorId.cutOutSE
                    const cutout = item.symSmuflAnchor(sym, currentCutout)
                    const currentCutoutY = line * step + cutout.y()
                    const previousCutoutY = previous.line * step + item.symSmuflAnchor(previous.sym, previousCutout).y()
                    if ((isAscending && currentCutoutY < previousCutoutY) || (!isAscending && currentCutoutY > previousCutoutY)) {
                        x -= cutout.x() / spatium
                    }
                }
                ldata.keySymbols.push({ sym, line, xPos: x })
            }
        }

        // compute bbox
        for (const ks of ldata.keySymbols) {
            ldata.addBbox(item.symBbox(ks.sym).translated(ks.xPos * spatium, ks.line * step))
        }
    }

    /** deviation: the icon is drawn by the UI with the icon font (like ActionIcon) */
    static layoutLayoutBreak(item: LayoutBreak): void {
        const s = ICON_FONT_PIXELS * item.magS()
        item.mutldata().setShape(new Shape(new RectF(-s * 0.5, -s * 0.5, s, s), item))
    }

    static layoutMeasureNumber(item: MeasureNumber, ctx: Context): void {
        item.setPos(new PointF())
        item.setOffset(new PointF())
        SingleLayout.layout1TextBase(item, ctx, item.mutldata())
    }

    static layoutMeasureRepeat(item: MeasureRepeat, ctx: Context): void {
        const ldata = item.mutldata()
        switch (item.numMeasures()) {
        case 1:
            ldata.setSymId(SymId.repeat1Bar)
            if (ctx.style().styleB(Sid.oneMeasureRepeatShow1)) {
                ldata.setNumberSym(1)
            } else {
                ldata.clearNumberSym()
            }
            break
        case 2:
            ldata.setSymId(SymId.repeat2Bars)
            ldata.setNumberSym(item.numMeasures())
            break
        case 4:
            ldata.setSymId(SymId.repeat4Bars)
            ldata.setNumberSym(item.numMeasures())
            break
        default:
            ldata.setSymId(SymId.noSym) // should never happen
            ldata.clearNumberSym()
            break
        }
        ldata.setBbox(item.symBbox(ldata.symId))
    }

    static layoutSlur(item: Slur, ctx: Context): void {
        const spatium = item.spatium()
        let s: SlurSegment
        if (item.spannerSegments().length === 0) {
            s = new SlurSegment(ctx.dummyParent().system())
            s.setTrack(item.track())
            item.add(s)
        } else {
            s = item.frontSegment() as SlurSegment
        }

        s.setSpannerSegmentType(SpannerSegmentType.SINGLE)

        s.setPos(new PointF())
        s.ups(Grip.START).p = new PointF(0, 0)
        s.ups(Grip.END).p = new PointF(spatium * 6, 0)
        s.setExtraHeight(0.0)

        SlurTieLayout.computeSlurBezier(s)

        item.setbbox(s.ldata().bbox())
    }

    static layoutSpacer(item: Spacer): void {
        const ldata = item.mutldata()
        const spatium = item.spatium()

        const path = new PainterPath()
        const w = spatium
        const b = w * 0.5
        // limit length for palette
        const h = item.explicitParent() && item.explicitParent()!.type() !== ElementType.DUMMY
            ? item.absoluteGap() : Math.min(item.gap().val(), 4.0) * spatium

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
        ldata.setBbox(new RectF(0, 0, w, h).adjusted(-lw, -lw, lw, lw))
        item.setZ(0)
    }

    static layoutSymbol(item: SymbolItem): void {
        const font = item.scoreFont()
        item.setbbox(font ? font.bbox(item.sym(), item.magS()) : item.symBbox(item.sym()))
        item.setOffset(0.0, 0.0)
        item.setPos(0.0, 0.0)
    }

    static layoutTimeSig(item: TimeSig, ctx: Context): void {
        const ldata = item.mutldata()
        const spatium = item.spatium()

        ldata.setPos(0.0, 0.0)
        ldata.setBbox(new RectF()) // prepare for an empty time signature

        const lineDist = 1.0
        const numOfLines = 5
        const sigType = item.timeSigType()

        // compute vert. displacement to center in the staff height
        const yoff = spatium * (numOfLines - 1) * 0.5 * lineDist

        // C and Ccut are placed at the middle of the staff: use yoff directly
        const font = ctx.engravingFont()
        const mag = item.scale().times(item.magS())

        const single = (sym: SymId): void => {
            ldata.pz = new PointF(0.0, yoff)
            ldata.setBbox(font.bbox(sym, mag).translated(ldata.pz))
            ldata.ns = [sym]
            ldata.ds = []
        }

        if (sigType === TimeSigType.FOUR_FOUR) {
            single(SymId.timeSigCommon)
        } else if (sigType === TimeSigType.ALLA_BREVE) {
            single(SymId.timeSigCutCommon)
        } else if (sigType === TimeSigType.CUT_BACH) {
            single(SymId.timeSigCut2)
        } else if (sigType === TimeSigType.CUT_TRIPLE) {
            single(SymId.timeSigCut3)
        } else {
            if (item.numeratorString() === '') {
                ldata.ns = timeSigSymIdsFromString(String(item.sig().numerator()))
                ldata.ds = timeSigSymIdsFromString(item.denominatorString() === '' ? String(item.sig().denominator()) : item.denominatorString())
            } else {
                ldata.ns = timeSigSymIdsFromString(item.numeratorString())
                ldata.ds = timeSigSymIdsFromString(item.denominatorString())
            }

            const numRect = font.bboxList(ldata.ns, mag)
            const denRect = font.bboxList(ldata.ds, mag)

            // position numerator and denominator; vertical displacement:
            // number of lines is odd: 0.0 (strings are directly above and below the middle line)
            // number of lines even:   0.05 (strings are moved up/down to leave 1/10sp between them)
            const displ = (numOfLines & 1) ? 0.0 : (0.05 * spatium)

            //align on the wider
            const pzY = yoff - (denRect.width() < 0.01 ? 0.0 : (displ + numRect.height() * 0.5))
            const pnY = yoff + displ + denRect.height() * 0.5

            if (numRect.width() >= denRect.width()) {
                // numerator: one space above centre line, unless denomin. is empty (if so, directly centre in the middle)
                ldata.pz = new PointF(0.0, pzY)
                // denominator: horiz: centred around centre of numerator | vert: one space below centre line
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

            ldata.setBbox(numRect.translated(ldata.pz)) // translate bounding boxes to actual string positions
            ldata.addBbox(denRect.translated(ldata.pn))
            if (item.largeParentheses()) {
                ldata.addBbox(new RectF(ldata.pointLargeLeftParen.x(), ldata.pointLargeLeftParen.y() - denRect.height(), spatium / 2,
                    numRect.height() + denRect.height()))
                ldata.addBbox(new RectF(ldata.pointLargeRightParen.x(), ldata.pointLargeRightParen.y() - denRect.height(), spatium / 2,
                    numRect.height() + denRect.height()))
            }
        }
    }

    static layoutTrillSegment(item: TrillSegment, ctx: Context): void {
        const ldata = item.mutldata()
        if (item.spanner().placeBelow()) {
            ldata.setPosY(0.0)
        }

        const trill: Trill = item.trill()
        const accidentalGoesBelow = trill.trillType() === TrillType.DOWNPRALL_LINE
        const ornament = trill.ornament()
        if (ornament) {
            if (item.isSingleBeginType()) {
                SingleLayout.layoutArticulation(ornament, ctx)
            }
            trill.setAccidental(accidentalGoesBelow ? ornament.accidentalBelow() : ornament.accidentalAbove())
            trill.setCueNoteChord(ornament.cueNoteChord())
            const anchor = ornament.anchor()
            if (anchor === ArticulationAnchor.AUTO) {
                trill.setPlacement(trill.track() % 2 ? PlacementV.BELOW : PlacementV.ABOVE)
            } else {
                trill.setPlacement(anchor === ArticulationAnchor.TOP ? PlacementV.ABOVE : PlacementV.BELOW)
            }
            trill.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.STYLED) // Ensures that the property isn't written (it is written by the ornamnent)
        }

        if (item.isSingleType() || item.isBeginType()) {
            switch (trill.trillType()) {
            case TrillType.TRILL_LINE:
                item.symbolLine(SymId.ornamentTrill, SymId.wiggleTrill)
                break
            case TrillType.PRALLPRALL_LINE:
                item.symbolLine(SymId.wiggleTrill, SymId.wiggleTrill)
                break
            case TrillType.UPPRALL_LINE:
                item.symbolLine(SymId.ornamentBottomLeftConcaveStroke, SymId.ornamentZigZagLineNoRightEnd, SymId.ornamentZigZagLineWithRightEnd)
                break
            case TrillType.DOWNPRALL_LINE:
                item.symbolLine(SymId.ornamentLeftVerticalStroke, SymId.ornamentZigZagLineNoRightEnd, SymId.ornamentZigZagLineWithRightEnd)
                break
            }
            const a = trill.accidental()
            if (a) {
                const vertMargin = 0.35 * item.spatium()
                const box = item.symBbox(item.symbols()[0])
                const x = 0.5 * (box.width() - a.width())
                const minVertDist = accidentalGoesBelow
                    ? new Shape(box).minVerticalDistance(a.shape())
                    : a.shape().minVerticalDistance(new Shape(box))
                const y = accidentalGoesBelow ? minVertDist + vertMargin : -minVertDist - vertMargin
                a.setPos(x, y)
                a.setParent(item)
            }
        } else {
            item.symbolLine(SymId.wiggleTrill, SymId.wiggleTrill)
        }

        item.setOffset(new PointF())
    }

    static layoutVibratoSegment(item: VibratoSegment): void {
        const ldata = item.mutldata()
        if (item.spanner().placeBelow()) {
            ldata.setPosY(0.0)
        }

        switch (item.vibrato().vibratoType()) {
        case VibratoType.GUITAR_VIBRATO:
            item.symbolLine(SymId.guitarVibratoStroke, SymId.guitarVibratoStroke)
            break
        case VibratoType.GUITAR_VIBRATO_WIDE:
            item.symbolLine(SymId.guitarWideVibratoStroke, SymId.guitarWideVibratoStroke)
            break
        case VibratoType.VIBRATO_SAWTOOTH:
            item.symbolLine(SymId.wiggleSawtooth, SymId.wiggleSawtooth)
            break
        case VibratoType.VIBRATO_SAWTOOTH_WIDE:
            item.symbolLine(SymId.wiggleSawtoothWide, SymId.wiggleSawtoothWide)
            break
        default:
            break
        }

        item.setOffset(new PointF())
    }

    static layoutVoltaSegment(item: VoltaSegment, ctx: Context): void {
        SingleLayout.layoutTextLineBaseSegment(item, ctx)
        item.setOffset(new PointF())

        const spatium = ctx.spatium()
        const hookHeight = item.volta().beginHookHeight().val() * spatium
        const text = item.text()
        if (text) {
            text.setParent(item)
            const textBBox = text.ldata().bbox().translated(text.pos())
            text.mutldata().moveY(hookHeight - textBBox.bottom())
            text.mutldata().moveX(0.5 * spatium)
        }
    }

    // ---------------------------------------------------------------------------------
    //   text
    // ---------------------------------------------------------------------------------

    static layoutChordBracket(item: ChordBracket, ctx: Context): void {
        const ldata = item.mutldata()

        ldata.arpeggioHeight = item.spatium() * 2
        ldata.top = 0.0
        ldata.bottom = ldata.arpeggioHeight
        ldata.setMag(1)
        ldata.magS = 1

        const w = ctx.style().styleS(Sid.chordBracketHookLen).val() * item.spatium()
        ldata.setBbox(new RectF(0.0, ldata.top, w, ldata.bottom))
    }

    static layoutImage(item: Image): void {
        item.init()

        const imageSize = item.size()

        const ldata = item.mutldata()
        ldata.setPos(new PointF())
        const px = item.size2pixel(imageSize)
        ldata.setBbox(new RectF(0, 0, px.width(), px.height()))
    }

    static layoutStringTunings(item: StringTunings, ctx: Context): void {
        SingleLayout.layoutTextBase(item, ctx)

        const spatium = item.spatium()
        for (const block of item.mutldata().blocks) {
            for (const fragment of block.fragments()) {
                const font = fragment.font(item)
                if (font.type() !== FontType.MusicSymbol) {
                    // HACK: the music symbol doesn't have a good baseline
                    // to go with text so we correct text here
                    const baselineAdjustment = 0.35 * spatium * item.symbolScale()
                    fragment.pos.setY(fragment.pos.y() - baselineAdjustment)
                }
            }
        }
    }

    static layoutTapping(item: Tapping, ctx: Context): void {
        let text = item.tappingText()

        if (!text) {
            text = new TappingText(item)
        }

        text.setParent(item)
        item.setTappingText(text)
        text.setTrack(item.track())
        // C++ DO_ASSERT(item->hand() != TappingHand::INVALID)
        text.setXmlText(item.hand() === TappingHand.LEFT ? 'l.h. tap' : 'r.h. tap')
        text.setAlign(new Align(AlignH.HCENTER, AlignV.BASELINE))

        SingleLayout.layoutTextBase(text, ctx)

        item.setbbox(text.ldata().bbox())
    }

    static layoutTextBase(item: TextBase, ctx: Context, ldata: TextBaseLayoutData = item.mutldata()): void {
        ldata.setPos(new PointF())
        item.setOffset(new PointF())

        if (item.placeBelow()) {
            ldata.setPosY(0.0)
        }

        SingleLayout.layout1TextBase(item, ctx, ldata)
    }

    private static textHorizontalLayout(item: TextBase, shape: Shape, maxBlockWidth: number, ldata: TextBaseLayoutData): void {
        // Position and alignment
        for (const textBlock of ldata.blocks) {
            let xAdj = -textBlock.boundingRect().left()

            // Set position relative to reference point
            const position = item.position()
            if (position === AlignH.HCENTER) {
                xAdj -= maxBlockWidth * 0.5
            } else if (position === AlignH.RIGHT) {
                xAdj -= maxBlockWidth
            }

            const diff = maxBlockWidth - textBlock.boundingRect().width()
            if (!RealIsNull(diff)) {
                // Align relative to the longest line
                const alignH = item.align().horizontal
                if (alignH === AlignH.HCENTER) {
                    xAdj += diff * 0.5
                } else if (alignH === AlignH.RIGHT) {
                    xAdj += diff
                }
            }

            for (const f of textBlock.fragments()) {
                f.pos.setX(f.pos.x() + xAdj)
            }
            textBlock.shape().translate(new PointF(xAdj, 0.0))
            shape.add(textBlock.shape().translated(new PointF(0.0, textBlock.y())))
        }
    }

    static layout1TextBase(item: TextBase, _ctx: Context, ldata: TextBaseLayoutData): void {
        if (ldata.layoutInvalid) {
            item.createBlocks(ldata)
        }

        let y = 0
        let maxBlockWidth = -Number.MAX_VALUE
        // adjust the bounding box for the text item
        for (const t of ldata.blocks) {
            TextLayout.layoutTextBlock(t, item)
            y += t.lineSpacing()
            t.setY(y)
            maxBlockWidth = Math.max(maxBlockWidth, t.boundingRect().width())
        }

        const shape = new Shape()
        SingleLayout.textHorizontalLayout(item, shape, maxBlockWidth, ldata)

        let bb = shape.bbox()

        let yoff = 0
        const h = 0

        ldata.setPos(new PointF())

        const valign = item.align().vertical
        if (valign === AlignV.BOTTOM) {
            yoff += h - bb.bottom()
        } else if (valign === AlignV.VCENTER) {
            yoff += (h - (bb.top() + bb.bottom())) * 0.5
        } else if (valign === AlignV.BASELINE) {
            yoff += h * 0.5 - ldata.blocks[0].lineSpacing()
        } else {
            yoff += -bb.top()
        }

        for (const t of ldata.blocks) {
            t.setY(t.y() + yoff)
        }

        bb = bb.translated(0.0, yoff)

        ldata.setBbox(bb)
        if (item.hasFrame()) {
            item.layoutFrame(ldata)
        }
    }

    // ---------------------------------------------------------------------------------
    //   lines
    // ---------------------------------------------------------------------------------

    /** C++ SLine::setLen (palette lines): one segment of the given length */
    private static setLen(item: SLine, l: number, ctx: Context): void {
        if (item.spannerSegments().length === 0) {
            item.add(item.createLineSegment(ctx.dummyParent().system()))
        }
        const s = item.frontSegment()
        s.setPos(new PointF())
        s.setPos2(new PointF(l, 0))
    }

    static layoutLine(item: SLine, ctx: Context): void {
        if (item.spannerSegments().length === 0) {
            SingleLayout.setLen(item, ctx.spatium() * 8, ctx)
        }

        const lineSegm = item.frontSegment()
        SingleLayout.layoutLineSegment(lineSegm, ctx)

        item.setbbox(lineSegm.ldata().bbox())
    }

    /** the System text line of the palettes (C++ systemTextLine->setLen(12 * spatium)) */
    static setLineLength(item: SLine, length: number): void {
        SingleLayout.setLen(item, length, new Context(item.score()))
    }

    // Extends lines to fill the corner between them.
    // Assumes that l1p2 == l2p1 is the intersection between the lines.
    // If checkAngle is false, assumes that the lines are perpendicular, and some calculations are saved.
    private static extendLines(l1p1: PointF, l1p2: PointF, l2p1: PointF, l2p2: PointF, lineWidth: number, checkAngle: boolean): void {
        const l1UnitVector = l1p2.minus(l1p1).normalized()
        const l2UnitVector = l2p1.minus(l2p2).normalized()
        let addedLength = lineWidth * 0.5
        if (checkAngle) {
            const angle = Math.PI - Math.acos(PointF.dotProduct(l1UnitVector, l2UnitVector))
            if (angle <= Math.PI / 2) {
                addedLength *= Math.tan(0.5 * angle)
            }
        }
        const a = l1p2.plus(l1UnitVector.times(addedLength))
        l1p2.setX(a.x()); l1p2.setY(a.y())
        const b = l2p1.plus(l2UnitVector.times(addedLength))
        l2p1.setX(b.x()); l2p1.setY(b.y())
    }

    private static createArrow(start: boolean, filled: boolean, startPoint: PointF, endPoint: PointF, tl: TextLineBase): PolygonF {
        let arrowWidth: number
        let arrowHeight: number
        if (filled) {
            arrowWidth = tl.absoluteFromSpatium(start ? tl.beginFilledArrowWidth() : tl.endFilledArrowWidth())
            arrowHeight = tl.absoluteFromSpatium(start ? tl.beginFilledArrowHeight() : tl.endFilledArrowHeight())
        } else {
            arrowWidth = tl.absoluteFromSpatium(start ? tl.beginLineArrowWidth() : tl.endLineArrowWidth())
            arrowHeight = tl.absoluteFromSpatium(start ? tl.beginLineArrowHeight() : tl.endLineArrowHeight())
        }

        let pts: PointF[]
        if (start) {
            pts = [new PointF(0.0, -arrowHeight / 2), new PointF(-arrowWidth, 0.0), new PointF(0.0, arrowHeight / 2)] // left
        } else {
            pts = [new PointF(0.0, -arrowHeight / 2), new PointF(arrowWidth, 0.0), new PointF(0.0, arrowHeight / 2)] // right
        }
        const arrowAdjust = new PointF(arrowWidth, 0.0).times(start ? 1.0 : -1.0)
        pts = pts.map(p => p.plus(arrowAdjust))

        const yDiff = endPoint.y() - startPoint.y()
        const xDiff = endPoint.x() - startPoint.x()
        const rotate = Math.atan(yDiff / xDiff) + (endPoint.x() < startPoint.x() ? Math.PI : 0.0)
        const t = new Transform()
        t.rotateRadians(rotate)
        pts = pts.map(p => t.map(p).plus(start ? startPoint : endPoint))

        const unitVector = endPoint.minus(startPoint).normalized()
        const reduction = filled ? arrowWidth : tl.absoluteFromSpatium(tl.lineWidth()) / 2
        if (start) {
            const n = startPoint.plus(unitVector.times(reduction))
            startPoint.setX(n.x()); startPoint.setY(n.y())
        } else {
            const n = endPoint.minus(unitVector.times(reduction))
            endPoint.setX(n.x()); endPoint.setY(n.y())
        }
        return new PolygonF(...pts)
    }

    static layoutTextLineBaseSegment(item: TextLineBaseSegment, ctx: Context): void {
        const ldata = item.mutldata()
        ldata.npoints = 0
        const tl = item.textLineBase()
        const spatium = tl.spatium()
        const isSingleOrBegin = item.isSingleBeginType()
        const isSingleOrEnd = item.isSingleEndType()
        const isDottedLine = tl.lineStyle() === LineType.DOTTED
        const lineWidth = tl.absoluteFromSpatium(tl.lineWidth())

        if (!tl.diagonal()) {
            item.setUserYoffset2(0)
        }

        const alignBaseLine = (text: Text, pp1: PointF, pp2: PointF): void => {
            const d = lineWidth / 2
            switch (text.align().vertical) {
            case AlignV.TOP:
                pp1.setY(pp1.y() + d)
                pp2.setY(pp2.y() + d)
                break
            case AlignV.VCENTER:
                break
            case AlignV.BOTTOM:
            case AlignV.BASELINE:
                pp1.setY(pp1.y() - d)
                pp2.setY(pp2.y() - d)
                break
            }
        }

        const text = item.text()
        const endText = item.endText()
        if (isSingleOrBegin) {
            text.setXmlText(tl.beginText())
            text.setFamily(tl.beginFontFamily())
            text.setSize(tl.beginFontSize())
            text.setSymbolScale(tl.beginTextMusicalSymbolsScale())
            text.setSymbolSize(tl.beginTextMusicSymbolsSize())
            text.setOffset(tl.beginTextOffset().times(item.mag()))
            text.setAlign(tl.beginTextAlign())
            text.setPosition(tl.beginTextPosition())
            text.setFontStyle(tl.beginFontStyle())
        } else {
            text.setXmlText(tl.continueText())
            text.setFamily(tl.continueFontFamily())
            text.setSize(tl.continueFontSize())
            text.setSymbolScale(tl.continueTextMusicalSymbolsScale())
            text.setSymbolSize(tl.continueTextMusicSymbolsSize())
            text.setOffset(tl.continueTextOffset().times(item.mag()))
            text.setAlign(tl.continueTextAlign())
            text.setPosition(tl.continueTextPosition())
            text.setFontStyle(tl.continueFontStyle())
        }
        text.setPlacement(PlacementV.ABOVE)
        text.setTrack(item.track())
        text.setColor(tl.lineColor())
        SingleLayout.layoutTextBase(text, ctx)

        if (isSingleOrEnd) {
            endText.setXmlText(tl.endText())
            endText.setFamily(tl.endFontFamily())
            endText.setSize(tl.endFontSize())
            endText.setSymbolScale(tl.endTextMusicalSymbolsScale())
            endText.setSymbolSize(tl.endTextMusicSymbolsSize())
            endText.setOffset(tl.endTextOffset().times(item.mag()))
            endText.setAlign(tl.endTextAlign())
            endText.setPosition(tl.endTextPosition())
            endText.setFontStyle(tl.endFontStyle())
            endText.setPlacement(PlacementV.ABOVE)
            endText.setTrack(item.track())
            endText.setColor(tl.lineColor())
            SingleLayout.layoutTextBase(endText, ctx)
        } else {
            endText.setXmlText('')
        }

        if (!item.textLineBase().textSizeSpatiumDependent()) {
            text.setSize(text.size() * item.defaultSpatium() / item.spatium())
            endText.setSize(endText.size() * item.defaultSpatium() / item.spatium())
        }

        const pp1 = new PointF()
        const pp2 = item.pos2()

        // line with no text or hooks - just use the basic rectangle for line
        if (text.empty() && endText.empty()
            && (!isSingleOrBegin || tl.beginHookType() === HookType.NONE)
            && (!isSingleOrEnd || tl.endHookType() === HookType.NONE)) {
            ldata.npoints = 2
            ldata.points[0] = pp1.clone()
            ldata.points[1] = pp2.clone()
            ldata.lineLength = Math.sqrt(PointF.dotProduct(pp2.minus(pp1), pp2.minus(pp1)))
            item.setbbox(TextLineBaseSegment.boundingBoxOfLine(pp1, pp2, lineWidth / 2, isDottedLine))
            return
        }

        let l1 = 0.0
        let l2 = 0.0
        const gapBetweenTextAndLine = spatium * tl.gapBetweenTextAndLine().val()

        const alignBeginText = tl.beginTextPlace() === TextPlace.LEFT || tl.beginTextPlace() === TextPlace.AUTO
        const alignContinueText = tl.continueTextPlace() === TextPlace.LEFT || tl.continueTextPlace() === TextPlace.AUTO
        const alignEndText = tl.endTextPlace() === TextPlace.LEFT || tl.endTextPlace() === TextPlace.AUTO
        const hasBeginText = !text.empty() && isSingleOrBegin
        const hasContinueText = !text.empty() && !isSingleOrBegin
        const hasEndText = !endText.empty() && isSingleOrEnd

        const shape = new Shape()

        if (!text.empty()) {
            if ((isSingleOrBegin && alignBeginText) || (!isSingleOrBegin && alignContinueText)) {
                l1 = gapBetweenTextAndLine
                switch (text.position()) {
                case AlignH.LEFT:
                    l1 += text.ldata().bbox().width()
                    break
                case AlignH.HCENTER:
                    l1 += text.ldata().bbox().width() / 2
                    break
                default:
                    break
                }
            }
            shape.add(text.ldata().bbox().translated(text.pos()), item)
        }
        // set end text position and extend bbox
        if (!endText.empty()) {
            if (alignEndText) {
                l2 = gapBetweenTextAndLine
                switch (endText.position()) {
                case AlignH.RIGHT:
                    l2 += endText.ldata().bbox().width()
                    break
                case AlignH.HCENTER:
                    l2 += endText.ldata().bbox().width() / 2
                    break
                default:
                    break
                }
            }
            const endTextX = Math.max(pp2.x(), shape.bbox().right() + l2) // prevent end text from overlapping begin text
            endText.mutldata().setPosX(endTextX)
            shape.add(endText.ldata().bbox().translated(endText.pos()), item)
        }

        let beginHookDrawnSeparately = false
        let endHookDrawnSeparately = false

        if (tl.lineVisible()) {
            pp1.setX(pp1.x() + l1)
            pp2.setX(pp2.x() - l2)

            // Make sure baseline of text and line are properly aligned (accounting for line thickness)
            if ((hasBeginText && alignBeginText) || (hasContinueText && alignContinueText)) {
                alignBaseLine(text, pp1, pp2)
            } else if (hasEndText && alignEndText) {
                alignBaseLine(endText, pp1, pp2)
            }

            const beginHookHeight = (tl.placeBelow() ? -1.0 : 1.0) * tl.beginHookHeight().val() * spatium
            const endHookHeight = (tl.placeBelow() ? -1.0 : 1.0) * tl.endHookHeight().val() * spatium

            let beginHookWidth = 0.0
            let endHookWidth = 0.0

            if (tl.beginHookType() === HookType.HOOK_45) {
                beginHookWidth = Math.abs(beginHookHeight * 0.4)
                pp1.setX(pp1.x() + beginHookWidth)
            }
            if (tl.endHookType() === HookType.HOOK_45) {
                endHookWidth = Math.abs(endHookHeight * 0.4)
                pp2.setX(pp2.x() - endHookWidth)
            }

            // don't draw backwards lines (or hooks) if text is longer than nominal line length
            if (!text.empty() && pp1.x() > pp2.x() && !tl.diagonal()) {
                ldata.setShape(shape)
                return
            }

            const beginArrow = isSingleOrBegin && (tl.beginHookType() === HookType.ARROW_FILLED || tl.beginHookType() === HookType.ARROW)
            const endArrow = isSingleOrEnd && (tl.endHookType() === HookType.ARROW_FILLED || tl.endHookType() === HookType.ARROW)

            if (beginArrow) {
                ldata.beginArrow = SingleLayout.createArrow(true, tl.beginHookType() === HookType.ARROW_FILLED, pp1, pp2, tl)
                shape.add(ldata.beginArrow.boundingRect(), item)
            }
            if (endArrow) {
                ldata.endArrow = SingleLayout.createArrow(false, tl.endHookType() === HookType.ARROW_FILLED, pp1, pp2, tl)
                shape.add(ldata.endArrow.boundingRect(), item)
            }

            const hasHook = (type: HookType): boolean =>
                type === HookType.HOOK_45 || type === HookType.HOOK_90 || type === HookType.HOOK_90T

            const beginHook = isSingleOrBegin && hasHook(tl.beginHookType())
            const endHook = isSingleOrEnd && hasHook(tl.endHookType())

            if (beginHook) {
                // We use the term "endpoint" for the point that does not touch the main line.
                const beginHookEndpoint = ldata.points[ldata.npoints++] = new PointF(pp1.x() - beginHookWidth, pp1.y() + beginHookHeight)
                if (tl.beginHookType() === HookType.HOOK_90T) {
                    // A T-hook needs to be drawn separately, so we add an extra point
                    beginHookDrawnSeparately = true
                    ldata.points[ldata.npoints++] = new PointF(pp1.x() - beginHookWidth, pp1.y() - beginHookHeight)
                } else if (tl.lineStyle() !== LineType.SOLID) {
                    // For non-solid lines, we also draw the hook separately,
                    // so that we can distribute the dashes/dots for each linepiece individually
                    beginHookDrawnSeparately = true
                    const beginHookStartpoint = ldata.points[ldata.npoints++] = pp1.clone()
                    if (tl.lineStyle() === LineType.DASHED) {
                        // For dashes lines, we extend the lines somewhat, so that the corner between them gets filled
                        const checkAngle = tl.beginHookType() === HookType.HOOK_45 || tl.diagonal()
                        SingleLayout.extendLines(beginHookEndpoint, beginHookStartpoint, pp1, pp2, lineWidth, checkAngle)
                    }
                }
            }

            const pp1Idx = ldata.npoints
            ldata.points[ldata.npoints++] = pp1
            const pp22 = ldata.points[ldata.npoints++] = pp2 // Keep a reference so that we can modify later

            if (endHook) {
                const endHookEndpoint = new PointF(pp2.x() + endHookWidth, pp2.y() + endHookHeight)
                if (tl.endHookType() === HookType.HOOK_90T) {
                    // A T-hook needs to be drawn separately, so we add an extra point
                    endHookDrawnSeparately = true
                    ldata.points[ldata.npoints++] = new PointF(pp2.x() + endHookWidth, pp2.y() - endHookHeight)
                } else if (tl.lineStyle() !== LineType.SOLID) {
                    // For non-solid lines, we also draw the hook separately,
                    // so that we can distribute the dashes/dots for each linepiece individually
                    endHookDrawnSeparately = true
                    const endHookStartpoint = ldata.points[ldata.npoints++] = pp2.clone()
                    if (tl.lineStyle() === LineType.DASHED) {
                        // For dashes lines, we extend the lines somewhat, so that the corner between them gets filled
                        const checkAngle = tl.endHookType() === HookType.HOOK_45 || tl.diagonal()
                        SingleLayout.extendLines(ldata.points[pp1Idx], pp22, endHookStartpoint, endHookEndpoint, lineWidth, checkAngle)
                    }
                }
                ldata.points[ldata.npoints++] = endHookEndpoint
            }

            ldata.lineLength = Math.sqrt(PointF.dotProduct(pp22.minus(pp1), pp22.minus(pp1)))
        }

        // Calculate shape of line
        let start = 0
        if (beginHookDrawnSeparately) {
            const p1 = ldata.points[start++]
            const p2 = ldata.points[start++]
            shape.add(TextLineBaseSegment.boundingBoxOfLine(p1, p2, lineWidth / 2, isDottedLine), item)
        }
        let end = ldata.npoints
        if (endHookDrawnSeparately) {
            const p1 = ldata.points[--end]
            const p2 = ldata.points[--end]
            shape.add(TextLineBaseSegment.boundingBoxOfLine(p1, p2, lineWidth / 2, isDottedLine), item)
        }
        for (let i = start; i < end - 1; ++i) {
            shape.add(TextLineBaseSegment.boundingBoxOfLine(ldata.points[i], ldata.points[i + 1], lineWidth / 2, isDottedLine), item,
                !tl.lineVisible())
        }

        ldata.setShape(shape)
    }
}
