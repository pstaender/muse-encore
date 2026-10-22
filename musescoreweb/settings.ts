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
    /** the view mode (MuseScore's status bar: page view, continuous view horizontal/vertical; fit-width is not in MuseScore) */
    viewMode: 'page' | 'continuous-horizontal' | 'continuous-vertical' | 'fit-width'
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
    /** IProjectConfiguration */
    project: {
        /** isAutoSaveEnabled (preference "project/autoSaveEnabled") */
        autoSaveEnabled: boolean
        /** autoSaveIntervalMinutes (preference "project/autoSaveInterval"; the dialog offers 1..100) */
        autoSaveInterval: number
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
    /** the panels left of the score (panels/panels.ts checks the ids): the open ones, the current tab, the width */
    panels: {
        open: string[]
        current: string
        width: number
    }
    /** the state of the palettes panel (palettes/ checks it); null = MuseScore's default palettes */
    palettes: Record<string, unknown> | null
    /** the playback (NotationConfiguration, PlaybackConfiguration) and the mute button of this app */
    playback: PlaybackSettings
    /** settings of the web version (not in MuseScore) */
    web: WebSettings
}

export interface PlaybackSettings {
    /** the sound output is muted (the mute button of the playback toolbar; not in MuseScore) */
    muted: boolean
    /** isMetronomeEnabled */
    metronome: boolean
    /** isCountInEnabled */
    countIn: boolean
    /** isAutomaticallyPanEnabled: "Pan score automatically" */
    pan: boolean
    /** NotationSceneConfiguration::isSmoothPanning ("Smooth panning", continuous view horizontal) */
    smoothPan: boolean
    /** isPlayRepeatsEnabled */
    playRepeats: boolean
    /** isPlayChordSymbolsEnabled */
    playChordSymbols: boolean
    /** PlaybackConfiguration::playNotesWhenEditing ("Hear playback when adding, editing, and selecting notes") */
    playNotesWhenEditing: boolean
    /** playChordWhenEditing */
    playChordWhenEditing: boolean
    /** playHarmonyWhenEditing ("Play chord symbols and Nashville numbers") */
    playHarmonyWhenEditing: boolean
    /** isPlayPreviewNotesInInputByDuration ("Play when setting pitch (input by duration mode only)") */
    playPreviewNotesInInputByDuration: boolean
    /** playPreviewNotesWithScoreDynamics */
    playPreviewNotesWithScoreDynamics: boolean
    /** notePlayDurationMilliseconds ("Playback duration") */
    notePlayDuration: number
}

export interface WebSettings {
    /** holding Space and dragging moves the score (the hand tool); playback is then Alt+Space (macOS: Option+Space) */
    spacePan: boolean
}

const DEFAULTS: AppSettings = {
    view: { zoom: 'whole-page', orientation: 'horizontal', spread: false, viewMode: 'page' },
    home: { layout: 'grid' },
    newScore: { mode: 'instruments' },
    project: { autoSaveEnabled: true, autoSaveInterval: 5 }, // ProjectConfiguration::init
    ui: { language: 'system' },
    layout: { docks: {}, hidden: [], statusBar: true },
    noteInputBar: null,
    panels: { open: ['palettesPanel', 'instrumentsPanel', 'inspectorPanel'], current: 'palettesPanel', width: 300 },
    palettes: null,
    playback: {
        muted: false, metronome: false, countIn: false, pan: true, smoothPan: false, playRepeats: true, playChordSymbols: true,
        playNotesWhenEditing: true, playChordWhenEditing: true, playHarmonyWhenEditing: true,
        playPreviewNotesInInputByDuration: true, playPreviewNotesWithScoreDynamics: true, notePlayDuration: 500,
    },
    web: { spacePan: true },
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
            viewMode: oneOf(view.viewMode, ['page', 'continuous-horizontal', 'continuous-vertical', 'fit-width'], DEFAULTS.view.viewMode),
        },
        home: { layout: oneOf(s.home?.layout, ['grid', 'list'], DEFAULTS.home.layout) },
        newScore: { mode: oneOf(s.newScore?.mode, ['instruments', 'template'], DEFAULTS.newScore.mode) },
        project: {
            autoSaveEnabled: typeof s.project?.autoSaveEnabled === 'boolean' ? s.project.autoSaveEnabled : DEFAULTS.project.autoSaveEnabled,
            // fractions of a minute are accepted (tests)
            autoSaveInterval: typeof s.project?.autoSaveInterval === 'number' && s.project.autoSaveInterval > 0
                && s.project.autoSaveInterval <= 1000 ? s.project.autoSaveInterval : DEFAULTS.project.autoSaveInterval,
        },
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
        panels: {
            open: isStringArray(s.panels?.open) ? s.panels.open : DEFAULTS.panels.open,
            current: typeof s.panels?.current === 'string' ? s.panels.current : DEFAULTS.panels.current,
            width: typeof s.panels?.width === 'number' && Number.isFinite(s.panels.width) ? s.panels.width : DEFAULTS.panels.width,
        },
        palettes: s.palettes && typeof s.palettes === 'object' && !Array.isArray(s.palettes) ? s.palettes as Record<string, unknown> : null,
        playback: sanitizePlayback(s.playback ?? {}),
        web: { spacePan: typeof s.web?.spacePan === 'boolean' ? s.web.spacePan : DEFAULTS.web.spacePan },
    }
}

function sanitizePlayback(p: Partial<PlaybackSettings>): PlaybackSettings {
    const d = DEFAULTS.playback
    const b = (k: keyof PlaybackSettings): boolean => typeof p[k] === 'boolean' ? p[k] as boolean : d[k] as boolean
    return {
        muted: b('muted'), metronome: b('metronome'), countIn: b('countIn'), pan: b('pan'), smoothPan: b('smoothPan'), playRepeats: b('playRepeats'),
        playChordSymbols: b('playChordSymbols'), playNotesWhenEditing: b('playNotesWhenEditing'),
        playChordWhenEditing: b('playChordWhenEditing'), playHarmonyWhenEditing: b('playHarmonyWhenEditing'),
        playPreviewNotesInInputByDuration: b('playPreviewNotesInInputByDuration'),
        playPreviewNotesWithScoreDynamics: b('playPreviewNotesWithScoreDynamics'),
        // NotePreviewSection: 0..10000 ms
        notePlayDuration: typeof p.notePlayDuration === 'number' && p.notePlayDuration >= 0 && p.notePlayDuration <= 10000
            ? p.notePlayDuration : d.notePlayDuration,
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

export function onSettingsChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const subscribe = onSettingsChanged

export function useSettings(): AppSettings {
    return useSyncExternalStore(subscribe, settings)
}
