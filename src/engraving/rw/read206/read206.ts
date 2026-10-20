/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read206/read206.h/.cpp
 *
 * Like C++, the elements that did not change are read with the read400 readers (here: the shared read460
 * readers, which contain the read400/read410 compat code).
 * TODO(port): excerpts (<Score> recursion), Audio, Synthesizer, images, old Bend, note events,
 * instrument channels and id recognition (Instrument::updateInstrumentId needs the instrument templates),
 * SystemDivider, tempo map, MIDI mapping, <ticklen> (< 1.12, needs the compat time sig map)
 */

import { Fraction } from '../../types/fraction'
import { Spatium } from '../../types/dimension'
import { PointF } from '../../../framework/draw/types/geometry'
import { Color } from '../../../framework/draw/types/color'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { SymNames } from '../../types/symnames'
import { TConv } from '../../types/typesconv'
import {
    AccidentalRole, Align, AlignH, AlignV, BarLineType, BeamMode, BracketType, ClefType,
    ClefToBarlinePosition, DirectionV, DurationType, ElementType, FontStyle, GlissandoType, HookType,
    Key, MarkerType, NoteHeadGroup, NoteHeadType, NoteSpellingType, ParenthesesMode,
    PlacementV, SlurStyleType, TextStyleType, TrillType, VOICES, VoiceAssignment,
    AutoOnOff, DPMM, INCH, staff2track, trackZeroVoice,
} from '../../types/types'
import { AccidentalType } from '../../dom/accidentaldata'
import { ArticulationAnchor } from '../../dom/articulation'
import { FrameType } from '../../dom/textbase'
import { HairpinType } from '../../dom/hairpin'
import { MeasureNumberMode, SpacerType } from '../../dom/measure'
import { NoteType } from '../../dom/chordrest'
import { OttavaType } from '../../dom/ottava'
import { Segment, SegmentType } from '../../dom/segment'
import { LayoutMode } from '../../dom/score'
import { Grip } from '../../editing/editdata'
import { type PropertyValue } from '../../types/propertyvalue'
import { Sid } from '../../style/styledef'
import type { MStyle } from '../../style/style'
import { textStyle } from '../../style/textstyle'
import { engravingFonts } from '../../infrastructure/engravingfont'
import { scoreDummy } from '../../compat/dummyelement'
import { readPageFormat206 } from '../../compat/pageformat'
import { Factory } from '../../dom/factory'
import { Part } from '../../dom/part'
import { Instrument } from '../../dom/instrument'
import { StaffType } from '../../dom/stafftype'
import { ClefTypeList } from '../../dom/clefinfo'
import { Pid } from '../../dom/propertydata'
import { PropertyFlags } from '../../dom/property'
import { SpannerAnchor, type Spanner } from '../../dom/spanner'
import { TDuration } from '../../dom/durationtype'
import { Interval } from '../../dom/interval'
import { Prefer, Tpc, pitch2tpc, tpcIsValid, clampPitch } from '../../dom/pitchspelling'
import { Transpose } from '../../editing/transpose'
import { smDrumset } from '../../dom/drumset'
import { Volta } from '../../dom/volta'
import { Symbol } from '../../dom/symbol'
import { MeasureNumber } from '../../dom/measurenumber'
import type { Score } from '../../dom/score'
import type { MasterScore } from '../../dom/masterscore'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Accidental } from '../../dom/accidental'
import type { Ambitus } from '../../dom/ambitus'
import type { Articulation } from '../../dom/articulation'
import type { BarLine } from '../../dom/barline'
import type { Beam } from '../../dom/beam'
import type { Box, TBox } from '../../dom/box'
import type { Breath } from '../../dom/breath'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { ChordLine } from '../../dom/chordline'
import type { Clef } from '../../dom/clef'
import type { Drumset } from '../../dom/drumset'
import type { DurationElement } from '../../dom/durationelement'
import type { Dynamic } from '../../dom/dynamic'
import type { Fermata } from '../../dom/fermata'
import type { Fingering } from '../../dom/fingering'
import type { Glissando } from '../../dom/glissando'
import type { Hairpin } from '../../dom/hairpin'
import type { KeySig } from '../../dom/keysig'
import type { Lyrics } from '../../dom/lyrics'
import type { Marker } from '../../dom/marker'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import type { MMRest } from '../../dom/mmrest'
import type { Note } from '../../dom/note'
import type { NoteDot } from '../../dom/notedot'
import type { Ornament } from '../../dom/ornament'
import type { Ottava } from '../../dom/ottava'
import type { Pedal } from '../../dom/pedal'
import type { RehearsalMark } from '../../dom/rehearsalmark'
import type { Rest } from '../../dom/rest'
import type { Slur } from '../../dom/slur'
import type { SlurTie, SlurTieSegment } from '../../dom/slurtie'
import type { Spacer } from '../../dom/spacer'
import type { Staff } from '../../dom/staff'
import type { StaffTextBase } from '../../dom/stafftextbase'
import type { Stem } from '../../dom/stem'
import type { TempoText } from '../../dom/tempotext'
import type { Text } from '../../dom/text'
import type { TextBase } from '../../dom/textbase'
import type { TextLine } from '../../dom/textline'
import type { TextLineBase } from '../../dom/textlinebase'
import type { Tie, TieSegment } from '../../dom/tie'
import type { TimeSig } from '../../dom/timesig'
import type { Trill } from '../../dom/trill'
import type { Tuplet } from '../../dom/tuplet'
import { XmlReader } from '../xmlreader'
import { CompatUtils } from '../compat/compatutils'
import { ReadChordListHook } from '../compat/readchordlisthook'
import { CompatConversions } from '../compat/compatconversions'
import type { TremoloCompat } from '../compat/tremolocompat'
import { ReadContext } from '../read460/readcontext'
import { TRead } from '../read460/tread'

const DRUM_INSTRUMENTS = 128

//---------------------------------------------------------
//   excessTextStyles206
//    The first map has the name of the style as the string
//    The second map has the mapping of each Sid that the style identifies
//    to the default value for that sid.
//---------------------------------------------------------

let excessTextStyles206 = new Map<string, Map<Sid, PropertyValue>>()

const STYLE_TABLE: [string, TextStyleType][] = [
    ['', TextStyleType.DEFAULT],
    ['Title', TextStyleType.TITLE],
    ['Subtitle', TextStyleType.SUBTITLE],
    ['Composer', TextStyleType.COMPOSER],
    ['Lyricist', TextStyleType.LYRICIST],
    ['Lyrics Odd Lines', TextStyleType.LYRICS_ODD],
    ['Lyrics Even Lines', TextStyleType.LYRICS_EVEN],
    ['Fingering', TextStyleType.FINGERING],
    ['LH Guitar Fingering', TextStyleType.LH_GUITAR_FINGERING],
    ['RH Guitar Fingering', TextStyleType.RH_GUITAR_FINGERING],
    ['String Number', TextStyleType.STRING_NUMBER],
    ['Instrument Name (Long)', TextStyleType.INSTRUMENT_LONG],
    ['Instrument Name (Short)', TextStyleType.INSTRUMENT_SHORT],
    ['Instrument Name (Part)', TextStyleType.INSTRUMENT_EXCERPT],
    ['Dynamics', TextStyleType.DYNAMICS],
    ['Technique', TextStyleType.IGNORED_TYPES],
    ['Tempo', TextStyleType.TEMPO],
    ['Metronome', TextStyleType.METRONOME],
    ['Measure Number', TextStyleType.MEASURE_NUMBER],
    ['Translator', TextStyleType.TRANSLATOR],
    ['Tuplet', TextStyleType.TUPLET],
    ['System', TextStyleType.SYSTEM],
    ['Staff', TextStyleType.STAFF],
    ['Chord Symbol', TextStyleType.HARMONY_A],
    ['Rehearsal Mark', TextStyleType.REHEARSAL_MARK],
    ['Repeat Text Left', TextStyleType.REPEAT_LEFT],
    ['Repeat Text Right', TextStyleType.REPEAT_RIGHT],
    ['Frame', TextStyleType.FRAME],
    ['Text Line', TextStyleType.TEXTLINE],
    ['Glissando', TextStyleType.GLISSANDO],
    ['Ottava', TextStyleType.OTTAVA],
    ['Pedal', TextStyleType.PEDAL],
    ['Hairpin', TextStyleType.HAIRPIN],
    ['Bend', TextStyleType.BEND],
    ['Header', TextStyleType.HEADER],
    ['Footer', TextStyleType.FOOTER],
    ['Instrument Change', TextStyleType.INSTRUMENT_CHANGE],
    ['Repeat Text', TextStyleType.IGNORED_TYPES], // Repeat Text style no longer exists
    ['Figured Bass', TextStyleType.IGNORED_TYPES], // F.B. data are in style properties
    ['Volta', TextStyleType.VOLTA],
]

const USER_NAME_SIDS = [Sid.user1Name, Sid.user2Name, Sid.user3Name, Sid.user4Name, Sid.user5Name, Sid.user6Name,
    Sid.user7Name, Sid.user8Name, Sid.user9Name, Sid.user10Name, Sid.user11Name, Sid.user12Name]

const ACC_MAP = new Map<string, AccidentalType>([
    ['none', AccidentalType.NONE],
    ['sharp', AccidentalType.SHARP],
    ['flat', AccidentalType.FLAT],
    ['natural', AccidentalType.NATURAL],
    ['double sharp', AccidentalType.SHARP2],
    ['double flat', AccidentalType.FLAT2],
    ['flat-slash', AccidentalType.FLAT_SLASH],
    ['flat-slash2', AccidentalType.FLAT_SLASH2],
    ['mirrored-flat2', AccidentalType.MIRRORED_FLAT2],
    ['mirrored-flat', AccidentalType.MIRRORED_FLAT],
    ['sharp-slash', AccidentalType.SHARP_SLASH],
    ['sharp-slash2', AccidentalType.SHARP_SLASH2],
    ['sharp-slash3', AccidentalType.SHARP_SLASH3],
    ['sharp-slash4', AccidentalType.SHARP_SLASH4],
    ['sharp arrow up', AccidentalType.SHARP_ARROW_UP],
    ['sharp arrow down', AccidentalType.SHARP_ARROW_DOWN],
    ['flat arrow up', AccidentalType.FLAT_ARROW_UP],
    ['flat arrow down', AccidentalType.FLAT_ARROW_DOWN],
    ['natural arrow up', AccidentalType.NATURAL_ARROW_UP],
    ['natural arrow down', AccidentalType.NATURAL_ARROW_DOWN],
    ['sori', AccidentalType.SORI],
    ['koron', AccidentalType.KORON],
])

//---------------------------------------------------------
//   ArticulationNames
//---------------------------------------------------------

const ARTICULATION_NAMES: [SymId, string][] = [
    [SymId.fermataAbove, 'fermata'],
    [SymId.fermataShortAbove, 'shortfermata'],
    [SymId.fermataLongAbove, 'longfermata'],
    [SymId.fermataVeryLongAbove, 'verylongfermata'],
    [SymId.articAccentAbove, 'sforzato'],
    [SymId.articStaccatoAbove, 'staccato'],
    [SymId.articStaccatissimoAbove, 'staccatissimo'],
    [SymId.articTenutoAbove, 'tenuto'],
    [SymId.articTenutoStaccatoAbove, 'portato'],
    [SymId.articMarcatoAbove, 'marcato'],
    [SymId.guitarFadeIn, 'fadein'],
    [SymId.guitarFadeOut, 'fadeout'],
    [SymId.guitarVolumeSwell, 'volumeswell'],
    [SymId.wiggleSawtooth, 'wigglesawtooth'],
    [SymId.wiggleSawtoothWide, 'wigglesawtoothwide'],
    [SymId.wiggleVibratoLargeFaster, 'wigglevibratolargefaster'],
    [SymId.wiggleVibratoLargeSlowest, 'wigglevibratolargeslowest'],
    [SymId.brassMuteOpen, 'ouvert'],
    [SymId.brassMuteClosed, 'plusstop'],
    [SymId.stringsUpBow, 'upbow'],
    [SymId.stringsDownBow, 'downbow'],
    [SymId.ornamentTurnInverted, 'reverseturn'],
    [SymId.ornamentTurn, 'turn'],
    [SymId.ornamentTrill, 'trill'],
    [SymId.ornamentShortTrill, 'prall'],
    [SymId.ornamentMordent, 'mordent'],
    [SymId.ornamentTremblement, 'prallprall'],
    [SymId.ornamentPrallMordent, 'prallmordent'],
    [SymId.ornamentUpPrall, 'upprall'],
    [SymId.ornamentUpMordent, 'upmordent'],
    [SymId.ornamentDownMordent, 'downmordent'],
    [SymId.ornamentPrallDown, 'pralldown'],
    [SymId.ornamentPrallUp, 'prallup'],
    [SymId.ornamentLinePrall, 'lineprall'],
    [SymId.ornamentPrecompSlide, 'schleifer'],
    [SymId.pluckedSnapPizzicatoAbove, 'snappizzicato'],
    [SymId.stringsThumbPosition, 'thumb'],
    [SymId.luteFingeringRHThumb, 'lutefingeringthumb'],
    [SymId.luteFingeringRHFirst, 'lutefingering1st'],
    [SymId.luteFingeringRHSecond, 'lutefingering2nd'],
    [SymId.luteFingeringRHThird, 'lutefingering3rd'],

    [SymId.ornamentPrecompMordentUpperPrefix, 'downprall'],
    [SymId.ornamentPrecompMordentUpperPrefix, 'ornamentDownPrall'],
]

/** old (1.x/2.x) articulation names with direction */
const OLD_ARTICULATIONS: [string, boolean, SymId][] = [
    ['fadein', true, SymId.guitarFadeIn],
    ['fadeout', true, SymId.guitarFadeOut],
    ['volumeswell', true, SymId.guitarVolumeSwell],
    ['wigglesawtooth', true, SymId.wiggleSawtooth],
    ['wigglesawtoothwide', true, SymId.wiggleSawtoothWide],
    ['wigglevibratolargefaster', true, SymId.wiggleVibratoLargeFaster],
    ['wigglevibratolargeslowest', true, SymId.wiggleVibratoLargeSlowest],
    ['umarcato', true, SymId.articMarcatoAbove],
    ['dmarcato', false, SymId.articMarcatoBelow],
    ['ufermata', true, SymId.fermataAbove],
    ['dfermata', false, SymId.fermataBelow],
    ['ushortfermata', true, SymId.fermataShortAbove],
    ['dshortfermata', false, SymId.fermataShortBelow],
    ['ulongfermata', true, SymId.fermataLongAbove],
    ['dlongfermata', false, SymId.fermataLongBelow],
    ['uverylongfermata', true, SymId.fermataVeryLongAbove],
    ['dverylongfermata', false, SymId.fermataVeryLongBelow],

    // watch out, bug in 1.2 uportato and dportato are reversed
    ['dportato', true, SymId.articTenutoStaccatoAbove],
    ['uportato', false, SymId.articTenutoStaccatoBelow],
    ['ustaccatissimo', true, SymId.articStaccatissimoAbove],
    ['dstaccatissimo', false, SymId.articStaccatissimoBelow],
]

function convertHeadType(i: number): NoteHeadType {
    switch (i) {
    case 0: return NoteHeadType.HEAD_WHOLE
    case 1: return NoteHeadType.HEAD_HALF
    case 2: return NoteHeadType.HEAD_QUARTER
    case 3: return NoteHeadType.HEAD_BREVIS
    default: return NoteHeadType.HEAD_AUTO
    }
}

export class Read206 {
    static readTextStyle206(style: MStyle, e: XmlReader, ctx: ReadContext, excessStyles: Map<string, Map<Sid, PropertyValue>>): void {
        let family = 'FreeSerif'
        let size = 10
        let sizeIsSpatiumDependent = false
        let fontStyle = FontStyle.Normal
        const align = new Align(AlignH.LEFT, AlignV.TOP)
        let offset = new PointF()
        let offsetType: 'spatium' | 'abs' = 'spatium'

        let frameType = FrameType.NO_FRAME
        let paddingWidth = new Spatium(0.0)
        let frameWidth = new Spatium(0.0)
        let backgroundColor = Color.transparent
        let placement = PlacementV.ABOVE
        let placementValid = false

        let name = e.attribute('name')
        let frameColor = Color.BLACK

        let systemFlag = false
        let lineWidth = -1.0

        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'name') {
                name = e.readText()
            } else if (tag === 'family') {
                family = e.readText()
            } else if (tag === 'size') {
                size = e.readDouble()
            } else if (tag === 'bold') {
                if (e.readInt()) {
                    fontStyle |= FontStyle.Bold
                }
            } else if (tag === 'italic') {
                if (e.readInt()) {
                    fontStyle |= FontStyle.Italic
                }
            } else if (tag === 'underline') {
                if (e.readInt()) {
                    fontStyle |= FontStyle.Underline
                }
            } else if (tag === 'align') { // obsolete
                e.skipCurrentElement()
            } else if (tag === 'anchor') { // obsolete
                e.skipCurrentElement()
            } else if (tag === 'halign') {
                align.horizontal = TConv.fromXmlAlignH(e.readAsciiText(), AlignH.LEFT)
            } else if (tag === 'valign') {
                align.vertical = TConv.fromXmlAlignV(e.readAsciiText(), AlignV.TOP)
            } else if (tag === 'xoffset') {
                let xo = e.readDouble()
                if (offsetType === 'abs') {
                    xo /= INCH
                }
                offset.setX(xo)
            } else if (tag === 'yoffset') {
                let yo = e.readDouble()
                if (offsetType === 'abs') {
                    yo /= INCH
                }
                offset.setY(yo)
            } else if (tag === 'rxoffset' || tag === 'ryoffset') { // obsolete
                e.readDouble()
            } else if (tag === 'offsetType') {
                const val = e.readText()
                let ot: 'spatium' | 'abs' = 'abs'
                if (val === 'spatium' || val === '1') {
                    ot = 'spatium'
                }
                if (ot !== offsetType) {
                    offsetType = ot
                    if (ot === 'abs') {
                        offset = offset.div(INCH) // convert spatium -> inch
                    } else {
                        offset = offset.times(INCH) // convert inch -> spatium
                    }
                }
            } else if (tag === 'sizeIsSpatiumDependent' || tag === 'spatiumSizeDependent') {
                sizeIsSpatiumDependent = e.readInt() !== 0
            } else if (tag === 'frameWidth') { // obsolete
                frameType = FrameType.SQUARE
                e.readDouble()
            } else if (tag === 'frameWidthS') {
                frameType = FrameType.SQUARE
                frameWidth = new Spatium(e.readDouble())
            } else if (tag === 'frame') {
                frameType = e.readInt() ? FrameType.SQUARE : FrameType.NO_FRAME
            } else if (tag === 'paddingWidth') { // obsolete
                e.readDouble()
            } else if (tag === 'paddingWidthS') {
                paddingWidth = new Spatium(e.readDouble())
            } else if (tag === 'frameRound') {
                e.readDouble()
            } else if (tag === 'frameColor') {
                frameColor = e.readColor()
            } else if (tag === 'foregroundColor') {
                e.readColor()
            } else if (tag === 'backgroundColor') {
                backgroundColor = e.readColor()
            } else if (tag === 'circle') {
                frameType = e.readInt() ? FrameType.CIRCLE : FrameType.NO_FRAME
            } else if (tag === 'systemFlag') {
                systemFlag = e.readInt() !== 0
            } else if (tag === 'placement') {
                const value = e.readText()
                if (value === 'above') {
                    placement = PlacementV.ABOVE
                } else if (value === 'below') {
                    placement = PlacementV.BELOW
                }
                placementValid = true
            } else if (tag === 'lineWidth') {
                lineWidth = e.readDouble()
            } else {
                e.unknown()
            }
        }
        if (family === 'MuseJazz') {
            family = 'MuseJazz Text'
        }

        let ss = TextStyleType.TEXT_TYPES
        for (const [n, t] of STYLE_TABLE) {
            if (name === n) {
                ss = t
                break
            }
        }

        if (ss === TextStyleType.IGNORED_TYPES) {
            return
        }

        if (ss === TextStyleType.DEFAULT) {
            // This could be false in older files but newer files must have this true
            sizeIsSpatiumDependent = true
        }

        let isExcessStyle = false
        if (ss === TextStyleType.TEXT_TYPES) {
            ss = ctx.addUserTextStyle(name)
            if (ss === TextStyleType.TEXT_TYPES) {
                isExcessStyle = true
            } else {
                const idx = ss - TextStyleType.USER1
                if (ss < TextStyleType.USER1 || ss > TextStyleType.USER12) {
                    return
                }
                style.set(USER_NAME_SIDS[idx], name)
            }
        }

        const excessPairs = new Map<Sid, PropertyValue>()
        const ts = isExcessStyle ? textStyle(TextStyleType.USER1)! : textStyle(ss)!
        for (const i of ts) {
            if (ctx.shouldSkipProperty()) {
                continue
            }

            let value: PropertyValue = undefined
            if (i.sid === Sid.NOSTYLE) {
                break
            }
            switch (i.pid) {
            case Pid.TEXT_STYLE:
                value = ss
                break
            case Pid.BEGIN_FONT_FACE:
            case Pid.CONTINUE_FONT_FACE:
            case Pid.END_FONT_FACE:
            case Pid.FONT_FACE:
                value = family
                break
            case Pid.BEGIN_FONT_SIZE:
            case Pid.CONTINUE_FONT_SIZE:
            case Pid.END_FONT_SIZE:
            case Pid.FONT_SIZE:
                value = size
                break
            case Pid.BEGIN_FONT_STYLE:
            case Pid.CONTINUE_FONT_STYLE:
            case Pid.END_FONT_STYLE:
            case Pid.FONT_STYLE:
                value = fontStyle
                break
            case Pid.FRAME_TYPE:
                value = frameType
                break
            case Pid.FRAME_WIDTH:
                value = frameWidth
                break
            case Pid.FRAME_PADDING:
                value = paddingWidth
                break
            case Pid.FRAME_FG_COLOR:
                value = frameColor
                break
            case Pid.FRAME_BG_COLOR:
                value = backgroundColor
                break
            case Pid.SIZE_SPATIUM_DEPENDENT:
                value = sizeIsSpatiumDependent
                break
            case Pid.BEGIN_TEXT_ALIGN:
            case Pid.CONTINUE_TEXT_ALIGN:
            case Pid.END_TEXT_ALIGN:
            case Pid.ALIGN:
                value = align.clone()
                break
            case Pid.POSITION:
                value = align.horizontal
                break
            case Pid.SYSTEM_FLAG:
                value = systemFlag
                break
            case Pid.BEGIN_HOOK_HEIGHT:
            case Pid.END_HOOK_HEIGHT:
                value = undefined
                break
            case Pid.PLACEMENT:
                if (placementValid) {
                    value = placement
                }
                break
            case Pid.LINE_WIDTH:
                if (lineWidth !== -1.0) {
                    value = lineWidth // Millimetre
                }
                break
            default:
                break
            }
            if (value !== undefined) {
                if (isExcessStyle) {
                    excessPairs.set(i.sid, value)
                } else {
                    style.set(i.sid, value)
                }
            }
        }

        if (isExcessStyle && excessPairs.size > 0) {
            excessStyles.set(name, excessPairs)
        }
    }

    static readAccidental206(a: Accidental, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'bracket') {
                const i = e.readInt()
                if (i === 0 || i === 1) {
                    a.setBracket(i)
                }
            } else if (tag === 'subtype') {
                const text = e.readText()
                a.setAccidentalType(ACC_MAP.get(text) ?? AccidentalType.NONE)
            } else if (tag === 'role') {
                const r = e.readInt() as AccidentalRole
                if (r === AccidentalRole.AUTO || r === AccidentalRole.USER) {
                    a.setRole(r)
                }
            } else if (tag === 'small') {
                a.setSmall(e.readInt() !== 0)
            } else if (TRead.readItemProperties(a, e, ctx)) {
            } else {
                e.unknown()
            }
        }
    }

    static readDynamicRange(i: number): VoiceAssignment {
        switch (i) {
        case 0:
            return VoiceAssignment.ALL_VOICE_IN_STAFF
        case 1:
        case 2:
            break
        }

        return VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
    }

    static convertHeadGroup(i: number): NoteHeadGroup {
        switch (i) {
        case 1: return NoteHeadGroup.HEAD_CROSS
        case 2: return NoteHeadGroup.HEAD_DIAMOND
        case 3: return NoteHeadGroup.HEAD_TRIANGLE_DOWN
        case 4: return NoteHeadGroup.HEAD_MI
        case 5: return NoteHeadGroup.HEAD_SLASH
        case 6: return NoteHeadGroup.HEAD_XCIRCLE
        case 7: return NoteHeadGroup.HEAD_DO
        case 8: return NoteHeadGroup.HEAD_RE
        case 9: return NoteHeadGroup.HEAD_FA
        case 10: return NoteHeadGroup.HEAD_LA
        case 11: return NoteHeadGroup.HEAD_TI
        case 12: return NoteHeadGroup.HEAD_SOL
        case 13: return NoteHeadGroup.HEAD_BREVIS_ALT
        case 0:
        default:
            return NoteHeadGroup.HEAD_NORMAL
        }
    }

    static articulationNames2SymId206(s: string): SymId {
        for (const [id, name] of ARTICULATION_NAMES) {
            if (name === s) {
                return id
            }
        }
        return SymId.noSym
    }

    static readPart206(part: Part, e: XmlReader, ctx: ReadContext): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Instrument') {
                const i = part.instrument(new Fraction(-1, 1))
                readInstrument206(i, part, e, ctx)
                const ds = i.drumset()
                const s = part.staves().length ? part.staves()[0] : null
                const lld = s ? Math.round(s.lineDistance(new Fraction(0, 1))) : 1
                if (ds && s && lld > 1) {
                    for (let j = 0; j < DRUM_INSTRUMENTS; ++j) {
                        ds.drum(j).line = Math.trunc(ds.drum(j).line / lld)
                    }
                }
            } else if (tag === 'Staff') {
                const staff = Factory.createStaff(part)
                part.score().appendStaff(staff)
                readStaff(staff, e, ctx)
            } else if (tag === 'name') {
                part.instrument().setLongName(e.readText())
            } else if (tag === 'shortName') {
                part.instrument().setShortName(e.readText())
            } else if (tag === 'trackName') {
                part.setPartName(e.readText())
            } else if (tag === 'show') {
                part.setShow(e.readInt() !== 0)
            } else {
                e.unknown()
            }
        }

        if (part.partName().length === 0) {
            part.setPartName(part.instrument().trackName())
        }
    }

    static readNoteProperties206(note: Note, e: XmlReader, ctx: ReadContext): boolean {
        const tag = e.name()

        if (tag === 'pitch') {
            note.setPitch(e.readInt())
        } else if (tag === 'tpc') {
            const tpc = e.readInt()
            note.setTpc1(tpc)
            note.setTpc2(tpc)
        } else if (tag === 'track') { // for performance
            note.setTrack(e.readInt())
        } else if (tag === 'Accidental') {
            const a = Factory.createItem(ElementType.ACCIDENTAL, note) as Accidental
            a.setTrack(note.track())
            TRead.readItem(a, e, ctx)
            note.add(a)
        } else if (tag === 'Tie') {
            const tie = Factory.createItem(ElementType.TIE, note) as Tie
            tie.setParent(note)
            tie.setTrack(note.track())
            Read206.readTie206(e, ctx, tie)
            tie.setStartNote(note)
            note.setTieFor(tie)
        } else if (tag === 'tpc2') {
            note.setTpc2(e.readInt())
        } else if (tag === 'small') {
            note.setSmall(e.readInt() !== 0)
        } else if (tag === 'mirror') {
            TRead.readProperty(note, e, ctx, Pid.MIRROR_HEAD)
        } else if (tag === 'dotPosition') {
            TRead.readProperty(note, e, ctx, Pid.DOT_POSITION)
        } else if (tag === 'fixed') {
            note.setFixed(e.readBool())
        } else if (tag === 'fixedLine') {
            note.setFixedLine(e.readInt())
        } else if (tag === 'head') {
            TRead.readProperty(note, e, ctx, Pid.HEAD_GROUP)
        } else if (tag === 'velocity') {
            // TODO: convert to MU4
            e.skipCurrentElement()
        } else if (tag === 'play') {
            note.setPlay(e.readInt() !== 0)
        } else if (tag === 'tuning') {
            note.setTuning(e.readDouble())
        } else if (tag === 'fret') {
            note.setFret(e.readInt())
        } else if (tag === 'string') {
            note.setString(e.readInt())
        } else if (tag === 'ghost') {
            note.setGhost(e.readInt() !== 0)
        } else if (tag === 'headType') {
            TRead.readProperty(note, e, ctx, Pid.HEAD_TYPE)
        } else if (tag === 'veloType') {
            TRead.readProperty(note, e, ctx, Pid.VELO_TYPE)
        } else if (tag === 'line') {
            note.setLine(e.readInt())
        } else if (tag === 'Fingering') {
            const f = Factory.createItem(ElementType.FINGERING, note) as Fingering
            f.setTrack(note.track())
            readText206(e, ctx, f, note)
            note.add(f)
        } else if (tag === 'Symbol') {
            const s = new Symbol(note)
            s.setTrack(note.track())
            TRead.readSymbol(s, e, ctx)
            if (s.sym() === SymId.noteheadParenthesisLeft) {
                note.setParenthesesMode(ParenthesesMode.BOTH)
            } else if (s.sym() === SymId.noteheadParenthesisRight) {
                note.setParenthesesMode(ParenthesesMode.BOTH)
            } else {
                note.add(s)
            }
        } else if (tag === 'Image') {
            e.skipCurrentElement() // TODO(port): images
        } else if (tag === 'Bend') {
            e.skipCurrentElement() // TODO(port): old Bend element
        } else if (tag === 'NoteDot') {
            const dot = Factory.createItem(ElementType.NOTEDOT, note) as NoteDot
            TRead.readItemPropertiesOnly(dot, e, ctx)
            note.add(dot)
        } else if (tag === 'Events') {
            e.skipCurrentElement() // TODO(port): note events (playback only)
        } else if (tag === 'endSpanner') {
            const id = e.intAttribute('id')
            const sp = ctx.findSpanner(id)
            if (sp) {
                sp.setEndElement(note)
                if (sp.isTie()) {
                    note.setTieBack(sp as unknown as Tie)
                } else {
                    // TODO(port): NoteLine::enforceMinLength (note lines are not ported)
                    if (sp.isGlissando() && note.explicitParent() && note.explicitParent()!.isChord()) {
                        (note.explicitParent() as unknown as Chord).setEndsNoteAnchoredLine(true)
                    }
                    note.addSpannerBack(sp)
                }
                ctx.removeSpanner(sp)
            } else {
                // End of a spanner whose start element will appear later;
                // may happen for cross-staff spanner from a lower to a higher staff
                // (for instance a glissando from bass to treble staff of piano).
                // Create a place-holder spanner with end data
                // (a TextLine is used only because both Spanner or SLine are abstract,
                // the actual class does not matter, as long as it is derived from Spanner)
                const id1 = e.intAttribute('id', -1)
                const staff = note.staff()
                if (id1 !== -1 && staff) {
                    const placeholder = Factory.createItem(ElementType.TEXTLINE, scoreDummy(ctx.score())) as Spanner
                    placeholder.setAnchor(SpannerAnchor.NOTE)
                    placeholder.setEndElement(note)
                    placeholder.setTrack2(note.track())
                    placeholder.setTick(new Fraction(0, 1))
                    placeholder.setTick2(ctx.tick())
                    ctx.addSpanner(id1, placeholder)
                }
            }
            e.readNext()
        } else if (tag === 'TextLine' || tag === 'Glissando') {
            const sp = Factory.createItemByName(tag, scoreDummy(ctx.score())) as Spanner
            // check this is not a lower-to-higher cross-staff spanner we already got
            const id = e.intAttribute('id')
            const placeholder = ctx.findSpanner(id)
            if (placeholder && placeholder.endElement()) {
                // if it is, fill end data from place-holder
                sp.setAnchor(SpannerAnchor.NOTE) // make sure we can set a Note as end element
                sp.setEndElement(placeholder.endElement())
                sp.setTrack2(placeholder.track2())
                sp.setTick(ctx.tick()) // make sure tick2 will be correct
                sp.setTick2(placeholder.tick2());
                (placeholder.endElement() as unknown as Note).addSpannerBack(sp)
                // remove no longer needed place-holder before reading the new spanner,
                // as reading it also adds it to XML reader list of spanners,
                // which would overwrite the place-holder
                ctx.removeSpanner(placeholder)
            }
            sp.setTrack(note.track())
            TRead.readItem(sp, e, ctx)
            sp.setAnchor(SpannerAnchor.NOTE)
            sp.setStartElement(note)
            sp.setTick(ctx.tick())
            note.addSpannerFor(sp)
            sp.setParent(note)
            adjustPlacement(sp)
        } else if (tag === 'offset') {
            TRead.readItemProperties(note, e, ctx)
        } else if (TRead.readItemProperties(note, e, ctx)) {
        } else {
            return false
        }
        return true
    }

    static readDurationProperties206(e: XmlReader, ctx: ReadContext, de: DurationElement): boolean {
        if (e.name() === 'Tuplet') {
            const i = e.readInt()
            const t = ctx.findTuplet(i)
            if (t) {
                de.setTuplet(t)
                t.add(de)
            }
            return true
        } else if (TRead.readItemProperties(de, e, ctx)) {
            return true
        }
        return false
    }

    static readTupletProperties206(e: XmlReader, ctx: ReadContext, de: Tuplet): boolean {
        const tag = e.name()

        if (TRead.readStyledProperty(de, tag, e, ctx)) {
        } else if (tag === 'normalNotes') {
            de.setProperty(Pid.NORMAL_NOTES, e.readInt())
        } else if (tag === 'actualNotes') {
            de.setProperty(Pid.ACTUAL_NOTES, e.readInt())
        } else if (tag === 'p1') {
            de.setProperty(Pid.P1, e.readPoint().times(ctx.spatium()))
        } else if (tag === 'p2') {
            de.setProperty(Pid.P2, e.readPoint().times(ctx.spatium()))
        } else if (tag === 'baseNote') {
            de.setBaseLen(new TDuration(TConv.fromXmlDurationType(e.readAsciiText(), DurationType.V_INVALID)))
        } else if (tag === 'Number') {
            const number = Factory.createItem(ElementType.TEXT, de) as Text
            de.setNumber(number)
            number.setComposition(true)
            number.setParent(de)
            for (const p of [Pid.FONT_FACE, Pid.FONT_SIZE, Pid.FONT_STYLE, Pid.ALIGN]) {
                number.resetProperty(p)
            }
            readText206(e, ctx, number, de)
            number.setVisible(de.visible()) //?? override saved property
            number.setTrack(de.track())
            // move property flags from _number
            for (const p of [Pid.FONT_FACE, Pid.FONT_SIZE, Pid.FONT_STYLE, Pid.ALIGN]) {
                de.setPropertyFlags(p, number.propertyFlags(p))
            }
        } else if (!Read206.readDurationProperties206(e, ctx, de)) {
            return false
        }
        return true
    }

    static readChordRestProperties206(e: XmlReader, ctx: ReadContext, ch: ChordRest): boolean {
        const tag = e.name()

        if (tag === 'durationType') {
            ch.setDurationType(TConv.fromXmlDurationType(e.readAsciiText(), DurationType.V_QUARTER))
            if (ch.actualDurationType().type() !== DurationType.V_MEASURE) {
                if (ctx.mscVersion() < 112 && ch.isRest()
                    // for backward compatibility, convert V_WHOLE rests to V_MEASURE
                    // if long enough to fill a measure.
                    // OTOH, freshly created (un-initialized) rests have numerator == 0 (< 4/4)
                    // (see Fraction() constructor in fraction.h; this happens for instance
                    // when pasting selection from clipboard): they should not be converted
                    && ch.ticks().numerator() !== 0
                    // rest durations are initialized to full measure duration when
                    // created upon reading the <Rest> tag (see Measure::read() )
                    // so a V_WHOLE rest in a measure of 4/4 or less => V_MEASURE
                    && (ch.actualDurationType().type() === DurationType.V_WHOLE && ch.ticks().le(new Fraction(4, 4)))) {
                    // old pre 2.0 scores: convert
                    ch.setDurationType(DurationType.V_MEASURE)
                } else { // not from old score: set duration fraction from duration type
                    ch.setTicks(ch.actualDurationType().fraction())
                }
            }
        } else if (tag === 'BeamMode') {
            // 206 used begin32/begin64 for beam mode
            // 410 uses begin16/begin32
            let txt = e.readAsciiText()
            if (txt === 'begin64') {
                txt = 'begin32'
            } else if (txt === 'begin32') {
                txt = 'begin16'
            }
            ch.setBeamMode(TConv.fromXmlBeamMode(txt, BeamMode.AUTO))
        } else if (tag === 'Articulation') {
            const el = Read206.readArticulation(ch, e, ctx)
            if (el.isFermata()) {
                ch.segment()!.add(el)
            } else {
                ch.add(el)
            }
        } else if (tag === 'leadingSpace' || tag === 'trailingSpace') {
            e.skipCurrentElement()
        } else if (tag === 'Beam') {
            const id = e.readInt()
            const beam = ctx.findBeam(id)
            if (beam) {
                beam.add(ch) // also calls ch->setBeam(beam)
            }
        } else if (tag === 'small') {
            ch.setSmall(e.readInt() !== 0)
        } else if (tag === 'duration') {
            ch.setTicks(e.readFraction())
        } else if (tag === 'ticklen') { // obsolete (version < 1.12)
            e.skipCurrentElement() // TODO(port): needs ctx.compatTimeSigMap() (read114)
        } else if (tag === 'dots') {
            ch.setDots(e.readInt())
        } else if (tag === 'move') {
            ch.setStaffMove(e.readInt())
        } else if (tag === 'Slur') {
            let id = e.intAttribute('id')
            if (id === 0) {
                id = e.intAttribute('number') // obsolete
            }
            const spanner = ctx.findSpanner(id)
            const atype = e.attribute('type')

            if (!spanner) {
                if (atype === 'stop') {
                    ctx.addSpannerValues({ spannerId: id, track2: ch.track(), tick2: ctx.tick() })
                }
            } else {
                if (atype === 'start') {
                    if (spanner.ticks().gt(new Fraction(0, 1)) && spanner.tick().eq(new Fraction(-1, 1))) { // stop has been read first
                        spanner.setTicks(spanner.ticks().minus(ctx.tick()).minus(Fraction.eps()))
                    }
                    spanner.setTick(ctx.tick())
                    spanner.setTrack(ch.track())
                    if (spanner.isSlur()) {
                        spanner.setStartElement(ch)
                    }
                } else if (atype === 'stop') {
                    spanner.setTick2(ctx.tick())
                    spanner.setTrack2(ch.track())
                    if (spanner.isSlur()) {
                        spanner.setEndElement(ch)
                    }
                    const start = spanner.startElement() as ChordRest | null
                    if (start) {
                        spanner.setTrack(start.track())
                    }
                }
            }
            e.readNext()
        } else if (tag === 'Lyrics') {
            const l = Factory.createItem(ElementType.LYRICS, ch) as Lyrics
            l.setTrack(ctx.track())
            readLyrics(l, e, ctx)
            ch.add(l)
        } else if (tag === 'pos') {
            const pt = e.readPoint()
            ch.setOffset(pt.times(ch.spatium()))
        } else if (ch.isRest() && tag === 'Image') {
            e.skipCurrentElement() // TODO(port): images
        } else if (!Read206.readDurationProperties206(e, ctx, ch)) {
            return false
        }
        return true
    }

    static readChordProperties206(e: XmlReader, ctx: ReadContext, ch: Chord): boolean {
        const tag = e.name()

        if (tag === 'Note') {
            const note = Factory.createItem(ElementType.NOTE, ch) as Note
            // the note needs to know the properties of the track it belongs to
            note.setTrack(ch.track())
            readNote206(note, e, ctx)
            ch.add(note)
        } else if (Read206.readChordRestProperties206(e, ctx, ch)) {
        } else if (tag === 'Stem') {
            const s = Factory.createItem(ElementType.STEM, ch) as Stem
            TRead.readStem(s, e, ctx)
            ch.add(s)
        } else if (tag === 'Hook') {
            const hook = Factory.createItem(ElementType.HOOK, ch) as EngravingItem
            TRead.readItem(hook, e, ctx)
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
            const ss = Factory.createItem(ElementType.STEM_SLASH, ch) as EngravingItem
            TRead.readItem(ss, e, ctx)
            ch.add(ss)
        } else if (TRead.readPropertyIfTag(ch, tag, e, ctx, Pid.STEM_DIRECTION)) {
        } else if (tag === 'noStem') {
            ch.setNoStem(e.readInt() !== 0)
        } else if (tag === 'Arpeggio') {
            const arpeggio = Factory.createItem(ElementType.ARPEGGIO, ch) as EngravingItem
            arpeggio.setTrack(ch.track())
            TRead.readItem(arpeggio, e, ctx)
            arpeggio.setParent(ch)
            ch.add(arpeggio)
        } else if (tag === 'Glissando') {
            // old glissando format, chord-to-chord, attached to its final chord
            // the measure we are reading is not inserted in the score yet
            // as well as, possibly, the glissando intended initial chord;
            // then we cannot fully link the glissando right now;
            // temporarily attach the glissando to its final note as a back spanner;
            // after the whole score is read, Score::connectTies() will look for
            // the suitable initial note
            const finalNote = ch.upNote()
            const gliss = Factory.createItem(ElementType.GLISSANDO, scoreDummy(ctx.score())) as Glissando
            TRead.readGlissando(gliss, e, ctx)
            gliss.setAnchor(SpannerAnchor.NOTE)
            gliss.setStartElement(null)
            gliss.setEndElement(null)
            // in TAB, use straight line with no text
            if (ctx.staff(ctx.track() >> 2)!.isTabStaff(ch.tick())) {
                gliss.setGlissandoType(GlissandoType.STRAIGHT)
                gliss.setShowText(false)
            }
            finalNote.addSpannerBack(gliss)
        } else if (tag === 'Tremolo') {
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
        } else if (tag === 'tickOffset') { // obsolete
            e.skipCurrentElement()
        } else if (tag === 'ChordLine') {
            const cl = Factory.createItem(ElementType.CHORDLINE, ch) as ChordLine
            TRead.readChordLine(cl, e, ctx)
            cl.setOffset(0.0, 0.0)
            ch.add(cl)
        } else {
            return false
        }
        return true
    }

    static readHairpin206(e: XmlReader, ctx: ReadContext, h: Hairpin): void {
        let useText = false
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                h.setHairpinType(e.readInt() as HairpinType)
            } else if (tag === 'lineWidth') {
                h.setLineWidth(new Spatium(e.readDouble()))
            } else if (tag === 'hairpinHeight') {
                h.setHairpinHeight(new Spatium(e.readDouble()))
            } else if (tag === 'hairpinContHeight') {
                h.setHairpinContHeight(new Spatium(e.readDouble()))
            } else if (tag === 'hairpinCircledTip') {
                h.setHairpinCircledTip(e.readInt() !== 0)
            } else if (tag === 'veloChange') {
                h.setVeloChange(e.readInt())
            } else if (tag === 'dynType') {
                h.setVoiceAssignment(Read206.readDynamicRange(e.readInt()))
            } else if (tag === 'useTextLine') { // < 206
                e.readInt()
                if (h.hairpinType() === HairpinType.CRESC_HAIRPIN) {
                    h.setHairpinType(HairpinType.CRESC_LINE)
                } else if (h.hairpinType() === HairpinType.DIM_HAIRPIN) {
                    h.setHairpinType(HairpinType.DIM_LINE)
                }
                useText = true
            } else if (!readTextLineProperties(e, ctx, h)) {
                e.unknown()
            }
        }
        if (!useText) {
            h.setBeginText('')
            h.setContinueText('')
            h.setEndText('')
        }
        CompatUtils.resetHookHeightSign(h)
        adjustPlacement(h)
    }

    static readTrill206(e: XmlReader, ctx: ReadContext, t: Trill): void {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                t.setTrillType(TConv.fromXmlTrillType(e.readAsciiText(), TrillType.TRILL_LINE))
            } else if (tag === 'Accidental') {
                const accidental = Factory.createItem(ElementType.ACCIDENTAL, t) as Accidental
                Read206.readAccidental206(accidental, e, ctx)
                accidental.setParent(t)
                t.setAccidental(accidental)
                if (t.ornament()) {
                    t.ornament()!.setTrillOldCompatAccidental(accidental)
                }
            } else if (tag === 'ornamentStyle') {
                TRead.readProperty(t, e, ctx, Pid.ORNAMENT_STYLE)
            } else if (tag === 'play') {
                t.setPlaySpanner(e.readBool())
            } else if (!TRead.readSLineProperties(t, e, ctx)) {
                e.unknown()
            }
        }
        adjustPlacement(t)
    }

    static readTextLine206(e: XmlReader, ctx: ReadContext, tlb: TextLineBase): void {
        while (e.readNextStartElement()) {
            if (!readTextLineProperties(e, ctx, tlb)) {
                e.unknown()
            }
        }
        CompatUtils.resetHookHeightSign(tlb)
        adjustPlacement(tlb)
    }

    static readArticulation(parent: EngravingItem, e: XmlReader, ctx: ReadContext): EngravingItem {
        let el: EngravingItem | null = null
        let sym = SymId.fermataAbove // default -- backward compatibility (no type = ufermata in 1.2)
        let anchor = ArticulationAnchor.TOP
        let direction = DirectionV.AUTO
        const track = parent.track()
        let timeStretch = 0.0
        let useDefaultPlacement = true

        const readProperties = (el: EngravingItem, e: XmlReader, ctx: ReadContext): boolean => {
            if (el.isFermata()) {
                return TRead.readFermataProperties(el as Fermata, e, ctx)
            } else if (el.isArticulationFamily()) {
                return TRead.readArticulationProperties(el as Articulation, e, ctx)
            }
            return false
        }

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'subtype') {
                const s = e.readText()
                if (/^[0-9]/.test(s)) {
                    const oldType = parseInt(s, 10)
                    sym = ARTICULATION_NAMES[oldType][0]
                } else {
                    sym = Read206.articulationNames2SymId206(s)
                    if (sym === SymId.noSym) {
                        const al = OLD_ARTICULATIONS.find(a => a[0] === s)
                        if (al) {
                            sym = al[2]
                            const up = al[1]
                            direction = up ? DirectionV.UP : DirectionV.DOWN
                            if ((direction === DirectionV.DOWN) !== ((track & 1) !== 0)) {
                                useDefaultPlacement = false
                            }
                        } else {
                            sym = SymNames.symIdByName(s)
                        }
                    }
                }
                switch (sym) {
                case SymId.fermataAbove:
                case SymId.fermataBelow:
                case SymId.fermataShortAbove:
                case SymId.fermataShortBelow:
                case SymId.fermataLongAbove:
                case SymId.fermataLongBelow:
                case SymId.fermataVeryLongAbove:
                case SymId.fermataVeryLongBelow: {
                    const fe = Factory.createItem(ElementType.FERMATA, scoreDummy(ctx.score()).segment()) as Fermata
                    fe.setSymIdAndTimeStretch(sym)
                    el = fe
                } break
                default: {
                    const ar = Factory.createItem(ElementType.ARTICULATION, scoreDummy(ctx.score()).chord()) as Articulation
                    ar.setSymId(sym)
                    ar.setDirection(direction)
                    el = ar
                } break
                }
            } else if (tag === 'anchor') {
                useDefaultPlacement = false
                if (!el || el.isFermata()) {
                    anchor = CompatUtils.translateToNewArticulationAnchor(e.readInt())
                } else {
                    readProperties(el, e, ctx)
                }
            } else if (tag === 'direction') {
                useDefaultPlacement = false
                if (!el || el.isFermata()) {
                    direction = TConv.fromXmlDirectionV(e.readAsciiText(), DirectionV.AUTO)
                } else {
                    readProperties(el, e, ctx)
                }
            } else if (tag === 'timeStretch') {
                timeStretch = e.readDouble()
            } else {
                if (!el || !readProperties(el, e, ctx)) {
                    e.unknown()
                }
            }
        }
        // Special case for "no type" = ufermata, with missing subtype tag
        if (!el) {
            const f = Factory.createItem(ElementType.FERMATA, scoreDummy(ctx.score()).segment()) as Fermata
            f.setSymIdAndTimeStretch(sym)
            el = f
        }
        if (el.isFermata()) {
            if (!RealIsNull(timeStretch)) {
                el.setProperty(Pid.TIME_STRETCH, timeStretch)
            }
            if (useDefaultPlacement) {
                el.setPlacement(track & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
            } else {
                setFermataPlacement(el, anchor, direction)
            }
        }
        el.setTrack(track)
        return el
    }

    static readSlur206(e: XmlReader, ctx: ReadContext, s: Slur): void {
        s.setTrack(ctx.track()) // set staff
        ctx.addSpanner(e.intAttribute('id'), s)
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'track2') {
                s.setTrack2(e.readInt())
            } else if (tag === 'startTrack') { // obsolete
                s.setTrack(e.readInt())
            } else if (tag === 'endTrack') { // obsolete
                e.readInt()
            } else if (!readSlurTieProperties(e, ctx, s)) {
                e.unknown()
            }
        }
        if (s.track2() === -1) {
            s.setTrack2(s.track())
        }
    }

    static readTie206(e: XmlReader, ctx: ReadContext, t: Tie): void {
        ctx.addSpanner(e.intAttribute('id'), t)
        while (e.readNextStartElement()) {
            if (readSlurTieProperties(e, ctx, t)) {
            } else {
                e.unknown()
            }
        }
        if (ctx.mscVersion() <= 114 && t.spannerSegments().length === 1) {
            // ignore manual adjustments to single-segment ties in older scores
            const ss = t.frontSegment() as TieSegment
            const zeroP = new PointF()
            ss.ups(Grip.START).off = zeroP.clone()
            ss.ups(Grip.BEZIER1).off = zeroP.clone()
            ss.ups(Grip.BEZIER2).off = zeroP.clone()
            ss.ups(Grip.END).off = zeroP.clone()
            ss.setOffset(zeroP)
            ss.setUserOff2(zeroP)
        }
    }

    static readScoreTag(score: Score, e: XmlReader, ctx: ReadContext): boolean {
        while (e.readNextStartElement()) {
            ctx.setTrack(-1)
            const tag = e.name()
            if (tag === 'Staff') {
                readStaffContent206(score, e, ctx)
            } else if (tag === 'siglist') {
                e.skipCurrentElement() // TODO(port): compat time sig map (only used for <ticklen>)
            } else if (tag === 'Omr' || tag === 'Audio' || tag === 'showOmr' || tag === 'LayerTag' || tag === 'Layer'
                       || tag === 'currentLayer' || tag === 'Synthesizer') {
                e.skipCurrentElement()
            } else if (tag === 'playMode') {
                e.skipCurrentElement()
            } else if (tag === 'page-offset') {
                score.setPageNumberOffset(e.readInt())
            } else if (tag === 'Division') {
                score.setFileDivision(e.readInt())
            } else if (tag === 'showInvisible') {
                score.setShowInvisible(e.readInt() !== 0)
            } else if (tag === 'showUnprintable') {
                score.setShowUnprintable(e.readInt() !== 0)
            } else if (tag === 'showFrames') {
                score.setShowFrames(e.readInt() !== 0)
            } else if (tag === 'showMargins') {
                score.setShowPageborders(e.readInt() !== 0)
            } else if (tag === 'Style') {
                const clhook = new ReadChordListHook(score)
                readStyle206(score.style(), e, ctx, clhook)
                if (score.style().styleSt(Sid.musicalTextFont) === 'MuseJazz') {
                    score.style().set(Sid.musicalTextFont, 'MuseJazz Text')
                }
                score.styleChanged()
                score.setEngravingFont(engravingFonts().fontByName(score.style().styleSt(Sid.musicalSymbolFont)))
            } else if (tag === 'copyright' || tag === 'rights') {
                const text = Factory.createItem(ElementType.TEXT, scoreDummy(score)) as Text
                readText206(e, ctx, text, text)
                score.setMetaTag('copyright', text.xmlText())
            } else if (tag === 'movement-number') {
                score.setMetaTag('movementNumber', e.readText())
            } else if (tag === 'movement-title') {
                score.setMetaTag('movementTitle', e.readText())
            } else if (tag === 'work-number') {
                score.setMetaTag('workNumber', e.readText())
            } else if (tag === 'work-title') {
                score.setMetaTag('workTitle', e.readText())
            } else if (tag === 'source') {
                score.setMetaTag('source', e.readText())
            } else if (tag === 'metaTag') {
                const name = e.attribute('name')
                score.setMetaTag(name, e.readText())
            } else if (tag === 'Part') {
                const part = new Part(score)
                Read206.readPart206(part, e, ctx)
                score.appendPart(part)
            } else if (tag === 'HairPin' || tag === 'Ottava' || tag === 'TextLine' || tag === 'Volta' || tag === 'Trill'
                       || tag === 'Slur' || tag === 'Pedal') {
                const s = Factory.createItemByName(tag, scoreDummy(score)) as Spanner
                if (tag === 'HairPin') {
                    Read206.readHairpin206(e, ctx, s as Hairpin)
                } else if (tag === 'Ottava') {
                    readOttava(e, ctx, s as Ottava)
                } else if (tag === 'TextLine') {
                    Read206.readTextLine206(e, ctx, s as TextLine)
                } else if (tag === 'Volta') {
                    readVolta206(e, ctx, s as Volta)
                } else if (tag === 'Trill') {
                    Read206.readTrill206(e, ctx, s as Trill)
                } else if (tag === 'Slur') {
                    Read206.readSlur206(e, ctx, s as Slur)
                } else {
                    readPedal(e, ctx, s as Pedal)
                }
                score.addSpanner(s)
            } else if (tag === 'Score') { // recursion
                e.skipCurrentElement() // TODO(port): excerpts
            } else if (tag === 'PageList') {
                e.skipCurrentElement()
            } else if (tag === 'name') {
                e.skipCurrentElement() // only used by excerpts
            } else if (tag === 'layoutMode') {
                if (ctx.forcePageMode()) {
                    e.skipCurrentElement()
                    continue
                }
                const s = e.readText()
                if (s === 'line') {
                    score.setLayoutMode(LayoutMode.LINE)
                } else if (s === 'system') {
                    score.setLayoutMode(LayoutMode.SYSTEM)
                }
            } else {
                e.unknown()
            }
        }
        if (e.isError()) {
            return false
        }

        score.connectTies()

        score.setFileDivision(480) // Constants::DIVISION

        // TODO(port): tempo map, harmony channels, MIDI mapping, assignInitialPartToExcerpts

        return true
    }

    readScoreFile(score: Score, e: XmlReader): boolean {
        const ctx = new ReadContext(score)

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'programVersion') {
                (score as MasterScore).setMscoreVersion(e.readText())
            } else if (tag === 'programRevision') {
                (score as MasterScore).setMscoreRevision(parseInt(e.readText(), 16))
            } else if (tag === 'Score') {
                if (!Read206.readScoreTag(score, e, ctx)) {
                    return false
                }
            } else if (tag === 'Revision') {
                e.skipCurrentElement()
            } else {
                e.skipCurrentElement() // C++ ignores other tags
            }
        }

        for (const s of score.staves()) {
            s.updateOttava()
        }

        // convert int bar line span to bool

        // also sets Pid::BARLINE_SPAN to non-generated and affected bar lines
        setBarLineSpanToStaves(score, ctx)

        // set local overrides to bar lines
        const st = SegmentType.BarLineType
        const numStaves = score.nstaves()
        for (let s = score.firstMeasure()?.first(st) ?? null; s; s = s.next1(st)) {
            // optional local bar line span override of this segment
            let barLineSpan: number | null = null
            for (let staffIdx = 0; staffIdx < numStaves; ++staffIdx) {
                const maxSpan = numStaves - staffIdx - 1
                const trackIdx = staff2track(staffIdx)
                let el = s.element(trackIdx)
                let barLine: BarLine | null = el && el.isBarLine() ? el as BarLine : null
                if (barLine) {
                    const span = ctx.getBarLineSpan(barLine)
                    if (span !== null) {
                        if (span > maxSpan) {
                            barLineSpan = maxSpan
                        } else {
                            barLineSpan = Math.max(barLineSpan ?? 0, span)
                        }
                    }
                }

                if (barLineSpan === null) {
                    // we don't have a local override. Keep the value from staff
                    continue
                }

                const shouldBarLineSpan = barLineSpan !== 0
                const staffBarLineSpan = score.staff(staffIdx)!.barLineSpan()
                if (shouldBarLineSpan !== staffBarLineSpan) {
                    // bar line should have local override
                    if (!barLine) {
                        // clone previous bar line. This is safe because we always have a previous barline when
                        // barLineSpan != std::nullopt because it's either the one that was read or the one cloned
                        // in the previous iteration
                        el = s.element(staff2track(staffIdx - 1))
                        if (el && el.isBarLine()) {
                            const bl = (el as BarLine).clone() as BarLine
                            bl.setTrack(trackIdx)
                            s.add(bl)
                            barLine = bl
                        }
                    }

                    if (barLine) {
                        barLine.setSpanStaff(shouldBarLineSpan)
                    }
                }
                if (barLineSpan === 0) {
                    // we're done applying the local override
                    barLineSpan = null
                } else {
                    --barLineSpan
                }
            }
        }

        CompatConversions.doCompatibilityConversions(score.masterScore())

        return true
    }
}

//---------------------------------------------------------
//   readDrumset
//---------------------------------------------------------

function readDrumset206(ds: Drumset, e: XmlReader): void {
    const pitch = e.intAttribute('pitch', -1)
    if (pitch < 0 || pitch > 127) {
        e.skipCurrentElement() // C++ returns without skipping (invalid pitch)
        return
    }
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'head') {
            ds.drum(pitch).notehead = Read206.convertHeadGroup(e.readInt())
        } else if (tag === 'variants') {
            // TODO(port): drum variants (Articulation::symId2ArticulationName), only used for note input
            e.skipCurrentElement()
        } else if (ds.readDrumProperties(e, pitch)) {
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readInstrument
//---------------------------------------------------------

function readInstrument206(i: Instrument, p: Part, e: XmlReader, ctx: ReadContext): void {
    const customDrumset = { value: false }
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'Drum') {
            // if we see one of this tags, a custom drumset will
            // be created
            if (!i.drumset()) {
                i.setDrumset(smDrumset())
            }
            if (!customDrumset.value) {
                i.drumset()!.clear()
                customDrumset.value = true
            }
            readDrumset206(i.drumset()!, e)
        } else if (TRead.readInstrumentProperties(i, e, ctx, p, customDrumset)) {
        } else {
            e.unknown()
        }
    }

    // TODO(port): i->updateInstrumentId(), single note dynamics from template, channels
}

//---------------------------------------------------------
//   readStaff
//---------------------------------------------------------

function readStaff(staff: Staff, e: XmlReader, ctx: ReadContext): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'type') { // obsolete
            e.readInt()
        } else if (tag === 'StaffType') {
            const st = new StaffType()
            TRead.readStaffType(st, e, ctx)
            staff.setStaffType(new Fraction(0, 1), st)
        } else if (tag === 'defaultClef') { // sets both default transposing and concert clef
            const ct = TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)
            staff.setDefaultClefType(new ClefTypeList(ct, ct))
        } else if (tag === 'defaultConcertClef') {
            staff.setDefaultClefType(new ClefTypeList(TConv.fromXmlClefType(e.readAsciiText(), ClefType.G),
                staff.defaultClefType().transposingClef))
        } else if (tag === 'defaultTransposingClef') {
            staff.setDefaultClefType(new ClefTypeList(staff.defaultClefType().concertClef,
                TConv.fromXmlClefType(e.readAsciiText(), ClefType.G)))
        } else if (tag === 'small') {
            staff.staffType(new Fraction(0, 1))!.setSmall(e.readInt() !== 0)
        } else if (tag === 'invisible') {
            staff.staffType(new Fraction(0, 1))!.setInvisible(e.readInt() !== 0)
        } else if (tag === 'neverHide') {
            const v = e.readInt() !== 0
            if (v) {
                staff.setHideWhenEmpty(AutoOnOff.OFF)
            }
        } else if (tag === 'showIfSystemEmpty') {
            staff.setShowIfEntireSystemEmpty(e.readInt() !== 0)
        } else if (tag === 'hideSystemBarLine') {
            staff.setHideSystemBarLine(e.readInt() !== 0)
        } else if (tag === 'keylist') {
            TRead.readKeyList(staff.keyList(), e, ctx)
        } else if (tag === 'bracket') {
            let col = e.intAttribute('col', -1)
            if (col === -1) {
                col = staff.brackets().length
            }
            staff.setBracketType(col, e.intAttribute('type', -1) as BracketType)
            staff.setBracketSpan(col, e.intAttribute('span', 0))
            staff.setBracketVisible(col, e.intAttribute('visible', 1) !== 0)
            e.skipCurrentElement() // C++ e.readNext() (empty element)
        } else if (tag === 'barLineSpan') {
            staff.setBarLineFrom(e.intAttribute('from', 0))
            staff.setBarLineTo(e.intAttribute('to', 0))
            const barLineSpan = e.readInt()
            if (barLineSpan > 0) {
                ctx.setStaffBarLineSpan(staff.idx(), barLineSpan - 1)
            } else {
                ctx.setStaffBarLineSpan(staff.idx(), 0)
            }
        } else if (tag === 'distOffset') {
            staff.setUserDist(new Spatium(e.readDouble()))
        } else if (tag === 'mag') {
            e.readDouble()
        } else if (tag === 'linkedTo') {
            const v = e.readInt() - 1
            const st = staff.score().masterScore().staff(v)
            if (staff.links()) {
                if (!st || staff.isLinked(st)) { // maybe we don't need actually to relink...
                    continue
                }
                // not using unlink() here as it may delete _links
                // a pointer to which is stored also in XmlReader.
                staff.unlink()
                staff.setLinks(null)
            }
            if (st && st !== staff) {
                staff.linkTo(st)
            }
        } else if (tag === 'color') {
            staff.staffType(new Fraction(0, 1))!.setColor(e.readColor())
        } else if (tag === 'transposeDiatonic') {
            ctx.setTransposeDiatonic(e.readInt())
        } else if (tag === 'transposeChromatic') {
            ctx.setTransposeChromatic(e.readInt())
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readAmbitus
//---------------------------------------------------------

function readAmbitus(ambitus: Ambitus, e: XmlReader, ctx: ReadContext): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'head') {
            ambitus.setNoteHeadGroup(Read206.convertHeadGroup(e.readInt()))
        } else if (tag === 'headType') {
            ambitus.setNoteHeadType(convertHeadType(e.readInt()))
        } else if (TRead.readAmbitusProperties(ambitus, e, ctx)) {
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readNote
//---------------------------------------------------------

function readNote206(note: Note, e: XmlReader, ctx: ReadContext): void {
    note.setTpc1(Tpc.TPC_INVALID)
    note.setTpc2(Tpc.TPC_INVALID)

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'Accidental') {
            const a = Factory.createItem(ElementType.ACCIDENTAL, note) as Accidental
            a.setTrack(note.track())
            Read206.readAccidental206(a, e, ctx)
            note.add(a)
        } else if (tag === 'head') {
            const i = e.readInt()
            note.setHeadGroup(Read206.convertHeadGroup(i))
        } else if (tag === 'headType') {
            const i = e.readInt()
            note.setHeadType(convertHeadType(i))
        } else if (Read206.readNoteProperties206(note, e, ctx)) {
        } else {
            e.unknown()
        }
    }
    // ensure sane values:
    note.setPitch(clampPitch(note.pitch()))

    if (!tpcIsValid(note.tpc1()) && !tpcIsValid(note.tpc2())) {
        const key = (note.staff() && note.chord()) ? note.staff()!.key(note.chord()!.tick()) : Key.C
        const tpc = pitch2tpc(note.pitch(), key, Prefer.NEAREST)
        if (note.concertPitch()) {
            note.setTpc1(tpc)
        } else {
            note.setTpc2(tpc)
        }
    }
    if (!(tpcIsValid(note.tpc1()) && tpcIsValid(note.tpc2()))) {
        const tick = note.chord() ? note.chord()!.tick() : new Fraction(-1, 1)
        const v = note.staff() ? note.staff()!.transpose(tick) : new Interval()
        if (tpcIsValid(note.tpc1())) {
            v.flip()
            if (v.isZero()) {
                note.setTpc2(note.tpc1())
            } else {
                note.setTpc2(Transpose.transposeTpc(note.tpc1(), v, true))
            }
        } else {
            if (v.isZero()) {
                note.setTpc1(note.tpc2())
            } else {
                note.setTpc1(Transpose.transposeTpc(note.tpc2(), v, true))
            }
        }
    }
}

//---------------------------------------------------------
//   adjustPlacement
//---------------------------------------------------------

function adjustPlacement(e: EngravingItem): void {
    if (!e || !e.staff()) {
        return
    }

    // element to use to determine placement
    // for spanners, choose first segment
    let ee: EngravingItem
    let spanner: Spanner | null
    if (e.isSpanner()) {
        spanner = e as Spanner
        if (spanner.spannerSegments().length === 0) {
            return
        }
        ee = spanner.spannerSegments()[0]
        if (!ee) {
            return
        }
    } else {
        spanner = null
        ee = e
    }

    // determine placement based on offset
    // anything below staff will be set to below
    const staffHeight = e.staff()!.staffHeight()
    const threshold = staffHeight
    let offsetAdjust = 0.0
    const defaultPlacement = e.propertyDefault(Pid.PLACEMENT) as PlacementV
    let newPlacement: PlacementV
    // most offsets will be recorded as relative to top staff line
    // exceptions are styled offsets on elements with default placement below
    let normalize: number
    if (defaultPlacement === PlacementV.BELOW && ee.propertyFlags(Pid.OFFSET) === PropertyFlags.STYLED) {
        normalize = staffHeight
    } else {
        normalize = 0.0
    }
    const ypos = ee.offset().y() + normalize
    if (ypos >= threshold) {
        newPlacement = PlacementV.BELOW
        offsetAdjust -= staffHeight
    } else {
        newPlacement = PlacementV.ABOVE
    }

    // set placement
    e.setProperty(Pid.PLACEMENT, newPlacement)
    if (newPlacement !== defaultPlacement) {
        e.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
    }

    // adjust offset
    if (spanner) {
        // adjust segments individually
        for (const a of spanner.spannerSegments()) {
            // spanner segments share the placement setting of the spanner
            // just adjust offset
            if (defaultPlacement === PlacementV.BELOW && a.propertyFlags(Pid.OFFSET) === PropertyFlags.STYLED) {
                normalize = staffHeight
            } else {
                normalize = 0.0
            }
            const yp = a.offset().y() + normalize
            a.setOffset(a.offset().x(), a.offset().y() + normalize + offsetAdjust)

            // if any segments are offset to opposite side of staff from placement,
            // or if they are within staff,
            // disable autoplace
            let disableAutoplace: boolean
            if (yp + a.height() <= 0.0) {
                disableAutoplace = newPlacement === PlacementV.BELOW
            } else if (yp > staffHeight) {
                disableAutoplace = newPlacement === PlacementV.ABOVE
            } else {
                disableAutoplace = true
            }
            if (disableAutoplace) {
                a.setAutoplace(false)
            }
            // needed for https://musescore.org/en/node/281312
            // ideally we would rebase and calculate new offset
            // but this may not be possible
            // since original offset is relative to system
            a.setOffset(0, a.offset().y())
        }
    } else {
        e.setOffset(e.offset().x(), e.offset().y() + normalize + offsetAdjust)
        // if within staff, disable autoplace
        if (ypos + e.height() > 0.0 && ypos <= staffHeight) {
            e.setAutoplace(false)
        }
    }
}

//---------------------------------------------------------
//   ReadStyleName206
//    Retrieve the content of the "style" tag from the
//    String with the content of the whole text tag
//---------------------------------------------------------

function readStyleName206(xmlTag: string): string {
    let beginIdx = xmlTag.indexOf('<style>')
    if (beginIdx < 0) {
        return ''
    }
    beginIdx += '<style>'.length

    const endIdx = xmlTag.indexOf('</style>')
    if (endIdx <= 0) {
        return ''
    }

    return xmlTag.slice(beginIdx, endIdx)
}

//---------------------------------------------------------
//   readTextPropertyStyle206
//    This reads only the 'style' tag, so that it can be read
//    before setting anything else.
//---------------------------------------------------------

function readTextPropertyStyle206(xmlTag: string, ctx: ReadContext, t: TextBase, be: EngravingItem): boolean {
    const s = readStyleName206(xmlTag)

    if (s.length === 0) {
        return false
    }

    if (!be.isTuplet()) { // Hack
        const styleVals = excessTextStyles206.get(s)
        if (styleVals) {
            // Init the text with a style that can't be stored as a user style
            // due to the limit on the number of user styles possible.
            // Use User-1, since it has all the possible user style pids
            t.initTextStyleType(TextStyleType.DEFAULT)
            for (const p of textStyle(TextStyleType.USER1)!) {
                if (propertyValuesEqual(t.getProperty(p.pid), t.propertyDefault(p.pid)) && styleVals.has(p.sid)) {
                    t.setProperty(p.pid, styleVals.get(p.sid))
                }
            }
        } else {
            let ss = ctx.lookupUserTextStyle(s)
            if (ss === TextStyleType.TEXT_TYPES) {
                ss = TConv.fromXmlTextStyleType(s, TextStyleType.DEFAULT)
            }
            if (ss !== TextStyleType.TEXT_TYPES) {
                t.initTextStyleType(ss)
            }
        }
    }

    return true
}

function propertyValuesEqual(a: PropertyValue, b: PropertyValue): boolean {
    if (a === b) {
        return true
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && 'equals' in a && typeof a.equals === 'function') {
        return (a.equals as (o: unknown) => boolean)(b)
    }
    return false
}

//---------------------------------------------------------
//   readTextProperties206
//---------------------------------------------------------

function readTextProperties206(e: XmlReader, ctx: ReadContext, t: TextBase): boolean {
    const tag = e.name()
    if (tag === 'style') {
        e.skipCurrentElement() // read in readTextPropertyStyle206
    } else if (tag === 'foregroundColor') { // same as "color" ?
        e.skipCurrentElement()
    } else if (tag === 'frame') {
        t.setFrameType(e.readBool() ? FrameType.SQUARE : FrameType.NO_FRAME)
        t.setPropertyFlags(Pid.FRAME_TYPE, PropertyFlags.UNSTYLED)
    } else if (tag === 'frameRound') {
        TRead.readProperty(t, e, ctx, Pid.FRAME_ROUND)
    } else if (tag === 'circle') {
        if (e.readBool()) {
            t.setFrameType(FrameType.CIRCLE)
        } else {
            if (t.circle()) {
                t.setFrameType(FrameType.SQUARE)
            }
        }
        t.setPropertyFlags(Pid.FRAME_TYPE, PropertyFlags.UNSTYLED)
    } else if (tag === 'paddingWidthS') {
        TRead.readProperty(t, e, ctx, Pid.FRAME_PADDING)
    } else if (tag === 'frameWidthS') {
        TRead.readProperty(t, e, ctx, Pid.FRAME_WIDTH)
    } else if (tag === 'frameColor') {
        TRead.readProperty(t, e, ctx, Pid.FRAME_FG_COLOR)
    } else if (tag === 'backgroundColor') {
        TRead.readProperty(t, e, ctx, Pid.FRAME_BG_COLOR)
    } else if (tag === 'halign') {
        const align = t.align().clone()
        align.horizontal = TConv.fromXmlAlignH(e.readAsciiText(), AlignH.LEFT)
        t.setAlign(align)
        t.setPropertyFlags(Pid.ALIGN, PropertyFlags.UNSTYLED)
        t.setPosition(align.horizontal)
        t.setPropertyFlags(Pid.POSITION, PropertyFlags.UNSTYLED)
    } else if (tag === 'valign') {
        const align = t.align().clone()
        align.vertical = TConv.fromXmlAlignV(e.readAsciiText(), AlignV.TOP)
        t.setAlign(align)
        t.setPropertyFlags(Pid.ALIGN, PropertyFlags.UNSTYLED)
    } else if (tag === 'pos') {
        TRead.readProperty(t, e, ctx, Pid.OFFSET)
        if (t.align().vertical === AlignV.TOP) {
            t.setOffset(t.offset().x(), t.offset().y() + 0.5 * ctx.spatium()) // HACK: bbox is different in 2.x
        }
        adjustPlacement(t)
    } else if (!TRead.readTextBaseProperties(t, e, ctx)) {
        return false
    }
    return true
}

//---------------------------------------------------------
//   TextReaderContext206
//    For 2.x files, the style tag could be in a different
//    position with respect to 3.x files: a copy of the text tag
//    is read in a separate XmlReader, while the text style is
//    extracted from a String containing the whole text xml tag.
//---------------------------------------------------------

class TextReaderContext206 {
    private m_tagReader: XmlReader
    private m_xmlTag: string

    constructor(e: XmlReader) {
        const { reader, xml } = e.readSubReader()
        this.m_tagReader = reader
        this.m_xmlTag = xml
    }

    reader(): XmlReader { return this.m_tagReader }
    tag(): string { return this.m_xmlTag }
}

//---------------------------------------------------------
//   readText206
//---------------------------------------------------------

function readText206(e: XmlReader, ctx: ReadContext, t: TextBase, be: EngravingItem): void {
    const tctx = new TextReaderContext206(e)
    readTextPropertyStyle206(tctx.tag(), ctx, t, be)
    while (tctx.reader().readNextStartElement()) {
        if (!readTextProperties206(tctx.reader(), ctx, t)) {
            tctx.reader().unknown()
        }
    }
}

function readTempoText(t: TempoText, e: XmlReader, ctx: ReadContext): void {
    const tctx = new TextReaderContext206(e)
    readTextPropertyStyle206(tctx.tag(), ctx, t, t)
    while (tctx.reader().readNextStartElement()) {
        const tag = tctx.reader().name()
        if (tag === 'tempo') {
            t.setTempo(tctx.reader().readDouble())
        } else if (tag === 'followText') {
            t.setFollowText(tctx.reader().readInt() !== 0)
        } else if (!readTextProperties206(tctx.reader(), ctx, t)) {
            tctx.reader().unknown()
        }
    }
    // check sanity
    if (t.xmlText().length === 0) {
        t.setXmlText(`<sym>metNoteQuarterUp</sym> = ${Math.round(t.tempo() * 60)}`)
        t.setVisible(false)
    } else {
        t.setXmlText(t.xmlText().replaceAll('<sym>unicode', '<sym>met'))
    }

    t.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
}

function readMarker(m: Marker, e: XmlReader, ctx: ReadContext): void {
    const tctx = new TextReaderContext206(e)
    readTextPropertyStyle206(tctx.tag(), ctx, m, m)
    let mt = MarkerType.SEGNO

    while (tctx.reader().readNextStartElement()) {
        const tag = tctx.reader().name()
        if (tag === 'label') {
            const s = tctx.reader().readAsciiText()
            m.setLabel(s)
            mt = TConv.fromXmlMarkerType(s, MarkerType.USER)
        } else if (!readTextProperties206(tctx.reader(), ctx, m)) {
            tctx.reader().unknown()
        }
    }
    m.setMarkerType(mt)
}

function readDynamic(d: Dynamic, e: XmlReader, ctx: ReadContext): void {
    const tctx = new TextReaderContext206(e)
    readTextPropertyStyle206(tctx.tag(), ctx, d, d)
    while (tctx.reader().readNextStartElement()) {
        const tag = tctx.reader().name()
        if (tag === 'subtype') {
            d.setDynamicType(tctx.reader().readText())
        } else if (tag === 'velocity') {
            d.setVelocity(tctx.reader().readInt())
        } else if (tag === 'dynType') {
            d.setVoiceAssignment(Read206.readDynamicRange(tctx.reader().readInt()))
        } else if (tag === 'size') {
            tctx.reader().skipCurrentElement() // C++ skips on the original reader (no-op there)
        } else if (!readTextProperties206(tctx.reader(), ctx, d)) {
            tctx.reader().unknown()
        }
    }
    d.setSize(10.0)
    if (d.xmlText().includes('<sym>') && !d.xmlText().includes('<font')) {
        d.setAlign(new Align(AlignH.HCENTER, AlignV.BASELINE))
    }
}

function readTuplet206(tuplet: Tuplet, e: XmlReader, ctx: ReadContext): void {
    tuplet.setId(e.intAttribute('id', 0))
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'Number') {
            const number = Factory.createItem(ElementType.TEXT, tuplet) as Text
            number.setParent(tuplet)
            number.setComposition(true)
            tuplet.setNumber(number)
            // _number reads property defaults from parent tuplet as "composition" is set:
            tuplet.resetNumberProperty()
            readText206(e, ctx, number, tuplet)
            number.setVisible(tuplet.visible()) //?? override saved property
            number.setColor(tuplet.color())
            number.setTrack(tuplet.track())
            // move property flags from _number
            for (const p of [Pid.FONT_FACE, Pid.FONT_SIZE, Pid.FONT_STYLE, Pid.ALIGN, Pid.SIZE_SPATIUM_DEPENDENT]) {
                tuplet.setPropertyFlags(p, number.propertyFlags(p))
            }
        } else if (!Read206.readTupletProperties206(e, ctx, tuplet)) {
            e.unknown()
        }
    }
    const r = tuplet.ratio().eq(new Fraction(1, 1)) ? tuplet.ratio() : tuplet.ratio().reduced()
    const f = new Fraction(r.denominator(), tuplet.baseLen().fraction().denominator())
    tuplet.setTicks(f.reduced())
}

function readLyrics(lyrics: Lyrics, e: XmlReader, ctx: ReadContext): void {
    let iEndTick = 0 // used for backward compatibility

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'endTick') {
            // store <endTick> tag value until a <ticks> tag has been read
            // which positions this lyrics element in the score
            iEndTick = e.readInt()
        } else if (tag === 'Number') {
            // TODO: add text to main text (C++ reads the verse number and deletes it)
            const verseNumber = Factory.createItem(ElementType.TEXT, lyrics) as Text
            readText206(e, ctx, verseNumber, lyrics)
        } else if (tag === 'style') {
            e.readText() // ignore style
        } else if (!TRead.readLyricsProperties(lyrics, e, ctx)) {
            e.unknown()
        }
    }

    // if any endTick, make it relative to current tick
    if (iEndTick) {
        lyrics.setTicks(Fraction.fromTicks(iEndTick).minus(ctx.tick()))
    }
    lyrics.setAutoplace(true)
    if (!lyrics.isStyled(Pid.OFFSET) && !ctx.pasteMode()) {
        // fix offset for pre-3.1 scores
        // 2.x and earlier: y offset was relative to staff; x offset was relative to center of notehead
        lyrics.setOffset(lyrics.offset().x() - lyrics.symWidth(SymId.noteheadBlack) * 0.5, lyrics.offset().y())
        // temporarily set placement to above, since the original offset is relative to top of staff
        // depend on adjustPlacement() to change the placement if appropriate
        lyrics.setPlacement(PlacementV.ABOVE)
        adjustPlacement(lyrics)
    }
}

//---------------------------------------------------------
//   convertDoubleArticulations
//    Replace double articulations with proper SMuFL
//    symbols which were not available for use prior to 3.0
//---------------------------------------------------------

function convertDoubleArticulations(chord: Chord): void {
    const pairableArticulations: Articulation[] = []
    for (const a of chord.articulations()) {
        if (a.isStaccato() || a.isTenuto() || a.isAccent() || a.isMarcato()) {
            pairableArticulations.push(a)
        }
    }
    if (pairableArticulations.length !== 2) {
        // Do not replace triple articulation if this happens
        return
    }

    let newSymId = SymId.noSym
    for (let i = 0; i < 2; ++i) {
        if (newSymId !== SymId.noSym) {
            break
        }
        const ai = pairableArticulations[i]
        const aj = pairableArticulations[i === 0 ? 1 : 0]
        if (ai.isStaccato()) {
            if (aj.isAccent()) {
                newSymId = SymId.articAccentStaccatoAbove
            } else if (aj.isMarcato()) {
                newSymId = SymId.articMarcatoStaccatoAbove
            } else if (aj.isTenuto()) {
                newSymId = SymId.articTenutoStaccatoAbove
            }
        } else if (ai.isTenuto()) {
            if (aj.isAccent()) {
                newSymId = SymId.articTenutoAccentAbove
            } else if (aj.isMarcato()) {
                newSymId = SymId.articMarcatoTenutoAbove
            }
        }
    }

    if (newSymId !== SymId.noSym) {
        // We reuse old articulation and change symbol ID
        // rather than constructing a new articulation
        // in order to preserve its other properties.
        const newArtic = pairableArticulations[0]
        for (const a of pairableArticulations) {
            chord.remove(a)
        }

        const anchor = newArtic.anchor()
        newArtic.setSymId(newSymId)
        newArtic.setAnchor(anchor)
        chord.add(newArtic)
    }
}

//---------------------------------------------------------
//   fixTies
//---------------------------------------------------------

function fixTies(chord: Chord): void {
    const notes: Note[] = []
    for (const note of chord.notes()) {
        const tie = note.tieBack()
        if (tie && tie.startNote()!.pitch() !== note.pitch()) {
            notes.push(tie.startNote()!)
        }
    }
    for (const note of notes) {
        const endNote = chord.findNote(note.pitch())
        const oldNote = note.tieFor()!.endNote()
        if (oldNote) {
            oldNote.setTieBack(null)
        }
        note.tieFor()!.setEndNote(endNote)
    }
}

function readChord(chord: Chord, e: XmlReader, ctx: ReadContext): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'Note') {
            const note = Factory.createItem(ElementType.NOTE, chord) as Note
            // the note needs to know the properties of the track it belongs to
            note.setTrack(chord.track())
            note.setParent(chord)
            readNote206(note, e, ctx)
            chord.add(note)
        } else if (tag === 'Stem') {
            const stem = Factory.createItem(ElementType.STEM, chord) as Stem
            while (e.readNextStartElement()) {
                const t = e.name()
                if (t === 'subtype') { // obsolete
                    e.skipCurrentElement()
                } else if (TRead.readPropertyIfTag(stem, t, e, ctx, Pid.USER_LEN)) {
                } else if (TRead.readStyledProperty(stem, t, e, ctx)) {
                } else if (!TRead.readItemProperties(stem, e, ctx)) {
                    e.unknown()
                }
            }
            chord.add(stem)
        } else if (tag === 'Lyrics') {
            const lyrics = Factory.createItem(ElementType.LYRICS, chord) as Lyrics
            lyrics.setTrack(ctx.track())
            readLyrics(lyrics, e, ctx)
            chord.add(lyrics)
        } else if (Read206.readChordProperties206(e, ctx, chord)) {
        } else {
            e.unknown()
        }
    }
    convertDoubleArticulations(chord)
    fixTies(chord)
}

function readRest(rest: Rest, e: XmlReader, ctx: ReadContext): void {
    while (e.readNextStartElement()) {
        if (!Read206.readChordRestProperties206(e, ctx, rest)) {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readTextLineProperties
//---------------------------------------------------------

function readTextLineProperties(e: XmlReader, ctx: ReadContext, tl: TextLineBase): boolean {
    const tag = e.name()

    if (tag === 'beginText') {
        const text = Factory.createItem(ElementType.TEXT, scoreDummy(ctx.score())) as Text
        readText206(e, ctx, text, tl)
        tl.setBeginText(text.xmlText())
        tl.setPropertyFlags(Pid.BEGIN_TEXT, PropertyFlags.UNSTYLED)
    } else if (tag === 'continueText') {
        const text = Factory.createItem(ElementType.TEXT, scoreDummy(ctx.score())) as Text
        readText206(e, ctx, text, tl)
        tl.setContinueText(text.xmlText())
        tl.setPropertyFlags(Pid.CONTINUE_TEXT, PropertyFlags.UNSTYLED)
    } else if (tag === 'endText') {
        const text = Factory.createItem(ElementType.TEXT, scoreDummy(ctx.score())) as Text
        readText206(e, ctx, text, tl)
        tl.setEndText(text.xmlText())
        tl.setPropertyFlags(Pid.END_TEXT, PropertyFlags.UNSTYLED)
    } else if (tag === 'beginHook') {
        tl.setBeginHookType(e.readBool() ? HookType.HOOK_90 : HookType.NONE)
    } else if (tag === 'endHook') {
        tl.setEndHookType(e.readBool() ? HookType.HOOK_90 : HookType.NONE)
    } else if (tag === 'beginHookType') {
        tl.setBeginHookType(e.readInt() === 0 ? HookType.HOOK_90 : HookType.HOOK_45)
    } else if (tag === 'endHookType') {
        tl.setEndHookType(e.readInt() === 0 ? HookType.HOOK_90 : HookType.HOOK_45)
    } else if (!TRead.readTextLineBaseProperties(tl, e, ctx)) {
        return false
    }

    return true
}

function readVolta206(e: XmlReader, ctx: ReadContext, volta: Volta): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'endings') {
            const s = e.readText()
            const sl = s.split(',').filter(l => l.length)
            const endings: number[] = []
            for (const l of sl) {
                endings.push(parseInt(l.trim(), 10) || 0)
            }
            volta.setEndings(endings)
        } else if (tag === 'lineWidth') {
            volta.setLineWidth(new Spatium(e.readDouble()))
        } else if (!readTextLineProperties(e, ctx, volta)) {
            e.unknown()
        }
    }
    if (volta.anchor() !== Volta.VOLTA_ANCHOR) {
        // Volta strictly assumes that its anchor is measure, so don't let old scores override this.
        volta.setAnchor(Volta.VOLTA_ANCHOR)
    }
    CompatUtils.resetHookHeightSign(volta)
    adjustPlacement(volta)
}

function readPedal(e: XmlReader, ctx: ReadContext, pedal: Pedal): void {
    let beginTextTag = false
    let continueTextTag = false
    let endTextTag = false

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (readTextLineProperties(e, ctx, pedal)) {
            beginTextTag = beginTextTag || tag === 'beginText'
            continueTextTag = continueTextTag || tag === 'continueText'
            endTextTag = endTextTag || tag === 'endText'
        } else {
            e.unknown()
        }
    }

    // Set to the 206 defaults if no value was specified;
    // or follow the new style setting if the specified value matches it
    if (!beginTextTag) {
        pedal.setBeginText('')
        pedal.setPropertyFlags(Pid.BEGIN_TEXT, PropertyFlags.UNSTYLED)
    } else if (pedal.beginText() === pedal.propertyDefault(Pid.BEGIN_TEXT)) {
        pedal.setPropertyFlags(Pid.BEGIN_TEXT, PropertyFlags.STYLED)
    }
    if (!continueTextTag) {
        pedal.setContinueText('')
        pedal.setPropertyFlags(Pid.CONTINUE_TEXT, PropertyFlags.UNSTYLED)
    } else if (pedal.continueText() === pedal.propertyDefault(Pid.CONTINUE_TEXT)) {
        pedal.setPropertyFlags(Pid.CONTINUE_TEXT, PropertyFlags.STYLED)
    }
    if (!endTextTag) {
        pedal.setEndText('')
        pedal.setPropertyFlags(Pid.END_TEXT, PropertyFlags.UNSTYLED)
    } else if (pedal.endText() === pedal.propertyDefault(Pid.END_TEXT)) {
        pedal.setPropertyFlags(Pid.END_TEXT, PropertyFlags.STYLED)
    }

    CompatUtils.resetHookHeightSign(pedal)
    adjustPlacement(pedal)
}

function readOttava(e: XmlReader, ctx: ReadContext, ottava: Ottava): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'subtype') {
            const s = e.readText()
            let idx = /^-?\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN
            if (Number.isNaN(idx)) {
                idx = 0 // OttavaType::OTTAVA_8VA;
                const names = ['8va', '8vb', '15ma', '15mb', '22ma', '22mb']
                const i = names.indexOf(s)
                if (i >= 0) {
                    idx = i
                }
            }
            ottava.setOttavaType(idx as OttavaType)
        } else if (tag === 'numbersOnly') {
            ottava.setNumbersOnly(e.readBool())
        } else if (!readTextLineProperties(e, ctx, ottava)) {
            e.unknown()
        }
    }
    ottava.styleChanged()
    CompatUtils.resetHookHeightSign(ottava)
    adjustPlacement(ottava)
}

//---------------------------------------------------------
//   setFermataPlacement
//    set fermata placement from old ArticulationAnchor
//    for backwards compatibility
//---------------------------------------------------------

function setFermataPlacement(el: EngravingItem, anchor: ArticulationAnchor, direction: DirectionV): void {
    if (direction === DirectionV.UP) {
        el.setPlacement(PlacementV.ABOVE)
    } else if (direction === DirectionV.DOWN) {
        el.setPlacement(PlacementV.BELOW)
    } else {
        switch (anchor) {
        case ArticulationAnchor.TOP:
            el.setPlacement(PlacementV.ABOVE)
            break
        case ArticulationAnchor.BOTTOM:
            el.setPlacement(PlacementV.BELOW)
            break
        case ArticulationAnchor.AUTO:
        default:
            break
        }
    }
}

//---------------------------------------------------------
//   readSlurTieProperties
//---------------------------------------------------------

function readSlurTieProperties(e: XmlReader, ctx: ReadContext, st: SlurTie): boolean {
    const tag = e.name()

    if (TRead.readPropertyIfTag(st, tag, e, ctx, Pid.SLUR_DIRECTION)) {
    } else if (tag === 'lineType') {
        st.setStyleType(e.readInt() as SlurStyleType)
    } else if (tag === 'SlurSegment') {
        const s: SlurTieSegment = st.newSlurTieSegment(scoreDummy(ctx.score()).system())
        TRead.readSlurTieSegment(s, e, ctx)
        st.add(s)
    } else if (!TRead.readItemProperties(st, e, ctx)) {
        return false
    }
    return true
}

//---------------------------------------------------------
//   readMeasure
//---------------------------------------------------------

function readMeasure206(m: Measure, staffIdx: number, e: XmlReader, ctx: ReadContext): void {
    let segment: Segment | null = null

    const graceNotes: Chord[] = []
    ctx.tuplets().clear()
    ctx.setTrack(staffIdx * VOICES)

    m.createStaves(staffIdx)

    // tick is obsolete
    if (e.hasAttribute('tick')) {
        ctx.setTick(Fraction.fromTicks(ctx.fileDivision(e.intAttribute('tick'))))
    }

    let irregular: boolean
    if (e.hasAttribute('len')) {
        const sl = e.attribute('len').split('/')
        if (sl.length === 2) {
            m.setTicks(new Fraction(parseInt(sl[0], 10) || 0, parseInt(sl[1], 10) || 0))
        }
        irregular = true
    } else {
        irregular = false
    }

    const staff = ctx.staff(staffIdx)!
    let timeStretch = staff.timeStretch(m.tick())

    // keep track of tick of previous element
    // this allows markings that need to apply to previous element to do so
    // even though we may have already advanced to next tick position
    let lastTick = ctx.tick()

    while (e.readNextStartElement()) {
        const tag = e.name()

        if (tag === 'move') {
            ctx.setTick(e.readFraction().plus(m.tick()))
        } else if (tag === 'tick') {
            ctx.setTick(Fraction.fromTicks(ctx.fileDivision(e.readInt())))
            lastTick = ctx.tick()
        } else if (tag === 'BarLine') {
            let fermataAbove: Fermata | null = null
            let fermataBelow: Fermata | null = null
            const bl = Factory.createItem(ElementType.BAR_LINE, scoreDummy(ctx.score()).segment()) as BarLine
            bl.setTrack(ctx.track())
            while (e.readNextStartElement()) {
                const t = e.name()
                if (t === 'subtype') {
                    bl.setBarLineType(TConv.fromXmlBarLineType(e.readAsciiText(), BarLineType.NORMAL))
                } else if (t === 'customSubtype') { // obsolete
                    e.readInt()
                } else if (t === 'span') {
                    const span = e.readInt()
                    ctx.setBarLineSpan(bl, span > 0 ? span - 1 : 0)
                } else if (t === 'spanFromOffset') {
                    bl.setSpanFrom(e.readInt())
                } else if (t === 'spanToOffset') {
                    bl.setSpanTo(e.readInt())
                } else if (t === 'Articulation') {
                    const el = Read206.readArticulation(bl, e, ctx)
                    if (el.isFermata()) {
                        if (el.placement() === PlacementV.ABOVE) {
                            fermataAbove = el as Fermata
                        } else {
                            fermataBelow = el as Fermata
                            const barLineSpan = ctx.getBarLineSpan(bl)
                            if (barLineSpan !== null) {
                                fermataBelow.setTrack(staff2track(bl.staffIdx() + barLineSpan))
                            } else {
                                fermataBelow.setTrack(staff2track(bl.staffIdx() + ctx.getStaffBarLineSpan(staffIdx)))
                            }
                        }
                    } else {
                        bl.add(el)
                    }
                } else if (!TRead.readItemProperties(bl, e, ctx)) {
                    e.unknown()
                }
            }
            //
            //  StartRepeatBarLine: always at the beginning tick of a measure, always BarLineType::START_REPEAT
            //  BarLine:            in the middle of a measure, has no semantic
            //  EndBarLine:         at the end tick of a measure
            //  BeginBarLine:       first segment of a measure

            let st: SegmentType
            if (!ctx.tick().eq(m.tick()) && !ctx.tick().eq(m.endTick())) {
                st = SegmentType.BarLine
            } else if (bl.barLineType() === BarLineType.START_REPEAT && ctx.tick().eq(m.tick())) {
                st = SegmentType.StartRepeatBarLine
            } else if (ctx.tick().eq(m.tick()) && segment === null) {
                st = SegmentType.BeginBarLine
            } else {
                st = SegmentType.EndBarLine
            }
            segment = m.getSegment(st, ctx.tick())
            segment.add(bl)
            if (fermataAbove) {
                segment.add(fermataAbove)
            }
            if (fermataBelow) {
                segment.add(fermataBelow)
            }
        } else if (tag === 'Chord') {
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const chord = Factory.createItem(ElementType.CHORD, segment) as Chord
            chord.setTrack(ctx.track())
            chord.setParent(segment)
            readChord(chord, e, ctx)
            if (chord.noteType() !== NoteType.NORMAL) {
                graceNotes.push(chord)
            } else {
                segment.add(chord)
                for (let i = 0; i < graceNotes.length; ++i) {
                    const gc = graceNotes[i]
                    gc.setGraceIndex(i)
                    chord.add(gc)
                }
                graceNotes.length = 0
                const crticks = chord.actualTicks()
                lastTick = ctx.tick()
                ctx.incTick(crticks)
            }
        } else if (tag === 'Rest') {
            if (m.isMMRest()) {
                segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
                const mmr = Factory.createItem(ElementType.MMREST, segment) as MMRest
                mmr.setParent(segment)
                mmr.setTrack(ctx.track())
                TRead.readItem(mmr, e, ctx)
                mmr.setTicks(m.ticks())
                segment.add(mmr)
                lastTick = ctx.tick()
                ctx.incTick(mmr.actualTicks())
            } else {
                segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
                const rest = Factory.createItem(ElementType.REST, segment) as Rest
                rest.setDurationType(DurationType.V_MEASURE)
                rest.setTicks(m.timesig().div(timeStretch))
                rest.setTrack(ctx.track())
                rest.setParent(segment)
                readRest(rest, e, ctx)
                segment.add(rest)

                if (!rest.ticks().isValid()) { // hack
                    rest.setTicks(m.timesig().div(timeStretch))
                }

                lastTick = ctx.tick()
                ctx.incTick(rest.actualTicks())
            }
        } else if (tag === 'Breath') {
            const breath = Factory.createItem(ElementType.BREATH, scoreDummy(ctx.score()).segment()) as Breath
            breath.setTrack(ctx.track())
            breath.setPlacement(PlacementV.ABOVE)
            let tick = ctx.tick()
            TRead.readBreath(breath, e, ctx)
            // older scores placed the breath segment right after the chord to which it applies
            // rather than before the next chordrest segment with an element for the staff
            // result would be layout too far left if there are other segments due to notes in other staves
            // we need to find tick of chord to which this applies, and add its duration
            let prevTick: Fraction
            if (ctx.tick().lt(tick)) {
                prevTick = ctx.tick() // use our own tick if we explicitly reset to earlier position
            } else {
                prevTick = lastTick // otherwise use tick of previous tick/chord/rest tag
            }
            // find segment
            const prev = m.findSegment(SegmentType.ChordRest, prevTick)
            if (prev) {
                // find chordrest
                const lastCR = prev.element(ctx.track()) as ChordRest | null
                if (lastCR) {
                    tick = prevTick.plus(lastCR.actualTicks())
                }
            }
            segment = m.getSegment(SegmentType.Breath, tick)
            segment.add(breath)
        } else if (tag === 'endSpanner') {
            const id = parseInt(e.attribute('id'), 10) || 0
            const spanner = ctx.findSpanner(id)
            if (spanner) {
                spanner.setTicks(ctx.tick().minus(spanner.tick()))
                // if (spanner->track2() == -1)
                // the absence of a track tag [?] means the
                // track is the same as the beginning of the slur
                if (spanner.track2() === -1) {
                    spanner.setTrack2(spanner.track() ? spanner.track() : ctx.track())
                }
            } else {
                // remember "endSpanner" values
                ctx.addSpannerValues({ spannerId: id, track2: ctx.track(), tick2: ctx.tick() })
            }
            e.readNext()
        } else if (tag === 'Slur') {
            const sl = Factory.createItem(ElementType.SLUR, scoreDummy(ctx.score())) as Slur
            sl.setTick(ctx.tick())
            Read206.readSlur206(e, ctx, sl)
            //
            // check if we already saw "endSpanner"
            //
            const id = ctx.spannerId(sl)
            const sv = ctx.spannerValues(id)
            if (sv) {
                sl.setTick2(sv.tick2)
                sl.setTrack2(sv.track2)
            }
            ctx.addSpannerToScore(sl)
        } else if (tag === 'HairPin' || tag === 'Pedal' || tag === 'Ottava' || tag === 'Trill' || tag === 'TextLine'
                   || tag === 'Volta') {
            const sp = Factory.createItemByName(tag, scoreDummy(ctx.score())) as Spanner
            sp.setTrack(ctx.track())
            sp.setTrack2(sp.track())
            sp.setTick(ctx.tick())
            sp.eraseSpannerSegments()
            ctx.addSpanner(e.intAttribute('id', -1), sp)

            if (tag === 'Volta') {
                readVolta206(e, ctx, sp as Volta)
            } else if (tag === 'Pedal') {
                readPedal(e, ctx, sp as Pedal)
            } else if (tag === 'Ottava') {
                readOttava(e, ctx, sp as Ottava)
            } else if (tag === 'HairPin') {
                Read206.readHairpin206(e, ctx, sp as Hairpin)
            } else if (tag === 'Trill') {
                const ornament = Factory.createItem(ElementType.ORNAMENT, scoreDummy(m.score()).chord()) as Ornament;
                (sp as Trill).setOrnament(ornament)
                Read206.readTrill206(e, ctx, sp as Trill)
            } else {
                Read206.readTextLine206(e, ctx, sp as TextLineBase)
            }
            ctx.addSpannerToScore(sp)
            //
            // check if we already saw "endSpanner"
            //
            const id = ctx.spannerId(sp)
            const sv = ctx.spannerValues(id)
            if (sv) {
                sp.setTicks(sv.tick2.minus(sp.tick()))
                sp.setTrack2(sv.track2)
            }
        } else if (tag === 'RepeatMeasure') {
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const rm = Factory.createItem(ElementType.MEASURE_REPEAT, segment) as MeasureRepeat
            rm.setTrack(ctx.track())
            readRest(rm, e, ctx)
            rm.setNumMeasures(1)
            m.setMeasureRepeatCount(1, staffIdx)
            segment.add(rm)
            lastTick = ctx.tick()
            ctx.incTick(m.ticks())
        } else if (tag === 'Clef') {
            const clef = Factory.createItem(ElementType.CLEF, scoreDummy(ctx.score()).segment()) as Clef
            clef.setTrack(ctx.track())
            TRead.readClef(clef, e, ctx)
            clef.setGenerated(false)
            if (ctx.tick().isZero()) {
                if (ctx.staff(staffIdx)!.clef(new Fraction(0, 1)) !== clef.clefType()) {
                    ctx.staff(staffIdx)!.setDefaultClefType(clef.clefTypeList())
                }
                continue
            }
            // there may be more than one clef segment for same tick position
            if (!segment) {
                // this is the first segment of measure
                segment = m.getSegment(SegmentType.Clef, ctx.tick())
            } else {
                let firstSegment = false
                // the first clef may be missing and is added later in layout
                for (let s = m.segments().first(); s && s.tick().eq(ctx.tick()); s = s.next()) {
                    if (s.segmentType() === SegmentType.Clef
                        // hack: there may be other segment types which should
                        // generate a clef at current position
                        || s.segmentType() === SegmentType.StartRepeatBarLine) {
                        firstSegment = true
                        break
                    }
                }
                if (firstSegment) {
                    let ns: Segment | null = null
                    if (segment.next()) {
                        ns = segment.next()
                        while (ns && ns.tick().lt(ctx.tick())) {
                            ns = ns.next()
                        }
                    }
                    segment = null
                    for (let s: Segment | null = ns; s && s.tick().eq(ctx.tick()); s = s.next()) {
                        if (s.segmentType() === SegmentType.Clef) {
                            segment = s
                            break
                        }
                    }
                    if (!segment) {
                        const cs = new Segment(m, SegmentType.Clef, ctx.tick().minus(m.tick()))
                        m.segments().insert(cs, ns)
                        segment = cs
                    }
                } else {
                    // this is the first clef: move to left
                    segment = m.getSegment(SegmentType.Clef, ctx.tick())
                }
            }
            if (!ctx.tick().eq(m.tick())) {
                clef.setSmall(true) // TODO: layout does this ?
            }

            // Clef segments are sorted on layout now.  Previously, clef barline position could be out of sync with segment placement.
            if (!ctx.tick().isZero() && ctx.tick().eq(m.tick()) && !(m.prevMeasure() && m.prevMeasure()!.repeatEnd())) {
                clef.setClefToBarlinePosition(ClefToBarlinePosition.AFTER)
            }

            segment.add(clef)
        } else if (tag === 'TimeSig') {
            const ts = Factory.createItem(ElementType.TIMESIG, scoreDummy(ctx.score()).segment()) as TimeSig
            ts.setTrack(ctx.track())
            TRead.readTimeSig(ts, e, ctx)
            // if time sig not at beginning of measure => courtesy time sig
            const currTick = ctx.tick()
            const courtesySig = currTick.gt(m.tick())
            if (courtesySig) {
                // if courtesy sig., just add it without map processing
                segment = m.getSegment(SegmentType.TimeSigAnnounce, currTick)
                segment.add(ts)
            } else {
                // if 'real' time sig., do full process
                segment = m.getSegment(SegmentType.TimeSig, currTick)
                segment.add(ts)

                timeStretch = ts.stretch().reduced()
                m.setTimesig(ts.sig().div(timeStretch))

                if (!irregular) {
                    m.setTicks(m.timesig())
                }
                // TODO(port): ctx.compatTimeSigMap()
            }
        } else if (tag === 'KeySig') {
            const ks = Factory.createItem(ElementType.KEYSIG, scoreDummy(ctx.score()).segment()) as KeySig
            ks.setTrack(ctx.track())
            TRead.readKeySig(ks, e, ctx)
            const curTick = ctx.tick()
            // if key sig not at beginning of measure => courtesy key sig
            const courtesySig = curTick.eq(m.endTick())
            segment = m.getSegment(courtesySig ? SegmentType.KeySigAnnounce : SegmentType.KeySig, curTick)
            segment.add(ks)
            if (!courtesySig) {
                staff.setKey(curTick, ks.keySigEvent())
            }
        } else if (tag === 'Text' || tag === 'StaffText') {
            // MuseScore 3 has different types for system text and
            // staff text while MuseScore 2 didn't.
            // We need to decide first which one we should create.
            const tctx = new TextReaderContext206(e)
            const styleName = readStyleName206(tctx.tag())
            let t: StaffTextBase
            if (styleName === 'System' || styleName === 'Tempo' || styleName === 'Marker' || styleName === 'Jump'
                || styleName === 'Volta') { // TODO: is it possible to get it from style?
                t = Factory.createItem(ElementType.SYSTEM_TEXT, scoreDummy(ctx.score()).segment()) as StaffTextBase
            } else {
                t = Factory.createItem(ElementType.STAFF_TEXT, scoreDummy(ctx.score()).segment()) as StaffTextBase
            }
            t.setTrack(ctx.track())
            readTextPropertyStyle206(tctx.tag(), ctx, t, t)
            while (tctx.reader().readNextStartElement()) {
                if (!readTextProperties206(tctx.reader(), ctx, t)) {
                    tctx.reader().unknown()
                }
            }
            if (!t.empty()) {
                segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
                segment.add(t)
            }
        } else if (tag === 'Dynamic') {
            //----------------------------------------------------
            // Annotation
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const dyn = Factory.createItem(ElementType.DYNAMIC, segment) as Dynamic
            dyn.setTrack(ctx.track())
            readDynamic(dyn, e, ctx)
            segment.add(dyn)
        } else if (tag === 'RehearsalMark') {
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const el = Factory.createItem(ElementType.REHEARSAL_MARK, segment) as RehearsalMark
            el.setTrack(ctx.track())
            readText206(e, ctx, el, el)
            segment.add(el)
        } else if (tag === 'Harmony' || tag === 'FretDiagram' || tag === 'TremoloBar' || tag === 'Symbol'
                   || tag === 'InstrumentChange' || tag === 'StaffState' || tag === 'FiguredBass') {
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const el = Factory.createItemByName(tag, segment)
            if (!el) {
                e.skipCurrentElement() // TODO(port): element type not ported yet
                continue
            }
            // hack - needed because tick tags are unreliable in 1.3 scores
            // for symbols attached to anything but a measure
            el.setTrack(ctx.track())
            TRead.readItem(el, e, ctx)
            if (el.staff() && (el.isHarmony() || el.isFretDiagram() || el.isInstrumentChange())) {
                adjustPlacement(el)
            }

            segment.add(el)
        } else if (tag === 'Tempo') {
            segment = m.getSegment(SegmentType.ChordRest, ctx.tick())
            const tt = Factory.createItem(ElementType.TEMPO_TEXT, segment) as TempoText
            // hack - needed because tick tags are unreliable in 1.3 scores
            // for symbols attached to anything but a measure
            tt.setTrack(ctx.track())
            readTempoText(tt, e, ctx)
            segment.add(tt)
        } else if (tag === 'Marker' || tag === 'Jump') {
            const el = Factory.createItemByName(tag, scoreDummy(ctx.score()))!
            el.setTrack(ctx.track())
            if (tag === 'Marker') {
                readMarker(el as Marker, e, ctx)
                m.add(el)
            } else {
                TRead.readItem(el, e, ctx)
                m.add(el)
            }
        } else if (tag === 'Image') {
            e.skipCurrentElement() // TODO(port): images
        } else if (tag === 'stretch') {
            // Ignore measure stretch pre 4.0
            e.skipCurrentElement()
        } else if (tag === 'noOffset') {
            m.setNoOffset(e.readInt())
        } else if (tag === 'measureNumberMode') {
            m.setMeasureNumberMode(e.readInt() as MeasureNumberMode)
        } else if (tag === 'irregular') {
            m.setIrregular(e.readBool())
        } else if (tag === 'breakMultiMeasureRest') {
            m.setBreakMultiMeasureRest(e.readBool())
        } else if (tag === 'sysInitBarLineType') {
            segment = m.getSegment(SegmentType.BeginBarLine, m.tick())
            const barLine = Factory.createItem(ElementType.BAR_LINE, segment) as BarLine
            barLine.setTrack(ctx.track())
            barLine.setBarLineType(TConv.fromXmlBarLineType(e.readAsciiText(), BarLineType.NORMAL))
            segment.add(barLine)
        } else if (tag === 'Tuplet') {
            const tuplet = Factory.createItem(ElementType.TUPLET, m) as Tuplet
            tuplet.setTrack(ctx.track())
            tuplet.setTick(ctx.tick())
            tuplet.setParent(m)
            readTuplet206(tuplet, e, ctx)
            ctx.addTuplet(tuplet)
        } else if (tag === 'startRepeat') {
            m.setRepeatStart(true)
            e.readNext()
        } else if (tag === 'endRepeat') {
            m.setRepeatCount(e.readInt())
            m.setRepeatEnd(true)
        } else if (tag === 'vspacer' || tag === 'vspacerDown') {
            if (!m.vspacerDown(staffIdx)) {
                const spacer = Factory.createItem(ElementType.SPACER, m) as Spacer
                spacer.setSpacerType(SpacerType.DOWN)
                spacer.setTrack(staffIdx * VOICES)
                m.add(spacer)
            }
            m.vspacerDown(staffIdx)!.setGap(new Spatium(e.readDouble()))
        } else if (tag === 'vspacerUp') {
            if (!m.vspacerUp(staffIdx)) {
                const spacer = Factory.createItem(ElementType.SPACER, m) as Spacer
                spacer.setSpacerType(SpacerType.UP)
                spacer.setTrack(staffIdx * VOICES)
                m.add(spacer)
            }
            m.vspacerUp(staffIdx)!.setGap(new Spatium(e.readDouble()))
        } else if (tag === 'visible') {
            m.setStaffVisible(staffIdx, e.readInt() !== 0)
        } else if (tag === 'slashStyle') {
            m.setStaffStemless(staffIdx, e.readInt() !== 0)
        } else if (tag === 'Beam') {
            const beam = Factory.createItem(ElementType.BEAM, scoreDummy(ctx.score()).system()) as Beam
            beam.setTrack(ctx.track())
            beam.setId(e.intAttribute('id')) // read400 TRead::read(Beam*)
            TRead.readBeam(beam, e, ctx)
            beam.resetExplicitParent()
            ctx.addBeam(beam)
        } else if (tag === 'Segment') {
            if (segment) {
                TRead.readSegment(segment, e, ctx)
            } else {
                e.unknown()
            }
        } else if (tag === 'MeasureNumber') {
            const noText = new MeasureNumber(m)
            readText206(e, ctx, noText, m)
            noText.setTrack(ctx.track())
            noText.setParent(m)
            m.setMeasureNumber(noText.staffIdx(), noText)
        } else if (tag === 'SystemDivider') {
            e.skipCurrentElement() // TODO(port): system dividers
        } else if (tag === 'Ambitus') {
            segment = m.getSegment(SegmentType.Ambitus, ctx.tick())
            const range = Factory.createItem(ElementType.AMBITUS, segment) as Ambitus
            readAmbitus(range, e, ctx)
            range.setParent(segment) // a parent segment is needed for setTrack() to work
            range.setTrack(trackZeroVoice(ctx.track()))
            segment.add(range)
        } else if (tag === 'multiMeasureRest') {
            m.setMMRestCount(e.readInt())
            // set tick to previous measure
            m.setTick(ctx.lastMeasure()!.tick())
            ctx.setTick(ctx.lastMeasure()!.tick())
        } else if (TRead.readMeasureBaseProperties(m as MeasureBase, e, ctx)) {
        } else {
            e.unknown()
        }
    }
    ctx.checkTuplets()
    m.connectTremolo()
}

//---------------------------------------------------------
//   readBox
//---------------------------------------------------------

function readBox(b: Box, e: XmlReader, ctx: ReadContext): void {
    b.setAutoSizeEnabled(false) // didn't exist in Mu2

    b.setBoxHeight(new Spatium(0)) // override default set in constructor
    b.setBoxWidth(new Spatium(0))

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'HBox') {
            const hb = Factory.createItem(ElementType.HBOX, scoreDummy(b.score()).system()) as Box
            TRead.readItem(hb, e, ctx)
            b.add(hb)
        } else if (tag === 'VBox') {
            const vb = Factory.createItem(ElementType.VBOX, scoreDummy(b.score()).system()) as Box
            TRead.readItem(vb, e, ctx)
            b.add(vb)
        } else if (tag === 'Text') {
            let t: Text
            if (b.isTBox()) {
                t = (b as TBox).text()
                readText206(e, ctx, t, t)
            } else {
                t = Factory.createItem(ElementType.TEXT, b) as Text
                readText206(e, ctx, t, t)
                if (!t.empty()) {
                    b.add(t)
                }
            }
        } else if (!TRead.readBoxProperties(b, e, ctx)) {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readStaffContent
//---------------------------------------------------------

function readStaffContent206(score: Score, e: XmlReader, ctx: ReadContext): void {
    const staff = e.intAttribute('id', 1) - 1
    ctx.setTick(new Fraction(0, 1))
    ctx.setTrack(staff * VOICES)
    let lastReadBox: Box | null = null
    let readMeasureLast = false

    if (staff === 0) {
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'Measure') {
                if (lastReadBox) {
                    lastReadBox.setBottomGap(new Spatium(lastReadBox.bottomGap().val()
                        + (lastReadBox.propertyDefault(Pid.BOTTOM_GAP) as Spatium).val()))
                    lastReadBox = null
                }
                readMeasureLast = true

                const measure = Factory.createItem(ElementType.MEASURE, score) as Measure
                measure.setTick(ctx.tick())
                //
                // inherit timesig from previous measure
                //
                const m = ctx.lastMeasure() // measure->prevMeasure();
                const f = m ? m.timesig() : new Fraction(4, 4)
                measure.setTicks(f)
                measure.setTimesig(f)

                readMeasure206(measure, staff, e, ctx)
                measure.checkMeasure(staff)
                if (!measure.isMMRest()) {
                    score.measures().append(measure)
                    if (m && m.mmRest()) {
                        m.mmRest()!.setNext(measure)
                    }
                    ctx.setLastMeasure(measure)
                    ctx.setTick(measure.endTick())
                } else {
                    // this is a multi measure rest
                    // always preceded by the first measure it replaces
                    const lm = ctx.lastMeasure()

                    if (lm) {
                        lm.setMMRest(measure)
                        measure.setTick(lm.tick())
                        measure.setPrev(lm.prev())
                    }
                }
            } else if (tag === 'HBox' || tag === 'VBox' || tag === 'TBox' || tag === 'FBox') {
                const b = Factory.createItemByName(tag, scoreDummy(score)) as Box | null
                if (!b) {
                    e.skipCurrentElement()
                    continue
                }
                readBox(b, e, ctx)
                b.setTick(ctx.tick())
                score.measures().append(b)

                // If it's the first box, and comes before any measures, reset to
                // 301 default.
                if (!readMeasureLast && !lastReadBox) {
                    b.setTopGap(b.propertyDefault(Pid.TOP_GAP) as Spatium)
                    b.setPropertyFlags(Pid.TOP_GAP, PropertyFlags.STYLED)
                } else if (readMeasureLast) {
                    b.setTopGap(new Spatium(b.topGap().val() + (b.propertyDefault(Pid.TOP_GAP) as Spatium).val()))
                }

                lastReadBox = b
                readMeasureLast = false
            } else if (tag === 'tick') {
                ctx.setTick(Fraction.fromTicks(score.fileDivision(e.readInt())))
            } else {
                e.unknown()
            }
        }
    } else {
        let measure = score.firstMeasure()
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'Measure') {
                if (!measure) {
                    measure = Factory.createItem(ElementType.MEASURE, score) as Measure
                    measure.setTick(ctx.tick())
                    score.measures().append(measure)
                }
                ctx.setTick(measure.tick())
                readMeasure206(measure, staff, e, ctx)
                measure.checkMeasure(staff)
                if (measure.isMMRest()) {
                    measure = ctx.lastMeasure()!.nextMeasure()
                } else {
                    ctx.setLastMeasure(measure)
                    if (measure.mmRest()) {
                        measure = measure.mmRest()
                    } else {
                        measure = measure.nextMeasure()
                    }
                }
            } else if (tag === 'tick') {
                ctx.setTick(Fraction.fromTicks(score.fileDivision(e.readInt())))
            } else {
                e.unknown()
            }
        }
    }
}

//---------------------------------------------------------
//   readStyle
//---------------------------------------------------------

function readStyle206(style: MStyle, e: XmlReader, ctx: ReadContext, readChordListHook: ReadChordListHook): void {
    excessTextStyles206 = new Map()
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'TextStyle') {
            Read206.readTextStyle206(style, e, ctx, excessTextStyles206)
        } else if (tag === 'Spatium') {
            style.set(Sid.spatium, e.readDouble() * DPMM)
        } else if (tag === 'page-layout') {
            readPageFormat206(style, e)
        } else if (tag === 'displayInConcertPitch') {
            style.set(Sid.concertPitch, e.readInt() !== 0)
        } else if (tag === 'pedalY') {
            const y = e.readDouble()
            style.set(Sid.pedalPosBelow, new PointF(0.0, y))
        } else if (tag === 'lyricsDistance') {
            const y = e.readDouble()
            style.set(Sid.lyricsPosBelow, new PointF(0.0, y))
        } else if (tag === 'lyricsMinBottomDistance') {
            // no longer meaningful since it is now measured from skyline rather than staff
            e.skipCurrentElement()
        } else if (tag === 'ottavaHook') {
            const y = Math.abs(e.readDouble())
            style.set(Sid.ottavaHookAbove, y)
            style.set(Sid.ottavaHookBelow, -y)
        } else if (tag === 'endBarDistance') {
            let d = e.readDouble()
            d += style.styleD(Sid.barWidth)
            d += style.styleD(Sid.endBarWidth)
            style.set(Sid.endBarDistance, d)
        } else if (tag === 'ChordList') {
            readChordListHook.read(e)
        } else if (tag === 'harmonyY') {
            const val = -e.readDouble()
            if (val > 0.0) {
                style.set(Sid.harmonyPlacement, PlacementV.BELOW)
                style.set(Sid.chordSymbolAPosBelow, new PointF(0.0, val))
            } else {
                style.set(Sid.harmonyPlacement, PlacementV.ABOVE)
                style.set(Sid.chordSymbolAPosBelow, new PointF(0.0, val))
            }
        } else if (tag === 'useStandardNoteNames') { // These settings were collapsed into one enum in 4.6
            if (e.readBool()) {
                style.set(Sid.chordSymbolSpelling, NoteSpellingType.STANDARD)
            }
        } else if (tag === 'useGermanNoteNames') {
            if (e.readBool()) {
                style.set(Sid.chordSymbolSpelling, NoteSpellingType.GERMAN)
            }
        } else if (tag === 'useFullGermanNoteNames') {
            if (e.readBool()) {
                style.set(Sid.chordSymbolSpelling, NoteSpellingType.GERMAN_PURE)
            }
        } else if (tag === 'useSolfeggioNoteNames') {
            if (e.readBool()) {
                style.set(Sid.chordSymbolSpelling, NoteSpellingType.SOLFEGGIO)
            }
        } else if (tag === 'useFrenchNoteNames') {
            if (e.readBool()) {
                style.set(Sid.chordSymbolSpelling, NoteSpellingType.FRENCH)
            }
        } else {
            if (!style.readProperties(e)) {
                e.skipCurrentElement()
            }
        }
    }

    readChordListHook.validate()
}

/** read114 Read114::setBarLineSpanToStaves */
function setBarLineSpanToStaves(score: Score, ctx: ReadContext): void {
    const numStaves = score.nstaves()
    let barLineSpan = 0
    for (const s of score.staves()) {
        const staffIdx = s.idx()
        const maxSpan = numStaves - staffIdx - 1

        let staffBarLineSpan = ctx.getStaffBarLineSpan(staffIdx)
        if (staffBarLineSpan > maxSpan) {
            staffBarLineSpan = maxSpan
        }

        barLineSpan = Math.max(barLineSpan, staffBarLineSpan)
        if (barLineSpan === 0) {
            s.setProperty(Pid.STAFF_BARLINE_SPAN, false)
            continue
        }
        --barLineSpan

        s.setProperty(Pid.STAFF_BARLINE_SPAN, true)
    }
}
