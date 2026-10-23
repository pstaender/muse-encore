/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The UI actions (like muse::ui::UiActionsRegister and muse::actions::ActionsDispatcher): MuseScore's action
 * definitions (uiactiondata.ts, generated) with the handlers the app registers. An action without a handler is
 * shown disabled. Keyboard shortcuts are MuseScore's default ones and trigger the enabled actions.
 */
import { useSyncExternalStore } from 'react'
import { stripMnemonic, trString } from '../i18n'
import { SHORTCUTS, SHORTCUTS_MAC, UI_ACTIONS, type TrString, type UiActionData } from './uiactiondata'
import { onSettingsChanged, settings } from '../settings'

export interface ActionHandler {
    /** args: the arguments of the menu item (MuseScore's ActionData), e.g. the page of "edit-style" */
    run: (args?: readonly string[]) => void
    enabled?: () => boolean
    checked?: () => boolean
    /** a title that replaces MuseScore's (e.g. for actions of this app) */
    title?: TrString
    /**
     * 'notation': the shortcut only applies in the score view (MuseScore's UiCtxProjectFocused), not while the focus
     * is in a menu, list or dialog, or on a button for the keys the button handles itself
     */
    context?: 'notation'
    /** the priority of the shortcut's context when several actions have the shortcut (text editing: 1) */
    priority?: number
}

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const definitions = new Map<string, UiActionData>(UI_ACTIONS.map(a => [a.code, a]))
const handlers = new Map<string, ActionHandler>()
let version = 0
const listeners = new Set<() => void>()

export function registerAction(code: string, handler: ActionHandler, definition?: Omit<UiActionData, 'code'>): void {
    handlers.set(code, handler)
    if (definition) {
        definitions.set(code, { code, ...definitions.get(code), ...definition })
    }
    actionsChanged()
}

export function actionDefinition(code: string): UiActionData | undefined {
    return definitions.get(code)
}

/** the menu title (with mnemonic marker) */
export function actionTitle(code: string, title?: TrString): string {
    const t = title ?? handlers.get(code)?.title ?? definitions.get(code)?.title
    return t ? trString(t) : code
}

/** the title for tooltips and buttons: the description if there is one, else the title without mnemonic */
export function actionDescription(code: string): string {
    const d = definitions.get(code)?.description
    return d ? trString(d) : stripMnemonic(actionTitle(code))
}

export function isActionEnabled(code: string): boolean {
    const h = handlers.get(code)
    return !!h && (h.enabled?.() ?? true)
}

export function isActionChecked(code: string): boolean {
    return !!handlers.get(code)?.checked?.()
}

export function isCheckable(code: string): boolean {
    return !!definitions.get(code)?.checkable || !!handlers.get(code)?.checked
}

export function triggerAction(code: string, args?: readonly string[]): boolean {
    const h = handlers.get(code)
    if (!h || !(h.enabled?.() ?? true)) {
        return false
    }
    h.run(args)
    actionsChanged()
    return true
}

/** to be called when something changes that the enabled/checked states depend on */
export function actionsChanged(): void {
    version++
    for (const l of listeners) {
        l()
    }
}

/** re-renders on action state changes */
export function useActions(): number {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => version,
    )
}

// ---------------------------------------------------------------------------------
//   shortcuts (Qt key sequences: "Ctrl+Shift+N"; on macOS "Ctrl" is Command and "Meta" is Control)
// ---------------------------------------------------------------------------------

/**
 * The Space key: "Hold Space and drag to move the score" (settings web.spacePan, not in MuseScore) takes Space from
 * the "play" action, which then has no key: playback starts with "play-from-selection" (Shift+Space) and stops with
 * Escape (another key like Ctrl/Option+Space does not reach the page in every browser and system)
 */
function shortcutTable(): Record<string, readonly string[]> {
    const table = isMac ? SHORTCUTS_MAC : SHORTCUTS
    if (!settings().web.spacePan) {
        return table
    }
    return { ...table, play: [] }
}

let s_spacePan = settings().web.spacePan
onSettingsChanged(() => {
    if (settings().web.spacePan !== s_spacePan) {
        s_spacePan = settings().web.spacePan
        s_index = null
        actionsChanged() // the shortcuts in the menus and tooltips
    }
})

export function shortcuts(code: string): readonly string[] {
    const table = shortcutTable()
    // the notation's copy/cut/paste are MuseScore's standard keys of action://copy etc. (shown in the menus; the
    // keys themselves are the browser's copy/cut/paste events, see scoreview.ts)
    return table[code] ?? (/^action:\/\/notation\/(copy|cut|paste)$/.test(code) ? table[code.replace('notation/', '')] ?? [] : [])
}

const KEY_NAMES: Record<string, string> = {
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', PgUp: 'PageUp', PgDown: 'PageDown',
    Del: 'Delete', Esc: 'Escape', Return: 'Enter', Enter: 'Enter', Ins: 'Insert', Space: ' ', Backspace: 'Backspace',
    Tab: 'Tab', Home: 'Home', End: 'End',
}

interface KeyCombo { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }

function parseSequence(seq: string): KeyCombo | null {
    if (seq.includes(', ')) {
        return null // multi-key sequences are not supported
    }
    // the key may itself be "+" ("Ctrl++")
    const m = /^((?:(?:Ctrl|Shift|Alt|Meta)\+)*)(.+)$/.exec(seq)
    if (!m) {
        return null
    }
    const mods = m[1]
    const key = KEY_NAMES[m[2]] ?? m[2]
    return { key: key.length === 1 ? key.toLowerCase() : key, ctrl: mods.includes('Ctrl+'), shift: mods.includes('Shift+'), alt: mods.includes('Alt+'), meta: mods.includes('Meta+') }
}

/** the key names an event can match: the produced character and the physical key (for Shift+digit, Alt+letter) */
function eventKeys(e: KeyboardEvent): string[] {
    const keys = [e.key.length === 1 ? e.key.toLowerCase() : e.key]
    const code = /^(?:Key|Digit)(.)$/.exec(e.code)?.[1]
    if (code) {
        keys.push(code.toLowerCase())
    }
    return keys
}

function matches(c: KeyCombo, e: KeyboardEvent): boolean {
    // Qt's Ctrl is the Command key on macOS, its Meta the Control key
    const ctrl = isMac ? e.metaKey : e.ctrlKey
    const meta = isMac ? e.ctrlKey : e.metaKey
    if (c.ctrl !== ctrl || c.alt !== e.altKey || c.meta !== meta) {
        return false
    }
    const keys = eventKeys(e)
    if (!keys.includes(c.key)) {
        return false
    }
    // Shift is part of a produced character like "+" or "?"; then it need not be in the sequence
    return c.shift === e.shiftKey || (!c.shift && e.key.length === 1 && !/[a-z0-9]/i.test(e.key))
}

let s_index: { code: string; combo: KeyCombo }[] | null = null

function shortcutIndex(): { code: string; combo: KeyCombo }[] {
    s_index ??= Object.entries(shortcutTable()).flatMap(([code, seqs]) =>
        seqs.map(parseSequence).filter((c): c is KeyCombo => !!c).map(combo => ({ code, combo })))
    return s_index
}

/** keys a focused control handles itself (buttons, tabs: activation and arrow key navigation) */
const CONTROL_KEYS = new Set(['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'])

/** a notation shortcut does not apply here (see ActionHandler.context) */
function outsideNotationContext(t: HTMLElement | null, combo: KeyCombo): boolean {
    if (!t || !(t instanceof Element)) {
        return false
    }
    if (t.closest('[role="menu"], [role="menubar"], [role="listbox"], dialog')) {
        return true
    }
    const plain = !combo.ctrl && !combo.alt && !combo.meta
    return plain && CONTROL_KEYS.has(combo.key) && !!t.closest('button, [role="tab"], a, summary')
}

/** the action whose shortcut the event is, if it has a handler; text fields keep their keys */
export function actionForEvent(e: KeyboardEvent): string | null {
    const t = e.target as HTMLElement | null
    // the panels (palette grid, layout tree, properties) handle their own keys like text fields
    // the text field of the notation's text editing is the notation (its shortcuts apply)
    const inText = !!t && !(t instanceof Element && t.matches('[data-notation-input]')) && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable
        || !!t.closest?.('.panel-dock'))
    const candidates: string[] = []
    for (const { code, combo } of shortcutIndex()) {
        if (!handlers.has(code) || !matches(combo, e)) {
            continue
        }
        if (handlers.get(code)!.context === 'notation' && (inText || outsideNotationContext(t, combo))) {
            continue
        }
        if (inText && !combo.ctrl && !combo.meta && !(combo.alt && combo.key.length > 1) && !/^F\d+$/.test(combo.key)) {
            continue
        }
        candidates.push(code)
    }
    // like MuseScore's ShortcutsController::resolveAction: of several actions with the shortcut, an enabled one of the
    // highest context priority (e.g. "-": next-syllable while editing lyrics, else flat)
    let best: string | null = null
    for (const code of candidates) {
        const h = handlers.get(code)!
        if (!(h.enabled?.() ?? true)) {
            continue
        }
        if (best === null || (h.priority ?? 0) > (handlers.get(best)!.priority ?? 0)) {
            best = code
        }
    }
    return best ?? candidates[0] ?? null
}

/** for menus and tooltips: "Ctrl+Shift+N", on macOS "⇧⌘N" */
export function formatShortcut(seq: string): string {
    if (!isMac) {
        return seq
    }
    const c = parseSequence(seq)
    if (!c) {
        return seq
    }
    const names: Record<string, string> = {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: '⇞', PageDown: '⇟', Delete: '⌦',
        Backspace: '⌫', Escape: '⎋', Enter: '↩', Home: '↖', End: '↘', ' ': 'Space', Tab: '⇥',
    }
    const key = names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key)
    return `${c.meta ? '⌃' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${c.ctrl ? '⌘' : ''}${key}`
}

export function shortcutText(code: string): string {
    const s = shortcuts(code)[0]
    return s ? formatShortcut(s) : ''
}

let s_shortcutOverride: ((e: KeyboardEvent) => boolean) | null = null

/** keys that are not shortcuts because the notation view takes them (MuseScore's shortcutOverrideEvent) */
export function setShortcutOverride(f: (e: KeyboardEvent) => boolean): void {
    s_shortcutOverride = f
}

// global shortcuts: before the score view's own keys (capture phase)
window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || document.body.getAttribute('aria-busy') === 'true') {
        return
    }
    if (s_shortcutOverride?.(e)) {
        return
    }
    // modal dialogs keep their keys
    if (document.querySelector('dialog[open]')) {
        return
    }
    const code = actionForEvent(e)
    if (code && isActionEnabled(code)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        triggerAction(code)
    }
}, { capture: true })
