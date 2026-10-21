/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The state of the palettes panel (MuseScore's PaletteProvider / user palette tree and PaletteConfiguration):
 * which palettes are shown (the default palette tree with palettes added by "Add palettes" or hidden), which are
 * expanded, the palette settings of the panel's menu. Kept in the settings ("palettes"); the search and the
 * current cell only for the session.
 */
import { useSyncExternalStore } from 'react'
import { defaultPalettes, masterPalettes, type PaletteCellInfo, type PaletteInfo } from '../../../src/index'
import { settings, updateSettings } from '../../settings'

export interface PalettesSettings {
    /** palettes whose visibility differs from the default tree (palette id -> shown) */
    visible: Record<string, boolean>
    /** the expanded palettes */
    expanded: string[]
    /** PaletteConfiguration::isSinglePalette ("Open only one palette at a time") */
    singlePalette: boolean
    /** PaletteConfiguration::isSingleClickToOpenPalette */
    singleClickToOpen: boolean
}

const DEFAULTS: PalettesSettings = { visible: {}, expanded: [], singlePalette: false, singleClickToOpen: true }

function load(): PalettesSettings {
    const s = settings().palettes ?? {}
    const visible = s.visible && typeof s.visible === 'object' && !Array.isArray(s.visible)
        ? Object.fromEntries(Object.entries(s.visible).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean> : {}
    return {
        visible,
        expanded: Array.isArray(s.expanded) ? s.expanded.filter((x): x is string => typeof x === 'string') : DEFAULTS.expanded,
        singlePalette: typeof s.singlePalette === 'boolean' ? s.singlePalette : DEFAULTS.singlePalette,
        singleClickToOpen: typeof s.singleClickToOpen === 'boolean' ? s.singleClickToOpen : DEFAULTS.singleClickToOpen,
    }
}

export interface PalettesState extends PalettesSettings {
    /** the search field is open (PalettesPanelHeader.isSearchOpened) and its text */
    searchOpened: boolean
    searchText: string
    /** the cell last clicked or focused ("apply-current-palette-element") */
    currentCell: string | null
}

let current: PalettesState = { ...load(), searchOpened: false, searchText: '', currentCell: null }
const listeners = new Set<() => void>()

function set(patch: Partial<PalettesState>, persist = false): void {
    current = { ...current, ...patch }
    if (persist) {
        const { visible, expanded, singlePalette, singleClickToOpen } = current
        updateSettings('palettes', { visible, expanded, singlePalette, singleClickToOpen })
    }
    for (const l of listeners) {
        l()
    }
}

export function palettesState(): PalettesState {
    return current
}

export function usePalettesState(): PalettesState {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => current,
    )
}

/** the palettes of the user tree that are shown (PaletteProvider's visibility filter model) */
export function shownPalettes(all: readonly PaletteInfo[]): PaletteInfo[] {
    return all.filter(p => current.visible[p.id] ?? p.visible)
}

/** PaletteProvider::availableExtraPalettesModel: the hidden palettes of the user tree */
export function hiddenPalettes(all: readonly PaletteInfo[]): PaletteInfo[] {
    return all.filter(p => !(current.visible[p.id] ?? p.visible))
}

export function setPaletteVisible(id: string, visible: boolean): void {
    set({ visible: { ...current.visible, [id]: visible } }, true)
}

export function isPaletteExpanded(id: string): boolean {
    return current.expanded.includes(id)
}

export function setPaletteExpanded(id: string, expanded: boolean): void {
    let list = current.expanded.filter(x => x !== id)
    if (expanded) {
        list = current.singlePalette ? [id] : [...list, id]
    }
    set({ expanded: list }, true)
}

export function expandCollapseAll(expand: boolean, ids: readonly string[]): void {
    set({ expanded: expand ? [...ids] : [] }, true)
}

export function setSinglePalette(v: boolean): void {
    set({ singlePalette: v, expanded: v ? current.expanded.slice(-1) : current.expanded }, true)
}

export function setSingleClickToOpen(v: boolean): void {
    set({ singleClickToOpen: v }, true)
}

export function startSearch(): void {
    set({ searchOpened: true })
}

export function endSearch(): void {
    set({ searchOpened: false, searchText: '' })
}

export function setSearchText(text: string): void {
    set({ searchText: text })
}

export function setCurrentCell(id: string | null): void {
    if (current.currentCell !== id) {
        set({ currentCell: id })
    }
}

/** "Restore the default layout" does not reset the palettes in MuseScore; "Revert to factory settings" does */
export function resetPalettesState(): void {
    current = { ...DEFAULTS, searchOpened: false, searchText: '', currentCell: null }
    for (const l of listeners) {
        l()
    }
}

// ---------------------------------------------------------------------------------
//   the palette trees (created once; names translated on each call)
// ---------------------------------------------------------------------------------

/** the default palette tree with the current language */
export function userPalettes(): PaletteInfo[] {
    return defaultPalettes()
}

/**
 * The search result (PaletteProvider::setFilter: the master palette filtered by the translated cell names,
 * case insensitive); `actionName` resolves the names of action cells.
 */
export function searchPalettes(text: string, actionName: (cell: PaletteCellInfo) => string): PaletteInfo[] {
    const needle = text.trim().toLocaleLowerCase()
    if (!needle) {
        return []
    }
    return masterPalettes()
        .map(p => ({ ...p, cells: p.cells.filter(c => (c.action ? actionName(c) : c.name).toLocaleLowerCase().includes(needle)) }))
        .filter(p => p.cells.length > 0)
}
