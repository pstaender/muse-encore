/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palette.h/.cpp
 *
 * TODO(port): PaletteCompat::removeOldItemsIfNeeded / addNewItemsIfNeeded (palettes of older MuseScore versions)
 */

import { qtrc } from '../framework/global/translation'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import { ActionIcon, type ActionIconType } from '../engraving/dom/actionicon'
import { BracketType, ElementType } from '../engraving/types/types'
import type { Bracket } from '../engraving/dom/bracket'
import { scoreDummy } from '../engraving/compat/dummyelement'
import { gpaletteScore } from '../engraving/dom/palettescore'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'
import { PaletteCell } from './palettecell'
import type { Articulation } from '../engraving/dom/articulation'
import { XmlReader } from '../engraving/rw/xmlreader'
import { XmlWriter } from '../engraving/rw/xmlwriter'
import { RealIsNull } from '../framework/global/realfn'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { Constants } from '../engraving/types/constants'

export enum PaletteType {
    Unknown = 0,
    Clef,
    KeySig,
    TimeSig,
    Bracket,
    Accidental,
    Articulation,
    Ornament,
    Breath,
    GraceNote,
    NoteHead,
    Line,
    BarLine,
    Arpeggio,
    Tremolo,
    Text,
    Tempo,
    Dynamic,
    Fingering,
    Repeat,
    FretboardDiagram,
    Accordion,
    BagpipeEmbellishment,
    Layout,
    Beam,
    Guitar,
    Keyboard,
    Pitch,
    Harp,
    StringTunings,
    Playback,
    Handbells,
    Custom,
}

let s_paletteId = 0

/** Helper function to compare two Elements */
function isEquivalent(e1: EngravingItem, e2: EngravingItem): boolean {
    return e1.type() === e2.type()
        && e1.subtype() === e2.subtype()
        && e1.mimeData() === e2.mimeData()
}

export class Palette {
    private m_id: string
    private m_type: PaletteType
    private m_name = ''
    private m_cells: PaletteCell[] = []

    private m_yOffset = 0.0 // in spatium units of "gscore"
    private m_mag = 1.0
    private m_gridSize = { width: 64, height: 64 }
    private m_drawGrid = false

    private m_isVisible = true
    private m_isEditable = true
    private m_isExpanded = false

    /** C++ Palette::mimeDataFormat */
    static readonly mimeDataFormat = 'application/musescore/palette'

    constructor(t: PaletteType = PaletteType.Custom) {
        this.m_type = t
        this.m_id = 'palette' + String(++s_paletteId)
    }

    id(): string { return this.m_id }

    name(): string { return this.m_name }
    setName(str: string): void { this.m_name = str }
    translatedName(): string { return qtrc('palette', this.m_name) }

    retranslate(): void {
        for (const cell of this.m_cells) {
            cell.retranslate()
        }
    }

    type(): PaletteType { return this.m_type }
    setType(t: PaletteType): void { this.m_type = t }
    isCustom(): boolean { return this.m_type === PaletteType.Custom }

    /**
     * Returns palette type if it is defined or deduces it from the palette content for
     * custom palettes.
     */
    contentType(): PaletteType {
        let t = this.type()
        if (t === PaletteType.Unknown || t === PaletteType.Custom) {
            t = this.guessType()
        }

        if (t === PaletteType.Unknown || t === PaletteType.Custom) {
            return PaletteType.Clef // if no type can be deduced, use Clef type by default
        }
        return t
    }

    cells(): readonly PaletteCell[] { return this.m_cells }
    cellAt(idx: number): PaletteCell | null { return this.m_cells[idx] ?? null }
    cellsCount(): number { return this.m_cells.length }

    yOffset(): number { return this.m_yOffset }
    setYOffset(val: number): void { this.m_yOffset = val }
    mag(): number { return this.m_mag }
    setMag(val: number): void { this.m_mag = val }
    drawGrid(): boolean { return this.m_drawGrid }
    setDrawGrid(val: boolean): void { this.m_drawGrid = val }
    gridSize(): { width: number; height: number } { return this.m_gridSize }
    setGridSize(w: number, h: number): void { this.m_gridSize = { width: w, height: h } }
    isVisible(): boolean { return this.m_isVisible }
    setVisible(val: boolean): void { this.m_isVisible = val }
    isEditable(): boolean { return this.m_isEditable }
    setEditable(val: boolean): void { this.m_isEditable = val }
    isExpanded(): boolean { return this.m_isExpanded }
    setExpanded(val: boolean): void { this.m_isExpanded = val }

    insertElement(idx: number, element: EngravingItem | null, name: string, mag = 1.0, offset = { x: 0, y: 0 }, tag = ''): PaletteCell {
        if (element) {
            // layout may be important for comparing cells, e.g. filtering "More" popup content
            SingleLayout.layoutItem(element)
        }
        const cell = new PaletteCell(element, name, mag, offset, tag)
        this.cellHandlerByPaletteType(this.m_type)?.(cell)
        this.m_cells.splice(idx, 0, cell)
        return cell
    }

    appendElement(element: EngravingItem | null, name: string, mag = 1.0, offset = { x: 0, y: 0 }, tag = ''): PaletteCell {
        return this.insertElement(this.m_cells.length, element, name, mag, offset, tag)
    }

    /**
     * C++ appendActionIcon: the name is the action's description (or title); here the app resolves it (and the
     * icon) from the action code, so the cell's name stays empty (see palette/api.ts).
     */
    appendActionIcon(type: ActionIconType, code: string, mag = 1.0): PaletteCell {
        const icon = new ActionIcon(scoreDummy(gpaletteScore()))
        icon.setActionType(type)
        icon.setAction(code, 0)
        return this.appendElement(icon, '', mag)
    }

    insertCell(idx: number, cell: PaletteCell): boolean {
        return this.insertCells(idx, [cell])
    }

    insertCells(idx: number, cells: PaletteCell[]): boolean {
        if (idx > this.m_cells.length) {
            return false
        }
        this.m_cells.splice(idx, 0, ...cells)
        return true
    }

    removeCell(cell: PaletteCell): boolean {
        return this.removeCells([cell])
    }

    removeCells(cells: PaletteCell[]): boolean {
        this.m_cells = this.m_cells.filter(c => !cells.includes(c))
        return true
    }

    takeCells(idx: number, count: number): PaletteCell[] {
        if (idx + count > this.m_cells.length) {
            return []
        }
        return this.m_cells.splice(idx, count)
    }

    /** C++ indexOfCell: the equivalent cell (same element type/subtype, name, offsets, mag ...); -1 if none */
    indexOfCell(cell: PaletteCell, matchName = true): number {
        const el = cell.element
        if (!el) {
            return -1
        }
        for (let i = 0; i < this.m_cells.length; ++i) {
            const localCell = this.m_cells[i]
            if (matchName && localCell.name !== cell.name) {
                continue
            }
            const exElement = localCell.element
            if (exElement && !isEquivalent(exElement, el)) {
                continue
            }
            if (localCell.drawStaff !== cell.drawStaff
                || localCell.xoffset !== cell.xoffset
                || localCell.yoffset !== cell.yoffset
                || localCell.mag !== cell.mag
                || localCell.readOnly !== cell.readOnly
                || localCell.visible !== cell.visible
                || localCell.custom !== cell.custom) {
                continue
            }
            return i
        }
        return -1
    }

    read(e: XmlReader, pasteMode: boolean): boolean {
        this.m_name = e.attribute('name')
        this.m_type = PaletteType.Unknown
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'gridWidth') {
                this.m_gridSize.width = e.readDouble()
            } else if (tag === 'gridHeight') {
                this.m_gridSize.height = e.readDouble()
            } else if (tag === 'mag') {
                this.m_mag = e.readDouble()
            } else if (tag === 'grid') {
                this.m_drawGrid = e.readInt() !== 0
            } else if (tag === 'yoffset') {
                this.m_yOffset = e.readDouble()
            } else if (tag === 'drumPalette') { // obsolete
                e.skipCurrentElement()
            } else if (tag === 'type') {
                // C++ QMetaEnum::keyToValue
                const t = (PaletteType as unknown as Record<string, number | undefined>)[e.readText()]
                if (typeof t === 'number') {
                    this.m_type = t
                }
            } else if (tag === 'visible') {
                this.m_isVisible = e.readInt() !== 0
            } else if (pasteMode && tag === 'expanded') {
                this.m_isExpanded = e.readInt() !== 0
            } else if (tag === 'editable') {
                this.m_isEditable = e.readInt() !== 0
            } else if (tag === 'Cell') {
                const cell = new PaletteCell()
                if (!cell.read(e, pasteMode)) {
                    continue
                }

                this.cellHandlerByPaletteType(this.m_type)?.(cell)

                this.m_cells.push(cell)
            } else {
                e.unknown()
            }
        }
        // (from old palette): make sure hgrid and vgrid are not 0, we divide by them later
        if (this.m_gridSize.width <= 0) {
            this.m_gridSize.width = 28
        }
        if (this.m_gridSize.height <= 0) {
            this.m_gridSize.height = 28
        }

        if (this.m_type === PaletteType.Unknown) {
            this.m_type = this.guessType()
        }

        // TODO(port): PaletteCompat::removeOldItemsIfNeeded, addNewItemsIfNeeded

        return true
    }

    /** C++ toMimeData (mimedatautils.h): the palette written in paste mode */
    toMimeData(): string {
        const xml = new XmlWriter()
        this.write(xml, true)
        xml.flush()
        return xml.text()
    }

    write(xml: XmlWriter, pasteMode: boolean): void {
        xml.startElement('Palette', [['name', this.m_name]])
        xml.tag('type', PaletteType[this.m_type])
        xml.tag('gridWidth', this.m_gridSize.width)
        xml.tag('gridHeight', this.m_gridSize.height)
        xml.tag('mag', this.m_mag)
        if (this.m_drawGrid) {
            xml.tag('grid', this.m_drawGrid)
        }

        if (!RealIsNull(this.m_yOffset)) {
            xml.tag('yoffset', this.m_yOffset)
        }

        xml.tag('visible', this.m_isVisible, true)
        xml.tag('editable', this.m_isEditable, true)

        if (pasteMode) {
            xml.tag('expanded', this.m_isExpanded, false)
        }

        for (const cell of this.m_cells) {
            cell.write(xml, pasteMode)
        }
        xml.endElement()
    }

    static fromMimeData(data: string): Palette | null {
        const e = new XmlReader(data)
        while (e.readNextStartElement()) {
            if (e.name() === 'Palette') {
                const p = new Palette()
                if (!p.read(e, true)) {
                    return null
                }
                return p
            }
            return null
        }
        return null
    }

    /**
     * C++ readFromFile: the palette of an .mpal file (a zip with META-INF/container.xml and the palette.xml it names).
     * TODO(port): images (Pictures/, ImageStore; Image is not ported)
     */
    readFromData(data: Uint8Array): boolean {
        let files: Record<string, Uint8Array>
        try {
            files = unzipSync(data)
        } catch {
            return false
        }
        const container = files['META-INF/container.xml']
        if (!container) {
            return false
        }
        this.m_cells = []

        let e = new XmlReader(strFromU8(container))
        // extract first rootfile
        let rootfile = ''
        while (e.readNextStartElement()) {
            if (e.name() !== 'container') {
                e.unknown()
                break
            }
            while (e.readNextStartElement()) {
                if (e.name() !== 'rootfiles') {
                    e.unknown()
                    break
                }
                while (e.readNextStartElement()) {
                    const tag = e.name()

                    if (tag === 'rootfile') {
                        if (!rootfile.length) {
                            rootfile = e.attribute('full-path')
                        }
                        e.skipCurrentElement()
                    } else if (tag === 'file') {
                        e.skipCurrentElement() // TODO(port): images
                    } else {
                        e.unknown()
                    }
                }
            }
        }

        if (!rootfile.length || !files[rootfile]) {
            return false
        }

        e = new XmlReader(strFromU8(files[rootfile]))
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                // TODO(port): gpaletteScore->setMscVersion (PaletteCompat of older palettes)
                while (e.readNextStartElement()) {
                    if (e.name() === 'Palette') {
                        this.read(e, false)
                    } else {
                        e.unknown()
                    }
                }
            } else {
                e.unknown()
            }
        }
        return true
    }

    /** C++ writeToFile: the palette as .mpal file. TODO(port): images (Image is not ported) */
    writeToData(): Uint8Array {
        const xml = new XmlWriter()
        xml.startDocument()
        xml.startElement('container')
        xml.startElement('rootfiles')
        xml.startElement('rootfile', [['full-path', 'palette.xml']])
        xml.endElement()
        xml.endElement()
        xml.endElement()
        xml.flush()

        const xml1 = new XmlWriter()
        xml1.startDocument()
        xml1.startElement('museScore', [['version', Constants.MSC_VERSION_STR]])
        this.write(xml1, false)
        xml1.endElement()
        xml1.flush()

        return zipSync({
            'META-INF/container.xml': strToU8(xml.text()),
            'palette.xml': strToU8(xml1.text()),
        }, { level: 6 })
    }

    guessType(): PaletteType {
        if (!this.m_cells.length) {
            return PaletteType.Custom
        }

        const e = this.m_cells.find(c => c.element)?.element ?? null
        if (!e) {
            return PaletteType.Custom
        }

        switch (e.type()) {
        case ElementType.CLEF:
            return PaletteType.Clef
        case ElementType.KEYSIG:
            return PaletteType.KeySig
        case ElementType.TIMESIG:
            return PaletteType.TimeSig
        case ElementType.BRACKET:
        case ElementType.BRACKET_ITEM:
            return PaletteType.Bracket
        case ElementType.ACCIDENTAL:
            return PaletteType.Accidental
        case ElementType.ARTICULATION:
        case ElementType.BEND:
            return (e as unknown as Articulation).isOrnament() ? PaletteType.Ornament : PaletteType.Articulation
        case ElementType.FERMATA:
            return PaletteType.Articulation
        case ElementType.BREATH:
            return PaletteType.Breath
        case ElementType.NOTEHEAD:
            return PaletteType.NoteHead
        case ElementType.BAR_LINE:
            return PaletteType.BarLine
        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET:
        case ElementType.GLISSANDO:
            return PaletteType.Arpeggio
        case ElementType.TREMOLO_SINGLECHORD:
        case ElementType.TREMOLO_TWOCHORD:
            return PaletteType.Tremolo
        case ElementType.TEMPO_TEXT:
            return PaletteType.Tempo
        case ElementType.DYNAMIC:
            return PaletteType.Dynamic
        case ElementType.FINGERING:
            return PaletteType.Fingering
        case ElementType.MARKER:
        case ElementType.JUMP:
        case ElementType.MEASURE_REPEAT:
            return PaletteType.Repeat
        case ElementType.FRET_DIAGRAM:
            return PaletteType.FretboardDiagram
        case ElementType.BAGPIPE_EMBELLISHMENT:
            return PaletteType.BagpipeEmbellishment
        case ElementType.LAYOUT_BREAK:
        case ElementType.SPACER:
            return PaletteType.Layout
        case ElementType.SYMBOL:
            return PaletteType.Accordion
        case ElementType.HARP_DIAGRAM:
            return PaletteType.Harp
        case ElementType.STRING_TUNINGS:
            return PaletteType.StringTunings
        case ElementType.ACTION_ICON: {
            const actionCode = (e as ActionIcon).actionCode()

            if (actionCode.includes('beam')) {
                return PaletteType.Beam
            }
            if (actionCode.includes('grace') || actionCode.includes('acciaccatura') || actionCode.includes('appoggiatura')) {
                return PaletteType.GraceNote
            }
            if (actionCode.includes('frame') || actionCode.includes('box') || actionCode.includes('measure')) {
                return PaletteType.Layout
            }
            return PaletteType.Custom
        }
        default: {
            if (e.isSpanner()) {
                return PaletteType.Line
            }
            if (e.isTextBase()) {
                return PaletteType.Text
            }
        }
        }

        return PaletteType.Custom
    }

    private cellHandlerByPaletteType(type: PaletteType): ((cell: PaletteCell) => void) | null {
        switch (type) {
        case PaletteType.Bracket:
            return (cell) => {
                if (!cell.element || !cell.element.isBracket()) {
                    return
                }
                const bracket = cell.element as Bracket
                if (bracket.bracketType() === BracketType.BRACE) {
                    bracket.setStaffSpan(0, 1)
                    cell.mag = 1.2
                }
            }
        default:
            return null
        }
    }
}
