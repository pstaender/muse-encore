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

    constructor(score: Score) {
        this.m_score = score
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
