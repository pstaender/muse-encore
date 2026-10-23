/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/read460.h/.cpp
 */

import type { FiguredBass } from '../../dom/figuredbass'
import { ElementType } from '../../types/types'
import { Sid } from '../../style/styledef'
import { engravingFonts } from '../../infrastructure/engravingfont'
import { Factory } from '../../dom/factory'
import { Part } from '../../dom/part'
import { LayoutMode, type Score } from '../../dom/score'
import type { MasterScore } from '../../dom/masterscore'
import type { Spanner } from '../../dom/spanner'
import type { Text } from '../../dom/text'
import type { XmlReader } from '../xmlreader'
import { ReadContext, type ReadLinks } from './readcontext'
import { StaffRead } from './staffread'
import { ScoreOrder } from '../../dom/scoreorder'
import { TRead } from './tread'
import { ReadChordListHook } from '../compat/readchordlisthook'
// (imports of the paste section)
import { Fraction } from '../../types/fraction'
import { PlacementV, VOICES, track2staff, trackZeroVoice, type staff_idx_t } from '../../types/types'
import { TDuration } from '../../dom/durationtype'
import { MScore, MsError } from '../../dom/mscore'
import { Segment, SegmentType } from '../../dom/segment'
import { SelState } from '../../dom/select'
import { Location } from '../../dom/location'
import { Pid } from '../../dom/property'
import { SpannerAnchor } from '../../dom/spanner'
import { EditTimeTickAnchors } from '../../dom/anchors'
import { scoreDummy } from '../../compat/dummyelement'
import { Transpose } from '../../editing/transpose'
import { searchNextLyrics } from '../../rendering/score/lyricslayout'
import { RWRegister } from '../rwregister'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Measure } from '../../dom/measure'
import type { ChordRest } from '../../dom/chordrest'
import type { Chord } from '../../dom/chord'
import type { Tuplet } from '../../dom/tuplet'
import type { Beam } from '../../dom/beam'
import type { Harmony } from '../../dom/harmony'
import type { Clef } from '../../dom/clef'
import type { Breath } from '../../dom/breath'
import type { Fermata } from '../../dom/fermata'
import type { Lyrics } from '../../dom/lyrics'
import type { LyricsLine } from '../../dom/lyricsline'
import type { FretDiagram } from '../../dom/fret'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import { DefaultStyle } from '../../style/defaultstyle'
import { Excerpt } from '../../dom/excerpt'

export class Read460 {
    /** `data`: C++ ReadInOutData (the links of the master score are passed to the excerpts) */
    readScoreFile(score: Score, e: XmlReader, data: { links?: ReadLinks } | null = null): boolean {
        const ctx = new ReadContext(score)
        if (!score.isMaster() && data && data.links) {
            ctx.initLinks(data.links)
        }
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'programVersion') {
                const ver = e.readText()
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreVersion(ver)
                }
            } else if (tag === 'programRevision') {
                const rev = parseInt(e.readText(), 16)
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreRevision(rev)
                }
            } else if (tag === 'Revision' || tag === 'LastEID') {
                e.skipCurrentElement()
            } else if (tag === 'Score') {
                if (!this.readScoreTag(score, e, ctx)) {
                    return false
                }
            } else if (tag === 'museScore') {
                // pass
            } else {
                e.skipCurrentElement()
            }
        }
        if (!score.isMaster()) {
            score.excerpt()!.setTracksMapping([...ctx.tracks()])
        }

        ctx.clearOrphanedConnectors()

        if (data) {
            data.links = ctx.readLinks()
        }
        return true
    }

    readScoreTag(score: Score, e: XmlReader, ctx: ReadContext): boolean {
        const sysStaves: number[] = []
        while (e.readNextStartElement()) {
            ctx.setTrack(-1)
            const tag = e.name()
            if (tag === 'eid') {
                TRead.readItemEID(score, e, ctx)
            } else if (tag === 'Staff') {
                StaffRead.readStaff(score, e, ctx)
            } else if (tag === 'Omr' || tag === 'Audio' || tag === 'showOmr' || tag === 'LayerTag' || tag === 'Layer'
                       || tag === 'currentLayer' || tag === 'playMode') {
                e.skipCurrentElement()
            } else if (tag === 'Synthesizer') {
                score.synthesizerState().read(e)
            } else if (tag === 'open') {
                score.setIsOpen(e.readBool())
            } else if (tag === 'page-offset') {
                score.setPageNumberOffset(e.readInt())
            } else if (tag === 'Division') {
                score.setFileDivision(e.readInt())
            } else if (tag === 'showInvisible') {
                score.setShowInvisible(e.readInt() !== 0)
            } else if (tag === 'showUnprintable') {
                score.setShowUnprintable(e.readInt() !== 0)
            } else if (tag === 'showFrames') {
                score.setShowFrames(e.readInt() !== 0)
            } else if (tag === 'showMargins') {
                score.setShowPageborders(e.readInt() !== 0)
            } else if (tag === 'showSoundFlags') {
                score.setShowSoundFlags(e.readInt() !== 0)
            } else if (tag === 'markIrregularMeasures') {
                score.setMarkIrregularMeasures(e.readInt() !== 0)
            } else if (tag === 'Style') {
                // compat::ReadStyleHook::readStyleTag(score, e);
                score.style().read(e, new ReadChordListHook(score), score.mscVersion())
                score.styleChanged()
                score.setEngravingFont(engravingFonts().fontByName(score.style().styleSt(Sid.musicalSymbolFont)))
            } else if (tag === 'copyright' || tag === 'rights') {
                const t = Factory.createItem(ElementType.TEXT, score) as Text
                TRead.readText(t, e, ctx)
                score.setMetaTag('copyright', t.xmlText())
            } else if (tag === 'movement-number') {
                score.setMetaTag('movementNumber', e.readText())
            } else if (tag === 'movement-title') {
                score.setMetaTag('movementTitle', e.readText())
            } else if (tag === 'work-number') {
                score.setMetaTag('workNumber', e.readText())
            } else if (tag === 'work-title') {
                score.setMetaTag('workTitle', e.readText())
            } else if (tag === 'source') {
                score.setMetaTag('source', e.readText())
            } else if (tag === 'metaTag') {
                const name = e.attribute('name')
                score.setMetaTag(name, e.readText())
            } else if (tag === 'Order') {
                const order = new ScoreOrder()
                order.read(e)
                if (order.isValid()) {
                    score.setScoreOrder(order)
                }
            } else if (tag === 'SystemObjects') {
                score.clearSystemObjectStaves()
                while (e.readNextStartElement()) {
                    if (e.name() === 'Instance') {
                        const staffIdx = parseInt(e.attribute('staffId'), 10) - 1
                        // TODO: Decide what to do with "position" attribute
                        if (staffIdx > 0) {
                            sysStaves.push(staffIdx)
                        }
                        e.skipCurrentElement()
                    } else {
                        e.skipCurrentElement()
                    }
                }
            } else if (tag === 'SystemLocks') {
                TRead.readSystemLocks(score, e)
            } else if (tag === 'SystemDividers') {
                TRead.readSystemDividers(score, e, ctx)
            } else if (tag === 'Part') {
                const part = new Part(score)
                TRead.readPart(part, e, ctx)
                score.appendPart(part)
            } else if (tag === 'HairPin' || tag === 'Ottava' || tag === 'TextLine' || tag === 'Volta' || tag === 'Trill'
                       || tag === 'Slur' || tag === 'Pedal') {
                const s = Factory.createItemByName(tag, score) as Spanner | null
                if (!s) {
                    e.skipCurrentElement() // TODO(port): line spanners
                    continue
                }
                TRead.readItem(s, e, ctx)
                score.addSpanner(s)
            } else if (tag === 'initialPartId') {
                if (score.excerpt()) {
                    score.excerpt()!.setInitialPartId(String(e.readInt()))
                } else {
                    e.skipCurrentElement()
                }
            } else if (tag === 'Tracklist') {
                const strack = e.intAttribute('sTrack', -1)
                const dtrack = e.intAttribute('dstTrack', -1)
                if (strack !== -1 && dtrack !== -1) {
                    ctx.tracks().set(strack, dtrack)
                }
                e.skipCurrentElement()
            } else if (tag === 'name') {
                const n = e.readText()
                if (!score.isMaster()) { // ignore the name if it's not a child score
                    score.excerpt()!.setName(n, /*saveAndNotify*/ false)
                }
            } else if (tag === 'Score') {
                // Since version 400, Excerpts are usually stored in separate files,
                // but we also support reading them from the main mscx file.

                ctx.tracks().clear() // ???
                const m = score.masterScore()
                const s = m.createScore()

                // compat::ReadStyleHook::setupDefaultStyle(s)
                const defaultsVersion = m.style().defaultStyleVersion()
                s.setStyle(DefaultStyle.resolveStyleDefaults(defaultsVersion))
                s.style().setDefaultStyleVersion(defaultsVersion)

                const ex = new Excerpt(m)
                ex.setExcerptScore(s)
                ctx.setLastMeasure(null)

                const curScore = ctx.score()
                ctx.setScore(s)

                this.readScoreTag(s, e, ctx) // recursion

                ctx.setScore(curScore)

                s.linkMeasures(m)
                ex.setTracksMapping([...ctx.tracks()])
                m.addExcerpt(ex)
            } else if (tag === 'layoutMode') {
                if (ctx.forcePageMode()) {
                    e.skipCurrentElement()
                    continue
                }
                const s = e.readText()
                if (s === 'line') {
                    score.setLayoutMode(LayoutMode.LINE)
                } else if (s === 'system') {
                    score.setLayoutMode(LayoutMode.SYSTEM)
                }
            } else {
                e.unknown()
            }
        }
        ctx.reconnectBrokenConnectors()
        if (e.isError()) {
            return false
        }

        score.connectTies()
        // TODO(port): lyrics lines (dashes)
        score.setFileDivision(480)
        // TODO(port): instrument ids
        score.setUpTempoMap()
        // TODO(port): harmony channels, midi mapping
        for (const staff of score.staves()) {
            staff.updateOttava()
        }
        for (const idx of sysStaves) {
            score.addSystemObjectStaff(score.staff(idx)!)
        }
        return true
    }

    // =================================================================================================================
    //   paste (Read460::pasteStaff, pasteSymbols, doReadItem)
    // =================================================================================================================

    /** return false if paste fails */
    pasteStaff(e: XmlReader, dst: Segment, dstStaff: staff_idx_t, scale: Fraction): boolean {
        const score = dst.score()
        const ctx = new ReadContext(score)
        ctx.setPasteMode(true)

        const pastedHarmony: Harmony[] = []
        const graceNotes: Chord[] = []
        let startingBeam: Beam | null = null
        let tuplet: Tuplet | null = null
        let prevTremolo: TremoloTwoChord | null = null
        const dstTick = dst.tick()
        let pasted = false
        let tickLen = new Fraction(0, 1)
        let staves = 0
        let done = false
        const doScale = !scale.eq(new Fraction(1, 1))

        // C++ (ctx.tick() - dstTick) * scale + dstTick
        const scaledTick = (): Fraction => doScale ? ctx.tick().minus(dstTick).times(scale).plus(dstTick) : ctx.tick()

        while (e.readNextStartElement()) {
            if (done) {
                break
            }
            if (e.name() !== 'StaffList') {
                e.unknown()
                break
            }
            const version = e.attribute('version', 'NONE')
            if (version !== MSC_VERSION_STR) {
                // C++: LOGD("pasteStaff: bad version") (not checked in test mode)
                break
            }
            const tickStart = Fraction.fromString(e.attribute('tick'))
            const oTickLen = Fraction.fromString(e.attribute('len'))
            const timeStretch = e.hasAttribute('timeStretch') ? Fraction.fromString(e.attribute('timeStretch')) : new Fraction(1, 1)
            tickLen = oTickLen.times(scale)
            const staffStart = e.intAttribute('staff', 0)
            staves = e.intAttribute('staves', 0)

            if (tickLen.isZero() || staves === 0) {
                break
            }
            if (doScale) {
                const tickLenStretched = tickLen.times(timeStretch)
                if (!new TDuration(tickLenStretched).isValid()) {
                    // C++: LOGD("Can't paste: invalid duration %d/%d", ...)
                    return false
                }
            }

            const oEndTick = dstTick.plus(oTickLen)
            const oSpanner = score.spannerMap().findContained(dstTick.ticks(), oEndTick.ticks())
            let spannerFound = false

            ctx.setTickOffset(dstTick.minus(tickStart))
            ctx.setTick(new Fraction(0, 1))

            while (e.readNextStartElement()) {
                if (done) {
                    break
                }
                if (e.name() !== 'Staff') {
                    e.unknown()
                    break
                }
                ctx.setTransposeChromatic(0)
                ctx.setTransposeDiatonic(0)

                const srcStaffIdx = e.intAttribute('id', 0)
                ctx.setTrack(srcStaffIdx * VOICES)
                ctx.setTrackOffset((dstStaff - staffStart) * VOICES)
                const dstStaffIdx = Math.trunc(ctx.track() / VOICES)
                if (dstStaffIdx >= dst.score().nstaves()) {
                    // C++: LOGD("paste beyond staves")
                    done = true
                    break
                }
                if (dst.isInsideTupletOnStaff(dstStaffIdx)) {
                    done = true
                    break
                }
                // Check the time stretch for all measures overlapping the destination range.
                for (let m: Measure | null = dst.measure(); m && m.tick().lt(oEndTick); m = m.nextMeasure()) {
                    const mTimeStretch = dst.score().staff(dstStaffIdx)!.timeStretch(m.tick())
                    if (!mTimeStretch.eq(timeStretch)) {
                        MScore.setError(MsError.DEST_LOCAL_TIME_SIGNATURE)
                        return false
                    }
                }

                while (e.readNextStartElement()) {
                    pasted = true
                    const tag = e.name()

                    if (tag === 'transposeChromatic') {
                        ctx.setTransposeChromatic(e.readInt())
                    } else if (tag === 'transposeDiatonic') {
                        ctx.setTransposeDiatonic(e.readInt())
                    } else if (tag === 'voiceOffset') {
                        const voiceOffset: Fraction[] = []
                        for (let v = 0; v < VOICES; ++v) {
                            voiceOffset.push(new Fraction(1, 0))
                        }
                        while (e.readNextStartElement()) {
                            if (e.name() !== 'voice') {
                                e.unknown()
                            }
                            const voiceId = e.intAttribute('id', -1)
                            voiceOffset[voiceId] = Fraction.fromTicks(e.readInt()).times(timeStretch)
                        }
                        if (!score.makeGap1(dstTick, dstStaffIdx, tickLen.times(timeStretch), voiceOffset)) {
                            // C++: LOGD() << "cannot make gap in staff " << dstStaffIdx << " at tick " << dstTick.ticks()
                            done = true // break main loop, cannot make gap
                            break
                        }
                    } else if (tag === 'location') {
                        const loc = Location.relative()
                        TRead.readLocation(loc, e, ctx)
                        ctx.setLocation(loc)
                        if (loc.isTimeTick()) {
                            const measure = score.tick2measure(ctx.tick())!
                            EditTimeTickAnchors.createTimeTickAnchor(measure, ctx.tick().minus(measure.tick()), track2staff(ctx.track()))
                        }
                    } else if (tag === 'Tuplet') {
                        const oldTuplet = tuplet
                        const tick = scaledTick()
                        const measure = score.tick2measure(tick)!
                        tuplet = Factory.createItem(ElementType.TUPLET, measure) as Tuplet
                        tuplet.setTrack(ctx.track())
                        TRead.readTuplet(tuplet, e, ctx)
                        if (doScale) {
                            const ticksScaled = tuplet.ticks().times(scale)
                            if (!new TDuration(ticksScaled).isValid()) {
                                return false
                            }
                            tuplet.setTicks(ticksScaled)
                            tuplet.setBaseLen(new TDuration(tuplet.baseLen().fraction().times(scale)))
                        }
                        tuplet.setParent(measure)
                        tuplet.setTick(tick)
                        tuplet.setTuplet(oldTuplet)
                        if (tuplet.rtick().plus(tuplet.actualTicks()).gt(measure.ticks())) {
                            MScore.setError(MsError.TUPLET_CROSSES_BAR)
                            return false
                        }
                        if (oldTuplet) {
                            tuplet.readAddTuplet(oldTuplet)
                        }
                    } else if (tag === 'endTuplet') {
                        if (!tuplet) {
                            // C++: LOGD("Score::pasteStaff: encountered <endTuplet/> when no tuplet was started")
                            e.skipCurrentElement()
                            continue
                        }
                        const oldTuplet: Tuplet = tuplet
                        tuplet = tuplet.tuplet()
                        if (oldTuplet.elements().length === 0) {
                            // C++: LOGD("Score::pasteStaff: ended tuplet is empty")
                            if (tuplet) {
                                tuplet.remove(oldTuplet)
                            }
                        } else {
                            oldTuplet.sortElements()
                        }
                        e.readNext()
                    } else if (tag === 'Chord' || tag === 'Rest' || tag === 'MeasureRepeat') {
                        const cr = Factory.createItemByName(tag, scoreDummy(score)) as unknown as ChordRest
                        cr.setTrack(ctx.track())
                        TRead.readItem(cr, e, ctx)
                        cr.setSelected(false)
                        const tick = scaledTick()
                        if (score.tick2measure(tick)!.isMeasureRepeatGroup(dstStaffIdx)) {
                            const mr = score.tick2measure(tick)!.measureRepeatElement(dstStaffIdx)
                            score.deleteItem(mr) // resets any measures related to mr
                        }
                        if (startingBeam) {
                            startingBeam.add(cr) // also calls cr->setBeam(startingBeam)
                            startingBeam = null
                        }
                        if (cr.isGrace()) {
                            graceNotes.push(cr as unknown as Chord)
                        } else {
                            if (tuplet) {
                                cr.readAddTuplet(tuplet)
                            }
                            ctx.incTick(cr.actualTicksAt(tick))
                            if (doScale) {
                                const ticksScaled = cr.ticks().times(scale)
                                if (!new TDuration(ticksScaled).isValid()) {
                                    return false
                                }
                                cr.setTicks(ticksScaled)
                                cr.setDurationType(new TDuration(cr.durationTypeTicks().times(scale)))
                                for (const l of cr.lyrics()) {
                                    l.setTicks(l.ticks().times(scale))
                                }
                            }
                            if (cr.isChord()) {
                                const chord = cr as unknown as Chord
                                // disallow tie across barline within two-note tremolo
                                // tremolos can potentially still straddle the barline if no tie is required
                                // but these will be removed later

                                if (chord.tremoloTwoChord()) {
                                    prevTremolo = chord.tremoloTwoChord()
                                    prevTremolo!.setChord1(chord)
                                    chord.setTremoloTwoChord(prevTremolo)
                                } else if (!chord.tremoloTwoChord() && prevTremolo) {
                                    prevTremolo.setChord2(chord)
                                    chord.setTremoloTwoChord(prevTremolo)
                                    prevTremolo = null
                                }

                                const tremolo = chord.tremoloTwoChord()
                                if (tremolo && chord === tremolo.chord2()) {
                                    if (doScale) {
                                        const ticksScaled = tremolo.durationType().ticks().times(scale)
                                        if (!new TDuration(ticksScaled).isValid()) {
                                            return false
                                        }
                                        tremolo.setDurationType(new TDuration(ticksScaled))
                                    }
                                    const tremoloEndTick = tick.plus(chord.actualTicksAt(tick))
                                    const measureEndTick = score.tick2measure(tick)!.endTick()
                                    if (tremoloEndTick.gt(measureEndTick)) {
                                        MScore.setError(MsError.DEST_TREMOLO)
                                        return false
                                    }
                                }
                                for (let i = 0; i < graceNotes.length; ++i) {
                                    const gc = graceNotes[i]
                                    gc.setGraceIndex(i)
                                    if (gc.vStaffIdx() >= gc.score().nstaves()) {
                                        // check if staffMove moves a note to a
                                        // nonexistent staff
                                        gc.setStaffMove(0)
                                    }
                                    Transpose.transposeChord(gc, tick)
                                    chord.add(gc)
                                }
                                graceNotes.length = 0
                            }
                            // delete pending ties, they are not selected when copy
                            if (tick.minus(dstTick).plus(cr.actualTicksAt(tick)).ge(tickLen)) {
                                if (cr.isChord()) {
                                    const c = cr as unknown as Chord
                                    for (const note of c.notes()) {
                                        const tie = note.tieForNonPartial()
                                        if (tie) {
                                            note.setTieFor(null)
                                        }
                                    }
                                }
                            }
                            // shorten last cr to fit in the space made by makeGap
                            if (tick.minus(dstTick).plus(cr.actualTicksAt(tick)).gt(tickLen)) {
                                const newLength = tickLen.minus(tick.minus(dstTick))
                                // check previous CR on same track, if it has tremolo, delete the tremolo
                                // we don't want a tremolo and two different chord durations
                                if (cr.isChord()) {
                                    const s = score.tick2leftSegment(tick.minus(Fraction.eps()))
                                    if (s) {
                                        let crt = s.element(cr.track()) as unknown as ChordRest | null
                                        if (!crt) {
                                            crt = s.nextChordRest(cr.track(), true)
                                        }
                                        if (crt && crt.isChord()) {
                                            const chrt = crt as unknown as Chord
                                            const tr = chrt.tremoloTwoChord()
                                            if (tr) {
                                                tr.setChords(chrt, cr as unknown as Chord)
                                                chrt.remove(tr)
                                            }
                                        }
                                    }
                                }
                                if (!cr.tuplet()) {
                                    // shorten duration
                                    // exempt notes in tuplets, since we don't allow copy of partial tuplet anyhow
                                    cr.setTicks(newLength.times(timeStretch))
                                    cr.setDurationType(new TDuration(newLength.times(timeStretch)))
                                }
                            }
                            score.pasteChordRest(cr, tick)
                        }
                    } else if (tag === 'Spanner') {
                        TRead.readSpanner(e, ctx, score, ctx.track())
                        spannerFound = true
                    } else if (tag === 'Harmony') {
                        // transpose
                        const tick = scaledTick()
                        const m = score.tick2measure(tick)!
                        const seg = m.undoGetSegment(SegmentType.ChordRest, tick)
                        const harmony = Factory.createItem(ElementType.HARMONY, seg) as Harmony
                        harmony.setTrack(ctx.track())
                        TRead.readHarmony(harmony, e, ctx)
                        harmony.setTrack(ctx.track())

                        // TODO(port): Transpose::undoTransposeHarmony for transposing instruments in written pitch

                        // remove pre-existing chords on this track
                        // but be sure not to remove any we just added
                        for (const el of seg.findAnnotations(ElementType.HARMONY, ctx.track(), ctx.track())) {
                            if (!pastedHarmony.includes(el as unknown as Harmony)) {
                                score.undoRemoveElement(el)
                            }
                        }
                        harmony.setParent(seg)
                        score.undoAddElement(harmony)
                        pastedHarmony.push(harmony)
                    } else if (PASTE_STAFF_ANNOTATIONS.has(tag)) {
                        const el = Factory.createItemByName(tag, scoreDummy(score))
                        if (!el) {
                            // C++ creates every annotation type
                            e.skipCurrentElement()
                            continue
                        }
                        el.setTrack(ctx.track()) // a valid track might be necessary for el->read() to work
                        if (el.isFermata()) {
                            el.setPlacement(el.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
                        }
                        TRead.readItem(el, e, ctx)

                        const tick = scaledTick()
                        const m = score.tick2measure(tick)!
                        const seg = el.isFretDiagram()
                            ? m.undoGetSegment(SegmentType.ChordRest, tick)
                            : m.undoGetChordRestOrTimeTickSegment(tick)
                        el.setParent(seg)

                        // be sure to paste the element in the destination track;
                        // setting track needs to be repeated, as it might have been overwritten by el->read()
                        // preserve *voice* from source, though
                        el.setStaffIdx(Math.trunc(ctx.track() / VOICES))
                        score.undoAddElement(el)
                    } else if (tag === 'Clef') {
                        const tick = scaledTick()
                        let m = score.tick2measure(tick)!
                        if (m.tick().isNotZero() && m.tick().eq(tick)) {
                            m = m.prevMeasure()!
                        }
                        const segment = m.undoGetSegment(SegmentType.Clef, tick)
                        const clef = Factory.createItem(ElementType.CLEF, segment) as Clef
                        TRead.readClef(clef, e, ctx)
                        clef.setTrack(ctx.track())
                        clef.setParent(segment)
                        score.undoChangeElement(segment.element(ctx.track()), clef)
                    } else if (tag === 'Breath') {
                        const tick = scaledTick()
                        let m = score.tick2measure(tick)!
                        if (m.tick().eq(tick)) {
                            m = m.prevMeasure()!
                        }
                        const segment = m.undoGetSegment(SegmentType.Breath, tick)
                        const breath = Factory.createItem(ElementType.BREATH, segment) as Breath
                        breath.setTrack(ctx.track())
                        breath.setPlacement(breath.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
                        TRead.readBreath(breath, e, ctx)
                        breath.setParent(segment)
                        score.undoChangeElement(segment.element(ctx.track()), breath)
                    } else if (tag === 'Beam') {
                        const beam = Factory.createBeam(scoreDummy(score).system())
                        beam.setTrack(ctx.track())
                        TRead.readBeam(beam, e, ctx)
                        beam.resetExplicitParent()
                        // C++: if (startingBeam) LOGD("The read beam was not used"), delete startingBeam
                        startingBeam = beam
                    } else if (tag === 'BarLine') {
                        e.skipCurrentElement() // ignore bar line
                    } else {
                        // C++: LOGD("PasteStaff: element %s not handled", tag.ascii())
                        e.skipCurrentElement() // ignore
                    }
                }

                ctx.checkConnectors()
                // C++: if (startingBeam) LOGD("The read beam was not used"), delete startingBeam
                startingBeam = null
                if (tuplet) {
                    // C++: LOGD("<endTuplet/> not found")
                    if (tuplet.elements().length === 0) {
                        if (tuplet.tuplet()) {
                            tuplet.tuplet()!.remove(tuplet)
                        }
                    }
                }
            }
            // fix up spanners
            if (doScale && spannerFound) {
                // build list of original spanners
                const oSpannerList: Spanner[] = [...oSpanner]
                const nSpanner = score.spannerMap().findContained(dstTick.ticks(), oEndTick.ticks())
                for (const sp of nSpanner) {
                    // skip if not in this staff list
                    if (sp.staffIdx() < dstStaff || sp.staffIdx() >= dstStaff + staves) {
                        continue
                    }
                    // CHORD and NOTE spanners are normally handled already
                    if (sp.anchor() === SpannerAnchor.CHORD || sp.anchor() === SpannerAnchor.NOTE) {
                        continue
                    }
                    // skip if present originally
                    if (oSpannerList.includes(sp)) {
                        continue
                    }
                    const tick = sp.tick().minus(dstTick).times(scale).plus(dstTick)
                    sp.undoChangeProperty(Pid.SPANNER_TICK, tick)
                    sp.undoChangeProperty(Pid.SPANNER_TICKS, sp.ticks().times(scale))
                }
            }
        }

        for (const s of [score]) { // for all parts; TODO(port): scoreList() (excerpts)
            s.connectTies()
            // TODO(port): undoRemoveStaleTieJumpPoints(false)

            for (const sp of score.unmanagedSpanners()) {
                if (sp.isLyricsLine() && (sp as unknown as LyricsLine).isDash()) {
                    const line = sp as unknown as LyricsLine
                    line.setNextLyrics(searchNextLyrics(line.lyrics()!.segment(),
                        line.staffIdx(),
                        line.lyrics()!.verse(),
                        line.lyrics()!.placement(),
                    ))
                    line.setTrack2(line.nextLyrics() ? line.nextLyrics()!.track() : line.track())
                }
            }
        }

        if (pasted) { //select only if we pasted something
            let endStaff = dstStaff + staves
            if (endStaff > score.nstaves()) {
                endStaff = score.nstaves()
            }

            if (score.cmdState().layoutRange()) {
                score.setLayoutRange(dstTick, dstTick.plus(tickLen), dstStaff, endStaff, dst)
            }

            //TODO: look if this could be done different
            const dstM = score.tick2measure(dstTick)
            const endM = score.tick2measure(dstTick.plus(tickLen))
            for (let i = dstStaff; i < endStaff; i++) {
                for (let m = dstM; m && m !== (endM ? endM.nextMeasure() : null); m = m.nextMeasure()) {
                    m.checkMeasure(i)
                }
            }
            score.selection().setRangeTicks(dstTick, dstTick.plus(tickLen), dstStaff, endStaff)

            // C++: the views move the canvas to the first pasted element (adjustCanvasPosition)
            if (!score.selection().isRange()) {
                score.selection().setState(SelState.RANGE)
            }
        }
        return true
    }

    /**
     * pastes a list of symbols into cr and following ChordRest's
     * (Note: info about delta ticks is currently ignored)
     */
    pasteSymbols(e: XmlReader, dst: ChordRest): void {
        const score = dst.score()
        const ctx = new ReadContext(score)
        ctx.setPasteMode(true)

        let currSegm: Segment | null = dst.segment()
        let destTick = new Fraction(0, 1) // the tick and track to place the pasted element at
        let destTrack = 0
        const done = false
        let segDelta = 0
        const startSegm = currSegm
        const startTick = dst.tick() // the initial tick and track where to start pasting
        const startTrack = dst.track()
        const maxTrack = score.ntracks()

        while (e.readNextStartElement()) {
            if (done) {
                break
            }
            if (e.name() !== 'SymbolList') {
                e.unknown()
                break
            }
            const version = e.attribute('version', 'NONE')
            if (version !== MSC_VERSION_STR) {
                break
            }

            while (e.readNextStartElement()) {
                if (done) {
                    break
                }
                const tag = e.name()

                if (tag === 'trackOffset') {
                    destTrack = startTrack + e.readInt()
                    currSegm = startSegm
                } else if (tag === 'tickOffset') {
                    destTick = startTick.plus(Fraction.fromTicks(e.readInt()))
                } else if (tag === 'segDelta') {
                    segDelta = e.readInt()
                } else if (tag === 'Articulation' || tag === 'Ornament' || tag === 'Arpeggio' || tag === 'TremoloSingleChord') {
                    // Elements that can be attached only to a Chord
                    if (destTrack >= maxTrack) {
                        e.skipCurrentElement()
                        continue
                    }
                    const meas = score.tick2measure(destTick)
                    const seg = meas ? meas.undoGetSegment(SegmentType.ChordRest, destTick) : null
                    if (!seg) {
                        e.skipCurrentElement()
                        continue
                    }

                    const cr = seg.cr(destTrack)
                    if (!cr || !cr.isChord()) {
                        e.skipCurrentElement()
                        continue
                    }

                    const el = Factory.createItemByName(tag, scoreDummy(score))!
                    el.setTrack(destTrack)
                    TRead.readItem(el, e, ctx)
                    el.setTrack(destTrack)
                    el.setParent(cr)
                    score.undoAddElement(el)
                } else if (tag === 'Fermata') {
                    if (destTrack >= maxTrack) {
                        e.skipCurrentElement()
                        continue
                    }
                    const meas = score.tick2measure(destTick)
                    const seg = meas ? meas.undoGetSegment(SegmentType.ChordRest, destTick) : null
                    if (!seg) {
                        e.skipCurrentElement()
                        continue
                    }

                    const b = Factory.createItem(ElementType.FERMATA, scoreDummy(score).segment()) as Fermata
                    b.setTrack(destTrack)
                    TRead.readFermata(b, e, ctx)
                    b.setTrack(destTrack)
                    b.setParent(seg)
                    score.undoAddElement(b)
                } else if (tag === 'Breath') {
                    if (destTrack >= maxTrack) {
                        e.skipCurrentElement()
                        continue
                    }
                    const meas = score.tick2measure(destTick)
                    const seg = meas ? meas.undoGetSegment(SegmentType.Breath, destTick) : null
                    if (!seg) {
                        e.skipCurrentElement()
                        continue
                    }

                    const b = Factory.createItem(ElementType.BREATH, scoreDummy(score).segment()) as Breath
                    b.setTrack(destTrack)
                    TRead.readBreath(b, e, ctx)
                    b.setTrack(destTrack)
                    b.setParent(seg)
                    score.undoAddElement(b)
                } else if (tag === 'Dynamic' || tag === 'Expression' || tag === 'StaffText' || tag === 'PlayTechAnnotation'
                           || tag === 'Sticking' || tag === 'Capo' || tag === 'HarpPedalDiagram' || tag === 'StringTunings') {
                    if (destTrack >= maxTrack) {
                        e.skipCurrentElement()
                        continue
                    }
                    // Text elements that can be attached to ChordRest or TimeTick segments
                    const meas = score.tick2measure(destTick)
                    const seg = meas ? meas.undoGetChordRestOrTimeTickSegment(destTick) : null
                    if (!seg) {
                        e.skipCurrentElement()
                        continue
                    }

                    const el = Factory.createItemByName(tag, scoreDummy(score))
                    if (!el) {
                        // C++ creates every annotation type
                        e.skipCurrentElement()
                        continue
                    }
                    el.setTrack(destTrack)
                    TRead.readItem(el, e, ctx)
                    el.setTrack(destTrack)
                    el.setParent(seg)
                    score.undoAddElement(el)
                } else if (PASTE_SYMBOLS_SPANNERS.has(tag)) {
                    // Spanners
                    if (destTrack >= maxTrack) {
                        e.skipCurrentElement()
                        continue
                    }
                    const sp = Factory.createItemByName(tag, scoreDummy(score)) as unknown as Spanner | null
                    if (!sp) {
                        // TODO(port): spanner types not ported yet (Rasgueado, HarmonicMark, PickScrape)
                        e.skipCurrentElement()
                        continue
                    }
                    sp.setTrack(destTrack)
                    TRead.readItem(sp, e, ctx)
                    sp.setTrack(destTrack)
                    sp.setTrack2(destTrack)
                    sp.setTick(destTick)
                    score.undoAddElement(sp)
                } else if (tag === 'Harmony' || tag === 'FretDiagram') {
                    //
                    // Harmony elements (= chord symbols) are positioned respecting
                    // the original tickOffset: advance to destTick (or near)
                    // same for FretDiagram elements
                    //
                    const meas = score.tick2measure(destTick)
                    const seg = meas ? meas.undoGetChordRestOrTimeTickSegment(destTick) : null

                    if (destTrack >= maxTrack || seg === null) {
                        e.skipCurrentElement() // ignore
                        continue
                    }
                    if (tag === 'Harmony') {
                        const el = Factory.createItem(ElementType.HARMONY, seg) as Harmony
                        el.setTrack(trackZeroVoice(destTrack))
                        TRead.readHarmony(el, e, ctx)
                        el.setTrack(trackZeroVoice(destTrack))
                        // TODO(port): transpose (Transpose::undoTransposeHarmony) for transposing instruments
                        el.setParent(seg)
                        score.undoAddElement(el)
                    } else {
                        const el = Factory.createItem(ElementType.FRET_DIAGRAM, seg) as FretDiagram
                        el.setTrack(trackZeroVoice(destTrack))
                        TRead.readFretDiagram(el, e, ctx)
                        el.setTrack(trackZeroVoice(destTrack))
                        el.setParent(seg)
                        score.undoAddElement(el)
                    }
                } else if (tag === 'Lyrics' || tag === 'FiguredBass') {
                    // These elements are positioned respecting the distance in chords,
                    // rather than the time distance.
                    // TODO: is that appropriate for FiguredBass too? To be considered
                    // when overhauling FiguredBass.
                    for (; currSegm && segDelta > 0; segDelta--) {
                        currSegm = currSegm.nextCR(destTrack)
                    }
                    // check the intended dest. track and segment exist
                    if (destTrack >= maxTrack || currSegm === null) {
                        e.skipCurrentElement() // ignore
                        continue
                    }
                    // check there is a segment element in the required track
                    if (currSegm.element(destTrack) === null) {
                        e.skipCurrentElement()
                        continue
                    }

                    if (tag === 'Lyrics') {
                        // with lyrics, skip rests
                        let cr = currSegm.element(destTrack) as unknown as ChordRest
                        while (!cr.isChord() && currSegm) {
                            currSegm = currSegm.nextCR(destTrack)
                            if (currSegm) {
                                cr = currSegm.element(destTrack) as unknown as ChordRest
                            } else {
                                break
                            }
                        }
                        if (currSegm === null) {
                            e.skipCurrentElement()
                            continue
                        }
                        if (!cr.isChord()) {
                            e.skipCurrentElement()
                            continue
                        }
                        const el = Factory.createItem(ElementType.LYRICS, cr) as Lyrics
                        el.setTrack(destTrack)
                        TRead.readLyrics(el, e, ctx)
                        el.setTrack(destTrack)
                        el.setParent(cr)
                        score.undoAddElement(el)
                    } else if (tag === 'FiguredBass') {
                        // FiguredBass always belongs to first staff voice
                        destTrack = trackZeroVoice(destTrack)
                        let ticks: Fraction
                        const el = Factory.createItem(ElementType.FIGURED_BASS, currSegm) as FiguredBass
                        el.setTrack(destTrack)
                        TRead.readFiguredBass(el, e, ctx)
                        el.setTrack(destTrack)
                        // if f.b. is off-note, we have to locate a place before currSegm
                        // where an on-note f.b. element could (potentially) be
                        // (while having an off-note f.b. without an on-note one before it
                        // is un-idiomatic, possible mismatch in rhythmic patterns between
                        // copy source and paste destination does not allow to be too picky)
                        if (!el.onNote()) {
                            let onNoteFB: FiguredBass | null = null
                            let prevSegm: Segment | null = currSegm
                            let done1 = false
                            while (prevSegm) {
                                if (done1) {
                                    break
                                }
                                prevSegm = prevSegm.prev1(SegmentType.ChordRest)
                                if (!prevSegm) {
                                    break // C++ dereferences null here
                                }
                                // if there is a ChordRest in the dest. track
                                // this segment is a (potential) f.b. location
                                if (prevSegm.element(destTrack) !== null) {
                                    done1 = true
                                }
                                // in any case, look for a f.b. in annotations:
                                // if there is a f.b. element in the right track,
                                // this is an (actual) f.b. location
                                for (const a of prevSegm.annotations()) {
                                    if (a.isFiguredBass() && a.track() === destTrack) {
                                        onNoteFB = a as unknown as FiguredBass
                                        done1 = true
                                    }
                                }
                            }
                            if (!prevSegm) {
                                // C++: LOGD("PasteSymbols: can't place off-note FiguredBass")
                                continue
                            }
                            // by default, split on-note duration in half: half on-note and half off-note
                            const totTicks = currSegm.tick().minus(prevSegm.tick())
                            const destTick1 = prevSegm.tick().plus(totTicks.times(new Fraction(1, 2)))
                            ticks = totTicks.times(new Fraction(1, 2))
                            if (onNoteFB) {
                                onNoteFB.setTicks(totTicks.times(new Fraction(1, 2)))
                            }
                            // look for a segment at this tick; if none, create one
                            let nextSegm: Segment | null = prevSegm
                            while (nextSegm && nextSegm.tick().lt(destTick1)) {
                                nextSegm = nextSegm.next1(SegmentType.ChordRest)
                            }
                            if (!nextSegm || nextSegm.tick().gt(destTick1)) { // no ChordRest segm at this tick
                                nextSegm = new Segment(prevSegm.measure(), SegmentType.ChordRest, destTick1)
                                score.undoAddElement(nextSegm)
                            }
                            currSegm = nextSegm
                        } else {
                            // by default, assign to FiguredBass element the duration of the chord it refers to
                            ticks = (currSegm.element(destTrack) as unknown as ChordRest).ticks()
                        }
                        // in both cases, look for an existing f.b. element in segment and remove it, if found
                        let oldFB: FiguredBass | null = null
                        for (const a of currSegm.annotations()) {
                            if (a.isFiguredBass() && a.track() === destTrack) {
                                oldFB = a as unknown as FiguredBass
                                break
                            }
                        }
                        if (oldFB) {
                            score.undoRemoveElement(oldFB)
                        }
                        el.setParent(currSegm)
                        el.setTicks(ticks)
                        score.undoAddElement(el)
                    }
                } else {
                    // C++: LOGD("PasteSymbols: element %s not handled", tag.ascii())
                    e.skipCurrentElement() // ignore
                }
            } // outer while readNextstartElement()
        } // inner while readNextstartElement()
    }

    doReadItem(item: EngravingItem, xml: XmlReader): void {
        const ctx = new ReadContext(item.score())
        ctx.setPasteMode(true)
        TRead.readItem(item, xml, ctx)
    }
}

/** Constants::MSC_VERSION_STR (the clipboard data must have the version of the program) */
const MSC_VERSION_STR = '4.70'

/** the annotations Read460::pasteStaff reads with Factory::createItemByName */
const PASTE_STAFF_ANNOTATIONS: ReadonlySet<string> = new Set([
    'Dynamic', 'Expression', 'Symbol', 'FretDiagram', 'TremoloBar', 'Marker', 'Jump', 'Image', 'Text', 'StaffText',
    'PlayTechAnnotation', 'Capo', 'StringTunings', 'TempoText', 'FiguredBass', 'Sticking', 'Fermata', 'HarpPedalDiagram',
])

/** the spanners Read460::pasteSymbols reads */
const PASTE_SYMBOLS_SPANNERS: ReadonlySet<string> = new Set([
    'Slur', 'HairPin', 'Ottava', 'Trill', 'LetRing', 'Vibrato', 'PalmMute', 'WhammyBar', 'Rasgueado', 'HarmonicMark',
    'PickScrape', 'TextLine', 'Pedal',
])

const s_read460 = new Read460()
RWRegister.setReader({
    pasteStaff: (e, dst, dstStaff, scale) => s_read460.pasteStaff(e, dst, dstStaff, scale),
    pasteSymbols: (e, dst) => s_read460.pasteSymbols(e, dst),
    readItem: (item, xml) => s_read460.doReadItem(item, xml),
})
