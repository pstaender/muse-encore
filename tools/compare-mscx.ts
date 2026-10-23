/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Compares the .mscx text written by this port (writeMscx) with MuseScore's own re-save of the same file
 * (`mscore -o out.mscx in.mscz`). EIDs are random for elements that have none in the input, so <eid>, <linkedTo> and
 * system lock references are normalized before diffing. Also compares the style file (score_style.mss) and the parts
 * (Excerpts/, from MuseScore's .mscz export).
 *
 *   npm run compare:mscx [-- [--out <dir>] [--verbose] [files or directories...]]
 *
 * Default: the v4.7.5 vtest scores (MuseScore submodule) and mscz-test-files/. MuseScore's output is cached in
 * <out>/ref (delete it after updating MuseScore). Writes <out>/<name>.diff for every file with differences and
 * prints the most frequent differing lines.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initEngravingFonts, loadScore, saveMscz } from '../src/index'
import { unzipSync, strFromU8 } from 'fflate'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const MSCORE = process.env.MSCORE ?? '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
const DEFAULT_INPUTS = [join(ROOT, 'MuseScore/vtest/scores'), join(ROOT, 'mscz-test-files')]

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

export function normalizeMscx(s: string): string[] {
    return s
        .replace(/<eid>[^<]*<\/eid>/g, '<eid/>')
        .replace(/<linkedTo>[^<]*<\/linkedTo>/g, '<linkedTo/>')
        .replace(/<(startMeasure|endMeasure)>[^<]*<\/\1>/g, '<$1/>')
        .split('\n')
}

/** Myers' O((N+M)D) diff: [op, line, index in a] with op ' ' (common), '-' (only a), '+' (only b) */
function myers(a: string[], b: string[]): Array<[string, string, number]> {
    const n = a.length
    const m = b.length
    const max = n + m
    const v = new Int32Array(2 * max + 2)
    const trace: Int32Array[] = []
    let found = false
    for (let d = 0; d <= max && !found; ++d) {
        trace.push(v.slice())
        for (let k = -d; k <= d; k += 2) {
            let x = (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) ? v[max + k + 1] : v[max + k - 1] + 1
            let y = x - k
            while (x < n && y < m && a[x] === b[y]) {
                ++x
                ++y
            }
            v[max + k] = x
            if (x >= n && y >= m) {
                found = true
                break
            }
        }
    }
    trace.push(v.slice())
    // backtrack
    const ops: Array<[string, string, number]> = []
    let x = n
    let y = m
    for (let d = trace.length - 2; d >= 0; --d) {
        const vv = trace[d]
        const k = x - y
        const prevK = (k === -d || (k !== d && vv[max + k - 1] < vv[max + k + 1])) ? k + 1 : k - 1
        const prevX = vv[max + prevK]
        const prevY = prevX - prevK
        while (x > prevX && y > prevY) {
            ops.push([' ', a[x - 1], x - 1])
            --x
            --y
        }
        if (d > 0) {
            if (x === prevX) {
                ops.push(['+', b[y - 1], x])
                --y
            } else {
                ops.push(['-', a[x - 1], x - 1])
                --x
            }
        }
    }
    while (x > 0 && y > 0) {
        ops.push([' ', a[x - 1], x - 1])
        --x
        --y
    }
    return ops.reverse()
}

/** line based diff; returns the unified-like list of differing lines ("-": only MuseScore, "+": only port) */
export function diffLines(a: string[], b: string[]): string[] {
    // trim common prefix/suffix, then an O(n*m) LCS on the rest (with a size limit)
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
    const out: string[] = []
    for (const [op, line, idx] of myers(aa, bb)) {
        out.push(op === ' ' ? ` ${start + idx + 1}:${line}` : op + line)
    }
    // only the differing lines with one line of context
    return out.filter((l, k) => l[0] !== ' ' || (out[k - 1]?.[0] ?? ' ') !== ' ' || (out[k + 1]?.[0] ?? ' ') !== ' ')
}

function mscoreRef(file: string, refDir: string): { mscx: string; style: string } | null {
    const name = basename(file) // with the extension: there are scores with the same name as .mscx and .mscz
    const dir = join(refDir, name)
    const mscx = join(dir, name + '.mscx')
    if (!existsSync(mscx)) {
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(dir, { recursive: true })
        try {
            execFileSync(MSCORE, ['-o', mscx, file], { stdio: 'ignore', timeout: 120000 })
        } catch {
            // mscore sometimes exits with an error code although the export succeeded
        }
        if (!existsSync(mscx)) {
            return null
        }
    }
    const stylePath = join(dir, 'score_style.mss')
    return { mscx: readFileSync(mscx, 'utf8'), style: existsSync(stylePath) ? readFileSync(stylePath, 'utf8') : '' }
}

function mscoreRefZip(file: string, refDir: string): Record<string, Uint8Array> | null {
    const out = join(refDir, basename(file) + '.ref.mscz')
    if (!existsSync(out)) {
        try {
            execFileSync(MSCORE, ['-o', out, file], { stdio: 'ignore', timeout: 120000 })
        } catch {
            // see mscoreRef
        }
        if (!existsSync(out)) {
            return null
        }
    }
    return unzipSync(readFileSync(out))
}

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, 'compare-out/mscx')
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))
const files = collectFiles(inputs.length ? inputs : DEFAULT_INPUTS)
const refDir = join(outDir, 'ref')
mkdirSync(refDir, { recursive: true })

await initEngravingFonts(async (p) => readFileSync(join(ROOT, 'fonts', p)))

const lineCounts = new Map<string, number>()
let identical = 0
let styleIdentical = 0
let failed = 0
let totalDiffLines = 0
const perFile: Array<[string, number, number]> = []
for (const file of files) {
    const rel = relative(ROOT, file)
    const name = basename(file).replace(/\.msc[zx]$/, '')
    const ref = mscoreRef(file, refDir)
    if (!ref) {
        console.log(`${rel}: MuseScore failed`)
        ++failed
        continue
    }
    let ourMscx: string
    let ourStyle: string
    const excerptDiffs: string[] = []
    try {
        const score = loadScore(readFileSync(file))
        const zip = unzipSync(saveMscz(score, name + '.mscx'))
        ourMscx = strFromU8(zip[name + '.mscx'])
        ourStyle = strFromU8(zip['score_style.mss'])
        // parts: MuseScore's .mscx export (a directory) does not contain them, compare with its .mscz export
        const excerptFiles = Object.keys(zip).filter(k => k.startsWith('Excerpts/'))
        if (excerptFiles.length) {
            const refZip = mscoreRefZip(file, refDir)
            for (const k of excerptFiles) {
                const refText = refZip?.[k] ? strFromU8(refZip[k]) : ''
                const ours = strFromU8(zip[k])
                const d = k.endsWith('.mscx') ? diffLines(normalizeMscx(refText), normalizeMscx(ours))
                    : diffLines(refText.split('\n'), ours.split('\n'))
                if (d.some(l => l[0] === '-' || l[0] === '+')) {
                    excerptDiffs.push('=== ' + k, ...d)
                }
            }
            for (const k of Object.keys(refZip ?? {}).filter(k => /^Excerpts\/.*\.(mscx|mss)$/.test(k))) {
                if (!zip[k]) {
                    excerptDiffs.push('=== missing ' + k, '-')
                }
            }
        }
    } catch (e) {
        console.log(`${rel}: ERROR ${(e as Error).message}`)
        ++failed
        continue
    }
    const d = diffLines(normalizeMscx(ref.mscx), normalizeMscx(ourMscx))
    const ds = ref.style ? diffLines(ref.style.split('\n'), ourStyle.split('\n')) : []
    d.push(...excerptDiffs)
    const n = d.filter(l => l[0] === '-' || l[0] === '+').length
    const ns = ds.filter(l => l[0] === '-' || l[0] === '+').length
    totalDiffLines += n
    if (n === 0) {
        ++identical
    }
    if (ns === 0) {
        ++styleIdentical
    }
    perFile.push([rel, n, ns])
    const diffFile = join(outDir, basename(file) + '.diff')
    if (n || ns) {
        writeFileSync(diffFile, [...d, ...(ns ? ['=== score_style.mss', ...ds] : [])].join('\n') + '\n')
        for (const l of [...d, ...ds]) {
            if (l[0] === '-' || l[0] === '+') {
                const key = l[0] + l.slice(1).trim().replace(/>[^<]*</, '>…<').replace(/"[^"]*"/g, '"…"')
                lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1)
            }
        }
    } else {
        rmSync(diffFile, { force: true })
    }
    if (verbose || n || ns) {
        console.log(`${rel}: ${n} differing lines${ns ? `, style: ${ns}` : ''}`)
    }
}

console.log(`\n${files.length} files: ${identical} identical .mscx, ${styleIdentical} identical styles, ${failed} failed, `
    + `${totalDiffLines} differing lines in total`)
console.log('\nmost frequent differing lines ("-": only MuseScore, "+": only port):')
for (const [k, v] of [...lineCounts].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`${String(v).padStart(7)}  ${k.slice(0, 140)}`)
}
writeFileSync(join(outDir, 'summary.csv'), ['file,mscx,style', ...perFile.map(r => r.join(','))].join('\n') + '\n')
