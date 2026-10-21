/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettecell.h/.cpp
 *
 * TODO(port): reading/writing (palette files, mime data), accessibility interface
 */

import { arg, qtrc } from '../framework/global/translation'
import { ElementType } from '../engraving/types/types'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { TextBase } from '../engraving/dom/textbase'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'

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
}
