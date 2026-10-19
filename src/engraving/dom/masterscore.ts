/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/masterscore.h/.cpp (excerpts and playback related parts are not ported)
 */

import { RepeatList } from './repeatlist'
import { Score } from './score'
import { TimeSigMap } from './sig'

export class MasterScore extends Score {
    private m_sigmap = new TimeSigMap()
    private m_mscoreVersion = ''
    private m_mscoreRevision = 0
    private m_expandRepeats = true
    private m_expandedRepeatList = new RepeatList(this)
    private m_nonExpandedRepeatList = new RepeatList(this)

    override isMaster(): boolean { return true }
    override masterScore(): MasterScore { return this }
    override sigmap(): TimeSigMap { return this.m_sigmap }

    setPlaylistDirty(): void {
        this.m_expandedRepeatList.setScoreChanged()
        this.m_nonExpandedRepeatList.setScoreChanged()
    }

    expandRepeats(): boolean { return this.m_expandRepeats }

    updateRepeatList(): void {
        this.m_expandedRepeatList.update(true)
        this.m_nonExpandedRepeatList.update(false)
    }

    repeatList(expandRepeats = this.m_expandRepeats, updateTies = true): RepeatList {
        if (expandRepeats) {
            this.m_expandedRepeatList.update(true, updateTies)
            return this.m_expandedRepeatList
        }

        this.m_nonExpandedRepeatList.update(false, updateTies)
        return this.m_nonExpandedRepeatList
    }

    mscoreVersion(): string { return this.m_mscoreVersion }
    setMscoreVersion(v: string): void { this.m_mscoreVersion = v }
    mscoreRevision(): number { return this.m_mscoreRevision }
    setMscoreRevision(v: number): void { this.m_mscoreRevision = v }
}
