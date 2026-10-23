/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/capella/internal/capella.h/.cpp: the Capella 2000 (.cap, binary) import filter and the
 * conversion of the Capella data (also read from CapXML files, see capxml.ts) into a score.
 * QFont/QColor/QPointF are replaced by small value classes; the binary file is read from a Uint8Array.
 */

import { Fraction } from '../../../engraving/types/fraction'
import { Spatium } from '../../../engraving/types/dimension'
import {
    Align, AlignH, AlignV, ArpeggioType, BarLineType, BracketType, ClefType, DirectionV, DPMM, DurationType, Key,
    LayoutBreakType, LyricsSyllabic, NoteHeadGroup, PreferSharpFlat, TextStyleType, TrillType, VOICES, trackZeroVoice,
} from '../../../engraving/types/types'
import { SymId } from '../../../engraving/types/symid'
import { Sid } from '../../../engraving/style/styledef'
import { PointF } from '../../../framework/draw/types/geometry'
import type { Score } from '../../../engraving/dom/score'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import type { Measure } from '../../../engraving/dom/measure'
import type { MeasureBase } from '../../../engraving/dom/measurebase'
import { type Segment, SegmentType } from '../../../engraving/dom/segment'
import type { ChordRest } from '../../../engraving/dom/chordrest'
import { NoteType } from '../../../engraving/dom/chordrest'
import { Chord } from '../../../engraving/dom/chord'
import { Note } from '../../../engraving/dom/note'
import { Rest } from '../../../engraving/dom/rest'
import { Tuplet } from '../../../engraving/dom/tuplet'
import { mtrc } from '../../../framework/global/translation'
import { TDuration, toDurationList } from '../../../engraving/dom/durationtype'
import { Dynamic } from '../../../engraving/dom/dynamic'
import { Articulation } from '../../../engraving/dom/articulation'
import { Breath } from '../../../engraving/dom/breath'
import { Arpeggio } from '../../../engraving/dom/arpeggio'
import { StaffText } from '../../../engraving/dom/stafftextbase'
import { Harmony } from '../../../engraving/dom/harmony'
import { Text } from '../../../engraving/dom/text'
import { VBox } from '../../../engraving/dom/box'
import { TimeSig } from '../../../engraving/dom/timesig'
import { Tie } from '../../../engraving/dom/tie'
import { Lyrics } from '../../../engraving/dom/lyrics'
import { Clef } from '../../../engraving/dom/clef'
import { KeySig } from '../../../engraving/dom/keysig'
import { SigEvent } from '../../../engraving/dom/sig'
import { Slur } from '../../../engraving/dom/slur'
import { Volta, VoltaType } from '../../../engraving/dom/volta'
import { Trill } from '../../../engraving/dom/trill'
import { Hairpin, HairpinType } from '../../../engraving/dom/hairpin'
import { SpannerAnchor } from '../../../engraving/dom/spanner'
import { LayoutBreak } from '../../../engraving/dom/layoutbreak'
import { Part } from '../../../engraving/dom/part'
import { Interval } from '../../../engraving/dom/interval'
import { Factory } from '../../../engraving/dom/factory'
import { pitchKeyAdjust } from '../../../engraving/dom/utils'
import { clampPitch } from '../../../engraving/dom/pitchspelling'
import { Transpose } from '../../../engraving/editing/transpose'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { rtf2html } from './rtf2html'

const CAPELLA_TRACE_ENABLED = false

function CAPELLA_TRACE(...args: unknown[]): void {
    if (CAPELLA_TRACE_ENABLED) {
        console.debug(...args)
    }
}

function LOGD(...args: unknown[]): void {
    if (CAPELLA_TRACE_ENABLED) {
        console.debug(...args)
    }
}

export enum TIMESTEP {
    D1, D2, D4, D8, D16, D32, D64, D128, D256, D_BREVE,
}

export enum CapellaNoteObjectType {
    REST, CHORD, CLEF, KEY, METER, EXPL_BARLINE, IMPL_BARLINE,
    PAGE_BKGR,
}

export enum CapBeamMode {
    AUTO, FORCE, SPLIT,
}

/** C++ Capella::Error (thrown as an exception) */
export enum CapellaErrorCode {
    CAP_NO_ERROR, BAD_SIG, CAP_EOF, BAD_VOICE_SIG,
    BAD_STAFF_SIG, BAD_SYSTEM_SIG, BAD_FORMAT,
}

/** the C++ `throw Capella::Error` */
export class CapellaError extends Error {
    constructor(readonly errNo: CapellaErrorCode) {
        super(Capella.errmsg[errNo])
    }
}

/** the parts of QFont the importer uses */
export class CapFont {
    family = ''
    /** QFont's default point size (the application font) */
    pointSizeF = 12
    italic = false
    bold = false
    underline = false
    strikeOut = false

    clone(): CapFont {
        return Object.assign(new CapFont(), this)
    }
}

/** QColor as 0xRRGGBB */
export type CapColor = number

const BLACK: CapColor = 0x000000

//---------------------------------------------------------
//   CapellaObj
//---------------------------------------------------------

export class CapellaObj {
    constructor(protected cap: Capella) {}
}

export enum Form {
    G, C, F, PERCUSSION,
    FORM_NULL, CLEF_UNCHANGED,
}

export enum ClefLine {
    L5, L4, L3, L2, L1,
}

export enum Oct {
    OCT_ALTA, OCT_NULL, OCT_BASSA,
}

//---------------------------------------------------------
//   CapClef
//---------------------------------------------------------

export class CapClef extends CapellaObj {
    form: Form = Form.G
    line: ClefLine = ClefLine.L5
    oct: Oct = Oct.OCT_ALTA

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.CLEF }

    read(): void {
        const b = this.cap.readByte()
        this.form = (b & 7) as Form
        this.line = ((b >> 3) & 7) as ClefLine
        this.oct = (b >> 6) as Oct
        CAPELLA_TRACE(`Clef::read form ${this.form} line ${this.line} oct ${this.oct}`)
    }

    name(): string {
        const formName = ['G', 'C', 'F', '=', ' ', '*']
        return formName[this.form]
    }

    clef(): ClefType {
        return CapClef.clefType(this.form, this.line, this.oct)
    }

    static clefType(form: Form, line: ClefLine, oct: Oct): ClefType {
        const idx = form + (line << 3) + (oct << 5)
        switch (idx) {
        case Form.G + (ClefLine.L2 << 3) + (Oct.OCT_NULL << 5): return ClefType.G
        case Form.G + (ClefLine.L2 << 3) + (Oct.OCT_ALTA << 5): return ClefType.G8_VA
        case Form.G + (ClefLine.L2 << 3) + (Oct.OCT_BASSA << 5): return ClefType.G8_VB

        case Form.C + (ClefLine.L1 << 3) + (Oct.OCT_NULL << 5): return ClefType.C1
        case Form.C + (ClefLine.L2 << 3) + (Oct.OCT_NULL << 5): return ClefType.C2
        case Form.C + (ClefLine.L3 << 3) + (Oct.OCT_NULL << 5): return ClefType.C3
        case Form.C + (ClefLine.L4 << 3) + (Oct.OCT_NULL << 5): return ClefType.C4
        case Form.C + (ClefLine.L4 << 3) + (Oct.OCT_BASSA << 5): return ClefType.C4_8VB
        case Form.C + (ClefLine.L5 << 3) + (Oct.OCT_NULL << 5): return ClefType.C5

        case Form.F + (ClefLine.L4 << 3) + (Oct.OCT_NULL << 5): return ClefType.F
        case Form.F + (ClefLine.L4 << 3) + (Oct.OCT_BASSA << 5): return ClefType.F8_VB
        case Form.F + (ClefLine.L3 << 3) + (Oct.OCT_NULL << 5): return ClefType.F_B
        case Form.F + (ClefLine.L5 << 3) + (Oct.OCT_NULL << 5): return ClefType.F_C

        default:
            if (form === Form.FORM_NULL) {
                return ClefType.INVALID
            }
            LOGD(`unknown clef ${form} ${line} ${oct}`)
            break
        }
        return ClefType.INVALID
    }
}

//---------------------------------------------------------
//   CapKey
//---------------------------------------------------------

export class CapKey extends CapellaObj {
    signature = 0 // -7 - +7

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.KEY }

    read(): void {
        const b = this.cap.readByte()
        this.signature = b - 7
    }
}

//---------------------------------------------------------
//   CapMeter
//---------------------------------------------------------

export class CapMeter extends CapellaObj {
    numerator = 0
    log2Denom = 0
    allaBreve = false

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.METER }

    read(): void {
        this.numerator = this.cap.readByte()
        const d = this.cap.readByte()
        this.log2Denom = (d & 0x7f) - 1
        this.allaBreve = (d & 0x80) !== 0
        CAPELLA_TRACE(`   Meter ${this.numerator}/${this.log2Denom} allaBreve ${this.allaBreve}`)
        if (this.log2Denom > 7 || this.log2Denom < 0) {
            LOGD('   illegal fraction')
            this.log2Denom = 2
            this.numerator = 4
        }
    }
}

//---------------------------------------------------------
//   CapExplicitBarline
//---------------------------------------------------------

export class CapExplicitBarline extends CapellaObj {
    m_type: BarLineType = BarLineType.NORMAL
    m_barMode = 0 // 0 = auto, 1 = nur Zeilen, 2 = durchgezogen

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.EXPL_BARLINE }
    barLineType(): BarLineType { return this.m_type }
    barMode(): number { return this.m_barMode }

    read(): void {
        const b = this.cap.readByte()
        const type = b & 0x0f
        if (type === 0) {
            this.m_type = BarLineType.NORMAL
        } else if (type === 1) {
            this.m_type = BarLineType.DOUBLE
        } else if (type === 2) {
            this.m_type = BarLineType.END
        } else if (type === 3) {
            this.m_type = BarLineType.END_REPEAT
        } else if (type === 4) {
            this.m_type = BarLineType.START_REPEAT
        } else if (type === 5) {
            this.m_type = BarLineType.END_START_REPEAT
        } else if (type === 6) {
            this.m_type = BarLineType.BROKEN
        } else {
            this.m_type = BarLineType.NORMAL // default
        }
        this.m_barMode = b >> 4 // 0 = auto, 1 = nur Zeilen, 2 = durchgezogen
        if (!(this.m_barMode <= 2)) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        CAPELLA_TRACE(`         Expl.Barline type ${this.m_type} mode ${this.m_barMode}`)
    }
}

/** C++ NoteObj (the objects of a voice) */
export type NoteObj = CapClef | CapKey | CapMeter | CapExplicitBarline | ChordObj | RestObj

//---------------------------------------------------------
//   CapVoice
//---------------------------------------------------------

export class CapVoice {
    y0Lyrics = 0
    dyLyrics = 0
    lyricsFont = new CapFont()
    stemDir = 0
    objects: NoteObj[] = []
    voiceNo = 0
}

//---------------------------------------------------------
//   CapStaff
//---------------------------------------------------------

export class CapStaff {
    numerator = 0 // default time signature
    log2Denom = 0
    allaBreve = false

    iLayout = 0
    topDistX = 0
    btmDistX = 0
    color: CapColor = BLACK
    voices: CapVoice[] = []
}

//---------------------------------------------------------
//   struct CapStaffLayout
//---------------------------------------------------------

export class CapStaffLayout {
    barlineMode = 0
    noteLines = 0
    bSmall = false
    topDist = 0
    btmDist = 0
    groupDist = 0
    barlineFrom = 0
    barlineTo = 0

    form: Form = Form.G
    line: ClefLine = ClefLine.L5
    oct: Oct = Oct.OCT_ALTA // clef

    // Schlagzeuginformation
    bPercussion = false // use drum channel
    bSoundMapIn = false
    bSoundMapOut = false
    soundMapIn = new Uint8Array(128) // Tabelle für MIDI-Töne iMin...iMin+n-1
    soundMapOut = new Uint8Array(128) // Tabelle für MIDI-Töne iMin...iMin+n-1

    sound = 0
    volume = 0
    transp = 0

    descr = ''
    name = ''
    abbrev = ''
    intermediateName = ''
    intermediateAbbrev = ''
}

//---------------------------------------------------------
//   CapSystem
//---------------------------------------------------------

export class CapSystem {
    nAddBarCount = 0
    bBarCountReset = false
    explLeftIndent = 0 // < 0 --> Einrückung gemäß Stimmenbezeichnungen
                       // >=  --> explizite Einrückung
    beamMode: CapBeamMode = CapBeamMode.AUTO
    tempo = 0
    color: CapColor = BLACK // fuer Systemklammern
    bJustified = false // Randausgleich (Blocksatz)
    bPageBreak = false // nach dem System neue Seite anfangen
    instrNotation = 0 // 0 = keine Instrumentenbezeichnung
                      // 1 = abgekürzt, 2 = vollständig
    /** null: a staff of a CapXML system not read yet (see capxml.ts) */
    staves: (CapStaff | null)[] = []
}

//---------------------------------------------------------
//   BasicDrawObj
//---------------------------------------------------------

export enum CapellaType {
    GROUP, TRANSPOSABLE, METAFILE, SIMPLE_TEXT, TEXT, RECT_ELLIPSE,
    LINE, POLYGON, WAVY_LINE, SLUR, NOTE_LINES, WEDGE, VOLTA,
    BRACKET, GUITAR, TRILL,
}

export class BasicDrawObj extends CapellaObj {
    modeX = 0
    modeY = 0
    distY = 0
    flags = 0
    nRefNote = 0
    nNotes = 0
    background = false
    pageRange = 0

    constructor(public type: CapellaType, c: Capella) {
        super(c)
    }

    read(): void {
        this.modeX = this.cap.readByte() // anchor mode
        this.modeY = this.cap.readByte()
        this.distY = this.cap.readByte()
        this.flags = this.cap.readByte()
        this.nRefNote = this.cap.readInt()
        const range = this.cap.readWord()
        this.nNotes = range & 0x0fff
        this.background = (range & 0x1000) !== 0
        this.pageRange = (range >> 13) & 0x7
        CAPELLA_TRACE(`BasicDrawObj::read modeX ${this.modeX} modeY ${this.modeY} distY ${this.distY} flags ${this.flags} `
            + `nRefNote ${this.nRefNote} nNotes ${this.nNotes} background ${this.background} pageRange ${this.pageRange}`)
    }
}

//---------------------------------------------------------
//   BasicRectObj
//---------------------------------------------------------

export class BasicRectObj extends BasicDrawObj {
    relPos = new PointF()
    width = 0
    yxRatio = 0
    height = 0

    override read(): void {
        super.read()
        this.relPos = this.cap.readPoint()
        this.width = this.cap.readInt()
        this.yxRatio = this.cap.readInt()
        this.height = Math.trunc((this.width * this.yxRatio) / 0x10000)
    }
}

//---------------------------------------------------------
//   GroupObj
//---------------------------------------------------------

export class GroupObj extends BasicDrawObj {
    relPos = new PointF()
    objects: BasicDrawObj[] = []

    constructor(c: Capella) {
        super(CapellaType.GROUP, c)
    }

    override read(): void {
        super.read()
        this.relPos = this.cap.readPoint()
        this.objects = this.cap.readDrawObjectArray()
    }
}

//---------------------------------------------------------
//   TransposableObj
//---------------------------------------------------------

export class TransposableObj extends BasicDrawObj {
    relPos = new PointF()
    b = 0
    variants: BasicDrawObj[] = []

    constructor(c: Capella) {
        super(CapellaType.TRANSPOSABLE, c)
    }

    override read(): void {
        super.read()
        this.relPos = this.cap.readPoint()
        this.b = this.cap.readChar()
        if (this.b !== 12 && this.b !== 21) {
            LOGD(`TransposableObj::read: warning: unknown drawObjectArray size of ${this.b}`)
        }
        this.variants = this.cap.readDrawObjectArray()
        if (this.variants.length !== this.b) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        /*int nRefNote =*/ this.cap.readInt()
    }
}

//---------------------------------------------------------
//   MetafileObj
//---------------------------------------------------------

export class MetafileObj extends BasicRectObj {
    constructor(c: Capella) {
        super(CapellaType.METAFILE, c)
    }

    override read(): void {
        super.read()
        const size = this.cap.readUnsigned()
        this.cap.verifyLength(size)
        if (!this.cap.read(size)) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
    }
}

//---------------------------------------------------------
//   LineObj
//---------------------------------------------------------

export class LineObj extends BasicDrawObj {
    pt1 = new PointF()
    pt2 = new PointF()
    color: CapColor = BLACK
    lineWidth = 0

    constructor(c: Capella, t: CapellaType = CapellaType.LINE) {
        super(t, c)
    }

    override read(): void {
        super.read()
        this.pt1 = this.cap.readPoint()
        this.pt2 = this.cap.readPoint()
        this.color = this.cap.readColor()
        this.lineWidth = this.cap.readChar()
    }
}

//---------------------------------------------------------
//   RectEllipseObj
//---------------------------------------------------------

export class RectEllipseObj extends LineObj { // special
    radius = 0
    bFilled = false
    clrFill: CapColor = BLACK

    constructor(c: Capella) {
        super(c, CapellaType.RECT_ELLIPSE)
    }

    override read(): void {
        super.read()
        this.radius = this.cap.readInt()
        this.bFilled = this.cap.readByte() !== 0
        this.clrFill = this.cap.readColor()
    }
}

//---------------------------------------------------------
//   PolygonObj
//---------------------------------------------------------

export class PolygonObj extends BasicDrawObj {
    bFilled = false
    lineWidth = 0
    clrFill: CapColor = BLACK
    clrLine: CapColor = BLACK

    constructor(c: Capella) {
        super(CapellaType.POLYGON, c)
    }

    override read(): void {
        super.read()

        const nPoints = this.cap.readUnsigned()
        for (let i = 0; i < nPoints; ++i) {
            this.cap.readPoint()
        }

        this.bFilled = this.cap.readByte() !== 0
        this.lineWidth = this.cap.readByte()
        this.clrFill = this.cap.readColor()
        this.clrLine = this.cap.readColor()
    }
}

//---------------------------------------------------------
//   WavyLineObj
//---------------------------------------------------------

export class WavyLineObj extends LineObj {
    waveLen = 0
    adapt = false

    constructor(c: Capella) {
        super(c, CapellaType.WAVY_LINE)
    }

    override read(): void {
        super.read()
        this.waveLen = this.cap.readByte()
        this.adapt = this.cap.readByte() !== 0
    }
}

//---------------------------------------------------------
//   NotelinesObj
//---------------------------------------------------------

export class NotelinesObj extends BasicDrawObj {
    x0 = 0
    x1 = 0
    y = 0
    color: CapColor = BLACK

    constructor(c: Capella) {
        super(CapellaType.NOTE_LINES, c)
    }

    override read(): void {
        super.read()

        this.x0 = this.cap.readInt()
        this.x1 = this.cap.readInt()
        this.y = this.cap.readInt()
        this.color = this.cap.readColor()

        const b = this.cap.readByte()
        switch (b) {
        case 1: break // Einlinienzeile
        case 2: break // Standard (5 Linien)
        default: {
            if (b !== 0) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            this.cap.read(11)
            break
        }
        }
    }
}

//---------------------------------------------------------
//   VoltaObj
//---------------------------------------------------------

export class VoltaObj extends BasicDrawObj {
    x0 = 0
    x1 = 0
    y = 0
    color: CapColor = BLACK

    bLeft = false
    bRight = false
    bDotted = false
    allNumbers = false

    from = 0
    to = 0

    constructor(c: Capella) {
        super(CapellaType.VOLTA, c)
    }

    override read(): void {
        super.read()

        this.x0 = this.cap.readInt()
        this.x1 = this.cap.readInt()
        this.y = this.cap.readInt()
        this.color = this.cap.readColor()

        const f = this.cap.readByte()
        this.bLeft = (f & 1) !== 0 // links abgeknickt
        this.bRight = (f & 2) !== 0 // rechts abgeknickt
        this.bDotted = (f & 4) !== 0
        this.allNumbers = (f & 8) !== 0

        const numbers = this.cap.readByte()
        this.from = numbers & 0x0F
        this.to = (numbers >> 4) & 0x0F
        CAPELLA_TRACE(`VoltaObj::read x0 ${this.x0} x1 ${this.x1} y ${this.y} bLeft ${this.bLeft} bRight ${this.bRight} `
            + `bDotted ${this.bDotted} allNumbers ${this.allNumbers} from ${this.from} to ${this.to}`)
    }
}

//---------------------------------------------------------
//   GuitarObj
//---------------------------------------------------------

export class GuitarObj extends BasicDrawObj {
    relPos = new PointF()
    color: CapColor = BLACK
    guitarFlags = 0 // C++ GuitarObj::flags (hides BasicDrawObj::flags)
    strings = 0 // 8 Saiten in 8 Halbbytes

    constructor(c: Capella) {
        super(CapellaType.GUITAR, c)
    }

    override read(): void {
        super.read()
        this.relPos = this.cap.readPoint()
        this.color = this.cap.readColor()
        this.guitarFlags = this.cap.readWord()
        this.strings = this.cap.readDWord() // 8 Saiten in 8 Halbbytes
    }
}

//---------------------------------------------------------
//   TrillObj
//---------------------------------------------------------

export class TrillObj extends BasicDrawObj {
    x0 = 0
    x1 = 0
    y = 0
    color: CapColor = BLACK
    trillSign = true

    constructor(c: Capella) {
        super(CapellaType.TRILL, c)
    }

    override read(): void {
        super.read()
        this.x0 = this.cap.readInt()
        this.x1 = this.cap.readInt()
        this.y = this.cap.readInt()
        this.color = this.cap.readColor()
        this.trillSign = this.cap.readByte() !== 0
    }
}

//---------------------------------------------------------
//   SlurObj
//---------------------------------------------------------

export class SlurObj extends BasicDrawObj {
    bezierPoint = [new PointF(), new PointF(), new PointF(), new PointF()]
    color: CapColor = BLACK
    nEnd = 0
    nMid = 0
    nDotDist = 0
    nDotWidth = 0

    constructor(c: Capella) {
        super(CapellaType.SLUR, c)
    }

    override read(): void {
        super.read()
        for (let i = 0; i < 4; ++i) {
            const x = this.cap.readInt()
            const y = this.cap.readInt()
            this.bezierPoint[i] = new PointF(x, y)
        }
        this.color = this.cap.readColor()
        this.nEnd = this.cap.readByte()
        this.nMid = this.cap.readByte()
        this.nDotDist = this.cap.readByte()
        this.nDotWidth = this.cap.readByte()
    }
}

//---------------------------------------------------------
//   TextObj
//---------------------------------------------------------

export class TextObj extends BasicRectObj {
    text = ''

    constructor(c: Capella) {
        super(CapellaType.TEXT, c)
    }

    override read(): void {
        super.read()
        const size = this.cap.readUnsigned()
        this.cap.verifyLength(size)
        const txt = this.cap.read(size)
        if (!txt) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        // QString(const char*): UTF-8, up to the first 0
        this.text = new TextDecoder('utf-8').decode(cString(txt))
    }
}

//---------------------------------------------------------
//   SimpleTextObj
//---------------------------------------------------------

export class SimpleTextObj extends BasicDrawObj {
    m_text = ''
    relPos = new PointF(0, 0)
    align = 0
    m_font = new CapFont()

    constructor(c: Capella) {
        super(CapellaType.SIMPLE_TEXT, c)
    }

    override read(): void {
        super.read()
        this.relPos = this.cap.readPoint()
        this.align = this.cap.readByte()
        this.m_font = this.cap.readFont()
        this.m_text = this.cap.readQString()
    }

    text(): string { return this.m_text }
    font(): CapFont { return this.m_font }
    pos(): PointF { return this.relPos }
    textalign(): number { return this.align }
}

//---------------------------------------------------------
//   BracketObj
//---------------------------------------------------------

export class BracketObj extends LineObj {
    orientation = 0
    number = 0

    constructor(c: Capella) {
        super(c, CapellaType.BRACKET)
    }

    override read(): void {
        super.read()
        this.orientation = this.cap.readChar()
        this.number = this.cap.readChar()
    }
}

//---------------------------------------------------------
//   WedgeObj
//---------------------------------------------------------

export class WedgeObj extends LineObj {
    height = 32
    decresc = false

    constructor(c: Capella) {
        super(c, CapellaType.WEDGE)
    }

    override read(): void {
        super.read()
        const b = this.cap.readByte()
        this.height = b & 0x7f
        this.decresc = (b & 0x80) !== 0
    }
}

//---------------------------------------------------------
//   BasicDurationalObj
//---------------------------------------------------------

export class BasicDurationalObj extends CapellaObj {
    nDots = 0
    noDuration = false
    postGrace = false
    bSmall = false
    notBlack = false
    color: CapColor = BLACK
    t: TIMESTEP = TIMESTEP.D1
    horizontalShift = 0
    tupletDenominator = 0 // tuplet type  --  will be used as a count if no separate count is determined
    tupletStart = false // To correctly read Tuplets with mixed durations
    tupletEnd = false // we infer from the Capella file start/stop from the brackets.
    tupletCount = 0 // Real count of the tuplet notes ...
    tupletTicks = new Fraction(0, 1) // ... and the ticks of the tuplet, used to calculate the end of the tuplet
    tripartite = false
    isProlonging = false
    invisible = false
    objects: BasicDrawObj[] = []

    read(): void {
        const b = this.cap.readByte()
        if (b & 0x80) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        this.nDots = b & 0x03
        this.noDuration = (b & 0x04) !== 0
        this.postGrace = (b & 0x08) !== 0
        this.bSmall = (b & 0x10) !== 0
        this.invisible = (b & 0x20) !== 0
        this.notBlack = (b & 0x40) !== 0

        this.color = this.notBlack ? this.cap.readColor() : BLACK

        const c = this.cap.readByte()
        if (c & 0x80) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        this.t = (c & 0x0f) as TIMESTEP
        this.horizontalShift = (c & 0x10) ? this.cap.readInt() : 0
        this.tupletDenominator = 0
        this.tripartite = false
        this.isProlonging = false
        if (c & 0x20) {
            const tuplet = this.cap.readByte()
            this.tupletDenominator = tuplet & 0x0f
            this.tripartite = (tuplet & 0x10) !== 0
            this.isProlonging = (tuplet & 0x20) !== 0
            if (tuplet & 0xc0) {
                LOGD(`bad tuplet value 0x${tuplet.toString(16)}`)
            }
        }
        if (c & 0x40) {
            this.objects = this.cap.readDrawObjectArray()
        }
    }

    //---------------------------------------------------------
    //   toTicks
    //---------------------------------------------------------

    ticks(): Fraction {
        if (this.noDuration) {
            return new Fraction(0, 1)
        }
        let len = new Fraction(0, 1)
        switch (this.t) {
        case TIMESTEP.D1: len = new Fraction(1, 1)
            break
        case TIMESTEP.D2: len = new Fraction(1, 2)
            break
        case TIMESTEP.D4: len = new Fraction(1, 4)
            break
        case TIMESTEP.D8: len = new Fraction(1, 8)
            break
        case TIMESTEP.D16: len = new Fraction(1, 16)
            break
        case TIMESTEP.D32: len = new Fraction(1, 32)
            break
        case TIMESTEP.D64: len = new Fraction(1, 64)
            break
        case TIMESTEP.D128: len = new Fraction(1, 128)
            break
        case TIMESTEP.D256: len = new Fraction(1, 256)
            break
        case TIMESTEP.D_BREVE: len = new Fraction(2, 1)
            break
        default:
            LOGD(`BasicDurationalObj::ticks: illegal duration value ${this.t}`)
            break
        }
        let slen = len
        let dots = this.nDots
        while (dots--) {
            slen = slen.div(new Fraction(2, 1))
            len = len.plus(slen)
        }
        return len
    }
}

//---------------------------------------------------------
//   Verse
//---------------------------------------------------------

export interface Verse {
    leftAlign: boolean
    extender: boolean
    hyphen: boolean
    num: number
    verseNumber: string
    text: string
}

export interface CNote {
    pitch: number
    explAlteration: number // 1 force, 2 suppress
    headType: number
    headGroup: number
    alteration: number
    silent: number
}

export enum StemDir {
    DOWN = -1, AUTO = 0, UP = 1, NONE = 3,
}

//---------------------------------------------------------
//   ChordObj
//---------------------------------------------------------

export class ChordObj extends BasicDurationalObj {
    static readonly StemDir = StemDir

    beamMode: CapBeamMode = CapBeamMode.AUTO
    notationStave = 0
    dStemLength = 0
    nTremoloBars = 0
    articulation = 0
    leftTie = false
    rightTie = false
    beamShift = 0
    beamSlope = 0
    verse: Verse[] = []
    notes: CNote[] = []
    stemDir: StemDir = StemDir.AUTO

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.CHORD }

    override read(): void {
        this.stemDir = StemDir.AUTO
        this.dStemLength = 0
        this.nTremoloBars = 0
        this.articulation = 0
        this.leftTie = false
        this.rightTie = false
        this.beamShift = 0
        this.beamSlope = 0

        super.read()

        const flags = this.cap.readByte()
        this.beamMode = (flags & 0x01) ? this.cap.readByte() as CapBeamMode : CapBeamMode.AUTO
        this.notationStave = (flags & 0x02) ? this.cap.readChar() : 0
        if (!(this.notationStave >= -1 && this.notationStave <= 1)) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }

        if (flags & 0x04) {
            this.stemDir = this.cap.readChar() as StemDir
            this.dStemLength = this.cap.readChar()
        }
        if (flags & 0x08) {
            this.nTremoloBars = this.cap.readByte()
            this.articulation = this.cap.readByte()
        }
        if (flags & 0x10) {
            const b = this.cap.readByte()
            this.leftTie = (b & 1) !== 0
            this.rightTie = (b & 2) !== 0
        }
        if (flags & 0x20) {
            this.beamShift = this.cap.readChar()
            this.beamSlope = this.cap.readChar()
        }
        if (flags & 0x40) {
            const nVerses = this.cap.readUnsigned()
            for (let i = 0; i < nVerses; ++i) {
                const bVerse = this.cap.readByte() !== 0
                if (bVerse) {
                    const b = this.cap.readByte()
                    const v: Verse = {
                        leftAlign: (b & 1) !== 0,
                        extender: (b & 2) !== 0,
                        hyphen: (b & 4) !== 0,
                        num: i,
                        verseNumber: '',
                        text: '',
                    }
                    if (b & 8) {
                        v.verseNumber = this.cap.readQString()
                    }
                    if (b & 16) {
                        v.text = this.cap.readQString()
                    }
                    this.verse.push(v)
                }
            }
        }
        const nNotes = this.cap.readUnsigned()
        for (let i = 0; i < nNotes; ++i) {
            const n: CNote = { pitch: 0, explAlteration: 0, headType: 0, headGroup: 0, alteration: 0, silent: 0 }
            const c = this.cap.readByte()
            const bit7 = (c & 0x80) !== 0
            const bit6 = (c & 0x40) !== 0
            n.pitch = (c << 24) >> 24 // (signed char)c
            if (bit7 !== bit6) {
                n.explAlteration = 2
                n.pitch = ((n.pitch ^ 0x80) << 24) >> 24
            }
            const b = this.cap.readByte()
            n.headType = b & 7
            if (n.headType === 6) {
                n.headType = 0
                n.headGroup = NoteHeadGroup.HEAD_CROSS
            } else {
                n.headGroup = NoteHeadGroup.HEAD_NORMAL
            }
            n.alteration = ((b >> 3) & 7) - 2 // -2 -- +2
            if (b & 0x40) {
                n.explAlteration = 1
            }
            n.silent = b & 0x80
            CAPELLA_TRACE(`ChordObj::read() note pitch ${n.pitch} explAlt ${n.explAlteration} head group ${n.headType} `
                + `${n.headGroup} alt ${n.alteration} silent ${n.silent}`)
            this.notes.push(n)
        }
    }
}

//---------------------------------------------------------
//   RestObj
//---------------------------------------------------------

export class RestObj extends BasicDurationalObj {
    bVerticalCentered = false
    vertShift = 0
    fullMeasures = 0 // >0, multi measure rest (counting measures)

    type(): CapellaNoteObjectType { return CapellaNoteObjectType.REST }

    override read(): void {
        super.read()
        const b = this.cap.readByte()
        const bMultiMeasures = (b & 1) !== 0
        this.bVerticalCentered = (b & 2) !== 0
        const bAddVerticalShift = (b & 4) !== 0
        if (b & 0xf8) {
            LOGD(`RestObj: res. bits 0x${b.toString(16)}`) // C++ ASSERT_X
        }
        this.fullMeasures = bMultiMeasures ? this.cap.readUnsigned() : 0
        this.vertShift = bAddVerticalShift ? this.cap.readInt() : 0
    }
}

//---------------------------------------------------------
//   CapBracket
//---------------------------------------------------------

export interface CapBracket {
    from: number
    to: number
    curly: boolean
}

/** the C string at the start of the buffer (up to the first 0) */
function cString(buf: Uint8Array): Uint8Array {
    const end = buf.indexOf(0)
    return end < 0 ? buf : buf.subarray(0, end)
}

function latin1(buf: Uint8Array): string {
    let s = ''
    for (const b of cString(buf)) {
        s += String.fromCharCode(b)
    }
    return s
}

//---------------------------------------------------------
//   Capella
//---------------------------------------------------------

export class Capella {
    static readonly errmsg = [
        'no error',
        'bad file signature, no Capella file or not from version 2000 (3.0) or later?',
        'unexpected end of file',
        'bad voice signature',
        'bad staff signature',
        'bad system signature',
        'bad file content',
    ]

    curPos = 0

    /** C++ QFile* f */
    f: Uint8Array | null = null
    author: string | null = null
    keywords: string | null = null
    comment: string | null = null

    beamRelMin0 = 0
    beamRelMin1 = 0
    beamRelMax0 = 0
    beamRelMax1 = 0
    nRel = 0 // presentation parameter
    nAbs = 0
    bUseRealSize = false
    bAllowCompression = false
    bPrintLandscape = false

    bShowBarCount = false // Taktnumerierung zeigen
    barNumberFrame = 0 // 0=kein, 1=Rechteck, 2=Ellipse
    nBarDistX = 0
    nBarDistY = 0

    nFirstPage = 0 // Versatz fuer Seitenzaehlung

    leftPageMargins = 0 // Seitenraender
    topPageMargins = 0
    rightPageMargins = 0
    btmPageMargins = 0

    fonts: CapFont[] = []
    m_staffLayouts: CapStaffLayout[] = [] // staff layout

    interDist = 0
    txtAlign = 0 // Stimmenbezeichnungen 0=links, 1=zentriert, 2=rechts
    adjustVert = 0 // 0=nein, 1=außer letzte Seite, 3=alle Seiten
    redundantKeys = false
    modernDoubleNote = false
    bSystemSeparators = false
    nUnnamed = 0
    namesFont = new CapFont()

    systems: CapSystem[] = []
    brackets: CapBracket[] = []
    backgroundChord: ChordObj | null = null

    smallLineDist = 0 // spatium unit in metric mm
    normalLineDist = 0
    topDist = 0

    error(n: CapellaErrorCode): string { return Capella.errmsg[n] }

    staffLayout(idx: number): CapStaffLayout | null {
        if (idx < 0 || idx >= this.m_staffLayouts.length) {
            return null
        }
        return this.m_staffLayouts[idx]
    }

    staffLayouts(): CapStaffLayout[] { return this.m_staffLayouts }

    //---------------------------------------------------------
    //    read
    //    return null on error (C++ read(void* p, qint64 len) returns false)
    //---------------------------------------------------------

    read(len: number): Uint8Array | null {
        if (len === 0) {
            return new Uint8Array(0)
        }
        const f = this.f!
        if (this.curPos + len > f.length) {
            this.curPos = f.length // QFile::read reads what is available
            return null
        }
        const r = f.subarray(this.curPos, this.curPos + len)
        this.curPos += len
        return r
    }

    /** the bytes of a read value; missing bytes (end of file) are 0 (C++ uninitialized) */
    private readBytes(len: number): DataView {
        const f = this.f!
        const buf = new Uint8Array(len)
        const n = Math.min(len, f.length - this.curPos)
        if (n === len) {
            buf.set(f.subarray(this.curPos, this.curPos + len))
            this.curPos += len
        } else if (n > 0) {
            this.curPos = f.length
        }
        return new DataView(buf.buffer)
    }

    //---------------------------------------------------------
    //   verifyLength
    //---------------------------------------------------------

    verifyLength(len: number): void {
        if (len > this.f!.length - this.curPos) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
    }

    readByte(): number { return this.readBytes(1).getUint8(0) }
    readChar(): number { return this.readBytes(1).getInt8(0) }
    readWord(): number { return this.readBytes(2).getInt16(0, true) }
    readDWord(): number { return this.readBytes(4).getInt32(0, true) }
    readLong(): number { return this.readBytes(4).getInt32(0, true) }

    readUnsigned(): number {
        const c = this.readBytes(1).getUint8(0)
        if (c === 254) {
            return this.readBytes(2).getUint16(0, true)
        } else if (c === 255) {
            return this.readBytes(4).getUint32(0, true)
        } else {
            return c
        }
    }

    readInt(): number {
        const c = this.readBytes(1).getInt8(0)
        if (c === -128) {
            return this.readBytes(2).getInt16(0, true)
        } else if (c === 127) {
            return this.readBytes(4).getInt32(0, true)
        } else {
            return c
        }
    }

    //---------------------------------------------------------
    //   readString -- read Capella string (the bytes up to the first 0)
    //   note that no carriage return / newline interpretation is done
    //---------------------------------------------------------

    readString(): Uint8Array {
        const len = this.readUnsigned()
        this.verifyLength(len)
        const buffer = this.read(len)
        if (!buffer) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        return cString(buffer)
    }

    //---------------------------------------------------------
    //   readQString -- read Capella string into QString
    //   strings in Capella files may contain \r\n, must remove the \r
    //---------------------------------------------------------

    readQString(): string {
        return latin1(this.readString()).replace(/\r/g, '')
    }

    //---------------------------------------------------------
    //   readColor
    //---------------------------------------------------------

    readColor(): CapColor {
        const colors = [
            0x000000, // schwarz
            0x000080, // dunkelrot
            0x008000, // dunkelgrün
            0x008080, // ocker
            0x800000, // dunkelblau
            0x800080, // purpurrot
            0x808000, // blaugün
            0x808080, // grau
            0xC0C0C0, // hellgrau
            0x0000FF, // rot
            0x00FF00, // grün
            0x00FFFF, // gelb
            0xFF0000, // blau
            0xFF00FF, // lila
            0xFFFF00, // aquamarin
            0xFFFFFF, // weiß
        ]

        let c: CapColor
        const b = this.readByte()
        if (b >= 16) {
            if (b !== 255) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            const r = this.readByte()
            const g = this.readByte()
            const bi = this.readByte()
            c = (r << 16) | (g << 8) | bi
        } else {
            c = colors[b]
        }
        return c
    }

    //---------------------------------------------------------
    //   readFont
    //---------------------------------------------------------

    readFont(): CapFont {
        let index = this.readUnsigned()
        if (index === 0) {
            const lfHeight = this.readLong()
            /*int lfWidth            =*/ this.readLong()
            /*int lfEscapement       =*/ this.readLong()
            /*int lfOrientation      =*/ this.readLong()
            const lfWeight = this.readLong()
            const lfItalic = this.readByte()
            const lfUnderline = this.readByte()
            const lfStrikeOut = this.readByte()
            /*uchar lfCharSet        =*/ this.readByte()
            /*uchar lfOutPrecision   =*/ this.readByte()
            /*uchar lfClipPrecision  =*/ this.readByte()
            /*uchar lfQuality        =*/ this.readByte()
            /*uchar lfPitchAndFamily =*/ this.readByte()
            /*QColor color           =*/ this.readColor()
            const face = this.readQString()

            CAPELLA_TRACE(`Font <${face}> size ${lfHeight}, weight ${lfWeight}`)
            const font = new CapFont()
            font.family = face
            // QFont::setPointSizeF ignores sizes <= 0
            if (lfHeight / 1000.0 > 0) {
                font.pointSizeF = lfHeight / 1000.0
            }
            font.italic = lfItalic !== 0
            font.strikeOut = lfStrikeOut !== 0
            font.underline = lfUnderline !== 0

            switch (lfWeight) {
            case 700: font.bold = true
                break
            case 400: font.bold = false
                break
            case 0: font.bold = false // QFont::Light
                break
            }
            this.fonts.push(font)
            return font
        }
        index -= 1
        if (index >= this.fonts.length) {
            LOGD(`illegal font index ${index} (max ${this.fonts.length - 1})`)
            return new CapFont()
        }
        return this.fonts[index]
    }

    //---------------------------------------------------------
    //   readPoint
    //---------------------------------------------------------

    readPoint(): PointF {
        const x = this.readInt()
        const y = this.readInt()
        return new PointF(x, y)
    }

    //---------------------------------------------------------
    //   readStaveLayout
    //---------------------------------------------------------

    protected readStaveLayout(sl: CapStaffLayout, idx: number): void {
        sl.barlineMode = this.readByte()
        sl.noteLines = this.readByte()
        switch (sl.noteLines) {
        case 1: break // one line
        case 2: break // five lines
        default:
            this.read(11)
            break
        }
        CAPELLA_TRACE(`StaffLayout ${idx}: barlineMode ${sl.barlineMode} noteLines ${sl.noteLines}`)

        sl.bSmall = this.readByte() !== 0

        sl.topDist = this.readInt()
        sl.btmDist = this.readInt()
        sl.groupDist = this.readInt()
        sl.barlineFrom = this.readByte()
        sl.barlineTo = this.readByte()

        const clef = this.readByte()
        sl.form = (clef & 7) as Form
        sl.line = ((clef >> 3) & 7) as ClefLine
        sl.oct = (clef >> 6) as Oct

        // Schlagzeuginformation
        const b = this.readByte()
        sl.bPercussion = (b & 1) !== 0 // Schlagzeugkanal verwenden
        sl.bSoundMapIn = (b & 2) !== 0
        sl.bSoundMapOut = (b & 4) !== 0
        if (sl.bSoundMapIn) { // Umleitungstabelle für Eingabe vom Keyboard
            const iMin = this.readByte()
            const n = this.readByte()
            if (!(n > 0 && iMin + n <= 128)) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            const d = this.read(n)
            if (d) {
                sl.soundMapIn.set(d)
            }
        }
        if (sl.bSoundMapOut) { // Umleitungstabelle für das Vorspielen
            const iMin = this.readByte()
            const n = this.readByte()
            if (!(n > 0 && iMin + n <= 128)) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            const d = this.read(n)
            if (d) {
                sl.soundMapOut.set(d)
            }
        }
        sl.sound = this.readInt()
        sl.volume = this.readInt()
        sl.transp = this.readInt()
        CAPELLA_TRACE(`   sound ${sl.sound} vol ${sl.volume} transp ${sl.transp}`)

        sl.descr = this.readQString()
        sl.name = this.readQString()
        sl.abbrev = this.readQString()
        sl.intermediateName = this.readQString()
        sl.intermediateAbbrev = this.readQString()
    }

    //---------------------------------------------------------
    //   readLayout
    //---------------------------------------------------------

    protected readLayout(): void {
        this.smallLineDist = this.readInt() / 100
        this.normalLineDist = this.readInt() / 100
        CAPELLA_TRACE(`Capella::readLayout(): smallLineDist ${this.smallLineDist} normalLineDist ${this.normalLineDist}`)

        this.topDist = this.readInt()
        this.interDist = this.readInt()

        this.txtAlign = this.readByte() // Stimmenbezeichnungen 0=links, 1=zentriert, 2=rechts
        this.adjustVert = this.readByte() // 0=nein, 1=außer letzte Seite, 3=alle Seiten

        const b = this.readByte()
        if (b & 0xFC) { // bits 2...7 reserviert
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }
        this.redundantKeys = (b & 1) !== 0
        this.modernDoubleNote = (b & 2) !== 0

        this.bSystemSeparators = this.readByte() !== 0
        this.nUnnamed = this.readInt()

        this.namesFont = this.readFont()

        // Musterzeilen
        const nStaveLayouts = this.readUnsigned()

        for (let iStave = 0; iStave < nStaveLayouts; iStave++) {
            const sl = new CapStaffLayout()
            this.readStaveLayout(sl, iStave)
            this.m_staffLayouts.push(sl)
        }

        // system brackets:
        const n = this.readUnsigned() // number of brackets
        for (let i = 0; i < n; i++) {
            const from = this.readInt()
            const to = this.readInt()
            const curly = this.readByte() !== 0
            this.brackets.push({ from, to, curly })
        }
    }

    //---------------------------------------------------------
    //   readExtra
    //---------------------------------------------------------

    readExtra(): void {
        const n = this.readByte()
        if (n) {
            CAPELLA_TRACE(`Capella::readExtra(${n})`)
            for (let i = 0; i < n; ++i) {
                this.readByte()
            }
        }
    }

    //---------------------------------------------------------
    //   readDrawObjectArray
    //---------------------------------------------------------

    readDrawObjectArray(): BasicDrawObj[] {
        const ol: BasicDrawObj[] = []
        const n = this.readUnsigned() // draw obj array

        for (let i = 0; i < n; ++i) {
            const type = this.readByte() as CapellaType

            let o: BasicDrawObj
            switch (type) {
            case CapellaType.GROUP: o = new GroupObj(this)
                break
            case CapellaType.TRANSPOSABLE: o = new TransposableObj(this)
                break
            case CapellaType.METAFILE: o = new MetafileObj(this)
                break
            case CapellaType.SIMPLE_TEXT: o = new SimpleTextObj(this)
                break
            case CapellaType.TEXT: o = new TextObj(this)
                break
            case CapellaType.RECT_ELLIPSE: o = new RectEllipseObj(this)
                break
            case CapellaType.LINE: o = new LineObj(this)
                break
            case CapellaType.POLYGON: o = new PolygonObj(this)
                break
            case CapellaType.WAVY_LINE: o = new WavyLineObj(this)
                break
            case CapellaType.SLUR: o = new SlurObj(this)
                break
            case CapellaType.NOTE_LINES: o = new NotelinesObj(this)
                break
            case CapellaType.WEDGE: o = new WedgeObj(this)
                break
            case CapellaType.VOLTA: o = new VoltaObj(this)
                break
            case CapellaType.BRACKET: o = new BracketObj(this)
                break
            case CapellaType.GUITAR: o = new GuitarObj(this)
                break
            case CapellaType.TRILL: o = new TrillObj(this)
                break
            default:
                // readDrawObjectArray unsupported type
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            o.read()
            ol.push(o)
        }
        return ol
    }

    //---------------------------------------------------------
    //   readVoice
    //---------------------------------------------------------

    private readVoice(cs: CapStaff, idx: number): void {
        CAPELLA_TRACE(`      readVoice ${idx}`)

        if (this.readChar() !== 'C'.charCodeAt(0)) {
            throw new CapellaError(CapellaErrorCode.BAD_VOICE_SIG)
        }

        const v = new CapVoice()
        v.voiceNo = idx
        v.y0Lyrics = this.readByte()
        v.dyLyrics = this.readByte()
        v.lyricsFont = this.readFont()
        v.stemDir = this.readByte()
        this.readExtra()

        const nNoteObjs = this.readUnsigned() // Notenobjekte
        for (let i = 0; i < nNoteObjs; i++) {
            const type = this.readByte()
            this.readExtra()
            if (type !== CapellaNoteObjectType.REST && type !== CapellaNoteObjectType.CHORD
                && type !== CapellaNoteObjectType.PAGE_BKGR) {
                /*color =*/ this.readColor()
            }

            // Die anderen Objekttypen haben eine komprimierte Farbcodierung
            switch (type as CapellaNoteObjectType) {
            case CapellaNoteObjectType.REST: {
                const rest = new RestObj(this)
                rest.read()
                v.objects.push(rest)
            }
                break
            case CapellaNoteObjectType.CHORD:
            case CapellaNoteObjectType.PAGE_BKGR: {
                const chord = new ChordObj(this)
                chord.read()
                v.objects.push(chord)
            }
                break
            case CapellaNoteObjectType.CLEF: {
                const clef = new CapClef(this)
                clef.read()
                v.objects.push(clef)
            }
                break
            case CapellaNoteObjectType.KEY: {
                const key = new CapKey(this)
                key.read()
                v.objects.push(key)
            }
                break
            case CapellaNoteObjectType.METER: {
                const meter = new CapMeter(this)
                meter.read()
                v.objects.push(meter)
            }
                break
            case CapellaNoteObjectType.EXPL_BARLINE: {
                const bl = new CapExplicitBarline(this)
                bl.read()
                v.objects.push(bl)
            }
                break
            default:
                LOGD(`bad voice type ${type}`) // C++ ASSERT_X
            }
        }
        cs.voices.push(v)
    }

    //---------------------------------------------------------
    //   readStaff
    //---------------------------------------------------------

    private readStaff(system: CapSystem): void {
        if (this.readChar() !== 'V'.charCodeAt(0)) {
            throw new CapellaError(CapellaErrorCode.BAD_STAFF_SIG)
        }

        const staff = new CapStaff()
        // Meter
        staff.numerator = this.readByte()
        const d = this.readByte()
        staff.log2Denom = (d & 0x7f) - 1
        staff.allaBreve = (d & 0x80) !== 0
        if (staff.log2Denom > 7 || staff.log2Denom < 0) {
            LOGD('   illegal fraction')
            staff.log2Denom = 2
            staff.numerator = 4
        }

        staff.iLayout = this.readByte()
        staff.topDistX = this.readInt()
        staff.btmDistX = this.readInt()
        staff.color = this.readColor()
        this.readExtra()

        // Stimmen
        const nVoices = this.readUnsigned()
        for (let i = 0; i < nVoices; i++) {
            this.readVoice(staff, i)
        }
        system.staves.push(staff)
    }

    //---------------------------------------------------------
    //   readSystem
    //---------------------------------------------------------

    private readSystem(): void {
        if (this.readChar() !== 'S'.charCodeAt(0)) {
            throw new CapellaError(CapellaErrorCode.BAD_SYSTEM_SIG)
        }

        const s = new CapSystem()
        s.nAddBarCount = this.readInt()
        s.bBarCountReset = this.readByte() !== 0
        s.explLeftIndent = this.readByte()

        s.beamMode = this.readByte() as CapBeamMode
        s.tempo = this.readUnsigned()
        s.color = this.readColor()
        this.readExtra()

        const b = this.readByte()
        s.bJustified = (b & 2) !== 0
        s.bPageBreak = (b & 4) !== 0
        s.instrNotation = (b >> 3) & 7

        const nStaves = this.readUnsigned()
        for (let i = 0; i < nStaves; i++) {
            this.readStaff(s)
        }
        this.systems.push(s)
    }

    //---------------------------------------------------------
    //   read (C++ read(QFile*))
    //---------------------------------------------------------

    readFile(fp: Uint8Array): void {
        this.f = fp
        this.curPos = 0

        const signature = this.read(8)
        if (!signature || latin1(signature.subarray(0, 7)) !== 'cap3-v:') {
            throw new CapellaError(CapellaErrorCode.BAD_SIG)
        }

        // TODO: test for signature[7] = a-z

        this.author = latin1(this.readString())
        this.keywords = latin1(this.readString())
        this.comment = latin1(this.readString())

        this.nRel = this.readUnsigned() // 75
        this.nAbs = this.readUnsigned() // 16
        const b = this.readByte()
        this.bUseRealSize = (b & 1) !== 0
        this.bAllowCompression = (b & 2) !== 0
        this.bPrintLandscape = (b & 16) !== 0

        this.readLayout()

        this.beamRelMin0 = this.readByte() // basic setup for beam slope
        this.beamRelMin1 = this.readByte()
        this.beamRelMax0 = this.readByte()
        this.beamRelMax1 = this.readByte()

        this.readExtra()

        this.readDrawObjectArray() // Galerie (gesammelte Grafikobjekte)

        const n = this.readUnsigned()
        if (n) {
            LOGD('Gallery objects')
        }
        for (let i = 0; i < n; ++i) {
            this.readString() // Namen der Galerie-Objekte
        }

        this.backgroundChord = new ChordObj(this)
        this.backgroundChord.read() // contains graphic objects on the page background
        this.bShowBarCount = this.readByte() !== 0 // Taktnumerierung zeigen
        this.barNumberFrame = this.readByte() // 0=kein, 1=Rechteck, 2=Ellipse
        this.nBarDistX = this.readByte()
        this.nBarDistY = this.readByte()
        /*QFont barNumFont =*/ this.readFont()
        this.nFirstPage = this.readUnsigned() // Versatz fuer Seitenzaehlung
        this.leftPageMargins = this.readUnsigned() // Seitenraender
        this.topPageMargins = this.readUnsigned()
        this.rightPageMargins = this.readUnsigned()
        this.btmPageMargins = this.readUnsigned()

        const nSystems = this.readUnsigned()
        for (let i = 0; i < nSystems; i++) {
            this.readSystem()
        }
        const esig = this.read(4)
        if (!esig || esig.some(c => c !== 0)) {
            throw new CapellaError(CapellaErrorCode.BAD_SIG)
        }
    }
}

//---------------------------------------------------------
//   addDynamic
//---------------------------------------------------------

function addDynamic(_score: Score, s: Segment, track: number, name: string): void {
    const d = new Dynamic(s)
    d.setDynamicType(name)
    d.setTrack(track)
    s.add(d)
}

//---------------------------------------------------------
//   addArticulationText
//---------------------------------------------------------

function addArticulationText(_score: Score, cr: ChordRest | null, track: number, symId: SymId): void {
    const na = new Articulation(cr)
    na.setTrack(track)
    na.setSymId(symId)
    cr!.add(na)
}

//---------------------------------------------------------
//   SetCapGraceDuration
//---------------------------------------------------------

function SetCapGraceDuration(chord: Chord, o: ChordObj): void {
    let nt = NoteType.APPOGGIATURA
    if (o.nTremoloBars > 0) {
        nt = NoteType.ACCIACCATURA
    }
    chord.setNoteType(nt)
    if (o.t === TIMESTEP.D4) {
        chord.setNoteType(NoteType.GRACE4)
        chord.setDurationType(DurationType.V_QUARTER)
    } else if (o.t === TIMESTEP.D_BREVE) {
        chord.setDurationType(DurationType.V_BREVE)
    } else if (o.t === TIMESTEP.D1) {
        chord.setDurationType(DurationType.V_WHOLE)
    } else if (o.t === TIMESTEP.D2) {
        chord.setDurationType(DurationType.V_HALF)
    } else if (o.t === TIMESTEP.D16) {
        chord.setNoteType(NoteType.GRACE16)
        chord.setDurationType(DurationType.V_16TH)
    } else if (o.t === TIMESTEP.D32) {
        chord.setNoteType(NoteType.GRACE32)
        chord.setDurationType(DurationType.V_32ND)
    } else if (o.t === TIMESTEP.D64) {
        chord.setDurationType(DurationType.V_64TH)
    } else if (o.t === TIMESTEP.D128) {
        chord.setDurationType(DurationType.V_128TH)
    } else if (o.t === TIMESTEP.D256) {
        chord.setDurationType(DurationType.V_256TH)
    } else {
        chord.setDurationType(DurationType.V_EIGHTH)
    }
}

function addArpeggio(cr: ChordRest, type: ArpeggioType): void {
    const chord = cr as Chord
    const a = new Arpeggio(chord)
    a.setArpeggioType(type)
    if (!chord.arpeggio()) { // there can be only one
        cr.add(a)
    }
}

//---------------------------------------------------------
//   processBasicDrawObj
//---------------------------------------------------------

function processBasicDrawObj(objects: BasicDrawObj[], s: Segment, track: number, cr: ChordRest | null): void {
    const score = s.score()
    for (const oo of objects) {
        switch (oo.type) {
        case CapellaType.SIMPLE_TEXT: {
            const st = oo as SimpleTextObj
            if (st.font().family === 'capella3') {
                const text = st.text()
                if (text.length === 1) {
                    const code = text.charCodeAt(0)
                    switch (code) {
                    case 0x70: // 'p'
                        addDynamic(score, s, track, 'p')
                        break
                    case 0x71: // 'q'
                        addDynamic(score, s, track, 'pp')
                        break
                    case 0x72: // 'r'
                        addDynamic(score, s, track, 'ppp')
                        break
                    case 0x73: // 's'
                        addDynamic(score, s, track, 'sf')
                        break
                    case 0x66: // 'f'
                        addDynamic(score, s, track, 'f')
                        break
                    case 0x67: // 'g'
                        addDynamic(score, s, track, 'ff')
                        break
                    case 0x68: // 'h'
                        addDynamic(score, s, track, 'fff')
                        break
                    case 0x69: // 'i'
                        addDynamic(score, s, track, 'mp')
                        break
                    case 0x6A: // 'j'
                        addDynamic(score, s, track, 'mf')
                        break
                    case 0x7A: // 'z' sfz
                        addDynamic(score, s, track, 'sfz')
                        break
                    case 0x7B: // '{'
                        addDynamic(score, s, track, 'fz')
                        break
                    case 0x7C: // '|'
                        addDynamic(score, s, track, 'fp')
                        break
                    case 212: // dynamic m
                        addDynamic(score, s, track, 'm')
                        break
                    case 213: // dynamic r
                        addDynamic(score, s, track, 'r')
                        break
                    case 214: // dynamic s
                        addDynamic(score, s, track, 's')
                        break
                    case 215: // dynamic z
                        addDynamic(score, s, track, 'z')
                        break
                    case 0x6B: // 'k' fermata down
                        addArticulationText(score, cr, track, SymId.fermataBelow)
                        break
                    case 0x75: // 'u' fermata up
                        addArticulationText(score, cr, track, SymId.fermataAbove)
                        break
                    case 0x64: // 'd' da capo D.C.
                    case 0x65: // 'e' dal segno D.S.
                    case 0x6E: // 'n' segno coda
                    case 0x6F: // 'o' segno coda (smaller)
                    case 0x79: // 'y' segno
                    case 0x24: // '$' segno variation
                    case 0x61: // 'a' pedal Ped.
                    case 0x62: // 'b' pedal asterisk *
                    case 0x76: // 'v' 8va
                    case 186: // 15ma
                        LOGD(`Import of Capella text articulation ${code.toString(16)}(${text}) not yet implemented`)
                        break
                    case 181: { // caesura
                        const seg = s.measure()!.getSegment(SegmentType.Breath, cr ? cr.endTick() : s.tick())
                        const b = new Breath(seg)
                        b.setTrack(track)
                        b.setSymId(SymId.caesura)
                        seg.add(b)
                    }
                        break
                    default:
                        break
                    }
                    if (cr && cr.isChord()) {
                        switch (code) {
                        case 172: // arpeggio (short)
                        case 173: // arpeggio (long)
                            addArpeggio(cr, ArpeggioType.NORMAL)
                            break
                        case 187: // arpeggio (wiggle line, arrow up)
                            addArpeggio(cr, ArpeggioType.UP)
                            break
                        case 188: // arpeggio (wiggle line, arrow down)
                            addArpeggio(cr, ArpeggioType.DOWN)
                            break
                        default:
                            break
                        }
                    }
                    break
                }
            }
            const text = new StaffText(s)
            const f = st.font()
            text.setFamily(f.family)
            text.setItalic(f.italic)
            // text->setUnderline(f.underline());
            // text->setStrike(f.strikeOut());
            text.setBold(f.bold)
            text.setSize(f.pointSizeF)

            text.setPlainText(st.text())
            let p = st.pos().clone()
            p = new PointF(p.x() / 32.0 * score.style().spatium(), p.y() / 32.0 * score.style().spatium())
            text.setOffset(p)
            let textalign: AlignH
            switch (st.textalign()) {
            default:
            case 0:
                textalign = AlignH.LEFT
                break
            case 1:
                textalign = AlignH.HCENTER
                break
            case 2:
                textalign = AlignH.RIGHT
                break
            }
            text.setAlign(new Align(textalign, AlignV.BASELINE))
            text.setOffset(new PointF(0.0, 2.0))
            text.setTrack(track)
            s.add(text)
        }
            break
        case CapellaType.TRANSPOSABLE: {
            const to = oo as TransposableObj
            let str = ''
            for (const bdo of to.variants) {
                const st = bdo as SimpleTextObj
                if (st.font().family === 'capella3') {
                    for (const ch of st.text()) {
                        if (ch === 'Q') {
                            str += 'b'
                        } else if (ch === 'S') {
                            str += '#'
                        } else if (ch === 'R') {
                            str += 'natural'
                        } else {
                            str += ch
                        }
                    }
                } else {
                    str += st.text()
                }
            }
            const harmony = new Harmony(s)
            harmony.setHarmony(str)
            harmony.setTrack(track)
            s.add(harmony)
            break
        }
        case CapellaType.TEXT:
            LOGD('======================Text:')
            break
        default:
            break
        }
    }
}

//---------------------------------------------------------
//   TupletFractionCap
//---------------------------------------------------------

export function TupletFractionCap(tupletNotesSpanned: number, tuplettrp: boolean, tupletprol: boolean): Fraction {
    let dd = 0
    let nn = 0
    let exponent = 0
    const tupletDenominator = tupletNotesSpanned
    const f = new Fraction(3, 2)

    if (tupletDenominator > 0 && tupletDenominator <= 15) {
        if (tuplettrp) {
            exponent = Math.floor(Math.log(tupletDenominator / 3.0) / Math.log(2.0))
        } else {
            exponent = Math.floor(Math.log(tupletDenominator) / Math.log(2.0))
        }
    } else {
        LOGD(`Unknown tuplet, tupletDenominator = ${tupletNotesSpanned}`)
        return f
    }
    if (tupletprol) {
        exponent += 1.0
    }
    if (exponent < 0.0) {
        exponent = 0.0
    }
    nn = tupletNotesSpanned
    dd = Math.trunc(Math.pow(2.0, exponent))
    if (tuplettrp) {
        dd = dd * 3
    }
    CAPELLA_TRACE(`Tuplet Fraction: ${nn} / ${dd}`)
    return new Fraction(nn, dd)
}

function isDurational(nobj: NoteObj): nobj is ChordObj | RestObj {
    return nobj.type() === CapellaNoteObjectType.REST || nobj.type() === CapellaNoteObjectType.CHORD
}

//---------------------------------------------------------
//   findChordRests -- find begin and end ChordRest for BasicDrawObj o
//   return [cr1, cr2] on success (both begin and end found), null otherwise
//---------------------------------------------------------

function findChordRests(o: BasicDrawObj, score: Score, track: number, tick: Fraction, no: NoteObj,
                        objects: NoteObj[]): [ChordRest, ChordRest] | null {
    let cr1: ChordRest | null = null // ChordRest where BasicDrawObj o begins
    let cr2: ChordRest | null = null // ChordRest where BasicDrawObj o ends

    // find the ChordRests where o begins and ends
    let n = o.nNotes + 1 // # notes in BasicDrawObj (nNotes is # notes following the first note)
    let graceNumber = 0
    let graceNumber1 = 0
    let foundcr1 = false
    let tick2 = tick
    for (const nobj of objects) {
        let d: BasicDurationalObj | null = null
        if (nobj.type() === CapellaNoteObjectType.REST) {
            d = nobj as RestObj
            graceNumber = 0
        } else if (nobj.type() === CapellaNoteObjectType.CHORD) {
            const cho = nobj as ChordObj
            d = cho
            if (!cho.invisible && cho.ticks().isZero()) { // grace note
                ++graceNumber
            } else {
                graceNumber = 0
            }
        }
        if (!d) {
            continue
        }
        if (nobj === no) {
            foundcr1 = true
            graceNumber1 = graceNumber
        }
        let ticks = new Fraction(0, 1)
        if (foundcr1) {
            --n // found the object corresponding to cr1, count down to find the second one
            ticks = d.ticks()
            if (d.tupletDenominator) {
                const f = TupletFractionCap(d.tupletDenominator, d.tripartite, d.isProlonging)
                ticks = ticks.div(f)
            }
            if (nobj.type() === CapellaNoteObjectType.REST) {
                const ro = nobj as RestObj
                if (ro.fullMeasures) {
                    const m = score.getCreateMeasure(tick2)
                    const ft = m.ticks()
                    ticks = ft.times(ro.fullMeasures)
                }
            }
            if (n === 0) {
                break
            }
            tick2 = tick2.plus(ticks)
        }
    }
    // Now we have the tick (tick) and the level of grace note (graceNumber1, if "no" is a grace note) for the first ChordRest
    // and the tick (tick2) and the level of grace note (graceNumber, if the target is a grace note) for the 2nd ChordRest
    for (let seg = score.tick2segment(tick); seg; seg = seg.next1()) {
        if (seg.segmentType() !== SegmentType.ChordRest) {
            continue
        }
        const cr = seg.element(track) as ChordRest | null
        if (cr) {
            if (graceNumber1 > 0 && cr.isChord()) { // the spanner is starting from a grace note
                const chord = cr as Chord
                for (const cc of chord.graceNotes()) {
                    --graceNumber1
                    if (graceNumber1 === 0 && !cr1) {
                        cr1 = cc // found first ChordRest
                    }
                }
            }
            if (!cr1) {
                cr1 = cr // found first ChordRest
            }
            break
        }
    }
    for (let seg = score.tick2segment(tick2); seg; seg = seg.next1()) {
        if (seg.segmentType() !== SegmentType.ChordRest) {
            continue
        }
        const cr = seg.element(track) as ChordRest | null
        if (cr) {
            if (graceNumber > 0 && cr.isChord()) { // the spanner is ending on a grace note
                const chord = cr as Chord
                for (const cc of chord.graceNotes()) {
                    --graceNumber
                    if (graceNumber === 0 && !cr2) {
                        cr2 = cc // found 2nd ChordRest
                    }
                }
            }
            if (!cr2) {
                cr2 = cr // found 2nd ChordRest
            }
            break
        }
    }
    CAPELLA_TRACE(`findChordRests nNotes ${o.nNotes} track ${track} tick ${tick.ticks()}`)

    if (!(cr1 && cr2)) {
        LOGD(`first or second anchor for BasicDrawObj not found (tick ${tick.ticks()} type ${o.type} track ${track})`)
        return null
    }
    return [cr1, cr2]
}

//---------------------------------------------------------
//   createAndAddTimeSig
//---------------------------------------------------------

function createAndAddTimeSig(_score: Score, m: Measure, f: Fraction, track: number, tick: Fraction): Segment {
    const s = m.getSegment(SegmentType.TimeSig, tick)
    const ts = new TimeSig(s)
    ts.setSig(f)
    ts.setTrack(track)
    s.add(ts)
    return s
}

function createTuplet(m: Measure, o: BasicDurationalObj, d: TDuration, ticks: Fraction, tupletNotesSpanned: number,
                      tuplettrp: boolean, tupletprol: boolean, track: number, tick: Fraction): Tuplet {
    const tuplet = new Tuplet(m)
    const f = TupletFractionCap(o.tupletDenominator, tuplettrp, tupletprol)
    tuplet.setRatio(f)
    tuplet.setBaseLen(d)
    tuplet.setTrack(track)
    tuplet.setTick(tick)
    tuplet.setParent(m)
    const nn = (o.tupletTicks.isZero() ? ticks.times(tupletNotesSpanned) : o.tupletTicks).div(f)
    tuplet.setTicks(nn)
    return tuplet
}

//---------------------------------------------------------
//   readCapVoice
//---------------------------------------------------------

function readCapVoice(score: Score, cvoice: CapVoice, staffIdx: number, t: Fraction, capxMode: boolean): Fraction {
    let tick = t
    const voice = cvoice.voiceNo
    const track = staffIdx * VOICES + voice

    //
    // pass I
    //
    const startTick = tick

    let tuplet: Tuplet | null = null
    let tupletNotesSpanned = 0 // Total number of notes/rests in the tuplet
    let tupletCurrentSequence = 0 // Current sequence number after adding to the tuplet (1 => first note/rest)
    let tuplettrp = false
    let tupletprol = false
    let pclef = score.staff(staffIdx)!.defaultClefType().concertClef

    let graceNotes: Chord[] = []
    for (const no of cvoice.objects) {
        switch (no.type()) {
        case CapellaNoteObjectType.REST: {
            CAPELLA_TRACE('     <Rest>')
            const m = score.getCreateMeasure(tick)
            const o = no as RestObj
            let ticks = o.ticks()
            if (o.invisible && ticks.isZero()) { // get rid of placeholders
                break
            }
            const d = new TDuration()
            d.setVal(ticks.ticks())
            if (o.tupletDenominator) {
                if (!tuplet) {
                    tupletCurrentSequence = 0 // reset tuplet counter
                    tupletNotesSpanned = o.tupletCount ? o.tupletCount + 1 : o.tupletDenominator
                    tuplettrp = o.tripartite
                    tupletprol = o.isProlonging
                    tuplet = createTuplet(m, o, d, ticks, tupletNotesSpanned, tuplettrp, tupletprol, track, tick)
                }
                CAPELLA_TRACE(`Tuplet(R) at ${tick.ticks()}: tupletDenominator: ${o.tupletDenominator}`)
            }

            const ft = m.ticks()
            if (o.fullMeasures) {
                ticks = ft.times(o.fullMeasures)
                if (!o.invisible) {
                    for (let i = 0; i < o.fullMeasures; ++i) {
                        const m1 = score.getCreateMeasure(tick.plus(ft.times(i)))
                        const s = m1.getSegment(SegmentType.ChordRest, tick.plus(ft.times(i)))
                        const rest = new Rest(s)
                        rest.setDurationType(new TDuration(DurationType.V_MEASURE))
                        rest.setTicks(m1.ticks())
                        rest.setTrack(staffIdx * VOICES + voice)
                        s.add(rest)
                    }
                }
            }
            if (!o.invisible || voice === 0) {
                const s = m.getSegment(SegmentType.ChordRest, tick)
                const rest = new Rest(s)
                const d1 = new TDuration()
                if (o.fullMeasures) {
                    d1.setType(DurationType.V_MEASURE)
                    rest.setTicks(m.ticks())
                } else {
                    d1.setVal(ticks.ticks())
                    rest.setTicks(d1.fraction())
                }
                rest.setDurationType(d1)
                rest.setTrack(track)
                rest.setVisible(!o.invisible)
                s.add(rest)
                if (tuplet) {
                    tuplet.add(rest)
                    if (++tupletCurrentSequence >= tupletNotesSpanned) {
                        o.tupletEnd = true // mark the last position in the tuplet
                    }
                }
                processBasicDrawObj(o.objects, s, track, rest)
            }

            if (tuplet) {
                if (o.tupletEnd) {
                    tick = tuplet.endTick()
                    //! NOTE If the tuplet is not added anywhere, then delete it
                    tuplet = null
                } else {
                    tick = tick.plus(ticks.div(tuplet.ratio()))
                }
            } else {
                tick = tick.plus(ticks)
            }
        }
            break
        case CapellaNoteObjectType.CHORD: {
            CAPELLA_TRACE('     <Chord>')
            const o = no as ChordObj
            const ticks = o.ticks()
            if (o.invisible && ticks.isZero()) { // get rid of placeholders
                break
            }
            const d = new TDuration()
            d.setVal(ticks.ticks())
            const m = score.getCreateMeasure(tick)

            const isgracenote = !o.invisible && ticks.isZero()
            if (o.tupletDenominator) {
                if (tuplet === null) {
                    tupletCurrentSequence = 0 // reset tuplet counter
                    tupletNotesSpanned = o.tupletCount ? o.tupletCount + 1 : o.tupletDenominator
                    tuplettrp = o.tripartite
                    tupletprol = o.isProlonging
                    tuplet = createTuplet(m, o, d, ticks, tupletNotesSpanned, tuplettrp, tupletprol, track, tick)
                }
                CAPELLA_TRACE(`Tuplet(C) at ${tick.ticks()}: tupletDenominator: ${o.tupletDenominator}`)
            }

            const chord = new Chord(scoreDummy(score).segment())
            if (isgracenote) { // grace notes
                SetCapGraceDuration(chord, o)
                chord.setTicks(chord.durationType().fraction())
            } else { // normal notes
                chord.setDurationType(d)
                chord.setTicks(d.fraction())
            }
            chord.setTrack(track)
            switch (o.stemDir) {
            case StemDir.DOWN:
                chord.setStemDirection(DirectionV.DOWN)
                break
            case StemDir.UP:
                chord.setStemDirection(DirectionV.UP)
                break
            case StemDir.NONE:
                chord.setNoStem(true)
                break
            case StemDir.AUTO:
            default:
                break
            }
            const s = m.getSegment(SegmentType.ChordRest, tick)
            if (isgracenote) {
                graceNotes.push(chord)
            } else {
                s.add(chord)
                // append grace notes before
                for (let ii = graceNotes.length - 1; ii >= 0; ii--) {
                    const gc = graceNotes[ii]
                    if (gc.voice() === chord.voice()) {
                        chord.add(gc)
                    }
                }
                graceNotes = []
            }
            if (tuplet) {
                tuplet.add(chord)
                if (++tupletCurrentSequence >= tupletNotesSpanned) {
                    o.tupletEnd = true // mark the last chord in the tuplet
                }
            }
            const clef = score.staff(staffIdx)!.clef(tick)
            const key = score.staff(staffIdx)!.key(tick)
            let off: number
            switch (clef) {
            case ClefType.G: off = 0
                break
            case ClefType.G8_VA: off = 7
                break
            case ClefType.G15_MA: off = 14
                break
            case ClefType.G8_VB: off = -7
                break
            case ClefType.F: off = -14
                break
            case ClefType.F8_VB: off = -21
                break
            case ClefType.F15_MB: off = -28
                break
            case ClefType.F_B: off = -14
                break
            case ClefType.F_C: off = -14
                break
            case ClefType.C1: off = -7
                break
            case ClefType.C2: off = -7
                break
            case ClefType.C3: off = -7
                break
            case ClefType.C4: off = -7
                break
            case ClefType.C4_8VB: off = -14
                break
            case ClefType.C5: off = -7
                break
            case ClefType.G_1: off = 0
                break
            case ClefType.F_8VA: off = -7
                break
            case ClefType.F_15MA: off = 0
                break
            default: off = 0
                LOGD(`clefType ${clef} not implemented`)
            }

            const keyOffsets = [
                /*   -7 -6 -5 -4 -3 -2 -1  0  1  2  3  4  5  6  7 */
                /* */ 7, 4, 1, 5, 2, 6, 3, 0, 4, 1, 5, 2, 6, 3, 0,
            ]
            if (key + 7 >= keyOffsets.length) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
            off += keyOffsets[key + 7]

            for (const n of o.notes) {
                const note = new Note(chord)
                let pitch = 0
                // .cap import: pitch contains the diatonic note number relative to clef and key
                // .capx  import: pitch the MIDI note number instead
                if (capxMode) {
                    pitch = n.pitch
                } else {
                    let l = n.pitch + off + 7 * 6
                    let octave = 0
                    while (l < 0) {
                        l += 7
                        octave--
                    }
                    octave += Math.trunc(l / 7)
                    l = l % 7

                    pitch = pitchKeyAdjust(l, key) + octave * 12
                }
                pitch += n.alteration
                pitch += score.staff(staffIdx)!.part()!.instrument()!.transpose().chromatic // assume not in concert pitch

                chord.add(note)
                note.setPitch(clampPitch(pitch))
                note.setHeadGroup(n.headGroup as NoteHeadGroup)
                // TODO: compute tpc from pitch & line
                note.setTpcFromPitch()
                if (o.rightTie) {
                    const tie = new Tie(scoreDummy(score))
                    tie.setStartNote(note)
                    tie.setTrack(track)
                    note.setTieFor(tie)
                }
            }
            for (const v of o.verse) {
                const l = new Lyrics(chord)
                l.setTrack(track)
                l.setPlainText(v.text)
                if (v.hyphen) {
                    l.setSyllabic(LyricsSyllabic.BEGIN)
                }
                l.setVerse(v.num)
                l.initTextStyleType(l.isEven() ? TextStyleType.LYRICS_EVEN : TextStyleType.LYRICS_ODD, /*preserveDifferent*/ true)
                chord.add(l)
            }

            processBasicDrawObj(o.objects, s, track, chord)
            switch (o.articulation) {
            case 7: // "weak beat"
            case 8: // "strong beat"
            default: if (o.articulation) {
                LOGD(`Articulation # ${o.articulation} not implemented`)
            }
                break
            }

            if (tuplet) {
                if (o.tupletEnd) {
                    tick = tuplet.endTick()
                    //! NOTE If the tuplet is not added anywhere, then delete it
                    tuplet = null
                } else {
                    tick = tick.plus(ticks.div(tuplet.ratio()))
                }
            } else {
                tick = tick.plus(ticks)
            }
        }
            break
        case CapellaNoteObjectType.CLEF: {
            CAPELLA_TRACE('     <Clef>')
            const o = no as CapClef
            const nclef = o.clef()
            CAPELLA_TRACE(`${tick.ticks()}:${staffIdx} <Clef> ${o.name()} line ${o.line} oct ${o.oct} clef ${o.clef()}`)
            if (nclef === ClefType.INVALID || nclef === pclef) {
                break
            }
            pclef = nclef
            let s: Segment
            const m = score.getCreateMeasure(tick)
            if (tick.eq(m.tick())) {
                s = m.getSegment(SegmentType.HeaderClef, tick)
            } else {
                s = m.getSegment(SegmentType.Clef, tick)
            }
            const clef = new Clef(s)
            clef.setClefType(nclef)
            clef.setTrack(staffIdx * VOICES)
            s.add(clef)
        }
            break
        case CapellaNoteObjectType.KEY: {
            CAPELLA_TRACE('   <Key>')
            const o = no as CapKey
            const staff = score.staff(staffIdx)!
            const key = staff.keySigEvent(tick)
            const okey = key.clone()
            const tKey = o.signature as Key
            let cKey = tKey
            const v = staff.part()!.instrument(tick)!.transpose()
            if (!v.isZero() && !score.style().styleB(Sid.concertPitch)) {
                cKey = Transpose.transposeKey(tKey, v)
                // if there are more than 6 accidentals in transposing key, it cannot be PreferSharpFlat::AUTO
                const part = staff.part()!
                if ((tKey > 6 || tKey < -6) && part.preferSharpFlat() === PreferSharpFlat.AUTO) {
                    part.setPreferSharpFlat(PreferSharpFlat.NONE)
                }
            }
            okey.setConcertKey(cKey)
            okey.setKey(tKey)
            if (!key.equals(okey)) {
                staff.setKey(tick, okey)
                const m = score.getCreateMeasure(tick)
                const s = m.getSegment(SegmentType.KeySig, tick)
                const ks = new KeySig(s)
                ks.setTrack(staffIdx * VOICES)
                ks.setKeySigEvent(okey)
                s.add(ks)
            }
        }
            break
        case CapellaNoteObjectType.METER: {
            const o = no as CapMeter
            CAPELLA_TRACE(`     <Meter> tick ${tick.ticks()} ${o.numerator}/${1 << o.log2Denom}`)
            if (o.log2Denom > 7 || o.log2Denom < 0) {
                LOGD('illegal fraction') // C++ ASSERT_X
            }
            const se = score.sigmap().timesig(tick)
            const f = new Fraction(o.numerator, 1 << o.log2Denom)
            const ne = new SigEvent(f)
            if (!se.timesig().identical(ne.timesig())) {
                score.sigmap().addSig(tick.ticks(), ne)
            }

            // do not add timesig again
            const m = score.getCreateMeasure(tick)
            let s = m.findSegment(SegmentType.TimeSig, tick)
            if (s) {
                const e = s.element(trackZeroVoice(track))
                if (e && (e as TimeSig).sig().identical(f)) {
                    break
                }
            }
            // create timesig in current track
            s = createAndAddTimeSig(score, m, f, track, tick)
            // if not present, also create timesig in track 0
            // to prevent corrupt .msc[xz] files when first staff
            // is empty and timesig is not 4/4
            if (!s.element(0)) {
                createAndAddTimeSig(score, m, f, 0, tick)
            }
            m.setTicks(f)
        }
            break
        case CapellaNoteObjectType.EXPL_BARLINE:
        case CapellaNoteObjectType.IMPL_BARLINE: { // does not exist?
            const o = no as CapExplicitBarline
            CAPELLA_TRACE('     <Barline>')
            let pm: Measure | null = null // the previous measure (the one terminated by this barline)
            if (tick.gt(new Fraction(0, 1))) {
                pm = score.getCreateMeasure(tick.minus(Fraction.fromTicks(1)))
            }
            if (pm) {
                const ticks = tick.minus(pm.tick())
                if (ticks.gt(new Fraction(0, 1)) && ticks.ne(pm.ticks())) {
                    // this is a measure with different actual duration
                    pm.setTicks(ticks)
                }
            }

            const st = o.barLineType()
            if (st & BarLineType.NORMAL) {
                break
            }

            if ((st & BarLineType.START_REPEAT) || (st & BarLineType.END_START_REPEAT)) {
                const nm = score.getCreateMeasure(tick) // the next measure (the one started by this barline)
                if (nm) {
                    nm.setRepeatStart(true)
                }
            }

            if ((st & BarLineType.END_REPEAT) || (st & BarLineType.END_START_REPEAT)) {
                if (pm) {
                    pm.setRepeatEnd(true)
                }
            }
        }
            break
        }
    }
    const endTick = tick

    //
    // pass II
    //
    tick = startTick
    for (const no of cvoice.objects) {
        if (!isDurational(no)) {
            continue
        }
        const d: BasicDurationalObj = no
        for (const o of d.objects) {
            switch (o.type) {
            case CapellaType.SIMPLE_TEXT:
                break
            case CapellaType.WAVY_LINE:
                break
            case CapellaType.SLUR: {
                const res = findChordRests(o, score, track, tick, no, cvoice.objects)

                if (res) {
                    const [cr1, cr2] = res
                    if (cr1 === cr2) {
                        LOGD(`first and second anchor for slur identical (tick ${tick.ticks()} track ${track})`)
                    } else {
                        const slur = new Slur(scoreDummy(score))
                        slur.setTick(cr1.tick())
                        slur.setTick2(cr2.tick())
                        slur.setStartElement(cr1)
                        slur.setEndElement(cr2)
                        slur.setTrack(cr1.track())
                        slur.setTrack2(cr2.track())
                        score.addElement(slur)
                    }
                }
            }
                break
            case CapellaType.TEXT: {
                const to = o as TextObj
                let measure: MeasureBase = score.measures().first()!
                const s = new Text(measure, TextStyleType.TITLE)
                const ss = rtf2html(to.text)

                s.setXmlText(ss)

                if (!measure.isVBox()) {
                    const mb = new VBox(scoreDummy(score).system())
                    mb.setTick(new Fraction(0, 1))
                    score.addMeasure(mb, measure)
                    measure = mb
                }
                s.setParent(measure)
                measure.add(s)
            }
                break
            case CapellaType.VOLTA: {
                const vo = o as VoltaObj
                const res = findChordRests(o, score, track, tick, no, cvoice.objects)

                if (res) {
                    const [cr1, cr2] = res
                    const volta = new Volta(scoreDummy(score))
                    volta.setTrack(track)
                    volta.setTrack2(track)
                    // TODO also support endings such as "1 - 3"
                    volta.setText(`${vo.to}.`)
                    volta.endings().push(vo.to)
                    if (vo.bRight) {
                        volta.setVoltaType(VoltaType.CLOSED)
                    } else {
                        volta.setVoltaType(VoltaType.OPEN)
                    }
                    volta.setTick(cr1.measure()!.tick())
                    volta.setTick2(cr2.measure()!.endTick())
                    score.addElement(volta)
                }
            }
                break
            case CapellaType.TRILL: {
                const tro = o as TrillObj
                const res = findChordRests(o, score, track, tick, no, cvoice.objects)
                if (res) {
                    const [cr1, cr2] = res
                    if (cr1 === cr2) {
                        LOGD(`first and second anchor for trill line identical (tick ${tick.ticks()} track ${track})`)
                    } else {
                        const trill = new Trill(scoreDummy(score))
                        trill.setTrack(track)
                        trill.setTrack2(track)
                        trill.setTick(cr1.tick())
                        trill.setTick2(cr2.tick())
                        if (!tro.trillSign) {
                            trill.setTrillType(TrillType.PRALLPRALL_LINE)
                        }
                        score.addElement(trill)
                    }
                }
            }
                break
            case CapellaType.WEDGE: {
                const wdgo = o as WedgeObj
                const res = findChordRests(o, score, track, tick, no, cvoice.objects)
                if (res) {
                    const [cr1, cr2] = res
                    if (cr1 === cr2) {
                        LOGD(`first and second anchor for hairpin identical (tick ${tick.ticks()} track ${track})`)
                    } else {
                        const hp = new Hairpin(scoreDummy(score).segment())
                        if (wdgo.decresc) {
                            hp.setHairpinType(HairpinType.DIM_HAIRPIN)
                        } else {
                            hp.setHairpinType(HairpinType.CRESC_HAIRPIN)
                        }
                        hp.setTick(cr1.tick())
                        hp.setTick2(cr2.tick())
                        hp.setTrack(track)
                        hp.setTrack2(track)
                        hp.setAnchor(SpannerAnchor.SEGMENT)
                        score.addSpanner(hp)
                    }
                }
            }
                break
            default:
                break
            }
        }
        let ticks = d.ticks()
        if (d.tupletDenominator) {
            const f = TupletFractionCap(d.tupletDenominator, d.tripartite, d.isProlonging)
            ticks = ticks.div(f)
        }
        if (no.type() === CapellaNoteObjectType.REST) {
            const o = no as RestObj
            if (o.fullMeasures) {
                const m = score.getCreateMeasure(tick)
                const ft = m.ticks()
                ticks = ft.times(o.fullMeasures)
            }
        }
        tick = tick.plus(ticks)
    }
    return endTick
}

//---------------------------------------------------------
//   needPart -- determine if a staff needs its own part
//---------------------------------------------------------

// As Capella does not define parts (it only knows about staves,
// MIDI instruments numbers, brackets and braces), the following
// algorithm is used:
// - every staff is a separate part
// - unless:
//   - it is in a brace
//   - it is not the first staff in the brace
//   - it has the same MIDI instrument as the previous staff
// Common cases:
// - Keyboards: two or three staves with the same MIDI instrument and a brace
//   -> create one part
// - SATB: two or four staves with the same MIDI instrument and a bracket
//   -> create two or four parts

function needPart(prevInst: number, currInst: number, staffIdx: number, bracketList: readonly CapBracket[]): boolean {
    for (const cb of bracketList) {
        if (prevInst === currInst && cb.from < staffIdx && staffIdx <= cb.to && cb.curly) {
            return false
        }
    }
    return true
}

//---------------------------------------------------------
//   convertCapella
//---------------------------------------------------------

export function convertCapella(score: Score, cap: Capella, capxMode: boolean): void {
    if (cap.systems.length === 0) {
        return
    }

    score.style().set(Sid.measureSpacing, 1.0)
    score.style().setSpatium(cap.normalLineDist * DPMM)
    score.style().set(Sid.smallStaffMag, cap.smallLineDist / cap.normalLineDist)
    score.style().set(Sid.minSystemDistance, new Spatium(8))
    score.style().set(Sid.maxSystemDistance, new Spatium(12))

    for (const csys of cap.systems) {
        CAPELLA_TRACE('System:')
        for (const cstaff of csys.staves) {
            const cl = cap.staffLayout(cstaff!.iLayout)
            if (!cl) {
                throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
            }
        }
    }

    //
    // find out the maximum number of staves
    //
    let staves = 0
    for (const csys of cap.systems) {
        staves = Math.max(staves, csys.staves.length)
    }
    //
    // check the assumption that every stave should be
    // associated with a CapStaffLayout
    //
    if (staves !== cap.staffLayouts().length) {
        LOGD(`Capella: max number of staves != number of staff layouts (${staves}, ${cap.staffLayouts().length})`)
        staves = Math.max(staves, cap.staffLayouts().length)
    }

    // set the initial time signature
    const cs = cap.systems[0].staves[0]!
    if (cs.log2Denom <= 7) {
        score.sigmap().addSig(0, new Fraction(cs.numerator, 1 << cs.log2Denom))
    }

    // create parts and staves
    let bstaff = null
    let span = 1
    let midiPatch = -1 // the previous MIDI patch (instrument)
    let part: Part | null = null
    for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
        const cl = cap.staffLayout(staffIdx)
        if (!cl) {
            throw new CapellaError(CapellaErrorCode.BAD_FORMAT)
        }

        // create a new part if necessary
        if (needPart(midiPatch, cl.sound, staffIdx, cap.brackets)) {
            part = new Part(score)
            score.appendPart(part)
        }
        midiPatch = cl.sound

        const s = Factory.createStaff(part!)
        s.initFromStaffType(null)

        if (cl.bPercussion) {
            part!.setMidiProgram(0, 128)
        } else {
            part!.setMidiProgram(cl.sound, 0)
        }
        part!.setPartName(cl.descr)
        part!.setPlainLongName(cl.name)
        part!.setPlainShortName(cl.abbrev)

        // ClefType clefType = CapClef::clefType(cl->form, cl->line, cl->oct);
        // s->setClef(0, clefType);
        s.setBarLineSpan(false)
        if (bstaff === null) {
            bstaff = s
            span = 0
        }
        ++span
        if (cl.barlineMode === 1) {
            bstaff.setBarLineSpan(span !== 0)
            bstaff = null
        }

        s.staffType(new Fraction(0, 1)).setSmall(cl.bSmall)
        const interval = new Interval()
        // guess diatonic transposition from chromatic transposition for the instrument
        const values = [-6, -6, -5, -5, -4, -3, -3, -2, -2, -1, -1, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
        interval.diatonic = values[(cl.transp % 12) + 11] + Math.trunc(cl.transp / 12) * 7
        interval.chromatic = cl.transp
        s.part()!.instrument()!.setTranspose(interval)
        score.appendStaff(s)
    }
    if (bstaff) {
        bstaff.setBarLineSpan(span !== 0)
    }

    for (const cb of cap.brackets) {
        CAPELLA_TRACE(`Bracket ${cb.from}-${cb.to} curly ${cb.curly}`)
        const staff = score.staves()[cb.from] ?? null
        if (!staff) {
            LOGD("bad bracket 'from' value")
            continue
        }
        staff.setBracketType(0, cb.curly ? BracketType.BRACE : BracketType.NORMAL)
        staff.setBracketSpan(0, cb.to - cb.from + 1)
    }
    let measure: MeasureBase | null = null
    for (const o of cap.backgroundChord!.objects) {
        switch (o.type) {
        case CapellaType.SIMPLE_TEXT: {
            const to = o as SimpleTextObj
            let tid: TextStyleType
            switch (to.textalign()) {
            case 0: tid = TextStyleType.LYRICIST
                break
            case 1: tid = TextStyleType.TITLE
                break
            case 2: tid = TextStyleType.COMPOSER
                break
            default: tid = TextStyleType.DEFAULT
                break
            }

            if (!measure) {
                measure = Factory.createTitleVBox(scoreDummy(score).system())
                score.addMeasure(measure, score.measures().first())
            }

            const s = new Text(measure, tid)
            const f = to.font()
            s.setItalic(f.italic)
            // s->setUnderline(f.underline());
            // s->setStrike(f.strikeOut());
            s.setBold(f.bold)
            s.setSize(f.pointSizeF)

            const ss = to.text()
            s.setPlainText(ss)

            measure.add(s)
        }
            break
        default:
            LOGD(`page background object type ${o.type}`)
            break
        }
    }

    if (cap.topDist) {
        let mb: VBox | null = null
        const mbl = score.measures()
        if (mbl.size() && mbl.first()!.isVBox()) {
            mb = mbl.first() as VBox
        } else {
            const vb = Factory.createTitleVBox(scoreDummy(score).system())
            score.addMeasure(vb, mb)
            mb = vb
        }
        mb.setBoxHeight(new Spatium(cap.topDist))
    }

    let systemTick = new Fraction(0, 1)
    for (const csys of cap.systems) {
        CAPELLA_TRACE('readCapSystem')
        /*
        if (csys->explLeftIndent > 0) {
              HBox* mb = Factory::createHBox(score);
              mb->setTick(systemTick);
              mb->setBoxWidth(Spatium(csys->explLeftIndent));
              score->addMeasure(mb);
              }
        */
        let mtick = new Fraction(0, 1)
        for (const cstaff of csys.staves) {
            //
            // assumption: layout index is mscore staffIdx
            //    which means that there is a 1:1 relation between layout/staff
            //
            const staffIdx = cstaff!.iLayout
            if (!score.staff(staffIdx)) {
                continue
            }
            for (const cvoice of cstaff!.voices) {
                const tick = readCapVoice(score, cvoice, staffIdx, systemTick, capxMode)
                if (tick.gt(mtick)) {
                    mtick = tick
                }
            }
        }
        const m = score.tick2measure(mtick.minus(Fraction.fromTicks(1)))
        if (m && !m.lineBreak()) {
            const lb = new LayoutBreak(m)
            lb.setLayoutBreakType(LayoutBreakType.LINE)
            lb.setTrack(0)
            m.add(lb)
        }
        systemTick = mtick
    }

    //
    // fill empty measures with rests
    //
    const st = SegmentType.ChordRest
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        for (let staffIdx = 0; staffIdx < score.staves().length; ++staffIdx) {
            let empty = true
            for (let s = m.first(st); s; s = s.next(st)) {
                if (s.element(staffIdx * VOICES)) {
                    empty = false
                    break
                }
            }
            if (empty) {
                if (m.ticks().eq(m.timesig())) {
                    const s = m.getSegment(SegmentType.ChordRest, m.tick())
                    const rest = new Rest(s)
                    rest.setDurationType(DurationType.V_MEASURE)
                    rest.setTicks(m.ticks())
                    rest.setTrack(staffIdx * VOICES)
                    s.add(rest)
                } else {
                    const durList = toDurationList(m.ticks(), true)
                    let tickOffset = 0
                    for (const d of durList) {
                        const s = m.getSegment(SegmentType.ChordRest, m.tick().plus(Fraction.fromTicks(tickOffset)))
                        const rest = new Rest(s)
                        rest.setDurationType(d)
                        rest.setTrack(staffIdx * VOICES)
                        s.add(rest)
                        tickOffset += d.ticks().ticks()
                    }
                }
            }
        }
    }
    // score->connectSlurs();
    score.connectTies()
    score.setUpTempoMap()
    score.setPlaylistDirty()
    score.setLayoutAll()
}

/** reports the error of a failed import (C++ the MessageBox of importCapella); null: not reported (C++ MScore::noGui) */
export type CapellaErrorHandler = ((message: string) => void) | null

//---------------------------------------------------------
//   importCapella
//---------------------------------------------------------

export function importCapella(score: MasterScore, data: Uint8Array, onError: CapellaErrorHandler = null): void {
    const cf = new Capella()
    try {
        cf.readFile(data)
        convertCapella(score, cf, false)
    } catch (e) {
        if (!(e instanceof CapellaError)) {
            throw e
        }
        if (onError) {
            onError(mtrc('iex_capella', 'Import failed: %1').replace('%1', cf.error(e.errNo)))
        }
        // avoid another error message box
    }
}
