// SPDX-License-Identifier: GPL-3.0-only
// The palettes (src/palette): MuseScore's default and master palette trees, and the cell icons drawn with the
// single renderer (every cell of an element draws pixels).
import { createCanvas } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultPalettes, drawPaletteCell, masterPalettes, morePaletteCells, paletteCellElement, type PaletteCellInfo } from '../src/index'
import { initFonts } from './helpers'

beforeAll(async () => {
    await initFonts()
})

function inkPixels(cell: PaletteCellInfo, width: number, height: number, mag: number): number {
    const dpr = 2
    const c = createCanvas(width * dpr, height * dpr)
    drawPaletteCell(cell.id, c.getContext('2d') as never, { width, height, dpr, extraMag: mag })
    const data = c.getContext('2d').getImageData(0, 0, width * dpr, height * dpr).data
    let n = 0
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 64) {
            n++
        }
    }
    return n
}

describe('palettes', () => {
    it('builds the default palette tree like MuseScore', () => {
        const palettes = defaultPalettes()
        expect(palettes.map(p => p.id)).toEqual([
            'Clef', 'KeySig', 'TimeSig', 'Tempo', 'Pitch', 'Accidental', 'Dynamic', 'Articulation', 'Text', 'Keyboard', 'Repeat',
            'BarLine', 'Layout', 'Bracket', 'Ornament', 'Breath', 'GraceNote', 'NoteHead', 'Arpeggio', 'Tremolo', 'Harp', 'Guitar',
            'Fingering', 'FretboardDiagram', 'Accordion', 'BagpipeEmbellishment', 'Handbells', 'Beam', 'Line',
        ])
        const clefs = palettes[0]
        expect(clefs.name).toBe('Clefs')
        expect(clefs.visible).toBe(true)
        expect([clefs.gridWidth, clefs.gridHeight, clefs.mag]).toEqual([36, 55, 0.8])
        expect(clefs.cells.map(c => c.name)).toEqual([
            'Treble clef', 'Treble clef 8va alta', 'Treble clef 15ma alta', 'Treble clef 8va bassa', 'Alto clef', 'Tenor clef',
            'Bass clef', 'Bass clef 8va alta', 'Bass clef 8va bassa', 'Percussion', 'Tablature', 'Tablature 4 lines',
        ])
        expect(clefs.cells.every(c => c.drawStaff)).toBe(true)
        // hidden by default ("Add palettes")
        expect(palettes.filter(p => !p.visible).map(p => p.id)).toContain('GraceNote')

        const keySigs = palettes[1].cells.map(c => c.name)
        expect(keySigs[0]).toBe('G major / E minor')
        expect(keySigs.at(-1)).toBe('Open / Atonal')

        const fingerings = palettes.find(p => p.id === 'Fingering')!.cells
        expect(fingerings[0].name).toBe('Fingering 0')

        const grace = palettes.find(p => p.id === 'GraceNote')!.cells
        expect(grace.map(c => c.action)).toEqual(['acciaccatura', 'appoggiatura', 'grace4', 'grace16', 'grace32', 'grace8after',
            'grace16after', 'grace32after'])
        expect(palettes.find(p => p.id === 'Layout')!.cells[0].icon).toBe(0xF483)
    })

    it('draws every cell of an element', () => {
        const empty: string[] = []
        for (const tree of [defaultPalettes(), masterPalettes()]) {
            for (const p of tree) {
                for (const cell of p.cells) {
                    if (cell.action || cell.icon) {
                        continue
                    }
                    if (inkPixels(cell, p.gridWidth, p.gridHeight, p.mag) < 4) {
                        empty.push(`${p.id}: ${cell.name}`)
                    }
                }
            }
        }
        expect(empty).toEqual([])
    })

    it('centers elements in the cell', () => {
        const dyn = defaultPalettes().find(p => p.id === 'Dynamic')!
        const cell = dyn.cells.find(c => c.name.startsWith('mf '))!
        const dpr = 1
        const w = dyn.gridWidth
        const h = dyn.gridHeight
        const c = createCanvas(w, h)
        drawPaletteCell(cell.id, c.getContext('2d') as never, { width: w, height: h, dpr, extraMag: dyn.mag })
        const data = c.getContext('2d').getImageData(0, 0, w, h).data
        let minX = w
        let maxX = 0
        let minY = h
        let maxY = 0
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 64) {
                    minX = Math.min(minX, x)
                    maxX = Math.max(maxX, x)
                    minY = Math.min(minY, y)
                    maxY = Math.max(maxY, y)
                }
            }
        }
        expect(Math.abs((minX + maxX) / 2 - w / 2)).toBeLessThan(3)
        expect(Math.abs((minY + maxY) / 2 - h / 2)).toBeLessThan(4)
    })

    it('offers the master palette elements under "More"', () => {
        const more = morePaletteCells('Clef').map(c => c.name)
        expect(more).toContain('Treble clef optional 8va bassa')
        expect(more).not.toContain('Treble clef')
        const cell = defaultPalettes()[0].cells[0]
        expect(paletteCellElement(cell.id)?.typeName()).toBe('Clef')
    })
})
