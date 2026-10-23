/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/bagpembell.h/.cpp: a dummy element of the "Bagpipe embellishments" palette, used for
 * drag and drop: dropped on a note it adds the embellishment's grace notes (Note::drop); it is never part of a score.
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { SymId } from '../types/symid'
import { ElementType, type EmbellishmentType } from '../types/types'
import { TConv } from '../types/typesconv'
import { EngravingItem, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'

/** C++ BagpipeNoteList: notes as indices in BAGPIPE_NOTEINFO_LIST */
export type BagpipeNoteList = number[]

/** C++ BagpipeNoteInfo: name, staff line and pitch for a bagpipe note */
export interface BagpipeNoteInfo {
    name: string
    line: number
    pitch: number
}

export interface BagpipeNoteData {
    headXY: PointF
    stemLine: LineF
    flagXY: PointF
    ledgerLine: LineF
}

export interface BagpipeBeamData {
    /** line width for beam */
    width: number
    y: number
    x1: number
    x2: number
}

export class BagpipeEmbellishmentLayoutData extends LayoutData {
    isDrawBeam = false
    isDrawFlag = false
    /** spatium */
    spatium = 1.0
    /** grace note head symbol */
    headsym = SymId.noSym
    /** grace note flag symbol */
    flagsym = SymId.noSym
    /** line width for stem */
    stemLineW = 0.0
    /** note index -> data (C++ std::map: iterated in index order) */
    notesData = new Map<number, BagpipeNoteData>()
    beamData: BagpipeBeamData = { width: 0.0, y: 0.0, x1: 0.0, x2: 0.0 }
}

export class BagpipeEmbellishment extends EngravingItem {
    /** Staff line and pitch for every bagpipe note */
    static readonly BAGPIPE_NOTEINFO_LIST: readonly BagpipeNoteInfo[] = [
        { name: 'LG', line: 6, pitch: 65 },
        { name: 'LA', line: 5, pitch: 67 },
        { name: 'B', line: 4, pitch: 69 },
        { name: 'C', line: 3, pitch: 71 }, // actually C#
        { name: 'D', line: 2, pitch: 72 },
        { name: 'E', line: 1, pitch: 74 },
        { name: 'F', line: 0, pitch: 76 }, // actually F#
        { name: 'HG', line: -1, pitch: 77 },
        { name: 'HA', line: -2, pitch: 79 },
    ]

    private m_embelType: EmbellishmentType = 0

    constructor(parent: EngravingObject | null) {
        super(ElementType.BAGPIPE_EMBELLISHMENT, parent)
    }

    protected override createLayoutData(): BagpipeEmbellishmentLayoutData { return new BagpipeEmbellishmentLayoutData(this) }
    override ldata(): BagpipeEmbellishmentLayoutData { return super.ldata() as BagpipeEmbellishmentLayoutData }
    override mutldata(): BagpipeEmbellishmentLayoutData { return super.ldata() as BagpipeEmbellishmentLayoutData }

    embelType(): EmbellishmentType { return this.m_embelType }
    setEmbelType(val: EmbellishmentType): void { this.m_embelType = val }

    /** return fixed magnification */
    override mag(): number {
        return 0.7
    }

    /** return notes as list of indices in BAGPIPE_NOTEINFO_LIST */
    resolveNoteList(): BagpipeNoteList {
        const nl: BagpipeNoteList = []

        const notes = TConv.embellishmentNotes(this.m_embelType)
        const list = BagpipeEmbellishment.BAGPIPE_NOTEINFO_LIST
        for (const note of notes) {
            // search for note in BagpipeNoteInfoList
            const i = list.findIndex(info => info.name === note)
            if (i >= 0) {
                // found it, append to list
                nl.push(i)
            }
        }

        return nl
    }
}
