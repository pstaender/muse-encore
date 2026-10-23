/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/shared/musicxmlfonthandler.h/.cpp
 *
 * MusicXML font handling support. The C++ std::list<TextFragment> are arrays here.
 */

import { CharFormat, TextFragment } from '../../../../engraving/dom/textbase'
import type { XmlWriter } from '../../../../engraving/rw/xmlwriter'

/** C++ String::arg(double): String::number(val, 6) */
function numberArg(v: number): string {
    let s = v.toFixed(6)
    if (s.includes('.')) {
        s = s.replace(/0+$/, '').replace(/\.$/, '')
    }
    return s === '-0' ? '0' : s
}

//---------------------------------------------------------
//   plainTextPlusSymbolsSize
//---------------------------------------------------------

function plainTextPlusSymbolsFragmentSize(f: TextFragment): number {
    return f.columns()
}

function plainTextPlusSymbolsListSize(list: readonly TextFragment[]): number {
    let res = 0
    for (const f of list) {
        res += plainTextPlusSymbolsFragmentSize(f)
    }
    return res
}

//---------------------------------------------------------
//   attribute
//    add one attribute if necessary
//---------------------------------------------------------

function attribute(needed: boolean, value: boolean, trueString: string, falseString: string): string {
    let res = ''
    if (needed) {
        res = value ? trueString : falseString
    }
    if (res) {
        res = ' ' + res
    }
    return res
}

//---------------------------------------------------------
//   MScoreTextToMusicXml
//---------------------------------------------------------

export class MScoreTextToMusicXml {
    private attribs: string
    private tagname: string
    private oldFormat: CharFormat
    private newFormat = new CharFormat()
    private musicalTextFont: string

    constructor(tag: string, attr: string, defFmt: CharFormat, mtf: string) {
        this.attribs = attr
        this.tagname = tag
        this.oldFormat = defFmt.clone()
        this.musicalTextFont = mtf
        // set MusicXML defaults
        this.oldFormat.setBold(false)
        this.oldFormat.setItalic(false)
        this.oldFormat.setUnderline(false)
    }

    //---------------------------------------------------------
    //   toPlainText
    //    convert to plain text
    //    naive implementation: simply remove all chars from '<' to '>'
    //    typically used to remove formatting info from fields read
    //    from MuseScore 1.3 file where they are stored as html, such as
    //    part name and shortName
    //---------------------------------------------------------

    static toPlainText(text: string): string {
        let res = ''
        let inElem = false
        for (const ch of text) {
            if (ch === '<') {
                inElem = true
            } else if (ch === '>') {
                inElem = false
            } else {
                if (!inElem) {
                    res += ch
                }
            }
        }
        return res
    }

    //---------------------------------------------------------
    //   toPlainTextPlusSymbols
    //    convert to plain text plus <sym>[name]</sym> encoded symbols
    //---------------------------------------------------------

    static toPlainTextPlusSymbols(list: readonly TextFragment[]): string {
        let res = ''
        for (const f of list) {
            res += f.text
        }
        return res
    }

    //---------------------------------------------------------
    //   split
    //---------------------------------------------------------

    /**
     Split \a in into \a left, \a mid and \a right. Mid starts at \a pos and is \a len characters long.
     Pos and len refer to the representation returned by toPlainTextPlusSymbols().
     TODO Make sure surrogate pairs are handled correctly
     Return true if OK, false on error.
     */
    static split(input: readonly TextFragment[], pos: number, len: number,
        left: TextFragment[], mid: TextFragment[], right: TextFragment[]): boolean {
        if (pos < 0 || len < 0) {
            return false
        }

        // ensure output is empty at start
        left.length = 0
        mid.length = 0
        right.length = 0

        // set pos to begin of first fragment
        let fragmentNr = 0
        let fragment = new TextFragment()
        if (fragmentNr < input.length) {
            fragment = input[fragmentNr].clone()
        }
        let currentDest = left
        let currentMaxSize = pos

        // while text left
        while (fragmentNr < input.length) {
            const destSize = plainTextPlusSymbolsListSize(currentDest)
            const fragSize = plainTextPlusSymbolsFragmentSize(fragment)
            // if no room left in current destination (check applies only to left and mid)
            if ((currentDest !== right && destSize >= currentMaxSize)
                || currentDest === right) {
                // move to next destination
                if (currentDest === left) {
                    currentDest = mid
                    currentMaxSize = len
                } else if (currentDest === mid) {
                    currentDest = right
                }
            }
            // if current fragment fits in current destination (check applies only to left and mid)
            if ((currentDest !== right && destSize + fragSize <= currentMaxSize)
                || currentDest === right) {
                // add it
                currentDest.push(fragment)
                // move to next fragment
                fragmentNr++
                if (fragmentNr < input.length) {
                    fragment = input[fragmentNr].clone()
                }
            } else {
                // split current fragment
                const rightPart = fragment.split(currentMaxSize - plainTextPlusSymbolsListSize(currentDest))
                // add first part to current destination
                currentDest.push(fragment)
                fragment = rightPart
            }
        }

        return true
    }

    //---------------------------------------------------------
    //   writeTextFragments
    //---------------------------------------------------------

    writeTextFragments(fr: readonly TextFragment[], xml: XmlWriter): void {
        let firstTime = true // write additional attributes only the first time characters are written
        for (const f of fr) {
            this.newFormat = f.format.clone()
            const formatAttr = this.updateFormat()
            xml.tagRaw(this.tagname + (firstTime ? this.attribs : '') + formatAttr, f.text)
            firstTime = false
        }
    }

    //---------------------------------------------------------
    //   updateFormat
    //    update the text format by generating attributes
    //    corresponding to the difference between old- and newFormat
    //    copy newFormat to oldFormat
    //---------------------------------------------------------

    private updateFormat(): string {
        if (this.newFormat.fontFamily() === 'ScoreText') {
            this.newFormat.setFontFamily(this.musicalTextFont)
        }
        const n = this.newFormat
        const o = this.oldFormat
        let res = ''
        res += attribute(n.bold() !== o.bold(), n.bold(), 'font-weight="bold"', 'font-weight="normal"')
        res += attribute(n.italic() !== o.italic(), n.italic(), 'font-style="italic"', 'font-style="normal"')
        res += attribute(n.underline() !== o.underline(), n.underline(), 'underline="1"', 'underline="0"')
        res += attribute(n.strike() !== o.strike(), n.strike(), 'line-through="1"', 'line-though="0"')
        res += attribute(n.fontFamily() !== o.fontFamily(), true, `font-family="${n.fontFamily()}"`, '')
        const needSize = n.fontSize() < 0.99 * o.fontSize() || n.fontSize() > 1.01 * o.fontSize()
        res += attribute(needSize, true, `font-size="${numberArg(n.fontSize())}"`, '')
        this.oldFormat = this.newFormat.clone()
        return res
    }
}
