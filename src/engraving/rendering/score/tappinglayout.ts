/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/tappinglayout.h/.cpp
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { Fraction } from '../../types/fraction'
import { SymId } from '../../types/symid'
import { Align, AlignH, AlignV, DirectionV, ElementType, LHTappingShowItems, LHTappingSymbol, RHTappingSymbol, TappingHand } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { MStyle } from '../../style/style'
import { Shape } from '../../infrastructure/shape'
import { FrameType } from '../../dom/textbase'
import { TappingHalfSlur, TappingText, type Tapping, type TappingHalfSlurSegment } from '../../dom/tapping'
import type { Chord } from '../../dom/chord'
import type { System } from '../../dom/system'
import type { LayoutContext } from './layoutcontext'
import { SlurTieLayout } from './slurtielayout'
import { TextLayout } from './textlayout'

export class TappingLayout {
    static layoutTapping(item: Tapping, ctx: LayoutContext): void {
        if (item.hand() === TappingHand.INVALID) {
            return // C++ IF_ASSERT_FAILED
        }

        const ldata = item.mutldata()
        const style = item.style()
        const tabStaff = item.staffType()!.isTabStaff()

        if (item.hand() === TappingHand.LEFT) {
            TappingLayout.layoutLeftHandTapping(item, style, tabStaff, ctx)
        } else {
            TappingLayout.layoutRightHandTapping(item, style, tabStaff, ctx)
        }

        const text = item.tappingText()
        if (ldata.symId !== SymId.noSym) {
            ldata.setShape(new Shape(item.symBbox(ldata.symId), item))
        } else if (text) {
            const textBbox = text.ldata().bbox()
            text.setPos(new PointF(-textBbox.x(), 0.0))
            ldata.setShape(new Shape(textBbox.translated(text.pos()), item))
        }

        if (tabStaff) {
            // Slightly increase vertical padding on TAB staves
            item.setMinDistance(style.styleS(Sid.articulationMinDistance).times(item.staff()!.lineDistance(item.tick())))
        }
    }

    private static layoutLeftHandTapping(item: Tapping, style: MStyle, tabStaff: boolean, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        TappingLayout.updateHalfSlurs(item, style, tabStaff, ctx)

        const lhSym = (tabStaff ? style.styleV(Sid.lhTappingSymbolTab) : style.styleV(Sid.lhTappingSymbolNormalStave)) as LHTappingSymbol

        const dontShowSymbols = item.lhShowItems() === LHTappingShowItems.HALF_SLUR

        if (lhSym !== LHTappingSymbol.DOT || dontShowSymbols) {
            ldata.symId = SymId.noSym
        }
        if (lhSym !== LHTappingSymbol.CIRCLED_T || dontShowSymbols) {
            item.setTappingText(null)
        }

        if (dontShowSymbols) {
            return
        }

        if (lhSym === LHTappingSymbol.DOT) {
            ldata.symId = SymId.windClosedHole
            ldata.setMag(0.5)
        } else if (lhSym === LHTappingSymbol.CIRCLED_T) {
            ldata.setMag(1.0)
            let text = item.tappingText()
            if (!text) {
                text = new TappingText(item)
            }
            item.setTappingText(text)
            text.setParent(item)
            text.setTrack(item.track())
            text.setXmlText('T')
            text.setFrameType(FrameType.CIRCLE)
            text.setAlign(new Align(AlignH.LEFT, AlignV.BASELINE))
            TextLayout.layoutBaseTextBase(text, ctx)
            // Move the circle up very slightly to look better centered on the T
            text.mutldata().frame.translate(0.0, -0.02 * text.height())
        }
    }

    private static updateHalfSlurs(item: Tapping, style: MStyle, tabStaff: boolean, ctx: LayoutContext): void {
        const p = item.parent()
        const chord = p && p.isChord() ? p as unknown as Chord : null
        if (!chord) {
            return
        }

        const showHalfSlurAbove = item.lhShowItems() !== LHTappingShowItems.SYMBOL
        if (showHalfSlurAbove) {
            let halfSlurAbove = item.halfSlurAbove()
            if (!halfSlurAbove) {
                halfSlurAbove = new TappingHalfSlur(item)
                item.setHalfSlurAbove(halfSlurAbove)
                halfSlurAbove.setSelected(item.selected())
            }

            halfSlurAbove.setParent(item)
            halfSlurAbove.setIsHalfSlurAbove(true)
            halfSlurAbove.setTrack(item.track())
            halfSlurAbove.setTick(item.tick())
            halfSlurAbove.setTicks(new Fraction(0, 1))
            halfSlurAbove.setStartElement(chord)
            halfSlurAbove.setEndElement(chord)
            if (tabStaff) {
                halfSlurAbove.setSlurDirection(DirectionV.UP)
            }

            TappingLayout.layoutHalfSlur(item, halfSlurAbove, ctx)
        } else if (item.halfSlurAbove()) {
            item.setHalfSlurAbove(null)
        }

        const showHalfSlurBelow = tabStaff && showHalfSlurAbove && style.styleB(Sid.lhTappingSlurTopAndBottomNoteOnTab)
                                  && chord.notes().length > 1
        if (showHalfSlurBelow) {
            let halfSlurBelow = item.halfSlurBelow()
            if (!halfSlurBelow) {
                halfSlurBelow = new TappingHalfSlur(item)
                item.setHalfSlurBelow(halfSlurBelow)
            }

            halfSlurBelow.setParent(item)
            halfSlurBelow.setIsHalfSlurAbove(false)
            halfSlurBelow.setTrack(item.track())
            halfSlurBelow.setTick(item.tick())
            halfSlurBelow.setTicks(new Fraction(0, 1))
            halfSlurBelow.setStartElement(chord)
            halfSlurBelow.setEndElement(chord)
            halfSlurBelow.setSlurDirection(DirectionV.DOWN)

            TappingLayout.layoutHalfSlur(item, halfSlurBelow, ctx)
        } else if (item.halfSlurBelow()) {
            item.setHalfSlurBelow(null)
        }
    }

    private static layoutHalfSlur(item: Tapping, slur: TappingHalfSlur, ctx: LayoutContext): void {
        const system = item.findAncestor(ElementType.SYSTEM) as unknown as System | null
        if (!system) {
            return // C++ IF_ASSERT_FAILED
        }

        const skyline = system.staff(item.staffIdx())!.skyline()
        const slurSeg = SlurTieLayout.layoutSystem(slur, system, ctx) as TappingHalfSlurSegment | null
        if (!slurSeg) {
            return
        }

        const segShape = slurSeg.shape()

        const mask = segShape.bbox().clone()
        mask.setWidth(0.5 * mask.width())
        const maskPad = 0.25 * item.spatium()
        mask.adjust(-maskPad, -maskPad, 0.0, maskPad)
        slurSeg.mutldata().setMask(new Shape(mask))

        const maskedShape = new Shape()
        const roundingMargin = 0.05 * item.spatium() // otherwise rounding errors may affect the threshold
        for (const el of segShape.elements()) {
            if (el.left() > mask.right() - roundingMargin) {
                maskedShape.add(el)
            }
        }
        slurSeg.mutldata().setShape(maskedShape)

        skyline.add(maskedShape.translated(slurSeg.pos()))
    }

    private static layoutRightHandTapping(item: Tapping, style: MStyle, tabStaff: boolean, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const rhSym = (tabStaff ? style.styleV(Sid.rhTappingSymbolTab) : style.styleV(Sid.rhTappingSymbolNormalStave)) as RHTappingSymbol

        if (rhSym !== RHTappingSymbol.PLUS) {
            ldata.symId = SymId.noSym
        }
        if (rhSym !== RHTappingSymbol.T) {
            item.setTappingText(null)
        }

        if (rhSym === RHTappingSymbol.PLUS) {
            ldata.symId = SymId.pluckedLeftHandPizzicato
        } else if (rhSym === RHTappingSymbol.T) {
            let text = item.tappingText()
            if (!text) {
                text = new TappingText(item)
            }
            item.setTappingText(text)
            text.setParent(item)
            text.setTrack(item.track())
            text.setXmlText('T')
            text.setAlign(new Align(AlignH.LEFT, AlignV.BASELINE))
            TextLayout.layoutBaseTextBase(text, ctx)
        }
    }
}
