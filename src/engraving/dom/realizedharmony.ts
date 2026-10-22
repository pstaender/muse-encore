/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/realizedharmony.h/.cpp
 * PitchMap (C++ std::multimap<int, int>, pitch -> tpc) is an array of [pitch, tpc] ordered by pitch
 * (equal pitches in insertion order).
 */

import { Fraction } from '../types/fraction'
import type { Harmony } from './harmony'
import { PITCH_DELTA_OCTAVE, Tpc, tpc2pitch, tpcInterval, tpcIsValid } from './pitchspelling'

/** voicing modes to use */
export enum Voicing {
    INVALID = -1,
    AUTO = 0,
    ROOT_ONLY,
    CLOSE,
    DROP_2,
    SIX_NOTE,
    FOUR_NOTE,
    THREE_NOTE,
}

/** duration to realize notes for */
export enum HDuration {
    INVALID = -1,
    UNTIL_NEXT_CHORD_SYMBOL = 0, // lasts until the next chord symbol or end of the schore
    STOP_AT_MEASURE_END, // lasts until next chord symbol or measure end
    SEGMENT_DURATION, // lasts for the duration of the segment
}

export type PitchMap = [number, number][]

function insert(map: PitchMap, pitch: number, tpc: number): void {
    let i = map.length
    while (i > 0 && map[i - 1][0] > pitch) {
        --i
    }
    map.splice(i, 0, [pitch, tpc])
}

/** C++ step2pitchInterval (pitchspelling.cpp) */
export function step2pitchInterval(step: number, alter: number): number {
    const intervals = [
        //  1  2  3  4  5  6  7
        0, 2, 4, 5, 7, 9, 11,
    ]

    return intervals[(step - 1) % 7] + alter
}

/**
 * Realized Harmony: holds information and functions to assist in the realization of chord symbols. This is what is
 * used to allow for chord symbol playback
 */
export class RealizedHarmony {
    private m_harmony: Harmony | null
    private m_notes: PitchMap = []
    private m_voicing = Voicing.AUTO
    private m_duration = HDuration.INVALID
    //whether or not the current notes QMap is up to date
    private m_dirty = true
    private m_literal = false // use all notes when possible and do not add any notes

    constructor(h: Harmony | null = null) {
        this.m_harmony = h
    }

    /** C++ copy (assignment) */
    copyFrom(o: RealizedHarmony): void {
        this.m_notes = o.m_notes.map(([p, t]) => [p, t])
        this.m_voicing = o.m_voicing
        this.m_duration = o.m_duration
        this.m_dirty = o.m_dirty
        this.m_literal = o.m_literal
    }

    /** sets the voicing and dirty flag if the passed voicing is different than current */
    setVoicing(v: Voicing): void {
        if (this.m_voicing === v) {
            return
        }
        this.m_voicing = v
        this.cascadeDirty(true)
    }

    /** sets the duration and dirty flag if the passed HDuration is different than current */
    setDuration(d: HDuration): void {
        if (this.m_duration === d) {
            return
        }
        this.m_duration = d
        this.cascadeDirty(true)
    }

    /** sets literal/jazz and dirty flag if the passed bool is different than current */
    setLiteral(literal: boolean): void {
        if (this.m_literal === literal) {
            return
        }
        this.m_literal = literal
        this.cascadeDirty(true)
    }

    setDirty(dirty: boolean): void { this.cascadeDirty(dirty) } //set dirty flag and cascade
    setHarmony(h: Harmony | null): void { this.m_harmony = h }

    voicing(): Voicing { return this.m_voicing }
    duration(): HDuration { return this.m_duration }
    literal(): boolean { return this.m_literal }
    harmony(): Harmony | null { return this.m_harmony }

    valid(): boolean { return !this.m_dirty && !!this.m_harmony }

    /** returns the list of notes */
    notes(): readonly [number, number][] {
        //with the way that the code is currently structured, there should be no way to
        //get to this function with dirty flag set although in the future it may be
        //better to just update if dirty here
        return this.m_notes
    }

    /** generates a note list based on the passed parameters */
    generateNotes(rootTpc: number, bassTpc: number, literal: boolean, voicing: Voicing, transposeOffset: number): PitchMap {
        //cut octaves from offset
        transposeOffset %= PITCH_DELTA_OCTAVE

        //The octave which to generate the body of the harmony, this is static const for now
        //but may be user controlled in the future
        const DEFAULT_OCTAVE = 5 //octave above middle C

        const notes: PitchMap = []
        let rootPitch = tpc2pitch(rootTpc) + transposeOffset
        //we need to treat this new pitch as a pitch between 0 and 11,
        //so that voicing remains consistent across transposition
        if (rootPitch < 0) {
            rootPitch = (rootPitch % PITCH_DELTA_OCTAVE) + PITCH_DELTA_OCTAVE
        } else {
            rootPitch %= PITCH_DELTA_OCTAVE
        }

        //create root note or bass note in second octave below middle C
        if (bassTpc !== Tpc.TPC_INVALID && voicing !== Voicing.ROOT_ONLY) {
            insert(notes, tpc2pitch(bassTpc) + transposeOffset + (DEFAULT_OCTAVE - 2) * PITCH_DELTA_OCTAVE, bassTpc)
        } else {
            insert(notes, rootPitch + (DEFAULT_OCTAVE - 2) * PITCH_DELTA_OCTAVE, rootTpc)
        }

        const closeVoicing = (): void => {
            //Voices notes in close position in the first octave above middle C
            insert(notes, rootPitch + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, rootTpc)
            //ensure that notes fall under a specific range
            //for now this range is between 5*12 and 6*12
            const intervals = this.getIntervals(rootTpc, literal)
            for (const [interval, tpc] of intervals) {
                insert(notes, (rootPitch + (interval % 128)) % PITCH_DELTA_OCTAVE + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, tpc)
            }
        }

        switch (voicing) {
        case Voicing.ROOT_ONLY: //already added root/bass so we are good
            break
        case Voicing.AUTO: //auto is close voicing for now since it is the most robust
            //but just render the root if the harmony isn't understandable
            if (!this.m_harmony!.parsedForm()!.understandable()) {
                break
            }
            closeVoicing()
            break
        case Voicing.CLOSE:
            closeVoicing()
            break
        case Voicing.DROP_2: {
            //select 4 notes from list
            const intervals = this.normalizeNoteMap(this.getIntervals(rootTpc, literal), rootTpc, rootPitch, 4)

            let counter = 0 //counter to drop the second note
            for (let i = intervals.length - 1; i >= 0; --i) {
                const it = intervals[i]
                if (++counter === 2) {
                    insert(notes, it[0] + (DEFAULT_OCTAVE - 1) * PITCH_DELTA_OCTAVE, it[1])
                } else {
                    insert(notes, it[0] + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, it[1])
                }
            }
        }
            break
        case Voicing.THREE_NOTE: {
            //Insert 2 notes in the octave above middle C
            const intervals = this.normalizeNoteMap(this.getIntervals(rootTpc, literal), rootTpc, rootPitch, 2, true)
            insert(notes, intervals[0][0] + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, intervals[0][1])
            insert(notes, intervals[1][0] + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, intervals[1][1])
        }
            break
        case Voicing.FOUR_NOTE:
        case Voicing.SIX_NOTE: {
            //four/six note voicing, drop every other note
            const relIntervals = this.getIntervals(rootTpc, literal)
            let intervals: PitchMap
            if (voicing === Voicing.FOUR_NOTE) {
                intervals = this.normalizeNoteMap(relIntervals, rootTpc, rootPitch, 3, true)
            } else { //voicing == Voicing::SIX_NOTE
                intervals = this.normalizeNoteMap(relIntervals, rootTpc, rootPitch, 5, true)
            }

            let counter = 0 //how many notes have been added
            for (let i = intervals.length - 1; i >= 0; --i) {
                const it = intervals[i]
                if (counter % 2) {
                    insert(notes, it[0] + (DEFAULT_OCTAVE - 1) * PITCH_DELTA_OCTAVE, it[1])
                } else {
                    insert(notes, it[0] + DEFAULT_OCTAVE * PITCH_DELTA_OCTAVE, it[1])
                }
                ++counter
            }
        }
            break
        default:
            break
        }
        return notes
    }

    /**
     * updates the current note map, this is where all of the rhythm and voicing choices matter since
     * the voicing algorithms depend on this.
     *
     * transposeOffset -- is the necessary adjustment that is added to the root and bass to get the correct sounding pitch
     */
    update(rootTpc: number, bassTpc: number, transposeOffset = 0): void {
        //on transposition the dirty flag is set by the harmony, but it's a little
        //bit risky design since these 3 parameters rely on the dirty bit and are not
        //otherwise checked by RealizedHarmony. This saves us 3 ints of space, but
        //has the added risk
        if (!this.m_dirty) {
            return
        }

        if (tpcIsValid(rootTpc)) {
            this.m_notes = this.generateNotes(rootTpc, bassTpc, this.m_literal, this.m_voicing, transposeOffset)
        }
        this.m_dirty = false
    }

    /**
     * gets the fraction duration for how long the harmony should be realized based on the HDuration set.
     * As the duration may depend on playback order the utick is required as a reference point.
     * Specifying the durationType will overwrite the setting set by the user for the specific harmony object.
     */
    getActualDuration(utick: number, durationType = HDuration.INVALID): Fraction {
        let dur: HDuration
        if (durationType !== HDuration.INVALID) {
            dur = durationType
        } else {
            dur = this.m_duration
        }
        switch (dur) {
        case HDuration.UNTIL_NEXT_CHORD_SYMBOL:
            return this.m_harmony!.ticksTillNext(utick, false)
        case HDuration.STOP_AT_MEASURE_END:
            return this.m_harmony!.ticksTillNext(utick, true)
        case HDuration.SEGMENT_DURATION: {
            const s = this.m_harmony!.getParentSeg()
            if (s) {
                // TODO - use duration of chordrest on this segment / track
                // currently, this will result in too short of a duration
                // if there are shorter notes on other staves
                // but, we can only do this up to the next harmony that is being realized,
                // or elese we would get overlap
                // (e.g., if the notes are dotted half / quarter, but chords are half / half,
                // then we can't actually make the first chord a dotted half)
                return s.ticks()
            } else {
                return new Fraction(0, 1)
            }
        }
        default:
            return new Fraction(0, 1)
        }
    }

    /**
     * gets a weighted map from intervals to TPCs based on a passed root tpc (this allows for us to
     * keep pitches, but transpose notes on the score)
     *
     * Weighting System:
     * - Rank 0: 3rd, altered 5th, suspensions (characteristic notes)
     * - Rank 1: 7th
     * - Rank 2: 9ths
     * - Rank 3: 13ths where applicable and (in minor chords) 11ths
     * - Rank 3: Other alterations and additions
     * - Rank 4: 5th and (in major/dominant chords) 11th
     */
    private getIntervals(rootTpc: number, literal = true): PitchMap {
        //RANKING SYSTEM
        const RANK_MULT = 128 //used as multiplier and mod since MIDI pitch goes from 0-127
        const RANK_3RD = 0
        const RANK_7TH = 1
        const RANK_9TH = 2
        const RANK_ADD = 3
        const RANK_OMIT = 4

        const FIFTH = 7 + RANK_MULT * RANK_OMIT

        const ret: PitchMap = []

        const p = this.m_harmony!.parsedForm()!
        const quality = p.quality()
        const ext = parseInt(p.extension(), 10) || 0
        const modList = p.modifierList()

        let omit = 0 //omit flags for which notes to omit (for notes that are altered
                     //or specified to be omitted as a modification) so that they
                     //are not later added
        let alt5 = false //altered 5

        //handle modifiers
        for (const s of modList) {
            //find number, split up mods
            let modded = false
            for (let c = 0; c < s.length; ++c) {
                if (s[c] >= '0' && s[c] <= '9') {
                    let alter = 0
                    let cutoff = c
                    const deg = parseInt(s.replace(/[^0-9]+/g, ''), 10) || 0
                    //account for if the flat/sharp is stuck to the end of add
                    if (c) {
                        if (s[c - 1] === '#') {
                            cutoff -= 1
                            if (deg === 7) {
                                alter = 0
                            } else {
                                alter = +1
                            }
                        } else if (s[c - 1] === 'b') {
                            cutoff -= 1
                            alter = -1
                        }
                    }

                    const extType = s.slice(0, cutoff)
                    if (extType === '' || extType === 'major') { //alteration
                        if (deg === 9) {
                            insert(ret, step2pitchInterval(deg, alter) + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, deg, alter))
                        } else {
                            insert(ret, step2pitchInterval(deg, alter) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, deg, alter))
                        }
                        if (deg === 5) {
                            alt5 = true
                        }
                        omit |= 1 << deg
                        modded = true
                    } else if (extType === 'sus') {
                        insert(ret, step2pitchInterval(deg, alter) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, deg, alter))
                        omit |= 1 << 3
                        modded = true
                    } else if (extType === 'no') {
                        omit |= 1 << deg
                        modded = true
                    } else if (extType === 'add') {
                        insert(ret, step2pitchInterval(deg, alter) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, deg, alter))
                        omit |= 1 << deg
                        modded = true
                    }
                    break
                }
            }

            //check for special chords, if we haven't modded anything yet there is a special or incomprehensible modifier
            if (!modded) {
                if (s === 'phryg') {
                    insert(ret, step2pitchInterval(9, -1) + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, -1))
                    omit |= 1 << 9
                } else if (s === 'lyd') {
                    insert(ret, step2pitchInterval(11, +1) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 11, +1))
                    omit |= 1 << 11
                } else if (s === 'blues') {
                    insert(ret, step2pitchInterval(9, +1) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 9, +1))
                    omit |= 1 << 9
                } else if (s === 'alt') {
                    insert(ret, step2pitchInterval(5, -1) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 5, -1))
                    insert(ret, step2pitchInterval(5, +1) + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 5, +1))
                    omit |= 1 << 5
                    insert(ret, step2pitchInterval(9, -1) + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, -1))
                    insert(ret, step2pitchInterval(9, +1) + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, +1))
                    omit |= 1 << 9
                } else { //no easy way to realize tristan chords since they are more analytical tools
                    omit = ~0
                }
            }
        }

        //handle ext = 5: power chord so omit the 3rd
        if (ext === 5) {
            omit |= 1 << 3
        }

        //handle chord quality
        if (quality === 'minor') {
            if (!(omit & (1 << 3))) {
                insert(ret, step2pitchInterval(3, -1) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 3, -1)) //min3
            }
            if (!(omit & (1 << 5))) {
                insert(ret, step2pitchInterval(5, 0) + RANK_MULT * RANK_OMIT, tpcInterval(rootTpc, 5, 0)) //p5
            }
        } else if (quality === 'augmented') {
            if (!(omit & (1 << 3))) {
                insert(ret, step2pitchInterval(3, 0) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 3, 0)) //maj3
            }
            if (!(omit & (1 << 5))) {
                insert(ret, step2pitchInterval(5, +1) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 5, +1)) //p5
            }
        } else if (quality === 'diminished' || quality === 'half-diminished') {
            if (!(omit & (1 << 3))) {
                insert(ret, step2pitchInterval(3, -1) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 3, -1)) //min3
            }
            if (!(omit & (1 << 5))) {
                insert(ret, step2pitchInterval(5, -1) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 5, -1)) //dim5
            }
            if (!(omit & (1 << 7)) && quality === 'half-diminished') {
                insert(ret, step2pitchInterval(7, -1) + RANK_MULT * RANK_7TH, tpcInterval(rootTpc, 7, -1)) //min7
            }
            alt5 = true
        } else { //major or dominant
            if (!(omit & (1 << 3))) {
                insert(ret, step2pitchInterval(3, 0) + RANK_MULT * RANK_3RD, tpcInterval(rootTpc, 3, 0)) //maj3
            }
            if (!(omit & (1 << 5))) {
                insert(ret, step2pitchInterval(5, 0) + RANK_MULT * RANK_OMIT, tpcInterval(rootTpc, 5, 0)) //p5
            }
        }

        //handle extension (C++ switch with fall through 13 -> 11 -> 9 -> 7)
        if (ext === 13 || ext === 11 || ext === 9 || ext === 7) {
            if (ext === 13) {
                if (!(omit & (1 << 13))) {
                    insert(ret, 9 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 13, 0)) //maj13
                    omit |= 1 << 13
                }
            }
            if (ext === 13 || ext === 11) {
                if (!(omit & (1 << 11))) {
                    if (quality === 'minor') {
                        insert(ret, 5 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 11, 0)) //maj11
                    } else if (literal) {
                        insert(ret, 5 + RANK_MULT * RANK_OMIT, tpcInterval(rootTpc, 11, 0)) //maj11
                    }
                    omit |= 1 << 11
                }
            }
            if (ext === 13 || ext === 11 || ext === 9) {
                if (!(omit & (1 << 9))) {
                    insert(ret, 2 + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, 0)) //maj9
                    omit |= 1 << 9
                }
            }
            if (!(omit & (1 << 7))) {
                if (quality === 'major') {
                    insert(ret, 11 + RANK_MULT * RANK_7TH, tpcInterval(rootTpc, 7, 0))
                } else if (quality === 'diminished') {
                    insert(ret, 9 + RANK_MULT * RANK_7TH, tpcInterval(rootTpc, 7, -2))
                } else if (quality === 'half-diminished') {
                    // 7th note already added when handling chord quality
                } else { //dominant or augmented or minor
                    insert(ret, 10 + RANK_MULT * RANK_7TH, tpcInterval(rootTpc, 7, -1))
                }
            }
        } else if (ext === 6) {
            if (!(omit & (1 << 6))) {
                insert(ret, 9 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 6, 0)) //maj6
                omit |= 1 << 13 //no need to add/alter 6 chords
            }
        } else if (ext === 5) {
            //omitted third already
        } else if (ext === 4) {
            if (!(omit & (1 << 4))) {
                insert(ret, 5 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 4, 0)) //p4
            }
        } else if (ext === 2) {
            if (!(omit & (1 << 2))) {
                insert(ret, 2 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 2, 0)) //maj2
            }
            omit |= 1 << 9 //make sure we don't add altered 9 when theres a 2
        } else if (ext === 69) {
            insert(ret, 9 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 6, 0)) //maj6
            insert(ret, 2 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 9, 0)) //maj6
            omit = ~0 //no additions/alterations for a 69 chord
        }

        const next = this.m_harmony!.findNext()
        if (!literal && next && tpcIsValid(next.rootTpc())) {
            //jazz interpretation
            const qNext = next.parsedForm()!.quality()
            //pitch from current to next harmony normalized to a range between 0 and 12
            //add PITCH_DELTA_OCTAVE before modulo so that we can ensure arithmetic mod rather than computer mod
            const pitchBetween = (tpc2pitch(next.rootTpc()) + PITCH_DELTA_OCTAVE - tpc2pitch(rootTpc)) % PITCH_DELTA_OCTAVE
            const maj7 = qNext === 'major' && (parseInt(next.parsedForm()!.extension(), 10) || 0) >= 7 //whether or not the next chord has major 7

            //commented code: dont add 9 for diminished chords
            if (!(omit & (1 << 9))) {
                if (quality === 'dominant' && pitchBetween === 5 && (qNext === 'minor' || maj7)) {
                    //flat 9 when resolving a fourth up to a minor chord or major 7th
                    insert(ret, 1 + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, -1))
                } else { //add major 9
                    insert(ret, 2 + RANK_MULT * RANK_9TH, tpcInterval(rootTpc, 9, 0))
                }
            }

            if (!(omit & (1 << 13)) && !alt5) {
                if (quality === 'dominant' && pitchBetween === 5 && qNext === 'minor') {
                    //flat 13 for dominant to chord a P4 up
                    //only for minor chords for now
                    // muse::remove(ret, FIFTH): all entries with that key
                    for (let i = ret.length - 1; i >= 0; --i) {
                        if (ret[i][0] === FIFTH) {
                            ret.splice(i, 1)
                        }
                    }
                    insert(ret, 8 + RANK_MULT * RANK_ADD, tpcInterval(rootTpc, 13, -1))
                }
                //major 13 considered, but too dependent on melody and voicing of other chord
                //no implementation for now
            }
        }
        return ret
    }

    /**
     * normalize the pitch map from intervals to create pitches between 0 and 12 and resolve any weighting system.
     * enforceMaxEquals - enforce the max as a goal so that the max is how many notes is inserted
     */
    private normalizeNoteMap(intervals: PitchMap, rootTpc: number, rootPitch: number, max = 128, enforceMaxAsGoal = false): PitchMap {
        const ret: PitchMap = []
        let it = 0

        for (let i = 0; i < max; ++i) {
            if (it === intervals.length) {
                break
            }
            insert(ret, (intervals[it][0] % 128 + rootPitch) % PITCH_DELTA_OCTAVE, intervals[it][1]) //128 is RANK_MULT
            ++it
        }

        //redo insertions if we must have a specific number of notes with insertMulti
        if (enforceMaxAsGoal) {
            while (ret.length < max) {
                insert(ret, rootPitch, rootTpc) //duplicate root

                const size = max - ret.length
                it = 0 //reset iterator
                for (let i = 0; i < size; ++i) {
                    if (it === intervals.length) {
                        break
                    }
                    insert(ret, (intervals[it][0] % 128 + rootPitch) % PITCH_DELTA_OCTAVE, intervals[it][1])
                    ++it
                }
            }
        } else if (ret.length < max) { //insert another root if we have room in general
            insert(ret, rootPitch, rootTpc)
        }
        return ret
    }

    /**
     * cascades the dirty flag backwards so that everything is properly set
     * this is required since voicing algorithms may look ahead
     */
    private cascadeDirty(dirty: boolean): void {
        if (dirty && !this.m_dirty) { //only cascade when we want to set our clean realized harmony to dirty
            const prev = this.m_harmony ? this.m_harmony.findPrev() : null
            if (prev) {
                prev.realizedHarmony().cascadeDirty(dirty)
            }
        }
        this.m_dirty = dirty
    }
}
