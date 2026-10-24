/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Bumps the version of MuseEncore (package.json and package-lock.json), commits it ("Bumps version to x.y.z") and
 * creates the tag vx.y.z. Nothing is pushed.
 *
 *   npm run bump-version [-- <version>]
 *
 * Without a version it asks, suggesting the next patch version (0.0.14 -> 0.0.15); Enter takes the suggestion.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const FILES = ['package.json', 'package-lock.json']
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function nextPatch(version: string): string {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
    if (!m) {
        fail(`package.json: version ${version} is not x.y.z`)
    }
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

async function askVersion(suggestion: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
        return (await rl.question(`New version [${suggestion}]: `)).trim() || suggestion
    } finally {
        rl.close()
    }
}

/** sets the version in a JSON file, keeping its formatting (the lock file has it at the top and for the root package) */
function setVersion(file: string, version: string): void {
    const path = join(ROOT, file)
    const json = JSON.parse(readFileSync(path, 'utf8'))
    json.version = version
    if (json.packages?.['']) {
        json.packages[''].version = version
    }
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
}

async function main(): Promise<void> {
    const current = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string
    if (git('status', '--porcelain', '--', ...FILES)) {
        fail(`${FILES.join(' / ')} have uncommitted changes`)
    }
    const version = process.argv[2]?.replace(/^v/, '') || await askVersion(nextPatch(current))
    if (!SEMVER.test(version)) {
        fail(`invalid version: ${version}`)
    }
    const tag = `v${version}`
    if (git('tag', '--list', tag)) {
        fail(`tag ${tag} exists already`)
    }

    for (const file of FILES) {
        setVersion(file, version)
    }
    // only the version files, other changes of the working tree stay uncommitted
    git('commit', '-m', `Bumps version to ${version}`, '--', ...FILES)
    git('tag', tag)
    console.log(`${current} -> ${version}: committed and tagged ${tag} (not pushed: git push && git push origin ${tag})`)
}

await main()
