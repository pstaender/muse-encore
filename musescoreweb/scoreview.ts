/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore Web: the score view (plain DOM code taken over from the web viewer, ../webviewer): shows the pages of
 * the open score (horizontally, vertically or as two-page spreads), zoom, navigation, printing. The app (app.tsx)
 * opens and closes scores through showScore() / clearScore() and gets the user's commands through the handlers.
 * Keyboard shortcuts follow MuseScore Studio (src/app/configs/data/shortcuts.xml) where they make sense.
 */
/// <reference types="vite/client" />
import { useSyncExternalStore } from 'react'
import {
    clearSelection, drawPage, drawPageSvg, hasSelection, initEngravingFonts, isModified, isTwoSided, moveSelection,
    noteInputCursorBounds, noteInputState, onNotationChanged, pageCount, pageSize, scoreTitle, selectAll, selectAt, selectionBounds, selectionInfo,
    SvgGlyphDefs, type MasterScore, type SelectMode,
} from '../src/index'
import { drawShadowNote, hideShadowNote, rightClickAt, showShadowNote } from '../src/index'
import { settings as appSettings, updateSettings, type ViewSettings } from './settings'

/** commands of the score view that the app handles */
export const handlers = {
    openFile: (_file: File): void => {},
}

// ---------------------------------------------------------------------------------
//   elements
// ---------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

export const viewport = $<HTMLElement>('viewport')
const pagesDiv = $<HTMLDivElement>('pages')
const helpDialog = $<HTMLDialogElement>('help-dialog')

// ---------------------------------------------------------------------------------
//   the state shown by the React UI (toolbar, tabs, status bar)
// ---------------------------------------------------------------------------------

export interface ScoreViewState {
    hasScore: boolean
    /** file name without extension (like MuseScore's tab) and the score title as tooltip */
    title: string
    tooltip: string
    /** "1 / 4", "2–3 / 4" */
    pageText: string
    canPrev: boolean
    canNext: boolean
    zoom: number
    fitMode: FitMode | null
    orientation: 'horizontal' | 'vertical'
    spread: boolean
    spreadAvailable: boolean
    fullscreen: boolean
    status: string
    statusError: boolean
    /** the selection's accessibility info (MuseScore's status bar); '' without a selection */
    selection: string
    /** the score was changed since it was opened or saved (its undo stack is not clean) */
    modified: boolean
    /** note input mode is on */
    noteInput: boolean
    /** counts the selection changes (for the panels: the Properties panel shows the selection) */
    selectionVersion: number
    /** counts the scores shown and their changes (command, undo, redo): the toolbars and panels update their states */
    scoreVersion: number
}

let viewState: ScoreViewState = {
    hasScore: false, title: '', tooltip: '', pageText: '–', canPrev: false, canNext: false, zoom: 100, fitMode: null,
    orientation: 'horizontal', spread: false, spreadAvailable: false, fullscreen: false, status: '', statusError: false,
    selection: '', modified: false, noteInput: false, selectionVersion: 0, scoreVersion: 0,
}
const viewListeners = new Set<() => void>()

function publish(patch: Partial<ScoreViewState>): void {
    if (Object.entries(patch).every(([k, v]) => viewState[k as keyof ScoreViewState] === v)) {
        return
    }
    viewState = { ...viewState, ...patch }
    for (const l of viewListeners) {
        l()
    }
}

export function scoreViewState(): ScoreViewState {
    return viewState
}

export function onScoreViewChanged(listener: () => void): () => void {
    viewListeners.add(listener)
    return () => viewListeners.delete(listener)
}

export function useScoreView(): ScoreViewState {
    return useSyncExternalStore(onScoreViewChanged, scoreViewState)
}

export function currentScore(): MasterScore | null {
    return score
}

// ---------------------------------------------------------------------------------
//   state
// ---------------------------------------------------------------------------------

/** MuseScore's zoom steps (NotationViewInputController::ZOOM_LEVELS) */
export const ZOOM_LEVELS = [5, 10, 15, 25, 50, 75, 100, 150, 200, 400, 800, 1600]
const MIN_ZOOM = ZOOM_LEVELS[0]
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
const CSS_DPI = 96 // CSS pixels per inch at 100%
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024 // larger pages are drawn as tiles of the visible part

const FIT_MODES = ['page-width', 'whole-page'] as const
export type FitMode = typeof FIT_MODES[number]

let score: MasterScore | null = null
let fileName = ''
const settings: ViewSettings = { ...appSettings().view }
const saveSettings = (s: ViewSettings): void => updateSettings('view', s)
let zoom = 100 // current zoom in percent
let pages: HTMLDivElement[] = []
const visible = new Set<HTMLDivElement>()
let renderTimer = 0
let unsubscribeNotation: (() => void) | null = null
let externalChangeTimer = 0

function fitMode(): FitMode | null {
    return (FIT_MODES as readonly string[]).includes(settings.zoom) ? settings.zoom as FitMode : null
}

function spreadActive(): boolean {
    return !!score && settings.spread && isTwoSided(score)
}

export function setStatus(text: string, error = false): void {
    publish({ status: text, statusError: error })
}

// ---------------------------------------------------------------------------------
//   busy overlay: the layout is synchronous, the UI is blocked while a file is opened
// ---------------------------------------------------------------------------------

const busyEl = $<HTMLDivElement>('busy')

export function isBusy(): boolean {
    return !busyEl.hidden
}

/** shows the overlay and waits until it is painted */
export async function showBusy(title: string, detail = ''): Promise<void> {
    $('busy-title').textContent = title
    $('busy-title').title = title
    $('busy-detail').textContent = detail
    if (busyEl.hidden) {
        busyEl.hidden = false
        document.body.setAttribute('aria-busy', 'true')
        viewport.setAttribute('inert', '')
    }
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))
}

export function hideBusy(): void {
    busyEl.hidden = true
    document.body.removeAttribute('aria-busy')
    viewport.removeAttribute('inert')
}

// ---------------------------------------------------------------------------------
//   fonts and the open score
// ---------------------------------------------------------------------------------

/** resolves when the engraving fonts are loaded (rejects if they cannot be loaded) */
export const fontsReady = initEngravingFonts(async (path) => {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
    if (!res.ok) {
        throw new Error(`could not load font ${path}`)
    }
    return res.arrayBuffer()
})
fontsReady.then(() => setStatus('Ready'), (e: Error) => setStatus(`Error: ${e.message}`, true))

/** shows a laid out score; `name` is the file name (or the title of a new score) */
export function showScore(s: MasterScore, name: string): void {
    unsubscribeNotation?.()
    score = s
    // changes made by a timer (real-time note input) are shown like the changes of commands
    unsubscribeNotation = onNotationChanged(s, () => {
        clearTimeout(externalChangeTimer)
        externalChangeTimer = window.setTimeout(scoreChanged, 0)
    })
    publish({ selection: '', modified: isModified(s), noteInput: noteInputState(s).active, selectionVersion: viewState.selectionVersion + 1, scoreVersion: viewState.scoreVersion + 1 })
    fileName = name
    printPagesDiv.replaceChildren()
    buildPages()
}

export function clearScore(): void {
    unsubscribeNotation?.()
    unsubscribeNotation = null
    removeShadowNote()
    score = null
    publish({ selection: '', modified: false, noteInput: false, selectionVersion: viewState.selectionVersion + 1, scoreVersion: viewState.scoreVersion + 1 })
    fileName = ''
    printPagesDiv.replaceChildren()
    buildPages()
    setStatus('Ready')
}

/** the score was saved: its modified state changed (no new layout) */
export function scoreSaved(): void {
    if (score) {
        publish({ modified: isModified(score) })
    }
}

/** called when the score view becomes visible again (its size was 0 while hidden) */
export function viewShown(): void {
    updatePan()
    if (score) {
        const page = currentPage()
        applyZoom(computeZoom())
        centerPage(page)
    }
    viewport.focus({ preventScroll: true })
}

// ---------------------------------------------------------------------------------
//   pages
// ---------------------------------------------------------------------------------

const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
        const el = e.target as HTMLDivElement
        if (e.isIntersecting) {
            visible.add(el)
        } else {
            visible.delete(el)
        }
    }
    scheduleRender(0)
    updatePageInfo()
}, { root: viewport, rootMargin: '50%' })

/** a page is a white box; its canvas covers the whole page or, at high zoom, only the visible part */
function makePage(idx: number): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'page'
    el.dataset.page = String(idx)
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', `Page ${idx + 1}`)
    el.appendChild(document.createElement('canvas'))
    return el
}

function buildPages(keepPosition = false): void {
    const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop }
    observer.disconnect()
    visible.clear()
    pagesDiv.replaceChildren()
    pages = []

    // like MuseScore's tab: the file name without extension; the score title as tooltip
    const title = score ? fileName.replace(/\.mscx?z?$/i, '') : ''
    publish({ hasScore: !!score, title, tooltip: score ? [scoreTitle(score), fileName].filter(Boolean).join(' – ') : '' })
    document.title = score ? `${title} – MuseScore Web` : 'MuseScore Web'

    if (score) {
        const n = pageCount(score)
        for (let i = 0; i < n; ++i) {
            pages.push(makePage(i))
        }
        if (spreadActive()) {
            // two-sided layout: the first page is a right-hand page
            const placeholder = document.createElement('div')
            placeholder.className = 'page placeholder'
            placeholder.dataset.page = '0'
            placeholder.setAttribute('aria-hidden', 'true')
            const items = [placeholder, ...pages]
            for (let i = 0; i < items.length; i += 2) {
                const spread = document.createElement('div')
                spread.className = 'spread'
                spread.append(...items.slice(i, i + 2))
                pagesDiv.appendChild(spread)
            }
        } else {
            pagesDiv.append(...pages)
        }
        for (const el of pages) {
            observer.observe(el)
        }
    }

    updateControls()
    updatePan()
    applyZoom(computeZoom())
    if (keepPosition) {
        viewport.scrollTo(scroll.left, scroll.top)
        return
    }
    if (score) {
        centerPage(0)
    } else {
        viewport.scrollTo(0, 0)
    }
    viewport.focus({ preventScroll: true })
}

/**
 * After an editing command, undo or redo (the library has laid the score out again): new pages if their number changed,
 * new page sizes, repaint, the status bar, the modified flag; the selection (in note input: the cursor) is scrolled
 * into view.
 */
export function scoreChanged(): void {
    clearTimeout(externalChangeTimer)
    if (!score) {
        return
    }
    // a click keeps the shadow note at the mouse position, keyboard input hides it until the mouse moves (like MuseScore)
    if (score.shadowNote().visible()) {
        updateShadowNote()
    } else {
        removeShadowNote()
    }
    if (pageCount(score) !== pages.length) {
        buildPages(true)
    } else {
        applyZoom(zoom)
    }
    publish({ modified: isModified(score), noteInput: noteInputState(score).active, scoreVersion: viewState.scoreVersion + 1 })
    selectionChanged(true)
}

function pageCssSize(idx: number, z = zoom): { w: number; h: number } {
    const s = pageSize(score!, idx)
    const f = CSS_DPI * z / 100
    return { w: s.width * f, h: s.height * f }
}

/** sets the CSS size of all pages; the bitmaps are redrawn later (until then they are scaled) */
function applyZoom(z: number): void {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
    if (score) {
        for (const el of pagesDiv.querySelectorAll<HTMLDivElement>('.page')) {
            const { w, h } = pageCssSize(Number(el.dataset.page))
            el.style.width = `${w}px`
            el.style.height = `${h}px`
        }
    }
    updateZoomSelect()
    scheduleRender(120)
}

function scheduleRender(delay: number): void {
    clearTimeout(renderTimer)
    renderTimer = window.setTimeout(renderVisible, delay)
}

/**
 * Draws a page at the given resolution. Small enough pages are drawn completely; otherwise only the visible part
 * of the page plus a margin of half a viewport is drawn (a "tile"), so the bitmap stays small at any zoom.
 */
function renderPage(el: HTMLDivElement, cssDpi: number): void {
    const idx = Number(el.dataset.page)
    const s = pageSize(score!, idx)
    const dpr = window.devicePixelRatio
    const dpi = cssDpi * dpr
    const fullW = s.width * dpi
    const fullH = s.height * dpi
    const c = el.querySelector('canvas')!
    const d = c.dataset
    const sameDpi = d.dpi === dpi.toFixed(4)

    let region: { x: number; y: number; width: number; height: number } | undefined
    if (fullW * fullH <= MAX_CANVAS_PIXELS) {
        if (sameDpi && d.tile === '0') {
            return
        }
    } else {
        // visible part of the page in device pixels
        const pr = el.getBoundingClientRect()
        const vr = viewport.getBoundingClientRect()
        const vis = {
            l: (Math.max(pr.left, vr.left) - pr.left) * dpr,
            t: (Math.max(pr.top, vr.top) - pr.top) * dpr,
            r: (Math.min(pr.right, vr.right) - pr.left) * dpr,
            b: (Math.min(pr.bottom, vr.bottom) - pr.top) * dpr,
        }
        if (vis.r <= vis.l || vis.b <= vis.t) {
            return
        }
        if (sameDpi && d.tile === '1' && Number(d.x) <= vis.l + 1 && Number(d.y) <= vis.t + 1
            && Number(d.x) + Number(d.w) >= vis.r - 1 && Number(d.y) + Number(d.h) >= vis.b - 1) {
            return // the current tile still covers the visible part
        }
        const mx = vr.width * dpr / 2
        const my = vr.height * dpr / 2
        const x = Math.floor(Math.max(0, vis.l - mx))
        const y = Math.floor(Math.max(0, vis.t - my))
        region = {
            x,
            y,
            width: Math.ceil(Math.min(fullW, vis.r + mx)) - x,
            height: Math.ceil(Math.min(fullH, vis.b + my)) - y,
        }
    }

    const x = region?.x ?? 0
    const y = region?.y ?? 0
    const w = region?.width ?? Math.round(fullW)
    const h = region?.height ?? Math.round(fullH)
    c.width = Math.max(1, w)
    c.height = Math.max(1, h)
    // relative to the page, so a bitmap keeps its place while zooming until it is redrawn
    c.style.left = `${x / fullW * 100}%`
    c.style.top = `${y / fullH * 100}%`
    c.style.width = `${w / fullW * 100}%`
    c.style.height = `${h / fullH * 100}%`
    // like MuseScore's notation view (not printing): selection colors, the range frame, frames, invisible items grey
    drawPage(score!, idx, c.getContext('2d')!, { dpi, region, printing: false })
    Object.assign(d, { dpi: dpi.toFixed(4), tile: region ? '1' : '0', x: String(x), y: String(y), w: String(w), h: String(h) })
}

function renderVisible(): void {
    if (!score) {
        return
    }
    const cssDpi = CSS_DPI * zoom / 100
    // draw one page per frame to keep the UI responsive
    const queue = [...visible].sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page))
    const step = (): void => {
        const el = queue.shift()
        if (!el || !score) {
            return
        }
        if (el.isConnected) {
            renderPage(el, cssDpi)
        }
        requestAnimationFrame(step)
    }
    step()
}

// ---------------------------------------------------------------------------------
//   printing: every page as vector graphics (SVG) on a sheet of the score's page size
// ---------------------------------------------------------------------------------

const printPagesDiv = $<HTMLDivElement>('print-pages')
const pageStyle = document.createElement('style')
document.head.appendChild(pageStyle)

function preparePrint(): void {
    if (!score || printPagesDiv.childElementCount) {
        return
    }
    // the paper has the page size of the score, which also gives portrait or landscape
    const size = pageSize(score, 0)
    pageStyle.textContent = `@page { size: ${size.width}in ${size.height}in; margin: 0; }`
    // glyph outlines are defined once for all pages
    const defs = new SvgGlyphDefs()
    let html = ''
    for (let i = 0; i < pageCount(score); ++i) {
        html += `<div class="print-page">${drawPageSvg(score, i, { defs })}</div>`
    }
    printPagesDiv.innerHTML = defs.svg() + html
}

export async function print(): Promise<void> {
    if (!score) {
        return
    }
    if (!printPagesDiv.childElementCount) {
        await showBusy('Preparing pages for printing…', `${pageCount(score)} ${pageCount(score) === 1 ? 'page' : 'pages'}`)
        try {
            preparePrint()
        } finally {
            hideBusy()
        }
    }
    window.print()
}

// printing from the browser menu
window.addEventListener('beforeprint', preparePrint)
window.addEventListener('afterprint', () => {
    printPagesDiv.replaceChildren()
    pageStyle.textContent = ''
})

// ---------------------------------------------------------------------------------
//   zoom
// ---------------------------------------------------------------------------------

function computeZoom(): number {
    const mode = fitMode()
    if (!score || !mode) {
        const z = Number(settings.zoom)
        return Number.isFinite(z) && z > 0 ? z : 100
    }
    const gap = pageGap()
    const availW = viewport.clientWidth - 2 * gap
    const availH = viewport.clientHeight - 2 * gap
    const s = pageSize(score, 0)
    const pagesAcross = spreadActive() ? 2 : 1
    const zw = availW / (s.width * pagesAcross * CSS_DPI) * 100
    const zh = availH / (s.height * CSS_DPI) * 100
    return Math.max(MIN_ZOOM, mode === 'page-width' ? zw : Math.min(zw, zh))
}

function updateZoomSelect(): void {
    publish({ zoom, fitMode: fitMode() })
}

/** zooms keeping the score point under (clientX, clientY) in place */
export function zoomAt(z: number, clientX?: number, clientY?: number): void {
    if (!score) {
        return
    }
    const rect = viewport.getBoundingClientRect()
    const x = clientX ?? rect.left + rect.width / 2
    const y = clientY ?? rect.top + rect.height / 2

    // anchor: the page under the point (or the nearest one) and the relative position on it
    let anchor: HTMLDivElement | null = null
    let best = Infinity
    for (const c of visible.size ? visible : pages) {
        const r = c.getBoundingClientRect()
        const dx = Math.max(r.left - x, 0, x - r.right)
        const dy = Math.max(r.top - y, 0, y - r.bottom)
        const d = dx * dx + dy * dy
        if (d < best) {
            best = d
            anchor = c
        }
    }
    const before = anchor?.getBoundingClientRect()
    const fx = before ? (x - before.left) / before.width : 0
    const fy = before ? (y - before.top) / before.height : 0

    settings.zoom = String(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100)
    saveSettings(settings)
    applyZoom(Number(settings.zoom))

    if (anchor && before) {
        const after = anchor.getBoundingClientRect()
        viewport.scrollLeft += after.left + fx * after.width - x
        viewport.scrollTop += after.top + fy * after.height - y
    }
}

export function zoomStep(dir: 1 | -1): void {
    const next = dir > 0 ? ZOOM_LEVELS.find(l => l > zoom + 0.5) : [...ZOOM_LEVELS].reverse().find(l => l < zoom - 0.5)
    zoomAt(next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM))
}

export function setFitMode(mode: FitMode): void {
    const page = currentPage()
    settings.zoom = mode
    saveSettings(settings)
    applyZoom(computeZoom())
    centerPage(page)
}

new ResizeObserver(() => {
    updatePan()
    if (fitMode() && score) {
        // the page stays fitted and centered (e.g. entering full screen)
        const page = currentPage()
        applyZoom(computeZoom())
        centerPage(page)
    }
}).observe(viewport)

// ---------------------------------------------------------------------------------
//   layout and navigation
// ---------------------------------------------------------------------------------

function updateControls(): void {
    const horizontal = settings.orientation === 'horizontal'
    pagesDiv.className = horizontal ? 'horizontal' : 'vertical'
    publish({ orientation: settings.orientation, spread: spreadActive(), spreadAvailable: !!score && isTwoSided(score) })
    updatePageInfo()
}

export function setOrientation(o: 'horizontal' | 'vertical'): void {
    const page = currentPage()
    settings.orientation = o
    saveSettings(settings)
    updateControls()
    if (fitMode()) {
        applyZoom(computeZoom())
    }
    centerPage(page)
}

export function toggleSpread(): void {
    const page = currentPage()
    settings.spread = !settings.spread
    saveSettings(settings)
    buildPages()
    centerPage(page)
}

/** index of the page nearest to the start of the viewport */
function currentPage(): number {
    if (!pages.length) {
        return 0
    }
    const r = viewport.getBoundingClientRect()
    const horizontal = settings.orientation === 'horizontal'
    let best = 0
    let bestDist = Infinity
    for (const c of pages) {
        const cr = c.getBoundingClientRect()
        // the page whose visible part is largest wins; ties go to the first one
        const visibleLen = horizontal
            ? Math.min(cr.right, r.right) - Math.max(cr.left, r.left)
            : Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
        const dist = -visibleLen
        if (dist < bestDist - 1) {
            bestDist = dist
            best = Number(c.dataset.page)
        }
    }
    return best
}

export function goToPage(idx: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!pages.length) {
        return
    }
    const c = pages[Math.max(0, Math.min(pages.length - 1, idx))]
    // in a spread, scroll to the spread (its left page)
    const target = c.parentElement?.classList.contains('spread') ? c.parentElement : c
    const gap = pageGap()
    const vr = viewport.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    if (settings.orientation === 'horizontal') {
        viewport.scrollTo({ left: viewport.scrollLeft + tr.left - vr.left - gap, behavior })
    } else {
        viewport.scrollTo({ top: viewport.scrollTop + tr.top - vr.top - gap, behavior })
    }
}

/** shows the page (in a spread: the spread) in the middle of the view, horizontally and vertically */
export function centerPage(idx = currentPage()): void {
    if (!pages.length) {
        return
    }
    const c = pages[Math.max(0, Math.min(pages.length - 1, idx))]
    const target = c.parentElement?.classList.contains('spread') ? c.parentElement : c
    const vr = viewport.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    viewport.scrollLeft += tr.left + tr.width / 2 - (vr.left + viewport.clientWidth / 2)
    viewport.scrollTop += tr.top + tr.height / 2 - (vr.top + viewport.clientHeight / 2)
}

function pageGap(): number {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gap')) || 24
}

export function lastPage(): number {
    return pages.length - 1
}

// the pages can be moved beyond their edges (like MuseScore's canvas) until this much of them is visible
const MIN_VISIBLE = 48
let pan = { x: 0, y: 0 }

/** sets the space around the pages; the view keeps showing the same part of the pages */
function updatePan(): void {
    // without a score nothing can be moved (the drop target must stay in view)
    const next = score ? {
        x: Math.max(0, viewport.clientWidth - MIN_VISIBLE - pageGap()),
        y: Math.max(0, viewport.clientHeight - MIN_VISIBLE - pageGap()),
    } : { x: 0, y: 0 }
    if (next.x === pan.x && next.y === pan.y) {
        return
    }
    pagesDiv.style.setProperty('--pan-x', `${next.x}px`)
    pagesDiv.style.setProperty('--pan-y', `${next.y}px`)
    viewport.scrollLeft += next.x - pan.x
    viewport.scrollTop += next.y - pan.y
    pan = next
}

export function stepPage(dir: 1 | -1): void {
    const cur = currentPage()
    if (!spreadActive()) {
        goToPage(cur + dir)
        return
    }
    // spreads: [1], [2, 3], [4, 5], ... (0-based: [0], [1, 2], [3, 4], ...)
    const spread = cur === 0 ? 0 : Math.floor((cur + 1) / 2)
    const target = Math.max(0, spread + dir)
    goToPage(target === 0 ? 0 : 2 * target - 1)
}

function updatePageInfo(): void {
    if (!score) {
        publish({ pageText: '–', canPrev: false, canNext: false })
        return
    }
    const n = pages.length
    const cur = currentPage()
    const partner = spreadActive() && cur > 0 ? (cur % 2 === 1 ? cur + 1 : cur - 1) : -1
    const shown = partner >= 0 && partner < n ? `${Math.min(cur, partner) + 1}–${Math.max(cur, partner) + 1}` : `${cur + 1}`
    publish({ pageText: `${shown} / ${n}`, canPrev: cur > 0, canNext: Math.max(cur, partner) < n - 1 })
}

viewport.addEventListener('scroll', () => {
    updatePageInfo()
    scheduleRender(60) // tiles of zoomed-in pages follow the view
}, { passive: true })

// ---------------------------------------------------------------------------------
//   wheel, pinch and the hand tool
// ---------------------------------------------------------------------------------

/** a mouse wheel notch (as opposed to trackpad scrolling, which keeps scrolling) */
function isMouseWheel(e: WheelEvent): boolean {
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return true
    }
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
    if (legacy !== undefined && legacy !== 0 && e.deltaX === 0) {
        return Math.abs(legacy) % 120 === 0
    }
    return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50
}

viewport.addEventListener('wheel', (e) => {
    if (!score) {
        return
    }
    if (e.ctrlKey || e.metaKey) {
        // trackpad pinch (reported as ctrl+wheel) and ctrl+wheel
        e.preventDefault()
        zoomAt(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    } else if (!e.shiftKey && isMouseWheel(e)) {
        e.preventDefault()
        zoomAt(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    // otherwise: native scrolling (trackpad, shift+wheel)
}, { passive: false })

// Safari trackpad pinch
let gestureStartZoom = 0
viewport.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureStartZoom = zoom })
viewport.addEventListener('gesturechange', (e) => {
    e.preventDefault()
    const ge = e as Event & { scale: number; clientX: number; clientY: number }
    zoomAt(gestureStartZoom * ge.scale, ge.clientX, ge.clientY)
})

// touch pinch (one finger pans natively)
let pinch: { dist: number; zoom: number } | null = null
const touchDist = (t: TouchList): number => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && score) {
        pinch = { dist: touchDist(e.touches), zoom }
    }
}, { passive: true })
viewport.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
        e.preventDefault()
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
        zoomAt(pinch.zoom * touchDist(e.touches) / pinch.dist, cx, cy)
    }
}, { passive: false })
viewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        pinch = null
    }
})

// ---------------------------------------------------------------------------------
//   selection (MuseScore's NotationViewInputController: click, ctrl/cmd+click adds, shift+click extends)
// ---------------------------------------------------------------------------------

/** redraws the pages after a selection change (no new layout) and updates the status bar */
export function selectionChanged(scrollIntoView = false): void {
    if (!score) {
        return
    }
    for (const el of pages) {
        delete el.querySelector('canvas')!.dataset.dpi
    }
    scheduleRender(0)
    publish({ selection: hasSelection(score) ? selectionInfo(score) : '', selectionVersion: viewState.selectionVersion + 1 })
    if (scrollIntoView) {
        const b = noteInputCursorBounds(score) ?? selectionBounds(score)[0]
        const el = b ? pages[b.page] : null
        if (el && b) {
            const pr = el.getBoundingClientRect()
            const vr = viewport.getBoundingClientRect()
            const f = pr.width / pageSize(score, b.page).width
            const x = pr.left + b.x * f
            const y = pr.top + b.y * f
            const m = 24
            viewport.scrollBy({
                left: x < vr.left + m ? x - vr.left - m : x + b.width * f > vr.right - m ? x + b.width * f - vr.right + m : 0,
                top: y < vr.top + m ? y - vr.top - m : y + b.height * f > vr.bottom - m ? y + b.height * f - vr.bottom + m : 0,
            })
        }
    }
}


export function selectAllElements(): void {
    if (score) {
        selectAll(score)
        selectionChanged()
    }
}

export function deselect(): boolean {
    if (score && clearSelection(score)) {
        selectionChanged()
        return true
    }
    return false
}

let press: { x: number; y: number; id: number } | null = null

viewport.addEventListener('pointerdown', (e) => {
    if (score && e.button === 0 && !spaceDown) {
        press = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
})

viewport.addEventListener('pointerup', (e) => {
    const p = press
    press = null
    if (!score || !p || p.id !== e.pointerId || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
        return
    }
    // the page under the pointer and the point on it in inches
    const el = (e.target as Element).closest<HTMLDivElement>('.page:not(.placeholder)')
    const mode: SelectMode = e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'add' : 'single'
    if (!el) {
        if (mode === 'single') {
            deselect()
        }
        return
    }
    const idx = Number(el.dataset.page)
    const r = el.getBoundingClientRect()
    const size = pageSize(score, idx)
    const cssDpi = r.width / size.width
    const noteInput = noteInputState(score).active
    if (selectAt(score, idx, (e.clientX - r.left) / cssDpi, (e.clientY - r.top) / cssDpi, mode, { dpi: cssDpi }) || noteInput) {
        // in note input mode a click puts a note (a new layout)
        if (noteInput) {
            scoreChanged()
        } else {
            selectionChanged()
        }
    }
})

// ---------------------------------------------------------------------------------
//   note input: the shadow note at the mouse position, right click removes a note
//   (MuseScore's NotationViewInputController::hoverMoveEvent / handleClickInNoteInputMode)
// ---------------------------------------------------------------------------------

const shadowCanvas = document.createElement('canvas')
shadowCanvas.className = 'shadow-note'
shadowCanvas.setAttribute('aria-hidden', 'true')
let hover: { el: HTMLDivElement; x: number; y: number } | null = null
let hoverFrame = 0

function removeShadowNote(): void {
    shadowCanvas.remove()
}

/** shows the shadow note at the last mouse position (in note input mode) */
function updateShadowNote(): void {
    if (!score || !hover || !hover.el.isConnected || !noteInputState(score).active) {
        if (score && shadowCanvas.isConnected) {
            hideShadowNote(score)
        }
        removeShadowNote()
        return
    }
    const el = hover.el
    const idx = Number(el.dataset.page)
    const r = el.getBoundingClientRect()
    const cssDpi = r.width / pageSize(score, idx).width
    const b = showShadowNote(score, idx, (hover.x - r.left) / cssDpi, (hover.y - r.top) / cssDpi)
    if (!b) {
        removeShadowNote()
        return
    }
    const dpr = window.devicePixelRatio
    const dpi = cssDpi * dpr
    const x = Math.floor(b.x * dpi) - 2
    const y = Math.floor(b.y * dpi) - 2
    const region = { x, y, width: Math.ceil((b.x + b.width) * dpi) + 2 - x, height: Math.ceil((b.y + b.height) * dpi) + 2 - y }
    shadowCanvas.width = Math.max(1, region.width)
    shadowCanvas.height = Math.max(1, region.height)
    Object.assign(shadowCanvas.style, {
        left: `${x / dpr}px`, top: `${y / dpr}px`, width: `${region.width / dpr}px`, height: `${region.height / dpr}px`,
    })
    const ctx = shadowCanvas.getContext('2d')!
    ctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height)
    drawShadowNote(score, idx, ctx, { dpi, region })
    if (shadowCanvas.parentElement !== el) {
        el.appendChild(shadowCanvas)
    }
}

viewport.addEventListener('pointermove', (e) => {
    if (!score || e.pointerType === 'touch' || !noteInputState(score).active) {
        if (shadowCanvas.isConnected) {
            hover = null
            updateShadowNote()
        }
        return
    }
    const el = (e.target as Element).closest<HTMLDivElement>('.page:not(.placeholder)')
    hover = el ? { el, x: e.clientX, y: e.clientY } : null
    if (!hoverFrame) {
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0
            updateShadowNote()
        })
    }
})

viewport.addEventListener('pointerleave', () => {
    hover = null
    updateShadowNote()
})

viewport.addEventListener('contextmenu', (e) => {
    if (!score || !noteInputState(score).active) {
        return
    }
    e.preventDefault()
    const el = (e.target as Element).closest<HTMLDivElement>('.page:not(.placeholder)')
    if (!el) {
        return
    }
    const idx = Number(el.dataset.page)
    const r = el.getBoundingClientRect()
    const cssDpi = r.width / pageSize(score, idx).width
    if (rightClickAt(score, idx, (e.clientX - r.left) / cssDpi, (e.clientY - r.top) / cssDpi)) {
        scoreChanged()
    }
})

// hand tool: hold space (or use the middle mouse button) and drag
let spaceDown = false
let drag: { x: number; y: number; left: number; top: number; id: number } | null = null

function setHand(on: boolean): void {
    viewport.classList.toggle('hand', on || !!drag)
}

viewport.addEventListener('pointerdown', (e) => {
    if (!score || !(spaceDown && e.button === 0) && e.button !== 1) {
        return
    }
    e.preventDefault()
    drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, id: e.pointerId }
    viewport.setPointerCapture(e.pointerId)
    viewport.classList.add('hand', 'dragging')
})
viewport.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
        viewport.scrollLeft = drag.left - (e.clientX - drag.x)
        viewport.scrollTop = drag.top - (e.clientY - drag.y)
    }
})
const endDrag = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.id) {
        drag = null
        viewport.classList.remove('dragging')
        setHand(spaceDown)
    }
}
viewport.addEventListener('pointerup', endDrag)
viewport.addEventListener('pointercancel', endDrag)

// ---------------------------------------------------------------------------------
//   keyboard shortcuts
// ---------------------------------------------------------------------------------

function isTextInput(t: EventTarget | null): boolean {
    return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement
}

// in full screen the app's chrome (menu bar, toolbars) is collapsed; it is shown while the pointer is at the top
// edge or on it, or while it has the keyboard focus
let chrome: HTMLElement | null = null
let toolbarHideTimer = 0

function showToolbar(autoHideMs = 0): void {
    clearTimeout(toolbarHideTimer)
    document.body.classList.add('toolbar-shown')
    if (autoHideMs) {
        toolbarHideTimer = window.setTimeout(hideToolbar, autoHideMs)
    }
}

function hideToolbar(): void {
    clearTimeout(toolbarHideTimer)
    if (chrome && (chrome.matches(':hover') || chrome.matches(':has(:focus-visible)') || chrome.matches(':has([aria-expanded="true"])'))) {
        return // pointer on it, keyboard navigation or an open menu in it
    }
    document.body.classList.remove('toolbar-shown')
}

document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement
    document.body.classList.toggle('fullscreen', fs)
    publish({ fullscreen: fs })
    if (fs) {
        // briefly, so it is clear where it went
        showToolbar(1200)
    } else {
        document.body.classList.remove('toolbar-shown')
    }
})

/** the element that is collapsed in full screen (set by the React app) */
export function setChrome(el: HTMLElement): void {
    chrome = el
    el.addEventListener('pointerenter', () => clearTimeout(toolbarHideTimer))
    el.addEventListener('focusin', () => {
        if (document.body.classList.contains('fullscreen')) {
            showToolbar()
        }
    })
    el.addEventListener('focusout', () => {
        if (document.body.classList.contains('fullscreen') && !el.matches(':hover')) {
            toolbarHideTimer = window.setTimeout(hideToolbar, 300)
        }
    })
}

$('toolbar-trigger').addEventListener('pointerenter', () => showToolbar())
$('toolbar-trigger').addEventListener('pointerdown', () => showToolbar(3000)) // touch: tap at the top edge
// hidden when the pointer is clearly below it (not on leaving it: an open menu or list is outside of it)
document.addEventListener('pointermove', (e) => {
    if (!chrome || !document.body.classList.contains('toolbar-shown') || !document.body.classList.contains('fullscreen')) {
        return
    }
    if (e.clientY > chrome.getBoundingClientRect().bottom + 24) {
        clearTimeout(toolbarHideTimer)
        toolbarHideTimer = window.setTimeout(hideToolbar, 300)
    } else if (e.clientY <= chrome.getBoundingClientRect().bottom) {
        clearTimeout(toolbarHideTimer)
    }
})

export function toggleFullscreen(): void {
    if (document.fullscreenElement) {
        void document.exitFullscreen()
    } else {
        void document.documentElement.requestFullscreen?.()
    }
}

document.addEventListener('keydown', (e) => {
    if (isBusy()) {
        e.preventDefault()
        return
    }
    // modal dialogs and the panels keep their keys
    if (document.querySelector('dialog[open]') || (e.target instanceof Element && e.target.closest('.panel-dock'))) {
        return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key
    // the commands of the menus and toolbars are actions (actions/actions.ts) with MuseScore's shortcuts;
    // here only the keys of the view itself
    if (!score || document.body.dataset.view !== 'score') {
        return
    }

    if (key === ' ' && !mod && !isTextInput(e.target)) {
        // Space starts playback in MuseScore; there is no playback here, so it is the hand tool
        e.preventDefault()
        if (!spaceDown) {
            spaceDown = true
            setHand(true)
        }
        return
    }

    let handled = true
    if (isTextInput(e.target) || e.target instanceof HTMLButtonElement) {
        handled = false
    } else if (key === 'PageDown') {
        stepPage(1)
    } else if (key === 'PageUp') {
        stepPage(-1)
    } else if (key.startsWith('Arrow') || ((key === 'Home' || key === 'End') && (e.shiftKey || mod))) {
        // MuseScore's selection navigation; without a selection the arrows scroll
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
        if (moveSelection(score, key, { shift: e.shiftKey, ctrl: isMac ? e.metaKey : e.ctrlKey, alt: e.altKey })) {
            selectionChanged(true)
        } else if (!mod && document.activeElement !== viewport && key.startsWith('Arrow')) {
            const d = 60
            viewport.scrollBy({
                left: key === 'ArrowLeft' ? -d : key === 'ArrowRight' ? d : 0,
                top: key === 'ArrowUp' ? -d : key === 'ArrowDown' ? d : 0,
            })
        } else {
            handled = document.activeElement !== viewport
        }
    } else if (key === 'Escape') {
        handled = deselect()
    } else {
        handled = false
    }
    if (handled) {
        e.preventDefault()
    }
})

document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
        spaceDown = false
        setHand(false)
    }
})
window.addEventListener('blur', () => {
    spaceDown = false
    setHand(false)
})

// ---------------------------------------------------------------------------------
//   help, drag and drop
// ---------------------------------------------------------------------------------

export function showShortcutsHelp(): void {
    helpDialog.showModal()
}

helpDialog.addEventListener('close', () => viewport.focus({ preventScroll: true }))

// space must not activate a focused toolbar button (it is the hand tool)
document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target instanceof HTMLButtonElement && e.target.closest('#chrome') && score) {
        e.preventDefault()
    }
}, { capture: true })

// a file can be dropped anywhere (also on the home screen)
let dragDepth = 0
document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
        dragDepth++
        document.body.classList.add('dragover')
    }
})
document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (!dragDepth) {
        document.body.classList.remove('dragover')
    }
})
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
    e.preventDefault()
    dragDepth = 0
    document.body.classList.remove('dragover')
    const f = e.dataTransfer?.files[0]
    if (f && !isBusy() && !document.querySelector('dialog[open]')) {
        handlers.openFile(f)
    }
})

updateControls()
