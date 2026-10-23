// SPDX-License-Identifier: GPL-3.0-only
// The Guitar Pro / Power Tab import against MuseScore's tests (MuseScore/src/importexport/guitarpro/tests:
// guitarpro_tests.cpp, guitarbendimporter_tests.cpp): the files of data/ and guitarbendimporter_data/ are imported with
// importGTP, laid out and written like MuseScore's test mode, and compared with the reference .mscx files (without the
// EIDs). The malformed-input tests check the importer's result and element counts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../src/index'
import type { MasterScore } from '../src/index'
import { MasterScore as MasterScoreClass } from '../src/engraving/dom/masterscore'
import { MScore } from '../src/engraving/dom/mscore'
import { Writer } from '../src/engraving/rw/write/writer'
import { DefaultStyle } from '../src/engraving/style/defaultstyle'
import { ElementType } from '../src/engraving/types/types'
import { Err, importGTP } from '../src/importexport/guitarpro/internal/importgtpmain'
import type { Chord } from '../src/engraving/dom/chord'
import type { Score } from '../src/engraving/dom/score'
import { ROOT, initFonts } from './helpers'

const TESTS = `${ROOT}MuseScore/src/importexport/guitarpro/tests/`
const DATA = `${TESTS}data/`
const BEND_DATA = `${TESTS}guitarbendimporter_data/`
const OUT = process.env.GUITARPRO_TEST_OUT ?? ''

/**
 * the written score without what MuseScore's test mode writes differently (the style, the program version, <synti>,
 * the beam positions l1/l2 of the layout (and beams with only these), the creation date/platform meta tags) and without the EIDs and the
 * references of linked elements
 */
function normalize(mscx: string): string {
    return mscx.replace(/\n *<Style>[\s\S]*?<\/Style>/g, '')
        .split('\n')
        .filter(l => !/^\s*<(eid|programVersion|programRevision|synti|l1|l2)\b/.test(l))
        .filter(l => !/^\s*<metaTag name="(creationDate|platform)">/.test(l))
        .map(l => l.replace(/<linkedTo>.*<\/linkedTo>/, '<linkedTo/>'))
        .join('\n')
        .replace(/\n *<Beam>\n *<\/Beam>/g, '') // a beam with only the layout's positions
}

/** compat::ScoreAccess::createMasterScoreWithBaseStyle */
function createMasterScoreWithBaseStyle(): MasterScore {
    const score = new MasterScoreClass()
    score.setStyle(DefaultStyle.baseStyle().clone())
    return score
}

/** ScoreRW::readScore with the import function: the import, then every score is laid out */
function readScore(file: string, experimental: boolean): MasterScore {
    const score = createMasterScoreWithBaseStyle()
    const err = importGTP(score, readFileSync(file), experimental)
    expect(err).toBe(Err.NoError)
    for (const s of score.scoreList()) {
        s.doLayout()
    }
    score.setPlaylistDirty()
    return score
}

/** ScoreComp::saveCompareScore */
function saveCompareScore(score: MasterScore, saveName: string, ref: string): void {
    const out = Writer.writeScore(score)
    if (OUT) {
        writeFileSync(`${OUT}/${saveName}`, out)
    }
    expect(normalize(out)).toBe(normalize(readFileSync(ref, 'utf8')))
}

function gpReadTest(file: string, ext: string): void {
    const fileName = `${file}.${ext}`
    const score = readScore(`${DATA}${fileName}`, false)
    saveCompareScore(score, `${fileName}.mscx`, `${DATA}${fileName}-ref.mscx`)
}

function gpBendReadTest(file: string, ext: string): void {
    const score = readScore(`${BEND_DATA}${file}.${ext}`, true)
    saveCompareScore(score, `guitarbend-${file}-${ext}.mscx`, `${BEND_DATA}${file}-${ext}.mscx`)
}

/** GuitarPro_Tests::gpRead: the import without a layout; null if it failed */
function gpRead(file: string, ext: string): { score: MasterScore | null; err: Err } {
    const score = createMasterScoreWithBaseStyle()
    const err = importGTP(score, readFileSync(`${DATA}${file}.${ext}`))
    return { score: err === Err.NoError ? score : null, err }
}

/** the number of elements of the type across all tracks (notes are counted in their chords) */
function collect(score: Score, type: ElementType): number {
    let count = 0
    for (let measure = score.firstMeasure(); measure; measure = measure.nextMeasure()) {
        for (let segment = measure.first(); segment; segment = segment.next()) {
            for (const annotation of segment.annotations()) {
                if (annotation.type() === type) {
                    ++count
                }
            }
            for (const item of segment.elist()) {
                if (!item) {
                    continue
                }
                if (item.type() === type) {
                    ++count
                }
                if (item.isChord() && type === ElementType.NOTE) {
                    const chord = item as Chord
                    count += chord.notes().length
                    for (const grace of chord.graceNotes()) {
                        count += grace.notes().length
                    }
                }
            }
        }
    }
    return count
}

describe.skipIf(!existsSync(DATA))('Guitar Pro import (guitarpro_tests.cpp)', () => {
    beforeAll(async () => {
        await initFonts()
        MScore.testMode = true
    })
    afterAll(() => {
        MScore.testMode = false
    })

    it('gpSforzato', () => gpReadTest('sforzato', 'gp'))
    it('gpxSforzato', () => gpReadTest('sforzato', 'gpx'))
    it('gp4Sforzato', () => gpReadTest('sforzato', 'gp4'))
    it('gpHeavyAccent', () => gpReadTest('heavy-accent', 'gp'))
    it('gpxHeavyAccent', () => gpReadTest('heavy-accent', 'gpx'))
    it('gp5HeavyAccent', () => gpReadTest('heavy-accent', 'gp5'))
    it('gpTremolos', () => gpReadTest('tremolos', 'gp'))
    it('gpxTremolos', () => gpReadTest('tremolos', 'gpx'))
    it('gp5Tremolos', () => gpReadTest('tremolos', 'gp5'))
    it('gpTrill', () => gpReadTest('trill', 'gp'))
    it('gpxTrill', () => gpReadTest('trill', 'gpx'))
    it('gp4Trill', () => gpReadTest('trill', 'gp4'))
    it('gpChordWithTiedHarmonics', () => gpReadTest('chord_with_tied_harmonics', 'gp'))
    it('gp5ChordWithTiedHarmonics', () => gpReadTest('chord_with_tied_harmonics', 'gp5'))
    it('gpDynamic', () => gpReadTest('dynamic', 'gp'))
    it('gpxDynamic', () => gpReadTest('dynamic', 'gpx'))
    it('gp5Dynamic', () => gpReadTest('dynamic', 'gp5'))
    it('gpGraceNote', () => gpReadTest('grace', 'gp'))
    it('gpxGraceNote', () => gpReadTest('grace', 'gpx'))
    it('gp5GraceNote', () => gpReadTest('grace', 'gp5'))
    it('gpVolta', () => gpReadTest('volta', 'gp'))
    it('gpxVolta', () => gpReadTest('volta', 'gpx'))
    it('gp5Volta', () => gpReadTest('volta', 'gp5'))
    it('gp4Volta', () => gpReadTest('volta', 'gp4'))
    it('gp3Volta', () => gpReadTest('volta', 'gp3'))
    it('gpcopyright', () => gpReadTest('copyright', 'gp'))
    it('gpxcopyright', () => gpReadTest('copyright', 'gpx'))
    it('gp5copyright', () => gpReadTest('copyright', 'gp5'))
    it('gp4copyright', () => gpReadTest('copyright', 'gp4'))
    it('gp3copyright', () => gpReadTest('copyright', 'gp3'))
    it('gpTempo', () => gpReadTest('tempo', 'gp'))
    it('gpxTempo', () => gpReadTest('tempo', 'gpx'))
    it('gp5Tempo', () => gpReadTest('tempo', 'gp5'))
    it('gp4Tempo', () => gpReadTest('tempo', 'gp4'))
    it('gp3Tempo', () => gpReadTest('tempo', 'gp3'))
    it('gpBasicBend', () => gpReadTest('basic-bend', 'gp'))
    it('gpxBasicBend', () => gpReadTest('basic-bend', 'gpx'))
    it('gp5BasicBend', () => gpReadTest('basic-bend', 'gp5'))
    it('gpBend', () => gpReadTest('bend', 'gp'))
    it('gpxBend', () => gpReadTest('bend', 'gpx'))
    it('gp5Bend', () => gpReadTest('bend', 'gp5'))
    it('gp4Bend', () => gpReadTest('bend', 'gp4'))
    it('gp3Bend', () => gpReadTest('bend', 'gp3'))
    it('gpBendAndHarmonic', () => gpReadTest('bend_and_harmonic', 'gp'))
    it('gp5BendAndHarmonic', () => gpReadTest('bend_and_harmonic', 'gp5'))
    it('gpKeysig', () => gpReadTest('keysig', 'gp'))
    it('gpxKeysig', () => gpReadTest('keysig', 'gpx'))
    it('gp5Keysig', () => gpReadTest('keysig', 'gp5'))
    it('gp4Keysig', () => gpReadTest('keysig', 'gp4'))
    it('gpDottedTuplets', () => gpReadTest('dotted-tuplets', 'gp'))
    it('gpxDottedTuplets', () => gpReadTest('dotted-tuplets', 'gpx'))
    it('gp5DottedTuplets', () => gpReadTest('dotted-tuplets', 'gp5'))
    it('gpTupletSlur', () => gpReadTest('tuplet-with-slur', 'gp'))
    it('gpxTupletSlur', () => gpReadTest('tuplet-with-slur', 'gpx'))
    it('gp4TupletSlur', () => gpReadTest('tuplet-with-slur', 'gp4'))
    it('gpBeamsStemsLL', () => gpReadTest('beams-stems-ledger-lines', 'gp'))
    it('gpxBeamsStemsLL', () => gpReadTest('beams-stems-ledger-lines', 'gpx'))
    it('gp5BeamsStemsLL', () => gpReadTest('beams-stems-ledger-lines', 'gp5'))
    it('gpFretDiagram_2Instr', () => gpReadTest('fret-diagram_2instruments', 'gp'))
    it('gpxFretDiagram_2Instr', () => gpReadTest('fret-diagram_2instruments', 'gpx'))
    it('gpFretDiagram', () => gpReadTest('fret-diagram', 'gp'))
    it('gpxFretDiagram', () => gpReadTest('fret-diagram', 'gpx'))
    it('gp5FretDiagram', () => gpReadTest('fret-diagram', 'gp5'))
    it('gp4FretDiagram', () => gpReadTest('fret-diagram', 'gp4'))
    it('gpFadeIn', () => gpReadTest('fade-in', 'gp'))
    it('gpxFadeIn', () => gpReadTest('fade-in', 'gpx'))
    it('gp5FadeIn', () => gpReadTest('fade-in', 'gp5'))
    it('gp4FadeIn', () => gpReadTest('fade-in', 'gp4'))
    it('gpSlurNoteMask', () => gpReadTest('slur-notes-effect-mask', 'gp'))
    it('gpxSlurNoteMask', () => gpReadTest('slur-notes-effect-mask', 'gpx'))
    it('gp5SlurNoteMask', () => gpReadTest('slur-notes-effect-mask', 'gp5'))
    it('gpCentered', () => gpReadTest('rest-centered', 'gp'))
    it('gpxCentered', () => gpReadTest('rest-centered', 'gpx'))
    it('gp5Centered', () => gpReadTest('rest-centered', 'gp5'))
    it('gp4Centered', () => gpReadTest('rest-centered', 'gp4'))
    it('gpSlideInAbove', () => gpReadTest('slide-in-above', 'gp'))
    it('gpxSlideInAbove', () => gpReadTest('slide-in-above', 'gpx'))
    it('gp5SlideInAbove', () => gpReadTest('slide-in-above', 'gp5'))
    it('gp4SlideInAbove', () => gpReadTest('slide-in-above', 'gp4'))
    it('gpSlideInBelow', () => gpReadTest('slide-in-below', 'gp'))
    it('gpxSlideInBelow', () => gpReadTest('slide-in-below', 'gpx'))
    it('gp5SlideInBelow', () => gpReadTest('slide-in-below', 'gp5'))
    it('gp4SlideInBelow', () => gpReadTest('slide-in-below', 'gp4'))
    it('gpSlideOutUp', () => gpReadTest('slide-out-up', 'gp'))
    it('gpxSlideOutUp', () => gpReadTest('slide-out-up', 'gpx'))
    it('gp5SlideOutUp', () => gpReadTest('slide-out-up', 'gp5'))
    it('gp4SlideOutUp', () => gpReadTest('slide-out-up', 'gp4'))
    it('gpSlideOutDown', () => gpReadTest('slide-out-down', 'gp'))
    it('gpxSlideOutDown', () => gpReadTest('slide-out-down', 'gpx'))
    it('gp5SlideOutDown', () => gpReadTest('slide-out-down', 'gp5'))
    it('gp4SlideOutDown', () => gpReadTest('slide-out-down', 'gp4'))
    it('gpLegatoSlide', () => gpReadTest('legato-slide', 'gp'))
    it('gpxLegatoSlide', () => gpReadTest('legato-slide', 'gpx'))
    it('gp5LegatoSlide', () => gpReadTest('legato-slide', 'gp5'))
    it('gp4LegatoSlide', () => gpReadTest('legato-slide', 'gp4'))
    it('gpShiftSlide', () => gpReadTest('shift-slide', 'gp'))
    it('gpxShiftSlide', () => gpReadTest('shift-slide', 'gpx'))
    it('gp5ShiftSlide', () => gpReadTest('shift-slide', 'gp5'))
    it('gp4ShiftSlide', () => gpReadTest('shift-slide', 'gp4'))
    it('gpDoubleBar', () => gpReadTest('double-bar', 'gp'))
    it('gpxDoubleBar', () => gpReadTest('double-bar', 'gpx'))
    it('gpCrecDim', () => gpReadTest('crescendo-diminuendo', 'gp'))
    it('gpxCrecDim', () => gpReadTest('crescendo-diminuendo', 'gpx'))
    it('gpDeadNote', () => gpReadTest('dead-note', 'gp'))
    it('gpxDeadNote', () => gpReadTest('dead-note', 'gpx'))
    it('gpWah', () => gpReadTest('wah', 'gp'))
    it('gpxWah', () => gpReadTest('wah', 'gpx'))
    it('gpAccent', () => gpReadTest('accent', 'gp'))
    it('gpxAccent', () => gpReadTest('accent', 'gpx'))
    it('gpArpeggio', () => gpReadTest('arpeggio', 'gp'))
    it('gpxArpeggio', () => gpReadTest('arpeggio', 'gpx'))
    it('gpTurn', () => gpReadTest('turn', 'gp'))
    it('gpxTurn', () => gpReadTest('turn', 'gpx'))
    it('gpMordents', () => gpReadTest('mordents', 'gp'))
    it('gpxMordents', () => gpReadTest('mordents', 'gpx'))
    it('gpPickUpDown', () => gpReadTest('pick-up-down', 'gp'))
    it('gpxPickUpDown', () => gpReadTest('pick-up-down', 'gpx'))
    it('gp5PickUpDown', () => gpReadTest('pick-up-down', 'gp5'))
    it('gp4PickUpDown', () => gpReadTest('pick-up-down', 'gp4'))
    it('gpFingering', () => gpReadTest('fingering', 'gp'))
    it('gpxFingering', () => gpReadTest('fingering', 'gpx'))
    it('gp5Fingering', () => gpReadTest('fingering', 'gp5'))
    it('gp4Fingering', () => gpReadTest('fingering', 'gp4'))
    it('gpBrush', () => gpReadTest('brush', 'gp'))
    it('gpxBrush', () => gpReadTest('brush', 'gpx'))
    it('gp5Brush', () => gpReadTest('brush', 'gp5'))
    it('gp4Brush', () => gpReadTest('brush', 'gp4'))
    it('gpRepeats', () => gpReadTest('repeats', 'gp'))
    it('gpxRepeats', () => gpReadTest('repeats', 'gpx'))
    it('gpGraceBefore', () => gpReadTest('grace-before-beat', 'gp'))
    it('gpxGraceBefore', () => gpReadTest('grace-before-beat', 'gpx'))
    it('gpGraceOn', () => gpReadTest('grace-on-beat', 'gp'))
    it('gpxGraceOn', () => gpReadTest('grace-on-beat', 'gpx'))
    it('gpGraceDurations', () => gpReadTest('grace-durations', 'gp'))
    it('gpPalmMute', () => gpReadTest('palm-mute', 'gp'))
    it('gpxPalmMute', () => gpReadTest('palm-mute', 'gpx'))
    it('gp5PalmMute', () => gpReadTest('palm-mute', 'gp5'))
    it('gp4PalmMute', () => gpReadTest('palm-mute', 'gp4'))
    it('gpLetRing', () => gpReadTest('let-ring', 'gp'))
    it('gpxLetRing', () => gpReadTest('let-ring', 'gpx'))
    it('gp5LetRing', () => gpReadTest('let-ring', 'gp5'))
    it('gp4LetRing', () => gpReadTest('let-ring', 'gp4'))
    it('gpTapSlapPop', () => gpReadTest('tap-slap-pop', 'gp'))
    it('gpxTapSlapPop', () => gpReadTest('tap-slap-pop', 'gpx'))
    it('gp5TapSlapPop', () => gpReadTest('tap-slap-pop', 'gp5'))
    it('gpBarre', () => gpReadTest('barre', 'gp'))
    it('gpxBarre', () => gpReadTest('barre', 'gpx'))
    it('gpTimer', () => gpReadTest('timer', 'gp'))
    it('gpxTimer', () => gpReadTest('timer', 'gpx'))
    it('gpText', () => gpReadTest('text', 'gp'))
    it('gpxText', () => gpReadTest('text', 'gpx'))
    it('gpArtHarmonic', () => gpReadTest('artificial-harmonic', 'gp'))
    it('gpxArtHarmonic', () => gpReadTest('artificial-harmonic', 'gpx'))
    it('gpGhost', () => gpReadTest('ghost-note', 'gp'))
    it('gpxGhost', () => gpReadTest('ghost-note', 'gpx'))
    it('gp3GhostNote', () => gpReadTest('ghost_note', 'gp3'))
    it('gpRasg', () => gpReadTest('rasg', 'gp'))
    it('gpxRasg', () => gpReadTest('rasg', 'gpx'))
    it('gpPercussion', () => gpReadTest('all-percussion', 'gp'))
    it.skip('gpxPercussion', () => gpReadTest('all-percussion', 'gpx'))
    it('gp5Percussion', () => gpReadTest('all-percussion', 'gp5'))
    it('gpFermata', () => gpReadTest('fermata', 'gp'))
    it('gpxFermata', () => gpReadTest('fermata', 'gpx'))
    it('gpDirections', () => gpReadTest('directions', 'gp'))
    it('gpxDirections', () => gpReadTest('directions', 'gpx'))
    it('gpSlur', () => gpReadTest('slur', 'gp'))
    it('gpxSlur', () => gpReadTest('slur', 'gpx'))
    it('gp4Slur', () => gpReadTest('slur', 'gp4'))
    it('gpSlurHS', () => gpReadTest('slur_hammer_slur', 'gp'))
    it('gpxSlurHS', () => gpReadTest('slur_hammer_slur', 'gpx'))
    it('gpSlur3M', () => gpReadTest('slur_over_3_measures', 'gp'))
    it('gpxSlur3M', () => gpReadTest('slur_over_3_measures', 'gpx'))
    it('gpSlurSH', () => gpReadTest('slur_slur_hammer', 'gp'))
    it('gpxSlurSH', () => gpReadTest('slur_slur_hammer', 'gpx'))
    it('gpSlurV', () => gpReadTest('slur_voices', 'gp'))
    it('gpxSlurV', () => gpReadTest('slur_voices', 'gpx'))
    it('gpVibrato', () => gpReadTest('vibrato', 'gp'))
    it('gpxVibrato', () => gpReadTest('vibrato', 'gpx'))
    it('gp5Vibrato', () => gpReadTest('vibrato', 'gp5'))
    it('gpVolumeSwell', () => gpReadTest('volume-swell', 'gp'))
    it('gpxVolumeSwell', () => gpReadTest('volume-swell', 'gpx'))
    it('gpTremoloBar', () => gpReadTest('tremolo-bar', 'gp'))
    it('gpxTremoloBar', () => gpReadTest('tremolo-bar', 'gpx'))
    it('gpFreeTime', () => gpReadTest('free-time', 'gp'))
    it('gpxFreeTime', () => gpReadTest('free-time', 'gpx'))
    it('gpRepeatBar', () => gpReadTest('repeated-bars', 'gp'))
    it('gpxRepeatBar', () => gpReadTest('repeated-bars', 'gpx'))
    it('gpDottedGliss', () => gpReadTest('dotted-gliss', 'gp'))
    it('gpxDottedGliss', () => gpReadTest('dotted-gliss', 'gpx'))
    it('gp3DottedGliss', () => gpReadTest('dotted-gliss', 'gp3'))
    it.skip('gpHighPitch', () => gpReadTest('high-pitch', 'gp'))
    it.skip('gpxHighPitch', () => gpReadTest('high-pitch', 'gpx'))
    it.skip('gp3HighPitch', () => gpReadTest('high-pitch', 'gp3'))
    it('gpMultiVoices', () => gpReadTest('multivoices', 'gp'))
    it('gpxMultiVoices', () => gpReadTest('multivoices', 'gpx'))
    it('gpOttava1', () => gpReadTest('ottava1', 'gp'))
    it('gpxOttava1', () => gpReadTest('ottava1', 'gpx'))
    it('gpOttava2', () => gpReadTest('ottava2', 'gp'))
    it('gpxOttava2', () => gpReadTest('ottava2', 'gpx'))
    it('gpOttava3', () => gpReadTest('ottava3', 'gp'))
    it('gpxOttava3', () => gpReadTest('ottava3', 'gpx'))
    it('gpOttava4', () => gpReadTest('ottava4', 'gp'))
    it('gpxOttava4', () => gpReadTest('ottava4', 'gpx'))
    it('gpOttava5', () => gpReadTest('ottava5', 'gp'))
    it('gpxOttava5', () => gpReadTest('ottava5', 'gpx'))
    it('gpOttavaSimile', () => gpReadTest('ottava-simile', 'gp'))
    it('gpChornamesKeyboard', () => gpReadTest('chordnames_keyboard', 'gp'))
    it('gpxChornamesKeyboard', () => gpReadTest('chordnames_keyboard', 'gpx'))
    it('gpClefs', () => gpReadTest('clefs', 'gp'))
    it('gpxClefs', () => gpReadTest('clefs', 'gpx'))
    it('gpxTuplets', () => gpReadTest('tuplets', 'gpx'))
    it('gpxTuplets2', () => gpReadTest('tuplets2', 'gpx'))
    it('gp3CapoFret', () => gpReadTest('capo-fret', 'gp3'))
    it('gp4CapoFret', () => gpReadTest('capo-fret', 'gp4'))
    it('gp5CapoFret', () => gpReadTest('capo-fret', 'gp5'))
    it('gpxUncompletedMeasure', () => gpReadTest('UncompletedMeasure', 'gpx'))
    it('gpInstrumentChange', () => gpReadTest('instr-change', 'gp'))
    it('gpxInstrumentChange', () => gpReadTest('instr-change', 'gpx'))
    it('gpInstrumentChange1beat', () => gpReadTest('instr-change-1-beat', 'gp'))
    it('gpxInstrumentChange1beat', () => gpReadTest('instr-change-1-beat', 'gpx'))
    it('gpFixEmptyMeasures', () => gpReadTest('mmrest', 'gp'))
    it('gpLineElements', () => gpReadTest('line_elements', 'gp'))
    it('gp5LineElements', () => gpReadTest('line_elements', 'gp5'))
    it('gp5LetRingTied', () => gpReadTest('let-ring-tied', 'gp5'))
    it('gpPercussionBeams', () => gpReadTest('percussion-beams', 'gp'))
    it('gpSpannerInUncompleteMeasure', () => gpReadTest('spanner-in-uncomplete-measure', 'gp'))
    it('gp5SpannerInUncompleteMeasure', () => gpReadTest('spanner-in-uncomplete-measure', 'gp5'))
    it('gpBarlineLastMeasure', () => gpReadTest('barline-last-measure', 'gp'))
    it('gpBeamModes', () => gpReadTest('beam-modes', 'gp'))
    it('gpHideRests', () => gpReadTest('hide-rests', 'gp'))
    it('gpTupletEmptyMeasure', () => gpReadTest('tuplet-empty-measure', 'gp'))
    it('gpSkippedTiedNotes', () => gpReadTest('skipped_tied_notes', 'gp5'))
    it('gpBendAndGlissando', () => gpReadTest('bend_and_glissando', 'gp'))
    it('gp5BendAndGlissando', () => gpReadTest('bend_and_glissando', 'gp5'))

    it('gp4SforzatoCounts', () => {
        const { score, err } = gpRead('sforzato', 'gp4')
        expect(err).toBe(Err.NoError)
        expect(collect(score!, ElementType.CHORD)).toBe(1)
        expect(collect(score!, ElementType.DYNAMIC)).toBe(1)
    })
    // GuitarPro::addDynamic() indexes a 9 entry table with the note's dynamic field, here patched to 100
    it('gp4DynamicOutOfRange', () => {
        const { score, err } = gpRead('dynamic-out-of-range', 'gp4')
        expect(err).toBe(Err.NoError)
        expect(collect(score!, ElementType.CHORD)).toBe(1)
        expect(collect(score!, ElementType.DYNAMIC)).toBe(0)
    })
    // the track's midiChannel patched to 200: GuitarPro4::read() rejects the track
    it('gp4MidiChannelOutOfRange', () => {
        const { score, err } = gpRead('midi-channel-out-of-range', 'gp4')
        expect(err).toBe(Err.NoError)
        expect(collect(score!, ElementType.CHORD)).toBe(0)
    })
    it('gpUnknownHeader', () => {
        const { score, err } = gpRead('unknown-header', 'gp4')
        expect(score).toBeNull()
        expect(err).toBe(Err.FileBadFormat)
    })
    it('gpUnknownVersionString', () => {
        const { score, err } = gpRead('unknown-version-string', 'gp4')
        expect(score).toBeNull()
        expect(err).toBe(Err.FileBadFormat)
    })
    it('gpUnsupportedVersion', () => {
        const { score, err } = gpRead('unsupported-version', 'gp4')
        expect(score).toBeNull()
        expect(err).toBe(Err.FileBadFormat)
    })
    // PowerTab (.ptb) malformed input regression tests (minimal synthetic PowerTab v4 streams)
    it('ptbBaseline', () => {
        const { score, err } = gpRead('ptb-baseline', 'ptb')
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(2)
        expect(collect(score!, ElementType.NOTE)).toBe(2)
    })
    it('ptbInvalidStaffIndex', () => {
        const { score, err } = gpRead('ptb-oob-staff', 'ptb')
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(1)
        expect(collect(score!, ElementType.NOTE)).toBe(1)
    })
    it('ptbTrackWithoutStrings', () => {
        const { score, err } = gpRead('ptb-nostrings', 'ptb')
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(2)
        expect(collect(score!, ElementType.NOTE)).toBe(1)
    })
})

describe.skipIf(!existsSync(BEND_DATA))('Guitar Pro bend import (guitarbendimporter_tests.cpp)', () => {
    beforeAll(async () => {
        await initFonts()
        MScore.testMode = true
    })
    afterAll(() => {
        MScore.testMode = false
    })

    it('gpSlightBend', () => gpBendReadTest('slight_bend', 'gp'))
    it('gp5SlightBend', () => gpBendReadTest('slight_bend', 'gp5'))
    it('gpPrebend', () => gpBendReadTest('prebend', 'gp'))
    it('gp5Prebend', () => gpBendReadTest('prebend', 'gp5'))
    it.skip('gpTiedBendChord', () => gpBendReadTest('tied_bend_chord', 'gp'))
    it('gpSlightBendChord', () => gpBendReadTest('slight_bend_chord', 'gp'))
    it.skip('gpPrebendChord', () => gpBendReadTest('prebend_chord', 'gp'))
    it('gpSimpleBend', () => gpBendReadTest('simple_bend', 'gp'))
    it('gpBendRelease', () => gpBendReadTest('bend_release', 'gp'))
    it('gpPrebendBend', () => gpBendReadTest('prebend_bend', 'gp'))
    it('gpSimpleBendChord', () => gpBendReadTest('simple_bend_chord', 'gp'))
    it('gpBendsTied1', () => gpBendReadTest('bends_tied_1', 'gp'))
    it('gpBendsTied2', () => gpBendReadTest('bends_tied_2', 'gp'))
    it('gpBendsTied3', () => gpBendReadTest('bends_tied_3', 'gp'))
    it('gpBendHold', () => gpBendReadTest('bend_hold', 'gp'))
    it('gpBendOnTuplet', () => gpBendReadTest('bend_on_tuplet', 'gp'))
    it('gpBendOnUnequalChords', () => gpBendReadTest('bend_on_unequal_chords', 'gp'))
    it('gpGraceChordDiffBends', () => gpBendReadTest('grace_chord_diff_bends', 'gp'))
    it('gpTiedBendsReleaseOrHold', () => gpBendReadTest('tied_bends_release_or_hold', 'gp'))
    it('gpBendReleaseGraceAfter', () => gpBendReadTest('bends_release_grace_after', 'gp'))
    it('gpPrebendReleaseBend', () => gpBendReadTest('prebend_release_bend', 'gp'))
    it('gpSlightBendTied', () => gpBendReadTest('slight_bend_tied', 'gp'))
})
