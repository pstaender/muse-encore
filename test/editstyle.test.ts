// SPDX-License-Identifier: GPL-3.0-only
// The Style dialog (MuseScore's EditStyle, editstyle.cpp): the widgets of editstyle.ui show the style values,
// changes of the widgets change the style (through the undo stack), reset buttons, text styles, OK/Cancel.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
    ALL_PAGE_CODES, ALL_TEXT_STYLE_SUBPAGE_CODES, Align, AlignH, AlignV, BUTTON_GROUPS, Color, EditStyle, PAGE_LIST, PointF,
    STYLE_WIDGETS, Sid, createEditStyle, createScore, defaultNewScoreOptions, layoutScore, undo, type MasterScore,
} from '../src/index'
import { Spatium } from '../src/engraving/types/dimension'
import { initFonts, scoreHash } from './helpers'

function newScore(): MasterScore {
    const score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
    layoutScore(score)
    return score
}

describe('Style dialog (EditStyle)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('has the widgets of the style widgets, the pages and the text styles', () => {
        for (const sw of STYLE_WIDGETS) {
            expect(EditStyle.hasWidget(sw.widget) || BUTTON_GROUPS.has(sw.widget), sw.widget).toBe(true)
            if (sw.reset) {
                expect(EditStyle.hasWidget(sw.reset), sw.reset).toBe(true)
            }
        }
        for (const [, buttons] of BUTTON_GROUPS) {
            for (const [b] of buttons) {
                expect(EditStyle.hasWidget(b), b).toBe(true)
            }
        }
        expect(PAGE_LIST.i!.length).toBe(ALL_PAGE_CODES.length)

        const score = newScore()
        const es = createEditStyle(score)
        expect(es.widget('textStyles').items.length).toBe(ALL_TEXT_STYLE_SUBPAGE_CODES.length)
    })

    it('shows the style values in the widgets', () => {
        const score = newScore()
        const es = createEditStyle(score)
        const warn = vi.spyOn(console, 'warn')
        es.show()
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()

        // spatium values, percent values, combo boxes, button groups, offsets
        expect(es.widget('staffUpperBorder').value).toBeCloseTo((score.style().styleV(Sid.staffUpperBorder) as Spatium).val())
        expect(es.widget('graceNoteSize').value).toBe(Math.trunc(score.style().styleD(Sid.graceNoteMag) * 100))
        expect(es.widget('musicalSymbolFont').currentData()).toBe('Leland')
        expect(es.widget('tupletNumberType').currentIndex).toBe(0)
        expect(es.widget('radioKeySigCourtesyBarlineAlwaysSingle').checked
            || es.widget('radioKeySigCourtesyBarlineAlwaysDouble').checked
            || es.widget('radioKeySigCourtesyBarlineDoubleBeforeNewSystem').checked).toBe(true)
        expect(es.widget('hairpinPosBelow').offset.equals(score.style().styleV(Sid.hairpinPosBelow) as PointF)).toBe(true)
        expect(es.widget('resetStaffUpperBorder').enabled).toBe(false)
        expect(es.widget('showHeader').checked).toBe(score.style().styleB(Sid.showHeader))
        for (const sw of STYLE_WIDGETS) {
            const st = es.widget(BUTTON_GROUPS.get(sw.widget)?.[0][0] ?? sw.widget)
            if (st.cls === 'QComboBox') {
                expect(st.currentIndex, sw.widget).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it('changes the style, resets values, commits and rolls back', () => {
        const score = newScore()
        const before = scoreHash(score)
        const es = createEditStyle(score)
        es.show()

        es.setValue('staffUpperBorder', 9)
        expect((score.style().styleV(Sid.staffUpperBorder) as Spatium).val()).toBe(9)
        expect(es.widget('resetStaffUpperBorder').enabled).toBe(true)
        es.click('resetStaffUpperBorder')
        expect((score.style().styleV(Sid.staffUpperBorder) as Spatium).val()).toBe(7)
        expect(es.widget('staffUpperBorder').value).toBe(7)

        // percent
        es.setValue('graceNoteSize', 50)
        expect(score.style().styleD(Sid.graceNoteMag)).toBeCloseTo(0.5)

        // check box, radio buttons of a button group, combo box, offset
        es.click('hideEmptyStaves', true)
        expect(score.style().styleB(Sid.hideEmptyStaves)).toBe(true)
        es.click('radioKeySigCourtesyBarlineAlwaysDouble', true)
        expect(es.widget('radioKeySigCourtesyBarlineAlwaysSingle').checked).toBe(false)
        expect(score.style().styleI(Sid.keySigCourtesyBarlineMode)).toBe(1)
        es.setCurrentIndex('tupletNumberType', 1)
        expect(score.style().styleI(Sid.tupletNumberType)).toBe(1)
        es.setOffset('hairpinPosBelow', new PointF(0, 4))
        expect((score.style().styleV(Sid.hairpinPosBelow) as PointF).y()).toBe(4)

        // line style: the dash widgets are only visible for dashed lines
        es.setCurrentIndex('ottavaLineStyle', 0)
        expect(es.widget('ottavaLineStyleDashSize').visible).toBe(false)
        es.setCurrentIndex('ottavaLineStyle', 1)
        expect(es.widget('ottavaLineStyleDashSize').visible).toBe(true)

        // Cancel: all changes are rolled back
        es.reject()
        layoutScore(score)
        expect(scoreHash(score)).toBe(before)
        expect(score.style().styleB(Sid.hideEmptyStaves)).toBe(false)

        // OK: one undo step
        const es2 = createEditStyle(score)
        es2.show()
        es2.setValue('spacingDensity', 120)
        es2.click('hideEmptyStaves', true)
        es2.accept()
        expect(score.style().styleB(Sid.hideEmptyStaves)).toBe(true)
        expect(score.style().styleD(Sid.spacingDensity)).toBeCloseTo(1.2)
        undo(score)
        expect(score.style().styleB(Sid.hideEmptyStaves)).toBe(false)
        expect(scoreHash(score)).toBe(before)
    })

    it('edits text styles and goes to text style pages', () => {
        const score = newScore()
        const es = createEditStyle(score)
        es.show()

        es.goToTextStylePage('title')
        expect(es.currentPageCode()).toBe('text-styles')
        expect(es.currentSubPageCode()).toBe('title')
        expect(es.widget('textStyleFontSize').value).toBe(score.style().styleD(Sid.titleFontSize))

        es.setValue('textStyleFontSize', 30)
        expect(score.style().styleD(Sid.titleFontSize)).toBe(30)
        expect(es.widget('resetTextStyleFontSize').enabled).toBe(true)
        es.setAlign('textStyleAlign', new Align(AlignH.LEFT, AlignV.BOTTOM))
        expect((score.style().styleV(Sid.titleAlign) as Align).vertical).toBe(AlignV.BOTTOM)
        es.setColor('textStyleColor', new Color(255, 0, 0))
        expect((score.style().styleV(Sid.titleColor) as Color).r).toBe(255)
        es.click('resetTextStyleFontSize')
        expect(score.style().styleD(Sid.titleFontSize)).toBe(22)

        // user style names
        es.goToTextStylePage('user1')
        expect(es.widget('styleName').enabled).toBe(true)
        es.setText('styleName', 'My style')
        es.editingFinished('styleName')
        expect(score.style().styleSt(Sid.user1Name)).toBe('My style')
        expect(es.widget('textStyles').items[es.widget('textStyles').currentIndex].text.translated()).toBe('My style')
        es.reject()
    })

    it('resets all styles', () => {
        const score = newScore()
        const es = createEditStyle(score)
        es.show()
        es.click('hideEmptyStaves', true)
        es.setValue('staffDistance', 8)
        es.click('resetStylesButton')
        expect(score.style().styleB(Sid.hideEmptyStaves)).toBe(false)
        expect(es.widget('staffDistance').value).toBe(6.5)
        es.accept()
    })
})
