/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/compatmidirenderinternal.h/.cpp: render score into event list
 * The C++ float arithmetic of the pitch wheel functions is emulated with Math.fround.
 */

import { RealIsEqual, RealIsNull } from '../../../framework/global/realfn'
import { Accidental } from '../../dom/accidental'
import type { Bend } from '../../dom/bend'
import type { Chord } from '../../dom/chord'
import type { Dynamic } from '../../dom/dynamic'
import type { FretDiagram } from '../../dom/fret'
import type { Glissando } from '../../dom/glissando'
import type { GuitarBend } from '../../dom/guitarbend'
import type { Hairpin } from '../../dom/hairpin'
import type { Harmony } from '../../dom/harmony'
import type { Instrument } from '../../dom/instrument'
import type { LetRing } from '../../dom/letring'
import type { Measure } from '../../dom/measure'
import type { MeasureRepeat } from '../../dom/measurerepeat'
import { MScore } from '../../dom/mscore'
import { NoteType } from '../../dom/chordrest'
import { HairpinType } from '../../dom/hairpin'
import type { Note } from '../../dom/note'
import { NoteEvent } from '../../dom/noteevent'
import type { Score } from '../../dom/score'
import { SegmentType } from '../../dom/segment'
import type { Spanner } from '../../dom/spanner'
import type { Staff } from '../../dom/staff'
import type { StaffTextBase } from '../../dom/stafftextbase'
import { StringData } from '../../dom/stringdata'
import type { Tie } from '../../dom/tie'
import type { Trill } from '../../dom/trill'
import type { Vibrato } from '../../dom/vibrato'
import type { Volta } from '../../dom/volta'
import { Constants } from '../../types/constants'
import { Fraction } from '../../types/fraction'
import { PitchValue } from '../../types/pitchvalue'
import { SymId } from '../../types/symid'
import {
    ChangeDirection, ChangeMethod, GuitarBendType, OrnamentStyle, VibratoType, VoiceAssignment, VOICES,
    GlissandoStyle,
} from '../../types/types'
import { CompatMidiRender } from './compatmidirender'
import { EventsHolder, NPlayEvent } from './event'
import {
    CTRL_ALL_NOTES_OFF, CTRL_BREATH, CTRL_PROGRAM, CTRL_SUSTAIN, ME_CONTROLLER, ME_NOTEON, PitchWheelSpecs,
} from './midicoreevent'
import { MidiInstrumentEffect } from './midiinstrumenteffects'
import { PauseMap } from './pausemap'
import { PitchWheelRenderer, type PitchWheelFunction } from './pitchwheelrenderer'
import { VelocityMap } from './velocitymap'

const f32 = Math.fround

/**
 * This struct specifies how to render an articulation.
 *   atype - the articulation type to implement, such as SymId::ornamentTurn
 *   ostyles - the actual ornament has a property called ornamentStyle whose value is
 *             a value of type OrnamentStyle.  This ostyles field indicates the
 *             the set of ornamentStyles which apply to this rendition.
 *   duration - the default duration for each note in the rendition, the final duration
 *            rendered might be less than this if an articulation is attached to a note of
 *            short duration.
 *   prefix - vector of integers. indicating which notes to play at the beginning of rendering the
 *            articulation.  0 represents the principle note, 1==> the note diatonically 1 above
 *            -1 ==> the note diatonically 1 below.  E.g., in the key of G, if a turn articulation
 *            occurs above the note F#, then 0==>F#, 1==>G, -1==>E.
 *            These integers indicate which notes actual notes to play when rendering the ornamented
 *            note.   However, if the same integer appears several times adjacently such as {0,0,0,1}
 *            That means play the notes tied.  e.g., F# followed by G, but the duration of F# is 3x the
 *            duration of the G.
 *    body   - notes to play comprising the body of the rendered ornament.
 *            The body differs from the prefix and suffix in several ways.
 *            * body does not support tied notes: {0,0,0,1} means play 4 distinct notes (not tied).
 *            * if there is sufficient duration in the principle note, AND repeatp is true, then body
 *               will be rendered multiple times, as the duration allows.
 *            * to avoid a time gap (or rest) in rendering the articulation, if sustainp is true,
 *               then the final note of the body will be sustained to fill the left-over time.
 *    suffix - similar to prefix but played once at the end of the rendered ornament.
 *    repeatp  - whether the body is repeatable in its entirety.
 *    sustainp - whether the final note of the body should be sustained to fill the remaining duration.
 */
export interface OrnamentExcursion {
    atype: SymId
    ostyles: readonly OrnamentStyle[]
    duration: number
    prefix: readonly number[]
    body: readonly number[]
    repeatp: boolean
    sustainp: boolean
    suffix: readonly number[]
}

const baroque: readonly OrnamentStyle[] = [OrnamentStyle.BAROQUE]
const defstyle: readonly OrnamentStyle[] = [OrnamentStyle.DEFAULT]
const any: readonly OrnamentStyle[] = [] // empty set has the special meaning of any-style, rather than no-styles.
const _16th = Constants.DIVISION / 4
const _32nd = _16th / 2

export const SLIDE_DURATION = _32nd
export const GRACE_BEND_DURATION = _16th

const ex = (atype: SymId, ostyles: readonly OrnamentStyle[], duration: number, prefix: number[], body: number[], repeatp: boolean,
            sustainp: boolean, suffix: number[]): OrnamentExcursion => ({ atype, ostyles, duration, prefix, body, repeatp, sustainp, suffix })

export const excursions: readonly OrnamentExcursion[] = [
    //  articulation type            set of  duration       body         repeatp      suffix
    //                               styles          prefix                    sustainp
    ex(SymId.ornamentTurn, any, _32nd, [], [1, 0, -1, 0], false, true, []),
    ex(SymId.ornamentTurnInverted, any, _32nd, [], [-1, 0, 1, 0], false, true, []),
    ex(SymId.ornamentTurnSlash, any, _32nd, [], [-1, 0, 1, 0], false, true, []),
    ex(SymId.ornamentTrill, baroque, _32nd, [1, 0], [1, 0], true, true, []),
    ex(SymId.ornamentTrill, defstyle, _32nd, [0, 1], [0, 1], true, true, []),
    ex(SymId.brassMuteClosed, baroque, _32nd, [0, -1], [0, -1], true, true, []),
    ex(SymId.ornamentMordent, any, _32nd, [], [0, -1, 0], false, true, []),
    ex(SymId.ornamentShortTrill, defstyle, _32nd, [], [0, 1, 0], false, true, []), // inverted mordent
    ex(SymId.ornamentShortTrill, baroque, _32nd, [1, 0, 1], [0], false, true, []), // short trill
    ex(SymId.ornamentTremblement, any, _32nd, [1, 0], [1, 0], false, true, []),
    ex(SymId.brassMuteClosed, defstyle, _32nd, [], [0], false, true, []), // regular hand-stopped brass
    ex(SymId.ornamentPrallMordent, any, _32nd, [], [1, 0, -1, 0], false, true, []),
    ex(SymId.ornamentLinePrall, any, _32nd, [2, 2, 2], [1, 0], true, true, []),
    ex(SymId.ornamentUpPrall, any, _16th, [-1, 0], [1, 0], true, true, [1, 0]), // p 144 Ex 152 [1]
    ex(SymId.ornamentUpMordent, any, _16th, [-1, 0], [1, 0], true, true, [-1, 0]), // p 144 Ex 152 [1]
    ex(SymId.ornamentPrecompMordentUpperPrefix, any, _16th, [1, 1, 1, 0], [1, 0], true, true, []), // p136 Cadence Appuyee [1] [2]
    ex(SymId.ornamentDownMordent, any, _16th, [1, 1, 1, 0], [1, 0], true, true, [-1, 0]), // p136 Cadence Appuyee + mordent [1] [2]
    ex(SymId.ornamentPrallUp, any, _16th, [1, 0], [1, 0], true, true, [-1, 0]), // p136 Double Cadence [1]
    ex(SymId.ornamentPrallDown, any, _16th, [1, 0], [1, 0], true, true, [-1, 0, 0, 0]), // p144 ex 153 [1]
    ex(SymId.ornamentPrecompSlide, any, _32nd, [], [0], false, true, []),

    // [1] Some of the articulations/ornaments in the excursions table above come from
    // Baroque Music, Style and Performance A Handbook, by Robert Donington,(c) 1982
    // ISBN 0-393-30052-8, W. W. Norton & Company, Inc.

    // [2] In some cases, the example from [1] does not preserve the timing.
    // For example, illustrates 2+1/4 counts per half note.
]

export interface LookupData {
    string: number
    staffIdx: number
    effect: MidiInstrumentEffect
    harmony: boolean
    /** not in C++: the voice of the note (Context.eachVoiceHasChannel) */
    voice: number
}

export const INVALID_STRING = -1

function newLookupData(): LookupData {
    return { string: INVALID_STRING, staffIdx: 0, effect: MidiInstrumentEffect.NONE, harmony: false, voice: 0 }
}

/** LookupData::operator< as a comparison function */
function compareLookupData(a: LookupData, b: LookupData): number {
    if (a.harmony && !b.harmony) {
        return -1
    }
    if (!a.harmony && b.harmony) {
        return 1
    }
    if (a.string !== b.string) {
        return a.string < b.string ? -1 : 1
    }
    if (a.staffIdx !== b.staffIdx) {
        return a.staffIdx < b.staffIdx ? -1 : 1
    }
    if (a.effect !== b.effect) {
        return a.effect < b.effect ? -1 : 1
    }
    if (a.voice !== b.voice) {
        return a.voice < b.voice ? -1 : 1
    }
    return 0
}

/** helper structure to find channel */
export class ChannelLookup {
    /** instrument channel -> (lookup data -> channel), each inner list ordered like std::map<LookupData, int> */
    channelsMap = new Map<number, [LookupData, number][]>()
    maxChannel = 0

    channelsFor(instrumentChannel: number): [LookupData, number][] {
        let list = this.channelsMap.get(instrumentChannel)
        if (!list) {
            list = []
            this.channelsMap.set(instrumentChannel, list)
        }
        return list
    }

    getChannel(instrumentChannel: number, lookupData: LookupData): number {
        const channelsForInstrument = this.channelsFor(instrumentChannel)

        let i = 0
        for (; i < channelsForInstrument.length; ++i) {
            const c = compareLookupData(channelsForInstrument[i][0], lookupData)
            if (c === 0) {
                return channelsForInstrument[i][1]
            }
            if (c > 0) {
                break
            }
        }

        channelsForInstrument.splice(i, 0, [{ ...lookupData }, this.maxChannel])
        return this.maxChannel++
    }
}

export enum HarmonyChannelSetting {
    DISABLED = -1, // harmony chords should not be played
    DEFAULT = 0, // harmony chords' channels are setup in default way
    LOOKUP, // harmony chords' channels are setup in specific way
}

export interface BuiltInArticulation {
    velocityMultiplier: number
    gateTime: number
}

export class Context {
    static s_builtInArticulationsValues = new Map<string, BuiltInArticulation>([
        ['staccatissimo', { velocityMultiplier: 1.0, gateTime: 30 }],
        ['staccato', { velocityMultiplier: 1.0, gateTime: 50 }],
        ['portato', { velocityMultiplier: 1.0, gateTime: 67 }],
        ['tenuto', { velocityMultiplier: 1.0, gateTime: 100 }],
        ['accent', { velocityMultiplier: 1.2, gateTime: 100 }],
        ['marcato', { velocityMultiplier: 1.44, gateTime: 100 }],
        ['sforzato', { velocityMultiplier: 1.69, gateTime: 100 }],
    ])

    /** C++ s_builtInArticulationsValues[name] (operator[] inserts a default value) */
    static builtInArticulation(name: string): BuiltInArticulation {
        let a = Context.s_builtInArticulationsValues.get(name)
        if (!a) {
            a = { velocityMultiplier: 1.0, gateTime: 100 }
            Context.s_builtInArticulationsValues.set(name, a)
        }
        return a
    }

    eachStringHasChannel = false //!to better display the guitar instrument, each string has its own channel
    instrumentsHaveEffects = false //!when effect is applied, new channel should be used
    /**
     * not in C++: each voice has its own channel, like the channels of MuseScore 4's Fluid synth (ChannelMap of
     * soundmapping.h: a channel per voice and articulation), so that pitch bends of a voice do not bend the others
     */
    eachVoiceHasChannel = false
    /**
     * not in C++: the MIDI actions and Aeolus stops of staff texts (collectProgramChanges); MuseScore 4's playback
     * does not play them
     */
    renderMidiActions = true
    useDefaultArticulations = false //!using default articulations means ignoring the ones stored for each instrument
    applyCaesuras = false //! to add pauses (caesura) between midi events
    harmonyChannelSetting = HarmonyChannelSetting.DEFAULT
    partsWithMutedHarmony = new Set<string>()
    sndController = CTRL_BREATH
    velocitiesByTrack = new Map<number, VelocityMap>()
    velocityMultiplicationsByTrack = new Map<number, VelocityMap>()
    articulationsWithoutValuesByInstrument = new Map<string, Set<string>>()
    channels = new ChannelLookup() // shared_ptr
    pauseMap = new PauseMap() // shared_ptr

    /** the C++ copy of the struct: the maps are copied, channels and pauseMap are shared */
    clone(): Context {
        const c = new Context()
        c.eachStringHasChannel = this.eachStringHasChannel
        c.instrumentsHaveEffects = this.instrumentsHaveEffects
        c.eachVoiceHasChannel = this.eachVoiceHasChannel
        c.renderMidiActions = this.renderMidiActions
        c.useDefaultArticulations = this.useDefaultArticulations
        c.applyCaesuras = this.applyCaesuras
        c.harmonyChannelSetting = this.harmonyChannelSetting
        c.partsWithMutedHarmony = new Set(this.partsWithMutedHarmony)
        c.sndController = this.sndController
        c.velocitiesByTrack = new Map(this.velocitiesByTrack)
        c.velocityMultiplicationsByTrack = new Map(this.velocityMultiplicationsByTrack)
        c.articulationsWithoutValuesByInstrument = new Map(this.articulationsWithoutValuesByInstrument)
        c.channels = this.channels
        c.pauseMap = this.pauseMap
        return c
    }

    /** C++ velocitiesByTrack[track] / .at(track) */
    velocities(track: number): VelocityMap {
        let m = this.velocitiesByTrack.get(track)
        if (!m) {
            m = new VelocityMap()
            this.velocitiesByTrack.set(track, m)
        }
        return m
    }

    velocityMultiplications(track: number): VelocityMap {
        let m = this.velocityMultiplicationsByTrack.get(track)
        if (!m) {
            m = new VelocityMap()
            this.velocityMultiplicationsByTrack.set(track, m)
        }
        return m
    }
}

const g_wheelSpec = new PitchWheelSpecs()
const LET_RING_MAX_TICKS = Constants.DIVISION * 16
// TODO this should be a (configurable?) constant somewhere
const ARTICULATION_CHANGE_TIME_MAX = new Fraction(1, 16)

class CollectNoteParams {
    velocityMultiplier = 1.0
    tickOffset = 0
    graceOffsetOn = 0
    graceOffsetOff = 0
    endLetRingTick = 0
    previousChordTicks = -1
    letRingNote = false
    effect = MidiInstrumentEffect.NONE
    callAllSoundOff = false //NoteOn silence channel
}

class PlayNoteParams {
    channel = 0
    pitch = 0
    velo = 0
    onTime = 0
    offTime = 0
    offset = 0
    staffIdx = 0
    effect = MidiInstrumentEffect.NONE
    callAllSoundOff = false //NoteOn silence channel
}

interface VibratoParams {
    lowPitch: number
    highPitch: number
    period: number
}

interface BendPlaybackInfo {
    startTick: number
    endTick: number
    startTimeFactor: number
    endTimeFactor: number
}

/** Converts midi time (noteoff - noteon) to milliseconds */
export function toMilliseconds(tempo: number, midiTime: number): number {
    const ticksPerSecond = f32(Constants.DIVISION * tempo)
    let time = Math.trunc(f32(f32(midiTime / ticksPerSecond) * 1000.0))
    if (time > 0x7fff) { //maximum possible value
        time = 0x7fff
    }
    return time
}

/** Detects if a note is a start of a glissando */
export function isGlissandoFor(note: Note): boolean {
    for (const spanner of note.spannerFor()) {
        if (spanner.isGlissando()) {
            return true
        }
    }
    return false
}

/** Detects if a note is an end of a glissando */
export function isGlissandoBack(note: Note): boolean {
    for (const spanner of note.spannerBack()) {
        if (spanner.isGlissando()) {
            return true
        }
    }
    return false
}

function collectGlissando(channel: number, effect: MidiInstrumentEffect, onTime: number, offTime: number, pitchDelta: number,
                          pitchWheelRenderer: PitchWheelRenderer, staffIdx: number): void {
    const scale = f32(g_wheelSpec.mLimit / g_wheelSpec.mAmplitude)

    const startTick = onTime
    const endTick = offTime
    const linearFunc = (tick: number): number => {
        const x = f32(f32(tick - startTick) / (endTick - startTick))
        return f32(f32(pitchDelta * x) * scale)
    }
    const func: PitchWheelFunction = { mStartTick: onTime, mEndTick: offTime, func: linearFunc }

    pitchWheelRenderer.addPitchWheelFunction(func, channel, staffIdx, effect)
}

function getPlayTicksForBend(note: Note): Fraction {
    let tie: Tie | null = note.tieFor()
    if (!tie || !tie.endNote()) {
        return note.chord().actualTicks()
    }

    const stick = note.chord().tick()
    let nextNote = tie.endNote()!
    while (tie && tie.endNote()) {
        nextNote = tie.endNote()!
        for (const e of nextNote.el()) {
            if (e && (e.isBend())) {
                return nextNote.chord().tick().minus(stick)
            }
        }

        tie = nextNote.tieFor()
    }

    return nextNote.chord().endTick().minus(stick)
}

function playNote(events: EventsHolder, note: Note, params: PlayNoteParams, pitchWheelRenderer: PitchWheelRenderer): void {
    if (!note.play()) {
        return
    }

    if (note.userVelocity() !== 0) {
        params.velo = note.customizeVelocity(params.velo)
    }

    if (params.callAllSoundOff && params.onTime !== 0) {
        const ev1 = new NPlayEvent(ME_CONTROLLER, params.channel, CTRL_ALL_NOTES_OFF, 0)
        ev1.setEffect(params.effect)
        events.at(params.channel).emplace(params.onTime - 1, ev1)
    }

    const ev = new NPlayEvent(ME_NOTEON, params.channel, params.pitch, params.velo)
    ev.setOriginatingStaff(params.staffIdx)
    ev.setTuning(note.tuning())
    ev.setNote(note)
    ev.setEffect(params.effect)
    if (params.offTime > 0 && params.offTime < params.onTime) {
        return
    }

    events.at(params.channel).emplace(Math.max(0, params.onTime - params.offset), ev)
    const acc = note.accidental()
    if (acc) {
        const type = acc.accidentalType()
        const cents = Accidental.subtype2centOffset(type)
        if (!RealIsNull(cents)) {
            const pwValue = cents / 100.0 * g_wheelSpec.mLimit / g_wheelSpec.mAmplitude
            const microtonalPW = (): number => Math.round(pwValue)
            const func: PitchWheelFunction = {
                mStartTick: params.onTime - params.offset, mEndTick: params.offTime - params.offset, func: microtonalPW,
            }
            pitchWheelRenderer.addPitchWheelFunction(func, params.channel, params.staffIdx, MidiInstrumentEffect.NONE)
        }
    }
    // adds portamento for continuous glissando
    for (const spanner of note.spannerFor()) {
        if (spanner.isGlissando()) {
            const glissando = spanner as unknown as Glissando
            if (glissando.glissandoStyle() === GlissandoStyle.PORTAMENTO) {
                const nextNote = spanner.endElement() as unknown as Note
                const pitchDelta = nextNote.ppitch() - params.pitch
                const timeDelta = params.offTime - params.onTime
                if (pitchDelta !== 0 && timeDelta !== 0) {
                    collectGlissando(params.channel, params.effect, params.onTime, params.offTime, pitchDelta, pitchWheelRenderer,
                        glissando.staffIdx())
                }
            }
        }
    }

    ev.setVelo(0)
    if (params.offTime !== -1) {
        events.at(params.channel).emplace(Math.max(0, params.offTime - params.offset), ev)
    }
}

function collectVibrato(channel: number, onTime: number, offTime: number, vibratoParams: VibratoParams,
                        pitchWheelRenderer: PitchWheelRenderer, effect: MidiInstrumentEffect, staffIdx: number): void {
    const vibratoPeriod = vibratoParams.period & 0xffff
    const duration = offTime - onTime
    const scale = f32(f32(2 * g_wheelSpec.mLimit / g_wheelSpec.mAmplitude) / 100)

    if (duration < vibratoPeriod) {
        return
    }

    const pillarAmplitude = (vibratoParams.highPitch - vibratoParams.lowPitch)

    const startTick = onTime
    const lowPitch = vibratoParams.lowPitch
    const vibratoFunc = (tick: number): number => {
        const x = f32(f32(tick - startTick) / vibratoPeriod)
        return (pillarAmplitude * 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * x)) + lowPitch) * scale
    }
    const func: PitchWheelFunction = {
        mStartTick: onTime,
        mEndTick: offTime - duration % vibratoPeriod, //removed last points to make more smooth of the end
        func: vibratoFunc,
    }

    pitchWheelRenderer.addPitchWheelFunction(func, channel, staffIdx, effect)
}

function addConstPitchWheel(startTick: number, endTick: number, value: number, pitchWheelRenderer: PitchWheelRenderer, channel: number,
                            staffIdx: number, effect: MidiInstrumentEffect): void {
    const scale = f32(g_wheelSpec.mLimit / g_wheelSpec.mAmplitude)
    const v = f32(value)

    const constFunc = (): number => f32(v * scale)

    const pitchWheelConstFunc: PitchWheelFunction = { func: constFunc, mStartTick: startTick, mEndTick: endTick }
    pitchWheelRenderer.addPitchWheelFunction(pitchWheelConstFunc, channel, staffIdx, effect)
}

function shouldProceedBend(note: Note): boolean {
    const bendFor = note.bendFor()!
    let baseNote = bendFor.startNoteOfChain()!

    const firstBend = baseNote.bendFor()
    if (firstBend && firstBend.bendType() === GuitarBendType.PRE_BEND) {
        const nextNote = firstBend.endNote()
        if (nextNote) {
            baseNote = nextNote
        }
    }

    return baseNote.lastTiedNote(false) === note
}

function getBendPlaybackInfo(bend: GuitarBend, bendStart: number, bendDuration: number, graceBeforeBend: boolean): BendPlaybackInfo {
    const bendInfo: BendPlaybackInfo = { startTick: 0, endTick: 0, startTimeFactor: 0.0, endTimeFactor: 1.0 }

    // currently ignoring diagram for "grace before" bends
    if (!graceBeforeBend) {
        bendInfo.startTimeFactor = f32(bend.startTimeFactor())
        bendInfo.endTimeFactor = f32(bend.endTimeFactor())
    }

    bendInfo.startTick = Math.trunc(bendStart + f32(bendDuration * bendInfo.startTimeFactor))
    bendInfo.endTick = Math.trunc(bendStart + f32(bendDuration * bendInfo.endTimeFactor))

    return bendInfo
}

function fillBendDurations(bendStartNote: Note | null, currentNotes: Set<Note>, durations: Map<Note, number>): void {
    if (!bendStartNote || !currentNotes.size) {
        return
    }

    const eachBendDuration = Math.trunc(bendStartNote.chord().actualTicks().ticks() / currentNotes.size)

    for (const note of currentNotes) {
        if (!durations.has(note)) {
            durations.set(note, eachBendDuration)
        }
    }
}

function getGraceNoteBendDurations(note: Note): Map<Note, number> {
    const durations = new Map<Note, number>()
    let bendStartNote: Note | null = null
    const currentNotes = new Set<Note>()

    if (note.bendFor() && note.bendFor()!.bendType() === GuitarBendType.SLIGHT_BEND) {
        return new Map()
    }

    while (note.tieFor()) {
        const tieFor = note.tieFor()!
        if (!tieFor.endNote()) {
            return new Map()
        }

        note = tieFor.endNote()!
    }

    while (note.bendFor()) {
        const bendFor = note.bendFor()!
        const endNote = bendFor.endNote()
        if (!endNote || note === endNote) {
            return new Map()
        }

        if (endNote.chord().isGraceAfter()) {
            if (!currentNotes.size) {
                if (note.chord() !== endNote.chord().explicitParent() as unknown) {
                    return new Map()
                }

                bendStartNote = note
                currentNotes.add(bendStartNote)
            }

            if (endNote.bendFor()) {
                currentNotes.add(endNote)
            }
        } else {
            fillBendDurations(bendStartNote, currentNotes, durations)
            bendStartNote = null
            currentNotes.clear()
        }

        note = bendFor.endNote()!
    }

    fillBendDurations(bendStartNote, currentNotes, durations)

    return durations
}

/*
 * All consecutive tie and bend combinations are processed in a single pass, adding pitch bends where needed to ensure continuity between notes.
 *
 * When processing the first bend in a series, the duration of any preceding ties is also included,
 * allowing for an accurate total duration calculation.
 *
 * Additional calls (for notes that have already been processed) are filtered out by the function shouldProceedBend(Note*),
 * preventing redundant processing.
*/
function collectGuitarBend(note: Note, channel: number, onTime: number, graceOffset: number, previousChordTicks: number,
                           pitchWheelRenderer: PitchWheelRenderer, effect: MidiInstrumentEffect): void {
    if (!shouldProceedBend(note)) {
        return
    }

    const graceNoteBendDurations = getGraceNoteBendDurations(note)

    let curPitchBendSegmentStart = onTime

    let quarterOffsetFromStartNote = 0
    let currentQuarterTones = 0

    if (note.bendFor()!.bendType() === GuitarBendType.GRACE_NOTE_BEND) {
        curPitchBendSegmentStart -= graceOffset
    }

    const scale = f32(g_wheelSpec.mLimit / g_wheelSpec.mAmplitude)

    while (note.bendFor() || note.tieFor()) {
        const bendFor = note.bendFor()
        let duration = note.chord().actualTicks().ticks()
        if (bendFor) {
            const endNote = bendFor.endNote()
            if (!endNote) {
                return
            }

            let graceBeforeBend = false
            if (note.chord().isGraceBefore() && bendFor) {
                if (endNote.noteType() === NoteType.NORMAL) {
                    duration = (previousChordTicks === -1) ? GRACE_BEND_DURATION : Math.min(Math.trunc(previousChordTicks / 2), GRACE_BEND_DURATION)
                    graceBeforeBend = true
                }
            } else if (graceNoteBendDurations.has(note)) {
                duration = graceNoteBendDurations.get(note)!
            }

            const bendPlaybackInfo = getBendPlaybackInfo(bendFor, curPitchBendSegmentStart, duration, graceBeforeBend)
            const initialPitchBendValue = quarterOffsetFromStartNote / 2.0

            if (bendPlaybackInfo.startTick > curPitchBendSegmentStart && initialPitchBendValue !== 0) {
                addConstPitchWheel(curPitchBendSegmentStart, bendPlaybackInfo.startTick, initialPitchBendValue, pitchWheelRenderer, channel,
                    note.staffIdx(), effect)
            }

            bendFor.computeBendAmount()
            currentQuarterTones = bendFor.bendAmountInQuarterTones()

            const tickDelta = duration * (bendPlaybackInfo.endTimeFactor - bendPlaybackInfo.startTimeFactor)
            const a = currentQuarterTones / 2.0 / (tickDelta * tickDelta)
            const b = initialPitchBendValue
            const startTick = bendPlaybackInfo.startTick
            const bendFunc = (tick: number): number => {
                const x = f32(tick - startTick)
                const y = f32(a * x * x + b)
                return f32(y * scale)
            }

            const pitchWheelSquareFunc: PitchWheelFunction = {
                func: bendFunc, mStartTick: bendPlaybackInfo.startTick, mEndTick: bendPlaybackInfo.endTick,
            }

            pitchWheelRenderer.addPitchWheelFunction(pitchWheelSquareFunc, channel, note.staffIdx(), effect)
            quarterOffsetFromStartNote += currentQuarterTones

            const curPitchBendSegmentEnd = curPitchBendSegmentStart + duration
            if (bendPlaybackInfo.endTick < curPitchBendSegmentEnd) {
                const constPitchWheelduration
                    = (quarterOffsetFromStartNote === 0 ? g_wheelSpec.mStep : curPitchBendSegmentEnd - bendPlaybackInfo.endTick)
                addConstPitchWheel(bendPlaybackInfo.endTick, bendPlaybackInfo.endTick + constPitchWheelduration,
                    quarterOffsetFromStartNote / 2.0, pitchWheelRenderer, channel,
                    note.staffIdx(),
                    effect)
            }

            if (note === endNote) {
                break
            }

            note = endNote
        } else {
            if (!note.isGrace() && note.bendBack()) {
                let constPitchWheelduration = 0
                const noteTick = note.tick().ticks()
                if (quarterOffsetFromStartNote === 0) {
                    // reset pitchwheel once, no need to keep in for each tick
                    constPitchWheelduration = g_wheelSpec.mStep
                } else {
                    const lastTied = note.lastTiedNote(false)
                    const lastChord = lastTied.chord()
                    // keep the last pitchwheel value for the total duration of tied notes
                    constPitchWheelduration = lastChord.tick().ticks() - noteTick
                                              + (lastTied.bendFor() ? 0 : lastChord.actualTicks().ticks())
                }

                addConstPitchWheel(noteTick, noteTick + constPitchWheelduration, quarterOffsetFromStartNote / 2.0, pitchWheelRenderer,
                    channel,
                    note.staffIdx(), effect)
            }

            const tie = note.tieFor()!
            const next = tie.endNote()
            if (!next) {
                break
            }
            note = next
        }

        curPitchBendSegmentStart += duration
    }

    // adding pitch wheel to last note of bend/tie chain, if it's end of bend
    if (!note.isGrace() && note.bendBack()) {
        const constPitchWheelduration = (quarterOffsetFromStartNote === 0) ? g_wheelSpec.mStep : note.chord().actualTicks().ticks()
        addConstPitchWheel(note.tick().ticks(),
            note.tick().ticks() + constPitchWheelduration, quarterOffsetFromStartNote / 2.0, pitchWheelRenderer, channel,
            note.staffIdx(), effect)
    }
}

function collectBend(playData: readonly PitchValue[], staffIdx: number, channel: number, onTime: number, offTime: number,
                     pitchWheelRenderer: PitchWheelRenderer, effect: MidiInstrumentEffect): void {
    const pitchSize = playData.length

    const scale = f32(f32(f32(2 * g_wheelSpec.mLimit) / g_wheelSpec.mAmplitude) / PitchValue.PITCH_FOR_SEMITONE)
    const duration = (offTime - onTime) >>> 0

    for (let i = 0; i < pitchSize - 1; i++) {
        const curValue = playData[i]
        const nextValue = playData[i + 1]

        //! y = a x^2 + b - curve
        const curTick = f32(f32(curValue.time * duration) / PitchValue.MAX_TIME)
        const nextTick = f32(f32(nextValue.time * duration) / PitchValue.MAX_TIME)

        const a = f32((nextValue.pitch - curValue.pitch) / f32(f32(curTick - nextTick) * f32(curTick - nextTick)))
        const b = curValue.pitch

        const x0 = Math.trunc((curValue.time * duration) / PitchValue.MAX_TIME)

        const mStartTick = onTime + x0
        const startTimeNextPoint = Math.trunc((nextValue.time * duration) / PitchValue.MAX_TIME)
        const mEndTick = onTime + startTimeNextPoint

        const startTick = mStartTick
        const bendFunc = (tick: number): number => {
            const x = f32(tick - startTick)
            const y = f32(f32(f32(a * x) * x) + b)
            return f32(y * scale)
        }
        pitchWheelRenderer.addPitchWheelFunction({ mStartTick, mEndTick, func: bendFunc }, channel, staffIdx, effect)
    }

    const mStartTick = onTime + Math.trunc((playData[pitchSize - 1].time * duration) / PitchValue.MAX_TIME)
    const mEndTick = offTime

    if (mEndTick === mStartTick) {
        return
    }

    //! y = releaseValue linear curve
    const releaseValue = Math.trunc(f32(playData[pitchSize - 1].pitch * scale))
    const releaseFunc = (): number => releaseValue
    pitchWheelRenderer.addPitchWheelFunction({ mStartTick, mEndTick, func: releaseFunc }, channel, staffIdx, effect)
}

function letRingShouldApply(event: NoteEvent, note: Note): boolean {
    if (note.hasSlideFromNote()) {
        return false
    }

    if (isGlissandoBack(note)) {
        return true
    }

    if (event.slide() || isGlissandoFor(note)) {
        return false
    }

    return true
}

function renderSnd(events: EventsHolder, chord: Chord, noteChannel: number, tickOffset: number, context: Context): void {
    const stick = chord.tick()
    const etick = stick.plus(chord.ticks())
    const veloEvents = context.velocities(chord.track())
    const multEvents = context.velocityMultiplications(chord.track())
    const changes = veloEvents.changesInRange(stick, etick)
    const multChanges = multEvents.changesInRange(stick, etick)

    const velocityMap = new Map<number, number>() // std::map<int, int>

    for (const change of changes) {
        let lastVal = -1
        const endPoint = change[1].ticks()
        for (let t = change[0].ticks(); t <= endPoint; t++) {
            const velo = veloEvents.val(Fraction.fromTicks(t))
            if (velo === lastVal) {
                continue
            }
            lastVal = velo

            velocityMap.set(t, velo)
        }
    }

    const CONVERSION_FACTOR = CompatMidiRendererInternal.ARTICULATION_CONV_FACTOR
    for (const change of multChanges) {
        // Ignore fix events: they are available as cached ramp starts
        // and considering them ends up with multiplying twice effectively
        if (change[0].eq(change[1])) {
            continue
        }

        let lastVal = CompatMidiRendererInternal.ARTICULATION_CONV_FACTOR
        const endPoint = change[1].ticks()
        let lastVelocity = 0
        const sortedKeys = [...velocityMap.keys()].sort((a, b) => a - b)
        const upper = sortedKeys.find(k => k > change[0].ticks())
        if (upper !== undefined) {
            lastVelocity = velocityMap.get(upper)!
        } else if (sortedKeys.length) {
            lastVelocity = velocityMap.get(sortedKeys[0])!
        }

        for (let t = change[0].ticks(); t <= endPoint; t++) {
            const mult = multEvents.val(Fraction.fromTicks(t))
            if (mult === lastVal || mult === CONVERSION_FACTOR) {
                continue
            }
            lastVal = mult

            const realMult = mult / CONVERSION_FACTOR
            if (velocityMap.has(t)) {
                lastVelocity = velocityMap.get(t)!
                velocityMap.set(t, Math.trunc(velocityMap.get(t)! * realMult))
            } else {
                velocityMap.set(t, Math.trunc(lastVelocity * realMult))
            }
        }
    }

    for (const t of [...velocityMap.keys()].sort((a, b) => a - b)) {
        // NOTE:JT if we ever want to use poly aftertouch instead of CC, this is where we want to
        // be using it. Instead of ME_CONTROLLER, use ME_POLYAFTER (but duplicate for each note in chord)
        const event = new NPlayEvent(ME_CONTROLLER, noteChannel, context.sndController, Math.min(Math.max(velocityMap.get(t)!, 0), 127))
        event.setOriginatingStaff(chord.staffIdx())
        events.at(noteChannel).insert(t + tickOffset, event)
    }
}

function graceBendDuration(chord: Chord | null): number {
    let graceDuration = GRACE_BEND_DURATION
    if (chord) {
        graceDuration = Math.min(Math.trunc(chord.ticks().ticks() / 2), graceDuration)
    }

    return graceDuration
}

function calculateTieLength(note: Note): number {
    let tieLen = 0

    let n: Note | null = note
    while (n) {
        // Process ties or bends
        const tieFor: Tie | null = n.tieForNonPartial()
        const bendFor: GuitarBend | null = n.bendFor()

        if (tieFor && tieFor.endNote() !== n) {
            n = tieFor.endNote()
        } else if (bendFor && bendFor.endNote() !== n) {
            n = bendFor.endNote()
        } else {
            break
        }

        if (!n) {
            break
        }

        const nel = n.playEvents()

        if (nel.length && (!n.chord().isGrace())) {
            tieLen += Math.trunc(nel[0].len() * n.chord().actualTicks().ticks() / NoteEvent.NOTE_LENGTH)
        }
    }

    return tieLen
}

function collectNote(events: EventsHolder, note: Note, noteParams: CollectNoteParams, staff: Staff,
                     pitchWheelRenderer: PitchWheelRenderer, context: Context): void {
    if (!note.play() || note.hidden()) { // do not play overlapping notes
        return
    }

    let chord = note.chord()
    const instr = chord.part()!.instrument(chord.tick())
    let noteEffect = noteParams.effect

    let noteChannel = getChannel(instr, note, noteEffect, context)
    const midiEffectFromEvent = (event: NoteEvent): MidiInstrumentEffect => {
        if (event.slide()) {
            return MidiInstrumentEffect.SLIDE
        }

        return MidiInstrumentEffect.NONE
    }

    const tieLen = calculateTieLength(note)
    if (chord.isGrace()) {
        chord = chord.explicitParent() as unknown as Chord
    }

    const ticks = chord.actualTicks().ticks() // ticks of the actual note
    // calculate additional length due to ties forward
    // taking NoteEvent length adjustments into account

    const tick1 = note.tick().ticks() + noteParams.tickOffset
    const bendFor = note.bendFor()
    const bendBack = note.bendBack()

    const nel = note.playEvents()
    const nels = nel.length
    for (let i = 0; i < nels; ++i) {
        const e = nel[i]

        // skip if note has a tie into it and only one NoteEvent
        // its length was already added to previous note
        // if we wish to suppress first note of ornament
        // then change "nels == 1" to "i == 0", and change "break" to "continue"
        if (note.tieBack() && nels === 1 && !isGlissandoFor(note)) {
            const tiedBack = note.tieBack()!.startNote()
            if (!tiedBack) {
                break
            }

            const eventsList = tiedBack.playEvents()
            if (!eventsList.length) {
                break
            }

            if (noteEffect === MidiInstrumentEffect.NONE) {
                noteEffect = midiEffectFromEvent(eventsList[0])
                noteChannel = getChannel(instr, note, noteEffect, context)
            }

            break
        }

        // skipping the notes which are connected by bends
        if (bendBack && bendBack.bendType() !== GuitarBendType.PRE_BEND && i === 0) {
            continue
        }

        const p = Math.min(Math.max(note.ppitch() + e.pitch() + note.harmonicPitchOffset(), 0), 127)
        const on = tick1 + Math.trunc((ticks * e.ontime()) / 1000)
        let off = on + Math.trunc((ticks * e.len()) / 1000) - 1

        if (note.deadNote()) {
            const ticksPerSecond = chord.score().multipliedTempo(chord.tick()) * Constants.DIVISION
            const deadNoteDurationInSec = 0.05
            const deadNoteDurationInTicks = ticksPerSecond * deadNoteDurationInSec
            if (off - on > deadNoteDurationInTicks) {
                off = Math.trunc(on + deadNoteDurationInTicks)
            }
        } else {
            if ((note.tieFor() || bendFor) && i === nels - 1) {
                off += tieLen
            }

            if (noteParams.letRingNote && letRingShouldApply(e, note)) {
                off = Math.max(off, noteParams.endLetRingTick)
                if (off - on > LET_RING_MAX_TICKS) {
                    off = on + LET_RING_MAX_TICKS
                }
            }
        }

        // Get the velocity used for this note from the staff
        // This allows correct playback of tremolos even without SND enabled.
        const nonUnwoundTick = Fraction.fromTicks(on - noteParams.tickOffset)
        const velo = Math.trunc(context.velocities(note.track()).val(nonUnwoundTick) * noteParams.velocityMultiplier * e.velocityMultiplier())
        if (e.play()) {
            const playParams = new PlayNoteParams()
            let eventEffect = noteEffect
            let eventChannel = noteChannel
            playParams.pitch = p
            playParams.velo = Math.min(Math.max(velo, 1), 127)
            playParams.onTime = Math.max(0, on - noteParams.graceOffsetOn)
            playParams.offTime = Math.max(0, off - noteParams.graceOffsetOff)

            if (eventEffect === MidiInstrumentEffect.NONE) {
                eventEffect = midiEffectFromEvent(e)
                eventChannel = getChannel(instr, note, eventEffect, context)
            }

            playParams.effect = eventEffect
            playParams.channel = eventChannel

            if (noteParams.graceOffsetOn === 0) {
                playParams.offset = Math.trunc(ticks * e.offset() / 1000)
            }

            playParams.staffIdx = staff.idx()
            playParams.callAllSoundOff = noteParams.callAllSoundOff
            playNote(events, note, playParams, pitchWheelRenderer)

            if (instr.singleNoteDynamics()) {
                renderSnd(events, chord, noteChannel, noteParams.tickOffset, context)
            }
        }
    }

    // Bends
    if (bendFor) {
        collectGuitarBend(note, noteChannel, tick1, noteParams.graceOffsetOn, noteParams.previousChordTicks, pitchWheelRenderer,
            noteEffect)
    } else {
        // old bends implementation
        for (const e of note.el()) {
            if (!e || (!e.isBend())) {
                continue
            }

            const bend = e as unknown as Bend
            if (!bend.playBend()) {
                break
            }

            collectBend(bend.points(), bend.staffIdx(), noteChannel, tick1, tick1 + getPlayTicksForBend(
                note).ticks(), pitchWheelRenderer, noteEffect)
        }
    }
}

function aeolusSetStop(tick: number, channel: number, i: number, k: number, val: boolean, events: EventsHolder): void {
    const event = new NPlayEvent()
    event.setType(ME_CONTROLLER)
    event.setController(98)
    if (val) {
        event.setValue(0x40 + 0x20 + i)
    } else {
        event.setValue(0x40 + 0x10 + i)
    }

    event.setChannel(channel)
    events.at(channel).emplace(tick, event)

    event.setValue(k)
    events.at(channel).emplace(tick, event)
}

function collectProgramChanges(events: EventsHolder, m: Measure, staff: Staff, tickOffset: number): void {
    const firstStaffIdx = staff.idx()
    const nextStaffIdx = firstStaffIdx + 1

    //
    // collect program changes and controller
    //
    for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
        for (const e of s.annotations()) {
            if (!e.isStaffTextBase() || e.staffIdx() < firstStaffIdx
                || e.staffIdx() >= nextStaffIdx) {
                continue
            }
            const st1 = e as unknown as StaffTextBase
            const tick = s.tick().plus(Fraction.fromTicks(tickOffset))

            const instr = e.part()!.instrument(tick)
            for (const ca of st1.channelActions()) {
                const channel = instr.channels()[ca.channel].channel()
                for (const ma of ca.midiActionNames) {
                    const nel = instr.midiAction(ma, ca.channel)
                    if (!nel) {
                        continue
                    }
                    for (const event of nel.events) {
                        const e1 = NPlayEvent.fromCoreEvent(event)
                        e1.setChannel(channel)
                        e1.setOriginatingStaff(firstStaffIdx)
                        if (e1.dataA() === CTRL_PROGRAM) {
                            events.at(channel).emplace(tick.ticks() - 1, e1)
                        } else {
                            events.at(channel).emplace(tick.ticks(), e1)
                        }
                    }
                }
            }
            if (st1.setAeolusStops()) {
                const s1 = st1.staff()!
                const voice = 0
                const channel = s1.channel(tick, voice)

                const num = [12, 13, 16, 16]
                for (let i = 0; i < 4; ++i) {
                    for (let k = 0; k < num[i]; ++k) {
                        aeolusSetStop(tick.ticks(), channel, i, k, st1.getAeolusStop(i, k), events)
                    }
                }
            }
        }
    }
}

/** renders chord symbols */
function renderHarmony(events: EventsHolder, m: Measure, h: Harmony, tickOffset: number, context: Context): void {
    if (!h.isRealizable() || context.harmonyChannelSetting === HarmonyChannelSetting.DISABLED) {
        return
    }

    if (context.partsWithMutedHarmony.has(h.part()!.id())) {
        return
    }

    const staff = m.score().staff(Math.trunc(h.track() / VOICES))!
    const instrChannel = staff.part().harmonyChannel()
    if (!instrChannel) {
        return
    }

    if (!staff.isPrimaryStaff()) {
        return
    }

    let channel = instrChannel.channel()
    const staffIdx = staff.idx()

    if (context.harmonyChannelSetting === HarmonyChannelSetting.LOOKUP) {
        const lookupData = newLookupData()
        lookupData.harmony = true
        channel = context.channels.getChannel(channel, lookupData)
    }

    const velocity = context.velocities(h.track()).val(h.tick())

    const r = h.getRealizedHarmony()

    const ev = new NPlayEvent(ME_NOTEON, channel, 0, velocity)
    ev.setHarmony(h)
    const duration = r.getActualDuration(h.tick().ticks() + tickOffset)

    const onTime = h.tick().ticks() + tickOffset
    const offTime = onTime + duration.ticks()

    ev.setOriginatingStaff(staffIdx)
    ev.setTuning(0.0)

    //add play events
    for (const [pitch] of r.notes()) {
        ev.setPitch(pitch)
        ev.setVelo(velocity)
        events.at(channel).emplace(onTime, ev)
        ev.setVelo(0)
        events.at(channel).emplace(offTime, ev)
    }
}

function shouldPlayHammerOn(chord: Chord): boolean {
    let currentTick = chord.tick().ticks()
    let firstTiedChord = chord.nextTiedChord(true, false)
    const score = chord.score()
    while (firstTiedChord) {
        currentTick = firstTiedChord.tick().ticks()
        firstTiedChord = firstTiedChord.nextTiedChord(true, false)
    }

    for (const spanner of score.spannerMap().findOverlapping(currentTick, currentTick + chord.ticks().ticks())) {
        if (spanner.track() !== chord.track()) {
            continue
        }

        if (spanner.isHammerOnPullOff() && (spanner.startChord() !== chord)) {
            return true
        }
    }

    return false
}

interface ChordParams {
    letRing: boolean
    palmMute: boolean
    hammerOnPullOff: boolean
    endLetRingTick: number
}

/** search the spanners in the score, finding the first one which overlaps this chord and is of type ElementType::TRILL */
function findFirstTrill(chord: Chord): Trill | null {
    const spanners = chord.score().spannerMap().findOverlapping(1 + chord.tick().ticks(), chord.endTick().ticks() - 1)
    for (const i of spanners) {
        if (!i.isTrill()) {
            continue
        }
        if (i.track() !== chord.track()) {
            continue
        }
        const trill = i as unknown as Trill
        if (!trill.playSpanner()) {
            continue
        }
        return trill
    }
    return null
}

function collectTicksForEffect(score: Score, track: number, stick: number, etick: number, effect: MidiInstrumentEffect): [number, number][] {
    const ticksForEffect: [number, number][] = []
    let curTick = stick

    for (const spanner of score.spannerMap().findOverlapping(stick, etick)) {
        if (spanner.track() !== track) {
            continue
        }

        if (spanner.isPalmMute()) {
            const palmMuteStartTick = spanner.tick().ticks()
            const palmMuteEndTick = spanner.tick2().ticks()

            if (curTick < palmMuteStartTick) {
                const nextTick = Math.min(palmMuteStartTick, etick)
                if (effect === MidiInstrumentEffect.NONE) {
                    ticksForEffect.push([curTick, nextTick - 1])
                }

                curTick = nextTick
            }

            if (palmMuteStartTick <= curTick) {
                const nextTick = Math.min(palmMuteEndTick, etick)
                if (effect === MidiInstrumentEffect.PALM_MUTE) {
                    ticksForEffect.push([curTick, nextTick - 1])
                }

                curTick = nextTick
            }
        }
    }

    if (curTick < etick && effect === MidiInstrumentEffect.NONE) {
        ticksForEffect.push([curTick, etick - 1])
    }

    return ticksForEffect
}

function getVibratoParams(type: VibratoType): VibratoParams {
    const params: VibratoParams = { lowPitch: 0, highPitch: 0, period: 0 }

    switch (type) {
    case VibratoType.GUITAR_VIBRATO:
        // guitar vibrato, up only
        params.lowPitch = 0
        params.highPitch = 10
        params.period = Constants.DIVISION / 3
        break

    case VibratoType.GUITAR_VIBRATO_WIDE:
        params.lowPitch = 0 // 100 is a semitone
        params.highPitch = 20
        params.period = Math.trunc(Constants.DIVISION / 2.5)
        break

    case VibratoType.VIBRATO_SAWTOOTH_WIDE:
        // vibrato with whammy bar up and down
        params.lowPitch = -25 // 1/16
        params.highPitch = 25
        params.period = Constants.DIVISION / 2
        break

    case VibratoType.VIBRATO_SAWTOOTH:
        params.lowPitch = -12
        params.highPitch = 12
        params.period = Constants.DIVISION / 2
        break

    default:
        break
    }

    return params
}

function chordVelocityMultiplier(chord: Chord, context: Context): number {
    let veloMultiplier = 1.0
    const instr = chord.part()!.instrument()
    for (const a of chord.articulations()) {
        if (a.playArticulation()) {
            veloMultiplier *= velocityMultiplierByInstrument(instr, a.articulationName(), context)
        }
    }

    return veloMultiplier
}

function velocityMultiplierByInstrument(instrument: Instrument, articulationName: string, context: Context): number {
    if (context.useDefaultArticulations) {
        const it = Context.s_builtInArticulationsValues.get(articulationName)
        if (it) {
            return it.velocityMultiplier
        }
    } else {
        const articulationsForInstrument = context.articulationsWithoutValuesByInstrument.get(instrument.id())
        if (articulationsForInstrument) {
            if (articulationsForInstrument.has(articulationName)) {
                return Context.builtInArticulation(articulationName).velocityMultiplier
            }
        }
    }

    return instrument.getVelocityMultiplier(articulationName)
}

function getChannel(instr: Instrument, note: Note, effect: MidiInstrumentEffect, context: Context): number {
    const subchannel = note.subchannel()
    const channel = (instr.channel(subchannel) ?? instr.channel(0)!).channel()

    if (!context.instrumentsHaveEffects && !context.eachStringHasChannel && !context.eachVoiceHasChannel) {
        return channel
    }

    const lookupData = newLookupData()

    if (context.eachVoiceHasChannel) {
        lookupData.voice = note.voice()
    }

    if (context.instrumentsHaveEffects) {
        lookupData.effect = effect
    }

    if (context.eachStringHasChannel && instr.hasStrings()) {
        if (note.string() >= 0) {
            lookupData.string = note.string()
        } else {
            const stringData = instr.stringData()
            const res = stringData.convertPitch(note.pitch(), StringData.pitchOffsetAtStaff(note.staff()!))
            if (!res.ok) {
                return channel
            }

            lookupData.string = res.string
        }

        lookupData.staffIdx = note.staffIdx()
    }

    return context.channels.getChannel(channel, lookupData)
}

function fillHairpinVelocities(h: Hairpin, context: Context): void {
    const st = h.staff()!
    const tick = h.tick()
    const tick2 = h.tick2()
    let veloChange = h.veloChange()
    const method = h.veloChangeMethod()

    // Make the change negative when the hairpin is a diminuendo
    const htype = h.hairpinType()
    let direction = ChangeDirection.INCREASING
    if (htype === HairpinType.DIM_HAIRPIN || htype === HairpinType.DIM_LINE) {
        veloChange *= -1
        direction = ChangeDirection.DECREASING
    }

    switch (h.voiceAssignment()) {
    case VoiceAssignment.ALL_VOICE_IN_STAFF:
        if (st.isPrimaryStaff()) {
            for (let track = st.idx() * VOICES; track < (st.idx() + 1) * VOICES; ++track) {
                context.velocities(track).addHairpin(tick, tick2, veloChange, method, direction)
            }
        }
        break
    case VoiceAssignment.ALL_VOICE_IN_INSTRUMENT:
        for (const s of st.part().staves()) {
            if (!s.isPrimaryStaff()) {
                continue
            }
            for (let track = s.idx() * VOICES; track < (s.idx() + 1) * VOICES; ++track) {
                context.velocities(track).addHairpin(tick, tick2, veloChange, method, direction)
            }
        }
        break
    case VoiceAssignment.CURRENT_VOICE_ONLY:
        if (st.isPrimaryStaff()) {
            context.velocities(h.track()).addHairpin(tick, tick2, veloChange, method, direction)
        }
        break
    }
}

function fillScoreVelocities(score: Score, context: Context): void {
    const mainScore = score.masterScore()

    if (!mainScore.firstMeasure()) {
        return
    }

    for (let s = mainScore.firstMeasure()!.first(); s; s = s.next1()) {
        const tick = s.tick()
        for (const e of s.annotations()) {
            if (!e.isDynamic() || !e.staff()!.isPrimaryStaff()) {
                continue
            }

            const d = e as unknown as Dynamic
            let v = d.velocity()

            // treat an invalid dynamic as no change, i.e. a dynamic set to 0
            if (v < 1) {
                continue
            }

            // make sure value is legal
            v = Math.min(Math.max(v, 1), 127)

            // If a dynamic has 'velocity change' update its ending
            const change = d.changeInVelocity()
            let direction = ChangeDirection.INCREASING
            if (change < 0) {
                direction = ChangeDirection.DECREASING
            }

            switch (d.voiceAssignment()) {
            case VoiceAssignment.ALL_VOICE_IN_STAFF: {
                for (let track = d.staffIdx() * VOICES; track < (d.staffIdx() + 1) * VOICES; ++track) {
                    context.velocities(track).addDynamic(tick, v)
                }
                if (change !== 0) {
                    const etick = tick.plus(d.velocityChangeLength())
                    const method = ChangeMethod.NORMAL
                    for (let track = d.staffIdx() * VOICES; track < (d.staffIdx() + 1) * VOICES; ++track) {
                        context.velocities(track).addHairpin(tick, etick, change, method, direction)
                    }
                }
            }
                break
            case VoiceAssignment.ALL_VOICE_IN_INSTRUMENT: {
                const part = d.staff()!.part()
                const pStartStaff = part.staves()[0].idx()
                const pEndStaff = part.staves()[part.staves().length - 1].idx()
                if (d.staffIdx() < pStartStaff || d.staffIdx() > pEndStaff) {
                    break
                }
                for (let staffIdx = pStartStaff; staffIdx <= pEndStaff; ++staffIdx) {
                    const stp = mainScore.staff(staffIdx)!
                    if (!stp.isPrimaryStaff()) {
                        continue
                    }
                    for (let track = stp.idx() * VOICES; track < (stp.idx() + 1) * VOICES; ++track) {
                        context.velocities(track).addDynamic(tick, v)
                    }
                    if (change !== 0) {
                        const etick = tick.plus(d.velocityChangeLength())
                        const method = ChangeMethod.NORMAL
                        for (let track = stp.idx() * VOICES; track < (stp.idx() + 1) * VOICES; ++track) {
                            context.velocities(track).addHairpin(tick, etick, change, method, direction)
                        }
                    }
                }
            }
                break
            case VoiceAssignment.CURRENT_VOICE_ONLY: {
                context.velocities(d.track()).addDynamic(tick, v)
                if (change !== 0) {
                    const etick = tick.plus(d.velocityChangeLength())
                    const method = ChangeMethod.NORMAL
                    context.velocities(d.track()).addHairpin(tick, etick, change, method, direction)
                }
            }
                break
            }
        }

        if (s.isChordRestType()) {
            for (let track = 0; track < mainScore.ntracks(); ++track) {
                const el = s.element(track)
                if (!el || !el.isChord() || !el.staff()!.isPrimaryStaff()) {
                    continue
                }

                const chord = el as unknown as Chord

                const veloMultiplier = chordVelocityMultiplier(chord, context)

                if (RealIsEqual(veloMultiplier, 1.0)) {
                    continue
                }

                const ARTICULATION_CHANGE_TIME = s.ticks().lt(ARTICULATION_CHANGE_TIME_MAX) ? s.ticks() : ARTICULATION_CHANGE_TIME_MAX
                const start = Math.trunc(veloMultiplier * CompatMidiRendererInternal.ARTICULATION_CONV_FACTOR)
                const change = Math.trunc((veloMultiplier - 1) * CompatMidiRendererInternal.ARTICULATION_CONV_FACTOR)
                context.velocityMultiplications(track).addDynamic(chord.tick(), start)
                context.velocityMultiplications(track).addHairpin(chord.tick(),
                    chord.tick().plus(ARTICULATION_CHANGE_TIME), change, ChangeMethod.NORMAL,
                    ChangeDirection.DECREASING)
            }
        }
    }

    for (const s of mainScore.spannerMap().all()) {
        if (!s.isHairpin() || !s.staff()!.isPrimaryStaff()) {
            continue
        }

        fillHairpinVelocities(s as unknown as Hairpin, context)
    }

    for (const st of mainScore.staves()) {
        if (!st.isPrimaryStaff()) {
            continue
        }
        for (let track = st.idx() * VOICES; track < (st.idx() + 1) * VOICES; ++track) {
            context.velocities(track).setup()
            context.velocityMultiplications(track).setup()
        }
    }

    for (const spanner of mainScore.spanner()) {
        if (!spanner.isVolta()) {
            continue
        }

        const volta = spanner as unknown as Volta
        const st = volta.staff()!
        if (!st.isPrimaryStaff()) {
            continue
        }
        for (let track = st.idx() * VOICES; track < (st.idx() + 1) * VOICES; ++track) {
            fillVoltaVelocities(volta, context.velocities(track))
        }
    }
}

function fillVoltaVelocities(volta: Volta, veloMap: VelocityMap): void {
    const startMeasure = volta.startMeasure()
    const endMeasure = volta.endMeasure()

    if (startMeasure && endMeasure) {
        if (!endMeasure.repeatEnd()) {
            return
        }

        const startTick = startMeasure.tick().minus(Fraction.eps())
        const endTick = endMeasure.endTick().minus(Fraction.eps())
        const prevVelo = veloMap.val(startTick)
        veloMap.addDynamic(endTick, prevVelo)
    }
}

/** MIDI renderer for a score */
export class CompatMidiRendererInternal {
    static readonly ARTICULATION_CONV_FACTOR = 100000

    private score: Score
    private m_context = new Context()

    constructor(s: Score) {
        this.score = s
    }

    /**
     * In the case that graceNotesBefore or graceNotesAfter are attached to a note
     * with an articulation such as a trill, then the grace notes are/will-be/have-been
     * already merged into the articulation.
     * So this predicate, graceNotesMerged, checks for this condition to avoid calling
     * functions which would re-emit the grace notes by a different algorithm.
     */
    static graceNotesMerged(chord: Chord): boolean {
        if (findFirstTrill(chord)) {
            return true
        }
        for (const a of chord.articulations()) {
            for (const oe of excursions) {
                if (oe.atype === a.symId()) {
                    return true
                }
            }
        }
        return false
    }

    renderScore(events: EventsHolder, context: Context, expandRepeats: boolean): void {
        void expandRepeats

        this.m_context = context.clone()
        const pitchWheelRender = new PitchWheelRenderer(g_wheelSpec)

        this.score.updateSwing()
        this.score.updateCapo()

        if (!this.m_context.useDefaultArticulations) {
            this.fillArticulationsInfo()
        }

        CompatMidiRender.createPlayEvents(this.score, this.score.firstMeasure(), null, this.m_context)

        this.score.updateChannel()
        fillScoreVelocities(this.score, this.m_context)

        // create note & other events
        for (const st of this.score.staves()) {
            this.renderStaff(events, st, pitchWheelRender)
        }
        events.fixupMIDI()

        // create sustain pedal events
        this.renderSpanners(events, pitchWheelRender)

        const pitchWheelEvents = pitchWheelRender.renderPitchWheel()
        events.mergePitchWheelEvents(pitchWheelEvents)
        if (this.m_context.applyCaesuras) {
            this.m_context.pauseMap.calculate(this.score)
        }
    }

    private renderStaff(events: EventsHolder, staff: Staff, pitchWheelRenderer: PitchWheelRenderer): void {
        let lastMeasure: Measure | null = null

        const repeatList = this.score.repeatList()
        const prevChords: (Chord | null)[] = new Array(VOICES).fill(null)

        for (const rs of repeatList) {
            const tickOffset = rs.utick - rs.tick

            const start = rs.firstMeasure()

            for (let m = start; m; m = m.nextMeasure()) {
                const staffIdx = staff.idx()
                if (m.isMeasureRepeatGroup(staffIdx)) {
                    const mr = m.measureRepeatElement(staffIdx) as MeasureRepeat | null
                    let playMeasure = lastMeasure
                    if (!playMeasure || !mr) {
                        continue
                    }

                    for (let i = m.measureRepeatCount(staffIdx); i < mr.numMeasures() && playMeasure!.prevMeasure(); ++i) {
                        playMeasure = playMeasure!.prevMeasure()
                    }

                    const offset = m.tick().minus(playMeasure!.tick()).ticks()
                    this.collectMeasureEvents(events, playMeasure!, staff, tickOffset + offset, pitchWheelRenderer, prevChords)
                } else {
                    lastMeasure = m
                    this.collectMeasureEvents(events, lastMeasure, staff, tickOffset, pitchWheelRenderer, prevChords)
                }

                if (m === rs.lastMeasure()) {
                    break
                }
            }
        }
    }

    private renderSpanners(events: EventsHolder, pitchWheelRenderer: PitchWheelRenderer): void {
        for (const s of this.score.spannerMap().all()) {
            if (!s.staff()!.isPrimaryStaff()) {
                continue
            }

            const idx = s.staff()!.channel(s.tick(), 0)
            const instr = s.part()!.instrument(s.tick())
            const channel = (instr.channel(idx) ?? instr.channel(0)!).channel()
            const channels = this.m_context.channels.channelsFor(channel)
            if (!channels.length) {
                this.doRenderSpanners(events, s, channel, pitchWheelRenderer, MidiInstrumentEffect.NONE)
            } else {
                for (const channel2 of channels) {
                    this.doRenderSpanners(events, s, channel2[1], pitchWheelRenderer, channel2[0].effect)
                }
            }
        }
    }

    private doRenderSpanners(events: EventsHolder, s: Spanner, channel: number, pitchWheelRenderer: PitchWheelRenderer,
                             effect: MidiInstrumentEffect): void {
        interface PedalEvent {
            tick: number
            on: boolean
            staffIdx: number
        }

        const pedalEventList: PedalEvent[] = []

        const staffIdx = s.staffIdx()

        if (s.isPedal()) {
            let lastEvent: PedalEvent

            if (pedalEventList.length) {
                lastEvent = pedalEventList[pedalEventList.length - 1]
            } else {
                lastEvent = { tick: 0, on: true, staffIdx }
            }

            const st = s.tick().ticks()

            if (!lastEvent.on && lastEvent.tick >= (st + 2)) {
                pedalEventList.splice(pedalEventList.length - 1, 0,
                    { tick: st + (2 - MScore.pedalEventsMinTicks), on: false, staffIdx })
            }
            const a = st + 2
            pedalEventList.push({ tick: a, on: true, staffIdx })

            let t = s.tick2().ticks() + (2 - MScore.pedalEventsMinTicks)
            const repeatList = this.score.repeatList()
            if (repeatList.length) {
                const lastRepeat = repeatList[repeatList.length - 1]
                if (t > lastRepeat.utick + lastRepeat.len()) {
                    t = lastRepeat.utick + lastRepeat.len()
                }
            }
            pedalEventList.push({ tick: t, on: false, staffIdx })
        } else if (s.isVibrato()) {
            const stick = s.tick().ticks()
            const etick = s.tick2().ticks()

            // from start to end of trill, send bend events at regular interval
            const t = s as unknown as Vibrato
            const vibratoParams = getVibratoParams(t.vibratoType())

            const vibratoTicksForEffect = collectTicksForEffect(this.score, s.track(), stick, etick, effect)

            for (const [tickStart, tickEnd] of vibratoTicksForEffect) {
                collectVibrato(channel, tickStart, tickEnd, vibratoParams, pitchWheelRenderer, effect, s.staffIdx())
            }
        }

        for (const pe of pedalEventList) {
            let event: NPlayEvent
            if (pe.on) {
                event = new NPlayEvent(ME_CONTROLLER, channel, CTRL_SUSTAIN, 127)
            } else {
                event = new NPlayEvent(ME_CONTROLLER, channel, CTRL_SUSTAIN, 0)
            }
            event.setOriginatingStaff(pe.staffIdx)
            event.setEffect(effect)
            events.at(channel).emplace(pe.tick, event)
        }
    }

    private collectMeasureEvents(events: EventsHolder, m: Measure, staff: Staff, tickOffset: number,
                                 pitchWheelRenderer: PitchWheelRenderer, prevChords: (Chord | null)[]): void {
        this.doCollectMeasureEvents(events, m, staff, tickOffset, pitchWheelRenderer, prevChords)

        if (this.m_context.renderMidiActions) {
            collectProgramChanges(events, m, staff, tickOffset)
        }
    }

    private doCollectMeasureEvents(events: EventsHolder, m: Measure, staff: Staff, tickOffset: number,
                                   pitchWheelRenderer: PitchWheelRenderer, prevChords: (Chord | null)[]): void {
        let firstStaffIdx = staff.idx()
        for (const st of staff.masterScore().staves()) {
            if (staff.id() === st.id()) {
                firstStaffIdx = st.idx()
            }
        }
        const nextStaffIdx = firstStaffIdx + 1

        const st = SegmentType.ChordRest
        const strack = firstStaffIdx * VOICES
        const etrack = nextStaffIdx * VOICES
        for (let seg = m.first(st); seg; seg = seg.next(st)) {
            const tick = seg.tick()

            //render harmony
            for (const e of seg.annotations()) {
                if (!e || (e.track() < strack) || (e.track() >= etrack)) {
                    continue
                }
                let h: Harmony | null = null
                if (e.isHarmony()) {
                    h = e as unknown as Harmony
                } else if (e.isFretDiagram()) {
                    h = (e as unknown as FretDiagram).harmony()
                }
                if (!h || !h.play()) {
                    continue
                }
                renderHarmony(events, m, h, tickOffset, this.m_context)
            }

            for (let track = strack; track < etrack; ++track) {
                // Skip linked staves, except primary
                const st1 = m.score().staff(Math.trunc(track / VOICES))!
                if (!st1.isPrimaryStaff()) {
                    track += VOICES - 1
                    continue
                }

                const voice = track % VOICES
                const cr = seg.element(track)
                if (!cr || !cr.isChord()) {
                    prevChords[voice] = null
                    continue
                }

                const chord = cr as unknown as Chord
                const veloMultiplier = NoteEvent.DEFAULT_VELOCITY_MULTIPLIER * chordVelocityMultiplier(chord, this.m_context)

                //
                // Add normal note events
                //
                const chordParams = this.collectChordParams(chord, tickOffset)

                let effect = MidiInstrumentEffect.NONE
                if (chordParams.palmMute) {
                    effect = MidiInstrumentEffect.PALM_MUTE
                } else if (chordParams.hammerOnPullOff) {
                    effect = MidiInstrumentEffect.HAMMER_PULL
                }

                this.collectGraceBeforeChordEvents(chord, prevChords[voice], events, veloMultiplier, st1, tickOffset, pitchWheelRenderer,
                    effect)

                const instr = st1.part().instrument(tick)
                for (const note of chord.notes()) {
                    const params = new CollectNoteParams()
                    params.velocityMultiplier = veloMultiplier
                    params.tickOffset = tickOffset
                    params.letRingNote = chordParams.letRing
                    params.endLetRingTick = chordParams.endLetRingTick
                    if (this.m_context.instrumentsHaveEffects) {
                        params.effect = effect
                    }

                    if (this.m_context.eachStringHasChannel && instr.hasStrings()) {
                        params.callAllSoundOff = true
                    }

                    collectNote(events, note, params, st1, pitchWheelRenderer, this.m_context)
                }

                if (!CompatMidiRendererInternal.graceNotesMerged(chord)) {
                    for (const c of [...chord.graceNotesAfter().chords()]) {
                        for (const note of c.notes()) {
                            const params = new CollectNoteParams()
                            params.velocityMultiplier = veloMultiplier
                            params.tickOffset = tickOffset
                            params.effect = effect
                            collectNote(events, note, params, st1, pitchWheelRenderer, this.m_context)
                        }
                    }
                }

                prevChords[voice] = chord
            }
        }
    }

    private collectChordParams(chord: Chord, tickOffset: number): ChordParams {
        const chordParams: ChordParams = { letRing: false, palmMute: false, hammerOnPullOff: false, endLetRingTick: 0 }

        const currentTick = chord.tick().ticks()
        for (const spanner of this.score.spannerMap().findOverlapping(currentTick + 1, currentTick + 2)) {
            if (spanner.track() !== chord.track()) {
                continue
            }

            if (spanner.isLetRing()) {
                const letRing = spanner as unknown as LetRing
                chordParams.letRing = true
                const endCR = letRing.endCR()
                chordParams.endLetRingTick = (endCR ? endCR.endTick().ticks() : letRing.tick2().ticks()) + tickOffset
            } else if (spanner.isPalmMute()) {
                chordParams.palmMute = true
            }
        }

        chordParams.hammerOnPullOff = shouldPlayHammerOn(chord)
        return chordParams
    }

    private collectGraceBeforeChordEvents(chord: Chord, prevChord: Chord | null, events: EventsHolder, veloMultiplier: number, st: Staff,
                                          tickOffset: number, pitchWheelRenderer: PitchWheelRenderer, effect: MidiInstrumentEffect): void {
        // calculate offset for grace notes here
        const grChords = [...chord.graceNotesBefore().chords()]
        const graceNotesBeforeBar = grChords.filter(ch => ch.noteType() === NoteType.ACCIACCATURA)

        let graceTickSum = 0
        let graceTickOffset = 0

        const acciacaturaGraceSize = graceNotesBeforeBar.length
        if (acciacaturaGraceSize > 0) {
            graceTickSum = graceNotesBeforeBar[0].ticks().ticks()
            if (prevChord) {
                graceTickSum = Math.min(Math.trunc(prevChord.ticks().ticks() / 2), graceTickSum)
            }

            graceTickOffset = Math.trunc(graceTickSum / acciacaturaGraceSize)
        } else {
            const hasGraceBend = grChords.some(ch => ch.notes().some(n => n.isGraceBendStart()))

            if (hasGraceBend) {
                graceTickSum = graceBendDuration(prevChord)
            }
        }

        if (!CompatMidiRendererInternal.graceNotesMerged(chord)) {
            let currentBeaforeBeatNote = 0
            for (const c of grChords) {
                for (const note of c.notes()) {
                    const bendFor = note.bendFor()
                    if (bendFor && bendFor.bendType() === GuitarBendType.PRE_BEND) {
                        continue
                    }

                    const params = new CollectNoteParams()
                    params.effect = effect
                    params.velocityMultiplier = veloMultiplier
                    params.tickOffset = tickOffset

                    const isGraceBend = (note.bendFor() && note.bendFor()!.bendType() === GuitarBendType.GRACE_NOTE_BEND)
                    if (prevChord) {
                        params.previousChordTicks = prevChord.actualTicks().ticks()
                    }

                    if (note.noteType() === NoteType.ACCIACCATURA) {
                        params.graceOffsetOn = graceTickSum - graceTickOffset * currentBeaforeBeatNote
                        params.graceOffsetOff = graceTickSum - graceTickOffset * (currentBeaforeBeatNote + 1)

                        collectNote(events, note, params, st, pitchWheelRenderer, this.m_context)
                    } else if (isGraceBend) {
                        params.graceOffsetOn = graceTickSum
                        params.graceOffsetOff = 0

                        collectNote(events, note, params, st, pitchWheelRenderer, this.m_context)
                    } else {
                        collectNote(events, note, params, st, pitchWheelRenderer, this.m_context)
                    }
                }

                currentBeaforeBeatNote++
            }
        }
    }

    private fillArticulationsInfo(): void {
        for (const part of this.score.parts()) {
            for (const instr of part.instruments().values()) {
                const instrId = instr.id()
                for (const articulationName of Context.s_builtInArticulationsValues.keys()) {
                    const instrArticulations = instr.articulation()
                    const instrHasArticulation = instrArticulations.some(a => a.name === articulationName)

                    if (!instrHasArticulation) {
                        let set = this.m_context.articulationsWithoutValuesByInstrument.get(instrId)
                        if (!set) {
                            set = new Set()
                            this.m_context.articulationsWithoutValuesByInstrument.set(instrId, set)
                        }
                        set.add(articulationName)
                    }
                }
            }
        }
    }
}
