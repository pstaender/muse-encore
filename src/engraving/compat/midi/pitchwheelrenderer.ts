/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/pitchwheelrenderer.h/.cpp
 */

import { EventsHolder, NPlayEvent } from './event'
import { ME_PITCHBEND, type PitchWheelSpecs } from './midicoreevent'
import { MidiInstrumentEffect } from './midiinstrumenteffects'

export interface PitchWheelFunction {
    mStartTick: number
    mEndTick: number
    func: (tick: number) => number
}

interface PitchWheelFunctions {
    startTick: number
    endTick: number
    functions: PitchWheelFunction[]
}

/** C++ int conversion of the float results of the pitch wheel functions */
const toInt = (v: number): number => Math.trunc(v)

export class PitchWheelRenderer {
    private _functions = new Map<number /*channel*/, PitchWheelFunctions>()
    private _effectByChannel = new Map<number, MidiInstrumentEffect>()
    private _staffIdxByChannel = new Map<number, number>()

    constructor(private _wheelSpec: PitchWheelSpecs) {}

    addPitchWheelFunction(func: PitchWheelFunction, channel: number, staffIdx: number, effect: MidiInstrumentEffect): void {
        let functions = this._functions.get(channel)
        if (!functions) {
            functions = { startTick: 0x7fffffff, endTick: 0, functions: [] }
            this._functions.set(channel, functions)
        }
        this._effectByChannel.set(channel, effect)
        this._staffIdxByChannel.set(channel, staffIdx)

        if (func.mStartTick < functions.startTick) {
            functions.startTick = func.mStartTick
        }

        if (func.mEndTick > functions.endTick) {
            functions.endTick = func.mEndTick
        }

        functions.functions.push(func)
    }

    renderPitchWheel(): EventsHolder {
        const pitchWheelEvents = new EventsHolder()
        // std::map<uint32_t, ...>: ordered by channel
        for (const channel of [...this._functions.keys()].sort((a, b) => a - b)) {
            this.renderChannelPitchWheel(pitchWheelEvents, this._functions.get(channel)!, channel)
        }

        return pitchWheelEvents
    }

    private renderChannelPitchWheel(pitchWheelEvents: EventsHolder, functions: PitchWheelFunctions, channel: number): void {
        if (functions.endTick < functions.startTick) {
            return
        }

        const effect = this._effectByChannel.get(channel) ?? MidiInstrumentEffect.NONE

        const staffInfoValid = this._staffIdxByChannel.has(channel)
        const staffIdx = this._staffIdxByChannel.get(channel) ?? 0

        const ranges = new Map<number, number>()
        PitchWheelRenderer.generateRanges(functions.functions, ranges)

        // ranges is std::map<int, int, std::greater<>>, iterated with reverse iterators: ascending start ticks
        for (const start of [...ranges.keys()].sort((a, b) => a - b)) {
            const end = ranges.get(start)!
            let tick = start

            const functionsToProcess: PitchWheelFunction[] = []
            for (const func of functions.functions) {
                if (func.mEndTick <= end) {
                    functionsToProcess.push(func)
                }
            }

            const pitches: number[] = new Array(functionsToProcess.length).fill(0)

            let prevPitch = this._wheelSpec.mLimit
            let forceUpdate = false
            while (tick < end) {
                for (let i = 0; i < functionsToProcess.length; ++i) {
                    const f = functionsToProcess[i]
                    if (tick >= f.mEndTick) {
                        // Function exceeds its max range
                        // don't need its value anymore
                        pitches[i] = 0
                        forceUpdate = true
                        continue
                    }

                    if (tick < f.mStartTick) {
                        continue
                    }

                    pitches[i] = toInt(f.func(tick))
                }

                let finalPitch = this._wheelSpec.mLimit
                for (const pitch of pitches) {
                    finalPitch += pitch
                }
                finalPitch = Math.min(Math.max(finalPitch, 0), 2 * this._wheelSpec.mLimit - 1)

                if (forceUpdate || finalPitch !== prevPitch || tick === start) {
                    const evb = new NPlayEvent(ME_PITCHBEND, channel, finalPitch % 128, Math.trunc(finalPitch / 128))
                    evb.setEffect(effect)
                    if (staffInfoValid) {
                        evb.setOriginatingStaff(staffIdx)
                    }
                    pitchWheelEvents.at(channel).emplace(tick, evb)
                    forceUpdate = false
                }
                prevPitch = finalPitch
                tick += this._wheelSpec.mStep
            }
        }
    }

    // 1                |------|
    // 2                   |-----------| handleStartTick();
    // result           |--------------|
    // 3           |--------|            handleEndTick();
    // result      |-------------------|
    /** ranges: start tick -> end tick (C++ std::map<int, int, std::greater<>>) */
    static generateRanges(functions: readonly PitchWheelFunction[], ranges: Map<number, number>): void {
        // !NOTE ranges map is reversed (std::greater): upper_bound(k) is the first range with a start < k
        const upperBound = (k: number): number | undefined => {
            let best: number | undefined
            for (const s of ranges.keys()) {
                if (s < k && (best === undefined || s > best)) {
                    best = s
                }
            }
            return best
        }

        const handleEndTick = (func: PitchWheelFunction): boolean => {
            const lowerRange = upperBound(func.mEndTick)
            if (lowerRange === undefined) {
                return false
            }

            const v = ranges.get(lowerRange)!
            if (!ranges.has(func.mStartTick)) {
                ranges.set(func.mStartTick, v)
            }
            ranges.delete(lowerRange)
            return true
        }

        const handleStartTick = (func: PitchWheelFunction): boolean => {
            const lowerRange = upperBound(func.mStartTick)
            if (lowerRange === undefined) {
                // We are getting PW events sorted by startTick
                // So in ideal world handleEndTick always return false
                return handleEndTick(func)
            }

            const v = ranges.get(lowerRange)!
            if (v >= func.mStartTick) {
                ranges.set(lowerRange, Math.max(v, func.mEndTick))
                return true
            }

            return false
        }

        for (const func of functions) {
            const key = ranges.get(func.mStartTick)
            if (key !== undefined) {
                ranges.set(func.mStartTick, Math.max(key, func.mEndTick))
                continue
            }

            if (!handleStartTick(func)) {
                ranges.set(func.mStartTick, func.mEndTick)
            }
        }
    }
}
