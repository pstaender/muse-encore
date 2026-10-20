/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of the selection commands of src/engraving/editing/cmd.cpp (Score::move, Score::selectMove).
 * They are added to Score by this module (module augmentation), so it must be imported before they are used.
 *
 * TODO(port): note entry mode (InputState), setPlayNote, the commands next/prev-system, next/prev-frame,
 * next/prev-section, top-staff and empty-trailing-measure.
 */

import { ElementType } from '../types/types'
import { Score } from '../dom/score'
import { SelectType } from '../dom/select'
import { SegmentType } from '../dom/segment'
import { nextChordRest, prevChordRest, type Chord } from '../dom/chord'
import '../dom/navigate'
import type { EngravingItem } from '../dom/engravingitem'
import type { ChordRest } from '../dom/chordrest'
import type { Note } from '../dom/note'
import type { Rest } from '../dom/rest'
import type { Box } from '../dom/box'
import type { Segment } from '../dom/segment'

declare module '../dom/score' {
    interface Score {
        /** move current selection */
        move(cmd: string): EngravingItem | null
        selectMove(cmd: string): EngravingItem | null
    }
}

Score.prototype.move = function (this: Score, cmd: string): EngravingItem | null {
    let cr: ChordRest | null = null
    let box: Box | null = null
    // TODO(port): noteEntryMode() (the chord/rest at the input position)
    if (this.selection().activeCR()) {
        cr = this.selection().activeCR()
    } else {
        cr = this.selection().lastChordRest()
    }

    // no chord/rest found? look for another type of element,
    // but commands [empty-trailing-measure] and [top-staff] don't
    // necessarily need an active selection for appropriate functioning
    if (!cr && cmd !== 'empty-trailing-measure' && cmd !== 'top-staff') {
        if (this.selection().elements().length === 0) {
            return null
        }
        // retrieve last element of section list
        let el: EngravingItem | null = this.selection().elements()[this.selection().elements().length - 1]
        let trg: EngravingItem | null = null

        // get parent of element and process accordingly:
        // trg is the element to select on "next-chord" cmd
        // cr is the ChordRest to move from on other cmd's
        const track = el.track() // keep note of element track
        if (!el.isBox()) {
            el = el.parentItem()
        }
        // element with no parent (eg, a newly-added line) - no way to find context
        if (!el) {
            return null
        }
        switch (el.type()) {
        case ElementType.NOTE: // a note is a valid target
            trg = el
            cr = (el as unknown as Note).chord()
            break
        case ElementType.CHORD: // a chord or a rest are valid targets
        case ElementType.REST:
        case ElementType.MMREST:
            trg = el
            cr = trg as unknown as ChordRest
            break
        case ElementType.SEGMENT: { // from segment go to top chordrest in segment
            let seg: Segment | null = el as unknown as Segment
            // if segment is not chord/rest or grace, move to next chord/rest or grace segment
            if (!seg.isChordRestType()) {
                seg = seg.next1(SegmentType.ChordRest)
                if (!seg) { // if none found, return failure
                    return null
                }
            }
            // segment for sure contains chords/rests,
            const size = seg.elist().length
            // if segment has a chord/rest in original element track, use it
            if (track < size && seg.element(track)) {
                trg = seg.element(track)
                cr = trg as unknown as ChordRest
                break
            }
            // if not, get topmost chord/rest
            for (let i = 0; i < size; i++) {
                if (seg.element(i)) {
                    trg = seg.element(i)
                    cr = trg as unknown as ChordRest
                    break
                }
            }
            break
        }
        case ElementType.HBOX:
        case ElementType.VBOX:
        case ElementType.TBOX:
        case ElementType.FBOX:
            box = el as unknown as Box
            break
        default: // on anything else, return failure
            return null
        }

        // if something found and command is forward, the element found is the destination
        if (trg && cmd === 'next-chord') {
            // if chord, go to topmost note
            if (trg.isChord()) {
                trg = (trg as unknown as Chord).upNote()
            }
            this.select(trg, SelectType.SINGLE, 0)
            return trg
        }
        // if no chordrest and no box (frame) found, do nothing
        if (!cr && !box) {
            return null
        }
        // if some chordrest found, continue with default processing
    }

    let el: EngravingItem | null = null

    if (cmd === 'next-chord' && cr) {
        // selection "cursor"
        // find next chordrest, which might be a grace note
        el = nextChordRest(cr)

        // Skip gap rests if we're not in note entry mode...
        while (el && el.isRest() && (el as unknown as Rest).isGap()) {
            el = nextChordRest(el as unknown as ChordRest)
        }
        if (!el) {
            el = cr
        }
    } else if (cmd === 'prev-chord' && cr) {
        // selection "cursor"
        // find previous chordrest, which might be a grace note
        el = prevChordRest(cr)

        // Skip gap rests if we're not in note entry mode...
        while (el && el.isRest() && (el as unknown as Rest).isGap()) {
            el = prevChordRest(el as unknown as ChordRest)
        }
        if (!el) {
            el = cr
        }
    } else if (cmd === 'next-measure') {
        const next = box ? box.nextMeasure() : null
        if (next && next.first()) {
            el = next.first()!.nextChordRest(0, false)
        }
        if (cr) {
            el = this.nextMeasure(cr)
        }
    } else if (cmd === 'prev-measure') {
        const prev = box ? box.prevMeasure() : null
        if (prev && prev.first()) {
            el = prev.first()!.nextChordRest(0, false)
        }
        if (cr) {
            el = this.prevMeasure(cr)
        }
    } else if (cmd === 'next-track' && cr) {
        el = this.nextTrack(cr)
    } else if (cmd === 'prev-track' && cr) {
        el = this.prevTrack(cr)
    }
    // TODO(port): next/prev-system, next/prev-frame, next/prev-section, top-staff, empty-trailing-measure

    if (el) {
        if (el.isChord()) {
            el = (el as unknown as Chord).upNote() // originally downNote
        }
        this.select(el, SelectType.SINGLE, 0)
    }
    return el
}

Score.prototype.selectMove = function (this: Score, cmd: string): EngravingItem | null {
    let cr: ChordRest | null
    if (this.selection().activeCR()) {
        cr = this.selection().activeCR()
    } else {
        cr = this.selection().lastChordRest()
    }
    // TODO(port): noteEntryMode() (inputState().cr())
    if (!cr) {
        return null
    }

    let el: ChordRest | null = null
    // TODO(port): ChordRestNavigateOptions.skipMeasureRepeatRests = false
    if (cmd === 'select-next-chord') {
        el = nextChordRest(cr, true)
    } else if (cmd === 'select-prev-chord') {
        el = prevChordRest(cr, true)
    } else if (cmd === 'select-next-measure') {
        el = this.nextMeasure(cr, true, true)
    } else if (cmd === 'select-prev-measure') {
        el = this.prevMeasure(cr, true)
    } else if (cmd === 'select-begin-line') {
        const measure = cr.segment().measure().system()!.firstMeasure()
        if (!measure) {
            return null
        }
        el = measure.first()!.nextChordRest(cr.track())
    } else if (cmd === 'select-end-line') {
        const measure = cr.segment().measure().system()!.lastMeasure()
        if (!measure) {
            return null
        }
        el = measure.last()!.nextChordRest(cr.track(), true)
    } else if (cmd === 'select-begin-score') {
        const measure = this.firstMeasureMM()
        if (!measure) {
            return null
        }
        el = measure.first()!.nextChordRest(cr.track())
    } else if (cmd === 'select-end-score') {
        const measure = this.lastMeasureMM()
        if (!measure) {
            return null
        }
        el = measure.last()!.nextChordRest(cr.track(), true)
    } else if (cmd === 'select-staff-above') {
        el = this.upStaff(cr)
    } else if (cmd === 'select-staff-below') {
        el = this.downStaff(cr)
    }
    if (el) {
        this.select(el, SelectType.RANGE, el.staffIdx())
    }
    return el
}
