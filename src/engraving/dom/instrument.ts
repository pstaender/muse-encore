/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrument.h/.cpp (only what is needed for engraving:
 * names, clefs, transposition; of the MIDI data only what identifies the instrument)
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { ClefType } from '../types/types'
import { ClefTypeList } from './clefinfo'
import { Interval } from './interval'
import { StringData } from './stringdata'
import { type Drumset, smDrumset } from './drumset'
import { instrumentGroups, searchTemplate, searchTemplateForInstrNameList, searchTemplateForMidiProgram } from './instrtemplate'

export class StaffName {
    constructor(private m_name = '', private m_pos = 0) {} // html string; even number -> between staves

    name(): string { return this.m_name }
    setName(n: string): void { this.m_name = n }
    pos(): number { return this.m_pos }
    setPos(p: number): void { this.m_pos = p }

    toPlainText(): string {
        return this.m_name.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    }
}

export type StaffNameList = StaffName[]

/** InstrChannel: only name, bank and program (used to recognize the instrument of old scores); no playback data */
export class InstrChannel {
    static readonly DEFAULT_NAME = 'normal'

    private m_name = ''
    private m_program = -1
    private m_bank = 0

    name(): string { return this.m_name }
    setName(n: string): void { this.m_name = n }
    program(): number { return this.m_program }
    setProgram(v: number): void { this.m_program = v }
    bank(): number { return this.m_bank }
    setBank(v: number): void { this.m_bank = v }
    clone(): InstrChannel { return Object.assign(new InstrChannel(), this) }
}

export class Instrument {
    private m_longNames: StaffNameList = []
    private m_shortNames: StaffNameList = []
    private m_trackName = ''
    private m_transpose = new Interval()
    private m_useDrumset = false
    private m_clefType: ClefTypeList[] = []
    private m_minPitchA = 0
    private m_maxPitchA = 127
    private m_minPitchP = 0
    private m_maxPitchP = 127
    private m_instrumentId = ''
    private m_musicXmlId = ''
    private m_soundId = ''
    private m_drumset: Drumset | null = null
    private m_channel: InstrChannel[] = []
    // TODO(port): articulations, MIDI actions
    private m_stringData = new StringData()

    constructor(private m_id = '') {}

    /** C++ Instrument::operator=() / copy constructor */
    assign(i: Instrument): void {
        Object.assign(this, i)
        this.m_longNames = [...i.m_longNames]
        this.m_shortNames = [...i.m_shortNames]
        this.m_transpose = i.m_transpose.clone()
        this.m_clefType = i.m_clefType.map(c => c.clone())
        this.m_drumset = i.m_drumset ? i.m_drumset.clone() : null
        this.m_channel = i.m_channel.map(c => c.clone())
    }

    channel(idx: number): InstrChannel | null { return this.m_channel[idx] ?? null }
    appendChannel(c: InstrChannel): void { this.m_channel.push(c) }

    channelIdx(s: string): number {
        let idx = 0
        for (const a of this.m_channel) {
            if (!a.name() && s === InstrChannel.DEFAULT_NAME) {
                return idx
            }
            if (s === a.name()) {
                return idx
            }
            ++idx
        }
        return -1
    }

    /** Return a MusicXML "Sound ID", which is essentially an instrument ID */
    recognizeMusicXmlId(): string {
        // See https://github.com/w3c/musicxml/blob/gh-pages/schema/sounds.xml
        const defaultMusicXmlId = 'keyboard.piano'
        const defaultMusicXmlPercussionId = 'drum.group' // our General MIDI Percussion

        const nameList = [this.m_trackName, ...this.m_longNames.map(n => n.name()), ...this.m_shortNames.map(n => n.name())]
        const tmplByName = searchTemplateForInstrNameList(nameList, this.m_useDrumset)
        if (tmplByName && tmplByName.musicXmlId) {
            return tmplByName.musicXmlId
        }

        const channel = this.channel(0)
        if (!channel) {
            return defaultMusicXmlId
        }

        const tmplMidiProgram = searchTemplateForMidiProgram(channel.bank(), channel.program(), this.m_useDrumset)
        if (tmplMidiProgram && tmplMidiProgram.musicXmlId) {
            return tmplMidiProgram.musicXmlId
        }

        return this.m_useDrumset ? defaultMusicXmlPercussionId : defaultMusicXmlId
    }

    /**
     * When reading a score created with pre-3.6, MuseScore's instrument ID isn't saved in the score file, so we must
     * try to guess the ID based on the MusicXML ID, which is saved. However, MusicXML IDs are not unique, so we must
     * also consider other data to find the best match, preferring more generic instruments when there's a tie.
     */
    recognizeId(): string {
        // In these cases, the best and/or most generic match is already known,
        // and we don't want to risk returning something else.
        if (this.m_musicXmlId === 'drum.group') {
            return 'percussion-synthesizer' // General MIDI Percussion (most generic kit)
        } else if (this.m_musicXmlId === 'drum.group.set') {
            return 'drumset' // Large Drum Kit (most generic drum kit)
        } else if (this.m_musicXmlId.startsWith('mdl.')) {
            // Use fixed mapping for MDL1 instruments to ensure we get the
            // marching versions (e.g. "marching-snare" and not "snare-drum").
            switch (this.m_musicXmlId) {
            case 'mdl.drum.snare-drum': return 'marching-snare'
            case 'mdl.drum.tenor-drum': return 'marching-tenor-drums'
            case 'mdl.drum.bass-drum': return 'marching-bass-drums'
            case 'mdl.metal.cymbal.crash': return 'marching-cymbals'
            case 'mdl.drum.group.set': return 'drumset'
            default: break
            }
        }

        // Several instruments have MusicXML ID "strings.group". Let's use the
        // value of controller 32 of the "arco" channel to distinguish them.
        const arco = 'arco'
        const groupHack = this.m_musicXmlId === 'strings.group'
        const idxref = this.channelIdx(arco)
        const val32ref = idxref < 0 ? -1 : this.channel(idxref)!.bank()

        // For other instruments, consider how closely the instrument data
        // matches each of our templates. Use the ID that gives the best match.
        let fallback = '' // ID that gave the best match so far
        let bestMatchStrength = 0 // higher when ID is a better match

        for (const g of instrumentGroups()) {
            for (const it of g) {
                if (it.musicXmlId !== this.m_musicXmlId) {
                    continue
                }
                if (groupHack) {
                    if (!fallback) {
                        // Instrument "Strings" doesn't have bank defined so
                        // if no "strings.group" instrument with requested bank
                        // is found, assume "Strings".
                        fallback = it.id
                    }
                    for (const chan of it.channel) {
                        if (chan.name === arco && chan.bank === val32ref) {
                            return it.id
                        }
                    }
                } else {
                    const matchStrength = 0
                        + (this.minPitchP() === it.minPitchP ? 1 : 0)
                        + (this.minPitchA() === it.minPitchA ? 1 : 0)
                        + (this.maxPitchA() === it.maxPitchA ? 1 : 0)
                        + (this.maxPitchP() === it.maxPitchP ? 1 : 0)
                    const perfectMatchStrength = 4
                    if (!fallback || matchStrength > bestMatchStrength) {
                        // Set a fallback ID or update it because we've found a better one.
                        fallback = it.id
                        bestMatchStrength = matchStrength
                        if (bestMatchStrength === perfectMatchStrength) {
                            break // stop looking for matches (in this group)
                        }
                    } else if (matchStrength === bestMatchStrength && it.id.length < fallback.length) {
                        // Update fallback ID because we've found a shorter one that is equally good.
                        // Shorter IDs tend to correspond to more generic instruments (e.g. "piano"
                        // vs. "grand-piano") so it's better to use a shorter one if unsure.
                        fallback = it.id
                    }
                }
            }
        }

        if (fallback) {
            return fallback
        }

        return this.m_useDrumset
            ? 'percussion-synthesizer' // General MIDI Percussion (most generic kit)
            : 'piano'
    }

    updateInstrumentId(): void {
        if (!this.m_musicXmlId) {
            this.m_musicXmlId = this.recognizeMusicXmlId()
        }
        if (!this.m_id) {
            this.m_id = this.recognizeId()
        }
    }

    id(): string { return this.m_id }
    stringData(): StringData { return this.m_stringData }
    hasStrings(): boolean { return this.m_stringData.strings() > 0 }
    setId(id: string): void { this.m_id = id }
    instrumentId(): string { return this.m_instrumentId }
    setInstrumentId(id: string): void { this.m_instrumentId = id }

    longNames(): StaffNameList { return this.m_longNames }
    shortNames(): StaffNameList { return this.m_shortNames }
    setLongNames(l: StaffNameList): void { this.m_longNames = l }
    setShortNames(l: StaffNameList): void { this.m_shortNames = l }

    setLongName(f: string): void {
        this.m_longNames = []
        if (f.length) {
            this.m_longNames.push(new StaffName(f, 0))
        }
    }

    setShortName(f: string): void {
        this.m_shortNames = []
        if (f.length) {
            this.m_shortNames.push(new StaffName(f, 0))
        }
    }

    appendLongName(n: StaffName): void { this.m_longNames.push(n) }
    appendShortName(n: StaffName): void { this.m_shortNames.push(n) }

    musicXmlId(): string { return this.m_musicXmlId }
    setMusicXmlId(id: string): void { this.m_musicXmlId = id }
    soundId(): string { return this.m_soundId }
    setSoundId(id: string): void { this.m_soundId = id }

    trackName(): string { return this.m_trackName }
    setTrackName(s: string): void { this.m_trackName = s }

    transpose(): Interval { return this.m_transpose }
    setTranspose(v: Interval): void { this.m_transpose = v }

    useDrumset(): boolean { return this.m_useDrumset }
    setUseDrumset(val: boolean): void {
        this.m_useDrumset = val
        if (val && !this.m_drumset) {
            this.m_drumset = smDrumset().clone()
        }
    }

    drumset(): Drumset | null { return this.m_drumset }

    /** the family of the instrument template (instruments.xml) */
    family(): string {
        return searchTemplate(this.m_id)?.familyId ?? ''
    }

    isVocalInstrument(): boolean {
        const instrumentFamily = this.family()
        return instrumentFamily === 'voices' || instrumentFamily === 'voice-groups'
    }

    isNormallyMultiStaveInstrument(): boolean {
        const instrumentFamily = this.family()
        return instrumentFamily === 'keyboards'
               || instrumentFamily === 'organs'
               || instrumentFamily === 'keyboard-percussion'
               || instrumentFamily === 'harps'
               || instrumentFamily === 'accordions'
    }

    setDrumset(ds: Drumset | null): void {
        if (ds) {
            this.m_useDrumset = true
            this.m_drumset = ds.clone()
        } else {
            this.m_useDrumset = false
            this.m_drumset = null
        }
    }

    clefType(staffIdx: number): ClefTypeList {
        if (staffIdx >= this.m_clefType.length) {
            if (this.m_clefType.length === 0) {
                return new ClefTypeList()
            }
            return this.m_clefType[0]
        }
        return this.m_clefType[staffIdx]
    }

    setClefType(staffIdx: number, c: ClefTypeList): void {
        while (this.m_clefType.length <= staffIdx) {
            this.m_clefType.push(new ClefTypeList(ClefType.INVALID))
        }
        this.m_clefType[staffIdx] = c
    }

    minPitchA(): number { return this.m_minPitchA }
    maxPitchA(): number { return this.m_maxPitchA }
    minPitchP(): number { return this.m_minPitchP }
    maxPitchP(): number { return this.m_maxPitchP }
    setMinPitchA(v: number): void { this.m_minPitchA = v }
    setMaxPitchA(v: number): void { this.m_maxPitchA = v }
    setMinPitchP(v: number): void { this.m_minPitchP = v }
    setMaxPitchP(v: number): void { this.m_maxPitchP = v }
}

const defaultInstrument = new Instrument()

export class InstrumentList extends SortedMap<Instrument> {
    instrument(tick: number): Instrument {
        if (this.empty()) {
            return defaultInstrument
        }
        let i = this.upperBound(tick)
        if (i === 0) {
            return defaultInstrument
        }
        --i
        return this.valueAt(i)
    }

    setInstrument(instr: Instrument, tick: number): void {
        this.set(tick, instr)
    }
}
