// SPDX-License-Identifier: GPL-3.0-only
// The comparison of two scores (not in MuseScore) in both apps, read only: score A and score B in one of three modes
// - side by side: A on the left, B on the right (the continuous view (horizontal): A above B); what only A has is light
//   blue, what only B has a firmer blue, like the removed and added lines of a text diff
// - split screen: B over A, A is shown left of a divider that can be moved, B right of it (for almost equal scores)
// - overlay: B over A with an opacity (differences of the layout)
// A and B can be swapped (and so their colors). The page view and the continuous views are shown like in the viewer
// (zoom at the pointer, dragging moves the view); the pages are drawn as tiles of their visible part.
// Plain DOM in a shadow root (the viewer has no React; the editor shows it over its score view).
import {
    compareScores, defaultInstrumentPairs, diffInstruments, diffMeasuresBounds, drawDiffPage, layoutScore, pageCount, pageSize,
    sameInstruments, setViewMode, showOnlyInstruments,
    type DiffColors, type DiffInstrumentPair, type DiffSideMarks, type MasterScore, type ScoreDiffResult, type ViewMode,
} from '../../src/index'
import { SWAP_ICON, svgIcon } from '../icons'
import css from './diffview.css?inline'

export type DiffMode = 'side-by-side' | 'split' | 'overlay'

export interface DiffScore {
    score: MasterScore
    name: string
}

export interface ScoreDiffViewOptions {
    /** translates the English texts of the view (default: none) */
    tr?: (text: string) => string
    viewMode?: ViewMode
    mode?: DiffMode
    /** the color scheme of the controls; default 'auto' */
    colorScheme?: 'auto' | 'light' | 'dark'
    onClose?: () => void
}

const CSS_DPI = 96
const ZOOM_LEVELS = [10, 15, 25, 50, 75, 100, 150, 200, 400, 800]
const MIN_ZOOM = 5
const MAX_ZOOM = 1600
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
const GAP = 24

/** the marks of A (a light blue) and B (a firmer blue) on the pages; the controls use the same tones (diffview.css) */
const COLORS_A: DiffColors = { item: '#6c9cf2', background: 'rgba(108, 156, 242, 0.13)' }
const COLORS_B: DiffColors = { item: '#3066FD', background: 'rgba(42, 106, 216, 0.22)' }

// MuseScore's icon codes (src/framework/ui/view/iconcodes.h)
const ICON = { close: '&#xEF14;', zoomOut: '&#xEF16;', zoomIn: '&#xEF18;', prev: '&#xEF37;', next: '&#xEF36;', instruments: '&#xEF55;' }

interface Side {
    score: MasterScore
    name: string
    /** the visibility of the parts in the file */
    originalShow: boolean[]
}

interface PageEl {
    el: HTMLDivElement
    canvas: HTMLCanvasElement
    /** 0: the score on the left (A), 1: the one on the right (B) */
    role: 0 | 1
    page: number
}

function esc(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function isMouseWheel(e: WheelEvent): boolean {
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return true
    }
    return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50
}

export class ScoreDiffView {
    readonly host: HTMLDivElement
    private readonly shadow: ShadowRoot
    private readonly tr: (s: string) => string
    private readonly opts: ScoreDiffViewOptions
    private readonly abort = new AbortController()

    /** the two scores as given: sides[0] is A unless swapped */
    private readonly sides: [Side, Side]
    private swapped = false
    /** the instruments compared, as part indices of sides[0] / sides[1] */
    private pairs: DiffInstrumentPair[]
    private result: ScoreDiffResult | null = null
    private mode: DiffMode
    private viewMode: ViewMode
    /** a percentage, or 'fit': the pages as wide as the view */
    private zoomSetting: number | 'fit' = 'fit'
    private zoom = 100
    private opacity = 0.5
    private split = 0.5
    private highlight = true
    private hunkIdx = -1

    private readonly viewport: HTMLDivElement
    private readonly content: HTMLDivElement
    private readonly divider: HTMLDivElement
    private readonly message: HTMLDivElement
    private readonly zoomSelect: HTMLSelectElement
    private readonly dialog: HTMLDialogElement
    private pageEls: PageEl[] = []
    private renderTimer = 0
    private reflowTimer = 0
    private scrollFrame = 0
    private destroyed = false
    private resizeObserver: ResizeObserver | null = null

    constructor(parent: HTMLElement, a: DiffScore, b: DiffScore, options: ScoreDiffViewOptions = {}) {
        this.opts = options
        this.tr = options.tr ?? (s => s)
        this.mode = options.mode ?? 'side-by-side'
        this.viewMode = options.viewMode ?? 'page'
        const side = (d: DiffScore): Side => ({ score: d.score, name: d.name, originalShow: d.score.parts().map(p => p.show()) })
        this.sides = [side(a), side(b)]
        this.pairs = defaultInstrumentPairs(a.score, b.score)

        this.host = document.createElement('div')
        this.host.className = 'muse-encore-diff'
        if (options.colorScheme === 'light' || options.colorScheme === 'dark') {
            this.host.dataset.theme = options.colorScheme
        }
        this.shadow = this.host.attachShadow({ mode: 'open' })
        this.shadow.innerHTML = `<style>${css}</style>${this.template()}`
        parent.appendChild(this.host)

        const $ = <T extends HTMLElement>(id: string): T => this.shadow.getElementById(id) as T
        this.viewport = $('viewport')
        this.content = $('content')
        this.divider = $('divider')
        this.message = $('message')
        this.zoomSelect = $('zoom')
        this.dialog = $('instruments-dialog')
        this.initControls()

        // before the instruments that are not compared are hidden
        const differ = !sameInstruments(a.score, b.score)
        this.applyInstruments()
        this.updateControls()
        // the view has its size once it is in the document
        requestAnimationFrame(() => {
            if (this.destroyed) {
                return
            }
            this.relayout()
            if (differ) {
                this.showInstrumentsDialog(true)
            }
        })
    }

    destroy(): void {
        if (this.destroyed) {
            return
        }
        this.destroyed = true
        this.abort.abort()
        this.resizeObserver?.disconnect()
        clearTimeout(this.renderTimer)
        clearTimeout(this.reflowTimer)
        cancelAnimationFrame(this.scrollFrame)
        // the scores are copies, but restore what was changed anyway
        for (const s of this.sides) {
            showOnlyInstruments(s.score, null, s.originalShow)
        }
        this.host.remove()
    }

    // ---------------------------------------------------------------------------------
    //   the controls
    // ---------------------------------------------------------------------------------

    private template(): string {
        const t = (s: string): string => esc(this.tr(s))
        return `
<div class="toolbar" role="toolbar" aria-label="${t('Compare scores')}">
    <div class="group files">
        <span class="file a" id="name-a"></span>
        <button id="swap" class="icon" title="${t('Swap scores')}" aria-label="${t('Swap scores')}">${svgIcon(SWAP_ICON)}</button>
        <span class="file b" id="name-b"></span>
    </div>
    <div class="group">
        <div class="segmented" role="radiogroup" aria-label="${t('Comparison mode')}">
            <button role="radio" data-mode="side-by-side">${t('Side by side')}</button>
            <button role="radio" data-mode="split">${t('Split screen')}</button>
            <button role="radio" data-mode="overlay">${t('Overlay')}</button>
        </div>
        <label class="opacity" id="opacity-group">${t('Opacity')}
            <input id="opacity" type="range" min="0" max="100" step="1" value="50" aria-label="${t('Opacity')}">
        </label>
        <label class="check"><input id="highlight" type="checkbox" checked> ${t('Highlight differences')}</label>
    </div>
    <div class="group">
        <button id="prev" class="icon" title="${t('Previous difference')}" aria-label="${t('Previous difference')}">${ICON.prev}</button>
        <span id="hunk-info" class="hunk-info" aria-live="polite"></span>
        <button id="next" class="icon" title="${t('Next difference')}" aria-label="${t('Next difference')}">${ICON.next}</button>
    </div>
    <div class="group">
        <select id="view-mode" aria-label="${t('View mode')}" title="${t('View mode')}">
            <option value="page">${t('Page view')}</option>
            <option value="continuous-horizontal">${t('Continuous view (horizontal)')}</option>
            <option value="continuous-vertical">${t('Continuous view (vertical)')}</option>
            <option value="fit-width">${t('Continuous view (fit to window)')}</option>
        </select>
        <button id="zoom-out" class="icon" title="${t('Zoom out')}" aria-label="${t('Zoom out')}">${ICON.zoomOut}</button>
        <select id="zoom" aria-label="${t('Zoom')}" title="${t('Zoom')}"></select>
        <button id="zoom-in" class="icon" title="${t('Zoom in')}" aria-label="${t('Zoom in')}">${ICON.zoomIn}</button>
    </div>
    <div class="group end">
        <button id="instruments" class="text">${t('Instruments…')}</button>
        <button id="close" class="icon" title="${t('Close comparison')}" aria-label="${t('Close comparison')}">${ICON.close}</button>
    </div>
</div>
<div class="stage" id="stage">
    <div id="viewport" class="viewport" tabindex="0" aria-label="${t('Compare scores')}">
        <div id="content" class="content"></div>
    </div>
    <div id="divider" class="divider" hidden>
        <span class="divider-label a">A</span><span class="divider-label b">B</span>
        <div class="divider-handle" id="divider-handle" role="slider" tabindex="0" aria-label="${t('Split screen')}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
    <div id="message" class="message" hidden></div>
</div>
<dialog id="instruments-dialog" aria-labelledby="instruments-title">
    <h2 id="instruments-title">${t('Instruments to compare')}</h2>
    <p id="instruments-intro" class="muted"></p>
    <table class="instruments">
        <thead><tr><th>A <span id="dialog-name-a" class="muted"></span></th><th>B <span id="dialog-name-b" class="muted"></span></th></tr></thead>
        <tbody id="instruments-rows"></tbody>
    </table>
    <form method="dialog" class="dialog-buttons">
        <button value="cancel" class="secondary">${t('Cancel')}</button>
        <button value="ok" class="primary">${t('Compare')}</button>
    </form>
</dialog>`
    }

    private initControls(): void {
        const signal = this.abort.signal
        const $ = <T extends HTMLElement>(id: string): T => this.shadow.getElementById(id) as T
        for (const b of this.shadow.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
            b.addEventListener('click', () => this.setMode(b.dataset.mode as DiffMode), { signal })
        }
        $('swap').addEventListener('click', () => this.swap(), { signal })
        $<HTMLInputElement>('opacity').addEventListener('input', e => {
            this.opacity = Number((e.target as HTMLInputElement).value) / 100
            this.applyLayerStyles()
        }, { signal })
        $<HTMLInputElement>('highlight').addEventListener('change', e => {
            this.highlight = (e.target as HTMLInputElement).checked
            this.invalidate()
        }, { signal })
        $('prev').addEventListener('click', () => this.stepHunk(-1), { signal })
        $('next').addEventListener('click', () => this.stepHunk(1), { signal })
        $<HTMLSelectElement>('view-mode').addEventListener('change', e => {
            this.viewMode = (e.target as HTMLSelectElement).value as ViewMode
            this.relayout()
        }, { signal })
        $('zoom-out').addEventListener('click', () => this.zoomStep(-1), { signal })
        $('zoom-in').addEventListener('click', () => this.zoomStep(1), { signal })
        this.zoomSelect.addEventListener('change', () => {
            const v = this.zoomSelect.value
            this.setZoom(v === 'fit' ? 'fit' : Number(v))
        }, { signal })
        $('instruments').addEventListener('click', () => this.showInstrumentsDialog(false), { signal })
        $('close').addEventListener('click', () => this.opts.onClose ? this.opts.onClose() : this.destroy(), { signal })

        const vp = this.viewport
        vp.addEventListener('scroll', () => {
            if (!this.scrollFrame) {
                this.scrollFrame = requestAnimationFrame(() => {
                    this.scrollFrame = 0
                    this.updateSplitClip()
                })
            }
            this.scheduleRender(60)
        }, { passive: true, signal })
        vp.addEventListener('wheel', e => {
            if (e.ctrlKey || e.metaKey || isMouseWheel(e) && !e.shiftKey) {
                e.preventDefault()
                const factor = Math.exp(-e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? (isMouseWheel(e) ? 0.002 : 0.01) : 0.05))
                this.zoomAt(this.zoom * factor, e.clientX, e.clientY)
            }
        }, { passive: false, signal })
        // dragging moves the view
        vp.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.pointerType === 'touch') {
                return
            }
            const start = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop }
            vp.setPointerCapture(e.pointerId)
            vp.classList.add('dragging')
            const move = (ev: PointerEvent): void => {
                vp.scrollLeft = start.left - (ev.clientX - start.x)
                vp.scrollTop = start.top - (ev.clientY - start.y)
            }
            const up = (): void => {
                vp.classList.remove('dragging')
                vp.removeEventListener('pointermove', move)
                vp.removeEventListener('pointerup', up)
                vp.removeEventListener('pointercancel', up)
            }
            vp.addEventListener('pointermove', move)
            vp.addEventListener('pointerup', up)
            vp.addEventListener('pointercancel', up)
        }, { signal })
        vp.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
                e.preventDefault()
                this.zoomStep(1)
            } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault()
                this.zoomStep(-1)
            }
        }, { signal })

        // the divider of the split screen
        const handle = $('divider-handle')
        handle.addEventListener('pointerdown', e => {
            e.preventDefault()
            handle.setPointerCapture(e.pointerId)
            const move = (ev: PointerEvent): void => {
                const r = vp.getBoundingClientRect()
                this.split = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, vp.clientWidth)))
                this.updateSplitClip()
            }
            const up = (): void => {
                handle.removeEventListener('pointermove', move)
                handle.removeEventListener('pointerup', up)
            }
            handle.addEventListener('pointermove', move)
            handle.addEventListener('pointerup', up)
        }, { signal })
        handle.addEventListener('keydown', e => {
            const step = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0
            if (step) {
                e.preventDefault()
                this.split = Math.max(0, Math.min(1, this.split + step))
                this.updateSplitClip()
            }
        }, { signal })

        this.dialog.addEventListener('close', () => {
            if (this.dialog.returnValue === 'ok') {
                this.pairs = this.dialogPairs()
                this.applyInstruments()
                this.relayout()
            }
        }, { signal })

        this.resizeObserver = new ResizeObserver(() => {
            if (this.viewMode === 'fit-width') {
                clearTimeout(this.reflowTimer)
                this.reflowTimer = window.setTimeout(() => this.relayout(), 150)
            } else {
                this.place()
            }
        })
        this.resizeObserver.observe(vp)

        for (const level of ZOOM_LEVELS) {
            const o = document.createElement('option')
            o.value = String(level)
            o.textContent = `${level}%`
            this.zoomSelect.appendChild(o)
        }
        const fit = document.createElement('option')
        fit.value = 'fit'
        fit.textContent = this.tr('Fit to width')
        this.zoomSelect.prepend(fit)
    }

    private left(): Side {
        return this.sides[this.swapped ? 1 : 0]
    }

    private right(): Side {
        return this.sides[this.swapped ? 0 : 1]
    }

    /** the marks of the left and the right score */
    private marks(role: 0 | 1): DiffSideMarks | null {
        if (!this.result || !this.highlight) {
            return null
        }
        const first = role === 0 ? !this.swapped : this.swapped
        return first ? this.result.a : this.result.b
    }

    private updateControls(): void {
        const $ = (id: string): HTMLElement => this.shadow.getElementById(id)!
        const fileLabel = (role: 'A' | 'B', s: Side): string => `<span class="badge">${role}</span><span class="name">${esc(s.name)}</span>`
        $('name-a').innerHTML = fileLabel('A', this.left())
        $('name-a').title = this.left().name
        $('name-b').innerHTML = fileLabel('B', this.right())
        $('name-b').title = this.right().name
        for (const b of this.shadow.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
            b.setAttribute('aria-checked', String(b.dataset.mode === this.mode))
        }
        $('opacity-group').hidden = this.mode !== 'overlay'
        ;($('view-mode') as HTMLSelectElement).value = this.viewMode
        this.updateHunkInfo()
        this.updateZoomSelect()
    }

    private updateHunkInfo(): void {
        const $ = (id: string): HTMLElement => this.shadow.getElementById(id)!
        const n = this.result?.hunks.length ?? 0
        $('hunk-info').textContent = !this.result ? '' : n === 0 ? this.tr('No differences')
            : this.hunkIdx < 0 ? (n === 1 ? this.tr('1 difference') : this.tr('%1 differences').replace('%1', String(n)))
            : this.tr('Difference %1 of %2').replace('%1', String(this.hunkIdx + 1)).replace('%2', String(n))
        ;($('prev') as HTMLButtonElement).disabled = n === 0
        ;($('next') as HTMLButtonElement).disabled = n === 0
    }

    private updateZoomSelect(): void {
        const custom = this.zoomSelect.querySelector('option[data-custom]')
        const fit = this.zoomSelect.querySelector<HTMLOptionElement>('option[value="fit"]')
        if (fit) {
            fit.hidden = this.viewMode === 'fit-width'
            fit.textContent = this.tr(this.viewMode === 'continuous-horizontal' ? 'Fit to height' : 'Fit to width')
        }
        if (this.zoomSetting === 'fit' && this.viewMode !== 'fit-width') {
            custom?.remove()
            this.zoomSelect.value = 'fit'
            return
        }
        const level = ZOOM_LEVELS.find(l => Math.abs(l - this.zoom) < 0.5)
        if (level !== undefined) {
            custom?.remove()
            this.zoomSelect.value = String(level)
            return
        }
        let o = custom as HTMLOptionElement | null
        if (!o) {
            o = document.createElement('option')
            o.dataset.custom = '1'
            this.zoomSelect.prepend(o)
        }
        o.value = String(this.zoom)
        o.textContent = `${Math.round(this.zoom)}%`
        this.zoomSelect.value = o.value
    }

    private setMode(mode: DiffMode): void {
        if (mode === this.mode) {
            return
        }
        // the fit-to-window width depends on the number of columns
        this.mode = mode
        this.updateControls()
        if (this.viewMode === 'fit-width') {
            this.relayout()
        } else {
            this.build()
        }
    }

    private swap(): void {
        this.swapped = !this.swapped
        this.hunkIdx = -1
        this.updateControls()
        this.build()
    }

    // ---------------------------------------------------------------------------------
    //   instruments
    // ---------------------------------------------------------------------------------

    /** shows only the compared instruments and compares the scores */
    private applyInstruments(): void {
        const [s0, s1] = this.sides
        showOnlyInstruments(s0.score, this.pairs.map(p => p.a), s0.originalShow)
        showOnlyInstruments(s1.score, this.pairs.map(p => p.b), s1.originalShow)
        layoutScore(s0.score)
        layoutScore(s1.score)
        this.result = this.pairs.length ? compareScores(s0.score, s1.score, this.pairs) : null
        this.hunkIdx = -1
        this.message.hidden = !!this.pairs.length
        this.message.textContent = this.pairs.length ? '' : this.tr('No instruments are compared.')
        this.updateControls()
    }

    private showInstrumentsDialog(differ: boolean): void {
        const $ = (id: string): HTMLElement => this.shadow.getElementById(id)!
        const left = this.left()
        const right = this.right()
        $('instruments-intro').textContent = differ
            ? this.tr('The scores have different instruments. Choose the instrument of score B that is compared with each instrument of score A.')
            : this.tr('Choose the instrument of score B that is compared with each instrument of score A.')
        $('dialog-name-a').textContent = left.name
        $('dialog-name-b').textContent = right.name
        const rows = $('instruments-rows')
        rows.replaceChildren()
        const listA = diffInstruments(left.score)
        const listB = diffInstruments(right.score)
        // the pairs in the left/right order
        const pairs = this.pairs.map(p => this.swapped ? { a: p.b, b: p.a } : p)
        for (const ia of listA) {
            const tr = document.createElement('tr')
            const name = document.createElement('td')
            name.textContent = ia.name
            const cell = document.createElement('td')
            const select = document.createElement('select')
            select.dataset.a = String(ia.index)
            select.setAttribute('aria-label', ia.name)
            const none = document.createElement('option')
            none.value = ''
            none.textContent = this.tr('(not compared)')
            select.appendChild(none)
            for (const ib of listB) {
                const o = document.createElement('option')
                o.value = String(ib.index)
                o.textContent = ib.name
                select.appendChild(o)
            }
            select.value = String(pairs.find(p => p.a === ia.index)?.b ?? '')
            // an instrument of B is compared with one instrument of A only
            select.addEventListener('change', () => {
                for (const other of rows.querySelectorAll('select')) {
                    if (other !== select && other.value === select.value) {
                        other.value = ''
                    }
                }
            })
            cell.appendChild(select)
            tr.append(name, cell)
            rows.appendChild(tr)
        }
        this.dialog.showModal()
    }

    /** the pairs chosen in the dialog, as part indices of sides[0] / sides[1] */
    private dialogPairs(): DiffInstrumentPair[] {
        const pairs: DiffInstrumentPair[] = []
        for (const select of this.shadow.querySelectorAll<HTMLSelectElement>('#instruments-rows select')) {
            if (select.value === '') {
                continue
            }
            const l = Number(select.dataset.a)
            const r = Number(select.value)
            pairs.push(this.swapped ? { a: r, b: l } : { a: l, b: r })
        }
        return pairs.sort((p, q) => p.a - q.a)
    }

    // ---------------------------------------------------------------------------------
    //   layout of the pages
    // ---------------------------------------------------------------------------------

    private columns(): number {
        return this.mode === 'side-by-side' && this.viewMode !== 'continuous-horizontal' ? 2 : 1
    }

    /** lays both scores out in the view mode (the "fit to window" width: the width of a column) and shows them */
    private relayout(): void {
        if (this.destroyed) {
            return
        }
        const cssDpi = CSS_DPI * this.zoom / 100
        const cols = this.columns()
        const width = Math.max(1, (this.viewport.clientWidth - (cols + 1) * GAP) / cols / cssDpi)
        for (const s of this.sides) {
            setViewMode(s.score, this.viewMode, this.viewMode === 'fit-width' ? width : 0)
        }
        this.updateControls()
        this.build()
    }

    private computeZoom(): number {
        if (this.zoomSetting !== 'fit') {
            return this.zoomSetting
        }
        if (this.viewMode === 'fit-width') {
            return 100
        }
        // the size of the content is linear in the zoom: pages * zoom + gaps; the long pages of the continuous view
        // (horizontal) are fitted into the height of the view, else the pages into its width
        const vertical = this.viewMode === 'continuous-horizontal'
        const size100 = this.contentSize(100)
        const size200 = this.contentSize(200)
        const at100 = vertical ? size100.height : size100.width
        const pages = (vertical ? size200.height : size200.width) - at100
        const gaps = at100 - pages
        if (pages <= 0) {
            return 100
        }
        const avail = (vertical ? this.viewport.clientHeight : this.viewport.clientWidth) - 2
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (avail - gaps) / pages * 100))
    }

    /** the positions of the pages in inches (at `cssDpi` 1 inch = cssDpi px) and the size of the content */
    private geometry(): { pages: { role: 0 | 1; page: number; x: number; y: number; w: number; h: number }[]; width: number; height: number } {
        const g = GAP / CSS_DPI // the gap in inches at 100%: scaled with the pages
        const gap = g * 100 / Math.max(1, this.zoom)
        const scores = [this.left().score, this.right().score]
        const sizes = scores.map(s => Array.from({ length: s.npages() ? pageCount(s) : 0 }, (_, i) => pageSize(s, i)))
        const pages: { role: 0 | 1; page: number; x: number; y: number; w: number; h: number }[] = []
        const n = Math.max(sizes[0].length, sizes[1].length)
        if (this.mode === 'side-by-side' && this.viewMode === 'continuous-horizontal') {
            // the long pages of the horizontal view below each other
            let y = gap
            let width = 0
            for (const role of [0, 1] as const) {
                const size = sizes[role][0]
                if (size) {
                    pages.push({ role, page: 0, x: gap, y, w: size.width, h: size.height })
                    y += size.height + gap
                    width = Math.max(width, size.width)
                }
            }
            return { pages, width: width + 2 * gap, height: y }
        }
        const two = this.columns() === 2
        const colW = [0, 1].map(r => Math.max(0, ...sizes[r].map(s => s.width)))
        const totalW = two ? colW[0] + colW[1] + gap : Math.max(colW[0], colW[1])
        let y = gap
        for (let i = 0; i < n; ++i) {
            let h = 0
            for (const role of [0, 1] as const) {
                const size = sizes[role][i]
                if (!size) {
                    continue
                }
                // centered in its column
                const colX = two ? (role === 0 ? gap : gap + colW[0] + gap) : gap
                const cw = two ? colW[role] : totalW
                pages.push({ role, page: i, x: colX + (cw - size.width) / 2, y, w: size.width, h: size.height })
                h = Math.max(h, size.height)
            }
            y += h + gap
        }
        return { pages, width: totalW + 2 * gap, height: y }
    }

    /** the size of the content in px at a zoom */
    private contentSize(zoom: number): { width: number; height: number } {
        const saved = this.zoom
        this.zoom = zoom
        const geo = this.geometry()
        this.zoom = saved
        return { width: geo.width * CSS_DPI * zoom / 100, height: geo.height * CSS_DPI * zoom / 100 }
    }

    /** creates the page elements */
    private build(): void {
        this.content.replaceChildren()
        this.pageEls = []
        this.zoom = this.computeZoom()
        for (const p of this.geometry().pages) {
            const el = document.createElement('div')
            el.className = `page ${p.role === 0 ? 'a' : 'b'}`
            const canvas = document.createElement('canvas')
            el.appendChild(canvas)
            this.content.appendChild(el)
            this.pageEls.push({ el, canvas, role: p.role, page: p.page })
        }
        this.content.classList.toggle('stacked', this.mode !== 'side-by-side')
        this.divider.hidden = this.mode !== 'split'
        this.place()
        this.applyLayerStyles()
    }

    /** positions the pages for the current zoom */
    private place(): void {
        if (this.zoomSetting === 'fit') {
            this.zoom = this.computeZoom()
        }
        const cssDpi = CSS_DPI * this.zoom / 100
        const geo = this.geometry()
        this.content.style.width = `${geo.width * cssDpi}px`
        this.content.style.height = `${geo.height * cssDpi}px`
        geo.pages.forEach((p, i) => {
            const pe = this.pageEls[i]
            if (!pe) {
                return
            }
            Object.assign(pe.el.style, {
                left: `${p.x * cssDpi}px`, top: `${p.y * cssDpi}px`, width: `${p.w * cssDpi}px`, height: `${p.h * cssDpi}px`,
            })
        })
        this.updateZoomSelect()
        this.updateSplitClip()
        this.scheduleRender(0)
    }

    private applyLayerStyles(): void {
        for (const pe of this.pageEls) {
            pe.el.style.opacity = this.mode === 'overlay' && pe.role === 1 ? String(this.opacity) : ''
            if (this.mode !== 'split') {
                pe.el.style.clipPath = ''
            }
        }
        this.updateSplitClip()
    }

    /** the split screen: the pages of B are cut off left of the divider */
    private updateSplitClip(): void {
        if (this.mode !== 'split') {
            return
        }
        const vr = this.viewport.getBoundingClientRect()
        const x = vr.left + this.split * this.viewport.clientWidth
        this.divider.style.left = `${this.split * this.viewport.clientWidth}px`
        this.divider.querySelector('[role=slider]')?.setAttribute('aria-valuenow', String(Math.round(this.split * 100)))
        for (const pe of this.pageEls) {
            if (pe.role !== 1) {
                continue
            }
            const r = pe.el.getBoundingClientRect()
            const cut = Math.max(0, Math.min(r.width, x - r.left))
            pe.el.style.clipPath = `inset(0 0 0 ${cut}px)`
        }
    }

    // ---------------------------------------------------------------------------------
    //   zoom
    // ---------------------------------------------------------------------------------

    private setZoom(z: number | 'fit'): void {
        if (z === 'fit') {
            this.zoomSetting = 'fit'
            this.zoomAt(this.computeZoom())
            this.zoomSetting = 'fit'
            this.updateZoomSelect()
            return
        }
        this.zoomAt(z)
    }

    private zoomStep(dir: 1 | -1): void {
        const next = dir > 0 ? ZOOM_LEVELS.find(l => l > this.zoom + 0.5) : [...ZOOM_LEVELS].reverse().find(l => l < this.zoom - 0.5)
        this.zoomAt(next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM))
    }

    /** zooms keeping the point under (clientX, clientY) in place */
    private zoomAt(z: number, clientX?: number, clientY?: number): void {
        const vp = this.viewport
        const r = vp.getBoundingClientRect()
        const x = (clientX ?? r.left + vp.clientWidth / 2) - r.left
        const y = (clientY ?? r.top + vp.clientHeight / 2) - r.top
        const old = this.zoom
        const next = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100
        this.zoomSetting = next
        // the content scales with the zoom (gaps included)
        const fx = (vp.scrollLeft + x) / old
        const fy = (vp.scrollTop + y) / old
        this.zoom = next
        if (this.viewMode === 'fit-width') {
            clearTimeout(this.reflowTimer)
            this.reflowTimer = window.setTimeout(() => this.relayout(), 150)
        }
        this.place()
        vp.scrollLeft = fx * next - x
        vp.scrollTop = fy * next - y
    }

    // ---------------------------------------------------------------------------------
    //   drawing
    // ---------------------------------------------------------------------------------

    /** draws everything again (other marks) */
    private invalidate(): void {
        for (const pe of this.pageEls) {
            delete pe.canvas.dataset.dpi
        }
        this.scheduleRender(0)
    }

    private scheduleRender(delay: number): void {
        clearTimeout(this.renderTimer)
        this.renderTimer = window.setTimeout(() => this.renderVisible(), delay)
    }

    private renderVisible(): void {
        if (this.destroyed) {
            return
        }
        const vr = this.viewport.getBoundingClientRect()
        const queue = this.pageEls.filter(pe => {
            const r = pe.el.getBoundingClientRect()
            return r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom
        })
        const step = (): void => {
            const pe = queue.shift()
            if (!pe || this.destroyed) {
                return
            }
            if (pe.el.isConnected) {
                this.renderPage(pe)
            }
            requestAnimationFrame(step)
        }
        step()
    }

    /** draws a page completely, or only its visible part plus half a view around it if that is too large (a tile) */
    private renderPage(pe: PageEl): void {
        const side = pe.role === 0 ? this.left() : this.right()
        const s = pageSize(side.score, pe.page)
        const dpr = window.devicePixelRatio || 1
        const dpi = CSS_DPI * this.zoom / 100 * dpr
        const fullW = s.width * dpi
        const fullH = s.height * dpi
        const c = pe.canvas
        const d = c.dataset
        const key = `${dpi.toFixed(4)}`
        const same = d.dpi === key
        let region: { x: number; y: number; width: number; height: number } | undefined
        if (fullW * fullH <= MAX_CANVAS_PIXELS) {
            if (same && d.tile === '0') {
                return
            }
        } else {
            const pr = pe.el.getBoundingClientRect()
            const vr = this.viewport.getBoundingClientRect()
            const vis = {
                l: (Math.max(pr.left, vr.left) - pr.left) * dpr,
                t: (Math.max(pr.top, vr.top) - pr.top) * dpr,
                r: (Math.min(pr.right, vr.right) - pr.left) * dpr,
                b: (Math.min(pr.bottom, vr.bottom) - pr.top) * dpr,
            }
            if (vis.r <= vis.l || vis.b <= vis.t) {
                return
            }
            if (same && d.tile === '1' && Number(d.x) <= vis.l + 1 && Number(d.y) <= vis.t + 1
                && Number(d.x) + Number(d.w) >= vis.r - 1 && Number(d.y) + Number(d.h) >= vis.b - 1) {
                return
            }
            const mx = vr.width * dpr / 2
            const my = vr.height * dpr / 2
            const x = Math.floor(Math.max(0, vis.l - mx))
            const y = Math.floor(Math.max(0, vis.t - my))
            region = { x, y, width: Math.ceil(Math.min(fullW, vis.r + mx)) - x, height: Math.ceil(Math.min(fullH, vis.b + my)) - y }
        }
        const x = region?.x ?? 0
        const y = region?.y ?? 0
        const w = region?.width ?? Math.round(fullW)
        const h = region?.height ?? Math.round(fullH)
        c.width = Math.max(1, w)
        c.height = Math.max(1, h)
        Object.assign(c.style, { left: `${x / fullW * 100}%`, top: `${y / fullH * 100}%`, width: `${w / fullW * 100}%`, height: `${h / fullH * 100}%` })
        drawDiffPage(side.score, pe.page, c.getContext('2d')!, {
            dpi, region, marks: this.marks(pe.role), colors: pe.role === 0 ? COLORS_A : COLORS_B,
        })
        Object.assign(d, { dpi: key, tile: region ? '1' : '0', x: String(x), y: String(y), w: String(w), h: String(h) })
    }

    // ---------------------------------------------------------------------------------
    //   the differences
    // ---------------------------------------------------------------------------------

    private stepHunk(dir: 1 | -1): void {
        const hunks = this.result?.hunks ?? []
        if (!hunks.length) {
            return
        }
        this.hunkIdx = this.hunkIdx < 0 ? (dir > 0 ? 0 : hunks.length - 1) : (this.hunkIdx + dir + hunks.length) % hunks.length
        this.updateHunkInfo()
        this.showHunk(this.hunkIdx)
    }

    /** scrolls to a difference: its measures in A (in B if they were inserted there) */
    private showHunk(idx: number): void {
        const hunk = this.result?.hunks[idx]
        if (!hunk) {
            return
        }
        const leftIsFirst = !this.swapped
        const measuresOf = (role: 0 | 1): typeof hunk.a => (role === 0) === leftIsFirst ? hunk.a : hunk.b
        const stavesOf = (role: 0 | 1): number[] => this.result!.staves.map(st => st[(role === 0) === leftIsFirst ? 0 : 1])
        const role: 0 | 1 = measuresOf(0).length ? 0 : 1
        const side = role === 0 ? this.left() : this.right()
        const bounds = diffMeasuresBounds(side.score, measuresOf(role), stavesOf(role))
        const pe = bounds && this.pageEls.find(p => p.role === role && p.page === bounds.page)
        if (!bounds || !pe) {
            return
        }
        const cssDpi = CSS_DPI * this.zoom / 100
        const vp = this.viewport
        const cx = pe.el.offsetLeft + (bounds.x + bounds.width / 2) * cssDpi
        const cy = pe.el.offsetTop + (bounds.y + bounds.height / 2) * cssDpi
        vp.scrollTo({ left: cx - vp.clientWidth / 2, top: cy - vp.clientHeight / 2, behavior: 'smooth' })
    }
}
