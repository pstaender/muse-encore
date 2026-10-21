// SPDX-License-Identifier: GPL-3.0-only
// Time signature changes that rewrite the measures (Score::cmdAddTimeSig -> Score::rewriteMeasures, ScoreRange/TrackList
// of range.cpp): the music is copied into measures of the new length (notes split and tied at the new barlines,
// tuplets, ties into/out of the range, measure rests), local (one staff) time signatures, errors roll the command back;
// undo restores the rendering of all pages, redo repeats it.
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import {
    applyPaletteElement, createPaletteElement, createScore, defaultNewScoreOptions, loadScore, type MasterScore,
} from '../src/index'
import { BarLineType, DurationType, ElementType } from '../src/engraving/types/types'
import { Sid } from '../src/engraving/style/styledef'
import { Factory } from '../src/engraving/dom/factory'
import { scoreDummy } from '../src/engraving/compat/dummyelement'
import type { Slur } from '../src/engraving/dom/slur'
import { Fraction } from '../src/engraving/types/fraction'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { MScore, MsError } from '../src/engraving/dom/mscore'
import type { Chord } from '../src/engraving/dom/chord'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import type { Measure } from '../src/engraving/dom/measure'
import type { TimeSig } from '../src/engraving/dom/timesig'
import { VTEST, hasSubmodule, initFonts, openScore, scoreHash } from './helpers'

// ---------------------------------------------------------------------------------------------------------------------
//   test scores: a small text notation turned into a 4.x .mscx file
//   measure: space separated items; "C4:1/4" note, "C4+E4:1/2" chord, "~" after the pitches ties to the next chord,
//   "r:1/4" rest, "R" measure rest, "3[C4:1/8 D4:1/8 E4:1/8]" triplet; voices of a measure separated by " | "
// ---------------------------------------------------------------------------------------------------------------------

const STEPS: Record<string, [number, number]> = { C: [0, 14], D: [2, 16], E: [4, 18], F: [5, 13], G: [7, 15], A: [9, 17], B: [11, 19] }

function pitchOf(name: string): { pitch: number; tpc: number } {
    const [semi, tpc] = STEPS[name[0]]
    return { pitch: 12 * (Number(name.slice(1)) + 1) + semi, tpc }
}

const DURATION_NAMES: Record<string, string> = { '1/1': 'whole', '1/2': 'half', '1/4': 'quarter', '1/8': 'eighth', '1/16': '16th' }

function durationXml(d: string): string {
    const [n, den] = d.split('/').map(Number)
    const f = new Fraction(n, den).reduced()
    const plain = DURATION_NAMES[`${f.numerator()}/${f.denominator()}`]
    if (plain) {
        return `<durationType>${plain}</durationType>`
    }
    // dotted
    const base = new Fraction(f.numerator(), f.denominator()).times(new Fraction(2, 3)).reduced()
    return `<durationType>${DURATION_NAMES[`${base.numerator()}/${base.denominator()}`]}</durationType><dots>1</dots>`
}

interface Item { xml: (tieNext: string, tiePrev: string) => string; ticks: Fraction; tied: boolean; pitches: string[]; measureLevel?: boolean }

/** the actual length of a measure: "@len=1/4" (pickup measure) */
function measureLenAttr(text: string): Fraction | null {
    const m = /@len=(\d+)\/(\d+)/.exec(text)
    return m ? new Fraction(Number(m[1]), Number(m[2])) : null
}

function parseMeasure(text: string, nominal: Fraction): Item[][] {
    const measureLen = measureLenAttr(text) ?? nominal
    text = text.replace(/@len=\S+\s*/, '')
    return text.split(' | ').map(voiceText => {
        const items: Item[] = []
        const tokens = voiceText.trim().match(/\d\[[^\]]*\]|\S+/g) ?? []
        for (const tok of tokens) {
            // raw xml ("_" = space): "{{...}}" in the measure, "{...}" in the voice
            if (tok.startsWith('{')) {
                const measureLevel = tok.startsWith('{{')
                const raw = tok.slice(measureLevel ? 2 : 1, measureLevel ? -2 : -1).replaceAll('_', ' ')
                items.push({ xml: () => raw, ticks: new Fraction(0, 1), tied: false, pitches: [], measureLevel })
                continue
            }
            if (tok === 'R') {
                items.push({ xml: () => `<Rest><durationType>measure</durationType><duration>${measureLen.numerator()}/${measureLen.denominator()}</duration></Rest>`, ticks: measureLen, tied: false, pitches: [] })
                continue
            }
            const tm = /^(\d)\[(.*)\]$/.exec(tok)
            if (tm) {
                const actual = Number(tm[1])
                const inner = tm[2].split(' ')
                const base = inner[0].split(':')[1]
                const [bn, bd] = base.split('/').map(Number)
                const normal = actual === 3 ? 2 : actual - 1
                let xml = `<Tuplet><normalNotes>${normal}</normalNotes><actualNotes>${actual}</actualNotes>${durationXml(base).replace('durationType', 'baseNote').replace('durationType', 'baseNote')}<Number><text>${actual}</text></Number></Tuplet>`
                for (const t of inner) {
                    const [p, d] = t.split(':')
                    xml += p === 'r' ? `<Rest>${durationXml(d)}</Rest>` : `<Chord>${durationXml(d)}${p.split('+').map(n => {
                        const { pitch, tpc } = pitchOf(n)
                        return `<Note><pitch>${pitch}</pitch><tpc>${tpc}</tpc></Note>`
                    }).join('')}</Chord>`
                }
                xml += '<endTuplet/>'
                items.push({ xml: () => xml, ticks: new Fraction(bn * normal, bd), tied: false, pitches: [] })
                continue
            }
            const [p, d] = tok.split(':')
            const [n, den] = d.split('/').map(Number)
            if (p === 'r') {
                items.push({ xml: () => `<Rest>${durationXml(d)}</Rest>`, ticks: new Fraction(n, den), tied: false, pitches: [] })
                continue
            }
            const tied = p.endsWith('~')
            const pitches = p.replace('~', '').split('+')
            items.push({
                xml: (tieNext, tiePrev) => `<Chord>${durationXml(d)}${pitches.map(name => {
                    const { pitch, tpc } = pitchOf(name)
                    return `<Note>${tieNext}${tiePrev}<pitch>${pitch}</pitch><tpc>${tpc}</tpc></Note>`
                }).join('')}</Chord>`,
                ticks: new Fraction(n, den), tied, pitches,
            })
        }
        return items
    })
}

/** a 4.x .mscx with the given staves (lists of measures); measures of the time signature sig */
function makeMscx(staves: string[][], sig: [number, number] = [4, 4], instrument = 'piano'): string {
    const measureLen = new Fraction(sig[0], sig[1])
    const loc = (m1: number, f1: Fraction, m2: number, f2: Fraction): string => {
        const fr = f2.minus(f1).reduced()
        return `<location>${m2 !== m1 ? `<measures>${m2 - m1}</measures>` : ''}${fr.isZero() ? '' : `<fractions>${fr.numerator()}/${fr.denominator()}</fractions>`}</location>`
    }
    let parts = ''
    let staffXml = ''
    staves.forEach((measures, si) => {
        parts += `<Staff id="${si + 1}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`
        let x = `<Staff id="${si + 1}">`
        const parsed = measures.map(m => parseMeasure(m, measureLen))
        parsed.forEach((voices, mi) => {
            const len = measureLenAttr(measures[mi])
            x += len ? `<Measure len="${len.numerator()}/${len.denominator()}">` : '<Measure>'
            for (const it of voices.flat()) {
                if (it.measureLevel) {
                    x += it.xml('', '')
                }
            }
            voices.forEach((allItems, vi) => {
                const items = allItems.filter(it => !it.measureLevel)
                x += '<voice>'
                if (mi === 0 && vi === 0) {
                    x += `<KeySig><concertKey>0</concertKey></KeySig><TimeSig><sigN>${sig[0]}</sigN><sigD>${sig[1]}</sigD></TimeSig>`
                }
                let pos = new Fraction(0, 1)
                items.forEach((it, ii) => {
                    // tie to the next chord of this voice (same measure or first chord of the next measure)
                    let next: { m: number; f: Fraction } | null = null
                    if (it.tied) {
                        next = ii + 1 < items.length ? { m: mi, f: pos.plus(it.ticks) } : { m: mi + 1, f: new Fraction(0, 1) }
                    }
                    const tieNext = next ? `<Spanner type="Tie"><Tie/><next>${loc(mi, pos, next.m, next.f)}</next></Spanner>` : ''
                    // tied from the previous chord
                    let prev: { m: number; f: Fraction } | null = null
                    if (ii > 0 && items[ii - 1].tied) {
                        prev = { m: mi, f: pos.minus(items[ii - 1].ticks) }
                    } else if (ii === 0 && mi > 0) {
                        const pitems = (parsed[mi - 1][vi] ?? []).filter(it => !it.measureLevel)
                        const last = pitems[pitems.length - 1]
                        if (last && last.tied) {
                            prev = { m: mi - 1, f: (measureLenAttr(measures[mi - 1]) ?? measureLen).minus(last.ticks) }
                        }
                    }
                    const tiePrev = prev ? `<Spanner type="Tie"><prev>${loc(mi, pos, prev.m, prev.f)}</prev></Spanner>` : ''
                    x += it.xml(tieNext, tiePrev)
                    pos = pos.plus(it.ticks)
                })
                x += '</voice>'
            })
            x += '</Measure>'
        })
        staffXml += x + '</Staff>'
    })
    return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.70"><Score><Division>480</Division>
<Part id="1">${parts}<trackName>Piano</trackName><Instrument id="${instrument}"><longName>Piano</longName><shortName>Pno.</shortName><trackName>Piano</trackName>${staves.length > 1 ? '<clef staff="2">F</clef>' : ''}</Instrument></Part>
${staffXml}</Score></museScore>`
}

export function load(staves: string[][], sig: [number, number] = [4, 4]): MasterScore {
    const score = loadScore(new TextEncoder().encode(makeMscx(staves, sig)))
    score.doLayout()
    return score
}

// ---------------------------------------------------------------------------------------------------------------------
//   inspection
// ---------------------------------------------------------------------------------------------------------------------

export function measures(score: MasterScore): Measure[] {
    const res: Measure[] = []
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        res.push(m)
    }
    return res
}

function fr(f: Fraction): string {
    const r = f.reduced()
    return `${r.numerator()}/${r.denominator()}`
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** the chords/rests of a track per measure: "C4:1/4", "C4~:1/2" (tied to the next note), "r:1/4", "R" (measure rest), "3(...)" */
export function contents(score: MasterScore, track = 0): string[] {
    return measures(score).map(m => {
        const res: string[] = []
        for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            const cr = s.element(track) as ChordRest | null
            if (!cr) {
                continue
            }
            let str: string
            if (cr.isRest()) {
                str = cr.durationType().isMeasure() ? 'R' : `r:${fr(cr.ticks())}`
            } else {
                const c = cr as Chord
                const tied = c.notes().some(n => n.tieFor() && n.tieFor()!.endNote())
                str = `${c.notes().map(n => `${NAMES[n.pitch() % 12]}${Math.floor(n.pitch() / 12) - 1}`).join('+')}${tied ? '~' : ''}:${fr(cr.ticks())}`
            }
            if (cr.tuplet()) {
                const t = cr.tuplet()!
                str = `${t.ratio().numerator()}(${str})`
            }
            res.push(str)
        }
        return res.join(' ')
    })
}

export function measureLengths(score: MasterScore): string[] {
    return measures(score).map(m => fr(m.ticks()))
}

function timeSigAt(m: Measure, staffIdx = 0): TimeSig | null {
    const seg = m.findSegment(SegmentType.TimeSig, m.tick())
    return seg ? seg.element(staffIdx * 4) as TimeSig | null : null
}

/** the hash of all pages without a selection (selected elements are painted last) */
function hash(score: MasterScore): string {
    score.deselectAll()
    score.doLayout()
    return scoreHash(score)
}

/** drops a time signature on measure idx (applyPaletteElement), checks, then undo == before, redo == after */
function dropTimeSig(score: MasterScore, idx: number, n: number, d: number, check: () => void, ctrl = false, staffIdx = 0): void {
    const before = hash(score)
    const m = measures(score)[idx]
    score.select(m, SelectType.SINGLE, staffIdx)
    const ts = createPaletteElement(score, { type: 'TimeSig', numerator: n, denominator: d })!
    expect(applyPaletteElement(score, ts, { ctrl })).toBe(true)
    expect(MScore.errorValue()).toBe(MsError.MS_NO_ERROR)
    check()
    const after = hash(score)
    expect(after).not.toBe(before)
    score.undoRedo(true)
    expect(hash(score)).toBe(before)
    score.undoRedo(false)
    expect(hash(score)).toBe(after)
    check()
}

/**
 * the note attacks of a track: "tick:pitch" of every note that is not the continuation of a tie (rewriting measures
 * splits and ties notes, the attacks stay the same)
 */
function attacks(score: MasterScore, track: number): string[] {
    const res: string[] = []
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        const e = s.element(track)
        if (e && e.isChord()) {
            for (const n of (e as Chord).notes()) {
                if (!n.tieBack()) {
                    res.push(`${s.tick().ticks()}:${n.pitch()}`)
                }
            }
        }
    }
    return res
}

function addSlur(score: MasterScore, track: number, tick1: number, tick2: number): Slur {
    const slur = Factory.createItem(ElementType.SLUR, scoreDummy(score)) as Slur
    const c1 = score.findCR(Fraction.fromTicks(tick1), track)!
    const c2 = score.findCR(Fraction.fromTicks(tick2), track)!
    slur.setTrack(track)
    slur.setTrack2(track)
    slur.setTick(c1.tick())
    slur.setTick2(c2.tick())
    slur.setStartElement(c1)
    slur.setEndElement(c2)
    slur.setParent(null)
    score.addElement(slur)
    return slur
}

describe('time signature changes that rewrite measures', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('3/4 on a 4/4 score with notes: notes split and tied at the new barlines', () => {
        const score = load([
            ['C4:1/4 D4:1/4 E4:1/4 F4:1/4', 'G4:1/2 A4~:1/2', 'A4:1/4 B4:1/4 C5:1/2', 'R'],
            ['C3:1/1', 'R', 'D3:1/2 E3:1/2', 'R'],
        ])
        const a0 = attacks(score, 0)
        const a4 = attacks(score, 4)
        dropTimeSig(score, 0, 3, 4, () => {
            // 16 quarters -> 6 measures of 3/4 (the last one filled with rests)
            expect(measureLengths(score)).toEqual(['3/4', '3/4', '3/4', '3/4', '3/4', '3/4'])
            expect(contents(score, 0)).toEqual([
                'C4:1/4 D4:1/4 E4:1/4', 'F4:1/4 G4:1/2', 'A4~:1/2 A4:1/4', 'B4:1/4 C5:1/2', 'R', 'R',
            ])
            expect(contents(score, 4)).toEqual(['C3~:3/4', 'C3:1/4 r:1/2', 'r:1/2 D3~:1/4', 'D3:1/4 E3:1/2', 'R', 'R'])
            expect(attacks(score, 0)).toEqual(a0)
            expect(attacks(score, 4)).toEqual(a4)
            expect(timeSigAt(measures(score)[0])!.sig().identical(new Fraction(3, 4))).toBe(true)
            expect(timeSigAt(measures(score)[0], 1)!.sig().identical(new Fraction(3, 4))).toBe(true)
            expect(score.sigmap().timesig(0).timesig().identical(new Fraction(3, 4))).toBe(true)
        })
    })

    it('a time signature in the middle of the score, a tie into the rewritten range, a second voice', () => {
        const score = load([
            ['C4:1/4 D4:1/4 E4:1/4 F4~:1/4', 'F4:1/2 A4~:1/2', 'A4:1/4 B4:1/4 C5:1/2', 'R', 'C4:1/1', 'R'],
            ['R', 'R', 'D3:1/2 E3:1/2 | G3:1/4 A3:1/4 r:1/2', 'R', 'R', 'R'],
        ])
        const a = [0, 4, 5].map(t => attacks(score, t))
        dropTimeSig(score, 1, 3, 4, () => {
            // measures 2-6 (20 quarters) -> 7 measures of 3/4
            expect(measureLengths(score)).toEqual(['1/1', '3/4', '3/4', '3/4', '3/4', '3/4', '3/4', '3/4'])
            expect(contents(score, 0)).toEqual(['C4:1/4 D4:1/4 E4:1/4 F4~:1/4', 'F4:1/2 A4~:1/4', 'A4~:1/4 A4:1/4 B4:1/4',
                'C5:1/2 r:1/4', 'R', 'C4~:3/4', 'C4:1/4 r:1/2', 'R'])
            expect(contents(score, 4)).toEqual(['R', 'R', 'r:1/4 D3:1/2', 'E3:1/2 r:1/4', 'R', 'R', 'R', 'R'])
            expect(contents(score, 5)).toEqual(['', '', 'r:1/4 G3:1/4 A3:1/4', '', '', '', '', ''])
            expect([0, 4, 5].map(t => attacks(score, t))).toEqual(a)
            expect(timeSigAt(measures(score)[0])!.sig().identical(new Fraction(4, 4))).toBe(true)
            expect(timeSigAt(measures(score)[1])!.sig().identical(new Fraction(3, 4))).toBe(true)
            expect(score.sigmap().timesig(1920).timesig().identical(new Fraction(3, 4))).toBe(true)
        })
        // a second change rewrites only up to the end (and a later one only up to the next time signature)
        dropTimeSig(score, 3, 2, 4, () => {
            expect(measureLengths(score)).toEqual(['1/1', '3/4', '3/4', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2'])
            expect(contents(score, 0)).toEqual(['C4:1/4 D4:1/4 E4:1/4 F4~:1/4', 'F4:1/2 A4~:1/4', 'A4~:1/4 A4:1/4 B4:1/4',
                'C5:1/2', 'R', 'R', 'C4~:1/2', 'C4:1/2', 'R', 'R', 'R'])
        })
        dropTimeSig(score, 2, 1, 4, () => {
            // 3/4 of measure 3 -> 3 measures of 1/4, the 2/4 measures stay
            expect(measureLengths(score)).toEqual(['1/1', '3/4', '1/4', '1/4', '1/4', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2'])
            expect(contents(score, 0).slice(2, 6)).toEqual(['A4~:1/4', 'A4:1/4', 'B4:1/4', 'C5:1/2'])
            expect(timeSigAt(measures(score)[5])!.sig().identical(new Fraction(2, 4))).toBe(true)
        })
    })

    it('tuplets: split in the middle at a new barline; a tuplet that cannot be split rolls the command back', () => {
        const score = load([
            ['C4:1/4 3[D4:1/4 E4:1/4 F4:1/4] G4:1/4', '3[C4:1/8 D4:1/8 E4:1/8] F4:1/4 G4:1/2', 'R'],
        ])
        const a = attacks(score, 0)
        dropTimeSig(score, 0, 2, 4, () => {
            expect(measureLengths(score)).toEqual(['1/2', '1/2', '1/2', '1/2', '1/2', '1/2'])
            expect(contents(score, 0)).toEqual(['C4:1/4 3(D4:1/4) 3(E4~:1/8)', '3(E4:1/8) 3(F4:1/4) G4:1/4',
                '3(C4:1/8) 3(D4:1/8) 3(E4:1/8) F4:1/4', 'G4:1/2', 'R', 'R'])
            expect(attacks(score, 0)).toEqual(a)
            // the halves of the split tuplet: 3 eighths in the time of 2 eighths each, the second one generated
            const t1 = (measures(score)[0].findChordRest(Fraction.fromTicks(480), 0)!).tuplet()!
            const t2 = (measures(score)[1].findChordRest(Fraction.fromTicks(960), 0)!).tuplet()!
            expect(t1).not.toBe(t2)
            expect(fr(t1.ticks())).toBe('1/4')
            expect(t1.baseLen().type()).toBe(DurationType.V_EIGHTH)
            expect(t2.generated()).toBe(true)
        })

        // 3/8: the triplet of quarters would have to be split at a third
        const before = hash(score)
        const undoSize = score.undoStack().size()
        score.select(measures(score)[0], SelectType.SINGLE, 0)
        expect(applyPaletteElement(score, createPaletteElement(score, { type: 'TimeSig', numerator: 3, denominator: 8 })!)).toBe(true)
        expect(MScore.errorValue()).toBe(MsError.CANNOT_SPLIT_TUPLET)
        MScore.setError(MsError.MS_NO_ERROR)
        expect(score.undoStack().size()).toBe(undoSize)
        expect(hash(score)).toBe(before)
    })

    it('keeps barlines, repeats, breaks, clefs, key signatures and annotations where they fit', () => {
        const score = load([
            ['{<Dynamic><subtype>f</subtype></Dynamic>} C4:1/4 D4:1/4 E4:1/4 F4:1/4 {<BarLine><subtype>double</subtype></BarLine>}',
                '{{<startRepeat/>}} G4:1/2 {<StaffText><text>hello</text></StaffText>} A4:1/2',
                '{{<endRepeat>2</endRepeat>}} {{<LayoutBreak><subtype>line</subtype></LayoutBreak>}} {<KeySig><concertKey>2</concertKey></KeySig>} A4:1/4 B4:1/4 C5:1/2',
                'R'],
            ['R', '{<Clef><concertClefType>G</concertClefType><transposingClefType>G</transposingClefType></Clef>} C4:1/1', 'R', 'R'],
        ])
        dropTimeSig(score, 0, 3, 4, () => {
            const ms = measures(score)
            expect(measureLengths(score)).toEqual(['3/4', '3/4', '3/4', '3/4', '3/4', '3/4'])
            // the double barline and the start repeat at tick 1920 are now in the middle of a measure: removed
            expect(ms.map(m => m.endBarLineType())).toEqual([BarLineType.NORMAL, BarLineType.NORMAL, BarLineType.NORMAL, BarLineType.END_REPEAT,
                BarLineType.NORMAL, BarLineType.END])
            expect(ms.some(m => m.repeatStart())).toBe(false)
            // end repeat and line break at tick 5760: the end of the 4th measure of 3/4
            expect(ms.map(m => m.repeatEnd())).toEqual([false, false, false, true, false, false])
            expect(ms.map(m => m.lineBreak())).toEqual([false, false, false, true, false, false])
            // the clef of staff 2 stays at tick 1920
            const clefSeg = ms[1].findSegment(SegmentType.Clef, Fraction.fromTicks(1920))!
            expect(clefSeg.element(4)!.isClef()).toBe(true)
            // the key signature goes to the start of the measure its chords are in
            expect(ms[2].findSegment(SegmentType.KeySig, Fraction.fromTicks(2880))!.element(0)!.isKeySig()).toBe(true)
            expect(score.staff(0)!.key(Fraction.fromTicks(2880))).toBe(2)
            // annotations stay at their ticks
            expect(ms[0].first(SegmentType.ChordRest)!.annotations().map(e => e.typeName())).toEqual(['Dynamic'])
            expect(ms[2].findSegment(SegmentType.ChordRest, Fraction.fromTicks(2880))!.annotations().map(e => e.typeName())).toEqual(['StaffText'])
        })
    })

    it('keeps slurs on the rewritten chords', () => {
        const score = load([['C4:1/4 D4:1/4 E4:1/4 F4:1/4', 'G4:1/2 A4:1/2', 'R']])
        addSlur(score, 0, 480, 2880)
        score.doLayout()
        dropTimeSig(score, 0, 3, 4, () => {
            const slurs = score.spanner().filter(s => s.isSlur())
            expect(slurs.length).toBe(1)
            const slur = slurs[0]
            expect([slur.tick().ticks(), slur.tick2().ticks()]).toEqual([480, 2880])
            expect(slur.startElement()).toBe(score.findCR(Fraction.fromTicks(480), 0))
            expect(slur.endElement()).toBe(score.findCR(Fraction.fromTicks(2880), 0))
        })
    })

    it('drops on a multimeasure rest (rewrites from its first measure)', () => {
        const score = load([['C4:1/1', 'R', 'R', 'R', 'R', 'D4:1/1']])
        score.style().set(Sid.createMultiMeasureRests, true)
        score.doLayout()
        const mm = measures(score)[1].mmRest()!
        expect(mm).toBeTruthy()
        const before = hash(score)
        score.select(mm, SelectType.SINGLE, 0)
        expect(applyPaletteElement(score, createPaletteElement(score, { type: 'TimeSig', numerator: 3, denominator: 4 })!)).toBe(true)
        expect(MScore.errorValue()).toBe(MsError.MS_NO_ERROR)
        expect(measureLengths(score)).toEqual(['1/1', '3/4', '3/4', '3/4', '3/4', '3/4', '3/4', '3/4'])
        expect(contents(score, 0)).toEqual(['C4:1/1', 'R', 'R', 'R', 'R', 'R', 'r:1/4 D4~:1/2', 'D4:1/2 r:1/4'])
        const after = hash(score)
        score.undoRedo(true)
        expect(hash(score)).toBe(before)
        score.undoRedo(false)
        expect(hash(score)).toBe(after)
    })

    it('a pickup measure keeps its length (only its nominal time signature changes)', () => {
        const score = load([['@len=1/4 G4:1/4', 'C4:1/1', 'D4:1/2 E4:1/2', 'R']])
        dropTimeSig(score, 0, 3, 4, () => {
            expect(measureLengths(score)).toEqual(['1/4', '3/4', '3/4', '3/4', '3/4'])
            expect(fr(measures(score)[0].timesig())).toBe('3/4')
            expect(contents(score, 0)).toEqual(['G4:1/4', 'C4~:3/4', 'C4:1/4 D4:1/2', 'E4:1/2 r:1/4', 'R'])
        })
    })

    it('local time signature (ctrl): only the staff changes; not possible on a staff with notes', () => {
        const score = load([['C4:1/1', 'D4:1/1', 'R'], ['R', 'R', 'R']])
        dropTimeSig(score, 1, 3, 4, () => {
            const ms = measures(score)
            expect(measureLengths(score)).toEqual(['1/1', '1/1', '1/1'])
            expect(timeSigAt(ms[1], 0)).toBeNull()
            const ts = timeSigAt(ms[1], 1)!
            expect(fr(ts.sig())).toBe('3/4')
            expect(fr(ts.stretch())).toBe('3/4')
            expect(fr(score.staff(1)!.timeStretch(ms[1].tick()))).toBe('3/4')
            expect(fr(score.staff(0)!.timeStretch(ms[1].tick()))).toBe('1/1')
            // the measure rests of the staff get the length of the local time signature
            expect(fr((ms[1].first(SegmentType.ChordRest)!.element(4) as ChordRest).ticks())).toBe('3/4')
            expect(fr((ms[2].first(SegmentType.ChordRest)!.element(4) as ChordRest).ticks())).toBe('3/4')
            expect(fr((ms[0].first(SegmentType.ChordRest)!.element(4) as ChordRest).ticks())).toBe('1/1')
        }, true, 1)

        const before = hash(score)
        score.select(measures(score)[1], SelectType.SINGLE, 0)
        expect(applyPaletteElement(score, createPaletteElement(score, { type: 'TimeSig', numerator: 3, denominator: 4 })!, { ctrl: true })).toBe(true)
        expect(MScore.errorValue()).toBe(MsError.CANNOT_CHANGE_LOCAL_TIMESIG_MEASURE_NOT_EMPTY)
        MScore.setError(MsError.MS_NO_ERROR)
        expect(hash(score)).toBe(before)

        // a global change cannot rewrite measures of a staff with a local time signature
        score.select(measures(score)[1], SelectType.SINGLE, 0)
        expect(applyPaletteElement(score, createPaletteElement(score, { type: 'TimeSig', numerator: 2, denominator: 4 })!)).toBe(true)
        expect(hash(score)).toBe(before)
    })

    it('a new score (measure rests only)', () => {
        const score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
        const before = hash(score)
        dropTimeSig(score, 2, 6, 8, () => {
            expect(measureLengths(score)).toEqual(['1/1', '1/1', '3/4', '3/4', '3/4'])
            expect(contents(score, 0)).toEqual(['R', 'R', 'R', 'R', 'R'])
        })
        expect(hash(score)).not.toBe(before)
    })
})

// real scores (5/8 from the second measure to the end): every note attack stays where it was (or the command is
// rolled back with an error, tuplets-1: a tuplet that cannot be split), undo/redo restore the rendering.
// Known differences between undo and the original that C++ has as well (so these scores are not in the list):
// beams with user properties (the beams of the removed measures are deleted: RemoveMeasures -> removeDeleteBeam, the
// undo does not reconnect them), lyrics lines in the range (removeUnmanaged, not restored on undo), the drawing order
// of annotations/spanners at the same tick (re-added in reverse order), a clef in the last rewritten measure when its
// end barline segment is restored (InsertMeasures collects the clefs before lm->last()), ties between chords on
// different (cross-)staves, local time signatures in the last measure (only staff 0 is checked).
describe.runIf(hasSubmodule)('rewriting measures of real scores', () => {
    for (const name of ['beams-1.mscz', 'tie-1.mscx', 'tie-2.mscx', 'tuplets-1.mscx', 'accidental-1.mscx', 'slurs-1.mscx',
        'chord-layout-1.mscx', 'dynamics-1.mscz', 'hairpins-1.mscx', 'hairpins-2.mscx', 'lyrics-1.mscx', 'measure-repeat-1.mscx',
        'mmrest-1.mscx']) {
        it(name, async () => {
            const file = `${VTEST}/${name}`
            if (!existsSync(file)) {
                return
            }
            const score = await openScore(file)
            const ms = measures(score)
            const idx = Math.min(1, ms.length - 1)
            const tracks = [...Array(score.ntracks()).keys()]
            const before = hash(score)
            const a = tracks.map(t => attacks(score, t))
            const oldSig = score.sigmap().timesig(ms[idx].tick().ticks()).timesig()
            const [n, d] = oldSig.numerator() === 5 && oldSig.denominator() === 8 ? [3, 4] : [5, 8]
            score.select(ms[idx], SelectType.SINGLE, 0)
            expect(applyPaletteElement(score, createPaletteElement(score, { type: 'TimeSig', numerator: n, denominator: d })!)).toBe(true)
            const err = MScore.errorValue()
            MScore.setError(MsError.MS_NO_ERROR)
            if (err !== MsError.MS_NO_ERROR) {
                expect(hash(score)).toBe(before)
                return
            }
            expect(tracks.map(t => attacks(score, t))).toEqual(a)
            for (const m of measures(score).slice(idx)) {
                if (m.tick().lt(ms[idx].tick())) {
                    continue
                }
                expect(fr(m.ticks()), `measure at ${m.tick().ticks()}`).toBe(`${n}/${d}`)
                break
            }
            const after = hash(score)
            score.undoRedo(true)
            expect(hash(score)).toBe(before)
            score.undoRedo(false)
            expect(hash(score)).toBe(after)
        }, 60000)
    }
})
