/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/shared/musicxmltypes.h/.cpp
 *
 * The C++ std::map types are OrderedMaps (iteration in key order); C++ copies of these values (muse::value(map, key))
 * are explicit clone() calls here.
 */

import type { Arpeggio } from '../../../../engraving/dom/arpeggio'
import { Interval } from '../../../../engraving/dom/interval'
import type { Fraction } from '../../../../engraving/types/fraction'
import { DirectionV, NoteHeadGroup } from '../../../../engraving/types/types'
import { FractionMap, StringMap } from '../../../../framework/global/orderedmap'

export const MAX_NUMBER_LEVEL = 16 // maximum number of overlapping MusicXML objects

export enum MusicXmlExporterSoftware {
    DOLET6,
    DOLET8,
    DORICO,
    FINALE,
    NOTEFLIGHT,
    SIBELIUS,
    OTHER,
}

export enum MusicXmlStartStop {
    NONE, START, STOP,
}

export class MusicXmlArpeggioDesc {
    constructor(public arp: Arpeggio, public no: number) {}
}

/** C++ std::multimap<int, MusicXmlArpeggioDesc>: the descriptions per tick in insertion order */
export class ArpeggioMap {
    private m_map = new Map<number, MusicXmlArpeggioDesc[]>()

    clear(): void { this.m_map.clear() }

    /** muse::values(arps, tick) */
    values(tick: number): MusicXmlArpeggioDesc[] { return [...(this.m_map.get(tick) ?? [])] }

    insert(tick: number, desc: MusicXmlArpeggioDesc): void {
        const l = this.m_map.get(tick)
        if (l) {
            l.push(desc)
        } else {
            this.m_map.set(tick, [desc])
        }
    }
}

//---------------------------------------------------------
//   MusicXmlInstrument
//---------------------------------------------------------

/**
 A single instrument in a MusicXML part.
 Used for both a drum part and a (non-drum) multi-instrument part
 */

export class MusicXmlInstrument {
    unpitched = -1                     // midi-unpitched read from MusicXML
    name: string                       // instrument-name read from MusicXML
    sound = ''                         // instrument-sound read from MusicXML
    virtLib = ''                       // virtual-library read from MusicXML
    virtName = ''                      // virtual-name read from MusicXML
    midiChannel = -1                   // midi-channel read from MusicXML
    midiPort = -1                      // port read from MusicXML
    midiProgram = -1                   // midi-program read from MusicXML
    midiVolume = 100                   // volume read from MusicXML
    midiPan = 63                       // pan value read from MusicXML
    notehead: NoteHeadGroup            // notehead symbol set
    line = 0                           // place notehead onto this line
    stemDirection = DirectionV.AUTO

    /** MusicXmlInstrument() (required by std::map: notehead HEAD_INVALID) and MusicXmlInstrument(String s) */
    constructor(s?: string) {
        this.name = s ?? ''
        this.notehead = s === undefined ? NoteHeadGroup.HEAD_INVALID : NoteHeadGroup.HEAD_NORMAL
    }

    clone(): MusicXmlInstrument {
        return Object.assign(new MusicXmlInstrument(), this)
    }

    toString(): string {
        return `chan ${this.midiChannel} prog ${this.midiProgram} vol ${this.midiVolume} pan ${this.midiPan} unpitched ${this.unpitched}`
               + ` name '${this.name}' sound '${this.sound}' head ${this.notehead} line ${this.line} stemDir ${this.stemDirection}`
    }
}

/** std::map<String, MusicXmlInstrument> */
export class MusicXmlInstruments extends StringMap<MusicXmlInstrument> {
    /** the C++ copy (the instruments are values) */
    clone(): MusicXmlInstruments {
        const r = new MusicXmlInstruments()
        for (const [k, v] of this) {
            r.set(k, v.clone())
        }
        return r
    }

    /** C++ map[key]: the value, default constructed and inserted if missing */
    at(key: string): MusicXmlInstrument {
        let v = this.get(key)
        if (!v) {
            v = new MusicXmlInstrument()
            this.set(key, v)
        }
        return v
    }
}

//---------------------------------------------------------
//   MusicXmlIntervalList
//---------------------------------------------------------

export class MusicXmlIntervalList extends FractionMap<Interval> {
    interval(f: Fraction): Interval {
        if (this.empty()) {
            return new Interval()
        }
        const i = this.upperBound(f)
        if (i === 0) {
            return new Interval()
        }
        const iv = this.valueAt(i - 1)
        return new Interval(iv.diatonic, iv.chromatic)
    }

    clone(): MusicXmlIntervalList {
        const r = new MusicXmlIntervalList()
        for (const [k, v] of this) {
            r.set(k, new Interval(v.diatonic, v.chromatic))
        }
        return r
    }
}

//---------------------------------------------------------
//   MusicXmlInstrList
//---------------------------------------------------------

export class MusicXmlInstrList extends FractionMap<string> {
    instrument(f: Fraction): string {
        if (this.empty()) {
            return ''
        }
        const i = this.upperBound(f)
        if (i === 0) {
            return ''
        }
        return this.valueAt(i - 1)
    }

    setInstrument(instr: string, f: Fraction): void {
        // TODO determine how to handle multiple instrument changes at the same time
        // current implementation keeps the first one
        this.insert(f, instr)
    }

    clone(): MusicXmlInstrList {
        const r = new MusicXmlInstrList()
        for (const [k, v] of this) {
            r.set(k, v)
        }
        return r
    }
}

//---------------------------------------------------------
//   LyricNumberHandler
//   collect lyric numbering information and determine order
//
//   MusicXML lyrics may contain name and number attributes,
//   plus position information (typically default-y).
//   Name and number are simply tokens with no specified usage.
//   Default-y cannot easily be used to determine the lyrics
//   line, as it tends to differ per system depending on the
//   actual notes present.
//
//   Simply collecting all possible lyric number attributes
//   within a MusicXML part and assigning lyrics position
//   based on alphabetically sorting works well for all
//   common MusicXML files.
//---------------------------------------------------------

export class LyricNumberHandler {
    private m_numberToNo = new StringMap<number>()

    addNumber(number: string): void {
        if (!this.m_numberToNo.has(number)) {
            this.m_numberToNo.set(number, -1)           // unassigned
        }
    }

    toString(): string {
        let res = ''
        for (const [k, v] of this.m_numberToNo) {
            if (res) {
                res += ' '
            }
            res += `${k}:${v}`
        }
        return res
    }

    getLyricNo(number: string): number {
        return this.m_numberToNo.get(number) ?? 0
    }

    determineLyricNos(): void {
        for (let i = 0; i < this.m_numberToNo.size(); ++i) {
            this.m_numberToNo.setValueAt(i, i)
        }
    }

    clone(): LyricNumberHandler {
        const r = new LyricNumberHandler()
        for (const [k, v] of this.m_numberToNo) {
            r.m_numberToNo.set(k, v)
        }
        return r
    }
}
