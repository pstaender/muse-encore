/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of ConnectorInfo of src/engraving/dom/connector.h/.cpp (the writer part is not ported)
 */

import { Fraction } from '../types/fraction'
import { ElementType } from '../types/types'
import { INT_MIN, Location } from './location'
import type { EngravingItem } from './engravingitem'
import type { Score } from './score'

export const INT_MAX = 2147483647

function distance(l1: Location, l2: Location): number {
    const commonDenominator = 1000
    const dfrac = l2.frac().minus(l1.frac()).absValue()
    let dpos = Math.trunc(dfrac.numerator() * commonDenominator / dfrac.denominator())
    dpos += 10000 * Math.abs(l2.measure() - l1.measure())
    return 1000 * dpos + 100 * Math.abs(l2.track() - l1.track()) + 10 * Math.abs(l2.note() - l1.note())
           + Math.abs(l2.graceIndex() - l1.graceIndex())
}

/**
 * Stores a general information on various connecting elements (currently only spanners)
 * including their endpoints locations. Base class of helper classes used to read and write
 * such elements.
 */
export class ConnectorInfo {
    protected m_type = ElementType.INVALID
    protected m_currentLoc: Location
    protected m_prevLoc = Location.absolute()
    protected m_nextLoc = Location.absolute()
    protected m_prev: ConnectorInfo | null = null
    protected m_next: ConnectorInfo | null = null

    private m_current: EngravingItem | null = null
    private m_currentUpdated = false
    private m_score: Score | null = null

    constructor(current: EngravingItem | null, score: Score, track = -1, frac = new Fraction(-1, 1),
                currentLocation: Location | null = null) {
        this.m_current = current
        this.m_score = score
        if (currentLocation) {
            this.m_currentLoc = currentLocation
            return
        }
        this.m_currentLoc = Location.absolute()
        if (track >= 0) {
            this.m_currentLoc.setTrack(track)
        }
        if (frac.ge(new Fraction(0, 1))) {
            this.m_currentLoc.setFrac(frac)
        }
    }

    prev(): ConnectorInfo | null { return this.m_prev }
    next(): ConnectorInfo | null { return this.m_next }
    type(): ElementType { return this.m_type }
    location(): Location { return this.m_currentLoc }

    hasPrevious(): boolean { return this.m_prevLoc.measure() !== INT_MIN }
    hasNext(): boolean { return this.m_nextLoc.measure() !== INT_MIN }
    isStart(): boolean { return !this.hasPrevious() && this.hasNext() }
    isMiddle(): boolean { return this.hasPrevious() && this.hasNext() }
    isEnd(): boolean { return this.hasPrevious() && !this.hasNext() }

    protected updateLocation(e: EngravingItem, l: Location, clipboardmode: boolean): void {
        l.fillForElement(e, clipboardmode)
    }

    protected updateCurrentInfo(clipboardmode: boolean): void {
        if (!this.currentUpdated() && this.m_current) {
            this.updateLocation(this.m_current, this.m_currentLoc, clipboardmode)
        }
        this.setCurrentUpdated(true)
    }

    protected currentUpdated(): boolean { return this.m_currentUpdated }
    protected setCurrentUpdated(v: boolean): void { this.m_currentUpdated = v }

    connect(other: ConnectorInfo | null): boolean {
        if (!other || this === other) {
            return false
        }
        if (this.m_type !== other.m_type || this.m_score !== other.m_score) {
            return false
        }
        if (this.hasPrevious() && !this.m_prev && other.hasNext() && !other.m_next) {
            if (this.m_prevLoc.equals(other.m_currentLoc) && this.m_currentLoc.equals(other.m_nextLoc)) {
                this.m_prev = other
                other.m_next = this
                return true
            }
        }
        if (this.hasNext() && !this.m_next && other.hasPrevious() && !other.m_prev) {
            if (this.m_nextLoc.equals(other.m_currentLoc) && this.m_currentLoc.equals(other.m_prevLoc)) {
                this.m_next = other
                other.m_prev = this
                return true
            }
        }
        return false
    }

    forceConnect(other: ConnectorInfo | null): void {
        if (!other || this === other) {
            return
        }
        this.m_next = other
        other.m_prev = this
    }

    private static orderedConnectionDistance(c1: ConnectorInfo, c2: ConnectorInfo): number {
        const c1Next = c1.m_nextLoc.clone()
        c1Next.toRelative(c1.m_currentLoc)
        const c2Prev = c2.m_currentLoc.clone() // inversed order to get equal signs
        c2Prev.toRelative(c2.m_prevLoc)
        if (c1Next.equals(c2Prev)) {
            return distance(c1.m_nextLoc, c2.m_currentLoc)
        }
        return INT_MAX
    }

    /**
     * Returns distance of connection between this and other connector,
     * negative if other is before this; INT_MAX if they can't be connected.
     */
    connectionDistance(other: ConnectorInfo): number {
        if (this.m_type !== other.m_type || this.m_score !== other.m_score) {
            return INT_MAX
        }
        let distThisOther = INT_MAX
        let distOtherThis = INT_MAX
        if (this.hasNext() && !this.m_next && other.hasPrevious() && !other.m_prev) {
            distThisOther = ConnectorInfo.orderedConnectionDistance(this, other)
        }
        if (this.hasPrevious() && !this.m_prev && other.hasNext() && !other.m_next) {
            distOtherThis = ConnectorInfo.orderedConnectionDistance(other, this)
        }
        if (distOtherThis < distThisOther) {
            return -distOtherThis
        }
        return distThisOther
    }

    protected findFirst(): ConnectorInfo | null {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let i: ConnectorInfo = this
        while (i.m_prev) {
            i = i.m_prev
            if (i === this) {
                return null // circular connector
            }
        }
        return i
    }

    protected findLast(): ConnectorInfo | null {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let i: ConnectorInfo = this
        while (i.m_next) {
            i = i.m_next
            if (i === this) {
                return null // circular connector
            }
        }
        return i
    }

    finished(): boolean { return this.finishedLeft() && this.finishedRight() }

    private finishedLeft(): boolean {
        const i = this.findFirst()
        return !!i && !i.hasPrevious()
    }

    private finishedRight(): boolean {
        const i = this.findLast()
        return !!i && !i.hasNext()
    }

    start(): ConnectorInfo | null {
        const i = this.findFirst()
        if (i && i.hasPrevious()) {
            return null
        }
        return i
    }

    end(): ConnectorInfo | null {
        const i = this.findLast()
        if (i && i.hasNext()) {
            return null
        }
        return i
    }
}
