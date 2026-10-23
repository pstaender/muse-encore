/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/shared/musicxmltypes.h/.cpp (the parts used by the export)
 *
 * TODO(port): MusicXmlInstrument, MusicXmlIntervalList, MusicXmlInstrList, LyricNumberHandler (import only)
 */

import type { Arpeggio } from '../../../../engraving/dom/arpeggio'

export const MAX_NUMBER_LEVEL = 16 // maximum number of overlapping MusicXML objects

export enum MusicXmlExporterSoftware {
    DOLET6,
    DOLET8,
    DORICO,
    FINALE,
    NOTEFLIGHT,
    SIBELIUS,
    OTHER,
}

export enum MusicXmlStartStop {
    NONE, START, STOP,
}

export class MusicXmlArpeggioDesc {
    constructor(public arp: Arpeggio, public no: number) {}
}

/** C++ std::multimap<int, MusicXmlArpeggioDesc>: the descriptions per tick in insertion order */
export class ArpeggioMap {
    private m_map = new Map<number, MusicXmlArpeggioDesc[]>()

    clear(): void { this.m_map.clear() }

    /** muse::values(arps, tick) */
    values(tick: number): MusicXmlArpeggioDesc[] { return [...(this.m_map.get(tick) ?? [])] }

    insert(tick: number, desc: MusicXmlArpeggioDesc): void {
        const l = this.m_map.get(tick)
        if (l) {
            l.push(desc)
        } else {
            this.m_map.set(tick, [desc])
        }
    }
}
