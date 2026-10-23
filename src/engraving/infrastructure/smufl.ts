/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/smufl.h/.cpp
 * (the code points are generated into symnamesdata.ts instead of loading glyphnames.json at runtime, the ranges into
 * smuflranges.ts instead of reading ranges.json)
 */

import { SymId } from '../types/symid'
import { SMUFL_ALT_CODES, SMUFL_CODES } from '../types/symnamesdata'
import { SymNames } from '../types/symnames'
import { SMUFL_RANGES } from './smuflranges'

export const SMUFL_ALL_SYMBOLS = 'All symbols'

export interface SmuflCode {
    smuflCode: number
    musicSymBlockCode: number
}

export class Smufl {
    static code(id: SymId): SmuflCode {
        return { smuflCode: SMUFL_CODES[id] ?? 0, musicSymBlockCode: SMUFL_ALT_CODES[id] ?? 0 }
    }

    static smuflCode(id: SymId): number {
        return SMUFL_CODES[id] ?? 0
    }

    static isValid(c: SmuflCode): boolean {
        return c.smuflCode !== 0 || c.musicSymBlockCode !== 0
    }

    private static s_ranges: Map<string, SymId[]> | null = null

    /** the symbols of the SMuFL ranges by their description, and SMUFL_ALL_SYMBOLS */
    static smuflRanges(): ReadonlyMap<string, readonly SymId[]> {
        if (!Smufl.s_ranges) {
            const ranges = new Map<string, SymId[]>()
            const allSymbols: SymId[] = []
            for (const [desc, glyphs] of SMUFL_RANGES) {
                const rangeSymbols: SymId[] = []
                for (const symName of glyphs.split(' ')) {
                    const symId = SymNames.symIdByName(symName)
                    if (symId !== SymId.noSym) {
                        rangeSymbols.push(symId)
                        allSymbols.push(symId)
                    }
                }
                ranges.set(desc, rangeSymbols)
            }
            ranges.set(SMUFL_ALL_SYMBOLS, allSymbols)
            Smufl.s_ranges = ranges
        }
        return Smufl.s_ranges
    }
}
