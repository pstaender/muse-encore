// SPDX-License-Identifier: GPL-3.0-only
// The level gate of the note detection (shared/notedetection/basicpitch/levelgate.ts): quiet notes (keys pressed
// without sounding, clicks) are not reported, notes clearly above the noise of the room are.
import { describe, expect, it } from 'vitest'
import { HOP, LevelGate } from '../shared/notedetection/basicpitch/levelgate'

const RATE = 22050
const amp = (db: number): number => 10 ** (db / 20)

function rng(seed: number): () => number {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 2 ** 32
    }
}

/** noise at a level (dBFS, RMS) for some seconds */
function noise(seconds: number, db: number, r = rng(1)): Float32Array {
    const out = new Float32Array(Math.round(seconds * RATE))
    const a = amp(db) * Math.sqrt(3)
    for (let i = 0; i < out.length; ++i) {
        out[i] = (r() * 2 - 1) * a
    }
    return out
}

/** adds a sine (a struck note: decaying over a second) at a level from a time on */
function addNote(audio: Float32Array, at: number, db: number, freq = 440): void {
    const a = amp(db) * Math.SQRT2
    const start = Math.round(at * RATE)
    for (let i = start; i < Math.min(audio.length, start + RATE); ++i) {
        const t = (i - start) / RATE
        audio[i] += a * Math.exp(-t * 2) * Math.sin(2 * Math.PI * freq * t)
    }
}

/** adds a click (a key's thump: 5 ms) */
function addClick(audio: Float32Array, at: number, db: number): void {
    const start = Math.round(at * RATE)
    const a = amp(db) * Math.SQRT2
    for (let i = start; i < start + Math.round(0.005 * RATE); ++i) {
        audio[i] += a * Math.sin(2 * Math.PI * 120 * (i - start) / RATE)
    }
}

const hopAt = (seconds: number): number => Math.round(seconds * RATE / HOP)

describe('level gate', () => {
    it('measures the noise floor of the room', () => {
        const g = new LevelGate()
        const audio = noise(3, -65)
        addNote(audio, 1, -25)
        g.push(audio)
        expect(g.floorDb()).toBeGreaterThan(-67)
        expect(g.floorDb()).toBeLessThan(-63)
    })

    it('accepts struck notes, rejects clicks and very quiet notes', () => {
        const g = new LevelGate()
        const audio = noise(4, -65)
        addNote(audio, 1, -30) // a soft note: 35 dB above the room
        addClick(audio, 2, -40) // the thump of a key: loud, but 5 ms
        addNote(audio, 3, -58) // a key pressed without really sounding: 7 dB above the room
        g.push(audio)
        expect(g.accepts(hopAt(1))).toBe(true)
        expect(g.accepts(hopAt(2))).toBe(false)
        expect(g.accepts(hopAt(3))).toBe(false)
    })

    it('adapts to the level of the microphone (a louder room needs louder notes)', () => {
        const g = new LevelGate()
        const audio = noise(3, -55)
        addNote(audio, 1, -45)
        addNote(audio, 2, -25)
        g.push(audio)
        expect(g.accepts(hopAt(1))).toBe(false)
        expect(g.accepts(hopAt(2))).toBe(true)
    })

    it('music from the start (no quiet moment): the noise floor is not the music', () => {
        const g = new LevelGate()
        const audio = noise(4, -70)
        for (let t = 0; t < 4; t += 0.25) {
            addNote(audio, t, -20, 220 + t * 50)
        }
        g.push(audio)
        expect(g.floorDb()).toBeLessThanOrEqual(-50)
        expect(g.accepts(hopAt(2))).toBe(true)
    })

    it('ignores the digital silence before the microphone delivers', () => {
        const g = new LevelGate()
        g.push(new Float32Array(RATE))
        const audio = noise(2, -70)
        addNote(audio, 1, -30)
        g.push(audio)
        expect(g.floorDb()).toBeGreaterThan(-72)
        expect(g.accepts(hopAt(2))).toBe(true)
    })
})
