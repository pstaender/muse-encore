// SPDX-License-Identifier: GPL-3.0-only
// The view following the playback and the playalong in both apps (iOS workaround).

export interface ContentRect { left: number; top: number; right: number; bottom: number; width: number; height: number }

/**
 * the rectangle of an element of the pages in the scrolled content of the viewport (a positioned scroll container):
 * the offsets do not depend on the scroll position. iOS Safari: the client rectangles can still show the old scroll
 * position for a frame after the view was scrolled, so moving the view by their difference moved it twice (it
 * flashed or jumped back and forth)
 */
export function contentRect(viewport: HTMLElement, el: HTMLElement): ContentRect {
    let left = 0
    let top = 0
    for (let e: HTMLElement | null = el; e && e !== viewport; e = e.offsetParent as HTMLElement | null) {
        left += e.offsetLeft
        top += e.offsetTop
    }
    const { width, height } = el.getBoundingClientRect()
    return { left, top, right: left + width, bottom: top + height, width, height }
}

/** the visible part of the content (contentRect coordinates) */
export function viewRect(viewport: HTMLElement): ContentRect {
    const left = viewport.scrollLeft
    const top = viewport.scrollTop
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    return { left, top, right: left + width, bottom: top + height, width, height }
}

/**
 * scrolls to a position (rounded and limited to the content: the same result when repeated); the position, or null
 * if the view is there already
 */
export function scrollViewTo(viewport: HTMLElement, left: number, top: number): { left: number; top: number } | null {
    const x = Math.round(Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, left)))
    const y = Math.round(Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, top)))
    if (x === viewport.scrollLeft && y === viewport.scrollTop) {
        return null
    }
    viewport.scrollTo(x, y)
    return { left: x, top: y }
}

/** a scroll event at the position the script scrolled to (it can come late, iOS): not a move by the user */
export function isAtScrollTarget(viewport: HTMLElement, target: { left: number; top: number } | null): boolean {
    return !!target && Math.abs(viewport.scrollLeft - target.left) <= 1 && Math.abs(viewport.scrollTop - target.top) <= 1
}
