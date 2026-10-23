// SPDX-License-Identifier: GPL-3.0-only
// Parts (excerpts): MuseScore's engraving/tests/parts_tests.cpp with its reference files (parts_data/). The scores are
// written like MuseScore's test mode (MScore.testMode: the excerpts inside the main file) and compared with the
// reference files without the EIDs (the references of <linkedTo> are compared as present/absent).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { layoutScore, loadScore, saveMscz, writeMscx, type MasterScore } from '../src/index'
import { Writer } from '../src/engraving/rw/write/writer'
import { Excerpt, formatUniqueExcerptName } from '../src/engraving/dom/excerpt'
import { MScore } from '../src/engraving/dom/mscore'
import '../src/engraving/editing/editexcerpt'
import type { Score } from '../src/engraving/dom/score'
import { Fraction } from '../src/engraving/types/fraction'
import { ChordLineType, ElementType, PlacementV } from '../src/engraving/types/types'
import { SymId } from '../src/engraving/types/symid'
import { Sid } from '../src/engraving/style/styledef'
import { Pid, PropertyFlags } from '../src/engraving/dom/property'
import { Factory } from '../src/engraving/dom/factory'
import { SegmentType } from '../src/engraving/dom/segment'
import { EditData } from '../src/engraving/editing/editdata'
import { TranslatableString } from '../src/framework/global/types/translatablestring'

import { NoteVal } from '../src/engraving/dom/input'
import type { Chord } from '../src/engraving/dom/chord'
import type { Breath } from '../src/engraving/dom/breath'
import type { Symbol as SymbolItem } from '../src/engraving/dom/symbol'
import type { ChordLine } from '../src/engraving/dom/chordline'
import type { TextBase } from '../src/engraving/dom/textbase'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { Dynamic } from '../src/engraving/dom/dynamic'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/parts_data/`
const OUT = process.env.PARTS_TEST_OUT ?? ''

/**
 * the written score without what MuseScore's test mode writes differently (the styles, <synti>, the beam positions
 * l1/l2, the meta tags of a new master score, <open>) and without the EIDs
 */
function normalize(mscx: string): string {
    return mscx.replace(/\n *<Style>[\s\S]*?<\/Style>/g, '')
        .split('\n')
        .filter(l => !/^\s*<(eid|programVersion|programRevision|synti|l1|l2|open|metaTag)\b/.test(l))
        .map(l => l.replace(/<linkedTo>.*<\/linkedTo>/, '<linkedTo/>'))
        .join('\n')
}

/** ScoreRW::readScore: every score is laid out (no migration, no compatibility conversions after the layout) */
function open(name: string): MasterScore {
    const score = loadScore(readFileSync(`${DATA}${name}`))
    for (const s of score.scoreList()) {
        s.doLayout()
    }
    score.setPlaylistDirty()
    return score
}

/** ScoreComp::saveCompareScore */
function saveCompareScore(score: Score, saveName: string, ref: string): void {
    const out = Writer.writeScore(score) // ScoreRW::saveScore (writeMscx would run the compatibility conversions)
    if (OUT) {
        writeFileSync(`${OUT}/${saveName}`, out)
    }
    expect(normalize(out)).toBe(normalize(readFileSync(`${DATA}${ref}`, 'utf8')))
}

/** TestUtils::createPart */
function createPart(masterScore: MasterScore, partNumber = 0): Score {
    const parts = [masterScore.parts()[partNumber]]
    const nscore = masterScore.createScore()

    const ex = new Excerpt(masterScore)
    ex.setExcerptScore(nscore)
    ex.setParts(parts)
    ex.setName(parts[0].partName())
    Excerpt.createExcerpt(ex)

    masterScore.excerpts().push(ex)
    masterScore.setExcerptsChanged(true)
    return nscore
}

/** TestUtils::createParts */
function createParts(masterScore: MasterScore, numberOfParts: number): void {
    for (let part = 0; part < numberOfParts; part++) {
        createPart(masterScore, part)
    }
}

/** TestUtils::createEmptyPart */
function createEmptyPart(masterScore: MasterScore): Score {
    const nscore = masterScore.createScore()
    const ex = new Excerpt(masterScore)
    ex.setExcerptScore(nscore)
    Excerpt.createExcerpt(ex)
    masterScore.excerpts().push(ex)
    masterScore.setExcerptsChanged(true)
    return nscore
}

function testPartCreation(test: string): void {
    const score = open(`${test}.mscx`)

    saveCompareScore(score, `${test}-1.mscx`, existsSync(`${DATA}${test}-ref.mscx`) ? `${test}-ref.mscx` : `${test}.mscx`)

    createParts(score, 2)

    saveCompareScore(score, `${test}-parts.mscx`,
        existsSync(`${DATA}${test}-parts-ref.mscx`) ? `${test}-parts-ref.mscx` : `${test}-parts.mscx`)
}

describe.skipIf(!existsSync(DATA))('parts (MuseScore parts tests)', () => {
    beforeAll(async () => {
        await initFonts()
        MScore.testMode = true
    })
    afterAll(() => {
        MScore.testMode = false
    })

    it('createPart1', () => testPartCreation('part-empty'))
    it('createPart2', () => testPartCreation('part-all'))
    it('createPart3', () => testPartCreation('part-54346'))
    it('createPartBreath', () => testPartCreation('part-breath'))
    it('createPartFingering', () => testPartCreation('part-fingering'))
    it('createPartSymbol', () => testPartCreation('part-symbol'))
    it('createPartChordline', () => testPartCreation('part-chordline'))
    it('createPartMeasureRepeat', () => testPartCreation('part-measure-repeat'))
    // ScoreRW::readScore loads the image file next to the .mscx; the port reads the score's bytes only (no image store)
    it.skip('createPartImage', () => testPartCreation('part-image'))
    it('createPartStemless', () => testPartCreation('part-stemless'))

    it('voicesExcerpt', () => {
        const masterScore = open('voices.mscx')

        const createVoicesPart = (partIdx: number, hidden: number[]): void => {
            const parts = [masterScore.parts()[partIdx]]
            const nscore = masterScore.createScore()

            const ex = new Excerpt(masterScore)
            ex.setExcerptScore(nscore)
            nscore.setExcerpt(ex)
            masterScore.excerpts().push(ex)
            ex.setName(parts[0].longName())
            ex.setParts(parts)
            Excerpt.createExcerpt(ex)
            for (const v of hidden) {
                ex.setVoiceVisible(nscore.staff(0), v, false)
            }
        }
        // create first part
        createVoicesPart(0, [0])
        // create second part
        createVoicesPart(1, [0, 1, 2])
        // create second part
        createVoicesPart(1, [1, 2, 3])

        masterScore.setExcerptsChanged(true)

        saveCompareScore(masterScore, 'voices.mscx', 'voices-ref.mscx')
    })

    it('styleScore', () => {
        const score = open('partStyle.mscx')
        createParts(score, 2)
        score.style().set(Sid.clefLeftMargin, 4.0)
        saveCompareScore(score, 'partStyle-score-test.mscx', 'partStyle-score-ref.mscx')
    })

    it('styleScoreReload', () => {
        const partScore = open('partStyle-score-reload.mscx')
        saveCompareScore(partScore, 'partStyle-score-reload-test.mscx', 'partStyle-score-reload-ref.mscx')
    })

    it('partSpanners', () => testPartCreation('part-spanners'))

    it('partTies', () => {
        const test = 'linked-ties'
        const score = open(`${test}.mscx`)
        // createLinkedStaff
        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        const sourceStaff = score.staff(0)!
        const linkedStaff = Factory.createStaff(sourceStaff.part())
        linkedStaff.setPart(sourceStaff.part())
        score.undoInsertStaff(linkedStaff, 1, false)
        Excerpt.cloneStaff(sourceStaff, linkedStaff)
        score.endCmd()
        expect(score.staff(1)).toBeTruthy()

        saveCompareScore(score, `${test}-1.mscx`, `${test}-1.mscx`)
        createPart(score)
        saveCompareScore(score, `${test}-parts.mscx`, `${test}-parts.mscx`)
    })

    // TODO(port): EngravingItem::unlinkPropertyFromMaster etc. (properties of linked elements in parts)
    it.skip('partPropertyLinking', () => {
        const masterScore = open('partPropertyLinking.mscx')
        const partScore = createPart(masterScore)
        saveCompareScore(partScore, 'partPropertyLinking-part-0.mscx', 'partPropertyLinking-part-0.mscx')

        let dynamic: Dynamic | null = null
        const measure = masterScore.firstMeasure()!
        for (let segment = measure.first(); segment && !dynamic; segment = segment.next()) {
            for (const annotation of segment.annotations()) {
                if (annotation.isDynamic()) {
                    dynamic = annotation as Dynamic
                    break
                }
            }
        }
        const testItem = dynamic!.findLinkedInScore(partScore) as Dynamic
        expect(testItem).toBeTruthy()

        testItem.undoChangeProperty(Pid.PLACEMENT, PlacementV.ABOVE, PropertyFlags.NOSTYLE)
        testItem.undoChangeProperty(Pid.MUSICAL_SYMBOLS_SCALE, 1.2, PropertyFlags.NOSTYLE)
        expect(testItem.isPositionLinkedToMaster()).toBe(false)
        expect(testItem.isAppearanceLinkedToMaster()).toBe(false)

        saveCompareScore(partScore, 'partPropertyLinking-part-1.mscx', 'partPropertyLinking-part-1.mscx')

        testItem.undoChangeProperty(Pid.POSITION_LINKED_TO_MASTER, true, PropertyFlags.NOSTYLE)
        testItem.undoChangeProperty(Pid.APPEARANCE_LINKED_TO_MASTER, true, PropertyFlags.NOSTYLE)
        saveCompareScore(partScore, 'partPropertyLinking-part-0.mscx', 'partPropertyLinking-part-0.mscx')
    })

    it('partExclusion', () => {
        const masterScore = open('partExclusion.mscx')
        const partScore = createPart(masterScore)
        saveCompareScore(partScore, 'partExclusion-part-0.mscx', 'partExclusion-part-0.mscx')

        // Collect the relevant items
        const itemsToExclude: EngravingItem[] = []
        for (let mb = masterScore.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                itemsToExclude.push(mb)
                continue
            }
            for (let segment = (mb as import('../src/engraving/dom/measure').Measure).first(); segment; segment = segment.next()) {
                const item = segment.element(0)
                if (item && item.isClef() && !item.generated()) {
                    itemsToExclude.push(item)
                }
                for (const annotation of segment.annotations()) {
                    if (annotation.isTextBase()) {
                        itemsToExclude.push(annotation)
                    }
                }
            }
        }
        for (const spanner of masterScore.spanner()) {
            if (spanner.isOttava()) {
                itemsToExclude.push(spanner)
            }
        }

        const invert = (): void => {
            for (const item of itemsToExclude) {
                masterScore.select(item)
                const exclude = item.getProperty(Pid.EXCLUDE_FROM_OTHER_PARTS) as boolean
                item.undoChangeProperty(Pid.EXCLUDE_FROM_OTHER_PARTS, !exclude)
            }
        }
        // Invert exclusion property
        invert()
        // Excluded items are not in the part anymore and viceversa
        saveCompareScore(partScore, 'partExclusion-part-1.mscx', 'partExclusion-part-1.mscx')
    })

    // TODO(port): linked editing (Score::scoreList() in insertMeasure: the measures of the parts)
    it.skip('appendMeasure', () => {
        const score = open('part-all.mscx')
        createParts(score, 2)
        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        score.insertMeasure(ElementType.MEASURE, null)
        score.endCmd()
        saveCompareScore(score, 'part-all-appendmeasures.mscx', 'part-all-appendmeasures.mscx')
        score.undoRedo(true, null)
        saveCompareScore(score, 'part-all-uappendmeasures.mscx', 'part-all-uappendmeasures.mscx')
    })

    it.skip('insertMeasure', () => {
        const score = open('part-all.mscx')
        createParts(score, 2)
        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        score.insertMeasure(ElementType.MEASURE, score.firstMeasure())
        score.endCmd()
        saveCompareScore(score, 'part-all-insertmeasures.mscx', 'part-all-insertmeasures.mscx')
        score.undoRedo(true, null)
        saveCompareScore(score, 'part-all-uinsertmeasures.mscx', 'part-all-uinsertmeasures.mscx')
    })

    // ---- adding and removing elements in the score (the linked elements of the parts follow) ----

    const firstChord = (score: MasterScore): Chord =>
        score.firstMeasure()!.tick2segment(new Fraction(1, 4))!.element(0) as Chord

    const drop = (score: MasterScore, target: EngravingItem, e: EngravingItem): void => {
        const dd = new EditData()
        dd.dropElement = e
        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        target.drop(dd)
        score.endCmd() // does layout
    }

    const deleteSelected = (score: MasterScore, e: EngravingItem): void => {
        score.select(e)
        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        score.cmdDeleteSelection()
        score.setLayoutAll()
        score.endCmd()
    }

    const addRemoveTests = (name: string, doAdd: () => MasterScore, doRemove: () => MasterScore): void => {
        // TODO(port): linked editing (Score::undoAddElement adds the element to the linked staves of the parts)
        it.skip(`add${name}`, () => {
            const score = doAdd()
            saveCompareScore(score, `add-${name}.mscx`, `part-${name.toLowerCase()}-add.mscx`)
        })
        it(`undoAdd${name}`, () => {
            const score = doAdd()
            score.undoRedo(true, null)
            saveCompareScore(score, `uadd-${name}.mscx`, `part-${name.toLowerCase()}-uadd.mscx`)
        })
        it.skip(`undoRedoAdd${name}`, () => {
            const score = doAdd()
            score.undoRedo(true, null)
            score.undoRedo(false, null)
            saveCompareScore(score, `uradd-${name}.mscx`, `part-${name.toLowerCase()}-uradd.mscx`)
        })
        it(`remove${name}`, () => {
            const score = doRemove()
            saveCompareScore(score, `del-${name}.mscx`, `part-${name.toLowerCase()}-del.mscx`)
        })
        it(`undoRemove${name}`, () => {
            const score = doRemove()
            score.undoRedo(true, null)
            saveCompareScore(score, `udel-${name}.mscx`, `part-${name.toLowerCase()}-udel.mscx`)
        })
        it(`undoRedoRemove${name}`, () => {
            const score = doRemove()
            score.undoRedo(true, null)
            score.undoRedo(false, null)
            saveCompareScore(score, `urdel-${name}.mscx`, `part-${name.toLowerCase()}-urdel.mscx`)
        })
    }

    addRemoveTests('Breath', () => {
        const score = open('part-empty-parts.mscx')
        const note = firstChord(score).upNote()
        const b = Factory.createItem(ElementType.BREATH, score) as Breath
        b.setSymId(SymId.breathMarkComma)
        drop(score, note, b)
        return score
    }, () => {
        const score = open('part-breath-add.mscx')
        const s = score.firstMeasure()!.first()!.next(SegmentType.Breath)!
        deleteSelected(score, s.element(0)!)
        return score
    })

    addRemoveTests('Fingering', () => {
        const score = open('part-empty-parts.mscx')
        const note = firstChord(score).upNote()
        const b = Factory.createItem(ElementType.FINGERING, note) as TextBase
        b.setXmlText('3')
        drop(score, note, b)
        return score
    }, () => {
        const score = open('part-fingering-parts.mscx')
        const s = score.firstMeasure()!.first()!.next(SegmentType.ChordRest)!
        const note = (s.element(0) as Chord).upNote()
        deleteSelected(score, note.el().find(e => e.isFingering())!)
        return score
    })

    addRemoveTests('Symbol', () => {
        const score = open('part-empty-parts.mscx')
        const note = firstChord(score).upNote()
        const b = Factory.createItem(ElementType.SYMBOL, note) as SymbolItem
        b.setSym(SymId.gClef)
        drop(score, note, b)
        return score
    }, () => {
        const score = open('part-symbol-parts.mscx')
        const s = score.firstMeasure()!.first()!.next(SegmentType.ChordRest)!
        const note = (s.element(0) as Chord).upNote()
        deleteSelected(score, note.el().find(e => e.isSymbol())!)
        return score
    })

    addRemoveTests('Chordline', () => {
        const score = open('part-empty-parts.mscx')
        const chord = firstChord(score)
        const b = Factory.createItem(ElementType.CHORDLINE, chord) as ChordLine
        b.setChordLineType(ChordLineType.FALL)
        drop(score, chord.upNote(), b)
        return score
    }, () => {
        const score = open('part-chordline-parts.mscx')
        const s = score.firstMeasure()!.first()!.next(SegmentType.ChordRest)!
        const chord = s.element(0) as Chord
        deleteSelected(score, chord.el().find(e => e.isChordLine())!)
        return score
    })

    // TODO(port): linked editing (note input in a part is cloned to the score: undoAddCR with linked staves)
    it.skip('inputFromParts', () => {
        const score = open('input-from-parts.mscz')
        const staves = { Flute: 0, Oboe: 1, 'Clarinet in B♭': 2, Bassoon: 3 } as Record<string, number>
        const parts = new Map<string, Score>()
        for (const part of score.scoreList()) {
            parts.set(part.name(), part)
        }
        let i = 0
        for (const [name, voice] of [['Flute', 3], ['Oboe', 2], ['Clarinet in B♭', 1], ['Bassoon', 0]] as const) {
            const part = parts.get(name)!
            expect(part).toBeTruthy()
            let m = part.firstMeasure()!
            for (let k = 0; k < i; ++k) {
                m = m.nextMeasure()!
            }
            const partSegment = m.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))!
            part.setNoteRest(partSegment, voice, new NoteVal(60), new Fraction(1, 1))
            const scoreSegment = score.tick2segment(partSegment.tick(), true, SegmentType.ChordRest)!
            const chord = scoreSegment.element(staves[name] * 4 + voice)
            expect(chord && chord.isChord()).toBe(true)
            ++i
        }
    })

    it('createEmptyPart', () => {
        const score = open('part-empty.mscx')
        createEmptyPart(score)
        // Check that measures have correct ticks set
        for (const excerpt of score.excerpts()) {
            const excerptScore = excerpt.excerptScore()!
            for (let mb = excerptScore.first(); mb; mb = mb.next()) {
                if (mb.isMeasure()) {
                    expect(mb.ticks().gt(new Fraction(0, 1))).toBe(true)
                }
                if (mb.prev()) {
                    expect(mb.prev()!.endTick().eq(mb.tick())).toBe(true)
                }
            }
        }
    })
})

describe.skipIf(!existsSync(DATA))('creating parts (MasterScore.initAndAddExcerpt)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('creates parts from the score\'s parts, saves them in the .mscz and reads them back', () => {
        const score = loadScore(readFileSync(`${DATA}part-all.mscx`))
        layoutScore(score)
        const excerpts = Excerpt.createExcerptsFromParts(score.parts(), score)
        expect(excerpts.map(e => e.name())).toEqual(['Alto', 'Tenor'])

        score.startCmd(TranslatableString.untranslatable('Engraving parts tests'))
        for (const ex of excerpts) {
            score.initAndAddExcerpt(ex, false)
        }
        score.endCmd()
        expect(score.excerpts().length).toBe(2)
        const part = score.excerpts()[0].excerptScore()!
        expect(part.parts().length).toBe(1)
        expect(part.staff(0)!.links()).toContain(score.staff(0))
        expect(part.pages().length).toBeGreaterThan(0) // laid out
        expect(score.scoreList()).toEqual([score, part, score.excerpts()[1].excerptScore()])

        const reloaded = loadScore(saveMscz(score, 'part-all.mscz'))
        layoutScore(reloaded)
        expect(reloaded.excerpts().map(e => e.name())).toEqual(['Alto', 'Tenor'])
        expect(normalize(writeMscx(reloaded.excerpts()[0].excerptScore()!)))
            .toBe(normalize(writeMscx(part)))

        // undo removes the parts
        score.undoRedo(true, null)
        expect(score.excerpts().length).toBe(0)
        score.undoRedo(false, null)
        expect(score.excerpts().length).toBe(2)
    })

    it('clones a part score (Score.clone) and makes an empty part', () => {
        const score = loadScore(readFileSync(`${DATA}part-all.mscx`))
        layoutScore(score)
        const ex = Excerpt.createExcerptsFromParts([score.parts()[1]], score)[0]
        score.initAndAddExcerpt(ex, true)
        const copy = ex.excerptScore()!.clone()
        expect(copy).not.toBe(ex.excerptScore())
        expect(copy.excerpt()!.name()).toBe('Tenor')
        expect(score.excerpts().length).toBe(1) // the copy is not added
        expect(copy.staff(0)!.links()).toContain(score.staff(1))

        const empty = new Excerpt(score)
        empty.setName('Empty')
        empty.setExcerptScore(score.createScore())
        score.initEmptyExcerpt(empty)
        expect(empty.inited()).toBe(true)
        const countMeasures = (s: Score): number => {
            let n = 0
            for (let m = s.firstMeasure(); m; m = m.nextMeasure()) {
                ++n
            }
            return n
        }
        expect(countMeasures(empty.excerptScore()!)).toBe(countMeasures(score))
    })

    it('formats unique part names', () => {
        expect(formatUniqueExcerptName('Flute', ['flute', 'flute (1)'])).toBe('Flute (2)')
        expect(formatUniqueExcerptName('Oboe', ['flute'])).toBe('Oboe')
    })
})
