/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Playalong (not in MuseScore): the measures of a score in the order they are played (repeats, voltas, jumps and
 * codas unrolled by the RepeatList) with the pitches the player is expected to play, and the rectangle of a measure
 * to highlight. The score following itself is done by the app (editor/playalong).
 * Rectangles are in inches from the top left of their page, like the other view APIs.
 */

import { DPI } from '../engraving/types/types'
import type { Score } from '../engraving/dom/score'
import type { Measure } from '../engraving/dom/measure'
import type { Chord } from '../engraving/dom/chord'
import { SegmentType } from '../engraving/dom/segment'
import { Fraction } from '../engraving/types/fraction'
import { PlaybackCursor } from '../notationscene/playbackcursor'

/** the notes starting at one tick (all voices and staves of the followed parts) */
export interface PlayalongEvent {
    /** raw tick of the score */
    tick: number
    /** sounding MIDI pitches */
    pitches: number[]
}

export interface PlayalongMeasure {
    /** index in the played order */
    index: number
    /** raw start tick of the measure (the same measure can be played several times) */
    tick: number
    /** start tick in the played (unrolled) order */
    utick: number
    ticks: number
    /** the measure number shown to the user (1-based) */
    number: number
    /** index of the repeat segment (RepeatList) the measure is played in */
    repeatSegment: number
    events: PlayalongEvent[]
}

function measureEvents(score: Score, m: Measure, partIds: readonly string[] | null): PlayalongEvent[] {
    const events: PlayalongEvent[] = []
    const staves: number[] = []
    for (let staffIdx = 0; staffIdx < score.nstaves(); ++staffIdx) {
        const staff = score.staff(staffIdx)
        if (!staff || !staff.part()?.show()) {
            continue
        }
        if (partIds && !partIds.includes(staff.part()!.id())) {
            continue
        }
        staves.push(staffIdx)
    }
    for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
        const pitches: number[] = []
        for (const staffIdx of staves) {
            for (let track = staffIdx * 4; track < staffIdx * 4 + 4; ++track) {
                const e = s.element(track)
                if (!e || !e.isChord()) {
                    continue
                }
                for (const note of (e as unknown as Chord).notes()) {
                    // tied notes are not played again
                    if (!note.play() || note.tieBack()) {
                        continue
                    }
                    const p = note.ppitch()
                    if (!pitches.includes(p)) {
                        pitches.push(p)
                    }
                }
            }
        }
        if (pitches.length) {
            events.push({ tick: s.tick().ticks(), pitches: pitches.sort((a, b) => a - b) })
        }
    }
    return events
}

/**
 * the measures of the score in the order they are played (repeats expanded); `partIds`: the parts the player plays
 * (null: all parts)
 */
export function playalongMeasures(score: Score, partIds: readonly string[] | null = null): PlayalongMeasure[] {
    const master = score.masterScore()
    const repeatList = master.repeatList(true)
    const result: PlayalongMeasure[] = []
    const cache = new Map<Measure, PlayalongEvent[]>()
    repeatList.forEach((rs, segmentIdx) => {
        const offset = rs.utick - rs.tick
        for (const m of rs.measureList()) {
            let events = cache.get(m)
            if (!events) {
                events = measureEvents(master, m, partIds)
                cache.set(m, events)
            }
            result.push({
                index: result.length,
                tick: m.tick().ticks(),
                utick: m.tick().ticks() + offset,
                ticks: m.ticks().ticks(),
                number: m.no() + 1,
                repeatSegment: segmentIdx,
                events,
            })
        }
    })
    return result
}

/** the rectangle of the measure at a raw tick (the height of its system; a multimeasure rest if it covers it) */
export function playalongMeasureBounds(score: Score, tick: number): { page: number; x: number; y: number; width: number; height: number } | null {
    const m = score.tick2measureMM(Fraction.fromTicks(tick))
    const page = m?.system()?.page()
    if (!m || !page) {
        return null
    }
    const pageIdx = score.pages().indexOf(page)
    const cursor = new PlaybackCursor(score).resolveCursorRectByTick(m.tick().ticks())
    if (pageIdx < 0 || !cursor.isValid()) {
        return null
    }
    const pos = m.canvasPos()
    const pp = page.pos()
    return {
        page: pageIdx,
        x: (pos.x() - pp.x()) / DPI,
        y: (cursor.y() - pp.y()) / DPI,
        width: m.ldata().bbox().width() / DPI,
        height: cursor.height() / DPI,
    }
}
