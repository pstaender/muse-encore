// SPDX-License-Identifier: GPL-3.0-only
// The editor's home screen, New Score dialog and stored scores in headless Chrome: npm run test:e2e
// (the score view is covered for both apps by webapps.e2e.ts).
import { existsSync, readFileSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEMOS, ROOT, hasSubmodule, openScore } from '../helpers'
import { SegmentType } from '../../src/engraving/dom/segment'
import type { Chord } from '../../src/engraving/dom/chord'

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
    // leaving the page with unsaved changes: the browser asks (beforeunload)
    page.on('dialog', d => void d.accept())
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
        expect(await page.locator('.toolbar-dock').count()).toBe(0) // the toolbars are on the score page
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

        await page.fill('.instruments input[type="search"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.fill('.instruments input[type="search"]', 'piano')
        await page.dblclick('.instruments [role="option"] >> text=Piano')
        const onScore = await page.$$eval('.on-score [role="option"] .item-name', els => els.map(e => e.textContent))
        expect(onScore).toEqual(['Flute', 'Piano'])

        await page.click('dialog.new-score button:has-text("Next")')
        await page.fill('input[placeholder="Untitled score"]', 'Test score')
        await page.fill('input[placeholder="Composer / arranger"]', 'Someone')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        // a new score is unsaved (NotationProject::markAsNewlyCreated)
        expect(await page.textContent('#title')).toBe('*Test score')

        // the open score is created again after a reload
        await page.reload()
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('*Test score')

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
        await page.keyboard.press('ControlOrMeta+n')
        await page.waitForSelector('dialog.new-score[open]')
        await page.click('[role="tab"]:has-text("Create from template")')
        await page.click('.choose-template [role="option"]:has-text("Chamber Music")')
        await page.click('.choose-template [role="option"]:has-text("String Quartet")')
        await page.waitForSelector('.template-preview canvas', { timeout: 60000 })
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('*Untitled score')
        await context.close()
    }, 180000)

    it('has MuseScore\'s menus, operable with the mouse and the keyboard', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.waitForSelector('.home')
        const menus = await page.$$eval('.menubar > button', b => b.map(x => x.textContent))
        expect(menus).toEqual(['File', 'Edit', 'View', 'Add', 'Format', 'Tools', 'Help'])
        await page.click('.menubar > button:has-text("File")')
        const items = await page.$$eval('.menu-popup [role^="menuitem"] .menu-title', e => e.map(x => x.textContent))
        expect(items.slice(0, 4)).toEqual(['New…', 'Open…', 'Open recent', 'Close'])
        await page.click('.menu-popup [role="menuitem"]:has-text("New…")')
        await page.waitForSelector('dialog.new-score[open]')
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => !document.querySelector('dialog[open]'))

        // F10 focuses the menu bar; arrows and Enter open a menu and run an item
        await page.keyboard.press('F10')
        await page.keyboard.press('ArrowRight') // Edit
        await page.keyboard.press('ArrowDown')
        expect(await page.textContent('.menu-popup .menu-item.active .menu-title')).toBe('Undo')
        await page.keyboard.press('End') // Preferences…
        await page.keyboard.press('Enter')
        await page.waitForSelector('dialog.preferences[open]')
        await context.close()
    })

    it('moves, hides and customizes toolbars and keeps their layout', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        const docks = (): Promise<Record<string, string[]>> => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-dock]')]
            .map(d => [d.dataset.dock!, [...d.querySelectorAll<HTMLElement>('[data-toolbar]')].map(t => t.dataset.toolbar!)])))
        expect(await docks()).toEqual({ main: ['notationToolBar', 'undoRedoToolBar'], top: ['noteInputBar', 'viewToolBar'] })

        // drag the page view toolbar before the note input toolbar
        const grip = page.locator('[data-toolbar="viewToolBar"] .toolbar-grip')
        const target = await page.locator('[data-toolbar="noteInputBar"]').boundingBox()
        const g = await grip.boundingBox()
        await page.mouse.move(g!.x + 5, g!.y + 10)
        await page.mouse.down()
        await page.mouse.move(target!.x + 10, target!.y + 15, { steps: 8 })
        await page.mouse.up()
        expect((await docks()).top).toEqual(['viewToolBar', 'noteInputBar'])

        // hide the note input toolbar (View > Toolbars) and remove a button from it
        await page.click('[data-toolbar="noteInputBar"] button[aria-label="Customize toolbar"]')
        await page.click('.customise-list li[data-action="pad-note-4"] input[type="checkbox"]')
        await page.keyboard.press('Escape')
        expect(await page.locator(".tool-button[data-action=\"pad-note-4\"]").count()).toBe(0)
        await page.click('.menubar > button:has-text("View")')
        await page.hover('.menu-item:has-text("Toolbars")')
        await page.click('.menu-item:has-text("Note input")')
        await page.waitForFunction(() => !document.querySelector('[data-toolbar="noteInputBar"]')) // menu actions run after the menu closed

        await page.reload()
        await scoreShown(page)
        expect((await docks()).top).toEqual(['viewToolBar'])
        await page.click('.menubar > button:has-text("View")')
        await page.click('.menu-item:has-text("Restore the default layout")')
        await page.waitForSelector('[data-toolbar="noteInputBar"]')
        expect(await docks()).toEqual({ main: ['notationToolBar', 'undoRedoToolBar'], top: ['noteInputBar', 'viewToolBar'] })
        expect(await page.locator(".tool-button[data-action=\"pad-note-4\"]").count()).toBe(1)
        await context.close()
    }, 120000)

    it('uses MuseScore\'s translations', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.waitForSelector('.home')
        await page.click('.menubar > button:has-text("Edit")')
        await page.click('.menu-item:has-text("Preferences")')
        await page.selectOption('dialog.preferences select', 'de')
        await page.waitForFunction(() => document.documentElement.lang === 'de')
        await page.click('dialog.preferences .dialog-buttons button')
        expect(await page.$$eval('.menubar > button', b => b.map(x => x.textContent))).toEqual(
            ['Datei', 'Bearbeiten', 'Ansicht', 'Hinzufügen', 'Formatierung', 'Werkzeuge', 'Hilfe'])
        expect(await page.textContent('#home-title')).toBe('Partituren')
        await page.reload()
        await page.waitForFunction(() => document.querySelector('.menubar > button')?.textContent === 'Datei')
        // instruments in the New Score dialog
        await page.click('.home-footer .primary')
        await page.fill('dialog.new-score input[type="search"]', 'Flöte')
        expect(await page.locator('.instruments [role="option"]:has-text("Flöte")').count()).toBeGreaterThan(0)
        await context.close()
    })

    it('selects elements with the mouse and the keyboard and shows them in the status bar', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        const status = (): Promise<string> => page.textContent('#status').then(t => t ?? '')
        const p = (await page.locator('.page').first().boundingBox())!
        // the rest at the start of the soprano staff
        await page.mouse.click(p.x + p.width * 0.22, p.y + p.height * 0.155)
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Rest;'))
        expect(await status()).toContain('Measure: 1; Beat: 1; Staff 1 (Soprano)')
        // MuseScore's selection color (the page is redrawn after the selection change)
        const blue = await page.waitForFunction(() => {
            const c = document.querySelector<HTMLCanvasElement>('.page canvas')!
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 2] - d[i] > 100 && d[i + 2] > d[i + 1] + 40) { // #0065BF, antialiased
                    return true
                }
            }
            return false
        }).then(() => true)
        expect(blue).toBe(true)
        const before = await status()
        await page.keyboard.press('ArrowRight') // the next chord or rest
        await page.waitForFunction(b => document.getElementById('status')!.textContent !== b, before)
        expect(await status()).toMatch(/^(Note|Rest|Chord);.*Measure: 1; Beat: [^1]/)
        // shift+click on the staff in measure 3: a range
        await page.keyboard.down('Shift')
        await page.mouse.click(p.x + p.width * 0.45, p.y + p.height * 0.155)
        await page.keyboard.up('Shift')
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Range selection'))
        expect(await status()).toContain('Start measure: 1')
        expect(await status()).toContain('End measure: 3')
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => /\d+ ms$/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('ControlOrMeta+a')
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Range selection'))
        await context.close()
    }, 120000)

    it('enters notes with the keyboard, undoes and deletes them', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('.home-footer button:has-text("New")')
        await page.waitForSelector('dialog.new-score[open]')
        await page.fill('.instruments input[type="search"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        const status = (): Promise<string> => page.textContent('#status').then(t => t ?? '')
        const pressed = (code: string): Promise<string | null> => page.getAttribute(`.tool-button[data-action="${code}"]`, 'aria-pressed')
        const undoButton = '.tool-button[data-action="action://notation/undo"]'
        expect(await page.isDisabled(undoButton)).toBe(true)

        // N starts note input at the first rest, C D E enter quarter notes
        await page.focus('#viewport')
        await page.keyboard.press('n')
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="note-input-by-note-name"]')?.getAttribute('aria-pressed') === 'true')
        expect(await pressed('pad-note-4')).toBe('true')
        await page.keyboard.press('c')
        await page.keyboard.press('d')
        await page.keyboard.press('e')
        await page.waitForFunction(() => /^Note;.*Pitch: E5/.test(document.getElementById('status')!.textContent!))
        expect(await status()).toContain('Measure: 1; Beat: 3')
        expect(await page.isDisabled(undoButton)).toBe(false)

        // a duration key changes the input duration
        await page.keyboard.press('4') // pad-note-8
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="pad-note-8"]')?.getAttribute('aria-pressed') === 'true')
        expect(await pressed('pad-note-4')).toBe('false')

        // undo removes the last note, Escape ends note input
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => !/Pitch: E5/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="note-input-by-note-name"]')?.getAttribute('aria-pressed') !== 'true')

        // the selected note: up arrow raises it, Delete replaces it with a rest
        await page.keyboard.press('ArrowLeft')
        await page.waitForFunction(() => /^Note;.*Pitch: C5/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('ArrowUp')
        await page.waitForFunction(() => /^Note;.*Pitch: C♯5/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('Delete')
        await page.waitForFunction(() => /^Rest/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => /^Note;.*Pitch: C♯5/.test(document.getElementById('status')!.textContent!))
        await context.close()
    }, 180000)

    it('enters a triplet and a slur by keyboard, re-pitches notes and enters notes with the mouse', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('.home-footer button:has-text("New")')
        await page.waitForSelector('dialog.new-score[open]')
        await page.fill('.instruments input[type="search"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        const status = (): Promise<string> => page.textContent('#status').then(t => t ?? '')
        const waitStatus = (re: RegExp): Promise<unknown> => page.waitForFunction(
            (src) => new RegExp(src).test(document.getElementById('status')!.textContent!), re.source)
        const pressed = (code: string): Promise<string | null> => page.getAttribute(`.tool-button[data-action="${code}"]`, 'aria-pressed')

        // N, Ctrl+3: a triplet of eighths; S starts a slur at D, F ends it
        await page.focus('#viewport')
        await page.keyboard.press('n')
        await page.keyboard.press('ControlOrMeta+3')
        await waitStatus(/^Rest.*Duration: Triplet Eighth/)
        await page.keyboard.press('c')
        await page.keyboard.press('d')
        await waitStatus(/^Note;.*Pitch: D5; Duration: Triplet Eighth/)
        await page.keyboard.press('s')
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="add-slur"]')?.getAttribute('aria-pressed') === 'true')
        await page.keyboard.press('e')
        await page.keyboard.press('f')
        await waitStatus(/^Note;.*Pitch: F5; Duration: Eighth;.*Beat: 2;/)
        await page.keyboard.press('s')
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="add-slur"]')?.getAttribute('aria-pressed') === 'false')
        await page.keyboard.press('Escape')

        // re-pitch mode (Ctrl+Shift+I) from the first note: new pitches, the rhythm stays
        for (let i = 0; i < 3; ++i) {
            const before = await status()
            await page.keyboard.press('ArrowLeft')
            await page.waitForFunction(b => document.getElementById('status')!.textContent !== b, before)
        }
        await waitStatus(/^Note;.*Pitch: C5; Duration: Triplet Eighth;.*Beat: 1;/)
        await page.keyboard.press('ControlOrMeta+Shift+i')
        // note input in the re-pitch mode (hidden in the default toolbar): the note name button is not pressed
        await page.waitForFunction(() => document.querySelector('.tool-button[data-action="note-input-by-note-name"]')?.getAttribute('aria-pressed') === 'false')
        await page.keyboard.press('g')
        await waitStatus(/^Note;.*Pitch: G4; Duration: Triplet Eighth;.*Beat: 1;/)
        await page.keyboard.press('a')
        await waitStatus(/^Note;.*Pitch: A4; Duration: Triplet Eighth;.*Beat: 1\.33/)
        expect(await pressed('note-input-by-note-name')).toBe('false')
        await page.keyboard.press('Escape')

        // the mouse in note input mode: the shadow note follows it, a click on the middle line of measure 2 enters a B4
        await page.keyboard.press('n')
        // zoom 100 % (Ctrl+0), the top of the first page in view
        await page.keyboard.press('ControlOrMeta+0')
        await page.waitForTimeout(400)
        await page.evaluate(() => {
            const v = document.getElementById('viewport')!
            const pr = document.querySelector('.page')!.getBoundingClientRect()
            v.scrollBy(0, pr.top - v.getBoundingClientRect().top - 20)
        })
        await page.waitForTimeout(400)
        const p = (await page.locator('.page').first().boundingBox())!
        const x = p.x + p.width * 0.38
        // the staff lines in the page bitmap at that x (dark pixels), the middle one of the first staff
        const lineY = await page.evaluate((fx) => {
            const c = document.querySelector<HTMLCanvasElement>('.page canvas')!
            const col = Math.round(c.width * fx)
            const d = c.getContext('2d')!.getImageData(col, 0, 1, c.height).data
            // runs of non-white rows (antialiased lines), their centers
            const lines: number[] = []
            let runStart = -1
            for (let y = 0; y <= c.height; ++y) {
                const dark = y < c.height && d[y * 4] < 245
                if (dark && runStart < 0) {
                    runStart = y
                } else if (!dark && runStart >= 0) {
                    lines.push((runStart + y - 1) / 2)
                    runStart = -1
                }
            }
            // the first five equally spaced runs are the staff lines
            for (let i = 0; i + 4 < lines.length; ++i) {
                const gap = lines[i + 1] - lines[i]
                if ([2, 3, 4].every(k => Math.abs(lines[i + k] - lines[i + k - 1] - gap) <= 1)) {
                    return (lines[i + 2] + 0.5) / c.height
                }
            }
            return -1
        }, 0.38)
        expect(lineY).toBeGreaterThan(0)
        const y = p.y + p.height * lineY
        await page.mouse.move(x, y - 40)
        await page.mouse.move(x, y, { steps: 4 })
        await page.waitForSelector('.page canvas.shadow-note')
        await page.mouse.click(x, y)
        await waitStatus(/^Note;.*Pitch: B4;.*Measure: 2;/)
        expect(await page.locator('.page canvas.shadow-note').count()).toBe(1)
        await page.keyboard.press('Escape')
        await page.mouse.move(x, y + 5)
        await page.waitForFunction(() => !document.querySelector('.page canvas.shadow-note'))
        await context.close()
    }, 180000)

    it('saves the edited score in the browser and asks before closing it with unsaved changes', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('.home-footer button:has-text("New")')
        await page.waitForSelector('dialog.new-score[open]')
        await page.fill('.instruments input[type="search"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        await page.focus('#viewport')
        await page.keyboard.press('n')
        await page.keyboard.press('c')
        await page.keyboard.press('d')
        await page.waitForFunction(() => /^Note;.*Pitch: D5/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('Escape')
        // Ctrl+Home selects the clef, the right arrow moves to the first note
        const firstNote = async (): Promise<void> => {
            await page.keyboard.press('ControlOrMeta+Home')
            await page.waitForFunction(() => /^Treble clef/.test(document.getElementById('status')!.textContent!))
            await page.keyboard.press('ArrowRight')
            await page.waitForFunction(() => /^Note/.test(document.getElementById('status')!.textContent!))
        }

        // File > Save stores it (a new score: through "Save as"); after a reload the notes are there
        // the tab shows "*" before the title while there are unsaved changes (NotationSwitchButton)
        expect(await page.textContent('#title')).toMatch(/^\*/)
        await page.keyboard.press('ControlOrMeta+s')
        await page.waitForSelector('dialog.save-score[open]')
        await page.click('dialog.save-score button[type="submit"]')
        await page.waitForFunction(() => !document.getElementById('title')!.textContent!.startsWith('*'))
        await page.reload()
        await scoreShown(page)
        await page.focus('#viewport')
        await firstNote()
        expect(await page.textContent('#status')).toMatch(/^Note;.*Pitch: C5/)

        // an unsaved change: closing asks; "Cancel" keeps the score open, "Don’t save" closes it
        await page.keyboard.press('ArrowUp')
        await page.waitForFunction(() => /^Note;.*Pitch: C♯5/.test(document.getElementById('status')!.textContent!))
        await page.click('.notation-tab #clear')
        await page.waitForSelector('dialog.confirm[open]')
        expect(await page.textContent('#save-changes-title')).toContain('before closing')
        await page.click('dialog.confirm button[value="cancel"]')
        expect(await page.isVisible('.notation-tab')).toBe(true)
        await page.click('.notation-tab #clear')
        await page.click('dialog.confirm button[value="dontSave"]')
        await page.waitForSelector('.home')
        // the stored version is the saved one
        await page.click('.score-card:not(.new)')
        await scoreShown(page)
        await page.focus('#viewport')
        await firstNote()
        expect(await page.textContent('#status')).toMatch(/^Note;.*Pitch: C5/)
        await context.close()
    }, 180000)

    it('edits the selection from the palettes and the Properties panel (undoable)', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+Home')
        for (let i = 0; i < 8 && !(await page.textContent('#status'))!.startsWith('Note'); i++) {
            await page.keyboard.press('ArrowRight')
        }
        const before = (await page.textContent('#status'))!
        expect(before).toMatch(/^Note/)
        expect(await page.textContent('#title')).not.toMatch(/^\*/)

        // a palette cell: the flat of the accidentals palette
        await page.click('.palette-tree-item[data-palette-type="Accidental"] .palette-header')
        const flat = '.palette-tree-item[data-palette-type="Accidental"] .palette-cell[aria-label="Flat"]'
        await page.waitForSelector(flat)
        await page.click(flat)
        await page.waitForFunction(() => /^Note;.*Pitch: [A-G]♭/.test(document.getElementById('status')!.textContent!))
        expect(await page.textContent('#title')).toMatch(/^\*/)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction((b) => document.getElementById('status')!.textContent === b, before)

        // the Properties panel: "Visible" off, then undo
        await page.click('#panel-tab-inspectorPanel')
        const visible = '.inspector [data-section="SECTION_GENERAL"] [data-property="isVisible"] input'
        await page.waitForSelector(visible)
        expect(await page.isChecked(visible)).toBe(true)
        await page.click(visible)
        await page.waitForFunction((sel) => !document.querySelector<HTMLInputElement>(sel)!.checked, visible)
        expect(await page.textContent('#title')).toMatch(/^\*/)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction((sel) => document.querySelector<HTMLInputElement>(sel)!.checked, visible)
        expect(await page.textContent('#title')).not.toMatch(/^\*/)

        // the notehead parentheses (Score::cmdAddParenthesesToNotes), then undo
        const notation = '.inspector [data-section="SECTION_NOTATION"]'
        if (await page.getAttribute(`${notation} .insp-section-header`, 'aria-expanded') !== 'true') {
            await page.click(`${notation} .insp-section-header`)
        }
        const withParens = `${notation} [role="radio"][aria-label="Notehead with parentheses"]`
        await page.waitForSelector(withParens)
        expect(await page.getAttribute(withParens, 'aria-checked')).toBe('false')
        await page.click(withParens)
        await page.waitForFunction((sel) => document.querySelector(sel)!.getAttribute('aria-checked') === 'true', withParens)
        expect(await page.textContent('#title')).toMatch(/^\*/)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction((sel) => document.querySelector(sel)!.getAttribute('aria-checked') === 'false', withParens)
        expect(await page.textContent('#title')).not.toMatch(/^\*/)
        await context.close()
    }, 180000)

    it('shows the panels Palettes, Layout and Properties, toggled by the View menu and shortcuts', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        const tabs = (): Promise<string[]> => page.$$eval('.panel-tabs [role="tab"]', t => t.map(x => x.textContent ?? ''))
        const currentTab = (): Promise<string | null> => page.textContent('.panel-tabs [role="tab"][aria-selected="true"]')
        expect(await tabs()).toEqual(['Palettes', 'Layout', 'Properties'])
        expect(await currentTab()).toBe('Palettes')

        // View > Properties hides it (checked menu item), F9 hides the palettes, F7 the layout panel
        await page.click('.menubar > button:has-text("View")')
        expect(await page.getAttribute('.menu-item:has-text("Properties")', 'aria-checked')).toBe('true')
        await page.click('.menu-item:has-text("Properties")')
        await page.waitForFunction(() => document.querySelectorAll('.panel-tabs [role="tab"]').length === 2)
        await page.keyboard.press('F9')
        await page.waitForFunction(() => document.querySelectorAll('.panel-tabs [role="tab"]').length === 1)
        expect(await currentTab()).toBe('Layout')
        await page.keyboard.press('F7')
        await page.waitForFunction(() => !document.querySelector('.panel-dock'))
        // showing a panel makes it the current tab
        await page.keyboard.press('F9')
        await page.waitForSelector('.panel-dock')
        expect(await tabs()).toEqual(['Palettes'])

        // the tab's menu closes it; keyboard navigation between tabs
        await page.keyboard.press('F7')
        await page.waitForFunction(() => document.querySelectorAll('.panel-tabs [role="tab"]').length === 2)
        expect(await currentTab()).toBe('Layout')
        await page.focus('.panel-tabs [role="tab"][aria-selected="true"]')
        await page.keyboard.press('ArrowLeft')
        expect(await currentTab()).toBe('Palettes')
        await page.click('.panel-tab.current .panel-tab-menu')
        await page.click('.menu-item:has-text("Close")')
        await page.waitForFunction(() => document.querySelectorAll('.panel-tabs [role="tab"]').length === 1)
        expect(await tabs()).toEqual(['Layout'])

        // the width: dragging the splitter; kept with the open panels across reloads
        const dockWidth = (): Promise<number> => page.$eval('.panel-dock', d => d.getBoundingClientRect().width)
        expect(await dockWidth()).toBe(300)
        const s = (await page.locator('.panel-splitter').boundingBox())!
        await page.mouse.move(s.x + 2, s.y + 200)
        await page.mouse.down()
        await page.mouse.move(s.x + 82, s.y + 200, { steps: 5 })
        await page.mouse.up()
        expect(await dockWidth()).toBe(380)
        await page.reload()
        await scoreShown(page)
        expect(await tabs()).toEqual(['Layout'])
        expect(await dockWidth()).toBe(380)

        // "Restore the default layout"
        await page.click('.menubar > button:has-text("View")')
        await page.click('.menu-item:has-text("Restore the default layout")')
        await page.waitForFunction(() => document.querySelectorAll('.panel-tabs [role="tab"]').length === 3)
        expect(await currentTab()).toBe('Palettes')
        expect(await dockWidth()).toBe(300)
        await context.close()
    }, 120000)

    it('shows the palettes with rendered cells, search and keyboard navigation', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.waitForSelector('.palettes-panel .palette-tree-item[data-palette-type="Clef"]')
        // expand the clefs: the cells are drawn
        await page.click('.palette-tree-item[data-palette-type="Clef"] .palette-header')
        await page.waitForSelector('.palette-tree-item[data-palette-type="Clef"] .palette-header[aria-expanded="true"]')
        const cell = '.palette-tree-item[data-palette-type="Clef"] .palette-cell[data-element="Clef"]'
        expect(await page.getAttribute(cell, 'title')).toBe('Treble clef')
        const inked = await page.waitForFunction((sel) => {
            const c = document.querySelector<HTMLCanvasElement>(`${sel} canvas.palette-cell-canvas`)
            const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data
            return !!d && d.some((v, i) => i % 4 === 3 && v > 0)
        }, cell).then(() => true)
        expect(inked).toBe(true)
        // arrows move between the cells
        await page.focus(`${cell}:first-child`)
        const label = (): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
        const first = await label()
        await page.keyboard.press('ArrowRight')
        expect(await label()).not.toBe(first)
        await page.keyboard.press('ArrowLeft')
        expect(await label()).toBe(first)
        // the search
        await page.click('.palette-search-button')
        await page.fill('.palette-search input', 'trill')
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.palette-tree-item')].map(e => e.dataset.paletteType).join() === 'Ornament,Line')
        await context.close()
    }, 120000)

    it('lists the parts of the score in the Layout panel, synced with the selection', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.click('#panel-tab-instrumentsPanel')
        const parts = await page.$$eval('.layout-tree [role="treeitem"][data-type="part"]', r => r.map(x => x.getAttribute('aria-label')))
        expect(parts).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass'])
        expect(await page.locator('.layout-tree [data-type="system-objects"]').count()).toBeGreaterThan(0)
        // expanding a part shows its staff and the "Add staff" row
        await page.click('.layout-tree [data-type="part"] .expand')
        await page.waitForSelector('.layout-tree [data-type="part"][aria-expanded="true"]')
        expect(await page.locator('.layout-tree [data-type="staff"]').count()).toBe(1)
        expect(await page.locator('.layout-tree [data-type="control"]').count()).toBe(1)
        // the score selection selects the rows of its parts
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+a')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [data-type="part"][aria-selected="true"]').length === 4)
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [aria-selected="true"]').length === 0)
        await context.close()
    }, 120000)

    it('edits the instruments in the Layout panel: hides a part, undoes, removes and adds instruments', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.click('#panel-tab-instrumentsPanel')
        const partNames = (): Promise<(string | null)[]> =>
            page.$$eval('.layout-tree [role="treeitem"][data-type="part"]', r => r.map(x => x.getAttribute('aria-label')))
        const alto = '.layout-tree [data-type="part"][aria-label="Alto"]'
        const undoButton = '.tool-button[data-action="action://notation/undo"]'

        // the eye button hides the part and its staff (undoable: "Hide instrument", "Hide staff", like MuseScore)
        expect(await page.isDisabled(`${alto} .visibility`)).toBe(false)
        await page.click(`${alto} .visibility`)
        await page.waitForSelector(`${alto}.hidden-item`)
        expect(await page.getAttribute(`${alto} .visibility`, 'aria-pressed')).toBe('false')
        expect(await page.isDisabled(undoButton)).toBe(false)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForSelector(`${alto}:not(.hidden-item)`)
        expect(await page.getAttribute(`${alto} .visibility`, 'aria-pressed')).toBe('true')

        // the selected instrument is removed with the remove button; the score has one staff less
        await page.click(`${alto} .layout-row-title`)
        await page.waitForSelector(`${alto}[aria-selected="true"]`)
        await page.click('.layout-controls [data-control="remove"]')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [data-type="part"]').length === 3)
        expect(await partNames()).toEqual(['Soprano', 'Tenor', 'Bass'])

        // Add > New instrument opens the instruments dialog; the chosen instrument is added to the score
        await page.click('.layout-add-button')
        await page.click('.menu-item:has-text("New instrument")')
        await page.waitForSelector('dialog.instruments-dialog[open]')
        await page.fill('dialog.instruments-dialog .instruments input[type="search"]', 'flute')
        await page.dblclick('dialog.instruments-dialog .instruments [role="option"] >> text=Flute')
        await page.click('dialog.instruments-dialog .dialog-buttons button:has-text("OK")')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [data-type="part"]').length === 4)
        expect(await partNames()).toContain('Flute')

        // undo removes the flute again, a second undo restores the alto
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [data-type="part"]').length === 3)
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => document.querySelectorAll('.layout-tree [data-type="part"]').length === 4)
        expect(await partNames()).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass'])
        await context.close()
    }, 180000)

    it('shows the values of the selection in the Properties panel', async () => {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        await page.keyboard.press('F9') // hide the palettes: the properties are the first tab
        await page.click('#panel-tab-inspectorPanel')
        // without a selection: the score sections
        await page.waitForSelector('.inspector [data-section="SECTION_SCORE_DISPLAY"]')
        expect(await page.textContent('.inspector [data-section="SECTION_SCORE_APPEARANCE"] .insp-section-title')).toBe('Score appearance')
        // a note
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+Home')
        for (let i = 0; i < 8 && !(await page.textContent('#status'))!.startsWith('Note'); i++) {
            await page.keyboard.press('ArrowRight')
        }
        expect(await page.textContent('#status')).toMatch(/^Note/)
        await page.waitForSelector('.inspector [data-section="SECTION_NOTATION"]')
        expect(await page.isChecked('.inspector [data-section="SECTION_GENERAL"] [data-property="isVisible"] input')).toBe(true)
        expect(await page.textContent('.inspector [data-section="SECTION_NOTATION"] .insp-section-title')).toBe('Note')
        expect(await page.textContent('[data-view="NoteSettings"] .insp-tabbar [role="tab"][aria-selected="true"]')).toBe('Head')
        expect(await page.isChecked('[data-view="NoteSettings"] [data-property="isHeadHidden"] input')).toBe(false)
        // the whole score: measures
        await page.keyboard.press('ControlOrMeta+a')
        await page.waitForSelector('.inspector [data-section="SECTION_MEASURES"]')
        await context.close()
    }, 120000)

    it('keeps the settings of the home screen', async () => {
        const { page, context } = await newPage()
        await page.goto(base)
        await page.click('button[aria-label="List view"]')
        await page.reload()
        await page.waitForSelector('.home')
        expect(await page.getAttribute('button[aria-label="List view"]', 'aria-checked')).toBe('true')
        await context.close()
    })

    // -----------------------------------------------------------------------------------------------------------
    //   copy/paste, text editing, drag, lasso: the positions of the elements come from the same layout in node
    // -----------------------------------------------------------------------------------------------------------

    /** fractions of the first page (x, y) of the chord/rests of the first staff and of the measures of Amazing grace */
    async function amazingGraceLayout(): Promise<{
        cr: { x: number; y: number; type: string }[]
        measures: { left: number; right: number; staffTop: number; staffBottom: number }[]
        tempo: { x: number; y: number } | null
    }> {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const page = score.pages()[0]
        const pw = page.ldata().bbox().width()
        const ph = page.ldata().bbox().height()
        const cr: { x: number; y: number; type: string }[] = []
        const measures: { left: number; right: number; staffTop: number; staffBottom: number }[] = []
        for (let m = score.firstMeasure(); m && measures.length < 6; m = m.nextMeasure()) {
            const r = m.pageBoundingRect()
            const sys = m.system()!
            const st = sys.staff(0)!.bbox().translated(sys.pagePos())
            measures.push({ left: r.left() / pw, right: r.right() / pw, staffTop: st.top() / ph, staffBottom: st.bottom() / ph })
            for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                const e = s.element(0)
                if (e) {
                    const target = e.isChord() ? (e as unknown as Chord).upNote() : e
                    const c = target.pageBoundingRect().center()
                    cr.push({ x: c.x() / pw, y: c.y() / ph, type: e.typeName() })
                }
            }
        }
        let tempo: { x: number; y: number } | null = null
        score.scanElements(e => {
            if (!tempo && e.isText() && e.parent()?.isVBox()) { // the title
                const c = e.pageBoundingRect().center()
                tempo = { x: c.x() / pw, y: c.y() / ph }
            }
        })
        return { cr, measures, tempo }
    }

    async function openAmazingGrace(): Promise<{ page: Page; context: BrowserContext; box: { x: number; y: number; width: number; height: number } }> {
        const { page, context } = await newPage()
        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        const box = (await page.locator('.page').first().boundingBox())!
        // a selection and its end repaint the pages like after the edits (the first paint differs in antialiasing)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+a')
        await page.waitForTimeout(500)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(1000)
        return { page, context, box }
    }

    const statusText = (page: Page): Promise<string> => page.textContent('#status').then(t => t ?? '')
    const undoButton = '.tool-button[data-action="action://notation/undo"]'

    /** keeps the pixels of the first page (to compare later with pixelsChanged) */
    async function pageSnapshot(page: Page): Promise<string> {
        await page.waitForTimeout(400) // the page is redrawn after a change
        await page.evaluate(() => {
            const c = document.querySelector<HTMLCanvasElement>('.page canvas')!
            ;(window as unknown as { snapshot: Uint8ClampedArray }).snapshot = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        })
        return ''
    }

    /**
     * the number of pixels of the first page that differ from the snapshot (the paint order of equal elements may
     * change after a partial layout, which changes the antialiasing of a few hundred pixels)
     */
    async function pixelsChanged(page: Page): Promise<number> {
        await page.waitForTimeout(400)
        return page.evaluate(() => {
            const c = document.querySelector<HTMLCanvasElement>('.page canvas')!
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
            const s = (window as unknown as { snapshot: Uint8ClampedArray }).snapshot
            if (s.length !== d.length) {
                return d.length
            }
            let n = 0
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - s[i]) > 60 || Math.abs(d[i + 2] - s[i + 2]) > 60) {
                    ++n
                }
            }
            return n
        })
    }

    it('copies a measure and pastes it into another measure (Ctrl+C, Ctrl+V), undoable', async () => {
        const layout = await amazingGraceLayout()
        const { page, context, box } = await openAmazingGrace()
        const at = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy]

        await pageSnapshot(page)
        // empty staff space in measure 2 selects the measure
        const m2 = layout.measures[1]
        await page.mouse.click(...at(m2.left + (m2.right - m2.left) * 0.9, m2.staffTop + (m2.staffBottom - m2.staffTop) * 0.1))
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Range selection'))
        expect(await statusText(page)).toContain('Start measure: 2')
        await page.keyboard.press('ControlOrMeta+c')

        // the first chord/rest of measure 4
        const m4 = layout.measures[3]
        const target = layout.cr.find(c => c.x > m4.left && c.x < m4.right)!
        await page.mouse.click(...at(target.x, target.y))
        await page.waitForFunction(() => /^(Note|Rest|Chord);.*Measure: 4/.test(document.getElementById('status')!.textContent!))
        const targetStatus = await statusText(page)
        await page.keyboard.press('ControlOrMeta+v')
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Range selection'))
        expect(await statusText(page)).toContain('Start measure: 4')
        expect(await page.isDisabled(undoButton)).toBe(false)
        await page.keyboard.press('Escape')
        expect(await pixelsChanged(page)).toBeGreaterThan(50)
        await page.keyboard.press('ControlOrMeta+z')
        await page.keyboard.press('Escape')
        await page.mouse.click(...at(target.x, target.y))
        await page.waitForFunction(() => /^(Note|Rest|Chord);.*Measure: 4/.test(document.getElementById('status')!.textContent!))
        expect(await statusText(page)).toBe(targetStatus)
        await context.close()
    }, 180000)

    it('adds a staff text (Ctrl+T) and types its text', async () => {
        const layout = await amazingGraceLayout()
        const { page, context, box } = await openAmazingGrace()
        const note = layout.cr.find(c => c.type === 'Chord')!
        await page.mouse.click(box.x + box.width * note.x, box.y + box.height * note.y)
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Note;'))
        await page.keyboard.press('ControlOrMeta+t')
        await page.waitForFunction(() => document.activeElement?.classList.contains('notation-text-input'))
        await page.keyboard.type('Allegro molto')
        await page.keyboard.press('Backspace')
        await page.keyboard.press('Backspace')
        await page.keyboard.press('Escape') // ends text editing, the text stays selected
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Staff text: Allegro mol'))
        expect(await page.isDisabled(undoButton)).toBe(false)
        await context.close()
    }, 180000)

    it('adds lyrics to two notes (Ctrl+L, hyphen to the next note)', async () => {
        const layout = await amazingGraceLayout()
        const { page, context, box } = await openAmazingGrace()
        const notes = layout.cr.filter(c => c.type === 'Chord')
        await page.mouse.click(box.x + box.width * notes[0].x, box.y + box.height * notes[0].y)
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Note;'))
        await page.keyboard.press('ControlOrMeta+l')
        await page.waitForFunction(() => document.activeElement?.classList.contains('notation-text-input'))
        await page.keyboard.type('A')
        await page.keyboard.press('-') // next-syllable
        await page.keyboard.type('maz')
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => /^Lyrics: maz/.test(document.getElementById('status')!.textContent!))
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => !/^Lyrics: maz/.test(document.getElementById('status')!.textContent!))
        await context.close()
    }, 180000)

    it('creates a custom palette, adds cells by drag and drop, keeps it after a reload; drops cells on the score', async () => {
        const layout = await amazingGraceLayout()
        const { page, context, box } = await openAmazingGrace()
        const at = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy]

        // Add palettes > Create custom palette
        await page.click('.palettes-header .add-palettes')
        await page.click('.add-palettes-popup button:has-text("Create custom palette")')
        await page.fill('#custom-palette-name', 'My palette')
        await page.click('.add-palettes-popup button:has-text("Create")')
        const custom = '.palette-tree-item[data-palette-type="Custom"]'
        await page.waitForSelector(`${custom} .palette-empty`)
        expect(await page.textContent(`${custom} .palette-name`)).toBe('My palette')
        expect(await page.textContent(`${custom} .palette-empty`)).toBe('Drag and drop any element here')

        // a cell of the clefs dragged into the custom palette
        await page.click('.palette-tree-item[data-palette-type="Clef"] .palette-header')
        const bass = '.palette-tree-item[data-palette-type="Clef"] .palette-cell[aria-label="Bass clef"]'
        await page.dragAndDrop(bass, `${custom} .palette-grid`)
        await page.waitForSelector(`${custom} .palette-cell[aria-label="Bass clef"]`)

        // the title dragged out of the score with Shift+Ctrl onto the custom palette: a custom cell
        const [tx, ty] = at(layout.tempo!.x, layout.tempo!.y)
        const grid = (await page.locator(`${custom} .palette-grid`).boundingBox())!
        await page.keyboard.down('Shift')
        await page.keyboard.down('ControlOrMeta')
        await page.mouse.move(tx, ty)
        await page.mouse.down()
        for (let i = 1; i <= 8; ++i) {
            await page.mouse.move(tx + (grid.x + grid.width / 2 - tx) * i / 8, ty + (grid.y + grid.height / 2 - ty) * i / 8)
        }
        await page.mouse.up()
        await page.keyboard.up('ControlOrMeta')
        await page.keyboard.up('Shift')
        await page.waitForSelector(`${custom} .palette-cell[data-element="Text"]`)

        // the user palettes are kept after a reload
        await page.waitForTimeout(500)
        await page.reload()
        await scoreShown(page)
        await page.waitForSelector(`${custom} .palette-cell[aria-label="Bass clef"]`)
        expect(await page.locator(`${custom} .palette-cell[data-element="Text"]`).count()).toBe(1)

        // the cell's properties (context menu), the name is its tooltip
        await page.click(`${custom} .palette-cell[aria-label="Bass clef"]`, { button: 'right', force: true }) // aria-disabled: no selection
        await page.click('.menu-item:has-text("Properties…")')
        await page.waitForSelector('dialog.palette-properties[open]')
        await page.fill('#palette-cell-name', 'F clef')
        await page.click('dialog.palette-properties button:has-text("OK")')
        await page.waitForSelector(`${custom} .palette-cell[aria-label="F clef"]`)

        // a cell dragged onto a note of the score: the accent is added (undoable)
        await pageSnapshot(page)
        await page.click('.palette-tree-item[data-palette-type="Articulation"] .palette-header')
        const accent = '.palette-tree-item[data-palette-type="Articulation"] .palette-cell[aria-label="Accent above"]'
        await page.waitForSelector(accent)
        const note = layout.cr.find(c => c.type === 'Chord')!
        const vp = (await page.locator('#viewport').boundingBox())!
        const [nx, ny] = at(note.x, note.y)
        await page.dragAndDrop(accent, '#viewport', { targetPosition: { x: nx - vp.x, y: ny - vp.y - 4 } })
        await page.waitForFunction(() => /^\*/.test(document.getElementById('title')!.textContent!))
        expect(await pixelsChanged(page)).toBeGreaterThan(30)
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => !/^\*/.test(document.getElementById('title')!.textContent!))

        // the custom palette is deleted permanently ("Hide/Delete palette" asks)
        await page.click(`${custom} .palette-header`, { button: 'right' })
        await page.click('.menu-item:has-text("Hide/Delete palette")')
        await page.click('dialog.palette-question button[data-value="delete"]')
        await page.waitForFunction((sel) => !document.querySelector(sel), custom)
        await context.close()
    }, 180000)

    it('drags an element with the mouse (undoable) and selects with the lasso (Shift+drag)', async () => {
        const layout = await amazingGraceLayout()
        const { page, context, box } = await openAmazingGrace()
        const at = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy]
        expect(layout.tempo).not.toBeNull()

        // the title: press, move, release
        await pageSnapshot(page)

        const [tx, ty] = at(layout.tempo!.x, layout.tempo!.y)
        await page.mouse.move(tx, ty)
        await page.mouse.down()
        for (let i = 1; i <= 5; ++i) {
            await page.mouse.move(tx + 8 * i, ty + 4 * i)
        }
        await page.mouse.up()
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Title'))
        expect(await page.isDisabled(undoButton)).toBe(false)
        expect(await pixelsChanged(page)).toBeGreaterThan(1000)
        await page.keyboard.press('ControlOrMeta+z')
        await page.keyboard.press('Escape')
        expect(await pixelsChanged(page)).toBeLessThan(800)

        // lasso around the first two measures of the top staff (from empty space above the staff)
        const m1 = layout.measures[0]
        const m2 = layout.measures[1]
        const h = m1.staffBottom - m1.staffTop
        await page.keyboard.down('Shift')
        await page.mouse.move(...at(m1.left + 0.01, m1.staffTop - 0.7 * h))
        await page.mouse.down()
        for (let i = 1; i <= 5; ++i) {
            await page.mouse.move(...at(m1.left + 0.01 + (m2.right - m1.left) * i / 5, m1.staffTop - 0.7 * h + 2 * h * i / 5))
        }
        await page.mouse.up()
        await page.keyboard.up('Shift')
        await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Range selection'))
        expect(await statusText(page)).toContain('Start measure: 1')
        await context.close()
    }, 180000)

    it('saves a new score with Save as, keeps it after a reload, saves to the computer and a copy', async () => {
        const { page, context } = await newPage()
        // without the File System Access API "Save to computer" downloads the file
        await context.addInitScript(() => { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker })
        await page.goto(base)
        await page.click('.home-footer button:has-text("New")')
        await page.waitForSelector('dialog.new-score[open]')
        await page.fill('.instruments input[type="search"]', 'flute')
        await page.dblclick('.instruments [role="option"] >> text=Flute')
        await page.click('dialog.new-score .dialog-buttons button:has-text("Done")')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('*Untitled score')

        // Save on a new score asks for the name (title of the score by default); Escape cancels
        await page.keyboard.press('ControlOrMeta+s')
        await page.waitForSelector('dialog.save-score[open]')
        expect(await page.inputValue('dialog.save-score input')).toBe('Untitled score')
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => !document.querySelector('dialog[open]'))
        expect(await page.textContent('#title')).toBe('*Untitled score')

        await page.keyboard.press('ControlOrMeta+s')
        await page.fill('dialog.save-score input', 'My song')
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => document.getElementById('title')!.textContent === 'My song')

        // the open score is the saved one after a reload; the new score's entry became the saved score
        await page.reload()
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('My song')
        await page.click('.app-tabs [role="tab"]:has-text("Home")')
        expect(await cardNames(page)).toEqual(['My song'])
        await page.click('.app-tabs [role="tab"]:has-text("Score")')

        // Save as (Ctrl+Shift+S): a new score in the list, the open score refers to it
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+Shift+s')
        await page.waitForSelector('dialog.save-score[open]')
        expect(await page.inputValue('dialog.save-score input')).toBe('My song')
        await page.fill('dialog.save-score input', 'Other version')
        await page.click('dialog.save-score button[type="submit"]')
        await page.waitForFunction(() => document.getElementById('title')!.textContent === 'Other version')
        await page.reload()
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('Other version')
        await page.click('.app-tabs [role="tab"]:has-text("Home")')
        expect((await cardNames(page)).sort()).toEqual(['My song', 'Other version'])
        await page.click('.app-tabs [role="tab"]:has-text("Score")')

        // "Save to computer": also downloads the .mscz
        await page.focus('#viewport')
        await page.keyboard.press('ControlOrMeta+Shift+s')
        await page.fill('dialog.save-score input', 'On disk')
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('dialog.save-score .save-to-computer')])
        expect(download.suggestedFilename()).toBe('On disk.mscz')
        await page.waitForFunction(() => document.getElementById('title')!.textContent === 'On disk')

        // File > Save other > Save a copy downloads "<name> - copy.mscz"
        await page.click('.menubar > button:has-text("File")')
        await page.hover('.menu-item:has-text("Save other")')
        const [copy] = await Promise.all([page.waitForEvent('download'), page.click('.menu-item:has-text("Save a copy")')])
        expect(copy.suggestedFilename()).toBe('On disk - copy.mscz')
        expect(await page.textContent('#title')).toBe('On disk')
        await context.close()
    }, 180000)

    it('autosaves a modified score and restores it after the page was left', async () => {
        const { page, context } = await newPage()
        // auto save every 1.2 s
        await context.addInitScript(() => {
            if (!localStorage.getItem('musescoreweb:settings')) {
                localStorage.setItem('musescoreweb:settings', JSON.stringify({ project: { autoSaveEnabled: true, autoSaveInterval: 0.02 } }))
            }
        })
        const autosaves = (): Promise<number> => page.evaluate(() => new Promise<number>((resolve) => {
            const req = indexedDB.open('musescoreweb-scores')
            req.onsuccess = () => {
                const db = req.result
                const count = db.transaction('autosaves', 'readonly').objectStore('autosaves').count()
                count.onsuccess = () => {
                    db.close()
                    resolve(count.result)
                }
            }
        }))
        const waitAutosaves = async (n: number): Promise<void> => {
            for (let i = 0; i < 100 && (await autosaves()) !== n; i++) {
                await page.waitForTimeout(100)
            }
            expect(await autosaves()).toBe(n)
        }
        const status = (): Promise<string> => page.textContent('#status').then(t => t ?? '')
        const firstNote = async (): Promise<string> => {
            await page.focus('#viewport')
            await page.keyboard.press('ControlOrMeta+Home')
            for (let i = 0; i < 8 && !(await status()).startsWith('Note'); i++) {
                await page.keyboard.press('ArrowRight')
            }
            return status()
        }
        const raise = async (): Promise<string> => {
            const before = await firstNote()
            await page.keyboard.press('ArrowUp')
            await page.waitForFunction((b) => document.getElementById('status')!.textContent !== b, before)
            return status()
        }

        await page.goto(`${base}?url=${encodeURIComponent(`${SCORE_HOST}amazing.mscz`)}`)
        await scoreShown(page)
        const original = await firstNote()
        expect(original).toMatch(/^Note/)
        const raised = await raise()
        expect(raised).not.toBe(original)
        expect(await page.textContent('#title')).toBe('*amazing')
        await waitAutosaves(1)

        // the page is left with unsaved changes: the next start asks to restore the session
        await page.goto(base)
        await page.waitForSelector('dialog.restore-session[open]')
        expect(await page.textContent('#restore-session-title')).toBe('The previous session quit unexpectedly.')
        await page.click('dialog.restore-session button[value="yes"]')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('*amazing')
        expect(await firstNote()).toBe(raised)

        // closing without saving removes the autosave; the saved version is opened again
        await page.click('.notation-tab #clear')
        await page.click('dialog.confirm button[value="dontSave"]')
        await page.waitForSelector('.home')
        await waitAutosaves(0)
        await page.click('.score-card:not(.new)')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('amazing')
        expect(await firstNote()).toBe(original)

        // "No" removes the autosave and opens the saved version
        await raise()
        await waitAutosaves(1)
        await page.reload()
        await page.waitForSelector('dialog.restore-session[open]')
        await page.click('dialog.restore-session button[value="no"]')
        await scoreShown(page)
        expect(await page.textContent('#title')).toBe('amazing')
        expect(await firstNote()).toBe(original)
        await waitAutosaves(0)

        // saving removes the autosave; undoing to the saved state, too
        await raise()
        await waitAutosaves(1)
        await page.keyboard.press('ControlOrMeta+s')
        await page.waitForFunction(() => document.getElementById('title')!.textContent === 'amazing')
        await waitAutosaves(0)
        await raise()
        await waitAutosaves(1)
        await page.keyboard.press('ControlOrMeta+z')
        await page.waitForFunction(() => document.getElementById('title')!.textContent === 'amazing')
        await waitAutosaves(0)

        // the preference (Preferences > Save & publish > Auto save every … min)
        await page.click('.menubar > button:has-text("Edit")')
        await page.click('.menu-item:has-text("Preferences")')
        await page.waitForSelector('dialog.preferences[open]')
        await page.click('.preferences-pages li:has-text("Save & publish")')
        await page.uncheck('.autosave-row input[type="checkbox"]')
        expect(await page.isDisabled('.autosave-row input[type="number"]')).toBe(true)
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('musescoreweb:settings')!).project.autoSaveEnabled)).toBe(false)
        await context.close()
    }, 180000)
})
