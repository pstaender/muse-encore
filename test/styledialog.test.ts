// SPDX-License-Identifier: GPL-3.0-only
// The models of the QML pages of the Style dialog (src/notationscene/styledialog): style items, reset, the special logic.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    BeamsPageModel, ChordSymbolsPageModel, ClefKeyTimeSigPageModel, MeasureNumbersPageModel, ScaleF, Sid, notationStyle, notationUndoStack,
    type MasterScore,
} from '../src/index'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import { Spatium } from '../src/engraving/types/dimension'
import { ChordStylePreset, TextStyleType, TimeSigPlacement } from '../src/engraving/types/types'
import { DEMOS, hasSubmodule, openScore } from './helpers'

describe.skipIf(!hasSubmodule)('style dialog models', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
    })

    it('style items show the style values (a Spatium as its number) and change and reset them', () => {
        const style = notationStyle(score)
        const model = new BeamsPageModel(style)
        const beamWidth = model.beamWidth()
        expect(beamWidth.value()).toBe(score.style().styleS(Sid.beamWidth).val())
        expect(typeof beamWidth.defaultValue()).toBe('number')

        beamWidth.modifyValue(0.75)
        expect(score.style().styleV(Sid.beamWidth)).toBeInstanceOf(Spatium)
        expect(score.style().styleS(Sid.beamWidth).val()).toBe(0.75)
        expect(beamWidth.isDefault()).toBe(false)

        beamWidth.reset()
        expect(score.style().styleS(Sid.beamWidth).val()).toBe(beamWidth.defaultValue())
        expect(beamWidth.isDefault()).toBe(true)

        // changes of the style (e.g. by another page) update the items
        style.setStyleValue(Sid.beamNoSlope, true)
        expect(model.beamNoSlope().value()).toBe(true)
        style.resetStyleValue(Sid.beamNoSlope)
        expect(model.beamNoSlope().value()).toBe(false)

        model.deinit()
        style.setStyleValue(Sid.beamNoSlope, true)
        // after deinit the items are built again with the current values
        expect(model.beamNoSlope().value()).toBe(true)
        style.resetStyleValue(Sid.beamNoSlope)
        model.deinit()
    })

    it('the changes of the dialog are one undoable command', () => {
        const style = notationStyle(score)
        const undoStack = notationUndoStack(score)
        const model = new BeamsPageModel(style)
        const old = score.style().styleS(Sid.beamMinLen).val()
        undoStack.prepareChanges(new TranslatableString('undoableAction', 'Edit style'))
        model.beamMinLen().modifyValue(2)
        model.useWideBeams().modifyValue(true)
        undoStack.commitChanges()
        expect(score.style().styleB(Sid.useWideBeams)).toBe(true)
        undoStack.undo()
        expect(score.style().styleS(Sid.beamMinLen).val()).toBe(old)
        expect(score.style().styleB(Sid.useWideBeams)).toBe(false)
        model.deinit()
    })

    it('measure number offsets follow the measure number text style', () => {
        const model = new MeasureNumbersPageModel(notationStyle(score))
        let notified = 0
        model.measureNumberPosAboveChanged().onNotify(() => ++notified)
        expect(model.measureNumberPosBelow().value()).toEqual(score.style().styleV(Sid.measureNumberPosBelow))

        model.measureNumberTextStyle().modifyValue(TextStyleType.MEASURE_NUMBER_ALTERNATE)
        expect(notified).toBe(1)
        expect(model.measureNumberPosBelow().value()).toEqual(score.style().styleV(Sid.measureNumberAlternatePosBelow))
        expect(model.textStyles().some(t => t.value === TextStyleType.MEASURE_NUMBER_ALTERNATE)).toBe(true)

        model.measureNumberTextStyle().reset()
        expect(score.style().styleV(Sid.measureNumberTextStyle)).toBe(TextStyleType.MEASURE_NUMBER)
        model.deinit()
    })

    it('resets the style and size of time signatures of the current placement', () => {
        const style = notationStyle(score)
        const model = new ClefKeyTimeSigPageModel(style)
        expect(model.timeSigPlacement().value()).toBe(TimeSigPlacement.NORMAL)
        model.timeSigNormalScale().modifyValue(new ScaleF(2, 2))
        model.timeSigAboveStyle().modifyValue(2)
        expect(model.timeSigNormalScale().isDefault()).toBe(false)

        model.resetStyleAndSize()
        expect(model.timeSigNormalScale().isDefault()).toBe(true)
        // the styles of the other placements are kept
        expect(model.timeSigAboveStyle().value()).toBe(2)
        model.timeSigAboveStyle().reset()
        model.deinit()
    })

    it('chord symbol presets set the description file; bool styles get bools', () => {
        const model = new ChordSymbolsPageModel(notationStyle(score))
        model.chordBassNoteStagger().modifyValue(true)
        model.chordStylePreset().modifyValue(ChordStylePreset.LEGACY)
        model.setChordStyle(ChordStylePreset.LEGACY)
        expect(model.isLegacyXml()).toBe(true)
        expect(score.style().styleSt(Sid.chordDescriptionFile)).toBe('chords_legacy.xml')
        expect(score.style().styleB(Sid.chordBassNoteStagger)).toBe(false)

        model.setChordStyle(ChordStylePreset.JAZZ)
        expect(score.style().styleSt(Sid.chordDescriptionFile)).toBe('chords_jazz.xml')
        model.chordStylePreset().reset()
        model.chordDescriptionFile().reset()

        // the options of "Interpretation" are 0/1 (C++ static_cast<int>(bool))
        model.harmonyVoiceLiteral().modifyValue(model.possibleHarmonyVoiceLiteralOptions()[0].value)
        expect(score.style().styleV(Sid.harmonyVoiceLiteral)).toBe(false)
        model.harmonyVoiceLiteral().reset()
        model.chordBassNoteStagger().reset()
        model.deinit()
    })
})
