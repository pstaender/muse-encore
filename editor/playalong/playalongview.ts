/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The playalong in the score view: the measure followed is highlighted (an element on its page, in percent of the
 * page like the playback cursor) and the view follows it: the measure is always fully visible (not under the continuous
 * panel); in the practice mode with the measure played before it if it fits. The view turns when the measure played next
 * would be cut off, and only in the direction of a continuous view (the user's position across it stays).
 */
import { playalongMeasureBounds } from '../../src/index'
import { currentScore, onPagesBuilt, pageElement, pageInches, showRectInView } from '../scoreview'
import { onPlayalongStateChanged, playalongState } from './playalongcontroller'

const marker = document.createElement('div')
marker.className = 'playalong-measure'
marker.setAttribute('aria-hidden', 'true')
marker.hidden = true

let s_shown = { tick: -1, active: false }

function update(scroll: boolean): void {
    const st = playalongState()
    const score = currentScore()
    const b = score && st.active && st.tick >= 0 ? playalongMeasureBounds(score, st.tick) : null
    const pageEl = b ? pageElement(b.page) : null
    const size = b ? pageInches(b.page) : null
    if (!b || !pageEl || !size) {
        marker.hidden = true
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
        // the measure played next if it follows on the page (not a jump back)
        const n = st.nextTick >= 0 ? playalongMeasureBounds(score!, st.nextTick) : null
        const ahead = n && n.page === b.page && (n.y > b.y + 0.01 || (Math.abs(n.y - b.y) < 0.01 && n.x > b.x)) ? n : undefined
        showRectInView(b.page, b, context, ahead)
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
