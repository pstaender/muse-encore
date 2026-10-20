/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Vite plugin: MuseScore's translations (share/locale/musescore_<lang>.ts and instruments_<lang>.ts of the MuseScore
 * submodule, Qt Linguist files) as modules, converted when they are requested, so only the chosen language is
 * loaded:
 *   virtual:musescore-locales        { LANGUAGES: { code: name } (languages.json), loaders: { code: () => import } }
 *   virtual:musescore-locale/<code>  default export: { [context]: { [source + "\u0004" + disambiguation]: string | string[] } }
 * Only finished translations are included; plural messages have their forms in CLDR order.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const LIST_ID = 'virtual:musescore-locales'
const LANG_PREFIX = 'virtual:musescore-locale/'

function unescapeXml(s: string): string {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
        switch (e) {
            case 'amp': return '&'
            case 'lt': return '<'
            case 'gt': return '>'
            case 'quot': return '"'
            case 'apos': return "'"
            default: return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
        }
    })
}

type Catalog = Record<string, Record<string, string | string[]>>

function readTs(file: string, catalog: Catalog): void {
    const xml = readFileSync(file, 'utf8')
    for (const ctx of xml.matchAll(/<context>\s*<name>([\s\S]*?)<\/name>([\s\S]*?)<\/context>/g)) {
        const name = unescapeXml(ctx[1])
        const messages = catalog[name] ??= {}
        for (const m of ctx[2].matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)) {
            const body = m[1]
            const source = /<source>([\s\S]*?)<\/source>/.exec(body)
            const tr = /<translation(\s+type="(\w+)")?[^>]*>([\s\S]*?)<\/translation>|<translation[^>]*\/>/.exec(body)
            if (!source || !tr || tr[2] || !tr[3]) {
                continue // unfinished, vanished, obsolete or empty
            }
            const comment = /<comment>([\s\S]*?)<\/comment>/.exec(body)
            const key = unescapeXml(source[1]) + (comment ? `\u0004${unescapeXml(comment[1])}` : '')
            const forms = [...tr[3].matchAll(/<numerusform>([\s\S]*?)<\/numerusform>/g)].map(f => unescapeXml(f[1]))
            if (forms.length) {
                if (forms.some(f => f)) {
                    messages[key] = forms
                }
            } else {
                messages[key] = unescapeXml(tr[3])
            }
        }
    }
}

export function musescoreLocales(localeDir: string): Plugin {
    const languages = (): Record<string, string> => {
        const all = JSON.parse(readFileSync(join(localeDir, 'languages.json'), 'utf8')) as Record<string, string>
        return Object.fromEntries(Object.entries(all).filter(([code]) => existsSync(join(localeDir, `musescore_${code}.ts`))))
    }
    return {
        name: 'musescore-locales',
        resolveId(id) {
            if (id === LIST_ID || id.startsWith(LANG_PREFIX)) {
                return `\0${id}`
            }
            return null
        },
        load(id) {
            if (id === `\0${LIST_ID}`) {
                const langs = languages()
                this.addWatchFile(join(localeDir, 'languages.json'))
                return `export const LANGUAGES = ${JSON.stringify(langs)}\n`
                    + `export const loaders = {\n${Object.keys(langs).map(c => `    ${JSON.stringify(c)}: () => import(${JSON.stringify(LANG_PREFIX + c)}),`).join('\n')}\n}\n`
            }
            if (id.startsWith(`\0${LANG_PREFIX}`)) {
                const code = id.slice(LANG_PREFIX.length + 1)
                if (!/^[\w@]+$/.test(code)) {
                    return null
                }
                const catalog: Catalog = {}
                for (const f of [`musescore_${code}.ts`, `instruments_${code}.ts`]) {
                    const p = join(localeDir, f)
                    if (existsSync(p)) {
                        readTs(p, catalog)
                    }
                }
                return `export default JSON.parse(${JSON.stringify(JSON.stringify(catalog))})\n`
            }
            return null
        },
    }
}
