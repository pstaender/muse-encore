/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore: comments (notes, memos) on a position of the score (a staff at a tick). They are not part of the
 * engraving and not on the undo stack (like the mixer's audio settings they make the project modified). They are saved
 * as JSON in the metaTag COMMENTS_META_TAG of the main score: MuseScore reads unknown metaTags and writes them again
 * (it shows them as an additional property in File > Project properties), so the files stay valid MuseScore files and
 * the comments survive a re-save in MuseScore.
 * A comment is anchored to its measure (its EID, which MuseScore keeps, so inserted or removed measures before it do
 * not move it) with the offset in the measure, and to its staff (EID and index); the absolute tick and the staff
 * index are the fallback when the measure or the staff no longer exists.
 */

import { Fraction } from '../types/fraction'
import { SegmentType, type Segment } from './segment'
import type { EngravingItem } from './engravingitem'
import type { MasterScore } from './masterscore'
import type { Measure } from './measure'
import type { Score } from './score'
import type { Staff } from './staff'

export const COMMENTS_META_TAG = 'museEncoreComments'

export interface ScoreComment {
    id: string
    /** the text (plain text, may have line breaks) */
    text: string
    /** EID of the measure ('' if unknown) */
    measure: string
    /** ticks from the start of the measure */
    rtick: number
    /** the absolute tick when the comment was saved (the fallback) */
    tick: number
    /** EID of the staff ('' if unknown) */
    staff: string
    /** the staff index when the comment was saved (the fallback) */
    staffIdx: number
    author: string
    /** ISO date-time */
    created: string
    modified: string
}

/** the resolved position of a comment in the score (main score indices) */
export interface CommentPosition {
    measure: Measure
    tick: Fraction
    staffIdx: number
}

interface CommentsFile {
    version: number
    comments: ScoreComment[]
}

function newId(): string {
    const c = globalThis.crypto
    if (c && 'randomUUID' in c) {
        return c.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitize(c: Partial<ScoreComment>): ScoreComment | null {
    if (!c || typeof c !== 'object') {
        return null
    }
    const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : d)
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    return {
        id: str(c.id) || newId(),
        text: str(c.text),
        measure: str(c.measure),
        rtick: num(c.rtick),
        tick: num(c.tick),
        staff: str(c.staff),
        staffIdx: num(c.staffIdx),
        author: str(c.author),
        created: str(c.created),
        modified: str(c.modified),
    }
}

/** the comments of a main score */
export class ScoreComments {
    private m_comments: ScoreComment[] = []
    private m_modified = false
    private m_listeners = new Set<() => void>()
    /** a value of the metaTag that could not be read: written again unchanged until comments are added */
    private m_unreadable = ''

    constructor(private m_score: MasterScore) {
        this.read(m_score.metaTag(COMMENTS_META_TAG))
    }

    private read(json: string): void {
        if (!json.trim()) {
            return
        }
        try {
            const data = JSON.parse(json) as Partial<CommentsFile>
            const list = Array.isArray(data?.comments) ? data.comments : []
            this.m_comments = list.map(c => sanitize(c)).filter((c): c is ScoreComment => !!c)
        } catch {
            // not ours or broken: keep the text so that saving does not lose it
            this.m_comments = []
            this.m_unreadable = json
        }
    }

    /** the value of the metaTag to save ('' = no comments: the tag is not written) */
    metaTagValue(): string {
        if (!this.m_comments.length) {
            return this.m_unreadable
        }
        const data: CommentsFile = { version: 1, comments: this.m_comments }
        return JSON.stringify(data)
    }

    comments(): readonly ScoreComment[] { return this.m_comments }

    comment(id: string): ScoreComment | null { return this.m_comments.find(c => c.id === id) ?? null }

    /** sorted by their position in the score (tick, then staff) */
    sortedComments(): ScoreComment[] {
        const key = (c: ScoreComment): [number, number] => {
            const p = this.position(c)
            return p ? [p.tick.ticks(), p.staffIdx] : [c.tick, c.staffIdx]
        }
        return this.m_comments
            .map(c => ({ c, k: key(c) }))
            .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.c.created.localeCompare(b.c.created))
            .map(x => x.c)
    }

    /**
     * adds a comment at a tick and staff of a score (the main score or a part: a part's staff is mapped to the main
     * score's staff); null if there is no measure at the tick
     */
    addComment(score: Score, tick: Fraction, staffIdx: number, text = '', author = ''): ScoreComment | null {
        const master = this.m_score
        let staff: Staff | null = score.staff(staffIdx)
        if (score !== master && staff) {
            staff = (staff.findLinkedInScore(master) as Staff | null) ?? null
        }
        const measure = master.tick2measure(tick)
        if (!measure || !staff) {
            return null
        }
        const now = new Date().toISOString()
        const c: ScoreComment = {
            id: newId(),
            text,
            measure: measure.eid() || measure.assignNewEID(),
            rtick: tick.minus(measure.tick()).ticks(),
            tick: tick.ticks(),
            staff: staff.eid() || staff.assignNewEID(),
            staffIdx: staff.idx(),
            author,
            created: now,
            modified: now,
        }
        this.m_comments.push(c)
        this.changed()
        return c
    }

    /** adds a comment at an element (its tick and staff) */
    addCommentAt(element: EngravingItem, text = '', author = ''): ScoreComment | null {
        const m = element.isMeasure() ? element as unknown as Measure : null
        return this.addComment(element.score(), m ? m.tick() : element.tick(), element.staffIdx(), text, author)
    }

    setText(id: string, text: string): void {
        const c = this.comment(id)
        if (!c || c.text === text) {
            return
        }
        c.text = text
        c.modified = new Date().toISOString()
        this.changed()
    }

    removeComment(id: string): void {
        const i = this.m_comments.findIndex(c => c.id === id)
        if (i < 0) {
            return
        }
        this.m_comments.splice(i, 1)
        this.changed()
    }

    /** the position of a comment in the main score now (null if the score has no measures) */
    position(c: ScoreComment): CommentPosition | null {
        const score = this.m_score
        let measure: Measure | null = null
        if (c.measure) {
            const item = score.eidRegister().itemFromEID(c.measure)
            if (item && item.isMeasure() && score.tick2measure((item as Measure).tick()) === item) {
                measure = item as Measure
            }
        }
        let tick: Fraction
        if (measure) {
            tick = measure.tick().plus(Fraction.fromTicks(Math.min(c.rtick, Math.max(0, measure.ticks().ticks() - 1))))
        } else {
            const last = score.lastMeasure()
            if (!last) {
                return null
            }
            tick = Fraction.fromTicks(Math.min(c.tick, Math.max(0, last.endTick().ticks() - 1)))
            measure = score.tick2measure(tick)
            if (!measure) {
                return null
            }
        }
        let staffIdx = -1
        if (c.staff) {
            const item = score.eidRegister().itemFromEID(c.staff)
            const idx = item ? score.staves().indexOf(item as Staff) : -1
            if (idx >= 0) {
                staffIdx = idx
            }
        }
        if (staffIdx < 0) {
            staffIdx = Math.min(c.staffIdx, Math.max(0, score.nstaves() - 1))
        }
        return { measure, tick, staffIdx }
    }

    isModified(): boolean { return this.m_modified }
    setSaved(): void { this.m_modified = false }

    onChanged(listener: () => void): () => void {
        this.m_listeners.add(listener)
        return () => this.m_listeners.delete(listener)
    }

    private changed(): void {
        this.m_modified = true
        this.m_unreadable = ''
        for (const l of this.m_listeners) {
            l()
        }
    }
}

const s_comments = new WeakMap<MasterScore, ScoreComments>()

/** the comments of a score (of its main score for a part) */
export function scoreComments(score: Score): ScoreComments {
    const master = score.masterScore()
    let c = s_comments.get(master)
    if (!c) {
        c = new ScoreComments(master)
        s_comments.set(master, c)
    }
    return c
}

/** the metaTags to write for a score: the main score's comments from the model (if it was used), none in parts */
export function metaTagsToWrite(score: Score): Map<string, string> {
    const tags = new Map(score.metaTags())
    if (!score.isMaster()) {
        tags.delete(COMMENTS_META_TAG)
        return tags
    }
    const c = s_comments.get(score as MasterScore)
    if (c) {
        const v = c.metaTagValue()
        if (v) {
            tags.set(COMMENTS_META_TAG, v)
        } else {
            tags.delete(COMMENTS_META_TAG)
        }
    }
    return tags
}

/** the x position of a tick in a measure (canvas coordinates), like PlaybackCursor::resolveCursorRectByTick */
export function tickCanvasX(measure: Measure, tick: Fraction): number {
    let s: Segment | null = measure.first(SegmentType.ChordRest)
    while (s) {
        let ns = s.next(SegmentType.ChordRest)
        while (ns && !ns.visible()) {
            ns = ns.next(SegmentType.ChordRest)
        }
        const t2 = ns ? ns.tick() : measure.endTick()
        if (tick.ge(s.tick()) && tick.lt(t2)) {
            const x1 = s.canvasPos().x()
            let x2: number
            if (ns) {
                x2 = ns.canvasPos().x()
            } else {
                const seg = measure.findSegment(SegmentType.EndBarLine, measure.endTick())
                x2 = seg ? seg.canvasPos().x() : measure.canvasPos().x() + measure.width()
            }
            const dt = t2.minus(s.tick()).ticks()
            return x1 + (dt > 0 ? (x2 - x1) * tick.minus(s.tick()).ticks() / dt : 0)
        }
        s = ns
    }
    return measure.canvasPos().x()
}
