/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/excerptnotation.h/.cpp: the notation of a part (excerpt). The notation itself (its
 * interaction, view, ...) is kept by the library per score (index.ts notationState); here the ExcerptNotation is the
 * excerpt with its score and the notation's open state (Notation::isOpen/setIsOpen, openChanged).
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { ChangeExcerptTitle } from '../../engraving/editing/editexcerpt'
import type { Excerpt } from '../../engraving/dom/excerpt'
import type { Score } from '../../engraving/dom/score'
import { Notification, type NotationUndoStack } from './notationundostack'

export class ExcerptNotation {
    private m_inited = false
    private m_score: Score | null = null
    private m_nameChanged = new Notification()
    private m_openChanged = new Notification()
    private m_notationChanged = new Notification()

    /** undoStackOf: the undo stack of a notation (C++ Notation::undoStack(); all share the master score's stack) */
    constructor(private m_excerpt: Excerpt, private m_undoStackOf: (score: Score) => NotationUndoStack) {}

    init(): void {
        if (this.m_inited) {
            return
        }

        this.m_score = this.m_excerpt.excerptScore()

        this.m_inited = true
    }

    reinit(newExcerpt: Excerpt): void {
        this.m_inited = false
        this.m_excerpt = newExcerpt

        this.init()

        this.m_notationChanged.notify()
    }

    isInited(): boolean { return this.m_inited }
    isCustom(): boolean { return this.m_excerpt.custom() }
    isEmpty(): boolean { return this.m_excerpt.parts().length === 0 }

    excerpt(): Excerpt { return this.m_excerpt }

    /** the score of the notation (C++ notation()->elements()->msScore()); null before init() */
    score(): Score | null { return this.m_score }

    name(): string { return this.m_excerpt.name() }

    setName(name: string): void {
        const changed = name !== this.name()
        this.m_excerpt.setName(name)

        if (changed) {
            this.m_nameChanged.notify()
        }
    }

    undoSetName(name: string): void {
        if (name === this.name()) {
            return
        }

        const score = this.m_score
        if (!score) {
            this.setName(name)
            return
        }

        const undoStack = this.m_undoStackOf(score)
        //: Means: "edit the name of a part score"
        undoStack.prepareChanges(new TranslatableString('undoableAction', 'Rename part'))

        score.undo(new ChangeExcerptTitle(this.m_excerpt, name))

        undoStack.commitChanges()
        this.m_nameChanged.notify()
    }

    /** C++ m_excerpt->nameChanged() */
    nameChanged(): Notification { return this.m_nameChanged }

    hasFileName(): boolean { return this.m_excerpt.hasFileName() }
    fileName(): string { return this.m_excerpt.fileName() }

    /** Notation::isOpen: the part is shown in a tab */
    isOpen(): boolean { return !!this.m_score && this.m_score.isOpen() }

    /** Notation::setIsOpen */
    setIsOpen(open: boolean): void {
        if (!this.m_score || this.m_score.isOpen() === open) {
            return
        }
        this.m_score.setIsOpen(open)
        this.m_openChanged.notify()
    }

    openChanged(): Notification { return this.m_openChanged }
    notationChanged(): Notification { return this.m_notationChanged }

    clone(): ExcerptNotation {
        const copy = this.m_excerpt.clone()
        copy.markAsCustom()

        return new ExcerptNotation(copy, this.m_undoStackOf)
    }
}
