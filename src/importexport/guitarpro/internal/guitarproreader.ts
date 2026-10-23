/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarproreader.h/.cpp: the INotationReader of Guitar Pro (.gtp, .gp3,
 * .gp4, .gp5, .gpx, .gp) and Power Tab (.ptb) files.
 */

import { Excerpt } from '../../../engraving/dom/excerpt'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Err, errText } from '../../../engraving/engravingerrors'
import { engravingStyleResource } from '../../../engraving/engravingmodule'
import { NotationReadError, type INotationReader, type NotationReaderOptions } from '../../../project/inotationreader'
import { guitarProConfiguration } from './guitarproconfiguration'
import { importGTP } from './importgtpmain'

export class GuitarProReader implements INotationReader {
    read(score: MasterScore, data: Uint8Array, fileName: string, _options?: NotationReaderOptions): void {
        const err = importGTP(score, data, guitarProConfiguration().experimental())

        if (guitarProConfiguration().linkedTabStaffCreated()) {
            Excerpt.createLinkedTabs(score)
        }

        // C++ score->loadStyle(":/engraving/styles/gp-style.mss")
        const style = engravingStyleResource('gp-style.mss')
        if (style) {
            score.loadStyle(style)
        } else {
            // TODO(port): the engraving resources are loaded by initEngravingFonts
            console.warn('gp-style.mss is not loaded')
        }

        if (err !== Err.NoError) {
            throw new NotationReadError(errText(err, fileName))
        }
    }
}
