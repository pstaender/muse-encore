/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importptb.h/.cpp (PowerTab: the import of Power Tab .ptb files).
 * The C++ std::strings of the file are kept as "binary" strings (one char per byte) and decoded as UTF-8 where C++
 * uses UtfCodec.
 */

import type { Buffer } from '../../../framework/global/io/buffer'
import { PointF } from '../../../framework/draw/types/geometry'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { Err } from '../../../engraving/engravingerrors'
import { Articulation } from '../../../engraving/dom/articulation'
import { Bend } from '../../../engraving/dom/bend'
import { Chord } from '../../../engraving/dom/chord'
import type { ChordRest } from '../../../engraving/dom/chordrest'
import { Clef } from '../../../engraving/dom/clef'
import { TDuration } from '../../../engraving/dom/durationtype'
import { Factory } from '../../../engraving/dom/factory'
import { KeySig } from '../../../engraving/dom/keysig'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Measure } from '../../../engraving/dom/measure'
import type { MeasureBase } from '../../../engraving/dom/measurebase'
import { Note } from '../../../engraving/dom/note'
import { PalmMute } from '../../../engraving/dom/palmmute'
import { Part } from '../../../engraving/dom/part'
import { RehearsalMark } from '../../../engraving/dom/rehearsalmark'
import { Rest } from '../../../engraving/dom/rest'
import { SegmentType } from '../../../engraving/dom/segment'
import { Slur } from '../../../engraving/dom/slur'
import { StringData } from '../../../engraving/dom/stringdata'
import { TempoText } from '../../../engraving/dom/tempotext'
import { Text } from '../../../engraving/dom/text'
import { FrameType } from '../../../engraving/dom/textbase'
import { Tie } from '../../../engraving/dom/tie'
import { TimeSig } from '../../../engraving/dom/timesig'
import { Tuplet } from '../../../engraving/dom/tuplet'
import { Fraction } from '../../../engraving/types/fraction'
import { PitchValue } from '../../../engraving/types/pitchvalue'
import { SymId } from '../../../engraving/types/symid'
import { ClefType, Key, NoteHeadGroup, TextStyleType, VOICES } from '../../../engraving/types/types'

// --- muse::UtfCodec on byte strings ---

function bytesOf(s: string): Uint8Array {
    const b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; ++i) {
        b[i] = s.charCodeAt(i) & 0xFF
    }
    return b
}

/** UtfCodec::isValidUtf8 */
function isValidUtf8(s: string): boolean {
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytesOf(s))
        return true
    } catch {
        return false
    }
}

/** UtfCodec::replaceInvalid + String::fromStdString: the UTF-8 text, invalid sequences replaced by U+FFFD */
function fromUtf8ReplaceInvalid(s: string): string {
    return new TextDecoder('utf-8').decode(bytesOf(s))
}

// --- the Power Tab document (nested types of C++ PowerTab) ---

export class PowerTabPtSongInfo {
    classification = 0
    releaseType = 0
    albumType = 0
    day = 0
    month = 0
    year = 0
    style = 0
    level = 0
    liverecording = false
    name = ''
    interpret = ''
    album = ''
    author = ''
    lyricist = ''
    arranger = ''
    guitarTranscriber = ''
    bassTranscriber = ''
    lyrics = ''
    guitarInstructions = ''
    bassInstructions = ''
    instructions = ''
    copyright = ''
}

export enum PowerTabPtComponentType {
    Empty,
    GuitarIn,
    Tempo,
    Symbol,
    Bar,
    Note,
    Beat,
    TDirection,
}

export class PowerTabPtComponent {
    type(): PowerTabPtComponentType { return PowerTabPtComponentType.Empty }
}

export class PowerTabStRhytmSlash extends PowerTabPtComponent {
    position = 0
    duration = 0
    triplet = false
    tripletend = false
    dotted = false
    doubleDotted = false
    is_rest = false
}

export class PowerTabPtGuitarIn extends PowerTabPtComponent {
    rhythmSlash = 1
    staff = 0
    trackinfo = 0
    section = 0
    position = 0
    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.GuitarIn }
}

export class PowerTabPtSymbol extends PowerTabPtComponent {
    constructor(public value = 0) { super() }
    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.Symbol }
}

export class PowerTabPtBar extends PowerTabPtComponent {
    measureNo = 0
    repeatClose = 0
    repeatStart = false

    numerator = 0
    denominator = 0
    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.Bar }
}

export class PowerTabPtNote extends PowerTabPtComponent {
    value = 0
    str = 0
    bend = 0
    tied = false
    dead = false
    hammer = false
    slide = 0
    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.Note }
}

export class PowerTabPtChord extends PowerTabPtComponent {
    key = 0
    formula = 0
    modification = 0
    extra = 0
    top_fret = 0
    frets: number[] = []
}

export class PowerTabPtChordText extends PowerTabPtComponent {
    position = 0
    key = 0
    formula = 0
    formula_mod = 0
    extra = 0
}

export class PowerTabPtBeat extends PowerTabPtComponent {
    position = 0
    staff = 0
    voice = 0
    mmrest = 0
    isRest = false
    duration = 0
    enters = 0
    times = 0
    dotted = false
    tuplet = false
    doubleDotted = false
    vibrato = false
    grace = false
    arpeggioUp = false
    arpeggioDown = false
    palmMute = false
    accent = false
    staccato = false
    notes: PowerTabPtNote[] = []

    constructor(staff = 0, voice = 0) {
        super()
        this.staff = staff
        this.voice = voice
    }

    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.Beat }
}

export enum PowerTabPtDirectionDirection {
    DIRECTION_CODA = 0,
    DIRECTION_DOUBLE_CODA = 1,
    DIRECTION_SEGNO = 2,
    DIRECTION_SEGNO_SEGNO = 3,
    DIRECTION_FINE = 4,
    DIRECTION_DA_CAPO = 5,
    DIRECTION_DAL_SEGNO = 6,
    DIRECTION_DAL_SEGNO_SEGNO = 7,
    DIRECTION_TO_CODA = 8,
    DIRECTION_TO_DOUBLE_CODA = 9,
    DIRECTION_DA_CAPO_AL_CODA = 10,
    DIRECTION_DA_CAPO_AL_DOUBLE_CODA = 11,
    DIRECTION_DAL_SEGNO_AL_CODA = 12,
    DIRECTION_DAL_SEGNO_AL_DOUBLE_CODA = 13,
    DIRECTION_DAL_SEGNO_SEGNO_AL_CODA = 14,
    DIRECTION_DAL_SEGNO_SEGNO_AL_DOUBLE_CODA = 15,
    DIRECTION_DA_CAPO_AL_FINE = 16,
    DIRECTION_DAL_SEGNO_AL_FINE = 17,
    DIRECTION_DAL_SEGNO_SEGNO_AL_FINE = 18,
}

export enum PowerTabPtDirectionActiveSym {
    ACTIVE_SYMBOL_NONE = 0,
    ACTIVE_SYMBOL_DC = 1,
    ACTIVE_SYMBOL_DS = 2,
    ACTIVE_SYMBOL_DSS = 3,
}

export class PowerTabPtDirection extends PowerTabPtComponent {
    direction: PowerTabPtDirectionDirection
    activeSymbol: PowerTabPtDirectionActiveSym
    repeat: number

    constructor(dir: number, sym: number, rep: number) {
        super()
        this.direction = dir
        this.activeSymbol = sym
        this.repeat = rep
    }

    override type(): PowerTabPtComponentType { return PowerTabPtComponentType.TDirection }
}

export class PowerTabPtPosition {
    position = 0
    components: PowerTabPtComponent[] = []

    addComponent(c: PowerTabPtComponent): void {
        this.components.push(c)
    }
}

export class PowerTabTrackInfo {
    number = 0
    name = ''
    instrument = 0
    volume = 0
    balance = 0
    reverb = 0
    chorus = 0
    tremolo = 0
    phaser = 0
    capo = 0
    tuningName = ''
    offset = 0
    strings: number[] = []
    notes_count = 0
}

/** C++ typedef std::list<ptBeat> tBeatList */
export type PowerTabTBeatList = PowerTabPtBeat[]

/** C++ chordData: the key of the chord diagram map */
function chordDataKey(a0: number, a1: number, a2: number): string {
    return `${a0},${a1},${a2}`
}

export class PowerTabPtSection {
    number = 0
    staves = 0
    partName = ''
    partMarker = 0 // C++ char

    positions: PowerTabPtPosition[] = []

    staffMap: number[] = []

    tempo = 0

    rhythm: PowerTabStRhytmSlash[] = []

    /** C++ std::map<int, ptChordText> (iterated in key order) */
    chordTextMap = new Map<number, PowerTabPtChordText>()
    beats: PowerTabTBeatList[] = []
    bars: PowerTabPtBar[] = []
    readed = false

    constructor(num: number) {
        this.number = num
    }

    copyTracks(track: PowerTabPtTrack): void {
        //if not found GuitarIn in section or all tracks are read -> return
        if (this.staves === this.staffMap.length) {
            return
        }

        // C++ chordTextMap.begin() (the smallest position)
        const sortedKeys = [...this.chordTextMap.keys()].sort((a, b) => a - b)
        let signature: PowerTabPtChordText | undefined = sortedKeys.length ? this.chordTextMap.get(sortedKeys[0]) : undefined
        for (let index = 0; index < this.staffMap.length; ++index) {
            const staff = (this.staffMap[index] + 1) * -1
            if (staff < 0) {
                continue
            }

            for (const rt of this.rhythm) {
                const newSig = this.chordTextMap.get(rt.position)
                if (newSig) {
                    signature = newSig
                }

                const beat = new PowerTabPtBeat(staff, 0)
                beat.position = rt.position
                beat.duration = rt.duration
                beat.dotted = rt.dotted
                beat.doubleDotted = rt.doubleDotted
                beat.isRest = rt.is_rest
                beat.tuplet = rt.triplet
                if (!rt.is_rest) {
                    // C++ dereferences chordTextMap.begin() even if the map is empty (undefined behavior)
                    const diagram = signature
                        ? track.diagramMap.get(chordDataKey(signature.key, signature.formula, signature.formula_mod))
                        : undefined

                    if (diagram) {
                        for (let string = 0; string < diagram.frets.length; ++string) {
                            const fret = diagram.frets[string]
                            if (fret >= 0xFE) {
                                continue
                            }
                            const note = new PowerTabPtNote()
                            note.value = fret
                            note.str = string
                            if (fret === 0xFE) {
                                note.dead = true
                                note.value = 0
                            }
                            beat.notes.push(note)
                        }
                    } else {
                        // LOGD() << "diagram wasn't found"
                    }
                }
                while (this.beats.length <= staff) {
                    this.beats.push([])
                }
                this.beats[staff].push(beat)
            }
        }
    }

    getPosition(pos: number): PowerTabPtPosition {
        for (const p of this.positions) {
            if (p.position === pos) {
                return p
            }
        }
        const p = new PowerTabPtPosition()
        p.position = pos
        this.positions.push(p)
        return p
    }

    getNextPositionNumber(): number {
        let next = 0
        for (const p of this.positions) {
            next = Math.max(next, p.position + 1)
        }
        return next
    }
}

export class PowerTabPtTrack {
    infos: PowerTabTrackInfo[] = []
    sections: PowerTabPtSection[] = []
    /** C++ std::map<chordData, ptChord> */
    diagramMap = new Map<string, PowerTabPtChord>()

    guitar_ins: PowerTabPtGuitarIn[] = []

    getSection(ind: number): PowerTabPtSection {
        for (let i = this.sections.length; i < ind + 1; ++i) {
            this.sections.push(new PowerTabPtSection(i))
        }
        return this.sections[ind]
    }
}

export class PowerTabPtSong {
    info = new PowerTabPtSongInfo()
    track1 = new PowerTabPtTrack()
    track2 = new PowerTabPtTrack()
}

const toChar = (b: number): number => (b > 127 ? b - 256 : b)

//---------------------------------------------------------
//   PowerTab
//---------------------------------------------------------

export class PowerTab {
    private _file: Buffer
    private score: MasterScore

    private bars: PowerTabPtBar[] = []

    private lastStaffMap: number[] = []
    private repeatCount = 0

    private staves = 0

    private curTrack!: PowerTabPtTrack
    private staffInc = 0
    private lastPart = 0

    private cur_section: PowerTabPtSection | null = null

    private _palmMutes: (PalmMute | null)[] = []

    constructor(f: Buffer, s: MasterScore) {
        this._file = f
        this.score = s
    }

    private readBoolean(): boolean {
        return this.readUInt8() !== 0
    }

    private readUInt8(): number {
        const b = this._file.read(1)
        return b.length ? b[0] : 0
    }

    private readShort(): number {
        const b = this._file.read(2)
        return (b[0] ?? 0) | ((b[1] ?? 0) << 8)
    }

    private readChar(): number {
        return toChar(this.readUInt8())
    }

    private readInt(): number {
        const b = this._file.read(4)
        return ((b[0] ?? 0) | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) | 0
    }

    private readString(length = -1): string {
        if (length === 0) {
            // LOGE() << "reading string of length zero"
            return ''
        }

        if (length === -1) {
            length = this.readUInt8()
            if (length === 0xFF) {
                length = this.readShort()
            }
        }
        const p = this._file.read(length)
        let s = ''
        for (let i = 0; i < length; ++i) {
            s += String.fromCharCode(p[i] ?? 0)
        }
        return s
    }

    private readVersion(): boolean {
        let version = this.readString(4)
        version += '-' + String(this.readShort())
        return version === 'ptab-4'
    }

    private skip(len = 1): void {
        for (let i = 0; i < len; ++i) {
            this.readChar()
        }
    }

    private readSongInfo(info: PowerTabPtSongInfo): void {
        const classification = this.readChar()
        info.classification = classification
        if (classification === 0) {
            this.skip(1)
            info.name = this.readString()
            info.interpret = this.readString()

            const releaseType = this.readChar()

            switch (releaseType) {
            case 0: {
                /*auto albumType =*/
                this.readChar()
                info.album = this.readString()
                info.year = this.readShort()
                info.liverecording = this.readChar() !== 0
                break
            }
            case 1: {
                info.album = this.readString()
                info.liverecording = this.readChar() !== 0
                break
            }
            case 2: {
                info.album = this.readString()
                info.day = this.readShort()
                info.month = this.readShort()
                info.year = this.readShort()
                break
            }
            case 3: {
                break
            }
            default:
                // C++ assert(0)
                break
            }

            if (this.readChar() === 0) {
                info.author = this.readString()
                info.lyricist = this.readString()
            }

            info.arranger = this.readString()
            info.guitarTranscriber = this.readString()
            info.bassTranscriber = this.readString()
            info.copyright = this.readString()

            info.lyrics = this.readString()

            info.guitarInstructions = this.readString()
            info.bassInstructions = this.readString()
        } else if (classification === 1) {
            info.name = this.readString()
            info.album = this.readString()
            info.style = this.readShort()
            info.level = this.readUInt8()
            info.author = this.readString()
            info.instructions = this.readString()
            info.copyright = this.readString()
        }
    }

    private readHeaderItems(): number {
        const itemCount = this.readShort()
        if (itemCount !== 0) {
            const header = this.readShort()
            if (header === 0xFFFF) {
                if (this.readShort() !== 1) {
                    return -1
                }
                this.readString(this.readShort()) //section title
            }
        }
        return itemCount
    }

    private readTrackInfo(info: PowerTabPtTrack): void {
        const tr = new PowerTabTrackInfo()

        tr.number = this.readUInt8()
        tr.name = this.readString()
        tr.instrument = this.readUInt8()
        tr.volume = this.readUInt8()
        tr.balance = this.readUInt8()
        tr.reverb = this.readUInt8()
        tr.chorus = this.readUInt8()
        tr.tremolo = this.readUInt8()
        tr.phaser = this.readUInt8()
        tr.capo = this.readUInt8()
        tr.tuningName = this.readString()
        tr.offset = this.readUInt8()

        const ln = this.readUInt8()
        for (let i = 0; i < ln; ++i) {
            tr.strings.push(this.readUInt8())
        }
        info.infos.push(tr)
    }

    private readChord(info: PowerTabPtTrack): void {
        const ch = new PowerTabPtChord()
        ch.key = this.readShort() //chord key
        ch.formula = this.readUInt8()
        ch.modification = this.readShort() //Chord Modification
        ch.extra = this.readUInt8()
        ch.top_fret = this.readUInt8()
        const stringCount = this.readUInt8()
        for (let i = 0; i < stringCount; ++i) {
            ch.frets.push(this.readUInt8()) // fret
        }
        const key = chordDataKey(ch.key, ch.formula, ch.modification)
        if (!info.diagramMap.has(key)) {
            info.diagramMap.set(key, ch)
        }
    }

    private readFontSettings(): void {
        this.readString() //font name
        this.readInt() // point size
        this.readInt() // weight
        this.readBoolean() //italic
        this.readBoolean() //underline
        this.readBoolean() //strikeout
        this.readInt() //color
    }

    private readFloatingText(): void {
        this.readString() //text
        //rect :
        this.readInt() // left
        this.readInt() // top
        this.readInt() // right
        this.readInt() // bottom

        this.readUInt8()
        this.readFontSettings()
    }

    private readDynamic(): void {
        this.readShort()
        this.readUInt8()
        this.readUInt8()
        this.readShort()
    }

    private readKeySignature(): void {
        this.readUInt8()
    }

    private readRehearsalSign(sec: PowerTabPtSection): void {
        const c = this.readChar()
        const str = this.readString()
        if (str.length) {
            sec.partName = str
            sec.partMarker = c
        }
    }

    private readChordText(sec: PowerTabPtSection): void {
        const cht = new PowerTabPtChordText()
        cht.position = this.readUInt8()
        cht.key = this.readShort()
        cht.formula = this.readUInt8()
        cht.formula_mod = this.readShort()
        cht.extra = this.readUInt8()
        // C++ std::map::insert: an existing position is not replaced
        if (!sec.chordTextMap.has(cht.position)) {
            sec.chordTextMap.set(cht.position, cht)
        }
    }

    private readRhytmSlash(sec: PowerTabPtSection): void {
        const rs = new PowerTabStRhytmSlash()
        rs.position = this.readUInt8()
        const beaming = this.readUInt8()
        const data = this.readInt()
        const duration = (data & 0xE00000) >> 21
        switch (duration) {
        case 0:
            rs.duration = 1
            break
        case 1:
            rs.duration = 2
            break
        case 2:
            rs.duration = 4
            break
        case 3:
            rs.duration = 8
            break
        case 4:
            rs.duration = 16
        }

        rs.triplet = (beaming & (0x20 | 0x40)) !== 0
        rs.tripletend = (beaming & 0x80) !== 0

        rs.dotted = (data & 0x01) !== 0
        rs.doubleDotted = (data & 0x02) !== 0

        rs.is_rest = (data & 0x04) !== 0

        sec.rhythm.push(rs)
    }

    private readGuitarIn(info: PowerTabPtTrack): void {
        const gin = new PowerTabPtGuitarIn()
        gin.section = this.readShort()
        gin.staff = this.readUInt8() + this.staffInc
        gin.position = this.readUInt8()
        gin.rhythmSlash = this.readUInt8()
        gin.trackinfo = this.readUInt8()
        info.guitar_ins.push(gin)
    }

    private readTempoMarker(info: PowerTabPtTrack): void {
        const section = this.readShort()
        /*auto position =*/ this.readUInt8()
        const tempo = this.readShort()
        /*auto data =*/ this.readShort()
        this.readString() //description

        if (tempo > 0) {
            info.getSection(section).tempo = tempo
        }
    }

    private readSectionSymbol(info: PowerTabPtTrack): void {
        const section = this.readShort()
        const position = this.readUInt8()
        const data = this.readInt()

        const endNumber = data >> 16
        info.getSection(section).getPosition(position).addComponent(new PowerTabPtSymbol(endNumber))
    }

    private readTimeSignature(bar: PowerTabPtBar): void {
        this.skip(3)
        const data = this.readUInt8()
        this.readUInt8() // measure pulses

        bar.numerator = ((data - (data % 8)) / 8) + 1
        bar.denominator = Math.pow(2, data % 8)
    }

    private readBarLine(sec: PowerTabPtSection): void {
        const bar = new PowerTabPtBar()
        /*int position =*/ this.readUInt8()
        const b_type = this.readUInt8()

        bar.repeatStart = (b_type >> 5) === 3
        bar.repeatClose = (b_type >> 5) === 4 ? b_type - 128 : 0

        bar.measureNo = sec.number

        this.readKeySignature()
        this.readTimeSignature(bar)
        this.readRehearsalSign(sec)
        sec.bars.push(bar)
    }

    private readStaff(staff: number, sec: PowerTabPtSection): void {
        this.skip(5)
        for (let voice = 0; voice < 2; ++voice) {
            const itemCount = this.readHeaderItems()
            for (let i = 0; i < itemCount; ++i) {
                this.readPosition(staff, voice, sec)
                if (i < itemCount - 1) {
                    this.readShort()
                }
            }
        }
    }

    private readNote(beat: PowerTabPtBeat): void {
        const note = new PowerTabPtNote()
        const position = this.readUInt8()
        const simpleData = this.readShort()
        const symbolCount = this.readUInt8()
        for (let i = 0; i < symbolCount; ++i) {
            this.skip(2)
            const data3 = this.readUInt8()
            const data4 = this.readUInt8()
            note.bend = data4 === 101 ? Math.trunc(data3 / 16) + 1 : 0
            note.slide = data4 === 100 ? data3 + 1 : 0
        }
        note.value = position & 0x1F
        note.str = ((position & 0xE0) >> 5)
        note.tied = (simpleData & 0x01) !== 0
        note.dead = (simpleData & 0x02) !== 0
        note.hammer = (simpleData & 0x08) !== 0
        beat.notes.push(note)
    }

    private readPosition(staff: number, voice: number, sec: PowerTabPtSection): void {
        const position = this.readUInt8()

        let beat = new PowerTabPtBeat()
        beat.position = position
        beat.voice = voice
        let add = false
        if (voice === 0 || staff >= sec.beats.length || sec.beats[staff].length === 0) {
            beat = new PowerTabPtBeat(staff, voice)
            beat.position = position
            add = true
        }
        let beaming = this.readUInt8()
        beaming = ((beaming - 128 < 0) ? beaming : beaming - 128)

        this.readUInt8()

        const data1 = this.readUInt8()
        const data2 = this.readUInt8() //32 - palm mute, 4 - accent, 2 - staccato
        const data3 = this.readUInt8()
        let durationValue = this.readUInt8()

        let multiBarRest = 1
        const complexCount = this.readUInt8()
        for (let i = 0; i < complexCount; ++i) {
            const count = this.readShort()
            this.readUInt8()
            const type = this.readUInt8()
            if (type & 0x08) {
                multiBarRest = count
            }
        }

        const itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readNote(beat)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }

        if (staff < 0 || staff >= this.curTrack.infos.length) {
            // LOGE() << "Invalid staff index"
            return
        }
        this.curTrack.infos[staff].notes_count += itemCount

        beat.mmrest = (itemCount === 0) ? multiBarRest : 1
        beat.vibrato = (((data1 & 0x08) !== 0) || ((data1 & 0x10) !== 0))
        beat.grace = (data3 & 0x01) !== 0
        beat.tuplet = (data3 & 0x20) !== 0

        if (beat.duration !== 0) {
            durationValue = Math.max(durationValue, beat.duration) & 0xFF // C++ assigns to a uint8_t
        }

        beat.duration = durationValue
        beat.dotted = (data1 & 0x01) !== 0
        beat.doubleDotted = (data1 & 0x02) !== 0
        beat.arpeggioUp = (data1 & 0x20) !== 0
        beat.arpeggioDown = (data1 & 0x40) !== 0
        beat.enters = ((beaming - (beaming % 8)) / 8) + 1
        beat.times = (beaming % 8) + 1
        beat.isRest = (data1 & 0x04) !== 0
        beat.palmMute = (data2 & 0x20) !== 0
        beat.accent = (data2 & 0x04) !== 0
        beat.staccato = (data2 & 0x02) !== 0

        for (let i = sec.beats.length; i < staff + 1; ++i) {
            sec.beats.push([])
        }
        if (add) {
            sec.beats[staff].push(beat)
        }
    }

    private getStaffMap(sec: PowerTabPtSection): number[] {
        let result: number[] = []
        const slash: number[] = []
        if (!this.staffInc && this.curTrack.guitar_ins.length) {
            let first = this.curTrack.guitar_ins[0]
            while (first.section === sec.number) {
                if (first.trackinfo) {
                    for (let i = 0; i < this.curTrack.infos.length; ++i) {
                        if ((1 << i) & first.trackinfo) {
                            result.push(i)
                        }
                    }
                }

                if (first.rhythmSlash) {
                    for (let i = 0; i < this.curTrack.infos.length; ++i) {
                        if ((i << 1) & first.rhythmSlash) {
                            slash.push(-1 - i)
                        }
                    }
                }

                this.curTrack.guitar_ins.shift()
                if (!this.curTrack.guitar_ins.length) {
                    break
                }
                first = this.curTrack.guitar_ins[0]
            }
        }

        if (!result.length || result.length < sec.staves) {
            result = []
            if (this.lastStaffMap.length < sec.staves) {
                for (let i = 0; i < sec.staves; ++i) {
                    result.push(i + this.staffInc)
                }
            } else {
                result = this.lastStaffMap.slice()
            }
        }

        // negative numbers
        //    for (auto i : slash) {
        //        result.push_back(i);
        //    }

        this.lastStaffMap = result.slice()
        return result
    }

    //---------------------------------------------------------
    //   addPalmMate
    //---------------------------------------------------------

    private addPalmMute(chord: Chord): void {
        const track = chord.track()
        while (this._palmMutes.length < track + 1) {
            this._palmMutes.push(null)
        }

        const cur = this._palmMutes[track]
        if (cur) {
            const pm = cur
            const lastChord = pm.endCR()
            if (lastChord === chord) {
                return
            }
            //
            // extend the current palm mute or start a new one
            //
            const tick = chord.segment()!.tick()
            if (pm.tick2().lt(tick)) {
                this._palmMutes[track] = null
            } else {
                pm.setTick2(chord.endTick())
                pm.setEndElement(chord)
            }
        }
        if (!this._palmMutes[track]) {
            const pm = new PalmMute(scoreDummy(this.score))
            this._palmMutes[track] = pm
            const segment = chord.segment()!
            const tick = segment.tick()

            pm.setTick(tick)
            pm.setTick2(tick.plus(chord.actualTicks()))
            pm.setTrack(track)
            pm.setTrack2(track)
            pm.setStartElement(chord)
            pm.setEndElement(chord)
            this.score.addElement(pm)
        }
    }

    private fillMeasure(elist: PowerTabTBeatList, measure: Measure, staff: number, tiedNotes: (Note | null)[]): void {
        let tuple: Tuplet | null = null
        let tupleBeatCounter = 0
        let tick = measure.tick()
        const endtick = measure.endTick()
        let hammer: Chord | null = null

        while (elist.length && tick.lt(endtick)) {
            const beat = elist[0]
            const segment = measure.getSegment(SegmentType.ChordRest, tick)
            let l = new Fraction(1, beat.duration)
            const dots = beat.dotted ? (beat.doubleDotted ? 2 : 1) : (beat.doubleDotted ? 2 : 0)
            switch (dots) {
            case 1:
                l = l.plus(l.times(new Fraction(1, 2)))
                break
            case 2:
                l = l.plus(l.times(new Fraction(3, 4)))
                break
            }

            const d = new TDuration(l)
            d.setDots(dots)

            if (beat.tuplet || tupleBeatCounter) {
                const nt = l.times(new Fraction(1, 3)).times(new Fraction(2, 1))
                tick = tick.plus(nt)
            } else {
                tick = tick.plus(l)
            }
            let cr: ChordRest
            if (!beat.notes.length) {
                const rest = new Rest(segment)
                cr = rest
                rest.setTrack(staff * VOICES)
                rest.setTicks(l)
                rest.setDurationType(d)
                segment.add(rest)
            } else {
                const chord = new Chord(segment)
                cr = chord
                chord.setTrack(staff * VOICES)
                chord.setTicks(l)
                chord.setDurationType(d)
                segment.add(chord)

                if (beat.palmMute) {
                    this.addPalmMute(chord)
                }
                if (beat.accent) {
                    const accent = new Articulation(chord)
                    accent.setSymId(SymId.articAccentAbove)
                    chord.add(accent)
                }
                if (beat.staccato) {
                    const st = new Articulation(chord)
                    st.setSymId(SymId.articStaccatoAbove)
                    chord.add(st)
                }
                let has_hammer = false
                for (const n of beat.notes) {
                    if (n.str < 0 || n.str >= tiedNotes.length) {
                        // LOGE() << "string index out of range, skipping note"
                        continue
                    }

                    const trackStrings = this.curTrack.infos[staff].strings
                    if (!trackStrings.length) {
                        // LOGE() << "track has no strings, skipping note"
                        continue
                    }

                    const sd = this.score.staff(staff)!.part()!.instrument().stringData()
                    const k = Math.max(trackStrings.length - n.str - 1, 0)
                    if (!sd || k >= sd.stringList().length) {
                        // LOGE() << "string data missing for note pitch"
                        continue
                    }

                    const note = new Note(chord)
                    chord.add(note)
                    if (n.dead) {
                        note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                        note.setGhost(true)
                    }

                    if (n.hammer) {
                        has_hammer = true
                    }

                    const tiedNote = tiedNotes[n.str]
                    if (n.tied && tiedNote) {
                        const tie = new Tie(tiedNote)
                        tie.setEndNote(note)
                        tiedNote.add(tie)
                    }

                    if (n.bend) {
                        const bend = new Bend(note)
                        //TODO-ws                              bend->setNote(note);
                        bend.points().push(new PitchValue(0, n.bend * 25 - 12))
                        bend.points().push(new PitchValue(50, 0))
                        note.add(bend)
                    }

                    // C++ `if (false && n.slide)`: the slide text is not created

                    tiedNotes[n.str] = note
                    note.setFret(n.value)
                    note.setString(n.str)
                    const pitch = sd.stringList()[k].pitch + n.value //getPitch(n.str, n.value, 0);
                    note.setPitch(pitch)
                    note.setTpcFromPitch()
                }

                if (hammer) {
                    const cr1: Chord = hammer
                    const cr2 = chord
                    hammer = null

                    const slur = new Slur(scoreDummy(this.score))
                    slur.setStartElement(cr1)
                    slur.setEndElement(cr2)
                    slur.setTick(cr1.tick())
                    slur.setTick2(tick)
                    slur.setTrack(staff * VOICES)
                    slur.setTrack2(staff * VOICES)
                    this.score.addElement(slur)

                    const st = new Text(chord.notes()[0], TextStyleType.HARMONY_A)
                    st.setXmlText('H')
                    st.setTrack(staff * VOICES)
                    cr1.notes()[0].add(st)
                }
                if (has_hammer) {
                    hammer = chord
                }
            }

            if (tupleBeatCounter && tuple) {
                tupleBeatCounter--
                cr.setTuplet(tuple)
                tuple.add(cr)
            }

            if (beat.tuplet && !tuple) {
                tuple = new Tuplet(measure)
                tuple.setParent(measure)
                tuple.setTrack(cr.track())
                tuple.setBaseLen(new TDuration(l))
                tuple.setRatio(new Fraction(3, 2))
                tuple.setTicks(l.times(tuple.ratio().denominator()))
                cr.setTuplet(tuple)
                tuple.add(cr)
                tupleBeatCounter = 2
            }
            elist.shift()
        }

        if (tick.eq(measure.tick())) {
            const seg = measure.getSegment(SegmentType.ChordRest, tick)
            const rest = new Rest(seg)
            rest.setTrack(staff * VOICES)
            const ts = measure.timesig()
            rest.setTicks(ts)
            rest.setDurationType(new TDuration(ts))
            seg.add(rest)
        }
    }

    private addToScore(sec: PowerTabPtSection): void {
        this.cur_section = sec
        const score = this.score
        const tick = score.lastMeasure() ? score.lastMeasure()!.endTick() : new Fraction(0, 1)

        let lastTS = new Fraction(-1, -1)
        let firstMeasure = true
        if (score.lastMeasure()) {
            lastTS = score.lastMeasure()!.timesig()
            firstMeasure = false
        }
        if (firstMeasure) {
            //int lastStaff = sec.staffMap.back() + 1;
            for (let i = 0; i < this.staves; ++i) {
                const part = new Part(score)
                const s = Factory.createStaff(part)
                const info = this.curTrack.infos[i]
                const ss = info.name
                let staffName: string
                if (isValidUtf8(ss)) {
                    staffName = fromUtf8ReplaceInvalid(ss)
                } else {
                    // invalid utf most likely windows-125x used
                    staffName = 'part ' + String(i + 1)
                }
                part.setPartName(staffName)
                part.setPlainLongName(staffName)

                const reverseStr = info.strings.slice().reverse()
                const stringData = StringData.fromPitches(32, info.strings.length, reverseStr)
                part.instrument().setStringData(stringData)

                part.setMidiProgram(info.instrument)
                part.setMidiChannel(info.number)

                score.appendStaff(s)
                score.appendPart(part)
            }
        }
        let bar1 = sec.bars[0]
        while (bar1.denominator === 0) {
            if (sec.bars.length === 1) {
                break
            }
            sec.bars.shift()
            bar1 = sec.bars[0]
        }
        if (bar1.denominator === 0) {
            bar1.denominator = 4
            bar1.numerator = 4
        }
        let measure = this.createMeasure(bar1, tick)
        if (this.repeatCount) {
            measure.setRepeatEnd(true)
            measure.setRepeatCount(this.repeatCount)
        }
        this.repeatCount = bar1.repeatClose
        if (bar1.repeatStart) {
            measure.setRepeatStart(true)
        }
        if (sec.bars.length > 1) {
            sec.bars.shift()
        }
        if (sec.tempo) {
            const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
            const tt = new TempoText(segment)
            tt.setTempo(sec.tempo / 60.0)
            tt.setXmlText(`<sym>metNoteQuarterUp</sym> = ${sec.tempo}`)
            tt.setTrack(0)
            segment.add(tt)
            score.setTempo(measure.tick(), tt.tempo())
        }
        if (sec.partName.length && this.lastPart !== sec.partMarker) {
            this.lastPart = sec.partMarker
            const seg = measure.getSegment(SegmentType.ChordRest, measure.tick())
            let t = new RehearsalMark(seg)
            t.setFrameType(FrameType.SQUARE)
            t.setPlainText(String.fromCharCode(sec.partMarker & 0xFF))
            t.setTrack(0)
            seg.add(t)

            t = new RehearsalMark(seg)
            t.setFrameType(FrameType.NO_FRAME)
            t.setPlainText(fromUtf8ReplaceInvalid(sec.partName))
            t.setOffset(new PointF(10.0, 0.0))
            t.setTrack(0)
            seg.add(t)
        }
        if (firstMeasure) {
            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                const keysig = staffIdx >= this.staffInc ? 0 : 1 // Can be parsed int beat section
                let s = measure.getSegment(SegmentType.KeySig, tick)
                const t = new KeySig(s)
                t.setKey(keysig as Key)
                t.setTrack(staffIdx * VOICES)
                s.add(t)

                const clefId = staffIdx >= this.staffInc ? ClefType.F8_VB : ClefType.G15_MB
                s = measure.getSegment(SegmentType.HeaderClef, new Fraction(0, 1))
                const clef = new Clef(s)
                clef.setTrack(staffIdx * VOICES)
                clef.setClefType(clefId)
                s.add(clef)
            }
        }

        const tiedNotes: (Note | null)[][] = []
        for (let i = 0; i < this.staves; ++i) {
            tiedNotes.push(new Array<Note | null>(10).fill(null))
        }

        if (sec.beats.length > this.staves) {
            // LOGE() << "Found more beat lists than staves, some beat lists will be skipped"
        }

        //std::vector<tBeatList>
        for (;;) {
            let empty = true
            while (sec.beats.length < this.staves) {
                sec.beats.push([])
            }
            for (let i = 0; i < sec.beats.length && i < tiedNotes.length; ++i) {
                this.fillMeasure(sec.beats[i], measure, i, tiedNotes[i])
                if (sec.beats[i].length && i < this.staffInc) {
                    empty = false
                }
            }
            if (lastTS.ne(measure.timesig())) {
                lastTS = measure.timesig()
                for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                    const staff = score.staff(staffIdx)!
                    const staffType = staff.staffType(new Fraction(0, 1))
                    if (staffType.genTimesig()) {
                        const s = measure.getSegment(SegmentType.TimeSig, measure.tick())
                        const t = new TimeSig(s)
                        t.setTrack(staffIdx * VOICES)
                        t.setSig(lastTS)
                        s.add(t)
                    }
                }
            }
            if (empty) {
                break
            }
            let bar = sec.bars[0]
            while (bar.denominator === 0) {
                if (sec.bars.length === 1) {
                    break
                }
                sec.bars.shift()
                bar = sec.bars[0]
            }
            if (bar.denominator === 0) {
                bar.denominator = measure.timesig().denominator()
                bar.numerator = measure.timesig().numerator()
            }
            measure = this.createMeasure(bar, measure.endTick())
            if (this.repeatCount) {
                measure.setRepeatEnd(true)
                measure.setRepeatCount(this.repeatCount)
            }
            this.repeatCount = bar.repeatClose
            if (bar.repeatStart) {
                measure.setRepeatStart(true)
            }
            if (sec.bars.length > 2) {
                sec.bars.shift()
            }
        }
        if (sec.bars.length) {
            const bar = sec.bars[sec.bars.length - 1]
            if (bar.repeatStart) {
                measure.setRepeatStart(true)
            }
            if (bar.repeatClose) {
                measure.setRepeatEnd(true)
                measure.setRepeatCount(bar.repeatClose)
            }
            sec.bars = []
        }
    }

    private readSection(sec: PowerTabPtSection): void {
        //rect:
        this.readInt() // left
        this.readInt() // top
        this.readInt() // right
        this.readInt() // bottom

        const lastBarData = this.readUInt8()

        this.skip(4) //spacing from staff

        this.readBarLine(sec)

        let itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readDirection(sec)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //ChordText section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readChordText(sec)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //RhytmSlash
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readRhytmSlash(sec)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        // Staff
        sec.staves = this.readHeaderItems()
        sec.staffMap = this.getStaffMap(sec)
        for (let i = 0; i < sec.staves; ++i) {
            const staff = sec.staffMap[i]
            this.readStaff(staff, sec)
            if (i < sec.staves - 1) {
                this.readShort()
            }
        }
        sec.copyTracks(this.curTrack)
        // MusicBar section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readBarLine(sec)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }

        const bar = new PowerTabPtBar()
        bar.repeatClose = (lastBarData >> 5 === 4) ? lastBarData - 128 : 0
        sec.bars.push(bar)
    }

    private readDirection(sec: PowerTabPtSection): void {
        const position = this.readUInt8()
        const symbolCount = this.readUInt8()
        for (let i = 0; i < symbolCount; ++i) {
            const data = this.readShort()
            sec.getPosition(position).addComponent(new PowerTabPtDirection((data >> 8), ((data & 0xC0) >> 6), (data & 0x1F)))
        }
    }

    private readDataInstruments(info: PowerTabPtTrack): void {
        this.curTrack = info
        //Guitar section
        let itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readTrackInfo(info)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        // Chord Diagram Section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readChord(info)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //Floating Text section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readFloatingText()
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        // GuitarIn section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readGuitarIn(info)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        // Tempo marker
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readTempoMarker(info)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //Dynamic section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readDynamic()
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //Symbol section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readSectionSymbol(info)
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
        //Section section
        itemCount = this.readHeaderItems()
        for (let i = 0; i < itemCount; ++i) {
            this.readSection(info.getSection(i))
            if (i < itemCount - 1) {
                this.readShort()
            }
        }
    }

    private createMeasure(bar: PowerTabPtBar, tick: Fraction): Measure {
        const measure = new Measure(this.score.dummySystem())
        const nts = new Fraction(bar.numerator, bar.denominator)

        measure.setTick(tick)
        measure.setTimesig(nts)
        measure.setTicks(nts)

        this.score.measures().append(measure)

        return measure
    }

    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    read(): Err {
        if (!this.readVersion()) {
            return Err.FileBadFormat
        }
        const song = new PowerTabPtSong()

        this.readSongInfo(song.info)
        this.readDataInstruments(song.track1)
        this.staffInc = song.track1.infos.length
        this.lastStaffMap = []
        this.readDataInstruments(song.track1)

        this.staves = song.track1.infos.length

        const parts: PowerTabTBeatList[] = []
        for (let i = 0; i < this.staves; ++i) {
            parts.push([])
        }
        for (let i = this.staffInc; i < this.staves; ++i) {
            for (const sec of song.track1.sections) {
                while (sec.beats.length < this.staves) {
                    sec.beats.push([])
                }
                parts[i].push(...sec.beats[i])
                sec.beats[i] = []
            }
        }

        for (const sec of song.track1.sections) {
            for (let i = 0; i < this.staves; ++i) {
                if (parts[i].length) {
                    sec.beats[i].unshift(...parts[i])
                    parts[i] = []
                }
            }
            this.addToScore(sec)
            for (let i = 0; i < this.staves; ++i) {
                parts[i] = sec.beats[i].slice()
            }
        }

        let m: MeasureBase
        const score = this.score
        if (!score.measures().first()) {
            m = Factory.createTitleVBox(score.dummySystem())
            score.measures().append(m)
        } else {
            m = score.measures().first()!
            if (!m.isVBox()) {
                const mb = Factory.createTitleVBox(score.dummySystem())
                score.addMeasure(mb, m)
                m = mb
            }
        }
        // create title
        const name = song.info.name
        if (name.length) {
            const s = new Text(m, TextStyleType.TITLE)
            s.setPlainText(fromUtf8ReplaceInvalid(name))
            m.add(s)
        }
        return Err.NoError
    }
}
