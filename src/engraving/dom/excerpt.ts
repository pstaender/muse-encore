/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/excerpt.h/.cpp (only what reading and writing needs)
 *
 * TODO(port): creating excerpts from parts (createExcerpt, cloneMeasures, cloneStaff, ...), voice visibility
 * (Staff::visibilityVoices: all voices are assumed to be visible)
 */

import { VOICES } from '../types/types'
import type { MasterScore } from './masterscore'
import type { Part } from './part'
import type { Score } from './score'
import type { Staff } from './staff'

/** C++ TracksMap (std::multimap<track_idx_t, track_idx_t>): pairs sorted by the master track */
export type TracksMap = Array<[number, number]>

/** muse::io::escapeFileName */
export function escapeFileName(fn: string): string {
    fn = fn.replace(/\s+/g, ' ').trim() // simplified()
    return fn.replace(/ /g, '_')
        .replace(/\n/g, '_')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/Ä/g, 'Ae')
        .replace(/Ö/g, 'Oe')
        .replace(/Ü/g, 'Ue')
        .replace(/♭/g, 'b') // musical flat sign, happen in instrument names, so can happen in part (file) names
        .replace(/♯/g, '#') // musical sharp sign, can happen in titles, so can happen in score (file) names
        // FAT/NTFS special chars
        .replace(/[<>:"/\\|?*]/g, '_')
}

export class Excerpt {
    private m_excerptScore: Score | null = null
    private m_name = ''
    private m_fileName = ''
    private m_parts: Part[] = []
    private m_tracksMapping: TracksMap = []
    private m_initialPartId = ''
    private m_inited = false

    constructor(private m_masterScore: MasterScore | null = null) {}

    inited(): boolean { return this.m_inited }
    setInited(v: boolean): void { this.m_inited = v }

    /** empty string: invalid ID */
    initialPartId(): string { return this.m_initialPartId }
    setInitialPartId(id: string): void { this.m_initialPartId = id }
    custom(): boolean { return !this.m_initialPartId }

    masterScore(): MasterScore | null { return this.m_masterScore }
    excerptScore(): Score | null { return this.m_excerptScore }
    setExcerptScore(s: Score | null): void {
        this.m_excerptScore = s
        if (s) {
            s.setExcerpt(this)
            // TODO(port): writeNameToMetaTags()
        }
    }

    name(): string { return this.m_name }
    setName(name: string): void { this.m_name = name }

    hasFileName(): boolean { return this.m_fileName.length > 0 }
    fileName(): string {
        if (!this.m_fileName) {
            this.updateFileName()
        }
        return this.m_fileName
    }
    setFileName(fileName: string): void { this.m_fileName = fileName }

    updateFileName(index = -1): void {
        if (index === -1 && this.m_masterScore) {
            index = this.m_masterScore.excerpts().indexOf(this)
        }

        const escapedName = escapeFileName(this.m_name)

        if (index === -1) {
            this.m_fileName = escapedName
        } else {
            this.m_fileName = `${index}_${escapedName}`
        }
    }

    parts(): Part[] { return this.m_parts }
    setParts(parts: Part[]): void { this.m_parts = parts }
    containsPart(part: Part): boolean { return this.m_parts.includes(part) }

    nstaves(): number {
        let n = 0
        for (const p of this.m_parts) {
            n += p.nstaves()
        }
        return n
    }

    isEmpty(): boolean {
        return this.m_excerptScore ? this.m_excerptScore.parts().length === 0 : true
    }

    tracksMapping(): TracksMap {
        this.updateTracksMapping()
        return this.m_tracksMapping
    }

    setTracksMapping(tracksMapping: TracksMap): void {
        this.m_tracksMapping = [...tracksMapping].sort((a, b) => a[0] - b[0])
    }

    private updateTracksMapping(): void {
        const score = this.excerptScore()
        if (!score || !this.m_masterScore) {
            return
        }

        const tracks: TracksMap = []
        for (const staff of score.staves()) {
            const masterStaff = this.masterStaff(staff)
            if (!masterStaff) {
                continue
            }

            const masterStaffIdx = masterStaff.idx()
            const staffIdx = staff.idx()

            let voice = 0
            for (let i = 0; i < VOICES; ++i) {
                // TODO(port): staff->visibilityVoices()
                tracks.push([masterStaffIdx * VOICES + i % VOICES, staffIdx * VOICES + voice % VOICES])
                voice++
            }
        }
        this.m_tracksMapping = tracks.sort((a, b) => a[0] - b[0])
    }

    /** C++ m_masterScore->staffById(staff->id()): linked staves share their ID */
    private masterStaff(staff: Staff): Staff | null {
        const ms = this.m_masterScore!
        for (const l of staff.linkList()) {
            if (l.score() === ms) {
                return l as Staff
            }
        }
        return null
    }
}
