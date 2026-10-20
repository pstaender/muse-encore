/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/measureread.h/.cpp
 *
 * TODO(port): elements of types not ported yet are skipped (dynamics, texts, harmony, fermatas, breaths, ...)
 */

import { Fraction } from '../../types/fraction'
import { Spatium } from '../../types/dimension'
import { AutoOnOff, BarLineType, DurationType, ElementType, PlacementV, VOICES, ClefToBarlinePosition, trackZeroVoice } from '../../types/types'
import { TConv } from '../../types/typesconv'
import { Factory } from '../../dom/factory'
import { Location } from '../../dom/location'
import { NoteType } from '../../dom/chordrest'
import { SegmentType, type Segment } from '../../dom/segment'
import { SpacerType, type Measure, type MeasureNumberMode } from '../../dom/measure'
import { StaffLines } from '../../dom/stafflines'
import type { BarLine } from '../../dom/barline'
import type { Beam } from '../../dom/beam'
import type { Chord } from '../../dom/chord'
import type { Clef } from '../../dom/clef'
import type { KeySig } from '../../dom/keysig'
import type { MeasureNumber } from '../../dom/measurenumber'
import type { Rest } from '../../dom/rest'
import type { Spacer } from '../../dom/spacer'
import type { Symbol } from '../../dom/symbol'
import type { TimeSig } from '../../dom/timesig'
import type { Tuplet } from '../../dom/tuplet'
import type { XmlReader } from '../xmlreader'
import type { ReadContext } from './readcontext'
import { TRead } from './tread'
import type { Ambitus } from '../../dom/ambitus'
import type { Fermata } from '../../dom/fermata'
import type { Breath } from '../../dom/breath'
import type { StaffText } from '../../dom/stafftextbase'
import type { Harmony } from '../../dom/harmony'
import type { MeasureRepeat } from '../../dom/measurerepeat'

export class MeasureRead {
    static readMeasure(measure: Measure, e: XmlReader, ctx: ReadContext, staffIdx: number): void {
        ctx.setCurrentMeasure(measure)
        let nextTrack = staffIdx * VOICES
        ctx.setTrack(nextTrack)

        const mstaves = measure.mstaves()
        for (let n = mstaves.length; n <= staffIdx; ++n) {
            const staff = ctx.staff(n)!
            measure.createStaves(n)
            const s = mstaves[n]
            if (!s.lines()) {
                s.setLines(new StaffLines(measure))
            }
            s.lines().setParent(measure)
            s.lines().setTrack(n * VOICES)
            s.lines().setVisible(!staff.isLinesInvisible(measure.tick()))
        }

        let irregular = false
        if (e.hasAttribute('len')) {
            const len = Fraction.fromString(e.attribute('len'))
            if (!len || len.lt(new Fraction(1, 128))) {
                e.raiseError(`MSCX error: invalid measure length: ${e.attribute('len')}`)
                return
            }
            measure.setTicks(len)
            irregular = true
        }

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'voice') {
                ctx.setTrack(nextTrack++)
                ctx.setTick(measure.tick())
                MeasureRead.readVoice(measure, e, ctx, staffIdx, irregular)
            } else if (tag === 'Marker' || tag === 'Jump') {
                const el = Factory.createItemByName(tag, measure)!
                el.setTrack(ctx.track())
                TRead.readItem(el, e, ctx)
                if (el.systemFlag() && el.isTopSystemObject()) {
                    el.setTrack(0) // original system object always goes on top
                }
                measure.add(el)
            } else if (tag === 'stretch' && ctx.mscVersion() < 400) {
                // read400: Ignore measure stretch pre 4.0
                e.skipCurrentElement()
            } else if (tag === 'stretch') {
                let val = e.readDouble()
                if (val < 0.0) {
                    val = 0
                }
                measure.setUserStretch(val)
            } else if (tag === 'noOffset') {
                measure.setNoOffset(e.readInt())
            } else if (tag === 'measureNumberMode') {
                measure.setMeasureNumberMode(e.readInt() as MeasureNumberMode)
            } else if (tag === 'irregular') {
                measure.setIrregular(e.readBool())
            } else if (tag === 'breakMultiMeasureRest') {
                measure.setBreakMultiMeasureRest(e.readBool())
            } else if (tag === 'startRepeat') {
                measure.setRepeatStart(true)
                e.readNext()
            } else if (tag === 'endRepeat') {
                measure.setRepeatCount(e.readInt())
                measure.setRepeatEnd(true)
            } else if (tag === 'vspacer' || tag === 'vspacerDown') {
                if (!measure.vspacerDown(staffIdx)) {
                    const spacer = Factory.createItem(ElementType.SPACER, measure) as Spacer
                    spacer.setSpacerType(SpacerType.DOWN)
                    spacer.setTrack(staffIdx * VOICES)
                    measure.add(spacer)
                }
                measure.vspacerDown(staffIdx)!.setGap(new Spatium(e.readDouble()))
            } else if (tag === 'vspacerFixed') {
                if (!measure.vspacerDown(staffIdx)) {
                    const spacer = Factory.createItem(ElementType.SPACER, measure) as Spacer
                    spacer.setSpacerType(SpacerType.FIXED)
                    spacer.setTrack(staffIdx * VOICES)
                    measure.add(spacer)
                }
                measure.vspacerDown(staffIdx)!.setGap(new Spatium(e.readDouble()))
            } else if (tag === 'vspacerUp') {
                if (!measure.vspacerUp(staffIdx)) {
                    const spacer = Factory.createItem(ElementType.SPACER, measure) as Spacer
                    spacer.setSpacerType(SpacerType.UP)
                    spacer.setTrack(staffIdx * VOICES)
                    measure.add(spacer)
                }
                measure.vspacerUp(staffIdx)!.setGap(new Spatium(e.readDouble()))
            } else if (tag === 'visible') {
                measure.setStaffVisible(staffIdx, e.readInt() !== 0)
            } else if (tag === 'stemless') {
                measure.setStaffStemless(staffIdx, e.readInt() !== 0)
            } else if (tag === 'hideIfEmpty') {
                measure.setHideStaffIfEmpty(staffIdx, TConv.fromXmlAutoOnOff(e.readAsciiText(), AutoOnOff.AUTO))
            } else if (tag === 'measureRepeatCount') {
                measure.setMeasureRepeatCount(e.readInt(), staffIdx)
            } else if (tag === 'SystemDivider') {
                e.skipCurrentElement() // TODO(port): system dividers
            } else if (tag === 'multiMeasureRest') {
                measure.setMMRestCount(e.readInt())
                // set tick to previous measure
                measure.setTick(ctx.lastMeasure()!.tick())
                ctx.setTick(ctx.lastMeasure()!.tick())
            } else if (tag === 'MeasureNumber') {
                const noText = Factory.createItem(ElementType.MEASURE_NUMBER, measure) as MeasureNumber
                TRead.readMeasureNumberBase(noText, e, ctx)
                noText.setTrack(ctx.track())
                measure.add(noText)
            } else if (tag === 'MMRestRange') {
                e.skipCurrentElement() // TODO(port): MMRestRange
            } else if (TRead.readMeasureBaseProperties(measure, e, ctx)) {
            } else {
                e.unknown()
            }
        }
        ctx.checkConnectors()
        if (measure.isMMRest()) {
            const lm = ctx.lastMeasure()!
            ctx.setTick(lm.endTick())
        }
        ctx.setCurrentMeasure(null)
        measure.connectTremolo()
    }

    static readVoice(measure: Measure, e: XmlReader, ctx: ReadContext, staffIdx: number, irregular: boolean): void {
        let segment: Segment | null = null
        const graceNotes: Chord[] = []
        let startingBeam: Beam | null = null
        let tuplet: Tuplet | null = null
        let fermata: Fermata | null = null
        const staff = ctx.staff(staffIdx)!
        let timeStretch = staff.timeStretch(measure.tick())

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'location') {
                const loc = Location.relative()
                TRead.readLocation(loc, e, ctx)
                ctx.setLocation(loc)
                // TODO(port): time tick anchors (loc.isTimeTick())
            } else if (tag === 'tick') { // obsolete?
                ctx.setTick(Fraction.fromTicks(ctx.fileDivision(e.readInt())))
            } else if (tag === 'BarLine') {
                const barLine = Factory.createItem(ElementType.BAR_LINE, ctx.score()) as BarLine | null
                barLine!.setTrack(ctx.track())
                TRead.readBarLine(barLine!, e, ctx)
                let bl: BarLine | null = barLine
                //
                //  StartRepeatBarLine: at rtick == 0, always BarLineType::START_REPEAT
                //  BarLine:            in the middle of a measure, has no semantic
                //  EndBarLine:         at the end of a measure
                //  BeginBarLine:       first segment of a measure, systemic barline
                let st = SegmentType.Invalid
                const t = ctx.tick().minus(measure.tick())
                if (t.isNotZero() && !t.eq(measure.ticks())) {
                    st = SegmentType.BarLine
                } else if (bl!.barLineType() === BarLineType.START_REPEAT && t.isZero()) {
                    st = SegmentType.StartRepeatBarLine
                } else if (bl!.barLineType() === BarLineType.START_REPEAT && t.eq(measure.ticks())) {
                    // old version, ignore
                    bl = null
                } else if (t.isZero() && !segment) {
                    st = SegmentType.BeginBarLine
                } else {
                    st = SegmentType.EndBarLine
                }
                if (bl) {
                    segment = measure.getSegmentR(st, t)
                    segment.add(bl)
                }
                if (fermata) {
                    segment!.add(fermata)
                    fermata = null
                }
            } else if (tag === 'Chord') {
                const chord = Factory.createItem(ElementType.CHORD, ctx.score()) as Chord
                chord.setTrack(ctx.track())
                TRead.readChord(chord, e, ctx)
                if (startingBeam) {
                    startingBeam.add(chord) // also calls chord->setBeam(startingBeam)
                    startingBeam = null
                }
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                if (chord.noteType() !== NoteType.NORMAL) {
                    graceNotes.push(chord)
                } else {
                    segment.add(chord)
                    for (let i = 0; i < graceNotes.length; ++i) {
                        const gc = graceNotes[i]
                        gc.setGraceIndex(i)
                        chord.add(gc)
                    }
                    graceNotes.length = 0
                    if (tuplet) {
                        tuplet.add(chord)
                    }
                    ctx.incTick(chord.actualTicks())
                }
                if (fermata) {
                    segment.add(fermata)
                    fermata = null
                }
            } else if (tag === 'Rest') {
                if (measure.isMMRest()) {
                    // TODO(port): MMRest
                    segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                    e.skipCurrentElement()
                    ctx.incTick(measure.ticks())
                } else {
                    segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                    const rest = Factory.createItem(ElementType.REST, segment) as Rest
                    rest.setDurationType(DurationType.V_MEASURE)
                    rest.setTicks(measure.timesig().div(timeStretch))
                    rest.setTrack(ctx.track())
                    TRead.readRest(rest, e, ctx)
                    if (startingBeam) {
                        startingBeam.add(rest) // also calls rest->setBeam(startingBeam)
                        startingBeam = null
                    }
                    segment.add(rest)
                    if (fermata) {
                        segment.add(fermata)
                        fermata = null
                    }
                    if (!rest.ticks().isValid()) { // hack
                        rest.setTicks(measure.timesig().div(timeStretch))
                    }
                    if (tuplet) {
                        tuplet.add(rest)
                    }
                    ctx.incTick(rest.actualTicks())
                }
            } else if (tag === 'Breath') {
                segment = measure.getSegment(SegmentType.Breath, ctx.tick())
                const breath = Factory.createItem(ElementType.BREATH, segment) as Breath
                breath.setTrack(ctx.track())
                breath.setPlacement(breath.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
                TRead.readBreath(breath, e, ctx)
                segment.add(breath)
            } else if (tag === 'Text') {
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                const t = Factory.createItem(ElementType.STAFF_TEXT, segment) as StaffText
                t.setTrack(ctx.track())
                TRead.readStaffText(t, e, ctx)
                if (!t.empty()) {
                    segment.add(t)
                }
            } else if (tag === 'Dynamic' || tag === 'Expression' || tag === 'Tempo' || tag === 'StaffText') {
                segment = measure.getChordRestOrTimeTickSegment(ctx.tick())
                const type = tag === 'Dynamic' ? ElementType.DYNAMIC : tag === 'Expression' ? ElementType.EXPRESSION
                    : tag === 'Tempo' ? ElementType.TEMPO_TEXT : ElementType.STAFF_TEXT
                const el = Factory.createItem(type, segment)!
                el.setTrack(ctx.track())
                TRead.readItem(el, e, ctx)
                if (tag !== 'Dynamic' && tag !== 'Expression' && el.systemFlag() && el.isTopSystemObject()) {
                    el.setTrack(0) // original system object always goes on top
                }
                segment.add(el)
            } else if (tag === 'Harmony') {
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                const el = Factory.createItem(ElementType.HARMONY, segment) as Harmony

                el.setTrack(ctx.track())
                TRead.readHarmony(el, e, ctx)
                if (el.systemFlag() && el.isTopSystemObject()) {
                    el.setTrack(0) // original system object always goes on top
                }
                if (el.chords().length) { // else: invalid harmony
                    segment.add(el)
                }
            } else if (tag === 'FretDiagram') {
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                const el = Factory.createItem(ElementType.FRET_DIAGRAM, segment)!

                el.setTrack(ctx.track())
                TRead.readItem(el, e, ctx)
                if (el.systemFlag() && el.isTopSystemObject()) {
                    el.setTrack(0) // original system object always goes on top
                }
                segment.add(el)
            } else if (tag === 'SystemText' || tag === 'RehearsalMark' || tag === 'InstrumentChange') {
                // TODO(port): Sticking, PlayTechAnnotation, Capo, StringTunings, StaffState,
                // FiguredBass, HarpPedalDiagram
                const el = Factory.createItemByName(tag, ctx.score())!
                if (el.allowTimeAnchor()) {
                    segment = measure.getChordRestOrTimeTickSegment(ctx.tick())
                } else {
                    segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                }
                el.setTrack(ctx.track())
                TRead.readItem(el, e, ctx)
                if (el.systemFlag() && el.isTopSystemObject()) {
                    el.setTrack(0) // original system object always goes on top
                }
                segment.add(el)
            } else if (tag === 'Fermata') {
                fermata = Factory.createItem(ElementType.FERMATA, ctx.score()) as Fermata
                fermata.setTrack(ctx.track())
                fermata.setPlacement(fermata.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
                TRead.readFermata(fermata, e, ctx)
            } else if (tag === 'Spanner') {
                TRead.readSpanner(e, ctx, measure, ctx.track())
            } else if (tag === 'Clef') {
                const clef = Factory.createItem(ElementType.CLEF, ctx.score()) as Clef
                clef.setTrack(ctx.track())
                TRead.readClef(clef, e, ctx)
                clef.setGenerated(false)

                let header = clef.isHeader()
                if (ctx.mscVersion() < 410) {
                    // read400: we used to try to guess if the clef is a header based on context, which is very unreliable.
                    // After 4.1, we just TAG it.
                    // there may be more than one clef segment for same tick position
                    // the first clef may be missing and is added later in layout
                    if (!ctx.tick().eq(measure.tick())) {
                        header = false
                    } else if (!segment) {
                        header = true
                    } else {
                        header = true
                        for (let s = measure.first(); s && s.rtick().isZero(); s = s.next()) {
                            if (s.isKeySigType() || s.isTimeSigType()) {
                                // hack: there may be other segment types which should
                                // generate a clef at current position
                                header = false
                                break
                            }
                        }
                    }
                }

                if (ctx.mscVersion() < 450) {
                    // read400/read410: Clef segments are sorted on layout now.
                    // Previously, clef barline position could be out of sync with segment placement.
                    if (!ctx.tick().isZero() && ctx.tick().eq(measure.tick())
                        && !(measure.prevMeasure() && measure.prevMeasure()!.repeatEnd()) && !header) {
                        clef.setClefToBarlinePosition(ClefToBarlinePosition.AFTER)
                    }
                }

                segment = measure.getSegment(header ? SegmentType.HeaderClef : SegmentType.Clef, ctx.tick())
                segment.add(clef)
                if (ctx.mscVersion() < 410) {
                    clef.setIsHeader(header)
                }
            } else if (tag === 'TimeSig') {
                const ts = Factory.createItem(ElementType.TIMESIG, ctx.score()) as TimeSig
                ts.setTrack(ctx.track())
                TRead.readTimeSig(ts, e, ctx)
                const currTick = ctx.tick()
                const courtesySig = ts.isCourtesy()
                segment = measure.getSegment(courtesySig ? SegmentType.TimeSigAnnounce : SegmentType.TimeSig, currTick)
                segment.add(ts)
                if (!courtesySig) {
                    if (currTick.eq(measure.endTick())) {
                        segment.setEndOfMeasureChange(true)
                        measure.setEndOfMeasureChange(true)
                    }
                    if (currTick.eq(measure.tick())) {
                        timeStretch = ts.stretch().reduced()
                        measure.setTimesig(ts.sig().div(timeStretch))
                        if (!irregular) {
                            measure.setTicks(measure.timesig())
                        }
                    }
                    if (currTick.gt(measure.tick())) {
                        ctx.setTimeSigForNextMeasure(ts.sig().div(ts.stretch().reduced()))
                    }
                }
            } else if (tag === 'KeySig') {
                const ks = Factory.createItem(ElementType.KEYSIG, ctx.score()) as KeySig
                ks.setTrack(ctx.track())
                TRead.readKeySig(ks, e, ctx)
                const curTick = ctx.tick()
                const courtesySig = ks.isCourtesy()
                segment = measure.getSegment(courtesySig ? SegmentType.KeySigAnnounce : SegmentType.KeySig, curTick)
                segment.add(ks)
                if (!courtesySig) {
                    if (curTick.eq(measure.endTick())) {
                        segment.setEndOfMeasureChange(true)
                        measure.setEndOfMeasureChange(true)
                    }
                    staff.setKey(curTick, ks.keySigEvent())
                }
            } else if (tag === 'Symbol') {
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                const el = Factory.createItem(ElementType.SYMBOL, segment) as Symbol
                el.setTrack(ctx.track())
                TRead.readSymbol(el, e, ctx)
                segment.add(el)
            } else if (tag === 'Tuplet') {
                const oldTuplet = tuplet
                tuplet = Factory.createItem(ElementType.TUPLET, measure) as Tuplet
                tuplet.setTrack(ctx.track())
                tuplet.setTick(ctx.tick())
                tuplet.setParent(measure)
                TRead.readTuplet(tuplet, e, ctx)
                if (oldTuplet) {
                    oldTuplet.add(tuplet)
                }
            } else if (tag === 'endTuplet') {
                if (!tuplet) {
                    e.skipCurrentElement()
                    continue
                }
                const oldTuplet: Tuplet = tuplet
                tuplet = tuplet.tuplet()
                if (oldTuplet.elements().length === 0) {
                    // this should not happen and is a sign of input file corruption
                    if (tuplet) {
                        tuplet.remove(oldTuplet)
                    }
                }
                e.readNext()
            } else if (tag === 'Beam') {
                const beam = Factory.createItem(ElementType.BEAM, ctx.score()) as Beam
                beam.setTrack(ctx.track())
                TRead.readBeam(beam, e, ctx)
                beam.resetExplicitParent()
                startingBeam = beam
            } else if (tag === 'Segment' && segment) {
                TRead.readSegment(segment, e, ctx)
            } else if (tag === 'Ambitus') {
                segment = measure.getSegment(SegmentType.Ambitus, ctx.tick())
                const range = Factory.createItem(ElementType.AMBITUS, segment) as Ambitus
                TRead.readAmbitus(range, e, ctx)
                range.setParent(segment) // a parent segment is needed for setTrack() to work
                range.setTrack(trackZeroVoice(ctx.track()))
                segment.add(range)
            } else if (tag === 'MeasureRepeat' || tag === 'RepeatMeasure') {
                //             4.x                       3.x
                segment = measure.getSegment(SegmentType.ChordRest, ctx.tick())
                const mr = Factory.createItem(ElementType.MEASURE_REPEAT, segment) as MeasureRepeat
                mr.setTrack(ctx.track())
                TRead.readMeasureRepeat(mr, e, ctx)
                if (!mr.numMeasures()) {
                    mr.setNumMeasures(1) // 3.x doesn't have any other possibilities
                }
                if (!measure.measureRepeatCount(staffIdx)) {
                    measure.setMeasureRepeatCount(1, staffIdx)
                }
                segment.add(mr)
                ctx.incTick(measure.ticks())
            } else {
                // TODO(port): TremoloBar, Sticking, InstrumentChange, Image,
                // PlayCountText, ...
                e.skipCurrentElement()
            }
        }
        if (fermata) {
            const st = ctx.tick().eq(measure.endTick()) ? SegmentType.EndBarLine : SegmentType.ChordRest
            segment = measure.getSegment(st, ctx.tick())
            segment.add(fermata)
            fermata = null
        }
    }
}
