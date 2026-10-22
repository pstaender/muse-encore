/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/continuouspanel.h/.cpp: in the continuous view (horizontal),
 * the panel at the left edge of the view with the staff names, clefs, key and time signatures and the measure number
 * at the left edge of the view (once the beginning of the score is scrolled out of the view).
 * The view (NotationViewContext) is given as the x position of its left edge on the page (xOffset / scaling) and
 * whether the beginning of the first measure is visible.
 */

import { PointF, RectF } from '../framework/draw/types/geometry'
import type { Painter } from '../framework/draw/painter'
import { Pen, PenStyle } from '../framework/draw/types/drawtypes'
import { Color } from '../framework/draw/types/color'
import type { Score } from '../engraving/dom/score'
import type { Measure } from '../engraving/dom/measure'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import { ElementFlag } from '../engraving/dom/engravingitem'
import { Text } from '../engraving/dom/text'
import { Clef } from '../engraving/dom/clef'
import { KeySig } from '../engraving/dom/keysig'
import { TimeSig, TimeSigType } from '../engraving/dom/timesig'
import { BarLine } from '../engraving/dom/barline'
import { StaffLines } from '../engraving/dom/stafflines'
import { BarLineType, TextStyleType } from '../engraving/types/types'
import { Sid } from '../engraving/style/styledef'
import { EngravingConfiguration } from '../engraving/internal/engravingconfiguration'
import { elementLessThan } from '../engraving/rendering/score/paint'
import { ScoreRenderer } from '../engraving/rendering/score/scorerenderer'
import { TLayout } from '../engraving/rendering/score/tlayout'
import { TDraw } from '../engraving/rendering/score/tdraw'
import { LayoutContext } from '../engraving/rendering/score/layoutcontext'
import type { PaintOptions } from '../engraving/rendering/paintoptions'

export interface ContinuousPanelViewContext {
    /** the x position of the left edge of the view in page (= canvas) coordinates: C++ -ctx.xOffset / ctx.scaling */
    left: number
}

export class ContinuousPanel {
    private m_width = 0
    private m_rect = new RectF()

    constructor(private m_score: Score) {}

    /** the width of the panel (page coordinates) */
    width(): number {
        return this.m_width
    }

    /** returns false if there is no panel to show */
    paint(painter: Painter, ctx: ContinuousPanelViewContext, opt: PaintOptions): boolean {
        const score = this.m_score

        const offsetPanel = ctx.left
        let y = 0
        let oldWidth = 0 // The last final panel width
        let newWidth = 0 // New panel width
        let height = 0
        let leftMarginTotal = 0 // Sum of all elements left margin
        const panelRightPadding = 5 // Extra space for the panel after last element

        let measure: Measure | null = score.firstMeasure()
        if (!measure) {
            return false
        }

        measure = measure.coveringMMRestOrThis()
        if (!measure) {
            return false
        }

        const system = measure.system()
        if (!system) {
            return false
        }

        const spatium = score.style().spatium()
        if (this.m_width <= 0) {
            this.m_width = measure.first()!.x()
        }

        //
        // Set panel height for whole system
        //
        height = 6 * spatium
        y = system.staffYpage(0) + system.page()!.pos().y()
        let y2 = 0.0
        const staffCount = score.nstaves()
        for (let i = 0; i < staffCount; ++i) {
            const ss = system.staff(i)!
            if (!ss.show() || !score.staff(i)!.show()) {
                continue
            }
            y2 = ss.y() + ss.bbox().height()
        }
        height += y2 + 6 * spatium
        y -= 6 * spatium

        //
        // Check elements at current panel position
        //

        this.m_rect = new RectF(offsetPanel + this.m_width, y, 1, height)

        const page = score.pages()[0]
        const el: EngravingItem[] = page.items(this.m_rect)
        if (el.length === 0) {
            return false
        }

        // std::stable_sort
        el.sort((a, b) => elementLessThan(a, b) ? -1 : elementLessThan(b, a) ? 1 : 0)

        let currentMeasure: Measure | null = null
        const showInvisible = score.isShowInvisible()
        for (const e of el) {
            if (!e.visible() && !showInvisible) {
                continue
            }

            if (e.isStaffLines()) {
                currentMeasure = (e as StaffLines).measure()
                break
            }
        }

        if (!currentMeasure) {
            return false
        }

        // Don't show panel if staff names are visible
        const canvasPosX = currentMeasure.canvasPos().x() - offsetPanel
        if (currentMeasure === score.firstMeasure() && canvasPosX > 0) {
            return false
        }

        let xPosMeasure = currentMeasure.canvasX()
        const measureWidth = currentMeasure.width()
        const tick = currentMeasure.tick()
        const currentTimeSigFraction = currentMeasure.timesig()

        //---------------------------------------------------------
        //   findElementWidths
        //      determines the max width for each element types
        //---------------------------------------------------------

        // The first pass serves to get the maximum width for each elements

        let lineWidthName = 0
        let widthClef = 0
        let widthKeySig = 0
        let widthTimeSig = 0
        const xPosTimeSig = 0

        // the parent of the temporary objects
        const seg = score.tick2segmentMM(tick)!

        const measureNumberText = new Text(seg, TextStyleType.DEFAULT)
        measureNumberText.setParent(seg)
        measureNumberText.setFlag(ElementFlag.MOVABLE, false)
        measureNumberText.setFamily('FreeSans')
        measureNumberText.setSizeIsSpatiumDependent(true)

        const staffNameTexts: Text[] = []
        const clefs: Clef[] = []
        const keySigs: KeySig[] = []
        const timeSigs: TimeSig[] = []
        const barLines: BarLine[] = []

        for (const e of el) {
            if (!e.visible() && !showInvisible) {
                continue
            }

            if (e.isStaffLines()) {
                const staffIdx = e.staffIdx()
                const currentStaff = score.staff(staffIdx)!
                const instrument = currentStaff.part()!.instrument(tick)

                // Staff name
                const staffNamesLong = instrument.longNames()
                let staffName = staffNamesLong.length === 0 ? '' : staffNamesLong[0].name()
                if (!staffName) {
                    const staffNamesShort = instrument.shortNames()
                    staffName = staffNamesShort.length === 0 ? '' : staffNamesShort[0].name()
                }

                const nameText = new Text(seg, TextStyleType.DEFAULT)
                nameText.setFlag(ElementFlag.MOVABLE, false)
                nameText.setFamily('FreeSans')
                nameText.setSizeIsSpatiumDependent(true)
                nameText.setParent(seg)
                nameText.setXmlText(staffName)
                nameText.setTrack(e.track())
                ScoreRenderer.layoutItem(nameText)
                nameText.setPlainText(nameText.plainText())
                ScoreRenderer.layoutItem(nameText)
                staffNameTexts[staffIdx] = nameText

                if (nameText.width() > lineWidthName && nameText.xmlText()) {
                    lineWidthName = nameText.width()
                }

                // Clef
                const clef = new Clef(seg)
                clef.setTrack(e.track())
                clef.setParent(seg)
                clef.setClefType(currentStaff.clef(tick))
                ScoreRenderer.layoutItem(clef)
                if (clef.width() > widthClef) {
                    widthClef = clef.width()
                }
                clefs[staffIdx] = clef

                // Key Signature
                const keySig = new KeySig(seg)
                keySig.setHideNaturals(true)
                keySig.setTrack(e.track())
                keySig.setParent(seg)
                keySig.setKeySigEvent(currentStaff.keySigEvent(tick))
                ScoreRenderer.layoutItem(keySig)
                if (keySig.width() > widthKeySig) {
                    widthKeySig = keySig.width()
                }
                keySigs[staffIdx] = keySig

                // Time Signature
                const timeSig = new TimeSig(seg)
                timeSig.setTrack(e.track())
                timeSig.setParent(seg)

                // Try to get local time signature, if not, get the current measure one
                const currentTimeSig = currentStaff.timeSig(tick)
                if (currentTimeSig) {
                    timeSig.setFrom(currentTimeSig)
                } else {
                    timeSig.setSig(currentTimeSigFraction, TimeSigType.NORMAL)
                }
                ScoreRenderer.layoutItem(timeSig)

                if (timeSig.width() > widthTimeSig) {
                    widthTimeSig = timeSig.width()
                }
                timeSigs[staffIdx] = timeSig

                // Bar line - layout and store
                const barLine = new BarLine(seg)
                barLine.setBarLineType(BarLineType.NORMAL)
                barLine.setTrack(e.track())
                barLine.setParent(seg)
                barLine.setSpanStaff(currentStaff.barLineSpan())
                barLine.setSpanFrom(currentStaff.barLineFrom())
                barLine.setSpanTo(currentStaff.barLineTo())
                ScoreRenderer.layoutItem(barLine)
                barLines[staffIdx] = barLine
            }
        }

        const clefLeftMargin = score.style().styleMM(Sid.clefLeftMargin)
        const keySigLeftMargin = score.style().styleMM(Sid.keysigLeftMargin)
        const timeSigLeftMargin = score.style().styleMM(Sid.timesigLeftMargin)

        leftMarginTotal = clefLeftMargin
        leftMarginTotal += keySigLeftMargin
        leftMarginTotal += timeSigLeftMargin

        newWidth = widthClef + widthKeySig + widthTimeSig + leftMarginTotal + panelRightPadding
        xPosMeasure -= offsetPanel

        lineWidthName += spatium + clefLeftMargin + widthClef
        if (newWidth < lineWidthName) {
            newWidth = lineWidthName
            oldWidth = 0
        }
        if (oldWidth === 0) {
            oldWidth = newWidth
            this.m_width = newWidth
        } else if (newWidth > 0) {
            if (newWidth === this.m_width) {
                oldWidth = this.m_width
                this.m_width = newWidth
            } else if (((xPosMeasure <= newWidth) && (xPosMeasure >= oldWidth))
                       || ((xPosMeasure >= newWidth) && (xPosMeasure <= oldWidth))) {
                this.m_width = xPosMeasure
            } else if (((xPosMeasure + measureWidth <= newWidth) && (xPosMeasure + measureWidth >= oldWidth))
                       || ((xPosMeasure + measureWidth >= newWidth) && (xPosMeasure + measureWidth <= oldWidth))) {
                this.m_width = xPosMeasure + measureWidth
            } else {
                oldWidth = this.m_width
                this.m_width = newWidth
            }
        }

        this.m_rect = new RectF(0, y, this.m_width, height)

        //====================

        painter.save()

        // Draw background rectangle
        let pos = new PointF(offsetPanel, 0)

        painter.translate(pos)
        const pen = new Pen()
        pen.setWidthF(0.0)
        pen.setStyle(PenStyle.NoPen)
        painter.setPen(pen)
        // NotationConfiguration::foregroundColor (the page color)
        const foregroundColor = Color.fromString('#ffffff')
        painter.setBrush(foregroundColor)

        const bg = this.m_rect.clone()
        bg.setWidth(widthClef + widthKeySig + widthTimeSig + leftMarginTotal + panelRightPadding)
        painter.fillRect(bg, foregroundColor)

        const color = EngravingConfiguration.invisibleColor()

        // Draw measure number
        measureNumberText.setXmlText(`#${currentMeasure.no() + 1}`)
        measureNumberText.setColor(color)
        ScoreRenderer.layoutText1(measureNumberText)
        pos = new PointF(clefLeftMargin + widthClef, y + measureNumberText.height())
        painter.translate(pos)
        TDraw.drawItem(measureNumberText, painter, opt)

        pos = pos.plus(new PointF(offsetPanel, 0))
        painter.translate(pos.times(-1))

        // This second pass draws the elements using already laid-out objects
        for (const e of el) {
            if (!e.visible() && !showInvisible) {
                continue
            }

            if (e.isStaffLines()) {
                painter.save()
                const staffIdx = e.staffIdx()
                const currentStaff = score.staff(staffIdx)!

                pos = new PointF(offsetPanel, e.pagePos().y())
                painter.translate(pos)

                // Staff lines
                const newStaffLines = new StaffLines(seg.measure())
                newStaffLines.setParent(seg.measure())
                newStaffLines.setTrack(e.track())
                TLayout.layoutForWidth(newStaffLines, bg.width(), new LayoutContext(newStaffLines.score()))
                newStaffLines.setColor(color)
                TDraw.drawItem(newStaffLines, painter, opt)

                // Barline
                const barLine = barLines[staffIdx]
                barLine.setColor(color)
                TDraw.drawItem(barLine, painter, opt)

                // Staff name
                if (currentStaff.part()!.staff(0) === currentStaff) {
                    pos = new PointF(clefLeftMargin + widthClef, -spatium * 2)
                    painter.translate(pos)
                    const staffNameText = staffNameTexts[staffIdx]
                    staffNameText.setColor(color)
                    TDraw.drawItem(staffNameText, painter, opt)

                    painter.translate(pos.times(-1))
                }

                let posX = 0.0

                // Clef
                const clef = clefs[staffIdx]
                clef.setColor(color)
                posX += clefLeftMargin
                const clefPos = new PointF(posX, clef.pos().y())
                painter.translate(clefPos)
                TDraw.drawItem(clef, painter, opt)
                painter.translate(clefPos.times(-1))
                posX += widthClef

                // Key signature
                const keySig = keySigs[staffIdx]
                keySig.setColor(color)
                posX += keySigLeftMargin
                const ksPos = new PointF(posX, 0.0)
                painter.translate(ksPos)
                TDraw.drawItem(keySig, painter, opt)
                painter.translate(ksPos.times(-1))

                posX += widthKeySig + xPosTimeSig

                // Time signature
                const timeSig = timeSigs[staffIdx]
                timeSig.setColor(color)
                posX += timeSigLeftMargin
                const tsPos = new PointF(posX, 0.0)
                painter.translate(tsPos)
                TDraw.drawItem(timeSig, painter, opt)
                painter.translate(tsPos.times(-1))

                painter.restore()
            }
        }

        painter.restore()
        return true
    }
}
