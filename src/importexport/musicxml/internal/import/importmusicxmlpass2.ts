/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxmlpass2.h/.cpp
 *
 * The C++ out parameters (int&, Fraction&, String&, T*&, ...) are { v } objects; containers passed by reference are
 * mutated in place. The C++ std::map/multimap types are OrderedMaps (iteration in key order); maps and sets keyed by
 * pointers are JS Maps/Sets (iteration in insertion order instead of address order).
 *
 * Layout of this file: the declarations of the header (importmusicxmlpass2.h) with the class methods in the order of
 * the .cpp, followed by the static helper functions of the .cpp (in their C++ order).
 */
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import { Accidental } from '../../../../engraving/dom/accidental'
import { AccidentalType } from '../../../../engraving/dom/accidentaldata'
import { EditTimeTickAnchors } from '../../../../engraving/dom/anchors'
import { Arpeggio } from '../../../../engraving/dom/arpeggio'
import { Articulation, ArticulationAnchor } from '../../../../engraving/dom/articulation'
import {
    type BarLine, BARLINE_SPAN_SHORT1_FROM, BARLINE_SPAN_SHORT1_TO, BARLINE_SPAN_TICK1_FROM, BARLINE_SPAN_TICK1_TO,
} from '../../../../engraving/dom/barline'
import type { Beam } from '../../../../engraving/dom/beam'
import type { HBox, VBox } from '../../../../engraving/dom/box'
import { Breath } from '../../../../engraving/dom/breath'
import { type Chord, PlayEventType } from '../../../../engraving/dom/chord'
import { ChordLine } from '../../../../engraving/dom/chordline'
import { type ChordDescription, HDegree, HDegreeType } from '../../../../engraving/dom/chordlist'
import { type ChordRest, NoteType } from '../../../../engraving/dom/chordrest'
import type { Clef } from '../../../../engraving/dom/clef'
import { ClefInfo } from '../../../../engraving/dom/clefinfo'
import { DrumInstrument, Drumset } from '../../../../engraving/dom/drumset'
import { TDuration } from '../../../../engraving/dom/durationtype'
import { Dynamic } from '../../../../engraving/dom/dynamic'
import type { EngravingItem } from '../../../../engraving/dom/engravingitem'
import type { EngravingObject } from '../../../../engraving/dom/engravingobject'
import { Factory } from '../../../../engraving/dom/factory'
import type { Fermata } from '../../../../engraving/dom/fermata'
import {
    FBIDigitNone, FiguredBass, FiguredBassContLine, FiguredBassItem, FiguredBassModifier, FiguredBassParenthesis,
} from '../../../../engraving/dom/figuredbass'
import { Fingering } from '../../../../engraving/dom/fingering'
import { FretDiagram, FretMarkerType } from '../../../../engraving/dom/fret'
import type { Glissando } from '../../../../engraving/dom/glissando'
import type { GradualTempoChange } from '../../../../engraving/dom/gradualtempochange'
import { type Hairpin, HairpinType } from '../../../../engraving/dom/hairpin'
import { Harmony, HarmonyInfo, HarmonyType } from '../../../../engraving/dom/harmony'
import type { HarpPedalDiagram, HarpStringType, PedalPosition } from '../../../../engraving/dom/harppedaldiagram'
import type { InstrumentChange } from '../../../../engraving/dom/instrchange'
import {
    combinedTemplateSearch, midiArticulations, searchTemplateForInstrNameList,
} from '../../../../engraving/dom/instrtemplate'
import { InstrChannel, Instrument, Trait } from '../../../../engraving/dom/instrument'
import { Interval } from '../../../../engraving/dom/interval'
import type { Jump } from '../../../../engraving/dom/jump'
import { AccidentalState, KeySigEvent } from '../../../../engraving/dom/key'
import type { KeySig } from '../../../../engraving/dom/keysig'
import type { LaissezVib } from '../../../../engraving/dom/laissezvib'
import type { SLine } from '../../../../engraving/dom/line'
import type { Lyrics } from '../../../../engraving/dom/lyrics'
import { Marker } from '../../../../engraving/dom/marker'
import type { Measure } from '../../../../engraving/dom/measure'
import type { Note } from '../../../../engraving/dom/note'
import { NoteEvent } from '../../../../engraving/dom/noteevent'
import type { Ornament } from '../../../../engraving/dom/ornament'
import { type Ottava, OttavaType } from '../../../../engraving/dom/ottava'
import type { Part } from '../../../../engraving/dom/part'
import type { Pedal } from '../../../../engraving/dom/pedal'
import { pitchIsValid, step2tpc, step2tpcByName, Tpc } from '../../../../engraving/dom/pitchspelling'
import { PlayTechAnnotation } from '../../../../engraving/dom/playtechannotation'
import { Pid, PropertyFlags } from '../../../../engraving/dom/property'
import { Rest } from '../../../../engraving/dom/rest'
import type { Score } from '../../../../engraving/dom/score'
import { type Segment, SegmentType } from '../../../../engraving/dom/segment'
import type { Slur } from '../../../../engraving/dom/slur'
import { type Spanner, SpannerAnchor } from '../../../../engraving/dom/spanner'
import type { Staff } from '../../../../engraving/dom/staff'
import type { StaffTextBase } from '../../../../engraving/dom/stafftextbase'
import { StaffType, StaffTypes } from '../../../../engraving/dom/stafftype'
import type { Stem } from '../../../../engraving/dom/stem'
import type { Sticking } from '../../../../engraving/dom/sticking'
import { InstrString, StringData } from '../../../../engraving/dom/stringdata'
import type { Symbol as SymbolItem } from '../../../../engraving/dom/symbol'
import type { Tapping } from '../../../../engraving/dom/tapping'
import type { TempoMap } from '../../../../engraving/dom/tempo'
import { TempoText } from '../../../../engraving/dom/tempotext'
import { Text } from '../../../../engraving/dom/text'
import { FrameType, TextBase } from '../../../../engraving/dom/textbase'
import type { TextLine } from '../../../../engraving/dom/textline'
import type { TextLineBase } from '../../../../engraving/dom/textlinebase'
import type { Tie } from '../../../../engraving/dom/tie'
import { type TimeSig, TimeSigType } from '../../../../engraving/dom/timesig'
import type { TremoloSingleChord } from '../../../../engraving/dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../../../engraving/dom/tremolotwochord'
import type { Trill } from '../../../../engraving/dom/trill'
import { Tuplet, TupletBracketType, TupletNumberType } from '../../../../engraving/dom/tuplet'
import { absStep } from '../../../../engraving/dom/utils'
import { type Volta, VoltaType } from '../../../../engraving/dom/volta'
import { Transpose } from '../../../../engraving/editing/transpose'
import { Err } from '../../../../engraving/engravingerrors'
import { engravingFonts } from '../../../../engraving/infrastructure/engravingfont'
import { toXmlEscaped, type XmlAttribute, XmlStreamReader } from '../../../../engraving/rw/xmlreader'
import { Sid } from '../../../../engraving/style/styledef'
import { Constants } from '../../../../engraving/types/constants'
import { Spatium } from '../../../../engraving/types/dimension'
import { Fraction } from '../../../../engraving/types/fraction'
import { SymId } from '../../../../engraving/types/symid'
import { SymNames } from '../../../../engraving/types/symnames'
import {
    AccidentalRole, AccidentalVal, Align, AlignH, AlignV, ArpeggioType, ArticulationTextType, BarLineType, BeamMode,
    ChordLineType, ClefToBarlinePosition, ClefType, DirectionV, DPMM, DurationType, DynamicType, ElementType,
    GlissandoType, GradualTempoChangeType, HookType, JumpType, Key, KeyMode, LineType, LyricsSyllabic, MarkerType,
    NoteHeadGroup, NoteHeadScheme, NoteHeadType, ParenthesesMode, PlacementV, PlayingTechniqueType, PreferSharpFlat,
    SlurStyleType, staff2track, type staff_idx_t, TappingHand, TextStyleType, TimeSigPlacement, track2staff,
    type track_idx_t, TremoloType, TrillType, VOICES,
} from '../../../../engraving/types/types'
import { TConv } from '../../../../engraving/types/typesconv'
import { Color } from '../../../../framework/draw/types/color'
import { comparePairs, IntMap, OrderedMap, StringMap } from '../../../../framework/global/orderedmap'
import { RealIsNull } from '../../../../framework/global/realfn'
import { musicXmlImportConfiguration } from '../musicxmlconfiguration'
import { MScoreTextToMusicXml } from '../shared/musicxmlfonthandler'
import {
    accidentalType2MusicXmlString, accidentalType2SmuflMusicXmlString, checkAtEndElement, errorStringWithLocation,
    harmonyFromXml, harmonyXmlFunction, microtonalGuess, musicXmlString2accSymId, setHarmonyRootTpcFromFunction,
    simplified, strToDouble, strToInt, trimmed,
} from '../shared/musicxmlsupport'
import {
    ArpeggioMap, type LyricNumberHandler, MAX_NUMBER_LEVEL, MusicXmlArpeggioDesc, MusicXmlExporterSoftware,
    type MusicXmlInstrList, MusicXmlInstrument, type MusicXmlInstruments, type MusicXmlIntervalList, MusicXmlStartStop,
} from '../shared/musicxmltypes'
import type { MusicXmlLogger } from './importmusicxmllogger'
import { MusicXmlNoteDuration } from './importmusicxmlnoteduration'
import { MusicXmlNotePitch } from './importmusicxmlnotepitch'
import { isLikelyCreditText, isLikelySubtitleText, MusicXmlParserPass1 } from './importmusicxmlpass1'
import { MusicXmlTupletFlag, type MusicXmlTupletFlags, MusicXmlTupletState, MusicXmlTupletStates } from './musicxmltupletstate'
import '../../../../engraving/editing/edit'
import '../../../../engraving/editing/cmd'

/** a C++ non-const reference (out parameter) */
export interface Ref<T> { v: T }

//---------------------------------------------------------
//   support enums / structs / classes
//---------------------------------------------------------

export type GraceChordList = Chord[]
export type FiguredBassList = FiguredBass[]
/** std::map<String, Tuplet*> */
export type Tuplets = StringMap<Tuplet | null>
/** std::map<String, Beam*> */
export type Beams = StringMap<Beam | null>

//---------------------------------------------------------
//   MusicXmlSlash
//---------------------------------------------------------

export enum MusicXmlSlash {
    NONE, RHYTHM, SLASH,
}

//---------------------------------------------------------
//   MusicXmlTupletDesc
//---------------------------------------------------------

/**
 Describe the information extracted from
 a single note/notations/tuplet element.
 */

export class MusicXmlTupletDesc {
    type = MusicXmlStartStop.NONE
    direction = DirectionV.AUTO
    bracket = TupletBracketType.AUTO_BRACKET
    shownumber = TupletNumberType.SHOW_NUMBER
}

//---------------------------------------------------------
//   SlurDesc
//---------------------------------------------------------

export enum SlurDescState {
    NONE, START, STOP,
}

/**
 The description of Slurs being handled
 */

export class SlurDesc {
    static readonly State = SlurDescState
    private m_slur: Slur | null = null
    private m_state = SlurDescState.NONE

    slur(): Slur | null { return this.m_slur }
    start(slur: Slur | null): void { this.m_slur = slur; this.m_state = SlurDescState.START }
    stop(slur: Slur | null): void { this.m_slur = slur; this.m_state = SlurDescState.STOP }
    isStart(): boolean { return this.m_state === SlurDescState.START }
    isStop(): boolean { return this.m_state === SlurDescState.STOP }
}

/** std::map<SLine*, std::pair<int, int>> (insertion order instead of pointer order) */
export type MusicXmlSpannerMap = Map<SLine, [number, number]>

//---------------------------------------------------------
//   MusicXmlSpannerDesc
//---------------------------------------------------------

export class MusicXmlSpannerDesc {
    sp: SLine | null = null
    tp: ElementType = ElementType.INVALID
    nr = 0

    /** MusicXmlSpannerDesc(SLine* sp, ElementType tp, int nr) */
    constructor(sp: SLine | null, tp: ElementType, nr: number) {
        this.sp = sp
        this.tp = tp
        this.nr = nr
    }
}

//---------------------------------------------------------
//   MusicXmlExtendedSpannerDesc
//---------------------------------------------------------

export class MusicXmlExtendedSpannerDesc {
    sp: SLine | null = null
    tick2 = new Fraction(0, 0)
    track2: track_idx_t = 0
    isStarted = false
    isStopped = false

    /** C++ desc = {} */
    reset(): void {
        this.sp = null
        this.tick2 = new Fraction(0, 0)
        this.track2 = 0
        this.isStarted = false
        this.isStopped = false
    }

    toString(): string {
        const spStr = this.sp ? this.sp.eid() : 'null'
        return `sp ${spStr} tp ${this.tick2.toString()} tick2 ${this.track2} track2 ${this.isStarted ? 'started' : ''}`
               + ` ${this.isStopped ? 'stopped' : ''}`
    }
}

//---------------------------------------------------------
//   HarmonyDesc
//---------------------------------------------------------

/**
 The description of a chord symbol with or without a fret diagram
 */

export class HarmonyDesc {
    m_track: track_idx_t
    m_harmony: Harmony | null
    m_fretDiagram: FretDiagram | null

    constructor(track: track_idx_t = -1, harmony: Harmony | null = null, fretDiagram: FretDiagram | null = null) {
        this.m_track = track
        this.m_harmony = harmony
        this.m_fretDiagram = fretDiagram
    }

    fretDiagramVisible(): boolean {
        return this.m_fretDiagram ? this.m_fretDiagram.visible() : false
    }

    descr(): ChordDescription | null {
        return this.m_harmony && this.m_harmony.chords().length ? this.m_harmony.chords()[0].descr() : null
    }
}
/** std::multimap<int, HarmonyDesc> */
export type HarmonyMap = IntMap<HarmonyDesc>

//---------------------------------------------------------
//   MusicXmlLyricsExtend
//---------------------------------------------------------

export class MusicXmlLyricsExtend {
    /** std::set<Lyrics*> (insertion order) */
    m_lyrics = new Set<Lyrics>()

    //---------------------------------------------------------
    //   MusicXmlLyricsExtend
    //---------------------------------------------------------

    //---------------------------------------------------------
    //   init
    //---------------------------------------------------------

    init(): void {
        this.m_lyrics.clear()
    }

    //---------------------------------------------------------
    //   addLyric
    //---------------------------------------------------------

    // add a single lyric to be extended later
    // called when lyric with "extend" or "extend type=start" is found

    addLyric(lyric: Lyrics): void {
        this.m_lyrics.add(lyric)
    }

    //---------------------------------------------------------
    //   setExtend
    //---------------------------------------------------------

    // set extend for lyric no in *staff* to end at tick
    // called when lyric (with or without "extend") or note with "extend type=stop" is found
    // // note that no == -1 means all lyrics in this *track*

    setExtend(verse: number, track: track_idx_t, tick: Fraction,
        prevAddedLyrics: Lyrics | null = null): void {
        const list: Lyrics[] = []
        for (const l of this.m_lyrics) {
            const el = l.parentItem()
            if (el && el.isChordRest()) {
                const par = el as ChordRest
                // no = -1: stop all extends on this track
                // otherwise, stop all extends in the stave with the same no and placement
                if ((verse === -1 && par.track() === track)
                    || (l.verse() === verse && track2staff(par.track()) === track2staff(track) && prevAddedLyrics
                        && prevAddedLyrics.placement() === l.placement())) {
                    const lct = lastChordTicks(l.segment(), tick, track)
                    if (lct.gt(new Fraction(0, 1))) {
                        // set lyric tick to the total length from the lyric note
                        // plus all notes covered by the melisma minus the last note length
                        l.setTicks(tick.minus(par.tick()).minus(lct))
                    }
                    list.push(l)
                }
            }
        }
        // cleanup
        for (const l of list) {
            this.m_lyrics.delete(l)
        }
    }
}

export class GraceNoteLyrics {
    constructor(public lyric: Lyrics | null, public extend: boolean, public no: number) {}
}

export class InferredPercInstr {
    constructor(
        public pitch = -1,
        public track: track_idx_t = -1,
        public name = '',
        public tick = new Fraction(0, -1),
    ) {}
}
export type InferredPercList = InferredPercInstr[]

/** std::map<String, std::pair<String, DurationType>> */
export type MetronomeTextMap = StringMap<[string, DurationType]>

//---------------------------------------------------------
//   MusicXmlParserLyric
//---------------------------------------------------------

export class MusicXmlParserLyric {
    m_lyricNumberHandler: LyricNumberHandler
    m_e: XmlStreamReader
    m_score: Score            // the score
    m_logger: MusicXmlLogger            // Error logger
    m_numberedLyrics = new IntMap<Lyrics>()   // lyrics with valid number
    m_extendedLyrics = new Set<Lyrics>()        // lyrics with the extend flag set
    m_inferredStickings: Sticking[] = []   // stickings with valid number
    m_defaultY = 0.0
    m_relativeY = 0.0
    m_placement = ''
    m_isVoiceStaff = true

    constructor(lyricNumberHandler: LyricNumberHandler, e: XmlStreamReader, score: Score, logger: MusicXmlLogger, isVoiceStaff: boolean) {
        this.m_lyricNumberHandler = lyricNumberHandler
        this.m_e = e
        this.m_score = score
        this.m_logger = logger
        this.m_isVoiceStaff = isVoiceStaff
    }

    extendedLyrics(): Set<Lyrics> { return new Set(this.m_extendedLyrics) }
    numberedLyrics(): IntMap<Lyrics> {
        const r = new IntMap<Lyrics>()
        for (const [k, v] of this.m_numberedLyrics) {
            r.set(k, v)
        }
        return r
    }

    inferredStickings(): Sticking[] { return this.m_inferredStickings.slice() }
    totalY(): number { return this.m_defaultY + this.m_relativeY }
    hasTotalY(): boolean { return this.m_defaultY !== 0 || this.m_relativeY !== 0 }

    //---------------------------------------------------------
    //   MusicXmlParserLyric
    //---------------------------------------------------------

    //---------------------------------------------------------
    //   skipLogCurrElem
    //---------------------------------------------------------

    /**
     Skip the current element, log debug as info.
     */

    skipLogCurrElem(): void {
        this.m_e.skipCurrentElement()
    }

    readElision(formattedText: Ref<string>): void {
        const text = this.m_e.readText()
        const smufl = this.m_e.attribute('smufl')
        if (text) {
            formattedText.v += text
        } else if (smufl) {
            formattedText.v += '<sym>' + smufl + '</sym>'
        } else {
            formattedText.v += '<sym>lyricsElision</sym>'
        }
    }

    //---------------------------------------------------------
    //   parse
    //---------------------------------------------------------

    parse(visibility = true): void {
        let hasExtend = false
        const lyricNumber = this.m_e.attribute('number')
        const lyricColor = Color.fromString(this.m_e.asciiAttribute('color'))
        const printLyric = visibility ? this.m_e.asciiAttribute('print-object') !== 'no' : this.m_e.asciiAttribute('print-object') === 'yes'
        this.m_placement = this.m_e.attribute('placement')
        const relX = this.m_e.doubleAttribute('relative-x') * 0.1 * DPMM
        this.m_relativeY = this.m_e.doubleAttribute('relative-y') * -0.1 * DPMM
        this.m_defaultY = this.m_e.doubleAttribute('default-y') * -0.1 * DPMM
        let syllabic = LyricsSyllabic.SINGLE

        let extendType = ''
        const formattedText: Ref<string> = { v: '' }

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'elision') {
                this.readElision(formattedText)
            } else if (this.m_e.name() === 'extend') {
                hasExtend = true
                extendType = this.m_e.attribute('type')
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'syllabic') {
                const syll = this.m_e.readText()
                if (syll === 'single') {
                    syllabic = LyricsSyllabic.SINGLE
                } else if (syll === 'begin') {
                    syllabic = LyricsSyllabic.BEGIN
                } else if (syll === 'end') {
                    syllabic = LyricsSyllabic.END
                } else if (syll === 'middle') {
                    syllabic = LyricsSyllabic.MIDDLE
                }
            } else if (this.m_e.name() === 'text') {
                formattedText.v += nextPartOfFormattedString(this.m_e)
            } else {
                this.skipLogCurrElem()
            }
        }

        // if no lyric read (e.g. only 'extend "type=stop"'), no further action required
        if (!formattedText.v) {
            return
        }

        const lyricNo = this.m_lyricNumberHandler.getLyricNo(lyricNumber)
        if (lyricNo < 0) {
            this.m_logger.logError('invalid lyrics number (<0)', this.m_e)
            return
        } else if (lyricNo > MAX_LYRICS) {
            this.m_logger.logError(`too much lyrics (>${MAX_LYRICS})`, this.m_e)
            return
        } else if (this.m_numberedLyrics.has(lyricNo)) {
            this.m_logger.logError(`duplicate lyrics number (${lyricNumber})`, this.m_e)
            return
        }

        let item: TextBase
        if (this.isLikelySticking(formattedText.v, syllabic, hasExtend)) {
            item = Factory.createItem(ElementType.STICKING, scoreDummy(this.m_score).segment()) as Sticking
        } else {
            item = Factory.createItem(ElementType.LYRICS, scoreDummy(this.m_score).chord()) as Lyrics
        }

        item.setXmlText(formattedText.v)
        colorItem(item, lyricColor)
        item.setVisible(printLyric)

        item.setPlacement(this.placement() === 'above' ? PlacementV.ABOVE : PlacementV.BELOW)
        item.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
        item.resetProperty(Pid.OFFSET)

        if (!RealIsNull(relX)) {
            const offset = item.offset().clone()
            offset.setX(relX)
            item.setOffset(offset)
            item.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
        }

        if (item.isLyrics()) {
            // Add lyric
            const l = item as Lyrics
            l.setSyllabic(syllabic)
            this.m_numberedLyrics.set(lyricNo, l)

            if (hasExtend
                && (!extendType || extendType === 'start')
                && (l.syllabic() === LyricsSyllabic.SINGLE || l.syllabic() === LyricsSyllabic.END)) {
                this.m_extendedLyrics.add(l)
            }
        } else if (item.isSticking()) {
            // Add sticking
            const s = item as Sticking
            this.m_inferredStickings.push(s)
        }
    }

    placement(): string {
        if (this.m_placement === '' && this.hasTotalY()) {
            return this.totalY() < 0 ? 'above' : 'below'
        } else {
            return this.m_placement
        }
    }

    isLikelySticking(text: string, syllabic: LyricsSyllabic,
        hasExtend: boolean): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }
        const plainWords = MScoreTextToMusicXml.toPlainText(simplified(text))
        const sticking = /^[lrbLRB]+$/
        return sticking.test(plainWords) && syllabic === LyricsSyllabic.SINGLE && !hasExtend && !this.m_isVoiceStaff
    }
}

//---------------------------------------------------------
//   Notation
//      Most with text base attributes (font-*, placement)
//---------------------------------------------------------

export class Notation {
    private m_name: string
    private m_parent: string
    private m_symId: SymId
    private m_subType = ''
    private m_text = ''
    private m_attributes = new StringMap<string>()
    private m_visible = true

    constructor(name: string, parent = '', symId: SymId = SymId.noSym) {
        this.m_name = name
        this.m_parent = parent
        this.m_symId = symId
    }

    //---------------------------------------------------------
    //   addAttribute
    //---------------------------------------------------------

    addAttribute(name: string, value: string): void {
        this.m_attributes.insert(name, value)
    }

    //---------------------------------------------------------
    //   attribute
    //---------------------------------------------------------

    attribute(name: string): string {
        return this.m_attributes.get(name) ?? ''
    }

    attributes(): StringMap<string> { return this.m_attributes }
    name(): string { return this.m_name }
    parent(): string { return this.m_parent }
    setSymId(symId: SymId): void { this.m_symId = symId }
    symId(): SymId { return this.m_symId }
    setSubType(subType: string): void { this.m_subType = subType }
    subType(): string { return this.m_subType }

    //---------------------------------------------------------
    //   print
    //---------------------------------------------------------

    print(): string {
        let res = this.m_name

        for (const [k, v] of this.m_attributes) {
            res += ' '
            res += k
            res += ' '
            res += v
        }

        if (this.m_text) {
            res += ' '
            res += this.m_text
        }
        return res
    }

    setText(text: string): void { this.m_text = text }
    text(): string { return this.m_text }
    setVisible(visible: boolean): void { this.m_visible = visible }
    visible(): boolean { return this.m_visible }

    //---------------------------------------------------------
    //   notationWithAttributes
    //---------------------------------------------------------

    /**
     Helper function to create Notation with initial attributes.
     */

    static notationWithAttributes(name: string, attributes: readonly XmlAttribute[], parent = '', symId: SymId = SymId.noSym): Notation {
        const notation = new Notation(name, parent, symId)
        for (const attr of attributes) {
            notation.addAttribute(attr.name, attr.value)
        }
        return notation
    }
}

//---------------------------------------------------------
//   forward references and defines
//---------------------------------------------------------

export class DelayedArpeggio {
    constructor(public m_arpeggioType = '', public m_arpeggioNo = 0) {}

    clear(): void { this.m_arpeggioType = ''; this.m_arpeggioNo = 0 }
}

export type DelayedDirectionsList = MusicXmlDelayedDirectionElement[]
export type InferredFingeringsList = MusicXmlInferredFingering[]
export type SlurStack = SlurDesc[]
export type TrillStack = (Trill | null)[]
export type BracketsStack = MusicXmlExtendedSpannerDesc[]
export type OttavasStack = MusicXmlExtendedSpannerDesc[]
export type HairpinsStack = MusicXmlExtendedSpannerDesc[]
export type InferredHairpinsStack = Hairpin[]
export type InferredTempoLineStack = GradualTempoChange[]
export type SpannerStack = MusicXmlExtendedSpannerDesc[]
/** std::set<Spanner*> (insertion order) */
export type SpannerSet = Set<Spanner>
/** std::map<int, DelayedArpeggio> */
export type DelayedArpMap = IntMap<DelayedArpeggio>
/** std::map<int, Marker*> */
export type SegnoStack = IntMap<Marker>
/** std::multimap<int, EngravingItem*> */
export type SystemElements = IntMap<EngravingItem>

// Ties are identified by the pitch and track of their first note
export type TieLocation = [number, track_idx_t]
/** std::map<TieLocation, Tie*> */
export class MusicXmlTieMap extends OrderedMap<TieLocation, Tie> {
    constructor() { super(comparePairs) }
}

/** C++ Glissando* m_glissandi[MAX_NUMBER_LEVEL][2]: current slides ([0]) / glissandi ([1]) */
export type GlissandoStack = (Glissando | null)[][]

function stack<T>(make: () => T): T[] {
    return Array.from({ length: MAX_NUMBER_LEVEL }, make)
}

//---------------------------------------------------------
//   MusicXmlParserNotations
//---------------------------------------------------------

export class MusicXmlParserNotations {
    m_e: XmlStreamReader
    m_pass2: MusicXmlParserPass2
    m_score: Score                         // the score
    m_logger: MusicXmlLogger                              // the error logger
    m_errors = ''                    // errors to present to the user
    m_tupletDesc = new MusicXmlTupletDesc()
    m_dynamicsColor = new Color()
    m_dynamicsPlacement = ''
    m_dynamicsList: string[] = []
    m_notations: Notation[] = []
    m_hasTremolo = false
    m_tremoloType = ''
    m_tremoloNr = 0
    m_tremoloSmufl = ''
    m_tremoloColor = new Color()
    m_wavyLineType = ''
    m_wavyLineNo = 0
    m_arpeggioType = ''
    m_arpeggioNo = 0
    m_arpeggioColor = new Color()
    m_slurStop = false
    m_slurStart = false
    m_wavyLineStop = false
    m_visible = true

    constructor(e: XmlStreamReader, score: Score, logger: MusicXmlLogger, pass2: MusicXmlParserPass2) {
        this.m_e = e
        this.m_pass2 = pass2
        this.m_score = score
        this.m_logger = logger
    }

    errors(): string { return this.m_errors }
    tupletDesc(): MusicXmlTupletDesc { return this.m_tupletDesc }
    hasTremolo(): boolean { return this.m_hasTremolo }
    tremoloType(): string { return this.m_tremoloType }
    tremoloSmufl(): string { return this.m_tremoloSmufl }
    tremoloColor(): Color { return this.m_tremoloColor }
    tremoloNr(): number { return this.m_tremoloNr }
    mustStopGraceAfter(): boolean { return (this.m_slurStop && !this.m_slurStart) || this.m_wavyLineStop }

    // private

    //---------------------------------------------------------
    //   slur
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/slur node.
     */

    slur(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'notations')
        notation.setVisible(this.m_visible)
        this.m_notations.push(notation)

        // any grace note containing a slur stop means
        // last note of a grace after set has been found
        // -> remember slur stop
        if (notation.attribute('type') === 'stop') {
            this.m_slurStop = true
        } else if (notation.attribute('type') === 'start') {
            this.m_slurStart = true
        }

        this.m_e.skipCurrentElement()  // skip but don't log
    }

    //---------------------------------------------------------
    //   tied
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/tied node.
     */

    tied(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'notations')
        notation.setVisible(this.m_visible)
        // Make sure "stops" get processed before "starts"
        if (notation.attribute('type') === 'stop') {
            this.m_notations.unshift(notation)
        } else {
            this.m_notations.push(notation)
        }
        const tiedType = notation.attribute('type')
        if (tiedType !== 'start' && tiedType !== 'stop' && tiedType !== 'let-ring') {
            this.m_logger.logError(`unknown tied type ${tiedType}`, this.m_e)
        }

        this.m_e.skipCurrentElement()  // skip but don't log
    }

    //---------------------------------------------------------
    //   dynamics
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/dynamics node.
     */

    dynamics(): void {
        this.m_dynamicsColor = Color.fromString(this.m_e.attribute('color'))
        this.m_dynamicsPlacement = this.m_e.attribute('placement')

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'other-dynamics') {
                this.m_dynamicsList.push(this.m_e.readText())
            } else {
                this.m_dynamicsList.push(this.m_e.name())
                this.m_e.skipCurrentElement()  // skip but don't log
            }
        }
    }

    //---------------------------------------------------------
    //   articulations
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/articulations node.
     Note that some notations attach to notes only in MuseScore,
     which means trying to attach them to a rest will crash,
     as in that case note is 0.
     */

    articulations(): void {
        while (this.m_e.readNextStartElement()) {
            const id: Ref<SymId> = { v: SymId.noSym }
            if (convertArticulationToSymId(this.m_e.name(), id)) {
                if (this.m_e.name() === 'detached-legato') {
                    let artic = Notation.notationWithAttributes('tenuto', this.m_e.attributes(), 'articulations', SymId.articTenutoAbove)
                    artic.setVisible(this.m_visible)
                    this.m_notations.push(artic)
                    artic = Notation.notationWithAttributes('staccato', this.m_e.attributes(), 'articulations', SymId.articStaccatoAbove)
                    artic.setVisible(this.m_visible)
                    this.m_notations.push(artic)
                } else {
                    const artic = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'articulations', id.v)
                    artic.setVisible(this.m_visible)
                    this.m_notations.push(artic)
                }
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'breath-mark') {
                const attributes = this.m_e.attributes()
                const value = this.m_e.readText()
                let breath = SymId.noSym
                if (value === 'tick') {
                    breath = SymId.breathMarkTick
                } else if (value === 'upbow') {
                    breath = SymId.breathMarkUpbow
                } else if (value === 'salzedo') {
                    breath = SymId.breathMarkSalzedo
                } else {
                    // Use comma as the default symbol
                    breath = SymId.breathMarkComma
                }
                const notation = Notation.notationWithAttributes('breath', attributes, 'articulations', breath)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
            } else if (this.m_e.name() === 'caesura') {
                const attributes = this.m_e.attributes()
                const value = this.m_e.readText()
                let caesura = SymId.noSym
                if (value === 'curved') {
                    caesura = SymId.caesuraCurved
                } else if (value === 'short') {
                    caesura = SymId.caesuraShort
                } else if (value === 'thick') {
                    caesura = SymId.caesuraThick
                } else if (value === 'single') {
                    caesura = SymId.caesuraSingleStroke
                } else { // Use as the default symbol
                    caesura = SymId.caesura
                }
                const notation = Notation.notationWithAttributes('breath', attributes, 'articulations', caesura)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
            } else if (this.m_e.name() === 'doit'
                       || this.m_e.name() === 'falloff'
                       || this.m_e.name() === 'plop'
                       || this.m_e.name() === 'scoop') {
                const artic = Notation.notationWithAttributes('chord-line', this.m_e.attributes(), 'articulations')
                artic.setSubType(this.m_e.name())
                artic.setVisible(this.m_visible)
                this.m_notations.push(artic)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'other-articulation') {
                const smufl = this.m_e.attribute('smufl')
                const sid = SymNames.symIdByName(smufl, SymId.noSym)
                const artic = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'articulations', sid)
                const articText = this.m_e.readText()
                artic.setText(articText)

                if (smufl || articText) {
                    artic.setVisible(this.m_visible)
                    this.m_notations.push(artic)
                }
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   ornaments
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/ornaments node.
     */

    ornaments(): void {
        let trillMark = false
        // <trill-mark placement="above"/>
        while (this.m_e.readNextStartElement()) {
            const id: Ref<SymId> = { v: SymId.noSym }
            if (convertArticulationToSymId(this.m_e.name(), id)) {
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'ornaments', id.v)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'trill-mark') {
                trillMark = true
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'wavy-line') {
                const wavyLineTypeWasStart = (this.m_wavyLineType === 'start')
                this.m_wavyLineType = this.m_e.attribute('type')
                this.m_wavyLineNo = this.m_e.intAttribute('number')
                if (this.m_wavyLineNo > 0) {
                    this.m_wavyLineNo--
                }
                // any grace note containing a wavy-line stop means
                // last note of a grace after set has been found
                // remember wavy-line stop
                if (this.m_wavyLineType === 'stop') {
                    this.m_wavyLineStop = true
                }
                // check for start and stop on same note
                if (wavyLineTypeWasStart && this.m_wavyLineType === 'stop') {
                    this.m_wavyLineType = 'startstop'
                }
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'tremolo') {
                this.m_hasTremolo = true
                this.m_tremoloColor = Color.fromString(this.m_e.attribute('color'))
                this.m_tremoloType = this.m_e.attribute('type')
                this.m_tremoloSmufl = this.m_e.attribute('smufl')
                this.m_tremoloNr = this.m_e.readInt()
            } else if (this.m_e.name() === 'inverted-mordent'
                       || this.m_e.name() === 'mordent') {
                this.mordentNormalOrInverted()
            } else if (this.m_e.name() === 'other-ornament') {
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'ornaments')
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }

        // note that mscore wavy line already implicitly includes a trillsym
        // so don't add an additional one
        if (trillMark && this.m_wavyLineType !== 'start' && this.m_wavyLineType !== 'startstop') {
            const ornament = Notation.notationWithAttributes('trill-mark', this.m_e.attributes(), 'ornaments', SymId.ornamentTrill)
            ornament.setVisible(this.m_visible)
            this.m_notations.push(ornament)
        }
    }

    //---------------------------------------------------------
    //   technical
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/technical node.
     */

    technical(): void {
        while (this.m_e.readNextStartElement()) {
            const id: Ref<SymId> = { v: SymId.noSym }
            const smufl = this.m_e.attribute('smufl')
            if (smufl) {
                id.v = SymNames.symIdByName(smufl, SymId.noSym)
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'technical', id.v)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
                this.m_e.skipCurrentElement()
            } else if (convertArticulationToSymId(this.m_e.name(), id)) {
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'technical', id.v)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'fingering' || this.m_e.name() === 'fret' || this.m_e.name() === 'pluck'
                       || this.m_e.name() === 'string' || this.m_e.name() === 'tap') {
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'technical')
                notation.setText(this.m_e.readText())
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
            } else if (this.m_e.name() === 'harmonic') {
                this.harmonic()
            } else if (this.m_e.name() === 'handbell') {
                const attributes = this.m_e.attributes()
                const name = this.m_e.name()
                convertArticulationToSymId(this.m_e.readText(), id)
                const notation = Notation.notationWithAttributes(name, attributes, 'technical', id.v)
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
            } else if (this.m_e.name() === 'harmon-mute') {
                this.harmonMute()
            } else if (this.m_e.name() === 'hole') {
                this.hole()
            } else if (this.m_e.name() === 'tap') {
                id.v = (this.m_e.attribute('hand') === 'left') ? SymId.guitarLeftHandTapping : SymId.guitarRightHandTapping
                const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'technical')
                notation.setVisible(this.m_visible)
                this.m_notations.push(notation)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'other-technical') {
                this.otherTechnical()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    otherTechnical(): void {
        const color = Color.fromString(this.m_e.attribute('color'))
        const text = this.m_e.readText()

        if (text === 'z') {
            // Buzz roll
            this.m_hasTremolo = true
            this.m_tremoloNr = 0
            this.m_tremoloType = 'unmeasured'
            this.m_tremoloColor = color
        }
    }

    //---------------------------------------------------------
    //   harmonic
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/technical/harmonic node.
     */

    harmonic(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'technical', SymId.stringsHarmonic)

        while (this.m_e.readNextStartElement()) {
            const name = this.m_e.name()
            if (name === 'natural') {
                notation.setSubType(name)
                notation.setVisible(this.m_visible)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (name === 'artificial') {   // TODO: add artificial harmonic when supported by MuseScore
                this.m_logger.logError(`unsupported harmonic type/pitch '${name}'`, this.m_e)
                notation.setSymId(SymId.noSym)
                this.m_e.skipCurrentElement()
            } else {
                this.m_e.skipCurrentElement()
            }
        }

        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   harmonMute
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/technical/harmon-mute node.
     */

    harmonMute(): void {
        let mute = SymId.brassHarmonMuteClosed
        const attributes = this.m_e.attributes()
        while (this.m_e.readNextStartElement()) {
            const name = this.m_e.name()
            if (name === 'harmon-closed') {
                const location = this.m_e.attribute('location')
                const value = this.m_e.readText()
                if (value === 'yes') {
                    mute = SymId.brassHarmonMuteClosed
                } else if (value === 'no') {
                    mute = SymId.brassHarmonMuteStemOpen
                } else if (value === 'half') {
                    if (location === 'left') {
                        mute = SymId.brassHarmonMuteStemHalfLeft
                    } else if (location === 'right') {
                        mute = SymId.brassHarmonMuteStemHalfRight
                    } else {
                        this.m_logger.logError(`unsupported harmon-closed location '${location}'`, this.m_e)
                        mute = SymId.brassHarmonMuteStemHalfLeft
                    }
                }
            } else {
                this.m_e.skipCurrentElement()
            }
        }
        const notation = Notation.notationWithAttributes('harmon-closed', attributes, 'technical', mute)
        notation.setVisible(this.m_visible)
        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   hole
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/technical/hole node.
     */

    hole(): void {
        let hole = SymId.noSym
        const attributes = this.m_e.attributes()
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'hole-closed') {
                const location = this.m_e.attribute('location')
                const value = this.m_e.readText()
                if (value === 'yes') {
                    hole = SymId.windClosedHole
                } else if (value === 'no') {
                    hole = SymId.windOpenHole
                } else if (value === 'half') {
                    if (location === 'bottom') {
                        hole = SymId.windHalfClosedHole2
                    } else if (location === 'right') {
                        hole = SymId.windHalfClosedHole1
                    } else {
                        this.m_logger.logError(`unsupported hole-closed location '${location}'`, this.m_e)
                        hole = SymId.windHalfClosedHole3
                    }
                }
            } else {
                this.m_e.skipCurrentElement()
            }
        }
        const notation = Notation.notationWithAttributes('hole-closed', attributes, 'technical', hole)
        notation.setVisible(this.m_visible)
        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   addTechnical
    //---------------------------------------------------------

    addTechnical(notation: Notation, note: Note | null): void {
        const placement = notation.attribute('placement')
        const fontWeight = notation.attribute('font-weight')
        const fontSize = strToDouble(notation.attribute('font-size'))
        const fontStyle = notation.attribute('font-style')
        const fontFamily = notation.attribute('font-family')
        const color = Color.fromString(notation.attribute('color'))
        if (notation.name() === 'fingering') {
            // TODO: distinguish between keyboards (style TextStyleName::FINGERING)
            // and (plucked) strings (style TextStyleName::LH_GUITAR_FINGERING)
            addTextToNote(this.m_e.byteOffset(), notation.text(), placement, fontWeight, fontSize, fontStyle, fontFamily,
                notation.visible(), color, TextStyleType.FINGERING, this.m_score, note)
        } else if (notation.name() === 'fret') {
            const fret = strToInt(notation.text())
            if (note) {
                if (note.staff()!.isTabStaff(new Fraction(0, 1))) {
                    note.setFret(fret)
                }
            } else {
                this.m_logger.logError('no note for fret', this.m_e)
            }
        } else if (notation.name() === 'pluck') {
            addTextToNote(this.m_e.byteOffset(), notation.text(), placement, fontWeight, fontSize, fontStyle, fontFamily,
                notation.visible(), color, TextStyleType.RH_GUITAR_FINGERING, this.m_score, note)
        } else if (notation.name() === 'string') {
            if (note) {
                if (note.staff()!.isTabStaff(new Fraction(0, 1))) {
                    note.setString(strToInt(notation.text()) - 1)
                } else {
                    addTextToNote(this.m_e.byteOffset(), notation.text(), placement, fontWeight, fontSize, fontStyle, fontFamily,
                        notation.visible(), color, TextStyleType.STRING_NUMBER, this.m_score, note)
                }
            } else {
                this.m_logger.logError('no note for string', this.m_e)
            }
        } else if (notation.name() === 'tap') {
            if (note) {
                addTapToChord(notation, note.chord())
            } else {
                this.m_logger.logError('no note for tap', this.m_e)
            }
        }
    }

    arpeggio(): void {
        this.m_arpeggioType = this.m_e.attribute('direction')
        if (!this.m_arpeggioType) {
            this.m_arpeggioType = 'none'
        }
        this.m_arpeggioNo = this.m_e.intAttribute('number')
        if (this.m_arpeggioNo === 0) {
            this.m_arpeggioNo = 1
        }
        this.m_arpeggioColor = Color.fromString(this.m_e.attribute('color'))
        this.m_e.skipCurrentElement()  // skip but don't log
    }

    //---------------------------------------------------------
    //   mordentNormalOrInverted
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/ornaments/mordent
     and /score-partwise/part/measure/note/notations/ornaments/inverted-mordent nodes.
     */

    mordentNormalOrInverted(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'ornaments')
        notation.setText(this.m_e.readText())
        notation.setVisible(this.m_visible)
        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   glissandoSlide
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/glissando
     and /score-partwise/part/measure/note/notations/slide nodes.
     */

    glissandoSlide(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'notations')
        notation.setText(this.m_e.readText())
        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   addError
    //---------------------------------------------------------

    // notes:
    // when the parser gets out of sync, only a single error stack is reported
    // even when e.g. two incorrect notations are present
    // line number will be added by pass 2

    addError(error: string): void {
        if (error) {
            this.m_logger.logError(error, this.m_e)
            this.m_errors += error
        }
    }

    //---------------------------------------------------------
    //   skipLogCurrElem
    //---------------------------------------------------------

    /**
     Skip the current element, log debug as info.
     */

    skipLogCurrElem(): void {
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   parse
    //---------------------------------------------------------

    parse(): void {
        this.m_visible = this.m_e.asciiAttribute('print-object') !== 'no'

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'arpeggiate') {
                this.arpeggio()
            } else if (this.m_e.name() === 'articulations') {
                this.articulations()
            } else if (this.m_e.name() === 'dynamics') {
                this.dynamics()
            } else if (this.m_e.name() === 'fermata') {
                this.fermata()
            } else if (this.m_e.name() === 'glissando') {
                this.glissandoSlide()
            } else if (this.m_e.name() === 'hammer-on') {
                this.slur()
            } else if (this.m_e.name() === 'non-arpeggiate') {
                this.m_arpeggioColor = Color.fromString(this.m_e.attribute('color'))
                this.m_arpeggioType = 'non-arpeggiate'
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'ornaments') {
                this.ornaments()
            } else if (this.m_e.name() === 'pull-off') {
                this.slur()
            } else if (this.m_e.name() === 'slur') {
                this.slur()
            } else if (this.m_e.name() === 'slide') {
                this.glissandoSlide()
            } else if (this.m_e.name() === 'technical') {
                this.technical()
            } else if (this.m_e.name() === 'tied') {
                this.tied()
            } else if (this.m_e.name() === 'tuplet') {
                this.tuplet()
            } else if (this.m_e.name() === 'other-notation') {
                this.otherNotation()
            } else {
                this.skipLogCurrElem()
            }
        }

        this.addError(checkAtEndElement(this.m_e, 'notations'))
    }

    //---------------------------------------------------------
    //   addNotation
    //---------------------------------------------------------

    addNotation(notation: Notation, cr: ChordRest,
        note: Note | null): void {
        if (notation.symId() !== SymId.noSym) {
            if (notation.name() === 'breath') {
                addBreath(notation, cr)
            } else if (notation.name() === 'fermata') {
                addFermataToChord(notation, cr)

                // Terminate tempo line
                const lines = this.m_pass2.getInferredTempoLine()
                terminateInferredLine(lines.slice(), cr.tick(), cr.track())
            } else if (notation.parent() === 'ornaments') {
                addTurnToChord(notation, cr)
            } else {
                addArticulationToChord(notation, cr)
            }
        } else if (notation.parent() === 'ornaments') {
            if (notation.name() === 'mordent' || notation.name() === 'inverted-mordent') {
                addMordentToChord(notation, cr)
            } else if (notation.name() === 'other-ornament') {
                addOtherOrnamentToChord(notation, cr)
            }
        } else if (notation.parent() === 'articulations') {
            if (note && notation.name() === 'chord-line') {
                addChordLine(notation, note, this.m_logger, this.m_e)
            }
        } else {
            // notation has been skipped
        }
    }

    //---------------------------------------------------------
    //   addToScore
    //---------------------------------------------------------

    /**
     Add the notations found to the score.
     Note that some notations attach to notes only in MuseScore,
     which means trying to attach them to a rest will crash,
     as in that case note is a nullptr.
     */

    addToScore(cr: ChordRest, note: Note | null, tick: Fraction,
        slurs: SlurStack, glissandi: GlissandoStack, spanners: MusicXmlSpannerMap, trills: TrillStack, ties: MusicXmlTieMap,
        unstartedTieNotes: Note[], unendedTieNotes: Note[], arpMap: ArpeggioMap, delayedArps: DelayedArpMap): void {
        addArpeggio(cr, this.m_arpeggioType, this.m_arpeggioNo, this.m_arpeggioColor, arpMap, delayedArps)
        addWavyLine(cr, tick, this.m_wavyLineNo, this.m_wavyLineType, spanners, trills, this.m_logger, this.m_e)

        for (const notation of this.m_notations) {
            if (notation.symId() !== SymId.noSym) {
                this.addNotation(notation, cr, note)
            } else if (notation.name() === 'slur' || notation.name() === 'hammer-on' || notation.name() === 'pull-off') {
                addSlur(notation, slurs, cr, note, tick, this.m_logger, this.m_e)
            } else if (note && (notation.name() === 'glissando' || notation.name() === 'slide')) {
                addGlissandoSlide(notation, note, glissandi, spanners, this.m_logger, this.m_e)
            } else if (note && notation.name() === 'tied') {
                addTie(notation, note, cr.track(), ties, unstartedTieNotes, unendedTieNotes, this.m_logger, this.m_e)
            } else if (note && notation.parent() === 'technical') {
                this.addTechnical(notation, note)
            } else {
                this.addNotation(notation, cr, note)
            }
        }

        // more than one dynamic ???
        // LVIFIX: check import/export of <other-dynamics>unknown_text</...>
        // TODO: remove duplicate code (see MusicXml::direction)
        for (const d of this.m_dynamicsList) {
            const dynamic = Factory.createItem(ElementType.DYNAMIC, scoreDummy(this.m_score).segment()) as Dynamic
            dynamic.setDynamicType(d)
            colorItem(dynamic, this.m_dynamicsColor)
            this.m_pass2.addElemOffset(dynamic, cr.track(), this.m_dynamicsPlacement, cr.measure(), tick)
        }
    }

    //---------------------------------------------------------
    //   fermata
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/fermata node.
     Note: MusicXML common.mod: "An empty fermata element represents a normal fermata."
     */

    fermata(): void {
        const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'notations')
        const fermataText = this.m_e.readText()

        notation.setSymId(convertFermataToSymId(fermataText))
        notation.setText(fermataText)
        notation.setVisible(this.m_visible)
        this.m_notations.push(notation)
    }

    //---------------------------------------------------------
    //   tuplet
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/notations/tuplet node.
     */

    tuplet(): void {
        const tupletType = this.m_e.attribute('type')
        const tupletPlacement = this.m_e.attribute('placement')
        const tupletBracket = this.m_e.attribute('bracket')
        const tupletShowNumber = this.m_e.attribute('show-number')

        // ignore possible children (currently not supported)
        this.m_e.skipCurrentElement()

        if (tupletType === 'start') {
            this.m_tupletDesc.type = MusicXmlStartStop.START
        } else if (tupletType === 'stop') {
            this.m_tupletDesc.type = MusicXmlStartStop.STOP
        } else if (tupletType && tupletType !== 'start' && tupletType !== 'stop') {
            this.m_logger.logError(`unknown tuplet type '${tupletType}'`, this.m_e)
        }

        // set bracket, leave at default if unspecified
        if (tupletBracket === 'yes') {
            this.m_tupletDesc.bracket = TupletBracketType.SHOW_BRACKET
        } else if (tupletBracket === 'no') {
            this.m_tupletDesc.bracket = TupletBracketType.SHOW_NO_BRACKET
        }

        // set number, default is "actual" (=NumberType::SHOW_NUMBER)
        if (tupletShowNumber === 'both') {
            this.m_tupletDesc.shownumber = TupletNumberType.SHOW_RELATION
        } else if (tupletShowNumber === 'none') {
            this.m_tupletDesc.shownumber = TupletNumberType.NO_TEXT
        } else {
            this.m_tupletDesc.shownumber = TupletNumberType.SHOW_NUMBER
        }

        // set number and bracket placement
        if (tupletPlacement === 'above') {
            this.m_tupletDesc.direction = DirectionV.UP
        } else if (tupletPlacement === 'below') {
            this.m_tupletDesc.direction = DirectionV.DOWN
        } else if (!tupletPlacement) {
            // ignore
        } else {
            this.m_logger.logError(`unknown tuplet placement: ${tupletPlacement}`, this.m_e)
        }
    }

    otherNotation(): void {
        const smufl = this.m_e.attribute('smufl')

        if (smufl) {
            const id = SymNames.symIdByName(smufl, SymId.noSym)
            const notation = Notation.notationWithAttributes(this.m_e.name(), this.m_e.attributes(), 'notations', id)
            notation.setVisible(this.m_visible)
            this.m_notations.push(notation)
            this.m_e.skipCurrentElement()
        }
    }
}

//---------------------------------------------------------
//   MusicXmlParserPass2
//---------------------------------------------------------

export class MusicXmlParserPass2 {
    // generic pass 2 data

    m_e = new XmlStreamReader()
    m_divs = 0                        // the current divisions value
    m_score: Score              // the score
    m_pass1: MusicXmlParserPass1          // the pass1 results
    m_logger: MusicXmlLogger    // Error logger
    m_errors = ''                       // Errors to present to the user

    // part specific data (TODO: move to part-specific class)

    // Measure duration according to last timesig read
    // TODO: store timesigs read in pass 1, use those instead
    // or use score->sigmap() ?
    m_timeSigDura = new Fraction()

    m_slurs: SlurStack = stack(() => new SlurDesc())
    m_trills: TrillStack = stack(() => null)            // Current trills
    m_brackets: BracketsStack = stack(() => new MusicXmlExtendedSpannerDesc())
    m_ottavas: OttavasStack = stack(() => new MusicXmlExtendedSpannerDesc())                // Current ottavas
    m_hairpins: HairpinsStack = stack(() => new MusicXmlExtendedSpannerDesc())              // Current hairpins
    m_inferredHairpins: InferredHairpinsStack = []
    m_inferredTempoLines: InferredTempoLineStack = []
    m_dummyNewMusicXmlSpannerDesc = new MusicXmlExtendedSpannerDesc()

    m_glissandi: GlissandoStack = stack(() => [null, null])   // Current slides ([0]) / glissandi ([1])

    m_ties = new MusicXmlTieMap()
    m_unstartedTieNotes: Note[] = []
    m_unendedTieNotes: Note[] = []
    m_lastVolta: Volta | null = null
    m_hasDrumset = false                     // drumset defined TODO: move to pass 1

    m_spanners: MusicXmlSpannerMap = new Map()

    m_pedal = new MusicXmlExtendedSpannerDesc()           // Current pedal
    m_pedalContinue: Pedal | null = null              // Current pedal type="change" requiring fixup
    m_harmony: Harmony | null = null                  // Current harmony
    m_tremStart: Chord | null = null                  // Starting chord for current tremolo
    m_figBass: FiguredBass | null = null              // Current figured bass element (to attach to next note)
    m_delayedOttava: SLine | null = null              // Current delayed ottava
    m_segnos: SegnoStack = new IntMap<Marker>()                           // List of segno markings
    m_multiMeasureRestCount = 0
    m_measureNumber = 0                       // Current measure number as written in the score
    m_extendedLyrics = new MusicXmlLyricsExtend()         // Lyrics with "extend" requiring fixup
    m_graceNoteLyrics: GraceNoteLyrics[] = []   // Lyrics to be moved from grace note to main note

    m_measureStyleSlash = MusicXmlSlash.NONE   // Are we inside a measure to be displayed as slashes?

    m_nstaves = 0                          // Number of staves in current part
    m_measureRepeatNumMeasures: number[] = []
    m_measureRepeatCount: number[] = []

    m_sysElements: SystemElements = new IntMap<EngravingItem>(true)
    m_inferredPerc: InferredPercList = []

    constructor(score: Score, pass1: MusicXmlParserPass1, logger: MusicXmlLogger) {
        this.m_divs = 0
        this.m_score = score
        this.m_pass1 = pass1
        this.m_logger = logger
    }

    errors(): string { return this.m_errors }

    // part specific data interface functions
    divs(): number { return this.m_divs }

    delayedOttava(): SLine | null { return this.m_delayedOttava }
    setDelayedOttava(ottava: SLine | null): void { this.m_delayedOttava = ottava }

    addInferredHairpin(hp: Hairpin): void { this.m_inferredHairpins.push(hp) }
    getInferredHairpins(): InferredHairpinsStack { return this.m_inferredHairpins }

    addInferredTempoLine(hp: GradualTempoChange): void { this.m_inferredTempoLines.push(hp) }
    getInferredTempoLine(): InferredTempoLineStack { return this.m_inferredTempoLines }

    addSystemElement(el: EngravingItem, tick: Fraction): void { this.m_sysElements.insert(tick.ticks(), el) }
    /** a copy (C++ returns the multimap by value) */
    systemElements(): SystemElements {
        const r = new IntMap<EngravingItem>(true)
        for (const [k, v] of this.m_sysElements) {
            r.insert(k, v)
        }
        return r
    }

    addInferredPercInstr(instr: InferredPercInstr): void {
        this.m_inferredPerc.push(instr)
    }

    /** parse(const ByteArray& data) and (without data, private) parse() */
    /** returns the description itself (C++ MusicXmlExtendedSpannerDesc&) */

    // private
    // (accidental() and timeModification() are declared in C++ but not defined)

    // multi-measure rest state handling

    //---------------------------------------------------------
    //   addElemOffset
    //---------------------------------------------------------

    addElemOffset(el: EngravingItem, track: track_idx_t,
        placement: string, measure: Measure | null, tick: Fraction): void {
        if (!measure) {
            return
        }
        let elTick = tick

        if (placement) {
            if (el.hasVoiceAssignmentProperties()) {
                el.setProperty(Pid.DIRECTION, placement === 'above' ? DirectionV.UP : DirectionV.DOWN)
                el.setPropertyFlags(Pid.DIRECTION, PropertyFlags.UNSTYLED)
            } else {
                el.setPlacement(placement === 'above' ? PlacementV.ABOVE : PlacementV.BELOW)
                el.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
                if (!el.isSticking()) {
                    el.resetProperty(Pid.OFFSET)
                }
            }
        }
        const endTick = measure.score().endTick()
        if (elTick.gt(endTick)) {
            elTick = endTick
        }

        el.setTrack(el.isTempoText() ? 0 : track)      // TempoText must be in track 0
        const s = measure.getSegment(SegmentType.ChordRest, elTick)

        if (el.isSticking()) {
            if (el.propertyFlags(Pid.OFFSET) === PropertyFlags.UNSTYLED) {
                const item = s.element(el.track())
                const chord = item && item.isChord() ? item as Chord : null
                const hasGraceNotes = !!chord && chord.graceNotes().length > 0

                if (!hasGraceNotes) {
                    el.resetProperty(Pid.OFFSET)
                }
            }
        }

        if (el.systemFlag()) {
            const finale = this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.FINALE
            const score = measure.score()
            const st = score.staff(track2staff(track))!

            if (!st.isSystemObjectStaff() && st.idx() !== 0) {
                if (finale) {
                    return
                }
                score.addSystemObjectStaff(st)
            }

            let found = false
            for (const existingEl of this.systemElements().valuesOf(elTick.ticks())) {
                if (el.type() === existingEl.type()) {
                    if (el.isTextBase()) {
                        const elText = el as TextBase
                        const existingText = existingEl as TextBase
                        if (elText.xmlText() === existingText.xmlText()) {
                            found = true
                            break
                        } else {
                            continue
                        }
                    }
                    found = true
                    break
                }
            }
            if (!found) {
                el.setParent(s)
                this.addSystemElement(el, elTick)
            }
        } else {
            s.add(el)
        }
    }

    //---------------------------------------------------------
    //   The MusicXML parser, pass 2
    //---------------------------------------------------------

    //---------------------------------------------------------
    //   addError
    //---------------------------------------------------------

    addError(error: string): void {
        if (error) {
            this.m_logger.logError(error, this.m_e)
            this.m_errors += errorStringWithLocation(this.m_e.byteOffset(), error) + '\n'
        }
    }

    //---------------------------------------------------------
    //   initPartState
    //---------------------------------------------------------

    /**
     Initialize members as required for reading the MusicXML part element.
     TODO: factor out part reading into a separate class
     TODO: preferably use automatically initialized variables
     */

    initPartState(partId: string): void {
        this.m_timeSigDura = new Fraction(0, 0)               // invalid
        this.m_ties.clear()
        this.m_unstartedTieNotes = []
        this.m_unendedTieNotes = []
        this.m_lastVolta = null
        this.m_hasDrumset = false
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            this.m_slurs[i] = new SlurDesc()
        }
        for (let i = 0; i < MAX_NUMBER_LEVEL; ++i) {
            this.m_trills[i] = null
        }
        for (const i of this.m_glissandi) {
            i[0] = i[1] = null
        }
        this.m_pedalContinue = null
        this.m_harmony = null
        this.m_tremStart = null
        this.m_figBass = null
        this.m_delayedOttava = null
        this.m_multiMeasureRestCount = -1
        this.m_measureStyleSlash = MusicXmlSlash.NONE
        this.m_extendedLyrics.init()
        this.m_graceNoteLyrics = []
        this.m_inferredHairpins = []
        this.m_inferredTempoLines = []
        this.m_inferredPerc = []

        this.m_nstaves = this.m_pass1.getPart(partId)!.nstaves()
        this.m_measureRepeatNumMeasures = new Array<number>(this.m_nstaves).fill(0)
        this.m_measureRepeatCount = new Array<number>(this.m_nstaves).fill(0)
    }

    //---------------------------------------------------------
    //   findIncompleteSpannersAtPartEnd
    //---------------------------------------------------------

    findIncompleteSpannersAtPartEnd(): SpannerSet {
        const res: SpannerSet = new Set()
        findIncompleteSpannersInStack('bracket', this.m_brackets, res)
        findIncompleteSpannersInStack('wedge', this.m_hairpins, res)
        findIncompleteSpannersInStack('octave-shift', this.m_ottavas, res)
        if (this.m_pedal.sp) {
            // pedal not terminated at end of part
            res.add(this.m_pedal.sp)
            this.m_pedal.reset()
        }
        return res
    }

    //---------------------------------------------------------
    // multi-measure rest state handling
    //---------------------------------------------------------

    // If any multi-measure rest is found, the "create multi-measure rest" style setting is enabled.
    // First measure in a multi-measure rest gets setBreakMultiMeasureRest(true), then count down
    // the remaining number of measures.
    // The first measure after a multi-measure rest gets setBreakMultiMeasureRest(true).
    // For all other measures breakMultiMeasureRest is unchanged (stays default (false)).

    //---------------------------------------------------------
    //   setMultiMeasureRestCount
    //---------------------------------------------------------

    /**
     Set the multi-measure rest counter.
     */

    setMultiMeasureRestCount(count: number): void {
        this.m_multiMeasureRestCount = count
    }

    //---------------------------------------------------------
    //   getAndDecMultiMeasureRestCount
    //---------------------------------------------------------

    /**
     Return current multi-measure rest counter.
     Decrement counter if possible (not beyond -1).
     */

    getAndDecMultiMeasureRestCount(): number {
        const res = this.m_multiMeasureRestCount
        if (this.m_multiMeasureRestCount >= 0) {
            this.m_multiMeasureRestCount--
        }
        return res
    }

    //---------------------------------------------------------
    //   skipLogCurrElem
    //---------------------------------------------------------

    /**
     Skip the current element, log debug as info.
     */

    skipLogCurrElem(): void {
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   parse
    //---------------------------------------------------------

    /**
     Parse MusicXML in \a device and extract pass 2 data.
     (C++ parse(const ByteArray& data); without data: the private parse())
     */

    parse(data?: Uint8Array | string): Err {
        if (data !== undefined) {
            this.m_e.setData(data)
        }

        //---------------------------------------------------------
        //   parse
        //---------------------------------------------------------

        /**
         Start the parsing process, after verifying the top-level node is score-partwise
         */

        let found = false
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'score-partwise') {
                found = true
                this.scorePartwise()
            } else {
                this.m_logger.logError('this is not a MusicXML score-partwise file', this.m_e)
                this.m_e.skipCurrentElement()
                return Err.FileBadFormat
            }
        }

        if (!found) {
            this.m_logger.logError('this is not a MusicXML score-partwise file', this.m_e)
            return Err.FileBadFormat
        }

        return Err.NoError
    }

    //---------------------------------------------------------
    //   scorePartwise
    //---------------------------------------------------------

    /**
     Parse the MusicXML top-level (XPath /score-partwise) node.
     */

    scorePartwise(): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'part') {
                this.part()
            } else if (this.m_e.name() === 'part-list') {
                this.partList()
            } else {
                this.skipLogCurrElem()
            }
        }
        // set last measure barline to normal or MuseScore will generate light-heavy EndBarline
        // this creates non-generated barlines spanning only the current instrument
        // BarLine::_spanStaff is set using the default in Staff::_barLineSpan
        const lm = this.m_score.lastMeasure()
        if (lm && (lm.endBarLineType() & BarLineType.NORMAL)) {
            for (let staffidx = 0; staffidx < this.m_score.nstaves(); ++staffidx) {
                const staff = this.m_score.staff(staffidx)!
                const b = createBarline(this.m_score, staffidx * VOICES, BarLineType.NORMAL, true, '', staff.barLineSpan())
                addBarlineToMeasure(lm, lm.endTick(), b)
            }
        }
        this.addError(checkAtEndElement(this.m_e, 'score-partwise'))

        for (const [, sysEl] of this.m_sysElements) {
            this.m_score.undoAddElement(sysEl)

            // Remove potential duplicated text for text and text lines
            const elIsText = (sysEl.isTextBase() || sysEl.isTextLineBase())
            if (!elIsText) {
                continue
            }
            const score = sysEl.score()
            const seg = score ? score.tick2segment(sysEl.tick(), false, SegmentType.ChordRest) : null
            if (!seg) {
                continue
            }
            const sysElText = sysEl.isTextBase() ? (sysEl as unknown as TextBase).plainText()
                : (sysEl as unknown as TextLineBase).beginText()
            const annotations: EngravingItem[] = [...seg.annotations()]
            for (const existingEl of annotations) {
                const bothText = (existingEl.isTextBase() || existingEl.isTextLineBase()) && elIsText
                if (existingEl && existingEl !== sysEl && bothText) {
                    const existingText = existingEl.isTextBase() ? (existingEl as unknown as TextBase).plainText()
                        : (existingEl as unknown as TextLineBase).beginText()
                    const textMatches = existingText === sysElText
                    const placementMatches = existingEl.placement() === sysEl.placement()
                    const staffMatches = existingEl.staffIdx() === sysEl.staffIdx()
                    if (textMatches && (!existingEl.systemFlag() || staffMatches) && placementMatches) {
                        this.m_score.removeElement(existingEl)
                    }
                }
            }
        }
    }

    //---------------------------------------------------------
    //   partList
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part-list node.
     */

    partList(): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'score-part') {
                this.scorePart()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   scorePart
    //---------------------------------------------------------

    // Parse the /score-partwise/part-list/score-part node.
    // TODO: nothing required for pass 2 ?

    scorePart(): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'midi-instrument') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else if (this.m_e.name() === 'score-instrument') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else if (this.m_e.name() === 'part-name') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   part
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part node.
     */

    part(): void {
        const id = this.m_e.attribute('id')

        if (!this.m_pass1.hasPart(id)) {
            this.m_logger.logError(`MusicXmlParserPass2::part cannot find part '${id}'`, this.m_e)
            this.skipLogCurrElem()
            return
        }

        this.initPartState(id)

        const instruments = this.m_pass1.getInstruments(id)
        this.m_hasDrumset = hasDrumset(instruments)

        // set the part name
        const part = this.m_pass1.getPart(id)!
        const mxmlPart = this.m_pass1.getMusicXmlPart(id)
        let partName = mxmlPart.getName()
        setPartInstruments(this.m_logger, this.m_e, part, id, this.m_score, this.m_pass1.getInstrList(id), this.m_pass1.getIntervals(id),
            instruments, partName)
        partName = replacePartNameAccidentals(partName)
        part.setPartName(partName)
        const inconsistentVisibility = mxmlPart.getPrintName() !== mxmlPart.getPrintAbbr()
        if (!isLikelyIncorrectPartName(partName)) {
            part.setLongNameAll(partName)
        } else {
            part.setLongNameAll('')
        }
        if (mxmlPart.getAbbr() !== '') {
            part.setPlainShortNameAll(mxmlPart.getAbbr())
            if (inconsistentVisibility) {
                // TODO: improve logic to set visibility of part names
                part.setLongNameAll('')
            }
        } else {
            part.setPlainShortNameAll('')
        }
        // set the parts first instrument
        // try to prevent an empty track name
        if (part.partName() === '') {
            const instrId = this.m_pass1.getInstrList(id).instrument(new Fraction(0, 1))
            part.setPartName(instruments.get(instrId)?.name ?? '')
        }
        if (this.m_pass1.nparts() === 1 && mxmlPart.getPrintName() && mxmlPart.getPrintAbbr()) {
            this.m_score.style().set(Sid.hideInstrumentNameIfOneInstrument, false)
        }

        // read the measures
        let nr = 0 // current measure sequence number (always increments by one for each measure)
        this.m_measureNumber = 0 // written measure number (doesn't always increment by 1)
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'measure') {
                const t = this.m_pass1.getMeasureStart(nr)
                if (t.isValid()) {
                    this.measure(id, t)
                } else {
                    this.m_logger.logError(`no valid start time for measure ${nr + 1}`, this.m_e)
                    this.m_e.skipCurrentElement()
                }
                ++nr
            } else {
                this.skipLogCurrElem()
            }
        }

        // stop all remaining extends for this part and add remaining ottava if present
        const lm = part.score().lastMeasure()
        if (lm) {
            const strack = this.m_pass1.trackForPart(id)
            const etrack = strack + part.nstaves() * VOICES
            const lastTick = lm.endTick()
            for (let trk = strack; trk < etrack; trk++) {
                this.m_extendedLyrics.setExtend(-1, trk, lastTick)
            }
            if (this.m_delayedOttava && this.m_delayedOttava.tick2().lt(lastTick)) {
                handleSpannerStop(this.m_delayedOttava, this.m_delayedOttava.track2(), lastTick, this.m_spanners)
                this.m_delayedOttava = null
            }
        }

        if (musicXmlImportConfiguration().inferTextType()) {
            for (const hp of this.m_inferredHairpins) {
                hp.score().addElement(hp)
            }
            for (const line of this.m_inferredTempoLines) {
                this.addSystemElement(line, line.tick())
            }
        }

        const incompleteSpanners = this.findIncompleteSpannersAtPartEnd()
        for (const [sp, ticks] of this.m_spanners) {
            const tick1 = Fraction.fromTicks(ticks[0])
            const tick2 = Fraction.fromTicks(ticks[1])
            if (!incompleteSpanners.has(sp)) {
                // complete spanner found
                // Create time tick for hairpin
                if (sp.isHairpin()) {
                    createTimeTick(this.m_score, tick1, track2staff(sp.track()))
                }
                sp.setTick(tick1)
                sp.setTick2(tick2)
                sp.score().addElement(sp)
            } else {
                // incomplete spanner -> cleanup
            }
        }
        this.m_spanners.clear()

        // Clean up any remaining ties
        const tieMap = new MusicXmlTieMap()
        for (const [k, v] of this.m_ties) {
            tieMap.set(k, v)
        }
        for (const [k, tie] of tieMap) {
            if (tie) {
                this.m_unendedTieNotes.push(tie.startNote()!)
                this.m_ties.erase(k)
            }
        }
        // Find ties between different voices which may have been missed
        for (const startNote of this.m_unendedTieNotes) {
            const unendedTie = startNote.tieFor()
            if (!unendedTie) {
                continue
            }
            const startChord = startNote.chord()
            const startMeasure = startChord ? startChord.measure() : null
            for (const endNote of this.m_unstartedTieNotes) {
                if (endNote.tieBack()) {
                    continue
                }
                const endChord = endNote.chord()
                if (startNote.pitch() === endNote.pitch() && startChord.tick().lt(endChord.tick())
                    && (startMeasure === endChord.measure() || startChord.tick().plus(startChord.actualTicks()).eq(endChord.tick()))) {
                    unendedTie.setEndNote(endNote)
                    endNote.setTieBack(unendedTie)
                }
            }

            if (!unendedTie.endNote()) {
                // Tie started with no matching end tags
                // Find a note of the same pitch in the same voice immediately following the start chord
                let nextSeg = startChord ? startChord.segment() : null
                while (nextSeg && nextSeg.tick().lt(startChord.tick().plus(startChord.ticks()))) {
                    nextSeg = nextSeg.nextCR(startChord.track(), true)
                }
                let nextEl = nextSeg ? nextSeg.element(startNote.track()) : null
                let nextChord = nextEl && nextEl.isChord() ? nextEl as unknown as Chord : null
                let matchingNote = nextChord ? nextChord.findNote(startNote.pitch()) : null

                if (matchingNote && matchingNote.tpc() === startNote.tpc() && matchingNote !== startNote) {
                    unendedTie.setEndNote(matchingNote)
                    matchingNote.setTieBack(unendedTie)
                } else if (startChord) {
                    // try other voices in the stave
                    const p = startChord.part()!
                    for (let track = p.startTrack(); track < p.endTrack() + VOICES; track++) {
                        nextEl = nextSeg ? nextSeg.element(track) : null
                        nextChord = nextEl && nextEl.isChord() ? nextEl as unknown as Chord : null
                        if (nextChord && nextChord.vStaffIdx() !== startChord.vStaffIdx()) {
                            continue
                        }
                        matchingNote = nextChord ? nextChord.findNote(startNote.pitch()) : null
                        if (matchingNote && matchingNote.tpc() === startNote.tpc() && matchingNote !== startNote) {
                            unendedTie.setEndNote(matchingNote)
                            matchingNote.setTieBack(unendedTie)
                        }
                    }
                }
            }

            if (!unendedTie.endNote()) {
                cleanupUnterminatedTie(unendedTie, this.m_score, this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.DOLET6)
            }
        }

        this.m_ties.clear()
        this.m_unstartedTieNotes = []
        this.m_unendedTieNotes = []

        if (this.m_hasDrumset) {
            const drumset = new Drumset()
            const instrumentsAfterPass2 = this.m_pass1.getInstruments(id)
            initDrumset(drumset, instrumentsAfterPass2)
            // set staff type to percussion if incorrectly imported as pitched staff
            // Note: part has been read, staff type already set based on clef type and staff-details
            // but may be incorrect for a percussion staff that does not use a percussion clef
            setStaffTypePercussion(part, drumset)
        }

        let showPart = false
        for (const staff of part.staves()) {
            if (staff.visible()) {
                showPart = true
                break
            }
        }

        part.setShow(showPart)

        this.addError(checkAtEndElement(this.m_e, 'part'))
    }

    //---------------------------------------------------------
    //   measure
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure node.
     */

    measure(partId: string, time: Fraction): void {
        // "measure numbers" don't have to be actual numbers in MusicXML
        let isNumericMeasureNumber = false
        let parsedMeasureNumber = 0

        const numberA = this.m_e.asciiAttribute('number')
        if (numberA !== '') {
            if (numberA[0] === 'X') {
                isNumericMeasureNumber = false
            } else {
                const ok = { v: false }
                parsedMeasureNumber = strToInt(numberA, ok)
                isNumericMeasureNumber = ok.v
            }
        }

        const measure = findMeasure(this.m_score, time)
        if (!measure) {
            this.m_logger.logError(`measure at tick ${time.ticks()} not found!`, this.m_e)
            this.skipLogCurrElem()
            return
        }

        if (this.m_e.asciiAttribute('implicit') === 'yes') {
            // Implicit measure: expect measure number to be unchanged.
            measure.setIrregular(true)
        } else {
            // Normal measure: expect number to have increased by one.
            ++this.m_measureNumber
        }

        if (isNumericMeasureNumber) {
            // Actual measure number may differ from expected value.
            measure.setNoOffset(parsedMeasureNumber - this.m_measureNumber)
            this.m_measureNumber = parsedMeasureNumber
        }

        // set measure's RepeatFlag to none because musicXML is allowing single measure repeat and no ordering in repeat start and end barlines
        measure.setRepeatStart(false)
        measure.setRepeatEnd(false)

        /* TODO: for cutaway measures, i believe we can expect the staff to continue to be cutaway until another
        * print-object="yes" attribute is found. (C++ code commented out) */

        let mTime = new Fraction()   // current time stamp within measure
        let prevTime = new Fraction()   // time stamp within measure previous chord
        let prevChord: Chord | null = null         // previous chord
        let mDura = new Fraction()   // current total measure duration
        const gcl: GraceChordList = []   // grace chords collected sofar
        const gac = { v: 0 }         // grace after count in the grace chord list
        const beams: Beams = new StringMap<Beam | null>() // Current beam for each voice in the current part
        const cv = { v: '1' }         // current voice for chords, default is 1
        const fbl: FiguredBassList = []                 // List of figured bass elements under a single note
        const tupletStates = new MusicXmlTupletStates()         // Tuplet state for each voice in the current part
        const tuplets: Tuplets = new StringMap()         // Current tuplet for each voice in the current part
        const delayedDirections: DelayedDirectionsList = [] // Directions to be added to score *after* collecting all and sorting
        const inferredFingerings: InferredFingeringsList = [] // Directions to be reinterpreted as Fingerings
        const arpMap = new ArpeggioMap()
        const delayedArps: DelayedArpMap = new IntMap()
        const delayedHarmony: HarmonyMap = new IntMap<HarmonyDesc>(true)
        const measureHasCoda = { v: false }
        let tempoString = ''  // helper for Dorico imports

        // collect candidates for courtesy accidentals to work out at measure end
        // (C++ std::map<Note*, int>: ordered on note address; insert() does not overwrite)
        const alterMap = new Map<Note, number>()

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'attributes') {
                this.attributes(partId, measure, time.plus(mTime))
            } else if (this.m_e.name() === 'direction') {
                const dir = new MusicXmlParserDirection(this.m_e, this.m_score, this.m_pass1, this, this.m_logger)
                if (tempoString !== '' && this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.DORICO) {
                    dir.setBpm(strToDouble(tempoString))
                    tempoString = ''
                }
                dir.direction(partId, measure, time.plus(mTime), this.m_spanners, delayedDirections,
                    inferredFingerings, delayedHarmony, measureHasCoda, this.m_segnos)
            } else if (this.m_e.name() === 'figured-bass') {
                const fb = this.figuredBass()
                if (fb) {
                    fbl.push(fb)
                }
            } else if (this.m_e.name() === 'harmony') {
                this.harmony(partId, measure, time.plus(mTime), delayedHarmony)
            } else if (this.m_e.name() === 'note') {
                if (tempoString !== '') {
                    // sound tempo="..."
                    // create an invisible default TempoText
                    // to prevent duplicates, only if none is present yet
                    const tick = time.plus(mTime)

                    if (canAddTempoText(this.m_score.tempomap(), tick.ticks())) {
                        const tpo = strToDouble(tempoString) / 60
                        const t = Factory.createItem(ElementType.TEMPO_TEXT, scoreDummy(this.m_score).segment()) as TempoText
                        t.setXmlText(`${TempoText.duration2tempoTextString(new TDuration(DurationType.V_QUARTER))} = ${tempoString}`)
                        t.setVisible(false)
                        t.setTempo(tpo)
                        t.setFollowText(true)

                        this.m_score.setTempo(tick, tpo)

                        this.addElemOffset(t, this.m_pass1.trackForPart(partId), 'above', measure, tick)
                    }
                    tempoString = ''
                }

                // Correct delayed ottava tick
                if (this.m_delayedOttava && this.m_delayedOttava.tick2().lt(time.plus(mTime))) {
                    handleSpannerStop(this.m_delayedOttava, this.m_delayedOttava.track2(), time.plus(mTime), this.m_spanners)
                    this.m_delayedOttava = null
                }
                const missingPrev = { v: new Fraction() }
                const dura = { v: new Fraction() }
                const missingCurr = { v: new Fraction() }
                const alt = { v: -10 }                          // any number outside range of xml-tag "alter"
                // note: chord and grace note handling done in note()
                // dura > 0 iff valid rest or first note of chord found
                const n = this.note(partId, measure, time.plus(mTime), time.plus(prevTime), missingPrev, dura, missingCurr, cv, gcl, gac,
                    beams, fbl, alt, tupletStates, tuplets, arpMap, delayedArps)
                if (n && !n.chord().isGrace()) {
                    prevChord = n.chord()          // remember last non-grace chord
                }
                if (n && n.accidental() && n.accidental()!.accidentalType() !== AccidentalType.NONE) {
                    if (!alterMap.has(n)) {
                        alterMap.set(n, alt.v)
                    }
                }
                if (missingPrev.v.isValid()) {
                    mTime = mTime.plus(missingPrev.v)
                }
                if (dura.v.isValid() && dura.v.gt(new Fraction(0, 1))) {
                    prevTime = mTime         // save time stamp last chord created
                    mTime = mTime.plus(dura.v)
                    if (mTime.gt(mDura)) {
                        mDura = mTime
                    }
                }
                if (missingCurr.v.isValid()) {
                    mTime = mTime.plus(missingCurr.v)
                }
            } else if (this.m_e.name() === 'forward') {
                const dura = { v: new Fraction() }
                this.forward(dura)
                if (dura.v.isValid()) {
                    mTime = mTime.plus(dura.v)
                    if (mTime.gt(mDura)) {
                        mDura = mTime
                    }
                }
            } else if (this.m_e.name() === 'backup') {
                const dura = { v: new Fraction() }
                this.backup(dura)
                if (dura.v.isValid()) {
                    if (dura.v.le(mTime)) {
                        mTime = mTime.minus(dura.v)
                    } else {
                        this.m_logger.logError('backup beyond measure start', this.m_e)
                        mTime = new Fraction(0, 1)
                    }
                    // check if the tick position is smaller than the minimum division resolution
                    // (possibly caused by rounding errors) and in that case set position to 0
                    if (mTime.isNotZero() && (this.m_divs > 0) && (mTime.lt(new Fraction(1, 4 * this.m_divs)))) {
                        this.m_logger.logError('backup to a fractional tick smaller than the minimum division', this.m_e)
                        mTime = new Fraction(0, 1)
                    }
                }
            } else if (this.m_e.name() === 'sound') {
                tempoString = this.m_e.attribute('tempo')
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'barline') {
                this.barline(partId, measure, time.plus(mTime))
            } else if (this.m_e.name() === 'print') {
                if (this.m_score.parts()[0] === this.m_pass1.getPart(partId)) {
                    // only process for first part
                    while (this.m_e.readNextStartElement()) {
                        if (this.m_e.name() === 'page-layout') {
                            this.m_e.skipCurrentElement()            // skip but don't log
                        } else if (this.m_e.name() === 'system-layout') {
                            this.m_e.skipCurrentElement()            // skip but don't log
                        } else if (this.m_e.name() === 'staff-layout') {
                            this.m_e.skipCurrentElement()            // skip but don't log
                        } else if (this.m_e.name() === 'measure-layout') {
                            this.measureLayout(measure)
                        } else {
                            this.skipLogCurrElem()
                        }
                    }
                } else {
                    this.m_e.skipCurrentElement()
                }
            } else {
                this.skipLogCurrElem()
            }

            mDura = mDura.reduced()
            mTime = mTime.reduced()
        }

        // convert remaining grace chords to grace after
        gac.v = gcl.length
        addGraceChordsAfter(prevChord, gcl, gac)

        // prevent tuplets from crossing measure boundaries
        resetTuplets(tuplets)

        // fill possible gaps in voice 1
        const part = this.m_pass1.getPart(partId)!   // should not fail, we only get here if the part exists
        fillGapsInFirstVoices(measure, part)

        // Prevent any beams from extending into the next measure
        for (let i = 0; i < beams.size(); ++i) {
            const beam = { v: beams.valueAt(i) }
            if (beam.v) {
                removeBeam(beam)
                beams.setValueAt(i, beam.v)
            }
        }

        // Sort and add inferred fingerings
        // Lambda: sort by absolute value of totalY
        inferredFingerings.sort((a: MusicXmlInferredFingering, b: MusicXmlInferredFingering) => Math.abs(a.totalY()) - Math.abs(b.totalY()))
        for (const inferredFingering of inferredFingerings) {
            if (!inferredFingering.findAndAddToNotes(measure)) {
                // Could not find notes to add to; print as direction
                delayedDirections.push(inferredFingering.toDelayedDirection())
            }
        }

        for (const [htick, harmonyDesc] of delayedHarmony) {
            const tick = Fraction.fromTicks(htick)
            const fd = harmonyDesc.m_fretDiagram
            if (fd) {
                fd.setTrack(harmonyDesc.m_track)
                const s = measure.getSegment(SegmentType.ChordRest, tick)
                const harmony = harmonyDesc.m_harmony
                if (harmony) {
                    harmony.setProperty(Pid.ALIGN, new Align(AlignH.HCENTER, AlignV.TOP))
                    harmony.setTrack(harmonyDesc.m_track)
                    fd.add(harmony)
                }
                s.add(fd)
            } else if (harmonyDesc.m_harmony) {
                const harmony = harmonyDesc.m_harmony
                harmony.setTrack(harmonyDesc.m_track)
                const s = measure.getSegment(SegmentType.ChordRest, tick)
                s.add(harmony)
            }
        }

        // Sort and add delayed directions
        // Lambda: sort by absolute value of totalY
        delayedDirections.sort((a: MusicXmlDelayedDirectionElement, b: MusicXmlDelayedDirectionElement) =>
            Math.abs(a.totalY()) - Math.abs(b.totalY()))
        for (const direction of delayedDirections) {
            this.addElemOffset(direction.element(), direction.track(), direction.placement(), direction.measure(), direction.tick())
        }

        // TODO:
        // - how to handle _timeSigDura.isZero (shouldn't happen ?)
        // - how to handle unmetered music
        if (this.m_timeSigDura.isValid() && !this.m_timeSigDura.isZero()) {
            measure.setTimesig(this.m_timeSigDura)
        }

        // mark superfluous accidentals as user accidentals
        const scoreRelStaff = this.m_score.staffIdxOfPart(part)
        const key = this.m_score.staff(scoreRelStaff)!.keySigEvent(time).key()
        markUserAccidentals(scoreRelStaff, part.nstaves(), key, measure, alterMap)

        // multi-measure rest handling
        if (this.getAndDecMultiMeasureRestCount() === 0) {
            // measure is first measure after a multi-measure rest
            measure.setBreakMultiMeasureRest(true)
        }

        this.setMeasureRepeats(scoreRelStaff, measure)

        this.addError(checkAtEndElement(this.m_e, 'measure'))
    }

    //---------------------------------------------------------
    //   setMeasureRepeats
    //---------------------------------------------------------

    /**
     Measure repeat handling, based on values set in measureStyle().
     */

    setMeasureRepeats(scoreRelStaff: staff_idx_t,
        measure: Measure): void {
        for (let i = 0; i < this.m_nstaves; ++i) {
            const staffIdx = scoreRelStaff + i
            const track = staff2track(staffIdx)
            if (this.m_measureRepeatNumMeasures[i]) {
                // delete anything already added to measure
                this.m_score.makeGap(measure.first(SegmentType.ChordRest)!, track, measure.stretchedLen(this.m_score.staff(staffIdx)!), null)

                if (this.m_measureRepeatCount[i] === this.m_measureRepeatNumMeasures[i]) {
                    // starting a new one, not continuing a multi-measure group
                    this.m_measureRepeatCount[i] = 1
                } else {
                    // continue building measure repeat group
                    ++this.m_measureRepeatCount[i]
                }

                const numMeasures = this.m_measureRepeatNumMeasures[i]
                if (((numMeasures % 2) && (this.m_measureRepeatCount[i] - 1 === Math.trunc(numMeasures / 2)))
                    || (!(numMeasures % 2) && (this.m_measureRepeatCount[i] === numMeasures / 2))) {
                    // MeasureRepeat element goes in center measure of group if odd-numbered,
                    // or last measure of first half of group if even-numbered
                    this.m_score.addMeasureRepeat(measure.tick(), track, numMeasures)
                } else {
                    // measures that are part of group but do not contain the element have undisplayed whole rests
                    this.m_score.addRest(measure.tick(), track, new TDuration(DurationType.V_MEASURE), null)
                }
            } else {
                // measureStyle() hit a "stop" element most recently
                this.m_measureRepeatCount[i] = 0
            }
            measure.setMeasureRepeatCount(this.m_measureRepeatCount[i], staffIdx)
        }
    }

    //---------------------------------------------------------
    //   measureLayout
    //---------------------------------------------------------

    measureLayout(measure: Measure): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'measure-distance') {
                const val = new Spatium(this.m_e.readDouble() / 10.0)
                if (!measure.prev() || !measure.prev()!.isHBox()) {
                    const gap = this.m_score.insertBox(ElementType.HBOX, measure)
                    ;(gap as HBox).setBoxWidth(val)
                }
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   attributes
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes node.
     */

    /* Notes:
     * Number of staves has already been set in pass 1
     * MusicXML order is key, time, clef
     * -> check if it is necessary to insert them in order
     */

    attributes(partId: string, measure: Measure,
        tick: Fraction): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'clef') {
                this.clef(partId, measure, tick)
            } else if (this.m_e.name() === 'divisions') {
                this.divisions()
            } else if (this.m_e.name() === 'key') {
                this.key(partId, measure, tick)
            } else if (this.m_e.name() === 'measure-style') {
                this.measureStyle(measure)
            } else if (this.m_e.name() === 'staff-details') {
                this.staffDetails(partId, measure)
            } else if (this.m_e.name() === 'time') {
                this.time(partId, measure, tick)
            } else if (this.m_e.name() === 'transpose') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   staffDetails
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/staff-details node.
     */

    staffDetails(partId: string,
        measure: Measure | null = null): void {
        const part = this.m_pass1.getPart(partId)
        if (!part) {
            return
        }
        const staves = part.nstaves()

        const strNumber = this.m_e.attribute('number')
        let n = 0  // default
        if (strNumber !== '') {
            n = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strNumber))
            if (n < 0 || n >= staves) {
                this.m_logger.logError(`invalid staff-details number ${strNumber} (may be hidden)`, this.m_e)
                n = 0
            }
        }

        const staffIdx = this.m_score.staffIdxOfPart(part) + n

        const stringData = new StringData()
        const visible = this.m_e.asciiAttribute('print-object')
        const spacing = this.m_e.asciiAttribute('print-spacing')
        if (visible === 'no') {
            // EITHER:
            //  1) this indicates an empty staff that is hidden
            //  2) this indicates a cutaway measure. if it is a cutaway measure then print-spacing will be yes
            if (spacing === 'yes') {
                measure!.setStaffVisible(staffIdx, false)
            } else if (measure && !measure.hasVoices(staffIdx) && measure.isOnlyRests(staffIdx * VOICES)) {
                // measures with print-object="no" are generally exported by exporters such as dolet when empty staves are hidden.
                // for this reason, if we see print-object="no" (and no print-spacing), we can assume that this indicates we should set
                // the hide empty staves style.
                this.m_score.style().set(Sid.hideEmptyStaves, true)
                this.m_score.style().set(Sid.dontHideStavesInFirstSystem, false)
            } else {
                // this doesn't apply to a measure, so we'll assume the entire staff has to be hidden.
                this.m_score.staff(staffIdx)!.setVisible(false)
            }
        } else if (visible === 'yes' || visible === '') {
            if (measure) {
                this.m_score.staff(staffIdx)!.setVisible(true)
                measure.setStaffVisible(staffIdx, true)
            }
        } else {
            this.m_logger.logError('print-object should be "yes" or "no"')
        }

        let staffLines = 0
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'staff-lines') {
                // save staff lines for later
                staffLines = this.m_e.readInt()
                // for a TAB staff also resize the string table and init with zeroes
                if (0 < staffLines) {
                    const sl = stringData.stringList()
                    sl.length = 0
                    for (let i = 0; i < staffLines; ++i) {
                        sl.push(new InstrString())
                    }
                } else {
                    this.m_logger.logError(`illegal staff-lines ${staffLines}`, this.m_e)
                }
            } else if (this.m_e.name() === 'line-detail') {
                const color = Color.fromString(this.m_e.attribute('color'))
                if (color.isValid()) {
                    this.m_score.staff(staffIdx)!.staffType(new Fraction(0, 1)).setColor(color)
                }
                if (this.m_e.attribute('print-object') === 'no') {
                    this.m_score.staff(staffIdx)!.staffType(new Fraction(0, 1)).setInvisible(true)
                }
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'staff-tuning') {
                this.staffTuning(stringData)
            } else if (this.m_e.name() === 'staff-size') {
                const scaling = this.m_e.doubleAttribute('scaling', 100.0)
                const val = new Spatium(this.m_e.readDouble() / scaling)
                this.m_score.staff(staffIdx)!.setProperty(Pid.MAG, scaling / 100.0)
                this.m_score.staff(staffIdx)!.setProperty(Pid.LINE_DISTANCE, val)
            } else {
                this.skipLogCurrElem()
            }
        }

        if (staffLines > 0) {
            setStaffLines(this.m_score, staffIdx, staffLines)
        }

        const i = part.instrument()
        if (this.m_score.staff(staffIdx)!.isTabStaff(new Fraction(0, 1))) {
            if (i.stringData().frets() === 0) {
                stringData.setFrets(25)
            } else {
                stringData.setFrets(i.stringData().frets())
            }
            if (stringData.strings() > 0) {
                i.setStringData(stringData)
            }
        } else if (stringData.strings() > 0) {
            this.m_logger.logError('trying to change string data for non-TAB staff (not supported)', this.m_e)
        }
    }

    //---------------------------------------------------------
    //   staffTuning
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/staff-details/staff-tuning node.
     */

    staffTuning(t: StringData | null): void {
        // ignore <staff-tuning> if not a TAB staff
        if (!t) {
            this.m_logger.logError('<staff-tuning> on non-TAB staff', this.m_e)
            this.skipLogCurrElem()
            return
        }

        const line = this.m_e.intAttribute('line')
        let step = 0
        let alter = 0
        let octave = 0
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'tuning-alter') {
                alter = strToInt(trimmed(this.m_e.readText()))
            } else if (this.m_e.name() === 'tuning-octave') {
                octave = this.m_e.readInt()
            } else if (this.m_e.name() === 'tuning-step') {
                const strStep = this.m_e.readText()
                const pos = 'CDEFGAB'.indexOf(strStep)
                if (strStep.length === 1 && pos >= 0 && pos < 7) {
                    step = pos
                } else {
                    this.m_logger.logError(`invalid step '${strStep}'`, this.m_e)
                }
            } else {
                this.skipLogCurrElem()
            }
        }

        if (0 < line && line <= t.stringList().length) {
            const pitch = MusicXmlStepAltOct2Pitch(step, alter, octave)
            if (pitch >= 0) {
                t.stringList()[line - 1].pitch = pitch
            } else {
                this.m_logger.logError(`invalid string ${line} tuning step/alter/oct ${step}/${alter}/${octave}`, this.m_e)
            }
        }
    }

    //---------------------------------------------------------
    //   measureStyle
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/measure-style node.
     - Initializes the "in multi-measure rest" state
     - Set/reset the "rhythmic/slash notation" state
     */

    measureStyle(measure: Measure): void {
        const staffNumberString = this.m_e.asciiAttribute('number')

        // by default, apply to all staves in part
        let startStaff = 0
        let endStaff = this.m_nstaves - 1

        // but if a staff number was specified in the measure-style tag, use that instead
        if (staffNumberString !== '') {
            let staffNumber = strToInt(staffNumberString)
            if (staffNumber < 1 || staffNumber > this.m_nstaves) {
                this.m_logger.logError('measure-style staff number can only be int from 1 to _nstaves.')
            }
            --staffNumber // convert to 0-based
            endStaff = startStaff = staffNumber
        }

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'multiple-rest') {
                const multipleRest = this.m_e.readInt()
                if (multipleRest > 1) {
                    this.m_multiMeasureRestCount = multipleRest
                    this.m_score.style().set(Sid.createMultiMeasureRests, true)
                    measure.setBreakMultiMeasureRest(true)
                } else {
                    this.m_logger.logError(`multiple-rest ${multipleRest} not supported`, this.m_e)
                }
            } else if (this.m_e.name() === 'measure-repeat') {
                const startStop = this.m_e.attribute('type')
                // note: possible "slashes" attribute is either redundant with numMeasures or not supported by MuseScore, so ignored either way
                if (startStop === 'start') {
                    const numMeasures = this.m_e.readInt()
                    for (let i = startStaff; i <= endStaff; i++) {
                        this.m_measureRepeatNumMeasures[i] = numMeasures
                        // measure repeat(s) haven't actually started yet in current measure, so this is a lie,
                        // but if we pretend it's true then everything is set for the next measure to restart
                        this.m_measureRepeatCount[i] = numMeasures
                    }
                } else { // "stop"
                    for (let i = startStaff; i <= endStaff; i++) {
                        this.m_measureRepeatNumMeasures[i] = 0
                    }
                    this.m_e.skipCurrentElement() // since not reading any text inside stop tag, we are done with this element
                }
            } else if (this.m_e.name() === 'slash') {
                const type = this.m_e.attribute('type')
                const stems = this.m_e.attribute('use-stems')
                this.m_measureStyleSlash = type === 'start' ? (stems === 'yes' ? MusicXmlSlash.RHYTHM : MusicXmlSlash.SLASH) : MusicXmlSlash.NONE
                this.m_e.skipCurrentElement()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   addSpanner
    //---------------------------------------------------------

    addSpanner(d: MusicXmlSpannerDesc): void {
        const spdesc = this.getSpanner(d)
        spdesc.sp = d.sp
    }

    //---------------------------------------------------------
    //   getSpanner
    //---------------------------------------------------------

    getSpanner(d: MusicXmlSpannerDesc): MusicXmlExtendedSpannerDesc {
        if (d.tp === ElementType.HAIRPIN && 0 <= d.nr && d.nr < MAX_NUMBER_LEVEL) {
            return this.m_hairpins[d.nr]
        } else if (d.tp === ElementType.OTTAVA && 0 <= d.nr && d.nr < MAX_NUMBER_LEVEL) {
            return this.m_ottavas[d.nr]
        } else if (d.tp === ElementType.PEDAL && 0 === d.nr) {
            return this.m_pedal
        } else if ((d.tp === ElementType.TEXTLINE || d.tp === ElementType.TRILL) && 0 <= d.nr && d.nr < MAX_NUMBER_LEVEL) {
            return this.m_brackets[d.nr]
        }
        this.m_logger.logError(`invalid number ${d.nr + 1}`, this.m_e)
        return this.m_dummyNewMusicXmlSpannerDesc
    }

    //---------------------------------------------------------
    //   clearSpanner
    //---------------------------------------------------------

    clearSpanner(d: MusicXmlSpannerDesc): void {
        const spdesc = this.getSpanner(d)
        spdesc.reset()
    }

    //---------------------------------------------------------
    //   deleteHandledSpanner
    //---------------------------------------------------------
    /**
     Delete a spanner that's already been added to _spanners.
     This is used to remove pedal markings that are never stopped
     */

    deleteHandledSpanner(spanner: SLine): void {
        this.m_spanners.delete(spanner)
    }

    inferredPercInstr(tick: Fraction,
        trackIdx: track_idx_t): InferredPercInstr {
        let instr = new InferredPercInstr()

        for (let i = 0; i < this.m_inferredPerc.length; ++i) {
            const it = this.m_inferredPerc[i]
            if (it.tick.eq(tick) && it.track === trackIdx) {
                instr = it
                this.m_inferredPerc.splice(i, 1)
                break
            }
        }

        return instr
    }

    //---------------------------------------------------------
    //   barline
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/barline node.
     */

    /*
     Following barline types are automatically generated by MuseScore in an EndBarLine segment at the end of a measure:
     - normal (excluding tick and short)
     - start repeat
     - end-start repeat
     - end repeat
     - final (at the end of the score only)
     The other barline types can also be in an EndBarLine segment at the end of a measure, but are NOT generated
     Mid-measure barlines are in a BarLine segment and are NOT generated
     Following barline types can only be at the end of a measure:
     - start repeat
     - end-start repeat
     - end repeat
     - final
    Regular barlines should not be added at the start or end of a measure, as that could lead to inconsistent behaviour.
     */

    barline(partId: string, measure: Measure, tick: Fraction): void {
        let loc = this.m_e.asciiAttribute('location')
        if (loc === '') {
            loc = 'right'
        }
        // Place barline in correct place
        let locTick = tick
        if (loc === 'left') {
            locTick = measure.tick()
        } else if (loc === 'right') {
            locTick = measure.endTick()
        }

        const codaLabel = this.m_e.attribute('coda')
        const segnoLabel = this.m_e.attribute('segno')

        let barStyle = ''
        let barlineColor = new Color()
        let endingNumber = ''
        let endingType = ''
        let endingColor = new Color()
        let endingText = ''
        let repeat = ''
        let printEnding = true

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'bar-style') {
                barlineColor = Color.fromString(this.m_e.asciiAttribute('color'))
                barStyle = this.m_e.readText()
            } else if (this.m_e.name() === 'segno') {
                const segnoColor = Color.fromString(this.m_e.asciiAttribute('color'))
                const segnoSymbol = this.m_e.asciiAttribute('smufl')
                const markedMeasure = (loc === 'right') ? measure.nextMeasure() : measure
                if (markedMeasure === null) {
                    this.m_logger.logError('coda or segno marker cannot be placed at the end of the score', this.m_e)
                    this.m_e.skipCurrentElement()
                    continue
                }
                const m = Factory.createItem(ElementType.MARKER, markedMeasure) as Marker
                m.setMarkerType(MarkerType.SEGNO)
                if (segnoSymbol !== '') {
                    m.setXmlText('<sym>' + segnoSymbol + '</sym>')
                }
                if (segnoLabel !== '') {
                    m.setLabel(segnoLabel)
                }
                if (segnoColor.isValid()) {
                    colorItem(m, segnoColor)
                }
                const track = this.m_pass1.trackForPart(partId)
                this.addElemOffset(m, track, 'above', markedMeasure, markedMeasure.tick())
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'coda') {
                const codaColor = Color.fromString(this.m_e.asciiAttribute('color'))
                const codaSymbol = this.m_e.asciiAttribute('smufl')
                const markedMeasure = (loc === 'right') ? measure.nextMeasure() : measure
                if (markedMeasure === null) {
                    this.m_logger.logError('coda or segno marker cannot be placed at the end of the score', this.m_e)
                    this.m_e.skipCurrentElement()
                    continue
                }
                const m = Factory.createItem(ElementType.MARKER, markedMeasure) as Marker
                m.setMarkerType(MarkerType.CODA)
                if (codaSymbol !== '') {
                    m.setXmlText('<sym>' + codaSymbol + '</sym>')
                }
                if (codaLabel !== '') {
                    m.setLabel(codaLabel)
                }
                if (codaColor.isValid()) {
                    colorItem(m, codaColor)
                }
                const track = this.m_pass1.trackForPart(partId)
                this.addElemOffset(m, track, 'above', markedMeasure, markedMeasure.tick())
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'fermata') {
                const fermataColor = Color.fromString(this.m_e.asciiAttribute('color'))
                const fermataType = this.m_e.attribute('type')
                let st = SegmentType.BarLine
                if (locTick.eq(measure.endTick())) {
                    st = SegmentType.EndBarLine
                } else if (locTick.eq(measure.tick())) {
                    st = SegmentType.BeginBarLine
                }
                const segment = measure.getSegment(st, locTick)
                const track = this.m_pass1.trackForPart(partId)
                const fermata = Factory.createItem(ElementType.FERMATA, segment) as Fermata
                fermata.setSymId(convertFermataToSymId(this.m_e.readText()))
                fermata.setTrack(track)
                segment.add(fermata)
                colorItem(fermata, fermataColor)
                if (fermataType === 'inverted') {
                    fermata.setPlacement(PlacementV.BELOW)
                    fermata.resetProperty(Pid.OFFSET)
                } else if (fermataType === '') {
                    fermata.setPlacement(fermata.propertyDefault(Pid.PLACEMENT) as PlacementV)
                }

                // Terminate tempo lines
                const lines = this.getInferredTempoLine()
                terminateInferredLine([...lines], locTick, track)
            } else if (this.m_e.name() === 'ending') {
                endingNumber = this.m_e.attribute('number')
                endingType = this.m_e.attribute('type')
                endingColor = Color.fromString(this.m_e.asciiAttribute('color'))
                printEnding = this.m_e.asciiAttribute('print-object') !== 'no'
                endingText = this.m_e.readText()
            } else if (this.m_e.name() === 'repeat') {
                repeat = this.m_e.attribute('direction')
                let count = strToInt(this.m_e.attribute('times'))
                if (!count) {
                    count = 2
                }
                measure.setRepeatCount(count)
                const repeatBarTips = this.m_e.attribute('winged') !== '' && this.m_e.attribute('winged') !== 'none'
                this.m_score.undoChangeStyleVal(Sid.repeatBarTips, repeatBarTips)
                this.m_e.skipCurrentElement()
            } else {
                this.skipLogCurrElem()
            }
        }

        const type: Ref<BarLineType> = { v: BarLineType.NORMAL }
        const visible = { v: true }
        if (determineBarLineType(barStyle, repeat, type, visible, this.m_pass1.exporterSoftware())) {
            const track = this.m_pass1.trackForPart(partId)
            if (type.v & BarLineType.START_REPEAT) {
                // combine start_repeat flag with current state initialized during measure parsing
                measure.setRepeatStart(true)
            } else if (type.v & BarLineType.END_REPEAT) {
                // combine end_repeat flag with current state initialized during measure parsing
                measure.setRepeatEnd(true)
            } else {
                if (barStyle !== 'regular' || barlineColor.isValid() || loc === 'middle') {
                    // Add barline to the first voice of every staff in the part,
                    // and span every barline except the last
                    const part = this.m_pass1.getPart(partId)!
                    const nstaves = part.nstaves()
                    for (let i = 0; i < nstaves; ++i) {
                        const staff = part.staff(i)!
                        const spanStaff = nstaves > 1 ? i < nstaves - 1 : staff.barLineSpan()
                        const currentTrack = track + (i * VOICES)
                        const b = createBarline(measure.score(), currentTrack, type.v, visible.v, barStyle, spanStaff)
                        colorItem(b, barlineColor)
                        addBarlineToMeasure(measure, locTick, b)
                    }
                }
            }
        }

        this.doEnding(partId, measure, endingNumber, endingType, endingColor, endingText, printEnding)
    }

    //---------------------------------------------------------
    //   doEnding
    //---------------------------------------------------------

    doEnding(partId: string, measure: Measure, number: string,
        type: string, color: Color, text: string, print: boolean): void {
        if (!(number === '' && type === '')) {
            if (number === '') {
                this.m_logger.logError('empty ending number', this.m_e)
            } else if (type === '') {
                this.m_logger.logError('empty ending type', this.m_e)
            } else {
                const sl = number.split(',').filter(s => s !== '')
                const iEndingNumbers: number[] = []
                let unsupported = false
                for (const s of sl) {
                    const iEndingNumber = strToInt(s)
                    if (iEndingNumber <= 0) {
                        unsupported = true
                        break
                    }
                    iEndingNumbers.push(iEndingNumber)
                }

                if (unsupported) {
                    this.m_logger.logError(`unsupported ending number '${number}'`, this.m_e)
                } else {
                    // Ignore if it is hidden and redundant
                    let redundantVolta = findRedundantVolta(this.m_pass1.trackForPart(partId), measure)
                    if (!print && redundantVolta) {
                        this.m_logger.logDebugInfo('Ignoring redundant hidden Volta', this.m_e)
                    } else if (type === 'start') {
                        const volta = Factory.createItem(ElementType.VOLTA, scoreDummy(this.m_score)) as Volta
                        volta.setTrack(this.m_pass1.trackForPart(partId))
                        volta.setText(text === '' ? number : text)
                        // LVIFIX TODO also support endings "1 - 3"
                        volta.endings().length = 0
                        volta.endings().push(...iEndingNumbers)
                        volta.setTick(measure.tick())
                        this.m_score.addElement(volta)
                        this.m_lastVolta = volta
                        volta.setVisible(print)
                        colorItem(volta, color)
                    } else if (type === 'stop') {
                        if (this.m_lastVolta) {
                            this.m_lastVolta.setVoltaType(VoltaType.CLOSED)
                            this.m_lastVolta.setTick2(measure.tick().plus(measure.ticks()))
                            // Assume print-object was handled at the start
                            this.m_lastVolta = null
                        } else if (!redundantVolta) {
                            this.m_logger.logError('ending stop without start', this.m_e)
                        }
                    } else if (type === 'discontinue') {
                        if (this.m_lastVolta) {
                            this.m_lastVolta.setVoltaType(VoltaType.OPEN)
                            this.m_lastVolta.setTick2(measure.tick().plus(measure.ticks()))
                            // Assume print-object was handled at the start
                            this.m_lastVolta = null
                        } else if (!redundantVolta) {
                            this.m_logger.logError('ending discontinue without start', this.m_e)
                        }
                    } else {
                        this.m_logger.logError(`unsupported ending type '${type}'`, this.m_e)
                    }

                    // Delete any hidden redundant voltas before
                    while (redundantVolta && !redundantVolta.visible()) {
                        this.m_score.removeElement(redundantVolta)
                        redundantVolta = findRedundantVolta(this.m_pass1.trackForPart(partId), measure)
                    }
                }
            }
        }
    }

    //---------------------------------------------------------
    //   key
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/key node.
     */

    // TODO: check currKeySig handling

    key(partId: string, measure: Measure, tick: Fraction): void {
        const strKeyno = this.m_e.attribute('number')
        let keyno = -1   // assume no number (see below)
        if (strKeyno !== '') {
            keyno = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strKeyno))
            if (keyno < 0) {
                // conversion error (-1), assume staff 0
                this.m_logger.logError(`invalid key number '${strKeyno}'`, this.m_e)
                keyno = 0
            }
        }
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'
        const keyColor = Color.fromString(this.m_e.asciiAttribute('color'))

        // for custom keys, a single altered tone is described by
        // key-step (required),  key-alter (required) and key-accidental (optional)
        // none, one or more altered tone may be present
        // a simple state machine is required to detect them
        const key = new KeySigEvent()
        const keyStep = { v: '' }
        const keyAlter = { v: '' }
        const keyAccidental = { v: '' }
        const smufl = { v: '' }

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'fifths') {
                const tKey = this.m_e.readInt() as Key
                let cKey = tKey
                const v = this.m_pass1.getPart(partId)!.instrument().transpose()
                if (!v.isZero() && !this.m_score.style().styleB(Sid.concertPitch)) {
                    cKey = Transpose.transposeKey(tKey, v)
                    // if there are more than 6 accidentals in transposing key, it cannot be PreferSharpFlat::AUTO
                    const part = this.m_pass1.getPart(partId)!
                    if ((tKey > 6 || tKey < -6) && part.preferSharpFlat() === PreferSharpFlat.AUTO) {
                        part.setPreferSharpFlat(PreferSharpFlat.NONE)
                    }
                }
                key.setConcertKey(cKey)
                key.setKey(tKey)
            } else if (this.m_e.name() === 'mode') {
                const m = this.m_e.readText()
                if (m === 'none') {
                    key.setCustom(true)
                    key.setMode(KeyMode.NONE)
                } else if (m === 'major') {
                    key.setMode(KeyMode.MAJOR)
                } else if (m === 'minor') {
                    key.setMode(KeyMode.MINOR)
                } else if (m === 'dorian') {
                    key.setMode(KeyMode.DORIAN)
                } else if (m === 'phrygian') {
                    key.setMode(KeyMode.PHRYGIAN)
                } else if (m === 'lydian') {
                    key.setMode(KeyMode.LYDIAN)
                } else if (m === 'mixolydian') {
                    key.setMode(KeyMode.MIXOLYDIAN)
                } else if (m === 'aeolian') {
                    key.setMode(KeyMode.AEOLIAN)
                } else if (m === 'ionian') {
                    key.setMode(KeyMode.IONIAN)
                } else if (m === 'locrian') {
                    key.setMode(KeyMode.LOCRIAN)
                } else {
                    this.m_logger.logError(`Unsupported mode '${m}'`, this.m_e)
                }
            } else if (this.m_e.name() === 'cancel') {
                this.skipLogCurrElem()        // TODO ??
            } else if (this.m_e.name() === 'key-step') {
                flushAlteredTone(key, keyStep, keyAlter, keyAccidental, smufl)
                keyStep.v = this.m_e.readText()
            } else if (this.m_e.name() === 'key-alter') {
                keyAlter.v = trimmed(this.m_e.readText())
            } else if (this.m_e.name() === 'key-accidental') {
                smufl.v = this.m_e.attribute('smufl')
                keyAccidental.v = this.m_e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }
        flushAlteredTone(key, keyStep, keyAlter, keyAccidental, smufl)

        const nstaves = this.m_pass1.getPart(partId)!.nstaves()
        const staffIdx = Math.trunc(this.m_pass1.trackForPart(partId) / VOICES)
        if (keyno === -1) {
            // apply key to all staves in the part
            for (let i = 0; i < nstaves; ++i) {
                addKey(key, keyColor, printObject, this.m_score, measure, staffIdx + i, tick)
            }
        } else if (keyno < nstaves) {
            addKey(key, keyColor, printObject, this.m_score, measure, staffIdx + keyno, tick)
        }
    }

    //---------------------------------------------------------
    //   clef
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/clef node.
     */

    clef(partId: string, measure: Measure, tick: Fraction): void {
        let clef = ClefType.G
        let st = StaffTypes.STANDARD

        let c = ''
        let i = 0
        let line = -1

        const strClefno = this.m_e.attribute('number')
        const afterBarline = this.m_e.asciiAttribute('after-barline') === 'yes'
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'
        const clefColor = Color.fromString(this.m_e.asciiAttribute('color'))

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'sign') {
                c = this.m_e.readText()
            } else if (this.m_e.name() === 'line') {
                line = this.m_e.readInt()
            } else if (this.m_e.name() === 'clef-octave-change') {
                i = this.m_e.readInt()
            } else {
                this.skipLogCurrElem()
            }
        }

        //some software (Primus) don't include line and assume some default
        // it's permitted by MusicXML 2.0 XSD
        if (line === -1) {
            if (c === 'G') {
                line = 2
            } else if (c === 'F') {
                line = 4
            } else if (c === 'C') {
                line = 3
            }
        }

        if (c === 'G' && i === 0 && line === 2) {
            clef = ClefType.G
        } else if (c === 'G' && i === 1 && line === 2) {
            clef = ClefType.G8_VA
        } else if (c === 'G' && i === 2 && line === 2) {
            clef = ClefType.G15_MA
        } else if (c === 'G' && i === -1 && line === 2) {
            clef = ClefType.G8_VB
        } else if (c === 'G' && i === -2 && line === 2) {
            clef = ClefType.G15_MB
        } else if (c === 'G' && i === 0 && line === 1) {
            clef = ClefType.G_1
        } else if (c === 'F' && i === 0 && line === 3) {
            clef = ClefType.F_B
        } else if (c === 'F' && i === 0 && line === 4) {
            clef = ClefType.F
        } else if (c === 'F' && i === 1 && line === 4) {
            clef = ClefType.F_8VA
        } else if (c === 'F' && i === 2 && line === 4) {
            clef = ClefType.F_15MA
        } else if (c === 'F' && i === -1 && line === 4) {
            clef = ClefType.F8_VB
        } else if (c === 'F' && i === -2 && line === 4) {
            clef = ClefType.F15_MB
        } else if (c === 'F' && i === 0 && line === 5) {
            clef = ClefType.F_C
        } else if (c === 'C') {
            if (line === 5) {
                clef = ClefType.C5
            } else if (line === 4) {
                if (i === -1) {
                    clef = ClefType.C4_8VB
                } else {
                    clef = ClefType.C4
                }
            } else if (line === 3) {
                clef = ClefType.C3
            } else if (line === 2) {
                clef = ClefType.C2
            } else if (line === 1) {
                clef = ClefType.C1
            }
        } else if (c === 'percussion') {
            clef = ClefType.PERC
            if (this.m_hasDrumset) {
                st = StaffTypes.PERC_DEFAULT
            }
        } else if (c === 'TAB') {
            clef = ClefType.TAB
            st = StaffTypes.TAB_DEFAULT
        }

        const part = this.m_pass1.getPart(partId)
        if (!part) {
            return
        }

        // TODO: check error handling for
        // - single staff
        // - multi-staff with same clef
        let clefno = 0   // default
        if (strClefno !== '') {
            clefno = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strClefno))
        }
        if (clefno < 0 || clefno >= part.nstaves()) {
            // conversion error (0) or other issue, assume staff 1
            // Also for Cubase 6.5.5 which generates clef number="2" in a single staff part
            // Same fix is required in pass 1 and pass 2
            this.m_logger.logError(`invalid clef number '${strClefno}'`, this.m_e)
            clefno = 0
        }

        let s: Segment
        let position = ClefToBarlinePosition.AUTO
        // check if the clef change needs to be in the previous measure
        const prevMeasure = measure.prevMeasure()
        if (!afterBarline && tick.eq(measure.tick()) && prevMeasure) {
            s = prevMeasure.getSegment(SegmentType.Clef, tick)
            if (prevMeasure.repeatEnd()) {
                position = ClefToBarlinePosition.BEFORE
            }
        } else {
            s = measure.getSegment(tick.isNotZero() ? SegmentType.Clef : SegmentType.HeaderClef, tick)
            if (prevMeasure && !prevMeasure.repeatEnd()) {
                position = ClefToBarlinePosition.AFTER
            }
        }

        const clefs = Factory.createItem(ElementType.CLEF, s) as Clef
        clefs.setClefType(clef)
        clefs.setVisible(printObject)
        clefs.setClefToBarlinePosition(position)
        colorItem(clefs, clefColor)
        const track = this.m_pass1.trackForPart(partId) + clefno * VOICES
        clefs.setTrack(track)
        s.add(clefs)

        // set the correct staff type
        // note that clef handling should probably done in pass1
        const staffIdx = this.m_score.staffIdxOfPart(part) + clefno
        const staff = this.m_score.staff(staffIdx)!
        const lines = staff.lines(new Fraction(0, 1))
        if (tick.isZero()) {   // changing staff type not supported (yet ?)
            staff.setStaffType(tick, StaffType.preset(st).clone())
            staff.setLines(tick, lines)     // preserve previously set staff lines
            staff.setBarLineTo(0)        // default
        }
    }

    //---------------------------------------------------------
    //   time
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/time node.
     */

    time(partId: string, measure: Measure, tick: Fraction): void {
        let beats = ''
        let beatType = ''
        const timeSymbol = this.m_e.attribute('symbol')
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'
        const timeColor = Color.fromString(this.m_e.asciiAttribute('color'))

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'beats') {
                beats = this.m_e.readText()
            } else if (this.m_e.name() === 'beat-type') {
                beatType = this.m_e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }

        if (beats !== '' && beatType !== '') {
            // determine if timesig is valid
            const st = { v: TimeSigType.NORMAL }
            const bts = { v: 0 }     // total beats as integer (beats may contain multiple numbers, separated by "+")
            const btp = { v: 0 }     // beat-type as integer
            if (determineTimeSig(beats, beatType, timeSymbol, st, bts, btp)) {
                this.m_timeSigDura = new Fraction(bts.v, btp.v)
                const fractionTSig = new Fraction(bts.v, btp.v)
                for (let i = 0; i < this.m_pass1.getPart(partId)!.nstaves(); ++i) {
                    const s = measure.getSegment(SegmentType.TimeSig, tick)
                    const timesig = Factory.createItem(ElementType.TIMESIG, s) as TimeSig
                    timesig.setVisible(printObject)
                    colorItem(timesig, timeColor)
                    const track = this.m_pass1.trackForPart(partId) + i * VOICES
                    timesig.setTrack(track)
                    timesig.setSig(fractionTSig, st.v)
                    // handle simple compound and single time signatures
                    if (beats.includes('+')) {
                        timesig.setNumeratorString(beats)
                        timesig.setDenominatorString(beatType)
                    } else if (timeSymbol === 'single-number') {
                        timesig.setNumeratorString(beats)
                    }
                    s.add(timesig)
                }
            }
        }

        if (printObject && this.m_score.style().styleV(Sid.timeSigPlacement) === TimeSigPlacement.ACROSS_STAVES) {
            const track = this.m_pass1.trackForPart(partId)
            const st = this.m_score.staff(track2staff(track))!
            if (!st.isSystemObjectStaff() && st.idx() !== 0) {
                this.m_score.addSystemObjectStaff(st)
            }
        }
    }

    //---------------------------------------------------------
    //   divisions
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/attributes/divisions node.
     */

    divisions(): void {
        this.m_divs = this.m_e.readInt()
        if (!(this.m_divs > 0)) {
            this.m_logger.logError('illegal divisions', this.m_e)
        }
    }

    xmlSetDrumsetPitch(note: Note, chord: Chord, staff: Staff,
        step: number, octave: number, headGroup: NoteHeadGroup, stemDir: Ref<DirectionV>, instrument: Instrument): void {
        const ds = instrument.drumset()!
        // get line
        // determine staff line based on display-step / -octave and clef type
        const clef = staff.clef(chord.tick())
        const po = ClefInfo.pitchOffset(clef)
        const pitch = MusicXmlStepAltOct2Pitch(step, 0, octave)
        let line = po - absStep(pitch)
        const staffLines = staff.lines(chord.tick())
        if (staffLines === 1) {
            line -= 8
        }
        if (staffLines === 3) {
            line -= 2
        }

        const firstDrum = ds.nextPitch(0)
        let curDrum = firstDrum
        let newPitch = pitch
        let matchFound = false
        do {
            if (ds.line(curDrum) === line) {
                if (ds.noteHead(curDrum) === headGroup) {
                    newPitch = curDrum
                    matchFound = true
                    break
                }
            }
            curDrum = ds.nextPitch(curDrum)
        } while (curDrum !== firstDrum)

        // Find inferred instruments at this tick
        if (musicXmlImportConfiguration().inferTextType()) {
            const instr = this.inferredPercInstr(chord.tick(), chord.track())
            if (instr.track !== -1) {
                // Clear old instrument
                ds.setDrum(newPitch, new DrumInstrument())

                newPitch = instr.pitch
                ds.setDrum(newPitch, makeDrumInstrument(instr.name, headGroup, line, stemDir.v, chord.voice()))
            }
        }

        // If there is no exact match add an entry to the drumkit with the XML line and notehead
        if (!matchFound) {
            // Create new instrument in drumkit
            if (stemDir.v === DirectionV.AUTO) {
                if (line > 4) {
                    stemDir.v = DirectionV.DOWN
                } else {
                    stemDir.v = DirectionV.UP
                }
            }

            ds.setDrum(newPitch, makeDrumInstrument('drum', headGroup, line, stemDir.v, chord.voice()))
        } else if (stemDir.v === DirectionV.AUTO) {
            stemDir.v = ds.stemDirection(newPitch)
        }

        note.setPitch(newPitch)
        note.setTpcFromPitch()
    }

    //---------------------------------------------------------
    //   note
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note node.
     */

    note(partId: string,
        measure: Measure,
        sTime: Fraction,
        prevSTime: Fraction,
        missingPrev: Ref<Fraction>,
        dura: Ref<Fraction>,
        missingCurr: Ref<Fraction>,
        currentVoice: Ref<string>,
        gcl: GraceChordList,
        gac: Ref<number>,
        currBeams: Beams,
        fbl: FiguredBassList,
        alt: Ref<number>,
        tupletStates: MusicXmlTupletStates,
        tuplets: Tuplets, arpMap: ArpeggioMap, delayedArps: DelayedArpMap): Note | null {
        if (this.m_e.asciiAttribute('print-spacing') === 'no') {
            this.notePrintSpacingNo(dura)
            return null
        }

        let chord = false
        let cue = false
        let isSmall = false
        let grace = false
        let rest = false
        let measureRest = false
        let staff = 0
        let type = ''
        let voice = ''
        const stemDir: Ref<DirectionV> = { v: DirectionV.AUTO }
        const noStem: Ref<boolean> = { v: false }
        let hasHead = true
        let headGroup = NoteHeadGroup.HEAD_NORMAL
        let headScheme = NoteHeadScheme.HEAD_AUTO
        const noteColor = Color.fromString(this.m_e.asciiAttribute('color'))
        let noteheadColor = new Color()
        let stemColor = new Color()
        let beamColor = new Color()
        let noteheadParentheses = false
        let noteheadFilled = ''
        const velocity = stdRound(this.m_e.doubleAttribute('dynamics') * 0.9)
        let graceSlash = false
        let graceStealFollowing = -1.0
        let graceStealPrevious = -1.0
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'
        const printLyric = (printObject && this.m_e.asciiAttribute('print-lyric') !== 'no') || this.m_e.asciiAttribute('print-lyric') === 'yes'
        let isSingleDrumset = false
        const beamTypes = new IntMap<string>()
        let beamFan = ''
        let instrumentId = ''
        let tieType = ''
        const lyric = new MusicXmlParserLyric(this.m_pass1.getMusicXmlPart(partId).lyricNumberHandler(), this.m_e, this.m_score, this.m_logger,
            this.m_pass1.isVocalStaff(partId))
        const notations = new MusicXmlParserNotations(this.m_e, this.m_score, this.m_logger, this)

        const mnd = new MusicXmlNoteDuration(this.m_divs, this.m_logger, this.m_pass1)
        const mnp = new MusicXmlNotePitch(this.m_logger)

        while (this.m_e.readNextStartElement()) {
            if (mnp.readProperties(this.m_e, this.m_score)) {
                // element handled
            } else if (mnd.readProperties(this.m_e)) {
                // element handled
            } else if (this.m_e.name() === 'accidental') {
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'beam') {
                beamColor = Color.fromString(this.m_e.asciiAttribute('color'))
                beamFan = this.m_e.attribute('fan')
                this.beam(beamTypes)
            } else if (this.m_e.name() === 'chord') {
                chord = true
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'cue') {
                cue = true
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'grace') {
                grace = true
                graceSlash = this.m_e.asciiAttribute('slash') === 'yes'
                graceStealFollowing = this.m_e.doubleAttribute('steal-time-following', -1.0)
                graceStealPrevious = this.m_e.doubleAttribute('steal-time-previous', -1.0)
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'instrument') {
                instrumentId = this.m_e.attribute('id')
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'lyric') {
                // lyrics on grace notes not (yet) supported by MuseScore
                // add to main note instead
                lyric.parse(printLyric)
            } else if (this.m_e.name() === 'notations') {
                notations.parse()
                this.addError(notations.errors())
            } else if (this.m_e.name() === 'notehead') {
                noteheadColor = Color.fromString(this.m_e.asciiAttribute('color'))
                noteheadParentheses = this.m_e.asciiAttribute('parentheses') === 'yes'
                noteheadFilled = this.m_e.attribute('filled')
                const noteheadValue = this.m_e.readText()
                if (noteheadValue === 'none') {
                    hasHead = false
                } else if (noteheadValue === 'named' && this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.NOTEFLIGHT) {
                    headScheme = NoteHeadScheme.HEAD_PITCHNAME
                } else {
                    headGroup = convertNotehead(noteheadValue)
                }
            } else if (this.m_e.name() === 'notehead-text') {
                let noteheadText = ''
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'display-text') {
                        noteheadText = this.m_e.readText()
                    } else if (this.m_e.name() === 'accidental-text') {
                        this.m_e.skipCurrentElement()
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                if (noteheadText.length === 1) {
                    const isGerman = noteheadText === 'H' || (noteheadText === 'B' && mnp.alter() !== 0)
                    headScheme = isGerman ? NoteHeadScheme.HEAD_PITCHNAME_GERMAN : NoteHeadScheme.HEAD_PITCHNAME
                } else {
                    const names = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']
                    // TODO(port): C++ names.at() throws for an invalid step
                    const isFixed = names[mnp.step()] === noteheadText
                    headScheme = isFixed ? NoteHeadScheme.HEAD_SOLFEGE_FIXED : NoteHeadScheme.HEAD_SOLFEGE
                }
            } else if (this.m_e.name() === 'rest') {
                rest = true
                measureRest = this.m_e.asciiAttribute('measure') === 'yes'
                mnp.displayStepOctave(this.m_e)
            } else if (this.m_e.name() === 'staff') {
                const ok = { v: false }
                const strStaff = this.m_e.readText()
                staff = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strStaff, ok))
                if (!ok.v) {
                    // error already reported in pass 1
                    staff = -1
                }
            } else if (this.m_e.name() === 'stem') {
                stemColor = Color.fromString(this.m_e.asciiAttribute('color'))
                this.stem(stemDir, noStem)
            } else if (this.m_e.name() === 'tie') {
                tieType = this.m_e.attribute('type')
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'type') {
                isSmall = this.m_e.asciiAttribute('size') === 'cue' || this.m_e.asciiAttribute('size') === 'grace-cue'
                type = this.m_e.readText()
            } else if (this.m_e.name() === 'voice') {
                voice = this.m_e.readText()
            } else {
                this.skipLogCurrElem()
            }
        }

        // Bug fix for Sibelius 7.1.3 which does not write <voice> for notes with <chord>
        if (!chord) {
            // remember voice
            currentVoice.v = voice
        } else if (voice === '') {
            // use voice from last note w/o <chord>
            voice = currentVoice.v
        }

        // Assume voice 1 if voice is empty (legal in a single voice part)
        if (voice === '') {
            voice = '1'
        }

        // Define currBeam based on currentVoice to handle multi-voice beaming (and instantiate if not already)
        if (!currBeams.has(currentVoice.v)) {
            currBeams.insert(currentVoice.v, null)
        }
        // C++ Beam*& currBeam = currBeams[currentVoice] (written back after every change)
        const currBeamKey = currentVoice.v
        const currBeam: Ref<Beam | null> = { v: currBeams.get(currBeamKey) ?? null }

        const bm: BeamMode = computeBeamMode(beamTypes)

        // check for timing error(s) and set dura
        // keep in this order as checkTiming() might change dura
        const errorStr = mnd.checkTiming(type, rest, grace)
        dura.v = mnd.duration()
        if (errorStr !== '') {
            this.m_logger.logError(errorStr, this.m_e)
        }

        if (!this.m_pass1.getPart(partId)) {
            return null
        }

        // At this point all checks have been done, the note should be added
        // note: in case of error exit from here, the postponed <note> children
        // must still be skipped

        const msMove = { v: 0 }
        const msTrack = { v: 0 }
        const msVoice = { v: 0 }

        const voiceInt = this.m_pass1.voiceToInt(voice)
        if (!this.m_pass1.determineStaffMoveVoice(partId, staff, voiceInt, msMove, msTrack, msVoice)) {
            this.m_logger.logDebugInfo(`could not map staff ${staff + 1} voice '${voice}'`, this.m_e)
            this.addError(checkAtEndElement(this.m_e, 'note'))
            return null
        }

        // start time for note:
        // - sTime for non-chord / first chord note
        // - prevTime for others
        let noteStartTime = chord ? prevSTime : sTime
        const timeMod: Ref<Fraction> = { v: mnd.timeMod() }

        // determine tuplet state, used twice (before and after note allocation)
        let tupletAction: MusicXmlTupletFlags = MusicXmlTupletFlag.NONE

        // handle tuplet state for the previous chord or rest
        if (!chord && !grace) {
            // C++ Tuplet* tuplet = tuplets[voice] (a copy of the entry, inserted if missing)
            if (!tuplets.has(voice)) {
                tuplets.insert(voice, null)
            }
            const tuplet: Ref<Tuplet | null> = { v: tuplets.get(voice) ?? null }
            const tupletState = tupletStates.at(voice)
            tupletAction = tupletState.determineTupletAction(mnd.duration(), timeMod.v, notations.tupletDesc().type,
                mnd.normalType(), missingPrev, missingCurr)
            if (tupletAction & MusicXmlTupletFlag.STOP_PREVIOUS) {
                // tuplet start while already in tuplet
                if (missingPrev.v.isValid() && missingPrev.v.gt(new Fraction(0, 1))) {
                    const track = msTrack.v + msVoice.v
                    const extraRest: Rest | null = addRest(this.m_score, measure, noteStartTime, track, msMove.v,
                        new TDuration(missingPrev.v.times(tuplet.v!.ratio())), missingPrev.v)
                    if (extraRest) {
                        extraRest.setTuplet(tuplet.v)
                        tuplet.v!.add(extraRest)
                        noteStartTime = noteStartTime.plus(missingPrev.v)
                    }
                }
                // recover by simply stopping the current tuplet first
                const normalNotes = timeMod.v.numerator()
                handleTupletStop(tuplet, normalNotes)
            }
        }

        let c: Chord | null = null
        let cr: ChordRest | null = null
        let note: Note | null = null

        const duration = determineDuration(rest, measureRest, type, mnd.dots(), dura.v, measure.ticks())

        const part = this.m_pass1.getPart(partId)!
        const instrument = part.instrument(noteStartTime)
        const instruments = this.m_pass1.getInstruments(partId)
        isSingleDrumset = !!instrument.drumset() && instruments.size() === 1
        // begin allocation
        if (rest) {
            if (!grace) {
                const track = msTrack.v + msVoice.v
                cr = addRest(this.m_score, measure, noteStartTime, track, msMove.v,
                    duration, dura.v)
            } else {
                // ignoring grace rest
            }
        } else {
            if (!grace) {
                // regular note
                // if there is already a chord just add to it
                // else create a new one
                // this basically ignores <chord/> errors
                c = findOrCreateChord(this.m_score, measure,
                    noteStartTime,
                    msTrack.v + msVoice.v, msMove.v,
                    duration, dura.v, bm, isSmall || cue)
            } else {
                // grace note
                // TODO: check if explicit stem direction should also be set for grace notes
                // (the DOM parser does that, but seems to have no effect on the autotester)
                if (!chord || gcl.length === 0) {
                    c = createGraceChord(this.m_score, msTrack.v + msVoice.v, duration, graceSlash, isSmall || cue)
                    // TODO FIX
                    // the setStaffMove() below results in identical behaviour as 2.0:
                    // grace note will be at the wrong staff with the wrong pitch,
                    // seems to use the line value calculated for the right staff
                    // leaving it places the note at the wrong staff with the right pitch
                    // this affects only grace notes where staff move differs from
                    // the main note, e.g. DebuMandSample.xml first grace in part 2
                    // c->setStaffMove(msMove);
                    // END TODO
                    gcl.push(c)
                } else {
                    c = gcl[gcl.length - 1]
                }
            }
            const ch: Chord = c!
            note = Factory.createItem(ElementType.NOTE, ch) as Note
            const ottavaStaff: staff_idx_t = Math.trunc((msTrack.v - this.m_pass1.trackForPart(partId)) / VOICES)
            const octaveShift = this.m_pass1.octaveShift(partId, ottavaStaff, noteStartTime)
            const st = ch.staff()!
            if (isSingleDrumset && mnp.unpitched() && instrumentId === '') {
                this.xmlSetDrumsetPitch(note, ch, st, mnp.displayStep(), mnp.displayOctave(), headGroup, stemDir, instrument)
            } else {
                setPitch(note, instruments, instrumentId, mnp, octaveShift, instrument)
            }
            ch.add(note)
            cr = c
        }
        // end allocation

        if (rest) {
            const track: track_idx_t = msTrack.v + msVoice.v
            if (cr) {
                if (currBeam.v) {
                    if (currBeam.v.track() === track) {
                        cr.setBeamMode(BeamMode.MID)
                        currBeam.v.add(cr)
                    } else {
                        removeBeam(currBeam)
                        currBeams.set(currBeamKey, currBeam.v)
                    }
                } else {
                    cr.setBeamMode(BeamMode.NONE)
                }
                cr.setSmall(isSmall)
                colorItem(cr, noteColor)
                cr.setVisible(printObject)
                handleDisplayStep(cr, mnp.displayStep(), mnp.displayOctave(), noteStartTime, this.m_score.style().spatium())
            }
        } else {
            c = c!
            note = note!
            handleSmallness(cue || isSmall, note, c)
            note.setPlay(!cue)          // cue notes don't play
            note.setHeadGroup(headGroup)
            if (headScheme !== NoteHeadScheme.HEAD_AUTO) {
                note.setHeadScheme(headScheme)
            }
            colorItem(note, noteColor)
            let stem: Stem | null = c.stem()
            if (!stem) {
                stem = Factory.createItem(ElementType.STEM, c) as Stem
                colorItem(stem, stemColor)
                if (!stemColor.isValid()) {
                    colorItem(stem, noteColor)
                }
                c.add(stem)
            }
            setNoteHead(note, noteheadFilled)
            if (noteheadParentheses) {
                note.setParenthesesMode(ParenthesesMode.BOTH)
            }
            colorItem(note, noteheadColor)
            note.setVisible(hasHead && printObject)
            stem.setVisible(printObject)

            if (!grace) {
                // regular note
                // handle beam
                if (!chord) {
                    handleBeamAndStemDir(c, bm, stemDir.v, currBeam, this.m_pass1.hasBeamingInfo(), beamColor, beamFan)
                    currBeams.set(currBeamKey, currBeam.v)
                }

                // append any grace chord after chord to the previous chord
                const prevChord = measure.findChord(prevSTime, msTrack.v + msVoice.v)
                if (prevChord && prevChord !== c) {
                    addGraceChordsAfter(prevChord, gcl, gac)
                }

                // append any grace chord
                addGraceChordsBefore(c, gcl)
            }

            if (mnd.calculatedDuration().isValid()
                && mnd.specifiedDuration().isValid()
                && mnd.calculatedDuration().isNotZero()
                && mnd.calculatedDuration().ne(mnd.specifiedDuration())) {
                // convert duration into note length
                let durationMult = mnd.specifiedDuration().div(mnd.calculatedDuration()).reduced()
                durationMult = durationMult.times(1000).reduced()
                const noteLen = Math.trunc(durationMult.numerator() / durationMult.denominator())

                const nel: NoteEvent[] = []
                const ne = new NoteEvent()
                ne.setLen(noteLen)
                nel.push(ne)
                note.setPlayEvents(nel)
                if (c) {
                    c.setPlayEventType(PlayEventType.User)
                }
            }

            if (velocity > 0) {
                note.setUserVelocity(velocity)
            }

            if (mnp.unpitched() && !isSingleDrumset) {
                setDrumset(c, this.m_pass1, partId, instrumentId, noteStartTime, mnp, stemDir.v, headGroup)
            }

            // accidental handling
            let acc: Accidental | null = mnp.acc()
            if (!acc && mnp.accType() !== AccidentalType.NONE) {
                acc = Factory.createItem(ElementType.ACCIDENTAL, scoreDummy(this.m_score)) as Accidental
                acc.setAccidentalType(mnp.accType())
            }

            if (acc) {
                acc.setVisible(printObject)
                note.add(acc)
                // save alter value for user accidental
                if (acc.accidentalType() !== AccidentalType.NONE) {
                    alt.v = mnp.alter()
                }
            }

            c.setNoStem(noStem.v)
        }

        // cr can be 0 here (if a rest cannot be added)
        // TODO: complete and cleanup handling this case
        if (cr) {
            cr.setVisible(printObject)
        }

        // handle notations
        if (cr) {
            notations.addToScore(cr, note,
                noteStartTime, this.m_slurs, this.m_glissandi, this.m_spanners, this.m_trills, this.m_ties, this.m_unstartedTieNotes,
                this.m_unendedTieNotes, arpMap, delayedArps)

            // if no tie added yet, convert the "tie" into "tied" and add it.
            if (note && !note.tieFor() && !note.tieBack() && tieType !== '') {
                const notation = new Notation('tied')
                const type2 = 'type'
                notation.addAttribute(type2, tieType)
                addTie(notation, note, cr.track(), this.m_ties, this.m_unstartedTieNotes, this.m_unendedTieNotes, this.m_logger, this.m_e)
            }
        }

        if (grace) {
            const afterByStealTime = graceStealPrevious >= 0.0 && !!c && c.noteType() !== NoteType.ACCIACCATURA
            if (graceStealFollowing < 0.0 && (afterByStealTime || notations.mustStopGraceAfter())) {
                // handle grace after state: remember current grace list size
                gac.v = gcl.length
            }
        }

        // handle tremolo before handling tuplet (two note tremolos modify timeMod)
        if (cr && notations.hasTremolo()) {
            const tremStart: Ref<Chord | null> = { v: this.m_tremStart }
            addTremolo(cr, notations.tremoloNr(), notations.tremoloType(), notations.tremoloSmufl(), notations.tremoloColor(),
                tremStart, this.m_logger, this.m_e, timeMod)
            this.m_tremStart = tremStart.v
        }

        // handle tuplet state for the current chord or rest
        if (cr) {
            if (!chord && !grace) {
                // C++ Tuplet*& tuplet = tuplets[voice] (written back after every change)
                const tuplet: Ref<Tuplet | null> = { v: tuplets.get(voice) ?? null }
                // do tuplet if valid time-modification is not 1/1 and is not 1/2 (tremolo)
                // TODO: check interaction tuplet and tremolo handling
                if (timeMod.v.isValid() && timeMod.v.ne(new Fraction(1, 1)) && timeMod.v.ne(new Fraction(1, 2))) {
                    const actualNotes = timeMod.v.denominator()
                    const normalNotes = timeMod.v.numerator()
                    if (tupletAction & MusicXmlTupletFlag.START_NEW) {
                        // create a new tuplet
                        handleTupletStart(cr, tuplet, actualNotes, normalNotes, notations.tupletDesc())
                    }
                    if (tuplet.v && (tupletAction & MusicXmlTupletFlag.ADD_CHORD)) {
                        cr.setTuplet(tuplet.v)
                        tuplet.v.add(cr)
                    }
                    if (tuplet.v && (tupletAction & MusicXmlTupletFlag.STOP_CURRENT)) {
                        if (missingCurr.v.isValid() && missingCurr.v.gt(new Fraction(0, 1))) {
                            const track = msTrack.v + msVoice.v
                            const extraRest: Rest | null = addRest(this.m_score, measure, noteStartTime.plus(dura.v), track, msMove.v,
                                new TDuration(missingCurr.v.times(tuplet.v.ratio())), missingCurr.v)
                            if (extraRest) {
                                extraRest.setTuplet(tuplet.v)
                                tuplet.v.add(extraRest)
                            }
                        }
                        handleTupletStop(tuplet, normalNotes)
                    }
                } else if (tuplet.v) {
                    // stop any still incomplete tuplet
                    handleTupletStop(tuplet, 2)
                }
                tuplets.set(voice, tuplet.v)
            }
        }

        // Add all lyrics from grace notes attached to this chord
        if (c && c.graceNotes().length && this.m_graceNoteLyrics.length) {
            for (const gnl of this.m_graceNoteLyrics) {
                if (gnl.lyric) {
                    addLyric(this.m_logger, this.m_e, cr!, gnl.lyric, gnl.no, this.m_extendedLyrics)
                    if (gnl.extend) {
                        this.m_extendedLyrics.addLyric(gnl.lyric)
                    }
                }
            }
            this.m_graceNoteLyrics = []
        }

        if (cr) {
            addInferredStickings(cr, lyric.inferredStickings())
        }

        // add lyrics found by lyric
        if (cr && !grace) {
            // add lyrics and stop corresponding extends
            addLyrics(this.m_logger, this.m_e, cr, lyric.numberedLyrics(), lyric.extendedLyrics(), this.m_extendedLyrics)
            if (rest) {
                // stop all extends
                this.m_extendedLyrics.setExtend(-1, cr.track(), cr.tick())
            }
        } else if (c && grace) {
            // Add grace note lyrics to main chord later
            addGraceNoteLyrics(lyric.numberedLyrics(), lyric.extendedLyrics(), this.m_graceNoteLyrics)
        }

        // add figured bass element
        addFiguredBassElements(fbl, noteStartTime, msTrack.v, dura.v, measure)

        // convert to slash or rhythmic notation if needed
        // TODO in the case of slash notation, we assume that given notes do in fact correspond to slash beats
        if (c && this.m_measureStyleSlash !== MusicXmlSlash.NONE) {
            c.setSlash(true, this.m_measureStyleSlash === MusicXmlSlash.SLASH)
        }

        // don't count chord or grace note duration
        // note that this does not check the MusicXML requirement that notes in a chord
        // cannot have a duration longer than the first note in the chord
        if (chord || grace) {
            dura.v = new Fraction(0, 1)
        }

        this.addError(checkAtEndElement(this.m_e, 'note'))

        return note
    }

    //---------------------------------------------------------
    //   notePrintSpacingNo
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note node for a note with print-spacing="no".
     These are handled like a forward: only moving the time forward.
     */

    notePrintSpacingNo(dura: Ref<Fraction>): void {
        let chord = false
        let grace = false

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'chord') {
                chord = true
                this.m_e.skipCurrentElement()  // skip but don't log
            } else if (this.m_e.name() === 'duration') {
                this.duration(dura)
            } else if (this.m_e.name() === 'grace') {
                grace = true
                this.m_e.skipCurrentElement()  // skip but don't log
            } else {
                this.m_e.skipCurrentElement()              // skip but don't log
            }
        }

        // don't count chord or grace note duration
        // note that this does not check the MusicXML requirement that notes in a chord
        // cannot have a duration longer than the first note in the chord
        if (chord || grace) {
            dura.v = new Fraction(0, 1)
        }

        this.addError(checkAtEndElement(this.m_e, 'note'))
    }

    //---------------------------------------------------------
    //   duration
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/duration node.
     */

    duration(dura: Ref<Fraction>): void {
        dura.v = new Fraction(0, 0)          // invalid unless set correctly
        const elementText = this.m_e.readText()
        if (strToInt(elementText) > 0) {
            dura.v = this.m_pass1.calcTicks(strToInt(elementText), this.m_divs, this.m_e)
        } else {
            this.m_logger.logError(`illegal duration ${dura.v.toString()}`, this.m_e)
        }
    }

    //---------------------------------------------------------
    //   figure
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/harmony/figured-bass/figure node.
     Return the result as a FiguredBassItem.
     */

    figure(idx: number, paren: boolean, parent: FiguredBass): FiguredBassItem {
        const fgi = parent.createItem(idx)

        // read the figure
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'extend') {
                const type = this.m_e.asciiAttribute('type')
                if (type === 'start') {
                    fgi.setContLine(FiguredBassContLine.EXTENDED)
                } else if (type === 'continue') {
                    fgi.setContLine(FiguredBassContLine.EXTENDED)
                } else if (type === 'stop') {
                    fgi.setContLine(FiguredBassContLine.SIMPLE)
                }
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'figure-number') {
                const color = Color.fromString(this.m_e.asciiAttribute('color'))
                const val = this.m_e.readText()
                const iVal = strToInt(val)
                // MusicXML spec states figure-number is a number
                // MuseScore can only handle single digit
                if (1 <= iVal && iVal <= 9) {
                    fgi.setDigit(iVal)
                    colorItem(fgi, color)
                } else {
                    this.m_logger.logError(`incorrect figure-number '${val}'`, this.m_e)
                }
            } else if (this.m_e.name() === 'prefix') {
                fgi.setPrefix(MusicXml2Modifier(this.m_e.readText()))
            } else if (this.m_e.name() === 'suffix') {
                fgi.setSuffix(MusicXml2Modifier(this.m_e.readText()))
            } else {
                this.skipLogCurrElem()
            }
        }

        // set parentheses
        if (paren) {
            // parenthesis open
            if (fgi.prefix() !== FiguredBassModifier.NONE) {
                fgi.setParenth1(FiguredBassParenthesis.ROUNDOPEN)              // before prefix
            } else if (fgi.digit() !== FBIDigitNone) {
                fgi.setParenth2(FiguredBassParenthesis.ROUNDOPEN)              // before digit
            } else if (fgi.suffix() !== FiguredBassModifier.NONE) {
                fgi.setParenth3(FiguredBassParenthesis.ROUNDOPEN)              // before suffix
            }
            // parenthesis close
            if (fgi.suffix() !== FiguredBassModifier.NONE) {
                fgi.setParenth4(FiguredBassParenthesis.ROUNDCLOSED)              // after suffix
            } else if (fgi.digit() !== FBIDigitNone) {
                fgi.setParenth3(FiguredBassParenthesis.ROUNDCLOSED)              // after digit
            } else if (fgi.prefix() !== FiguredBassModifier.NONE) {
                fgi.setParenth2(FiguredBassParenthesis.ROUNDCLOSED)              // after prefix
            }
        }

        return fgi
    }

    //---------------------------------------------------------
    //   figuredBass
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/harmony/figured-bass node.
     TODO check description:
     // Set the FiguredBass state based on the MusicXML <figured-bass> node de.
     // Note that onNote and ticks must be set by the MusicXML importer,
     // as the required context is not present in the items DOM tree.
     // Exception: if a <duration> element is present, tick can be set.
     Return the result as a FiguredBass if valid, non-empty figure(s) are found.
     Return 0 in case of error.
     */

    figuredBass(): FiguredBass | null {
        const fb = Factory.createItem(ElementType.FIGURED_BASS, scoreDummy(this.m_score).segment()) as FiguredBass

        const parentheses = this.m_e.asciiAttribute('parentheses') === 'yes'
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'
        const placement = this.m_e.attribute('placement')

        colorItem(fb, Color.fromString(this.m_e.asciiAttribute('color')))
        fb.setVisible(printObject)

        let normalizedText = ''
        let idx = 0
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'duration') {
                const dura: Ref<Fraction> = { v: new Fraction() }
                this.duration(dura)
                if (dura.v.isValid() && dura.v.gt(new Fraction(0, 1))) {
                    fb.setTicks(dura.v)
                }
            } else if (this.m_e.name() === 'figure') {
                const pItem = this.figure(idx++, parentheses, fb)
                pItem.setTrack(0 /* TODO fb->track() */)
                pItem.setParent(fb)
                fb.appendItem(pItem)
                // add item normalized text
                if (normalizedText !== '') {
                    normalizedText += '\n'
                }
                normalizedText += pItem.normalizedText()
            } else {
                this.skipLogCurrElem()
                return null
            }
        }

        fb.setXmlText(normalizedText)                          // this is the text to show while editing

        fb.setPlacement(placement === 'above' ? PlacementV.ABOVE : PlacementV.BELOW)
        fb.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
        fb.resetProperty(Pid.OFFSET)

        if (normalizedText === '') {
            return null
        }

        return fb
    }

    //---------------------------------------------------------
    //   frame
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/harmony/frame node.
     Return the result as a FretDiagram.
      Notes:
     - MusicXML's first-fret is a positive integer equivalent to MuseScore's FretDiagram::_fretOffset
     - it is one-based in MusicXML and zero-based in MuseScore
     - in MusicXML fret numbers are absolute, in MuseScore they are relative to the fretOffset,
       which affects both single strings and barres
     */

    frame(): FretDiagram | null {
        const fd = Factory.createItem(ElementType.FRET_DIAGRAM, scoreDummy(this.m_score).segment()) as FretDiagram

        colorItem(fd, Color.fromString(this.m_e.asciiAttribute('color')))

        // Format: fret: string
        const bStarts = new IntMap<number>()
        const bEnds = new IntMap<number>()

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'first-fret') {
                const ok = { v: false }
                const val = strToInt(this.m_e.readAsciiText(), ok)
                if (ok.v && val > 0) {
                    fd.setFretOffset(val - 1)
                } else {
                    this.m_logger.logError(`FretDiagram::readMusicXml: illegal first-fret ${val}`, this.m_e)
                }
            } else if (this.m_e.name() === 'frame-frets') {
                const val = this.m_e.readInt()
                if (val > 0) {
                    fd.setProperty(Pid.FRET_FRETS, val)
                    if (val !== Number(fd.propertyDefault(Pid.FRET_FRETS))) {
                        fd.setPropertyFlags(Pid.FRET_FRETS, PropertyFlags.UNSTYLED)
                    }
                } else {
                    this.m_logger.logError(`FretDiagram::readMusicXml: illegal frame-fret ${val}`, this.m_e)
                }
            } else if (this.m_e.name() === 'frame-note') {
                let fret = -1
                let string = -1
                let actualString = -1
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'fret') {
                        fret = this.m_e.readInt()
                    } else if (this.m_e.name() === 'string') {
                        string = this.m_e.readInt()
                        actualString = fd.strings() - string
                    } else if (this.m_e.name() === 'barre') {
                        // Keep barres to be added later
                        const t = this.m_e.attribute('type')
                        if (t === 'start') {
                            bStarts.set(fret, actualString)
                        } else if (t === 'stop') {
                            bEnds.set(fret, actualString)
                        } else {
                            this.m_logger.logError(`FretDiagram::readMusicXml: illegal frame-note barre type ${t}`, this.m_e)
                        }
                        this.skipLogCurrElem()
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                this.m_logger.logDebugInfo(`FretDiagram::readMusicXml string ${string} fret ${fret}`, this.m_e)

                if (string > 0) {
                    if (fret === 0) {
                        fd.setMarker(actualString, FretMarkerType.CIRCLE)
                    } else if (fret > 0) {
                        if (fd.marker(actualString).mtype === FretMarkerType.CROSS) {
                            fd.setMarker(actualString, FretMarkerType.NONE)
                        }
                        fd.setDot(actualString, fret - fd.fretOffset(), true)
                    }
                } else {
                    this.m_logger.logError(`FretDiagram::readMusicXml: illegal frame-note string ${string}`, this.m_e)
                }
            } else if (this.m_e.name() === 'frame-strings') {
                const val = this.m_e.readInt()
                if (val > 0) {
                    fd.setStrings(val)
                    for (let i = 0; i < val; ++i) {
                        // MXML Spec: any string without a dot or other marker has a closed string
                        // cross marker above it.
                        fd.setMarker(i, FretMarkerType.CROSS)
                    }
                } else {
                    this.m_logger.logError(`FretDiagram::readMusicXml: illegal frame-strings ${val}`, this.m_e)
                }
            } else {
                this.skipLogCurrElem()
            }
        }

        // Finally add barres
        for (const [fret, startString] of bStarts) {
            if (!bEnds.has(fret)) {
                continue
            }

            const endString = bEnds.get(fret)!
            fd.setBarre(startString, endString, fret - fd.fretOffset())
        }

        return fd
    }

    //---------------------------------------------------------
    //   harmony
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/harmony node.
     */

    harmony(partId: string, measure: Measure, sTime: Fraction,
        harmonyMap: HarmonyMap): void {
        void measure
        let track: track_idx_t = this.m_pass1.trackForPart(partId)

        const staff = this.m_score.staff(track2staff(track))
        const key = staff ? staff.key(sTime) : Key.INVALID

        const color = Color.fromString(this.m_e.asciiAttribute('color'))
        const fontFamily = this.m_e.attribute('font-family')
        const placement = this.m_e.attribute('placement')
        const printObject = this.m_e.asciiAttribute('print-object') !== 'no'

        let kind = ''
        let kindText = ''
        let functionText = ''
        let inversionText = ''
        let symbols = ''
        let parens = ''
        let degreeList: HDegree[] = []

        let fd: FretDiagram | null = null
        const ha = Factory.createItem(ElementType.HARMONY, scoreDummy(this.m_score).segment()) as Harmony
        let info = new HarmonyInfo(this.m_score)
        let offset = new Fraction()
        if (placement !== '') {
            ha.setPlacement(placement === 'below' ? PlacementV.BELOW : PlacementV.ABOVE)
            ha.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
            ha.resetProperty(Pid.OFFSET)
        }
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'root') {
                if (info.rootTpc() !== Tpc.TPC_INVALID) {
                    const d = harmonyFromXml(info, this.m_score, kind, kindText, symbols, parens, degreeList)!
                    info.setId(d.id)
                    info.setTextName(d.names[0])
                    ha.addChord(info)
                    degreeList = []
                    info = new HarmonyInfo(this.m_score)
                }
                let step = ''
                let alter = 0
                let invalidRoot = false
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'root-step') {
                        // attributes: print-style
                        step = this.m_e.readText()
                        // (like in C++ the reader is at the end element here, which has no attributes)
                        if (this.m_e.hasAttribute('text')) {
                            if (this.m_e.attribute('text') === '') {
                                invalidRoot = true
                            }
                        }
                    } else if (this.m_e.name() === 'root-alter') {
                        // attributes: print-object, print-style
                        //             location (left-right)
                        alter = strToInt(trimmed(this.m_e.readText()))
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                if (invalidRoot) {
                    info.setRootTpc(Tpc.TPC_INVALID)
                } else {
                    info.setRootTpc(step2tpcByName(step, alter as AccidentalVal))
                }
            } else if (this.m_e.name() === 'function') {
                // deprecated in MusicXML 4.0
                // attributes: print-style
                info.setRootTpc(Tpc.TPC_INVALID)
                info.setBassTpc(Tpc.TPC_INVALID)
                functionText = this.m_e.readText()
                ha.setHarmonyType(HarmonyType.ROMAN)
            } else if (this.m_e.name() === 'numeral') {
                info.setRootTpc(Tpc.TPC_INVALID)
                info.setBassTpc(Tpc.TPC_INVALID)
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'numeral-root') {
                        functionText = this.m_e.attribute('text')
                        const numeralRoot = this.m_e.readText()
                        if (functionText === '' || (functionText[0] >= '0' && functionText[0] <= '9')) {
                            ha.setHarmonyType(HarmonyType.NASHVILLE)
                            setHarmonyRootTpcFromFunction(info, ha, numeralRoot, key)
                        } else {
                            ha.setHarmonyType(HarmonyType.ROMAN)
                        }
                    } else if (this.m_e.name() === 'numeral-alter') {
                        const alter = strToInt(this.m_e.readText())
                        switch (alter) {
                        case -1:
                            setHarmonyRootTpcFromFunction(info, ha, 'b' + harmonyXmlFunction(info, ha, key), key)
                            break
                        case 1:
                            setHarmonyRootTpcFromFunction(info, ha, '#' + harmonyXmlFunction(info, ha, key), key)
                            break
                        default:
                            break
                        }
                    } else {
                        this.skipLogCurrElem()
                    }
                }
            } else if (this.m_e.name() === 'kind') {
                // attributes: use-symbols  yes-no
                //             text, stack-degrees, parentheses-degree, bracket-degrees,
                //             print-style, halign, valign
                kindText = this.m_e.attribute('text')
                symbols = this.m_e.attribute('use-symbols')
                parens = this.m_e.attribute('parentheses-degrees')
                kind = this.m_e.readText()
                if (kind === 'none') {
                    info.setRootTpc(Tpc.TPC_INVALID)
                }
            } else if (this.m_e.name() === 'inversion') {
                const inversion = strToInt(this.m_e.readText())
                switch (inversion) {
                case 1: inversionText = '6'
                    break
                case 2: inversionText = '64'
                    break
                default:
                    inversionText = ''
                    break
                }
            } else if (this.m_e.name() === 'bass') {
                let step = ''
                let alter = 0
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'bass-step') {
                        // attributes: print-style
                        step = this.m_e.readText()
                    } else if (this.m_e.name() === 'bass-alter') {
                        // attributes: print-object, print-style
                        //             location (left-right)
                        alter = strToInt(trimmed(this.m_e.readText()))
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                info.setBassTpc(step2tpcByName(step, alter as AccidentalVal))
            } else if (this.m_e.name() === 'degree') {
                let degreeValue = 0
                let degreeAlter = 0
                let degreeType = ''
                while (this.m_e.readNextStartElement()) {
                    if (this.m_e.name() === 'degree-value') {
                        degreeValue = this.m_e.readInt()
                    } else if (this.m_e.name() === 'degree-alter') {
                        degreeAlter = strToInt(trimmed(this.m_e.readText()))
                    } else if (this.m_e.name() === 'degree-type') {
                        degreeType = this.m_e.readText()
                    } else {
                        this.skipLogCurrElem()
                    }
                }
                if (degreeValue <= 0 || degreeValue > 13
                    || degreeAlter < -2 || degreeAlter > 2
                    || (degreeType !== 'add' && degreeType !== 'alter' && degreeType !== 'subtract')) {
                    this.m_logger.logError(`incorrect degree: degreeValue=${degreeValue} degreeAlter=${degreeAlter} degreeType=${degreeType}`,
                        this.m_e)
                } else {
                    if (degreeType === 'add') {
                        degreeList.push(new HDegree(degreeValue, degreeAlter, HDegreeType.ADD))
                    } else if (degreeType === 'alter') {
                        degreeList.push(new HDegree(degreeValue, degreeAlter, HDegreeType.ALTER))
                    } else if (degreeType === 'subtract') {
                        degreeList.push(new HDegree(degreeValue, degreeAlter, HDegreeType.SUBTRACT))
                    }
                }
            } else if (this.m_e.name() === 'frame') {
                fd = this.frame()
            } else if (this.m_e.name() === 'level') {
                this.skipLogCurrElem()
            } else if (this.m_e.name() === 'offset') {
                const off: Ref<Fraction> = { v: this.m_pass1.calcTicks(this.m_e.readInt(), this.m_divs, this.m_e) }
                preventNegativeTick(sTime, off, this.m_logger)
                offset = off.v
            } else if (this.m_e.name() === 'staff') {
                const nstaves = this.m_pass1.getPart(partId)!.nstaves()
                const strStaff = this.m_e.readText()
                const staffIdx = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strStaff))
                if (staffIdx >= 0 && staffIdx < nstaves) {
                    track += staffIdx * VOICES
                } else {
                    this.m_logger.logError(`invalid staff ${strStaff}`, this.m_e)
                }
            } else {
                this.skipLogCurrElem()
            }
        }

        let d: ChordDescription | null = null
        if (info.rootTpc() !== Tpc.TPC_INVALID || ha.harmonyType() === HarmonyType.NASHVILLE) {
            d = harmonyFromXml(info, this.m_score, kind, kindText, symbols, parens, degreeList)
        }
        if (d) {
            info.setId(d.id)
            info.setTextName(d.names[0])
        } else {
            info.setId(-1)
            const textName = functionText + kindText + inversionText
            info.setTextName(textName)
        }
        ha.addChord(info)

        ha.setVisible(printObject)
        if (placement === 'below') {
            ha.setPlacement(PlacementV.BELOW)
            ha.resetProperty(Pid.OFFSET)
        }
        colorItem(ha, color)
        if (fontFamily !== '') {
            ha.setFamily(fontFamily)
            ha.setPropertyFlags(Pid.FONT_FACE, PropertyFlags.UNSTYLED)
        }

        const newHarmonyDesc = new HarmonyDesc(track, ha, fd)
        let insert = true
        if (this.m_pass1.sibOrDolet()) {
            const ticks = sTime.plus(offset).ticks()
            for (let i = 0; i < harmonyMap.size(); ++i) {
                if (harmonyMap.keyAt(i) !== ticks) {
                    continue
                }
                const foundHarmonyDesc = harmonyMap.valueAt(i)
                if (track2staff(foundHarmonyDesc.m_track) === track2staff(track) && foundHarmonyDesc.m_harmony
                    && foundHarmonyDesc.descr() === info.descr()) {
                    if (foundHarmonyDesc.m_harmony && foundHarmonyDesc.fretDiagramVisible() === newHarmonyDesc.fretDiagramVisible()) {
                        // Matching harmony with matching visibility of fret diagram.  No need to add
                        insert = false
                    } else if (fd && fd.visible() && !foundHarmonyDesc.fretDiagramVisible()) {
                        // Matching harmony without a fret diagram found at this tick, replace with this harmony and its fret diagram
                        foundHarmonyDesc.m_harmony = ha
                        foundHarmonyDesc.m_fretDiagram = fd
                        foundHarmonyDesc.m_track = track
                        insert = false
                    }
                }
            }
        }

        if (insert) {
            // No harmony at this tick, add to the map
            harmonyMap.insert(sTime.plus(offset).ticks(), newHarmonyDesc)
        }
    }

    //---------------------------------------------------------
    //   beam
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/beam node.
     Collects beamTypes, used in computeBeamMode.
     */

    beam(beamTypes: IntMap<string>): void {
        const hasBeamNo = { v: false }
        const beamNo = strToInt(this.m_e.asciiAttribute('number'), hasBeamNo)
        const s = this.m_e.readText()

        beamTypes.insert(hasBeamNo.v ? beamNo : 1, s)
    }

    //---------------------------------------------------------
    //   forward
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/forward node.
     */

    forward(dura: Ref<Fraction>): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'duration') {
                this.duration(dura)
            } else if (this.m_e.name() === 'staff') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else if (this.m_e.name() === 'voice') {
                this.m_e.skipCurrentElement()        // skip but don't log
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   backup
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/backup node.
     */

    backup(dura: Ref<Fraction>): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'duration') {
                this.duration(dura)
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   stem
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/note/stem node.
     */

    stem(sd: Ref<DirectionV>, nost: Ref<boolean>): void {
        // defaults
        sd.v = DirectionV.AUTO
        nost.v = false

        const s = this.m_e.readText()

        if (s === 'up') {
            sd.v = DirectionV.UP
        } else if (s === 'down') {
            sd.v = DirectionV.DOWN
        } else if (s === 'none') {
            nost.v = true
        } else if (s === 'double') {
        } else {
            this.m_logger.logError(`unknown stem direction ${s}`, this.m_e)
        }
    }
}

//---------------------------------------------------------
//   MusicXmlParserDirection
//---------------------------------------------------------

export class MusicXmlParserDirection {
    m_e: XmlStreamReader
    m_score: Score                    // the score
    m_pass1: MusicXmlParserPass1                // the pass1 results
    m_pass2: MusicXmlParserPass2                // the pass2 results
    m_logger: MusicXmlLogger          // Error logger

    m_color = new Color()
    m_inferredHairpinStart: Hairpin | null = null
    m_inferredTempoLineStart: GradualTempoChange | null = null
    m_dynamicsColor = new Color()
    m_dynamicsPlacement = ''
    m_dynamicsList: string[] = []
    m_fontFamily = ''
    m_enclosure = ''
    m_wordsText = ''
    m_metroText = ''
    m_rehearsalText = ''
    m_justify = ''
    m_dynaVelocity = ''
    m_sndCoda = ''
    m_sndDacapo = ''
    m_sndDalsegno = ''
    m_sndFine = ''
    m_sndSegno = ''
    m_sndToCoda = ''
    m_codaId = ''
    m_segnoId = ''
    m_placement = ''
    m_play = ''
    m_hasDefaultY = false
    m_defaultY = 0.0
    m_hasRelativeY = false
    m_relativeY = 0.0
    m_relativeX = 0.0
    m_tpoMetro = 0.0                   // tempo according to metronome
    m_tpoSound = 0.0                   // tempo according to sound
    m_visible = true
    m_systemDirection = false
    m_swing: [number, number] = [0, 0]
    m_elems: EngravingItem[] = []
    m_offset = new Fraction(0, 1)
    m_track: track_idx_t = -1

    /**
     MusicXmlParserDirection constructor.
     */

    constructor(e: XmlStreamReader, score: Score, pass1: MusicXmlParserPass1, pass2: MusicXmlParserPass2, logger: MusicXmlLogger) {
        this.m_e = e
        this.m_score = score
        this.m_pass1 = pass1
        this.m_pass2 = pass2
        this.m_logger = logger
    }

    totalY(): number { return this.m_defaultY + this.m_relativeY }
    setBpm(bpm: number): void { this.m_tpoSound = bpm }
    hasTotalY(): boolean { return this.m_hasRelativeY || this.m_hasDefaultY }

    // private

    //---------------------------------------------------------
    //   skipLogCurrElem
    //---------------------------------------------------------

    /**
     Skip the current element, log debug as info.
     */

    skipLogCurrElem(): void {
        this.m_e.skipCurrentElement()
    }

    placement(): string {
        if (this.m_placement === '' && this.hasTotalY()) {
            return this.totalY() < 0 ? 'above' : 'below'
        } else {
            return this.m_placement
        }
    }

    //---------------------------------------------------------
    //   direction
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction node.
     */

    direction(partId: string, measure: Measure, tick: Fraction,
        spanners: MusicXmlSpannerMap, delayedDirections: DelayedDirectionsList, inferredFingerings: InferredFingeringsList,
        harmonyMap: HarmonyMap, measureHasCoda: Ref<boolean>, segnos: SegnoStack): void {
        this.m_placement = this.m_e.attribute('placement')
        this.m_track = this.m_pass1.trackForPart(partId)
        const isVocalStaff = this.m_pass1.isVocalStaff(partId)
        const isPercussionStaff = this.m_pass1.isPercussionStaff(partId)
        let isExpressionText = false
        const delayOttava = this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.SIBELIUS
        this.m_systemDirection = this.m_e.attribute('system') === 'only-top'
        const starts: MusicXmlSpannerDesc[] = []
        const stops: MusicXmlSpannerDesc[] = []
        let isDynamicRange = false
        let tempoTextAdded = false

        // note: file order is direction-type first, then staff
        // this means staff is still unknown when direction-type is handled
        // easiest solution is to put spanners on a stop and start list
        // and handle these after the while loop

        // note that placement is a <direction> attribute (which is currently supported by MS)
        // but the <direction-type> children also have formatting attributes
        // (currently NOT supported by MS, at least not for spanners when <direction> children)

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'direction-type') {
                this.directionType(starts, stops)
            } else if (this.m_e.name() === 'offset') {
                this.m_offset = this.m_pass1.calcTicks(this.m_e.readInt(), this.m_pass2.divs(), this.m_e)
                const offset = { v: this.m_offset }
                preventNegativeTick(tick, offset, this.m_logger)
                this.m_offset = offset.v
            } else if (this.m_e.name() === 'sound') {
                this.sound()
            } else if (this.m_e.name() === 'staff') {
                const strStaff = this.m_e.readText()
                const staff = this.m_pass1.getMusicXmlPart(partId).staffNumberToIndex(strToInt(strStaff))
                if (staff >= 0) {
                    this.m_track += staff * VOICES
                }
            } else {
                this.skipLogCurrElem()
            }
        }

        this.handleRepeats(measure, tick.plus(this.m_offset), measureHasCoda, segnos, delayedDirections)
        this.handleNmiCmi(measure, tick.plus(this.m_offset), delayedDirections)
        this.handleFraction()
        this.handleChordSym(tick.plus(this.m_offset), harmonyMap)
        this.handleDrumInstrument(isPercussionStaff, tick.plus(this.m_offset))

        // fix for Sibelius 7.1.3 (direct export) which creates metronomes without <sound tempo="..."/>:
        // if necessary, use the value calculated by metronome()
        // note: no floating point comparisons with 0 ...
        if (this.m_tpoSound < 0.1 && this.m_tpoMetro > 0.1) {
            this.m_tpoSound = this.m_tpoMetro
        }

        // create text if any text was found
        if (this.isLyricBracket()) {
            return
        } else if (this.isLikelyCredit(tick)) {
            const inferredText = this.addTextToHeader(TextStyleType.COMPOSER)
            if (inferredText) {
                this.m_pass1.setHasInferredHeaderText(true)
                this.hideRedundantHeaderText(inferredText, ['lyricist', 'composer', 'poet'])
            }
        } else if (this.isLikelySubtitle(tick)) {
            const inferredText = this.addTextToHeader(TextStyleType.SUBTITLE)
            if (inferredText) {
                this.m_pass1.setHasInferredHeaderText(true)
                if (this.m_score.metaTag('source') === '') {
                    this.m_score.setMetaTag('source', inferredText.plainText())
                }
                this.hideRedundantHeaderText(inferredText, ['source'])
            }
        } else if (this.isLikelyLegallyDownloaded(tick)) {
            // Ignore (TBD: print to footer?)
            return
        } else if (this.isLikelyTempoText(this.m_track)) {
            const tt = Factory.createItem(ElementType.TEMPO_TEXT, scoreDummy(this.m_score).segment()) as TempoText
            tt.setXmlText(this.m_wordsText + this.m_metroText)
            if (this.m_tpoSound > 0 && canAddTempoText(this.m_score.tempomap(), tick.ticks())) {
                const tpo = this.m_tpoSound / 60
                tt.setTempo(tpo)
                if (tt.plainText().includes('=')) {
                    tt.setFollowText(true)
                }
            }
            tt.setVisible(this.m_visible)

            this.m_pass2.addElemOffset(tt, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
            tempoTextAdded = true
        } else if (this.isLikelyTempoLine(this.m_track)) {
            const simplifiedText = simplified(MScoreTextToMusicXml.toPlainText(this.m_wordsText))
            this.m_wordsText = ''

            const gtc = getTempoChangeTypeFromString(simplifiedText)

            const tempoLine = Factory.createItem(ElementType.GRADUAL_TEMPO_CHANGE, scoreDummy(this.m_score).segment()) as GradualTempoChange
            tempoLine.setTempoChangeType(gtc)
            tempoLine.setBeginText(simplifiedText)
            tempoLine.setContinueText('')
            this.m_inferredTempoLineStart = tempoLine
        } else if (this.isLikelySticking()) {
            const sticking = Factory.createItem(ElementType.STICKING, scoreDummy(this.m_score).segment()) as Sticking
            sticking.setXmlText(this.m_wordsText)
            if (!RealIsNull(this.m_relativeX)) {
                const offset = sticking.offset()
                offset.setX(this.m_relativeX)
                sticking.setOffset(offset)
                sticking.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
            }

            // Add element to score later, after collecting all the others and sorting by default-y
            // This allows default-y to be at least respected by the order of elements
            // We also need to check whether the chord at the current tick has a grace note. Directions can appear
            // before the note they apply to, so this may not have been read yet
            const delayedDirection = new MusicXmlDelayedDirectionElement(
                this.totalY(), sticking, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
            delayedDirections.push(delayedDirection)
        } else if (this.isLikelyDynamicRange()) {
            isDynamicRange = true
        } else if (this.m_wordsText !== '' || this.m_rehearsalText !== '' || this.m_metroText !== '') {
            let t: TextBase | null = null
            if (this.m_tpoSound > 0.1) {
                if (canAddTempoText(this.m_score.tempomap(), tick.ticks())) {
                    this.m_tpoSound /= 60
                    t = Factory.createItem(ElementType.TEMPO_TEXT, scoreDummy(this.m_score).segment()) as TempoText
                    const rawWordsText = this.m_wordsText.replace(xmlTagRe, '')
                    const sep = this.m_metroText !== '' && rawWordsText !== '' && rawWordsText[rawWordsText.length - 1] !== ' ' ? ' ' : ''
                    t.setXmlText(this.m_wordsText + sep + this.m_metroText);
                    (t as TempoText).setTempo(this.m_tpoSound)
                    if (t.plainText().includes('=')) {
                        (t as TempoText).setFollowText(true)
                    }
                    this.m_score.setTempo(tick, this.m_tpoSound)
                    tempoTextAdded = true
                }
            } else {
                if (this.m_wordsText !== '' || this.m_metroText !== '') {
                    let technique = PlayingTechniqueType.Undefined
                    if (this.m_play !== '') {
                        technique = TConv.fromXmlPlayingTechniqueType(this.m_play, PlayingTechniqueType.Undefined)
                        this.m_play = ''
                    } else {
                        technique = this.getPlayingTechnique()
                    }
                    isExpressionText = this.m_wordsText.includes('<i>') && this.m_metroText === '' && this.placement() === 'below'
                    const seg = scoreDummy(this.m_score).segment()
                    if (isExpressionText) {
                        t = Factory.createItem(ElementType.EXPRESSION, seg) as TextBase
                    } else if (this.m_systemDirection) {
                        t = Factory.createItem(ElementType.SYSTEM_TEXT, seg) as TextBase
                    } else if (technique !== PlayingTechniqueType.Undefined) {
                        t = new PlayTechAnnotation(seg, technique, TextStyleType.STAFF)
                    } else {
                        t = Factory.createItem(ElementType.STAFF_TEXT, seg) as TextBase
                    }
                    t.setXmlText(this.m_wordsText + this.m_metroText)
                } else {
                    t = Factory.createItem(ElementType.REHEARSAL_MARK, scoreDummy(this.m_score).segment()) as TextBase
                    if (!this.m_rehearsalText.includes('<b>')) {
                        this.m_rehearsalText = '<b></b>' + this.m_rehearsalText            // explicitly turn bold off
                    }
                    t.setXmlText(this.m_rehearsalText)
                    if (!this.m_hasDefaultY) {
                        t.setPlacement(PlacementV.ABOVE)            // crude way to force placement TODO improve ?
                        t.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
                        t.resetProperty(Pid.OFFSET)
                    }
                }
            }

            if (t) {
                if (this.m_enclosure === 'circle') {
                    t.setFrameType(FrameType.CIRCLE)
                } else if (this.m_enclosure === 'none') {
                    t.setFrameType(FrameType.NO_FRAME)
                } else if (this.m_enclosure === 'rectangle') {
                    t.setFrameType(FrameType.SQUARE)
                    t.setFrameRound(new Spatium(0))
                }

                colorItem(t, this.m_color)

                if (musicXmlImportConfiguration().importLayout()) {
                    if (this.m_justify === 'right') {
                        t.setAlign(new Align(AlignH.RIGHT))
                    } else if (this.m_justify === 'center') {
                        t.setAlign(new Align(AlignH.HCENTER))
                    } else {
                        t.setAlign(new Align(AlignH.LEFT))
                    }
                }

                t.setVisible(this.m_visible)

                if (this.m_swing[1] !== 0) {
                    const stb = t as StaffTextBase
                    stb.setSwing(true)
                    stb.setSwingParameters(this.m_swing[0],
                        this.m_swing[0] ? this.m_swing[1]
                        : stb.style().styleI(Sid.swingRatio))
                    this.m_swing[1] = 0
                }

                let wordsPlacement = this.m_placement
                // Case-based defaults
                if (wordsPlacement === '') {
                    if (isVocalStaff) {
                        wordsPlacement = 'above'
                    } else if (isExpressionText) {
                        wordsPlacement = 'below'
                    }
                }

                const fingeringStr = this.m_wordsText.replace(xmlTagRe, '').replaceAll(' ', '')
                if (this.isLikelyFingering(fingeringStr)) {
                    this.m_logger.logDebugInfo(`Inferring fingering: ${fingeringStr}`)
                    t.setXmlText(fingeringStr)
                    const inferredFingering = new MusicXmlInferredFingering(this.totalY(), t, fingeringStr, this.m_track,
                        this.placement(), measure, tick.plus(this.m_offset))
                    inferredFingerings.push(inferredFingering)
                } else {
                    if (this.hasTotalY()) {
                        // Add element to score later, after collecting all the others and sorting by default-y
                        // This allows default-y to be at least respected by the order of elements
                        const delayedDirection = new MusicXmlDelayedDirectionElement(
                            this.totalY(), t, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
                        delayedDirections.push(delayedDirection)
                    } else {
                        this.m_pass2.addElemOffset(t, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
                    }
                }
            }
        } else if (this.m_tpoSound > 0) {
            // direction without text but with sound tempo="..."
            // create an invisible default TempoText

            if (canAddTempoText(this.m_score.tempomap(), tick.ticks())) {
                const tpo = this.m_tpoSound / 60
                const t = Factory.createItem(ElementType.TEMPO_TEXT, scoreDummy(this.m_score).segment()) as TempoText
                t.setXmlText(`${TempoText.duration2tempoTextString(new TDuration(DurationType.V_QUARTER))} = ${numberArg(this.m_tpoSound)}`)
                t.setVisible(false)
                t.setTempo(tpo)
                t.setFollowText(true)

                // TBD may want ro use tick + _offset if sound is affected
                this.m_score.setTempo(tick, tpo)

                this.m_pass2.addElemOffset(t, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
                tempoTextAdded = true
            }
        }

        if (tempoTextAdded) {
            const lines = this.m_pass2.getInferredTempoLine()
            terminateInferredLine(lines.slice(), tick.plus(this.m_offset), this.m_track)
        }
        this.addInferredTempoLine(tick.plus(this.m_offset))

        let firstDyn: Dynamic | null = null

        // do dynamics
        // LVIFIX: check import/export of <other-dynamics>unknown_text</...>
        for (let i = 0; i < this.m_dynamicsList.length; ++i) {
            const dynamic = Factory.createItem(ElementType.DYNAMIC, scoreDummy(this.m_score).segment()) as Dynamic
            dynamic.setDynamicType(this.m_dynamicsList[i])
            colorItem(dynamic, this.m_dynamicsColor)

            if (this.m_enclosure === 'circle') {
                dynamic.setFrameType(FrameType.CIRCLE)
            } else if (this.m_enclosure === 'none') {
                dynamic.setFrameType(FrameType.NO_FRAME)
            } else if (this.m_enclosure === 'rectangle') {
                dynamic.setFrameType(FrameType.SQUARE)
                dynamic.setFrameRound(new Spatium(0))
            }

            if (isDynamicRange) {
                if (i === 0) {
                    firstDyn = dynamic
                } else if (i === this.m_dynamicsList.length - 1 && firstDyn) {
                    // append hyphen and this dynamic to first
                    firstDyn.setXmlText(firstDyn.xmlText() + '<sym>dynamicCombinedSeparatorHyphen</sym>' + dynamic.xmlText())
                    continue
                }
            }

            if (this.m_dynaVelocity !== '') {
                let dynaValue = roundHalfAway(strToDouble(this.m_dynaVelocity) * 0.9)
                if (dynaValue > 127) {
                    dynaValue = 127
                } else if (dynaValue < 0) {
                    dynaValue = 0
                }
                dynamic.setVelocity(dynaValue)
            }

            dynamic.setVisible(this.m_visible)

            let dynamicsPlacement = this.placement()
            // Case-based defaults
            if (dynamicsPlacement === '') {
                dynamicsPlacement = isVocalStaff ? 'above' : 'below'
            }

            const hairpins = this.m_pass2.getInferredHairpins()
            terminateInferredLine(hairpins.slice(), tick.plus(this.m_offset), this.m_track)

            // Add element to score later, after collecting all the others and sorting by default-y
            // This allows default-y to be at least respected by the order of elements
            const delayedDirection = new MusicXmlDelayedDirectionElement(
                this.hasTotalY() ? this.totalY() : 100, dynamic, this.m_track, dynamicsPlacement, measure, tick.plus(this.m_offset))
            delayedDirections.push(delayedDirection)
        }

        this.addInferredHairpin(tick.plus(this.m_offset), isVocalStaff)

        // handle the elems
        for (const elem of this.m_elems) {
            // TODO (?) if (_hasDefaultY) elem->setYoff(_defaultY);
            if (this.hasTotalY()) {
                const delayedDirection = new MusicXmlDelayedDirectionElement(
                    this.totalY(), elem, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
                delayedDirections.push(delayedDirection)
            } else {
                this.m_pass2.addElemOffset(elem, this.m_track, this.placement(), measure, tick.plus(this.m_offset))
            }
        }

        // handle the spanner stops first
        for (const desc of stops) {
            const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, desc.tp, desc.nr))
            if (spdesc.isStopped) {
                this.m_logger.logError('spanner already stopped', this.m_e)
            } else {
                if (spdesc.isStarted) {
                    // Adjustments to ottavas by the offset value are unwanted
                    const spTick = spdesc.sp && spdesc.sp.isOttava() ? tick : tick.plus(this.m_offset)
                    if (spdesc.sp && spdesc.sp.isOttava() && delayOttava) {
                        // Sibelius writes ottava ends 1 note too early
                        this.m_pass2.setDelayedOttava(spdesc.sp)
                        this.m_pass2.delayedOttava()!.setTrack2(this.m_track)
                        this.m_pass2.delayedOttava()!.setTick2(spTick)
                        // need to set tick again later
                        this.m_pass2.clearSpanner(desc)
                    } else {
                        handleSpannerStop(spdesc.sp, this.m_track, spTick, spanners)
                        this.m_pass2.clearSpanner(desc)
                    }
                } else {
                    spdesc.sp = desc.sp
                    const spTick = spdesc.sp && spdesc.sp.isOttava() ? tick : tick.plus(this.m_offset)
                    spdesc.tick2 = spTick
                    spdesc.track2 = this.m_track
                    spdesc.isStopped = true
                }
            }
        }

        // then handle the spanner starts
        // TBD handle offset ?
        for (const desc of starts) {
            const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, desc.tp, desc.nr))
            if (spdesc.isStarted) {
                this.m_logger.logError('spanner already started', this.m_e)
            } else {
                let spannerPlacement = this.placement()
                // Case-based defaults
                if (spannerPlacement === '') {
                    if (desc.sp!.isHairpin()) {
                        spannerPlacement = isVocalStaff ? 'above' : 'below'
                    } else {
                        spannerPlacement = this.totalY() < 0 ? 'above' : 'below'
                    }
                }
                desc.sp!.setVisible(this.m_visible)
                if (spdesc.isStopped) {
                    this.m_pass2.addSpanner(desc)
                    // handleSpannerStart and handleSpannerStop must be called in order
                    // due to allocation of elements in the map
                    handleSpannerStart(desc.sp!, this.m_track, spannerPlacement, tick.plus(this.m_offset), spanners)
                    handleSpannerStop(spdesc.sp, spdesc.track2, spdesc.tick2, spanners)
                    this.m_pass2.clearSpanner(desc)
                } else {
                    this.m_pass2.addSpanner(desc)
                    handleSpannerStart(desc.sp!, this.m_track, spannerPlacement, tick.plus(this.m_offset), spanners)
                    spdesc.isStarted = true
                }
            }
        }
    }

    //---------------------------------------------------------
    //   isLikelyCredit
    //---------------------------------------------------------

    isLikelyCredit(tick: Fraction): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }
        return (tick.plus(this.m_offset).lt(new Fraction(5, 1))) // Only early in the piece
               && this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_tpoSound < 0.1
               && isLikelyCreditText(this.m_wordsText, false)
    }

    //---------------------------------------------------------
    //   isLyricBracket
    //    Dolet exports lyric brackets as staff text,
    //    which we ought not render.
    //---------------------------------------------------------

    isLyricBracket(): boolean {
        if (this.m_wordsText === '') {
            return false
        }

        if (!(this.m_wordsText[0] === '}' || this.m_wordsText[this.m_wordsText.length - 1] === '{')) {
            return false
        }

        return this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_dynamicsList.length === 0
               && this.m_tpoSound < 0.1
    }

    isLikelySubtitle(tick: Fraction): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }
        return (tick.plus(this.m_offset).lt(new Fraction(5, 1))) // Only early in the piece
               && this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_tpoSound < 0.1
               && isLikelySubtitleText(this.m_wordsText, false)
    }

    isLikelyLegallyDownloaded(tick: Fraction): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }
        return (tick.plus(this.m_offset).lt(new Fraction(5, 1)))   // Only early in the piece
               && this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_tpoSound < 0.1
               && /This music has been legally downloaded\.(?:\s| )Do not photocopy\./.test(this.m_wordsText)
    }

    isLikelyTempoText(track: track_idx_t): boolean {
        if (!musicXmlImportConfiguration().inferTextType() || this.m_wordsText.includes('<i>') || this.m_wordsText.includes('“')
            || this.m_wordsText.includes('”') || this.placement() === 'below'
            || track2staff(track) || this.m_wordsText === '' || this.m_swing[1]) {
            return false
        }

        const plainText = MScoreTextToMusicXml.toPlainText(simplified(this.m_wordsText)).toLowerCase()

        for (const str of tempoStrs) {
            if (plainText.includes(str)) {
                return true
            }
        }
        return false
    }

    handleFraction(): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }

        let rawWordsText = this.m_wordsText.replace(xmlTagRe, '')
        rawWordsText = simplified(rawWordsText)

        for (let n = 0; n < fracs.length; n++) {
            if (rawWordsText.includes(fracs[n])) {
                const p = n <= 2 ? 0x00BC + n : 0x2150 + n - 3
                rawWordsText = rawWordsText.replaceAll(fracs[n], String.fromCharCode(p))
                this.m_wordsText = rawWordsText
                return
            }
        }
    }

    isLikelyTempoLine(track: track_idx_t): boolean {
        if (!musicXmlImportConfiguration().inferTextType() || this.m_wordsText.includes('“')
            || this.m_wordsText.includes('”') || this.placement() === 'below'
            || track2staff(track) !== 0 || this.m_wordsText === '') {
            return false
        }

        const plainText = MScoreTextToMusicXml.toPlainText(simplified(this.m_wordsText))
        return /(^|(?:\s| ))(accel|faster|mosso|rit|rubato|slower|stretto)/i.test(plainText)
    }

    addTextToHeader(textStyleType: TextStyleType): Text {
        const t = new Text(scoreDummy(this.m_score), textStyleType)
        t.setXmlText(trimmed(this.m_wordsText))
        const firstMeasure = this.m_score.measures().first()!
        const vbox = firstMeasure.isVBox() ? firstMeasure as VBox
            : MusicXmlParserPass1.createAndAddVBoxForCreditWords(this.m_score, new Fraction(0, 1))
        const spatium = this.m_score.style().styleD(Sid.spatium)
        vbox.setBoxHeight(vbox.boxHeight().plus(new Spatium(t.height() / spatium / 2))) // add some height
        vbox.add(t)
        return t
    }

    //---------------------------------------------------------
    //   hideRedundantHeaderText
    //    After inferring header text, hide redundant text.
    //    Redundant text is detected by checking all the
    //    Text elements of the inferred text's VBox against
    //    the contents of the eligible metaTags
    //---------------------------------------------------------

    hideRedundantHeaderText(inferredText: Text,
        metaTags: readonly string[]): void {
        const parent = inferredText.parent()
        if (!parent || !parent.isVBox()) {
            return
        }

        for (const e of (parent as VBox).el()) {
            if (e === inferredText || !e.isText()) {
                continue
            }

            const t = e as Text
            for (const metaTag of metaTags) {
                if (t.plainText() === this.m_score.metaTag(metaTag)) {
                    t.setVisible(false)
                    continue
                }
            }
        }
    }

    //---------------------------------------------------------
    //   directionType
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type node.
     */

    directionType(starts: MusicXmlSpannerDesc[],
        stops: MusicXmlSpannerDesc[]): void {
        while (this.m_e.readNextStartElement()) {
            const hasDefaultY = { v: false }
            this.m_defaultY = strToDouble(this.m_e.asciiAttribute('default-y'), hasDefaultY) * -0.1
            this.m_hasDefaultY = hasDefaultY.v
            this.m_relativeX = this.m_e.doubleAttribute('relative-x') / 10 * this.m_score.style().spatium()
            this.m_visible = this.m_e.asciiAttribute('print-object') !== 'no' // only available for "metronome" and "other-direction"
            const number = this.m_e.attribute('number')
            let n = 0
            if (number !== '') {
                n = strToInt(number)
                if (n <= 0) {
                    this.m_logger.logError(`invalid number ${number}`, this.m_e)
                } else {
                    n--          // make zero-based
                }
            }
            const type = this.m_e.attribute('type')
            this.m_color = Color.fromString(this.m_e.asciiAttribute('color'))
            this.m_justify = this.m_e.attribute('justify')
            if (this.m_e.name() === 'metronome') {
                const r = { v: this.m_tpoMetro }
                this.m_metroText = this.metronome(r)
                this.m_tpoMetro = r.v
            } else if (this.m_e.name() === 'words') {
                this.m_enclosure = this.m_e.attribute('enclosure')
                this.m_fontFamily = this.m_e.attribute('font-family')
                const nextPart = { v: nextPartOfFormattedString(this.m_e) }

                this.textToDynamic(nextPart)
                this.textToCrescLine(nextPart)
                this.handleTempo(nextPart)
                this.m_wordsText += nextPart.v
            } else if (this.m_e.name() === 'rehearsal') {
                this.m_enclosure = this.m_e.attribute('enclosure')
                if (this.m_enclosure === '') {
                    this.m_enclosure = 'square'          // note different default
                }
                this.m_rehearsalText += nextPartOfFormattedString(this.m_e)
            } else if (this.m_e.name() === 'harp-pedals') {
                this.harpPedal()
            } else if (this.m_e.name() === 'pedal') {
                this.pedal(type, n, starts, stops)
            } else if (this.m_e.name() === 'octave-shift') {
                this.octaveShift(type, n, starts, stops)
            } else if (this.m_e.name() === 'dynamics') {
                this.dynamics()
            } else if (this.m_e.name() === 'bracket') {
                this.bracket(type, n, starts, stops)
            } else if (this.m_e.name() === 'dashes') {
                this.dashes(type, n, starts, stops)
            } else if (this.m_e.name() === 'wedge') {
                this.wedge(type, n, starts, stops)
            } else if (this.m_e.name() === 'coda') {
                const smufl = this.m_e.attribute('smufl')
                if (smufl !== '') {
                    this.m_wordsText += '<sym>' + smufl + '</sym>'
                } else {
                    this.m_wordsText += '<sym>coda</sym>'
                }
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'segno') {
                const smufl = this.m_e.attribute('smufl')
                if (smufl !== '') {
                    this.m_wordsText += '<sym>' + smufl + '</sym>'
                } else {
                    this.m_wordsText += '<sym>segno</sym>'
                }
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'eyeglasses') {
                this.m_wordsText += '<sym>miscEyeglasses</sym>'
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'symbol') {
                const smufl = this.m_e.readText()
                if (smufl !== '') {
                    this.m_wordsText += '<sym>' + smufl + '</sym>'
                }
            } else if (this.m_e.name() === 'string-mute') {
                if (type === 'on') {
                    this.m_wordsText += '<sym>stringsMuteOn</sym>'
                } else if (type === 'off') {
                    this.m_wordsText += '<sym>stringsMuteOff</sym>'
                }
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'other-direction') {
                this.otherDirection()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   sound
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/sound node.
     */

    sound(): void {
        this.m_sndCoda = this.m_e.attribute('coda')
        this.m_sndDacapo = this.m_e.attribute('dacapo')
        this.m_sndDalsegno = this.m_e.attribute('dalsegno')
        this.m_sndFine = this.m_e.attribute('fine')
        this.m_sndSegno = this.m_e.attribute('segno')
        this.m_sndToCoda = this.m_e.attribute('tocoda')
        this.m_tpoSound = this.m_e.doubleAttribute('tempo')
        this.m_dynaVelocity = this.m_e.attribute('dynamics')

        const pizz = this.m_e.attribute('pizzicato')
        if (pizz === 'yes') {
            this.m_play = 'pizzicato'
        } else if (pizz === 'no') {
            this.m_play = 'natural'
        }

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'play') {
                this.play()
            } else if (this.m_e.name() === 'swing') {
                this.swing()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   play
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/sound/play node.
     */

    play(): void {
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'mute') {
                const muted = this.m_e.readText()
                this.m_play = (muted === 'off') ? 'open' : 'mute'
            } else if (this.m_e.name() === 'other-play') {
                this.m_play = this.m_e.attribute('type')
                this.m_e.skipCurrentElement()
            } else {
                this.skipLogCurrElem()
            }
        }
    }

    //---------------------------------------------------------
    //   swing
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/sound/swing node.
     */

    swing(): void {
        let swingNumerator = 1
        let swingDenominator = 1
        let swingUnit = 0
        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'straight') {
                // unused
                this.m_e.skipCurrentElement()
            } else if (this.m_e.name() === 'first') {
                swingDenominator = strToInt(this.m_e.readText())
            } else if (this.m_e.name() === 'second') {
                swingNumerator = strToInt(this.m_e.readText())
            } else if (this.m_e.name() === 'swing-type') {
                const swingType = this.m_e.readText()
                if (swingType === 'eighth') {
                    swingUnit = Math.trunc(Constants.DIVISION / 2)
                } else if (swingType === '16th') {
                    swingUnit = Math.trunc(Constants.DIVISION / 4)
                }
            } else if (this.m_e.name() === 'swing-style') {
                // unused
                this.m_e.skipCurrentElement()
            } else {
                this.skipLogCurrElem()
            }
        }
        this.m_swing[0] = swingUnit
        this.m_swing[1] = Math.trunc((swingNumerator * 100) / swingDenominator)
    }

    //---------------------------------------------------------
    //   dynamics
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/dynamics node.
     */

    dynamics(): void {
        this.m_dynamicsColor = Color.fromString(this.m_e.attribute('color'))
        this.m_enclosure = this.m_e.attribute('enclosure')
        this.m_dynamicsPlacement = this.m_e.attribute('placement')

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'other-dynamics') {
                this.m_dynamicsList.push(this.m_e.readText())
            } else {
                this.m_dynamicsList.push(this.m_e.name())
                this.m_e.skipCurrentElement()
            }
        }
    }

    //---------------------------------------------------------
    //   harpPedal
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/hair-pedal node.
     */

    harpPedal(): void {
        const pedalSteps: readonly string[] = ['D', 'C', 'B', 'E', 'F', 'G', 'A']
        const color = Color.fromString(this.m_e.attribute('color'))

        const hpd = Factory.createItem(ElementType.HARP_DIAGRAM, scoreDummy(this.m_score).segment()) as HarpPedalDiagram
        while (this.m_e.readNextStartElement()) {
            let stepIndex = 0
            let pedpos = 0 as PedalPosition      // PedalPosition::UNSET
            while (this.m_e.readNextStartElement()) {
                if (this.m_e.name() === 'pedal-step') {
                    const idx = pedalSteps.indexOf(this.m_e.readText())
                    stepIndex = idx >= 0 ? idx : pedalSteps.length
                } else if (this.m_e.name() === 'pedal-alter') {
                    pedpos = (strToInt(trimmed(this.m_e.readText())) + 1) as PedalPosition
                } else {
                    this.skipLogCurrElem()
                }
            }
            hpd.setPedal(stepIndex as HarpStringType, pedpos)
            colorItem(hpd, color)
        }
        this.m_elems.push(hpd)
    }

    otherDirection(): void {
        // <other-direction> element is used to define any <direction> symbols not yet in the MusicXML format
        const smufl = this.m_e.attribute('smufl')
        const color = Color.fromString(this.m_e.attribute('color'))

        // Read smufl symbol
        if (smufl !== '') {
            const id = SymNames.symIdByName(smufl, SymId.noSym)
            if (id !== SymId.noSym) {
                const smuflSym = Factory.createItem(ElementType.SYMBOL, scoreDummy(this.m_score)) as SymbolItem
                smuflSym.setSym(id)
                colorItem(smuflSym, color)
                this.m_elems.push(smuflSym)
            }
            this.m_e.skipCurrentElement()
        } else {
            // TODO: Multiple sets of maps for exporters other than Dolet 6/Sibelius
            // TODO: Add more symbols from Sibelius
            const otherDirectionStrings = new StringMap<string>()
            if (this.m_pass1.dolet()) {
                otherDirectionStrings.set('To Coda', 'To Coda')
                otherDirectionStrings.set('Segno', '<sym>segno</sym>')
                otherDirectionStrings.set('CODA', 'CODA')
            }
            const t = this.m_e.readText()
            const val = otherDirectionStrings.get(t) ?? ''
            if (val !== '') {
                this.m_wordsText += val
            } else {
                const sym = otherDirectionSyms.get(t) ?? SymId.noSym
                const smuflSym = Factory.createItem(ElementType.SYMBOL, scoreDummy(this.m_score)) as SymbolItem
                smuflSym.setSym(sym)
                colorItem(smuflSym, color)
                this.m_elems.push(smuflSym)
            }
        }
    }

    matchRepeat(plainWords: string): string {
        if (daCapoRe.test(plainWords)) {
            return 'daCapo'
        }
        if (daCapoAlFineRe.test(plainWords)) {
            return 'daCapoAlFine'
        }
        if (daCapoAlCodaRe.test(plainWords)) {
            return 'daCapoAlCoda'
        }
        if (dalSegnoRe.test(plainWords)) {
            return 'dalSegno'
        }
        if (dalSegnoAlFineRe.test(plainWords)) {
            return 'dalSegnoAlFine'
        }
        if (dalSegnoAlCodaRe.test(plainWords)) {
            return 'dalSegnoAlCoda'
        }
        if (segnoRe.test(plainWords)) {
            return 'segno'
        }
        if (fineRe.test(plainWords)) {
            return 'fine'
        }
        if (toCodaRe.test(plainWords)) {
            return 'toCoda'
        }
        if (codaRe.test(plainWords)) {
            return 'coda'
        }
        return ''
    }

    isLikelyFingering(fingeringStr: string): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }

        return fingeringRe.test(fingeringStr)
               && this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_tpoSound < 0.1
    }

    //---------------------------------------------------------
    //   textToDynamic
    //---------------------------------------------------------
    /**
     Attempts to convert text to dynamic text. No-op if unable.
     */
    textToDynamic(text: Ref<string>): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }
        let simplifiedText = simplified(MScoreTextToMusicXml.toPlainText(text.v))
        // Correct finale's incorrect dynamic export
        if (this.m_pass1.exporterSoftware() === MusicXmlExporterSoftware.FINALE) {
            for (const [k, v] of finaleDynamicSubs) {
                if (simplifiedText === k) {
                    simplifiedText = v
                }
            }
        }
        // We don't want to count a single 'm', 'r', 's' or 'z' as a whole dynamic
        // try to find a dynamic - xml representation or
        // if found add to dynamics list and set text to blank string
        if (!/^[mrsz]$/.test(simplifiedText) && dynamicValid(simplifiedText)) {
            const dt = TConv.fromXmlDynamicType(simplifiedText, DynamicType.OTHER)
            if (dt !== DynamicType.OTHER) {
                this.m_dynaVelocity = String(roundHalfAway(Dynamic.dynInfo(dt).velocity / 0.9))
                this.m_dynamicsList.push(Dynamic.dynamicText(dt))
                text.v = ''
            }
        }
    }

    textToCrescLine(text: Ref<string>): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }
        const simplifiedText = simplified(MScoreTextToMusicXml.toPlainText(text.v))
        const cresc = simplifiedText.includes('cresc')
        const dim = simplifiedText.includes('dim')
        if (!cresc && !dim) {
            return
        }

        // Create line
        text.v = ''
        const line = Factory.createItem(ElementType.HAIRPIN, scoreDummy(this.m_score).segment()) as Hairpin

        line.setHairpinType(cresc ? HairpinType.CRESC_LINE : HairpinType.DIM_LINE)
        line.setBeginText(simplifiedText)
        line.setContinueText('')
        line.setProperty(Pid.LINE_VISIBLE, false)
        this.m_inferredHairpinStart = line
    }

    addInferredHairpin(tick: Fraction,
        isVocalStaff: boolean): void {
        if (!musicXmlImportConfiguration().inferTextType() || !this.m_inferredHairpinStart) {
            return
        }

        this.m_inferredHairpinStart.setTrack(this.m_track)
        this.m_inferredHairpinStart.setTick(tick.plus(this.m_offset))

        let spannerPlacement = this.m_placement
        if (this.m_placement === '') {
            spannerPlacement = isVocalStaff ? 'above' : 'below'
        }
        setSLinePlacement(this.m_inferredHairpinStart, spannerPlacement)

        this.m_pass2.addInferredHairpin(this.m_inferredHairpinStart)
    }

    addInferredTempoLine(tick: Fraction): void {
        if (!musicXmlImportConfiguration().inferTextType() || !this.m_inferredTempoLineStart) {
            return
        }

        this.m_inferredTempoLineStart.setTrack(this.m_track)
        this.m_inferredTempoLineStart.setTick(tick.plus(this.m_offset))

        const spannerPlacement = this.placement()

        setSLinePlacement(this.m_inferredTempoLineStart, spannerPlacement)

        this.m_pass2.addInferredTempoLine(this.m_inferredTempoLineStart)
    }

    //---------------------------------------------------------
    //   handleRepeats
    //---------------------------------------------------------

    handleRepeats(measure: Measure, tick: Fraction,
        measureHasCoda: Ref<boolean>, segnos: SegnoStack, delayedDirections: DelayedDirectionsList): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }
        // Try to recognize the various repeats
        let repeat: string
        const plainWords = MScoreTextToMusicXml.toPlainText(simplified(this.m_wordsText.toLowerCase()))
        if (this.m_sndCoda !== '') {
            repeat = 'coda'
        } else if (this.m_sndDacapo !== '') {
            repeat = 'daCapo'
        } else if (this.m_sndDalsegno !== '') {
            repeat = 'dalSegno'
        } else if (this.m_sndFine !== '') {
            repeat = 'fine'
        } else if (this.m_sndSegno !== '') {
            repeat = 'segno'
        } else if (this.m_sndToCoda !== '') {
            repeat = 'toCoda'
        } else {
            repeat = this.matchRepeat(plainWords)
        }
        // Check if repeat number has become detached
        if (repeat === 'coda' || repeat === 'segno') {
            this.m_wordsText += findDetachedRepeatNumber(measure, this.m_track, tick, this.placement(), delayedDirections)
        }

        // Check if coda is numbered by checking numerals after 'coda' or 'segno'
        if (repeat === 'daCapoAlCoda' || repeat === 'toCoda' || repeat === 'coda') {
            this.m_codaId = getMarkerId(plainWords)
        } else if (repeat === 'dalSegnoAlFine' || repeat === 'segno' || repeat === 'dalSegno') {
            this.m_segnoId = getMarkerId(plainWords)
        } else if (repeat === 'dalSegnoAlCoda') {
            // Find numerals eg D.S I al Coda II
            const matches = dalSegnoAlCodaGroupsRe.exec(plainWords)
            if (matches) {
                this.m_segnoId = matches[3] ?? ''
                this.m_codaId = matches[5] ?? ''
            }
        }

        if ((repeat === 'dalSegno' || repeat === 'dalSegnoAlCoda') && this.m_segnoId === '') {
            // If no numeral, count how many 's' in D.S. or D.S.S...
            this.m_segnoId = countSegno(plainWords)
        }

        if (repeat !== '') {
            let tb: TextBase | null = null
            if (this.m_codaId === 'i') {
                this.m_codaId = ''
            }
            if (this.m_segnoId === 'i') {
                this.m_segnoId = ''
            }
            this.m_wordsText = TextBase.unEscape(this.m_wordsText)
            if ((repeat === 'coda' || repeat === 'toCoda') && measureHasCoda.v) {
                // If there is already a coda in the bar, discard this marker
                this.m_wordsText = ''
                return
            } else if ((tb = this.findJump(repeat)) || (tb = this.findMarker(repeat))) {
                if (tb.isMarker()) {
                    if (repeat === 'segno') {
                        const prevSegno = segnos.get(tick.ticks()) ?? null
                        if (prevSegno) {
                            // If there is another segno at this tick, combine their text and increase the label
                            // eg. two segno symbols will have the label 'segnoii'
                            if (prevSegno.xmlText().includes('<sym>segno</sym>') && this.m_wordsText.includes('<sym>segno</sym>')) {
                                prevSegno.setXmlText(prevSegno.xmlText() + ' ' + this.m_wordsText)
                                this.m_wordsText = ''
                                const segnoCount = prevSegno.xmlText().split('<sym>segno</sym>').length - 1
                                const label = 'i'.repeat(segnoCount)
                                prevSegno.setLabel(prevSegno.label() + label)

                                return
                            }
                        } else {
                            segnos.insert(tick.ticks(), tb as Marker)
                        }
                    } else {
                        if (repeat === 'coda' || repeat === 'toCoda') {
                            measureHasCoda.v = true
                            const words = { v: this.m_wordsText }
                            addSymbolsToCoda(words, this.m_codaId)
                            this.m_wordsText = words.v
                        }
                    }
                }

                tb.setTrack(this.m_track)
                if (this.m_wordsText !== '') {
                    tb.setXmlText(this.m_wordsText)
                    this.m_wordsText = ''
                } else {
                    tb.setVisible(false)
                }
                // Sometimes Jumps and Markers are exported on the incorrect side
                // of the barline (i.e. end of mm. 29 vs. beginning of mm. 30).
                // This fixes that.
                const closerToLeft = tick.minus(measure.tick()).lt(measure.endTick().minus(tick))
                if (tb.textStyleType() === TextStyleType.REPEAT_RIGHT
                    && closerToLeft
                    && measure.prevMeasure()) {
                    measure = measure.prevMeasure()!
                } else if (tb.textStyleType() === TextStyleType.REPEAT_LEFT
                           && !closerToLeft
                           && measure.nextMeasure()) {
                    measure = measure.nextMeasure()!
                }
                // Temporary solution to indent codas - add a horizontal frame at start of system or midway through
                const prevMeasureBase = measure.prev()
                const hbox = !!prevMeasureBase && prevMeasureBase.isHBox()
                if (tb.isMarker() && (tb as Marker).markerType() === MarkerType.CODA && !hbox) {
                    const gap = this.m_score.insertBox(ElementType.HBOX, measure)
                    ;(gap as HBox).setBoxWidth(new Spatium(10))
                }
                tb.setVisible(this.m_visible)
                measure.add(tb)
            }
        }
    }

    findMarker(repeat: string): Marker | null {
        let m: Marker | null = null
        if (repeat === 'segno') {
            m = new Marker(scoreDummy(this.m_score))
            // note: Marker::read() also contains code to set text style based on type
            // avoid duplicated code
            // apparently this MUST be after setTextStyle
            m.setMarkerType(MarkerType.SEGNO)
            m.setLabel((m.propertyDefault(Pid.LABEL) as string) + this.m_segnoId)
        } else if (repeat === 'coda') {
            m = new Marker(scoreDummy(this.m_score))
            m.setMarkerType(MarkerType.CODA)
            m.setLabel((m.propertyDefault(Pid.LABEL) as string) + this.m_codaId)
        } else if (repeat === 'fine') {
            m = new Marker(scoreDummy(this.m_score), TextStyleType.REPEAT_RIGHT)
            m.setMarkerType(MarkerType.FINE)
            m.resetProperty(Pid.LABEL)
        } else if (repeat === 'toCoda') {
            m = new Marker(scoreDummy(this.m_score), TextStyleType.REPEAT_RIGHT)
            m.setMarkerType(MarkerType.TOCODA)
            m.setLabel((m.propertyDefault(Pid.LABEL) as string) + this.m_codaId)
        }
        return m
    }

    findJump(repeat: string): Jump | null {
        let jp: Jump | null = null
        const create = (): Jump => Factory.createItem(ElementType.JUMP, scoreDummy(this.m_score).measure()) as Jump
        if (repeat === 'daCapo') {
            jp = create()
            jp.setJumpType(JumpType.DC)
        } else if (repeat === 'daCapoAlCoda') {
            jp = create()
            jp.setJumpType(JumpType.DC_AL_CODA)
            jp.setPlayUntil(jp.playUntil() + this.m_codaId)
            jp.setContinueAt(jp.continueAt() + this.m_codaId)
        } else if (repeat === 'daCapoAlFine') {
            jp = create()
            jp.setJumpType(JumpType.DC_AL_FINE)
        } else if (repeat === 'dalSegno') {
            jp = create()
            jp.setJumpType(JumpType.DS)
            jp.setJumpTo(jp.jumpTo() + this.m_segnoId)
        } else if (repeat === 'dalSegnoAlCoda') {
            jp = create()
            jp.setJumpType(JumpType.DS_AL_CODA)
            jp.setJumpTo(jp.jumpTo() + this.m_segnoId)
            jp.setPlayUntil(jp.playUntil() + this.m_codaId)
            jp.setContinueAt(jp.continueAt() + this.m_codaId)
        } else if (repeat === 'dalSegnoAlFine') {
            jp = create()
            jp.setJumpType(JumpType.DS_AL_FINE)
            jp.setJumpTo(jp.jumpTo() + this.m_segnoId)
        }
        return jp
    }

    //---------------------------------------------------------
    //   handleNmiCmi
    //    Dolet strangely exports N.C. chord symbols as the
    //    text direction "NmiCmi".
    //---------------------------------------------------------

    handleNmiCmi(measure: Measure, tick: Fraction,
        delayedDirections: DelayedDirectionsList): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }
        if (!this.m_wordsText.includes('NmiCmi')) {
            return
        }
        const ha = new Harmony(scoreDummy(this.m_score).segment())
        const info = new HarmonyInfo(this.m_score)
        info.setRootTpc(Tpc.TPC_INVALID)
        info.setId(-1)
        info.setTextName('N.C.')
        ha.setTrack(this.m_track)
        ha.addChord(info)
        const delayedDirection = new MusicXmlDelayedDirectionElement(this.totalY(), ha, this.m_track, 'above', measure, tick)
        delayedDirections.push(delayedDirection)
        this.m_wordsText = this.m_wordsText.replaceAll('NmiCmi', 'N.C.')
    }

    handleChordSym(tick: Fraction, harmonyMap: HarmonyMap): void {
        if (!musicXmlImportConfiguration().inferTextType() || this.placement() === 'below') {
            return
        }

        const plainWords = simplified(this.m_wordsText).toLowerCase()
        if (!chordSymRe.test(plainWords)) {
            return
        }

        const ha = Factory.createItem(ElementType.HARMONY, scoreDummy(this.m_score).segment()) as Harmony
        ha.setHarmony(this.m_wordsText)
        ha.setTrack(this.m_track)
        ha.setPlacement(this.placement() === 'above' ? PlacementV.ABOVE : PlacementV.BELOW)
        ha.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
        ha.resetProperty(Pid.OFFSET)
        ha.setVisible(this.m_visible)
        const info = ha.chords().length === 0 ? null : ha.chords()[0]
        const desc: ChordDescription | null = info ? info.descr() : null
        const newHarmonyDesc = new HarmonyDesc(this.m_track, ha, null)

        const ticks = tick.ticks()
        let insert = true
        for (const [k, foundHarmonyDesc] of harmonyMap) {
            if (k !== ticks) {
                continue
            }

            // Don't insert if there is a matching chord symbol
            // This symbol doesn't have a fret diagram, so no need to check that here
            if (track2staff(foundHarmonyDesc.m_track) === track2staff(this.m_track) && foundHarmonyDesc.descr() === desc) {
                insert = false
            }
        }

        if (insert) {
            harmonyMap.insert(ticks, newHarmonyDesc)
        }
        this.m_wordsText = ''
    }

    handleTempo(wordsString: Ref<string>): void {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return
        }

        let textMap: MetronomeTextMap = new StringMap<[string, DurationType]>()
        if (this.m_pass1.sibOrDolet()) {
            textMap = sibeliusSyms
        } else if (this.m_fontFamily === 'MetTimes Plain') {
            textMap = metTimesSyms
        }
        if (textMap.empty()) {
            return
        }
        let substitutions = ''
        for (const [k] of textMap) {
            substitutions += k
        }

        // Pick up any tempo markings which may have been exported as <words>
        // eg. andante (q = c. 90)
        // Sibelius uses a symbol font with the characters 'yxeqhVwW' each drawn as a different duration
        // which we need to map to SMuFL syms
        let plainWords = MScoreTextToMusicXml.toPlainText(simplified(wordsString.v))

        if (!s_tempoRe) {
            s_tempoRe = new RegExp('.*([' + substitutions + '])(\\.?)(?:\\s|\\u00A0)*=[^0-9]*([0-9]+).*', 'g')
        }
        const tempoMatches: string[] = []
        for (const m of plainWords.matchAll(s_tempoRe)) {
            for (const g of [m[1], m[2], m[3]]) {
                if (g) {
                    tempoMatches.push(g)
                }
            }
        }

        // Not a tempo
        if (tempoMatches.length < 2) {
            return
        }

        const dur = tempoMatches[0]
        const dot = tempoMatches.length === 3
        const val = tempoMatches[dot ? 2 : 1]

        const dotStr = dot ? '<sym>space</sym><sym>metAugmentationDot</sym>' : ''

        if (!s_replaceRe) {
            s_replaceRe = new RegExp('(.*)[' + substitutions + ']\\.?((?:\\s|\\u00A0)*=[^0-9]*[0-9]+.*)', 'g')
        }
        // TODO(port): like C++ std::map::at, a duration character of the first call's substitutions that is not in textMap fails
        const entry = textMap.get(dur)!
        const newStr = '$1' + entry[0] + dotStr + '$2'
        plainWords = plainWords.replace(s_replaceRe, newStr)
        wordsString.v = plainWords

        if (val !== '' && dur !== '') {
            const ok = { v: false }
            const d = strToDouble(val, ok)
            const duration = new TDuration(entry[1])
            duration.setDots(dot ? 1 : 0)

            if (ok.v && duration.isValid()) {
                // convert fraction to beats per minute
                this.m_tpoMetro = 4 * duration.fraction().numerator() * d / duration.fraction().denominator()
            }
        }
    }

    isLikelySticking(): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }

        const plainWords = MScoreTextToMusicXml.toPlainText(simplified(this.m_wordsText))
        return /^[lrbLRB]+$/.test(plainWords)
               && this.m_rehearsalText === ''
               && this.m_metroText === ''
               && this.m_tpoSound < 0.1
    }

    isLikelyDynamicRange(): boolean {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return false
        }

        let rawWordsText = simplified(this.m_wordsText)
        rawWordsText = rawWordsText.replace(xmlTagRe, '')

        // If there are two dynamics and a hyphen in a single direction node, this is most likely something like "mp-f"
        return (simplified(rawWordsText) === '-' || simplified(rawWordsText) === '—') && this.m_dynamicsList.length === 2
    }

    getPlayingTechnique(): PlayingTechniqueType {
        if (!musicXmlImportConfiguration().inferTextType()) {
            return PlayingTechniqueType.Undefined
        }

        const plainWords = MScoreTextToMusicXml.toPlainText(simplified(this.m_wordsText))

        for (const [text, technique] of textToPlayTechniqueType) {
            if (plainWords.includes(text)) {
                return technique
            }
        }

        return PlayingTechniqueType.Undefined
    }

    handleDrumInstrument(isPerc: boolean, tick: Fraction): void {
        if (!musicXmlImportConfiguration().inferTextType() || this.m_wordsText === '' || this.m_rehearsalText !== ''
            || this.m_metroText !== '' || this.m_tpoSound > 0.1 || !isPerc) {
            return
        }

        let plainWords = this.m_wordsText

        plainWords = plainWords.replace(/to /gi, '')
        plainWords = plainWords.replace(/\(.*\)/g, '')

        plainWords = MScoreTextToMusicXml.toPlainText(simplified(plainWords))

        const it = searchTemplateForInstrNameList([plainWords], true, false)

        // Ignore marching percussion, as these won't map correctly to the standard drumkit
        if (it && it.familyId() !== 'batterie') {
            const pitch = it.useDrumset && it.drumset ? it.drumset.nextPitch(0) : 0

            // Text under the staff will be for voice 2 and 4 even if it's in voice 1
            const track = this.placement() === 'below' && !(this.m_track & 1) ? this.m_track + 1 : this.m_track

            const instr = new InferredPercInstr(pitch, track, it.id, tick)
            this.m_pass2.addInferredPercInstr(instr)
        }
    }

    //---------------------------------------------------------
    //   bracket
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/bracket node.
     */

    bracket(type: string, number: number,
        starts: MusicXmlSpannerDesc[], stops: MusicXmlSpannerDesc[]): void {
        const lineEnd = this.m_e.asciiAttribute('line-end')
        const lineType = this.m_e.asciiAttribute('line-type')
        const endLength = this.m_e.asciiAttribute('end-length')
        const isWavy = lineType === 'wavy'
        const elementType = isWavy ? ElementType.TRILL : ElementType.TEXTLINE
        const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, elementType, number))
        if (type === 'start') {
            if (spannerExists(starts, number, elementType)) {
                this.m_logger.logError(`${TConv.userNameElementType(elementType).translated()} with number ${number} already started`,
                    this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            let sline: SLine | null = spdesc.isStopped ? spdesc.sp : null
            if ((sline && sline.isTrill()) || (!sline && isWavy)) {
                if (!sline) {
                    sline = Factory.createItem(ElementType.TRILL, scoreDummy(this.m_score)) as Trill
                }
                const trill = sline as Trill
                trill.setTrillType(TrillType.PRALLPRALL_LINE)

                if (lineEnd !== '' && lineEnd !== 'none') {
                    this.m_logger.logError('line-end not supported for line-type "wavy"')
                }
            } else if ((sline && sline.isTextLine()) || (!sline && !isWavy)) {
                if (!sline) {
                    sline = Factory.createItem(ElementType.TEXTLINE, scoreDummy(this.m_score)) as TextLine
                    sline.setSystemFlag(this.m_systemDirection)
                }
                const textLine = sline as TextLine
                // if (placement.empty()) placement = "above";  // TODO ? set default

                if (endLength !== '') {
                    const length = strToDouble(endLength)
                    textLine.setBeginHookHeight(new Spatium(lineEnd === 'both' ? length / 20 : length / 10))
                    textLine.setPropertyFlags(Pid.BEGIN_HOOK_HEIGHT, PropertyFlags.UNSTYLED)
                }
                if (lineEnd === 'up') {
                    textLine.setBeginHookType(HookType.HOOK_90)
                } else if (lineEnd === 'down') {
                    textLine.setBeginHookType(HookType.HOOK_90)
                    textLine.setBeginHookHeight(textLine.beginHookHeight().times(-1))
                } else if (lineEnd === 'both') {
                    textLine.setBeginHookType(HookType.HOOK_90T)
                } else if (lineEnd === 'arrow') {
                    textLine.setBeginHookType(HookType.ARROW_FILLED)
                } else if (lineEnd === 'none') {
                    textLine.setBeginHookType(HookType.NONE)
                }

                // hack: combine with a previous words element
                if (this.m_wordsText !== '') {
                    // TextLine supports only limited formatting, remove all (compatible with 1.3)
                    textLine.setBeginText(MScoreTextToMusicXml.toPlainText(this.m_wordsText))
                    this.m_wordsText = ''
                }

                if (lineType === 'solid') {
                    textLine.setLineStyle(LineType.SOLID)
                    textLine.setPropertyFlags(Pid.LINE_STYLE, PropertyFlags.UNSTYLED)
                } else if (lineType === 'dashed') {
                    textLine.setLineStyle(LineType.DASHED)
                    textLine.setPropertyFlags(Pid.LINE_STYLE, PropertyFlags.UNSTYLED)
                } else if (lineType === 'dotted') {
                    textLine.setLineStyle(LineType.DOTTED)
                    textLine.setPropertyFlags(Pid.LINE_STYLE, PropertyFlags.UNSTYLED)
                } else if (lineType !== 'wavy') {
                    this.m_logger.logError(`unsupported line-type: ${lineType}`, this.m_e)
                }
                colorItem(textLine, Color.fromString(this.m_e.asciiAttribute('color')))
            }

            starts.push(new MusicXmlSpannerDesc(sline, elementType, number))
        } else if (type === 'stop') {
            if (spannerExists(stops, number, elementType)) {
                this.m_logger.logError(`${TConv.userNameElementType(elementType).translated()} with number ${number} already stopped`,
                    this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            let sline: SLine | null = spdesc.isStarted ? spdesc.sp : null
            if ((sline && sline.isTrill()) || (!sline && isWavy)) {
                if (!sline) {
                    sline = Factory.createItem(ElementType.TRILL, scoreDummy(this.m_score)) as Trill
                }
                if (lineEnd !== '' && lineEnd !== 'none') {
                    this.m_logger.logError('line-end not supported for line-type "wavy"')
                }
            } else if ((sline && sline.isTextLine()) || (!sline && !isWavy)) {
                if (!sline) {
                    sline = Factory.createItem(ElementType.TEXTLINE, scoreDummy(this.m_score)) as TextLine
                }
                const textLine = sline as TextLine

                if (endLength !== '') {
                    const length = strToDouble(endLength)
                    textLine.setEndHookHeight(new Spatium(lineEnd === 'both' ? length / 20 : length / 10))
                    textLine.setPropertyFlags(Pid.END_HOOK_HEIGHT, PropertyFlags.UNSTYLED)
                }
                if (lineEnd === 'up') {
                    textLine.setEndHookType(HookType.HOOK_90)
                } else if (lineEnd === 'down') {
                    textLine.setEndHookType(HookType.HOOK_90)
                    textLine.setEndHookHeight(textLine.endHookHeight().times(-1))
                } else if (lineEnd === 'both') {
                    textLine.setEndHookType(HookType.HOOK_90T)
                } else if (lineEnd === 'arrow') {
                    textLine.setEndHookType(HookType.ARROW_FILLED)
                } else if (lineEnd === 'none') {
                    textLine.setEndHookType(HookType.NONE)
                }
            }

            stops.push(new MusicXmlSpannerDesc(sline, elementType, number))
        }
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   dashes
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/dashes node.
     */

    dashes(type: string, number: number,
        starts: MusicXmlSpannerDesc[], stops: MusicXmlSpannerDesc[]): void {
        const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, ElementType.HAIRPIN, number))
        if (type === 'start') {
            if (spannerExists(starts, number, ElementType.HAIRPIN)) {
                this.m_logger.logError(`hairpin with number ${number} already started`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            let b: TextLineBase = spdesc.isStopped ? spdesc.sp as TextLineBase
                : Factory.createItem(ElementType.TEXTLINE, scoreDummy(this.m_score)) as TextLineBase
            // if (placement.empty()) placement = "above";  // TODO ? set default

            // hack: combine with a previous words element
            if (this.m_wordsText !== '') {
                // TextLine supports only limited formatting, remove all (compatible with 1.3)
                const simplifiedText = simplified(MScoreTextToMusicXml.toPlainText(this.m_wordsText))
                if (this.isLikelyTempoLine(this.m_track)) {
                    b = Factory.createItem(ElementType.GRADUAL_TEMPO_CHANGE, scoreDummy(this.m_score).segment()) as GradualTempoChange
                    const gtc = getTempoChangeTypeFromString(simplifiedText)
                    ;(b as GradualTempoChange).setTempoChangeType(gtc)
                }
                b.setBeginText(simplifiedText)
                this.m_wordsText = ''
            }

            b.setBeginHookType(HookType.NONE)
            b.setEndHookType(HookType.NONE)
            b.setLineStyle(LineType.DASHED)
            // TODO brackets and dashes now share the same storage
            // because they both use ElementType::TEXTLINE
            // use MusicXML specific type instead
            starts.push(new MusicXmlSpannerDesc(b, ElementType.TEXTLINE, number))
        } else if (type === 'stop') {
            if (spannerExists(stops, number, ElementType.HAIRPIN)) {
                this.m_logger.logError(`hairpin with number ${number} already stopped`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            const b: TextLineBase = spdesc.isStarted ? spdesc.sp as TextLineBase
                : Factory.createItem(ElementType.TEXTLINE, scoreDummy(this.m_score)) as TextLineBase
            stops.push(new MusicXmlSpannerDesc(b, ElementType.TEXTLINE, number))
        }
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   octaveShift
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/octave-shift node.
     */

    octaveShift(type: string, number: number,
        starts: MusicXmlSpannerDesc[], stops: MusicXmlSpannerDesc[]): void {
        const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, ElementType.OTTAVA, number))
        if (type === 'up' || type === 'down') {
            if (spannerExists(starts, number, ElementType.OTTAVA)) {
                this.m_logger.logError(`ottava with number ${number} already started`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            const ottavasize = this.m_e.intAttribute('size')
            if (!(ottavasize === 8 || ottavasize === 15 || ottavasize === 22)) {
                this.m_logger.logError(`unknown octave-shift size ${ottavasize}`, this.m_e)
            } else {
                const o = spdesc.isStopped ? spdesc.sp as Ottava : Factory.createItem(ElementType.OTTAVA, scoreDummy(this.m_score)) as Ottava

                if (type === 'down') {
                    this.m_placement = this.m_placement === '' ? 'above' : this.m_placement
                    if (ottavasize === 8) {
                        o.setOttavaType(OttavaType.OTTAVA_8VA)
                    } else if (ottavasize === 15) {
                        o.setOttavaType(OttavaType.OTTAVA_15MA)
                    } else if (ottavasize === 22) {
                        o.setOttavaType(OttavaType.OTTAVA_22MA)
                    }
                } else if (type === 'up') {
                    this.m_placement = this.m_placement === '' ? 'below' : this.m_placement
                    if (ottavasize === 8) {
                        o.setOttavaType(OttavaType.OTTAVA_8VB)
                    } else if (ottavasize === 15) {
                        o.setOttavaType(OttavaType.OTTAVA_15MB)
                    } else if (ottavasize === 22) {
                        o.setOttavaType(OttavaType.OTTAVA_22MB)
                    }
                }

                colorItem(o, Color.fromString(this.m_e.asciiAttribute('color')))

                starts.push(new MusicXmlSpannerDesc(o, ElementType.OTTAVA, number))
            }
        } else if (type === 'stop') {
            if (spannerExists(stops, number, ElementType.OTTAVA)) {
                this.m_logger.logError(`ottava with number ${number} already stopped`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            const o = spdesc.isStarted ? spdesc.sp as Ottava : Factory.createItem(ElementType.OTTAVA, scoreDummy(this.m_score)) as Ottava
            stops.push(new MusicXmlSpannerDesc(o, ElementType.OTTAVA, number))
        }
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   pedal
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/pedal node.
     */

    pedal(type: string, unusedNumber: number,
        starts: MusicXmlSpannerDesc[], stops: MusicXmlSpannerDesc[]): void {
        void unusedNumber
        const number = 0
        const line = this.m_e.asciiAttribute('line')
        let sign = this.m_e.attribute('sign')
        const color = Color.fromString(this.m_e.asciiAttribute('color'))
        const createPedal = (): Pedal => Factory.createItem(ElementType.PEDAL, scoreDummy(this.m_score)) as Pedal

        // We have found that many exporters omit "sign" even when one is originally present,
        // therefore we will default to "yes", even though this is technically against the spec.
        const overrideDefaultSign = true // TODO: set this flag based on the exporting software
        if (sign === '') {
            if (line !== 'yes' || (overrideDefaultSign && type === 'start')) {
                sign = 'yes'                           // MusicXML 2.0 compatibility
            } else if (line === 'yes') {
                sign = 'no'                            // MusicXML 2.0 compatibility
            }
        }
        const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, ElementType.PEDAL, number))
        if (type === 'start' || type === 'resume' || type === 'sostenuto') {
            if (spdesc.isStarted && !spdesc.isStopped) {
                // Previous pedal unterminated
                // if previous pedal was a change, create a new change instead of a new pedal start
                if ((spdesc.sp as Pedal).beginHookType() === HookType.HOOK_45) {
                    const p = createPedal()
                    p.setBeginHookType(HookType.HOOK_45)
                    p.setEndHookType(HookType.HOOK_90)
                    if (line === 'yes') {
                        p.setLineVisible(true)
                    } else {
                        p.setLineVisible(false)
                    }
                    if (sign === 'no') {
                        p.setBeginText('')
                        p.setContinueText('')
                        p.setEndText('')
                    }
                    colorItem(p, color)
                    starts.push(new MusicXmlSpannerDesc(p, ElementType.PEDAL, number))
                    this.m_e.skipCurrentElement()

                    return
                } else {
                    // likely an unrecorded "discontinue", so delete the line.
                    this.m_pass2.deleteHandledSpanner(spdesc.sp!)
                    spdesc.isStarted = false
                }
            }
            const p = spdesc.isStopped ? spdesc.sp as Pedal : createPedal()
            if (line === 'yes') {
                p.setLineVisible(true)
            } else {
                p.setLineVisible(false)
            }
            if (!p.lineVisible() || sign === 'yes') {
                p.setBeginText(this.m_score.style().styleSt(Sid.pedalText))
                p.setContinueText(this.m_score.style().styleSt(Sid.pedalContinueText))
                if (type === 'sostenuto') {
                    p.setBeginText('<sym>keyboardPedalSost</sym>')
                    p.setContinueText('<sym>keyboardPedalParensLeft</sym><sym>keyboardPedalSost</sym><sym>keyboardPedalParensRight</sym>')
                }
            } else {
                p.setBeginText('')
                p.setContinueText('')
                p.setBeginHookType(type === 'resume' ? HookType.NONE : HookType.HOOK_90)
            }
            p.setEndHookType(HookType.NONE)
            colorItem(p, color)
            starts.push(new MusicXmlSpannerDesc(p, ElementType.PEDAL, number))
        } else if (type === 'stop' || type === 'discontinue') {
            const p = spdesc.isStarted ? spdesc.sp as Pedal : createPedal()
            if (line === 'yes') {
                p.setLineVisible(true)
            } else if (line === 'no') {
                p.setLineVisible(false)
            }
            if ((!p.lineVisible() || sign === 'yes') && p.endHookType() === HookType.NONE) {
                p.setEndText('<sym>keyboardPedalUp</sym>')
            } else {
                p.setEndHookType(type === 'discontinue' ? HookType.NONE : HookType.HOOK_90)
            }
            stops.push(new MusicXmlSpannerDesc(p, ElementType.PEDAL, number))
        } else if (type === 'change') {
            // pedal change is implemented as two separate pedals
            // first stop the first one
            if (spdesc.isStarted && !spdesc.isStopped) {
                const p = spdesc.sp as Pedal
                p.setEndHookType(HookType.HOOK_45)
                if (line === 'yes') {
                    p.setLineVisible(true)
                } else if (line === 'no') {
                    p.setLineVisible(false)
                }
                stops.push(new MusicXmlSpannerDesc(p, ElementType.PEDAL, number))
            } else {
                this.m_logger.logError('"change" type pedal created without existing pedal', this.m_e)
            }
            // then start a new one
            const p = createPedal()
            p.setBeginHookType(HookType.HOOK_45)
            p.setEndHookType(HookType.HOOK_90)
            if (line === 'yes') {
                p.setLineVisible(true)
            } else {
                p.setLineVisible(false)
            }
            if (sign === 'no') {
                p.setBeginText('')
                p.setContinueText('')
            }
            colorItem(p, color)
            starts.push(new MusicXmlSpannerDesc(p, ElementType.PEDAL, number))
        } else if (type === 'continue') {
            // ignore
        } else {
            // unknown pedal type
        }

        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   wedge
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/wedge node.
     */

    wedge(type: string, number: number,
        starts: MusicXmlSpannerDesc[], stops: MusicXmlSpannerDesc[]): void {
        const niente = this.m_e.asciiAttribute('niente')
        const spdesc = this.m_pass2.getSpanner(new MusicXmlSpannerDesc(null, ElementType.HAIRPIN, number))
        const createHairpin = (): Hairpin => Factory.createItem(ElementType.HAIRPIN, scoreDummy(this.m_score).segment()) as Hairpin
        if (type === 'crescendo' || type === 'diminuendo') {
            if (spannerExists(starts, number, ElementType.HAIRPIN)) {
                this.m_logger.logError(`hairpin with number ${number} already started`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            const h = spdesc.isStopped ? spdesc.sp as Hairpin : createHairpin()
            h.setHairpinType(type === 'crescendo'
                ? HairpinType.CRESC_HAIRPIN : HairpinType.DIM_HAIRPIN)
            if (niente === 'yes') {
                h.setHairpinCircledTip(true)
            }
            colorItem(h, Color.fromString(this.m_e.asciiAttribute('color')))
            const lineType = this.m_e.asciiAttribute('line-type')
            if (lineType === 'dashed') {
                h.setLineStyle(LineType.DASHED)
            } else if (lineType === 'dotted') {
                h.setLineStyle(LineType.DOTTED)
            }
            const spread = this.m_e.attribute('spread')
            if (spread !== '' && musicXmlImportConfiguration().importLayout()) {
                const val = new Spatium(strToDouble(spread) / 10.0)
                h.setHairpinHeight(val)
            }
            starts.push(new MusicXmlSpannerDesc(h, ElementType.HAIRPIN, number))
        } else if (type === 'stop') {
            if (spannerExists(stops, number, ElementType.HAIRPIN)) {
                this.m_logger.logError(`hairpin with number ${number} already stopped`, this.m_e)
                this.m_e.skipCurrentElement()
                return
            }
            const h = spdesc.isStarted ? spdesc.sp as Hairpin : createHairpin()
            if (niente === 'yes') {
                h.setHairpinCircledTip(true)
            }
            stops.push(new MusicXmlSpannerDesc(h, ElementType.HAIRPIN, number))
        }
        this.m_e.skipCurrentElement()
    }

    //---------------------------------------------------------
    //   metronome
    //---------------------------------------------------------

    /**
     Parse the /score-partwise/part/measure/direction/direction-type/metronome node.
     Convert to text and set r to calculated tempo.
     */

    metronome(r: Ref<number>): string {
        r.v = 0
        let tempoText = ''
        let perMinute = ''
        const parenth = this.m_e.asciiAttribute('parentheses') === 'yes'

        if (parenth) {
            tempoText += '('
        }

        const dur1 = new TDuration()
        const dur2 = new TDuration()

        while (this.m_e.readNextStartElement()) {
            if (this.m_e.name() === 'metronome-note' || this.m_e.name() === 'metronome-relation') {
                this.skipLogCurrElem()
                continue
            }
            const name = this.m_e.name()
            const txt = this.m_e.readText()
            if (name === 'beat-unit') {
                // set first dur that is still invalid
                if (!dur1.isValid()) {
                    dur1.setType(TConv.fromXmlDurationType(txt, DurationType.V_INVALID))
                } else if (!dur2.isValid()) {
                    dur2.setType(TConv.fromXmlDurationType(txt, DurationType.V_INVALID))
                }
            } else if (name === 'beat-unit-dot') {
                if (dur2.isValid()) {
                    dur2.setDots(1)
                } else if (dur1.isValid()) {
                    dur1.setDots(1)
                }
            } else if (name === 'per-minute') {
                perMinute = txt
            } else {
                this.skipLogCurrElem()
            }
        }

        if (dur1.isValid()) {
            tempoText += TempoText.duration2tempoTextString(dur1)
        }
        if (dur2.isValid()) {
            tempoText += ' = '
            tempoText += TempoText.duration2tempoTextString(dur2)
        } else if (perMinute !== '') {
            tempoText += ' = '
            tempoText += perMinute
        }
        if (dur1.isValid() && !dur2.isValid() && perMinute !== '') {
            const ok = { v: false }
            const d = strToDouble(perMinute, ok)
            if (ok.v) {
                // convert fraction to beats per minute
                r.v = 4 * dur1.fraction().numerator() * d / dur1.fraction().denominator()
            }
        }

        if (parenth) {
            tempoText += ')'
        }

        return tempoText
    }
}

//---------------------------------------------------------
//   MusicXmlDelayedDirectionElement
//---------------------------------------------------------
/**
 Helper class to allow Direction elements to be sorted by _totalY
 before being added to the score.
 */

export class MusicXmlDelayedDirectionElement {
    private m_totalY: number
    private m_element: EngravingItem
    private m_track: track_idx_t
    private m_placement: string
    private m_measure: Measure | null
    private m_tick: Fraction

    constructor(totalY: number, element: EngravingItem, track: track_idx_t, placement: string, measure: Measure | null, tick: Fraction) {
        this.m_totalY = totalY
        this.m_element = element
        this.m_track = track
        this.m_placement = placement
        this.m_measure = measure
        this.m_tick = tick
    }

    totalY(): number { return this.m_totalY }
    element(): EngravingItem { return this.m_element }
    track(): track_idx_t { return this.m_track }
    tick(): Fraction { return this.m_tick }
    placement(): string { return this.m_placement }
    measure(): Measure | null { return this.m_measure }
}

//---------------------------------------------------------
//   MusicXmlInferredFingering
//---------------------------------------------------------
/**
 Helper class to allow Direction elements to be reinterpreted as fingerings
 */

export class MusicXmlInferredFingering {
    m_totalY: number
    m_element: EngravingItem
    m_text: string
    m_fingerings: string[] = []
    m_track: track_idx_t
    m_placement: string
    m_measure: Measure | null
    m_tick: Fraction

    constructor(totalY: number, element: EngravingItem, text: string, track: track_idx_t, placement: string, measure: Measure | null,
        tick: Fraction) {
        this.m_totalY = totalY
        this.m_element = element
        this.m_text = text
        this.m_track = track
        this.m_placement = placement
        this.m_measure = measure
        this.m_tick = tick
        this.m_fingerings = simplified(this.m_text).split(' ')
    }

    totalY(): number { return this.m_totalY }
    tick(): Fraction { return this.m_tick }
    track(): track_idx_t { return this.m_track }
    fingerings(): string[] { return this.m_fingerings.slice() }

    // private

    //---------------------------------------------------------
    //   roundTick
    //---------------------------------------------------------
    /**
     Round tick to multiple of gcd of measure
     */

    roundTick(measure: Measure): void {
        measure.computeTicks()
        let gcdTicks = new Fraction(1, 1).ticks()
        for (let s = measure.first(); s; s = s.next()) {
            if (s.isChordRestType()) {
                gcdTicks = gcd(gcdTicks, s.ticks().ticks())
            }
        }
        if (!gcdTicks || gcdTicks === new Fraction(1, 1).ticks() || !(this.m_tick.ticks() % gcdTicks)) {
            return
        }
        const roundedTick = roundHalfAway(this.m_tick.ticks() / gcdTicks) * gcdTicks
        this.m_tick = Fraction.fromTicks(roundedTick)
    }

    //---------------------------------------------------------
    //   findAndAddToNotes
    //---------------------------------------------------------
    /**
     Attempts to find an eligible collection of notes to add inferred
     fingerings to. Adds notes and returns true if successful, else no-op
     and returns false.
     */
    findAndAddToNotes(measure: Measure): boolean {
        this.roundTick(measure)
        let collectedNotes: Note[] = []
        for (let track = this.m_track; track < this.m_track + 4; ++track) {
            const candidateChord = measure.findChord(this.tick(), track)
            if (candidateChord) {
                if (candidateChord.notes().length >= this.fingerings().length) {
                    this.addToNotes(candidateChord.notes().slice())
                    return true
                } else {
                    collectedNotes = [...candidateChord.notes(), ...collectedNotes]
                    if (collectedNotes.length >= this.fingerings().length) {
                        this.addToNotes(collectedNotes)
                        return true
                    }
                }
            }
        }
        // No suitable notes found
        return false
    }

    //---------------------------------------------------------
    //   addToNotes
    //---------------------------------------------------------
    /**
     Add the n fingerings to the first n collected notes
     */
    addToNotes(notes: Note[]): void {
        for (let i = 0; i < this.m_fingerings.length; ++i) {
            // Fingerings in reverse order
            addTextToNote(-1,
                this.m_fingerings[this.m_fingerings.length - 1 - i], this.m_placement, '', -1, '', '',
                true, Color.BLACK, TextStyleType.FINGERING,
                notes[i].score(),
                notes[i])
        }
    }

    //---------------------------------------------------------
    //   toDelayedDirection
    //---------------------------------------------------------

    toDelayedDirection(): MusicXmlDelayedDirectionElement {
        const dd = new MusicXmlDelayedDirectionElement(this.m_totalY, this.m_element, this.m_track, this.m_placement, this.m_measure,
            this.m_tick)
        return dd
    }
}

/** C++ configuration() */
function configuration(): ReturnType<typeof musicXmlImportConfiguration> {
    return musicXmlImportConfiguration()
}

/** C++ String::number(double) (String::arg(double)): fixed with 6 decimals, trailing zeros removed */
function stringNumber(v: number): string {
    let s = v.toFixed(6)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s
}

//---------------------------------------------------------
//   local defines for debug output
//---------------------------------------------------------

const MAX_LYRICS = 16

//---------------------------------------------------------
//   lastChordTicks
//---------------------------------------------------------

// find the duration of the chord starting at or after s and ending at tick

function lastChordTicks(seg: Segment | null, tick: Fraction, track: track_idx_t): Fraction {
    let s = seg
    while (s && s.tick().lt(tick)) {
        for (const el of s.elist()) {
            if (el && el.isChordRest() && el.track() === track) {
                const cr = el as ChordRest
                if (cr.tick().plus(cr.actualTicks()).eq(tick)) {
                    return cr.actualTicks()
                }
            }
        }
        s = s.nextCR(-1, true)
    }
    return new Fraction(0, 1)
}

function spannerExists(spanners: readonly { nr: number; tp: ElementType }[], number: number, elementType: ElementType): boolean {
    for (const desc of spanners) {
        if (desc.nr === number && desc.tp === elementType) {
            return true
        }
    }

    return false
}

//---------------------------------------------------------
//   MusicXmlStepAltOct2Pitch
//---------------------------------------------------------

/**
 Convert MusicXML \a step (0=C, 1=D, etc.) / \a alter / \a octave to midi pitch.
 Note: same code is in pass 1 and in pass 2.
 TODO: combine
 */

function MusicXmlStepAltOct2Pitch(step: number, alter: number, octave: number): number {
    //                       c  d  e  f  g  a   b
    const table = [0, 2, 4, 5, 7, 9, 11]
    if (step < 0 || step > 6) {
        return -1
    }
    let pitch = table[step] + alter + (octave + 1) * 12

    if (!pitchIsValid(pitch)) {
        pitch = -1
    }

    return pitch
}

//---------------------------------------------------------
//   xmlSetPitch
//---------------------------------------------------------

/**
 Convert MusicXML \a step / \a alter / \a octave to midi pitch,
 set pitch and tpc.
 Note that n's staff and track have not been set yet
 */

function xmlSetPitch(n: Note, step: number, alter: number, tuning: number, octave: number, octaveShift: number,
    instr: Instrument): void {
    const intval = instr.transpose()

    let pitch = MusicXmlStepAltOct2Pitch(step, alter, octave)
    pitch += intval.chromatic   // assume not in concert pitch
    pitch += 12 * octaveShift   // correct for octave shift
    // ensure sane values
    pitch = Math.min(Math.max(pitch, 0), 127)

    const tpc2 = step2tpc(step, alter as AccidentalVal)
    const tpc1 = Transpose.transposeTpc(tpc2, intval, true)
    n.setPitch(pitch, tpc1, tpc2)
    n.setTuning(tuning)
}

//---------------------------------------------------------
//   fillGap
//---------------------------------------------------------

/**
 Fill one gap (tstart - tend) in this track in this measure with rest(s).
 */

function fillGap(measure: Measure, track: track_idx_t, tstart: Fraction, tend: Fraction): void {
    let ctick = tstart
    let restLen = tend.minus(tstart)
    // note: as Constants::division (#ticks in a quarter note) equals 480
    // Constants::division / 64 (#ticks in a 256th note) equals 7.5 but is rounded down to 7
    while (restLen.gt(new Fraction(1, 256))) {
        let len = restLen
        const d = new TDuration(DurationType.V_INVALID)
        if (measure.ticks().eq(restLen)) {
            d.setType(DurationType.V_MEASURE)
        } else {
            d.setVal(len.ticks())
        }
        const s = measure.getSegment(SegmentType.ChordRest, tstart)
        const rest = new Rest(s, d)
        rest.setTicks(len)
        rest.setTrack(track)
        rest.setVisible(false)
        s.add(rest)
        len = rest.globalTicks()
        ctick = ctick.plus(len)
        restLen = restLen.minus(len)
    }
    void ctick
}

//---------------------------------------------------------
//   fillGapsInFirstVoices
//---------------------------------------------------------

/**
 Fill gaps in first voice of every staff in this measure for this part with rest(s).
 */

function fillGapsInFirstVoices(measure: Measure | null, part: Part | null): void {
    if (!measure) {
        return
    }
    if (!part) {
        return
    }

    const measTick = measure.tick()
    const measLen = measure.ticks()
    const nextMeasTick = measTick.plus(measLen)
    const staffIdx = part.score().staffIdxOfPart(part)
    for (let st = 0; st < part.nstaves(); ++st) {
        const track = (staffIdx + st) * VOICES
        let endOfLastCR = measTick
        for (let s = measure.first(); s; s = s.next()) {
            const el = s.element(track)
            if (el) {
                if (s.isChordRestType()) {
                    const cr = el as ChordRest
                    const crTick = cr.tick()
                    const crLen = cr.globalTicks()
                    const nextCrTick = crTick.plus(crLen)
                    if (crTick.gt(endOfLastCR)) {
                        fillGap(measure, track, endOfLastCR, crTick)
                    }
                    endOfLastCR = nextCrTick
                }
            }
        }
        if (nextMeasTick.gt(endOfLastCR)) {
            fillGap(measure, track, endOfLastCR, nextMeasTick)
        }
    }
}

//---------------------------------------------------------
//   hasDrumset
//---------------------------------------------------------

/**
 Determine if \a instruments contains a valid drumset.
 This is the case if any instrument has a midi-unpitched element.
 */

function hasDrumset(instruments: MusicXmlInstruments): boolean {
    let res = false
    for (const [, instr] of instruments) {
        // find valid unpitched values
        const unpitched = instr.unpitched
        if (0 <= unpitched && unpitched <= 127) {
            res = true
        }
    }

    return res
}

//---------------------------------------------------------
//   initDrumset
//---------------------------------------------------------

/**
 Initialize drumset \a drumset.
 */

// first determine if the part contains a drumset
// (this is assumed if any instrument has a valid midi-unpitched element,
// which stored in the MusicXmlInstrument pitch field)
// then if the part contains a drumset, Drumset drumset is initialized

function initDrumset(drumset: Drumset, instruments: MusicXmlInstruments): void {
    drumset.clear()

    for (const [, ii] of instruments) {
        const unpitched = ii.unpitched
        if (0 <= unpitched && unpitched <= 127) {
            // DrumInstrument(name, notehead, line, stemDirection)
            const di = new DrumInstrument()
            di.name = ii.name
            di.notehead = ii.notehead
            di.line = ii.line
            di.stemDirection = ii.stemDirection
            drumset.setDrum(ii.unpitched, di)
        }
    }
}

//---------------------------------------------------------
//   setStaffTypePercussion
//---------------------------------------------------------

/**
 Set staff type to percussion
 */

function setStaffTypePercussion(part: Part, drumset: Drumset): void {
    for (let j = 0; j < part.nstaves(); ++j) {
        if (part.staff(j)!.lines(new Fraction(0, 1)) === 5 && !part.staff(j)!.isDrumStaff(new Fraction(0, 1))) {
            part.staff(j)!.setStaffType(new Fraction(0, 1), StaffType.preset(StaffTypes.PERC_DEFAULT))
        }
    }
    // set drumset for instrument
    part.instrument().setDrumset(drumset)
    part.instrument().channel(0)!.setBank(128)
}

/** C++ convertPitchStringFlatsAndSharpsToUnicode (engraving/dom/utils.cpp) */
function convertPitchStringFlatsAndSharpsToUnicode(str: string): string {
    if (!str) {
        return ''
    }

    let value = str[0]
    for (let i = 1; i < str.length; ++i) {
        const symbol = str[i].toLowerCase()
        if (symbol === 'b') {
            value += '♭'
        } else if (symbol === '#') {
            value += '♯'
        } else {
            value += symbol
        }
    }

    return value
}

// C++ std::regex on the UTF-8 string; \s is the ASCII white space here
const transpositionRegexSrc = '(^|(?:[ \\t\\n\\v\\f\\r]|\\u00A0))([ABCDEF][b#]?)((?:[ \\t\\n\\v\\f\\r]|\\u00A0)|$)'

// Remove: ' in', part numbers '1, 2' which may be bracketed, any text after a slash
const removeRegexSrc = '(?:[ \\t\\n\\v\\f\\r]|\\u00A0)in|(\\(?[0-9]([,](?:[ \\t\\n\\v\\f\\r]|\\u00A0)?)?)\\)?|\\.|(\\/.*)'

function processInstrName(name: string): [string, string] {
    // Make corrections so instruments match our names, then separate transpositions and remove unneeded info
    let n = name
    n = n.replaceAll('♭', 'b').replaceAll('♯', '#')
    n = n.replaceAll('Sax', 'Saxophone')
    n = n.replaceAll('Bari', 'Baritone')
    const ret: [string, string] = ['', '']
    // Find transposition information
    const results = [...n.matchAll(new RegExp(transpositionRegexSrc, 'g'))].map(m => m[2])
    if (results.length) {
        ret[1] = convertPitchStringFlatsAndSharpsToUnicode(results[0])
        n = n.replace(new RegExp(transpositionRegexSrc, 'g'), '')
    }
    n = n.replace(new RegExp(removeRegexSrc, 'g'), '')
    ret[0] = simplified(n)

    return ret
}

//---------------------------------------------------------
//   createInstrument
//---------------------------------------------------------

/**
 Create an Instrument based on the information in \a mxmlInstr.
 */

function createInstrument(mxmlInstr: MusicXmlInstrument, interval: Interval): Instrument {
    // The interval may not match the instrument's default traitName.
    const [trackName, traitName] = processInstrName(mxmlInstr.name)
    const trait = new Trait()
    trait.name = traitName

    // Initialize instrument with data from MusicXML.
    let instr = new Instrument()
    let channel = instr.channel(0)!
    instr.setMusicXmlId(mxmlInstr.sound)
    instr.setTrackName(trackName)
    instr.setLongName(trackName)
    instr.setShortName(trackName)
    instr.setTrait(trait)
    instr.setTranspose(interval)
    channel.setBank(0)
    channel.setProgram(mxmlInstr.midiProgram)

    // Is it similar to one of our built-in instruments?
    const templ = combinedTemplateSearch(instr)
    if (templ) {
        instr = Instrument.fromTemplate(templ) // Re-initialize with built-in data.
        channel = instr.channel(0)!
    } else {
        // set articulations to default (global articulations)
        instr.setArticulation(midiArticulations())
        // set default program
        channel.setProgram(mxmlInstr.midiProgram < 0 ? 0 : mxmlInstr.midiProgram)
    }

    // (Re-)apply values from MusicXML.
    instr.setTrackName(mxmlInstr.name)
    instr.setTranspose(interval)
    channel.setPan(mxmlInstr.midiPan)
    channel.setVolume(mxmlInstr.midiVolume)

    return instr
}

//---------------------------------------------------------
//   updatePartWithInstrument
//---------------------------------------------------------

function updatePartWithInstrument(part: Part, mxmlInstr: MusicXmlInstrument, interval: Interval, hasDrumset = false): void {
    const instr = createInstrument(mxmlInstr, interval)
    if (hasDrumset) {
        instr.channel(0)!.setBank(128)
    }
    part.setInstrument(instr)
    if (mxmlInstr.midiChannel >= 0) {
        part.setMidiChannel(mxmlInstr.midiChannel, mxmlInstr.midiPort)
    }
    // note: setMidiProgram() does more than simply setting the MIDI program
    if (mxmlInstr.midiProgram >= 0) {
        part.setMidiProgram(mxmlInstr.midiProgram)
    }
}

//---------------------------------------------------------
//   createInstrumentChange
//---------------------------------------------------------

/**
 Create an InstrumentChange based on the information in \a mxmlInstr.
 */

function staffNamesEqual(a: readonly { name(): string; pos(): number }[], b: readonly { name(): string; pos(): number }[]): boolean {
    return a.length === b.length && a.every((n, i) => n.name() === b[i].name() && n.pos() === b[i].pos())
}

function createInstrumentChange(score: Score, mxmlInstr: MusicXmlInstrument, interval: Interval, track: track_idx_t,
    curInstr: Instrument): InstrumentChange | null {
    const instr = createInstrument(mxmlInstr, interval)

    if (curInstr.id() === instr.id() && staffNamesEqual(instr.longNames(), curInstr.longNames())
        && staffNamesEqual(instr.shortNames(), curInstr.shortNames())) {
        return null
    }

    const instrChange = Factory.createItem(ElementType.INSTRUMENT_CHANGE, scoreDummy(score).segment()) as InstrumentChange
    instrChange.setInstrument(instr)
    instrChange.setTrack(track)

    // for text use instrument name (if known) else use "Instrument change"
    const text = mxmlInstr.name
    instrChange.setXmlText(!text ? 'Instrument change' : text)
    instrChange.setVisible(false)

    return instrChange
}

//---------------------------------------------------------
//   updatePartWithInstrumentChange
//---------------------------------------------------------

function updatePartWithInstrumentChange(part: Part, mxmlInstr: MusicXmlInstrument, interval: Interval, segment: Segment,
    track: track_idx_t, tick: Fraction): void {
    const curInstr = part.instrument(tick)
    const ic = createInstrumentChange(part.score(), mxmlInstr, interval, track, curInstr)

    if (!ic) {
        return
    }

    segment.add(ic)               // note: includes part::setInstrument(instr);

    // setMidiChannel() depends on setInstrument() already been done
    if (mxmlInstr.midiChannel >= 0) {
        part.setMidiChannel(mxmlInstr.midiChannel, mxmlInstr.midiPort, tick)
    }
}

/** mxmlInstr is replaced (C++ MusicXmlInstrument&): returns the new value */
function setPercussionInstrument(mxmlInstr: MusicXmlInstrument, partName: string): MusicXmlInstrument {
    // If there are multiple unpitched instruments we should set the part's instrument to drumkit or percussion
    const lower = partName.toLowerCase()
    if (lower.includes('drumset') || lower.includes('drumkit')) {
        mxmlInstr = new MusicXmlInstrument()
        mxmlInstr.name = 'Drum Kit'
    } else if (lower.includes('percussion')) {
        mxmlInstr = new MusicXmlInstrument()
        mxmlInstr.name = 'Percussion'
        mxmlInstr.sound = 'drum.group.set'
    }
    return mxmlInstr
}

//---------------------------------------------------------
//   setPartInstruments
//---------------------------------------------------------

/**
 Set instruments for Part \a part
 Note:
 - MusicXmlInstrList: which instrument plays when
 - MusicXmlInstruments: instrument details from score-part and part
 */

function setPartInstruments(logger: MusicXmlLogger, xmlreader: XmlStreamReader | null, part: Part, partId: string, score: Score,
    instrList: MusicXmlInstrList, intervList: MusicXmlIntervalList, instruments: MusicXmlInstruments, partName: string): void {
    if (instruments.empty()) {
        // no instrument details found, create a default instrument
        updatePartWithInstrument(part, new MusicXmlInstrument(), intervList.interval(new Fraction(0, 1)))
        return
    }

    if (hasDrumset(instruments)) {
        // do not create multiple instruments for a drum part
        let mxmlInstr = instruments.valueAt(0).clone()
        if (instruments.size() > 1) {
            mxmlInstr = setPercussionInstrument(mxmlInstr, partName)
        }
        updatePartWithInstrument(part, mxmlInstr, new Interval(), true)
        return
    }

    if (instrList.empty()) {
        // instrument details found, but no instrument ids found
        // -> only a single instrument is playing in the part
        const mxmlInstr = instruments.valueAt(0).clone()
        updatePartWithInstrument(part, mxmlInstr, intervList.interval(new Fraction(0, 1)))
        return
    }

    // either a single instrument is playing, or forwards / rests resulted in gaps in the instrument map
    // (and thus multiple entries)
    let prevInstrId = ''
    for (let i = 0; i < instrList.size(); ++i) {
        const tick = instrList.keyAt(i)
        if (i === 0) {
            prevInstrId = instrList.valueAt(i)              // first instrument id
            const mxmlInstr = instruments.get(prevInstrId)?.clone() ?? new MusicXmlInstrument()
            updatePartWithInstrument(part, mxmlInstr, intervList.interval(tick))
        } else {
            const instrId = instrList.valueAt(i)
            const mustInsert = instrId !== prevInstrId
            if (mustInsert) {
                const staff = score.staffIdxOfPart(part)
                const track = staff * VOICES

                const m = score.tick2measure(tick)!
                const segment = m.getSegment(SegmentType.ChordRest, tick)

                if (!segment) {
                    logger.logError(`segment for instrument change at tick ${tick.ticks()} not found`, xmlreader)
                } else if (!instruments.has(instrId)) {
                    logger.logError(`changed instrument '${instrId}' at tick ${tick.ticks()} not found in part '${partId}'`, xmlreader)
                } else {
                    const mxmlInstr = instruments.get(instrId)!.clone()
                    updatePartWithInstrumentChange(part, mxmlInstr, intervList.interval(tick), segment, track, tick)
                }
            }
            prevInstrId = instrId
        }
    }
}

//---------------------------------------------------------
//   text2syms
//---------------------------------------------------------

/**
 Convert SMuFL code points to MuseScore <sym>...</sym>
 */

let s_text2symsMap: { map: Map<string, SymId>; maxStringSize: number } | null = null

/** C++ xmlpass2::text2syms */
function text2syms(t: string): string {
    // first create a map from symbol (Unicode) text to symId
    // (cached here: the map is the same for every call)
    if (!s_text2symsMap) {
        const sf = engravingFonts().fallbackFont()
        const map = new Map<string, SymId>()
        let maxStringSize = 0          // maximum string size found

        for (let i = SymId.noSym; i < SymId.lastSym; ++i) {
            const id = i as SymId
            const string = sf.toString(id)
            // insert all syms except space to prevent matching all regular spaces
            // (std::map::insert: the first one wins)
            if (id !== SymId.space && !map.has(string)) {
                map.set(string, id)
            }
            if (string.length > maxStringSize) {
                maxStringSize = string.length
            }
        }

        // Special case Dolet inference (TODO: put behind a setting or export type flag)
        if (!map.has('$')) {
            map.set('$', SymId.segno)
        }
        if (!map.has('Ø')) {
            map.set('Ø', SymId.coda)
        }
        s_text2symsMap = { map, maxStringSize }
    }
    const { map, maxStringSize } = s_text2symsMap

    // then look for matches
    let input = t
    let res = ''

    while (input.length) {
        // try to find the largest match possible
        let maxMatch = Math.min(input.length, maxStringSize)
        let sym = ''
        while (maxMatch > 0) {
            const toBeMatched = input.slice(0, maxMatch)
            const id = map.get(toBeMatched)
            if (id !== undefined) {
                sym = SymNames.nameForSymId(id)
                break
            }
            maxMatch--
        }
        if (maxMatch > 0) {
            // found a match, add sym to res and remove match from string in
            res += '<sym>'
            res += sym
            res += '</sym>'
            input = input.slice(maxMatch)
        } else {
            // not found, move one char from res to in
            res += input.slice(0, 1)
            input = input.slice(1)
        }
    }

    return res
}

//---------------------------------------------------------
//   nextPartOfFormattedString
//---------------------------------------------------------

// TODO: probably should be shared between pass 1 and 2

/**
 Read the next part of a MusicXML formatted string and convert to MuseScore internal encoding.
 C++ xmlpass2::nextPartOfFormattedString
 */

function nextPartOfFormattedString(e: XmlStreamReader): string {
    const fontWeight = e.attribute('font-weight')
    const fontSize = e.attribute('font-size')
    const fontStyle = e.attribute('font-style')
    let underline = e.attribute('underline')
    let strike = e.attribute('line-through')
    const fontFamily = e.attribute('font-family')
    // TODO: color, enclosure, yoffset in only part of the text, ...

    let txt = e.readText()
    // replace HTML entities (String::decodeXmlEntities: the decimal character references)
    txt = txt.replace(/&#([0-9]+);/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10) & 0xFFFF))
    const syms = text2syms(txt)

    let importedtext = ''

    if (fontSize) {
        const ok = { v: true }
        const size = Math.fround(strToDouble(fontSize, ok))
        if (ok.v) {
            importedtext += `<font size="${stringNumber(size)}"/>`
        }
    }

    const needUseDefaultFont = configuration().needUseDefaultFont()
    if (fontFamily && txt === syms && !needUseDefaultFont) {
        // add font family only if no <sym> replacement made
        importedtext += `<font face="${fontFamily}"/>`
    }
    if (fontWeight === 'bold') {
        importedtext += '<b>'
    }
    if (fontStyle === 'italic') {
        importedtext += '<i>'
    }
    if (underline) {
        const ok = { v: true }
        const lines = strToInt(underline, ok)
        if (ok.v && (lines > 0)) {    // 1, 2, or 3 underlines are imported as single underline
            importedtext += '<u>'
        } else {
            underline = ''
        }
    }
    if (strike) {
        const ok = { v: true }
        const lines = strToInt(strike, ok)
        if (ok.v && (lines > 0)) {    // 1, 2, or 3 strikes are imported as single strike
            importedtext += '<s>'
        } else {
            strike = ''
        }
    }
    if (txt === syms) {
        txt = txt.replaceAll('\r', '')     // convert Windows line break \r\n -> \n
        importedtext += toXmlEscaped(txt)
    } else {
        // <sym> replacement made, should be no need for line break or other conversions
        importedtext += syms
    }
    if (strike) {
        importedtext += '</s>'
    }
    if (underline) {
        importedtext += '</u>'
    }
    if (fontStyle === 'italic') {
        importedtext += '</i>'
    }
    if (fontWeight === 'bold') {
        importedtext += '</b>'
    }
    return importedtext
}

//---------------------------------------------------------
//   colorItem
//---------------------------------------------------------

function colorItem(item: EngravingItem, color: Color): void {
    if (color.isValid()) {
        item.setProperty(Pid.COLOR, color)
        item.setPropertyFlags(Pid.COLOR, PropertyFlags.UNSTYLED)
    }
}

//---------------------------------------------------------
//   addLyric
//---------------------------------------------------------

/**
 Add a single lyric to the score or delete it (if number too high)
 */

function addLyric(logger: MusicXmlLogger, xmlreader: XmlStreamReader | null, cr: ChordRest, l: Lyrics, lyricNo: number,
    extendedLyrics: MusicXmlLyricsExtend): void {
    if (lyricNo > MAX_LYRICS) {
        logger.logError(`too much lyrics (>${MAX_LYRICS})`, xmlreader)
    } else {
        l.setVerse(lyricNo)
        l.initTextStyleType(l.isEven() ? TextStyleType.LYRICS_EVEN : TextStyleType.LYRICS_ODD, /*preserveDifferent*/ true)
        cr.add(l)
        extendedLyrics.setExtend(lyricNo, cr.track(), cr.tick(), l)
    }
}

//---------------------------------------------------------
//   addLyrics
//---------------------------------------------------------

/**
 Add a notes lyrics to the score
 */

function addLyrics(logger: MusicXmlLogger, xmlreader: XmlStreamReader | null, cr: ChordRest,
    numbrdLyrics: Iterable<[number, Lyrics]>, extLyrics: ReadonlySet<Lyrics>, extendedLyrics: MusicXmlLyricsExtend): void {
    for (const [lyricNo, lyric] of numbrdLyrics) {
        addLyric(logger, xmlreader, cr, lyric, lyricNo, extendedLyrics)
        if (extLyrics.has(lyric)) {
            extendedLyrics.addLyric(lyric)
        }
    }
}

function addGraceNoteLyrics(numberedLyrics: Iterable<[number, Lyrics]>, extendedLyrics: ReadonlySet<Lyrics>,
    gnLyrics: GraceNoteLyrics[]): void {
    for (const [lyricNo, lyric] of numberedLyrics) {
        if (lyric) {
            const extend = extendedLyrics.has(lyric)
            const gnl = new GraceNoteLyrics(lyric, extend, lyricNo)
            gnLyrics.push(gnl)
        }
    }
}

function addInferredStickings(cr: ChordRest, numberedStickings: readonly Sticking[]): void {
    for (const sticking of numberedStickings) {
        sticking.setParent(cr.segment())
        sticking.setTrack(cr.track())
        cr.score().addElement(sticking)
    }
}

//---------------------------------------------------------
//   calculateTupletDuration
//---------------------------------------------------------

/**
 Calculate the duration of all notes in the tuplet combined
 */

function calculateTupletDuration(t: Tuplet): Fraction {
    let res = new Fraction()

    for (const de of t.elements()) {
        if (de.isChordRest()) {
            const cr = de as ChordRest
            const fraction = cr.ticks() // TODO : take care of nested tuplets
            if (fraction.isValid()) {
                res = res.plus(fraction)
            }
        }
    }
    res = res.div(t.ratio())

    return res
}

//---------------------------------------------------------
//   determineTupletBaseLen
//---------------------------------------------------------

/**
 Determine tuplet baseLen as determined by the tuplet ratio
 and duration.
 */

function determineTupletBaseLen(t: Tuplet): TDuration {
    const { fullDuration: tupletFullDuration }
        = MusicXmlTupletState.determineTupletFractionAndFullDuration(calculateTupletDuration(t))

    const baseLen = tupletFullDuration.times(new Fraction(1, t.ratio().denominator()))

    return new TDuration(baseLen)
}

//---------------------------------------------------------
//   handleTupletStart
//---------------------------------------------------------

function handleTupletStart(cr: ChordRest, tuplet: { v: Tuplet | null }, actualNotes: number, normalNotes: number,
    tupletDesc: MusicXmlTupletDesc): void {
    const t = new Tuplet(cr.measure())
    tuplet.v = t
    t.setTrack(cr.track())
    t.setRatio(new Fraction(actualNotes, normalNotes))
    t.setTick(cr.tick())
    t.setBracketType(tupletDesc.bracket)
    t.setNumberType(tupletDesc.shownumber)
    t.setDirection(tupletDesc.direction)
    t.setParent(cr.measure())
}

//---------------------------------------------------------
//   handleTupletStop
//---------------------------------------------------------

function handleTupletStop(tuplet: { v: Tuplet | null }, normalNotes: number): void {
    // allow handleTupletStop to be called w/o error of no tuplet active
    const t = tuplet.v
    if (!t) {
        return
    }

    // set baselen
    const td = determineTupletBaseLen(t)
    t.setBaseLen(td)
    let f = new Fraction(normalNotes, td.fraction().denominator())
    f = f.reduced()
    if (!f.isValid()) {
        // tuplet stop but note values too small
        tuplet.v = null
        return
    }
    t.setTicks(f)
    // TODO determine usefulness of following check (only debug output in C++)
    tuplet.v = null
}

//---------------------------------------------------------
//   setElementPropertyFlags
//---------------------------------------------------------

function setElementPropertyFlags(element: EngravingObject, propertyId: Pid, value1: string, value2 = ''): void {
    if (!value1) { // Set as an implicit value
        element.setPropertyFlags(propertyId, PropertyFlags.STYLED)
    } else if (value1 || value2) { // Set as an explicit value
        element.setPropertyFlags(propertyId, PropertyFlags.UNSTYLED)
    }
}

//---------------------------------------------------------
//   addArticulationToChord
//---------------------------------------------------------

function addArticulationToChord(notation: Notation, cr: ChordRest): void {
    const articSym = notation.symId()
    const dir = notation.attribute('type')
    const place = notation.attribute('placement')
    const na = Factory.createItem(ElementType.ARTICULATION, cr) as Articulation
    if (articSym !== SymId.noSym) {
        na.setSymId(articSym)
    }
    if (notation.text()) {
        na.setTextType(TConv.fromXmlArticulationTextType(notation.text(), ArticulationTextType.NO_TEXT))
    }
    na.setVisible(notation.visible())
    colorItem(na, Color.fromString(notation.attribute('color')))

    if (dir === 'up' || dir === 'down') {
        na.setUp(dir === 'up')
        na.setPropertyFlags(Pid.DIRECTION, PropertyFlags.UNSTYLED)
    }

    // when setting anchor, assume type up/down without explicit placement
    // implies placement above/below
    if (place === 'above' || (dir === 'up' && !place)) {
        na.setAnchor(ArticulationAnchor.TOP)
        na.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
    } else if (place === 'below' || (dir === 'down' && !place)) {
        na.setAnchor(ArticulationAnchor.BOTTOM)
        na.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
    }

    if (cr.isChord() && (cr as Chord).hasArticulation(na)) {
        return
    }

    cr.add(na)
}

//---------------------------------------------------------
//   addFermataToChord
//---------------------------------------------------------

/**
 Add a MusicXML fermata.
 Note: MusicXML common.mod: "The fermata type is upright if not specified."
 */

function addFermataToChord(notation: Notation, cr: ChordRest): void {
    const articSym = notation.symId()
    const direction = notation.attribute('type')
    const seg = cr.segment()
    const fermata = Factory.createItem(ElementType.FERMATA, seg ? seg : scoreDummy(cr.score()).segment()) as Fermata
    fermata.setSymIdAndTimeStretch(articSym)
    fermata.setTrack(cr.track())
    fermata.setVisible(notation.visible())
    colorItem(fermata, Color.fromString(notation.attribute('color')))
    if (direction) {
        fermata.setPlacement(direction === 'inverted' ? PlacementV.BELOW : PlacementV.ABOVE)
        fermata.resetProperty(Pid.OFFSET)
    } else {
        fermata.setPlacement(fermata.propertyDefault(Pid.PLACEMENT) as PlacementV)
    }
    setElementPropertyFlags(fermata, Pid.PLACEMENT, direction)
    if (!seg) {
        cr.addFermata(fermata) // store for later move to segment
    } else {
        cr.segment()!.add(fermata)
    }
}

//---------------------------------------------------------
//   addTapToChord
//---------------------------------------------------------

/**
 Add Tap to Chord.
 */

function addTapToChord(notation: Notation, cr: ChordRest): void {
    const place = notation.attribute('placement')
    const hand = notation.attribute('hand') === 'right' ? TappingHand.RIGHT : TappingHand.LEFT

    const tap = Factory.createItem(ElementType.TAPPING, cr) as Tapping
    tap.setTrack(cr.track())
    tap.setHand(hand)
    if (place === 'above') {
        tap.setAnchor(ArticulationAnchor.TOP)
        tap.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
    } else if (place === 'below') {
        tap.setAnchor(ArticulationAnchor.BOTTOM)
        tap.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
    } else {
        tap.setAnchor(ArticulationAnchor.AUTO)
    }
    colorItem(tap, Color.fromString(notation.attribute('color')))
    cr.add(tap)
}

//---------------------------------------------------------
//   addMordentToChord
//---------------------------------------------------------

/**
 Add Mordent to Chord.
 */

function addMordentToChord(notation: Notation, cr: ChordRest): void {
    const name = notation.name()
    const attrLong = notation.attribute('long')
    const attrAppr = notation.attribute('approach')
    const attrDep = notation.attribute('departure')
    let articSym = SymId.noSym   // legal but impossible ArticulationType value here indicating "not found"
    if (name === 'inverted-mordent') {
        if ((!attrLong || attrLong === 'no') && !attrAppr && !attrDep) {
            articSym = SymId.ornamentShortTrill
        } else if (attrLong === 'yes' && !attrAppr && !attrDep) {
            articSym = SymId.ornamentTremblement
        } else if (attrLong === 'yes' && attrAppr === 'below' && !attrDep) {
            articSym = SymId.ornamentUpPrall
        } else if (attrLong === 'yes' && attrAppr === 'above' && !attrDep) {
            articSym = SymId.ornamentPrecompMordentUpperPrefix
        } else if (attrLong === 'yes' && !attrAppr && attrDep === 'below') {
            articSym = SymId.ornamentPrallDown
        } else if (attrLong === 'yes' && !attrAppr && attrDep === 'above') {
            articSym = SymId.ornamentPrallUp
        }
    } else if (name === 'mordent') {
        if ((!attrLong || attrLong === 'no') && !attrAppr && !attrDep) {
            articSym = SymId.ornamentMordent
        } else if (attrLong === 'yes' && !attrAppr && !attrDep) {
            articSym = SymId.ornamentPrallMordent
        } else if (attrLong === 'yes' && attrAppr === 'below' && !attrDep) {
            articSym = SymId.ornamentUpMordent
        } else if (attrLong === 'yes' && attrAppr === 'above' && !attrDep) {
            articSym = SymId.ornamentDownMordent
        }
    }
    if (articSym !== SymId.noSym) {
        const place = notation.attribute('placement')
        const mordent = Factory.createItem(ElementType.ORNAMENT, cr) as Ornament
        mordent.setSymId(articSym)
        if (place === 'above') {
            mordent.setAnchor(ArticulationAnchor.TOP)
        } else if (place === 'below') {
            mordent.setAnchor(ArticulationAnchor.BOTTOM)
        } else {
            mordent.setAnchor(ArticulationAnchor.AUTO)
        }
        mordent.setVisible(notation.visible())
        colorItem(mordent, Color.fromString(notation.attribute('color')))
        cr.add(mordent)
    }
}

//---------------------------------------------------------
//   addTurnToChord
//---------------------------------------------------------

/**
 Add Turn to Chord.
 */

function addTurnToChord(notation: Notation, cr: ChordRest): void {
    let turnSym = notation.symId()
    const place = notation.attribute('placement')
    if (notation.attribute('slash') === 'yes') {
        // TODO: currently this is the only available SMuFL turn with a slash
        turnSym = SymId.ornamentTurnSlash
    }
    const turn = Factory.createItem(ElementType.ORNAMENT, cr) as Ornament
    turn.setSymId(turnSym)
    if (place === 'above') {
        turn.setAnchor(ArticulationAnchor.TOP)
    } else if (place === 'below') {
        turn.setAnchor(ArticulationAnchor.BOTTOM)
    } else {
        turn.setAnchor(ArticulationAnchor.AUTO)
    }
    turn.setVisible(notation.visible())
    colorItem(turn, Color.fromString(notation.attribute('color')))
    cr.add(turn)
}

//---------------------------------------------------------
//   addOtherOrnamentToChord
//---------------------------------------------------------

/**
 Add Other Ornament to Chord.
 */

function addOtherOrnamentToChord(notation: Notation, cr: ChordRest): void {
    const symname = notation.attribute('smufl')
    const sym = SymNames.symIdByName(symname)

    if (sym !== SymId.noSym) {
        const ornam = Factory.createItem(ElementType.ORNAMENT, cr) as Ornament
        ornam.setSymId(sym)
        ornam.setVisible(notation.visible())
        colorItem(ornam, Color.fromString(notation.attribute('color')))
        cr.add(ornam)
    }
}

//---------------------------------------------------------
//   convertArticulationToSymId
//---------------------------------------------------------

/**
 Convert a MusicXML articulation to a chord as a "simple" MuseScore articulation.
 These are the articulations that can be
 - represented by an enum class SymId
 - added to a ChordRest
 Return true (articulation recognized and converted)
 or false (articulation not recognized).
 Note simple implementation: MusicXML syntax is not strictly
 checked, the articulations parent element does not matter.
 */

const articulationSymIdMap: ReadonlyMap<string, SymId> = new Map([
    // ornaments
    ['delayed-turn', SymId.ornamentTurn],
    ['inverted-turn', SymId.ornamentTurnInverted],
    ['vertical-turn', SymId.ornamentTurnUp],
    ['inverted-vertical-turn', SymId.ornamentTurnUpS],
    ['turn', SymId.ornamentTurn],
    ['shake', SymId.ornamentTremblementCouperin],
    ['schleifer', SymId.ornamentPrecompSlide],
    ['haydn', SymId.ornamentHaydn],
    // articulations
    ['accent', SymId.articAccentAbove],
    ['strong-accent', SymId.articMarcatoAbove],
    ['staccato', SymId.articStaccatoAbove],
    ['tenuto', SymId.articTenutoAbove],
    ['detached-legato', SymId.articTenutoStaccatoAbove],
    ['staccatissimo', SymId.articStaccatissimoAbove],
    ['spiccato', SymId.articStaccatissimoStrokeAbove],
    ['stress', SymId.articStressAbove],
    ['unstress', SymId.articUnstressAbove],
    ['soft-accent', SymId.articSoftAccentAbove],
    // technical
    ['up-bow', SymId.stringsUpBow],
    ['down-bow', SymId.stringsDownBow],
    ['open-string', SymId.brassMuteOpen],
    ['thumb-position', SymId.stringsThumbPosition],
    ['double-tongue', SymId.doubleTongueAbove],
    ['triple-tongue', SymId.tripleTongueAbove],
    ['stopped', SymId.brassMuteClosed],
    ['snap-pizzicato', SymId.pluckedSnapPizzicatoAbove],
    ['heel', SymId.keyboardPedalHeel1],
    ['toe', SymId.keyboardPedalToe2],
    ['fingernails', SymId.pluckedWithFingernails],
    ['brass-bend', SymId.brassBend],
    ['flip', SymId.brassFlip],
    ['smear', SymId.brassSmear],
    ['open', SymId.brassMuteOpen],
    ['half-muted', SymId.brassMuteHalfClosed], // ignoring the smufl attribute
    ['golpe', SymId.guitarGolpe],

    ['belltree', SymId.handbellsBelltree],
    ['damp', SymId.handbellsDamp3],
    ['echo', SymId.handbellsEcho1],
    ['gyro', SymId.handbellsGyro],
    ['hand martellato', SymId.handbellsHandMartellato],
    ['mallet lift', SymId.handbellsMalletLft],
    ['mallet table', SymId.handbellsMalletBellOnTable],
    ['martellato', SymId.handbellsMartellato],
    ['martellato lift', SymId.handbellsMartellatoLift],
    ['muted martellato', SymId.handbellsMutedMartellato],
    ['pluck lift', SymId.handbellsPluckLift],
    ['swing', SymId.handbellsSwing],
])

function convertArticulationToSymId(mxmlName: string, id: { v: SymId }): boolean {
    const s = articulationSymIdMap.get(mxmlName)
    if (s !== undefined) {
        id.v = s
        return true
    } else {
        id.v = SymId.noSym
        return false
    }
}

//---------------------------------------------------------
//   convertFermataToSymId
//---------------------------------------------------------

/**
 Convert a MusicXML fermata name to a MuseScore fermata.
 */

const fermataSymIdMap: ReadonlyMap<string, SymId> = new Map([
    ['normal', SymId.fermataAbove],
    ['angled', SymId.fermataShortAbove],
    ['square', SymId.fermataLongAbove],
    ['double-angled', SymId.fermataVeryShortAbove],
    ['double-square', SymId.fermataVeryLongAbove],
    ['double-dot', SymId.fermataLongHenzeAbove],
    ['half-curve', SymId.fermataShortHenzeAbove],
    ['curlew', SymId.curlewSign],
])

function convertFermataToSymId(mxmlName: string): SymId {
    return fermataSymIdMap.get(mxmlName) ?? SymId.fermataAbove
}

//---------------------------------------------------------
//   convertNotehead
//---------------------------------------------------------

/**
 Convert a MusicXML notehead name to a MuseScore headgroup.
 */

const noteheadMap: ReadonlyMap<string, NoteHeadGroup> = new Map([
    ['slash', NoteHeadGroup.HEAD_SLASH],
    ['triangle', NoteHeadGroup.HEAD_TRIANGLE_UP],
    ['diamond', NoteHeadGroup.HEAD_DIAMOND],
    ['cross', NoteHeadGroup.HEAD_PLUS],
    ['x', NoteHeadGroup.HEAD_CROSS],
    ['circle-x', NoteHeadGroup.HEAD_XCIRCLE],
    ['inverted triangle', NoteHeadGroup.HEAD_TRIANGLE_DOWN],
    ['slashed', NoteHeadGroup.HEAD_SLASHED1],
    ['back slashed', NoteHeadGroup.HEAD_SLASHED2],
    ['normal', NoteHeadGroup.HEAD_NORMAL],
    ['do', NoteHeadGroup.HEAD_DO],
    ['re', NoteHeadGroup.HEAD_RE],
    ['mi', NoteHeadGroup.HEAD_MI],
    ['fa', NoteHeadGroup.HEAD_FA],
    ['fa up', NoteHeadGroup.HEAD_FA],
    ['so', NoteHeadGroup.HEAD_SOL],
    ['la', NoteHeadGroup.HEAD_LA],
    ['ti', NoteHeadGroup.HEAD_TI],
])

function convertNotehead(mxmlName: string): NoteHeadGroup {
    // default: return 0
    return noteheadMap.get(mxmlName) ?? NoteHeadGroup.HEAD_NORMAL
}

//---------------------------------------------------------
//   addTextToNote
//---------------------------------------------------------

/**
 Add Text to Note.
 */

function addTextToNote(byteOffset: number, txt: string, placement: string, fontWeight: string, fontSize: number, fontStyle: string,
    fontFamily: string, visible: boolean, color: Color, subType: TextStyleType, score: Score | null, note: Note | null): void {
    void byteOffset
    void score
    if (note) {
        if (txt) {
            const t = new Fingering(note, subType)
            t.setPlainText(txt)
            const needUseDefaultFont = configuration().needUseDefaultFont()
            if (fontFamily && !needUseDefaultFont) {
                t.setFamily(fontFamily)
                t.setPropertyFlags(Pid.FONT_FACE, PropertyFlags.UNSTYLED)
            }
            // std::isnormal
            if (Number.isFinite(fontSize) && Math.abs(fontSize) >= 2.2250738585072014e-308 && fontSize > 0.0) {
                t.setSize(fontSize)
                t.setPropertyFlags(Pid.FONT_SIZE, PropertyFlags.UNSTYLED)
            }
            if (fontWeight) {
                t.setBold(fontWeight === 'bold')
                t.setPropertyFlags(Pid.FONT_STYLE, PropertyFlags.UNSTYLED)
            }
            if (fontStyle) {
                t.setItalic(fontStyle === 'italic')
                t.setPropertyFlags(Pid.FONT_STYLE, PropertyFlags.UNSTYLED)
            }
            if (placement) {
                t.setPlacement(placement === 'below' ? PlacementV.BELOW : PlacementV.ABOVE)
                t.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
                t.resetProperty(Pid.OFFSET)
            }
            t.setVisible(visible)
            colorItem(t, color)
            note.add(t)
        }
    }
}

//---------------------------------------------------------
//   setSLinePlacement
//---------------------------------------------------------

/**
 Helper for direction().
 SLine placement is modified by changing the first segments user offset
 As the SLine has just been created, it does not have any segment yet
 */

function setSLinePlacement(sli: SLine, placement: string): void {
    if (placement === 'above' || placement === 'below') {
        if (sli.hasVoiceAssignmentProperties()) {
            sli.setProperty(Pid.DIRECTION, placement === 'above' ? DirectionV.UP : DirectionV.DOWN)
            sli.setPropertyFlags(Pid.DIRECTION, PropertyFlags.UNSTYLED)
        } else {
            sli.setPlacement(placement === 'above' ? PlacementV.ABOVE : PlacementV.BELOW)
            sli.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
            sli.resetProperty(Pid.OFFSET)
        }
    }
}

//---------------------------------------------------------
//   handleSpannerStart
//---------------------------------------------------------

// note that in case of overlapping spanners, handleSpannerStart is called for every spanner
// as spanners std::map allows only one value per key, this does not hurt at all

function handleSpannerStart(newSp: SLine, track: track_idx_t, placement: string, tick: Fraction, spanners: MusicXmlSpannerMap): void {
    newSp.setTrack(track)
    setSLinePlacement(newSp, placement)
    spanners.set(newSp, [tick.ticks(), -1])
}

//---------------------------------------------------------
//   handleSpannerStop
//---------------------------------------------------------

function handleSpannerStop(curSp: SLine | null, track2: track_idx_t, tick: Fraction, spanners: MusicXmlSpannerMap): void {
    if (!curSp) {
        return
    }

    curSp.setTrack2(track2)
    // C++ spanners[cur_sp].second: inserts { 0, 0 } if missing
    let entry = spanners.get(curSp)
    if (!entry) {
        entry = [0, 0]
        spanners.set(curSp, entry)
    }
    entry[1] = tick.ticks()
}

//---------------------------------------------------------
//   setChordRestDuration
//---------------------------------------------------------

/**
 * Set \a cr duration
 */

function setChordRestDuration(cr: ChordRest, duration: TDuration, dura: Fraction): void {
    if (duration.isMeasure()) {
        cr.setDurationType(duration)
        cr.setTicks(dura)
    } else {
        cr.setDurationType(duration)
        cr.setTicks(cr.durationType().fraction())
    }
}

//---------------------------------------------------------
//   addRest
//---------------------------------------------------------

/**
 * Add a rest to the score
 * TODO: display step handling
 */

function addRest(score: Score | null, m: Measure, tick: Fraction, track: track_idx_t, move: number, duration: TDuration,
    dura: Fraction): Rest | null {
    void score
    const s = m.getSegment(SegmentType.ChordRest, tick)
    // Sibelius might export two rests at the same place, ignore the 2nd one
    // <?DoletSibelius Two NoteRests in same voice at same position may be an error?>
    // Same issue may result from trying to import incomplete tuplets
    if (s.element(track)) {
        return null
    }

    const cr = Factory.createItem(ElementType.REST, s) as Rest
    setChordRestDuration(cr, duration, dura)
    cr.setTrack(track)
    cr.setStaffMove(move)
    s.add(cr)
    return cr
}

//---------------------------------------------------------
//   resetTuplets
//---------------------------------------------------------

function resetTuplets(tuplets: Tuplets): void {
    for (let i = 0; i < tuplets.size(); ++i) {
        const tuplet = { v: tuplets.valueAt(i) }
        if (tuplet.v) {
            const t = tuplet.v
            const actualDuration = t.elementsDuration().div(t.ratio())
            const missingDuration = MusicXmlTupletState.missingTupletDuration(actualDuration)
            if (actualDuration.gt(new Fraction(0, 1)) && missingDuration.gt(new Fraction(0, 1))) {
                const firstElement = t.elements()[0]
                // appended the rest to the current end of the tuplet (firstElement->tick() + actualDuration)
                const extraRest = addRest(firstElement.score(), firstElement.measure(),
                    firstElement.tick().plus(actualDuration), firstElement.track(), 0,
                    new TDuration(missingDuration.times(t.ratio())), missingDuration)
                if (extraRest) {
                    extraRest.setTuplet(t)
                    t.add(extraRest)
                }
            }
            const normalNotes = t.ratio().denominator()
            // C++ handleTupletStop(tuplet, ...) on a copy of the map value: the map entry is not changed
            handleTupletStop(tuplet, normalNotes)
        }
    }
}

//---------------------------------------------------------
//   findIncompleteSpannersInStack
//---------------------------------------------------------

function findIncompleteSpannersInStack(spannerType: string, stack: SpannerStack, res: SpannerSet): void {
    void spannerType
    for (const desc of stack) {
        if (desc.sp) {
            // spannerType not terminated at end of part
            res.add(desc.sp)
            desc.reset()
        }
    }
}

//---------------------------------------------------------
//   cleanupUnterminatedTie
//---------------------------------------------------------
/**
 Delete tie and add Laissez Vibrer where it was
 */

function cleanupUnterminatedTie(tie: Tie, score: Score, fixForCrossStaff = false): void {
    const unterminatedTieNote = tie.startNote()!
    const unterminatedChord = unterminatedTieNote.chord()

    // Dolet 6 doesn't export cross staff information
    // If a tie is unterminated, try to find a candidate to tie it to on a different track/stave
    if (fixForCrossStaff) {
        const nextSeg = score.tick2leftSegment(unterminatedChord.tick().plus(unterminatedChord.ticks()))
        if (nextSeg) {
            const part = unterminatedTieNote.part()!
            for (let track = part.startTrack(); track <= part.endTrack(); ++track) {
                const el = nextSeg.element(track)
                if (el && el.isChord()) {
                    const matchingNote = (el as Chord).findNote(unterminatedTieNote.pitch())
                    if (matchingNote && matchingNote.tpc() === unterminatedTieNote.tpc()) {
                        tie.setEndNote(matchingNote)
                        matchingNote.setTieBack(tie)
                        return
                    }
                }
            }
        }
    }

    // Delete unterminated ties pending fully featured l.v. ties & ties over repeats
    unterminatedTieNote.remove(tie)

    // Add Laissez Vibrer instead
    const lvTie = Factory.createItem(ElementType.LAISSEZ_VIB, unterminatedTieNote) as LaissezVib
    lvTie.setParent(unterminatedTieNote)
    unterminatedTieNote.score().undoAddElement(lvTie)
}

//---------------------------------------------------------
//   isLikelyIncorrectPartName
//---------------------------------------------------------
/**
 Sibelius exports part names of the form "P#" rather than
 specifying print-object="no". This finds those.
 */

function isLikelyIncorrectPartName(partName: string): boolean {
    return /^P[0-9]+$/.test(partName)
}

//---------------------------------------------------------
//   createBarline
//---------------------------------------------------------

/*
 * Create a barline of the specified type.
 */

function createBarline(score: Score, track: track_idx_t, type: BarLineType, visible: boolean, barStyle: string,
    spanStaff: boolean): BarLine {
    const barline = Factory.createItem(ElementType.BAR_LINE, scoreDummy(score).segment()) as BarLine
    barline.setTrack(track)
    barline.setBarLineType(type)
    barline.setSpanStaff(spanStaff)
    barline.setVisible(visible)
    if (barStyle === 'tick') {
        barline.setSpanFrom(BARLINE_SPAN_TICK1_FROM)
        barline.setSpanTo(BARLINE_SPAN_TICK1_TO)
    } else if (barStyle === 'short') {
        barline.setSpanFrom(BARLINE_SPAN_SHORT1_FROM)
        barline.setSpanTo(BARLINE_SPAN_SHORT1_TO)
    }
    return barline
}

//---------------------------------------------------------
//   addBarlineToMeasure
//---------------------------------------------------------

/*
 * Add barline to the measure at tick.
 */

function addBarlineToMeasure(measure: Measure, tick: Fraction, barline: BarLine): void {
    let st = SegmentType.BarLine
    if (tick.eq(measure.endTick())) {
        st = SegmentType.EndBarLine
    } else if (tick.eq(measure.tick())) {
        st = SegmentType.BeginBarLine
    }
    const segment = measure.getSegment(st, tick)
    segment.add(barline)
}

function createTimeTick(score: Score, tick: Fraction, staffIdx: staff_idx_t): void {
    const measure = score.tick2measure(tick)!
    if (!measure.findSegment(SegmentType.TimeTick | SegmentType.ChordRest, tick)) {
        EditTimeTickAnchors.createTimeTickAnchor(measure, tick.minus(measure.tick()), staffIdx)
    }
}

function replacePartNameAccidentals(partName: string): string {
    let name = partName
    const re = /((^|\s| )[ABCDEF][b#¯]($|\s| ))/g
    const res: string[] = []
    for (const m of name.matchAll(re)) {
        if (m[1]) {
            res.push(m[1])
        }
    }
    if (res.length) {
        const transp = res[0].replaceAll('b', '♭').replaceAll('¯', '♭').replaceAll('#', '♯')
        name = name.replace(re, () => transp)
        return name
    }
    return partName
}

//---------------------------------------------------------
//   findMeasure
//---------------------------------------------------------

/**
 In Score \a score find the measure starting at \a tick.
 */

function findMeasure(score: Score, tick: Fraction): Measure | null {
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        if (m.tick().eq(tick)) {
            return m
        }
    }
    return null
}

//---------------------------------------------------------
//   removeBeam
//---------------------------------------------------------

/**
 Set beam mode for all elements and remove the beam
 */

function removeBeam(beam: { v: Beam | null }): void {
    const b = beam.v!
    for (let i = 0; i < b.elements().length; ++i) {
        b.elements()[i].setBeamMode(BeamMode.NONE)
    }
    beam.v = null
}

//---------------------------------------------------------
//   handleBeamAndStemDir
//---------------------------------------------------------

function handleBeamAndStemDir(cr: ChordRest | null, bm: BeamMode, sd: DirectionV, beam: { v: Beam | null },
    hasBeamingInfo: boolean, beamColor: Color, fan: string): void {
    if (!cr) {
        return
    }
    // create a new beam
    if (bm === BeamMode.BEGIN) {
        // if currently in a beam, delete it
        if (beam.v) {
            removeBeam(beam)
        }
        // create a new beam
        beam.v = Factory.createBeam(scoreDummy(cr.score()).system())
        beam.v.setTrack(cr.track())
        beam.v.setDirection(sd)
        colorItem(beam.v, beamColor)
        if (fan !== '' && fan !== 'none') {
            beam.v.setAsFeathered(fan === 'rit')
        }
    }
    // add ChordRest to beam
    if (beam.v) {
        // verify still in the same track (if still in the same voice)
        // and in a beam ...
        // (note no check is done on correct order of beam begin/continue/end)
        // TODO: Some BEGINs are being skipped
        if (cr.track() !== beam.v.track()) {
            // reset beam mode for all elements and remove the beam
            removeBeam(beam)
        } else if (bm === BeamMode.NONE) {
            // reset beam mode for all elements and remove the beam
            removeBeam(beam)
        } else if (!(bm === BeamMode.BEGIN || bm === BeamMode.MID || bm === BeamMode.END || bm === BeamMode.BEGIN16
                     || bm === BeamMode.BEGIN32)) {
            // reset beam mode for all elements and remove the beam
            removeBeam(beam)
        } else {
            // actually add cr to the beam
            beam.v.add(cr)
        }
    }
    // if no beam, set stem direction on chord itself
    if (!beam.v) {
        (cr as unknown as Chord).setStemDirection(sd)
        // set beam to none if score has beaming information and note can get beam, otherwise
        // set to auto
        const canGetBeam = (cr.durationType().type() >= DurationType.V_EIGHTH
                            && cr.durationType().type() <= DurationType.V_1024TH)
        if (hasBeamingInfo && canGetBeam) {
            cr.setBeamMode(BeamMode.NONE)
        } else {
            cr.setBeamMode(BeamMode.AUTO)
        }
    }
    // terminate the current beam and add to the score
    if (beam.v && bm === BeamMode.END) {
        beam.v = null
    }
}

//---------------------------------------------------------
//   markUserAccidentals
//---------------------------------------------------------

/**
 Check for "superfluous" accidentals to mark them as USER accidentals.
 The candidate map alterMap is ordered on note address. Check it here segment after segment.
 */

function markUserAccidentals(firstStaff: staff_idx_t, staves: number, key: Key, measure: Measure,
    alterMap: Map<Note, number>): void {
    const accTmp = new IntMap<boolean>()

    const currAcc = new AccidentalState()
    currAcc.init(key)
    const st = SegmentType.ChordRest
    for (let segment = measure.first(st); segment; segment = segment.next(st)) {
        for (let track = 0; track < staves * VOICES; ++track) {
            const e = segment.element(firstStaff * VOICES + track)
            if (!e || !e.isChord()) {
                continue
            }
            const chord = e as unknown as Chord
            for (const nt of chord.notes()) {
                if (alterMap.has(nt)) {
                    const alter = alterMap.get(nt)!
                    const ln = absStep(nt.tpc(), nt.pitch())
                    const [currAccVal, error] = currAcc.accidentalValChecked(ln)
                    if (error) {
                        continue
                    }
                    const acc = nt.accidental()!
                    if ((alter === -1
                         && currAccVal === AccidentalVal.FLAT
                         && acc.accidentalType() === AccidentalType.FLAT
                         && !(accTmp.get(ln) ?? false))
                        || (alter === 0
                            && currAccVal === AccidentalVal.NATURAL
                            && acc.accidentalType() === AccidentalType.NATURAL
                            && !(accTmp.get(ln) ?? false))
                        || (alter === 1
                            && currAccVal === AccidentalVal.SHARP
                            && acc.accidentalType() === AccidentalType.SHARP
                            && !(accTmp.get(ln) ?? false))) {
                        acc.setRole(AccidentalRole.USER)
                    } else if (Accidental.isMicrotonal(acc.accidentalType())
                               && acc.accidentalType() < AccidentalType.END) {
                        // microtonal accidental
                        acc.setRole(AccidentalRole.USER)
                        accTmp.insert(ln, false)
                    } else {
                        accTmp.insert(ln, true)
                    }
                }
            }
        }
    }
}

//---------------------------------------------------------
//   coerceGraceCue
//---------------------------------------------------------

/**
 If the mainChord is small and/or silent, the grace note should likely
 match this. Exporters tend to incorrectly omit <cue> or <type size="cue">
 from grace notes.
 */

function coerceGraceCue(mainChord: Chord, graceChord: Chord): void {
    if (mainChord.isSmall()) {
        graceChord.setSmall(true)
    }
    let anyPlays = false
    for (const n of mainChord.notes()) {
        anyPlays ||= n.play()
    }
    if (!anyPlays) {
        for (const gn of graceChord.notes()) {
            gn.setPlay(false)
        }
    }
}

//---------------------------------------------------------
//   addGraceChordsAfter
//---------------------------------------------------------

/**
 Move \a gac grace chords from grace chord list \a gcl
 to the chord \a c grace note after list
 */

function addGraceChordsAfter(c: Chord | null, gcl: GraceChordList, gac: { v: number }): void {
    if (!c) {
        return
    }

    while (gac.v > 0) {
        if (gcl.length > 0) {
            const graceChord = gcl.shift()!
            const el = [...graceChord.el()] // copy, because modified during loop
            for (const e of el) {
                if (e.isFermata()) {
                    e.setParent(c.segment())
                    c.segment().add(e)
                    graceChord.removeFermata(e)
                }
            }
            graceChord.toGraceAfter()
            c.add(graceChord)              // TODO check if same voice ?
            coerceGraceCue(c, graceChord)
        }
        gac.v--
    }
}

//---------------------------------------------------------
//   addGraceChordsBefore
//---------------------------------------------------------

/**
 Move grace chords from grace chord list \a gcl
 to the chord \a c grace note before list
 */

function addGraceChordsBefore(c: Chord, gcl: GraceChordList): void {
    for (let i = gcl.length - 1; i >= 0; i--) {
        const gc = gcl[i]
        const el = [...gc.el()] // copy, because modified during loop
        for (const e of el) {
            if (e.isFermata()) {
                e.setParent(c.segment())
                c.segment().add(e)
                gc.removeFermata(e)
            }
        }
        c.add(gc) // TODO check if same voice ?
        coerceGraceCue(c, gc)
    }
    gcl.length = 0
}

function canAddTempoText(tempoMap: TempoMap, tick: number): boolean {
    if (!tempoMap.has(tick)) {
        return true
    }

    return tempoMap.tempo(tick) === Constants.DEFAULT_TEMPO
}

//---------------------------------------------------------
//   setStaffLines
//---------------------------------------------------------

/**
 Set stafflines and barline span for a single staff
 */

function setStaffLines(score: Score, staffIdx: staff_idx_t, stafflines: number): void {
    score.staff(staffIdx)!.setLines(new Fraction(0, 1), stafflines)
    score.staff(staffIdx)!.setBarLineTo(0)          // default
}

/** C++ std::round (half away from zero) */
function roundHalfAway(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

/** C++ String::arg(double): String::number(val, 6) */
function numberArg(v: number): string {
    let s = v.toFixed(6)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s === '-0' ? '0' : s
}

/** std::gcd of non-negative ints */
function gcd(a: number, b: number): number {
    a = Math.abs(a)
    b = Math.abs(b)
    while (b) {
        const t = a % b
        a = b
        b = t
    }
    return a
}

/** C++ std::regex("(<.*?>)"): the formatting tags removed by String::remove(re) */
const xmlTagRe = /(<.*?>)/g

//---------------------------------------------------------
//   preventNegativeTick
//---------------------------------------------------------
/**
  Prevent an offset that would result in a negative tick (set offset to -tick instead, resulting in a tick of 0)
 */

function preventNegativeTick(tick: Fraction, offset: Ref<Fraction>, logger: MusicXmlLogger): void {
    if (tick.plus(offset.v).lt(new Fraction(0, 1))) {
        logger.logError(`illegal offset ${offset.v.ticks()} at tick ${tick.ticks()}`)
        offset.v = tick.neg()
    }
}

function getTempoChangeTypeFromString(txt: string): GradualTempoChangeType {
    txt = txt.toLowerCase()
    if (txt.includes('accel')) {
        return GradualTempoChangeType.Accelerando
    } else if (txt.includes('allarg')) {
        return GradualTempoChangeType.Allargando
    } else if (txt === 'calando') {
        return GradualTempoChangeType.Calando
    } else if (txt.includes('lent')) {
        return GradualTempoChangeType.Lentando
    } else if (txt === 'morendo') {
        return GradualTempoChangeType.Morendo
    } else if (txt === 'precipitando') {
        return GradualTempoChangeType.Precipitando
    } else if (txt.includes('rall')) {
        return GradualTempoChangeType.Rallentando
    } else if (txt.includes('rit')) {
        return GradualTempoChangeType.Ritardando
    } else if (txt.includes('smorz')) {
        return GradualTempoChangeType.Smorzando
    } else if (txt === 'stringendo') {
        return GradualTempoChangeType.Stringendo
    } else {
        return GradualTempoChangeType.Undefined
    }
}

function terminateInferredLine(lines: readonly TextLineBase[], tick: Fraction, track: track_idx_t): void {
    // Check staff and end any lines which are waiting
    if (musicXmlImportConfiguration().inferTextType()) {
        // To avoid extending lines which aren't intended to be terminated by their end markings,
        // only extend lines to markings within 24 quarter notes
        const MAX_INFERRED_LINE_LEN = new Fraction(24, 4)
        for (const line of lines) {
            const diff = tick.minus(line.tick())
            if (line && line.staffIdx() === track2staff(track)
                && line.ticks().eq(new Fraction(0, 1)) && diff.le(MAX_INFERRED_LINE_LEN)) {
                line.setTrack2(track)
                line.setTick2(tick)
            }
        }
    }
}

const tempoStrs: readonly string[] = [
    'adag', 'alleg', 'andant', 'a tempo', 'ballad', 'brisk', 'determination', 'dolce', 'expressive',
    'fast', 'free', 'gently', 'grave', 'larg', 'lento', 'stesso tempo', 'lively', 'maestoso', 'moderat', 'mosso',
    'prest', 'rubato', 'slow', 'straight', 'tango', 'tempo i', 'tenderly', 'triumphant', 'vivace',
]

//                         UTF-16 encoding: 0x00BC, 0x00BD, 0x00BE, 0x2150, 0x2151, 0x2152,  etc...
const fracs: readonly string[] = ['1/4', '1/2', '3/4', '1/7', '1/9', '1/10', '1/3', '2/3', '1/5', '2/5', '3/5',
    '4/5', '1/6', '5/6', '1/8', '3/8', '5/8', '7/8']

const otherDirectionSyms = new StringMap<SymId>()

for (const [k, v] of [
    ['Rhythm dot', SymId.augmentationDot],
    ['Whole rest', SymId.restWhole],
    ['l.v. down', SymId.articLaissezVibrerBelow],
    ['8vb', SymId.ottavaBassaVb],
    ['Treble clef', SymId.gClef],
    ['Bass clef', SymId.fClef],
    ['Caesura', SymId.caesura],
    ['Thick caesura', SymId.caesuraThick],
] as [string, SymId][]) {
    otherDirectionSyms.set(k, v)
}

function getMarkerId(words: string): string {
    // Helper function to set the marker ID string
    // eg. extract 'II' from 'To Coda II'
    const nums = [...words.matchAll(/(i{0,3})/g)].map(m => m[1]).filter(s => s !== '')
    if (nums.length) {
        return nums[0]
    }
    return ''
}

const daCapoRe = /^(d\.? ?|da )(c\.?|capo)$/

const daCapoAlFineRe = /^(d\.? ?|da )(c\.? ?|capo )al fine$/

const daCapoAlCodaRe = /^(d\.? ?|da )(c\.? ?|capo )al coda ?(i{0,3})?$/

const dalSegnoRe = /^(d\.? ?|d[ae]l )(s\.?s?\.?|segno) ?(i{0,3})?$/

const dalSegnoAlFineRe = /^(d\.? ?|d[ae]l )(s\.?s?\.?|segno\.?) ?(i{0,3})? ?(\(.*\))? al fine$/

const dalSegnoAlCodaRe = /^(d\.? ?|d[ae]l )(s\.?s?\.?|segno\.?) ?(i{0,3})? ?(\(.*\))? al coda ?(i{0,3})?$/

const fineRe = /^fine$/

const segnoRe = /^segno( segno)? ?(i{0,3})?$/

const toCodaRe = /^to coda( coda)? ?(i{0,3})?$/

const codaRe = /^coda( coda)? ?(i{0,3})?$/

function addSymbolsToCoda(wordsString: Ref<string>, codaId: string): void {
    // Append correct number of symbols to coda text
    if (!wordsString.v.includes('<sym>coda</sym>')) {
        let end = '\n'
        if (codaId.length > 0) {
            end += codaId
            end = end.replaceAll('i', '<sym>coda</sym>')
        } else {
            end += '<sym>coda</sym>'
        }
        wordsString.v += end
    }
}

//---------------------------------------------------------
//   isLikelyFingering
//---------------------------------------------------------

// One or more newline-separated digits, possibly lead or trailed by whitespace
const fingeringRe
    = /^(?:\s| )*[-–]?(?:\s| )?[0-5pimac](?:[-–][0-5pimac])?(?:\n[-–]?(?:\s| )?[0-5pimac](?:[-–][0-5pimac])?)*(?:\s| )*$/

/** std::map<String, String> finaleDynamicSubs (in key order) */
const finaleDynamicSubs = new StringMap<string>()

for (const [k, v] of [['π', 'pp'], ['P', 'mp'], ['F', 'mf'], ['ƒ', 'ff'], ['Ï', 'fff'], ['S', 'sf'], ['ß', 'sfz'],
    ['Z', 'fz'], ['Í', 'fp']]) {
    finaleDynamicSubs.set(k, v)
}

/** TConv::dynamicValid */
function dynamicValid(tag: string): boolean {
    const INVALID = -1000 as DynamicType
    return TConv.fromXmlDynamicType(tag, INVALID) !== INVALID
}

function findDetachedRepeatNumber(measure: Measure, track: track_idx_t, tick: Fraction, placement: string,
    directions: DelayedDirectionsList): string {
    const number = /^(i{1,3})$/

    for (let i = 0; i < directions.length; ++i) {
        const d = directions[i]
        const el = d.element()
        if (d.track() === track && d.tick().eq(tick) && d.placement() === placement && el.isTextBase()) {
            const text = (el as TextBase).plainText()
            if (number.test(text.toLowerCase())) {
                directions.splice(i, 1)
                return ' ' + text
            }
        }
    }

    const s = measure.findSegment(SegmentType.ChordRest, tick)
    if (s) {
        for (const el of s.annotations().slice()) {
            if (el.tick().eq(tick) && el.track() === track && el.placeAbove() === (placement === 'above') && el.isTextBase()) {
                const text = (el as TextBase).plainText()
                if (number.test(text.toLowerCase())) {
                    s.removeAnnotation(el)
                    return ' ' + text
                }
            }
        }
    }

    return ''
}

const dalSegnoAlCodaGroupsRe = /^(d\.? ?|d[ae]l )(s\.?s?\.?|segno\.?) ?(i{0,3})?(\(.*\))? al coda ?(i{0,3})?$/

function countSegno(plainWords: string): string {
    // Count how many 's' in D.S. or D.S.S...
    const matches = dalSegnoAlCodaGroupsRe.exec(plainWords)
    if (matches) {
        const segnoGroup = (matches[2] ?? '').toLowerCase()
        const count = segnoGroup.split('s').length - 1
        return 'i'.repeat(count)
    }
    return ''
}

// C++ L"...(([#b♯♭])\3?)..." : "\3" in the C++ string literal is the octal escape U+0003, not a back reference
const chordSymRe = /^([abcdefg])(([#b♯♭])\x03?)?(maj|min|m)?[769]?((add[#b♯♭]?(9|11|))|(sus[24]?))?(\(.*\))?$/

function metronomeTextMap(entries: [string, [string, DurationType]][]): MetronomeTextMap {
    const m: MetronomeTextMap = new StringMap<[string, DurationType]>()
    for (const [k, v] of entries) {
        m.set(k, v)
    }
    return m
}

// Map Sibelius' representation of note types to their SMuFL counterparts and duration types
const sibeliusSyms = metronomeTextMap([
    ['y', ['<sym>metNote32ndUp</sym>', DurationType.V_32ND]],
    ['x', ['<sym>metNote16thUp</sym>', DurationType.V_16TH]],
    ['e', ['<sym>metNote8thUp</sym>', DurationType.V_EIGHTH]],
    ['q', ['<sym>metNoteQuarterUp</sym>', DurationType.V_QUARTER]],
    ['h', ['<sym>metNoteHalfUp</sym>', DurationType.V_HALF]],
    ['w', ['<sym>metNoteWhole</sym>', DurationType.V_WHOLE]],
    ['V', ['<sym>metNoteDoubleWholeSquare</sym>', DurationType.V_BREVE]],
    ['W', ['<sym>metNoteDoubleWhole</sym>', DurationType.V_BREVE]],
])

const metTimesSyms = metronomeTextMap([
    ['Œ', ['<sym>metNoteQuarterUp</sym>', DurationType.V_QUARTER]],
    ['Ó', ['<sym>metNoteHalfUp</sym>', DurationType.V_HALF]],
])

// C++ function-local statics: built from the substitutions of the first call only
let s_tempoRe: RegExp | null = null

let s_replaceRe: RegExp | null = null

// C++ iterates a std::unordered_map<String, PlayingTechniqueType> (the first matching text wins): the entries are in
// the iteration order of libstdc++ (std::hash<std::u16string>, 29 buckets), with which MuseScore's test references are made
const textToPlayTechniqueType: readonly (readonly [string, PlayingTechniqueType])[] = [
    ['jazz', PlayingTechniqueType.JazzTone],
    ['overdrive', PlayingTechniqueType.Overdrive],
    ['distortion', PlayingTechniqueType.Distortion],
    ['vibrato', PlayingTechniqueType.Vibrato],
    ['sul pont', PlayingTechniqueType.SulPonticello],
    ['martele', PlayingTechniqueType.Martele],
    ['detache', PlayingTechniqueType.Detache],
    ['trem', PlayingTechniqueType.Tremolo],
    ['harmonics', PlayingTechniqueType.Harmonics],
    ['legno', PlayingTechniqueType.ColLegno],
    ['sord', PlayingTechniqueType.Mute],
    ['con sord', PlayingTechniqueType.Mute],
    ['no mute', PlayingTechniqueType.Open],
    ['without mute', PlayingTechniqueType.Open],
    ['unmuted', PlayingTechniqueType.Open],
    ['legato', PlayingTechniqueType.Legato],
    ['sul tast', PlayingTechniqueType.SulTasto],
    ['open', PlayingTechniqueType.Open],
    ['pizz', PlayingTechniqueType.Pizzicato],
    ['arco', PlayingTechniqueType.Natural],
    ['ord', PlayingTechniqueType.Natural],
    ['mute', PlayingTechniqueType.Mute],
    ['normal', PlayingTechniqueType.Natural],
    ['senza sord', PlayingTechniqueType.Open],
    ['natural', PlayingTechniqueType.Natural],
]

//---------------------------------------------------------
//   determineBarLineType
//---------------------------------------------------------

function determineBarLineType(barStyle: string, repeat: string, type: Ref<BarLineType>, visible: Ref<boolean>,
    exporter: MusicXmlExporterSoftware): boolean {
    // set defaults
    type.v = BarLineType.NORMAL
    visible.v = true

    if (barStyle === 'light-heavy' && repeat === 'backward') {
        type.v = BarLineType.END_REPEAT
    } else if (barStyle === 'heavy-light' && repeat === 'forward') {
        type.v = BarLineType.START_REPEAT
    } else if (barStyle === 'light-heavy' && repeat === 'forward' && exporter === MusicXmlExporterSoftware.NOTEFLIGHT) {
        type.v = BarLineType.START_REPEAT
    } else if (barStyle === 'light-heavy' && repeat === '') {
        type.v = BarLineType.END
    } else if (barStyle === 'heavy-light' && repeat === '') {
        type.v = BarLineType.REVERSE_END
    } else if (barStyle === 'regular') {
        type.v = BarLineType.NORMAL
    } else if (barStyle === 'dashed') {
        type.v = BarLineType.BROKEN
    } else if (barStyle === 'dotted') {
        type.v = BarLineType.DOTTED
    } else if (barStyle === 'light-light') {
        type.v = BarLineType.DOUBLE
        /*
        } else if (barStyle == "heavy-light") {
         ;
         */
    } else if (barStyle === 'heavy-heavy') {
        type.v = BarLineType.DOUBLE_HEAVY
    } else if (barStyle === 'heavy') {
        type.v = BarLineType.HEAVY
    } else if (barStyle === 'none') {
        visible.v = false
    } else if (barStyle === '') {
        if (repeat === 'backward') {
            type.v = BarLineType.END_REPEAT
        } else if (repeat === 'forward') {
            type.v = BarLineType.START_REPEAT
        } else {
            return false
        }
    } else if ((barStyle === 'tick') || (barStyle === 'short')) {
        // handled later (as normal barline with different parameters)
    } else {
        return false
    }

    return true
}

//---------------------------------------------------------
//   findRedundantVolta
//---------------------------------------------------------
function findRedundantVolta(track: track_idx_t, measure: Measure): Volta | null {
    const spanners = measure.score().spannerMap().findOverlapping(measure.tick().ticks(), measure.endTick().ticks())
    for (const spanner of spanners) {
        if (spanner.isVolta() && track2staff(spanner.track()) !== track2staff(track)) {
            return spanner as unknown as Volta
        }
    }
    return null
}

//---------------------------------------------------------
//   addSymToSig
//---------------------------------------------------------

/**
 Add a symbol defined as key-step \a step , -alter \a alter and -accidental \a accid to \a sig.
 */

function addSymToSig(sig: KeySigEvent, step: string, alter: string, accid: string, smufl: string): void {
    let id = musicXmlString2accSymId(accid, smufl)

    if (id === SymId.noSym) {
        const ok = { v: false }
        const d = strToDouble(alter, ok)
        const accTpAlter = ok.v ? microtonalGuess(d) : AccidentalType.NONE
        let s = accidentalType2MusicXmlString(accTpAlter)
        if (s === 'other') {
            s = accidentalType2SmuflMusicXmlString(accTpAlter)
        }
        id = musicXmlString2accSymId(s)
    }

    if (step.length === 1 && id !== SymId.noSym) {
        const table = 'CDEFGAB'
        if (table.includes(step)) {
            sig.customKeyDefs().push({ degree: table.indexOf(step), sym: id, xAlt: 0.0, octAlt: 0 })
            sig.setCustom(true)
        }
    }
}

//---------------------------------------------------------
//   addKey
//---------------------------------------------------------

/**
 Add a KeySigEvent to the score.
 */

function addKey(key: KeySigEvent, keyColor: Color, printObj: boolean, score: Score, measure: Measure, staffIdx: staff_idx_t,
    tick: Fraction): void {
    const oldkey = score.staff(staffIdx)!.key(tick)
    // TODO only if different custom key ?
    if (oldkey !== key.key() || key.custom() || key.isAtonal()) {
        // new key differs from key in effect at this tick
        const s = measure.getSegment(SegmentType.KeySig, tick)
        const keysig = Factory.createItem(ElementType.KEYSIG, s) as KeySig
        keysig.setTrack(staffIdx * VOICES)
        keysig.setKeySigEvent(key)
        keysig.setVisible(printObj)
        colorItem(keysig, keyColor)
        s.add(keysig)
    }
}

//---------------------------------------------------------
//   flushAlteredTone
//---------------------------------------------------------

/**
 If a valid key-step, -alter, -accidental combination has been read,
 convert it to a key symbol and add to the key.
 Clear key-step, -alter, -accidental.
 */

function flushAlteredTone(kse: KeySigEvent, step: Ref<string>, alt: Ref<string>, acc: Ref<string>, smufl: Ref<string>): void {
    if (step.v === '' && alt.v === '' && acc.v === '') {
        return      // nothing to do
    }
    // step and alt are required, but also accept step and acc
    if (step.v !== '' && (alt.v !== '' || acc.v !== '')) {
        addSymToSig(kse, step.v, alt.v, acc.v, smufl.v)
    }

    // clean up
    step.v = ''
    alt.v = ''
    acc.v = ''
}

//---------------------------------------------------------
//   determineTimeSig
//---------------------------------------------------------

/**
 Determine the time signature based on \a beats, \a beatType and \a timeSymbol.
 Sets return parameters \a st, \a bts, \a btp.
 Return true if OK, false on error.
 */

// TODO: share between pass 1 and pass 2

function determineTimeSig(beats: string, beatType: string, timeSymbol: string, st: Ref<TimeSigType>, bts: Ref<number>,
    btp: Ref<number>): boolean {
    // initialize
    st.v = TimeSigType.NORMAL
    bts.v = 0         // the beats (max 4 separated by "+") as integer
    btp.v = 0         // beat-type as integer
    // determine if timesig is valid
    if (timeSymbol === 'cut') {
        st.v = TimeSigType.ALLA_BREVE
    } else if (timeSymbol === 'common') {
        st.v = TimeSigType.FOUR_FOUR
    } else if (timeSymbol === 'single-number') {
        // let pass
    } else if (timeSymbol !== '' && timeSymbol !== 'normal') {
        return false
    }

    btp.v = strToInt(beatType)
    const list = beats.split('+')
    for (const s of list) {
        bts.v += strToInt(s)
    }

    // determine if bts and btp are valid
    if (bts.v <= 0 || btp.v <= 0) {
        return false
    }

    return true
}

//---------------------------------------------------------
//   isWholeMeasureRest
//---------------------------------------------------------

/**
 * Determine whole measure rest.
 */

// By convention, whole measure rests do not have a "type" element
// As of MusicXML 3.0, this can be indicated by an attribute "measure",
// but for backwards compatibility the "old" convention still has to be supported.
// Also verify the rest fits exactly in the measure, as some programs
// (e.g. Cakewalk SONAR X2 Studio [Version: 19.0.0.306]) leave out
// the type for all rests.
// Sibelius calls all whole-measure rests "whole", even if the duration != 4/4

function isWholeMeasureRest(type: string, restDuration: Fraction, measureDuration: Fraction): boolean {
    if (!restDuration.isValid() || !measureDuration.isValid()) {
        return false
    }

    return (type === '' && restDuration.eq(measureDuration))
           || (type === 'whole' && restDuration.eq(measureDuration))
}

//---------------------------------------------------------
//   determineDuration
//---------------------------------------------------------

/**
 * Determine duration for a note or rest.
 * This includes whole measure rest detection.
 */

function determineDuration(isRest: boolean, measureRest: boolean, type: string, dots: number, chordRestDuration: Fraction,
    measureDuration: Fraction): TDuration {
    const res = new TDuration()
    if (isRest && (measureRest || isWholeMeasureRest(type, chordRestDuration, measureDuration))) {
        res.setType(DurationType.V_MEASURE)
    } else if (type === '') {
        // If no type, set duration type based on duration.
        // Note that sometimes unusual duration (e.g. 261/256) are found.
        res.setVal(chordRestDuration.ticks())
    } else {
        res.setType(TConv.fromXmlDurationType(type, DurationType.V_INVALID))
        res.setDots(dots)
        if (!res.isValid()) {
            res.setType(DurationType.V_QUARTER)        // default, TODO: use measureDuration ?
        }
    }

    return res
}

//---------------------------------------------------------
//   findOrCreateChord
//---------------------------------------------------------

/**
 * Find (or create if not found) the chord at \a tick and \a track.
 * Note: staff move is a note property in MusicXML, but chord property in MuseScore
 * This is simply ignored here, effectively using the last chords value.
 */

function findOrCreateChord(score: Score, m: Measure, tick: Fraction, track: number, move: number, duration: TDuration,
    dura: Fraction, bm: BeamMode, small: boolean): Chord {
    void score
    let c = m.findChord(tick, track)
    if (c === null) {
        const s = m.getSegment(SegmentType.ChordRest, tick)
        c = Factory.createItem(ElementType.CHORD, s) as Chord
        // better not to force beam end, as the beam palette does not support it
        if (bm === BeamMode.END) {
            c.setBeamMode(BeamMode.AUTO)
        } else {
            c.setBeamMode(bm)
        }
        c.setTrack(track)
        // Chord is initialized with the smallness of its first note.
        // If a non-small note is added later, this is handled in handleSmallness.
        c.setSmall(small)

        setChordRestDuration(c, duration, dura)
        s.add(c)
    }
    c.setStaffMove(move)
    return c
}

//---------------------------------------------------------
//   graceNoteType
//---------------------------------------------------------

/**
 * convert duration and slash to grace note type
 */

function graceNoteType(duration: TDuration, slash: boolean): NoteType {
    let nt = NoteType.APPOGGIATURA
    if (slash) {
        nt = NoteType.ACCIACCATURA
    } else {
        if (duration.type() === DurationType.V_QUARTER) {
            nt = NoteType.GRACE4
        } else if (duration.type() === DurationType.V_16TH) {
            nt = NoteType.GRACE16
        } else if (duration.type() === DurationType.V_32ND) {
            nt = NoteType.GRACE32
        }
    }
    return nt
}

//---------------------------------------------------------
//   createGraceChord
//---------------------------------------------------------

/**
 * Create a grace chord.
 */

function createGraceChord(score: Score, track: number, duration: TDuration, slash: boolean, small: boolean): Chord {
    const c = Factory.createItem(ElementType.CHORD, scoreDummy(score).segment()) as Chord
    c.setNoteType(graceNoteType(duration, slash))
    c.setTrack(track)
    // Chord is initialized with the smallness of its first note.
    // If a non-small note is added later, this is handled in handleSmallness.
    c.setSmall(small)
    // note grace notes have no durations, use default fraction 0/1
    setChordRestDuration(c, duration, new Fraction())
    return c
}

//---------------------------------------------------------
//   handleDisplayStep
//---------------------------------------------------------

/**
 * convert display-step and display-octave to staff line
 */

function handleDisplayStep(cr: ChordRest, step: number, octave: number, tick: Fraction, spatium: number): void {
    if (0 <= step && step <= 6 && 0 <= octave && octave <= 9) {
        const clef = cr.staff()!.clef(tick)
        const po = ClefInfo.pitchOffset(clef)
        const dp = 7 * (octave + 2) + step
        cr.setOffset(cr.offset().x(), (po - dp + 3) * spatium / 2)
    }
}

//---------------------------------------------------------
//   handleSmallness
//---------------------------------------------------------

function handleSmallness(cueOrSmall: boolean, note: Note, c: Chord): void {
    if (cueOrSmall) {
        note.setSmall(!c.isSmall()) // Avoid redundant smallness
    } else {
        note.setSmall(false)
        if (c.isSmall()) {
            // What was a small chord becomes small notes in a non-small chord
            c.setSmall(false)
            for (const otherNote of c.notes()) {
                if (note !== otherNote) {
                    otherNote.setSmall(true)
                }
            }
        }
    }
}

//---------------------------------------------------------
//   setNoteHead
//---------------------------------------------------------

/**
 Set the notehead parameters.
 */

function setNoteHead(note: Note, noteheadFilled: string): void {
    if (noteheadFilled === 'no') {
        note.setHeadType(NoteHeadType.HEAD_HALF)
    } else if (noteheadFilled === 'yes') {
        note.setHeadType(NoteHeadType.HEAD_QUARTER)
    }
}

//---------------------------------------------------------
//   computeBeamMode
//---------------------------------------------------------

/**
 Calculate the beam mode based on the collected beamTypes.
 */

function computeBeamMode(beamTypes: IntMap<string>): BeamMode {
    const value = (k: number): string => beamTypes.get(k) ?? ''
    // Start with uniquely-handled beam modes
    if (value(1) === 'continue'
        && value(2) === 'begin') {
        return BeamMode.BEGIN16
    } else if (value(1) === 'continue'
               && value(2) === 'continue'
               && value(3) === 'begin') {
        return BeamMode.BEGIN32
    }
    // Generic beam modes are naive to all except the first beam
    else if (value(1) === 'begin') {
        return BeamMode.BEGIN
    } else if (value(1) === 'continue') {
        return BeamMode.MID
    } else if (value(1) === 'end') {
        return BeamMode.END
    } else {
        // backward-hook, forward-hook, and other unknown combinations
        return BeamMode.AUTO
    }
}

//---------------------------------------------------------
//   addFiguredBassElements
//---------------------------------------------------------

/**
 Add the figured bass elements.
 */

function addFiguredBassElements(fbl: FiguredBassList, noteStartTime: Fraction, msTrack: number, dura: Fraction,
    measure: Measure): void {
    if (fbl.length) {
        let sTick = noteStartTime                  // starting tick
        for (const fb of fbl as FiguredBass[]) {
            fb.setTrack(msTrack)
            // No duration tag defaults ticks() to 0; set to note value
            if (fb.ticks().isZero()) {
                fb.setTicks(dura)
            }
            // TODO: set correct onNote value
            const s = measure.getSegment(SegmentType.ChordRest, sTick)
            s.add(fb)
            sTick = sTick.plus(fb.ticks())
        }
        fbl.length = 0
    }
}

//---------------------------------------------------------
//   addTremolo
//---------------------------------------------------------

function addTremolo(cr: ChordRest, tremoloNr: number, tremoloType: string, smufl: string, color: Color, tremStart: Ref<Chord | null>,
    logger: MusicXmlLogger, xmlreader: XmlStreamReader | null, timeMod: Ref<Fraction>): void {
    if (!cr.isChord()) {
        return
    }
    const chord = cr as Chord
    if (tremoloNr) {
        if (tremoloNr === 1 || tremoloNr === 2 || tremoloNr === 3 || tremoloNr === 4) {
            if (tremoloType === '' || tremoloType === 'single') {
                let type = TremoloType.INVALID_TREMOLO as TremoloType
                switch (tremoloNr as number) {
                case 1: type = TremoloType.R8
                    break
                case 2: type = TremoloType.R16
                    break
                case 3: type = TremoloType.R32
                    break
                case 4: type = TremoloType.R64
                    break
                }

                if (type !== TremoloType.INVALID_TREMOLO) {
                    const tremolo = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, chord) as TremoloSingleChord
                    tremolo.setTremoloType(type)
                    colorItem(tremolo, color)
                    cr.add(tremolo)
                }
            } else if (tremoloType === 'start') {
                if (tremStart.v) {
                    logger.logError('MusicXml::import: double tremolo start', xmlreader)
                }
                tremStart.v = chord
                // timeMod takes into account also the factor 2 of a two-note tremolo
                if (timeMod.v.isValid() && ((timeMod.v.denominator() % 2) === 0)) {
                    timeMod.v = new Fraction(timeMod.v.numerator(), timeMod.v.denominator() / 2)
                }
            } else if (tremoloType === 'stop') {
                if (tremStart.v) {
                    let type = TremoloType.INVALID_TREMOLO as TremoloType
                    switch (tremoloNr as number) {
                    case 1: type = TremoloType.C8
                        break
                    case 2: type = TremoloType.C16
                        break
                    case 3: type = TremoloType.C32
                        break
                    case 4: type = TremoloType.C64
                        break
                    }

                    if (type !== TremoloType.INVALID_TREMOLO) {
                        const tremolo = Factory.createItem(ElementType.TREMOLO_TWOCHORD, chord) as TremoloTwoChord
                        tremolo.setTremoloType(type)
                        colorItem(tremolo, color)
                        tremolo.setChords(tremStart.v, chord)
                        // fixup chord duration and type
                        const tremDur = cr.ticks().times(new Fraction(1, 2))
                        tremolo.chord1()!.setDurationType(tremDur)
                        tremolo.chord1()!.setTicks(tremDur)
                        tremolo.chord2()!.setDurationType(tremDur)
                        tremolo.chord2()!.setTicks(tremDur)
                        // add tremolo to first chord (only)
                        tremStart.v.add(tremolo)
                    }
                    // timeMod takes into account also the factor 2 of a two-note tremolo
                    if (timeMod.v.isValid() && ((timeMod.v.denominator() % 2) === 0)) {
                        timeMod.v = new Fraction(timeMod.v.numerator(), timeMod.v.denominator() / 2)
                    }
                } else {
                    logger.logError('MusicXml::import: double tremolo stop w/o start', xmlreader)
                }
                tremStart.v = null
            }
        } else {
            logger.logError(`unknown tremolo type ${tremoloNr}`, xmlreader)
        }
    } else if (tremoloNr === 0 && (tremoloType === 'unmeasured' || tremoloType === '' || smufl === 'buzzRoll')) {
        // Out of all the SMuFL unmeasured tremolos, we only support 'buzzRoll'
        const tremolo = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, chord) as TremoloSingleChord
        tremolo.setTremoloType(TremoloType.BUZZ_ROLL)
        colorItem(tremolo, color)
        cr.add(tremolo)
    } else if (smufl !== '' && smufl !== 'buzzRoll') {
        logger.logError('MusicXml::import: only buzzRoll glyph is supported for unmeasured tremolos', xmlreader)
    }
}

//---------------------------------------------------------
//   setPitch
//---------------------------------------------------------

// TODO: refactor: optimize parameters

function setPitch(note: Note, instruments: MusicXmlInstruments, instrumentId: string, mnp: MusicXmlNotePitch, octaveShift: number,
    instrument: Instrument): void {
    if (mnp.unpitched()) {
        if (hasDrumset(instruments) && instruments.has(instrumentId)) {
            // step and oct are display-step and ...-oct
            // get pitch from instrument definition in drumset instead
            const unpitched = instruments.get(instrumentId)!.unpitched
            note.setPitch(Math.min(Math.max(unpitched, 0), 127))
            note.setTpcFromPitch()
        } else {
            xmlSetPitch(note, mnp.displayStep(), 0, 0.0, mnp.displayOctave(), 0, instrument)
        }
    } else {
        xmlSetPitch(note, mnp.step(), mnp.alter(), mnp.tuning(), mnp.octave(), octaveShift, instrument)
    }
}

//---------------------------------------------------------
//   setDrumset
//---------------------------------------------------------

// set drumset information
// note that in MuseScore, the drumset contains defaults for notehead,
// line and stem direction, while a MusicXML file contains actuals.
// the MusicXML values for each note are simply copied to the defaults

function setDrumset(c: Chord, pass1: MusicXmlParserPass1, partId: string, instrumentId: string, noteStartTime: Fraction,
    mnp: MusicXmlNotePitch, stemDir: DirectionV, headGroup: NoteHeadGroup): void {
    // determine staff line based on display-step / -octave and clef type
    const clef = c.staff()!.clef(noteStartTime)
    const po = ClefInfo.pitchOffset(clef)
    const pitch = MusicXmlStepAltOct2Pitch(mnp.displayStep(), 0, mnp.displayOctave())
    let line = po - absStep(pitch)

    // correct for number of staff lines
    // see ExportMusicXml::unpitch2xml for explanation
    // TODO handle other # staff lines ?
    const staffLines = c.staff()!.lines(new Fraction(0, 1))
    if (staffLines === 1) {
        line -= 8
    }
    if (staffLines === 3) {
        line -= 2
    }

    // the drum palette cannot handle stem direction AUTO,
    // overrule if necessary
    let overruledStemDir = stemDir
    if (stemDir === DirectionV.AUTO) {
        if (line > 4) {
            overruledStemDir = DirectionV.DOWN
        } else {
            overruledStemDir = DirectionV.UP
        }
    }
    // this should be done in pass 1, would make _pass1 const here
    pass1.setDrumsetDefault(partId, instrumentId, headGroup, line, overruledStemDir)
}

/** C++ DrumInstrument(name, notehead, line, stemDirection, voice) */
function makeDrumInstrument(name: string, notehead: NoteHeadGroup, line: number, stemDirection: DirectionV, voice: number): DrumInstrument {
    const d = new DrumInstrument()
    d.name = name
    d.notehead = notehead
    d.line = line
    d.stemDirection = stemDirection
    d.voice = voice
    return d
}

/** std::round (half away from zero) */
function stdRound(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

function MusicXml2Modifier(prefix: string): FiguredBassModifier {
    if (prefix === 'sharp') {
        return FiguredBassModifier.SHARP
    } else if (prefix === 'flat') {
        return FiguredBassModifier.FLAT
    } else if (prefix === 'natural') {
        return FiguredBassModifier.NATURAL
    } else if (prefix === 'double-sharp') {
        return FiguredBassModifier.DOUBLESHARP
    } else if (prefix === 'flat-flat') {
        return FiguredBassModifier.DOUBLEFLAT
    } else if (prefix === 'sharp-sharp') {
        return FiguredBassModifier.DOUBLESHARP
    } else if (prefix === 'cross') {
        return FiguredBassModifier.CROSS
    } else if (prefix === 'backslash') {
        return FiguredBassModifier.BACKSLASH
    } else if (prefix === 'slash') {
        return FiguredBassModifier.SLASH
    } else {
        return FiguredBassModifier.NONE
    }
}

//---------------------------------------------------------
//   addSlur
//---------------------------------------------------------

function addSlur(notation: Notation, slurs: SlurStack, cr: ChordRest, note: Note | null, tick: Fraction,
    logger: MusicXmlLogger, xmlreader: XmlStreamReader | null): void {
    let slurNo = strToInt(notation.attribute('number'))
    if (slurNo > 0) {
        slurNo--
    }
    const slurType = notation.attribute('type')

    const track = cr.track()
    const score = cr.score()

    // PriMus Music-Notation by Columbussoft (build 10093) generates overlapping
    // slurs that do not have a number attribute to distinguish them.
    // The duplicates must be ignored, to prevent memory allocation issues,
    // which caused a MuseScore crash
    // Similar issues happen with Sibelius 7.1.3 (direct export)

    if (slurType === 'start') {
        if (slurs[slurNo].isStart()) {
            // slur start when slur already started: report error
            logger.logError('ignoring duplicate slur start', xmlreader)
        } else if (slurs[slurNo].isStop()) {
            // slur start when slur already stopped: wrap up
            const newSlur = slurs[slurNo].slur()!
            slurs[slurNo] = new SlurDesc()

            if (newSlur.endElement() === cr && note) {
                // Slur starts & ends on same chord - add lv instead
                const lvTie = Factory.createItem(ElementType.LAISSEZ_VIB, note) as LaissezVib
                lvTie.setParent(note)
                note.score().undoAddElement(lvTie)
                return
            }
            const tick2 = newSlur.endElement()!.tick()
            if (tick2.lt(tick)) {
                logger.logError('slur end is before slur start', xmlreader)
                return
            }
            newSlur.setTrack(track)
            newSlur.setTick(tick)
            newSlur.setStartElement(cr)
            newSlur.setTick2(tick2)
            score.addElement(newSlur)
        } else {
            // slur start for new slur: init
            const newSlur = notation.name() === 'slur'
                ? Factory.createItem(ElementType.SLUR, scoreDummy(score)) as Slur
                : Factory.createItem(ElementType.HAMMER_ON_PULL_OFF, scoreDummy(score)) as Slur
            if (cr.isGrace()) {
                newSlur.setAnchor(SpannerAnchor.CHORD)
            }
            const lineType = notation.attribute('line-type')
            if (lineType === 'dashed') {
                newSlur.setStyleType(SlurStyleType.Dashed)
            } else if (lineType === 'dotted') {
                newSlur.setStyleType(SlurStyleType.Dotted)
            } else if (lineType === 'solid' || !lineType) {
                newSlur.setStyleType(SlurStyleType.Solid)
            }
            newSlur.setVisible(notation.visible())
            colorItem(newSlur, Color.fromString(notation.attribute('color')))
            newSlur.setTick(tick)
            newSlur.setStartElement(cr)
            if (musicXmlImportConfiguration().importLayout()) {
                const orientation = notation.attribute('orientation')
                const placement = notation.attribute('placement')
                if (orientation === 'over' || placement === 'above') {
                    newSlur.setSlurDirection(DirectionV.UP)
                } else if (orientation === 'under' || placement === 'below') {
                    newSlur.setSlurDirection(DirectionV.DOWN)
                } else if (orientation || placement) {
                    logger.logError(`unknown slur orientation/placement: ${orientation}/${placement}`, xmlreader)
                }
            }
            newSlur.setTrack(track)
            newSlur.setTrack2(track)
            slurs[slurNo].start(newSlur)
        }
    } else if (slurType === 'stop') {
        if (slurs[slurNo].isStart()) {
            // slur stop when slur already started: wrap up
            const newSlur = slurs[slurNo].slur()!
            slurs[slurNo] = new SlurDesc()

            if (newSlur.startElement() === cr && note) {
                // Slur starts & ends on same chord - add lv instead
                const lvTie = Factory.createItem(ElementType.LAISSEZ_VIB, note) as LaissezVib
                lvTie.setParent(note)
                note.score().undoAddElement(lvTie)
                return
            }

            if (!(cr.isGrace())) {
                newSlur.setTick2(tick)
                newSlur.setTrack2(track)
            }
            newSlur.setEndElement(cr)
            score.addElement(newSlur)
        } else if (slurs[slurNo].isStop()) {
            // slur stop when slur already stopped: report error
            logger.logError('ignoring duplicate slur stop', xmlreader)
        } else {
            // slur stop for new slur: init
            const newSlur = Factory.createItem(ElementType.SLUR, scoreDummy(score)) as Slur
            if (!(cr.isGrace())) {
                newSlur.setTrack2(track)
            }
            newSlur.setEndElement(cr)
            slurs[slurNo].stop(newSlur)
        }
    } else if (slurType === 'continue') {
        // ignore
    } else {
        logger.logError(`unknown slur type ${slurType}`, xmlreader)
    }
}

//---------------------------------------------------------
//   addGlissandoSlide
//---------------------------------------------------------

function addGlissandoSlide(notation: Notation, note: Note, glissandi: GlissandoStack, spanners: MusicXmlSpannerMap,
    logger: MusicXmlLogger, xmlreader: XmlStreamReader | null): void {
    let glissandoNumber = strToInt(notation.attribute('number'))
    if (glissandoNumber > 0) {
        glissandoNumber--
    }
    const glissandoType = notation.attribute('type')
    const glissandoTag = notation.name() !== 'slide'
    const lineType = notation.attribute('line-type')
    // C++ Glissando*& gliss = glissandi[glissandoNumber][glissandoTag]
    const glissIdx = glissandoTag ? 1 : 0
    const glissRow = glissandi[glissandoNumber]
    const gliss = glissRow[glissIdx]

    const tick = note.tick()
    const track = note.track()

    if (glissandoType === 'start') {
        const glissandoText = notation.text()
        if (gliss) {
            logger.logError(`overlapping glissando/slide number ${glissandoNumber + 1}`, xmlreader)
        } else if (!note) {
            logger.logError(`no note for glissando/slide number ${glissandoNumber + 1} start`, xmlreader)
        } else {
            const g = Factory.createItem(ElementType.GLISSANDO, note) as Glissando
            glissRow[glissIdx] = g
            g.setAnchor(SpannerAnchor.NOTE)
            g.setStartElement(note)
            g.setTick(tick)
            g.setTrack(track)
            g.setParent(note)
            g.setVisible(notation.visible())
            colorItem(g, Color.fromString(notation.attribute('color')))
            if (lineType === 'dashed') {
                g.setLineStyle(LineType.DASHED)
            } else if (lineType === 'dotted') {
                g.setLineStyle(LineType.DOTTED)
            } else if (lineType === 'solid' || !lineType) {
                g.setLineStyle(LineType.SOLID)
            }
            g.setText(glissandoText)
            g.setGlissandoType(glissandoTag || (lineType === 'wavy') ? GlissandoType.WAVY : GlissandoType.STRAIGHT)
            g.setGlissandoStyle(note.part()!.instrument(tick)!.glissandoStyle())
            spanners.set(g, [tick.ticks(), -1])
        }
    } else if (glissandoType === 'stop') {
        if (!gliss) {
            logger.logError(`glissando/slide number ${glissandoNumber + 1} stop without start`, xmlreader)
        } else if (!note) {
            logger.logError(`no note for glissando/slide number ${glissandoNumber + 1} stop`, xmlreader)
        } else if (gliss.tick().eq(tick)) {
            // A gliss starting and ending on the same tick is a fall
            const cl = Factory.createItem(ElementType.CHORDLINE, note.chord()) as ChordLine
            cl.setChordLineType(ChordLineType.FALL)
            cl.setWavy(gliss.glissandoType() === GlissandoType.WAVY ? true : false)
            cl.setStraight(true)
            cl.setParent(note)
            note.chord().add(cl)
            spanners.delete(gliss)
            glissRow[glissIdx] = null
        } else {
            // Remove glissandos longer than 16 beats
            const len = tick.plus(note.chord().ticks()).minus(gliss.tick())
            if (len.ge(new Fraction(4, 1))) {
                logger.logError(`glissando/slide number ${glissandoNumber + 1} too long (${len.ticks()})`, xmlreader)
                spanners.delete(gliss)
            } else {
                const e = spanners.get(gliss) ?? [0, 0]
                e[1] = tick.ticks() + note.chord().ticks().ticks()
                spanners.set(gliss, e)
                gliss.setEndElement(note)
                gliss.setTick2(tick)
                gliss.setTrack2(track)
            }
            glissRow[glissIdx] = null
        }
    } else {
        logger.logError(`unknown glissando/slide type ${glissandoType}`, xmlreader)
    }
}

//---------------------------------------------------------
//   addArpeggio
//---------------------------------------------------------

function addArpeggio(cr: ChordRest, arpeggioTypeIn: string, arpeggioNo: number, arpeggioColor: Color,
    arpMap: ArpeggioMap, delayedArps: DelayedArpMap): void {
    let arpeggioType = arpeggioTypeIn
    if (cr.isRest() && arpeggioType) {
        // If the arpeggio is attached to a rest, store to add to the next available chord
        const delayedArp = new DelayedArpeggio(arpeggioType, arpeggioNo)
        delayedArps.insert(cr.tick().ticks(), delayedArp)
    } else {
        // Retrieve stored arpeggio to add to this chord
        const delayedArp = delayedArps.get(cr.tick().ticks()) ?? new DelayedArpeggio('', 0)
        if (delayedArp.m_arpeggioType) {
            arpeggioType = delayedArp.m_arpeggioType
            arpeggioNo = delayedArp.m_arpeggioNo
            delayedArps.erase(cr.tick().ticks())
        }
    }

    // If no current arpeggio with same number add new
    // If not, expand span
    // no support for arpeggio on rest
    const arps = arpMap.values(cr.tick().ticks())
    let curArp: Arpeggio | null = null
    for (const arp of arps) {
        if (arp.no === arpeggioNo) {
            curArp = arp.arp
        }
    }

    if (curArp) {
        const chordTrack = cr.track()
        const arpTrack = curArp.track()
        const span = cr.track() - curArp.track()
        if (chordTrack > arpTrack && span !== 0) {
            curArp.setSpan(span + 1)
        }
    } else {
        if (arpeggioType && cr.isChord()) {
            const arpeggio = Factory.createItem(ElementType.ARPEGGIO, cr) as Arpeggio
            arpeggio.setArpeggioType(ArpeggioType.NORMAL)
            if (arpeggioType === 'up') {
                arpeggio.setArpeggioType(ArpeggioType.UP)
            } else if (arpeggioType === 'down') {
                arpeggio.setArpeggioType(ArpeggioType.DOWN)
            } else if (arpeggioType === 'non-arpeggiate') {
                arpeggio.setArpeggioType(ArpeggioType.BRACKET)
            }
            colorItem(arpeggio, arpeggioColor)
            // there can be only one
            if (!(cr as unknown as Chord).arpeggio()) {
                cr.add(arpeggio)

                const arpDesc = new MusicXmlArpeggioDesc(arpeggio, arpeggioNo)
                arpMap.insert(cr.tick().ticks(), arpDesc)
            }
        }
    }
}

//---------------------------------------------------------
//   addTie
//---------------------------------------------------------

function addTie(notation: Notation, note: Note | null, track: track_idx_t, ties: MusicXmlTieMap,
    unstartedTieNotes: Note[], unendedTieNotes: Note[], logger: MusicXmlLogger, xmlreader: XmlStreamReader | null): void {
    if (!note) {
        return
    }

    const type = notation.attribute('type')
    const orientation = notation.attribute('orientation')
    const placement = notation.attribute('placement')
    const lineType = notation.attribute('line-type')

    const loc: TieLocation = [note.pitch(), note.track()]

    if (!type) {
        // ignore, nothing to do
    } else if (type === 'start') {
        const activeTie = ties.get(loc) ?? null
        if (activeTie) {
            logger.logError('Tie already active', xmlreader)
            unendedTieNotes.push(activeTie.startNote()!)
            ties.erase(loc)
        }
        const currTie = Factory.createItem(ElementType.TIE, note) as Tie
        ties.set(loc, currTie)
        note.setTieFor(currTie)
        currTie.setStartNote(note)
        currTie.setTrack(track)
        currTie.setVisible(notation.visible())
        colorItem(currTie, Color.fromString(notation.attribute('color')))

        if (musicXmlImportConfiguration().importLayout()) {
            if (orientation === 'over' || placement === 'above') {
                currTie.setSlurDirection(DirectionV.UP)
            } else if (orientation === 'under' || placement === 'below') {
                currTie.setSlurDirection(DirectionV.DOWN)
            } else if (orientation || placement) {
                logger.logError(`unknown tied orientation/placement: ${orientation}/${placement}`, xmlreader)
            }
        }

        if (lineType === 'dashed') {
            currTie.setStyleType(SlurStyleType.Dashed)
        } else if (lineType === 'dotted') {
            currTie.setStyleType(SlurStyleType.Dotted)
        } else if (lineType === 'solid' || !lineType) {
            currTie.setStyleType(SlurStyleType.Solid)
        }
    } else if (type === 'stop') {
        const currTie = ties.get(loc) ?? null
        if (currTie) {
            const startNote = currTie.startNote()
            const startChord = startNote ? startNote.chord() : null
            const endChord = note.chord()
            const startMeasure = startChord ? startChord.measure() : null
            if (startMeasure === endChord.measure()
                || (startChord && startChord.tick().plus(startChord.measure()!.ticks()).ge(endChord.tick()))) {
                // only connect if they're in the same bar or no further than a full measure apart
                currTie.setEndNote(note)
                note.setTieBack(currTie)
            } else {
                logger.logError('Intervening note in voice', xmlreader)
                unstartedTieNotes.push(note)
                unendedTieNotes.push(currTie.startNote()!)
            }
            ties.erase(loc)
        } else {
            unstartedTieNotes.push(note)
            logger.logError('Non-started tie terminated. No-op.', xmlreader)
        }
    } else if (type === 'let-ring') {
        const lvTie = Factory.createItem(ElementType.LAISSEZ_VIB, note) as LaissezVib
        lvTie.setParent(note)
        lvTie.setVisible(notation.visible())
        colorItem(lvTie, Color.fromString(notation.attribute('color')))

        if (musicXmlImportConfiguration().importLayout()) {
            if (orientation === 'over' || placement === 'above') {
                lvTie.setSlurDirection(DirectionV.UP)
            } else if (orientation === 'under' || placement === 'below') {
                lvTie.setSlurDirection(DirectionV.DOWN)
            } else if (orientation || placement) {
                logger.logError(`unknown tied orientation/placement: ${orientation}/${placement}`, xmlreader)
            }
        }

        if (lineType === 'dashed') {
            lvTie.setStyleType(SlurStyleType.Dashed)
        } else if (lineType === 'dotted') {
            lvTie.setStyleType(SlurStyleType.Dotted)
        } else if (lineType === 'solid' || !lineType) {
            lvTie.setStyleType(SlurStyleType.Solid)
        }

        note.score().undoAddElement(lvTie)
    } else {
        logger.logError(`unknown tied type ${type}`, xmlreader)
    }
}

//---------------------------------------------------------
//   addWavyLine
//---------------------------------------------------------

function addWavyLine(cr: ChordRest, tick: Fraction, wavyLineNo: number, wavyLineType: string, spanners: MusicXmlSpannerMap,
    trills: TrillStack, logger: MusicXmlLogger, xmlreader: XmlStreamReader | null): void {
    if (wavyLineType) {
        const ticks = cr.ticks()
        const track = cr.track()
        // C++ Trill*& trill = trills[wavyLineNo]
        const trill = trills[wavyLineNo]
        if (wavyLineType === 'start' || wavyLineType === 'startstop') {
            if (trill) {
                logger.logError(`overlapping wavy-line number ${wavyLineNo + 1}`, xmlreader)
            } else {
                const t = Factory.createItem(ElementType.TRILL, scoreDummy(cr.score())) as Trill
                trills[wavyLineNo] = t
                t.setTrack(track)
                t.setTrack2(track)

                t.setOrnament(Factory.createItem(ElementType.ORNAMENT, cr) as Ornament)
                t.ornament()!.setAnchor(ArticulationAnchor.AUTO)

                if (wavyLineType === 'start') {
                    spanners.set(t, [tick.ticks(), -1])
                }
                if (wavyLineType === 'startstop') {
                    spanners.set(t, [tick.ticks(), tick.ticks() + ticks.ticks()])
                    trills[wavyLineNo] = null
                }
            }
        } else if (wavyLineType === 'stop') {
            if (!trill) {
                logger.logError(`wavy-line number ${wavyLineNo + 1} stop without start`, xmlreader)
            } else {
                const e = spanners.get(trill) ?? [0, 0]
                e[1] = tick.ticks() + ticks.ticks()
                spanners.set(trill, e)
                trills[wavyLineNo] = null
            }
        } else {
            logger.logError(`unknown wavy-line type ${wavyLineType}`, xmlreader)
        }
    }
}

//---------------------------------------------------------
//   addBreath
//---------------------------------------------------------

function addBreath(notation: Notation, cr: ChordRest): void {
    const breath = notation.symId()
    const placement = notation.attribute('placement')

    const seg = cr.measure()!.getSegment(SegmentType.Breath, cr.tick().plus(cr.ticks()))
    const b = Factory.createItem(ElementType.BREATH, seg) as Breath
    // b->setTrack(trk + voice); TODO check next line
    b.setTrack(cr.track())
    b.setSymId(breath)
    b.setVisible(notation.visible())
    b.setPlacement(placement === 'below' ? PlacementV.BELOW : PlacementV.ABOVE)
    b.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
    colorItem(b, Color.fromString(notation.attribute('color')))
    seg.add(b)
}

//---------------------------------------------------------
//   addChordLine
//---------------------------------------------------------

function addChordLine(notation: Notation, note: Note | null, logger: MusicXmlLogger, xmlreader: XmlStreamReader | null): void {
    const chordLineType = notation.subType()
    const lineType = notation.attribute('line-type')
    const lineShape = notation.attribute('line-shape')
    if (chordLineType) {
        if (note) {
            const chordline = Factory.createItem(ElementType.CHORDLINE, note.chord()) as ChordLine
            if (chordLineType === 'falloff') {
                chordline.setChordLineType(ChordLineType.FALL)
            } else if (chordLineType === 'doit') {
                chordline.setChordLineType(ChordLineType.DOIT)
            } else if (chordLineType === 'plop') {
                chordline.setChordLineType(ChordLineType.PLOP)
            } else if (chordLineType === 'scoop') {
                chordline.setChordLineType(ChordLineType.SCOOP)
            }
            if (lineShape === 'straight') {
                chordline.setStraight(true)
            }
            if (lineType === 'wavy') {
                chordline.setWavy(true)
            } else if (lineType && lineType !== 'solid') {
                logger.logError(`unsupported line-type: ${lineType}`, xmlreader)
            }
            chordline.setVisible(notation.visible())
            colorItem(chordline, Color.fromString(notation.attribute('color')))
            note.chord().add(chordline)
        } else {
            logger.logError(`no note for ${chordLineType}`, xmlreader)
        }
    }
}
