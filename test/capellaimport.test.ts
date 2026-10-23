// SPDX-License-Identifier: GPL-3.0-only
// The Capella import (src/importexport/capella): MuseScore's src/importexport/capella/tests/capella_tests.cpp. Every
// .cap/.capx file of capella/tests/data is imported, laid out and written with writeMscx, which is compared with the
// reference file *-ref.mscx. The references are written in MuseScore's test mode, so its additions are normalized:
// the <Style> block (compared with score.style().save(xml, true)), the beam positions <l1>/<l2> of the layout
// (compared with the beams of the port's layout), deterministic EIDs and the indentation of the closing tags. The
// malformed files must be rejected without exceptions; importScore() must import both formats.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { importScore, layoutScore, writeMscx, type MasterScore } from '../src/index'
import { MasterScore as MasterScoreClass } from '../src/engraving/dom/masterscore'
import { DefaultStyle } from '../src/engraving/style/defaultstyle'
import { XmlWriter } from '../src/engraving/rw/xmlwriter'
import type { Beam } from '../src/engraving/dom/beam'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import { SegmentType } from '../src/engraving/dom/segment'
import { VOICES } from '../src/engraving/types/types'
import {
    Capella, CapellaError, CapellaErrorCode, convertCapella, importCapella,
} from '../src/importexport/capella/internal/capella'
import { importCapXml } from '../src/importexport/capella/internal/capxml'
import { NotationReadError } from '../src/project/inotationreader'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/importexport/capella/tests/data/`
const hasData = existsSync(DATA)

/** C++ ScoreRW::readScore with the import function: a master score with the base style, laid out */
function readScore(file: string): MasterScore {
    const score = new MasterScoreClass()
    score.setStyle(DefaultStyle.baseStyle().clone())
    const data = readFileSync(`${DATA}${file}`)
    if (file.endsWith('.capx')) {
        importCapXml(score, data, file)
    } else {
        importCapella(score, data)
    }
    score.setMetaTag('originalFormat', file.endsWith('.capx') ? 'capx' : 'cap')
    layoutScore(score)
    return score
}

/** the beam positions of the layout, in the order of the .mscx file (C++ test mode: <l1>/<l2> of every fragment) */
function beamPositions(score: MasterScore): number[][] {
    const res: number[][] = []
    for (let staffIdx = 0; staffIdx < score.nstaves(); ++staffIdx) {
        for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
            for (let track = staffIdx * VOICES; track < (staffIdx + 1) * VOICES; ++track) {
                for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                    const cr = s.element(track) as ChordRest | null
                    const beam = cr?.beam() as Beam | null | undefined
                    if (!cr || !beam || beam.elements()[0] !== cr) {
                        continue
                    }
                    const idx = beam.directionIdx()
                    const spatium8 = beam.spatium() * 0.125
                    for (const f of beam.beamFragments()) {
                        res.push([Math.round(f.py1[idx] / spatium8), Math.round(f.py2[idx] / spatium8)])
                    }
                }
            }
        }
    }
    return res
}

interface Normalized { lines: string[]; style: string[]; beams: number[][] }

/** the lines of an .mscx file without the additions and omissions of MuseScore's test mode */
function normalize(mscx: string): Normalized {
    const style: string[] = []
    const beams: number[][] = []
    const lines: string[] = []
    let inStyle = false
    let beam: string[] | null = null
    for (const raw of mscx.split('\n')) {
        const l = raw.trim()
            .replace(/<eid>[^<]*<\/eid>/, '<eid/>')
            .replace(/<linkedTo>[^<]*<\/linkedTo>/, '<linkedTo/>')
        if (l === '<Style>') {
            inStyle = true
            continue
        }
        if (inStyle) {
            if (l === '</Style>') {
                inStyle = false
            } else {
                style.push(l)
            }
            continue
        }
        if (/^<(programVersion|programRevision)>|^<metaTag name="(creationDate|platform)">|^<synti>Fluid<\/synti>$/.test(l)) {
            continue
        }
        if (l === '<Beam>') {
            beam = [l]
            continue
        }
        if (beam) {
            const lm = /^<(l1|l2)>(-?\d+)<\/\1>$/.exec(l)
            if (lm) {
                if (lm[1] === 'l1') {
                    beams.push([parseInt(lm[2], 10)])
                } else {
                    beams[beams.length - 1].push(parseInt(lm[2], 10))
                }
                continue
            }
            beam.push(l)
            if (l === '</Beam>') {
                // a beam with only test mode data is not written outside of the test mode
                if (beam.length > 3) {
                    lines.push(...beam)
                }
                beam = null
            }
            continue
        }
        lines.push(l)
    }
    return { lines, style, beams }
}

function styleLines(score: MasterScore): string[] {
    const xml = new XmlWriter()
    score.style().save(xml, true)
    xml.flush()
    return normalize(`<x>\n${xml.text()}\n</x>`).style
}

function compareWithReference(file: string): void {
    const score = readScore(file)
    const ref = normalize(readFileSync(`${DATA}${file}-ref.mscx`, 'utf8'))
    const out = normalize(writeMscx(score))
    expect(out.lines.join('\n')).toBe(ref.lines.join('\n'))
    expect(styleLines(score)).toEqual(ref.style)
    expect(beamPositions(score)).toEqual(ref.beams)
}

/** Capella_Tests::capReadError: the error a file is rejected with (C++ Capella::read + convertCapella) */
function capReadError(file: string): CapellaErrorCode {
    const score = new MasterScoreClass()
    score.setStyle(DefaultStyle.baseStyle().clone())
    const cf = new Capella()
    try {
        cf.readFile(readFileSync(`${DATA}${file}.cap`))
        convertCapella(score, cf, false)
    } catch (e) {
        if (e instanceof CapellaError) {
            return e.errNo
        }
        throw e
    }
    return CapellaErrorCode.CAP_NO_ERROR
}

/** Capella_Tests::capImport: the public entry point must not throw (it reports the error itself) */
function capImport(file: string): string | null {
    const score = new MasterScoreClass()
    score.setStyle(DefaultStyle.baseStyle().clone())
    let error: string | null = null
    importCapella(score, readFileSync(`${DATA}${file}.cap`), (m) => { error = m })
    return error
}

const CAP_TESTS = ['test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8', 'testTuplet2']
const CAPX_TESTS = ['test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'testEmptyStaff1', 'testEmptyStaff2',
    'testPianoG4G5', 'testScaleC4C5', 'testSlurTie', 'testText1', 'testTuplet1', 'testTuplet2', 'testTuplet3',
    'testVolta1', 'testBarline']

describe.skipIf(!hasData)('Capella import (MuseScore capella tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    for (const name of CAP_TESTS) {
        it(`capTest ${name}`, () => {
            compareWithReference(`${name}.cap`)
        })
    }

    for (const name of CAPX_TESTS) {
        it(`capxTest ${name}`, () => {
            compareWithReference(`${name}.capx`)
        })
    }

    // malformed files: documented byte patches of the valid files above that drive the importer into a bounds check
    it('capCorruptStringLength', () => {
        expect(capReadError('test1-corrupt-string-length')).toBe(CapellaErrorCode.BAD_FORMAT)
        expect(capImport('test1-corrupt-string-length')).toBe('Import failed: bad file content')
    })

    it('capCorruptTextSize', () => {
        expect(capReadError('test1-corrupt-text-size')).toBe(CapellaErrorCode.BAD_FORMAT)
        expect(capImport('test1-corrupt-text-size')).toBe('Import failed: bad file content')
    })

    it('capCorruptMetafileSize', () => {
        expect(capReadError('test1-corrupt-metafile-size')).toBe(CapellaErrorCode.BAD_FORMAT)
        expect(capImport('test1-corrupt-metafile-size')).toBe('Import failed: bad file content')
    })

    it('capCorruptKeySignature', () => {
        expect(capReadError('test7-corrupt-key')).toBe(CapellaErrorCode.CAP_NO_ERROR)
        expect(capImport('test7-corrupt-key')).toBeNull()
    })

    it('capCorruptStaveIndex', () => {
        expect(capReadError('test1-corrupt-stave-index')).toBe(CapellaErrorCode.BAD_FORMAT)
        expect(capImport('test1-corrupt-stave-index')).toBe('Import failed: bad file content')
    })

    it('capExtraStaff', () => {
        expect(capReadError('test1-extra-staff')).toBe(CapellaErrorCode.BAD_FORMAT)
        expect(capImport('test1-extra-staff')).toBe('Import failed: bad file content')
    })

    it('importScore reads .cap and .capx files and rejects malformed ones', async () => {
        for (const file of ['test2.cap', 'testVolta1.capx']) {
            const score = await importScore(readFileSync(`${DATA}${file}`), file)
            expect(score.nstaves()).toBeGreaterThan(0)
            expect(score.metaTag('originalFormat')).toBe(file.split('.')[1])
            layoutScore(score)
            expect(score.npages()).toBeGreaterThan(0)
        }
        await expect(importScore(readFileSync(`${DATA}test1-corrupt-text-size.cap`), 'x.cap')).rejects.toThrow(NotationReadError)
        await expect(importScore(new Uint8Array([1, 2, 3]), 'x.capx')).rejects.toThrow(NotationReadError)
    })
})
