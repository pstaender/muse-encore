/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/musicxmlvoicedesc.h/.cpp
 */

import { MAX_STAVES } from '../../../../engraving/types/types'
import { IntMap } from '../../../../framework/global/orderedmap'

//---------------------------------------------------------
//   VoiceDesc
//---------------------------------------------------------

/**
 The description of a single voice in a MusicXML part.
*/

export class VoiceDesc {
    private m_chordRests: number[] = new Array<number>(MAX_STAVES).fill(0)   // The number of chordrests on each MusicXML staff
    private m_staff = -1                         // The MuseScore staff allocated
    private m_voice = -1                         // The MuseScore voice allocated
    private m_overlaps = false                   // This voice contains active notes in multiple staves at the same time
    // For overlapping voices: voice is allocated on these staves (note: -2=unalloc -1=undef 1=alloc)
    private m_staffAlloc: number[] = new Array<number>(MAX_STAVES).fill(-1)
    private m_voices: number[] = new Array<number>(MAX_STAVES).fill(-1)            // For every voice allocated on the staff, the voice number

    clone(): VoiceDesc {
        const r = new VoiceDesc()
        r.m_chordRests = this.m_chordRests.slice()
        r.m_staff = this.m_staff
        r.m_voice = this.m_voice
        r.m_overlaps = this.m_overlaps
        r.m_staffAlloc = this.m_staffAlloc.slice()
        r.m_voices = this.m_voices.slice()
        return r
    }

    incrChordRests(s: number): void {
        if (0 <= s && s < MAX_STAVES) {
            this.m_chordRests[s]++
        }
    }

    /** numberChordRests() and numberChordRests(int s) */
    numberChordRests(s?: number): number {
        if (s !== undefined) {
            return (s >= 0 && s < MAX_STAVES) ? this.m_chordRests[s] : 0
        }
        let res = 0
        for (let i = 0; i < MAX_STAVES; ++i) {
            res += this.m_chordRests[i]
        }
        return res
    }

    /** Determine preferred staff for this voice */
    preferredStaff(): number {
        let max = 0
        let res = 0
        for (let i = 0; i < MAX_STAVES; ++i) {
            if (this.m_chordRests[i] > max) {
                max = this.m_chordRests[i]
                res = i
            }
        }
        return res
    }

    setStaff(s: number): void {
        if (s >= 0) {
            this.m_staff = s
        }
    }

    staff(): number { return this.m_staff }

    /** setVoice(int v) and setVoice(int s, int v) */
    setVoice(s: number, v?: number): void {
        if (v === undefined) {
            if (s >= 0) {
                this.m_voice = s
            }
            return
        }
        if (s >= 0 && s < MAX_STAVES) {
            this.m_voices[s] = v
        }
    }

    /** voice() and voice(int s) */
    voice(s?: number): number {
        if (s === undefined) {
            return this.m_voice
        }
        return (s >= 0 && s < MAX_STAVES) ? this.m_voices[s] : -1
    }

    setOverlap(b: boolean): void { this.m_overlaps = b }
    overlaps(): boolean { return this.m_overlaps }

    setStaffAlloc(s: number, i: number): void {
        if (s >= 0 && s < MAX_STAVES) {
            this.m_staffAlloc[s] = i
        }
    }

    staffAlloc(s: number): number { return (s >= 0 && s < MAX_STAVES) ? this.m_staffAlloc[s] : -1 }

    toString(): string {
        let res = '['
        for (let i = 0; i < MAX_STAVES; ++i) {
            res += ` ${this.m_chordRests[i]}`
        }
        res += ` ] overlaps ${this.m_overlaps ? 1 : 0}`
        if (this.m_overlaps) {
            res += ' staffAlloc ['
            for (let i = 0; i < MAX_STAVES; ++i) {
                res += ` ${this.m_staffAlloc[i]}`
            }
            res += ' ] voices ['
            for (let i = 0; i < MAX_STAVES; ++i) {
                res += ` ${this.m_voices[i]}`
            }
            res += ' ]'
        } else {
            res += ` staff ${this.m_staff + 1} voice ${this.m_voice + 1}`
        }
        return res
    }
}

/** std::map<int, VoiceDesc> */
export class VoiceList extends IntMap<VoiceDesc> {
    clone(): VoiceList {
        const r = new VoiceList()
        for (const [k, v] of this) {
            r.set(k, v.clone())
        }
        return r
    }

    /** C++ voicelist[key]: the value, default constructed and inserted if missing */
    at(key: number): VoiceDesc {
        let v = this.get(key)
        if (!v) {
            v = new VoiceDesc()
            this.set(key, v)
        }
        return v
    }
}
