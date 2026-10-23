/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_lyrics.h/.cpp (namespace MidiLyrics)
 *
 * The lyric fragments (C++ std::string) are binary strings, see MidiCharset in importmidi_inner.ts.
 */

import { StdMultimap, StdSet } from '../../../../framework/global/stdmap'
import { ME_META, META_LYRIC, META_TEXT } from '../../../../engraving/compat/midi/midicoreevent'
import { VBox } from '../../../../engraving/dom/box'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import { Lyrics } from '../../../../engraving/dom/lyrics'
import type { MeasureBase } from '../../../../engraving/dom/measurebase'
import type { Score } from '../../../../engraving/dom/score'
import { SegmentType } from '../../../../engraving/dom/segment'
import type { Staff } from '../../../../engraving/dom/staff'
import { Text } from '../../../../engraving/dom/text'
import { Fraction } from '../../../../engraving/types/fraction'
import { TextStyleType, VOICES } from '../../../../engraving/types/types'
import type { MidiEvent } from '../midishared/midievent'
import type { MidiFile, MidiTrack } from '../midishared/midifile'
import type { ChordMap } from './importmidi_chord'
import { ReducedFraction, compareReducedFractions, toMuseScoreTicks } from './importmidi_fraction'
import { type FractionPair, type MTrack, convertToCharset, fromUchar } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'

const META_PREFIX = '@'
const TEXT_PREFIX = '@T'

type LyricTrack = StdMultimap<ReducedFraction, string>

function isMetaText(text: string): boolean {
    return text.substring(0, META_PREFIX.length) === META_PREFIX
}

function isLyricText(text: string): boolean {
    return !isMetaText(text) || text.substring(0, TEXT_PREFIX.length) === TEXT_PREFIX
}

function isLyricEvent(e: MidiEvent): boolean {
    return e.type() === ME_META && (e.metaType() === META_TEXT || e.metaType() === META_LYRIC)
}

function extractLyricsFromTrack(track: MidiTrack, division: number, isDivisionInTps: boolean): LyricTrack {
    const lyrics: LyricTrack = new StdMultimap<ReducedFraction, string>(compareReducedFractions)

    for (const i of track.events()) {
        const e = i.event
        if (isLyricEvent(e)) {
            let text = fromUchar(e.edata())
            text = text.replace(/ +$/, '') // text.erase(text.find_last_not_of(' ') + 1)
            if (isLyricText(text)) {
                const tick = toMuseScoreTicks(i.tick, division, isDivisionInTps)
                // no charset handling here
                lyrics.insert(tick, text)
            }
        }
    }
    return lyrics
}

interface BestTrack {
    index: number
    // <orig time, current time - after quantization>
    matchedLyricTimes: FractionPair[]
}

// find track to insert lyrics
// it will be the track with max onTime match cases, except drum tracks

function findBestTrack(tracks: readonly MTrack[], lyricTrack: LyricTrack, usedTracks: StdSet<number>): BestTrack {
    const bestTrack: BestTrack = { index: -1, matchedLyricTimes: [] }
    let maxMatches = 0
    for (let i = 0; i !== tracks.length; ++i) {
        if (tracks[i].mtrack!.drumTrack() || usedTracks.contains(i)) {
            continue
        }
        // due to staff split there can be equal indexes of operation
        if (i > 0 && tracks[i].indexOfOperation === tracks[i - 1].indexOfOperation) {
            continue
        }

        let matches = 0
        for (const chord of tracks[i].chords) {
            for (const note of chord.second.notes) {
                if (lyricTrack.find(note.origOnTime) !== lyricTrack.end()) {
                    ++matches
                    bestTrack.matchedLyricTimes.push([chord.first, note.origOnTime])
                    break
                }
            }
        }
        if (matches > maxMatches) {
            maxMatches = matches
            bestTrack.index = tracks[i].indexOfOperation
        }
    }

    return bestTrack
}

function isTitlePrefix(text: string): boolean {
    return text.substring(0, TEXT_PREFIX.length) === TEXT_PREFIX
}

function addTitleToScore(score: Score, string: string, textCounter: number): void {
    let ssid = TextStyleType.DEFAULT
    if (textCounter === 1) {
        ssid = TextStyleType.TITLE
    } else if (textCounter === 2) {
        ssid = TextStyleType.COMPOSER
    }

    let measure: MeasureBase = score.first()!
    const text = new Text(measure, ssid) // Factory::createText(measure, ssid)
    text.setPlainText(string.slice(TEXT_PREFIX.length))

    if (!measure.isVBox()) {
        measure = new VBox(score.dummySystem()) // Factory::createVBox(score->dummy()->system())
        measure.setTick(new Fraction(0, 1))
        measure.setNext(score.first())
        score.measures().add(measure)
    }
    measure.add(text)
}

// remove slashes in kar format

export function removeSlashes(text: string): string {
    return text.replace(/[/\\]/g, '')
}

function addTitleIfAny(lyricTrack: LyricTrack, score: Score): void {
    let textCounter = 0
    for (const lyric of lyricTrack) {
        if (lyric.first.eq(new ReducedFraction(0, 1))) {
            const text = convertToCharset(lyric.second)
            if (isTitlePrefix(text)) {
                ++textCounter
                addTitleToScore(score, text, textCounter)
            }
        } else if (lyric.first.gt(new ReducedFraction(0, 1))) {
            break
        }
    }
}

/** QString::toHtmlEscaped */
function toHtmlEscaped(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** C++ Score::addLyrics(const Fraction& tick, staff_idx_t staffIdx, const String& txt) */
function addLyrics(score: Score, tick: Fraction, staffIdx: number, txt: string): void {
    if (txt.trim().length === 0) {
        return
    }
    const measure = score.tick2measure(tick)!
    const seg = measure.findSegment(SegmentType.ChordRest, tick)
    if (!seg) {
        return
    }

    for (let voice = 0; voice < VOICES; ++voice) {
        const track = staffIdx * VOICES + voice
        const cr = seg.element(track) as ChordRest | null
        if (cr) {
            const l = new Lyrics(cr) // Factory::createLyrics(cr)
            l.setXmlText(txt)
            l.setTrack(track)
            cr.add(l)
            break
        }
    }
}

function addLyricsToScore(lyricTrack: LyricTrack, matchedLyricTimes: readonly FractionPair[], staffAddTo: Staff): void {
    const score = staffAddTo.score()

    addTitleIfAny(lyricTrack, score)

    for (const timePair of matchedLyricTimes) {
        const quantizedTime = timePair[0]
        const originalTime = timePair[1]
        const it = lyricTrack.find(originalTime)

        const text = convertToCharset(it.second)
        if (originalTime.ne(new ReducedFraction(0, 1)) || !isTitlePrefix(text)) { // not title
            addLyrics(score, quantizedTime.fraction(), staffAddTo.idx(), toHtmlEscaped(removeSlashes(text)))
        }
    }
}

export function extractLyricsToMidiData(mf: MidiFile): void {
    for (const t of mf.tracks()) {
        const lyrics = extractLyricsFromTrack(t, mf.division(), mf.isDivisionInTps())
        if (!lyrics.empty()) {
            midiImportOperations.data().lyricTracks.push(lyrics)
        }
    }
}

function setInitialLyricsFromMidiData(tracks: readonly MTrack[]): void {
    const usedTracks = new StdSet<number>()
    const data = midiImportOperations.data()
    const lyricTracks = data.lyricTracks
    if (lyricTracks.length === 0) {
        return
    }

    for (let i = 0; i !== lyricTracks.length; ++i) {
        const bestTrack = findBestTrack(tracks, lyricTracks[i], usedTracks)
        if (bestTrack.index >= 0) {
            usedTracks.insert(bestTrack.index)
            addLyricsToScore(lyricTracks[i], bestTrack.matchedLyricTimes, tracks[bestTrack.index].staff!)
            data.trackOpers.lyricTrackIndex.setValue(bestTrack.index, i)
        }
    }
}

function findMatchedLyricTimes(chords: ChordMap, lyricTrack: LyricTrack): FractionPair[] {
    // <chord quantized on time, chord original on time>
    const matchedLyricTimes: FractionPair[] = []

    for (const chord of chords) {
        for (const note of chord.second.notes) {
            if (lyricTrack.find(note.origOnTime) !== lyricTrack.end()) {
                matchedLyricTimes.push([chord.first, note.origOnTime])
                break
            }
        }
    }
    return matchedLyricTimes
}

function setLyricsFromOperations(tracks: readonly MTrack[]): void {
    const lyricTracks = midiImportOperations.data().lyricTracks
    if (lyricTracks.length === 0) {
        return
    }
    for (const track of tracks) {
        const opers = midiImportOperations.data().trackOpers
        const lyricTrackIndex = opers.lyricTrackIndex.value(track.indexOfOperation)
        if (lyricTrackIndex >= 0 && lyricTrackIndex < lyricTracks.length) {
            const lyricTrack = lyricTracks[lyricTrackIndex]
            const matchedLyricTimes = findMatchedLyricTimes(track.chords, lyricTrack)

            addLyricsToScore(lyricTrack, matchedLyricTimes, track.staff!)
        }
    }
}

export function setLyricsToScore(tracks: MTrack[]): void {
    const data = midiImportOperations.data()
    if (data.processingsOfOpenedFile === 0) {
        setInitialLyricsFromMidiData(tracks)
    } else {
        setLyricsFromOperations(tracks)
    }
}

/** the lyric texts of the import panel (binary strings like C++ std::string) */
export function makeLyricsListForUI(): string[] {
    const list: string[] = []
    const lyrics = midiImportOperations.data().lyricTracks
    if (lyrics.length === 0) {
        return list
    }

    const symbolLimit = 16

    for (const trackLyric of lyrics) {
        let lyricText = ''

        for (const lyric of trackLyric) {
            const text = removeSlashes(lyric.second)
            if (isMetaText(text)) {
                continue
            }
            if (lyricText.length > 0) {
                lyricText += ' ' // visual text delimiter
            }
            if (lyricText.length + text.length > symbolLimit) {
                lyricText += text.substring(0, symbolLimit - lyricText.length)
            } else {
                lyricText += text
            }
            if (lyricText.length >= symbolLimit - 1) {
                lyricText += '…'
                break
            }
        }
        list.push(lyricText)
    }
    return list
}
