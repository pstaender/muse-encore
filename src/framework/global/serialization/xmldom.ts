/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/serialization/xmldom.h/.cpp (XmlDomDocument, XmlDomNode, XmlDomElement,
 * XmlDomAttribute; C++ wraps pugixml). The document is built from the tokens of the XmlStreamReader. Like pugixml with
 * its default options, comments, processing instructions and whitespace-only text are not kept (unlike pugixml,
 * whitespace-only CDATA sections are dropped too).
 */

import { TokenType, XmlStreamReader } from '../../../engraving/rw/xmlreader'

const enum NodeType { Element, Text }

interface NodeData {
    type: NodeType
    name: string // the element name or the text
    attrs: { name: string; value: string }[]
    parent: NodeData | null
    children: NodeData[]
    index: number // in parent.children
}

export class XmlDomNode {
    protected readonly m_node: NodeData | null

    constructor(node: NodeData | null = null) {
        this.m_node = node
    }

    isNull(): boolean { return !this.m_node }

    nodeName(): string { return this.m_node ? this.m_node.name : '' }

    hasChildNodes(): boolean { return !!this.m_node && this.m_node.children.length > 0 }

    firstChild(): XmlDomNode {
        return new XmlDomNode(this.m_node?.children[0] ?? null)
    }

    /** the first child element (with this name if given) */
    firstChildElement(name?: string | null): XmlDomElement {
        if (!this.m_node) {
            return new XmlDomElement(null)
        }
        for (const c of this.m_node.children) {
            if (c.type === NodeType.Element && (!name || c.name === name)) {
                return new XmlDomElement(c)
            }
        }
        return new XmlDomElement(null)
    }

    nextSibling(): XmlDomNode {
        const n = this.m_node
        return new XmlDomNode(n && n.parent ? n.parent.children[n.index + 1] ?? null : null)
    }

    previousSibling(): XmlDomNode {
        const n = this.m_node
        return new XmlDomNode(n && n.parent ? n.parent.children[n.index - 1] ?? null : null)
    }

    parent(): XmlDomNode {
        return new XmlDomNode(this.m_node?.parent ?? null)
    }

    nextSiblingElement(name?: string | null): XmlDomElement {
        const n = this.m_node
        if (!n || !n.parent) {
            return new XmlDomElement(null)
        }
        const siblings = n.parent.children
        for (let i = n.index + 1; i < siblings.length; ++i) {
            const s = siblings[i]
            if (s.type === NodeType.Element && (!name || s.name === name)) {
                return new XmlDomElement(s)
            }
        }
        return new XmlDomElement(null)
    }

    previousSiblingElement(name?: string | null): XmlDomElement {
        const n = this.m_node
        if (!n || !n.parent) {
            return new XmlDomElement(null)
        }
        const siblings = n.parent.children
        for (let i = n.index - 1; i >= 0; --i) {
            const s = siblings[i]
            if (s.type === NodeType.Element && (!name || s.name === name)) {
                return new XmlDomElement(s)
            }
        }
        return new XmlDomElement(null)
    }

    toElement(): XmlDomElement {
        return new XmlDomElement(this.m_node && this.m_node.type === NodeType.Element ? this.m_node : null)
    }
}

export class XmlDomElement extends XmlDomNode {
    /** the text (and CDATA) children, concatenated */
    text(): string {
        const e = this.m_node
        if (!e || e.type !== NodeType.Element) {
            return ''
        }
        let result = ''
        for (const c of e.children) {
            if (c.type === NodeType.Text) {
                result += c.name
            }
        }
        return result
    }

    firstAttribute(): XmlDomAttribute {
        const e = this.m_node
        return new XmlDomAttribute(e && e.type === NodeType.Element && e.attrs.length ? e : null, 0)
    }

    attribute(name: string): XmlDomAttribute {
        const e = this.m_node
        if (!e || e.type !== NodeType.Element) {
            return new XmlDomAttribute(null, 0)
        }
        const i = e.attrs.findIndex(a => a.name === name)
        return new XmlDomAttribute(i >= 0 ? e : null, i)
    }
}

export class XmlDomAttribute {
    constructor(private readonly m_node: NodeData | null, private readonly m_index: number) {}

    isNull(): boolean { return !this.m_node }

    attributeName(): string { return this.m_node ? this.m_node.attrs[this.m_index].name : '' }

    value(): string { return this.m_node ? this.m_node.attrs[this.m_index].value : '' }

    nextAttribute(): XmlDomAttribute {
        const n = this.m_node
        return new XmlDomAttribute(n && this.m_index + 1 < n.attrs.length ? n : null, this.m_index + 1)
    }
}

export class XmlDomDocument {
    private m_root: NodeData | null = null
    private m_error = ''
    private m_triedLoad = false

    setContent(data: Uint8Array | string): void {
        this.m_root = null
        this.m_error = ''
        this.m_triedLoad = true

        const reader = new XmlStreamReader(data)
        const doc: NodeData = { type: NodeType.Element, name: '', attrs: [], parent: null, children: [], index: 0 }
        let cur = doc
        const append = (n: NodeData): void => {
            n.parent = cur
            n.index = cur.children.length
            cur.children.push(n)
        }
        for (;;) {
            const t = reader.readNext()
            if (t === TokenType.EndDocument || t === TokenType.Invalid) {
                break
            }
            if (t === TokenType.StartElement) {
                const e: NodeData = {
                    type: NodeType.Element, name: reader.name(), attrs: reader.attributes().map(a => ({ name: a.name, value: a.value })),
                    parent: null, children: [], index: 0,
                }
                append(e)
                cur = e
            } else if (t === TokenType.EndElement) {
                if (!cur.parent || cur.name !== reader.name()) {
                    this.m_error = 'Start-end tags mismatch'
                    break
                }
                cur = cur.parent
            } else if (t === TokenType.Characters) {
                const text = reader.text()
                if (cur !== doc && !/^\s*$/.test(text)) {
                    const last = cur.children[cur.children.length - 1]
                    if (last && last.type === NodeType.Text) {
                        last.name += text
                    } else {
                        append({ type: NodeType.Text, name: text, attrs: [], parent: null, children: [], index: 0 })
                    }
                }
            }
        }
        if (!this.m_error && cur !== doc) {
            this.m_error = 'Start-end tags mismatch'
        }
        const root = doc.children.find(c => c.type === NodeType.Element)
        if (!root && !this.m_error) {
            this.m_error = 'No document element found'
        }
        this.m_root = this.m_error ? null : root ?? null
    }

    rootElement(): XmlDomElement {
        return new XmlDomElement(this.m_root)
    }

    hasError(): boolean { return this.m_triedLoad && this.m_error !== '' }

    errorString(): string { return this.m_error }
}
