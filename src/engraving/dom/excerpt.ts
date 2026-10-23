/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/excerpt.h/.cpp: the parts (excerpts) of a score and how their scores are created by
 * cloning and linking the staves of the master score (createExcerpt, cloneStaves, cloneStaff, cloneStaff2, ...).
 * The MasterScore functions of excerpt.cpp (initAndAddExcerpt, initExcerpt, deleteExcerpt, ...) are in
 * editing/editexcerpt.ts.
 *
 * TODO(port): Tie::updatePossibleJumpPoints (tie jump points over repeats), Excerpt::nameChanged (notification)
 */

import { ElementType, GuitarBendType, LayoutBreakType, StaffGroup, TextStyleType, VOICES, nidx, staff2track, trackZeroVoice } from '../types/types'
import { Fraction } from '../types/fraction'
import { Sid } from '../style/styledef'
import { isEqual } from '../../framework/global/realfn'
import { ClefInfo } from './clefinfo'
import { Factory } from './factory'
import { Instrument } from './instrument'
import { Part } from './part'
import { PropertyFlags, Pid } from './property'
import { SegmentType, CHORD_REST_OR_TIME_TICK_TYPE } from './segment'
import { Spanner } from './spanner'
import { StaffType, StaffTypes } from './stafftype'
import { Text } from './text'
import { isSystemTextLine } from './textlinebase'
import { Link } from '../editing/addremoveelement'
import { Transpose } from '../editing/transpose'
import { scoreStyleChanged } from '../editing/editstyle'
import type { Beam } from './beam'
import type { Box, TBox, VBox } from './box'
import type { Capo } from './capo'
import type { Chord, GraceNotesGroup } from './chord'
import type { ChordRest } from './chordrest'
import type { Clef } from './clef'
import type { EngravingItem } from './engravingitem'
import type { FretDiagram } from './fret'
import type { GuitarBend } from './guitarbend'
import type { Harmony } from './harmony'
import type { LayoutBreak } from './layoutbreak'
import type { MasterScore } from './masterscore'
import type { Measure } from './measure'
import type { MeasureBase } from './measurebase'
import type { Note } from './note'
import type { Ornament } from './ornament'
import type { Rest } from './rest'
import type { Score } from './score'
import type { Segment } from './segment'
import type { Staff } from './staff'
import type { Tie } from './tie'
import type { TremoloTwoChord } from './tremolotwochord'
import type { Tuplet } from './tuplet'

/** C++ TracksMap (std::multimap<track_idx_t, track_idx_t>): pairs sorted by the master track */
export type TracksMap = Array<[number, number]>

/** muse::value(multimap, key, default): the first value of the key */
function mapValue(map: TracksMap, key: number, def = nidx): number {
    const p = map.find(([k]) => k === key)
    return p ? p[1] : def
}

/** muse::values(multimap, key) */
function mapValues(map: TracksMap, key: number): number[] {
    return map.filter(([k]) => k === key).map(([, v]) => v)
}

/** muse::key(multimap, value, default): the first key of the value */
function mapKey(map: TracksMap, value: number, def = nidx): number {
    const p = map.find(([, v]) => v === value)
    return p ? p[0] : def
}

function sortTracksMap(map: TracksMap): TracksMap {
    // std::multimap: sorted by key, equal keys in insertion order (Array.prototype.sort is stable)
    return [...map].sort((a, b) => a[0] - b[0])
}

/** muse::io::escapeFileName */
export function escapeFileName(fn: string): string {
    fn = fn.replace(/\s+/g, ' ').trim() // simplified()
    return fn.replace(/ /g, '_')
        .replace(/\n/g, '_')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/Ä/g, 'Ae')
        .replace(/Ö/g, 'Oe')
        .replace(/Ü/g, 'Ue')
        .replace(/♭/g, 'b') // musical flat sign, happen in instrument names, so can happen in part (file) names
        .replace(/♯/g, '#') // musical sharp sign, can happen in titles, so can happen in score (file) names
        // FAT/NTFS special chars
        .replace(/[<>:"/\\|?*]/g, '_')
}

/** dom/utils.cpp formatUniqueExcerptName */
export function formatUniqueExcerptName(baseName: string, allExcerptLowerNames: readonly string[]): string {
    let result = baseName
    let num = 0

    while (allExcerptLowerNames.includes(result.toLowerCase())) {
        result = `${baseName} (${++num})`
    }

    return result
}

declare module './part' {
    interface Part {
        /** C++ Part::setStaves (part.cpp; here because Factory cannot be imported by part.ts) */
        setStaves(n: number): void
    }
}

Part.prototype.setStaves = function (this: Part, n: number): void {
    const ns = this.nstaves()
    if (n < ns) {
        // C++: LOGD("Part::setStaves(): remove staves not implemented!")
        return
    }

    let staffIdx = (ns ? this.staff(0)!.idx() : this.score().nstaves()) + ns
    for (let i = ns; i < n; ++i) {
        const staff = Factory.createStaff(this)
        this.score().insertStaff(staff, i)

        for (let m = this.score().firstMeasure(); m; m = m.nextMeasure()) {
            m.insertStaff(staff, staffIdx)
            if (m.hasMMRest()) {
                m.mmRest()!.insertStaff(staff, staffIdx)
            }
        }
        ++staffIdx
    }
}

/** C++ TieMap (LinkMap<Tie>): the clones of the ties by their originals */
class TieMap extends Map<Tie, Tie> {
    findNew(o: Tie): Tie | null { return this.get(o) ?? null }
}

/** C++ TupletMap */
class TupletMap extends Map<Tuplet, Tuplet> {
    findNew(o: Tuplet): Tuplet | null { return this.get(o) ?? null }
}

function scoreContainsSpanner(score: Score, spanner: Spanner): boolean {
    for (const curSpanner of score.spanner()) {
        if (curSpanner.links() && curSpanner.links()!.includes(spanner)) {
            return true
        }
    }

    return false
}

function updateSpatium(oldElement: EngravingItem, newElement: EngravingItem): void {
    const oldSpatium = oldElement.spatium()
    const newSpatium = newElement.spatium()
    if (!isEqual(oldSpatium, newSpatium)) {
        newElement.spatiumChanged(oldSpatium, newSpatium)
    }
}

function cloneTuplets(ocr: ChordRest, ncr: ChordRest, ot: Tuplet, tupletMap: TupletMap, nm: Measure, track: number): void {
    const handleTuplet = (tuplet: Tuplet): void => {
        tuplet.clear()
        tuplet.setTrack(track)
        tuplet.setParent(nm)
        tuplet.styleChanged()
        tuplet.scanElements((newElement: EngravingItem) => updateSpatium(ot, newElement))
    }

    ot.setTrack(ocr.track())

    let nt = tupletMap.findNew(ot)
    if (!nt) {
        nt = ot.linkedClone() as Tuplet
        handleTuplet(nt)
        tupletMap.set(ot, nt)

        let nt1 = nt
        while (ot.tuplet()) {
            let nt2 = tupletMap.findNew(ot.tuplet()!)
            if (!nt2) {
                nt2 = ot.tuplet()!.linkedClone() as Tuplet
                handleTuplet(nt2)
                tupletMap.set(ot.tuplet()!, nt2)
            }
            nt2.add(nt1)
            nt1.setTuplet(nt2)
            ot = ot.tuplet()!
            nt1 = nt2
        }
    }
    nt.add(ncr)
    ncr.setTuplet(nt)
}

function processLinkedClone(ne: EngravingItem, score: Score, strack: number): void {
    // reset offset as most likely it will not fit
    const f = ne.propertyFlags(Pid.OFFSET)
    if (f === PropertyFlags.UNSTYLED) {
        ne.setPropertyFlags(Pid.OFFSET, PropertyFlags.STYLED)
        ne.resetProperty(Pid.OFFSET)
    }
    ne.setTrack(strack === nidx ? 0 : strack)
    ne.setScore(score)
}

function addTies(originalNote: Note, newNote: Note, tieMap: TieMap, score: Score): void {
    const otf = originalNote.tieFor()
    if (otf && otf.type() === ElementType.TIE) {
        const tie = otf.linkedClone() as Tie
        tie.setScore(score)
        newNote.setTieFor(tie)
        tie.setStartNote(newNote)
        tie.setTrack(newNote.track())
        tieMap.set(otf, tie)
    }
    const otb = originalNote.tieBack()
    if (otb && otb.type() === ElementType.TIE) {
        const tie = tieMap.findNew(otb)
        if (tie) {
            newNote.setTieBack(tie)
            tie.setEndNote(newNote)
            tie.setTrack2(newNote.track())
        }
        // C++: LOGD("addTiesToMap: cannot find tie")
    }

    const opt = originalNote.outgoingPartialTie()
    if (opt) {
        const npt = newNote.outgoingPartialTie()
        if (npt) {
            tieMap.set(opt, npt)
        }
    }
}

function addBackSpanners(on: Note, nn: Note, score: Score): void {
    // add back spanners (going back from end to start spanner element
    // makes sure the 'other' spanner anchor element is already set up)
    // 'on' is the old spanner end note and 'nn' is the new spanner end note
    for (const oldSp of on.spannerBack()) {
        const newStart = Spanner.startElementFromSpanner(oldSp, nn)
        if (newStart) {
            const newSp = oldSp.linkedClone() as Spanner
            newSp.setNoteSpan(newStart, nn)
            score.addElement(newSp)
        }
        // C++: LOGD("cloneStaff2: cannot find spanner start note")
    }
}

function addGraceNoteTiesAndBackSpanners(originalGraceNotes: GraceNotesGroup, newChord: Chord, tieMap: TieMap, score: Score): void {
    for (const oldGrace of originalGraceNotes) {
        const newGrace = newChord.graceNoteAt(oldGrace.graceIndex())
        if (!newGrace) {
            continue
        }

        const notes = oldGrace.notes().length
        for (let i = 0; i < notes; ++i) {
            const originalNote = oldGrace.notes()[i]
            const newNote = newGrace.notes()[i]

            addTies(originalNote, newNote, tieMap, score)
            addBackSpanners(originalNote, newNote, score)
        }
    }
}

function addTremoloTwoChord(oldChord: Chord | null, newChord: Chord | null, prev: { tremolo: TremoloTwoChord | null }): void {
    if (!newChord || !oldChord || !newChord.tremoloTwoChord()) {
        return
    }

    const ot = oldChord.tremoloTwoChord()!
    if (oldChord === ot.chord1()) {
        prev.tremolo = newChord.tremoloTwoChord()
    } else if (oldChord === ot.chord2()) {
        if (prev.tremolo) {
            prev.tremolo.setChords(prev.tremolo.chord1(), newChord)
            newChord.setTremoloTwoChord(prev.tremolo)
        }
        // C++: LOGD("first note for two note tremolo missing")
    }
    // C++: LOGD("inconsistent two note tremolo")
}

function collectTieEndPoints(_tieMap: TieMap): void {
    // TODO(port): Tie::updatePossibleJumpPoints() of the new ties (and outgoing partial ties)
}

function cloneMeasure(mb: MeasureBase, score: Score, oscore: Score, sourceStavesIndexes: readonly number[],
    trackList: TracksMap, tieMap: TieMap): MeasureBase {
    let nmb: MeasureBase

    if (mb.isHBox()) {
        nmb = Factory.createItem(ElementType.HBOX, score.dummySystem()) as MeasureBase
        nmb.setTick(mb.tick())
        nmb.setTicks(mb.ticks())
    } else if (mb.isVBox()) {
        if ((mb as Box).isTitleFrame()) {
            nmb = Factory.createTitleVBox(score.dummySystem())
        } else {
            nmb = Factory.createItem(ElementType.VBOX, score.dummySystem()) as MeasureBase
        }
        nmb.setTick(mb.tick())
        nmb.setTicks(mb.ticks())
    } else if (mb.isFBox()) {
        nmb = Factory.createItem(ElementType.FBOX, score.dummySystem()) as MeasureBase
        nmb.setTick(mb.tick())
        nmb.setTicks(mb.ticks())
    } else if (mb.isTBox()) {
        nmb = Factory.createItem(ElementType.TBOX, score.dummySystem()) as MeasureBase
        nmb.setTick(mb.tick())
        nmb.setTicks(mb.ticks())
        const text = (mb as TBox).text()
        const ne = text.linkedClone()
        ne.setScore(score)
        nmb.add(ne)
    } else {
        const m = mb as Measure
        const nm = Factory.createItem(ElementType.MEASURE, score.dummySystem()) as Measure
        nmb = nm
        nm.setTick(m.tick())
        nm.setTicks(m.ticks())
        nm.setTimesig(m.timesig())

        nm.setRepeatCount(m.repeatCount())
        nm.setRepeatStart(m.repeatStart())
        nm.setRepeatEnd(m.repeatEnd())
        nm.setRepeatJump(m.repeatJump())

        nm.setIrregular(m.irregular())
        nm.setNo(m.no())
        nm.setNoOffset(m.noOffset())
        nm.setBreakMultiMeasureRest(m.breakMultiMeasureRest())

        for (let dstStaffIdx = 0; dstStaffIdx < sourceStavesIndexes.length; ++dstStaffIdx) {
            nm.setStaffStemless(dstStaffIdx, m.stemless(sourceStavesIndexes[dstStaffIdx]))
        }
        let tracks = oscore.nstaves() * VOICES

        if (!sourceStavesIndexes.length && !trackList.length) {
            tracks = 0
        }

        for (let srcTrack = 0; srcTrack < tracks; ++srcTrack) {
            const tupletMap = new TupletMap() // tuplets cannot cross measure boundaries

            const strack = mapValue(trackList, srcTrack)

            const prevTremolo = { tremolo: null as TremoloTwoChord | null }
            for (let oseg = m.first(); oseg; oseg = oseg.next()) {
                let ns: Segment | null = null // create segment later, on demand
                for (const e of oseg.annotations()) {
                    if (e.generated() || e.excludeFromOtherParts()) {
                        continue
                    }
                    if ((e.track() === srcTrack && strack !== nidx && !e.systemFlag())
                        || (e.systemFlag() && srcTrack === 0 && e.track() === srcTrack)) {
                        const ne = e.linkedClone()
                        processLinkedClone(ne, score, strack)
                        if (!ns) {
                            ns = nm.getSegment(oseg.segmentType(), oseg.tick())
                        }
                        ns.add(ne)
                        // for chord symbols,
                        // re-render with new style settings
                        if (ne.isFretDiagram()) {
                            const h = (ne as FretDiagram).harmony()
                            if (h) {
                                processLinkedClone(h, score, strack)
                            }
                        }
                    }
                }

                // If track is not mapped skip the following
                if (mapValue(trackList, srcTrack) === nidx) {
                    continue
                }

                // TimeSig and KeySig announce should never be cloned
                if (oseg.isTimeSigAnnounceType() || oseg.isKeySigAnnounceType()) {
                    continue
                }

                // There are probably more destination tracks for the same source
                const t = mapValues(trackList, srcTrack)

                for (const track of t) {
                    // Clone KeySig TimeSig and Clefs if voice 1 of source staff is not mapped to a track
                    const oef = oseg.element(trackZeroVoice(srcTrack))
                    if (oef && !oef.generated() && (oef.isTimeSig() || oef.isKeySig())
                        && !(trackList.length === (score.excerpt()!.nstaves() * VOICES))) {
                        const ne = oef.linkedClone()
                        ne.setTrack(trackZeroVoice(track))
                        ne.setScore(score)
                        ns = nm.getSegment(oseg.segmentType(), oseg.tick())
                        ns.add(ne)
                    }

                    const oe = oseg.element(srcTrack)
                    const clone = !!oe && !oe.generated() && !oe.excludeFromOtherParts()

                    if (clone) {
                        oe!.setGenerated(false)
                        const ne = oe!.linkedClone()
                        ne.setTrack(track)

                        if (!(ne.track() % VOICES) && ne.isRest()) {
                            (ne as Rest).setGap(false)
                        }

                        ne.setScore(score)
                        if (oe!.isChordRest()) {
                            const ocr = oe as ChordRest
                            const ncr = ne as ChordRest

                            const ob = ocr.beam()
                            if (ob && !ob.empty() && ob.elements()[0] === ocr) {
                                const nb = ob.clone() as Beam
                                nb.clear()
                                nb.setTrack(track)
                                nb.setParent(nm.system())
                                nb.setScore(score)
                                nb.add(ncr)
                                ncr.setBeam(nb)
                            }

                            const ot = ocr.tuplet()

                            if (ot) {
                                cloneTuplets(ocr, ncr, ot, tupletMap, nm, track)
                            }

                            if (oe!.isChord()) {
                                const och = ocr as Chord
                                const nch = ncr as Chord
                                addGraceNoteTiesAndBackSpanners(och.graceNotesBefore(), nch, tieMap, score)
                                const n = och.notes().length
                                for (let i = 0; i < n; ++i) {
                                    const on = och.notes()[i]
                                    const nn = nch.notes()[i]

                                    addTies(on, nn, tieMap, score)
                                    // add back spanners (going back from end to start spanner element
                                    // makes sure the 'other' spanner anchor element is already set up)
                                    // 'on' is the old spanner end note and 'nn' is the new spanner end note
                                    for (const oldSp of on.spannerBack()) {
                                        if (oldSp.startElement() && oldSp.endElement()
                                            && oldSp.startElement()!.track() > oldSp.endElement()!.track()) {
                                            continue
                                        }
                                        const newStart = Spanner.startElementFromSpanner(oldSp, nn)
                                        if (newStart) {
                                            const newSp = oldSp.linkedClone() as Spanner
                                            newSp.setNoteSpan(newStart, nn)
                                            score.addElement(newSp)
                                        }
                                        // C++: LOGD("cloneStaves: cannot find spanner start note")
                                    }
                                    for (const oldSp of on.spannerFor()) {
                                        if (oldSp.startElement() && oldSp.endElement()
                                            && oldSp.startElement()!.track() <= oldSp.endElement()!.track()) {
                                            continue
                                        }
                                        const newEnd = Spanner.endElementFromSpanner(oldSp, nn)
                                        if (newEnd) {
                                            const newSp = oldSp.linkedClone() as Spanner
                                            newSp.setNoteSpan(nn, newEnd)
                                            score.addElement(newSp)
                                        }
                                        // C++: LOGD("cloneStaves: cannot find spanner end note")
                                    }
                                }
                                addGraceNoteTiesAndBackSpanners(och.graceNotesAfter(), nch, tieMap, score)
                                addTremoloTwoChord(och, nch, prevTremolo)
                            }
                        }
                        if (!ns) {
                            ns = nm.getSegment(oseg.segmentType(), oseg.tick())
                        }
                        ns.add(ne)
                    }

                    const tst = nm.first(SegmentType.ChordRest)
                    if (srcTrack % VOICES && !(track % VOICES) && (!tst || !tst.element(track))) {
                        const segment = nm.getSegment(SegmentType.ChordRest, nm.tick())
                        const rest = Factory.createItem(ElementType.REST, segment) as Rest
                        rest.setTicks(nm.ticks())
                        rest.setDurationType(nm.ticks())
                        rest.setTrack(track)
                        segment.add(rest)
                    }
                }
            }
        }
    }

    score.undo(new Link(nmb, mb))
    nmb.setExcludeFromOtherParts(false)

    for (const e of mb.el()) {
        if (e.isLayoutBreak()) {
            const st = (e as LayoutBreak).layoutBreakType()
            if (st !== LayoutBreakType.SECTION) {
                continue
            }
        }
        let track = nidx
        if (e.track() !== nidx) {
            // try to map track
            track = mapValue(trackList, e.track())
            if (e.systemFlag() && !e.isTopSystemObject()) {
                continue
            }
            if (track === nidx) {
                // even if track not in excerpt, we need to clone system elements
                if (e.systemFlag() && e.track() === 0) {
                    track = 0
                } else if (e.isFretDiagram() && (e as FretDiagram).isInFretBox()) {
                    track = e.track()
                } else {
                    continue
                }
            }
        }

        let ne: EngravingItem
        // link text - title, subtitle, also repeats (eg, coda/segno)
        // measure numbers are not stored in this list, but they should not be cloned anyhow
        // layout breaks other than section were skipped above,
        // but section breaks do need to be cloned & linked
        // other measure-attached elements (?) are cloned but not linked
        if (e.isText() && (e as Text).textStyleType() === TextStyleType.INSTRUMENT_EXCERPT) {
            // skip part name in score
            continue
        } else if (e.isTextBase() || e.isLayoutBreak()) {
            ne = e.linkedClone()
            ne.setAutoplace(true)
        } else {
            ne = e.clone()
        }
        ne.setScore(score)
        ne.setTrack(track)
        nmb.add(ne)
    }

    return nmb
}

export class Excerpt {
    private m_excerptScore: Score | null = null
    private m_name = ''
    private m_fileName = ''
    private m_parts: Part[] = []
    private m_tracksMapping: TracksMap = []
    private m_initialPartId = ''
    private m_inited = false

    constructor(private m_masterScore: MasterScore | null = null) {}

    /** C++ Excerpt(const Excerpt& ex, bool copyContents = true) */
    clone(copyContents = true): Excerpt {
        const ex = new Excerpt(this.m_masterScore)
        ex.m_name = this.m_name
        ex.m_parts = [...this.m_parts]
        ex.m_initialPartId = this.m_initialPartId
        if (copyContents) {
            ex.m_tracksMapping = [...this.m_tracksMapping]
            ex.m_excerptScore = this.m_excerptScore ? this.m_excerptScore.clone() : null

            if (ex.m_excerptScore) {
                ex.m_excerptScore.setExcerpt(ex)
            }
        }
        return ex
    }

    inited(): boolean { return this.m_inited }
    setInited(v: boolean): void { this.m_inited = v }

    custom(): boolean { return !this.m_initialPartId }
    markAsCustom(): void { this.setInitialPartId('') }

    /** empty string: invalid ID */
    initialPartId(): string { return this.m_initialPartId }
    setInitialPartId(id: string): void { this.m_initialPartId = id }

    masterScore(): MasterScore | null { return this.m_masterScore }
    excerptScore(): Score | null { return this.m_excerptScore }
    setExcerptScore(s: Score | null): void {
        this.m_excerptScore = s

        if (s) {
            s.setExcerpt(this)
            this.writeNameToMetaTags()
        }
    }

    name(): string { return this.m_name }
    /** saveAndNotify: the name is written to the part name text and meta tag (TODO(port): nameChanged notification) */
    setName(name: string, saveAndNotify = true): void {
        if (this.m_name === name) {
            return
        }

        this.m_name = name

        if (saveAndNotify) {
            this.writeNameToMetaTags()
        }
    }

    writeNameToMetaTags(): void {
        const score = this.excerptScore()
        if (score) {
            const nameItem = score.getText(TextStyleType.INSTRUMENT_EXCERPT)
            if (nameItem) {
                nameItem.setPlainText(this.m_name)
                score.setMetaTag('partName', this.m_name)
            }
        }
    }

    hasFileName(): boolean { return this.m_fileName.length > 0 }
    fileName(): string {
        if (!this.m_fileName) {
            this.updateFileName()
        }
        return this.m_fileName
    }
    setFileName(fileName: string): void { this.m_fileName = fileName }

    updateFileName(index = -1): void {
        if (index === -1 && this.m_masterScore) {
            index = this.m_masterScore.excerpts().indexOf(this)
        }

        const escapedName = escapeFileName(this.m_name)

        if (index === -1) {
            this.m_fileName = escapedName
        } else {
            this.m_fileName = `${index}_${escapedName}`
        }
    }

    parts(): Part[] { return this.m_parts }
    setParts(parts: Part[]): void { this.m_parts = parts }
    containsPart(part: Part): boolean { return this.m_parts.includes(part) }

    removePart(id: string): void {
        let index = 0
        for (const part of this.parts()) {
            if (part.id() === id) {
                break
            }
            ++index
        }
        if (index >= this.m_parts.length) {
            return
        }

        this.excerptScore()!.undoRemovePart(this.excerptScore()!.parts()[index], index)
    }

    nstaves(): number {
        let n = 0
        for (const p of this.m_parts) {
            n += p.nstaves()
        }
        return n
    }

    isEmpty(): boolean {
        return this.m_excerptScore ? this.m_excerptScore.parts().length === 0 : true
    }

    tracksMapping(): TracksMap {
        this.updateTracksMapping()
        return this.m_tracksMapping
    }

    setTracksMapping(tracksMapping: TracksMap): void {
        const sorted = sortTracksMap(tracksMapping)
        if (sorted.length === this.m_tracksMapping.length && sorted.every(([k, v], i) =>
            this.m_tracksMapping[i][0] === k && this.m_tracksMapping[i][1] === v)) {
            return
        }

        this.m_tracksMapping = sorted

        const score = this.excerptScore()
        if (!score || !this.m_masterScore) {
            return
        }

        for (const staff of score.staves()) {
            const masterStaff = this.m_masterScore.staffById(staff.id())
            if (!masterStaff) {
                continue
            }

            staff.updateVisibilityVoices(masterStaff, this.m_tracksMapping)
        }
    }

    updateTracksMapping(): void {
        const score = this.excerptScore()
        if (!score || !this.m_masterScore) {
            return
        }

        const tracks: TracksMap = []

        for (const staff of score.staves()) {
            const masterStaff = this.m_masterScore.staffById(staff.id())
            if (!masterStaff) {
                continue
            }

            const masterStaffIdx = masterStaff.idx()
            const staffIdx = staff.idx()

            let voice = 0
            const voicesVisibility = staff.visibilityVoices()

            for (let i = 0; i < VOICES; ++i) {
                if (!voicesVisibility[i]) {
                    continue
                }

                tracks.push([masterStaffIdx * VOICES + i % VOICES, staffIdx * VOICES + voice % VOICES])
                voice++
            }
        }

        this.setTracksMapping(tracks)
    }

    setVoiceVisible(staff: Staff | null, voiceIndex: number, visible: boolean): void {
        if (!staff) {
            return
        }

        const masterStaff = this.masterScore()!.staffById(staff.id())
        if (!masterStaff) {
            return
        }

        const wasVisible = staff.isVoiceVisible(voiceIndex)
        if (visible === wasVisible) {
            return
        }

        // update tracks (temporarily modify the old staff)
        staff.setVoiceVisible(voiceIndex, visible)
        this.updateTracksMapping()

        // create new staff
        const newStaff = Factory.createStaff(staff.part())
        newStaff.setId(staff.id())
        newStaff.initFromStaff(staff)

        // revert changes to old staff, to make undo work properly
        staff.setVoiceVisible(voiceIndex, wasVisible)

        // remove old staff, insert new
        const excerptScore = this.excerptScore()!
        const staffIndex = staff.idx()
        const partStaffIndex = staffIndex - staff.part().staves()[0].idx()
        excerptScore.undoRemoveStaff(staff)
        excerptScore.undoInsertStaff(newStaff, partStaffIndex)

        // clone master staff to new staff with mapped tracks
        const startTick = staff.score().firstMeasure()!.tick()
        const endTick = staff.score().lastMeasure()!.endTick()
        Excerpt.cloneStaff2(masterStaff, newStaff, startTick, endTick)

        // link master staff to cloned
        excerptScore.undo(new Link(newStaff, masterStaff))
    }

    static createExcerpt(excerpt: Excerpt): void {
        const masterScore = excerpt.masterScore()!
        const score = excerpt.excerptScore()!

        const parts = excerpt.parts()
        const srcStaves: number[] = []

        score.setPageNumberOffset(masterScore.pageNumberOffset())

        // Set instruments and create linked staves
        for (const part of parts) {
            const p = new Part(score)
            p.setId(part.id())
            const instrument = new Instrument()
            instrument.assign(part.instrument())
            p.setInstrument(instrument)
            p.setPartName(part.partName())
            p.setPreferSharpFlat(part.preferSharpFlat())

            for (const staff of part.staves()) {
                const s = Factory.createStaff(p)
                s.setId(staff.id())
                s.initFromStaff(staff)
                s.setDefaultClefType(staff.defaultClefType())
                // the order of staff - s matters as staff should be the first entry in the
                // created link list to make primaryStaff() work
                // TODO: change implementation, maybe create an explicit "primary" flag
                score.undo(new Link(s, staff))
                score.appendStaff(s)
                srcStaves.push(staff.idx())
            }
            score.appendPart(p)
        }

        // Fill tracklist (map all tracks of a stave)
        if (!excerpt.tracksMapping().length) {
            excerpt.updateTracksMapping()
        }

        Excerpt.cloneStaves(masterScore, score, srcStaves, excerpt.tracksMapping())

        const masterMeasure = masterScore.first()
        let scoreMeasure = score.first()

        if ((!scoreMeasure || !scoreMeasure.isVBox()) && (!masterMeasure || !masterMeasure.excludeFromOtherParts())) {
            score.insertBox(ElementType.VBOX, scoreMeasure)
            scoreMeasure = score.first()
        }

        const titleFrameScore = scoreMeasure && scoreMeasure.isVBox() ? scoreMeasure as VBox : null

        if (titleFrameScore && masterMeasure && masterMeasure.isVBox()) {
            titleFrameScore.copyValues(masterMeasure as VBox)
        }

        const partLabel = excerpt.name()
        if (partLabel) {
            if (titleFrameScore) {
                const txt = new Text(titleFrameScore, TextStyleType.INSTRUMENT_EXCERPT)
                txt.setPlainText(partLabel)
                titleFrameScore.add(txt)
            }

            score.setMetaTag('partName', partLabel)
        }

        // initial layout of score
        score.doLayout()

        // handle transposing instruments
        if (masterScore.style().styleB(Sid.concertPitch) !== score.style().styleB(Sid.concertPitch)) {
            for (const staff of score.staves()) {
                if (staff.staffType(new Fraction(0, 1))!.group() === StaffGroup.PERCUSSION) {
                    continue
                }

                // if this staff has no transposition, and no instrument changes, we can skip it
                let interval = staff.part().instrument().transpose().clone() // tick?
                if (interval.isZero() && staff.part().instruments().size() === 1) {
                    continue
                }
                let flip = false
                if (masterScore.style().styleB(Sid.concertPitch)) {
                    interval.flip() // flip the transposition for the original instrument
                    flip = true // transposeKeys() will flip transposition for each instrument change
                }

                const staffIdx = staff.idx()
                const startTrack = staffIdx * VOICES
                const endTrack = startTrack + VOICES

                let endTick = new Fraction(0, 1)
                if (score.lastSegment()) {
                    endTick = score.lastSegment()!.tick()
                }
                Transpose.transposeKeys(score, staffIdx, staffIdx + 1, new Fraction(0, 1), endTick, flip)

                for (let segment = score.firstSegmentMM(SegmentType.ChordRest); segment;
                    segment = segment.next1MM(SegmentType.ChordRest)) {
                    interval = staff.transpose(segment.tick()).clone()
                    if (interval.isZero()) {
                        continue
                    }
                    if (masterScore.style().styleB(Sid.concertPitch)) {
                        interval.flip()
                    }

                    for (const e of segment.annotations()) {
                        if (!e.isHarmony() || (e.track() < startTrack) || (e.track() >= endTrack)) {
                            continue
                        }
                        const h = e as Harmony
                        // mmrests are on by default in part
                        // if this harmony is attached to an mmrest,
                        // be sure to transpose harmony in underlying measure as well
                        for (const se of h.linkList()) {
                            const hh = se as Harmony
                            // skip links to other staves (including in other scores)
                            if (hh.staff() !== h.staff()) {
                                continue
                            }
                            Transpose.undoTransposeHarmony(score, hh, interval)
                        }
                    }
                }
            }
        }

        // update style values if spatium different for part
        if (masterScore.style().spatium() !== score.style().spatium()) {
            score.spatiumChanged(masterScore.style().spatium(), score.style().spatium())
            scoreStyleChanged(score) // C++ Score::styleChanged()
        }

        // second layout of score
        score.setPlaylistDirty()
        masterScore.rebuildMidiMapping()
        masterScore.updateChannel()
        score.remapBracketsAndBarlines()

        score.setLayoutAll()
        score.doLayout()
    }

    static cloneSpanner(s: Spanner, score: Score, dstTrack: number, dstTrack2: number): void {
        // don’t clone system lines for track != 0
        if (isSystemTextLine(s) && s.track() !== 0) {
            return
        }

        const ns = s.linkedClone() as Spanner
        ns.setScore(score)
        ns.moveToDummy()
        ns.setTrack(dstTrack)
        ns.setTrack2(dstTrack2)

        if (ns.isSlur()) {
            // set start/end element for slur
            const cr1 = s.startCR()
            const cr2 = s.endCR()

            ns.setStartElement(null)
            ns.setEndElement(null)
            if (cr1 && cr1.links()) {
                for (const e of cr1.links()!) {
                    const cr = e as ChordRest
                    if (cr === cr1) {
                        continue
                    }
                    if (cr.score() === score && cr.tick().eq(ns.tick()) && cr.track() === dstTrack) {
                        ns.setStartElement(cr)
                        break
                    }
                }
            }
            if (cr2 && cr2.links()) {
                for (const e of cr2.links()!) {
                    const cr = e as ChordRest
                    if (cr === cr2) {
                        continue
                    }
                    if (cr.score() === score && cr.tick().eq(ns.tick2()) && cr.track() === dstTrack2) {
                        ns.setEndElement(cr)
                        break
                    }
                }
            }
            // C++: LOGD("clone Slur: no start element") / LOGD("clone Slur: no end element")
        } else if (ns.isTrill()) {
            ns.computeStartElement()
        } else {
            if (!ns.startElement()) {
                ns.computeStartElement()
            }
            if (!ns.endElement()) {
                ns.computeEndElement()
            }
        }

        if (!ns.startElement() || !ns.endElement()) {
            const startElement = ns.startElement()
            if (startElement && startElement.isChord()) {
                (startElement as Chord).removeStartingSpanner(ns)
            }
            const endElement = ns.endElement()
            if (endElement && endElement.isChord()) {
                (endElement as Chord).removeEndingSpanner(ns)
            }
            // C++: LOGD() << "No start or end element, can't add spanner: " << ns->tick().toString()
            ns.unlink()
            return
        }

        score.doUndoAddElement(ns)
        ns.styleChanged()
    }

    static cloneStaves(sourceScore: Score, dstScore: Score, sourceStavesIndexes: readonly number[], trackList: TracksMap): void {
        const measures = dstScore.measures()
        const tieMap = new TieMap()

        for (let mb = sourceScore.measures().first(); mb; mb = mb.next()) {
            if (mb.excludeFromOtherParts()) {
                // if excluded measure contains section break, add it to precedent measure in part
                const sectionBreak = mb.sectionBreakElement()
                if (sectionBreak) {
                    const prevMB = measures.last()
                    if (prevMB) {
                        const newSectionBreak = sectionBreak.linkedClone()
                        newSectionBreak.setScore(dstScore)
                        newSectionBreak.setParent(prevMB)
                        dstScore.doUndoAddElement(newSectionBreak)
                    }
                }
                continue
            }
            const newMeasure = cloneMeasure(mb, dstScore, sourceScore, sourceStavesIndexes, trackList, tieMap)
            measures.append(newMeasure)
        }

        const n = sourceStavesIndexes.length
        for (let dstStaffIdx = 0; dstStaffIdx < n; ++dstStaffIdx) {
            const srcStaff = sourceScore.staff(sourceStavesIndexes[dstStaffIdx])!

            let m = sourceScore.firstMeasure()
            let nm = dstScore.firstMeasure()

            while (m && nm) {
                nm.setMeasureRepeatCount(m.measureRepeatCount(srcStaff.idx()), dstStaffIdx)
                m = m.nextMeasure()
                nm = nm.nextMeasure()
            }
        }

        if (!dstScore.staves().length) {
            return
        }

        for (const s of [...sourceScore.spanner()]) {
            if (s.excludeFromOtherParts()) {
                continue
            }

            let dstTrack = nidx
            let dstTrack2 = nidx

            if (isSystemTextLine(s)) {
                // always export voltas to first staff in part
                dstTrack = 0
                dstTrack2 = 0
                Excerpt.cloneSpanner(s, dstScore, dstTrack, dstTrack2)
            } else {
                if (mapValue(trackList, s.track()) === nidx || mapValue(trackList, s.track2()) === nidx) {
                    continue
                }
                const track1 = mapValues(trackList, s.track())
                const track2 = mapValues(trackList, s.track2())

                if (track1.length !== track2.length) {
                    continue
                }

                // export other spanner if staffidx matches
                for (let i = 0; i < track1.length; ++i) {
                    dstTrack = track1[i]
                    dstTrack2 = track2[i]
                    Excerpt.cloneSpanner(s, dstScore, dstTrack, dstTrack2)
                }
            }
        }
        collectTieEndPoints(tieMap)
    }

    static cloneMeasures(oscore: Score, score: Score): void {
        const measures = score.measures()
        const tieMap = new TieMap()

        for (let mb: MeasureBase | null = oscore.firstMeasure(); mb; mb = mb.next()) {
            const newMeasure = cloneMeasure(mb, score, oscore, [], [], tieMap)
            measures.append(newMeasure)
        }

        collectTieEndPoints(tieMap)
    }

    /** NOTE For staves in the same score */
    static cloneStaff(srcStaff: Staff, dstStaff: Staff, cloneSpanners = true): void {
        const score = srcStaff.score()
        const tieMap = new TieMap()

        score.undo(new Link(dstStaff, srcStaff))

        const srcStaffIdx = srcStaff.idx()
        const dstStaffIdx = dstStaff.idx()

        for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
            m.setMeasureRepeatCount(m.measureRepeatCount(srcStaffIdx), dstStaffIdx)

            const sTrack = srcStaffIdx * VOICES
            const eTrack = sTrack + VOICES
            for (let srcTrack = sTrack; srcTrack < eTrack; ++srcTrack) {
                const tupletMap = new TupletMap() // tuplets cannot cross measure boundaries
                const dstTrack = dstStaffIdx * VOICES + (srcTrack - sTrack)
                const prevTremolo = { tremolo: null as TremoloTwoChord | null }
                for (let seg = m.first(); seg; seg = seg.next()) {
                    const oe = seg.element(srcTrack)
                    if (!oe || oe.generated()) {
                        continue
                    }
                    if (oe.isTimeSig()) {
                        continue
                    }
                    let ne: EngravingItem | null = null
                    if (oe.isClef()) {
                        // only clone clef if it matches staff group and does not exists yet
                        const clef = oe as Clef
                        const tick = seg.tick()
                        if (ClefInfo.staffGroup(clef.concertClef()) === dstStaff.constStaffType(new Fraction(0, 1)).group()
                            && !dstStaff.clefType(tick).equals(clef.clefTypeList())) {
                            ne = oe.clone()
                        }
                    } else {
                        ne = oe.linkedClone()
                    }
                    if (ne) {
                        ne.setTrack(dstTrack)
                        ne.setParent(seg)
                        ne.setScore(score)
                        if (ne.isChordRest()) {
                            const ncr = ne as ChordRest
                            if (ncr.tuplet()) {
                                ncr.setTuplet(null) // TODO nested tuplets
                            }
                        }
                        score.undoAddElement(ne)
                    }
                    if (oe.isChordRest()) {
                        const ocr = oe as ChordRest
                        const ncr = ne as ChordRest
                        const ot = ocr.tuplet()
                        if (ot) {
                            cloneTuplets(ocr, ncr, ot, tupletMap, m, dstTrack)
                        }

                        // remove lyrics from chord
                        // since only one set of lyrics is used with linked staves
                        for (const l of ncr.lyrics()) {
                            if (l) {
                                l.unlink()
                            }
                        }
                        ncr.lyrics().length = 0

                        ncr.checkStaffMoveValidity()
                        // creating copy for iteration, cause seg->annotations() may change during loop
                        const iterableAnnotations = [...seg.annotations()]

                        for (const e of iterableAnnotations) {
                            if (!e) {
                                continue
                            }
                            if (e.generated() || e.systemFlag()) {
                                continue
                            }
                            if (e.track() !== srcTrack) {
                                continue
                            }
                            switch (e.type()) {
                            // exclude certain element types
                            // this should be same list excluded in Score::undoAddElement()
                            case ElementType.STAFF_TEXT:
                            case ElementType.SYSTEM_TEXT:
                            case ElementType.TRIPLET_FEEL:
                            case ElementType.PLAYTECH_ANNOTATION:
                            case ElementType.STRING_TUNINGS:
                            case ElementType.FRET_DIAGRAM:
                            case ElementType.HARMONY:
                            case ElementType.FIGURED_BASS:
                            case ElementType.DYNAMIC:
                            case ElementType.INSTRUMENT_CHANGE:
                            case ElementType.LYRICS: // not normally segment-attached
                                continue
                            case ElementType.CAPO: {
                                const capo = e as Capo
                                dstStaff.insertCapoParams(e.tick(), capo.params(), true)
                                continue
                            }
                            case ElementType.FERMATA: {
                                // Fermatas are special since the belong to a segment but should
                                // be created and linked on each staff.
                                const ne1 = e.linkedClone()
                                ne1.setTrack(dstTrack)
                                ne1.setParent(seg)
                                ne1.setScore(score)
                                score.doUndoAddElement(ne1)
                                continue
                            }
                            default: {
                                const ne1 = e.clone()
                                ne1.setTrack(dstTrack)
                                ne1.setParent(seg)
                                ne1.setScore(score)
                                score.undoAddElement(ne1)
                            }
                            }
                        }
                        if (oe.isChord()) {
                            const och = ocr as Chord
                            const nch = ncr as Chord
                            addGraceNoteTiesAndBackSpanners(och.graceNotesBefore(), nch, tieMap, score)
                            const n = och.notes().length
                            for (let i = 0; i < n; ++i) {
                                const on = och.notes()[i]
                                const nn = nch.notes()[i]
                                addTies(on, nn, tieMap, score)
                                // add back spanners (going back from end to start spanner element
                                // makes sure the 'other' spanner anchor element is already set up)
                                // 'on' is the old spanner end note and 'nn' is the new spanner end note
                                for (const oldSp of on.spannerBack()) {
                                    const newStart = Spanner.startElementFromSpanner(oldSp, nn)
                                    if (newStart) {
                                        const newSp = oldSp.linkedClone() as Spanner
                                        newSp.setNoteSpan(newStart, nn)
                                        score.addElement(newSp)
                                    }
                                    // C++: LOGD("cloneStaff: cannot find spanner start note")
                                }
                            }
                            addGraceNoteTiesAndBackSpanners(och.graceNotesAfter(), nch, tieMap, score)
                            addTremoloTwoChord(och, nch, prevTremolo)

                            // Check grace note staff move validity
                            for (const gn of nch.graceNotes()) {
                                gn.checkStaffMoveValidity()
                            }
                            const o = nch.findOrnament() as Ornament | null
                            if (o) {
                                const cueChord = o.cueNoteChord()
                                if (cueChord) {
                                    cueChord.checkStaffMoveValidity()
                                }
                            }
                        }
                    }
                }
            }
        }

        if (cloneSpanners) {
            for (const s of [...score.spanner()]) {
                const staffIdx = s.staffIdx()
                let dstTrack = nidx
                let dstTrack2 = nidx
                if (!isSystemTextLine(s)) {
                    // export other spanner if staffidx matches
                    if (srcStaffIdx === staffIdx) {
                        dstTrack = dstStaffIdx * VOICES + s.voice()
                        dstTrack2 = dstStaffIdx * VOICES + (s.track2() % VOICES)
                    }
                }
                if (dstTrack === nidx) {
                    continue
                }
                Excerpt.cloneSpanner(s, score, dstTrack, dstTrack2)
            }
        }

        collectTieEndPoints(tieMap)
    }

    /** NOTE For staves potentially in different scores */
    static cloneStaff2(srcStaff: Staff, dstStaff: Staff, startTick: Fraction, endTick: Fraction): void {
        const oscore = srcStaff.score()
        const score = dstStaff.score()

        const oex = oscore.excerpt()
        const ex = score.excerpt()
        let otracks: TracksMap = []
        let tracks: TracksMap = []
        if (oex) {
            otracks = oex.tracksMapping()
        }
        if (ex) {
            tracks = ex.tracksMapping()
        }

        const m1 = oscore.tick2measure(startTick)
        let m2 = oscore.tick2measure(endTick)

        if (m2 && m2.tick().lt(endTick)) { // end of score
            m2 = null
        }

        const tieMap = new TieMap()

        const srcStaffIdx = srcStaff.idx()
        const dstStaffIdx = dstStaff.idx()

        const sTrack = srcStaffIdx * VOICES
        const eTrack = sTrack + VOICES

        const map = new Map<number, number>()
        for (let i = sTrack; i < eTrack; i++) {
            if (!oex && !ex) {
                map.set(i, dstStaffIdx * VOICES + i % VOICES)
            } else if (oex && !ex) {
                const k = mapKey(otracks, i)
                if (k !== nidx) {
                    map.set(i, k)
                }
            } else if (!oex && ex) {
                for (const j of mapValues(tracks, i)) {
                    if (dstStaffIdx * VOICES <= j && j < (dstStaffIdx + 1) * VOICES) {
                        map.set(i, j)
                        break
                    }
                }
            } else if (oex && ex) {
                const k = mapKey(otracks, i)
                if (k !== nidx) {
                    for (const j of mapValues(tracks, k)) {
                        if (dstStaffIdx * VOICES <= j && j < (dstStaffIdx + 1) * VOICES) {
                            map.set(i, j)
                            break
                        }
                    }
                }
            }
        }

        if (!map.size) {
            for (let i = sTrack; i < eTrack; i++) {
                map.set(i, dstStaffIdx * VOICES + i % VOICES)
            }
        }
        // std::map: iterated in the order of the source tracks
        const sortedMap = [...map].sort((a, b) => a[0] - b[0])

        const firstVoiceVisible = dstStaff.isVoiceVisible(0)

        const addElement = (element: EngravingItem): void => {
            score.undoAddElement(element, false /*addToLinkedStaves*/)
        }

        const sel = score.selection()
        let rangeStart: Fraction | null = null
        let rangeEnd: Fraction | null = null
        if (sel.isRange()) {
            // The for-loop below will invalidate the current range start/end segments. Save their
            // ticks and restore them later using tick2measure (see below)...
            rangeStart = sel.tickStart()
            rangeEnd = sel.tickEnd()
        }

        for (let m = m1; m && (m !== m2); m = m.nextMeasure()) {
            const nm = score.tick2measure(m.tick())!
            nm.setMeasureRepeatCount(m.measureRepeatCount(srcStaffIdx), dstStaffIdx)

            for (const oldEl of [...m.el()]) {
                if (oldEl.isLayoutBreak()) {
                    continue
                }
                if ((oldEl.systemFlag() && dstStaffIdx !== 0) || (!oldEl.systemFlag() && oldEl.staffIdx() !== srcStaffIdx)) {
                    continue
                }
                const alreadyCloned = oldEl.systemFlag() && !!oldEl.findLinkedInScore(score)
                const cloneElement = !alreadyCloned && oldEl.elementAppliesToTrack(staff2track(dstStaffIdx))
                if (!cloneElement) {
                    continue
                }
                const newEl = oldEl.linkedClone()
                newEl.setParent(nm)
                newEl.setStaffIdx(oldEl.systemFlag() ? 0 : dstStaffIdx)
                newEl.setScore(score)
                newEl.styleChanged()
                addElement(newEl)
            }

            const prevTremolo = { tremolo: null as TremoloTwoChord | null }
            for (const [srcTrack, dstTrack] of sortedMap) {
                const tupletMap = new TupletMap() // tuplets cannot cross measure boundaries
                for (let oseg = m.first(); oseg; oseg = oseg.next()) {
                    const ns = nm.getSegment(oseg.segmentType(), oseg.tick())
                    const oef = oseg.element(trackZeroVoice(srcTrack))
                    if (oef && !oef.generated() && (oef.isTimeSig() || oef.isKeySig())) {
                        if (!firstVoiceVisible) {
                            const ne = oef.linkedClone()
                            ne.setTrack(trackZeroVoice(dstTrack))
                            ne.setParent(ns)
                            ne.setScore(score)
                            ne.styleChanged()
                            ne.scanElements((newElement: EngravingItem) => updateSpatium(oef, newElement))
                            addElement(ne)
                        }
                    }

                    for (const e of [...oseg.annotations()]) {
                        if (e.generated() || e.excludeFromOtherParts()) {
                            continue
                        }
                        const systemObject = e.systemFlag() && e.track() === 0
                        const linkedElement = e.findLinkedInScore(score)
                        const linkedParent = linkedElement ? linkedElement.parent() as Segment : null
                        const alreadyCloned = !!linkedParent && (linkedParent === ns
                            || (linkedParent.isSegType(CHORD_REST_OR_TIME_TICK_TYPE)
                                && ns.isSegType(CHORD_REST_OR_TIME_TICK_TYPE)
                                && linkedParent.tick().eq(ns.tick())))
                        const cloneAnnotation = !alreadyCloned && (e.elementAppliesToTrack(srcTrack) || systemObject)

                        if (!cloneAnnotation) {
                            continue
                        }
                        const ne1 = e.linkedClone()
                        ne1.setTrack(dstTrack)
                        ne1.setParent(ns)
                        ne1.setScore(score)
                        ne1.styleChanged()
                        addElement(ne1)
                    }

                    const oe = oseg.element(srcTrack)
                    if (!oe || oe.generated() || oe.excludeFromOtherParts()) {
                        continue
                    }

                    oe.setGenerated(false)
                    const ne = oe.linkedClone()
                    ne.setTrack(dstTrack)
                    ne.setParent(ns)
                    ne.setScore(score)
                    ne.styleChanged()
                    ne.scanElements((newElement: EngravingItem) => updateSpatium(oe, newElement))
                    addElement(ne)

                    if (!oe.isChordRest()) {
                        continue
                    }

                    const ocr = oe as ChordRest
                    const ncr = ne as ChordRest
                    const ot = ocr.tuplet()
                    if (ot) {
                        cloneTuplets(ocr, ncr, ot, tupletMap, nm, dstTrack)
                    }

                    if (!oe.isChord()) {
                        continue
                    }

                    const och = ocr as Chord
                    const nch = ncr as Chord
                    addGraceNoteTiesAndBackSpanners(och.graceNotesBefore(), nch, tieMap, score)
                    const n = och.notes().length
                    for (let i = 0; i < n; ++i) {
                        const on = och.notes()[i]
                        const nn = nch.notes()[i]
                        addTies(on, nn, tieMap, score)
                        addBackSpanners(on, nn, score)
                        const bendBack = on.bendBack()
                        const newStartNote = bendBack ? bendBack.startNote()?.findLinkedInStaff(dstStaff) as Note | null : null
                        if (bendBack && newStartNote) {
                            const newBend = bendBack.linkedClone() as GuitarBend
                            newBend.setScore(score)
                            newBend.setParent(newStartNote)
                            newBend.setTrack(newStartNote.track())
                            newBend.setTrack2(nn.track())
                            newBend.setStartElement(newStartNote)
                            newBend.setEndElement(nn)
                            newStartNote.addSpannerFor(newBend)
                            nn.addSpannerBack(newBend)
                        }
                        const bendFor = on.bendFor()
                        if (bendFor && bendFor.bendType() === GuitarBendType.SLIGHT_BEND) {
                            // Because slight bends aren't detected as "bendBack"
                            const newBend = bendFor.linkedClone() as GuitarBend
                            newBend.setScore(score)
                            newBend.setParent(nn)
                            newBend.setTrack(nn.track())
                            newBend.setTrack2(nn.track())
                            newBend.setStartElement(nn)
                            newBend.setEndElement(nn)
                            nn.addSpannerFor(newBend)
                        }
                    }
                    addGraceNoteTiesAndBackSpanners(och.graceNotesAfter(), nch, tieMap, score)
                    addTremoloTwoChord(och, nch, prevTremolo)
                }
            }
            const emptySegments: Segment[] = []
            for (let seg = nm.first(); seg; seg = seg.next()) {
                seg.checkEmpty()
                if (seg.empty()) {
                    emptySegments.push(seg)
                }
            }
            for (const seg of emptySegments) {
                nm.remove(seg)
            }
            if (!nm.hasVoicesInRange(dstStaffIdx, nm.tick(), nm.ticks())) {
                Excerpt.promoteGapRestsToRealRests(nm, dstStaffIdx)
            }
        }

        for (const s of [...oscore.spanner()]) {
            if (!(s.tick().ge(startTick) && s.tick2().le(endTick)) || s.excludeFromOtherParts()) {
                continue
            }

            const staffIdx = s.staffIdx()
            let dstTrack = nidx
            let dstTrack2 = nidx

            if (isSystemTextLine(s)) {
                if (!scoreContainsSpanner(score, s)) {
                    dstTrack = s.track()
                    dstTrack2 = s.track2()
                }
            } else {
                // export other spanner if staffidx matches
                if (srcStaffIdx === staffIdx) {
                    if (map.has(s.track())) {
                        dstTrack = map.get(s.track())!
                    }
                    if (map.has(s.track2())) {
                        dstTrack2 = map.get(s.track2())!
                    }
                }
            }

            if (dstTrack === nidx) {
                continue
            }

            Excerpt.cloneSpanner(s, score, dstTrack, dstTrack2)
        }

        const oscoreConcertPitch = oscore.style().styleB(Sid.concertPitch)
        const scoreConcertPitch = score.style().styleB(Sid.concertPitch)

        if (oscoreConcertPitch !== scoreConcertPitch) {
            const interval = srcStaff.part().instrument().transpose().clone()
            if (interval.isZero() && srcStaff.part().instruments().size() === 1) {
                return
            }

            if (!scoreConcertPitch) {
                interval.flip()
            }

            Transpose.transposeKeys(score, dstStaffIdx, dstStaffIdx + 1, startTick, endTick, !scoreConcertPitch)
        }

        collectTieEndPoints(tieMap)

        // Restore the range selection...
        if (rangeStart) {
            const newStart = score.tick2segment(rangeStart)
            sel.setStartSegment(newStart)
        }

        if (rangeEnd) {
            const newEnd = score.tick2segment(rangeEnd)
            sel.setEndSegment(newEnd)
        }
    }

    static promoteGapRestsToRealRests(measure: Measure, staffIdx: number): void {
        const startTrack = staff2track(staffIdx)
        const endTrack = startTrack + VOICES
        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (!seg.isChordRestType()) {
                continue
            }
            for (let track = startTrack; track < endTrack; ++track) {
                const item = seg.element(track)
                if (item && item.isRest() && (item as Rest).isGap()) {
                    (item as Rest).setGap(false)
                }
            }
        }
    }

    static createExcerptsFromParts(parts: readonly Part[], score: MasterScore): Excerpt[] {
        const allExcerptLowerNames: string[] = []
        for (const e of score.excerpts()) {
            allExcerptLowerNames.push(e.name().toLowerCase())
        }

        const result: Excerpt[] = []

        for (const part of parts) {
            const excerpt = new Excerpt(score)
            excerpt.parts().push(part)

            const startTrack = part.startTrack()
            const endTrack = part.endTrack()

            for (let i = startTrack, j = 0; i < endTrack; ++i, ++j) {
                excerpt.m_tracksMapping.push([i, j])
            }

            const name = formatUniqueExcerptName(part.partName(), allExcerptLowerNames)
            excerpt.setName(name)
            excerpt.setInitialPartId(part.id())

            allExcerptLowerNames.push(name.toLowerCase())
            result.push(excerpt)
        }

        return result
    }

    static createLinkedTabs(score: MasterScore): void {
        // store map of all initial spanners
        const spanners = new Map<number, Spanner[]>()
        // for moving initial spanner to new index
        const indexMapping = new Map<number, number>()
        const staffIndexesToCopy = new Set<number>()
        const stavesInPart = 2

        for (const s of score.spanner()) {
            const list = spanners.get(s.staffIdx()) ?? []
            list.push(s)
            spanners.set(s.staffIdx(), list)
        }

        let curStaffIdx = 0
        let stavesOperated = 0

        // creating linked staves and recalculating spanners indexes
        for (let partNum = 0; partNum < score.parts().length; partNum++) {
            const part = score.parts()[partNum]
            const fr = new Fraction(0, 1)
            const lines = part.instrument().stringData().strings()
            const stavesNum = part.nstaves()

            if (stavesNum !== 1) {
                for (let i = 0; i < stavesNum; i++) {
                    indexMapping.set(curStaffIdx, stavesOperated + i)
                    curStaffIdx++
                }

                stavesOperated += stavesNum
                continue
            }

            const needsTabStaff = !part.staff(0)!.isDrumStaff(fr)

            if (needsTabStaff) {
                part.setStaves(stavesInPart)

                const srcStaff = part.staff(0)!
                const dstStaff = part.staff(1)!
                Excerpt.cloneStaff(srcStaff, dstStaff, false)

                const types = [
                    StaffTypes.TAB_4SIMPLE,
                    StaffTypes.TAB_5SIMPLE,
                    StaffTypes.TAB_6SIMPLE,
                    StaffTypes.TAB_7SIMPLE,
                    StaffTypes.TAB_8SIMPLE,
                    StaffTypes.TAB_9SIMPLE,
                    StaffTypes.TAB_10SIMPLE,
                ]

                const index = (lines >= 4 && lines <= 10) ? lines - 4 : 2

                dstStaff.setStaffType(fr, StaffType.preset(types[index])!)
                dstStaff.setLines(fr, lines)

                staffIndexesToCopy.add(curStaffIdx)
            }

            // each spanner moves down to the staff with index,
            // equal to number of spanners operated before it
            indexMapping.set(curStaffIdx, stavesOperated)
            curStaffIdx++

            stavesOperated += needsTabStaff ? stavesInPart : 1
        }

        // moving and copying spanner segments
        for (const [idx, spannerList] of spanners) {
            const needsCopy = staffIndexesToCopy.has(idx)
            for (const s of spannerList) {
                // moving
                const newIdx = indexMapping.get(idx) ?? 0
                const newTrackIdx = staff2track(newIdx)
                s.setTrack(newTrackIdx)
                s.setTrack2(newTrackIdx)
                for (const ss of s.spannerSegments()) {
                    ss.setTrack(newTrackIdx)
                }

                // copying
                if (needsCopy) {
                    const dstStaffIdx = newIdx + 1

                    const dstTrack = dstStaffIdx * VOICES + s.voice()
                    const dstTrack2 = dstStaffIdx * VOICES + (s.track2() % VOICES)

                    Excerpt.cloneSpanner(s, score, dstTrack, dstTrack2)
                }
            }
        }
    }
}
