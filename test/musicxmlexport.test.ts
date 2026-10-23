// SPDX-License-Identifier: GPL-3.0-only
// The MusicXML export against MuseScore's MusicXML export tests (MuseScore/src/importexport/musicxml/tests,
// musicxml_tests.cpp): the tests that read a MuseScore file (.mscx) and compare the export with a reference .xml
// (musicXmlMscxExportTestRef, musicXmlMscxExportTestRefBreaks, musicXmlMscxExportTestRefInvisibleElements). The tests
// that import MusicXML cannot run (there is no MusicXML import).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadScore, type MasterScore } from '../src/index'
import { MScore } from '../src/engraving/dom/mscore'
import { writeMusicXml, type MusicXmlExportOptions } from '../src/importexport/musicxml/api'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/importexport/musicxml/tests/data/`
const OUT = process.env.MUSICXML_TEST_OUT ?? ''

/** ScoreRW::readScore + fixupScore + doLayout */
function readScore(name: string): MasterScore {
    const score = loadScore(readFileSync(`${DATA}${name}`))
    score.connectTies()
    score.masterScore().rebuildMidiMapping()
    for (const s of score.scoreList()) {
        s.doLayout()
    }
    return score
}

/** saveCompareMusicXmlScore */
function saveCompare(score: MasterScore, saveName: string, ref: string, options: Partial<MusicXmlExportOptions>): void {
    const out = writeMusicXml(score, options)
    if (OUT) {
        writeFileSync(`${OUT}/${saveName}`, out)
    }
    expect(out).toBe(readFileSync(`${DATA}${ref}`, 'utf8'))
}

/** without the numbers that depend on the layout (position attributes are omitted when near 0; widths, distances) */
function maskLayout(s: string): string {
    return s
        .replace(/ (default-x|default-y|relative-x|relative-y|width|bezier-x|bezier-y)="[-0-9.e]+"/g, '')
        .replace(/<(left-margin|right-margin|system-distance|top-system-distance|staff-distance|measure-distance)>[-0-9.e]+</g, '<$1>#<')
}

/** musicXmlMscxExportTestRef */
function mscxExportTestRef(file: string, exportLayout = false): void {
    const score = readScore(`${file}.mscx`)
    saveCompare(score, `${file}.xml`, `${file}_ref.xml`,
        { exportBreaks: 'manual', exportLayout, exportInvisibleElements: true })
}

/** musicXmlMscxExportTestRefBreaks */
function mscxExportTestRefBreaks(file: string): void {
    const score = readScore(`${file}.mscx`)
    const options = { exportLayout: false, exportInvisibleElements: true } as const
    saveCompare(score, `${file}_no.xml`, `${file}_no_ref.xml`, { ...options, exportBreaks: 'no' })
    saveCompare(score, `${file}_manual.xml`, `${file}_manual_ref.xml`, { ...options, exportBreaks: 'manual' })
    saveCompare(score, `${file}_all.xml`, `${file}_all_ref.xml`, { ...options, exportBreaks: 'all' })
}

/** musicXmlMscxExportTestRefInvisibleElements */
function mscxExportTestRefInvisibleElements(file: string): void {
    const score = readScore(`${file}.mscx`)
    const options = { exportLayout: false, exportBreaks: 'manual' } as const
    saveCompare(score, `${file}_invisible.xml`, `${file}_invisible_ref.xml`, { ...options, exportInvisibleElements: true })
    saveCompare(score, `${file}_noinvisible.xml`, `${file}_noinvisible_ref.xml`, { ...options, exportInvisibleElements: false })
}

describe.skipIf(!existsSync(DATA))('MusicXML export (MuseScore musicxml tests)', () => {
    beforeAll(async () => {
        await initFonts()
        MScore.debugMode = true
        MScore.testMode = true
    })
    afterAll(() => {
        MScore.debugMode = false
        MScore.testMode = false
    })

    it('breaksImplExpl', () => mscxExportTestRefBreaks('testBreaksImplExpl'))
    it('breaksMMRest', () => mscxExportTestRefBreaks('testBreaksMMRest'))
    it('breaksPage', () => mscxExportTestRefBreaks('testBreaksPage'))
    it('breaksSystem', () => mscxExportTestRefBreaks('testBreaksSystem'))
    it('chordSymbols', () => mscxExportTestRef('testChordSymbols'))
    it('colorExport', () => mscxExportTestRef('testColorExport'))
    it('cueNotes2', () => mscxExportTestRef('testCueNotes2'))
    it('displayStepOctave', () => mscxExportTestRef('testDisplayStepOctave'))
    it('excludeInvisibleElements', () => mscxExportTestRefInvisibleElements('testExcludeInvisibleElements'))
    // TODO(port): TremoloBar is not ported (no <bend> with <with-bar> for tremolo bars)
    it.skip('guitarBends', () => mscxExportTestRef('testGuitarBends'))
    it('harpPedals', () => mscxExportTestRef('testHarpPedals'))
    it('hairpinDynamics', () => mscxExportTestRef('testHairpinDynamics'))
    it('harmony6', () => mscxExportTestRef('testHarmony6'))
    it('harmony7', () => mscxExportTestRef('testHarmony7'))
    it('localTimesig1', () => mscxExportTestRef('testLocalTimesig1'))
    it('localTimesig2', () => mscxExportTestRef('testLocalTimesig2'))
    it('localTimesig3', () => mscxExportTestRef('testLocalTimesig3'))
    it('localTimesig4', () => mscxExportTestRef('testLocalTimesig4'))
    it('localTimesig5', () => mscxExportTestRef('testLocalTimesig5'))
    it('localTimesig6', () => mscxExportTestRef('testLocalTimesig6'))
    it('localTimesig8', () => mscxExportTestRef('testLocalTimesig8'))
    it('localTimesig9', () => mscxExportTestRef('testLocalTimesig9'))
    it('localTimesig10', () => mscxExportTestRef('testLocalTimesig10'))
    it('localTimesig11', () => mscxExportTestRef('testLocalTimesig11'))
    it('localTimesig12', () => mscxExportTestRef('testLocalTimesig12'))
    it('localTimesig14', () => mscxExportTestRef('testLocalTimesig14'))
    it('instrumentChangeMIDIportExport', () => mscxExportTestRef('testInstrumentChangeMIDIportExport'))
    it('invalidLayout', () => mscxExportTestRef('testInvalidLayout'))
    it('invisibleNote', () => mscxExportTestRef('testInvisibleNote'))
    it('maxNumberLevel', () => mscxExportTestRef('testMaxNumberLevel'))
    it('midiPortExport', () => mscxExportTestRef('testMidiPortExport'))
    it('multiInstrumentPart3', () => mscxExportTestRef('testMultiInstrumentPart3'))
    it('negativeOctave', () => mscxExportTestRef('testNegativeOctave'))
    it('noteheads2', () => mscxExportTestRef('testNoteheads2'))
    it('pageNumbers1', () => mscxExportTestRefBreaks('testPageNumbers1'))
    it('pageNumbers2', () => mscxExportTestRefBreaks('testPageNumbers2'))
    it('pageNumbers3', () => mscxExportTestRefBreaks('testPageNumbers3'))
    it('pageNumbers4', () => mscxExportTestRefBreaks('testPageNumbers4'))
    it('pageNumbers5', () => mscxExportTestRefBreaks('testPageNumbers5'))
    it('stackedHarm', () => mscxExportTestRef('testStackedHarm'))
    // DISABLED_EXCEPT_ON_LINUX in MuseScore (the layout depends on the font metrics): compared without the layout values
    it('systemDistance', () => {
        const file = 'testSystemDistance'
        const out = writeMusicXml(readScore(`${file}.mscx`), { exportBreaks: 'manual', exportLayout: true, exportInvisibleElements: true })
        expect(maskLayout(out)).toBe(maskLayout(readFileSync(`${DATA}${file}_ref.xml`, 'utf8')))
    })
    it('tablature6', () => mscxExportTestRef('testTabs'))
    it('tboxAboveBelow1', () => mscxExportTestRef('testTboxAboveBelow1'))
    it('tboxAboveBelow2', () => mscxExportTestRef('testTboxAboveBelow2'))
    it('tboxAboveBelow3', () => mscxExportTestRef('testTboxAboveBelow3'))
    it('tboxMultiPage1', () => mscxExportTestRef('testTboxMultiPage1'))
    it('tboxVbox1', () => mscxExportTestRef('testTboxVbox1'))
    it('tboxWords1', () => mscxExportTestRef('testTboxWords1'))
    it('tempoPrecision', () => mscxExportTestRef('testTempoPrecision'))
    it('textLines', () => mscxExportTestRef('testTextLines'))
    it('timesig5', () => mscxExportTestRef('testTimesig5'))
    it('timeTickExport', () => mscxExportTestRef('testTimeTickExport'))
    it('trills', () => mscxExportTestRef('testTrills'))
    it('tuplets8', () => mscxExportTestRef('testTuplets8'))
    it('wedgeCR', () => mscxExportTestRef('testWedgeCR'))
    it('wedge4', () => mscxExportTestRef('testWedge4'))
})
