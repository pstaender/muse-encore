/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of class NoteHead (src/engraving/dom/note.h/.cpp): a notehead symbol (the cells of the Noteheads palette).
 */

import { ElementType, NoteHeadGroup, NoteHeadType } from '../types/types'
import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Note } from './note'
import { Symbol } from './symbol'

export class NoteHead extends Symbol {
    constructor(parent: EngravingObject | null) {
        super(parent, ElementFlag.MOVABLE, ElementType.NOTEHEAD)
    }

    headGroup(): NoteHeadGroup {
        let group = NoteHeadGroup.HEAD_INVALID
        for (let i = 0; i < NoteHeadGroup.HEAD_DO_WALKER; ++i) {
            if (Note.noteHeadSym(0, i, NoteHeadType.HEAD_HALF) === this.m_sym
                || Note.noteHeadSym(0, i, NoteHeadType.HEAD_BREVIS) === this.m_sym) {
                group = i
                break
            }
        }
        return group
    }
}
