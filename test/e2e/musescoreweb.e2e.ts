// SPDX-License-Identifier: GPL-3.0-only
// The editor's home screen, New Score dialog and stored scores in headless Chrome: npm run test:e2e
// (the score view is covered for both apps by webapps.e2e.ts).
import { existsSync, readFileSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEMOS, ROOT, hasSubmodule } from '../helpers'

const CHROME = process.env.CHROME_PATH ?? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(p => existsSync(p))

const SCORE_HOST = 'http://scores.test/'

let server: ViteDevServer
let browser: Browser
let base = ''

async function newPage(): Promise<{ page: Page; context: BrowserContext }> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.route(`${SCORE_HOST}**`, route => route.fulfill({
        body: readFileSync(`${DEMOS}/Amazing_grace.mscz`), headers: { 'access-control-allow-origin': '*' },
    }))
    const page = await context.newPage()
    page.on('pageerror', e => { throw e })
    return { page, context }
}

const view = (page: Page): Promise<string | undefined> => page.evaluate(() => document.body.dataset.view)
async function cardNames(page: Page): Promise<string[]> {
    await page.waitForSelector('.score-card.new') // the list is read from IndexedDB
    await page.waitForTimeout(300)
    return page.$$eval('.score-card:not(.new) .card-name', els => els.map(e => e.textContent ?? ''))
}

async function scoreShown(page: Page): Promise<void> {
    await page.waitForFunction(() => document.body.dataset.view === 'score' && document.getElementById('busy')!.hidden
        && /\d+ ms$/.test(document.getElementById('status')!.textContent ?? ''), null, { timeout: 120000 })
}

describe.skipIf(!CHROME || !hasSubmodule)('musescoreweb (editor)', () => {
    beforeAll(async () => {
        server = await createServer({ configFile: `${ROOT}musescoreweb/vite.config.ts`, root: `${ROOT}musescoreweb`, server: { port: 0 }, logLevel: 'error' })
        await server.listen()
        base = server.resolvedUrls!.local[0]
        browser = await chromium.launch({ executablePath: CHROME, headless: true })
    }, 60000)

    afterAll(async () => {
        await browser?.close()
        await server?.close()
    })

    it('starts with the home screen and lists opened scores', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.waitForSelector('.home')
        expect(await view(page)).toBe('home')
        expect(await page.isVisible('#toolbar')).toBe(false)
        expect(await page.isDisabled('.app-tabs [role="tab"]:nth-child(2)')).toBe(true)
        expect(await cardNames(page)).toEqual([])

        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.click('.app-tabs [role="tab"]:has-text("Home")')
        await page.waitForFunction(() => document.querySelectorAll('.score-card:not(.new) img').length === 1, null, { timeout: 10000 })
        expect(await cardNames(page)).toEqual(['amazing'])

        // the same file again: no second entry
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.click('#clear')
        expect(await view(page)).toBe('home')
        expect(await cardNames(page)).toEqual(['amazing'])

        // reopened from the list
        await page.click('.score-card:not(.new)')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('amazing')
        await context.close()
    }, 180000)

    it('creates a score from instruments and keeps it', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('.home-footer button:has-text("New")')
        await page.waitForSelector('dialog.new-score[open]')
        expect(await page.isDisabled('dialog.new-score .dialog-buttons button:has-text("Done")')).toBe(true)

        await page.fill('input[aria-label="Search instruments"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.fill('input[aria-label="Search instruments"]', 'piano')
        await page.dblclick('.instruments [role="option"] >> text=Piano')
        const onScore = await page.$$eval('.on-score [role="option"] .item-name', els => els.map(e => e.textContent))
        expect(onScore).toEqual(['Flute', 'Piano'])

        await page.click('dialog.new-score button:has-text("Next")')
        await page.fill('input[placeholder="Untitled score"]', 'Test score')
        await page.fill('input[placeholder="Composer / arranger"]', 'Someone')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('Test score')

        // the open score is created again after a reload
        await page.reload()
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('Test score')

        // removing a created score asks first
        await page.click('.app-tabs [role="tab"]:has-text("Home")')
        await page.hover('.score-grid li:nth-child(2)')
        await page.click('.score-grid li:nth-child(2) .remove')
        await page.waitForSelector('dialog.confirm[open]')
        await page.click('dialog.confirm button:has-text("Remove")')
        await page.waitForFunction(() => !document.querySelector('.score-card:not(.new)'))
        await context.close()
    }, 180000)

    it('creates a score from a template with a preview', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.keyboard.press('Control+N')
        await page.waitForSelector('dialog.new-score[open]')
        await page.click('[role="tab"]:has-text("Create from template")')
        await page.click('.choose-template [role="option"]:has-text("Chamber Music")')
        await page.click('.choose-template [role="option"]:has-text("String Quartet")')
        await page.waitForSelector('.template-preview canvas', { timeout: 60000 })
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('Untitled score')
        await context.close()
    }, 180000)

    it('keeps the settings of the home screen', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('button[aria-label="List view"]')
        await page.reload()
        await page.waitForSelector('.home')
        expect(await page.getAttribute('button[aria-label="List view"]', 'aria-checked')).toBe('true')
        await context.close()
    })
})
