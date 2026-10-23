// SPDX-License-Identifier: GPL-3.0-only
// The Format menu: stretch, the reset commands, system locks (MuseScore's system_locks_tests.cpp and "Measures per
// system"), the Page Settings dialog logic (PageSettings), load/save style and QPageSize.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    AddRemoveSystemLockType, addRemoveSystemLocks, createPageSettings, executeAction, layoutScore, loadScore,
    notationStyle, prepareBreaksDialog, undo, contextMenuItems, type ContextMenuItem, type MasterScore,
} from '../src/index'
import { SelectType } from '../src/engraving/dom/select'
import { Sid } from '../src/engraving/style/styledef'
import { EditSystemLocks } from '../src/engraving/editing/editsystemlocks'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import { QPageSize, QPageSizeUnit, SizeMatchPolicy } from '../src/framework/draw/qpagesize'
import { BeamMode } from '../src/engraving/types/types'
import { Pid } from '../src/engraving/dom/property'
import { EditStyleUtils } from '../src/notationscene/editstyleutils'
import { EngravingConfiguration } from '../src/engraving/internal/engravingconfiguration'
import { PointF } from '../src/framework/draw/types/geometry'
import type { MeasureBase } from '../src/engraving/dom/measurebase'
import type { Measure } from '../src/engraving/dom/measure'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import type { Chord } from '../src/engraving/dom/chord'
import { SegmentType } from '../src/engraving/dom/segment'
import { ROOT, initFonts, scoreHash } from './helpers'

const LOCKS = `${ROOT}MuseScore/src/engraving/tests/system_locks_data/`
const VTEST = `${ROOT}MuseScore/vtest/scores/`

function open(path: string): MasterScore {
    const score = loadScore(readFileSync(path))
    layoutScore(score)
    return score
}

function cmd(score: MasterScore, f: () => void): void {
    score.startCmd(TranslatableString.untranslatable('Engraving system locks tests'))
    f()
    score.endCmd()
}

function lockMeasureCount(start: MeasureBase, end: MeasureBase): number {
    let measureCount = 0
    for (let mb: MeasureBase | null = start; mb && mb.isBeforeOrEqual(end); mb = mb.next()) {
        ++measureCount
    }
    return measureCount
}

describe.skipIf(!existsSync(LOCKS))('system locks (MuseScore system_locks_tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('readLocksFromFile', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const locks = score.systemLocks().allLocks()
        expect(locks.length).toBeGreaterThan(0)
        for (let mb = score.first(); mb; mb = mb.next()) {
            expect(mb.systemLock()).toBeTruthy()
        }
        for (const sys of score.systems()) {
            expect(sys.isLocked()).toBe(true)
        }
        for (const lock of locks) {
            expect(lockMeasureCount(lock.startMB(), lock.endMB())).toBe(4)
        }
    })

    it('lockMeasuresPerSystem', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const systemLocks = score.systemLocks()
        expect(systemLocks.allLocks().length).toBeGreaterThan(0)

        cmd(score, () => score.cmdSelectAll())
        cmd(score, () => EditSystemLocks.addRemoveSystemLocks(score, 0, false)) // Remove all locks
        expect(systemLocks.allLocks()).toEqual([])

        const starts = score.systems().map(s => s.first())
        const ends = score.systems().map(s => s.last())

        cmd(score, () => EditSystemLocks.addRemoveSystemLocks(score, 0, true)) // Lock current layout
        for (const mb of starts) {
            expect(mb.isStartOfSystemLock()).toBe(true)
        }
        for (const mb of ends) {
            expect(mb.isEndOfSystemLock()).toBe(true)
        }

        cmd(score, () => EditSystemLocks.addRemoveSystemLocks(score, 4, false)) // Add locks every 4 measures
        for (const lock of systemLocks.allLocks()) {
            expect(lockMeasureCount(lock.startMB(), lock.endMB())).toBe(4)
        }
    })

    it('makeIntoSystem', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const thirdMeasure = score.first()!.next()!.next()!
        const sixthMeasure = thirdMeasure.next()!.next()!.next()!
        expect(thirdMeasure.system()).not.toBe(sixthMeasure.system())

        cmd(score, () => EditSystemLocks.makeIntoSystem(score, thirdMeasure, sixthMeasure))

        expect(thirdMeasure.prev()!.isEndOfSystemLock()).toBe(true)
        expect(thirdMeasure.isStartOfSystemLock()).toBe(true)
        expect(sixthMeasure.isEndOfSystemLock()).toBe(true)
        expect(sixthMeasure.next()!.isStartOfSystemLock()).toBe(true)
        // the layout follows the locks
        expect(thirdMeasure.system()).toBe(sixthMeasure.system())
        expect(thirdMeasure.system()!.first()).toBe(thirdMeasure)
    })

    it('moveToPreviousNext', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const thirdMeasure = score.first()!.next()!.next()!
        const sixthMeasure = thirdMeasure.next()!.next()!.next()!
        expect(thirdMeasure.system()).not.toBe(sixthMeasure.system())

        cmd(score, () => EditSystemLocks.moveMeasureToPrevSystem(score, sixthMeasure))
        expect(sixthMeasure.isEndOfSystemLock()).toBe(true)
        expect(sixthMeasure.next()!.isStartOfSystemLock()).toBe(true)

        cmd(score, () => EditSystemLocks.moveMeasureToNextSystem(score, thirdMeasure))
        expect(thirdMeasure.prev()!.isEndOfSystemLock()).toBe(true)
        expect(thirdMeasure.isStartOfSystemLock()).toBe(true)
    })

    it('toggleSystemLock', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        expect(score.systems()[0].isLocked()).toBe(true)

        score.select(score.first(), SelectType.RANGE)

        cmd(score, () => EditSystemLocks.toggleSystemLock(score, score.selection().selectedSystems()))
        expect(score.systems()[0].isLocked()).toBe(false)

        cmd(score, () => EditSystemLocks.toggleSystemLock(score, score.selection().selectedSystems()))
        expect(score.systems()[0].isLocked()).toBe(true)

        cmd(score, () => EditSystemLocks.toggleScoreLock(score))
        for (const sys of score.systems()) {
            expect(sys.isLocked()).toBe(false)
        }

        cmd(score, () => EditSystemLocks.toggleScoreLock(score))
        for (const sys of score.systems()) {
            expect(sys.isLocked()).toBe(true)
        }
    })

    it('Measures per system (BreaksDialog) locks every n measures, undo restores the layout', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const before = scoreHash(score)
        const { allSelected } = prepareBreaksDialog(score)
        expect(allSelected).toBe(true)
        addRemoveSystemLocks(score, AddRemoveSystemLockType.MeasuresInterval, 3, allSelected)
        expect(score.selection().isNone()).toBe(true)
        const systems = score.systems().filter(s => s.first().isMeasure())
        for (const sys of systems.slice(0, -1)) {
            expect(sys.measures().length).toBe(3)
        }
        undo(score)
        expect(scoreHash(score)).toBe(before)
    })

    it('lays out a lock indicator for locked systems (when icons are laid out), deletes the lock with it', () => {
        EngravingConfiguration.setCanLayoutIcons(true)
        try {
            const score = open(`${LOCKS}system_locks-1.mscx`)
            const system = score.systems()[0]
            expect(system.lockIndicators().length).toBe(1)
            const sli = system.lockIndicators()[0]
            expect(sli.systemLock()).toBe(score.systemLocks().lockStartingAt(system.first()))
            expect(sli.formatBarsAndBeats()).toBe('Start measure: 1; End measure: 4')
            score.select(sli, SelectType.SINGLE)
            expect(executeAction(score, 'action://notation/delete')).toBe(true)
            expect(score.systemLocks().lockStartingAt(score.first()!)).toBeNull()
            expect(score.systems()[0].isLocked()).toBe(false)
        } finally {
            EngravingConfiguration.setCanLayoutIcons(false)
        }
    })

    it('a line break removes the lock containing the measure', () => {
        const score = open(`${LOCKS}system_locks-1.mscx`)
        const m = score.first()!.next()!
        expect(m.systemLock()).toBeTruthy()
        score.select(m, SelectType.SINGLE)
        executeAction(score, 'system-break')
        expect(m.systemLock()).toBeNull()
        expect(m.lineBreak()).toBe(true)
    })
})

describe.skipIf(!existsSync(VTEST))('Format menu commands', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('increases, decreases and resets the stretch of the selected measures', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        const m1 = score.firstMeasure()!
        const m2 = m1.nextMeasure()!
        score.select(m1, SelectType.RANGE, 0)
        score.select(m2, SelectType.RANGE, 0)
        expect(executeAction(score, 'stretch+')).toBe(true)
        expect(m1.userStretch()).toBeCloseTo(1.1)
        expect(m2.userStretch()).toBeCloseTo(1.1)
        expect(m2.nextMeasure()!.userStretch()).toBe(1)
        executeAction(score, 'stretch-')
        executeAction(score, 'stretch-')
        expect(m1.userStretch()).toBeCloseTo(0.9)
        executeAction(score, 'reset-stretch')
        expect(m1.userStretch()).toBe(1)
        undo(score)
        expect(m1.userStretch()).toBeCloseTo(0.9)
    })

    it('resets the beam modes of the score without a selection', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        const cr = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as ChordRest
        score.startCmd()
        cr.undoChangeProperty(Pid.BEAM_MODE, BeamMode.NONE)
        score.endCmd()
        score.deselectAll()
        expect(executeAction(score, 'reset-beammode')).toBe(true)
        expect(cr.beamMode()).toBe(cr.isChord() ? BeamMode.AUTO : BeamMode.NONE)
        expect(score.selection().isNone()).toBe(true)
    })

    it('resets text style overrides, shapes and positions, and the whole layout', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        let m = score.firstMeasure()!
        while (m.lineBreak()) {
            m = m.nextMeasure()!
        }
        score.select(m, SelectType.SINGLE)
        executeAction(score, 'system-break')
        expect(m.lineBreak()).toBe(true)
        score.select(m, SelectType.RANGE, 0)
        executeAction(score, 'stretch+')
        expect(executeAction(score, 'reset-text-style-overrides')).toBe(true)

        const cr = m.first(SegmentType.ChordRest)!.element(0) as ChordRest
        score.startCmd()
        cr.undoChangeProperty(Pid.OFFSET, new PointF(10, 10))
        score.endCmd()
        score.select(cr, SelectType.SINGLE)
        expect(executeAction(score, 'reset')).toBe(true)
        expect(cr.offset().x()).toBe(0)

        expect(executeAction(score, 'reset-to-default-layout')).toBe(true)
        expect(m.lineBreak()).toBe(false)
        expect((m as Measure).userStretch()).toBe(1)
        undo(score)
        expect(m.lineBreak()).toBe(true)
    })

    it('the context menu opens the style page of the element (EditStyleUtils)', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        let cr = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as ChordRest
        while (!cr.isChord()) {
            cr = cr.segment().next1(SegmentType.ChordRest)!.element(0) as ChordRest
        }
        score.select((cr as Chord).upNote(), SelectType.SINGLE)
        const find = (items: ContextMenuItem[]): ContextMenuItem | undefined =>
            items.find(it => it.kind === 'action' && it.code === 'edit-style')
        expect(find(contextMenuItems(score))).toMatchObject({ args: ['notes'] })
        expect(EditStyleUtils.pageCodeForElement(score.firstMeasure()!)).toBe('spacing')
    })

    it('saves and loads a style (.mss)', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        const style = notationStyle(score)
        const saved = style.saveStyle()
        expect(saved).toContain('<museScore version=')
        expect(saved).toContain('<Style>')
        const spatium = score.style().spatium()

        score.startCmd()
        style.setStyleValue(Sid.spatium, spatium * 2)
        style.setStyleValue(Sid.pageTwosided, !score.style().styleB(Sid.pageTwosided))
        score.endCmd()
        expect(score.style().spatium()).toBe(spatium * 2)

        expect(style.loadStyle(saved, false)).toBe(true)
        expect(score.style().spatium()).toBeCloseTo(spatium, 6)
        undo(score)
        expect(score.style().spatium()).toBe(spatium * 2)
    })
})

describe.skipIf(!existsSync(VTEST))('Page settings', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('finds the standard page sizes like QPageSize::id', () => {
        const a4 = QPageSize.id(8.27, 11.69, QPageSizeUnit.Inch, SizeMatchPolicy.FuzzyOrientationMatch)
        expect(QPageSize.name(a4)).toBe('A4')
        expect(QPageSize.name(QPageSize.id(11.69, 8.27, QPageSizeUnit.Inch, SizeMatchPolicy.FuzzyOrientationMatch))).toBe('A4')
        expect(QPageSize.name(QPageSize.id(8.5, 11, QPageSizeUnit.Inch, SizeMatchPolicy.FuzzyOrientationMatch))).toBe('Letter / ANSI A')
        expect(QPageSize.id(5, 5, QPageSizeUnit.Inch, SizeMatchPolicy.FuzzyOrientationMatch)).toBe(QPageSize.Custom)
        expect(QPageSize.size(a4, QPageSizeUnit.Millimeter)).toEqual([210, 297])
    })

    it('changes the page format, orientation, margins and spatium; Cancel reverts everything', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        const before = scoreHash(score)
        let metric = false
        const ps = createPageSettings(score, false, mm => { metric = mm })
        ps.show()
        const v = ps.values()
        expect(v.unitSuffix).toBe('in')

        // the test score's page is landscape
        expect(v.landscape).toBe(true)
        const a5 = QPageSize.id(5.83, 8.27, QPageSizeUnit.Inch)
        ps.pageFormatSelected(a5)
        expect(score.style().styleD(Sid.pageWidth)).toBeCloseTo(8.27)
        expect(v.pageGroup).toBe(a5)

        ps.orientationClicked()
        expect(v.portrait).toBe(true)
        expect(score.style().styleD(Sid.pageWidth)).toBeCloseTo(5.83)
        expect(v.pageGroup).toBe(a5)

        ps.mmClicked()
        expect(metric).toBe(true)
        expect(v.unitSuffix).toBe('mm')
        expect(v.spinBoxes.pageWidth.value).toBeCloseTo(148.08, 1)

        ps.spinBoxChanged('oddPageTopMargin', 20)
        expect(score.style().styleD(Sid.pageOddTopMargin)).toBeCloseTo(20 / 25.4)

        ps.spinBoxChanged('spatiumEntry', 2)
        expect(score.style().spatium()).toBeCloseTo(2 * 1200 / 25.4)

        ps.pageOffsetChanged(5)
        expect(score.pageNumberOffset()).toBe(4)

        ps.reject()
        layoutScore(score)
        expect(score.pageNumberOffset()).toBe(0)
        expect(scoreHash(score)).toBe(before)
    })

    it('OK keeps the changes as one undoable command; reset restores the defaults', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        const ps = createPageSettings(score, true, () => {})
        ps.show()
        ps.twosidedToggled(true)
        expect(ps.values().spinBoxes.evenPageLeftMargin.enabled).toBe(true)
        ps.spinBoxChanged('oddPageLeftMargin', 25)
        expect(score.style().styleD(Sid.pageOddLeftMargin)).toBeCloseTo(25 / 25.4)
        // two sided: the even page's right margin follows the odd page's left margin
        expect(ps.values().spinBoxes.evenPageRightMargin.value).toBe(25)
        ps.accept()
        expect(score.style().styleB(Sid.pageTwosided)).toBe(true)
        undo(score)
        expect(score.style().styleB(Sid.pageTwosided)).toBe(false)
        expect(score.style().styleD(Sid.pageOddLeftMargin)).not.toBeCloseTo(25 / 25.4)

        const ps2 = createPageSettings(score, true, () => {})
        ps2.show()
        ps2.spinBoxChanged('spatiumEntry', 1.5)
        ps2.resetPageStyle()
        expect(score.style().spatium()).toBeCloseTo(1.75 * 1200 / 25.4) // the default 1.75mm
        ps2.accept()
    })

    it('scales the user offsets when the spatium changes', () => {
        const score = open(`${VTEST}beams-10.mscx`)
        let cr = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as ChordRest
        while (!cr.isChord()) {
            cr = cr.segment().next1(SegmentType.ChordRest)!.element(0) as ChordRest
        }
        const note = (cr as Chord).upNote()
        score.startCmd()
        note.undoChangeProperty(Pid.OFFSET, new PointF(10, 20))
        score.endCmd()
        const sp = score.style().spatium()
        score.startCmd()
        notationStyle(score).setStyleValue(Sid.spatium, sp * 2)
        score.endCmd()
        expect(note.offset().x()).toBeCloseTo(20)
        expect(note.offset().y()).toBeCloseTo(40)
        undo(score)
        expect(note.offset().x()).toBeCloseTo(10)
    })
})
