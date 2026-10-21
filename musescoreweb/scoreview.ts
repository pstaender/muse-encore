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
    noteInputCursorBounds, noteInputState, onImageDecoded, onNotationChanged, pageCount, pageSize, scoreTitle, selectAll, selectionBounds, selectionInfo,
    SvgGlyphDefs, type MasterScore,
    // copy/paste, text editing, drag
    CLIPBOARD_FORMATS, clipboardContents, executeAction, isActionEnabled, isDragging, setClipboardContents, setClipboardImage, textEditingInfo,
    viewInputText, viewKeyPress, viewMouseDoubleClick, viewMouseMove, viewMousePress, viewMouseRelease, viewResetTripleClick,
    viewShortcutOverride, type ViewKeyEvent, type ViewPointerEvent,
    // drag and drop of palette cells onto the score
    viewDragEnter, viewDragLeave, viewDragMove, viewDrop, type OutgoingElementDrag, type ViewDragEvent,
} from '../src/index'
import { drawShadowNote, hideShadowNote, rightClickAt, showShadowNote } from '../src/index'
import { setShortcutOverride } from './actions/actions'
import { ELEMENT_DROP_EVENT, dragData, setDragData, type ElementDropDetail } from './dragcontroller'
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
        externalChangeTimer = window.setTimeout(() => scoreChanged(), 0)
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

/** like MuseScore's tab: the file name without extension; the score title as tooltip */
function publishName(): void {
    const title = score ? fileName.replace(/\.mscx?z?$/i, '') : ''
    publish({ hasScore: !!score, title, tooltip: score ? [scoreTitle(score), fileName].filter(Boolean).join(' – ') : '' })
    document.title = score ? `${title} – MuseScore Web` : 'MuseScore Web'
}

/** the score got another file name (Save as) */
export function setScoreName(name: string): void {
    fileName = name
    publishName()
}

function buildPages(keepPosition = false): void {
    const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop }
    observer.disconnect()
    visible.clear()
    pagesDiv.replaceChildren()
    pages = []

    publishName()

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
export function scoreChanged(scroll = true): void {
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
    selectionChanged(scroll)
    updateTextInput()
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

// images of the score are decoded asynchronously: draw the pages again when one is available
onImageDecoded(() => {
    for (const el of pages) {
        delete el.querySelector('canvas')!.dataset.dpi
    }
    scheduleRender(0)
})

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

// ---------------------------------------------------------------------------------
//   mouse: MuseScore's NotationViewInputController (click selection, drag of elements and grips, Shift+drag on
//   empty space: lasso, double click: text editing, triple click: select the text)
// ---------------------------------------------------------------------------------

/** the page under the pointer, or the nearest one, and the point on it (inches; may be outside of the page) */
function pagePointAt(clientX: number, clientY: number): { page: number; x: number; y: number; dpi: number } | null {
    if (!score || !pages.length) {
        return null
    }
    let best: HTMLDivElement | null = null
    let bestDist = Infinity
    for (const el of visible.size ? visible : pages) {
        if (!el.isConnected) {
            continue
        }
        const r = el.getBoundingClientRect()
        const dx = Math.max(r.left - clientX, 0, clientX - r.right)
        const dy = Math.max(r.top - clientY, 0, clientY - r.bottom)
        const d = dx * dx + dy * dy
        if (d < bestDist) {
            bestDist = d
            best = el
        }
    }
    if (!best) {
        return null
    }
    const idx = Number(best.dataset.page)
    const r = best.getBoundingClientRect()
    const cssDpi = r.width / pageSize(score, idx).width
    return { page: idx, x: (clientX - r.left) / cssDpi, y: (clientY - r.top) / cssDpi, dpi: cssDpi }
}

const isMacPlatform = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function pointerEvent(e: MouseEvent): ViewPointerEvent | null {
    const pt = pagePointAt(e.clientX, e.clientY)
    if (!pt) {
        return null
    }
    return {
        ...pt, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons,
        shift: e.shiftKey, ctrl: isMacPlatform ? e.metaKey : e.ctrlKey, alt: e.altKey,
    }
}

let mouse: { id: number; lastX: number; lastY: number } | null = null
let tripleClickTimer = 0

viewport.addEventListener('pointerdown', (e) => {
    if (!score || spaceDown || (e.button !== 0 && e.button !== 2)) {
        return
    }
    if (e.button === 2 && noteInputState(score).active) {
        return // the right click removes a note (contextmenu)
    }
    const ev = pointerEvent(e)
    if (!ev) {
        return
    }
    mouse = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY }
    viewport.setPointerCapture(e.pointerId)
    const noteInput = noteInputState(score).active
    viewMousePress(score, ev)
    // in note input mode a click puts a note (a new layout)
    afterViewInput(noteInput)
})

viewport.addEventListener('pointermove', (e) => {
    if (!score || !mouse || mouse.id !== e.pointerId) {
        return
    }
    const ev = pointerEvent(e)
    if (!ev) {
        return
    }
    const r = viewMouseMove(score, ev)
    if (r.outgoingDrag) {
        startOutgoingDrag(r.outgoingDrag)
    }
    if (outgoing) {
        moveOutgoingDrag(e.clientX, e.clientY)
    } else if (r.moveCanvas) {
        // move the canvas with the pointer (like the hand tool)
        viewport.scrollLeft -= e.clientX - mouse.lastX
        viewport.scrollTop -= e.clientY - mouse.lastY
    } else if (isDragging(score) || textEditingInfo(score).active) {
        afterViewInput(false, false)
    }
    mouse.lastX = e.clientX
    mouse.lastY = e.clientY
})

const releasePointer = (e: PointerEvent): void => {
    if (!score || !mouse || mouse.id !== e.pointerId) {
        return
    }
    mouse = null
    endOutgoingDrag(e.type === 'pointerup' ? e : null)
    const ev = pointerEvent(e)
    if (ev) {
        viewMouseRelease(score, { ...ev, buttons: e.buttons })
    }
    afterViewInput(true)
}
viewport.addEventListener('pointerup', releasePointer)
viewport.addEventListener('pointercancel', releasePointer)

viewport.addEventListener('dblclick', (e) => {
    if (!score || spaceDown) {
        return
    }
    const ev = pointerEvent(e)
    if (!ev) {
        return
    }
    viewMouseDoubleClick(score, ev)
    clearTimeout(tripleClickTimer)
    const s = score
    tripleClickTimer = window.setTimeout(() => viewResetTripleClick(s), 500) // QApplication::doubleClickInterval()
    afterViewInput(true)
})

// the context menu is not ported: a right click only selects (in note input mode it removes a note, see below)
viewport.addEventListener('contextmenu', (e) => {
    if (score && !noteInputState(score).active) {
        e.preventDefault()
    }
})

/** after a view event: repaint (with a new layout if the score changed), the status bar, the text input */
function afterViewInput(layoutChanged: boolean, scroll = false): void {
    if (!score) {
        return
    }
    // a click in note input mode puts a note, drags change the layout inside an open command: always a new paint
    void layoutChanged
    scoreChanged(scroll)
}

// ---------------------------------------------------------------------------------
//   drag and drop of palette cells onto the score (NotationViewInputController dragEnterEvent, dragMoveEvent,
//   dragLeaveEvent, dropEvent): the drop target is highlighted by the library's paint (drawPage)
// ---------------------------------------------------------------------------------

/** repaints the pages without a new layout (drag feedback) */
let repaintFrame = 0
function repaintPages(): void {
    if (repaintFrame) {
        return
    }
    repaintFrame = requestAnimationFrame(() => {
        repaintFrame = 0
        for (const el of pages) {
            delete el.querySelector('canvas')!.dataset.dpi
        }
        renderVisible()
    })
}

let dropActive = false

function dragEvent(e: DragEvent): ViewDragEvent | null {
    const pt = pagePointAt(e.clientX, e.clientY)
    return pt ? { page: pt.page, x: pt.x, y: pt.y, shift: e.shiftKey, ctrl: isMacPlatform ? e.metaKey : e.ctrlKey, alt: e.altKey } : null
}

function startDrop(): boolean {
    if (!score || dropActive || isBusy()) {
        return dropActive
    }
    const d = dragData()
    if (!d?.symbol) {
        return false
    }
    dropActive = viewDragEnter(score, d.symbol)
    return dropActive
}

function stopDrop(): void {
    if (dropActive && score) {
        viewDragLeave(score)
        repaintPages()
    }
    dropActive = false
}

viewport.addEventListener('dragenter', () => {
    startDrop()
})

viewport.addEventListener('dragover', (e) => {
    if (!score || !startDrop()) {
        return
    }
    const ev = dragEvent(e)
    const accepted = !!ev && viewDragMove(score, ev)
    e.preventDefault()
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = accepted ? 'copy' : 'none'
    }
    repaintPages()
})

viewport.addEventListener('dragleave', (e) => {
    if (dropActive && !viewport.contains(e.relatedTarget as Node | null)) {
        stopDrop()
    }
})

viewport.addEventListener('drop', (e) => {
    if (!score || !dropActive) {
        return
    }
    e.preventDefault()
    e.stopPropagation()
    const ev = dragEvent(e)
    dropActive = false
    setDragData(null)
    if (ev && viewDrop(score, ev)) {
        scoreChanged(false)
    } else {
        repaintPages()
    }
    viewport.focus({ preventScroll: true })
})

// a drag that ends elsewhere (Escape, a drop outside of the view)
document.addEventListener('dragend', () => {
    stopDrop()
    setDragData(null)
})

// ---------------------------------------------------------------------------------
//   an element dragged out of the score (Shift+Ctrl+drag: NotationInteraction::startOutgoingDragElement) onto a palette:
//   the pointer stays captured by the view, the element under it gets ELEMENT_DROP_EVENT at the end
// ---------------------------------------------------------------------------------

let outgoing: { drag: OutgoingElementDrag; ghost: HTMLElement; over: Element | null } | null = null

function startOutgoingDrag(drag: OutgoingElementDrag): void {
    const ghost = document.createElement('div')
    ghost.className = 'outgoing-drag-ghost'
    ghost.textContent = drag.name
    document.body.appendChild(ghost)
    outgoing = { drag, ghost, over: null }
}

function moveOutgoingDrag(clientX: number, clientY: number): void {
    if (!outgoing) {
        return
    }
    outgoing.ghost.style.left = `${clientX + 12}px`
    outgoing.ghost.style.top = `${clientY + 12}px`
    const grid = document.elementFromPoint(clientX, clientY)?.closest('[data-palette-grid]') ?? null
    if (grid !== outgoing.over) {
        outgoing.over?.classList.remove('drop-active')
        grid?.classList.add('drop-active')
        outgoing.over = grid
    }
}

function endOutgoingDrag(e: PointerEvent | null): void {
    if (!outgoing) {
        return
    }
    const { drag, ghost, over } = outgoing
    outgoing = null
    ghost.remove()
    over?.classList.remove('drop-active')
    const target = e ? document.elementFromPoint(e.clientX, e.clientY) : null
    if (e && target && !viewport.contains(target)) {
        const detail: ElementDropDetail = { mimeData: drag.mimeData, clientX: e.clientX, clientY: e.clientY }
        target.dispatchEvent(new CustomEvent(ELEMENT_DROP_EVENT, { bubbles: true, detail }))
    }
}

// ---------------------------------------------------------------------------------
//   text editing: keyboard input through a hidden text field at the text cursor (IME and dead keys work), the
//   cursor and the selection are painted by the library (MuseScore's EditModeRenderer)
// ---------------------------------------------------------------------------------

const textInput = document.createElement('textarea')
textInput.className = 'notation-text-input'
textInput.dataset.notationInput = ''
textInput.setAttribute('aria-label', 'Text')
textInput.setAttribute('autocomplete', 'off')
textInput.setAttribute('autocapitalize', 'off')
textInput.spellcheck = false
document.body.appendChild(textInput)

/** a DOM key event as the library's key event (Qt's Ctrl is Command on macOS) */
function viewKey(e: KeyboardEvent): ViewKeyEvent {
    return {
        key: e.key, code: e.code, shift: e.shiftKey, alt: e.altKey,
        ctrl: isMacPlatform ? e.metaKey : e.ctrlKey, meta: isMacPlatform ? e.ctrlKey : e.metaKey,
    }
}

/** the text field follows the text cursor and has the focus while a text is edited */
function updateTextInput(): void {
    const info = score ? textEditingInfo(score) : null
    if (!info || !info.active || !info.cursor) {
        textInput.classList.remove('active')
        textInput.style.left = '-1000px'
        if (document.activeElement === textInput) {
            viewport.focus({ preventScroll: true })
        }
        return
    }
    const el = pages[info.cursor.page]
    if (el) {
        const pr = el.getBoundingClientRect()
        const f = pr.width / pageSize(score!, info.cursor.page).width
        textInput.style.left = `${pr.left + info.cursor.x * f}px`
        textInput.style.top = `${pr.top + info.cursor.y * f}px`
        textInput.style.height = `${Math.max(8, info.cursor.height * f)}px`
        textInput.style.fontSize = `${Math.max(8, info.cursor.height * f * 0.8)}px`
    }
    textInput.classList.add('active')
    if (document.activeElement !== textInput) {
        textInput.focus({ preventScroll: true })
    }
}

textInput.addEventListener('keydown', (e) => {
    if (!score || e.isComposing || e.keyCode === 229) {
        return // the input method composes
    }
    const k = viewKey(e)
    if (viewShortcutOverride(score, k)) {
        e.preventDefault()
        e.stopPropagation()
        viewKeyPress(score, k)
        scoreChanged(false)
    }
    // otherwise the key is a shortcut (actions.ts: lyrics navigation, Escape, Ctrl+B, ...)
})

textInput.addEventListener('compositionupdate', (e) => {
    if (score) {
        viewInputText(score, '', e.data)
        scoreChanged(false)
    }
})

textInput.addEventListener('compositionend', (e) => {
    if (score) {
        viewInputText(score, e.data)
        textInput.value = ''
        scoreChanged(false)
    }
})

textInput.addEventListener('input', (e) => {
    const ie = e as InputEvent
    if (score && !ie.isComposing && ie.inputType === 'insertText' && ie.data) {
        // characters that came without a usable keydown (e.g. on-screen keyboards)
        viewInputText(score, ie.data)
        scoreChanged(false)
    }
    if (!ie.isComposing) {
        textInput.value = ''
    }
})

// the global shortcuts (actions.ts) leave the keys the edited element takes (MuseScore's shortcutOverrideEvent)
setShortcutOverride((e) => {
    if (!score || document.body.dataset.view !== 'score' || e.isComposing) {
        return false
    }
    const t = e.target as Element | null
    if (t !== textInput && t !== viewport && t !== document.body) {
        return false
    }
    return viewShortcutOverride(score, viewKey(e))
})

// ---------------------------------------------------------------------------------
//   clipboard: MuseScore's clipboard formats through the copy/cut/paste events (custom mime types in the
//   DataTransfer); the library's in-memory clipboard is the fallback (and serves the Edit menu's Paste)
// ---------------------------------------------------------------------------------

function clipboardTarget(e: ClipboardEvent): boolean {
    const t = e.target as Element | null
    return !!score && document.body.dataset.view === 'score' && (t === textInput || t === viewport || t === document.body || !!t?.closest?.('#viewport'))
}

function writeClipboard(e: ClipboardEvent): void {
    const data = clipboardContents()
    if (!e.clipboardData || !Object.keys(data).length) {
        return
    }
    for (const [format, text] of Object.entries(data)) {
        try {
            e.clipboardData.setData(format, text)
        } catch {
            // a browser that does not accept the custom type: the in-memory clipboard keeps it
        }
    }
    e.preventDefault()
}

document.addEventListener('copy', (e) => {
    if (clipboardTarget(e) && executeAction(score!, 'action://notation/copy')) {
        writeClipboard(e)
    }
})

document.addEventListener('cut', (e) => {
    if (clipboardTarget(e) && isActionEnabled(score!, 'action://notation/cut')) {
        executeAction(score!, 'action://notation/copy')
        writeClipboard(e)
        executeAction(score!, 'action://notation/delete')
        scoreChanged()
    }
})

document.addEventListener('paste', (e) => {
    if (!clipboardTarget(e)) {
        return
    }
    e.preventDefault()
    const dt = e.clipboardData
    if (dt) {
        const data: Record<string, string> = {}
        for (const format of [...CLIPBOARD_FORMATS, 'text/plain']) {
            const d = dt.getData(format)
            if (d) {
                data[format] = d
            }
        }
        const hasMuseScoreData = CLIPBOARD_FORMATS.some(f => f in data)
        const imageFile = hasMuseScoreData ? null : [...dt.files].find(f => f.type.startsWith('image/') && f.type !== 'image/svg+xml')
        if (imageFile) {
            // an image (Score::cmdPaste with QMimeData::hasImage): read the file, then paste
            imageFile.arrayBuffer().then((buf) => {
                if (!score) {
                    return
                }
                setClipboardImage(new Uint8Array(buf))
                if (executeAction(score, 'action://notation/paste')) {
                    scoreChanged()
                }
            }).catch(() => {})
            return
        }
        const current = clipboardContents()
        // the system clipboard has something else than what was copied here: paste that
        if (hasMuseScoreData || (data['text/plain'] !== undefined && data['text/plain'] !== current['text/plain'])) {
            setClipboardContents(data)
        }
    }
    if (executeAction(score!, 'action://notation/paste')) {
        scoreChanged()
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

// in full screen the app's chrome is collapsed: the menu bar and toolbars at the top, the bottom toolbar dock and the
// status bar at the bottom, the panels at the left (right to left: right) edge; each part is shown while the pointer is
// at its edge or on it, or while it has the keyboard focus
type Edge = 'top' | 'bottom' | 'side'

const EDGE_CLASS: Record<Edge, string> = { top: 'toolbar-shown', bottom: 'bottom-shown', side: 'panels-shown' }
const edges: Record<Edge, { el: HTMLElement | null; timer: number }> = {
    top: { el: null, timer: 0 },
    bottom: { el: null, timer: 0 },
    side: { el: null, timer: 0 },
}
const EDGES = Object.keys(edges) as Edge[]

const isFullscreen = (): boolean => document.body.classList.contains('fullscreen')
const isShown = (edge: Edge): boolean => document.body.classList.contains(EDGE_CLASS[edge])

function showEdge(edge: Edge, autoHideMs = 0): void {
    clearTimeout(edges[edge].timer)
    document.body.classList.add(EDGE_CLASS[edge])
    if (autoHideMs) {
        edges[edge].timer = window.setTimeout(() => hideEdge(edge), autoHideMs)
    }
}

function hideEdge(edge: Edge): void {
    clearTimeout(edges[edge].timer)
    const el = edges[edge].el
    if (el && (el.matches(':hover') || el.matches(':has(:focus-visible)') || el.matches(':has([aria-expanded="true"])'))) {
        return // pointer on it, keyboard navigation or an open menu in it
    }
    document.body.classList.remove(EDGE_CLASS[edge])
}

document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement
    document.body.classList.toggle('fullscreen', fs)
    publish({ fullscreen: fs })
    for (const edge of EDGES) {
        if (fs) {
            // briefly, so it is clear where it went
            showEdge(edge, 1200)
        } else {
            clearTimeout(edges[edge].timer)
            document.body.classList.remove(EDGE_CLASS[edge])
        }
    }
})

/** the elements that are collapsed in full screen (set by the React app): the chrome at the top, the bottom bars, the panels */
export function setChrome(el: HTMLElement, edge: Edge = 'top'): void {
    edges[edge].el = el
    el.addEventListener('pointerenter', () => clearTimeout(edges[edge].timer))
    el.addEventListener('focusin', () => {
        if (isFullscreen()) {
            showEdge(edge)
        }
    })
    el.addEventListener('focusout', () => {
        if (isFullscreen() && !el.matches(':hover')) {
            edges[edge].timer = window.setTimeout(() => hideEdge(edge), 300)
        }
    })
}

for (const [edge, id] of [['top', 'toolbar-trigger'], ['bottom', 'bottom-trigger'], ['side', 'side-trigger']] as const) {
    $(id).addEventListener('pointerenter', () => showEdge(edge))
    $(id).addEventListener('pointerdown', () => showEdge(edge, 3000)) // touch: tap at the edge
}

/** how far the pointer is away from a shown part, towards the score (negative: on it) */
function distanceFromEdge(edge: Edge, r: DOMRect, x: number, y: number): number {
    switch (edge) {
    case 'top': return y - r.bottom
    case 'bottom': return r.top - y
    case 'side': return document.documentElement.dir === 'rtl' ? r.left - x : x - r.right
    }
}

// hidden when the pointer is clearly away from it (not on leaving it: an open menu or list is outside of it)
document.addEventListener('pointermove', (e) => {
    if (!isFullscreen()) {
        return
    }
    for (const edge of EDGES) {
        const el = edges[edge].el
        if (!el || !isShown(edge)) {
            continue
        }
        const d = distanceFromEdge(edge, el.getBoundingClientRect(), e.clientX, e.clientY)
        if (d > 24) {
            clearTimeout(edges[edge].timer)
            edges[edge].timer = window.setTimeout(() => hideEdge(edge), 300)
        } else if (d <= 0) {
            clearTimeout(edges[edge].timer)
        }
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

    if (e.target === viewport && viewShortcutOverride(score, viewKey(e))) {
        // the selected or edited element takes the key (MuseScore's shortcutOverrideEvent / keyPressEvent)
        e.preventDefault()
        viewKeyPress(score, viewKey(e))
        scoreChanged(false)
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
