// SPDX-License-Identifier: GPL-3.0-only
// The score comparison (not in MuseScore, diff/api.ts): equal scores have no differences, a changed note is marked on
// both sides, inserted measures are aligned like inserted lines of a text diff, the instrument pairs.
import { describe, expect, test } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import {
    AddBoxesTarget, addMeasures, compareScores, defaultInstrumentPairs, diffInstruments, diffMeasuresBounds, drawDiffPage,
    layoutScore, sameInstruments, showOnlyInstruments, type MasterScore,
} from '../src/index'
import type { Chord } from '../src/engraving/dom/chord'
import { SegmentType } from '../src/engraving/dom/segment'
import { VTEST, hasSubmodule, openScore } from './helpers'

const FILE = `${VTEST}/accidental-1.mscx`

async function open(file = FILE): Promise<MasterScore> {
    const score = await openScore(file)
    layoutScore(score)
    return score
}

function firstChord(score: MasterScore, measureIdx = 0): Chord {
    let m = score.firstMeasure()!
    for (let i = 0; i < measureIdx; ++i) {
        m = m.nextMeasure()!
    }
    for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
        const e = s.element(0)
        if (e?.isChord()) {
            return e as unknown as Chord
        }
    }
    throw new Error('no chord')
}

describe.skipIf(!hasSubmodule)('score comparison', () => {
    test('equal scores have no differences', async () => {
        const a = await open()
        const b = await open()
        expect(sameInstruments(a, b)).toBe(true)
        const diff = compareScores(a, b, defaultInstrumentPairs(a, b))
        expect(diff.hunks).toEqual([])
        expect(diff.a.items.size).toBe(0)
        expect(diff.b.items.size).toBe(0)
    })

    test('a changed pitch is marked in both scores', async () => {
        const a = await open()
        const b = await open()
        const note = firstChord(b, 1).notes()[0]
        note.setPitch(note.pitch() + 2)
        layoutScore(b)
        const diff = compareScores(a, b, defaultInstrumentPairs(a, b))
        expect(diff.hunks.length).toBe(1)
        expect(diff.b.items.has(note)).toBe(true)
        expect(diff.a.items.has(firstChord(a, 1).notes()[0])).toBe(true)
        expect([...diff.b.measures.keys()]).toEqual([b.firstMeasure()!.nextMeasure()])
        const bounds = diffMeasuresBounds(b, diff.hunks[0].b, [0])
        expect(bounds?.page).toBe(0)
        expect(bounds!.width).toBeGreaterThan(0)
    })

    test('inserted measures are aligned', async () => {
        const a = await open()
        const b = await open()
        const n = b.measures().size()
        expect(addMeasures(b, 2, AddBoxesTarget.AtEndOfScore)).toBe(true)
        expect(b.measures().size()).toBe(n + 2)
        const diff = compareScores(a, b, defaultInstrumentPairs(a, b))
        expect(diff.hunks.length).toBe(1)
        expect(diff.hunks[0].a).toEqual([])
        expect(diff.hunks[0].b.length).toBe(2)
        expect(diff.a.items.size).toBe(0)
        // swapped: the measures are deleted
        const back = compareScores(b, a, defaultInstrumentPairs(b, a))
        expect(back.hunks[0].a.length).toBe(2)
        expect(back.hunks[0].b).toEqual([])
    })

    test('instruments: pairs and hidden instruments', async () => {
        const a = await open(`${VTEST}/../scores/accidental-1.mscx`)
        const list = diffInstruments(a)
        expect(list.length).toBeGreaterThan(0)
        expect(defaultInstrumentPairs(a, a)).toEqual(list.map(i => ({ a: i.index, b: i.index })))
        const original = a.parts().map(p => p.show())
        showOnlyInstruments(a, [], original)
        expect(a.parts().every(p => !p.show())).toBe(true)
        showOnlyInstruments(a, null, original)
        expect(a.parts().map(p => p.show())).toEqual(original)
    })

    test('draws the marked pages', async () => {
        const a = await open()
        const b = await open()
        const note = firstChord(b, 0).notes()[0]
        note.setPitch(note.pitch() - 1)
        layoutScore(b)
        const diff = compareScores(a, b, defaultInstrumentPairs(a, b))
        const count = (marks: boolean): { red: number; light: number } => {
            const canvas = createCanvas(850, 1100)
            drawDiffPage(b, 0, canvas.getContext('2d') as never, { marks: marks ? diff.b : null, colors: { item: '#ff0000', background: 'rgba(0, 0, 255, 0.2)' } })
            const data = canvas.getContext('2d').getImageData(0, 0, 850, 1100).data
            let red = 0
            let light = 0
            for (let i = 0; i < data.length; i += 4) {
                red += data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60 ? 1 : 0
                light += data[i] < 230 && data[i] > 150 && data[i + 2] > 240 ? 1 : 0
            }
            return { red, light }
        }
        expect(count(false)).toEqual({ red: 0, light: 0 })
        const marked = count(true)
        expect(marked.red).toBeGreaterThan(20)
        expect(marked.light).toBeGreaterThan(1000)
    })
})
