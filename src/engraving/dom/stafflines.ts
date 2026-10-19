/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafflines.h/.cpp
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { ElementType } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { Measure } from './measure'

export class StaffLines extends EngravingItem {
    private m_lw = 0.0
    private m_lines: LineF[] = []

    constructor(parent: EngravingItem) {
        super(ElementType.STAFF_LINES, parent)
        this.setSelectable(false)
    }

    override pagePos(): PointF {
        const system = this.measure().system()!
        return new PointF(this.measure().x() + system.x(), system.staff(this.staffIdx())!.y() + system.y())
    }

    override canvasPos(): PointF {
        const p = this.pagePos()
        let e = this.parentItem()
        while (e) {
            if (e.type() === ElementType.PAGE) {
                p.add(e.pos())
                break
            }
            e = e.parentItem()
        }
        return p
    }

    lines(): readonly LineF[] { return this.m_lines }
    setLines(l: LineF[]): void { this.m_lines = l }
    measure(): Measure { return this.explicitParent() as unknown as Measure }
    lw(): number { return this.m_lw }
    setLw(w: number): void { this.m_lw = w }

    override collectForDrawing(): boolean {
        const idx = this.staffIdx()
        return super.collectForDrawing() && (this.measure().visible(idx) || this.measure().isCutawayClef(idx))
               && this.score().staff(idx)!.show()
    }

    y1(): number {
        const system = this.measure().system()!
        return system.staff(this.staffIdx())!.y() + this.ldata().posY()
    }
}
