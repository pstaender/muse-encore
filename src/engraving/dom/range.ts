/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/range.h/.cpp: TrackList (the elements of one track of a range, with rests accumulated and
 * tied chords combined) and ScoreRange (all tracks, spanners, annotations, ties into the range, barlines, breaks,
 * repeats, spacers, jumps and markers of a range of segments), used to rewrite measures (Score::rewriteMeasures).
 *
 * The C++ destructors only delete the copies; here the garbage collector does that.
 */

import { Fraction } from '../types/fraction'
import { BarLineType, DurationType, ElementType, LayoutBreakType, MarkerType, VOICES, staff2track, type staff_idx_t, type track_idx_t } from '../types/types'
import { Factory } from './factory'
import { MScore, MsError } from './mscore'
import { Pid } from './property'
import { TDuration, toDurationList } from './durationtype'
import { Rest } from './rest'
import { Segment, SegmentType } from './segment'
import { SpacerType } from './measure'
import { SpannerAnchor } from './spanner'
import { VoltaType } from './volta'
import { searchTieNote, skipTuplet } from './utils'
import { scoreDummy } from '../compat/dummyelement'
import type { BarLine } from './barline'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { DurationElement } from './durationelement'
import type { EngravingItem } from './engravingitem'
import type { Marker } from './marker'
import type { Measure } from './measure'
import type { MeasureRepeat } from './measurerepeat'
import type { Note } from './note'
import type { Score } from './score'
import type { Slur } from './slur'
import type { Spacer } from './spacer'
import type { Spanner } from './spanner'
import type { Tie } from './tie'
import type { Tuplet } from './tuplet'
import type { Volta } from './volta'
import type { Staff } from './staff'
import { Excerpt } from './excerpt'

/** C++ TrackList::ClonedChordMap (std::map<Chord*, Chord*>) */
type ClonedChordMap = Map<Chord, Chord>

// ---------------------------------------------------------
//   clonedNote
// ---------------------------------------------------------

function clonedNote(srcNote: Note | null, cChordMap: ClonedChordMap): Note | null {
    if (!srcNote) {
        return null
    }
    let cNote: Note | null = null
    const srcChord = srcNote.chord()
    const cChord = cChordMap.get(srcChord)

    if (srcChord && cChord) {
        let noteSrcPosition = 0
        let noteClonedPosition = 0
        let noteFound = false
        // We presume notes where created in the same order in the srcChord and clonedChord
        // Note position in sourceChord
        for (const n of srcChord.notes()) {
            ++noteSrcPosition
            if (srcNote === n) {
                noteFound = true
                break
            }
        }
        if (noteFound) {
            // Note in clonedChord
            for (const n of cChord.notes()) {
                ++noteClonedPosition
                if (noteClonedPosition === noteSrcPosition) {
                    cNote = n
                    break
                }
            }
        }
    }
    return cNote
}

// ---------------------------------------------------------
//   cloneAndRebuildSpanners
// ---------------------------------------------------------

function cloneAndRebuildSpanners(cChordMap: ClonedChordMap): void {
    // Clone Spanners from Chords
    for (const srcChord of cChordMap.keys()) {
        //
        // Add For and Back Note's spanners to cloned Note
        //
        for (const srcNote of srcChord.notes()) {
            const cNote = clonedNote(srcNote, cChordMap)

            if (cNote) {
                for (const sp of srcNote.spannerFor()) {
                    if (sp.isGuitarBend() || sp.isGlissando()) {
                        const csp = sp.clone() as Spanner

                        const endClonedNote = clonedNote(sp.endElement() as Note | null, cChordMap)
                        if (endClonedNote) {
                            csp.setNoteSpan(cNote, endClonedNote)
                        }
                        cNote.addSpannerFor(csp)
                    }
                }
                for (const sp of srcNote.spannerBack()) {
                    if (sp.isGuitarBend() || sp.isGlissando()) {
                        const csp = sp.clone() as Spanner
                        const startClonedNote = clonedNote(sp.startElement() as Note | null, cChordMap)

                        if (startClonedNote) {
                            csp.setNoteSpan(startClonedNote, cNote)
                        }
                        cNote.addSpannerBack(csp)
                    }
                }
            }
        }
    }
}

/** C++ Factory::copyRest(const MeasureRepeat&) + Rest::hack_toRestType(): a Rest copy of a measure repeat */
function copyRestOfMeasureRepeat(rm: MeasureRepeat): Rest {
    const r = rm.clone() as Rest
    Object.setPrototypeOf(r, Rest.prototype) // C++ copies the Rest part of the MeasureRepeat (object slicing)
    r.hack_toRestType()
    return r
}

// ---------------------------------------------------------
//   TrackList
// ---------------------------------------------------------

export class TrackList {
    private m_elements: EngravingItem[] = []
    private m_duration = new Fraction(0, 1)
    private m_range: ScoreRange
    private m_track: track_idx_t = 0
    private m_clonedChord: ClonedChordMap = new Map()

    constructor(r: ScoreRange) {
        this.m_range = r
    }

    // std::vector<EngravingItem*> interface
    elements(): readonly EngravingItem[] { return this.m_elements }
    size(): number { return this.m_elements.length }
    empty(): boolean { return this.m_elements.length === 0 }
    at(i: number): EngravingItem { return this.m_elements[i] }
    back(): EngravingItem { return this.m_elements[this.m_elements.length - 1] }

    ticks(): Fraction { return this.m_duration }
    range(): ScoreRange { return this.m_range }

    track(): track_idx_t { return this.m_track }
    setTrack(val: track_idx_t): void { this.m_track = val }

    // ---------------------------------------------------------
    //   appendTuplet
    // ---------------------------------------------------------

    private appendTuplet(srcTuplet: Tuplet, dstTuplet: Tuplet): void {
        for (const de of srcTuplet.elements()) {
            const e = de.clone() as DurationElement
            dstTuplet.add(e)
            if (de.isTuplet()) {
                const st = de as unknown as Tuplet
                const dt = e as unknown as Tuplet
                this.appendTuplet(st, dt)
            } else if (de.explicitParent() && de.explicitParent()!.isSegment()) {
                const seg = de.explicitParent() as unknown as Segment
                for (const ee of seg.annotations()) {
                    const addSysObject = ee.systemFlag() && !ee.isLinked() && ee.track() === 0 && e.track() === 0
                    if (addSysObject || (!ee.systemFlag() && ee.track() === e.track())) {
                        this.m_range.m_annotations.push({ tick: e.tick(), e: ee.clone() })
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   combineTuplet
    // ---------------------------------------------------------

    private combineTuplet(dst: Tuplet, src: Tuplet): void {
        dst.setTicks(dst.ticks().times(new Fraction(2, 1)))
        dst.setBaseLen(dst.baseLen().shift(-1))

        // try to combine tie'd notes
        let idx = 0
        const dstBack = dst.elements()[dst.elements().length - 1]
        if (dstBack.isChord() && src.elements()[0].isChord()) {
            const chord = src.elements()[0] as unknown as Chord
            let akkumulateChord = true
            for (const n of chord.notes()) {
                if (!n.tieBackNonPartial() || !n.tieBack()!.generated()) {
                    akkumulateChord = false
                    break
                }
            }
            if (akkumulateChord) {
                const bc = dstBack as unknown as Chord
                bc.setTicks(bc.ticks().plus(chord.ticks()))

                // forward ties
                let i = 0
                for (const n of bc.notes()) {
                    n.setTieFor(chord.notes()[i].tieFor())
                    ++i
                }
                idx = 1 // skip first src element
            }
        }

        for (; idx < src.elements().length; ++idx) {
            const de = src.elements()[idx]
            const e = de.clone() as DurationElement
            dst.add(e)
            if (de.isTuplet()) {
                const st = de as unknown as Tuplet
                const dt = e as unknown as Tuplet
                this.appendTuplet(st, dt)
            }
        }
    }

    // ---------------------------------------------------------
    //   append
    // ---------------------------------------------------------

    private append(e: EngravingItem): void {
        if (e.isDurationElement()) {
            this.m_duration = this.m_duration.plus((e as unknown as DurationElement).ticks())

            const accumulateRest = e.isRest() && !this.empty() && this.back().isRest()
            const s = accumulateRest ? (e as unknown as Rest).segment() : null

            if (s && !s.score().isSpannerStartEnd(s.tick(), e.track()) && !s.annotations().length) {
                // akkumulate rests
                const rest = this.back() as unknown as Rest
                let du = rest.ticks()
                du = du.plus((e as unknown as Rest).ticks())
                rest.setTicks(du)
            } else {
                let element: EngravingItem | null = null
                if (e.isTuplet()) {
                    const src = e as unknown as Tuplet
                    if (src.generated() && !this.empty() && this.back().isTuplet()) {
                        const b = this.back() as unknown as Tuplet
                        this.combineTuplet(b, src)
                    } else {
                        element = e.clone()
                        const dst = element as unknown as Tuplet
                        this.appendTuplet(src, dst)
                    }
                } else {
                    element = e.clone()
                    const src = e as unknown as ChordRest
                    const s1 = src.segment()
                    for (const ee of s1.annotations()) {
                        const addSysObject = ee.systemFlag() && !ee.isLinked() && ee.track() === 0 && e.track() === 0
                        if (addSysObject || (!ee.systemFlag() && ee.track() === e.track())) {
                            this.m_range.m_annotations.push({ tick: s1.tick(), e: ee.clone() })
                        }
                    }
                    if (e.isChord()) {
                        const chord = e as unknown as Chord

                        // Map between Chords and clonned chords
                        if (!this.m_clonedChord.has(chord)) {
                            this.m_clonedChord.set(chord, element as unknown as Chord)
                        }

                        let akkumulateChord = true
                        for (const n of chord.notes()) {
                            if (!n.tieBackNonPartial() || !n.tieBack()!.generated()) {
                                akkumulateChord = false
                                break
                            }
                        }
                        if (akkumulateChord && !this.empty() && this.back().isChord()) {
                            const bc = this.back() as unknown as Chord
                            const du = bc.ticks().plus(chord.ticks())
                            bc.setTicks(du)

                            // forward ties
                            let idx = 0
                            for (const n of bc.notes()) {
                                n.setTieFor(chord.notes()[idx].tieFor())
                                ++idx
                            }
                            element = null
                            this.m_clonedChord.delete(chord)
                        }
                    }
                }
                if (element) {
                    element.setSelected(false)
                    this.m_elements.push(element)
                }
            }
        } else {
            const c = e.clone()
            c.resetExplicitParent()
            this.m_elements.push(c)
        }
    }

    // ---------------------------------------------------------
    //   appendGap
    // ---------------------------------------------------------

    appendGap(du: Fraction, score: Score): void {
        if (du.isZero()) {
            return
        }
        const e = this.empty() ? null : this.back()
        if (e && e.isRest()) {
            const rest = this.back() as unknown as Rest
            let dd = rest.ticks()
            dd = dd.plus(du)
            this.m_duration = this.m_duration.plus(du)
            rest.setTicks(dd)
        } else {
            const rest = Factory.createItem(ElementType.REST, scoreDummy(score).segment()) as Rest
            rest.setTicks(du)
            this.m_elements.push(rest)
            this.m_duration = this.m_duration.plus(du)
        }
    }

    // ---------------------------------------------------------
    //   truncate
    //    reduce len of last gap by f
    // ---------------------------------------------------------

    truncate(f: Fraction): boolean {
        if (this.empty()) {
            return true
        }
        const e = this.back()
        if (!e.isRest()) {
            return false
        }
        const r = e as unknown as Rest
        if (r.ticks().lt(f)) {
            return false
        }
        if (r.ticks().eq(f)) {
            this.m_elements.pop()
        } else {
            r.setTicks(r.ticks().minus(f))
        }
        this.m_duration = this.m_duration.minus(f)
        return true
    }

    // ---------------------------------------------------------
    //   read
    // ---------------------------------------------------------

    read(fs: Segment, es: Segment): void {
        let tick = fs.tick()
        this.m_clonedChord.clear()

        let s: Segment | null
        for (s = fs; s && (s !== es); s = s.next1()) {
            if (!s.enabled()) {
                continue
            }
            const e = s.element(this.m_track)
            if (!e || e.generated()) {
                for (const ee of s.annotations()) {
                    if (ee.systemFlag() && ee.track() !== 0) {
                        // Only process the top system object
                        continue
                    }
                    if (ee.track() === this.m_track) {
                        this.m_range.m_annotations.push({ tick: s.tick(), e: ee.clone() })
                    }
                }
                continue
            }
            if (e.isMeasureRepeat()) {
                // TODO: copy previous measure contents?
                const rm = e as unknown as MeasureRepeat
                const r = copyRestOfMeasureRepeat(rm)
                // TODO(port): r->reset() (EngravingItem::reset: resetting the user offsets/placement)
                this.append(r)
                tick = tick.plus(r.ticks())
            } else if (e.isChordRest()) {
                let de = e as unknown as DurationElement
                const gap = s.tick().minus(tick)
                if (de.tuplet()) {
                    const t = de.topTuplet()!
                    s = skipTuplet(t) // continue with first chord/rest after tuplet
                    de = t
                }

                if (gap.isNotZero()) {
                    this.appendGap(gap, e.score())
                    tick = tick.plus(gap)
                }
                this.append(de)
                tick = tick.plus(de.ticks())
            } else if (e.isBarLine()) {
                const bl = e as unknown as BarLine
                if (bl.barLineType() !== BarLineType.NORMAL) {
                    this.append(e)
                }
            } else {
                this.append(e)
            }
        }
        const gap = es.tick().minus(tick)
        if (gap.isNotZero()) {
            this.appendGap(gap, es.score())
        }

        // Clone and rebuild Spanners
        cloneAndRebuildSpanners(this.m_clonedChord)

        //
        // connect ties
        //
        const n = this.size()
        for (let i = 0; i < n; ++i) {
            const e = this.at(i)
            if (!e.isChord()) {
                continue
            }
            const chord = e as unknown as Chord
            for (const n1 of chord.notes()) {
                const tie = n1.tieForNonPartial()
                if (!tie) {
                    continue
                }
                for (let k = i + 1; k < n; ++k) {
                    const ee = this.at(k)
                    if (!ee.isChord()) {
                        continue
                    }
                    const c2 = ee as unknown as Chord
                    for (const n2 of c2.notes()) {
                        if (n1.pitch() === n2.pitch()) {
                            tie.setEndNote(n2)
                            n2.setTieBack(tie)
                            break
                        }
                    }
                    // C++: LOGD("Tied note not found") if not found
                    break
                }
            }
        }
        this.m_clonedChord.clear()
    }

    // ---------------------------------------------------------
    //   writeTuplet
    //    measure - current measure
    //    rest    - available time in measure
    //    (C++ passes measure and rest by reference: here they are in the `pos` object)
    // ---------------------------------------------------------

    private writeTuplet(parent: Tuplet | null, tuplet: Tuplet, pos: { measure: Measure; rest: Fraction }): Tuplet {
        const score = pos.measure.score()
        let dt = tuplet.clone() as Tuplet
        dt.setParent(pos.measure)
        const du = tuplet.ticks()
        if (du.gt(pos.rest)) {
            // we must split the tuplet
            dt.setTicks(du.times(new Fraction(1, 2)))
            dt.setBaseLen(tuplet.baseLen().shift(1))
        }
        if (parent) {
            parent.add(dt)
        }

        for (const e of tuplet.elements()) {
            let duration = e.globalTicks()
            let tt: Tuplet | null = dt
            let ratio = new Fraction(1, 1)
            while (tt) {
                ratio = ratio.times(tt.ratio())
                tt = tt.tuplet()
            }

            let firstpart = true
            while (duration.gt(new Fraction(0, 1))) {
                if (pos.rest.isZero()) {
                    if (pos.measure.nextMeasure()) {
                        pos.measure = pos.measure.nextMeasure()!
                        pos.rest = pos.measure.ticks()
                        if (e !== tuplet.elements()[tuplet.elements().length - 1]) {
                            // create second part of split tuplet
                            dt = dt.clone() as Tuplet
                            dt.setGenerated(true)
                            dt.setParent(pos.measure)
                            let pt = dt
                            while (parent) {
                                const tt1 = parent.clone() as Tuplet
                                tt1.setGenerated(true)
                                tt1.setParent(pos.measure)
                                tt1.add(pt)
                                pt = tt1
                                parent = parent.tuplet()
                            }
                        }
                    } else {
                        throw new Error(`premature end of measure list in track ${this.m_track}, rest ${duration.numerator()}/${duration.denominator()}`)
                    }
                }
                if (e.isChordRest()) {
                    const dd = (pos.rest.lt(duration) ? pos.rest : duration).times(ratio)
                    const dl = toDurationList(dd, false)
                    for (const k of dl) {
                        const segment = pos.measure.undoGetSegmentR(SegmentType.ChordRest, pos.measure.ticks().minus(pos.rest))
                        const gd = k.fraction().div(ratio)
                        const cr = e.clone() as ChordRest
                        if (!firstpart) {
                            cr.removeMarkings(true)
                        }
                        cr.setScore(score)
                        cr.setTrack(this.m_track)
                        segment.add(cr)
                        cr.setTicks(k.fraction())
                        cr.setDurationType(k)
                        pos.rest = pos.rest.minus(gd)
                        duration = duration.minus(gd)

                        if (cr.isChord()) {
                            for (const note of (cr as unknown as Chord).notes()) {
                                if (!duration.isZero() && !note.tieFor()) {
                                    const tie = Factory.createItem(ElementType.TIE, note) as Tie
                                    tie.setGenerated(true)
                                    note.add(tie)
                                }
                            }
                        }
                        dt.add(cr)
                        firstpart = false
                    }
                } else if (e.isTuplet()) {
                    const tt1 = e as unknown as Tuplet
                    const ttt = this.writeTuplet(dt, tt1, pos)
                    dt = ttt.tuplet()!
                    parent = dt.tuplet()
                    duration = new Fraction(0, 1)
                }
                firstpart = false
            }
        }
        return dt
    }

    // ---------------------------------------------------------
    //   write
    //    rewrite notes into measure list measure
    // ---------------------------------------------------------

    write(score: Score, tick: Fraction): boolean {
        if ((this.m_track % VOICES) && this.size() === 1 && this.at(0).isRest()) { // don’t write rests in voice > 0
            return true
        }
        const wClonedChord: ClonedChordMap = new Map()
        const measure = score.tick2measure(tick)!
        const pos = { measure, rest: measure.endTick().minus(tick) } // C++ m, remains
        let segment: Segment | null = null

        /** C++ checkRest(remains, m, d): go to next measure, if necessary */
        const checkRest = (d: Fraction): boolean => {
            if (pos.rest.isZero()) {
                if (pos.measure.nextMeasure()) {
                    pos.measure = pos.measure.nextMeasure()!
                    pos.rest = pos.measure.ticks()
                } else {
                    // C++: LOGW("premature end of measure list, rest %d/%d", d.numerator(), d.denominator())
                    void d
                    return false
                }
            }
            return true
        }

        for (const e of this.m_elements) {
            if (e.isDurationElement()) {
                let duration = (e as unknown as DurationElement).ticks()
                if (!checkRest(duration)) { // go to next measure, if necessary
                    MScore.setError(MsError.CORRUPTED_MEASURE)
                    return false
                }
                if (duration.gt(pos.rest) && e.isTuplet()) {
                    // experimental: allow tuplet split in the middle
                    if (!duration.eq(pos.rest.times(new Fraction(2, 1)))) {
                        MScore.setError(MsError.CANNOT_SPLIT_TUPLET)
                        return false
                    }
                }
                let firstpart = true
                while (duration.gt(new Fraction(0, 1))) {
                    const m = pos.measure
                    if ((e.isRest() || e.isMeasureRepeat()) && (duration.ge(pos.rest) || e === this.back()) && pos.rest.eq(m.ticks())) {
                        //
                        // handle full measure rest
                        //
                        const seg = m.getSegmentR(SegmentType.ChordRest, m.ticks().minus(pos.rest))
                        if ((this.m_track % VOICES) === 0) {
                            // write only for voice 1
                            const r = new Rest(seg, new TDuration(DurationType.V_MEASURE)) // Factory::createRest(seg, V_MEASURE)
                            // ideally we should be using stretchedLen
                            // but this is not valid during rewrite when adding time signatures
                            // since the time signature has not been added yet
                            r.setTicks(m.ticks())
                            r.setTrack(this.m_track)
                            seg.add(r)
                        }
                        duration = duration.minus(m.ticks())
                        pos.rest = new Fraction(0, 1)
                    } else if (e.isChordRest()) {
                        const du = pos.rest.lt(duration) ? pos.rest : duration
                        const dl = toDurationList(du, e.isChord())
                        if (dl.length === 0) {
                            MScore.setError(MsError.CORRUPTED_MEASURE)
                            return false
                        }
                        for (const k of dl) {
                            segment = m.undoGetSegmentR(SegmentType.ChordRest, m.ticks().minus(pos.rest))
                            const cr = e.clone() as ChordRest
                            if (!firstpart) {
                                cr.removeMarkings(true)
                            }
                            cr.setTrack(this.m_track)
                            cr.setScore(score)
                            const gd = k.fraction()
                            cr.setTicks(gd)
                            cr.setDurationType(k)

                            segment.add(cr)
                            duration = duration.minus(gd)
                            pos.rest = pos.rest.minus(gd)

                            if (cr.isChord()) {
                                const chord = cr as unknown as Chord
                                // Map between Chords and clonned chords
                                if (!wClonedChord.has(e as unknown as Chord)) {
                                    wClonedChord.set(e as unknown as Chord, chord)
                                }

                                const tremolo = chord.tremoloTwoChord()
                                if (!firstpart && tremolo) { // remove partial two-note tremolo
                                    if ((e as unknown as Chord).tremoloTwoChord()!.chord1() === e as unknown as Chord) {
                                        tremolo.setChords(chord, null)
                                    } else {
                                        tremolo.setChords(null, chord)
                                    }
                                    chord.setTremoloTwoChord(null)
                                }
                                for (const note of chord.notes()) {
                                    if (!duration.isZero() && !note.tieFor()) {
                                        const tie = Factory.createItem(ElementType.TIE, note) as Tie
                                        tie.setGenerated(true)
                                        note.add(tie)
                                    }
                                }
                            }
                        }
                    } else if (e.isTuplet()) {
                        this.writeTuplet(null, e as unknown as Tuplet, pos)
                        duration = new Fraction(0, 1)
                    }
                    firstpart = false
                    if (duration.gt(new Fraction(0, 1))) {
                        if (!checkRest(duration)) { // go to next measure, if necessary
                            MScore.setError(MsError.CORRUPTED_MEASURE)
                            return false
                        }
                    }
                }
            } else if (e.isBarLine()) {
                // barlines are restored by ScoreRange::restoreBarLines
            } else if (e.isClef()) {
                const m = pos.measure
                let seg: Segment
                if (pos.rest.eq(m.ticks()) && m.tick().gt(new Fraction(0, 1))) {
                    const pm = m.prevMeasure()!
                    seg = pm.getSegmentR(SegmentType.Clef, pm.ticks())
                } else if (!pos.rest.eq(m.ticks())) {
                    seg = m.getSegmentR(SegmentType.Clef, m.ticks().minus(pos.rest))
                } else {
                    seg = m.getSegmentR(SegmentType.HeaderClef, new Fraction(0, 1))
                }
                const ne = e.clone()
                ne.setScore(score)
                ne.setTrack(this.m_track)
                seg.add(ne)
            } else if (e.isKeySig()) {
                const m = pos.measure
                let seg: Segment
                // No remains -> Next Measure if it does exist
                if (pos.rest.eq(new Fraction(0, 1)) && m.nextMeasure()) {
                    seg = m.nextMeasure()!.getSegmentR(SegmentType.KeySig, new Fraction(0, 1))
                } else {
                    seg = m.getSegmentR(SegmentType.KeySig, new Fraction(0, 1))
                }
                const ne = e.clone()
                ne.setScore(score)
                ne.setTrack(this.m_track)
                seg.add(ne)
            } else {
                const m = pos.measure
                if (!m) {
                    break
                }
                // add the element in its own segment;
                // but KeySig has to be at start of (current) measure

                const seg = m.getSegmentR(Segment.segmentTypeForElement(e.type()), m.ticks().minus(pos.rest))
                const ne = e.clone()
                ne.setScore(score)
                ne.setTrack(this.m_track)
                seg.add(ne)
            }
        }

        //
        // Rebuild Spanner's Start and End Notes
        //
        cloneAndRebuildSpanners(wClonedChord)

        //
        // connect ties from measure->first() to segment
        //

        for (let s = measure.first(); s; s = s.next1()) {
            const e = s.element(this.m_track)
            if (e && e.isChord()) {
                const chord = e as unknown as Chord
                for (const n of chord.notes()) {
                    const tie = n.tieForNonPartial()
                    if (!tie) {
                        continue
                    }
                    const nn = searchTieNote(n)
                    if (nn) {
                        tie.setEndNote(nn)
                        nn.setTieBack(tie)
                    } else {
                        score.doUndoRemoveElement(tie)
                    }
                }
            }
            if (s === segment) {
                break
            }
        }
        return true
    }

    dump(): string {
        const lines = [`elements ${this.size()}, duration ${this.m_duration.numerator()}/${this.m_duration.denominator()}`]
        for (const e of this.m_elements) {
            if (e.isDurationElement()) {
                const du = (e as unknown as DurationElement).ticks()
                lines.push(`   ${e.typeName()}  ${du.numerator()}/${du.denominator()}`)
            } else {
                lines.push(`   ${e.typeName()}`)
            }
        }
        return lines.join('\n')
    }
}

// ---------------------------------------------------------
//   Annotation
// ---------------------------------------------------------

export interface Annotation {
    tick: Fraction
    e: EngravingItem
}

interface BarLinesBackup {
    sPosition: Fraction
    formerMeasureStartOrEnd: boolean
    bl: BarLine
}

interface BreaksBackup {
    sPosition: Fraction
    lBreakType: LayoutBreakType
}

interface StartEndRepeatBackup {
    sPosition: Fraction
    isStartRepeat: boolean
}

interface SpacerBackup {
    sPosition: Fraction
    staffIdx: staff_idx_t
    s: Spacer
}

interface JumpsMarkersBackup {
    sPosition: Fraction
    e: EngravingItem
}

// ---------------------------------------------------------
//   ScoreRange
// ---------------------------------------------------------

export class ScoreRange {
    protected m_spanner: Spanner[] = []
    /** (C++ protected, TrackList is a friend) */
    m_annotations: Annotation[] = []

    private m_barLines: BarLinesBackup[] = []
    private m_breaks: BreaksBackup[] = []
    private m_startEndRepeats: StartEndRepeatBackup[] = []

    private m_tracks: TrackList[] = []
    private m_startTies: Tie[] = []
    private m_spacers: SpacerBackup[] = []
    private m_jumpsMarkers: JumpsMarkersBackup[] = []
    private m_first: Segment | null = null
    private m_last: Segment | null = null

    first(): Segment | null { return this.m_first }
    last(): Segment | null { return this.m_last }
    tracks(): readonly TrackList[] { return this.m_tracks }

    // ---------------------------------------------------------
    //   read
    // ---------------------------------------------------------

    read(first: Segment, last: Segment, readSpanner = true): void {
        this.m_first = first
        this.m_last = last
        const score = first.score()
        const sl = score.uniqueStaves()

        const startTrack = 0
        const endTrack = score.nstaves() * VOICES

        this.m_spanner = []

        if (readSpanner) {
            const stick = first.tick()
            const etick = last.tick()
            for (const s of first.score().spanner()) {
                if (s.systemFlag() && s.track() !== 0) {
                    // Only process the top system object
                    continue
                }

                if (s.tick().ge(stick) && s.tick().lt(etick) && s.track() >= startTrack && s.track() < endTrack) {
                    const ns = s.clone() as Spanner
                    ns.resetExplicitParent()
                    ns.setStartElement(null)
                    ns.setEndElement(null)
                    ns.setTick(ns.tick().minus(stick))
                    this.m_spanner.push(ns)
                }
            }
        }
        for (const staffIdx of sl) {
            const sTrack = staffIdx * VOICES
            const eTrack = sTrack + VOICES
            for (let track = sTrack; track < eTrack; ++track) {
                const dl = new TrackList(this)
                dl.setTrack(track)
                dl.read(first, last)
                this.m_tracks.push(dl)
            }
        }

        // Make sure incoming ties are restored
        const m1 = first.measure()
        for (let track = startTrack; track < endTrack; track++) {
            const startChord = m1.findChord(first.tick(), track)
            if (!startChord) {
                continue
            }
            for (const note of startChord.notes()) {
                const tie = note.tieBack()
                if (!tie) {
                    continue
                }
                this.m_startTies.push(tie.clone() as Tie)
                score.doUndoRemoveElement(tie)
            }
        }

        this.backupBarLines(first, last)
        this.backupBreaks(first, last)
        this.backupRepeats(first, last)
        this.backupSpacers(first, last)
        this.backupJumpsAndMarkers(first, last)
    }

    // ---------------------------------------------------------
    //   restoreVolta
    // ---------------------------------------------------------

    private restoreVolta(score: Score, tick: Fraction, v: Volta): void {
        let voltaStartOK = false
        let voltaEndOK = false
        let measureSize = new Fraction(0, 1)

        if (v.voltaType() === VoltaType.OPEN) {
            voltaEndOK = true
        }

        // Check if we should keep this volta
        for (let m = score.tick2measure(tick); m; m = m.nextMeasure()) {
            if (m.tick().eq(v.tick().plus(tick))) {
                voltaStartOK = true
                measureSize = m.endTick().minus(m.tick())
            }
            if (m.endTick().eq(v.tick2().plus(tick))) {
                voltaEndOK = true
                // No need to continue looking for
                break
            }
            // Last Measure
            if (m.sectionBreak() || (m.nextMeasure() && m.nextMeasure()!.first(SegmentType.TimeSig))) {
                break
            }
        }
        const shouldKeepVolta = voltaStartOK && voltaEndOK

        if (shouldKeepVolta) {
            // Volta start
            v.setTick(v.tick().plus(tick))

            // Review Volta endings with open Voltas
            if (v.voltaType() === VoltaType.OPEN) {
                const voltaFormerTicks = v.ticks()
                let voltaNewTicks = voltaFormerTicks

                if (voltaFormerTicks.lt(measureSize)) {
                    voltaNewTicks = measureSize
                } else if (voltaFormerTicks.gt(measureSize)) {
                    if (voltaFormerTicks.div(measureSize).reduced().denominator() !== 1) {
                        voltaNewTicks = measureSize.times(new Fraction(Math.floor(voltaFormerTicks.div(measureSize).toDouble()) + 1, 1))
                    }
                }
                if (!voltaFormerTicks.eq(voltaNewTicks)) {
                    v.setTicks(voltaNewTicks)
                }
            }
            score.undoAddElement(v)
        }
    }

    // ---------------------------------------------------------
    //   write
    // ---------------------------------------------------------

    write(score: Score, tick: Fraction): boolean {
        for (const dl of this.m_tracks) {
            const track = dl.track()
            if (!dl.write(score, tick)) {
                return false
            }
            if ((track % VOICES) === VOICES - 1) {
                // clone staff if appropriate after all voices have been copied
                const staffIdx = Math.floor(track / VOICES)
                const ostaff = score.staff(staffIdx)!
                const linkedStaves = ostaff.links()
                if (linkedStaves) {
                    for (const le of [...linkedStaves]) {
                        const nstaff = le as Staff
                        if (nstaff === ostaff) {
                            continue
                        }
                        Excerpt.cloneStaff2(ostaff, nstaff, tick, tick.plus(dl.ticks()))
                    }
                }
            }
        }
        for (const s of this.m_spanner) {
            if (s.isVolta()) {
                this.restoreVolta(score, tick, s as unknown as Volta)
                continue
            }
            s.setTick(s.tick().plus(tick))
            if (s.isSlur()) {
                const slur = s as unknown as Slur
                if (slur.startCR() && slur.startCR()!.isGrace()) {
                    const sc = slur.startChord()!
                    const idx = sc.graceIndex()
                    const dc = score.findCR(s.tick(), s.track()) as unknown as Chord
                    s.setStartElement(dc.graceNotes()[idx])
                }
                if (slur.endCR() && slur.endCR()!.isGrace()) {
                    const sc = slur.endChord()!
                    const idx = sc.graceIndex()
                    const dc = score.findCR(s.tick2(), s.track2()) as unknown as Chord
                    s.setEndElement(dc.graceNotes()[idx])
                }
            }
            if (s.anchor() === SpannerAnchor.MEASURE) {
                const startTick = s.tick()
                const startMeasure = score.tick2measureMM(startTick)!
                const startMeasureTick = startMeasure.tick()
                const endTick = s.tick2()
                const endMeasure = score.tick2measureMM(endTick)!
                const endMeasureTick = endMeasure.tick()
                if (!startMeasureTick.eq(startTick)) {
                    s.setTick(startMeasureTick)
                }
                if (!endMeasureTick.eq(endTick)) {
                    s.setTick2(!endMeasureTick.eq(startMeasureTick) ? endMeasureTick : endMeasure.endTick())
                }
            }
            score.undoAddElement(s)
        }
        for (const a of this.m_annotations) {
            const tm = score.tick2measure(a.tick)!
            const op = a.e.explicitParent() as unknown as Segment
            const destTick = a.e.isRehearsalMark() ? tm.tick() : a.tick // Ensure reharsal mark can only go at measure start
            const s = tm.undoGetSegment(op.segmentType(), destTick)
            if (s) {
                a.e.setParent(s)
                score.undoAddElement(a.e)
            }
        }

        // Restore ties to the beginning of the first measure
        for (const tie of this.m_startTies) {
            const endNote = searchTieNote(tie.startNote())
            if (!endNote) {
                continue
            }
            tie.setEndNote(endNote)
            score.doUndoAddElement(tie)
        }

        this.restoreBarLines(score, tick)
        this.restoreBreaks(score, tick)
        this.restoreRepeats(score, tick)
        this.restoreSpacers(score, tick)
        this.restoreJumpsAndMarkers(score, tick)
        return true
    }

    // ---------------------------------------------------------
    //   fill
    // ---------------------------------------------------------

    fill(f: Fraction): void {
        const oldDuration = this.ticks()
        const oldEndTick = this.m_first!.tick().plus(oldDuration)
        for (const t of this.m_tracks) {
            t.appendGap(f, this.m_first!.score())
        }

        const diff = this.ticks().minus(oldDuration)
        for (const sp of this.m_spanner) {
            if (sp.tick2().ge(oldEndTick) && sp.tick().lt(oldEndTick)) {
                sp.setTicks(sp.ticks().plus(diff))
            }
        }
    }

    // ---------------------------------------------------------
    //   truncate
    //    reduce len of last gap by f
    // ---------------------------------------------------------

    truncate(f: Fraction): boolean {
        for (const dl of this.m_tracks) {
            if (dl.empty()) {
                continue
            }
            const e = dl.back()
            if (!e.isRest()) {
                return false
            }
            const r = e as unknown as Rest
            if (r.ticks().lt(f)) {
                return false
            }
        }
        for (const dl of this.m_tracks) {
            dl.truncate(f)
        }
        return true
    }

    // ---------------------------------------------------------
    //   ticks
    // ---------------------------------------------------------

    ticks(): Fraction {
        return this.m_tracks.length === 0 ? new Fraction(0, 1) : this.m_tracks[0].ticks()
    }

    // ---------------------------------------------------------
    //   backupBarLines
    // ---------------------------------------------------------

    private backupBarLines(first: Segment, last: Segment): void {
        for (let s: Segment | null = first; s && (s.isBefore(last) || s === last); s = s.next1()) {
            if (!s.isSegType(SegmentType.BarLineType)) {
                continue
            }
            for (const e of s.elist()) {
                if (e && !e.generated()) {
                    this.m_barLines.push({
                        sPosition: s.tick(),
                        formerMeasureStartOrEnd: s.rtick().isZero() || s.rtick().eq(s.measure().ticks()),
                        bl: e.clone() as BarLine,
                    })
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   insertBarLine
    // ---------------------------------------------------------

    private insertBarLine(m: Measure, barLine: BarLinesBackup): boolean {
        // ---------------------------------------------------------
        //   addBarLine
        // ---------------------------------------------------------
        const addBarLine = (m: Measure, bl: BarLine, st: SegmentType, pos: Fraction): void => {
            const middle = !pos.eq(m.tick()) && !pos.eq(m.endTick())
            const seg = m.undoGetSegment(st, pos)
            if (seg) {
                let blt = bl.barLineType()
                // get existing bar line if it does exist
                let nbl = seg.element(bl.track()) as BarLine | null
                if (!nbl) {
                    // no suitable bar line: create a new one
                    nbl = Factory.createItem(ElementType.BAR_LINE, seg) as BarLine
                    nbl.setParent(seg)
                    nbl.setTrack(bl.track())
                    // A BL in the middle of a Measure does have SpanStaff to false
                    nbl.setSpanStaff(middle ? false : bl.spanStaff())
                    m.score().addElement(nbl)
                } else {
                    // We change BarLineType if necessary to keep END_START repeats if in the middle of a meassure
                    if (nbl.barLineType() === BarLineType.END_REPEAT && bl.barLineType() === BarLineType.START_REPEAT && middle) {
                        blt = BarLineType.END_START_REPEAT
                    }
                }
                nbl.setGenerated(false)
                nbl.setBarLineType(blt)
                nbl.setVisible(bl.visible())
                nbl.setColor(bl.color())

                // We check if the same BL type is in every Stave
                let blAcrossStaves = false
                // if there is only one stave or spanStaff
                if (m.score().nstaves() === 1 || bl.spanStaff()) {
                    blAcrossStaves = true
                } else if (bl.staffIdx() === m.score().nstaves() - 1) {
                    // If we are in the last stave
                    let sameBL = true
                    // We check if and every previous stave has the same type of BL
                    for (let i = 0; i < m.score().nstaves() - 1; ++i) {
                        const sbl = seg.element(staff2track(i)) as BarLine | null
                        if (!sbl || sbl.barLineType() !== blt) {
                            sameBL = false
                            break
                        }
                    }
                    blAcrossStaves = sameBL

                    if (blAcrossStaves && !middle) {
                        // Set Spanstaff to true if not in the middle and there is the same BL across staves
                        for (let i = 0; i < m.score().nstaves() - 1; ++i) {
                            const sbl = seg.element(staff2track(i)) as BarLine | null
                            if (sbl) {
                                sbl.setSpanStaff(middle ? false : true)
                            }
                        }
                    }
                }

                // Adding Set repeats
                if (pos.eq(m.tick()) && bl.barLineType() === BarLineType.START_REPEAT && blAcrossStaves) {
                    m.setRepeatStart(true)
                } else if (pos.eq(m.endTick()) && bl.barLineType() === BarLineType.END_REPEAT && blAcrossStaves) {
                    m.setRepeatEnd(true)
                }
            }
        }

        let processed = false

        // if END_START_REPEAT AND at the end of a Measure
        if (barLine.sPosition.eq(m.endTick()) && barLine.bl.barLineType() === BarLineType.END_START_REPEAT) {
            // Create END_REPEAT and START_REPEAT (and ignore return value)
            barLine.bl.setBarLineType(BarLineType.END_REPEAT)
            this.insertBarLine(m, barLine)
            // Start Repeat into the next measure
            if (m.nextMeasure()) {
                barLine.bl.setBarLineType(BarLineType.START_REPEAT)
                this.insertBarLine(m.nextMeasure()!, barLine)
            }

            // Restore initial value just in case
            barLine.bl.setBarLineType(BarLineType.END_START_REPEAT)
            processed = true
        } else {
            if (barLine.sPosition.eq(m.tick())) {
                // First position
                // Just Start Repeat at the left of the Measure
                if (barLine.bl.barLineType() === BarLineType.START_REPEAT) {
                    addBarLine(m, barLine.bl, SegmentType.StartRepeatBarLine, barLine.sPosition)
                    processed = true
                }
            } else if (barLine.sPosition.eq(m.endTick())) {
                // Last position
                // Avoid Start Repeat at the end of the Measure
                if (barLine.bl.barLineType() !== BarLineType.START_REPEAT) {
                    addBarLine(m, barLine.bl, SegmentType.EndBarLine, barLine.sPosition)
                    processed = true
                }
            } else {
                // Middle
                // We don't create BL in the Middle
                processed = true
            }
        }
        return processed
    }

    // ---------------------------------------------------------
    //   restoreBarLines
    // ---------------------------------------------------------

    private restoreBarLines(score: Score, tick: Fraction): void {
        for (const bbl of this.m_barLines) {
            for (let m = score.tick2measure(tick); m; m = m.nextMeasure()) {
                // if inserted within a suitable measure ... to the next barline
                if (bbl.sPosition.ge(m.tick()) && bbl.sPosition.le(m.endTick()) && this.insertBarLine(m, bbl)) {
                    break
                }
                if (m.tick().gt(bbl.sPosition)) {
                    break
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   backupBreaks
    // ---------------------------------------------------------

    private backupBreaks(first: Segment, last: Segment): void {
        const fm = first.measure()
        const lm = last.measure()
        for (let m: Measure | null = fm; m && m !== lm.nextMeasure(); m = m.nextMeasure()) {
            if (m.lineBreak()) {
                this.m_breaks.push({ sPosition: m.endTick(), lBreakType: LayoutBreakType.LINE })
            } else if (m.pageBreak()) {
                this.m_breaks.push({ sPosition: m.endTick(), lBreakType: LayoutBreakType.PAGE })
            }
        }
    }

    // ---------------------------------------------------------
    //   restoreBreaks
    // ---------------------------------------------------------

    private restoreBreaks(score: Score, tick: Fraction): void {
        // Break list
        for (const bb of this.m_breaks) {
            // Look for suitable measure
            for (let m = score.tick2measure(tick); m; m = m.nextMeasure()) {
                // We keep them as long as they are in the measure after the start tick
                if (bb.sPosition.gt(m.tick()) && bb.sPosition.le(m.endTick())) {
                    m.undoSetBreak(true, bb.lBreakType)
                    break
                }
                if (m.tick().gt(bb.sPosition)) {
                    break
                }
            }
        }
    }

    private backupRepeats(first: Segment, last: Segment): void {
        const fm = first.measure()
        const lm = last.measure()
        for (let m: Measure | null = fm; m && m !== lm.nextMeasure(); m = m.nextMeasure()) {
            if (m.repeatStart()) {
                this.m_startEndRepeats.push({ sPosition: m.tick(), isStartRepeat: true })
            }
            if (m.repeatEnd()) {
                this.m_startEndRepeats.push({ sPosition: m.endTick(), isStartRepeat: false })
            }
        }
    }

    private restoreRepeats(score: Score, tick: Fraction): void {
        const refTick = tick.isZero() ? tick : tick.minus(Fraction.eps()) // start checking one measure before
        for (const startEndRepeat of this.m_startEndRepeats) {
            for (let m = score.tick2measure(refTick); m; m = m.nextMeasure()) {
                const mTick = m.tick()
                if (startEndRepeat.isStartRepeat && startEndRepeat.sPosition.eq(mTick)) {
                    m.undoChangeProperty(Pid.REPEAT_START, true)
                } else if (!startEndRepeat.isStartRepeat && startEndRepeat.sPosition.eq(m.endTick())) {
                    m.undoChangeProperty(Pid.REPEAT_END, true)
                }
                if (mTick.gt(startEndRepeat.sPosition)) {
                    break
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   backupSpacers
    // ---------------------------------------------------------

    private backupSpacers(first: Segment, last: Segment): void {
        const fm = first.measure()
        const lm = last.measure()

        for (let m: Measure | null = fm; m && m !== lm.nextMeasure(); m = m.nextMeasure()) {
            const nStaves = m.score().nstaves()

            for (let i = 0; i < nStaves; ++i) {
                const sPosition = m.tick().plus(m.endTick().minus(m.tick()).div(new Fraction(2, 1)))
                if (m.vspacerUp(i)) {
                    this.m_spacers.push({ s: m.vspacerUp(i)!.clone() as Spacer, sPosition, staffIdx: i })
                }
                if (m.vspacerDown(i)) {
                    this.m_spacers.push({ s: m.vspacerDown(i)!.clone() as Spacer, sPosition, staffIdx: i })
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   restoreSpacers
    // ---------------------------------------------------------

    private restoreSpacers(score: Score, tick: Fraction): void {
        // ---------------------------------------------------------
        //   addSpacer
        // ---------------------------------------------------------
        const addSpacer = (m: Measure, s: Spacer, staffIdx: staff_idx_t): void => {
            // We only add an element if there isn't a previous one of the same Type (UP/DOWN)
            if ((s.spacerType() === SpacerType.UP && !m.vspacerUp(staffIdx))
                || ((s.spacerType() === SpacerType.DOWN || s.spacerType() === SpacerType.FIXED) && !m.vspacerDown(staffIdx))) {
                const ns = Factory.createItem(ElementType.SPACER, m) as Spacer
                ns.setSpacerType(s.spacerType())
                ns.setGap(s.gap())
                ns.setTrack(staffIdx * VOICES)
                m.add(ns)
            }
        }

        // Spacers list
        for (const sb of this.m_spacers) {
            // Look for suitable measure
            for (let m = score.tick2measure(tick); m; m = m.nextMeasure()) {
                if (sb.sPosition.ge(m.tick()) && sb.sPosition.le(m.endTick())) {
                    addSpacer(m, sb.s, sb.staffIdx)
                    break
                }
                if (m.tick().gt(sb.sPosition)) {
                    break
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   endOfMeasureElement
    // ---------------------------------------------------------

    private endOfMeasureElement(e: EngravingItem): boolean {
        let result = false

        if (e.isMarker() && ((e as unknown as Marker).isRightMarker() || (e as unknown as Marker).markerType() === MarkerType.FINE)) {
            result = true
        } else if (e.isJump()) {
            result = true
        }
        return result
    }

    // ---------------------------------------------------------
    //   backupJumpsAndMarkers
    // ---------------------------------------------------------

    private backupJumpsAndMarkers(first: Segment, last: Segment): void {
        const fm = first.measure()
        const lm = last.measure()

        for (let m: Measure | null = fm; m && m !== lm.nextMeasure(); m = m.nextMeasure()) {
            // Backup Markers and Jumps (Measures's son)
            for (const e of m.el()) {
                if (e && (e.isMarker() || e.isJump())) {
                    this.m_jumpsMarkers.push({ sPosition: this.endOfMeasureElement(e) ? m.endTick() : m.tick(), e: e.clone() })
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   restoreJumpsAndMarkers
    // ---------------------------------------------------------

    private restoreJumpsAndMarkers(score: Score, tick: Fraction): void {
        // ---------------------------------------------------------
        //   addJumpMarker
        // ---------------------------------------------------------
        const addJumpMarker = (m: Measure, e: EngravingItem): void => {
            // We add every element as a Measure could have as many elements (even of the same type) as the users decides
            const ce = e.clone()
            ce.setParent(m)
            ce.setTrack(0)
            m.add(ce)
        }

        for (const jmb of this.m_jumpsMarkers) {
            for (let m = score.tick2measure(tick); m; m = m.nextMeasure()) {
                // Markers: we keep them as long as they are in the measure before the final tick
                // Jumps: we keep them as long as they are in the measure after the start tick
                if ((this.endOfMeasureElement(jmb.e) && jmb.sPosition.gt(m.tick()) && jmb.sPosition.le(m.endTick()))
                    || (!this.endOfMeasureElement(jmb.e) && jmb.sPosition.ge(m.tick()) && jmb.sPosition.lt(m.endTick()))) {
                    addJumpMarker(m, jmb.e)
                }
                if (m.tick().gt(jmb.sPosition)) {
                    break
                }
            }
        }
    }
}
