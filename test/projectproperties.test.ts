// SPDX-License-Identifier: GPL-3.0-only
// File > Project properties: ProjectPropertiesModel, NotationProject::metaInfo/setMetaInfo (undoable ChangeMetaTags).
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createProjectPropertiesModel, layoutScore, loadScore, undo, writeMscx } from '../src/index'
import { isoDateToText, textDateToIso } from '../src/project/projectpropertiesmodel'
import { ROOT, initFonts } from './helpers'

const VTEST = `${ROOT}MuseScore/vtest/scores/`

describe('QDate text format', () => {
    it('converts ISO dates to Qt::TextDate and back', () => {
        expect(isoDateToText('2026-10-23')).toBe('Fri Oct 23 2026')
        expect(textDateToIso('Fri Oct 23 2026')).toBe('2026-10-23')
        expect(textDateToIso('Sat Feb 30 2026')).toBe('')
        expect(isoDateToText('')).toBe('')
    })
})

describe.skipIf(!existsSync(VTEST))('ProjectPropertiesModel', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('lists the standard and custom tags and saves them as one undoable command', () => {
        const score = loadScore(readFileSync(`${VTEST}beams-10.mscx`))
        layoutScore(score)
        score.setMetaTag('myTag', 'my value')
        const model = createProjectPropertiesModel(score, 'test.mscz')
        model.load()
        const props = model.properties()
        expect(props.slice(0, 14).every(p => p.isStandardProperty)).toBe(true)
        expect(props[0]).toMatchObject({ key: 'workTitle', name: 'Work title' })
        expect(props.find(p => p.name === 'myTag')).toMatchObject({ key: '', value: 'my value', isStandardProperty: false })
        expect(model.filePath()).toBe('test.mscz')
        expect(model.apiLevel()).toBe(String(score.mscVersion()))

        model.setPropertyValue(0, 'New title')
        const i = model.newProperty()
        model.setPropertyName(i, 'added')
        model.setPropertyValue(i, 'x')
        model.deleteProperty(props.findIndex(p => p.name === 'myTag'))
        model.saveProperties()
        expect(score.metaTag('workTitle')).toBe('New title')
        expect(score.metaTag('added')).toBe('x')
        expect(score.metaTags().has('myTag')).toBe(false)
        expect(writeMscx(score)).toContain('<metaTag name="added">x</metaTag>')

        undo(score)
        expect(score.metaTag('workTitle')).not.toBe('New title')
        expect(score.metaTag('myTag')).toBe('my value')
        expect(score.metaTags().has('added')).toBe(false)
    })

    it('keeps the values of the tags without changes (missing standard tags are added empty, like in C++)', () => {
        const score = loadScore(readFileSync(`${VTEST}beams-10.mscx`))
        layoutScore(score)
        const before = new Map(score.metaTags())
        const model = createProjectPropertiesModel(score)
        model.load()
        model.saveProperties()
        for (const [tag, value] of before) {
            expect(score.metaTag(tag)).toBe(value)
        }
        for (const [tag, value] of score.metaTags()) {
            expect(before.has(tag) || value === '').toBe(true)
        }
    })
})
