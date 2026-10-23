/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The state of the palettes panel (MuseScore's PaletteProvider with the user palette tree and PaletteConfiguration):
 * the user palette tree is the library's (src/palette: shown/hidden, expanded, custom palettes and cells); it is stored
 * as PaletteTree XML in localStorage like MuseScore keeps it in the workspace (PaletteWorkspaceSetup). The palette
 * settings of the panel's menu are in the settings ("palettes"); the search and the current cell only for the session.
 */
import { useSyncExternalStore } from 'react'
import {
    addExtraPalette, loadUserPalettes, masterPalettes, onUserPalettesChanged, setAllPalettesExpanded,
    setPaletteExpanded as libSetPaletteExpanded, userPalettes, userPalettesXml, type PaletteCellInfo, type PaletteInfo,
} from '../../../src/index'
import { settings, updateSettings } from '../../settings'

export interface PalettesSettings {
    /** PaletteConfiguration::isSinglePalette ("Open only one palette at a time") */
    singlePalette: boolean
    /** PaletteConfiguration::isSingleClickToOpenPalette */
    singleClickToOpen: boolean
}

const DEFAULTS: PalettesSettings = { singlePalette: false, singleClickToOpen: true }

/** the key of the user palette tree (PaletteTree XML) in localStorage */
const TREE_KEY = 'musescoreweb:palettes'

function load(): PalettesSettings {
    const s = settings().palettes ?? {}
    return {
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
    /** counts the changes of the user palette tree (the panel re-renders) */
    treeVersion: number
}

let current: PalettesState = { ...load(), searchOpened: false, searchText: '', currentCell: null, treeVersion: 0 }
const listeners = new Set<() => void>()

function set(patch: Partial<PalettesState>, persist = false): void {
    current = { ...current, ...patch }
    if (persist) {
        const { singlePalette, singleClickToOpen } = current
        updateSettings('palettes', { singlePalette, singleClickToOpen })
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

// ---------------------------------------------------------------------------------
//   the user palette tree: loaded once the engraving fonts are ready, saved after every change
// ---------------------------------------------------------------------------------

let s_loaded = false
let s_saveTimer = 0

function storedTree(): string | null {
    try {
        return localStorage.getItem(TREE_KEY)
    } catch {
        return null
    }
}

function saveTree(): void {
    clearTimeout(s_saveTimer)
    s_saveTimer = window.setTimeout(() => {
        try {
            localStorage.setItem(TREE_KEY, userPalettesXml())
        } catch {
            // not persisted (storage unavailable or full)
        }
    }, 200)
}

/**
 * The palettes of the first version of the panel only stored which palettes were shown and expanded (by palette type):
 * applied to the default tree once.
 */
function migrateOldSettings(): void {
    const s = settings().palettes ?? {}
    const visible = s.visible && typeof s.visible === 'object' ? s.visible as Record<string, unknown> : {}
    const expanded = Array.isArray(s.expanded) ? s.expanded.filter((x): x is string => typeof x === 'string') : []
    if (!Object.keys(visible).length && !expanded.length) {
        return
    }
    for (const p of userPalettes()) {
        if (visible[p.type] === true && !p.visible) {
            const extra = `user:${p.id}`
            addExtraPalette(extra)
        }
    }
    for (const p of userPalettes()) {
        if (expanded.includes(p.type)) {
            libSetPaletteExpanded(p.id, true)
        }
    }
    const { singlePalette, singleClickToOpen } = current
    updateSettings('palettes', null)
    updateSettings('palettes', { singlePalette, singleClickToOpen })
}

/** PaletteWorkspaceSetup::setup (the engraving fonts must be initialized) */
export function ensureUserPalettesLoaded(): void {
    if (s_loaded) {
        return
    }
    s_loaded = true
    const xml = storedTree()
    loadUserPalettes(xml)
    if (!xml) {
        migrateOldSettings()
    }
    onUserPalettesChanged(() => {
        set({ treeVersion: current.treeVersion + 1 })
        saveTree()
    })
}

/** the palettes of the user palette tree (all, also the hidden ones) */
export function allUserPalettes(): PaletteInfo[] {
    ensureUserPalettesLoaded()
    return userPalettes()
}

/** the palettes that are shown (PaletteProvider's visibility filter model) */
export function shownPalettes(): PaletteInfo[] {
    return allUserPalettes().filter(p => p.visible)
}

export function setPaletteExpanded(id: string, expanded: boolean): void {
    libSetPaletteExpanded(id, expanded, current.singlePalette)
}

export function expandCollapseAll(expand: boolean): void {
    setAllPalettesExpanded(expand)
}

export function setSinglePalette(v: boolean): void {
    set({ singlePalette: v }, true)
    if (v) {
        // keep the last expanded palette
        const expanded = shownPalettes().filter(p => p.expanded)
        if (expanded.length > 1) {
            libSetPaletteExpanded(expanded[expanded.length - 1].id, true, true)
        }
    }
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
    try {
        localStorage.removeItem(TREE_KEY)
    } catch {
        // storage unavailable
    }
    current = { ...DEFAULTS, searchOpened: false, searchText: '', currentCell: null, treeVersion: current.treeVersion + 1 }
    if (s_loaded) {
        loadUserPalettes(null)
        clearTimeout(s_saveTimer)
        try {
            localStorage.removeItem(TREE_KEY)
        } catch {
            // storage unavailable
        }
    }
    for (const l of listeners) {
        l()
    }
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
