/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Demo app: open a .mscz/.mscx file and draw all pages onto canvases.
 */
/// <reference types="vite/client" />
import { drawPage, initEngravingFonts, layoutScore, loadScore, pageCount, pageSize, type MasterScore } from '../src/index'

const status = document.getElementById('status')!
const pagesDiv = document.getElementById('pages')!
const drop = document.getElementById('drop')!
const fileInput = document.getElementById('file') as HTMLInputElement
const zoom = document.getElementById('zoom') as HTMLInputElement

let score: MasterScore | null = null

const fontsReady = initEngravingFonts(async (path) => {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
    if (!res.ok) {
        throw new Error(`could not load font ${path}`)
    }
    return res.arrayBuffer()
}).then(() => { status.textContent = 'Ready' })

function render(): void {
    pagesDiv.replaceChildren()
    if (!score) {
        return
    }
    const cssDpi = 96 * Number(zoom.value) / 100
    const dpi = cssDpi * window.devicePixelRatio
    for (let i = 0; i < pageCount(score); ++i) {
        const size = pageSize(score, i)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(size.width * dpi)
        canvas.height = Math.round(size.height * dpi)
        canvas.style.width = `${size.width * cssDpi}px`
        pagesDiv.appendChild(canvas)
        drawPage(score, i, canvas.getContext('2d')!, { dpi })
    }
}

async function open(file: File): Promise<void> {
    await fontsReady
    status.textContent = `Loading ${file.name}…`
    try {
        const t0 = performance.now()
        const s = loadScore(await file.arrayBuffer())
        layoutScore(s)
        score = s
        const t1 = performance.now()
        render()
        drop.hidden = true
        status.textContent = `${file.name}: ${pageCount(s)} page(s), layout ${Math.round(t1 - t0)} ms, paint ${Math.round(performance.now() - t1)} ms`
    } catch (e) {
        console.error(e)
        status.textContent = `Error: ${(e as Error).message}`
    }
}

fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) {
        void open(fileInput.files[0])
    }
})
zoom.addEventListener('input', render)
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging') })
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
document.addEventListener('drop', (e) => {
    e.preventDefault()
    document.body.classList.remove('dragging')
    const f = e.dataTransfer?.files[0]
    if (f) {
        void open(f)
    }
})

// ?url=<score url> opens a score directly
const initialUrl = new URLSearchParams(location.search).get('url')
if (initialUrl) {
    void fetch(initialUrl)
        .then(res => res.blob())
        .then(blob => open(new File([blob], initialUrl.split('/').pop() ?? 'score.mscz')))
}
