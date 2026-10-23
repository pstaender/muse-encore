/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The npm package "muse-encore-viewer": shows MuseScore files (.mscz/.mscx) in a web page, like an inline PDF viewer.
 *
 *   import applyMuseEncoreViewer from 'muse-encore-viewer'
 *   const viewer = applyMuseEncoreViewer(document.getElementById('score'), 'scores/example.mscz', { toolbarGroups: { playback: true } })
 */
import { MuseEncoreViewer as Viewer } from './museencoreviewer'
import type { MuseEncoreScoreSource, MuseEncoreViewer, MuseEncoreViewerOptions } from './types'

export type {
    ContinuousView, MuseEncoreScoreInfo, MuseEncoreScoreSource, MuseEncoreViewer, MuseEncoreViewerOptions, MuseEncoreViewerToolbarGroups,
} from './types'

/**
 * Shows a score in `target` (an element or a CSS selector); the viewer fills the element, which needs a height.
 * Returns the viewer (its `ready` promise resolves when the score is shown).
 */
export function applyMuseEncoreViewer(target: HTMLElement | string, source: MuseEncoreScoreSource,
    options: MuseEncoreViewerOptions = {}): MuseEncoreViewer {
    const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
    if (!element) {
        throw new Error(`applyMuseEncoreViewer: no element ${String(target)}`)
    }
    return new Viewer(element, source, options)
}

export default applyMuseEncoreViewer
