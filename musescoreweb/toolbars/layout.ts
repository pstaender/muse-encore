/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The toolbars and where they are: three docks (the row of the Home/Score tabs, a row below it, a row above the
 * status bar), the order in each dock and which toolbars are hidden (MuseScore's dock layout of the notation page:
 * the notation and undo/redo toolbars next to the tabs, the note input toolbar below). Kept in the settings.
 */
import { useSyncExternalStore } from 'react'
import type { TrString } from '../actions/uiactiondata'
import { settings, updateSettings } from '../settings'

export type DockId = 'main' | 'top' | 'bottom'
export const DOCKS: readonly DockId[] = ['main', 'top', 'bottom']

export interface ToolBarInfo {
    id: string
    title: TrString
    /** the action that shows/hides it (View > Toolbars); none: always shown, like MuseScore's main toolbars */
    toggleAction?: string
}

export const TOOLBARS: readonly ToolBarInfo[] = [
    { id: 'notationToolBar', title: ['appshell', 'Notation toolbar'] },
    { id: 'undoRedoToolBar', title: ['appshell', 'Undo/redo'] },
    { id: 'noteInputBar', title: ['appshell', 'Note input'], toggleAction: 'toggle-noteinput' },
    // the toolbar of the web viewer (pages, zoom, printing); not in MuseScore
    { id: 'viewToolBar', title: [null, 'Page view'], toggleAction: 'toggle-viewtoolbar' },
]

const DEFAULT_DOCKS: Record<DockId, string[]> = {
    main: ['notationToolBar', 'undoRedoToolBar'],
    top: ['noteInputBar', 'viewToolBar'],
    bottom: [],
}

export interface ToolBarLayout {
    docks: Record<DockId, string[]>
    hidden: string[]
    statusBar: boolean
}

/** the layout of the settings, with unknown toolbars removed and missing ones in their default dock */
function sanitize(): ToolBarLayout {
    const s = settings().layout
    const docks: Record<DockId, string[]> = { main: [], top: [], bottom: [] }
    const known = new Set(TOOLBARS.map(t => t.id))
    const placed = new Set<string>()
    for (const d of DOCKS) {
        for (const id of s.docks[d] ?? []) {
            if (known.has(id) && !placed.has(id)) {
                docks[d].push(id)
                placed.add(id)
            }
        }
    }
    for (const d of DOCKS) {
        for (const id of DEFAULT_DOCKS[d]) {
            if (!placed.has(id)) {
                docks[d].push(id)
            }
        }
    }
    return { docks, hidden: s.hidden.filter(id => known.has(id)), statusBar: s.statusBar }
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

export function dockOf(id: string): DockId {
    return DOCKS.find(d => current.docks[d].includes(id)) ?? 'top'
}

/** moves a toolbar to `index` in `dock` (the index counts the toolbars of the dock without the moved one) */
export function moveToolBar(id: string, dock: DockId, index: number): void {
    const docks = Object.fromEntries(DOCKS.map(d => [d, current.docks[d].filter(x => x !== id)])) as Record<DockId, string[]>
    docks[dock].splice(Math.max(0, Math.min(index, docks[dock].length)), 0, id)
    save({ ...current, docks })
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
    save({ docks: structuredClone(DEFAULT_DOCKS), hidden: [], statusBar: true })
    updateSettings('noteInputBar', null)
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
