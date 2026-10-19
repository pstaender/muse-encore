/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/repeatlist.h/.cpp
 * C++ iterators into m_rlElements are (section, element) index pairs here.
 * TODO(port): tempo map (utime/timeOffset), Score::undoRemoveStaleTieJumpPoints
 */

import { HookType } from '../types/types'
import type { EngravingItem } from './engravingitem'
import type { Jump } from './jump'
import type { Marker } from './marker'
import type { Measure } from './measure'
import type { MeasureBase } from './measurebase'
import { Pid } from './property'
import type { Score } from './score'
import type { Volta } from './volta'

export class RepeatSegment {
    tick = 0 // start tick
    utick = 0
    utime = 0.0
    timeOffset = 0.0
    pause = 0.0
    playbackCount: number
    private m_measureList: Measure[] = []

    constructor(playbackCount: number) {
        this.playbackCount = playbackCount
    }

    addMeasure(m: Measure | null): void {
        if (m) {
            if (this.m_measureList.length === 0) {
                this.tick = m.tick().ticks()
            }
            if (this.m_measureList.length === 0 || this.m_measureList[this.m_measureList.length - 1] !== m) {
                this.m_measureList.push(m)
            }
        }
    }

    /** Expands or clips my measureList up to m (including m) */
    addMeasures(m: Measure): void {
        if (this.m_measureList.length) {
            // Add up to the current measure, final measure is added outside of this condition
            let lastMeasure = this.m_measureList[this.m_measureList.length - 1].nextMeasure()
            if (lastMeasure && lastMeasure.tick().lt(m.tick())) { // Ensure provided reference is later than current last
                while (lastMeasure && lastMeasure !== m) {
                    this.m_measureList.push(lastMeasure)
                    lastMeasure = lastMeasure.nextMeasure()
                }
            }
            //else { // Possibly clip compared to current last measure }
            while (this.m_measureList.length && this.m_measureList[this.m_measureList.length - 1].tick().ge(m.tick())) {
                this.m_measureList.pop()
            }
        }
        this.addMeasure(m)
    }

    containsMeasure(m: Measure): boolean { return this.m_measureList.includes(m) }

    endsWithMeasure(m: Measure | null): boolean {
        return this.m_measureList.length > 0 && this.m_measureList[this.m_measureList.length - 1] === m
    }

    startsWithMeasure(m: Measure | null): boolean {
        return this.m_measureList.length > 0 && this.m_measureList[0] === m
    }

    isEmpty(): boolean { return this.m_measureList.length === 0 }

    len(): number {
        return this.m_measureList.length === 0 ? 0 : this.m_measureList[this.m_measureList.length - 1].endTick().ticks() - this.tick
    }

    endTick(): number { return this.tick + this.len() }

    popMeasure(): void { this.m_measureList.pop() }

    firstMeasure(): Measure | null { return this.m_measureList.length ? this.m_measureList[0] : null }
    lastMeasure(): Measure | null { return this.m_measureList.length ? this.m_measureList[this.m_measureList.length - 1] : null }
    measureList(): readonly Measure[] { return this.m_measureList }
}

enum RepeatListElementType {
    SECTION_BREAK,
    VOLTA_START,
    VOLTA_END,
    REPEAT_START,
    REPEAT_END,
    JUMP,
    MARKER,
}

class RepeatListElement {
    private repeatCount: number

    constructor(readonly repeatListElementType: RepeatListElementType, readonly element: EngravingItem, readonly measure: Measure) {
        this.repeatCount = (repeatListElementType === RepeatListElementType.REPEAT_START) ? 1 : 0
    }

    getRepeatCount(): number { return this.repeatCount }
    addToRepeatCount(add: number): void { this.repeatCount += add }
}

type RepeatListElementList = RepeatListElement[]

/** C++ pair of iterators (section, element); section === m_rlElements.length is cend() */
interface RLPos {
    s: number
    i: number
}

export class RepeatList extends Array<RepeatSegment> {
    private m_score: Score
    private m_idx1 = 0
    private m_expanded = false
    private m_scoreChanged = true
    private m_jumpsTaken = new Set<string>() // take the jumps only once, so track them during unwind
    private m_jumpIds = new Map<Jump, number>()
    private m_rlElements: RepeatListElementList[] = [] // all elements of the score that influence the RepeatList

    constructor(s: Score) {
        super()
        this.m_score = s
    }

    static override get [Symbol.species](): ArrayConstructor { return Array }

    update(expand: boolean, _updateTies = true): void {
        if (!this.m_scoreChanged && expand === this.m_expanded) {
            return
        }

        if (expand) {
            this.unwind()
        } else {
            this.flatten()
        }

        this.m_scoreChanged = false
        // TODO(port): if (updateTies && structureChanged) m_score->undoRemoveStaleTieJumpPoints()
    }

    setScoreChanged(): void { this.m_scoreChanged = true }
    score(): Score { return this.m_score }

    ticks(): number {
        if (this.length > 0) {
            const s = this[this.length - 1]
            return s.utick + s.len()
        }
        return 0
    }

    /** TODO(port): only uticks, there is no tempo map */
    updateTempo(): void {
        let utick = 0
        for (const s of this) {
            s.utick = utick
            utick += s.len()
        }
    }

    utick2tick(tick: number): number {
        const n = this.length
        if (n === 0) {
            return tick
        }
        if (tick < 0) {
            return 0
        }
        const ii = (this.m_idx1 < n) && (tick >= this[this.m_idx1].utick) ? this.m_idx1 : 0
        for (let i = ii; i < n; ++i) {
            if ((tick >= this[i].utick) && ((i + 1 === n) || (tick < this[i + 1].utick))) {
                this.m_idx1 = i
                return tick - (this[i].utick - this[i].tick)
            }
        }
        return 0
    }

    tick2utick(tick: number): number {
        if (this.length === 0) {
            return 0
        }
        for (const s of this) {
            if (tick >= s.tick && tick < s.endTick()) {
                return s.utick + (tick - s.tick)
            }
        }
        const back = this[this.length - 1]
        return back.utick + (tick - back.tick)
    }

    /** Make this repeat list flat (don't expand repeats) */
    private flatten(): void {
        this.length = 0
        let m = this.m_score.firstMeasure()
        if (!m) {
            return
        }
        const s = new RepeatSegment(1)
        do {
            s.addMeasure(m)
            m = m.nextMeasure()
        } while (m)
        this.push(s)
        this.m_expanded = false
    }

    /** Collects all RepeatListElementType elements in the score (the only ones that influence playback order) */
    private collectRepeatListElements(): void {
        let sectionRLElements: RepeatListElementList = []

        // Clear out previous listing
        this.m_rlElements = []

        let startFromRepeatMeasure: RepeatListElement | null = null

        // Section breaks may occur on non-Measure frames, so must search list of all MeasureBases
        // unwinding itself will only use actual Measures
        let mb: MeasureBase | null = this.m_score.firstMeasure()

        // First measure of a section/score is always used as a reference REPEAT_START point
        // even if it doesn't have a start repeat
        startFromRepeatMeasure = new RepeatListElement(RepeatListElementType.REPEAT_START, mb!, mb as Measure)
        sectionRLElements.push(startFromRepeatMeasure)
        // Also trace down the final actual measure of this section (in case a frame follows)
        let sectionEndMeasureBase: MeasureBase | null = null

        // Used to track voltas; overlappings and real endings
        let volta: Volta | null = null
        const preProcessedVoltas: Volta[] = []

        // Voltas might overlap (duplicate entries on multiple staves or "real" overlaps)
        // so we will pre-process them into cloned versions that handle those overlaps.
        // This assumes that spanners are ordered from first to last tick-wise
        for (const spanner of this.m_score.spanner()) {
            if (!spanner.isVolta() || !spanner.playSpanner()) {
                continue
            }
            if (!spanner.startMeasure() || !spanner.endMeasure()) {
                continue
            }

            volta = spanner.clone() as Volta
            if (preProcessedVoltas.length === 0) { // First entry
                preProcessedVoltas.push(volta)
            } else { // Compare
                const voltasToMerge: Volta[] = []
                const startMeasureTick = volta.startMeasure()!.tick()

                // List all overlapping voltas
                while (preProcessedVoltas.length
                       && startMeasureTick.le(preProcessedVoltas[preProcessedVoltas.length - 1].endMeasure()!.tick())) {
                    voltasToMerge.push(preProcessedVoltas.pop()!)
                }

                while (voltasToMerge.length) {
                    // We'll have to shorten the already stored volta and split its remainder for merging
                    let remainder = voltasToMerge[voltasToMerge.length - 1].clone() as Volta
                    if (volta!.startMeasure() !== remainder.startMeasure()) {
                        // First part is not empty
                        voltasToMerge[voltasToMerge.length - 1].setEndElement(volta!.startMeasure()!.prevMeasure())
                        remainder.setStartElement(volta!.startMeasure())
                        // Store it
                        preProcessedVoltas.push(voltasToMerge[voltasToMerge.length - 1])
                    }
                    //else { New volta and existing one start at the same moment, there is no first part, only a remainder }
                    voltasToMerge.pop()

                    // remainder and volta now have the same start point
                    // Compare the end points and make remainder end first
                    if (volta!.endMeasure()!.tick().lt(remainder.endMeasure()!.tick())) {
                        const swap: Volta = volta!
                        volta = remainder
                        remainder = swap
                    }
                    // Cross-section of the repeatList
                    const v = volta!
                    remainder.setEndings(remainder.endings().filter(ending => v.hasEnding(ending)))

                    // Split and merge done
                    preProcessedVoltas.push(remainder)
                    if (volta!.endMeasure() !== remainder.endMeasure()) {
                        // volta extends past the end of remainder -> move its startpoint after remainder
                        volta!.setStartElement(remainder.endMeasure()!.nextMeasure())
                    } else { // volta matched remainder endpoint, nothing left to merge from
                        preProcessedVoltas.push(...voltasToMerge)
                        voltasToMerge.length = 0
                        volta = null
                    }
                } // !voltasToMerge.empty()

                if (volta !== null) {
                    preProcessedVoltas.push(volta)
                }
            }
        }
        volta = null

        for (; mb; mb = mb.next()) {
            if (mb.isMeasure()) {
                const m = mb as Measure
                sectionEndMeasureBase = mb // ending measure of section is the most recently encountered actual Measure

                // Volta ?
                if (preProcessedVoltas.length && preProcessedVoltas[0].startMeasure() === mb) {
                    if (volta !== null) {
                        // The previous volta was supposed to end before us (open volta case) -> insert the end
                        sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta, m.prevMeasure()!))
                    }
                    // Now insert the start of the current volta
                    volta = preProcessedVoltas[0]
                    sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_START, volta, m))
                    // Look for start of next volta
                    preProcessedVoltas.shift()
                }

                // Start
                if (mb.repeatStart()) {
                    if (volta !== null) {
                        if (volta.startMeasure() !== m) {
                            // Volta and Start repeat are not on the same measure
                            // assume the previous volta was supposed to end before us (open volta case) -> insert the end
                            // Warning: This might "break" a volta prematurely if its explicit notated end is later than this point
                            //          Consider splitting the volta or ignoring this repeat all together
                            sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta, m.prevMeasure()!))
                            volta = null
                        }
                        //else { // Volta and Start Repeat coincide on the same measure, see test::repeat56.mscx }
                    }
                    startFromRepeatMeasure = new RepeatListElement(RepeatListElementType.REPEAT_START, mb, m)
                    sectionRLElements.push(startFromRepeatMeasure)
                }

                // Jumps and Markers
                for (const e of mb.el()) {
                    if (e.systemFlag() && !e.isTopSystemObject()) {
                        continue
                    }
                    if (e.isJump()) {
                        sectionRLElements.push(new RepeatListElement(RepeatListElementType.JUMP, e, m))

                        if (volta !== null) {
                            if (volta.endMeasure()!.tick().lt(mb.tick())
                                || (volta.endMeasure()!.tick().eq(mb.tick())
                                    && (volta.getProperty(Pid.END_HOOK_TYPE) as HookType) === HookType.NONE)) {
                                // The previous volta was supposed to end before us
                                // or open volta ends together with us -> insert the end
                                if (!mb.repeatEnd()) {
                                    // But only do so if this measure doesn't also have an end repeat: see #327681
                                    sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta, m))
                                    volta = null
                                }
                            }
                        }
                    } else if (e.isMarker()) {
                        const markerRLE = new RepeatListElement(RepeatListElementType.MARKER, e, m)
                        // There may be multiple markers in the same measure. Make sure we place right markers before left
                        // At the same time, we should ensure Markers are evaluated before Jumps
                        const markerRLEisRight = (e as Marker).isRightMarker()
                        let insertionIt = sectionRLElements.length - 1
                        while (sectionRLElements[insertionIt].measure === markerRLE.measure) {
                            let markerShouldGoBefore = false
                            const stored = sectionRLElements[insertionIt]
                            if (stored.repeatListElementType === RepeatListElementType.MARKER
                                && !markerRLEisRight) { // We can be the end when right aligned
                                markerShouldGoBefore = (stored.element as Marker).isRightMarker()
                            }
                            if (markerShouldGoBefore || stored.repeatListElementType === RepeatListElementType.JUMP) {
                                // Decrease position
                                // This should always be possible as the list always starts with a REPEAT_START element
                                --insertionIt
                            } else {
                                // Found location after which we should go
                                break
                            }
                        }
                        // We should be inserted right after insertionIt
                        sectionRLElements.splice(insertionIt + 1, 0, markerRLE)
                    }
                }

                // End
                if (mb.repeatEnd()) {
                    sectionRLElements.push(new RepeatListElement(RepeatListElementType.REPEAT_END, mb, m))
                    if (startFromRepeatMeasure !== null) {
                        startFromRepeatMeasure.addToRepeatCount(m.repeatCount() - 1)
                    }
                    if (volta !== null) {
                        // The previous volta was supposed to end before us (open volta case) -> insert the end
                        sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta, m))
                        volta = null
                    }
                }

                // Volta end
                if (volta !== null
                    && volta.endMeasure()!.tick().eq(mb.tick())
                    && (volta.getProperty(Pid.END_HOOK_TYPE) as HookType) !== HookType.NONE) {
                    // end of closed volta
                    sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta, m))
                    volta = null
                }
            }

            // Section break (or end of score)
            if (mb.sectionBreak() || !mb.nextMeasure()) {
                if (sectionEndMeasureBase !== null) {
                    if (volta !== null) {
                        // The previous volta was supposed to end before us (open volta case) -> insert the end
                        sectionRLElements.push(new RepeatListElement(RepeatListElementType.VOLTA_END, volta,
                            sectionEndMeasureBase as Measure))
                        volta = null
                    }
                    sectionRLElements.push(new RepeatListElement(RepeatListElementType.SECTION_BREAK, mb,
                        sectionEndMeasureBase as Measure))
                    sectionEndMeasureBase = null // reset to indicate not having found the end for the next section
                    // store section
                    this.m_rlElements.push(sectionRLElements)
                }
                // prepare for new section
                const next = mb.nextMeasure()
                if (next) {
                    sectionRLElements = []
                    // First measure of a section/score is always used as a reference REPEAT_START point
                    // even if it doesn't have a start repeat
                    startFromRepeatMeasure = new RepeatListElement(RepeatListElementType.REPEAT_START, next, next)
                    sectionRLElements.push(startFromRepeatMeasure)
                    // Loop will forward one measureBase, so return one now
                    // this logic aids in skipping multiple frames between sections
                    mb = next.prev()!
                } else {
                    // no more measures -> done
                    break
                }
            }
        }
    }

    /**
     * Finds a matching marker in the score (section first)
     * Special case labels: "start" will result in start of current section, "end" will result in end of current section
     */
    private findMarker(label: string, referenceSection: number, referenceElement: number): RLPos {
        let found = false
        let foundSection = referenceSection
        let foundElement: number
        const sectionAt = (s: number): RepeatListElementList => this.m_rlElements[s]
        const isMarkerWithLabel = (rle: RepeatListElement): boolean =>
            rle.repeatListElementType === RepeatListElementType.MARKER && (rle.element as Marker).label() === label

        // Handle special label casing first
        if (label === 'start') {
            foundElement = 0
            found = true
        } else if (label === 'end') {
            foundElement = sectionAt(referenceSection).length - 1
            found = true
        } else {
            foundElement = referenceElement
        }

        // Search backwards in this section
        while (!found && foundElement !== 0) {
            --foundElement
            if (isMarkerWithLabel(sectionAt(referenceSection)[foundElement])) {
                found = true
            }
        }
        // Search forwards in this section
        if (!found) {
            foundElement = referenceElement + 1
            while (!found && foundElement !== sectionAt(referenceSection).length) {
                if (isMarkerWithLabel(sectionAt(referenceSection)[foundElement])) {
                    found = true
                    break
                }
                ++foundElement
            }
        }
        // Search backwards through all previous sections
        if (!found) {
            while (!found && foundSection !== 0) {
                --foundSection
                foundElement = sectionAt(foundSection).length
                while (!found && foundElement !== 0) {
                    --foundElement
                    if (isMarkerWithLabel(sectionAt(foundSection)[foundElement])) {
                        found = true
                    }
                }
            }
        }
        // Search forwards through all following sections
        if (!found) {
            foundSection = referenceSection + 1
            while (foundSection !== this.m_rlElements.length) {
                foundElement = 0
                while (!found && foundElement !== sectionAt(foundSection).length) {
                    if (isMarkerWithLabel(sectionAt(foundSection)[foundElement])) {
                        found = true
                        break
                    }
                    ++foundElement
                }
                if (found) {
                    break
                }
                ++foundSection
            }
        }
        return { s: foundSection, i: foundElement }
    }

    /** returns [playbackCount, activeVolta, startRepeatReference] for the jump target */
    private performJump(section: number, target: number, withRepeats: boolean)
        : { playbackCount: number, activeVolta: Volta | null, startRepeatReference: RepeatListElement } {
        const sectionList = this.m_rlElements[section]
        // Fast forward processing up to our desired marker
        let activeVolta: Volta | null = null
        let startRepeatReference = sectionList[0]

        for (let it = 0; it !== target; ++it) {
            switch (sectionList[it].repeatListElementType) {
            case RepeatListElementType.VOLTA_START:
                activeVolta = sectionList[it].element as Volta
                break
            case RepeatListElementType.VOLTA_END:
                activeVolta = null
                break
            case RepeatListElementType.REPEAT_START:
                startRepeatReference = sectionList[it]
                break
            default:
                // nothing to do
                break
            }
        }

        // Set the correct playbackCount
        let playbackCount: number
        if (withRepeats) {
            if (activeVolta !== null) {
                playbackCount = activeVolta.firstEnding()
                if (playbackCount === 0) {
                    playbackCount = 1
                }
            } else {
                playbackCount = 1
            }
        } else { // Final repeat after jump
            if (activeVolta !== null) {
                playbackCount = activeVolta.lastEnding()
                if (playbackCount === 0) {
                    playbackCount = startRepeatReference.getRepeatCount()
                }
            } else {
                playbackCount = startRepeatReference.getRepeatCount()
            }
        }
        return { playbackCount, activeVolta, startRepeatReference }
    }

    private jumpKey(jump: Jump, playbackCount: number): string {
        let id = this.m_jumpIds.get(jump)
        if (id === undefined) {
            id = this.m_jumpIds.size
            this.m_jumpIds.set(jump, id)
        }
        return `${id}:${playbackCount}`
    }

    /**
     * implements:
     *     - repeats
     *     - volta
     *     - d.c. al fine
     *     - d.s. al fine
     *     - d.s. al coda
     */
    private unwind(): void {
        this.length = 0
        this.m_jumpsTaken.clear()

        if (!this.m_score.firstMeasure()) {
            return
        }

        this.collectRepeatListElements()

        // Following variables are used during unwinding, but may be altered when following jumps
        // Therefor they are declared outside of the loop
        let rs: RepeatSegment | null = null
        let playbackCount: number
        let activeVolta: Volta | null = null
        const cend = this.m_rlElements.length
        let playUntil: RLPos = { s: cend, i: 0 }
        let continueAt: RLPos = { s: cend, i: 0 }
        let activeJump: Jump | null = null
        let forceFinalRepeat = false // Used during jump processing
        let repeatListElementIt: number

        for (let sectionIt = 0; sectionIt !== this.m_rlElements.length; ++sectionIt) {
            // Unwind this section
            let section = this.m_rlElements[sectionIt]
            playbackCount = 1
            repeatListElementIt = 0 // Should always be a REPEAT_START indicator
            let startRepeatReference = section[repeatListElementIt]
            activeVolta = null
            playUntil.s = cend
            continueAt.s = cend
            forceFinalRepeat = false

            rs = new RepeatSegment(playbackCount)
            rs.addMeasure(section[repeatListElementIt].measure)
            ++repeatListElementIt

            while (repeatListElementIt !== section.length) {
                const rle = section[repeatListElementIt]
                if (rs) {
                    rs.addMeasures(rle.measure)
                }

                switch (rle.repeatListElementType) {
                case RepeatListElementType.SECTION_BREAK: {
                    if (rs !== null && !rs.isEmpty()) {
                        this.push(rs)
                    }
                } break
                case RepeatListElementType.VOLTA_START: {
                    activeVolta = rle.element as Volta
                    if (!activeVolta.hasEnding(playbackCount)) {
                        // Should be skipped, remove our measure from rs
                        rs!.popMeasure()
                        if (!rs!.isEmpty()) {
                            this.push(rs!)
                        }
                        // Skip the volta
                        do {
                            ++repeatListElementIt
                        } while (section[repeatListElementIt].repeatListElementType !== RepeatListElementType.VOLTA_END)
                        activeVolta = null
                        // Start next rs on the following measure
                        const possibleNextMeasure = section[repeatListElementIt].measure.nextMeasure()
                        if (possibleNextMeasure === null) {
                            rs = null // end of score, but will still encounter section break, notify it
                        } else {
                            rs = new RepeatSegment(playbackCount)
                            rs.addMeasure(possibleNextMeasure)
                        }
                    }
                    // else { take the volta, it's already set as activeVolta, so just continue }
                } break
                case RepeatListElementType.VOLTA_END: {
                    activeVolta = null
                } break
                case RepeatListElementType.REPEAT_START: {
                    if (rs === null) { // Sent here by an end-repeat
                        rs = new RepeatSegment(playbackCount)
                        rs.addMeasure(rle.measure)
                    } else {
                        const desiredPlaybackCount = forceFinalRepeat ? rle.getRepeatCount() : 1
                        if (rs.playbackCount !== desiredPlaybackCount) {
                            // Restart a segment as we have a new playbackCount reference
                            rs.popMeasure()
                            if (!rs.isEmpty()) {
                                this.push(rs)
                            }
                            playbackCount = desiredPlaybackCount
                            rs = new RepeatSegment(playbackCount)
                            rs.addMeasure(rle.measure)
                        }
                        startRepeatReference = rle
                    }
                } break
                case RepeatListElementType.REPEAT_END: {
                    rle.addToRepeatCount(1)
                    if (playbackCount < startRepeatReference.getRepeatCount()
                        && rle.getRepeatCount() < rle.measure.repeatCount()) {
                        // Honor the repeat
                        if (rs !== null && !rs.isEmpty()) {
                            this.push(rs)
                        }
                        rs = null
                        do { // rewind
                            --repeatListElementIt
                            const t = section[repeatListElementIt].repeatListElementType
                            if (t === RepeatListElementType.VOLTA_START) {
                                activeVolta = null
                            } else if (t === RepeatListElementType.VOLTA_END) {
                                activeVolta = section[repeatListElementIt].element as Volta
                            }
                        } while (section[repeatListElementIt] !== startRepeatReference)
                        ++playbackCount
                        continue // Force evaluation of the start repeat
                    }
                    //else { // Exhausted repeats, just continue }
                } break
                case RepeatListElementType.JUMP: {
                    const jump = rle.element as Jump
                    if (activeJump === jump) {
                        // We've reached this jump again after just having taken it
                        // If this jump forced final repeat playthrough of measures
                        // it only forces so up to this point - see test::repeat23
                        forceFinalRepeat = false
                    }
                    // TODO future improvement, use the repeatList property from the Jump to verify if it should be honored
                    // For now (or in case of an empty repeatList property) a Jump is only honored on final playthrough
                    // of the measure, and only taken once
                    if (playbackCount >= startRepeatReference.getRepeatCount()
                        || (activeVolta !== null && playbackCount === activeVolta.lastEnding())) {
                        const jumpOccurrence = this.jumpKey(jump, playbackCount)
                        if (!this.m_jumpsTaken.has(jumpOccurrence)) { // Not yet processed
                            // Processing it now
                            this.m_jumpsTaken.add(jumpOccurrence)
                            // Find the jump targets
                            const jumpTo = this.findMarker(jump.jumpTo(), sectionIt, repeatListElementIt)
                            playUntil = this.findMarker(jump.playUntil(), sectionIt, repeatListElementIt)
                            continueAt = this.findMarker(jump.continueAt(), sectionIt, repeatListElementIt)

                            // Execute
                            if (jumpTo.s !== cend) {
                                if (rs && !rs.isEmpty()) {
                                    this.push(rs)
                                }
                                rs = null
                                activeJump = jump
                                const res = this.performJump(jumpTo.s, jumpTo.i, activeJump.playRepeats())
                                playbackCount = res.playbackCount
                                activeVolta = res.activeVolta
                                startRepeatReference = res.startRepeatReference
                                sectionIt = jumpTo.s
                                section = this.m_rlElements[sectionIt]
                                repeatListElementIt = jumpTo.i
                                forceFinalRepeat = !activeJump.playRepeats()

                                // Re-evaluate our repeat count for end repeat measures
                                if (playUntil.s !== cend) { // Only required if we have an end target
                                    for (let rleIt = repeatListElementIt + 1; rleIt !== section.length; ++rleIt) {
                                        const r = section[rleIt]
                                        if (r.repeatListElementType === RepeatListElementType.REPEAT_END
                                            && r.getRepeatCount() !== 0) { // We've been played before - see test::repeat22 for why only then
                                            // Clear out our current repeat count
                                            r.addToRepeatCount(-r.getRepeatCount())
                                            if (forceFinalRepeat) {
                                                // Set repeat count to the maximum number for this repeat
                                                r.addToRepeatCount(r.measure.repeatCount())
                                            }
                                        }
                                    }
                                }

                                if (activeVolta !== null) {
                                    // We jumped into a volta, which might not be the only one of this startRepeatReference
                                    // If our jump didn't take us to the last playthrough, we must re-evaluate
                                    // all voltas related to this startRepeatReference
                                    if (playbackCount < startRepeatReference.getRepeatCount()) {
                                        // test::repeat52 and test::repeat53
                                        let findRepeatIt = repeatListElementIt
                                        do {
                                            --findRepeatIt
                                        } while (section[findRepeatIt] !== startRepeatReference)
                                        ++findRepeatIt // Start volta analysis past this start repeat
                                        let voltaReference: Volta | null = null
                                        let processedRepeatCount = 1
                                        while (findRepeatIt !== section.length
                                               && section[findRepeatIt].repeatListElementType !== RepeatListElementType.REPEAT_START
                                               && processedRepeatCount < startRepeatReference.getRepeatCount()) {
                                            const f = section[findRepeatIt]
                                            if (f.repeatListElementType === RepeatListElementType.VOLTA_START) {
                                                voltaReference = f.element as Volta
                                                if (voltaReference.lastEnding() < playbackCount) {
                                                    // We won't pass here anymore - no need to adjust end repeat to this volta
                                                    voltaReference = null
                                                }
                                            } else if (f.repeatListElementType === RepeatListElementType.REPEAT_END) {
                                                if (voltaReference !== null) {
                                                    let remainingRepeatsCount = 0
                                                    for (const ending of voltaReference.endings()) {
                                                        if (ending >= playbackCount) {
                                                            ++remainingRepeatsCount
                                                        }
                                                    }
                                                    // Apply new remainingRepeatsCount
                                                    f.addToRepeatCount(-f.getRepeatCount())
                                                    f.addToRepeatCount(f.measure.repeatCount() - remainingRepeatsCount - 1)
                                                }
                                                processedRepeatCount += f.measure.repeatCount() - 1
                                            }
                                            ++findRepeatIt
                                        }
                                    }
                                }

                                // We've arrived at the target marker
                                rs = new RepeatSegment(playbackCount)
                                rs.addMeasure(section[repeatListElementIt].measure)
                            } // End of jump execution
                        }
                    }
                } break
                case RepeatListElementType.MARKER: {
                    if ((sectionIt === playUntil.s && repeatListElementIt === playUntil.i)
                        && (playbackCount === startRepeatReference.getRepeatCount()
                            || (activeVolta !== null && playbackCount === activeVolta.lastEnding()))) {
                        // Found final playThrough of this Marker
                        if (rs && !rs.isEmpty()) {
                            this.push(rs)
                        }
                        rs = null
                        playUntil.s = cend // Clear this reference - processed
                        forceFinalRepeat = false

                        if (continueAt.s !== cend) {
                            const res = this.performJump(continueAt.s, continueAt.i, true)
                            playbackCount = res.playbackCount
                            activeVolta = res.activeVolta
                            startRepeatReference = res.startRepeatReference
                            sectionIt = continueAt.s
                            section = this.m_rlElements[sectionIt]
                            repeatListElementIt = continueAt.i
                            if (startRepeatReference.measure !== section[continueAt.i].measure) {
                                // Use the continueAt target as repeat reference if it wasn't this measure already
                                // Check for measure is required as REPEAT_START is processed before a marker
                                // see test::repeat23 m12
                                startRepeatReference = section[continueAt.i]
                            }
                            // We've arrived at the target marker
                            rs = new RepeatSegment(playbackCount)
                            rs.addMeasure(section[repeatListElementIt].measure)
                            continueAt.s = cend // Clear this reference - processed
                        } else { // Nowhere to go to, break out of this section loop and onto the next section
                            repeatListElementIt = section.length
                            continue
                        }
                    }
                } break
                }
                ++repeatListElementIt
            }

            // Reached the end of this section
            if (this.length) {
                // Inform the last RepeatSegment that the Section Break pause property should be honored now
                rs = this[this.length - 1]
                const last = section[section.length - 1]
                const layoutBreak = (last.element as MeasureBase).sectionBreakElement()
                if (layoutBreak !== null) {
                    rs.pause = layoutBreak.pause()
                }
            }
        }

        this.updateTempo()
        this.m_expanded = true
    }
}
