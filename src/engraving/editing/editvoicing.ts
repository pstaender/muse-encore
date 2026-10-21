/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editvoicing.h/.cpp
 *
 * TODO(port): CloneVoice (excerpts)
 */

import type { staff_idx_t, track_idx_t } from '../types/types'
import type { EngravingObject } from '../dom/engravingobject'
import type { Measure } from '../dom/measure'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class ExchangeVoice extends UndoCommand {
    constructor(private measure: Measure, private val1: track_idx_t, private val2: track_idx_t, private staff: staff_idx_t) {
        super()
    }

    override type(): CommandType { return CommandType.ExchangeVoice }
    override name(): string { return 'ExchangeVoice' }
    override objectItems(): EngravingObject[] { return [this.measure] }

    override undo(_ed: EditData | null): void {
        this.measure.exchangeVoice(this.val2, this.val1, this.staff)
        this.measure.checkMultiVoices(this.staff)
    }

    override redo(_ed: EditData | null): void {
        this.measure.exchangeVoice(this.val1, this.val2, this.staff)
    }
}
