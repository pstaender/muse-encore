/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gptrack.h/.cpp
 */

export class GPTrackRSE {
    pan = 0
    volume = 0
    chorus = 0
    reverb = 0
    phase = 0
    tremolo = 0
}

export class GPTrackStaffProperty {
    fretCount = 24
    capoFret = 0
    tunning: number[] = []
    useFlats = false
    ignoreFlats = false
}

export interface GPTrackInstrumentString {
    num: number
    tunning: number
}

export class GPTrackDiagram {
    id = 0
    name = ''
    stringCount = 0
    fretCount = 0
    baseFret = 0
    /** string -> fret (C++ unordered_map) */
    frets = new Map<number, number>()
    // there are some other tags
    // which cant be used in MU
}

export class GPTrackSound {
    programm = 0
    name = ''
    label = ''
    path = ''
    role = ''
}

export class GPTrackSoundAutomation {
    type = ''
    value = ''
    bar = 0
    linear = false
    position = 0
}

export interface GPTrackSoundAutomationPos {
    bar: number
    pos: number
}

export class GPTrack {
    protected _name = ''
    protected _shortName = ''
    protected _instrument = ''
    protected _rse = new GPTrackRSE()
    protected _programm = 0
    protected _midiChannel = 0
    protected _isGuitar = false
    protected _idx = -1
    protected _staffCount = 1
    protected _staffProperty: GPTrackStaffProperty[] = []
    protected _sounds = new Map<string, GPTrackSound>()
    /** C++ std::map<SoundAutomationPos, SoundAutomation>: keyed by "bar;pos", sorted in soundAutomations() */
    protected _automations = new Map<string, [GPTrackSoundAutomationPos, GPTrackSoundAutomation]>()
    protected _transpose = 0
    protected _diagrams = new Map<number, GPTrackDiagram>()
    protected _lyrics = ''
    protected _lyricsOffset = 0
    protected _lineCount = 5 // for percussion lines

    constructor(idx: number) {
        this._idx = idx
    }

    setName(n: string): void { this._name = n }
    name(): string { return this._name }
    setShortName(s: string): void { this._shortName = s }
    shortName(): string { return this._shortName }
    setInstrument(s: string): void { this._instrument = s }
    instrument(): string { return this._instrument }
    setRSE(r: GPTrackRSE): void { this._rse = r }
    rse(): GPTrackRSE { return this._rse }
    setProgramm(pr: number): void { this._programm = pr }
    programm(): number { return this._programm }
    setMidiChannel(ch: number): void { this._midiChannel = ch }
    midiChannel(): number { return this._midiChannel }
    setIsGuitar(arg: boolean): void { this._isGuitar = arg }
    isGuitar(): boolean { return this._isGuitar }
    addStaffProperty(st: GPTrackStaffProperty): void { this._staffProperty.push(st) }
    staffProperty(): GPTrackStaffProperty[] { return this._staffProperty }

    addSound(sound: GPTrackSound): void {
        const key = sound.path + ';' + sound.name + ';' + sound.role
        if (!this._sounds.has(key)) { // std::unordered_map::insert does not replace
            this._sounds.set(key, sound)
        }
    }

    addSoundAutomation(val: GPTrackSoundAutomation): void {
        const key = `${val.bar};${val.position}`
        if (!this._automations.has(key)) { // std::map::insert does not replace
            this._automations.set(key, [{ bar: val.bar, pos: val.position }, val])
        }
    }

    sounds(): Map<string, GPTrackSound> { return this._sounds }

    /** sorted by (bar, pos) like the C++ std::map */
    soundAutomations(): [GPTrackSoundAutomationPos, GPTrackSoundAutomation][] {
        return [...this._automations.values()].sort((a, b) => (a[0].bar - b[0].bar) || (a[0].pos - b[0].pos))
    }

    strings(): GPTrackInstrumentString[] {
        const ss: GPTrackInstrumentString[] = []
        if (this._staffProperty.length === 0) {
            return ss
        }
        const sp = this._staffProperty[0]
        for (let i = 0; i < sp.tunning.length; ++i) {
            ss.push({ num: i + 1, tunning: sp.tunning[i] })
        }
        return ss
    }

    setStaffCount(n: number): void { this._staffCount = n }
    staffCount(): number { return this._staffCount }
    setTranspose(t: number): void { this._transpose = t }
    transpose(): number { return this._transpose }

    addDiagram(d: [number, GPTrackDiagram]): void {
        if (!this._diagrams.has(d[0])) {
            this._diagrams.set(d[0], d[1])
        }
    }

    diagram(): Map<number, GPTrackDiagram> { return this._diagrams }
    setLyrics(l: string): void { this._lyrics = l }
    lyrics(): string { return this._lyrics }
    setLyricsOffset(n: number): void { this._lyricsOffset = n }
    lyricsOffset(): number { return this._lyricsOffset }
    setLineCount(n: number): void { this._lineCount = n }
    lineCount(): number { return this._lineCount }
    idx(): number { return this._idx }
}

export class GP6Track extends GPTrack {}

export class GP7Track extends GPTrack {}
