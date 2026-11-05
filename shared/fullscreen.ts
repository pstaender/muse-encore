// SPDX-License-Identifier: GPL-3.0-only
// The Fullscreen API of both apps (WebKit workarounds).

type WebKitDocument = Document & { webkitFullscreenElement?: Element | null }

/** the element in full screen (Safari before 16.4: only the prefixed property) */
export function fullscreenElement(): Element | null {
    return document.fullscreenElement ?? (document as WebKitDocument).webkitFullscreenElement ?? null
}

/**
 * calls fn when the full screen changes. WebKit (iOS/iPadOS): during the event fullscreenElement can still be the
 * one before the change (entering looked like leaving and the other way round), so it is read a frame later;
 * the prefixed event of older Safari versions too
 */
export function onFullscreenChange(fn: () => void, signal?: AbortSignal): void {
    let frame = 0
    const changed = (): void => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => requestAnimationFrame(fn))
    }
    document.addEventListener('fullscreenchange', changed, { signal })
    document.addEventListener('webkitfullscreenchange', changed, { signal })
}

/**
 * touch input (iOS): a tapped element keeps :hover until the next tap elsewhere, so :hover does not mean that a
 * pointer is on it
 */
let touch = false
document.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch' }, { capture: true, passive: true })
document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') touch = false }, { capture: true, passive: true })
document.addEventListener('keydown', () => { touch = false }, { capture: true, passive: true })

/** the last input was a touch: a focus that leaves a bar comes from the tap elsewhere, not from the keyboard */
export function touchInput(): boolean {
    return touch
}

/** the pointer is on the element (not a :hover left over from a tap) */
export function pointerIsOn(el: Element): boolean {
    return !touch && el.matches(':hover')
}
