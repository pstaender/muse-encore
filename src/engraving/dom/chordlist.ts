/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordlist.h/.cpp (HDegree::text() is from harmony.cpp)
 *
 * The chord description files (C++: ":/engraving/styles/<name>") are looked up in a registry,
 * see registerChordListFile(). The files live in fonts/chords/ (CHORD_LIST_FILES).
 */

import { RealIsNull } from '../../framework/global/realfn'
import { PointF } from '../../framework/draw/types/geometry'
import { Constants } from '../types/constants'
import { ChordStylePreset, DirectionH, NoteSpellingType } from '../types/types'
import { CompatUtils } from '../rw/compat/compatutils'
import { XmlReader } from '../rw/xmlreader'
import type { XmlAttributes, XmlWriter } from '../rw/xmlwriter'
import type { MStyle } from '../style/style'
import { Sid } from '../style/styledef'
import { NoteCaseType, tpc2name, tpc2pitch } from './pitchspelling'

//---------------------------------------------------------
//   muse::String helpers
//---------------------------------------------------------

/** String::split(sep, SkipEmptyParts) */
function splitSkipEmpty(s: string, sep: string): string[] {
    return s.split(sep).filter(x => x !== '')
}

/** strtol semantics of String::toInt/toUInt: the whole string must be consumed, otherwise 0 / !ok */
function strToInt(s: string, base = 10): [number, boolean] {
    let re: RegExp
    switch (base) {
    case 0: re = /^\s*[+-]?(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)$/
        break
    case 16: re = /^\s*[+-]?(0[xX])?[0-9a-fA-F]+$/
        break
    default: re = /^\s*[+-]?[0-9]+$/
        break
    }
    if (!re.test(s)) {
        return [0, false]
    }
    const t = s.trim()
    const neg = t[0] === '-'
    let body = t[0] === '-' || t[0] === '+' ? t.slice(1) : t
    let b = base
    if (base === 0 || base === 16) {
        if (/^0[xX]/.test(body)) {
            body = body.slice(2)
            b = 16
        } else if (base === 0) {
            b = body.length > 1 && body[0] === '0' ? 8 : 10
        }
    }
    const v = parseInt(body, b)
    return [neg ? -v : v, true]
}

/** String::toInt() */
function toInt(s: string): number {
    return strToInt(s)[0]
}

/** String::toDouble() (strtod: parses the longest valid prefix) */
function toDouble(s: string): number {
    const v = parseFloat(s)
    return Number.isNaN(v) ? 0 : v
}

/** String::replace(const String&, const String&) / String::remove(const String&) */
function replaceStr(s: string, before: string, after: string): string {
    if (before === after || before === '') {
        return s
    }
    return s.split(before).join(after)
}

/** Char::toLower */
function charToLower(c: string): string {
    const l = c.toLowerCase()
    return l.length === 1 ? l : c
}

function isDigit(c: string): boolean {
    return c >= '0' && c <= '9'
}

//---------------------------------------------------------
//   class HDegree
//---------------------------------------------------------

export enum HDegreeType {
    UNDEF, ADD, ALTER, SUBTRACT,
}

export class HDegree {
    private m_value = 0
    private m_alter = 0 // -1, 0, 1  (b - - #)
    private m_type = HDegreeType.UNDEF

    constructor(v = 0, a = 0, t: HDegreeType = HDegreeType.UNDEF) {
        this.m_value = v
        this.m_alter = a
        this.m_type = t
    }

    value(): number { return this.m_value }
    alter(): number { return this.m_alter }
    type(): HDegreeType { return this.m_type }

    text(): string {
        if (this.m_type === HDegreeType.UNDEF) {
            return ''
        }
        let degree = ''
        switch (this.m_type) {
        case HDegreeType.ADD: degree = 'add'
            break
        case HDegreeType.ALTER: degree = 'alt'
            break
        case HDegreeType.SUBTRACT: degree = 'sub'
            break
        }

        switch (this.m_alter) {
        case -1: degree += 'b'
            break
        case 1: degree += '#'
            break
        default: break
        }
        return degree + String(this.m_value)
    }
}

//---------------------------------------------------------
//   HChord
//---------------------------------------------------------

const HCHORD_SCALE_NAMES = [
    ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
]

export class HChord {
    protected m_keys = 0

    /** HChord() / HChord(int k) */
    constructor(k = 0) {
        this.m_keys = k
    }

    /** HChord(int a, int b, int c=-1, ...): adds every key >= 0 */
    static fromKeys(...keys: number[]): HChord {
        const c = new HChord()
        for (const k of keys) {
            if (k >= 0) {
                c.addKey(k)
            }
        }
        return c
    }

    /** HChord(const String&) */
    static fromString(str: string): HChord {
        const c = new HChord()
        const sl = splitSkipEmpty(str, ' ')
        for (const s of sl) {
            for (let i = 0; i < 12; ++i) {
                if (s === HCHORD_SCALE_NAMES[0][i] || s === HCHORD_SCALE_NAMES[1][i]) {
                    c.addKey(i)
                    break
                }
            }
        }
        return c
    }

    clone(): HChord {
        return new HChord(this.m_keys)
    }

    //---------------------------------------------------------
    //   rotate
    //    rotate 12 Bits
    //---------------------------------------------------------

    rotate(semiTones: number): void {
        while (semiTones > 0) {
            if (this.m_keys & 0x800) {
                this.m_keys = ((this.m_keys & ~0x800) << 1) + 1
            } else {
                this.m_keys <<= 1
            }
            --semiTones
        }
        while (semiTones < 0) {
            if (this.m_keys & 1) {
                this.m_keys = (this.m_keys >> 1) | 0x800
            } else {
                this.m_keys >>= 1
            }
            ++semiTones
        }
    }

    /** key in chord? */
    contains(key: number): boolean {
        return ((1 << (key % 12)) & this.m_keys) !== 0
    }

    /** operator+= */
    addKey(key: number): this {
        this.m_keys |= (1 << (key % 12))
        return this
    }

    /** operator-= */
    subKey(key: number): this {
        this.m_keys &= ~(1 << (key % 12))
        return this
    }

    equals(o: HChord): boolean { return this.m_keys === o.m_keys }

    getKeys(): number { return this.m_keys }

    print(): void {
        const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
        const out: string[] = []
        for (let i = 0; i < 12; i++) {
            if (this.contains(i)) {
                out.push(names[i])
            }
        }
        console.debug(' ' + out.join(' '))
    }

    //---------------------------------------------------------
    //   name
    //---------------------------------------------------------

    name(tpc: number): string {
        const C0 = HChord.fromKeys(0, 3, 6, 9)
        const C1 = HChord.fromKeys(0, 3)

        let buf = tpc2name(tpc, NoteSpellingType.STANDARD, NoteCaseType.AUTO, false)
        const c = this.clone()

        const key = tpc2pitch(tpc)

        c.rotate(-key) // transpose to C

        // special cases
        if (c.equals(C0)) {
            buf += 'dim'
            return buf
        }
        if (c.equals(C1)) {
            buf += 'no5'
            return buf
        }

        let seven = false
        let sharp9 = false
        let nat11 = false
        let sharp11 = false
        let nat13 = false
        let flat13 = false

        // minor?
        if (c.contains(3)) {
            if (!c.contains(4)) {
                buf += 'm'
            } else {
                sharp9 = true
            }
        }

        // 7
        if (c.contains(11)) {
            buf += 'Maj7'
            seven = true
        } else if (c.contains(10)) {
            buf += '7'
            seven = true
        }

        // 4
        if (c.contains(5)) {
            if (!c.contains(4)) {
                buf += 'sus4'
            } else {
                nat11 = true
            }
        }

        // 5
        if (c.contains(7)) {
            if (c.contains(6)) {
                sharp11 = true
            }
            if (c.contains(8)) {
                flat13 = true
            }
        } else {
            if (c.contains(6)) {
                buf += 'b5'
            }
            if (c.contains(8)) {
                buf += '#5'
            }
        }

        // 6
        if (c.contains(9)) {
            if (!seven) {
                buf += '6'
            } else {
                nat13 = true
            }
        }

        // 9
        if (c.contains(1)) {
            buf += 'b9'
        }
        if (c.contains(2)) {
            buf += '9'
        }
        if (sharp9) {
            buf += '#9'
        }

        // 11
        if (nat11) {
            buf += '11 '
        }
        if (sharp11) {
            buf += '#11'
        }

        // 13
        if (flat13) {
            buf += 'b13'
        }
        if (nat13) {
            if (c.contains(1) || c.contains(2) || sharp9 || nat11 || sharp11) {
                buf += '13'
            } else {
                buf += 'add13'
            }
        }
        return buf
    }

    //---------------------------------------------------------
    //   voicing
    //---------------------------------------------------------

    voicing(): string {
        let s = 'C'
        const names = ['C', ' Db', ' D', ' Eb', ' E', ' F', ' Gb', ' G', ' Ab', ' A', ' Bb', ' B']

        for (let i = 1; i < 12; i++) {
            if (this.contains(i)) {
                s += names[i]
            }
        }
        return s
    }

    //---------------------------------------------------------
    //   add
    //---------------------------------------------------------

    add(degreeList: readonly HDegree[]): void {
        // convert degrees to semitones
        const degreeTable = [
            // 1  2  3  4  5  6   7
            // C  D  E  F  G  A   B
            0, 2, 4, 5, 7, 9, 11,
        ]
        // factor in the degrees
        for (const d of degreeList) {
            const i = (d.value() - 1) % 7
            if (i < 0) {
                continue // ?
            }
            let dv = degreeTable[i] + d.alter()
            const dv1 = degreeTable[i]

            if (d.value() === 7 && d.alter() === 0) {
                dv -= 1
            }

            if (d.type() === HDegreeType.ADD) {
                this.addKey(dv)
            } else if (d.type() === HDegreeType.ALTER) {
                if (this.contains(dv1)) {
                    this.subKey(dv1)
                    this.addKey(dv)
                } else {
                    this.addKey(dv) // DEBUG: default to add
                }
            } else if (d.type() === HDegreeType.SUBTRACT) {
                if (this.contains(dv1)) {
                    this.subKey(dv1)
                }
            }
        }
    }
}

//---------------------------------------------------------
//   RenderAction
//    Render commands to be passed to and executed by Harmony
//---------------------------------------------------------

export enum RenderActionType {
    SET, MOVE, MOVEXHEIGHT, PUSH, POP, NOTE, ACCIDENTAL, STOPHALIGN, SCALE, PAREN,
}

const RENDER_ACTION_NAMES = [
    'SET', 'MOVE', 'MOVEXHEIGHT', 'PUSH', 'POP',
    'NOTE', 'ACCIDENTAL', 'STOPHALIGN', 'SCALE', 'PAREN',
]

export abstract class RenderAction {
    static readonly RenderActionType = RenderActionType

    abstract actionType(): RenderActionType

    print(): void { this.printInfo(this.actionType(), '') }

    protected printInfo(type: RenderActionType, info: string): void {
        console.debug(`${RENDER_ACTION_NAMES[type].padStart(10)} ${info}`)
    }
}

export class RenderActionMove extends RenderAction {
    private m_vec = new PointF(0.0, 0.0)
    protected m_scaled = false

    constructor(movex = 0.0, movey = 0.0) {
        super()
        this.m_vec = new PointF(movex, movey)
    }

    actionType(): RenderActionType { return RenderActionType.MOVE }
    override print(): void { this.printInfo(this.actionType(), `${this.m_vec.x()} ${this.m_vec.y()}`) }

    x(): number { return this.m_vec.x() }
    y(): number { return this.m_vec.y() }
    vec(): PointF { return this.m_vec.clone() }
    scaled(): boolean { return this.m_scaled }
}

export class RenderActionMoveScaled extends RenderActionMove {
    constructor(movex: number, movey: number) {
        super(movex, movey)
        this.m_scaled = true
    }

    override print(): void { this.printInfo(this.actionType(), `SCALED ${this.x()} ${this.y()}`) }
}

export class RenderActionMoveXHeight extends RenderAction {
    private m_up = true
    protected m_scaled = false

    constructor(up: boolean) {
        super()
        this.m_up = up
    }

    actionType(): RenderActionType { return RenderActionType.MOVEXHEIGHT }

    up(): boolean { return this.m_up }
    scaled(): boolean { return this.m_scaled }
    override print(): void { this.printInfo(this.actionType(), `up: ${this.m_up}`) }
}

export class RenderActionMoveXHeightScaled extends RenderActionMoveXHeight {
    constructor(up: boolean) {
        super(up)
        this.m_scaled = true
    }
}

export class RenderActionSet extends RenderAction {
    private m_text = ''
    protected m_renderText = true

    constructor(s = '') {
        super()
        this.m_text = s
    }

    actionType(): RenderActionType { return RenderActionType.SET }
    override print(): void { this.printInfo(this.actionType(), `<${this.m_text}>`) }

    text(): string { return this.m_text }
    renderText(): boolean { return this.m_renderText }
}

export class RenderActionMoveTextWidth extends RenderActionSet {
    constructor(s: string) {
        super(s)
        this.m_renderText = false
    }
}

export class RenderActionPush extends RenderAction {
    actionType(): RenderActionType { return RenderActionType.PUSH }
}

export class RenderActionPop extends RenderAction {
    private m_popx = true
    private m_popy = true

    /** C++: RenderActionPop() pops both; the protected (popx, popy) ctor is used by PopX/PopY */
    constructor(popx = true, popy = true) {
        super()
        this.m_popx = popx
        this.m_popy = popy
    }

    actionType(): RenderActionType { return RenderActionType.POP }
    override print(): void { this.printInfo(this.actionType(), `pop x: ${this.m_popx} pop y: ${this.m_popy}`) }

    popX(): boolean { return this.m_popx }
    popY(): boolean { return this.m_popy }
}

export class RenderActionPopX extends RenderActionPop {
    constructor() {
        super(true, false)
    }
}

export class RenderActionPopY extends RenderActionPop {
    constructor() {
        super(false, true)
    }
}

export class RenderActionNote extends RenderAction {
    actionType(): RenderActionType { return RenderActionType.NOTE }
}

export class RenderActionAccidental extends RenderAction {
    actionType(): RenderActionType { return RenderActionType.ACCIDENTAL }
}

export class RenderActionStopHAlign extends RenderAction {
    actionType(): RenderActionType { return RenderActionType.STOPHALIGN }
}

export class RenderActionScale extends RenderAction {
    private m_scale = 1.0

    constructor(scale = 1.0) {
        super()
        this.m_scale = scale
    }

    actionType(): RenderActionType { return RenderActionType.SCALE }

    scale(): number { return this.m_scale }

    override print(): void { this.printInfo(this.actionType(), `${this.m_scale}`) }
}

export abstract class RenderActionParen extends RenderAction {
    abstract direction(): DirectionH
    actionType(): RenderActionType { return RenderActionType.PAREN }

    override print(): void {
        this.printInfo(this.actionType(), `direction: ${this.direction() === DirectionH.LEFT ? 'left' : 'right'}`)
    }
}

export class RenderActionParenLeft extends RenderActionParen {
    direction(): DirectionH { return DirectionH.LEFT }
}

export class RenderActionParenRight extends RenderActionParen {
    direction(): DirectionH { return DirectionH.RIGHT }
}

//---------------------------------------------------------
//   readRenderList
//---------------------------------------------------------

function readRenderList(val: string, renderList: RenderAction[], mscVersion: number): void {
    renderList.length = 0
    const sl = splitSkipEmpty(val, ' ')
    for (const s of sl) {
        if (s.startsWith('m:')) {
            const ssl = splitSkipEmpty(s, ':')
            if (ssl.length === 3) {
                // m:x:y
                let movex = toDouble(ssl[1])
                let movey = toDouble(ssl[2])

                if (mscVersion < 460) {
                    movex = CompatUtils.convertChordExtModUnits(movex)
                    movey = CompatUtils.convertChordExtModUnits(movey)
                }

                renderList.push(new RenderActionMove(movex, movey))
            }
        } else if (s.startsWith('ms:')) {
            const ssl = splitSkipEmpty(s, ':')
            if (ssl.length === 3) {
                // ms:x:y
                const movex = toDouble(ssl[1])
                const movey = toDouble(ssl[2])

                renderList.push(new RenderActionMoveScaled(movex, movey))
            }
        } else if (s === ':mx') {
            renderList.push(new RenderActionMoveXHeight(true))
        } else if (s === ':mxs') {
            renderList.push(new RenderActionMoveXHeightScaled(true))
        } else if (s.startsWith('sc:')) {
            const ssl = splitSkipEmpty(s, ':')
            if (ssl.length === 2) {
                const scale = toDouble(ssl[1])
                renderList.push(new RenderActionScale(scale))
            }
        } else if (s === ':push') {
            renderList.push(new RenderActionPush())
        } else if (s === ':pop') {
            renderList.push(new RenderActionPop())
        } else if (s === ':popx') {
            renderList.push(new RenderActionPopX())
        } else if (s === ':popy') {
            renderList.push(new RenderActionPopY())
        } else if (s === ':n') {
            renderList.push(new RenderActionNote())
        } else if (s === ':a') {
            renderList.push(new RenderActionAccidental())
        } else if (s === ':pl') {
            renderList.push(new RenderActionParenLeft())
        } else if (s === ':pr') {
            renderList.push(new RenderActionParenRight())
        } else {
            renderList.push(new RenderActionSet(s))
        }
    }
}

/** muse::String::number(double, prec = 6): fixed notation, trailing zeros (and a trailing '.') removed, no "-0" */
function stringNumber(n: number, prec = 6): string {
    let s = n.toFixed(prec)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    if (s === '-0') {
        s = '0'
    }
    return s
}

//---------------------------------------------------------
//   writeRenderList
//---------------------------------------------------------

function writeRenderList(xml: XmlWriter, al: readonly RenderAction[], name: string): void {
    let s = ''

    for (const a of al) {
        if (s !== '') {
            s += ' '
        }
        switch (a.actionType()) {
        case RenderActionType.SET: {
            const set = a as RenderActionSet
            s += set.text()
            break
        }
        case RenderActionType.MOVE: {
            const move = a as RenderActionMove

            if (!RealIsNull(move.x()) || !RealIsNull(move.y())) {
                const scaled = move.scaled() ? 's' : ''
                s += `m${scaled}:${stringNumber(move.x())}:${stringNumber(move.y())}`
            }
            break
        }
        case RenderActionType.MOVEXHEIGHT: {
            const movex = a as RenderActionMoveXHeight
            const scaled = movex.scaled() ? 's' : ''
            s += `:mx${scaled}`
            break
        }
        case RenderActionType.SCALE: {
            const scale = a as RenderActionScale
            s += `sc:${stringNumber(scale.scale())}`
            break
        }
        case RenderActionType.PUSH:
            s += ':push'
            break
        case RenderActionType.POP: {
            const pop = a as RenderActionPop
            const coord = pop.popX() && pop.popY() ? '' : (pop.popX() ? 'x' : 'y')
            s += `:pop${coord}`
            break
        }
        case RenderActionType.NOTE:
            s += ':n'
            break
        case RenderActionType.ACCIDENTAL:
            s += ':a'
            break
        case RenderActionType.PAREN: {
            const paren = a as RenderActionParen
            s += paren.direction() === DirectionH.LEFT ? ':pl' : ':pr'
            break
        }
        case RenderActionType.STOPHALIGN:
            // Internal, skip
            break
        }
    }
    xml.tag(name, s)
}

//---------------------------------------------------------
//   ChordToken
//    Reads/represents the <token> tag in chord XML files
//---------------------------------------------------------

export enum ChordTokenClass {
    ALL, QUALITY, EXTENSION, MODIFIER, TYPE, ACCIDENTAL,
}

export class ChordToken {
    tokenClass: ChordTokenClass = ChordTokenClass.ALL
    names: string[] = []
    renderList: RenderAction[] = []

    clone(): ChordToken {
        const t = new ChordToken()
        t.tokenClass = this.tokenClass
        t.names = this.names.slice()
        t.renderList = this.renderList.slice()
        return t
    }

    read(e: XmlReader, mscVersion: number): void {
        const c = e.attribute('class')
        if (c === 'quality') {
            this.tokenClass = ChordTokenClass.QUALITY
        } else if (c === 'extension') {
            this.tokenClass = ChordTokenClass.EXTENSION
        } else if (c === 'modifier') {
            this.tokenClass = ChordTokenClass.MODIFIER
        } else if (c === 'type') {
            this.tokenClass = ChordTokenClass.TYPE
        } else if (c === 'accidental') {
            this.tokenClass = ChordTokenClass.ACCIDENTAL
        } else {
            this.tokenClass = ChordTokenClass.ALL
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'name') {
                this.names.push(e.readText())
            } else if (tag === 'render') {
                readRenderList(e.readText(), this.renderList, mscVersion)
            }
            // C++ does not skip unknown tags here (the next readNextStartElement() enters them)
        }
    }

    write(xml: XmlWriter): void {
        const attrs: Array<[string, string]> = []
        switch (this.tokenClass) {
        case ChordTokenClass.QUALITY:
            attrs.push(['class', 'quality'])
            break
        case ChordTokenClass.EXTENSION:
            attrs.push(['class', 'extension'])
            break
        case ChordTokenClass.MODIFIER:
            attrs.push(['class', 'modifier'])
            break
        case ChordTokenClass.TYPE:
            attrs.push(['class', 'type'])
            break
        case ChordTokenClass.ACCIDENTAL:
            // sic: C++ writes accidental="type" (read back as ALL)
            attrs.push(['accidental', 'type'])
            break
        default:
            break
        }
        xml.startElement('token', attrs)
        for (const s of this.names) {
            xml.tag('name', s)
        }
        writeRenderList(xml, this.renderList, 'render')
        xml.endElement()
    }

    isValid(): boolean { return this.names.length !== 0 }
}

//---------------------------------------------------------
//   ParsedChord
//    Extracts quality, extension & modifiers from a string eg. "m7#11"
//    Generates a list of render instructions to lay this chord out
//---------------------------------------------------------

const MODIFIERS_STARTING_WITH_QUALITY_CHARACTERS = [
    'tristan',
    'omit',
    'type',
]

const SUS_ADD_REGEX = /sus|add/
const SUS_ADD_REGEX_G = /sus|add/g
const SUS_ADD_REGEX_FULL = /^(?:sus|add)$/

export class ParsedChord {
    private m_name = ''
    private m_handle = ''
    private m_quality = ''
    private m_extension = ''
    private m_modifiers = ''
    private m_modifierList: string[] = []
    private m_tokenList: ChordToken[] = []
    private m_renderList: RenderAction[] = []
    private m_xmlKind = ''
    private m_xmlText = ''
    private m_xmlSymbols = ''
    private m_xmlParens = ''
    private m_xmlDegrees: string[] = []
    private m_major: string[] = []
    private m_minor: string[] = []
    private m_diminished: string[] = []
    private m_augmented: string[] = []
    private m_lower: string[] = []
    private m_raise: string[] = []
    private m_mod: string[] = []
    private m_symbols: string[] = []
    private m_chord = new HChord()
    private m_parseable = false
    private m_understandable = false

    /** C++ copy constructor */
    clone(): ParsedChord {
        const c = new ParsedChord()
        c.m_name = this.m_name
        c.m_handle = this.m_handle
        c.m_quality = this.m_quality
        c.m_extension = this.m_extension
        c.m_modifiers = this.m_modifiers
        c.m_modifierList = this.m_modifierList.slice()
        c.m_tokenList = this.m_tokenList.map(t => t.clone())
        c.m_renderList = this.m_renderList.slice()
        c.m_xmlKind = this.m_xmlKind
        c.m_xmlText = this.m_xmlText
        c.m_xmlSymbols = this.m_xmlSymbols
        c.m_xmlParens = this.m_xmlParens
        c.m_xmlDegrees = this.m_xmlDegrees.slice()
        c.m_major = this.m_major.slice()
        c.m_minor = this.m_minor.slice()
        c.m_diminished = this.m_diminished.slice()
        c.m_augmented = this.m_augmented.slice()
        c.m_lower = this.m_lower.slice()
        c.m_raise = this.m_raise.slice()
        c.m_mod = this.m_mod.slice()
        c.m_symbols = this.m_symbols.slice()
        c.m_chord = this.m_chord.clone()
        c.m_parseable = this.m_parseable
        c.m_understandable = this.m_understandable
        return c
    }

    parseable(): boolean { return this.m_parseable }
    understandable(): boolean { return this.m_understandable }
    name(): string { return this.m_name }
    quality(): string { return this.m_quality }
    extension(): string { return this.m_extension }
    modifiers(): string { return this.m_modifiers }
    modifierList(): readonly string[] { return this.m_modifierList }
    xmlKind(): string { return this.m_xmlKind }
    xmlText(): string { return this.m_xmlText }
    xmlSymbols(): string { return this.m_xmlSymbols }
    xmlParens(): string { return this.m_xmlParens }
    xmlDegrees(): readonly string[] { return this.m_xmlDegrees }
    keys(): number { return this.m_chord.getKeys() }
    /** also C++ operator String() */
    handle(): string { return this.m_handle }
    toString(): string { return this.m_handle }
    /** operator== */
    equals(c: ParsedChord): boolean { return this.m_handle === c.m_handle }

    //---------------------------------------------------------
    //  configure
    //---------------------------------------------------------

    private configure(cl: ChordList | null): void {
        if (!cl) {
            return
        }
        // TODO: allow this to be parameterized via chord list
        this.m_major.push('ma', 'maj', 'major', 't', '^')
        this.m_minor.push('mi', 'min', 'minor', '-', '=')
        this.m_diminished.push('dim', 'o')
        this.m_augmented.push('aug', '+')
        this.m_lower.push('b', '-', 'dim')
        this.m_raise.push('#', '+', 'aug')
        this.m_mod.push('sus', 'add', 'no', 'omit', '^', 'type')
        this.m_symbols.push('t', '^', '-', '+', 'o', '0')
    }

    //---------------------------------------------------------
    //  correctXmlText
    //    remove digits from _xmlText, optionally replace with s
    //    needed for m(Maj9) et al
    //---------------------------------------------------------

    private correctXmlText(s = ''): void {
        let xmlText = this.m_xmlText.replace(/[0-9]/g, '')
        if (s !== '') {
            let pos = xmlText.lastIndexOf(')')
            if (pos === -1) {
                pos = xmlText.length
            }
            xmlText = xmlText.slice(0, pos) + s + xmlText.slice(pos)
        }
        this.m_xmlText = xmlText
    }

    //---------------------------------------------------------
    //  parse
    //    returns true if chord was parseable
    //---------------------------------------------------------

    parse(s: string, cl: ChordList | null, syntaxOnly = false, preferMinor = false): boolean {
        let tok1: string
        let tok1L: string
        let tok2: string
        let tok2L: string
        const extensionDigits = '123456789'
        const special = '()[],/\\ '
        const leading = '([ '
        const trailing = ')],/\\ '
        let initial: string
        let take6 = false
        let take7 = false
        let take9 = false
        let take11 = false
        let take13 = false
        let lastLeadingToken = 0
        const len = s.length
        let i = 0
        let thirdKey = 0
        let seventhKey = 0
        let susChord = false
        const hdl: HDegree[] = []
        const key = [0, 0, 2, 4, 5, 7, 9, 11, 0, 2, 4, 5, 7, 9, 11]

        this.configure(cl)
        this.m_name = s
        this.m_parseable = true
        this.m_understandable = true

        lastLeadingToken = this.m_tokenList.length
        // get quality
        for (tok1 = '', tok1L = '', initial = ''; i < len; ++i) {
            // up to first (non-zero) digit, paren, or comma
            if (extensionDigits.includes(s[i]) || special.includes(s[i])) {
                break
            }
            tok1 += s[i]
            tok1L += charToLower(s[i])
            if (tok1L === 'm' || this.m_major.includes(tok1L) || this.m_minor.includes(tok1L) || this.m_diminished.includes(tok1L)
                || this.m_augmented.includes(tok1L)) {
                initial = tok1
            }
        }
        // special case for "madd", which needs to parse as m,add rather than ma,dd
        if (tok1L.startsWith('madd')) {
            initial = tok1[0]
        }
        // quality and first modifier ran together with no separation - eg, mima7, augadd
        // keep quality portion, reset index to read modifier portion later
        // Prevent greedy capture of first character as chord quality in the following cases
        if (initial !== '' && initial !== tok1 && !MODIFIERS_STARTING_WITH_QUALITY_CHARACTERS.includes(tok1L)) {
            i -= (tok1.length - initial.length)
            tok1 = initial
            tok1L = initial.toLowerCase()
        }
        // determine quality
        if (tok1 === 'M' || this.m_major.includes(tok1L)) {
            this.m_quality = 'major'
            take6 = true
            take7 = true
            take9 = true
            take11 = true
            take13 = true
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C E G')
            }
        } else if (tok1 === 'm' || this.m_minor.includes(tok1L)) {
            this.m_quality = 'minor'
            take6 = true
            take7 = true
            take9 = true
            take11 = true
            take13 = true
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C Eb G')
            }
        } else if (this.m_diminished.includes(tok1L)) {
            this.m_quality = 'diminished'
            take7 = true
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C Eb Gb')
            }
        } else if (this.m_augmented.includes(tok1L)) {
            this.m_quality = 'augmented'
            take7 = true
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C E G#')
            }
        } else if (tok1L === '0') {
            this.m_quality = 'half-diminished'
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C Eb Gb Bb')
            }
        } else if (tok1L === '') {
            // empty quality - this will turn out to be major or dominant (or minor if preferMinor)
            this.m_quality = ''
            if (!syntaxOnly) {
                this.m_chord = preferMinor ? HChord.fromString('C Eb G') : HChord.fromString('C E G')
            }
            if (preferMinor) {
                this.m_name = '=' + this.m_name
            }
        } else {
            // anything else is not a quality after all, but a modifier
            // reset to read again as modifier
            this.m_quality = ''
            tok1 = ''
            tok1L = ''
            i = lastLeadingToken
            if (!syntaxOnly) {
                this.m_chord = HChord.fromString('C E G')
            }
        }
        if (tok1L === '=') {
            tok1 = ''
            tok1L = ''
        }
        if (tok1 !== '') {
            this.addToken(tok1, ChordTokenClass.QUALITY)
        }
        if (!syntaxOnly) {
            this.m_xmlKind = this.m_quality
            this.m_xmlParens = 'no'
            if (this.m_symbols.includes(tok1)) {
                this.m_xmlSymbols = 'yes'
                this.m_xmlText = ''
            } else {
                this.m_xmlSymbols = 'no'
                this.m_xmlText = tok1
            }
        }
        // eat trailing parens and commas
        while (i < len && trailing.includes(s[i])) {
            this.addToken(s[i++], ChordTokenClass.QUALITY)
        }

        const prevIdx = i

        // Get type - either "typen" or "III"
        // Eat up to first number
        for (tok1 = ''; i < len; ++i) {
            if (isDigit(s[i])) {
                break
            }
            tok1 += s[i]
        }

        if (tok1 === 'type') {
            this.addToken(tok1, ChordTokenClass.TYPE)
            // Read number
            for (tok1 = ''; i < len; ++i) {
                if (!isDigit(s[i])) {
                    break
                }
                this.addToken(s[i], ChordTokenClass.TYPE)
            }
        } else if (/[IVX]+/.test(tok1)) {
            // Get roman numerals
            for (i = 0; i < tok1.length; i++) {
                this.addToken(tok1[i], ChordTokenClass.TYPE)
            }
        } else {
            i = prevIdx
        }

        lastLeadingToken = this.m_tokenList.length
        // get extension - up to first non-digit other than comma or slash
        for (tok1 = ''; i < len; ++i) {
            if (!isDigit(s[i]) && s[i] !== ',' && s[i] !== '/') {
                break
            }
            tok1 += s[i]
        }
        this.m_extension = tok1
        if (this.m_quality === '') {
            if (this.m_extension === '7' || this.m_extension === '9' || this.m_extension === '11' || this.m_extension === '13') {
                this.m_quality = preferMinor ? 'minor' : 'dominant'
                if (!syntaxOnly) {
                    this.m_xmlKind = preferMinor ? 'minor' : 'dominant'
                }
                take7 = true
                take9 = true
                take11 = true
                take13 = true
            } else {
                this.m_quality = preferMinor ? 'minor' : 'major'
                if (!syntaxOnly) {
                    this.m_xmlKind = preferMinor ? 'minor' : 'major'
                }
                take6 = true
                take7 = true
                take9 = true
                take11 = true
                take13 = true
            }
        }
        if (tok1 !== '') {
            this.addToken(tok1, ChordTokenClass.EXTENSION)
        }
        if (!syntaxOnly) {
            if (this.m_quality === 'minor') {
                thirdKey = 3
            } else {
                thirdKey = 4
            }
            if (this.m_quality === 'major') {
                seventhKey = 11
            } else if (this.m_quality === 'diminished') {
                seventhKey = 9
            } else {
                seventhKey = 10
            }
            this.m_xmlText += this.m_extension
            const extl: string[] = []
            if (tok1 === '2') {
                const d = 'add' + tok1
                this.m_xmlDegrees.push(d)
                this.m_xmlText = replaceStr(this.m_xmlText, tok1, '')
                this.m_chord.addKey(2)
            } else if (tok1 === '4') {
                const d = 'add' + tok1
                this.m_xmlDegrees.push(d)
                this.m_xmlText = replaceStr(this.m_xmlText, tok1, '')
                this.m_chord.addKey(5)
            } else if (tok1 === '5') {
                this.m_xmlKind = 'power'
                this.m_chord.subKey(thirdKey)
            } else if (tok1 === '6') {
                if (take6) {
                    this.m_xmlKind += '-sixth'
                } else {
                    extl.push('6')
                }
                this.m_chord.addKey(9)
            } else if (tok1 === '7') {
                if (take7) {
                    this.m_xmlKind += '-seventh'
                } else if (this.m_xmlKind !== 'half-diminished') {
                    extl.push('7')
                }
                this.m_chord.addKey(seventhKey)
            } else if (tok1 === '9') {
                if (take9) {
                    this.m_xmlKind += '-ninth'
                } else if (take7) {
                    this.m_xmlKind += '-seventh'
                    extl.push('9')
                    this.correctXmlText('7')
                } else if (this.m_xmlKind === 'half-diminished') {
                    extl.push('9')
                    this.correctXmlText()
                } else {
                    extl.push('7', '9')
                    this.correctXmlText()
                }
                this.m_chord.addKey(seventhKey)
                this.m_chord.addKey(2)
            } else if (tok1 === '11') {
                if (take11) {
                    this.m_xmlKind += '-11th'
                } else if (take7) {
                    this.m_xmlKind += '-seventh'
                    extl.push('9', '11')
                    this.correctXmlText('7')
                } else if (this.m_xmlKind === 'half-diminished') {
                    extl.push('9', '11')
                    this.correctXmlText()
                } else {
                    extl.push('7', '9', '11')
                    this.correctXmlText()
                }
                this.m_chord.addKey(seventhKey)
                this.m_chord.addKey(2)
                this.m_chord.addKey(5)
            } else if (tok1 === '13') {
                if (take13) {
                    this.m_xmlKind += '-13th'
                } else if (take7) {
                    this.m_xmlKind += '-seventh'
                    extl.push('9', '11', '13')
                    this.correctXmlText('7')
                } else if (this.m_xmlKind === 'half-diminished') {
                    extl.push('9', '11', '13')
                    this.correctXmlText()
                } else {
                    extl.push('7', '9', '11', '13')
                    this.correctXmlText()
                }
                this.m_chord.addKey(seventhKey)
                this.m_chord.addKey(2)
                this.m_chord.addKey(5)
                this.m_chord.addKey(9)
            } else if (tok1 === '69' || tok1 === '6,9' || tok1 === '6/9') {
                if (take6) {
                    this.m_xmlKind += '-sixth'
                    extl.push('9')
                    this.correctXmlText('6')
                } else {
                    extl.push('6', '9')
                    this.correctXmlText()
                }
                this.m_extension = '69'
                this.m_chord.addKey(9)
                this.m_chord.addKey(2)
            }
            for (const e of extl) {
                const d = 'add' + e
                this.m_xmlDegrees.push(d)
            }
            if (this.m_xmlKind === 'dominant-seventh') {
                this.m_xmlKind = 'dominant'
            }
        }
        // eat trailing parens and commas
        while (i < len && trailing.includes(s[i])) {
            this.addToken(s[i++], ChordTokenClass.EXTENSION)
        }

        // get modifiers
        let addPending = false
        let susPending = false
        this.m_modifierList = []
        while (i < len) {
            // eat leading parens
            while (i < len && leading.includes(s[i])) {
                this.addToken(s[i++], ChordTokenClass.MODIFIER)
                this.m_xmlParens = 'yes'
            }
            // get first token - up to first digit, paren, or comma
            for (tok1 = '', tok1L = '', initial = ''; i < len; ++i) {
                if (isDigit(s[i]) || special.includes(s[i])) {
                    break
                }
                tok1 += s[i]
                tok1L += charToLower(s[i])
                if (this.m_mod.includes(tok1L)) {
                    initial = tok1
                }
            }
            // if we reached the end of the string and never got a token,
            // then nothing to do, and no sense in looking for a second token
            if (i === len && tok1 === '') {
                break
            }
            if (initial !== '' && initial !== tok1) {
                // two modifiers ran together with no separation - eg, susb9
                // keep first, reset index to read second later
                i -= (tok1.length - initial.length)
                tok1 = initial
                tok1L = initial.toLowerCase()
            }
            // for "add" and "sus", just add the token and then read argument as a separate modifier
            // this allows the argument to itself be a two-part string
            // thus allowing addb9 -> add;b,9
            if (tok1L === 'add') {
                this.addToken(tok1, ChordTokenClass.MODIFIER)
                addPending = true
                continue
            }
            // When there are no numbers after, default to sus4 further down
            if (tok1L === 'sus' && i !== len) {
                this.addToken(tok1, ChordTokenClass.MODIFIER)
                susPending = true
                continue
            }
            // eat spaces
            while (i < len && s[i] === ' ') {
                ++i
            }
            // get second token - a number <= 13
            for (tok2 = ''; i < len; ++i) {
                if (!isDigit(s[i])) {
                    break
                }
                if (tok2.length === 1 && (tok2[0] !== '1' || s[i] > '3')) {
                    break
                }
                tok2 += s[i]
            }
            // check suffix - 'st', 'nd', 'rd', 'th'
            let suffix = ''
            const SUFFIX_LEN = 2
            for (let j = 0; j < SUFFIX_LEN && i + j < len; j++) {
                suffix += s[i + j]
            }

            if (/st|nd|rd|th/.test(suffix)) {
                i += SUFFIX_LEN
            } else {
                suffix = ''
            }

            tok2L = tok2.toLowerCase()
            // re-attach "add"
            if (addPending) {
                if (this.m_raise.includes(tok1L)) {
                    tok1L = '#'
                } else if (this.m_lower.includes(tok1L)) {
                    tok1L = 'b'
                } else if (tok1 === 'M' || this.m_major.includes(tok1L)) {
                    tok1L = 'major'
                }
                tok2L = tok1L + tok2L
                tok1L = 'add'
            }
            // re-attach "sus"
            if (susPending) {
                if (this.m_raise.includes(tok1L)) {
                    tok1L = '#'
                } else if (this.m_lower.includes(tok1L)) {
                    tok1L = 'b'
                } else if (tok1 === 'M' || this.m_major.includes(tok1L)) {
                    tok1L = 'major'
                }
                tok2L = tok1L + tok2L
                tok1L = 'sus'
            }
            // standardize spelling
            if (tok1 === 'M' || this.m_major.includes(tok1L)) {
                tok1L = 'major'
            } else if (tok1L === 'omit') {
                tok1L = 'no'
            } else if (tok1L === 'sus' && tok2L === '') {
                tok2L = '4'
            } else if (this.m_augmented.includes(tok1L) && tok2L === '') {
                if (this.m_quality === 'dominant' && this.m_extension === '7') {
                    this.m_quality = 'augmented'
                    if (!syntaxOnly) {
                        this.m_xmlKind = 'augmented-seventh'
                        this.m_xmlText = this.m_extension + tok1
                        this.m_chord.subKey(7)
                        this.m_chord.addKey(8)
                    }
                    tok1L = ''
                } else {
                    tok1L = '#'
                    tok2L = '5'
                }
            } else if (this.m_diminished.includes(tok1)) {
                this.m_quality = 'diminished'
                if (!syntaxOnly) {
                    this.m_xmlKind = 'diminished'
                    this.m_xmlText = this.m_extension + tok1
                    this.m_chord.subKey(4)
                    this.m_chord.addKey(3)
                    this.m_chord.subKey(7)
                    this.m_chord.addKey(6)
                }
                tok1L = ''
            } else if ((this.m_lower.includes(tok1L) || this.m_raise.includes(tok1L)) && tok2L === '') {
                // trailing alteration - treat as applying to extension (and convert to modifier)
                // this handles C5b, C9#, etc
                tok2L = this.m_extension
                if (!syntaxOnly) {
                    this.m_xmlKind = (this.m_quality === 'dominant') ? 'major' : this.m_quality
                    this.m_xmlText = replaceStr(this.m_xmlText, this.m_extension, '')
                    if (this.m_extension === '5') {
                        this.m_chord.addKey(thirdKey)
                    } else {
                        this.m_chord.subKey(seventhKey)
                    }
                }
                if (this.m_quality === 'dominant') {
                    this.m_quality = 'major'
                }
                this.m_extension = ''
                if (this.m_lower.includes(tok1L)) {
                    tok1L = 'b'
                } else {
                    tok1L = '#'
                }
            } else if (this.m_lower.includes(tok1L)) {
                tok1L = 'b'
            } else if (this.m_raise.includes(tok1L)) {
                tok1L = '#'
            }
            const m = tok1L + tok2L + suffix
            if (m !== '') {
                this.m_modifierList.push(m)
            }
            if (tok1 !== '') {
                this.addToken(tok1, ChordTokenClass.MODIFIER)
            }
            if (tok2 !== '') {
                this.addToken(tok2, ChordTokenClass.MODIFIER)
            }
            if (suffix !== '') {
                this.addToken(suffix, ChordTokenClass.MODIFIER)
            }
            if (!syntaxOnly) {
                let d: number
                if (tok2L === '') {
                    d = 0
                } else {
                    d = toInt(tok2L)
                }
                if (d > 13) {
                    d = 13
                }
                let degree = ''
                let alter = false
                if (tok1L === 'add') {
                    if (d) {
                        hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                    } else if (tok2L !== '') {
                        // this was result of addPending
                        // alteration; tok1 = alter, tok2 = value
                        d = toInt(tok2)
                        if (this.m_raise.includes(tok1) || tok1 === 'M' || this.m_major.includes(tok1.toLowerCase())) {
                            if (d === 7) {
                                this.m_chord.addKey(11)
                                tok2L = '#7'
                            } else if (this.m_raise.includes(tok1)) {
                                hdl.push(new HDegree(d, 1, HDegreeType.ADD))
                            }
                        } else if (this.m_lower.includes(tok1)) {
                            if (d === 7) {
                                this.m_chord.addKey(10)
                            } else {
                                hdl.push(new HDegree(d, -1, HDegreeType.ADD))
                            }
                        } else if (d) {
                            hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                        }
                    }
                    degree = 'add' + tok2L
                } else if (tok1L === 'no') {
                    degree = 'sub' + tok2L
                    if (d) {
                        hdl.push(new HDegree(d, 0, HDegreeType.SUBTRACT))
                    }
                } else if (tok1L === 'sus') {
                    // convert chords with sus into suspended "kind"
                    // extension then becomes a series of degree adds
                    if (tok2L === '4') {
                        this.m_xmlKind = 'suspended-fourth'
                    } else if (tok2L === '2') {
                        this.m_xmlKind = 'suspended-second'
                    }
                    this.m_xmlText = tok1 + tok2
                    if (this.m_extension === '7' || this.m_extension === '9' || this.m_extension === '11' || this.m_extension === '13') {
                        this.m_xmlDegrees.push((this.m_quality === 'major') ? 'add#7' : 'add7')
                        // hack for programs that cannot assemble names well
                        // even though the kind is suspended, set text to also include the extension
                        // in export, we will set the degree text to null
                        this.m_xmlText = this.m_extension + this.m_xmlText
                        degree = ''
                    } else if (this.m_extension !== '') {
                        degree = 'add' + this.m_extension
                    }
                    if (this.m_extension === '13') {
                        this.m_xmlDegrees.push('add9')
                        this.m_xmlDegrees.push('add11')
                        this.m_xmlDegrees.push('add13')
                    } else if (this.m_extension === '11') {
                        this.m_xmlDegrees.push('add9')
                        this.m_xmlDegrees.push('add11')
                    } else if (this.m_extension === '9') {
                        this.m_xmlDegrees.push('add9')
                    }
                    susChord = true
                    this.m_chord.subKey(thirdKey)
                    if (d) {
                        this.m_chord.addKey(key[d])
                    }
                } else if (tok1L === 'major') {
                    if (this.m_xmlKind.startsWith('minor')) {
                        this.m_xmlKind = 'major-minor'
                        if (this.m_extension === '9' || tok2L === '9') {
                            this.m_xmlDegrees.push('add9')
                        }
                        if (this.m_extension === '11' || tok2L === '11') {
                            this.m_xmlDegrees.push('add9')
                            this.m_xmlDegrees.push('add11')
                        }
                        if (this.m_extension === '13' || tok2L === '13') {
                            this.m_xmlDegrees.push('add9')
                            this.m_xmlDegrees.push('add11')
                            this.m_xmlDegrees.push('add13')
                        }
                        this.m_xmlText += tok1 + tok2
                        this.correctXmlText('7')
                    } else {
                        tok1L = 'add'
                    }
                    this.m_chord.subKey(10)
                    this.m_chord.addKey(11)
                    if (d && d !== 7) {
                        hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                    }
                } else if (tok1L === 'alt') {
                    this.m_xmlDegrees.push('altb5')
                    this.m_xmlDegrees.push('add#5')
                    this.m_xmlDegrees.push('addb9')
                    this.m_xmlDegrees.push('add#9')
                    this.m_chord.subKey(7)
                    this.m_chord.addKey(6)
                    this.m_chord.addKey(8)
                    this.m_chord.addKey(1)
                    this.m_chord.addKey(3)
                } else if (tok1L === 'blues') {
                    // this isn't really well-defined, but it might as well mean something
                    if (this.m_extension === '11' || this.m_extension === '13') {
                        this.m_xmlDegrees.push('alt#9')
                    } else {
                        this.m_xmlDegrees.push('add#9')
                    }
                    this.m_chord.addKey(3)
                } else if (tok1L === 'lyd') {
                    if (this.m_extension === '13') {
                        this.m_xmlDegrees.push('alt#11')
                    } else {
                        this.m_xmlDegrees.push('add#11')
                    }
                    this.m_chord.addKey(6)
                } else if (tok1L === 'phryg') {
                    if (!this.m_xmlKind.startsWith('minor')) {
                        this.m_xmlKind = 'minor-seventh'
                    }
                    if (this.m_extension === '11' || this.m_extension === '13') {
                        this.m_xmlDegrees.push('altb9')
                    } else {
                        this.m_xmlDegrees.push('addb9')
                    }
                    this.m_xmlText += tok1
                    this.m_chord = HChord.fromString('C Db Eb G Bb')
                } else if (tok1L === 'tristan') {
                    this.m_xmlKind = 'Tristan'
                    this.m_xmlText = tok1
                    this.m_chord = HChord.fromString('C F# A# D#')
                } else if (addPending) {
                    degree = 'add' + tok1L + tok2L
                    if (this.m_raise.includes(tok1L)) {
                        hdl.push(new HDegree(d, 1, HDegreeType.ADD))
                    } else if (this.m_lower.includes(tok1L)) {
                        hdl.push(new HDegree(d, -1, HDegreeType.ADD))
                    } else {
                        hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                    }
                } else if (susPending) {
                    degree = 'sus' + tok1L + tok2L
                    if (this.m_raise.includes(tok1L)) {
                        hdl.push(new HDegree(d, 1, HDegreeType.ADD))
                    } else if (this.m_lower.includes(tok1L)) {
                        hdl.push(new HDegree(d, -1, HDegreeType.ADD))
                    } else {
                        hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                    }
                } else if (tok1L === '' && tok2L !== '') {
                    degree = 'add' + tok2L
                    hdl.push(new HDegree(d, 0, HDegreeType.ADD))
                } else if (this.m_lower.includes(tok1L)) {
                    tok1L = 'b'
                    alter = true
                } else if (this.m_raise.includes(tok1L)) {
                    tok1L = '#'
                    alter = true
                } else if (tok1L === '') {
                    // token was already handled fully
                } else {
                    this.m_understandable = false
                    if (s.startsWith(tok1)) {
                        // unrecognized token right from very beginning
                        this.m_xmlKind = 'other'
                        this.m_xmlText = tok1
                    }
                }
                if (alter) {
                    if (tok2L === '4' && this.m_xmlKind === 'suspended-fourth') {
                        degree = 'alt'
                    } else if (tok2L === '5') {
                        degree = 'alt'
                    } else if (tok2L === '9' && (this.m_extension === '11' || this.m_extension === '13')) {
                        degree = 'alt'
                    } else if (tok2L === '11' && this.m_extension === '13') {
                        degree = 'alt'
                    } else {
                        degree = 'add'
                    }
                    degree += tok1L + tok2L
                    if (this.m_chord.contains(key[d]) && !(susChord && (d === 11))) {
                        hdl.push(new HDegree(d, 0, HDegreeType.SUBTRACT))
                    }
                    if (tok1L === '#') {
                        if (d === 7) {
                            this.m_chord.addKey(11)
                        } else {
                            hdl.push(new HDegree(d, 1, HDegreeType.ADD))
                        }
                    } else if (tok1L === 'b') {
                        if (d === 7) {
                            this.m_chord.addKey(10)
                        } else {
                            hdl.push(new HDegree(d, -1, HDegreeType.ADD))
                        }
                    }
                }
                if (degree !== '') {
                    this.m_xmlDegrees.push(degree)
                }
            }
            // eat trailing parens and commas
            while (i < len && trailing.includes(s[i])) {
                this.addToken(s[i++], ChordTokenClass.MODIFIER)
            }
            addPending = false
            susPending = false
        }
        if (!syntaxOnly) {
            this.m_chord.add(hdl)
            // fix "add" / "alt" conflicts
            // so add9,altb9 -> addb9
            const altList = this.m_xmlDegrees.filter(x => x.includes('alt'))
            for (const d of altList) {
                const unalt = d.replace(/alt[b#]/g, 'add')
                const origSize = this.m_xmlDegrees.length
                this.m_xmlDegrees = this.m_xmlDegrees.filter(x => x !== unalt)
                if (this.m_xmlDegrees.length !== origSize) {
                    const alt = replaceStr(d, 'alt', 'add')
                    const i1 = this.m_xmlDegrees.indexOf(d)
                    if (i1 !== -1) {
                        this.m_xmlDegrees[i1] = alt
                    }
                }
            }
        }

        // construct handle
        if (this.m_modifierList.length !== 0) {
            const sortedModifiers = this.m_modifierList.slice()
            sortedModifiers.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            this.m_modifiers = '<' + sortedModifiers.join('><') + '>'
        }
        this.m_handle = '<' + this.m_quality + '><' + this.m_extension + '>' + this.m_modifiers

        // force <minor><7><b5> to export as half-diminished
        if (!syntaxOnly && this.m_handle === '<minor><7><b5>') {
            this.m_xmlKind = 'half-diminished'
            this.m_xmlText = s
            this.m_xmlDegrees = []
        }
        return this.m_parseable
    }

    //---------------------------------------------------------
    //   fromXml
    //---------------------------------------------------------

    fromXml(rawKind: string, rawKindText: string, useSymbols: string, useParens: string, dl: readonly HDegree[],
        cl: ChordList | null): string {
        let kind = rawKind
        let kindText = rawKindText
        const syms = (useSymbols === 'yes')
        let parens = (useParens === 'yes')
        let implied = false
        let extend = false
        let extension = 0
        this.m_parseable = true
        this.m_understandable = true

        // get quality info from kind
        if (kind === 'major-minor') {
            this.m_quality = 'minor'
            this.m_modifierList.push('major7')
            extend = true
        } else if (kind.includes('major')) {
            this.m_quality = 'major'
            if (kind === 'major' || kind === 'major-sixth') {
                implied = true
            }
        } else if (kind.includes('minor')) {
            this.m_quality = 'minor'
        } else if (kind.includes('dominant')) {
            this.m_quality = 'dominant'
            implied = true
            extension = 7
        } else if (kind === 'augmented-seventh') {
            this.m_quality = 'augmented'
            extension = 7
            extend = true
        } else if (kind === 'augmented') {
            this.m_quality = 'augmented'
        } else if (kind === 'half-diminished') {
            this.m_quality = 'half-diminished'
            if (syms) {
                extension = 7
                extend = true
            }
        } else if (kind === 'diminished-seventh') {
            this.m_quality = 'diminished'
            extension = 7
        } else if (kind === 'diminished') {
            this.m_quality = 'diminished'
        } else if (kind === 'suspended-fourth') {
            this.m_quality = 'major'
            implied = true
            this.m_modifierList.push('sus4')
        } else if (kind === 'suspended-second') {
            this.m_quality = 'major'
            implied = true
            this.m_modifierList.push('sus2')
        } else if (kind === 'power') {
            this.m_quality = 'major'
            implied = true
            extension = 5
        } else if (kind === 'pedal') {
            // Ignore, assume major
            this.m_quality = 'major'
            implied = true
        } else {
            this.m_quality = kind
        }

        // get extension info from kind
        if (kind.includes('seventh')) {
            extension = 7
        } else if (kind.includes('ninth')) {
            extension = 9
        } else if (kind.includes('11th')) {
            extension = 11
        } else if (kind.includes('13th')) {
            extension = 13
        } else if (kind.includes('sixth')) {
            extension = 6
        }

        // get modifier info from degree list
        for (const d of dl) {
            let mod = ''
            const v = d.value()
            switch (d.type()) {
            case HDegreeType.ADD:
            case HDegreeType.ALTER:
                switch (d.alter()) {
                case -1: mod = 'b'
                    break
                case 1: mod = '#'
                    break
                case 0: mod = 'add'
                    break
                }
                break
            case HDegreeType.SUBTRACT:
                mod = 'no'
                break
            case HDegreeType.UNDEF:
            default:
                break
            }
            mod += String(v)
            if (mod === 'add7' && kind.includes('suspended')) {
                this.m_quality = 'dominant'
                implied = true
                extension = 7
                extend = true
                mod = ''
            } else if (mod === 'add#7' && kind.includes('suspended')) {
                this.m_quality = 'major'
                implied = false
                extension = 7
                extend = true
                mod = ''
            } else if (mod === 'add9' && extend) {
                if (extension < 9) {
                    extension = 9
                }
                mod = ''
            } else if (mod === 'add11' && extend) {
                if (extension < 11) {
                    extension = 11
                }
                mod = ''
            } else if (mod === 'add13' && extend) {
                extension = 13
                mod = ''
            } else if (mod === 'add9' && kind.includes('sixth')) {
                extension = 69
                mod = ''
            }
            if (mod !== '') {
                this.m_modifierList.push(mod)
            }
        }
        // convert no3,add[42] into sus[42]
        const no3 = this.m_modifierList.indexOf('no3')
        if (no3 !== -1) {
            let addn = this.m_modifierList.indexOf('add4')
            if (addn === -1) {
                addn = this.m_modifierList.indexOf('add2')
            }
            if (addn !== -1) {
                this.m_modifierList[addn] = replaceStr(this.m_modifierList[addn], 'add', 'sus')
                this.m_modifierList.splice(no3, 1)
            }
        }
        // convert kind=minor-seventh, degree=altb5 to kind=half-diminished (suppression of degree=altb comes later)
        if (kind === 'minor-seventh' && this.m_modifierList.length === 1 && this.m_modifierList[0] === 'b5') {
            kind = 'half-diminished'
        }
        // force parens where necessary)
        if (!parens && extension === 0 && this.m_modifierList.length !== 0) {
            const firstMod = this.m_modifierList[0]
            if (firstMod !== '' && (firstMod.startsWith('#') || firstMod.startsWith('b'))) {
                parens = true
            }
        }

        // record extension
        if (extension) {
            this.m_extension = String(extension)
        }

        // validate kindText
        if (kindText !== '' && kind !== 'none' && kind !== 'other') {
            const validate = new ParsedChord()
            validate.parse(kindText, cl, false)
            // kindText should parse to produce same kind, no degrees
            if (validate.m_xmlKind !== kind || validate.m_xmlDegrees.length !== 0) {
                kindText = ''
            }
        }

        // construct name & handle
        this.m_name = ''
        if (kindText !== '') {
            if (this.m_extension !== '' && kind.includes('suspended')) {
                this.m_name += this.m_extension
            }
            this.m_name += kindText
            if (extension === 69) {
                this.m_name += '9'
            }
        } else if (implied) {
            this.m_name = this.m_extension
        } else {
            if (this.m_quality === 'major') {
                this.m_name = syms ? '^' : 'maj'
            } else if (this.m_quality === 'minor') {
                this.m_name = syms ? '-' : 'm'
            } else if (this.m_quality === 'augmented') {
                this.m_name = syms ? '+' : 'aug'
            } else if (this.m_quality === 'diminished') {
                this.m_name = syms ? 'o' : 'dim'
            } else if (this.m_quality === 'half-diminished') {
                this.m_name = syms ? '0' : 'm7b5'
            } else {
                this.m_name = this.m_quality
            }
            this.m_name += this.m_extension
        }
        if (parens) {
            this.m_name += '('
        }
        for (const modOrig of this.m_modifierList) {
            const mod = replaceStr(modOrig, 'major', 'maj')
            if (kindText !== '' && kind.includes('suspended') && mod.startsWith('sus')) {
                continue
            } else if (kindText !== '' && kind === 'major-minor' && mod.startsWith('maj')) {
                continue
            }
            this.m_name += mod
        }
        if (parens) {
            this.m_name += ')'
        }

        // parse name to construct handle & tokenList
        this.parse(this.m_name, cl, true)

        // record original MusicXML
        this.m_xmlKind = kind
        this.m_xmlText = kindText
        this.m_xmlSymbols = useSymbols
        this.m_xmlParens = useParens
        for (const d of dl) {
            if (kind === 'half-diminished' && d.type() === HDegreeType.ALTER && d.alter() === -1 && d.value() === 5) {
                continue
            }
            this.m_xmlDegrees.push(d.text())
        }

        return this.m_name
    }

    //---------------------------------------------------------
    //   renderList
    //---------------------------------------------------------

    renderList(cl: ChordList | null, stacked: boolean): readonly RenderAction[] {
        // generate anew on each call,
        // in case chord list has changed since last time
        // (a new array: callers in C++ copy the returned vector)
        this.m_renderList = []

        if (this.m_tokenList.length === 0) {
            return this.m_renderList
        }

        let modIdx = 0
        const modListSize = this.m_modifierList.length
        // C++: size_t finalModIdx = modListSize - 1 (only used when there are modifiers)
        const finalModIdx = modListSize - 1
        const stackModifiersEnabled = this.m_modifierList.length > 1 && stacked
        const superScriptEnabled = !stackModifiersEnabled && cl!.chordPreset() === ChordStylePreset.JAZZ

        // Special stack layout if there is a single 'add' or 'sus' with multiple degrees
        // Standard stack layout if there is only one
        let stackSusOrAdd = false
        for (const mod of this.m_modifierList) {
            if (!(stackModifiersEnabled || superScriptEnabled) || !SUS_ADD_REGEX.test(mod)) {
                continue
            }
            if (!stackSusOrAdd) {
                stackSusOrAdd = true
            } else {
                stackSusOrAdd = false
                break
            }
        }

        let adjust = cl ? cl.autoAdjust() : false
        let firstModifierToken = true
        let closingParenPending = false
        for (let tokIt = 0; tokIt < this.m_tokenList.length; tokIt++) {
            const tok = this.m_tokenList[tokIt]
            const n = tok.names[0]
            if ((n === '/' || n === ',' || n === '\\') && stackSusOrAdd) {
                continue
            }

            const tokIsSusOrAdd = SUS_ADD_REGEX_FULL.test(n)
            const stackModifier = stackModifiersEnabled && !(stackSusOrAdd && tokIsSusOrAdd)
            const superScriptModifier = superScriptEnabled && !(stackSusOrAdd && tokIsSusOrAdd)
            let curMod = this.m_modifierList.length > 1 ? (this.m_modifierList[modIdx] ?? '') : ''
            if (stackSusOrAdd && stackModifier && modIdx === 0) {
                curMod = curMod.replace(SUS_ADD_REGEX_G, '')
            }
            const modifierEnd = curMod.endsWith(n) && modIdx !== finalModIdx

            let rl: readonly RenderAction[] = []
            const definedTokens: ChordToken[] = []
            let found = false
            // potential definitions for token
            if (cl) {
                for (const ct of cl.chordTokenList) {
                    for (const ctn of ct.names) {
                        if (ctn === n) {
                            definedTokens.push(ct)
                        }
                    }
                }
            }
            // find matching class, fallback on ChordTokenClass::ALL
            let ctc = ChordTokenClass.ALL
            for (const matchingTok of definedTokens) {
                if (tok.tokenClass === matchingTok.tokenClass) {
                    rl = matchingTok.renderList
                    ctc = tok.tokenClass
                    found = true
                    break
                } else if (matchingTok.tokenClass === ChordTokenClass.ALL) {
                    rl = matchingTok.renderList
                    found = true
                }
            }

            // build render list
            // check for adjustments
            const yAdjust = adjust
                ? cl!.position(tok.names, stackModifier, superScriptModifier, ctc, finalModIdx - modIdx, modListSize) : 0.0

            // Modifier behaviour
            if (tok.tokenClass === ChordTokenClass.MODIFIER) {
                // Stop adjusting when first non-adjusted modifier found
                if (RealIsNull(yAdjust) && !(stackSusOrAdd && tokIsSusOrAdd)) {
                    adjust = false
                }

                // This is the first modifier. Discount subsequent items from horizontal alignment
                if (cl!.excludeModsHAlign() && modIdx === 0) {
                    this.m_renderList.push(new RenderActionStopHAlign())
                }

                // Jazz superscript
                if (superScriptModifier) {
                    // Set scale
                    this.m_renderList.push(new RenderActionScale(cl!.stackedModifierMag()))
                    // Move to x-height
                    this.m_renderList.push(new RenderActionPush())
                    this.m_renderList.push(new RenderActionMoveXHeight(true))
                }

                // Stacked modifiers
                if (stackModifier) {
                    // Pad modifier stack before
                    if (firstModifierToken) {
                        this.m_renderList.push(new RenderActionMove(0.15, 0))
                        firstModifierToken = false
                    }

                    // Check if the next token is a closing paren
                    // Delay starting a new line until after the paren
                    // (parens are excluded from the modifier string)
                    const nextTokIt = tokIt + 1
                    if (nextTokIt < this.m_tokenList.length && modifierEnd) {
                        const nextTok = this.m_tokenList[nextTokIt]
                        if (nextTok.names[0] === ')') {
                            closingParenPending = true
                        }
                    }

                    const startsWithAcc = (str: string): boolean => str.startsWith('b') || str.startsWith('#')
                    const startsWithSusOrAdd = (str: string): boolean => str.startsWith('sus') || str.startsWith('add')
                    // Align vertically stacked modifier's x position by pushing it at the start of every modifier and popping at the end
                    // Make sure degrees are aligned when there are accidentals
                    const nextMod = modIdx !== finalModIdx ? (this.m_modifierList[modIdx + 1] ?? '') : ''
                    const nextModStartsWithAcc = startsWithAcc(nextMod)
                    const curModStartsWithAcc = startsWithAcc(curMod)
                    const nIsAcc = startsWithAcc(n)
                    const curModStartsWithSusOrAdd = startsWithSusOrAdd(curMod)
                    const nIsSusOrAdd = startsWithSusOrAdd(n)

                    if (curModStartsWithSusOrAdd) { // Align sus or add left
                        if (nIsSusOrAdd) {
                            this.m_renderList.push(new RenderActionPush())
                        }
                    } else if (nIsAcc && nextModStartsWithAcc) { // current line has accidental, next line has accidental -> push before accidental
                        this.m_renderList.push(new RenderActionPush())
                    } else if (!curModStartsWithAcc && !nextModStartsWithAcc) { // current line has no accidental, next line has no accidental -> push before degree
                        this.m_renderList.push(new RenderActionPush())
                    } else if (curModStartsWithAcc && !nextModStartsWithAcc && !nIsAcc) { // current line has accidental, next line has no accidental ->  push before degree
                        this.m_renderList.push(new RenderActionPush())
                    } else if (!curModStartsWithAcc && nextModStartsWithAcc) { // current line has no accidental, next line has accidental -> push before degree
                        this.m_renderList.push(new RenderActionPush()) // and move by next line's accidental's width to align
                        const nextAcc = nextMod.replace(/[0-9]+/g, '')
                        this.m_renderList.push(new RenderActionMoveTextWidth(nextAcc))
                    }

                    // Set scale
                    this.m_renderList.push(new RenderActionScale(cl!.stackedModifierMag()))
                    // Move to x-height
                    this.m_renderList.push(new RenderActionPush())
                    this.m_renderList.push(new RenderActionMoveXHeight(true))
                }
            }

            if (!RealIsNull(yAdjust)) {
                this.m_renderList.push(new RenderActionMove(0.0, yAdjust))
            }
            if (found) {
                this.m_renderList.push(...rl)
            } else {
                // no definition for token, so render as literal
                this.m_renderList.push(new RenderActionSet(tok.names[0]))
            }
            // Reset adjust
            if (!RealIsNull(yAdjust)) {
                this.m_renderList.push(new RenderActionMove(0.0, -yAdjust))
            }

            if (tok.tokenClass === ChordTokenClass.MODIFIER && n !== '' && superScriptModifier) {
                this.m_renderList.push(new RenderActionPopY())
                this.m_renderList.push(new RenderActionScale(1 / cl!.stackedModifierMag()))
            }

            // Stacked modifiers
            if (tok.tokenClass === ChordTokenClass.MODIFIER && n !== '' && stackModifier) {
                // Reset move to x-height
                this.m_renderList.push(new RenderActionPopY())
                // Reset scale
                this.m_renderList.push(new RenderActionScale(1 / cl!.stackedModifierMag()))
                if (modifierEnd !== closingParenPending) {
                    modIdx++
                    closingParenPending = false

                    // Restore x position
                    this.m_renderList.push(new RenderActionPopX())
                }
            }
        }

        return this.m_renderList
    }

    //---------------------------------------------------------
    //   addToken
    //---------------------------------------------------------

    private addToken(s: string, tc: ChordTokenClass): void {
        if (s === '') {
            return
        }
        const tok = new ChordToken()
        tok.names.push(s)
        tok.tokenClass = tc
        this.m_tokenList.push(tok)
    }
}

//---------------------------------------------------------
//   ChordDescription
//    Describes chord quality, extensions and modifiers. eg. m7#11
//---------------------------------------------------------

export class ChordDescription {
    id = 0 // Chord id number (Band In A Box Chord Number)
    names: string[] = [] // list of alternative chord names
    // that will by recognized from keyboard entry (without root/base)
    parsedChords: ParsedChord[] = []
    // parsed forms of primary name (optionally also include parsed forms of other names)
    xmlKind = '' // MusicXML: kind
    xmlText = '' // MusicXML: kind text=
    xmlSymbols = '' // MusicXML: kind use-symbols=
    xmlParens = '' // MusicXML: kind parentheses-degrees=
    xmlDegrees: string[] = [] // MusicXML: list of degrees (if any)
    chord = new HChord() // C based chord
    renderList: RenderAction[] = []
    renderListStacked: RenderAction[] = []
    generated = false
    renderListGenerated = false
    exportOk = false

    private m_quality = ''

    /**
     * ChordDescription(): no argument
     * ChordDescription(int): used when reading from file, a private id is assigned for id = 0
     * ChordDescription(const String&): used when generating from name, a private id is always assigned
     */
    constructor(arg?: number | string) {
        if (typeof arg === 'number') {
            let i = arg
            if (!i) {
                i = --ChordList.privateID
            }
            this.id = i
            this.generated = false
            this.renderListGenerated = false
            this.exportOk = true
        } else if (typeof arg === 'string') {
            this.id = --ChordList.privateID
            this.generated = true
            this.names.push(arg)
            this.renderListGenerated = false
            this.exportOk = false
        }
    }

    /** ChordDescription(int) */
    static fromId(i: number): ChordDescription { return new ChordDescription(i) }
    /** ChordDescription(const String&) */
    static fromName(name: string): ChordDescription { return new ChordDescription(name) }

    clone(): ChordDescription {
        const cd = new ChordDescription()
        cd.id = this.id
        cd.names = this.names.slice()
        cd.parsedChords = this.parsedChords.map(pc => pc.clone())
        cd.xmlKind = this.xmlKind
        cd.xmlText = this.xmlText
        cd.xmlSymbols = this.xmlSymbols
        cd.xmlParens = this.xmlParens
        cd.xmlDegrees = this.xmlDegrees.slice()
        cd.chord = this.chord.clone()
        cd.renderList = this.renderList.slice()
        cd.renderListStacked = this.renderListStacked.slice()
        cd.generated = this.generated
        cd.renderListGenerated = this.renderListGenerated
        cd.exportOk = this.exportOk
        cd.m_quality = this.m_quality
        return cd
    }

    quality(): string { return this.m_quality }

    //---------------------------------------------------------
    //   complete
    //    generate missing renderList and semantic (Xml) info
    //---------------------------------------------------------

    complete(pc: ParsedChord | null, cl: ChordList | null): void {
        if (!pc) {
            // generate parsed chord for its rendering & semantic (xml) info
            pc = new ParsedChord()
            let n = ''
            if (this.names.length !== 0) {
                n = this.names[0]
            }
            pc.parse(n, cl)
        }
        this.parsedChords.push(pc.clone())
        if (this.renderList.length === 0 || this.renderListStacked.length === 0 || this.renderListGenerated) {
            this.renderList = pc.renderList(cl, false).slice()
            this.renderListStacked = pc.renderList(cl, true).slice()
            this.renderListGenerated = true
        }
        if (this.xmlKind === '') {
            this.xmlKind = pc.xmlKind()
            this.xmlDegrees = pc.xmlDegrees().slice()
        }
        // these fields are not read from chord description files
        // so get them from the parsed representation in all cases
        this.xmlText = pc.xmlText()
        this.xmlSymbols = pc.xmlSymbols()
        this.xmlParens = pc.xmlParens()
        if (this.chord.getKeys() === 0) {
            this.chord = new HChord(pc.keys())
        }
        this.m_quality = pc.quality()
    }

    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    read(e: XmlReader, mscVersion: number): void {
        let ni = 0
        this.id = toInt(e.attribute('id'))
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'name') {
                const n = e.readText()
                // stack names for this file on top of the list
                this.names.splice(ni++, 0, n)
            } else if (tag === 'xml') {
                this.xmlKind = e.readText()
            } else if (tag === 'degree') {
                this.xmlDegrees.push(e.readText())
            } else if (tag === 'voicing') {
                this.chord = HChord.fromString(e.readText())
            } else if (tag === 'render') {
                readRenderList(e.readText(), this.renderList, mscVersion)
                this.renderListGenerated = false
            } else {
                e.unknown()
            }
        }
    }

    //---------------------------------------------------------
    //   write
    //---------------------------------------------------------

    write(xml: XmlWriter): void {
        if (this.generated && !this.exportOk) {
            return
        }
        if (this.id > 0) {
            xml.startElement('chord', [['id', this.id]])
        } else {
            xml.startElement('chord')
        }
        for (const s of this.names) {
            xml.tag('name', s)
        }
        xml.tag('xml', this.xmlKind)
        xml.tag('voicing', this.chord.voicing())
        for (const s of this.xmlDegrees) {
            xml.tag('degree', s)
        }
        writeRenderList(xml, this.renderList, 'render')
        xml.endElement()
    }
}

//---------------------------------------------------------
//   ChordSymbol
//    Represents the <sym> tag in chord XML files
//---------------------------------------------------------

export class ChordSymbol {
    fontIdx = -1
    name = ''
    value = ''
    /** C++ Char code: its UTF-16 code unit, 0 = null char */
    code = 0

    isValid(): boolean { return this.fontIdx !== -1 }

    clone(): ChordSymbol {
        const cs = new ChordSymbol()
        cs.fontIdx = this.fontIdx
        cs.name = this.name
        cs.value = this.value
        cs.code = this.code
        return cs
    }
}

//---------------------------------------------------------
//   ChordFont
//    Represents the <font> tag in chord XML files
//---------------------------------------------------------

export class ChordFont {
    family = ''
    fontClass = ''
    mag = 1.0
    musicSymbolText = false
}

//---------------------------------------------------------
//   chord description file registry
//    replaces the Qt resources ":/engraving/styles/<name>"
//---------------------------------------------------------

/** the chord description files of MuseScore (src/engraving/data/chords), shipped in fonts/chords/ */
export const CHORD_LIST_FILES: readonly string[] = [
    'chords.xml',
    'chords_std.xml',
    'chords_jazz.xml',
    'chords_legacy.xml',
    'stdchords.xml',
    'jazzchords.xml',
    'cchords_muse.xml',
    'cchords_nrb.xml',
    'cchords_rb.xml',
    'cchords_sym.xml',
]

const s_chordListFiles = new Map<string, string | Uint8Array>()

/** registers the content of a chord description file (e.g. "chords_std.xml") for ChordList.read(name) */
export function registerChordListFile(name: string, content: string | Uint8Array): void {
    s_chordListFiles.set(name, content)
}

export function isChordListFileRegistered(name: string): boolean {
    return s_chordListFiles.has(name)
}

/**
 * Qt's QXmlStreamReader expands entities declared in an internal DTD subset
 * (chords_std.xml declares <!ENTITY super "0.36">); XmlReader does not, so do it here.
 */
function expandInternalDtd(text: string): string {
    const start = text.indexOf('<!DOCTYPE')
    if (start < 0) {
        return text
    }
    let i = start + 9
    while (i < text.length && text[i] !== '[' && text[i] !== '>') {
        ++i
    }
    const entities = new Map<string, string>()
    let end = i
    if (text[i] === '[') {
        let j = i + 1
        let subset = ''
        while (j < text.length) {
            if (text.startsWith('<!--', j)) {
                const e = text.indexOf('-->', j + 4)
                j = e < 0 ? text.length : e + 3
                continue
            }
            const c = text[j]
            if (c === '"' || c === '\'') {
                const e = text.indexOf(c, j + 1)
                const next = e < 0 ? text.length : e + 1
                subset += text.slice(j, next)
                j = next
                continue
            }
            if (c === ']') {
                break
            }
            subset += c
            ++j
        }
        const re = /<!ENTITY\s+([^\s%]+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g
        let m: RegExpExecArray | null
        while ((m = re.exec(subset)) !== null) {
            if (!entities.has(m[1])) {
                entities.set(m[1], m[2] ?? m[3] ?? '')
            }
        }
        end = text.indexOf('>', j)
        if (end < 0) {
            end = text.length
        }
    }
    const rest = text.slice(0, start) + text.slice(end + 1)
    if (entities.size === 0) {
        return rest
    }
    return rest.replace(/&([A-Za-z_][\w.-]*);/g, (match, n: string) => entities.get(n) ?? match)
}

//---------------------------------------------------------
//   ChordList
//    Reads chord XML files and stores the list of known chords
//    (C++ derives from std::map<int, ChordDescription>)
//---------------------------------------------------------

export class ChordList {
    static privateID = -1000

    private m_map = new Map<number, ChordDescription>()

    fonts: ChordFont[] = []
    renderListRoot: RenderAction[] = []
    renderListFunction: RenderAction[] = []
    renderListBass: RenderAction[] = []
    renderListBassOffset: RenderAction[] = []
    chordTokenList: ChordToken[] = []

    private m_symbols = new Map<string, ChordSymbol>()
    private m_autoAdjust = false
    private m_stackModifiers = false
    private m_excludeModsHAlign = false
    private m_chordPreset = ChordStylePreset.STANDARD
    private m_nmag = 1.0
    private m_nadjust = 0.0 // adjust values are measured in percentage
    private m_emag = 1.0
    private m_eadjust = 0.0 // (which is then applied to the height of the font)
    private m_mmag = 1.0
    private m_madjust = 0.0
    private m_stackedmmag = 0.0
    private m_symbolTextFont = ''

    private m_customChordList = false // if true, chordlist will be saved as part of score

    // --- std::map interface ---

    get(id: number): ChordDescription | undefined { return this.m_map.get(id) }
    has(id: number): boolean { return this.m_map.has(id) }
    /** map[id] = cd */
    set(id: number, cd: ChordDescription): void { this.m_map.set(id, cd) }
    /** std::map::insert: does not overwrite an existing entry, returns true if inserted */
    insert(id: number, cd: ChordDescription): boolean {
        if (this.m_map.has(id)) {
            return false
        }
        this.m_map.set(id, cd)
        return true
    }
    /** std::map::at */
    at(id: number): ChordDescription {
        const cd = this.m_map.get(id)
        if (!cd) {
            throw new RangeError(`ChordList::at: no chord description ${id}`)
        }
        return cd
    }
    /** muse::take */
    take(id: number): ChordDescription | undefined {
        const cd = this.m_map.get(id)
        this.m_map.delete(id)
        return cd
    }
    erase(id: number): void { this.m_map.delete(id) }
    clear(): void { this.m_map.clear() }
    size(): number { return this.m_map.size }
    empty(): boolean { return this.m_map.size === 0 }
    /** keys in ascending order (std::map order) */
    keys(): number[] { return [...this.m_map.keys()].sort((a, b) => a - b) }
    /** entries in ascending key order (std::map order) */
    entries(): [number, ChordDescription][] { return this.keys().map(k => [k, this.m_map.get(k)!]) }
    values(): ChordDescription[] { return this.keys().map(k => this.m_map.get(k)!) }
    /** the descriptions in ascending id order (iterating the C++ map) */
    descriptions(): ChordDescription[] { return this.values() }
    [Symbol.iterator](): Iterator<[number, ChordDescription]> { return this.entries()[Symbol.iterator]() }

    // ---

    autoAdjust(): boolean { return this.m_autoAdjust }
    nominalMag(): number { return this.m_nmag }
    nominalAdjust(): number { return this.m_nadjust }
    stackModifiers(): boolean { return this.m_stackModifiers }
    excludeModsHAlign(): boolean { return this.m_excludeModsHAlign }
    stackedModifierMag(): number { return this.m_stackedmmag }
    chordPreset(): ChordStylePreset { return this.m_chordPreset }

    //---------------------------------------------------------
    //   configureAutoAdjust
    //---------------------------------------------------------

    configureAutoAdjust(emag = 1.0, eadjust = 0.0, mmag = 1.0, madjust = 0.0, stackedmmag = 0.0, stackModifiers = false,
        excludeModsHAlign = false, symbolFont = '', preset: ChordStylePreset = ChordStylePreset.STANDARD): void {
        this.m_stackModifiers = stackModifiers
        this.m_excludeModsHAlign = excludeModsHAlign
        this.m_emag = emag
        this.m_eadjust = eadjust
        this.m_mmag = mmag
        this.m_stackedmmag = stackedmmag
        this.m_madjust = madjust
        this.m_symbolTextFont = symbolFont
        this.m_chordPreset = preset
    }

    //---------------------------------------------------------
    //   position
    //---------------------------------------------------------

    position(names: readonly string[], stackModifiers: boolean, superScript: boolean, ctc: ChordTokenClass, modifierIdx: number,
        nmodifiers: number): number {
        const name = names.length === 0 ? '' : names[0]
        switch (ctc) {
        case ChordTokenClass.EXTENSION:
            return this.m_eadjust
        case ChordTokenClass.MODIFIER: {
            let yAdj = 0.0
            if (superScript) {
                // Fake superscript by aligning with capheight
                yAdj += 0.15
            } else if (stackModifiers && nmodifiers > 1) {
                const LINE_SPACING = 0.4 // Space between modifiers in units of modiferHeight
                const modifierHeight = this.m_mmag * this.m_stackedmmag // Modifier height in units of root capheight
                const stackHeight = (nmodifiers * modifierHeight) + ((nmodifiers - 1) * modifierHeight * LINE_SPACING) // Height of total modifier stack (bottom baseline to top capheight)
                const base = stackHeight / 2 // Baseline of bottom modifier in the stack
                yAdj += base - modifierIdx * modifierHeight * (1 + LINE_SPACING)
            }

            if (name !== '') {
                yAdj += this.m_madjust
            }
            return yAdj
        }
        default:
            return 0.0
        }
    }

    //---------------------------------------------------------
    //   checkChordList
    //---------------------------------------------------------

    checkChordList(style: MStyle): void {
        // make sure we have a chordlist
        if (!this.loaded()) {
            const emag = style.styleD(Sid.chordExtensionMag)
            const eadjust = style.styleD(Sid.chordExtensionAdjust)
            const mmag = style.styleD(Sid.chordModifierMag)
            const madjust = style.styleD(Sid.chordModifierAdjust)
            const stackedmmag = style.styleD(Sid.chordStackedModifierMag)
            const stackModifiers = style.styleB(Sid.verticallyStackModifiers)
            const excludeModsHAlign = style.styleB(Sid.chordAlignmentExcludeModifiers)
            const symbolFont = style.styleSt(Sid.musicalTextFont)
            const preset = style.styleV(Sid.chordStyle) as ChordStylePreset
            this.configureAutoAdjust(emag, eadjust, mmag, madjust, stackedmmag, stackModifiers, excludeModsHAlign, symbolFont, preset)

            if (style.styleB(Sid.chordsXmlFile)) {
                this.read('chords.xml')
            }

            this.read(style.styleSt(Sid.chordDescriptionFile) ?? '')
        }
    }

    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    /** read Chord List from a (registered) chord description file, return false on error */
    read(name: string): boolean
    /** read the content of a <museScore> or <ChordList> element (C++ private, used by ReadChordListHook) */
    read(e: XmlReader, mscVersion: number): void
    read(a: string | XmlReader, mscVersion = 0): boolean | void {
        if (typeof a === 'string') {
            return this.readFile(a)
        }
        this.readXml(a, mscVersion)
    }

    private readFile(name: string): boolean {
        // C++: absolute paths are read from disk, others from ":/engraving/styles/" + name
        // here both are looked up in the registry by name
        // TODO(port): absolute paths (isAbsolutePath) can only be resolved if registered under that exact name
        let path = name

        // default to chords_std.xml
        if (!s_chordListFiles.has(path)) {
            path = 'chords_std.xml'
        }

        if (name === '') {
            return false
        }
        const data = s_chordListFiles.get(path)
        if (data === undefined) {
            console.error(`Cannot open chord description: ${path}`)
            return false
        }

        return this.readDevice(data)
    }

    /** C++ read(IODevice*) */
    readDevice(data: string | Uint8Array): boolean {
        const text = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data)
        const e = new XmlReader(expandInternalDtd(text))

        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                const version = e.attribute('version')
                const sl = version.split('.')
                const mscVersion = sl.length === 2 ? toInt(sl[0]) * 100 + toInt(sl[1]) : 0
                this.readXml(e, mscVersion)
                return true
            }
        }
        return false
    }

    private readXml(e: XmlReader, mscVersion: number): void {
        let fontIdx = this.fonts.length
        this.m_autoAdjust = false
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'font') {
                const f = new ChordFont()
                f.family = e.attribute('family', 'default')
                if (f.family === 'MuseJazz') {
                    f.family = 'MuseJazz Text'
                } else if (f.family === 'ScoreText') {
                    f.family = this.m_symbolTextFont
                    f.musicSymbolText = true
                }
                f.mag = 1.0
                f.fontClass = e.attribute('class')
                while (e.readNextStartElement()) {
                    if (e.name() === 'sym') {
                        const cs = new ChordSymbol()
                        cs.fontIdx = fontIdx
                        cs.name = e.attribute('name')
                        cs.value = e.attribute('value')
                        const code = e.attribute('code')
                        const symClass = e.attribute('class')
                        if (code !== '') {
                            let [val, ok] = strToInt(code, 0)
                            if (!ok && mscVersion >= 400 && mscVersion < 440) {
                                [val, ok] = strToInt(code, 16)
                            }
                            if (!ok) {
                                cs.code = 0
                                cs.value = code
                            } else if (val >= 0x10000) { // Char::requiresSurrogates
                                cs.code = 0
                                cs.value = String.fromCodePoint(val)
                            } else {
                                cs.code = val
                                cs.value = String.fromCharCode(cs.code)
                            }
                        } else {
                            cs.code = 0
                        }
                        if (cs.value === '') {
                            cs.value = cs.name
                        }
                        cs.name = symClass + cs.name
                        if (!this.m_symbols.has(cs.name)) {
                            this.m_symbols.set(cs.name, cs)
                        }
                        e.readNext()
                    } else if (e.name() === 'mag') {
                        f.mag = e.readDouble()
                    } else {
                        e.unknown()
                    }
                }
                if (this.m_autoAdjust) {
                    if (f.fontClass === 'extension') {
                        f.mag *= this.m_emag
                    } else if (f.fontClass === 'modifier') {
                        f.mag *= this.m_mmag
                    }
                }
                this.fonts.push(f)
                ++fontIdx
            } else if (tag === 'autoAdjust') {
                const nmag = e.attribute('mag')
                if (nmag !== '') {
                    this.m_nmag = toDouble(nmag)
                }
                const nadjust = e.attribute('adjust')
                if (nadjust !== '') {
                    this.m_nadjust = toDouble(nadjust)
                }
                this.m_autoAdjust = e.readBool()
            } else if (tag === 'token') {
                const t = new ChordToken()
                t.read(e, mscVersion)
                this.chordTokenList.push(t)
            } else if (tag === 'chord') {
                let id = e.intAttribute('id')
                // if no id attribute (id == 0), then assign it a private id
                // user chords that match these ChordDescriptions will be treated as normal recognized chords
                // except that the id will not be written to the score file
                const cd = (id && this.m_map.has(id))
                    ? this.take(id)!
                    : new ChordDescription(id)

                // record updated id
                id = cd.id
                // read rest of description
                cd.read(e, mscVersion)
                // restore updated id
                cd.id = id
                // throw away previously parsed chords
                cd.parsedChords = []
                // generate any missing info (including new parsed chords)
                cd.complete(null, this)
                // add to list
                this.insert(id, cd)
            } else if (tag === 'renderRoot') {
                readRenderList(e.readText(), this.renderListRoot, mscVersion)
            } else if (tag === 'renderFunction') {
                readRenderList(e.readText(), this.renderListFunction, mscVersion)
            } else if ((tag === 'renderBase' && mscVersion < 460) || tag === 'renderBass') {
                readRenderList(e.readText(), this.renderListBass, mscVersion)
            } else if (tag === 'renderBassOffset') {
                readRenderList(e.readText(), this.renderListBassOffset, mscVersion)
            } else {
                e.unknown()
            }
        }
    }

    //---------------------------------------------------------
    //   write
    //---------------------------------------------------------

    write(xml: XmlWriter): void {
        // m_symbols is a std::map: iterate sorted by name
        const symbols = [...this.m_symbols.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        let fontIdx = 0
        for (const f of this.fonts) {
            xml.startElement('font', [['id', fontIdx], ['family', f.family]])
            xml.tag('mag', f.mag)
            for (const [, s] of symbols) {
                if (s.fontIdx === fontIdx) {
                    if (s.code === 0) {
                        xml.tag('sym', [['name', s.name], ['value', s.value]])
                    } else {
                        // write hex numbers with a "0x" prefix, so they can convert back properly on read
                        xml.tag('sym', [['name', s.name], ['code', '0x' + s.code.toString(16)]])
                    }
                }
            }
            xml.endElement()
            ++fontIdx
        }
        if (this.m_autoAdjust) {
            const attrs: XmlAttributes = [['mag', this.m_nmag], ['adjust', this.m_nadjust]]
            xml.tag('autoAdjust', attrs)
        }
        for (const t of this.chordTokenList) {
            t.write(xml)
        }
        if (this.renderListRoot.length !== 0) {
            writeRenderList(xml, this.renderListRoot, 'renderRoot')
        }
        if (this.renderListFunction.length !== 0) {
            writeRenderList(xml, this.renderListFunction, 'renderFunction')
        }
        if (this.renderListBass.length !== 0) {
            writeRenderList(xml, this.renderListBass, 'renderBass')
        }
        if (this.renderListBassOffset.length !== 0) {
            writeRenderList(xml, this.renderListBassOffset, 'renderBassOffset')
        }
        for (const [, cd] of this) {
            cd.write(xml)
        }
    }

    // TODO(port): write(name) (writing a chord description file to disk)

    /** C++ write(IODevice*) */
    writeDocument(xml: XmlWriter): boolean {
        xml.startDocument()
        xml.startElement('museScore', [['version', Constants.MSC_VERSION_STR]])

        this.write(xml)

        xml.endElement()

        return true
    }

    //---------------------------------------------------------
    //   loaded
    //---------------------------------------------------------

    loaded(): boolean {
        // track whether a description file has been loaded
        // since chords.xml really doesn't load enough to stand alone,
        // we need a way to track when a "real" chord list has been loaded
        // for lack of anything better, key off renderListRoot
        return this.renderListRoot.length !== 0
    }

    //---------------------------------------------------------
    //   unload
    //---------------------------------------------------------

    unload(): void {
        this.clear()
        this.m_symbols.clear()
        this.fonts = []
        this.renderListRoot = []
        this.renderListBass = []
        this.chordTokenList = []
        this.m_autoAdjust = false
    }

    description(id: number): ChordDescription | null {
        return this.m_map.get(id) ?? null
    }

    symbol(s: string): ChordSymbol {
        const cs = this.m_symbols.get(s)
        return cs ? cs.clone() : new ChordSymbol()
    }

    token(s: string, type: ChordTokenClass): ChordToken {
        for (const tok of this.chordTokenList) {
            if (tok.tokenClass !== type || !tok.names.includes(s)) {
                continue
            }

            return tok.clone()
        }

        return new ChordToken()
    }

    setCustomChordList(t: boolean): void { this.m_customChordList = t }
    customChordList(): boolean { return this.m_customChordList }
}
