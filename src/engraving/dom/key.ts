/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/key.h/.cpp and keylist.h/.cpp
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { SymId } from '../types/symid'
import { AccidentalVal, Key, KeyMode } from '../types/types'
import { Tpc, tpc2step } from './pitchspelling'

export interface KeySym {
    sym: SymId
    line: number // relative line position (first staffline: line == 0, first gap: line == 1, ...)
    xPos: number // x position in staff spatium units
}

export interface CustDef {
    degree: number // scale degree
    sym: SymId
    xAlt: number // x position alteration in spatium units (default symbol position is based on index)
    octAlt: number // octave alteration
}

const ACC_TABLE: SymId[] = [
    SymId.noSym,
    SymId.accidentalTripleFlat,
    SymId.accidentalDoubleFlat,
    SymId.accidentalFlat,
    SymId.accidentalNatural,
    SymId.accidentalSharp,
    SymId.accidentalDoubleSharp,
    SymId.accidentalTripleSharp,
    SymId.noSym,
    SymId.accidentalNatural,
    SymId.accidentalNaturalSharp,
    SymId.accidentalSharp,
    SymId.noSym,
    SymId.accidentalDoubleFlat,
    SymId.accidentalNaturalFlat,
    SymId.accidentalNatural,
    SymId.noSym,
    SymId.accidentalSharp,
    SymId.accidentalSharpSharp,
    SymId.accidentalTripleSharp,
    SymId.noSym,
    // TODO(port): microtonal entries of accTable (only relevant for custom key signatures)
]

export class KeySigEvent {
    private m_concertKey: Key = Key.INVALID // -7 -> +7
    private m_key: Key = Key.INVALID // actual key, depends on staff transposition
    private m_mode: KeyMode = KeyMode.UNKNOWN
    private m_custom = false
    private m_forInstrumentChange = false
    private m_customKeyDefs: CustDef[] = []

    clone(): KeySigEvent {
        const k = new KeySigEvent()
        k.m_concertKey = this.m_concertKey
        k.m_key = this.m_key
        k.m_mode = this.m_mode
        k.m_custom = this.m_custom
        k.m_forInstrumentChange = this.m_forInstrumentChange
        k.m_customKeyDefs = this.m_customKeyDefs.map(d => ({ ...d }))
        return k
    }

    equals(e: KeySigEvent): boolean {
        if (e.m_custom !== this.m_custom || e.m_mode !== this.m_mode || e.m_forInstrumentChange !== this.m_forInstrumentChange) {
            return false
        }
        if (this.m_custom && !this.isAtonal()) {
            if (e.m_customKeyDefs.length !== this.m_customKeyDefs.length) {
                return false
            }
            for (let i = 0; i < this.m_customKeyDefs.length; ++i) {
                if (e.m_customKeyDefs[i].degree !== this.m_customKeyDefs[i].degree
                    || e.m_customKeyDefs[i].sym !== this.m_customKeyDefs[i].sym) {
                    return false
                }
            }
            return true
        }
        return e.m_concertKey === this.m_concertKey && e.m_key === this.m_key
    }

    private enforceLimits(transposing = false): void {
        if (this.m_key < Key.MIN) {
            this.m_key = Key.MIN
        } else if (this.m_key > Key.MAX) {
            this.m_key = Key.MAX
        }
        if (transposing) {
            return
        }
        if (this.m_concertKey < Key.MIN) {
            this.m_concertKey = Key.MIN
        } else if (this.m_concertKey > Key.MAX) {
            this.m_concertKey = Key.MAX
        }
    }

    setKey(v: Key): void {
        this.m_key = v
        this.enforceLimits(true)
    }

    setConcertKey(v: Key): void {
        this.m_key = v
        this.m_concertKey = v
        this.enforceLimits()
    }

    setCustom(val: boolean): void {
        this.m_custom = val
        if (this.m_key === Key.INVALID) {
            this.m_concertKey = Key.C
            this.m_key = Key.C
        }
    }

    concertKey(): Key { return this.m_concertKey }
    key(): Key { return this.m_key }
    mode(): KeyMode { return this.m_mode }
    setMode(m: KeyMode): void { this.m_mode = m }
    custom(): boolean { return this.m_custom }
    isValid(): boolean { return this.m_key !== Key.INVALID }
    isAtonal(): boolean { return this.m_mode === KeyMode.NONE }
    setForInstrumentChange(v: boolean): void { this.m_forInstrumentChange = v }
    forInstrumentChange(): boolean { return this.m_forInstrumentChange }
    customKeyDefs(): CustDef[] { return this.m_customKeyDefs }

    /** for backward compatibility */
    initFromSubtype(st: number): void {
        let key = st & 0xf
        if (key & 0x8) {
            key -= 16 // signed 4 bit field
        }
        const custom = ((st >> 24) & 0x1) !== 0
        const invalid = ((st >> 25) & 0x1) !== 0
        this.m_key = key as Key
        this.m_concertKey = this.m_key
        this.m_custom = custom
        if (invalid) {
            this.m_key = Key.INVALID
        }
        this.enforceLimits()
    }

    /** return "absolute degree" */
    degInKey(degree: number): number {
        return (degree + ((this.key() + 7) * 4)) % 7
    }

    symInKey(sym: SymId, degree: number): SymId {
        degree = this.degInKey(degree)
        const keyval = this.key()
        let accIndex = ACC_TABLE.indexOf(sym)
        if (keyval === 0 || Math.abs(keyval) > 7) {
            return sym
        }
        if (accIndex < 0) {
            return SymId.noSym
        }
        for (let i = 1; i <= Math.abs(keyval); ++i) {
            if ((degree * 2 + 2) % 7 === (keyval < 0 ? 8 - i : i) % 7) {
                accIndex += keyval < 0 ? -1 : 1
            }
        }
        return ACC_TABLE[accIndex] ?? SymId.noSym
    }
}

export const TIE_CONTEXT = 0x10
export const MIN_ACC_STATE = 0
export const MAX_ACC_STATE = 75

const ACC_STATE_NATURAL = AccidentalVal.NATURAL - AccidentalVal.MIN
const ACC_STATE_FLAT = AccidentalVal.FLAT - AccidentalVal.MIN
const ACC_STATE_SHARP = AccidentalVal.SHARP - AccidentalVal.MIN

/** set by accidental.ts to avoid a dependency cycle */
export let sym2accidentalValHook: (sym: SymId) => AccidentalVal = () => AccidentalVal.NATURAL
export function setSym2accidentalValHook(f: (sym: SymId) => AccidentalVal): void { sym2accidentalValHook = f }

export class AccidentalState {
    private m_state = new Uint8Array(MAX_ACC_STATE)
    private m_forceRestateAccidental: boolean[] = new Array(MAX_ACC_STATE).fill(false)

    clone(): AccidentalState {
        const s = new AccidentalState()
        s.m_state = this.m_state.slice()
        s.m_forceRestateAccidental = [...this.m_forceRestateAccidental]
        return s
    }

    init(key: Key | KeySigEvent): void {
        if (key instanceof KeySigEvent) {
            this.initKey(key.key())
            if (key.custom()) {
                for (const d of key.customKeyDefs()) {
                    const sym = key.symInKey(d.sym, d.degree)
                    const degree = key.degInKey(d.degree)
                    const a = sym2accidentalValHook(sym)
                    for (let octave = 0; octave < (11 * 7); octave += 7) {
                        const i = degree + octave
                        if (i >= MAX_ACC_STATE) {
                            break
                        }
                        this.m_state[i] = a - AccidentalVal.MIN
                    }
                }
            }
            this.m_forceRestateAccidental.fill(false)
            return
        }
        this.initKey(key)
    }

    private initKey(key: Key): void {
        this.m_state.fill(ACC_STATE_NATURAL)
        if (key > 0 && key <= Key.MAX) {
            for (let i = 0; i < key; ++i) {
                const idx = tpc2step(Tpc.TPC_F_S + i)
                for (let octave = 0; octave < (11 * 7); octave += 7) {
                    const j = idx + octave
                    if (j >= MAX_ACC_STATE) {
                        break
                    }
                    this.m_state[j] = ACC_STATE_SHARP
                }
            }
        } else if (key < 0 && key >= Key.MIN) {
            for (let i = 0; i > key; --i) {
                const idx = tpc2step(Tpc.TPC_B_B + i)
                for (let octave = 0; octave < (11 * 7); octave += 7) {
                    const j = idx + octave
                    if (j >= MAX_ACC_STATE) {
                        break
                    }
                    this.m_state[j] = ACC_STATE_FLAT
                }
            }
        }
    }

    /** returns [value, error] */
    accidentalValChecked(line: number): [AccidentalVal, boolean] {
        if (line < MIN_ACC_STATE || line >= MAX_ACC_STATE) {
            return [AccidentalVal.NATURAL, true]
        }
        return [((this.m_state[line] & 0x0f) + AccidentalVal.MIN) as AccidentalVal, false]
    }

    accidentalVal(line: number): AccidentalVal {
        return ((this.m_state[line] & 0x0f) + AccidentalVal.MIN) as AccidentalVal
    }

    forceRestateAccidental(line: number): boolean { return this.m_forceRestateAccidental[line] }

    tieContext(line: number): boolean { return (this.m_state[line] & TIE_CONTEXT) !== 0 }

    setAccidentalVal(line: number, val: AccidentalVal, tieContext = false): void {
        this.m_state[line] = (val - AccidentalVal.MIN) | (tieContext ? TIE_CONTEXT : 0)
    }

    setForceRestateAccidental(line: number, forceRestate: boolean): void {
        this.m_forceRestateAccidental[line] = forceRestate
    }
}

export class KeyList extends SortedMap<KeySigEvent> {
    key(tick: number): KeySigEvent {
        const ke = new KeySigEvent()
        ke.setConcertKey(Key.C)
        if (this.empty()) {
            return ke
        }
        const i = this.upperBound(tick)
        if (i === 0) {
            return ke
        }
        return this.valueAt(i - 1)
    }

    setKey(tick: number, k: KeySigEvent): void {
        this.set(tick, k)
    }

    nextKeyTick(tick: number): number {
        if (this.empty()) {
            return -1
        }
        const i = this.upperBound(tick + 1)
        return i === this.size() ? -1 : this.keyAt(i)
    }

    prevKey(tick: number): KeySigEvent {
        const kc = new KeySigEvent()
        kc.setConcertKey(Key.C)
        if (this.empty()) {
            return kc
        }
        let i = this.upperBound(tick)
        if (i === 0) {
            return kc
        }
        --i
        if (i === 0) {
            return kc
        }
        return this.valueAt(i - 1)
    }

    currentKeyTick(tick: number): number {
        if (this.empty()) {
            return 0
        }
        const i = this.upperBound(tick)
        if (i === 0) {
            return 0
        }
        return this.keyAt(i - 1)
    }
}
