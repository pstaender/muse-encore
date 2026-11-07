// SPDX-License-Identifier: GPL-3.0-only
// The examples of the viewer package: index.html (the released version on the CDN), latest.html (@latest) and
// current.html (the local build) are the same page except the URL of the module.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const DIR = join(__dirname, '../packages/viewer/example')
const MODULE_URL = /const MODULE_URL = "([^"]*)";/

test.each([
    ['latest.html', 'https://cdn.jsdelivr.net/npm/muse-encore-viewer@latest/dist/muse-encore-viewer.js'],
    ['current.html', '../dist/muse-encore-viewer.js'],
])('%s is index.html with its own module URL', (file, url) => {
    const index = readFileSync(join(DIR, 'index.html'), 'utf8')
    const page = readFileSync(join(DIR, file), 'utf8')
    expect(index).toMatch(/const MODULE_URL = "https:\/\/cdn\.jsdelivr\.net\/npm\/muse-encore-viewer@\d+\.\d+\.\d+\/dist\/muse-encore-viewer\.js";/)
    expect(page.match(MODULE_URL)?.[1]).toBe(url)
    expect(page.replace(MODULE_URL, '')).toBe(index.replace(MODULE_URL, ''))
})
