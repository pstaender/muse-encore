/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/musicxmltupletstate.h/.cpp
 *
 * The C++ out parameters (Fraction&) are { v } objects.
 */

import { TDuration } from '../../../../engraving/dom/durationtype'
import { Fraction } from '../../../../engraving/types/fraction'
import { StringMap } from '../../../../framework/global/orderedmap'
import { MusicXmlStartStop } from '../shared/musicxmltypes'

/** muse::Flags<MusicXmlTupletFlag>: a bit set */
export enum MusicXmlTupletFlag {
    NONE = 0,
    STOP_PREVIOUS = 1,
    START_NEW = 2,
    ADD_CHORD = 4,
    STOP_CURRENT = 8,
}
export type MusicXmlTupletFlags = number

export class MusicXmlTupletState {
    private inTuplet = false
    private implicit = false
    private actualNotes = 1
    private normalNotes = 1
    private duration = new Fraction(0, 1)
    private smallestNoteType = 0   // smallest note type in the tuplet
    private smallestNoteCount = 0   // number of smallest notes in the tuplet

    /** C++ *this = {} */
    private reset(): void {
        this.inTuplet = false
        this.implicit = false
        this.actualNotes = 1
        this.normalNotes = 1
        this.duration = new Fraction(0, 1)
        this.smallestNoteType = 0
        this.smallestNoteCount = 0
    }

    //---------------------------------------------------------
    //   determineTupletFractionAndFullDuration
    //---------------------------------------------------------

    /**
     Split duration into two factors where fullDuration is note sized
     (i.e. the denominator is a power of 2), 1/2 < fraction <= 1/1
     and fraction * fullDuration equals duration.
     */

    static determineTupletFractionAndFullDuration(duration: Fraction): { fraction: Fraction; fullDuration: Fraction } {
        let fraction = duration
        let fullDuration = new Fraction(1, 1)
        // move denominator's powers of 2 from fraction to fullDuration
        while (fraction.denominator() % 2 === 0) {
            fraction = fraction.times(2)
            fraction = fraction.reduced()
            fullDuration = fullDuration.times(new Fraction(1, 2))
        }
        // move numerator's powers of 2 from fraction to fullDuration
        while (fraction.numerator() % 2 === 0) {
            fraction = fraction.times(new Fraction(1, 2))
            fraction = fraction.reduced()
            fullDuration = fullDuration.times(2)
            fullDuration = fullDuration.reduced()
        }
        // make sure 1/2 < fraction <= 1/1
        while (fraction.le(new Fraction(1, 2))) {
            fullDuration = fullDuration.times(new Fraction(1, 2))
            fraction = fraction.times(2)
        }
        fullDuration = fullDuration.reduced()
        fraction = fraction.reduced()

        /*
        Examples (note result when denominator is not a power of two):
        3:2 tuplet of 1/4 results in fraction 1/1 and fullDuration 1/2
        2:3 tuplet of 1/4 results in fraction 3/1 and fullDuration 1/4
        4:3 tuplet of 1/4 results in fraction 3/1 and fullDuration 1/4
        3:4 tuplet of 1/4 results in fraction 1/1 and fullDuration 1/1

         Bring back fraction in 1/2 .. 1/1 range.
         */

        if (fraction.gt(new Fraction(1, 1)) && fraction.denominator() === 1) {
            fullDuration = fullDuration.times(fraction)
            fullDuration = fullDuration.reduced()
            fraction = new Fraction(1, 1)
        }
        return { fraction, fullDuration }
    }

    //---------------------------------------------------------
    //   missingTupletDuration
    //---------------------------------------------------------

    static missingTupletDuration(duration: Fraction): Fraction {
        const { fraction: tupletFraction, fullDuration: tupletFullDuration }
            = MusicXmlTupletState.determineTupletFractionAndFullDuration(duration)
        const missing = new Fraction(1, 1).minus(tupletFraction).times(tupletFullDuration)

        return missing
    }

    //---------------------------------------------------------
    //   isTupletFilled
    //---------------------------------------------------------

    /**
     Determine if the tuplet is completely filled,
     because either (1) it is at least the same duration
     as the specified number of the specified normal type notes
     or (2) the duration adds up to a normal note duration.

     Example (1): a 3:2 tuplet with a 1/4 and a 1/8 note
     is filled if normal type is 1/8,
     it is not filled if normal type is 1/4.

     Example (2): a 3:2 tuplet with a 1/4 and a 1/8 note is filled.
     */

    private isTupletFilled(normalType: TDuration, timeMod: Fraction): boolean {
        void timeMod
        let res = false

        if (normalType.isValid()) {
            const matched = { type: Number(normalType.type()), count: this.actualNotes }
            // match the types
            this.matchTypeAndCount(matched)
            // ... result scenario (1)
            res = this.smallestNoteCount >= matched.count
        } else {
            // ... result scenario (2)
            res = this.smallestNoteCount >= this.actualNotes
        }
        return res
    }

    //---------------------------------------------------------
    //   smallestTypeAndCount
    //---------------------------------------------------------

    /**
     Determine the smallest note type and the number of those
     present in a ChordRest.
     For a note without dots the type equals the note type
     and count is one.
     For a single dotted note the type equals half the note type
     and count is three.
     A double dotted note is similar.
     Note: code assumes when duration().type() is incremented,
     the note length is divided by two, checked by tupletAssert().
     */

    private smallestTypeAndCount(durType: TDuration): { type: number; count: number } {
        let type = Number(durType.type())
        let count = 1
        switch (durType.dots()) {
        case 0:
            // nothing to do
            break
        case 1:
            type += 1                 // next-smaller type
            count = 3
            break
        case 2:
            type += 2                 // next-next-smaller type
            count = 7
            break
        default:
            // smallestTypeAndCount() does not support more than 2 dots
            break
        }
        return { type, count }
    }

    //---------------------------------------------------------
    //   matchTypeAndCount
    //---------------------------------------------------------

    /**
     Given two note types and counts, if the types are not equal,
     make them equal by successively doubling the count of the
     largest type.
     */

    private matchTypeAndCount(note: { type: number; count: number }): void {
        while (this.smallestNoteType < note.type) {
            this.smallestNoteType++
            this.smallestNoteCount *= 2
        }
        while (note.type < this.smallestNoteType) {
            note.type++
            note.count *= 2
        }
    }

    //---------------------------------------------------------
    //   addDurationToTuplet
    //---------------------------------------------------------

    /**
     Add duration to tuplet duration
     Determine type and number of smallest notes in the tuplet
     */

    private addDurationToTuplet(dur: Fraction, timeMod: Fraction): void {
        if (this.duration.le(new Fraction(0, 1))) {
            // first note: init variables
            this.actualNotes = timeMod.denominator()
            this.normalNotes = timeMod.numerator()
            const tc = this.smallestTypeAndCount(new TDuration(dur.div(timeMod)))
            this.smallestNoteType = tc.type
            this.smallestNoteCount = tc.count
        } else {
            const note = this.smallestTypeAndCount(new TDuration(dur.div(timeMod)))
            // match the types
            this.matchTypeAndCount(note)
            this.smallestNoteCount += note.count
        }
        this.duration = this.duration.plus(dur)
    }

    //---------------------------------------------------------
    //   determineTupletAction
    //---------------------------------------------------------

    /**
     Update tuplet state using parse result tupletDesc.
     Tuplets with <actual-notes> and <normal-notes> but without <tuplet>
     are handled correctly.
     TODO Nested tuplets are not (yet) supported.
     */

    determineTupletAction(noteDuration: Fraction, timeMod: Fraction, tupletStartStop: MusicXmlStartStop, normalType: TDuration,
        missingPreviousDuration: { v: Fraction }, missingCurrentDuration: { v: Fraction }): MusicXmlTupletFlags {
        const actNotes = timeMod.denominator()
        const norNotes = timeMod.numerator()
        let res: MusicXmlTupletFlags = MusicXmlTupletFlag.NONE

        // check for unexpected termination of previous tuplet
        if (this.inTuplet && timeMod.eq(new Fraction(1, 1))) {
            // recover by simply stopping the current tuplet first
            if (!this.isTupletFilled(normalType, timeMod)) {
                missingPreviousDuration.v = MusicXmlTupletState.missingTupletDuration(this.duration)
            }
            this.reset()
            res |= MusicXmlTupletFlag.STOP_PREVIOUS
        }

        // check for obvious errors
        if (this.inTuplet && tupletStartStop === MusicXmlStartStop.START) {
            // tuplet already started
            // recover by simply stopping the current tuplet first
            if (!this.isTupletFilled(normalType, timeMod)) {
                missingPreviousDuration.v = MusicXmlTupletState.missingTupletDuration(this.duration)
            }
            this.reset()
            res |= MusicXmlTupletFlag.STOP_PREVIOUS
        }
        // tupletStartStop == STOP && !inTuplet: tuplet stop but no tuplet started
        // recovery handled later (automatically, no special case needed)

        // Tuplet are either started by the tuplet start
        // or when the time modification is first found.
        if (!this.inTuplet) {
            if (tupletStartStop === MusicXmlStartStop.START
                || (!this.inTuplet && (actNotes !== 1 || norNotes !== 1))) {
                if (tupletStartStop !== MusicXmlStartStop.START) {
                    this.implicit = true
                } else {
                    this.implicit = false
                }
                // create a new tuplet
                this.inTuplet = true
                res |= MusicXmlTupletFlag.START_NEW
            }
        }

        // Add chord to the current tuplet.
        // Must also check for actual/normal notes to prevent
        // adding one chord too much if tuplet stop is missing.
        if (this.inTuplet && !(actNotes === 1 && norNotes === 1)) {
            this.addDurationToTuplet(noteDuration, timeMod)
            res |= MusicXmlTupletFlag.ADD_CHORD
        }

        // Tuplets are stopped by the tuplet stop
        // or when the tuplet is filled completely
        // (either with knowledge of the normal type
        // or as a last resort calculated based on
        // actual and normal notes plus total duration)
        // or when the time-modification is not found.

        if (this.inTuplet) {
            if (tupletStartStop === MusicXmlStartStop.STOP
                || (this.implicit && this.isTupletFilled(normalType, timeMod))
                || (actNotes === 1 && norNotes === 1)) {           // incorrect ??? check scenario incomplete tuplet w/o start
                if (actNotes > norNotes && !this.isTupletFilled(normalType, timeMod)) {
                    missingCurrentDuration.v = MusicXmlTupletState.missingTupletDuration(this.duration)
                }

                this.reset()
                res |= MusicXmlTupletFlag.STOP_CURRENT
            }
        }

        return res
    }
}

/** std::map<String, MusicXmlTupletState> */
export class MusicXmlTupletStates extends StringMap<MusicXmlTupletState> {
    /** C++ tupletStates[key]: the value, default constructed and inserted if missing */
    at(key: string): MusicXmlTupletState {
        let v = this.get(key)
        if (!v) {
            v = new MusicXmlTupletState()
            this.set(key, v)
        }
        return v
    }
}
