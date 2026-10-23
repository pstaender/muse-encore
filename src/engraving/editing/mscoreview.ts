/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/mscoreview.h (the parts used through EditData::view() while dropping): the view
 * callbacks of the engraving items (C++ ScoreCallbacks forwards them to the NotationInteraction).
 * TODO(port): elementNear, adjustCanvasPosition (dragging slurs, ties, line grips)
 */

import type { RectF } from '../../framework/draw/types/geometry'
import type { EngravingItem } from '../dom/engravingitem'

export interface MuseScoreView {
    setDropRectangle(rect: RectF): void
    setDropTarget(item: EngravingItem | null): void
    /** switches the grip edit to another element (a line grip dragged to another system) */
    changeEditElement?(e: EngravingItem): void
}
