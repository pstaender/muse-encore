/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The markers of the comments on the pages (the library's commentMarkers: inches from the top left of a page), used by
 * the editor and the viewer: buttons on the page elements (in percent of the page, so they follow the zoom). A marker
 * shows the comment's text (markdown.ts) while the pointer is on it, and keeps showing it when it is clicked (the
 * active comment, highlighted and in front). Subtle markers (light gray, behind the notation's colors) do not cover
 * the score; the active one is never subtle. Draggable markers (the editor) report the moved offset in spatium.
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

export class CommentMarkersView {
    private m_markers = new Map<string, { el: HTMLButtonElement; data: CommentMarkerData }>()
    private m_popover: HTMLDivElement | null = null
    private m_popoverId = ''
    private m_active = ''
    private m_pinned = false
    private m_subtle = false

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
            pageEl.appendChild(el)
            this.m_markers.set(m.id, { el, data: m })
        }
        this.updateClasses()
        if (this.m_pinned && this.m_markers.has(this.m_active)) {
            this.showPopover(this.m_active)
        }
    }

    clear(): void {
        this.removePopover()
        for (const { el } of this.m_markers.values()) {
            el.remove()
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

    setSubtle(subtle: boolean): void {
        this.m_subtle = subtle
        this.updateClasses()
    }

    /** hides the pinned text (a click elsewhere) */
    closePopover(): void {
        this.m_pinned = false
        this.removePopover()
    }

    private updateClasses(): void {
        for (const [id, { el }] of this.m_markers) {
            el.classList.toggle('active', id === this.m_active)
            el.classList.toggle('subtle', this.m_subtle && id !== this.m_active)
        }
    }

    private showPopover(id: string): void {
        const m = this.m_markers.get(id)
        if (!m) {
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
        const plain = commentPlainText(m.text)
        el.setAttribute('aria-label', plain || 'Comment')
        const svg = doc.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('aria-hidden', 'true')
        const path = doc.createElementNS(SVG_NS, 'path')
        path.setAttribute('d', COMMENT_ICON_PATH)
        svg.append(path)
        el.append(svg)

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
        })
        const endDrag = (e: PointerEvent, cancel: boolean): void => {
            if (!drag || e.pointerId !== drag.pointer) {
                return
            }
            const d = drag
            drag = null
            el.classList.remove('dragging')
            el.style.translate = ''
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
            this.m_opts.onMove?.(m.id, (e.clientX - d.x) * toSpatium, (e.clientY - d.y) * toSpatium)
            el.dataset.dragged = '1' // the click that follows the drag
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
