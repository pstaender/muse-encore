// SPDX-License-Identifier: GPL-3.0-only
// The overtone filter of the note detection (shared/notedetection/basicpitch/overtonefilter.ts): weaker notes at the
// distance of a harmonic above a low note starting at the same time are not reported; real octaves and chords are.
import { describe, expect, it } from 'vitest'
import { overtoneOf, OVERTONE_ONSET_FRAMES, type OvertoneCandidate } from '../shared/notedetection/basicpitch/overtonefilter'

const n = (pitchMidi: number, amplitude: number, startFrame = 100): OvertoneCandidate => ({ pitchMidi, amplitude, startFrame })

/** the pitches reported of notes decoded together */
function reported(notes: OvertoneCandidate[], level: 'off' | 'normal' | 'strong'): number[] {
    return notes.filter(x => !overtoneOf(x, notes, level)).map(x => x.pitchMidi)
}

describe('overtone filter', () => {
    const D2 = 38

    it('drops the weaker harmonics of a low note', () => {
        // D2 with its octave, octave + fifth (A3), two octaves (D4) and the major third above them (F#4)
        const notes = [n(D2, 0.8), n(D2 + 12, 0.4), n(D2 + 19, 0.5), n(D2 + 24, 0.35), n(D2 + 28, 0.3)]
        expect(reported(notes, 'normal')).toEqual([D2])
    })

    it('keeps a real octave (about as strong as the lower note)', () => {
        expect(reported([n(D2, 0.7), n(D2 + 12, 0.65)], 'normal')).toEqual([D2, D2 + 12])
    })

    it('keeps notes that are not harmonics (a chord in the bass)', () => {
        // D2, F2, A2: a minor third and a fifth are not harmonic distances
        expect(reported([n(D2, 0.8), n(D2 + 3, 0.4), n(D2 + 7, 0.4)], 'normal')).toEqual([D2, D2 + 3, D2 + 7])
    })

    it('keeps a harmonic that starts at another time (played later)', () => {
        const notes = [n(D2, 0.8, 100), n(D2 + 19, 0.4, 100 + OVERTONE_ONSET_FRAMES + 5)]
        expect(reported(notes, 'normal')).toEqual([D2, D2 + 19])
        expect(reported([n(D2, 0.8, 100), n(D2 + 19, 0.4, 100 + OVERTONE_ONSET_FRAMES)], 'normal')).toEqual([D2])
    })

    it('normal: only low fundamentals; strong: also middle notes and stronger overtones', () => {
        const middle = [n(64, 0.8), n(76, 0.4)] // E4 with its octave
        expect(reported(middle, 'normal')).toEqual([64, 76])
        expect(reported(middle, 'strong')).toEqual([64])
        const octave = [n(D2, 0.7), n(D2 + 12, 0.65)]
        expect(reported(octave, 'strong')).toEqual([D2])
    })

    it('off: reports everything', () => {
        const notes = [n(D2, 0.8), n(D2 + 12, 0.2), n(D2 + 19, 0.2)]
        expect(reported(notes, 'off')).toEqual([D2, D2 + 12, D2 + 19])
    })
})
