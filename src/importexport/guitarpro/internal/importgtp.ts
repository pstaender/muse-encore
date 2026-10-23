/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importgtp.h/.cpp: the GuitarPro base class (binary reading helpers,
 * shared element creation), the readers of Guitar Pro 1, 2 and 3 files and importGTP (the dispatch by file header and
 * the post processing; importGTP is in importgtpmain.ts, which imports the readers of the other versions). The file
 * is a Buffer (C++ IODevice); reading past its end reads zeros (C++ leaves the bytes
 * of the target uninitialized).
 */

import type { Buffer } from '../../../framework/global/io/buffer'
import { Err } from '../../../engraving/engravingerrors'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { Arpeggio } from '../../../engraving/dom/arpeggio'
import { Articulation, ArticulationAnchor } from '../../../engraving/dom/articulation'
import type { Chord } from '../../../engraving/dom/chord'
import type { ChordLine } from '../../../engraving/dom/chordline'
import { NoteType, type ChordRest } from '../../../engraving/dom/chordrest'
import type { Clef } from '../../../engraving/dom/clef'
import { Dynamic } from '../../../engraving/dom/dynamic'
import type { EngravingItem } from '../../../engraving/dom/engravingitem'
import { Factory } from '../../../engraving/dom/factory'
import { Glissando } from '../../../engraving/dom/glissando'
import type { Hairpin } from '../../../engraving/dom/hairpin'
import { Harmony } from '../../../engraving/dom/harmony'
import type { KeySig } from '../../../engraving/dom/keysig'
import type { Lyrics } from '../../../engraving/dom/lyrics'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import type { Measure } from '../../../engraving/dom/measure'
import { Repeat } from '../../../engraving/dom/measurebase'
import type { Note } from '../../../engraving/dom/note'
import type { NoteDot } from '../../../engraving/dom/notedot'
import type { Ottava } from '../../../engraving/dom/ottava'
import { Part } from '../../../engraving/dom/part'
import { Pid, PropertyFlags } from '../../../engraving/dom/property'
import { RehearsalMark } from '../../../engraving/dom/rehearsalmark'
import type { Rest } from '../../../engraving/dom/rest'
import { SegmentType, type Segment } from '../../../engraving/dom/segment'
import type { Slur } from '../../../engraving/dom/slur'
import { SpannerAnchor } from '../../../engraving/dom/spanner'
import { StaffText } from '../../../engraving/dom/stafftextbase'
import { StaffType, StaffTypes } from '../../../engraving/dom/stafftype'
import { StringData } from '../../../engraving/dom/stringdata'
import type { Tapping } from '../../../engraving/dom/tapping'
import type { TempoText } from '../../../engraving/dom/tempotext'
import type { Tie } from '../../../engraving/dom/tie'
import type { TimeSig } from '../../../engraving/dom/timesig'
import { TupletNumberType, type Tuplet } from '../../../engraving/dom/tuplet'
import { Volta } from '../../../engraving/dom/volta'
import { TDuration } from '../../../engraving/dom/durationtype'
import { defaultClef } from '../../../engraving/dom/instrtemplate'
import { EngravingConfiguration } from '../../../engraving/internal/engravingconfiguration'
import { XmlWriter } from '../../../engraving/rw/xmlwriter'
import { Sid } from '../../../engraving/style/styledef'
import { Constants } from '../../../engraving/types/constants'
import { Fraction } from '../../../engraving/types/fraction'
import { PitchValue } from '../../../engraving/types/pitchvalue'
import { SymId } from '../../../engraving/types/symid'
import {
    ArpeggioType, ArticulationTextType, BarLineType, ChordLineType, ClefType, DurationType, ElementType, GlissandoType, Key,
    NoteHeadGroup, TappingHand, VOICES, type staff_idx_t, type track_idx_t,
} from '../../../engraving/types/types'
import { ContiniousElementsBuilder, ContiniousElementsBuilderHarmonicMarkSubType, ContiniousElementsBuilderImportType,
    ContiniousElementsBuilderVibratoSubType } from './continiouselementsbuilder'
import { GuitarBendImporter } from './guitarbendimport/guitarbendimporter'
import * as drumset from './guitarprodrumset'
import type { IGPDomBuilder } from './gtp/igpdombuilder'

export { Err }

export const GP_MAX_LYRIC_LINES = 5
export const GP_MAX_TRACK_NUMBER = 32
export const GP_MAX_STRING_NUMBER = 7
export const GP_DEFAULT_PERCUSSION_CHANNEL = 9
export const GP_INVALID_KEYSIG = 127
export const GP_VOLTA_BINARY = 1
export const GP_VOLTA_FLAGS = 2

export class GpTrack {
    patch = 0
    // uint8_t in C++
    volume = 0
    pan = 0
    chorus = 0
    reverb = 0
    phase = 0
    tremolo = 0
}

export class GPVolta {
    voltaType = 0
    voltaInfo: number[] = []
}

/* How the fermatas are represented in Guitar Pro is two integers, the
 * first is an index value and the second is the time division that
 * index value refers to, and they are givin with respect to a
 * measure. Time division 0 means a minim, 1 is a crotchet, 2 is a
 * quaver and so on, with the index (counting from 0) referring to how
 * many time divisions occur before the fermata. These numbers are
 * separated in GP6 with a '/' character. For example, a note
 * occurring on the third beat of a measure in a 4/4 bar would be
 * represented as 2/1.
 */
export class GPFermata {
    index = 0
    timeDivision = 0
    type = ''
}

export class GPLyrics {
    lyrics: string[] = []
    segments: Segment[] = []
    lyricPos: number[] = []
    fromBeat = 0
    beatCounter = 0
    lyricTrack = 0
}

export class GpBar {
    timesig = new Fraction(4, 4)
    freeTime = false
    keysig = GP_INVALID_KEYSIG
    marker = ''
    barLine = BarLineType.NORMAL
    repeatFlags = Repeat.NONE
    repeats = 2
    volta = new GPVolta()
    direction = ''
    directionStyle = ''
    section: [string, string] = ['', '']
    directions: string[] = []
}

export enum GuitarProTabImportOption {
    STANDARD = 1,
    TAB = 2,
    BOTH = 3,
}

export interface GuitarProGPProperties {
    partsImportOptions: GuitarProTabImportOption[]
}

export class GuitarProReadNoteResult {
    slur = false
    hammerOnPullOff = false
    letRing = false
    palmMute = false
    trill = false
    vibrato = false

    /// harmonic marks
    harmonicArtificial = false
    harmonicPinch = false
    harmonicTap = false
    harmonicSemi = false
}

export enum GuitarProError {
    GP_NO_ERROR, GP_UNKNOWN_FORMAT,
    GP_EOF, GP_BAD_NUMBER_OF_STRINGS,
}

/** a GuitarProError as an exception (C++ does not throw them) */
export class GuitarProException extends Error {
    constructor(readonly error: GuitarProError) {
        super(GuitarPro.errmsg[error])
    }
}

const flatPresets = new Map<bigint, string>([
    // 63 58 54 49 44 39
    [0x3f3a36312c27n, 'Eb Ab Db Gb Bb Eb'],
    // 60 55 51 46 41 36
    [0x3c37332e2924n, 'C F Bb Eb G C'],
    // 63 58 54 49 44 37
    [0x3f3a36312c25n, 'Db Ab Db Gb Bb Eb'],
])

const s_utf8Decoder = new TextDecoder('utf-8', { fatal: true })

/** String::fromUtf8 if the bytes are valid UTF-8, else String::fromAscii */
export function fromUtf8OrAscii(bytes: Uint8Array): string {
    try {
        return s_utf8Decoder.decode(bytes)
    } catch {
        return fromAscii(bytes)
    }
}

/** muse::String::fromAscii: static_cast<char16_t>(char), char is signed (bytes >= 0x80 become 0xFF80..0xFFFF) */
function fromAscii(bytes: Uint8Array): string {
    let s = ''
    for (const b of bytes) {
        s += String.fromCharCode(b < 0x80 ? b : 0xFF00 | b)
    }
    return s
}

/** the bytes up to the first NUL (C strings) */
export function cstr(bytes: Uint8Array): Uint8Array {
    const i = bytes.indexOf(0)
    return i < 0 ? bytes : bytes.subarray(0, i)
}

function toChord(e: EngravingItem | null): Chord {
    return e as Chord
}

//---------------------------------------------------------
//   GuitarPro
//---------------------------------------------------------

export abstract class GuitarPro {
    static readonly errmsg: readonly string[] = [
        'no error',
        'unknown file format',
        'unexpected end of file',
        'bad number of strings',
    ]

    protected m_properties: GuitarProGPProperties = { partsImportOptions: [] }

    protected slideList: (Note | null)[] = [] //list of start slide notes

    // note effect bit masks
    static readonly EFFECT_BEND = 0x1
    static readonly EFFECT_STACCATO = 0x1
    static readonly EFFECT_HAMMER = 0x2
    static readonly EFFECT_PALM_MUTE = 0x2
    static readonly EFFECT_TREMOLO = 0x4
    static readonly EFFECT_LET_RING = 0x8
    static readonly EFFECT_SLIDE_OLD = 0x4
    static readonly EFFECT_SLIDE = 0x8
    static readonly EFFECT_GRACE = 0x10
    static readonly EFFECT_ARTIFICIAL_HARMONIC = 0x10
    static readonly EFFECT_TRILL = 0x20
    static readonly EFFECT_GHOST = 0x01
    static readonly EFFECT_VIBRATO = 0x40

    // arpeggio direction masks
    static readonly ARPEGGIO_UP = 0xa
    static readonly ARPEGGIO_DOWN = 0x2

    // note bit masks
    static readonly NOTE_GHOST = 0x04 // 2
    static readonly NOTE_DEAD = 0x20 //5
    static readonly NOTE_DYNAMIC = 0x10 // 4
    static readonly NOTE_FRET = 0x20 //5
    static readonly NOTE_FINGERING = 0x80 //7
    static readonly NOTE_MARCATO = 0x02 //1
    static readonly NOTE_SFORZATO = 0x40 //6
    static readonly NOTE_SLUR = 0x8 //3
    static readonly NOTE_APPOGIATURA = 0x02 //1

    // beat bit masks
    static readonly BEAT_RASGUEADO = 0x01
    static readonly BEAT_VIBRATO_TREMOLO = 0x02
    static readonly BEAT_FADE = 0x10
    static readonly BEAT_EFFECT = 0x20
    static readonly BEAT_TREMOLO = 0x04
    static readonly BEAT_ARPEGGIO = 0x40
    static readonly BEAT_STROKE_DIR = 0x02
    static readonly BEAT_DOTTED = 0x01
    static readonly BEAT_PAUSE = 0x40
    static readonly BEAT_TUPLET = 0x20
    static readonly BEAT_LYRICS = 0x4
    static readonly BEAT_EFFECTS = 0x8
    static readonly BEAT_MIX_CHANGE = 0x10
    static readonly BEAT_CHORD = 0x2

    // score bit masks
    static readonly SCORE_TIMESIG_NUMERATOR = 0x1
    static readonly SCORE_TIMESIG_DENOMINATOR = 0x2
    static readonly SCORE_REPEAT_START = 0x4
    static readonly SCORE_REPEAT_END = 0x8
    static readonly SCORE_MARKER = 0x20
    static readonly SCORE_VOLTA = 0x10
    static readonly SCORE_KEYSIG = 0x40
    static readonly SCORE_DOUBLE_BAR = 0x80

    // slide kinds
    static readonly SHIFT_SLIDE = 1
    static readonly LEGATO_SLIDE = 2
    static readonly SLIDE_OUT_DOWN = 4
    static readonly SLIDE_OUT_UP = 8
    static readonly SLIDE_IN_ABOVE = 16
    static readonly SLIDE_IN_BELOW = 32

    // harmonic mark types
    static readonly HARMONIC_MARK_NATURAL = 1
    static readonly HARMONIC_MARK_ARTIFICIAL = 2
    static readonly HARMONIC_MARK_TAP = 3
    static readonly HARMONIC_MARK_PINCH = 4
    static readonly HARMONIC_MARK_SEMI = 5

    static readonly MAX_PITCH = 127
    protected version = 0
    protected key = 0

    protected last_segment: Segment | null = null
    protected last_measure: Measure | null = null
    protected last_tempo = -1

    protected ottava: Ottava[] = [] /// will be removed
    protected hairpins: Hairpin[] = [] /// will be removed
    protected score: MasterScore
    protected f!: Buffer
    protected curPos = 0
    protected previousTempo = -1
    protected previousDynamicByTrack: number[] = []
    static readonly INVALID_DYNAMIC = -1
    static readonly DEFAULT_DYNAMIC = 0
    protected tempo = -1
    protected slides = new Map<number, number>()

    protected gpLyrics = new GPLyrics()
    protected slide = 0
    protected voltaSequence = 0
    protected slurs: (Slur | null)[] = []

    tunings: string[] = []

    title = ''
    subtitle = ''
    artist = ''
    album = ''
    composer = ''
    poet = ''
    comments: string[] = []
    channelDefaults: GpTrack[] = Array.from({ length: GP_MAX_TRACK_NUMBER * 2 }, () => new GpTrack())
    staves = 0
    measures = 0
    bars: GpBar[] = []
    m_continiousElementsBuilder!: ContiniousElementsBuilder
    m_guitarBendImporter!: GuitarBendImporter

    constructor(s: MasterScore, v: number) {
        this.score = s
        this.version = v
        this.voltaSequence = 1
        this.tempo = -1
    }

    abstract read(f: Buffer): boolean

    error(n: GuitarProError): string { return GuitarPro.errmsg[n] }

    //---------------------------------------------------------
    //   skip
    //---------------------------------------------------------

    protected skip(len: number): void {
        this.f.seek(this.f.pos() + len)
    }

    //---------------------------------------------------------
    //   createTuningString
    //---------------------------------------------------------

    protected createTuningString(strings: number, tuning: readonly number[]): boolean {
        let useFlats = false
        const tune = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        const pitch: number[] = []
        let k = 0n
        for (let i = 0; i < strings; ++i) {
            pitch.push(tuning[i])
            k |= BigInt.asUintN(64, BigInt(tuning[i]) << BigInt(8 * i))
        }
        const preset = flatPresets.get(k)
        if (preset !== undefined) {
            this.tunings.push(preset)
            useFlats = true
            return useFlats
        }
        let t = ''
        for (const i of pitch) {
            t += tune[((i % 12) + 12) % 12]
            t += ' '
        }
        this.tunings.push(t)
        return useFlats
    }

    protected initDynamics(stavesNum: number): void {
        this.previousDynamicByTrack = new Array<number>(stavesNum * VOICES).fill(GuitarPro.INVALID_DYNAMIC)
    }

    //---------------------------------------------------------
    //    read
    //---------------------------------------------------------

    /** C++ read(void* p, int64_t len): the bytes read (zeros past the end of the file) */
    protected readBytes(len: number): Uint8Array {
        const r = new Uint8Array(Math.max(0, len))
        if (len <= 0) {
            return r
        }
        r.set(this.f.read(len))
        this.curPos += len
        return r
    }

    //---------------------------------------------------------
    //   readChar
    //---------------------------------------------------------

    protected readChar(): number {
        const c = this.readBytes(1)[0]
        return c > 127 ? c - 256 : c
    }

    //---------------------------------------------------------
    //   readUInt8
    //---------------------------------------------------------

    protected readUInt8(): number {
        return this.readBytes(1)[0]
    }

    //---------------------------------------------------------
    //   readPascalString
    //---------------------------------------------------------

    protected readPascalString(n: number): string {
        const l = this.readUInt8()
        const s = this.readBytes(l)
        if (n - l > 0) {
            this.skip(n - l)
        }
        try {
            s_utf8Decoder.decode(s)
            return new TextDecoder('utf-8').decode(cstr(s))
        } catch {
            return fromAscii(s)
        }
    }

    //---------------------------------------------------------
    //   readWordPascalString
    //---------------------------------------------------------

    protected readWordPascalString(): string {
        const l = this.readInt()
        const c = this.readBytes(l)
        try {
            s_utf8Decoder.decode(c)
            return new TextDecoder('utf-8').decode(cstr(c))
        } catch {
            return fromAscii(c)
        }
    }

    //---------------------------------------------------------
    //   readBytePascalString
    //---------------------------------------------------------

    protected readBytePascalString(): string {
        const l = this.readUInt8()
        const c = this.readBytes(l)
        try {
            s_utf8Decoder.decode(c)
            return new TextDecoder('utf-8').decode(cstr(c))
        } catch {
            return fromAscii(c)
        }
    }

    //---------------------------------------------------------
    //   readDelphiString
    //---------------------------------------------------------

    protected readDelphiString(): string {
        const maxl = this.readInt()
        let l = this.readUInt8()
        if (maxl !== l + 1 && maxl > 255) {
            console.assert(false, "readDelphiString: first word doesn't match second byte")
            l = maxl - 1
        }
        const c = this.readBytes(l)
        return fromAscii(cstr(c))
    }

    //---------------------------------------------------------
    //   readInt
    //---------------------------------------------------------

    protected readInt(): number {
        const b = this.readBytes(4)
        return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24))
    }

    //---------------------------------------------------------
    //   addPalmMate
    //---------------------------------------------------------

    protected addPalmMute(cr: ChordRest, hasPalmMute: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.PALM_MUTE, ContiniousElementsBuilderImportType.PALM_MUTE,
                                                                hasPalmMute)
    }

    //---------------------------------------------------------
    //   addLetRing
    //---------------------------------------------------------

    protected addLetRing(cr: ChordRest, hasLetRing: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.LET_RING, ContiniousElementsBuilderImportType.LET_RING,
                                                                hasLetRing)
    }

    //---------------------------------------------------------
    //   addTrill
    //---------------------------------------------------------

    protected addTrill(cr: ChordRest, hasTrill: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.TRILL, ContiniousElementsBuilderImportType.TRILL, hasTrill)
    }

    //---------------------------------------------------------
    //   addHammerOnPullOff
    //---------------------------------------------------------

    protected addHammerOnPullOff(cr: ChordRest, hasHammerOnPullOff: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HAMMER_ON_PULL_OFF,
                                                                ContiniousElementsBuilderImportType.HAMMER_ON_PULL_OFF, hasHammerOnPullOff)
    }

    //---------------------------------------------------------
    //   addRasgueado
    //---------------------------------------------------------

    protected addRasgueado(cr: ChordRest, hasRasgueado: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.RASGUEADO, ContiniousElementsBuilderImportType.RASGUEADO,
                                                                hasRasgueado)
    }

    //---------------------------------------------------------
    //   addVibratoLeftHand
    //---------------------------------------------------------

    protected addVibratoLeftHand(cr: ChordRest, hasVibratoLeftHand: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
                                                                ContiniousElementsBuilderImportType.VIBRATO_LEFT_HAND_SLIGHT, hasVibratoLeftHand,
                                                                ContiniousElementsBuilderVibratoSubType.LEFT_HAND_SLIGHT)
    }

    //---------------------------------------------------------
    //   addVibratoWTremBar
    //---------------------------------------------------------

    protected addVibratoWTremBar(cr: ChordRest, hasVibratoWTremBar: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
                                                                ContiniousElementsBuilderImportType.VIBRATO_W_TREM_BAR_SLIGHT,
                                                                hasVibratoWTremBar, ContiniousElementsBuilderVibratoSubType.W_TREM_BAR_SLIGHT)
    }

    //---------------------------------------------------------
    //   addHarmonicMarks
    //---------------------------------------------------------

    protected addHarmonicMarks(cr: ChordRest, hasHarmonicArtificial: boolean, hasHarmonicPinch: boolean, hasHarmonicTap: boolean,
                               hasHarmonicSemi: boolean): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HARMONIC_MARK,
                                                                ContiniousElementsBuilderImportType.HARMONIC_ARTIFICIAL,
                                                                hasHarmonicArtificial, ContiniousElementsBuilderHarmonicMarkSubType.ARTIFICIAL)

        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HARMONIC_MARK,
                                                                ContiniousElementsBuilderImportType.HARMONIC_PINCH,
                                                                hasHarmonicPinch, ContiniousElementsBuilderHarmonicMarkSubType.PINCH)

        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HARMONIC_MARK,
                                                                ContiniousElementsBuilderImportType.HARMONIC_TAP,
                                                                hasHarmonicTap, ContiniousElementsBuilderHarmonicMarkSubType.TAP)

        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HARMONIC_MARK,
                                                                ContiniousElementsBuilderImportType.HARMONIC_SEMI,
                                                                hasHarmonicSemi, ContiniousElementsBuilderHarmonicMarkSubType.SEMI)
    }

    //---------------------------------------------------------
    //   addTap
    //---------------------------------------------------------

    protected addTap(chord: Chord): void {
        const tapping = Factory.createItem(ElementType.TAPPING, chord) as Tapping
        tapping.setTrack(chord.track())
        tapping.setHand(TappingHand.RIGHT)
        chord.add(tapping)
    }

    //---------------------------------------------------------
    //   addSlap
    //---------------------------------------------------------

    protected addSlap(note: Note): void {
        this.addTextArticulation(note, ArticulationTextType.SLAP)
    }

    //---------------------------------------------------------
    //   addPop
    //---------------------------------------------------------

    protected addPop(note: Note): void {
        this.addTextArticulation(note, ArticulationTextType.POP)
    }

    protected addTextArticulation(note: Note, type: ArticulationTextType): void {
        if (type === ArticulationTextType.NO_TEXT) {
            return
        }

        const ch = note.parent() as Chord | null
        if (ch) {
            const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this.score).chord()) as Articulation
            art.setTextType(type)
            ch.add(art)
        }
    }

    //---------------------------------------------------------
    //   addTextToNote
    //---------------------------------------------------------

    protected addTextToNote(string: string, note: Note): void {
        const segment = note.chord()!.segment()!
        const text = new StaffText(segment)

        if (string.length) {
            const useHarmony = string[string.length - 1] === '\\'
            if (useHarmony) {
                string = string.slice(0, -1)
            }
        }
        text.setPlainText(string)
        text.setTrack(note.chord()!.track())
        segment.add(text)
    }

    protected setupTupletStyle(tuplet: Tuplet): void {
        let real: boolean
        switch (tuplet.ratio().numerator()) {
        case 2: real = (tuplet.ratio().denominator() === 3)
            break
        case 3:
        case 4: real = (tuplet.ratio().denominator() === 2)
            break
        case 5:
        case 6:
        case 7: real = (tuplet.ratio().denominator() === 4)
            break
        case 9:
        case 10:
        case 11:
        case 12:
        case 13: real = (tuplet.ratio().denominator() === 8)
            break
        default: real = false
        }
        if (!real) {
            tuplet.setNumberType(TupletNumberType.SHOW_RELATION)
            tuplet.setPropertyFlags(Pid.NUMBER_TYPE, PropertyFlags.UNSTYLED)
        }
    }

    //---------------------------------------------------------
    //   setTuplet
    //---------------------------------------------------------

    protected setTuplet(tuplet: Tuplet, tuple: number): void {
        switch (tuple) {
        case 3:
            tuplet.setRatio(new Fraction(3, 2))
            break
        case 5:
            tuplet.setRatio(new Fraction(5, 4))
            break
        case 6:
            tuplet.setRatio(new Fraction(6, 4))
            break
        case 7:
            tuplet.setRatio(new Fraction(7, 4))
            break
        case 9:
            tuplet.setRatio(new Fraction(9, 8))
            break
        case 10:
            tuplet.setRatio(new Fraction(10, 8))
            break
        case 11:
            tuplet.setRatio(new Fraction(11, 8))
            break
        case 12:
            tuplet.setRatio(new Fraction(12, 8))
            break
        case 13:
            tuplet.setRatio(new Fraction(13, 8))
            break
        default:
            console.assert(false, `unsupported tuplet ${tuple}`)
        }
    }

    //---------------------------------------------------------
    //   addDynamic
    //---------------------------------------------------------

    protected addDynamic(note: Note, d: number): void {
        // guitar pro only allows their users to go from ppp to fff
        const map_dyn = ['f', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff']
        if (d < 0 || d >= map_dyn.length) {
            return
        }
        if (!note.chord()) {
            console.debug('addDynamics: No chord associated with this note')
            return
        }
        let s: Segment
        if (note.chord()!.isGrace()) {
            const parent = note.chord()!.parent() as Chord
            s = parent.segment()!
        } else {
            s = note.chord()!.segment()!
        }
        if (!s.findAnnotation(ElementType.DYNAMIC, note.staffIdx() * VOICES, note.staffIdx() * VOICES + VOICES - 1)) {
            const dyn = new Dynamic(s)
            dyn.setDynamicType(map_dyn[d])
            dyn.setTrack(note.track())
            s.add(dyn)
        }
    }

    //---------------------------------------------------------
    //   readVolta
    //---------------------------------------------------------

    protected readVolta(gpVolta: GPVolta, m: Measure): void {
        /* Volta information is at most eight bits
         * signifying which numbers should appear in the
         * volta. A single bit 1 represents we should show
         * 1, 100 represents 3, 10000 represents 6, 10101
         * represents 1,3,5 etc. */
        if (gpVolta.voltaInfo.length !== 0) {
            // we have volta information - set up a volta
            const volta = new Volta(scoreDummy(this.score))
            const endings: number[] = []
            let voltaTextString = ''
            // initialise count to 1 as the first bit processed with represent first time volta
            let count = 0
            let binaryNumber = 0
            // iterate through the volta information and determine the decimal numbers for voltas
            let iter = 0
            const end = gpVolta.voltaInfo.length
            while (iter !== end) {
                switch (gpVolta.voltaType) {
                case GP_VOLTA_FLAGS:
                    count++
                    if (gpVolta.voltaInfo[iter] === 1) { // we want this number to be displayed in the volta
                        if (!voltaTextString.length) {
                            voltaTextString += String(count)
                        } else {
                            voltaTextString += ',' + String(count)
                        }
                        // add the decimal number to the endings field of voltas as well as the text
                        endings.push(count)
                    }
                    ++iter
                    break
                case GP_VOLTA_BINARY:
                    // find the binary number in decimal
                    if (gpVolta.voltaInfo[iter] === 1) {
                        binaryNumber += Math.pow(2, count)
                    }
                    ++iter
                    if (iter === end) {
                        // display all numbers in the volta from voltaSequence to the decimal
                        while (this.voltaSequence <= binaryNumber) {
                            if (!voltaTextString.length) {
                                voltaTextString = String(this.voltaSequence)
                            } else {
                                voltaTextString += ',' + String(this.voltaSequence)
                            }
                            endings.push(this.voltaSequence)
                            this.voltaSequence++
                        }
                    }
                    count++
                    break
                default:
                    // C++ loops forever on an unknown volta type
                    ++iter
                    break
                }
            }
            volta.setEndings(endings)
            volta.setText(XmlWriter.xmlString(voltaTextString))
            volta.setTick(m.tick())
            volta.setTick2(m.endTick())
            this.score.addElement(volta)
        }
    }

    protected readBendDataFromFile(): PitchValue[] {
        const bendData: PitchValue[] = []

        this.readUInt8() // icon
        /*int amplitude =*/ this.readInt() // shown amplitude
        const numPoints = this.readInt() // the number of points in the bend

        for (let i = 0; i < numPoints; ++i) {
            const bendTime = this.readInt()
            const bendPitch = this.readInt()
            const bendVibrato = this.readUInt8()
            bendData.push(new PitchValue(bendTime, bendPitch, !!bendVibrato))
        }

        return bendData
    }

    protected createBend(note: Note, bendData: PitchValue[]): void {
        if (bendData.length < 2) {
            return
        }

        /// not adding "hold" on 0 pitch
        let maxPitch = bendData[0].pitch
        for (const pv of bendData) {
            if (pv.pitch > maxPitch) {
                maxPitch = pv.pitch
            }
        }

        if (maxPitch === 0) {
            return
        }

        this.m_guitarBendImporter.collectBend(note, bendData)
    }

    //---------------------------------------------------------
    //   readBend
    //    bend graph
    //---------------------------------------------------------

    protected readBend(note: Note): void {
        const bendData = this.readBendDataFromFile()
        this.createBend(note, bendData)
    }

    //---------------------------------------------------------
    //   readLyrics
    //---------------------------------------------------------

    protected readLyrics(): void {
        this.gpLyrics.lyricTrack = this.readInt() >>> 0 // lyric track
        this.gpLyrics.fromBeat = this.readInt() >>> 0
        this.gpLyrics.beatCounter = 0

        let lyrics = this.readWordPascalString()
        lyrics = lyrics.replaceAll('\n', ' ')
        lyrics = lyrics.replaceAll('\r', ' ')
        const sl = lyrics.split(' ')
        for (const str of sl) {
            this.gpLyrics.lyrics.push(str)
        }

        for (let i = 0; i < 4; ++i) {
            this.readInt()
            this.readWordPascalString()
        }
    }

    //---------------------------------------------------------
    //   createSlide
    //---------------------------------------------------------

    protected createSlide(sl: number, cr: ChordRest, staffIdx: number, _note: Note | null = null): void {
        // shift / legato slide
        if (sl === GuitarPro.SHIFT_SLIDE || sl === GuitarPro.LEGATO_SLIDE) {
            const s = Factory.createItem(ElementType.GLISSANDO, cr) as Glissando
            //s->setXmlText("");
            s.setGlissandoType(GlissandoType.STRAIGHT)
            cr.add(s)
            s.setAnchor(SpannerAnchor.NOTE)
            const prevSeg = cr.segment()!.prev1(SegmentType.ChordRest)!
            const prevElem = prevSeg.element(staffIdx)
            if (prevElem) {
                if (prevElem.isChord()) {
                    const prevChord = toChord(prevElem)
                    /** TODO we should not just take the top note here
                    * but the /correct/ note need to check whether GP
                    * supports multi-note gliss. I think it can in modern
                    * versions */
                    s.setStartElement(prevChord.upNote())
                    s.setTick(prevSeg.tick())
                    s.setTrack(staffIdx)
                    s.setParent(prevChord.upNote())
                    s.setText('')
                    s.setGlissandoType(GlissandoType.STRAIGHT)
                    s.setGlissandoShift(sl === GuitarPro.SHIFT_SLIDE)
                    s.setGlissandoStyle(s.part()!.instrument(s.tick()).glissandoStyle())

                    if (sl === GuitarPro.LEGATO_SLIDE) {
                        this.createSlur(true, staffIdx, prevChord)
                    }
                }
            }

            const chord = cr as Chord
            /* TODO again here, we should not just set the up note but the
             * /correct/ note need to check whether GP supports
             * multi-note gliss. I think it can in modern versions */
            s.setEndElement(chord.upNote())
            s.setTick2(chord.segment()!.tick())
            s.setTrack2(staffIdx)
            this.score.addElement(s)
            if (sl === GuitarPro.LEGATO_SLIDE) {
                this.createSlur(false, staffIdx, cr)
            }
        }
        // slide out downwards (fall)
        if (sl & GuitarPro.SLIDE_OUT_DOWN) {
            const sld = Factory.createItem(ElementType.CHORDLINE, cr) as ChordLine
            sld.setChordLineType(ChordLineType.FALL)
            cr.add(sld)
        }
        // slide out upwards (doit)
        if (sl & GuitarPro.SLIDE_OUT_UP) {
            const slu = Factory.createItem(ElementType.CHORDLINE, cr) as ChordLine
            slu.setChordLineType(ChordLineType.DOIT)
            cr.add(slu)
        }
        // slide in from below (plop)
        if (sl & GuitarPro.SLIDE_IN_BELOW) {
            const slb = Factory.createItem(ElementType.CHORDLINE, cr) as ChordLine
            slb.setChordLineType(ChordLineType.PLOP)
            cr.add(slb)
        }
        // slide in from above (scoop)
        if (sl & GuitarPro.SLIDE_IN_ABOVE) {
            const sla = Factory.createItem(ElementType.CHORDLINE, cr) as ChordLine
            sla.setChordLineType(ChordLineType.SCOOP)
            cr.add(sla)
        }
    }

    /** reads the channel defaults; the uint8_t members wrap like in C++ */
    private readChannelDefault(i: number): void {
        const cd = this.channelDefaults[i]
        cd.patch = this.readInt()
        cd.volume = (this.readUInt8() * 8 - 1) & 0xFF
        cd.pan = (this.readUInt8() * 8 - 1) & 0xFF
        cd.chorus = (this.readUInt8() * 8 - 1) & 0xFF
        cd.reverb = (this.readUInt8() * 8 - 1) & 0xFF
        cd.phase = (this.readUInt8() * 8 - 1) & 0xFF
        cd.tremolo = (this.readUInt8() * 8 - 1) & 0xFF
    }

    /** the channel defaults of GP2/GP3 (read inline in C++) */
    protected readChannelDefaults(): void {
        for (let i = 0; i < GP_MAX_TRACK_NUMBER * 2; ++i) {
            this.readChannelDefault(i)
            this.readUInt8() // padding
            this.readUInt8()
        }
    }

    //---------------------------------------------------------
    //   readChannels
    //---------------------------------------------------------

    protected readChannels(): void {
        for (let i = 0; i < GP_MAX_TRACK_NUMBER * 2; ++i) {
            this.readChannelDefault(i)
            const cd = this.channelDefaults[i]

            // defaults of 255, or any value above 127, are set to 0 (Musescore range is 0-127)
            if (cd.patch > 127) {
                cd.patch = 0
            }
            if (cd.volume > 127) {
                cd.volume = 0
            }
            if (cd.pan > 127) {
                cd.pan = 0
            }
            if (cd.chorus > 127) {
                cd.chorus = 0
            }
            if (cd.reverb > 127) {
                cd.reverb = 0
            }
            if (cd.phase > 127) {
                cd.phase = 0
            }
            if (cd.tremolo > 127) {
                cd.tremolo = 0
            }

            // skip over blank information included for backwards compatibility with 3.0
            this.skip(2)
        }
    }

    //---------------------------------------------------------
    //   len2fraction
    //---------------------------------------------------------

    protected len2fraction(len: number): Fraction {
        switch (len) {
        case -2: return new Fraction(1, 1)
        case -1: return new Fraction(1, 2)
        case 0: return new Fraction(1, 4)
        case 1: return new Fraction(1, 8)
        case 2: return new Fraction(1, 16)
        case 3: return new Fraction(1, 32)
        case 4: return new Fraction(1, 64)
        case 5: return new Fraction(1, 128)
        // set to len - in some cases we get whacky numbers for this (40, 28...)
        default:
            return new Fraction(1, len)
        }
    }

    //---------------------------------------------------------
    //   readMixChange
    //---------------------------------------------------------

    protected readMixChange(measure: Measure): boolean {
        /*char patch   =*/
        this.readChar()
        const volume = this.readChar()
        const pan = this.readChar()
        const chorus = this.readChar()
        const reverb = this.readChar()
        const phase = this.readChar()
        const tremolo = this.readChar()
        const temp = this.readInt()

        if (volume >= 0) {
            this.readChar()
        }
        if (pan >= 0) {
            this.readChar()
        }
        if (chorus >= 0) {
            this.readChar()
        }
        if (reverb >= 0) {
            this.readChar()
        }
        if (phase >= 0) {
            this.readChar()
        }
        if (tremolo >= 0) {
            this.readChar()
        }
        if (temp >= 0) {
            if (temp !== this.previousTempo) {
                this.previousTempo = temp
                this.setTempo(temp, measure)
            }
            this.readChar()
        }
        return true
    }

    //---------------------------------------------------------
    //   createMeasures
    //---------------------------------------------------------

    protected createMeasures(): void {
        let tick = new Fraction(0, 1)
        let ts = new Fraction(0, 1)

        //      for (int i = 0; i < measures; ++i) {
        for (let i = 0; i < this.bars.length; ++i) { // ?? (ws)
            const nts = this.bars[i].timesig
            const m = Factory.createItem(ElementType.MEASURE, scoreDummy(this.score).system()) as Measure
            m.setTick(tick)
            m.setTimesig(nts)
            m.setTicks(nts)

            if (i === 0 || ts.numerator() !== nts.numerator() || ts.denominator() !== nts.denominator()) {
                for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                    const staff = this.score.staff(staffIdx)!
                    const staffType = staff.staffType(new Fraction(0, 1)) // at tick 0
                    if (staffType.genTimesig()) {
                        const s = m.getSegment(SegmentType.TimeSig, tick)
                        const t = Factory.createItem(ElementType.TIMESIG, s) as TimeSig
                        t.setTrack(staffIdx * VOICES)
                        t.setSig(nts)
                        s.add(t)
                    }
                }
            }
            if (i === 0 || (this.bars[i].keysig !== GP_INVALID_KEYSIG)) {
                for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                    const keysig = this.bars[i].keysig !== GP_INVALID_KEYSIG ? this.bars[i].keysig : this.key
                    if (tick.isZero() || this.score.staff(staffIdx)!.key(tick) !== keysig as Key) {
                        const s = m.getSegment(SegmentType.KeySig, tick)
                        const t = Factory.createItem(ElementType.KEYSIG, s) as KeySig
                        t.setKey(keysig as Key)
                        t.setTrack(staffIdx * VOICES)
                        s.add(t)
                    }
                }
            }
            this.readVolta(this.bars[i].volta, m)
            m.setRepeatEnd(this.bars[i].repeatFlags === Repeat.END)
            m.setRepeatStart(this.bars[i].repeatFlags === Repeat.START)
            m.setRepeatJump(this.bars[i].repeatFlags === Repeat.JUMP)
            //            m->setRepeatFlags(bars[i].repeatFlags);
            m.setRepeatCount(this.bars[i].repeats) // supported in gp5

            if (this.bars[i].repeatFlags === (Repeat.START | Repeat.END)) {
                m.setRepeatEnd(true)
                m.setRepeatStart(true)
                this.voltaSequence = 1
            }
            // reset the volta sequence if we have an opening repeat
            if (this.bars[i].repeatFlags === Repeat.START) {
                this.voltaSequence = 1
            } else if (this.bars[i].repeatFlags === Repeat.END && i < this.bars.length - 1) {
                // otherwise, if we see an end repeat symbol, only reset if the bar after it does not contain a volta
                if (this.bars[i + 1].volta.voltaInfo.length === 0) {
                    this.voltaSequence = 1 // reset  the volta count
                }
            }

            this.score.measures().append(m)
            tick = tick.plus(nts)
            ts = nts
        }
    }

    //---------------------------------------------------------
    //   applyBeatEffects
    //---------------------------------------------------------

    /** C++ applyBeatEffects(chord, beatEffect, bool& hasVibratoLeftHand, bool& hasVibratoWTremBar) (the flags as references) */
    protected applyBeatEffects(chord: Chord, beatEffect: number, hasVibratoLeftHand: { value: boolean },
                               hasVibratoWTremBar: { value: boolean }): void {
        /* slap/pop implemented as text until SMuFL has
         * specifications and we can add them to fonts. Note that
         * slap/pop are just added to the top note in the chord,
         * technically these can be applied to individual notes on the
         * UI, but Guitar Pro has no way to express that on the
         * score. To get the same result, we should just add the marking
         * to above the top note.
         */
        if (beatEffect === 1) {
            if (this.version > 300) {
                this.addTap(chord)
            } else {
                hasVibratoLeftHand.value = true
            }
        } else if (beatEffect === 2) {
            this.addSlap(chord.upNote())
        } else if (beatEffect === 3) {
            this.addPop(chord.upNote())
        } else if (beatEffect === 4) {
            if (this.version >= 400) {
                const a = Factory.createItem(ElementType.ARTICULATION, chord) as Articulation
                a.setSymId(SymId.guitarFadeIn)
                a.setAnchor(ArticulationAnchor.TOP)
                a.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
                chord.add(a)
            }
            //TODO-ws       else for (auto n : chord->notes())
            //          n->setHarmonic(true);
        } else if (beatEffect === 5) {
            const a = Factory.createItem(ElementType.ARTICULATION, chord) as Articulation
            a.setSymId(SymId.stringsUpBow)
            chord.add(a)
        } else if (beatEffect === 6) {
            const art = Factory.createItem(ElementType.ARTICULATION, chord) as Articulation
            art.setSymId(SymId.stringsDownBow)
            chord.add(art)
        } else if (beatEffect === 7) {
            hasVibratoWTremBar.value = true
        }
    }

    protected abstract readBeatEffects(track: number, segment: Segment): number

    //---------------------------------------------------------
    //   setTempo
    //---------------------------------------------------------

    setTempo(newTempo: number, measure: Measure | null): void {
        if (!measure || measure === this.last_measure) {
            return
        }

        this.last_measure = measure

        if (this.last_tempo !== newTempo) {
            const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
            const tt = Factory.createItem(ElementType.TEMPO_TEXT, segment) as TempoText
            tt.setTempo(newTempo / 60.0)
            tt.setXmlText(`<sym>metNoteQuarterUp</sym> = ${newTempo}`)
            tt.setTrack(0)
            segment.add(tt)
            this.tempo = newTempo
            this.last_tempo = newTempo
            this.score.setTempo(measure.tick(), newTempo / 60.0)
        }
    }

    //---------------------------------------------------------
    //   readChord
    //---------------------------------------------------------

    protected readChord(seg: Segment, track: number, _numStrings: number, name: string, gpHeader: boolean): void {
        const firstFret = this.readInt()
        if (firstFret || gpHeader) {
            /// showing chord instead of fret diagrams
            const staffText = new StaffText(seg)
            staffText.setTrack(track)
            staffText.setPlainText(name)
            seg.add(staffText)
            this.skip(4 * (gpHeader ? 7 : 6))
            // C++: the fret diagram branch (if (false)) is not ported
        } else if (name.length) {
            const harmony = new Harmony(seg)
            harmony.setHarmony(name)
            harmony.setTrack(track)
            seg.add(harmony)
        }
    }

    //---------------------------------------------------------
    //   restsForEmptyBeats
    //---------------------------------------------------------

    protected restsForEmptyBeats(seg: Segment, measure: Measure, _cr: ChordRest | null, l: Fraction, track: number, tick: Fraction): void {
        /* this can happen as Guitar Pro versions 5 and below allows
         * users to create empty segments. Here, we create rests and
         * make them invisible so users get the same visual if they are
         * at a valid tick of the score. */
        if (seg.empty()) {
            if (tick.lt(measure.endTick())) {
                const cr = Factory.createItem(ElementType.REST, seg) as Rest
                cr.setTrack(track)
                const d = new TDuration(l)
                cr.setDurationType(d)
                cr.setVisible(false)
                seg.add(cr)
            } else {
                measure.remove(seg)
            }
        }
    }

    //---------------------------------------------------------
    //   createSlur
    //---------------------------------------------------------

    protected createSlur(hasSlur: boolean, staffIdx: staff_idx_t, cr: ChordRest | null): void {
        if (hasSlur && !this.slurs[staffIdx]) {
            cr = cr!
            const slur = Factory.createItem(ElementType.SLUR, scoreDummy(this.score)) as Slur
            slur.setParent(null)
            slur.setTrack(cr.track())
            slur.setTrack2(cr.track())
            slur.setTick(cr.tick())
            slur.setTick2(cr.tick())
            slur.setStartElement(cr)
            slur.setEndElement(cr)
            this.slurs[staffIdx] = slur
            this.score.addElement(slur)
        } else if (this.slurs[staffIdx] && !hasSlur) {
            const s = this.slurs[staffIdx]!
            this.slurs[staffIdx] = null
            s.setEndElement(cr)
            s.setTick2(cr!.tick())
            s.setTrack2(cr!.track())
        }
    }

    //---------------------------------------------------------
    //   readTremoloBar
    //---------------------------------------------------------

    protected readTremoloBar(_track: number, _segment: Segment | null): void {
        /*int a1 =*/
        this.readChar()
        /*int a2 =*/ this.readChar()
        /*int a3 =*/ this.readChar()
        /*int a4 =*/ this.readChar()
        /*int a5 =*/ this.readChar()
        const n = this.readInt()
        const points: PitchValue[] = []
        for (let i = 0; i < n; ++i) {
            const time = this.readInt()
            const pitch = this.readInt()
            const vibrato = this.readUInt8()
            points.push(new PitchValue(time, pitch, !!vibrato))
        }
    }

    protected createGPDomBuilder(): IGPDomBuilder | null { return null }

    // ---- shared parts of the GP1-3 readers (inline in each C++ read()) ----

    /** creates a part with one staff for every staff */
    protected createParts(): void {
        for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
            const part = new Part(this.score)
            const s = Factory.createStaff(part)

            this.score.appendStaff(s)
            this.score.appendPart(part)
        }
    }

    /** the string data of a part from GP's tuning (high to low string) */
    protected setTuning(i: number, frets: number, strings: number, tuning: readonly number[]): void {
        const tuning2 = new Array<number>(strings)
        for (let k = 0; k < strings; ++k) {
            tuning2[strings - k - 1] = tuning[k]
        }
        const useFlats = this.createTuningString(strings, tuning2)
        const stringData = StringData.fromPitches(frets, strings, tuning2, useFlats)
        const part = this.score.staff(i)!.part()!
        const instr = part.instrument()
        instr.setStringData(stringData)
        instr.setSingleNoteDynamics(false)
    }

    /** the measures with the time signatures of GP1-3 files */
    protected createSimpleMeasures(withKey: boolean): void {
        let ts = new Fraction(0, 1)
        let tick = new Fraction(0, 1)
        for (let i = 0; i < this.measures; ++i) {
            const nts = this.bars[i].timesig
            const m = Factory.createItem(ElementType.MEASURE, scoreDummy(this.score).system()) as Measure
            m.setTick(tick)
            m.setTimesig(nts)
            m.setTicks(nts)

            if (i === 0 || ts.ne(nts)) {
                for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                    const s = m.getSegment(SegmentType.TimeSig, tick)
                    const t = Factory.createItem(ElementType.TIMESIG, s) as TimeSig
                    t.setTrack(staffIdx * VOICES)
                    t.setSig(nts)
                    s.add(t)
                }
            }
            if (withKey) {
                // GuitarPro3::read
                if (i === 0 && this.key) {
                    for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                        const s = m.getSegment(SegmentType.KeySig, tick)
                        const t = Factory.createItem(ElementType.KEYSIG, s) as KeySig
                        t.setKey(this.key as Key)
                        t.setTrack(staffIdx * VOICES)
                        s.add(t)
                    }
                }

                this.readVolta(this.bars[i].volta, m)
                m.setRepeatEnd(this.bars[i].repeatFlags === Repeat.END)
                m.setRepeatStart(this.bars[i].repeatFlags === Repeat.START)
                m.setRepeatJump(this.bars[i].repeatFlags === Repeat.JUMP)
                //            m->setRepeatFlags(bars[i].repeatFlags);
                m.setRepeatCount(this.bars[i].repeats)

                // reset the volta sequence if we have an opening repeat
                if (this.bars[i].repeatFlags === Repeat.START) {
                    this.voltaSequence = 1
                } else if (this.bars[i].repeatFlags === Repeat.END && i < this.bars.length - 1) {
                    // otherwise, if we see an end repeat symbol, only reset if the bar after it does not contain a volta
                    if (this.bars[i + 1].volta.voltaInfo.length === 0) {
                        this.voltaSequence = 1
                    }
                }
            }

            this.score.measures().append(m)
            tick = tick.plus(nts)
            ts = nts
        }
    }

    /** the bars of GP2/GP3 files; gp3 = the key signature of GP3 (signed) */
    protected readBars(gp3: boolean): void {
        let tnumerator = 4
        let tdenominator = 4
        for (let i = 0; i < this.measures; ++i) {
            const bar = new GpBar()
            const barBits = this.readUInt8()
            if (barBits & GuitarPro.SCORE_TIMESIG_NUMERATOR) {
                tnumerator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_TIMESIG_DENOMINATOR) {
                tdenominator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_REPEAT_START) {
                bar.repeatFlags = bar.repeatFlags | Repeat.START
            }
            if (barBits & GuitarPro.SCORE_REPEAT_END) { // number of repeats
                bar.repeatFlags = bar.repeatFlags | Repeat.END
                bar.repeats = this.readUInt8() + 1
            }
            if (barBits & GuitarPro.SCORE_VOLTA) { // a volta
                let voltaNumber = this.readUInt8()
                // voltas are represented as a binary number
                if (gp3) {
                    bar.volta.voltaType = GP_VOLTA_BINARY
                }
                while (voltaNumber > 0) {
                    // volta information is represented as a binary number
                    bar.volta.voltaType = GP_VOLTA_BINARY
                    bar.volta.voltaInfo.push(voltaNumber & 1)
                    voltaNumber >>= 1
                }
            }
            if (barBits & GuitarPro.SCORE_MARKER) {
                bar.marker = this.readDelphiString() // new section?
                /*int color =*/ this.readInt() // color?
            }
            if (barBits & GuitarPro.SCORE_KEYSIG) {
                if (gp3) {
                    const currentKey = this.readUInt8()
                    /* key signatures are specified as
                     * 1# = 1, 2# = 2, ..., 7# = 7
                     * 1b = 255, 2b = 254, ... 7b = 249 */
                    bar.keysig = currentKey <= 7 ? currentKey : -256 + currentKey
                    this.readUInt8() // specifies major/minor mode
                } else {
                    bar.keysig = this.readUInt8()
                    /*uint8_t c    =*/ this.readUInt8() // minor
                }
            }
            if (barBits & GuitarPro.SCORE_DOUBLE_BAR) {
                bar.barLine = BarLineType.DOUBLE
            }
            bar.timesig = new Fraction(tnumerator, tdenominator)
            this.bars.push(bar)
        }
    }

    /** the track headers of GP2/GP3 files; returns false on errors */
    protected readTrackHeaders(gp3: boolean): boolean {
        for (let i = 0; i < this.staves; ++i) {
            const tuning: number[] = []

            const c = this.readUInt8() // simulations bitmask
            if (c & 0x2) { // 12 stringed guitar
            }
            if (c & 0x4) { // banjo track
            }
            const name = this.readPascalString(40)
            const strings = this.readInt()
            if (strings <= 0 || strings > GP_MAX_STRING_NUMBER) {
                return false
            }
            for (let j = 0; j < strings; ++j) {
                tuning[j] = this.readInt()
            }
            for (let j = strings; j < GP_MAX_STRING_NUMBER; ++j) {
                this.readInt()
            }
            const midiPort = this.readInt() - 1
            const midiChannel = this.readInt() - 1
            if (midiChannel < 0 || midiChannel >= this.channelDefaults.length) {
                console.error(`midiChannel ${midiChannel} out of range 0-${this.channelDefaults.length}`)
                return false
            }
            /*int midiChannel2 =*/ this.readInt() // - 1;
            const frets = this.readInt()
            const capo = this.readInt()
            /*int color        =*/ this.readInt()

            this.setTuning(i, frets, strings, tuning)
            const part = this.score.staff(i)!.part()!
            const instr = part.instrument()
            part.setPartName(name)
            part.setPlainLongName(name)

            //
            // determine clef
            //
            const staff = this.score.staff(i)!
            const patch = this.channelDefaults[midiChannel].patch
            let clefId = ClefType.G
            if (midiChannel === GP_DEFAULT_PERCUSSION_CHANNEL) {
                clefId = ClefType.PERC
                let type = StaffTypes.PERC_DEFAULT
                const it = drumset.PERC_STAFF_LINES_FROM_INSTRUMENT.get(name)
                if (it) {
                    drumset.initGuitarProPercussionSet(it)
                    drumset.setInstrumentDrumset(instr, it)
                    switch (it.numLines) {
                    case 1:
                        type = StaffTypes.PERC_1LINE
                        break
                    case 2:
                        type = StaffTypes.PERC_2LINE
                        break
                    case 3:
                        type = StaffTypes.PERC_3LINE
                        break
                    default:
                        type = StaffTypes.PERC_DEFAULT
                        break
                    }
                } else {
                    drumset.initGuitarProDrumset()
                    instr.setDrumset(drumset.gpDrumset)
                }
                staff.setStaffType(new Fraction(0, 1), StaffType.preset(type))
            } else {
                clefId = defaultClef(patch)
            }
            const measure = this.score.firstMeasure()!
            const segment = measure.getSegment(SegmentType.HeaderClef, new Fraction(0, 1))
            const clef = Factory.createItem(ElementType.CLEF, segment) as Clef
            clef.setClefType(clefId)
            clef.setTrack(i * VOICES)
            segment.add(clef)

            if (capo > 0 && (gp3 || !EngravingConfiguration.guitarProImportExperimental())) {
                const s = measure.getSegment(SegmentType.ChordRest, measure.tick())
                const st = new StaffText(s)
                //                  st->setTextStyleType(TextStyleType::STAFF);
                st.setPlainText('Capo. fret ' + String(capo))
                st.setTrack(i * VOICES)
                s.add(st)
            }

            const ch = instr.channel(0)!
            // C++ GuitarPro2 compares with int(StaffTypes::PERC_DEFAULT), GuitarPro3 with GP_DEFAULT_PERCUSSION_CHANNEL
            if (midiChannel === (gp3 ? GP_DEFAULT_PERCUSSION_CHANNEL : StaffTypes.PERC_DEFAULT as number)) {
                ch.setProgram(0)
                ch.setBank(128)
            } else {
                ch.setProgram(patch)
                ch.setBank(0)
            }
            ch.setVolume(this.channelDefaults[midiChannel].volume)
            ch.setPan(this.channelDefaults[midiChannel].pan)
            ch.setChorus(this.channelDefaults[midiChannel].chorus)
            ch.setReverb(this.channelDefaults[midiChannel].reverb)
            if (gp3) {
                staff.part()!.setMidiChannel(midiChannel, midiPort)
            }
            // missing: phase, tremolo
        }
        return true
    }

    /** a beat's chord diagram (BEAT_CHORD) */
    protected readBeatChord(segment: Segment, staffIdx: number, track: track_idx_t, gp3: boolean): void {
        const numStrings = this.score.staff(staffIdx)!.part()!.instrument().stringData().strings()
        const header = this.readUInt8()
        let name: string
        if ((header & 1) === 0) {
            name = this.readDelphiString()
            this.readChord(segment, track, numStrings, name, false)
        } else {
            this.skip(25)
            name = this.readPascalString(34)
            // C++ GuitarPro3 passes gpHeader = false
            this.readChord(segment, track, numStrings, name, !gp3)
            this.skip(36)
        }
    }

    /** the tuplet of a beat (the same code in the C++ readers) */
    protected addToTuplet(tuplets: (Tuplet | null)[], staffIdx: number, measure: Measure, fraction: Fraction, cr: ChordRest,
                          track: track_idx_t, tuple: number, l: Fraction, setParent: boolean): void {
        let tuplet = tuplets[staffIdx]
        if (!tuplet || tuplet.elementsDuration().eq(tuplet.baseLen().fraction().times(tuplet.ratio().numerator()))) {
            tuplet = Factory.createItem(ElementType.TUPLET, measure) as Tuplet
            tuplet.setTick(fraction)
            tuplet.setTrack(cr.track())
            tuplets[staffIdx] = tuplet
            this.setTuplet(tuplet, tuple)
            if (setParent) {
                tuplet.setParent(measure)
            }
        }
        tuplet.setTrack(track)
        tuplet.setBaseLen(new TDuration(l))
        tuplet.setTicks(l.times(tuplet.ratio().denominator()))
        cr.setTuplet(tuplet)
        tuplet.add(cr)
    }
}

//---------------------------------------------------------
//   GuitarPro1
//---------------------------------------------------------

export class GuitarPro1 extends GuitarPro {
    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    override read(io: Buffer): boolean {
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this.score)
        this.m_guitarBendImporter = new GuitarBendImporter(this.score)

        this.f = io
        this.curPos = 30

        this.title = this.readDelphiString()
        this.artist = this.readDelphiString()
        this.readDelphiString()

        const temp = this.readInt()
        /*uint8_t num =*/ this.readUInt8() // Shuffle rhythm feel

        // int octave = 0;
        this.key = 0
        if (this.version > 102) {
            this.key = this.readInt() // key
        }
        this.staves = this.version > 102 ? 8 : 1
        this.slurs = new Array<Slur | null>(this.staves).fill(null)
        // C++ does not initialize the dynamics of GP1 files (undefined behavior in readNote)
        this.initDynamics(this.staves)

        //
        // create a part for every staff
        //
        this.createParts()

        for (let i = 0; i < this.staves; ++i) {
            const tuning: number[] = []

            const strings = this.version > 101 ? this.readInt() : 6
            if (strings <= 0 || strings > GP_MAX_STRING_NUMBER) {
                return false
            }

            for (let j = 0; j < strings; ++j) {
                tuning[j] = this.readInt()
            }

            const frets = 32 // TODO
            this.setTuning(i, frets, strings, tuning)
        }

        this.measures = this.readInt()

        // C++ reads the (empty) bars here (undefined behavior); default bars are used
        while (this.bars.length < this.measures) {
            this.bars.push(new GpBar())
        }
        this.createSimpleMeasures(false)

        this.previousTempo = temp
        let measure = this.score.firstMeasure()
        let mixChange = false
        for (let bar = 0; bar < this.measures; ++bar, measure = measure!.nextMeasure()) {
            const gpbar = this.bars[bar]

            this.addMarker(gpbar, measure!)
            const tuplets = new Array<Tuplet | null>(this.staves).fill(null)

            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                let measureLen = new Fraction(0, 1)
                const track = staffIdx * VOICES
                let fraction = measure!.tick()
                const beats = this.readInt()
                for (let beat = 0; beat < beats; ++beat) {
                    //                        int pause = 0;
                    const beatBits = this.readUInt8()
                    const dotted = !!(beatBits & GuitarPro.BEAT_DOTTED)
                    if (beatBits & GuitarPro.BEAT_PAUSE) {
                        /*pause =*/
                        this.readUInt8()
                    }
                    const len = this.readChar()
                    let tuple = 0
                    if (beatBits & GuitarPro.BEAT_TUPLET) {
                        tuple = this.readInt()
                    }
                    const segment = measure!.getSegment(SegmentType.ChordRest, fraction)
                    if (beatBits & GuitarPro.BEAT_CHORD) {
                        this.readBeatChord(segment, staffIdx, track, false)
                    }
                    let lyrics: Lyrics | null = null
                    if (beatBits & GuitarPro.BEAT_LYRICS) {
                        lyrics = Factory.createItem(ElementType.LYRICS, scoreDummy(this.score).chord()) as Lyrics
                        lyrics.setPlainText(this.readDelphiString())
                    }
                    if (beatBits & GuitarPro.BEAT_EFFECTS) {
                        this.readBeatEffects(track, segment)
                    }

                    if (beatBits & GuitarPro.BEAT_MIX_CHANGE) {
                        this.readMixChange(measure!)
                        mixChange = true
                    }

                    const strings = this.readUInt8() // used strings mask

                    let l = this.len2fraction(len)
                    let cr: ChordRest
                    if (strings) {
                        cr = Factory.createItem(ElementType.CHORD, scoreDummy(this.score).segment()) as Chord
                    } else {
                        cr = Factory.createItem(ElementType.REST, scoreDummy(this.score).segment()) as Rest
                    }
                    cr.setTrack(track)
                    if (lyrics) {
                        cr.add(lyrics)
                    }

                    const d = new TDuration(l)
                    d.setDots(dotted ? 1 : 0)

                    if (dotted) {
                        l = l.plus(l.times(new Fraction(1, 2)))
                    }

                    if (tuple) {
                        this.addToTuplet(tuplets, staffIdx, measure!, fraction, cr, track, tuple, l, false) //TODOxxx
                    }

                    cr.setTicks(l)
                    cr.setDurationType(d)
                    segment.add(cr)
                    const staff = cr.staff()!
                    const numStrings = staff.part()!.instrument().stringData().strings()
                    let readResult: GuitarProReadNoteResult
                    let hasLetRing = false
                    let hasPalmMute = false
                    for (let i = 6; i >= 0; --i) {
                        if (strings & (1 << i) && ((6 - i) < numStrings)) {
                            const note = Factory.createItem(ElementType.NOTE, cr) as Note
                            toChord(cr).add(note)
                            readResult = this.readNote(6 - i, note)
                            hasLetRing = readResult.letRing || hasLetRing
                            hasPalmMute = readResult.palmMute || hasPalmMute
                            note.setTpcFromPitch()
                        }
                    }
                    this.restsForEmptyBeats(segment, measure!, cr, l, track, fraction)
                    fraction = fraction.plus(cr.actualTicks())
                    measureLen = measureLen.plus(cr.actualTicks())
                    this.addLetRing(cr, hasLetRing)
                    this.addPalmMute(cr, hasPalmMute)
                }
                if (measureLen.lt(measure!.ticks())) {
                    this.score.setRest(fraction, track, measure!.ticks().minus(measureLen), false, null, false)
                    this.m_continiousElementsBuilder.notifyUncompletedMeasure()
                }
            }
            if (bar === 1 && !mixChange) {
                this.setTempo(temp, this.score.firstMeasure())
            }
        }

        this.m_continiousElementsBuilder.addElementsToScore()
        return true
    }

    /** the marker of a bar as a rehearsal mark (inline in C++) */
    protected addMarker(gpbar: GpBar, measure: Measure): void {
        if (gpbar.marker.length) {
            const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
            const s = new RehearsalMark(segment)
            s.setPlainText(gpbar.marker.trim())
            s.setTrack(0)
            segment.add(s)
        }
    }

    //---------------------------------------------------------
    //   readNote
    //---------------------------------------------------------

    protected readNote(string: number, note: Note): GuitarProReadNoteResult {
        const readResult = new GuitarProReadNoteResult()
        const noteBits = this.readUInt8()
        if (noteBits & GuitarPro.NOTE_GHOST) {
            if (this.version === 300) {
                note.setGhost(true)
            } else {
                note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                note.setGhost(true)
            }
        }

        let tieNote = false
        let variant = 1
        if (noteBits & GuitarPro.NOTE_DEAD) {
            variant = this.readUInt8()
            if (variant === 1) { // normal note
            } else if (variant === 2) {
                tieNote = true
            } else if (variant === 3) { // dead notes
                note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                note.setDeadNote(true)
            } else {
                console.debug(`unknown note variant: ${variant}`)
            }
        }

        //
        // noteBits:
        //    7 - Right hand or left hand fingering;
        //    6 - Accentuated note
        //    5 - Note type (rest, empty note, normal note);
        //    4 - note dynamic;
        //    3 - Presence of effects linked to the note;
        //    2 - Ghost note;
        //    1 - Dotted note;  ?
        //    0 - Time-independent duration

        if (noteBits & 0x1) { // note != beat
            this.readUInt8() // length
            this.readUInt8() // t
        }
        if (noteBits & 0x2) { // note is dotted
            //readUInt8();
        }

        // set dynamic information on note if different from previous note
        const dynTrack = note.track()
        if (noteBits & GuitarPro.NOTE_DYNAMIC) {
            const d = this.readChar()
            if (this.previousDynamicByTrack[dynTrack] !== d) {
                this.previousDynamicByTrack[dynTrack] = d
                this.addDynamic(note, d)
            }
        } else if (this.previousDynamicByTrack[dynTrack] !== GuitarPro.DEFAULT_DYNAMIC) {
            this.previousDynamicByTrack[dynTrack] = GuitarPro.DEFAULT_DYNAMIC
            this.addDynamic(note, GuitarPro.DEFAULT_DYNAMIC)
        }

        let fretNumber = -1
        if (noteBits & GuitarPro.NOTE_FRET) {
            fretNumber = this.readUInt8()
        }

        if (noteBits & GuitarPro.NOTE_FINGERING) { // fingering
            this.readUInt8()
            this.readUInt8()
        }
        if (noteBits & GuitarPro.BEAT_EFFECTS) {
            const modMask1 = this.readUInt8()
            let modMask2 = 0
            if (this.version >= 400) {
                modMask2 = this.readUInt8()
            }
            if (modMask1 & GuitarPro.EFFECT_BEND) {
                this.readBend(note)
            }
            if (modMask1 & GuitarPro.EFFECT_GRACE) {
                // GP3 grace note
                let fret = this.readUInt8() // grace fret
                const dynamic = this.readUInt8() // grace dynamic
                const transition = this.readUInt8() // grace transition
                const duration = this.readUInt8() // grace duration

                let grace_len = Constants.DIVISION / 8
                if (duration === 1) {
                    grace_len = Constants.DIVISION / 8 //32nd
                } else if (duration === 2) {
                    grace_len = Constants.DIVISION / 6 //24th
                } else if (duration === 3) {
                    grace_len = Constants.DIVISION / 4 //16th
                }
                const gn = Factory.createItem(ElementType.NOTE, scoreDummy(this.score).chord()) as Note

                if (fret === 255) {
                    gn.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                    gn.setGhost(true)
                }
                if (fret === 255) {
                    fret = 0
                }
                gn.setFret(fret)
                gn.setString(string)
                const grace_pitch = note.staff()!.part()!.instrument().stringData().getPitchForStaff(string, fret, null)
                gn.setPitch(grace_pitch)
                gn.setTpcFromPitch()

                let gc: Chord | null = null
                if (note.chord()!.graceNotes().length) {
                    gc = note.chord()!.graceNotes()[0]
                }
                if (!gc) {
                    gc = Factory.createItem(ElementType.CHORD, scoreDummy(this.score).segment()) as Chord
                    const d = new TDuration()
                    d.setVal(grace_len)
                    if (grace_len === Constants.DIVISION / 6) {
                        d.setDots(1)
                    }
                    gc.setDurationType(d)
                    gc.setTicks(d.fraction())
                    gc.setNoteType(NoteType.ACCIACCATURA)
                    gc.mutldata().setMag(note.chord()!.staff()!.staffMag(new Fraction(0, 1)) * this.score.style().styleD(Sid.graceNoteMag))
                    note.chord()!.add(gc) // sets parent + track
                    this.addDynamic(gn, dynamic)
                }

                gc.add(gn)

                if (transition === 0) {
                    // no transition
                } else if (transition === 1) {
                    //note->setSlideNote(gn);
                    const glis = new Glissando(scoreDummy(this.score))
                    glis.setGlissandoType(GlissandoType.STRAIGHT)
                    gn.chord()!.add(glis)
                    glis.setAnchor(SpannerAnchor.NOTE)
                    glis.setStartElement(gn)
                    glis.setTick(gn.chord()!.tick())
                    glis.setTrack(gn.track())
                    glis.setParent(gn)
                    glis.setEndElement(note)
                    glis.setTick2(note.chord()!.tick())
                    glis.setTrack2(note.track())
                    this.score.addElement(glis)
                    //HammerOn here??? Maybe version...

                    const slur1 = Factory.createItem(ElementType.SLUR, scoreDummy(this.score)) as Slur
                    slur1.setStartElement(gc)
                    slur1.setEndElement(note.chord())
                    slur1.setTick(gc.tick())
                    slur1.setTick2(note.chord()!.tick())
                    slur1.setTrack(gc.track())
                    slur1.setTrack2(note.track())
                    this.score.addElement(slur1)

                    //TODO: Add a 'slide' guitar effect when implemented
                } else if (transition === 2 && fretNumber >= 0 && fretNumber <= 255 && fretNumber !== gn.fret()) {
                    // C++: the bend is commented out
                } else if (transition === 3) {
                    // TODO:
                    //     major: replace with a 'hammer-on' guitar effect when implemented
                    //     minor: make slurs for parts

                    const cr1: ChordRest = gc
                    const cr2: ChordRest = note.chord()!

                    const slur1 = Factory.createItem(ElementType.SLUR, scoreDummy(this.score)) as Slur
                    slur1.setStartElement(cr1)
                    slur1.setEndElement(cr2)
                    slur1.setTick(cr1.tick())
                    slur1.setTick2(cr2.tick())
                    slur1.setTrack(cr1.track())
                    slur1.setTrack2(cr2.track())
                    this.score.addElement(slur1)
                }
            }
            if (modMask1 & GuitarPro.EFFECT_HAMMER) { // hammer on / pull off
                readResult.slur = true
            }
            if (modMask1 & GuitarPro.EFFECT_LET_RING) { // let ring
                readResult.letRing = true
            }
            if (modMask1 & GuitarPro.EFFECT_SLIDE_OLD) {
                this.slideList.push(note)
            }

            if (this.version >= 400) {
                if (modMask2 & GuitarPro.EFFECT_STACCATO) {
                }
                if (modMask2 & GuitarPro.EFFECT_PALM_MUTE) {
                    readResult.palmMute = true
                }
                if (modMask2 & GuitarPro.EFFECT_TREMOLO) {
                    this.readUInt8()
                }
                if (modMask2 & GuitarPro.EFFECT_ARTIFICIAL_HARMONIC) {
                    /*int type =*/
                    this.readUInt8()
                    //TODO-ws           if (type == 1 || type == 4 || type == 5)
                    //                    note->setHarmonic(true);
                }
                if (modMask2 & GuitarPro.EFFECT_TRILL) {
                    //TODO-ws                        note->setTrillFret(readUInt8());      // trill fret
                    this.readUInt8() // trill length
                }
            }
        }
        const staff = note.staff()!
        if (fretNumber === 255) {
            fretNumber = 0
            note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
            note.setGhost(true)
        }
        // dead note represented as high numbers - fix to zero
        if (fretNumber > 99 || fretNumber === -1) {
            fretNumber = 0
        }
        let pitch = staff.part()!.instrument().stringData().getPitchForStaff(string, fretNumber, null)

        /* it's possible to specify extraordinarily high pitches by
        specifying fret numbers that don't exist. This is an issue that
        comes from tuxguitar. Just set to maximum pitch. GP6 actually
        sets the fret number to 0 also, so that's what I've opted to do
        here. */
        if (pitch > GuitarPro.MAX_PITCH) {
            fretNumber = 0
            pitch = GuitarPro.MAX_PITCH
        }

        note.setFret(fretNumber)
        note.setString(string)
        note.setPitch(pitch)

        if (tieNote) {
            let found = false
            const chord = note.chord()!
            let segment = chord.segment()!.prev1(SegmentType.ChordRest)
            const track = note.track()
            const chords: Chord[] = []
            let true_note: Note | null = null
            while (segment) {
                const e = segment.element(track)
                if (e) {
                    if (e.isChord()) {
                        const chord2 = toChord(e)
                        for (const note2 of chord2.notes()) {
                            if (note2.string() === string) {
                                if (!chords.length) {
                                    const tie = Factory.createItem(ElementType.TIE, note2) as Tie
                                    tie.setEndNote(note)
                                    note2.add(tie)
                                }
                                note.setFret(note2.fret())
                                note.setPitch(note2.pitch())
                                found = true
                                true_note = note2
                                break
                            }
                        }
                        if (!found) {
                            chords.push(chord2)
                        }
                    }
                    if (found) {
                        break
                    }
                }
                segment = segment.prev1(SegmentType.ChordRest)
            }

            if (chords.length && true_note) {
                let end_note = note
                for (let i = 0; i < chords.length; ++i) {
                    const note2 = Factory.createItem(ElementType.NOTE, chords[i]) as Note
                    note2.setString(true_note.string())
                    note2.setFret(true_note.fret())
                    note2.setPitch(true_note.pitch())
                    note2.setTpcFromPitch()
                    chords[i].add(note2)
                    const tie = Factory.createItem(ElementType.TIE, note2) as Tie
                    tie.setEndNote(end_note)
                    end_note = note2
                    note2.add(tie)
                }
                const tie = Factory.createItem(ElementType.TIE, true_note) as Tie
                tie.setEndNote(end_note)
                true_note.add(tie)
            }
        }

        return readResult
    }

    //---------------------------------------------------------
    //   readBeatEffects
    //---------------------------------------------------------

    protected override readBeatEffects(_track: number, _segment: Segment): number {
        const fxBits1 = this.readUInt8()
        if (fxBits1 & GuitarPro.BEAT_EFFECT) {
            const num = this.readUInt8()
            switch (num) {
            case 0: // tremolo bar
                this.readInt()
                break
            default:
                this.readInt()
                break
            }
        }
        if (fxBits1 & GuitarPro.BEAT_ARPEGGIO) {
            this.readUInt8() // down stroke length
            this.readUInt8() // up stroke length
        }
        return 0
    }
}

//---------------------------------------------------------
//   GuitarPro2
//---------------------------------------------------------

export class GuitarPro2 extends GuitarPro1 {
    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    override read(io: Buffer): boolean {
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this.score)
        this.m_guitarBendImporter = new GuitarBendImporter(this.score)

        this.f = io
        this.curPos = 30

        this.title = this.readDelphiString()
        this.subtitle = this.readDelphiString()
        this.artist = this.readDelphiString()
        this.album = this.readDelphiString()
        this.composer = this.readDelphiString()
        const copyright = this.readDelphiString()
        if (copyright.length) {
            this.score.setMetaTag('copyright', copyright)
        }

        this.readDelphiString() // transcriber
        this.readDelphiString() // instructions
        const n = this.readInt()
        for (let i = 0; i < n; ++i) {
            this.comments.push(this.readDelphiString())
        }

        /*uint8_t num =*/ this.readUInt8() // Shuffle rhythm feel

        const temp = this.readInt()

        // int octave = 0;
        /*int key =*/ this.readInt() // key

        this.readChannelDefaults()
        this.measures = this.readInt()
        this.staves = this.readInt()
        this.initDynamics(this.staves)
        // C++ does not resize the slurs of GP2 files (GuitarPro1::readNote does not create slurs)
        this.slurs = new Array<Slur | null>(this.staves).fill(null)

        this.readBars(false)

        //
        // create a part for every staff
        //
        this.createParts()

        this.createSimpleMeasures(false)

        if (!this.readTrackHeaders(false)) {
            return false
        }

        this.previousTempo = temp
        let measure = this.score.firstMeasure()
        let mixChange = false
        for (let bar = 0; bar < this.measures; ++bar, measure = measure!.nextMeasure()) {
            const gpbar = this.bars[bar]

            this.addMarker(gpbar, measure!)

            const tuplets = new Array<Tuplet | null>(this.staves).fill(null)

            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                let measureLen = new Fraction(0, 1)
                const track = staffIdx * VOICES
                let fraction = measure!.tick()
                const beats = this.readInt()
                for (let beat = 0; beat < beats; ++beat) {
                    //                        int pause = 0;
                    const beatBits = this.readUInt8()
                    const dotted = !!(beatBits & GuitarPro.BEAT_DOTTED)
                    if (beatBits & GuitarPro.BEAT_PAUSE) {
                        /*pause =*/
                        this.readUInt8()
                    }
                    const len = this.readChar()
                    let tuple = 0
                    if (beatBits & GuitarPro.BEAT_TUPLET) {
                        tuple = this.readInt()
                    }
                    const segment = measure!.getSegment(SegmentType.ChordRest, fraction)
                    if (beatBits & GuitarPro.BEAT_CHORD) {
                        this.readBeatChord(segment, staffIdx, track, false)
                    }
                    let lyrics: Lyrics | null = null
                    if (beatBits & GuitarPro.BEAT_LYRICS) {
                        const txt = this.readDelphiString()
                        lyrics = Factory.createItem(ElementType.LYRICS, scoreDummy(this.score).chord()) as Lyrics
                        lyrics.setPlainText(txt)
                    }
                    if (beatBits & GuitarPro.BEAT_EFFECTS) {
                        this.readBeatEffects(track, segment)
                    }

                    if (beatBits & GuitarPro.BEAT_MIX_CHANGE) {
                        this.readMixChange(measure!)
                        mixChange = true
                    }

                    const strings = this.readUInt8() // used strings mask

                    let l = this.len2fraction(len)
                    let cr: ChordRest
                    if (strings) {
                        cr = Factory.createItem(ElementType.CHORD, scoreDummy(this.score).segment()) as Chord
                    } else {
                        cr = Factory.createItem(ElementType.REST, scoreDummy(this.score).segment()) as Rest
                    }
                    cr.setTrack(track)
                    if (lyrics) {
                        cr.add(lyrics)
                    }

                    const d = new TDuration(l)
                    d.setDots(dotted ? 1 : 0)

                    if (dotted) {
                        l = l.plus(l.times(new Fraction(1, 2)))
                    }

                    if (tuple) {
                        this.addToTuplet(tuplets, staffIdx, measure!, fraction, cr, track, tuple, l, true)
                    }

                    cr.setTicks(l)
                    cr.setDurationType(d)
                    segment.add(cr)
                    const staff = cr.staff()!
                    const numStrings = staff.part()!.instrument().stringData().strings()
                    let readResult: GuitarProReadNoteResult
                    let hasLetRing = false
                    let hasPalmMute = false
                    for (let i = 6; i >= 0; --i) {
                        if (strings & (1 << i) && ((6 - i) < numStrings)) {
                            const note = Factory.createItem(ElementType.NOTE, cr) as Note
                            toChord(cr).add(note)
                            readResult = this.readNote(6 - i, note)
                            hasLetRing = readResult.letRing || hasLetRing
                            hasPalmMute = readResult.palmMute || hasPalmMute
                            note.setTpcFromPitch()
                        }
                    }
                    this.restsForEmptyBeats(segment, measure!, cr, l, track, fraction)
                    fraction = fraction.plus(cr.actualTicks())
                    measureLen = measureLen.plus(cr.actualTicks())
                    this.addLetRing(cr, hasLetRing)
                    this.addPalmMute(cr, hasPalmMute)
                }
                if (measureLen.lt(measure!.ticks())) {
                    this.score.setRest(fraction, track, measure!.ticks().minus(measureLen), false, null, false)
                    this.m_continiousElementsBuilder.notifyUncompletedMeasure()
                }
            }
            if (bar === 1 && !mixChange) {
                this.setTempo(temp, this.score.firstMeasure())
            }
        }

        this.m_continiousElementsBuilder.addElementsToScore()
        return true
    }
}

//---------------------------------------------------------
//   GuitarPro3
//---------------------------------------------------------

export class GuitarPro3 extends GuitarPro1 {
    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    override read(io: Buffer): boolean {
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this.score)
        this.m_guitarBendImporter = new GuitarBendImporter(this.score)

        this.f = io
        this.curPos = 30

        this.title = this.readDelphiString()
        this.subtitle = this.readDelphiString()
        this.artist = this.readDelphiString()
        this.album = this.readDelphiString()
        this.composer = this.readDelphiString()
        const copyright = this.readDelphiString()

        if (copyright.length) {
            this.score.setMetaTag('copyright', copyright)
        }

        this.readDelphiString() // transcriber
        this.readDelphiString() // instructions
        for (let i = 0, n = this.readInt(); i < n; ++i) {
            this.comments.push(this.readDelphiString())
        }

        /*uint8_t num =*/ this.readUInt8() // Shuffle rhythm feel

        const temp = this.readInt()

        // int octave = 0;
        this.key = this.readInt() // key

        this.readChannelDefaults()
        this.measures = this.readInt()
        this.staves = this.readInt()
        this.initDynamics(this.staves)

        this.slurs = new Array<Slur | null>(this.staves).fill(null)

        this.readBars(true)

        //
        // create a part for every staff
        //
        this.createParts()

        this.createSimpleMeasures(true)

        if (!this.readTrackHeaders(true)) {
            return false
        }

        this.previousTempo = temp
        let measure = this.score.firstMeasure()
        let mixChange = false
        for (let bar = 0; bar < this.measures; ++bar, measure = measure!.nextMeasure()) {
            const gpbar = this.bars[bar]

            this.addMarker(gpbar, measure!)

            const tuplets = new Array<Tuplet | null>(this.staves).fill(null)

            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                let measureLen = new Fraction(0, 1)
                const track = staffIdx * VOICES
                let fraction = measure!.tick()
                const beats = this.readInt()
                if (beats > 200) {
                    return false
                }
                for (let beat = 0; beat < beats; ++beat) {
                    let hasSlur = false
                    let hasLetRing = false
                    let hasPalmMute = false
                    let hasVibratoLeftHand = false
                    let hasVibratoWTremBar = false

                    //                        int pause = 0;
                    const beatBits = this.readUInt8()
                    const dotted = !!(beatBits & GuitarPro.BEAT_DOTTED)
                    if (beatBits & GuitarPro.BEAT_PAUSE) {
                        /*pause =*/
                        this.readUInt8()
                    }

                    this.slide = -1
                    if (this.slides.has(track)) {
                        this.slide = this.slides.get(track)!
                        this.slides.delete(track)
                    }

                    const len = this.readChar()
                    let tuple = 0
                    if (beatBits & GuitarPro.BEAT_TUPLET) {
                        tuple = this.readInt()
                    }

                    const segment = measure!.getSegment(SegmentType.ChordRest, fraction)
                    if (beatBits & GuitarPro.BEAT_CHORD) {
                        this.readBeatChord(segment, staffIdx, track, true)
                    }
                    const lyrics: Lyrics | null = null
                    if (beatBits & GuitarPro.BEAT_LYRICS) {
                        const txt = this.readDelphiString()
                        // C++ creates the lyrics but does not add them
                        const lyrics2 = Factory.createItem(ElementType.LYRICS, scoreDummy(this.score).chord()) as Lyrics
                        lyrics2.setPlainText(txt)
                    }
                    let beatEffects = 0

                    if (beatBits & GuitarPro.BEAT_EFFECTS) {
                        beatEffects = this.readBeatEffects(track, segment)
                    }
                    const vibrato = !!(beatEffects & 0x1) || !!(beatEffects & 0x2)

                    if (beatBits & GuitarPro.BEAT_MIX_CHANGE) {
                        this.readMixChange(measure!)
                        mixChange = true
                    }

                    const strings = this.readUInt8() // used strings mask

                    let l = this.len2fraction(len)

                    // Some beat effects could add a Chord before this
                    let cr: ChordRest | null = segment.cr(track)
                    // if (!pause || strings)
                    if (strings) {
                        if (!segment.cr(track)) {
                            cr = Factory.createItem(ElementType.CHORD, scoreDummy(this.score).segment()) as Chord
                        }
                    } else {
                        if (segment.cr(track)) {
                            segment.remove(segment.cr(track)!)
                            cr = null
                        }
                        cr = Factory.createItem(ElementType.REST, scoreDummy(this.score).segment()) as Rest
                    }

                    cr!.setTrack(track)
                    if (lyrics) {
                        cr!.add(lyrics)
                    }

                    const d = new TDuration(l)
                    d.setDots(dotted ? 1 : 0)

                    if (dotted) {
                        l = l.plus(l.times(new Fraction(1, 2)))
                    }

                    if (tuple) {
                        this.addToTuplet(tuplets, staffIdx, measure!, fraction, cr!, track, tuple, l, true)
                    }

                    cr!.setTicks(l)

                    if (cr!.isRest() && l.ge(measure!.ticks())) {
                        cr!.setDurationType(new TDuration(DurationType.V_MEASURE))
                        cr!.setTicks(measure!.ticks())
                    } else {
                        cr!.setDurationType(d)
                    }

                    if (!segment.cr(track)) {
                        segment.add(cr!)
                    }

                    const staff = cr!.staff()!
                    const numStrings = staff.part()!.instrument().stringData().strings()
                    for (let i = 6; i >= 0; --i) {
                        if (strings & (1 << i) && ((6 - i) < numStrings)) {
                            const note = Factory.createItem(ElementType.NOTE, cr) as Note
                            toChord(cr).add(note)
                            if (vibrato) {
                                hasVibratoLeftHand = true
                            }
                            if (dotted) {
                                const dot = Factory.createItem(ElementType.NOTEDOT, note) as NoteDot
                                // there is at most one dotted note in this guitar pro version - set 0 index
                                dot.setParent(note)
                                dot.setTrack(track) // needed to know the staff it belongs to (and detect tablature)
                                dot.setVisible(true)
                                note.add(dot)
                            }
                            const readResult = this.readNote(6 - i, note)
                            hasSlur = readResult.slur || hasSlur
                            hasLetRing = readResult.letRing || hasLetRing
                            hasPalmMute = readResult.palmMute || hasPalmMute
                            hasVibratoLeftHand = readResult.vibrato || hasVibratoLeftHand
                            note.setTpcFromPitch()
                        }
                    }
                    if (cr && cr.isChord() && !toChord(cr).notes().length) {
                        if (segment.cr(track)) {
                            segment.remove(cr)
                        }
                        cr = Factory.createItem(ElementType.REST, segment) as Rest
                        cr.setTicks(l)
                        cr.setTrack(track)
                        cr.setDurationType(d)
                        segment.add(cr)
                    }
                    this.createSlur(hasSlur, staffIdx, cr!)

                    if (cr && (cr.isChord())) {
                        if (beatEffects >= 200) {
                            beatEffects -= 200
                            const art = Factory.createItem(ElementType.ARTICULATION, cr) as Articulation
                            art.setSymId(SymId.guitarFadeOut)
                            art.setAnchor(ArticulationAnchor.TOP)
                            art.setPropertyFlags(Pid.ARTICULATION_ANCHOR, PropertyFlags.UNSTYLED)
                            this.score.toggleArticulation(cr, art)
                        }

                        const hasVibratoLeftHandOnBeat = { value: false }
                        const hasVibratoWTremBarOnBeat = { value: false }
                        this.applyBeatEffects(toChord(cr), beatEffects, hasVibratoLeftHandOnBeat, hasVibratoWTremBarOnBeat)
                        hasVibratoLeftHand = hasVibratoLeftHand || hasVibratoLeftHandOnBeat.value
                        hasVibratoWTremBar = hasVibratoWTremBar || hasVibratoWTremBarOnBeat.value
                        if (this.slide > 0) {
                            this.createSlide(this.slide, cr, staffIdx)
                        }
                    }

                    if (cr) {
                        this.addLetRing(cr, hasLetRing)
                        this.addPalmMute(cr, hasPalmMute)
                        this.addVibratoLeftHand(cr, hasVibratoLeftHand)
                        this.addVibratoWTremBar(cr, hasVibratoWTremBar)
                    }

                    this.restsForEmptyBeats(segment, measure!, cr!, l, track, fraction)
                    fraction = fraction.plus(cr!.actualTicks())
                    measureLen = measureLen.plus(cr!.actualTicks())
                }
                if (measureLen.lt(measure!.ticks())) {
                    this.score.setRest(fraction, track, measure!.ticks().minus(measureLen), false, null, false)
                    this.m_continiousElementsBuilder.notifyUncompletedMeasure()
                }
                let removeRests = true
                let counter = 0
                let lastRest: Rest | null = null
                for (let seg = measure!.first(); seg; seg = seg.next()) {
                    if (seg.segmentType() === SegmentType.ChordRest) {
                        const cr = seg.cr(track)
                        if (cr && cr.isChord()) {
                            removeRests = false
                            break
                        } else if (cr) {
                            ++counter
                            lastRest = cr as Rest
                        }
                    }
                }
                if (removeRests && counter < 2) {
                    removeRests = false
                    if (counter === 1) {
                        lastRest!.setTicks(measure!.timesig())
                        lastRest!.setDurationType(new TDuration(DurationType.V_MEASURE))
                    }
                }
                if (removeRests) {
                    let seg = measure!.first()
                    while (seg && seg !== measure!.last()) {
                        if (seg.segmentType() === SegmentType.ChordRest) {
                            const cr = seg.cr(track)
                            if (cr) {
                                seg.remove(cr)
                            }
                        }
                        seg = seg.next()
                    }
                    const cr = Factory.createItem(ElementType.REST, seg) as Rest
                    cr.setTicks(measure!.timesig())
                    cr.setDurationType(new TDuration(DurationType.V_MEASURE))
                    cr.setTrack(track)
                    seg!.add(cr)
                }
            }
            if (bar === 1 && !mixChange) {
                this.setTempo(temp, this.score.firstMeasure())
            }
        }
        for (const n0 of this.slideList) {
            const n = n0!
            let segment: Segment | null = n.chord()!.segment()!
            let measure1: Measure | null = segment.measure()
            while ((segment = segment!.next1(SegmentType.ChordRest))
                   || ((measure1 = measure1!.nextMeasure()) && (segment = measure1.first()))) {
                // bool br = false;
                const crest = segment.cr(n.track())
                if (!crest) {
                    continue
                }
                if (crest.type() === ElementType.REST) {
                    break
                }
                let cr: Chord | null = toChord(crest)
                if (!cr) {
                    continue
                }
                if (cr.graceNotes().length) {
                    cr = cr.graceNotes()[0]
                }
                if (cr) {
                    for (const nt of cr.notes()) {
                        if (nt.string() === n.string()) {
                            // auto mg = nt->magS();
                            const s = new Glissando(n)
                            s.setAnchor(SpannerAnchor.NOTE)
                            s.setStartElement(n)
                            s.setTick(n.chord()!.segment()!.tick())
                            s.setTrack(n.track())
                            s.setParent(n)
                            s.setGlissandoType(GlissandoType.STRAIGHT)
                            s.setEndElement(nt)
                            s.setTick2(cr.segment()!.tick())
                            s.setTrack2(n.track())
                            this.score.addElement(s)
                            break
                        }
                    }
                }
                break
            }
        }

        this.m_continiousElementsBuilder.addElementsToScore()
        this.m_guitarBendImporter.applyBendsToChords()

        return true
    }

    //---------------------------------------------------------
    //   readBeatEffects
    //---------------------------------------------------------

    protected override readBeatEffects(track: number, segment: Segment): number {
        let effects = 0
        const fxBits = this.readUInt8()

        if (fxBits & GuitarPro.BEAT_EFFECT) {
            effects = this.readUInt8() // effect 1-tapping, 2-slapping, 3-popping
            this.readInt() // we don't need this integer
        }

        if (fxBits & GuitarPro.BEAT_ARPEGGIO) {
            const strokeup = this.readUInt8() // up stroke length
            const strokedown = this.readUInt8() // down stroke length

            let a: Arpeggio | null = Factory.createItem(ElementType.ARPEGGIO, scoreDummy(this.score).chord()) as Arpeggio
            if (strokeup > 0) {
                a.setArpeggioType(ArpeggioType.UP_STRAIGHT)
            } else if (strokedown > 0) {
                a.setArpeggioType(ArpeggioType.DOWN_STRAIGHT)
            } else {
                a = null
            }

            if (a) {
                const cr = Factory.createItem(ElementType.CHORD, segment) as Chord
                cr.setTrack(track)
                cr.add(a)
                segment.add(cr)
            }
        }
        if (fxBits & GuitarPro.BEAT_TREMOLO) {
        }
        if (fxBits & GuitarPro.BEAT_FADE) {
            effects += 200
        }
        if (fxBits & GuitarPro.BEAT_DOTTED) {
        }
        if (fxBits & GuitarPro.BEAT_CHORD) {
        }
        if (effects === 0) {
            return fxBits
        }
        return effects
    }
}
