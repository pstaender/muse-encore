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
}

const DEFAULTS: AppSettings = {
    view: { zoom: 'whole-page', orientation: 'horizontal', spread: false },
    home: { layout: 'grid' },
    newScore: { mode: 'instruments' },
}

const SETTINGS_KEY = 'musescoreweb:settings'
const LEGACY_VIEW_KEY = 'musescoreweb:view'

function oneOf<T extends string>(v: unknown, values: readonly T[], def: T): T {
    return values.includes(v as T) ? v as T : def
}

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

export function updateSettings<K extends keyof AppSettings>(key: K, patch: Partial<AppSettings[K]>): void {
    current = { ...current, [key]: { ...current[key], ...patch } }
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

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useSettings(): AppSettings {
    return useSyncExternalStore(subscribe, settings)
}
