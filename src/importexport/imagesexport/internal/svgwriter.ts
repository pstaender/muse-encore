/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/imagesexport/internal/svgwriter.cpp: one page of a score as SVG (PER_PAGE), painted like
 * printing. The SVG is the one of SvgPaintProvider (glyph outlines defined once, a group with the class of every
 * element), not the one of MuseScore's SvgGenerator.
 * TODO(port): the staff lines of a system concatenated into one item, the beat colors (BEATS_COLORS) and the
 * trimming (trimMarginPixelSize, command line only).
 */

import { Painter } from '../../../framework/draw/painter'
import { SvgGlyphDefs, SvgPaintProvider } from '../../../framework/draw/svgpaintprovider'
import { fontProvider } from '../../../engraving/infrastructure/engravingcontext'
import { Paint } from '../../../engraving/rendering/score/paint'
import { DPI } from '../../../engraving/types/types'
import { AbstractNotationWriter, UnitType, type ExportNotation, type NotationWriterOptions } from '../../../project/inotationwriter'
import type { ImagesExportConfiguration } from './imagesexportconfiguration'

export class SvgWriter extends AbstractNotationWriter {
    constructor(private m_configuration: ImagesExportConfiguration) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PAGE]
    }

    async write(notation: ExportNotation, options: NotationWriterOptions = {}): Promise<Uint8Array> {
        const score = notation.score
        const pages = score.pages()
        const pageNumber = options.pageNumber ?? 0
        if (pageNumber >= pages.length) {
            throw new Error(`no page ${pageNumber + 1}`)
        }
        const page = pages[pageNumber]
        const transparent = options.transparentBackground ?? this.m_configuration.exportSvgWithTransparentBackground
        const provider = new SvgPaintProvider(new SvgGlyphDefs(), '', { clipWithMask: this.m_configuration.exportSvgWithIllustratorCompat })
        const painter = new Painter(provider, fontProvider(), 'svgwriter')
        Paint.paintScore(painter, score, { fromPage: pageNumber, toPage: pageNumber, isPrinting: true, printPageBackground: !transparent })
        const pageRect = page.ldata().bbox()
        // C++ printer.setTitle: the score's name, with the page number if there are several pages
        const title = notation.name()
        const svg = provider.svg(`${pageRect.width() / DPI}in`, `${pageRect.height() / DPI}in`, pageRect, true,
            pages.length > 1 ? `${title} (${pageNumber + 1})` : title)
        return new TextEncoder().encode(svg)
    }
}
