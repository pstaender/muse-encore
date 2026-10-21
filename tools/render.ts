/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Renders all pages of a score to PNG files in node.
 *
 * usage: npm run render -- <file.mscz|mscx> <out-prefix> [dpi]
 *   writes <out-prefix>-<page>.png (page numbers start at 1, like MuseScore's export)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
    drawPage, drawPageSvg, hasPendingImages, imagesDecoded, initEngravingFonts, layoutScore, loadScore, pageCount, pageSize,
    setImageDecoder,
} from '../src/index'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

/** dpi 'svg': vector output */
export async function renderScore(file: string, outPrefix: string, dpi: number | 'svg' = 100): Promise<string[]> {
    await initEngravingFonts(async (p) => readFileSync(join(FONTS_DIR, p)))
    // images of the score (decoded asynchronously, the page is drawn again when they are available)
    setImageDecoder(pm => loadImage(Buffer.from(pm.data)))
    const score = loadScore(readFileSync(file))
    layoutScore(score)
    const out: string[] = []
    for (let i = 0; i < pageCount(score); ++i) {
        if (dpi === 'svg') {
            const name = `${outPrefix}-${i + 1}.svg`
            writeFileSync(name, drawPageSvg(score, i))
            out.push(name)
            continue
        }
        const size = pageSize(score, i)
        // same rounding as MuseScore's PngWriter (std::lrint)
        const canvas = createCanvas(Math.round(size.width * dpi), Math.round(size.height * dpi))
        const ctx = canvas.getContext('2d')
        drawPage(score, i, ctx as never, { dpi })
        if (hasPendingImages()) {
            await imagesDecoded()
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            drawPage(score, i, ctx as never, { dpi })
        }
        const name = `${outPrefix}-${i + 1}.png`
        writeFileSync(name, canvas.toBuffer('image/png'))
        out.push(name)
    }
    return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const [file, outPrefix, dpi] = process.argv.slice(2)
    if (!file || !outPrefix) {
        console.error('usage: npm run render -- <file.mscz> <out-prefix> [dpi | svg]')
        process.exit(1)
    }
    const files = await renderScore(file, outPrefix, dpi === 'svg' ? 'svg' : dpi ? Number(dpi) : 100)
    console.log(files.join('\n'))
}
