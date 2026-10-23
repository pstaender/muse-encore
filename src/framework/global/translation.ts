/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/translation.h: muse::mtrc / muse::qtrc. The translations themselves (MuseScore's
 * Qt .ts files) are loaded by the app, which sets a translator; without one the source strings are used.
 */

/** returns the translation of `key` in `context` (Qt: context, source text, disambiguation, plural count), or null */
export type Translator = (context: string, key: string, disambiguation: string, n: number) => string | null

let s_translator: Translator | null = null

export function setTranslator(t: Translator | null): void {
    s_translator = t
}

/** like QCoreApplication::translate: the translation (or the key itself), with %n (and the localized %Ln) replaced by n if n >= 0 */
export function mtrc(context: string, key: string, disambiguation = '', n = -1): string {
    const s = s_translator?.(context, key, disambiguation, n) ?? key
    return n >= 0 ? s.replaceAll('%Ln', n.toLocaleString()).replaceAll('%n', String(n)) : s
}

export const qtrc = mtrc

/** QString::arg: replaces the lowest-numbered %1..%99 (all of its occurrences) by each argument in turn */
export function arg(s: string, ...args: (string | number)[]): string {
    for (const a of args) {
        const nums = [...s.matchAll(/%(\d{1,2})/g)].map(m => Number(m[1]))
        if (!nums.length) {
            break
        }
        const lowest = Math.min(...nums)
        s = s.replace(new RegExp(`%${lowest}(?!\\d)`, 'g'), () => String(a))
    }
    return s
}
