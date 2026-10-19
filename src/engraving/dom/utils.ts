/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/utils.h/.cpp (subset)
 */

import { Fraction } from '../types/fraction'
import { SymId, type SymIdList } from '../types/symid'
import { ClefType, Key, TimeSigStyle } from '../types/types'
import { ClefInfo } from './clefinfo'
import {
    MIN_PITCH, PITCH_DELTA_OCTAVE, Prefer, STEP_DELTA_OCTAVE, clampPitch, pitch2tpc, tpc2pitch, tpc2step,
} from './pitchspelling'
import type { Tuplet } from './tuplet'

const PTAB: number[][] = [
    //   c  d  e  f  g   a  b
    [-1, 1, 3, 4, 6, 8, 10], // Bes
    [-1, 1, 3, 5, 6, 8, 10], // Ges
    [0, 1, 3, 5, 6, 8, 10], // Des
    [0, 1, 3, 5, 7, 8, 10], // As
    [0, 2, 3, 5, 7, 8, 10], // Es
    [0, 2, 3, 5, 7, 9, 10], // B
    [0, 2, 4, 5, 7, 9, 10], // F
    [0, 2, 4, 5, 7, 9, 11], // C
    [0, 2, 4, 6, 7, 9, 11], // G
    [1, 2, 4, 6, 7, 9, 11], // D
    [1, 2, 4, 6, 8, 9, 11], // A
    [1, 3, 4, 6, 8, 9, 11], // E
    [1, 3, 4, 6, 8, 10, 11], // H
    [1, 3, 5, 6, 8, 10, 11], // Fis
    [1, 3, 5, 6, 8, 10, 12], // Cis
]

export function pitchKeyAdjust(step: number, key: Key): number {
    return PTAB[key + 7][step]
}

export function line2pitch(line: number, clef: ClefType, key: Key): number {
    let l = Math.max(ClefInfo.pitchOffset(clef) - line, 0)
    const octave = Math.trunc(l / STEP_DELTA_OCTAVE)
    l %= STEP_DELTA_OCTAVE
    const pitch = pitchKeyAdjust(l, key) + octave * PITCH_DELTA_OCTAVE
    return clampPitch(pitch)
}

export function y2pitch(y: number, clef: ClefType, spatium: number): number {
    const l = Math.round(y / spatium * 2.0)
    return line2pitch(l, clef, Key.C)
}

/** absStep(tpc, pitch) */
export function absStep(tpc: number, pitch?: number): number {
    if (pitch === undefined) {
        // absStep(pitch): TODO - does this need to be key-aware?
        pitch = tpc
        tpc = pitch2tpc(pitch, Key.C, Prefer.NEAREST)
    }
    let line = tpc2step(tpc) + Math.trunc(pitch / PITCH_DELTA_OCTAVE) * STEP_DELTA_OCTAVE
    const tpcPitch = tpc2pitch(tpc)
    if (tpcPitch < MIN_PITCH) {
        line += STEP_DELTA_OCTAVE
    } else {
        line -= Math.trunc(tpcPitch / PITCH_DELTA_OCTAVE) * STEP_DELTA_OCTAVE
    }
    return line
}

/** absStep(line, clef) */
export function absStepFromLine(line: number, clef: ClefType): number {
    return ClefInfo.pitchOffset(clef) - line
}

export function relStep(line: number, clef: ClefType): number {
    return ClefInfo.pitchOffset(clef) - line
}

export function relStepFromPitch(pitch: number, tpc: number, clef: ClefType): number {
    return relStep(absStep(tpc, pitch), clef)
}

export function pitch2step(pitch: number): number {
    //           C  C# D  D# E  F  F# G  G# A  A# B
    const tab = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
    return tab[pitch % 12]
}

export function step2pitch(step: number): number {
    const tab = [0, 2, 4, 5, 7, 9, 11]
    return tab[step % 7]
}

const TS_DICT: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmall,
    '0': SymId.timeSig0,
    '1': SymId.timeSig1,
    '2': SymId.timeSig2,
    '3': SymId.timeSig3,
    '4': SymId.timeSig4,
    '5': SymId.timeSig5,
    '6': SymId.timeSig6,
    '7': SymId.timeSig7,
    '8': SymId.timeSig8,
    '9': SymId.timeSig9,
    'C': SymId.timeSigCommon,
    '(': SymId.timeSigParensLeftSmall,
    ')': SymId.timeSigParensRightSmall,
    '[': SymId.timeSigBracketLeftSmall,
    ']': SymId.timeSigBracketRightSmall,
    '¢': SymId.timeSigCutCommon,
    '½': SymId.timeSigFractionHalf,
    '¼': SymId.timeSigFractionQuarter,
    '*': SymId.timeSigMultiply,
    'X': SymId.timeSigMultiply,
    'x': SymId.timeSigMultiply,
    '×': SymId.timeSigMultiply,
    [String.fromCharCode(59664)]: SymId.mensuralProlation1,
    'O': SymId.mensuralProlation2,
    [String.fromCharCode(59665)]: SymId.mensuralProlation2,
    'Ø': SymId.mensuralProlation3,
    [String.fromCharCode(59666)]: SymId.mensuralProlation3,
    [String.fromCharCode(59667)]: SymId.mensuralProlation4,
    [String.fromCharCode(59668)]: SymId.mensuralProlation5,
    [String.fromCharCode(59669)]: SymId.mensuralProlation6,
    [String.fromCharCode(59670)]: SymId.mensuralProlation7,
    [String.fromCharCode(59671)]: SymId.mensuralProlation8,
    [String.fromCharCode(59672)]: SymId.mensuralProlation9,
    [String.fromCharCode(59673)]: SymId.mensuralProlation10,
    [String.fromCharCode(59674)]: SymId.mensuralProlation11,
}

const TS_DICT_LARGE: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmallLarge,
    '0': SymId.timeSig0Large,
    '1': SymId.timeSig1Large,
    '2': SymId.timeSig2Large,
    '3': SymId.timeSig3Large,
    '4': SymId.timeSig4Large,
    '5': SymId.timeSig5Large,
    '6': SymId.timeSig6Large,
    '7': SymId.timeSig7Large,
    '8': SymId.timeSig8Large,
    '9': SymId.timeSig9Large,
    'C': SymId.timeSigCommonLarge,
    '(': SymId.timeSigParensLeftSmallLarge,
    ')': SymId.timeSigParensRightSmallLarge,
    '[': SymId.timeSigBracketLeftSmallLarge,
    ']': SymId.timeSigBracketRightSmallLarge,
    '¢': SymId.timeSigCutCommonLarge,
    '½': SymId.timeSigFractionHalfLarge,
    '¼': SymId.timeSigFractionQuarterLarge,
    '*': SymId.timeSigMultiplyLarge,
    'X': SymId.timeSigMultiplyLarge,
    'x': SymId.timeSigMultiplyLarge,
    '×': SymId.timeSigMultiplyLarge,
}

const TS_DICT_NARROW: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmallNarrow,
    '0': SymId.timeSig0Narrow,
    '1': SymId.timeSig1Narrow,
    '2': SymId.timeSig2Narrow,
    '3': SymId.timeSig3Narrow,
    '4': SymId.timeSig4Narrow,
    '5': SymId.timeSig5Narrow,
    '6': SymId.timeSig6Narrow,
    '7': SymId.timeSig7Narrow,
    '8': SymId.timeSig8Narrow,
    '9': SymId.timeSig9Narrow,
    'C': SymId.timeSigCommonNarrow,
    '(': SymId.timeSigParensLeftSmallNarrow,
    ')': SymId.timeSigParensRightSmallNarrow,
    '[': SymId.timeSigBracketLeftSmallNarrow,
    ']': SymId.timeSigBracketRightSmallNarrow,
    '¢': SymId.timeSigCutCommonNarrow,
    '½': SymId.timeSigFractionHalfNarrow,
    '¼': SymId.timeSigFractionQuarterNarrow,
    '*': SymId.timeSigMultiplyNarrow,
    'X': SymId.timeSigMultiplyNarrow,
    '×': SymId.timeSigMultiplyNarrow,
}

export function timeSigSymIdsFromString(string: string, timeSigStyle: TimeSigStyle = TimeSigStyle.NORMAL): SymIdList {
    const dict = timeSigStyle === TimeSigStyle.NARROW ? TS_DICT_NARROW
        : timeSigStyle === TimeSigStyle.LARGE ? TS_DICT_LARGE : TS_DICT
    const list: SymIdList = []
    // iterate UTF-16 code units like C++ String (char16_t)
    for (let i = 0; i < string.length; ++i) {
        const sym = dict[string[i]]
        if (sym !== undefined && sym !== SymId.noSym) {
            list.push(sym)
        }
    }
    return list
}

export function actualTicks(duration: Fraction, tuplet: Tuplet | null, timeStretch: Fraction): Fraction {
    let f = duration.div(timeStretch)
    for (let t = tuplet; t; t = t.tuplet()) {
        f = f.div(t.ratio())
    }
    return f
}
