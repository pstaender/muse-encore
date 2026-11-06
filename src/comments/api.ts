/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore: the public API of the comments of a score (engraving/dom/scorecomments.ts): the model, the
 * comment markers on the pages (rectangles in inches from the top left of their page, like the other view APIs) and
 * the element at a comment's position (to select it).
 */

import { DPI } from '../engraving/types/types'
import { SegmentType } from '../engraving/dom/segment'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Chord } from '../engraving/dom/chord'
import { scoreComments, tickCanvasX, type ScoreComment } from '../engraving/dom/scorecomments'

export { scoreComments, ScoreComments, COMMENTS_META_TAG, type ScoreComment, type CommentPosition } from '../engraving/dom/scorecomments'

export interface CommentMarker {
    id: string
    page: number
    /** inches from the top left of the page: the marker above the staff at the comment's tick */
    x: number
    y: number
    width: number
    height: number
    /** the measure number shown in the score (the displayed measure) and the staff index (of the score shown) */
    measureNo: number
    staffIdx: number
}

/** the staff index of a comment in a score (the main score or a part); -1 if the part does not have the staff */
function staffInScore(score: Score, masterStaffIdx: number): number {
    const master = score.masterScore()
    if (score === master) {
        return masterStaffIdx
    }
    const staff = master.staff(masterStaffIdx)
    const linked = staff ? staff.findLinkedInScore(score) as Staff | null : null
    return linked ? score.staves().indexOf(linked) : -1
}

/** the marker of a comment on the pages of a score (null if its position is not shown, e.g. in a part without its staff) */
export function commentMarker(score: Score, c: ScoreComment): CommentMarker | null {
    const pos = scoreComments(score).position(c)
    if (!pos) {
        return null
    }
    const staffIdx = staffInScore(score, pos.staffIdx)
    const measure = score.tick2measureMM(pos.tick)
    const system = measure?.system()
    const page = system?.page()
    if (staffIdx < 0 || !measure || !system || !page) {
        return null
    }
    // a hidden staff (hide empty staves): the next shown one below, else above
    let idx = staffIdx
    const shown = (i: number): boolean => !!system.staff(i)?.show() && !!score.staff(i)?.show()
    if (!shown(idx)) {
        idx = -1
        for (let i = staffIdx + 1; i < score.nstaves() && idx < 0; ++i) {
            idx = shown(i) ? i : -1
        }
        for (let i = staffIdx - 1; i >= 0 && idx < 0; --i) {
            idx = shown(i) ? i : -1
        }
        if (idx < 0) {
            return null
        }
    }
    const sp = score.style().spatium()
    const size = 2.2 * sp
    const x = tickCanvasX(measure, pos.tick) - size / 2
    const y = system.staffCanvasYpage(idx) - size - 1.5 * sp
    const pages = score.pages()
    const pageIdx = pages.indexOf(page)
    const pp = page.pos()
    return {
        id: c.id,
        page: pageIdx,
        x: (x - pp.x()) / DPI,
        y: (y - pp.y()) / DPI,
        width: size / DPI,
        height: size / DPI,
        measureNo: pos.measure.barbeat().displayedBar,
        staffIdx,
    }
}

/** the markers of all comments shown on the pages of a score */
export function commentMarkers(score: Score): CommentMarker[] {
    const result: CommentMarker[] = []
    for (const c of scoreComments(score).comments()) {
        const m = commentMarker(score, c)
        if (m) {
            result.push(m)
        }
    }
    return result
}

/**
 * the element at a comment's position in a score: the top note of the chord or the rest of the staff's first voice at
 * (or before) the tick, else the measure
 */
export function commentElement(score: Score, c: ScoreComment): EngravingItem | null {
    const pos = scoreComments(score).position(c)
    if (!pos) {
        return null
    }
    const staffIdx = staffInScore(score, pos.staffIdx)
    if (staffIdx < 0) {
        return null
    }
    const measure = score.tick2measure(pos.tick)
    if (!measure) {
        return null
    }
    let seg = score.tick2leftSegment(pos.tick, false, SegmentType.ChordRest)
    while (seg && seg.measure() === measure) {
        const el = seg.element(staffIdx * 4)
        if (el) {
            // a chord: its top note (what a click selects)
            return el.isChord() ? (el as Chord).upNote() : el
        }
        seg = seg.prev(SegmentType.ChordRest)
    }
    return measure
}

export interface CommentInfo {
    /** the measure number shown in the score (the displayed measure: 1 based, with the measure number offsets; 0 if the score has no measures) */
    measureNo: number
    /** the part's name, with the staff number if the part has several staves */
    staffName: string
}

/** what the app shows for the position of a comment */
export function commentInfo(score: Score, c: ScoreComment): CommentInfo {
    const pos = scoreComments(score).position(c)
    if (!pos) {
        return { measureNo: 0, staffName: '' }
    }
    const staff = score.masterScore().staff(pos.staffIdx)
    const part = staff?.part()
    let staffName = part?.partName() ?? ''
    if (part && staff && part.nstaves() > 1) {
        staffName = `${staffName} ${part.staves().indexOf(staff) + 1}`
    }
    return { measureNo: pos.measure.barbeat().displayedBar, staffName }
}
