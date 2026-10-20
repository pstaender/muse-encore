// SPDX-License-Identifier: GPL-3.0-only
// SVG output (used for printing): glyph reuse, shared definitions, same drawing as the canvas output.
import { describe, expect, it } from 'vitest'
import { SvgGlyphDefs, drawPageSvg, pageCount } from '../src/index'
import { DEMOS, VTEST, canvasPixels, hasSubmodule, inkDifference, openScore, svgPixels } from './helpers'

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length

describe.skipIf(!hasSubmodule)('SVG output', () => {
    it('defines each glyph once and places it with <use>', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const svg = drawPageSvg(score, 0)
        const defs = count(svg, /<path id="g/g)
        const uses = count(svg, /<use /g)
        expect(defs).toBeGreaterThan(10)
        expect(uses).toBeGreaterThan(5 * defs)
        // every reference has a definition
        for (const m of svg.matchAll(/xlink:href="#([^"]+)"/g)) {
            expect(svg).toContain(`id="${m[1]}"`)
        }
        expect(svg).toMatch(/width="8\.2\d*in" height="11\.69\d*in"/)
    })

    it('shares glyph definitions between the pages of a document', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const defs = new SvgGlyphDefs()
        const pages = Array.from({ length: pageCount(score) }, (_, i) => drawPageSvg(score, i, { defs }))
        const shared = defs.svg()
        for (const p of pages) {
            expect(count(p, /<path id="g/g)).toBe(0)
            for (const m of p.matchAll(/xlink:href="#([^"]+)"/g)) {
                expect(shared).toContain(`id="${m[1]}"`)
            }
        }
        // clip and mask ids are unique in the document
        const ids = pages.flatMap(p => [...p.matchAll(/ id="([^"]+)"/g)].map(m => m[1]))
        expect(new Set(ids).size).toBe(ids.length)
    })

    // antialiasing differs between the rasterizers, the shapes must not
    it.each([
        [`${DEMOS}/Amazing_grace.mscz`, 0],
        [`${VTEST}/tablature-2.mscz`, 0], // staff line masks behind fret marks
        [`${VTEST}/lv-ties.mscz`, 0],
    ])('rasterizes %s like the canvas output', async (file, page) => {
        const score = await openScore(file)
        const dpi = 400
        const canvas = canvasPixels(score, page, dpi)
        const svg = await svgPixels(drawPageSvg(score, page), canvas.w, canvas.h)
        expect(inkDifference(canvas.ink, svg, canvas.w)).toBeLessThan(0.01)
    }, 60000)

    it('uses masks for staff lines behind fret marks', async () => {
        const svg = drawPageSvg(await openScore(`${VTEST}/tablature-2.mscz`), 0)
        expect(svg).toContain('<mask ')
        expect(svg).toMatch(/mask="url\(#m\d+\)"/)
    })
})
