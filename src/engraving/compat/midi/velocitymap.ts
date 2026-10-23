/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/velocitymap.h/.cpp
 * C++ std::multimap<Fraction, VelocityEvent>: a sorted array of entries (equal ticks in insertion order);
 * iterators are indices. VelocityEvent is a value type (copied with clone()).
 */

import { Fraction } from '../../types/fraction'
import { ChangeDirection, ChangeMethod } from '../../types/types'

export enum VelocityEventType {
    DYNAMIC,
    HAIRPIN,
    INVALID,
}

/** VelocityEvent: item in VelocityMap */
export class VelocityEvent {
    m_value = 0
    m_type = VelocityEventType.INVALID
    m_length = new Fraction(0, 1)
    m_method = ChangeMethod.NORMAL
    m_direction = ChangeDirection.INCREASING
    m_cachedStartVal = -1
    m_cachedEndVal = -1

    static dynamic(val: number): VelocityEvent {
        const e = new VelocityEvent()
        e.m_value = val
        e.m_type = VelocityEventType.DYNAMIC
        return e
    }

    static hairpin(s: Fraction, e: Fraction, diff: number, m: ChangeMethod, d: ChangeDirection): VelocityEvent {
        const ev = new VelocityEvent()
        ev.m_value = diff
        ev.m_type = VelocityEventType.HAIRPIN
        ev.m_length = e.minus(s)
        ev.m_method = m
        ev.m_direction = d
        return ev
    }

    clone(): VelocityEvent {
        const e = new VelocityEvent()
        e.m_value = this.m_value
        e.m_type = this.m_type
        e.m_length = this.m_length
        e.m_method = this.m_method
        e.m_direction = this.m_direction
        e.m_cachedStartVal = this.m_cachedStartVal
        e.m_cachedEndVal = this.m_cachedEndVal
        return e
    }

    equals(event: VelocityEvent): boolean {
        return this.m_value === event.m_value
               && this.m_type === event.m_type
               && this.m_length.eq(event.m_length)
               && this.m_method === event.m_method
               && this.m_direction === event.m_direction
    }
}

interface VelocityEntry {
    tick: Fraction
    event: VelocityEvent
}

export type EndPointsVector = [Fraction, Fraction][]

/** VelocityMap: List of changes in a value. */
export class VelocityMap {
    private static readonly DEFAULT_VALUE = 80
    private static readonly MIN_VALUE = 1
    private static readonly MAX_VALUE = 127
    private static readonly STEP = 16

    private m_entries: VelocityEntry[] = []

    // --- multimap helpers ---

    size(): number { return this.m_entries.length }
    empty(): boolean { return this.m_entries.length === 0 }

    private lowerBound(t: Fraction): number {
        let lo = 0
        let hi = this.m_entries.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_entries[mid].tick.lt(t)) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    private upperBound(t: Fraction): number {
        let lo = 0
        let hi = this.m_entries.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_entries[mid].tick.le(t)) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    /** [first, last) of the entries with tick t */
    private equalRange(t: Fraction): [number, number] {
        return [this.lowerBound(t), this.upperBound(t)]
    }

    /** multimap::insert: after the entries with the same tick; returns the index */
    private insert(tick: Fraction, event: VelocityEvent): number {
        const i = this.upperBound(tick)
        this.m_entries.splice(i, 0, { tick, event })
        return i
    }

    private uniqueKeys(): Fraction[] {
        const keys: Fraction[] = []
        for (const e of this.m_entries) {
            if (!keys.length || !keys[keys.length - 1].eq(e.tick)) {
                keys.push(e.tick)
            }
        }
        return keys
    }

    // --- VelocityMap ---

    /**
     * interpolateVelocity
     * the maths looks complex, but is just a series of graph transformations.
     * You can see these graphically at: https://www.desmos.com/calculator/kk89ficmjk
     */
    static interpolate(eventTick: Fraction, event: VelocityEvent, tick: Fraction): number {
        // Prevent zero-division error
        if (event.m_cachedStartVal === event.m_cachedEndVal || event.m_length.isZero()) {
            return event.m_cachedStartVal
        }

        // Ticks to change expression over
        const exprTicks = event.m_length.ticks()
        const exprDiff = event.m_cachedEndVal - event.m_cachedStartVal

        let valueFunction: (ct: number) => number

        switch (event.m_method) {
        case ChangeMethod.EXPONENTIAL:
            // Due to the nth-root, exponential functions do not flip with negative values, and cause errors,
            // so treat it as a piecewise function.
            if (exprDiff > 0) {
                valueFunction = (ct: number): number => Math.trunc(
                    Math.pow(
                        Math.pow((exprDiff + 1), 1.0 / exprTicks), // the exprTicks root of d+1
                        ct, // to the power of the current tick (exponential)
                    ) - 1,
                )
            } else {
                valueFunction = (ct: number): number => -Math.trunc(
                    Math.pow(
                        Math.pow((-exprDiff + 1), 1.0 / exprTicks), // the exprTicks root of 1-d
                        ct, // again to the power of ct
                    ) + 1,
                )
            }
            break
        // Uses sin x transformed, which _does_ flip with negative numbers
        case ChangeMethod.EASE_IN_OUT:
            valueFunction = (ct: number): number => Math.trunc(
                (exprDiff / 2.0) * (Math.sin(ct * (Math.PI / exprTicks) - Math.PI / 2.0) + 1),
            )
            break
        case ChangeMethod.EASE_IN:
            valueFunction = (ct: number): number => Math.trunc(
                exprDiff * (Math.sin((ct - exprTicks) * (Math.PI / (2 * exprTicks))) + 1),
            )
            break
        case ChangeMethod.EASE_OUT:
            valueFunction = (ct: number): number => Math.trunc(
                exprDiff * Math.sin(ct * (Math.PI / (2 * exprTicks))),
            )
            break
        case ChangeMethod.NORMAL:
        default:
            valueFunction = (ct: number): number => Math.trunc(exprDiff * (ct / exprTicks))
            break
        }

        return event.m_cachedStartVal + valueFunction(tick.ticks() - eventTick.ticks())
    }

    /** return value at tick position. */
    val(tick: Fraction): number {
        let eventIter = this.upperBound(tick)
        if (eventIter === 0) {
            return VelocityMap.DEFAULT_VALUE
        }

        eventIter--
        let foundHairpin = false
        let hairpinFound = this.m_entries[eventIter].event // only used to init
        const hairpinFoundStartTick = this.m_entries[eventIter].tick

        const [first, last] = this.equalRange(hairpinFoundStartTick)
        for (let it = first; it < last; ++it) {
            const event = this.m_entries[it].event
            if (event.m_type === VelocityEventType.HAIRPIN) {
                foundHairpin = true
                hairpinFound = event
            }
        }

        if (!foundHairpin) {
            // Last event must be a dynamic, since there are max two events at one tick
            return this.m_entries[eventIter].event.m_value
        }

        if (tick.ge(hairpinFoundStartTick.plus(hairpinFound.m_length))) {
            return hairpinFound.m_cachedEndVal
        } else {
            // Do some maths!
            return VelocityMap.interpolate(hairpinFoundStartTick, hairpinFound, tick)
        }
    }

    addDynamic(tick: Fraction, value: number): void {
        this.insert(tick, VelocityEvent.dynamic(value))
    }

    /**
     * A `change` of 0 means that the change in velocity should be calculated from the next dynamic
     * velocity event.
     */
    addHairpin(stick: Fraction, etick: Fraction, change: number, method: ChangeMethod, direction: ChangeDirection): void {
        change = Math.abs(change)
        change *= (direction === ChangeDirection.INCREASING) ? 1 : -1
        this.insert(stick, VelocityEvent.hairpin(stick, etick, change, method, direction))
    }

    /** put the hairpins in size order if they start at the same point */
    private sortHairpins(): void {
        for (const tick of this.uniqueKeys()) {
            // hairpinEvents will contain all the hairpins at this tick
            const hairpinEvents: VelocityEvent[] = []
            const [first, last] = this.equalRange(tick)
            for (let it = first; it < last; ++it) {
                const event = this.m_entries[it].event
                if (event.m_type === VelocityEventType.DYNAMIC) {
                    continue
                }

                hairpinEvents.push(event.clone())
            }

            if (hairpinEvents.length > 1) {
                // Sort hairpinEvents so that the longest hairpins come first -
                // this is important for when we remove hairpins/dynamics enclosed within other
                // hairpins during stage 1.
                hairpinEvents.sort((a, b) => b.m_length.compare(a.m_length))
                // C++ inserts them without removing the original ones (the copies are removed as enclosed hairpins)
                for (const event of hairpinEvents) {
                    this.insert(tick, event)
                }
            }
        }
    }

    /** remove any hairpins that are completely enclosed within other hairpins */
    private resolveHairpinCollisions(): void {
        let currentHairpinEnd = new Fraction(-1, 1) // end point of hairpin we're in
        let inHairpin = false // whether we're in a hairpin or not

        // Keep a record of the endpoints
        const endPoints: EndPointsVector = []
        const startsInHairpin: boolean[] = []

        let i = 0
        while (i < this.m_entries.length) {
            const tick = this.m_entries[i].tick
            const event = this.m_entries[i].event
            const etick = tick.plus(event.m_length)

            // Reset if we've left the hairpin we were in
            if (currentHairpinEnd.lt(tick)) {
                inHairpin = false
            }

            if (event.m_type === VelocityEventType.HAIRPIN) {
                if (inHairpin) {
                    if (etick.le(currentHairpinEnd)) {
                        // delete, this event is enveloped
                        this.m_entries.splice(i, 1)
                        // don't add to the end points
                        continue
                    } else {
                        currentHairpinEnd = etick
                        startsInHairpin.push(true)
                    }
                } else {
                    currentHairpinEnd = etick
                    inHairpin = true
                    startsInHairpin.push(false)
                }

                endPoints.push([tick, etick])
            }

            i++
        }

        this.adjustCollidingHairpinsLength(startsInHairpin, endPoints)
    }

    /** readjust lengths of any colliding hairpins */
    private adjustCollidingHairpinsLength(startsInHairpin: boolean[], endPoints: EndPointsVector): void {
        // moveTo stores the events that need to be moved to a Fraction position (C++ std::map: one per tick)
        const moveTo: VelocityEntry[] = []
        let i = 0
        let j = -1
        while (i < this.m_entries.length) {
            const tick = this.m_entries[i].tick
            const event = this.m_entries[i].event

            if (event.m_type !== VelocityEventType.HAIRPIN) {
                i++
                continue
            }

            j++
            if (!startsInHairpin[j]) {
                i++
                continue
            }

            // Take a copy of the event and remove it
            const newTick = endPoints[j - 1][1]
            event.m_length = event.m_length.minus(newTick.minus(tick))
            const existing = moveTo.find(m => m.tick.eq(newTick))
            if (existing) {
                existing.event = event.clone()
            } else {
                moveTo.push({ tick: newTick, event: event.clone() })
            }
            this.m_entries.splice(i, 1)
        }

        // Re-insert the events that we need to move in their new positions
        moveTo.sort((a, b) => a.tick.compare(b.tick))
        for (const k of moveTo) {
            this.insert(k.tick, k.event)
        }
    }

    /** if dynamic is inside the hairpin, shorten hairpin length up to this dynamic */
    private resolveDynamicInsideHairpinCollisions(): void {
        let lastEventIt = -1
        for (let i = 0; i < this.m_entries.length; i++) {
            const event = this.m_entries[i].event
            if (event.m_type === VelocityEventType.DYNAMIC && lastEventIt !== -1
                && this.m_entries[lastEventIt].event.m_type === VelocityEventType.HAIRPIN) {
                const dynamicTick = this.m_entries[i].tick
                const lastHairpinStart = this.m_entries[lastEventIt].tick
                const lastHairpinEnd = lastHairpinStart.plus(this.m_entries[lastEventIt].event.m_length)
                if (lastHairpinEnd.gt(dynamicTick)) {
                    this.m_entries[lastEventIt].event.m_length = dynamicTick.minus(lastHairpinStart)
                }
            }

            lastEventIt = i
        }
    }

    private dynamicExistsOnTick(tick: Fraction): boolean {
        const [first, last] = this.equalRange(tick)
        for (let it = first; it < last; ++it) {
            if (this.m_entries[it].event.m_type === VelocityEventType.DYNAMIC) {
                return true
            }
        }
        return false
    }

    private dynamicEventForTick(tick: Fraction): VelocityEvent {
        const [first, last] = this.equalRange(tick)
        for (let it = first; it < last; ++it) {
            const event = this.m_entries[it].event
            if (event.m_type === VelocityEventType.DYNAMIC) {
                return event.clone()
            }
        }

        if (first === 0) {
            return new VelocityEvent()
        }

        const previousTick = this.m_entries[first - 1].tick
        const [sfirst, slast] = this.equalRange(previousTick)
        for (let it = sfirst; it < slast; ++it) {
            const event = this.m_entries[it].event
            if (event.m_type === VelocityEventType.DYNAMIC) {
                return event.clone()
            }
        }

        return new VelocityEvent()
    }

    private addMissingDynamicsAfterHairpins(): void {
        const nextDynamicVal = (previousDynamicValue: number, hairpinDirection: ChangeDirection): number => {
            const newVal = hairpinDirection === ChangeDirection.INCREASING
                ? previousDynamicValue + VelocityMap.STEP : previousDynamicValue - VelocityMap.STEP
            return Math.min(Math.max(newVal, VelocityMap.MIN_VALUE), VelocityMap.MAX_VALUE)
        }

        for (let it = 0; it < this.m_entries.length; it++) {
            const event = this.m_entries[it].event
            if (event.m_type === VelocityEventType.HAIRPIN && event.m_value === 0) {
                const startHairpinTick = this.m_entries[it].tick
                const endHairpinTick = startHairpinTick.plus(event.m_length)
                const dynamicOnCurrentTick = this.dynamicEventForTick(startHairpinTick)

                if (!this.dynamicExistsOnTick(endHairpinTick)) {
                    if (dynamicOnCurrentTick.m_type !== VelocityEventType.INVALID) {
                        const newVal = nextDynamicVal(dynamicOnCurrentTick.m_value, event.m_direction)
                        const idx = this.insert(endHairpinTick, VelocityEvent.dynamic(newVal))
                        if (idx <= it) {
                            ++it
                        }
                    }
                } else {
                    const dynamicOnEndTick = this.dynamicEventForTick(endHairpinTick)
                    const velocityJump = dynamicOnEndTick.m_value - dynamicOnCurrentTick.m_value
                    if ((event.m_direction === ChangeDirection.INCREASING && velocityJump < 0)
                        || (event.m_direction === ChangeDirection.DECREASING && velocityJump > 0)) {
                        const newVal = nextDynamicVal(dynamicOnCurrentTick.m_value, event.m_direction)
                        event.m_value = newVal - dynamicOnCurrentTick.m_value
                    }
                }
            }
        }
    }

    /** cache start and end values for each hairpin */
    private fillHairpinsCache(): void {
        for (let i = 0; i < this.m_entries.length; i++) {
            const tick = this.m_entries[i].tick
            const event = this.m_entries[i].event
            if (event.m_type !== VelocityEventType.HAIRPIN) {
                continue
            }

            // Phase 1: cache a start value for the hairpin

            // Try and get a dynamic at the tick of this hairpin
            let foundDynamic = false
            const [first, last] = this.equalRange(tick)
            for (let it = first; it < last; ++it) {
                const currentChangeEvent = this.m_entries[it].event
                if (currentChangeEvent.m_type === VelocityEventType.DYNAMIC) {
                    event.m_cachedStartVal = currentChangeEvent.m_value
                    foundDynamic = true
                    break
                }
            }

            // If there isn't a dynamic, use from the last event:
            //  - the cached end value if it's a hairpin
            //  - the value if it's a dynamic
            if (!foundDynamic) {
                if (i !== 0) {
                    const prevChangeEventIter = i - 1

                    // Look for a hairpin first
                    let foundHairpin = false
                    const [pfirst, plast] = this.equalRange(this.m_entries[prevChangeEventIter].tick)
                    for (let it = pfirst; it < plast; ++it) {
                        const prevChangeEvent = this.m_entries[it].event
                        if (prevChangeEvent.m_type === VelocityEventType.HAIRPIN) {
                            event.m_cachedStartVal = prevChangeEvent.m_cachedEndVal
                            foundHairpin = true
                            break
                        }
                    }

                    if (!foundHairpin) {
                        // prevChangeEventIter must point to a dynamic in this case
                        event.m_cachedStartVal = this.m_entries[prevChangeEventIter].event.m_value
                    }
                } else {
                    event.m_cachedStartVal = VelocityMap.DEFAULT_VALUE
                }
            }

            // Phase 2: cache an end value for the hairpin

            // If there's no set velocity change:
            if (event.m_value === 0) {
                let nextChangeEventIter = i + 1

                // There's a chance that the next event is a dynamic at the same tick as the
                // start of the current hairpin. If so, get the next event, which is assured
                // to be a different (larger) tick
                if (nextChangeEventIter < this.m_entries.length && this.m_entries[nextChangeEventIter].tick.eq(tick)) {
                    nextChangeEventIter++
                }

                // If this is the last event, there is no change
                if (nextChangeEventIter >= this.m_entries.length) {
                    event.m_cachedEndVal = event.m_cachedStartVal
                } else {
                    // Search for a dynamic event at the next event point
                    let foundDynamic2 = false
                    const [nfirst, nlast] = this.equalRange(this.m_entries[nextChangeEventIter].tick)
                    for (let it = nfirst; it < nlast; ++it) {
                        const nextChangeEvent = this.m_entries[it].event
                        if (nextChangeEvent.m_type === VelocityEventType.DYNAMIC) {
                            event.m_cachedEndVal = nextChangeEvent.m_value
                            foundDynamic2 = true
                            break
                        }
                    }

                    // We haven't found a dynamic, so there must be a hairpin. What does the user want?
                    // A good guess would to be to interpolate, but that might get complex, so just ignore
                    // this hairpin and set the ending to be the same as the start.
                    // TODO: implementing some form of smart interpolation would be nice.
                    if (!foundDynamic2) {
                        event.m_cachedEndVal = event.m_cachedStartVal
                    }
                }
            } else {
                event.m_cachedEndVal = event.m_cachedStartVal + event.m_value
            }

            // And finally... if something's wrong, make it not wrong
            if ((event.m_cachedStartVal > event.m_cachedEndVal && event.m_direction === ChangeDirection.INCREASING)
                || (event.m_cachedStartVal < event.m_cachedEndVal && event.m_direction === ChangeDirection.DECREASING)) {
                event.m_cachedEndVal = event.m_cachedStartVal
            }
        }
    }

    setup(): void {
        this.sortHairpins()
        this.resolveHairpinCollisions()
        this.resolveDynamicInsideHairpinCollisions()
        this.addMissingDynamicsAfterHairpins()
        this.fillHairpinsCache()
    }

    /** returns a list of changes in a range, and their start and end points */
    changesInRange(stick: Fraction, etick: Fraction): [Fraction, Fraction][] {
        const tempChanges: [Fraction, Fraction][] = []

        // Force a new event on every noteon, in case the velocity has changed
        tempChanges.push([stick, stick])
        for (let iter = this.lowerBound(stick); iter < this.m_entries.length; iter++) {
            const tick = this.m_entries[iter].tick
            if (tick.gt(etick)) {
                break
            }

            const event = this.m_entries[iter].event
            if (event.m_type === VelocityEventType.DYNAMIC) {
                tempChanges.push([tick, tick])
            } else if (event.m_type === VelocityEventType.HAIRPIN) {
                const eventEtick = tick.plus(event.m_length)
                const useEtick = eventEtick.gt(etick) ? etick : eventEtick
                tempChanges.push([tick, useEtick])
            }
        }

        // And also go back one and try to find hairpin coming into this range
        let iter = this.lowerBound(stick)
        if (iter !== 0) {
            iter--
            const event = this.m_entries[iter].event
            if (event.m_type === VelocityEventType.HAIRPIN) {
                const eventEtick = this.m_entries[iter].tick.plus(event.m_length)
                if (eventEtick.gt(stick)) {
                    tempChanges.push([stick, eventEtick])
                }
            }
        }

        return tempChanges
    }
}
