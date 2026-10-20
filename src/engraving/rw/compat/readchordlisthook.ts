/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/compat/readchordlisthook.h/.cpp
 */

import { ChordStylePreset } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { Score } from '../../dom/score'
import type { XmlReader } from '../xmlreader'

export class ReadChordListHook {
    private m_score: Score | null
    private m_oldChordDescriptionFile = ''
    private m_chordListTag = false

    constructor(score: Score | null) {
        this.m_score = score
        if (this.m_score) {
            this.m_oldChordDescriptionFile = this.m_score.style().styleSt(Sid.chordDescriptionFile)
        }
    }

    read(e: XmlReader): void {
        if (!this.m_score) {
            e.skipCurrentElement()
            return
        }

        this.m_score.chordList().clear()
        this.m_score.chordList().read(e, this.m_score.mscVersion())
        this.m_score.chordList().setCustomChordList(true)

        this.m_chordListTag = true
    }

    validate(): void {
        if (!this.m_score) {
            return
        }

        if (this.m_chordListTag) {
            // if we encountered a ChordList tag, everything is fine already
            return
        }

        // if we just specified a new chord description file
        // and didn't encounter a ChordList tag
        // then load the chord description file

        const style = this.m_score.style()
        const chordList = this.m_score.chordList()

        const newChordDescriptionFile = style.styleSt(Sid.chordDescriptionFile)
        if (newChordDescriptionFile !== this.m_oldChordDescriptionFile) {
            if (!newChordDescriptionFile.startsWith('chords_')
                && (style.styleV(Sid.chordStyle) as ChordStylePreset) === ChordStylePreset.STANDARD) {
                // should not normally happen,
                // but treat as "old" (114) score just in case
                style.set(Sid.chordStyle, ChordStylePreset.CUSTOM)
                style.set(Sid.chordsXmlFile, true)
            }

            const custom = (style.styleV(Sid.chordStyle) as ChordStylePreset) === ChordStylePreset.CUSTOM
            chordList.setCustomChordList(custom)

            chordList.unload()
        }

        // make sure we have a chordlist
        chordList.checkChordList(style)
    }
}
