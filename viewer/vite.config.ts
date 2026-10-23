/*
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { join } from 'node:path'
import { defineConfig } from 'vite'
import { musescoreSound } from '../shared/vite-plugin-sound'

export default defineConfig({
    root: __dirname,
    // MuseScore's soundfont (MS Basic.sf3) for the playback
    plugins: [musescoreSound(join(__dirname, '../MuseScore/share/sound'))],
    // the runtime fonts are served from the repository's fonts directory (e.g. /leland/Leland.otf)
    publicDir: '../fonts',
    build: { outDir: '../dist-viewer', emptyOutDir: true },
})
