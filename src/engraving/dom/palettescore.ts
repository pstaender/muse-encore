/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * gpaletteScore (score.cpp) and its setup in EngravingModule::onInit (engravingmodule.cpp): the score the palette
 * elements belong to, with the base style. Created on first use (the engraving fonts must be initialized).
 */

import { Sid } from '../style/styledef'
import { DefaultStyle } from '../style/defaultstyle'
import { SymId } from '../types/symid'
import { MasterScore } from './masterscore'
import type { Score } from './score'

let s_paletteScore: MasterScore | null = null

/** C++ gpaletteScore */
export function gpaletteScore(): MasterScore {
    if (!s_paletteScore) {
        const score = new MasterScore()
        score.setStyle(DefaultStyle.baseStyle())
        score.style().set(Sid.musicalTextFont, 'Leland Text')
        score.style().precomputeValues()
        score.styleChanged()
        const scoreFont = score.engravingFont()
        score.setNoteHeadWidth(scoreFont.width(SymId.noteheadBlack, score.style().spatium()) / score.style().defaultSpatium())
        s_paletteScore = score
    }
    return s_paletteScore
}

/** C++ Score::isPaletteScore() */
export function isPaletteScore(score: Score | null | undefined): boolean {
    return !!score && score === s_paletteScore
}
