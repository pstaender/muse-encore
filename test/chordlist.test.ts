// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    ChordList, ChordTokenClass, HChord, ParsedChord, RenderActionType, registerChordListFile,
} from '../src/engraving/dom/chordlist'
import { DefaultStyle } from '../src/engraving/style/defaultstyle'

const CHORDS_DIR = new URL('../fonts/chords/', import.meta.url)

function loadChordList(): ChordList {
    registerChordListFile('chords_std.xml', readFileSync(new URL('chords_std.xml', CHORDS_DIR)))
    const cl = new ChordList()
    cl.checkChordList(DefaultStyle.defaultStyle())
    return cl
}

describe('ChordList', () => {
    it('reads chords_std.xml', () => {
        const cl = loadChordList()
        expect(cl.loaded()).toBe(true)
        expect(cl.autoAdjust()).toBe(true)
        expect(cl.fonts.length).toBeGreaterThan(0)
        expect(cl.chordTokenList.length).toBeGreaterThan(0)
        expect(cl.renderListRoot.length).toBeGreaterThan(0)
        expect(cl.symbol('triangle').isValid()).toBe(true)
        expect(cl.symbol('triangle').value).toBe('')
        expect(cl.token('b', ChordTokenClass.ACCIDENTAL).isValid()).toBe(true)
        // the &super; entity of the internal DTD subset is expanded
        const t = cl.chordTokenList.find(t => t.names.includes('type') && t.tokenClass === ChordTokenClass.TYPE)
        if (t) {
            expect(t.renderList.some(a => a.actionType() === RenderActionType.MOVE)).toBe(true)
        }
    })

    it('falls back to chords_std.xml for unknown files', () => {
        loadChordList()
        const cl = new ChordList()
        expect(cl.read('does_not_exist.xml')).toBe(true)
        expect(cl.loaded()).toBe(true)
        expect(cl.read('')).toBe(false)
    })

    it('parses chord symbols', () => {
        const cl = loadChordList()
        const cases: [string, string][] = [
            ['7', '<dominant><7>'],
            ['m7b5', '<minor><7><b5>'],
            ['maj7#11', '<major><7><#11>'],
            ['sus4', '<major><><sus4>'],
            ['6/9', '<major><69>'],
            ['dim7', '<diminished><7>'],
        ]
        for (const [name, handle] of cases) {
            const pc = new ParsedChord()
            expect(pc.parse(name, cl), name).toBe(true)
            expect(pc.parseable(), name).toBe(true)
            expect(pc.understandable(), name).toBe(true)
            expect(pc.handle(), name).toBe(handle)
            expect(pc.renderList(cl, false).length, name).toBeGreaterThan(0)
        }
        const pc = new ParsedChord()
        pc.parse('m7b5', cl)
        expect(pc.xmlKind()).toBe('half-diminished')
        const dim = new ParsedChord()
        dim.parse('dim7', cl)
        expect(dim.xmlKind()).toBe('diminished-seventh')
        expect(new HChord(dim.keys()).voicing()).toBe('C Eb Gb A')
    })

    it('names HChords', () => {
        expect(HChord.fromString('C E G Bb').name(14)).toBe('C7')
        expect(HChord.fromKeys(0, 3, 7).name(14)).toBe('Cm')
    })
})
