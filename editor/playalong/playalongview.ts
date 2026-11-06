/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The playalong in the score view: the measure followed is highlighted (an element on its page, in percent of the
 * page like the playback cursor) and the view follows it like the playback: the page is turned early, when the measure
 * played next would be cut off (shared/pageturn.ts; not under the continuous panel); in the practice mode the measure
 * played before it is shown too if it fits.
 */
import { playalongMeasureBounds } from '../../src/index'
import { settings } from '../settings'
import { currentScore, followBar, previewJumpTarget, onPagesBuilt, pageElement, pageInches } from '../scoreview'
import { onPlayalongStateChanged, playalongState } from './playalongcontroller'

const marker = document.createElement('div')
marker.className = 'playalong-measure'
marker.setAttribute('aria-hidden', 'true')
marker.hidden = true

let s_shown = { tick: -1, active: false }
/** the playalong set the preview of the bar after a jump (it hides it when it ends) */
let s_previewed = false

function update(scroll: boolean): void {
    const st = playalongState()
    const score = currentScore()
    const b = score && st.active && st.tick >= 0 ? playalongMeasureBounds(score, st.tick) : null
    const pageEl = b ? pageElement(b.page) : null
    const size = b ? pageInches(b.page) : null
    if (!b || !pageEl || !size) {
        marker.hidden = true
        if (s_previewed) {
            s_previewed = false
            previewJumpTarget(null, [])
        }
        return
    }
    if (marker.parentElement !== pageEl) {
        pageEl.appendChild(marker)
    }
    marker.style.left = `${b.x / size.width * 100}%`
    marker.style.top = `${b.y / size.height * 100}%`
    marker.style.width = `${b.width / size.width * 100}%`
    marker.style.height = `${b.height / size.height * 100}%`
    marker.hidden = false
    if (scroll) {
        // the previous measure if it is on the same system before it
        const p = st.practice && st.prevTick >= 0 ? playalongMeasureBounds(score!, st.prevTick) : null
        const context = p && p.page === b.page && Math.abs(p.y - b.y) < 0.01 && p.x < b.x
            ? { x: p.x, y: b.y, width: b.x + b.width - p.x, height: b.height } : undefined
        // the measure played after a jump is previewed after the measure the jump is made from (continuous view), and
        // takes its place for the page turning
        const bars = previewJumpTarget(b, st.aheadTicks.map(t => playalongMeasureBounds(score!, t)).filter(x => !!x))
        s_previewed = true
        // the page is turned early for the bars ahead of the setting (shared/pageturn.ts); without "Turn pages early"
        // the view moves when the measure is cut off
        const web = settings().web
        followBar(b.page, b, context, web.pageTurn ? bars.slice(0, web.pageTurnBars) : [])
    }
}

onPlayalongStateChanged(() => {
    const st = playalongState()
    if (st.tick !== s_shown.tick || st.active !== s_shown.active) {
        s_shown = { tick: st.tick, active: st.active }
        update(true)
    }
})

onPagesBuilt(() => update(false))
