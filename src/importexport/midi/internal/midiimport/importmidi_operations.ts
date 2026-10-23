/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_operations.h/.cpp (namespace MidiOperations and the
 * global midiImportOperations). The operations keep MuseScore's defaults (there is no MIDI import panel);
 * C++ setOperationsFromFile (the operations of an XML file given on the command line) is not ported.
 * The scoped setters CurrentTrackSetter and CurrentMidiFileSetter restore the old value with restore() (C++ destructor).
 */

import type { InstrumentTemplate } from '../../../../engraving/dom/instrtemplate'
import { StdMultimap, StdSet } from '../../../../framework/global/stdmap'
import { MidiFile } from '../midishared/midifile'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import type { MTrack } from './importmidi_inner'
import { QuantValue, Swing, TimeSigDenominator, TimeSigNumerator, VoiceCount } from './importmidi_operation'
import { midiImportConfiguration } from '../midiconfiguration'

// operation types are in importmidi_operation.ts

export class TrackOp<T> {
    // <track index, operation value>
    // if track index == -1 then it's default value (for all tracks)
    private _operation = new Map<number, T>()
    private _canRedefineDefaultLater = true

    constructor(defaultValue: T, private readonly _equals: (a: T, b: T) => boolean = (a, b) => a === b) {
        this._operation.set(-1, defaultValue)
    }

    value(trackIndex: number): T {
        if (!this._operation.has(trackIndex)) {
            return this._operation.get(-1) as T
        }
        return this._operation.get(trackIndex) as T
    }

    setValue(trackIndex: number, value: T): void {
        if (!this._equals(value, this.value(trackIndex))) {
            this._operation.set(trackIndex, value)
        }
    }

    defaultValue(): T {
        return this._operation.get(-1) as T
    }

    canRedefineDefaultLater(): boolean { return this._canRedefineDefaultLater }

    setDefaultValue(value: T, canRedefineDefaultLater = true): void {
        if (!this._canRedefineDefaultLater) {
            return
        }
        this._operation.set(-1, value)
        this._canRedefineDefaultLater = canRedefineDefaultLater
    }

    clear(): void {
        const defaultVal = this.defaultValue()
        this._operation.clear()
        this._operation.set(-1, defaultVal)
    }
}

export class Op<T> {
    private _value: T
    private _valueWasSet = false
    private _defaultValue: T
    private _canRedefineDefaultLater = true

    constructor(defaultValue: T) {
        this._value = defaultValue
        this._defaultValue = defaultValue
    }

    value(): T {
        if (!this._valueWasSet) {
            return this._defaultValue
        }
        return this._value
    }

    setValue(value: T): void {
        if (value !== this.value()) {
            this._value = value
            this._valueWasSet = true
        }
    }

    defaultValue(): T {
        return this._defaultValue
    }

    canRedefineDefaultLater(): boolean { return this._canRedefineDefaultLater }

    setDefaultValue(value: T, canRedefineDefaultLater = true): void {
        if (!this._canRedefineDefaultLater) {
            return
        }
        this._defaultValue = value
        this._canRedefineDefaultLater = canRedefineDefaultLater
    }
}

/** Quantize::defaultQuantValueFromPreferences: the preference io/midi/shortestNote */

function defaultQuantValueFromPreferences(): QuantValue {
    // Quantize::fractionToQuantValue
    const fraction = ReducedFraction.fromTicks(midiImportConfiguration().midiShortestNote())
    const values: [QuantValue, number][] = [
        [QuantValue.Q_4, 4], [QuantValue.Q_8, 8], [QuantValue.Q_16, 16], [QuantValue.Q_32, 32], [QuantValue.Q_64, 64],
        [QuantValue.Q_128, 128], [QuantValue.Q_256, 256], [QuantValue.Q_512, 512], [QuantValue.Q_1024, 1024],
    ]
    for (const [v, d] of values) {
        if (fraction.eq(new ReducedFraction(1, d))) {
            return v
        }
    }
    return QuantValue.Q_16
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i])
}

// values that can be changed

export class Opers {
    // data that cannot be changed by the user
    channel = new TrackOp<number>(0)
    staffName = new TrackOp<string>('') // will be converted to unicode later (a binary string, see convertToCharset)
    midiInstrName = new TrackOp<string>('')
    msInstrList = new TrackOp<readonly (InstrumentTemplate | null)[]>([], arraysEqual)
    isDrumTrack = new TrackOp<boolean>(false)

    // operations for all tracks
    isHumanPerformance = new Op<boolean>(false)
    searchPickupMeasure = new Op<boolean>(true)
    measureCount2xLess = new Op<boolean>(false)
    showTempoText = new Op<boolean>(true)
    showChordNames = new Op<boolean>(true)
    timeSigNumerator = new Op<TimeSigNumerator>(TimeSigNumerator._4)
    timeSigDenominator = new Op<TimeSigDenominator>(TimeSigDenominator._4)

    // operations for individual tracks
    trackIndexAfterReorder = new TrackOp<number>(0)
    doImport = new TrackOp<boolean>(true)
    quantValue = new TrackOp<QuantValue>(defaultQuantValueFromPreferences())
    searchTuplets = new TrackOp<boolean>(true)
    search2plets = new TrackOp<boolean>(false)
    search3plets = new TrackOp<boolean>(true)
    search4plets = new TrackOp<boolean>(true)
    search5plets = new TrackOp<boolean>(true)
    search7plets = new TrackOp<boolean>(true)
    search9plets = new TrackOp<boolean>(true)
    useDots = new TrackOp<boolean>(true)
    simplifyDurations = new TrackOp<boolean>(true) // for drum tracks - remove rests and ties
    showStaccato = new TrackOp<boolean>(true)
    doStaffSplit = new TrackOp<boolean>(false) // for drum tracks - split by voices
    maxVoiceCount = new TrackOp<VoiceCount>(VoiceCount.V_4)
    changeClef = new TrackOp<boolean>(true)
    swing = new TrackOp<Swing>(Swing.NONE)
    removeDrumRests = new TrackOp<boolean>(true)
    lyricTrackIndex = new TrackOp<number>(-1) // empty lyric
    msInstrIndex = new TrackOp<number>(-1) // for empty instrument list
}

export class HumanBeatData {
    beatSet = new StdSet<ReducedFraction>(compareReducedFractions)
    // to adapt human beats to a different time sig, if necessary
    addedFirstBeats = 0
    addedLastBeats = 0
    firstChordTick = new ReducedFraction()
    lastChordTick = new ReducedFraction()
    timeSig = new ReducedFraction()
    measureCount2xLess = false
}

export class FileData {
    midiFile = new MidiFile()
    tracks: MTrack[] = []
    processingsOfOpenedFile = 0
    fileModificationTime = 0
    hasTempoText = false
    trackCount = 0
    trackOpers = new Opers()
    charset = 'UTF-8' // MidiCharset::defaultCharset()
    // after the user apply MIDI import operations
    // this value should be set to false
    // tracks of <tick, lyric fragment> from karaoke files
    // QList of lyric tracks - there can be multiple lyric tracks,
    // lyric track count != MIDI track count in general
    // (the lyric fragments are binary strings, see convertToCharset)
    lyricTracks: StdMultimap<ReducedFraction, string>[] = []
    chordNames = new StdMultimap<ReducedFraction, string>(compareReducedFractions)
    humanBeatData = new HumanBeatData()
}

export class Data {
    /** @internal */ _currentMidiFile = ''
    private _midiOperationsFile = ''
    /** @internal */ _currentTrack = -1

    private _data = new Map<string, FileData>() // <file name, tracks data>

    /** the data of the current MIDI file (C++ returns nullptr if there is none, here it throws) */
    data(): FileData {
        const d = this._data.get(this._currentMidiFile)
        if (!d) {
            throw new Error('MidiOperations::Data::data: no current MIDI file')
        }
        return d
    }

    hasData(): boolean {
        return this._data.has(this._currentMidiFile)
    }

    addNewMidiFile(fileName: string): void {
        if (this._data.has(fileName)) {
            return
        }
        const fileData = new FileData()
        // TODO(port): setOperationsFromFile(_midiOperationsFile, fileData.trackOpers)
        this._data.set(fileName, fileData)
    }

    currentTrack(): number {
        return this._currentTrack
    }

    setMidiFileData(fileName: string, midiFile: MidiFile): void {
        let d = this._data.get(fileName)
        if (!d) {
            d = new FileData()
            this._data.set(fileName, d)
        }
        d.midiFile = midiFile
    }

    excludeMidiFile(fileName: string): void {
        this._data.delete(fileName)
    }

    hasMidiFile(fileName: string): boolean {
        return this._data.has(fileName)
    }

    midiFile(fileName: string): MidiFile | null {
        return this._data.get(fileName)?.midiFile ?? null
    }

    allMidiFiles(): string[] {
        return [...this._data.keys()].sort()
    }

    setOperationsFile(fileName: string): void {
        this._midiOperationsFile = fileName
    }
}

/** scoped setter of current track: call restore() at the end of the scope (C++ destructor) */
export class CurrentTrackSetter {
    private _oldValue: number

    constructor(private readonly _opers: Data, track: number) {
        this._oldValue = _opers._currentTrack
        _opers._currentTrack = track
    }

    restore(): void {
        this._opers._currentTrack = this._oldValue
    }
}

/** scoped setter of current MIDI file: call restore() at the end of the scope (C++ destructor) */
export class CurrentMidiFileSetter {
    private _oldValue: string

    constructor(private readonly _opers: Data, fileName: string) {
        this._oldValue = _opers._currentMidiFile
        _opers._currentMidiFile = fileName
    }

    restore(): void {
        this._opers._currentMidiFile = this._oldValue
    }
}

export const midiImportOperations = new Data()
