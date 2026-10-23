/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_meter.h/.cpp (namespace Meter)
 */

import { StdMap } from '../../../../framework/global/stdmap'
import { Constants } from '../../../../engraving/types/constants'
import { TDuration, toDurationList as engravingToDurationList } from '../../../../engraving/dom/durationtype'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import { minAllowedDuration } from './importmidi_chord'
import { type TupletData, tupletLimits } from './importmidi_tuplet'
import { DivisionInfo, MaxLevel, TUPLET_BOUNDARY_LEVEL } from './importmidi_inner'

/** Meter::DurationType (not engraving's DurationType) */
export enum DurationType {
    NOTE,
    REST,
}

// ---- Meter functions (importmidi_meter.cpp) below ----

export function isSimple(barFraction: ReducedFraction): boolean { // 2/2, 3/4, 4/4, ...
    return barFraction.numerator() < 5
}

export function isCompound(barFraction: ReducedFraction): boolean { // 6/8, 12/4, ...
    return barFraction.numerator() % 3 === 0 && barFraction.numerator() > 3
}

export function isComplex(barFraction: ReducedFraction): boolean { // 5/4, 7/8, ...
    return barFraction.numerator() === 5 || barFraction.numerator() === 7
}

export function isDuple(barFraction: ReducedFraction): boolean { // 2/2, 6/8, ...
    return barFraction.numerator() === 2 || barFraction.numerator() === 6
}

export function isTriple(barFraction: ReducedFraction): boolean { // 3/4, 9/4, ...
    return barFraction.numerator() === 3 || barFraction.numerator() === 9
}

export function isQuadruple(barFraction: ReducedFraction): boolean { // 4/4, 12/8, ...
    return barFraction.numerator() % 4 === 0
}

export function isQuintuple(barFraction: ReducedFraction): boolean { // 5/4, 15/8, ...
    return barFraction.numerator() % 5 === 0
}

export function isSeptuple(barFraction: ReducedFraction): boolean { // 7/8, 21/8, ...
    return barFraction.numerator() % 7 === 0
}

// list of bar division lengths in ticks (whole bar len, half bar len, ...)
// and its corresponding levels
// tuplets are not taken into account here

export function metricDivisionsOfBar(barFraction: ReducedFraction): DivisionInfo {
    const barDivInfo = new DivisionInfo()
    barDivInfo.len = barFraction
    // first value of each element in list is a length (in ticks) of every part of bar
    // on which bar is subdivided on each level
    // the level value is a second value of each element
    const divLengths = barDivInfo.divLengths
    let level = 0
    divLengths.push({ len: barFraction, level })
    // pulse-level division
    if (isDuple(barFraction)) {
        divLengths.push({ len: barFraction.div(2), level: --level })
    } else if (isTriple(barFraction)) {
        divLengths.push({ len: barFraction.div(3), level: --level })
    } else if (isQuadruple(barFraction)) {
        divLengths.push({ len: barFraction.div(2), level: --level }) // additional central accent
        divLengths.push({ len: barFraction.div(4), level: --level })
    } else if (isQuintuple(barFraction)) {
        divLengths.push({ len: barFraction.div(5), level: --level })
    } else if (isSeptuple(barFraction)) {
        divLengths.push({ len: barFraction.div(7), level: --level })
    } else { // if other - complex meter
        divLengths.push({ len: barFraction.div(barFraction.numerator()), level: --level })
    }

    if (isCompound(barFraction)) {
        --level // additional min level for pulse divisions
        // subdivide pulse of compound meter into 3 parts
        divLengths.push({ len: divLengths[divLengths.length - 1].len.div(3), level: --level })
    }

    while (divLengths[divLengths.length - 1].len.ge(minAllowedDuration().times(2))) {
        divLengths.push({ len: divLengths[divLengths.length - 1].len.div(2), level: --level })
    }

    return barDivInfo
}

export function metricDivisionsOfTuplet(tuplet: TupletData, tupletStartLevel: number): DivisionInfo {
    const tupletDivInfo = new DivisionInfo()
    tupletDivInfo.onTime = tuplet.onTime
    tupletDivInfo.len = tuplet.len
    tupletDivInfo.isTuplet = true
    tupletDivInfo.divLengths.push({ len: tuplet.len, level: TUPLET_BOUNDARY_LEVEL })
    const divLen = tuplet.len.div(tuplet.tupletNumber)
    tupletDivInfo.divLengths.push({ len: divLen, level: tupletStartLevel-- })
    const dl = tupletDivInfo.divLengths
    while (dl[dl.length - 1].len.ge(minAllowedDuration().times(2))) {
        dl.push({ len: dl[dl.length - 1].len.div(2), level: tupletStartLevel-- })
    }
    return tupletDivInfo
}

export function beatLength(barFraction: ReducedFraction): ReducedFraction {
    let beatLen = barFraction.div(4)
    if (isDuple(barFraction)) {
        beatLen = barFraction.div(2)
    } else if (isTriple(barFraction)) {
        beatLen = barFraction.div(3)
    } else if (isQuadruple(barFraction)) {
        beatLen = barFraction.div(4)
    } else if (isComplex(barFraction)) {
        beatLen = barFraction.div(barFraction.numerator())
    }
    return beatLen
}

export function divisionsOfBarForTuplets(barFraction: ReducedFraction): ReducedFraction[] {
    const info = metricDivisionsOfBar(barFraction)
    const divLengths: ReducedFraction[] = []
    const beatLen = beatLength(barFraction)
    for (const i of info.divLengths) {
        // in compound or complex meter
        // tuplet starts from beat level, not the whole bar
        if ((isCompound(barFraction) || isComplex(barFraction)) && i.len.gt(beatLen)) {
            continue
        }
        divLengths.push(i.len)
    }
    return divLengths
}

// result in vector: first elements - all tuplets info, one at the end - bar division info

export function divisionInfo(barFraction: ReducedFraction, tupletsInBar: readonly TupletData[]): DivisionInfo[] {
    const divsInfo: DivisionInfo[] = []

    const barDivisionInfo = metricDivisionsOfBar(barFraction)
    for (const tuplet of tupletsInBar) {
        let tupletStartLevel = 0
        for (const divLenInfo of barDivisionInfo.divLengths) {
            if (divLenInfo.len.eq(tuplet.len)) {
                tupletStartLevel = divLenInfo.level
                break
            }
        }
        divsInfo.push(metricDivisionsOfTuplet(tuplet, --tupletStartLevel))
    }
    divsInfo.push(barDivisionInfo)

    return divsInfo
}

// tick is counted from the beginning of bar

export function levelOfTick(tick: ReducedFraction, divsInfo: readonly DivisionInfo[]): number {
    for (const divInfo of divsInfo) {
        if (tick.lt(divInfo.onTime) || tick.gt(divInfo.onTime.plus(divInfo.len))) {
            continue
        }
        for (const divLenInfo of divInfo.divLengths) {
            const ratio = tick.minus(divInfo.onTime).div(divLenInfo.len)
            if (ratio.numerator() % ratio.denominator() === 0) {
                return divLenInfo.level
            }
        }
    }
    return 0
}

export function metricLevelsOfBar(barFraction: ReducedFraction, divsInfo: readonly DivisionInfo[],
                                  minDuration: ReducedFraction): number[] {
    const levels: number[] = []
    for (let tick = new ReducedFraction(0, 1); tick.lt(barFraction); tick = tick.plus(minDuration)) {
        levels.push(levelOfTick(tick, divsInfo))
    }
    return levels
}

// return level with pos == Fraction(-1, 1) if undefined - see MaxLevel class

export function maxLevelBetween(startTickInBar: ReducedFraction, endTickInBar: ReducedFraction,
                                divInfo: DivisionInfo): MaxLevel {
    const level = new MaxLevel()
    const startTickInDiv = startTickInBar.minus(divInfo.onTime)
    const endTickInDiv = endTickInBar.minus(divInfo.onTime)
    if (startTickInDiv.ge(endTickInDiv) || startTickInDiv.lt(new ReducedFraction(0, 1))
        || endTickInDiv.gt(divInfo.len)) {
        return level
    }

    for (const divLengthInfo of divInfo.divLengths) {
        const divLen = divLengthInfo.len
        const ratio = endTickInDiv.div(divLen)
        let maxEndRaster = divLen.times(Math.trunc(ratio.numerator() / ratio.denominator()))
        if (maxEndRaster.eq(endTickInDiv)) {
            maxEndRaster = maxEndRaster.minus(divLen)
        }
        if (startTickInDiv.lt(maxEndRaster)) {
            // max level is found
            const sratio = startTickInDiv.div(divLen)
            const maxStartRaster = divLen.times(Math.trunc(sratio.numerator() / sratio.denominator()))
            const count = maxEndRaster.minus(maxStartRaster).div(divLen)
            level.pos = maxStartRaster.plus(divLen).plus(divInfo.onTime)
            level.levelCount = Math.trunc(count.numerator() / count.denominator())
            level.level = divLengthInfo.level
            break
        }
    }
    return level
}

// vector<DivisionInfo>:
//    first elements - tuplet division info, if there are any tuplets
//    last element - always the whole bar division info

// here we use levelCount = 1 always for simplicity
// because TUPLET_BOUNDARY_LEVEL is 'max enough'

export function findMaxLevelBetween(startTickInBar: ReducedFraction, endTickInBar: ReducedFraction,
                                    divsInfo: readonly DivisionInfo[]): MaxLevel {
    let level = new MaxLevel()

    for (const divInfo of divsInfo) {
        if (divInfo.isTuplet) {
            const divEnd = divInfo.onTime.plus(divInfo.len)
            if (startTickInBar.lt(divEnd) && endTickInBar.gt(divEnd)) {
                level.level = TUPLET_BOUNDARY_LEVEL
                level.levelCount = 1
                level.pos = divEnd
                break
            }
            if (startTickInBar.lt(divInfo.onTime)
                && endTickInBar.gt(divInfo.onTime)
                && endTickInBar.le(divEnd)) {
                level.level = TUPLET_BOUNDARY_LEVEL
                level.levelCount = 1
                level.pos = divInfo.onTime
                break
            }
            if (startTickInBar.ge(divInfo.onTime) && endTickInBar.le(divEnd)) {
                level = maxLevelBetween(startTickInBar, endTickInBar, divInfo)
                break
            }
        } else {
            level = maxLevelBetween(startTickInBar, endTickInBar, divInfo)
            break
        }
    }
    return level
}

function tupletNumberForDuration(startTick: ReducedFraction, endTick: ReducedFraction,
                                 tupletsInBar: readonly TupletData[]): number {
    for (const tupletData of tupletsInBar) {
        if (startTick.ge(tupletData.onTime) && endTick.le(tupletData.onTime.plus(tupletData.len))) {
            return tupletData.tupletNumber
        }
    }
    return -1 // this duration is not inside any tuplet
}

function isPowerOfTwo(x: number): boolean {
    x = x >>> 0
    return x !== 0 && !(x & (x - 1))
}

export function isSimpleNoteDuration(duration: ReducedFraction): boolean {
    const division = ReducedFraction.fromTicks(Constants.DIVISION)
    let div = duration.gt(division) ? duration.div(division) : division.div(duration)
    if (div.gt(new ReducedFraction(0, 1))) {
        div = div.reduced()
        const minVal = Math.min(div.numerator(), div.denominator())
        const maxVal = Math.max(div.numerator(), div.denominator())
        return minVal === 1 && isPowerOfTwo(maxVal)
    }
    return false
}

export function isQuarterDuration(ticks: ReducedFraction): boolean {
    return ticks.numerator() === 1 && ticks.denominator() === 4
}

// If last 2/3 of beat in compound meter is rest,
// it should be split into 2 rests

function is23EndOfBeatInCompoundMeter(startTickInBar: ReducedFraction, endTickInBar: ReducedFraction,
                                      barFraction: ReducedFraction): boolean {
    if (endTickInBar.le(startTickInBar)) {
        return false
    }
    if (!isCompound(barFraction)) {
        return false
    }

    const beatLen = beatLength(barFraction)
    const divLen = beatLen.div(3)
    const ratio1 = startTickInBar.div(beatLen)
    const ratio2 = endTickInBar.div(beatLen)
    if (startTickInBar.minus(beatLen.times(Math.trunc(ratio1.numerator() / ratio1.denominator()))).eq(divLen)
        && (ratio2.numerator() % ratio2.denominator() === 0)) {
        return true
    }
    return false
}

function is2of3RestInTripleMeter(startTickInBar: ReducedFraction, endTickInBar: ReducedFraction,
                                 barFraction: ReducedFraction): boolean {
    if (endTickInBar.minus(startTickInBar).le(new ReducedFraction(0, 1))) {
        return false
    }
    if (isTriple(barFraction)
        && (startTickInBar.eq(new ReducedFraction(0, 1)) || endTickInBar.eq(barFraction))
        && endTickInBar.minus(startTickInBar).eq(barFraction.times(2).div(3))) {
        return true
    }
    return false
}

class Node {
    constructor(public edgeLevel: number, public midLevel: number) {}
}

// all durations inside tuplets are smaller/larger than their regular versions
// this difference is represented by tuplet ratio: 3/2 for triplets, etc.

// if node duration is completely inside some tuplet
// then assign to the node tuplet-to-regular-duration conversion coefficient

function findTupletRatio(startPos: ReducedFraction, endPos: ReducedFraction,
                         tupletsInBar: readonly TupletData[]): ReducedFraction {
    let tupletRatio = new ReducedFraction(2, 2)
    const tupletNumber = tupletNumberForDuration(startPos, endPos, tupletsInBar)
    if (tupletNumber !== -1) {
        tupletRatio = tupletLimits(tupletNumber).ratio
    }

    return tupletRatio
}

function collectDurations(nodes: StdMap<ReducedFraction, Node>, tupletsInBar: readonly TupletData[],
                          useDots: boolean, printRestRemains: boolean): [ReducedFraction, TDuration][] {
    const resultDurations: [ReducedFraction, TDuration][] = []

    for (let it1 = nodes.begin(); it1 !== nodes.end(); it1 = it1.next()) {
        const it2 = it1.next()
        if (it2 === nodes.end()) {
            break
        }
        const tupletRatio = findTupletRatio(it1.first, it2.first, tupletsInBar)
        const duration = tupletRatio.times(it2.first.minus(it1.first))
        const list = engravingToDurationList(duration.fraction(), useDots, 1, printRestRemains)
        for (const dur of list) {
            resultDurations.push([tupletRatio, dur])
        }
    }

    return resultDurations
}

function badLevelCondition(startLevelDiff: number, endLevelDiff: number, tol: number): boolean {
    return startLevelDiff > tol || endLevelDiff > tol
}

function noteCount(duration: ReducedFraction, useDots: boolean): number {
    return engravingToDurationList(duration.fraction(), useDots, 1, false).length
}

function isLessNoteCount(t1: ReducedFraction, t2: ReducedFraction, t3: ReducedFraction, useDots: boolean): boolean {
    return noteCount(t3.minus(t1), useDots)
        < noteCount(t2.minus(t1), useDots) + noteCount(t3.minus(t2), useDots)
}

function excludeNodes(nodes: StdMap<ReducedFraction, Node>, tol: number, useDots: boolean): void {
    if (tol === 0) { // no nodes can be excluded
        return
    }

    let p1 = nodes.begin()
    if (p1 === nodes.end()) {
        return
    }
    let p2 = p1.next()
    if (p2 === nodes.end()) {
        return
    }
    let p3 = p2.next()
    if (p3 === nodes.end()) {
        return
    }

    while (p3 !== nodes.end()) {
        if (!badLevelCondition(p2.second.midLevel - p1.second.edgeLevel,
                               p2.second.midLevel - p3.second.edgeLevel, tol)
            && isLessNoteCount(p1.first, p2.first, p3.first, useDots)) {
            p2 = nodes.erase(p2)
            p3 = p3.next()
            continue
        }
        p1 = p1.next()
        p2 = p2.next()
        p3 = p3.next()
    }
}

// set tuplet boundary level to regular, non-tuplet bar division level
// because there is no more need in tuplet boundary level after split
// and such big level may confuse the estimation algorithm

function adjustEdgeLevelIfTuplet(splitPoint: MaxLevel, divInfo: readonly DivisionInfo[]): number {
    let tupletLevel = splitPoint.level
    if (splitPoint.level === TUPLET_BOUNDARY_LEVEL) {
        const nonTupletDivs = [divInfo[divInfo.length - 1]]
        tupletLevel = levelOfTick(splitPoint.pos, nonTupletDivs)
    }

    return tupletLevel
}

// duration start/end should be quantisized, quantum >= 1/128 note
// pair here represents the tuplet ratio of duration and the duration itself
// for regular (non-tuplet) durations fraction.numerator == fraction.denominator

// tol - max allowed difference between start/end level of duration and split point level
//    1 for notes, 0 for rests

export function toDurationList(startTickInBar: ReducedFraction, endTickInBar: ReducedFraction,
                               barFraction: ReducedFraction, tupletsInBar: readonly TupletData[],
                               durationType: DurationType, useDots: boolean,
                               printRestRemains = true): [ReducedFraction, TDuration][] {
    if (startTickInBar.lt(new ReducedFraction(0, 1))
        || endTickInBar.le(startTickInBar) || endTickInBar.gt(barFraction)) {
        return []
    }

    const divInfo = divisionInfo(barFraction, tupletsInBar) // metric structure of bar
    const minDuration = minAllowedDuration().times(2) // >= minAllowedDuration() after subdivision

    const nodes = new StdMap<ReducedFraction, Node>(compareReducedFractions) // <onTime, Node>
    {
        let level = levelOfTick(startTickInBar, divInfo)
        nodes.insert(startTickInBar, new Node(level, level))
        level = levelOfTick(endTickInBar, divInfo)
        nodes.insert(endTickInBar, new Node(level, level))
    }

    const gapsToProcess: [ReducedFraction, ReducedFraction][] = []
    gapsToProcess.push([startTickInBar, endTickInBar])

    while (gapsToProcess.length !== 0) {
        const gap = gapsToProcess.shift()!
        // don't split gap if its duration is less than minDuration
        if (gap[1].minus(gap[0]).lt(minDuration)) {
            continue
        }
        const splitPoint = findMaxLevelBetween(gap[0], gap[1], divInfo)
        // sum levels if there are several positions (beats) with max level value
        // for example, 8th + half duration + 8th in 3/4, and half is over two beats
        if (splitPoint.pos.eq(new ReducedFraction(-1, 1))) { // undefined
            continue
        }
        const effectiveLevel = splitPoint.level + splitPoint.levelCount - 1
        const startNode = nodes.find(gap[0]).second
        const endNode = nodes.find(gap[1]).second

        if (badLevelCondition(effectiveLevel - startNode.edgeLevel, effectiveLevel - endNode.edgeLevel, 0)
            || is2of3RestInTripleMeter(gap[0], gap[1], barFraction)
            || (durationType === DurationType.REST
                && is23EndOfBeatInCompoundMeter(gap[0], gap[1], barFraction))) {
            const edgeLevel = adjustEdgeLevelIfTuplet(splitPoint, divInfo)
            // split gap in splitPoint position
            nodes.insert(splitPoint.pos, new Node(edgeLevel, effectiveLevel))
            gapsToProcess.push([gap[0], splitPoint.pos])
            gapsToProcess.push([splitPoint.pos, gap[1]])
        }
    }

    const tol = (durationType === DurationType.NOTE) ? 1 : 0
    excludeNodes(nodes, tol, useDots)

    return collectDurations(nodes, tupletsInBar, useDots, printRestRemains)
}
