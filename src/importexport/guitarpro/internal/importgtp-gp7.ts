/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importgtp-gp7.cpp (GuitarPro7): Guitar Pro 7+ files (.gp) are zip
 * files with the score in Content/score.gpif.
 */

import { unzipSync } from 'fflate'
import type { Buffer } from '../../../framework/global/io/buffer'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import type { GuitarProGPProperties, GuitarProTabImportOption } from './importgtp'
import { GuitarPro6 } from './importgtp-gp6'
import { GP7DomBuilder } from './gtp/gp7dombuilder'
import type { IGPDomBuilder } from './gtp/igpdombuilder'

export class GuitarPro7 extends GuitarPro6 {
    constructor(s: MasterScore) {
        super(s, 7)
    }

    override read(io: Buffer): boolean {
        this.f = io
        this.previousTempo = -1

        // C++ ZipReader::fileData: an empty byte array if the file is missing or the zip cannot be read
        let files: Record<string, Uint8Array> = {}
        try {
            files = unzipSync(io.readAll(), {
                filter: file => file.name === 'Content/score.gpif' || file.name === 'Content/PartConfiguration',
            })
        } catch {
            files = {}
        }
        const fileData = files['Content/score.gpif'] ?? new Uint8Array(0)
        const partsData = files['Content/PartConfiguration'] ?? new Uint8Array(0)

        this.m_properties = this.readProperties(partsData)

        this.readGpif(fileData)
        return true
    }

    readProperties(data: Uint8Array): GuitarProGPProperties {
        const properties: GuitarProGPProperties = { partsImportOptions: [] }
        const partsInfoSize = data.length
        const numInstrOffset = 8
        if (partsInfoSize <= numInstrOffset) {
            // failed to read gp properties
            return properties
        }

        const numberOfInstruments = data[numInstrOffset]
        if (partsInfoSize <= numInstrOffset + numberOfInstruments) {
            // failed to read gp properties
            return properties
        }

        // NOTE: like in C++, the options are collected into a copy and not stored in the returned properties
        const partsImportOpts = properties.partsImportOptions.slice()
        for (let i = numInstrOffset + 1; i <= numInstrOffset + numberOfInstruments; i++) {
            partsImportOpts.push(data[i] as GuitarProTabImportOption)
        }

        return properties
    }

    protected override createGPDomBuilder(): IGPDomBuilder | null {
        return new GP7DomBuilder()
    }
}
