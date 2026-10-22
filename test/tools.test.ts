// SPDX-License-Identifier: GPL-3.0-only
// The Tools menu (explode, implode, time delete, measures, slashes, spelling, groupings, rehearsal marks, ...):
// MuseScore's engraving tests with their reference files (implodeexplode_tests.cpp, tools_tests.cpp, join_tests.cpp,
// split_tests.cpp, rhythmicgrouping_tests.cpp, ...), checked by comparing the staves of writeMscx with the reference
// files.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    AddBoxesTarget, addMeasures, clipboardContents, executeAction, layoutScore, loadScore, undo, writeMscx, type MasterScore,
} from '../src/index'
import { SelectType } from '../src/engraving/dom/select'
import type { Note } from '../src/engraving/dom/note'
import { TranslatableString } from '../src/framework/global/types/translatablestring'
import { Fraction } from '../src/engraving/types/fraction'
import { ElementType } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { Pid } from '../src/engraving/dom/property'
import { SplitJoinMeasure } from '../src/engraving/editing/splitjoinmeasure'
import { HDuration, Voicing } from '../src/engraving/dom/realizedharmony'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import { ROOT, initFonts } from './helpers'

const TESTS = `${ROOT}MuseScore/src/engraving/tests/`

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links */
export function staves(mscx: string): string {
    const score = mscx.substring(mscx.indexOf('<Score>'))
    const parts: string[] = []
    const re = /\n {4}<Staff id="\d+">[\s\S]*?\n {4}<\/Staff>/g
    for (const m of score.matchAll(re)) {
        parts.push(m[0])
    }
    return parts.join('\n')
        .split('\n')
        .filter(l => !/<eid>|<linkedMain|<linked>/.test(l))
        .join('\n')
}

function open(file: string): MasterScore {
    const score = loadScore(readFileSync(`${TESTS}${file}`))
    layoutScore(score)
    return score
}

function cmd(score: MasterScore, f: () => void): void {
    score.startCmd(TranslatableString.untranslatable('Tools tests'))
    f()
    score.endCmd()
}

function expectRef(score: MasterScore, ref: string): void {
    expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${TESTS}${ref}`, 'utf8')))
}

describe.skipIf(!existsSync(`${TESTS}implode_explode_data`))('implode and explode (MuseScore implodeexplode tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'implode_explode_data/'
    for (const [name, explode] of [
        ['undoExplode', true], ['undoImplode', false], ['undoImplodeVoice', false], ['implodeScore', false],
        ['explodeDynamics', true], ['implodeDynamics', false], ['implodeArticulations', false],
    ] as const) {
        it(name, () => {
            const score = open(`${DIR}${name}.mscx`)
            cmd(score, () => score.cmdSelectAll())
            cmd(score, () => explode ? score.cmdExplode() : score.cmdImplode())
            expectRef(score, `${DIR}${name}01-ref.mscx`)
            score.undoRedo(true, null)
            expectRef(score, `${DIR}${name}02-ref.mscx`)
        })
    }
})

describe.skipIf(!existsSync(`${TESTS}tools_data`))('tools (MuseScore tools tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'tools_data/'

    it('undoSlashFill', () => {
        const score = open(`${DIR}undoSlashFill.mscx`)
        const s = score.firstMeasure()!.findSegment(SegmentType.ChordRest, new Fraction(2, 4))!
        score.selection().setRange(s, score.lastSegment(), 0, 2)
        cmd(score, () => score.cmdSlashFill())
        expectRef(score, `${DIR}undoSlashFill01-ref.mscx`)
        score.undoRedo(true, null)
        expectRef(score, `${DIR}undoSlashFill02-ref.mscx`)
    })

    it('undoSlashRhythm', () => {
        const score = open(`${DIR}undoSlashRhythm.mscx`)
        cmd(score, () => score.cmdSelectAll())
        cmd(score, () => score.cmdSlashRhythm())
        expectRef(score, `${DIR}undoSlashRhythm01-ref.mscx`)
        score.undoRedo(true, null)
        expectRef(score, `${DIR}undoSlashRhythm02-ref.mscx`)
    })

    for (const name of ['undoResequenceAlpha', 'undoResequenceNumeric', 'undoResequenceMeasure', 'undoResequencePart']) {
        it(name, () => {
            const score = open(`${DIR}${name}.mscx`)
            cmd(score, () => score.cmdResequenceRehearsalMarks())
            expectRef(score, `${DIR}${name}01-ref.mscx`)
            score.undoRedo(true, null)
            expectRef(score, `${DIR}${name}02-ref.mscx`)
        })
    }

    for (const both of [true, false]) {
        it(`changeEnharmonic${both ? 'Both' : 'Current'}`, () => {
            const score = open(`${DIR}change-enharmonic.mscx`)
            const mode = both ? 'both' : 'current'
            score.cmdSelectAll()
            for (let i = 1; i < 6; ++i) {
                cmd(score, () => score.changeEnharmonicSpelling(both))
                expectRef(score, `${DIR}change-enharmonic-${mode}-0${i}-ref.mscx`)
            }
        })
    }
})

describe.skipIf(!existsSync(`${TESTS}join_data`))('join measures (MuseScore join tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'join_data/'
    for (const [file, index] of [
        ['join01', 0], ['join02', 0], ['join03', 0], ['join04', 0], ['join05', 0], ['join06', 1], ['join07', 0], ['join09', 0],
        ['join10', 1],
    ] as const) {
        it(file, () => {
            const score = open(`${DIR}${file}.mscx`)
            let m1 = score.firstMeasure()!
            for (let i = 0; i < index; ++i) {
                m1 = m1.nextMeasure()!
            }
            const m2 = m1.nextMeasure()!
            cmd(score, () => SplitJoinMeasure.joinMeasures(score.masterScore(), m1.tick(), m2.tick()))
            expectRef(score, `${DIR}${file}-ref.mscx`)
        })
    }

    it('join08: the notes stay on line 6', () => {
        const score = open(`${DIR}join08.mscx`)
        const m1 = score.firstMeasure()!
        const m2 = m1.nextMeasure()!
        SplitJoinMeasure.joinMeasures(score.masterScore(), m1.tick(), m2.tick())
        let s = score.firstSegment(SegmentType.ChordRest)
        for (let i = 0; i < 8; ++i) {
            const note = (s!.element(0) as unknown as Chord).upNote()
            expect(note.line()).toBe(6)
            s = s!.next1(SegmentType.ChordRest)
        }
    })
})

describe.skipIf(!existsSync(`${TESTS}split_data`))('split measures (MuseScore split tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'split_data/'
    const split = (file: string, ref: string, index = 2): void => {
        const score = open(`${DIR}${file}`)
        let s = score.firstMeasure()!.first(SegmentType.ChordRest)!
        for (let i = 0; i < index; ++i) {
            s = s.next1(SegmentType.ChordRest)!
        }
        cmd(score, () => SplitJoinMeasure.splitMeasure(score, s.tick()))
        expectRef(score, `${DIR}${ref}`)
    }

    for (const n of ['01', '02', '03', '04', '05', '07', '08']) {
        it(`split${n}`, () => split(`split${n}.mscx`, `split${n}-ref.mscx`))
    }
    it('split06', () => split('split06.mscx', 'split06-ref.mscx', 6))
    it('split183846', () => {
        split('split183846-irregular-qn-qn-wn.mscx', 'split183846-irregular-qn-qn-wn-ref.mscx', 1)
        split('split183846-irregular-wn-wn.mscx', 'split183846-irregular-wn-wn-ref.mscx', 1)
        split('split183846-irregular-wn-wr-wn-hr-qr.mscx', 'split183846-irregular-wn-wr-wn-hr-qr-ref.mscx', 2)
        split('split183846-irregular-wr-wn-wr-hn-qn.mscx', 'split183846-irregular-wr-wn-wr-hn-qn-ref.mscx', 3)
        split('split183846-irregular-hn-hn-qn-qn-hn-hn.mscx', 'split183846-irregular-hn-hn-qn-qn-hn-hn-ref.mscx', 5)
        split('split183846-irregular-verylong.mscx', 'split183846-irregular-verylong-ref.mscx', 7)
    })
    it('split184061', () => {
        split('split184061-no-tie.mscx', 'split184061-no-tie-ref.mscx', 3)
        split('split184061-keep-tie.mscx', 'split184061-keep-tie-ref.mscx', 3)
        split('split184061-keep-tie-before-break-voice-4.mscx', 'split184061-keep-tie-before-break-voice-4-ref.mscx', 2)
        split('split184061-other-inst-only-one-tie.mscx', 'split184061-other-inst-only-one-tie-ref.mscx', 2)
    })
    it('split295207', () => split('split295207.mscx', 'split295207-ref.mscx', 5))
})

describe.skipIf(!existsSync(`${TESTS}rhythmicGrouping_data`))('reset groupings (MuseScore rhythmic grouping tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'rhythmicGrouping_data/'
    for (const [file, ref, staves] of [
        ['group8ths4-4', 'group8ths4-4-ref', 0], ['group8thsSimple', 'group8thsSimple-ref', 0],
        ['group8thsCompound', 'group8thsCompound-ref', 0], ['groupSubbeats', 'groupSubbeats-ref', 0],
        ['groupVoices', 'groupVoices-ref', 0], ['groupConflicts', 'groupConflicts-ref', 1],
        ['groupArticulationsTies', 'groupArticulationsTies-ref', 0], ['groupShortenNotes', 'groupShortenNotes-ref', 0],
    ] as const) {
        it(file, () => {
            const score = open(`${DIR}${file}.mscx`)
            cmd(score, () => {
                if (!staves) {
                    score.cmdSelectAll()
                    score.cmdResetNoteAndRestGroupings()
                } else {
                    for (let track = 0; track < staves * 4; track++) {
                        score.regroupNotesAndRests(score.firstSegment(SegmentType.All)!.tick(), score.lastSegment()!.tick(), track)
                    }
                }
            })
            layoutScore(score)
            expectRef(score, `${DIR}${ref}.mscx`)
        })
    }

    it('groupMaintainSelection', () => {
        const score = open(`${DIR}groupSubbeats.mscx`)
        score.cmdSelectAll()
        const sel = score.selection()
        const [sTick, eTick, sStaff, eStaff] = [sel.tickStart(), sel.tickEnd(), sel.staffStart(), sel.staffEnd()]
        score.cmdResetNoteAndRestGroupings()
        expect(score.selection().tickStart().eq(sTick)).toBe(true)
        expect(score.selection().tickEnd().eq(eTick)).toBe(true)
        expect(score.selection().staffStart()).toBe(sStaff)
        expect(score.selection().staffEnd()).toBe(eStaff)
    })
})

describe.skipIf(!existsSync(`${TESTS}chordsymbol_data`))('realize chord symbols (MuseScore chord symbol tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const DIR = 'chordsymbol_data/'

    function selectAllChordSymbols(score: MasterScore): void {
        // find a chord symbol
        let e: EngravingItem | null = null
        for (let seg = score.firstSegment(SegmentType.ChordRest); seg; seg = seg.next1()) {
            e = seg.findAnnotation(ElementType.HARMONY, 0, score.ntracks())
            if (e) {
                break
            }
        }
        score.selectSimilar(e!, false)
    }

    for (const [voicing, ref] of [
        [Voicing.CLOSE, 'realize-close'], [Voicing.DROP_2, 'realize-drop2'], [Voicing.THREE_NOTE, 'realize-3note'],
        [Voicing.FOUR_NOTE, 'realize-4note'], [Voicing.SIX_NOTE, 'realize-6note'],
    ] as const) {
        it(ref, () => {
            const score = open(`${DIR}realize.mscx`)
            selectAllChordSymbols(score)
            for (const e of score.selection().elements()) {
                if (e.isHarmony()) {
                    e.setProperty(Pid.HARMONY_VOICING, voicing)
                }
            }
            cmd(score, () => score.cmdRealizeChordSymbols())
            expectRef(score, `${DIR}${ref}-ref.mscx`)
        })
    }

    it('realize-concert-pitch', () => {
        const score = open(`${DIR}realize-concert-pitch.mscx`)
        cmd(score, () => score.cmdConcertPitchChanged(false))
        selectAllChordSymbols(score)
        cmd(score, () => score.cmdRealizeChordSymbols())
        expectRef(score, `${DIR}realize-concert-pitch-ref.mscx`)
    })

    it('realize-override', () => {
        const score = open(`${DIR}realize-override.mscx`)
        selectAllChordSymbols(score)
        cmd(score, () => score.cmdRealizeChordSymbols(true, Voicing.ROOT_ONLY, HDuration.SEGMENT_DURATION))
        expectRef(score, `${DIR}realize-override-ref.mscx`)
    })

    for (const name of ['realize-triplet', 'realize-duration', 'realize-jazz']) {
        it(name, () => {
            const score = open(`${DIR}${name}.mscx`)
            selectAllChordSymbols(score)
            cmd(score, () => score.cmdRealizeChordSymbols())
            expectRef(score, `${DIR}${name}-ref.mscx`)
        })
    }
})

const LYRICS15 = `${ROOT}MuseScore/vtest/scores/lyrics-15.mscz`

function openLyrics15(): MasterScore {
    const score = loadScore(readFileSync(LYRICS15))
    layoutScore(score)
    return score
}

describe.skipIf(!existsSync(LYRICS15))('Tools menu actions', () => {
    beforeAll(async () => {
        await initFonts()
    })

    const nmeasures = (score: MasterScore): number => {
        let n = 0
        for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
            n++
        }
        return n
    }

    it('del-empty-measures removes the empty measures at the end (undoable)', () => {
        const score = openLyrics15()
        const n = nmeasures(score)
        expect(addMeasures(score, 3, AddBoxesTarget.AtEndOfScore)).toBe(true)
        expect(nmeasures(score)).toBe(n + 3)
        expect(executeAction(score, 'del-empty-measures')).toBe(true)
        expect(nmeasures(score)).toBe(n)
        undo(score)
        expect(nmeasures(score)).toBe(n + 3)
    })

    it('split-measure and join-measures', () => {
        const score = openLyrics15()
        const n = nmeasures(score)
        const m1 = score.firstMeasure()!
        // split at the second chord/rest of the first measure
        const cr = m1.first(SegmentType.ChordRest)!.next(SegmentType.ChordRest)!.element(0)!
        score.select(cr.isChord() ? (cr as unknown as Chord).upNote() : cr)
        expect(executeAction(score, 'split-measure')).toBe(true)
        expect(nmeasures(score)).toBe(n + 1)
        // join them again
        score.select(score.firstMeasure(), SelectType.RANGE, 0)
        score.select(score.firstMeasure()!.nextMeasure(), SelectType.RANGE, 0)
        expect(executeAction(score, 'join-measures')).toBe(true)
        expect(nmeasures(score)).toBe(n)
        expect(score.firstMeasure()!.ticks().eq(m1.ticks())).toBe(true)
    })

    it('pitch-spell-flats and pitch-spell-sharps respell the selected notes', () => {
        const score = openLyrics15()
        let note: Note | null = null
        score.scanElements(e => {
            if (!note && e.isNote()) {
                note = e as unknown as Note
            }
        })
        const n = note! as Note
        cmd(score, () => {
            n.undoChangeProperty(Pid.PITCH, 61)
        })
        score.select(n)
        expect(executeAction(score, 'pitch-spell-flats')).toBe(true)
        expect(n.tpc1()).toBe(9) // Db
        score.select(n)
        expect(executeAction(score, 'pitch-spell-sharps')).toBe(true)
        expect(n.tpc1()).toBe(21) // C#
    })
})

describe.skipIf(!existsSync(LYRICS15))('copy-lyrics-to-clipboard', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('copies the lyrics as text', () => {
        const score = openLyrics15()
        expect(executeAction(score, 'copy-lyrics-to-clipboard')).toBe(true)
        expect(clipboardContents()['text/plain']).toBe(score.extractLyrics())
        expect(score.extractLyrics().length).toBeGreaterThan(0)
    })
})
