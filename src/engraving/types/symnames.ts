/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/symnames.h/.cpp
 */

import { SymId } from './symid'
import { OLD_SYM_NAMES, SYM_NAMES, SYM_USER_NAMES, SYM_USER_NAMES_UNTRANSLATABLE } from './symnamesdata'
import { TranslatableString } from '../../framework/global/types/translatablestring'

let s_nameToSymIdHash: Map<string, SymId> | null = null
let s_oldNameToSymIdHash: Map<string, SymId> | null = null

export class SymNames {
    static nameForSymId(id: SymId): string {
        return SYM_NAMES[id] ?? ''
    }

    static userNameForSymId(id: SymId): TranslatableString {
        const str = SYM_USER_NAMES[id] ?? ''
        return SYM_USER_NAMES_UNTRANSLATABLE.has(id) ? TranslatableString.untranslatable(str) : new TranslatableString('engraving/sym', str)
    }

    static translatedUserNameForSymId(id: SymId): string {
        return SymNames.userNameForSymId(id).translated()
    }

    static symIdByName(name: string, def: SymId = SymId.noSym): SymId {
        if (!s_nameToSymIdHash) {
            s_nameToSymIdHash = new Map()
            for (let i = 0; i < SYM_NAMES.length; ++i) {
                s_nameToSymIdHash.set(SYM_NAMES[i], i as SymId)
            }
            // C++ s_symNames has lastSym + 1 entries, the last one (lastSym) is empty: "" is lastSym
            for (let i = SYM_NAMES.length; i <= SymId.lastSym; ++i) {
                if (!s_nameToSymIdHash.has('')) {
                    s_nameToSymIdHash.set('', i as SymId)
                }
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
