/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/pitchspelling.h/.cpp (the parts needed for layout)
 */

import { AccidentalVal, Key, PreferSharpFlat } from '../types/types'

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
