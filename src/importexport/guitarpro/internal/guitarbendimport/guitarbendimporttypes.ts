/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/guitarbendimporttypes.h
 *
 * std::map<Fraction, T> / std::set<Fraction> are FractionMap / FractionSet (iterated in ascending order like C++).
 */

import { Fraction } from '../../../../engraving/types/fraction'
import type { Chord } from '../../../../engraving/dom/chord'
import type { Note } from '../../../../engraving/dom/note'

export class BendNoteData {
    startFactor = 0.0
    endFactor = 1.0
    quarterTones = 0
}

// tie between originally tied notes should be removed and instead the bend after last grace note should be placed
export class LastGraceNoteData {
    shouldMoveTie = false
    endFactor = 1.0 // grace notes' durations are split equally and they have startFactor 0 (bend starts from the beginning)
}

export class GraceNotesImportInfo {
    data: BendNoteData[] = []
    lastNoteData = new LastGraceNoteData()
}

export type bend_data_map_t = Map<number /* idx in chord */, BendNoteData>
export type grace_bend_data_map_t = Map<number /* idx in chord */, GraceNotesImportInfo> // each note can have multiple grace notes connected

export class BendChordData {
    startTick = new Fraction(0, 1)
    noteDataByIdx: bend_data_map_t = new Map()
}

export class BendSegment {
    startTime = -1
    middleTime = -1
    endTime = -1
    startPitch = -1
    endPitch = -1

    pitchDiff(): number { return this.endPitch - this.startPitch }

    clone(): BendSegment {
        const s = new BendSegment()
        s.startTime = this.startTime
        s.middleTime = this.middleTime
        s.endTime = this.endTime
        s.startPitch = this.startPitch
        s.endPitch = this.endPitch
        return s
    }
}

export enum BendType {
    NORMAL_BEND,
    PREBEND,
    HOLD,
    SLIGHT_BEND,
}

export enum ConnectionToNextNoteType {
    NONE, // note doesn't connect to next tied note -> using "grace note after"
    MAIN_NOTE_CONNECTS, // new note isn't added, only adding bend between 2 originally tied notes
    LAST_GRACE_CONNECTS, // grace notes are created and last of them connects to next tied note with bend
}

export class ImportedBendInfo {
    note: Note | null = null
    segments: BendSegment[] = []
    type = BendType.NORMAL_BEND
    timeOffsetFromStart = 0
    pitchOffsetFromStart = 0

    connectionType = ConnectionToNextNoteType.NONE

    /** C++ std::move(): the copy gets the segments, the moved-from object keeps an empty vector */
    move(): ImportedBendInfo {
        const r = new ImportedBendInfo()
        r.note = this.note
        r.segments = this.segments
        r.type = this.type
        r.timeOffsetFromStart = this.timeOffsetFromStart
        r.pitchOffsetFromStart = this.pitchOffsetFromStart
        r.connectionType = this.connectionType
        this.segments = []
        return r
    }
}

export class ChordImportedBendData {
    chord: Chord | null = null
    dataByNote = new Map<Note, ImportedBendInfo>()
}

/** std::map<Fraction, V>: keyed by the value of the fraction, iterated in ascending order */
export class FractionMap<V> {
    private m_map = new Map<string, [Fraction, V]>()
    private m_sorted: [Fraction, V][] | null = null

    private static key(f: Fraction): string {
        const r = f.reduced()
        return `${r.numerator()}/${r.denominator()}`
    }

    get size(): number { return this.m_map.size }

    has(f: Fraction): boolean { return this.m_map.has(FractionMap.key(f)) }

    get(f: Fraction): V | undefined { return this.m_map.get(FractionMap.key(f))?.[1] }

    set(f: Fraction, v: V): void {
        const k = FractionMap.key(f)
        const e = this.m_map.get(k)
        if (e) {
            e[1] = v
        } else {
            this.m_map.set(k, [f, v])
            this.m_sorted = null
        }
    }

    /** C++ operator[]: inserts a default value if the key is missing */
    at(f: Fraction, create: () => V): V {
        const k = FractionMap.key(f)
        const e = this.m_map.get(k)
        if (e) {
            return e[1]
        }
        const v = create()
        this.m_map.set(k, [f, v])
        this.m_sorted = null
        return v
    }

    delete(f: Fraction): boolean {
        const r = this.m_map.delete(FractionMap.key(f))
        if (r) {
            this.m_sorted = null
        }
        return r
    }

    clear(): void {
        this.m_map.clear()
        this.m_sorted = null
    }

    /** the entries in ascending key order (a snapshot) */
    entries(): [Fraction, V][] {
        if (!this.m_sorted) {
            this.m_sorted = [...this.m_map.values()].sort((a, b) => a[0].compare(b[0]))
        }
        return [...this.m_sorted]
    }

    first(): [Fraction, V] | undefined { return this.entries()[0] }

    last(): [Fraction, V] | undefined {
        const e = this.entries()
        return e[e.length - 1]
    }
}

/** std::set<Fraction> */
export class FractionSet {
    private m_map = new FractionMap<true>()

    insert(f: Fraction): void { this.m_map.set(f, true) }
    erase(f: Fraction): void { this.m_map.delete(f) }
    has(f: Fraction): boolean { return this.m_map.has(f) }
    get size(): number { return this.m_map.size }
    values(): Fraction[] { return this.m_map.entries().map(e => e[0]) }
}

export type tied_chords_bend_data_chunk_t = FractionMap<ChordImportedBendData>

/** C++ map[key] of std::map / std::unordered_map: inserts a default value if the key is missing */
export function mapAt<K, V>(map: Map<K, V>, key: K, create: () => V): V {
    let v = map.get(key)
    if (v === undefined) {
        v = create()
        map.set(key, v)
    }
    return v
}
