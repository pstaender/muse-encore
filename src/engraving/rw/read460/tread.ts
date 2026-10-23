/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
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
    Align, AlignH, AlignV, ArpeggioType, ArticulationTextType, AutoOnOff, BarLineType, BeamMode, BracketType, ClefType,
    DirectionH, DirectionV, DPMM, DurationType, FontStyle, GlissandoStyle, HookType, Key, KeyMode, LayoutBreakType,
    LineType, LyricsSyllabic, NoteHeadGroup, NoteHeadScheme, NoteHeadType, Orientation, OrnamentStyle, PartialSpannerDirection,
    PlacementH, PlacementV, PreferSharpFlat, SlurStyleType, StaffGroup, TextPlace, TextStyleType, TiePlacement,
    VeloType, VoiceAssignment, AccidentalRole, DynamicType, AutoCustomHide, MarkerType, GlissandoType,
    ElementType, OrnamentInterval, ParenthesesMode, PlayingTechniqueType, TrillType, ChordLineType, GradualTempoChangeType, GuitarBendType, VibratoType, track2staff, type track_idx_t,
    ChangeMethod, DynamicSpeed, SpannerSegmentType, VOICES,
    TremoloType, TremoloStyle, isTremoloTwoChord,
    TappingHand,
} from '../../types/types'
import { Constants } from '../../types/constants'
import { lrint } from '../../../framework/global/realfn'
import { TConv } from '../../types/typesconv'
import { Sid } from '../../style/styledef'
import { Pid, PropertyFlags, propertyName, propertyType } from '../../dom/property'
import { Factory } from '../../dom/factory'
import type { MMRest } from '../../dom/mmrest'
import { TDuration } from '../../dom/durationtype'
import { ClefTypeList } from '../../dom/clefinfo'
import { KeySigEvent, type CustDef, type KeyList } from '../../dom/key'
import { Groups } from '../../dom/groups'
import { StaffName, Instrument, InstrChannel, type MidiArticulation, type NamedEventList } from '../../dom/instrument'
import {
    CTRL_CHORUS_SEND, CTRL_HBANK, CTRL_LBANK, CTRL_PANPOT, CTRL_PROGRAM, CTRL_REVERB_SEND, CTRL_VOLUME, ME_CONTROLLER, MidiCoreEvent,
} from '../../compat/midi/midicoreevent'
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
import type { Box, FBox, HBox, TBox } from '../../dom/box'
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
import { TimeSigType, type TimeSig } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { XmlReader } from '../xmlreader'
import { StaffHideMode, type ReadContext } from './readcontext'
import { ConnectorInfoReader } from './connectorinforeader'
import { scoreDummy } from '../../compat/dummyelement'
import { smDrumset } from '../../dom/drumset'
import { type StaffText, type StaffTextBase } from '../../dom/stafftextbase'
import { type TempoText, TempoTextType } from '../../dom/tempotext'
import type { Expression } from '../../dom/expression'
import type { PlayTechAnnotation } from '../../dom/playtechannotation'
import type { FiguredBass, FiguredBassItem } from '../../dom/figuredbass'
import { Image } from '../../dom/image'
import { ChordBracket } from '../../dom/chordbracket'
import { Tapping, TappingHalfSlur } from '../../dom/tapping'
import { SoundFlag } from '../../dom/soundflag'
import { SystemDivider, SystemDividerType } from '../../dom/systemdivider'
import { Bend } from '../../dom/bend'
import { PitchValue } from '../../types/pitchvalue'
import { NoteEvent } from '../../dom/noteevent'
import { PlayEventType } from '../../dom/chord'
import type { Capo } from '../../dom/capo'
import type { StringTunings } from '../../dom/stringtunings'
import type { HarpPedalDiagram, HarpStringType, PedalPosition } from '../../dom/harppedaldiagram'
import type { Dynamic } from '../../dom/dynamic'
import type { Fermata } from '../../dom/fermata'
import type { Breath } from '../../dom/breath'
import type { BagpipeEmbellishment } from '../../dom/bagpembell'
import { ActionIconType, type ActionIcon } from '../../dom/actionicon'
import { SystemLock } from '../../dom/systemlock'
import { EID } from '../../infrastructure/eid'
import { linkedObjectsMainElement } from '../../dom/linkedobjects'
import { HtmlParser } from '../../infrastructure/htmlparser'
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
import { Read206 } from '../read206/read206'
import type { Marker } from '../../dom/marker'
import type { Jump } from '../../dom/jump'
import { HarmonyInfo, type Harmony } from '../../dom/harmony'
import { HDegree, HDegreeType } from '../../dom/chordlist'
import type { Parenthesis } from '../../dom/parenthesis'
import type { NoteCaseType } from '../../dom/pitchspelling'
import { FretItem, FretMarkerType, type FretDiagram } from '../../dom/fret'
import { Ornament } from '../../dom/ornament'
import type { Trill } from '../../dom/trill'
import { GuitarBendHold, GuitarBendText, type GuitarBend, type GuitarBendSegment } from '../../dom/guitarbend'
import { InstrString, StringData } from '../../dom/stringdata'
import { Transpose } from '../../editing/transpose'
import type { Vibrato } from '../../dom/vibrato'
import type { Glissando } from '../../dom/glissando'
import type { GradualTempoChange } from '../../dom/gradualtempochange'
import { Fingering } from '../../dom/fingering'
import { ChordLine } from '../../dom/chordline'
import type { Ambitus } from '../../dom/ambitus'
import type { InstrumentChange } from '../../dom/instrchange'
import { PainterPath, PainterPathElementType } from '../../../framework/draw/types/painterpath'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { BeamFragment } from '../../dom/beambase'
import type { TremoloCompat } from '../compat/tremolocompat'
import type { StaffTypeChange } from '../../dom/stafftypechange'
import type { LaissezVib } from '../../dom/laissezvib'
import type { PartialTie } from '../../dom/partialtie'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import { NoteParenthesisInfo, updatePercussionNotes } from '../../dom/chord'
import { HammerOnPullOffText, type HammerOnPullOffSegment } from '../../dom/hammeronpulloff'

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

const ACTION_ICON_TYPES: ReadonlyMap<string, ActionIconType> = new Map([
    ['acciaccatura', ActionIconType.ACCIACCATURA],
    ['appoggiatura', ActionIconType.APPOGGIATURA],
    ['grace4', ActionIconType.GRACE4],
    ['grace16', ActionIconType.GRACE16],
    ['grace32', ActionIconType.GRACE32],
    ['grace8after', ActionIconType.GRACE8_AFTER],
    ['grace16after', ActionIconType.GRACE16_AFTER],
    ['grace32after', ActionIconType.GRACE32_AFTER],

    ['beam-auto', ActionIconType.BEAM_AUTO],
    ['beam-none', ActionIconType.BEAM_NONE],
    ['beam-break-left', ActionIconType.BEAM_BREAK_LEFT],
    ['beam-break-inner-8th', ActionIconType.BEAM_BREAK_INNER_8TH],
    ['beam-break-inner-16th', ActionIconType.BEAM_BREAK_INNER_16TH],
    ['beam-join', ActionIconType.BEAM_JOIN],

    ['beam-feathered-decelerate', ActionIconType.BEAM_FEATHERED_DECELERATE],
    ['beam-feathered-accelerate', ActionIconType.BEAM_FEATHERED_ACCELERATE],

    ['add-parentheses', ActionIconType.PARENTHESES],
    ['add-brackets', ActionIconType.BRACKETS],

    ['insert-vbox', ActionIconType.VFRAME],
    ['insert-hbox', ActionIconType.HFRAME],
    ['insert-textframe', ActionIconType.TFRAME],
    ['insert-fretframe', ActionIconType.FFRAME],
    ['insert-staff-type-change', ActionIconType.STAFF_TYPE_CHANGE],
    ['insert-measure', ActionIconType.MEASURE],

    ['standard-bend', ActionIconType.STANDARD_BEND],
    ['pre-bend', ActionIconType.PRE_BEND],
    ['grace-note-bend', ActionIconType.GRACE_NOTE_BEND],
    ['slight-bend', ActionIconType.SLIGHT_BEND],

    ['dive', ActionIconType.DIVE],
    ['pre-dive', ActionIconType.PRE_DIVE],
    ['dip', ActionIconType.DIP],
    ['scoop', ActionIconType.SCOOP],

    ['add-noteline', ActionIconType.NOTE_ANCHORED_LINE],

    ['toggle-system-lock', ActionIconType.SYSTEM_LOCK],
])

function setActionIconTypeFromAction(i: ActionIcon, actionCode: string): void {
    const type = ACTION_ICON_TYPES.get(actionCode)
    if (type !== undefined) {
        i.setActionType(type)
    }
}

export class TRead {
    // ---------------------------------------------------------
    //   readItem
    // ---------------------------------------------------------

    static readItem(item: EngravingItem, xml: XmlReader, ctx: ReadContext): void {
        switch (item.type()) {
        case ElementType.ACCIDENTAL: TRead.readAccidental(item as Accidental, xml, ctx); break
        case ElementType.ACTION_ICON: TRead.readActionIcon(item as ActionIcon, xml, ctx); break
        case ElementType.BAGPIPE_EMBELLISHMENT: TRead.readBagpipeEmbellishment(item as BagpipeEmbellishment, xml, ctx); break
        case ElementType.CHORDLINE: TRead.readChordLine(item as ChordLine, xml, ctx); break
        case ElementType.FINGERING: TRead.readFingering(item as Fingering, xml, ctx); break
        case ElementType.MEASURE_REPEAT: TRead.readMeasureRepeat(item as MeasureRepeat, xml, ctx); break
        case ElementType.NOTEHEAD: TRead.readSymbol(item as Symbol, xml, ctx); break // C++ read(NoteHead*)
        case ElementType.ORNAMENT: TRead.readOrnament(item as Ornament, xml, ctx); break
        case ElementType.STAFFTYPE_CHANGE: TRead.readStaffTypeChange(item as StaffTypeChange, xml, ctx); break
        case ElementType.TREMOLO_SINGLECHORD:
            TRead.readTremoloCompat({ parent: null, single: item as TremoloSingleChord, two: null }, xml, ctx)
            break
        case ElementType.TREMOLO_TWOCHORD:
            TRead.readTremoloCompat({ parent: null, single: null, two: item as TremoloTwoChord }, xml, ctx)
            break
        case ElementType.ARPEGGIO: TRead.readArpeggio(item as Arpeggio, xml, ctx); break
        case ElementType.AMBITUS: TRead.readAmbitus(item as Ambitus, xml, ctx); break
        case ElementType.INSTRUMENT_CHANGE: TRead.readInstrumentChange(item as InstrumentChange, xml, ctx); break
        case ElementType.ARTICULATION: TRead.readArticulation(item as Articulation, xml, ctx); break
        case ElementType.BAR_LINE: TRead.readBarLine(item as BarLine, xml, ctx); break
        case ElementType.BEAM: TRead.readBeam(item as Beam, xml, ctx); break
        case ElementType.HBOX: TRead.readHBox(item as HBox, xml, ctx); break
        case ElementType.VBOX: TRead.readBox(item as Box, xml, ctx); break
        case ElementType.TBOX: TRead.readTBox(item as TBox, xml, ctx); break
        case ElementType.FBOX: TRead.readFBox(item as FBox, xml, ctx); break
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
        case ElementType.MMREST: TRead.readMMRest(item as MMRest, xml, ctx); break
        case ElementType.SLUR:
        case ElementType.HAMMER_ON_PULL_OFF: // C++ read(HammerOnPullOff*) reads the Slur properties
            TRead.readSlur(item as Slur, xml, ctx)
            break
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
        case ElementType.GUITAR_BEND: TRead.readGuitarBend(item as GuitarBend, xml, ctx); break
        case ElementType.LET_RING:
        case ElementType.PALM_MUTE:
            TRead.readChordTextLineBase(item as ChordTextLineBase, xml, ctx)
            break
        case ElementType.LYRICSLINE: TRead.readLyricsLine(item as LyricsLine, xml, ctx); break
        case ElementType.WHAMMY_BAR: TRead.readTextLineBase(item as TextLineBase, xml, ctx); break // C++ read(TextLineBase*)
        case ElementType.VIBRATO: TRead.readVibrato(item as Vibrato, xml, ctx); break
        case ElementType.GLISSANDO: TRead.readGlissando(item as Glissando, xml, ctx); break
        case ElementType.GRADUAL_TEMPO_CHANGE: TRead.readGradualTempoChange(item as GradualTempoChange, xml, ctx); break
        case ElementType.STICKING: TRead.readTextBase(item as TextBase, xml, ctx); break // C++ read(Sticking*)
        case ElementType.PLAYTECH_ANNOTATION: TRead.readPlayTechAnnotation(item as PlayTechAnnotation, xml, ctx); break
        case ElementType.CAPO: TRead.readCapo(item as Capo, xml, ctx); break
        case ElementType.STRING_TUNINGS: TRead.readStringTunings(item as StringTunings, xml, ctx); break
        case ElementType.HARP_DIAGRAM: TRead.readHarpPedalDiagram(item as HarpPedalDiagram, xml, ctx); break
        case ElementType.FIGURED_BASS: TRead.readFiguredBass(item as FiguredBass, xml, ctx); break
        case ElementType.IMAGE: TRead.readImage(item as Image, xml, ctx); break
        case ElementType.CHORD_BRACKET: TRead.readChordBracket(item as ChordBracket, xml, ctx); break
        case ElementType.TAPPING: TRead.readTapping(item as Tapping, xml, ctx); break
        case ElementType.SOUND_FLAG: TRead.readSoundFlag(item as SoundFlag, xml, ctx); break
        case ElementType.SYSTEM_DIVIDER: TRead.readSystemDivider(item as SystemDivider, xml, ctx); break
        case ElementType.BEND: TRead.readBend(item as Bend, xml, ctx); break
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
        case P_TYPE.PARENTHESES_MODE: return TConv.fromXmlParenthesesMode(e.readAsciiText(), ParenthesesMode.NONE)
        case P_TYPE.PLAYTECH_TYPE: return TConv.fromXmlPlayingTechniqueType(e.readAsciiText(), PlayingTechniqueType.Natural)
        case P_TYPE.AUTO_CUSTOM_HIDE: return TConv.fromXmlAutoCustomHide(e.readAsciiText(), AutoCustomHide.AUTO)
        case P_TYPE.MARKER_TYPE: return TConv.fromXmlMarkerType(e.readAsciiText(), MarkerType.USER)
        case P_TYPE.TEMPOCHANGE_TYPE: return TConv.fromXmlTempoChangeType(e.readAsciiText(), GradualTempoChangeType.Undefined)
        case P_TYPE.CHANGE_METHOD: return TConv.fromXmlChangeMethod(e.readAsciiText(), ChangeMethod.NORMAL)
        default:
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
        // read400/read410 (files < 4.6): Pre-4.4 compatibility: these items now use DIRECTION property
        if (ctx.mscVersion() < 460 && pid === Pid.PLACEMENT && item.hasVoiceAssignmentProperties()) {
            pid = Pid.DIRECTION
            v = (v as PlacementV) === PlacementV.ABOVE ? DirectionV.UP : DirectionV.DOWN
        }
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

    static readItemEID(item: EngravingObject, xml: XmlReader, _ctx: ReadContext): void {
        const eid = EID.fromStdString(xml.readAsciiText())
        if (!eid.isValid()) {
            return
        }
        item.setEID(eid.toStdString())
    }

    static readItemLink(item: EngravingItem, xml: XmlReader, ctx: ReadContext): void {
        const s = EID.fromStdString(xml.readAsciiText()).toStdString()
        const mainElement = ctx.score().masterScore().eidRegister().itemFromEID(s)
        if (!mainElement) {
            // C++ logs "Link failed: Main linked element not found"
            return
        }
        if (mainElement.type() !== item.type()) {
            // C++ logs "Link failed: Main element type does not match linked item type"
            return
        }

        item.linkTo(mainElement)
    }

    /** read410 compat: <linked>/<linkedMain> of EngravingItem::readProperties */
    static readItemLink410(item: EngravingItem, tag: string, e: XmlReader, ctx: ReadContext): void {
        let s = item.staff()
        if (!s) {
            s = ctx.score().staff(Math.trunc(ctx.track() / VOICES))
            if (!s) {
                e.skipCurrentElement()
                return
            }
        }
        if (tag === 'linkedMain') {
            const links: EngravingObject[] = [item]
            item.setLinks(links)

            ctx.addLink(s, links, ctx.location(true))

            e.skipCurrentElement()
        } else {
            const sLinks = s.links()
            const ls = sLinks ? linkedObjectsMainElement(sLinks) as Staff : null
            let linkedIsMaster = ls ? ls.score().isMaster() : false
            const loc = ctx.location(true)
            if (ls) {
                loc.setStaff(ls.idx())
            }
            let mainLoc = Location.relative()
            let locationRead = false
            let localIndexDiff = 0
            while (e.readNextStartElement()) {
                const ntag = e.name()

                if (ntag === 'score') {
                    const val = e.readText()
                    if (val === 'same') {
                        linkedIsMaster = item.score().isMaster()
                    }
                } else if (ntag === 'location') {
                    TRead.readLocation(mainLoc, e, ctx)
                    mainLoc.toAbsolute(loc)
                    locationRead = true
                } else if (ntag === 'indexDiff') {
                    localIndexDiff = e.readInt()
                } else {
                    e.unknown()
                }
            }
            if (!locationRead) {
                mainLoc = loc
            }
            const link = ctx.getLink(linkedIsMaster, mainLoc, localIndexDiff)
            if (link) {
                const linked = linkedObjectsMainElement(link)!
                if (linked.type() === item.type()) {
                    item.linkTo(linked)
                }
            }
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
                startMeas = eidRegister.itemFromEID(EID.fromStdString(e.readAsciiText()).toStdString()) as MeasureBase | null
            } else if (tag === 'endMeasure') {
                endMeas = eidRegister.itemFromEID(EID.fromStdString(e.readAsciiText()).toStdString()) as MeasureBase | null
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
            TRead.readItemLink(item, e, ctx)
        } else if ((tag === 'linked' || tag === 'linkedMain') && ctx.mscVersion() < 460) {
            TRead.readItemLink410(item, tag, e, ctx)
        } else if (tag === 'selected' && ctx.mscVersion() < 460) { // read400: obsolete
            e.readInt()
        } else if (tag === 'tick' && ctx.mscVersion() < 460) { // read400: obsolete
            const val = e.readInt()
            if (val >= 0) {
                ctx.setTick(Fraction.fromTicks(ctx.fileDivision(val)))
            }
        } else if (tag === 'pos' && ctx.mscVersion() < 460) { // read400: obsolete
            TRead.readProperty(item, e, ctx, Pid.OFFSET)
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

    static readItemPropertiesOnly(item: EngravingItem, e: XmlReader, ctx: ReadContext): void {
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
                const flag = new SoundFlag(t)
                TRead.readSoundFlag(flag, xml, ctx)
                t.setSoundFlag(flag)
            } else if (!TRead.readStaffTextBaseProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readSoundFlag(item: SoundFlag, xml: XmlReader, _ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()

            if (tag === 'play') {
                item.setPlay(xml.readBool())
            } else if (tag === 'presets') {
                item.setSoundPresets(xml.readText().split(','))
            } else if (tag === 'playingTechnique') {
                item.setPlayingTechnique(xml.readText())
            } else if (tag === 'applyToAllStaves') {
                item.setApplyToAllStaves(xml.readBool())
            } else {
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

    static readFiguredBass(b: FiguredBass, e: XmlReader, ctx: ReadContext): void {
        let normalizedText = ''
        let idx = 0
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'ticks') {
                b.setTicks(e.readFraction())
            } else if (tag === 'onNote') {
                b.setOnNote(e.readInt() !== 0)
            } else if (tag === 'FiguredBassItem') {
                const pItem = b.createItem(idx++)
                pItem.setTrack(b.track())
                pItem.setParent(b)
                TRead.readFiguredBassItem(pItem, e, ctx)
                b.appendItem(pItem)
                // add item normalized text
                if (normalizedText.length) {
                    normalizedText += '\n'
                }
                normalizedText += pItem.normalizedText()
            } else if (!TRead.readTextBaseProperties(b, e, ctx)) {
                e.unknown()
            }
        }
        // if items could be parsed set normalized text
        if (b.items().length > 0) {
            b.setXmlText(normalizedText) // this is the text to show while editing
        }
    }

    static readFiguredBassItem(i: FiguredBassItem, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'brackets') {
                i.setParenth1(e.intAttribute('b0'))
                i.setParenth2(e.intAttribute('b1'))
                i.setParenth3(e.intAttribute('b2'))
                i.setParenth4(e.intAttribute('b3'))
                i.setParenth5(e.intAttribute('b4'))
                e.skipCurrentElement()
            } else if (tag === 'prefix') {
                i.setPrefix(e.readInt())
            } else if (tag === 'digit') {
                i.setDigit(e.readInt())
            } else if (tag === 'suffix') {
                i.setSuffix(e.readInt())
            } else if (tag === 'continuationLine') {
                i.setContLine(e.readInt())
            } else if (!TRead.readItemProperties(i, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readPlayTechAnnotation(a: PlayTechAnnotation, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()

            if (TRead.readPropertyIfTag(a, tag, xml, ctx, Pid.PLAY_TECH_TYPE)) {
            } else if (TRead.readPropertyIfTag(a, tag, xml, ctx, Pid.PLAY)) {
            } else if (!TRead.readStaffTextBaseProperties(a, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readCapo(c: Capo, xml: XmlReader, ctx: ReadContext): void {
        const params = c.params().clone()

        while (xml.readNextStartElement()) {
            const tag = xml.name()

            if (tag === 'active') {
                params.active = xml.readBool()
            } else if (tag === 'fretPosition') {
                params.fretPosition = xml.readInt()
            } else if (tag === 'string') {
                const idx = xml.intAttribute('no')

                while (xml.readNextStartElement()) {
                    const stringTag = xml.name()

                    if (stringTag === 'apply') {
                        const apply = xml.readBool()
                        if (!apply) {
                            params.ignoredStrings.add(idx)
                        }
                    } else {
                        xml.unknown()
                    }
                }
            } else if (tag === 'generateText') {
                c.setProperty(Pid.CAPO_GENERATE_TEXT, xml.readBool())
            } else if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.CAPO_TRANSPOSE_MODE)) {
                continue
            } else if (!TRead.readStaffTextBaseProperties(c, xml, ctx)) {
                xml.unknown()
            }
        }
        params.transposeMode = c.params().transposeMode

        c.setParams(params)
    }

    static readStringTunings(s: StringTunings, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()

            if (tag === 'preset') {
                s.setPreset(xml.readText())
            } else if (tag === 'StringData') {
                const sd = new StringData()
                TRead.readStringData(sd, xml)
                s.setStringData(sd)
            } else if (tag === 'visibleStrings') {
                s.setVisibleStrings(parseIntVec(xml.readText()))
            } else if (!TRead.readStaffTextBaseProperties(s, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readHarpPedalDiagram(h: HarpPedalDiagram, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'isDiagram') {
                h.setIsDiagram(xml.readBool())
            } else if (tag === 'pedalState') {
                while (xml.readNextStartElement()) {
                    const stringTag = xml.name()
                    if (stringTag === 'string') {
                        const str = xml.intAttribute('name') as HarpStringType
                        const pos = xml.readInt() as PedalPosition
                        h.setPedal(str, pos)
                    } else {
                        xml.unknown()
                    }
                }
                h.setPlayableTpcs()
            } else if (!TRead.readTextBaseProperties(h, xml, ctx)) {
                xml.unknown()
            }
        }
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
            } else if (tag === 'size' && d.score().mscVersion() < 400) { // read400::TRead::read(Dynamic*)
                e.skipCurrentElement()
            } else if (ctx.mscVersion() < 470 && tag === 'dynamicsSize') {
                TRead.readProperty(d, e, ctx, Pid.MUSICAL_SYMBOLS_SCALE)
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.AVOID_BARLINES)) {
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.CENTER_ON_NOTEHEAD)) {
            } else if (TRead.readPropertyIfTag(d, tag, e, ctx, Pid.ANCHOR_TO_END_OF_PREVIOUS)) {
            } else if (!TRead.readTextBaseProperties(d, e, ctx)) {
                e.unknown()
            }
        }
        if (d.score().mscVersion() < 400) {
            d.setSize(10.0)
            if (d.xmlText().includes('<sym>') && !d.xmlText().includes('<font')) {
                d.setAlign(new Align(AlignH.HCENTER, AlignV.BASELINE))
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
            if (!TRead.readFermataProperties(f, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readFermataProperties(f: Fermata, xml: XmlReader, ctx: ReadContext): boolean {
        const tag = xml.name()
        if (tag === 'subtype') {
            f.setSymIdAndTimeStretch(SymNames.symIdByName(xml.readAsciiText()))
        } else if (tag === 'play') {
            f.setPlay(xml.readInt() !== 0)
        } else if (tag === 'timeStretch') {
            f.setTimeStretch(xml.readDouble())
        } else if (!TRead.readItemProperties(f, xml, ctx)) {
            return false
        }
        return true
    }

    static readActionIcon(i: ActionIcon, e: XmlReader, _ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                // This is fragile, see https://github.com/musescore/MuseScore/issues/24060#issuecomment-2299665318.
                // Keeping it here for compatbility in case an ActionIcon from some old version doesn't have an <action> tag.
                // If the <action> tag is present, it will override this value, see below.
                i.setActionType(e.readInt() as ActionIconType)
            } else if (tag === 'action') {
                const actionCode = e.readText()
                i.setAction(actionCode, 0)
                setActionIconTypeFromAction(i, actionCode)
            } else {
                e.unknown()
            }
        }
    }

    static readBagpipeEmbellishment(b: BagpipeEmbellishment, e: XmlReader, _ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                b.setEmbelType(TConv.fromXmlEmbellishmentType(e.readAsciiText(), 0))
            } else {
                e.unknown()
            }
        }
    }

    static readBreath(b: Breath, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype' && ctx.mscVersion() < 460) { // obsolete (read400/read410)
                let symId = SymId.noSym
                switch (e.readInt()) {
                case 0:
                case 1:
                    symId = SymId.breathMarkComma
                    break
                case 2:
                    symId = SymId.caesuraCurved
                    break
                case 3:
                    symId = SymId.caesura
                    break
                }
                b.setSymId(symId)
            } else if (tag === 'symbol') {
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

    static readNoteParenGroup(ch: Chord, e: XmlReader, ctx: ReadContext): void {
        const staff = ctx.staff(ch.staffIdx())
        const staffGroup = staff ? staff.staffTypeForElement(ch).group() : StaffGroup.STANDARD
        if (staffGroup === StaffGroup.PERCUSSION) {
            // We should have read all notes by now. They need to be sorted for percussion staves
            const instrument = ch.part()!.instrument(ch.tick())
            updatePercussionNotes(ch, instrument.drumset())
            ch.sortNotes()
        }

        let leftParen: Parenthesis | null = null
        let rightParen: Parenthesis | null = null
        const notes: Note[] = []
        while (e.readNextStartElement()) {
            const t = e.name()

            if (t === 'Parenthesis') {
                const paren = Factory.createItem(ElementType.PARENTHESIS, ch) as Parenthesis
                TRead.readParenthesis(paren, e, ctx)
                paren.setParent(ch)
                paren.setTrack(ctx.track())

                if (paren.direction() === DirectionH.LEFT) {
                    leftParen = paren
                } else {
                    rightParen = paren
                }
            } else if (t === 'Notes') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'NoteIdx') {
                        const idx = e.readInt()
                        if (idx >= ch.notes().length) {
                            continue
                        }
                        notes.push(ch.notes()[idx])
                    } else {
                        e.unknown()
                    }
                }
            } else {
                e.unknown()
            }
        }

        if (!notes.length) {
            return
        }

        for (const existing of ch.noteParentheses()) {
            for (const note of notes) {
                if (existing.notes().includes(note)) {
                    return
                }
            }
        }

        if (!leftParen) {
            leftParen = Factory.createItem(ElementType.PARENTHESIS, ch) as Parenthesis
            leftParen.setParent(ch)
            leftParen.setTrack(ctx.track())
        }

        if (!rightParen) {
            rightParen = Factory.createItem(ElementType.PARENTHESIS, ch) as Parenthesis
            rightParen.setDirection(DirectionH.RIGHT)
            rightParen.setParent(ch)
            rightParen.setTrack(ctx.track())
        }

        const links = ch.links()
        if (links && linkedObjectsMainElement(links) !== ch) {
            const mainChord = linkedObjectsMainElement(links) as unknown as Chord
            const firstNote = notes[0]
            const mainNote = firstNote ? firstNote.findLinkedInStaff(mainChord.staff()!) as Note | null : null
            const mainNoteParenInfo = mainChord && mainNote ? mainChord.findNoteParenthesisInfo(mainNote) : null
            const mainLeftParen = mainNoteParenInfo ? mainNoteParenInfo.leftParen() : null
            const mainRightParen = mainNoteParenInfo ? mainNoteParenInfo.rightParen() : null

            if (mainLeftParen && mainRightParen) {
                leftParen.linkTo(mainLeftParen)
                rightParen.linkTo(mainRightParen)
            }
        }

        ch.addNoteParenthesisInfo(new NoteParenthesisInfo(leftParen, rightParen, notes))
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

    static readGuitarBend(g: GuitarBend, e: XmlReader, ctx: ReadContext): void {
        g.eraseSpannerSegments()

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'guitarBendType') {
                g.setBendType(e.readInt() as GuitarBendType)
            } else if (tag === 'GuitarBendHold') {
                const hold = new GuitarBendHold(g)
                TRead.readGuitarBendHold(hold, e, ctx)
                hold.setParent(g)
                g.setHoldLine(hold)
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.DIRECTION)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.BEND_SHOW_HOLD_LINE)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.BEND_START_TIME_FACTOR)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.BEND_TARGET_TIME_FACTOR)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.BEND_END_TIME_FACTOR)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.GUITAR_DIVE_TAB_POS)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.GUITAR_BEND_AMOUNT)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.VIBRATO_LINE_TYPE)) {
            } else if (TRead.readPropertyIfTag(g, tag, e, ctx, Pid.GUITAR_DIVE_IS_SLACK)) {
            } else if (TRead.readStyledProperty(g, tag, e, ctx)) {
            } else if (!TRead.readSLineProperties(g, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readGuitarBendHold(h: GuitarBendHold, e: XmlReader, ctx: ReadContext): void {
        h.eraseSpannerSegments()

        while (e.readNextStartElement()) {
            if (!TRead.readSLineProperties(h, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readChordLine(l: ChordLine, e: XmlReader, ctx: ReadContext): void {
        //! NOTE Need separated "given" data and layout data
        const ldata = l.mutldata()
        ldata.path = new PainterPath()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Path') {
                const path = new PainterPath()
                let curveTo = new PointF()
                let p1 = new PointF()
                let state = 0
                while (e.readNextStartElement()) {
                    const nextTag = e.name()
                    if (nextTag === 'Element') {
                        const type = e.intAttribute('type')
                        let x = e.doubleAttribute('x')
                        let y = e.doubleAttribute('y')
                        const spatium = ctx.spatium()
                        x *= spatium
                        y *= spatium
                        switch (type as PainterPathElementType) {
                        case PainterPathElementType.MoveToElement:
                            path.moveTo(x, y)
                            break
                        case PainterPathElementType.LineToElement:
                            path.lineTo(x, y)
                            break
                        case PainterPathElementType.CurveToElement:
                            curveTo = new PointF(x, y)
                            state = 1
                            break
                        case PainterPathElementType.CurveToDataElement:
                            if (state === 1) {
                                p1 = new PointF(x, y)
                                state = 2
                            } else if (state === 2) {
                                path.cubicTo(curveTo, p1, new PointF(x, y))
                                state = 0
                            }
                            break
                        }
                        e.skipCurrentElement() // needed to go to next EngravingItem in Path
                    } else {
                        e.unknown()
                    }
                }
                ldata.path = path
                l.setModified(true)
            } else if (tag === 'subtype') {
                l.setChordLineType(e.readInt() as ChordLineType)
            } else if (tag === 'straight') {
                l.setStraight(!!e.readInt())
            } else if (tag === 'wavy') {
                l.setWavy(!!e.readInt())
            } else if (tag === 'lengthX') {
                l.setLengthX(e.readInt())
            } else if (tag === 'lengthY') {
                l.setLengthY(e.readInt())
            } else if (tag === 'play') {
                l.setPlayChordLine(e.readBool())
            } else if (tag === 'offset' && l.score().mscVersion() < 400) { // default positions has changed in 4.0 so ignore previous offset
                e.skipCurrentElement()
            } else if (!TRead.readItemProperties(l, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readFingering(f: Fingering, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readTextBaseProperties(f, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readGradualTempoChange(c: GradualTempoChange, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()

            if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.LINE_WIDTH)) {
                c.setPropertyFlags(Pid.LINE_WIDTH, PropertyFlags.UNSTYLED)
                continue
            }
            if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.TEMPO_CHANGE_TYPE)) {
                continue
            }
            if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.TEMPO_EASING_METHOD)) {
                continue
            }
            if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.TEMPO_CHANGE_FACTOR)) {
                continue
            }
            if (TRead.readPropertyIfTag(c, tag, xml, ctx, Pid.SNAP_AFTER)) {
                continue
            }
            if (!TRead.readTextLineBaseProperties(c, xml, ctx)) {
                xml.unknown()
            }
        }
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(c)
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(c)
        }
    }

    static readGlissando(g: Glissando, e: XmlReader, ctx: ReadContext): void {
        g.eraseSpannerSegments()

        if (ctx.mscVersion() < 301) { // read400
            ctx.addSpanner(e.intAttribute('id', -1), g)
        }

        const staffIdx = track2staff(ctx.track())
        const staff = ctx.score().staff(staffIdx)
        if (staff) {
            const instrId = staff.part()!.instrumentId(g.tick())
            g.setIsHarpGliss(instrId === 'harp')
        }
        g.resetProperty(Pid.GLISS_STYLE)
        const read400 = ctx.mscVersion() < 410
        if (read400) {
            g.setShowText(false)
        }
        let textRead = false

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'text') {
                if (read400) {
                    g.setShowText(true)
                }
                textRead = true
                TRead.readProperty(g, e, ctx, Pid.GLISS_TEXT)
            } else if (read400 && tag === 'subtype') {
                g.setGlissandoType(TConv.fromXmlGlissandoType(e.readAsciiText(), GlissandoType.STRAIGHT))
            } else if (read400 && tag === 'glissandoStyle') {
                TRead.readProperty(g, e, ctx, Pid.GLISS_STYLE)
            } else if (tag === 'isHarpGliss' && ctx.pasteMode()) {
                g.setIsHarpGliss(e.readBool())
                g.resetProperty(Pid.GLISS_STYLE)
            } else if (tag === 'easeInSpin') {
                g.setEaseIn(e.readInt())
            } else if (tag === 'easeOutSpin') {
                g.setEaseOut(e.readInt())
            } else if (tag === 'glissandoShift') {
                g.setGlissandoShift(e.readBool())
            } else if (TRead.readStyledProperty(g, tag, e, ctx)) {
            } else if (!TRead.readSLineProperties(g, e, ctx)) {
                e.unknown()
            }
        }
        // read410: glissandos of 4.1 - 4.4 files without a text show no text
        if (!read400 && ctx.mscVersion() < 450 && !textRead) {
            g.setShowText(false)
        }
    }

    static readVibrato(v: Vibrato, e: XmlReader, ctx: ReadContext): void {
        v.eraseSpannerSegments()

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                v.setVibratoType(TConv.fromXmlVibratoType(e.readAsciiText(), VibratoType.GUITAR_VIBRATO))
            } else if (!TRead.readSLineProperties(v, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readStringData(item: StringData, e: XmlReader): void {
        item.stringList().length = 0
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'frets') {
                item.setFrets(e.readInt())
            } else if (tag === 'string') {
                const strg = new InstrString()
                strg.open = !!e.intAttribute('open', 0)
                strg.useFlat = !!e.intAttribute('useFlat', 0)
                strg.pitch = e.readInt()
                item.stringList().push(strg)
            } else {
                e.unknown()
            }
        }
        if (item.isFiveStringBanjo()) {
            item.configBanjo5thString()
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
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(h)
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
        if (ctx.mscVersion() < 301) { // read400
            ctx.addSpanner(e.intAttribute('id', -1), b)
        }
        while (e.readNextStartElement()) {
            if (!TRead.readTextLineBaseProperties(b, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(b)
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
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(v)
        }
        if (ctx.mscVersion() < 470) {
            CompatUtils.setTextLineTextPositionFromAlign(v)
        }
    }

    static readOttava(o: Ottava, e: XmlReader, ctx: ReadContext): void {
        o.eraseSpannerSegments()
        if (ctx.mscVersion() < 301) { // read400
            ctx.addSpanner(e.intAttribute('id', -1), o)
        }
        while (e.readNextStartElement()) {
            TRead.readOttavaProperties(o, e, ctx)
        }
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(o)
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
        if (ctx.mscVersion() < 301) { // read400
            ctx.addSpanner(e.intAttribute('id', -1), p)
        }
        let beginTextTag = false
        let continueTextTag = false
        let endTextTag = false
        while (e.readNextStartElement()) {
            const tag = e.name()
            beginTextTag ||= tag === 'beginText'
            continueTextTag ||= tag === 'continueText'
            endTextTag ||= tag === 'endText'
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
        if (ctx.mscVersion() < 420 && !ctx.pasteMode()) {
            // read400/read410: Set to the pre-420 defaults if no value was specified;
            // or follow the new style setting if the specified value matches it
            if (!beginTextTag) {
                p.setBeginText('')
                p.setPropertyFlags(Pid.BEGIN_TEXT, PropertyFlags.UNSTYLED)
            } else if (p.beginText() === p.propertyDefault(Pid.BEGIN_TEXT)) {
                p.setPropertyFlags(Pid.BEGIN_TEXT, PropertyFlags.STYLED)
            }
            if (!continueTextTag) {
                p.setContinueText('')
                p.setPropertyFlags(Pid.CONTINUE_TEXT, PropertyFlags.UNSTYLED)
            } else if (p.continueText() === p.propertyDefault(Pid.CONTINUE_TEXT)) {
                p.setPropertyFlags(Pid.CONTINUE_TEXT, PropertyFlags.STYLED)
            }
            if (!endTextTag) {
                p.setEndText('')
                p.setPropertyFlags(Pid.END_TEXT, PropertyFlags.UNSTYLED)
            } else if (p.endText() === p.propertyDefault(Pid.END_TEXT)) {
                p.setPropertyFlags(Pid.END_TEXT, PropertyFlags.STYLED)
            }
        }
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(p)
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
        if (ctx.mscVersion() < 301) { // read400
            ctx.addSpanner(e.intAttribute('id', -1), r)
        }
        while (e.readNextStartElement()) {
            if (TRead.readPropertyIfTag(r, e.name(), e, ctx, Pid.LINE_WIDTH)) {
                r.setPropertyFlags(Pid.LINE_WIDTH, PropertyFlags.UNSTYLED)
            } else if (!TRead.readTextLineBaseProperties(r, e, ctx)) {
                e.unknown()
            }
        }
        if (ctx.mscVersion() < 460) {
            CompatUtils.resetHookHeightSign(r)
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
            } else if (l.isGuitarBendSegment() && TRead.readGuitarBendSegmentProperties(l as GuitarBendSegment, tag, e, ctx)) {
            } else if (!TRead.readItemProperties(l, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readGuitarBendSegmentProperties(g: GuitarBendSegment, tag: string, xml: XmlReader, ctx: ReadContext): boolean {
        if (tag === 'bendVertexOffset') {
            g.setVertexPointOff(xml.readPoint().times(g.style().spatium()))
        } else if (tag === 'GuitarBendText') {
            const bendText = new GuitarBendText(g)
            bendText.setParent(g)
            TRead.readTextBase(bendText, xml, ctx)
            g.setBendText(bendText)
        } else {
            return false
        }

        return true
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
        let name = TRead.lineBreakFromTag(xml.readXml())
        if (name.startsWith('<html>')) {
            // compatibility to old html implementation:
            name = HtmlParser.parse(name)
        }
        item.setName(name)
    }

    static readInstrument(item: Instrument, e: XmlReader, ctx: ReadContext, part: Part): void {
        const customDrumset = { value: false }
        let readSingleNoteDynamics = false
        item.clearChannels() // remove default channel
        item.setId(e.attribute('id'))
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'singleNoteDynamics') {
                item.setSingleNoteDynamics(e.readBool())
                readSingleNoteDynamics = true
            } else if (!TRead.readInstrumentProperties(item, e, ctx, part, customDrumset)) {
                e.unknown()
            }
        }
        item.updateInstrumentId()

        if (!item.channels().length) { // for backward compatibility
            const fallbackChannel = new InstrChannel()
            fallbackChannel.setName(InstrChannel.DEFAULT_NAME)
            fallbackChannel.setProgram(item.recognizeMidiProgram())
            item.appendChannel(fallbackChannel)
        } else if (item.channel(0)!.program() === -1) {
            item.channel(0)!.setProgram(item.recognizeMidiProgram())
        }

        if (!readSingleNoteDynamics) {
            item.setSingleNoteDynamicsFromTemplate()
        }
    }

    static readInstrumentProperties(item: Instrument, e: XmlReader, _ctx: ReadContext, part: Part | null,
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
        } else if (tag === 'StringData') {
            TRead.readStringData(item.stringData(), e)
        } else if (tag === 'Channel' || tag === 'channel') {
            const a = new InstrChannel()
            TRead.readInstrChannel(a, e, part)
            item.appendChannel(a)
        } else if (tag === 'Tablature') {
            // support tag "Tablature" for a while for compatibility with existent 2.0 scores
            TRead.readStringData(item.stringData(), e)
        } else if (tag === 'MidiAction') {
            item.addMidiAction(TRead.readNamedEventList(e))
        } else if (tag === 'Articulation') {
            item.addMidiArticulation(TRead.readMidiArticulation(e))
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
            item.setGlissandoStyle(TConv.fromXmlGlissandoStyle(e.readAsciiText(), GlissandoStyle.CHROMATIC))
        } else {
            return false
        }
        return true
    }

    static readMidiArticulation(e: XmlReader): MidiArticulation {
        const item: MidiArticulation = { name: e.attribute('name'), descr: '', velocity: 0, gateTime: 0 }
        const readPercent = (): number => {
            let text = e.readText()
            if (text.endsWith('%')) {
                text = text.slice(0, -1)
            }
            return parseInt(text, 10) || 0
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'velocity') {
                item.velocity = readPercent()
            } else if (tag === 'gateTime') {
                item.gateTime = readPercent()
            } else if (tag === 'descr') {
                item.descr = e.readText()
            } else {
                e.unknown()
            }
        }
        return item
    }

    static readNamedEventList(e: XmlReader): NamedEventList {
        const item: NamedEventList = { name: e.attribute('name'), descr: '', events: [] }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'program') {
                item.events.push(new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_PROGRAM, e.intAttribute('value', 0)))
                e.skipCurrentElement()
            } else if (tag === 'controller') {
                const ev = new MidiCoreEvent()
                ev.setType(ME_CONTROLLER)
                ev.setDataA(e.intAttribute('ctrl', 0))
                ev.setDataB(e.intAttribute('value', 0))
                item.events.push(ev)
                e.skipCurrentElement()
            } else if (tag === 'descr') {
                item.descr = e.readText()
            } else {
                e.unknown()
            }
        }
        return item
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

        if (ctx.mscVersion() < 460) {
            TRead.readPartHideModes(p, ctx.staffHideModes(), ctx.style().styleB(Sid.hideEmptyStaves))
        }
    }

    /** read400 TRead::read(Part*, StaffHideModes&, bool globalHideEmptyStaves) */
    static readPartHideModes(p: Part, staffHideModes: Map<Staff, StaffHideMode>, globalHideEmptyStaves: boolean): void {
        if (p.nstaves() === 0) {
            return
        }
        const modeOf = (staff: Staff): StaffHideMode => staffHideModes.get(staff) ?? StaffHideMode.AUTO

        if (p.nstaves() === 1) {
            switch (modeOf(p.staves()[0])) {
            case StaffHideMode.AUTO:
                break
            case StaffHideMode.ALWAYS:
                p.setHideWhenEmpty(AutoOnOff.ON)
                break
            case StaffHideMode.NEVER:
                p.setHideWhenEmpty(AutoOnOff.OFF)
                break
            case StaffHideMode.INSTRUMENT:
                break
            }
            return
        }

        let hasAuto = false
        let allAlways = true
        let allNever = true
        let hasInstrument = false

        for (const staff of p.staves()) {
            const mode = modeOf(staff)

            hasAuto ||= mode === StaffHideMode.AUTO
            allAlways &&= mode === StaffHideMode.ALWAYS
            allNever &&= mode === StaffHideMode.NEVER
            hasInstrument ||= mode === StaffHideMode.INSTRUMENT
        }

        if (allAlways) {
            p.setHideWhenEmpty(AutoOnOff.ON)
            p.setHideStavesWhenIndividuallyEmpty(true)
            return
        } else if (allNever) {
            p.setHideWhenEmpty(AutoOnOff.OFF)
            return
        }

        if (globalHideEmptyStaves && hasAuto && !hasInstrument) {
            p.setHideStavesWhenIndividuallyEmpty(true)
        }

        for (const staff of p.staves()) {
            switch (modeOf(staff)) {
            case StaffHideMode.AUTO:
                // A mix of AUTO and INSTRUMENT staves can't be represented in the new system (see C++)
                break
            case StaffHideMode.ALWAYS:
                staff.setHideWhenEmpty(AutoOnOff.ON)
                break
            case StaffHideMode.NEVER:
                staff.setHideWhenEmpty(AutoOnOff.OFF)
                break
            case StaffHideMode.INSTRUMENT:
                break
            }
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
            if (ctx.mscVersion() < 460) {
                // read400/read410: the old staff hide mode is converted in readPartHideModes()
                ctx.staffHideModes().set(s, e.readInt() as StaffHideMode)
            } else {
                s.setHideWhenEmpty(TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO))
            }
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
        } else if (tag === 'eid') {
            TRead.readItemEID(s, e, ctx)
        } else if (tag === 'linkedTo') {
            if (ctx.mscVersion() < 460) {
                // read410: <linkedTo> is the staff number
                const st = s.score().masterScore().staff(e.readInt() - 1)
                if (st && st !== s && !s.isLinked(st)) {
                    s.linkTo(st)
                }
            } else {
                TRead.readItemLink(s, e, ctx)
            }
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
            if (tag === 'CustDef' || tag === 'KeySym') { // KeySym: read400
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
            } else if (tag === 'accidental') { // read400 compat: we need to guess proper concert key
                const key = e.readInt() as Key
                let cKey = key
                if (p && !s.concertPitch()) {
                    const v = p.instrument(s.tick()).transpose()
                    if (!v.isZero()) {
                        cKey = Transpose.transposeKey(key, v)
                    }
                }
                sig.setConcertKey(cKey)
                sig.setKey(key)
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

        // read400::TRead::read(TimeSig*)
        // HACK: handle time signatures from scores before 3.5 differently on some special occasions.
        // See https://musescore.org/node/308139.
        const version = ctx.mscoreVersion()
        if (ctx.mscVersion() < 410 && version && version >= '3.0' && version < '3.5') {
            if (timeSigType === TimeSigType.NORMAL && numeratorString && !denominatorString) {
                if (numeratorString === String(sig.numerator())) {
                    numeratorString = ''
                } else {
                    denominatorString = String(sig.denominator())
                }
            }
        }
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
                const image = new Image(b)
                image.setTrack(b.track())
                TRead.readImage(image, e, ctx)
                b.add(image)
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
        if (b.score().mscVersion() < 302) {
            b.setAutoSizeEnabled(false) // read400: disable auto-size for older scores by default.
        }
    }

    static readHBox(b: HBox, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readHBoxProperties(b, e, ctx)) {
                e.unknown()
            }
        }
        if (b.score().mscVersion() < 302) {
            b.setAutoSizeEnabled(false) // read400: disable auto-size for older scores by default.
        }
    }

    static readHBoxProperties(b: HBox, e: XmlReader, ctx: ReadContext): boolean {
        if (TRead.readPropertyIfTag(b, e.name(), e, ctx, Pid.CREATE_SYSTEM_HEADER)) {
            return true
        }
        return TRead.readBoxProperties(b, e, ctx)
    }

    static readFBox(b: FBox, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_TEXT_SCALE)) {
            } else if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_DIAGRAM_SCALE)) {
            } else if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_COLUMN_GAP)) {
            } else if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_ROW_GAP)) {
            } else if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_CHORDS_PER_ROW)) {
            } else if (TRead.readPropertyIfTag(b, tag, xml, ctx, Pid.FRET_FRAME_H_ALIGN)) {
            } else if (TRead.readBoxProperties(b, xml, ctx)) {
            } else {
                xml.unknown()
            }
        }
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
        } else if (tag === 'Image') {
            const image = new Image(b)
            image.setTrack(ctx.track())
            TRead.readImage(image, e, ctx)
            b.add(image)
        } else if (tag === 'FretDiagram') {
            const f = Factory.createItem(ElementType.FRET_DIAGRAM, scoreDummy(b.score()).segment()) as FretDiagram
            TRead.readFretDiagram(f, e, ctx)
            b.add(f)
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
        } else if (tag === 'FSymbol') {
            e.skipCurrentElement() // TODO(port): FSymbol
        } else if (tag === 'Image') {
            const image = new Image(sym)
            TRead.readImage(image, e, ctx)
            sym.add(image)
        } else {
            return false
        }
        return true
    }

    static readImage(img: Image, e: XmlReader, ctx: ReadContext): void {
        // read400 (files < 4.0, the 2.x/3.x readers use this function)
        if (img.score().mscVersion() <= 114) {
            img.setSizeIsSpatium(false)
        }

        let loaded = false

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'autoScale') {
                TRead.readProperty(img, e, ctx, Pid.AUTOSCALE)
            } else if (tag === 'size') {
                TRead.readProperty(img, e, ctx, Pid.SIZE)
            } else if (tag === 'lockAspectRatio') {
                TRead.readProperty(img, e, ctx, Pid.LOCK_ASPECT_RATIO)
            } else if (tag === 'sizeIsSpatium') {
                // setting this using the property Pid::SIZE_IS_SPATIUM breaks, because the
                // property setter attempts to maintain a constant size. If we're reading, we
                // don't want to do that, because the stored size will be in:
                //    mm if size isn't spatium
                //    sp if size is spatium
                img.setSizeIsSpatium(e.readBool())
            } else if (tag === 'path') {
                loaded = img.loadFromStore(e.readText())
            } else if (tag === 'linkPath') {
                // C++: only if configuration()->allowReadingImagesFromOutsideMscz() (false) and not loaded
                void loaded
                e.skipCurrentElement()
            } else if (tag === 'subtype' && img.score().mscVersion() < 400) { // obsolete (read400)
                e.skipCurrentElement()
            } else if (!TRead.readBSymbolProperties(img, e, ctx)) {
                e.unknown()
            }
        }

        CompatUtils.convertPre470ImageSize(img)
    }

    static readBend(b: Bend, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (TRead.readStyledProperty(b, tag, e, ctx)) {
            } else if (tag === 'point') {
                const pv = new PitchValue()
                pv.time = e.intAttribute('time')
                pv.pitch = e.intAttribute('pitch')
                pv.vibrato = e.intAttribute('vibrato') !== 0
                b.addPoint(pv)
                e.skipCurrentElement()
            } else if (tag === 'play') {
                b.setPlayBend(e.readBool())
            } else if (!TRead.readItemProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readNoteEvent(item: NoteEvent, e: XmlReader, _ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'pitch') {
                item.setPitch(e.readInt())
            } else if (tag === 'ontime') {
                item.setOntime(e.readInt())
            } else if (tag === 'len') {
                item.setLen(e.readInt())
            } else {
                e.unknown()
            }
        }
    }

    static readSystemDivider(d: SystemDivider, e: XmlReader, ctx: ReadContext): void {
        const type = e.attribute('type') === 'left' ? SystemDividerType.LEFT : SystemDividerType.RIGHT
        d.setDividerType(type)
        TRead.readSymbol(d, e, ctx)
    }

    static readSystemDividers(score: Score, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (e.name() === 'system') {
                const systemIdx = e.intAttribute('idx')
                while (e.readNextStartElement()) {
                    if (e.name() === 'SystemDivider') {
                        const divider = new SystemDivider(scoreDummy(score).system())
                        TRead.readSystemDivider(divider, e, ctx)
                        score.addSystemDivider(systemIdx, divider)
                    } else {
                        e.unknown()
                    }
                }
            } else {
                e.unknown()
            }
        }
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
            } else if (tag === 'Symbol') {
                const s = Factory.createItem(ElementType.SYMBOL, sym) as Symbol
                TRead.readSymbol(s, e, ctx)
                sym.add(s)
            } else if (tag === 'Image') {
                const image = new Image(sym)
                TRead.readImage(image, e, ctx)
                sym.add(image)
            } else if (tag === 'offset' && sym.score().mscVersion() < 400 && sym.onTabStaff()
                       && (symId === SymId.noteheadParenthesisLeft || symId === SymId.noteheadParenthesisRight)) {
                // Reset mu3 TAB parentheses offset
                e.skipCurrentElement()
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
        // Reset horizontal offset of grace notes when migrating from before 4.0
        if (ch.isGrace() && ch.score().mscVersion() < 400) {
            ch.setOffset(0, ch.offset().y())
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
        } else if (tag === 'NoteParenGroup') {
            TRead.readNoteParenGroup(ch, e, ctx)
        } else if (tag === 'ChordLine') {
            const cl = new ChordLine(ch)
            TRead.readChordLine(cl, e, ctx)
            ch.add(cl)
        } else if (tag === 'ChordBracket') {
            const bracket = new ChordBracket(ch)
            bracket.setTrack(ch.track())
            TRead.readChordBracket(bracket, e, ctx)
            bracket.setParent(ch)
            ch.add(bracket)
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
            let txt = e.readAsciiText()
            if (ctx.mscVersion() < 410) {
                // read400: 400 and previous used begin32/begin64 for beam mode, 410 uses begin16/begin32
                if (txt === 'begin64') {
                    txt = 'begin32'
                } else if (txt === 'begin32') {
                    txt = 'begin16'
                }
            }
            ch.setBeamMode(TConv.fromXmlBeamMode(txt, BeamMode.AUTO))
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
            const tapping = new Tapping(ch)
            tapping.setTrack(ch.track())
            TRead.readTapping(tapping, e, ctx)
            ch.add(tapping)
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

    static readMeasureRepeat(r: MeasureRepeat, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                r.setNumMeasures(e.readInt())
            } else if (!TRead.readRestProperties(r, e, ctx)) {
                e.unknown()
            }
        }
    }

    /** C++ TRead::readProperties(Rest*, ...) */
    private static readRestProperties(r: Rest, e: XmlReader, ctx: ReadContext): boolean {
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
            return false
        }
        return true
    }

    static readMMRest(r: MMRest, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Symbol') {
                const s = Factory.createItem(ElementType.SYMBOL, r) as Symbol
                s.setTrack(r.track())
                TRead.readSymbol(s, e, ctx)
                r.add(s)
            } else if (tag === 'Image') {
                const image = new Image(r)
                image.setTrack(r.track())
                TRead.readImage(image, e, ctx)
                r.add(image)
            } else if (tag === 'NoteDot') {
                const dot = Factory.createItem(ElementType.NOTEDOT, r) as NoteDot
                TRead.readItemPropertiesOnly(dot, e, ctx)
                r.add(dot)
            } else if (tag === 'mmRestNumberPos') {
                // Old property, deprecated in 4.5
                r.setNumberOffset(new Spatium(e.readDouble() - ctx.style().styleS(Sid.mmRestNumberPos).val()))
            } else if (TRead.readPropertyIfTag(r, tag, e, ctx, Pid.MMREST_NUMBER_OFFSET)) {
            } else if (TRead.readStyledProperty(r, tag, e, ctx)) {
            } else if (tag === 'mmRestNumberVisible') { // C++ readProperties(MMRest*)
                r.setProperty(Pid.MMREST_NUMBER_VISIBLE, e.readBool())
            } else if (TRead.readRestProperties(r, e, ctx)) {
            } else {
                e.unknown()
            }
        }
    }

    static readRest(r: Rest, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readRestProperties(r, e, ctx)) {
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
            if (n.score().mscVersion() >= 400) {
                n.setUserVelocity(e.readInt())
            } else {
                e.skipCurrentElement() // pre-4.0 velocity values are not converted (as in C++)
            }
        } else if (tag === 'play') {
            n.setPlay(e.readInt() !== 0)
        } else if (tag === 'tuning') {
            n.setTuning(e.readDouble())
        } else if (tag === 'fret') {
            n.setFret(e.readInt())
        } else if (tag === 'string') {
            n.setString(e.readInt())
        } else if (tag === 'ghost') {
            if (n.score().mscVersion() < 400) {
                n.setDeadNote(e.readInt() !== 0)
            } else {
                n.setGhost(e.readInt() !== 0)
            }
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
            if (ctx.mscVersion() < 460
                && (s.sym() === SymId.noteheadParenthesisLeft || s.sym() === SymId.noteheadParenthesisRight)) {
                // read400/read410: parenthesis symbols are note parentheses
                n.setParenthesesMode(ParenthesesMode.BOTH)
            } else {
                n.add(s)
            }
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
        } else if (tag === 'PartialTie') {
            const pt = Factory.createItem(ElementType.PARTIAL_TIE, n) as PartialTie
            TRead.readPartialTie(pt, e, ctx)
            if (pt.isOutgoing()) {
                pt.setStartNote(n)
            } else {
                pt.setEndNote(n)
            }
            n.add(pt)
        } else if (tag === 'Fingering') {
            const f = new Fingering(n)
            f.setTrack(n.track())
            TRead.readFingering(f, e, ctx)
            n.add(f)
        } else if (tag === 'ChordLine' && n.explicitParent()) {
            const cl = new ChordLine(n.chord())
            TRead.readChordLine(cl, e, ctx)
            cl.setNote(n)
            n.chord().add(cl)
        } else if (tag === 'Image') {
            const image = new Image(n)
            image.setTrack(n.track())
            TRead.readImage(image, e, ctx)
            n.add(image)
        } else if (tag === 'Bend') {
            const b = new Bend(n)
            b.setTrack(n.track())
            TRead.readBend(b, e, ctx)
            n.add(b)
        } else if (tag === 'Events') {
            const playEvents: NoteEvent[] = []
            while (e.readNextStartElement()) {
                const t = e.name()
                if (t === 'Event') {
                    const ne = new NoteEvent()
                    TRead.readNoteEvent(ne, e, ctx)
                    playEvents.push(ne)
                } else {
                    e.unknown()
                }
            }
            n.setPlayEvents(playEvents)
            if (n.explicitParent()) {
                n.chord().setPlayEventType(PlayEventType.User)
            }
        } else if (tag === 'ChordLine') {
            e.skipCurrentElement()
        } else if (tag === 'offset') {
            TRead.readItemProperties(n, e, ctx)
        } else if (tag === 'overrideBendVisibilityRules') {
            n.setOverrideBendVisibilityRules(e.readBool())
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

    /** TRead::read(InstrChannel*): only name, program and bank (no playback data) */
    static readInstrChannel(item: InstrChannel, e: XmlReader, part: Part | null = null): void {
        item.setName(e.attribute('name'))
        if (!item.name()) {
            item.setName(InstrChannel.DEFAULT_NAME)
        }

        let midiPort = -1
        let midiChannel = -1

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'program') {
                item.setProgram(e.intAttribute('value', -1))
                if (item.program() === -1) {
                    item.setProgram(e.readInt())
                } else {
                    e.skipCurrentElement()
                }
            } else if (tag === 'controller') {
                const value = e.intAttribute('value', 0)
                const ctrl = e.intAttribute('ctrl', 0)
                switch (ctrl) {
                case CTRL_HBANK:
                    item.setBank((value << 7) + (item.bank() & 0x7f))
                    item.setUserBankController(true)
                    break
                case CTRL_LBANK:
                    item.setBank((item.bank() & ~0x7f) + (value & 0x7f))
                    item.setUserBankController(true)
                    break
                case CTRL_VOLUME:
                    item.setVolume(value)
                    break
                case CTRL_PANPOT:
                    item.setPan(value)
                    break
                case CTRL_CHORUS_SEND:
                    item.setChorus(value)
                    break
                case CTRL_REVERB_SEND:
                    item.setReverb(value)
                    break
                default:
                    item.addToInit(new MidiCoreEvent(ME_CONTROLLER, 0, ctrl, value))
                    break
                }
                e.skipCurrentElement()
            } else if (tag === 'Articulation') {
                item.articulation.push(TRead.readMidiArticulation(e))
            } else if (tag === 'MidiAction') {
                item.midiActions.push(TRead.readNamedEventList(e))
            } else if (tag === 'synti') {
                item.setSynti(e.readText())
            } else if (tag === 'color') {
                item.setColor(e.readInt())
            } else if (tag === 'mute' || tag === 'solo') {
                // TODO(port): part audio settings compat (ctx.addPartAudioSettingCompat)
                e.skipCurrentElement()
            } else if (tag === 'midiPort') {
                midiPort = e.readInt()
            } else if (tag === 'midiChannel') {
                midiChannel = e.readInt()
            } else {
                e.unknown()
            }
        }
        item.setMustUpdateInit(true)

        if ((midiPort !== -1 || midiChannel !== -1) && part && part.score().isMaster()) {
            part.masterScore().addMidiMapping(item, part, midiPort, midiChannel)
        }
    }

    static readStem(s: Stem, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readStemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readStemProperties(s: Stem, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'userLen' && s.score().mscVersion() < 400) {
            // Ignore stem length pre-4.0
            e.skipCurrentElement()
            s.setUserLength(new Spatium(0))
        } else if (TRead.readPropertyIfTag(s, tag, e, ctx, Pid.USER_LEN)) {
        } else if (TRead.readStyledProperty(s, tag, e, ctx)) {
        } else if (!TRead.readItemProperties(s, e, ctx)) {
            return false
        }
        return true
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

    static readInstrumentChange(c: InstrumentChange, e: XmlReader, ctx: ReadContext): void {
        const inst = new Instrument()
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Instrument') {
                TRead.readInstrument(inst, e, ctx, c.part()!)
            } else if (tag === 'init') {
                c.setInit(e.readBool())
            } else if (!TRead.readTextBaseProperties(c, e, ctx)) {
                e.unknown()
            }
        }

        c.setInstrument(inst)
    }

    static readAmbitus(a: Ambitus, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            if (!TRead.readAmbitusProperties(a, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readAmbitusProperties(a: Ambitus, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'head') {
            TRead.readProperty(a, e, ctx, Pid.HEAD_GROUP)
        } else if (tag === 'headType') {
            TRead.readProperty(a, e, ctx, Pid.HEAD_TYPE)
        } else if (tag === 'mirror') {
            TRead.readProperty(a, e, ctx, Pid.MIRROR_HEAD)
        } else if (tag === 'hasLine') {
            a.setHasLine(e.readInt() !== 0)
        } else if (tag === 'lineWidth') {
            TRead.readProperty(a, e, ctx, Pid.LINE_WIDTH)
        } else if (tag === 'topPitch') {
            a.setTopPitch(e.readInt(), false)
        } else if (tag === 'bottomPitch') {
            a.setBottomPitch(e.readInt(), false)
        } else if (tag === 'topTpc') {
            a.setTopTpc(e.readInt(), false)
        } else if (tag === 'bottomTpc') {
            a.setBottomTpc(e.readInt(), false)
        } else if (tag === 'topAccidental') {
            while (e.readNextStartElement()) {
                if (e.name() === 'Accidental') {
                    TRead.readAccidental(a.topAccidental(), e, ctx)
                } else {
                    e.skipCurrentElement()
                }
            }
        } else if (tag === 'bottomAccidental') {
            while (e.readNextStartElement()) {
                if (e.name() === 'Accidental') {
                    TRead.readAccidental(a.bottomAccidental(), e, ctx)
                } else {
                    e.skipCurrentElement()
                }
            }
        } else if (TRead.readItemProperties(a, e, ctx)) {
        } else {
            return false
        }
        return true
    }

    static readArpeggio(a: Arpeggio, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                a.setArpeggioType(TConv.fromXmlArpeggioType(e.readAsciiText(), ArpeggioType.NORMAL))
            } else if (!TRead.readArpeggioProperties(a, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readArpeggioProperties(a: Arpeggio, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()
        if (tag === 'userLen1') {
            a.setUserLen1(e.readDouble() * a.spatium())
        } else if (tag === 'userLen2') {
            a.setUserLen2(e.readDouble() * a.spatium())
        } else if (tag === 'span') {
            let span = e.readInt()
            if (ctx.mscVersion() < 420) { // read400/read410
                // Span now refers to number of voices spanned, not staves
                span = (span - 1) * VOICES + 1
            }
            a.setSpan(span)
        } else if (tag === 'play') {
            a.setPlayArpeggio(e.readBool())
        } else if (tag === 'timeStretch') {
            a.setStretch(e.readDouble())
        } else if (!TRead.readItemProperties(a, e, ctx)) {
            return false
        }
        return true
    }

    static readChordBracket(b: ChordBracket, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.BRACKET_HOOK_LEN)) {
            } else if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.BRACKET_HOOK_POS)) {
            } else if (TRead.readPropertyIfTag(b, tag, e, ctx, Pid.BRACKET_RIGHT_SIDE)) {
            } else if (!TRead.readArpeggioProperties(b, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readTapping(t: Tapping, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (tag === 'hand') {
                t.setHand(TConv.fromXmlTappingHand(xml.readAsciiText(), TappingHand.INVALID))
            } else if (tag === TConv.toXmlElementType(ElementType.TAPPING_HALF_SLUR)) {
                const tappingHalfSlur = new TappingHalfSlur(t)
                TRead.readTappingHalfSlur(tappingHalfSlur, xml, ctx)
                tappingHalfSlur.setParent(t)
                if (tappingHalfSlur.isHalfSlurAbove()) {
                    t.setHalfSlurAbove(tappingHalfSlur)
                } else {
                    t.setHalfSlurBelow(tappingHalfSlur)
                }
            } else if (!TRead.readArticulationProperties(t, xml, ctx)) {
                xml.unknown()
            }
        }
    }

    static readTappingHalfSlur(t: TappingHalfSlur, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            if (xml.name() === 'isHalfSlurAbove') {
                t.setIsHalfSlurAbove(xml.readBool())
            } else if (!TRead.readSlurProperties(t, xml, ctx)) {
                xml.unknown()
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
                } else if (ctx.mscVersion() < 410) {
                    // read400::TRead::readProperties(Articulation*)
                    let id = SymNames.symIdByName(s)
                    if (id === SymId.noSym) {
                        id = Read206.articulationNames2SymId206(s) // compatibility hack for "old" 3.0 scores
                    }
                    if (id === SymId.noSym || s === 'ornamentMordentInverted') { // SMuFL < 1.30
                        id = SymId.ornamentMordent
                    }
                    const programVersion = ctx.mscoreVersion()
                    if (programVersion && programVersion < '3.6') {
                        if ((id as SymId) === SymId.noSym || s === 'ornamentMordent') { // SMuFL < 1.30 and MuseScore < 3.6
                            id = SymId.ornamentShortTrill
                        }
                    }
                    a.setSymId(id)
                } else {
                    a.setSymId(SymNames.symIdByName(s))
                }
            } else if (tag === 'channel') {
                a.setChannelName(xml.attribute('name'))
                xml.readNext()
            } else if (tag === 'anchor') {
                if (ctx.mscVersion() <= 400) {
                    a.setAnchor(CompatUtils.translateToNewArticulationAnchor(xml.readInt()))
                    if (a.isStyled(Pid.ARTICULATION_ANCHOR)) {
                        a.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
                    }
                } else {
                    TRead.readPropertyIfTag(a, tag, xml, ctx, Pid.ARTICULATION_ANCHOR)
                }
            } else if (tag === 'direction') {
                TRead.readProperty(a, xml, ctx, Pid.DIRECTION)
            } else if (tag === 'ornamentStyle') {
                TRead.readProperty(a, xml, ctx, Pid.ORNAMENT_STYLE)
            } else if (tag === 'play') {
                a.setPlayArticulation(xml.readBool())
            } else if (tag === 'offset') {
                if (a.score().mscVersion() >= 400) {
                    TRead.readItemProperties(a, xml, ctx)
                } else {
                    xml.skipCurrentElement() // ignore manual layout in older scores
                }
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
            if (!TRead.readLyricsProperties(l, e, ctx)) {
                e.unknown()
            }
        }
        // read400::TRead::read(Lyrics*)
        if (ctx.mscVersion() < 410 && !l.isStyled(Pid.OFFSET) && !ctx.pasteMode()) {
            // fix offset for pre-3.1 scores
            // 3.0: y offset was meaningless if autoplace is set
            const version = ctx.mscoreVersion()
            if (l.autoplace() && version && version < '3.1') {
                const off = l.propertyDefault(Pid.OFFSET) as PointF
                l.setOffset(l.offset().x(), off.y())
            }
        }
    }

    static readLyricsProperties(l: Lyrics, e: XmlReader, ctx: ReadContext): boolean {
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
        } else if (tag === 'ticks') { // obsolete (read400)
            l.setTicks(e.readFraction()) // will fall back to reading integer ticks on older scores
        } else if (TRead.readPropertyIfTag(l, tag, e, ctx, Pid.PLACEMENT)) {
        } else if (tag === 'LyricsLine') {
            e.skipCurrentElement() // TODO(port): LyricsLine
        } else if (!TRead.readTextBaseProperties(l, e, ctx)) {
            return false
        }
        return true
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
            if (!TRead.readSlurProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readSlurProperties(s: Slur, e: XmlReader, ctx: ReadContext): boolean {
        if (TRead.readPropertyIfTag(s, e.name(), e, ctx, Pid.PARTIAL_SPANNER_DIRECTION)) {
            return true
        }
        return TRead.readSlurTieProperties(s, e, ctx)
    }

    static readPartialTie(p: PartialTie, xml: XmlReader, ctx: ReadContext): void {
        while (xml.readNextStartElement()) {
            const tag = xml.name()
            if (TRead.readPropertyIfTag(p, tag, xml, ctx, Pid.TIE_PLACEMENT)) {
            } else if (TRead.readPropertyIfTag(p, tag, xml, ctx, Pid.PARTIAL_SPANNER_DIRECTION)) {
            } else if (!TRead.readSlurTieProperties(p, xml, ctx)) {
                xml.unknown()
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
            // read400::TRead::read(SlurTieSegment*), used by the 2.x/3.x readers
            if (s.score().mscVersion() < 400 && (tag === 'o1' || tag === 'o2' || tag === 'o3' || tag === 'o4')) {
                e.skipCurrentElement() // Ignore slur user offsets from pre-4.0
            } else if (tag === 'o1') {
                s.ups(Grip.START).off = e.readPoint().times(sp)
            } else if (tag === 'o2') {
                s.ups(Grip.BEZIER1).off = e.readPoint().times(sp)
            } else if (tag === 'o3') {
                s.ups(Grip.BEZIER2).off = e.readPoint().times(sp)
            } else if (tag === 'o4') {
                s.ups(Grip.END).off = e.readPoint().times(sp)
            } else if (tag === 'HammerOnPullOffText') {
                TRead.readHopoText(s as HammerOnPullOffSegment, e, ctx, e.intAttribute('idx', 0))
            } else if (!TRead.readItemProperties(s, e, ctx)) {
                e.unknown()
            }
        }
    }

    static readHopoText(hopoSeg: HammerOnPullOffSegment, xml: XmlReader, ctx: ReadContext, idx: number): void {
        const hopoTextCount = hopoSeg.hopoText().length
        for (let i = hopoTextCount; i < idx; ++i) {
            hopoSeg.addHopoText(new HammerOnPullOffText(hopoSeg))
        }

        const hopoText = new HammerOnPullOffText(hopoSeg)
        while (xml.readNextStartElement()) {
            if (!TRead.readTextBaseProperties(hopoText, xml, ctx)) {
                xml.unknown()
            }
        }

        hopoSeg.addHopoText(hopoText)
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
