/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationundostack.h/.cpp. The notifications (async::Notification) are plain
 * listener sets here.
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import '../../engraving/editing/cmd'
import type { Score } from '../../engraving/dom/score'
import type { MasterScore } from '../../engraving/dom/masterscore'
import type { UndoStack } from '../../engraving/editing/undo'
import type { EditData } from '../../engraving/editing/editdata'

export class Notification {
    private m_listeners = new Set<() => void>()

    notify(): void {
        for (const l of [...this.m_listeners]) {
            l()
        }
    }

    onNotify(l: () => void): () => void {
        this.m_listeners.add(l)
        return () => this.m_listeners.delete(l)
    }
}

export class NotationUndoStack {
    private m_getScore: () => Score
    private m_notationChanged: Notification
    private m_stackStateChanged = new Notification()
    private m_undoRedoNotification = new Notification()

    constructor(getScore: () => Score, notationChanged: Notification) {
        this.m_getScore = getScore
        this.m_notationChanged = notationChanged
    }

    canUndo(): boolean {
        return this.undoStack().canUndo()
    }

    undo(editData: EditData | null = null): void {
        this.score().undoRedo(true, editData)

        this.notifyAboutNotationChanged()
        this.notifyAboutUndoRedo()
        this.notifyAboutStateChanged()
    }

    canRedo(): boolean {
        return this.undoStack().canRedo()
    }

    redo(editData: EditData | null = null): void {
        this.score().undoRedo(false, editData)

        this.notifyAboutNotationChanged()
        this.notifyAboutUndoRedo()
        this.notifyAboutStateChanged()
    }

    undoRedoToIndex(idx: number, editData: EditData | null = null): void {
        const stack = this.undoStack()
        if (stack.currentIndex() === idx) {
            return
        }

        while (stack.currentIndex() > idx && stack.canUndo()) {
            this.score().undoRedo(true, editData)
        }

        while (stack.currentIndex() < idx && stack.canRedo()) {
            this.score().undoRedo(false, editData)
        }

        this.notifyAboutNotationChanged()
        this.notifyAboutUndoRedo()
        this.notifyAboutStateChanged()
    }

    prepareChanges(actionName: TranslatableString = new TranslatableString()): void {
        if (this.isLocked()) {
            return
        }

        this.score().startCmd(actionName)
    }

    rollbackChanges(): void {
        if (this.isLocked()) {
            return
        }

        this.score().endCmd(true)
    }

    commitChanges(): void {
        if (this.isLocked()) {
            return
        }

        this.score().endCmd()
        this.notifyAboutStateChanged()
    }

    isStackClean(): boolean {
        return this.undoStack().isClean()
    }

    mergeCommands(startIdx: number): void {
        this.undoStack().mergeCommands(startIdx)
    }

    lock(): void { this.undoStack().setLocked(true) }
    unlock(): void { this.undoStack().setLocked(false) }
    isLocked(): boolean { return this.undoStack().isLocked() }

    topMostUndoActionName(): TranslatableString {
        return this.undoStack().last()?.actionName() ?? new TranslatableString()
    }

    topMostRedoActionName(): TranslatableString {
        return this.undoStack().next()?.actionName() ?? new TranslatableString()
    }

    undoRedoActionCount(): number { return this.undoStack().size() }
    currentStateIndex(): number { return this.undoStack().currentIndex() }

    lastActionNameAtIdx(idx: number): TranslatableString {
        return this.undoStack().lastAtIndex(idx)?.actionName() ?? new TranslatableString()
    }

    stackChanged(): Notification { return this.m_stackStateChanged }
    undoRedoNotification(): Notification { return this.m_undoRedoNotification }

    private score(): Score { return this.m_getScore() }
    private masterScore(): MasterScore { return this.score().masterScore() }
    private undoStack(): UndoStack { return this.masterScore().undoStack() }

    private notifyAboutNotationChanged(): void { this.m_notationChanged.notify() }
    private notifyAboutStateChanged(): void { this.m_stackStateChanged.notify() }
    private notifyAboutUndoRedo(): void { this.m_undoRedoNotification.notify() }
}
