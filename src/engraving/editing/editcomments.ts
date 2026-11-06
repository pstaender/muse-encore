/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore: the undo command of the comments (dom/scorecomments.ts). It sets all comments of the main score;
 * the comments do not change the layout, so it lays out only the first measure (a command without a layout range
 * would lay out the whole score).
 */

import { CommandType, UndoCommand } from './undo'
import type { EngravingObject } from '../dom/engravingobject'
import type { MasterScore } from '../dom/masterscore'
import { scoreComments, type ScoreComment } from '../dom/scorecomments'
import type { EditData } from './editdata'

export class ChangeScoreComments extends UndoCommand {
    private m_comments: ScoreComment[]

    constructor(private m_score: MasterScore, comments: readonly ScoreComment[]) {
        super()
        this.m_comments = comments.map(c => ({ ...c }))
    }

    protected override flip(_ed: EditData | null): void {
        const model = scoreComments(this.m_score)
        const old = model.cloneComments()
        model.setComments(this.m_comments)
        this.m_comments = old
        this.m_score.firstMeasure()?.triggerLayout()
    }

    override type(): CommandType { return CommandType.ChangeMetaInfo }
    override name(): string { return 'ChangeScoreComments' }
    override objectItems(): EngravingObject[] { return [this.m_score] }
}
