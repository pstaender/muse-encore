/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of the Score methods of src/engraving/dom/navigate.cpp (nextChordRest/prevChordRest are in
 * chord.ts). They are added to Score by this module (module augmentation), so it must be imported before they are used.
 *
 * TODO(port): Score::nextElement/prevElement (needs the nextSegmentElement/prevSegmentElement and
 * nextElement/prevElement overrides of most element classes), lastElement(frame) for frames with children.
 */

import { VOICES, track2staff, type staff_idx_t } from '../types/types'
import { Score } from './score'
import { SegmentType, type Segment } from './segment'
import type { EngravingItem } from './engravingitem'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Measure } from './measure'
import { lyricsNavigation, type Lyrics } from './lyrics'

declare module './score' {
    interface Score {
        upAlt(element: EngravingItem): EngravingItem | null
        upAltCtrl(note: Note): Note
        downAlt(element: EngravingItem): EngravingItem | null
        downAltCtrl(note: Note): Note
        firstElement(frame?: boolean): EngravingItem | null
        lastElement(frame?: boolean): EngravingItem | null
        upStaff(cr: ChordRest): ChordRest | null
        downStaff(cr: ChordRest): ChordRest | null
        nextTrack(cr: ChordRest | null, skipMeasureRepeatRests?: boolean): ChordRest | null
        prevTrack(cr: ChordRest | null, skipMeasureRepeatRests?: boolean): ChordRest | null
        nextMeasure(element: ChordRest | null, selectBehavior?: boolean, mmRest?: boolean): ChordRest | null
        prevMeasure(element: ChordRest | null, mmRest?: boolean): ChordRest | null
        firstSegmentMM(segType: SegmentType): Segment | null
        lastSegmentMM(): Segment | null
    }
}

/**
 * element: Note, Rest, MMRest, or MeasureRepeat; return: Note, Rest, MMRest, or MeasureRepeat
 * return next higher pitched note in chord, move to previous track if at top of chord
 */
Score.prototype.upAlt = function (this: Score, element: EngravingItem): EngravingItem | null {
    let re: EngravingItem | null = null
    if (element.isRestFamily()) {
        re = this.prevTrack(element as unknown as ChordRest)
    } else if (element.isNote()) {
        const note = element as unknown as Note
        const chord = note.chord()
        const notes = chord.notes()
        const i = notes.indexOf(note) + 1
        if (i < notes.length) {
            re = notes[i]
        } else {
            re = this.prevTrack(chord)
            if (re && re.track() === chord.track()) {
                re = element
            }
        }
    }
    if (!re) {
        return null
    }
    if (re.isChord()) {
        re = (re as unknown as Chord).notes()[0]
    }
    return re
}

/** select top note in chord */
Score.prototype.upAltCtrl = function (this: Score, note: Note): Note {
    return note.chord().upNote()
}

/** return next lower pitched note in chord, move to next track if at bottom of chord */
Score.prototype.downAlt = function (this: Score, element: EngravingItem): EngravingItem | null {
    let re: EngravingItem | null = null
    if (element.isRestFamily()) {
        re = this.nextTrack(element as unknown as ChordRest)
    } else if (element.isNote()) {
        const note = element as unknown as Note
        const chord = note.chord()
        const notes = chord.notes()
        const i = notes.indexOf(note)
        if (i > 0) {
            re = notes[i - 1]
        } else {
            re = this.nextTrack(chord)
            if (re && re.track() === chord.track()) {
                re = element
            }
        }
    }
    if (!re) {
        return null
    }
    if (re.isChord()) {
        const notes = (re as unknown as Chord).notes()
        re = notes[notes.length - 1]
    }
    return re
}

/** select bottom note in chord */
Score.prototype.downAltCtrl = function (this: Score, note: Note): Note {
    return note.chord().downNote()
}

Score.prototype.firstElement = function (this: Score, frame = true): EngravingItem | null {
    if (frame) {
        const mb = this.measures().first()
        if (mb && mb.isBox()) {
            return mb
        }
    }
    const s = this.firstSegmentMM(SegmentType.All)
    return s ? s.element(0) : null
}

Score.prototype.lastElement = function (this: Score, frame = true): EngravingItem | null {
    if (frame) {
        const mb = this.measures().last()
        if (mb && mb.isBox()) {
            // TODO(port): the last child of the box (toChildPairsSet)
            return mb
        }
    }
    let re: EngravingItem | null = null
    let seg = this.lastSegmentMM()
    if (!seg) {
        return null
    }
    while (seg) {
        for (let i = (this.staves().length - 1) * VOICES; i < this.staves().length * VOICES; i++) {
            if (seg.element(i)) {
                re = seg.element(i)
            }
        }
        if (re) {
            if (re.isChord()) {
                return (re as unknown as Chord).notes()[0]
            }
            return re
        }
        seg = seg.prev1MM(SegmentType.All)
    }
    return null
}

Score.prototype.upStaff = function (this: Score, cr: ChordRest): ChordRest | null {
    const segment = cr.segment()

    if (cr.staffIdx() === 0) {
        return cr
    }

    for (let track = (cr.staffIdx() - 1) * VOICES; track >= 0; --track) {
        let el = segment.element(track)
        if (!el) {
            continue
        }
        if (el.isNote()) {
            el = (el as unknown as Note).chord()
        }
        if (el.isChordRest()) {
            return el as unknown as ChordRest
        }
    }
    return null
}

Score.prototype.downStaff = function (this: Score, cr: ChordRest): ChordRest | null {
    const segment = cr.segment()
    const tracks = this.nstaves() * VOICES

    if (cr.staffIdx() === this.nstaves() - 1) {
        return cr
    }

    // like C++: the (unsigned) track is decremented until it wraps around
    for (let track = (cr.staffIdx() + 1) * VOICES; track < tracks && track >= 0; --track) {
        let el = segment.element(track)
        if (!el) {
            continue
        }
        if (el.isNote()) {
            el = (el as unknown as Note).chord()
        }
        if (el.isChordRest()) {
            return el as unknown as ChordRest
        }
    }
    return null
}

/**
 * returns note at or just before current (cr) position in next track for this measure that contains such an element
 */
Score.prototype.nextTrack = function (this: Score, cr: ChordRest | null, skipMeasureRepeatRests = true): ChordRest | null {
    if (!cr) {
        return null
    }

    let el: ChordRest | null = null
    let measure: Measure = cr.measure()
    let track = cr.track()
    const tracks = this.nstaves() * VOICES

    while (!el) {
        // find next non-empty track
        while (++track < tracks) {
            if (measure.hasVoice(track)) {
                break
            }
        }
        // no more tracks, return original element
        if (track === tracks) {
            return cr
        }
        // treat MeasureRepeat as if it starts in the first measure of its group even if internally it's farther along
        if (cr.isMeasureRepeat()) {
            measure = measure.firstOfMeasureRepeatGroup(cr.staffIdx())!
            return measure.first(SegmentType.ChordRest)!.element(track) as unknown as ChordRest | null
        }
        // find element at same or previous segment within this track
        for (let segment: Segment | null = cr.segment(); segment; segment = segment.prev(SegmentType.ChordRest)) {
            el = segment.element(track) as unknown as ChordRest | null
            if (el) {
                break
            }
        }
    }
    if (skipMeasureRepeatRests && el.isRest() && measure.isMeasureRepeatGroup(track2staff(track))) {
        el = measure.measureRepeatElement(track2staff(track))
    }
    return el
}

/**
 * returns ChordRest at or just before current (cr) position in previous track for this measure that contains such
 * an element
 */
Score.prototype.prevTrack = function (this: Score, cr: ChordRest | null, skipMeasureRepeatRests = true): ChordRest | null {
    if (!cr) {
        return null
    }

    let el: ChordRest | null = null
    let measure: Measure = cr.measure()
    let track = cr.track()

    while (!el) {
        // find next non-empty track
        while (--track >= 0) {
            if (measure.hasVoice(track)) {
                break
            }
        }
        // no more tracks, return original element
        if (track < 0) {
            return cr
        }
        // treat MeasureRepeat as if it starts in the first measure of its group even if internally it's farther along
        if (cr.isMeasureRepeat()) {
            measure = measure.firstOfMeasureRepeatGroup(cr.staffIdx())!
            return measure.first(SegmentType.ChordRest)!.element(track) as unknown as ChordRest | null
        }
        // find element at same or previous segment within this track
        for (let segment: Segment | null = cr.segment(); segment; segment = segment.prev(SegmentType.ChordRest)) {
            el = segment.element(track) as unknown as ChordRest | null
            if (el) {
                break
            }
        }
    }
    if (skipMeasureRepeatRests && el.isRest() && measure.isMeasureRepeatGroup(track2staff(track))) {
        el = measure.measureRepeatElement(track2staff(track))
    }
    return el
}

function firstChordRestInStaff(measure: Measure, staff: staff_idx_t, last: boolean): ChordRest | null {
    const startSeg = last ? measure.last() : measure.first()
    for (let seg = startSeg; seg; seg = last ? seg.prev() : seg.next()) {
        const etrack = (staff + 1) * VOICES
        for (let track = staff * VOICES; track < etrack; ++track) {
            const pel = seg.element(track)

            if (pel && pel.isChordRest()) {
                return pel as unknown as ChordRest
            }
        }
    }
    return null
}

Score.prototype.nextMeasure = function (this: Score, element: ChordRest | null, selectBehavior = false,
    mmRest = false): ChordRest | null {
    if (!element) {
        return null
    }

    let measure: Measure | null = mmRest ? element.measure().nextMeasureMM() : element.measure().nextMeasure()

    const endTick = element.measure().last()!.nextChordRest(element.track(), true)!.tick()
    let last = false

    if (this.selection().isRange()) {
        if (!element.tick().eq(endTick) && this.selection().tickEnd().le(endTick)) {
            measure = element.measure()
            last = true
        } else if (element.tick().eq(endTick) && this.selection().isEndActive()) {
            last = true
        }
    } else if (!element.tick().eq(endTick) && selectBehavior) {
        measure = element.measure()
        last = true
    }
    if (!measure) {
        measure = element.measure()
        last = true
    }
    return firstChordRestInStaff(measure, element.staffIdx(), last)
}

Score.prototype.prevMeasure = function (this: Score, element: ChordRest | null, mmRest = false): ChordRest | null {
    if (!element) {
        return null
    }

    let measure: Measure | null = mmRest ? element.measure().prevMeasureMM() : element.measure().prevMeasure()

    const startTick = element.measure().first()!.nextChordRest(element.track())!.tick()
    let last = false

    if (this.selection().isRange() && this.selection().isEndActive() && this.selection().startSegment()!.tick().le(startTick)) {
        last = true
    } else if (!element.tick().eq(startTick)) {
        measure = element.measure()
    }
    if (!measure) {
        measure = element.measure()
        last = false
    }

    return firstChordRestInStaff(measure, element.staffIdx(), last)
}

Score.prototype.firstSegmentMM = function (this: Score, segType: SegmentType): Segment | null {
    const m = this.firstMeasureMM()
    return m ? m.first(segType) : null
}

Score.prototype.lastSegmentMM = function (this: Score): Segment | null {
    const m = this.lastMeasureMM()
    return m ? m.last() : null
}

// =====================================================================================================================
//   lyrics navigation (navigate.cpp: prevLyrics, nextLyrics), used by text editing
// =====================================================================================================================

export function prevLyrics(lyrics: Lyrics): Lyrics | null {
    let seg: Segment | null = lyrics.explicitParent() ? lyrics.segment() : null
    if (!seg) {
        return null
    }
    while ((seg = seg.prev1(SegmentType.ChordRest))) {
        const strack = lyrics.staffIdx() * VOICES
        const etrack = strack + VOICES
        for (let track = strack; track < etrack; ++track) {
            const el = seg.element(track)
            const prev = el && el.isChord() ? (el as unknown as ChordRest).lyricsVerse(lyrics.verse(), lyrics.placement()) : null
            if (prev) {
                return prev
            }
        }
    }
    return null
}

export function nextLyrics(lyrics: Lyrics): Lyrics | null {
    const seg: Segment | null = lyrics.explicitParent() ? lyrics.segment() : null
    if (!seg) {
        return null
    }
    let nextSegment: Segment | null = seg
    while ((nextSegment = nextSegment.next1(SegmentType.ChordRest))) {
        const strack = lyrics.staffIdx() * VOICES
        const etrack = strack + VOICES
        for (let track = strack; track < etrack; ++track) {
            const el = nextSegment.element(track)
            const next = el && el.isChord() ? (el as unknown as ChordRest).lyricsVerse(lyrics.verse(), lyrics.placement()) : null
            if (next) {
                return next
            }
        }
    }
    return null
}

lyricsNavigation.prevLyrics = prevLyrics
