/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/imagesexport/internal/pngwriter.cpp: one page of a score as PNG (PER_PAGE) at the export
 * resolution, on white or transparent, optionally in grayscale (qGray, keeping the alpha channel).
 * Deviation: the page is drawn in strips of rows on a canvas (the bitmap of a page at 1200 DPI is larger than the
 * browsers' canvas limits) and encoded with PngEncoder; the images of the score are decoded before.
 */

import { CanvasPaintProvider, type Canvas2D } from '../../../framework/draw/canvaspaintprovider'
import { imageCache } from '../../../framework/draw/imagecache'
import { Painter } from '../../../framework/draw/painter'
import { qGray } from '../../../framework/draw/pdfdocument'
import { RectF } from '../../../framework/draw/types/geometry'
import { Transform } from '../../../framework/draw/types/transform'
import { fontProvider } from '../../../engraving/infrastructure/engravingcontext'
import { Paint } from '../../../engraving/rendering/score/paint'
import { DPI } from '../../../engraving/types/types'
import { AbstractNotationWriter, UnitType, type ExportNotation, type NotationWriterOptions } from '../../../project/inotationwriter'
import type { ImagesExportConfiguration } from './imagesexportconfiguration'
import { PngEncoder } from './pngencoder'

/** a canvas of the given size whose 2D context can be drawn on and read back */
export interface ExportCanvas {
    getContext(type: '2d'): (Canvas2D & {
        clearRect(x: number, y: number, w: number, h: number): void
        fillRect(x: number, y: number, w: number, h: number): void
        getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray | Uint8Array }
    }) | null
}

export type CanvasFactory = (width: number, height: number) => ExportCanvas

let s_canvasFactory: CanvasFactory | null = null

/** the canvases of the PNG export outside of browsers (node: @napi-rs/canvas' createCanvas) */
export function setExportCanvasFactory(factory: CanvasFactory | null): void {
    s_canvasFactory = factory
}

function createCanvas(width: number, height: number): ExportCanvas {
    if (s_canvasFactory) {
        return s_canvasFactory(width, height)
    }
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height) as unknown as ExportCanvas
    }
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c as unknown as ExportCanvas
}

/** the largest strip drawn at once (pixels) */
const MAX_STRIP_PIXELS = 4 * 1024 * 1024

export class PngWriter extends AbstractNotationWriter {
    constructor(private m_configuration: ImagesExportConfiguration) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PAGE]
    }

    async write(notation: ExportNotation, options: NotationWriterOptions = {}): Promise<Uint8Array> {
        const score = notation.score
        const pageNumber = options.pageNumber ?? 0
        const page = score.pages()[pageNumber]
        if (!page) {
            throw new Error(`no page ${pageNumber + 1}`)
        }
        const canvasDpi = this.m_configuration.exportPngDpiResolution
        const transparent = options.transparentBackground ?? this.m_configuration.exportPngWithTransparentBackground
        const grayscale = this.m_configuration.exportPngWithGrayscale
        // TODO(port): trimMarginPixelSize (command line only)
        const pageRect = page.ldata().bbox()
        const width = Math.round(pageRect.width() / DPI * canvasDpi)
        const height = Math.round(pageRect.height() / DPI * canvasDpi)
        const scale = canvasDpi / DPI

        const stripRows = Math.max(1, Math.min(height, Math.floor(MAX_STRIP_PIXELS / Math.max(1, width))))
        const canvas = createCanvas(width, stripRows)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('no canvas')
        }
        const paintStrip = (y: number, rows: number): void => {
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, width, stripRows)
            if (!transparent) {
                // C++ image.fill(Qt::white)
                ctx.fillStyle = '#fff'
                ctx.fillRect(0, 0, width, rows)
            }
            const provider = new CanvasPaintProvider(ctx, new Transform(scale, 0, 0, scale, -pageRect.x() * scale, -(pageRect.y() * scale + y)))
            const painter = new Painter(provider, fontProvider(), 'pngwriter')
            const frameRect = new RectF(pageRect.x(), pageRect.y() + y / scale, pageRect.width(), rows / scale).translated(page.pos())
            Paint.paintScore(painter, score, {
                fromPage: pageNumber, toPage: pageNumber, isPrinting: true, printPageBackground: false, frameRect,
            })
        }

        // the images of the score are decoded when they are first drawn (asynchronously in browsers)
        paintStrip(0, stripRows)
        for (let i = 0; i < 3 && imageCache.hasPending(); ++i) {
            await imageCache.whenDecoded()
        }

        const encoder = new PngEncoder(width, height, Math.round(canvasDpi * 1000 / 25.4))
        for (let y = 0; y < height; y += stripRows) {
            const rows = Math.min(stripRows, height - y)
            paintStrip(y, rows)
            const data = ctx.getImageData(0, 0, width, rows).data
            if (grayscale) {
                for (let i = 0; i < width * rows * 4; i += 4) {
                    const g = qGray(data[i], data[i + 1], data[i + 2])
                    data[i] = data[i + 1] = data[i + 2] = g
                }
            }
            encoder.addRows(data, rows)
            // keep the page responsive between the strips
            await new Promise(resolve => setTimeout(resolve))
        }
        return encoder.finish()
    }
}
