/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Renders a score with MuseScore (reference) and with this port, and compares the PNGs.
 *
 * usage: npm run compare -- <file.mscz|mscx> [out-dir] [dpi]
 *   writes <name>-<page>-ref.png, <name>-<page>-web.png and <name>-<page>-diff.png
 *   (diff: black = both, red = only MuseScore, blue = only this port; differences of one pixel are tolerated)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { renderScore } from './render'

const MSCORE = process.env.MSCORE ?? '/Applications/MuseScore 4.app/Contents/MacOS/mscore'

/** darkness 0..1 of a pixel on white (alpha composited) */
function ink(data: Buffer, i: number): number {
    const a = data[i + 3] / 255
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    return a * (1 - lum)
}

export interface PageDiff { page: number; refInk: number; webInk: number; onlyRef: number; onlyWeb: number; score: number }

export function diffPngs(refFile: string, webFile: string, diffFile: string, page: number): PageDiff {
    const ref = PNG.sync.read(readFileSync(refFile))
    const web = PNG.sync.read(readFileSync(webFile))
    const w = Math.max(ref.width, web.width)
    const h = Math.max(ref.height, web.height)
    const inkMap = (png: PNG): Float32Array => {
        const m = new Float32Array(w * h)
        for (let y = 0; y < png.height; ++y) {
            for (let x = 0; x < png.width; ++x) {
                m[y * w + x] = ink(png.data, (y * png.width + x) * 4)
            }
        }
        return m
    }
    // max over the 3x3 neighborhood: differences of up to one pixel (anti-aliasing, rounding) are tolerated
    const dilate = (m: Float32Array): Float32Array => {
        const d = new Float32Array(w * h)
        for (let y = 0; y < h; ++y) {
            for (let x = 0; x < w; ++x) {
                let v = 0
                for (let dy = -1; dy <= 1; ++dy) {
                    for (let dx = -1; dx <= 1; ++dx) {
                        const xx = x + dx
                        const yy = y + dy
                        if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                            v = Math.max(v, m[yy * w + xx])
                        }
                    }
                }
                d[y * w + x] = v
            }
        }
        return d
    }
    const r = inkMap(ref)
    const b = inkMap(web)
    const rd = dilate(r)
    const bd = dilate(b)
    const out = new PNG({ width: w, height: h })
    let refInk = 0
    let webInk = 0
    let onlyRef = 0
    let onlyWeb = 0
    for (let i = 0; i < w * h; ++i) {
        refInk += r[i]
        webInk += b[i]
        const or = Math.max(0, r[i] - bd[i])
        const ob = Math.max(0, b[i] - rd[i])
        onlyRef += or
        onlyWeb += ob
        const both = Math.max(0, Math.max(r[i], b[i]) - or - ob)
        const o = i * 4
        out.data[o] = Math.round(255 * (1 - both - ob))
        out.data[o + 1] = Math.round(255 * (1 - both - or - ob))
        out.data[o + 2] = Math.round(255 * (1 - both - or))
        out.data[o + 3] = 255
    }
    writeFileSync(diffFile, PNG.sync.write(out))
    const score = refInk + webInk > 0 ? (onlyRef + onlyWeb) / (refInk + webInk) : 0
    return { page, refInk, webInk, onlyRef, onlyWeb, score }
}

export async function compareScore(file: string, outDir: string, dpi = 100): Promise<PageDiff[]> {
    mkdirSync(outDir, { recursive: true })
    const name = basename(file).replace(/\.msc[zx]$/, '')
    // MuseScore writes <prefix>-<page>.png
    try {
        execFileSync(MSCORE, ['-r', String(dpi), '-o', join(outDir, `${name}-ref.png`), file], { stdio: 'ignore' })
    } catch (e) {
        // mscore sometimes exits with an error code although the export succeeded
        if (!existsSync(join(outDir, `${name}-ref-1.png`))) {
            throw e
        }
    }
    const webFiles = await renderScore(file, join(outDir, `${name}-web`), dpi)
    const res: PageDiff[] = []
    for (let i = 0; i < webFiles.length; ++i) {
        const refFile = join(outDir, `${name}-ref-${i + 1}.png`)
        if (!existsSync(refFile)) {
            continue
        }
        res.push(diffPngs(refFile, webFiles[i], join(outDir, `${name}-diff-${i + 1}.png`), i + 1))
    }
    return res
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const [file, outDir, dpi] = process.argv.slice(2)
    if (!file) {
        console.error('usage: npm run compare -- <file.mscz> [out-dir] [dpi]')
        process.exit(1)
    }
    const res = await compareScore(file, outDir ?? 'compare-out', dpi ? Number(dpi) : 100)
    for (const r of res) {
        console.log(`page ${r.page}: diff ${(100 * r.score).toFixed(2)}% (only MuseScore ${r.onlyRef.toFixed(0)}, only web ${r.onlyWeb.toFixed(0)})`)
    }
}
