/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Playalong (not in MuseScore): listens to the microphone while the user plays and follows the score measure by
 * measure in the played order (repeats, voltas, jumps, codas). It starts at the selected measure; selecting another
 * measure while it is on continues there. "Playalong practice" also follows when measures are repeated, skipped or
 * played again from an earlier measure; otherwise it assumes a steady progress. The notes come from the
 * NoteDetector (shared/notedetection), the following is PlayalongFollower (follower.ts), the measure is shown by
 * playalongview.ts. Followed are the parts of the selection when playalong starts (else all parts).
 * In note input mode the same button enters the notes played instead (like MIDI input in MuseScore: the chords detected
 * are entered at the input position with enterMidiNotes) until the note input ends.
 */
import { useSyncExternalStore } from 'react'
import { enterMidiNotes, playalongMeasures, rangeSelectionPartIds, selectionPlaybackInfo, type PlayalongMeasure } from '../../src/index'
import { actionsChanged, registerAction, triggerAction } from '../actions/actions'
import { ICON_CODES } from '../actions/uiactiondata'
import { webtr } from '../i18n'
import { currentScore, onScoreViewChanged, scoreChanged, scoreViewState } from '../scoreview'
import { settings, updateSettings } from '../settings'
import { createNoteDetector, type NoteDetector } from '../../shared/notedetection/notedetector'
import { ChordGrouper, PlayalongFollower } from './follower'
import { playbackState } from '../playback/playbackcontroller'

export interface PlayalongState {
    active: boolean
    /** following the score, or entering the notes played (note input) */
    mode: 'playalong' | 'noteinput'
    status: 'off' | 'loading' | 'listening' | 'error'
    error: string
    /** the measure followed: its index in the played order, its raw tick and number (-1: none) */
    index: number
    tick: number
    number: number
    /** the raw tick of the measure played before it (-1: none) */
    prevTick: number
    /** the raw tick of the measure played after it (-1: none) */
    nextTick: number
    count: number
    practice: boolean
    /** the pitches of the last chord heard */
    heard: number[]
    /** how late the notes are reported (s) */
    latency: number
}

let state: PlayalongState = {
    active: false, mode: 'playalong', status: 'off', error: '', index: -1, tick: -1, number: 0, prevTick: -1, nextTick: -1, count: 0,
    practice: settings().playback.playalongPractice, heard: [], latency: 0,
}
const listeners = new Set<() => void>()

function publish(patch: Partial<PlayalongState>): void {
    const changedActions = 'active' in patch || 'practice' in patch || 'index' in patch
    state = { ...state, ...patch }
    for (const l of listeners) {
        l()
    }
    if (changedActions) {
        actionsChanged()
    }
}

export function playalongState(): PlayalongState {
    return state
}

export function onPlayalongStateChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

/** the name of a MIDI pitch with its octave (C4 = 60) */
export function noteName(pitch: number): string {
    return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}

/** the notes heard for the status bar ('' while not listening or nothing heard yet) */
export function heardNotesText(st: PlayalongState): string {
    if (!st.active || st.status !== 'listening' || !st.heard.length) {
        return ''
    }
    return `${webtr('Notes heard')}: ${[...st.heard].sort((a, b) => a - b).map(noteName).join(' ')}`
}

export function usePlayalongState(): PlayalongState {
    return useSyncExternalStore(onPlayalongStateChanged, playalongState)
}

let s_detector: NoteDetector | null = null
let s_follower: PlayalongFollower | null = null
let s_measures: PlayalongMeasure[] = []
let s_partIds: string[] | null = null
let s_scoreVersion = -1
/** counts the starts: a start that was stopped meanwhile does not continue */
let s_session = 0

const grouper = new ChordGrouper((pitches, time) => {
    if (state.mode === 'noteinput') {
        const score = currentScore()
        if (score && enterMidiNotes(score, [...pitches].sort((a, b) => a - b))) {
            scoreChanged()
        }
        publish({ heard: pitches, latency: s_detector?.stats().latency ?? 0 })
        return
    }
    if (!s_follower) {
        return
    }
    s_follower.onChord(pitches, time)
    publish({ heard: pitches, latency: s_detector?.stats().latency ?? 0 })
    showMeasure()
})

/** for finding problems: the detector's statistics (processing time, latency) */
;(window as unknown as { __museencorePlayalong?: unknown }).__museencorePlayalong = {
    stats: () => s_detector?.stats(), state: () => state, tempo: () => s_follower?.tempo(),
}

/** ?playalong-input=test-melody: a synthesized melody instead of the microphone (development) */
function detectorInput(): 'microphone' | 'test-melody' {
    return new URLSearchParams(location.search).get('playalong-input') === 'test-melody' ? 'test-melody' : 'microphone'
}

/** the parts the player plays: those of the selection, else all */
function selectedPartIds(): string[] | null {
    const score = currentScore()
    if (!score) {
        return null
    }
    const range = rangeSelectionPartIds(score)
    if (range.length) {
        return range
    }
    const ids = new Set<string>()
    for (const e of selectionPlaybackInfo(score).elements) {
        const id = e.part()?.id()
        if (id) {
            ids.add(id)
        }
    }
    return ids.size ? [...ids] : null
}

/** the raw tick of the selection's start (-1: no selection) */
function selectionTick(): number {
    const score = currentScore()
    if (!score) {
        return -1
    }
    const sel = selectionPlaybackInfo(score)
    if (sel.isNone) {
        return -1
    }
    return sel.rangeStartTick >= 0 ? sel.rangeStartTick : Math.min(...sel.elements.map(e => e.tick().ticks()))
}

/** the measure (in the played order) containing a raw tick: the occurrence nearest to `near` */
function measureIndexAtTick(tick: number, near: number): number {
    let best = -1
    for (const m of s_measures) {
        if (tick >= m.tick && tick < m.tick + m.ticks && (best < 0 || Math.abs(m.index - near) < Math.abs(best - near))) {
            best = m.index
        }
    }
    return best
}

function buildFollower(startIndex: number): void {
    const score = currentScore()
    s_measures = score ? playalongMeasures(score, s_partIds) : []
    s_follower = new PlayalongFollower(s_measures, state.practice ? 'practice' : 'follow', startIndex)
    grouper.clear()
}

function showMeasure(): void {
    const m = s_follower ? s_measures[s_follower.measure()] : undefined
    publish(m
        ? { index: m.index, tick: m.tick, number: m.number, prevTick: s_measures[m.index - 1]?.tick ?? -1,
            nextTick: s_measures[m.index + 1]?.tick ?? -1, count: s_measures.length }
        : { index: -1, tick: -1, number: 0, prevTick: -1, nextTick: -1, count: 0 })
}

async function start(): Promise<void> {
    const score = currentScore()
    if (!score || state.active) {
        return
    }
    const session = ++s_session
    // the sound of the playback would be heard by the microphone
    if (playbackState().playing) {
        triggerAction('pause')
    }
    if (scoreViewState().noteInput) {
        grouper.clear()
        publish({ active: true, mode: 'noteinput', status: 'loading', error: '', heard: [] })
    } else {
        s_partIds = selectedPartIds()
        s_scoreVersion = scoreViewState().scoreVersion
        s_measures = playalongMeasures(score, s_partIds)
        const tick = selectionTick()
        buildFollower(tick >= 0 ? Math.max(0, measureIndexAtTick(tick, 0)) : 0)
        publish({ active: true, mode: 'playalong', status: 'loading', error: '', heard: [] })
        showMeasure()
    }
    try {
        s_detector ??= await createNoteDetector({ baseUrl: import.meta.env.BASE_URL, input: detectorInput() })
        if (session !== s_session) {
            return
        }
        await s_detector.start(note => grouper.add(note.pitch, note.time))
        if (session !== s_session) {
            await s_detector.stop()
            return
        }
        publish({ status: 'listening' })
    } catch (e) {
        if (session !== s_session) {
            return
        }
        const error = e instanceof DOMException && e.name === 'NotAllowedError'
            ? webtr('The microphone may not be used') : (e as Error).message
        console.error(e)
        await stop()
        publish({ status: 'error', error })
    }
}

async function stop(): Promise<void> {
    ++s_session
    grouper.clear()
    s_follower = null
    publish({ active: false, status: 'off', error: '', heard: [], index: -1, tick: -1, number: 0, prevTick: -1, nextTick: -1, count: 0 })
    await s_detector?.stop()
}

function toggle(): void {
    if (state.active) {
        void stop()
    } else {
        void start()
    }
}

function step(delta: number): void {
    if (!s_follower) {
        return
    }
    if (delta > 0) {
        s_follower.next()
    } else {
        s_follower.prev()
    }
    grouper.clear()
    showMeasure()
}

function togglePractice(): void {
    const practice = !state.practice
    updateSettings('playback', { playalongPractice: practice })
    s_follower?.setMode(practice ? 'practice' : 'follow')
    publish({ practice })
}

/** the measures of a changed score; the selection moves the playalong to the selected measure */
let s_selectionVersion = -1
onScoreViewChanged(() => {
    const v = scoreViewState()
    if (!state.active) {
        s_selectionVersion = v.selectionVersion
        return
    }
    if (!currentScore()) {
        void stop()
        return
    }
    if (state.mode === 'noteinput') {
        // entering notes changes the score: nothing to follow; ends with the note input
        if (!v.noteInput) {
            void stop()
        }
        return
    }
    if (v.scoreVersion !== s_scoreVersion) {
        s_scoreVersion = v.scoreVersion
        buildFollower(Math.min(state.index, s_measures.length - 1))
        showMeasure()
    }
    if (v.selectionVersion !== s_selectionVersion) {
        s_selectionVersion = v.selectionVersion
        const tick = selectionTick()
        const index = tick >= 0 ? measureIndexAtTick(tick, state.index) : -1
        if (index >= 0 && index !== state.index && s_follower) {
            s_follower.setMeasure(index)
            grouper.clear()
            showMeasure()
        }
    }
})

export function registerPlayalongActions(): void {
    const hasScore = (): boolean => !!currentScore() && scoreViewState().hasScore
    registerAction('playalong', { run: toggle, enabled: hasScore, checked: () => state.active, context: 'notation' }, {
        title: [null, 'Playalong'],
        description: [null, 'Playalong: listen to the microphone and follow the score while you play; in note input mode: enter the notes you play'],
        icon: ICON_CODES.MICROPHONE, checkable: true,
    })
    registerAction('playalong-practice', { run: togglePractice, checked: () => state.practice }, {
        title: [null, 'Playalong practice'],
        description: [null, 'Playalong practice: also follow when you repeat measures, go back or skip measures'],
        icon: ICON_CODES.LOOP, checkable: true,
    })
    const following = (): boolean => state.active && state.mode === 'playalong'
    registerAction('playalong-prev', { run: () => step(-1), enabled: () => following() && state.index > 0, context: 'notation' }, {
        title: [null, 'Previous measure'], icon: ICON_CODES.ARROW_LEFT,
    })
    registerAction('playalong-next', { run: () => step(1), enabled: () => following() && state.index < state.count - 1, context: 'notation' }, {
        title: [null, 'Next measure'], icon: ICON_CODES.ARROW_RIGHT,
    })
}
