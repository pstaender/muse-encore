/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of TabDurationSymbol (src/engraving/dom/stafftype.h/.cpp)
 */

import { DurationType, ElementType } from '../types/types'
import { ElementFlag, EngravingItem, LayoutData } from './engravingitem'
import type { ChordRest } from './chordrest'
import type { StaffType } from './stafftype'

export enum TabBeamGrid {
    NONE = 0,
    INITIAL,
    MEDIALFINAL,
    NUM_OF,
}

export class TabDurationSymbolLayoutData extends LayoutData {
    beamGrid = TabBeamGrid.NONE // value for special 'English' grid display
    beamLength = 0.0 // if _grid==MEDIALFINAL, length of the beam toward previous grid element
    beamLevel = 0 // if _grid==MEDIALFINAL, the number of beams
}

export class TabDurationSymbol extends EngravingItem {
    private m_tab: StaffType | null = null
    private m_text = ''
    private m_repeat = false

    constructor(parent: ChordRest | null, tab: StaffType | null = null, type: DurationType = DurationType.V_INVALID, dots = 0) {
        super(ElementType.TAB_DURATION_SYMBOL, parent, ElementFlag.NOT_SELECTABLE)
        this.setGenerated(true)
        if (tab) {
            this.setDuration(type, dots, tab)
        }
    }

    protected override createLayoutData(): TabDurationSymbolLayoutData { return new TabDurationSymbolLayoutData(this) }
    override ldata(): TabDurationSymbolLayoutData { return super.ldata() as TabDurationSymbolLayoutData }
    override mutldata(): TabDurationSymbolLayoutData { return super.ldata() as TabDurationSymbolLayoutData }

    tab(): StaffType | null { return this.m_tab }
    text(): string { return this.m_text }
    setDuration(type: DurationType, dots: number, tab: StaffType): void {
        this.m_tab = tab
        this.m_text = tab.durationString(type, dots)
    }

    isRepeat(): boolean { return this.m_repeat }
    setRepeat(val: boolean): void { this.m_repeat = val }
}
