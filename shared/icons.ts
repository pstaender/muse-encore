// SPDX-License-Identifier: GPL-3.0-only
// The SVG icons of both apps, for what MuseScore's icon font (MusescoreIcon) does not have.

/** carbon:center-to-fit (Iconify): the center button */
export const CENTER_ICON = {
    viewBox: '0 0 32 32',
    path: 'M8 2H2v6h2V4h4zm16 0h6v6h-2V4h-4zM8 30H2v-6h2v4h4zm16 0h6v-6h-2v4h-4zm0-6H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M8 10v12h16V10Z',
}

/** a comment (speech bubble; the markers of comments in the editor and the viewer) */
export const COMMENT_ICON_PATH = 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'

/** two opposite arrows (swap the scores of a comparison) */
export const SWAP_ICON = {
    viewBox: '0 0 24 24',
    path: 'M7 4 2.5 8.5 7 13v-3.25h9.5v-2.5H7zm10 7v3.25H7.5v2.5H17V20l4.5-4.5z',
}

/** two pages with a difference (compare scores) */
export const COMPARE_ICON = {
    viewBox: '0 0 24 24',
    path: 'M3 3h8v18H3zm2 2v14h4V5zm8-2h8v18h-8zm2 2v14h4V5zM6 9h2v2H6zm10 4h2v2h-2z',
}

/** an SVG element of an icon (1em, currentColor) */
export function svgIcon(icon: { viewBox: string; path: string }): string {
    return `<svg width="1em" height="1em" viewBox="${icon.viewBox}" aria-hidden="true" style="display:block"><path fill="currentColor" d="${icon.path}"/></svg>`
}
