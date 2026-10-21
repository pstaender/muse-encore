/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editbrackets.h/.cpp
 */

import { BracketType } from '../types/types'
import { CommandType, UndoCommand } from './undo'
import type { EngravingObject } from '../dom/engravingobject'
import type { Staff } from '../dom/staff'
import type { EditData } from './editdata'

export class RemoveBracket extends UndoCommand {
    constructor(private staff: Staff, private level: number, private bracketType: BracketType, private span: number) {
        super()
    }

    override undo(_ed: EditData | null): void {
        this.staff.setBracketType(this.level, this.bracketType)
        this.staff.setBracketSpan(this.level, this.span)
        this.staff.triggerLayout()
    }

    override redo(_ed: EditData | null): void {
        this.staff.setBracketType(this.level, BracketType.NO_BRACKET)
        this.staff.triggerLayout()
    }

    override type(): CommandType { return CommandType.RemoveBracket }
    override name(): string { return 'RemoveBracket' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

/**
 * Deviation: undo restores the bracket that was at that level before (C++ sets NO_BRACKET, which loses a bracket that
 * was replaced, e.g. by the brace of a removed staff moved to the next staff in Score::adjustBracketsDel)
 */
export class AddBracket extends UndoCommand {
    private m_oldType = BracketType.NO_BRACKET
    private m_oldSpan = 0

    constructor(private staff: Staff, private level: number, private bracketType: BracketType, private span: number) {
        super()
    }

    override undo(_ed: EditData | null): void {
        this.staff.setBracketType(this.level, this.m_oldType)
        if (this.m_oldType !== BracketType.NO_BRACKET) {
            this.staff.setBracketSpan(this.level, this.m_oldSpan)
        }
        this.staff.triggerLayout()
    }

    override redo(_ed: EditData | null): void {
        this.m_oldType = this.staff.bracketType(this.level)
        this.m_oldSpan = this.staff.bracketSpan(this.level)
        this.staff.setBracketType(this.level, this.bracketType)
        this.staff.setBracketSpan(this.level, this.span)
        this.staff.triggerLayout()
    }

    override type(): CommandType { return CommandType.AddBracket }
    override name(): string { return 'AddBracket' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}
