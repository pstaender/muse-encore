/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/headerfooterlayout.h/.cpp
 *
 * TODO(port): file info macros ($f, $F, $m, $M, $D without creationDate) use placeholders,
 * $v/$r use the version the file was written with
 */

import type { PointF } from '../../../framework/draw/types/geometry'

import { Align, AlignH, AlignV, DPMM, MAX_FOOTERS, MAX_HEADERS, TextStyleType, type FontStyle } from '../../types/types'
import { Sid } from '../../style/styledef'
import { ElementFlag } from '../../dom/engravingitem'
import { LayoutMode, type Score } from '../../dom/score'
import { Text } from '../../dom/text'
import { CharFormat, TextBlock, TextFragment } from '../../dom/textbase'
import type { MasterScore } from '../../dom/masterscore'
import type { Page } from '../../dom/page'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'

const isoDate = (d: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export class HeaderFooterLayout {
    static layoutHeaderFooter(ctx: LayoutContext, page: Page): void {
        const isPageMode = ctx.conf().isMode(LayoutMode.PAGE) || ctx.conf().isMode(LayoutMode.FLOAT)
        if (!isPageMode) {
            return
        }

        const n = page.pageNumber() + 1 + page.score().pageNumberOffset()

        if (ctx.conf().styleB(Sid.showHeader) && (page.pageNumber() || ctx.conf().styleB(Sid.headerFirstPage))) {
            const odd = (n & 1) !== 0 || !ctx.conf().styleB(Sid.headerOddEven)
            HeaderFooterLayout.createUpdateHeaderText(ctx, page, 0, ctx.conf().styleSt(odd ? Sid.oddHeaderL : Sid.evenHeaderL))
            HeaderFooterLayout.createUpdateHeaderText(ctx, page, 1, ctx.conf().styleSt(odd ? Sid.oddHeaderC : Sid.evenHeaderC))
            HeaderFooterLayout.createUpdateHeaderText(ctx, page, 2, ctx.conf().styleSt(odd ? Sid.oddHeaderR : Sid.evenHeaderR))
        } else {
            for (let area = 0; area < MAX_HEADERS; ++area) {
                HeaderFooterLayout.removeHeaderText(page, area)
            }
        }

        if (ctx.conf().styleB(Sid.showFooter) && (page.pageNumber() || ctx.conf().styleB(Sid.footerFirstPage))) {
            const odd = (n & 1) !== 0 || !ctx.conf().styleB(Sid.footerOddEven)
            HeaderFooterLayout.createUpdateFooterText(ctx, page, 0, ctx.conf().styleSt(odd ? Sid.oddFooterL : Sid.evenFooterL))
            HeaderFooterLayout.createUpdateFooterText(ctx, page, 1, ctx.conf().styleSt(odd ? Sid.oddFooterC : Sid.evenFooterC))
            HeaderFooterLayout.createUpdateFooterText(ctx, page, 2, ctx.conf().styleSt(odd ? Sid.oddFooterR : Sid.evenFooterR))
        } else {
            for (let area = 0; area < MAX_FOOTERS; ++area) {
                HeaderFooterLayout.removeFooterText(page, area)
            }
        }
    }

    private static createText(page: Page, tid: TextStyleType, align: Align): Text {
        const text = new Text(page, tid)
        text.setParent(page)
        text.setFlag(ElementFlag.MOVABLE, false)
        text.setFlag(ElementFlag.GENERATED, true) // set to disable editing
        text.setLayoutToParentWidth(true)
        text.setAlign(align)
        text.setPosition(align.horizontal)
        return text
    }

    private static createUpdateHeaderText(ctx: LayoutContext, page: Page, area: number, s: string): void {
        if (s.length === 0) {
            HeaderFooterLayout.removeHeaderText(page, area)
            return
        }

        let text = page.headerText(area)
        if (!text) {
            const h = area === 0 ? AlignH.LEFT : area === 1 ? AlignH.HCENTER : AlignH.RIGHT
            text = HeaderFooterLayout.createText(page, TextStyleType.HEADER, new Align(h, AlignV.TOP))
            page.setHeaderText(area, text)
        }

        if (!HeaderFooterLayout.updateHeaderFooterText(ctx, page, text, s)) {
            HeaderFooterLayout.removeHeaderText(page, area)
        }
    }

    private static createUpdateFooterText(ctx: LayoutContext, page: Page, area: number, s: string): void {
        if (s.length === 0) {
            HeaderFooterLayout.removeFooterText(page, area)
            return
        }

        let text = page.footerText(area)
        if (!text) {
            const h = area === 0 ? AlignH.LEFT : area === 1 ? AlignH.HCENTER : AlignH.RIGHT
            text = HeaderFooterLayout.createText(page, TextStyleType.FOOTER, new Align(h, AlignV.BOTTOM))
            page.setFooterText(area, text)
        }

        if (!HeaderFooterLayout.updateHeaderFooterText(ctx, page, text, s)) {
            HeaderFooterLayout.removeFooterText(page, area)
        }
    }

    private static updateHeaderFooterText(ctx: LayoutContext, page: Page, text: Text, s: string): boolean {
        // Escape '&' and '<' that are not part of a tag
        let escaped = ''
        for (let i = 0, n = s.length; i < n; ++i) {
            const c = s[i]
            if (c === '&') {
                escaped += '&amp;'
                continue
            } else if (c === '<' && (i + 1 < n) && /[\s\d]/.test(s[i + 1])) {
                escaped += '&lt;'
                continue
            }
            escaped += c
        }

        text.setXmlText(escaped)
        text.createBlocks()

        let emptyBlocks = 0
        const newBlocks: TextBlock[] = []
        for (const oldBlock of text.ldata().blocks) {
            const dummyText = new Text(ctx.dom().dummyParent(), text.textStyleType())
            dummyText.mutldata().blocks = [HeaderFooterLayout.replaceTextMacros(ctx, page, oldBlock)]
            dummyText.genText()
            dummyText.createBlocks()
            if (dummyText.xmlText().length === 0) {
                emptyBlocks++ // count empty blocks to remove them later if there is only 1 empty block
            }
            newBlocks.push(...dummyText.ldata().blocks)
        }

        if (newBlocks.length === 0 || (newBlocks.length === 1 && emptyBlocks === 1)) {
            return false
        }

        text.mutldata().blocks = newBlocks
        TLayout.layoutText(text, ctx)

        return true
    }

    private static removeHeaderText(page: Page, area: number): void {
        if (page.headerText(area)) {
            page.setHeaderText(area, null)
        }
    }

    private static removeFooterText(page: Page, area: number): void {
        if (page.footerText(area)) {
            page.setFooterText(area, null)
        }
    }

    //---------------------------------------------------------
    //   replaceTextMacros
    //    (keep in sync with toolTipHeaderFooter in EditStyle::EditStyle())
    //---------------------------------------------------------

    private static replaceTextMacros(ctx: LayoutContext, page: Page, tb: TextBlock): TextBlock {
        const score = page.score()
        const master = score.masterScore() as unknown as MasterScore
        const newFragments: TextFragment[] = []
        const back = (): TextFragment => newFragments[newFragments.length - 1]

        for (const tf of tb.fragments()) {
            const defaultFormat = tf.format
            const s = tf.text
            if (newFragments.length === 0 || !back().format.equals(defaultFormat)) {
                const f = new TextFragment()
                f.format = defaultFormat.clone()
                newFragments.push(f)
            }

            for (let i = 0, n = s.length; i < n; ++i) {
                const c = s[i]
                if (c === '$' && (i < (n - 1))) {
                    const nc = s[i + 1]
                    const pageNumber = (): void => {
                        const no = page.pageNumber() + 1 + score.pageNumberOffset()
                        if (no > 0) {
                            HeaderFooterLayout.appendFormattedString(newFragments, String(no), defaultFormat,
                                                                     HeaderFooterLayout.formatForMacro(ctx, '$' + nc))
                        }
                    }
                    const copyright = (): void => {
                        HeaderFooterLayout.appendFormattedString(newFragments, score.metaTag('copyright'), defaultFormat,
                                                                 HeaderFooterLayout.formatForMacro(ctx, '$' + nc))
                    }
                    switch (nc) {
                    case 'p': // not on first page 1
                        if (!page.pageNumber()) {
                            break
                        }
                        if (score.npages() + score.pageNumberOffset() <= 1) {
                            ctx.mutState().setMustRecomputeHeadersFooters(true)
                            break
                        }
                        pageNumber()
                        break
                    case 'N': // on page 1 only if there are multiple pages
                        if (score.npages() + score.pageNumberOffset() <= 1) {
                            ctx.mutState().setMustRecomputeHeadersFooters(true)
                            break
                        }
                        pageNumber()
                        break
                    case 'P': // on all pages
                        pageNumber()
                        break
                    case 'n': {
                        ctx.mutState().setMustRecomputeHeadersFooters(true)
                        const no = score.npages() + score.pageNumberOffset()
                        HeaderFooterLayout.appendFormattedString(newFragments, String(no), defaultFormat,
                                                                 HeaderFooterLayout.formatForMacro(ctx, '$' + nc))
                    }
                        break
                    case 'i': // not on first page
                        if (!page.pageNumber()) {
                            break
                        }
                        back().text += score.metaTag('partName')
                        break
                    case 'I':
                        back().text += score.metaTag('partName')
                        break
                    case 'f':
                    case 'F':
                        // TODO(port): file info
                        break
                    case 'd':
                        back().text += isoDate(new Date())
                        break
                    case 'D': {
                        const creationDate = score.metaTag('creationDate')
                        back().text += creationDate.length ? creationDate : isoDate(new Date())
                    }
                        break
                    case 'm':
                        back().text += 'HH:mm:ss' // TODO(port): file info
                        break
                    case 'M':
                        back().text += 'YYYY-MM-DD' // TODO(port): file info
                        break
                    case 'C': // only on first page
                        if (page.pageNumber()) {
                            break
                        }
                        copyright()
                        break
                    case 'c':
                        copyright()
                        break
                    case 'v':
                        back().text += master.mscoreVersion ? master.mscoreVersion() : ''
                        break
                    case 'r': {
                        const rev = master.mscoreRevision ? master.mscoreRevision() : 0
                        back().text += rev > 99999 ? rev.toString(16) : rev.toString(10)
                    }
                        break
                    case '$':
                        back().text += '$'
                        break
                    case ':': {
                        let tag = ''
                        let k = i + 2
                        for (; k < n; ++k) {
                            if (s[k] === ':') {
                                break
                            }
                            tag += s[k]
                        }
                        if (k !== n) { // found ':' ?
                            if (tag === 'copyright') {
                                HeaderFooterLayout.appendFormattedString(newFragments, score.metaTag(tag), defaultFormat,
                                                                         HeaderFooterLayout.formatForMacro(ctx, '$:' + tag + ':'))
                            } else {
                                back().text += score.metaTag(tag)
                            }
                            i = k - 1
                        }
                    }
                        break
                    default:
                        back().text += '$'
                        back().text += nc
                        break
                    }
                    ++i
                } else {
                    back().text += c
                }
            }
        }
        const newBlock = new TextBlock()
        newBlock.setFragments(newFragments)
        return newBlock
    }

    private static formatForMacro(ctx: LayoutContext, macro: string): CharFormat {
        const format = new CharFormat()
        if (macro === '$c' || macro === '$C' || macro === '$:copyright:') {
            format.setStyle(ctx.conf().styleV(Sid.copyrightFontStyle) as FontStyle)
            format.setFontSize(ctx.conf().styleD(Sid.copyrightFontSize))
            format.setFontFamily(ctx.conf().styleSt(Sid.copyrightFontFace))
        } else if (macro === '$p' || macro === '$P' || macro === '$n' || macro === '$N') {
            format.setStyle(ctx.conf().styleV(Sid.pageNumberFontStyle) as FontStyle)
            format.setFontSize(ctx.conf().styleD(Sid.pageNumberFontSize))
            format.setFontFamily(ctx.conf().styleSt(Sid.pageNumberFontFace))
        }
        return format
    }

    private static appendFormattedString(fragments: TextFragment[], s: string, defaultFormat: CharFormat, newFormat: CharFormat): void {
        if (defaultFormat.equals(newFormat)) {
            fragments[fragments.length - 1].text += s
            return
        }

        const newFragment = new TextFragment(s)
        newFragment.format = newFormat
        fragments.push(newFragment)

        const next = new TextFragment() // Start next fragment
        next.format = defaultFormat.clone() // reset to default for next fragment
        fragments.push(next)
    }

    static headerExtension(ctx: LayoutContext, page: Page): number {
        const isPageMode = ctx.conf().isMode(LayoutMode.PAGE) || ctx.conf().isMode(LayoutMode.FLOAT)
        if (!isPageMode) {
            return 0.0
        }

        if (ctx.conf().styleB(Sid.showHeader) && (page.pageNumber() || ctx.conf().styleB(Sid.headerFirstPage))) {
            let maxHeight = 0.0
            for (let area = 0; area < MAX_HEADERS; ++area) {
                const text = page.headerText(area)
                if (text) {
                    const h = text.height()
                    if (h > maxHeight) {
                        maxHeight = h
                    }
                }
            }
            const offset = (ctx.conf().styleV(Sid.headerOffset) as PointF).y() * DPMM
            return Math.max(0.0, maxHeight - offset)
        }
        return 0.0
    }

    static footerExtension(ctx: LayoutContext, page: Page): number {
        const isPageMode = ctx.conf().isMode(LayoutMode.PAGE) || ctx.conf().isMode(LayoutMode.FLOAT)
        if (!isPageMode) {
            return 0.0
        }

        if (ctx.conf().styleB(Sid.showFooter) && (page.pageNumber() || ctx.conf().styleB(Sid.footerFirstPage))) {
            let maxHeight = 0.0
            for (let area = 0; area < MAX_FOOTERS; ++area) {
                const text = page.footerText(area)
                if (text) {
                    const h = text.height()
                    if (h > maxHeight) {
                        maxHeight = h
                    }
                }
            }
            const offset = (ctx.conf().styleV(Sid.footerOffset) as PointF).y() * DPMM
            return Math.max(0.0, maxHeight - offset)
        }
        return 0.0
    }

    static scoreHasTimestampHeadersFooters(score: Score): boolean {
        const style = score.style()
        const has = (t: string): boolean => t.includes('$d') || t.includes('$D') || t.includes('$m') || t.includes('$M')
        if (style.styleB(Sid.showHeader)) {
            if (has(style.styleSt(Sid.oddHeaderL)) || has(style.styleSt(Sid.oddHeaderC)) || has(style.styleSt(Sid.oddHeaderR))
                || has(style.styleSt(Sid.evenHeaderL)) || has(style.styleSt(Sid.evenHeaderC)) || has(style.styleSt(Sid.evenHeaderR))) {
                return true
            }
        }
        if (style.styleB(Sid.showFooter)) {
            if (has(style.styleSt(Sid.oddFooterL)) || has(style.styleSt(Sid.oddFooterC)) || has(style.styleSt(Sid.oddFooterR))
                || has(style.styleSt(Sid.evenFooterL)) || has(style.styleSt(Sid.evenFooterC)) || has(style.styleSt(Sid.evenFooterR))) {
                return true
            }
        }
        return false
    }
}
