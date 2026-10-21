// SPDX-License-Identifier: GPL-3.0-only
// New scores (NotationProject::createNew / loadTemplate): from instruments and from the templates of MuseScore.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    KEY_ATONAL, createScore, defaultNewScoreOptions, instrumentGenres, instrumentGroupList, instrumentSortingIndex,
    isScoreOrder, pageCount, scoreOrders, type MasterScore, type NewScoreOptions,
} from '../src/index'
import { BracketType, ClefType, ElementType, Key, StaffGroup, TextStyleType } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { TimeSigType, type TimeSig } from '../src/engraving/dom/timesig'
import type { KeySig } from '../src/engraving/dom/keysig'
import type { Rest } from '../src/engraving/dom/rest'
import type { TempoText } from '../src/engraving/dom/tempotext'
import { Fraction } from '../src/engraving/types/fraction'
import { ROOT, hasSubmodule, initFonts } from './helpers'

const TEMPLATES = `${ROOT}MuseScore/share/templates`

function options(o: Partial<NewScoreOptions>): NewScoreOptions {
    return { ...defaultNewScoreOptions(), ...o }
}

function timeSig(score: MasterScore, staffIdx: number): TimeSig | null {
    const seg = score.firstMeasure()!.findSegment(SegmentType.TimeSig, new Fraction(0, 1))
    return seg ? seg.element(staffIdx * 4) as TimeSig | null : null
}

function keySig(score: MasterScore, staffIdx: number): KeySig | null {
    const seg = score.firstMeasure()!.findSegment(SegmentType.KeySig, new Fraction(0, 1))
    return seg ? seg.element(staffIdx * 4) as KeySig | null : null
}

function measureCount(score: MasterScore): number {
    let n = 0
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        ++n
    }
    return n
}

describe('new score', () => {
    beforeAll(initFonts)

    it('lists instruments, genres and orders', () => {
        const groups = instrumentGroupList()
        expect(groups.length).toBeGreaterThan(5)
        expect(groups[0].id).toBe('woodwinds')
        expect(groups[0].name).toBe('Woodwinds')
        const all = groups.flatMap(g => g.templates)
        const clarinet = all.find(t => t.id === 'bb-clarinet')!
        expect(clarinet.trait).toEqual({ type: 'transposition', name: 'B♭', isDefault: true, isHiddenOnScore: false })
        expect(clarinet.familyId).toBe('clarinets')
        expect(clarinet.genres).toContain('orchestra')
        expect(clarinet.description).toContain('clarinet')
        expect(all.find(t => t.id === 'piano')!.staffCount).toBe(2)
        expect(instrumentGenres().map(g => g.id)).toContain('common')
        expect(scoreOrders().map(o => o.id)).toEqual(expect.arrayContaining(['orchestra', 'marching-band', 'choir']))
        // flutes are sorted before the piano (keyboards), soloists after the keyboards and before the strings
        expect(instrumentSortingIndex('orchestra', 'flute', false)).toBeLessThan(instrumentSortingIndex('orchestra', 'piano', false))
        expect(instrumentSortingIndex('orchestra', 'violin', true)).toBeGreaterThan(instrumentSortingIndex('orchestra', 'piano', false))
        expect(instrumentSortingIndex('orchestra', 'violin', true)).toBeLessThan(instrumentSortingIndex('orchestra', 'violin', false))
        expect(isScoreOrder('orchestra', [1, 2, 2])).toBe(true)
        expect(isScoreOrder('orchestra', [2, 1])).toBe(false)
        expect(isScoreOrder('custom', [2, 1])).toBe(true)
    })

    it('creates a score from instruments (flute + piano, orchestral order)', () => {
        const score = createScore(options({
            title: 'My Title', composer: 'Composer', order: 'orchestra',
            instruments: [{ id: 'flute' }, { id: 'piano' }],
        }))
        expect(score.parts().map(p => p.partName())).toEqual(['Flute', 'Piano'])
        expect(score.nstaves()).toBe(3)
        expect(measureCount(score)).toBe(32)
        expect(score.first()!.isVBox()).toBe(true)
        expect(score.getText(TextStyleType.TITLE)!.plainText()).toBe('My Title')
        expect(score.getText(TextStyleType.COMPOSER)!.plainText()).toBe('Composer')
        expect(score.staff(1)!.defaultClefType().concertClef).toBe(ClefType.G)
        expect(score.staff(2)!.defaultClefType().concertClef).toBe(ClefType.F)
        // the piano brace of the template, no bracket for the single flute
        expect(score.staff(1)!.bracketType(0)).toBe(BracketType.BRACE)
        expect(score.staff(1)!.bracketSpan(0)).toBe(2)
        expect(score.staff(0)!.bracketType(0)).toBe(BracketType.NO_BRACKET)
        expect(score.staff(1)!.barLineSpan()).toBe(true)
        expect(timeSig(score, 0)!.sig().identical(new Fraction(4, 4))).toBe(true)
        expect(pageCount(score)).toBe(1)
        const rest = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as Rest
        expect(rest.isRest()).toBe(true)
        expect(rest.ticks().identical(new Fraction(4, 4))).toBe(true)
    })

    it('brackets the woodwind section and numbers instruments', () => {
        const score = createScore(options({ order: 'orchestra', instruments: [{ id: 'flute' }, { id: 'flute' }, { id: 'oboe' }] }))
        expect(score.parts().map(p => p.longName())).toEqual(['Flute 1', 'Flute 2', 'Oboe'])
        expect(score.staff(0)!.bracketType(0)).toBe(BracketType.NORMAL)
        expect(score.staff(0)!.bracketSpan(0)).toBe(3)
        // the thin bracket is added first (column 1); adding the thick bracket at column 0 moves it outwards
        // (Score::undoAddBracket -> BracketItem BRACKET_COLUMN -> Staff::changeBracketColumn)
        expect(score.staff(0)!.bracketType(2)).toBe(BracketType.SQUARE)
        expect(score.staff(0)!.bracketSpan(2)).toBe(2)
        expect(score.staff(0)!.barLineSpan()).toBe(true)
        // the custom order sets no brackets
        const custom = createScore(options({ order: 'custom', instruments: [{ id: 'flute' }, { id: 'oboe' }] }))
        expect(custom.staff(0)!.bracketType(0)).toBe(BracketType.NO_BRACKET)
    })

    it('transposes the key signature of a B♭ clarinet, time signature, pickup, tempo', () => {
        const score = createScore(options({
            instruments: [{ id: 'bb-clarinet' }, { id: 'violin' }],
            key: Key.D, timesig: { numerator: 3, denominator: 4 }, measures: 8,
            pickup: { numerator: 1, denominator: 4 }, tempo: { bpm: 90, duration: 'half', dot: true },
        }))
        expect(score.parts()[0].longName()).toBe('Clarinet in B♭')
        expect(measureCount(score)).toBe(9)
        const pickup = score.firstMeasure()!
        expect(pickup.ticks().identical(new Fraction(1, 4))).toBe(true)
        expect(pickup.timesig().identical(new Fraction(3, 4))).toBe(true)
        expect(pickup.isIrregular()).toBe(true)
        expect(pickup.nextMeasure()!.ticks().identical(new Fraction(3, 4))).toBe(true)
        expect(timeSig(score, 1)!.sig().identical(new Fraction(3, 4))).toBe(true)
        expect(keySig(score, 0)!.key()).toBe(Key.E) // D concert -> E for the clarinet
        expect(keySig(score, 0)!.concertKey()).toBe(Key.D)
        expect(keySig(score, 1)!.key()).toBe(Key.D)
        expect(score.staff(0)!.key(new Fraction(4, 4))).toBe(Key.E)
        const tempo = pickup.first(SegmentType.ChordRest)!.annotations().find(a => a.type() === ElementType.TEMPO_TEXT) as TempoText
        expect(tempo.xmlText()).toBe('<sym>metNoteHalfUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = 90')
        expect(tempo.tempo()).toBeCloseTo(270 / 60)
        expect(score.sigmap().timesig(0).timesig().identical(new Fraction(1, 4))).toBe(true)
        expect(score.sigmap().timesig(480).nominal().identical(new Fraction(3, 4))).toBe(true)
    })

    it('creates common time, atonal keys, a drum set and guitar tablature', () => {
        const score = createScore(options({
            instruments: [{ id: 'drumset' }, { id: 'guitar-steel-tablature' }, { id: 'flute' }],
            key: KEY_ATONAL, timesigType: 'common', measures: 4,
        }))
        expect(timeSig(score, 0)!.timeSigType()).toBe(TimeSigType.FOUR_FOUR)
        expect(score.staff(0)!.part().instrument().useDrumset()).toBe(true)
        expect(score.staff(0)!.staffType().group()).toBe(StaffGroup.PERCUSSION)
        expect(score.staff(0)!.lines(new Fraction(0, 1))).toBe(5)
        expect(score.staff(1)!.staffType().group()).toBe(StaffGroup.TAB)
        expect(score.staff(1)!.lines(new Fraction(0, 1))).toBe(6)
        expect(score.staff(1)!.part().instrument().stringData().strings()).toBe(6)
        expect(keySig(score, 2)!.keySigEvent().isAtonal()).toBe(true)
        expect(measureCount(score)).toBe(4)
    })

    it('is deterministic', () => {
        const o = options({ title: 'T', instruments: [{ id: 'piano' }], measures: 3 })
        const a = createScore(o)
        const b = createScore(JSON.parse(JSON.stringify(o)) as NewScoreOptions)
        expect(a.pages()[0].ldata().bbox().equals(b.pages()[0].ldata().bbox())).toBe(true)
        expect(a.systems().map(s => s.ldata().bbox().height())).toEqual(b.systems().map(s => s.ldata().bbox().height()))
    })
})

describe.runIf(hasSubmodule)('new score from templates', () => {
    beforeAll(initFonts)

    const files = hasSubmodule
        ? execFileSync('find', [TEMPLATES, '-name', '*.mscx']).toString().trim().split('\n').sort()
        : []

    it.each(files.map(f => [f.slice(TEMPLATES.length + 1), f]))('%s', (_name, file) => {
        const style = join(dirname(file), 'score_style.mss')
        const score = createScore(options({
            templateMscx: readFileSync(file, 'utf8'),
            templateStyle: existsSync(style) ? readFileSync(style, 'utf8') : undefined,
            measures: 10, pickup: { numerator: 1, denominator: 8 },
        }))
        expect(measureCount(score)).toBe(11)
        expect(score.firstMeasure()!.ticks().identical(new Fraction(1, 8))).toBe(true)
        expect(score.nstaves()).toBeGreaterThan(0)
        expect(pageCount(score)).toBeGreaterThan(0)
    })

    it('keeps the template title frame settings and replaces the measures (String Quartet)', () => {
        const file = `${TEMPLATES}/03-Chamber_Music/01-String_Quartet/01-String_Quartet.mscx`
        const score = createScore(options({ templateMscx: readFileSync(file, 'utf8'), title: 'Quartet' }))
        expect(score.first()!.isVBox()).toBe(true)
        expect(score.getText(TextStyleType.TITLE)!.plainText()).toBe('Quartet')
        expect(measureCount(score)).toBe(32)
        expect(score.parts().map(p => p.longName())).toEqual(['Violin I', 'Violin II', 'Viola', 'Violoncello'])
        expect(score.scoreOrder().id).toBe('string-ensemble')
        // without a title there is no title frame
        const untitled = createScore(options({ templateMscx: readFileSync(file, 'utf8') }))
        expect(untitled.first()!.isMeasure()).toBe(true)
    })
})
