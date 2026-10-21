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

import { LineF, PointF, PolygonF, RectF, SizeF } from '../../../framework/draw/types/geometry'
import { PainterPath } from '../../../framework/draw/types/painterpath'
import type { Color } from '../../../framework/draw/types/color'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { Fraction } from '../../types/fraction'
import { SmuflAnchorId, SymId } from '../../types/symid'
import { AlignH, AlignV, BarLineType, BracketType, ClefType, DirectionH, DirectionV, ElementType, Key, KeySigNatural, NoteHeadGroup, NoteHeadType,
    StaffGroup, TextStyleType, TimeSigPlacement, TimeSigStyle, VOICES, track2staff, SpannerSegmentType, LineType, PlacementV,
    HookType, TextPlace, Align, BeamMode, Orientation, staff2track, TrillType, ArpeggioType, GuitarBendType, ChordLineType, VibratoType, GlissandoStyle, nidx } from '../../types/types'
import { SymNames } from '../../types/symnames'
import { RealIsEqualOrLess, RealIsEqualOrMore, RealIsNull } from '../../../framework/global/realfn'
import { Pid, PropertyFlags } from '../../dom/property'
import { Autoplace } from './autoplace'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { ClefInfo } from '../../dom/clefinfo'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType } from '../../dom/segment'
import { BARLINE_SPAN_1LINESTAFF_FROM, BARLINE_SPAN_1LINESTAFF_TO, type BarLine, type BarLineLayoutData } from '../../dom/barline'
import { SpacerType } from '../../dom/spacer'
import { TimeSigType } from '../../dom/timesig'
import { Accidental, AccidentalBracket } from '../../dom/accidental'
import { isMarcatoArticulation, type ShadowNote } from '../../dom/shadownote'
import { AccidentalType } from '../../dom/accidentaldata'
import { KeySigEvent, type KeySym } from '../../dom/key'
import { Text } from '../../dom/text'
import { timeSigSymIdsFromString, yStaffDifference } from '../../dom/utils'
import { TConv } from '../../types/typesconv'
import type { Articulation } from '../../dom/articulation'
import type { Beam } from '../../dom/beam'
import type { Bracket } from '../../dom/bracket'
import type { Chord, GraceNotesGroup } from '../../dom/chord'
import type { Clef } from '../../dom/clef'
import type { EngravingItem } from '../../dom/engravingitem'
import type { FBox, HBox, TBox, VBox } from '../../dom/box'
import type { Hook } from '../../dom/hook'
import type { InstrumentName } from '../../dom/instrumentname'
import type { KeySig, KeySigLayoutData } from '../../dom/keysig'
import type { LayoutBreak } from '../../dom/layoutbreak'
import type { LedgerLine } from '../../dom/ledgerline'
import type { Lyrics } from '../../dom/lyrics'
import type { MeasureBase } from '../../dom/measurebase'
import type { MeasureNumber } from '../../dom/measurenumber'
import { DisplayFretOption, type Note } from '../../dom/note'
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
import type { TimeTickAnchor } from '../../dom/anchors'
import { Ambitus } from '../../dom/ambitus'
import { pitchIsValid, tpcIsValid } from '../../dom/pitchspelling'
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
import type { Breath } from '../../dom/breath'
import type { Dynamic } from '../../dom/dynamic'
import type { Expression } from '../../dom/expression'
import type { Fermata } from '../../dom/fermata'
import type { RehearsalMark } from '../../dom/rehearsalmark'
import type { StaffText, SystemText } from '../../dom/stafftextbase'
import type { TempoText } from '../../dom/tempotext'
import { DynamicsLayout } from './dynamicslayout'
import type { MMRest } from '../../dom/mmrest'
import { Hairpin, HairpinSegment, HairpinType } from '../../dom/hairpin'
import { SLine, type LineSegment } from '../../dom/line'
import type { LyricsLine, LyricsLineSegment } from '../../dom/lyricsline'
import type { OttavaSegment } from '../../dom/ottava'
import type { Pedal, PedalSegment } from '../../dom/pedal'
import { TextLineBaseSegment, type TextLineBase } from '../../dom/textlinebase'
import type { TextLineSegment } from '../../dom/textline'
import type { Volta, VoltaSegment } from '../../dom/volta'
import { Transform } from '../../../framework/draw/types/transform'
import { Grip } from '../../editing/editdata'
import { Spatium } from '../../types/dimension'
import { OffsetChange, type LayoutData } from '../../dom/engravingitem'
import { TabBeamGrid, type TabDurationSymbol } from '../../dom/tabdurationsymbol'
import type { Marker } from '../../dom/marker'
import type { Jump } from '../../dom/jump'
import { MarkerLayout } from './markerlayout'
import type { Measure } from '../../dom/measure'
import type { Harmony } from '../../dom/harmony'
import type { Parenthesis } from '../../dom/parenthesis'
import { HarmonyLayout } from './harmonylayout'
import { ParenthesisLayout } from './parenthesislayout'
import { FingeringItem, type FretDiagram } from '../../dom/fret'
import type { Ornament } from '../../dom/ornament'
import { AccidentalsLayout } from './accidentalslayout'
import type { ChordRest } from '../../dom/chordrest'
import type { TrillSegment } from '../../dom/trill'
import { ArticulationAnchor } from '../../dom/articulation'
import { ArpeggioLayout } from './arpeggiolayout'
import type { Arpeggio } from '../../dom/arpeggio'
import { TremoloLayout } from './tremololayout'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { StaffTypeChange } from '../../dom/stafftypechange'
import type { LaissezVib } from '../../dom/laissezvib'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import type { GuitarBend, GuitarBendHoldSegment, GuitarBendSegment } from '../../dom/guitarbend'
import type { Staff } from '../../dom/staff'
import type { VibratoSegment } from '../../dom/vibrato'
import type { Glissando, GlissandoSegment } from '../../dom/glissando'
import type { Fingering } from '../../dom/fingering'
import type { ChordLine } from '../../dom/chordline'
import type { HammerOnPullOffSegment } from '../../dom/hammeronpulloff'
import type { GradualTempoChangeSegment } from '../../dom/gradualtempochange'
import { SkylineLine } from '../../infrastructure/skyline'
import { GuitarBendLayout } from './guitarbendlayout'
import { MeasureLayout } from './measurelayout'

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
    static layoutTimeTickAnchor(item: TimeTickAnchor, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const st = item.staffType()
        ldata.setPos(0.0, 0.0)
        const width = item.segment().width()
        let height = item.staff()!.staffHeight()
        if (st && st.lines() === 1) {
            // Special case for single line staves
            const lineDist = st.lineDistance().val() * item.spatium()
            ldata.setPosY(-lineDist)
            height = lineDist * 2
        }
        ldata.setBbox(0.0, 0.0, width, height)
    }

    static layoutItem(item: EngravingItem, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TLayout.layoutAccidental(item as Accidental, ctx); break
        case ElementType.ARTICULATION: TLayout.layoutArticulation(item as Articulation, ctx); break
        case ElementType.ORNAMENT: TLayout.layoutOrnament(item as Ornament, ctx); break
        case ElementType.ARPEGGIO: TLayout.layoutArpeggio(item as Arpeggio, ctx); break
        case ElementType.AMBITUS: TLayout.layoutAmbitus(item as Ambitus, ctx); break
        case ElementType.LAISSEZ_VIB: break // C++ TLayout::layoutLaissezVib() does nothing
        case ElementType.STAFFTYPE_CHANGE: TLayout.layoutStaffTypeChange(item as StaffTypeChange, ctx); break
        case ElementType.TREMOLO_SINGLECHORD: TremoloLayout.layoutSingleChord(item as TremoloSingleChord, ctx); break
        case ElementType.TREMOLO_TWOCHORD: TremoloLayout.layoutTwoChord(item as TremoloTwoChord, ctx); break
        case ElementType.BAR_LINE: TLayout.layoutBarLine(item as BarLine, ctx); break
        case ElementType.BEAM: TLayout.layoutBeam(item as Beam, ctx); break
        case ElementType.HBOX: TLayout.layoutHBox(item as HBox, ctx); break
        case ElementType.VBOX: TLayout.layoutVBox(item as VBox, ctx); break
        case ElementType.TBOX: TLayout.layoutTBox(item as TBox, ctx); break
        case ElementType.FBOX: BoxLayout.layoutFBox(item as FBox, ctx); break
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
        case ElementType.MMREST: TLayout.layoutMMRest(item as MMRest, ctx); break
        case ElementType.MEASURE_REPEAT: TLayout.layoutMeasureRepeat(item as MeasureRepeat, ctx); break
        case ElementType.HAIRPIN: TLayout.layoutHairpin(item as Hairpin, ctx); break
        case ElementType.HAIRPIN_SEGMENT: TLayout.layoutHairpinSegment(item as HairpinSegment, ctx); break
        case ElementType.TEXTLINE:
        case ElementType.OTTAVA:
        case ElementType.PEDAL:
        case ElementType.VOLTA:
        case ElementType.LET_RING:
        case ElementType.PALM_MUTE:
        case ElementType.TRILL:
        case ElementType.WHAMMY_BAR:
        case ElementType.VIBRATO:
        case ElementType.GRADUAL_TEMPO_CHANGE:
            TLayout.layoutLine(item as SLine, ctx)
            break
        case ElementType.TRILL_SEGMENT: TLayout.layoutTrillSegment(item as TrillSegment, ctx); break
        case ElementType.CHORDLINE: TLayout.layoutChordLine(item as ChordLine, ctx); break
        case ElementType.FINGERING: TLayout.layoutFingering(item as Fingering); break
        case ElementType.GLISSANDO: TLayout.layoutGlissando(item as Glissando, ctx); break
        case ElementType.GLISSANDO_SEGMENT: TLayout.layoutGlissandoSegment(item as GlissandoSegment); break
        case ElementType.GUITAR_BEND: TLayout.layoutGuitarBend(item as GuitarBend, ctx); break
        case ElementType.GUITAR_BEND_SEGMENT: TLayout.layoutGuitarBendSegment(item as GuitarBendSegment, ctx); break
        case ElementType.GUITAR_BEND_HOLD_SEGMENT: GuitarBendLayout.layoutHoldLine(item as GuitarBendHoldSegment); break
        case ElementType.LET_RING_SEGMENT:
            TLayout.layoutChordTextLineBaseSegment(item as TextLineBaseSegment, Sid.letRingShowTabCommon, Sid.letRingShowTabSimple, ctx)
            break
        case ElementType.PALM_MUTE_SEGMENT:
            TLayout.layoutChordTextLineBaseSegment(item as TextLineBaseSegment, Sid.palmMuteShowTabCommon, Sid.palmMuteShowTabSimple, ctx)
            break
        case ElementType.TEXTLINE_SEGMENT: TLayout.layoutTextLineSegment(item as TextLineSegment, ctx); break
        case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT:
            TLayout.layoutGradualTempoChangeSegment(item as GradualTempoChangeSegment, ctx)
            break
        case ElementType.VIBRATO_SEGMENT: TLayout.layoutVibratoSegment(item as VibratoSegment, ctx); break
        case ElementType.WHAMMY_BAR_SEGMENT: TLayout.layoutWhammyBarSegment(item as TextLineBaseSegment, ctx); break
        case ElementType.OTTAVA_SEGMENT: TLayout.layoutOttavaSegment(item as OttavaSegment, ctx); break
        case ElementType.PEDAL_SEGMENT: TLayout.layoutPedalSegment(item as PedalSegment, ctx); break
        case ElementType.VOLTA_SEGMENT: TLayout.layoutVoltaSegment(item as VoltaSegment, ctx); break
        case ElementType.LYRICSLINE: LyricsLayout.layoutLyricsLine(item as LyricsLine); break
        case ElementType.LYRICSLINE_SEGMENT: LyricsLayout.layoutLyricsLineSegment(item as LyricsLineSegment, ctx); break
        case ElementType.SLUR:
        case ElementType.HAMMER_ON_PULL_OFF:
            TLayout.layoutSlur(item as Slur, ctx)
            break
        case ElementType.HAMMER_ON_PULL_OFF_SEGMENT: TLayout.layoutHammerOnPullOffSegment(item as HammerOnPullOffSegment, ctx); break
        case ElementType.HAMMER_ON_PULL_OFF_TEXT: TextLayout.layoutBaseTextBase(item as TextBase, ctx); break
        case ElementType.SPACER: TLayout.layoutSpacer(item as Spacer, ctx); break
        case ElementType.STEM: TLayout.layoutStem(item as Stem, ctx); break
        case ElementType.STEM_SLASH: TLayout.layoutStemSlash(item as StemSlash, ctx); break
        case ElementType.SHADOW_NOTE: TLayout.layoutShadowNote(item as ShadowNote, ctx); break
        case ElementType.SYMBOL: TLayout.layoutSymbol(item as SymbolItem, ctx); break
        case ElementType.TEXT: TLayout.layoutText(item as Text, ctx); break
        case ElementType.TIE: TLayout.layoutTie(item as Tie, ctx); break
        case ElementType.TIMESIG: TLayout.layoutTimeSig(item as TimeSig, ctx); break
        case ElementType.TIME_TICK_ANCHOR: TLayout.layoutTimeTickAnchor(item as TimeTickAnchor, ctx); break
        case ElementType.TUPLET: TLayout.layoutTuplet(item as Tuplet, ctx); break
        case ElementType.BREATH: TLayout.layoutBreath(item as Breath, ctx); break
        case ElementType.DYNAMIC: TLayout.layoutDynamic(item as Dynamic, ctx); break
        case ElementType.EXPRESSION: TLayout.layoutExpression(item as Expression, ctx); break
        case ElementType.FERMATA: TLayout.layoutFermata(item as Fermata, ctx); break
        case ElementType.REHEARSAL_MARK: TLayout.layoutRehearsalMark(item as RehearsalMark, ctx); break
        case ElementType.MARKER: MarkerLayout.layoutMarker(item as Marker, ctx); break
        case ElementType.HARMONY: HarmonyLayout.layoutHarmony(item as Harmony, ctx); break
        case ElementType.FRET_DIAGRAM: TLayout.layoutFretDiagram(item as FretDiagram, ctx); break
        case ElementType.PARENTHESIS: ParenthesisLayout.layoutParenthesis(item as Parenthesis, ctx); break
        case ElementType.JUMP: TLayout.layoutJump(item as Jump, ctx); break
        case ElementType.STAFF_TEXT: TLayout.layoutStaffText(item as StaffText, ctx); break
        case ElementType.INSTRUMENT_CHANGE: TLayout.layoutInstrumentChange(item as TextBase, ctx); break
        case ElementType.SYSTEM_TEXT: TLayout.layoutSystemText(item as SystemText, ctx); break
        case ElementType.TEMPO_TEXT: TLayout.layoutTempoText(item as TempoText, ctx); break
        default:
            if (item.isTextBase()) {
                // TODO(port): specific text types (staff text, tempo text, rehearsal marks, ...)
                TextLayout.layoutBaseTextBase(item as unknown as TextBase, ctx)
            }
            // TODO(port): element type not ported yet
            break
        }
    }

    static layoutMeasureRepeat(item: MeasureRepeat, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        for (const e of item.el()) {
            switch (e.type()) {
            case ElementType.SYMBOL:
                TLayout.layoutSymbol(e as SymbolItem, ctx)
                break
            default:
                // TODO(port): DEAD_SLAPPED, IMAGE
                break
            }
        }

        switch (item.numMeasures()) {
        case 1: {
            ldata.setSymId(SymId.repeat1Bar)
            if (ctx.conf().styleB(Sid.mrNumberSeries) && item.track() !== nidx) {
                let placeInSeries = 2 // "1" would be the measure actually being repeated
                const staffIdx = item.staffIdx()
                let m: Measure | null = item.measure()
                while (m && m.isOneMeasureRepeat(staffIdx) && m.prevIsOneMeasureRepeat(staffIdx)) {
                    placeInSeries++
                    m = m.prevMeasure()
                }
                if (placeInSeries % ctx.conf().styleI(Sid.mrNumberEveryXMeasures) === 0) {
                    if (ctx.conf().styleB(Sid.mrNumberSeriesWithParentheses)) {
                        ldata.setNumberSym(`(${placeInSeries})`)
                    } else {
                        ldata.setNumberSym(placeInSeries)
                    }
                } else {
                    ldata.clearNumberSym()
                }
            } else if (ctx.conf().styleB(Sid.oneMeasureRepeatShow1)) {
                ldata.setNumberSym(1)
            } else {
                ldata.clearNumberSym()
            }
            break
        }
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

        const bbox = item.symBbox(ldata.symId)

        if (item.track() !== nidx) { // if this is in score rather than a palette cell
            // For unknown reasons, the symbol has some offset in almost all SMuFL fonts
            // We compensate for it, to make sure the symbol is visually centered around the staff line
            const offset = (-bbox.top() - bbox.bottom()) / 2.0

            const staffType = item.staffType()!

            // Only need to set y position here; x position is handled in MeasureLayout::layoutMeasureElements()
            ldata.setPos(0, Math.floor(staffType.middleLine() / 2.0) * staffType.lineDistance().val() * item.spatium() + offset)
        }

        ChordLayout.fillShape(item, ctx)
    }

    static layoutMeasureRepeatExtender(item: MeasureRepeat, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.extenderLineLeft = new LineF()
        ldata.extenderLineRight = new LineF()

        const parentMeasure = item.measure()
        if (!parentMeasure) {
            return
        }

        const startMeasure = parentMeasure.prevMeasure()
        if (!startMeasure || startMeasure.system() !== parentMeasure.system()) {
            return
        }

        let endMeasure = parentMeasure.nextMeasure()
        if (endMeasure) {
            endMeasure = endMeasure.nextMeasure()
        }
        if (!endMeasure || endMeasure.system() !== parentMeasure.system()) {
            return
        }

        // Reuse the function that calculates start and end pos for mmRests,
        // except start and end point are on different measures
        const staffIdx = item.staffIdx()
        let xStart = MeasureLayout.getMeasureStartEndPos(startMeasure, startMeasure.first(SegmentType.ChordRest)!, staffIdx,
            /*needHeaderException*/ startMeasure.header(), /*modernMMrest*/ true, ctx).x1
        let xEnd = MeasureLayout.getMeasureStartEndPos(endMeasure, endMeasure.first(SegmentType.ChordRest)!, staffIdx,
            /*needHeaderException*/ false, /*modernMRest*/ true, ctx).x2

        const margin = ctx.conf().styleMM(Sid.multiMeasureRestMargin)
        xStart += margin
        xEnd -= margin

        const xItemInSysCoords = item.x() + item.segment()!.x() + parentMeasure.x()

        const startPoint = new PointF(xStart + startMeasure.x() - xItemInSysCoords, 0.0)
        const midPointL = new PointF(-0.5 * item.spatium(), 0.0)
        ldata.extenderLineLeft = new LineF(startPoint, midPointL)

        const midPointR = new PointF(item.symWidth(ldata.symId) + 0.5 * item.spatium(), 0.0)
        const endPoint = new PointF(xEnd + endMeasure.x() - xItemInSysCoords, 0.0)
        ldata.extenderLineRight = new LineF(midPointR, endPoint)
    }

    static layoutMMRest(item: MMRest, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        // TODO(port): dead slapped, symbols and images attached to the rest (item.el())

        //! NOTE This is not look like layout data, perhaps this is should be set not here
        ldata.number = item.measure().mmRestCount()
        ldata.setNumberSym(ldata.number)
        ldata.yNumberPos = ctx.conf().styleMM(Sid.mmRestNumberPos)

        const staff = item.staff()!
        if (staff.lines(item.tick()) === 1) {
            ldata.yNumberPos = Math.min(ldata.yNumberPos, -item.spatium())
        }

        if (item.isOldStyle()) {
            const restSyms: SymId[] = []
            let symsWidth = 0.0
            let remaining = ldata.number
            const spacing = ctx.conf().styleMM(Sid.mmRestOldStyleSpacing)
            while (remaining > 0) {
                let sym: SymId
                if (remaining >= 4) {
                    sym = SymId.restLonga
                    remaining -= 4
                } else if (remaining >= 2) {
                    sym = SymId.restDoubleWhole
                    remaining -= 2
                } else {
                    sym = SymId.restWhole
                    remaining -= 1
                }
                restSyms.push(sym)
                symsWidth += item.symBbox(sym).width()
                if (remaining > 0) { // do not add spacing after last symbol
                    symsWidth += spacing
                }
            }
            ldata.restSyms = restSyms
            ldata.symsWidth = symsWidth
        }

        // Only need to set y position here; x position is handled in MeasureLayout::layoutMeasureElements()
        const staffType = item.staffType()!
        let midline = staffType.middleLine() / 2.0
        if (item.isOldStyle()) {
            midline = Math.max(1.0, midline)
        }
        ldata.setPos(0, midline * staffType.lineDistance().val() * item.spatium())

        ChordLayout.fillShape(item, ctx)
    }

    // ---------------------------------------------------------
    //   lines
    // ---------------------------------------------------------

    static layoutLine(item: SLine, ctx: LayoutContext): void {
        item.computeStartElement()
        item.computeEndElement()

        const { pos: p1, system: s1 } = item.linePos(Grip.START)
        const { pos: p2, system: s2 } = item.linePos(Grip.END)

        const systems = ctx.dom().systems()
        const sysIdx1 = s1 ? systems.indexOf(s1) : -1
        const sysIdx2 = s2 ? systems.indexOf(s2) : -1
        if (sysIdx1 === -1 || sysIdx2 === -1) {
            return
        }

        let segmentsNeeded = 0
        for (let i = sysIdx1; i <= sysIdx2; ++i) {
            if (!systems[i].vbox()) {
                ++segmentsNeeded
            }
        }

        const segCount = item.spannerSegments().length
        if (segmentsNeeded !== segCount) {
            item.fixupSegments(segmentsNeeded, (parent) => item.createLineSegment(parent))
            if (segmentsNeeded > segCount) {
                for (let i = segCount; i < segmentsNeeded; ++i) {
                    const lineSegm = item.segmentAt(i)
                    // set user offset to previous segment's offset
                    if (segCount > 0) {
                        lineSegm.setOffset(new PointF(0, item.segmentAt(i - 1).offset().y()))
                    } else {
                        lineSegm.setOffset(new PointF(0, item.offset().y()))
                    }
                }
            }
        }

        let segIdx = 0
        for (let i = sysIdx1; i <= sysIdx2; ++i) {
            const system = systems[i]
            if (system.vbox()) {
                continue
            }
            const lineSegm = item.segmentAt(segIdx++)
            lineSegm.setTrack(item.track())
            lineSegm.setSystem(system)

            if (sysIdx1 === sysIdx2) {
                // single segment
                lineSegm.setSpannerSegmentType(SpannerSegmentType.SINGLE)
                const len = p2.x() - p1.x()
                lineSegm.setPos(p1)
                lineSegm.setPos2(new PointF(len, p2.y() - p1.y()))
            } else if (i === sysIdx1) {
                // start segment
                lineSegm.setSpannerSegmentType(SpannerSegmentType.BEGIN)
                lineSegm.setPos(p1)
                const x2 = system.endingXForOpenEndedLines()
                lineSegm.setPos2(new PointF(x2 - p1.x(), 0.0))
            } else if (i > 0 && i !== sysIdx2) {
                // middle segment
                lineSegm.setSpannerSegmentType(SpannerSegmentType.MIDDLE)
                const x1 = system.firstNoteRestSegmentX(true)
                const x2 = system.endingXForOpenEndedLines()
                lineSegm.setPos(new PointF(x1, p1.y()))
                lineSegm.setPos2(new PointF(x2 - x1, 0.0))
            } else if (i === sysIdx2) {
                // end segment
                const minLen = 0.0
                const x1 = system.firstNoteRestSegmentX(true)
                const len = Math.max(minLen, p2.x() - x1)
                lineSegm.setSpannerSegmentType(SpannerSegmentType.END)
                lineSegm.setPos(new PointF(p2.x() - len, p2.y()))
                lineSegm.setPos2(new PointF(len, 0.0))
            }
            TLayout.layoutItem(lineSegm, ctx)
        }
    }

    /** layout spannersegment for system */
    static layoutSystemSLine(line: SLine, system: System, ctx: LayoutContext): SpannerSegment {
        const stick = system.firstMeasure()!.tick()
        const etick = system.lastMeasure()!.endTick()

        const lineSegm = TLayout.getNextLayoutSystemSegment(line, system, (parent) => line.createLineSegment(parent)) as LineSegment

        let sst: SpannerSegmentType
        const connect45 = (): boolean => line.isPedal() && (line as Pedal).connect45HookToNext()
        if (line.tick().ge(stick)) {
            //
            // this is the first call to layoutSystem,
            // processing the first line segment
            //
            line.computeStartElement()
            line.computeEndElement()
            if (line.tick2().lt(etick)) {
                sst = SpannerSegmentType.SINGLE
            } else if (line.tick2().eq(etick)) {
                sst = connect45() ? SpannerSegmentType.BEGIN : SpannerSegmentType.SINGLE
            } else {
                sst = SpannerSegmentType.BEGIN
            }
            if (line.hasVoiceAssignmentProperties()) {
                line.setPlacementBasedOnVoiceAssignment(ctx.conf().styleV(Sid.dynamicsHairpinVoiceBasedPlacement) as DirectionV)
            }
        } else if (line.tick().lt(stick) && (line.tick2().gt(etick) || (line.tick2().eq(etick) && connect45()))) {
            sst = SpannerSegmentType.MIDDLE
        } else {
            //
            // this is the last call to layoutSystem
            // processing the last line segment
            //
            sst = SpannerSegmentType.END
        }
        lineSegm.setSpannerSegmentType(sst)
        lineSegm.setPlacement(line.placement())

        switch (sst) {
        case SpannerSegmentType.SINGLE: {
            const p1 = line.linePos(Grip.START).pos
            const p2 = line.linePos(Grip.END).pos
            const len = p2.x() - p1.x()
            lineSegm.setPos(p1)
            lineSegm.setPos2(new PointF(len, p2.y() - p1.y()))
        }
            break
        case SpannerSegmentType.BEGIN: {
            const p1 = line.linePos(Grip.START).pos
            lineSegm.setPos(p1)
            const x2 = system.endingXForOpenEndedLines()
            lineSegm.setPos2(new PointF(x2 - p1.x(), 0.0))
        }
            break
        case SpannerSegmentType.MIDDLE: {
            const x1 = line.isVolta() ? TLayout.voltaMidEndSegmentStartX(line as Volta, system, ctx) : system.firstNoteRestSegmentX(true)
            const x2 = system.endingXForOpenEndedLines()
            const p1 = line.linePos(Grip.START).pos
            lineSegm.setPos(new PointF(x1, p1.y()))
            lineSegm.setPos2(new PointF(x2 - x1, 0.0))
        }
            break
        case SpannerSegmentType.END: {
            const p2 = line.linePos(Grip.END).pos
            const x1 = line.isVolta() ? TLayout.voltaMidEndSegmentStartX(line as Volta, system, ctx) : system.firstNoteRestSegmentX(true)
            const len = p2.x() - x1
            lineSegm.setPos(new PointF(p2.x() - len, p2.y()))
            lineSegm.setPos2(new PointF(len, 0.0))
        }
            break
        }

        TLayout.layoutItem(lineSegm, ctx)
        return lineSegm
    }

    private static voltaMidEndSegmentStartX(volta: Volta, system: System, ctx: LayoutContext): number {
        const firstMeasure = system.firstMeasure()
        if (!firstMeasure) {
            return 0.0
        }
        const refSeg = firstMeasure.repeatStart()
            ? firstMeasure.first(SegmentType.StartRepeatBarLine)
            : ctx.conf().styleB(Sid.voltaAlignStartBeforeKeySig) ? firstMeasure.first(SegmentType.KeySig) : null
        if (!refSeg) {
            return system.firstNoteRestSegmentX(true)
        }
        if (refSeg.isStartRepeatBarLineType()) {
            return refSeg.x() + firstMeasure.x()
        }
        const keySig = refSeg.element(volta.track()) as KeySig | null
        if (!keySig || keySig.ldata().keySymbols.length === 0) {
            return 0.0
        }
        const keySym = keySig.ldata().keySymbols[0]
        const xCutout = ctx.engravingFont().smuflAnchor(keySym.sym, SmuflAnchorId.cutOutNW, 1.0).x()
        return keySig.x() + keySym.xPos + xCutout + refSeg.x() + firstMeasure.x()
    }

    private static layoutSystemLyricsLine(line: LyricsLine, system: System, ctx: LayoutContext): SpannerSegment | null {
        if (!line.lyrics()) {
            return null
        }
        const stick = system.firstMeasure()!.tick()
        const etick = system.lastMeasure()!.endTick()

        const lineSegm = TLayout.getNextLayoutSystemSegment(line, system, (parent) => line.createLineSegment(parent)) as LyricsLineSegment

        let sst: SpannerSegmentType
        if (line.tick().ge(stick)) {
            LyricsLayout.layoutLyricsLine(line)
            if (line.ticks().isZero() && line.isEndMelisma()) {
                return null
            }
            line.computeStartElement()
            line.computeEndElement()
            sst = line.tick2().le(etick) ? SpannerSegmentType.SINGLE : SpannerSegmentType.BEGIN
        } else if (line.tick().lt(stick) && line.tick2().gt(etick)) {
            sst = SpannerSegmentType.MIDDLE
        } else {
            sst = SpannerSegmentType.END
        }
        lineSegm.setSpannerSegmentType(sst)

        LyricsLayout.layoutLyricsLineSegment(lineSegm, ctx)
        if (!line.lyrics()) {
            // this line could have been removed in the process of laying out surrounding lyrics
            return null
        }
        return lineSegm
    }

    // Extends lines to fill the corner between them.
    // Assumes that l1p2 == l2p1 is the intersection between the lines.
    // If checkAngle is false, assumes that the lines are perpendicular,
    // and some calculations are saved.
    // l1p2 and l2p1 are modified in place.
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

    /** startPoint or endPoint is modified in place */
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

    static layoutTextLineBaseSegment(item: TextLineBaseSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.npoints = 0
        const tl = item.textLineBase()
        const spatium = tl.spatium()
        const isSingleOrBegin = item.isSingleBeginType()
        const isSingleOrEnd = item.isSingleEndType()
        const isDottedLine = tl.lineStyle() === LineType.DOTTED
        const lineWidth = tl.absoluteFromSpatium(tl.lineWidth())

        if (item.spanner().placeBelow()) {
            ldata.setPosY(item.staff() ? item.staff()!.staffHeight(item.tick()) : 0.0)
        }

        // adjust Y pos to staffType offset
        ldata.moveY(item.staffOffsetY())

        if (!tl.diagonal()) {
            item.setUserYoffset2(0)
        }

        const alignBaseLine = (text: Text, pp1: PointF, pp2: PointF): void => {
            const widthCorrection = new PointF(0.0, lineWidth / 2)
            const move = (p: PointF, d: PointF): void => { p.setX(p.x() + d.x()); p.setY(p.y() + d.y()) }
            switch (text.align().vertical) {
            case AlignV.TOP:
                move(pp1, widthCorrection)
                move(pp2, widthCorrection)
                break
            case AlignV.VCENTER:
                break
            case AlignV.BOTTOM:
            case AlignV.BASELINE:
                move(pp1, widthCorrection.times(-1))
                move(pp2, widthCorrection.times(-1))
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
        TLayout.layoutText(text, ctx)

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
            TLayout.layoutText(endText, ctx)
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
            ldata.setBbox(TextLineBaseSegment.boundingBoxOfLine(pp1, pp2, lineWidth / 2, isDottedLine))
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

        if (tl.lineVisible() || !ctx.conf().isPrintingMode()) {
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
                const filled = tl.beginHookType() === HookType.ARROW_FILLED
                ldata.beginArrow = TLayout.createArrow(true, filled, pp1, pp2, tl)
                shape.add(ldata.beginArrow.boundingRect(), item)
            }
            if (endArrow) {
                const filled = tl.endHookType() === HookType.ARROW_FILLED
                ldata.endArrow = TLayout.createArrow(false, filled, pp1, pp2, tl)
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
                        // For dashes lines, we extend the lines somewhat,
                        // so that the corner between them gets filled
                        const checkAngle = tl.beginHookType() === HookType.HOOK_45 || tl.diagonal()
                        TLayout.extendLines(beginHookEndpoint, beginHookStartpoint, pp1, pp2, lineWidth, checkAngle)
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
                        // For dashes lines, we extend the lines somewhat,
                        // so that the corner between them gets filled
                        const checkAngle = tl.endHookType() === HookType.HOOK_45 || tl.diagonal()
                        TLayout.extendLines(ldata.points[pp1Idx], pp22, endHookStartpoint, endHookEndpoint, lineWidth, checkAngle)
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

    static recalculateTextLineBaseSegmentShape(item: TextLineBaseSegment): Shape {
        const ldata = item.ldata()
        const shape = new Shape()
        if (!item.text().empty()) {
            shape.add(item.text().ldata().bbox().translated(item.text().pos()), item.text())
        }
        if (!item.endText().empty()) {
            shape.add(item.endText().ldata().bbox().translated(item.endText().pos()), item.endText())
        }
        const lw2 = 0.5 * item.absoluteFromSpatium(item.lineWidth())
        const isDottedLine = item.textLineBase().lineStyle() === LineType.DOTTED
        if (item.twoLines()) { // hairpins
            shape.add(TextLineBaseSegment.boundingBoxOfLine(ldata.points[0], ldata.points[1], lw2, isDottedLine), item)
            shape.add(TextLineBaseSegment.boundingBoxOfLine(ldata.points[2], ldata.points[3], lw2, isDottedLine), item)
        } else {
            for (let i = 0; i < ldata.npoints - 1; ++i) {
                shape.add(TextLineBaseSegment.boundingBoxOfLine(ldata.points[i], ldata.points[i + 1], lw2, isDottedLine), item,
                          !item.textLineBase().lineVisible())
            }
        }
        return shape
    }

    static layoutTextLineSegment(item: TextLineSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TLayout.layoutTextLineBaseSegment(item, ctx)
        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.textLine().propertyDefault(Pid.OFFSET) as PointF)
        }
        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutOttavaSegment(item: OttavaSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TLayout.layoutTextLineBaseSegment(item, ctx)
        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    /** C++ layoutLetRingSegment() and layoutPalmMuteSegment() */
    static layoutChordTextLineBaseSegment(item: TextLineBaseSegment, showTabCommon: Sid, showTabSimple: Sid, ctx: LayoutContext): void {
        const ldata = item.mutldata()

        const stType = item.staffType()

        if (stType && stType.isHiddenElementOnTab(showTabCommon, showTabSimple)) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        TLayout.layoutTextLineBaseSegment(item, ctx)

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static manageTempoChangeSnapping(item: GradualTempoChangeSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()

        ldata.disconnectSnappedItems()
        const tempoChangeSegmentSnappedBefore = item.findElementToSnapBefore()
        if (tempoChangeSegmentSnappedBefore) {
            ldata.connectItemSnappedBefore(tempoChangeSegmentSnappedBefore)
            TLayout.doLayoutGradualTempoChangeSegment(tempoChangeSegmentSnappedBefore, ctx)
        }

        const tempoTextSnappedAfter = item.findElementToSnapAfter()
        if (tempoTextSnappedAfter) {
            ldata.connectItemSnappedAfter(tempoTextSnappedAfter)
        }
    }

    static doLayoutGradualTempoChangeSegment(item: GradualTempoChangeSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()

        const extendLineToSnappedItemAfter = (itemAfter: EngravingItem): void => {
            if (item.tempoChange().adjustForRehearsalMark(false)
                || itemAfter.findAncestor(ElementType.SYSTEM) !== item.system()) {
                return
            }

            const xItemPos = itemAfter.pageX() - item.system()!.pageX()
            const itemLeftEdge = xItemPos + itemAfter.ldata().bbox().left()

            let padding = item.spatium()
            if (itemAfter.isTempoText()) {
                const fontSizeScaleFactor = (itemAfter as TempoText).size() / 10.0
                padding = item.spatium() * fontSizeScaleFactor
            } else if (itemAfter.isGradualTempoChangeSegment()) {
                const startText = (itemAfter as GradualTempoChangeSegment).text()
                if (startText) {
                    const fontSizeScaleFactor = startText.size() / 10.0
                    padding = item.spatium() * fontSizeScaleFactor
                }
            }

            const maxTempoLineEnd = itemLeftEdge - padding
            const xEndDiff = maxTempoLineEnd - (item.pos().x() + item.pos2().x())
            item.rpos2().setX(item.rpos2().x() + xEndDiff)
        }

        const snappedAfter = ldata.itemSnappedAfter()
        if (snappedAfter && (snappedAfter.isTempoText() || snappedAfter.isGradualTempoChangeSegment())) {
            extendLineToSnappedItemAfter(snappedAfter)
        }

        TLayout.layoutTextLineBaseSegment(item, ctx)

        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.tempoChange().propertyDefault(Pid.OFFSET) as PointF)
        }

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutGradualTempoChangeSegment(item: GradualTempoChangeSegment, ctx: LayoutContext): void {
        TLayout.manageTempoChangeSnapping(item, ctx)

        TLayout.doLayoutGradualTempoChangeSegment(item, ctx)
    }

    static layoutVibratoSegment(item: VibratoSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (item.staff()) {
            ldata.setMag(item.staff()!.staffMag(item.tick()))
        }
        if (item.spanner().placeBelow()) {
            ldata.setPosY(item.staff() ? item.staff()!.staffHeight(item.tick()) : 0.0)
        }

        ldata.moveY(item.staffOffsetY())

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

        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.vibrato().propertyDefault(Pid.OFFSET) as PointF)
        }

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutWhammyBarSegment(item: TextLineBaseSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TLayout.layoutTextLineBaseSegment(item, ctx)

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutTrillSegment(item: TrillSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const trill = item.trill()
        const startItem = trill.startElement()
        const startChord = startItem && startItem.isChord() ? startItem as Chord : null
        if (startChord) {
            // Semi-hack: spanners don't have staffMove property, so we change
            // the staffIdx itself to follow cross-staff chords if needed
            item.setStaffIdx(startChord.vStaffIdx())
        }

        if (item.staff()) {
            ldata.setMag(item.staff()!.staffMag(item.tick()))
        }
        if (item.spanner().placeBelow()) {
            ldata.setPosY(item.staff() ? item.staff()!.staffHeight(item.tick()) : 0.0)
        }
        const yOff = item.staffOffsetY()
        ldata.moveY(yOff)

        const accidentalGoesBelow = trill.trillType() === TrillType.DOWNPRALL_LINE
        const ornament = trill.ornament()
        if (ornament) {
            if (item.isSingleBeginType()) {
                TLayout.layoutOrnament(ornament, ctx)
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
                item.symbolLine(SymId.ornamentBottomLeftConcaveStroke,
                    SymId.ornamentZigZagLineNoRightEnd, SymId.ornamentZigZagLineWithRightEnd)
                break
            case TrillType.DOWNPRALL_LINE:
                item.symbolLine(SymId.ornamentLeftVerticalStroke,
                    SymId.ornamentZigZagLineNoRightEnd, SymId.ornamentZigZagLineWithRightEnd)
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
                const y = (accidentalGoesBelow ? minVertDist + vertMargin : -minVertDist - vertMargin) + yOff
                a.setPos(x, y)
                a.setParent(item)
            }
        } else {
            switch (trill.trillType()) {
            case TrillType.TRILL_LINE:
            case TrillType.PRALLPRALL_LINE:
                item.symbolLine(SymId.wiggleTrill, SymId.wiggleTrill)
                break
            case TrillType.UPPRALL_LINE:
            case TrillType.DOWNPRALL_LINE:
                item.symbolLine(SymId.ornamentZigZagLineNoRightEnd,
                    SymId.ornamentZigZagLineNoRightEnd, SymId.ornamentZigZagLineWithRightEnd)
                break
            }
        }

        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(trill.propertyDefault(Pid.OFFSET) as PointF)
        }

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static fillTrillSegmentShape(item: TrillSegment): void {
        const font = item.score().engravingFont()
        const s = font.shape(item.symbols(), item.magS())
        const accidental = item.trill().accidental()
        if (accidental && accidental.visible() && item.isSingleBeginType()) {
            s.add(accidental.shape().translate(accidental.pos()))
        }

        item.mutldata().setShape(s)
    }

    static layoutPedalSegment(item: PedalSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TLayout.layoutTextLineBaseSegment(item, ctx)
        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.pedal().propertyDefault(Pid.OFFSET) as PointF)
        }

        const endText = item.endText()
        if (endText && !endText.empty() && ldata.npoints > 0) { // Rosette
            const endPoint = item.pos2()
            const endTextWidth = endText.ldata().bbox().width()
            let xEndText = endPoint.x() - endTextWidth
            const startText = item.text()
            if (startText) {
                xEndText = Math.max(xEndText, startText.ldata().bbox().width())
            }
            endText.mutldata().setPosX(xEndText)

            const lineTextGap = (item.getProperty(Pid.GAP_BETWEEN_TEXT_AND_LINE) as Spatium).val() * item.spatium()
            ldata.points[ldata.npoints - 1].setX(xEndText - lineTextGap)

            // Recalculate shape after moving end text
            ldata.setShape(TLayout.recalculateTextLineBaseSegmentShape(item))
        }

        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutVoltaSegment(item: VoltaSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TLayout.layoutTextLineBaseSegment(item, ctx)
        if (item.placeBelow()) {
            for (const t of [item.text(), item.endText()]) {
                if (t) {
                    const offset = t.offset()
                    offset.setY(-offset.y() + t.ldata().bbox().height())
                    t.setOffset(offset)
                }
            }
            // recalculate shape after moving texts
            ldata.setShape(TLayout.recalculateTextLineBaseSegmentShape(item))
        }
        Autoplace.autoplaceSpannerSegment(item, ldata, ctx.conf().spatium())
    }

    static layoutHairpin(item: Hairpin, ctx: LayoutContext): void {
        item.setPos(0.0, 0.0)
        TLayout.layoutLine(item, ctx)
    }

    static layoutHairpinSegment(item: HairpinSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()

        const stType = item.staffType()
        if (stType && stType.isHiddenElementOnTab(Sid.hairpinShowTabCommon, Sid.hairpinShowTabSimple)) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        const _spatium = item.spatium()

        ldata.disconnectSnappedItems()

        TLayout.manageHairpinSnapping(item, ctx)

        const hairpin = item.hairpin()
        const type = hairpin.hairpinType()
        if (hairpin.isLineType()) {
            item.setTwoLines(false)
            TLayout.layoutTextLineBaseSegment(item, ctx)
            item.setDrawCircledTip(false)
            item.setCircledTipRadius(0.0)
        } else {
            item.setTwoLines(true)

            hairpin.setBeginTextAlign(new Align(AlignH.LEFT, AlignV.VCENTER))
            hairpin.setEndTextAlign(new Align(AlignH.RIGHT, AlignV.VCENTER))
            hairpin.setBeginTextPosition(AlignH.LEFT)
            hairpin.setEndTextPosition(AlignH.RIGHT)

            let x1 = 0.0
            TLayout.layoutTextLineBaseSegment(item, ctx)
            if (!item.text().empty()) {
                x1 = item.text().width() + _spatium * 0.5
            }

            const t = new Transform()
            const h1 = hairpin.hairpinHeight().val() * _spatium * 0.5
            const h2 = hairpin.hairpinContHeight().val() * _spatium * 0.5

            let x = item.pos2().x()
            if (!item.endText().empty()) {
                x -= (item.endText().width() + _spatium * 0.5) // 0.5 spatium distance
            }
            if (x < _spatium) { // minimum size of hairpin
                x = _spatium
            }
            const y = item.pos2().y()
            const len = Math.sqrt(x * x + y * y)
            t.rotateRadians(Math.asin(y / len))

            item.setDrawCircledTip(hairpin.hairpinCircledTip())
            item.setCircledTipRadius(item.drawCircledTip() ? 0.6 * _spatium * 0.5 : 0.0)

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

            let joined: PointF[] = []
            if (sst !== SpannerSegmentType.MIDDLE) {
                if (type === HairpinType.DIM_HAIRPIN && sst !== SpannerSegmentType.BEGIN) {
                    joined = [ldata.points[0], ldata.points[1], ldata.points[2]] // [top-left, joint, bottom-left]
                } else if (type === HairpinType.CRESC_HAIRPIN && sst !== SpannerSegmentType.END) {
                    joined = [ldata.points[1], ldata.points[0], ldata.points[3]] // [top-right, joint, bottom-right]
                }
            }
            ldata.joinedHairpin = new PolygonF(...joined.map(p => p.clone()))

            let r = RectF.fromPoints(l1.p1(), l1.p2()).normalized().united(RectF.fromPoints(l2.p1(), l2.p2()).normalized())
            if (!item.text().empty()) {
                r = r.united(item.text().ldata().bbox())
            }
            if (!item.endText().empty()) {
                r = r.united(item.endText().ldata().bbox().translated(x + item.endText().ldata().bbox().width(), 0.0))
            }
            const w = item.absoluteFromSpatium(ctx.conf().styleS(Sid.hairpinLineWidth))
            ldata.setBbox(r.adjusted(-w * 0.5, -w * 0.5, w, w))
        }

        if (!item.explicitParent()) {
            item.setPos(new PointF())
            item.setOffset(new PointF())
            return
        }

        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(hairpin.propertyDefault(Pid.OFFSET) as PointF)
        }

        // rebase vertical offset on drag
        if (ldata.autoplace.offsetChanged !== OffsetChange.NONE) {
            Autoplace.rebaseOffset(item, ldata)
        }

        if (item.autoplace()) {
            Autoplace.autoplaceSpannerSegment(item, ldata, item.spatium())
        }

        Autoplace.setOffsetChanged(item, ldata, false)
    }

    private static manageHairpinSnapping(item: HairpinSegment, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const hairpin = item.hairpin()

        let possibleSnapBeforeElement: EngravingItem | null = null
        let possibleSnapAfterElement: EngravingItem | null = null
        if (item.isSingleBeginType()) {
            possibleSnapBeforeElement = item.findElementToSnapBefore()
        }
        if (item.isSingleEndType() && hairpin.ticks().isNotZero()) {
            possibleSnapAfterElement = item.findElementToSnapAfter()
        }

        let doSnapBefore = !!possibleSnapBeforeElement && hairpin.snapToItemBefore()
        if (doSnapBefore && possibleSnapBeforeElement!.isHairpinSegment()) {
            doSnapBefore = (possibleSnapBeforeElement as HairpinSegment).hairpin().snapToItemAfter()
                           && possibleSnapBeforeElement!.ldata().itemSnappedBefore() !== item
        }
        if (doSnapBefore) {
            ldata.connectItemSnappedBefore(possibleSnapBeforeElement!)
        }

        let doSnapAfter = !!possibleSnapAfterElement && hairpin.snapToItemAfter()
        if (doSnapAfter && possibleSnapAfterElement!.isHairpinSegment()) {
            doSnapAfter = (possibleSnapAfterElement as HairpinSegment).hairpin().snapToItemBefore()
                          && possibleSnapAfterElement!.ldata().itemSnappedAfter() !== item
        }
        if (doSnapAfter) {
            ldata.connectItemSnappedAfter(possibleSnapAfterElement!)
        }

        // In case of dynamics/expressions before or after, make space for them horizontally
        const mag = item.staff()!.staffMag(item)
        const hairpinDistToDynOrExpr = ctx.conf().styleMM(Sid.autoplaceHairpinDynamicsDistance) * mag

        const makeSpaceBefore = (doSnapBefore && possibleSnapBeforeElement!.isTextBase())
                                || (!!possibleSnapBeforeElement && possibleSnapBeforeElement.isDynamic())
        if (makeSpaceBefore && possibleSnapBeforeElement!.findAncestor(ElementType.SYSTEM) === item.system()) {
            const xItemPos = possibleSnapBeforeElement!.pageX() - item.system()!.pageX()
            const itemRightEdge = xItemPos + possibleSnapBeforeElement!.ldata().bbox().right()
            const xMinHairpinStart = itemRightEdge + hairpinDistToDynOrExpr
            const xStartDiff = ldata.pos().x() - xMinHairpinStart
            if (xStartDiff < 0) {
                ldata.setPosX(xMinHairpinStart)
                item.rpos2().setX(item.rpos2().x() + xStartDiff)
            }
        }

        const makeSpaceAfter = (doSnapAfter && possibleSnapAfterElement!.isTextBase())
                               || (!!possibleSnapAfterElement && possibleSnapAfterElement.isDynamic())
        if (makeSpaceAfter && possibleSnapAfterElement!.findAncestor(ElementType.SYSTEM) === item.system()) {
            const xItemPos = possibleSnapAfterElement!.pageX() - item.system()!.pageX()
            const itemLeftEdge = xItemPos + possibleSnapAfterElement!.ldata().bbox().left()
            const xMaxHairpinEnd = itemLeftEdge - hairpinDistToDynOrExpr
            const xEndDiff = xMaxHairpinEnd - (item.pos().x() + item.pos2().x())
            const EXTEND_THRESHOLD = 3.0 * item.spatium()
            if (xEndDiff < 0) {
                item.rpos2().setX(item.rpos2().x() + xEndDiff)
            } else if (hairpin.snapToItemAfter() && xEndDiff > EXTEND_THRESHOLD) {
                item.rpos2().setX(item.rpos2().x() + xEndDiff)
            }
        }
    }

    static layoutBreath(item: Breath, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const voiceOffset = item.placeBelow() ? item.staff()!.staffHeight(item.tick()) : 0.0
        if (item.isCaesura()) {
            if (item.symId() === SymId.chantCaesura) {
                // special handling for chant caesura, which is higher than the normal one
                ldata.setPosY(1.5 * item.spatium() + voiceOffset)
            } else {
                ldata.setPosY(item.symHeight(item.symId()) / 2 + voiceOffset)
            }
        } else if (ctx.conf().styleSt(Sid.musicalSymbolFont) === 'Emmentaler' && item.symId() === SymId.breathMarkComma) {
            const shift = item.placeBelow() ? -0.5 * item.spatium() + item.symHeight(item.symId()) : 0.5 * item.spatium()
            ldata.setPosY(shift + voiceOffset)
        } else {
            const shift = item.placeBelow() ? 0.5 * item.spatium() + item.symHeight(item.symId()) : -0.5 * item.spatium()
            ldata.setPosY(shift + voiceOffset)
        }
        ldata.setBbox(item.symBbox(item.symId()))
        ldata.setPosX(-ldata.bbox().right())
    }

    static layoutDynamic(item: Dynamic, ctx: LayoutContext): void {
        DynamicsLayout.layoutDynamic(item, item.mutldata(), ctx.conf())
    }

    static layoutExpression(item: Expression, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }
        item.setPlacementBasedOnVoiceAssignment(item.style().styleV(Sid.dynamicsHairpinVoiceBasedPlacement) as DirectionV)

        TextLayout.layoutBaseTextBase(item, ctx)

        const segment = item.segment()

        if (item.align().horizontal !== AlignH.LEFT) {
            let chordToAlign: Chord | null = null
            // Look for chord in this staff
            const startTrack = track2staff(item.staffIdx())
            const endTrack = startTrack + VOICES
            for (let track = startTrack; track < endTrack; ++track) {
                const e = segment.element(track)
                if (e && e.isChord()) {
                    chordToAlign = e as Chord
                    break
                }
            }
            if (chordToAlign && chordToAlign.notes().length) {
                const note = chordToAlign.notes()[0]
                const headWidth = note.headWidth()
                const center = item.align().horizontal === AlignH.HCENTER
                ldata.moveX(headWidth * (center ? 0.5 : 1))
            }
        }

        ldata.disconnectSnappedItems()

        if (!item.autoplace()) {
            return
        }

        const m = segment.measure()
        let dynamic = segment.findAnnotation(ElementType.DYNAMIC, item.track(), item.track()) as Dynamic | null
        if (!dynamic) {
            const timeTickSeg = m.findSegmentR(SegmentType.TimeTick, segment.rtick())
            dynamic = timeTickSeg ? timeTickSeg.findAnnotation(ElementType.DYNAMIC, item.track(), item.track()) as Dynamic | null : null
        }
        if (!dynamic || dynamic.placeAbove() !== item.placeAbove() || dynamic.voiceAssignment() !== item.voiceAssignment()
            || !dynamic.visible()) {
            Autoplace.autoplaceSegmentElement(item, ldata)
            return
        }

        // If there is a dynamic on same segment and track make space for it horizontally
        const padding = item.computeDynamicExpressionDistance(dynamic)
        const dynamicRight = dynamic.shape().translate(dynamic.pos()).right()
        const expressionLeft = ldata.bbox().translated(item.pos()).left()
        const difference = expressionLeft - dynamicRight - padding
        ldata.moveX(-difference)

        if (item.snapToDynamics()) {
            ldata.connectItemSnappedBefore(dynamic)
        }

        Autoplace.autoplaceSegmentElement(item, ldata)
    }

    static layoutFermata(item: Fermata, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const stType = item.staffType()
        if (stType && stType.isHiddenElementOnTab(Sid.fermataShowTabCommon, Sid.fermataShowTabSimple)) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)
        ldata.setPos(new PointF())

        if (item.isStyled(Pid.OFFSET)) {
            item.setOffset(item.propertyDefault(Pid.OFFSET) as PointF)
        }

        let x = 0.0
        let y = item.placeAbove() ? 0.0 : item.staff()!.staffHeight(item.tick())
        const s = item.segment()!
        const e = s.element(item.track())

        if (e) {
            if (e.isChord()) {
                const chord = e as Chord
                x = chord.x() + ChordLayout.centerX(chord)
            } else if (e.isRest()) {
                const rest = e as Rest
                x = rest.x() + rest.centerX()
            } else {
                x = e.x() - e.shape().left() + e.width() * item.staff()!.staffMag(new Fraction(0, 1)) * 0.5
            }
        }

        const name = SymNames.nameForSymId(item.symId())
        if (item.placeAbove()) {
            if (name.endsWith('Below')) {
                item.setSymId(SymNames.symIdByName(name.substring(0, name.length - 5) + 'Above'))
            }
        } else {
            if (name.endsWith('Above')) {
                item.setSymId(SymNames.symIdByName(name.substring(0, name.length - 5) + 'Below'))
            }
        }

        ldata.setShape(new Shape(item.symBbox(item.symId()), item))
        x -= 0.5 * ldata.bbox().width()

        if (item.isStyled(Pid.OFFSET)) {
            y += item.offset().y()
        }
        const staffShape = s.staffShape(item.staffIdx())
        staffShape.removeTypes(new Set([ElementType.FERMATA]))
        if (item.placeAbove()) {
            const minDist = ldata.shape().minVerticalDistance(staffShape) + item.minDistance().val() * item.spatium()
            y = Math.min(y, -minDist)
        } else {
            const minDist = staffShape.minVerticalDistance(ldata.shape()) + item.minDistance().val() * item.spatium()
            y = Math.max(y, minDist)
        }
        if (item.isStyled(Pid.OFFSET)) {
            y -= item.offset().y()
        }

        ldata.setPos(x, y)

        Autoplace.autoplaceSegmentElement(item, ldata)
    }

    static layoutRehearsalMark(item: RehearsalMark, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TextLayout.layoutBaseTextBase(item, ctx)

        const s = item.segment()
        if (!s.rtick().isZero()) {
            return
        }

        // first CR of measure, alignment is hcenter or right (the usual cases)
        // align with barline, point just after header, or start of measure depending on context
        const m = s.measure()
        let header = s.prev() // possibly just a start repeat
        while (header && header.isSegType(CHORD_REST_OR_TIME_TICK_TYPE)) {
            header = header.prev()
        }
        const measureX = -s.x()
        const repeat = m.findSegmentR(SegmentType.StartRepeatBarLine, new Fraction(0, 1))
        const barlineX = repeat ? repeat.x() - s.x() : measureX
        const sys = m.system()
        const systemFirst = !!sys && m.isFirstInSystem()

        if (!header || repeat || !systemFirst) {
            // no header, or header with repeat, or header mid-system - align with barline
            ldata.setPosX(barlineX)
            TLayout.checkRehearsalMarkVSBigTimeSig(item)
            return
        }

        // header at start of system
        // align to a point just after the header
        const e = header.element(item.track())
        const w = e ? e.ldata().bbox().width() : header.ldata().bbox().width()
        ldata.setPosX(header.x() + w - s.x())

        // special case for right aligned rehearsal marks at start of system
        // left align with start of measure if that is further left
        if (item.position() === AlignH.RIGHT) {
            ldata.setPosX(Math.min(ldata.pos().x(), measureX + ldata.bbox().width()))
        }

        TLayout.checkRehearsalMarkVSBigTimeSig(item)
    }

    private static checkRehearsalMarkVSBigTimeSig(item: RehearsalMark): void {
        const ldata = item.mutldata()
        if ((item.score().style().styleV(Sid.timeSigPlacement) as TimeSigPlacement) !== TimeSigPlacement.ABOVE_STAVES) {
            return
        }
        const s = item.segment()
        let bigTimeSig: TimeSig | null = null
        for (let segment: Segment | null = s; segment && segment.tick().eq(s.tick()); segment = segment.prevActive()) {
            if (!segment.isSegType(SegmentType.TimeSigType)) {
                continue
            }
            const timeSig = segment.element(item.track()) as TimeSig | null
            if (timeSig && timeSig.visible()) {
                bigTimeSig = timeSig
                break
            }
        }
        if (!bigTimeSig) {
            return
        }
        const timeSigRightEdge = bigTimeSig.ldata().bbox().translated(bigTimeSig.ldata().pos()).right()
                                 + bigTimeSig.segment()!.x() - s.x()
        const rehMarkLeftEdge = ldata.bbox().translated(item.ldata().pos()).left()
        const distance = rehMarkLeftEdge - timeSigRightEdge
        const margin = 0.5 * item.fontMetrics().xHeight()
        if (distance < margin) {
            ldata.moveX(margin - distance)
        }
    }

    static layoutStaffText(item: StaffText, ctx: LayoutContext): void {
        TextLayout.layoutBaseTextBase(item, ctx)
        Autoplace.autoplaceSegmentElement(item, item.mutldata())
        // TODO(port): sound flags
    }

    static layoutInstrumentChange(item: TextBase, ctx: LayoutContext): void {
        TextLayout.layoutBaseTextBase(item, ctx)
        Autoplace.autoplaceSegmentElement(item, item.mutldata())
    }

    static layoutSystemText(item: SystemText, ctx: LayoutContext): void {
        TextLayout.layoutBaseTextBase(item, ctx)
        Autoplace.autoplaceSegmentElement(item, item.mutldata())
    }

    static layoutTempoText(item: TempoText, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }
        ldata.disconnectSnappedItems()

        TextLayout.layoutBaseTextBase(item, ctx)

        if (!item.autoplace()) {
            return
        }

        // tempo text on first chordrest of measure should align over time sig if present, unless time sig is above staff
        const s = item.segment()

        const rehearsalMark = s.findAnnotation(ElementType.REHEARSAL_MARK, item.track(), item.track()) as RehearsalMark | null
        const rehearsalMarkBbox = rehearsalMark ? rehearsalMark.ldata().bbox().translated(rehearsalMark.pos()) : new RectF()
        const thisBbox = ldata.bbox().translated(item.pos())

        if (s.rtick().isZero()) {
            const p = item.segment().prev(SegmentType.TimeSig)
            if (p && !p.allElementsInvisible()) {
                ldata.moveX(-(s.x() - p.x()))
                const e = p.element(item.staffIdx() * VOICES)
                if (e) {
                    ldata.moveX(p.hasTimeSigAboveStaves() ? e.x() + e.width() + e.spatium() : e.x())
                }
            }
        }

        if (rehearsalMark) {
            const sameSide = item.placeAbove() === rehearsalMark.placeAbove()
            const collision = item.placeAbove() ? RealIsEqualOrMore(rehearsalMarkBbox.bottom(), thisBbox.top())
                : RealIsEqualOrLess(rehearsalMarkBbox.top(), thisBbox.bottom())
            if (sameSide && collision && item.getProperty(Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK) as boolean) {
                const rightEdge = rehearsalMarkBbox.right()
                const fontSizeScaleFactor = item.size() / 10.0
                const padding = 0.5 * item.spatium() * fontSizeScaleFactor
                const curX = ldata.pos().x()
                ldata.setPosX(Math.max(curX, rightEdge + padding))
            }
        }
        Autoplace.autoplaceSegmentElement(item, ldata)
    }

    static layoutAmbitus(item: Ambitus, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (ldata.isValid()) {
            return
        }

        const spatium = item.spatium()
        const headWdt = item.headWidth()

        const topAccData = item.topAccidental().mutldata()
        const bottomAccData = item.bottomAccidental().mutldata()

        ldata.setPos(new PointF())

        //
        // NOTEHEADS Y POS
        //
        {
            const tick = item.segment().tick()
            const stf = ctx.dom().staff(item.staffIdx())!
            const clf = stf.clef(tick)
            const key = stf.key(tick)
            const lineDist = stf.lineDistance(tick) * spatium

            // top notehead
            if (!pitchIsValid(item.topPitch()) || !tpcIsValid(item.topTpc())) {
                ldata.topPos.setY(0.0) // if uninitialized, set to top staff line
            } else {
                const topLine = Ambitus.staffLine(item.topTpc(), item.topPitch(), clf)
                ldata.topPos.setY(topLine * lineDist * 0.5)
                // compute accidental
                const accidType = Ambitus.accidentalType(item.topTpc(), key)
                item.topAccidental().setAccidentalType(accidType)
                TLayout.layoutAccidental(item.topAccidental(), ctx)
                topAccData.setPosY(ldata.topPos.y())
            }

            // bottom notehead
            if (!pitchIsValid(item.bottomPitch()) || !tpcIsValid(item.bottomTpc())) {
                const numOfLines = stf.lines(tick)
                ldata.bottomPos.setY((numOfLines - 1) * lineDist) // if uninitialized, set to last staff line
            } else {
                const bottomLine = Ambitus.staffLine(item.bottomTpc(), item.bottomPitch(), clf)
                ldata.bottomPos.setY(bottomLine * lineDist * 0.5)
                // compute accidental
                const accidType = Ambitus.accidentalType(item.bottomTpc(), key)
                item.bottomAccidental().setAccidentalType(accidType)
                TLayout.layoutAccidental(item.bottomAccidental(), ctx)
                bottomAccData.setPosY(ldata.bottomPos.y())
            }
        }

        //
        // NOTEHEAD X POS
        //
        // Note: manages colliding accidentals
        //
        {
            const accNoteDist = item.absoluteFromSpatium(ctx.conf().styleS(Sid.accidentalNoteDistance))
            const xAccidOffTop = topAccData.bbox().width() + accNoteDist
            let xAccidOffBottom = bottomAccData.bbox().width() + accNoteDist

            // if top accidental extends down more than bottom accidental extends up,
            // AND ambitus is not leaning right, bottom accidental needs to be displaced
            const collision = (item.direction() !== DirectionH.RIGHT)
                              && (topAccData.pos().y() + topAccData.bbox().y() + topAccData.bbox().height()
                                  > bottomAccData.pos().y() + bottomAccData.bbox().y())
            if (collision) {
                // displace bottom accidental (also attempting to 'undercut' flats)
                const bottomAccType = item.bottomAccidental().accidentalType()
                xAccidOffBottom = xAccidOffTop + ((bottomAccType === AccidentalType.FLAT
                                                   || bottomAccType === AccidentalType.FLAT2
                                                   || bottomAccType === AccidentalType.NATURAL)
                    ? bottomAccData.bbox().width() * 0.5 : bottomAccData.bbox().width())
            }

            switch (item.direction()) {
            case DirectionH.AUTO: // noteheads one above the other
                // left align noteheads and right align accidentals 'hanging' on the left
                ldata.topPos.setX(0.0)
                ldata.bottomPos.setX(0.0)
                topAccData.setPosX(-xAccidOffTop)
                bottomAccData.setPosX(-xAccidOffBottom)
                break
            case DirectionH.LEFT: // top notehead at the left of bottom notehead
                // place top notehead at left margin; bottom notehead at right of top head;
                // top accid. 'hanging' on left of top head and bottom accid. 'hanging' at left of bottom head
                ldata.topPos.setX(0.0)
                ldata.bottomPos.setX(headWdt)
                topAccData.setPosX(-xAccidOffTop)
                bottomAccData.setPosX(collision ? -xAccidOffBottom : headWdt - xAccidOffBottom)
                break
            case DirectionH.RIGHT: // top notehead at the right of bottom notehead
                // bottom notehead at left margin; top notehead at right of bottomnotehead
                // top accid. 'hanging' on left of top head and bottom accid. 'hanging' at left of bottom head
                ldata.topPos.setX(headWdt)
                ldata.bottomPos.setX(0.0)
                topAccData.setPosX(headWdt - xAccidOffTop)
                bottomAccData.setPosX(-xAccidOffBottom)
                break
            }
        }

        // LINE
        // compute line from top note centre to bottom note centre
        {
            const fullLine = new LineF(ldata.topPos.x() + headWdt * 0.5, ldata.topPos.y(),
                ldata.bottomPos.x() + headWdt * 0.5, ldata.bottomPos.y())
            // shorten line on each side by offsets
            const yDelta = ldata.bottomPos.y() - ldata.topPos.y()
            if (!RealIsNull(yDelta)) {
                const off = spatium * Ambitus.LINEOFFSET_DEFAULT
                const p1 = fullLine.pointAt(off / yDelta)
                const p2 = fullLine.pointAt(1 - (off / yDelta))
                ldata.line = new LineF(p1, p2)
            } else {
                ldata.line = fullLine
            }
        }

        // BBOX
        {
            const headRect = new RectF(0, -0.5 * spatium, headWdt, 1 * spatium)
            ldata.setBbox(headRect.translated(ldata.topPos).united(headRect.translated(ldata.bottomPos))
                .united(topAccData.bbox().translated(topAccData.pos()))
                .united(bottomAccData.bbox().translated(bottomAccData.pos())))
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

    static layoutStaffTypeChange(item: StaffTypeChange, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const spatium = ctx.conf().spatium()
        ldata.setBbox(new RectF(-item.lw() * 0.5, -item.lw() * 0.5, spatium * 2.5 + item.lw(), spatium * 2.5 + item.lw()))
        const m = item.measure()
        const system = m ? m.system() : null
        if (m && system) {
            const y = -1.5 * spatium - ldata.bbox().height() + system.staff(item.staffIdx())!.y()
            ldata.setPos(spatium * 0.8, y)
        } else {
            ldata.setPos(0.0, 0.0)
        }
    }

    static layoutArpeggio(item: Arpeggio, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        // TODO(port): Sid::arpeggioHiddenInStdIfTab (linked staves); C++ resets isSkipDraw right after anyway
        ldata.setIsSkipDraw(false)
        if (!ldata.isSetPos()) {
            ldata.setPos(new PointF())
        }

        if (!item.explicitParent()) {
            return
        }

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

        ldata.arpeggioHeight = ArpeggioLayout.computeHeight(item)
        ldata.top = ArpeggioLayout.calcTop(item, ctx)
        ldata.bottom = ArpeggioLayout.calcBottom(item, ldata.arpeggioHeight, ctx)

        ldata.setMag(item.staff() ? item.staff()!.staffMag(item.tick()) : item.mag())
        ldata.magS = ctx.conf().magS(ldata.mag())

        switch (item.arpeggioType()) {
        case ArpeggioType.NORMAL: {
            symbolLine(SymId.wiggleArpeggiatoUp, SymId.wiggleArpeggiatoUp)
            // string is rotated -90 degrees
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, -ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
        } break

        case ArpeggioType.UP: {
            symbolLine(SymId.wiggleArpeggiatoUpArrow, SymId.wiggleArpeggiatoUp)
            // string is rotated -90 degrees
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, -ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
        } break

        case ArpeggioType.DOWN: {
            symbolLine(SymId.wiggleArpeggiatoUpArrow, SymId.wiggleArpeggiatoUp)
            // string is rotated +90 degrees (so that UpArrow turns into a DownArrow)
            ldata.symsBBox = font.bboxList(ldata.symbols, ldata.magS)
            ldata.setBbox(new RectF(0.0, ldata.symsBBox.x() + ldata.top, ldata.symsBBox.height(), ldata.symsBBox.width()))
        } break

        case ArpeggioType.UP_STRAIGHT: {
            const x1 = item.spatium() * 0.5
            ldata.symsBBox = font.bbox(SymId.arrowheadBlackUp, ldata.magS)
            const w = ldata.symsBBox.width()
            ldata.setBbox(new RectF(x1 - w * 0.5, ldata.top, w, ldata.bottom))
        } break

        case ArpeggioType.DOWN_STRAIGHT: {
            const x1 = item.spatium() * 0.5
            ldata.symsBBox = font.bbox(SymId.arrowheadBlackDown, ldata.magS)
            const w = ldata.symsBBox.width()
            ldata.setBbox(new RectF(x1 - w * 0.5, ldata.top, w, ldata.bottom))
        } break

        case ArpeggioType.BRACKET: {
            const w = ctx.conf().styleS(Sid.arpeggioHookLen).val() * item.spatium()
            ldata.setBbox(new RectF(0.0, ldata.top, w, ldata.bottom))
        } break
        }

        // Loop through staves spanned & regenerate chord shape
        // This makes sure the arpeggio's shape is added to the shape of each chord it spans
        const chord = item.chord()!
        const seg = chord.segment()!
        const staveSpan = Math.trunc((item.track() + item.span() - 1) / VOICES)
        for (let staffIdx = item.staffIdx(); staffIdx <= staveSpan; staffIdx++) {
            seg.createShape(staffIdx)
        }
    }

    static layoutOrnament(item: Ornament, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.setShape(new Shape())

        TLayout.layoutArticulation(item, ctx)

        const _spatium = item.spatium()
        const vertMargin = 0.35 * _spatium
        const ornamentAccidentalMag = 0.6 // TODO: style?

        const accidentals = item.accidentalsAboveAndBelow()
        for (let i = 0; i < accidentals.length; ++i) {
            const above = (i === 0)
            const accidental = accidentals[i]
            if (!accidental) {
                continue
            }
            const accLData = accidental.mutldata()

            accidental.computeMag()

            accLData.setMag(accLData.mag() * ornamentAccidentalMag)
            accLData.syms = [] // Invalidate
            TLayout.layoutAccidental(accidental, ctx)
            const accidentalShape = accidental.shape()
            const minVertDist = above
                ? accidentalShape.minVerticalDistance(new Shape(ldata.bbox()))
                : new Shape(ldata.bbox()).minVerticalDistance(accidentalShape)

            accLData.setPos(-0.5 * accLData.bbox().width() + 0.5 * ldata.bbox().width(),
                above ? (-minVertDist - vertMargin) : (minVertDist + vertMargin))
        }

        const sh = new Shape(undefined, undefined, ShapeType.Composite)
        sh.add(ldata.bbox(), item) // from Articulation
        for (const accidental of accidentals) {
            if (accidental && accidental.visible()) {
                sh.add(accidental.shape().translate(accidental.pos()))
            }
        }

        ldata.setShape(sh)
    }

    static layoutOrnamentCueNote(item: Ornament, ctx: LayoutContext): void {
        if (!item.explicitParent()) {
            return
        }

        const parentChord = item.parentItem() as Chord
        const cueNoteChord = item.cueNoteChord()

        if (!cueNoteChord) {
            return
        }

        const notes = cueNoteChord.notes()
        const cueNote = notes.length === 0 ? null : notes[0]

        if (!cueNote) {
            return
        }

        ChordLayout.layoutChords3([cueNoteChord], [cueNote], item.staff()!, ctx)
        ChordLayout.layoutLedgerLines([cueNoteChord], ctx)
        AccidentalsLayout.layoutAccidentals([cueNoteChord], ctx)
        TLayout.layoutChord(cueNoteChord, ctx)

        const noteShape = cueNoteChord.shape()
        const parentChordShape = parentChord.shape()
        let minDist = HorizontalSpacing.minHorizontalDistance(parentChordShape, noteShape, parentChord.spatium())
        // Check for possible other chords in same segment
        const startStaff = staff2track(parentChord.staffIdx())
        for (let staff = startStaff; staff < startStaff + VOICES; ++staff) {
            const segment = parentChord.segment()!
            const cr = segment.element(staff) as ChordRest | null
            if (cr) {
                minDist = Math.max(minDist, HorizontalSpacing.minHorizontalDistance(cr.shape(), noteShape, cr.spatium()))
            }
        }
        cueNoteChord.mutldata().setPosX(minDist)
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

    static alignTabGraceNotesToMainStave(graceNotes: GraceNotesGroup, notationStaff: Staff): void {
        for (let i = 0; i < graceNotes.size(); ++i) {
            const grace = graceNotes.at(i)
            const linkedGrace = grace.findLinkedInStaff(notationStaff)
            if (linkedGrace) {
                grace.setPos(linkedGrace.ldata().pos())
            }
        }
    }

    static layoutGraceNotesGroup(item: GraceNotesGroup, ctx: LayoutContext): void {
        const parent = item.chordParent()
        const staffType = parent.staffType()
        if (staffType && staffType.isTabStaff() && !item.empty()) {
            const staff = parent.staff()!
            const links = staff.links()
            if (links) {
                for (const linkedSt of links) {
                    const linkedStaff = linkedSt as Staff
                    if (linkedStaff.score() === staff.score() && !linkedStaff.staffType(new Fraction(0, 1)).isTabStaff()
                        && linkedStaff.idx() < staff.idx()) {
                        // HACK: align grace notes in TAB to their linked notation staff.
                        // CAUTION: Works only if notation staff is above the TAB.
                        // TODO: refactor grace notes to allow doing this properly.
                        TLayout.alignTabGraceNotesToMainStave(item, linkedStaff)
                        return
                    }
                }
            }
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

    static layoutGraceNotesGroup2(item: GraceNotesGroup): void {
        const shape = new Shape(undefined, null, ShapeType.Composite)
        for (const grace of item) {
            shape.add(grace.shape().translate(grace.pos().minus(item.pos())))
        }
        item.mutldata().setShape(shape)
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
            const accidentalGap = conf.styleS(Sid.keysigAccidentalDistance).val()
            // add standard key accidentals first, if necessary
            for (let i = 1; i <= Math.abs(t1) && Math.abs(t1) <= 7; ++i) {
                let drop = false
                for (const cd of item.customKeyDefs()) {
                    const degree = item.degInKey(cd.degree)
                    // if custom keysig accidental takes place, don't create tonal accidental
                    if ((degree * 2 + 2) % 7 === (t1 < 0 ? 8 - i : i) % 7) {
                        drop = true
                        break
                    }
                }
                if (!drop) {
                    const lineIndexOffset = t1 > 0 ? -1 : 6
                    const ks: KeySym = { sym: t1 > 0 ? SymId.accidentalSharp : SymId.accidentalFlat, line: lines[lineIndexOffset + i], xPos: 0 }
                    if (ldata.keySymbols.length) {
                        const previous = ldata.keySymbols[ldata.keySymbols.length - 1]
                        const previousWidth = item.symWidth(previous.sym) / spatium
                        ks.xPos = previous.xPos + previousWidth + accidentalGap
                    }
                    // TODO octave metters?
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
                if (ldata.keySymbols.length) {
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
                        ks.sym = t1 > 0 ? SymId.accidentalSharp : SymId.accidentalFlat
                        sym = cd.sym
                    }
                    ldata.keySymbols.push(ks)
                    xpos += t1 < 0 ? 0.7 : 1 // flats closer
                }
                // create symbol; natural only if is user defined
                if (sym !== SymId.accidentalNatural || sym === cd.sym) {
                    ldata.keySymbols.push({ sym, line, xPos: xpos })
                }
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
                    const prevKeyTick = Fraction.fromTicks(item.staff()!.keyList().currentKeyTick(
                        item.tick().minus(Fraction.eps()).ticks()))
                    const prevKsSeg = item.score().tick2segment(prevKeyTick, true, SegmentType.KeySig)
                    if (prevKsSeg) {
                        const prevCustomKeySig = prevKsSeg.element(item.track()) as KeySig | null
                        if (prevCustomKeySig) {
                            for (const keySym of prevCustomKeySig.ldata().keySymbols as KeySym[]) {
                                if (keySym.sym !== SymId.accidentalNatural) {
                                    keySigAddLayout(item, ctx, SymId.accidentalNatural, keySym.line, ldata)
                                }
                            }
                        }
                    }
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

    static layoutTabDurationSymbol(item: TabDurationSymbol): void {
        const ldata = item.mutldata()
        const TAB_RESTSYMBDISPL = 2.0

        const tab = item.tab()
        if (!tab) {
            ldata.setBbox(new RectF())
            return
        }
        const spatium = item.spatium()
        let hbb: number, wbb: number, xbb: number, ybb: number // bbox sizes
        let xpos: number, ypos: number // position coords

        ldata.beamGrid = TabBeamGrid.NONE
        const parent = item.explicitParent()
        const chord = parent && parent.isChord() ? parent as Chord : null
        // if no chord (shouldn't happens...) or not a special beam mode, layout regular symbol
        if (!chord
            || (chord.beamMode() !== BeamMode.BEGIN && chord.beamMode() !== BeamMode.MID
                && chord.beamMode() !== BeamMode.END)) {
            const fm = new FontMetrics(tab.durationFont())
            hbb = tab.durationBoxH()
            wbb = fm.width(item.text())
            xbb = 0.0
            xpos = 0.0
            ypos = tab.durationFontYOffset()
            ybb = tab.durationBoxY() - ypos
            // with rests, move symbol down by half its displacement from staff
            if (parent && parent.isRest()) {
                ybb += TAB_RESTSYMBDISPL * spatium
                ypos += TAB_RESTSYMBDISPL * spatium
            }
        } else {
            // if on a chord with special beam mode, layout an 'English'-style duration grid
            hbb = tab.gridStemHeight() * spatium // bbox height is stem height
            wbb = tab.gridStemWidth() * spatium // bbox width is stem width
            xbb = -wbb * 0.5 // bbox is half at left and half at right of stem centre
            ybb = -hbb // bbox top is at top of stem height
            xpos = 0.75 * spatium // conventional centring of stem on fret marks
            ypos = tab.durationGridYOffset() // stem start is at bottom
            if (chord.beamMode() === BeamMode.BEGIN) {
                ldata.beamGrid = TabBeamGrid.INITIAL
                ldata.beamLength = 0.0
            } else if (chord.beamMode() === BeamMode.MID || chord.beamMode() === BeamMode.END) {
                ldata.beamLevel = chord.durationType().type() - tab.zeroBeamLevel()
                ldata.beamGrid = (ldata.beamLevel < 1 ? TabBeamGrid.INITIAL : TabBeamGrid.MEDIALFINAL)
                // _beamLength and bbox x and width will be set in layout2(),
                // once horiz. positions of chords are known
            }
        }
        // set this' mag from parent chord mag (include staff mag)
        let mag = chord ? chord.mag() : 1.0
        ldata.setMag(mag)
        mag = item.magS() // local mag * score mag
        // set magnified bbox and position
        ldata.setBbox(new RectF(xbb * mag, ybb * mag, wbb * mag, hbb * mag))
        ldata.setPos(xpos * mag, ypos * mag)
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

    static layoutFretDiagram(item: FretDiagram, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const spatium = item.spatium() * item.userMag()
        ldata.stringLineWidth = spatium * 0.08
        ldata.nutLineWidth = ((item.fretOffset() || !item.showNut()) ? ldata.stringLineWidth
            : ctx.conf().styleMM(Sid.fretNutThickness) * item.userMag())
        ldata.nutY = -0.5 * (ldata.nutLineWidth - ldata.stringLineWidth)
        ldata.stringDist = ctx.conf().styleMM(Sid.fretStringSpacing) * item.userMag()
        ldata.fretDist = ctx.conf().styleMM(Sid.fretFretSpacing) * item.userMag()
        ldata.markerSize = ldata.stringDist * 0.8
        ldata.markerY = ldata.nutY - 0.5 * ldata.nutLineWidth - ldata.markerSize - 0.20 * spatium
        const extendedStyle = item.style().styleB(Sid.fretStyleExtended)
        ldata.stringExtendTop = item.fretOffset() && extendedStyle ? -spatium * 0.2 : 0.0
        ldata.stringExtendBottom = extendedStyle ? 0.5 * ldata.fretDist : 0.0
        ldata.dotDiameter = ctx.conf().styleMM(Sid.fretDotSpatiumSize) * item.userMag()
        ldata.gridHeight = 0.0

        const shapeMarginAboveDiagram = ldata.fretDist * 1.5
        let w = ldata.stringDist * (item.strings() - 1) + ldata.markerSize
        let h = item.frets() * ldata.fretDist + ldata.stringExtendBottom + 0.5 * ldata.stringLineWidth + shapeMarginAboveDiagram
        let y = -shapeMarginAboveDiagram
        let x = -(ldata.markerSize * 0.5)

        const isVertical = item.orientation() === Orientation.VERTICAL

        // Allocate space for fret offset number
        if (item.fretOffset() > 0) {
            let padding = 0.4 * ldata.stringDist
            for (const [, barre] of item.barres()) {
                if (!barre.exists()) {
                    continue
                }
                if ((barre.startString === 0 && item.numPos() === 0)
                    || ((barre.endString === -1 || barre.endString === item.strings() - 1) && item.numPos() === 1)) {
                    padding += 0.20 * ldata.dotDiameter * ctx.conf().styleD(Sid.barreLineWidth)
                    break
                }
            }
            const fm2 = new FontMetrics(item.fretNumFont())
            let fretText = String(item.fretOffset() + 1)
            if (ctx.conf().styleB(Sid.fretUseCustomSuffix)) {
                fretText += ctx.conf().styleSt(Sid.fretCustomSuffix)
            }
            ldata.fretText = fretText
            const numw = isVertical ? fm2.width(fretText) : fm2.tightBoundingRect(fretText).height()
            const xdiff = numw + padding
            w += xdiff
            x += (item.numPos() === 0) === isVertical ? -xdiff : 0
            ldata.fretNumPadding = padding
        }

        if (!isVertical) {
            const tempW = w
            const tempX = x
            w = h
            h = tempW
            x = y
            y = tempX
        }

        // When changing how bbox is calculated, don't forget to update the centerX and rightX methods too.
        const shape = new Shape()
        shape.add(new RectF(x, y, w, h), item)

        ldata.gridHeight = h

        ldata.fingeringItems = []
        if (item.showFingering()) {
            const padding = 0.2 * spatium
            const fontMetrics = new FontMetrics(item.fingeringFont())
            const fontHeight = fontMetrics.capHeight()
            for (let i = 0; i < item.fingering().length; ++i) {
                const finger = item.fingering()[i]
                if (finger === 0) {
                    continue
                }
                const fingerS = String(finger)
                const width = fontMetrics.width(fingerS)
                const digitHeight = fontMetrics.tightBoundingRect(fingerS).height()
                const xOff = -0.5 * width
                const fingerX = isVertical ? (item.strings() - i - 1) * ldata.stringDist + xOff : x + w + padding
                const fingerY = isVertical ? y + h + fontHeight + padding : i * ldata.stringDist + 0.5 * digitHeight
                ldata.fingeringItems.push(new FingeringItem(fingerS, new PointF(fingerX, fingerY)))
                shape.add(fontMetrics.tightBoundingRect(fingerS).translated(new PointF(fingerX, fingerY)), item)
            }
        }

        ldata.setShape(shape)

        if (item.explicitParent()!.isSegment()) {
            // We need to get the width of the notehead/rest in order to position the fret diagram correctly
            const pSeg = item.segment()!
            let noteheadWidth = 0.0
            if (pSeg.isChordRestType()) {
                const idx = item.staff()!.idx()
                for (let e = pSeg.firstElementOfSegment(idx); e; e = pSeg.nextElementOfSegment(e, idx)) {
                    if (e.isRest()) {
                        noteheadWidth = item.symWidth((e as Rest).ldata().sym)
                        break
                    } else if (e.isNote()) {
                        noteheadWidth = (e as Note).headWidth()
                        break
                    }
                }
            }
            if (RealIsNull(noteheadWidth)) {
                // If note or rest not found, use standard notehead width
                noteheadWidth = item.symWidth(SymId.noteheadBlack)
            }

            ldata.setPos((noteheadWidth - item.mainWidth()) / 2, -(ldata.shape().bottom() + item.styleP(Sid.fretY)))
        }

        const harmony = item.harmony()
        if (harmony) {
            HarmonyLayout.layoutHarmony(harmony, ctx)
            if (item.visible() && harmony.autoplace()) {
                const vertDist = ldata.bbox().top() - harmony.ldata().bbox().translated(harmony.pos()).bottom()
                const diff = vertDist - harmony.minDistance().val() * item.spatium()
                if (diff < 0) {
                    harmony.mutldata().moveY(diff)
                }
            }
        }

        ldata.slurPaths = []
        for (const [fret, barre] of item.barres()) {
            if (!barre.exists()) {
                continue
            }
            const startString = barre.startString
            const endString = barre.endString !== -1 ? barre.endString : item.strings() - 1
            const slurStyleBarre = ctx.conf().styleB(Sid.barreAppearanceSlur)
            for (let string = startString; string <= endString; ++string) {
                if (slurStyleBarre) {
                    item.addDotForDotStyleBarre(string, fret)
                } else {
                    item.removeDotForDotStyleBarre(string, fret)
                }
            }
            const length = endString - startString
            const insetX = (length < 2 ? 1.25 : 2) * ldata.stringLineWidth
            const insetY = fret === 1 ? ldata.nutLineWidth + ldata.stringLineWidth : length < 2 ? 2 * ldata.stringLineWidth : insetX
            const startX = startString * ldata.stringDist + insetX
            const endX = endString * ldata.stringDist - insetX
            const shoulderXoffset = 0.2 * (endX - startX)
            const startEndY = (fret - 1) * ldata.fretDist - insetY
            const shoulderY = startEndY - (length < 2 ? 0.3 : length < 3 ? 0.4 : 0.5) * ldata.fretDist
            const slurThickness = (length < 2 ? 0.08 : 0.1) * item.spatium() * item.userMag()
            const shoulderYfor = shoulderY - slurThickness
            const shoulderYback = shoulderY + slurThickness
            const bezier1for = new PointF(startX + shoulderXoffset, shoulderYfor)
            const bezier2for = new PointF(endX - shoulderXoffset, shoulderYfor)
            const bezier1back = new PointF(startX + shoulderXoffset, shoulderYback)
            const bezier2back = new PointF(endX - shoulderXoffset, shoulderYback)
            const slurPath = new PainterPath()
            slurPath.moveTo(new PointF(startX, startEndY))
            slurPath.cubicTo(bezier1for, bezier2for, new PointF(endX, startEndY))
            slurPath.cubicTo(bezier2back, bezier1back, new PointF(startX, startEndY))
            ldata.slurPaths.push(slurPath)
        }
    }

    static layoutJump(item: Jump, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TextLayout.layoutBaseTextBase(item, ctx)

        const position = item.position()

        // ignore courtesy keysig, timesig, but fall back if needed
        const measure = item.parent() as Measure
        const bl = measure.endBarLine()
        const xAdj0 = bl ? bl.segment()!.x() + bl.ldata().bbox().width() : measure.width()
        let xAdj = xAdj0

        const avoidBarline = item.staffIdx() !== 0 && position !== AlignH.HCENTER
        if (avoidBarline) {
            const startRepeat = measure.repeatStart()
            const endRepeat = measure.repeatEnd()
            const blAboveIdx = item.staffIdx() - 1

            const fontSizeScaleFactor = item.size() / 10.0
            const padding = (startRepeat || endRepeat) ? 0.0 : 0.5 * item.spatium() * fontSizeScaleFactor

            if (position === AlignH.LEFT) {
                const blAbove = startRepeat || !measure.prevMeasure()
                    ? measure.startBarLine(blAboveIdx) : measure.prevMeasure()!.endBarLine(blAboveIdx)
                const blWidth = (startRepeat && blAbove) ? blAbove.width() : 0.0
                xAdj += padding + blWidth
            } else if (position === AlignH.RIGHT) {
                const blAbove = measure.endBarLine(blAboveIdx)
                const blWidth = blAbove ? blAbove.width() : 0.0
                xAdj -= blWidth + padding
            }
        }
        ldata.moveX(xAdj)

        Autoplace.autoplaceMeasureElement(item, ldata)
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
            if (item.displayFret() === DisplayFretOption.Hide) {
                return
            }

            const st = item.staff()!
            const tab = st.staffTypeForElement(item)
            // not complete but we need systems to be laid out to add parenthesis
            if (item.fixed()) {
                item.setFretString('/')
            } else {
                item.setFretString(tab.fretString(Math.abs(item.fret()), item.string(), item.deadNote()))

                if (item.negativeFretUsed() && !item.deadNote()) {
                    item.setFretString('-' + item.fretString())
                }

                if (item.displayFret() === DisplayFretOption.ArtificialHarmonic) {
                    item.setFretString(`${item.fretString()} <${item.harmonicFret()}>`)
                } else if (item.displayFret() === DisplayFretOption.NaturalHarmonic) {
                    item.setFretString(`<${item.harmonicFret()}>`)
                }
            }

            const w = item.tabHeadWidth(tab)
            const mags = item.magS()
            const y = item.deadNote() ? tab.deadFretBoxY() : tab.fretBoxY()
            const height = item.deadNote() ? tab.deadFretBoxH() : tab.fretBoxH()

            noteBBox = new RectF(0, y * mags, w, height * mags)
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

    static layoutHammerOnPullOffSegment(item: HammerOnPullOffSegment, ctx: LayoutContext): void {
        // The layout of the slur has already been done. Here we layout the H/P letters.
        item.updateHopoText()

        const system = item.system()!
        const systemEndTick = system.endTick()
        const sk = system.staff(item.staffIdx())!.skyline()

        for (const hopoText of item.hopoText()) {
            const above = hopoText.placeAbove()

            const align = new Align(AlignH.HCENTER, AlignV.BASELINE)
            hopoText.setPosition(AlignH.HCENTER)
            hopoText.setAlign(align)
            TLayout.layoutItem(hopoText, ctx)

            const startChord = hopoText.startChord()
            const endChord = hopoText.endChord()
            const startX = startChord.systemPos().x() + startChord.upNote().headWidth()
            let endX = startX
            if (endChord.tick().lt(systemEndTick)) {
                endX = endChord.systemPos().x()
            } else {
                // The last endChord of this segment is in next system. Use end barline instead.
                const endSeg = system.lastMeasure()!.last(SegmentType.BarLineType)
                endX = endSeg ? endSeg.systemPos().x() : endX
            }
            if (startChord.stem() && endChord.stem() && startChord.up() === above && endChord.up() === above) {
                // Mid-way between centered on the notes and centered on the stems
                endX += (above ? 0.5 : -0.5) * endChord.upNote().headWidth()
            }
            const centerX = 0.5 * (startX + endX)

            const vertPadding = 0.5 * item.spatium()
            const hopoTextShape = hopoText.ldata().shape().translated(new PointF(centerX, 0.0))
            const skl = above ? sk.north() : sk.south()
            const skyline = skl.getFilteredCopy((el) => !!el.item() && el.item()!.isArticulationFamily())

            let y = above ? -skyline.minDistanceToShapeAbove(hopoTextShape) : skyline.minDistanceToShapeBelow(hopoTextShape)
            y += above ? -vertPadding : vertPadding
            y = above ? Math.min(y, -vertPadding) : Math.max(y, item.staff()!.staffHeight(item.tick()) + vertPadding)

            const startNote = above ? startChord.upNote() : startChord.downNote()
            const endNote = above ? endChord.upNote() : endChord.downNote()
            const yNoteLimit = above ? Math.min(startNote.y(), endNote.y()) - 2 * vertPadding
                : Math.max(startNote.y(), endNote.y()) + 2 * vertPadding
            y = above ? Math.min(y, yNoteLimit) : Math.max(y, yNoteLimit)

            hopoText.mutldata().setPos(centerX, y)

            hopoTextShape.translateY(y)
            skl.add(hopoTextShape)
        }

        const hopoSegmentShape = item.mutldata().shape()
        for (const hopoText of item.hopoText()) {
            hopoSegmentShape.add(hopoText.ldata().shape().translated(hopoText.pos()))
        }

        item.mutldata().setShape(hopoSegmentShape)
    }

    static layoutChordLine(item: ChordLine, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }

        let note: Note | null = null
        const spatium = item.spatium()

        if (item.note()) {
            note = item.chord().findNote(item.note()!.pitch())
        }

        if (!note) {
            note = item.chord().upNote()
        }

        const noteLD = note.ldata()

        ldata.setMag(item.chord().mag())

        if (!item.modified()) {
            let x2 = 0
            let y2 = 0
            const baseLength = spatium * item.chord().intrinsicMag()
            const horBaseLength = 1.2 * baseLength // let the symbols extend a bit more horizontally
            x2 += item.isToTheLeft() ? -horBaseLength : horBaseLength
            y2 += item.isBelow() ? baseLength : -baseLength
            if (item.chordLineType() !== ChordLineType.NOTYPE && !item.isWavy()) {
                const path = new PainterPath()
                if (!item.isToTheLeft()) {
                    if (item.isStraight()) {
                        path.lineTo(x2, y2)
                    } else {
                        path.cubicTo(new PointF(x2 / 2, 0.0), new PointF(x2, y2 / 2), new PointF(x2, y2))
                    }
                } else {
                    if (item.isStraight()) {
                        path.lineTo(x2, y2)
                    } else {
                        path.cubicTo(new PointF(0.0, y2 / 2), new PointF(x2 / 2, y2), new PointF(x2, y2))
                    }
                }
                ldata.path = path
            }
        }

        let x = 0.0
        let y = noteLD.pos().y()
        const horOffset = 0.33 * spatium // one third of a space away from the note
        const vertOffset = 0.25 * spatium // one quarter of a space from the center line
        // Get chord shape
        const chordShape = item.chord().shape()
        // ...but remove from the shape items that the chordline shouldn't try to avoid
        // (especially the chordline itself)
        chordShape.remove_if((shapeEl) => {
            const si = shapeEl.item()
            if (!si) {
                return true
            }
            return si.isChordLine() || si.isHarmony() || si.isLyrics()
        })

        const r = item.isWavy() ? ctx.conf().engravingFont().bbox(item.waveSym(), item.magS()) : ldata.path.boundingRect()

        y += item.isBelow() ? vertOffset : -vertOffset

        const yBelow = y + r.height()
        let chordEdge = item.isToTheLeft() ? chordShape.leftMostEdgeAtHeight(y, yBelow) : chordShape.rightMostEdgeAtHeight(y, yBelow)

        if (!item.isToTheLeft()) {
            // Always place lines to the right of dots
            let xMin = chordShape.left()
            for (const shapeEl of chordShape.elements()) {
                if (!shapeEl.item() || !shapeEl.item()!.isNoteDot()) {
                    continue
                }

                xMin = Math.max(xMin, shapeEl.right())
            }
            chordEdge = Math.max(chordEdge, xMin)
        }

        x += item.isToTheLeft() ? chordEdge - horOffset : chordEdge + horOffset
        ldata.setPos(x, y)

        if (!item.isWavy()) {
            // C++ converts to int
            const x1 = Math.trunc(r.x())
            const y1 = Math.trunc(r.y())
            const width = Math.trunc(r.width())
            const height = Math.trunc(r.height())
            ldata.setBbox(new RectF(x1, y1, width, height))
        } else {
            // Align an eighth space above/below the centre of the note
            if (item.isBelow()) {
                ldata.moveY(r.height() - spatium * 0.125)
            } else {
                ldata.moveY(spatium * 0.075)
            }

            if (item.isToTheLeft()) {
                ldata.moveX(-r.width())
            }

            ldata.setBbox(r)
        }
    }

    static layoutFingering(item: Fingering): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }

        const tick = item.parentItem()!.tick()
        const st = item.staff()
        if (st && st.isTabStaff(tick)
            && (!st.staffType(tick).showTabFingering() || item.textStyleType() === TextStyleType.STRING_NUMBER)) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        TextLayout.layoutBaseTextBase(item)
        ldata.setPosY(0.0) // handle placement below

        if (item.autoplace()) {
            const note = item.note()!
            const chord = note.chord()

            const voices = chord.measure().hasVoicesInRange(chord.staffIdx(), chord.tick(), chord.actualTicks())
            const tight = voices && chord.notes().length === 1 && !chord.beam() && item.textStyleType() !== TextStyleType.STRING_NUMBER

            const headWidth = note.bboxRightPos()

            // update offset after drag
            let rebase = 0.0
            if (ldata.offsetChanged() !== OffsetChange.NONE && !tight) {
                rebase = Autoplace.rebaseOffset(item, ldata)
            }

            // temporarily exclude self from chord shape
            item.setAutoplace(false)

            if (item.layoutType() === ElementType.CHORD) {
                const above = item.placeAbove()
                const stem = chord.stem()
                const segment = chord.segment()!
                const measure = segment.measure()
                const sp = item.spatium()
                let md = item.minDistance().val() * sp
                const ss = measure.system()!.staff(chord.vStaffIdx())!
                const vStaff = chord.staff()! // TODO: use current height at tick

                if (note.ldata().mirror) {
                    ldata.moveX(-note.ldata().pos().x())
                }
                ldata.moveX(headWidth * 0.5)
                if (above) {
                    if (tight) {
                        if (chord.stem()) {
                            ldata.moveX(-0.8 * sp)
                        }
                        ldata.moveY(-1.5 * sp)
                    } else {
                        const r = ldata.bbox().translated(measure.pos().plus(segment.pos()).plus(chord.pos()).plus(note.pos()).plus(item.pos()))
                        const sk = new SkylineLine(false)
                        sk.add(r, item)
                        const d = sk.minDistance(ss.skyline().north())
                        let yd = 0.0
                        if (d > 0.0 && item.isStyled(Pid.MIN_DISTANCE)) {
                            yd -= d + item.ldata().bbox().height() * 0.25
                        }
                        // force extra space above staff & chord (but not other fingerings)
                        let top: number
                        if (chord.up() && chord.beam() && stem) {
                            top = stem.y() + stem.ldata().bbox().top()
                        } else {
                            const un = chord.upNote()
                            top = Math.min(0.0, un.y() + un.ldata().bbox().top())
                        }
                        top -= md
                        const diff = (ldata.bbox().bottom() + ldata.pos().y() + yd + note.y()) - top
                        if (diff > 0.0) {
                            yd -= diff
                        }
                        if (ldata.offsetChanged() !== OffsetChange.NONE) {
                            // user moved element within the skyline
                            // we may need to adjust minDistance, yd, and/or offset
                            const inStaff = above ? r.bottom() + rebase > 0.0 : r.top() + rebase < item.staff()!.staffHeight(item.tick())
                            const res = Autoplace.rebaseMinDistance(item, ldata, md, yd, sp, rebase, above, inStaff)
                            md = res.md
                            yd = res.yd
                        }
                        ldata.moveY(yd)
                    }
                } else {
                    if (tight) {
                        if (chord.stem()) {
                            ldata.moveX(0.8 * sp)
                        }
                        ldata.moveY(1.5 * sp)
                    } else {
                        const r = ldata.bbox().translated(measure.pos().plus(segment.pos()).plus(chord.pos()).plus(note.pos()).plus(item.pos()))
                        const sk = new SkylineLine(true)
                        sk.add(r, item)
                        const d = ss.skyline().south().minDistance(sk)
                        let yd = 0.0
                        if (d > 0.0 && item.isStyled(Pid.MIN_DISTANCE)) {
                            yd += d + item.ldata().bbox().height() * 0.25
                        }
                        // force extra space below staff & chord (but not other fingerings)
                        let bottom: number
                        if (!chord.up() && chord.beam() && stem) {
                            bottom = stem.y() + stem.ldata().bbox().bottom()
                        } else {
                            const dn = chord.downNote()
                            bottom = Math.max(vStaff.staffHeight(item.tick()), dn.y() + dn.ldata().bbox().bottom())
                        }
                        bottom += md
                        const diff = bottom - (ldata.bbox().top() + ldata.pos().y() + yd + note.y())
                        if (diff > 0.0) {
                            yd += diff
                        }
                        if (ldata.offsetChanged() !== OffsetChange.NONE) {
                            // user moved element within the skyline
                            // we may need to adjust minDistance, yd, and/or offset
                            const inStaff = above ? r.bottom() + rebase > 0.0 : r.top() + rebase < item.staff()!.staffHeight(item.tick())
                            const res = Autoplace.rebaseMinDistance(item, ldata, md, yd, sp, rebase, above, inStaff)
                            md = res.md
                            yd = res.yd
                        }
                        ldata.moveY(yd)
                    }
                }
            } else if (item.textStyleType() === TextStyleType.LH_GUITAR_FINGERING) {
                // place to left of note
                const left = note.shape().left()
                if (left - note.x() > 0.0) {
                    ldata.moveX(-left)
                } else {
                    ldata.moveX(-note.x())
                }
            }
            // for other fingering styles, do not autoplace

            // restore autoplace
            item.setAutoplace(true)
        } else if (ldata.offsetChanged() !== OffsetChange.NONE) {
            // rebase horizontally too, as autoplace may have adjusted it
            Autoplace.rebaseOffset(item, ldata, false)
        }
        Autoplace.setOffsetChanged(item, ldata, false)
    }

    static layoutGlissando(item: Glissando, ctx: LayoutContext): void {
        if (item.startElement()) {
            item.setTick(item.startElement()!.tick())
        }

        if (item.endElement()) {
            item.setTick2(item.endElement()!.tick())
        }

        TLayout.layoutLine(item, ctx)

        if (item.spannerSegments().length === 0) {
            return
        }
        const ldata = item.mutldata()
        ldata.setPos(0.0, 0.0)

        const instrId = item.staff()!.part()!.instrumentId(item.tick())
        const harpStaff = instrId === 'harp'
        if (item.isHarpGliss() === null) {
            item.setIsHarpGliss(harpStaff)
        } else {
            if (harpStaff !== item.isHarpGliss()) {
                // Preserve whether this gliss has its default playback style
                const defaultStyle = item.isStyled(Pid.GLISS_STYLE)
                item.setIsHarpGliss(harpStaff)
                if (defaultStyle) {
                    item.resetProperty(Pid.GLISS_STYLE)
                }

                // Make sure harp glisses can only be diatonic and chromatic
                const glissStyle = item.glissandoStyle()
                if (item.isHarpGliss()
                    && (glissStyle !== GlissandoStyle.DIATONIC
                        && glissStyle !== GlissandoStyle.CHROMATIC)) {
                    item.setGlissandoStyle(GlissandoStyle.DIATONIC)
                }
            }
        }

        TLayout.layoutNoteAnchoredLine(item, ldata, ctx)

        ChordLayout.addLineAttachPoints(item)
    }

    static layoutGlissandoSegment(item: GlissandoSegment): void {
        const ldata = item.mutldata()
        if (item.pos2().x() <= 0) {
            ldata.setBbox(new RectF())
            return
        }

        if (item.staff()) {
            ldata.setMag(item.staff()!.staffMag(item.tick()))
        }
        const r = new RectF(0.0, 0.0, item.pos2().x(), item.pos2().y()).normalized()
        const lw = item.absoluteFromSpatium(item.lineWidth()) * 0.5
        item.setbbox(r.adjusted(-lw, -lw, lw, lw))
    }

    static layoutNoteAnchoredLine(item: SLine, ldata: LayoutData, ctx: LayoutContext): void {
        const _spatium = item.spatium()
        const startAnchor = item.startElement() as Note
        const endAnchor = item.endElement() as Note
        const startChord = startAnchor.chord()
        const endChord = endAnchor.chord()
        const startSeg = item.frontSegment()
        const endSeg = item.backSegment()

        // Note: line segments are defined by
        // initial point: ipos() (relative to system origin)
        // ending point:  pos2() (relative to initial point)

        // LINE ENDING POINTS TO NOTEHEAD CENTRES

        // assume line goes from centre of initial note centre to centre of ending note:
        // move first segment origin and last segment ending point from notehead origin to notehead centre
        // For TAB: begin at the right-edge of initial note rather than centre
        let startOffset = startChord.staff()!.isTabStaff(startChord.tick())
            ? new PointF(startAnchor.ldata().bbox().right(), 0.0)
            : new PointF(startAnchor.headWidth() * 0.5, 0.0)

        let endOffset = new PointF(endAnchor.headWidth() * 0.5, 0.0)

        // AVOID HORIZONTAL LINES

        // for microtonality read tuning, or check note accidental
        let startTune = startAnchor.tuning()
        let endTune = endAnchor.tuning()
        const startAcc = startAnchor.accidentalType()
        const endAcc = endAnchor.accidentalType()
        if (RealIsNull(startTune) && Accidental.isMicrotonal(startAcc)) {
            startTune = Accidental.subtype2centOffset(startAcc)
        }
        if (RealIsNull(endTune) && Accidental.isMicrotonal(endAcc)) {
            endTune = Accidental.subtype2centOffset(endAcc)
        }

        let upDown = Math.sign(endAnchor.ppitch() - startAnchor.ppitch())
        // same note, so compare tunings
        if (upDown === 0) {
            upDown = Math.sign(endTune - startTune)
        }

        // on TAB's, glissando are by necessity on the same string, this gives an horizontal glissando line;
        // make bottom end point lower and top ending point higher
        if (startChord.staff()!.isTabStaff(startChord.tick())) {
            const yOff = startChord.staff()!.lineDistance(startChord.tick()) * 0.4 * _spatium
            startOffset.setY(startOffset.y() + yOff * upDown)
            endOffset.setY(endOffset.y() - yOff * upDown)
        } else {
            // if not TAB, angle glissando between notes on the same line
            if (startAnchor.line() === endAnchor.line()) {
                startOffset.setY(startOffset.y() + _spatium * 0.25 * upDown)
                endOffset.setY(endOffset.y() - _spatium * 0.25 * upDown)
            }
        }

        // move initial point of first segment and adjust its length accordingly
        startSeg.setPos(startSeg.ldata().pos().plus(startOffset))
        startSeg.setPos2(startSeg.ipos2().minus(startOffset))
        // adjust ending point of last segment
        endSeg.setPos2(endSeg.ipos2().plus(endOffset))

        // INTERPOLATION OF INTERMEDIATE POINTS

        // get total x-width and total y-height of all segments
        let xTot = 0.0
        for (const segm of item.spannerSegments()) {
            xTot += segm.ipos2().x()
        }
        const startY = startSeg.ldata().pos().y()
        let yTot = endSeg.ldata().pos().y() + endSeg.ipos2().y() - startY
        yTot -= yStaffDifference(endSeg.system(), startSeg.system(), track2staff(item.track2()))
        const ratio = xTot === 0 ? 1.0 : yTot / xTot // muse::divide
        // interpolate y-coord of intermediate points across total width and height
        let xCurr = 0.0
        let yCurr: number
        for (let i = 0; i + 1 < item.spannerSegments().length; i++) {
            let segm = item.segmentAt(i)
            xCurr += segm.ipos2().x()
            yCurr = startY + ratio * xCurr
            segm.rpos2().setY(yCurr - segm.ldata().pos().y()) // position segm. end point at yCurr
            // next segment shall start where this segment stopped
            const nextSeg = item.segmentAt(i + 1)
            yCurr += yStaffDifference(nextSeg.system(), segm.system(), track2staff(item.track2()))
            segm = nextSeg
            segm.rpos2().setY(segm.rpos2().y() + segm.ldata().pos().y() - yCurr) // adjust next segm. vertical length
            segm.mutldata().setPosY(yCurr) // position next segm. start point at yCurr
        }

        // KEEP CLEAR OF ALL ELEMENTS OF THE CHORD
        // Remove offset already applied
        startOffset = startOffset.times(-1.0)
        endOffset = endOffset.times(-1.0)
        // Look at chord shapes (but don't consider lyrics)
        const startCRShape = startChord.shape()
        startCRShape.remove_if((s) => !s.item() || s.item()!.isLyrics())

        const startYAbove = startAnchor.ldata().pos().y() + startAnchor.ldata().bbox().topRight().y()
        const startYBelow = startYAbove + startAnchor.ldata().bbox().height()
        startOffset.setX(startOffset.x() + startCRShape.rightMostEdgeAtHeight(startYAbove, startYBelow) - startAnchor.pos().x())
        if (!endChord.staff()!.isTabStaff(endChord.tick())) {
            let endYAbove = endAnchor.ldata().pos().y() + endAnchor.ldata().bbox().topLeft().y()
            let endYBelow = endYAbove + endAnchor.ldata().bbox().height()
            const noteMiddle = endYAbove + endAnchor.ldata().bbox().height() / 2
            if (upDown !== 0) {
                const llWidth = Math.trunc(ctx.conf().styleS(Sid.ledgerLineWidth).val() * _spatium)
                // Only check top/bottom half of note depending on line approach direction
                // to avoid clearing acidentals the line won't collide with
                endYAbove = upDown === 1 ? noteMiddle - llWidth : endYAbove
                endYBelow = upDown === 1 ? endYBelow : noteMiddle + llWidth
            }

            endOffset.setX(endOffset.x() - (endAnchor.pos().x() - endChord.shape().leftMostEdgeAtHeight(endYAbove, endYBelow)))
        }
        // Add note distance
        const lineNoteDist = 0.25 * item.spatium() // TODO: style
        startOffset.setX(startOffset.x() + lineNoteDist)
        endOffset.setX(endOffset.x() - lineNoteDist)

        // apply offsets: shorten first segment by x1 (and proportionally y) and adjust its length accordingly
        startOffset.setY(startSeg.ipos2().y() * (startSeg.ipos2().x() === 0 ? 1.0 : startOffset.x() / startSeg.ipos2().x()))
        startSeg.setPos(startSeg.ldata().pos().plus(startOffset))
        startSeg.setPos2(startSeg.ipos2().minus(startOffset))
        // adjust last segment length by x2 (and proportionally y)
        endOffset.setY(endSeg.ipos2().y() * (endSeg.ipos2().x() === 0 ? 1.0 : endOffset.x() / endSeg.ipos2().x()))
        endSeg.setPos2(endSeg.ipos2().plus(endOffset))

        for (const segm of item.spannerSegments()) {
            TLayout.layoutItem(segm, ctx)
        }

        // compute line bbox as the bbox of the last segment, relative to the end anchor note
        const endAnchorPagePos = endAnchor.pagePos()
        let endSystemPagePos: PointF
        if (!endChord.segment()!.system()) {
            endSystemPagePos = endSeg.pos()
        } else {
            endSystemPagePos = endChord.segment()!.system()!.pagePos()
        }

        const endAnchorSystPos = endAnchorPagePos.minus(endSystemPagePos)
        const r = RectF.fromPoints(endAnchorSystPos.minus(endSeg.pos()), endAnchorSystPos.minus(endSeg.pos()).minus(endSeg.pos2())).normalized()
        const lw = item.absoluteFromSpatium(item.lineWidth()) * 0.5
        ldata.setBbox(r.adjusted(-lw, -lw, lw, lw))
    }

    static layoutGuitarBend(item: GuitarBend, ctx: LayoutContext, system: System | null = null): void {
        item.computeBendAmount()

        GuitarBendLayout.updateSegmentsAndLayout(item, ctx, system)

        item.updateHoldLine()
        if (item.holdLine()) {
            GuitarBendLayout.updateSegmentsAndLayout(item.holdLine()!, ctx, system)
        }
    }

    static layoutGuitarBendSegment(item: GuitarBendSegment, ctx: LayoutContext): void {
        const tabStaff = item.staffType()!.isTabStaff()
        if (tabStaff) {
            GuitarBendLayout.layoutTabStaff(item, ctx)
        } else {
            GuitarBendLayout.layoutStandardStaff(item, ctx)
        }

        const staff = item.system()!.staff(item.staffIdx())!
        const skyline = staff.skyline()
        const skylineLine = tabStaff ? skyline.north() : (item.guitarBend().ldata().up ? skyline.north() : skyline.south())
        skylineLine.add(item.shape().translated(item.pos()))

        TLayout.fillGuitarBendSegmentShape(item)
    }

    static fillGuitarBendSegmentShape(item: GuitarBendSegment): void {
        const ldata = item.mutldata()
        const shape = new Shape()
        shape.add(ldata.bbox(), item)
        if (!item.bendText().empty()) {
            shape.add(item.bendText().shape().translated(item.bendText().pos()))
        }
        ldata.setShape(shape)
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

        const lv = item.laissezVib() as LaissezVib | null
        const lvSeg = lv && !lv.segmentsEmpty() ? lv.frontLaissezVibSegment() : null
        if (lvSeg && lvSeg.addToSkyline()) {
            const bbox = lvSeg.shape().bbox()
            const cornerClosestToNote = lv!.up() ? bbox.bottomLeft() : bbox.topLeft()
            const pos = lvSeg.ldata().posRelativeToNote.minus(cornerClosestToNote)
            shape.add(lvSeg.shape().translate(pos))
        }

        for (const e of item.el()) {
            if (e.addToSkyline()) {
                if (e.isFingering() && (e as Fingering).layoutType() !== ElementType.NOTE) {
                    continue
                }
                shape.add(e.ldata().bbox().translated(e.pos()), e)
            }
        }

        // This method is also called from SingleLayout, where `part` may be nullptr
        const part = item.part()
        if (part && part.instrument().hasStrings()) {
            const bend = item.bendFor()
            if (bend && bend.addToSkyline() && bend.bendType() === GuitarBendType.SLIGHT_BEND && !bend.segmentsEmpty()) {
                const bendSeg = bend.frontSegment() as GuitarBendSegment
                // Semi-hack: the relative position of note and bend
                // isn't fully known yet, so we use an approximation
                const sp = item.spatium()
                const approxRelPos = new PointF(noteBBox.width() + 0.25 * sp, -0.25 * sp)
                shape.add(bendSeg.shape().translated(approxRelPos))
            }
            const bendBack = item.bendBack()
            if (bendBack && bendBack.bendType() === GuitarBendType.SCOOP && !bendBack.segmentsEmpty()
                && item.findAncestor(ElementType.SYSTEM)) {
                const seg = bendBack.frontSegment() as GuitarBendSegment
                shape.add(seg.shape().translated(seg.pos().minus(item.systemPos())))
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
        if (item.isLyricsLine()) {
            return TLayout.layoutSystemLyricsLine(item as LyricsLine, system, ctx)
        }
        if (item.isVolta()) {
            // TODO(port): Volta::setTempo (playback)
            return TLayout.layoutSystemSLine(item as SLine, system, ctx)
        }
        if (item instanceof SLine) {
            return TLayout.layoutSystemSLine(item, system, ctx)
        }
        // TODO(port): hammer-on/pull-off, tapping half slurs
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

    static layoutShadowNote(item: ShadowNote, ctx: LayoutContext): void {
        if (!item.isValid()) {
            item.setbbox(new RectF())
            return
        }

        const _spatium = item.spatium()
        const mag = item.mag()
        const noteheadBbox = item.symBbox(item.noteheadSymbol())
        const up = item.computeUp()

        // Layout dots
        let dotWidth = 0.0
        if (item.duration().dots() > 0) {
            const noteheadWidth = noteheadBbox.width()
            const d = ctx.conf().styleMM(Sid.dotNoteDistance) * mag
            const dd = ctx.conf().styleMM(Sid.dotDotDistance) * mag
            dotWidth = (noteheadWidth + d)
            if (item.hasFlag() && up) {
                dotWidth = Math.max(dotWidth, noteheadWidth + item.symBbox(item.flagSym()).right())
            }
            for (let i = 0; i < item.duration().dots(); i++) {
                dotWidth += dd * i
            }
        }

        let newBbox = new RectF()
        newBbox.setRect(noteheadBbox.x(), noteheadBbox.y(), noteheadBbox.width() + dotWidth, noteheadBbox.height())

        // Layout stem and flag
        if (item.hasStem()) {
            const x = noteheadBbox.x()
            const w = noteheadBbox.width()

            const stemWidth = ctx.conf().styleMM(Sid.stemWidth)
            const stemLength = (up ? -3.5 : 3.5) * _spatium
            const stemAnchor = item.symSmuflAnchor(item.noteheadSymbol(), up ? SmuflAnchorId.stemUpSE : SmuflAnchorId.stemDownNW).y()

            newBbox = newBbox.united(new RectF(up ? x + w - stemWidth : x,
                stemAnchor,
                stemWidth,
                stemLength - stemAnchor))

            if (item.hasFlag()) {
                const flagBbox = item.symBbox(item.flagSym())
                newBbox = newBbox.united(new RectF(up ? x + w - stemWidth : x,
                    stemAnchor + stemLength + flagBbox.y(),
                    flagBbox.width(),
                    flagBbox.height()))
            }
        }

        const lineIdx = item.lineIndex()

        // Layout ledger lines if needed
        if (item.ledgerLinesVisible()) {
            const extraLen = ctx.conf().styleMM(Sid.ledgerLineLength) * mag
            const step = 0.5 * _spatium * item.staffType()!.lineDistance().val()
            const yOffset = item.staffOffsetY()
            const x = noteheadBbox.x() - extraLen
            const w = noteheadBbox.width() + 2 * extraLen

            const lw = ctx.conf().styleMM(Sid.ledgerLineWidth)

            const r = new RectF(x, -lw * 0.5, w, lw)
            const topLine = Math.trunc(-2 + yOffset / step)
            for (let i = topLine; i >= lineIdx; i -= 2) {
                newBbox = newBbox.united(r.translated(new PointF(0, step * (i - lineIdx))))
            }
            const l = Math.trunc(item.staffType()!.lines() * 2 + yOffset / step) // first ledger line below staff
            for (let i = l; i <= lineIdx; i += 2) {
                newBbox = newBbox.united(r.translated(new PointF(0, step * (i - lineIdx))))
            }
        }

        // Layout accidental
        const acc = Accidental.subtype2symbol(item.accidentalType())
        if (acc !== SymId.noSym) {
            const symRect = item.symBbox(acc)
            const accWidth = symRect.width() + ctx.conf().styleMM(Sid.accidentalNoteDistance) * mag
            let dh = 0.0

            if (symRect.y() < newBbox.y()) {
                dh = symRect.height() - (newBbox.y() - symRect.y())
                newBbox.setY(symRect.y())
            } else if (symRect.y() > newBbox.y()) {
                dh = newBbox.height() - (symRect.y() - newBbox.y())
            }

            newBbox.setX(newBbox.x() - accWidth)
            newBbox.setWidth(newBbox.width() + accWidth)
            newBbox.setHeight(newBbox.height() + dh)
        }

        const articulationIds = item.articulationIds()
        if (!articulationIds.size) {
            item.setbbox(newBbox)
            return
        }

        // Layout articulations
        const articulationsTop = -_spatium * 0.5 * lineIdx + item.segmentSkylineTopY()
        const rectWithArticulations = RectF.fromPoints(new PointF(newBbox.x(), articulationsTop), newBbox.bottomRight())

        for (const artic of articulationIds) {
            const isMarcato = isMarcatoArticulation(artic)
            const isLv = artic === SymId.articLaissezVibrerAbove || artic === SymId.articLaissezVibrerBelow
            const symH = item.symHeight(artic)

            if (!up || isMarcato) {
                let topY = rectWithArticulations.y()
                if (topY > 0.0) {
                    topY = 0.0
                }

                rectWithArticulations.setTop(topY - symH - _spatium)
            } else {
                rectWithArticulations.setHeight(rectWithArticulations.height() + symH + _spatium)
            }
            if (isLv) {
                const width = item.symWidth(artic) - item.symWidth(item.noteheadSymbol()) / 2
                rectWithArticulations.setWidth(rectWithArticulations.width() + width)
            }
        }

        newBbox = newBbox.united(rectWithArticulations)

        item.setbbox(newBbox)
    }
}

void VOICES
