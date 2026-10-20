/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Renders many scores with MuseScore 4.7.5 and with this port, and compares every page with the baseline
 * (test/compare-baseline.csv): a page that differs more from MuseScore than before is a regression.
 *
 *   npm run compare:all [-- [--out <dir>] [--update-baseline] [files or directories...]]
 *
 * Default: the v4.7.5 vtest scores (MuseScore submodule) and mscz-test-files/. Takes a while (~800 scores).
 * Exit code 1 on regressions.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareScore } from './compare'
import { initEngravingFonts, loadScore } from '../src/index'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const BASELINE = join(ROOT, 'test/compare-baseline.csv')
const DEFAULT_INPUTS = [join(ROOT, 'MuseScore/vtest/scores'), join(ROOT, 'mscz-test-files')]
const DPI = 50
/** a page is a regression if its difference grows by more than this (share of ink pixels) */
const TOLERANCE = 0.005

type Results = Map<string, number | 'ERR'> // "<file>#<page>" -> score

function readCsv(file: string): Results {
    const res: Results = new Map()
    if (!existsSync(file)) {
        return res
    }
    for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
        const [f, page, score] = line.split(',')
        if (f) {
            res.set(`${f}#${page}`, score === 'ERR' ? 'ERR' : Number(score))
        }
    }
    return res
}

function writeCsv(file: string, res: Results): void {
    const lines = [...res].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
        const [f, page] = k.split('#')
        return `${f},${page},${v === 'ERR' ? 'ERR' : v.toFixed(4)}`
    })
    writeFileSync(file, ['file,page,score', ...lines].join('\n') + '\n')
}

function collectFiles(inputs: string[]): string[] {
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

const args = process.argv.slice(2)
const update = args.includes('--update-baseline')
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, 'compare-out')
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))
const files = collectFiles(inputs.length ? inputs : DEFAULT_INPUTS)

await initEngravingFonts(async (p) => readFileSync(join(ROOT, 'fonts', p)))
mkdirSync(outDir, { recursive: true })

const results: Results = new Map()
let sum = 0
let pages = 0
for (const [i, file] of files.entries()) {
    const key = relative(ROOT, file)
    try {
        loadScore(readFileSync(file))
    } catch {
        continue // rejected by MuseScore 4.7.5 too (e.g. too old or too new)
    }
    try {
        const res = await compareScore(file, outDir, DPI)
        for (const r of res) {
            results.set(`${key}#${r.page}`, r.score)
            sum += r.score
            ++pages
        }
        console.log(`[${i + 1}/${files.length}] ${key} ${res.map(r => `${(100 * r.score).toFixed(1)}%`).join(' ')}`)
    } catch (e) {
        results.set(`${key}#0`, 'ERR')
        console.log(`[${i + 1}/${files.length}] ${key} ERROR ${(e as Error).message.slice(0, 100)}`)
    }
}
writeCsv(join(outDir, 'results.csv'), results)
console.log(`\nmean difference ${(100 * sum / Math.max(1, pages)).toFixed(2)}% over ${pages} pages (${outDir}/results.csv)`)

const baseline = readCsv(BASELINE)
const regressions: string[] = []
const improvements: string[] = []
for (const [k, v] of results) {
    const b = baseline.get(k)
    if (b === undefined) {
        continue
    }
    if (v === 'ERR' && b !== 'ERR') {
        regressions.push(`${k}: error`)
    } else if (typeof v === 'number' && typeof b === 'number') {
        if (v > b + TOLERANCE) {
            regressions.push(`${k}: ${(100 * b).toFixed(1)}% -> ${(100 * v).toFixed(1)}%`)
        } else if (v < b - TOLERANCE) {
            improvements.push(`${k}: ${(100 * b).toFixed(1)}% -> ${(100 * v).toFixed(1)}%`)
        }
    }
}
// pages that disappeared (different page count) are regressions too
const files_ = new Set([...results.keys()].map(k => k.split('#')[0]))
for (const k of baseline.keys()) {
    if (files_.has(k.split('#')[0]) && !results.has(k)) {
        regressions.push(`${k}: page missing`)
    }
}

if (improvements.length) {
    console.log(`\nimproved (${improvements.length}):\n  ${improvements.join('\n  ')}`)
}
if (regressions.length) {
    console.log(`\nREGRESSIONS (${regressions.length}):\n  ${regressions.join('\n  ')}`)
}
if (update) {
    // keep baseline entries of files that were not compared this time
    for (const [k, v] of baseline) {
        if (!files_.has(k.split('#')[0])) {
            results.set(k, v)
        }
    }
    writeCsv(BASELINE, results)
    console.log(`\nbaseline updated: ${relative(ROOT, BASELINE)}`)
} else if (regressions.length) {
    process.exitCode = 1
}
