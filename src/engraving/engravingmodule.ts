/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the font setup in src/engraving/engravingmodule.cpp (EngravingModule::onInit).
 * Only the fonts shipped in ./fonts are registered; the other SMuFL fonts fall back to Bravura/Leland.
 */

import { fontsDatabase } from './infrastructure/engravingcontext'
import { engravingFonts } from './infrastructure/engravingfont'
import { StaffType } from './dom/stafftype'
import { CHORD_LIST_FILES, registerChordListFile } from './dom/chordlist'
import { DefaultStyle } from './style/defaultstyle'

// C++ DefaultStyle LEGACY_MSS_V*_PATH: default styles of older versions, used to open scores older than 4.0
const LEGACY_STYLE_FILES: [number, string][] = [
    [114, 'legacy-style-defaults-v1.mss'],
    [206, 'legacy-style-defaults-v2.mss'],
    [301, 'legacy-style-defaults-v3.mss'],
    [302, 'legacy-style-defaults-v302.mss'],
    [450, 'legacy-style-defaults-v450.mss'],
]

type Json = Record<string, unknown>

/** loads a file relative to the fonts directory, e.g. "leland/Leland.otf" */
export type FontFileLoader = (path: string) => Promise<ArrayBuffer | Uint8Array>

interface FontFile { family: string; path: string; bold?: boolean; italic?: boolean }

const TEXT_FONTS: FontFile[] = [
    { family: 'Edwin', path: 'edwin/Edwin-Roman.otf' },
    { family: 'Edwin', path: 'edwin/Edwin-Italic.otf', italic: true },
    { family: 'Edwin', path: 'edwin/Edwin-Bold.otf', bold: true },
    { family: 'Edwin', path: 'edwin/Edwin-BdIta.otf', bold: true, italic: true },
    { family: 'Bravura Text', path: 'bravura/BravuraText.otf' },
    { family: 'Leland Text', path: 'leland/LelandText.otf' },
    { family: 'MuseJazz Text', path: 'musejazz/MuseJazzText.otf' },
    { family: 'MScore Text', path: 'mscore/MScoreText.otf' },
    { family: 'Gootville Text', path: 'gootville/GootvilleText.otf' },
    { family: 'Petaluma Text', path: 'petaluma/PetalumaText.otf' },
    { family: 'Finale Maestro Text', path: 'finalemaestro/FinaleMaestroText-Regular.otf' },
    { family: 'Finale Broadway Text', path: 'finalebroadway/FinaleBroadwayText.otf' },
    { family: 'FreeSerif', path: 'freefont/FreeSerif.ttf' },
    { family: 'FreeSerif', path: 'freefont/FreeSerifBold.ttf', bold: true },
    { family: 'FreeSerif', path: 'freefont/FreeSerifItalic.ttf', italic: true },
    { family: 'FreeSerif', path: 'freefont/FreeSerifBoldItalic.ttf', bold: true, italic: true },
    { family: 'FreeSans', path: 'freefont/FreeSans.ttf' },
    { family: 'MScoreTabulature', path: 'mscoretab/mscoreTab.ttf' },
]

const MUSIC_FONTS: { name: string; family: string; path: string; metadata: string }[] = [
    { name: 'Bravura', family: 'Bravura', path: 'bravura/Bravura.otf', metadata: 'bravura/bravura_metadata.json' },
    { name: 'Leland', family: 'Leland', path: 'leland/Leland.otf', metadata: 'leland/leland_metadata.json' },
    { name: 'Emmentaler', family: 'MScore', path: 'mscore/MScore.otf', metadata: 'mscore/metadata.json' },
    { name: 'Gonville', family: 'Gootville', path: 'gootville/Gootville.otf', metadata: 'gootville/metadata.json' },
    { name: 'MuseJazz', family: 'MuseJazz', path: 'musejazz/MuseJazz.otf', metadata: 'musejazz/metadata.json' },
    { name: 'Petaluma', family: 'Petaluma', path: 'petaluma/Petaluma.otf', metadata: 'petaluma/petaluma_metadata.json' },
    { name: 'Finale Maestro', family: 'Finale Maestro', path: 'finalemaestro/FinaleMaestro.otf', metadata: 'finalemaestro/FinaleMaestro.json' },
    { name: 'Finale Broadway', family: 'Finale Broadway', path: 'finalebroadway/FinaleBroadway.otf', metadata: 'finalebroadway/FinaleBroadway.json' },
]

let s_fontsInitialized = false

export function fontsInitialized(): boolean { return s_fontsInitialized }

export async function initEngravingFonts(load: FontFileLoader): Promise<void> {
    const fdb = fontsDatabase()
    const decoder = new TextDecoder()
    const toBytes = (d: ArrayBuffer | Uint8Array): Uint8Array => d instanceof Uint8Array ? d : new Uint8Array(d)

    const [tabConfig] = await Promise.all([
        load('fonts_tablature.xml'),
        ...CHORD_LIST_FILES.map(async (f) => registerChordListFile(f, toBytes(await load('chords/' + f)))),
        ...LEGACY_STYLE_FILES.map(async ([v, f]) => DefaultStyle.registerLegacyStyle(v, decoder.decode(toBytes(await load('styles/' + f))))),
        ...TEXT_FONTS.map(async (f) => fdb.addFont(f.family, await load(f.path), { bold: f.bold, italic: f.italic })),
        ...MUSIC_FONTS.map(async (f) => {
            const [data, meta] = await Promise.all([load(f.path), load(f.metadata)])
            fdb.addFont(f.family, data)
            engravingFonts().addInternalFont(f.name, f.family, JSON.parse(decoder.decode(toBytes(meta))) as Json)
        }),
    ])

    // C++ StaffType::initStaffTypes() -> readTabConfigFile()
    StaffType.readTabConfig(toBytes(tabConfig))

    fdb.setDefaultTextFamily('Edwin')
    fdb.setDefaultSymbolFamily('Bravura')
    engravingFonts().setFallbackFont('Bravura')

    // fonts not shipped here (insertSubstitution in C++, plus the missing SMuFL fonts)
    fdb.addAlias('ScoreFont', 'Leland Text')

    s_fontsInitialized = true
}
