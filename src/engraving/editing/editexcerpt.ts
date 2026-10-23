/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editexcerpt.h/.cpp (AddExcerpt, RemoveExcerpt, SwapExcerpt, ChangeExcerptTitle) and of
 * the MasterScore functions of excerpt.cpp/masterscore.cpp (deleteExcerpt, removeExcerpt, initAndAddExcerpt,
 * initExcerpt, initEmptyExcerpt) and Score::clone (score.cpp), which are added by this module (module augmentation).
 */

import { VOICES } from '../types/types'
import { MasterScore } from '../dom/masterscore'
import { CommandType, UndoCommand } from './undo'
import { Unlink } from './addremoveelement'
import type { EngravingObject } from '../dom/engravingobject'
import type { EditData } from './editdata'
import type { Part } from '../dom/part'
import { Score } from '../dom/score'
import { Excerpt, type TracksMap } from '../dom/excerpt'
import { Sid } from '../style/styledef'
import './edit'

declare module '../dom/masterscore' {
    interface MasterScore {
        removeExcerpt(ex: Excerpt): void
        deleteExcerpt(excerpt: Excerpt): void
        /** creates the excerpt's score (initExcerpt) and adds the excerpt (AddExcerpt; fakeUndo: without the undo stack) */
        initAndAddExcerpt(excerpt: Excerpt, fakeUndo: boolean): void
        /** creates the score of the excerpt from its parts (Excerpt::createExcerpt); an inited excerpt is laid out */
        initExcerpt(excerpt: Excerpt): void
        /** an empty excerpt (MasterNotation::createEmptyExcerpt): only the measures are cloned */
        initEmptyExcerpt(excerpt: Excerpt): void
    }
}

declare module '../dom/score' {
    interface Score {
        /** C++ Score::clone(): a copy of this (part) score as the score of a new excerpt (not added to the master score) */
        clone(): Score
    }
}

MasterScore.prototype.initAndAddExcerpt = function (this: MasterScore, excerpt: Excerpt, fakeUndo: boolean): void {
    this.initExcerpt(excerpt)

    const excerptCmd = new AddExcerpt(excerpt)
    if (fakeUndo) {
        excerptCmd.redo(null)
    } else {
        excerpt.excerptScore()!.undo(excerptCmd)
    }
}

MasterScore.prototype.initExcerpt = function (this: MasterScore, excerpt: Excerpt): void {
    if (excerpt.inited()) {
        excerpt.excerptScore()!.doLayout()
        return
    }

    const score = new Score(this.masterScore())
    excerpt.setExcerptScore(score)
    score.style().set(Sid.createMultiMeasureRests, true)
    this.initParts(excerpt)

    Excerpt.createExcerpt(excerpt)
    excerpt.setInited(true)

    if (!score.style().isDefault(Sid.timeSigPlacement)) {
        score.resetStyleValue(Sid.timeSigPlacement)
    }
}

MasterScore.prototype.initEmptyExcerpt = function (this: MasterScore, excerpt: Excerpt): void {
    if (excerpt.inited()) {
        return
    }

    Excerpt.cloneMeasures(this, excerpt.excerptScore()!)
    excerpt.setInited(true)
}

Score.prototype.clone = function (this: Score): Score {
    // TODO: see comments regarding setting version in corresponding code in 3.x branch
    // and also compare to MasterScore::clone()
    const excerpt = new Excerpt(this.masterScore())
    excerpt.setName(this.name())

    const tracks: TracksMap = []

    for (const part of this.parts()) {
        excerpt.parts().push(part)

        for (let track = part.startTrack(); track < part.endTrack(); ++track) {
            tracks.push([track, track])
        }
    }

    excerpt.setTracksMapping(tracks)

    this.masterScore().initAndAddExcerpt(excerpt, true)
    this.masterScore().removeExcerpt(excerpt)

    return excerpt.excerptScore()!
}

MasterScore.prototype.removeExcerpt = function (this: MasterScore, ex: Excerpt): void {
    const i = this.excerpts().indexOf(ex)
    if (i >= 0) {
        this.excerpts().splice(i, 1)
        this.setExcerptsChanged(true)
    }
}

MasterScore.prototype.deleteExcerpt = function (this: MasterScore, excerpt: Excerpt): void {
    const partScore = excerpt.excerptScore()

    if (!partScore) {
        return
    }

    // unlink the staves in the excerpt
    for (const st of partScore.staves()) {
        const hasLinksInMaster = !!st.links()?.some(le => le.score() === this)
        if (hasLinksInMaster) {
            const staffIdx = st.idx()
            // unlink the spanners
            for (const sp of partScore.spanner()) {
                if (sp.staffIdx() === staffIdx) {
                    sp.undoUnlink()
                }
            }
            const sTrack = staffIdx * VOICES
            const eTrack = sTrack + VOICES
            // unlink elements and annotation
            const fm = partScore.firstMeasureMM()
            for (let s = fm ? fm.first() : null; s; s = s.next1MM()) {
                for (let track = eTrack - 1; track >= sTrack; --track) {
                    const el = s.element(track)
                    if (el) {
                        el.undoUnlink()
                    }
                }
                for (const e of s.annotations()) {
                    if (e.staffIdx() === staffIdx) {
                        e.undoUnlink()
                    }
                }
            }
            // unlink the staff
            this.undo(new Unlink(st))
        }
    }
    this.undo(new RemoveExcerpt(excerpt))
}

export class AddExcerpt extends UndoCommand {
    constructor(private excerpt: Excerpt) {
        super()
    }

    override undo(_ed: EditData | null): void { this.excerpt.masterScore()!.removeExcerpt(this.excerpt) }
    override redo(_ed: EditData | null): void { this.excerpt.masterScore()!.addExcerpt(this.excerpt) }
    override type(): CommandType { return CommandType.AddExcerpt }
    override name(): string { return 'AddExcerpt' }
    override objectItems(): EngravingObject[] {
        const score = this.excerpt.masterScore()
        return score ? [score] : []
    }
}

export class RemoveExcerpt extends UndoCommand {
    private index: number

    constructor(private excerpt: Excerpt) {
        super()
        this.index = excerpt.masterScore()!.excerpts().indexOf(excerpt)
    }

    override undo(_ed: EditData | null): void { this.excerpt.masterScore()!.addExcerpt(this.excerpt, this.index) }
    override redo(_ed: EditData | null): void { this.excerpt.masterScore()!.removeExcerpt(this.excerpt) }
    override type(): CommandType { return CommandType.RemoveExcerpt }
    override name(): string { return 'RemoveExcerpt' }
    override objectItems(): EngravingObject[] {
        const score = this.excerpt.masterScore()
        return score ? [score] : []
    }
}

export class SwapExcerpt extends UndoCommand {
    constructor(private score: MasterScore, private pos1: number, private pos2: number) {
        super()
    }

    override type(): CommandType { return CommandType.SwapExcerpt }
    override name(): string { return 'SwapExcerpt' }
    override objectItems(): EngravingObject[] { return [this.score] }

    protected override flip(_ed: EditData | null): void {
        const excerpts = this.score.excerpts()
        const tmp = excerpts[this.pos1]
        excerpts[this.pos1] = excerpts[this.pos2]
        excerpts[this.pos2] = tmp
        this.score.setExcerptsChanged(true)
    }
}

export class ChangeExcerptTitle extends UndoCommand {
    constructor(private excerpt: Excerpt, private title: string) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeExcerptTitle }
    override name(): string { return 'ChangeExcerptTitle' }

    protected override flip(_ed: EditData | null): void {
        const s = this.title
        this.title = this.excerpt.name()
        this.excerpt.setName(s)
        this.excerpt.masterScore()!.setExcerptsChanged(true)
    }
}

// ---------------------------------------------------------
//   AddPartToExcerpt
// ---------------------------------------------------------

export class AddPartToExcerpt extends UndoCommand {
    constructor(private m_excerpt: Excerpt, private m_part: Part, private m_targetPartIdx: number) {
        super()
    }

    override undo(_ed: EditData | null): void {
        const parts = this.m_excerpt.parts()
        const i = parts.indexOf(this.m_part)
        if (i >= 0) {
            parts.splice(i, 1)
        }

        const score = this.m_excerpt.excerptScore()
        if (score) {
            score.removePart(this.m_part)
        }
    }

    override redo(_ed: EditData | null): void {
        const excerptParts = this.m_excerpt.parts()
        if (this.m_targetPartIdx < excerptParts.length) {
            excerptParts.splice(this.m_targetPartIdx, 0, this.m_part)
        } else {
            excerptParts.push(this.m_part)
        }

        const score = this.m_excerpt.excerptScore()
        if (score) {
            score.insertPart(this.m_part, this.m_targetPartIdx)
        }
    }

    override type(): CommandType { return CommandType.AddPartToExcerpt }
    override name(): string { return 'AddPartToExcerpt' }
    override objectItems(): EngravingObject[] { return [this.m_part] }
}
