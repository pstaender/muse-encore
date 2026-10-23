/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpnote.h
 */

import type { INoteProperty } from './inoteproperty'

export enum GPNoteTieType {
    None, Start, Mediate, End
}

export enum GPNoteVibratoType {
    None, Slight, Wide
}

export enum GPNoteOrnament {
    None, LowerMordent, UpperMordent, InvertedTurn, Turn
}

export enum GPNoteHammerOn {
    None, Start, End
}

export enum GPNotePickScrape {
    None, Down, Up
}

export enum GPNoteHarmonicType {
    None, Natural, Artificial, Pinch, Tap, Semi, FeedBack, Types
}

export class GPNoteHarmonic {
    fret = 0
    type = GPNoteHarmonicType.None

    static isArtificial(type: GPNoteHarmonicType): boolean {
        return type === GPNoteHarmonicType.Artificial
               || type === GPNoteHarmonicType.Pinch
               || type === GPNoteHarmonicType.Tap
               || type === GPNoteHarmonicType.Semi
               || type === GPNoteHarmonicType.FeedBack
    }
}

export class GPNoteMidiPitch {
    midi = -1
    string = -1
    fret = -1
    octave = -1
    tone = 0
    element = 0
    variation = -1
}

export class GPNoteBend {
    destinationOffset = -1
    destinationValue = -1
    middleOffset1 = -1
    middleOffset2 = -1
    middleValue = -1
    originOffset = -1
    originValue = -1

    isEmpty(): boolean {
        return this.destinationValue === -1
               && this.destinationOffset === -1
               && this.middleValue === -1
               && this.middleOffset1 === -1
               && this.middleOffset2 === -1
               && this.originOffset === -1
               && this.originValue === -1
    }
}

export interface GPNoteTrill {
    auxillaryFret: number
    speed: number
}

export class GPNote {
    static readonly invalidAccidental = -10

    private _id = -1
    private _tie = GPNoteTieType.None
    private _properties = new Set<INoteProperty>()
    private _midiPitch = new GPNoteMidiPitch()
    private _accidental = GPNote.invalidAccidental
    private _harmonic = new GPNoteHarmonic()
    private _bend: GPNoteBend | null = null
    private _letRing = false
    private _palmMuted = false
    private _ghostNote = false
    private _muted = false
    // [0] - staccato, [1] - unknown, [2] - heavily accidental, [3] - accidental
    private _accent: boolean[] = [false, false, false, false]
    // [0] shifSlide, [1] - legatoSlide, [2] - slideDownWard, [3] - slidewUpWard, [4] - slideInFormBelow, [5] - slideInFormAbove,
    private _slides: boolean[] = [false, false, false, false, false, false]
    private _leftFingering = ''
    private _rightFingering = ''
    private _vibrato = GPNoteVibratoType.None
    private _trill: GPNoteTrill = { auxillaryFret: -1, speed: -1 }
    private _ornament = GPNoteOrnament.None
    private _rightHandTapping = false
    private _leftHandTapped = false
    private _hammer = GPNoteHammerOn.None
    private _pickScrape = GPNotePickScrape.None
    private m_showStringNumber = false

    addProperties(pr: Set<INoteProperty>): void { this._properties = pr }
    setTieType(t: GPNoteTieType): void { this._tie = t }
    setMidi(m: number): void { this._midiPitch.midi = m }
    midi(): number { return this._midiPitch.midi }
    setString(s: number): void { this._midiPitch.string = s }
    string(): number { return this._midiPitch.string }
    setFret(f: number): void { this._midiPitch.fret = f }
    fret(): number { return this._midiPitch.fret }
    setOctave(o: number): void { this._midiPitch.octave = o }
    setTone(t: number): void { this._midiPitch.tone = t }
    setVariation(t: number): void { this._midiPitch.variation = t }
    setElement(t: number): void { this._midiPitch.element = t }
    setAccidental(acc: number): void { this._accidental = acc }
    accidental(): number { return this._accidental }
    setHarmonicFret(f: number): void { this._harmonic.fret = f }
    setHarmonicType(t: GPNoteHarmonicType): void { this._harmonic.type = t }
    harmonic(): GPNoteHarmonic { return this._harmonic }
    setLetRing(lr: boolean): void { this._letRing = lr }
    letRing(): boolean { return this._letRing }
    setPalmMute(pm: boolean): void { this._palmMuted = pm }
    palmMute(): boolean { return this._palmMuted }
    midiPitch(): GPNoteMidiPitch { return this._midiPitch }
    tieType(): GPNoteTieType { return this._tie }
    setBend(b: GPNoteBend | null): void { this._bend = b }
    bend(): GPNoteBend | null { return this._bend }
    setGhostNote(b: boolean): void { this._ghostNote = b }
    ghostNote(): boolean { return this._ghostNote }
    setMute(m: boolean): void { this._muted = m }
    /** muted = dead note */
    muted(): boolean { return this._muted }
    setRightHandTapping(t: boolean): void { this._rightHandTapping = t }
    rightHandTapping(): boolean { return this._rightHandTapping }
    setLeftHandTapped(v: boolean): void { this._leftHandTapped = v }
    leftHandTapped(): boolean { return this._leftHandTapped }
    setAccent(b: boolean[]): void { this._accent = b.slice() }
    accents(): boolean[] { return this._accent }
    setSlides(s: boolean[]): void { this._slides = s.slice() }
    slides(): boolean[] { return this._slides }
    setLeftFingering(ch: string): void { this._leftFingering = ch }
    leftFingering(): string { return this._leftFingering }
    setRightFingering(ch: string): void { this._rightFingering = ch }
    rightFingering(): string { return this._rightFingering }
    setShowStringNumber(show: boolean): void { this.m_showStringNumber = show }
    showStringNumber(): boolean { return this.m_showStringNumber }
    setVibratoType(v: GPNoteVibratoType): void { this._vibrato = v }
    vibratoType(): GPNoteVibratoType { return this._vibrato }
    setTrillFret(fr: number): void { this._trill.auxillaryFret = fr }
    setTrillSpeed(tr: number): void { this._trill.speed = tr }
    trill(): GPNoteTrill { return { ...this._trill } }
    setOrnament(o: GPNoteOrnament): void { this._ornament = o }
    ornament(): GPNoteOrnament { return this._ornament }
    setHammerOn(h: GPNoteHammerOn): void { this._hammer = h }
    hammerOn(): GPNoteHammerOn { return this._hammer }
    setPickScrape(p: GPNotePickScrape): void { this._pickScrape = p }
    pickScrape(): GPNotePickScrape { return this._pickScrape }
    setId(id: number): void { this._id = id }
    id(): number { return this._id }
    properties(): Set<INoteProperty> { return this._properties }
}
