/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/editing/editscoreproperties.h/.cpp
 * TODO(port): ChangeMetaTags, ChangePageNumberOffset
 */

import { CommandType, UndoCommand } from './undo'
import type { EngravingObject } from '../dom/engravingobject'
import type { Score } from '../dom/score'
import type { ScoreOrder } from '../dom/scoreorder'
import type { EditData } from './editdata'

export class ChangeMetaText extends UndoCommand {
    constructor(private score: Score, private id: string, private text: string) {
        super()
    }

    protected override flip(_ed: EditData | null): void {
        const s = this.score.metaTag(this.id)
        this.score.setMetaTag(this.id, this.text)
        this.score.setLayoutAll()
        this.text = s
    }

    override type(): CommandType { return CommandType.ChangeMetaInfo }
    override name(): string { return 'ChangeMetaText' }
    override objectItems(): EngravingObject[] { return [this.score] }
}

export class ChangeScoreOrder extends UndoCommand {
    private order: ScoreOrder

    constructor(private score: Score, order: ScoreOrder) {
        super()
        this.order = order.clone()
    }

    protected override flip(_ed: EditData | null): void {
        const s = this.score.scoreOrder()
        this.score.setScoreOrder(this.order)
        this.order = s
    }

    override type(): CommandType { return CommandType.ChangeScoreOrder }
    override name(): string { return 'ChangeScoreOrder' }
    override objectItems(): EngravingObject[] { return [this.score] }
}
