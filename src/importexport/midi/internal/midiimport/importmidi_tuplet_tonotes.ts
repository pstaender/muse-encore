/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tuplet_tonotes.h/.cpp (namespace MidiTuplet)
 */

import type { DurationElement } from '../../../../engraving/dom/durationelement'
import { TDuration } from '../../../../engraving/dom/durationtype'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import { SegmentType } from '../../../../engraving/dom/segment'
import type { Staff } from '../../../../engraving/dom/staff'
import { Tuplet } from '../../../../engraving/dom/tuplet'
import { Fraction } from '../../../../engraving/types/fraction'
import { VOICES } from '../../../../engraving/types/types'
import type { ReducedFraction } from './importmidi_fraction'
import { type TupletMap, findTupletsForTimeRange, tupletLimits } from './importmidi_tuplet'

export function addElementToTuplet(
    voice: number,
    onTime: ReducedFraction,
    len: ReducedFraction,
    el: DurationElement,
    tuplets: TupletMap): void {
    const foundTuplets = findTupletsForTimeRange(voice, onTime, len, tuplets, true)

    if (foundTuplets.length !== 0) {
        const tuplet = foundTuplets[0].second
        tuplet.elements.push(el) // add chord/rest to the tuplet
    }
}

export function createTupletNotes(staff: Staff, tuplets: TupletMap): void {
    const score = staff.score()
    const track = staff.idx() * VOICES

    for (const tupletEvent of tuplets) {
        const tupletData = tupletEvent.second
        if (tupletData.elements.length === 0) {
            continue
        }

        const measure = score.tick2measure(tupletData.onTime.fraction())
        const tuplet = new Tuplet(measure)
        const tupletRatio = tupletLimits(tupletData.tupletNumber).ratio
        tuplet.setRatio(tupletRatio.fraction())

        tuplet.setTicks(tupletData.len.fraction())
        const baseLen = new TDuration(tupletData.len.fraction().div(new Fraction(tupletRatio.denominator(), 1)))
        tuplet.setBaseLen(baseLen)

        tuplet.setTrack(track)
        // tuplet->setTick(tupletData.onTime.ticks());
        tuplet.setVoice(tupletData.voice)
        tuplet.setParent(measure)

        for (const el of tupletData.elements) {
            tuplet.add(el)
            el.setTuplet(tuplet)
        }
    }
}

export function haveTupletsEnoughElements(staff: Staff): boolean {
    const strack = staff.idx() * VOICES

    for (let voice = 0; voice < VOICES; ++voice) {
        for (let seg = staff.score().firstSegment(SegmentType.All); seg; seg = seg.next1()) {
            if (seg.segmentType() === SegmentType.ChordRest) {
                const e = seg.element(strack + voice)
                const cr = e && e.isChordRest() ? e as ChordRest : null
                if (!cr) {
                    continue
                }
                const tuplet = cr.tuplet()
                if (tuplet) {
                    if (tuplet.elements().length <= 1) {
                        return false
                    }
                    let chordCount = 0
                    for (const el of tuplet.elements()) {
                        if (el.isChordRest() && el.isChord()) {
                            ++chordCount
                        }
                    }
                    if (chordCount === 0) {
                        return false
                    }
                }
            }
        }
    }
    return true
}
