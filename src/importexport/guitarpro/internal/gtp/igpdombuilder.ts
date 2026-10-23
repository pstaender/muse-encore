/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/igpdombuilder.h
 */

import type { XmlDomElement } from '../../../../framework/global/serialization/xmldom'
import type { GPDomModel } from './gpdommodel'

export interface IGPDomBuilder {
    buildGPDomModel(domElem: XmlDomElement): void
    getGPDomModel(): GPDomModel | null
}
