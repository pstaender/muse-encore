// SPDX-License-Identifier: GPL-3.0-only
// The notation side of the parts (excerpts): MasterNotation's excerpt notations, PartListModel (the Parts dialog),
// NotationSwitchListModel (the tabs), the current notation and editing in a part score.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    createNotationSwitchListModel, createPartListModel, currentNotation, executeAction, layoutScore, loadScore,
    masterNotation, setCurrentNotation, undo, type MasterScore,
} from '../src/index'
import { SelectType } from '../src/engraving/dom/select'
import { ROOT, initFonts } from './helpers'

const PARTS = `${ROOT}MuseScore/src/engraving/tests/parts_data/input-from-parts.mscz`

function open(): MasterScore {
    const score = loadScore(readFileSync(PARTS))
    layoutScore(score)
    return score
}

describe.skipIf(!existsSync(PARTS))('parts: notation models', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('has an excerpt notation for every part of the file', () => {
        const score = open()
        const mn = masterNotation(score)
        expect(mn.excerpts().map(e => e.name())).toEqual(['Flute', 'Oboe', 'Clarinet in B♭', 'Bassoon'])
        expect(mn.excerpts().every(e => e.isInited() && !e.isCustom() && !e.isEmpty())).toBe(true)
        expect(mn.excerpts()[0].score()).toBe(score.excerpts()[0].excerptScore())
    })

    it('lists the parts in the Parts dialog, selects with modifiers and validates titles', () => {
        const score = open()
        const model = createPartListModel(score)
        model.load()
        expect(model.items().map(i => i.title)).toEqual(['Flute', 'Oboe', 'Clarinet in B♭', 'Bassoon'])
        expect(model.hasSelection()).toBe(false)
        model.selectPart(1)
        model.selectPart(3, { shift: true })
        expect(model.items().map(i => i.isSelected)).toEqual([false, true, true, true])
        model.selectPart(2, { ctrl: true })
        expect(model.items().map(i => i.isSelected)).toEqual([false, true, false, true])
        model.selectPart(0)
        expect(model.items().map(i => i.isSelected)).toEqual([true, false, false, false])

        expect(model.validatePartTitle(0, 'oboe')).toBe('Name already exists')
        expect(model.validatePartTitle(0, 'Flute')).toBe('')
        expect(model.validatePartTitle(0, 'Piccolo')).toBe('')
    })

    it('renames a part (undoable)', () => {
        const score = open()
        const model = createPartListModel(score)
        model.load()
        model.setPartTitle(1, 'Oboe 1')
        expect(masterNotation(score).excerpts()[1].name()).toBe('Oboe 1')
        model.setPartTitle(0, 'Oboe 1') // exists: no change
        expect(masterNotation(score).excerpts()[0].name()).toBe('Flute')
        undo(score)
        expect(masterNotation(score).excerpts()[1].name()).toBe('Oboe')
    })

    it('opens parts in tabs, switches and closes them', () => {
        const score = open()
        // the parts of the file were saved open
        expect(masterNotation(score).excerpts().every(e => e.isOpen())).toBe(true)
        for (const e of masterNotation(score).excerpts()) {
            masterNotation(score).setExcerptIsOpen(e, false)
        }
        const model = createPartListModel(score)
        model.load()
        model.selectPart(0)
        model.selectPart(2, { ctrl: true })
        model.openSelectedParts()
        // (the opened parts are moved to the end of the score's list, like in MuseScore)
        const flute = model.excerpt(0)!.score()!
        const clarinet = model.excerpt(2)!.score()!
        expect(currentNotation(score)).toBe(clarinet)
        expect(clarinet.npages()).toBeGreaterThan(0)

        const tabs = createNotationSwitchListModel(score)
        tabs.load()
        expect(tabs.notations().map(n => n.title)).toEqual([null, 'Flute', 'Clarinet in B♭'])
        expect(tabs.currentNotationIndex()).toBe(2)
        tabs.setCurrentNotation(1)
        expect(currentNotation(score)).toBe(flute)
        expect(tabs.contextMenuItems(1).map(i => i.id)).toEqual(['close-tab', 'close-other-tabs', 'close-all-tabs'])

        expect(tabs.closeNotation(1)).toBe(true) // the current one: the previous tab becomes current
        expect(currentNotation(score)).toBe(score)
        expect(tabs.notations().map(n => n.title)).toEqual([null, 'Clarinet in B♭'])
        expect(tabs.closeNotation(0)).toBe(false) // the score's tab closes the file
    })

    it('edits a part score with undo through the master score\'s undo stack', () => {
        const score = open()
        const flute = masterNotation(score).excerpts()[0]
        masterNotation(score).setExcerptIsOpen(flute, true)
        setCurrentNotation(flute.score()!)
        const part = flute.score()!
        const m = part.firstMeasure()!
        part.select(m, SelectType.RANGE, 0)
        const before = m.userStretch()
        expect(executeAction(part, 'stretch+')).toBe(true)
        expect(m.userStretch()).toBeCloseTo(before + 0.1)
        expect(score.undoStack().canUndo()).toBe(true)
        undo(part)
        expect(m.userStretch()).toBeCloseTo(before)
    })

    it('creates the parts of the instruments (potential parts), new, copied, reset and deleted parts (undoable)', () => {
        const score = loadScore(readFileSync(`${ROOT}MuseScore/src/engraving/tests/parts_data/part-all.mscx`))
        layoutScore(score)
        expect(score.excerpts().length).toBe(0)
        const model = createPartListModel(score)
        model.load()
        const names = model.items().map(i => i.title)
        expect(names.length).toBe(score.parts().length)
        expect(model.items().every(i => !i.isInited && !i.isCustom)).toBe(true)

        // Open all: the parts are created
        model.openAllParts()
        expect(score.excerpts().length).toBe(names.length)
        expect(masterNotation(score).excerpts().every(e => e.isInited() && e.isOpen())).toBe(true)
        const last = model.excerpt(names.length - 1)!
        expect(currentNotation(score)).toBe(last.score())
        expect(last.score()!.parts().length).toBe(1)
        expect(last.score()!.npages()).toBeGreaterThan(0)

        // a new (empty) part, a copy of the first part
        const m2 = createPartListModel(score)
        m2.load()
        const newIndex = m2.createNewPart()
        expect(m2.items()[newIndex]).toMatchObject({ title: 'Part', isCustom: true })
        const copyIndex = m2.copyPart(0)
        expect(m2.items()[copyIndex]).toMatchObject({ title: `${names[0]} (copy)`, isCustom: true })
        expect(score.excerpts().length).toBe(names.length + 2)

        // reset the first part, delete the copy
        expect(m2.resetPartNeedsQuestion(0)).toBe(true)
        m2.doResetPart(0)
        expect(m2.excerpt(0)!.score()!.parts().length).toBe(1)
        m2.doRemovePart(copyIndex)
        expect(score.excerpts().length).toBe(names.length + 1)
        undo(score)
        expect(score.excerpts().length).toBe(names.length + 2)
        expect(masterNotation(score).excerpts().length).toBe(names.length + 2)
    })
})
