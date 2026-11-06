/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The comparison of two scores (not in MuseScore): like a text diff, the measures of the compared instruments are
 * aligned (the longest common subsequence of their contents, so inserted and deleted measures are found), and within
 * two aligned measures that differ, the elements (notes, rests, chords, articulations, lyrics, texts, dynamics, clefs,
 * key and time signatures, slurs, hairpins, ...) of one score that the other one does not have are marked.
 * The result only refers to the elements, not to their layout: it stays valid when the scores are laid out again
 * (another view mode or width).
 */

import type { Score } from '../engraving/dom/score'
import type { Measure } from '../engraving/dom/measure'
import type { Segment } from '../engraving/dom/segment'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Chord } from '../engraving/dom/chord'
import type { ChordRest } from '../engraving/dom/chordrest'
import type { Note } from '../engraving/dom/note'
import type { Lyrics } from '../engraving/dom/lyrics'
import type { TextBase } from '../engraving/dom/textbase'
import type { KeySig } from '../engraving/dom/keysig'
import type { TimeSig } from '../engraving/dom/timesig'
import type { Clef } from '../engraving/dom/clef'
import type { Articulation } from '../engraving/dom/articulation'
import type { Spanner } from '../engraving/dom/spanner'
import { SegmentType } from '../engraving/dom/segment'
import { VOICES } from '../engraving/types/types'

/** one instrument (part) of a score */
export interface DiffInstrument {
    /** index in the score's parts */
    index: number
    /** the instrument's name (the part name, else the long name) */
    name: string
    /** MuseScore's instrument id (e.g. "piano") */
    instrumentId: string
    staves: number
    /** the part is shown in the score (not hidden in the Layout panel) */
    visible: boolean
}

/** the instruments compared with each other: part index of score A -> part index of score B */
export interface DiffInstrumentPair {
    a: number
    b: number
}

/** the marks of one score: its elements the other score does not have, and the measures (per staff) that differ */
export interface DiffSideMarks {
    /** the elements the other score does not have */
    readonly items: ReadonlySet<EngravingItem>
    /** measure -> staff indices of the compared staves that differ in it (all compared staves of an inserted measure) */
    readonly measures: ReadonlyMap<Measure, readonly number[]>
}

/** a difference: one aligned pair of measures that differ, or measures only one of the scores has */
export interface DiffHunk {
    /** the measures of score A (empty: inserted in B) */
    a: Measure[]
    /** the measures of score B (empty: deleted in B) */
    b: Measure[]
}

export interface ScoreDiffResult {
    a: DiffSideMarks
    b: DiffSideMarks
    hunks: DiffHunk[]
    /** the staves compared: [staff index in A, staff index in B] */
    staves: [number, number][]
}

export function diffInstruments(score: Score): DiffInstrument[] {
    return score.parts().map((p, index) => ({
        index,
        name: plain(p.partName() || p.longName() || p.instrumentId()),
        instrumentId: p.instrumentId(),
        staves: p.nstaves(),
        visible: p.show(),
    }))
}

function plain(s: string): string {
    return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

/**
 * The pairs of instruments compared by default: the visible instruments with the same instrument id (else the same
 * name), in the order of score A; then the remaining ones in order if both scores have the same number left.
 */
export function defaultInstrumentPairs(a: Score, b: Score): DiffInstrumentPair[] {
    const ia = diffInstruments(a).filter(i => i.visible)
    const ib = diffInstruments(b).filter(i => i.visible)
    const pairs: DiffInstrumentPair[] = []
    const usedB = new Set<number>()
    const unmatchedA: DiffInstrument[] = []
    for (const x of ia) {
        const y = ib.find(i => !usedB.has(i.index) && i.instrumentId === x.instrumentId && i.name === x.name)
            ?? ib.find(i => !usedB.has(i.index) && i.instrumentId === x.instrumentId)
            ?? ib.find(i => !usedB.has(i.index) && i.name === x.name)
        if (y) {
            pairs.push({ a: x.index, b: y.index })
            usedB.add(y.index)
        } else {
            unmatchedA.push(x)
        }
    }
    const unmatchedB = ib.filter(i => !usedB.has(i.index))
    if (unmatchedA.length && unmatchedA.length === unmatchedB.length) {
        unmatchedA.forEach((x, i) => pairs.push({ a: x.index, b: unmatchedB[i].index }))
    }
    return pairs.sort((p, q) => p.a - q.a)
}

/** true if both scores have the same visible instruments (the default pairs compare all of them, in the same order) */
export function sameInstruments(a: Score, b: Score): boolean {
    const ia = diffInstruments(a).filter(i => i.visible)
    const ib = diffInstruments(b).filter(i => i.visible)
    if (ia.length !== ib.length) {
        return false
    }
    return ia.every((x, i) => x.instrumentId === ib[i].instrumentId && x.name === ib[i].name && x.staves === ib[i].staves)
}

// ---------------------------------------------------------------------------------------------------------------------
//   the tokens of a measure: a string per element that is equal for equal elements
// ---------------------------------------------------------------------------------------------------------------------

interface Token {
    key: string
    item: EngravingItem
}

function textOf(e: EngravingItem): string {
    return e.isTextBase() ? (e as unknown as TextBase).plainText() : ''
}

function durationKey(cr: ChordRest): string {
    const d = cr.durationType()
    const t = cr.tuplet()
    return `${d.type()}.${d.dots()}${t ? `/${t.ratio().numerator()}:${t.ratio().denominator()}` : ''}:${cr.ticks().ticks()}`
}

function chordTokens(c: Chord, prefix: string, out: Token[]): void {
    out.push({ key: `${prefix}|chord|${durationKey(c)}|${c.noteType()}`, item: c })
    for (const n of c.notes() as Note[]) {
        out.push({ key: `${prefix}|note|${n.pitch()}|${n.tpc()}|${n.tieFor() ? 't' : ''}|${n.headGroup()}|${n.string()}/${n.fret()}`, item: n })
        for (const e of n.el()) {
            if (e.isTextBase() || e.isSymbol?.()) {
                out.push({ key: `${prefix}|note-el|${n.pitch()}|${e.typeName()}|${e.subtype()}|${textOf(e)}`, item: e })
            }
        }
    }
    for (const a of c.articulations() as Articulation[]) {
        out.push({ key: `${prefix}|artic|${a.symId()}`, item: a })
    }
    c.graceNotes().forEach((g, i) => chordTokens(g, `${prefix}|grace${i}`, out))
}

function chordRestTokens(cr: ChordRest, prefix: string, out: Token[]): void {
    if (cr.isChord()) {
        chordTokens(cr as unknown as Chord, prefix, out)
    } else {
        out.push({ key: `${prefix}|${cr.typeName()}|${durationKey(cr)}|${cr.visible() ? '' : 'invisible'}`, item: cr })
    }
    for (const l of cr.lyrics() as Lyrics[]) {
        out.push({ key: `${prefix}|lyrics|${l.verse()}|${l.plainText()}|${l.syllabic?.() ?? ''}`, item: l })
    }
}

function segmentElementKey(e: EngravingItem): string {
    if (e.isKeySig()) {
        return `keysig|${(e as unknown as KeySig).key()}`
    }
    if (e.isTimeSig()) {
        return `timesig|${(e as unknown as TimeSig).sig().toString()}`
    }
    if (e.isClef()) {
        return `clef|${(e as unknown as Clef).clefType()}`
    }
    return `${e.typeName()}|${e.subtype()}|${textOf(e)}`
}

/** the tokens of one staff of a measure (positions relative to the measure) */
function measureStaffTokens(score: Score, m: Measure, staffIdx: number): Token[] {
    const out: Token[] = []
    const mtick = m.tick().ticks()
    for (let s: Segment | null = m.first(); s; s = s.next()) {
        const st = s.segmentType()
        if (st & (SegmentType.BarLineType | SegmentType.TimeTick)) {
            continue
        }
        const rt = s.tick().ticks() - mtick
        for (let v = 0; v < VOICES; ++v) {
            const e = s.element(staffIdx * VOICES + v)
            if (!e || e.generated()) {
                continue
            }
            const prefix = `${rt}|${v}`
            if (st === SegmentType.ChordRest) {
                chordRestTokens(e as unknown as ChordRest, prefix, out)
            } else {
                out.push({ key: `${rt}|${segmentElementKey(e)}`, item: e })
            }
        }
        for (const a of s.annotations()) {
            if (a.staffIdx() !== staffIdx || a.generated()) {
                continue
            }
            out.push({ key: `${rt}|${a.track() % VOICES}|${a.typeName()}|${a.subtype()}|${textOf(a)}`, item: a })
        }
    }
    for (const sp of score.spannerMap().findOverlapping(mtick, mtick + m.ticks().ticks() - 1) as Spanner[]) {
        const t = sp.tick().ticks()
        if (t < mtick || t >= mtick + m.ticks().ticks() || sp.staffIdx() !== staffIdx || sp.isTie?.()) {
            continue
        }
        out.push({ key: `${t - mtick}|${sp.track() % VOICES}|span|${sp.typeName()}|${sp.subtype()}|${sp.ticks().ticks()}`, item: sp })
    }
    return out
}

function measureKey(m: Measure): string {
    return `${m.ticks().ticks()}|${m.timesig().numerator()}/${m.timesig().denominator()}`
}

// ---------------------------------------------------------------------------------------------------------------------
//   the comparison
// ---------------------------------------------------------------------------------------------------------------------

/** the staves of the instrument pairs: [staff index in A, staff index in B] */
function comparedStaves(a: Score, b: Score, pairs: readonly DiffInstrumentPair[]): [number, number][] {
    const staves: [number, number][] = []
    for (const p of pairs) {
        const pa = a.parts()[p.a]
        const pb = b.parts()[p.b]
        if (!pa || !pb) {
            continue
        }
        const n = Math.min(pa.nstaves(), pb.nstaves())
        for (let i = 0; i < n; ++i) {
            staves.push([pa.staff(i)!.idx(), pb.staff(i)!.idx()])
        }
    }
    return staves
}

function measures(score: Score): Measure[] {
    const list: Measure[] = []
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        list.push(m)
    }
    return list
}

/** the longest common subsequence of two key lists: the index pairs of the equal entries */
function lcs(x: readonly string[], y: readonly string[]): [number, number][] {
    // common prefix and suffix first (the usual case: few changes)
    let start = 0
    while (start < x.length && start < y.length && x[start] === y[start]) {
        ++start
    }
    let endX = x.length
    let endY = y.length
    while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
        --endX
        --endY
    }
    const result: [number, number][] = []
    for (let i = 0; i < start; ++i) {
        result.push([i, i])
    }
    const n = endX - start
    const k = endY - start
    if (n > 0 && k > 0) {
        if (n * k > 25_000_000) {
            // too large for the table: pair the remaining measures by position
        } else {
            const table = new Uint32Array((n + 1) * (k + 1))
            const at = (i: number, j: number): number => i * (k + 1) + j
            for (let i = n - 1; i >= 0; --i) {
                for (let j = k - 1; j >= 0; --j) {
                    table[at(i, j)] = x[start + i] === y[start + j] ? table[at(i + 1, j + 1)] + 1
                        : Math.max(table[at(i + 1, j)], table[at(i, j + 1)])
                }
            }
            let i = 0
            let j = 0
            while (i < n && j < k) {
                if (x[start + i] === y[start + j]) {
                    result.push([start + i, start + j])
                    ++i
                    ++j
                } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
                    ++i
                } else {
                    ++j
                }
            }
        }
    }
    for (let i = 0; i < x.length - endX; ++i) {
        result.push([endX + i, endY + i])
    }
    return result
}

class SideMarks implements DiffSideMarks {
    readonly items = new Set<EngravingItem>()
    readonly measures = new Map<Measure, number[]>()

    markMeasure(m: Measure, staffIdx: number): void {
        const list = this.measures.get(m)
        if (!list) {
            this.measures.set(m, [staffIdx])
        } else if (!list.includes(staffIdx)) {
            list.push(staffIdx)
        }
    }
}

/**
 * Compares the instrument pairs of two laid out (or at least loaded) scores. The measures are aligned by their
 * contents in all compared staves; aligned measures that differ (and the measures between two aligned ones, paired by
 * position) are compared element by element, the other measures are inserted or deleted.
 */
export function compareScores(a: Score, b: Score, pairs: readonly DiffInstrumentPair[]): ScoreDiffResult {
    const staves = comparedStaves(a, b, pairs)
    const ma = measures(a)
    const mb = measures(b)
    const tokensA = ma.map(m => staves.map(([sa]) => measureStaffTokens(a, m, sa)))
    const tokensB = mb.map(m => staves.map(([, sb]) => measureStaffTokens(b, m, sb)))
    const keyOf = (m: Measure, tokens: Token[][]): string =>
        measureKey(m) + '\n' + tokens.map(t => t.map(x => x.key).sort().join('\n')).join('\n--\n')
    const keysA = ma.map((m, i) => keyOf(m, tokensA[i]))
    const keysB = mb.map((m, i) => keyOf(m, tokensB[i]))

    const marksA = new SideMarks()
    const marksB = new SideMarks()
    const hunks: DiffHunk[] = []

    const compareMeasures = (i: number, j: number): boolean => {
        let differs = measureKey(ma[i]) !== measureKey(mb[j])
        staves.forEach(([sa, sb], k) => {
            const ta = tokensA[i][k]
            const tb = tokensB[j][k]
            const pool = new Map<string, Token[]>()
            for (const t of tb) {
                const list = pool.get(t.key)
                if (list) {
                    list.push(t)
                } else {
                    pool.set(t.key, [t])
                }
            }
            let staffDiffers = false
            for (const t of ta) {
                const list = pool.get(t.key)
                if (list?.length) {
                    list.shift()
                } else {
                    marksA.items.add(t.item)
                    staffDiffers = true
                }
            }
            for (const list of pool.values()) {
                for (const t of list) {
                    marksB.items.add(t.item)
                    staffDiffers = true
                }
            }
            if (staffDiffers) {
                marksA.markMeasure(ma[i], sa)
                marksB.markMeasure(mb[j], sb)
                differs = true
            }
        })
        if (differs && !staves.length) {
            return false
        }
        if (differs && !marksA.measures.has(ma[i])) {
            // only the length of the measure differs: all compared staves
            staves.forEach(([sa, sb]) => {
                marksA.markMeasure(ma[i], sa)
                marksB.markMeasure(mb[j], sb)
            })
        }
        return differs
    }
    const insertMeasure = (side: SideMarks, m: Measure, tokens: Token[][], staffOf: (k: number) => number): void => {
        tokens.forEach((list, k) => {
            side.markMeasure(m, staffOf(k))
            for (const t of list) {
                side.items.add(t.item)
            }
        })
    }

    // the gaps between the aligned measures: paired by position, the rest is inserted/deleted
    const matches = lcs(keysA, keysB)
    let pi = 0
    let pj = 0
    const gap = (endI: number, endJ: number): void => {
        const hunk: DiffHunk = { a: [], b: [] }
        const flush = (): void => {
            if (hunk.a.length || hunk.b.length) {
                hunks.push({ a: [...hunk.a], b: [...hunk.b] })
                hunk.a.length = hunk.b.length = 0
            }
        }
        while (pi < endI && pj < endJ) {
            if (compareMeasures(pi, pj)) {
                hunk.a.push(ma[pi])
                hunk.b.push(mb[pj])
            } else {
                flush()
            }
            ++pi
            ++pj
        }
        for (; pi < endI; ++pi) {
            insertMeasure(marksA, ma[pi], tokensA[pi], k => staves[k][0])
            hunk.a.push(ma[pi])
        }
        for (; pj < endJ; ++pj) {
            insertMeasure(marksB, mb[pj], tokensB[pj], k => staves[k][1])
            hunk.b.push(mb[pj])
        }
        flush()
    }
    for (const [i, j] of matches) {
        gap(i, j)
        pi = i + 1
        pj = j + 1
    }
    gap(ma.length, mb.length)

    return { a: marksA, b: marksB, hunks, staves }
}

/** shows only the given instruments of a score (and restores the visibility of the others with `null`) */
export function showOnlyInstruments(score: Score, parts: readonly number[] | null, original: readonly boolean[]): void {
    score.parts().forEach((p, i) => p.setShow(parts ? parts.includes(i) : original[i] ?? true))
}
