/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_clef.h/.cpp (namespace MidiClef)
 */

import { Fraction } from '../../../../engraving/types/fraction'
import { ClefType, ElementType, VOICES, type track_idx_t } from '../../../../engraving/types/types'
import type { Staff } from '../../../../engraving/dom/staff'
import { type Segment, SegmentType } from '../../../../engraving/dom/segment'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import type { Chord } from '../../../../engraving/dom/chord'
import type { InstrumentTemplate } from '../../../../engraving/dom/instrtemplate'
import { Clef } from '../../../../engraving/dom/clef'
import { ClefTypeList } from '../../../../engraving/dom/clefinfo'
import { ReducedFraction } from './importmidi_fraction'
import { beatLength } from './importmidi_meter'
import { midiImportOperations } from './importmidi_operations'
import { TieState, TieStateMachine } from './importmidi_tie'

const INT_MAX = 2147483647

class AveragePitch {
    constructor(private sumPitch_ = 0, private count_ = 0) {}

    pitch(): number { return Math.round(this.sumPitch_ * 1.0 / this.count_) }
    addPitch(pitch: number): void {
        this.sumPitch_ += pitch
        ++this.count_
    }

    /** operator+= */
    add(other: AveragePitch): void {
        this.sumPitch_ += other.sumPitch_
        this.count_ += other.count_
    }
}

class MinMaxPitch {
    constructor(private minPitch_ = INT_MAX, private maxPitch_ = -1) {}

    minPitch(): number { return this.minPitch_ }
    maxPitch(): number { return this.maxPitch_ }
    empty(): boolean { return this.minPitch_ === INT_MAX || this.maxPitch_ === -1 }
    addPitch(pitch: number): void {
        if (pitch < this.minPitch_) {
            this.minPitch_ = pitch
        }
        if (pitch > this.maxPitch_) {
            this.maxPitch_ = pitch
        }
    }
}

function clefMidPitch(): number {
    const midPitch = 60
    return midPitch
}

export function clefTypeFromAveragePitch(averagePitch: number): ClefType {
    return averagePitch < clefMidPitch() ? ClefType.F : ClefType.G
}

//---------------------------------------------------------
//   createClef
//---------------------------------------------------------

function createClef(clefType: ClefType, staff: Staff, tick: number, isSmall = false): void {
    if (tick === 0) {
        staff.setDefaultClefType(new ClefTypeList(clefType, clefType))
    } else {
        const m = staff.score().tick2measure(Fraction.fromTicks(tick))!
        const seg = m.getSegment(SegmentType.Clef, Fraction.fromTicks(tick))
        const clef = new Clef(seg) // Factory::createClef
        clef.setClefType(clefType)
        const track = staff.idx() * VOICES
        clef.setTrack(track)
        clef.setGenerated(false)
        clef.mutldata().setMag(staff.staffMag(Fraction.fromTicks(tick)))
        clef.setSmall(isSmall)
        seg.add(clef)
    }
}

function chordRestAt(seg: Segment, track: track_idx_t): ChordRest | null {
    return seg.element(track) as ChordRest | null
}

function findAverageSegPitch(seg: Segment, strack: track_idx_t): AveragePitch {
    const averagePitch = new AveragePitch()
    for (let voice = 0; voice < VOICES; ++voice) {
        const cr = chordRestAt(seg, strack + voice)
        if (cr && cr.isChord()) {
            const chord = cr as Chord
            for (const note of chord.notes()) {
                averagePitch.addPitch(note.pitch())
            }
        }
    }
    return averagePitch
}

function findMinMaxSegPitch(seg: Segment, strack: track_idx_t): MinMaxPitch {
    const minMaxPitch = new MinMaxPitch()
    for (let voice = 0; voice < VOICES; ++voice) {
        const cr = chordRestAt(seg, strack + voice)
        if (cr && cr.isChord()) {
            const chord = cr as Chord
            for (const note of chord.notes()) {
                minMaxPitch.addPitch(note.pitch())
            }
        }
    }
    return minMaxPitch
}

// clef index: 0 - treble, 1 - bass

function findPitchPenaltyForClef(pitch: number, clefIndex: number): number {
    const farPitchPenalty = 10000
    const veryFarPitchPenalty = 20000
    const approxPitchPenalty = 1
    const dx = 5

    const midPitch = clefMidPitch() // all notes equal or upper - better in G clef
    const highPitch = midPitch + dx // almost all notes equal or upper - in G clef
    const lowPitch = midPitch - dx // almost all notes lower - in F clef
    const highestPitch = highPitch + dx // all notes equal or upper - in G clef
    const lowestPitch = lowPitch - dx // all notes lower - in F clef

    switch (clefIndex) {
    case 0:
        if (pitch < lowestPitch) {
            return veryFarPitchPenalty
        } else if (pitch < lowPitch) {
            return farPitchPenalty
        } else if (pitch < midPitch) {
            return approxPitchPenalty
        }
        break
    case 1:
        if (pitch >= highestPitch) {
            return veryFarPitchPenalty
        } else if (pitch >= highPitch) {
            return farPitchPenalty
        } else if (pitch >= midPitch) {
            return approxPitchPenalty
        }
        break
    default:
        break
    }
    return 0
}

function findChordRest(seg: Segment, strack: track_idx_t): [ElementType, ReducedFraction] {
    let elType = ElementType.INVALID
    let newRestLen = new ReducedFraction(0, 1)
    for (let voice = 0; voice < VOICES; ++voice) {
        const cr = chordRestAt(seg, strack + voice)
        if (!cr) {
            continue
        }
        if (cr.isChord()) {
            elType = ElementType.CHORD
            break
        } else if (cr.isRest()) {
            elType = ElementType.REST
            newRestLen = ReducedFraction.max(newRestLen, ReducedFraction.fromFraction(cr.globalTicks()))
        }
    }
    return [elType, newRestLen]
}

function findClefChangePenalty(pos: number, clefIndex: number, trebleBassPath: readonly number[][],
                               segment: Segment, staff: Staff): number {
    if (pos === 0) {
        return 0
    }

    const clefChangePenalty = 1000
    const prevClefChangePenalty = 10001
    const orphanChordPenalty = 2
    const notesBetweenClefs = 5 // should be >= 2

    let j = pos
    let totalRestLen = new ReducedFraction(0, 1)
    let penalty = 0
    const strack = staff.idx() * VOICES
    const barFraction = ReducedFraction.fromFraction(staff.score().sigmap().timesig(segment.tick()).timesig())
    const beatLen = beatLength(barFraction)

    // find backward penalty
    for (let segPrev = segment.prev1(SegmentType.ChordRest); ; segPrev = segPrev.prev1(SegmentType.ChordRest)) {
        if (!segPrev) {
            penalty += clefChangePenalty
            break
        }
        const el = findChordRest(segPrev, strack)
        if (el[0] === ElementType.CHORD) {
            --j
            if (j === pos - notesBetweenClefs) {
                break
            }
            if (j === 0 || trebleBassPath[clefIndex][j] !== clefIndex) {
                if (j === pos - 1) {
                    penalty += prevClefChangePenalty
                } else {
                    penalty += clefChangePenalty
                }
                break
            }
            totalRestLen = new ReducedFraction(0, 1)
        } else if (el[0] === ElementType.REST) {
            totalRestLen = totalRestLen.plus(el[1])
            if (totalRestLen.ge(beatLen)) {
                if (j !== pos) {
                    penalty += orphanChordPenalty
                }
                break
            }
        }
    }
    // find forward penalty
    let chordCounter = 0
    for (let seg: Segment | null = segment; ; seg = seg.next1(SegmentType.ChordRest)) {
        if (!seg) {
            penalty += clefChangePenalty
            break
        }
        const el = findChordRest(seg, strack)
        if (el[0] === ElementType.CHORD) {
            ++chordCounter
            if (chordCounter === notesBetweenClefs) {
                break
            }
            totalRestLen = new ReducedFraction(0, 1)
        } else if (el[0] === ElementType.REST) {
            totalRestLen = totalRestLen.plus(el[1])
            if (totalRestLen.ge(beatLen)) {
                penalty += orphanChordPenalty
                break
            }
        }
    }

    return penalty
}

function clefFromIndex(index: number): ClefType {
    return (index === 0) ? ClefType.G : ClefType.F
}

function makeDynamicProgrammingStep(penalties: number[][], optimalPaths: number[][], pos: number,
                                    tieState: TieState, minMaxPitch: MinMaxPitch, seg: Segment,
                                    staff: Staff): void {
    for (let clefIndex = 0; clefIndex !== 2; ++clefIndex) {
        // std::vector::resize(pos + 1): new elements are 0
        const path = optimalPaths[clefIndex]
        path.length = Math.min(path.length, pos + 1)
        while (path.length < pos + 1) {
            path.push(0)
        }
    }

    for (let curClef = 0; curClef !== 2; ++curClef) {
        const significantPitch = (curClef === 0) ? minMaxPitch.minPitch() : minMaxPitch.maxPitch()
        const pitchPenalty = findPitchPenaltyForClef(significantPitch, curClef)
        let minPenalty = INT_MAX
        let minIndex = 0
        for (let prevClef = 0; prevClef !== 2; ++prevClef) {
            let penalty = pitchPenalty
            if (prevClef !== curClef) {
                if (tieState === TieState.TIED_BACK || tieState === TieState.TIED_BOTH) {
                    continue // there is a tie breakage that is incorrect
                }
                penalty += findClefChangePenalty(pos, prevClef, optimalPaths, seg, staff)
            }
            penalty += (pos > 0) ? penalties[prevClef][(pos + 1) % 2] : 0
            if ((prevClef !== curClef && penalty < minPenalty)
                || (prevClef === curClef && penalty <= minPenalty)) {
                minPenalty = penalty
                minIndex = prevClef
            }
        }

        penalties[curClef][pos % 2] = minPenalty
        if (pos > 0) {
            optimalPaths[curClef][pos] = minIndex
        }
    }
}

// clefs should be created from the beginning to the end of the score
// (otherwise clefs that are equal the default staff clef at the beginning
//  will be ignored),
// results of dynamic programming are collected from the end to the beginning
// so we need to store temporary results

/** C++ createClefs(Staff*, optimalPaths, lastClef, segments) (overload of createClefs) */
function createClefsFromPaths(staff: Staff, optimalPaths: readonly number[][], lastClef: number,
                              segments: readonly Segment[]): boolean {
    const clefsAndTicks: [ClefType, number][] = []

    let currentClef = lastClef
    for (let i = optimalPaths[0].length - 1; i; --i) {
        const prevClef = optimalPaths[currentClef][i]
        if (prevClef !== currentClef) {
            clefsAndTicks.push([clefFromIndex(currentClef), segments[i].tick().ticks()])
            currentClef = prevClef
        }
    }
    if (clefsAndTicks.length === 0) {
        return false
    }

    createClef(clefFromIndex(currentClef), staff, 0) // main staff clef
    for (let i = clefsAndTicks.length; i; --i) { // clef changes
        createClef(clefsAndTicks[i - 1][0], staff, clefsAndTicks[i - 1][1], true)
    }

    return true
}

function createMainClefFromAveragePitch(staff: Staff, strack: track_idx_t): void {
    const allAveragePitch = new AveragePitch()
    for (let seg = staff.score().firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
        allAveragePitch.add(findAverageSegPitch(seg, strack))
    }
    const mainClef = clefTypeFromAveragePitch(allAveragePitch.pitch())
    createClef(mainClef, staff, 0)
}

export function hasGFclefs(templ: InstrumentTemplate | null): boolean {
    if (!templ) {
        return false
    }
    const staveCount = templ.staffCount
    let hasG = false
    let hasF = false
    for (let i = 0; i !== staveCount; ++i) {
        switch (templ.clefTypes[i].concertClef) {
        case ClefType.G:
            hasG = true
            break
        case ClefType.F:
            hasF = true
            break
        default:
            break
        }
    }
    return hasG && hasF
}

export function createClefs(staff: Staff, indexOfOperation: number, isDrumTrack: boolean): void {
    const opers = midiImportOperations.data().trackOpers
    const trackInstrList = opers.msInstrList.value(indexOfOperation)
    const msInstrIndex = opers.msInstrIndex.value(indexOfOperation)
    const hasInstrument = trackInstrList.length !== 0 && !!trackInstrList[msInstrIndex]

    if (isDrumTrack && !hasInstrument) {
        createClef(ClefType.PERC, staff, 0)
        return
    }

    const strack = staff.idx() * VOICES
    let mainClefWasSet = false
    const canChangeClef = !hasInstrument || hasGFclefs(trackInstrList[msInstrIndex])

    if (opers.changeClef.value(indexOfOperation) && canChangeClef) {
        const tieTracker = new TieStateMachine()

        // find optimal clef changes via dynamic programming
        // 0 - treble, 1 - bass; remember only 2 last positions to save memory (2 = current + prev)
        const penalties: number[][] = [[0, 0], [0, 0]]
        const optimalPaths: number[][] = [[], []] // first col is unused
        const segments: Segment[] = []

        let pos = 0
        for (let seg = staff.score().firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
            const minMaxPitch = findMinMaxSegPitch(seg, strack)
            if (minMaxPitch.empty()) { // no chords
                continue
            }
            tieTracker.addSeg(seg, strack)
            segments.push(seg)

            makeDynamicProgrammingStep(penalties, optimalPaths, pos, tieTracker.state(), minMaxPitch, seg, staff)
            ++pos
        }

        if (optimalPaths[0].length !== 0) {
            const lastClef = (penalties[1][(pos - 1) % 2] < penalties[0][(pos - 1) % 2]) ? 1 : 0
            // get the optimal clef changes found via dynamic programming
            if (createClefsFromPaths(staff, optimalPaths, lastClef, segments)) {
                mainClefWasSet = true
            }
        }
    }
    if (!mainClefWasSet && canChangeClef) {
        createMainClefFromAveragePitch(staff, strack)
    }
}
