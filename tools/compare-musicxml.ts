/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Compares the MusicXML written by this port (writeMusicXml) with MuseScore's own export of the same file
 * (`mscore -o out.musicxml in.mscz`, default export settings). The <software> and <encoding-date> lines are ignored.
 *
 *   npx tsx tools/compare-musicxml.ts [--out <dir>] [--verbose] [files or directories...]
 *
 * Default: the v4.7.5 vtest scores (MuseScore submodule), the demos and mscz-test-files/. MuseScore's output is cached
 * in <out>/ref (delete it after updating MuseScore). Writes <out>/<name>.musicxml and <out>/<name>.diff for every
 * file with differences.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initEngravingFonts, layoutScore, loadScore } from '../src/index'
import { writeMusicXml } from '../src/importexport/musicxml/api'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const MSCORE = process.env.MSCORE ?? '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
const DEFAULT_INPUTS = [join(ROOT, 'MuseScore/vtest/scores'), join(ROOT, 'MuseScore/demos'), join(ROOT, 'mscz-test-files')]

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

function normalize(s: string): string[] {
    return s.split('\n').filter(l => !/<software>|<encoding-date>/.test(l))
}

/** without the numbers that depend on the layout (position attributes are omitted when near 0; widths, distances) */
function maskLayout(lines: string[]): string[] {
    return lines.map(l => l
        .replace(/ (default-x|default-y|relative-x|relative-y|width|bezier-x|bezier-y)="[-0-9.e]+"/g, '')
        .replace(/<(left-margin|right-margin|system-distance|top-system-distance|staff-distance|measure-distance)>[-0-9.e]+</g, '<$1>#<'))
}

/** a simple LCS line diff of the differing middle part ("-": only MuseScore, "+": only port) */
function diffLines(a: string[], b: string[]): string[] {
    let start = 0
    while (start < a.length && start < b.length && a[start] === b[start]) {
        ++start
    }
    let endA = a.length
    let endB = b.length
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        --endA
        --endB
    }
    const aa = a.slice(start, endA)
    const bb = b.slice(start, endB)
    if (aa.length * bb.length > 4e7) {
        return [`@@ ${start + 1}: too many differences (${aa.length} / ${bb.length} lines)`,
            ...aa.slice(0, 20).map(l => '-' + l), ...bb.slice(0, 20).map(l => '+' + l)]
    }
    const n = aa.length
    const m = bb.length
    const lcs: Uint32Array[] = []
    for (let i = 0; i <= n; ++i) {
        lcs.push(new Uint32Array(m + 1))
    }
    for (let i = n - 1; i >= 0; --i) {
        for (let j = m - 1; j >= 0; --j) {
            lcs[i][j] = aa[i] === bb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
        }
    }
    const out: string[] = []
    let i = 0
    let j = 0
    while (i < n || j < m) {
        if (i < n && j < m && aa[i] === bb[j]) {
            out.push(` ${start + i + 1}:${aa[i]}`)
            ++i
            ++j
        } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
            out.push('+' + bb[j++])
        } else {
            out.push('-' + aa[i++])
        }
    }
    return out.filter((l, k) => l[0] !== ' ' || (out[k - 1]?.[0] ?? ' ') !== ' ' || (out[k + 1]?.[0] ?? ' ') !== ' ')
}

function mscoreRef(file: string, refDir: string): string | null {
    const out = join(refDir, basename(file) + '.musicxml')
    if (!existsSync(out)) {
        try {
            execFileSync(MSCORE, ['-o', out, file], { stdio: 'ignore', timeout: 120000 })
        } catch {
            // mscore sometimes exits with an error code although the export succeeded
        }
        if (!existsSync(out)) {
            return null
        }
    }
    return readFileSync(out, 'utf8')
}

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, 'compare-out/musicxml')
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))
const files = collectFiles(inputs.length ? inputs : DEFAULT_INPUTS)
const refDir = join(outDir, 'ref')
mkdirSync(refDir, { recursive: true })

await initEngravingFonts(async (p) => readFileSync(join(ROOT, 'fonts', p)))

let identical = 0
let identicalButLayout = 0
let failed = 0
const perFile: Array<[string, number]> = []
for (const file of files) {
    const rel = relative(ROOT, file)
    const name = basename(file)
    const ref = mscoreRef(file, refDir)
    if (ref === null) {
        console.log(`${rel}: MuseScore failed`)
        ++failed
        continue
    }
    let ours: string
    try {
        const score = loadScore(readFileSync(file))
        layoutScore(score)
        ours = writeMusicXml(score)
    } catch (e) {
        console.log(`${rel}: port failed: ${(e as Error).stack}`)
        ++failed
        continue
    }
    writeFileSync(join(outDir, name + '.musicxml'), ours)
    const d = diffLines(normalize(ref), normalize(ours))
    const n = d.filter(l => l[0] === '-' || l[0] === '+').length
    const dMasked = n === 0 ? [] : diffLines(maskLayout(normalize(ref)), maskLayout(normalize(ours)))
    const nMasked = dMasked.filter(l => l[0] === '-' || l[0] === '+').length
    if (nMasked) {
        writeFileSync(join(outDir, name + '.masked.diff'), dMasked.join('\n') + '\n')
    }
    if (n === 0) {
        ++identical
    } else {
        if (nMasked === 0) {
            ++identicalButLayout
        }
        writeFileSync(join(outDir, name + '.diff'), d.join('\n') + '\n')
        perFile.push([rel + (nMasked ? ` (${nMasked} apart from layout values)` : ' (only layout values)'), n])
        if (verbose) {
            console.log(`${rel}: ${n} differing lines`)
        }
    }
}

perFile.sort((a, b) => b[1] - a[1])
for (const [rel, n] of perFile) {
    console.log(`${String(n).padStart(6)}  ${rel}`)
}
console.log(`\n${identical} identical, ${identicalButLayout} identical apart from layout values (positions, widths, distances), `
    + `${perFile.length - identicalButLayout} with other differences, ${failed} failed (of ${files.length})`)
