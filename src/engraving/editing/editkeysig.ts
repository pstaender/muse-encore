/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editkeysig.h/.cpp
 */

import type { EngravingObject } from '../dom/engravingobject'
import type { KeySig } from '../dom/keysig'
import type { KeySigEvent } from '../dom/key'
import type { EditData } from './editdata'
import { CommandType, UndoCommand } from './undo'

export class ChangeKeySig extends UndoCommand {
    private keysig: KeySig
    private ks: KeySigEvent
    private showCourtesy: boolean
    private evtInStaff: boolean

    constructor(k: KeySig, newKeySig: KeySigEvent, sc: boolean, addEvtToStaff = true) {
        super()
        this.keysig = k
        this.ks = newKeySig.clone()
        this.showCourtesy = sc
        this.evtInStaff = addEvtToStaff
    }

    override type(): CommandType { return CommandType.ChangeKeySig }
    override name(): string { return 'ChangeKeySig' }
    override objectItems(): EngravingObject[] { return [this.keysig] }

    protected override flip(_ed: EditData | null): void {
        const segment = this.keysig.segment()!
        const tick = segment.tick()
        const staff = this.keysig.staff()!

        const curEvtInStaff = staff.currentKeyTick(tick).eq(tick)
        const curKey = this.keysig.keySigEvent().clone()
        const curShowCourtesy = this.keysig.showCourtesy()

        this.keysig.setKeySigEvent(this.ks)
        this.keysig.setShowCourtesy(this.showCourtesy)

        // Add/remove the corresponding key events, if appropriate.
        if (this.evtInStaff) {
            staff.setKey(tick, this.ks) // replace
        } else if (curEvtInStaff) {
            staff.removeKey(tick) // if nothing to add instead, just remove.
        }
        // If no keysig event corresponds to the key signature then this keysig
        // is probably generated. Otherwise it is probably added manually.
        // Set segment flags according to this, layout will change it if needed.
        segment.setEnabled(this.evtInStaff)
        segment.setHeader(!this.evtInStaff && segment.rtick().isZero())

        this.showCourtesy = curShowCourtesy
        this.ks = curKey
        this.evtInStaff = curEvtInStaff
        this.keysig.triggerLayout()
        this.keysig.score().setLayout(staff.nextKeyTick(tick), this.keysig.staffIdx())
    }
}
