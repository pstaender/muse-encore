/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore: the public API of the comments of a score (engraving/dom/scorecomments.ts): the model, the
 * comment markers on the pages (rectangles in inches from the top left of their page, like the other view APIs), the
 * list of comments with their positions and the element at a comment's position (to select it). The changes (undoable)
 * are in index.ts (addComment, setCommentText, moveComment, removeComment).
 */

import { DPI, ElementType } from '../engraving/types/types'
import { SegmentType } from '../engraving/dom/segment'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Chord } from '../engraving/dom/chord'
import { CommentResolver, scoreComments, tickCanvasX, type ScoreComment } from '../engraving/dom/scorecomments'

export { scoreComments, ScoreComments, COMMENTS_META_TAG, type ScoreComment, type CommentPosition } from '../engraving/dom/scorecomments'

/** the size of a marker in spatium */
export const COMMENT_MARKER_SIZE = 2.2

export interface CommentMarker {
    id: string
    page: number
    /** inches from the top left of the page: the marker (its offset included) */
    x: number
    y: number
    width: number
    height: number
    /** the spatium in inches (to convert a drag to the offset in spatium) */
    spatium: number
    /** the comment is attached to an element of the score (else to a position) */
    attached: boolean
}

export interface CommentListItem {
    comment: ScoreComment
    /** the measure number shown in the score (the displayed measure: 1 based; 0 if the score has no measures) */
    measureNo: number
    /** the part's name, with the staff number if the part has several staves */
    staffName: string
    /** the translated name of the element the comment is attached to ('' = attached to the position) */
    elementName: string
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

/** the element of a comment in the score shown (a part: the linked element) */
function elementInScore(score: Score, el: EngravingItem | null): EngravingItem | null {
    if (!el || score === score.masterScore()) {
        return el
    }
    return el.findLinkedInScore(score)
}

/** the anchor of a marker without its offset: (x, bottom of the marker) in canvas coordinates, and its page */
function anchorPoint(score: Score, c: ScoreComment, resolver: CommentResolver): { x: number; y: number; page: number; attached: boolean } | null {
    const pos = scoreComments(score).position(c, resolver)
    if (!pos) {
        return null
    }
    const sp = score.style().spatium()
    const pages = score.pages()
    // attached to an element: above its middle; an element of a staff (a note, rest, staff text): above the staff too
    const el = elementInScore(score, pos.element)
    const elPage = el ? pages.indexOf(el.findAncestor(ElementType.PAGE) as never) : -1
    if (el && elPage >= 0) {
        const r = el.canvasBoundingRect()
        if (r.isValid()) {
            let y = r.top() - 0.5 * sp
            const system = el.findMeasure()?.system()
            const sysStaff = el.staffIdx() >= 0 ? system?.staff(el.staffIdx()) : null
            if (system && sysStaff?.show()) {
                y = Math.min(y, system.staffCanvasYpage(el.staffIdx()) - 1.5 * sp)
            }
            return { x: r.x() + r.width() / 2, y, page: elPage, attached: true }
        }
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
    return { x: tickCanvasX(measure, pos.tick), y: system.staffCanvasYpage(idx) - 1.5 * sp, page: pages.indexOf(page), attached: false }
}

function markerOf(score: Score, c: ScoreComment, resolver: CommentResolver): CommentMarker | null {
    const a = anchorPoint(score, c, resolver)
    if (!a || a.page < 0) {
        return null
    }
    const sp = score.style().spatium()
    const size = COMMENT_MARKER_SIZE * sp
    const x = a.x - size / 2 + c.dx * sp
    const y = a.y - size + c.dy * sp
    const pp = score.pages()[a.page].pos()
    return {
        id: c.id,
        page: a.page,
        x: (x - pp.x()) / DPI,
        y: (y - pp.y()) / DPI,
        width: size / DPI,
        height: size / DPI,
        spatium: sp / DPI,
        attached: a.attached,
    }
}

/** the marker of a comment on the pages of a score (null if its position is not shown, e.g. in a part without its staff) */
export function commentMarker(score: Score, c: ScoreComment): CommentMarker | null {
    return markerOf(score, c, new CommentResolver(score.masterScore()))
}

/** the markers of all comments shown on the pages of a score */
export function commentMarkers(score: Score): CommentMarker[] {
    const resolver = new CommentResolver(score.masterScore())
    const result: CommentMarker[] = []
    for (const c of scoreComments(score).comments()) {
        const m = markerOf(score, c, resolver)
        if (m) {
            result.push(m)
        }
    }
    return result
}

/** the comments in the order of their positions, with what the app shows for the position */
export function commentList(score: Score): CommentListItem[] {
    const master = score.masterScore()
    const resolver = new CommentResolver(master)
    const comments = scoreComments(score)
    return comments.sortedComments(resolver).map((c) => {
        const pos = comments.position(c, resolver)
        if (!pos) {
            return { comment: c, measureNo: 0, staffName: '', elementName: '' }
        }
        const staff = master.staff(pos.staffIdx)
        const part = staff?.part()
        let staffName = part?.partName() ?? ''
        if (part && staff && part.nstaves() > 1) {
            staffName = `${staffName} ${part.staves().indexOf(staff) + 1}`
        }
        return {
            comment: c,
            measureNo: pos.measure.barbeat().displayedBar,
            staffName,
            elementName: pos.element ? pos.element.translatedTypeUserName() : '',
        }
    })
}

/**
 * the element at a comment's position in a score: the element it is attached to, else the top note of the chord or
 * the rest of the staff's first voice at (or before) the tick, else the measure
 */
export function commentElement(score: Score, c: ScoreComment): EngravingItem | null {
    const pos = scoreComments(score).position(c)
    if (!pos) {
        return null
    }
    const attached = elementInScore(score, pos.element)
    if (attached) {
        return attached
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
