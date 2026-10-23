/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/guitarbendimporter.h/.cpp
 */

import type { Note } from '../../../../engraving/dom/note'
import type { Score } from '../../../../engraving/dom/score'
import type { PitchValues } from '../../../../engraving/types/pitchvalue'
import { BendDataCollector } from './benddatacollector'
import { BendDataProcessor } from './benddataprocessor'

export class GuitarBendImporter {
    private m_dataCollector: BendDataCollector
    private m_dataProcessor: BendDataProcessor

    constructor(score: Score) {
        this.m_dataCollector = new BendDataCollector(score)
        this.m_dataProcessor = new BendDataProcessor(score)
    }

    collectBend(note: Note, pitchValues: PitchValues): void {
        this.m_dataCollector.storeBendData(note, pitchValues)
    }

    applyBendsToChords(): void {
        this.m_dataProcessor.processBends(this.m_dataCollector.collectBendDataContext())
    }
}
