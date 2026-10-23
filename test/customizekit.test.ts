// SPDX-License-Identifier: GPL-3.0-only
// The Customize kit dialog (port of MuseScore's CustomizeKitDialog): the drumset of the instrument of the note input,
// editing a drum (name, notehead, line, voice, stem direction, shortcut), applied to the score at once and undoable,
// Cancel, the drumset files (.drm) and the parts (MasterNotationParts::replaceDrumset).
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    createCustomizeKitDialog, customizeKitNoteheadSymbols, executeAction, layoutScore, loadScore, undo, type MasterScore,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { SymId } from '../src/engraving/types/symid'
import { DirectionV, NoteHeadGroup, NoteHeadType } from '../src/engraving/types/types'
import { Excerpt } from '../src/engraving/dom/excerpt'
import '../src/engraving/editing/editexcerpt'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import { VTEST, hasSubmodule, initFonts } from './helpers'

function open(): MasterScore {
    const score = loadScore(readFileSync(`${VTEST}/drumset-custom-1.mscx`))
    layoutScore(score)
    // note input on the drum staff: the dialog edits the drumset of its instrument
    const cr = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0)!
    score.select(cr, SelectType.SINGLE, 0)
    expect(executeAction(score, 'note-input')).toBe(true)
    return score
}

const drumset = (score: MasterScore) => score.parts()[0].instrument().drumset()!

describe.skipIf(!hasSubmodule)('Customize kit dialog', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('lists the drums sorted by name (descending) and edits the current drum, applied at once', () => {
        const score = open()
        const dialog = createCustomizeKitDialog(score)!
        expect(dialog).not.toBeNull()
        const rows = dialog.rows()
        expect(rows.length).toBe(128)
        const named = rows.filter(r => r.name)
        expect(named.map(r => r.name)).toEqual([...named.map(r => r.name)].sort().reverse())
        expect(rows[rows.length - 1].name).toBe('')

        const pitch = named[0].pitch
        dialog.setCurrentPitch(pitch)
        expect(dialog.name()).toBe(drumset(score).name(pitch))
        expect(dialog.pitchControlsEnabled()).toBe(true)
        dialog.setStaffLine(2)
        expect(drumset(score).line(pitch)).toBe(2)
        dialog.setStemDirection(DirectionV.DOWN)
        expect(drumset(score).stemDirection(pitch)).toBe(DirectionV.DOWN)
        dialog.setNoteHead(NoteHeadGroup.HEAD_CROSS)
        expect(drumset(score).noteHead(pitch)).toBe(NoteHeadGroup.HEAD_CROSS)
        expect(dialog.customNoteheads()[2]).toBe(SymId.noteheadXBlack)
        // an example chord for the current drum
        expect(dialog.exampleCell()?.element?.isChord()).toBe(true)

        // custom noteheads
        dialog.setCustomGroup(true)
        dialog.setCustomNotehead(NoteHeadType.HEAD_QUARTER, SymId.noteheadDiamondBlack)
        dialog.apply()
        expect(drumset(score).noteHead(pitch)).toBe(NoteHeadGroup.HEAD_CUSTOM)
        expect(drumset(score).noteHeads(pitch, NoteHeadType.HEAD_QUARTER)).toBe(SymId.noteheadDiamondBlack)
        expect(customizeKitNoteheadSymbols()).toContain(SymId.noteheadDiamondBlack)

        // each change is one undo step (like C++, Apply is one too)
        undo(score)
        undo(score)
        expect(drumset(score).noteHead(pitch)).toBe(NoteHeadGroup.HEAD_CROSS)
    })

    it('Cancel restores the original drumset', () => {
        const score = open()
        const dialog = createCustomizeKitDialog(score)!
        const pitch = dialog.rows()[0].pitch
        const line = drumset(score).line(pitch)
        dialog.setCurrentPitch(pitch)
        dialog.setStaffLine(line + 3)
        expect(drumset(score).line(pitch)).toBe(line + 3)
        dialog.cancel()
        expect(drumset(score).line(pitch)).toBe(line)
    })

    it('a name enables a new drum; shortcuts move from a conflicting drum', () => {
        const score = open()
        const dialog = createCustomizeKitDialog(score)!
        const free = dialog.rows().find(r => !r.name)!.pitch
        dialog.setCurrentPitch(free)
        expect(dialog.pitchControlsEnabled()).toBe(false)
        dialog.setName('Cowbell 2')
        expect(dialog.pitchControlsEnabled()).toBe(true)
        expect(drumset(score).isValid(free)).toBe(true)
        expect(drumset(score).name(free)).toBe('Cowbell 2')

        const other = dialog.drumsWithShortcut()[0]
        dialog.setShortcut(other.shortcut, other.pitch)
        expect(drumset(score).shortcut(free)).toBe(other.shortcut)
        expect(drumset(score).shortcut(other.pitch)).toBe('')
    })

    it('saves and loads drumset files', () => {
        const score = open()
        const dialog = createCustomizeKitDialog(score)!
        const pitch = dialog.rows()[0].pitch
        dialog.setCurrentPitch(pitch)
        const xml = dialog.save()
        expect(xml).toContain('<museScore version="4.70">')
        expect(xml).toContain('<Drum pitch=')

        const other = createCustomizeKitDialog(score)!
        expect(other.load(xml.replace('version="4.70"', 'version="3.02"'))).toBe('tooOld')
        expect(other.load(xml)).toBe('ok')
        expect(other.rows().filter(r => r.name).length).toBe(dialog.rows().filter(r => r.name).length)
    })

    it('changes the drumset of the instrument in the parts too (MasterNotationParts::replaceDrumset)', () => {
        const score = open()
        score.startCmd(TranslatableString.untranslatable('Create parts'))
        for (const ex of Excerpt.createExcerptsFromParts(score.parts(), score)) {
            score.initAndAddExcerpt(ex, false)
        }
        score.endCmd()
        const partScore = score.excerpts()[0].excerptScore()!
        const dialog = createCustomizeKitDialog(score)!
        const pitch = dialog.rows()[0].pitch
        dialog.setCurrentPitch(pitch)
        dialog.setVoice(1)
        expect(drumset(score).voice(pitch)).toBe(1)
        expect(partScore.parts()[0].instrument().drumset()!.voice(pitch)).toBe(1)
    })
})
