/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/smufl.h/.cpp
 * (the code points are generated into symnamesdata.ts instead of loading glyphnames.json at runtime)
 */

import { SymId } from '../types/symid'
import { SMUFL_ALT_CODES, SMUFL_CODES } from '../types/symnamesdata'

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
}
