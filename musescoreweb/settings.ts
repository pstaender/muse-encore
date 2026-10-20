/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app settings, kept in localStorage (small and read synchronously at startup, so the first paint already uses
 * them). Storage can be unavailable (private windows, blocked site data): then the defaults are used for the session.
 */
import { useSyncExternalStore } from 'react'

export interface ViewSettings {
    zoom: string // a percentage ("100") or a fit mode ("page-width", "whole-page")
    orientation: 'horizontal' | 'vertical'
    spread: boolean
}

export interface AppSettings {
    view: ViewSettings
    home: {
        layout: 'grid' | 'list'
    }
    newScore: {
        /** the page the New Score dialog starts with (IProjectConfiguration::preferredScoreCreationMode) */
        mode: 'instruments' | 'template'
    }
    ui: {
        /** 'system' or a language code of MuseScore's translations (e.g. "de", "pt_BR") */
        language: string
    }
    /** the toolbars: their docks and order (toolbars.ts checks the ids), hidden ones, the status bar */
    layout: {
        docks: Record<string, string[]>
        hidden: string[]
        statusBar: boolean
    }
    /** the items of the note input toolbar (MuseScore's ToolConfig "noteInput"); null = the default */
    noteInputBar: { action: string; show: boolean }[] | null
}

const DEFAULTS: AppSettings = {
    view: { zoom: 'whole-page', orientation: 'horizontal', spread: false },
    home: { layout: 'grid' },
    newScore: { mode: 'instruments' },
    ui: { language: 'system' },
    layout: { docks: {}, hidden: [], statusBar: true },
    noteInputBar: null,
}

const SETTINGS_KEY = 'musescoreweb:settings'
const LEGACY_VIEW_KEY = 'musescoreweb:view'

function oneOf<T extends string>(v: unknown, values: readonly T[], def: T): T {
    return values.includes(v as T) ? v as T : def
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

function sanitize(s: Partial<{ [K in keyof AppSettings]: Partial<AppSettings[K]> }>): AppSettings {
    const view = s.view ?? {}
    return {
        view: {
            zoom: typeof view.zoom === 'string' ? view.zoom : DEFAULTS.view.zoom,
            orientation: oneOf(view.orientation, ['horizontal', 'vertical'], DEFAULTS.view.orientation),
            spread: typeof view.spread === 'boolean' ? view.spread : DEFAULTS.view.spread,
        },
        home: { layout: oneOf(s.home?.layout, ['grid', 'list'], DEFAULTS.home.layout) },
        newScore: { mode: oneOf(s.newScore?.mode, ['instruments', 'template'], DEFAULTS.newScore.mode) },
        ui: { language: typeof s.ui?.language === 'string' ? s.ui.language : DEFAULTS.ui.language },
        layout: {
            docks: s.layout?.docks && typeof s.layout.docks === 'object'
                ? Object.fromEntries(Object.entries(s.layout.docks).filter(([, v]) => isStringArray(v)))
                : {},
            hidden: isStringArray(s.layout?.hidden) ? s.layout.hidden : [],
            statusBar: typeof s.layout?.statusBar === 'boolean' ? s.layout.statusBar : true,
        },
        noteInputBar: Array.isArray(s.noteInputBar)
            && s.noteInputBar.every(i => typeof i?.action === 'string' && typeof i?.show === 'boolean')
            ? s.noteInputBar as AppSettings['noteInputBar'] : null,
    }
}

function load(): AppSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
            return sanitize(JSON.parse(raw))
        }
        // the view settings of the first version
        const view = localStorage.getItem(LEGACY_VIEW_KEY)
        return sanitize(view ? { view: JSON.parse(view) } : {})
    } catch {
        return sanitize({})
    }
}

let current = load()
const listeners = new Set<() => void>()

export function settings(): AppSettings {
    return current
}

export function updateSettings<K extends keyof AppSettings>(key: K, patch: Partial<AppSettings[K]> | null): void {
    current = { ...current, [key]: patch === null || Array.isArray(patch) ? patch : { ...current[key], ...patch } }
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(current))
        localStorage.removeItem(LEGACY_VIEW_KEY)
    } catch {
        // not persisted
    }
    for (const l of listeners) {
        l()
    }
}

/** "Revert to factory settings" */
export function resetSettings(): void {
    current = sanitize({})
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(current))
    } catch {
        // not persisted
    }
    for (const l of listeners) {
        l()
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useSettings(): AppSettings {
    return useSyncExternalStore(subscribe, settings)
}
