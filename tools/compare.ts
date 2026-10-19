/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Renders a score with MuseScore (reference) and with this port, and compares the PNGs.
 *
 * usage: npm run compare -- <file.mscz|mscx> [out-dir] [dpi]
 *   writes <name>-<page>-ref.png, <name>-<page>-web.png and <name>-<page>-diff.png
 *   (diff: black = both, red = only MuseScore, blue = only this port)
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
    const out = new PNG({ width: w, height: h })
    let refInk = 0
    let webInk = 0
    let onlyRef = 0
    let onlyWeb = 0
    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            const r = x < ref.width && y < ref.height ? ink(ref.data, (y * ref.width + x) * 4) : 0
            const b = x < web.width && y < web.height ? ink(web.data, (y * web.width + x) * 4) : 0
            refInk += r
            webInk += b
            const both = Math.min(r, b)
            onlyRef += r - both
            onlyWeb += b - both
            const o = (y * w + x) * 4
            out.data[o] = Math.round(255 * (1 - both - (b - both)))
            out.data[o + 1] = Math.round(255 * (1 - both - (r - both) - (b - both)))
            out.data[o + 2] = Math.round(255 * (1 - both - (r - both)))
            out.data[o + 3] = 255
        }
    }
    writeFileSync(diffFile, PNG.sync.write(out))
    const score = refInk + webInk > 0 ? (onlyRef + onlyWeb) / (refInk + webInk) : 0
    return { page, refInk, webInk, onlyRef, onlyWeb, score }
}

export async function compareScore(file: string, outDir: string, dpi = 100): Promise<PageDiff[]> {
    mkdirSync(outDir, { recursive: true })
    const name = basename(file).replace(/\.msc[zx]$/, '')
    // MuseScore writes <prefix>-<page>.png
    execFileSync(MSCORE, ['-r', String(dpi), '-o', join(outDir, `${name}-ref.png`), file], { stdio: 'ignore' })
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
