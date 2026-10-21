/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/masterscore.h/.cpp (playback related parts are not ported)
 */

import { RepeatList } from './repeatlist'
import { Score } from './score'
import { TimeSigMap } from './sig'
import type { Excerpt } from './excerpt'
import type { Staff } from './staff'
import { DefaultStyle } from '../style/defaultstyle'

/** the "platform" meta tag of new scores (C++ Q_OS_WIN / Q_OS_MAC / Q_OS_LINUX) */
function platformName(): string {
    const g = globalThis as { process?: { platform?: string }; navigator?: { platform?: string; userAgent?: string } }
    const p = g.process?.platform ?? g.navigator?.platform ?? g.navigator?.userAgent ?? ''
    if (/^win|windows/i.test(p)) {
        return 'Microsoft Windows'
    }
    if (/darwin|mac/i.test(p)) {
        return 'Apple Macintosh'
    }
    if (/linux/i.test(p)) {
        return 'Linux'
    }
    return 'Unknown'
}

export class MasterScore extends Score {
    private m_sigmap = new TimeSigMap()
    private m_mscoreVersion = ''
    private m_mscoreRevision = 0
    private m_expandRepeats = true
    private m_expandedRepeatList = new RepeatList(this)
    private m_nonExpandedRepeatList = new RepeatList(this)
    private m_excerpts: Excerpt[] = []

    constructor() {
        super()
        this.m_metaTags.set('platform', platformName())
        for (const tag of ['movementNumber', 'movementTitle', 'workNumber', 'workTitle', 'arranger', 'composer', 'lyricist',
            'translator', 'source', 'copyright']) {
            this.m_metaTags.set(tag, '')
        }
        const d = new Date()
        const pad = (n: number): string => String(n).padStart(2, '0')
        this.m_metaTags.set('creationDate', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    }

    override isMaster(): boolean { return true }

    excerpts(): Excerpt[] { return this.m_excerpts }
    addExcerpt(ex: Excerpt, index = -1): void {
        if (!ex.inited()) {
            this.initParts(ex)
        }
        this.m_excerpts.splice(index === -1 ? this.m_excerpts.length : index, 0, ex)
    }

    /** C++ MasterScore::initParts (excerpt.cpp) */
    initParts(excerpt: Excerpt): void {
        let nstaves = 1 // Initialise to 1 to force writing of the first part.
        const assignedStavesIds = new Set<string>()
        for (const excerptStaff of excerpt.excerptScore()!.staves()) {
            const ls = excerptStaff.links()
            if (!ls) {
                continue
            }

            for (const le of ls) {
                if (le.score() !== this) {
                    continue
                }

                const linkedMasterStaff = le as Staff
                if (assignedStavesIds.has(linkedMasterStaff.id())) {
                    continue
                }

                const excerptPart = excerptStaff.part()
                const masterPart = linkedMasterStaff.part()

                //! NOTE: parts/staves of excerpt must have the same ID as parts/staves of the master score
                //! In fact, excerpts are just viewers for the master score
                excerptStaff.setId(linkedMasterStaff.id())
                excerptPart.setId(masterPart.id())

                assignedStavesIds.add(linkedMasterStaff.id())

                // For instruments with multiple staves, every staff will point to the
                // same part. To prevent adding the same part several times to the excerpt,
                // add only the part of the first staff pointing to the part.
                if (!(--nstaves)) {
                    excerpt.parts().push(linkedMasterStaff.part())
                    nstaves = linkedMasterStaff.part().nstaves()
                }
                break
            }
        }
    }

    /** C++ createScore(): a part score with the base style */
    createScore(): Score {
        const s = new Score(this)
        s.setStyle(DefaultStyle.baseStyle())
        return s
    }
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
