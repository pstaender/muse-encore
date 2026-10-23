/*
 * SPDX-License-Identifier: GPL-3.0-only
 */
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import { musescoreLocales } from './vite-plugin-locales'
import { musescoreSound } from './vite-plugin-sound'

export default defineConfig({
    root: __dirname,
    // MuseScore's translations from the submodule, one module per language; its soundfont (MS Basic.sf3) for the playback
    plugins: [react(), musescoreLocales(join(__dirname, '../MuseScore/share/locale')), musescoreSound(join(__dirname, '../MuseScore/share/sound'))],
    // the runtime fonts are served from the repository's fonts directory (e.g. /leland/Leland.otf)
    publicDir: '../fonts',
    build: { outDir: '../dist-editor', emptyOutDir: true },
})
