/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importgtp-gp5.cpp (GuitarPro5: Guitar Pro 5 files)
 */

import type { Buffer } from '../../../framework/global/io/buffer'
import { Arpeggio } from '../../../engraving/dom/arpeggio'
import { Articulation } from '../../../engraving/dom/articulation'
import { Chord } from '../../../engraving/dom/chord'
import { ChordLine } from '../../../engraving/dom/chordline'
import type { ChordRest } from '../../../engraving/dom/chordrest'
import { NoteType } from '../../../engraving/dom/chordrest'
import { Clef } from '../../../engraving/dom/clef'
import { ClefTypeList } from '../../../engraving/dom/clefinfo'
import { TDuration } from '../../../engraving/dom/durationtype'
import { Factory } from '../../../engraving/dom/factory'
import { Fingering } from '../../../engraving/dom/fingering'
import { Glissando } from '../../../engraving/dom/glissando'
import { defaultClef } from '../../../engraving/dom/instrtemplate'
import { Lyrics } from '../../../engraving/dom/lyrics'
import type { Measure } from '../../../engraving/dom/measure'
import { Repeat } from '../../../engraving/dom/measurebase'
import { DisplayFretOption, Note } from '../../../engraving/dom/note'
import { NoteDot } from '../../../engraving/dom/notedot'
import { Part } from '../../../engraving/dom/part'
import { Prefer, clampPitch } from '../../../engraving/dom/pitchspelling'
import { RehearsalMark, RehearsalMarkType } from '../../../engraving/dom/rehearsalmark'
import { Rest } from '../../../engraving/dom/rest'
import { type Segment, SegmentType } from '../../../engraving/dom/segment'
import { Slur, SlurConnectedElement } from '../../../engraving/dom/slur'
import { SpannerAnchor } from '../../../engraving/dom/spanner'
import { StaffText } from '../../../engraving/dom/stafftextbase'
import { StaffType, StaffTypes } from '../../../engraving/dom/stafftype'
import { StringData } from '../../../engraving/dom/stringdata'
import { Symbol } from '../../../engraving/dom/symbol'
import { Tie } from '../../../engraving/dom/tie'
import { TremoloSingleChord } from '../../../engraving/dom/tremolosinglechord'
import type { Tuplet } from '../../../engraving/dom/tuplet'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { Constants } from '../../../engraving/types/constants'
import { Fraction } from '../../../engraving/types/fraction'
import { SymId } from '../../../engraving/types/symid'
import {
    ArpeggioType, BarLineType, ChordLineType, ClefType, DirectionV, DurationType, ElementType, GlissandoType, INVALID_FRET_INDEX,
    NoteHeadGroup, TremoloType, VOICES,
} from '../../../engraving/types/types'
import { ContiniousElementsBuilder } from './continiouselementsbuilder'
import { GuitarBendImporter } from './guitarbendimport/guitarbendimporter'
import * as drumset from './guitarprodrumset'
import { EngravingConfiguration } from '../../../engraving/internal/engravingconfiguration'
import * as utils from './utils'
import {
    GP_DEFAULT_PERCUSSION_CHANNEL, GP_MAX_STRING_NUMBER, GP_VOLTA_FLAGS, GpBar, GuitarPro, GuitarProReadNoteResult,
} from './importgtp'

function tremoloType(division: number): TremoloType {
    const types = new Map<number, TremoloType>([
        [1, TremoloType.R8],
        [2, TremoloType.R16],
        [3, TremoloType.R32],
    ])

    const it = types.get(division)
    if (it !== undefined) {
        return it
    }

    console.error('wrong tremolo type')
    return TremoloType.INVALID_TREMOLO
}

/** std::string::npos-like position: -1 (not found) becomes Infinity, so "pos2 < pos" works like on size_t */
function npos(pos: number): number {
    return pos < 0 ? Infinity : pos
}

export class GuitarPro5 extends GuitarPro {
    /** C++ std::map<std::pair<int, int>, bool> (key "staff,string") */
    private dead_end = new Map<string, boolean>()
    private _beat_counter = 0
    private m_tremolosInChords = new Map<Chord, TremoloType>() // for adding tremolo for tied notes
    private m_harmonicNotes = new Map<Note, Note>() // for adding ties for harmonic notes
    private m_currentBeatHasRasgueado = false
    private m_letRingForChords = new Set<ChordRest>() // fixing gp5 bug with no storing let ring for tied notes
    private m_glissandoNotePairs: [Note, Note][] = []

    //---------------------------------------------------------
    //   readInfo
    //---------------------------------------------------------

    private readInfo(): void {
        this.title = this.readDelphiString()
        this.subtitle = this.readDelphiString()
        this.artist = this.readDelphiString()
        this.album = this.readDelphiString()
        this.composer = this.readDelphiString()
        this.poet = this.readDelphiString()
        const copyright = this.readDelphiString()
        if (copyright) {
            this.score.setMetaTag('copyright', copyright)
        }

        this.readDelphiString() // transcriber
        this.readDelphiString() // instructions
        const n = this.readInt()
        for (let i = 0; i < n; ++i) {
            this.comments.push(this.readDelphiString())
        }
    }

    //---------------------------------------------------------
    //   readBeatEffects
    //---------------------------------------------------------

    protected override readBeatEffects(track: number, segment: Segment): number {
        let effects = 0

        const fxBits1 = this.readUInt8()
        const fxBits2 = this.readUInt8()
        if (fxBits1 & GuitarPro.BEAT_FADE) {
            effects = 4 // fade in
        }
        if (fxBits1 & GuitarPro.BEAT_EFFECT) {
            const k = this.readUInt8()
            effects = k + effects * 100 // &effects;
        }
        if (fxBits1 & GuitarPro.BEAT_VIBRATO_TREMOLO) {
            effects = 7 + effects * 100
        }
        if (fxBits2 & GuitarPro.BEAT_TREMOLO) {
            this.readTremoloBar(track, segment) // readBend();
        }
        if (fxBits2 & GuitarPro.BEAT_RASGUEADO) {
            this.m_currentBeatHasRasgueado = true
        }
        if (fxBits1 & GuitarPro.BEAT_ARPEGGIO) {
            const strokeup = this.readUInt8() // up stroke length
            const strokedown = this.readUInt8() // down stroke length

            let a: Arpeggio | null = new Arpeggio(scoreDummy(this.score).chord())
            // representation is different in guitar pro 5 - the up/down order below is correct
            if (strokeup > 0) {
                a.setArpeggioType(ArpeggioType.DOWN_STRAIGHT)
                if (strokeup < 7) {
                    a.setStretch(1.0 / Math.pow(2, 6 - strokeup))
                }
            } else if (strokedown > 0) {
                a.setArpeggioType(ArpeggioType.UP_STRAIGHT)
                if (strokedown < 7) {
                    a.setStretch(1.0 / Math.pow(2, 6 - strokedown))
                }
            } else {
                a = null
            }
            if (a) {
                const cr = new Chord(segment)
                cr.setTrack(track)
                cr.add(a)
                segment.add(cr)
            }
        }
        if (fxBits2 & GuitarPro.BEAT_STROKE_DIR) {
            effects = this.readChar() // stroke pick direction
            effects += 4 //1 or 2 for effects becomes 4 or 5
        }
        return effects
    }

    //---------------------------------------------------------
    //   readPageSetup
    //---------------------------------------------------------

    private readPageSetup(): void {
        this.skip(this.version > 500 ? 49 : 30)
        for (let i = 0; i < 11; ++i) {
            this.skip(4)
            this.readBytePascalString()
        }
    }

    //---------------------------------------------------------
    //   readBeat
    //---------------------------------------------------------

    private readBeat(tick: Fraction, voice: number, measure: Measure, staffIdx: number, tuplets: (Tuplet | null)[],
                     _mixChange: boolean): Fraction {
        const beatBits = this.readUInt8()
        const dotted = (beatBits & GuitarPro.BEAT_DOTTED) !== 0
        let hasSlur = false
        let hasHammerOnPullOff = false
        let hasLetRing = false
        let hasPalmMute = false
        let hasTrill = false
        let hasVibratoLeftHand = false
        let hasVibratoWTremBar = false
        let hasHarmonicArtificial = false
        let hasHarmonicPinch = false
        let hasHarmonicTap = false
        let hasHarmonicSemi = false

        this.m_currentBeatHasRasgueado = false

        this.slide = -1
        const track = staffIdx * VOICES + voice
        if (this.slides.has(track)) {
            this.slide = this.slides.get(track)!
            this.slides.delete(track)
        }

        let pause = -1
        if (beatBits & GuitarPro.BEAT_PAUSE) {
            pause = this.readUInt8()
        }

        // readDuration
        const len = this.readChar()
        let tuple = 0
        if (beatBits & GuitarPro.BEAT_TUPLET) {
            tuple = this.readInt()
        }

        const segment = measure.getSegment(SegmentType.ChordRest, tick)
        if (beatBits & GuitarPro.BEAT_CHORD) {
            const numStrings = this.score.staff(staffIdx)!.part()!.instrument().stringData().strings()
            this.skip(17)
            let name: string
            {
                const charsCount = this.readUInt8()
                const c = this.f.read(21)
                // Just in case
                let n = Math.min(charsCount, 20, c.length)
                const zero = c.subarray(0, n).indexOf(0)
                if (zero >= 0) {
                    n = zero
                }
                name = new TextDecoder('utf-8').decode(c.subarray(0, n))
            }
            this.skip(4)
            // no header to be read in the GP5 format - default to true.
            this.readChord(segment, staffIdx * VOICES, numStrings, name, true)
            this.skip(32)
        }
        const lyrics: Lyrics | null = null
        let free_text = ''
        if (beatBits & GuitarPro.BEAT_LYRICS) {
            /// it is not beat lirics, it is free text
            free_text = this.readDelphiString()
        }

        let beatEffects = 0
        if (beatBits & GuitarPro.BEAT_EFFECTS) {
            beatEffects = this.readBeatEffects(track, segment)
        }

        this.last_segment = segment
        if (beatBits & GuitarPro.BEAT_MIX_CHANGE) {
            this.readMixChange(measure)
        }

        const strings = this.readUInt8() // used strings mask

        let l = this.len2fraction(len)

        // Some beat effects could add a Chord before this
        let cr: ChordRest | null = segment.cr(track)
        if (voice !== 0 && pause === 0 && strings === 0) {
            cr = null
        } else {
            if (strings === 0) {
                if (cr) {
                    segment.remove(cr)
                    cr = null
                }
                cr = new Rest(scoreDummy(this.score).segment())
            } else {
                if (!cr) {
                    cr = new Chord(scoreDummy(this.score).segment())
                }
            }
            cr.setParent(segment)
            cr.setTrack(track)

            const d = new TDuration(l)
            d.setDots(dotted ? 1 : 0)

            if (dotted) {
                l = l.plus(l.times(new Fraction(1, 2)))
            }

            if (tuple) {
                const track2 = staffIdx * 2 + voice
                let tuplet = tuplets[track2]
                if (!tuplet || tuplet.elementsDuration().eq(tuplet.baseLen().fraction().times(tuplet.ratio().numerator()))) {
                    tuplet = Factory.createItem(ElementType.TUPLET, measure) as Tuplet
                    tuplets[track2] = tuplet
                    this.setTuplet(tuplet, tuple)
                    tuplet.setParent(measure)
                }
                tuplet.setTrack(cr.track())
                tuplet.setBaseLen(new TDuration(l))
                tuplet.setTick(tick)
                tuplet.setTicks(l.times(tuplet.ratio().denominator()))
                cr.setTuplet(tuplet)
                tuplet.add(cr)
            }

            cr.setTicks(l)
            if (cr.isRest() && (pause === 0 || l.ge(measure.ticks()))) {
                cr.setDurationType(DurationType.V_MEASURE)
                cr.setTicks(measure.ticks())
            } else {
                cr.setDurationType(d)
            }

            if (!segment.cr(track)) {
                segment.add(cr)
            }

            const staff = cr.staff()!
            const numStrings = staff.part()!.instrument().stringData().strings()

            let _note: Note | null = null
            const delnote: Note[] = []
            for (let i = 6; i >= 0; --i) {
                if ((strings & (1 << i)) && ((6 - i) < numStrings)) {
                    const note = new Note(cr as Chord)
                    _note = note
                    if (dotted) {
                        // there is at most one dotted note in this guitar pro version
                        const dot = new NoteDot(note)
                        dot.setParent(note)
                        dot.setTrack(track) // needed to know the staff it belongs to (and detect tablature)
                        dot.setVisible(true)
                        note.add(dot)
                    }
                    (cr as Chord).add(note)

                    const readResult = this.readNote(6 - i, note)
                    hasSlur = readResult.slur || hasSlur
                    hasHammerOnPullOff = readResult.hammerOnPullOff || hasHammerOnPullOff
                    hasLetRing = readResult.letRing || hasLetRing
                    hasPalmMute = readResult.palmMute || hasPalmMute
                    hasTrill = readResult.trill || hasTrill
                    hasVibratoLeftHand = readResult.vibrato || hasVibratoLeftHand
                    hasHarmonicArtificial = readResult.harmonicArtificial || hasHarmonicArtificial
                    hasHarmonicPinch = readResult.harmonicPinch || hasHarmonicPinch
                    hasHarmonicTap = readResult.harmonicTap || hasHarmonicTap
                    hasHarmonicSemi = readResult.harmonicSemi || hasHarmonicSemi
                    if (this.slideList.length && this.slideList[this.slideList.length - 1] === null) {
                        this.slideList[this.slideList.length - 1] = note
                        hasSlur = true
                    }
                    if (note.fret() === -20) {
                        delnote.push(note)
                    } else {
                        note.setTpcFromPitch(Prefer.SHARPS)
                    }
                }
            }
            if (delnote.length) {
                const chord = cr as Chord
                for (const n of delnote) {
                    chord.remove(n)
                }
                if (chord.notes().length === 0) {
                    if (chord.tuplet()) {
                        chord.tuplet()!.remove(chord)
                    }
                    chord.segment()!.remove(chord)
                    cr = null
                }
                delnote.length = 0
            }
            this.createSlur(hasSlur, staffIdx, cr)
            if (lyrics) {
                cr!.add(lyrics)
            }
            if (free_text.length && _note) {
                this.addTextToNote(free_text, _note)
            }
        }

        const rr = this.readChar()
        if (cr && cr.isChord()) {
            const chord = cr as Chord

            const hasVibratoLeftHandOnBeat = { value: false }
            const hasVibratoWTremBarOnBeat = { value: false }

            do {
                this.applyBeatEffects(chord, beatEffects % 100, hasVibratoLeftHandOnBeat, hasVibratoWTremBarOnBeat)
                hasVibratoLeftHand = hasVibratoLeftHand || hasVibratoLeftHandOnBeat.value
                hasVibratoWTremBar = hasVibratoWTremBar || hasVibratoWTremBarOnBeat.value
            } while ((beatEffects = Math.trunc(beatEffects / 100)))
            if (rr === GuitarPro.ARPEGGIO_DOWN) {
                chord.setStemDirection(DirectionV.DOWN)
            } else if (rr === GuitarPro.ARPEGGIO_UP) {
                chord.setStemDirection(DirectionV.UP)
            }
        }

        if (cr) {
            //  fixing gp5 bug with not storying let ring for tied notes
            if (hasLetRing) {
                this.m_letRingForChords.add(cr)
            }

            this.addLetRing(cr, hasLetRing)
            this.addPalmMute(cr, hasPalmMute)
            this.addTrill(cr, hasTrill)
            this.addHammerOnPullOff(cr, hasHammerOnPullOff)
            this.addRasgueado(cr, this.m_currentBeatHasRasgueado)
            this.addVibratoLeftHand(cr, hasVibratoLeftHand)
            this.addVibratoWTremBar(cr, hasVibratoWTremBar)
            this.addHarmonicMarks(cr, hasHarmonicArtificial, hasHarmonicPinch, hasHarmonicTap, hasHarmonicSemi)
        }

        const r = this.readChar()
        if (r & 0x8) {
            this.readChar()
        }
        if (cr && cr.isChord()) {
            if ((cr as Chord).notes().length === 0) {
                segment.remove(cr)
                cr = null
            } else if (this.slide > 0) {
                this.createSlide(this.slide, cr, staffIdx)
            }
        }
        this.restsForEmptyBeats(segment, measure, cr, l, track, tick)
        return cr ? cr.actualTicks() : measure.ticks()
    }

    //---------------------------------------------------------
    //   readMeasure
    //---------------------------------------------------------

    private readMeasure(measure: Measure, staffIdx: number, tuplets: (Tuplet | null)[], mixChange: boolean): void {
        for (let voice = 0; voice < 2; ++voice) {
            let measureLen = new Fraction(0, 1)
            let tick = measure.tick()
            const beats = this.readInt()
            if (beats > 100) {
                return
            }
            for (let beat = 0; beat < beats; ++beat) {
                const ticks = this.readBeat(tick, voice, measure, staffIdx, tuplets, mixChange)
                ++this._beat_counter
                tick = tick.plus(ticks)
                measureLen = measureLen.plus(ticks)
            }
            if (measureLen.lt(measure.ticks())) {
                this.score.setRest(tick, staffIdx * VOICES + voice, measure.ticks().minus(measureLen), false, null, false)
                this.m_continiousElementsBuilder!.notifyUncompletedMeasure()
            }
        }
    }

    //---------------------------------------------------------
    //   readMixChange
    //---------------------------------------------------------

    protected override readMixChange(measure: Measure): boolean {
        /*char patch   =*/
        this.readChar()
        this.skip(16)
        const volume = this.readChar()
        const pan = this.readChar()
        const chorus = this.readChar()
        const reverb = this.readChar()
        const phase = this.readChar()
        const tremolo = this.readChar()
        this.readDelphiString() // tempo name

        const temp = this.readInt()
        let editedTempo = false
        if (volume >= 0) {
            this.readChar()
        }
        if (pan >= 0) {
            this.readChar()
        }
        if (chorus >= 0) {
            this.readChar()
        }
        if (reverb >= 0) {
            this.readChar()
        }

        if (phase >= 0) {
            this.readChar()
        }
        if (tremolo >= 0) {
            this.readChar()
        }
        if (temp >= 0) {
            if (this.last_segment) {
                this.score.setTempo(this.last_segment.tick(), temp / 60.0) // BeatsPerSecond::fromBPM
                this.last_segment = null
            }
            if (temp !== this.previousTempo) {
                this.previousTempo = temp
                this.setTempo(temp, measure)
                editedTempo = true
            }
            this.readChar()
            if (this.version > 500) {
                this.readChar()
            }
        }
        this.readChar()
        this.readChar()
        if (this.version > 500) {
            this.readDelphiString()
            this.readDelphiString()
        }
        return editedTempo
    }

    //---------------------------------------------------------
    //   readTracks
    //---------------------------------------------------------

    private readTracks(): boolean {
        for (let i = 0; i < this.staves; ++i) {
            const tuning = new Array<number>(GP_MAX_STRING_NUMBER).fill(0)
            const staff = this.score.staff(i)!
            const part = staff.part()!

            const c = this.readUInt8() // simulations bitmask
            if (c & 0x2) { // 12 stringed guitar
            }
            if (c & 0x4) { // banjo track
            }
            if (i === 0 || this.version === 500) {
                this.skip(1)
            }
            const name = this.readPascalString(40)

            const strings = this.readInt()
            if (strings <= 0 || strings > GP_MAX_STRING_NUMBER) {
                return false
            }
            for (let j = 0; j < strings; ++j) {
                tuning[j] = this.readInt()
            }
            for (let j = strings; j < GP_MAX_STRING_NUMBER; ++j) {
                this.readInt()
            }
            const midiPort = this.readInt() - 1
            const midiChannel = this.readInt() - 1
            if (midiChannel < 0 || midiChannel >= this.channelDefaults.length) {
                console.error(`midiChannel ${midiChannel} out of range 0-${this.channelDefaults.length}`)
                return false
            }
            /*int midiChannel2 =*/ this.readInt() // -1

            const frets = this.readInt()
            const capo = this.readInt()
            part.setCapoFret(capo)
            /*int color        =*/ this.readInt()

            this.skip(this.version > 500 ? 49 : 44)
            if (this.version > 500) {
                //  british stack clean / amp tone
                this.readDelphiString()
                this.readDelphiString()
            }
            const tuning2 = new Array<number>(strings).fill(0)
            for (let k = 0; k < strings; ++k) {
                tuning2[strings - k - 1] = tuning[k]
            }
            const useFlats = this.createTuningString(strings, tuning2)
            const stringData = StringData.fromPitches(frets, strings, tuning2, useFlats)
            const instr = part.instrument()
            instr.setStringData(stringData)
            instr.setSingleNoteDynamics(false)
            part.setPartName(name)
            part.setPlainLongName(name)

            //
            // determine clef
            //
            const patch = this.channelDefaults[midiChannel].patch
            let clefId = ClefType.G
            if (midiChannel === GP_DEFAULT_PERCUSSION_CHANNEL) {
                clefId = ClefType.PERC
                let type = StaffTypes.PERC_5LINE // C++ StaffTypes::PERC_DEFAULT
                const it = drumset.PERC_STAFF_LINES_FROM_INSTRUMENT.get(name)
                if (it) {
                    drumset.initGuitarProPercussionSet(it)
                    drumset.setInstrumentDrumset(instr, it)
                    switch (it.numLines) {
                    case 1:
                        type = StaffTypes.PERC_1LINE
                        break
                    case 2:
                        type = StaffTypes.PERC_2LINE
                        break
                    case 3:
                        type = StaffTypes.PERC_3LINE
                        break
                    default:
                        type = StaffTypes.PERC_5LINE
                        break
                    }
                } else {
                    drumset.initGuitarProDrumset()
                    instr.setDrumset(drumset.gpDrumset)
                }
                staff.setStaffType(new Fraction(0, 1), StaffType.preset(type))
            } else {
                clefId = defaultClef(patch)
            }

            const measure = this.score.firstMeasure()!
            if (!measure.tick().eq(new Fraction(0, 1))) {
                const segment = measure.getSegment(SegmentType.HeaderClef, new Fraction(0, 1))

                const clef = new Clef(segment)
                clef.setClefType(clefId)
                clef.setTrack(i * VOICES)
                segment.add(clef)
            } else {
                staff.setDefaultClefType(new ClefTypeList(clefId, clefId))
            }

            if (capo > 0 && !EngravingConfiguration.guitarProImportExperimental()) {
                const s = measure.getSegment(SegmentType.ChordRest, measure.tick())
                const st = new StaffText(s)
                st.setPlainText('Capo. fret ' + capo)
                st.setTrack(i * VOICES)
                s.add(st)
            }

            const ch = instr.channel(0)!
            if (midiChannel === GP_DEFAULT_PERCUSSION_CHANNEL) {
                ch.setProgram(0)
                ch.setBank(128)
            } else {
                ch.setProgram(patch)
                ch.setBank(0)
            }
            ch.setVolume(this.channelDefaults[midiChannel].volume)
            ch.setPan(this.channelDefaults[midiChannel].pan)
            ch.setChorus(this.channelDefaults[midiChannel].chorus)
            ch.setReverb(this.channelDefaults[midiChannel].reverb)
            staff.part()!.setMidiChannel(midiChannel, midiPort)

            // missing: phase, tremolo
        }
        this.skip(this.version === 500 ? 2 : 1)

        return true
    }

    //---------------------------------------------------------
    //   readMeasures
    //---------------------------------------------------------

    private readMeasures(_startingTempo: number): void {
        let measure = this.score.firstMeasure()!
        const mixChange = false
        for (let bar = 0; bar < this.measures; ++bar, measure = measure.nextMeasure()!) {
            const gpbar = this.bars[bar]

            if (gpbar.marker) {
                const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
                const s = new RehearsalMark(segment)
                s.setType(RehearsalMarkType.Additional)
                s.setPlainText(gpbar.marker.trim())
                s.setTrack(0)
                segment.add(s)
            }

            const tuplets: (Tuplet | null)[] = new Array<Tuplet | null>(this.staves * 2).fill(null) // two voices

            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                this._beat_counter = 0
                this.readMeasure(measure, staffIdx, tuplets, mixChange)
                if (!(((bar === (this.measures - 1)) && (staffIdx === (this.staves - 1))))) {
                    /*int a = */
                    this.readChar()
                }
            }
            if (bar === 1 && !mixChange) {
                this.setTempo(this.tempo, this.score.firstMeasure())
            }
        }

        if (this.gpLyrics.segments.length) {
            const size = Math.min(this.gpLyrics.segments.length, this.gpLyrics.lyrics.length)
            for (let i = 0; i < size; ++i) {
                let str = this.gpLyrics.lyrics[i]
                let seg: Segment | null = this.gpLyrics.segments[i]
                let mes: Measure | null = seg!.measure()
                while (str.length && seg && seg.segmentType() === SegmentType.ChordRest) {
                    const cr = seg.cr(this.gpLyrics.lyricTrack)
                    if (cr) {
                        if (str[0] !== '-') {
                            const lyr = new Lyrics(scoreDummy(this.score).chord())

                            let text: string
                            let pos = npos(str.indexOf('-'))
                            const pos2 = npos(str.indexOf('\n'))
                            if (pos2 < pos) {
                                pos = pos2
                            }
                            if (pos !== Infinity) {
                                if (pos + 1 >= str.length) { // C++ *c == 0
                                    pos = Infinity
                                    text = str
                                } else {
                                    text = str.substring(0, pos)
                                    str = str.substring(pos + 1)
                                }
                            } else {
                                text = str
                            }
                            if (pos === Infinity) {
                                str = ''
                            }
                            lyr.setPlainText(text)
                            cr.add(lyr)
                        } else {
                            str = str.substring(1)
                        }
                    }
                    seg = seg.next()
                    if (!seg) {
                        mes = mes!.nextMeasure()
                        if (!mes) {
                            break
                        }
                        seg = mes.first()
                    }
                }
            }
        } else if (this.gpLyrics.lyricTrack !== 0) {
            let counter = 0
            let index = 0
            this.gpLyrics.lyricTrack -= 1
            let mes = this.score.firstMeasure()
            if (!mes) {
                return
            }

            let beg: Segment | null = mes.first()

            do {
                if (beg!.segmentType() === SegmentType.ChordRest && beg!.cr(this.gpLyrics.lyricTrack)) {
                    const cr = beg!.cr(this.gpLyrics.lyricTrack)!
                    ++counter
                    if (!cr.isChord()) {
                        continue
                    }

                    let isTied = false
                    const chord = cr as Chord
                    for (const n of chord.notes()) {
                        const tiedNotes = n.tiedNotes()

                        if (tiedNotes.length > 1 && tiedNotes[0] !== n) {
                            isTied = true
                            break
                        }
                    }

                    if (isTied) {
                        continue
                    }

                    if (counter >= this.gpLyrics.fromBeat) {
                        if (this.gpLyrics.lyricPos.length === index) {
                            this.gpLyrics.lyricPos.push(0)
                        }

                        const lyricsInIndex = this.gpLyrics.lyrics[index]
                        if (lyricsInIndex[0] !== '-') {
                            const lyr = new Lyrics(cr)

                            let text: string
                            const lyricPos = this.gpLyrics.lyricPos[index]
                            let pos = npos(lyricsInIndex.indexOf('-', lyricPos))
                            const pos2 = npos(lyricsInIndex.indexOf('\n', lyricPos))
                            if (pos2 < pos) {
                                pos = pos2
                            }

                            if (pos !== Infinity && (pos + 1 < lyricsInIndex.length)) {
                                text = lyricsInIndex.substring(lyricPos, pos + 1)
                                this.gpLyrics.lyricPos[index] = pos + 1
                            } else {
                                text = lyricsInIndex.substring(lyricPos)
                            }

                            if (pos === Infinity) {
                                ++index
                            }

                            lyr.setPlainText(text)
                            cr.add(lyr)
                            if (index >= this.gpLyrics.lyrics.length) {
                                break
                            }
                        } else if (lyricsInIndex.length >= 2) {
                            this.gpLyrics.lyrics[index] = lyricsInIndex.substring(1)
                        }
                    }
                }
            } while ((beg = beg!.next())
                     || (mes!.next() && mes!.next()!.isMeasure() && (mes = mes!.next() as Measure) && (beg = mes.first())))
        }
    }

    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    override read(io: Buffer): boolean {
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this.score)
        this.m_guitarBendImporter = new GuitarBendImporter(this.score)

        this.f = io

        this.readInfo()
        this.readLyrics()
        this.readPageSetup()

        this.previousTempo = -1

        this.tempo = this.readInt()
        if (this.version > 500) {
            this.skip(1)
        }

        this.key = this.readInt()
        /* int octave =*/ this.readChar() // octave

        this.readChannels()

        const articulations = new Array<number>(19).fill(0)
        for (let i = 0; i < 19; ++i) {
            let r = this.readUInt8()
            r += this.readUInt8() << 8
            articulations[i] = r
        }

        //skip(42);
        this.skip(4)

        this.measures = this.readInt()
        this.staves = this.readInt()
        this.initDynamics(this.staves)

        for (let str = 0; str < 7; ++str) {
            for (let staff = 0; staff < this.staves; ++staff) {
                this.dead_end.set(`${staff},${str}`, true)
            }
        }

        while (this.slurs.length < this.staves) {
            this.slurs.push(null)
        }

        let tnumerator = 4
        let tdenominator = 4
        for (let i = 0; i < this.measures; ++i) {
            if (i > 0) {
                this.skip(1)
            }
            const bar = new GpBar()
            const barBits = this.readUInt8()
            if (barBits & GuitarPro.SCORE_TIMESIG_NUMERATOR) {
                tnumerator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_TIMESIG_DENOMINATOR) {
                tdenominator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_REPEAT_START) {
                bar.repeatFlags = bar.repeatFlags | Repeat.START
            }
            if (barBits & GuitarPro.SCORE_REPEAT_END) { // number of repeats
                bar.repeatFlags = bar.repeatFlags | Repeat.END
                bar.repeats = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_MARKER) {
                bar.marker = this.readDelphiString() // new section?
                /*int color =*/ this.readInt() // color?
            }
            if (barBits & GuitarPro.SCORE_VOLTA) { // a volta
                let voltaNumber = this.readUInt8()
                while (voltaNumber > 0) {
                    // voltas are represented as flags
                    bar.volta.voltaType = GP_VOLTA_FLAGS
                    bar.volta.voltaInfo.push(voltaNumber & 1)
                    voltaNumber >>= 1
                }
                bar.repeats = bar.volta.voltaInfo.length + 1
            }
            if (barBits & GuitarPro.SCORE_KEYSIG) {
                const currentKey = this.readUInt8()
                /* key signatures are specified as
                 * 1# = 1, 2# = 2, ..., 7# = 7
                 * 1b = 255, 2b = 254, ... 7b = 249 */
                bar.keysig = currentKey <= 7 ? currentKey : -256 + currentKey
                this.readUInt8() // specified major/minor mode
            }
            if (barBits & GuitarPro.SCORE_DOUBLE_BAR) {
                bar.barLine = BarLineType.DOUBLE
            }
            if (barBits & 0x3) {
                this.skip(4)
            }
            if ((barBits & 0x10) === 0) {
                this.skip(1)
            }

            this.readChar() // triple feel  (none, 8, 16)
            bar.timesig = new Fraction(tnumerator, tdenominator)
            this.bars.push(bar)
        }

        //
        // create a part for every staff
        //
        for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
            const part = new Part(this.score)
            const s = Factory.createStaff(part)

            this.score.appendStaff(s)
            this.score.appendPart(part)
        }

        this.createMeasures()
        if (!this.readTracks()) {
            return false
        }
        this.readMeasures(this.tempo)
        for (const n of this.slideList) {
            if (!n) {
                continue // TODO(port): C++ dereferences the null entry of a legato slide that got no note
            }
            let segment: Segment | null = n.chord()!.segment()!
            let measure: Measure | null = segment.measure()
            while ((segment = segment!.next1(SegmentType.ChordRest)) || ((measure = measure!.nextMeasure()) && (segment = measure.first()))) {
                if (!segment) {
                    break
                }
                if (segment.segmentType() !== SegmentType.ChordRest) {
                    continue
                }
                let br = false
                const cr = segment.cr(n.track())
                if (cr && cr.isChord()) {
                    const c = cr as Chord
                    for (const nt of c.notes()) {
                        if (nt.string() === n.string()) {
                            for (const e of nt.el()) {
                                if (e.isChordLine()) {
                                    const cl = e as ChordLine
                                    if (cl.chordLineType() === ChordLineType.PLOP || cl.chordLineType() === ChordLineType.SCOOP) {
                                        br = true
                                        break
                                    }
                                }
                            }
                            if (br) {
                                break
                            }

                            this.m_glissandoNotePairs.push([n, nt])
                            br = true
                            break
                        }
                    }
                }
                if (br) {
                    break
                }
            }
        }

        const counter = new Map<number, number>()
        for (let i = 0; i < 19; ++i) {
            if (articulations[i] !== 0xFFFF) {
                const measure = this.score.measure(articulations[i] - 1) as Measure
                if (i < 4) {
                    const segment = measure.getSegment(SegmentType.BarLine, measure.tick())
                    const sym = new Symbol(measure)
                    if (i === 0) {
                        sym.setSym(SymId.coda)
                    } else if (i === 1) {
                        sym.setSym(SymId.codaSquare)
                    } else if (i === 2) {
                        sym.setSym(SymId.segno)
                    } else {
                        sym.setSym(SymId.segnoSerpent2)
                    }

                    sym.setParent(measure)
                    sym.setTrack(0)
                    segment.add(sym)
                    counter.set(articulations[i], (counter.get(articulations[i]) ?? 0) + 1)
                } else {
                    const s = measure.getSegment(SegmentType.KeySig, measure.tick())
                    const st = new StaffText(s)
                    const text = [
                        'fine', 'Da Capo', 'D.C. al Coda', 'D.C. al Doppia Coda',
                        'D.C. al Fine', 'Da Segno', 'D.S. al Coda', 'D.S. al Doppia Coda',
                        'D.S. al Fine', 'Da Doppio Segno', 'D.D.S. al Coda', 'D.D.S. al Doppia Coda',
                        'D.D.S. al Fine', 'Da Coda', 'Da Doppia Coda',
                    ]
                    st.setPlainText(text[i - 4])
                    st.setParent(s)
                    st.setTrack(0)
                    counter.set(articulations[i], (counter.get(articulations[i]) ?? 0) + 1)
                    this.score.addElement(st)
                }
            }
        }

        this.m_continiousElementsBuilder!.addElementsToScore()
        this.m_guitarBendImporter!.applyBendsToChords()
        this.addGlissandos()

        return true
    }

    //---------------------------------------------------------
    //   readNoteEffects
    //---------------------------------------------------------

    private readNoteEffects(note: Note): GuitarProReadNoteResult {
        const result = new GuitarProReadNoteResult()
        const modMask1 = this.readUInt8()
        const modMask2 = this.readUInt8()
        let bendData: ReturnType<GuitarPro5['readBendDataFromFile']> = []
        let bendParent: Note | null = null

        if (modMask1 & GuitarPro.EFFECT_BEND) {
            bendData = this.readBendDataFromFile()
            bendParent = note
        }
        if (modMask1 & GuitarPro.EFFECT_HAMMER) {
            result.hammerOnPullOff = true
        }
        if (modMask1 & GuitarPro.EFFECT_LET_RING) {
            result.letRing = true
        }

        if (modMask1 & GuitarPro.EFFECT_GRACE) {
            const fret = this.readUInt8() // grace fret
            /*int dynamic =*/ this.readUInt8() // grace dynamic
            const transition = this.readUInt8() // grace transition
            const duration = this.readUInt8() // grace duration
            const gflags = this.readUInt8()

            let grace_len = Constants.DIVISION / 8
            if (duration === 2) {
                grace_len = Constants.DIVISION / 6 //24th
            } else if (duration === 3) {
                grace_len = Constants.DIVISION / 4 //16th
            }
            let note_type = NoteType.ACCIACCATURA

            if (gflags & GuitarPro.NOTE_APPOGIATURA) { //on beat
                note_type = NoteType.APPOGGIATURA
            }

            const grace_pitch = note.staff()!.part()!.instrument().stringData().getPitchForStaff(note.string(), fret, null)

            const gnote = this.score.setGraceNote(note.chord()!, grace_pitch, note_type, grace_len)

            // gp5 not supports more than one grace note,
            // so it's always should be shown as eight note
            gnote.chord()!.setDurationType(new Fraction(1, 8))

            gnote.setString(note.string())
            const sd = note.part()!.instrument().stringData()
            gnote.setFret(grace_pitch - sd.stringList()[sd.stringList().length - note.string() - 1].pitch)
            if (transition === 0) {
                // no transition
            } else if (transition === 1) {
            } else if (transition === 3) {
                const slur1 = new Slur(scoreDummy(this.score))
                slur1.setAnchor(SpannerAnchor.CHORD)
                slur1.setStartElement(gnote.chord())
                slur1.setEndElement(note.chord())
                slur1.setParent(null)
                slur1.setTrack(note.staffIdx())
                slur1.setTrack2(note.staffIdx())
                slur1.setTick(gnote.chord()!.tick())
                slur1.setTick2(note.chord()!.tick())
                this.score.addElement(slur1)
                //TODO: Add a 'slide' guitar effect when implemented
                //note->setSlideNote(gn);
            }
        }
        if (modMask2 & GuitarPro.EFFECT_STACCATO) {
            const chord = note.chord()!
            const a = new Articulation(chord)
            a.setSymId(SymId.articStaccatoAbove)
            let add = true
            for (const a1 of chord.articulations()) {
                if (a1.symId() === SymId.articStaccatoAbove) {
                    add = false
                    break
                }
            }
            if (add) {
                chord.add(a)
            }
        }
        if (modMask2 & GuitarPro.EFFECT_PALM_MUTE) {
            result.palmMute = true
        }

        if (modMask2 & GuitarPro.EFFECT_TREMOLO) { // tremolo picking length
            const tremoloDivision = this.readUInt8()
            if (tremoloDivision >= 1 && tremoloDivision <= 3) {
                const type = tremoloType(tremoloDivision)
                const chord = note.chord()!
                const t = new TremoloSingleChord(chord)
                t.setTremoloType(type)
                chord.add(t)
                this.m_tremolosInChords.set(chord, type)
            } else {
                console.debug('Unknown tremolo value')
            }
        }
        if (modMask2 & GuitarPro.EFFECT_SLIDE) {
            let slideKind = this.readUInt8()
            let sld: ChordLine | null = null
            let slideType = ChordLineType.NOTYPE

            if (slideKind & GuitarPro.SLIDE_OUT_DOWN) {
                slideKind &= ~GuitarPro.SLIDE_OUT_DOWN
                sld = new ChordLine(scoreDummy(this.score).chord())
                slideType = ChordLineType.FALL
            }
            // slide out upwards (doit)
            if (slideKind & GuitarPro.SLIDE_OUT_UP) {
                slideKind &= ~GuitarPro.SLIDE_OUT_UP
                sld = new ChordLine(scoreDummy(this.score).chord())
                slideType = ChordLineType.DOIT
            }
            // slide in from below (plop)
            if (slideKind & GuitarPro.SLIDE_IN_BELOW) {
                slideKind &= ~GuitarPro.SLIDE_IN_BELOW
                sld = new ChordLine(scoreDummy(this.score).chord())
                slideType = ChordLineType.PLOP
            }
            // slide in from above (scoop)
            if (slideKind & GuitarPro.SLIDE_IN_ABOVE) {
                slideKind &= ~GuitarPro.SLIDE_IN_ABOVE
                sld = new ChordLine(scoreDummy(this.score).chord())
                slideType = ChordLineType.SCOOP
            }

            if (sld) {
                sld.setChordLineType(slideType)
                sld.setStraight(true)
                note.chord()!.add(sld)
                sld.setNote(note)
            }

            if (slideKind & GuitarPro.LEGATO_SLIDE) {
                slideKind &= ~GuitarPro.LEGATO_SLIDE
                this.slideList.push(null)
                this.createSlur(true, note.staffIdx(), note.chord())
            }

            if (slideKind & GuitarPro.SHIFT_SLIDE) {
                slideKind &= ~GuitarPro.SHIFT_SLIDE
                this.slideList.push(note)
            }
        }

        if (modMask2 & GuitarPro.EFFECT_ARTIFICIAL_HARMONIC) {
            const type = this.readChar()
            if (type === GuitarPro.HARMONIC_MARK_NATURAL) {
                const fret = note.fret()

                note.setHarmonic(true)
                const harmonicFret = this.naturalHarmonicFromFret(fret)
                const harmonicOvertone = utils.harmonicOvertone(note, harmonicFret, type)
                note.setDisplayFret(DisplayFretOption.NaturalHarmonic)
                note.setHarmonicFret(harmonicFret)
                const staff = note.staff()!
                const pitch = staff.part()!.instrument().stringData().getPitchForStaff(note.string(), harmonicOvertone, staff)

                note.setPitch(clampPitch(pitch))
                note.setTpcFromPitch(Prefer.SHARPS)
            } else if (type >= GuitarPro.HARMONIC_MARK_ARTIFICIAL && type <= GuitarPro.HARMONIC_MARK_SEMI) {
                const fret = (type === GuitarPro.HARMONIC_MARK_TAP ? (this.readChar() - note.fret()) : note.fret())
                const midi = note.pitch() + fret
                const currentOctave = Math.floor(midi / 12)
                const harmNote = (type === GuitarPro.HARMONIC_MARK_ARTIFICIAL ? this.readChar() : 0)
                if (type === GuitarPro.HARMONIC_MARK_ARTIFICIAL) {
                    this.readChar()
                }

                const octave = currentOctave + (type === GuitarPro.HARMONIC_MARK_ARTIFICIAL ? this.readChar() : 0)

                const harmonicNote = new Note(note.chord())

                harmonicNote.setHarmonic(true)
                harmonicNote.setPlay(false)
                note.setPlay(true)
                /// @note option to show or not additional harmonic fret in "<>" to be implemented
                ///harmonicNote->setDisplayFret(Note::DisplayFretOption::ArtificialHarmonic);
                ///note->setDisplayFret(Note::DisplayFretOption::Hide);
                harmonicNote.setDisplayFret(DisplayFretOption.Hide)
                this.m_harmonicNotes.set(note, harmonicNote)

                const staff = note.staff()!
                let harmonicFret = 0
                switch (Math.trunc(((octave * 12) + harmNote) - midi)) {
                case 4:
                    harmonicFret = 12
                    break
                case 11:
                    harmonicFret = 7
                    break
                case 16:
                    harmonicFret = 5
                    break
                case 20:
                    harmonicFret = 4
                    break
                case 23:
                    harmonicFret = Math.fround(3.2)
                    break
                case 25:
                    harmonicFret = Math.fround(2.7)
                    break
                case 28:
                    harmonicFret = Math.fround(2.4)
                    break
                default:
                    harmonicFret = 12
                    break
                }

                const overtoneFret = utils.harmonicOvertone(note, harmonicFret, type)
                harmonicNote.setString(note.string())
                harmonicNote.setFret(note.fret())
                harmonicNote.setHarmonicFret(Math.fround(harmonicFret + fret))

                const pitch = staff.part()!.instrument().stringData().getPitchForStaff(note.string(), overtoneFret + note.part()!.capoFret(), staff)

                harmonicNote.setPitch(clampPitch(pitch))
                harmonicNote.setTpcFromPitch(Prefer.SHARPS)
                note.setHarmonicPitchOffset(harmonicNote.pitch() - note.pitch())
                note.chord()!.add(harmonicNote)

                switch (type) {
                case GuitarPro.HARMONIC_MARK_ARTIFICIAL:
                    result.harmonicArtificial = true
                    break
                case GuitarPro.HARMONIC_MARK_PINCH:
                    result.harmonicPinch = true
                    break
                case GuitarPro.HARMONIC_MARK_TAP:
                    result.harmonicTap = true
                    break
                case GuitarPro.HARMONIC_MARK_SEMI:
                    result.harmonicSemi = true
                    break
                }
            }
        }

        if (bendParent) {
            this.createBend(bendParent, bendData)
        }

        if (modMask2 & GuitarPro.EFFECT_VIBRATO) {
            result.vibrato = true
        }

        if (modMask2 & GuitarPro.EFFECT_TRILL) {
            this.readUInt8() // trill fret

            const period = this.readUInt8() // trill length
            result.trill = true

            switch (period) {
            case 1: // 16
                break
            case 2: // 32
                break
            case 3: // 64
                break
            default:
                console.debug(`unknown trill period ${period}`)
                break
            }
        }
        return result
    }

    //---------------------------------------------------------
    //   readNote
    //---------------------------------------------------------

    private readNote(string: number, note: Note): GuitarProReadNoteResult {
        const noteBits = this.readUInt8()
        //
        // noteBits:
        //    7 - Right hand or left hand fingering;
        //    6 - Accentuated note
        //    5 - Note type (rest, empty note, normal note);
        //    4 - note dynamic;
        //    3 - Presence of effects linked to the note;
        //    2 - Ghost note;
        //    1 - Dotted note;  ?
        //    0 - Time-independent duration

        if (noteBits & GuitarPro.NOTE_GHOST) {
            note.setGhost(true)
        }

        let tieNote = false

        if (noteBits & GuitarPro.NOTE_DEAD) {
            const noteType = this.readUInt8()
            if (noteType === 1) {
            } //standard note
            else if (noteType === 2) {
                tieNote = true
            } else if (noteType === 3) { // dead notes
                note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                note.setDeadNote(true)
            } else {
                console.debug(`unknown note type: ${noteType}`)
            }
        }

        const track = note.track()

        if (noteBits & GuitarPro.NOTE_DYNAMIC) { // velocity
            const d = this.readChar()
            if (this.previousDynamicByTrack[track] !== d) {
                this.previousDynamicByTrack[track] = d
                this.addDynamic(note, d)
            }
        } else if (this.previousDynamicByTrack[track] !== GuitarPro.DEFAULT_DYNAMIC) {
            this.previousDynamicByTrack[track] = GuitarPro.DEFAULT_DYNAMIC
            this.addDynamic(note, this.previousDynamicByTrack[track])
        }

        let fretNumber = 0
        if (noteBits & GuitarPro.NOTE_FRET) {
            fretNumber = this.readChar()
        }

        if (noteBits & GuitarPro.NOTE_FINGERING) {
            const leftFinger = this.readUInt8()
            const rightFinger = this.readUInt8()
            const fi = new Fingering(note)
            let finger = ''
            // if there is a valid left hand fingering
            if (leftFinger < 5) {
                if (leftFinger === 0) {
                    finger = 'T'
                } else if (leftFinger === 1) {
                    finger = '1'
                } else if (leftFinger === 2) {
                    finger = '2'
                } else if (leftFinger === 3) {
                    finger = '3'
                } else if (leftFinger === 4) {
                    finger = '4'
                }
            } else {
                if (rightFinger === 0) {
                    finger = 'T'
                } else if (rightFinger === 1) {
                    finger = 'I'
                } else if (rightFinger === 2) {
                    finger = 'M'
                } else if (rightFinger === 3) {
                    finger = 'A'
                } else if (rightFinger === 4) {
                    finger = 'O'
                }
            }
            fi.setPlainText(finger)
            note.add(fi)
            fi.reset()
        }

        if (noteBits & 0x1) { // Time independent duration
            this.skip(8)
        }

        // check if a note is supposed to be accented, and give it the marcato type
        if (noteBits & GuitarPro.NOTE_MARCATO) {
            const art = new Articulation(scoreDummy(note.score()).chord())
            art.setSymId(SymId.articMarcatoAbove)
            note.score().toggleArticulation(note, art)
        }
        // check if a note is supposed to be accented, and give it the sforzato type
        else if (noteBits & GuitarPro.NOTE_SFORZATO) {
            const art = new Articulation(scoreDummy(note.score()).chord())
            art.setSymId(SymId.articAccentAbove)
            note.add(art)
            note.score().toggleArticulation(note, art)
        }

        this.readUInt8() //skip

        const staff = note.staff()!
        if (fretNumber === 255 || fretNumber < 0) {
            fretNumber = 0
            note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
            note.setDeadNote(true)
        }
        const pitch = staff.part()!.instrument().stringData().getPitchForStaff(string, fretNumber + note.part()!.capoFret(), null)
        note.setFret(fretNumber)
        note.setString(string)
        note.setPitch(pitch)

        // This function uses string and fret number, so it should be set before this
        let result = new GuitarProReadNoteResult()
        if (noteBits & GuitarPro.NOTE_SLUR) {
            result = this.readNoteEffects(note)
        }

        if (tieNote) {
            const staffIdx = note.staffIdx()
            if (this.dead_end.get(`${staffIdx},${string}`) ?? false) {
                note.setFret(INVALID_FRET_INDEX)
                result.slur = false
                return result
            }
            if (this.slurs[staffIdx]) {
                this.score.removeSpanner(this.slurs[staffIdx]!)
                this.slurs[staffIdx] = null
            }
            let found = false
            const chord = note.chord()!
            let segment = chord.segment()!.prev1(SegmentType.ChordRest)
            const track = note.track()
            const chords: ChordRest[] = []
            let true_note: Note | null = null
            while (segment) {
                const e = segment.element(track)
                if (e && e.isChord()) {
                    const chord2 = e as unknown as Chord
                    for (const note2 of chord2.notes()) {
                        if (note2.string() === string) {
                            if (chords.length === 0) {
                                const tie = new Tie(note2)
                                tie.setEndNote(note)
                                note2.add(tie)
                            }

                            //  fixing gp5 bug with not storying let ring for tied notes
                            if (this.m_letRingForChords.has(chord2)) {
                                result.letRing = true
                                this.m_letRingForChords.delete(chord2)
                            }

                            if (this.m_harmonicNotes.has(note) && this.m_harmonicNotes.has(note2)) {
                                const startHarmonicNote = this.m_harmonicNotes.get(note2)!
                                const endHarmonicNote = this.m_harmonicNotes.get(note)!

                                const tieHarmonic = new Tie(startHarmonicNote)
                                tieHarmonic.setEndNote(endHarmonicNote)
                                startHarmonicNote.add(tieHarmonic)

                                this.m_harmonicNotes.delete(startHarmonicNote)
                                this.m_harmonicNotes.delete(endHarmonicNote)
                            }

                            note.setFret(note2.fret())
                            note.setPitch(note2.pitch())
                            true_note = note2
                            const type = this.m_tremolosInChords.get(chord2)
                            if (type !== undefined) {
                                const t = new TremoloSingleChord(scoreDummy(this.score).chord())
                                t.setTremoloType(type)
                                chord.add(t)
                                this.m_tremolosInChords.delete(chord2)
                                this.m_tremolosInChords.set(chord, type)
                            }

                            found = true
                            break
                        }
                    }
                    if (found) {
                        break
                    } else if (e) {
                        chords.push(e as unknown as ChordRest)
                    }
                }
                segment = segment.prev1(SegmentType.ChordRest)
            }

            if (true_note && chords.length) {
                let end_note = note
                for (let i = 0; i < chords.length; ++i) {
                    let chord1: Chord
                    const cr = chords[i]
                    if (cr.isChord()) {
                        chord1 = cr as Chord
                    } else {
                        const rest = cr as Rest
                        const dur = rest.ticks()
                        const dut = rest.durationType()
                        const seg = rest.segment()!
                        seg.remove(rest)
                        const tuplet = rest.tuplet()
                        if (tuplet) {
                            tuplet.remove(rest)
                        }
                        chord1 = new Chord(seg)
                        chord1.setTrack(note.track())
                        chord1.setTicks(dur)
                        chord1.setDurationType(dut)
                        seg.add(chord1)
                        if (tuplet) {
                            tuplet.add(chord1)
                        }
                    }

                    const note2 = new Note(chord1)
                    note2.setString(true_note.string())
                    note2.setFret(true_note.fret())
                    note2.setPitch(true_note.pitch())
                    note2.setTpcFromPitch(Prefer.SHARPS)
                    chord1.setNoteType(true_note.noteType())
                    chord1.add(note2)
                    const tie = new Tie(note2)
                    tie.setEndNote(end_note)
                    end_note.setHarmonic(true_note.harmonic())
                    end_note = note2
                    note2.add(tie)
                }
                const tie = new Tie(true_note)
                tie.setEndNote(end_note)
                end_note.setHarmonic(true_note.harmonic())
                true_note.add(tie)
            }
            if (!found) {
                note.setFret(INVALID_FRET_INDEX)
                this.dead_end.set(`${staffIdx},${string}`, true)
                console.debug(`tied note not found, pitch ${note.pitch()} fret ${note.fret()} string ${note.string()}`)
                result.slur = false
                return result
            }
        }
        this.dead_end.set(`${note.staffIdx()},${string}`, false)
        return result
    }

    private naturalHarmonicFromFret(fret: number): number {
        // C++ returns float
        switch (fret) {
        case 2:
            return Math.fround(2.4)
        case 3:
            return Math.fround(3.2)
        case 4:
        case 5:
        case 7:
        case 9:
        case 12:
        case 16:
        case 17:
        case 19:
        case 24:
            return fret
        case 8:
            return Math.fround(8.2)
        case 10:
            return Math.fround(9.6)
        case 14:
            return Math.fround(14.7)
        case 15:
            return Math.fround(14.7)
        case 21:
            return Math.fround(21.7)
        case 22:
            return Math.fround(21.7)
        default:
            return 12.0
        }
    }

    private addGlissandos(): void {
        for (const [startNote, endNote] of this.m_glissandoNotePairs) {
            let currentStart = startNote
            if (startNote.bendFor()) {
                let bendNote: Note | null = startNote
                let bend = bendNote.bendFor()

                while (bend) {
                    bendNote = bend.endNote()
                    if (!bendNote) {
                        console.error('glissando start note may be incorrect')
                        break
                    }

                    if (!bendNote.chord()!.isGraceAfter()) {
                        break
                    }

                    currentStart = bendNote
                    bend = bendNote.bendFor()
                }
            }

            const gliss = new Glissando(currentStart)
            gliss.setAnchor(SpannerAnchor.NOTE)
            gliss.setStartElement(currentStart)
            gliss.setTick(currentStart.tick())
            gliss.setTrack(currentStart.track())
            gliss.setParent(currentStart)
            gliss.setGlissandoType(GlissandoType.STRAIGHT)
            gliss.setGlissandoShift(true)
            gliss.setEndElement(endNote)
            gliss.setTick2(endNote.tick())
            gliss.setTrack2(endNote.track())
            this.score.addElement(gliss)

            const movedSlurs: [Slur, Note][] = []
            for (const spanner of startNote.chord()!.startingSpanners()) {
                if (spanner && spanner.isSlur()) {
                    const slur = spanner as Slur
                    if (slur.endElement() === endNote.chord()) {
                        gliss.setGlissandoShift(false)
                        slur.setConnectedElement(SlurConnectedElement.GLISSANDO)
                        movedSlurs.push([slur, currentStart])
                        break
                    }
                }
            }

            for (const [slur, note] of movedSlurs) {
                slur.setStartElement(note.chord())
                slur.setTick(note.tick())
                slur.setTrack(note.track())
            }
        }
    }
}
