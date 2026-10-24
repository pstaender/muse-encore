/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Bumps the version of MuseEncore (package.json and package-lock.json) and, if wanted, the one of the npm package
 * muse-encore-viewer (packages/viewer/package.json), commits it ("Bumps version to x.y.z") and creates the tag vx.y.z.
 * Nothing is pushed or published.
 *
 *   npm run bump-version [-- <version> [<viewer version> | -]]
 *
 * Missing versions are asked for, suggesting the next patch version (0.0.14 -> 0.0.15); Enter takes the suggestion,
 * or type another version. "-" (or answering no) leaves the viewer package's version.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface, type Interface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const FILES = ['package.json', 'package-lock.json'].filter(f => existsSync(join(ROOT, f)))
const VIEWER_FILE = 'packages/viewer/package.json'
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function readVersion(file: string): string {
    return JSON.parse(readFileSync(join(ROOT, file), 'utf8')).version as string
}

function nextPatch(file: string, version: string): string {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
    if (!m) {
        fail(`${file}: version ${version} is not x.y.z`)
    }
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

function checkVersion(version: string): string {
    version = version.replace(/^v/, '')
    if (!SEMVER.test(version)) {
        fail(`invalid version: ${version}`)
    }
    return version
}

/** sets the version in a JSON file (the lock file has it at the top and for the root package) */
function setVersion(file: string, version: string): void {
    const path = join(ROOT, file)
    const json = JSON.parse(readFileSync(path, 'utf8'))
    json.version = version
    if (json.packages?.['']) {
        json.packages[''].version = version
    }
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
}

async function main(rl: Interface): Promise<void> {
    if (git('status', '--porcelain', '--', ...FILES, VIEWER_FILE)) {
        fail(`${[...FILES, VIEWER_FILE].join(' / ')} have uncommitted changes`)
    }
    const current = readVersion('package.json')
    const ask = async (question: string, suggestion: string): Promise<string> =>
        (await rl.question(`${question} [${suggestion}]: `)).trim() || suggestion

    const version = checkVersion(process.argv[2] || await ask(`MuseEncore ${current} -> new version`, nextPatch('package.json', current)))
    const tag = `v${version}`
    if (git('tag', '--list', tag)) {
        fail(`tag ${tag} exists already`)
    }

    const viewerCurrent = readVersion(VIEWER_FILE)
    let viewerAnswer = process.argv[3]
    if (!viewerAnswer) {
        const yes = /^y/i.test(await ask(`Bump the npm package muse-encore-viewer (${viewerCurrent}) too? (y/n)`, 'y'))
        viewerAnswer = yes ? await ask(`muse-encore-viewer ${viewerCurrent} -> new version`, nextPatch(VIEWER_FILE, viewerCurrent)) : '-'
    }
    const viewerVersion = viewerAnswer === '-' ? undefined : checkVersion(viewerAnswer)

    for (const file of FILES) {
        setVersion(file, version)
    }
    const files = [...FILES]
    if (viewerVersion) {
        setVersion(VIEWER_FILE, viewerVersion)
        files.push(VIEWER_FILE)
    }
    // only the version files, other changes of the working tree stay uncommitted
    const message = `Bumps version to ${version}` + (viewerVersion ? ` (muse-encore-viewer ${viewerVersion})` : '')
    git('commit', '-m', message, '--', ...files)
    git('tag', tag)

    console.log(`MuseEncore ${current} -> ${version}` + (viewerVersion ? `, muse-encore-viewer ${viewerCurrent} -> ${viewerVersion}` : ''))
    console.log(`Committed and tagged ${tag}. Not pushed: git push && git push origin ${tag}`)
    if (viewerVersion) {
        console.log(`Remember to publish the viewer package: npm run build:viewer-package && cd packages/viewer && npm publish`)
    }
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
try {
    await main(rl)
} finally {
    rl.close()
}
