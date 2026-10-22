// SPDX-License-Identifier: GPL-3.0-only
// Copy and paste (Selection::mimeData, Score::cmdPaste / pasteStaff / pasteSymbols): MuseScore's own copypaste tests
// (engraving/tests/copypaste_tests.cpp with their reference files), checked by comparing the staves of writeMscx with
// the reference files; undo and redo restore the SVG of all pages.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { executeAction, layoutScore, loadScore, redo, setClipboardContents, clipboardContents, undo, writeMscx, type MasterScore } from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import type { Chord } from '../src/engraving/dom/chord'
import { ElementType } from '../src/engraving/types/types'
import { Factory } from '../src/engraving/dom/factory'
import { scoreDummy } from '../src/engraving/compat/dummyelement'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import { DEMOS, ROOT, hasSubmodule, initFonts, openScore, scoreHash as hashWithSelection } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/copypaste_data/`
const hasData = existsSync(DATA)

function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

async function open(name: string): Promise<MasterScore> {
    await initFonts()
    const score = loadScore(readFileSync(`${DATA}${name}`))
    layoutScore(score)
    return score
}

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links, normalized */
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

function measure(score: MasterScore, n: number) {
    let m = score.firstMeasure()!
    for (let i = 1; i < n; ++i) {
        m = m.nextMeasure()!
    }
    return m
}

/** copypaste_tests.cpp copypaste(): measure 2 (all staves) copied onto the first element of measure 4 */
async function copypaste(idx: string): Promise<{ result: string; ref: string }> {
    const score = await open(`copypaste${idx}.mscx`)
    const m2 = measure(score, 2)
    const m4 = measure(score, 4)
    score.select(m2)
    if (score.nstaves() > 1) {
        score.select(m2, SelectType.RANGE, score.nstaves() - 1)
    }
    expect(score.selection().canCopy()).toBe(true)
    expect(executeAction(score, 'action://notation/copy')).toBe(true)

    score.select(m4.first()!.element(0))
    expect(executeAction(score, 'action://notation/paste')).toBe(true)

    const result = staves(writeMscx(score))
    const ref = staves(readFileSync(`${DATA}copypaste${idx}-ref.mscx`, 'utf8'))
    return { result, ref }
}

describe.skipIf(!hasData)('copy/paste (MuseScore copypaste tests)', () => {
    // the cases whose reference files the port reproduces exactly
    for (const idx of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '19', '22', '23', '24', '25', '26', '27']) {
        it(`copypaste${idx}`, async () => {
            const { result, ref } = await copypaste(idx)
            expect(result).toBe(ref)
        })
    }

    it('copypastestaff50: a staff onto the other staff', async () => {
        const score = await open('copypaste50.mscx')
        const m2 = measure(score, 2)
        score.select(m2, SelectType.RANGE, 0)
        executeAction(score, 'action://notation/copy')
        score.deselectAll()
        score.select(m2, SelectType.RANGE, 1)
        executeAction(score, 'action://notation/paste')
        expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${DATA}copypaste50-ref.mscx`, 'utf8')))
    })

    for (const idx of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']) {
        it(`copypasteNote${idx}: a note onto a note or rest`, async () => {
            const score = await open(`copypasteNote${idx}.mscx`)
            const m1 = measure(score, 1)
            const m2 = measure(score, 2)
            const s = m2.first(SegmentType.ChordRest)!
            score.select((s.element(0) as unknown as Chord).notes()[0])
            executeAction(score, 'action://notation/copy')
            const cr = m1.first(SegmentType.ChordRest)!.nextChordRest(0) as ChordRest
            score.select(cr.isChord() ? (cr as unknown as Chord).upNote() : cr)
            executeAction(score, 'action://notation/paste')
            expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${DATA}copypasteNote${idx}-ref.mscx`, 'utf8')))
        })
    }
})

const SYMBOL_DATA = `${ROOT}MuseScore/src/engraving/tests/copypastesymbollist_data/`

/** copypastesymbollist_tests.cpp copypastecommon(): the selection pasted onto the first element of measure 5 */
function pasteSymbolList(score: MasterScore, name: string): void {
    expect(score.selection().canCopy()).toBe(true)
    expect(score.selection().mimeType()).toBe('application/musescore/symbollist')
    executeAction(score, 'action://notation/copy')
    score.select(measure(score, 5).first()!.element(0))
    executeAction(score, 'action://notation/paste')
    expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${SYMBOL_DATA}copypastesymbollist-${name}-ref.mscx`, 'utf8')))
}

describe.skipIf(!hasData)('copy/paste of symbol lists (MuseScore copypastesymbollist tests)', () => {
    const cases: [string, ElementType][] = [
        ['articulation', ElementType.ARTICULATION],
        ['ornament', ElementType.ORNAMENT],
        ['chordnames', ElementType.HARMONY],
        ['chordnames-01', ElementType.HARMONY],
        ['lyrics', ElementType.LYRICS],
        ['stafftext', ElementType.STAFF_TEXT],
        ['tremolo-single-chord', ElementType.TREMOLO_SINGLECHORD],
        ['articulation-rest', ElementType.ARTICULATION],
    ]
    for (const [name, type] of cases) {
        it(name, async () => {
            await initFonts()
            const score = loadScore(readFileSync(`${SYMBOL_DATA}copypastesymbollist-${name}.mscx`))
            layoutScore(score)
            score.selectSimilar(Factory.createItem(type, scoreDummy(score))!, false)
            pasteSymbolList(score, name)
        })
    }

    for (const [name, staff] of [['range', 0], ['range-01', 1]] as const) {
        it(name, async () => {
            await initFonts()
            const score = loadScore(readFileSync(`${SYMBOL_DATA}copypastesymbollist-${name}.mscx`))
            layoutScore(score)
            score.select(score.firstMeasure())
            score.select(score.firstMeasure()!.nextMeasure(), SelectType.RANGE, staff)
            score.selectSimilarInRange(Factory.createItem(ElementType.ARTICULATION, scoreDummy(score))!)
            pasteSymbolList(score, name)
        })
    }
})

describe.skipIf(!hasSubmodule)('copy/paste undo/redo', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Reunion.mscz`)
    })

    it('paste of a measure, cut, paste half/double, swap and repeat restore the pages on undo', () => {
        const actions: [string, () => void][] = [
            ['paste', () => {
                score.select(measure(score, 6))
                executeAction(score, 'action://notation/copy')
                score.select(measure(score, 8).first()!.element(0))
                executeAction(score, 'action://notation/paste')
            }],
            ['cut', () => {
                score.select(measure(score, 5))
                executeAction(score, 'action://notation/cut')
            }],
            ['paste half', () => {
                score.select(measure(score, 6))
                executeAction(score, 'action://notation/copy')
                score.select(measure(score, 7).first()!.element(0))
                executeAction(score, 'notation-paste-half')
            }],
            ['paste double', () => {
                score.select(measure(score, 6))
                executeAction(score, 'action://notation/copy')
                score.select(measure(score, 7).first()!.element(0))
                executeAction(score, 'notation-paste-double')
            }],
            ['swap', () => {
                score.select(measure(score, 5))
                executeAction(score, 'action://notation/copy')
                score.select(measure(score, 7))
                executeAction(score, 'notation-swap')
            }],
            ['repeat selection', () => {
                score.select(measure(score, 5))
                executeAction(score, 'repeat-sel')
            }],
        ]
        for (const [name, action] of actions) {
            const before = scoreHash(score)
            action()
            const after = scoreHash(score)
            expect(after, name).not.toBe(before)
            expect(undo(score), name).toBe(true)
            expect(scoreHash(score), `${name}: undo`).toBe(before)
            expect(redo(score), name).toBe(true)
            expect(scoreHash(score), `${name}: redo`).toBe(after)
            undo(score)
        }
    })

    it('the clipboard keeps MuseScore\'s formats', () => {
        score.select(measure(score, 6))
        executeAction(score, 'action://notation/copy')
        const data = clipboardContents()
        expect(Object.keys(data)).toEqual(['application/musescore/stafflist'])
        expect(data['application/musescore/stafflist']).toContain('<StaffList version="4.70"')
        // pasting data from another source (e.g. the system clipboard)
        setClipboardContents(data)
        const before = scoreHash(score)
        score.select(measure(score, 10).first(SegmentType.ChordRest)!.element(0))
        expect(executeAction(score, 'action://notation/paste')).toBe(true)
        expect(scoreHash(score)).not.toBe(before)
        undo(score)
    })
})
