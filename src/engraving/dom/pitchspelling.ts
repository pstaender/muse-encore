/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/pitchspelling.h/.cpp (the parts needed for layout)
 */

import { AccidentalVal, Key, NoteSpellingType, PreferSharpFlat } from '../types/types'
import { mtrc } from '../../framework/global/translation'

// C++: declared in types/types.h, re-exported for convenience
export { NoteSpellingType }

export const INVALID_PITCH = -1
export const MIN_PITCH = 0
export const MAX_PITCH = 127

export enum Tpc {
    TPC_INVALID = -9,
    TPC_F_BBB, TPC_C_BBB, TPC_G_BBB, TPC_D_BBB, TPC_A_BBB, TPC_E_BBB, TPC_B_BBB,
    TPC_F_BB, TPC_C_BB, TPC_G_BB, TPC_D_BB, TPC_A_BB, TPC_E_BB, TPC_B_BB,
    TPC_F_B, TPC_C_B, TPC_G_B, TPC_D_B, TPC_A_B, TPC_E_B, TPC_B_B,
    TPC_F, TPC_C, TPC_G, TPC_D, TPC_A, TPC_E, TPC_B,
    TPC_F_S, TPC_C_S, TPC_G_S, TPC_D_S, TPC_A_S, TPC_E_S, TPC_B_S,
    TPC_F_SS, TPC_C_SS, TPC_G_SS, TPC_D_SS, TPC_A_SS, TPC_E_SS, TPC_B_SS,
    TPC_F_SSS, TPC_C_SSS, TPC_G_SSS, TPC_D_SSS, TPC_A_SSS, TPC_E_SSS, TPC_B_SSS,
    TPC_MIN = TPC_F_BBB,
    TPC_MAX = TPC_B_SSS,
}

export const TPC_DELTA_SEMITONE = 7 // the delta in tpc value to go 1 semitone up or down
export const TPC_DELTA_ENHARMONIC = 12 // the delta in tpc value to reach the next (or prev) enharmonic spelling
export const PITCH_DELTA_OCTAVE = 12 // the delta in pitch value to go 1 octave up or down
export const STEP_DELTA_OCTAVE = 7 // the number of steps in an octave
export const TPCS_PER_STEP = Math.trunc((Tpc.TPC_MAX - Tpc.TPC_MIN + 1) / STEP_DELTA_OCTAVE)
export const MIN_STEP = Math.trunc(MIN_PITCH * STEP_DELTA_OCTAVE / PITCH_DELTA_OCTAVE)
export const MAX_STEP = Math.trunc(MAX_PITCH * STEP_DELTA_OCTAVE / PITCH_DELTA_OCTAVE)
export const KEY_TO_TPC_OFFSET = Tpc.TPC_C - Key.C

export enum NoteCaseType {
    AUTO = -1, CAPITAL = 0, LOWER, UPPER,
}

export enum Prefer {
    FLATS = 8, NEAREST = 11, SHARPS = 13,
}

export function tpcIsValid(val: number): boolean {
    return val >= Tpc.TPC_MIN && val <= Tpc.TPC_MAX
}

export function pitchIsValid(pitch: number): boolean {
    return pitch >= MIN_PITCH && pitch <= MAX_PITCH
}

export function tpc2alter(tpc: number): AccidentalVal {
    return (Math.trunc((tpc - Tpc.TPC_MIN) / TPC_DELTA_SEMITONE) + AccidentalVal.MIN) as AccidentalVal
}

export function playingOctave(pitch: number, tpc: number): number {
    return Math.trunc((pitch - tpc2alter(tpc)) / PITCH_DELTA_OCTAVE) - 1
}

export function pitch2tpc(pitch: number, key: Key, prefer: Prefer): number {
    return (pitch * 7 + 26 - (prefer + key)) % 12 + (prefer + key)
}

const STEPS = [3, 0, 4, 1, 5, 2, 6] // f  c  g  d  a  e  b

export function tpc2step(tpc: number): number {
    return STEPS[(tpc - Tpc.TPC_MIN) % STEP_DELTA_OCTAVE]
}

const PITCHES = [
    // step: F   C   G   D   A   E   B
    2, -3, 4, -1, 6, 1, 8, // bbb
    3, -2, 5, 0, 7, 2, 9, // bb
    4, -1, 6, 1, 8, 3, 10, // b
    5, 0, 7, 2, 9, 4, 11, // -
    6, 1, 8, 3, 10, 5, 12, // #
    7, 2, 9, 4, 11, 6, 13, // ##
    8, 3, 10, 5, 12, 7, 14, // ###
]

export function tpc2pitch(tpc: number): number {
    return PITCHES[tpc - Tpc.TPC_MIN]
}

const SPELLINGS = [
    // bbb  bb  b   -   #  ##  ###
    -7, 0, 7, 14, 21, 28, 35, // C
    -5, 2, 9, 16, 23, 30, 37, // D
    -3, 4, 11, 18, 25, 32, 39, // E
    -8, -1, 6, 13, 20, 27, 34, // F
    -6, 1, 8, 15, 22, 29, 36, // G
    -4, 3, 10, 17, 24, 31, 38, // A
    -2, 5, 12, 19, 26, 33, 40, // B
]

export function step2tpc(step: number, alter: AccidentalVal = AccidentalVal.NATURAL): number {
    // TPC - tonal pitch classes
    // "line of fifth's" LOF
    const i = (step * TPCS_PER_STEP) + (alter - AccidentalVal.MIN)
    return SPELLINGS[i]
}

export function step2tpcByName(stepName: string, alter: AccidentalVal): number {
    if (!stepName) {
        return Tpc.TPC_INVALID
    }
    const r = 'cdefgab'.indexOf(stepName[0].toLowerCase())
    if (r < 0) {
        return Tpc.TPC_INVALID
    }
    return step2tpc(r, alter)
}

export function clampPitch(pitch: number, octaved = false): number {
    if (!octaved) {
        return Math.min(Math.max(pitch, MIN_PITCH), MAX_PITCH)
    }
    while (pitch > MAX_PITCH) {
        pitch -= PITCH_DELTA_OCTAVE
    }
    while (pitch < MIN_PITCH) {
        pitch += PITCH_DELTA_OCTAVE
    }
    return pitch
}

export function clampEnharmonic(tpc: number, useDoubleSharpsFlats = true): number {
    while (tpc > (useDoubleSharpsFlats ? Tpc.TPC_MAX : Tpc.TPC_B_S)) {
        tpc -= TPC_DELTA_ENHARMONIC
    }
    while (tpc < (useDoubleSharpsFlats ? Tpc.TPC_MIN : Tpc.TPC_F_B)) {
        tpc += TPC_DELTA_ENHARMONIC
    }
    return tpc
}

export function clampKey(key: Key, prefer: PreferSharpFlat = PreferSharpFlat.NONE): Key {
    let smallest = Key.G_B
    let largest = Key.F_S
    if (prefer !== PreferSharpFlat.AUTO) {
        smallest = (prefer === PreferSharpFlat.SHARPS) ? Key.A_B : Key.MIN
        largest = (prefer === PreferSharpFlat.FLATS) ? Key.E : Key.MAX
    }
    while (key < smallest) {
        key = (key + Key.DELTA_ENHARMONIC) as Key
    }
    while (key > largest) {
        key = (key - Key.DELTA_ENHARMONIC) as Key
    }
    return key
}

export function tpc2alterByKey(tpc: number, key: Key): number {
    return Math.trunc((tpc - key - Tpc.TPC_MIN + Key.MAX) / TPC_DELTA_SEMITONE) - (AccidentalVal.MAX + 1)
}

/** returns [step, alter] */
export function tpc2stepByKey(tpc: number, key: Key): [number, number] {
    return [tpc2step(tpc), tpc2alterByKey(tpc, key)]
}

/** returns [absStep, alter] */
export function pitch2absStepByKey(pitch: number, tpc: number, key: Key): [number, number] {
    // sanitize input data
    pitch = clampPitch(pitch, true)
    tpc = clampEnharmonic(tpc)
    key = clampKey(key)
    const octave = Math.trunc((pitch - tpc2alter(tpc)) / PITCH_DELTA_OCTAVE)
    const step = tpc2step(tpc)
    const alter = tpc2alterByKey(tpc, key)
    return [octave * STEP_DELTA_OCTAVE + step, alter]
}

const TPC_BY_STEP_AND_KEY: number[][] = [
    // step  C            D            E            F            G            A            B         Key
    [Tpc.TPC_C_B, Tpc.TPC_D_B, Tpc.TPC_E_B, Tpc.TPC_F_B, Tpc.TPC_G_B, Tpc.TPC_A_B, Tpc.TPC_B_B], // Cb
    [Tpc.TPC_C_B, Tpc.TPC_D_B, Tpc.TPC_E_B, Tpc.TPC_F, Tpc.TPC_G_B, Tpc.TPC_A_B, Tpc.TPC_B_B], // Gb
    [Tpc.TPC_C, Tpc.TPC_D_B, Tpc.TPC_E_B, Tpc.TPC_F, Tpc.TPC_G_B, Tpc.TPC_A_B, Tpc.TPC_B_B], // Db
    [Tpc.TPC_C, Tpc.TPC_D_B, Tpc.TPC_E_B, Tpc.TPC_F, Tpc.TPC_G, Tpc.TPC_A_B, Tpc.TPC_B_B], // Ab
    [Tpc.TPC_C, Tpc.TPC_D, Tpc.TPC_E_B, Tpc.TPC_F, Tpc.TPC_G, Tpc.TPC_A_B, Tpc.TPC_B_B], // Eb
    [Tpc.TPC_C, Tpc.TPC_D, Tpc.TPC_E_B, Tpc.TPC_F, Tpc.TPC_G, Tpc.TPC_A, Tpc.TPC_B_B], // B
    [Tpc.TPC_C, Tpc.TPC_D, Tpc.TPC_E, Tpc.TPC_F, Tpc.TPC_G, Tpc.TPC_A, Tpc.TPC_B_B], // F
    [Tpc.TPC_C, Tpc.TPC_D, Tpc.TPC_E, Tpc.TPC_F, Tpc.TPC_G, Tpc.TPC_A, Tpc.TPC_B], // C
    [Tpc.TPC_C, Tpc.TPC_D, Tpc.TPC_E, Tpc.TPC_F_S, Tpc.TPC_G, Tpc.TPC_A, Tpc.TPC_B], // G
    [Tpc.TPC_C_S, Tpc.TPC_D, Tpc.TPC_E, Tpc.TPC_F_S, Tpc.TPC_G, Tpc.TPC_A, Tpc.TPC_B], // D
    [Tpc.TPC_C_S, Tpc.TPC_D, Tpc.TPC_E, Tpc.TPC_F_S, Tpc.TPC_G_S, Tpc.TPC_A, Tpc.TPC_B], // A
    [Tpc.TPC_C_S, Tpc.TPC_D_S, Tpc.TPC_E, Tpc.TPC_F_S, Tpc.TPC_G_S, Tpc.TPC_A, Tpc.TPC_B], // E
    [Tpc.TPC_C_S, Tpc.TPC_D_S, Tpc.TPC_E, Tpc.TPC_F_S, Tpc.TPC_G_S, Tpc.TPC_A_S, Tpc.TPC_B], // H
    [Tpc.TPC_C_S, Tpc.TPC_D_S, Tpc.TPC_E_S, Tpc.TPC_F_S, Tpc.TPC_G_S, Tpc.TPC_A_S, Tpc.TPC_B], // F#
    [Tpc.TPC_C_S, Tpc.TPC_D_S, Tpc.TPC_E_S, Tpc.TPC_F_S, Tpc.TPC_G_S, Tpc.TPC_A_S, Tpc.TPC_B_S], // C#
]

export function step2tpcByKey(step: number, key: Key): number {
    while (step < 0) {
        step += STEP_DELTA_OCTAVE
    }
    return TPC_BY_STEP_AND_KEY[clampKey(key) - Key.MIN][step % STEP_DELTA_OCTAVE]
}

export function key2Tpc(key: Key): number {
    return key + KEY_TO_TPC_OFFSET
}

export function tpc2Key(tpc: number): Key {
    return (tpc - KEY_TO_TPC_OFFSET) as Key
}

export function tpc2stepName(tpc: number): string {
    return 'FCGDAEB'[(tpc - Tpc.TPC_MIN) % 7]
}

export function tpc2degree(tpc: number, key: Key): number {
    const names = 'CDEFGAB'
    const scales = 'CGDAEBFCGDAEBFC'
    const scale = scales[key + 7]
    const stepName = tpc2stepName(tpc)
    return (names.indexOf(stepName) - names.indexOf(scale) + 28) % 7
}

// TConv::userName(AccidentalVal, full) (types/typesconv.cpp, untranslated; tpc2name translates it)
const ACCIDENTALS_NAMES: { accidental: AccidentalVal, name: string, fullName: string }[] = [
    { accidental: AccidentalVal.SHARP3, name: 'triple \u266f', fullName: 'triple sharp' },
    { accidental: AccidentalVal.SHARP2, name: 'double \u266f', fullName: 'double sharp' },
    { accidental: AccidentalVal.SHARP, name: '\u266f', fullName: 'sharp' },
    { accidental: AccidentalVal.NATURAL, name: '\u266e', fullName: 'natural' },
    { accidental: AccidentalVal.FLAT, name: '\u266d', fullName: 'flat' },
    { accidental: AccidentalVal.FLAT2, name: 'double \u266d', fullName: 'double flat' },
    { accidental: AccidentalVal.FLAT3, name: 'triple \u266d', fullName: 'triple flat' },
]

/** muse::mtrc("engraving", TConv::userName(accidental, full)) */
export function accidentalUserName(accidental: AccidentalVal, full: boolean): string {
    const it = ACCIDENTALS_NAMES.find(i => i.accidental === accidental)
    return mtrc('engraving', it ? (full ? it.fullName : it.name) : '')
}

/** C++ tpcUserName(int tpc, int pitch, bool explicitAccidental, bool full) */
export function tpcUserName(tpc: number, pitch: number, explicitAccidental: boolean, full = false): string {
    let pitchStr = tpc2name(tpc, NoteSpellingType.STANDARD, NoteCaseType.AUTO, explicitAccidental, full)
    if (!explicitAccidental) {
        pitchStr = pitchStr.replaceAll('b', '♭').replaceAll('#', '♯')
    }

    const octaveStr = String(Math.trunc((pitch - tpc2alter(tpc)) / PITCH_DELTA_OCTAVE) - 1)

    return pitchStr + octaveStr
}

//---------------------------------------------------------
//   tpc2name
//    return note name
//---------------------------------------------------------

export function tpc2name(tpc: number, noteSpelling: NoteSpellingType, noteCase: NoteCaseType, explicitAccidental = false,
    full = false): string {
    const { s, acc } = tpc2nameStringAcc(tpc, noteSpelling, noteCase, explicitAccidental, full)
    return s + (explicitAccidental ? ' ' : '') + acc
}

/** C++ tpc2name(int, NoteSpellingType, NoteCaseType, String& s, String& acc, bool, bool) */
export function tpc2nameStringAcc(tpc: number, noteSpelling: NoteSpellingType, noteCase: NoteCaseType, explicitAccidental = false,
    full = false): { s: string, acc: string } {
    const { s, acc: accVal } = tpc2nameParts(tpc, noteSpelling, noteCase)
    let acc = ''
    switch (accVal) {
    case AccidentalVal.FLAT3:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.FLAT3, full)
        } else if (noteSpelling === NoteSpellingType.GERMAN_PURE) {
            switch (tpc) {
            case Tpc.TPC_A_BBB: acc = 'sasas'
                break
            case Tpc.TPC_E_BBB: acc = 'seses'
                break
            default: acc = 'eseses'
            }
        } else {
            acc = 'bbb'
        }
        break
    case AccidentalVal.FLAT2:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.FLAT2, full)
        } else if (noteSpelling === NoteSpellingType.GERMAN_PURE) {
            switch (tpc) {
            case Tpc.TPC_A_BB: acc = 'sas'
                break
            case Tpc.TPC_E_BB: acc = 'ses'
                break
            default: acc = 'eses'
            }
        } else {
            acc = 'bb'
        }
        break
    case AccidentalVal.FLAT:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.FLAT, full)
        } else if (noteSpelling === NoteSpellingType.GERMAN_PURE) {
            acc = (tpc === Tpc.TPC_A_B || tpc === Tpc.TPC_E_B) ? 's' : 'es'
        } else {
            acc = 'b'
        }
        break
    case AccidentalVal.NATURAL: acc = ''
        break
    case AccidentalVal.SHARP:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.SHARP, full)
        } else {
            acc = (noteSpelling === NoteSpellingType.GERMAN_PURE) ? 'is' : '#'
        }
        break
    case AccidentalVal.SHARP2:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.SHARP2, full)
        } else {
            acc = (noteSpelling === NoteSpellingType.GERMAN_PURE) ? 'isis' : '##'
        }
        break
    case AccidentalVal.SHARP3:
        if (explicitAccidental) {
            acc = accidentalUserName(AccidentalVal.SHARP3, full)
        } else {
            acc = (noteSpelling === NoteSpellingType.GERMAN_PURE) ? 'isisis' : '###'
        }
        break
    default:
        acc = ''
        break
    }
    return { s, acc }
}

/** C++ tpc2name(int, NoteSpellingType, NoteCaseType, String& s, AccidentalVal& acc) */
export function tpc2nameParts(tpc: number, noteSpelling: NoteSpellingType, noteCase: NoteCaseType): { s: string, acc: AccidentalVal } {
    const names = 'FCGDAEB'
    const gnames = 'FCGDAEH'
    const snames = ['Fa', 'Do', 'Sol', 'Re', 'La', 'Mi', 'Si']

    let acc = tpc2alter(tpc)
    const idx = (tpc - Tpc.TPC_MIN) % TPC_DELTA_SEMITONE
    let s: string
    switch (noteSpelling) {
    case NoteSpellingType.GERMAN:
    case NoteSpellingType.GERMAN_PURE:
        s = gnames[idx]
        if (s === 'H' && acc === AccidentalVal.FLAT) {
            s = 'B'
            if (noteSpelling === NoteSpellingType.GERMAN_PURE) {
                acc = AccidentalVal.NATURAL
            }
        }
        break
    case NoteSpellingType.SOLFEGGIO:
        s = snames[idx]
        break
    case NoteSpellingType.FRENCH:
        s = snames[idx]
        if (s === 'Re') {
            s = 'R\u00e9'
        }
        break
    default:
        s = names[idx]
        break
    }
    switch (noteCase) {
    case NoteCaseType.LOWER: s = s.toLowerCase()
        break
    case NoteCaseType.UPPER: s = s.toUpperCase()
        break
    case NoteCaseType.CAPITAL:
    case NoteCaseType.AUTO:
    default:
        break
    }
    return { s, acc }
}

/** Finds tpc of a note based on an altered interval from a starting note */
export function tpcInterval(startTpc: number, interval: number, alter: number): number {
    const intervals = [
        //  1  2  3   4  5  6  7
        0, 2, 4, -1, 1, 3, 5,
    ]

    //ensure that we don't have anything more than double sharp or double flat
    //(I know, breaking some convention, but it's the best we can do for now)
    return clampEnharmonic(startTpc + intervals[(interval - 1) % 7] + alter * TPC_DELTA_SEMITONE)
}

/** C++ tpc2Function(int tpc, Key key, String& accName, String& stepName) */
export function tpc2FunctionParts(tpc: number, key: Key): { accName: string; stepName: string } {
    if (key === Key.INVALID) {
        return { accName: '', stepName: '' }
    }
    const step = tpc2degree(tpc, key)
    const stepNames = '1234567'
    const stepName = stepNames.charAt(step)

    const alter = tpc2alterByKey(tpc, key)
    const accidentalNo = Math.abs(alter)
    const flat = alter < 0
    return { accName: (flat ? 'b' : '#').repeat(accidentalNo), stepName }
}

export function tpc2Function(tpc: number, key: Key): string {
    const { accName, stepName } = tpc2FunctionParts(tpc, key)
    return accName + stepName
}

const isDigitChar = (c: string): boolean => c >= '0' && c <= '9'

/** C++ function2Tpc(const String&, Key, size_t& idx) */
export function function2Tpc(s: string, key: Key): { tpc: number; idx: number } {
    // TODO - PHV: allow for alternate spellings
    let alter = 0
    let step: number
    let idx = 0

    if (s.length && isDigitChar(s.charAt(0))) {
        step = Number(s.charAt(0))
        idx = 1
    } else if (s.length > 1) {
        const NUM_LEN = 1
        const accIdx = s.length - NUM_LEN
        const acc = s.substring(0, accIdx)
        const num = s.substring(s.length - NUM_LEN)
        if (num.length > NUM_LEN || num.length === 0 || !isDigitChar(num.charAt(0))) {
            return { tpc: Tpc.TPC_INVALID, idx }
        }

        step = Number(num.charAt(0))
        idx = NUM_LEN
        if (acc.startsWith('bb')) {
            alter = -2
            idx += 2
        } else if (acc.startsWith('b')) {
            alter = -1
            idx += 1
        } else if (acc.startsWith('#')) {
            alter = 1
            idx += 1
        } else if (acc.startsWith('##')) {
            alter = 2
            idx += 2
        }
    } else {
        return { tpc: Tpc.TPC_INVALID, idx }
    }

    const keyTpc = key + 14 //tpc of key (ex. F# major would be Tpc::F_S)
    return { tpc: tpcInterval(keyTpc, step, alter), idx }
}

/** C++ convertNote(const String&, NoteSpellingType, NoteCaseType&, size_t& idx) */
export function convertNote(s: string, noteSpelling: NoteSpellingType, noteCaseIn: NoteCaseType):
    { tpc: number; noteCase: NoteCaseType; idx: number } {
    let useGerman = false
    let useSolfeggio = false
    const spellings = [
        // bb  b   -   #  ##
        0, 7, 14, 21, 28, // C
        2, 9, 16, 23, 30, // D
        4, 11, 18, 25, 32, // E
        -1, 6, 13, 20, 27, // F
        1, 8, 15, 22, 29, // G
        3, 10, 17, 24, 31, // A
        5, 12, 19, 26, 33, // B
    ]
    let noteCase = noteCaseIn
    let idx = 0
    if (s.length === 0) {
        return { tpc: Tpc.TPC_INVALID, noteCase, idx }
    }
    const isLower = (c: string): boolean => c !== c.toUpperCase() && c === c.toLowerCase()
    const isUpper = (c: string): boolean => c !== c.toLowerCase() && c === c.toUpperCase()
    noteCase = isLower(s.charAt(0)) ? NoteCaseType.LOWER : NoteCaseType.CAPITAL
    let acci: number
    switch (noteSpelling) {
    case NoteSpellingType.SOLFEGGIO:
    case NoteSpellingType.FRENCH:
        useSolfeggio = true
        if (s.toLowerCase().startsWith('sol')) {
            acci = 3
        } else {
            acci = 2
        }
        break
    case NoteSpellingType.GERMAN:
    case NoteSpellingType.GERMAN_PURE:
        useGerman = true
        acci = 1
        break
    default:
        acci = 1
    }
    idx = acci
    let alter = 0
    const acc = s.substring(acci)
    if (acc.length) {
        if (acc.startsWith('bb')) {
            alter = -2
            idx += 2
        } else if (acc.startsWith('b')) {
            alter = -1
            idx += 1
        } else if (useGerman && acc.startsWith('eses')) {
            alter = -2
            idx += 4
        } else if (useGerman && (acc.startsWith('ses') || acc.startsWith('sas'))) {
            alter = -2
            idx += 3
        } else if (useGerman && acc.startsWith('es')) {
            alter = -1
            idx += 2
        } else if (useGerman && acc.startsWith('s') && !acc.startsWith('su')) {
            alter = -1
            idx += 1
        } else if (acc.startsWith('##')) {
            alter = 2
            idx += 2
        } else if (acc.startsWith('x')) {
            alter = 2
            idx += 1
        } else if (acc.startsWith('#')) {
            alter = 1
            idx += 1
        } else if (useGerman && acc.startsWith('isis')) {
            alter = 2
            idx += 4
        } else if (useGerman && acc.startsWith('is')) {
            alter = 1
            idx += 2
        }
    }
    let r: number
    const invalid = { tpc: Tpc.TPC_INVALID, noteCase, idx }
    if (useGerman) {
        switch (s.charAt(0).toLowerCase()) {
        case 'c': r = 0; break
        case 'd': r = 1; break
        case 'e': r = 2; break
        case 'f': r = 3; break
        case 'g': r = 4; break
        case 'a': r = 5; break
        case 'h': r = 6; break
        case 'b':
            if (alter && alter !== -1) {
                return invalid
            }
            r = 6
            alter = -1
            break
        default:
            return invalid
        }
    } else if (useSolfeggio) {
        if (s.length < 2) {
            return invalid
        }
        if (isUpper(s.charAt(1))) {
            noteCase = NoteCaseType.UPPER
        }
        const ss = s.toLowerCase().substring(0, 2)
        if (ss === 'do') {
            r = 0
        } else if (ss === 're' || ss === 'ré') {
            r = 1
        } else if (ss === 'mi') {
            r = 2
        } else if (ss === 'fa') {
            r = 3
        } else if (ss === 'so') { // sol, but only check first 2 characters
            r = 4
        } else if (ss === 'la') {
            r = 5
        } else if (ss === 'si') {
            r = 6
        } else {
            return { tpc: Tpc.TPC_INVALID, noteCase, idx }
        }
    } else {
        switch (s.charAt(0).toLowerCase()) {
        case 'c': r = 0; break
        case 'd': r = 1; break
        case 'e': r = 2; break
        case 'f': r = 3; break
        case 'g': r = 4; break
        case 'a': r = 5; break
        case 'b': r = 6; break
        default: return invalid
        }
    }
    return { tpc: spellings[r * 5 + alter + 2], noteCase, idx }
}

const PITCH_BY_STEP_AND_KEY: readonly number[][] = [
    // step  C   D   E   F   G   A   B           Key
    [-1, 1, 3, 4, 6, 8, 10], // Cb
    [-1, 1, 3, 5, 6, 8, 10], // Gb
    [0, 1, 3, 5, 6, 8, 10], // Db
    [0, 1, 3, 5, 7, 8, 10], // Ab
    [0, 2, 3, 5, 7, 8, 10], // Eb
    [0, 2, 3, 5, 7, 9, 10], // B
    [0, 2, 4, 5, 7, 9, 10], // F
    [0, 2, 4, 5, 7, 9, 11], // C
    [0, 2, 4, 6, 7, 9, 11], // G
    [1, 2, 4, 6, 7, 9, 11], // D
    [1, 2, 4, 6, 8, 9, 11], // A
    [1, 3, 4, 6, 8, 9, 11], // E
    [1, 3, 4, 6, 8, 10, 11], // H
    [1, 3, 5, 6, 8, 10, 11], // F#
    [1, 3, 5, 6, 8, 10, 12], // C#
]

export function step2deltaPitchByKey(step: number, key: Key): number {
    while (step < MIN_STEP) {
        step += STEP_DELTA_OCTAVE
    }
    return PITCH_BY_STEP_AND_KEY[clampKey(key) - Key.MIN][step % STEP_DELTA_OCTAVE]
}

export function absStep2pitchByKey(step: number, key: Key): number {
    // sanitize input data
    if (step < MIN_STEP) {
        step += STEP_DELTA_OCTAVE
    }
    if (step > MAX_STEP) {
        step -= STEP_DELTA_OCTAVE
    }
    key = clampKey(key)

    const octave = Math.trunc(step / STEP_DELTA_OCTAVE)
    const deltaPitch = step2deltaPitchByKey(step % STEP_DELTA_OCTAVE, key)
    return octave * PITCH_DELTA_OCTAVE + deltaPitch
}

/** C++ enharmonicSpelling[15][34]: the penalty of a tpc (line of fifths, bb..##) in a key (Cb..C#) */
export const ENHARMONIC_SPELLING: readonly (readonly number[])[] = [
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 100, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
]

/** returns the tpc of tpcs that fits best into the key (the lowest spelling penalty) */
export function bestEnharmonicFit(tpcs: readonly number[], key: Key): number {
    const keyIndex = key - Key.MIN
    if (keyIndex < 0 || keyIndex >= Key.NUM_OF) {
        return tpcs[0]
    }

    // Highest penalty in enharmonicSpelling available (100) + 1
    let bestPenalty = 101
    let closestTpc: number = Tpc.TPC_INVALID

    for (const tpc of tpcs) {
        if (tpc === Tpc.TPC_INVALID) {
            continue
        }

        const lof = tpc - Tpc.TPC_MIN
        if (lof < 0 || lof >= 34) {
            continue
        }

        const penalty = ENHARMONIC_SPELLING[keyIndex][lof]

        if (penalty < bestPenalty) {
            bestPenalty = penalty
            closestTpc = tpc
        }
    }

    return closestTpc
}
