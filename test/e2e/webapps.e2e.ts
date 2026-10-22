// SPDX-License-Identifier: GPL-3.0-only
// Web viewer and editor (MuseScore Web, started as a copy of the viewer) in headless Chrome: npm run test:e2e
// (needs Google Chrome; CHROME_PATH=<binary> to use another one).
import { existsSync, readFileSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEMOS, ROOT, TEST_FILES, VTEST, hasSubmodule } from '../helpers'

const CHROME = process.env.CHROME_PATH ?? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(p => existsSync(p))

// scores are served from a fake host (request interception), like a score on another web server
const SCORES: Record<string, string> = {
    'amazing.mscz': `${DEMOS}/Amazing_grace.mscz`,
    'goldberg.mscz': `${DEMOS}/goldberg.mscz`,
    'twosided.mscz': `${VTEST}/page-numbers-03.mscz`,
    'landscape.mscz': `${VTEST}/mmrest-measure-repeat-custom-staves.mscz`,
    'chopin.mscz': `${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`,
    'onesided.mscz': `${DEMOS}/All_Dudes.mscz`,
}
const SCORE_HOST = 'http://scores.test/'

let server: ViteDevServer
let browser: Browser
let base = ''

async function newPage(opts: { colorScheme?: 'light' | 'dark'; delayMs?: number } = {}): Promise<{ page: Page; context: BrowserContext }> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: opts.colorScheme })
    await context.route(`${SCORE_HOST}**`, async route => {
        const name = route.request().url().slice(SCORE_HOST.length)
        if (opts.delayMs) {
            await new Promise(r => setTimeout(r, opts.delayMs))
        }
        await route.fulfill({ body: readFileSync(SCORES[name]), headers: { 'access-control-allow-origin': '*' } })
    })
    const page = await context.newPage()
    page.on('pageerror', e => { throw e })
    return { page, context }
}

async function openScore(page: Page, name: string): Promise<void> {
    await page.goto(`${base}?url=${encodeURIComponent(SCORE_HOST + name)}`)
    await page.waitForFunction(() => /pages?$/.test(document.getElementById('status')?.textContent ?? '')
        || /\d+ ms$/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 120000 })
    await page.waitForFunction(() => document.getElementById('busy')!.hidden)
}

const text = (page: Page, id: string): Promise<string> => page.evaluate(i => document.getElementById(i)!.textContent ?? '', id)

/** waits until the page indicator shows `info` (navigation scrolls smoothly) */
const pageInfoIs = (page: Page, info: string): Promise<unknown> =>
    page.waitForFunction(i => (document.getElementById('page-info') ?? document.querySelector('.page-info'))!.textContent === i, info, { timeout: 10000 })

/** offset of the page's center from the view's center */
function pageCenterOffset(page: Page, idx = 0): Promise<[number, number]> {
    return page.evaluate((i) => {
        const v = document.getElementById('viewport')!.getBoundingClientRect()
        const p = document.querySelectorAll('.page:not(.placeholder)')[i].getBoundingClientRect()
        // + 0: no -0
        return [Math.round(p.left + p.width / 2 - v.left - v.width / 2) + 0, Math.round(p.top + p.height / 2 - v.top - v.height / 2) + 0]
    }, idx)
}

/**
 * the hand tool: Space + drag (in the editor the default setting "Hold Space and drag to move the score"), or the
 * middle mouse button in the editor
 */
async function handDrag(page: Page, app: string, dx: number, dy: number, middleButton = false): Promise<void> {
    const space = app === 'webviewer' || !middleButton
    await page.mouse.move(640, 400)
    if (space) {
        await page.keyboard.down(' ')
    }
    await page.mouse.down({ button: space ? 'left' : 'middle' })
    for (let i = 1; i <= 10; ++i) {
        await page.mouse.move(640 + dx * i / 10, 400 + dy * i / 10)
    }
    await page.mouse.up({ button: space ? 'left' : 'middle' })
    if (space) {
        await page.keyboard.up(' ')
    }
}

describe.skipIf(!CHROME || !hasSubmodule).each(['webviewer', 'musescoreweb'])('%s', (app) => {
    // the viewer's toolbar has ids; the editor's toolbars are made of MuseScore's actions
    const editor = app === 'musescoreweb'
    const sel = editor ? {
        layoutV: '[data-action="view-pages-vertical"]', spread: '[data-action="view-two-pages"]', zoom: '.zoom-select',
        center: '[data-action="view-center-page"]', fullscreen: '[data-action="fullscreen"]', pageInfo: '.page-info',
    } : {
        layoutV: '#layout-v', spread: '#spread', zoom: '#zoom', center: '#center', fullscreen: '#fullscreen', pageInfo: '#page-info',
    }
    // MuseScore's full screen shortcut on macOS is Ctrl+Cmd+F
    const fullscreenKey = editor && process.platform === 'darwin' ? 'Control+Meta+f' : 'F11'
    beforeAll(async () => {
        server = await createServer({ configFile: `${ROOT}${app}/vite.config.ts`, root: `${ROOT}${app}`, server: { port: 0 }, logLevel: 'error' })
        await server.listen()
        base = server.resolvedUrls!.local[0]
        browser = await chromium.launch({ executablePath: CHROME, headless: true })
    }, 60000)

    afterAll(async () => {
        await browser?.close()
        await server?.close()
    })

    it.runIf(app === 'webviewer')('shows the centered drop target without a file and nothing to scroll', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.waitForFunction(() => document.getElementById('status')!.textContent === 'Ready')
        const r = await page.evaluate(() => {
            const v = document.getElementById('viewport')!
            const d = document.querySelector('.drop-target')!.getBoundingClientRect()
            const vr = v.getBoundingClientRect()
            return {
                scrollable: [v.scrollWidth - v.clientWidth, v.scrollHeight - v.clientHeight],
                center: [Math.round(d.left + d.width / 2 - vr.left - vr.width / 2), Math.round(d.top + d.height / 2 - vr.top - vr.height / 2)],
            }
        })
        expect(r.scrollable).toEqual([0, 0])
        expect(r.center).toEqual([0, 0])
        await context.close()
    })

    it('shows a blocking loading window while a file is opened', async () => {
        const { page, context } = await newPage({ delayMs: 1500 })
        let chooser = false
        page.on('filechooser', () => { chooser = true })
        await page.goto(`${base}?url=${encodeURIComponent(SCORE_HOST + 'amazing.mscz')}`)
        await page.waitForFunction(() => !document.getElementById('busy')!.hidden)
        expect(await text(page, 'busy-title')).toBe('Opening amazing.mscz')
        expect(await text(page, 'busy-detail')).toBe('Downloading…')
        expect(await page.evaluate(() => document.getElementById('viewport')!.hasAttribute('inert'))).toBe(true)
        await page.keyboard.press('Control+O') // ignored while busy
        await page.waitForFunction(() => document.getElementById('busy')!.hidden, null, { timeout: 60000 })
        expect(chooser).toBe(false)
        expect(await text(page, 'status')).toMatch(/2 pages/)
        await context.close()
    })

    it('opens a score centered, remembers it and forgets it when closed', async () => {
        const { page, context } = await newPage()
        // the viewer shows its drop target without a score, the editor its home screen
        const noScore = (): Promise<boolean> => page.evaluate((a) => a === 'webviewer'
            ? !document.getElementById('empty')!.hidden
            : !!document.querySelector('.home') && document.body.dataset.view === 'home', app)
        await openScore(page, 'amazing.mscz')
        expect(await text(page, 'title')).toBe('amazing')
        expect(await page.textContent(sel.pageInfo)).toBe('1 / 2')
        expect(await pageCenterOffset(page)).toEqual([0, 0])

        await page.goto(base) // no ?url: the last file is opened again
        await page.waitForFunction(() => /2 pages/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 60000 })
        expect(await text(page, 'title')).toBe('amazing')

        await page.click('#clear')
        expect(await noScore()).toBe(true)
        await page.reload() // at once: the file must not come back
        await page.waitForTimeout(1500)
        expect(await noScore()).toBe(true)
        await context.close()
    }, 120000)

    it('shows pages side by side or vertically and two-page spreads for two-sided layouts', async () => {
        const { page, context } = await newPage()
        const rects = (): Promise<DOMRect[]> => page.evaluate(() =>
            [...document.querySelectorAll('.page:not(.placeholder)')].map(p => p.getBoundingClientRect().toJSON() as DOMRect))
        await openScore(page, 'twosided.mscz')
        let r = await rects()
        expect(r[1].left).toBeGreaterThan(r[0].right) // side by side (default)
        await page.click(sel.layoutV)
        r = await rects()
        expect(r[1].top).toBeGreaterThan(r[0].bottom)
        expect(await page.isDisabled(sel.spread)).toBe(false)
        await page.click(sel.spread)
        // page 1 is a right-hand page: [placeholder, 1], [2, 3], [4]
        const spreads = await page.evaluate(() => [...document.querySelectorAll('.spread')].map(s =>
            [...s.children].map(c => c.classList.contains('placeholder') ? '-' : Number((c as HTMLElement).dataset.page) + 1).join(',')))
        expect(spreads).toEqual(['-,1', '2,3', '4'])
        r = await rects()
        expect(Math.round(r[2].left)).toBe(Math.round(r[1].right)) // facing pages without gap
        expect(await page.textContent(sel.pageInfo)).toBe('1 / 4')
        await page.keyboard.press('ControlOrMeta+PageDown')
        await pageInfoIs(page, '2–3 / 4')

        await openScore(page, 'onesided.mscz')
        expect(await page.isDisabled(sel.spread)).toBe(true)
        await context.close()
    }, 120000)

    it('navigates and zooms with MuseScore shortcuts and the mouse wheel', async () => {
        const { page, context } = await newPage()
        await openScore(page, 'goldberg.mscz')
        const zoom = (): Promise<string> => page.evaluate(z => (document.querySelector(z) as HTMLSelectElement).selectedOptions[0].textContent ?? '', sel.zoom)
        await page.keyboard.press('ControlOrMeta+0')
        expect(await zoom()).toBe('100%')
        await page.keyboard.press('ControlOrMeta+=')
        expect(await zoom()).toBe('150%')
        await page.keyboard.press('ControlOrMeta+-')
        await page.keyboard.press('ControlOrMeta+-')
        expect(await zoom()).toBe('75%')

        await page.keyboard.press('End')
        await pageInfoIs(page, '119 / 119')
        await page.keyboard.press('Home')
        await pageInfoIs(page, '1 / 119')
        await page.keyboard.press('ControlOrMeta+PageDown')
        await pageInfoIs(page, '2 / 119')

        // mouse wheel zoom keeps the point under the pointer in place
        const before = await page.evaluate(() => document.querySelectorAll('.page')[1].getBoundingClientRect().left)
        await page.mouse.move(700, 400)
        await page.keyboard.down('Control')
        await page.mouse.wheel(0, -100)
        await page.keyboard.up('Control')
        await page.waitForTimeout(300)
        expect(parseFloat(await zoom())).toBeGreaterThan(75)
        const after = await page.evaluate(() => document.querySelectorAll('.page')[1].getBoundingClientRect().left)
        expect(after).toBeLessThan(before) // the page grew around the pointer
        await context.close()
    }, 120000)

    it('moves the view beyond the pages and centers the page again', async () => {
        const { page, context } = await newPage()
        await openScore(page, 'amazing.mscz')
        await handDrag(page, app, 1500, 1200)
        const moved = await page.evaluate(() => {
            const v = document.getElementById('viewport')!.getBoundingClientRect()
            const p = document.querySelector('.page')!.getBoundingClientRect()
            return [Math.round(v.right - p.left), Math.round(v.bottom - p.top)]
        })
        expect(moved).toEqual([48, 48]) // only a strip of the page stays visible
        await page.click(sel.center)
        expect(await pageCenterOffset(page)).toEqual([0, 0])
        if (editor) {
            // the middle mouse button moves the view too
            await handDrag(page, app, 300, 200, true)
            expect(await pageCenterOffset(page)).toEqual([300, 200])
            // with a selection the center button centers it, not the page (the music fills only the upper part of the page)
            await page.focus('#viewport')
            await page.keyboard.press('ControlOrMeta+a')
            await page.click(sel.center)
            const [x, y] = await pageCenterOffset(page)
            expect(Math.abs(x)).toBeLessThan(40)
            expect(Math.abs(y)).toBeGreaterThan(10)
        }
        await context.close()
    }, 120000)

    it('draws zoomed-in pages as sharp tiles of bounded size', async () => {
        const { page, context } = await newPage()
        await openScore(page, 'amazing.mscz')
        await page.selectOption(sel.zoom, '800')
        await page.waitForTimeout(1500)
        const c = await page.evaluate(() => {
            const canvas = document.querySelector('.page canvas') as HTMLCanvasElement
            return { tile: canvas.dataset.tile, pixels: canvas.width * canvas.height, dpi: Number(canvas.dataset.dpi) }
        })
        expect(c.tile).toBe('1')
        expect(c.pixels).toBeLessThanOrEqual(16 * 1024 * 1024)
        expect(c.dpi).toBeCloseTo(96 * 8, 0) // full resolution, not scaled up
        await context.close()
    }, 120000)

    it('collapses the toolbar in full screen and shows it at the top edge', async () => {
        const { page, context } = await newPage()
        await openScore(page, 'amazing.mscz')
        const shown = (): Promise<boolean> => page.evaluate(() => document.body.classList.contains('toolbar-shown'))
        await page.click(sel.fullscreen)
        await page.waitForTimeout(400)
        expect(await page.evaluate(() => document.body.classList.contains('fullscreen'))).toBe(true)
        expect(await shown()).toBe(true) // the pointer is still on it
        await page.mouse.move(640, 500)
        await page.waitForTimeout(700)
        expect(await shown()).toBe(false)
        await page.mouse.move(640, 3)
        await page.waitForTimeout(300)
        expect(await shown()).toBe(true)
        await page.mouse.move(640, 400)
        await page.waitForTimeout(700)
        expect(await shown()).toBe(false)
        if (editor) {
            // the bottom toolbar dock with the status bar and the panels: the same at the bottom and left edge
            const has = (c: string): Promise<boolean> => page.evaluate(c => document.body.classList.contains(c), c)
            const hidden = (sel: string): Promise<boolean> => page.evaluate(s => {
                const r = document.querySelector(s)!.getBoundingClientRect()
                return r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth
            }, sel)
            expect(await has('bottom-shown')).toBe(false)
            expect(await hidden('.statusbar')).toBe(true)
            expect(await has('panels-shown')).toBe(false)
            expect(await hidden('.panel-dock')).toBe(true)
            await page.mouse.move(640, 797)
            await page.waitForTimeout(400)
            expect(await has('bottom-shown')).toBe(true)
            expect(await hidden('.statusbar')).toBe(false)
            await page.mouse.move(640, 400)
            await page.waitForTimeout(700)
            expect(await has('bottom-shown')).toBe(false)
            await page.mouse.move(2, 400)
            await page.waitForTimeout(400)
            expect(await has('panels-shown')).toBe(true)
            expect(await hidden('.panel-dock')).toBe(false)
            await page.mouse.move(150, 400) // on the panels: stays
            await page.waitForTimeout(700)
            expect(await has('panels-shown')).toBe(true)
            await page.mouse.move(900, 400)
            await page.waitForTimeout(700)
            expect(await has('panels-shown')).toBe(false)
        }
        await page.keyboard.press(fullscreenKey)
        await page.waitForTimeout(300)
        expect(await page.evaluate(() => document.body.classList.contains('fullscreen'))).toBe(false)
        await context.close()
    }, 120000)

    it.each([
        ['goldberg.mscz', 119, '8.26x11.69'],
        ['landscape.mscz', 1, '11.69x5.51'],
    ])('prints %s as vector pages on sheets of the score page size', async (name, pages, size) => {
        const { page, context } = await newPage()
        await openScore(page, name)
        const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
        const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
            .map(m => `${(+m[3] / 72).toFixed(2)}x${(+m[4] / 72).toFixed(2)}`)
        expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(pages)
        expect(new Set(boxes)).toEqual(new Set([size]))
        expect(pdf).not.toMatch(/\/Subtype\s*\/Image/) // no bitmaps
        expect(await page.evaluate(() => document.getElementById('print-pages')!.childElementCount)).toBe(0)
        await context.close()
    }, 180000)
})
