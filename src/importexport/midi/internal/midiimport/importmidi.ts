/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi.cpp: the conversion of a MIDI file into a score
 * (convertMidi) and importMidi. The methods of MTrack defined in importmidi.cpp are added to the MTrack class of
 * importmidi_inner.ts here. importMidi gets the bytes of the file instead of reading it from disk; there is no file
 * modification time: an already known file name is processed with the stored operations like a re-import from the
 * MIDI import panel of MuseScore (NotationMidiReader removes the data of the file after the import).
 */

import { Fraction } from '../../../../engraving/types/fraction'
import {
    DirectionV, DurationType as EngravingDurationType, Key, PreferSharpFlat, TextStyleType, VOICES, type track_idx_t,
} from '../../../../engraving/types/types'
import { SymId } from '../../../../engraving/types/symid'
import { Sid } from '../../../../engraving/style/styledef'
import { Err } from '../../../../engraving/engravingerrors'
import type { MasterScore } from '../../../../engraving/dom/masterscore'
import type { Score } from '../../../../engraving/dom/score'
import { Measure } from '../../../../engraving/dom/measure'
import { SegmentType } from '../../../../engraving/dom/segment'
import { Rest } from '../../../../engraving/dom/rest'
import { Chord } from '../../../../engraving/dom/chord'
import { Note } from '../../../../engraving/dom/note'
import { NoteVal } from '../../../../engraving/dom/input'
import { Articulation } from '../../../../engraving/dom/articulation'
import { Text } from '../../../../engraving/dom/text'
import { VBox } from '../../../../engraving/dom/box'
import { TimeSig } from '../../../../engraving/dom/timesig'
import { Tie } from '../../../../engraving/dom/tie'
import { TDuration } from '../../../../engraving/dom/durationtype'
import { KeyList, KeySigEvent } from '../../../../engraving/dom/key'
import type { Drumset } from '../../../../engraving/dom/drumset'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { MScore } from '../../../../engraving/dom/mscore'
import { Transpose } from '../../../../engraving/editing/transpose'
import { XmlWriter } from '../../../../engraving/rw/xmlwriter'
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import {
    CTRL_VOLUME, ME_CONTROLLER, ME_META, ME_NOTE, ME_PROGRAM, META_COMPOSER, META_COPYRIGHT, META_KEY_SIGNATURE,
    META_LYRIC, META_POET, META_PORT_CHANGE, META_SUBTITLE, META_TEMPO, META_TEXT, META_TIME_SIGNATURE, META_TITLE,
    META_TRACK_NAME, META_TRANSLATOR,
} from '../../../../engraving/compat/midi/midicoreevent'
import { GM1Program, toGm1Program, toMidiData } from '../midishared/generalmidi'
import { MidiFile, MidiFileError } from '../midishared/midifile'
import type { MidiEvent } from '../midishared/midievent'
import { ReducedFraction, toMuseScoreTicks } from './importmidi_fraction'
import { MTrack, newTrackMap, convertToCharset, fromUchar, type TrackMap } from './importmidi_inner'
import { MidiChord, MidiNote, type ChordMap, newChordMap } from './importmidi_chord'
import {
    collectChords, findMinDuration, maxNoteOffTime, mergeChordsWithEqualOnTimeAndVoice, minAllowedDuration,
    removeOverlappingNotes, setBarIndexes, splitUnequalChords,
} from './importmidi_chord'
import { type TupletMap, newTupletMap, findAllTuplets, findTupletsInBarForDuration, removeEmptyTuplets } from './importmidi_tuplet'
import { addElementToTuplet, createTupletNotes } from './importmidi_tuplet_tonotes'
import { DurationType, toDurationList as Meter_toDurationList } from './importmidi_meter'
import { midiImportOperations, CurrentMidiFileSetter, CurrentTrackSetter } from './importmidi_operations'
import { VoiceCount } from './importmidi_operation'
import { quantValueToFraction, quantizeChords, setIfHumanPerformance } from './importmidi_quant'
import { findChordNames, setChordNames } from './importmidi_chordname'
import { extractLyricsToMidiData, setLyricsToScore } from './importmidi_lyrics'
import { adjustChordsToBeats, setTimeSignature } from './importmidi_beat'
import { needToSplit, splitIntoLeftRightHands } from './importmidi_lrhand'
import { setStaffBracketForDrums, splitDrumTracks, splitDrumVoices } from './importmidi_drum'
import { simplifyDurationsForDrums, simplifyDurationsNotDrums } from './importmidi_simplify'
import { separateVoices } from './importmidi_voice'
import {
    concatenateWithComma, createInstruments, findInstrumentsForAllTracks, instrumentName, isGrandStaff, msInstrName,
    setGrandStaffProgram,
} from './importmidi_instrument'
import { assignKeyListToStaff, recognizeMainKeySig } from './importmidi_key'
import { detectSwing } from './importmidi_swing'
import { createClefs as MidiClef_createClefs } from './importmidi_clef'
import { setTempo } from './importmidi_tempo'

declare module './importmidi_inner' {
    interface MTrack {
        createNotes(lastTick: ReducedFraction): void
        processPendingNotes(midiChords: MidiChord[], voice: number, startChordTickFrac: ReducedFraction,
                            nextChordTick: ReducedFraction): void
        processMeta(tick: number, mm: MidiEvent): void
        fillGapWithRests(score: Score, voice: number, startChordTickFrac: ReducedFraction, restLength: ReducedFraction,
                         track: track_idx_t): void
        toDurationList(measure: Measure, voice: number, startTick: ReducedFraction, len: ReducedFraction,
                       durationType: DurationType): [ReducedFraction, TDuration][]
        createKeys(defaultKey: Key, allKeyList: KeyList): void
    }
}

export function lengthenTooShortNotes(tracks: TrackMap): void {
    for (const track of tracks) {
        const mtrack = track.second
        for (const chord of mtrack.chords) {
            for (const note of chord.second.notes) {
                if (note.offTime.minus(chord.first).lt(minAllowedDuration())) {
                    note.offTime = chord.first.plus(minAllowedDuration())
                }
            }
        }
    }
}

export function separateDrumChordsTo2Voices(chords: ChordMap): ChordMap[] {
    const separatedChords: ChordMap[] = [newChordMap(), newChordMap()]
    for (const chord of chords) {
        const c = chord.second
        separatedChords[c.voice].insert(chord.first, c.clone())
    }
    return separatedChords
}

function setChordVoice(chord: MidiChord, voice: number): void {
    chord.voice = voice
    if (chord.isInTuplet) {
        chord.tuplet.second.voice = voice
    }
    for (const note of chord.notes) {
        if (note.isInTuplet) {
            note.tuplet.second.voice = voice
        }
    }
}

function findAllTupletsForDrums(mtrack: MTrack, sigmap: TimeSigMap, basicQuant: ReducedFraction): void {
    const drumVoiceCount = 2
    // drum track has 2 voices (stem up and stem down),
    // and tuplet detection is applicable for single voice drum tracks,
    // so split track chords into 2 voice groups,
    // detect tuplets and merge chords (and found tuplets) back;
    // it's a small hack due to the fact that tuplet detection
    // is designed to work before voice setting

    const chords: ChordMap[] = []
    for (let voice = 0; voice < drumVoiceCount; ++voice) {
        chords.push(newChordMap())
    }
    for (const chord of mtrack.chords) {
        const c = chord.second
        chords[c.voice].insert(chord.first, c.clone())
    }

    const tuplets: TupletMap[] = []
    for (let voice = 0; voice < drumVoiceCount; ++voice) {
        tuplets.push(newTupletMap())
    }
    for (let voice = 0; voice < drumVoiceCount; ++voice) {
        if (!chords[voice].empty()) {
            findAllTuplets(tuplets[voice], chords[voice], sigmap, basicQuant)
        }
    }
    mtrack.chords.clear()
    for (let voice = 0; voice < drumVoiceCount; ++voice) {
        for (const chord of chords[voice]) {
            // correct voice because it can be changed during tuplet detection
            setChordVoice(chord.second, voice)
            mtrack.chords.insert(chord.first, chord.second.clone())
        }
    }
    mtrack.updateTupletsFromChords()
    // note: temporary local tuplets and chords are deleted here
}

function quantizeAllTracks(tracks: TrackMap, sigmap: TimeSigMap, lastTick: ReducedFraction): void {
    const opers = midiImportOperations

    for (const track of tracks) {
        const mtrack = track.second
        if (mtrack.chords.empty()) {
            continue
        }
        // pass current track index through MidiImportOperations
        // for further usage
        const setCurrentTrack = new CurrentTrackSetter(opers, mtrack.indexOfOperation)
        try {
            if (opers.data().processingsOfOpenedFile === 0) {
                opers.data().trackOpers.isDrumTrack.setValue(opers.currentTrack(), mtrack.mtrack!.drumTrack())
                if (mtrack.mtrack!.drumTrack()) {
                    opers.data().trackOpers.maxVoiceCount.setValue(opers.currentTrack(), VoiceCount.V_1)
                }
            }
            const basicQuant = quantValueToFraction(opers.data().trackOpers.quantValue.value(mtrack.indexOfOperation))

            setBarIndexes(mtrack.chords, basicQuant, lastTick, sigmap)

            if (mtrack.mtrack!.drumTrack()) {
                findAllTupletsForDrums(mtrack, sigmap, basicQuant)
            } else {
                findAllTuplets(mtrack.tuplets, mtrack.chords, sigmap, basicQuant)
            }

            // (4/3 of the smallest duration) tol is less sensitive
            // to on time inaccuracies than 1/2 earlier
            collectChords(mtrack, new ReducedFraction(2, 1), new ReducedFraction(4, 3))
            quantizeChords(mtrack.chords, sigmap, basicQuant)
            removeEmptyTuplets(mtrack)
        } finally {
            setCurrentTrack.restore()
        }
    }
}

//---------------------------------------------------------
//   processMeta
//---------------------------------------------------------

MTrack.prototype.processMeta = function (this: MTrack, tick: number, mm: MidiEvent): void {
    if (!this.staff) {
        return
    }
    const data = mm.edata()
    const staff = this.staff
    const cs = staff.score()

    switch (mm.metaType()) {
    case META_TEXT:
    case META_LYRIC:
        break // lyric and text are added in importmidi_lyrics.cpp
    case META_TRACK_NAME:
    {
        const text = fromUchar(data)

        const opers = midiImportOperations
        if (opers.data().processingsOfOpenedFile === 0) {
            const currentTrack = this.indexOfOperation
            opers.data().trackOpers.staffName.setValue(currentTrack, text)
        }

        if (this.name === '') {
            this.name = convertToCharset(text)
        }
    }
        break
    case META_TEMPO: // add later, after adding of notes
        break
    case META_KEY_SIGNATURE:
    {
        const key = (data[0] << 24) >> 24 // signed char
        if (key < -7 || key > 7) {
            break
        }
        const ke = new KeySigEvent()
        const tKey = key as Key
        let cKey = tKey
        const t = Fraction.fromTicks(tick)
        const v = staff.part()!.instrument(t).transpose()
        if (!v.isZero() && !cs.style().styleB(Sid.concertPitch)) {
            cKey = Transpose.transposeKey(tKey, v)
            // if there are more than 6 accidentals in transposing key, it cannot be PreferSharpFlat::AUTO
            if ((tKey > 6 || tKey < -6) && staff.part()!.preferSharpFlat() === PreferSharpFlat.AUTO) {
                staff.part()!.setPreferSharpFlat(PreferSharpFlat.NONE)
            }
        }
        ke.setConcertKey(cKey)
        ke.setKey(tKey)
        staff.setKey(t, ke)
        this.hasKey = true
    }
        break
    case META_COMPOSER: // mscore extension
    case META_POET:
    case META_TRANSLATOR:
    case META_SUBTITLE:
    case META_TITLE:
    {
        let ssid = TextStyleType.DEFAULT
        switch (mm.metaType()) {
        case META_COMPOSER:
            ssid = TextStyleType.COMPOSER
            break
        case META_TRANSLATOR:
            ssid = TextStyleType.TRANSLATOR
            break
        case META_POET:
            ssid = TextStyleType.LYRICIST
            break
        case META_SUBTITLE:
            ssid = TextStyleType.SUBTITLE
            break
        case META_TITLE:
            ssid = TextStyleType.TITLE
            break
        }

        let measure = cs.first()!
        const text = new Text(measure, ssid)
        text.setPlainText(utf8String(data))

        if (!measure.isVBox()) {
            measure = new VBox(scoreDummy(cs).system())
            measure.setTick(new Fraction(0, 1))
            measure.setNext(cs.first())
            // C++ MeasureBaseList::append (push_back): the box is appended at the end (setNext(nullptr))
            cs.measures().append(measure)
        }
        measure.add(text)
    }
        break
    case META_COPYRIGHT:
        cs.setMetaTag('copyright', utf8String(data))
        break
    case META_TIME_SIGNATURE:
        break // added earlier
    case META_PORT_CHANGE:
        staff.part()!.setMidiChannel(-1, data[0])
        break
    default:
        if (MScore.debugMode) {
            console.debug(`unknown meta type 0x${mm.metaType().toString(16)}`)
        }
        break
    }
}

/** C++ String::fromUtf8((const char*)data): the text up to the terminating 0 */
function utf8String(data: Uint8Array): string {
    let end = data.indexOf(0)
    if (end < 0) {
        end = data.length
    }
    return new TextDecoder('utf-8').decode(data.subarray(0, end))
}

MTrack.prototype.toDurationList = function (this: MTrack, measure: Measure, voice: number, startTick: ReducedFraction,
                                             len: ReducedFraction, durationType: DurationType): [ReducedFraction, TDuration][] {
    // find tuplets over which duration goes
    const barTick = ReducedFraction.fromFraction(measure.tick())
    const tupletsData = findTupletsInBarForDuration(voice, barTick, startTick, len, this.tuplets)
    // sort by tuplet length in desc order
    tupletsData.sort((d1, d2) => (d1.len.gt(d2.len) ? -1 : d2.len.gt(d1.len) ? 1 : 0))

    const startTickInBar = startTick.minus(barTick)
    const endTickInBar = startTickInBar.plus(len)

    const opers = midiImportOperations
    const useDots = opers.data().trackOpers.useDots.value(this.indexOfOperation)
    return Meter_toDurationList(startTickInBar, endTickInBar, ReducedFraction.fromFraction(measure.timesig()), tupletsData,
                                durationType, useDots)
}

function splitDurationOnBarBoundary(len: ReducedFraction, onTime: ReducedFraction, measure: Measure): ReducedFraction {
    const barLimit = ReducedFraction.fromFraction(measure.endTick())
    if (onTime.plus(len).gt(barLimit)) {
        return barLimit.minus(onTime)
    }
    return len
}

// fill the gap between successive chords with rests

MTrack.prototype.fillGapWithRests = function (this: MTrack, score: Score, voice: number,
                                              startChordTickFrac: ReducedFraction, restLength: ReducedFraction,
                                              track: track_idx_t): void {
    let startChordTick = startChordTickFrac
    let restLen = restLength
    while (restLen.gt(new ReducedFraction(0, 1))) {
        let len = restLen
        const measure = score.tick2measure(startChordTick.fraction())!
        if (startChordTick.ge(ReducedFraction.fromFraction(measure.endTick()))) {
            // tick2measure: end of score?
            startChordTick = startChordTick.plus(restLen)
            restLen = new ReducedFraction(0, 1)
            break
        }
        len = splitDurationOnBarBoundary(len, startChordTick, measure)

        if (len.ge(ReducedFraction.fromFraction(measure.ticks()))) {
            // rest to the whole measure
            len = ReducedFraction.fromFraction(measure.ticks())
            if (voice === 0) {
                const duration = new TDuration(EngravingDurationType.V_MEASURE)
                const s = measure.getSegment(SegmentType.ChordRest, startChordTick.fraction())
                const rest = new Rest(s, duration)
                rest.setTicks(measure.ticks())
                rest.setTrack(track)
                s.add(rest)
            }
            restLen = restLen.minus(len)
            startChordTick = startChordTick.plus(len)
        } else {
            const dl = this.toDurationList(measure, voice, startChordTick, len, DurationType.REST)
            if (dl.length === 0) {
                // cannot create duration list for len
                restLen = new ReducedFraction(0, 1) // fake
                break
            }
            for (const durationPair of dl) {
                const duration = durationPair[1]
                const tupletRatio = durationPair[0]
                len = ReducedFraction.fromFraction(duration.fraction()).div(tupletRatio)
                const s = measure.getSegment(SegmentType.ChordRest, startChordTick.fraction())
                const rest = new Rest(s, duration)
                rest.setTicks(duration.fraction())
                rest.setTrack(track)
                s.add(rest)
                addElementToTuplet(voice, startChordTick, len, rest, this.tuplets)
                restLen = restLen.minus(len)
                startChordTick = startChordTick.plus(len)
            }
        }
    }
}

function setMusicNotesFromMidi(_score: Score, midiNotes: MidiNote[], chord: Chord, drumset: Drumset | null,
                               useDrumset: boolean): void {
    for (let i = 0; i < midiNotes.length; ++i) {
        const mn = midiNotes[i]
        const note = new Note(chord)
        note.setTrack(chord.track())

        const nval = new NoteVal(mn.pitch)
        note.setNval(nval, chord.tick())
        // TODO - does this need to be key-aware?
        //note->setPitch(mn.pitch);
        //note->setTpcFromPitch();

        chord.add(note)
        note.setUserVelocity(mn.velo)

        if (useDrumset) {
            if (!drumset!.isValid(mn.pitch)) {
                // unmapped drum note
            } else {
                const sd: DirectionV = drumset!.stemDirection(mn.pitch)
                chord.setStemDirection(sd)
            }
        }

        const tie = midiNotes[i].tie
        if (tie) {
            tie.setEndNote(note)
            tie.setTrack(note.track())
            note.setTieBack(tie)
        }
    }
}

function setTies(chord: Chord, score: Score, midiNotes: MidiNote[]): void {
    for (let i = 0; i < midiNotes.length; ++i) {
        const midiNote = midiNotes[i]
        const note = chord.findNote(midiNote.pitch)!
        const tie = new Tie(scoreDummy(score))
        midiNotes[i].tie = tie
        tie.setStartNote(note)
        note.setTieFor(tie)
    }
}

// convert midiChords with the same onTime value to music notation
// and fill the remaining empty duration with rests

MTrack.prototype.processPendingNotes = function (this: MTrack, midiChords: MidiChord[], voice: number,
                                                 startChordTickFrac: ReducedFraction,
                                                 nextChordTick: ReducedFraction): void {
    const staff = this.staff!
    const score = staff.score()
    const track = staff.idx() * VOICES + voice
    const drumset = staff.part()!.instrument().drumset()
    const useDrumset = staff.part()!.instrument().useDrumset()

    const opers = midiImportOperations.data().trackOpers
    const currentTrack = this.indexOfOperation

    // all midiChords here should have the same onTime value
    // and all notes in each midiChord should have the same duration
    let startChordTick = startChordTickFrac
    while (midiChords.length !== 0) {
        const tick = startChordTick
        let len = nextChordTick.minus(tick)
        if (len.le(new ReducedFraction(0, 1))) {
            break
        }
        len = findMinDuration(tick, midiChords, len)
        const measure = score.tick2measure(tick.fraction())!
        len = splitDurationOnBarBoundary(len, tick, measure)

        const dl = this.toDurationList(measure, voice, tick, len, DurationType.NOTE)
        if (dl.length === 0) {
            break
        }
        const d = dl[0][1]
        const tupletRatio = dl[0][0]
        len = ReducedFraction.fromFraction(d.fraction()).div(tupletRatio)

        const s = measure.getSegment(SegmentType.ChordRest, tick.fraction())
        const chord = new Chord(s)
        chord.setTrack(track)
        chord.setDurationType(d)
        chord.setTicks(d.fraction())

        if (opers.showStaccato.value(currentTrack)
            && startChordTick.eq(startChordTickFrac) // first chord in tied chord sequence
            && midiChords[0].isStaccato()) {
            const a = new Articulation(chord)
            a.setSymId(SymId.articStaccatoAbove)
            chord.add(a)
        }

        s.add(chord)
        addElementToTuplet(voice, tick, len, chord, this.tuplets)

        for (let k = 0; k < midiChords.length; ++k) {
            const midiChord = midiChords[k]
            setMusicNotesFromMidi(score, midiChord.notes, chord, drumset, useDrumset)
            if (midiChord.notes.length !== 0 && midiChord.notes[0].offTime.minus(tick).le(len)) {
                midiChords.splice(k, 1)
                --k
                continue
            }
            setTies(chord, score, midiChord.notes)
        }
        startChordTick = startChordTick.plus(len)
    }
    this.fillGapWithRests(score, voice, startChordTick, nextChordTick.minus(startChordTick), track)
}

MTrack.prototype.createKeys = function (this: MTrack, defaultKey: Key, allKeyList: KeyList): void {
    const staff = this.staff!
    const staffKeyList = staff.keyList()

    if (!this.hasKey && !this.mtrack!.drumTrack()) {
        if (allKeyList.empty()) {
            const ke = new KeySigEvent()
            const v = staff.part()!.instrument().transpose().clone()
            ke.setConcertKey(defaultKey)
            if (!v.isZero() && !staff.score().style().styleB(Sid.concertPitch)) {
                v.flip()
                const tKey = Transpose.transposeKey(defaultKey, v)
                ke.setKey(tKey)
            }
            staffKeyList.set(0, ke)
            assignKeyListToStaff(staffKeyList, staff)
        } else {
            this.hasKey = true
            assignKeyListToStaff(allKeyList, staff)
        }
    } else {
        assignKeyListToStaff(staffKeyList, staff)
    }
}

MTrack.prototype.createNotes = function (this: MTrack, lastTick: ReducedFraction): void {
    for (let voice = 0; voice < VOICES; ++voice) {
        // startChordTick is onTime value of all simultaneous notes
        // chords here are consist of notes with equal durations
        // several chords may have the same onTime value
        let startChordTick = new ReducedFraction()
        const midiChords: MidiChord[] = []

        for (let it = this.chords.begin(); it !== this.chords.end();) {
            const nextChordTick = it.first
            const midiChord = it.second
            if (midiChord.voice !== voice) {
                it = it.next()
                continue
            }
            this.processPendingNotes(midiChords, voice, startChordTick, nextChordTick)
            // now 'midiChords' list is empty
            // so - fill it:
            // collect all midiChords on current tick position
            startChordTick = nextChordTick // debug
            for (; it !== this.chords.end(); it = it.next()) {
                const midiChord1 = it.second
                if (it.first.ne(startChordTick)) {
                    break
                }
                if (midiChord1.voice !== voice) {
                    continue
                }
                midiChords.push(midiChord1.clone())
            }
            if (midiChords.length === 0) {
                break
            }
        }
        // process last chords at the end of the score
        this.processPendingNotes(midiChords, voice, startChordTick, lastTick)
    }
}

function metaTimeSignature(e: MidiEvent): Fraction {
    const data = e.edata()
    const z = data[0]
    const nn = data[1]
    let n = 1
    for (let i = 0; i < nn; ++i) {
        n *= 2
    }
    return new Fraction(z, n)
}

function prepareTrackList(tracks: TrackMap): MTrack[] {
    const trackList: MTrack[] = []
    for (const track of tracks) {
        // show track even if all initial notes were cleaned up
        if (track.second.hadInitialNotes) {
            trackList.push(track.second.clone())
        }
    }
    return trackList
}

function createMTrackList(sigmap: TimeSigMap, mf: MidiFile): TrackMap {
    sigmap.clear()
    sigmap.addSig(0, new Fraction(4, 4)) // default time signature

    const tracks = newTrackMap() // <track index, track>
    let trackIndex = -1
    for (const t of mf.tracks()) {
        const track = new MTrack()
        track.mtrack = t
        track.division = mf.division()
        track.isDivisionInTps = mf.isDivisionInTps()
        let hasNotes = false
        //  - create time signature list from meta events
        //  - create MidiChord list
        //  - extract some information from track: program, min/max pitch
        for (const i of t.events()) {
            const e = i.event
            const tick = toMuseScoreTicks(i.tick, track.division, track.isDivisionInTps)
            // remove time signature events
            if ((e.type() === ME_META) && (e.metaType() === META_TIME_SIGNATURE)) {
                const ts = metaTimeSignature(e)
                if (!ts.isValid() || ts.le(new Fraction(0, 1))) {
                    console.warn(`skipping invalid time signature event from MIDI file at tick ${tick.ticks()}`)
                    continue
                }
                // because file can have incorrect data
                // like time sig event not at the beginning of bar
                // we need to round tick value to integral bar count
                const [bars] = sigmap.tickValues(tick.ticks())
                sigmap.addSig(sigmap.bar2tick(bars, 0), ts)
            } else if (e.type() === ME_NOTE) {
                hasNotes = true
                const pitch = e.pitch()
                const len = toMuseScoreTicks(e.len(), track.division, track.isDivisionInTps)
                const n = new MidiNote()
                n.pitch = pitch
                n.velo = e.velo()
                n.offTime = tick.plus(len)
                n.origOnTime = tick

                const c = new MidiChord()
                c.notes.push(n)

                track.chords.insert(tick, c)
            } else if (e.type() === ME_PROGRAM) {
                track.program = toGm1Program(e.dataB()) ?? GM1Program.AcousticGrandPiano
            } else if (e.type() === ME_CONTROLLER && e.controller() === CTRL_VOLUME) {
                track.volumes.insert(tick, e.value())
            }
        }
        if (hasNotes) {
            ++trackIndex
            track.hadInitialNotes = true
            const data = midiImportOperations.data()
            if (data.processingsOfOpenedFile > 0) {
                if (data.trackOpers.doImport.value(trackIndex)) {
                    track.indexOfOperation = trackIndex
                    const reorderedIndex = data.trackOpers.trackIndexAfterReorder.value(trackIndex)
                    tracks.insert(reorderedIndex, track)
                }
            } else { // if it is an initial track-list query from MIDI import panel
                track.indexOfOperation = trackIndex
                tracks.insert(trackIndex, track)
            }
        } else {
            track.hadInitialNotes = false // it's a tempo track or something else
            tracks.insert(-1, track)
        }
    }

    return tracks
}

function barFromIndex(score: Score, barIndex: number): Measure | null {
    const tick = score.sigmap().bar2tick(barIndex, 0)
    return score.tick2measure(Fraction.fromTicks(tick))
}

function isPickupWithLessTimeSig(firstBarTimeSig: Fraction, secondBarTimeSig: Fraction): boolean {
    return firstBarTimeSig.lt(secondBarTimeSig)
}

function isPickupWithGreaterTimeSig(firstBarTimeSig: Fraction, secondBarTimeSig: Fraction,
                                    firstTick: ReducedFraction): boolean {
    return firstBarTimeSig.eq(secondBarTimeSig.times(2))
           && firstBarTimeSig.numerator() % 3 !== 0
           && firstTick.gt(new ReducedFraction(0, 1))
}

// search for pickup measure only if next 3 bars have equal time signatures
function areNextBarsEqual(score: Score, barCount: number): boolean {
    const baseBarTick = score.sigmap().bar2tick(1, 0)
    const baseTimeSig = score.sigmap().timesig(baseBarTick).timesig()

    const equalTimeSigCount = 3
    for (let i = 2; i <= equalTimeSigCount - 1 && i < barCount; ++i) {
        const barTick = score.sigmap().bar2tick(i, 0)
        const timeSig = score.sigmap().timesig(barTick).timesig()
        if (timeSig.ne(baseTimeSig)) {
            return false
        }
    }
    return true
}

/** C++ tryCreatePickupMeasure(firstTick, score, int* begBarIndex, int* barCount): returns [begBarIndex, barCount] */
function tryCreatePickupMeasure(firstTick: ReducedFraction, score: Score, begBarIndex: number,
                                barCount: number): [number, number] {
    const firstBarTick = score.sigmap().bar2tick(0, 0)
    const secondBarTick = score.sigmap().bar2tick(1, 0)
    const firstTimeSig: Fraction = score.sigmap().timesig(firstBarTick).timesig()
    const secondTimeSig: Fraction = score.sigmap().timesig(secondBarTick).timesig()

    if (isPickupWithLessTimeSig(firstTimeSig, secondTimeSig)) {
        const pickup = new Measure(score.dummySystem())
        pickup.setTick(Fraction.fromTicks(firstBarTick))
        pickup.setNo(0)
        pickup.setIrregular(true)
        pickup.setTimesig(secondTimeSig) // nominal time signature
        pickup.setTicks(firstTimeSig) // actual length
        score.measures().append(pickup)
        begBarIndex = 1
    } else if (isPickupWithGreaterTimeSig(firstTimeSig, secondTimeSig, firstTick)) {
        // split measure into 2 equal measures
        // but for simplicity don't treat first bar as a pickup measure:
        // leave its actual length equal to nominal length
        ++barCount

        score.sigmap().addSig(firstBarTick, secondTimeSig)

        const firstBar = new Measure(score.dummySystem())
        firstBar.setTick(Fraction.fromTicks(firstBarTick))
        firstBar.setNo(0)
        firstBar.setTimesig(secondTimeSig)
        firstBar.setTicks(secondTimeSig)
        score.measures().append(firstBar)

        const secondBar = new Measure(score.dummySystem())
        secondBar.setTick(Fraction.fromTicks(firstBarTick + secondTimeSig.ticks()))
        secondBar.setNo(1)
        secondBar.setTimesig(secondTimeSig)
        secondBar.setTicks(secondTimeSig)
        score.measures().append(secondBar)

        begBarIndex = 2
    }
    return [begBarIndex, barCount]
}

/** C++ createMeasures(firstTick, ReducedFraction& lastTick, score): returns the new lastTick */
function createMeasures(firstTick: ReducedFraction, lastTick: ReducedFraction, score: Score): ReducedFraction {
    let [barCount, beat, tick] = score.sigmap().tickValues(lastTick.ticks())
    if (beat > 0 || tick > 0) {
        ++barCount // convert bar index to number of bars
    }
    const data = midiImportOperations.data()
    if (data.processingsOfOpenedFile === 0) {
        if (!areNextBarsEqual(score, barCount)) {
            data.trackOpers.searchPickupMeasure.setValue(false)
        }
    }

    const tryDetectPickupMeasure = data.trackOpers.searchPickupMeasure.value()
    let begBarIndex = 0

    if (tryDetectPickupMeasure && barCount > 1) {
        [begBarIndex, barCount] = tryCreatePickupMeasure(firstTick, score, begBarIndex, barCount)
    }

    for (let i = begBarIndex; i < barCount; ++i) {
        const m = new Measure(score.dummySystem())
        const t = score.sigmap().bar2tick(i, 0)
        m.setTick(Fraction.fromTicks(tick)) // sic (C++): the tick of the last tick's bar, fixed by setUpTempoMap
        m.setNo(i)
        const timeSig: Fraction = score.sigmap().timesig(t).timesig()
        m.setTimesig(timeSig)
        m.setTicks(timeSig)
        score.measures().append(m)
    }

    const m = score.lastMeasure()
    if (m) {
        score.setUpTempoMap()
        lastTick = ReducedFraction.fromFraction(m.endTick())
    }
    return lastTick
}

function setTrackInfo(mt: MTrack): void {
    const opers = midiImportOperations

    const currentTrack = mt.indexOfOperation
    const instrName = instrumentName(mt.program, mt.mtrack!.drumTrack())
    if (opers.data().processingsOfOpenedFile === 0) {
        opers.data().trackOpers.midiInstrName.setValue(currentTrack, instrName)
        // set channel number (from 1): number = index + 1
        opers.data().trackOpers.channel.setValue(currentTrack, mt.mtrack!.outChannel() + 1)
    }

    const msInstrName_ = msInstrName(currentTrack)
    const trackInstrName = (msInstrName_ === '') ? instrName : msInstrName_

    if (mt.staff!.isTop()) {
        const part = mt.staff!.part()!
        part.setLongName(XmlWriter.xmlString(concatenateWithComma(trackInstrName, mt.name)))
        part.setPartName(part.longName())
        part.setMidiChannel(mt.mtrack!.outChannel())
        let bank = 0
        if (mt.mtrack!.drumTrack()) {
            bank = 128
        }
        part.setMidiProgram(toMidiData(mt.program), bank)
    }

    if (mt.name === '' && trackInstrName !== '') {
        mt.name = trackInstrName
    }
}

function createTimeSignatures(score: Score): void {
    // Need to iterate over a copy, because adding a TimeSig modifies `score->sigmap()` (see TimeSig::added)
    const sigmap = [...score.sigmap().entries()]

    for (let is = 0; is < sigmap.length; ++is) {
        const se = sigmap[is][1]
        const tick = sigmap[is][0]
        const m = score.tick2measure(Fraction.fromTicks(tick))
        if (!m) {
            continue
        }
        let newTimeSig: Fraction = se.timesig()

        const opers = midiImportOperations
        const pickupMeasure = opers.data().trackOpers.searchPickupMeasure.value()

        if (pickupMeasure && is === 0) {
            const next = is + 1
            if (next < sigmap.length) {
                const mm = score.tick2measure(Fraction.fromTicks(sigmap[next][0]))
                if (m && mm && m === barFromIndex(score, 0) && mm === barFromIndex(score, 1)
                    && m.timesig().eq(mm.timesig()) && newTimeSig.ne(mm.timesig())) {
                    // it's a pickup measure - change timesig to nominal value
                    newTimeSig = mm.timesig()
                }
            }
        }
        for (let staffIdx = 0; staffIdx < score.nstaves(); ++staffIdx) {
            const seg = m.getSegment(SegmentType.TimeSig, Fraction.fromTicks(tick))
            const ts = new TimeSig(seg)
            ts.setSig(newTimeSig)
            ts.setTrack(staffIdx * VOICES)
            seg.add(ts)
        }
        if (newTimeSig.ne(se.timesig())) { // was a pickup measure - skip next timesig
            ++is
        }
    }
}

function processMeta(mt: MTrack, isLyric: boolean): void {
    for (const ie of mt.mtrack!.events()) {
        const e = ie.event
        const tick = toMuseScoreTicks(ie.tick, mt.division, mt.isDivisionInTps)
        if ((e.type() === ME_META) && ((e.metaType() === META_LYRIC) === isLyric)) {
            mt.processMeta(tick.ticks(), e)
        }
    }
}

// key list with key signatures of all tracks
//   to assign it to tracks without any specified key signature
function findAllKeyList(tracks: MTrack[]): KeyList {
    const kl = new KeyList()
    for (let i = 0; i < tracks.length; ++i) {
        if (tracks[i].hasKey) {
            for (const [tick, key] of tracks[i].staff!.keyList().entries()) {
                kl.setKey(tick, key)
            }
        }
    }
    return kl
}

function createNotes(lastTick: ReducedFraction, tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        mt.createNotes(lastTick)
        createTupletNotes(mt.staff!, mt.tuplets)
    }
}

function processNonLyricMeta(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        processMeta(mt, false)
    }
}

/** C++ setTrackInfo(QList<MTrack>&) */
function setTrackInfoList(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        setTrackInfo(mt)
    }
}

function processLyricMeta(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        processMeta(mt, true)
    }
}

function createKeys(tracks: MTrack[]): void {
    const defaultKey = Key.C // TODO-LIB findKey(mtrack, score->sigmap());
    const allKeyList = findAllKeyList(tracks)

    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        mt.createKeys(defaultKey, allKeyList)
    }
}

function applySwing(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]

        const opers = midiImportOperations.data().trackOpers
        const swingType = opers.swing.value(mt.indexOfOperation)
        detectSwing(mt.staff!, swingType)
    }
}

function createClefs(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]
        MidiClef_createClefs(mt.staff!, mt.indexOfOperation, mt.mtrack!.drumTrack())
    }
}

function setLeftRightHandSplit(tracks: TrackMap): void {
    for (let it = tracks.begin(); it !== tracks.end(); it = it.next()) {
        const trackIndex = it.first
        const mtrack = it.second
        if (mtrack.mtrack!.drumTrack() || mtrack.chords.empty()) {
            continue
        }

        // don't split staff if it is already in Grand Staff
        const nextIt = it.next()
        if (nextIt !== tracks.end()) {
            if (isGrandStaff(mtrack, nextIt.second)) {
                it = it.next()
                continue
            }
        }

        if (needToSplit(mtrack.chords, mtrack.program, mtrack.mtrack!.drumTrack())) {
            midiImportOperations.data().trackOpers.doStaffSplit.setValue(trackIndex, true)
        }
    }
}

function findFirstChordTick(tracks: MTrack[]): ReducedFraction {
    let firstTick = new ReducedFraction(0, 1)
    for (const track of tracks) {
        if (track.chords.empty()) {
            continue
        }
        const chordTick = track.chords.begin().first

        if (firstTick.eq(new ReducedFraction(0, 1)) || chordTick.lt(firstTick)) {
            firstTick = chordTick
        }
    }
    return firstTick
}

function findLastChordTick(tracks: TrackMap): ReducedFraction {
    let lastTick = new ReducedFraction(0, 1)
    for (const track of tracks) {
        for (const chord of track.second.chords) {
            const offTime = maxNoteOffTime(chord.second.notes)
            if (offTime.gt(lastTick)) {
                lastTick = offTime
            }
        }
    }
    return lastTick
}

export function convertMidi(score: Score, mf: MidiFile): MTrack[] {
    const sigmap = score.sigmap()

    const tracks = createMTrackList(sigmap, mf)

    const opers = midiImportOperations
    if (opers.data().processingsOfOpenedFile === 0) { // for newly opened MIDI file
        findChordNames(tracks)
    }

    lengthenTooShortNotes(tracks)

    if (opers.data().processingsOfOpenedFile === 0) { // for newly opened MIDI file
        opers.data().trackCount = 0
        for (const track of tracks) {
            if (track.first !== -1) {
                ++opers.data().trackCount
            }
        }
        extractLyricsToMidiData(mf)
    }
    // for newly opened MIDI file - detect if it is a human performance
    // if so - detect beats and set initial time signature
    if (opers.data().processingsOfOpenedFile === 0) {
        setIfHumanPerformance(tracks, sigmap)
    } else { // user value
        setTimeSignature(sigmap)
    }

    collectChords(tracks, new ReducedFraction(2, 1), new ReducedFraction(1, 2))
    adjustChordsToBeats(tracks)
    mergeChordsWithEqualOnTimeAndVoice(tracks)

    // for newly opened MIDI file
    if (opers.data().processingsOfOpenedFile === 0
        && opers.data().trackOpers.doStaffSplit.canRedefineDefaultLater()) {
        setLeftRightHandSplit(tracks)
    }

    removeOverlappingNotes(tracks)
    splitIntoLeftRightHands(tracks)
    splitDrumVoices(tracks)
    splitDrumTracks(tracks)
    let lastTick = findLastChordTick(tracks)
    quantizeAllTracks(tracks, sigmap, lastTick)
    removeOverlappingNotes(tracks)
    mergeChordsWithEqualOnTimeAndVoice(tracks)
    simplifyDurationsNotDrums(tracks, sigmap)
    if (separateVoices(tracks, sigmap)) {
        simplifyDurationsNotDrums(tracks, sigmap) // again
    }
    simplifyDurationsForDrums(tracks, sigmap)
    splitUnequalChords(tracks)
    // no more track insertion/reordering/deletion from now
    const trackList = prepareTrackList(tracks)
    setGrandStaffProgram(trackList)
    findInstrumentsForAllTracks(trackList)
    createInstruments(score, trackList)
    setStaffBracketForDrums(trackList)

    const firstTick = findFirstChordTick(trackList)

    lastTick = createMeasures(firstTick, lastTick, score)
    processNonLyricMeta(trackList)
    setTrackInfoList(trackList)
    createKeys(trackList)
    recognizeMainKeySig(trackList)
    createNotes(lastTick, trackList)
    processLyricMeta(trackList)
    applySwing(trackList)
    createClefs(trackList)
    createTimeSignatures(score)
    score.connectTies()

    setLyricsToScore(trackList)
    setTempo(tracks, score)
    setChordNames(trackList)

    return trackList
}

function loadMidiData(mf: MidiFile): void {
    mf.separateChannel()
    for (const track of mf.tracks()) {
        track.mergeNoteOnOff()
    }
}

/** the text of the last failed import (C++ shows it in a message box: "Import failed: %1") */
export let lastMidiImportError = ''

/**
 * C++ importMidi(MasterScore*, const QString& name): `data` are the bytes of the file `name`. If the operations of
 * the file name were already set (midiImportOperations.addNewMidiFile, e.g. by the tests) they are used.
 */
export function importMidi(score: MasterScore, data: Uint8Array, name: string): Err {
    if (name === '') {
        return Err.FileNotFound
    }

    const opers = midiImportOperations

    const setCurrentMidiFile = new CurrentMidiFileSetter(opers, name)
    try {
        if (!opers.hasMidiFile(name)) {
            opers.addNewMidiFile(name)
        }

        // C++ also reloads the file if it was modified on disk since the last import
        const needsReload = opers.data().processingsOfOpenedFile === 0

        if (needsReload) {
            const mf = new MidiFile()
            try {
                mf.read(data)
            } catch (e) {
                if (e instanceof MidiFileError) {
                    lastMidiImportError = e.message
                    return Err.FileBadFormat
                }
                throw e
            }

            loadMidiData(mf)
            opers.setMidiFileData(name, mf)
        }

        opers.data().tracks = convertMidi(score, opers.midiFile(name)!)
        ++opers.data().processingsOfOpenedFile

        return Err.NoError
    } finally {
        setCurrentMidiFile.restore()
    }
}
