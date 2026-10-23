/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_key.h/.cpp (namespace MidiKey)
 */

// This simple key detection algorithm is from thesis
// "Inferring Score Level Musical Information From Low-Level Musical Data", 2004
// by Jürgen Kilian

import { KeyList, KeySigEvent } from '../../../../engraving/dom/key'
import { KeySig } from '../../../../engraving/dom/keysig'
import { SegmentType } from '../../../../engraving/dom/segment'
import type { Staff } from '../../../../engraving/dom/staff'
import { Transpose } from '../../../../engraving/editing/transpose'
import { Sid } from '../../../../engraving/style/styledef'
import { Fraction } from '../../../../engraving/types/fraction'
import { Key, VOICES } from '../../../../engraving/types/types'
import type { MTrack } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'

class KeyData {
    constructor(private readonly key_: Key, private readonly count_: number) {}

    key(): Key { return this.key_ }

    /** C++ operator< */
    lessThan(second: KeyData): boolean {
        // choose key with max sum count of transitions
        if (this.count_ > second.count_) {
            return true
        } else if (this.count_ < second.count_) {
            return false
        }
        // if equal - prefer key with less accitential count
        return Math.abs(this.key_) < Math.abs(second.key_)
    }
}

export function assignKeyListToStaff(kl: KeyList, staff: Staff): void {
    const score = staff.score()
    const track = staff.idx() * VOICES
    let pkey = Key.C

    for (const [tick, ke] of kl) {
        const key = ke.key()
        if ((key === Key.C) && (key === pkey)) { // don’t insert unnecessary C key // really?
            continue
        }
        pkey = key
        const m = score.tick2measure(Fraction.fromTicks(tick))
        if (!m) {
            continue
        }
        const seg = m.getSegment(SegmentType.KeySig, Fraction.fromTicks(tick))
        const ks = new KeySig(seg) // Factory::createKeySig(seg)
        ks.setTrack(track)
        ks.setGenerated(false)
        ks.setKey(key)
        ks.mutldata().setMag(staff.staffMag(Fraction.fromTicks(tick)))
        seg.add(ks)
    }
}

export function findKey(tracks: readonly MTrack[]): Key {
    const octave = 12
    const counts: number[] = Array<number>(octave).fill(0)

    for (const track of tracks) {
        if (track.mtrack!.drumTrack()) {
            continue
        }
        for (let it = track.chords.begin(); it !== track.chords.end(); it = it.next()) {
            const next = it.next()
            if (next === track.chords.end()) {
                continue
            }

            for (const note1 of it.second.notes) {
                for (const note2 of next.second.notes) {
                    if (Math.abs(note1.pitch - note2.pitch) === 1) {
                        ++counts[Math.min(note1.pitch, note2.pitch) % octave]
                    }
                }
            }
        }
    }

    const keys: KeyData[] = [
        new KeyData(Key.C_B, counts[3] + counts[10]),
        new KeyData(Key.G_B, counts[10] + counts[5]),
        new KeyData(Key.D_B, counts[5] + counts[0]),
        new KeyData(Key.A_B, counts[0] + counts[7]),
        new KeyData(Key.E_B, counts[7] + counts[2]),
        new KeyData(Key.B_B, counts[2] + counts[9]),
        new KeyData(Key.F, counts[9] + counts[4]),
        new KeyData(Key.C, counts[4] + counts[11]),
        new KeyData(Key.G, counts[11] + counts[6]),
        new KeyData(Key.D, counts[6] + counts[1]),
        new KeyData(Key.A, counts[1] + counts[8]),
        new KeyData(Key.E, counts[8] + counts[3]),
        new KeyData(Key.B, counts[3] + counts[10]),
        new KeyData(Key.F_S, counts[10] + counts[5]),
        new KeyData(Key.C_S, counts[5] + counts[0]),
    ]

    // std::sort of 15 elements is an insertion sort (stable), like the stable JS sort
    keys.sort((a, b) => a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0)

    return keys[0].key()
}

export function recognizeMainKeySig(tracks: MTrack[]): void {
    let needToFindKey = false

    const opers = midiImportOperations
    const isHuman = opers.data().trackOpers.isHumanPerformance.value()
    if (isHuman) {
        needToFindKey = true
    }

    if (!needToFindKey) {
        for (const track of tracks) {
            if (track.mtrack!.drumTrack()) {
                continue
            }
            if (!track.hasKey) {
                needToFindKey = true
                break
            }
        }
    }
    if (!needToFindKey) {
        return
    }

    const key = findKey(tracks)

    for (const track of tracks) {
        if (track.mtrack!.drumTrack()) {
            continue
        }

        if (!track.hasKey || isHuman) {
            const ke = new KeySigEvent()
            const v = track.staff!.part().instrument().transpose().clone()
            const score = track.staff!.score()
            ke.setConcertKey(key)
            if (!v.isZero() && !score.style().styleB(Sid.concertPitch)) {
                v.flip()
                ke.setKey(Transpose.transposeKey(key, v))
            }

            const staffKeyList = track.staff!.keyList()
            staffKeyList.set(0, ke) // staffKeyList[0] = ke
            assignKeyListToStaff(staffKeyList, track.staff!)
        }
    }
}
