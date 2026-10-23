/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/part.h/.cpp (engraving relevant parts)
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { AutoOnOff, ElementType, PreferSharpFlat, VOICES, nidx, type staff_idx_t, type track_idx_t } from '../types/types'
import { EngravingObject } from './engravingobject'
import { InstrChannel, Instrument, InstrumentList, type StaffNameList } from './instrument'
import type { InstrumentTemplate } from './instrtemplate'
import { SegmentType } from './segment'
import type { FretDiagram } from './fret'
import { Pid } from './property'
import type { Score } from './score'
import type { Staff } from './staff'
import type { StringData } from './stringdata'
import type { StringTunings } from './stringtunings'
import type { HarpPedalDiagram } from './harppedaldiagram'
import { SortedMap } from '../../framework/global/sortedmap'

export class Part extends EngravingObject {
    static readonly MAIN_INSTRUMENT_TICK = new Fraction(-1, 1)
    static readonly DEFAULT_COLOR = 0x3399ff

    private m_partName = '' // used in tracklist (mixer)
    private m_instruments = new InstrumentList()
    private m_staves: Staff[] = []
    private m_id = ''
    private m_show = true // show part in partitur if true
    private m_soloist = false
    private m_color = Part.DEFAULT_COLOR
    private m_hideWhenEmpty: AutoOnOff = AutoOnOff.AUTO
    private m_hideStavesWhenIndividuallyEmpty = false
    private m_preferSharpFlat: PreferSharpFlat = PreferSharpFlat.AUTO
    private m_stringTunings = new SortedMap<StringTunings>()
    /** C++ public member harpDiagrams */
    harpDiagrams = new SortedMap<HarpPedalDiagram>()

    constructor(score: Score) {
        super(ElementType.PART, score)
        this.m_instruments.setInstrument(new Instrument(), -1) // default instrument
    }

    /** C++ Part::clone (the copy constructor: the staves and instruments are shared with this part, not copied) */
    clone(): Part {
        const p = new Part(this.score())
        p.m_partName = this.m_partName
        p.m_instruments = new InstrumentList()
        for (let i = 0; i < this.m_instruments.size(); ++i) {
            p.m_instruments.set(this.m_instruments.keyAt(i), this.m_instruments.valueAt(i))
        }
        p.m_staves = [...this.m_staves]
        p.m_id = this.m_id
        p.m_show = this.m_show
        p.m_soloist = this.m_soloist
        p.m_color = this.m_color
        p.m_hideWhenEmpty = this.m_hideWhenEmpty
        p.m_hideStavesWhenIndividuallyEmpty = this.m_hideStavesWhenIndividuallyEmpty
        p.m_preferSharpFlat = this.m_preferSharpFlat
        p.m_stringTunings = new SortedMap<StringTunings>()
        for (let i = 0; i < this.m_stringTunings.size(); ++i) {
            p.m_stringTunings.set(this.m_stringTunings.keyAt(i), this.m_stringTunings.valueAt(i))
        }
        p.harpDiagrams = new SortedMap<HarpPedalDiagram>()
        for (let i = 0; i < this.harpDiagrams.size(); ++i) {
            p.harpDiagrams.set(this.harpDiagrams.keyAt(i), this.harpDiagrams.valueAt(i))
        }
        return p
    }

    id(): string { return this.m_id }
    setId(id: string): void { this.m_id = id }

    nstaves(): number { return this.m_staves.length }
    staves(): readonly Staff[] { return this.m_staves }
    appendStaff(staff: Staff): void { this.m_staves.push(staff) }
    insertStaff(staff: Staff, idx: staff_idx_t): void {
        if (idx >= this.m_staves.length) {
            idx = this.m_staves.length
        }
        this.m_staves.splice(idx, 0, staff)
        staff.setPart(this)
    }
    removeStaff(staff: Staff): void {
        const i = this.m_staves.indexOf(staff)
        if (i >= 0) {
            this.m_staves.splice(i, 1)
        }
    }
    clearStaves(): void { this.m_staves = [] }
    staff(idx: number): Staff | null { return this.m_staves[idx] ?? null }

    startTrack(): track_idx_t {
        if (!this.m_staves.length) {
            return nidx
        }
        return this.m_staves[0].idx() * VOICES
    }

    endTrack(): track_idx_t {
        if (!this.m_staves.length) {
            return nidx
        }
        return this.m_staves[this.m_staves.length - 1].idx() * VOICES + VOICES
    }

    stringData(tick: Fraction, staffIdx: staff_idx_t): StringData {
        const instrument = this.instrument(tick)

        let reflectTranspositionInLinkedTab = true

        const staff = staffIdx !== nidx ? this.score().staff(staffIdx) : null
        if (staff && staff.isTabStaff(tick)) {
            const primaryStaff = staff.primaryStaff()
            if (primaryStaff) {
                reflectTranspositionInLinkedTab = primaryStaff.reflectTranspositionInLinkedTab()
            }
        }

        let stringTunings: StringTunings | null = null

        if (reflectTranspositionInLinkedTab) {
            const i = this.m_stringTunings.upperBound(tick.ticks()) - 1 // muse::findLessOrEqual
            if (i >= 0) {
                stringTunings = this.m_stringTunings.valueAt(i)
            }
        }

        if (stringTunings) {
            //!NOTE: if there is string tunings element between current instrument and current tick,
            //! then return string data from string tunings element
            const stringTuningsInstrument = this.instrument(stringTunings.tick())
            if (instrument === stringTuningsInstrument) {
                return stringTunings.stringData()
            }
        }

        return instrument.stringData()
    }

    stringTunings(): SortedMap<StringTunings> { return this.m_stringTunings }

    addStringTunings(stringTunings: StringTunings): void {
        this.m_stringTunings.set(stringTunings.segment()!.tick().ticks(), stringTunings)
    }

    removeStringTunings(stringTunings: StringTunings): void {
        const t = stringTunings.segment()!.tick().ticks()
        if (this.m_stringTunings.get(t) === stringTunings) {
            this.m_stringTunings.erase(t)
        }
    }

    addHarpDiagram(harpDiagram: HarpPedalDiagram): void {
        this.harpDiagrams.set(harpDiagram.segment()!.tick().ticks(), harpDiagram)
    }

    removeHarpDiagram(harpDiagram: HarpPedalDiagram): void {
        const t = harpDiagram.segment()!.tick().ticks()
        if (this.harpDiagrams.get(t) === harpDiagram) {
            this.harpDiagrams.erase(t)
        }
    }

    clearHarpDiagrams(): void {
        this.harpDiagrams.clear()
    }

    currentHarpDiagram(tick: Fraction): HarpPedalDiagram | null {
        let i = this.harpDiagrams.upperBound(tick.ticks())
        if (i !== 0) {
            --i
        }
        if (i === this.harpDiagrams.size()) {
            return null
        } else if (tick.lt(Fraction.fromTicks(this.harpDiagrams.keyAt(i)))) {
            return null
        }
        return this.harpDiagrams.valueAt(i)
    }

    nextHarpDiagram(tick: Fraction): HarpPedalDiagram | null {
        const i = this.harpDiagrams.upperBound(tick.ticks())
        return i === this.harpDiagrams.size() ? null : this.harpDiagrams.valueAt(i)
    }

    prevHarpDiagram(tick: Fraction): HarpPedalDiagram | null {
        const i = this.harpDiagrams.lowerBound(tick.ticks())
        if (i === 0) {
            return null
        }
        return this.harpDiagrams.valueAt(i - 1)
    }

    currentHarpDiagramTick(tick: Fraction): Fraction {
        if (this.harpDiagrams.empty()) {
            return new Fraction(0, 1)
        }
        const i = this.harpDiagrams.upperBound(tick.ticks())
        if (i === 0) {
            return new Fraction(0, 1)
        }
        return Fraction.fromTicks(this.harpDiagrams.keyAt(i - 1))
    }

    /** C++ Part::masterPart() */
    masterPart(): Part {
        if (this.score().isMaster()) {
            return this
        }
        if (!this.m_staves.length) {
            return this
        }

        const st = this.m_staves[0]
        const links = st.links()
        if (!links) {
            return this
        }

        for (const le of links) {
            if (le.isStaff() && le.score().isMaster()) {
                const p = (le as Staff).part()
                if (p) {
                    return p
                }
            }
        }
        return this
    }

    instrument(tick: Fraction = new Fraction(-1, 1)): Instrument {
        return this.m_instruments.instrument(tick.ticks())
    }

    instruments(): InstrumentList { return this.m_instruments }
    setInstruments(instruments: InstrumentList): void { this.m_instruments = instruments }

    /** the number of chord symbols (also of fret diagrams) of the part */
    harmonyCount(): number {
        if (!this.score()) {
            return 0
        }

        const firstM = this.score().firstMeasure()
        if (!firstM) {
            return 0
        }

        const st = SegmentType.ChordRest
        let count = 0
        for (let seg = firstM.first(st); seg; seg = seg.next1(st)) {
            for (const e of seg.annotations()) {
                if ((e.isHarmony() || (e.isFretDiagram() && (e as unknown as FretDiagram).harmony())) && e.track() >= this.startTrack()
                    && e.track() < this.endTrack()) {
                    count++
                }
            }
        }
        return count
    }

    /** adds the "harmony" channel (chord symbol playback) to the instrument if there are chord symbols, removes it if not */
    updateHarmonyChannels(isDoOnInstrumentChanged: boolean, checkRemoval = false): void {
        const onInstrumentChanged = (): void => {
            this.masterScore().rebuildMidiMapping()
            this.masterScore().updateChannel()
            this.score().masterScore().setInstrumentsChanged(true)
            this.score().setLayoutAll() //do we need this?
        }

        // usage of harmony count is okay even if expensive since checking harmony channel will shortcircuit if existent
        // harmonyCount will only be called on loading of a score (where it will need to be scanned for harmony anyway)
        // or when the first harmony of a score is just added
        if (checkRemoval) {
            //may be a bit expensive since it gets called after every single delete or undo, but it should be okay for now
            //~OPTIM~
            if (this.harmonyCount() === 0) {
                const instr = this.instrument()
                const hChIdx = instr.channelIdx(InstrChannel.HARMONY_NAME)
                if (hChIdx !== -1) {
                    const hChan = instr.channel(hChIdx)!
                    instr.removeChannel(hChan)
                    if (isDoOnInstrumentChanged) {
                        onInstrumentChanged()
                    }
                    return
                }
            }
        }

        if (!this.harmonyChannel() && this.harmonyCount() > 0) {
            const instr = this.instrument()
            const c = instr.channel(0)!.clone()
            // default to program 0, which is piano in General MIDI
            c.setProgram(0)
            if (c.bank() === 128) { // drumset?
                c.setBank(0)
            }
            c.setName(InstrChannel.HARMONY_NAME)
            instr.appendChannel(c)
            onInstrumentChanged()
        }
    }

    harmonyChannel(): InstrChannel | null {
        const instr = this.instrument()
        if (!instr) {
            return null
        }

        const chanIdx = instr.channelIdx(InstrChannel.HARMONY_NAME)
        if (chanIdx === -1) {
            return null
        }

        return instr.channel(chanIdx)
    }

    hasChordSymbol(): boolean {
        return this.harmonyChannel() !== null
    }

    setInstrument(i: Instrument, tick: Fraction = new Fraction(-1, 1)): void {
        this.m_instruments.setInstrument(i, tick.ticks())
    }

    insertTime(tick: Fraction, len: Fraction): void {
        if (len.isZero()) {
            return
        }

        // move all instruments

        if (len.lt(new Fraction(0, 1))) {
            // remove instruments between tickpos >= tick and tickpos < (tick+len)
            // ownership goes back to class InstrumentChange()
            this.m_instruments.eraseRange(this.m_instruments.lowerBound(tick.ticks()), this.m_instruments.lowerBound(tick.minus(len).ticks()))

            // remove harp pedal diagrams between tickpo >= tick
            this.harpDiagrams.eraseRange(this.harpDiagrams.lowerBound(tick.ticks()), this.harpDiagrams.lowerBound(tick.minus(len).ticks()))
        }

        const il: [number, Instrument][] = []
        for (let i = this.m_instruments.lowerBound(tick.ticks()); i < this.m_instruments.size();) {
            il.push([this.m_instruments.keyAt(i) + len.ticks(), this.m_instruments.valueAt(i)])
            this.m_instruments.eraseAt(i)
        }
        for (const [t, instrument] of il) {
            if (!this.m_instruments.has(t)) { // std::map::insert: existing keys are kept
                this.m_instruments.set(t, instrument)
            }
        }

        const hd2: [number, HarpPedalDiagram][] = []
        for (let h = this.harpDiagrams.lowerBound(tick.ticks()); h < this.harpDiagrams.size();) {
            hd2.push([this.harpDiagrams.keyAt(h) + len.ticks(), this.harpDiagrams.valueAt(h)])
            this.harpDiagrams.eraseAt(h)
        }
        for (const [t, diagram] of hd2) {
            this.harpDiagrams.insert(t, diagram)
        }
    }

    removeInstrument(tick: Fraction): void {
        this.m_instruments.erase(tick.ticks())
    }

    longNames(tick: Fraction = new Fraction(-1, 1)): StaffNameList { return this.instrument(tick).longNames() }
    shortNames(tick: Fraction = new Fraction(-1, 1)): StaffNameList { return this.instrument(tick).shortNames() }

    longName(tick: Fraction = new Fraction(-1, 1)): string {
        const nl = this.longNames(tick)
        return nl.length ? nl[0].name() : ''
    }

    shortName(tick: Fraction = new Fraction(-1, 1)): string {
        const nl = this.shortNames(tick)
        return nl.length ? nl[0].name() : ''
    }

    setLongNames(name: StaffNameList, tick: Fraction = new Fraction(-1, 1)): void { this.instrument(tick).setLongNames(name) }
    setShortNames(name: StaffNameList, tick: Fraction = new Fraction(-1, 1)): void { this.instrument(tick).setShortNames(name) }

    setLongName(s: string): void { this.instrument().setLongName(s) }
    setShortName(s: string): void { this.instrument().setShortName(s) }

    instrumentName(tick: Fraction = new Fraction(-1, 1)): string { return this.instrument(tick).trackName() }
    instrumentId(tick: Fraction = new Fraction(-1, 1)): string { return this.instrument(tick).id() }

    show(): boolean { return this.m_show }
    setShow(val: boolean): void { this.m_show = val }
    isVisible(): boolean { return this.m_show }
    soloist(): boolean { return this.m_soloist }
    setSoloist(val: boolean): void { this.m_soloist = val }
    /** C++ initFromInstrTemplate(const InstrumentTemplate*) */
    initFromInstrTemplate(t: InstrumentTemplate): void {
        this.m_partName = t.longNames.length ? t.longNames[0].name() : t.trackName
        this.setInstrument(Instrument.fromTemplate(t))
    }

    partName(): string { return this.m_partName }
    setPartName(s: string): void { this.m_partName = s }
    color(): number { return this.m_color }
    setColor(v: number): void { this.m_color = v }
    hideWhenEmpty(): AutoOnOff { return this.m_hideWhenEmpty }
    setHideWhenEmpty(v: AutoOnOff): void { this.m_hideWhenEmpty = v }
    hideStavesWhenIndividuallyEmpty(): boolean { return this.m_hideStavesWhenIndividuallyEmpty }
    setHideStavesWhenIndividuallyEmpty(v: boolean): void { this.m_hideStavesWhenIndividuallyEmpty = v }
    preferSharpFlat(): PreferSharpFlat { return this.m_preferSharpFlat }
    setPreferSharpFlat(v: PreferSharpFlat): void { this.m_preferSharpFlat = v }

    hasPitchedStaff(): boolean { return this.m_staves.some(s => s.isPitchedStaff(new Fraction(0, 1))) }
    hasTabStaff(): boolean { return this.m_staves.some(s => s.isTabStaff(new Fraction(0, 1))) }
    hasDrumStaff(): boolean { return this.m_staves.some(s => s.isDrumStaff(new Fraction(0, 1))) }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.VISIBLE:
            return this.m_show
        case Pid.HIDE_WHEN_EMPTY:
            return this.m_hideWhenEmpty
        case Pid.HIDE_STAVES_WHEN_INDIVIDUALLY_EMPTY:
            return this.m_hideStavesWhenIndividuallyEmpty
        case Pid.USE_DRUMSET:
            return this.instrument().useDrumset()
        case Pid.PREFER_SHARP_FLAT:
            return this.preferSharpFlat()
        default:
            return undefined
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.VISIBLE:
            this.setShow(!!v)
            break
        case Pid.HIDE_WHEN_EMPTY:
            this.setHideWhenEmpty(v as AutoOnOff)
            break
        case Pid.HIDE_STAVES_WHEN_INDIVIDUALLY_EMPTY:
            this.setHideStavesWhenIndividuallyEmpty(!!v)
            break
        case Pid.USE_DRUMSET:
            this.instrument().setUseDrumset(!!v)
            break
        case Pid.PREFER_SHARP_FLAT:
            this.setPreferSharpFlat(v as PreferSharpFlat)
            break
        default:
            return false
        }
        this.score().setLayoutAll()
        return true
    }
}
