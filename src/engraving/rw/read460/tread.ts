/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/tread.h/.cpp
 *
 * C++ uses overloads TRead::read(T*, ...); here every type has its own method (readChord, readNote, ...)
 * and readItem() dispatches by element type.
 * TODO(port): readers for element types that are not ported yet (dynamics, tempo/staff texts, lines, ...)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { Color } from '../../../framework/draw/types/color'
import { Spatium } from '../../types/dimension'
import { Fraction } from '../../types/fraction'
import { P_TYPE, type PropertyValue } from '../../types/propertyvalue'
import { SymId } from '../../types/symid'
import { SymNames } from '../../types/symnames'
import {
    Align, AlignH, ArpeggioType, ArticulationTextType, AutoOnOff, BarLineType, BeamMode, BracketType, ClefType,
    DirectionH, DirectionV, DPMM, DurationType, FontStyle, GlissandoStyle, HookType, Key, KeyMode, LayoutBreakType,
    LineType, LyricsSyllabic, NoteHeadGroup, NoteHeadScheme, NoteHeadType, Orientation, OrnamentStyle, PartialSpannerDirection,
    PlacementH, PlacementV, PreferSharpFlat, SlurStyleType, StaffGroup, TextPlace, TextStyleType, TiePlacement,
    VeloType, VoiceAssignment, AccidentalRole, DynamicType, AutoCustomHide, MarkerType, GlissandoType,
    ElementType, OrnamentInterval, ParenthesesMode, TrillType, type track_idx_t,
    ChangeMethod, DynamicSpeed, SpannerSegmentType, VOICES,
    TremoloType, TremoloStyle, isTremoloTwoChord,
} from '../../types/types'
import { Constants } from '../../types/constants'
import { lrint } from '../../../framework/global/realfn'
import { TConv } from '../../types/typesconv'
import { Sid } from '../../style/styledef'
import { Pid, PropertyFlags, propertyName, propertyType } from '../../dom/property'
import { Factory } from '../../dom/factory'
import { TDuration } from '../../dom/durationtype'
import { ClefTypeList } from '../../dom/clefinfo'
import { KeySigEvent, type CustDef, type KeyList } from '../../dom/key'
import { Groups } from '../../dom/groups'
import { StaffName, Instrument } from '../../dom/instrument'
import { StaffType } from '../../dom/stafftype'
import { Location } from '../../dom/location'
import { NoteType, type ChordRest } from '../../dom/chordrest'
import { Tpc, clampPitch } from '../../dom/pitchspelling'
import { Grip } from '../../editing/editdata'
import type { EngravingItem } from '../../dom/engravingitem'
import type { EngravingObject } from '../../dom/engravingobject'
import type { Accidental, AccidentalBracket } from '../../dom/accidental'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Beam } from '../../dom/beam'
import type { Box, HBox, TBox } from '../../dom/box'
import type { Bracket } from '../../dom/bracket'
import type { BracketItem } from '../../dom/bracketitem'
import type { BSymbol } from '../../dom/bsymbol'
import type { Chord } from '../../dom/chord'
import type { Clef } from '../../dom/clef'
import type { KeySig } from '../../dom/keysig'
import type { LayoutBreak } from '../../dom/layoutbreak'
import type { Lyrics } from '../../dom/lyrics'
import type { MeasureBase } from '../../dom/measurebase'
import type { Note } from '../../dom/note'
import type { NoteDot } from '../../dom/notedot'
import type { Part } from '../../dom/part'
import type { Rest } from '../../dom/rest'
import type { Score } from '../../dom/score'
import type { Segment } from '../../dom/segment'
import type { Slur } from '../../dom/slur'
import type { SlurTie, SlurTieSegment } from '../../dom/slurtie'
import type { Spacer, SpacerType } from '../../dom/spacer'
import type { Spanner } from '../../dom/spanner'
import type { Staff } from '../../dom/staff'
import type { Stem } from '../../dom/stem'
import type { Symbol } from '../../dom/symbol'
import type { Text } from '../../dom/text'
import type { TextBase } from '../../dom/textbase'
import type { Tie } from '../../dom/tie'
import type { TimeSig, TimeSigType } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { XmlReader } from '../xmlreader'
import type { ReadContext } from './readcontext'
import { ConnectorInfoReader } from './connectorinforeader'
import { scoreDummy } from '../../compat/dummyelement'
import { smDrumset } from '../../dom/drumset'
import { type StaffText, type StaffTextBase } from '../../dom/stafftextbase'
import { type TempoText, TempoTextType } from '../../dom/tempotext'
import type { Expression } from '../../dom/expression'
import type { Dynamic } from '../../dom/dynamic'
import type { Fermata } from '../../dom/fermata'
import type { Breath } from '../../dom/breath'
import { SystemLock } from '../../dom/systemlock'
import { type Hairpin, type HairpinType } from '../../dom/hairpin'
import type { TextLine } from '../../dom/textline'
import { TextLineBase } from '../../dom/textlinebase'
import type { Volta } from '../../dom/volta'
import { type Ottava, OttavaType, ottavaDefault } from '../../dom/ottava'
import { Pedal } from '../../dom/pedal'
import type { LyricsLine } from '../../dom/lyricsline'
import type { LineSegment, SLine } from '../../dom/line'
import type { ChordTextLineBase } from '../../dom/chordtextlinebase'
import { CompatUtils } from '../compat/compatutils'
import type { Marker } from '../../dom/marker'
import type { Jump } from '../../dom/jump'
import { HarmonyInfo, type Harmony } from '../../dom/harmony'
import { HDegree, HDegreeType } from '../../dom/chordlist'
import type { Parenthesis } from '../../dom/parenthesis'
import type { NoteCaseType } from '../../dom/pitchspelling'
import { FretItem, FretMarkerType, type FretDiagram } from '../../dom/fret'
import { Ornament } from '../../dom/ornament'
import type { Trill } from '../../dom/trill'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { BeamFragment } from '../../dom/beambase'
import type { TremoloCompat } from '../compat/tremolocompat'
import type { StaffTypeChange } from '../../dom/stafftypechange'
import type { LaissezVib } from '../../dom/laissezvib'

// the C++ array has 18 entries of which only 14 are initialized; the remaining ones are Pid(0) == Pid::SUBTYPE
const TextBasePropertyId: Pid[] = [
    Pid.TEXT_STYLE,
    Pid.FONT_FACE,
    Pid.FONT_SIZE,
    Pid.TEXT_LINE_SPACING,
    Pid.FONT_STYLE,
    Pid.COLOR,
    Pid.FRAME_TYPE,
    Pid.FRAME_WIDTH,
    Pid.FRAME_PADDING,
    Pid.FRAME_ROUND,
    Pid.FRAME_FG_COLOR,
    Pid.FRAME_BG_COLOR,
    Pid.ALIGN,
    Pid.POSITION,
    Pid.SUBTYPE, Pid.SUBTYPE, Pid.SUBTYPE, Pid.SUBTYPE,
]

/** FontStyle + / - operators */
const fsAdd = (a: FontStyle, b: FontStyle): FontStyle => a | b
const fsSub = (a: FontStyle, b: FontStyle): FontStyle => a & ~b

function parseIntVec(s: string): number[] {
    return s.split(',').filter(x => x.trim().length).map(x => parseInt(x, 10))
}

export class TRead {
    // ---------------------------------------------------------
    //   readItem
    // ---------------------------------------------------------

    static readItem(item: EngravingItem, xml: XmlReader, ctx: ReadContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TRead.readAccidental(item as Accidental, xml, ctx); break
        case ElementType.ARPEGGIO: TRead.readArpeggio(item as Arpeggio, xml, ctx); break
        case ElementType.ARTICULATION: TRead.readArticulation(item as Articulation, xml, ctx); break
        case ElementType.BAR_LINE: TRead.readBarLine(item as BarLine, xml, ctx); break
        case ElementType.BEAM: TRead.readBeam(item as Beam, xml, ctx); break
        case ElementType.HBOX: TRead.readHBox(item as HBox, xml, ctx); break
        case ElementType.VBOX: TRead.readBox(item as Box, xml, ctx); break
        case ElementType.TBOX: TRead.readTBox(item as TBox, xml, ctx); break
        case ElementType.BRACKET: TRead.readBracket(item as Bracket, xml, ctx); break
        case ElementType.CHORD: TRead.readChord(item as Chord, xml, ctx); break
        case ElementType.CLEF: TRead.readClef(item as Clef, xml, ctx); break
        case ElementType.HOOK: TRead.readSymbol(item as Symbol, xml, ctx); break
        case ElementType.KEYSIG: TRead.readKeySig(item as KeySig, xml, ctx); break
        case ElementType.LAYOUT_BREAK: TRead.readLayoutBreak(item as LayoutBreak, xml, ctx); break
        case ElementType.LEDGER_LINE: TRead.readItemPropertiesOnly(item, xml, ctx); break
        case ElementType.LYRICS: TRead.readLyrics(item as Lyrics, xml, ctx); break
        case ElementType.MEASURE_NUMBER: TRead.readMeasureNumberBase(item as TextBase, xml, ctx); break
        case ElementType.NOTE: TRead.readNote(item as Note, xml, ctx); break
        case ElementType.NOTEDOT: TRead.readItemPropertiesOnly(item, xml, ctx); break
        case ElementType.REST: TRead.readRest(item as Rest, xml, ctx); break
        case ElementType.SLUR: TRead.readSlur(item as Slur, xml, ctx); break
        case ElementType.SPACER: TRead.readSpacer(item as Spacer, xml, ctx); break
        case ElementType.STEM: TRead.readStem(item as Stem, xml, ctx); break
        case ElementType.STEM_SLASH: TRead.readItemPropertiesOnly(item, xml, ctx); break
        case ElementType.SYMBOL: TRead.readSymbol(item as Symbol, xml, ctx); break
        case ElementType.TEXT: TRead.readText(item as Text, xml, ctx); break
        case ElementType.TIE: TRead.readTie(item as Tie, xml, ctx); break
        case ElementType.TIMESIG: TRead.readTimeSig(item as TimeSig, xml, ctx); break
        case ElementType.TUPLET: TRead.readTuplet(item as Tuplet, xml, ctx); break
        case ElementType.STAFF_TEXT: TRead.readStaffText(item as StaffText, xml, ctx); break
        case ElementType.SYSTEM_TEXT: TRead.readStaffTextBase(item as StaffTextBase, xml, ctx); break
        case ElementType.TEMPO_TEXT: TRead.readTempoText(item as TempoText, xml, ctx); break
        case ElementType.REHEARSAL_MARK: TRead.readTextBase(item as TextBase, xml, ctx); break
        case ElementType.MARKER: TRead.readMarker(item as Marker, xml, ctx); break
        case ElementType.HARMONY: TRead.readHarmony(item as Harmony, xml, ctx); break
        case ElementType.FRET_DIAGRAM: TRead.readFretDiagram(item as FretDiagram, xml, ctx); break
        case ElementType.PARENTHESIS: TRead.readParenthesis(item as Parenthesis, xml, ctx); break
        case ElementType.JUMP: TRead.readJump(item as Jump, xml, ctx); break
        case ElementType.EXPRESSION: TRead.readExpression(item as Expression, xml, ctx); break
        case ElementType.DYNAMIC: TRead.readDynamic(item as Dynamic, xml, ctx); break
        case ElementType.FERMATA: TRead.readFermata(item as Fermata, xml, ctx); break
        case ElementType.BREATH: TRead.readBreath(item as Breath, xml, ctx); break
        case ElementType.HAIRPIN: TRead.readHairpin(item as Hairpin, xml, ctx); break
        case ElementType.TEXTLINE: TRead.readTextLine(item as TextLine, xml, ctx); break
        case ElementType.VOLTA: TRead.readVolta(item as Volta, xml, ctx); break
        case ElementType.OTTAVA: TRead.readOttava(item as Ottava, xml, ctx); break
        case ElementType.PEDAL: TRead.readPedal(item as Pedal, xml, ctx); break
        case ElementType.TRILL: TRead.readTrill(item as Trill, xml, ctx); break
        case ElementType.LET_RING:
        case ElementType.PALM_MUTE:
            TRead.readChordTextLineBase(item as ChordTextLineBase, xml, ctx)
            break
        case ElementType.LYRICSLINE: TRead.readLyricsLine(item as LyricsLine, xml, ctx); break
        default:
            // TODO(port): element type not ported yet
            xml.skipCurrentElement()
            break
        }
    }

    // ---------------------------------------------------------
    //   properties
    // ---------------------------------------------------------

    static readPropertyValue(id: Pid, e: XmlReader, _ctx: ReadContext): PropertyValue {
        switch (propertyType(id)) {
        case P_TYPE.BOOL: return e.readInt() !== 0
        case P_TYPE.INT: return e.readInt()
        case P_TYPE.REAL: return e.readDouble()
        case P_TYPE.SPATIUM: return new Spatium(e.readDouble())
        case P_TYPE.MILLIMETRE: return new Spatium(e.readDouble()) //! NOTE type mm, but stored in xml as spatium
        case P_TYPE.TEMPO: return e.readDouble()
        case P_TYPE.FRACTION: return e.readFraction()
        case P_TYPE.SYMID: return TConv.fromXmlSymId(e.readAsciiText(), SymId.noSym)
        case P_TYPE.COLOR: return e.readColor()
        case P_TYPE.ORNAMENT_STYLE: return TConv.fromXmlOrnamentStyle(e.readAsciiText(), OrnamentStyle.DEFAULT)
        case P_TYPE.ORNAMENT_SHOW_ACCIDENTAL: return e.readInt()
        case P_TYPE.ORNAMENT_INTERVAL: return TConv.fromXmlOrnamentInterval(e.readText(), new OrnamentInterval())
        case P_TYPE.POINT: return e.readPoint()
        case P_TYPE.SCALE: return e.readScale()
        case P_TYPE.SIZE: return e.readSize()
        case P_TYPE.STRING: return e.readText()
        case P_TYPE.ALIGN: return TConv.fromXmlAlign(e.readText(), new Align())
        case P_TYPE.ALIGN_H: return TConv.fromXmlAlignH(e.readAsciiText(), AlignH.HCENTER)
        case P_TYPE.PLACEMENT_V: return TConv.fromXmlPlacementV(e.readAsciiText(), PlacementV.ABOVE)
        case P_TYPE.PLACEMENT_H: return TConv.fromXmlPlacementH(e.readAsciiText(), PlacementH.LEFT)
        case P_TYPE.TEXT_PLACE: return TConv.fromXmlTextPlace(e.readAsciiText(), TextPlace.AUTO)
        case P_TYPE.DIRECTION_V: return TConv.fromXmlDirectionV(e.readAsciiText(), DirectionV.AUTO)
        case P_TYPE.DIRECTION_H: return TConv.fromXmlDirectionH(e.readAsciiText(), DirectionH.AUTO)
        case P_TYPE.ORIENTATION: return TConv.fromXmlOrientation(e.readAsciiText(), Orientation.VERTICAL)
        case P_TYPE.LAYOUTBREAK_TYPE: return TConv.fromXmlLayoutBreakType(e.readAsciiText(), LayoutBreakType.NOBREAK)
        case P_TYPE.VELO_TYPE: return TConv.fromXmlVeloType(e.readAsciiText(), VeloType.OFFSET_VAL)
        case P_TYPE.GLISS_STYLE: return TConv.fromXmlGlissandoStyle(e.readAsciiText(), GlissandoStyle.CHROMATIC)
        case P_TYPE.GLISS_TYPE: return TConv.fromXmlGlissandoType(e.readAsciiText(), GlissandoType.STRAIGHT)
        case P_TYPE.BARLINE_TYPE: return TConv.fromXmlBarLineType(e.readAsciiText(), BarLineType.NORMAL)
        case P_TYPE.NOTEHEAD_TYPE: return TConv.fromXmlNoteHeadType(e.readAsciiText(), NoteHeadType.HEAD_AUTO)
        case P_TYPE.NOTEHEAD_SCHEME: return TConv.fromXmlNoteHeadScheme(e.readAsciiText(), NoteHeadScheme.HEAD_AUTO)
        case P_TYPE.NOTEHEAD_GROUP: return TConv.fromXmlNoteHeadGroup(e.readAsciiText(), NoteHeadGroup.HEAD_NORMAL)
        case P_TYPE.CLEF_TYPE: return TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)
        case P_TYPE.CLEF_TO_BARLINE_POS: return e.readInt()
        case P_TYPE.DYNAMIC_TYPE: return TConv.fromXmlDynamicType(e.readAsciiText(), DynamicType.OTHER)
        case P_TYPE.LINE_TYPE: return TConv.fromXmlLineType(e.readAsciiText(), LineType.SOLID)
        case P_TYPE.HOOK_TYPE: return TConv.fromXmlHookType(e.readAsciiText(), HookType.NONE)
        case P_TYPE.KEY_MODE: return TConv.fromXmlKeyMode(e.readAsciiText(), KeyMode.NONE)
        case P_TYPE.TEXT_STYLE: return TConv.fromXmlTextStyleType(e.readAsciiText(), TextStyleType.DEFAULT)
        case P_TYPE.SLUR_STYLE_TYPE: return e.readInt() as SlurStyleType
        case P_TYPE.BEAM_MODE: return 0
        case P_TYPE.GROUPS: {
            const g = new Groups()
            TRead.readGroups(g, e)
            return g.nodes()
        }
        case P_TYPE.DURATION_TYPE_WITH_DOTS:
        case P_TYPE.INT_VEC:
            return parseIntVec(e.readText())
        case P_TYPE.TIE_PLACEMENT: return TConv.fromXmlTiePlacement(e.readAsciiText(), TiePlacement.AUTO)
        case P_TYPE.VOICE_ASSIGNMENT: return TConv.fromXmlVoiceAssignment(e.readAsciiText(), VoiceAssignment.ALL_VOICE_IN_INSTRUMENT)
        case P_TYPE.AUTO_ON_OFF: return TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO)
        case P_TYPE.PARTIAL_SPANNER_DIRECTION:
            return TConv.fromXmlPartialSpannerDirection(e.readAsciiText(), PartialSpannerDirection.OUTGOING)
        case P_TYPE.PARENTHESES_MODE: return e.readInt()
        case P_TYPE.AUTO_CUSTOM_HIDE: return TConv.fromXmlAutoCustomHide(e.readAsciiText(), AutoCustomHide.AUTO)
        case P_TYPE.MARKER_TYPE: return TConv.fromXmlMarkerType(e.readAsciiText(), MarkerType.USER)
        default:
            // TODO(port): PLAYTECH_TYPE, TEMPOCHANGE_TYPE, CHANGE_METHOD
            return e.readText()
        }
    }

    /** readProperty(item, tag, xml, ctx, pid): reads the property if the tag matches */
    static readPropertyIfTag(item: EngravingItem, tag: string, xml: XmlReader, ctx: ReadContext, pid: Pid): boolean {
        if (tag === propertyName(pid)) {
            TRead.readProperty(item, xml, ctx, pid)
            return true
        }
        return false
    }

    static readProperty(item: EngravingItem, xml: XmlReader, ctx: ReadContext, pid: Pid): void {
        const spatium = ctx.spatium()
        let v = TRead.readPropertyValue(pid, xml, ctx)
        switch (propertyType(pid)) {
        case P_TYPE.MILLIMETRE: //! NOTE type mm, but stored in xml as spatium
            v = (v as Spatium).val() * spatium
            break
        case P_TYPE.POINT:
            if (item.offsetIsSpatiumDependent()) {
                v = (v as PointF).times(spatium)
            } else {
                v = (v as PointF).times(DPMM)
            }
            break
        default:
            break
        }
        // TODO(port): hasVoiceAssignmentProperties() (PLACEMENT -> DIRECTION)
        if (!ctx.shouldSkipProperty()) {
            item.setProperty(pid, v)
            if (item.isStyled(pid)) {
                item.setPropertyFlags(pid, PropertyFlags.UNSTYLED)
            }
        }
    }

    static readStyledProperty(item: EngravingItem, tag: string, xml: XmlReader, ctx: ReadContext): boolean {
        for (const spp of item.styledProperties()) {
            if (TRead.readPropertyIfTag(item, tag, xml, ctx, spp.pid)) {
                return true
            }
        }
        return false
    }

    /** registers the element under its EID (only used to resolve references, e.g. of system locks) */
    static readItemEID(item: EngravingObject, xml: XmlReader, ctx: ReadContext): void {
        const s = xml.readAsciiText()
        if (s) {
            ctx.score().eidRegister().set(s, item)
        }
    }

    static readSystemLocks(score: Score, e: XmlReader): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'systemLock') {
                TRead.readSystemLock(score, e)
            } else {
                e.unknown()
            }
        }
    }

    static readSystemLock(score: Score, e: XmlReader): void {
        let startMeas: MeasureBase | null = null
        let endMeas: MeasureBase | null = null
        const eidRegister = score.eidRegister()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'startMeasure') {
                startMeas = (eidRegister.get(e.readAsciiText()) ?? null) as MeasureBase | null
            } else if (tag === 'endMeasure') {
                endMeas = (eidRegister.get(e.readAsciiText()) ?? null) as MeasureBase | null
            } else {
                e.unknown()
            }
        }
        if (!startMeas || !endMeas) {
            return
        }
        score.addSystemLock(new SystemLock(startMeas, endMeas))
    }

    static readItemProperties(item: EngravingItem, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'eid') {
            TRead.readItemEID(item, e, ctx)
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.SIZE_SPATIUM_DEPENDENT)) {
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.OFFSET)) {
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.MIN_DISTANCE)) {
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.AUTOPLACE)) {
        } else if (tag === 'track') {
            item.setTrack(e.readInt() + ctx.trackOffset())
        } else if (tag === 'color') {
            item.setColor(e.readColor())
        } else if (tag === 'visible') {
            item.setVisible(e.readInt() !== 0)
        } else if (tag === 'linkedTo') {
            e.skipCurrentElement() // links are not ported
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.POSITION_LINKED_TO_MASTER)) {
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.APPEARANCE_LINKED_TO_MASTER)) {
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.EXCLUDE_FROM_OTHER_PARTS)) {
        } else if (tag === 'voice') {
            item.setVoice(e.readInt())
        } else if (tag === 'tag') {
            e.skipCurrentElement()
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.PLACEMENT)) {
        } else if (tag === 'z') {
            item.setZ(e.readInt())
        } else if (TRead.readPropertyIfTag(item, tag, e, ctx, Pid.HAS_PARENTHESES)) {
        } else if (tag === 'Parenthesis') {
            const p = Factory.createItem(ElementType.PARENTHESIS, item) as Parenthesis
            TRead.readParenthesis(p, e, ctx)
            p.setParent(item)
            p.setTrack(ctx.track())
            item.add(p)
        } else {
            return false
        }
        return true
    }

    private static readItemPropertiesOnly(item: EngravingItem, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readItemProperties(item, e, ctx)) {
                e.unknown()
            }
        }
    }

    // ---------------------------------------------------------
    //   text
    // ---------------------------------------------------------

    static lineBreakFromTag(str: string): string {
        // Raw newlines appearing next to tags (<font size="10> or <sym>...) get eaten by XML readers.
        return str.replace(/<br\/>/g, '\n')
    }

    static readTextBase(t: TextBase, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (!TRead.readTextBaseProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readTempoText(t: TempoText, e: XmlReader, ctx: ReadContext): void {
        // This property was written in the wrong order from 4.6.0-4.6.2
        // It was written before the text style and was reset on initialising the text style
        let symbolSize: number | undefined
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.PLAY)) {
            } else if (tag === 'tempo') {
                const v = parseFloat(e.readAsciiText())
                t.setTempo(Number.isNaN(v) ? Constants.DEFAULT_TEMPO : v)
            } else if (tag === 'followText') {
                t.setFollowText(e.readInt() !== 0)
            } else if (tag === 'type') {
                const type = e.readAsciiText()
                if (type === 'aTempo') {
                    t.setTempoTextType(TempoTextType.A_TEMPO)
                } else if (type === 'tempoPrimo') {
                    t.setTempoTextType(TempoTextType.TEMPO_PRIMO)
                } else if (type === 'normal') {
                    t.setTempoTextType(TempoTextType.NORMAL)
                }
            } else if (tag === 'musicSymbolSize') {
                symbolSize = e.readDouble()
            } else if (!TRead.readTextBaseProperties(t, e, ctx)) {
                e.unknown()
            }
        }
        // check sanity
        if (t.xmlText() === '') {
            t.setXmlText(`<sym>metNoteQuarterUp</sym> = ${lrint(t.tempo() * 60)}`)
            t.setVisible(false)
        }
        if (symbolSize !== undefined) {
            TRead.setUnstyledSymbolSize(t, symbolSize)
        }
    }

    private static setUnstyledSymbolSize(t: TextBase, symbolSize: number): void {
        t.setProperty(Pid.MUSIC_SYMBOL_SIZE, symbolSize)
        if (t.isStyled(Pid.MUSIC_SYMBOL_SIZE)) {
            t.setPropertyFlags(Pid.MUSIC_SYMBOL_SIZE, PropertyFlags.UNSTYLED)
        }
    }

    static readStaffText(t: StaffText, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'SoundFlag') {
                // TODO(port): sound flags
                xml.skipCurrentElement()
            } else if (!TRead.readStaffTextBaseProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readStaffTextBase(t: StaffTextBase, xml: XmlReader, ctx: ReadContext): void {
        t.clearStaffTextBase()
        let symbolSize: number | undefined
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'musicSymbolSize') {
                symbolSize = xml.readDouble()
            } else if (!TRead.readStaffTextBaseProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
        if (symbolSize !== undefined) {
            TRead.setUnstyledSymbolSize(t, symbolSize)
        }
    }

    static readStaffTextBaseProperties(t: StaffTextBase, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'MidiAction') {
            const channel = e.intAttribute('channel', 0)
            const name = e.attribute('name')
            const a = t.channelActions().find(ca => ca.channel === channel)
            if (a) {
                a.midiActionNames.push(name)
            } else {
                t.channelActions().push({ channel, midiActionNames: [name] })
            }
            e.skipCurrentElement()
        } else if (tag === 'channelSwitch' || tag === 'articulationChange') {
            const voice = e.intAttribute('voice', -1)
            if (voice >= 0 && voice < VOICES) {
                t.setChannelName(voice, e.attribute('name'))
            } else if (voice === -1) {
                // no voice applies channel to all voices for compatibility
                for (let i = 0; i < VOICES; ++i) {
                    t.setChannelName(i, e.attribute('name'))
                }
            }
            e.skipCurrentElement()
        } else if (tag === 'aeolus') {
            const group = e.intAttribute('group', -1)
            if (group >= 0 && group < 4) {
                t.setAeolusStop(group, e.readInt())
            } else {
                e.skipCurrentElement()
            }
            t.setSetAeolusStops(true)
        } else if (tag === 'swing') {
            const swingUnit = TConv.fromXmlDurationType(e.attribute('unit'), DurationType.V_INVALID)
            let unit = 0
            if (swingUnit === DurationType.V_EIGHTH) {
                unit = Constants.DIVISION / 2
            } else if (swingUnit === DurationType.V_16TH) {
                unit = Constants.DIVISION / 4
            }
            const ratio = e.intAttribute('ratio', 60)
            t.setSwing(true)
            t.setSwingParameters(unit, ratio)
            e.skipCurrentElement()
        } else if (tag === 'capo') {
            t.setCapo(e.intAttribute('fretId', 0))
            e.skipCurrentElement()
        } else if (!TRead.readTextBaseProperties(t, e, ctx)) {
            return false
        }
        return true
    }

    static readDynamic(d: Dynamic, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                d.setDynamicType(e.readText())
            } else if (tag === 'velocity') {
                d.setVelocity(e.readInt())
            } else if (tag === 'veloChange') {
                d.setChangeInVelocity(e.readInt())
            } else if (tag === 'veloChangeSpeed') {
                d.setVelChangeSpeed(TConv.fromXmlDynamicSpeed(e.readAsciiText(), DynamicSpeed.NORMAL))
            } else if (tag === 'play') {
                d.setPlayDynamic(e.readInt() !== 0)
            } else if (ctx.mscVersion() < 470 && tag === 'dynamicsSize') {
                TRead.readProperty(d, e, ctx, Pid.MUSICAL_SYMBOLS_SCALE)
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.AVOID_BARLINES)) {
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.CENTER_ON_NOTEHEAD)) {
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.ANCHOR_TO_END_OF_PREVIOUS)) {
            } else if (!TRead.readTextBaseProperties(d, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readExpression(expr: Expression, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'snapToDynamics') {
                TRead.readProperty(expr, xml, ctx, Pid.SNAP_TO_DYNAMICS)
            } else if (!TRead.readTextBaseProperties(expr, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readFermata(f: Fermata, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'subtype') {
                f.setSymIdAndTimeStretch(SymNames.symIdByName(xml.readAsciiText()))
            } else if (tag === 'play') {
                f.setPlay(xml.readInt() !== 0)
            } else if (tag === 'timeStretch') {
                f.setTimeStretch(xml.readDouble())
            } else if (!TRead.readItemProperties(f, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readBreath(b: Breath, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'symbol') {
                b.setSymId(SymNames.symIdByName(e.readAsciiText()))
            } else if (tag === 'pause') {
                b.setPause(e.readDouble())
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    private static readHarmonyInfo(info: HarmonyInfo, e: XmlReader): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'bass') {
                info.setBassTpc(e.readInt())
            } else if (tag === 'extension') {
                info.setId(e.readInt())
            } else if (tag === 'name') {
                info.setTextName(e.readText())
            } else if (tag === 'root') {
                info.setRootTpc(e.readInt())
            } else {
                e.unknown()
            }
        }
    }

    static readHarmony(h: Harmony, e: XmlReader, ctx: ReadContext): void {
        if (ctx.mscVersion() < 460) {
            TRead.readHarmony410(h, e, ctx)
            return
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'bassCase') {
                h.setBassCase(e.readInt() as NoteCaseType)
            } else if (tag === 'rootCase') {
                h.setRootCase(e.readInt() as NoteCaseType)
            } else if (tag === 'harmonyInfo') {
                const info = new HarmonyInfo(ctx.score())
                TRead.readHarmonyInfo(info, e)
                h.addChord(info)
            } else if (tag === 'degree') {
                TRead.readHarmonyDegree(h, e)
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.POS_ABOVE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_TYPE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.PLAY)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_VOICE_LITERAL)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_VOICING)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_DURATION)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_BASS_SCALE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_DO_NOT_STACK_MODIFIERS)) {
            } else if (!TRead.readTextBaseProperties(h, e, ctx)) {
                e.unknown()
            }
        }

        h.afterRead()
    }

    /** C++ read400/read410 TRead::read(Harmony*): one chord, stored directly in <Harmony> */
    private static readHarmony410(h: Harmony, e: XmlReader, ctx: ReadContext): void {
        const info = new HarmonyInfo(ctx.score())
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'base') {
                info.setBassTpc(e.readInt())
            } else if (tag === 'baseCase') {
                h.setBassCase(e.readInt() as NoteCaseType)
            } else if (tag === 'extension') {
                info.setId(e.readInt())
            } else if (tag === 'name') {
                info.setTextName(e.readText())
            } else if (tag === 'root') {
                info.setRootTpc(e.readInt())
            } else if (tag === 'rootCase') {
                h.setRootCase(e.readInt() as NoteCaseType)
            } else if (tag === 'function') {
                CompatUtils.setHarmonyRootTpcFromFunction(info, h, e.readText())
            } else if (tag === 'degree') {
                TRead.readHarmonyDegree(h, e)
            } else if (tag === 'leftParen') {
                h.setParenthesesMode(h.rightParen() ? ParenthesesMode.BOTH : ParenthesesMode.LEFT, true, false)
                e.skipCurrentElement()
            } else if (tag === 'rightParen') {
                h.setParenthesesMode(h.leftParen() ? ParenthesesMode.BOTH : ParenthesesMode.RIGHT, true, false)
                e.skipCurrentElement()
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.POS_ABOVE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_TYPE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.PLAY)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_VOICE_LITERAL)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_VOICING)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.HARMONY_DURATION)) {
            } else if (!TRead.readTextBaseProperties(h, e, ctx)) {
                e.unknown()
            }
        }

        h.addChord(info)

        h.afterRead()
    }

    private static readHarmonyDegree(h: Harmony, e: XmlReader): void {
        let degreeValue = 0
        let degreeAlter = 0
        let degreeType = ''
        while (e.readNextStartElement()) {
            const t = e.name()
            if (t === 'degree-value') {
                degreeValue = e.readInt()
            } else if (t === 'degree-alter') {
                degreeAlter = e.readInt()
            } else if (t === 'degree-type') {
                degreeType = e.readText()
            } else {
                e.unknown()
            }
        }
        if (degreeValue <= 0 || degreeValue > 13
            || degreeAlter < -2 || degreeAlter > 2
            || (degreeType !== 'add' && degreeType !== 'alter' && degreeType !== 'subtract')) {
            // incorrect degree
        } else {
            if (degreeType === 'add') {
                h.addDegree(new HDegree(degreeValue, degreeAlter, HDegreeType.ADD))
            } else if (degreeType === 'alter') {
                h.addDegree(new HDegree(degreeValue, degreeAlter, HDegreeType.ALTER))
            } else if (degreeType === 'subtract') {
                h.addDegree(new HDegree(degreeValue, degreeAlter, HDegreeType.SUBTRACT))
            }
        }
    }

    static readFretDiagram(d: FretDiagram, e: XmlReader, ctx: ReadContext): void {
        // read410: read the old format first (TODO(port): applies to all files < 4.6 here)
        const oldFormat = ctx.mscVersion() < 460
        let hasBarre = false
        let haveReadNew = false

        while (e.readNextStartElement()) {
            const tag = e.name()

            // Check for new format fret diagram
            if (haveReadNew) {
                e.skipCurrentElement()
                continue
            }
            if (tag === 'fretDiagram') {
                // Read new
                while (e.readNextStartElement()) {
                    const tag2 = e.name()

                    if (tag2 === 'string') {
                        const no = e.intAttribute('no')
                        while (e.readNextStartElement()) {
                            const t = e.name()
                            if (t === 'dot') {
                                const fret = e.intAttribute('fret', 0)
                                const dtype = FretItem.nameToDotType(e.readText())
                                d.setDot(no, fret, true, dtype)
                            } else if (t === 'marker') {
                                const mtype = FretItem.nameToMarkerType(e.readText())
                                d.setMarker(no, mtype)
                            } else if (t === 'fingering') {
                                e.readText()
                                /*setFingering(no, e.readInt()); NOTE:JT todo */
                            } else {
                                e.unknown()
                            }
                        }
                    } else if (tag2 === 'barre') {
                        const start = e.intAttribute('start', -1)
                        const end = e.intAttribute('end', -1)
                        const fret = e.readInt()

                        d.setBarre(start, end, fret)
                    } else if (!TRead.readItemProperties(d, e, ctx)) {
                        e.unknown()
                    }
                }
                if (oldFormat) {
                    haveReadNew = true
                }
            } else if (tag === 'showNut') {
                TRead.readProperty(d, e, ctx, Pid.FRET_NUT)
            } else if (tag === 'orientation') {
                TRead.readProperty(d, e, ctx, Pid.ORIENTATION)
            } else if (tag === 'strings') {
                TRead.readProperty(d, e, ctx, Pid.FRET_STRINGS)
            } else if (tag === 'frets') {
                TRead.readProperty(d, e, ctx, Pid.FRET_FRETS)
            } else if (tag === 'fretOffset') {
                TRead.readProperty(d, e, ctx, Pid.FRET_OFFSET)
            } else if (oldFormat && tag === 'string') {
                const no = e.intAttribute('no')
                while (e.readNextStartElement()) {
                    const t = e.name()
                    if (t === 'dot') {
                        d.setDot(no, e.readInt())
                    } else if (t === 'marker') {
                        d.setMarker(no, String.fromCharCode(e.readInt()) === 'X' ? FretMarkerType.CROSS : FretMarkerType.CIRCLE)
                    } else {
                        e.unknown()
                    }
                }
            } else if (oldFormat && tag === 'barre') {
                hasBarre = e.readBool()
            } else if (tag === 'mag') {
                TRead.readProperty(d, e, ctx, Pid.MAG)
            } else if (tag === 'Harmony') {
                const h = Factory.createItem(ElementType.HARMONY, d) as Harmony // C++: parent is dummy()->segment()
                TRead.readHarmony(h, e, ctx)
                if (h.chords().length) { // else: invalid harmony
                    d.add(h)
                }
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.FRET_SHOW_FINGERINGS)) {
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.FRET_FINGERING)) {
            } else if (!oldFormat && TRead.readPropertyIfTag(d, tag, e, ctx, Pid.EXCLUDE_VERTICAL_ALIGN)) {
            } else if (!TRead.readItemProperties(d, e, ctx)) {
                e.unknown()
            }
        }

        // Old handling of barres
        if (hasBarre) {
            for (let s = 0; s < d.strings(); ++s) {
                for (const dot of d.dot(s)) {
                    if (dot.exists()) {
                        d.setBarre(s, -1, dot.fret)
                        return
                    }
                }
            }
        }
    }

    static readParenthesis(p: Parenthesis, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readPropertyIfTag(p, tag, e, ctx, Pid.HORIZONTAL_DIRECTION)) {
            } else if (!TRead.readItemProperties(p, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTrill(t: Trill, e: XmlReader, ctx: ReadContext): void {
        t.eraseSpannerSegments()

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                t.setTrillType(TConv.fromXmlTrillType(e.readAsciiText(), TrillType.TRILL_LINE))
            } else if (tag === 'Ornament') {
                let ornament = t.ornament()
                if (!ornament) {
                    ornament = Factory.createItem(ElementType.ORNAMENT, t.parentItem()) as Ornament
                    t.setOrnament(ornament)
                }
                ornament.setSymId(Ornament.fromTrillType(t.trillType()))
                TRead.readOrnament(ornament, e, ctx)
                ornament.setTrack(t.track())
            } else if (tag === 'Accidental') {
                const accidental = Factory.createItem(ElementType.ACCIDENTAL, t) as Accidental
                TRead.readAccidental(accidental, e, ctx)
                accidental.setParent(t)
                t.setAccidental(accidental)
                if (t.ornament()) {
                    t.ornament()!.setTrillOldCompatAccidental(accidental)
                }
            } else if (tag === 'ornamentStyle') {
                TRead.readProperty(t, e, ctx, Pid.ORNAMENT_STYLE)
            } else if (!TRead.readSLineProperties(t, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readMarker(m: Marker, e: XmlReader, ctx: ReadContext): void {
        if (ctx.mscVersion() < 460) {
            TRead.readMarker410(m, e, ctx)
            return
        }

        // This property was written in the wrong order from 4.6.0-4.6.2
        // It was written before the text style and was reset on initialising the text style
        let symbolSize: number | null = null

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'label') {
                m.setLabel(e.readAsciiText())
            } else if (TRead.readPropertyIfTag(m, tag, e, ctx, Pid.MARKER_TYPE)) {
            } else if (TRead.readPropertyIfTag(m, tag, e, ctx, Pid.MARKER_CENTER_ON_SYMBOL)) {
            } else if (tag === 'musicSymbolSize') {
                symbolSize = e.readDouble()
            } else if (!TRead.readTextBaseProperties(m, e, ctx)) {
                e.unknown()
            }
        }

        if (symbolSize !== null) {
            m.setProperty(Pid.MUSIC_SYMBOL_SIZE, symbolSize)
            if (m.isStyled(Pid.MUSIC_SYMBOL_SIZE)) {
                m.setPropertyFlags(Pid.MUSIC_SYMBOL_SIZE, PropertyFlags.UNSTYLED)
            }
        }
    }

    /** read410 TRead::read(Marker*): the marker type is derived from the label */
    private static readMarker410(m: Marker, e: XmlReader, ctx: ReadContext): void {
        let mt = MarkerType.SEGNO

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'label') {
                const s = e.readAsciiText()
                m.setLabel(s)
                mt = TConv.fromXmlMarkerType(s, MarkerType.USER)
            } else if (!TRead.readTextBaseProperties(m, e, ctx)) {
                e.unknown()
            }
        }
        m.setMarkerType(mt)
    }

    static readJump(j: Jump, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'jumpTo') {
                j.setJumpTo(e.readText())
            } else if (tag === 'playUntil') {
                j.setPlayUntil(e.readText())
            } else if (tag === 'continueAt') {
                j.setContinueAt(e.readText())
            } else if (tag === 'playRepeats') {
                j.setPlayRepeats(e.readBool())
            } else if (!TRead.readTextBaseProperties(j, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readHairpin(h: Hairpin, e: XmlReader, ctx: ReadContext): void {
        h.eraseSpannerSegments()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                h.setHairpinType(e.readInt() as HairpinType)
            } else if (TRead.readStyledProperty(h, tag, e, ctx)) {
            } else if (tag === 'hairpinCircledTip') {
                h.setHairpinCircledTip(e.readInt() !== 0)
            } else if (tag === 'veloChange') {
                h.setVeloChange(e.readInt())
            } else if (tag === 'singleNoteDynamics') {
                h.setSingleNoteDynamics(e.readInt() !== 0)
            } else if (tag === 'veloChangeMethod') {
                h.setVeloChangeMethod(TConv.fromXmlChangeMethod(e.readAsciiText(), ChangeMethod.NORMAL))
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.VOICE_ASSIGNMENT)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.DIRECTION)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.CENTER_BETWEEN_STAVES)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.SNAP_BEFORE)) {
            } else if (TRead.readPropertyIfTag(h, tag, e, ctx, Pid.SNAP_AFTER)) {
            } else if (!TRead.readTextLineBaseProperties(h, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(h)
        }
        h.styleChanged()
    }

    static readTextLine(l: TextLine, e: XmlReader, ctx: ReadContext): void {
        const system = e.intAttribute('system', 0) === 1
        l.setSystemFlag(system)
        l.initStyle()
        TRead.readTextLineBase(l, e, ctx)
    }

    static readTextLineBase(b: TextLineBase, e: XmlReader, ctx: ReadContext): void {
        b.eraseSpannerSegments()
        while (e.readNextStartElement()) {
            if (!TRead.readTextLineBaseProperties(b, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(b)
        }
    }

    static readVolta(v: Volta, e: XmlReader, ctx: ReadContext): void {
        v.eraseSpannerSegments()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'endings') {
                v.setEndings(e.readText().split(',').map(x => parseInt(x.trim(), 10)).filter(x => !Number.isNaN(x)))
            } else if (TRead.readStyledProperty(v, tag, e, ctx)) {
            } else if (!TRead.readTextLineBaseProperties(v, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(v)
        }
    }

    static readOttava(o: Ottava, e: XmlReader, ctx: ReadContext): void {
        o.eraseSpannerSegments()
        while (e.readNextStartElement()) {
            TRead.readOttavaProperties(o, e, ctx)
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(o)
        }
        if (o.ottavaType() !== OttavaType.OTTAVA_8VA || o.numbersOnly() !== (o.propertyDefault(Pid.NUMBERS_ONLY) as boolean)) {
            o.styleChanged()
        }
    }

    static readOttavaProperties(o: Ottava, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'subtype') {
            const s = e.readText()
            const idx = parseInt(s, 10)
            if (Number.isNaN(idx) || String(idx) !== s.trim()) {
                o.setOttavaType(OttavaType.OTTAVA_8VA)
                const d = ottavaDefault.find(od => od.name === s)
                if (d) {
                    o.setOttavaType(d.type)
                }
            } else {
                o.setOttavaType(idx as OttavaType)
            }
        } else if (TRead.readStyledProperty(o, tag, e, ctx)) {
            return true
        } else if (!TRead.readTextLineBaseProperties(o, e, ctx)) {
            e.unknown()
            return false
        }
        return true
    }

    static readPedal(p: Pedal, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readStyledProperty(p, tag, e, ctx)) {
            } else if (TRead.readPropertyIfTag(p, tag, e, ctx, Pid.LINE_VISIBLE)) {
                p.resetProperty(Pid.END_TEXT)
            } else if (TRead.readPropertyIfTag(p, tag, e, ctx, Pid.BEGIN_HOOK_TYPE)) {
                if (p.beginHookType() !== HookType.NONE) {
                    p.setBeginText('')
                    p.setContinueText('')
                }
            } else if (!TRead.readTextLineBaseProperties(p, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(p)

            if (p.endText() === Pedal.STAR_SYMBOL) {
                p.setEndHookType(HookType.ROSETTE)
            }
        }
    }

    /** C++ TRead::read(LetRing*) and TRead::read(PalmMute*) */
    static readChordTextLineBase(r: ChordTextLineBase, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (TRead.readPropertyIfTag(r, e.name(), e, ctx, Pid.LINE_WIDTH)) {
                r.setPropertyFlags(Pid.LINE_WIDTH, PropertyFlags.UNSTYLED)
            } else if (!TRead.readTextLineBaseProperties(r, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(r)
        }
    }

    static readLyricsLine(l: LyricsLine, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readSLineProperties(l, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTextLineBaseProperties(b: TextLineBase, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        for (const i of TextLineBase.textLineBasePropertyIds()) {
            if (TRead.readPropertyIfTag(b, tag, e, ctx, i)) {
                b.setPropertyFlags(i, PropertyFlags.UNSTYLED)
                return true
            }
        }
        return TRead.readSLineProperties(b, e, ctx)
    }

    static readSLineProperties(l: SLine, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'ticks') {
            l.setTicks(Fraction.fromTicks(e.readInt()))
        } else if (tag === 'Segment') {
            const ls = l.createLineSegment(scoreDummy(l.score()).system())
            ls.setTrack(l.track()) // needed in read to get the right staff mag
            TRead.readLineSegment(ls, e, ctx)
            l.add(ls)
            ls.setVisible(l.visible())
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.DIAGONAL)) {
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.ANCHOR)) {
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.LINE_WIDTH)) {
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.LINE_STYLE)) {
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.DASH_LINE_LEN)) {
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.DASH_GAP_LEN)) {
        } else if (tag === 'lineColor' || tag === 'color') {
            l.setLineColor(e.readColor())
        } else if (!TRead.readSpannerProperties(l, e, ctx)) {
            return false
        }
        return true
    }

    static readLineSegment(l: LineSegment, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                l.setSpannerSegmentType(e.readInt() as SpannerSegmentType)
            } else if (tag === 'off2') {
                l.setUserOff2(e.readPoint().times(l.style().spatium()))
            } else if (!TRead.readItemProperties(l, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readText(t: Text, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'style') {
                const s = TConv.fromXmlTextStyleType(e.readAsciiText(), TextStyleType.DEFAULT)
                if (TextStyleType.TUPLET === s) { // ugly hack for compatibility
                    continue
                }
                t.initTextStyleType(s)
            } else if (!TRead.readTextBaseProperties(t, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTextBaseProperties(t: TextBase, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        for (const i of TextBasePropertyId) {
            if (TRead.readPropertyIfTag(t, tag, e, ctx, i)) {
                if (ctx.mscVersion() >= 470 || tag !== 'align' || t.isMarker() || t.isJump() || t.isHarmony()) {
                    return true
                }
                t.setPosition(t.align().horizontal)
                if (t.position() !== t.propertyDefault(Pid.POSITION)) {
                    t.setPropertyFlags(Pid.POSITION, PropertyFlags.UNSTYLED)
                }
                return true
            }
        }
        const styleFlag = (style: FontStyle, val: boolean): void => {
            t.setFontStyle(val ? fsAdd(t.fontStyle(), style) : fsSub(t.fontStyle(), style))
            if (t.isStyled(Pid.FONT_STYLE)) {
                t.setPropertyFlags(Pid.FONT_STYLE, PropertyFlags.UNSTYLED)
            }
        }
        if (tag === 'text') {
            const str = TRead.lineBreakFromTag(e.readXml())
            t.setXmlText(str)
            t.checkCustomFormatting(str)
        } else if (tag === 'bold') {
            styleFlag(FontStyle.Bold, e.readInt() !== 0)
        } else if (tag === 'italic') {
            styleFlag(FontStyle.Italic, e.readInt() !== 0)
        } else if (tag === 'underline') {
            styleFlag(FontStyle.Underline, e.readInt() !== 0)
        } else if (tag === 'strike') {
            styleFlag(FontStyle.Strike, e.readInt() !== 0)
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.TEXT_LINKED_TO_MASTER)) {
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.VOICE_ASSIGNMENT)) {
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.DIRECTION)) {
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.CENTER_BETWEEN_STAVES)) {
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.MUSIC_SYMBOL_SIZE)) {
        } else if (TRead.readPropertyIfTag(t, tag, e, ctx, Pid.MUSICAL_SYMBOLS_SCALE)) {
        } else if (!TRead.readItemProperties(t, e, ctx)) {
            return false
        }
        return true
    }

    static readMeasureNumberBase(n: TextBase, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (TRead.readPropertyIfTag(n, xml.name(), xml, ctx, Pid.HPLACEMENT)) {
                continue
            }
            if (!TRead.readTextBaseProperties(n, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    // ---------------------------------------------------------
    //   instruments, parts, staves
    // ---------------------------------------------------------

    static readStaffName(item: StaffName, xml: XmlReader): void {
        item.setPos(xml.intAttribute('pos', 0))
        const name = TRead.lineBreakFromTag(xml.readXml())
        // TODO(port): HtmlParser::parse for names starting with <html>
        item.setName(name)
    }

    static readInstrument(item: Instrument, e: XmlReader, ctx: ReadContext, part: Part): void {
        const customDrumset = { value: false }
        item.setId(e.attribute('id'))
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'singleNoteDynamics') {
                e.skipCurrentElement()
            } else if (!TRead.readInstrumentProperties(item, e, ctx, part, customDrumset)) {
                e.unknown()
            }
        }
    }

    static readInstrumentProperties(item: Instrument, e: XmlReader, _ctx: ReadContext, _part: Part,
                                    customDrumset: { value: boolean }): boolean {
        const tag = e.name()
        if (tag === 'soundId') {
            item.setSoundId(e.readText())
        } else if (tag === 'longName') {
            const name = new StaffName()
            TRead.readStaffName(name, e)
            item.appendLongName(name)
        } else if (tag === 'shortName') {
            const name = new StaffName()
            TRead.readStaffName(name, e)
            item.appendShortName(name)
        } else if (tag === 'trackName') {
            item.setTrackName(e.readText())
        } else if (tag === 'minPitchA') {
            item.setMinPitchA(e.readInt())
        } else if (tag === 'minPitchP') {
            item.setMinPitchP(e.readInt())
        } else if (tag === 'maxPitchA') {
            item.setMaxPitchA(e.readInt())
        } else if (tag === 'maxPitchP') {
            item.setMaxPitchP(e.readInt())
        } else if (tag === 'transposeChromatic') {
            const transpose = item.transpose().clone()
            transpose.chromatic = e.readInt()
            item.setTranspose(transpose)
        } else if (tag === 'transposeDiatonic') {
            const transpose = item.transpose().clone()
            transpose.diatonic = e.readInt()
            item.setTranspose(transpose)
        } else if (tag === 'instrumentId') {
            item.setMusicXmlId(e.readText())
        } else if (tag === 'useDrumset') {
            item.setUseDrumset(e.readInt() !== 0)
            if (item.useDrumset()) {
                item.setDrumset(smDrumset())
            }
        } else if (tag === 'Drum' || tag === 'percussionPanelColumns') {
            // if we see one of these tags, a custom drumset will be created
            if (!item.drumset()) {
                item.setDrumset(smDrumset())
            }
            if (!customDrumset.value) {
                item.drumset()!.clear()
                customDrumset.value = true
            }
            if (tag === 'Drum') {
                item.drumset()!.loadDrum(e)
            } else {
                item.drumset()!.setPercussionPanelColumns(e.readInt())
            }
        } else if (tag === 'Tablature' || tag === 'StringData'
                   || tag === 'MidiAction' || tag === 'Articulation' || tag === 'Channel' || tag === 'channel') {
            // TODO(port): drumsets, string data, MIDI data
            e.skipCurrentElement()
        } else if (tag === 'clef') { // sets both transposing and concert clef
            const idx = e.intAttribute('staff', 1) - 1
            const ct = TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)
            item.setClefType(idx, new ClefTypeList(ct, ct))
        } else if (tag === 'concertClef') {
            const idx = e.intAttribute('staff', 1) - 1
            item.setClefType(idx, new ClefTypeList(TConv.fromXmlClefType(e.readAsciiText(), ClefType.G),
                item.clefType(idx).transposingClef))
        } else if (tag === 'transposingClef') {
            const idx = e.intAttribute('staff', 1) - 1
            item.setClefType(idx, new ClefTypeList(item.clefType(idx).concertClef,
                TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)))
        } else if (tag === 'glissandoStyle') {
            e.skipCurrentElement()
        } else {
            return false
        }
        return true
    }

    static readPart(p: Part, e: XmlReader, ctx: ReadContext): void {
        p.setId(String(e.intAttribute('id', 0)))
        while (e.readNextStartElement()) {
            if (!TRead.readPartProperties(p, e, ctx)) {
                e.unknown()
            }
        }
        if (p.partName().length === 0) {
            p.setPartName(p.instrument().trackName())
        }
    }

    static readPartProperties(p: Part, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'id') {
            p.setId(String(e.readInt()))
        } else if (tag === 'Staff') {
            const staff = Factory.createStaff(p)
            p.score().appendStaff(staff)
            TRead.readStaff(staff, e, ctx)
        } else if (tag === 'Instrument') {
            const instr = new Instrument()
            TRead.readInstrument(instr, e, ctx, p)
            p.setInstrument(instr, new Fraction(-1, 1))
        } else if (tag === 'name') {
            p.instrument().setLongName(e.readText())
        } else if (tag === 'color') {
            p.setColor(e.readInt())
        } else if (tag === 'shortName') {
            p.instrument().setShortName(e.readText())
        } else if (tag === 'trackName') {
            p.setPartName(e.readText())
        } else if (tag === 'show') {
            p.setShow(e.readInt() !== 0)
        } else if (tag === 'soloist') {
            p.setSoloist(e.readInt() !== 0)
        } else if (tag === 'hideWhenEmpty') {
            p.setHideWhenEmpty(TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO))
        } else if (tag === 'hideStavesWhenIndividuallyEmpty') {
            p.setHideStavesWhenIndividuallyEmpty(e.readBool())
        } else if (tag === 'preferSharpFlat') {
            const val = e.readText()
            if (val === 'sharps') {
                p.setPreferSharpFlat(PreferSharpFlat.SHARPS)
            } else if (val === 'flats') {
                p.setPreferSharpFlat(PreferSharpFlat.FLATS)
            } else if (val === 'none') {
                p.setPreferSharpFlat(PreferSharpFlat.NONE)
            } else {
                p.setPreferSharpFlat(PreferSharpFlat.AUTO)
            }
        } else {
            return false
        }
        return true
    }

    static readStaffType(t: StaffType, e: XmlReader, ctx: ReadContext): void {
        t.setStyle(ctx.score().style())
        t.setGroup(TConv.fromXmlStaffGroup(e.asciiAttribute('group'), StaffGroup.STANDARD))
        if (t.group() === StaffGroup.TAB) {
            t.setGenKeysig(false)
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'name') {
                t.setXmlName(e.readText())
            } else if (tag === 'lines') {
                t.setLines(e.readInt())
            } else if (tag === 'lineDistance') {
                t.setLineDistance(new Spatium(e.readDouble()))
            } else if (tag === 'yoffset') {
                t.setYoffset(new Spatium(e.readDouble()))
            } else if (tag === 'mag') {
                t.setUserMag(e.readDouble())
            } else if (tag === 'small') {
                t.setSmall(e.readBool())
            } else if (tag === 'stepOffset') {
                t.setStepOffset(e.readInt())
            } else if (tag === 'clef') {
                t.setGenClef(e.readInt() !== 0)
            } else if (tag === 'stemless') {
                const val = e.readInt() !== 0
                t.setStemless(val)
                t.setShowBackTied(!val) // for compatibility with 2.0.2 scores where this prop
            } else if (tag === 'barlines') { // was lacking and controlled by "slashStyle" instead
                t.setShowBarlines(e.readInt() !== 0)
            } else if (tag === 'timesig') {
                t.setGenTimesig(e.readInt() !== 0)
            } else if (tag === 'noteheadScheme') {
                t.setNoteHeadScheme(TConv.fromXmlNoteHeadScheme(e.readAsciiText(), NoteHeadScheme.HEAD_NORMAL))
            } else if (tag === 'keysig') {
                t.setGenKeysig(e.readInt() !== 0)
            } else if (tag === 'ledgerlines') {
                t.setShowLedgerLines(e.readInt() !== 0)
            } else if (tag === 'invisible') {
                t.setInvisible(e.readInt() !== 0)
            } else if (tag === 'color') {
                t.setColor(e.readColor())
            } else if (tag === 'durations') {
                t.setGenDurations(e.readBool())
            } else if (tag === 'durationFontName') {
                t.setDurationFontName(e.readText())
            } else if (tag === 'durationFontSize') {
                t.setDurationFontSize(e.readDouble())
            } else if (tag === 'durationFontY') {
                t.setDurationFontUserY(e.readDouble())
            } else if (tag === 'fretPresetIdx') {
                t.setFretPresetIdx(e.readInt())
            } else if (tag === 'fretFontName' && ctx.mscVersion() < 460) { // read400/read410
                t.setFretPreset(e.readText())
            } else if (tag === 'fretFontSize') {
                t.setFretFontSize(e.readDouble())
            } else if (tag === 'fretFontY') {
                t.setFretFontUserY(e.readDouble())
            } else if (tag === 'fretUseTextStyle') {
                t.setFretUseTextStyle(e.readBool())
            } else if (tag === 'fretTextStyle') {
                t.setFretTextStyle(TConv.fromXmlTextStyleType(e.readAsciiText(), TextStyleType.TAB_FRET_NUMBER))
            } else if (tag === 'symbolRepeat') {
                t.setSymbolRepeat(e.readInt())
            } else if (tag === 'linesThrough') {
                t.setLinesThrough(e.readBool())
            } else if (tag === 'minimStyle') {
                t.setMinimStyle(e.readInt())
            } else if (tag === 'onLines') {
                t.setOnLines(e.readBool())
            } else if (tag === 'showRests') {
                t.setShowRests(e.readBool())
            } else if (tag === 'stemsDown') {
                t.setStemsDown(e.readBool())
            } else if (tag === 'stemsThrough') {
                t.setStemsThrough(e.readBool())
            } else if (tag === 'upsideDown') {
                t.setUpsideDown(e.readBool())
            } else if (tag === 'showTabFingering') {
                t.setShowTabFingering(e.readBool())
            } else if (tag === 'useNumbers') {
                t.setUseNumbers(e.readBool())
            } else if (tag === 'showBackTied') { // must be after reading "slashStyle"/"stemless" prop, as in older
                t.setShowBackTied(e.readBool()) // scores, this prop was lacking and controlled by "slashStyle"
            } else {
                e.unknown()
            }
        }
    }

    static readStaff(s: Staff, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readStaffProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readStaffProperties(s: Staff, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'StaffType') {
            const st = new StaffType()
            TRead.readStaffType(st, e, ctx)
            s.setStaffType(new Fraction(0, 1), st)
        } else if (tag === 'defaultClef') { // sets both default transposing and concert clef
            const ct = TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)
            s.setDefaultClefType(new ClefTypeList(ct, ct))
        } else if (tag === 'defaultConcertClef') {
            s.setDefaultClefType(new ClefTypeList(TConv.fromXmlClefType(e.readAsciiText(), ClefType.G),
                s.defaultClefType().transposingClef))
        } else if (tag === 'defaultTransposingClef') {
            s.setDefaultClefType(new ClefTypeList(s.defaultClefType().concertClef,
                TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)))
        } else if (tag === 'invisible') {
            s.staffType(new Fraction(0, 1)).setInvisible(e.readInt() !== 0) // same as: setInvisible(Fraction(0,1)), e.readInt())
        } else if (tag === 'hideWhenEmpty') {
            s.setHideWhenEmpty(TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO))
        } else if (tag === 'cutaway') {
            s.setCutaway(e.readInt() !== 0)
        } else if (tag === 'showIfSystemEmpty') {
            s.setShowIfEntireSystemEmpty(e.readInt() !== 0)
        } else if (tag === 'hideSystemBarLine') {
            s.setHideSystemBarLine(e.readInt() !== 0)
        } else if (tag === 'mergeMatchingRests') {
            s.setMergeMatchingRests(TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO))
        } else if (tag === 'isStaffVisible') {
            s.setVisible(e.readBool())
        } else if (tag === 'keylist') {
            TRead.readKeyList(s.keyList(), e, ctx)
        } else if (tag === 'bracket') {
            const colorStr = e.attribute('color')
            let col = e.intAttribute('col', -1)
            if (col === -1) {
                col = s.brackets().length
            }
            s.setBracketType(col, e.intAttribute('type', -1) as BracketType)
            s.setBracketSpan(col, e.intAttribute('span', 0))
            s.setBracketVisible(col, e.intAttribute('visible', 1) !== 0)
            const bi: BracketItem = s.brackets()[col]
            if (colorStr) {
                const color = Color.fromString(colorStr)
                if (color.isValid()) {
                    bi.setColor(color)
                }
            }
            e.readNext()
        } else if (tag === 'barLineSpan') {
            const barLineSpan = e.readInt()
            s.setBarLineSpan(barLineSpan > 0)
        } else if (tag === 'barLineSpanFrom') {
            s.setBarLineFrom(e.readInt())
        } else if (tag === 'barLineSpanTo') {
            s.setBarLineTo(e.readInt())
        } else if (tag === 'distOffset') {
            s.setUserDist(new Spatium(e.readDouble()))
        } else if (tag === 'mag') {
            e.readDouble() // _userMag = ...
        } else if (tag === 'eid' || tag === 'linkedTo') {
            e.skipCurrentElement()
        } else if (tag === 'color') {
            s.staffType(new Fraction(0, 1)).setColor(e.readColor())
        } else if (tag === 'transposeDiatonic') {
            ctx.setTransposeDiatonic(e.readInt())
        } else if (tag === 'transposeChromatic') {
            ctx.setTransposeChromatic(e.readInt())
        } else if (tag === 'playbackVoice1' || tag === 'playbackVoice2' || tag === 'playbackVoice3' || tag === 'playbackVoice4') {
            e.skipCurrentElement()
        } else if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.SHOW_MEASURE_NUMBERS)) {
        } else {
            return false
        }
        return true
    }

    static readKeyList(item: KeyList, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'key') {
                let k: Key
                const tick = e.intAttribute('tick', 0)
                if (e.hasAttribute('custom')) {
                    k = Key.C // ke.setCustomType(e.intAttribute("custom"));
                } else {
                    k = e.intAttribute('idx') as Key
                }
                const ke = new KeySigEvent()
                ke.setConcertKey(k)
                item.setKey(ctx.fileDivision(tick), ke)
                e.readNext()
            } else {
                e.unknown()
            }
        }
    }

    // ---------------------------------------------------------
    //   system items
    // ---------------------------------------------------------

    static readKeySig(s: KeySig, e: XmlReader, ctx: ReadContext): void {
        const sig = new KeySigEvent()
        let subtype = 0
        const p = s.part()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'CustDef') {
                const cd: CustDef = { sym: SymId.noSym, degree: 0, xAlt: 0, octAlt: 0 }
                while (e.readNextStartElement()) {
                    const t = e.name()
                    if (t === 'sym') {
                        const val = e.readAsciiText()
                        const n = parseInt(val, 10)
                        cd.sym = !isNaN(n) && /^\d+$/.test(val) ? n as SymId : SymNames.symIdByName(val)
                    } else if (t === 'def') {
                        cd.degree = e.intAttribute('degree', 0)
                        cd.octAlt = e.intAttribute('octAlt', 0)
                        cd.xAlt = e.doubleAttribute('xAlt', 0.0)
                        e.readNext()
                    } else if (t === 'pos') { // for older files
                        let prevx = 0
                        const accidentalGap = ctx.score().style().styleS(Sid.keysigAccidentalDistance).val()
                        const sp = s.spatium()
                        for (const cd2 of sig.customKeyDefs()) {
                            prevx += s.symWidth(cd2.sym) / sp + accidentalGap + cd2.xAlt
                        }
                        const flat = SymNames.nameForSymId(cd.sym).includes('Flat')
                        cd.xAlt = e.doubleAttribute('x', prevx) - prevx
                        let line = Math.trunc(e.doubleAttribute('y', 2) * 2)
                        cd.degree = (3 - line) % 7
                        cd.degree += (cd.degree < 0) ? 7 : 0
                        line += flat ? -1 : 1 // top point in treble for # is -1 (gis), and for b is 1 (es)
                        cd.octAlt = Math.trunc((line - (line >= 0 ? 0 : 6)) / 7)
                        e.readNext()
                    } else {
                        e.unknown()
                    }
                }
                sig.customKeyDefs().push(cd)
            } else if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.SHOW_COURTESY)) {
            } else if (tag === 'concertKey') {
                sig.setConcertKey(e.readInt() as Key)
            } else if (tag === 'actualKey') {
                sig.setKey(e.readInt() as Key)
            } else if (tag === 'custom') {
                e.readInt()
                sig.setCustom(true)
            } else if (tag === 'mode') {
                sig.setMode(TConv.fromXmlKeyMode(e.readAsciiText(), KeyMode.UNKNOWN))
            } else if (tag === 'subtype') {
                subtype = e.readInt()
            } else if (tag === 'forInstrumentChange') {
                sig.setForInstrumentChange(e.readBool())
            } else if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.IS_COURTESY)) {
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
        if (!sig.isValid()) {
            sig.initFromSubtype(subtype) // for backward compatibility
        }
        if (sig.custom() && sig.customKeyDefs().length === 0) {
            sig.setMode(KeyMode.NONE)
        }
        // if there are more than 6 accidentals in transposing key, it cannot be PreferSharpFlat::AUTO
        if (p && !s.concertPitch() && (sig.key() > 6 || sig.key() < -6)
            && p.preferSharpFlat() === PreferSharpFlat.AUTO && !p.instrument(s.tick()).transpose().isZero()) {
            p.setPreferSharpFlat(PreferSharpFlat.NONE)
        }
        s.setKeySigEvent(sig)
    }

    static readTimeSig(s: TimeSig, e: XmlReader, ctx: ReadContext): void {
        let n = 0
        let z1 = 0
        let z2 = 0
        let z3 = 0
        let z4 = 0
        let old = false
        let timeSigType = 0 as TimeSigType
        let sigN = 0
        let sigD = 1
        let stretchN = 1
        let stretchD = 1
        let numeratorString = ''
        let denominatorString = ''
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'den') {
                old = true
                n = e.readInt()
            } else if (tag === 'nom1') {
                old = true
                z1 = e.readInt()
            } else if (tag === 'nom2') {
                old = true
                z2 = e.readInt()
            } else if (tag === 'nom3') {
                old = true
                z3 = e.readInt()
            } else if (tag === 'nom4') {
                old = true
                z4 = e.readInt()
            } else if (tag === 'subtype') {
                timeSigType = e.readInt() as TimeSigType
            } else if (tag === 'showCourtesySig') {
                s.setShowCourtesySig(e.readInt() !== 0)
            } else if (tag === 'sigN') {
                sigN = e.readInt()
            } else if (tag === 'sigD') {
                sigD = e.readInt()
            } else if (tag === 'stretchN') {
                stretchN = e.readInt()
            } else if (tag === 'stretchD') {
                stretchD = e.readInt()
            } else if (tag === 'textN') {
                numeratorString = e.readText()
            } else if (tag === 'textD') {
                denominatorString = e.readText()
            } else if (tag === 'Groups') {
                const groups = new Groups()
                TRead.readGroups(groups, e)
                s.setGroups(groups)
            } else if (tag === 'isCourtesy') {
                s.setIsCourtesy(e.readBool())
            } else if (TRead.readStyledProperty(s, tag, e, ctx)) {
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
        let sig = new Fraction(sigN, sigD)
        if (old) {
            sig = new Fraction(z1 + z2 + z3 + z4, n)
        }
        const stretch = new Fraction(stretchN, stretchD).reduced()
        s.setSig(sig, timeSigType)
        s.setStretch(stretch)
        s.setNumeratorString(numeratorString)
        s.setDenominatorString(denominatorString)
    }

    static readGroups(g: Groups, e: XmlReader): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'Node') {
                g.addNode({ pos: e.intAttribute('pos'), action: e.intAttribute('action') })
                e.skipCurrentElement()
            } else {
                e.unknown()
            }
        }
    }

    static readClef(c: Clef, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'concertClefType') {
                c.setConcertClef(TConv.fromXmlClefType(e.readAsciiText(), ClefType.G))
            } else if (tag === 'transposingClefType') {
                c.setTransposingClef(TConv.fromXmlClefType(e.readAsciiText(), ClefType.G))
            } else if (tag === 'showCourtesyClef') {
                c.setShowCourtesy(e.readInt() !== 0)
            } else if (tag === 'forInstrumentChange') {
                c.setForInstrumentChange(e.readBool())
            } else if (tag === 'clefToBarlinePos') {
                c.setClefToBarlinePosition(e.readInt())
            } else if (tag === 'isHeader') {
                c.setIsHeader(e.readBool())
            } else if (!TRead.readItemProperties(c, e, ctx)) {
                e.unknown()
            }
        }
        if (c.clefType() === ClefType.INVALID) {
            c.setClefType(ClefType.G)
        }
    }

    static readBarLine(b: BarLine, e: XmlReader, ctx: ReadContext): void {
        b.resetProperty(Pid.BARLINE_SPAN)
        b.resetProperty(Pid.BARLINE_SPAN_FROM)
        b.resetProperty(Pid.BARLINE_SPAN_TO)
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                b.setBarLineType(TConv.fromXmlBarLineType(e.readAsciiText(), BarLineType.NORMAL))
            } else if (tag === 'span') {
                b.setSpanStaff(e.readBool())
            } else if (tag === 'spanFromOffset') {
                b.setSpanFrom(e.readInt())
            } else if (tag === 'spanToOffset') {
                b.setSpanTo(e.readInt())
            } else if (tag === 'Articulation') {
                const a = Factory.createItem(ElementType.ARTICULATION, b.score()) as Articulation
                TRead.readArticulation(a, e, ctx)
                b.add(a)
            } else if (tag === 'Symbol') {
                const s = Factory.createItem(ElementType.SYMBOL, b) as Symbol
                s.setTrack(b.track())
                TRead.readSymbol(s, e, ctx)
                b.add(s)
            } else if (tag === 'Image') {
                e.skipCurrentElement() // TODO(port): images
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readLayoutBreak(b: LayoutBreak, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                TRead.readProperty(b, e, ctx, Pid.LAYOUT_BREAK)
            } else if (tag === 'pause') {
                TRead.readProperty(b, e, ctx, Pid.PAUSE)
            } else if (tag === 'startWithLongNames') {
                TRead.readProperty(b, e, ctx, Pid.START_WITH_LONG_NAMES)
            } else if (tag === 'startWithMeasureOne') {
                TRead.readProperty(b, e, ctx, Pid.START_WITH_MEASURE_ONE)
            } else if (tag === 'firstSystemIndentation') {
                TRead.readProperty(b, e, ctx, Pid.FIRST_SYSTEM_INDENTATION)
            } else if (tag === 'showCourtesySig') {
                TRead.readProperty(b, e, ctx, Pid.SHOW_COURTESY)
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readSpacer(s: Spacer, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                s.setSpacerType(e.readInt() as SpacerType)
            } else if (tag === 'space') {
                s.setGap(new Spatium(e.readDouble()))
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readBracket(b: Bracket, e: XmlReader, ctx: ReadContext): void {
        const bi = Factory.createItem(ElementType.BRACKET_ITEM, b.score()) as BracketItem
        bi.setBracketType(TConv.fromXmlBracketType(e.asciiAttribute('type'), BracketType.NORMAL))
        while (e.readNextStartElement()) {
            if (e.name() === 'level') {
                bi.setColumn(e.readInt())
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
        b.setBracketItem(bi)
    }

    // ---------------------------------------------------------
    //   boxes
    // ---------------------------------------------------------

    static readBox(b: Box, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readBoxProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readHBox(b: HBox, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readHBoxProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readHBoxProperties(b: HBox, e: XmlReader, ctx: ReadContext): boolean {
        if (TRead.readPropertyIfTag(b, e.name(), e, ctx, Pid.CREATE_SYSTEM_HEADER)) {
            return true
        }
        return TRead.readBoxProperties(b, e, ctx)
    }

    static readTBox(b: TBox, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Text') {
                TRead.readText(b.text(), e, ctx)
            } else if (!TRead.readBoxProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readBoxProperties(b: Box, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'height') {
            b.setBoxHeight(new Spatium(e.readDouble()))
        } else if (tag === 'width') {
            b.setBoxWidth(new Spatium(e.readDouble()))
        } else if (tag === 'topGap') {
            b.setTopGap(new Spatium(e.readDouble()))
            b.setPropertyFlags(Pid.TOP_GAP, PropertyFlags.UNSTYLED)
        } else if (tag === 'bottomGap') {
            b.setBottomGap(new Spatium(e.readDouble()))
            b.setPropertyFlags(Pid.BOTTOM_GAP, PropertyFlags.UNSTYLED)
        } else if (tag === 'leftMargin') {
            b.setLeftMargin(e.readDouble())
        } else if (tag === 'rightMargin') {
            b.setRightMargin(e.readDouble())
        } else if (tag === 'topMargin') {
            b.setTopMargin(e.readDouble())
        } else if (tag === 'bottomMargin') {
            b.setBottomMargin(e.readDouble())
        } else if (tag === 'boxAutoSize') {
            b.setAutoSizeEnabled(e.readBool())
        } else if (tag === 'Text') {
            if (b.isTBox()) {
                TRead.readText((b as TBox).text(), e, ctx)
            } else {
                const t = Factory.createItem(ElementType.TEXT, b) as Text
                TRead.readText(t, e, ctx)
                if (!t.empty()) {
                    b.add(t)
                }
            }
        } else if (tag === 'Symbol') {
            const s = Factory.createItem(ElementType.SYMBOL, b) as Symbol
            TRead.readSymbol(s, e, ctx)
            b.add(s)
        } else if (tag === 'Image' || tag === 'FretDiagram') {
            e.skipCurrentElement() // TODO(port): images, fret diagrams
        } else if (tag === 'HBox' || tag === 'VBox') {
            e.skipCurrentElement() // TODO(port): nested boxes
        } else if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.PADDING_TO_NOTATION_ABOVE)) {
        } else if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.PADDING_TO_NOTATION_BELOW)) {
        } else if (TRead.readMeasureBaseProperties(b, e, ctx)) {
        } else {
            return false
        }
        return true
    }

    static readStaffTypeChange(c: StaffTypeChange, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'StaffType') {
                const st = new StaffType()
                TRead.readStaffType(st, e, ctx)
                // Measure::add() will replace this with a pointer to a copy in the staff
                c.setStaffType(st, true)
            } else if (!TRead.readItemProperties(c, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readMeasureBaseProperties(b: MeasureBase, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'LayoutBreak') {
            const lb = Factory.createItem(ElementType.LAYOUT_BREAK, b) as LayoutBreak
            lb.setParent(b)
            TRead.readLayoutBreak(lb, e, ctx)
            let doAdd = true
            switch (lb.layoutBreakType()) {
            case LayoutBreakType.LINE: doAdd = !b.lineBreak(); break
            case LayoutBreakType.PAGE: doAdd = !b.pageBreak(); break
            case LayoutBreakType.SECTION: doAdd = !b.sectionBreak(); break
            case LayoutBreakType.NOBREAK: doAdd = !b.noBreak(); break
            }
            if (doAdd) {
                b.add(lb)
                b.cleanupLayoutBreaks(false)
            }
        } else if (tag === 'StaffTypeChange') {
            const stc = Factory.createItem(ElementType.STAFFTYPE_CHANGE, b) as StaffTypeChange
            stc.setTrack(ctx.track())
            stc.setParent(b)
            TRead.readStaffTypeChange(stc, e, ctx)
            b.add(stc)
        } else if (TRead.readItemProperties(b, e, ctx)) {
        } else {
            return false
        }
        return true
    }

    // ---------------------------------------------------------
    //   symbols
    // ---------------------------------------------------------

    static readBSymbolProperties(sym: BSymbol, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (TRead.readItemProperties(sym, e, ctx)) {
            return true
        } else if (tag === 'systemFlag') {
            sym.setSystemFlag(e.readInt() !== 0)
        } else if (tag === 'Symbol') {
            const s = Factory.createItem(ElementType.SYMBOL, sym) as Symbol
            TRead.readSymbol(s, e, ctx)
            sym.add(s)
        } else if (tag === 'FSymbol' || tag === 'Image') {
            e.skipCurrentElement() // TODO(port): FSymbol, Image
        } else {
            return false
        }
        return true
    }

    static readSymbol(sym: Symbol, e: XmlReader, ctx: ReadContext): void {
        let symId = SymId.noSym
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'name') {
                const val = e.readText()
                symId = SymNames.symIdByName(val)
                if (val !== 'noSym' && symId === SymId.noSym) {
                    // TODO(port): SymNames::symIdByUserName
                    symId = SymId.noSym
                }
                sym.setSym(symId)
            } else if (tag === 'font') {
                TRead.readProperty(sym, e, ctx, Pid.SCORE_FONT)
            } else if (TRead.readPropertyIfTag(sym, tag, e, ctx, Pid.SCORE_FONT)) {
            } else if (TRead.readPropertyIfTag(sym, tag, e, ctx, Pid.SYMBOLS_SIZE)) {
            } else if (TRead.readPropertyIfTag(sym, tag, e, ctx, Pid.SYMBOL_ANGLE)) {
            } else if (!TRead.readBSymbolProperties(sym, e, ctx)) {
                e.unknown()
            }
        }
        sym.setPos(new PointF())
    }

    // ---------------------------------------------------------
    //   chords, rests, notes
    // ---------------------------------------------------------

    static readChord(ch: Chord, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readChordProperties(ch, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readChordProperties(ch: Chord, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'Note') {
            const note = Factory.createItem(ElementType.NOTE, ch) as Note
            // the note needs to know the properties of the track it belongs to
            note.setTrack(ch.track())
            note.setParent(ch)
            TRead.readNote(note, e, ctx)
            ch.add(note)
        } else if (TRead.readChordRestProperties(ch, e, ctx)) {
        } else if (tag === 'Stem') {
            const s = Factory.createItem(ElementType.STEM, ch) as Stem
            TRead.readStem(s, e, ctx)
            ch.add(s)
        } else if (tag === 'Hook') {
            const hook = Factory.createItem(ElementType.HOOK, ch) as Symbol
            TRead.readSymbol(hook, e, ctx)
            ch.add(hook)
        } else if (tag === 'appoggiatura') {
            ch.setNoteType(NoteType.APPOGGIATURA)
            e.readNext()
        } else if (tag === 'acciaccatura') {
            ch.setNoteType(NoteType.ACCIACCATURA)
            e.readNext()
        } else if (tag === 'grace4') {
            ch.setNoteType(NoteType.GRACE4)
            e.readNext()
        } else if (tag === 'grace16') {
            ch.setNoteType(NoteType.GRACE16)
            e.readNext()
        } else if (tag === 'grace32') {
            ch.setNoteType(NoteType.GRACE32)
            e.readNext()
        } else if (tag === 'grace8after') {
            ch.setNoteType(NoteType.GRACE8_AFTER)
            e.readNext()
        } else if (tag === 'grace16after') {
            ch.setNoteType(NoteType.GRACE16_AFTER)
            e.readNext()
        } else if (tag === 'grace32after') {
            ch.setNoteType(NoteType.GRACE32_AFTER)
            e.readNext()
        } else if (tag === 'StemSlash') {
            const ss = Factory.createItem(ElementType.STEM_SLASH, ch)!
            TRead.readItemPropertiesOnly(ss, e, ctx)
            ch.add(ss)
        } else if (TRead.readPropertyIfTag(ch, tag, e, ctx, Pid.STEM_DIRECTION)) {
        } else if (tag === 'noStem') {
            ch.setNoStem(e.readInt() !== 0)
        } else if (tag === 'showStemSlash') {
            ch.setShowStemSlash(e.readBool())
        } else if (tag === 'Arpeggio') {
            const arpeggio = Factory.createItem(ElementType.ARPEGGIO, ch) as Arpeggio
            arpeggio.setTrack(ch.track())
            TRead.readArpeggio(arpeggio, e, ctx)
            arpeggio.setParent(ch)
            ch.setArpeggio(arpeggio)
        } else if (tag === 'Tremolo') { // compat
            const tcompat: TremoloCompat = { parent: ch, single: null, two: null }
            TRead.readTremoloCompat(tcompat, e, ctx)
            if (tcompat.two) {
                tcompat.two.setParent(ch)
                tcompat.two.setDurationType(ch.durationType())
                ch.setTremoloTwoChord(tcompat.two, false)
            } else if (tcompat.single) {
                tcompat.single.setParent(ch)
                tcompat.single.setDurationType(ch.durationType())
                ch.setTremoloSingleChord(tcompat.single)
            }
        } else if (tag === 'TremoloSingleChord') {
            const trem = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, ch) as TremoloSingleChord
            trem.setTrack(ch.track())
            TRead.readTremoloCompat({ parent: ch, single: trem, two: null }, e, ctx)
            trem.setParent(ch)
            trem.setDurationType(ch.durationType())
            ch.setTremoloSingleChord(trem)
        } else if (tag === 'TremoloTwoChord') {
            const trem = Factory.createItem(ElementType.TREMOLO_TWOCHORD, ch) as TremoloTwoChord
            trem.setTrack(ch.track())
            TRead.readTremoloCompat({ parent: ch, single: null, two: trem }, e, ctx)
            trem.setParent(ch)
            trem.setDurationType(ch.durationType())
            ch.setTremoloTwoChord(trem, false)
        } else if (tag === 'ChordBracket' || tag === 'ChordLine' || tag === 'NoteParenGroup') {
            // TODO(port): chord brackets, chord lines, note parentheses
            e.skipCurrentElement()
        } else if (tag === 'combineVoice') {
            TRead.readPropertyIfTag(ch, tag, e, ctx, Pid.COMBINE_VOICE)
        } else {
            return false
        }
        if (!ch.visible()) {
            ch.setVisible(true) // Chord cannot be set invisible, only its elements can
        }
        return true
    }

    static readChordRestProperties(ch: ChordRest, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'durationType') {
            ch.setDurationType(TConv.fromXmlDurationType(e.readAsciiText(), DurationType.V_QUARTER))
            if (ch.actualDurationType().type() !== DurationType.V_MEASURE) {
                ch.setTicks(ch.actualDurationType().fraction())
            }
        } else if (tag === 'BeamMode') {
            ch.setBeamMode(TConv.fromXmlBeamMode(e.readAsciiText(), BeamMode.AUTO))
        } else if (tag === 'Articulation') {
            const atr = Factory.createItem(ElementType.ARTICULATION, ch) as Articulation
            atr.setTrack(ch.track())
            TRead.readArticulation(atr, e, ctx)
            ch.add(atr)
        } else if (tag === 'Ornament') {
            const ornament = Factory.createItem(ElementType.ORNAMENT, ch) as Ornament
            ornament.setTrack(ch.track())
            TRead.readOrnament(ornament, e, ctx)
            ch.add(ornament)
        } else if (tag === 'Tapping') {
            e.skipCurrentElement() // TODO(port): tapping
        } else if (tag === 'leadingSpace' || tag === 'trailingSpace') {
            e.skipCurrentElement()
        } else if (tag === 'small') {
            ch.setSmall(e.readInt() !== 0)
        } else if (tag === 'duration') {
            ch.setTicks(e.readFraction())
        } else if (tag === 'dots') {
            ch.setDots(e.readInt())
        } else if (tag === 'staffMove') {
            ch.setStaffMove(e.readInt())
            ch.checkStaffMoveValidity()
        } else if (tag === 'Spanner') {
            TRead.readSpanner(e, ctx, ch, ch.track())
        } else if (tag === 'Lyrics') {
            const lyr = Factory.createItem(ElementType.LYRICS, ch) as Lyrics
            lyr.setTrack(ctx.track())
            TRead.readLyrics(lyr, e, ctx)
            ch.add(lyr)
        } else if (tag === 'pos') {
            const pt = e.readPoint()
            ch.setOffset(pt.times(ch.spatium()))
        } else if (!TRead.readItemProperties(ch, e, ctx)) {
            return false
        }
        return true
    }

    static readRest(r: Rest, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'NoteDot') {
                const dot = Factory.createItem(ElementType.NOTEDOT, r) as NoteDot
                dot.setParent(r)
                TRead.readItemPropertiesOnly(dot, e, ctx)
                r.add(dot)
            } else if (TRead.readStyledProperty(r, tag, e, ctx)) {
            } else if (TRead.readPropertyIfTag(r, tag, e, ctx, Pid.ALIGN_WITH_OTHER_RESTS)) {
            } else if (TRead.readChordRestProperties(r, e, ctx)) {
            } else {
                e.unknown()
            }
        }
    }

    static readNote(n: Note, e: XmlReader, ctx: ReadContext): void {
        n.setTpc1(Tpc.TPC_INVALID)
        n.setTpc2(Tpc.TPC_INVALID)
        while (e.readNextStartElement()) {
            if (!TRead.readNoteProperties(n, e, ctx)) {
                e.unknown()
            }
        }
        n.setupAfterRead(ctx.tick(), ctx.pasteMode())
    }

    static readNoteProperties(n: Note, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'pitch') {
            n.setPitch(clampPitch(e.readInt()))
        } else if (TRead.readPropertyIfTag(n, tag, e, ctx, Pid.CENT_OFFSET)) {
        } else if (tag === 'tpc') {
            const tpc = e.readInt()
            n.setTpc1(tpc)
            n.setTpc2(tpc)
        } else if (tag === 'track') { // for performance
            n.setTrack(e.readInt())
        } else if (tag === 'Accidental') {
            const a = Factory.createItem(ElementType.ACCIDENTAL, n) as Accidental
            a.setTrack(n.track())
            TRead.readAccidental(a, e, ctx)
            n.add(a)
        } else if (tag === 'Spanner') {
            TRead.readSpanner(e, ctx, n, n.track())
        } else if (tag === 'tpc2') {
            n.setTpc2(e.readInt())
        } else if (tag === 'small') {
            n.setSmall(e.readInt() !== 0)
        } else if (tag === 'mirror') {
            TRead.readProperty(n, e, ctx, Pid.MIRROR_HEAD)
        } else if (tag === 'dotPosition') {
            TRead.readProperty(n, e, ctx, Pid.DOT_POSITION)
        } else if (tag === 'fixed') {
            n.setFixed(e.readBool())
        } else if (tag === 'fixedLine') {
            n.setFixedLine(e.readInt())
        } else if (tag === 'headScheme') {
            TRead.readProperty(n, e, ctx, Pid.HEAD_SCHEME)
        } else if (tag === 'head') {
            TRead.readProperty(n, e, ctx, Pid.HEAD_GROUP)
        } else if (tag === 'velocity') {
            n.setUserVelocity(e.readInt())
        } else if (tag === 'play') {
            n.setPlay(e.readInt() !== 0)
        } else if (tag === 'tuning') {
            n.setTuning(e.readDouble())
        } else if (tag === 'fret') {
            n.setFret(e.readInt())
        } else if (tag === 'string') {
            n.setString(e.readInt())
        } else if (tag === 'ghost') {
            n.setGhost(e.readInt() !== 0)
        } else if (tag === 'dead') {
            n.setDeadNote(e.readInt() !== 0)
        } else if (tag === 'headType') {
            TRead.readProperty(n, e, ctx, Pid.HEAD_TYPE)
        } else if (tag === 'veloType') {
            TRead.readProperty(n, e, ctx, Pid.VELO_TYPE)
        } else if (tag === 'line') {
            n.setLine(e.readInt())
        } else if (tag === 'Text') {
            const t = Factory.createItem(ElementType.TEXT, n) as Text
            t.setTrack(n.track())
            TRead.readText(t, e, ctx)
            n.add(t)
        } else if (tag === 'Symbol') {
            const s = Factory.createItem(ElementType.SYMBOL, n) as Symbol
            s.setTrack(n.track())
            TRead.readSymbol(s, e, ctx)
            n.add(s)
        } else if (tag === 'NoteDot') {
            const dot = Factory.createItem(ElementType.NOTEDOT, n) as NoteDot
            dot.setParent(n)
            TRead.readItemPropertiesOnly(dot, e, ctx)
            n.add(dot)
        } else if (tag === 'LaissezVib') {
            const lv = Factory.createItem(ElementType.LAISSEZ_VIB, n) as LaissezVib
            TRead.readLaissezVib(lv, e, ctx)
            lv.setParent(n)
            n.add(lv)
        } else if (tag === 'Fingering' || tag === 'Image' || tag === 'Bend' || tag === 'Events' || tag === 'ChordLine'
                   || tag === 'PartialTie') {
            // TODO(port): fingering, images, bends, play events, chord lines, partial ties
            e.skipCurrentElement()
        } else if (tag === 'offset') {
            TRead.readItemProperties(n, e, ctx)
        } else if (tag === 'overrideBendVisibilityRules') {
            e.readBool()
        } else if (TRead.readPropertyIfTag(n, tag, e, ctx, Pid.HIDE_GENERATED_PARENTHESES)) {
        } else if (TRead.readItemProperties(n, e, ctx)) {
        } else {
            return false
        }
        return true
    }

    static readAccidental(a: Accidental, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'bracket') {
                const i = e.readInt()
                if (i === 0 || i === 1 || i === 2) {
                    a.setBracket(i as AccidentalBracket)
                }
            } else if (tag === 'subtype') {
                a.setSubtype(e.readAsciiText())
            } else if (tag === 'role') {
                const r = e.readAsciiText()
                a.setRole(r === 'user' || r === '1' ? AccidentalRole.USER : AccidentalRole.AUTO)
            } else if (tag === 'small') {
                a.setSmall(e.readInt() !== 0)
            } else if (TRead.readPropertyIfTag(a, tag, e, ctx, Pid.ACCIDENTAL_STACKING_ORDER_OFFSET)) {
            } else if (TRead.readItemProperties(a, e, ctx)) {
            } else {
                e.unknown()
            }
        }
    }

    static readStem(s: Stem, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.USER_LEN)) {
            } else if (TRead.readStyledProperty(s, tag, e, ctx)) {
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTremoloCompat(tc: TremoloCompat, e: XmlReader, ctx: ReadContext): void {
        const item = (): EngravingItem => (tc.two ? tc.two : tc.single)!

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                const type = TConv.fromXmlTremoloType(e.readAsciiText(), TremoloType.INVALID_TREMOLO)
                if (isTremoloTwoChord(type)) {
                    if (!tc.two) {
                        tc.two = Factory.createItem(ElementType.TREMOLO_TWOCHORD, tc.parent) as TremoloTwoChord
                        tc.two.setTrack(tc.parent!.track())
                    }
                    tc.two.setTremoloType(type)
                } else {
                    if (!tc.single) {
                        tc.single = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, tc.parent) as TremoloSingleChord
                        tc.single.setTrack(tc.parent!.track())
                    }
                    tc.single.setTremoloType(type)
                }
            }
            // Style needs special handling other than readStyledProperty()
            // to avoid calling customStyleApplicable() in setProperty(),
            // which cannot be called now because durationType() isn't defined yet.
            else if (tag === 'strokeStyle') {
                if (tc.two) {
                    tc.two.setTremoloStyle(e.readInt() as TremoloStyle)
                    tc.two.setPropertyFlags(Pid.TREMOLO_STYLE, PropertyFlags.UNSTYLED)
                } else {
                    e.skipCurrentElement()
                }
            } else if (tag === 'Fragment') {
                if (tc.two) {
                    const f: BeamFragment = { py1: [0, 0], py2: [0, 0] }
                    const idx = tc.two.directionIdx()
                    tc.two.setUserModified(true)
                    const _spatium = tc.two.spatium()
                    while (e.readNextStartElement()) {
                        const tag1 = e.name()
                        if (tag1 === 'y1') {
                            f.py1[idx] = e.readDouble() * _spatium
                        } else if (tag1 === 'y2') {
                            f.py2[idx] = e.readDouble() * _spatium
                        } else {
                            e.unknown()
                        }
                    }
                    tc.two.setBeamFragment(f)
                } else {
                    e.skipCurrentElement()
                }
            } else if (tag === 'play') {
                if (tc.two) {
                    tc.two.setPlayTremolo(e.readBool())
                } else if (tc.single) {
                    tc.single.setPlayTremolo(e.readBool())
                } else {
                    e.skipCurrentElement()
                }
            } else if (TRead.readStyledProperty(item(), tag, e, ctx)) {
            } else if (!TRead.readItemProperties(item(), e, ctx)) {
                e.unknown()
            }
        }
    }

    static readArpeggio(a: Arpeggio, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                a.setArpeggioType(TConv.fromXmlArpeggioType(e.readAsciiText(), ArpeggioType.NORMAL))
            } else if (tag === 'userLen1') {
                a.setUserLen1(e.readDouble() * a.spatium())
            } else if (tag === 'userLen2') {
                a.setUserLen2(e.readDouble() * a.spatium())
            } else if (tag === 'span') {
                a.setSpan(e.readInt())
            } else if (tag === 'play') {
                a.setPlayArpeggio(e.readBool())
            } else if (tag === 'timeStretch') {
                a.setStretch(e.readDouble())
            } else if (!TRead.readItemProperties(a, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readArticulation(a: Articulation, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (!TRead.readArticulationProperties(a, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readArticulationProperties(a: Articulation, xml: XmlReader, ctx: ReadContext): boolean {
        {
            const tag = xml.name()
            if (tag === 'subtype') {
                const s = xml.readAsciiText()
                const textType = TConv.fromXmlArticulationTextType(s, ArticulationTextType.NO_TEXT)
                if (textType !== ArticulationTextType.NO_TEXT) {
                    a.setTextType(textType)
                } else {
                    a.setSymId(SymNames.symIdByName(s))
                }
            } else if (tag === 'channel') {
                a.setChannelName(xml.attribute('name'))
                xml.readNext()
            } else if (tag === 'anchor') {
                TRead.readPropertyIfTag(a, tag, xml, ctx, Pid.ARTICULATION_ANCHOR)
            } else if (tag === 'direction') {
                TRead.readProperty(a, xml, ctx, Pid.DIRECTION)
            } else if (tag === 'ornamentStyle') {
                TRead.readProperty(a, xml, ctx, Pid.ORNAMENT_STYLE)
            } else if (tag === 'play') {
                a.setPlayArticulation(xml.readBool())
            } else if (tag === 'offset') {
                TRead.readItemProperties(a, xml, ctx)
            } else if (!TRead.readItemProperties(a, xml, ctx)) {
                return false
            }
        }
        return true
    }

    static readOrnament(o: Ornament, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (!TRead.readOrnamentProperties(o, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readOrnamentProperties(o: Ornament, xml: XmlReader, ctx: ReadContext): boolean {
        const tag = xml.name()
        if (TRead.readPropertyIfTag(o, tag, xml, ctx, Pid.INTERVAL_ABOVE)) {
        } else if (TRead.readPropertyIfTag(o, tag, xml, ctx, Pid.INTERVAL_BELOW)) {
        } else if (TRead.readPropertyIfTag(o, tag, xml, ctx, Pid.ORNAMENT_SHOW_ACCIDENTAL)) {
        } else if (TRead.readPropertyIfTag(o, tag, xml, ctx, Pid.ORNAMENT_SHOW_CUE_NOTE)) {
        } else if (TRead.readPropertyIfTag(o, tag, xml, ctx, Pid.START_ON_UPPER_NOTE)) {
        } else if (TRead.readArticulationProperties(o, xml, ctx)) {
        } else if (tag === 'Accidental') {
            const accidental = Factory.createItem(ElementType.ACCIDENTAL, o) as Accidental
            TRead.readAccidental(accidental, xml, ctx)
            accidental.setTrack(ctx.track())
            accidental.setParent(o)
            if (accidental.placement() === PlacementV.ABOVE) {
                o.setAccidentalAbove(accidental)
            } else {
                o.setAccidentalBelow(accidental)
            }
        } else if (tag === 'Chord') {
            const chord = Factory.createItem(ElementType.CHORD, ctx.score()) as Chord
            TRead.readChord(chord, xml, ctx)
            chord.setTrack(ctx.track())
            chord.setIsTrillCueNote(true)
            o.setCueNoteChord(chord)
            o.setNoteAbove(chord.notes()[0])
            // TODO(port): CompatUtils::doMigrateNoteParens (note parentheses)
        } else {
            return false
        }
        return true
    }

    static readLyrics(l: Lyrics, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'no') {
                l.setVerse(e.readInt())
                if (l.isEven()) {
                    l.initTextStyleType(TextStyleType.LYRICS_EVEN)
                }
            } else if (tag === 'syllabic') {
                l.setSyllabic(TConv.fromXmlLyricsSyllabic(e.readAsciiText(), LyricsSyllabic.SINGLE))
            } else if (tag === 'ticks_f') {
                l.setTicks(e.readFraction())
            } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.PLACEMENT)) {
            } else if (tag === 'LyricsLine') {
                e.skipCurrentElement() // TODO(port): LyricsLine
            } else if (!TRead.readTextBaseProperties(l, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTuplet(t: Tuplet, e: XmlReader, ctx: ReadContext): void {
        t.setId(e.intAttribute('id', 0))
        let number: Text | null = null
        let ratioN = 0
        let ratioD = 1
        let baseLen = new TDuration()
        const styleFlag = (setter: (v: boolean) => void): void => {
            const val = e.readInt() !== 0
            if (number) {
                setter.call(number, val)
            }
            if (t.isStyled(Pid.FONT_STYLE)) {
                t.setPropertyFlags(Pid.FONT_STYLE, PropertyFlags.UNSTYLED)
            }
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readStyledProperty(t, tag, e, ctx)) {
            } else if (tag === 'bold') { //important that these properties are read after number is created
                styleFlag(function (this: Text, v: boolean) { this.setBold(v) })
            } else if (tag === 'italic') {
                styleFlag(function (this: Text, v: boolean) { this.setItalic(v) })
            } else if (tag === 'underline') {
                styleFlag(function (this: Text, v: boolean) { this.setUnderline(v) })
            } else if (tag === 'strike') {
                styleFlag(function (this: Text, v: boolean) { this.setStrike(v) })
            } else if (tag === 'normalNotes') {
                ratioD = e.readInt()
            } else if (tag === 'actualNotes') {
                ratioN = e.readInt()
            } else if (tag === 'p1') {
                t.setUserPoint1(e.readPoint().times(t.style().spatium()))
            } else if (tag === 'p2') {
                t.setUserPoint2(e.readPoint().times(t.style().spatium()))
            } else if (tag === 'baseNote') {
                baseLen = new TDuration(TConv.fromXmlDurationType(e.readAsciiText(), DurationType.V_INVALID))
            } else if (tag === 'baseDots') {
                baseLen.setDots(e.readInt())
            } else if (tag === 'Number') {
                number = Factory.createItem(ElementType.TEXT, t) as Text
                number.setTextStyleType(TextStyleType.TUPLET)
                number.initTextStyleType(TextStyleType.TUPLET)
                number.setComposition(true)
                number.setParent(t)
                t.resetNumberProperty(number)
                TRead.readText(number, e, ctx)
                number.setVisible(t.visible()) //?? override saved property
                number.setColor(t.color())
                number.setTrack(t.track())
                // move property flags from _number back to tuplet
                for (const p of [Pid.FONT_FACE, Pid.FONT_SIZE, Pid.FONT_STYLE, Pid.ALIGN, Pid.POSITION]) {
                    t.setPropertyFlags(p, number.propertyFlags(p))
                }
            } else if (!TRead.readItemProperties(t, e, ctx)) {
                e.unknown()
            }
        }
        t.setNumber(number)
        t.setBaseLen(baseLen)
        t.setRatio(new Fraction(ratioN, ratioD))
        const f = t.baseLen().fraction().times(t.ratio().denominator())
        t.setTicks(f.reduced())
    }

    static readBeam(b: Beam, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'StemDirection') {
                TRead.readProperty(b, e, ctx, Pid.STEM_DIRECTION)
            } else if (TRead.readStyledProperty(b, tag, e, ctx)) {
            } else if (tag === 'growLeft') {
                b.setGrowLeft(e.readDouble())
            } else if (tag === 'growRight') {
                b.setGrowRight(e.readDouble())
            } else if (tag === 'Fragment') {
                const f = { py1: [0, 0] as [number, number], py2: [0, 0] as [number, number] }
                const idx = b.directionIdx()
                b.setUserModified(true)
                const sp = b.spatium()
                while (e.readNextStartElement()) {
                    const tag1 = e.name()
                    if (tag1 === 'y1') {
                        f.py1[idx] = e.readDouble() * sp
                    } else if (tag1 === 'y2') {
                        f.py2[idx] = e.readDouble() * sp
                    } else {
                        e.unknown()
                    }
                }
                b.addBeamFragment(f)
            } else if (tag === 'l1' || tag === 'l2') { // ignore
                e.skipCurrentElement()
            } else if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.BEAM_CROSS_STAFF_MOVE)) {
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    // ---------------------------------------------------------
    //   spanners
    // ---------------------------------------------------------

    static readSlur(s: Slur, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (TRead.readPropertyIfTag(s, e.name(), e, ctx, Pid.PARTIAL_SPANNER_DIRECTION)) {
                continue
            }
            if (!TRead.readSlurTieProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readLaissezVib(lv: LaissezVib, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (TRead.readPropertyIfTag(lv, tag, xml, ctx, Pid.TIE_PLACEMENT)) {
            } else if (TRead.readPropertyIfTag(lv, tag, xml, ctx, Pid.MIN_LENGTH)) {
            } else if (!TRead.readSlurTieProperties(lv, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readTie(t: Tie, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (TRead.readPropertyIfTag(t, xml.name(), xml, ctx, Pid.TIE_PLACEMENT)) {
                continue
            }
            if (!TRead.readSlurTieProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readSlurTieProperties(s: SlurTie, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.SLUR_DIRECTION)) {
        } else if (tag === 'lineType') {
            s.setStyleType(e.readInt() as SlurStyleType)
        } else if (tag === 'SlurSegment' || tag === 'TieSegment' || tag === 'LaissezVibSegment' || tag === 'PartialTieSegment'
                   || tag === 'HammerOnPullOffSegment' || tag === 'TappingHalfSlurSegment') {
            const idx = e.intAttribute('no', 0)
            const n = s.spannerSegments().length
            for (let i = n; i < idx; ++i) {
                s.add(s.newSlurTieSegment(scoreDummy(s.score()).system()))
            }
            const sts = s.newSlurTieSegment(scoreDummy(s.score()).system())
            TRead.readSlurTieSegment(sts, e, ctx)
            s.add(sts)
        } else if (!TRead.readSpannerProperties(s, e, ctx)) {
            return false
        }
        return true
    }

    static readSlurTieSegment(s: SlurTieSegment, e: XmlReader, ctx: ReadContext): void {
        const sp = s.style().spatium()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'o1') {
                s.ups(Grip.START).off = e.readPoint().times(sp)
            } else if (tag === 'o2') {
                s.ups(Grip.BEZIER1).off = e.readPoint().times(sp)
            } else if (tag === 'o3') {
                s.ups(Grip.BEZIER2).off = e.readPoint().times(sp)
            } else if (tag === 'o4') {
                s.ups(Grip.END).off = e.readPoint().times(sp)
            } else if (tag === 'HammerOnPullOffText') {
                e.skipCurrentElement() // TODO(port): hammer-on / pull-off
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readSpannerProperties(s: Spanner, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (ctx.pasteMode() && tag === 'ticks_f') {
            s.setTicks(e.readFraction())
            return true
        } else if (tag === 'play') {
            s.setPlaySpanner(e.readBool())
            return true
        } else if (!TRead.readItemProperties(s, e, ctx)) {
            return false
        }
        return true
    }

    static readSpanner(e: XmlReader, ctx: ReadContext, current: EngravingItem | Score, track: track_idx_t): void {
        const info = new ConnectorInfoReader(e, ctx, current, track)
        ConnectorInfoReader.readConnector(info, e, ctx)
    }

    static readLocation(l: Location, e: XmlReader, _ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'staves') {
                l.setStaff(e.readInt())
            } else if (tag === 'voices') {
                l.setVoice(e.readInt())
            } else if (tag === 'measures') {
                l.setMeasure(e.readInt())
            } else if (tag === 'fractions') {
                l.setFrac(e.readFraction())
            } else if (tag === 'grace') {
                l.setGraceIndex(e.readInt())
            } else if (tag === 'notes') {
                l.setNote(e.readInt())
            } else if (tag === 'timeTick') {
                l.setIsTimeTick(e.readBool())
            } else {
                e.unknown()
            }
        }
    }

    static readSegment(s: Segment, e: XmlReader, _ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                e.skipCurrentElement()
            } else if (tag === 'leadingSpace') {
                s.setExtraLeadingSpace(new Spatium(e.readDouble()))
            } else {
                e.unknown()
            }
        }
    }
}

export type { EngravingObject }
