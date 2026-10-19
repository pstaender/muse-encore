/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement for MuseScore's dependency injection (muse::Inject / ioc):
 * global services used by the engraving code.
 */

import { FontProvider, FontsDatabase } from '../../framework/draw/internal/fontprovider'

let s_fontsDatabase = new FontsDatabase()
let s_fontProvider = new FontProvider(s_fontsDatabase)

export function fontsDatabase(): FontsDatabase { return s_fontsDatabase }

export function fontProvider(): FontProvider { return s_fontProvider }

export function setFontsDatabase(db: FontsDatabase): void {
    s_fontsDatabase = db
    s_fontProvider = new FontProvider(db)
}
