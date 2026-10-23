/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement of MuseScore's thirdparty/rtf2html (used by the Capella import for the rich text objects of .cap files).
 * TODO(port): rtf2html is not ported. MuseScore converts the RTF into an HTML document (with a <style> head, tables,
 * fonts and colors) and passes it to TextBase::setXmlText; here the RTF is converted into MuseScore's text markup
 * instead: the text of the document (without the font/color/style tables and other destinations), \par and \line as
 * line breaks, bold, italic and underline.
 */

import { XmlWriter } from '../../../engraving/rw/xmlwriter'

const DESTINATIONS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr',
    'footerl', 'footerr', 'footnote', 'field', 'fldinst', 'xe', 'tc', 'listtable', 'listoverridetable', 'rsidtbl',
    'generator', 'latentstyles', 'themedata', 'colorschememapping', 'datastore', 'filetbl', 'revtbl',
])

interface RtfState {
    skip: boolean
    bold: boolean
    italic: boolean
    underline: boolean
    uc: number
}

export function rtf2html(rtf: string): string {
    let out = ''
    const open = { bold: false, italic: false, underline: false }
    let state: RtfState = { skip: false, bold: false, italic: false, underline: false, uc: 1 }
    const stack: RtfState[] = []
    let skipChars = 0

    const syncFormat = (): void => {
        // close in reverse order, then open what is set
        if (open.underline && !state.underline) {
            out += '</u>'
            open.underline = false
        }
        if (open.italic && !state.italic) {
            out += '</i>'
            open.italic = false
        }
        if (open.bold && !state.bold) {
            out += '</b>'
            open.bold = false
        }
        if (!open.bold && state.bold) {
            out += '<b>'
            open.bold = true
        }
        if (!open.italic && state.italic) {
            out += '<i>'
            open.italic = true
        }
        if (!open.underline && state.underline) {
            out += '<u>'
            open.underline = true
        }
    }
    const write = (s: string): void => {
        if (state.skip) {
            return
        }
        if (skipChars > 0) {
            --skipChars
            return
        }
        syncFormat()
        out += XmlWriter.xmlString(s)
    }

    let i = 0
    const n = rtf.length
    while (i < n) {
        const c = rtf[i]
        if (c === '{') {
            stack.push({ ...state })
            ++i
            if (rtf.startsWith('\\*', i)) {
                state.skip = true
                i += 2
            }
        } else if (c === '}') {
            state = stack.pop() ?? state
            ++i
        } else if (c === '\\') {
            const next = rtf[i + 1] ?? ''
            if (next === '\'') {
                write(String.fromCharCode(parseInt(rtf.substr(i + 2, 2), 16)))
                i += 4
            } else if (/[a-zA-Z]/.test(next)) {
                const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i))!
                const word = m[1]
                const param = m[2] !== undefined ? parseInt(m[2], 10) : null
                i += m[0].length
                if (DESTINATIONS.has(word)) {
                    state.skip = true
                } else if (word === 'par' || word === 'line') {
                    if (!state.skip) {
                        out += '\n'
                    }
                } else if (word === 'tab') {
                    write('\t')
                } else if (word === 'b') {
                    state.bold = param !== 0
                } else if (word === 'i') {
                    state.italic = param !== 0
                } else if (word === 'ul') {
                    state.underline = param !== 0
                } else if (word === 'ulnone') {
                    state.underline = false
                } else if (word === 'plain') {
                    state.bold = state.italic = state.underline = false
                } else if (word === 'uc') {
                    state.uc = param ?? 1
                } else if (word === 'u' && param !== null) {
                    write(String.fromCharCode(param < 0 ? param + 65536 : param))
                    skipChars = state.uc
                }
            } else {
                // control symbols: \\, \{, \}, \~ ...
                if (next === '\\' || next === '{' || next === '}') {
                    write(next)
                } else if (next === '~') {
                    write(' ')
                }
                i += 2
            }
        } else if (c === '\r' || c === '\n') {
            ++i
        } else {
            write(c)
            ++i
        }
    }
    state = { skip: false, bold: false, italic: false, underline: false, uc: 1 }
    syncFormat()
    return out.replace(/\n+$/, '')
}
