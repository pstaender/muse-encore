/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The markers of the comments on the pages (the library's commentMarkers: inches from the top left of a page), used by
 * the editor and the viewer: buttons on the page elements (in percent of the page, so they follow the zoom). The
 * markers are subtle (light gray, multiplied with the page, so they do not cover the notation); a marker the pointer
 * is on and the active comment (clicked, or selected in the editor's Comments panel) are highlighted and in front. A
 * marker shows the comment's text (markdown.ts; nothing for an empty text) while the pointer is on it and keeps
 * showing it when it is clicked. The active marker (and a dragged one) moved from its default place is connected with
 * the point it is attached to by a line (like an articulation with its note), with a little space at both ends. Draggable markers (the editor) report the moved offset in spatium.
 */
import { COMMENT_ICON_PATH } from '../icons'
import { commentPlainText, createCommentPopover } from './markdown'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface CommentMarkerData {
    id: string
    page: number
    x: number
    y: number
    width: number
    height: number
    /** the spatium in inches */
    spatium: number
    /** the point the comment is attached to (inches) */
    anchorX: number
    anchorY: number
    /** the marker is not at its default place: the line to the anchor is shown */
    moved: boolean
    text: string
}

export interface CommentMarkersOptions {
    pageElement: (page: number) => HTMLElement | null | undefined
    pageInches: (page: number) => { width: number; height: number } | null
    /** a click on a marker (not a drag) */
    onClick?: (id: string) => void
    /** a marker was dragged: the change of its offset in spatium; without it, markers cannot be dragged */
    onMove?: (id: string, ddx: number, ddy: number) => void
}

/** a drag starts after this distance in CSS pixels */
const DRAG_THRESHOLD = 3
/** the space between the line and the element / the marker, in spatium */
const LINE_GAP = 0.5

interface MarkerItem {
    el: HTMLButtonElement
    data: CommentMarkerData
    /** the line to the anchor (an SVG over the page in inches) */
    line: SVGSVGElement | null
}

export class CommentMarkersView {
    private m_markers = new Map<string, MarkerItem>()
    private m_popover: HTMLDivElement | null = null
    private m_popoverId = ''
    private m_active = ''
    private m_pinned = false

    constructor(private readonly m_opts: CommentMarkersOptions) {}

    /** shows these markers (replaces all) */
    update(markers: readonly CommentMarkerData[]): void {
        this.clear()
        for (const m of markers) {
            const pageEl = this.m_opts.pageElement(m.page)
            const size = this.m_opts.pageInches(m.page)
            if (!pageEl || !size) {
                continue
            }
            const el = this.makeMarker(m)
            Object.assign(el.style, {
                left: `${m.x / size.width * 100}%`, top: `${m.y / size.height * 100}%`,
                width: `${m.width / size.width * 100}%`, height: `${m.height / size.height * 100}%`,
            })
            const item: MarkerItem = { el, data: m, line: null }
            this.m_markers.set(m.id, item)
            if (m.moved) {
                this.setLine(item, 0, 0)
            }
            pageEl.appendChild(el)
        }
        this.updateClasses()
        if (this.m_pinned && this.m_markers.has(this.m_active)) {
            this.showPopover(this.m_active)
        }
    }

    clear(): void {
        this.removePopover()
        for (const { el, line } of this.m_markers.values()) {
            el.remove()
            line?.remove()
        }
        this.m_markers.clear()
    }

    /** the active comment (highlighted, in front); with `pin` its text is shown until closePopover() */
    setActive(id: string, pin = false): void {
        this.m_active = id
        this.m_pinned = pin && !!id
        this.updateClasses()
        if (this.m_pinned) {
            this.showPopover(id)
        } else if (this.m_popoverId && this.m_popoverId !== id) {
            this.removePopover()
        }
    }

    active(): string { return this.m_active }

    /** hides the pinned text (a click elsewhere) */
    closePopover(): void {
        this.m_pinned = false
        this.removePopover()
    }

    private updateClasses(): void {
        for (const [id, { el, line }] of this.m_markers) {
            el.classList.toggle('active', id === this.m_active)
            line?.classList.toggle('active', id === this.m_active)
        }
    }

    /**
     * the line from the anchor to the tail of the marker, moved by (dx, dy) CSS pixels (a drag); created if
     * needed. A marker without offset that is not dragged has no line.
     */
    private setLine(item: MarkerItem, dxPx: number, dyPx: number): void {
        const m = item.data
        const pageEl = this.m_opts.pageElement(m.page)
        const size = this.m_opts.pageInches(m.page)
        if (!pageEl || !size) {
            return
        }
        const cssWidth = pageEl.getBoundingClientRect().width
        const f = cssWidth > 0 ? size.width / cssWidth : 0
        // the tip of the bubble's tail (COMMENT_ICON_PATH: (5, 21) of 24)
        const x2 = m.x + m.width * 5 / 24 + dxPx * f
        const y2 = m.y + m.height * 21 / 24 + dyPx * f
        if (!item.line) {
            const doc = pageEl.ownerDocument
            const svg = doc.createElementNS(SVG_NS, 'svg')
            svg.classList.add('comment-line')
            svg.setAttribute('aria-hidden', 'true')
            svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`)
            svg.setAttribute('preserveAspectRatio', 'none')
            const line = doc.createElementNS(SVG_NS, 'line')
            line.setAttribute('vector-effect', 'non-scaling-stroke')
            svg.append(line)
            // under its marker
            if (item.el.parentElement === pageEl) {
                item.el.before(svg)
            } else {
                pageEl.appendChild(svg)
            }
            item.line = svg
        }
        // a gap at both ends (to the element and to the marker); no line if they are closer
        const gap = LINE_GAP * m.spatium
        const dx = x2 - m.anchorX
        const dy = y2 - m.anchorY
        const len = Math.hypot(dx, dy)
        const line = item.line.firstElementChild!
        const t = len > 2 * gap ? gap / len : 0.5
        line.setAttribute('x1', String(m.anchorX + dx * t))
        line.setAttribute('y1', String(m.anchorY + dy * t))
        line.setAttribute('x2', String(x2 - dx * t))
        line.setAttribute('y2', String(y2 - dy * t))
    }

    private showPopover(id: string): void {
        const m = this.m_markers.get(id)
        if (!m || !m.data.text.trim()) {
            this.removePopover()
            return
        }
        if (this.m_popoverId === id && this.m_popover?.isConnected) {
            return
        }
        this.removePopover()
        const p = createCommentPopover(m.data.text, m.el.ownerDocument)
        p.style.left = m.el.style.left
        p.style.top = `calc(${m.el.style.top} + ${m.el.style.height})`
        m.el.after(p)
        this.m_popover = p
        this.m_popoverId = id
    }

    private removePopover(): void {
        this.m_popover?.remove()
        this.m_popover = null
        this.m_popoverId = ''
    }

    private makeMarker(m: CommentMarkerData): HTMLButtonElement {
        const doc = this.m_opts.pageElement(m.page)!.ownerDocument
        const el = doc.createElement('button')
        el.type = 'button'
        el.className = 'comment-marker'
        el.dataset.comment = m.id
        const plain = commentPlainText(m.text).trim()
        el.setAttribute('aria-label', plain || 'Comment')
        const svg = doc.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('aria-hidden', 'true')
        const path = doc.createElementNS(SVG_NS, 'path')
        path.setAttribute('d', COMMENT_ICON_PATH)
        svg.append(path)
        el.append(svg)

        const item = (): MarkerItem | undefined => this.m_markers.get(m.id)
        el.addEventListener('pointerenter', () => this.showPopover(m.id))
        el.addEventListener('pointerleave', () => {
            if (this.m_pinned && this.m_markers.has(this.m_active)) {
                this.showPopover(this.m_active)
            } else {
                this.removePopover()
            }
        })
        // not a click on the score (selection, panning)
        for (const type of ['mousedown', 'dblclick', 'contextmenu'] as const) {
            el.addEventListener(type, e => e.stopPropagation())
        }
        let drag: { pointer: number; x: number; y: number; moved: boolean } | null = null
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
            if (e.button !== 0 || !this.m_opts.onMove) {
                return
            }
            drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
            el.setPointerCapture(e.pointerId)
        })
        el.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.pointer) {
                return
            }
            const dx = e.clientX - drag.x
            const dy = e.clientY - drag.y
            if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
                return
            }
            if (!drag.moved) {
                drag.moved = true
                el.classList.add('dragging')
                this.removePopover()
            }
            el.style.translate = `${dx}px ${dy}px`
            // the connection with the anchor while dragging (also from the default place)
            const it = item()
            if (it) {
                this.setLine(it, dx, dy)
                it.line?.classList.add('dragging')
            }
        })
        const endDrag = (e: PointerEvent, cancel: boolean): void => {
            if (!drag || e.pointerId !== drag.pointer) {
                return
            }
            const d = drag
            drag = null
            el.classList.remove('dragging')
            el.style.translate = ''
            const it = item()
            if (it?.line) {
                it.line.classList.remove('dragging')
                if (it.data.moved) {
                    this.setLine(it, 0, 0)
                } else {
                    it.line.remove()
                    it.line = null
                }
            }
            if (!d.moved || cancel) {
                return
            }
            // CSS pixels -> inches of the page -> spatium
            const pageEl = el.parentElement
            const size = this.m_opts.pageInches(m.page)
            const width = pageEl?.getBoundingClientRect().width ?? 0
            if (!size || width <= 0) {
                return
            }
            const toSpatium = size.width / width / m.spatium
            el.dataset.dragged = '1' // the click that follows the drag
            this.m_opts.onMove?.(m.id, (e.clientX - d.x) * toSpatium, (e.clientY - d.y) * toSpatium)
        }
        el.addEventListener('pointerup', e => endDrag(e, false))
        el.addEventListener('pointercancel', e => endDrag(e, true))
        el.addEventListener('click', (e) => {
            e.stopPropagation()
            if (el.dataset.dragged) {
                delete el.dataset.dragged
                return
            }
            this.m_opts.onClick?.(m.id)
        })
        return el
    }
}
