// SPDX-License-Identifier: GPL-3.0-only
// Not in MuseScore: the view follows the playback and the playalong in both apps by turning the "page" early (instead
// of following the cursor), so it moves seldom and the bar played next is visible before it is reached:
// - page view, the page (or the spread) fits the view's width: when the current bar is on a page that is not in the
//   view (or the bar after it is cut off and its page is not fully in the view), the page is centered (the bar starts
//   at the left of the view); vertically the same if the page fits, else the current bar's system goes to the top when
//   the bar after it would be cut off.
// - page view, the page is wider than the view: when the bar after the current one is cut off, the page is aligned to
//   the right if the current bar stays visible, else the current bar goes to the left of the view (repeated until the
//   end of the page); vertically like above.
// - continuous views: when the bar after the current one is cut off, the current bar goes to the left (top) of the view;
//   they only move in their direction (the position across it stays where the user put it).

export type PageTurnMode = 'page' | 'continuous-horizontal' | 'continuous-vertical'

/** a rectangle in the scrolled content of the viewport (shared/scrollview.ts contentRect) */
export interface ContentBox { left: number; top: number; right: number; bottom: number }

export interface PageTurnInput {
    mode: PageTurnMode
    /** the visible part of the content (without the continuous panel at the left edge) */
    view: ContentBox
    /** the page of the current bar (its spread if the spread fits the view's width) */
    page: ContentBox
    /** the current bar */
    current: ContentBox
    /** shown at the left instead of the current bar when it fits (contains it, e.g. with the bar before it) */
    context?: ContentBox | null
    /** the bar played next if it follows the current one in reading order (not a jump back) */
    next?: ContentBox | null
    /** the space kept around the bars */
    margin: number
}

/** the rounding of the zoom (e.g. the fit modes) */
const FIT_TOLERANCE = 1

/** the change of the scroll position (dx, dy); 0, 0: the view stays */
export function pageTurnDelta(input: PageTurnInput): { dx: number; dy: number } {
    const { mode, view, page, current, next, margin } = input
    const width = view.right - view.left
    const height = view.bottom - view.top
    const inX = (b: ContentBox): boolean => b.left >= view.left - FIT_TOLERANCE && b.right <= view.right + FIT_TOLERANCE
    const inY = (b: ContentBox): boolean => b.top >= view.top - FIT_TOLERANCE && b.bottom <= view.bottom + FIT_TOLERANCE
    const context = input.context && input.context.right - input.context.left + 2 * margin <= width ? input.context : current
    let dx = 0
    let dy = 0

    if (mode !== 'continuous-vertical') {
        if (mode === 'page' && page.right - page.left <= width + FIT_TOLERANCE) {
            // the page fits: centered when the current bar is on a page that is not shown, or when the bar after it is
            // cut off and the page is not fully in the view
            if (!inX(current) || (next && !inX(next) && !inX(page))) {
                dx = (page.left + page.right) / 2 - (view.left + width / 2)
            }
        } else if (!inX(current) || (next && !inX(next))) {
            let left = context.left - margin
            if (mode === 'page') {
                // the page aligned to the right, if the current bar stays visible
                const right = page.right - width
                left = current.left - margin >= right ? right : Math.min(left, right)
            }
            dx = left - view.left
        }
    }

    if (mode !== 'continuous-horizontal') {
        if (mode === 'page' && page.bottom - page.top <= height + FIT_TOLERANCE) {
            if (!inY(current) || (next && !inY(next) && !inY(page))) {
                dy = (page.top + page.bottom) / 2 - (view.top + height / 2)
            }
        } else if (!inY(current) || (next && !inY(next))) {
            let top = current.top - margin
            if (mode === 'page') {
                // not beyond the end of the page (the next page comes into the view with the next bar on it)
                top = Math.min(top, page.bottom + margin - height)
                if (current.top - margin < top || current.bottom > top + height) {
                    top = current.top - margin
                }
            }
            dy = top - view.top
        }
    }
    return { dx: Math.round(dx), dy: Math.round(dy) }
}

/** a bar's rectangle on a page (inches from the top left of the page) */
export interface PageBarRect { page: number; x: number; y: number; width: number; height: number }

/** true if `next` comes after `current` in reading order (a later page, a later system, or later on the system) */
export function followsInReadingOrder(current: PageBarRect, next: PageBarRect): boolean {
    if (next.page !== current.page) {
        return next.page > current.page
    }
    if (Math.abs(next.y - current.y) < 0.01) {
        return next.x > current.x
    }
    return next.y > current.y
}
