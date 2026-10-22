// SPDX-License-Identifier: GPL-3.0-only
// Shared helpers of the e2e tests.
import type { BrowserContext } from 'playwright-core'

/**
 * the editor asks about the migration of older scores (most test scores are MuseScore 2/3 files): preset "Don't ask
 * again" without migration, so the scores look like in MuseScore's converter (tests of the dialog use askMigration)
 */
export async function presetNoMigration(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const key = 'musescoreweb:settings'
        let s: { project?: { migration?: unknown } } = {}
        try {
            s = JSON.parse(localStorage.getItem(key) ?? '{}') as typeof s
        } catch {
            // ignore
        }
        if (!s.project?.migration) {
            const no = { appVersion: 470, isApplyMigration: false, isAskAgain: false, isApplyLeland: true, isApplyEdwin: true, isRemapPercussion: true }
            s.project = { ...s.project, migration: { Pre_3_6: no, Ver_3_6: no } }
            localStorage.setItem(key, JSON.stringify(s))
        }
    })
}
