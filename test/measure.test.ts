// SPDX-License-Identifier: GPL-3.0-only
// Inserting measures (MasterScore::insertMeasure): MuseScore's engraving/tests/measure_tests.cpp insert tests with
// their reference files, checked by comparing the staves of writeMscx with the reference files.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { layoutScore, loadScore, writeMscx, type MasterScore } from '../src/index'
import { ElementType } from '../src/engraving/types/types'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import type { Measure } from '../src/engraving/dom/measure'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/measure_data/`
const hasData = existsSync(DATA)

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links */
function staves(mscx: string): string {
    const score = mscx.substring(mscx.indexOf('<Score>'))
    const parts: string[] = []
    const re = /\n {4}<Staff id="\d+">[\s\S]*?\n {4}<\/Staff>/g
    for (const m of score.matchAll(re)) {
        parts.push(m[0])
    }
    return parts.join('\n')
        .split('\n')
        .filter(l => !/<eid>|<linkedMain|<linked>/.test(l))
        .join('\n')
}

function open(name: string): MasterScore {
    const score = loadScore(readFileSync(`${DATA}${name}`))
    layoutScore(score)
    return score
}

function nthMeasure(score: MasterScore, n: number): Measure {
    let m = score.firstMeasure()!
    for (let i = 1; i < n; ++i) {
        m = m.nextMeasure()!
    }
    return m
}

/** C++ score->startCmd(); score->insertMeasure(m); score->endCmd() */
function insertMeasure(score: MasterScore, m: Measure | null): void {
    score.startCmd(TranslatableString.untranslatable('Engraving measure tests'))
    score.insertMeasure(ElementType.MEASURE, m)
    score.endCmd()
}

function expectRef(score: MasterScore, ref: string): void {
    expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${DATA}${ref}`, 'utf8')))
}

describe.skipIf(!hasData)('insert measures (MuseScore measure tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('insertMeasureMiddle', () => {
        const score = open('measure-1.mscx')
        insertMeasure(score, nthMeasure(score, 2))
        expectRef(score, 'measure-1-ref.mscx')
    })

    it('insertMeasureBegin', () => {
        const score = open('measure-1.mscx')
        insertMeasure(score, score.firstMeasure())
        expectRef(score, 'measure-2-ref.mscx')
    })

    it('insertMeasureEnd', () => {
        const score = open('measure-1.mscx')
        insertMeasure(score, null)
        expectRef(score, 'measure-3-ref.mscx')
    })

    it('insertAtBeginning', () => {
        const score = open('measure-insert_beginning.mscx')
        insertMeasure(score, score.firstMeasure())
        expectRef(score, 'measure-insert_beginning-ref.mscx')
    })

    it('insertBfClefChange', () => {
        const score = open('measure-insert_bf_clef.mscx')
        insertMeasure(score, nthMeasure(score, 4))
        expectRef(score, 'measure-insert_bf_clef-ref.mscx')
        score.undoRedo(true, null)
        expectRef(score, 'measure-insert_bf_clef.mscx')

        insertMeasure(score, nthMeasure(score, 6))
        expectRef(score, 'measure-insert_bf_clef-2-ref.mscx')
        score.undoRedo(true, null)
        expectRef(score, 'measure-insert_bf_clef.mscx')
    })

    it('insertBfKeyChange', () => {
        const score = open('measure-insert_bf_key.mscx')
        insertMeasure(score, nthMeasure(score, 4))
        expectRef(score, 'measure-insert_bf_key-ref.mscx')
        score.undoRedo(true, null)
        expectRef(score, 'measure-insert_bf_key_undo-ref.mscx')

        insertMeasure(score, nthMeasure(score, 6))
        expectRef(score, 'measure-insert_bf_key-2-ref.mscx')
        score.undoRedo(true, null)
        expectRef(score, 'measure-insert_bf_key_undo-ref.mscx')
    })

    it('spanner_a', () => {
        const score = open('measure-3.mscx')
        insertMeasure(score, nthMeasure(score, 2))
        expectRef(score, 'measure-4-ref.mscx')
    })

    it('spanner_b', () => {
        const score = open('measure-4.mscx')
        insertMeasure(score, score.firstMeasure())
        expectRef(score, 'measure-5-ref.mscx')
    })

    // delete measures (cmdTimeDelete of a selected measure)
    for (const [name, which, layoutAfter] of [
        ['spanner_A', 1, true], ['spanner_B', 2, false], ['spanner_C', 2, false], ['spanner_D', 2, false],
    ] as const) {
        it(name, () => {
            const file = { spanner_A: 'measure-6', spanner_B: 'measure-7', spanner_C: 'measure-8', spanner_D: 'measure-9' }[name]
            const score = open(`${file}.mscx`)
            score.select(nthMeasure(score, which))
            score.startCmd(TranslatableString.untranslatable('Engraving measure tests'))
            score.cmdTimeDelete()
            score.endCmd()
            if (layoutAfter) {
                layoutScore(score)
            }
            expectRef(score, `${file}-ref.mscx`)
        })
    }

    it('deleteLast', () => {
        const score = open('measure-10.mscx')
        score.select(score.lastMeasure())
        score.startCmd(TranslatableString.untranslatable('Engraving measure tests'))
        score.cmdTimeDelete()
        score.endCmd()
        expectRef(score, 'measure-10-ref.mscx')
    })
})

const SPANNERS = `${ROOT}MuseScore/src/engraving/tests/spanners_data/`

describe.skipIf(!existsSync(SPANNERS))('delete measures with lyrics lines (MuseScore spanners tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    for (const [name, file] of [
        ['spanners09', 'lyricsline02'], ['spanners10', 'lyricsline03'], ['spanners11', 'lyricsline04'], ['spanners12', 'lyricsline05'],
    ]) {
        it(name, () => {
            const score = loadScore(readFileSync(`${SPANNERS}${file}.mscx`))
            layoutScore(score)
            // delete the second measure
            score.startCmd(TranslatableString.untranslatable('Engraving spanners tests'))
            score.select(nthMeasure(score, 2))
            score.cmdTimeDelete()
            score.endCmd()
            expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${SPANNERS}${file}-ref.mscx`, 'utf8')))
            // undo
            score.undoRedo(true, null)
            layoutScore(score) // measure needs to be renumbered
            expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${SPANNERS}${file}.mscx`, 'utf8')))
        })
    }
})
