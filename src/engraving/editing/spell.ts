/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the pitch spelling commands: Score::spell, spellWithSharpsOrFlats, changeEnharmonicSpelling (score.cpp),
 * Score::spellNotelist with its spelling window (pitchspelling.cpp) and Note::undoSetTpc (note.cpp), added to Score
 * and Note by this module (module augmentation).
 */

import { Score } from '../dom/score'
import { Note } from '../dom/note'
import { Pid } from '../dom/property'
import { SegmentType } from '../dom/segment'
import { ENHARMONIC_SPELLING, Prefer, pitch2tpc } from '../dom/pitchspelling'
import { Fraction } from '../types/fraction'
import { Key, VOICES } from '../types/types'
import { Interval } from '../dom/interval'
import { Transpose } from './transpose'
import type { Chord } from '../dom/chord'

declare module '../dom/score' {
    interface Score {
        /** respells the selected notes (all notes without a selection) */
        spell(): void
        spellNotelist(notes: Note[]): void
        spellWithSharpsOrFlats(prefer: Prefer): void
        /** both: change the spelling in concert and transposed pitch */
        changeEnharmonicSpelling(both: boolean): void
    }
}

declare module '../dom/note' {
    interface Note {
        undoSetTpc(v: number): void
    }
}

Note.prototype.undoSetTpc = function (this: Note, v: number): void {
    if (this.concertPitch()) {
        if (v !== this.tpc1()) {
            this.undoChangeProperty(Pid.TPC1, v)
        }
    } else {
        if (v !== this.tpc2()) {
            this.undoChangeProperty(Pid.TPC2, v)
        }
    }
}

// table of alternative spellings for one octave
// each entry is the TPC of the note
//    tab1 does not contain double sharps
//    tab2 does not contain double flats

const tab1: readonly number[] = [
    14, 2, // 60  C   Dbb
    21, 9, // 61  C#  Db
    16, 4, // 62  D   Ebb
    23, 11, // 63  D#  Eb
    18, 6, // 64  E   Fb
    13, 1, // 65  F   Gbb
    20, 8, // 66  F#  Gb
    15, 3, // 67  G   Abb
    22, 10, // 68  G#  Ab
    17, 5, // 69  A   Bbb
    24, 12, // 70  A#  Bb
    19, 7, // 71  B   Cb
]

const tab2: readonly number[] = [
    26, 14, // 60  B#  C
    21, 9, // 61  C#  Db
    28, 16, // 62  C## D
    23, 11, // 63  D#  Eb
    30, 18, // 64  D## E
    25, 13, // 65  E#  F
    20, 8, // 66  F#  Gb
    27, 15, // 67  F## G
    22, 10, // 68  G#  Ab
    29, 17, // 69  G## A
    24, 12, // 70  A#  Bb
    31, 19, // 71  A## B
]

const intervalPenalty: readonly number[] = [
    0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 1, 3, 3,
]

function penalty(lof1: number, lof2: number, k: number): number {
    if (k < 0 || k >= 15) {
        return 0
    }
    let p = ENHARMONIC_SPELLING[k][lof1] * 4 + ENHARMONIC_SPELLING[k][lof2] * 4
    const distance = lof2 > lof1 ? lof2 - lof1 : lof1 - lof2
    if (distance > 12) {
        p += 3
    } else {
        p += intervalPenalty[distance]
    }
    return p
}

const WINDOW = 9

function computeWindow(notes: readonly Note[], start: number, end: number): number {
    let p = 10000
    let idx = -1
    const pitch: number[] = []
    const key: number[] = []

    let i = start
    let k = 0
    while (i < end) {
        pitch[k] = notes[i].pitch() % 12
        const tick = notes[i].chord().tick()
        key[k] = notes[i].staff()!.key(tick) + 7
        if (key[k] < 0 || key[k] > 14) {
            return 0
        }
        ++k
        ++i
    }

    for (; k < 10; ++k) {
        pitch[k] = pitch[k - 1]
        key[k] = key[k - 1]
    }

    for (i = 0; i < 512; ++i) {
        let pa = 0
        let pb = 0
        const l = pitch[0] * 2 + (i & 1)
        let lof1a = tab1[l]
        let lof1b = tab2[l]

        for (k = 1; k < 10; ++k) {
            const l1 = pitch[k] * 2 + ((i & (1 << k)) >> k)
            const lof2a = tab1[l1]
            const lof2b = tab2[l1]
            pa += penalty(lof1a, lof2a, key[k])
            pb += penalty(lof1b, lof2b, key[k])
            lof1a = lof2a
            lof1b = lof2b
        }
        if (pa < pb) {
            if (pa < p) {
                p = pa
                idx = i
            }
        } else {
            if (pb < p) {
                p = pb
                idx = i * -1
            }
        }
    }
    return idx
}

function changeAllTpcs(n: Note | null, tpc1: number): void {
    if (!n) {
        return
    }
    let v = new Interval()
    const tick = n.chord() ? n.chord().tick() : new Fraction(-1, 1)
    if (n.part() && n.part()!.instrument(tick)) {
        v = n.staff()!.transpose(tick).clone()
        v.flip()
    }
    const tpc2 = Transpose.transposeTpc(tpc1, v, true)
    n.undoChangeProperty(Pid.TPC1, tpc1)
    n.undoChangeProperty(Pid.TPC2, tpc2)
    for (const tied of n.tiedNotes()) {
        tied.undoChangeProperty(Pid.TPC1, tpc1)
        tied.undoChangeProperty(Pid.TPC2, tpc2)
    }
}

Score.prototype.spellNotelist = function (this: Score, notes: Note[]): void {
    const n = notes.length

    let start = 0
    while (start < n) {
        let end = start + WINDOW
        if (end > n) {
            end = n
        }
        let opt = computeWindow(notes, start, end)
        let tab: readonly number[]
        if (opt < 0) {
            tab = tab2
            opt *= -1
        } else {
            tab = tab1
        }

        if (start === 0) {
            changeAllTpcs(notes[0], tab[(notes[0].pitch() % 12) * 2 + (opt & 1)])
            if (n > 1) {
                changeAllTpcs(notes[1], tab[(notes[1].pitch() % 12) * 2 + ((opt & 2) >> 1)])
            }
            if (n > 2) {
                changeAllTpcs(notes[2], tab[(notes[2].pitch() % 12) * 2 + ((opt & 4) >> 2)])
            }
        }
        if ((end - start) >= 6) {
            changeAllTpcs(notes[start + 3], tab[(notes[start + 3].pitch() % 12) * 2 + ((opt & 8) >> 3)])
            changeAllTpcs(notes[start + 4], tab[(notes[start + 4].pitch() % 12) * 2 + ((opt & 16) >> 4)])
            changeAllTpcs(notes[start + 5], tab[(notes[start + 5].pitch() % 12) * 2 + ((opt & 32) >> 5)])
        }
        if (end === n) {
            const n1 = end - start
            let k: number
            // switch with fallthrough
            const c = n1 - 6
            if (c === 3) {
                k = end - start - 3
                changeAllTpcs(notes[end - 3], tab[(notes[end - 3].pitch() % 12) * 2 + ((opt & (1 << k)) >> k)])
            }
            if (c === 3 || c === 2) {
                k = end - start - 2
                changeAllTpcs(notes[end - 2], tab[(notes[end - 2].pitch() % 12) * 2 + ((opt & (1 << k)) >> k)])
            }
            if (c === 3 || c === 2 || c === 1) {
                k = end - start - 1
                changeAllTpcs(notes[end - 1], tab[(notes[end - 1].pitch() % 12) * 2 + ((opt & (1 << k)) >> k)])
            }
            break
        }
        // advance to next window
        start += 3
    }
}

Score.prototype.spell = function (this: Score): void {
    for (let i = 0; i < this.nstaves(); ++i) {
        const notes: Note[] = []
        const take = (ce: Note): boolean => this.selection().isNone() || ce.selected()
        for (let s = this.firstSegment(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
            const strack = i * VOICES
            const etrack = strack + VOICES
            for (let track = strack; track < etrack; ++track) {
                const e = s.element(track)
                if (e && e.isChord()) {
                    const c = e as unknown as Chord
                    notes.push(...c.notes().filter(take))
                    for (const g of c.graceNotes()) {
                        notes.push(...g.notes().filter(take))
                    }
                }
            }
        }
        this.spellNotelist(notes)
    }
}

Score.prototype.spellWithSharpsOrFlats = function (this: Score, prefer: Prefer): void {
    const notes = this.selection().noteList()
    for (const n of notes) {
        const v = n.part()!.instrument(n.chord().tick()).transpose().clone()
        let tpc1: number
        let tpc2: number
        if (n.concertPitch() || v.isZero()) {
            // Note: using Key::C always and ignoring actual key signature. Otherwise, "respell with flats" would still use sharps
            // sometimes if they're in the key, and vice versa, which seems contrary to the intent of the command.
            tpc1 = pitch2tpc(n.pitch(), Key.C, prefer)
            v.flip()
            tpc2 = Transpose.transposeTpc(tpc1, v, true)
        } else {
            // Spell the transposed pitch first, then convert to concert pitch
            const writtenPitch = n.pitch() - v.chromatic
            tpc2 = pitch2tpc(writtenPitch, Key.C, prefer)
            tpc1 = Transpose.transposeTpc(tpc2, v, true)
        }
        n.undoChangeProperty(Pid.TPC1, tpc1)
        n.undoChangeProperty(Pid.TPC2, tpc2)
        for (const tied of n.tiedNotes()) {
            tied.undoChangeProperty(Pid.TPC1, tpc1)
            tied.undoChangeProperty(Pid.TPC2, tpc2)
        }
    }
}

const ENHARMONIC_TAB: readonly number[] = [
    26, 14, 2, // 60  B#   C   Dbb
    21, 21, 9, // 61  C#   C#  Db
    28, 16, 4, // 62  C##  D   Ebb
    23, 23, 11, // 63  D#   D#  Eb
    30, 18, 6, // 64  D##  E   Fb
    25, 13, 1, // 65  E#   F   Gbb
    20, 20, 8, // 66  F#   F#  Gb
    27, 15, 3, // 67  F##  G   Abb
    22, 22, 10, // 68  G#   G#  Ab
    29, 17, 5, // 69  G##  A   Bbb
    24, 24, 12, // 70  A#   A#  Bb
    31, 19, 7, // 71  A##  B   Cb
]

Score.prototype.changeEnharmonicSpelling = function (this: Score, both: boolean): void {
    const notes = this.selection().uniqueNotes()
    for (const n of notes) {
        const staff = n.staff()!
        if (staff.part()!.instrument(n.tick()).useDrumset()) {
            continue
        }
        if (staff.isTabStaff(n.tick())) {
            const string = n.line() + (both ? 1 : -1)
            const fret = staff.part()!.stringData(n.tick(), staff.idx())!.fretForStaff(n.pitch(), string, staff)
            if (fret !== -1) {
                n.undoChangeProperty(Pid.FRET, fret)
                n.undoChangeProperty(Pid.STRING, string)
            }
        } else {
            const tab = ENHARMONIC_TAB
            let tpc = n.tpc()
            for (let i = 0; i < 36; ++i) {
                if (tab[i] === tpc) {
                    if ((i % 3) < 2) {
                        if (tab[i] === tab[i + 1]) {
                            tpc = tab[i + 2]
                        } else {
                            tpc = tab[i + 1]
                        }
                    } else {
                        tpc = tab[i - 2]
                    }
                    break
                }
            }
            n.undoSetTpc(tpc)
            if (both || staff.part()!.instrument(n.chord().tick()).transpose().isZero()) {
                // change both spellings
                const t = n.transposeTpc(tpc)
                if (n.concertPitch()) {
                    n.undoChangeProperty(Pid.TPC2, t)
                } else {
                    n.undoChangeProperty(Pid.TPC1, t)
                }
            }
        }
    }
}
