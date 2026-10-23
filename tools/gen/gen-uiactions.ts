/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Generates musescoreweb/actions/uiactiondata.ts: MuseScore's UI actions (the UiAction definitions in the
 * src/ ** /*uiactions.cpp files: code, title, description, icon, checkable), the icon codes of the MuseScore icon font
 * (src/framework/ui/view/iconcodes.h) and the default shortcuts (src/app/configs/data/shortcuts.xml and
 * shortcuts_mac.xml). Titles are kept as translatable strings (context, source text, disambiguation, arguments).
 *
 * usage: tsx tools/gen/gen-uiactions.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-uiactions.ts <MuseScore source dir>')
    process.exit(1)
}

/** a translatable string: [context, source, disambiguation?, args?]; an untranslatable one: [null, text] */
type TS = [string | null, string, string?, TS[]?]

interface Action {
    code: string
    title?: TS
    description?: TS
    icon?: number
    checkable?: boolean
}

// ---------------------------------------------------------------------------------
//   icon codes
// ---------------------------------------------------------------------------------

const icons = new Map<string, number>()
for (const m of readFileSync(join(src, 'src/framework/ui/view/iconcodes.h'), 'utf8').matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(0[xX][0-9A-Fa-f]+)/gm)) {
    icons.set(m[1], parseInt(m[2], 16))
}

// ---------------------------------------------------------------------------------
//   a small tokenizer for C++ argument lists
// ---------------------------------------------------------------------------------

function cppString(lit: string): string {
    return lit.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

/** splits the text between balanced parentheses at top-level commas */
function splitArgs(s: string): string[] {
    const out: string[] = []
    let depth = 0
    let cur = ''
    let inStr = false
    for (let i = 0; i < s.length; ++i) {
        const c = s[i]
        if (inStr) {
            cur += c
            if (c === '\\') {
                cur += s[++i]
            } else if (c === '"') {
                inStr = false
            }
            continue
        }
        if (c === '"') {
            inStr = true
        } else if (c === '(' || c === '{' || c === '[') {
            depth++
        } else if (c === ')' || c === '}' || c === ']') {
            depth--
        } else if (c === ',' && depth === 0) {
            out.push(cur.trim())
            cur = ''
            continue
        }
        cur += c
    }
    if (cur.trim()) {
        out.push(cur.trim())
    }
    return out
}

/** the index after the parenthesis that closes the one at `open` */
function closingParen(s: string, open: number): number {
    let depth = 0
    let inStr = false
    for (let i = open; i < s.length; ++i) {
        const c = s[i]
        if (inStr) {
            if (c === '\\') {
                i++
            } else if (c === '"') {
                inStr = false
            }
        } else if (c === '"') {
            inStr = true
        } else if (c === '(') {
            depth++
        } else if (c === ')' && --depth === 0) {
            return i + 1
        }
    }
    return -1
}

function stripComments(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1')
}

/** adjacent string literals are concatenated */
function stringValue(expr: string): string | null {
    const lits = expr.match(/"(?:[^"\\]|\\.)*"/g)
    if (!lits || expr.replace(/"(?:[^"\\]|\\.)*"/g, '').trim()) {
        return null
    }
    return lits.map(cppString).join('')
}

const unresolved = new Set<string>()

function parseTs(expr: string, consts: Map<string, TS>): TS | undefined {
    expr = expr.trim()
    // X.arg(a, b)
    const argM = /^([\s\S]*?)\.arg\(([\s\S]*)\)$/.exec(expr)
    if (argM && closingParen(expr, expr.length - argM[2].length - 2) === expr.length) {
        const base = parseTs(argM[1], consts)
        if (!base) {
            return undefined
        }
        const args = splitArgs(argM[2]).map(a => /^\d+$/.test(a) ? [null, a] as TS
            : parseTs(a, consts) ?? (stringValue(a) !== null ? [null, stringValue(a)!] as TS : undefined))
        if (args.some(a => !a)) {
            unresolved.add(expr)
            return undefined
        }
        return [base[0], base[1], base[2] ?? '', [...(base[3] ?? []), ...args as TS[]]]
    }
    let m = /^(?:muse::)?TranslatableString\(([\s\S]*)\)$/.exec(expr)
    if (m) {
        const a = splitArgs(m[1]).map(stringValue)
        if (a.length >= 2 && a.every(x => x !== null)) {
            return a[2] ? [a[0]!, a[1]!, a[2]] : [a[0]!, a[1]!]
        }
        unresolved.add(expr)
        return undefined
    }
    m = /^(?:muse::)?TranslatableString::untranslatable\(([\s\S]*)\)$/.exec(expr)
    if (m && stringValue(m[1]) !== null) {
        return [null, stringValue(m[1])!]
    }
    if (/^\w+$/.test(expr) && consts.has(expr)) {
        return consts.get(expr)
    }
    unresolved.add(expr)
    return undefined
}

function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) {
            if (f !== 'web' && f !== 'stubs') {
                walk(p, out)
            }
        } else if (f.endsWith('uiactions.cpp')) {
            out.push(p)
        }
    }
    return out
}

// ---------------------------------------------------------------------------------
//   the actions
// ---------------------------------------------------------------------------------

const actions = new Map<string, Action>()
const files = walk(join(src, 'src'))
for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'))
    // constants: static const ActionCode X("..."); static const TranslatableString X = TranslatableString(...);
    const codes = new Map<string, string>()
    for (const m of text.matchAll(/(?:static\s+)?const\s+(?:muse::actions::)?ActionCode\s+(\w+)\s*(?:\(\s*("(?:[^"\\]|\\.)*")\s*\)|=\s*("(?:[^"\\]|\\.)*"))/g)) {
        codes.set(m[1], cppString(m[2] ?? m[3]))
    }
    const consts = new Map<string, TS>()
    for (const m of text.matchAll(/(?:static\s+)?const\s+(?:muse::)?TranslatableString\s+(\w+)\s*=\s*([^;]+);/g)) {
        const ts = parseTs(m[2], consts)
        if (ts) {
            consts.set(m[1], ts)
        }
    }
    for (const m of text.matchAll(/\bUiAction\s*\(/g)) {
        const open = m.index! + m[0].length - 1
        const end = closingParen(text, open)
        const args = splitArgs(text.slice(open + 1, end - 1))
        if (!args.length) {
            continue
        }
        const code = stringValue(args[0]) ?? codes.get(args[0])
        if (code === undefined) {
            continue // e.g. a declaration
        }
        const a: Action = { code }
        const strings: TS[] = []
        for (const arg of args.slice(1)) {
            if (/^IconCode::Code::(\w+)$/.test(arg)) {
                a.icon = icons.get(/^IconCode::Code::(\w+)$/.exec(arg)![1])
            } else if (/Checkable::Yes/.test(arg)) {
                a.checkable = true
            } else if (/TranslatableString|\.arg\(|^[a-z_]\w*$|^[A-Z][A-Za-z0-9_]*$/.test(arg) && !/^(mu|muse)::/.test(arg)
                && !/^(UiCtx|CTX_|Checkable)/.test(arg)) {
                const ts = parseTs(arg, consts)
                if (ts) {
                    strings.push(ts)
                }
            }
        }
        if (strings[0]) {
            a.title = strings[0]
        }
        if (strings[1]) {
            a.description = strings[1]
        }
        if (!actions.has(code)) {
            actions.set(code, a)
        }
    }
}

// ---------------------------------------------------------------------------------
//   shortcuts
// ---------------------------------------------------------------------------------

// QKeySequence::StandardKey (<std>) -> the key sequences Qt uses for it (Windows/Linux; macOS)
const STANDARD_KEYS: Record<number, [string[], string[]]> = {
    3: [['Ctrl+O'], ['Ctrl+O']], // Open
    4: [['Ctrl+W', 'Ctrl+F4'], ['Ctrl+W']], // Close
    5: [['Ctrl+S'], ['Ctrl+S']], // Save
    11: [['Ctrl+Z'], ['Ctrl+Z']], // Undo
    12: [['Ctrl+Y', 'Ctrl+Shift+Z'], ['Ctrl+Shift+Z']], // Redo
    22: [['Ctrl+F'], ['Ctrl+F']], // Find
}

function readShortcuts(file: string, mac: boolean): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const m of readFileSync(join(src, file), 'utf8').matchAll(/<SC>([\s\S]*?)<\/SC>/g)) {
        const key = /<key>([^<]*)<\/key>/.exec(m[1])?.[1]
        const std = /<std>(\d+)<\/std>/.exec(m[1])
        const seqs = [...m[1].matchAll(/<seq>([^<]*)<\/seq>/g)].map(s => s[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
        if (std && STANDARD_KEYS[Number(std[1])]) {
            seqs.push(...STANDARD_KEYS[Number(std[1])][mac ? 1 : 0])
        } else if (std) {
            console.log(`unknown standard key ${std[1]} of ${key}`)
        }
        if (key && seqs.length) {
            out[key] = seqs
        }
    }
    return out
}

const shortcuts = readShortcuts('src/app/configs/data/shortcuts.xml', false)
const shortcutsMac = readShortcuts('src/app/configs/data/shortcuts_mac.xml', true)

const sorted = [...actions.values()].sort((a, b) => a.code.localeCompare(b.code))
const iconEntries = [...icons].sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync('musescoreweb/actions/uiactiondata.ts', `/*
 * SPDX-License-Identifier: GPL-3.0-only
 * GENERATED by tools/gen/gen-uiactions.ts from MuseScore's *uiactions.cpp, iconcodes.h and shortcuts*.xml - do not edit
 */

/** a translatable string: [context, source text, disambiguation, arguments]; [null, text] is not translated */
export type TrString = readonly [string | null, string, string?, (readonly TrString[])?]

export interface UiActionData {
    readonly code: string
    readonly title?: TrString
    readonly description?: TrString
    /** code point in the MuseScore icon font */
    readonly icon?: number
    readonly checkable?: boolean
}

export const UI_ACTIONS: readonly UiActionData[] = [
${sorted.map(a => `    ${JSON.stringify(a)},`).join('\n')}
]

/** IconCode::Code */
export const ICON_CODES: Readonly<Record<string, number>> = {
${iconEntries.map(([k, v]) => `    ${k}: 0x${v.toString(16).toUpperCase()},`).join('\n')}
}

/** default shortcuts (Qt key sequences; on macOS "Ctrl" is the Command key) */
export const SHORTCUTS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(shortcuts, null, 4)}

export const SHORTCUTS_MAC: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(shortcutsMac, null, 4)}
`)
console.log(`${sorted.length} actions from ${files.length} files (${files.map(f => relative(src, f)).length}), ${icons.size} icons, `
    + `${Object.keys(shortcuts).length} shortcuts`)
if (unresolved.size) {
    console.log(`unresolved strings (${unresolved.size}):\n  ${[...unresolved].slice(0, 30).join('\n  ')}`)
}
