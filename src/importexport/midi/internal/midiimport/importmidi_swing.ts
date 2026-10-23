/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_swing.h/.cpp (namespace Swing)
 */

import type { ChordRest } from '../../../../engraving/dom/chordrest'
import type { Staff } from '../../../../engraving/dom/staff'
import { StaffText } from '../../../../engraving/dom/stafftextbase'
import type { Tuplet } from '../../../../engraving/dom/tuplet'
import { Fraction } from '../../../../engraving/types/fraction'
import { Constants } from '../../../../engraving/types/constants'
import { DurationType, TextStyleType, VOICES } from '../../../../engraving/types/types'
import { SegmentType } from '../../../../engraving/dom/segment'
import { ReducedFraction } from './importmidi_fraction'
import { Swing } from './importmidi_operation'

class SwingDetector {
    private elements: ChordRest[] = []
    private sumLen = new ReducedFraction()
    private readonly FULL_LEN = new ReducedFraction(1, 4)
    private swingApplied = false

    constructor(private readonly swingType: Swing) {}

    wasSwingApplied(): boolean { return this.swingApplied }

    add(cr: ChordRest): void {
        if (this.elements.length === 0) {
            if (ReducedFraction.fromFraction(cr.globalTicks()).ge(this.FULL_LEN)) {
                return
            }
            // like C++: DurationElement::measure() is the explicit parent (here the segment)
            const tickInBar = cr.tick().minus(cr.measure().tick()).ticks()
            if (tickInBar % Constants.DIVISION === 0) {
                this.append(cr)
            }
        } else {
            if (this.sumLen.plus(ReducedFraction.fromFraction(cr.globalTicks())).gt(this.FULL_LEN)) {
                this.reset()
                return
            }
            this.append(cr)
            if (this.sumLen.eq(this.FULL_LEN)) {
                // check for swing patterns
                switch (this.swingType) {
                case Swing.SWING:
                    this.checkNormalSwing()
                    break
                case Swing.SHUFFLE:
                    this.checkShuffle()
                    break
                default:
                    break
                }
                this.reset()
            }
        }
    }

    private reset(): void {
        this.elements = []
        this.sumLen = ReducedFraction.fromFraction(new Fraction(0, 1))
    }

    private append(cr: ChordRest): void {
        if (cr.isChord() || cr.isRest()) {
            this.elements.push(cr)
            this.sumLen = this.sumLen.plus(ReducedFraction.fromFraction(cr.globalTicks()))
        }
    }

    private checkNormalSwing(): void {
        const elements = this.elements
        if (elements.length === 2
            && this.areAllTuplets()
            && (elements[0].isChord() || elements[1].isChord())
            && elements[0].ticks().reduced().eq(new Fraction(1, 4))
            && elements[1].ticks().reduced().eq(new Fraction(1, 8))) {
            // swing with two 8th notes
            // or 8th note + 8th rest
            // or 8th rest + 8th note
            this.applySwing()
        } else if (elements.length === 3
                   && elements[0].isChord()
                   && elements[1].isRest()
                   && elements[2].isChord()
                   && elements[0].ticks().reduced().eq(new Fraction(1, 8))
                   && elements[1].ticks().reduced().eq(new Fraction(1, 8))
                   && elements[2].ticks().reduced().eq(new Fraction(1, 8))) {
            // swing with two 8th notes
            this.applySwing()
        }
    }

    private checkShuffle(): void {
        const elements = this.elements
        if (elements.length === 2
            && this.areAllNonTuplets()
            && elements[0].isChord()
            && (elements[1].isChord()
                || elements[1].isRest())
            && elements[0].ticks().reduced().eq(new Fraction(3, 16)) // dotted 8th
            && elements[1].ticks().reduced().eq(new Fraction(1, 16))) {
            // swing with two 8th notes
            // or 8th note + 8th rest
            this.applySwing()
        }
    }

    private applySwing(): void {
        const elements = this.elements
        if (elements.length !== 2 && elements.length !== 3) {
            return
        }

        let tuplet: Tuplet | null = null
        for (const el of elements) {
            el.setDurationType(DurationType.V_EIGHTH)
            el.setTicks(new Fraction(1, 8))
            el.setDots(0)
            if (el.tuplet()) {
                if (!tuplet) {
                    tuplet = el.tuplet()
                }
                tuplet!.remove(el)
                el.setTuplet(null)
            }
        }

        const first = elements[0]
        const startTick = first.segment().tick().ticks()
        const last = elements[elements.length - 1]
        // C++ last->measure()->getSegment(): DurationElement::measure() is the segment there (undefined behaviour);
        // the measure of the segment is used here
        const measure = last.segment().measure()
        last.segment().remove(last)
        const s = measure.getSegment(SegmentType.ChordRest, Fraction.fromTicks(startTick + Constants.DIVISION / 2))
        s.add(last)

        if (elements.length === 3) {
            // remove central rest
            const cr = elements[1]
            cr.score().removeElement(cr)
        }

        if (tuplet) {
            // delete tuplet (C++ ~Tuplet: the remaining elements lose their tuplet)
            for (const de of tuplet.elements()) {
                if (de.tuplet() === tuplet) {
                    de.setTuplet(null)
                }
            }
            tuplet = null
        }
        if (!this.swingApplied) {
            this.swingApplied = true
        }
    }

    private areAllTuplets(): boolean {
        for (const el of this.elements) {
            if (!el.tuplet()) {
                return false
            }
        }
        return true
    }

    private areAllNonTuplets(): boolean {
        for (const el of this.elements) {
            if (el.tuplet()) {
                return false
            }
        }
        return true
    }
}

// ---------------------------------------------------------------

function swingCaption(swingType: Swing): string {
    let caption = ''
    switch (swingType) {
    case Swing.SWING:
        caption = 'Swing'
        break
    case Swing.SHUFFLE:
        caption = 'Shuffle'
        break
    case Swing.NONE:
        break
    }
    return caption
}

export function detectSwing(staff: Staff, swingType: Swing): void {
    const score = staff.score()
    const strack = staff.idx() * VOICES
    const swingDetector = new SwingDetector(swingType)

    for (let seg = score.firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
        for (let voice = 0; voice < VOICES; ++voice) {
            const cr = seg.element(strack + voice) as ChordRest | null
            if (!cr) {
                continue
            }
            swingDetector.add(cr)
        }
    }
    if (swingDetector.wasSwingApplied()) {
        // add swing label to the score
        const seg = score.firstSegment(SegmentType.ChordRest)!
        const st = new StaffText(seg, TextStyleType.STAFF)
        st.setPlainText(swingCaption(swingType))
        st.setParent(seg)
        st.setTrack(strack) // voice == 0
        score.addElement(st)
    }
}
