/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The panels left of the score (MuseScore's NotationPage: the DockPanels "Palettes", "Layout" and "Properties" in
 * one group of tabs): which are open, the current tab and the width of the panel area. Kept in the settings.
 * Shown/hidden by the actions toggle-palettes, toggle-instruments and inspector (DockWindow::toggleDock).
 */
import { useSyncExternalStore } from 'react'
import type { TrString } from '../actions/uiactiondata'
import { settings, updateSettings } from '../settings'

export interface PanelInfo {
    /** the dock name (appshelltypes.h) */
    id: string
    title: TrString
    /** the action that shows/hides it (ApplicationUiActions::toggleDockActions) */
    toggleAction: string
}

/** in the order of NotationPage.qml */
export const PANELS: readonly PanelInfo[] = [
    { id: 'palettesPanel', title: ['appshell', 'Palettes'], toggleAction: 'toggle-palettes' },
    { id: 'instrumentsPanel', title: ['appshell', 'Layout'], toggleAction: 'toggle-instruments' },
    { id: 'inspectorPanel', title: ['appshell', 'Properties'], toggleAction: 'inspector' },
]

/** NotationPage.qml verticalPanelDefaultWidth (MuseScore's panels have this fixed width; here it can be changed) */
export const PANEL_DEFAULT_WIDTH = 300
export const PANEL_MIN_WIDTH = 220
export const PANEL_MAX_WIDTH = 640

export interface PanelsState {
    open: string[]
    current: string
    width: number
}

const DEFAULT_PANELS: PanelsState = { open: PANELS.map(p => p.id), current: 'palettesPanel', width: PANEL_DEFAULT_WIDTH }

function sanitize(): PanelsState {
    const s = settings().panels
    const known = PANELS.map(p => p.id)
    const open = known.filter(id => s.open.includes(id))
    const current = open.includes(s.current) ? s.current : open[0] ?? ''
    return { open, current, width: clampWidth(s.width) }
}

export function clampWidth(w: number): number {
    return Math.round(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, w)))
}

let current = sanitize()
const listeners = new Set<() => void>()

function save(next: PanelsState): void {
    current = next
    updateSettings('panels', next)
    for (const l of listeners) {
        l()
    }
}

export function panelsState(): PanelsState {
    return current
}

export function onPanelsChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function usePanels(): PanelsState {
    return useSyncExternalStore(onPanelsChanged, panelsState)
}

export function isPanelOpen(id: string): boolean {
    return current.open.includes(id)
}

/** DockWindow::setDockOpen: an opened panel becomes the current tab of its group */
export function setPanelOpen(id: string, open: boolean): void {
    const ids = PANELS.map(p => p.id).filter(p => p === id ? open : current.open.includes(p))
    const cur = open ? id : current.current === id ? ids[Math.max(0, current.open.indexOf(id) - 1)] ?? ids[0] ?? '' : current.current
    save({ ...current, open: ids, current: cur })
}

export function togglePanel(id: string): void {
    setPanelOpen(id, !isPanelOpen(id))
}

export function setCurrentPanel(id: string): void {
    if (current.open.includes(id) && current.current !== id) {
        save({ ...current, current: id })
    }
}

export function setPanelWidth(width: number): void {
    const w = clampWidth(width)
    if (w !== current.width) {
        save({ ...current, width: w })
    }
}

/** part of "Restore the default layout" */
export function restoreDefaultPanels(): void {
    save(structuredClone(DEFAULT_PANELS))
}
