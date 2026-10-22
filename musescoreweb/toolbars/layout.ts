/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The toolbars and where they are: docks (the row of the Home/Score tabs, any number of rows below it, a row above
 * the status bar), the order in each dock and which toolbars are hidden (MuseScore's dock layout of the notation page:
 * the notation and undo/redo toolbars next to the tabs, the note input toolbar below). Kept in the settings.
 */
import { useSyncExternalStore } from 'react'
import type { TrString } from '../actions/uiactiondata'
import { restoreDefaultPanels } from '../panels/panels'
import { settings, updateSettings } from '../settings'

/**
 * a dock: 'main' (the row of the Home/Score tabs), the rows below it ('top', 'top1', 'top2', ...: each toolbar row of
 * the top area is a dock of its own) and 'bottom' (the row above the status bar)
 */
export type DockId = string

export const MAIN_DOCK = 'main'
export const BOTTOM_DOCK = 'bottom'

/** the id of the n-th row of the top area */
export function topRowId(n: number): DockId {
    return n === 0 ? 'top' : `top${n}`
}

function topRowIndex(dock: DockId): number {
    const m = /^top(\d*)$/.exec(dock)
    return m ? (m[1] ? Number(m[1]) : 0) : -1
}

export function isTopRow(dock: DockId): boolean {
    return topRowIndex(dock) >= 0
}

export interface ToolBarInfo {
    id: string
    title: TrString
    /** the action that shows/hides it (View > Toolbars); none: always shown, like MuseScore's main toolbars */
    toggleAction?: string
}

export const TOOLBARS: readonly ToolBarInfo[] = [
    { id: 'notationToolBar', title: ['appshell', 'Notation toolbar'] },
    { id: 'playbackToolBar', title: ['appshell', 'Playback controls'], toggleAction: 'toggle-transport' },
    { id: 'undoRedoToolBar', title: ['appshell', 'Undo/redo'] },
    { id: 'noteInputBar', title: ['appshell', 'Note input'], toggleAction: 'toggle-noteinput' },
    // the toolbar of the web viewer (pages, zoom, printing); not in MuseScore
    { id: 'viewToolBar', title: [null, 'Page view'], toggleAction: 'toggle-viewtoolbar' },
]

const DEFAULT_DOCKS: Record<DockId, string[]> = {
    main: ['notationToolBar', 'playbackToolBar', 'undoRedoToolBar'],
    top: ['noteInputBar', 'viewToolBar'],
    bottom: [],
}

export interface ToolBarLayout {
    /** 'main', 'bottom' and the non-empty top rows ('top', 'top1', ... without gaps) */
    docks: Record<DockId, string[]>
    hidden: string[]
    statusBar: boolean
}

/** the docks with the top rows renumbered without empty rows */
function compact(docks: Record<DockId, string[]>): Record<DockId, string[]> {
    const rows = Object.keys(docks).filter(isTopRow).sort((a, b) => topRowIndex(a) - topRowIndex(b))
        .map(d => docks[d]).filter(r => r.length)
    const out: Record<DockId, string[]> = { [MAIN_DOCK]: docks[MAIN_DOCK] ?? [], [BOTTOM_DOCK]: docks[BOTTOM_DOCK] ?? [] }
    rows.forEach((r, i) => { out[topRowId(i)] = r })
    return out
}

/** the layout of the settings, with unknown toolbars removed and missing ones in their default dock */
function sanitize(): ToolBarLayout {
    const s = settings().layout
    const docks: Record<DockId, string[]> = {}
    const known = new Set(TOOLBARS.map(t => t.id))
    const placed = new Set<string>()
    for (const [d, ids] of Object.entries(s.docks)) {
        if (d !== MAIN_DOCK && d !== BOTTOM_DOCK && !isTopRow(d)) {
            continue
        }
        docks[d] = []
        for (const id of ids) {
            if (known.has(id) && !placed.has(id)) {
                docks[d].push(id)
                placed.add(id)
            }
        }
    }
    for (const [d, ids] of Object.entries(DEFAULT_DOCKS)) {
        for (const id of ids) {
            if (!placed.has(id)) {
                (docks[d] ??= []).push(id)
            }
        }
    }
    return { docks: compact(docks), hidden: s.hidden.filter(id => known.has(id)), statusBar: s.statusBar }
}

let current = sanitize()
const listeners = new Set<() => void>()

function save(next: ToolBarLayout): void {
    current = next
    updateSettings('layout', next)
    for (const l of listeners) {
        l()
    }
}

export function onToolBarLayoutChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function toolBarLayout(): ToolBarLayout {
    return current
}

export function useToolBarLayout(): ToolBarLayout {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => current,
    )
}

/** the number of rows of the top area */
export function topRowCount(layout: ToolBarLayout = current): number {
    return Object.keys(layout.docks).filter(isTopRow).length
}

/** the rows from the top: the tabs row and the rows of the top area (the bottom dock is not part of it) */
export function rowSequence(layout: ToolBarLayout = current): DockId[] {
    return [MAIN_DOCK, ...Array.from({ length: topRowCount(layout) }, (_, i) => topRowId(i))]
}

export function dockOf(id: string): DockId {
    return Object.keys(current.docks).find(d => current.docks[d].includes(id)) ?? topRowId(0)
}

/**
 * moves a toolbar to `index` in `dock` (the index counts the toolbars of the dock without the moved one); a top row
 * id after the last row makes a new row
 */
export function moveToolBar(id: string, dock: DockId, index: number): void {
    const docks = Object.fromEntries(Object.entries(current.docks).map(([d, ids]) => [d, ids.filter(x => x !== id)]))
    const target = (docks[dock] ??= [])
    target.splice(Math.max(0, Math.min(index, target.length)), 0, id)
    save({ ...current, docks: compact(docks) })
}

export function isToolBarVisible(id: string): boolean {
    return !current.hidden.includes(id)
}

export function setToolBarVisible(id: string, visible: boolean): void {
    const hidden = current.hidden.filter(x => x !== id)
    if (!visible) {
        hidden.push(id)
    }
    save({ ...current, hidden })
}

export function setStatusBarVisible(visible: boolean): void {
    save({ ...current, statusBar: visible })
}

/** "dock-restore-default-layout" */
export function restoreDefaultLayout(): void {
    save({ docks: compact(structuredClone(DEFAULT_DOCKS)), hidden: [], statusBar: true })
    updateSettings('noteInputBar', null)
    restoreDefaultPanels()
}

// ---------------------------------------------------------------------------------
//   the note input toolbar (MuseScore's ToolConfig "noteInput"; "" is a separator)
// ---------------------------------------------------------------------------------

export interface ToolConfigItem {
    action: string
    show: boolean
}

/** NotationUiActions::defaultNoteInputBarConfig */
export const DEFAULT_NOTE_INPUT_BAR: readonly ToolConfigItem[] = [
    { action: 'note-input-by-note-name', show: true },
    { action: 'note-input-by-duration', show: true },
    { action: 'note-input-rhythm', show: false },
    { action: 'note-input-repitch', show: false },
    { action: 'note-input-realtime-auto', show: false },
    { action: 'note-input-realtime-manual', show: false },
    { action: 'note-input-timewise', show: false },
    { action: '', show: true },
    { action: 'pad-note-1024', show: false },
    { action: 'pad-note-512', show: false },
    { action: 'pad-note-256', show: false },
    { action: 'pad-note-128', show: false },
    { action: 'pad-note-64', show: true },
    { action: 'pad-note-32', show: true },
    { action: 'pad-note-16', show: true },
    { action: 'pad-note-8', show: true },
    { action: 'pad-note-4', show: true },
    { action: 'pad-note-2', show: true },
    { action: 'pad-note-1', show: true },
    { action: 'note-breve', show: false },
    { action: 'note-longa', show: false },
    { action: '', show: true },
    { action: 'pad-dot', show: true },
    { action: 'pad-dot2', show: false },
    { action: 'pad-dot3', show: false },
    { action: 'pad-dot4', show: false },
    { action: 'pad-rest', show: true },
    { action: '', show: true },
    { action: 'flat2', show: true },
    { action: 'flat', show: true },
    { action: 'nat', show: true },
    { action: 'sharp', show: true },
    { action: 'sharp2', show: true },
    { action: '', show: true },
    { action: 'tie', show: true },
    { action: 'add-slur', show: true },
    { action: 'lv', show: false },
    { action: '', show: true },
    { action: 'add-marcato', show: true },
    { action: 'add-sforzato', show: true },
    { action: 'add-tenuto', show: true },
    { action: 'add-staccato', show: true },
    { action: '', show: true },
    { action: 'cross-staff-beaming', show: false },
    { action: 'tuplet', show: true },
    { action: 'flip', show: true },
    { action: '', show: true },
    { action: 'voice-1', show: true },
    { action: 'voice-2', show: true },
    { action: 'voice-3', show: false },
    { action: 'voice-4', show: false },
]

export function noteInputBarConfig(): readonly ToolConfigItem[] {
    const saved = settings().noteInputBar
    if (!saved) {
        return DEFAULT_NOTE_INPUT_BAR
    }
    // actions of a newer default that the saved configuration does not know are added (hidden)
    const known = new Set(saved.map(i => i.action))
    return [...saved, ...DEFAULT_NOTE_INPUT_BAR.filter(i => i.action && !known.has(i.action)).map(i => ({ ...i, show: false }))]
}

export function setNoteInputBarConfig(items: ToolConfigItem[]): void {
    updateSettings('noteInputBar', items)
    for (const l of listeners) {
        l()
    }
}

export function useNoteInputBarConfig(): readonly ToolConfigItem[] {
    useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => settings().noteInputBar,
    )
    return noteInputBarConfig()
}
