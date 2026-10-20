/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/pageformat.h/.cpp
 */

import { SizeF } from '../../framework/draw/types/geometry'
import { PPI } from '../types/types'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'
import type { XmlReader } from '../rw/xmlreader'

export class PageFormat {
    private m_size = new SizeF()
    private m_printableWidth = 0 // _width - left margin - right margin
    private m_evenLeftMargin = 0 // values in inch
    private m_oddLeftMargin = 0
    private m_evenTopMargin = 0
    private m_evenBottomMargin = 0
    private m_oddTopMargin = 0
    private m_oddBottomMargin = 0
    private m_twosided = false

    //---------------------------------------------------------
    //   read
    //  <page-layout>
    //      <page-height>
    //      <page-width>
    //      <landscape>1</landscape>
    //      <page-margins type="both">
    //         <left-margin>28.3465</left-margin>
    //         <right-margin>28.3465</right-margin>
    //         <top-margin>28.3465</top-margin>
    //         <bottom-margin>56.6929</bottom-margin>
    //         </page-margins>
    //      </page-layout>
    //---------------------------------------------------------

    read206(e: XmlReader): void {
        let oddRightMargin = 0.0
        let evenRightMargin = 0.0

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'page-margins') {
                const type = e.asciiAttribute('type', 'both')
                let lm = 0.0, rm = 0.0, tm = 0.0, bm = 0.0
                while (e.readNextStartElement()) {
                    const t = e.name()
                    const val = e.readDouble() * 0.5 / PPI
                    if (t === 'left-margin') {
                        lm = val
                    } else if (t === 'right-margin') {
                        rm = val
                    } else if (t === 'top-margin') {
                        tm = val
                    } else if (t === 'bottom-margin') {
                        bm = val
                    } else {
                        e.unknown()
                    }
                }
                this.m_twosided = type === 'odd' || type === 'even'
                if (type === 'odd' || type === 'both') {
                    this.m_oddLeftMargin = lm
                    oddRightMargin = rm
                    this.m_oddTopMargin = tm
                    this.m_oddBottomMargin = bm
                }
                if (type === 'even' || type === 'both') {
                    this.m_evenLeftMargin = lm
                    evenRightMargin = rm
                    this.m_evenTopMargin = tm
                    this.m_evenBottomMargin = bm
                }
            } else if (tag === 'page-height') {
                this.m_size.setHeight(e.readDouble() * 0.5 / PPI)
            } else if (tag === 'page-width') {
                this.m_size.setWidth(e.readDouble() * 0.5 / PPI)
            } else {
                e.unknown()
            }
        }
        const w1 = this.m_size.width() - this.m_oddLeftMargin - oddRightMargin
        const w2 = this.m_size.width() - this.m_evenLeftMargin - evenRightMargin
        this.m_printableWidth = Math.min(w1, w2) // silently adjust right margins
    }

    init(style: MStyle): void {
        this.m_size = new SizeF(style.styleD(Sid.pageWidth), style.styleD(Sid.pageHeight))
        this.m_printableWidth = style.styleD(Sid.pagePrintableWidth)
        this.m_evenLeftMargin = style.styleD(Sid.pageEvenLeftMargin)
        this.m_oddLeftMargin = style.styleD(Sid.pageOddLeftMargin)
        this.m_evenTopMargin = style.styleD(Sid.pageEvenTopMargin)
        this.m_evenBottomMargin = style.styleD(Sid.pageEvenBottomMargin)
        this.m_oddTopMargin = style.styleD(Sid.pageOddTopMargin)
        this.m_oddBottomMargin = style.styleD(Sid.pageOddBottomMargin)
        this.m_twosided = style.styleB(Sid.pageTwosided)
    }

    apply(style: MStyle): void {
        style.set(Sid.pageWidth, this.m_size.width())
        style.set(Sid.pageHeight, this.m_size.height())
        style.set(Sid.pagePrintableWidth, this.m_printableWidth)
        style.set(Sid.pageEvenLeftMargin, this.m_evenLeftMargin)
        style.set(Sid.pageOddLeftMargin, this.m_oddLeftMargin)
        style.set(Sid.pageEvenTopMargin, this.m_evenTopMargin)
        style.set(Sid.pageEvenBottomMargin, this.m_evenBottomMargin)
        style.set(Sid.pageOddTopMargin, this.m_oddTopMargin)
        style.set(Sid.pageOddBottomMargin, this.m_oddBottomMargin)
        style.set(Sid.pageTwosided, this.m_twosided)
    }
}

/** C++ initPageFormat() + PageFormat::read206() + setPageFormat() */
export function readPageFormat206(style: MStyle, e: XmlReader): void {
    const pf = new PageFormat()
    pf.init(style)
    pf.read206(e)
    pf.apply(style)
}
