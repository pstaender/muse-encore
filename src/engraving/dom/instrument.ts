/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrument.h/.cpp (only what is needed for engraving and for reading/writing files:
 * names, clefs, transposition, the MIDI data of the channels; no playback state)
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { ClefType, GlissandoStyle } from '../types/types'
import { ClefTypeList } from './clefinfo'
import { CTRL_CHORUS_SEND, CTRL_HBANK, CTRL_LBANK, CTRL_PANPOT, CTRL_PROGRAM, CTRL_REVERB_SEND, CTRL_VOLUME, ME_CONTROLLER, MidiCoreEvent } from '../compat/midi/midicoreevent'
import { Interval } from './interval'
import { StringData } from './stringdata'
import { type Drumset, smDrumset } from './drumset'
import {
    instrumentGroups, searchTemplate, searchTemplateForInstrNameList, searchTemplateForMidiProgram, type InstrumentTemplate,
} from './instrtemplate'

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

export enum TraitType {
    Unknown,
    Tuning,
    Transposition,
    Course,
}

export class Trait {
    name = ''
    type = TraitType.Unknown
    isDefault = false
    isHiddenOnScore = false

    isValid(): boolean { return this.name.length > 0 }
    clone(): Trait { return Object.assign(new Trait(), this) }
}

export interface NamedEventList {
    name: string
    descr: string
    events: MidiCoreEvent[]
}

export interface MidiArticulation {
    name: string
    descr: string
    velocity: number // velocity change: -100% - +100%
    gateTime: number // gate time change: -100% - +100%
}

/** C++ InstrChannel (without playback state: mute/solo, notifications) */
export class InstrChannel {
    static readonly DEFAULT_NAME = 'normal'
    static readonly HARMONY_NAME = 'harmony'
    static readonly PALM_MUTE_NAME = 'palmmute'
    static readonly DEFAULT_COLOR = 0x3399ff
    static readonly defaultVolume = 100

    // the indices of the init list (C++ enum class A)
    static readonly A_HBANK = 0
    static readonly A_LBANK = 1
    static readonly A_PROGRAM = 2
    static readonly A_VOLUME = 3
    static readonly A_PAN = 4
    static readonly A_CHORUS = 5
    static readonly A_REVERB = 6
    static readonly A_INIT_COUNT = 7

    private m_name = ''
    private m_program = -1
    private m_bank = 0
    private m_synti = 'Fluid' // default synthesizer
    private m_color = InstrChannel.DEFAULT_COLOR
    private m_volume = InstrChannel.defaultVolume
    private m_pan = 64 // actually 63.5 for center
    private m_chorus = 0
    private m_reverb = 0
    private m_userBankController = false
    private m_init: MidiCoreEvent[] = Array.from({ length: InstrChannel.A_INIT_COUNT }, () => new MidiCoreEvent())
    private m_mustUpdateInit = true
    private m_channel = -1 // mscore channel number, mapped to midi port/channel

    midiActions: NamedEventList[] = []
    articulation: MidiArticulation[] = []

    name(): string { return this.m_name }
    setName(n: string): void { this.m_name = n }
    channel(): number { return this.m_channel }
    setChannel(v: number): void { this.m_channel = v }
    program(): number { return this.m_program }
    setProgram(v: number): void {
        this.m_program = v
        this.m_mustUpdateInit = true
    }
    bank(): number { return this.m_bank }
    setBank(v: number): void {
        this.m_bank = v
        this.m_mustUpdateInit = true
    }
    synti(): string { return this.m_synti }
    setSynti(v: string): void { this.m_synti = v }
    color(): number { return this.m_color }
    setColor(v: number): void { this.m_color = v }
    volume(): number { return this.m_volume }
    setVolume(v: number): void {
        this.m_volume = v
        this.m_mustUpdateInit = true
    }
    pan(): number { return this.m_pan }
    setPan(v: number): void {
        this.m_pan = v
        this.m_mustUpdateInit = true
    }
    chorus(): number { return this.m_chorus }
    setChorus(v: number): void {
        this.m_chorus = v
        this.m_mustUpdateInit = true
    }
    reverb(): number { return this.m_reverb }
    setReverb(v: number): void {
        this.m_reverb = v
        this.m_mustUpdateInit = true
    }
    userBankController(): boolean { return this.m_userBankController }
    setUserBankController(v: boolean): void { this.m_userBankController = v }
    setMustUpdateInit(v: boolean): void { this.m_mustUpdateInit = v }

    addToInit(e: MidiCoreEvent): void { this.m_init.push(e) }

    initList(): readonly MidiCoreEvent[] {
        if (this.m_mustUpdateInit) {
            this.updateInitList()
            this.m_mustUpdateInit = false
        }
        return this.m_init
    }

    private updateInitList(): void {
        if (this.m_program !== -1) {
            this.m_init[InstrChannel.A_PROGRAM] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_PROGRAM, this.m_program)
        }
        this.m_init[InstrChannel.A_HBANK] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_HBANK, (this.m_bank >> 7) & 0x7f)
        this.m_init[InstrChannel.A_LBANK] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_LBANK, this.m_bank & 0x7f)
        this.m_init[InstrChannel.A_VOLUME] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_VOLUME, this.m_volume)
        this.m_init[InstrChannel.A_PAN] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_PANPOT, this.m_pan)
        this.m_init[InstrChannel.A_CHORUS] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_CHORUS_SEND, this.m_chorus)
        this.m_init[InstrChannel.A_REVERB] = new MidiCoreEvent(ME_CONTROLLER, 0, CTRL_REVERB_SEND, this.m_reverb)
    }

    clone(): InstrChannel {
        const c = Object.assign(new InstrChannel(), this)
        c.m_init = this.m_init.map(e => e.clone())
        c.midiActions = this.midiActions.map(a => ({ ...a, events: a.events.map(e => e.clone()) }))
        c.articulation = this.articulation.map(a => ({ ...a }))
        return c
    }
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
    private m_midiActions: NamedEventList[] = []
    private m_articulation: MidiArticulation[] = []
    private m_stringData = new StringData()
    private m_singleNoteDynamics = true
    private m_trait = new Trait()
    private m_glissandoStyle = GlissandoStyle.CHROMATIC

    constructor(private m_id = '') {}

    static fromTemplate(templ: InstrumentTemplate): Instrument {
        const instrument = new Instrument(templ.id)
        instrument.setSoundId(templ.soundId)
        instrument.setAmateurPitchRange(templ.minPitchA, templ.maxPitchA)
        instrument.setProfessionalPitchRange(templ.minPitchP, templ.maxPitchP)

        for (const sn of templ.longNames) {
            instrument.addLongName(new StaffName(sn.name(), sn.pos()))
        }

        for (const sn of templ.shortNames) {
            instrument.addShortName(new StaffName(sn.name(), sn.pos()))
        }

        instrument.setTrackName(templ.trackName)
        instrument.setTranspose(templ.transpose.clone())
        instrument.setMusicXmlId(templ.musicXmlId)
        instrument.m_useDrumset = templ.useDrumset

        if (templ.useDrumset) {
            instrument.setDrumset(templ.drumset ? templ.drumset : smDrumset())
        }

        for (let i = 0; i < templ.staffCount; ++i) {
            instrument.setClefType(i, templ.clefTypes[i].clone())
        }

        // TODO(port): MIDI actions (the templates have none)
        instrument.m_articulation = templ.midiArticulations.map(a => ({ ...a }))
        instrument.m_channel = []

        for (const c of templ.channel) {
            const ch = new InstrChannel()
            ch.setName(c.name)
            ch.setBank(c.bank)
            ch.setProgram(c.program)
            instrument.m_channel.push(ch)
        }

        if (instrument.m_channel.length === 0) {
            const fallbackChannel = new InstrChannel()
            fallbackChannel.setName(InstrChannel.DEFAULT_NAME)
            fallbackChannel.setProgram(instrument.recognizeMidiProgram())
            instrument.m_channel.push(fallbackChannel)
        }

        instrument.setStringData(templ.stringData.clone())
        instrument.setSingleNoteDynamics(templ.singleNoteDynamics)
        instrument.setTrait(templ.trait.clone())
        instrument.m_glissandoStyle = templ.glissandoStyle

        return instrument
    }

    /** C++ Instrument::operator=() / copy constructor */
    assign(i: Instrument): void {
        Object.assign(this, i)
        this.m_longNames = [...i.m_longNames]
        this.m_shortNames = [...i.m_shortNames]
        this.m_transpose = i.m_transpose.clone()
        this.m_clefType = i.m_clefType.map(c => c.clone())
        this.m_drumset = i.m_drumset ? i.m_drumset.clone() : null
        this.m_channel = i.m_channel.map(c => c.clone())
        this.m_midiActions = i.m_midiActions.map(a => ({ ...a, events: a.events.map(e => e.clone()) }))
        this.m_articulation = i.m_articulation.map(a => ({ ...a }))
        this.m_stringData = i.m_stringData.clone()
        this.m_trait = i.m_trait.clone()
    }

    cleffTypeCount(): number { return this.m_clefType.length }

    recognizeMidiProgram(): number {
        const tp = searchTemplate(this.m_id)
        if (tp && tp.channel.length && tp.channel[0].program >= 0) {
            return tp.channel[0].program
        }
        return 0
    }

    channel(idx: number): InstrChannel | null { return this.m_channel[idx] ?? null }
    /** C++ channel() (the list) */
    channels(): readonly InstrChannel[] { return this.m_channel }
    appendChannel(c: InstrChannel): void { this.m_channel.push(c) }
    clearChannels(): void { this.m_channel = [] }
    removeChannel(c: InstrChannel): void {
        const i = this.m_channel.indexOf(c)
        if (i >= 0) {
            this.m_channel.splice(i, 1)
        }
    }

    midiActions(): readonly NamedEventList[] { return this.m_midiActions }
    addMidiAction(a: NamedEventList): void { this.m_midiActions.push(a) }
    articulation(): readonly MidiArticulation[] { return this.m_articulation }
    addMidiArticulation(a: MidiArticulation): void { this.m_articulation.push(a) }

    midiAction(s: string, channelIdx: number): NamedEventList | null {
        // first look in channel list
        for (const a of this.m_channel[channelIdx].midiActions) {
            if (s === a.name) {
                return a
            }
        }

        for (const a of this.m_midiActions) {
            if (s === a.name) {
                return a
            }
        }
        return null
    }

    getVelocityMultiplier(name: string): number {
        for (const a of this.m_articulation) {
            if (a.name === name) {
                return a.velocity / 100
            }
        }
        return 1
    }

    /** C++ Instrument::updateGateTime(int* gateTime, name): returns the new gate time */
    updateGateTime(gateTime: number, name: string): number {
        for (const a of this.m_articulation) {
            if (a.name === name) {
                // Imagine ["staccato", "accent"] articulations
                // accent will override the gate time,
                // so we have to take the minimum value from all articulations
                gateTime = Math.min(gateTime, a.gateTime)
                break
            }
        }
        return gateTime
    }

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
            for (const it of g.instrumentTemplates) {
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
    setStringData(d: StringData): void { this.m_stringData = d }
    singleNoteDynamics(): boolean { return this.m_singleNoteDynamics }
    setSingleNoteDynamics(v: boolean): void { this.m_singleNoteDynamics = v }
    trait(): Trait { return this.m_trait }
    setTrait(t: Trait): void { this.m_trait = t }
    glissandoStyle(): GlissandoStyle { return this.m_glissandoStyle }
    setGlissandoStyle(v: GlissandoStyle): void { this.m_glissandoStyle = v }

    getSingleNoteDynamicsFromTemplate(): boolean {
        const templateName = this.trackName().toLowerCase().replace(/ /g, '-').replace(/♭/g, 'b')
        const tp = searchTemplate(templateName)
        if (tp) {
            return tp.singleNoteDynamics
        }
        return true
    }

    setSingleNoteDynamicsFromTemplate(): void {
        this.setSingleNoteDynamics(this.getSingleNoteDynamicsFromTemplate())
    }
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
    addLongName(n: StaffName): void { this.m_longNames.push(n) }
    addShortName(n: StaffName): void { this.m_shortNames.push(n) }

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
        return searchTemplate(this.m_id)?.familyId() ?? ''
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
            this.m_clefType.push(new ClefTypeList())
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
    setAmateurPitchRange(a: number, b: number): void { this.m_minPitchA = a; this.m_maxPitchA = b }
    setProfessionalPitchRange(a: number, b: number): void { this.m_minPitchP = a; this.m_maxPitchP = b }
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
