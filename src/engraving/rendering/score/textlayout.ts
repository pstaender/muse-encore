/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/textlayout.h/.cpp
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { FontType } from '../../../framework/draw/types/font'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { Align, AlignH, AlignV, DPMM, ElementType } from '../../types/types'
import { Shape } from '../../infrastructure/shape'
import { SUBSCRIPT_OFFSET, SUBSCRIPT_SIZE, SUPERSCRIPT_OFFSET, TextFragment, VerticalAlignment, type CharFormat, type TextBase,
    type TextBaseLayoutData, type TextBlock } from '../../dom/textbase'
import type { Box } from '../../dom/box'
import type { Page } from '../../dom/page'
import type { LayoutContext } from './layoutcontext'

export class TextLayout {
    static layoutBaseTextBase(item: TextBase, _ctx?: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            return
        }

        ldata.setPos(new PointF())

        if (item.placeBelow()) {
            ldata.setPosY(item.staff() ? item.staff()!.staffHeight(item.tick()) : 0.0)
        }

        TextLayout.layoutBaseTextBase1(item, ldata)
    }

    static layoutBaseTextBase1(item: TextBase, ldata: TextBaseLayoutData = item.mutldata()): void {
        if (ldata.layoutInvalid) {
            item.createBlocks(ldata)
        }

        let y = 0.0

        // adjust the bounding box for the text item
        let maxBlockWidth = -Number.MAX_VALUE
        for (const t of ldata.blocks) {
            TextLayout.layoutTextBlock(t, item)
            y += t.lineSpacing()
            t.setY(y)
            maxBlockWidth = Math.max(maxBlockWidth, t.boundingRect().width())
        }

        const shape = new Shape()
        TextLayout.textHorizontalLayout(item, shape, maxBlockWidth, ldata)

        const bb = shape.bbox()

        let yoff = 0
        let h = 0
        const parent = item.explicitParent()
        if (parent) {
            if (item.layoutToParentWidth()) {
                if (parent.isTBox()) {
                    // hack: vertical alignment is always TOP
                    item.setAlign(new Align(item.align().horizontal, AlignV.TOP))
                } else if (parent.isBox()) {
                    // consider inner margins of frame
                    const b = parent as unknown as Box
                    yoff = b.topMargin() * DPMM

                    if (b.height() < bb.bottom()) {
                        h = b.height() / 2 + bb.height()
                    } else {
                        h = b.height() - yoff - b.bottomMargin() * DPMM
                    }
                } else if (parent.isPage()) {
                    const p = parent as unknown as Page
                    h = p.height() - p.tm() - p.bm()
                    yoff = p.tm()
                } else if (parent.isMeasure()) {
                    // nothing
                } else {
                    h = item.parentItem()!.height()
                }
            }
        } else {
            ldata.setPos(new PointF())
        }

        const valign = item.align().vertical
        if (valign === AlignV.BOTTOM) {
            yoff += h - bb.bottom()
        } else if (valign === AlignV.VCENTER) {
            yoff += (h - (bb.top() + bb.bottom())) * 0.5
        } else if (valign === AlignV.BASELINE) {
            yoff += h * 0.5 - ldata.blocks[0].lineSpacing()
        } else {
            yoff += -bb.top()
        }

        for (const t of ldata.blocks) {
            t.setY(t.y() + yoff)
        }

        shape.translateY(yoff)
        ldata.setShape(shape)

        if (item.hasFrame()) {
            item.layoutFrame(ldata)
        }

        if (!item.isDynamic() && !(parent && parent.isBox())) {
            TextLayout.computeTextHighResShape(item, ldata)
        }
    }

    static computeTextHighResShape(item: TextBase, ldata: TextBaseLayoutData): void {
        const shape = new Shape()

        for (const block of ldata.blocks) {
            const y = block.y()

            for (const fragment of block.fragments()) {
                const fontMetrics = new FontMetrics(fragment.font(item))
                let x = fragment.pos.x()
                const chars = Array.from(fragment.text) // iterates by code point (surrogate pairs stay together)
                for (let i = 0; i < chars.length; ++i) {
                    const text = chars[i]
                    const characterBoundingRect = fontMetrics.tightBoundingRect(text)
                    characterBoundingRect.translate(x, y)
                    shape.add(characterBoundingRect)
                    if (i + 1 < chars.length) {
                        x += fontMetrics.horizontalAdvance(text)
                    }
                }
            }
        }

        ldata.highResShape = shape
    }

    static textHorizontalLayout(item: TextBase, shape: Shape, maxBlockWidth: number, ldata: TextBaseLayoutData): void {
        let leftMargin = 0.0
        let layoutWidth = 0
        const parent = item.parentItem()
        if (parent && item.layoutToParentWidth()) {
            layoutWidth = parent.width()
            switch (parent.type()) {
            case ElementType.HBOX:
            case ElementType.VBOX:
            case ElementType.TBOX: {
                const b = parent as unknown as Box
                layoutWidth -= ((b.leftMargin() + b.rightMargin()) * DPMM)
                leftMargin = b.leftMargin() * DPMM
            }
                break
            case ElementType.PAGE: {
                const p = parent as unknown as Page
                layoutWidth -= (p.lm() + p.rm())
                leftMargin = p.lm()
            }
                break
            default:
                // Lay out to parent width only valid for items with page or frame as parent
                break
            }
        } else if (item.positionRelativeToNoteheadRest()) {
            const mag = item.staff() ? item.staff()!.staffMag(item) : 1.0
            layoutWidth = item.symWidth(SymId.noteheadBlack) * mag
        }

        for (let i = 0; i < ldata.blocks.length; ++i) {
            const textBlock = ldata.blocks[i]

            // Position relative to reference point
            let xAdj = leftMargin - textBlock.boundingRect().left()
            const position = item.position()
            if (position === AlignH.HCENTER) {
                xAdj += (layoutWidth - maxBlockWidth) * 0.5
            } else if (position === AlignH.RIGHT) {
                xAdj += layoutWidth - maxBlockWidth
            }

            // Align relative to the widest block
            const diff = maxBlockWidth - textBlock.boundingRect().width()
            if (RealIsNull(diff)) {
                for (const f of textBlock.fragments()) {
                    f.pos.setX(f.pos.x() + xAdj)
                }
                textBlock.shape().translate(new PointF(xAdj, 0.0))
                shape.add(textBlock.shape().translated(new PointF(0.0, textBlock.y())))
                continue
            }

            const alignH = item.align().horizontal
            if (alignH === AlignH.HCENTER) {
                xAdj += diff * 0.5
            } else if (alignH === AlignH.RIGHT) {
                xAdj += diff
            } else if (alignH === AlignH.JUSTIFY) {
                if (i !== ldata.blocks.length - 1) {
                    TextLayout.justifyLine(item, textBlock, maxBlockWidth)
                }
            }

            for (const fragment of textBlock.fragments()) {
                fragment.pos.setX(fragment.pos.x() + xAdj)
            }
            textBlock.shape().translate(new PointF(xAdj, 0.0))
            shape.add(textBlock.shape().translated(new PointF(0.0, textBlock.y())))
        }
    }

    static justifyLine(item: TextBase, textBlock: TextBlock, maxBlockWidth: number): void {
        interface SubFragment {
            text: string
            format: CharFormat
            width: number
        }
        const subfrags: SubFragment[] = []

        for (const f of textBlock.fragments()) {
            let current = ''
            const fm = new FontMetrics(f.font(item))
            for (const c of f.text) {
                current += c
                if (/\s/.test(c)) {
                    const w = fm.width(current)
                    subfrags.push({ text: current, format: f.format, width: w })
                    current = ''
                }
            }
            if (current.length) {
                const w = fm.width(current)
                subfrags.push({ text: current, format: f.format, width: w })
            }
        }

        let numSpaces = 0
        let textWidth = 0
        for (const sf of subfrags) {
            numSpaces++
            textWidth += sf.width // accumulate text width
        }
        numSpaces--
        const spaceToFill = maxBlockWidth - textWidth
        if (numSpaces > 0 && spaceToFill > 0) {
            const frags: TextFragment[] = []
            const extraSpacing = spaceToFill / numSpaces
            let x = 0.0
            for (const sf of subfrags) {
                const frag = new TextFragment()
                frag.text = sf.text
                frag.format = sf.format.clone()
                frag.pos.setX(x)
                frags.push(frag)
                x += sf.width + extraSpacing
            }
            textBlock.setFragments(frags)
        }
    }

    static layoutTextBlock(item: TextBlock, t: TextBase): void {
        const fragments = item.fragments()
        const shape = item.shape()
        shape.clear()

        let x = 0.0
        let lineSpacing = 0.0

        if (fragments.length === 0) {
            const fm = t.fontMetrics()
            shape.add(new RectF(0.0, -fm.ascent(), 1.0, fm.descent()), t)
            lineSpacing = fm.lineSpacing()
        } else if (fragments.length === 1 && fragments[0].text.length === 0) {
            const f = fragments[0]
            f.pos.setX(x)
            const fm = new FontMetrics(f.font(t))
            if (f.format.valign() !== VerticalAlignment.AlignNormal) {
                let voffset = fm.xHeight() / SUBSCRIPT_SIZE // use original height
                if (f.format.valign() === VerticalAlignment.AlignSubScript) {
                    voffset *= SUBSCRIPT_OFFSET
                } else {
                    voffset *= SUPERSCRIPT_OFFSET
                }
                f.pos.setY(voffset)
            } else {
                f.pos.setY(0.0)
            }

            const temp = new RectF(0.0, -fm.ascent(), 1.0, fm.descent())
            shape.add(temp, t)
            lineSpacing = Math.max(lineSpacing, fm.lineSpacing())
        } else {
            const last = fragments.length - 1
            for (let fi = 0; fi < fragments.length; ++fi) {
                const f = fragments[fi]
                f.pos.setX(x)
                const fragmentFont = f.font(t)
                const fm = new FontMetrics(fragmentFont)
                if (f.format.valign() !== VerticalAlignment.AlignNormal) {
                    let voffset = fm.xHeight() / SUBSCRIPT_SIZE // use original height
                    if (f.format.valign() === VerticalAlignment.AlignSubScript) {
                        voffset *= SUBSCRIPT_OFFSET
                    } else {
                        voffset *= SUPERSCRIPT_OFFSET
                    }
                    f.pos.setY(voffset)
                } else {
                    f.pos.setY(0.0)
                }

                // Optimization: don't calculate character position
                // for the next fragment if there is no next fragment
                if (fi !== last) {
                    const w = fm.width(f.text)
                    x += w
                }

                const yOffset = TextLayout.musicSymbolBaseLineAdjust(item, t, f, fi)
                f.pos.setY(f.pos.y() - yOffset)

                const textBRect = fm.tightBoundingRect(f.text).translated(f.pos)
                // TODO(port): dynamics (symShapeWithCutouts for the dynamic symbol)
                shape.add(textBRect, t)

                if (fragmentFont.type() === FontType.MusicSymbol || fragmentFont.type() === FontType.MusicSymbolText) {
                    // SEMI-HACK: Music fonts can have huge linespacing because of tall symbols, so instead of using the
                    // font linespacing value we just use the height of the individual fragment with some added margin
                    lineSpacing = Math.max(lineSpacing, 1.25 * (shape.bbox().height() - shape.bbox().bottom()) + yOffset)
                } else {
                    lineSpacing = Math.max(lineSpacing, fm.lineSpacing())
                }
            }
        }

        // Apply style/custom line spacing
        lineSpacing *= t.textLineSpacing()

        item.setLineSpacing(lineSpacing)
    }

    static musicSymbolBaseLineAdjust(block: TextBlock, t: TextBase, f: TextFragment, fi: number): number {
        const fragmentFont = f.font(t)
        const fm = new FontMetrics(fragmentFont)

        const adjustSymbol = fragmentFont.type() === FontType.MusicSymbolText && t.isMarker()
        if (!adjustSymbol) {
            return 0.0
        }

        let refFont
        const frags = block.fragments()
        if (frags.length === 1) {
            refFont = t.font()
        } else {
            const refFragment = fi !== 0 ? frags[fi - 1] : frags[fi + 1]
            refFont = refFragment.font(t)
        }
        const refFm = new FontMetrics(refFont)

        const middle = (fm.tightBoundingRect(f.text).height() / 2) - fm.tightBoundingRect(f.text).bottom()
        const refXHeight = refFm.capHeight() / 2

        return refXHeight - middle
    }
}
