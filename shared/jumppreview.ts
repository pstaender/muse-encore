// SPDX-License-Identifier: GPL-3.0-only
// Not in MuseScore: the preview of the bar after a jump in the continuous view (horizontal), in both apps. When the bar
// played next is reached by a jump (a repeat, D.C./D.S., a coda, a volta) and is not in the view, it is shown at the
// right edge of the view: drawn from its page, set off from the score by a soft shadow (like the continuous panel at
// the left edge) and marked with its bar number. It is an element on the page (like the panel), placed at the right edge
// of the view each time the view or the play position changes.
import { drawPage, type Score } from '../src/index'
import type { PageBarRect } from './pageturn'

/** the space shown around the bar, in inches */
const PADDING = 0.15
/** the preview covers at most this part of the view's width */
const MAX_VIEW_PART = 0.4

/** true if the whole bar (inches on its page) is in the view (CSS pixels of the page element) */
export function barIsInView(viewport: HTMLElement, pageEl: HTMLElement, pageWidthInches: number, bar: PageBarRect): boolean {
    const pr = pageEl.getBoundingClientRect()
    const vr = viewport.getBoundingClientRect()
    const f = pr.width / pageWidthInches
    const left = pr.left + bar.x * f
    const right = left + bar.width * f
    return left >= vr.left - 1 && right <= vr.left + viewport.clientWidth + 1
}

/**
 * true if `next` is not the bar after `current` in the score (a jump; continuous view: on one page, bars side by side)
 */
export function isJump(current: PageBarRect, next: PageBarRect): boolean {
    return next.page !== current.page || Math.abs(next.x - (current.x + current.width)) > 0.01
}

export class JumpPreview {
    readonly el: HTMLDivElement
    private readonly m_canvas: HTMLCanvasElement
    private readonly m_label: HTMLSpanElement
    private m_key = ''
    private m_width = 0

    /** `printing`: drawn like the pages of the app (the editor: false, invisible elements grey) */
    constructor(private readonly m_printing = true, doc: Document = document) {
        this.el = doc.createElement('div')
        this.el.className = 'jump-preview'
        this.el.setAttribute('aria-hidden', 'true')
        this.m_canvas = doc.createElement('canvas')
        this.m_label = doc.createElement('span')
        this.m_label.className = 'jump-preview-label'
        this.el.append(this.m_canvas, this.m_label)
    }

    /** the width the preview covers at the right edge of the view (CSS pixels; 0: not shown) */
    width(): number {
        return this.el.isConnected ? this.m_width : 0
    }

    /**
     * shows a bar (inches on its page) at the right edge of the view, on the page element `pageEl` of the view (the
     * continuous view has one page); `number`: the bar number shown. Returns the width it covers (CSS pixels).
     */
    show(score: Score, viewport: HTMLElement, pageEl: HTMLElement, pageIdx: number, pageSize: { width: number; height: number },
         bar: PageBarRect, number: number): number {
        const pr = pageEl.getBoundingClientRect()
        const f = pr.width / pageSize.width
        const widthCss = Math.min(Math.round((bar.width + 2 * PADDING) * f), Math.round(viewport.clientWidth * MAX_VIEW_PART))
        const heightCss = pr.height
        const dpr = window.devicePixelRatio || 1
        const key = `${bar.page}|${bar.x}|${widthCss}|${heightCss}|${f.toFixed(4)}|${dpr}|${number}`
        if (key !== this.m_key) {
            this.m_key = key
            const dpi = f * dpr
            const w = Math.max(1, Math.round(widthCss * dpr))
            const h = Math.max(1, Math.round(heightCss * dpr))
            this.m_canvas.width = w
            this.m_canvas.height = h
            Object.assign(this.m_canvas.style, { width: `${widthCss}px`, height: `${heightCss}px` })
            const ctx = this.m_canvas.getContext('2d')
            if (ctx) {
                drawPage(score, pageIdx, ctx, {
                    dpi, pixelRatio: dpr, printing: this.m_printing,
                    region: { x: (bar.x - PADDING) * dpi, y: 0, width: w, height: h },
                })
            }
            this.m_label.textContent = String(number)
        }
        this.m_width = widthCss
        // at the right edge of the view, in the page's coordinates
        const vr = viewport.getBoundingClientRect()
        const left = vr.left + viewport.clientWidth - widthCss - pr.left
        Object.assign(this.el.style, { left: `${left}px`, width: `${widthCss}px`, height: `${heightCss}px` })
        if (this.el.parentElement !== pageEl) {
            pageEl.appendChild(this.el)
        }
        return widthCss
    }

    hide(): void {
        this.el.remove()
        this.m_key = ''
        this.m_width = 0
    }
}
