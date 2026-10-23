/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/lasso.h/.cpp: the rubber band of the lasso selection (Shift+drag on empty space). Its
 * bbox is in canvas coordinates; it is painted by the notation view (NotationInteraction::drawLasso).
 */

import { PointF } from '../../framework/draw/types/geometry'
import { ElementType } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { EditData } from '../editing/editdata'
import type { Score } from './score'

export class Lasso extends EngravingItem {
    constructor(s: Score) {
        super(ElementType.LASSO, s)
        this.setVisible(false)
    }

    override clone(): Lasso { return super.clone() as Lasso }

    isEmpty(): boolean { return this.ldata().bbox().isEmpty() }

    override dragGrip(ed: EditData): void {
        const ldata = this.mutldata()
        const bbox = ldata.bbox().clone()
        switch (ed.curGrip as number) {
        case 0:
            bbox.setTopLeft(bbox.topLeft().plus(ed.delta))
            break
        case 1:
            bbox.setTopRight(bbox.topRight().plus(ed.delta))
            break
        case 2:
            bbox.setBottomRight(bbox.bottomRight().plus(ed.delta))
            break
        case 3:
            bbox.setBottomLeft(bbox.bottomLeft().plus(ed.delta))
            break
        case 4:
            bbox.setTop(bbox.top() + ed.delta.y())
            break
        case 5:
            bbox.setRight(bbox.right() + ed.delta.x())
            break
        case 6:
            bbox.setBottom(bbox.bottom() + ed.delta.y())
            break
        case 7:
            bbox.setLeft(bbox.left() + ed.delta.x())
            break
        }

        ldata.setBbox(bbox)
    }

    override gripsPositions(_ed?: EditData): PointF[] {
        const box = this.ldata().bbox()
        return [
            box.topLeft(),
            box.topRight(),
            box.bottomRight(),
            box.bottomLeft(),
            new PointF(box.x() + box.width() * 0.5, box.top()),
            new PointF(box.right(), box.y() + box.height() * 0.5),
            new PointF(box.x() + box.width() * 0.5, box.bottom()),
            new PointF(box.left(), box.y() + box.height() * 0.5),
        ]
    }
}
