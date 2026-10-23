/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/capella/internal/capxml.cpp: the CapXML import filter.
 * Supports the CapXML 1.0 file format version 1.0.8 (capella 2008).
 * The implementation shares as much code as possible with the capella (.cap) importer (capella.ts); the readCapx
 * methods of its classes are added here (C++ defines them in capxml.cpp).
 * If statements in the parser match the element order in the schema definition.
 */

import { Fraction } from '../../../engraving/types/fraction'
import { BarLineType, NoteHeadGroup } from '../../../engraving/types/types'
import { XmlReader } from '../../../engraving/rw/xmlreader'
import { pitchIsValid } from '../../../engraving/dom/pitchspelling'
import { unzipSync } from 'fflate'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import { PointF } from '../../../framework/draw/types/geometry'
import {
    BasicDrawObj, BasicDurationalObj, BracketObj, Capella, CapellaError, CapellaType, CapClef, CapExplicitBarline,
    CapFont, CapKey, CapMeter, CapStaff, CapStaffLayout, CapSystem, CapVoice, ChordObj, ClefLine, convertCapella,
    Form, Oct, RestObj, SimpleTextObj, SlurObj, StemDir, TIMESTEP, TransposableObj, TrillObj, VoltaObj, WedgeObj,
    CapBeamMode, type CapBracket, type BasicDurationalObj as BasicDurationalObjType,
} from './capella'

function LOGD(..._args: unknown[]): void {}
/** C++ LOGE (the messages of files MuseScore reads anyway; not shown here) */
function LOGE(..._args: unknown[]): void {}

declare module './capella' {
    interface CapClef { readCapx(e: XmlReader): void }
    interface CapKey { readCapx(e: XmlReader): void }
    interface CapMeter { readCapx(e: XmlReader): void }
    interface CapExplicitBarline { readCapx(e: XmlReader): void }
    interface BasicDrawObj { readCapx(e: XmlReader): void }
    interface BasicDurationalObj {
        readCapxDuration(e: XmlReader): number
        readCapxDisplay(e: XmlReader): void
        readCapxObjectArray(e: XmlReader): void
    }
    interface ChordObj {
        readCapxChord(e: XmlReader): void
        readCapxLyrics(e: XmlReader): void
        readCapxNotes(e: XmlReader): void
        readCapxStem(e: XmlReader): void
        readCapxArticulation(e: XmlReader): void
    }
    interface RestObj { readCapxRest(e: XmlReader): void }
    interface SimpleTextObj { readCapxText(e: XmlReader): void }
    interface TransposableObj { readCapxTransposable(e: XmlReader): void }
    interface SlurObj { readCapxSlur(e: XmlReader): void }
    interface VoltaObj { readCapxVolta(e: XmlReader): void }
    interface TrillObj { readCapxTrill(e: XmlReader): void }
    interface WedgeObj { readCapxWedge(e: XmlReader): void }
    interface BracketObj { readCapxBracket(e: XmlReader): void }
    interface Capella {
        readCapx(e: XmlReader): void
        readCapxDrawObjectArray(e: XmlReader): BasicDrawObj[]
        readCapxVoice(e: XmlReader, cs: CapStaff, idx: number): void
        readCapxStaff(e: XmlReader, system: CapSystem): void
        readCapxSystem(e: XmlReader): void
        capxSystems(e: XmlReader): void
        readCapxStaveLayout(e: XmlReader, sl: CapStaffLayout, idx: number): void
        capxLayoutStaves(e: XmlReader): void
        capxLayout(e: XmlReader): void
        initCapxLayout(): void
    }
}

// In C++ the readCapx methods of the derived draw objects hide BasicDrawObj::readCapx (which reads the <basic>
// element); here they have their own names (readCapxText, readCapxSlur, ...).

//---------------------------------------------------------
//   capxReadFont
//---------------------------------------------------------

function capxReadFont(e: XmlReader): CapFont {
    const f = new CapFont()
    const family = e.attribute('face')
    if (family !== '') {
        f.family = family
    }
    const pointSize = e.doubleAttribute('height', 0)
    if (pointSize > 0.5) {
        f.pointSizeF = pointSize
    }
    const weight = e.intAttribute('weight')
    if (weight < 200) {
        f.bold = false // QFont::Light
    } else if (weight < 550) {
        f.bold = false // QFont::Normal
    } else {
        f.bold = true
    }
    f.italic = e.asciiAttribute('italic', 'false') === 'true'
    e.readNext()
    return f
}

//---------------------------------------------------------
//   qstring2timestep -- convert string to TIMESTEP
//---------------------------------------------------------

function qstring2timestep(str: string): TIMESTEP | null {
    switch (str) {
    case '1/1': return TIMESTEP.D1
    case '1/2': return TIMESTEP.D2
    case '1/4': return TIMESTEP.D4
    case '1/8': return TIMESTEP.D8
    case '1/16': return TIMESTEP.D16
    case '1/32': return TIMESTEP.D32
    case '1/64': return TIMESTEP.D64
    case '1/128': return TIMESTEP.D128
    case '2/1': return TIMESTEP.D_BREVE
    }
    return null
}

/** QString::toInt(): 0 if the string is not a number */
function toInt(s: string): number {
    const t = s.trim()
    return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : 0
}

//---------------------------------------------------------
//   BasicDrawObj::readCapx -- capx equivalent of BasicDrawObj::read
//---------------------------------------------------------

BasicDrawObj.prototype.readCapx = function (this: BasicDrawObj, e: XmlReader): void {
    this.nNotes = e.intAttribute('noteRange', 0)
    e.readNext()
}

//---------------------------------------------------------
//   BasicDurationalObj::readCapxDisplay -- capx equivalent of BasicDurationalObj::read
//   reads the <display> element only
//---------------------------------------------------------

BasicDurationalObj.prototype.readCapxDisplay = function (this: BasicDurationalObj, e: XmlReader): void {
    this.invisible = e.attribute('invisible') === 'true'
    e.readNext()
}

//---------------------------------------------------------
//   BasicDurationalObj::readCapx -- capx equivalent of BasicDurationalObj::read
//   returns fullm (the number of measures of a multi-measure rest, C++ the reference parameter; 0 if not set)
//---------------------------------------------------------

BasicDurationalObj.prototype.readCapxDuration = function (this: BasicDurationalObj, e: XmlReader): number {
    let fullm = 0
    this.nDots = 0
    this.noDuration = false
    this.postGrace = false
    this.bSmall = false
    this.invisible = false
    this.notBlack = false
    this.color = 0x000000
    this.t = TIMESTEP.D1
    this.horizontalShift = 0
    this.tupletDenominator = 0
    this.tripartite = false
    this.isProlonging = false
    const base = e.attribute('base')
    // try to convert base to timestep ("first pattern")
    const t = qstring2timestep(base)
    if (t !== null) {
        this.t = t
    } else {
        // try multi-measure rest ("second pattern")
        const i = toInt(base)
        if (i > 0) {
            fullm = i
        } else {
            LOGD(`BasicDurationalObj::readCapx: invalid base: '${base}'`)
        }
    }
    this.nDots = e.intAttribute('dots', 0)
    this.noDuration = e.asciiAttribute('noDuration', 'false') === 'true'
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'tuplet') {
            this.tupletDenominator = toInt(e.attribute('count'))
            this.tripartite = e.asciiAttribute('tripartite', 'false') === 'true'
            this.isProlonging = e.asciiAttribute('prolong', 'false') === 'true'
            e.readNext()
        } else {
            e.unknown()
        }
    }
    return fullm
}

//---------------------------------------------------------
//   BasicDurationalObj::readCapxObjectArray
//---------------------------------------------------------

BasicDurationalObj.prototype.readCapxObjectArray = function (this: BasicDurationalObj, e: XmlReader): void {
    this.objects = capellaOf(this).readCapxDrawObjectArray(e)
}

/** the protected CapellaObj::cap */
function capellaOf(o: object): Capella {
    return (o as unknown as { cap: Capella }).cap
}

//---------------------------------------------------------
//   CapExplicitBarline::readCapx -- capx equivalent of CapExplicitBarline::read
//---------------------------------------------------------

CapExplicitBarline.prototype.readCapx = function (this: CapExplicitBarline, e: XmlReader): void {
    const type = e.asciiAttribute('type', 'single')
    if (type === 'single') {
        this.m_type = BarLineType.NORMAL
    } else if (type === 'double') {
        this.m_type = BarLineType.DOUBLE
    } else if (type === 'end') {
        this.m_type = BarLineType.END
    } else if (type === 'repEnd') {
        this.m_type = BarLineType.END_REPEAT
    } else if (type === 'repBegin') {
        this.m_type = BarLineType.START_REPEAT
    } else if (type === 'repEndBegin') {
        this.m_type = BarLineType.END_START_REPEAT
    } else if (type === 'dashed') {
        this.m_type = BarLineType.BROKEN
    } else {
        this.m_type = BarLineType.NORMAL // default
    }
    this.m_barMode = 0
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'drawObjects') {
            e.skipCurrentElement()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   CapClef::readCapx -- capx equivalent of CapClef::read
//---------------------------------------------------------

CapClef.prototype.readCapx = function (this: CapClef, e: XmlReader): void {
    const clef = e.attribute('clef')
    if (clef === 'G2-') {
        this.form = Form.G
        this.line = ClefLine.L2
        this.oct = Oct.OCT_BASSA
    } else if (clef === 'treble') {
        this.form = Form.G
        this.line = ClefLine.L2
        this.oct = Oct.OCT_NULL
    } else if (clef === 'bass') {
        this.form = Form.F
        this.line = ClefLine.L4
        this.oct = Oct.OCT_NULL
    } else {
        /* default */
        this.form = Form.G
        this.line = ClefLine.L2
        this.oct = Oct.OCT_NULL
    }
    e.readNext()
}

//---------------------------------------------------------
//   CapKey::readCapx -- capx equivalent of CapKey::read
//---------------------------------------------------------

CapKey.prototype.readCapx = function (this: CapKey, e: XmlReader): void {
    this.signature = e.intAttribute('fifths', 0)
    e.readNext()
}

//---------------------------------------------------------
//   qstring2timesig -- convert string to timesig
//---------------------------------------------------------

function qstring2timesig(time: string): { numerator: number; log2Denom: number; allaBreve: boolean } {
    let numerator = 4
    let log2Denom = 2
    let allaBreve = false // set default
    if (time === 'allaBreve') {
        numerator = 2
        log2Denom = 1
        allaBreve = true
    } else if (time === 'longAllaBreve') {
        numerator = 4
        log2Denom = 1
        allaBreve = true
    } else if (time === 'C') {
        numerator = 4
        log2Denom = 2
        allaBreve = false
    } else if (time === 'infinite') {
        LOGD('Meter infinite')
    } else { // not supported by MuseScore ?
        const splitTime = time.split('/')
        if (splitTime.length === 2) {
            numerator = toInt(splitTime[0]) & 0xff // uchar
            const denom = splitTime[1]
            switch (denom) {
            case '1': log2Denom = 0
                break
            case '2': log2Denom = 1
                break
            case '4': log2Denom = 2
                break
            case '8': log2Denom = 3
                break
            case '16': log2Denom = 4
                break
            case '32': log2Denom = 5
                break
            case '64': log2Denom = 6
                break
            case '128': log2Denom = 7
                break
            }
        }
    }
    // TODO: recovery required if decoding the timesig failed ?
    return { numerator, log2Denom, allaBreve }
}

//---------------------------------------------------------
//   CapMeter::readCapx -- capx equivalent of CapMeter::read
//---------------------------------------------------------

CapMeter.prototype.readCapx = function (this: CapMeter, e: XmlReader): void {
    const time = e.attribute('time')
    const ts = qstring2timesig(time)
    this.numerator = ts.numerator
    this.log2Denom = ts.log2Denom
    this.allaBreve = ts.allaBreve
    e.readNext()
}

//---------------------------------------------------------
//   ChordObj::readCapxStem -- read <stem> element
//---------------------------------------------------------

ChordObj.prototype.readCapxStem = function (this: ChordObj, e: XmlReader): void {
    const dir = e.attribute('dir')
    if (dir === 'up') {
        this.stemDir = StemDir.UP
    } else if (dir === 'down') {
        this.stemDir = StemDir.DOWN
    } else if (dir === 'none') {
        this.stemDir = StemDir.NONE
    }
    e.readNext()
}

//---------------------------------------------------------
//   ChordObj::readCapxArticulation -- read <articulation> element
//---------------------------------------------------------

ChordObj.prototype.readCapxArticulation = function (this: ChordObj, e: XmlReader): void {
    const art = e.attribute('type')
    switch (art) {
    case 'staccato': this.articulation = 1
        break
    case 'tenuto': this.articulation = 2
        break
    case 'staccato tenuto': this.articulation = 3
        break
    case 'staccatissimo': this.articulation = 4
        break
    case 'normalAccent': this.articulation = 5
        break
    case 'strongAccent': this.articulation = 6
        break
    case 'weakBeat': this.articulation = 7
        break
    case 'strongBeat': this.articulation = 8
        break
    default: this.articulation = 0
        break
    }
    e.readNext()
}

//---------------------------------------------------------
//   ChordObj::readCapx -- capx equivalent of ChordObj::read
//---------------------------------------------------------

ChordObj.prototype.readCapxChord = function (this: ChordObj, e: XmlReader): void {
    this.stemDir = StemDir.AUTO
    this.dStemLength = 0
    this.nTremoloBars = 0
    this.articulation = 0
    this.leftTie = false
    this.rightTie = false
    this.beamShift = 0
    this.beamSlope = 0
    this.beamMode = CapBeamMode.AUTO
    this.notationStave = 0

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'duration') {
            this.readCapxDuration(e)
        } else if (tag === 'display') {
            this.readCapxDisplay(e)
        } else if (tag === 'stem') {
            this.readCapxStem(e)
        } else if (tag === 'beam') {
            LOGD('ChordObj::readCapx: found beam (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'articulation') {
            this.readCapxArticulation(e)
        } else if (tag === 'lyric') {
            this.readCapxLyrics(e)
        } else if (tag === 'drawObjects') {
            this.readCapxObjectArray(e)
        } else if (tag === 'heads') {
            this.readCapxNotes(e)
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   pitchStr2Char -- convert pitch string ("[A-G][0-9]") to signed char
//   notes:
//   - in .capx middle C is called C5 (which is C4 in MusicXML)
//   - middle C is MIDI note number 60
//   - in .cap, pitch contains the diatonic note number relative to clef and key
//   - as .capx contains absolute notes, store the MIDI note number instead
//---------------------------------------------------------

function pitchStr2Char(strPitch: string): number {
    if (!/^[A-G][0-9]$/.test(strPitch)) {
        LOGD(`pitchStr2Char: illegal pitch '${strPitch}'`)
        return 0
    }

    const steps = 'C.D.EF.G.A.B'
    const istep = steps.indexOf(strPitch[0])
    const octave = parseInt(strPitch[1], 10)
    let pitch = istep + 12 * octave

    if (!pitchIsValid(pitch)) {
        pitch = -1
    }

    return (pitch << 24) >> 24 // static_cast<signed char>
}

//---------------------------------------------------------
//   ChordObj::readCapxLyrics -- read the lyrics in a capx chord
//---------------------------------------------------------

ChordObj.prototype.readCapxLyrics = function (this: ChordObj, e: XmlReader): void {
    while (e.readNextStartElement()) {
        if (e.name() === 'verse') {
            this.verse.push({
                leftAlign: true, // not used by capella.cpp
                extender: false, // not used by capella.cpp
                hyphen: e.attribute('hyphen') === 'true',
                num: e.intAttribute('i', 0),
                verseNumber: e.attribute('verseNumber'), // not used by capella.cpp
                text: e.readText(),
            })
        } else {
            e.unknown()
        }
    }
}

/**
 * find a BracketObj in the drawObjects list, get the data and delete it
 * this is used to read Tuplets with mixed durations
 */
function findTupletBracket(o: BasicDurationalObjType): void {
    if (o.tupletDenominator <= 0) {
        return // no tuplet, so we are done
    }

    const idx = o.objects.findIndex(d => d.type === CapellaType.BRACKET)
    if (idx >= 0) {
        o.tupletStart = true
        o.tupletCount = o.objects[idx].nNotes
        o.objects.splice(idx, 1)
        return
    }
    LOGE(`no tuplet start found in drawObjects, but tupletDenominator ${o.tupletDenominator}`)
}

//---------------------------------------------------------
//   ChordObj::readCapxNotes -- read the notes in a capx chord
//---------------------------------------------------------

ChordObj.prototype.readCapxNotes = function (this: ChordObj, e: XmlReader): void {
    while (e.readNextStartElement()) {
        if (e.name() === 'head') {
            const pitch = e.attribute('pitch')
            let sstep = ''
            const shape = e.attribute('shape')
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'alter') {
                    sstep = e.attribute('step')
                    e.readNext()
                } else if (tag === 'tie') {
                    this.rightTie = e.attribute('begin') === 'true'
                    e.readNext()
                } else {
                    e.unknown()
                }
            }
            const istep = toInt(sstep)
            this.notes.push({
                pitch: pitchStr2Char(pitch),
                explAlteration: 0,
                headType: 0,
                headGroup: shape === 'none' ? NoteHeadGroup.HEAD_CROSS : NoteHeadGroup.HEAD_NORMAL,
                alteration: istep,
                silent: 0,
            })
        } else {
            e.unknown()
        }
    }

    findTupletBracket(this)
}

//---------------------------------------------------------
//   RestObj::readCapx -- capx equivalent of RestObj::read
//---------------------------------------------------------

RestObj.prototype.readCapxRest = function (this: RestObj, e: XmlReader): void {
    this.bVerticalCentered = false
    this.fullMeasures = 0
    this.vertShift = 0
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'duration') {
            const fullm = this.readCapxDuration(e)
            if (fullm) {
                this.fullMeasures = fullm
            }
        } else if (tag === 'display') {
            this.readCapxDisplay(e)
        } else if (tag === 'verticalPos') {
            LOGD('RestObj::readCapx: found verticalPos (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'drawObjects') {
            this.readCapxObjectArray(e)
        } else {
            e.unknown()
        }
    }

    findTupletBracket(this)
}

//---------------------------------------------------------
//   SimpleTextObj::readCapx -- capx equivalent of SimpleTextObj::read
//---------------------------------------------------------

SimpleTextObj.prototype.readCapxText = function (this: SimpleTextObj, e: XmlReader): void {
    const x = e.doubleAttribute('x')
    const y = e.doubleAttribute('y')
    const stralign = e.asciiAttribute('align', 'left')
    this.align = 0
    if (stralign === 'center') {
        this.align = 1
    } else if (stralign === 'right') {
        this.align = 2
    }
    this.relPos = new PointF(x * 32.0, y * 32.0)
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'font') {
            this.m_font = capxReadFont(e)
        } else if (tag === 'content') {
            this.m_text = e.readText()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   TransposableObj::readCapx -- capx equivalent of TransposableObj::read
//---------------------------------------------------------

TransposableObj.prototype.readCapxTransposable = function (this: TransposableObj, e: XmlReader): void {
    const enharmonicNote = e.attribute('base')
    while (e.readNextStartElement()) {
        const tag1 = e.name()
        if (tag1 === 'drawObj') {
            if (e.attribute('base') === enharmonicNote) {
                while (e.readNextStartElement()) {
                    const tag2 = e.name()
                    if (tag2 === 'group') {
                        this.variants.push(...capellaOf(this).readCapxDrawObjectArray(e))
                    }
                }
            } else {
                e.skipCurrentElement()
            }
        }
    }
}

//---------------------------------------------------------
//   SlurObj::readCapx -- capx equivalent of SlurObj::read
//---------------------------------------------------------

SlurObj.prototype.readCapxSlur = function (this: SlurObj, e: XmlReader): void {
    // nothing to be done yet
    e.skipCurrentElement()
}

//---------------------------------------------------------
//   VoltaObj::readCapx -- capx equivalent of VoltaObj::read
//---------------------------------------------------------

VoltaObj.prototype.readCapxVolta = function (this: VoltaObj, e: XmlReader): void {
    this.bLeft = e.asciiAttribute('leftBent', 'true') === 'true'
    this.bRight = e.asciiAttribute('rightBent', 'true') === 'true'
    this.bDotted = e.asciiAttribute('dotted', 'false') === 'true'
    this.allNumbers = e.asciiAttribute('allNumbers', 'false') === 'true'
    const firstNumber = e.intAttribute('firstNumber', 0)
    const lastNumber = e.intAttribute('lastNumber', 0)
    if (firstNumber === 0) {
        // don't know what this means (spec: no number)
        // cap status equivalent to no first or last number
        this.from = 1
        this.to = 0
    } else {
        this.from = firstNumber
        this.to = lastNumber === 0 ? firstNumber : lastNumber
    }
    e.readNext()
}

//---------------------------------------------------------
//   TrillObj::readCapx -- capx equivalent of TrillObj::read
//---------------------------------------------------------

TrillObj.prototype.readCapxTrill = function (this: TrillObj, e: XmlReader): void {
    const x0d = e.doubleAttribute('x1', 0.0)
    const x1d = e.doubleAttribute('x2', 0.0)
    const yd = e.doubleAttribute('y', 0.0)
    this.trillSign = e.asciiAttribute('tr', 'true') === 'true'
    this.x0 = Math.round(x0d * 32.0)
    this.x1 = Math.round(x1d * 32.0)
    this.y = Math.round(yd * 32.0)
    // color       -> skipped
    e.readNext()
}

//---------------------------------------------------------
//   WedgeObj::readCapx -- capx equivalent of WedgeObj::read
//---------------------------------------------------------

WedgeObj.prototype.readCapxWedge = function (this: WedgeObj, e: XmlReader): void {
    // TODO: read LineObj properties
    this.decresc = e.asciiAttribute('decrescendo', 'false') === 'true'
    const dheight = e.doubleAttribute('span', 1.0)
    this.height = Math.round(dheight * 32.0)
    e.readNext()
}

//------------------------------------------------------------
//   BracketObj::readCapx -- capx equivalent of WedgeObj::read
//------------------------------------------------------------

BracketObj.prototype.readCapxBracket = function (this: BracketObj, e: XmlReader): void {
    // TODO: We're actually only interested in the <basic> element following and it's noteRange attribute ...
    // or to put in another way: Intentionally left empty ...
    e.skipCurrentElement()
}

//---------------------------------------------------------
//   readCapxDrawObjectArray -- capx equivalent of readDrawObjectArray()
//---------------------------------------------------------

Capella.prototype.readCapxDrawObjectArray = function (this: Capella, e: XmlReader): BasicDrawObj[] {
    const ol: BasicDrawObj[] = []
    while (e.readNextStartElement()) {
        if (e.name() === 'drawObj') {
            let bdo: BasicDrawObj | null = null
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'basic') {
                    // note: the <basic> element always follows the DrawObject it applies to
                    if (bdo) {
                        bdo.readCapx(e)
                    } else {
                        e.skipCurrentElement()
                    }
                } else if (tag === 'line' || tag === 'rectangle' || tag === 'ellipse' || tag === 'polygon'
                           || tag === 'metafile' || tag === 'richText' || tag === 'guitar' || tag === 'wavyLine'
                           || tag === 'notelines' || tag === 'group') {
                    LOGD(`readCapxDrawObjectArray: found ${tag} (skipping)`)
                    e.skipCurrentElement()
                } else if (tag === 'text') {
                    const o = new SimpleTextObj(this)
                    bdo = o // save o to handle the "basic" tag (which sometimes follows)
                    o.readCapxText(e)
                    ol.push(o)
                } else if (tag === 'slur') {
                    const o = new SlurObj(this)
                    bdo = o
                    o.readCapxSlur(e)
                    ol.push(o)
                } else if (tag === 'bracket') {
                    const o = new BracketObj(this)
                    bdo = o
                    o.readCapxBracket(e)
                    ol.push(o)
                } else if (tag === 'wedge') {
                    const o = new WedgeObj(this)
                    bdo = o
                    o.readCapxWedge(e)
                    ol.push(o)
                } else if (tag === 'volta') {
                    const o = new VoltaObj(this)
                    bdo = o
                    o.readCapxVolta(e)
                    ol.push(o)
                } else if (tag === 'trill') {
                    const o = new TrillObj(this)
                    bdo = o
                    o.readCapxTrill(e)
                    ol.push(o)
                } else if (tag === 'transposable') {
                    const o = new TransposableObj(this)
                    bdo = o
                    o.readCapxTransposable(e)
                    ol.push(o)
                } else {
                    e.unknown()
                }
            }
        } else {
            e.unknown()
        }
    }
    return ol
}

//---------------------------------------------------------
//   readCapxVoice -- capx equivalent of readVoice(CapStaff* cs, int idx)
//---------------------------------------------------------

Capella.prototype.readCapxVoice = function (this: Capella, e: XmlReader, cs: CapStaff, idx: number): void {
    const v = new CapVoice()
    v.voiceNo = idx
    v.y0Lyrics = 0
    v.dyLyrics = 0
    v.stemDir = 0

    let tupletCounter = 0
    let tupletTicks = new Fraction(0, 1)
    let tupletObj: BasicDurationalObjType | null = null

    const tupletMember = (obj: ChordObj | RestObj): void => {
        if (obj.tupletStart) {
            tupletCounter = obj.tupletCount
            tupletTicks = obj.ticks()
            tupletObj = obj // save the tuplet object for later
        } else if (tupletCounter > 0) {
            if (!tupletObj) {
                LOGE(`     !!! chord with tupletCounter ${tupletCounter} without tupletObj`)
            } else {
                tupletTicks = tupletTicks.plus(obj.ticks())
                if (obj.tupletDenominator === 0) {
                    LOGE(`     !!! chord with tupletCounter ${tupletCounter} outside tuplet`)
                    obj.tupletDenominator = tupletObj.tupletDenominator // copy denominator from the tuplet object
                }
                --tupletCounter
                if (tupletCounter === 0) {
                    obj.tupletEnd = true
                    tupletObj.tupletTicks = tupletTicks // set total ticks to the tuplet object
                    tupletObj = null // reset tuplet object
                }
            }
        }
    }

    while (e.readNextStartElement()) {
        if (e.name() === 'lyricsSettings') {
            LOGD('readCapxVoice: found lyricsSettings (skipping)')
            e.skipCurrentElement()
        } else if (e.name() === 'noteObjects') {
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'clefSign') {
                    const clef = new CapClef(this)
                    clef.readCapx(e)
                    v.objects.push(clef)
                } else if (tag === 'keySign') {
                    const key = new CapKey(this)
                    key.readCapx(e)
                    v.objects.push(key)
                } else if (tag === 'timeSign') {
                    const meter = new CapMeter(this)
                    meter.readCapx(e)
                    v.objects.push(meter)
                } else if (tag === 'barline') {
                    const bl = new CapExplicitBarline(this)
                    bl.readCapx(e)
                    v.objects.push(bl)
                } else if (tag === 'chord') {
                    const chord = new ChordObj(this)
                    chord.readCapxChord(e)
                    v.objects.push(chord)
                    tupletMember(chord)
                } else if (tag === 'rest') {
                    const rest = new RestObj(this)
                    rest.readCapxRest(e)
                    v.objects.push(rest)
                    tupletMember(rest)
                } else {
                    e.unknown()
                }
            }
        } else {
            e.unknown()
        }
    }

    cs.voices.push(v)
}

//---------------------------------------------------------
//   findStaffIndex -- find index of layout in staffLayouts
//---------------------------------------------------------

function findStaffIndex(layout: string, staffLayouts: readonly CapStaffLayout[]): number {
    const index = staffLayouts.findIndex(l => l.descr === layout)
    if (index >= 0) {
        return index
    }
    LOGD(`staff layout '${layout}' not found`) // C++ ASSERT_X
    return 0
}

//---------------------------------------------------------
//   readCapxStaff -- capx equivalent of readStaff(CapSystem* system)
//---------------------------------------------------------

Capella.prototype.readCapxStaff = function (this: Capella, e: XmlReader, system: CapSystem): void {
    const staff = new CapStaff()
    const layout = e.attribute('layout')
    const time = e.attribute('defaultTime')
    const ts = qstring2timesig(time)
    staff.numerator = ts.numerator
    staff.log2Denom = ts.log2Denom
    staff.allaBreve = ts.allaBreve

    staff.iLayout = findStaffIndex(layout, this.staffLayouts())
    staff.topDistX = 0
    staff.btmDistX = 0
    staff.color = 0x000000

    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'extraDistance') {
            LOGD('readCapxStaff: found extraDistance (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'voices') {
            let i = 0
            while (e.readNextStartElement()) {
                if (e.name() === 'voice') {
                    this.readCapxVoice(e, staff, i)
                    ++i
                } else {
                    e.unknown()
                }
            }
        } else {
            e.unknown()
        }
    }

    system.staves[staff.iLayout] = staff
}

//---------------------------------------------------------
//   initUnreadStaves
//---------------------------------------------------------

function initUnreadStaves(staves: (CapStaff | null)[]): void {
    // find the first staff actually read
    let firstNonEmptyStaff: CapStaff | null = null
    for (const staff of staves) {
        if (staff && !firstNonEmptyStaff) {
            firstNonEmptyStaff = staff
        }
    }

    // copy its data to the staves present in the file
    for (let i = 0; i < staves.length; ++i) {
        if (!staves[i]) {
            const staff = new CapStaff()
            staff.numerator = firstNonEmptyStaff!.numerator
            staff.log2Denom = firstNonEmptyStaff!.log2Denom
            staff.allaBreve = firstNonEmptyStaff!.allaBreve
            staff.iLayout = i
            staves[i] = staff
        }
    }
}

//---------------------------------------------------------
//   readCapxSystem -- capx equivalent of readSystem()
//---------------------------------------------------------

Capella.prototype.readCapxSystem = function (this: Capella, e: XmlReader): void {
    const s = new CapSystem()
    s.nAddBarCount = 0
    s.bBarCountReset = false
    s.explLeftIndent = 0 // ?? TODO ?? use in capella.cpp commented out

    s.beamMode = CapBeamMode.AUTO
    s.tempo = 0
    s.color = 0x000000

    s.bJustified = false
    s.bPageBreak = false
    s.instrNotation = 0

    // set all staves in this system to "not yet read"
    for (let i = 0; i < this.m_staffLayouts.length; ++i) {
        s.staves.push(null)
    }

    // read staves
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'barCount') {
            LOGD('readCapxSystem: found barCount (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'staves') {
            while (e.readNextStartElement()) {
                if (e.name() === 'staff') {
                    this.readCapxStaff(e, s)
                } else {
                    e.unknown()
                }
            }
        } else {
            e.unknown()
        }
    }

    // initializes staves not read
    initUnreadStaves(s.staves)

    this.systems.push(s)
}

//---------------------------------------------------------
//   capxSystems -- read the capx <systems> element
//---------------------------------------------------------

Capella.prototype.capxSystems = function (this: Capella, e: XmlReader): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'system') {
            this.readCapxSystem(e)
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   capxNotation -- read the capx <notation> element
//---------------------------------------------------------

function capxNotation(e: XmlReader, sl: CapStaffLayout): void {
    while (e.readNextStartElement()) {
        if (e.name() === 'barlines') {
            const mode = e.asciiAttribute('mode', 'full')
            if (mode === 'full') {
                sl.barlineMode = 3
            } else if (mode === 'none') {
                sl.barlineMode = 2 // correct ? not handled by capella.cpp anyway
            } else if (mode === 'internal') {
                sl.barlineMode = 1
            } else if (mode === 'external') {
                sl.barlineMode = 0 // correct ? not handled by capella.cpp anyway
            } else {
                sl.barlineMode = 1
            }
            sl.barlineFrom = e.intAttribute('from') & 0xff
            sl.barlineTo = e.intAttribute('to') & 0xff
            e.readNext()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   readCapxStaveLayout -- capx equivalent of readStaveLayout(CapStaffLayout*, int)
//   read the staffLayout element
//---------------------------------------------------------

Capella.prototype.readCapxStaveLayout = function (this: Capella, e: XmlReader, sl: CapStaffLayout, _idx: number): void {
    // initialize same variables as readStaveLayout(CapStaffLayout*, int)

    sl.barlineMode = 0
    sl.noteLines = 0

    sl.bSmall = false // TODO (unclear where this is in the capx file)

    sl.topDist = 0
    sl.btmDist = 0
    sl.groupDist = 0
    sl.barlineFrom = 0
    sl.barlineTo = 0

    const clef = 0
    sl.form = (clef & 7) as Form
    sl.line = ((clef >> 3) & 7) as ClefLine
    sl.oct = (clef >> 6) as Oct

    // Schlagzeuginformation
    sl.bPercussion = false // ?? TODO ?? sl->soundMapIn and sl->soundMapOut are not used
    sl.bSoundMapIn = false
    sl.bSoundMapOut = false
    sl.sound = 0
    sl.volume = 0
    sl.transp = 0

    sl.descr = e.attribute('description')
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'notation') {
            capxNotation(e, sl)
        } else if (tag === 'distances') {
            LOGD('readCapxStaveLayout: found distances (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'instrument') {
            sl.name = e.attribute('name')
            sl.abbrev = e.attribute('abbrev')
            // elements name and abbrev overrule attributes name and abbrev
            while (e.readNextStartElement()) {
                const t = e.name()
                if (t === 'name') {
                    sl.name = e.readText()
                } else if (t === 'abbrev') {
                    sl.abbrev = e.readText()
                } else {
                    e.unknown()
                }
            }
        } else if (tag === 'sound') {
            sl.sound = e.intAttribute('instr', 0)
            sl.volume = e.intAttribute('volume', 0)
            sl.transp = e.intAttribute('transpose', 0)
            e.readNext()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   capxLayoutBrackets -- read the capx <brackets> element (when child of <layout)
//---------------------------------------------------------

function capxLayoutBrackets(e: XmlReader, bracketList: CapBracket[]): void {
    while (e.readNextStartElement()) {
        if (e.name() === 'bracket') {
            bracketList.push({
                from: e.intAttribute('from'),
                to: e.intAttribute('to'),
                curly: e.attribute('curly') === 'true',
            })
            e.readNext()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   capxLayoutDistances -- read the capx <Distances> element (when child of <layout)
//---------------------------------------------------------

function capxLayoutDistances(e: XmlReader, cap: Capella): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'staffLines') {
            cap.smallLineDist = e.doubleAttribute('small')
            cap.normalLineDist = e.doubleAttribute('normal')
            e.readNext()
        } else if (tag === 'systems') {
            cap.topDist = e.intAttribute('top')
            e.readNext()
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   capxLayoutStaves -- read the capx <staves> element (when child of <layout)
//---------------------------------------------------------

Capella.prototype.capxLayoutStaves = function (this: Capella, e: XmlReader): void {
    let iStave = 0
    while (e.readNextStartElement()) {
        if (e.name() === 'staffLayout') {
            const sl = new CapStaffLayout()
            this.readCapxStaveLayout(e, sl, iStave)
            this.m_staffLayouts.push(sl)
            ++iStave
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   capxLayout -- read the capx <layout> element
//   rough equivalent of readLayout() read part
//---------------------------------------------------------

Capella.prototype.capxLayout = function (this: Capella, e: XmlReader): void {
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'pages' || tag === 'instrumentNames' || tag === 'style' || tag === 'spacing'
            || tag === 'beamFlattening') {
            LOGD(`capxLayout: found ${tag} (skipping)`)
            e.skipCurrentElement()
        } else if (tag === 'distances') {
            capxLayoutDistances(e, this)
        } else if (tag === 'staves') {
            this.capxLayoutStaves(e)
        } else if (tag === 'brackets') {
            capxLayoutBrackets(e, this.brackets)
        } else {
            e.unknown()
        }
    }
}

//---------------------------------------------------------
//   initCapxLayout -- capx equivalent of readLayout() initialize part
//---------------------------------------------------------

Capella.prototype.initCapxLayout = function (this: Capella): void {
    // initialize same variables as readLayout()

    this.smallLineDist = 1.2 // TODO verify default
    this.normalLineDist = 1.76 // TODO verify default

    this.topDist = 14 // TODO verify default
    this.interDist = 0 // TODO verify default

    this.txtAlign = 0
    this.adjustVert = 0

    this.redundantKeys = false
    this.modernDoubleNote = false

    this.bSystemSeparators = false
    this.nUnnamed = 0

    // Note: readLayout() also reads stave layout (using readStaveLayout(sl, iStave))
    // and system brackets. Here this is handled by readCapx(XmlReader& e).
}

//---------------------------------------------------------
//   readCapx -- capx equivalent of read(QFile* fp)
//---------------------------------------------------------

Capella.prototype.readCapx = function (this: Capella, e: XmlReader): void {
    // initialize same variables as read(QFile* fp)

    this.f = null
    this.curPos = 0

    this.author = null
    this.keywords = null
    this.comment = null

    this.nRel = 0
    this.nAbs = 0
    this.bUseRealSize = false
    this.bAllowCompression = false
    this.bPrintLandscape = false

    this.beamRelMin0 = 0
    this.beamRelMin1 = 0
    this.beamRelMax0 = 0
    this.beamRelMax1 = 0

    this.backgroundChord = new ChordObj(this) // contains graphic objects on the page background
    this.bShowBarCount = false
    this.barNumberFrame = 0
    this.nBarDistX = 0
    this.nBarDistY = 0
    this.nFirstPage = 0
    this.leftPageMargins = 0
    this.topPageMargins = 0
    this.rightPageMargins = 0
    this.btmPageMargins = 0

    // Now do the equivalent of:
    // readLayout(); (called only once)
    // readExtra();  (this is a NOP)
    // readDrawObjectArray();
    // for (unsigned i = 0; i < nSystems; i++)
    //       readSystem();

    this.initCapxLayout()

    // read stave layout
    // read systems
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'info') {
            LOGD('importCapXml: found info (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'layout') {
            this.capxLayout(e)
        } else if (tag === 'gallery') {
            LOGD('capxLayout: found gallery (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'pageObjects') {
            this.backgroundChord.readCapxObjectArray(e)
        } else if (tag === 'barCount') {
            LOGD('importCapXml: found barCount (skipping)')
            e.skipCurrentElement()
        } else if (tag === 'systems') {
            this.capxSystems(e)
        } else {
            e.unknown()
        }
    }
}

/** decodes the XML document with the encoding of its declaration (QXmlStreamReader does; CapXML files are ISO-8859-1) */
function decodeXml(data: Uint8Array): string {
    const head = new TextDecoder('latin1').decode(data.subarray(0, 200))
    const m = /^<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/.exec(head.replace(/^﻿/, ''))
    let encoding = m ? m[1].toLowerCase() : 'utf-8'
    try {
        return new TextDecoder(encoding).decode(data)
    } catch {
        encoding = 'utf-8'
        return new TextDecoder(encoding).decode(data)
    }
}

//---------------------------------------------------------
//   importCapXml
//---------------------------------------------------------

/** C++ muse::ZipReader::fileData: the data of a file of the zip archive (empty if there is none or no archive) */
function zipFileData(data: Uint8Array, fileName: string): Uint8Array {
    try {
        return unzipSync(data, { filter: f => f.name === fileName })[fileName] ?? new Uint8Array(0)
    } catch {
        return new Uint8Array(0)
    }
}

/** imports a .capx file (a zip archive with score.xml) */
export function importCapXml(score: MasterScore, data: Uint8Array, name = ''): void {
    const dbuf = zipFileData(data, 'score.xml')
    const e = new XmlReader(decodeXml(dbuf))
    e.setDocName(name)
    const cf = new Capella()

    while (e.readNextStartElement()) {
        if (e.name() === 'score') {
            cf.readCapx(e)
        } else {
            e.unknown()
        }
    }

    try {
        convertCapella(score, cf, true)
    } catch (err) {
        if (!(err instanceof CapellaError)) {
            throw err
        }
        // avoid another error message box
    }
}
