/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/compatmidirender.h/.cpp
 * C++ int& out parameters are returned values here.
 */

import { RealIsNull } from '../../../framework/global/realfn'
import type { Arpeggio } from '../../dom/arpeggio'
import type { Chord } from '../../dom/chord'
import { NoteType } from '../../dom/chordrest'
import { nextChordRest } from '../../dom/chord'
import type { Drumset } from '../../dom/drumset'
import { EaseInOut } from '../../dom/easeInOut'
import { Glissando } from '../../dom/glissando'
import type { Measure } from '../../dom/measure'
import { SlideType, type Note } from '../../dom/note'
import { NoteEvent } from '../../dom/noteevent'
import { PlayEventType } from '../../dom/chord'
import type { Score } from '../../dom/score'
import type { Segment } from '../../dom/segment'
import { SegmentType } from '../../dom/segment'
import type { Slur } from '../../dom/slur'
import { Swing } from '../../dom/swing'
import type { Trill } from '../../dom/trill'
import { chromaticPitchSteps } from '../../dom/utils'
import { Constants } from '../../types/constants'
import type { Fraction } from '../../types/fraction'
import { SymId } from '../../types/symid'
import { ArpeggioType, TremoloChordType, TremoloType, TrillType, type OrnamentStyle } from '../../types/types'
import {
    CompatMidiRendererInternal, Context, GRACE_BEND_DURATION, SLIDE_DURATION, excursions,
} from './compatmidirenderinternal'
import type { EventsHolder } from './event'
import { CTRL_BREATH } from './midicoreevent'

function slideTicks(chord: Chord): number {
    const currentTicks = chord.ticks().ticks()
    if (currentTicks <= SLIDE_DURATION) {
        return Math.trunc(currentTicks / 2)
    }

    return SLIDE_DURATION
}

function graceBendTicks(chord: Chord): number {
    const currentTicks = chord.ticks().ticks()
    if (Math.trunc(currentTicks / 2) <= GRACE_BEND_DURATION) {
        return Math.trunc(currentTicks / 2)
    }

    return GRACE_BEND_DURATION
}

export class CompatMidiRender {
    static renderScore(score: Score, events: EventsHolder, ctx: Context, expandRepeats: boolean): void {
        score.masterScore().setExpandRepeats(expandRepeats)
        const internal = new CompatMidiRendererInternal(score)
        internal.renderScore(events, ctx, expandRepeats)
    }

    static getControllerForSnd(score: Score, globalSndController: number): number {
        const DEFAULT_CC = CTRL_BREATH

        const s = score.synthesizerState()
        const method = s.method()
        let controller = s.ccToUse()

        if (method === -1) {
            controller = (globalSndController === -1) ? DEFAULT_CC : globalSndController
        }

        return controller
    }

    /** the play events of the notes (Note::playEvents) of the measures start..end (or the whole score) */
    static createPlayEvents(score: Score, start: Measure | null = null, end: Measure | null = null, context: Context = new Context()): void {
        if (!start) {
            start = score.firstMeasure()
        }

        const etrack = score.nstaves() * 4
        for (let track = 0; track < etrack; ++track) {
            let rangeEnded = false
            let prevChord: Chord | null = null
            for (let m = start; m; m = m.nextMeasure()) {
                const st = SegmentType.ChordRest

                if (m === end) {
                    rangeEnded = true
                }
                if (rangeEnded) {
                    // The range has ended, but we should collect events
                    // for tied notes. So we'll check if this is the case.
                    const seg = m.first(st)!
                    const e = seg.element(track)
                    let tie = false
                    if (e && e.isChord()) {
                        for (const n of (e as unknown as Chord).notes()) {
                            if (n.tieBack()) {
                                tie = true
                                break
                            }
                        }
                    }
                    if (!tie) {
                        break
                    }
                }

                // skip linked staves, except primary
                if (!m.score().staff(Math.trunc(track / 4))!.isPrimaryStaff()) {
                    continue
                }
                for (let seg = m.first(st); seg; seg = seg.next(st)) {
                    const item = seg.element(track)
                    if (!item) {
                        continue
                    }

                    if (!item.isChord()) {
                        prevChord = null
                        continue
                    }

                    const chord = item as unknown as Chord
                    let nextChord: Chord | null = null
                    const chr = nextChordRest(chord, true)
                    if (chr && chr.isChord()) {
                        nextChord = chr as Chord
                    }

                    if (!nextChord) {
                        // check if next chord is in next measure
                        const nextMeasure = m.nextMeasure()
                        if (nextMeasure) {
                            nextChord = CompatMidiRender.getChordFromSegment(nextMeasure.first(st), track)
                        }
                    }

                    CompatMidiRender.createChordPlayEvents(score, context, chord, prevChord, nextChord)
                    prevChord = chord
                }
            }
        }
    }

    /** C++ createPlayEvents(score, context, chord, prevChord, nextChord) */
    private static createChordPlayEvents(score: Score, context: Context, chord: Chord, prevChord: Chord | null,
                                         nextChord: Chord | null): void {
        let gateTime = 100

        const tick = chord.tick()
        let slur: Slur | null = null
        for (const sp of score.spannerMap().all()) {
            if (!sp.isSlur() || sp.staffIdx() !== chord.staffIdx()) {
                continue
            }
            const s = sp as unknown as Slur
            if (tick.ge(s.tick()) && tick.lt(s.tick2())) {
                slur = s
                break
            }
        }
        // gateTime is 100% for slurred notes
        if (!slur) {
            const instr = chord.part()!.instrument(tick)
            gateTime = instr.updateGateTime(gateTime, '')
        }

        // ontime and trailtime are modified by this call depending on grace notes before and after
        let [ontime, trailtime] = CompatMidiRender.createGraceNotesPlayEvents(score, tick, chord, 0, 0)
        trailtime = CompatMidiRender.adjustTrailtime(trailtime, chord, nextChord)

        const st = chord.staff()!.swing(tick)
        // Check if swing needs to be applied
        if (st.swingUnit && !chord.tuplet()) {
            [ontime, gateTime] = Swing.swingAdjustParams(chord, st, ontime, gateTime)
        }
        //
        //    render normal (and articulated) chords
        //
        const el = CompatMidiRender.renderChord(context, chord, prevChord, gateTime, ontime, trailtime)
        if (chord.playEventType() === PlayEventType.Auto) {
            chord.setNoteEventLists(el)
        }
        // don't change event list if type is PlayEventType::User
    }

    /**
     * renderChord
     *  ontime and trailtime in 1/1000 of duration
     *  ontime signifies how much gap to leave, i.e., how late the note should start because of graceNotesBefore which have already been rendered
     *  trailtime signifies how much gap to leave after the note to allow for graceNotesAfter to be rendered
     */
    private static renderChord(context: Context, chord: Chord, prevChord: Chord | null, gateTime: number, ontime: number,
                               trailtime: number): NoteEvent[][] {
        const notes = chord.notes()
        if (!notes.length) {
            return []
        }

        const ell: NoteEvent[][] = notes.map(() => [])

        let arpeggio = false

        /// when note has glissando or slide from note, tremolo should be shortened
        const baseLength = NoteEvent.NOTE_LENGTH - ontime - trailtime
        let tremoloLength = baseLength / NoteEvent.NOTE_LENGTH

        const glissandoStart = notes.some(note => CompatMidiRender.noteIsGlissandoStart(note))

        if (glissandoStart) {
            tremoloLength = 0.5 * baseLength / NoteEvent.NOTE_LENGTH
        } else {
            const hasSlideOut = notes.some(note => note.hasSlideFromNote())

            if (hasSlideOut) {
                tremoloLength = (baseLength - CompatMidiRender.slideLengthChordDependent(chord)) / NoteEvent.NOTE_LENGTH
            }
        }

        let tremolo = false

        const arp = chord.arpeggio() as Arpeggio | null
        if (arp && arp.playArpeggio()) {
            CompatMidiRender.renderArpeggio(chord, ell, ontime)
            arpeggio = true
        } else {
            if (chord.tremoloType() !== TremoloType.INVALID_TREMOLO) {
                ontime = CompatMidiRender.renderTremolo(chord, ell, ontime, tremoloLength)
                tremolo = true
            }

            gateTime = CompatMidiRender.renderChordArticulation(context, chord, ell, gateTime, ontime / NoteEvent.NOTE_LENGTH, tremolo)
        }

        // Check each note and apply gateTime
        for (const i of CompatMidiRender.getNotesIndexesToRender(chord)) {
            const note = chord.notes()[i]
            const el = ell[i]

            CompatMidiRender.createSlideOutNotePlayEvents(note, el, ontime, tremolo)
            if (arpeggio) {
                continue // don't add extra events and apply gateTime to arpeggio
            }

            // If we are here then we still need to render the note.
            // Render its body if necessary and apply gateTime.
            if (!el.length && chord.tremoloChordType() !== TremoloChordType.TremoloSecondChord) {
                el.push(new NoteEvent(0, ontime, 1000 - trailtime,
                    !note.ghost() ? NoteEvent.DEFAULT_VELOCITY_MULTIPLIER : NoteEvent.GHOST_VELOCITY_MULTIPLIER))

                const gl = CompatMidiRender.backGlissando(note)
                if (gl && CompatMidiRender.isGlissandoValid(gl) && !gl.glissandoShift()) {
                    el[el.length - 1].setSlide(true)
                }
            }

            CompatMidiRender.createSlideInNotePlayEvents(note, prevChord, el)

            for (const e of el) {
                e.setLen(Math.trunc(e.len() * gateTime / 100))
            }

            el.sort((left, right) => {
                const l1 = left.ontime()
                const l2 = -left.offset()
                const r1 = right.ontime()
                const r2 = -right.offset()
                return l1 !== r1 ? l1 - r1 : l2 - r2
            })
        }

        return ell
    }

    private static renderArpeggio(chord: Chord, ell: NoteEvent[][], ontime: number): void {
        const notes = chord.notes().length
        let l = 64
        while (l && (l * notes > chord.upNote().playTicks())) {
            l = Math.trunc(2 * l / 3)
        }
        let start: number
        let end: number
        let step: number
        const arpeggio = chord.arpeggio() as Arpeggio
        const up = arpeggio.arpeggioType() !== ArpeggioType.DOWN && arpeggio.arpeggioType() !== ArpeggioType.DOWN_STRAIGHT
        if (up) {
            start = 0
            end = notes
            step = 1
        } else {
            start = notes - 1
            end = -1
            step = -1
        }
        let j = 0
        for (let i = start; i !== end; i += step) {
            const events = ell[i]
            events.length = 0

            const tempoRatio = chord.score().tempomap().multipliedTempo(chord.tick().ticks()) / Constants.DEFAULT_TEMPO
            let ot = Math.trunc(Math.trunc((l * j * 1000) / chord.upNote().playTicks()) * tempoRatio * arpeggio.Stretch())
            ot = Math.min(Math.max(ot + ontime, ot), 1000)

            events.push(new NoteEvent(0, ot, 1000 - ot))
            j++
        }
    }

    /** C++ renderTremolo(chord, ell, int& ontime, tremoloPartOfChord): returns ontime */
    private static renderTremolo(chord: Chord, ell: NoteEvent[][], ontime: number, tremoloPartOfChord = 1.0): number {
        if (RealIsNull(tremoloPartOfChord)) {
            return ontime
        }

        const singleChord = chord.tremoloSingleChord()
        const twoChord = chord.tremoloTwoChord()
        const tremoloType = singleChord ? singleChord.tremoloType() : (twoChord ? twoChord.tremoloType() : TremoloType.INVALID_TREMOLO)
        const lines = singleChord ? singleChord.lines() : (twoChord ? twoChord.lines() : 0)

        const seg = chord.segment()
        const notes = chord.notes().length

        // check if tremolo was rendered before for drum staff
        const ds = CompatMidiRender.getDrumset(chord)
        if (ds) {
            for (const n of chord.notes()) {
                const div = ds.findVariant(n.pitch(), chord.articulations(), tremoloType)
                if (div.pitch !== -1 && div.tremolo === tremoloType) {
                    return ontime // already rendered
                }
            }
        }

        // we cannot render buzz roll with MIDI events only
        if (tremoloType === TremoloType.BUZZ_ROLL) {
            return ontime
        }

        // render tremolo with multiple events
        if (chord.tremoloChordType() === TremoloChordType.TremoloFirstChord) {
            let t = Math.trunc(Constants.DIVISION / (1 << (lines + chord.durationType().hooks())))
            if (t === 0) { // avoid crash on very short tremolo
                t = 1
            }
            const st = SegmentType.ChordRest
            let seg2 = seg.next(st)
            const track = chord.track()
            while (seg2 && !seg2.element(track)) {
                seg2 = seg2.next(st)
            }

            if (!seg2) {
                return ontime
            }

            const s2El = seg2.element(track)
            if (s2El) {
                if (!s2El.isChord()) {
                    return ontime
                }
            } else {
                return ontime
            }

            const c2 = s2El as unknown as Chord
            const notes2 = c2.notes().length
            const tnotes = Math.max(notes, notes2)
            const tticks = chord.ticks().ticks() * 2 // use twice the size
            let n = Math.trunc(tticks / t)
            n = Math.trunc(n / 2)
            const l = Math.trunc(2000 * t / tticks)
            for (let k = 0; k < tnotes; ++k) {
                let events: NoteEvent[]
                if (k < notes) {
                    // first chord has note
                    events = ell[k]
                    events.length = 0
                } else {
                    // otherwise reuse note 0
                    events = ell[0]
                }
                if (k < notes && k < notes2) {
                    // both chords have note
                    const p1 = chord.notes()[k].pitch()
                    const p2 = c2.notes()[k].pitch()
                    const dpitch = p2 - p1
                    for (let i = 0; i < n; ++i) {
                        events.push(new NoteEvent(0, l * i * 2, l))
                        events.push(new NoteEvent(dpitch, l * i * 2 + l, l))
                    }
                } else if (k < notes) {
                    // only first chord has note
                    for (let i = 0; i < n; ++i) {
                        events.push(new NoteEvent(0, l * i * 2, l))
                    }
                } else {
                    // only second chord has note
                    // reuse note 0 of first chord
                    const p1 = chord.notes()[0].pitch()
                    const p2 = c2.notes()[k].pitch()
                    const dpitch = p2 - p1
                    for (let i = 0; i < n; ++i) {
                        events.push(new NoteEvent(dpitch, l * i * 2 + l, l))
                    }
                }
            }
        } else if (chord.tremoloChordType() === TremoloChordType.TremoloSecondChord) {
            for (let k = 0; k < notes; ++k) {
                ell[k].length = 0
            }
        } else if (chord.tremoloChordType() === TremoloChordType.TremoloSingle) {
            let t = Math.trunc(Constants.DIVISION / (1 << (lines + chord.durationType().hooks())))
            if (t === 0) { // avoid crash on very short tremolo
                t = 1
            }

            const tremoloEventsSize = Math.trunc(Math.trunc(chord.ticks().ticks() / t) * tremoloPartOfChord)

            const fullEventTime = 1000
            const tremoloTime = Math.trunc(fullEventTime * tremoloPartOfChord)
            const tremoloEventStep = Math.trunc(tremoloTime / tremoloEventsSize)
            ontime += tremoloTime

            for (let k = 0; k < notes; ++k) {
                const events = ell[k]
                events.length = 0
                for (let i = 0; i < tremoloEventsSize; i++) {
                    events.push(new NoteEvent(0, tremoloEventStep * i, tremoloEventStep))
                }
            }
        }
        return ontime
    }

    /** C++ renderChordArticulation(context, chord, ell, int& gateTime, ...): returns gateTime */
    private static renderChordArticulation(context: Context, chord: Chord, ell: NoteEvent[][], gateTime: number,
                                           graceOnBeatProportion: number, tremoloBefore = false): number {
        const seg = chord.segment()
        const instr = chord.part()!.instrument(seg.tick())

        for (let k = 0; k < chord.notes().length; ++k) {
            const events = ell[k]
            const note = chord.notes()[k]
            let trill: Trill | null

            if (CompatMidiRender.noteIsGlissandoStart(note)) {
                CompatMidiRender.renderGlissando(events, note, graceOnBeatProportion, tremoloBefore)
            } else if (chord.staff()!.isPitchedStaff(chord.tick()) && (trill = CompatMidiRender.findFirstTrill(chord)) !== null) {
                CompatMidiRender.renderNoteArticulationTrill(events, note, false, trill.trillType(), trill.ornamentStyle())
            } else {
                for (const a of chord.articulations()) {
                    if (!a.playArticulation()) {
                        continue
                    }
                    if (!CompatMidiRender.renderNoteArticulationSym(events, note, false, a.symId(), a.ornamentStyle())) {
                        gateTime = CompatMidiRender.updateGateTime(instr, gateTime, a.articulationName(), context)
                    }
                }
            }
        }
        return gateTime
    }

    /** C++ updateGateTime(instr, int& gateTime, articulationName, context): returns gateTime */
    private static updateGateTime(instrument: import('../../dom/instrument').Instrument, gateTime: number, articulationName: string,
                                  context: Context): number {
        if (context.useDefaultArticulations) {
            const it = Context.s_builtInArticulationsValues.get(articulationName)
            if (it) {
                gateTime = Math.min(gateTime, it.gateTime)
            } else {
                gateTime = instrument.updateGateTime(gateTime, articulationName)
            }

            return gateTime
        }

        const articulationsForInstrument = context.articulationsWithoutValuesByInstrument.get(instrument.id())
        if (articulationsForInstrument) {
            if (articulationsForInstrument.has(articulationName)) {
                gateTime = Math.min(gateTime, Context.builtInArticulation(articulationName).gateTime)
            } else {
                gateTime = instrument.updateGateTime(gateTime, articulationName)
            }
        }
        return gateTime
    }

    /**
     * as a side effect of createGraceNotesPlayEvents, ontime and trailtime (passed by ref)
     * are modified.  ontime reflects the time needed to play the grace-notes-before, and
     * trailtime reflects the time for the grace-notes-after.  These are used by the caller
     * to effect the on/off time of the main note. Returns [ontime, trailtime].
     */
    private static createGraceNotesPlayEvents(score: Score, tick: Fraction, chord: Chord, ontime: number,
                                              trailtime: number): [number, number] {
        const gnb = [...chord.graceNotesBefore(true).chords()]
        const gna = [...chord.graceNotesAfter(true).chords()]
        const nb = gnb.length
        const na = gna.length
        if (0 === nb + na) {
            return [ontime, trailtime] // return immediately if no grace notes to deal with
        }
        // return immediately if the chord has a trill or articulation which effectively plays the graces notes.
        if (CompatMidiRendererInternal.graceNotesMerged(chord)) {
            return [ontime, trailtime]
        }
        // if there are graceNotesBefore and also graceNotesAfter, and the before grace notes are
        // not ACCIACCATURA, then the total time of all of them will be 50% of the time of the main note.
        // if the before grace notes are ACCIACCATURA then the grace notes after (if there are any).
        // get 50% of the time of the main note.
        // this is achieved by the two floating point weights: weighta and weightb whose total is 1.0
        // assuring that all the grace notes get the same duration, and their total is 50%.
        // exception is if the note is dotted or double-dotted; see below.
        let weighta = Math.fround(na / (nb + na))

        let graceDuration = 0
        const drumset = (CompatMidiRender.getDrumset(chord) !== null)
        const ticksPerSecond = score.multipliedTempo(tick) * Constants.DIVISION
        const chordTimeMS = (chord.actualTicks().ticks() / ticksPerSecond) * 1000
        if (drumset) {
            const flamDuration = 15 //ms
            graceDuration = Math.trunc(flamDuration / chordTimeMS * 1000) //ratio 1/1000 from the main note length
            ontime = graceDuration * nb
        } else if (nb) {
            //
            //  render grace notes:
            //  simplified implementation:
            //  - grace notes start on the beat of the main note
            //  - duration: appoggiatura: 0.5  * duration of main note (2/3 for dotted notes, 4/7 for double-dotted)
            //              acciacatura: min of 0.5 * duration or 65ms fixed (independent of duration or tempo)
            //  - for appoggiaturas, the duration is divided by the number of grace notes
            //  - the grace note duration as notated does not matter
            //
            const graceChord = gnb[0]
            const graceNotes = graceChord.notes()
            const graceBend = graceNotes.some(note => note.isGraceBendStart())

            if (graceChord.noteType() === NoteType.ACCIACCATURA || graceBend) {
                ontime = 0
                graceDuration = 0
                weighta = 1.0
            } else {
                const graceTimeMS = (graceChord.actualTicks().ticks() / ticksPerSecond) * 1000

                // 1000 occurs below as a unit for ontime
                ontime = Math.min(500, Math.trunc((graceTimeMS / chordTimeMS) * 1000))
                graceDuration = Math.trunc(ontime / nb)
                weighta = 1.0
                trailtime += ontime
            }
        }

        for (let i = 0, on = 0; i < nb; ++i) {
            const el: NoteEvent[][] = []
            const gc = gnb[i]
            const nn = gc.notes().length
            for (let ii = 0; ii < nn; ++ii) {
                el.push([new NoteEvent(0, on, graceDuration)])
            }

            if (gc.playEventType() === PlayEventType.Auto) {
                gc.setNoteEventLists(el)
            }

            on += graceDuration
        }

        const graceBendAfter = gna.some(graceChord => graceChord.notes().some(note => note.bendBack() !== null))

        if (!graceBendAfter && na) {
            if (chord.dots() === 1) {
                trailtime = Math.floor(Math.fround(667 * weighta))
            } else if (chord.dots() === 2) {
                trailtime = Math.floor(Math.fround(571 * weighta))
            } else {
                trailtime = Math.floor(Math.fround(500 * weighta))
            }
            const graceDuration1 = Math.trunc(trailtime / na)
            let on = 1000 - trailtime
            for (let i = 0; i < na; ++i) {
                const el: NoteEvent[][] = []
                const gc = gna[i]
                const nn = gc.notes().length
                for (let ii = 0; ii < nn; ++ii) {
                    el.push([new NoteEvent(0, on, graceDuration1)]) // NoteEvent(pitch,ontime,len)
                }

                if (gc.playEventType() === PlayEventType.Auto) {
                    gc.setNoteEventLists(el)
                }
                on += graceDuration1
            }
        }
        return [ontime, trailtime]
    }

    private static renderGlissando(events: NoteEvent[], notestart: Note, graceOnBeatProportion: number, tremoloBefore = false): void {
        const empty: number[] = []
        const body: number[] = []
        for (const s of notestart.spannerFor()) {
            if (s.isGlissando() && s.playSpanner() && Glissando.pitchSteps(s, body)) {
                CompatMidiRender.renderNoteArticulation(events, notestart, true, Constants.DIVISION, empty, body, false, true, empty, 16, 0,
                    graceOnBeatProportion, tremoloBefore)
            }
        }
    }

    /**
     * renderNoteArticulation
     * prefix, vector of int, normally something like {0,-1,0,1} modeling the prefix of tremblement relative to the base note
     * body, vector of int, normally something like {0,-1,0,1} modeling the possibly repeated tremblement relative to the base note
     * tickspernote, number of ticks, either _16h or _32nd, i.e., Constants::division/4 or Constants::division/8
     * repeatp, true means repeat the body as many times as possible to fill the time slice.
     * sustainp, true means the last note of the body is sustained to fill remaining time slice
     */
    private static renderNoteArticulation(events: NoteEvent[], note: Note, chromatic: boolean, requestedTicksPerNote: number,
                                          prefix: readonly number[], body: readonly number[], repeatp: boolean, sustainp: boolean,
                                          suffix: readonly number[], fastestFreq = 64, slowestFreq = 8, // 64 Hz and 8 Hz
                                          graceOnBeatProportion = 0, tremoloBefore = false): boolean {
        if (!tremoloBefore) {
            events.length = 0
        }

        const chord = note.chord()
        const maxticks = CompatMidiRender.totalTiedNoteTicks(note)
        const space = 1000 * maxticks
        let numrepeat = 1
        let sustain = 0
        let ontime = 0

        ///@NOTE grace note + glissando combination is treated separetely, in this method grace notes for glissando are not added
        /// graceOnBeatProportion is used for calculating grace note "on beat" offset
        const gnb = CompatMidiRender.noteIsGlissandoStart(note) ? 0 : note.chord().graceNotesBefore().size()
        const p = prefix.length
        const b = body.length
        const s = suffix.length
        const gna = note.chord().graceNotesAfter().size()

        let ticksPerNote = 0

        if (gnb + p + b + s + gna <= 0) {
            return false
        }

        const tick = chord.tick()
        const tempo = chord.score().multipliedTempo(tick)
        const ticksPerSecond = Math.trunc(tempo * Constants.DIVISION)

        const minTicksPerNote = Math.trunc(ticksPerSecond / fastestFreq)
        const maxTicksPerNote = (0 === slowestFreq) ? 0 : Math.trunc(ticksPerSecond / slowestFreq)

        // for fast tempos, we have to slow down the tremblement frequency, i.e., increase the ticks per note
        if (requestedTicksPerNote >= minTicksPerNote) {
        } else { // try to divide the requested frequency by a power of 2 if possible, if not, use the maximum frequency, ie., minTicksPerNote
            ticksPerNote = requestedTicksPerNote
            while (ticksPerNote < minTicksPerNote) {
                ticksPerNote *= 2 // decrease the tremblement frequency
            }
            if (ticksPerNote > maxTicksPerNote) {
                ticksPerNote = minTicksPerNote
            }
        }

        ticksPerNote = Math.max(requestedTicksPerNote, minTicksPerNote)

        if (slowestFreq <= 0) { // no slowest freq given such as something silly like glissando with 4 notes over 8 counts.
        } else if (ticksPerNote <= maxTicksPerNote) { // in a good range, so we don't need to adjust ticksPerNote
        } else {
            // for slow tempos, such as adagio, we may need to speed up the tremblement frequency, i.e., decrease the ticks per note, to make it sound reasonable.
            ticksPerNote = requestedTicksPerNote
            while (ticksPerNote > maxTicksPerNote) {
                ticksPerNote = Math.trunc(ticksPerNote / 2)
            }
            if (ticksPerNote < minTicksPerNote) {
                ticksPerNote = minTicksPerNote
            }
        }
        // calculate whether to shorten the duration value.
        if (ticksPerNote * (gnb + p + b + s + gna) <= maxticks) {
            // plenty of space to play the notes without changing the requested trill note duration
        } else if (ticksPerNote === minTicksPerNote) {
            return false // the ornament is impossible to implement respecting the minimum duration and all the notes it contains
        } else {
            ticksPerNote = Math.trunc(maxticks / (gnb + p + b + s + gna)) // integer division ignoring remainder
            if (slowestFreq <= 0) {
            } else if (ticksPerNote < minTicksPerNote) {
                return false
            }
        }

        const millespernote = Math.trunc(space * ticksPerNote / maxticks) // rescale duration into per mille

        // local function:
        // look ahead in the given vector to see if the current note is the same pitch as the next note or next several notes.
        // If so, increment the duration by the appropriate note duration, and increment the index, j, to the next note index
        // of a different pitch.
        // The total duration of the tied note is returned, and the index is modified.
        const tieForward = (j: { v: number }, vec: readonly number[]): number => {
            const size = vec.length
            let duration = millespernote
            while (j.v < size - 1 && vec[j.v] === vec[j.v + 1]) {
                duration += millespernote
                j.v++
            }
            return duration
        }

        // local function:
        //   append a NoteEvent either by calculating an articulationExcursion or by
        //   the given chromatic relative pitch.
        //   RETURNS the new ontime value.  The caller is expected to assign this value.
        const makeEvent = (pitch: number, ontime2: number, duration: number,
                           velocityMultiplier = NoteEvent.DEFAULT_VELOCITY_MULTIPLIER, play = true): number => {
            if (note.ghost()) {
                velocityMultiplier *= NoteEvent.GHOST_VELOCITY_MULTIPLIER
            }
            events.push(new NoteEvent(chromatic ? pitch : chromaticPitchSteps(note, note, pitch),
                Math.trunc(ontime2 / chord.actualTicks().ticks()),
                Math.trunc(duration / chord.actualTicks().ticks()), velocityMultiplier, play))

            return ontime2 + duration
        }

        // calculate the number of times to repeat the body, and sustain the last note of the body
        // 1000 = P + numrepeat*B+sustain + S
        if (repeatp) {
            numrepeat = Math.trunc((space - millespernote * (gnb + p + s + gna)) / (millespernote * b))
        }
        if (sustainp) {
            sustain = space - millespernote * (gnb + p + numrepeat * b + s + gna)
        }

        // render the prefix
        for (const j = { v: 0 }; j.v < p; j.v++) {
            ontime = makeEvent(prefix[j.v], ontime, tieForward(j, prefix))
        }

        if (b > 0) {
            // Check that we are doing a glissando
            enum GlissandoState {
                NOT_FOUND,
                VALID,
                INVALID,
            }
            let glissandoState = GlissandoState.NOT_FOUND

            const onTimes: number[] = []
            for (const spanner of note.spannerFor()) {
                if (spanner.isGlissando()) {
                    const glissando = spanner as unknown as Glissando
                    if (!CompatMidiRender.isGlissandoValid(glissando)) {
                        glissandoState = GlissandoState.INVALID
                        break
                    }

                    const easeInOut = new EaseInOut(glissando.easeIn() / 100.0, glissando.easeOut() / 100.0)

                    // shifting glissando sounds to the second half of glissando duration
                    const totalDuration = millespernote * b
                    const glissandoPart = 0.33

                    const glissandoDuration = Math.trunc(tremoloBefore ? totalDuration * glissandoPart : totalDuration
                                                         * (1 - graceOnBeatProportion) * glissandoPart)
                    easeInOut.timeList(b - 1, glissandoDuration, onTimes)

                    if (onTimes.length) {
                        onTimes[0] = Math.trunc(onTimes[0] + graceOnBeatProportion * totalDuration)
                    }

                    if (onTimes.length > 1) {
                        const offset = onTimes[1]
                        for (let i = 1; i < onTimes.length; i++) {
                            onTimes[i] += totalDuration - glissandoDuration - offset
                        }
                    }

                    glissandoState = GlissandoState.VALID
                    break
                }
            }
            if (glissandoState === GlissandoState.VALID) {
                const defaultVelocityMultiplier = 1.0

                // render the body, i.e. the glissando
                if (onTimes.length > 1) {
                    makeEvent(body[0], onTimes[0], onTimes[1] - onTimes[0],
                        defaultVelocityMultiplier, !note.tieBack())

                    const gl = CompatMidiRender.backGlissando(note)
                    if (gl && CompatMidiRender.isGlissandoValid(gl) && !gl.glissandoShift()) {
                        events[events.length - 1].setSlide(true)
                    }
                }

                for (let j = 1; j < b - 1; j++) {
                    makeEvent(body[j], onTimes[j], onTimes[j + 1] - onTimes[j],
                        defaultVelocityMultiplier)
                    events[events.length - 1].setSlide(true)
                }

                if (b > 1) {
                    makeEvent(body[b - 1], onTimes[b - 1], (millespernote * b - onTimes[b - 1]) + sustain, defaultVelocityMultiplier)
                    events[events.length - 1].setSlide(true)
                }
            } else if (glissandoState !== GlissandoState.INVALID) {
                // render the body, but not the final repetition
                for (let r = 0; r < numrepeat - 1; r++) {
                    for (let j = 0; j < b; j++) {
                        ontime = makeEvent(body[j], ontime, millespernote)
                    }
                }
                // render the final repetition of body, but not the final note of the repetition
                for (let j = 0; j < b - 1; j++) {
                    ontime = makeEvent(body[j], ontime, millespernote)
                }
                // render the final note of the final repeat of body
                ontime = makeEvent(body[b - 1], ontime, millespernote + sustain)
            }
        }
        // render the suffix
        for (const j = { v: 0 }; j.v < s; j.v++) {
            ontime = makeEvent(suffix[j.v], ontime, tieForward(j, suffix))
        }

        return true
    }

    /** C++ renderNoteArticulation(events, note, chromatic, SymId articulationType, OrnamentStyle) */
    private static renderNoteArticulationSym(events: NoteEvent[], note: Note, chromatic: boolean, articulationType: SymId,
                                             ornamentStyle: OrnamentStyle): boolean {
        if (!note.staff()!.isPitchedStaff(note.tick())) { // not enough info in tab staff
            return false
        }

        for (const oe of excursions) {
            if (oe.atype === articulationType && (0 === oe.ostyles.length || oe.ostyles.includes(ornamentStyle))) {
                return CompatMidiRender.renderNoteArticulation(events, note, chromatic, oe.duration,
                    oe.prefix, oe.body, oe.repeatp, oe.sustainp, oe.suffix)
            }
        }
        return false
    }

    /** C++ renderNoteArticulation(events, note, chromatic, TrillType, OrnamentStyle) */
    private static renderNoteArticulationTrill(events: NoteEvent[], note: Note, chromatic: boolean, trillType: TrillType,
                                               ornamentStyle: OrnamentStyle): boolean {
        const articulationMap = new Map<TrillType, SymId>([
            [TrillType.TRILL_LINE, SymId.ornamentTrill],
            [TrillType.UPPRALL_LINE, SymId.ornamentUpPrall],
            [TrillType.DOWNPRALL_LINE, SymId.ornamentPrecompMordentUpperPrefix],
            [TrillType.PRALLPRALL_LINE, SymId.ornamentTrill],
        ])
        const it = articulationMap.get(trillType)
        if (it === undefined) {
            return false
        } else {
            return CompatMidiRender.renderNoteArticulationSym(events, note, chromatic, it, ornamentStyle)
        }
    }

    private static createSlideInNotePlayEvents(note: Note, prevChord: Chord | null, el: NoteEvent[]): void {
        if (!note.hasSlideToNote()) {
            return
        }

        let slideNotes = 0
        const upSlide = note.slideToType() === SlideType.UpToNote
        if (upSlide) {
            slideNotes = Math.min(Math.max(note.fret() - 1, 0), NoteEvent.SLIDE_AMOUNT)
        } else {
            slideNotes = NoteEvent.SLIDE_AMOUNT
        }

        if (slideNotes === 0) {
            return
        }

        let totalSlideDuration = 0
        const currentTicks = note.chord().ticks().ticks()
        if (prevChord) {
            /// event length is about current chord's events, but we adjust previous
            totalSlideDuration = Math.trunc(CompatMidiRender.slideLengthChordDependent(prevChord) / currentTicks * prevChord.ticks().ticks())
        } else {
            totalSlideDuration = Math.trunc(NoteEvent.NOTE_LENGTH * SLIDE_DURATION / currentTicks)
        }

        const slideDuration = Math.trunc(totalSlideDuration / slideNotes)

        let slideOn = 0
        const pitchOffset = upSlide ? -1 : 1
        let pitch = pitchOffset * slideNotes
        for (let i = 0; i < slideNotes; ++i) {
            const event = new NoteEvent(pitch, 0, slideDuration, 1.0, true, totalSlideDuration - slideOn)
            event.setSlide(true)
            el.push(event)
            slideOn += slideDuration
            pitch -= pitchOffset
        }
    }

    private static createSlideOutNotePlayEvents(note: Note, el: NoteEvent[], onTime: number, hasTremolo: boolean): void {
        if (!note.hasSlideFromNote()) {
            return
        }

        const slideNotes = NoteEvent.SLIDE_AMOUNT
        const totalSlideDuration = CompatMidiRender.slideLengthChordDependent(note.chord())
        const slideDuration = Math.trunc(totalSlideDuration / slideNotes)

        let slideOn = NoteEvent.NOTE_LENGTH - totalSlideDuration
        const velocity = !note.ghost() ? NoteEvent.DEFAULT_VELOCITY_MULTIPLIER : NoteEvent.GHOST_VELOCITY_MULTIPLIER
        if (!hasTremolo) {
            el.push(new NoteEvent(0, onTime, slideOn - onTime, velocity, !note.tieBack()))
        }

        let pitch = 0
        const pitchOffset = note.slideFromType() === SlideType.UpFromNote ? 1 : -1
        for (let i = 0; i < slideNotes; ++i) {
            pitch += pitchOffset
            const event = new NoteEvent(pitch, slideOn, slideDuration, velocity)
            event.setSlide(true)
            el.push(event)
            slideOn += slideDuration
        }
    }

    // Helpers

    private static getChordFromSegment(segment: Segment | null, track: number): Chord | null {
        if (segment) {
            const item = segment.element(track)
            if (item && item.isChord()) {
                return item as unknown as Chord
            }
        }

        return null
    }

    /** search the spanners in the score, finding the first one which overlaps this chord and is of type ElementType::TRILL */
    private static findFirstTrill(chord: Chord): Trill | null {
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

    private static adjustTrailtime(trailtime: number, currentChord: Chord, nextChord: Chord | null): number {
        if (!nextChord) {
            return trailtime
        }

        const graceBeforeChords = [...nextChord.graceNotesBefore().chords()]
        let graceNotesBeforeBar: Chord[] = []

        const hasGraceBend = graceBeforeChords.some(ch => ch.notes().some(n => n.isGraceBendStart()))

        if (!hasGraceBend) {
            graceNotesBeforeBar = graceBeforeChords.filter(ch => ch.noteType() === NoteType.ACCIACCATURA)
        }

        const currentTicks = currentChord.ticks().ticks()
        if (!(currentTicks > 0)) {
            return trailtime
        }

        let reducedTicks = 0

        const notes = nextChord.notes()
        if (hasGraceBend) {
            reducedTicks = graceBendTicks(currentChord)
        } else if (graceNotesBeforeBar.length) {
            reducedTicks = Math.min(graceNotesBeforeBar[0].ticks().ticks(), Math.trunc(currentTicks / 2))
        } else {
            const anySlidesIn = notes.some(note => note.slideToType() === SlideType.DownToNote
                                                   || (note.slideToType() === SlideType.UpToNote && note.fret() > 1))

            if (anySlidesIn) {
                reducedTicks = slideTicks(currentChord)
            }
        }

        trailtime = Math.trunc(trailtime + reducedTicks / currentTicks * NoteEvent.NOTE_LENGTH)
        return trailtime
    }

    private static noteIsGlissandoStart(note: Note): boolean {
        for (const spanner of note.spannerFor()) {
            if (spanner.isGlissando() && spanner.endElement() && spanner.endElement()!.isNote()) {
                return true
            }
        }
        return false
    }

    private static slideLengthChordDependent(chord: Chord): number {
        const currentTicks = chord.ticks().ticks()
        if (currentTicks <= SLIDE_DURATION) {
            return NoteEvent.NOTE_LENGTH / 2
        }

        return Math.trunc(NoteEvent.NOTE_LENGTH * SLIDE_DURATION / currentTicks)
    }

    private static getNotesIndexesToRender(chord: Chord): number[] {
        const notes = chord.notes()
        /// not adding sounds for the same pitches in chord (for example, on different strings)
        const longestPlayTicksForPitch = new Map<number, number>()

        for (const note of notes) {
            const pitch = note.pitch()
            longestPlayTicksForPitch.set(pitch, Math.max(longestPlayTicksForPitch.get(pitch) ?? 0, note.playTicks()))
        }

        const noteShouldBeRendered = (n: Note): boolean => {
            while (n.tieBackNonPartial() && n !== n.tieBack()!.startNote()) {
                n = n.tieBack()!.startNote()!
                if (CompatMidiRender.findFirstTrill(n.chord())) {
                    // The previous tied note probably has events for this note too.
                    // That is, we don't need to render this note separately.
                    return false
                }

                for (const a of n.chord().articulations()) {
                    if (a.isOrnament()) {
                        return false
                    }
                }
            }

            return true
        }

        const notesIndexesToRender: number[] = [] // std::set<size_t>: ascending
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i]
            if (noteShouldBeRendered(n) && longestPlayTicksForPitch.get(n.pitch()) === n.playTicks()) {
                notesIndexesToRender.push(i)
            }
        }

        return notesIndexesToRender
    }

    private static backGlissando(note: Note): Glissando | null {
        for (const spanner of note.spannerBack()) {
            if (spanner.isGlissando() && spanner.startElement() && spanner.startElement()!.isNote()) {
                return spanner as unknown as Glissando
            }
        }
        return null
    }

    /** checking if glissando can be played */
    private static isGlissandoValid(glissando: Glissando): boolean {
        const startItem = glissando.startElement()
        const endItem = glissando.endElement()
        if (!startItem || !endItem || !startItem.isNote() || !endItem.isNote()) {
            return false
        }

        return (startItem as unknown as Note).string() === (endItem as unknown as Note).string()
    }

    private static getDrumset(chord: Chord): Drumset | null {
        if (chord.staff() && chord.staff()!.isDrumStaff(chord.tick())) {
            const ds = chord.staff()!.part().instrument(chord.tick()).drumset()
            return ds
        }
        return null
    }

    /**
     * return the total of the actualTicks of the given note plus
     * the chain of zero or more notes tied to it to the right.
     */
    private static totalTiedNoteTicks(note: Note): number {
        let total = note.chord().actualTicks()
        while (note.tieFor() && note.tieFor()!.endNote() && (note.chord().tick().lt(note.tieFor()!.endNote()!.chord().tick()))) {
            note = note.tieFor()!.endNote()!
            total = total.plus(note.chord().actualTicks())
        }
        return total.ticks()
    }

    static tick(ctx: Context, tick: number): number {
        return ctx.applyCaesuras ? ctx.pauseMap.tickWithPauses(tick) : tick
    }
}
