/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/ledgerline.h/.cpp
 */

import { ElementType } from '../types/types'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { chordFactories, type Chord } from './chord'

export class LedgerLineLayoutData extends LayoutData {
    lineWidth = 0.0
}

export class LedgerLine extends EngravingItem {
    private m_len = 0.0
    private m_vertical = false

    constructor(parent: EngravingItem | null) {
        super(ElementType.LEDGER_LINE, parent, ElementFlag.ON_STAFF)
        this.setSelectable(false)
    }

    protected override createLayoutData(): LedgerLineLayoutData { return new LedgerLineLayoutData(this) }
    override ldata(): LedgerLineLayoutData { return super.ldata() as LedgerLineLayoutData }
    override mutldata(): LedgerLineLayoutData { return super.ldata() as LedgerLineLayoutData }

    chord(): Chord { return this.explicitParent() as unknown as Chord }
    len(): number { return this.m_len }
    setLen(v: number): void { this.m_len = v }
    setVertical(v: boolean): void { this.m_vertical = v }
    vertical(): boolean { return this.m_vertical }

    override spatiumChanged(oldValue: number, newValue: number): void {
        this.m_len = (this.m_len / oldValue) * newValue
    }
}

// C++ creates ledger lines with score()->dummy() as parent; the layout reparents them
chordFactories.createLedgerLine = (chord: Chord) => new LedgerLine(chord)
