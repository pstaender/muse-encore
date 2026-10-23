/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpconverter.h/.cpp (GPConverter): converts the GP DOM model of
 * .gp/.gpx files (GP6/GP7) to the score.
 */

import { mtrc, arg } from '../../../../framework/global/translation'
import { Fraction } from '../../../../engraving/types/fraction'
import {
    ArpeggioType, ArticulationTextType, BarLineType, BeamMode, BracketType, CapoParams, CapoTransposeMode, ChordLineType,
    DirectionV, DurationType, ElementType, GlissandoType, GradualTempoChangeType, JumpType, Key, KeyMode, LyricsSyllabic,
    MarkerType, TappingHand, TextStyleType, TremoloType, VOICES as ENGRAVING_VOICES, isTremoloTwoChord, nidx, staff2track,
    track2staff, type track_idx_t,
} from '../../../../engraving/types/types'
import { Constants } from '../../../../engraving/types/constants'
import { SymId } from '../../../../engraving/types/symid'
import { PitchValue, type PitchValues } from '../../../../engraving/types/pitchvalue'
import { Factory } from '../../../../engraving/dom/factory'
import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import type { Score } from '../../../../engraving/dom/score'
import type { Measure } from '../../../../engraving/dom/measure'
import type { MeasureBase } from '../../../../engraving/dom/measurebase'
import { SegmentType, type Segment } from '../../../../engraving/dom/segment'
import type { EngravingItem } from '../../../../engraving/dom/engravingitem'
import { NoteType, type ChordRest } from '../../../../engraving/dom/chordrest'
import type { Chord } from '../../../../engraving/dom/chord'
import { DisplayFretOption, type Note } from '../../../../engraving/dom/note'
import type { Rest } from '../../../../engraving/dom/rest'
import type { Tie } from '../../../../engraving/dom/tie'
import { SlurConnectedElement, type Slur } from '../../../../engraving/dom/slur'
import { TupletBracketType, TupletNumberType, type Tuplet } from '../../../../engraving/dom/tuplet'
import { TDuration } from '../../../../engraving/dom/durationtype'
import { Volta } from '../../../../engraving/dom/volta'
import type { Jump } from '../../../../engraving/dom/jump'
import type { Marker } from '../../../../engraving/dom/marker'
import { Pid, PropertyFlags } from '../../../../engraving/dom/property'
import { RehearsalMarkType, type RehearsalMark } from '../../../../engraving/dom/rehearsalmark'
import { TripletFeel, TripletFeelType } from '../../../../engraving/dom/tripletfeel'
import { DeadSlapped } from '../../../../engraving/dom/deadslapped'
import type { KeySig } from '../../../../engraving/dom/keysig'
import type { TimeSig } from '../../../../engraving/dom/timesig'
import type { StaffText } from '../../../../engraving/dom/stafftextbase'
import { Text } from '../../../../engraving/dom/text'
import { Part } from '../../../../engraving/dom/part'
import { Instrument } from '../../../../engraving/dom/instrument'
import { InstrumentChange } from '../../../../engraving/dom/instrchange'
import { Interval } from '../../../../engraving/dom/interval'
import { StringData } from '../../../../engraving/dom/stringdata'
import { StaffType, StaffTypes } from '../../../../engraving/dom/stafftype'
import type { BracketItem } from '../../../../engraving/dom/bracketitem'
import { BracketItem as BracketItemClass } from '../../../../engraving/dom/bracketitem'
import type { Glissando } from '../../../../engraving/dom/glissando'
import type { HammerOnPullOff } from '../../../../engraving/dom/hammeronpulloff'
import { SpannerAnchor } from '../../../../engraving/dom/spanner'
import type { GuitarBend } from '../../../../engraving/dom/guitarbend'
import type { Fermata } from '../../../../engraving/dom/fermata'
import type { TempoText } from '../../../../engraving/dom/tempotext'
import type { GradualTempoChange } from '../../../../engraving/dom/gradualtempochange'
import type { MeasureRepeat } from '../../../../engraving/dom/measurerepeat'
import { ClefType } from '../../../../engraving/types/types'
import { ClefTypeList } from '../../../../engraving/dom/clefinfo'
import type { Clef } from '../../../../engraving/dom/clef'
import type { Fingering } from '../../../../engraving/dom/fingering'
import { FrameType } from '../../../../engraving/dom/textbase'
import type { Articulation } from '../../../../engraving/dom/articulation'
import { ArticulationAnchor } from '../../../../engraving/dom/articulation'
import type { ChordLine } from '../../../../engraving/dom/chordline'
import type { Dynamic } from '../../../../engraving/dom/dynamic'
import type { Harmony } from '../../../../engraving/dom/harmony'
import { HarmonyType } from '../../../../engraving/dom/harmony'
import type { FretDiagram } from '../../../../engraving/dom/fret'
import { FretMarkerType } from '../../../../engraving/dom/fret'
import type { Tapping } from '../../../../engraving/dom/tapping'
import type { Arpeggio } from '../../../../engraving/dom/arpeggio'
import type { Lyrics } from '../../../../engraving/dom/lyrics'
import type { TremoloSingleChord } from '../../../../engraving/dom/tremolosinglechord'
import type { Capo } from '../../../../engraving/dom/capo'
import { clampPitch } from '../../../../engraving/dom/pitchspelling'
import { OttavaType, ottavaDefault } from '../../../../engraving/dom/ottava'
import { EngravingConfiguration } from '../../../../engraving/internal/engravingconfiguration'
import '../../../../engraving/editing/edit' // Score.setRest
import '../../../../engraving/editing/cmd' // Score.toggleArticulation

import { ContiniousElementsBuilder, ContiniousElementsBuilderHarmonicMarkSubType, ContiniousElementsBuilderImportType,
    ContiniousElementsBuilderVibratoSubType } from '../continiouselementsbuilder'
import { GuitarBendImporter } from '../guitarbendimport/guitarbendimporter'
import * as utils from '../utils'
import * as drumset from '../guitarprodrumset'
import { GPDrumSetResolver } from './gpdrumsetresolver'
import type { GPDomModel } from './gpdommodel'
import type { GPScore } from './gpscore'
import type { GPTrack } from './gptrack'
import type { GPMasterTracks, GPMasterTracksAutomation } from './gpmastertracks'
import {
    GPMasterBarBarlineType, GPMasterBarDirectionType, GPMasterBarFermataType, GPMasterBarKeySig, GPMasterBarKeySigMode,
    GPMasterBarRepeatType, GPMasterBarTimeSig, GPMasterBarTripletFeelType, type GPMasterBar, type GPMasterBarFermata,
} from './gpmasterbar'
import { GPBarClefType, GPBarOttaviaType, GPBarSimileMark, type GPBar, type GPBarClef } from './gpbar'
import type { GPVoice } from './gpvoice'
import {
    GPBeatArpeggio, GPBeatBeamMode, GPBeatBrush, GPBeatDynamicType, GPBeatFadding, GPBeatGolpe, GPBeatGraceNotes,
    GPBeatHairpin, GPBeatHarmonicMarkType, GPBeatLegatoType, GPBeatOttavaType, GPBeatPickStroke, GPBeatRasgueado,
    GPBeatTappingHand, GPBeatVibratoLeftHand, GPBeatVibratoWTremBar, GPBeatWah, type GPBeat, type GPBeatBarre,
    type GPBeatTremolo,
} from './gpbeat'
import {
    GPNoteHammerOn, GPNoteHarmonic, GPNoteHarmonicType, GPNoteOrnament, GPNotePickScrape, GPNoteTieType, GPNoteVibratoType,
    GPNote, type GPNoteMidiPitch,
} from './gpnote'
import { GPRhythmRhytmType } from './gprhythm'

type ChordRestContainer = [ChordRest, GPBeat][]
type TieMap = Map<track_idx_t, Tie[]>

export class GPConverterContext {
    masterBarIndex = 0
    curTrack: track_idx_t = 0
    curTick = new Fraction()

    clone(): GPConverterContext {
        const c = new GPConverterContext()
        c.masterBarIndex = this.masterBarIndex
        c.curTrack = this.curTrack
        c.curTick = this.curTick
        return c
    }
}

export enum GPConverterSlideHammerOn {
    LegatoSlide, Slide, HammerOn,
}

class NextTupletInfo {
    static readonly LOWEST_BASE = 1024

    ratio = new Fraction()
    duration = new Fraction() // duration of all current elements
    elements: ChordRest[] = [] // elements that will be added to tuplet
    track: track_idx_t = 0
    tuplet: Tuplet | null = null
    measure: Measure | null = null
    lowestBase = NextTupletInfo.LOWEST_BASE // expected denominator
}

function jumpType(typeString: string): JumpType {
    const types = new Map<string, JumpType>([
        ['DaCapo', JumpType.DC],
        ['DaSegno', JumpType.DS],
        ['DaCapoAlFine', JumpType.DC_AL_FINE],
        ['DaCapoAlCoda', JumpType.DC_AL_CODA],
        ['DaCapoAlDoubleCoda', JumpType.DC_AL_DBLCODA],
        ['DaSegnoAlCoda', JumpType.DS_AL_CODA],
        ['DaSegnoAlDoubleCoda', JumpType.DS_AL_DBLCODA],
        ['DaSegnoAlFine', JumpType.DS_AL_FINE],
        ['DaSegnoSegno', JumpType.DSS],
        ['DaSegnoSegnoAlCoda', JumpType.DSS_AL_CODA],
        ['DaSegnoSegnoAlDoubleCoda', JumpType.DSS_AL_DBLCODA],
        ['DaSegnoSegnoAlFine', JumpType.DSS_AL_FINE],
    ])

    const t = types.get(typeString)
    if (t !== undefined) {
        return t
    }

    // LOGE: wrong jump type
    return JumpType.USER
}

function markerType(typeString: string): MarkerType {
    const types = new Map<string, MarkerType>([
        ['Segno', MarkerType.SEGNO],
        ['SegnoSegno', MarkerType.VARSEGNO],
        ['Coda', MarkerType.CODA],
        ['DoubleCoda', MarkerType.VARCODA],
        ['Fine', MarkerType.FINE],
        ['DaCoda', MarkerType.DA_CODA],
        ['DaDoubleCoda', MarkerType.DA_DBLCODA],
    ])

    const t = types.get(typeString)
    if (t !== undefined) {
        return t
    }

    // LOGE: wrong direction marker type
    return MarkerType.USER
}

function tripletFeelType(tf: GPMasterBarTripletFeelType): TripletFeelType {
    switch (tf) {
    case GPMasterBarTripletFeelType.Triplet8th: return TripletFeelType.TRIPLET_8TH
    case GPMasterBarTripletFeelType.Triplet16th: return TripletFeelType.TRIPLET_16TH
    case GPMasterBarTripletFeelType.Dotted8th: return TripletFeelType.DOTTED_8TH
    case GPMasterBarTripletFeelType.Dotted16th: return TripletFeelType.DOTTED_16TH
    case GPMasterBarTripletFeelType.Scottish8th: return TripletFeelType.SCOTTISH_8TH
    case GPMasterBarTripletFeelType.Scottish16th: return TripletFeelType.SCOTTISH_16TH
    case GPMasterBarTripletFeelType.None: return TripletFeelType.NONE
    }
    return TripletFeelType.NONE
}

function ottavaType(t: GPBeatOttavaType): [boolean, OttavaType] {
    switch (t) {
    case GPBeatOttavaType.va8: return [true, OttavaType.OTTAVA_8VA]
    case GPBeatOttavaType.vb8: return [true, OttavaType.OTTAVA_8VB]
    case GPBeatOttavaType.ma15: return [true, OttavaType.OTTAVA_15MA]
    case GPBeatOttavaType.mb15: return [true, OttavaType.OTTAVA_15MB]
    default: return [false, OttavaType.OTTAVA_8VA]
    }
}

function harmonicTypeNoteToBeat(t: GPNoteHarmonicType): GPBeatHarmonicMarkType {
    switch (t) {
    case GPNoteHarmonicType.Artificial: return GPBeatHarmonicMarkType.Artificial
    case GPNoteHarmonicType.Pinch: return GPBeatHarmonicMarkType.Pinch
    case GPNoteHarmonicType.Tap: return GPBeatHarmonicMarkType.Tap
    case GPNoteHarmonicType.Semi: return GPBeatHarmonicMarkType.Semi
    case GPNoteHarmonicType.FeedBack: return GPBeatHarmonicMarkType.FeedBack
    default: return GPBeatHarmonicMarkType.None
    }
}

function ottavaToImportType(t: GPBeatOttavaType): ContiniousElementsBuilderImportType {
    switch (t) {
    case GPBeatOttavaType.ma15: return ContiniousElementsBuilderImportType.OTTAVA_MA15
    case GPBeatOttavaType.va8: return ContiniousElementsBuilderImportType.OTTAVA_VA8
    case GPBeatOttavaType.vb8: return ContiniousElementsBuilderImportType.OTTAVA_VB8
    case GPBeatOttavaType.mb15: return ContiniousElementsBuilderImportType.OTTAVA_MB15
    default: return ContiniousElementsBuilderImportType.NONE
    }
}

function hairpinToImportType(t: GPBeatHairpin): ContiniousElementsBuilderImportType {
    switch (t) {
    case GPBeatHairpin.Crescendo: return ContiniousElementsBuilderImportType.HAIRPIN_CRESCENDO
    case GPBeatHairpin.Decrescendo: return ContiniousElementsBuilderImportType.HAIRPIN_DIMINUENDO
    default: return ContiniousElementsBuilderImportType.NONE
    }
}

function setPitchByOttavaType(note: Note, type: OttavaType): void {
    note.setPitch(clampPitch(note.pitch() - ottavaDefault[type].shift, true))
}

/** C++ std::lround */
function lround(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

/** C++ GPMasterBar::KeySig default (operator[] of the unordered_map inserts a default value) */
const DEFAULT_KEYSIG = new GPMasterBarKeySig()

// C++ the static local insideFreeTime of GPConverter::addBarline
let s_insideFreeTime = false

export class GPConverter {
    static readonly PERC_CHANNEL = 9
    static readonly VOICES = ENGRAVING_VOICES

    private _score: Score
    private _gpDom: GPDomModel

    private _slideHammerOnMap: [Note, GPConverterSlideHammerOn][] = []

    private _lastTimeSig = new GPMasterBarTimeSig()
    private _lastTripletFeel = GPMasterBarTripletFeelType.None
    private _lastKeySigs = new Map<number, GPMasterBarKeySig>()
    private _fermatas: [Measure, GPMasterBarFermata][] = []
    private _tempoMap = new Map<number, GPMasterTracksAutomation[]>() // C++ unordered_multimap
    private _clefs = new Map<track_idx_t, GPBarClef>()
    private _dynamics = new Map<track_idx_t, GPBeatDynamicType>()
    private m_hasCapo = new Map<track_idx_t, boolean>()
    private _ties: TieMap = new Map() // map(track, tie)
    private _harmonicTies: TieMap = new Map() // map(track, tie between harmonic note)
    private m_originalPitches = new Map<Note, number>() // info of changed pitches for keeping track of ties
    private m_tremolosInChords = new Map<Chord, TremoloType>()
    private _slurs = new Map<track_idx_t, Slur | null>() // map(track, slur)
    private m_capoParams = new Map<number /* part ID */, number /* fret position */>()

    private m_currentGPBeat: GPBeat | null = null // used for passing info from notes

    private _drumExtension = new Map<number, number>()
    private _lastVolta: Volta | null = null
    private _lastDiagramIdx = -1

    private m_nextTupletInfo = new NextTupletInfo()

    // Index is the number of sharps. Using flat keysigs for signatures with double sharps
    private m_sharpsToKeyConverter = [0, 1, 2, 3, 4, 5, 6, 7, -4, -3, -2, -1]
    // Index is the number of sharps. Using sharp keysigs for signatures with double flats
    private m_sharpsToFlatKeysConverter = [0, 1, 2, 3, 4, -7, -6, -5, -4, -3, -2, -1]

    private m_showCapo = true // TODO-gp : settings

    private m_chordExistsInBar = false
    private m_chordExistsForVoice: boolean[] = [false, false, false, false]

    private m_previousBeamMode = BeamMode.AUTO

    private _drumResolver: GPDrumSetResolver
    private m_continiousElementsBuilder: ContiniousElementsBuilder
    private m_guitarBendImporter: GuitarBendImporter

    constructor(score: Score, gpDom: GPDomModel) {
        this._score = score
        this._gpDom = gpDom

        this._drumExtension = new Map<number, number>([
            [91, 40], //Snare(rim shot)
            [92, 42], //Hi Hat (half)
            [93, 51], //Ride (edje)
            [94, 59], //Ride (choke)
            [95, 55], //Splash (choke)
            [96, 52], //Chine(choke)
            [97, 49], //Crash high (choke)
            [98, 57], //Crash medium (choke)
            [99, 56], //Cowbell low (hit)
            [100, 56], //Cowbell low (tip)
            [101, 56], //Cowbell medium (tip)
            [102, 56], //Cowbell high (hit)
            [103, 56], //Cowbell high (tip)
            [104, 60], //Hand (mute)
            [105, 60], //Hand (slap)
            [106, 61], //Hand (mute)
            [107, 61], //Hand (slap)
            [108, 64], //Conga low (slap)
            [109, 64], //Conga low (mute)
            [110, 64], //Conga high (slap)
            [111, 54], //Tambourine (return)
            [112, 54], //Tambourine (roll)
            [113, 54], //Tambourine (hand)
            [114, 43], //Grancassa (hit)
            [115, 49], //Piatti (hit)
            [116, 49], //Piatti (hand)
            [117, 69], //Cabasa (return)
            [118, 70], //Left Maraca (return)
            [119, 70], //Right Maraca (hit)
            [120, 70], //Right Maraca (return)
            [122, 82], //Shaker (return)
            [123, 84], //Bell Tree (return)
            [124, 62], //Golpe (thumb)
            [125, 62], //Golpe (finger)
            [126, 59], //Ride (middle)
            [127, 59], //Ride (bell)
        ])

        this._drumResolver = new GPDrumSetResolver()
        this._drumResolver.initGPDrum()
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this._score)
        this.m_guitarBendImporter = new GuitarBendImporter(this._score)
    }

    gpDom(): GPDomModel {
        return this._gpDom
    }

    convertGP(): void {
        this.setUpGPScore(this._gpDom.score()!)
        this.setUpTracks(this._gpDom.tracks())
        this.collectTempoMap(this._gpDom.masterTracks()!)

        this.convert(this._gpDom.masterBars())

        this.clearDefectedSpanner()
        this.fixPercussion()
        this.addCapos()
    }

    private fixPercussion(): void {
        // After reading some of the GP files, there're
        // parts, which contain only one percussion instrument.
        // In this case the program value for this instrument will
        // be set to the pitch value of the notes of the instrument,
        // thus we need to reset this value to 0.
        for (const pPart of this._score.parts()) {
            if (!pPart) {
                continue
            }

            const pInstrument = pPart.instrument()
            if (!pInstrument) {
                continue
            }

            if (!pInstrument.useDrumset()) {
                continue
            }

            if (pPart.midiChannel() === GPConverter.PERC_CHANNEL) {
                pPart.setMidiProgram(0, 128)
            }
        }
    }

    private fillTuplet(): void {
        const info = this.m_nextTupletInfo
        if (info.elements.length === 0 || !info.tuplet) {
            // LOGE: not able to add elements to tuplet
            return
        }

        const tuplet = info.tuplet
        const firstCr = info.elements[0]
        tuplet.setTrack(firstCr.track())
        tuplet.setParent(firstCr.measure())
        tuplet.setTick(firstCr.tick())
        tuplet.setBaseLen(new TDuration(new Fraction(1, info.lowestBase)))
        tuplet.setTicks(info.duration)
        this.setupTupletStyle(tuplet)

        for (const elem of info.elements) {
            tuplet.add(elem)
        }

        /// TODO: solve correctly within engraving
        /// avoiding brackets on single note
        if (tuplet.elements().length === 1) {
            tuplet.setBracketType(TupletBracketType.SHOW_NO_BRACKET)
        }

        info.elements = []
        info.tuplet = null
        info.duration = new Fraction()
        info.lowestBase = NextTupletInfo.LOWEST_BASE
    }

    private convert(masterBars: readonly GPMasterBar[]): void {
        for (let mi = 0; mi < masterBars.length; ++mi) {
            const ctx = new GPConverterContext()
            ctx.masterBarIndex = mi
            this.convertMasterBar(masterBars[mi], ctx)
        }

        // glueing line segment elements separated with rests
        this.m_continiousElementsBuilder.addElementsToScore()

        this.addTempoMap()
        this.addInstrumentChanges()
        this.m_guitarBendImporter.applyBendsToChords()

        this.addFermatas()
        this.addContinuousSlideHammerOn()
    }

    private convertMasterBar(mB: GPMasterBar, ctx: GPConverterContext): void {
        const measure = this.addMeasure(mB)

        this.addTimeSig(mB, measure)
        this.addKeySig(mB, measure)
        this.addBarline(mB, measure, ctx.masterBarIndex)
        this.addRepeat(mB, measure)
        this.collectFermatas(mB, measure)
        this.convertBars(mB.bars(), ctx.clone())
        this.addTripletFeel(mB, measure)
        this.addSection(mB, measure)
        this.addDirection(mB, measure)

        this.fixEmptyMeasures()
    }

    private fixEmptyMeasures(): void {
        // Get all ChordRest elems and sort them by staves
        // Also store root Segment ptr will need it later to delete some rest elems
        const elems = new Map<track_idx_t, [Segment, EngravingItem][]>()

        const ntracks = this._score.ntracks()
        const type = SegmentType.ChordRest
        const lastMeasure = this._score.lastMeasure()!

        for (let s = lastMeasure.segments().first(type); s; s = s.next(type)) {
            for (let i = 0; i < ntracks; ++i) {
                const e = s.element(i)
                if (!e) {
                    continue
                }
                const key = Math.trunc(i / GPConverter.VOICES)
                let list = elems.get(key)
                if (!list) {
                    list = []
                    elems.set(key, list)
                }
                list.push([s, e])
            }
        }

        // C++ std::map: sorted by staff
        for (const staffIdx of [...elems.keys()].sort((a, b) => a - b)) {
            const segItemPairs = elems.get(staffIdx)!
            let shouldClear = true
            for (const p of segItemPairs) {
                // Don't need to do anything if there is not "rest" elem on a staff
                if (!p[1].isRest()) {
                    shouldClear = false
                    break
                }
            }
            if (shouldClear) {
                // Keep only one rest element in a bar and make its duration V_MEASURE
                // that way layout can recognize this bar as "empty"
                // and properly render mmrests
                if (segItemPairs.length === 0) {
                    continue
                }
                for (let i = 1; i < segItemPairs.length; ++i) {
                    const rest = segItemPairs[i][1] as Rest
                    const tuplet = rest.tuplet()
                    if (tuplet) {
                        tuplet.remove(rest)
                    }

                    segItemPairs[i][0].remove(rest)
                }

                const rest = segItemPairs[0][1] as Rest
                rest.setTicks(lastMeasure.ticks())
                rest.setDurationType(new TDuration(DurationType.V_MEASURE))
                const tuplet = rest.tuplet()
                if (tuplet) {
                    tuplet.remove(rest)
                    if (tuplet.elements().length === 0) {
                        if (tuplet.tuplet()) {
                            tuplet.tuplet()!.remove(tuplet)
                        }
                        // C++ delete tuplet
                    }
                }
            }
        }
    }

    private convertBars(bars: readonly GPBar[], ctx: GPConverterContext): void {
        ctx.curTrack = 0
        for (const bar of bars) {
            this.m_chordExistsInBar = false
            this.m_chordExistsForVoice.fill(false)
            this.convertBar(bar, ctx.clone())
            ctx.curTrack += GPConverter.VOICES
        }
    }

    private convertBar(bar: GPBar, ctx: GPConverterContext): void {
        this.addClef(bar, ctx.curTrack)

        if (this.addSimileMark(bar, ctx.curTrack)) {
            return
        }

        this.convertVoices(bar.voices(), ctx.clone())
        this.hideRestsInEmptyMeasures(ctx.curTrack, ctx.curTrack + GPConverter.VOICES)
    }

    private addBarline(mB: GPMasterBar, measure: Measure, masterBarIndex: number): void {
        const staves = this._score.staves().length
        const lastMeasure = (masterBarIndex === this._gpDom.masterBars().length - 1)

        if (!lastMeasure && mB.barlineType() === GPMasterBarBarlineType.NORMAL) {
            for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
                measure.setEndBarLineType(BarLineType.NORMAL, staffIdx * GPConverter.VOICES)
            }
        }

        if (!lastMeasure && mB.barlineType() === GPMasterBarBarlineType.DOUBLE) {
            for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
                measure.setEndBarLineType(BarLineType.DOUBLE, staffIdx * GPConverter.VOICES)
            }
        }

        const sig = mB.timeSig()
        const scoreTimeSig = new Fraction(sig.numerator, sig.denominator)

        if (mB.freeTime()) {
            if (!lastMeasure && mB.barlineType() !== GPMasterBarBarlineType.DOUBLE) {
                for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
                    measure.setEndBarLineType(BarLineType.BROKEN, staffIdx * GPConverter.VOICES)
                }
            }
            if (!s_insideFreeTime) {
                s_insideFreeTime = true

                // Free time text
                for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
                    const s = measure.getSegment(SegmentType.TimeSig, measure.tick())
                    const st = Factory.createItem(ElementType.STAFF_TEXT, s) as StaffText
                    st.setTrack(staffIdx * GPConverter.VOICES)
                    st.setPlainText(mtrc('iex_guitarpro', 'Free time', 'time signature'))
                    s.add(st)

                    // if timeSig is different, it was added before, here we handle "freetime"
                    if (this._lastTimeSig.numerator !== sig.numerator
                        || this._lastTimeSig.denominator !== sig.denominator) {
                        return
                    }
                    const ts = Factory.createItem(ElementType.TIMESIG, s) as TimeSig
                    ts.setSig(scoreTimeSig)
                    ts.setTrack(staffIdx * GPConverter.VOICES)
                    ts.setLargeParentheses(true)
                    s.add(ts)
                }
            }
        } else {
            s_insideFreeTime = false
        }
        this._lastTimeSig.numerator = sig.numerator
        this._lastTimeSig.denominator = sig.denominator
    }

    private convertVoices(voices: readonly GPVoice[], ctx: GPConverterContext): void {
        if (voices.length === 0) {
            ctx.curTick = this._score.lastMeasure()!.tick()
            this.fillUncompletedMeasure(ctx)
        }

        const currentTrackFirstVoice = ctx.curTrack
        for (const voice of voices) {
            ctx.curTrack = currentTrackFirstVoice + voice.position()
            this.convertVoice(voice, ctx.clone())
        }

        const hasFirstVoice = voices.some(voice => voice.position() === 0)

        if (!hasFirstVoice && this._score.lastMeasure()) {
            this._score.setRest(this._score.lastMeasure()!.tick(), currentTrackFirstVoice, this._score.lastMeasure()!.ticks(), true, null)
        }
    }

    private convertVoice(voice: GPVoice, ctx: GPConverterContext): void {
        ctx.curTick = this._score.lastMeasure()!.tick()
        this.convertBeats(voice.beats(), ctx.clone())
    }

    private convertBeats(beats: readonly GPBeat[], ctx: GPConverterContext): void {
        const graceChords: ChordRestContainer = []
        for (const beat of beats) {
            this.m_currentGPBeat = beat
            ctx.curTick = this.convertBeat(beat, graceChords, ctx.clone())
        }

        this.fillUncompletedMeasure(ctx)
        this.clearDefectedGraceChord(graceChords)
    }

    private convertBeat(beat: GPBeat, graceChords: ChordRestContainer, ctx: GPConverterContext): Fraction {
        const lastMeasure = this._score.lastMeasure()!

        if (ctx.curTick.ge(lastMeasure.ticks().plus(lastMeasure.tick()))) {
            return ctx.curTick
        }

        const curSegment = lastMeasure.getSegment(SegmentType.ChordRest, ctx.curTick)

        const cr = this.addChordRest(beat, ctx)
        if (cr) {
            curSegment.setTicks(cr.ticks())
        }
        if (EngravingConfiguration.guitarProImportExperimental() && beat.deadSlapped() && cr.isRest()) {
            const rest = cr as Rest
            curSegment.add(rest)
            const dc = new DeadSlapped(rest)
            dc.setTrack(rest.track())
            rest.add(dc)
        } else {
            if (beat.graceNotes() !== GPBeatGraceNotes.None) {
                if (cr.isRest()) {
                    // C++ delete cr
                    return ctx.curTick
                }

                curSegment.add(cr)

                graceChords.push([cr, beat])

                return ctx.curTick
            }

            curSegment.add(cr)

            if (cr.isChord()) {
                this.m_chordExistsForVoice[ctx.curTrack % GPConverter.VOICES] = true
                this.m_chordExistsInBar = true

                if (beat.stemOrientationUserDefined()) {
                    (cr as Chord).setStemDirection(beat.stemOrientationUp() ? DirectionV.UP : DirectionV.DOWN)
                }

                this.setBeamMode(beat, cr, lastMeasure, ctx.curTick)
            }

            if (cr.isChord() && graceChords.length) {
                let grIndex = 0

                for (const [pGrChord, pBeat] of graceChords) {
                    this.configureGraceChord(pBeat, pGrChord, beat.ottavaType())
                    if (pGrChord.isChord()) {
                        (pGrChord as Chord).setGraceIndex(grIndex++)
                    }

                    const fr = new Fraction(1, (graceChords.length === 1 ? 1 : 2) * 8)
                    pGrChord.setDurationType(new TDuration(fr))

                    cr.add(pGrChord)
                    this.addLegato(pBeat, pGrChord)
                }
                graceChords.length = 0
            }

            this.convertNotes(beat.notes(), cr)

            this.addTuplet(beat, cr)
            this.addTimer(beat, cr)
            this.addFreeText(beat, cr)
            this.addFadding(beat, cr)
            this.addHairPin(beat, cr)
            this.addTremolo(beat, cr)
            this.addPickStroke(beat, cr)
            this.addDynamic(beat, cr)
            this.addWah(beat, cr)
            this.addGolpe(beat, cr)
            this.addFretDiagram(beat, cr, ctx)
            this.addBarre(beat, cr)
            this.addTapping(beat, cr)
            this.addSlapped(beat, cr)
            this.addPopped(beat, cr)
            this.addBrush(beat, cr)
            this.addArpeggio(beat, cr)
            this.addLyrics(beat, cr, ctx)
            this.addLegato(beat, cr)

            // line segment elements
            this.addOttava(beat, cr)
            this.addLetRing(beat, cr)
            this.addPalmMute(beat, cr)
            this.addTrill(beat, cr)
            this.addRasgueado(beat, cr)
            this.addDive(beat, cr)
            this.addPickScrape(beat, cr)
            this.addHarmonicMark(beat, cr)
            this.addVibratoLeftHand(beat, cr)
            this.addVibratoWTremBar(beat, cr)
        }

        ctx.curTick = ctx.curTick.plus(cr.actualTicks())

        return ctx.curTick
    }

    private convertNotes(notes: readonly GPNote[], cr: ChordRest): void {
        for (const note of notes) {
            this.convertNote(note, cr)
        }

        //! NOTE: later notes order is used in linked staff to create ties, glissando
        if (cr.isChord()) {
            (cr as Chord).sortNotes()
        }
    }

    private convertNote(gpnote: GPNote, cr: ChordRest): void {
        if (!cr.isChord()) {
            return
        }

        const ch = cr as Chord

        const note = Factory.createItem(ElementType.NOTE, ch) as Note
        note.setTrack(cr.track())
        cr.add(note)
        this.setPitch(note, gpnote.midiPitch())
        this.setTpc(note, gpnote.accidental())

        const harmonicNote = this.addHarmonic(gpnote, note)
        this.addBend(gpnote, note)

        this.addLetRingNote(gpnote, note)
        this.addPalmMuteNote(gpnote, note)
        note.setGhost(gpnote.ghostNote())

        note.setDeadNote(gpnote.muted())
        this.addAccent(gpnote, note)
        this.addSlide(gpnote, note)
        this.addPickScrapeNote(gpnote, note)
        this.collectHammerOn(gpnote, note)
        this.addRightHandTapping(gpnote)
        this.addLeftHandTapping(gpnote)
        this.addStringNumber(gpnote, note)
        this.addOrnament(gpnote, note)
        this.addVibratoLeftHandNote(gpnote, note)
        this.addTrillNote(gpnote, note)
        this.addFingering(gpnote, note)
        this.addTie(gpnote, note, this._ties)
        if (harmonicNote) {
            this.addTie(gpnote, harmonicNote, this._harmonicTies)
        }
    }

    private configureGraceChord(beat: GPBeat, cr: ChordRest, type: GPBeatOttavaType): void {
        this.convertNotes(beat.notes(), cr)

        if (!cr.isChord()) {
            return
        }

        const grChord = cr as Chord

        if (GPBeatGraceNotes.OnBeat === beat.graceNotes()) {
            grChord.setNoteType(NoteType.APPOGGIATURA)
        } else {
            grChord.setNoteType(NoteType.ACCIACCATURA)
        }

        const [foundOttava, muOttavaType] = ottavaType(type)
        if (foundOttava) {
            for (const note of grChord.notes()) {
                setPitchByOttavaType(note, muOttavaType)
            }
        }
    }

    private addTimeSig(mB: GPMasterBar, measure: Measure): void {
        const sig = mB.timeSig()
        const tick = measure.tick()
        const scoreTimeSig = new Fraction(sig.numerator, sig.denominator)
        measure.setTicks(scoreTimeSig)
        const staves = this._score.staves().length

        if (this._lastTimeSig.numerator === sig.numerator
            && this._lastTimeSig.denominator === sig.denominator) {
            return
        }
        this._lastTimeSig.numerator = sig.numerator
        this._lastTimeSig.denominator = sig.denominator

        for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
            const staff = this._score.staff(staffIdx)!
            if (staff.staffType()!.genTimesig()) {
                const t = Factory.createItem(ElementType.TIMESIG, scoreDummy(this._score).segment()) as TimeSig
                const curTrack = staffIdx * GPConverter.VOICES
                t.setTrack(curTrack)
                t.setSig(scoreTimeSig)
                if (mB.freeTime()) {
                    t.setLargeParentheses(true)
                }
                const s = measure.getSegment(SegmentType.TimeSig, tick)
                s.add(t)
            }
        }
    }

    private addRepeat(mB: GPMasterBar, measure: Measure): void {
        this.addVolta(mB, measure)

        if (mB.repeat().type === GPMasterBarRepeatType.None) {
            return
        }

        if (mB.repeat().type === GPMasterBarRepeatType.Start) {
            measure.setRepeatStart(true)
        }
        if (mB.repeat().type === GPMasterBarRepeatType.End) {
            measure.setRepeatEnd(true)
        }
        if (mB.repeat().type === GPMasterBarRepeatType.StartEnd) {
            measure.setRepeatStart(true)
            measure.setRepeatEnd(true)
        }
        measure.setRepeatCount(mB.repeat().count)
    }

    private addVolta(mB: GPMasterBar, measure: Measure): void {
        if (mB.alternateEnding().length === 0) {
            this._lastVolta = null
            return
        }

        if (this._lastVolta && this._lastVolta.endings().length !== mB.alternateEnding().length) {
            this._lastVolta = null
        }

        if (this._lastVolta) {
            for (const end of mB.alternateEnding()) {
                if (!this._lastVolta.hasEnding(end)) {
                    this._lastVolta = null
                    break
                }
            }
        }

        this.doAddVolta(mB, measure)
    }

    private doAddVolta(mB: GPMasterBar, measure: Measure): void {
        let volta: Volta
        if (this._lastVolta) {
            volta = this._lastVolta
            this._score.removeElement(volta)
        } else {
            volta = new Volta(scoreDummy(this._score))
            volta.setTick(measure.tick())
            this._lastVolta = volta
        }

        volta.endings().length = 0
        volta.setTick2(measure.endTick())

        let str = ''
        for (const end of mB.alternateEnding()) {
            volta.endings().push(end)
            if (!str) {
                str += String(end)
            } else {
                str += `-${end}`
            }
        }
        volta.setText(str)

        this._score.addElement(volta)
    }

    private addDirection(mB: GPMasterBar, measure: Measure): void {
        for (const dir of mB.directions()) {
            if (dir.type === GPMasterBarDirectionType.Jump) {
                const jump = Factory.createItem(ElementType.JUMP, measure) as Jump
                jump.setJumpType(jumpType(dir.name))
                jump.setTrack(0)
                measure.add(jump)
            } else {
                const marker = Factory.createItem(ElementType.MARKER, measure) as Marker
                marker.setMarkerType(markerType(dir.name))
                marker.resetProperty(Pid.LABEL)
                marker.setTrack(0)
                measure.add(marker)
            }
        }
    }

    private addSection(mB: GPMasterBar, measure: Measure): void {
        const section = mB.section()
        if (!section[0] && !section[1]) {
            return
        }

        if (section[0]) {
            const s = measure.getSegment(SegmentType.ChordRest, measure.tick())
            const t = Factory.createItem(ElementType.REHEARSAL_MARK, scoreDummy(this._score).segment()) as RehearsalMark
            t.setPlainText(section[0])
            t.setType(RehearsalMarkType.Main)
            t.setTrack(0)
            s.add(t)
        }
        if (section[1]) {
            const s = measure.getSegment(SegmentType.ChordRest, measure.tick())
            const t = Factory.createItem(ElementType.REHEARSAL_MARK, scoreDummy(this._score).segment()) as RehearsalMark
            t.setPlainText(section[1])
            t.setType(RehearsalMarkType.Additional)
            t.setTrack(0)
            s.add(t)
        }
    }

    private addTripletFeel(mB: GPMasterBar, measure: Measure): void {
        if (mB.tripletFeel() === this._lastTripletFeel) {
            return // if last triplet of last measure is equal current dont create new system text
        }

        const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
        const type = tripletFeelType(mB.tripletFeel())
        const tripletFeel = new TripletFeel(segment, type)
        this._lastTripletFeel = mB.tripletFeel()
        tripletFeel.setTrack(0)
        segment.add(tripletFeel)
    }

    private addKeySig(mB: GPMasterBar, measure: Measure): void {
        // C++ convertKeySig: GPMasterBar::KeySig::Accidentals and Key have the same values (C_B = -7 ... C_S = 7)
        const convertKeySig = (kS: number): Key => {
            return (kS >= Key.C_B && kS <= Key.C_S ? kS : Key.C_S) as Key
        }

        const convertMode = (m: GPMasterBarKeySigMode): KeyMode => {
            if (m === GPMasterBarKeySigMode.Major) {
                return KeyMode.MAJOR
            } else {
                return KeyMode.MINOR
            }
        }

        const tick = measure.tick()
        const staves = this._score.staves().length

        const getNumSharps = (key: number): number => {
            if (key > 0) {
                for (let i = 0; i < this.m_sharpsToKeyConverter.length; ++i) {
                    if (this.m_sharpsToKeyConverter[i] === key) {
                        return i
                    }
                }
            } else {
                for (let i = 0; i < this.m_sharpsToFlatKeysConverter.length; ++i) {
                    if (this.m_sharpsToFlatKeysConverter[i] === key) {
                        return i
                    }
                }
            }
            // Never should get here
            return nidx
        }

        for (let staffIdx = 0; staffIdx < staves; ++staffIdx) {
            if (!tick.isZero() && (this._lastKeySigs.get(staffIdx) ?? DEFAULT_KEYSIG).accidentalCount === mB.keySig().accidentalCount) {
                continue
            }
            let key = mB.keySig().accidentalCount as number

            const useFlats = mB.useFlats() || key < 0
            let numSharps = getNumSharps(key)
            if (numSharps === nidx) {
                // LOGE: Unprocessable key for key signature
                numSharps = 0
            }
            numSharps = numSharps % 12
            if (useFlats) {
                key = this.m_sharpsToFlatKeysConverter[numSharps]
            } else {
                key = this.m_sharpsToKeyConverter[numSharps]
            }

            const scoreKeySig = convertKeySig(key)
            const scoreMode = convertMode(mB.keySig().mode)

            const staff = this._score.staff(staffIdx)!
            if (staff.staffType()!.genTimesig()) {
                const t = Factory.createItem(ElementType.KEYSIG, scoreDummy(this._score).segment()) as KeySig
                t.setTrack(staffIdx * GPConverter.VOICES)
                t.setKey(scoreKeySig)
                t.setMode(scoreMode)
                const s = measure.getSegment(SegmentType.KeySig, tick)
                s.add(t)
                this._lastKeySigs.set(staffIdx, mB.keySig())
            }
        }
    }

    private setUpGPScore(gpscore: GPScore): void {
        EngravingConfiguration.setGuitarProMultivoiceEnabled(gpscore.multiVoice())
        const experimental = EngravingConfiguration.guitarProImportExperimental()

        const fieldNames = [gpscore.title(), gpscore.subTitle(), gpscore.artist(),
            gpscore.album(), gpscore.composer(), gpscore.poet()]

        const createTitleField = fieldNames.some(fieldName => !!fieldName)

        if (!createTitleField && !experimental) {
            return
        }

        let m: MeasureBase | null = null
        if (!this._score.measures().first()) {
            m = Factory.createTitleVBox(this._score.dummySystem())
            this._score.measures().append(m)
        } else {
            m = this._score.measures().first()!
            if (!m.isVBox()) {
                const mb = Factory.createTitleVBox(this._score.dummySystem())
                this._score.addMeasure(mb, m)
                m = mb
            }
        }

        if (gpscore.title() || experimental) {
            const s = new Text(scoreDummy(this._score), TextStyleType.TITLE)
            s.setPlainText(gpscore.title())
            m.add(s)
        }
        if (gpscore.subTitle() || gpscore.artist() || gpscore.album() || experimental) {
            const s = new Text(scoreDummy(this._score), TextStyleType.SUBTITLE)
            let str = ''
            if (gpscore.subTitle()) {
                str += gpscore.subTitle()
            }
            if (gpscore.artist()) {
                if (str) {
                    str += '\n'
                }
                str += gpscore.artist()
            }
            if (gpscore.album()) {
                if (str) {
                    str += '\n'
                }
                str += gpscore.album()
            }
            s.setPlainText(str)
            m.add(s)
        }
        if (gpscore.composer()) {
            const s = new Text(scoreDummy(this._score), TextStyleType.COMPOSER)
            s.setPlainText(arg(mtrc('iex_guitarpro', 'Music by %1'), gpscore.composer()))
            m.add(s)
        }

        if (gpscore.poet() || experimental) {
            const s = new Text(scoreDummy(this._score), TextStyleType.LYRICIST)
            if (gpscore.poet()) {
                s.setPlainText(arg(mtrc('iex_guitarpro', 'Words by %1'), gpscore.poet()))
            }

            m.add(s)
        }
    }

    private setUpTracks(tracks: Map<number, GPTrack>): void {
        // C++ std::map: sorted by index
        for (const key of [...tracks.keys()].sort((a, b) => a - b)) {
            this.setUpTrack(tracks.get(key)!)
        }
    }

    private setUpTrack(tR: GPTrack): void {
        const programm = tR.programm()
        const midiChannel = tR.midiChannel()

        const idx = tR.idx() + 1 // 0 is invalid index

        const part = new Part(this._score)
        part.setPlainLongName(tR.name())
        part.setPlainShortName(tR.shortName())
        part.setPartName(tR.name())
        part.setId(String(idx))

        this._score.appendPart(part)
        for (let staffIdx = 0; staffIdx < tR.staffCount(); staffIdx++) {
            const s = Factory.createStaff(part)
            this._score.appendStaff(s)
        }

        if (tR.staffCount() > 1) {
            part.staff(0)!.addBracket(new BracketItemClass(scoreDummy(this._score), BracketType.BRACE, 2) as BracketItem)
            part.staff(0)!.setBarLineSpan(true)
        }

        part.setMidiProgram(programm)
        part.setMidiChannel(midiChannel)

        const volVal = lround(Math.fround(tR.rse().volume * 127))
        part.instrument().channel(0)!.setVolume(Math.min(Math.max(volVal, 0), 127))

        const panVal = lround(Math.fround(tR.rse().pan * 127))
        part.instrument().channel(0)!.setPan(Math.min(Math.max(panVal, 0), 127))

        if (midiChannel === GPConverter.PERC_CHANNEL) {
            const drumInstrName = tR.instrument()
            if (drumInstrName) {
                part.setShortName(drumInstrName)
            }

            const staff = part.staff(0)!
            let type = StaffTypes.PERC_5LINE // C++ PERC_DEFAULT
            const ds = drumset.PERC_STAFF_LINES_FROM_INSTRUMENT.get(tR.name())
            if (ds) {
                drumset.initGuitarProPercussionSet(ds)
                drumset.setInstrumentDrumset(part.instrument(), ds)
                switch (ds.numLines) {
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
                    type = StaffTypes.PERC_5LINE // C++ PERC_DEFAULT
                    break
                }
            } else {
                drumset.initGuitarProDrumset()
                part.instrument().setDrumset(drumset.gpDrumset)
            }
            staff.setStaffType(new Fraction(0, 1), StaffType.preset(type))
        }

        const standartTuning = [40, 45, 50, 55, 59, 64]
        const instr = part.instrument()

        if (tR.staffProperty().length) {
            const staffProperty = tR.staffProperty()

            const capoFret = staffProperty[0].capoFret

            part.setCapoFret(capoFret)
            this.m_capoParams.set(Number(part.id()), capoFret)
            let tunning = [...staffProperty[0].tunning]
            const usePresetTable = staffProperty[0].ignoreFlats

            const flatPresets = [0x3f3a36312c27n, 0x3c37332e2924n, 0x3f3a36312c25n]

            let k = 0n
            for (let i = 0; i < tunning.length; ++i) {
                k |= (BigInt(tunning[i]) & 0xffffffffffffffffn) << BigInt(8 * i)
            }
            k &= 0xffffffffffffffffn
            const useFlats = usePresetTable ? flatPresets.includes(k) : staffProperty[0].useFlats
            const fretCount = staffProperty[0].fretCount

            if (tunning.length === 0) {
                tunning = [...standartTuning]
            }

            const transpose = tR.transpose()
            tunning = tunning.map(t => t - transpose)

            const stringData = StringData.fromPitches(fretCount, tunning.length, tunning, useFlats)
            instr.setStringData(stringData)
        } else if (!instr.useDrumset()) {
            const stringData = StringData.fromPitches(24, standartTuning.length, standartTuning)
            instr.setStringData(stringData)
        }

        instr.setSingleNoteDynamics(false)

        // this code sets score lyrics from the first processed track.
        //    if (_score->OffLyrics.isEmpty())
        //        _score->OffLyrics = tR->lyrics();

        instr.setTranspose(Interval.fromChromatic(tR.transpose()))
    }

    private collectTempoMap(mTr: GPMasterTracks): void {
        for (const temp of mTr.tempoMap()) {
            let list = this._tempoMap.get(temp.bar)
            if (!list) {
                list = []
                this._tempoMap.set(temp.bar, list)
            }
            list.push(temp)
        }
    }

    private collectFermatas(mB: GPMasterBar, measure: Measure): void {
        for (const ferm of mB.fermatas()) {
            this._fermatas.push([measure, ferm])
        }
    }

    private fillUncompletedMeasure(ctx: GPConverterContext): void {
        if (this.m_nextTupletInfo.tuplet) {
            this.fillTuplet()
        }

        const lastMeasure = this._score.lastMeasure()!
        const tickOffset = lastMeasure.ticks().ticks() + lastMeasure.tick().ticks() - ctx.curTick.ticks()
        if (tickOffset > 0) {
            this._score.setRest(ctx.curTick, ctx.curTrack, Fraction.fromTicks(tickOffset), true, null)
            this.m_continiousElementsBuilder.notifyUncompletedMeasure()
        }
    }

    private hideRestsInEmptyMeasures(startTrack: track_idx_t, endTrack: track_idx_t): void {
        for (let segment = this._score.lastMeasure()!.first(SegmentType.ChordRest); segment;
            segment = segment.next(SegmentType.ChordRest)) {
            for (let trackIdx = startTrack; trackIdx < endTrack; trackIdx++) {
                const element = segment.element(trackIdx)
                if (!element || !element.isRest()) {
                    continue
                }

                const rest = element as Rest
                const voice = trackIdx % GPConverter.VOICES
                const mainVoice = (voice === 0)

                // hiding rests in secondary voices for measures without any chords
                if (!this.m_chordExistsInBar) {
                    rest.setVisible(mainVoice)
                    continue
                }

                // hiding rests in voices without chords
                if (!this.m_chordExistsForVoice[voice]) {
                    rest.setVisible(false)
                }
            }
        }
    }

    private addContinuousSlideHammerOn(): void {
        const searchEndNote = (start: Note): Note | null => {
            let nextCr: ChordRest | null
            if ((start.parent() as Chord).isGrace()) {
                //! this case when start note is a grace note so end note can be next note in grace notes
                //! or parent note of grace notes
                const startChord = start.parent() as Chord

                const parentGrace = start.parent()!.parent() as Chord

                const graceNotes = parentGrace.graceNotes()
                const it = graceNotes.indexOf(startChord)

                if (it < 0) {
                    nextCr = null
                } else if (it + 1 === graceNotes.length) {
                    nextCr = parentGrace
                } else {
                    nextCr = graceNotes[it + 1]
                }
            } else {
                nextCr = start.chord().segment()!.next1()!.nextChordRest(start.track())
                if (!nextCr) {
                    return null
                }

                if (nextCr.isChord() && (nextCr as Chord).graceNotes().length) {
                    nextCr = (nextCr as Chord).graceNotes()[0]
                }
            }

            if (!nextCr) {
                return null
            }

            if (!nextCr.isChord()) {
                return null
            }
            const nextChord = nextCr as Chord
            for (const note of nextChord.notes()) {
                if (note.string() === start.string() && (note.harmonic() === start.harmonic())) {
                    return note
                }
            }

            return nextChord.upNote()
        }

        const legatoSlides = new Map<Note, Slur>()
        const hammerOnPullOffs = new Map<Note, HammerOnPullOff>()
        const hammerOnInChord = new Set<Chord>()
        for (const slide of this._slideHammerOnMap) {
            let startNote = slide[0]
            const endNote = searchEndNote(startNote)
            if (!endNote || startNote.string() === -1 || startNote.fret() === endNote.fret()) {
                //mistake in GP: such kind od slides shouldn't exist
                continue
            }

            let currentStart: Note | null = null
            if (startNote.bendFor()) {
                let bendNote: Note | null = startNote
                let bend: GuitarBend | null = bendNote.bendFor()

                while (bend) {
                    bendNote = bend.endNote()
                    if (!bendNote) {
                        // LOGE: glissando start note may be incorrect
                        break
                    }

                    if (!bendNote.chord().isGraceAfter()) {
                        break
                    }

                    currentStart = bendNote
                    bend = bendNote.bendFor()
                }

                if (currentStart) {
                    startNote = currentStart
                }
            }

            const startTick = startNote.chord().tick()
            const endTick = endNote.chord().tick()
            const track = startNote.track()

            /// Layout info
            if (slide[1] === GPConverterSlideHammerOn.LegatoSlide || slide[1] === GPConverterSlideHammerOn.Slide) {
                const gl = Factory.createItem(ElementType.GLISSANDO, scoreDummy(this._score)) as Glissando
                gl.setAnchor(SpannerAnchor.NOTE)
                gl.setStartElement(startNote)
                gl.setTrack(track)
                gl.setTick(startTick)
                gl.setTick2(endNote.chord().tick())
                gl.setEndElement(endNote)
                gl.setParent(startNote)
                gl.setText('')
                gl.setGlissandoType(GlissandoType.STRAIGHT)
                gl.setGlissandoShift(slide[1] === GPConverterSlideHammerOn.Slide)
                gl.setGlissandoStyle(startNote.part()!.instrument(startTick).glissandoStyle())
                this._score.addElement(gl)
            }

            if (slide[1] === GPConverterSlideHammerOn.LegatoSlide) {
                if (!legatoSlides.has(startNote)) {
                    const slur = Factory.createItem(ElementType.SLUR, scoreDummy(this._score)) as Slur
                    slur.setConnectedElement(SlurConnectedElement.GLISSANDO)

                    slur.setStartElement(startNote.chord())
                    slur.setTrack(track)
                    slur.setTick(startTick)
                    slur.setTick2(endTick)
                    legatoSlides.set(endNote, slur)
                    slur.setEndElement(endNote.chord())
                    this._score.addSpanner(slur)
                } else {
                    const slur = legatoSlides.get(startNote)!
                    slur.setTick2(endTick)
                    slur.setEndElement(endNote.chord())
                    legatoSlides.delete(startNote)
                    legatoSlides.set(endNote, slur)
                }
            } else if (slide[1] === GPConverterSlideHammerOn.HammerOn) {
                const startChord = startNote.chord()
                if (hammerOnInChord.has(startChord)) {
                    continue
                }

                if (!hammerOnPullOffs.has(startNote)) {
                    const hammerOnPullOff = Factory.createItem(ElementType.HAMMER_ON_PULL_OFF, scoreDummy(this._score)) as HammerOnPullOff
                    hammerOnPullOff.setTrack(startNote.track())
                    hammerOnPullOff.setTick(startNote.tick())
                    hammerOnPullOff.setTick2(endNote.tick())
                    hammerOnPullOff.setStartElement(startChord)
                    hammerOnPullOff.setEndElement(endNote.chord())
                    this._score.addElement(hammerOnPullOff)
                    hammerOnPullOffs.set(endNote, hammerOnPullOff)
                    hammerOnInChord.add(startChord)
                } else {
                    const hammerOnPullOff = hammerOnPullOffs.get(startNote)!
                    hammerOnPullOff.setTick2(endTick)
                    hammerOnPullOff.setEndElement(endNote.chord())
                    hammerOnPullOffs.delete(startNote)
                    hammerOnPullOffs.set(endNote, hammerOnPullOff)
                }
            }
        }
    }

    private addFermatas(): void {
        const fermataType = (fer: GPMasterBarFermata): SymId => {
            if (fer.type === GPMasterBarFermataType.Long) {
                return SymId.fermataLongAbove
            } else if (fer.type === GPMasterBarFermataType.Short) {
                return SymId.fermataShortAbove
            }
            return SymId.fermataAbove
        }

        for (const fr of this._fermatas) {
            const measure = fr[0]
            const gpFermata = fr[1]
            const tick = Fraction.fromTicks(Math.trunc(Constants.DIVISION * gpFermata.offsetNum / gpFermata.offsetDenom))
            // bellow how gtp fermata timeStretch converting to MU timeStretch
            const f = Math.fround
            const length = f(gpFermata.length)
            const convertingLength = f(f(f(1.5) - f(length * 0.5)) + f(f(length * length) * 3))
            const seg = measure.getSegmentR(SegmentType.ChordRest, tick)

            for (let staffIdx = 0; staffIdx < this._score.staves().length; staffIdx++) {
                const fermata = Factory.createItem(ElementType.FERMATA, seg) as Fermata
                const type = fermataType(fr[1])
                fermata.setSymIdAndTimeStretch(type)
                fermata.setTimeStretch(convertingLength)
                fermata.setTrack(staffIdx * GPConverter.VOICES)
                seg.add(fermata)
            }
        }
    }

    private addTempoMap(): void {
        const realTempo = (temp: GPMasterTracksAutomation): number => {
            //real tempo - beats per second
            //formula ro convert tempo from GTP tempo values
            const tempo = temp.value

            if (temp.tempoUnit === 0) {
                return tempo
            }

            if (temp.tempoUnit !== 5) {
                return tempo * temp.tempoUnit / 2
            }

            if (temp.tempoUnit === 5) {
                return tempo + tempo * 2
            }

            return tempo
        }

        let measureIdx = 0
        let lastGradualTempoChange: GradualTempoChange | null = null
        let previousTempo = -1

        for (let m = this._score.firstMeasure(); m; m = m.nextMeasure()) {
            const range = this._tempoMap.get(measureIdx) ?? [] //one measure can have several tempo changing
            measureIdx++
            for (const temp of range) {
                // C++: float position * int ... -> float, truncated by Fraction::fromTicks(int)
                const f = Math.fround
                const ticks = f(f(f(f(temp.position) * Constants.DIVISION) * 4 * m.ticks().numerator()) / m.ticks().denominator())
                const tick = m.tick().plus(Fraction.fromTicks(Math.trunc(ticks)))
                const segment = findClosestSegment(m, tick)
                const realTemp = realTempo(temp)
                const tt = Factory.createItem(ElementType.TEMPO_TEXT, segment) as TempoText
                tt.setTempo(realTemp / 60)
                const labelText = temp.text
                let tempoText = `<sym>metNoteQuarterUp</sym> = ${Math.round(realTemp)}`

                if (labelText) {
                    tempoText = labelText + ' ' + tempoText
                }

                tt.setXmlText(tempoText)
                tt.setTrack(0)
                segment.add(tt)
                this._score.setTempo(tick, tt.tempo())

                if (lastGradualTempoChange) {
                    lastGradualTempoChange.setTick2(tick)
                    let tempoChangeType = GradualTempoChangeType.Undefined
                    let tempoChangeText = ''

                    if (realTemp > previousTempo) {
                        tempoChangeType = GradualTempoChangeType.Accelerando
                        tempoChangeText = 'accel.'
                    } else {
                        tempoChangeType = GradualTempoChangeType.Rallentando
                        tempoChangeText = 'rall.'
                    }

                    lastGradualTempoChange.setTempoChangeType(tempoChangeType)
                    lastGradualTempoChange.setBeginText(tempoChangeText)
                    lastGradualTempoChange.setContinueText(`(${tempoChangeText})`)
                    this._score.addElement(lastGradualTempoChange)
                    lastGradualTempoChange = null
                }

                if (temp.linear) {
                    const tempoChange = Factory.createItem(ElementType.GRADUAL_TEMPO_CHANGE, segment) as GradualTempoChange
                    tempoChange.setTick(tick)
                    tempoChange.setTrack(0)
                    lastGradualTempoChange = tempoChange
                }

                previousTempo = Math.trunc(realTemp) // C++ int previousTempo
            }
        }
    }

    private addInstrumentChanges(): void {
        const tracks = this._gpDom.tracks()
        for (const key of [...tracks.keys()].sort((a, b) => a - b)) {
            const track = tracks.get(key)!
            for (const [, soundAutomation] of track.soundAutomations()) {
                const bar = soundAutomation.bar
                const pos = soundAutomation.position

                const m = this._score.crMeasure(bar)!
                let seg = m.first(SegmentType.ChordRest)!
                const trackIdx = track.idx()
                const position = soundAutomation.position // offset for automation segment in current measure

                let midiProgramm = 0
                let instrName = ''

                const sound = track.sounds().get(soundAutomation.value)
                if (!sound) {
                    midiProgramm = track.programm()
                    instrName = soundAutomation.value
                } else {
                    midiProgramm = sound.programm
                    instrName = sound.label
                }

                if (bar === 0 && pos === 0 && midiProgramm === track.programm()) {
                    // skipping the default instrument in the beginning of the track
                    continue
                }

                const instr = new Instrument()
                instr.setTranspose(Interval.fromChromatic(track.transpose()))
                instr.setStringData(this._score.parts()[trackIdx].instrument().stringData())
                instr.channel(0)!.setProgram(midiProgramm)
                if (track.midiChannel() === GPConverter.PERC_CHANNEL) {
                    instr.setDrumset(drumset.gpDrumset)
                }

                const instrCh = new InstrumentChange(scoreDummy(this._score).segment(), instr)
                instrCh.setTrack(trackIdx * GPConverter.VOICES)
                instrCh.setXmlText(instrName)

                if (position !== 0) {
                    // searching for correct segment to put instrument change
                    const tick = m.tick().plus(Fraction.fromTicks(Math.trunc(Math.fround(position * Constants.DIVISION))))
                    const positionedSegment = m.findSegment(SegmentType.ChordRest, tick)
                    if (positionedSegment) {
                        seg = positionedSegment
                    }
                }

                seg.add(instrCh)
            }
        }
    }

    private addSimileMark(bar: GPBar, curTrack: number): boolean {
        if (bar.simileMark() === GPBarSimileMark.None) {
            return false
        }

        const measure = this._score.lastMeasure()!
        const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
        const staffIdx = track2staff(curTrack)

        switch (bar.simileMark()) {
        case GPBarSimileMark.Simple: {
            const mr = Factory.createItem(ElementType.MEASURE_REPEAT, segment) as MeasureRepeat
            mr.setTrack(curTrack)
            mr.setTicks(measure.ticks())
            mr.setNumMeasures(1)
            segment.add(mr)
            measure.setMeasureRepeatCount(1, staffIdx)
            break
        }
        case GPBarSimileMark.FirstOfDouble: {
            const mr = Factory.createItem(ElementType.MEASURE_REPEAT, segment) as MeasureRepeat
            mr.setTrack(staff2track(staffIdx))
            mr.setTicks(measure.ticks())
            mr.setNumMeasures(2)
            segment.add(mr)
            measure.setMeasureRepeatCount(1, staffIdx)
            break
        }
        case GPBarSimileMark.SecondOfDouble: {
            const r = Factory.createItem(ElementType.REST, segment) as Rest
            r.setTrack(staff2track(staffIdx))
            r.setTicks(measure.ticks())
            r.setDurationType(new TDuration(DurationType.V_MEASURE))
            segment.add(r)
            measure.setMeasureRepeatCount(2, staffIdx)
            break
        }
        case GPBarSimileMark.None:
            break
        }
        return true
    }

    private addClef(bar: GPBar, curTrack: number): void {
        const convertClef = (cl: GPBarClef): ClefType => {
            if (cl.type === GPBarClefType.Neutral) {
                return ClefType.PERC
            } else if (cl.type === GPBarClefType.G2) {
                switch (cl.ottavia) {
                case GPBarOttaviaType.va8:
                    return ClefType.G8_VA
                case GPBarOttaviaType.vb8:
                    return ClefType.G8_VB
                case GPBarOttaviaType.ma15:
                    return ClefType.G15_MA
                case GPBarOttaviaType.mb15:
                    return ClefType.G15_MB
                default:
                    return ClefType.G
                }
            } else if (cl.type === GPBarClefType.F4) {
                switch (cl.ottavia) {
                case GPBarOttaviaType.va8:
                    return ClefType.F_8VA
                case GPBarOttaviaType.vb8:
                    return ClefType.F8_VB
                case GPBarOttaviaType.ma15:
                    return ClefType.F_15MA
                case GPBarOttaviaType.mb15:
                    return ClefType.F15_MB
                default:
                    return ClefType.F
                }
            } else if (cl.type === GPBarClefType.C3) {
                return ClefType.C3
            } else if (cl.type === GPBarClefType.C4 && cl.ottavia === GPBarOttaviaType.vb8) {
                return ClefType.C4_8VB
            } else if (cl.type === GPBarClefType.C4) {
                return ClefType.C4
            }
            return ClefType.G
        }

        const lastMeasure = this._score.lastMeasure()!
        const tick = lastMeasure.tick()
        const clef = convertClef(bar.clef())

        if (tick.eq(new Fraction(0, 1))) {
            this._clefs.set(curTrack, bar.clef())
            const s = this._score.staff(track2staff(curTrack))!
            s.setDefaultClefType(new ClefTypeList(clef, clef))
            return
        }

        const lastClef = this._clefs.get(curTrack)
        if (lastClef && lastClef.equals(bar.clef())) {
            return
        }

        const s = lastMeasure.getSegment(SegmentType.HeaderClef, tick)
        const cl = Factory.createItem(ElementType.CLEF, scoreDummy(this._score).segment()) as Clef
        cl.setTrack(curTrack)
        cl.setClefType(clef)

        s.add(cl)
        this._clefs.set(curTrack, bar.clef())
    }

    private addMeasure(mB: GPMasterBar): Measure {
        const last = this._score.measures().last()
        const tick = last ? last.endTick() : new Fraction(0, 1)
        const measure = Factory.createItem(ElementType.MEASURE, this._score.dummySystem()) as Measure
        measure.setTick(tick)
        const sig = mB.timeSig()
        const scoreTimeSig = new Fraction(sig.numerator, sig.denominator)
        measure.setTimesig(scoreTimeSig)
        measure.setTicks(scoreTimeSig)
        this._score.measures().append(measure)

        return measure
    }

    private addChordRest(beat: GPBeat, ctx: GPConverterContext): ChordRest {
        const rhythm = (r: GPRhythmRhytmType): number => {
            if (r === GPRhythmRhytmType.Whole) {
                return 1
            } else if (r === GPRhythmRhytmType.Half) {
                return 2
            } else if (r === GPRhythmRhytmType.Quarter) {
                return 4
            } else if (r === GPRhythmRhytmType.Eighth) {
                return 8
            } else if (r === GPRhythmRhytmType.Sixteenth) {
                return 16
            } else if (r === GPRhythmRhytmType.ThirtySecond) {
                return 32
            } else {
                return 64
            }
        }

        let cr: ChordRest
        if (beat.isRest()) {
            cr = Factory.createItem(ElementType.REST, scoreDummy(this._score).segment()) as Rest
        } else {
            cr = Factory.createItem(ElementType.CHORD, scoreDummy(this._score).segment()) as Chord
        }

        cr.setTrack(ctx.curTrack)

        const [dots, type] = beat.lenth()
        let fr = new Fraction(1, rhythm(type))
        for (let dot = 1; dot <= dots; dot++) {
            fr = fr.plus(new Fraction(1, rhythm(type) * 2 * dot))
        }

        cr.setTicks(fr)
        cr.setDurationType(new TDuration(fr))

        return cr
    }

    private addFingering(gpnote: GPNote, note: Note): void {
        if (!gpnote.leftFingering() && !gpnote.rightFingering()) {
            return
        }

        const scoreFinger = (str: string): string => {
            if (str === 'Open') {
                return 'O'
            }
            return str
        }

        if (gpnote.leftFingering()) {
            const f = Factory.createItem(ElementType.FINGERING, note) as Fingering
            f.setPlainText(scoreFinger(gpnote.leftFingering()))
            note.add(f)
        }
        if (gpnote.rightFingering()) {
            const f = Factory.createItem(ElementType.FINGERING, note) as Fingering
            f.setPlainText(gpnote.rightFingering())
            note.add(f)
        }
    }

    private addStringNumber(gpnote: GPNote, note: Note): void {
        if (!gpnote.showStringNumber()) {
            return
        }

        const f = Factory.createItem(ElementType.FINGERING, note) as Fingering

        f.setPlainText(String(note.string() + 1))
        f.setTextStyleType(TextStyleType.STRING_NUMBER)
        f.setFrameType(FrameType.CIRCLE)
        note.add(f)
    }

    /** C++ addTrill(const GPNote*, Note*) */
    private addTrillNote(gpnote: GPNote, _note: Note): void {
        if (gpnote.trill().auxillaryFret === -1) {
            return
        }

        this.m_currentGPBeat!.setTrill(true)
    }

    /** C++ addTrill(const GPBeat*, ChordRest*) */
    private addTrill(gpbeat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.TRILL, ContiniousElementsBuilderImportType.TRILL,
            gpbeat.trill())
    }

    private addOrnament(gpnote: GPNote, note: Note): void {
        if (gpnote.ornament() === GPNoteOrnament.None) {
            return
        }

        const scoreOrnament = (orn: GPNoteOrnament): SymId => {
            if (orn === GPNoteOrnament.Turn) {
                return SymId.ornamentTurn
            } else if (orn === GPNoteOrnament.InvertedTurn) {
                return SymId.ornamentTurnInverted
            } else if (orn === GPNoteOrnament.LowerMordent) {
                return SymId.ornamentMordent
            } else if (orn === GPNoteOrnament.UpperMordent) {
                return SymId.ornamentShortTrill
            }
            return SymId.ornamentUpPrall
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setSymId(scoreOrnament(gpnote.ornament()))
        if (!this._score.toggleArticulation(note, art)) {
            // C++ delete art
        }
    }

    /** C++ addVibratoLeftHand(const GPNote*, Note*) */
    private addVibratoLeftHandNote(gpnote: GPNote, _note: Note): void {
        if (gpnote.vibratoType() === GPNoteVibratoType.None) {
            return
        }

        this.m_currentGPBeat!.setVibratoLeftHand(
            gpnote.vibratoType() === GPNoteVibratoType.Slight ? GPBeatVibratoLeftHand.Slight : GPBeatVibratoLeftHand.Wide)
    }

    private addHarmonic(gpnote: GPNote, note: Note): Note | null {
        if (gpnote.harmonic().type === GPNoteHarmonicType.None) {
            return null
        }

        let hnote: Note | null = null
        if (gpnote.harmonic().type !== GPNoteHarmonicType.Natural) {
            hnote = Factory.createItem(ElementType.NOTE, scoreDummy(this._score).chord()) as Note
            hnote.setTrack(note.track())
            hnote.setString(note.string())
            hnote.setPitch(note.pitch())
            hnote.setFret(note.fret())

            /// @note option to show or not additional harmonic fret in "<>" to be implemented
            ///note->setDisplayFret(Note::DisplayFretOption::ArtificialHarmonic);
            ///hnote->setDisplayFret(Note::DisplayFretOption::Hide);
            hnote.setDisplayFret(DisplayFretOption.Hide)

            hnote.setTpcFromPitch()
            note.chord().add(hnote)
            hnote.setPlay(false)
            note.setPlay(true)

            note.setHarmonicFret(note.fret() + gpnote.harmonic().fret)
        } else {
            note.setHarmonicFret(gpnote.harmonic().fret)
            note.setDisplayFret(DisplayFretOption.NaturalHarmonic)
        }

        const harmonicNote = hnote ?? note

        const gproHarmonicType = gpnote.harmonic().type as number
        const harmonicFret = utils.harmonicOvertone(note, gpnote.harmonic().fret, gproHarmonicType)
        const string = harmonicNote.string()
        const harmonicPitch = harmonicNote.part()!.instrument().stringData().getPitchForStaff(string,
            harmonicFret + harmonicNote.part()!.capoFret(), harmonicNote.staff())

        harmonicNote.setPitch(harmonicPitch)
        harmonicNote.setTpcFromPitch()
        harmonicNote.setHarmonic(true)
        note.setHarmonicPitchOffset(harmonicNote.pitch() - note.pitch())

        if (GPNoteHarmonic.isArtificial(gpnote.harmonic().type) && this.m_currentGPBeat) {
            this.m_currentGPBeat.addHarmonicMarkType(harmonicTypeNoteToBeat(gpnote.harmonic().type))
        }

        return harmonicNote
    }

    private addAccent(gpnote: GPNote, note: Note): void {
        if (!gpnote.accents().some(b => b)) {
            return
        }

        const symbolsIds = note.chord().articulationSymbolIds()

        const accentType = (flagIdx: number): SymId => {
            if (flagIdx === 0) {
                return SymId.articStaccatoAbove
            } else if (flagIdx === 2) {
                return SymId.articMarcatoAbove
            } else if (flagIdx === 3) {
                return SymId.articAccentAbove
            } else {
                return SymId.dynamicSforzando
            }
        }

        const accents = gpnote.accents()
        for (let flagIdx = 0; flagIdx < 4; flagIdx++) {
            if (accents[flagIdx] && !symbolsIds.has(accentType(flagIdx))) {
                const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
                art.setSymId(accentType(flagIdx))
                note.chord().add(art)
            }
        }
    }

    private addLeftHandTapping(gpnote: GPNote): void {
        if (gpnote.leftHandTapped() && this.m_currentGPBeat) {
            this.m_currentGPBeat.setTappingHand(GPBeatTappingHand.Left)
        }
    }

    private addRightHandTapping(gpnote: GPNote): void {
        if (gpnote.rightHandTapping() && this.m_currentGPBeat) {
            this.m_currentGPBeat.setTappingHand(GPBeatTappingHand.Right)
        }
    }

    private addSlide(gpnote: GPNote, note: Note): void {
        if (!gpnote.slides().some(b => b)) {
            return
        }

        this.addSingleSlide(gpnote, note)
        this.collectContinuousSlide(gpnote, note)
    }

    private addSingleSlide(gpnote: GPNote, note: Note): void {
        const slideType = (flagIdx: number): ChordLineType => {
            switch (flagIdx) {
            case 2:
                return ChordLineType.FALL
            case 3:
                return ChordLineType.DOIT
            case 4:
                return ChordLineType.SCOOP
            case 5:
                return ChordLineType.PLOP
            default:
                // LOGE: wrong slide type
                return ChordLineType.NOTYPE
            }
        }

        const slides = gpnote.slides()
        for (let flagIdx = 2; flagIdx < 6; flagIdx++) {
            if (slides[flagIdx]) {
                const cl = Factory.createItem(ElementType.CHORDLINE, scoreDummy(this._score).chord()) as ChordLine
                cl.setChordLineType(slideType(flagIdx))
                cl.setStraight(true)
                note.chord().add(cl)
                cl.setNote(note)
            }
        }
    }

    private collectContinuousSlide(gpnote: GPNote, note: Note): void {
        if (gpnote.slides()[0]) {
            this._slideHammerOnMap.push([note, GPConverterSlideHammerOn.Slide])
        }
        if (gpnote.slides()[1]) {
            this._slideHammerOnMap.push([note, GPConverterSlideHammerOn.LegatoSlide])
        }
    }

    /** C++ addPickScrape(const GPNote*, Note*) */
    private addPickScrapeNote(gpnote: GPNote, note: Note): void {
        if (gpnote.pickScrape() !== GPNotePickScrape.None && this.m_currentGPBeat) {
            if (EngravingConfiguration.guitarProImportExperimental()) {
                const cl = Factory.createItem(ElementType.CHORDLINE, scoreDummy(this._score).chord()) as ChordLine
                cl.setChordLineType(gpnote.pickScrape() === GPNotePickScrape.Down ? ChordLineType.FALL : ChordLineType.DOIT)
                cl.setWavy(true)
                note.chord().add(cl)
                cl.setNote(note)
            }

            this.m_currentGPBeat.setPickScrape(true)
        }
    }

    private collectHammerOn(gpnote: GPNote, note: Note): void {
        if (gpnote.hammerOn() === GPNoteHammerOn.Start) {
            this._slideHammerOnMap.push([note, GPConverterSlideHammerOn.HammerOn])
        }
    }

    private addBend(gpnote: GPNote, note: Note): void {
        const gpBend = gpnote.bend()
        if (!gpBend || gpBend.isEmpty()) {
            return
        }

        // C++ float arithmetic: time * PitchValue::MAX_TIME / 100, converted to the int time of PitchValue (+ 0: an int
        // has no negative zero)
        const gpTimeToMuTime = (time: number): number => {
            return Math.trunc(Math.fround(Math.fround(time * PitchValue.MAX_TIME) / 100)) + 0
        }
        // C++ PitchValue(int time, int pitch): the float pitch is truncated
        const pv = (time: number, pitch: number): PitchValue => new PitchValue(time, Math.trunc(pitch))

        let bendHasMiddleValue = true
        if (gpBend.middleOffset1 === 12 && gpBend.middleOffset2 === 12) {
            bendHasMiddleValue = false
        }

        const pitchValues: PitchValues = []

        pitchValues.push(pv(gpTimeToMuTime(gpBend.originOffset), gpBend.originValue))
        const lastPoint = pitchValues[pitchValues.length - 1]

        if (bendHasMiddleValue) {
            {
                const value = pv(gpTimeToMuTime(gpBend.middleOffset1), gpBend.middleValue)
                if (gpBend.middleOffset1 >= 0 && gpBend.middleOffset1 < gpBend.destinationOffset && !value.equals(lastPoint)) {
                    pitchValues.push(value)
                }
            }

            {
                const value = pv(gpTimeToMuTime(gpBend.middleOffset2), gpBend.middleValue)
                if (gpBend.middleOffset2 >= 0 && gpBend.middleOffset2 !== gpBend.middleOffset1
                    && gpBend.middleOffset2 < gpBend.destinationOffset
                    && !value.equals(lastPoint)) {
                    pitchValues.push(value)
                }
            }

            if (gpBend.middleOffset1 === -1 && gpBend.middleOffset2 === -1 && gpBend.middleValue !== -1) {
                //!@NOTE It seems when middle point is places exactly in the middle
                //!of bend  GP6 stores this value equal -1
                if (gpBend.destinationOffset > 50) {
                    pitchValues.push(pv(gpTimeToMuTime(50), gpBend.middleValue))
                }
            }
        }

        if (gpBend.destinationOffset <= 0) {
            const fixGpxValue = pv(gpTimeToMuTime(50), gpBend.middleValue)
            if (gpBend.middleValue > gpBend.destinationValue && !pitchValues[pitchValues.length - 1].equals(fixGpxValue)) {
                pitchValues.push(fixGpxValue)
            }
            pitchValues.push(pv(gpTimeToMuTime(100), gpBend.destinationValue)) //! In .gpx this value might be exist
        } else {
            const value = pv(gpTimeToMuTime(gpBend.destinationOffset), gpBend.destinationValue)
            if (!value.equals(lastPoint)) {
                pitchValues.push(value)
            }
        }

        if (pitchValues.length < 2) {
            return
        }

        /// not adding "hold" on 0 pitch
        let maxPitch = pitchValues[0].pitch
        for (const p of pitchValues) {
            if (p.pitch > maxPitch) {
                maxPitch = p.pitch
            }
        }

        if (maxPitch === 0) {
            return
        }

        this.m_guitarBendImporter.collectBend(note, pitchValues)
    }

    private setPitch(note: Note, midiPitch: GPNoteMidiPitch): void {
        const part = note.part()!
        let fret = midiPitch.fret
        let musescoreString = -1
        if (midiPitch.string !== -1) {
            musescoreString = part.instrument().stringData().strings() - 1 - midiPitch.string
        }

        let pitch = 0
        if (midiPitch.midi !== -1) {
            pitch = midiPitch.midi
        } else if (midiPitch.octave !== -1 || midiPitch.tone !== 0) {
            pitch = midiPitch.octave * 12 + midiPitch.tone
        } else if (midiPitch.variation !== -1) {
            pitch = this.calculateDrumPitch(midiPitch.element, midiPitch.variation, part.shortName())
        } else if (part.midiChannel() === GPConverter.PERC_CHANNEL) {
            //!@NOTE This is a case, when part of the note is a
            //       single drum instrument. It seems, that GP
            //       sets to -1 all midi parameters for the note,
            //       but sets the midi pitch value to the program
            //       instead.
            pitch = part.instrument().channel(0)!.program()
        } else {
            pitch = part.instrument().stringData().getPitchForStaff(musescoreString, midiPitch.fret + part.capoFret(), null)
                + part.instrument().transpose().chromatic
        }

        pitch = Math.min(Math.max(pitch, 0), 127)

        if (musescoreString === -1) {
            musescoreString = this.getStringNumberFor(note, pitch)

            fret = part.instrument().stringData().fretForStaff(pitch, musescoreString, null)
        }

        const hasDrumStaff = part.hasDrumStaff()
        if (!EngravingConfiguration.guitarProImportExperimental() && hasDrumStaff) {
            const ext = this._drumExtension.get(pitch)
            if (ext !== undefined) {
                pitch = ext
            }
        }

        note.setFret(fret)

        if (part.instrument(note.tick()).useDrumset()) {
            note.setString(0)
        } else {
            note.setString(musescoreString)
        }

        note.setPitch(pitch)
    }

    private setTpc(note: Note, accidental: number): void {
        const toneToTpc = [14, 21, 16, 11, 18, 13, 20, 15, 22, 17, 24, 19]

        if (note.staff()!.capo(new Fraction(0, 1)).fretPosition !== 0 || accidental === GPNote.invalidAccidental) {
            note.setTpcFromPitch()
        } else {
            const tone = (note.pitch() - accidental + 12) % 12
            // C++ std::map operator[]: a missing (negative) tone yields 0
            const tpc = (toneToTpc[tone] ?? 0) + accidental * 7
            note.setTpc1(tpc)
            note.setTpc2(tpc)
        }
    }

    private calculateDrumPitch(element: number, variation: number, instrumentName: string): number {
        return this._drumResolver.pitch(element, variation, instrumentName)
    }

    private addDynamic(gpb: GPBeat, cr: ChordRest): void {
        if (!cr.isChord()) {
            return
        }

        if (this._dynamics.has(cr.track())) {
            if (this._dynamics.get(cr.track()) === gpb.dynamic()) {
                return
            }
        }

        const convertDynamic = (t: GPBeatDynamicType): string => {
            if (t === GPBeatDynamicType.FFF) {
                return 'fff'
            } else if (t === GPBeatDynamicType.FF) {
                return 'ff'
            } else if (t === GPBeatDynamicType.F) {
                return 'f'
            } else if (t === GPBeatDynamicType.MF) {
                return 'mf'
            } else if (t === GPBeatDynamicType.MP) {
                return 'mp'
            } else if (t === GPBeatDynamicType.P) {
                return 'p'
            } else if (t === GPBeatDynamicType.PP) {
                return 'pp'
            }
            return 'ppp'
        }

        const dynamic = Factory.createItem(ElementType.DYNAMIC, scoreDummy(this._score).segment()) as Dynamic
        dynamic.setTrack(cr.track())
        dynamic.setDynamicType(convertDynamic(gpb.dynamic()))
        cr.segment()!.add(dynamic)
        this._dynamics.set(cr.track(), gpb.dynamic())
    }

    private addTie(gpnote: GPNote, note: Note, ties: TieMap): void {
        if (gpnote.tieType() === GPNoteTieType.None) {
            return
        }

        const tiesOf = (curTrack: track_idx_t): Tie[] => {
            let list = ties.get(curTrack)
            if (!list) {
                list = []
                ties.set(curTrack, list)
            }
            return list
        }

        const startTie = (startNote: Note, sc: Score, curTrack: track_idx_t): void => {
            const tie = Factory.createItem(ElementType.TIE, scoreDummy(sc)) as Tie
            startNote.add(tie)
            tiesOf(curTrack).push(tie)
        }

        const endTie = (endNote: Note, curTrack: track_idx_t): void => {
            const tiesOnTrack = tiesOf(curTrack)
            for (let i = tiesOnTrack.length - 1; i >= 0; i--) {
                const tie = tiesOnTrack[i]
                const startNote = tie.startNote()!
                let startPitch = startNote.pitch()
                if (this.m_originalPitches.has(startNote)) {
                    startPitch = this.m_originalPitches.get(startNote)!
                    this.m_originalPitches.delete(startNote)
                }

                if (startPitch === endNote.pitch() && startNote.string() === endNote.string()) {
                    tie.setEndNote(endNote)
                    endNote.setTieBack(tie)
                    // muse::remove(tiesOnTrack, tie)
                    const idx = tiesOnTrack.indexOf(tie)
                    if (idx >= 0) {
                        tiesOnTrack.splice(idx, 1)
                    }

                    /// adding tremolos to tied note
                    const startChord = startNote.parent() as Chord
                    const endChord = endNote.parent() as Chord
                    if (this.m_tremolosInChords.has(startChord)) {
                        const type = this.m_tremolosInChords.get(startChord)!
                        if (isTremoloTwoChord(type)) {
                            // DO_ASSERT
                        }
                        const t = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, scoreDummy(this._score).chord()) as TremoloSingleChord
                        t.setTremoloType(type)
                        endChord.add(t)
                        this.m_tremolosInChords.delete(startChord)
                        this.m_tremolosInChords.set(endChord, type)
                    }

                    break
                }
            }
        }

        if (gpnote.tieType() === GPNoteTieType.Start) {
            startTie(note, this._score, note.track())
        } else if (gpnote.tieType() === GPNoteTieType.Mediate) {
            endTie(note, note.track())
            startTie(note, this._score, note.track())
        } else if (gpnote.tieType() === GPNoteTieType.End) {
            endTie(note, note.track())
        }
    }

    private addLegato(beat: GPBeat, cr: ChordRest): void {
        if (beat.legatoType() === GPBeatLegatoType.None) {
            return
        }

        type SlurMap = Map<track_idx_t, Slur | null>

        const startSlur = (cr: ChordRest, sc: Score, slurs: SlurMap, curTrack: track_idx_t, curTick: Fraction): void => {
            slurs.delete(curTrack)

            const slur = Factory.createItem(ElementType.SLUR, scoreDummy(sc)) as Slur
            slur.setStartElement(cr)
            slur.setTrack(curTrack)
            slur.setTick(curTick)
            slurs.set(curTrack, slur)
            sc.addSpanner(slur)
        }

        // C++ slurs[curTrack] inserts a null value for a missing track
        const slurOf = (slurs: SlurMap, curTrack: track_idx_t): Slur | null => {
            if (!slurs.has(curTrack)) {
                slurs.set(curTrack, null)
            }
            return slurs.get(curTrack)!
        }

        const mediateSlur = (cr: ChordRest, slurs: SlurMap, curTrack: track_idx_t, curTick: Fraction): void => {
            const slur = slurOf(slurs, curTrack)
            if (!slur) {
                return
            }
            slur.setTrack(curTrack)
            slur.setTrack2(curTrack)
            slur.setTick2(curTick)
            slur.setEndElement(cr)
        }

        const endSlur = (cr: ChordRest, slurs: SlurMap, curTrack: track_idx_t, curTick: Fraction): void => {
            const slur = slurOf(slurs, curTrack)
            if (!slur) {
                return
            }
            slur.setTrack2(curTrack)
            slur.setTick2(curTick)
            slur.setEndElement(cr)
        }

        if (beat.legatoType() === GPBeatLegatoType.Start) {
            startSlur(cr, this._score, this._slurs, cr.track(), cr.tick())
        } else if (beat.legatoType() === GPBeatLegatoType.Mediate) {
            mediateSlur(cr, this._slurs, cr.track(), cr.tick())
        } else if (beat.legatoType() === GPBeatLegatoType.End) {
            endSlur(cr, this._slurs, cr.track(), cr.tick())
        }
    }

    private addOttava(gpb: GPBeat, cr: ChordRest): void {
        const gpType = gpb.ottavaType()
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.OTTAVA, ottavaToImportType(gpType),
            gpType !== GPBeatOttavaType.None)

        if (!cr.isChord()) {
            return
        }

        const chord = cr as Chord
        const [foundOttava, muOttavaType] = ottavaType(gpType)
        if (!foundOttava) {
            return
        }

        for (const note of chord.notes()) {
            const pitch = note.pitch()
            setPitchByOttavaType(note, muOttavaType)

            // pitch changed because of octave
            if (pitch !== note.pitch()) {
                this.m_originalPitches.set(note, pitch)
            }
        }
    }

    /** C++ addLetRing(const GPNote*, Note*) */
    private addLetRingNote(gpnote: GPNote, _note: Note): void {
        if (gpnote.letRing() && this.m_currentGPBeat) {
            this.m_currentGPBeat.setLetRing(true)
        }
    }

    /** C++ addPalmMute(const GPNote*, Note*) */
    private addPalmMuteNote(gpnote: GPNote, _note: Note): void {
        if (gpnote.palmMute() && this.m_currentGPBeat) {
            this.m_currentGPBeat.setPalmMute(true)
        }
    }

    /** C++ addLetRing(const GPBeat*, ChordRest*) */
    private addLetRing(gpbeat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.LET_RING, ContiniousElementsBuilderImportType.LET_RING,
            gpbeat.letRing())
    }

    /** C++ addPalmMute(const GPBeat*, ChordRest*) */
    private addPalmMute(gpbeat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.PALM_MUTE, ContiniousElementsBuilderImportType.PALM_MUTE,
            gpbeat.palmMute())
    }

    private addDive(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.WHAMMY_BAR, ContiniousElementsBuilderImportType.WHAMMY_BAR,
            beat.dive())
    }

    /** C++ addPickScrape(const GPBeat*, ChordRest*) */
    private addPickScrape(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.PICK_SCRAPE, ContiniousElementsBuilderImportType.PICK_SCRAPE,
            beat.pickScrape())
    }

    private addRasgueado(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.RASGUEADO, ContiniousElementsBuilderImportType.RASGUEADO,
            beat.rasgueado() !== GPBeatRasgueado.None)
    }

    private addHarmonicMark(gpbeat: GPBeat, cr: ChordRest): void {
        const b = this.m_continiousElementsBuilder
        b.buildContiniousElement(cr, ElementType.HARMONIC_MARK, ContiniousElementsBuilderImportType.HARMONIC_ARTIFICIAL,
            gpbeat.harmonicMarkArtificial(), ContiniousElementsBuilderHarmonicMarkSubType.ARTIFICIAL)

        b.buildContiniousElement(cr, ElementType.HARMONIC_MARK, ContiniousElementsBuilderImportType.HARMONIC_PINCH,
            gpbeat.harmonicMarkPinch(), ContiniousElementsBuilderHarmonicMarkSubType.PINCH)

        b.buildContiniousElement(cr, ElementType.HARMONIC_MARK, ContiniousElementsBuilderImportType.HARMONIC_TAP,
            gpbeat.harmonicMarkTap(), ContiniousElementsBuilderHarmonicMarkSubType.TAP)

        b.buildContiniousElement(cr, ElementType.HARMONIC_MARK, ContiniousElementsBuilderImportType.HARMONIC_SEMI,
            gpbeat.harmonicMarkSemi(), ContiniousElementsBuilderHarmonicMarkSubType.SEMI)

        b.buildContiniousElement(cr, ElementType.HARMONIC_MARK, ContiniousElementsBuilderImportType.HARMONIC_FEEDBACK,
            gpbeat.harmonicMarkFeedback(), ContiniousElementsBuilderHarmonicMarkSubType.FEEDBACK)
    }

    private addFretDiagram(gpnote: GPBeat, cr: ChordRest, ctx: GPConverterContext, asHarmony = true): void {
        const GPTrackIdx = this._score.parts().indexOf(cr.part()!)
        const diaId = gpnote.diagramIdx(GPTrackIdx, ctx.masterBarIndex)

        if (this._lastDiagramIdx === diaId) {
            return
        }

        this._lastDiagramIdx = diaId

        if (diaId === -1) {
            return
        }

        const track = this._gpDom.tracks().get(GPTrackIdx)
        if (!track) {
            return
        }

        const diagram = track.diagram().get(diaId)
        if (!diagram) {
            return
        }

        /// currently importing fret diagrams as chord names
        if (asHarmony) {
            const h = Factory.createItem(ElementType.HARMONY, cr.segment()) as Harmony
            h.setTrack(cr.track())
            h.setParent(cr.segment())
            h.setHarmonyType(HarmonyType.STANDARD)
            h.setHarmony(diagram.name) // F#dim7
            h.setPlainText(h.harmonyName())
            cr.segment()!.add(h)
            return
        }

        const fretDiagram = Factory.createItem(ElementType.FRET_DIAGRAM, scoreDummy(this._score).segment()) as FretDiagram
        fretDiagram.setTrack(cr.track())
        fretDiagram.setStrings(diagram.stringCount)
        fretDiagram.setFretOffset(diagram.baseFret)

        for (let st = 0; st < diagram.stringCount; st++) {
            fretDiagram.setMarker(st, FretMarkerType.CROSS)
        }

        for (const [string, fret] of diagram.frets) {
            if (fret === 0) {
                fretDiagram.setMarker(string, FretMarkerType.CIRCLE)
            } else {
                fretDiagram.setDot(string, fret)
            }
        }

        cr.segment()!.add(fretDiagram)
    }

    /** C++ addTapping(const GPBeat*, ChordRest*) */
    private addTapping(beat: GPBeat, cr: ChordRest): void {
        if (beat.tappingHand() === GPBeatTappingHand.None || !cr.isChord()) {
            return
        }

        const chord = cr as Chord
        const tapping = Factory.createItem(ElementType.TAPPING, chord) as Tapping
        tapping.setTrack(chord.track())
        tapping.setHand(beat.tappingHand() === GPBeatTappingHand.Left ? TappingHand.LEFT : TappingHand.RIGHT)
        chord.add(tapping)
    }

    private addSlapped(beat: GPBeat, cr: ChordRest): void {
        if (!beat.slapped() || !cr.isChord()) {
            return
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setTextType(ArticulationTextType.SLAP)
        cr.add(art)
    }

    private addPopped(beat: GPBeat, cr: ChordRest): void {
        if (!beat.popped() || !cr.isChord()) {
            return
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setTextType(ArticulationTextType.POP)
        cr.add(art)
    }

    private addBrush(beat: GPBeat, cr: ChordRest): void {
        if (beat.brush() === GPBeatBrush.None) {
            return
        }

        const brushType = (gpArp: GPBeatBrush): ArpeggioType => {
            if (gpArp === GPBeatBrush.Up) {
                return ArpeggioType.DOWN_STRAIGHT
            } else {
                return ArpeggioType.UP_STRAIGHT
            }
        }

        const arp = Factory.createItem(ElementType.ARPEGGIO, scoreDummy(this._score).chord()) as Arpeggio
        arp.setArpeggioType(brushType(beat.brush()))
        arp.setStretch(beat.arpeggioStretch())

        cr.add(arp)
    }

    private addArpeggio(beat: GPBeat, cr: ChordRest): void {
        if (beat.arpeggio() === GPBeatArpeggio.None) {
            return
        }

        const arpeggioType = (gpArp: GPBeatArpeggio): ArpeggioType => {
            if (gpArp === GPBeatArpeggio.Up) {
                return ArpeggioType.DOWN
            } else {
                return ArpeggioType.UP
            }
        }

        const arp = Factory.createItem(ElementType.ARPEGGIO, scoreDummy(this._score).chord()) as Arpeggio
        arp.setArpeggioType(arpeggioType(beat.arpeggio()))
        arp.setStretch(beat.arpeggioStretch())
        cr.add(arp)
    }

    private addTimer(beat: GPBeat, cr: ChordRest): void {
        if (beat.time() === -1) {
            return
        }

        const time = Math.trunc(beat.time() / 1000)
        const minutes = Math.trunc(time / 60)
        const seconds = time % 60
        const st = Factory.createItem(ElementType.STAFF_TEXT, cr.segment()) as StaffText
        st.setPlainText(String(minutes) + ':' + (seconds < 10 ? '0' + String(seconds) : String(seconds)))
        st.setParent(cr.segment())
        st.setTrack(cr.track())
        cr.segment()!.add(st)
    }

    private addFreeText(beat: GPBeat, cr: ChordRest): void {
        if (!beat.freeText()) {
            return
        }

        const text = Factory.createItem(ElementType.STAFF_TEXT, cr.segment()) as StaffText
        text.setTrack(cr.track())
        text.setPlainText(beat.freeText())
        cr.segment()!.add(text)
    }

    private setupTupletStyle(tuplet: Tuplet): void {
        let real = false

        switch (tuplet.ratio().numerator()) {
        case 2: {
            real = (tuplet.ratio().denominator() === 3)
            break
        }
        case 3:
        case 4: {
            real = ((tuplet.ratio().denominator() === 2) || (tuplet.ratio().denominator() === 6))
            break
        }
        case 5:
        case 6:
        case 7: {
            real = (tuplet.ratio().denominator() === 4)
            break
        }
        case 9:
        case 10:
        case 11:
        case 12:
        case 13: {
            real = (tuplet.ratio().denominator() === 8)
            break
        }
        }
        if (!real) {
            tuplet.setNumberType(TupletNumberType.SHOW_RELATION)
            tuplet.setPropertyFlags(Pid.NUMBER_TYPE, PropertyFlags.UNSTYLED)
        }
    }

    private tupletParamsChanged(beat: GPBeat, cr: ChordRest): boolean {
        const info = this.m_nextTupletInfo
        return beat.tuplet().num === -1
               || new Fraction(beat.tuplet().num, beat.tuplet().denom).ne(info.ratio)
               || cr.track() !== info.track
               || cr.measure() !== info.measure
               || (info.elements.length > 1
                   && info.duration.eq(new Fraction(info.ratio.denominator(), info.lowestBase)))
    }

    private addTuplet(beat: GPBeat, cr: ChordRest): void {
        const currentTupletType = new Fraction(beat.tuplet().num, beat.tuplet().denom)

        if (this.m_nextTupletInfo.tuplet && this.tupletParamsChanged(beat, cr)) {
            this.fillTuplet()
        }

        if (beat.tuplet().num === -1) {
            return
        }

        const info = this.m_nextTupletInfo
        info.lowestBase = Math.min(info.lowestBase, cr.ticks().denominator())

        if (!info.tuplet) {
            info.tuplet = Factory.createItem(ElementType.TUPLET, scoreDummy(this._score).measure()) as Tuplet
            info.tuplet.setRatio(currentTupletType)
            info.ratio = currentTupletType
            info.measure = cr.measure()
            info.track = cr.track()
        }

        info.elements.push(cr)
        cr.setTuplet(info.tuplet)
        info.duration = info.duration.plus(cr.actualTicks())
    }

    /** C++ addVibratoWTremBar(const GPBeat*, ChordRest*) */
    private addVibratoWTremBar(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
            ContiniousElementsBuilderImportType.VIBRATO_W_TREM_BAR_SLIGHT,
            beat.vibratoWTremBar() === GPBeatVibratoWTremBar.Slight,
            ContiniousElementsBuilderVibratoSubType.W_TREM_BAR_SLIGHT)

        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
            ContiniousElementsBuilderImportType.VIBRATO_W_TREM_BAR_WIDE,
            beat.vibratoWTremBar() === GPBeatVibratoWTremBar.Wide,
            ContiniousElementsBuilderVibratoSubType.W_TREM_BAR_WIDE)
    }

    /** C++ addVibratoLeftHand(const GPBeat*, ChordRest*) */
    private addVibratoLeftHand(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
            ContiniousElementsBuilderImportType.VIBRATO_LEFT_HAND_SLIGHT,
            beat.vibratoLeftHand() === GPBeatVibratoLeftHand.Slight,
            ContiniousElementsBuilderVibratoSubType.LEFT_HAND_SLIGHT)

        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.VIBRATO,
            ContiniousElementsBuilderImportType.VIBRATO_LEFT_HAND_WIDE,
            beat.vibratoLeftHand() === GPBeatVibratoLeftHand.Wide,
            ContiniousElementsBuilderVibratoSubType.LEFT_HAND_WIDE)
    }

    private addFadding(beat: GPBeat, cr: ChordRest): void {
        if (beat.fadding() === GPBeatFadding.None) {
            return
        }
        if (!cr.isChord()) {
            return
        }

        const scoreFadding = (fad: GPBeatFadding): SymId => {
            if (fad === GPBeatFadding.FadeIn) {
                return SymId.guitarFadeIn
            } else if (fad === GPBeatFadding.FadeOut) {
                return SymId.guitarFadeOut
            } else {
                return SymId.guitarVolumeSwell
            }
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setSymId(scoreFadding(beat.fadding()))
        if (!this._score.toggleArticulation((cr as Chord).upNote(), art)) {
            // C++ delete art
        }
    }

    private addHairPin(beat: GPBeat, cr: ChordRest): void {
        this.m_continiousElementsBuilder.buildContiniousElement(cr, ElementType.HAIRPIN, hairpinToImportType(beat.hairpin()),
            beat.hairpin() !== GPBeatHairpin.None)
    }

    private addPickStroke(beat: GPBeat, cr: ChordRest): void {
        if (beat.pickStroke() === GPBeatPickStroke.None) {
            return
        }
        if (!cr.isChord()) {
            return
        }

        const scorePickStroke = (p: GPBeatPickStroke): SymId => {
            if (p === GPBeatPickStroke.Up) {
                return SymId.stringsUpBow
            } else {
                return SymId.stringsDownBow
            }
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setSymId(scorePickStroke(beat.pickStroke()))
        if (!this._score.toggleArticulation((cr as Chord).upNote(), art)) {
            // C++ delete art
        }
    }

    private addTremolo(beat: GPBeat, cr: ChordRest): void {
        if (!cr.isChord() || beat.tremolo().numerator === -1) {
            return
        }

        const scoreTremolo = (tr: GPBeatTremolo): TremoloType => {
            if (tr.denominator === 2) {
                return TremoloType.R8
            }
            if (tr.denominator === 4) {
                return TremoloType.R16
            } else {
                return TremoloType.R32
            }
        }

        const t = Factory.createItem(ElementType.TREMOLO_SINGLECHORD, scoreDummy(this._score).chord()) as TremoloSingleChord
        t.setTremoloType(scoreTremolo(beat.tremolo()))
        const ch = cr as Chord
        ch.add(t)
        this.m_tremolosInChords.set(ch, t.tremoloType())
    }

    private addWah(beat: GPBeat, cr: ChordRest): void {
        if (beat.wah() === GPBeatWah.None) {
            return
        }
        if (!cr.isChord()) {
            return
        }

        const scoreWah = (wah: GPBeatWah): SymId => {
            if (wah === GPBeatWah.Open) {
                return SymId.brassMuteOpen
            }
            return SymId.brassMuteClosed
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setSymId(scoreWah(beat.wah()))
        if (!this._score.toggleArticulation((cr as Chord).upNote(), art)) {
            // C++ delete art
        }
    }

    private addGolpe(beat: GPBeat, cr: ChordRest): void {
        if (beat.golpe() === GPBeatGolpe.None) {
            return
        }
        if (!cr.isChord()) {
            return
        }

        const art = Factory.createItem(ElementType.ARTICULATION, scoreDummy(this._score).chord()) as Articulation
        art.setSymId(SymId.guitarGolpe)

        if (beat.golpe() === GPBeatGolpe.Thumb) {
            art.setAnchor(ArticulationAnchor.BOTTOM)
        }

        if (!this._score.toggleArticulation((cr as Chord).upNote(), art)) {
            // C++ delete art
        }
    }

    private addBarre(beat: GPBeat, cr: ChordRest): void {
        if (beat.barre().fret === -1) {
            return
        }
        if (!cr.isChord()) {
            return
        }

        const barreType = (barre: GPBeatBarre): string => {
            if (barre.string === 1) {
                return '1/2B '
            } else {
                return 'B '
            }
        }

        let barreFret = ''
        const fret = beat.barre().fret

        for (let i = 0; i < Math.trunc(fret / 10); i++) {
            barreFret += 'X'
        }
        let targetMod10 = fret % 10
        if (targetMod10 === 9) {
            barreFret += 'IX'
        } else if (targetMod10 === 4) {
            barreFret += 'IV'
        } else {
            if (targetMod10 >= 5) {
                barreFret += 'V'
                targetMod10 -= 5
            }
            for (let j = 0; j < targetMod10; j++) {
                barreFret += 'I'
            }
        }

        this.addTextToNote(barreType(beat.barre()) + barreFret, (cr as Chord).upNote())
    }

    private addLyrics(beat: GPBeat, cr: ChordRest, ctx: GPConverterContext): void {
        const GPTrackIdx = Number(cr.part()!.id())

        const lyrStr = beat.lyrics(GPTrackIdx, ctx.masterBarIndex)
        if (!lyrStr) {
            return
        }

        const lyr = Factory.createItem(ElementType.LYRICS, scoreDummy(this._score).chord()) as Lyrics

        if (lyrStr[lyrStr.length - 1] === '-') {
            lyr.setSyllabic(LyricsSyllabic.MIDDLE)
            lyr.setPlainText(lyrStr.slice(0, lyrStr.length - 1))
        } else {
            lyr.setPlainText(lyrStr)
        }
        cr.add(lyr)
    }

    private clearDefectedGraceChord(graceGhords: ChordRestContainer): void {
        const eraseFromSlideHammerOnMap = (pNote: Note): void => {
            const i = this._slideHammerOnMap.findIndex(p => p[0] === pNote)
            if (i >= 0) {
                this._slideHammerOnMap.splice(i, 1)
            }
        }

        for (const [pCr] of graceGhords) {
            if (!pCr) {
                continue
            }

            if (pCr.isChord()) {
                const pChord = pCr as Chord
                for (const pNote of pChord.notes()) {
                    eraseFromSlideHammerOnMap(pNote)
                }

                for (const pGraceChord of pChord.graceNotes()) {
                    for (const pNote of pGraceChord.notes()) {
                        eraseFromSlideHammerOnMap(pNote)
                    }
                }
            }
            // C++ delete pCr: the chord was added to its segment, but is normally replaced there by the rest of
            // fillUncompletedMeasure; if it is still there (a dangling pointer in C++), it is removed
            const seg = pCr.parent()
            if (seg && seg.isSegment() && (seg as Segment).element(pCr.track()) === pCr) {
                (seg as Segment).remove(pCr)
            }
        }
        graceGhords.length = 0
    }

    private addTextToNote(string: string, note: Note): void {
        const segment = note.chord().segment()!
        const text = Factory.createItem(ElementType.STAFF_TEXT, segment) as StaffText

        if (string) {
            const useHarmony = string[string.length - 1] === '\\'
            if (useHarmony) {
                string = string.slice(0, -1)
            }
        }
        text.setPlainText(string)
        text.setTrack(note.chord().track())
        segment.add(text)
    }

    private clearDefectedSpanner(): void {
        for (const elems of this._ties.values()) {
            for (const tie of elems) {
                if (tie.startNote()) {
                    tie.startNote()!.setTieFor(null)
                }

                if (tie.endNote()) {
                    tie.endNote()!.setTieBack(null)
                }

                // C++ delete tie
            }
        }
    }

    private getStringNumberFor(pNote: Note, pitch: number): number {
        const stringTable = pNote.part()!.instrument().stringData().stringList()

        const stringTableSize = stringTable.length

        if (!stringTableSize) {
            return -1
        }

        const lastIdx = stringTableSize - 1

        for (let idx = lastIdx; idx >= 0; --idx) {
            const string = stringTable[idx]
            const currenStringNumber = lastIdx - idx

            if (pitch >= string.pitch) {
                let emptyString = true

                for (const noteTmp of pNote.chord().notes()) {
                    if (noteTmp.string() === currenStringNumber) {
                        emptyString = false
                        break
                    }
                }

                if (emptyString) {
                    return currenStringNumber
                }
            }
        }

        return -1
    }

    private setBeamMode(beat: GPBeat, cr: ChordRest, measure: Measure, tick: Fraction): void {
        let beamMode = BeamMode.AUTO

        if (beat.beamMode() === GPBeatBeamMode.BROKEN) {
            beamMode = BeamMode.NONE
        } else if (beat.beamMode() === GPBeatBeamMode.JOINED) {
            beamMode = BeamMode.MID
        } else if (beat.beamMode() === GPBeatBeamMode.BROKEN2 || beat.beamMode() === GPBeatBeamMode.BROKEN2_JOINED) {
            const measureDenom = measure.ticks().denominator()
            const fract = tick.numerator() / tick.denominator() * measureDenom

            if (Math.trunc(fract) === fract && beat.beamMode() !== GPBeatBeamMode.BROKEN2_JOINED) {
                /// keep auto direction for some beams, so BEGIN16/BEGIN32 modes work properly
                /// (forcing divide of beam groups, TODO-gp: make possible to show broken2 type from guitar pro
                beamMode = BeamMode.AUTO
            } else if (cr.ticks().gt(new Fraction(1, 32))) {
                beamMode = BeamMode.BEGIN16
            } else {
                beamMode = BeamMode.BEGIN32
            }
        }

        cr.setBeamMode(this.m_previousBeamMode)
        this.m_previousBeamMode = beamMode
    }

    private addCapos(): void {
        const firstMeasure = this._score.firstMeasure()!
        const stavesCount = this._score.staves().length

        const segment = firstMeasure.first(SegmentType.ChordRest)!
        for (let i = 0; i < stavesCount; ++i) {
            const staff = this._score.staff(i)!
            const fretPosition = this.m_capoParams.get(Number(staff.part().id()))

            if (fretPosition !== undefined && fretPosition > 0) {
                const track = i * GPConverter.VOICES

                const params = new CapoParams()
                params.active = true
                params.transposeMode = CapoTransposeMode.TAB_ONLY
                params.fretPosition = fretPosition

                const capo = Factory.createItem(ElementType.CAPO, scoreDummy(this._score).segment()) as Capo
                capo.setTrack(track)
                capo.setParams(params)
                segment.add(capo)

                staff.insertCapoParams(new Fraction(0, 1), params, true)
            }
        }
    }
}

function findClosestSegment(m: Measure, tick: Fraction): Segment {
    let segment = m.findSegment(SegmentType.ChordRest, tick)
    if (!segment) {
        segment = m.getSegment(SegmentType.ChordRest, tick)
        const prev = segment.prev1(SegmentType.ChordRest)
        const next = segment.next1(SegmentType.ChordRest)
        if (prev && next) {
            segment = (next.tick().minus(segment.tick()).lt(segment.tick().minus(prev.tick())) ? next : prev)
        } else if (prev) {
            segment = prev
        } else if (next) {
            segment = next
        }
    }

    return segment
}
