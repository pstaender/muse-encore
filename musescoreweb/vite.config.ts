/*
 * SPDX-License-Identifier: GPL-3.0-only
 */
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import { musescoreLocales } from './vite-plugin-locales'

export default defineConfig({
    root: __dirname,
    // MuseScore's translations from the submodule, one module per language
    plugins: [react(), musescoreLocales(join(__dirname, '../MuseScore/share/locale'))],
    // the runtime fonts are served from the repository's fonts directory (e.g. /leland/Leland.otf)
    publicDir: '../fonts',
    build: { outDir: '../dist-musescoreweb', emptyOutDir: true },
})
