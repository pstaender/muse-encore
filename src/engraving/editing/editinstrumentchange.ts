/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editinstrumentchange.h/.cpp
 */

import type { EngravingObject } from '../dom/engravingobject'
import type { InstrumentChange } from '../dom/instrchange'
import type { Instrument } from '../dom/instrument'
import type { EditData } from './editdata'
import { CommandType, UndoCommand } from './undo'

/** change instrument in an InstrumentChange element */
export class ChangeInstrument extends UndoCommand {
    constructor(private is: InstrumentChange, private instrument: Instrument) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeInstrument }
    override name(): string { return 'ChangeInstrument' }
    override objectItems(): EngravingObject[] { return [this.is] }

    protected override flip(_ed: EditData | null): void {
        const part = this.is.staff()!.part()
        const tickStart = this.is.segment().tick()
        const oi = this.is.instrument()

        // set instrument in both part and instrument change element
        this.is.setInstrumentPtr(this.instrument)
        part.setInstrument(this.instrument, tickStart)

        // update score
        this.is.masterScore().rebuildMidiMapping()
        this.is.masterScore().updateChannel()
        this.is.masterScore().setInstrumentsChanged(true)
        this.is.triggerLayoutAll()

        // remember original instrument
        this.instrument = oi
    }
}
