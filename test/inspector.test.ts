// SPDX-License-Identifier: GPL-3.0-only
// The Properties panel models (inspector): sections for the selection, property values, the changes of new values.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    clearSelection, inspectorPropertyChanges, inspectorPropertyResets, inspectorSections, inspectorSelectionProperties,
    selectAll, selectAt, type InspectorModelInfo, type MasterScore,
} from '../src/index'
import { Pid } from '../src/engraving/dom/property'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { Note } from '../src/engraving/dom/note'
import { DPI } from '../src/engraving/types/types'
import { PointF } from '../src/framework/draw/types/geometry'
import { DEMOS, hasSubmodule, openScore } from './helpers'

function center(e: EngravingItem): { x: number; y: number } {
    const c = e.pageBoundingRect().center()
    return { x: c.x() / DPI, y: c.y() / DPI }
}

function firstNote(score: MasterScore): Note {
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e && e.isChord()) {
                return (e as unknown as Chord).notes()[0]
            }
        }
    }
    throw new Error('no note')
}

function section(sections: InspectorModelInfo[], type: string): InspectorModelInfo {
    const s = sections.find(x => x.sectionType === type)
    expect(s, type).toBeDefined()
    return s!
}

describe.skipIf(!hasSubmodule)('inspector', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
    })

    it('shows "Show" and "Score appearance" without a selection', () => {
        clearSelection(score)
        const sections = inspectorSections(score)
        expect(sections.map(s => s.sectionType)).toEqual(['SECTION_SCORE_DISPLAY', 'SECTION_SCORE_APPEARANCE'])
        expect(sections[0].title).toBe('Show')
    })

    it('shows General and the note sections for a selected note', () => {
        const note = firstNote(score)
        const p = center(note)
        expect(selectAt(score, 0, p.x, p.y, 'single')).toBe(true)
        expect(score.selection().elements()).toEqual([note])

        const sections = inspectorSections(score)
        expect(sections.map(s => s.sectionType)).toEqual(['SECTION_GENERAL', 'SECTION_NOTATION'])
        const general = section(sections, 'SECTION_GENERAL')
        expect(general.title).toBe('General')
        expect(general.properties.isVisible).toMatchObject({ value: true, isUndefined: false, isEnabled: true, isModified: false })
        expect(general.properties.isSmall.value).toBe(false)
        expect(general.properties.isAutoPlaceAllowed.value).toBe(true)
        expect(general.properties.isPlayable.value).toBe(true)
        const appearance = general.models.find(m => m.key === 'appearance')!
        expect(appearance.properties.offset.value).toEqual({ x: 0, y: 0 })
        expect(appearance.properties.color.value).toBe('#000000')
        expect(appearance.flags.measurementUnits).toBe('sp')

        const notation = section(sections, 'SECTION_NOTATION')
        expect(notation.title).toBe('Note')
        const note1 = notation.models[0]
        expect(note1.modelType).toBe('TYPE_NOTE')
        expect(note1.defaultSubModelType).toBe('TYPE_NOTEHEAD')
        expect(note1.models.map(m => m.modelType)).toEqual(['TYPE_CHORD', 'TYPE_BEAM', 'TYPE_NOTEHEAD', 'TYPE_STEM', 'TYPE_HOOK'])
        const head = note1.models.find(m => m.modelType === 'TYPE_NOTEHEAD')!
        expect(head.title).toBe('Head')
        expect(head.properties.isHeadHidden.value).toBe(false)
        expect(head.properties.headGroup.value).toBe(0)
        expect(head.properties.dotPosition.value).toBe(0)
        const stem = note1.models.find(m => m.modelType === 'TYPE_STEM')!
        expect(stem.isEmpty).toBe(!(note.chord().stem()))
    })

    it('returns the changes for new values in element units', () => {
        const note = firstNote(score)
        const p = center(note)
        selectAt(score, 0, p.x, p.y, 'single')
        inspectorSections(score)
        const hide = inspectorPropertyChanges(score, { section: 'SECTION_NOTATION', path: ['TYPE_NOTE', 'TYPE_NOTEHEAD'], property: 'isHeadHidden' }, true)
        expect(hide).toHaveLength(1)
        expect(hide[0]).toMatchObject({ pid: Pid.VISIBLE, value: false })
        expect(hide[0].item).toBe(note)

        // offset in sp -> absolute; notes are offset through their chord (AppearanceSettingsModel)
        const offset = inspectorPropertyChanges(score, { section: 'SECTION_GENERAL', path: ['appearance'], property: 'offset' }, { x: 1, y: -0.5 })
        expect(offset).toHaveLength(1)
        expect(offset[0].item).toBe(note.chord())
        expect((offset[0].value as PointF).x()).toBeCloseTo(note.chord().spatium())
        expect((offset[0].value as PointF).y()).toBeCloseTo(-0.5 * note.chord().spatium())

        // cue size applies to the chord
        const small = inspectorPropertyChanges(score, { section: 'SECTION_GENERAL', path: [], property: 'isSmall' }, true)
        expect(small[0].item).toBe(note.chord())

        // the same value: no change
        expect(inspectorPropertyChanges(score, { section: 'SECTION_GENERAL', path: [], property: 'isAutoPlaceAllowed' }, true)).toEqual([])

        const reset = inspectorPropertyResets(score, { section: 'SECTION_GENERAL', path: [], property: 'isPlayable' })
        expect(reset).toEqual([{ item: note, pid: Pid.PLAY, reset: true }])
    })

    it('shows the text section for a title', () => {
        const vbox = score.first()!
        const title = (vbox as unknown as { el(): EngravingItem[] }).el()[0]
        const p = center(title)
        selectAt(score, 0, p.x, p.y, 'single')
        expect(score.selection().elements()[0].isTextBase()).toBe(true)
        const sections = inspectorSections(score)
        expect(sections.map(s => s.sectionType)).toEqual(['SECTION_GENERAL', 'SECTION_TEXT'])
        const text = section(sections, 'SECTION_TEXT')
        expect(text.title).toBe('Text')
        expect(text.properties.fontSize.value).toBeGreaterThan(10)
        expect(typeof text.properties.fontFamily.value).toBe('string')
        expect(text.properties.horizontalAlignment.value).toBeTypeOf('number')
        expect((text.flags.textStyles as unknown[]).length).toBeGreaterThan(20)
    })

    it('shows mixed values as undefined and the measures section for a range', () => {
        selectAll(score)
        const sections = inspectorSections(score)
        expect(sections.map(s => s.sectionType)).toContain('SECTION_MEASURES')
        expect(sections.map(s => s.sectionType)).toContain('SECTION_GENERAL')
        const props = inspectorSelectionProperties(score, [Pid.VISIBLE, Pid.HEAD_GROUP])
        expect(props[0].isSupported).toBe(true)
        expect(props[0].value).toBe(true)
    })
})
