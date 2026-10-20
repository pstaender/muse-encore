/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/readcontext.h/.cpp (paste mode, links and audio settings are not ported)
 */

import { Fraction } from '../../types/fraction'
import type { staff_idx_t, track_idx_t } from '../../types/types'
import type { MStyle } from '../../style/style'
import { Interval } from '../../dom/interval'
import { Location } from '../../dom/location'
import { INT_MAX } from '../../dom/connector'
import type { EngravingObject } from '../../dom/engravingobject'
import type { Measure } from '../../dom/measure'
import type { Score } from '../../dom/score'
import type { Staff } from '../../dom/staff'
import type { ConnectorInfoReader } from './connectorinforeader'
import type { Beam } from '../../dom/beam'
import type { Tuplet } from '../../dom/tuplet'
import type { Spanner } from '../../dom/spanner'
import type { BarLine } from '../../dom/barline'
import { TextStyleType } from '../../types/types'

/** read400 SpannerValues (read206: <endSpanner> read before its spanner) */
export interface SpannerValues {
    spannerId: number
    tick2: Fraction
    track2: track_idx_t
}

/** C++ rw/compat/compattypes.h */
export enum StaffHideMode {
    AUTO = 0,
    ALWAYS,
    NEVER,
    INSTRUMENT,
}

/** C++ rw/linksindexer.h */
class LinksIndexer {
    private m_lastLocalIndex = -1
    private m_lastLinkedElementLoc = Location.absolute()

    assignLocalIndex(mainElementLocation: Location): number {
        if (this.m_lastLinkedElementLoc.equals(mainElementLocation)) {
            return ++this.m_lastLocalIndex
        }

        this.m_lastLocalIndex = 0
        this.m_lastLinkedElementLoc = mainElementLocation.clone()

        return 0
    }
}

export class ReadContext {
    private m_score: Score
    private m_pasteMode = false // modifies read behaviour on paste operation
    private m_forcePageMode = false
    private m_connectors: ConnectorInfoReader[] = []
    private m_pendingConnectors: ConnectorInfoReader[] = [] // connectors that are pending to be updated and added to _connectors. That will happen when checkConnectors() is called.
    private m_tick = new Fraction(0, 1)
    private m_tickOffset = new Fraction(0, 1)
    private m_intTick = 0
    private m_trackOffset = 0
    private m_track: track_idx_t = 0
    private m_curMeasure: Measure | null = null
    private m_lastMeasure: Measure | null = null
    private m_curMeasureIdx = 0
    private m_transpose = new Interval()
    private m_tracks = new Map<number, number>()
    private m_timeSigForNextMeasure = new Fraction(0, 1)

    // read400/read410 compat: staff hide modes (rw/compat/compattypes.h StaffHideModes)
    private m_staffHideModes = new Map<Staff, StaffHideMode>()
    staffHideModes(): Map<Staff, StaffHideMode> { return this.m_staffHideModes }

    // read410 compat: elements linked with <linked>/<linkedMain> (one list per staff)
    private m_staffLinkedElements = new Map<number, [EngravingObject[], Location][]>()
    private m_linksIndexer = new LinksIndexer()

    // read206 (read400 ReadContext): elements referenced by id
    private m_beams = new Map<number, Beam>()
    private m_tuplets = new Map<number, Tuplet>()
    private m_spannerValues: SpannerValues[] = []
    private m_spanner: [number, Spanner][] = []
    private m_userTextStyles: { name: string; ss: TextStyleType }[] = []
    private m_staffBarLineSpanValues = new Map<staff_idx_t, number>()
    private m_barLineSpanValues = new Map<BarLine, number>()

    constructor(score: Score) {
        this.m_score = score
    }

    addBeam(s: Beam): void { this.m_beams.set(s.id(), s) }
    findBeam(id: number): Beam | null { return this.m_beams.get(id) ?? null }
    addTuplet(s: Tuplet): void { this.m_tuplets.set(s.id(), s) }
    findTuplet(id: number): Tuplet | null { return this.m_tuplets.get(id) ?? null }
    tuplets(): Map<number, Tuplet> { return this.m_tuplets }

    checkTuplets(): void {
        for (const tuplet of this.m_tuplets.values()) {
            if (tuplet.elements().length) {
                // sort tuplet elements. Needed for nested tuplets #22537
                tuplet.sortElements()
                tuplet.sanitizeTuplet()
            }
            // else: empty tuplet (input file corrupted?), C++ deletes it
        }
    }

    addSpannerToScore(s: Spanner): void { this.m_score.addSpanner(s) }
    addSpanner(id: number, s: Spanner): void { this.m_spanner.push([id, s]) }

    removeSpanner(s: Spanner): void {
        const i = this.m_spanner.findIndex(p => p[1] === s)
        if (i >= 0) {
            this.m_spanner.splice(i, 1)
        }
    }

    findSpanner(id: number): Spanner | null {
        for (const [i, s] of this.m_spanner) {
            if (i === id) {
                return s
            }
        }
        return null
    }

    spannerId(s: Spanner): number {
        for (const [i, sp] of this.m_spanner) {
            if (sp === s) {
                return i
            }
        }
        return -1
    }

    addSpannerValues(sv: SpannerValues): void { this.m_spannerValues.push(sv) }
    spannerValues(id: number): SpannerValues | null { return this.m_spannerValues.find(v => v.spannerId === id) ?? null }

    addUserTextStyle(name: string): TextStyleType {
        const USER = [TextStyleType.USER1, TextStyleType.USER2, TextStyleType.USER3, TextStyleType.USER4, TextStyleType.USER5,
            TextStyleType.USER6, TextStyleType.USER7, TextStyleType.USER8, TextStyleType.USER9, TextStyleType.USER10,
            TextStyleType.USER11, TextStyleType.USER12]
        const id = this.m_userTextStyles.length < USER.length ? USER[this.m_userTextStyles.length] : TextStyleType.TEXT_TYPES
        if (id !== TextStyleType.TEXT_TYPES) {
            this.m_userTextStyles.push({ name, ss: id })
        }
        return id
    }

    lookupUserTextStyle(name: string): TextStyleType {
        return this.m_userTextStyles.find(i => i.name === name)?.ss ?? TextStyleType.TEXT_TYPES
    }

    clearUserTextStyles(): void { this.m_userTextStyles = [] }

    getStaffBarLineSpan(staffIdx: staff_idx_t): number { return this.m_staffBarLineSpanValues.get(staffIdx) ?? 0 }
    setStaffBarLineSpan(staffIdx: staff_idx_t, barLineSpan: number): void {
        if (!this.m_staffBarLineSpanValues.has(staffIdx)) {
            this.m_staffBarLineSpanValues.set(staffIdx, barLineSpan)
        }
    }

    getBarLineSpan(barLine: BarLine): number | null { return this.m_barLineSpanValues.get(barLine) ?? null }
    setBarLineSpan(barLine: BarLine, barLineSpan: number): void {
        if (!this.m_barLineSpanValues.has(barLine)) {
            this.m_barLineSpanValues.set(barLine, barLineSpan)
        }
    }

    /** read410 ReadContext::addLink (master score only) */
    addLink(staff: Staff, link: EngravingObject[], location: Location): void {
        const staffIndex = staff.idx()
        let staffLinks = this.m_staffLinkedElements.get(staffIndex)
        if (!staffLinks) {
            staffLinks = []
            this.m_staffLinkedElements.set(staffIndex, staffLinks)
        }
        this.m_linksIndexer.assignLocalIndex(location)
        staffLinks.push([link, location])
    }

    /** read410 ReadContext::getLink (master score only) */
    getLink(location: Location, localIndexDiff: number): EngravingObject[] | null {
        const staffIndex = location.staff()
        const localIndex = this.m_linksIndexer.assignLocalIndex(location) + localIndexDiff
        let staffLinks = this.m_staffLinkedElements.get(staffIndex)
        if (!staffLinks) {
            staffLinks = []
            this.m_staffLinkedElements.set(staffIndex, staffLinks)
        }

        if (staffLinks.length && staffLinks[staffLinks.length - 1][1].equals(location)) {
            // This element potentially affects local index for "main"
            // elements that may go afterwards at the same tick, so
            // append it to staffLinks as well.
            staffLinks.push(staffLinks[staffLinks.length - 1]) // nothing should reference exactly this local index, so it shouldn't matter what to append
        }

        for (let i = 0; i < staffLinks.length; ++i) {
            if (staffLinks[i][1].equals(location)) {
                if (localIndex === 0) {
                    return staffLinks[i][0]
                }

                i += localIndex
                if (i < 0 || i >= staffLinks.length) { // C++ size_t wraps around for negative values
                    return null
                }

                if (staffLinks[i][1].equals(location)) {
                    return staffLinks[i][0]
                }

                return null
            }
        }

        return null
    }

    score(): Score { return this.m_score }
    setScore(score: Score): void { this.m_score = score }
    style(): MStyle { return this.m_score.style() }

    pasteMode(): boolean { return this.m_pasteMode }
    setPasteMode(v: boolean): void { this.m_pasteMode = v }
    forcePageMode(): boolean { return this.m_forcePageMode }
    setForcePageMode(v: boolean): void { this.m_forcePageMode = v }
    shouldSkipProperty(): boolean { return false }

    mscoreVersion(): string { return this.m_score.masterScore().mscoreVersion() }
    mscVersion(): number { return this.m_score.mscVersion() }
    fileDivision(t?: number): number { return t === undefined ? 480 : this.m_score.fileDivision(t) }
    spatium(): number { return this.m_score.style().spatium() }

    staff(n: staff_idx_t): Staff | null { return this.m_score.staff(n) }
    isSameScore(obj: EngravingObject): boolean { return obj.score() === this.m_score }

    tick(): Fraction { return this.m_tick.plus(this.m_tickOffset) }
    rtick(): Fraction { return this.m_curMeasure ? this.m_tick.minus(this.m_curMeasure.tick()) : this.m_tick }
    tickOffset(): Fraction { return this.m_tickOffset }

    setTick(f: Fraction): void {
        this.m_tick = f.reduced()
        this.m_intTick = this.m_tick.ticks()
    }

    incTick(f: Fraction): void {
        this.m_tick = this.m_tick.plus(f).reduced()
        this.m_intTick += f.ticks()
    }

    setTickOffset(val: Fraction): void { this.m_tickOffset = val }
    track(): track_idx_t { return this.m_track + this.m_trackOffset }
    setTrackOffset(val: number): void { this.m_trackOffset = val }
    trackOffset(): number { return this.m_trackOffset }
    setTrack(val: track_idx_t): void { this.m_track = val }
    setCurrentMeasure(m: Measure | null): void { this.m_curMeasure = m }
    currentMeasure(): Measure | null { return this.m_curMeasure }
    setLastMeasure(m: Measure | null): void { this.m_lastMeasure = m }
    lastMeasure(): Measure | null { return this.m_lastMeasure }
    setCurrentMeasureIndex(idx: number): void { this.m_curMeasureIdx = idx }
    currentMeasureIndex(): number { return this.m_curMeasureIdx }
    transpose(): Interval { return this.m_transpose }
    setTransposeChromatic(v: number): void { this.m_transpose.chromatic = v }
    setTransposeDiatonic(v: number): void { this.m_transpose.diatonic = v }
    tracks(): Map<number, number> { return this.m_tracks }
    timeSigForNextMeasure(): Fraction { return this.m_timeSigForNextMeasure }
    setTimeSigForNextMeasure(timeSig: Fraction): void { this.m_timeSigForNextMeasure = timeSig }

    location(forceAbsFrac = false): Location {
        const l = Location.absolute()
        this.fillLocation(l, forceAbsFrac)
        return l
    }

    fillLocation(l: Location, forceAbsFrac = false): void {
        const defaults = Location.absolute()
        const absFrac = this.pasteMode() || forceAbsFrac
        if (l.track() === defaults.track()) {
            l.setTrack(this.track())
        }
        if (l.frac().eq(defaults.frac())) {
            l.setFrac(absFrac ? this.tick() : this.rtick())
        }
        if (l.measure() === defaults.measure()) {
            l.setMeasure(absFrac ? 0 : this.currentMeasureIndex())
        }
    }

    /** sets a new reading point, taking into account its type (absolute or relative) */
    setLocation(l: Location): void {
        if (l.isRelative()) {
            const newLoc = l.clone()
            newLoc.toAbsolute(this.location())
            const intTicks = l.frac().ticks()
            if (this.m_tick.eq(Fraction.fromTicks(this.m_intTick + intTicks))) {
                this.m_intTick += intTicks
                this.setTrack(newLoc.track() - this.m_trackOffset)
                return
            }
            this.setLocation(newLoc) // recursion
            return
        }
        this.setTrack(l.track() - this.m_trackOffset)
        this.setTick(l.frac().minus(this.m_tickOffset))
        if (!this.pasteMode()) {
            this.incTick(this.currentMeasure()!.tick())
        }
    }

    /** add connector info to be checked after calling checkConnectors() */
    addConnectorInfoLater(c: ConnectorInfoReader): void { this.m_pendingConnectors.push(c) }

    checkConnectors(): void {
        for (const c of this.m_pendingConnectors) {
            this.addConnectorInfo(c)
        }
        this.m_pendingConnectors = []
    }

    private addConnectorInfo(c1: ConnectorInfoReader): void {
        this.m_connectors.push(c1)
        c1.update()
        for (const c2 of this.m_connectors) {
            if (c2.connect(c1)) {
                if (c2.finished()) {
                    c2.addToScore(this.pasteMode())
                    this.removeConnector(c2)
                }
                break
            }
        }
    }

    /** Removes the whole ConnectorInfo chain from the connectors list. */
    private removeConnector(c: ConnectorInfoReader): void {
        let cc: ConnectorInfoReader | null = c
        while (cc.prev()) {
            cc = cc.prev()!
        }
        while (cc) {
            const next: ConnectorInfoReader | null = cc.next()
            const i = this.m_connectors.indexOf(cc)
            if (i >= 0) {
                this.m_connectors.splice(i, 1)
            }
            cc = next
        }
    }

    reconnectBrokenConnectors(): void {
        if (this.m_connectors.length === 0) {
            return
        }
        const brokenPairs: [number, [ConnectorInfoReader, ConnectorInfoReader]][] = []
        for (let i = 1; i < this.m_connectors.length; ++i) {
            for (let j = 0; j < i; ++j) {
                const c1 = this.m_connectors[i]
                const c2 = this.m_connectors[j]
                const d = c1.connectionDistance(c2)
                if (d >= 0) {
                    brokenPairs.push([d, [c1, c2]])
                } else {
                    brokenPairs.push([-d, [c2, c1]])
                }
            }
        }
        // std::sort is not stable; use a stable sort here (order of equal pairs is unspecified in C++)
        brokenPairs.sort((p1, p2) => p1[0] - p2[0])
        const processed = new Set<ConnectorInfoReader>()
        for (const [dist, pair] of brokenPairs) {
            if (dist === INT_MAX) {
                continue
            }
            if (processed.has(pair[0]) || processed.has(pair[1])) {
                continue
            }
            pair[0].forceConnect(pair[1])
            processed.add(pair[0])
            processed.add(pair[1])
        }
        const reconnected = new Set<ConnectorInfoReader>()
        for (const c of this.m_connectors) {
            if (c.finished()) {
                reconnected.add(c.start() as ConnectorInfoReader)
            }
        }
        for (const cptr of reconnected) {
            cptr.addToScore(this.pasteMode())
            this.removeConnector(cptr)
        }
    }

    clearOrphanedConnectors(): void {
        this.m_connectors = []
        this.m_pendingConnectors = []
    }
}
