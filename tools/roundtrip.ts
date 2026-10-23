/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Round trip test of the writer: load -> layout -> SVG of every page, then saveMscz -> load the saved file -> layout ->
 * SVG of every page; the pages must be identical.
 * Values the file format stores with 6 significant digits (like MuseScore, e.g. style values of old files given in
 * inches) can change positions by rounding: pages whose SVGs differ only in numbers by less than 0.05 units
 * (1/24000 inch) count as "equal within rounding". A second round trip (save the saved score again) must give
 * exactly the same pages.
 *
 *   npm run roundtrip [-- [--out <dir>] [files or directories...]]
 *
 * Default: all scores of test/compare-baseline.csv. For a differing score the saved .mscz and the SVGs of the first
 * differing page are written to <out> (default compare-out/roundtrip). Exit code 1 if a score differs.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drawPageSvg, initEngravingFonts, layoutScore, loadScore, pageCount, saveMscz } from '../src/index'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const BASELINE = join(ROOT, 'test/compare-baseline.csv')

function collectFiles(inputs: string[]): string[] {
    if (!inputs.length) {
        const files = new Set<string>()
        for (const line of readFileSync(BASELINE, 'utf8').split('\n').slice(1)) {
            const f = line.split(',')[0]
            if (f) {
                files.add(join(ROOT, f))
            }
        }
        return [...files].sort()
    }
    const files: string[] = []
    for (const input of inputs) {
        if (!existsSync(input)) {
            console.warn(`missing: ${input}`)
            continue
        }
        if (statSync(input).isDirectory()) {
            files.push(...readdirSync(input).filter(f => /\.msc[zx]$/.test(f)).sort().map(f => join(input, f)))
        } else {
            files.push(resolve(input))
        }
    }
    return files
}

function pagesSvg(data: Uint8Array): string[] {
    const score = loadScore(data)
    layoutScore(score)
    return Array.from({ length: pageCount(score) }, (_, i) => drawPageSvg(score, i))
}

const hash = (s: string): string => createHash('sha1').update(s).digest('hex')

const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g

/** true if the SVGs differ only in numbers, by less than the tolerance */
function equalWithinRounding(a: string, b: string, tol = 0.05): boolean {
    if (a.replace(NUM, '#') !== b.replace(NUM, '#')) {
        return false
    }
    const na = a.match(NUM) ?? []
    const nb = b.match(NUM) ?? []
    if (na.length !== nb.length) {
        return false
    }
    for (let i = 0; i < na.length; ++i) {
        const x = Number(na[i])
        const y = Number(nb[i])
        if (Math.abs(x - y) > tol && Math.abs(x - y) > 1e-6 * Math.max(Math.abs(x), Math.abs(y))) {
            return false
        }
    }
    return true
}

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, 'compare-out/roundtrip')
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))
const files = collectFiles(inputs)

await initEngravingFonts(async (p) => readFileSync(join(ROOT, 'fonts', p)))
mkdirSync(outDir, { recursive: true })

let ok = 0
let okRounding = 0
let pagesOk = 0
let pagesRounding = 0
const unstable: string[] = []
let pagesTotal = 0
const failed: string[] = []
const t0 = Date.now()
for (const file of files) {
    const rel = relative(ROOT, file)
    const name = basename(file).replace(/\.msc[zx]$/, '')
    let saved: Uint8Array
    let before: string[]
    try {
        const score = loadScore(readFileSync(file))
        layoutScore(score)
        before = Array.from({ length: pageCount(score) }, (_, i) => drawPageSvg(score, i))
        saved = saveMscz(score, name + '.mscx')
    } catch (e) {
        console.log(`${rel}: ERROR (original) ${(e as Error).stack?.split('\n').slice(0, 3).join(' ')}`)
        failed.push(rel)
        continue
    }
    let after: string[]
    try {
        after = pagesSvg(saved)
    } catch (e) {
        console.log(`${rel}: ERROR (saved) ${(e as Error).stack?.split('\n').slice(0, 3).join(' ')}`)
        writeFileSync(join(outDir, name + '.mscz'), saved)
        failed.push(rel)
        continue
    }
    pagesTotal += before.length
    const differing: number[] = []
    let rounding = 0
    for (let i = 0; i < Math.max(before.length, after.length); ++i) {
        if (before[i] !== undefined && after[i] !== undefined && hash(before[i]) === hash(after[i])) {
            ++pagesOk
        } else if (before[i] !== undefined && after[i] !== undefined && equalWithinRounding(before[i], after[i])) {
            ++pagesRounding
            ++rounding
        } else {
            differing.push(i + 1)
        }
    }
    // second round trip: the saved file must be a fixpoint
    if (rounding || differing.length) {
        try {
            const score2 = loadScore(saved)
            layoutScore(score2)
            const after2 = pagesSvg(saveMscz(score2, name + '.mscx'))
            if (after2.length !== after.length || after2.some((p, i) => p !== after[i])) {
                unstable.push(rel)
                console.log(`${rel}: second round trip differs`)
            }
        } catch (e) {
            unstable.push(rel)
            console.log(`${rel}: ERROR (second round trip) ${(e as Error).message}`)
        }
    }
    if (!differing.length) {
        if (rounding) {
            ++okRounding
        } else {
            ++ok
        }
        continue
    }
    failed.push(rel)
    console.log(`${rel}: pages ${before.length} -> ${after.length}, differing pages: ${differing.join(' ')}`)
    writeFileSync(join(outDir, name + '.mscz'), saved)
    const p = differing[0] - 1
    if (before[p] !== undefined) {
        writeFileSync(join(outDir, `${name}-p${p + 1}-orig.svg`), before[p])
    }
    if (after[p] !== undefined) {
        writeFileSync(join(outDir, `${name}-p${p + 1}-saved.svg`), after[p])
    }
}

console.log(`\n${files.length} scores: ${ok} identical after the round trip, ${okRounding} equal within rounding, `
    + `${failed.length} differing (pages: ${pagesOk} identical, ${pagesRounding} within rounding, `
    + `${pagesTotal - pagesOk - pagesRounding} differing of ${pagesTotal}); `
    + `${unstable.length} not stable in a second round trip; ${((Date.now() - t0) / 1000).toFixed(0)} s`)
writeFileSync(join(outDir, 'failed.txt'), failed.join('\n') + '\n')
process.exit(failed.length || unstable.length ? 1 : 0)
