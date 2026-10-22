// SPDX-License-Identifier: GPL-3.0-only
// Transpose (Transpose::transpose, transposeSemitone, transposeDiatonicAlterations, transpositionChanged): MuseScore's
// tests with their reference files (engraving/tests/transpose_tests.cpp, chordsymbol_tests.cpp testTranspose,
// keysig_tests.cpp preferSharpFlat), compared by the staves of writeMscx; undo restores the SVG of all pages.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    executeAction, hasSelection, layoutScore, loadScore, prepareTransposeSelection, redo, transposeSelection, undo, writeMscx,
    type MasterScore,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import type { Chord } from '../src/engraving/dom/chord'
import type { Note } from '../src/engraving/dom/note'
import { Transpose } from '../src/engraving/editing/transpose'
import { Key, PreferSharpFlat, TransposeDirection, TransposeMode } from '../src/engraving/types/types'
import { Fraction } from '../src/engraving/types/fraction'
import { ROOT, initFonts, scoreHash } from './helpers'

const TESTS = `${ROOT}MuseScore/src/engraving/tests/`
const hasData = existsSync(TESTS)

function open(path: string): MasterScore {
    const score = loadScore(readFileSync(`${TESTS}${path}`))
    layoutScore(score)
    return score
}

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links */
function staves(mscx: string): string {
    const score = mscx.substring(mscx.indexOf('<Score>'))
    return [...score.matchAll(/\n {4}<Staff id="\d+">[\s\S]*?\n {4}<\/Staff>/g)].map(m => m[0]).join('\n')
        .split('\n').filter(l => !/<eid>|<linkedMain|<linked>/.test(l)).join('\n')
}

function expectRef(score: MasterScore, ref: string): void {
    expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${TESTS}${ref}`, 'utf8')))
}

function transpose(score: MasterScore, mode: TransposeMode, direction: TransposeDirection, interval: number, trKeys: boolean,
    transposeChordNames: boolean, useDoubleSharpsFlats: boolean): void {
    score.cmdSelectAll()
    score.startCmd()
    Transpose.transpose(score, mode, direction, Key.C, interval, trKeys, transposeChordNames, useDoubleSharpsFlats)
    score.endCmd()
}

describe.skipIf(!hasData)('transpose', () => {
    beforeAll(async () => {
        await initFonts()
    })

    // transpose_tests.cpp: undoTransposeFretDiagrams(ChordSymbols) need the fret diagram patterns (TODO(port))
    for (const name of ['undoTranspose', 'undoTransposeChordSymbols']) {
        it(`${name} (major second up, undo)`, () => {
            const score = open(`transpose_data/${name}.mscx`)
            const before = scoreHash(score)
            transpose(score, TransposeMode.BY_INTERVAL, TransposeDirection.UP, 4, true, true, true)
            expectRef(score, `transpose_data/${name}01-ref.mscx`)
            const after = scoreHash(score)

            expect(undo(score)).toBe(true)
            expectRef(score, `transpose_data/${name}02-ref.mscx`)
            expect(scoreHash(score)).toBe(before)
            expect(redo(score)).toBe(true)
            expect(scoreHash(score)).toBe(after)
        })
    }

    for (const name of ['undoDiatonicTranspose', 'undoDiatonicTransposeChordSymbols']) {
        it(`${name} (diatonic fourth down, undo)`, () => {
            const score = open(`transpose_data/${name}.mscx`)
            transpose(score, TransposeMode.DIATONICALLY, TransposeDirection.DOWN, 3, true, false, false)
            expectRef(score, `transpose_data/${name}01-ref.mscx`)

            expect(undo(score)).toBe(true)
            expectRef(score, `transpose_data/${name}02-ref.mscx`)
        })
    }

    it('transposes chord symbols (chordsymbol_tests.cpp testTranspose)', () => {
        const score = open('chordsymbol_data/transpose.mscx')
        transpose(score, TransposeMode.BY_INTERVAL, TransposeDirection.UP, 4, false, true, true)
        expectRef(score, 'chordsymbol_data/transpose-ref.mscx')
    })

    it('respects the preferred accidentals of the part (keysig_tests.cpp preferSharpFlat)', () => {
        const score1 = open('keysig_data/preferSharpFlat-1.mscx')
        const part1 = score1.parts()[0]
        part1.setPreferSharpFlat(PreferSharpFlat.FLATS)
        Transpose.transpositionChanged(score1, part1, part1.instrument(new Fraction(0, 1)).transpose().clone(), new Fraction(0, 1),
            new Fraction(16, 4))
        layoutScore(score1)
        expectRef(score1, 'keysig_data/preferSharpFlat-1-ref.mscx')

        const score2 = open('keysig_data/preferSharpFlat-2.mscx')
        // transpose augmented unison up
        transpose(score2, TransposeMode.BY_INTERVAL, TransposeDirection.UP, 1, true, true, true)
        expectRef(score2, 'keysig_data/preferSharpFlat-2-ref.mscx')
    })

    function firstNote(score: MasterScore): Note {
        const seg = score.firstMeasure()!.first(SegmentType.ChordRest)!
        return (seg.element(0) as unknown as Chord).notes()[0]
    }

    it('transposes the selected note by a semitone (transpose-up/-down) and diatonically keeping alterations', () => {
        const score = open('transpose_data/undoTranspose.mscx')
        const note = firstNote(score)
        const pitch = note.pitch()
        const before = scoreHash(score)
        score.select(note, SelectType.SINGLE, 0)

        expect(executeAction(score, 'transpose-up')).toBe(true)
        expect(note.pitch()).toBe(pitch + 1)
        expect(executeAction(score, 'transpose-down')).toBe(true)
        expect(note.pitch()).toBe(pitch)
        expect(undo(score)).toBe(true)
        expect(undo(score)).toBe(true)
        expect(note.pitch()).toBe(pitch)
        score.select(null)
        expect(scoreHash(score)).toBe(before)

        score.select(note, SelectType.SINGLE, 0)
        expect(executeAction(score, 'pitch-up-diatonic-alterations')).toBe(true)
        expect(note.pitch()).toBeGreaterThan(pitch)
        expect(undo(score)).toBe(true)
        expect(note.pitch()).toBe(pitch)
    })

    it('transposes the whole score from the Transpose dialog when nothing is selected', () => {
        const score = open('transpose_data/undoTranspose.mscx')
        const before = scoreHash(score)
        const info = prepareTransposeSelection(score)
        expect(info).toEqual({ allSelected: true, rangeSelection: true, hasChordNames: false })

        expect(transposeSelection(score, {
            mode: TransposeMode.BY_INTERVAL, direction: TransposeDirection.UP, key: Key.C, interval: 4,
            needTransposeKeys: true, needTransposeChordNames: true, needTransposeDoubleSharpsFlats: true,
        }, info.allSelected)).toBe(true)
        expect(hasSelection(score)).toBe(false)
        expectRef(score, 'transpose_data/undoTranspose01-ref.mscx')

        expect(undo(score)).toBe(true)
        score.select(null)
        expect(scoreHash(score)).toBe(before)
    })
})
