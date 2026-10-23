// SPDX-License-Identifier: GPL-3.0-only
// The export (File > Export…): ExportDialogModel (formats, unit types, the scores, MuseScore's file names) and the
// writers of PDF, PNG, SVG and MuseScore files; PDFs are checked with qpdf and rasterized with pdftoppm if installed.
import {
    createExportDialogModel, defaultExportConfiguration, loadScore, layoutScore, pageCount, pageSize, setExportCanvasFactory,
    UnitType, writeMscx, type ExportConfiguration, type ExportDialogModel, type MasterScore,
} from '../src/index'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { PNG } from 'pngjs'
import { unzipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEMOS, canvasPixels, hasSubmodule, inkDifference, openScore } from './helpers'

function hasTool(name: string): boolean {
    try {
        execFileSync('which', [name], { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

const decoder = new TextDecoder()

function model(score: MasterScore, configuration: ExportConfiguration = defaultExportConfiguration(), name = 'Amazing_grace'): ExportDialogModel {
    const m = createExportDialogModel(score, configuration, name)
    m.init()
    // the dialog starts with the format and scores of the last export of the project: back to the defaults
    m.selectExportTypeById('pdf')
    m.setUnitType(UnitType.PER_PART)
    select(m, ['main'])
    return m
}

function select(m: ExportDialogModel, titles: string[]): void {
    m.setAllSelected(false)
    m.items().forEach((item, i) => m.setSelected(i, titles.includes(item.isMain ? 'main' : item.title)))
}

describe.skipIf(!hasSubmodule)('export', () => {
    let score: MasterScore

    beforeAll(async () => {
        setExportCanvasFactory((w, h) => createCanvas(w, h) as never)
        score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
    })

    it('lists the main score and the parts (also the potential ones) with the current notation selected', () => {
        const m = model(score)
        const items = m.items()
        expect(items[0]).toEqual({ title: '', isSelected: true, isMain: true })
        expect(items.length).toBeGreaterThan(1)
        expect(items.slice(1).every(i => !i.isSelected && i.title)).toBe(true)
        expect(m.selectionLength()).toBe(1)
    })

    it('offers the formats with their unit types and subtypes like MuseScore', () => {
        const m = model(score)
        expect(m.exportTypeList().map(t => t.id)).toEqual(['pdf', 'png', 'svg', 'mid', 'mxl', 'mscz'])
        expect(m.selectedExportType().id).toBe('pdf')
        expect(m.availableUnitTypes().map(u => u.value)).toEqual([UnitType.PER_PART, UnitType.MULTI_PART])
        m.setUnitType(UnitType.MULTI_PART)
        // PNG has only "each page": the unit type follows
        m.selectExportTypeById('png')
        expect(m.selectedUnitType()).toBe(UnitType.PER_PAGE)
        m.selectExportTypeById('musicxml')
        expect(m.selectedExportType().suffixes).toEqual(['musicxml'])
        expect(m.selectedTopLevelType().id).toBe('mxl')
        expect(m.selectedUnitType()).toBe(UnitType.PER_PART)
        m.selectExportTypeById('mscx')
        expect(m.selectedTopLevelType().id).toBe('mscz')
    })

    it('suggests the file names of MuseScore', () => {
        const m = model(score)
        const parts = m.items().slice(1).map(i => i.title)
        expect(m.defaultFileName()).toBe('Amazing_grace.pdf')
        select(m, ['main', parts[0]])
        m.setUnitType(UnitType.MULTI_PART)
        expect(m.defaultFileName()).toBe('Amazing_grace-Score_and_Parts.pdf')
        select(m, [parts[0], parts[1]])
        expect(m.defaultFileName()).toBe('Amazing_grace-Parts.pdf')
        select(m, [parts[0]])
        m.setUnitType(UnitType.PER_PART)
        expect(m.defaultFileName()).toBe(`Amazing_grace-${parts[0].replace(/ /g, '_')}.pdf`)
    })

    it('exports the pages of several scores as separate files with part and page numbers', async () => {
        const m = model(score)
        const parts = m.items().slice(1).map(i => i.title)
        m.selectExportTypeById('svg')
        select(m, ['main', parts[0]])
        const files = await m.exportScores()
        const names = files.map(f => f.fileName)
        expect(names.slice(0, pageCount(score))).toEqual(Array.from({ length: pageCount(score) }, (_, i) => `Amazing_grace-${i + 1}.svg`))
        expect(names[pageCount(score)]).toBe(`Amazing_grace-${parts[0].replace(/ /g, '_')}-1.svg`)
        const svg = decoder.decode(files[0].data)
        expect(svg).toMatch(/^<svg [^>]*width="8.26\d*in"/)
        expect(svg).toContain('<title>Amazing_grace (1)</title>')
        // the export does not change the view mode of the scores
        expect(score.pages().length).toBe(pageCount(score))
    })

    it('writes transparent SVGs and clips with masks for Adobe Illustrator', async () => {
        const configuration = defaultExportConfiguration()
        configuration.images.exportSvgWithTransparentBackground = true
        configuration.images.exportSvgWithIllustratorCompat = true
        const m = model(score, configuration)
        m.selectExportTypeById('svg')
        const svg = decoder.decode((await m.exportScores())[0].data)
        expect(svg).not.toContain('clipPath')
        expect(svg).toContain('<mask')
        expect(svg).not.toMatch(/fill="#ffffff"[^>]*d="M0 0H/)
    })

    it.runIf(hasTool('qpdf'))('writes a valid vector PDF with a page per score page in the page size', async () => {
        const m = model(score)
        const files = await m.exportScores()
        expect(files.map(f => f.fileName)).toEqual(['Amazing_grace.pdf'])
        const dir = mkdtempSync(join(tmpdir(), 'museencore-export-'))
        const file = join(dir, 'score.pdf')
        writeFileSync(file, files[0].data)
        expect(execFileSync('qpdf', ['--check', file]).toString()).toMatch(/No syntax or stream encoding errors/)
        const info = execFileSync('pdfinfo', [file]).toString()
        expect(info).toMatch(new RegExp(`Pages:\\s+${pageCount(score)}`))
        const size = pageSize(score, 0)
        const [, w, h] = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info)!
        expect(Number(w)).toBeCloseTo(size.width * 72, 2)
        expect(Number(h)).toBeCloseTo(size.height * 72, 2)
        // the work title of the score, else the project's name (the score has no "workTitle" meta tag)
        expect(info).toMatch(/Title:\s+Amazing_grace\n/)
    })

    it.runIf(hasTool('pdftoppm'))('draws the PDF like the score view', async () => {
        const files = await model(score).exportScores()
        const dir = mkdtempSync(join(tmpdir(), 'museencore-export-'))
        writeFileSync(join(dir, 'score.pdf'), files[0].data)
        // poppler draws lines at least one pixel wide: at 300 DPI the lines of the score are wider
        const dpi = 300
        execFileSync('pdftoppm', ['-r', String(dpi), '-f', '1', '-l', '1', '-png', join(dir, 'score.pdf'), join(dir, 'page')])
        const png = PNG.sync.read(readFileSync(join(dir, 'page-1.png')))
        const ref = canvasPixels(score, 0, dpi)
        expect(Math.abs(png.width - ref.w)).toBeLessThanOrEqual(1) // poppler rounds the page size up
        const ink = new Uint8Array(ref.w * ref.h)
        for (let y = 0; y < ref.h; ++y) {
            for (let x = 0; x < ref.w; ++x) {
                ink[y * ref.w + x] = png.data[4 * (y * png.width + x)] < 128 ? 1 : 0
            }
        }
        expect(inkDifference(ink, ref.ink, ref.w, 1)).toBeLessThan(0.002)
    })

    it.runIf(hasTool('qpdf'))('combines all parts in one PDF', async () => {
        const m = model(score)
        m.setAllSelected(true)
        m.setUnitType(UnitType.MULTI_PART)
        const files = await m.exportScores()
        expect(files.length).toBe(1)
        const dir = mkdtempSync(join(tmpdir(), 'museencore-export-'))
        writeFileSync(join(dir, 'all.pdf'), files[0].data)
        const info = execFileSync('pdfinfo', [join(dir, 'all.pdf')]).toString()
        const pages = Number(/Pages:\s+(\d+)/.exec(info)![1])
        expect(pages).toBeGreaterThan(pageCount(score))
    })

    it('writes PNGs at the resolution, in grayscale and transparent', async () => {
        const configuration = defaultExportConfiguration()
        configuration.images.exportPngDpiResolution = 72
        const m = model(score, configuration)
        m.selectExportTypeById('png')
        const files = await m.exportScores()
        expect(files.map(f => f.fileName)).toEqual(Array.from({ length: pageCount(score) }, (_, i) => `Amazing_grace-${i + 1}.png`))
        const png = PNG.sync.read(Buffer.from(files[0].data))
        const size = pageSize(score, 0)
        expect([png.width, png.height]).toEqual([Math.round(size.width * 72), Math.round(size.height * 72)])
        expect(png.data[3]).toBe(255) // white, not transparent
        const ref = canvasPixels(score, 0, 72)
        const ink = new Uint8Array(png.width * png.height)
        for (let i = 0; i < ink.length; ++i) {
            ink[i] = png.data[4 * i] < 128 ? 1 : 0
        }
        expect(inkDifference(ink, ref.ink, ref.w, 0)).toBeLessThan(0.001)

        configuration.images.exportPngWithTransparentBackground = true
        configuration.images.exportPngWithGrayscale = true
        const transparent = PNG.sync.read(Buffer.from((await m.exportScores())[0].data))
        expect(transparent.data[3]).toBe(0)
        for (let i = 0; i < transparent.data.length; i += 4) {
            expect(transparent.data[i]).toBe(transparent.data[i + 1])
        }
    })

    it('exports a part as a MuseScore file of its own that opens like the part', async () => {
        const m = model(score)
        const part = m.items()[1].title
        select(m, [part])
        m.selectExportTypeById('mscz')
        const files = await m.exportScores()
        expect(files.map(f => f.fileName)).toEqual([`Amazing_grace-${part.replace(/ /g, '_')}.mscz`])
        const entries = unzipSync(files[0].data)
        expect(Object.keys(entries).some(n => n.startsWith('Excerpts/'))).toBe(false)
        const exported = loadScore(files[0].data)
        layoutScore(exported)
        expect(exported.parts().length).toBe(1)
        expect(exported.excerpts().length).toBe(0)
        // the part's music, without links to the main score
        expect(writeMscx(exported)).not.toContain('<linked')
        expect(pageCount(exported)).toBeGreaterThan(0)

        // the main score keeps its parts
        select(m, ['main'])
        const main = unzipSync((await m.exportScores())[0].data)
        expect(Object.keys(main)).toContain('META-INF/container.xml')
    })
})
