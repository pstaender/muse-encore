/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The UI actions (like muse::ui::UiActionsRegister and muse::actions::ActionsDispatcher): MuseScore's action
 * definitions (uiactiondata.ts, generated) with the handlers the app registers. An action without a handler is
 * shown disabled. Keyboard shortcuts are MuseScore's default ones and trigger the enabled actions.
 */
import { useSyncExternalStore } from 'react'
import { stripMnemonic, trString } from '../i18n'
import { SHORTCUTS, SHORTCUTS_MAC, UI_ACTIONS, type TrString, type UiActionData } from './uiactiondata'

export interface ActionHandler {
    run: () => void
    enabled?: () => boolean
    checked?: () => boolean
    /** a title that replaces MuseScore's (e.g. for actions of this app) */
    title?: TrString
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

export function triggerAction(code: string): boolean {
    const h = handlers.get(code)
    if (!h || !(h.enabled?.() ?? true)) {
        return false
    }
    h.run()
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

export function shortcuts(code: string): readonly string[] {
    return (isMac ? SHORTCUTS_MAC : SHORTCUTS)[code] ?? []
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
    s_index ??= Object.entries(isMac ? SHORTCUTS_MAC : SHORTCUTS).flatMap(([code, seqs]) =>
        seqs.map(parseSequence).filter((c): c is KeyCombo => !!c).map(combo => ({ code, combo })))
    return s_index
}

/** the action whose shortcut the event is, if it has a handler; text fields keep their keys */
export function actionForEvent(e: KeyboardEvent): string | null {
    const t = e.target as HTMLElement | null
    const inText = !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable)
    for (const { code, combo } of shortcutIndex()) {
        if (!handlers.has(code) || !matches(combo, e)) {
            continue
        }
        if (inText && !combo.ctrl && !combo.meta && !(combo.alt && combo.key.length > 1) && !/^F\d+$/.test(combo.key)) {
            continue
        }
        return code
    }
    return null
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

// global shortcuts: before the score view's own keys (capture phase)
window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || document.body.getAttribute('aria-busy') === 'true') {
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
