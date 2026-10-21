/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettecell.h/.cpp
 *
 * TODO(port): accessibility interface; PaletteCompat::migrateOldPaletteCellIfNeeded (cells of old palette files), the
 * <Tremolo> cells of old palette files (TremoloCompat)
 */

import { arg, qtrc } from '../framework/global/translation'
import { ElementType } from '../engraving/types/types'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { TextBase } from '../engraving/dom/textbase'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'
import { Factory } from '../engraving/dom/factory'
import { scoreDummy } from '../engraving/compat/dummyelement'
import { gpaletteScore } from '../engraving/dom/palettescore'
import { readMimeData } from '../engraving/dom/paste'
import type { FretDiagram } from '../engraving/dom/fret'
import { RWRegister } from '../engraving/rw/rwregister'
import { XmlReader } from '../engraving/rw/xmlreader'
import { XmlWriter } from '../engraving/rw/xmlwriter'
import { Fraction } from '../engraving/types/fraction'
import { PointF } from '../framework/draw/types/geometry'
import { RealIsEqual } from '../framework/global/realfn'

function needsStaff(e: EngravingItem | null): boolean {
    if (!e) {
        return false
    }
    switch (e.type()) {
    case ElementType.CHORD:
    case ElementType.BAR_LINE:
    case ElementType.CLEF:
    case ElementType.KEYSIG:
    case ElementType.TIMESIG:
    case ElementType.REST:
    case ElementType.BAGPIPE_EMBELLISHMENT:
        return true
    default:
        return false
    }
}

let s_id = 0

export class PaletteCell {
    element: EngravingItem | null
    /** the element before setElementTranslated (its texts are the source strings) */
    untranslatedElement: EngravingItem | null = null
    id: string
    /** the untranslated name; translated with translationContext() */
    name: string
    tag: string

    drawStaff = false
    xoffset = 0.0
    yoffset = 0.0 // in spatium units of "gpaletteScore"
    mag = 1.0
    readOnly = false

    visible = true
    custom = false
    active = false
    focused = false

    /** the language the element's texts were translated to (retranslate) */
    private m_translatedFor: string | null = null

    constructor(e: EngravingItem | null = null, name = '', mag = 1.0, offset: { x: number; y: number } = { x: 0, y: 0 }, tag = '') {
        this.id = PaletteCell.makeId()
        this.element = e
        this.name = name
        this.mag = mag
        this.xoffset = offset.x
        this.yoffset = offset.y
        this.tag = tag
        this.drawStaff = needsStaff(e)
    }

    /** C++ PaletteCell::mimeDataFormat */
    static readonly mimeDataFormat = 'application/musescore/palette/cell'

    static makeId(): string {
        return String(++s_id)
    }

    translationContext(): string {
        // Keep in sync with PaletteCreator and all element types
        const type = this.element ? this.element.type() : ElementType.INVALID
        switch (type) {
        case ElementType.ACTION_ICON:
            return 'action'
        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET:
        case ElementType.CHORDLINE:
        case ElementType.GLISSANDO:
        case ElementType.HARMONY:
        case ElementType.JUMP:
        case ElementType.KEYSIG:
        case ElementType.MARKER:
            return 'engraving'
        case ElementType.BAGPIPE_EMBELLISHMENT:
            return 'engraving/bagpipeembellishment'
        case ElementType.CLEF:
            return 'engraving/cleftype'
        case ElementType.DYNAMIC:
            return 'engraving/dynamictype'
        case ElementType.HAIRPIN:
            return 'engraving/hairpintype'
        case ElementType.LAYOUT_BREAK:
            return 'engraving/layoutbreaktype'
        case ElementType.NOTEHEAD:
            return 'engraving/noteheadgroup'
        case ElementType.OTTAVA:
            return 'engraving/ottavatype'
        case ElementType.SPACER:
            return 'engraving/spacertype'
        case ElementType.ACCIDENTAL:
        case ElementType.ARTICULATION:
        case ElementType.BAR_LINE:
        case ElementType.BREATH:
        case ElementType.FERMATA:
        case ElementType.MEASURE_REPEAT:
        case ElementType.ORNAMENT:
        case ElementType.SYMBOL:
            return 'engraving/sym'
        case ElementType.PLAYTECH_ANNOTATION:
            return 'engraving/playtechtype'
        case ElementType.TIMESIG:
            return 'engraving/timesig'
        case ElementType.TREMOLO_SINGLECHORD:
        case ElementType.TREMOLO_TWOCHORD:
            return 'engraving/tremolotype'
        case ElementType.TRILL:
            return 'engraving/trilltype'
        case ElementType.TRIPLET_FEEL:
            return 'engraving/tripletfeel'
        case ElementType.VIBRATO:
            return 'engraving/vibratotype'
        default:
            break
        }
        return 'palette'
    }

    translatedName(): string {
        const trName = qtrc(this.translationContext(), this.name)
        if (this.element && this.element.isTextBase() && this.name.includes('%1')) {
            return arg(trName, (this.element as TextBase).plainText())
        }
        return trName
    }

    /** Retranslates cell content, e.g. text if the element is TextBase (relayout if the text changed) */
    retranslate(): void {
        if (this.untranslatedElement && this.element && this.element.isTextBase()) {
            const target = this.element as TextBase
            const orig = this.untranslatedElement as TextBase
            const text = qtrc('palette', orig.xmlText())
            if (text !== this.m_translatedFor) {
                this.m_translatedFor = text
                target.setXmlText(text)
                SingleLayout.layoutItem(target)
            }
        }
    }

    setElementTranslated(translate: boolean): void {
        if (translate && this.element) {
            this.untranslatedElement = this.element
            this.element = this.untranslatedElement.clone()
            this.retranslate()
        } else {
            this.untranslatedElement = null
        }
    }

    read(e: XmlReader, _pasteMode: boolean): boolean {
        let add = true
        this.name = e.attribute('name')

        // using attributes instead of nested tags for
        // pre-3.3 version compatibility
        this.custom = e.hasAttribute('custom') ? e.intAttribute('custom') !== 0 : false // TODO: actually check master palette?
        this.visible = e.hasAttribute('visible') ? e.intAttribute('visible') !== 0 : true

        const translateElement = e.hasAttribute('trElement') ? e.intAttribute('trElement') !== 0 : false

        while (e.readNextStartElement()) {
            const s = e.name()
            if (s === 'staff') {
                this.drawStaff = e.readInt() !== 0
            } else if (s === 'xoffset') {
                this.xoffset = e.readDouble()
            } else if (s === 'yoffset') {
                this.yoffset = e.readDouble()
            } else if (s === 'mag') {
                this.mag = e.readDouble()
            } else if (s === 'tag') {
                this.tag = e.readText()
            } else if (s === 'custom') {
                // added on palettes rework
                // TODO: remove or leave to switch from using attributes later?
                this.custom = e.readInt() !== 0
            } else if (s === 'visible') {
                this.visible = e.readInt() !== 0
            } else if (s === 'Tremolo') {
                // TODO(port): TremoloCompat (the tremolo cells of old palette files)
                e.skipCurrentElement()
            } else {
                this.element = Factory.createItemByName(s, scoreDummy(gpaletteScore()))
                if (!this.element) {
                    e.unknown()
                } else {
                    RWRegister.reader().readItem(this.element, e)
                }
            }
        }

        this.setElementTranslated(translateElement)

        if (this.element) {
            // TODO(port): PaletteCompat::migrateOldPaletteCellIfNeeded
            this.element.styleChanged()
            // C++ resolves the icon of an ActionIcon from the registered actions and drops cells of unknown actions;
            // here the app resolves the icons (see palette/api.ts)
            add = true
        }

        return add && !!this.element
    }

    write(xml: XmlWriter, _pasteMode: boolean): void {
        if (!this.element) {
            xml.tag('Cell')
            return
        }

        // using attributes for `custom` and `visible` properties instead of nested tags
        // for pre-3.3 version compatibility
        const cellAttrs: [string, string][] = []
        if (this.name.length) {
            cellAttrs.push(['name', this.name])
        }
        if (this.custom) {
            cellAttrs.push(['custom', '1'])
        }
        if (!this.visible) {
            cellAttrs.push(['visible', '0'])
        }

        if (this.untranslatedElement) {
            cellAttrs.push(['trElement', '1'])
        }

        xml.startElement('Cell', cellAttrs)

        if (this.drawStaff) {
            xml.tag('staff', this.drawStaff)
        }
        if (this.xoffset) {
            xml.tag('xoffset', this.xoffset)
        }
        if (this.yoffset) {
            xml.tag('yoffset', this.yoffset)
        }
        if (this.tag.length) {
            xml.tag('tag', this.tag)
        }
        if (!RealIsEqual(this.mag, 1.0)) {
            xml.tag('mag', this.mag)
        }

        RWRegister.writer().writeItem(this.untranslatedElement ?? this.element, xml)
        xml.endElement()
    }

    /** C++ toMimeData (mimedatautils.h): the cell written in paste mode */
    toMimeData(): string {
        const xml = new XmlWriter()
        this.write(xml, true)
        xml.flush()
        return xml.text()
    }

    static fromMimeData(data: string): PaletteCell | null {
        const e = new XmlReader(data)
        while (e.readNextStartElement()) {
            if (e.name() === 'Cell') {
                const cell = new PaletteCell()
                if (!cell.read(e, true)) {
                    return null
                }
                return cell
            }
            return null
        }
        return null
    }

    /** a new cell of an element's mime data (an element dragged from the score onto a palette) */
    static fromElementMimeData(data: string): PaletteCell | null {
        const dragOffset = { v: new PointF() }
        const duration = { v: new Fraction(1, 4) }
        const element = readMimeData(gpaletteScore(), data, dragOffset, duration)

        if (!element) {
            return null
        }

        if (!element.isSymbol()) { // not sure this check is necessary, it was so in the old palette
            element.setTrack(0)
        }

        // C++ resolves the icon of an ActionIcon from the registered actions (here: the app, see palette/api.ts)

        element.styleChanged()
        const name = element.isFretDiagram() ? (element as unknown as FretDiagram).harmonyPlainText() : element.translatedTypeUserName()

        return new PaletteCell(element, name)
    }
}
