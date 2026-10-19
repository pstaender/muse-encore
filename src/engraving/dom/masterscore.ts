/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/masterscore.h/.cpp (excerpts, repeat list and
 * playback related parts are not ported)
 */

import { Score } from './score'
import { TimeSigMap } from './sig'

export class MasterScore extends Score {
    private m_sigmap = new TimeSigMap()
    private m_mscoreVersion = ''
    private m_mscoreRevision = 0

    override isMaster(): boolean { return true }
    override masterScore(): MasterScore { return this }
    override sigmap(): TimeSigMap { return this.m_sigmap }

    mscoreVersion(): string { return this.m_mscoreVersion }
    setMscoreVersion(v: string): void { this.m_mscoreVersion = v }
    mscoreRevision(): number { return this.m_mscoreRevision }
    setMscoreRevision(v: number): void { this.m_mscoreRevision = v }
}
