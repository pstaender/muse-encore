/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's soundfont "MS Basic.sf3" (MIT) for the playback: the dev server serves it from the MuseScore submodule
 * (share/sound), the build copies it with its license and readme to sound/ (it is loaded at runtime on the first
 * playback, not bundled into the scripts).
 */
import { createReadStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const FILES = ['MS Basic.sf3', 'MS Basic_License.md', 'MS Basic_Readme.md']

export function musescoreSound(soundDir: string): Plugin {
    let config: ResolvedConfig
    return {
        name: 'musescore-sound',
        configResolved(c) {
            config = c
        },
        configureServer(server) {
            server.middlewares.use('/sound/', (req, res, next) => {
                const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0])
                if (!FILES.includes(name)) {
                    next()
                    return
                }
                const file = join(soundDir, name)
                if (!existsSync(file)) {
                    res.statusCode = 404
                    res.end(`${name} not found (MuseScore submodule: git submodule update --init)`)
                    return
                }
                res.setHeader('content-type', name.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/octet-stream')
                res.setHeader('content-length', String(statSync(file).size))
                createReadStream(file).pipe(res)
            })
        },
        writeBundle() {
            const out = join(config.root, config.build.outDir, 'sound')
            mkdirSync(out, { recursive: true })
            for (const name of FILES) {
                const file = join(soundDir, name)
                if (existsSync(file)) {
                    copyFileSync(file, join(out, name))
                } else {
                    config.logger.warn(`musescore-sound: ${file} not found`)
                }
            }
        },
    }
}
