// SPDX-License-Identifier: GPL-3.0-only
// The user palette tree (PaletteProvider / UserPaletteController / PaletteTreeModel and PaletteTree::write/read):
// custom palettes, cells added from score elements and from "More", removing (hide / delete), properties, reset,
// "Add palettes", the XML the app stores and .mpal files.
import { beforeEach, beforeAll, describe, expect, it } from 'vitest'
import {
    RESET_PALETTE_QUESTION, RemoveAction, addCellsToPalette, addExtraPalette, canEditPaletteCell, createCustomPalette, createScore,
    defaultNewScoreOptions, extraPalettes, insertPaletteCell, loadPaletteFile, loadUserPalettes, morePaletteCells, movePalette,
    movePaletteCell, onUserPalettesChanged, paletteCellElement, paletteCellMimeData, paletteCellProperties, paletteProperties,
    removePalette, removePaletteCells, resetPalette, savePaletteFile, setPaletteCellProperties, setPaletteEditable,
    setPaletteExpanded, setPaletteProperties, userPalettes, userPalettesXml, type PaletteInfo, type RemoveQuestion,
} from '../src/index'
import { PaletteCreator } from '../src/palette/palettecreator'
import { PaletteTree } from '../src/palette/palettetree'
import { PaletteType } from '../src/palette/palette'
import { XmlReader } from '../src/engraving/rw/xmlreader'
import { XmlWriter } from '../src/engraving/rw/xmlwriter'
import { Factory } from '../src/engraving/dom/factory'
import { ElementType } from '../src/engraving/types/types'
import { scoreDummy } from '../src/engraving/compat/dummyelement'
import type { TextBase } from '../src/engraving/dom/textbase'
import { initFonts } from './helpers'

beforeAll(async () => {
    await initFonts()
})

function palette(type: string): PaletteInfo {
    return userPalettes().find(p => p.type === type)!
}

function byId(id: string): PaletteInfo {
    return userPalettes().find(p => p.id === id)!
}

/** answers the remove question with `action` and records it */
function answer(action: RemoveAction, asked: RemoveQuestion[] = []): (q: RemoveQuestion) => Promise<RemoveAction> {
    return (q) => {
        asked.push(q)
        return Promise.resolve(action)
    }
}

/** the mime data of a staff text (like an element dragged from the score) */
function staffTextMime(text: string): string {
    const score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'piano' }], measures: 1 })
    const t = Factory.createItem(ElementType.STAFF_TEXT, scoreDummy(score)) as unknown as TextBase
    t.setXmlText(text)
    return t.mimeData()
}

describe('palette tree xml', () => {
    it('writes and reads the default and master palette trees (PaletteTree::write/read)', () => {
        for (const tree of [PaletteCreator.newDefaultPaletteTree(), PaletteCreator.newMasterPaletteTree()]) {
            const xml = new XmlWriter()
            tree.write(xml, false)
            xml.flush()
            const text = xml.text()
            expect(text.startsWith('<PaletteBox version="4.70">')).toBe(true)
            const read = new PaletteTree()
            const e = new XmlReader(text)
            expect(e.readNextStartElement()).toBe(true)
            read.read(e, false)
            expect(read.palettes.map(p => [p.name(), p.type(), p.cellsCount(), p.mag(), p.isVisible()]))
                .toEqual(tree.palettes.map(p => [p.name(), p.type(), p.cellsCount(), p.mag(), p.isVisible()]))
            // the elements are the same (except properties the readers do not restore: C++ behaves the same for the
            // play technique of an annotation; the instrument of an instrument change, hammer-on segments; the
            // whitespace-only text nodes of the harp pedal text diagram, dropped by XmlReader::readXml)
            const known = new Set(['PlayTechAnnotation', 'InstrumentChange', 'HammerOnPullOff', 'HarpPedalDiagram'])
            const diff: string[] = []
            tree.palettes.forEach((p, i) => p.cells().forEach((c, j) => {
                const r = read.palettes[i].cells()[j]
                const a = (c.untranslatedElement ?? c.element)!
                const b = (r.untranslatedElement ?? r.element)!
                if (c.name !== r.name || c.mag !== r.mag || c.drawStaff !== r.drawStaff || c.xoffset !== r.xoffset
                    || c.yoffset !== r.yoffset || (!known.has(a.typeName()) && a.mimeData() !== b.mimeData())) {
                    diff.push(`${p.name()}: ${c.name}`)
                }
            }))
            expect(diff).toEqual([])
        }
    })
})

describe('user palettes', () => {
    beforeEach(() => {
        loadUserPalettes(null)
    })

    it('starts with the default palettes and notifies changes', () => {
        expect(userPalettes().map(p => p.type)).toEqual(PaletteCreator.newDefaultPaletteTree().palettes.map(p => PaletteType[p.type()]))
        let n = 0
        const off = onUserPalettesChanged(() => n++)
        setPaletteExpanded(palette('Clef').id, true)
        expect(palette('Clef').expanded).toBe(true)
        expect(n).toBe(1)
        // single palette: expanding one collapses the others
        setPaletteExpanded(palette('KeySig').id, true, true)
        expect(palette('Clef').expanded).toBe(false)
        off()
    })

    it('adds hidden palettes and palettes of the master palette ("Add palettes")', () => {
        const extra = extraPalettes()
        expect(extra.map(e => e.name)).toContain('Grace notes')
        const grace = extra.find(e => e.name === 'Grace notes')!
        const id = addExtraPalette(grace.key)!
        expect(userPalettes()[0].id).toBe(id)
        expect(userPalettes()[0].type).toBe('GraceNote')
        expect(userPalettes()[0].visible).toBe(true)
        expect(extraPalettes().map(e => e.name)).not.toContain('Grace notes')
    })

    it('creates a custom palette, adds an element of the score and keeps it in the stored xml', async () => {
        const id = createCustomPalette('My palette')!
        expect(userPalettes()[0]).toMatchObject({ id, type: 'Custom', name: 'My palette', custom: true, expanded: true, cells: [] })
        expect(insertPaletteCell(id, -1, { symbol: staffTextMime('allegretto') }, 'copy')).toBe(true)
        const cell = byId(id).cells[0]
        expect(cell).toMatchObject({ name: 'Staff text(s)', custom: true, visible: true, elementType: 'StaffText' })
        expect((paletteCellElement(cell.id) as unknown as TextBase).xmlText()).toBe('allegretto')
        expect(paletteCellMimeData(cell.id).symbol).toContain('allegretto')

        // a move of a cell of another palette's mime data
        const clef = palette('Clef').cells[1]
        expect(insertPaletteCell(id, 0, { cell: paletteCellMimeData(clef.id).cell }, 'move')).toBe(true)
        expect(byId(id).cells.map(c => c.elementType)).toEqual(['Clef', 'StaffText'])

        const xml = userPalettesXml()
        loadUserPalettes(xml)
        const p = userPalettes()[0]
        expect(p).toMatchObject({ type: 'Custom', name: 'My palette', custom: true, expanded: true })
        expect(p.cells.map(c => [c.elementType, c.custom])).toEqual([['Clef', false], ['StaffText', true]])
        expect((paletteCellElement(p.cells[1].id) as unknown as TextBase).xmlText()).toBe('allegretto')
        expect(userPalettes().length).toBe(PaletteCreator.newDefaultPaletteTree().palettes.length + 1)
        // a broken xml falls back to the default palettes
        expect(loadUserPalettes('<nonsense')).toBe(false)
        expect(userPalettes().length).toBe(PaletteCreator.newDefaultPaletteTree().palettes.length)
    })

    it('removes cells: default cells are deleted, custom cells hidden or deleted permanently', async () => {
        const clefs = palette('Clef')
        const asked: RemoveQuestion[] = []
        await removePaletteCells([clefs.cells[0].id], answer(RemoveAction.Hide, asked))
        expect(asked).toEqual([]) // no question for default cells
        expect(palette('Clef').cells.length).toBe(clefs.cells.length - 1)
        // the deleted cell is offered by "More" again and can be added back
        const more = morePaletteCells(clefs.id)
        expect(more.pool.map(c => c.name)).toContain(clefs.cells[0].name)
        expect(addCellsToPalette(clefs.id, [more.pool.find(c => c.name === clefs.cells[0].name)!.id])).toBe(1)
        expect(palette('Clef').cells.at(-1)!.name).toBe(clefs.cells[0].name)

        // custom cell: hide -> in "More" (custom); add back -> shown again; delete permanently
        expect(insertPaletteCell(clefs.id, -1, { symbol: staffTextMime('x') }, 'copy')).toBe(true)
        const custom = palette('Clef').cells.at(-1)!
        await removePaletteCells([custom.id], answer(RemoveAction.Hide, asked))
        expect(asked.map(q => q.buttons)).toEqual(['hideOrDelete'])
        expect(asked[0].question).toBe('Do you want to hide this custom palette cell or permanently delete it?')
        expect(palette('Clef').cells.find(c => c.id === custom.id)).toBeUndefined()
        expect(morePaletteCells(clefs.id).custom.map(c => c.id)).toEqual([custom.id])
        expect(addCellsToPalette(clefs.id, [custom.id])).toBe(1)
        expect(palette('Clef').cells.find(c => c.id === custom.id)?.visible).toBe(true)
        await removePaletteCells([custom.id], answer(RemoveAction.NoAction, asked)) // cancelled
        expect(palette('Clef').cells.find(c => c.id === custom.id)).toBeDefined()
        await removePaletteCells([custom.id], answer(RemoveAction.DeletePermanently, asked))
        expect(palette('Clef').cells.find(c => c.id === custom.id)).toBeUndefined()
        expect(morePaletteCells(clefs.id).custom).toEqual([])
    })

    it('moves cells and palettes', () => {
        const clefs = palette('Clef')
        expect(movePaletteCell(clefs.cells[0].id, 3)).toBe(true)
        expect(palette('Clef').cells.map(c => c.name).slice(0, 4))
            .toEqual([clefs.cells[1].name, clefs.cells[2].name, clefs.cells[3].name, clefs.cells[0].name])
        expect(movePalette(clefs.id, 2)).toBe(true)
        expect(userPalettes()[2].id).toBe(clefs.id)
    })

    it('hides palettes and deletes custom palettes', async () => {
        const clefs = palette('Clef')
        await removePalette(clefs.id, answer(RemoveAction.DeletePermanently))
        expect(palette('Clef').visible).toBe(false) // default palettes are only hidden
        expect(extraPalettes().map(e => e.name)).toContain('Clefs')

        const id = createCustomPalette('Temp')!
        const asked: RemoveQuestion[] = []
        await removePalette(id, answer(RemoveAction.Hide, asked))
        expect(asked[0].question).toBe('Do you want to hide this custom palette or permanently delete it?')
        expect(byId(id).visible).toBe(false)
        expect(extraPalettes().find(e => e.name === 'Temp')?.custom).toBe(true)
        // a hidden custom palette is hidden again without a question
        await removePalette(id, answer(RemoveAction.DeletePermanently))
        expect(byId(id)).toBeDefined()
        // shown again (at the top), then deleted permanently
        addExtraPalette(extraPalettes().find(e => e.name === 'Temp')!.key)
        expect(userPalettes()[0].id).toBe(id)
        await removePalette(id, answer(RemoveAction.DeletePermanently))
        expect(userPalettes().find(p => p.id === id)).toBeUndefined()
    })

    it('changes palette and cell properties; editing can be disabled', () => {
        const clefs = palette('Clef')
        const config = paletteProperties(clefs.id)!
        expect(config).toEqual({ name: 'Clefs', size: { width: 36, height: 55 }, scale: 0.8, elementOffset: 1, showGrid: true })
        setPaletteProperties(clefs.id, { ...config, name: 'My clefs', size: { width: 40, height: 60 }, scale: 1, showGrid: false })
        expect(palette('Clef')).toMatchObject({ name: 'My clefs', gridWidth: 40, gridHeight: 60, mag: 1, drawGrid: false })

        const cell = clefs.cells[0]
        const cc = paletteCellProperties(cell.id)!
        expect(cc).toEqual({ name: 'Treble clef', xOffset: 0, yOffset: 0, scale: 1, drawStaff: true })
        setPaletteCellProperties(cell.id, { ...cc, name: 'G', scale: 1.5, drawStaff: false, xOffset: 1 })
        expect(palette('Clef').cells[0]).toMatchObject({ name: 'G', mag: 1.5, drawStaff: false, xoffset: 1 })

        setPaletteEditable(clefs.id, false)
        expect(palette('Clef').editable).toBe(false)
        expect(canEditPaletteCell(cell.id)).toBe(false)
        expect(paletteProperties(clefs.id)).toBeNull()
        expect(insertPaletteCell(clefs.id, -1, { symbol: staffTextMime('y') }, 'copy')).toBe(false)
        setPaletteEditable(clefs.id, true)

        // reset: the default palette again, visibility and expanded state kept
        setPaletteExpanded(clefs.id, true)
        expect(RESET_PALETTE_QUESTION).toContain('restore this palette')
        resetPalette(clefs.id)
        const reset = palette('Clef')
        expect(reset).toMatchObject({ name: 'Clefs', gridWidth: 36, mag: 0.8, expanded: true, visible: true })
        expect(reset.cells.map(c => c.name)).toEqual(clefs.cells.map(c => c.name))
    })

    it('saves and loads palette files (.mpal)', () => {
        const id = createCustomPalette('Saved')!
        insertPaletteCell(id, -1, { symbol: staffTextMime('saved text') }, 'copy')
        const file = savePaletteFile(id)!
        expect(file.name).toBe('Saved')
        const loaded = loadPaletteFile(palette('Clef').id, file.data)!
        const p = byId(loaded)
        expect(p).toMatchObject({ name: 'Saved', type: 'Custom' })
        expect(p.cells.map(c => c.elementType)).toEqual(['StaffText'])
        expect(userPalettes().findIndex(x => x.id === loaded)).toBe(userPalettes().findIndex(x => x.type === 'Clef') - 1)
        expect(loadPaletteFile(null, new Uint8Array([1, 2, 3]))).toBeNull()
    })
})

