/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/imagesexport/internal/pdfwriter.cpp: the pages of a score (PER_PART) or of several scores
 * (MULTI_PART, each one starting on a new page with its page size) as vector PDF (PdfDocument instead of QPdfWriter;
 * NotationPainting::paintPdf paints the pages like printing).
 * Deviation: the resolution only matters to QPdfWriter's rasterization; the PDF here is all vector graphics.
 */

import { Painter } from '../../../framework/draw/painter'
import { PdfDocument } from '../../../framework/draw/pdfdocument'
import { PdfPaintProvider } from '../../../framework/draw/pdfpaintprovider'
import { fontProvider } from '../../../engraving/infrastructure/engravingcontext'
import { Paint } from '../../../engraving/rendering/score/paint'
import { DPI } from '../../../engraving/types/types'
import { AbstractNotationWriter, UnitType, type ExportNotation, type NotationWriterOptions } from '../../../project/inotationwriter'
import type { ImagesExportConfiguration } from './imagesexportconfiguration'

/** the creator of the PDF (C++: "MuseScore Studio Version: " + the version) */
const PDF_CREATOR = 'MuseEncore (port of MuseScore Studio 4.7.5)'

export class PdfWriter extends AbstractNotationWriter {
    constructor(private m_configuration: ImagesExportConfiguration) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART, UnitType.MULTI_PART]
    }

    async write(notation: ExportNotation, options: NotationWriterOptions = {}): Promise<Uint8Array> {
        const doc = this.preparePdfWriter(notation.projectWorkTitleAndPartName())
        const provider = new PdfPaintProvider(doc, { grayscale: this.m_configuration.exportPdfWithGrayscale })
        const page = options.pageNumber
        this.paintPdf(provider, notation, page ?? -1, page ?? -1, options)
        return doc.data()
    }

    override async writeList(notations: readonly ExportNotation[], options: NotationWriterOptions = {}): Promise<Uint8Array> {
        if (!notations.length) {
            throw new Error('no scores')
        }
        const doc = this.preparePdfWriter(notations[0].projectWorkTitle())
        const provider = new PdfPaintProvider(doc, { grayscale: this.m_configuration.exportPdfWithGrayscale })
        for (const notation of notations) {
            this.paintPdf(provider, notation, -1, -1, options)
        }
        return doc.data()
    }

    private preparePdfWriter(title: string): PdfDocument {
        return new PdfDocument({ title, creator: PDF_CREATOR, producer: PDF_CREATOR })
    }

    /** NotationPainting::paintPdf: every page on a page of the PDF (onNewPage) */
    private paintPdf(provider: PdfPaintProvider, notation: ExportNotation, fromPage: number, toPage: number,
                     options: NotationWriterOptions): void {
        const score = notation.score
        const pages = score.pages()
        if (!pages.length) {
            return
        }
        const transparent = options.transparentBackground ?? this.m_configuration.exportPdfWithTransparentBackground
        let pageIdx = fromPage >= 0 ? fromPage : 0
        const beginPage = (): void => {
            const r = pages[pageIdx].ldata().bbox()
            provider.beginPage(r.width() / DPI, r.height() / DPI, r, DPI)
        }
        const painter = new Painter(provider, fontProvider(), 'pdfwriter')
        beginPage()
        Paint.paintScore(painter, score, {
            fromPage,
            toPage,
            isPrinting: true,
            printPageBackground: !transparent,
            onNewPage: () => {
                provider.endPage()
                ++pageIdx
                beginPage()
            },
        })
        provider.endPage()
    }
}
