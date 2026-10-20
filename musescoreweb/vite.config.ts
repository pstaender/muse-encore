/*
 * SPDX-License-Identifier: GPL-3.0-only
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    // the runtime fonts are served from the repository's fonts directory (e.g. /leland/Leland.otf)
    publicDir: '../fonts',
    build: { outDir: '../dist-musescoreweb', emptyOutDir: true },
})
