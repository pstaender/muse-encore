/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Playalong (not in MuseScore): listens to the microphone while the user plays and follows the score measure by
 * measure in the played order (repeats, voltas, jumps, codas). It starts at the selected measure; selecting another
 * measure while it is on continues there. "Playalong practice" also follows when measures are repeated, skipped or
 * played again from an earlier measure; otherwise it assumes a steady progress. The notes come from the
 * NoteDetector (shared/notedetection), the following is PlayalongFollower (follower.ts), the measure is shown by
 * playalongview.ts. Followed are the parts of the selection when playalong starts (else all parts).
 * In note input mode the same button enters the notes played instead (like MIDI input in MuseScore: the chords detected
 * are entered at the input position with enterMidiNotes). The microphone stays on when the note input starts or ends
 * (it then enters notes, or follows again); started in note input mode, it ends with the note input.
 */
import { useSyncExternalStore } from 'react'
import { enterMidiNotes, playalongMeasureBounds, playalongMeasures, rangeSelectionPartIds, selectionPlaybackInfo, type PlayalongMeasure } from '../../src/index'
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

/** playalong started in note input mode: it ends with the note input (else it follows the score again) */
let s_startedInNoteInput = false

/** follows the score from the selected measure (the parts of the selection) */
function startFollowing(): void {
    s_partIds = selectedPartIds()
    s_scoreVersion = scoreViewState().scoreVersion
    const tick = selectionTick()
    s_measures = currentScore() ? playalongMeasures(currentScore()!, s_partIds) : []
    buildFollower(tick >= 0 ? Math.max(0, measureIndexAtTick(tick, 0)) : 0)
    publish({ mode: 'playalong', heard: [] })
    showMeasure()
}

/** enters the notes played (note input mode) */
function enterNoteInputMode(): void {
    grouper.clear()
    s_follower = null
    publish({ mode: 'noteinput', heard: [], index: -1, tick: -1, number: 0, prevTick: -1, nextTick: -1, count: 0 })
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
    s_startedInNoteInput = scoreViewState().noteInput
    if (s_startedInNoteInput) {
        enterNoteInputMode()
        publish({ active: true, status: 'loading', error: '' })
    } else {
        startFollowing()
        publish({ active: true, status: 'loading', error: '' })
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

/** goes to another measure (an index in the played order) */
function goTo(index: number): void {
    if (!s_follower || index < 0 || index === state.index) {
        return
    }
    s_follower.setMeasure(index)
    grouper.clear()
    showMeasure()
}

/** the view shows systems above each other (not the horizontal continuous view) */
function systemsStacked(): boolean {
    return scoreViewState().viewMode !== 'continuous-horizontal'
}

/**
 * the measure in the system above (delta -1) or below (+1) the followed one: the one nearest to its horizontal
 * center; the occurrence in the played order nearest to the followed one
 */
function measureInAdjacentSystem(delta: -1 | 1): number {
    const score = currentScore()
    const current = s_measures[state.index]
    if (!score || !current) {
        return -1
    }
    const cur = playalongMeasureBounds(score, current.tick)
    if (!cur) {
        return -1
    }
    const ticks = [...new Set(s_measures.map(m => m.tick))]
    const bounds = ticks.map(tick => ({ tick, b: playalongMeasureBounds(score, tick) }))
        .filter((e): e is { tick: number; b: NonNullable<typeof cur> } => !!e.b)
    // systems ordered by page and y (a system's measures have the same y)
    const order = (b: typeof cur): number => delta * (b.page !== cur.page ? b.page - cur.page : b.y - cur.y)
    const EPS = 0.01
    let system: number | null = null
    for (const { b } of bounds) {
        const o = order(b)
        if (o > EPS && (system === null || o < system)) {
            system = o
        }
    }
    if (system === null) {
        return -1
    }
    const center = cur.x + cur.width / 2
    let best: { tick: number; dist: number } | null = null
    for (const { tick, b } of bounds) {
        if (Math.abs(order(b) - system) > EPS) {
            continue
        }
        const dist = center < b.x ? b.x - center : center > b.x + b.width ? center - b.x - b.width : 0
        if (!best || dist < best.dist) {
            best = { tick, dist }
        }
    }
    return best ? measureIndexAtTick(best.tick, state.index) : -1
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
    // the microphone stays on when the note input starts or ends: it enters the notes played while the note input
    // is on (the score changes: nothing to follow)
    if (v.noteInput && state.mode !== 'noteinput') {
        enterNoteInputMode()
    } else if (!v.noteInput && state.mode === 'noteinput') {
        if (s_startedInNoteInput) {
            void stop()
            return
        }
        s_selectionVersion = v.selectionVersion
        startFollowing()
    }
    if (state.mode === 'noteinput') {
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
    // the arrow keys (APP_SHORTCUTS in actions.ts) move the playalong instead of the selection while it follows
    registerAction('playalong-prev', { run: () => step(-1), enabled: () => following() && state.index > 0, context: 'notation', priority: 2 }, {
        title: [null, 'Previous measure'], icon: ICON_CODES.ARROW_LEFT,
    })
    registerAction('playalong-next', { run: () => step(1), enabled: () => following() && state.index < state.count - 1, context: 'notation', priority: 2 }, {
        title: [null, 'Next measure'], icon: ICON_CODES.ARROW_RIGHT,
    })
    registerAction('playalong-up', { run: () => goTo(measureInAdjacentSystem(-1)), enabled: () => following() && systemsStacked(), context: 'notation', priority: 2 }, {
        title: [null, 'Measure above'],
    })
    registerAction('playalong-down', { run: () => goTo(measureInAdjacentSystem(1)), enabled: () => following() && systemsStacked(), context: 'notation', priority: 2 }, {
        title: [null, 'Measure below'],
    })
}
