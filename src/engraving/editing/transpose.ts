/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/transpose.h/.cpp
 * TODO(port): Score::setPlayNote
 */

import {
    ElementType, Key, NoteSpellingType, PreferSharpFlat, StaffGroup, TransposeDirection, TransposeMode, VOICES, type staff_idx_t, type track_idx_t,
} from '../types/types'
import { Fraction } from '../types/fraction'
import { itemFactories, type EngravingItem } from '../dom/engravingitem'
import { Segment, SegmentType } from '../dom/segment'
import { ElementsSelectionFilterTypes } from '../dom/selectionfilter'
import { Pid } from '../dom/property'
import { Sid } from '../style/styledef'
import { isFirstSystemKeySig } from '../dom/utils'
import type { EngravingObject } from '../dom/engravingobject'
import type { Harmony } from '../dom/harmony'
import type { KeySig } from '../dom/keysig'
import type { Note } from '../dom/note'
import type { Part } from '../dom/part'
import type { Staff } from '../dom/staff'
import type { FretDiagram } from '../dom/fret'
import type { Score } from '../dom/score'
import type { EditData } from './editdata'
import { ChangeKeySig } from './editkeysig'
import { CommandType, UndoCommand } from './undo'
import {
    PITCH_DELTA_OCTAVE, STEP_DELTA_OCTAVE, TPC_DELTA_ENHARMONIC, TPC_DELTA_SEMITONE,
    NoteCaseType, Tpc, bestEnharmonicFit, clampEnharmonic, clampKey, convertNote, key2Tpc, step2tpcByKey, tpc2Key, tpc2name, tpc2step,
    tpc2stepByKey, tpcIsValid,
} from '../dom/pitchspelling'
import { MScore, MsError } from '../dom/mscore'
import type { MStyle } from '../style/style'
import { FretDataChange } from './editfretboarddiagram'
import { Interval } from '../dom/interval'
import type { Chord } from '../dom/chord'

export class Transpose {
    static transpose(score: Score, mode: TransposeMode, direction: TransposeDirection, trKey: Key, transposeInterval: number,
        trKeys: boolean, transposeChordNames: boolean, useDoubleSharpsFlats: boolean): boolean {
        const selection = score.selection()
        let result = true
        const rangeSelection = selection.isRange()
        let startStaffIdx: staff_idx_t = 0
        let endStaffIdx: staff_idx_t = 0
        let startTick = new Fraction(0, 1)
        if (rangeSelection) {
            startStaffIdx = selection.staffStart()
            endStaffIdx = selection.staffEnd()
            startTick = selection.tickStart()
        }

        let st = score.staff(startStaffIdx)!

        let interval = new Interval(0, 0)
        if (mode !== TransposeMode.DIATONICALLY) {
            if (mode === TransposeMode.TO_KEY) {
                // calculate interval from "transpose to key"
                // find the key of the first pitched staff
                let key: Key = Key.C
                for (let i = startStaffIdx; i < endStaffIdx; ++i) {
                    const s = score.staff(i)!
                    if (s.isPitchedStaff(startTick)) {
                        key = s.concertKey(startTick)
                        // remember this staff to use as basis in transposing key signatures
                        st = s
                        break
                    }
                }
                if (key !== trKey) {
                    interval = Transpose.keydiff2Interval(key, trKey, direction)
                } else { //same key, which direction?
                    if (direction === TransposeDirection.UP) {
                        interval = new Interval(7, 12)
                    } else if (direction === TransposeDirection.DOWN) {
                        interval = new Interval(-7, -12)
                    } else { //don't do anything for same key and closest direction
                        return true
                    }
                }
            } else {
                interval = Interval.allIntervals[transposeInterval].clone()
                if (direction === TransposeDirection.DOWN) {
                    interval.flip()
                }
            }

            if (!rangeSelection) {
                trKeys = false
            }
            const fullOctave = (interval.chromatic % PITCH_DELTA_OCTAVE) === 0
            if (fullOctave && (mode !== TransposeMode.TO_KEY)) {
                trKeys = false
                transposeChordNames = false
            }
        } else { // diatonic transposition
            if (direction === TransposeDirection.DOWN) {
                transposeInterval *= -1
            }
        }

        if (selection.isList()) {
            const selectionList = selection.uniqueElements()
            for (const e of selectionList) {
                if (!e.staff() || e.staff()!.staffType(e.tick()).group() === StaffGroup.PERCUSSION) {
                    continue
                }
                const primaryStaff = e.staff()!.primaryStaff()
                if (primaryStaff && primaryStaff.staffType(new Fraction(0, 1)).group() === StaffGroup.PERCUSSION) {
                    continue
                }
                if (e.isNote()) {
                    const note = e as unknown as Note
                    if (!Transpose.transposeNote(note, mode, transposeInterval, trKeys, useDoubleSharpsFlats, interval)) {
                        result = false
                    }
                } else if (e.isHarmony() && transposeChordNames) {
                    const parent = e.parent()
                    if (parent && parent.isFretDiagram()) {
                        if (selectionList.includes(parent as unknown as EngravingItem)) {
                            continue
                        }

                        const fd = parent as unknown as FretDiagram
                        Transpose.transposeFretDiagram(fd, score, interval, mode, transposeInterval, trKeys, useDoubleSharpsFlats)
                    } else {
                        Transpose.transposeHarmony(e as unknown as Harmony, score, interval, mode, transposeInterval, trKeys,
                            useDoubleSharpsFlats)
                    }
                } else if (e.isFretDiagram() && transposeChordNames) {
                    Transpose.transposeFretDiagram(e as unknown as FretDiagram, score, interval, mode, transposeInterval, trKeys,
                        useDoubleSharpsFlats)
                } else if (e.isKeySig() && mode !== TransposeMode.DIATONICALLY && trKeys) {
                    // TODO: this currently is disabled in dialog
                    // if we enabled it, then it will need work
                    // probably the code should look more like the range selection code
                    const ks = e as unknown as KeySig
                    if (!ks.isAtonal()) {
                        const key = st.key(ks.tick())
                        const cKey = st.concertKey(ks.tick())
                        const ke = ks.keySigEvent().clone()
                        ke.setConcertKey(cKey)
                        ke.setKey(key)
                        score.undo(new ChangeKeySig(ks, ke, ks.showCourtesy()))
                    }
                }
            }
        }

        //--------------------------
        // process range selection
        //--------------------------

        const sl: Staff[] = []
        for (let staffIdx = selection.staffStart(); staffIdx < selection.staffEnd(); ++staffIdx) {
            const s = score.staff(staffIdx)!
            if (s.staffType(new Fraction(0, 1)).group() === StaffGroup.PERCUSSION) { // ignore percussion staff
                continue
            }
            const primaryStaff = s.primaryStaff()
            if (primaryStaff && primaryStaff.staffType(new Fraction(0, 1)).group() === StaffGroup.PERCUSSION) {
                continue
            }
            if (sl.includes(s)) {
                continue
            }
            let alreadyThere = false
            for (const s2 of sl) {
                if (s2 === s || (s2.links() && s2.links()!.includes(s))) {
                    alreadyThere = true
                    break
                }
            }
            if (!alreadyThere) {
                sl.push(s)
            }
        }
        const tracks: track_idx_t[] = []
        for (const s of sl) {
            const idx = s.idx() * VOICES
            for (let i = 0; i < VOICES; ++i) {
                if (score.selectionFilter().canSelectVoice(i)) {
                    tracks.push(idx + i)
                }
            }
        }

        let s1 = selection.startSegment()
        if (!s1) {
            return result
        }
        // if range start on mmRest, get the actual segment instead
        if (s1.measure()!.isMMRest()) {
            s1 = score.tick2segment(s1.tick(), true, s1.segmentType(), false)!
        }
        // if range starts with first CR of measure
        // then start looping from very beginning of measure
        // so we include key signature and can transpose that if requested
        if (s1.rtick().isZero()) {
            s1 = s1.measure()!.first()!
        }
        const s2 = selection.endSegment()
        for (let segment: Segment | null = s1; segment && segment !== s2; segment = segment.next1()) {
            if (!segment.enabled()) {
                continue
            }
            for (const track of tracks) {
                if (score.staff(Math.trunc(track / VOICES))!.staffType(s1.tick()).group() === StaffGroup.PERCUSSION) {
                    continue
                }
                const e = segment.element(track)
                if (!e) {
                    continue
                }

                if (e.isChord()) {
                    const chord = e as unknown as Chord
                    const nl = [...chord.notes()]
                    for (let noteIdx = 0; noteIdx < nl.length; ++noteIdx) {
                        if (!score.selectionFilter().canSelectNoteIdx(noteIdx, nl.length, selection.rangeContainsMultiNoteChords())) {
                            continue
                        }
                        const note = nl[noteIdx]
                        if (!Transpose.transposeNote(note, mode, transposeInterval, trKeys, useDoubleSharpsFlats, interval)) {
                            result = false
                        }
                    }
                    for (const g of chord.graceNotes()) {
                        for (const n of g.notes()) {
                            if (!Transpose.transposeNote(n, mode, transposeInterval, trKeys, useDoubleSharpsFlats, interval)) {
                                result = false
                            }
                        }
                    }
                } else if (e.isKeySig() && trKeys && mode !== TransposeMode.DIATONICALLY) {
                    const ks = e as unknown as KeySig
                    const tick = segment.tick()
                    const startKey = tick.eq(s1.tick()) && !isFirstSystemKeySig(ks)
                    const addKey = ks.isChange()
                    if ((startKey || addKey) && !ks.isAtonal()) {
                        const staff = ks.staff()!
                        const oKey = ks.concertKey()
                        const nKey = Transpose.transposeKey(oKey, interval)
                        const ke = ks.keySigEvent().clone()
                        // don't transpose instrument change KS, was automagically translated when precedent KS was changed
                        if (!ke.forInstrumentChange() || startKey) {
                            ke.setConcertKey(nKey)
                        }
                        // undoChangeKey handles linked staves/parts and generating new keysigs as needed
                        // it always sets the keysig non-generated
                        // so only call it when needed
                        score.undoChangeKeySig(staff, tick, ke)
                    }
                }
            }
            if (transposeChordNames
                && (score.selectionFilter().isFiltered(ElementsSelectionFilterTypes.CHORD_SYMBOL)
                    || score.selectionFilter().isFiltered(ElementsSelectionFilterTypes.FRET_DIAGRAM))) {
                for (const e of segment.annotations()) {
                    if ((!e.isHarmony() && !e.isFretDiagram()) || (!tracks.includes(e.track()))) {
                        continue
                    }

                    if (e.isHarmony()) {
                        Transpose.transposeHarmony(e as unknown as Harmony, score, interval, mode, transposeInterval, trKeys,
                            useDoubleSharpsFlats)
                    }

                    if (e.isFretDiagram()) {
                        Transpose.transposeFretDiagram(e as unknown as FretDiagram, score, interval, mode, transposeInterval, trKeys,
                            useDoubleSharpsFlats)
                    }
                }
            }
        }
        //
        // create missing key signatures
        //
        if (trKeys && (mode !== TransposeMode.DIATONICALLY) && s1.tick().isZero()) {
            for (const track of tracks) {
                if (track % VOICES) {
                    continue
                }
                const seg = score.firstMeasure()!.undoGetSegmentR(SegmentType.KeySig, new Fraction(0, 1))
                const e = seg.element(track)
                let ks = e && e.isKeySig() ? e as unknown as KeySig : null
                if (!ks) {
                    ks = itemFactories.createItem!(ElementType.KEYSIG, seg) as KeySig // Factory::createKeySig
                    ks.setTrack(track)
                    const nKey = Transpose.transposeKey(Key.C, interval)
                    ks.setKey(nKey)
                    ks.setParent(seg)
                    score.undoAddElement(ks)
                }
            }
        }
        return result
    }
    static transposeKey(key: Key, interval: Interval, prefer: PreferSharpFlat = PreferSharpFlat.NONE): Key {
        const keyAsTpc = key2Tpc(key)
        const newKey = tpc2Key(Transpose.transposeTpc(keyAsTpc, interval, false))

        // ignore prefer for octave transposing instruments
        if (interval.chromatic % PITCH_DELTA_OCTAVE === 0 && interval.diatonic % STEP_DELTA_OCTAVE === 0) {
            prefer = PreferSharpFlat.NONE
        }
        return clampKey(newKey, prefer)
    }

    /** transposes a pitch spelling by a given interval, option to enharmonically reduce tpc using double alterations */
    static transposeTpc(tpc: number, interval: Interval, useDoubleSharpsFlats: boolean): number {
        const deltaTpc = (interval.chromatic * TPC_DELTA_SEMITONE) - (interval.diatonic * TPC_DELTA_ENHARMONIC)
        if (!tpcIsValid(tpc) || deltaTpc === 0) { // perfect unison & perfect octave
            return tpc
        }
        return clampEnharmonic(tpc + deltaTpc, useDoubleSharpsFlats)
    }

    /** sets the tpc2 of the notes for the transposition of the chord's staff at tick (used by paste) */
    static transposeChord(c: Chord, tick: Fraction): void {
        const dstTranspose = c.staff()!.transpose(tick)

        if (dstTranspose.isZero()) {
            for (const n of c.notes()) {
                n.setTpc2(n.tpc1())
            }
        } else {
            dstTranspose.flip()
            for (const n of c.notes()) {
                n.setTpc2(Transpose.transposeTpc(n.tpc1(), dstTranspose, true))
            }
        }
    }

    /** key - -7(Cb) - +7(C#) */
    static transposeKeys(score: Score, staffStart: staff_idx_t, staffEnd: staff_idx_t, ts: Fraction, tickEnd: Fraction, flip: boolean): void {
        let tickStart = ts
        if (tickStart.lt(new Fraction(0, 1))) { // -1 and 0 are valid values to indicate start of score
            tickStart = new Fraction(0, 1)
        }
        for (let staffIdx = staffStart; staffIdx < staffEnd; ++staffIdx) {
            const st = score.staff(staffIdx)!
            if (st.staffType(tickStart).group() === StaffGroup.PERCUSSION) {
                continue
            }

            let createKey = tickStart.isZero()
            for (let s = score.firstSegment(SegmentType.KeySig); s; s = s.next1(SegmentType.KeySig)) {
                if (!s.enabled() || s.tick().lt(tickStart)) {
                    continue
                }
                if (!tickEnd.eq(new Fraction(-1, 1)) && s.tick().ge(tickEnd)) {
                    break
                }
                const e = s.element(staffIdx * VOICES)
                const ks = e && e.isKeySig() ? e as unknown as KeySig : null
                if (!ks || ks.generated()) {
                    continue
                }
                if (!ks.isAtonal()) {
                    const v = st.part().instrument(s.tick()).transpose().clone()
                    const ke = st.keySigEvent(s.tick()).clone()
                    const pref = ks.part()!.preferSharpFlat()
                    let nKey = ke.concertKey()
                    if (flip && !v.isZero()) {
                        v.flip()
                        nKey = Transpose.transposeKey(ke.concertKey(), v, pref)
                    }

                    ke.setKey(nKey)
                    score.undo(new ChangeKeySig(ks, ke, ks.showCourtesy()))
                }
                if (s.tick().isZero()) {
                    createKey = false
                }
            }
            const firstMeasure = score.firstMeasure()
            if (createKey && firstMeasure) {
                const seg = firstMeasure.undoGetSegmentR(SegmentType.KeySig, new Fraction(0, 1))
                seg.setHeader(true)
                const ks = itemFactories.createItem!(ElementType.KEYSIG, seg) as KeySig // Factory::createKeySig
                ks.setTrack(staffIdx * VOICES)
                const v = ks.part()!.instrument().transpose().clone()
                let cKey: Key = Key.C
                let nKey: Key = cKey
                if (flip) {
                    if (!v.isZero()) {
                        v.flip()
                        nKey = Transpose.transposeKey(Key.C, v, ks.part()!.preferSharpFlat())
                    }
                } else {
                    cKey = Transpose.transposeKey(Key.C, v)
                    nKey = cKey
                }
                ks.setKey(cKey, nKey)
                ks.setParent(seg)
                score.undoAddElement(ks)
            }
        }
    }

    static transposeSemitone(score: Score, step: number): void {
        if (step === 0) {
            return
        }

        const dir = step > 0 ? TransposeDirection.UP : TransposeDirection.DOWN

        if (!Transpose.transpose(score, TransposeMode.BY_INTERVAL, dir, Key.C, 1, true, true, false)) {
            // C++ LOGD("Score::transposeSemitone: failed")
        } else {
            score.setSelectionChanged(true)
        }
    }

    static transposeDiatonicAlterations(score: Score, direction: TransposeDirection): void {
        // Transpose current selection diatonically (up/down) while keeping degree alterations
        // Note: Score::transpose() absolutely requires valid selection before invocation.
        if (!score.selection().isNone()) {
            Transpose.transpose(score, TransposeMode.DIATONICALLY, direction, Key.C, 1, true, true, true)
            // TODO(port): score->setPlayNote(true) (For when selection is a single note, also playback that note)
            score.setSelectionChanged(true) // This will update the on-screen keyboard
        }
    }

    static transpositionChanged(score: Score, part: Part, oldV: Interval, tickStart = new Fraction(0, 1),
        tickEnd = new Fraction(-1, 1)): void {
        if (tickStart.eq(new Fraction(-1, 1))) {
            tickStart = new Fraction(0, 1)
        }

        // transpose keys first
        const scores = new Set<Score>()
        for (const ls of part.staff(0)!.staffList()) {
            // TODO: special handling for linked staves within a score
            // could be useful for capo
            const lsScore = ls.score()
            if (scores.has(lsScore)) {
                continue
            }
            scores.add(lsScore)
            const lp = ls.part()
            if (!lsScore.style().styleB(Sid.concertPitch)) {
                Transpose.transposeKeys(lsScore, Math.trunc(lp.startTrack() / VOICES), Math.trunc(lp.endTrack() / VOICES), tickStart,
                    tickEnd, true)
            }
        }

        // now transpose notes and chord symbols
        for (let s = score.firstSegment(Segment.CHORD_REST_OR_TIME_TICK_TYPE); s; s = s.next1(Segment.CHORD_REST_OR_TIME_TICK_TYPE)) {
            if (s.tick().lt(tickStart)) {
                continue
            }
            if (!tickEnd.eq(new Fraction(-1, 1)) && s.tick().ge(tickEnd)) {
                break
            }
            const v = part.staff(0)!.transpose(s.tick()).clone()
            v.flip()
            const diffV = new Interval(oldV.diatonic + v.diatonic, oldV.chromatic + v.chromatic)
            for (const st of part.staves()) {
                if (st.staffType(tickStart).group() === StaffGroup.PERCUSSION) {
                    continue
                }
                const t1 = st.idx() * VOICES
                const t2 = t1 + VOICES
                for (let track = t1; track < t2; ++track) {
                    const e = s.element(track)
                    if (e && e.isChord()) {
                        const c = e as unknown as Chord
                        for (const gc of c.graceNotes()) {
                            for (const n of gc.notes()) {
                                const tpc = Transpose.transposeTpc(n.tpc1(), v, true)
                                n.undoChangeProperty(Pid.TPC2, tpc)
                            }
                        }
                        for (const n of c.notes()) {
                            const tpc = Transpose.transposeTpc(n.tpc1(), v, true)
                            n.undoChangeProperty(Pid.TPC2, tpc)
                        }
                    }
                    // find chord symbols
                    for (const element of s.annotations()) {
                        if (element.track() !== track || !element.isHarmony()) {
                            continue
                        }
                        const h = element as unknown as Harmony
                        for (const scoreElement of h.linkList()) {
                            if (!scoreElement.style().styleB(Sid.concertPitch)) {
                                Transpose.undoTransposeHarmony(score, scoreElement as unknown as Harmony, diffV, false)
                            }
                        }
                    }
                }
            }
        }
    }

    /** C++ transpositionChanged(Score*, Part*, const Fraction& instrumentTick, Interval oldTransposition) */
    static transpositionChangedAt(score: Score, part: Part, instrumentTick: Fraction, oldTransposition: Interval): void {
        const tickStart = instrumentTick
        let tickEnd = new Fraction(-1, 1)

        const instruments = part.instruments()
        const mainInstrumentEndIt = instruments.upperBound(tickStart.ticks())
        if (mainInstrumentEndIt !== instruments.size()) {
            tickEnd = Fraction.fromTicks(instruments.keyAt(mainInstrumentEndIt))
        }

        Transpose.transpositionChanged(score, part, oldTransposition, tickStart, tickEnd)
    }

    /** keysig - -7(Cb) - +7(C#) */
    private static keydiff2Interval(oKey: Key, nKey: Key, dir: TransposeDirection): Interval {
        let diatonic = tpc2step(key2Tpc(nKey)) - tpc2step(key2Tpc(oKey))
        let chromatic = Math.trunc(((nKey - oKey) + (diatonic * TPC_DELTA_ENHARMONIC)) / TPC_DELTA_SEMITONE)

        if ((dir === TransposeDirection.CLOSEST && chromatic > 6)
            || (dir === TransposeDirection.DOWN && chromatic > 0)) {
            diatonic -= 7
            chromatic -= 12
        } else if ((dir === TransposeDirection.CLOSEST && chromatic < -6)
                   || (dir === TransposeDirection.UP && chromatic < 0)) {
            diatonic += 7
            chromatic += 12
        }

        return new Interval(diatonic, chromatic)
    }

    private static transposeNote(note: Note, mode: TransposeMode, transposeInterval: number, trKeys: boolean,
        useDoubleSharpsFlats: boolean, interval: Interval): boolean {
        if (mode === TransposeMode.DIATONICALLY) {
            return note.transposeDiatonic(transposeInterval, trKeys, useDoubleSharpsFlats)
        }

        return note.transpose(interval, useDoubleSharpsFlats)
    }

    private static transposeHarmony(harmony: Harmony, score: Score, interval: Interval, mode: TransposeMode, transposeInterval: number,
        trKeys: boolean, useDoubleSharpsFlats: boolean): void {
        // TODO also source interval should reflect modified key (f.ex. by prefer flat)
        // now we calculate interval from first pitched staff
        // but even if it were right staff, this may differ each tick (actual key signature)
        // we can  add something like "concert pitch rootTpc" to harmony definition, or ...
        const kv = harmony.staff()!.transpose(harmony.tick())
        const iv = harmony.part()!.instrument(harmony.tick()).transpose()
        const hInterval = new Interval(interval.diatonic - kv.diatonic + iv.diatonic, interval.chromatic - kv.chromatic + iv.chromatic)

        // undoTransposeHarmony does not do links
        // because it is also used to handle transposing instruments
        // and score / parts could be in different concert pitch states
        for (const se of harmony.linkList()) {
            const h = se as unknown as Harmony
            if (mode === TransposeMode.DIATONICALLY) {
                Transpose.undoTransposeHarmonyDiatonic(score, h, transposeInterval, useDoubleSharpsFlats, trKeys)
            } else {
                Transpose.undoTransposeHarmony(score, h, hInterval, useDoubleSharpsFlats)
            }
        }
        score.rebuildFretBox()
    }

    private static transposeFretDiagram(diagram: FretDiagram, score: Score, interval: Interval, mode: TransposeMode,
        transposeInterval: number, trKeys: boolean, useDoubleSharpsFlats: boolean): void {
        let harmony = diagram.harmony()

        if (harmony) {
            Transpose.transposeHarmony(harmony, score, interval, mode, transposeInterval, trKeys, useDoubleSharpsFlats)

            const availableDiagrams = diagram.patternsFromHarmony(harmony.plainText())
            if (!availableDiagrams.length) {
                diagram.undoFretClear()
                MScore.setError(MsError.TRANSPOSE_NO_FRET_DIAGRAM, true)
                return
            }
            score.undo(new FretDataChange(diagram, harmony.plainText()))

            score.rebuildFretBox()
            return
        }

        // No chord symbol attached. Create harmony from diagram, transpose it, then use the new harmony to update the fret diagram
        const pattern = diagram.patternFromDiagram()
        const names = diagram.harmoniesFromPattern(pattern)
        if (!names.length) {
            diagram.undoFretClear()
            MScore.setError(MsError.TRANSPOSE_NO_FRET_DIAGRAM, true)
            return
        }

        let tick = new Fraction(0, 1)
        const seg = diagram.segment()
        if (seg) {
            tick = seg.tick()
        }
        const key = !diagram.staff() ? Key.C : diagram.staff()!.key(tick)

        const name = Transpose.findBestEnharmonicFit(names, key, score.style())

        diagram.setHarmony(name)
        harmony = diagram.harmony()
        if (!harmony) {
            return
        }

        // Transpose harmony without undo
        const kv = harmony.staff()!.transpose(harmony.tick())
        const iv = harmony.part()!.instrument(harmony.tick()).transpose()
        const hInterval = new Interval(interval.diatonic - kv.diatonic + iv.diatonic, interval.chromatic - kv.chromatic + iv.chromatic)

        for (const info of harmony.chords()) {
            if (mode === TransposeMode.DIATONICALLY) {
                info.setRootTpc(Transpose.transposeTpcDiatonicByKey(info.rootTpc(), transposeInterval, key, trKeys, useDoubleSharpsFlats))
                info.setBassTpc(Transpose.transposeTpcDiatonicByKey(info.bassTpc(), transposeInterval, key, trKeys, useDoubleSharpsFlats))
            } else {
                info.setRootTpc(Transpose.transposeTpc(info.rootTpc(), hInterval, useDoubleSharpsFlats))
                info.setBassTpc(Transpose.transposeTpc(info.bassTpc(), hInterval, useDoubleSharpsFlats))
            }
        }
        harmony.setXmlText(harmony.harmonyName())

        const availableDiagrams = diagram.patternsFromHarmony(harmony.plainText())
        if (!availableDiagrams.length) {
            diagram.undoFretClear()
            MScore.setError(MsError.TRANSPOSE_NO_FRET_DIAGRAM, true)
            return
        }
        score.undo(new FretDataChange(diagram, harmony.plainText()))

        diagram.remove(harmony)

        score.rebuildFretBox()
    }

    private static findBestEnharmonicFit(notes: readonly string[], key: Key, style: MStyle): string {
        const tpcs: number[] = []
        const harmonySpelling = style.styleV(Sid.chordSymbolSpelling) as NoteSpellingType
        const harmonyCase = NoteCaseType.AUTO
        for (const note of notes) {
            const tpc = convertNote(note, harmonySpelling, harmonyCase).tpc
            tpcs.push(tpc)
        }

        const tpc = bestEnharmonicFit(tpcs, key)

        if (tpc === Tpc.TPC_INVALID) {
            return notes[0]
        }

        const note = tpc2name(tpc, harmonySpelling, harmonyCase)

        return note
    }

    /**
     * returns the tpc diatonically transposed by steps, using degrees of given key
     * option to keep any alteration tpc had with respect to unaltered corresponding degree of key
     * option to enharmonically reduce tpc using double alterations
     */
    static transposeTpcDiatonicByKey(tpc: number, steps: number, key: Key, keepAlteredDegrees: boolean,
        useDoubleSharpsFlats: boolean): number {
        if (!tpcIsValid(tpc)) {
            return tpc
        }

        // get step for tpc with alteration for key
        let [step, alter] = tpc2stepByKey(tpc, key)

        // transpose step and get tpc for step/key
        step += steps
        let newTpc = step2tpcByKey(step, key)

        // if required, apply alteration to new tpc
        if (keepAlteredDegrees) {
            newTpc += alter * TPC_DELTA_SEMITONE
        }

        // check results are in ranges
        return clampEnharmonic(newTpc, useDoubleSharpsFlats)
    }

    static undoTransposeHarmony(score: Score, harmony: Harmony, interval: Interval, doubleSharpFlat = true): void {
        score.undo(new TransposeHarmony(harmony, interval, doubleSharpFlat))
    }

    private static undoTransposeHarmonyDiatonic(score: Score, harmony: Harmony, interval: number, doubleSharpFlat: boolean,
        transposeKeys: boolean): void {
        score.undo(new TransposeHarmonyDiatonic(harmony, interval, doubleSharpFlat, transposeKeys))
    }
}

export class TransposeHarmony extends UndoCommand {
    private m_harmony: Harmony
    private m_interval: Interval
    private m_useDoubleSharpsFlats: boolean

    constructor(h: Harmony, interval: Interval, doubleSharpsFlats = true) {
        super()
        this.m_harmony = h
        this.m_interval = interval.clone()
        this.m_useDoubleSharpsFlats = doubleSharpsFlats
    }

    override type(): CommandType { return CommandType.TransposeHarmony }
    override name(): string { return 'TransposeHarmony' }
    override objectItems(): EngravingObject[] { return [this.m_harmony] }

    protected override flip(_ed: EditData | null): void {
        this.m_harmony.realizedHarmony().setDirty(true) // harmony should be re-realized after transposition

        for (const info of this.m_harmony.chords()) {
            info.setRootTpc(Transpose.transposeTpc(info.rootTpc(), this.m_interval, this.m_useDoubleSharpsFlats))
            info.setBassTpc(Transpose.transposeTpc(info.bassTpc(), this.m_interval, this.m_useDoubleSharpsFlats))
        }

        this.m_harmony.setXmlText(this.m_harmony.harmonyName())
        this.m_harmony.triggerLayout()
        this.m_interval.flip()
    }
}

export class TransposeHarmonyDiatonic extends UndoCommand {
    private m_harmony: Harmony
    private m_interval: number
    private m_useDoubleSharpsFlats: boolean
    private m_transposeKeys: boolean

    constructor(h: Harmony, interval: number, useDoubleSharpsFlats: boolean, transposeKeys: boolean) {
        super()
        this.m_harmony = h
        this.m_interval = interval
        this.m_useDoubleSharpsFlats = useDoubleSharpsFlats
        this.m_transposeKeys = transposeKeys
    }

    override type(): CommandType { return CommandType.TransposeHarmony }
    override name(): string { return 'TransposeHarmonyDiatonic' }
    override objectItems(): EngravingObject[] { return [this.m_harmony] }

    protected override flip(_ed: EditData | null): void {
        this.m_harmony.realizedHarmony().setDirty(true) // harmony should be re-realized after transposition

        let tick = new Fraction(0, 1)
        const seg = this.m_harmony.getParentSeg()
        if (seg) {
            tick = seg.tick()
        }
        const key = !this.m_harmony.staff() ? Key.C : this.m_harmony.staff()!.key(tick)

        for (const info of this.m_harmony.chords()) {
            info.setRootTpc(Transpose.transposeTpcDiatonicByKey(info.rootTpc(), this.m_interval, key, this.m_transposeKeys,
                this.m_useDoubleSharpsFlats))
            info.setBassTpc(Transpose.transposeTpcDiatonicByKey(info.bassTpc(), this.m_interval, key, this.m_transposeKeys,
                this.m_useDoubleSharpsFlats))
        }

        this.m_harmony.setXmlText(this.m_harmony.harmonyName())
        this.m_harmony.triggerLayout()

        this.m_interval *= -1
    }
}
