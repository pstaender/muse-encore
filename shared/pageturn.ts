// SPDX-License-Identifier: GPL-3.0-only
// Not in MuseScore: the view follows the playback and the playalong in both apps by turning the "page" early (instead
// of following the cursor), so it moves seldom and the bars played next are visible before they are reached (the
// number of bars ahead is a setting; "the bar after it" below means these bars):
// - page view, the page (or the spread) fits the view's width: when the current bar is on a page that is not in the
//   view (or the bar after it is cut off and its page is not fully in the view), the page is centered (the bar starts
//   at the left of the view); vertically the same if the page fits, else the current bar's system goes to the top when
//   the bar after it would be cut off.
// - page view, the page is wider than the view: when the bar after the current one is cut off, the page is aligned to
//   the right if the current bar stays visible, else the current bar goes to the left of the view (repeated until the
//   end of the page); vertically like above.
// - continuous views: when the bar after the current one is cut off, the current bar goes to the left (top) of the view;
//   they only move in their direction (the position across it stays where the user put it).

/** the most bars ahead the setting offers (the playalong passes this many) */
export const MAX_PAGE_TURN_BARS = 4
/** the default number of bars ahead */
export const DEFAULT_PAGE_TURN_BARS = 2

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
    /**
     * the bars played next (the setting's number of bars; none: the view moves only when the current bar is cut off), in
     * reading order (not after a jump back); a bar that cannot be shown together with the current one is not waited for
     */
    ahead?: readonly ContentBox[]
    /** the space kept around the bars */
    margin: number
}

/** the rounding of the zoom (e.g. the fit modes) */
const FIT_TOLERANCE = 1

/** the change of the scroll position (dx, dy); 0, 0: the view stays */
export function pageTurnDelta(input: PageTurnInput): { dx: number; dy: number } {
    const { mode, view, page, current, margin } = input
    const width = view.right - view.left
    const height = view.bottom - view.top
    const inX = (b: ContentBox): boolean => b.left >= view.left - FIT_TOLERANCE && b.right <= view.right + FIT_TOLERANCE
    const inY = (b: ContentBox): boolean => b.top >= view.top - FIT_TOLERANCE && b.bottom <= view.bottom + FIT_TOLERANCE
    const context = input.context && input.context.right - input.context.left + 2 * margin <= width ? input.context : current
    const ahead = input.ahead ?? []
    // cut off, and it could be shown together with the current bar (from the left / top of the view)
    const aheadOutX = ahead.some(b => !inX(b) && b.right - Math.min(b.left, current.left) + 2 * margin <= width)
    const aheadOutY = ahead.some(b => !inY(b) && b.bottom - Math.min(b.top, current.top) + 2 * margin <= height)
    let dx = 0
    let dy = 0

    if (mode !== 'continuous-vertical') {
        if (mode === 'page' && page.right - page.left <= width + FIT_TOLERANCE) {
            // the page fits: centered when the current bar is on a page that is not shown, or when the bar after it is
            // cut off and the page is not fully in the view
            if (!inX(current) || (aheadOutX && !inX(page))) {
                dx = (page.left + page.right) / 2 - (view.left + width / 2)
            }
        } else if (!inX(current) || aheadOutX) {
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
            if (!inY(current) || (aheadOutY && !inY(page))) {
                dy = (page.top + page.bottom) / 2 - (view.top + height / 2)
            }
        } else if (!inY(current) || aheadOutY) {
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

/**
 * the bars ahead in the scrolled content (`toBox`), as long as they follow each other in reading order (not after a
 * jump back) and are on a page shown
 */
export function followingBars(current: PageBarRect, ahead: readonly PageBarRect[],
                              toBox: (bar: PageBarRect) => ContentBox | null): ContentBox[] {
    const result: ContentBox[] = []
    let prev = current
    for (const n of ahead) {
        const b = followsInReadingOrder(prev, n) ? toBox(n) : null
        if (!b) {
            break
        }
        result.push(b)
        prev = n
    }
    return result
}

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
