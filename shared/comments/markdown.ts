/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The text of a comment (the library's comments/api.ts) with a little markdown: **bold** and __bold__, *italic* and
 * _italic_, ~~strikethrough~~ (nested, "\" escapes a marker; "_" inside a word is no marker, like snake_case); line
 * breaks are kept. Rendered as DOM nodes (never as HTML: the text is the user's). Used by the editor and the viewer.
 */

export type CommentInline = string | { tag: 'strong' | 'em' | 's'; children: CommentInline[] }

const MARKERS: readonly { d: string; tag: 'strong' | 'em' | 's' }[] = [
    { d: '**', tag: 'strong' }, { d: '__', tag: 'strong' }, { d: '~~', tag: 's' }, { d: '*', tag: 'em' }, { d: '_', tag: 'em' },
]

const ESCAPABLE = new Set(['\\', '*', '_', '~'])
const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c)
const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c)

/** the index of the marker that closes `d` opened before `from`, or -1 */
function findClose(s: string, from: number, d: string): number {
    for (let j = from; j < s.length; ++j) {
        if (s[j] === '\\' && ESCAPABLE.has(s[j + 1])) {
            ++j
            continue
        }
        if (!s.startsWith(d, j) || j === from || isSpace(s[j - 1])) {
            continue
        }
        // a single marker is not the half of a double one ("*a **b** c*")
        if (d.length === 1 && s[j + 1] === d) {
            ++j
            continue
        }
        if (d === '_' && isWordChar(s[j + 1])) {
            continue
        }
        // a longer run of the marker ("***" after "**bold *italic"): the closing marker is its end
        let end = j + d.length
        while (d.length > 1 && s[end] === d[0]) {
            ++end
        }
        return end - d.length
    }
    return -1
}

export function parseCommentMarkdown(s: string): CommentInline[] {
    const out: CommentInline[] = []
    let text = ''
    let i = 0
    const flush = (): void => {
        if (text) {
            out.push(text)
            text = ''
        }
    }
    outer: while (i < s.length) {
        if (s[i] === '\\' && ESCAPABLE.has(s[i + 1])) {
            text += s[i + 1]
            i += 2
            continue
        }
        for (const { d, tag } of MARKERS) {
            if (!s.startsWith(d, i) || isSpace(s[i + d.length])) {
                continue
            }
            if (d === '_' || d === '__') {
                if (isWordChar(s[i - 1])) {
                    continue
                }
            }
            const j = findClose(s, i + d.length, d)
            if (j < 0) {
                continue
            }
            flush()
            out.push({ tag, children: parseCommentMarkdown(s.slice(i + d.length, j)) })
            i = j + d.length
            continue outer
        }
        text += s[i]
        ++i
    }
    flush()
    return out
}

function appendInline(parent: Node, items: readonly CommentInline[], doc: Document): void {
    for (const it of items) {
        if (typeof it === 'string') {
            const lines = it.split('\n')
            lines.forEach((line, i) => {
                if (i > 0) {
                    parent.appendChild(doc.createElement('br'))
                }
                if (line) {
                    parent.appendChild(doc.createTextNode(line))
                }
            })
        } else {
            const el = doc.createElement(it.tag)
            appendInline(el, it.children, doc)
            parent.appendChild(el)
        }
    }
}

/** the text of a comment as DOM nodes */
export function renderCommentText(text: string, doc: Document = document): DocumentFragment {
    const f = doc.createDocumentFragment()
    appendInline(f, parseCommentMarkdown(text), doc)
    return f
}

/** the text without the markers (for labels and tooltips) */
export function commentPlainText(text: string): string {
    const plain = (items: readonly CommentInline[]): string => items.map(it => typeof it === 'string' ? it : plain(it.children)).join('')
    return plain(parseCommentMarkdown(text))
}

/** the element that shows a comment's text next to its marker (class comment-popover; the apps style it) */
export function createCommentPopover(text: string, doc: Document = document): HTMLDivElement {
    const p = doc.createElement('div')
    p.className = 'comment-popover'
    p.setAttribute('role', 'tooltip')
    p.appendChild(renderCommentText(text, doc))
    for (const type of ['pointerdown', 'mousedown', 'dblclick', 'click', 'contextmenu'] as const) {
        p.addEventListener(type, e => e.stopPropagation())
    }
    return p
}
