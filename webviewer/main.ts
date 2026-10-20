/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Web viewer: opens a .mscz/.mscx file and shows its pages (horizontally, vertically or as two-page spreads).
 * Keyboard shortcuts follow MuseScore Studio (src/app/configs/data/shortcuts.xml) where they make sense for a viewer.
 */
/// <reference types="vite/client" />
import {
    drawPage, initEngravingFonts, isTwoSided, layoutScore, loadScore, pageCount, pageSize, scoreTitle, type MasterScore,
} from '../src/index'
import { clearLastFile, loadLastFile, loadSettings, saveLastFile, saveSettings, type ViewSettings } from './storage'

// ---------------------------------------------------------------------------------
//   elements
// ---------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const viewport = $<HTMLElement>('viewport')
const pagesDiv = $<HTMLDivElement>('pages')
const emptyDiv = $<HTMLDivElement>('empty')
const statusEl = $<HTMLSpanElement>('status')
const titleEl = $<HTMLSpanElement>('title')
const fileInput = $<HTMLInputElement>('file')
const zoomSelect = $<HTMLSelectElement>('zoom')
const pageInfo = $<HTMLSpanElement>('page-info')
const btn = {
    open: $<HTMLButtonElement>('open'),
    open2: $<HTMLButtonElement>('open2'),
    clear: $<HTMLButtonElement>('clear'),
    prev: $<HTMLButtonElement>('prev'),
    next: $<HTMLButtonElement>('next'),
    layoutH: $<HTMLButtonElement>('layout-h'),
    layoutV: $<HTMLButtonElement>('layout-v'),
    spread: $<HTMLButtonElement>('spread'),
    zoomIn: $<HTMLButtonElement>('zoom-in'),
    zoomOut: $<HTMLButtonElement>('zoom-out'),
    print: $<HTMLButtonElement>('print'),
    fullscreen: $<HTMLButtonElement>('fullscreen'),
    help: $<HTMLButtonElement>('help'),
}
const helpDialog = $<HTMLDialogElement>('help-dialog')

// ---------------------------------------------------------------------------------
//   state
// ---------------------------------------------------------------------------------

/** MuseScore's zoom steps (NotationViewInputController::ZOOM_LEVELS) */
const ZOOM_LEVELS = [5, 10, 15, 25, 50, 75, 100, 150, 200, 400, 800, 1600]
const MIN_ZOOM = ZOOM_LEVELS[0]
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
const CSS_DPI = 96 // CSS pixels per inch at 100%
const MAX_CANVAS_PIXELS = 32 * 1024 * 1024 // per page bitmap, keeps memory bounded at high zoom
const PRINT_DPI = 200

const FIT_MODES = ['page-width', 'whole-page'] as const
type FitMode = typeof FIT_MODES[number]

let score: MasterScore | null = null
let fileName = ''
let settings: ViewSettings = loadSettings({ zoom: 'whole-page', orientation: 'horizontal', spread: false })
let zoom = 100 // current zoom in percent
let canvases: HTMLCanvasElement[] = []
const visible = new Set<HTMLCanvasElement>()
let renderTimer = 0

function fitMode(): FitMode | null {
    return (FIT_MODES as readonly string[]).includes(settings.zoom) ? settings.zoom as FitMode : null
}

function spreadActive(): boolean {
    return !!score && settings.spread && isTwoSided(score)
}

function setStatus(text: string, error = false): void {
    statusEl.textContent = text
    statusEl.parentElement!.classList.toggle('error', error)
}

// ---------------------------------------------------------------------------------
//   fonts and files
// ---------------------------------------------------------------------------------

const fontsReady = initEngravingFonts(async (path) => {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
    if (!res.ok) {
        throw new Error(`could not load font ${path}`)
    }
    return res.arrayBuffer()
}).then(() => setStatus('Ready'), (e: Error) => setStatus(`Error: ${e.message}`, true))

async function openData(name: string, data: ArrayBuffer, remember: boolean): Promise<void> {
    await fontsReady
    setStatus(`Loading ${name}…`)
    // let the browser paint the status before the (synchronous) layout
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)))
    try {
        const t0 = performance.now()
        const s = loadScore(data)
        layoutScore(s)
        const t1 = performance.now()
        score = s
        fileName = name
        buildPages()
        setStatus(`${name} · ${pageCount(s)} ${pageCount(s) === 1 ? 'page' : 'pages'} · layout ${Math.round(t1 - t0)} ms`)
        if (remember) {
            void saveLastFile({ name, data })
        }
    } catch (e) {
        console.error(e)
        setStatus(`Could not open ${name}: ${(e as Error).message}`, true)
    }
}

async function openFile(file: File): Promise<void> {
    await openData(file.name, await file.arrayBuffer(), true)
}

function closeFile(): void {
    score = null
    fileName = ''
    void clearLastFile()
    buildPages()
    setStatus('Ready')
}

// ---------------------------------------------------------------------------------
//   pages
// ---------------------------------------------------------------------------------

const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
        const c = e.target as HTMLCanvasElement
        if (e.isIntersecting) {
            visible.add(c)
        } else {
            visible.delete(c)
        }
    }
    scheduleRender(0)
    updatePageInfo()
}, { root: viewport, rootMargin: '50%' })

function makeCanvas(idx: number): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.className = 'page'
    c.dataset.page = String(idx)
    c.setAttribute('role', 'img')
    c.setAttribute('aria-label', `Page ${idx + 1}`)
    return c
}

function buildPages(): void {
    observer.disconnect()
    visible.clear()
    pagesDiv.replaceChildren()
    canvases = []

    const hasScore = !!score
    emptyDiv.hidden = hasScore
    btn.clear.hidden = !hasScore
    // like MuseScore's tab: the file name without extension; the score title as tooltip
    titleEl.textContent = score ? fileName.replace(/\.mscx?z?$/i, '') : 'MuseScore Web Viewer'
    titleEl.title = score ? [scoreTitle(score), fileName].filter(Boolean).join(' – ') : ''
    document.title = score ? `${titleEl.textContent} – MuseScore Web Viewer` : 'MuseScore Web Viewer'

    if (score) {
        const n = pageCount(score)
        for (let i = 0; i < n; ++i) {
            canvases.push(makeCanvas(i))
        }
        if (spreadActive()) {
            // two-sided layout: the first page is a right-hand page
            const placeholder = makeCanvas(0)
            placeholder.classList.add('placeholder')
            placeholder.removeAttribute('role')
            placeholder.setAttribute('aria-hidden', 'true')
            const items = [placeholder, ...canvases]
            for (let i = 0; i < items.length; i += 2) {
                const spread = document.createElement('div')
                spread.className = 'spread'
                spread.append(...items.slice(i, i + 2))
                pagesDiv.appendChild(spread)
            }
        } else {
            pagesDiv.append(...canvases)
        }
        for (const c of canvases) {
            observer.observe(c)
        }
    }

    updateControls()
    applyZoom(computeZoom())
    viewport.scrollTo(0, 0)
    viewport.focus({ preventScroll: true })
}

function pageCssSize(idx: number, z = zoom): { w: number; h: number } {
    const s = pageSize(score!, idx)
    const f = CSS_DPI * z / 100
    return { w: s.width * f, h: s.height * f }
}

/** sets the CSS size of all pages; the bitmaps are redrawn later */
function applyZoom(z: number): void {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
    if (score) {
        for (const c of canvases) {
            const { w, h } = pageCssSize(Number(c.dataset.page))
            c.style.width = `${w}px`
            c.style.height = `${h}px`
        }
        const ph = pagesDiv.querySelector<HTMLCanvasElement>('.placeholder')
        if (ph) {
            const { w, h } = pageCssSize(0)
            ph.style.width = `${w}px`
            ph.style.height = `${h}px`
        }
    }
    updateZoomSelect()
    scheduleRender(120)
}

function scheduleRender(delay: number): void {
    clearTimeout(renderTimer)
    renderTimer = window.setTimeout(renderVisible, delay)
}

function renderCanvas(c: HTMLCanvasElement, cssDpi: number): void {
    const idx = Number(c.dataset.page)
    const s = pageSize(score!, idx)
    let dpi = cssDpi * window.devicePixelRatio
    const pixels = s.width * s.height * dpi * dpi
    if (pixels > MAX_CANVAS_PIXELS) {
        dpi *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
    }
    const key = `${dpi.toFixed(3)}`
    if (c.dataset.rendered === key) {
        return
    }
    c.width = Math.max(1, Math.round(s.width * dpi))
    c.height = Math.max(1, Math.round(s.height * dpi))
    drawPage(score!, idx, c.getContext('2d')!, { dpi })
    c.dataset.rendered = key
}

function renderVisible(): void {
    if (!score) {
        return
    }
    const cssDpi = CSS_DPI * zoom / 100
    // draw one page per frame to keep the UI responsive
    const queue = [...visible].sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page))
    const step = (): void => {
        const c = queue.shift()
        if (!c || !score) {
            return
        }
        if (c.isConnected) {
            renderCanvas(c, cssDpi)
        }
        requestAnimationFrame(step)
    }
    step()
}

// all pages must be drawn for printing
window.addEventListener('beforeprint', () => {
    if (score) {
        for (const c of canvases) {
            renderCanvas(c, Math.max(PRINT_DPI / window.devicePixelRatio, CSS_DPI * zoom / 100))
        }
    }
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
    const gap = parseFloat(getComputedStyle(pagesDiv).paddingLeft) || 24
    const availW = viewport.clientWidth - 2 * gap
    const availH = viewport.clientHeight - 2 * gap
    const s = pageSize(score, 0)
    const pagesAcross = spreadActive() ? 2 : 1
    const zw = availW / (s.width * pagesAcross * CSS_DPI) * 100
    const zh = availH / (s.height * CSS_DPI) * 100
    return Math.max(MIN_ZOOM, mode === 'page-width' ? zw : Math.min(zw, zh))
}

function updateZoomSelect(): void {
    const custom = zoomSelect.querySelector<HTMLOptionElement>('option[data-custom]')
    const label = `${Math.round(zoom)}%`
    for (const o of zoomSelect.querySelectorAll<HTMLOptionElement>('option[data-level]')) {
        o.selected = false
    }
    const mode = fitMode()
    if (mode) {
        zoomSelect.value = mode
        if (custom) {
            custom.remove()
        }
        return
    }
    const level = ZOOM_LEVELS.find(l => Math.abs(l - zoom) < 0.5)
    if (level !== undefined) {
        custom?.remove()
        zoomSelect.value = String(level)
        return
    }
    let opt = custom
    if (!opt) {
        opt = document.createElement('option')
        opt.dataset.custom = '1'
        zoomSelect.prepend(opt)
    }
    opt.value = String(zoom)
    opt.textContent = label
    zoomSelect.value = opt.value
}

/** zooms keeping the score point under (clientX, clientY) in place */
function zoomAt(z: number, clientX?: number, clientY?: number): void {
    if (!score) {
        return
    }
    const rect = viewport.getBoundingClientRect()
    const x = clientX ?? rect.left + rect.width / 2
    const y = clientY ?? rect.top + rect.height / 2

    // anchor: the page under the point (or the nearest one) and the relative position on it
    let anchor: HTMLCanvasElement | null = null
    let best = Infinity
    for (const c of visible.size ? visible : canvases) {
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

function zoomStep(dir: 1 | -1): void {
    const next = dir > 0 ? ZOOM_LEVELS.find(l => l > zoom + 0.5) : [...ZOOM_LEVELS].reverse().find(l => l < zoom - 0.5)
    zoomAt(next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM))
}

function setFitMode(mode: FitMode): void {
    settings.zoom = mode
    saveSettings(settings)
    applyZoom(computeZoom())
}

for (const level of ZOOM_LEVELS) {
    const o = document.createElement('option')
    o.value = String(level)
    o.textContent = `${level}%`
    o.dataset.level = '1'
    zoomSelect.appendChild(o)
}

zoomSelect.addEventListener('change', () => {
    const v = zoomSelect.value
    if ((FIT_MODES as readonly string[]).includes(v)) {
        setFitMode(v as FitMode)
    } else {
        zoomAt(Number(v))
    }
    viewport.focus({ preventScroll: true })
})

new ResizeObserver(() => {
    if (fitMode()) {
        applyZoom(computeZoom())
    }
}).observe(viewport)

// ---------------------------------------------------------------------------------
//   layout and navigation
// ---------------------------------------------------------------------------------

function updateControls(): void {
    const has = !!score
    const horizontal = settings.orientation === 'horizontal'
    pagesDiv.className = horizontal ? 'horizontal' : 'vertical'
    btn.layoutH.setAttribute('aria-checked', String(horizontal))
    btn.layoutV.setAttribute('aria-checked', String(!horizontal))
    const twoSided = !!score && isTwoSided(score)
    btn.spread.disabled = !twoSided
    btn.spread.setAttribute('aria-pressed', String(spreadActive()))
    btn.spread.title = twoSided ? 'Two pages' : 'Two pages (only for scores with a two-sided page layout)'
    for (const b of [btn.prev, btn.next, btn.zoomIn, btn.zoomOut, btn.print, btn.layoutH, btn.layoutV]) {
        b.disabled = !has
    }
    zoomSelect.disabled = !has
    updatePageInfo()
}

function setOrientation(o: 'horizontal' | 'vertical'): void {
    const page = currentPage()
    settings.orientation = o
    saveSettings(settings)
    updateControls()
    if (fitMode()) {
        applyZoom(computeZoom())
    }
    goToPage(page, 'instant')
}

function toggleSpread(): void {
    const page = currentPage()
    settings.spread = !settings.spread
    saveSettings(settings)
    buildPages()
    goToPage(page, 'instant')
}

/** index of the page nearest to the start of the viewport */
function currentPage(): number {
    if (!canvases.length) {
        return 0
    }
    const r = viewport.getBoundingClientRect()
    const horizontal = settings.orientation === 'horizontal'
    // scrolled to the end: the last page (it may never reach the start of the viewport)
    const atEnd = horizontal
        ? viewport.scrollLeft > 0 && viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 1
        : viewport.scrollTop > 0 && viewport.scrollTop >= viewport.scrollHeight - viewport.clientHeight - 1
    if (atEnd) {
        for (let i = canvases.length - 1; i >= 0; --i) {
            const cr = canvases[i].getBoundingClientRect()
            if (horizontal ? cr.left < r.right : cr.top < r.bottom) {
                return i
            }
        }
    }
    let best = 0
    let bestDist = Infinity
    for (const c of canvases) {
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

function goToPage(idx: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!canvases.length) {
        return
    }
    const c = canvases[Math.max(0, Math.min(canvases.length - 1, idx))]
    // in a spread, scroll to the spread (its left page)
    const target = c.parentElement?.classList.contains('spread') ? c.parentElement : c
    const gap = parseFloat(getComputedStyle(pagesDiv).paddingLeft) || 0
    const vr = viewport.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    if (settings.orientation === 'horizontal') {
        viewport.scrollTo({ left: viewport.scrollLeft + tr.left - vr.left - gap, behavior })
    } else {
        viewport.scrollTo({ top: viewport.scrollTop + tr.top - vr.top - gap, behavior })
    }
}

function stepPage(dir: 1 | -1): void {
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
        pageInfo.textContent = '–'
        btn.prev.disabled = btn.next.disabled = true
        return
    }
    const n = canvases.length
    const cur = currentPage()
    const partner = spreadActive() && cur > 0 ? (cur % 2 === 1 ? cur + 1 : cur - 1) : -1
    const shown = partner >= 0 && partner < n ? `${Math.min(cur, partner) + 1}–${Math.max(cur, partner) + 1}` : `${cur + 1}`
    pageInfo.textContent = `${shown} / ${n}`
    btn.prev.disabled = cur <= 0
    btn.next.disabled = Math.max(cur, partner) >= n - 1
}

viewport.addEventListener('scroll', () => updatePageInfo(), { passive: true })

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

function toggleFullscreen(): void {
    if (document.fullscreenElement) {
        void document.exitFullscreen()
    } else {
        void document.documentElement.requestFullscreen?.()
    }
}

document.addEventListener('keydown', (e) => {
    if (helpDialog.open) {
        return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key

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
    if (mod && (key === '+' || key === '=')) {
        zoomStep(1)
    } else if (mod && (key === '-' || key === '_')) {
        zoomStep(-1)
    } else if (mod && key === '0') {
        zoomAt(100)
    } else if (mod && key.toLowerCase() === 'o') {
        fileInput.click()
    } else if (mod && key.toLowerCase() === 'p') {
        if (score) {
            window.print()
        }
    } else if (key === 'F11') {
        toggleFullscreen()
    } else if (!score || isTextInput(e.target)) {
        handled = false
    } else if (key === 'PageDown') {
        stepPage(1)
    } else if (key === 'PageUp') {
        stepPage(-1)
    } else if (key === 'Home') {
        goToPage(0)
    } else if (key === 'End') {
        goToPage(canvases.length - 1)
    } else if (!mod && key.startsWith('Arrow') && document.activeElement !== viewport) {
        // arrow keys scroll natively when the score has the focus
        const d = 60
        viewport.scrollBy({
            left: key === 'ArrowLeft' ? -d : key === 'ArrowRight' ? d : 0,
            top: key === 'ArrowUp' ? -d : key === 'ArrowDown' ? d : 0,
        })
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
//   buttons, file input, drag and drop
// ---------------------------------------------------------------------------------

btn.open.addEventListener('click', () => fileInput.click())
btn.open2.addEventListener('click', () => fileInput.click())
btn.clear.addEventListener('click', closeFile)
btn.prev.addEventListener('click', () => stepPage(-1))
btn.next.addEventListener('click', () => stepPage(1))
btn.layoutH.addEventListener('click', () => setOrientation('horizontal'))
btn.layoutV.addEventListener('click', () => setOrientation('vertical'))
btn.spread.addEventListener('click', toggleSpread)
btn.zoomIn.addEventListener('click', () => zoomStep(1))
btn.zoomOut.addEventListener('click', () => zoomStep(-1))
btn.print.addEventListener('click', () => window.print())
btn.fullscreen.addEventListener('click', toggleFullscreen)
btn.help.addEventListener('click', () => helpDialog.showModal())
helpDialog.addEventListener('close', () => viewport.focus({ preventScroll: true }))

// space must not activate the focused toolbar button (it is the hand tool)
for (const b of document.querySelectorAll('header button')) {
    b.addEventListener('keyup', (e) => {
        if ((e as KeyboardEvent).key === ' ') {
            e.preventDefault()
        }
    })
}

fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (f) {
        void openFile(f)
    }
    fileInput.value = ''
})

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
    if (f) {
        void openFile(f)
    }
})

// ---------------------------------------------------------------------------------
//   startup: ?url=<score url>, otherwise the last opened file
// ---------------------------------------------------------------------------------

updateControls()

const initialUrl = new URLSearchParams(location.search).get('url')
if (initialUrl) {
    void fetch(initialUrl)
        .then(res => {
            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`)
            }
            return res.arrayBuffer()
        })
        .then(data => openData(decodeURIComponent(initialUrl.split('/').pop() ?? 'score.mscz'), data, true))
        .catch((e: Error) => setStatus(`Could not load ${initialUrl}: ${e.message}`, true))
} else {
    void loadLastFile().then(f => {
        if (f) {
            void openData(f.name, f.data, false)
        }
    })
}
