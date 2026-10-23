// SPDX-License-Identifier: GPL-3.0-only
// The guitar elements of the Guitar Pro import (HarmonicMark, Rasgueado, PickScrape, DeadSlapped, TripletFeel): the
// reference files of MuseScore's guitarpro tests that contain them are read, laid out, drawn and written back.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { drawPageSvg, layoutScore, loadScore, writeMscx } from '../src/index'
import { Factory } from '../src/engraving/dom/factory'
import { ElementType } from '../src/engraving/types/types'
import { Pid } from '../src/engraving/dom/property'
import { TripletFeelType } from '../src/engraving/dom/tripletfeel'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/importexport/guitarpro/tests/data`

/** the <Spanner type="..."> blocks of these types (with their <next>/<prev> locations) */
function spanners(mscx: string, types: string[]): string[] {
    const re = new RegExp(`<Spanner type="(${types.join('|')})">[\\s\\S]*?</Spanner>`, 'g')
    // the texts of a harmonic mark are its defaults once read (HarmonicMark::setProperty sets m_text): like in C++
    // they are not written again
    return (mscx.match(re) ?? []).map(s => s.replace(/<eid>[^<]*<\/eid>/g, '')
        .replace(/\s*<(beginText|continueText)>[^<]*<\/\1>/g, ''))
}

describe.skipIf(!existsSync(DATA))('guitar elements of the Guitar Pro import', () => {
    beforeAll(async () => {
        await initFonts()
    })

    for (const f of ['rasg.gp-ref.mscx', 'line_elements.gp-ref.mscx', 'artificial-harmonic.gp-ref.mscx', 'bend_and_harmonic.gp5-ref.mscx']) {
        it(`reads, lays out, draws and writes ${f}`, () => {
            const input = readFileSync(`${DATA}/${f}`, 'utf8')
            const types = ['HarmonicMark', 'Rasgueado', 'PickScrape']
            const expected = spanners(input, types)
            expect(expected.length).toBeGreaterThan(0)
            const score = loadScore(new TextEncoder().encode(input))
            layoutScore(score)
            for (let i = 0; i < score.npages(); ++i) {
                expect(drawPageSvg(score, i).length).toBeGreaterThan(0)
            }
            // TODO(port): the spanners starting at the same tick are written in another order than in MuseScore (the order of
            // SpannerMap.findOverlapping differs from C++'s interval tree)
            expect(spanners(writeMscx(score), types).sort()).toEqual(expected.sort())
        })
    }

    it('creates the elements', () => {
        const score = loadScore(new TextEncoder().encode(readFileSync(`${DATA}/rasg.gp-ref.mscx`, 'utf8')))
        const hm = Factory.createItem(ElementType.HARMONIC_MARK, score.dummySystem())!
        hm.setProperty(Pid.BEGIN_TEXT, 'A.H.')
        expect(hm.getProperty(Pid.BEGIN_TEXT)).toBe('A.H.')
        expect(hm.propertyDefault(Pid.BEGIN_TEXT)).toBe('A.H.')
        expect(Factory.createItem(ElementType.RASGUEADO, score.dummySystem())!.getProperty(Pid.BEGIN_TEXT)).toBe('rasg')
        expect(Factory.createItem(ElementType.PICK_SCRAPE, score.dummySystem())!.getProperty(Pid.BEGIN_TEXT)).toBe('P.S.')
        const seg = score.firstMeasure()!.first()!
        const tf = Factory.createTripletFeel(seg, TripletFeelType.TRIPLET_8TH)
        expect(tf.xmlText()).toContain('<sym>staffPosLower3</sym><sym>textBlackNoteShortStem</sym>')
        expect(tf.swingParameters()).toEqual({ swingUnit: 240, swingRatio: 66 })
        expect(Factory.createItem(ElementType.DEAD_SLAPPED, null)).not.toBeNull()
    })
})
