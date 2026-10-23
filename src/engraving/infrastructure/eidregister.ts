/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/eidregister.h/.cpp
 *
 * EIDs are kept in their string form (see eid.ts).
 */

import type { EngravingObject } from '../dom/engravingobject'
import { EID } from './eid'

export class EIDRegister {
    /** C++ MScore::testMode: sequential EIDs */
    static testMode = false

    private m_eidToItem = new Map<string, EngravingObject>()
    private m_itemToEid = new Map<EngravingObject, string>()
    private m_maxValTestMode = { value: 0n }

    newEIDForItem(item: EngravingObject): string {
        const eid = (EIDRegister.testMode ? EID.newUniqueTestMode(this.m_maxValTestMode) : EID.newUnique()).toStdString()
        this.registerItemEID(eid, item)
        return eid
    }

    registerItemEID(eid: string, item: EngravingObject): void {
        if (!eid) {
            return
        }
        // C++ asserts that neither the EID nor the item is registered yet
        if (this.m_eidToItem.has(eid) || this.m_itemToEid.has(item)) {
            return
        }
        this.m_eidToItem.set(eid, item)
        this.m_itemToEid.set(item, eid)
        if (EIDRegister.testMode) {
            const e = EID.fromStdString(eid)
            if (e.isValid()) {
                EID.updateMaxValTestMode(e, this.m_maxValTestMode)
            }
        }
    }

    removeItem(item: EngravingObject): void {
        const eid = this.m_itemToEid.get(item)
        if (eid === undefined) {
            return
        }
        this.m_itemToEid.delete(item)
        this.m_eidToItem.delete(eid)
    }

    itemFromEID(eid: string): EngravingObject | null {
        return this.m_eidToItem.get(eid) ?? null
    }

    /** empty string: invalid EID */
    EIDFromItem(item: EngravingObject): string {
        return this.m_itemToEid.get(item) ?? ''
    }
}
