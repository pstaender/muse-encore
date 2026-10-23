/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Generates src/notationscene/editstyleui.ts: the widget tree of MuseScore's Style dialog
 * (src/notationscene/widgets/editstyle.ui, Qt Designer XML) with the properties the web dialog renders: widget
 * classes and object names, texts (translation context "EditStyleBase"), numeric properties of spin boxes, combo box
 * and list items, check states, layouts (grid positions, box layouts, spacers), stacked widget pages, scroll areas.
 *
 * usage: tsx tools/gen/gen-editstyle.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-editstyle.ts <MuseScore source dir>')
    process.exit(1)
}

// ---------------------------------------------------------------------------------
//   a minimal XML parser (Qt Designer files: elements, attributes, text; no CDATA/DTD)
// ---------------------------------------------------------------------------------

interface XNode {
    tag: string
    attrs: Record<string, string>
    children: XNode[]
    text: string
}

function unescape(s: string): string {
    return s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, e: string, d?: string, h?: string) => {
        if (d) {
            return String.fromCodePoint(parseInt(d, 10))
        }
        if (h) {
            return String.fromCodePoint(parseInt(h, 16))
        }
        return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e]
    })
}

function parseXml(xml: string): XNode {
    const root: XNode = { tag: '#root', attrs: {}, children: [], text: '' }
    const stack: XNode[] = [root]
    const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    for (const m of xml.matchAll(re)) {
        if (m[5] !== undefined) {
            stack[stack.length - 1].text += unescape(m[5])
            continue
        }
        if (!m[2]) {
            continue
        }
        if (m[1]) {
            stack.pop()
            continue
        }
        const attrs: Record<string, string> = {}
        for (const a of (m[3] ?? '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
            attrs[a[1]] = unescape(a[2])
        }
        const node: XNode = { tag: m[2], attrs, children: [], text: '' }
        stack[stack.length - 1].children.push(node)
        if (!m[4]) {
            stack.push(node)
        }
    }
    return root
}

const child = (n: XNode, tag: string): XNode | undefined => n.children.find(c => c.tag === tag)
const children = (n: XNode, tag: string): XNode[] => n.children.filter(c => c.tag === tag)

// ---------------------------------------------------------------------------------
//   conversion
// ---------------------------------------------------------------------------------

type UiString = string | { s: string; d?: string; notr?: true }

function uiString(n: XNode): UiString | undefined {
    if (n.tag !== 'string') {
        return undefined
    }
    const s = n.text
    if (n.attrs.notr === 'true') {
        return { s, notr: true }
    }
    if (n.attrs.comment) {
        return { s, d: n.attrs.comment }
    }
    return s
}

const STRING_PROPS = new Set(['text', 'title', 'toolTip', 'suffix', 'prefix', 'windowTitle', 'specialValueText', 'placeholderText'])
const NUMBER_PROPS = new Set(['minimum', 'maximum', 'singleStep', 'decimals', 'value', 'currentIndex'])
const BOOL_PROPS = new Set(['checked', 'checkable', 'flat', 'wordWrap', 'readOnly', 'enabled', 'visible'])

function props(w: XNode): Record<string, unknown> {
    const p: Record<string, unknown> = {}
    for (const prop of children(w, 'property')) {
        const name = prop.attrs.name
        const v = prop.children[0]
        if (!v) {
            continue
        }
        if (STRING_PROPS.has(name)) {
            const s = uiString(v)
            if (s !== undefined && (typeof s !== 'string' || s.length)) {
                p[name] = s
            }
        } else if (NUMBER_PROPS.has(name) && (v.tag === 'number' || v.tag === 'double')) {
            p[name] = Number(v.text)
        } else if (BOOL_PROPS.has(name) && v.tag === 'bool') {
            p[name] = v.text === 'true'
        } else if (name === 'orientation' && v.tag === 'enum') {
            p.orientation = v.text.endsWith('Vertical') ? 'v' : 'h'
        } else if (name === 'textFormat' && v.tag === 'enum') {
            p.textFormat = v.text.replace(/.*::/, '')
        } else if (name === 'alignment' && v.tag === 'set') {
            p.alignment = v.text.split('|').map(s => s.replace(/.*::/, '')).join('|')
        } else if ((name === 'minimumSize' || name === 'maximumSize') && v.tag === 'size') {
            const wv = Number(child(v, 'width')?.text ?? 0)
            const hv = Number(child(v, 'height')?.text ?? 0)
            const pre = name === 'minimumSize' ? 'min' : 'max'
            if (wv > 0 && wv < 16777215) {
                p[`${pre}W`] = wv
            }
            if (hv > 0 && hv < 16777215) {
                p[`${pre}H`] = hv
            }
        }
    }
    return p
}

interface UiWidget {
    c: string
    n: string
    p?: Record<string, unknown>
    l?: UiLayout
    w?: UiWidget[]
    i?: UiString[]
}

interface UiLayoutItem {
    r?: number
    col?: number
    rs?: number
    cs?: number
    w?: UiWidget
    l?: UiLayout
    s?: 'h' | 'v'
}

interface UiLayout {
    c: string
    i: UiLayoutItem[]
}

function widget(w: XNode): UiWidget {
    const c = w.attrs.class.replace(/^mu::notation::|^muse::uicomponents::|^Awl::/, '')
    const out: UiWidget = { c, n: w.attrs.name }
    const p = props(w)
    if (Object.keys(p).length) {
        out.p = p
    }
    const items = children(w, 'item').map(it => {
        const t = children(it, 'property').find(pp => pp.attrs.name === 'text')
        return (t && t.children[0] && uiString(t.children[0])) ?? ''
    })
    if (items.length) {
        out.i = items
    }
    const l = child(w, 'layout')
    if (l) {
        out.l = layout(l)
    }
    const ws = children(w, 'widget')
    if (ws.length) {
        out.w = ws.map(widget)
    }
    return out
}

function layout(l: XNode): UiLayout {
    const items: UiLayoutItem[] = []
    for (const it of children(l, 'item')) {
        const item: UiLayoutItem = {}
        if (it.attrs.row !== undefined) {
            item.r = Number(it.attrs.row)
        }
        if (it.attrs.column !== undefined) {
            item.col = Number(it.attrs.column)
        }
        if (it.attrs.rowspan !== undefined) {
            item.rs = Number(it.attrs.rowspan)
        }
        if (it.attrs.colspan !== undefined) {
            item.cs = Number(it.attrs.colspan)
        }
        const w = child(it, 'widget')
        const sl = child(it, 'layout')
        const sp = child(it, 'spacer')
        if (w) {
            item.w = widget(w)
        } else if (sl) {
            item.l = layout(sl)
        } else if (sp) {
            item.s = (props(sp).orientation as 'h' | 'v' | undefined) ?? 'h'
        } else {
            continue
        }
        items.push(item)
    }
    return { c: l.attrs.class, i: items }
}

const ui = parseXml(readFileSync(join(src, 'src/notationscene/widgets/editstyle.ui'), 'utf8'))
const dialog = child(child(ui, 'ui')!, 'widget')!

function find(n: XNode, name: string): XNode | null {
    if (n.tag === 'widget' && n.attrs.name === name) {
        return n
    }
    for (const c of n.children) {
        const r = find(c, name)
        if (r) {
            return r
        }
    }
    return null
}

const pageList = widget(find(dialog, 'pageList')!)
const pageStack = widget(find(dialog, 'pageStack')!)

/** compact output: leaf widgets and layout items on one line, containers (layouts, child widgets) spread over lines */
function isContainer(v: unknown): boolean {
    return !!v && typeof v === 'object' && !Array.isArray(v) && ('l' in v || 'w' in v || 'i' in v && Array.isArray((v as UiLayout).i)
        && (v as UiLayout).i.some(x => typeof x === 'object' && x !== null && ('w' in x || 'l' in x)))
}

function serialize(v: unknown, indent: string): string {
    if (Array.isArray(v)) {
        if (!v.some(x => isContainer(x) || (typeof x === 'object' && x !== null && ('w' in x || 'l' in x)))) {
            return JSON.stringify(v)
        }
        const inner = indent + '  '
        return `[\n${v.map(x => inner + serialize(x, inner)).join(',\n')},\n${indent}]`
    }
    if (v && typeof v === 'object') {
        const entries = Object.entries(v)
        const leaf = !entries.some(([, x]) => isContainer(x) || Array.isArray(x) && x.some(y => typeof y === 'object' && y !== null && ('w' in y || 'l' in y || 'c' in y)))
        if (leaf) {
            return JSON.stringify(v)
        }
        const inner = indent + '  '
        return `{\n${entries.map(([k, x]) => `${inner}${k}: ${serialize(x, inner)}`).join(',\n')},\n${indent}}`
    }
    return JSON.stringify(v)
}

const header = `/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * GENERATED by tools/gen/gen-editstyle.ts from src/notationscene/widgets/editstyle.ui - do not edit manually!
 * The widgets of MuseScore's Style dialog: the page list and the pages of the page stack. Strings are translatable in
 * the context "EditStyleBase" (an object: with disambiguation, or not translatable).
 */

/** a translatable text (context "EditStyleBase"); { s, d }: with disambiguation; { s, notr }: not translatable */
export type UiString = string | { s: string; d?: string; notr?: true }

export interface UiProps {
    text?: UiString
    title?: UiString
    toolTip?: UiString
    suffix?: UiString
    prefix?: UiString
    specialValueText?: UiString
    placeholderText?: UiString
    minimum?: number
    maximum?: number
    singleStep?: number
    decimals?: number
    value?: number
    currentIndex?: number
    checked?: boolean
    checkable?: boolean
    flat?: boolean
    wordWrap?: boolean
    readOnly?: boolean
    enabled?: boolean
    visible?: boolean
    orientation?: 'h' | 'v'
    textFormat?: string
    alignment?: string
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
}

/** a widget: class (without namespace), object name, properties, layout, child widgets (pages, scroll area contents), items */
export interface UiWidget {
    c: string
    n: string
    p?: UiProps
    l?: UiLayout
    w?: UiWidget[]
    i?: UiString[]
}

/** an item of a layout (grid position r/col with spans rs/cs): a widget, a sub layout or a spacer (s: orientation) */
export interface UiLayoutItem {
    r?: number
    col?: number
    rs?: number
    cs?: number
    w?: UiWidget
    l?: UiLayout
    s?: 'h' | 'v'
}

export interface UiLayout {
    c: string
    i: UiLayoutItem[]
}

`

const body = `export const PAGE_LIST: UiWidget = ${serialize(pageList, '')}

export const PAGE_STACK: UiWidget = ${serialize(pageStack, '')}
`

writeFileSync('src/notationscene/editstyleui.ts', header + body)
console.log(`wrote src/notationscene/editstyleui.ts (${(header.length + body.length) >> 10} KB)`)
