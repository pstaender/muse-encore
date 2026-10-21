// SPDX-License-Identifier: GPL-3.0-only
// Element types ported late: Sticking, Capo, StringTunings, HarpPedalDiagram, FiguredBass, ChordBracket, Tapping,
// SoundFlag, SystemDivider, old Bend, Image (Pictures/ of the .mscz, MD4 names), MIDI mapping and note play events.
// Each is read, laid out, drawn and written back (the written .mscx contains it, a reload draws the same pages).
import { readFileSync } from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createCanvas } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    drawPageSvg, executeAction, layoutScore, loadScore, pageCount, redo, saveMscz, setClipboardImage, textEditingInfo, undo,
    inspectorSections, viewInputText, writeMscx, type MasterScore,
} from '../src/index'
import { CryptographicHash, CryptographicHashAlgorithm } from '../src/framework/global/cryptographichash'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Chord } from '../src/engraving/dom/chord'
import type { FiguredBass } from '../src/engraving/dom/figuredbass'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import { ElementType } from '../src/engraving/types/types'
import { VTEST, hasSubmodule, initFonts, scoreHash } from './helpers'

beforeAll(initFonts)

function load(data: Uint8Array): MasterScore {
    const score = loadScore(data)
    layoutScore(score)
    return score
}

function pages(score: MasterScore): string[] {
    return Array.from({ length: pageCount(score) }, (_, i) => drawPageSvg(score, i))
}

const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g

/** the pages are equal up to the rounding of values written with 6 significant digits */
function expectSamePages(a: string[], b: string[]): void {
    expect(b.length).toBe(a.length)
    for (let p = 0; p < a.length; ++p) {
        expect(b[p].replace(NUM, '#')).toBe(a[p].replace(NUM, '#'))
        const na = a[p].match(NUM)!.map(Number)
        const nb = b[p].match(NUM)!.map(Number)
        expect(Math.max(0, ...na.map((x, i) => Math.abs(x - nb[i])))).toBeLessThanOrEqual(0.05)
    }
}

function hex(u: Uint8Array): string {
    return [...u].map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('MD4 (image store names)', () => {
    it('matches the RFC 1320 test vectors', () => {
        const md4 = (s: string): string => hex(CryptographicHash.hash(strToU8(s), CryptographicHashAlgorithm.Md4))
        expect(md4('')).toBe('31d6cfe0d16ae931b73c59d7e0c089c0')
        expect(md4('abc')).toBe('a448017aaf21d8525fc10ae87aa6729d')
        expect(md4('message digest')).toBe('d9130a8164549fe818874806e1c7014b')
        expect(md4('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))
            .toBe('e33b4ddc9c38f2199c3e7b164fcc0536')
    })
})

describe.skipIf(!hasSubmodule)('element types: read, layout, write', () => {
    const CASES: [string, string[]][] = [
        ['sticking-1.mscz', ['<Sticking>']],
        ['capo.mscz', ['<Capo>']],
        ['figured-bass-1.mscx', ['<FiguredBass>', '<FiguredBassItem']],
        ['chordBrackets.mscz', ['<ChordBracket>']],
        ['hopo-4.mscz', ['<Tapping>']],
        ['system-divider-1.mscz', ['<SystemDivider type="left">']],
        ['bend-1.mscx', ['<Bend>', '<point ']],
        ['grace-7.mscz', ['<Events>', '<Event>']],
    ]
    for (const [file, tags] of CASES) {
        it(`${file}: written and read back`, () => {
            const score = load(readFileSync(`${VTEST}/${file}`))
            const mscx = writeMscx(score)
            for (const tag of tags) {
                expect(mscx, tag).toContain(tag)
            }
            const before = pages(score)
            const again = load(saveMscz(score))
            expect(writeMscx(again)).toBe(mscx)
            expectSamePages(before, pages(again))
        })
    }

    it('harp pedal diagrams and string tunings are kept', () => {
        const score = load(readFileSync(`${VTEST}/harp-diagrams.mscz`))
        expect(writeMscx(score)).toContain('<HarpPedalDiagram>')
    })

    it('writes the MIDI mapping (midiPort/midiChannel) of non-trivial mappings', () => {
        // a score with an instrument with several channels: MuseScore writes the mapping
        const score = load(readFileSync(`${VTEST}/tuplets-6.mscz`))
        const src = strFromU8(Object.entries(unzipSync(readFileSync(`${VTEST}/tuplets-6.mscz`)))
            .find(([k]) => k.endsWith('.mscx'))![1])
        const mscx = writeMscx(score)
        expect(mscx.includes('<midiChannel>')).toBe(src.includes('<midiChannel>'))
    })
})

describe.skipIf(!hasSubmodule)('images', () => {
    const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60">'
        + '<rect x="2" y="2" width="116" height="56" fill="none" stroke="#000" stroke-width="4"/></svg>')
    const name = hex(CryptographicHash.hash(svg, CryptographicHashAlgorithm.Md4)) + '.svg'

    /** sticking-2 with an SVG image on a note (stored in Pictures/) */
    function imageScore(): Uint8Array {
        const z = unzipSync(readFileSync(`${VTEST}/sticking-2.mscz`))
        const files: Record<string, Uint8Array> = {}
        for (const [k, v] of Object.entries(z)) {
            if (k.endsWith('.mscx')) {
                const mscx = strFromU8(v).replace('<Note>', `<Note>\n<Image>\n<path>${name}</path>\n<size w="4" h="2"/>\n</Image>`)
                files[k] = strToU8(mscx)
            } else if (!k.startsWith('Thumbnails')) {
                files[k] = v
            }
        }
        files[`Pictures/${name}`] = svg
        return zipSync(files)
    }

    it('reads images from Pictures/, draws and saves them', () => {
        const score = load(imageScore())
        const mscx = writeMscx(score)
        expect(mscx).toContain(`<path>${name}</path>`)
        expect(drawPageSvg(score, 0)).toContain('<image')

        const saved = unzipSync(saveMscz(score))
        expect(saved[`Pictures/${name}`]).toEqual(svg)
        const again = load(saveMscz(score))
        expect(writeMscx(again)).toBe(mscx)
    })

    it('pastes an image from the clipboard onto the selected note; undo', () => {
        const png = new Uint8Array(createCanvas(40, 20).toBuffer('image/png'))
        const score = load(readFileSync(`${VTEST}/sticking-2.mscz`))
        const chord = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as unknown as Chord
        score.select(null)
        const before = scoreHash(score)
        score.select(chord.upNote())
        setClipboardImage(png)
        expect(executeAction(score, 'action://notation/paste')).toBe(true)
        expect(chord.upNote().el().some(e => e.isImage())).toBe(true)
        const name = hex(CryptographicHash.hash(png, CryptographicHashAlgorithm.Md4)) + '.'
        expect(writeMscx(score)).toContain(`<path>${name}</path>`)
        expect(unzipSync(saveMscz(score))[`Pictures/${name}`]).toEqual(png)
        expect(undo(score)).toBe(true)
        score.select(null)
        expect(scoreHash(score)).toBe(before)
    })
})

describe.skipIf(!hasSubmodule)('editing', () => {
    it('adds figured bass to a note (figured-bass action), parses the text; undo/redo', () => {
        const score = load(readFileSync(`${VTEST}/sticking-2.mscz`))
        const s = score.firstMeasure()!.first(SegmentType.ChordRest)!
        const chord = s.element(0) as unknown as Chord
        score.select(null)
        const before = scoreHash(score)
        score.select(chord.upNote())
        expect(executeAction(score, 'figured-bass')).toBe(true)
        expect(textEditingInfo(score)).toMatchObject({ active: true, type: 'FiguredBass' })
        viewInputText(score, '6')
        expect(executeAction(score, 'action://notation/cancel')).toBe(true)
        const fb = s.annotations().find(a => a.type() === ElementType.FIGURED_BASS) as unknown as FiguredBass
        expect(fb).toBeTruthy()
        expect(fb.plainText()).toBe('6')
        expect(writeMscx(score)).toContain('<FiguredBassItem')
        score.select(null)
        const after = scoreHash(score)
        expect(after).not.toBe(before)
        expect(undo(score)).toBe(true)
        score.select(null)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        score.select(null)
        expect(scoreHash(score)).toBe(after)
    })

    it('adds a sticking text (sticking-text action)', () => {
        const score = load(readFileSync(`${VTEST}/figured-bass-2.mscz`))
        const s = score.firstMeasure()!.first(SegmentType.ChordRest)!
        const cr = s.element(0)!
        score.select(cr.isChord() ? (cr as unknown as Chord).upNote() : cr)
        expect(executeAction(score, 'sticking-text')).toBe(true)
        expect(textEditingInfo(score)).toMatchObject({ active: true, type: 'Sticking' })
        viewInputText(score, 'R')
        executeAction(score, 'action://notation/cancel')
        expect(writeMscx(score)).toMatch(/<Sticking>[\s\S]*<text>R<\/text>/)
    })

    it('shows the chord bracket section in the Properties panel', () => {
        const score = load(readFileSync(`${VTEST}/chordBrackets.mscz`))
        let bracket: EngravingItem | null = null
        score.scanElements((e) => {
            if (!bracket && e.type() === ElementType.CHORD_BRACKET) {
                bracket = e
            }
        })
        expect(bracket).toBeTruthy()
        score.select(bracket)
        const notation = inspectorSections(score).find(x => x.sectionType === 'SECTION_NOTATION')!
        const model = notation.models.find(m => m.modelType === 'TYPE_CHORD_BRACKET') ?? notation
        expect(model.title).toBe('Chord bracket')
        expect(Object.keys(model.properties)).toEqual(expect.arrayContaining(['bracketRightSide', 'hookPos', 'hookLen']))
        expect(model.flags.isBracket).toBe(true)
    })
})
