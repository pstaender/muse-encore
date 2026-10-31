/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The level gate of the note detection: notes that are too quiet are not reported (keys pressed without sounding,
 * the thump of a key, noise of the room). The audio level is measured per hop (256 samples at 22050 Hz, one frame of
 * the model); the noise floor is the quietest block (~93 ms) of the last 60 s, so it adapts to the microphone and the
 * room, but at most FLOOR_CAP_DB (when the music plays from the start or without a pause, the quietest block is music,
 * not the room). A note is loud enough when the mean level of the ~100 ms after its start is clearly above the floor (a short
 * click has little energy over that time, a struck note sustains) and above an absolute minimum.
 */

/** samples per hop (the model's FFT hop) */
export const HOP = 256
/** hops per block of the noise floor (~93 ms) and the blocks it is the quietest of (~30 s) */
const FLOOR_BLOCK_HOPS = 8
const FLOOR_BLOCKS = 640
/** the noise floor is assumed to be at most this (dBFS) */
const FLOOR_CAP_DB = -50
/** the levels kept (hops, ~47 s) */
const LEVEL_HOPS = 4096
/** the hops measured around the start of a note: before (alignment) and after (~100 ms) */
const NOTE_HOPS_BEFORE = 2
const NOTE_HOPS_AFTER = 8
/** dB below which there is nothing (digital silence) */
const SILENCE_DB = -100

export interface LevelGateOptions {
    /** how much louder than the noise floor a note must be (dB) */
    overFloorDb: number
    /** the level a note must have at least (dBFS) */
    minDb: number
}

export const DEFAULT_LEVEL_GATE: LevelGateOptions = { overFloorDb: 15, minDb: -60 }

const toDb = (power: number): number => (power > 0 ? Math.max(SILENCE_DB, 10 * Math.log10(power)) : SILENCE_DB)

export class LevelGate {
    private readonly options: LevelGateOptions
    /** the mean power of each hop (ring) */
    private readonly power = new Float64Array(LEVEL_HOPS)
    /** the hops measured since the start */
    private m_hops = 0
    private partial = 0
    private partialPower = 0
    /** the mean power of the recent blocks (ring) and of the block being measured */
    private readonly blocks = new Float64Array(FLOOR_BLOCKS)
    private nBlocks = 0
    private blockPower = 0
    private blockHops = 0
    /** the block being measured has digital silence (not the noise of the room) */
    private blockSilent = false

    constructor(options: LevelGateOptions = DEFAULT_LEVEL_GATE) {
        this.options = { ...options }
    }

    setOptions(options: Partial<LevelGateOptions>): void {
        Object.assign(this.options, options)
    }

    /** the hops measured since the start (the hop index of the next samples) */
    hops(): number {
        return this.m_hops
    }

    /** audio at 22050 Hz */
    push(samples: Float32Array): void {
        for (let i = 0; i < samples.length; ++i) {
            this.partialPower += samples[i] * samples[i]
            if (++this.partial === HOP) {
                this.addHop(this.partialPower / HOP)
                this.partial = 0
                this.partialPower = 0
            }
        }
    }

    private addHop(power: number): void {
        this.power[this.m_hops % LEVEL_HOPS] = power
        ++this.m_hops
        this.blockPower += power
        this.blockSilent ||= power === 0
        if (++this.blockHops === FLOOR_BLOCK_HOPS) {
            // digital silence (before the microphone delivers) is not the noise of the room
            if (!this.blockSilent) {
                this.blocks[this.nBlocks % FLOOR_BLOCKS] = this.blockPower / FLOOR_BLOCK_HOPS
                ++this.nBlocks
            }
            this.blockPower = 0
            this.blockHops = 0
            this.blockSilent = false
        }
    }

    /** the noise floor (dBFS): the quietest block of the last 60 s, at most FLOOR_CAP_DB */
    floorDb(): number {
        const n = Math.min(this.nBlocks, FLOOR_BLOCKS)
        if (!n) {
            return SILENCE_DB
        }
        let min = Infinity
        for (let i = 0; i < n; ++i) {
            min = Math.min(min, this.blocks[i])
        }
        return Math.min(FLOOR_CAP_DB, toDb(min))
    }

    /** the mean level (dBFS) of the hops [from, to) that are still kept (SILENCE_DB if none) */
    levelDb(from: number, to: number): number {
        const lo = Math.max(from, this.m_hops - LEVEL_HOPS, 0)
        const hi = Math.min(to, this.m_hops)
        if (hi <= lo) {
            return SILENCE_DB
        }
        let sum = 0
        for (let h = lo; h < hi; ++h) {
            sum += this.power[h % LEVEL_HOPS]
        }
        return toDb(sum / (hi - lo))
    }

    /** the level of a note starting at a hop */
    noteLevelDb(startHop: number): number {
        return this.levelDb(startHop - NOTE_HOPS_BEFORE, startHop + NOTE_HOPS_AFTER)
    }

    /** a note starting at this hop is loud enough */
    accepts(startHop: number): boolean {
        const level = this.noteLevelDb(startHop)
        return level >= this.options.minDb && level >= this.floorDb() + this.options.overFloorDb
    }
}
