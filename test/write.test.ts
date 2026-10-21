// SPDX-License-Identifier: GPL-3.0-only
// Writing scores (Writer / MscSaver): round trips, the text MuseScore writes, new scores written and read back.
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    createScore, defaultNewScoreOptions, drawPageSvg, layoutScore, loadScore, pageCount, saveMscz, writeMscx,
    type MasterScore,
} from '../src/index'
import { formatDouble } from '../src/framework/global/serialization/xmlstreamwriter'
import { EID } from '../src/engraving/infrastructure/eid'
import { TEST_FILES, VTEST, hasSubmodule, initFonts } from './helpers'

function pages(score: MasterScore): string[] {
    return Array.from({ length: pageCount(score) }, (_, i) => drawPageSvg(score, i))
}

function load(data: Uint8Array): MasterScore {
    const score = loadScore(data)
    layoutScore(score)
    return score
}

const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g

/** the pages differ at most by rounding of values written with 6 significant digits (see tools/roundtrip.ts) */
function expectEqualWithinRounding(a: string[], b: string[]): void {
    expect(b.length).toBe(a.length)
    for (let p = 0; p < a.length; ++p) {
        expect(b[p].replace(NUM, '#')).toBe(a[p].replace(NUM, '#'))
        const na = a[p].match(NUM)!.map(Number)
        const nb = b[p].match(NUM)!.map(Number)
        const maxDiff = Math.max(0, ...na.map((x, i) => Math.abs(x - nb[i])))
        expect(maxDiff).toBeLessThanOrEqual(0.05)
    }
}

/** EIDs of elements that had none in the input are random */
function normalize(mscx: string): string {
    return mscx.replace(/<eid>[^<]*<\/eid>/g, '<eid/>').replace(/<linkedTo>[^<]*<\/linkedTo>/g, '<linkedTo/>')
}

beforeAll(initFonts)

describe('number formatting', () => {
    it('writes doubles like TextStream (%g, 6 significant digits)', () => {
        expect(formatDouble(0.5)).toBe('0.5')
        expect(formatDouble(1.749781)).toBe('1.74978')
        expect(formatDouble(3.937006944)).toBe('3.93701')
        expect(formatDouble(-0.0)).toBe('-0')
        expect(formatDouble(1e-5)).toBe('1e-05')
        expect(formatDouble(1234567.5)).toBe('1.23457e+06')
        expect(formatDouble(100)).toBe('100')
    })

    it('encodes EIDs as MuseScore does', () => {
        const eid = EID.fromStdString('sGs54dI0KAL_LMrNHpjTf3D')
        expect(eid.isValid()).toBe(true)
        expect(eid.toStdString()).toBe('sGs54dI0KAL_LMrNHpjTf3D')
        expect(EID.fromStdString('644245094420').isValid()).toBe(false)
    })
})

describe.skipIf(!hasSubmodule)('round trip', () => {
    for (const file of [
        `${VTEST}/accidental-11.mscz`,
        `${VTEST}/beams-2.mscz`,
        `${VTEST}/slurs-1.mscx`,
        `${VTEST}/tablature-2.mscz`,
        `${VTEST}/lyrics-1.mscx`,
        `${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`,
    ]) {
        // MuseScore itself renders its re-save of the Chopin (2.x) differently: a styled VBox gap set by the 2.x reader
        // is not written (like in C++); only the second round trip is checked for it
        const sameAsOriginal = !file.includes('Chopin')
        it(file.replace(/.*\//, ''), () => {
            const original = load(readFileSync(file))
            const before = pages(original)
            const saved = saveMscz(original)
            const after = pages(load(saved))
            if (sameAsOriginal) {
                expectEqualWithinRounding(before, after)
            }
            // old scores: values stored with 6 significant digits may move things by rounding (see tools/roundtrip.ts);
            // a second round trip must give exactly the same pages
            const again = pages(load(saveMscz(load(saved))))
            expect(again).toEqual(after)
        }, 60000)
    }
})

describe.skipIf(!hasSubmodule)('textual comparison with MuseScore', () => {
    it('writes accidental-11 like MuseScore 4.7.5 (mscore -o out.mscx)', () => {
        const mscx = writeMscx(loadScore(readFileSync(`${VTEST}/accidental-11.mscz`)))
        const lines = mscx.split('\n')
        expect(lines.slice(0, 4)).toEqual([
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<museScore version="4.70">',
            '  <programVersion>4.7.5</programVersion>',
            '  <programRevision>3654226</programRevision>',
        ])
        // an excerpt of MuseScore's own re-save of this file
        expect(normalize(mscx)).toContain(`    <Part id="1">
      <Staff>
        <eid/>
        <StaffType group="pitched">
          <name>stdNormal</name>
          </StaffType>
        </Staff>
      <Staff>
        <eid/>
        <StaffType group="pitched">
          <name>stdNormal</name>
          </StaffType>
        <defaultClef>F</defaultClef>
        </Staff>
      <trackName>Piano</trackName>
      <Instrument id="piano">
        <shortName>Pno.</shortName>
        <trackName>Piano</trackName>
        <minPitchP>21</minPitchP>
        <maxPitchP>108</maxPitchP>
        <minPitchA>21</minPitchA>
        <maxPitchA>108</maxPitchA>
        <instrumentId>keyboard.piano</instrumentId>
        <Articulation>
          <velocity>100</velocity>
          <gateTime>70</gateTime>
          </Articulation>`)
        expect(normalize(mscx)).toContain(`          <Chord>
            <eid/>
            <durationType>half</durationType>
            <Note>
              <eid/>
              <Accidental>
                <bracket>1</bracket>
                <subtype>accidentalFlat</subtype>
                <eid/>
                </Accidental>
              <pitch>66</pitch>
              <tpc>8</tpc>
              </Note>`)
    })

    it('writes a complete .mscz container', () => {
        const zip = unzipSync(saveMscz(loadScore(readFileSync(`${VTEST}/accidental-11.mscz`)), 'accidental-11.mscz'))
        expect(Object.keys(zip)).toEqual(['score_style.mss', 'accidental-11.mscx', 'META-INF/container.xml'])
        expect(strFromU8(zip['META-INF/container.xml'])).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score_style.mss"/>
    <rootfile full-path="accidental-11.mscx"/>
    </rootfiles>
  </container>
`)
        const style = strFromU8(zip['score_style.mss'])
        expect(style).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<museScore version="4.70">\n  <Style>\n/)
        expect(style).toContain('    <spatium>1.74978</spatium>\n')
    })

    it('keeps the EIDs of the file', () => {
        const file = `${VTEST}/accidental-11.mscz`
        const once = writeMscx(loadScore(readFileSync(file)))
        const twice = writeMscx(loadScore(new TextEncoder().encode(once)))
        expect(twice).toBe(once)
    })
})

describe('new scores', () => {
    it('writes a created score and reads it back', () => {
        const score = createScore({
            ...defaultNewScoreOptions(),
            title: 'Round trip',
            composer: 'Nobody',
            instruments: [{ id: 'flute' }, { id: 'piano' }],
            order: 'orchestra',
            measures: 8,
        })
        layoutScore(score)
        const before = pages(score)
        const mscx = writeMscx(score)
        expect(mscx).toContain('<metaTag name="workTitle">Round trip</metaTag>')
        expect(mscx).toContain('<Order id="orchestra">')
        expect(mscx).toContain('<Instrument id="flute">')
        expect(mscx).toContain('<Instrument id="piano">')
        const reloaded = load(saveMscz(score))
        expect(reloaded.parts().map(p => p.instrument().id())).toEqual(['flute', 'piano'])
        expect(reloaded.nstaves()).toBe(3)
        expect(reloaded.metaTag('composer')).toBe('Nobody')
        expectEqualWithinRounding(before, pages(reloaded))
        // the reloaded score writes the same text again (loading adds the empty cloud meta tags, like NotationProject)
        const cloudTags = /\n *<metaTag name="(audioComUrl|source|sourceRevisionId)"><\/metaTag>/g
        expect(writeMscx(reloaded).replace(cloudTags, '')).toBe(mscx.replace(cloudTags, ''))
    })
})
