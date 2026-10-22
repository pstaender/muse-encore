/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/editing/editexcerpt.h/.cpp (AddExcerpt, RemoveExcerpt, SwapExcerpt, ChangeExcerptTitle) and of
 * MasterScore::deleteExcerpt / removeExcerpt (excerpt.cpp, masterscore.cpp), which are added to MasterScore by this
 * module (module augmentation).
 *
 * TODO(port): creating excerpts (Excerpt::createExcerpt, cloneStaff, ...)
 */

import { VOICES } from '../types/types'
import { MasterScore } from '../dom/masterscore'
import { CommandType, UndoCommand } from './undo'
import { Unlink } from './addremoveelement'
import type { EngravingObject } from '../dom/engravingobject'
import type { Excerpt } from '../dom/excerpt'
import type { EditData } from './editdata'

declare module '../dom/masterscore' {
    interface MasterScore {
        removeExcerpt(ex: Excerpt): void
        deleteExcerpt(excerpt: Excerpt): void
    }
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
