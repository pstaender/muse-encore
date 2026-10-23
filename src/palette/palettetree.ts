/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettetree.h/.cpp
 */

import { Constants } from '../engraving/types/constants'
import type { XmlReader } from '../engraving/rw/xmlreader'
import type { XmlWriter } from '../engraving/rw/xmlwriter'
import { Palette } from './palette'

export class PaletteTree {
    palettes: Palette[] = []

    insert(idx: number, palette: Palette): void {
        this.palettes.splice(idx, 0, palette)
    }

    append(palette: Palette): void {
        this.palettes.push(palette)
    }

    read(e: XmlReader, pasteMode: boolean): boolean {
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'Palette') {
                const p = new Palette()
                p.read(e, pasteMode)
                this.palettes.push(p)
            } else {
                e.unknown()
            }
        }

        return true
    }

    write(xml: XmlWriter, pasteMode: boolean): void {
        xml.startElement('PaletteBox', [['version', Constants.MSC_VERSION_STR]]) // for compatibility with old palettes file format

        for (const palette of this.palettes) {
            palette.write(xml, pasteMode)
        }

        xml.endElement()
    }

    retranslate(): void {
        for (const palette of this.palettes) {
            palette.retranslate()
        }
    }
}
