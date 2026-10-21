/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the real-time advance of src/notation/internal/notationmidiinput.h/.cpp (onRealtimeAdvance,
 * runRealtime/stopRealtime, doRealtimeAdvance) for the real-time note input methods.
 *
 * TODO(port): MIDI input (there is no MIDI in the browser; notes are entered with the note name keys, which put the
 * note at the input position without advancing it), the metronome and playback, the note extension timer of
 * MIDI note-ons in the automatic mode. C++ advances 100 ms after the metronome tick (QTimer::singleShot); here at once.
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { NoteEntryMethod } from '../../engraving/dom/input'
import type { Score } from '../../engraving/dom/score'
import type { NotationInteraction } from './notationinteraction'
import type { NotationUndoStack } from './notationundostack'

/** C++ NotationConfiguration::delayBetweenNotesInRealTimeModeMilliseconds() (default) */
export const REALTIME_DELAY_MS = 750

export class NotationMidiInput {
    private m_getScore: () => Score
    private m_notationInteraction: NotationInteraction
    private m_undoStack: NotationUndoStack
    private m_realtimeTimer: ReturnType<typeof setInterval> | null = null
    private m_allowRealtimeRests = true

    /** C++ configuration()->delayBetweenNotesInRealTimeModeMilliseconds() */
    delayBetweenNotesInRealTimeModeMilliseconds = REALTIME_DELAY_MS

    constructor(getScore: () => Score, notationInteraction: NotationInteraction, undoStack: NotationUndoStack) {
        this.m_getScore = getScore
        this.m_notationInteraction = notationInteraction
        this.m_undoStack = undoStack
    }

    onRealtimeAdvance(): void {
        if (!this.isNoteInputMode()) {
            return
        }

        if (this.isRealtimeManual()) {
            this.m_allowRealtimeRests = true
            // TODO(port): enableMetronome()
            this.doRealtimeAdvance()
        } else if (this.isRealtimeAuto()) {
            if (this.isRealtimeTimerActive()) {
                this.stopRealtime()
                // TODO(port): disableMetronome()
            } else {
                this.m_allowRealtimeRests = true
                // TODO(port): enableMetronome()
                this.runRealtime()
            }
        }
    }

    /** the timer of the automatic real-time mode runs */
    isRealtimeTimerActive(): boolean {
        return this.m_realtimeTimer !== null
    }

    private runRealtime(): void {
        this.stopRealtime()
        this.m_realtimeTimer = setInterval(() => this.doRealtimeAdvance(), this.delayBetweenNotesInRealTimeModeMilliseconds)
    }

    stopRealtime(): void {
        if (this.m_realtimeTimer !== null) {
            clearInterval(this.m_realtimeTimer)
            this.m_realtimeTimer = null
        }
    }

    private doRealtimeAdvance(): void {
        // C++ also stops without rests allowed and no active MIDI pitches (there are none here)
        if (!this.isRealtime() || !this.isNoteInputMode() || !this.m_allowRealtimeRests) {
            if (this.isRealtimeTimerActive()) {
                this.stopRealtime()
            }

            // TODO(port): disableMetronome()

            this.m_allowRealtimeRests = true
            return
        }

        // TODO(port): playbackController()->playMetronome(is.tick().ticks())

        this.m_undoStack.prepareChanges(new TranslatableString('undoableAction', 'Realtime advance'))
        this.m_getScore().realtimeAdvance(/* C++ configuration()->midiUseWrittenPitch() */ false)
        this.m_undoStack.commitChanges()
        this.m_notationInteraction.notifyAboutNotationChanged()
    }

    private noteInputMethod(): NoteEntryMethod {
        return this.m_notationInteraction.noteInput().state().noteEntryMethod()
    }

    private isRealtime(): boolean {
        return this.isRealtimeAuto() || this.isRealtimeManual()
    }

    private isRealtimeAuto(): boolean {
        return this.noteInputMethod() === NoteEntryMethod.REALTIME_AUTO
    }

    private isRealtimeManual(): boolean {
        return this.noteInputMethod() === NoteEntryMethod.REALTIME_MANUAL
    }

    private isNoteInputMode(): boolean {
        return this.m_notationInteraction.noteInput().isNoteInputMode()
    }
}
