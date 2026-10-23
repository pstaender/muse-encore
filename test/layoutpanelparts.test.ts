// SPDX-License-Identifier: GPL-3.0-only
// The Layout panel of a part score (LayoutPanelTreeModel with the master notation and an excerpt notation): the
// instruments of the main score in the order of the part, hidden ones not in the part; showing one inserts it into the
// part (PartTreeItem::createAndAddPart, NotationParts::insertPart), "Reset all formatting" (replacePart), the warning
// before removing instruments of a score with parts.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    AutoOnOff, createInstrumentSettingsModel, createLayoutPanelModel, createStaffSettingsModel, insertPart, layoutScore, loadScore, LayoutPanelItemType, removeParts, replacePart, undo,
    type LayoutPanelNotationParts, type MasterScore, type PartTreeItem, type Score,
} from '../src/index'
import { Pid } from '../src/engraving/dom/property'
import { SegmentType } from '../src/engraving/dom/segment'
import { Fraction } from '../src/engraving/types/fraction'
import { ROOT, initFonts } from './helpers'

const PARTS = `${ROOT}MuseScore/src/engraving/tests/parts_data/input-from-parts.mscz`

function open(): MasterScore {
    const score = loadScore(readFileSync(PARTS))
    layoutScore(score)
    return score
}

/** the commands of a score (the library functions the app's bridge calls) */
function commands(score: Score, calls: string[]): LayoutPanelNotationParts {
    const rec = (name: string) => (...args: unknown[]): void => { calls.push(`${name} ${JSON.stringify(args)}`) }
    return {
        setPartVisible: rec('setPartVisible'), setStaffVisible: rec('setStaffVisible'),
        removeParts: (ids) => { calls.push(`removeParts ${JSON.stringify(ids)}`); removeParts(score, ids) },
        removeStaves: rec('removeStaves'), moveParts: rec('moveParts'), moveStaves: rec('moveStaves'),
        appendStaff: rec('appendStaff'), addSystemObjects: rec('addSystemObjects'), removeSystemObjects: rec('removeSystemObjects'),
        moveSystemObjects: rec('moveSystemObjects'), moveSystemObjectLayerBelowBottomStaff: rec('moveSystemObjectLayerBelowBottomStaff'),
        moveSystemObjectLayerAboveBottomStaff: rec('moveSystemObjectLayerAboveBottomStaff'),
        insertPart: (part, index) => { calls.push(`insertPart ${part.id()} ${index}`); insertPart(score, part, index) },
        replacePart: (partId, part) => { calls.push(`replacePart ${partId}`); replacePart(score, partId, part) },
    }
}

const top = (model: ReturnType<typeof createLayoutPanelModel>): string[] =>
    model.rootItem()!.childItems().map(i => `${LayoutPanelItemType[i.type()]} ${i.title()}${i.isVisible() ? '' : ' (hidden)'}`)

describe.skipIf(!existsSync(PARTS))('layout panel of a part score', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('lists the instruments of the main score, those not in the part hidden, without system markings layers', () => {
        const score = open()
        const oboe = score.excerpts()[1].excerptScore()!
        const model = createLayoutPanelModel(oboe, commands(oboe, []), commands(score, []))
        expect(model.isMasterScore()).toBe(false)
        // the part's instrument first (the order of the part), then the others
        expect(top(model)).toEqual(['PART Oboe', 'PART Flute (hidden)', 'PART Clarinet in B♭ (hidden)', 'PART Bassoon (hidden)'])
        const flute = model.rootItem()!.childAtRow(1)!
        expect(flute.isExpandable()).toBe(false)
        expect(flute.isRemovable()).toBe(false)
        expect(flute.settingsAvailable()).toBe(false)
        expect(model.isAddingSystemMarkingsAvailable()).toBe(false)
    })

    it('showing an instrument of the main score inserts it into the part, linked to the score', () => {
        const score = open()
        const oboe = score.excerpts()[1].excerptScore()!
        const calls: string[] = []
        const model = createLayoutPanelModel(oboe, commands(oboe, calls), commands(score, []))
        const flute = model.rootItem()!.childAtRow(1)!
        model.changeVisibility(flute, true)
        // like C++ the staff rows follow the part row (setStaffVisible of the new staff does not change anything)
        expect(calls).toEqual([`insertPart ${flute.id()} 1`, `setStaffVisible ["${flute.childAtRow(0)!.id()}",true]`])
        expect(oboe.parts().map(p => p.partName())).toEqual(['Oboe', 'Flute'])
        const fluteStaff = oboe.parts()[1].staff(0)!
        const masterFluteStaff = score.parts()[0].staff(0)!
        expect(fluteStaff.id()).toBe(masterFluteStaff.id())
        expect(fluteStaff.isLinked(masterFluteStaff)).toBe(true)
        // the music is copied: as many chords and rests as in the score
        const count = (s: Score, track: number): number => {
            let n = 0
            for (let seg = s.firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
                if (seg.element(track)?.isChordRest()) {
                    ++n
                }
            }
            return n
        }
        expect(count(oboe, 4)).toBe(count(score, 0))

        const reloaded = createLayoutPanelModel(oboe, commands(oboe, []), commands(score, []))
        expect(top(reloaded)).toEqual(['PART Oboe', 'PART Flute', 'PART Clarinet in B♭ (hidden)', 'PART Bassoon (hidden)'])

        undo(score)
        expect(oboe.parts().map(p => p.partName())).toEqual(['Oboe'])
    })

    it('"Reset all formatting" replaces the part by a new copy of the main score\'s part', () => {
        const score = open()
        const oboe = score.excerpts()[1].excerptScore()!
        const model = createLayoutPanelModel(oboe, commands(oboe, []), commands(score, []))
        const part = oboe.parts()[0]
        oboe.startCmd(null as never)
        part.staff(0)!.undoChangeProperty(Pid.STAFF_USERDIST, 100)
        oboe.endCmd()
        expect(part.staff(0)!.userDist()).toBe(100)

        const item = model.rootItem()!.childAtRow(0)! as PartTreeItem
        item.resetAllFormatting()
        expect(oboe.parts().length).toBe(1)
        expect(oboe.parts()[0]).not.toBe(part)
        expect(oboe.parts()[0].id()).toBe(part.id())
        expect(oboe.parts()[0].staff(0)!.userDist()).toBe(score.parts()[1].staff(0)!.userDist())
        expect(oboe.parts()[0].staff(0)!.isLinked(score.parts()[1].staff(0)!)).toBe(true)
    })

    it('warns before removing instruments of a score with parts; the instrument is removed from the main score', () => {
        const score = open()
        const model = createLayoutPanelModel(score, commands(score, []))
        const flute = model.rootItem()!.childItems().find(i => i.title() === 'Flute')!
        model.selectRow(flute)
        expect(model.removeWarning()).toEqual({
            text: 'Are you sure you want to delete the selected instrument(s)?',
            detail: 'This will remove the instrument(s) from the full score and all part scores.',
        })

        const oboe = score.excerpts()[1].excerptScore()!
        const masterCalls: string[] = []
        const partModel = createLayoutPanelModel(oboe, commands(oboe, []), commands(score, masterCalls))
        const oboeId = partModel.rootItem()!.childAtRow(0)!.id()
        partModel.selectRow(partModel.rootItem()!.childAtRow(0)!)
        expect(partModel.removeWarning()).not.toBeNull()
        partModel.removeSelectedRows()
        expect(masterCalls).toEqual([`removeParts ["${oboeId}"]`, 'removeSystemObjects [[]]'])
        expect(score.parts().map(p => p.partName())).toEqual(['Flute', 'Clarinet in B♭', 'Bassoon'])
    })
})

describe.skipIf(!existsSync(PARTS))('staff settings popup (StaffSettingsModel)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('hides a voice of a staff of a part score; only in part scores', () => {
        const score = open()
        const oboe = score.excerpts()[1].excerptScore()!
        const staff = oboe.staves()[0]
        const model = createStaffSettingsModel(oboe, staff.id())
        expect(model.isMainScore()).toBe(false)
        expect(model.voices()).toEqual([1, 2, 3, 4].map(title => ({ title, isVoiceVisible: true })))
        model.setVoiceVisible(1, false)
        expect(oboe.staves()[0].isVoiceVisible(1)).toBe(false)
        expect(model.voices()[1].isVoiceVisible).toBe(false)
        undo(score)
        expect(oboe.staves()[0].isVoiceVisible(1)).toBe(true)

        const masterModel = createStaffSettingsModel(score, score.staves()[0].id())
        expect(masterModel.isMainScore()).toBe(true)
        masterModel.setVoiceVisible(1, false) // not possible in the main score (EditPart::setVoiceVisible)
        expect(score.staves()[0].isVoiceVisible(1)).toBe(true)
    })

    it('changes the staff type, small staff, cutaway and the hiding of empty staves through the undo stack', () => {
        const score = open()
        const staff = score.staves()[0]
        const model = createStaffSettingsModel(score, staff.id())
        // a flute: standard staves only
        expect(model.allStaffTypes().map(t => t.text)).toEqual(['Standard'])
        expect(model.staffType()).toBe(0)

        model.setIsSmallStaff(true)
        expect(staff.staffType(new Fraction(0, 1)).isSmall()).toBe(true)
        expect(model.isSmallStaff()).toBe(true)
        model.setCutawayEnabled(true)
        expect(staff.cutaway()).toBe(true)
        model.setHideWhenEmpty(AutoOnOff.ON)
        expect(staff.hideWhenEmpty()).toBe(AutoOnOff.ON)
        model.setShowIfEntireSystemEmpty(true)
        expect(staff.showIfEntireSystemEmpty()).toBe(true)

        undo(score)
        undo(score)
        undo(score)
        undo(score)
        expect(staff.staffType(new Fraction(0, 1)).isSmall()).toBe(false)
        expect(staff.cutaway()).toBe(false)
        expect(staff.hideWhenEmpty()).toBe(AutoOnOff.AUTO)
        expect(staff.showIfEntireSystemEmpty()).toBe(false)
    })

    it('creates a linked staff in the score and in the part of the instrument', () => {
        const score = open()
        const flute = score.parts()[0]
        const fluteExcerpt = score.excerpts()[0].excerptScore()!
        const model = createStaffSettingsModel(score, flute.staff(0)!.id())
        model.createLinkedStaff()
        expect(flute.nstaves()).toBe(2)
        expect(flute.staff(1)!.isLinked(flute.staff(0)!)).toBe(true)
        expect(fluteExcerpt.parts()[0].nstaves()).toBe(2)
        expect(fluteExcerpt.parts()[0].staff(1)!.isLinked(flute.staff(1)!)).toBe(true)
        undo(score)
        expect(flute.nstaves()).toBe(1)
        expect(fluteExcerpt.parts()[0].nstaves()).toBe(1)
    })
})

describe.skipIf(!existsSync(PARTS))('instrument settings popup (InstrumentSettingsModel)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('renames the instrument on the score or only on the part score, undoable', () => {
        const score = open()
        const oboe = score.excerpts()[1].excerptScore()!
        const masterOboe = score.parts()[1]
        const model = createInstrumentSettingsModel(oboe, oboe.parts()[0].id())
        expect(model.isMainScore()).toBe(false)
        expect(model.instrumentName()).toBe('Oboe')
        model.setInstrumentName('Oboe I')
        model.setAbbreviature('Ob. I')
        expect(oboe.parts()[0].instrument().nameAsPlainText()).toBe('Oboe I')
        expect(oboe.parts()[0].instrument().abbreviatureAsPlainText()).toBe('Ob. I')
        // the name on the main score stays
        expect(masterOboe.instrument().nameAsPlainText()).toBe('Oboe')
        undo(score)
        undo(score)
        expect(oboe.parts()[0].instrument().nameAsPlainText()).toBe('Oboe')

        const masterModel = createInstrumentSettingsModel(score, masterOboe.id())
        expect(masterModel.isMainScore()).toBe(true)
        masterModel.setHideWhenEmpty(AutoOnOff.OFF)
        expect(masterOboe.hideWhenEmpty()).toBe(AutoOnOff.OFF)
        undo(score)
        expect(masterOboe.hideWhenEmpty()).toBe(AutoOnOff.AUTO)
    })
})
