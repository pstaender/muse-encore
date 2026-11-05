// SPDX-License-Identifier: GPL-3.0-only
// The accept attribute of the file inputs of both apps.

/**
 * iOS/iPadOS only (every browser there uses WebKit's file picker): the picker greys out the files whose suffix it does
 * not know as a file type (.mscz, .mscx, .mpal, ...) when the input has an accept attribute, so there it accepts all
 * files; the app reports a file it cannot read. iPadOS reports itself as a Mac (a Mac has no touch screen).
 */
export function fileInputAccept(accept: string): string {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    return ios ? '' : accept
}
