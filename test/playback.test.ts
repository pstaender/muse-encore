// SPDX-License-Identifier: GPL-3.0-only
// The playback API on vtest scores: events with times (repeats, tempo changes, gradual tempo changes, dynamics, ties),
// tick <-> time conversions, metronome and count-in, loop boundaries, the playback cursor, preview notes.
import { describe, expect, test } from 'vitest'
import {
    BoundaryTick, LoopBoundaryType, ME_CONTROLLER, ME_NOTEON, loopMarkers, notationPlayback, playbackCursorBounds,
    type MasterScore, type PlaybackMidiEvent,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import type { TempoText } from '../src/engraving/dom/tempotext'
import type { Dynamic } from '../src/engraving/dom/dynamic'
import type { Chord } from '../src/engraving/dom/chord'
import { ROOT, VTEST, hasSubmodule, openScore } from './helpers'

const MIDI_DATA = `${ROOT}MuseScore/src/importexport/midi/tests/midiexport_data`

const noteOns = (events: PlaybackMidiEvent[]): PlaybackMidiEvent[] => events.filter(e => e.type === ME_NOTEON && e.dataB > 0)

/** every note on has a later note off of the same channel and pitch */
function expectNoHangingNotes(events: PlaybackMidiEvent[]): void {
    const on = new Map<string, number>()
    for (const e of events) {
        if (e.type !== ME_NOTEON) {
            continue
        }
        const key = `${e.channel}:${e.dataA}`
        on.set(key, (on.get(key) ?? 0) + (e.dataB > 0 ? 1 : -1))
    }
    expect([...on.values()].every(n => n <= 0)).toBe(true)
}

function forEachAnnotation(score: MasterScore, f: (e: unknown, tick: number) => void): void {
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        for (const a of s.annotations()) {
            f(a, s.tick().ticks())
        }
    }
}

describe.skipIf(!hasSubmodule)('playback events', () => {
    test('times follow the tempo texts', async () => {
        const score = await openScore(`${MIDI_DATA}/testTrillTempos.mscx`)
        const playback = notationPlayback(score)
        const r = playback.renderMidiEvents()
        expect(noteOns(r.events).length).toBeGreaterThan(0)
        let tempoTexts = 0
        forEachAnnotation(score, (a, tick) => {
            const t = a as TempoText
            if (t.isTempoText?.() && t.playTempoText() && t.isNormal() && !t.isRelative()) {
                expect(score.tempomap().tempo(tick)).toBeCloseTo(t.tempo(), 5)
                tempoTexts++
            }
        })
        expect(tempoTexts).toBeGreaterThan(0)
        // the times are the tempo map's times; ordered
        for (let i = 1; i < r.events.length; ++i) {
            expect(r.events[i].time).toBeGreaterThanOrEqual(r.events[i - 1].time)
        }
        const e = r.events[r.events.length - 1]
        expect(e.time).toBeCloseTo(score.tempomap().tick2time(e.utick), 9)
        expectNoHangingNotes(r.events)
    })

    test('a gradual tempo change changes the tempo step by step', async () => {
        const score = await openScore(`${VTEST}/tempoChangeLines.mscz`)
        const tm = score.tempomap()
        expect(tm.size()).toBeGreaterThan(8)
        const tempos = new Set<number>()
        for (let i = 0; i < tm.size(); ++i) {
            tempos.add(tm.valueAt(i).tempo)
        }
        expect(tempos.size).toBeGreaterThan(4)
        expectNoHangingNotes(notationPlayback(score).renderMidiEvents().events)
    })

    test('repeats are played (or not)', async () => {
        const score = await openScore(`${MIDI_DATA}/testRepeatsDynamics.mscx`)
        const playback = notationPlayback(score)
        const scoreTicks = score.lastMeasure()!.endTick().ticks()
        playback.playRepeats = true
        const expanded = playback.renderMidiEvents()
        playback.playRepeats = false
        const flat = playback.renderMidiEvents()
        expect(flat.endUtick).toBe(scoreTicks)
        expect(expanded.endUtick).toBeGreaterThan(scoreTicks)
        expect(noteOns(expanded.events).length).toBeGreaterThan(noteOns(flat.events).length)
        expect(expanded.totalPlayTime).toBeGreaterThan(flat.totalPlayTime)

        // played tick <-> time <-> score tick
        playback.playRepeats = true
        const utick = expanded.endUtick - 480
        const secs = playback.playedTickToSec(utick)
        expect(playback.secToPlayedTick(secs)).toBe(utick)
        const tick = playback.secToTick(secs)
        expect(tick).toBeLessThan(scoreTicks)
        expect(score.repeatList(true).tick2utick(tick)).toBeLessThanOrEqual(utick)
    })

    test('dynamics set the velocities', async () => {
        const score = await openScore(`${VTEST}/dynamics-1.mscz`)
        const r = notationPlayback(score).renderMidiEvents()
        const ons = noteOns(r.events)
        let checked = 0
        forEachAnnotation(score, (a, tick) => {
            const d = a as Dynamic
            if (!d.isDynamic?.() || d.velocity() <= 0 || d.changeInVelocity() !== 0) {
                return
            }
            const on = ons.find(e => e.utick === tick && e.staffIdx === d.staffIdx())
            if (on) {
                expect(on.dataB).toBe(Math.min(127, d.velocity()))
                checked++
            }
        })
        expect(checked).toBeGreaterThan(0)
    })

    test('tied notes are played once', async () => {
        const score = await openScore(`${VTEST}/tie-1.mscx`)
        const r = notationPlayback(score).renderMidiEvents()
        let tiedChains = 0
        let tiedChainsPlayedOnce = 0
        for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
            for (const e of s.elist()) {
                if (!e?.isChord()) {
                    continue
                }
                for (const n of (e as unknown as Chord).notes()) {
                    if (n.tieFor() && !n.tieBack() && n.play()) {
                        tiedChains++
                        const start = n.tick().ticks()
                        const end = n.lastTiedNote().chord().endTick().ticks()
                        const ons = noteOns(r.events).filter(x => x.dataA === n.ppitch() && x.utick >= start && x.utick < end)
                        if (ons.length === 1) {
                            tiedChainsPlayedOnce++
                        }
                    }
                }
            }
        }
        expect(tiedChains).toBeGreaterThan(0)
        expect(tiedChainsPlayedOnce).toBe(tiedChains)
        expectNoHangingNotes(r.events)
    })

    test('the channels have the sounds of the instruments; controllers are events', async () => {
        const score = await openScore(`${MIDI_DATA}/testSingleNoteDynamics.mscx`)
        const r = notationPlayback(score).renderMidiEvents()
        expect(r.channels.length).toBeGreaterThan(0)
        for (const c of r.channels) {
            expect(c.program).toBeGreaterThanOrEqual(0)
            expect(c.volume).toBeGreaterThan(0)
        }
        const channels = new Set(r.channels.map(c => c.channel))
        expect(r.events.every(e => channels.has(e.channel))).toBe(true)
        // single note dynamics: breath controller events (CC 2)
        expect(r.events.some(e => e.type === ME_CONTROLLER)).toBe(true)
    })

    test('metronome, count-in and the tempo multiplier', async () => {
        const score = await openScore(`${VTEST}/tempoText-1.mscz`)
        const playback = notationPlayback(score)
        const clicks = playback.metronomeEvents().filter(e => e.dataB > 0)
        expect(clicks.length).toBeGreaterThan(0)
        expect(clicks[0].utick).toBe(0)
        const countIn = playback.countInEvents(0)
        expect(countIn.events.length).toBeGreaterThan(0)
        expect(countIn.duration).toBeGreaterThan(0)

        const before = playback.renderMidiEvents().totalPlayTime - 3
        playback.setTempoMultiplier(2)
        const after = playback.renderMidiEvents().totalPlayTime - 3
        expect(after).toBeCloseTo(before / 2, 5)
        playback.setTempoMultiplier(1)
    })

    test('loop boundaries, loop markers and the playback cursor', async () => {
        const score = await openScore(`${VTEST}/tempoText-1.mscz`)
        const playback = notationPlayback(score)
        expect(playback.isLoopEnabled()).toBe(false)
        playback.addLoopBoundary(LoopBoundaryType.LoopIn, 480 * 4)
        playback.addLoopBoundary(LoopBoundaryType.LoopOut, BoundaryTick.LastScoreTick)
        playback.setLoopBoundariesEnabled(true)
        expect(playback.isLoopEnabled()).toBe(true)
        expect(playback.loopBoundaries().loopInTick.ticks()).toBe(1920)
        expect(playback.loopBoundaries().loopOutTick.ticks()).toBe(score.lastMeasure()!.endTick().ticks())
        const markers = loopMarkers(score)
        expect(markers.length).toBe(2)
        expect(markers[0].x).toBeLessThan(markers[1].x + (markers[1].page - markers[0].page) * 100)

        const c0 = playbackCursorBounds(score, 0)!
        const c1 = playbackCursorBounds(score, 480)!
        expect(c0.page).toBe(0)
        expect(c1.x).toBeGreaterThan(c0.x)
        expect(c0.height).toBeGreaterThan(0)
    })

    test('preview notes of elements', async () => {
        const score = await openScore(`${VTEST}/tie-1.mscx`)
        const playback = notationPlayback(score)
        let chord: Chord | null = null
        for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s && !chord; s = s.next1(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e?.isChord()) {
                chord = e as unknown as Chord
            }
        }
        expect(chord).not.toBeNull()
        const notes = playback.triggerEventsForItems([chord!], 0.5)
        expect(notes.map(n => n.pitch)).toEqual(chord!.notes().map(n => n.ppitch()))
        expect(notes.every(n => n.duration === 0.5 && n.velocity > 0)).toBe(true)
        expect(playback.triggerEventsForItems([chord!.notes()[0]], 0.5).length).toBe(1)
    })
})
