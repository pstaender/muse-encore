/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The modules of vite-plugin-locales.ts
 */
declare module 'virtual:musescore-locales' {
    /** language code -> name of the language in that language (languages.json) */
    export const LANGUAGES: Record<string, string>
    export const loaders: Record<string, () => Promise<{ default: Record<string, Record<string, string | string[]>> }>>
}
