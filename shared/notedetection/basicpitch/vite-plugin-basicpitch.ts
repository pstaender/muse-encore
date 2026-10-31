/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The basic-pitch model (TensorFlow.js graph model, Apache-2.0): the dev server serves it at basic-pitch/, the build
 * copies it there with its license (it is loaded at runtime when the note detection starts, not bundled).
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const MODEL_DIR = join(__dirname, 'model')
const FILES = ['model.json', 'group1-shard1of1.bin']

export function basicPitchModel(): Plugin {
    let config: ResolvedConfig
    return {
        name: 'basic-pitch-model',
        configResolved(c) {
            config = c
        },
        configureServer(server) {
            server.middlewares.use('/basic-pitch/', (req, res, next) => {
                const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0])
                if (!FILES.includes(name)) {
                    next()
                    return
                }
                const file = join(MODEL_DIR, name)
                res.setHeader('content-type', name.endsWith('.json') ? 'application/json' : 'application/octet-stream')
                res.setHeader('content-length', String(statSync(file).size))
                createReadStream(file).pipe(res)
            })
        },
        writeBundle() {
            const out = join(config.root, config.build.outDir, 'basic-pitch')
            mkdirSync(out, { recursive: true })
            for (const name of FILES) {
                copyFileSync(join(MODEL_DIR, name), join(out, name))
            }
            const license = join(__dirname, 'LICENSE')
            if (existsSync(license)) {
                copyFileSync(license, join(out, 'LICENSE'))
            }
        },
    }
}
