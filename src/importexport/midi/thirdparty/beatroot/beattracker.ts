/*
 * SPDX-License-Identifier: GPL-2.0-or-later
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 *
 * Port of src/importexport/midi/thirdparty/beatroot (Event.h, Agent.h/.cpp, AgentList.h/.cpp, Induction.h/.cpp,
 * BeatTracker.h/.cpp): the BeatRoot beat tracker.
 *
 *   Vamp feature extraction plugin for the BeatRoot beat tracker.
 *   Centre for Digital Music, Queen Mary, University of London.
 *   This file copyright 2011 Simon Dixon, Chris Cannam and QMUL.
 *
 *   This program is free software; you can redistribute it and/or
 *   modify it under the terms of the GNU General Public License as
 *   published by the Free Software Foundation; either version 2 of the
 *   License, or (at your option) any later version.
 *
 * std::list<Event> (EventList) is an array here.
 */

/** C nearbyint with the default rounding mode (round half to even) */
function nearbyint(x: number): number {
    const r = Math.round(x)
    if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) {
        return r - 1
    }
    return r
}

export class Event {
    constructor(public time = 0, public salience = 0) {}

    ne(e: Event): boolean {
        return this.time !== e.time || this.salience !== e.salience
    }
}

export type EventList = Event[]

export class AgentParameters {
    static readonly DEFAULT_POST_MARGIN_FACTOR = 0.3
    static readonly DEFAULT_PRE_MARGIN_FACTOR = 0.15
    static readonly DEFAULT_MAX_CHANGE = 0.2
    static readonly DEFAULT_EXPIRY_TIME = 10.0

    /** The maximum amount by which a beat can be later than the predicted beat time, as a fraction of the beat period. */
    postMarginFactor = AgentParameters.DEFAULT_POST_MARGIN_FACTOR
    /** The maximum amount by which a beat can be earlier than the predicted beat time, as a fraction of the period. */
    preMarginFactor = AgentParameters.DEFAULT_PRE_MARGIN_FACTOR
    /** The maximum allowed deviation from the initial tempo, as a fraction of the initial beat period. */
    maxChange = AgentParameters.DEFAULT_MAX_CHANGE
    /** The time (in seconds) after which an Agent that has no Event matching its beat predictions will be destroyed. */
    expiryTime = AgentParameters.DEFAULT_EXPIRY_TIME
}

/**
 * Agent is the central class for beat tracking.
 * Each Agent object has a tempo hypothesis, a history of tracked beats, and
 * a score evaluating the continuity, regularity and salience of its beat track.
 */
export class Agent {
    /** The identity number of the next created Agent */
    private static idCounter = 0
    /** The maximum time (in seconds) that a beat can deviate from the predicted beat time without a fork occurring. */
    private static readonly INNER_MARGIN = 0.040
    /** The slope of the penalty function for onsets which do not coincide precisely with predicted beat times. */
    private static readonly CONF_FACTOR = 0.5
    /** The default reactiveness/inertia balance. */
    private static readonly DEFAULT_CORRECTION_FACTOR = 50.0

    /** The Agent's unique identity number. */
    idNumber: number
    /** Sum of salience values of the Events which have been interpreted as beats by this Agent. */
    phaseScore = 0.0
    /** The number of beats found by this Agent, including interpolated beats. */
    beatCount = 0
    /** The current tempo hypothesis of the Agent, expressed as the beat period in seconds. */
    beatInterval: number
    /** The initial tempo hypothesis of the Agent, expressed as the beat period in seconds. */
    initialBeatInterval: number
    /** The time of the most recent beat accepted by this Agent. */
    beatTime = -1.0
    /** The maximum allowed deviation from the initial tempo, expressed as a fraction of the initial beat period. */
    maxChange: number
    /** The list of Events (onsets) accepted by this Agent as beats, plus interpolated beats. */
    events: EventList = []

    private preMargin: number
    private postMargin: number
    private innerMargin: number
    private correctionFactor: number
    private expiryTime: number

    constructor(params: AgentParameters, ibi: number) {
        this.idNumber = Agent.idCounter++
        this.beatInterval = ibi
        this.initialBeatInterval = ibi
        this.maxChange = params.maxChange
        this.preMargin = ibi * params.preMarginFactor
        this.postMargin = ibi * params.postMarginFactor
        this.innerMargin = Agent.INNER_MARGIN
        this.correctionFactor = Agent.DEFAULT_CORRECTION_FACTOR
        this.expiryTime = params.expiryTime
    }

    clone(): Agent {
        const a = Object.create(Agent.prototype) as Agent
        Object.assign(a, this)
        a.events = this.events.map(e => new Event(e.time, e.salience))
        a.idNumber = Agent.idCounter++
        return a
    }

    /** Accept a new Event as a beat time, and update the state of the Agent accordingly. */
    accept(e: Event, err: number, beats: number): void {
        this.beatTime = e.time
        this.events.push(new Event(e.time, e.salience))
        if (Math.abs(this.initialBeatInterval - this.beatInterval - err / this.correctionFactor)
            < this.maxChange * this.initialBeatInterval) {
            this.beatInterval += err / this.correctionFactor // Adjust tempo
        }
        this.beatCount += beats
        const conFactor = 1.0 - Agent.CONF_FACTOR * err / (err > 0 ? this.postMargin : -this.preMargin)
        this.phaseScore += conFactor * e.salience
    }

    /** The given Event is tested for a possible beat time. */
    considerAsBeat(e: Event, a: AgentList): boolean {
        if (this.beatTime < 0) { // first event
            this.accept(e, 0, 1)
            return true
        } else { // subsequent events
            const last = this.events[this.events.length - 1]
            if (e.time - last.time > this.expiryTime) {
                this.phaseScore = -1.0 // flag agent to be deleted
                return false
            }
            const beats = nearbyint((e.time - this.beatTime) / this.beatInterval)
            const err = e.time - this.beatTime - beats * this.beatInterval
            if ((beats > 0) && (-this.preMargin <= err) && (err <= this.postMargin)) {
                if (Math.abs(err) > this.innerMargin) {
                    // Create new agent that skips this event (avoids
                    // large phase jump)
                    a.add(this.clone())
                }
                this.accept(e, err, Math.trunc(beats))
                return true
            }
        }
        return false
    }

    /** Interpolates missing beats in the Agent's beat track. */
    fillBeats(start = -1.0): void {
        if (this.events.length === 0) {
            return
        }
        let prevBeat = this.events[0].time
        for (let it = 1; it < this.events.length; ++it) {
            const nextBeat = this.events[it].time
            let beats = nearbyint((nextBeat - prevBeat) / this.beatInterval - 0.01) // prefer slow
            const currentInterval = (nextBeat - prevBeat) / beats
            for (; (nextBeat > start) && (beats > 1.5); --beats) {
                prevBeat += currentInterval
                this.events.splice(it, 0, new Event(prevBeat, 0)) // insert before it
                ++it
            }
            prevBeat = nextBeat
        }
    }
}

/** Class for maintaining the set of all Agents involved in beat tracking a piece of music. */
export class AgentList {
    /** Flag for choice between sum and average beat salience values for Agent scores. */
    static useAverageSalience = false
    /** For the purpose of removing duplicate agents, the default JND of IBI */
    static readonly DEFAULT_BI = 0.02
    /** For the purpose of removing duplicate agents, the default JND of phase */
    static readonly DEFAULT_BT = 0.04

    list: Agent[] = []

    empty(): boolean { return this.list.length === 0 }
    size(): number { return this.list.length }
    push_back(a: Agent): void { this.list.push(a) }

    /** Appends newAgent to list (sort==false), or inserts newAgent into the list in ascending order of beatInterval */
    add(newAgent: Agent, sort = true): void {
        this.push_back(newAgent)
        if (sort) {
            this.sort()
        }
    }

    /** Sorts the AgentList by increasing beatInterval. */
    sort(): void {
        this.list.sort((a, b) => {
            if (a.beatInterval === b.beatInterval) {
                return a.idNumber - b.idNumber // ensure stable ordering
            }
            return a.beatInterval < b.beatInterval ? -1 : 1
        })
    }

    remove(i: number): void {
        this.list.splice(i, 1)
    }

    /** Removes Agents from the list which are duplicates of other Agents. */
    private removeDuplicates(): void {
        this.sort()
        const list = this.list
        for (let itr = 0; itr < list.length; ++itr) {
            if (list[itr].phaseScore < 0.0) { // already flagged for deletion
                continue
            }
            for (let itr2 = itr + 1; itr2 < list.length; ++itr2) {
                if (list[itr2].beatInterval - list[itr].beatInterval > AgentList.DEFAULT_BI) {
                    break
                }
                if (Math.abs(list[itr].beatTime - list[itr2].beatTime) > AgentList.DEFAULT_BT) {
                    continue
                }
                if (list[itr].phaseScore < list[itr2].phaseScore) {
                    list[itr].phaseScore = -1.0 // flag for deletion
                    break
                } else {
                    list[itr2].phaseScore = -1.0 // flag for deletion
                }
            }
        }

        this.list = list.filter(agent => !(agent.phaseScore < 0.0))
    }

    /** Perform beat tracking on a list of events (onsets). Do not find beats after stop seconds. */
    beatTrack(el: EventList, params: AgentParameters, stop = -1.0): void {
        const phaseGiven = !this.empty() && (this.list[0].beatTime >= 0) // if given for one, assume given for others
        for (const ev of el) {
            if ((stop > 0) && (ev.time > stop)) {
                break
            }
            let created = phaseGiven
            let prevBeatInterval = -1.0
            // cc: Duplicate our list of agents, and scan through the
            // copy.  This means we can safely add agents to our own
            // list while scanning without disrupting our scan.  Each
            // agent needs to be re-added to our own list explicitly
            // (since it is modified by e.g. considerAsBeat)
            const currentAgents = this.list
            this.list = []
            for (const currentAgent of currentAgents) {
                if (currentAgent.beatInterval !== prevBeatInterval) {
                    if ((prevBeatInterval >= 0) && !created && (ev.time < 5.0)) {
                        // Create new agent with different phase
                        const newAgent = new Agent(params, prevBeatInterval)
                        // This may add another agent to our list as well
                        newAgent.considerAsBeat(ev, this)
                        this.add(newAgent)
                    }
                    prevBeatInterval = currentAgent.beatInterval
                    created = phaseGiven
                }
                if (currentAgent.considerAsBeat(ev, this)) {
                    created = true
                }
                this.add(currentAgent)
            } // loop for each agent
            this.removeDuplicates()
        } // loop for each event
    }

    /** Finds the Agent with the highest score in the list, or null if beat tracking has failed. */
    bestAgent(): Agent | null {
        let best = -1.0
        let bestAg: Agent | null = null
        for (const a of this.list) {
            if (a.events.length === 0) {
                continue
            }
            const conf = a.phaseScore / (AgentList.useAverageSalience ? a.beatCount : 1.0)
            if (conf > best) {
                bestAg = a
                best = conf
            }
        }
        return bestAg
    }
}

/**
 * Performs tempo induction by finding clusters of similar inter-onset intervals (IOIs), ranking them according to the
 * number of intervals and relationships between them, and returning a set of tempo hypotheses for initialising the
 * beat tracking agents.
 */
export class Induction {
    /** The maximum difference in IOIs which are in the same cluster */
    static clusterWidth = 0.025
    /** The minimum IOI for inclusion in a cluster */
    static minIOI = 0.070
    /** The maximum IOI for inclusion in a cluster */
    static maxIOI = 2.500
    /** The minimum inter-beat interval (IBI), i.e. the maximum tempo hypothesis that can be returned. */
    static minIBI = 0.3
    /** The maximum inter-beat interval (IBI), i.e. the minimum tempo hypothesis that can be returned. */
    static maxIBI = 1.0
    /** The maximum number of tempo hypotheses to return */
    static topN = 10

    /** Performs tempo induction (see JNMR 2001 paper by Simon Dixon for details). */
    static beatInduction(params: AgentParameters, events: EventList): AgentList {
        const clusterWidth = Induction.clusterWidth
        const topN = Induction.topN
        let i: number
        let j: number
        let b: number
        let bestCount: number
        let submult: boolean
        let intervals = 0 // number of interval clusters
        const bestn: number[] = new Array(topN).fill(0) // count of high-scoring clusters

        let ratio: number
        let err: number
        let degree: number
        const maxClusterCount = Math.ceil((Induction.maxIOI - Induction.minIOI) / clusterWidth)
        const clusterMean: number[] = new Array(maxClusterCount).fill(0)
        const clusterSize: number[] = new Array(maxClusterCount).fill(0)
        const clusterScore: number[] = new Array(maxClusterCount).fill(0)

        let ptr1 = 0
        while (ptr1 !== events.length) {
            const e1 = events[ptr1]
            ++ptr1
            let ptr2 = 0
            let e2 = events[ptr2]
            ++ptr2
            while (e2.ne(e1) && ptr2 !== events.length) {
                e2 = events[ptr2]
                ++ptr2
            }
            while (ptr2 !== events.length) {
                e2 = events[ptr2]
                ++ptr2
                const ioi = e2.time - e1.time
                if (ioi < Induction.minIOI) { // skip short intervals
                    continue
                }
                if (ioi > Induction.maxIOI) { // ioi too long
                    break
                }
                for (b = 0; b < intervals; b++) { // assign to nearest cluster
                    if (Math.abs(clusterMean[b] - ioi) < clusterWidth) {
                        if ((b < intervals - 1) && (Math.abs(clusterMean[b + 1] - ioi)
                                                    < Math.abs(clusterMean[b] - ioi))) {
                            b++ // next cluster is closer
                        }
                        clusterMean[b] = (clusterMean[b] * clusterSize[b] + ioi) / (clusterSize[b] + 1)
                        clusterSize[b]++
                        break
                    }
                }
                if (b === intervals) { // no suitable cluster; create new one
                    if (intervals === maxClusterCount) {
                        continue // ignore this IOI
                    }
                    intervals++
                    for (; (b > 0) && (clusterMean[b - 1] > ioi); b--) {
                        clusterMean[b] = clusterMean[b - 1]
                        clusterSize[b] = clusterSize[b - 1]
                    }
                    clusterMean[b] = ioi
                    clusterSize[b] = 1
                }
            }
        }
        for (b = 0; b < intervals; b++) { // merge similar intervals
            for (i = b + 1; i < intervals; i++) {
                if (Math.abs(clusterMean[b] - clusterMean[i]) < clusterWidth) {
                    clusterMean[b] = (clusterMean[b] * clusterSize[b] + clusterMean[i] * clusterSize[i])
                        / (clusterSize[b] + clusterSize[i])
                    clusterSize[b] = clusterSize[b] + clusterSize[i]
                    --intervals
                    for (j = i + 1; j <= intervals; j++) {
                        clusterMean[j - 1] = clusterMean[j]
                        clusterSize[j - 1] = clusterSize[j]
                    }
                }
            }
        }
        if (intervals === 0) {
            return new AgentList()
        }
        for (b = 0; b < intervals; b++) {
            clusterScore[b] = 10 * clusterSize[b]
        }
        bestn[0] = 0
        bestCount = 1

        for (b = 0; b < intervals; b++) {
            for (i = 0; i <= bestCount; i++) {
                if (i < topN && (i === bestCount || clusterScore[b] > clusterScore[bestn[i]])) {
                    if (bestCount < topN) {
                        bestCount++
                    }
                    for (j = bestCount - 1; j > i; j--) {
                        bestn[j] = bestn[j - 1]
                    }
                    bestn[i] = b
                    break
                }
            }
        }
        for (b = 0; b < intervals; b++) { // score intervals
            for (i = b + 1; i < intervals; i++) {
                ratio = clusterMean[b] / clusterMean[i]
                submult = ratio < 1
                if (submult) {
                    degree = Math.trunc(nearbyint(1 / ratio))
                } else {
                    degree = Math.trunc(nearbyint(ratio))
                }
                if ((degree >= 2) && (degree <= 8)) {
                    if (submult) {
                        err = Math.abs(clusterMean[b] * degree - clusterMean[i])
                    } else {
                        err = Math.abs(clusterMean[b] - clusterMean[i] * degree)
                    }
                    if (err < (submult ? clusterWidth : clusterWidth * degree)) {
                        if (degree >= 5) {
                            degree = 1
                        } else {
                            degree = 6 - degree
                        }
                        clusterScore[b] += degree * clusterSize[i]
                        clusterScore[i] += degree * clusterSize[b]
                    }
                }
            }
        }

        const a = new AgentList()
        for (let index = 0; index < bestCount; index++) {
            b = bestn[index]
            // Adjust it, using the size of super- and sub-intervals
            let newSum = clusterMean[b] * clusterScore[b]
            let newWeight = clusterScore[b]

            for (i = 0; i < intervals; i++) {
                if (i === b) {
                    continue
                }
                ratio = clusterMean[b] / clusterMean[i]
                if (ratio < 1) {
                    degree = Math.trunc(nearbyint(1 / ratio))
                    if ((degree >= 2) && (degree <= 8)) {
                        err = Math.abs(clusterMean[b] * degree - clusterMean[i])
                        if (err < clusterWidth) {
                            newSum += clusterMean[i] / degree * clusterScore[i]
                            newWeight += clusterScore[i]
                        }
                    }
                } else {
                    degree = Math.trunc(nearbyint(ratio))
                    if ((degree >= 2) && (degree <= 8)) {
                        err = Math.abs(clusterMean[b] - degree * clusterMean[i])
                        if (err < clusterWidth * degree) {
                            newSum += clusterMean[i] * degree * clusterScore[i]
                            newWeight += clusterScore[i]
                        }
                    }
                }
            }
            let beat = newSum / newWeight
            // Scale within range ... hope the grouping isn't ternary :(
            while (beat < Induction.minIBI) { // Maximum speed
                beat *= 2.0
            }
            while (beat > Induction.maxIBI) { // Minimum speed
                beat /= 2.0
            }
            if (beat >= Induction.minIBI) {
                a.push_back(new Agent(params, beat))
            }
        }
        return a
    }
}

/**
 * BeatTracker::beatTrack: perform beat tracking.
 * @param events The onsets or peaks in a feature list
 * @param beats The initial beats which are given, if any
 * @return The list of beats, or an empty list if beat tracking fails
 */
export function beatTrack(events: EventList, params: AgentParameters = new AgentParameters(),
                          beats: EventList = []): number[] {
    let agents = new AgentList()
    let count = 0
    let beatTime = -1
    if (beats.length !== 0) {
        count = beats.length - 1
        beatTime = beats[beats.length - 1].time
    }
    if (count > 0) { // tempo given by mean of initial beats
        const ioi = (beatTime - beats[0].time) / count
        agents.push_back(new Agent(params, ioi))
    } else { // tempo not given; use tempo induction
        agents = Induction.beatInduction(params, events)
    }

    if (beats.length !== 0) {
        for (const a of agents.list) {
            a.beatTime = beatTime
            a.beatCount = count
            a.events = beats.map(e => new Event(e.time, e.salience))
        }
    }
    agents.beatTrack(events, params, -1)

    const best = agents.bestAgent()
    const resultBeatTimes: number[] = []

    if (best) {
        best.fillBeats(beatTime)
        for (const e of best.events) {
            resultBeatTimes.push(e.time)
        }
    }

    return resultBeatTimes
}
