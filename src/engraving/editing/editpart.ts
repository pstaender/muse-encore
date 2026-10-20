/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/editing/editpart.h/.cpp
 * TODO(port): the other part editing functions (insert/remove/move parts and staves, ...)
 */

import type { Score } from '../dom/score'
import type { ScoreOrder } from '../dom/scoreorder'

export class EditPart {
    static setScoreOrder(score: Score | null, order: ScoreOrder): void {
        if (!score) {
            return
        }

        score.setScoreOrder(order) // TODO(port): undo (ChangeScoreOrder)
        const mutableOrder = order.clone()
        mutableOrder.setBracketsAndBarlines(score)
    }
}
