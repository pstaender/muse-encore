/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/symnames.h/.cpp
 */

import { SymId } from './symid'
import { OLD_SYM_NAMES, SYM_NAMES } from './symnamesdata'

let s_nameToSymIdHash: Map<string, SymId> | null = null
let s_oldNameToSymIdHash: Map<string, SymId> | null = null

export class SymNames {
    static nameForSymId(id: SymId): string {
        return SYM_NAMES[id] ?? ''
    }

    static symIdByName(name: string, def: SymId = SymId.noSym): SymId {
        if (!s_nameToSymIdHash) {
            s_nameToSymIdHash = new Map()
            for (let i = 0; i < SYM_NAMES.length; ++i) {
                s_nameToSymIdHash.set(SYM_NAMES[i], i as SymId)
            }
        }
        return s_nameToSymIdHash.get(name) ?? def
    }

    static symIdByOldName(oldName: string): SymId {
        if (!s_oldNameToSymIdHash) {
            s_oldNameToSymIdHash = new Map(OLD_SYM_NAMES)
        }
        return s_oldNameToSymIdHash.get(oldName) ?? SymId.noSym
    }
}
