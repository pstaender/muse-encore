// SPDX-License-Identifier: GPL-3.0-only
// Shared helpers of the tests: fonts, test score locations, rendering to pixels.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { drawPage, initEngravingFonts, layoutScore, loadScore, pageSize, type MasterScore } from '../src/index'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** v4.7.5 vtest and demo scores of the MuseScore submodule (git submodule update --init) */
export const VTEST = process.env.MS_VTEST ?? `${ROOT}MuseScore/vtest/scores`
export const DEMOS = `${ROOT}MuseScore/demos`
export const TEST_FILES = `${ROOT}mscz-test-files`
export const hasSubmodule = existsSync(VTEST) && existsSync(DEMOS)

let fontsReady: Promise<void> | null = null

export function initFonts(): Promise<void> {
    fontsReady ??= initEngravingFonts(async (p) => readFileSync(`${ROOT}fonts/${p}`))
    return fontsReady
}

export async function openScore(file: string): Promise<MasterScore> {
    await initFonts()
    const score = loadScore(readFileSync(file))
    layoutScore(score)
    return score
}

/** black/white pixels of a page, drawn with the canvas paint provider */
export function canvasPixels(score: MasterScore, page: number, dpi: number): { w: number; h: number; ink: Uint8Array } {
    const s = pageSize(score, page)
    const w = Math.round(s.width * dpi)
    const h = Math.round(s.height * dpi)
    const c = createCanvas(w, h)
    drawPage(score, page, c.getContext('2d') as never, { dpi })
    return { w, h, ink: toInk(c.getContext('2d').getImageData(0, 0, w, h).data) }
}

/** black/white pixels of an SVG document rasterized at w x h */
export async function svgPixels(svg: string, w: number, h: number): Promise<Uint8Array> {
    const sized = svg.replace(/width="[^"]*in" height="[^"]*in"/, `width="${w}" height="${h}"`)
    const img = await loadImage(Buffer.from(sized))
    const c = createCanvas(w, h)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return toInk(ctx.getImageData(0, 0, w, h).data)
}

function toInk(rgba: Uint8ClampedArray): Uint8Array {
    const ink = new Uint8Array(rgba.length / 4)
    for (let i = 0; i < ink.length; ++i) {
        ink[i] = rgba[i * 4] < 128 ? 1 : 0
    }
    return ink
}

/**
 * Pixels set in only one of the images, relative to the pixels set in any of them. With `tolerance` a pixel
 * also matches a set pixel of the other image up to that many pixels away (rasterizers round lines differently).
 */
export function inkDifference(a: Uint8Array, b: Uint8Array, width: number, tolerance = 1): number {
    const height = a.length / width
    const near = (img: Uint8Array, x: number, y: number): boolean => {
        for (let dy = -tolerance; dy <= tolerance; ++dy) {
            for (let dx = -tolerance; dx <= tolerance; ++dx) {
                const xx = x + dx
                const yy = y + dy
                if (xx >= 0 && yy >= 0 && xx < width && yy < height && img[yy * width + xx]) {
                    return true
                }
            }
        }
        return false
    }
    let diff = 0
    let ink = 0
    for (let i = 0; i < a.length; ++i) {
        if (a[i] || b[i]) {
            ++ink
            const x = i % width
            const y = (i - x) / width
            if ((a[i] && !near(b, x, y)) || (b[i] && !near(a, x, y))) {
                ++diff
            }
        }
    }
    return ink ? diff / ink : 0
}
