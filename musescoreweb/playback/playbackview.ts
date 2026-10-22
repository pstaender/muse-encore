/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The playback in the score view (MuseScore's AbstractNotationPaintView: the playback cursor and the loop markers):
 * the cursor (the vertical line at the play position, PlaybackCursor) while playing, moved each frame; the view follows
 * it ("Pan score automatically": adjustCanvasPosition; paused for 2 s when the user moves the view); the markers of
 * the loop boundaries (LoopMarker) while the loop is on. Both are elements on the page elements (in percent of the
 * page, so they follow the zoom).
 */
import { loopMarkers, playbackCursorBounds, pageSystemCount } from '../../src/index'
import { settings } from '../settings'
import { adjustViewToRect, currentScore, onPagesBuilt, onScoreViewChanged, onUserMovedView, pageElement, pageInches, scoreViewState } from '../scoreview'
import { onPlaybackPosition, onPlaybackStateChanged, playbackState } from './playbackcontroller'

const SVG_NS = 'http://www.w3.org/2000/svg'

const cursor = document.createElement('div')
cursor.className = 'playback-cursor'
cursor.setAttribute('aria-hidden', 'true')
cursor.hidden = true

let s_autoScrollEnabled = true
let s_autoScrollTimer = 0

onUserMovedView(() => {
    if (!playbackState().playing) {
        return
    }
    s_autoScrollEnabled = false
    clearTimeout(s_autoScrollTimer)
    s_autoScrollTimer = window.setTimeout(() => { s_autoScrollEnabled = true }, 2000)
})

function placeInPage(el: HTMLElement | SVGElement, page: number, r: { x: number; y: number; width: number; height: number }): boolean {
    const pageEl = pageElement(page)
    const size = pageInches(page)
    if (!pageEl || !size) {
        return false
    }
    if (el.parentElement !== pageEl) {
        pageEl.appendChild(el)
    }
    el.style.left = `${r.x / size.width * 100}%`
    el.style.top = `${r.y / size.height * 100}%`
    el.style.width = `${r.width / size.width * 100}%`
    el.style.height = `${r.height / size.height * 100}%`
    return true
}

/** AbstractNotationPaintView::movePlaybackCursor */
function movePlaybackCursor(tick: number, playing: boolean): void {
    const score = currentScore()
    if (!score || !playing) {
        cursor.hidden = true
        return
    }
    const b = playbackCursorBounds(score, tick)
    if (!b || !placeInPage(cursor, b.page, b)) {
        cursor.hidden = true
        return
    }
    cursor.hidden = false

    if (settings().playback.pan && s_autoScrollEnabled) {
        // needAdjustCanvasVerticallyWhilePlayback: vertically if the cursor is not in the view or the page has more systems
        const r = cursor.getBoundingClientRect()
        const vr = document.getElementById('viewport')!.getBoundingClientRect()
        const inView = r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom
        const adjustVertically = !inView || pageSystemCount(score, b.page) > 1
        // BORDER_SPACING_RATIO = 3 spatium; the cursor is 0.4 spatium wide
        adjustViewToRect(b.page, b, adjustVertically, 3 * b.width / 0.4)
    }
}

onPlaybackPosition(movePlaybackCursor)

onPlaybackStateChanged(() => {
    if (!playbackState().playing) {
        cursor.hidden = true
        s_autoScrollEnabled = true
        clearTimeout(s_autoScrollTimer)
    }
})

// ---------------------------------------------------------------------------------
//   loop markers
// ---------------------------------------------------------------------------------

let s_markers: SVGSVGElement[] = []

function updateLoopMarkers(): void {
    for (const m of s_markers) {
        m.remove()
    }
    s_markers = []
    const score = currentScore()
    if (!score || !playbackState().loopEnabled) {
        return
    }
    for (const g of loopMarkers(score)) {
        const xs = [g.x, ...g.triangle.map(p => p.x)]
        const left = Math.min(...xs) - g.lineWidth
        const right = Math.max(...xs) + g.lineWidth
        const top = g.top
        const height = g.bottom - g.top
        const svg = document.createElementNS(SVG_NS, 'svg')
        svg.classList.add('loop-marker')
        svg.setAttribute('aria-hidden', 'true')
        svg.setAttribute('viewBox', `${left} ${top} ${right - left} ${height}`)
        svg.setAttribute('preserveAspectRatio', 'none')
        const line = document.createElementNS(SVG_NS, 'line')
        line.setAttribute('x1', String(g.x))
        line.setAttribute('x2', String(g.x))
        line.setAttribute('y1', String(g.top))
        line.setAttribute('y2', String(g.bottom))
        line.setAttribute('stroke', g.color)
        line.setAttribute('stroke-width', String(g.lineWidth))
        const triangle = document.createElementNS(SVG_NS, 'polygon')
        triangle.setAttribute('points', g.triangle.map(p => `${p.x},${p.y}`).join(' '))
        triangle.setAttribute('fill', g.color)
        svg.append(line, triangle)
        if (placeInPage(svg, g.page, { x: left, y: top, width: right - left, height })) {
            s_markers.push(svg)
        }
    }
}

let s_loopVersion = -1
let s_loopEnabled = false
onPlaybackStateChanged(() => {
    const st = playbackState()
    if (st.loopVersion !== s_loopVersion || st.loopEnabled !== s_loopEnabled) {
        s_loopVersion = st.loopVersion
        s_loopEnabled = st.loopEnabled
        updateLoopMarkers()
    }
})

let s_scoreVersion = -1
onScoreViewChanged(() => {
    const v = scoreViewState().scoreVersion
    if (v !== s_scoreVersion) {
        s_scoreVersion = v
        updateLoopMarkers()
    }
})

onPagesBuilt(() => {
    updateLoopMarkers()
    const st = playbackState()
    movePlaybackCursor(st.tick, st.playing)
})
