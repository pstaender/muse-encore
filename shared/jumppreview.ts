// SPDX-License-Identifier: GPL-3.0-only
// Not in MuseScore: the preview of the bar after a jump in the continuous view (horizontal), in both apps. When the
// playback or the playalong will jump (a repeat, D.C./D.S., a coda, a volta) within the next JUMP_PREVIEW_BARS bars to a
// bar that is not in the view, that bar and the bars after it (up to the right edge of the view) are shown directly
// after the bar the jump is made from (over the bars that are skipped): drawn from its page, set off from the score by a soft shadow (like the continuous panel at the left edge)
// and marked with its bar number. It is an element on the page. For the page turning it takes the place of the bar after
// the jump (bars ahead: pageturn.ts), so the view keeps it visible like the bar played next.
import { drawPage, type Score } from '../src/index'
import { MAX_PAGE_TURN_BARS, type PageBarRect } from './pageturn'

/** the preview is shown when the jump is made from the current bar or one of the next bars up to this many */
export const JUMP_PREVIEW_BARS = 2
/** the bars played next that the apps look at (the page turning, the preview: with the bar after the jump) */
export const BARS_AHEAD = Math.max(MAX_PAGE_TURN_BARS, JUMP_PREVIEW_BARS + 1)

/** the space shown before the bar, in inches */
const PADDING = 0.15

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

/**
 * the first jump in the bars played: the index in `bars` (the current bar, then the bars played next) of the bar the
 * jump is made from, if it is at most JUMP_PREVIEW_BARS bars ahead and there is a bar after it; -1: none
 */
export function jumpIndex(bars: readonly PageBarRect[]): number {
    for (let i = 0; i + 1 < bars.length && i <= JUMP_PREVIEW_BARS; ++i) {
        if (isJump(bars[i], bars[i + 1])) {
            return i
        }
    }
    return -1
}

export class JumpPreview {
    readonly el: HTMLDivElement
    private readonly m_canvas: HTMLCanvasElement
    private readonly m_label: HTMLSpanElement
    private m_key = ''

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

    /**
     * shows the bar `target` (inches on its page) directly after the bar `after` on the page element `pageEl` (the
     * continuous view has one page), with the bars after it up to the right edge of the view; `number`: the bar number
     * shown. Returns the place of the target bar (inches on the page of `after`), for the page turning.
     */
    show(score: Score, viewport: HTMLElement, pageEl: HTMLElement, pageSize: { width: number; height: number },
         target: PageBarRect, after: PageBarRect, number: number): PageBarRect {
        const pr = pageEl.getBoundingClientRect()
        const vr = viewport.getBoundingClientRect()
        const f = pr.width / pageSize.width
        const x = after.x + after.width
        const barWidth = target.width + PADDING
        // up to the right edge of the view (at least the target bar), not beyond the end of the score
        const toViewEdge = (vr.left + viewport.clientWidth - pr.left) / f - x
        const widthIn = Math.min(Math.max(barWidth, toViewEdge), pageSize.width - target.x + PADDING)
        const widthCss = Math.round(widthIn * f)
        const heightCss = pr.height
        const dpr = window.devicePixelRatio || 1
        const key = `${target.page}|${target.x}|${widthCss}|${heightCss}|${f.toFixed(4)}|${dpr}|${number}`
        if (key !== this.m_key) {
            this.m_key = key
            const dpi = f * dpr
            const w = Math.max(1, Math.round(widthCss * dpr))
            const h = Math.max(1, Math.round(heightCss * dpr))
            this.m_canvas.width = w
            this.m_canvas.height = h
            Object.assign(this.m_canvas.style, { width: '100%', height: '100%' })
            const ctx = this.m_canvas.getContext('2d')
            if (ctx) {
                drawPage(score, target.page, ctx, {
                    dpi, pixelRatio: dpr, printing: this.m_printing,
                    region: { x: (target.x - PADDING) * dpi, y: 0, width: w, height: h },
                })
            }
            this.m_label.textContent = String(number)
        }
        // in percent of the page (follows the zoom like the other elements on the page)
        Object.assign(this.el.style, { left: `${x / pageSize.width * 100}%`, width: `${widthCss / f / pageSize.width * 100}%`, height: '100%' })
        if (this.el.parentElement !== pageEl) {
            pageEl.appendChild(this.el)
        }
        return { page: after.page, x, y: after.y, width: barWidth, height: after.height }
    }

    hide(): void {
        this.el.remove()
        this.m_key = ''
    }
}
