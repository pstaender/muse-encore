/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The logic of MuseScore's Page Settings dialog (src/notationscene/widgets/pagesettings.cpp, action "page-settings"):
 * the values of its widgets (`values`, the spin boxes rounded and clamped like QDoubleSpinBox) and the slots of the
 * widgets, which change the style of the score at once (one undo command from show() to accept()). The app's dialog
 * shows `values` and calls the slots on user input.
 */

import { TranslatableString } from '../framework/global/types/translatablestring'
import { QPageSize, QPageSizeUnit, SizeMatchPolicy } from '../framework/draw/qpagesize'
import { DPI, DPMM, INCH } from '../engraving/types/types'
import { Sid } from '../engraving/style/styledef'
import { pageStyles } from '../engraving/style/pagestyle'
import type { PropertyValue } from '../engraving/types/propertyvalue'
import type { Score } from '../engraving/dom/score'
import type { NotationStyle } from '../notation/internal/notationstyle'
import type { NotationUndoStack } from '../notation/internal/notationundostack'

/** the double spin boxes of the dialog (their objectNames) */
export type PageSettingsSpinBox = 'oddPageTopMargin' | 'oddPageBottomMargin' | 'oddPageLeftMargin' | 'oddPageRightMargin'
    | 'evenPageTopMargin' | 'evenPageBottomMargin' | 'evenPageLeftMargin' | 'evenPageRightMargin' | 'spatiumEntry'
    | 'pageWidth' | 'pageHeight'

export const PAGE_SETTINGS_SPIN_BOXES: readonly PageSettingsSpinBox[] = [
    'oddPageTopMargin', 'oddPageBottomMargin', 'oddPageLeftMargin', 'oddPageRightMargin', 'evenPageTopMargin',
    'evenPageBottomMargin', 'evenPageLeftMargin', 'evenPageRightMargin', 'spatiumEntry', 'pageWidth', 'pageHeight',
]

interface SpinBox {
    value: number
    minimum: number
    maximum: number
    decimals: number
    singleStep: number
    enabled: boolean
}

export interface PageSettingsValues {
    spinBoxes: Record<PageSettingsSpinBox, SpinBox>
    /** the suffix of the spin boxes ("mm" / "in", translated by the app: context "global") */
    unitSuffix: 'mm' | 'in'
    /** the index of the page size combo box (QPageSize::PageSizeId) */
    pageGroup: number
    portrait: boolean
    landscape: boolean
    twosided: boolean
    /** "First page number" */
    pageOffsetEntry: number
    mmUnit: boolean
}

/** a page size of the combo box: its QPageSize id and name */
export interface PageSizeItem {
    id: number
    name: string
}

const SPIN_MAX = 2000

export class PageSettings {
    private mmUnit: boolean
    private _changeFlag = false
    private m_values: PageSettingsValues

    constructor(private m_score: Score, private m_style: NotationStyle, private m_undoStack: NotationUndoStack,
        metricUnit: boolean, private m_setMetricUnit: (mm: boolean) => void = () => {}) {
        this.mmUnit = metricUnit
        const spin = (decimals = 2, minimum = 0, maximum = SPIN_MAX): SpinBox => ({
            value: 0, minimum, maximum, decimals, singleStep: 1, enabled: true,
        })
        this.m_values = {
            spinBoxes: {
                oddPageTopMargin: spin(), oddPageBottomMargin: spin(), oddPageLeftMargin: spin(), oddPageRightMargin: spin(),
                evenPageTopMargin: spin(), evenPageBottomMargin: spin(), evenPageLeftMargin: spin(), evenPageRightMargin: spin(),
                spatiumEntry: spin(3, 0.001, 999.99), pageWidth: spin(), pageHeight: spin(),
            },
            unitSuffix: metricUnit ? 'mm' : 'in',
            pageGroup: 0,
            portrait: true,
            landscape: false,
            twosided: false,
            pageOffsetEntry: 1,
            mmUnit: metricUnit,
        }
    }

    /** the items of the page size combo box (the loop over QPageSize ids up to LastPageSize, exclusive) */
    static pageSizes(): PageSizeItem[] {
        const items: PageSizeItem[] = []
        for (let i = 0; i < QPageSize.LastPageSize; ++i) {
            items.push({ id: i, name: QPageSize.name(i) })
        }
        return items
    }

    values(): PageSettingsValues {
        return this.m_values
    }

    canApplyToAllParts(): boolean {
        return this.m_style.canApplyToAllParts()
    }

    /** PageSettings::showEvent */
    show(): void {
        this.m_undoStack.prepareChanges(new TranslatableString('undoableAction', 'Edit page settings'))
        this.updateValues()
    }

    // ---- widgets (QDoubleSpinBox::setValue rounds to the decimals and clamps) ----

    private spin(name: PageSettingsSpinBox): SpinBox {
        return this.m_values.spinBoxes[name]
    }

    private value(name: PageSettingsSpinBox): number {
        return this.spin(name).value
    }

    private setValue(name: PageSettingsSpinBox, v: number): void {
        const s = this.spin(name)
        const f = Math.pow(10, s.decimals)
        s.value = Math.min(s.maximum, Math.max(s.minimum, Math.round(v * f) / f))
    }

    /** the value a spin box takes for the user's input (QDoubleSpinBox rounding and range) */
    fixupValue(name: PageSettingsSpinBox, v: number): number {
        const s = this.spin(name)
        const f = Math.pow(10, s.decimals)
        return Math.min(s.maximum, Math.max(s.minimum, Math.round(v * f) / f))
    }

    private setMarginsMax(pw: number): void {
        for (const name of ['oddPageLeftMargin', 'oddPageRightMargin', 'evenPageLeftMargin', 'evenPageRightMargin'] as const) {
            this.spin(name).maximum = pw
            this.setValue(name, this.value(name))
        }
    }

    private score(): Score {
        return this.m_score
    }

    private styleValueDouble(styleId: Sid): number {
        return this.m_style.styleValue(styleId) as number
    }

    private styleValueBool(styleId: Sid): boolean {
        return this.m_style.styleValue(styleId) as boolean
    }

    private setStyleValue(styleId: Sid, newValue: PropertyValue): void {
        this.m_style.setStyleValue(styleId, newValue)
    }

    // ---------------------------------------------------------
    //   updateValues
    //    set gui values from style
    // ---------------------------------------------------------

    updateValues(): void {
        const mm = this.mmUnit
        const v = this.m_values

        let singleStepSize: number
        let singleStepScale: number
        if (mm) {
            v.unitSuffix = 'mm'
            singleStepSize = 1.0
            singleStepScale = 0.05
        } else {
            v.unitSuffix = 'in'
            singleStepSize = 0.05
            singleStepScale = 0.002
        }
        for (const name of PAGE_SETTINGS_SPIN_BOXES) {
            this.spin(name).singleStep = singleStepSize
        }
        this.spin('spatiumEntry').singleStep = singleStepScale
        v.mmUnit = mm

        const f = mm ? INCH : 1.0

        const w = this.styleValueDouble(Sid.pageWidth)
        const h = this.styleValueDouble(Sid.pageHeight)
        this.setMarginsMax(w * f)

        const pw = this.styleValueDouble(Sid.pagePrintableWidth)
        v.pageGroup = QPageSize.id(w, h, QPageSizeUnit.Inch, SizeMatchPolicy.FuzzyOrientationMatch)

        this.setValue('oddPageTopMargin', this.styleValueDouble(Sid.pageOddTopMargin) * f)
        this.setValue('oddPageBottomMargin', this.styleValueDouble(Sid.pageOddBottomMargin) * f)
        this.setValue('oddPageLeftMargin', this.styleValueDouble(Sid.pageOddLeftMargin) * f)
        this.setValue('oddPageRightMargin', (w - pw - this.styleValueDouble(Sid.pageOddLeftMargin)) * f)

        this.setValue('evenPageTopMargin', this.styleValueDouble(Sid.pageEvenTopMargin) * f)
        this.setValue('evenPageBottomMargin', this.styleValueDouble(Sid.pageEvenBottomMargin) * f)
        this.setValue('evenPageLeftMargin', this.styleValueDouble(Sid.pageEvenLeftMargin) * f)
        this.setValue('evenPageRightMargin', (w - pw - this.styleValueDouble(Sid.pageEvenLeftMargin)) * f)
        this.setValue('pageHeight', h * f)
        this.setValue('pageWidth', w * f)

        const f1 = mm ? 1.0 / DPMM : 1.0 / DPI
        this.setValue('spatiumEntry', this.score().style().spatium() * f1)

        const _twosided = this.styleValueBool(Sid.pageTwosided)
        this.spin('evenPageTopMargin').enabled = _twosided
        this.spin('evenPageBottomMargin').enabled = _twosided
        this.spin('evenPageLeftMargin').enabled = _twosided
        this.spin('evenPageRightMargin').enabled = _twosided

        if (v.twosided) {
            this.setValue('evenPageRightMargin', this.value('oddPageLeftMargin'))
            this.setValue('evenPageLeftMargin', this.value('oddPageRightMargin'))
        } else {
            this.setValue('evenPageRightMargin', this.value('oddPageRightMargin'))
            this.setValue('evenPageLeftMargin', this.value('oddPageLeftMargin'))
        }

        v.landscape = this.styleValueDouble(Sid.pageWidth) > this.styleValueDouble(Sid.pageHeight)
        v.portrait = this.styleValueDouble(Sid.pageWidth) <= this.styleValueDouble(Sid.pageHeight)

        v.twosided = _twosided

        v.pageOffsetEntry = this.score().pageNumberOffset() + 1

        this._changeFlag = true
    }

    inchClicked(): void {
        this.mmUnit = false
        this.m_setMetricUnit(false)
        this.updateValues()
    }

    mmClicked(): void {
        this.mmUnit = true
        this.m_setMetricUnit(true)
        this.updateValues()
    }

    // ---------------------------------------------------------
    //   orientationClicked
    //    swap width/height
    // ---------------------------------------------------------

    orientationClicked(): void {
        const w = this.styleValueDouble(Sid.pageWidth)
        const h = this.styleValueDouble(Sid.pageHeight)

        this.setStyleValue(Sid.pageWidth, h)
        this.setStyleValue(Sid.pageHeight, w)

        const f = this.mmUnit ? 1.0 / INCH : 1.0
        this.setStyleValue(Sid.pagePrintableWidth, h - (this.value('oddPageLeftMargin') + this.value('oddPageRightMargin')) * f)
        this.updateValues()
    }

    /** on_resetPageStyleButton_clicked */
    resetPageStyle(): void {
        this.score().undoChangePageNumberOffset(0)
        this.m_style.resetStyleValues(pageStyles())
        this.updateValues()
    }

    twosidedToggled(flag: boolean): void {
        this.m_values.twosided = flag
        this.setStyleValue(Sid.pageTwosided, flag)
        this.updateValues()
    }

    accept(): void {
        this.m_undoStack.commitChanges()
        this.m_style.styleChanged().notify()
    }

    reject(): void {
        this.m_undoStack.rollbackChanges()
        this.m_style.styleChanged().notify()
    }

    private applyToScore(s: Score): void {
        const f = this.mmUnit ? 1.0 / INCH : 1.0
        const f1 = this.mmUnit ? DPMM : DPI

        const values = new Map<Sid, PropertyValue>()
        values.set(Sid.pageWidth, this.value('pageWidth') * f)
        values.set(Sid.pageHeight, this.value('pageHeight') * f)
        values.set(Sid.pagePrintableWidth, (this.value('pageWidth') - this.value('oddPageLeftMargin') - this.value('oddPageRightMargin')) * f)
        values.set(Sid.pageEvenTopMargin, this.value('evenPageTopMargin') * f)
        values.set(Sid.pageEvenBottomMargin, this.value('evenPageBottomMargin') * f)
        values.set(Sid.pageEvenLeftMargin, this.value('evenPageLeftMargin') * f)
        values.set(Sid.pageOddTopMargin, this.value('oddPageTopMargin') * f)
        values.set(Sid.pageOddBottomMargin, this.value('oddPageBottomMargin') * f)
        values.set(Sid.pageOddLeftMargin, this.value('oddPageLeftMargin') * f)
        values.set(Sid.pageTwosided, this.m_values.twosided)
        values.set(Sid.spatium, this.value('spatiumEntry') * f1)

        s.undoChangeStyleValues(values)
        s.undoChangePageNumberOffset(this.m_values.pageOffsetEntry - 1)
    }

    applyToAllParts(): void {
        if (!this._changeFlag) {
            return
        }
        for (const e of this.score().masterScore().excerpts()) {
            const excerptScore = e.excerptScore()
            if (excerptScore) {
                this.applyToScore(excerptScore)
            }
        }
        this._changeFlag = false
    }

    pageFormatSelected(size: number): void {
        if (size >= 0) {
            this.m_values.pageGroup = size
            const landscape = this.m_values.landscape
            const sz = QPageSize.size(size, QPageSizeUnit.Inch)
            if (!sz) {
                // C++: QPageSize::size(Custom) is an invalid size (-1 x -1)
                return
            }

            this.setStyleValue(Sid.pageWidth, landscape ? sz[1] : sz[0])
            this.setStyleValue(Sid.pageHeight, landscape ? sz[0] : sz[1])

            const f = this.mmUnit ? 1.0 / INCH : 1.0
            this.setStyleValue(Sid.pagePrintableWidth,
                (landscape ? sz[1] : sz[0]) - (this.value('oddPageLeftMargin') + this.value('oddPageRightMargin')) * f)
            this.updateValues()
        }
    }

    /** a spin box changed by the user (QDoubleSpinBox::valueChanged): sets its value and calls its slot */
    spinBoxChanged(name: PageSettingsSpinBox, val: number): void {
        val = this.fixupValue(name, val)
        if (val === this.value(name)) {
            return
        }
        this.spin(name).value = val
        switch (name) {
        case 'oddPageTopMargin': this.otmChanged(val); break
        case 'oddPageBottomMargin': this.obmChanged(val); break
        case 'oddPageLeftMargin': this.olmChanged(val); break
        case 'oddPageRightMargin': this.ormChanged(val); break
        case 'evenPageTopMargin': this.etmChanged(val); break
        case 'evenPageBottomMargin': this.ebmChanged(val); break
        case 'evenPageLeftMargin': this.elmChanged(val); break
        case 'evenPageRightMargin': this.ermChanged(val); break
        case 'spatiumEntry': this.spatiumChanged(val); break
        case 'pageWidth': this.pageWidthChanged(val); break
        case 'pageHeight': this.pageHeightChanged(val); break
        }
    }

    private otmChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }
        this.setStyleValue(Sid.pageOddTopMargin, val)
    }

    private olmChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }

        if (this.m_values.twosided) {
            this.setValue('evenPageRightMargin', val * (this.mmUnit ? INCH : 1.0))
        } else {
            this.setValue('evenPageLeftMargin', val * (this.mmUnit ? INCH : 1.0))
        }

        this.setStyleValue(Sid.pageOddLeftMargin, val)
        this.setStyleValue(Sid.pagePrintableWidth, this.styleValueDouble(Sid.pageWidth) - this.styleValueDouble(Sid.pageEvenLeftMargin) - val)
    }

    private ormChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }

        if (this.m_values.twosided) {
            this.setValue('evenPageLeftMargin', val * (this.mmUnit ? INCH : 1.0))
            this.setStyleValue(Sid.pageEvenLeftMargin, val)
        } else {
            this.setValue('evenPageRightMargin', val * (this.mmUnit ? INCH : 1.0))
        }
        this.setStyleValue(Sid.pagePrintableWidth, this.styleValueDouble(Sid.pageWidth) - this.styleValueDouble(Sid.pageOddLeftMargin) - val)
    }

    private obmChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }
        this.setStyleValue(Sid.pageOddBottomMargin, val)
    }

    private etmChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }
        this.setStyleValue(Sid.pageEvenTopMargin, val)
    }

    private elmChanged(val: number): void {
        const f = this.mmUnit ? 1.0 / INCH : 1.0
        val *= f

        if (this.m_values.twosided) {
            this.setValue('oddPageRightMargin', val * (this.mmUnit ? INCH : 1.0))
        }

        this.setStyleValue(Sid.pageEvenLeftMargin, val)
        this.setStyleValue(Sid.pagePrintableWidth, this.styleValueDouble(Sid.pageWidth) - this.value('evenPageRightMargin') * f - val)
    }

    private ermChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }

        if (this.m_values.twosided) {
            this.setValue('oddPageLeftMargin', val * (this.mmUnit ? INCH : 1.0))
        }

        this.setStyleValue(Sid.pagePrintableWidth, this.styleValueDouble(Sid.pageWidth) - this.styleValueDouble(Sid.pageEvenLeftMargin) - val)
        this.setStyleValue(Sid.pageOddLeftMargin, val)
    }

    private ebmChanged(val: number): void {
        if (this.mmUnit) {
            val /= INCH
        }
        this.setStyleValue(Sid.pageEvenBottomMargin, val)
    }

    private spatiumChanged(val: number): void {
        val *= this.mmUnit ? DPMM : DPI
        this.setStyleValue(Sid.spatium, val) // this will also call Score::spatiumChanged()
    }

    pageOffsetChanged(val: number): void {
        val = Math.max(-999999, Math.min(999999, Math.round(val)))
        if (val === this.m_values.pageOffsetEntry) {
            return
        }
        this.m_values.pageOffsetEntry = val
        this.score().undoChangePageNumberOffset(val - 1)
        // C++ notationChanged().notify(): the app redraws after every slot
        this.score().update()
    }

    private pageHeightChanged(val: number): void {
        let val2 = this.value('pageWidth')
        if (this.mmUnit) {
            val /= INCH
            val2 /= INCH
        }
        this.m_values.pageGroup = 0 // custom (C++: index 0, which is Letter in Qt 6)

        this.setStyleValue(Sid.pageHeight, val)
        this.setStyleValue(Sid.pageWidth, val2)
    }

    private pageWidthChanged(val: number): void {
        this.setMarginsMax(val)

        const f = this.mmUnit ? 1.0 / INCH : 1.0
        const val2 = this.value('pageHeight') * f
        val *= f
        this.m_values.pageGroup = 0 // custom (C++: index 0, which is Letter in Qt 6)

        this.setStyleValue(Sid.pageWidth, val)
        this.setStyleValue(Sid.pageHeight, val2)
        this.setStyleValue(Sid.pagePrintableWidth, val - (this.value('oddPageLeftMargin') + this.value('evenPageLeftMargin')) * f)
    }
}
