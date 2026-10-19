/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/harmonylayout.h/.cpp
 */

import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { FontType, type Font } from '../../../framework/draw/types/font'
import { LineF, PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { AlignH, AlignV, ChordStylePreset, DirectionH, DisplayCapoChordType, ElementType, Key } from '../../types/types'
import { Sid } from '../../style/styledef'
import {
    ChordTokenClass, RenderActionMove, RenderActionParenLeft, RenderActionParenRight, RenderActionType,
    type RenderAction, type RenderActionMoveXHeight, type RenderActionParen, type RenderActionPop, type RenderActionScale,
    type RenderActionSet,
} from '../../dom/chordlist'
import { Factory } from '../../dom/factory'
import {
    ChordSymbolParen, HarmonyType, TextSegment, type Harmony, type HarmonyInfo, type HarmonyLayoutData, type HarmonyRenderItem,
} from '../../dom/harmony'
import type { Parenthesis } from '../../dom/parenthesis'
import {
    NoteCaseType, NoteSpellingType, Tpc, tpc2FunctionParts, tpc2nameParts, tpc2nameStringAcc, tpcIsValid,
} from '../../dom/pitchspelling'
import type { LayoutContext } from './layoutcontext'
import { TextLayout } from './textlayout'
import { ParenthesisLayout } from './parenthesislayout'

class HarmonyRenderCtx {
    pos = new PointF(0.0, 0.0)
    renderItemList: HarmonyRenderItem[] = []

    // Reset every single chord
    hAlign = true
    info: HarmonyInfo | null = null

    // Reset every render() call
    stack: PointF[] = []
    tpc: number = Tpc.TPC_INVALID
    noteSpelling = NoteSpellingType.STANDARD
    noteCase = NoteCaseType.AUTO
    scale = 1.0

    x(): number { return this.pos.x() }
    y(): number { return this.pos.y() }

    setx(v: number): void { this.pos.setX(v) }
    movex(v: number): void { this.pos.setX(this.pos.x() + v) }
    sety(v: number): void { this.pos.setY(v) }
    movey(v: number): void { this.pos.setY(this.pos.y() + v) }
}

// Character pair and distance to move the second
// Blank strings will apply the kerning no matter the following character
// TODO - move this information to the XML file
// (C++ std::map: iterated in key order)
const KERNED_CHARACTERS: readonly [[string, string], number][] = ([
    [['A', ''], -0.4], // dim
    [['A', ''], -0.3], // half-dim
    [['', ''], -0.4], // triangle - dim
    [['', ''], -0.3], // triangle - half-dim
    [['A', '/'], 0.1],
    [['A', ''], -0.15], // dim JAZZ
    [['A', ''], -0.15], // half-dim JAZZ
    [['', ''], -0.15], // triangle - dim JAZZ
    [['', ''], -0.15], // triangle - half-dim JAZZ
    [['♭', ''], -0.15], // b JAZZ
    [['♮', ''], -0.15], // natural JAZZ
    [['♯', ''], -0.15], // # JAZZ
    [['ᴒA', ''], -0.15], // ## JAZZ
    [['ᴒB', ''], -0.15], // bb JAZZ
] as [[string, string], number][]).sort((a, b) => {
    const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)
    return cmp(a[0][0], b[0][0]) || cmp(a[0][1], b[0][1])
})

const PATTERN_69 = /6[,/]?9/

export class HarmonyLayout {
    static layoutHarmony(item: Harmony, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        if (!item.explicitParent()) {
            ldata.setPos(0.0, 0.0)
            item.setOffset(new PointF(0.0, 0.0))
        }

        if (!item.cursor().editing()) {
            HarmonyLayout.render(item, ldata, ctx)
        }

        if (ldata.layoutInvalid) {
            item.createBlocks(ldata)
        }

        if (ldata.blocks.length === 0) {
            item.createBlocks(ldata) // C++ pushes an empty TextBlock
        }

        const positionPoint = HarmonyLayout.calculateBoundingRect(item, ldata, ctx)

        if (item.isPolychord()) {
            for (const line of ldata.polychordDividerLines) {
                line.setP1(new PointF(ldata.bbox().left(), line.y1()))
                line.setP2(new PointF(ldata.bbox().right(), line.y2()))
            }
        }

        if (item.hasFrame()) {
            item.layoutFrame(ldata)
        }

        ldata.setPos(positionPoint)

        if (!item.cursor().editing() && ldata.renderItemList.length) {
            ParenthesisLayout.layoutParentheses(item, ctx)
        }
    }

    private static calculateBoundingRect(item: Harmony, ldata: HarmonyLayoutData, ctx: LayoutContext): PointF {
        const ypos = (item.placeBelow() && item.staff()) ? item.staff()!.staffHeight(item.tick()) : 0.0
        const fd = item.getParentFretDiagram()
        const alignToFretDiagram = !!fd && fd.visible()

        const standardNoteWidth = item.symWidth(SymId.noteheadBlack)

        let newPosX = 0.0
        let newPosY = 0.0

        if (item.ldata().renderItemList.length === 0) {
            TextLayout.layoutBaseTextBase1(item, ldata)

            if (alignToFretDiagram) {
                newPosY = ldata.pos().y()
            } else {
                newPosY = ypos - ((item.align().vertical === AlignV.BOTTOM) ? -ldata.bbox().height() : 0.0)
            }
        } else {
            HarmonyLayout.layoutModifierParentheses(item, ctx)

            let bb = new RectF()
            let hAlignBox = new RectF()
            for (const renderItem of item.ldata().renderItemList) {
                const tsBbox = renderItem.tightBoundingRect().translated(new PointF(renderItem.x(), renderItem.y()))
                bb = bb.united(tsBbox)

                if (renderItem.align()) {
                    hAlignBox = hAlignBox.united(tsBbox)
                }
            }

            let xx = 0.0
            const hAlign = alignToFretDiagram ? ctx.conf().styleV(Sid.chordAlignmentToFretboard) as AlignH : item.position()
            switch (hAlign) {
            case AlignH.LEFT:
            case AlignH.JUSTIFY:
                xx = -hAlignBox.left()
                break
            case AlignH.HCENTER:
                xx = -(hAlignBox.center().x())
                break
            case AlignH.RIGHT:
                xx = -hAlignBox.right()
                break
            }

            let yy = -bb.y() // Align::TOP
            if (item.align().vertical === AlignV.VCENTER) {
                yy = -bb.y() / 2.0
            } else if (item.align().vertical === AlignV.BASELINE) {
                yy = item.baseLine()
            } else if (item.align().vertical === AlignV.BOTTOM) {
                yy = -bb.height() - bb.y()
            }

            if (alignToFretDiagram) {
                const nutLineWidth = fd!.ldata().nutLineWidth
                newPosY = yy - ctx.conf().styleMM(Sid.harmonyFretDist) - nutLineWidth
            } else {
                newPosY = ypos
            }

            for (const renderItem of item.ldata().renderItemList) {
                renderItem.setOffset(new PointF(xx, yy))
            }

            ldata.polychordDividerOffset = yy
            ldata.setBbox(bb.translated(new PointF(xx, yy)))
            ldata.harmonyHeight = ldata.bbox().height()
        }

        if (alignToFretDiagram) {
            switch (ctx.conf().styleV(Sid.chordAlignmentToFretboard) as AlignH) {
            case AlignH.LEFT:
            case AlignH.JUSTIFY:
                newPosX = 0.0
                break
            case AlignH.HCENTER:
                newPosX = 0.5 * fd!.mainWidth()
                break
            case AlignH.RIGHT:
                newPosX = fd!.mainWidth()
                break
            }
        } else {
            switch (item.position()) {
            case AlignH.LEFT:
            case AlignH.JUSTIFY:
                newPosX = 0.0
                break
            case AlignH.HCENTER:
                newPosX = standardNoteWidth * 0.5
                break
            case AlignH.RIGHT:
                newPosX = standardNoteWidth
                break
            }
        }

        if (fd && !fd.visible()) {
            // Translate to base position around note
            newPosX -= fd.pos().x()
        }

        return new PointF(newPosX, newPosY)
    }

    private static layoutModifierParentheses(item: Harmony, ctx: LayoutContext): void {
        const spatium = item.spatium()
        const itemList = item.ldata().renderItemList
        const smuflParens = ctx.conf().styleB(Sid.harmonyParenUseSmuflSym)

        // Layout parentheses
        const openingParenStack: ChordSymbolParen[] = []
        let lastTextSegHeight = 0.0
        let lastTextSegTop = 0.0
        let rootRefHeight = 0.0
        let rootCapHeight = 0.0
        const parenExtension = 0.1 * spatium * (item.size() / 10.0)

        for (const renderItem of itemList) {
            if (renderItem instanceof ChordSymbolParen) {
                const curParen = renderItem
                if (curParen.parenItem.direction() === DirectionH.LEFT) {
                    // Opening paren
                    openingParenStack.push(curParen)
                    if (ctx.conf().styleB(Sid.harmonyParenUseSmuflSym)) {
                        curParen.parenItem.mutldata().symId = SymId.csymParensLeftTall
                    }
                } else {
                    // Closing paren
                    const openingParen = openingParenStack.length ? openingParenStack[openingParenStack.length - 1] : null
                    if (!openingParen) {
                        continue
                    }
                    openingParenStack.pop()

                    curParen.top = openingParen.top
                    curParen.bottom = openingParen.bottom

                    // Layout parenthesis pair
                    let startY = openingParen.top - parenExtension
                    let height = (openingParen.bottom - openingParen.top) + 2 * parenExtension

                    if (!Number.isFinite(height)) {
                        height = lastTextSegHeight
                    }
                    if (RealIsEqual(Number.MAX_VALUE, startY)) {
                        startY = lastTextSegTop
                    }

                    if (smuflParens) {
                        const symHeight = item.symHeight(SymId.csymParensRightTall)
                        const scale = height / symHeight
                        curParen.parenItem.mutldata().symId = SymId.csymParensRightTall
                        curParen.parenItem.mutldata().symScale = scale
                        openingParen.parenItem.mutldata().symScale = scale
                        curParen.sety(startY + height)
                        openingParen.sety(startY + height)
                        ParenthesisLayout.createSmuflShape(openingParen.parenItem, openingParen.parenItem.mutldata())
                        ParenthesisLayout.createSmuflShape(curParen.parenItem, curParen.parenItem.mutldata())
                    } else {
                        const scale = (height - 2 * parenExtension) / rootCapHeight
                        const mag = openingParen.parenItem.ldata().mag()
                        const HEIGHT_TO_WIDTH_RATIO = 20
                        const midPointThickness = height / HEIGHT_TO_WIDTH_RATIO * mag * 1 / Math.sqrt(scale)
                        const endPointThickness = 0.03
                        const shoulder = 0.2 * height * Math.pow(mag, 0.1) * 1 / Math.sqrt(scale)
                        for (const p of [openingParen, curParen]) {
                            const pldata = p.parenItem.mutldata()
                            pldata.startY = startY
                            p.sety(startY)
                            pldata.height = height
                            pldata.midPointThickness = midPointThickness
                            pldata.endPointThickness = endPointThickness
                            pldata.shoulderWidth = shoulder
                        }

                        ParenthesisLayout.createPathAndShape(openingParen.parenItem, openingParen.parenItem.mutldata())
                        ParenthesisLayout.createPathAndShape(curParen.parenItem, curParen.parenItem.mutldata())
                    }

                    let closingPos = openingParen.closingParenPos
                    if (RealIsEqual(-Number.MAX_VALUE, closingPos)) {
                        closingPos = openingParen.x() + openingParen.boundingRect().width()
                    }
                    curParen.setx(closingPos)

                    // Outer parens must always be the same length or longer than inner parens
                    for (const outerParen of openingParenStack) {
                        outerParen.top = Math.min(openingParen.top, outerParen.top)
                        outerParen.bottom = Math.max(openingParen.bottom, outerParen.bottom)
                        outerParen.closingParenPos = Math.max(openingParen.closingParenPos, outerParen.closingParenPos)
                    }
                }
            } else if (renderItem instanceof TextSegment) {
                const textSeg = renderItem
                // Set top paren height
                lastTextSegHeight = textSeg.height()
                lastTextSegTop = textSeg.tightBoundingRect().translated(textSeg.pos()).y()

                if (RealIsNull(rootRefHeight)) {
                    rootRefHeight = textSeg.height()
                    const top = textSeg.tightBoundingRect().translated(textSeg.pos()).y()
                    const bottom = textSeg.pos().y()
                    const height = (bottom - top) + 2 * parenExtension
                    rootRefHeight = height
                    rootCapHeight = textSeg.capHeight()
                }

                if (openingParenStack.length) {
                    const topParen = openingParenStack[openingParenStack.length - 1]
                    if (textSeg.font().type() !== FontType.MusicSymbolText) {
                        topParen.top = Math.min(topParen.top, textSeg.tightBoundingRect().translated(textSeg.pos()).y())
                        topParen.bottom = Math.max(topParen.bottom, textSeg.pos().y())
                    }
                    topParen.closingParenPos = Math.max(topParen.closingParenPos, textSeg.x() + textSeg.width())
                    continue
                }
            }
        }

        const computePadding = (item1: HarmonyRenderItem, item2: HarmonyRenderItem): number => {
            const item1Paren = item1 instanceof ChordSymbolParen
            const item2Paren = item2 instanceof ChordSymbolParen

            let padding = 0.0
            if (item1Paren && item2Paren) {
                padding = Math.min(item1.rightPadding(), item2.leftPadding())
            } else {
                padding = Math.max(item1.rightPadding(), item2.leftPadding())
            }

            const scaling = (item1.height() + item2.height()) / 2
            padding *= scaling

            return padding
        }

        // Create space in text for parentheses
        // TODO - STACKED C7((#11)#13)
        // C7(#11(#13))
        let additionalSpace = 0.0
        let prevParen = false
        for (let i = 0; i < itemList.length; i++) {
            const renderItem = itemList[i]
            const padding = i !== 0 ? computePadding(itemList[i - 1], renderItem) : 0.0
            if (renderItem instanceof ChordSymbolParen) {
                const paren = renderItem
                if (paren.parenItem.direction() === DirectionH.LEFT) {
                    const heightToRefRatio = Math.max(paren.height(), rootRefHeight) / rootRefHeight
                    const scaleParenWidth = !smuflParens && !prevParen && !RealIsEqual(heightToRefRatio, 1.0)
                    const PAREN_PADDING_SCALER = 0.6
                    const scaledParenWidth = paren.parenItem.width() * PAREN_PADDING_SCALER / heightToRefRatio
                    const parenWidth = scaleParenWidth ? scaledParenWidth : paren.parenItem.width()
                    const parenAdjust = additionalSpace + padding + (smuflParens ? 0.0 : parenWidth)
                    paren.movex(parenAdjust)
                    additionalSpace += parenWidth + padding
                } else if (paren.parenItem.direction() === DirectionH.RIGHT) {
                    paren.movex(additionalSpace + padding)
                    additionalSpace += paren.parenItem.width() + padding
                }
                prevParen = true
            } else if (renderItem instanceof TextSegment) {
                additionalSpace += padding
                renderItem.movex(additionalSpace)
                prevParen = false
            }
        }
    }

    /** construct Chord Symbol */
    private static render(item: Harmony, ldata: HarmonyLayoutData, ctx: LayoutContext): void {
        ldata.renderItemList = []

        if (item.harmonyType() === HarmonyType.ROMAN) {
            HarmonyLayout.renderRomanNumeral(item, ldata)
            return
        }

        // Render standard or Nashville chords
        const chordList = item.score().chordList()

        ldata.fontList = []
        for (const cf of chordList.fonts) {
            const ff = item.font()
            ff.setFamily(item.family(), FontType.Harmony)
            const mag = item.mag() * cf.mag
            ff.setPointSizeF(ff.pointSizeF() * mag)
            if (cf.musicSymbolText) {
                ff.setFamily(cf.family, FontType.MusicSymbolText)
            } else if (!(cf.family.length === 0 || cf.family === 'default')) {
                ff.setFamily(cf.family, FontType.Harmony)
            }
            ldata.fontList.push(ff)
        }

        if (ldata.fontList.length === 0) {
            const ff = item.font()
            ff.setFamily(item.family(), FontType.Harmony)
            ldata.fontList.push(ff)
        }

        ldata.polychordDividerLines = []

        const harmonyCtx = new HarmonyRenderCtx()

        // Map of text segments and their final width
        const chordTextSegments: [number, HarmonyRenderItem[]][] = []

        for (let i = item.chords().length; i > 0; i--) {
            harmonyCtx.info = item.chords()[i - 1]
            HarmonyLayout.renderSingleHarmony(item, ldata, harmonyCtx, ctx)

            chordTextSegments.push([harmonyCtx.x(), harmonyCtx.renderItemList])
            ldata.renderItemList.push(...harmonyCtx.renderItemList)

            // Measure divider spacing from lowest baseline and highest cap-height in segments
            const rootBaseline = harmonyCtx.renderItemList.length === 0 ? -Number.MAX_VALUE : harmonyCtx.renderItemList[0].y()
            let bottomBaseline = -Number.MAX_VALUE
            for (const renderItem of harmonyCtx.renderItemList) {
                if (renderItem instanceof TextSegment) {
                    bottomBaseline = Math.max(bottomBaseline, renderItem.y())
                }
            }

            const diff = rootBaseline - bottomBaseline
            if (bottomBaseline > rootBaseline) {
                for (const renderItem of harmonyCtx.renderItemList) {
                    if (renderItem instanceof TextSegment) {
                        renderItem.movey(diff)
                    }
                }
            }

            if (i === item.chords().length) {
                // Set baseline for bottom chord
                ldata.baseline = -diff
            }

            let topCapHeight = Number.MAX_VALUE
            for (const renderItem of harmonyCtx.renderItemList) {
                if (renderItem instanceof TextSegment) {
                    topCapHeight = Math.min(topCapHeight, renderItem.y() - renderItem.capHeight())
                }
            }

            harmonyCtx.renderItemList = []

            if (item.chords().length === 1 || i === 1) {
                break
            }

            harmonyCtx.setx(0)
            harmonyCtx.sety(topCapHeight)

            const style = ctx.conf().style()
            const lineY = harmonyCtx.y() - style.styleS(Sid.polychordDividerSpacing).val() * item.spatium()
                          - style.styleS(Sid.polychordDividerThickness).val() * item.spatium() / 2
            ldata.polychordDividerLines.push(new LineF(new PointF(0.0, lineY), new PointF(0.0, lineY)))

            harmonyCtx.movey(-style.styleS(Sid.polychordDividerSpacing).val() * item.spatium() * 2.0)
            harmonyCtx.movey(-style.styleS(Sid.polychordDividerThickness).val() * item.spatium())
        }

        // Align polychords
        if (item.align().horizontal === AlignH.LEFT) {
            return
        }

        let longestLine = 0.0
        for (const [width] of chordTextSegments) {
            if (width > longestLine) {
                longestLine = width
            }
        }

        for (const [width, segs] of chordTextSegments) {
            let diff = longestLine - width
            if (RealIsNull(diff)) {
                continue
            }
            // For centre align adjust by .5* difference, for right align adjust by full difference
            if (item.align().horizontal === AlignH.HCENTER) {
                diff *= 0.5
            }

            for (const seg of segs) {
                seg.movex(diff)
            }
        }
    }

    private static renderRomanNumeral(item: Harmony, ldata: HarmonyLayoutData): void {
        const harmonyCtx = new HarmonyRenderCtx()
        if (item.chords().length === 0) {
            return
        }
        const info = item.chords()[0]
        HarmonyLayout.renderText(item, ldata, info.textName(), harmonyCtx)
        ldata.renderItemList.push(...harmonyCtx.renderItemList)
        ldata.baseline = 0.0
    }

    private static doRenderSingleHarmony(item: Harmony, ldata: HarmonyLayoutData, harmonyCtx: HarmonyRenderCtx, rootTpc: number,
        bassTpc: number, ctx: LayoutContext): void {
        const info = harmonyCtx.info!
        const chordList = info.chordList()
        if (!chordList) {
            return
        }

        const style = ctx.conf().style()
        const rootCase = item.rootRenderCase(info)
        const bassCase = item.bassRenderCase()
        const spelling = style.styleV(Sid.chordSymbolSpelling) as NoteSpellingType

        const cd = info.getDescription()

        const stackModifiers = style.styleB(Sid.verticallyStackModifiers) && !item.doNotStackModifiers()

        if (item.harmonyType() === HarmonyType.STANDARD && tpcIsValid(rootTpc)) {
            // render root
            HarmonyLayout.renderList(item, ldata, chordList.renderListRoot, harmonyCtx, ctx, rootTpc, spelling, rootCase)
            // render extension
            if (cd) {
                HarmonyLayout.renderList(item, ldata, stackModifiers ? cd.renderListStacked : cd.renderList, harmonyCtx, ctx, 0)
            }
        } else if (item.harmonyType() === HarmonyType.NASHVILLE && tpcIsValid(rootTpc)) {
            // render function
            HarmonyLayout.renderList(item, ldata, chordList.renderListFunction, harmonyCtx, ctx, rootTpc, spelling, bassCase)
            const adjust = chordList.nominalAdjust()
            harmonyCtx.movey(adjust * item.magS() * item.spatium() * 0.2)
            // render extension
            if (cd) {
                HarmonyLayout.renderList(item, ldata, stackModifiers ? cd.renderListStacked : cd.renderList, harmonyCtx, ctx, 0)
            }
        } else {
            HarmonyLayout.renderText(item, ldata, info.textName(), harmonyCtx)
        }

        // render bass
        if (tpcIsValid(bassTpc)) {
            const bassNoteChordList = style.styleB(Sid.chordBassNoteStagger) ? chordList.renderListBassOffset : chordList.renderListBass

            const is69 = PATTERN_69.test(info.textName())
            const hasModifierStack = stackModifiers && (info.parsedChord() ? info.parsedChord()!.modifierList().length > 1 : false)
            if (hasModifierStack || is69) {
                HarmonyLayout.renderList(item, ldata, [new RenderActionMove(0.05, 0.0)], harmonyCtx, ctx,
                    bassTpc, spelling, bassCase, item.bassScale())
            }

            HarmonyLayout.renderList(item, ldata, bassNoteChordList, harmonyCtx, ctx, bassTpc, spelling, bassCase, item.bassScale())
        }
    }

    private static renderSingleHarmony(item: Harmony, ldata: HarmonyLayoutData, harmonyCtx: HarmonyRenderCtx, ctx: LayoutContext): void {
        harmonyCtx.hAlign = true

        const style = ctx.conf().style()
        const info = harmonyCtx.info!

        const rootTpc = info.rootTpc()
        const bassTpc = info.bassTpc()

        const displayCapo = style.styleV(Sid.displayCapoChords) as DisplayCapoChordType

        // render single if no capo or both
        if (displayCapo === DisplayCapoChordType.BOTH || displayCapo === DisplayCapoChordType.CONCERT) {
            HarmonyLayout.doRenderSingleHarmony(item, ldata, harmonyCtx, rootTpc, bassTpc, ctx)
        }

        const capo = style.styleI(Sid.capoPosition)

        if (capo === 0) {
            return
        }

        let capoRootTpc: number = Tpc.TPC_INVALID
        let capoBassTpc: number = Tpc.TPC_INVALID

        if (tpcIsValid(rootTpc) && capo > 0 && capo < 12) {
            const tpcOffset = [0, 5, -2, 3, -4, 1, 6, -1, 4, -3, 2, -5]
            capoRootTpc = rootTpc + tpcOffset[capo]
            capoBassTpc = bassTpc

            if (tpcIsValid(capoBassTpc)) {
                capoBassTpc += tpcOffset[capo]
            }

            /*
             * For guitarists, avoid x and bb in Root or Bass,
             * and also avoid E#, B#, Cb and Fb in Root.
             */
            if (capoRootTpc < 8 || (tpcIsValid(capoBassTpc) && capoBassTpc < 6)) {
                capoRootTpc += 12
                if (tpcIsValid(capoBassTpc)) {
                    capoBassTpc += 12
                }
            } else if (capoRootTpc > 24 || (tpcIsValid(capoBassTpc) && capoBassTpc > 26)) {
                capoRootTpc -= 12
                if (tpcIsValid(capoBassTpc)) {
                    capoBassTpc -= 12
                }
            }
        }

        // Render parens if both
        if (displayCapo === DisplayCapoChordType.BOTH) {
            HarmonyLayout.renderActionParen(item, new RenderActionParenLeft(), harmonyCtx)
        }

        if (displayCapo === DisplayCapoChordType.BOTH || displayCapo === DisplayCapoChordType.TRANSPOSED) {
            // render capo if both or capo
            HarmonyLayout.doRenderSingleHarmony(item, ldata, harmonyCtx, capoRootTpc, capoBassTpc, ctx)
        }

        if (displayCapo === DisplayCapoChordType.BOTH) {
            HarmonyLayout.renderActionParen(item, new RenderActionParenRight(), harmonyCtx)
        }
    }

    /** C++ render(Harmony*, LayoutData*, const String&, HarmonyRenderCtx&) */
    private static renderText(item: Harmony, ldata: HarmonyLayoutData, s: string, harmonyCtx: HarmonyRenderCtx): void {
        if (s.length === 0) {
            return
        }

        const f = item.harmonyType() !== HarmonyType.ROMAN ? ldata.fontList[0] : item.font()
        const ts = new TextSegment(s, f, harmonyCtx.x(), harmonyCtx.y(), harmonyCtx.hAlign)
        harmonyCtx.renderItemList.push(ts)
        harmonyCtx.movex(ts.width())
    }

    /** C++ render(Harmony*, LayoutData*, const std::vector<RenderActionPtr>&, ...) */
    private static renderList(item: Harmony, ldata: HarmonyLayoutData, renderList: readonly RenderAction[],
        harmonyCtx: HarmonyRenderCtx, ctx: LayoutContext, tpc: number, noteSpelling = NoteSpellingType.STANDARD,
        noteCase = NoteCaseType.AUTO, noteMag = 1.0): void {
        harmonyCtx.stack = []
        harmonyCtx.tpc = tpc
        harmonyCtx.noteSpelling = noteSpelling
        harmonyCtx.noteCase = noteCase
        harmonyCtx.scale = noteMag

        for (const a of renderList) {
            HarmonyLayout.renderAction(item, ldata, a, harmonyCtx, ctx)
        }
    }

    private static renderAction(item: Harmony, ldata: HarmonyLayoutData, a: RenderAction, harmonyCtx: HarmonyRenderCtx,
        ctx: LayoutContext): void {
        switch (a.actionType()) {
        case RenderActionType.SET:
            HarmonyLayout.renderActionSet(item, ldata, a as RenderActionSet, harmonyCtx, ctx)
            break
        case RenderActionType.MOVE:
            HarmonyLayout.renderActionMove(item, a as RenderActionMove, harmonyCtx)
            break
        case RenderActionType.MOVEXHEIGHT:
            HarmonyLayout.renderActionMoveXHeight(item, a as RenderActionMoveXHeight, harmonyCtx)
            break
        case RenderActionType.PUSH:
            harmonyCtx.stack.push(harmonyCtx.pos.clone())
            break
        case RenderActionType.POP:
            HarmonyLayout.renderActionPop(a as RenderActionPop, harmonyCtx)
            break
        case RenderActionType.NOTE:
            HarmonyLayout.renderActionNote(item, ldata, harmonyCtx)
            break
        case RenderActionType.ACCIDENTAL:
            HarmonyLayout.renderActionAcc(item, ldata, harmonyCtx, ctx)
            break
        case RenderActionType.STOPHALIGN:
            harmonyCtx.hAlign = false
            break
        case RenderActionType.SCALE:
            harmonyCtx.scale *= (a as RenderActionScale).scale()
            break
        case RenderActionType.PAREN:
            HarmonyLayout.renderActionParen(item, a as RenderActionParen, harmonyCtx)
            break
        default:
            break
        }
    }

    private static renderActionPop(a: RenderActionPop, harmonyCtx: HarmonyRenderCtx): void {
        if (harmonyCtx.stack.length === 0) {
            return
        }
        const pt = harmonyCtx.stack.pop()!
        harmonyCtx.pos = new PointF(a.popX() ? pt.x() : harmonyCtx.x(), a.popY() ? pt.y() : harmonyCtx.y())
    }

    private static renderActionNote(item: Harmony, ldata: HarmonyLayoutData, harmonyCtx: HarmonyRenderCtx): void {
        if (!tpcIsValid(harmonyCtx.tpc)) {
            return
        }

        const chordList = item.score().chordList()
        const st = item.staff()
        const key = st ? st.key(item.tick()) : Key.INVALID

        let c = ''
        if (item.harmonyType() === HarmonyType.STANDARD) {
            c = tpc2nameParts(harmonyCtx.tpc, harmonyCtx.noteSpelling, harmonyCtx.noteCase).s
        } else if (item.harmonyType() === HarmonyType.NASHVILLE) {
            c = tpc2FunctionParts(harmonyCtx.tpc, key).stepName
        }

        if (c.length === 0) {
            return
        }

        const lookup = 'note' + c
        let cs = chordList.symbol(lookup)
        if (!cs.isValid()) {
            cs = chordList.symbol(c)
        }
        const text = cs.isValid() ? cs.value : c
        const font: Font = (cs.isValid() ? ldata.fontList[cs.fontIdx] : ldata.fontList[0]).clone()
        font.setPointSizeF(font.pointSizeF() * harmonyCtx.scale)
        const ts = new TextSegment(text, font, harmonyCtx.x(), harmonyCtx.y(), harmonyCtx.hAlign)
        harmonyCtx.renderItemList.push(ts)
        harmonyCtx.movex(ts.width())
    }

    private static renderActionAcc(item: Harmony, ldata: HarmonyLayoutData, harmonyCtx: HarmonyRenderCtx, ctx: LayoutContext): void {
        if (!tpcIsValid(harmonyCtx.tpc)) {
            return
        }
        const chordList = item.score().chordList()
        const st = item.staff()
        const key = st ? st.key(item.tick()) : Key.INVALID

        let c = ''
        let acc = ''
        let context = 'accidental'

        if (item.harmonyType() === HarmonyType.STANDARD) {
            const parts = tpc2nameStringAcc(harmonyCtx.tpc, harmonyCtx.noteSpelling, harmonyCtx.noteCase)
            c = parts.s
            acc = parts.acc
        } else if (item.harmonyType() === HarmonyType.NASHVILLE) {
            const parts = tpc2FunctionParts(harmonyCtx.tpc, key)
            acc = parts.accName
            c = parts.stepName
        }

        if (acc.length === 0) {
            return
        }

        // Try to find token & execute renderlist
        const tok = chordList.token(acc, ChordTokenClass.ACCIDENTAL)
        if (tok.isValid()) {
            for (const a of tok.renderList) {
                HarmonyLayout.renderAction(item, ldata, a, harmonyCtx, ctx)
            }
            return
        }

        // No valid token, find symbol
        // German spelling - use special symbol for accidental in TPC_B_B
        // to allow it to be rendered as either Bb or B
        if (harmonyCtx.tpc === Tpc.TPC_B_B && harmonyCtx.noteSpelling === NoteSpellingType.GERMAN) {
            context = 'german_B'
        }
        const lookup = context + acc
        let cs = chordList.symbol(lookup)
        if (!cs.isValid()) {
            cs = chordList.symbol(acc)
        }
        const text = cs.isValid() ? cs.value : c
        const font: Font = (cs.isValid() ? ldata.fontList[cs.fontIdx] : ldata.fontList[0]).clone()
        font.setPointSizeF(font.pointSizeF() * harmonyCtx.scale)
        const ts = new TextSegment(text, font, harmonyCtx.x(), harmonyCtx.y(), harmonyCtx.hAlign)
        harmonyCtx.renderItemList.push(ts)
        harmonyCtx.movex(ts.width())
    }

    private static renderActionParen(item: Harmony, a: RenderActionParen, harmonyCtx: HarmonyRenderCtx): void {
        const p = Factory.createItem(ElementType.PARENTHESIS, item) as Parenthesis
        p.setParent(item)
        p.setDirection(a.direction())
        p.setColor(item.color())
        p.setFollowParentColor(true)
        p.setGenerated(true)
        const parenItem = new ChordSymbolParen(p, harmonyCtx.hAlign, harmonyCtx.x(), harmonyCtx.y())
        harmonyCtx.renderItemList.push(parenItem)
    }

    private static kernCharacters(item: Harmony, text: string, harmonyCtx: HarmonyRenderCtx, ctx: LayoutContext): void {
        if (harmonyCtx.renderItemList.length === 0) {
            return
        }

        const prevSeg = harmonyCtx.renderItemList[harmonyCtx.renderItemList.length - 1]
        if (!(prevSeg instanceof TextSegment)) {
            return
        }
        const ts = prevSeg

        for (const [kernPair, kern] of KERNED_CHARACTERS) {
            const endChar = ts.text().endsWith(kernPair[0])
            const startChar = text.startsWith(kernPair[1])

            // VERY DIRTY HACK ALERT
            // "Match any" should only be applied to the Jazz preset currently.
            // Remove the jazz condition when these kern values are moved to the XML files
            if (kernPair[1].length === 0 && (ctx.conf().styleV(Sid.chordStyle) as ChordStylePreset) !== ChordStylePreset.JAZZ) {
                continue
            }

            const startMatchAny = kernPair[1].length === 0
            if ((endChar && startChar) || (endChar && startMatchAny)) {
                const scale = harmonyCtx.scale * item.mag()
                harmonyCtx.pos = harmonyCtx.pos.plus(new PointF(kern, 0.0).times(new FontMetrics(item.font()).capHeight() * scale))
                break
            }
        }
    }

    private static renderActionSet(item: Harmony, ldata: HarmonyLayoutData, a: RenderActionSet, harmonyCtx: HarmonyRenderCtx,
        ctx: LayoutContext): void {
        const chordList = item.score().chordList()
        const cs = chordList.symbol(a.text())
        const text = cs.isValid() ? cs.value : a.text()
        const font: Font = (cs.isValid() ? ldata.fontList[cs.fontIdx] : ldata.fontList[0]).clone()
        font.setPointSizeF(font.pointSizeF() * harmonyCtx.scale)
        if (item.harmonyType() === HarmonyType.NASHVILLE) {
            const nmag = chordList.nominalMag()
            font.setPointSizeF(font.pointSizeF() * nmag)
        }

        HarmonyLayout.kernCharacters(item, text, harmonyCtx, ctx)

        const ts = new TextSegment(text, font, harmonyCtx.x(), harmonyCtx.y(), harmonyCtx.hAlign)
        harmonyCtx.movex(ts.width())
        if (a.renderText()) {
            harmonyCtx.renderItemList.push(ts)
        }
    }

    private static renderActionMove(item: Harmony, a: RenderActionMove, harmonyCtx: HarmonyRenderCtx): void {
        const scale = (a.scaled() ? harmonyCtx.scale : 1.0) * item.mag()
        harmonyCtx.pos = harmonyCtx.pos.plus(a.vec().times(new FontMetrics(item.font()).capHeight() * scale))
    }

    private static renderActionMoveXHeight(item: Harmony, a: RenderActionMoveXHeight, harmonyCtx: HarmonyRenderCtx): void {
        const direction = a.up() ? -1 : 1
        const scale = a.scaled() ? harmonyCtx.scale : 1.0
        const fm = new FontMetrics(item.font())
        harmonyCtx.movey(direction * fm.xHeight() * scale)
    }
}
