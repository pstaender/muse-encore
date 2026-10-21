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
        await page.keyboard.press('ControlOrMeta+n')
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

        // File > Save stores it; after a reload the notes are there
        // the tab shows "*" before the title while there are unsaved changes (NotationSwitchButton)
        expect(await page.textContent('#title')).toMatch(/^\*/)
        await page.keyboard.press('ControlOrMeta+s')
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
        await page.click('.palette-tree-item[data-palette="Accidental"] .palette-header')
        const flat = '.palette-tree-item[data-palette="Accidental"] .palette-cell[aria-label="Flat"]'
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
        await page.waitForSelector('.palettes-panel .palette-tree-item[data-palette="Clef"]')
        // expand the clefs: the cells are drawn
        await page.click('.palette-tree-item[data-palette="Clef"] .palette-header')
        await page.waitForSelector('.palette-tree-item[data-palette="Clef"] .palette-header[aria-expanded="true"]')
        const cell = '.palette-tree-item[data-palette="Clef"] .palette-cell[data-element="Clef"]'
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
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.palette-tree-item')].map(e => e.dataset.palette).join() === 'Ornament,Line')
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
})
