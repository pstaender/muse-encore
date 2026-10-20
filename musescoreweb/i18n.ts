/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The UI language: MuseScore's own translations (vite-plugin-locales.ts) behind the library's translator
 * (muse::qtrc), so the app and the engraving use MuseScore's strings and contexts. Like MuseScore, the strings
 * in the code are the English source texts.
 */
import { useSyncExternalStore } from 'react'
import { LANGUAGES, loaders } from 'virtual:musescore-locales'
import { arg, qtrc, setTranslator } from '../src/index'
import type { TrString } from './actions/uiactiondata'
import { settings, updateSettings } from './settings'

export { qtrc, arg }

type Catalog = Record<string, Record<string, string | string[]>>

const CLDR_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other']
const RTL = /^(ar|he|fa|ur)(_|$)/

let current = 'en'
let version = 0
const listeners = new Set<() => void>()

/** the languages that can be chosen, by their own name */
export function languageList(): { code: string; name: string }[] {
    return Object.entries(LANGUAGES).map(([code, name]) => ({ code, name: name.trim() }))
}

/** the language for the "system" setting: the browser's languages, exactly or by the base language */
function systemLanguage(): string {
    const codes = Object.keys(LANGUAGES)
    for (const tag of navigator.languages ?? [navigator.language]) {
        const t = tag.replace('-', '_')
        const exact = codes.find(c => c.toLowerCase() === t.toLowerCase())
        if (exact) {
            return exact
        }
        const base = t.split('_')[0]
        if (base === 'en') {
            return 'en'
        }
        if (codes.includes(base)) {
            return base
        }
    }
    return 'en'
}

export function currentLanguage(): string {
    return current
}

function makeTranslator(catalog: Catalog, lang: string): (context: string, key: string, disambiguation: string, n: number) => string | null {
    const rules = new Intl.PluralRules(lang.replace('_', '-').replace(/@.*/, ''))
    const categories = [...rules.resolvedOptions().pluralCategories].sort((a, b) => CLDR_ORDER.indexOf(a) - CLDR_ORDER.indexOf(b))
    return (context, key, disambiguation, n) => {
        const t = catalog[context]?.[disambiguation ? `${key}\u0004${disambiguation}` : key]
        if (t === undefined) {
            return null
        }
        if (typeof t === 'string') {
            return t
        }
        const idx = categories.indexOf(rules.select(Math.max(0, n)))
        return t[Math.min(Math.max(0, idx), t.length - 1)] || null
    }
}

function changed(lang: string): void {
    current = lang
    version++
    document.documentElement.lang = lang.replace('_', '-').replace(/@.*/, '')
    document.documentElement.dir = RTL.test(lang) ? 'rtl' : 'ltr'
    for (const l of listeners) {
        l()
    }
}

/** loads the language of the setting ('system' or a code) */
export async function applyLanguageSetting(): Promise<void> {
    const setting = settings().ui.language
    const lang = setting === 'system' || !(setting in LANGUAGES) ? systemLanguage() : setting
    // English is the source language, but MuseScore's English comes from musescore_en_US.ts too
    // (plural forms like "Note(s)" -> "Note")
    const file = lang === 'en' ? 'en_US' : lang
    if (!(file in loaders)) {
        setTranslator(null)
        changed('en')
        return
    }
    try {
        const catalog = (await loaders[file]()).default
        setTranslator(makeTranslator(catalog, lang))
        changed(lang)
    } catch (e) {
        console.warn(`could not load the translations for ${lang}`, e)
    }
}

export function setLanguage(setting: string): Promise<void> {
    updateSettings('ui', { language: setting })
    return applyLanguageSetting()
}

/** re-renders a component when the language changes; returns the language */
export function useLanguage(): string {
    useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => version,
    )
    return current
}

export function onLanguageChanged(listener: () => void): void {
    listeners.add(listener)
}

/** a generated translatable string with its arguments (TranslatableString::translated) */
export function trString(s: TrString): string {
    const [context, key, disambiguation, args] = s
    const text = context === null ? key : qtrc(context, key, disambiguation ?? '')
    return args?.length ? arg(text, ...args.map(trString)) : text
}

/** removes Qt's mnemonic markers ("&File" -> "File", "&&" -> "&"; "ファイル(&F)" -> "ファイル" like qt_mac_removeMnemonics) */
export function stripMnemonic(s: string): string {
    return s.replace(/\s*\(&[^&\s]\)/g, '').replace(/&(&?)/g, '$1')
}
