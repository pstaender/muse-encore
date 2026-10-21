/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/serialization/xmlstreamwriter.h/.cpp (and the number formatting of TextStream)
 *
 * The C++ Value is a variant of integer types, double and strings. TypeScript only has `number`: integral numbers are
 * written like C++ integers, all others like a double (TextStream: std::to_chars general format, precision 6).
 * Booleans are written as 0/1 (in C++ they convert to int).
 */

export type XmlValue = number | boolean | string | null | undefined
export type XmlAttributes = ReadonlyArray<readonly [string, XmlValue]>

/** TextStream::operator<<(double): like printf("%g") (std::to_chars general, precision 6) */
export function formatDouble(v: number): string {
    if (Number.isNaN(v)) {
        return 'nan'
    }
    if (!Number.isFinite(v)) {
        return v < 0 ? '-inf' : 'inf'
    }
    if (v === 0) {
        return Object.is(v, -0) ? '-0' : '0'
    }
    const precision = 6
    const exp = v.toExponential(precision - 1) // d.ddddde±x, rounded like %g
    const ePos = exp.indexOf('e')
    const x = parseInt(exp.slice(ePos + 1), 10)
    if (x < -4 || x >= precision) {
        let mantissa = exp.slice(0, ePos)
        if (mantissa.includes('.')) {
            mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '')
        }
        const ax = Math.abs(x)
        return `${mantissa}e${x < 0 ? '-' : '+'}${ax < 10 ? '0' : ''}${ax}`
    }
    let s = v.toFixed(precision - 1 - x)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s
}

/** TextStream output of a Value */
export function formatValue(v: XmlValue): string {
    if (v === null || v === undefined) {
        return ''
    }
    if (typeof v === 'boolean') {
        return v ? '1' : '0'
    }
    if (typeof v === 'number') {
        if (Number.isInteger(v) && !Object.is(v, -0)) {
            return String(v)
        }
        return formatDouble(v)
    }
    return v
}

export class XmlStreamWriter {
    private m_stack: string[] = []
    private m_chunks: string[] = []

    /** the written text (C++ writes into an IODevice) */
    text(): string {
        return this.m_chunks.join('')
    }

    flush(): void {
    }

    protected write(s: string): void {
        this.m_chunks.push(s)
    }

    private putLevel(): void {
        this.m_chunks.push(' '.repeat(this.m_stack.length * 2))
    }

    startDocument(): void {
        this.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    }

    writeDoctype(type: string): void {
        this.write(`<!DOCTYPE ${type}>\n`)
    }

    static escapeCodePoint(c: number): string {
        switch (c) {
        case 0x3C: return '&lt;'
        case 0x3E: return '&gt;'
        case 0x26: return '&amp;'
        case 0x22: return '&quot;'
        default:
            // ignore invalid characters in xml 1.0
            if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) {
                return ''
            }
            return String.fromCodePoint(c)
        }
    }

    static escapeString(str: string): string {
        // fast path: nothing to escape
        if (!/[<>&"\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(str)) {
            return str
        }
        let escaped = ''
        for (const ch of str) {
            escaped += XmlStreamWriter.escapeCodePoint(ch.codePointAt(0)!)
        }
        return escaped
    }

    protected writeValue(v: XmlValue): void {
        if (typeof v === 'string') {
            this.write(XmlStreamWriter.escapeString(v))
        } else {
            this.write(formatValue(v))
        }
    }

    private writeAttributes(attrs: XmlAttributes): void {
        for (const [name, value] of attrs) {
            this.write(` ${name}="`)
            this.writeValue(value)
            this.write('"')
        }
    }

    startElement(name: string, attrs: XmlAttributes = []): void {
        this.putLevel()
        this.write('<' + name)
        this.writeAttributes(attrs)
        this.write('>\n')
        this.m_stack.push(name)
    }

    startElementRaw(name: string): void {
        this.putLevel()
        this.write(`<${name}>\n`)
        this.m_stack.push(name.split(' ')[0])
    }

    endElement(): void {
        this.putLevel()
        this.write(`</${this.m_stack.pop()}>\n`)
    }

    /** <element attr="value" /> */
    elementAttrs(name: string, attrs: XmlAttributes): void {
        this.putLevel()
        this.write('<' + name)
        this.writeAttributes(attrs)
        this.write('/>\n')
    }

    /** <element>body</element> */
    element(name: string, body: XmlValue): void {
        this.putLevel()
        this.write(`<${name}>`)
        this.writeValue(body)
        this.write(`</${name}>\n`)
    }

    elementAttrsBody(name: string, attrs: XmlAttributes, body: XmlValue): void {
        this.putLevel()
        this.write('<' + name)
        this.writeAttributes(attrs)
        this.write('>')
        this.writeValue(body)
        this.write(`</${name}>\n`)
    }

    elementRaw(nameWithAttributes: string, body: XmlValue = undefined): void {
        this.putLevel()
        if (body === undefined || body === null) {
            this.write(`<${nameWithAttributes}/>\n`)
        } else {
            const ename = nameWithAttributes.split(' ')[0]
            this.write(`<${nameWithAttributes}>`)
            this.writeValue(body)
            this.write(`</${ename}>\n`)
        }
    }

    elementStringRaw(nameWithAttributes: string, body: string): void {
        this.putLevel()
        if (!body) {
            this.write(`<${nameWithAttributes}/>\n`)
        } else {
            const ename = nameWithAttributes.split(' ')[0]
            this.write(`<${nameWithAttributes}>${body}</${ename}>\n`)
        }
    }

    comment(text: string): void {
        this.putLevel()
        this.write(`<!-- ${text} -->\n`)
    }
}
