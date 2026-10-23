/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/htmlparser.h/.cpp (compatibility with the old html text implementation)
 */

function lastIndexOfAny(s: string, chars: string): number {
    for (let i = s.length - 1; i >= 0; --i) {
        if (chars.includes(s[i])) {
            return i
        }
    }
    return -1
}

export class HtmlParser {
    static parse(inHtml: string): string {
        if (!inHtml) {
            return inHtml
        }

        const html = inHtml

        //! NOTE Get body
        const bodyB = html.indexOf('<body')
        const bodyE = lastIndexOfAny(html, '</body>') // sic: C++ std::string::find_last_of
        if (bodyB < 0 || bodyE < 0) {
            return inHtml
        }
        const body = html.substring(bodyB, bodyE)

        const blocks: string[] = []

        //! NOTE Split blocks
        let pB = 0
        let pE = 0
        while (true) {
            pB = body.indexOf('<p', pE)
            if (pB < 0) {
                break
            }
            pE = body.indexOf('/p>', pB)
            if (pE < 0) {
                break
            }
            blocks.push(body.substring(pB, pE))
        }

        if (!blocks.length) {
            blocks.push(body)
        }

        //! NOTE Format blocks
        const extractText = (block: string): string => {
            let text = ''
            let isTag = false
            for (const c of block) {
                if (c === '<') {
                    isTag = true
                } else if (c === '>') {
                    isTag = false
                } else if (!isTag) {
                    text += c
                }
            }
            return text
        }

        const extractFont = (block: string): string => {
            const fontsizeB = block.indexOf('font-size')
            if (fontsizeB >= 0) {
                let fontSize = ''
                let started = false
                for (let i = fontsizeB; i < block.length; ++i) {
                    const c = block[i]
                    if ('.0123456789'.includes(c)) {
                        started = true
                        fontSize += c
                    } else if (started) {
                        break
                    }
                }
                return `<font size="${fontSize}"/>`
            }
            return ''
        }

        const formatRichText = (block: string): string => {
            let text = extractText(block)
            const font = extractFont(block)
            if (font) {
                text = font + text
            }
            return text
        }

        //! NOTE Format rich text from blocks
        let text = ''
        for (const block of blocks) {
            if (text) {
                text += '\n'
            }
            text += formatRichText(block)
        }

        // replaces the first occurrence only (like C++)
        const replaceSym = (cc: number, sym: string): void => {
            text = text.replace(String.fromCharCode(cc), sym)
        }

        replaceSym(0xe10e, '<sym>accidentalNatural</sym>') // natural
        replaceSym(0xe10c, '<sym>accidentalSharp</sym>') // sharp
        replaceSym(0xe10d, '<sym>accidentalFlat</sym>') // flat
        replaceSym(0xe104, '<sym>metNoteHalfUp</sym>') // note2_Sym
        replaceSym(0xe105, '<sym>metNoteQuarterUp</sym>') // note4_Sym
        replaceSym(0xe106, '<sym>metNote8thUp</sym>') // note8_Sym
        replaceSym(0xe107, '<sym>metNote16thUp</sym>') // note16_Sym
        replaceSym(0xe108, '<sym>metNote32ndUp</sym>') // note32_Sym
        replaceSym(0xe109, '<sym>metNote64thUp</sym>') // note64_Sym
        replaceSym(0xe10a, '<sym>metAugmentationDot</sym>') // dot
        replaceSym(0xe10b, '<sym>metAugmentationDot</sym><sym>space</sym><sym>metAugmentationDot</sym>') // dotdot
        replaceSym(0xe167, '<sym>segno</sym>') // segno
        replaceSym(0xe168, '<sym>coda</sym>') // coda
        replaceSym(0xe169, '<sym>codaSquare</sym>') // varcoda

        return text
    }
}
