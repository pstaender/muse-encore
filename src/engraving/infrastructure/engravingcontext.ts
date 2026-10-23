/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement for MuseScore's dependency injection (muse::Inject / ioc):
 * global services used by the engraving code.
 */

import { FontProvider, FontsDatabase } from '../../framework/draw/internal/fontprovider'
import { setFontMetricsProvider } from '../../framework/draw/fontmetrics'

let s_fontsDatabase = new FontsDatabase()
let s_fontProvider = new FontProvider(s_fontsDatabase)
setFontMetricsProvider(s_fontProvider)

export function fontsDatabase(): FontsDatabase { return s_fontsDatabase }

export function fontProvider(): FontProvider { return s_fontProvider }

export function setFontsDatabase(db: FontsDatabase): void {
    s_fontsDatabase = db
    s_fontProvider = new FontProvider(db)
    setFontMetricsProvider(s_fontProvider)
}
