/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of class NoteHead of src/engraving/dom/note.h/.cpp (a module of its own: note.ts must not import Symbol).
 * Only used for the noteheads of the palette (dropped on notes).
 */

import { ElementType, NoteHeadGroup } from '../types/types'
import { ElementFlag } from './engravingitem'
import { Symbol } from './symbol'
import { NOTE_HEADS } from './noteheadsdata'
import type { EngravingObject } from './engravingobject'

export class NoteHead extends Symbol {
    constructor(parent: EngravingObject | null = null) {
        super(parent, ElementFlag.MOVABLE, ElementType.NOTEHEAD)
    }

    /**
     * used only when dropping a notehead from the palette
     * they are either half note, either double whole
     */
    headGroup(): NoteHeadGroup {
        let group = NoteHeadGroup.HEAD_INVALID
        for (let i = 0; i < NoteHeadGroup.HEAD_DO_WALKER; ++i) {
            if (NOTE_HEADS[0][i][1] === this.m_sym || NOTE_HEADS[0][i][3] === this.m_sym) {
                group = i as NoteHeadGroup
                break
            }
        }
        return group
    }
}
