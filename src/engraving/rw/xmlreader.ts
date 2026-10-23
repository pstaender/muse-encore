/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/serialization/xmlstreamreader.h/.cpp and
 * src/engraving/rw/xmlreader.h/.cpp
 *
 * The document is tokenized up front into a flat list of tokens; the reader then
 * walks this list with the (QXmlStreamReader like) pull API used by MuseScore.
 */

import { Color } from '../../framework/draw/types/color'
import { PointF, RectF, ScaleF, SizeF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'

export enum TokenType {
    NoToken = 0,
    Invalid,
    StartDocument,
    EndDocument,
    StartElement,
    EndElement,
    Characters,
    Comment,
    DTD,
    Unknown,
}

export interface XmlAttribute {
    name: string
    value: string
}

interface Token {
    type: TokenType
    name: string
    attrs: XmlAttribute[]
    text: string
    /** for start elements: true if <x/> */
    selfClosing: boolean
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(s: string): string {
    if (s.indexOf('&') < 0) {
        return s
    }
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
        if (e[0] === '#') {
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
            return Number.isFinite(code) ? String.fromCodePoint(code) : m
        }
        return ENTITIES[e] ?? m
    })
}

export function toXmlEscaped(s: string): string {
    let r = ''
    for (const c of s) {
        switch (c) {
        case '<': r += '&lt;'; break
        case '>': r += '&gt;'; break
        case '&': r += '&amp;'; break
        case '"': r += '&quot;'; break
        case '\'': r += '&apos;'; break
        default: r += c
        }
    }
    return r
}

function tokenize(src: string): Token[] {
    const tokens: Token[] = []
    const n = src.length
    let i = 0
    const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g

    while (i < n) {
        const lt = src.indexOf('<', i)
        if (lt < 0) {
            const text = src.slice(i)
            if (text.length) {
                tokens.push({ type: TokenType.Characters, name: '', attrs: [], text: decodeEntities(text), selfClosing: false })
            }
            break
        }
        if (lt > i) {
            tokens.push({ type: TokenType.Characters, name: '', attrs: [], text: decodeEntities(src.slice(i, lt)), selfClosing: false })
        }
        if (src.startsWith('<!--', lt)) {
            const end = src.indexOf('-->', lt + 4)
            i = end < 0 ? n : end + 3
            continue
        }
        if (src.startsWith('<![CDATA[', lt)) {
            const end = src.indexOf(']]>', lt + 9)
            const text = src.slice(lt + 9, end < 0 ? n : end)
            tokens.push({ type: TokenType.Characters, name: '', attrs: [], text, selfClosing: false })
            i = end < 0 ? n : end + 3
            continue
        }
        if (src.startsWith('<?', lt)) {
            const end = src.indexOf('?>', lt + 2)
            i = end < 0 ? n : end + 2
            continue
        }
        if (src.startsWith('<!', lt)) {
            const end = src.indexOf('>', lt + 2)
            i = end < 0 ? n : end + 1
            continue
        }
        // find end of tag, respecting quoted attribute values
        let j = lt + 1
        let quote = ''
        for (; j < n; ++j) {
            const c = src[j]
            if (quote) {
                if (c === quote) {
                    quote = ''
                }
            } else if (c === '"' || c === '\'') {
                quote = c
            } else if (c === '>') {
                break
            }
        }
        const inner = src.slice(lt + 1, j)
        i = j + 1
        if (inner[0] === '/') {
            tokens.push({ type: TokenType.EndElement, name: inner.slice(1).trim(), attrs: [], text: '', selfClosing: false })
            continue
        }
        const selfClosing = inner.endsWith('/')
        const body = selfClosing ? inner.slice(0, -1) : inner
        const m = body.match(/^\s*([^\s/>]+)/)
        const name = m ? m[1] : ''
        const attrs: XmlAttribute[] = []
        attrRe.lastIndex = m ? m[0].length : 0
        let am: RegExpExecArray | null
        while ((am = attrRe.exec(body)) !== null) {
            attrs.push({ name: am[1], value: decodeEntities(am[3] ?? am[4] ?? '') })
        }
        tokens.push({ type: TokenType.StartElement, name, attrs, text: '', selfClosing })
        if (selfClosing) {
            tokens.push({ type: TokenType.EndElement, name, attrs: [], text: '', selfClosing: false })
        }
    }
    return tokens
}

function isWhitespaceStr(s: string): boolean {
    return /^\s*$/.test(s)
}

export class XmlStreamReader {
    protected m_tokens: Token[] = []
    protected m_pos = -1
    private m_error = ''

    constructor(data?: string | Uint8Array | ArrayBuffer) {
        if (data !== undefined) {
            this.setData(data)
        }
    }

    setData(data: string | Uint8Array | ArrayBuffer): void {
        const s = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data)
        this.m_tokens = tokenize(s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s)
        this.m_pos = -1
    }

    private cur(): Token | undefined { return this.m_tokens[this.m_pos] }

    tokenType(): TokenType {
        if (this.m_pos < 0) {
            return TokenType.StartDocument
        }
        const t = this.cur()
        return t ? t.type : TokenType.EndDocument
    }

    tokenString(): string { return TokenType[this.tokenType()] }

    isStartElement(): boolean { return this.tokenType() === TokenType.StartElement }
    isEndElement(): boolean { return this.tokenType() === TokenType.EndElement }
    isCharacters(): boolean { return this.tokenType() === TokenType.Characters }
    isWhitespace(): boolean {
        const t = this.cur()
        return !!t && t.type === TokenType.Characters && isWhitespaceStr(t.text)
    }

    atEnd(): boolean { return this.m_pos >= this.m_tokens.length }

    readNext(): TokenType {
        if (this.m_pos < this.m_tokens.length) {
            this.m_pos++
        }
        return this.tokenType()
    }

    readNextStartElement(): boolean {
        for (;;) {
            const t = this.readNext()
            if (t === TokenType.StartElement) {
                return true
            }
            if (t === TokenType.EndElement || t === TokenType.EndDocument || t === TokenType.Invalid) {
                return false
            }
        }
    }

    skipCurrentElement(): void {
        let depth = 1
        while (depth) {
            const t = this.readNext()
            if (t === TokenType.StartElement) {
                ++depth
            } else if (t === TokenType.EndElement) {
                --depth
            } else if (t === TokenType.EndDocument) {
                return
            }
        }
    }

    name(): string {
        const t = this.cur()
        return t ? t.name : ''
    }

    attributes(): XmlAttribute[] {
        const t = this.cur()
        return t ? t.attrs : []
    }

    hasAttribute(name: string): boolean {
        return this.attributes().some(a => a.name === name)
    }

    attribute(name: string, def = ''): string {
        const a = this.attributes().find(x => x.name === name)
        return a ? a.value : def
    }

    asciiAttribute(name: string, def = ''): string {
        return this.attribute(name, def)
    }

    intAttribute(name: string, def = 0): number {
        const a = this.attributes().find(x => x.name === name)
        if (!a) {
            return def
        }
        const v = parseInt(a.value, 10)
        return Number.isNaN(v) ? def : v
    }

    doubleAttribute(name: string, def = 0): number {
        const a = this.attributes().find(x => x.name === name)
        if (!a) {
            return def
        }
        const v = parseFloat(a.value)
        return Number.isNaN(v) ? def : v
    }

    noChildren(): boolean {
        const t = this.cur()
        if (!t || t.type !== TokenType.StartElement) {
            return true
        }
        if (t.selfClosing) {
            return true
        }
        const next = this.m_tokens[this.m_pos + 1]
        return !!next && next.type === TokenType.EndElement
    }

    text(): string {
        const t = this.cur()
        return t && t.type === TokenType.Characters ? t.text : ''
    }

    /** Reads the text of the current element and moves to its end element */
    readText(): string {
        if (this.tokenType() !== TokenType.StartElement) {
            return ''
        }
        let result = ''
        let depth = 1
        while (depth) {
            const t = this.readNext()
            if (t === TokenType.Characters) {
                if (depth === 1) {
                    result += this.text()
                }
            } else if (t === TokenType.StartElement) {
                ++depth
            } else if (t === TokenType.EndElement) {
                --depth
            } else if (t === TokenType.EndDocument) {
                break
            }
        }
        return result
    }

    readAsciiText(): string { return this.readText() }

    readInt(): number {
        const v = parseInt(this.readText().trim(), 10)
        return Number.isNaN(v) ? 0 : v
    }

    readDouble(): number {
        const v = parseFloat(this.readText().trim())
        return Number.isNaN(v) ? 0 : v
    }

    error(): boolean { return this.m_error !== '' }
    isError(): boolean { return this.m_error !== '' }
    errorString(): string { return this.m_error }
    raiseError(message: string): void { this.m_error = message }
}

export class XmlReader extends XmlStreamReader {
    private m_docName = ''

    setDocName(s: string): void { this.m_docName = s }
    docName(): string { return this.m_docName }

    /** unknown tag read */
    unknown(): void {
        // LOGD() << "tag in <" << m_docName << ">: " << name();
        this.skipCurrentElement()
    }

    readBool(): boolean { return this.readInt() !== 0 }

    readDoubleClamped(min: number, max: number): number {
        let val = this.readDouble()
        if (val < min) {
            val = min
        } else if (val > max) {
            val = max
        }
        return val
    }

    readPoint(): PointF {
        const x = this.doubleAttribute('x', 0.0)
        const y = this.doubleAttribute('y', 0.0)
        this.skipCurrentElement()
        return new PointF(x, y)
    }

    readColor(): Color {
        const c = new Color()
        c.setRed(this.intAttribute('r'))
        c.setGreen(this.intAttribute('g'))
        c.setBlue(this.intAttribute('b'))
        c.setAlpha(this.intAttribute('a', 255))
        this.skipCurrentElement()
        return c
    }

    readSize(): SizeF {
        const p = new SizeF(this.doubleAttribute('w', 0.0), this.doubleAttribute('h', 0.0))
        this.skipCurrentElement()
        return p
    }

    readScale(): ScaleF {
        const p = new ScaleF(this.doubleAttribute('w', 0.0), this.doubleAttribute('h', 0.0))
        this.skipCurrentElement()
        return p
    }

    readRect(): RectF {
        const p = new RectF()
        p.setLeft(this.doubleAttribute('x', 0.0))
        p.setTop(this.doubleAttribute('y', 0.0))
        p.setWidth(this.doubleAttribute('w', 0.0))
        p.setHeight(this.doubleAttribute('h', 0.0))
        this.skipCurrentElement()
        return p
    }

    /**
     * recognizes this two styles:
     *    <move z="2" n="4"/>     (old style)
     *    <move>2/4</move>        (new style)
     */
    readFraction(): Fraction {
        let z = this.intAttribute('z', 0)
        let n = this.intAttribute('n', 1)
        const s = this.readText().trim()
        if (s.length) {
            const i = s.indexOf('/')
            if (i < 0) {
                return Fraction.fromTicks(parseInt(s, 10) || 0)
            }
            z = parseInt(s.slice(0, i), 10) || 0
            n = parseInt(s.slice(i + 1), 10) || 0
        }
        return new Fraction(z, n)
    }

    private htmlToString(level: number, out: { s: string }): void {
        const selfClosing = this.noChildren()
        out.s += '<' + this.name()
        for (const a of this.attributes()) {
            out.s += ' ' + a.name + '="' + a.value + '"'
        }
        out.s += selfClosing ? '/>' : '>'
        ++level
        for (;;) {
            const t = this.readNext()
            switch (t) {
            case TokenType.StartElement:
                this.htmlToString(level, out)
                break
            case TokenType.EndElement:
                if (!selfClosing) {
                    out.s += '</' + this.name() + '>'
                }
                --level
                return
            case TokenType.Characters:
                if (out.s.length || !this.isWhitespace()) {
                    out.s += toXmlEscaped(this.text())
                }
                break
            default:
                return
            }
        }
    }

    /**
     * read206 TextReaderContext206: returns a reader for the current element (positioned at its start tag)
     * and the element's inner xml; this reader continues after the element
     */
    readSubReader(): { reader: XmlReader; xml: string } {
        const start = this.m_pos
        const xml = this.readXml()
        const r = new XmlReader()
        r.m_tokens = this.m_tokens.slice(start, this.m_pos + 1)
        r.m_pos = 0
        r.setDocName(this.docName())
        return { reader: r, xml }
    }

    /** read verbatim until end tag of current level is reached */
    readXml(): string {
        const out = { s: '' }
        for (let t = this.readNext(); t !== TokenType.EndElement; t = this.readNext()) {
            switch (t) {
            case TokenType.StartElement:
                this.htmlToString(1, out)
                break
            case TokenType.Characters:
                if (!this.isWhitespace()) {
                    out.s += toXmlEscaped(this.text())
                }
                break
            default:
                return out.s
            }
        }
        return out.s
    }
}
