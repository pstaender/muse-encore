/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationmidiinput.h/.cpp: the real-time advance (onRealtimeAdvance,
 * runRealtime/stopRealtime, doRealtimeAdvance) for the real-time note input methods, and the note-on events of MIDI
 * input (doProcessEvents, addNoteToScore, addNoteEventsToInputState) as onNoteOns: the app enters the notes detected
 * from the microphone with it (there is no MIDI in the browser).
 *
 * TODO(port): note-off events (the detection reports the starts of the notes only: the notes of one call are pressed
 * together and released before the next call), controllers, the sound preview outside of note input, the metronome,
 * the note extension timer of MIDI note-ons in the automatic mode. C++ advances 100 ms after the metronome tick
 * (QTimer::singleShot); here at once.
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { NoteEntryMethod } from '../../engraving/dom/input'
import type { Score } from '../../engraving/dom/score'
import type { Note } from '../../engraving/dom/note'
import type { EngravingItem } from '../../engraving/dom/engravingitem'
import { playbackController } from '../../playback/iplaybackcontroller'
import '../../engraving/editing/edit'
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

    /**
     * C++ doProcessEvents for note-on events: notes played together (the first one starts a new chord, the others
     * are added to it); returns the notes added
     */
    onNoteOns(pitches: readonly number[]): Note[] {
        const sc = this.m_getScore()
        if (!sc || sc.nstaves() === 0 || !pitches.length) {
            return []
        }

        // TODO(port): startNoteInputIfNeed, the sound preview outside of note input
        if (!this.isNoteInputMode()) {
            return []
        }

        if (this.noteInputMethod() === NoteEntryMethod.BY_DURATION) {
            this.addNoteEventsToInputState(pitches)
            return []
        }

        const notesOn: Note[] = []
        pitches.forEach((pitch, i) => {
            const note = this.addNoteToScore(pitch, i !== 0)
            if (note) {
                notesOn.push(note)
            }
            if (i === 0 && !this.isRealtimeTimerActive() && this.isRealtimeAuto()) {
                // TODO(port): m_extendNoteTimer, enableMetronome()
                this.doRealtimeAdvance()
            }
        })

        if (notesOn.length) {
            const pc = playbackController()
            pc?.seekElement(notesOn[0], true /*flushSound*/)
            pc?.playElements(notesOn as unknown as EngravingItem[], {}, true)
            this.m_notationInteraction.notifyAboutNotationChanged()
        }
        return notesOn
    }

    /** C++ addNoteEventsToInputState: the input by duration takes the pitches as the notes of the next input */
    private addNoteEventsToInputState(pitches: readonly number[]): void {
        const noteInput = this.m_notationInteraction.noteInput()
        const staffIdx = noteInput.state().staffIdx()
        const notesOn = pitches.map(p => this.m_getScore().noteVal(p, staffIdx, /* C++ midiUseWrittenPitch() */ false))
        noteInput.setRestMode(false)
        noteInput.setInputNotes(notesOn)
        const segment = noteInput.state().segment()
        if (segment) {
            playbackController()?.playNotes(notesOn, staffIdx, segment)
        }
    }

    /** C++ addNoteToScore for a note-on event (chord: added to the chord of the previous note) */
    private addNoteToScore(pitch: number, chord: boolean): Note | null {
        const sc = this.m_getScore()
        const is = sc.inputState()
        if (!is.noteEntryMode() || !is.isValid()) {
            return null
        }

        this.m_undoStack.prepareChanges(new TranslatableString('undoableAction', 'Enter note'))
        const note = sc.addMidiPitch(pitch, chord, /* C++ configuration()->midiUseWrittenPitch() */ false)
        this.m_undoStack.commitChanges()

        const cr = is.cr()
        if (cr) {
            this.m_notationInteraction.showItem(cr)
        }
        return note
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
