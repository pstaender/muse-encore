// SPDX-License-Identifier: GPL-3.0-only
// Reading and layout of scores of all file versions; page counts and sizes as in MuseScore 4.7.5.
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { drawPage, isTwoSided, pageCount, pageSize, scoreTitle } from '../src/index'
import { DEMOS, TEST_FILES, VTEST, canvasPixels, hasSubmodule, inkDifference, openScore } from './helpers'

describe.skipIf(!hasSubmodule)('rendering', () => {
    // page counts of MuseScore 4.7.5 (PDF/PNG export)
    it.each([
        [`${DEMOS}/goldberg.mscz`, 119],
        [`${DEMOS}/Amazing_grace.mscz`, 2],
        [`${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`, 5], // 2.x file
        [`${VTEST}/page-numbers-03.mscz`, 4],
    ])('lays out %s on %i pages', async (file, pages) => {
        const score = await openScore(file)
        expect(pageCount(score)).toBe(pages)
    }, 60000)

    it('knows two-sided page layouts and the title', async () => {
        expect(isTwoSided(await openScore(`${VTEST}/page-numbers-03.mscz`))).toBe(true)
        expect(scoreTitle(await openScore(`${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`))).toBe('Nocturne  Op.9  No.2')
        expect(scoreTitle(await openScore(`${DEMOS}/Amazing_grace.mscz`))).toBe('')
    }, 60000)

    it('has landscape page sizes', async () => {
        const s = pageSize(await openScore(`${VTEST}/mmrest-measure-repeat-custom-staves.mscz`))
        expect(s.width).toBeCloseTo(11.69, 2)
        expect(s.height).toBeCloseTo(5.51, 2)
    })

    // the web viewer draws zoomed-in pages as tiles of the visible part
    it('draws a region of a page like the same part of the whole page', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const dpi = 200
        const whole = canvasPixels(score, 0, dpi)
        const region = { x: 300, y: 500, width: 700, height: 400 }
        const c = createCanvas(region.width, region.height)
        drawPage(score, 0, c.getContext('2d') as never, { dpi, region })
        const data = c.getContext('2d').getImageData(0, 0, region.width, region.height).data
        const tile = new Uint8Array(region.width * region.height)
        const crop = new Uint8Array(region.width * region.height)
        for (let y = 0; y < region.height; ++y) {
            for (let x = 0; x < region.width; ++x) {
                tile[y * region.width + x] = data[(y * region.width + x) * 4] < 128 ? 1 : 0
                crop[y * region.width + x] = whole.ink[(y + region.y) * whole.w + x + region.x]
            }
        }
        expect(tile.some(v => v)).toBe(true)
        expect(inkDifference(tile, crop, region.width, 0)).toBeLessThan(0.01)
    }, 60000)
})
