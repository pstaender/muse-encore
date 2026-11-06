/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The default synthesizer: SpessaSynth (spessasynth_lib, Apache-2.0), a SoundFont2/SF3 synthesizer, with MuseScore's
 * MS Basic.sf3. The AudioContext is created on the first use; events are scheduled on the synthesizer's clock
 * (SpessaSynth's `time` option). Channels above 16 are added to the synthesizer as needed.
 * Two modes: "worklet" renders in the AudioWorklet (the lowest latency); "worker" renders in a Web Worker ahead of the
 * output and a small worklet only plays the rendered chunks, so a slow rendering quantum does not break the sound up
 * (Firefox's audio thread could not keep up with the synthesizer: the playback crackled). Firefox uses "worker".
 */
import { WorkerSynthesizer, WorkletSynthesizer, type BasicSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import synthWorkerUrl from './spessasynthworker?worker&url'
import { loadSoundFont } from './soundfont'
import type { LoadProgress, SynthChannelSetup, Synthesizer } from './synthesizer'

const CC_BANK_MSB = 0
const CC_BANK_LSB = 32
const CC_VOLUME = 7
const CC_PAN = 10
const CC_REVERB = 91
const CC_CHORUS = 93

/**
 * the URL of SpessaSynth's worklet processor: a library build (the viewer package) inlines it as a data: URL, which
 * not every browser accepts for a worklet module: it is passed as a blob: URL then
 */
async function workletUrl(): Promise<string> {
    if (!processorUrl.startsWith('data:')) {
        return processorUrl
    }
    return URL.createObjectURL(await (await fetch(processorUrl)).blob())
}

/** SpessaSynth's controller reset values (DEFAULT_MIDI_CONTROLLERS of spessasynth_core) that are not 0 */
const CC_RESET_VALUES = new Map<number, number>([
    [7, 100], [8, 64], [10, 64], [11, 127],
    [71, 64], [72, 64], [73, 64], [74, 64], [75, 64], [76, 64], [77, 64], [78, 64], [81, 64], [83, 64],
])
/** data entry and the (N)RPN selection: not reset like a channel reset (resetChannelInternal) does */
const CC_NOT_RESET = new Set([6, 38, 84, 98, 99, 100, 101])

/**
 * the controllers of a channel added to the synthesizer: SpessaSynth resets the first 16 channels when the sound bank is
 * loaded, but leaves the controllers of added channels at 0 (expression 0: the channels above 16 were silent, only
 * the first instruments of a score with several were heard); they get the reset values of the first 16
 */
function resetAddedChannel(s: BasicSynthesizer, channel: number): void {
    for (let cc = 0; cc < 120; ++cc) {
        if (!CC_NOT_RESET.has(cc)) {
            s.controllerChange(channel, cc as never, CC_RESET_VALUES.get(cc) ?? 0)
        }
    }
    // no registered parameter selected (RPN null), so that a data entry does not change the pitch bend range
    s.controllerChange(channel, 101 as never, 127)
    s.controllerChange(channel, 100 as never, 127)
}

export type SpessaSynthMode = 'worklet' | 'worker'

/** the 128-frame chunks the worker renders ahead in the "worker" mode (WorkerSynthesizer's default: 20) */
const WORKER_QUEUE = 32

/** "worker" in Firefox, "worklet" elsewhere; ?synth=spessasynth-worker or spessasynth-worklet selects one */
export function defaultSpessaSynthMode(): SpessaSynthMode {
    const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('synth') : null
    if (param === 'spessasynth-worker' || param === 'spessasynth-worklet') {
        return param === 'spessasynth-worker' ? 'worker' : 'worklet'
    }
    return typeof navigator !== 'undefined' && /\bFirefox\//.test(navigator.userAgent) ? 'worker' : 'worklet'
}

/** the worker of the "worker" mode; a script of another origin (the viewer package from a CDN) is imported by a worker */
function createSynthWorker(): Worker {
    const url = new URL(synthWorkerUrl, import.meta.url)
    return new Worker(url.origin === location.origin ? url
        : URL.createObjectURL(new Blob([`import ${JSON.stringify(url.href)}`], { type: 'text/javascript' })), { type: 'module' })
}

export class SpessaSynthesizer implements Synthesizer {
    readonly id = 'spessasynth'
    private m_context: AudioContext | null = null
    private m_synth: BasicSynthesizer | null = null
    private m_worker: Worker | null = null
    private m_gain: GainNode | null = null
    private m_panner: StereoPannerNode | null = null
    private m_outputGain = 1
    private m_balance = 0
    private m_loading: Promise<void> | null = null
    private m_loaded = false
    private m_muted = false
    /**
     * the channels of the synthesizer in the worklet: SpessaSynth's own count (channelCount) is not reliable, its
     * "channelAdded" event adds another channel to the list of the main thread for each added channel
     */
    private m_channelCount = 16

    /** soundFontUrl: the URL of MS Basic.sf3 (soundfont.ts) */
    constructor(private readonly m_soundFontUrl: string, readonly mode: SpessaSynthMode = defaultSpessaSynthMode()) {}

    private context(): AudioContext {
        this.m_context ??= new AudioContext({ latencyHint: 'interactive' })
        return this.m_context
    }

    /**
     * the synthesizer's clock; in the "worker" mode the worker's (it follows the audio clock, the offset is updated
     * with the worker's messages): what it renders is heard after the queued chunks (outputLatency)
     */
    currentTime(): number {
        if (this.m_synth) {
            return this.m_synth.currentTime
        }
        return this.m_context ? this.m_context.currentTime : performance.now() / 1000
    }

    outputLatency(): number {
        const c = this.m_context
        if (!c) {
            return 0
        }
        const queued = this.mode === 'worker' ? WORKER_QUEUE * 128 / c.sampleRate : 0
        return (c.outputLatency || 0) + (c.baseLatency || 0) + queued
    }

    isLoaded(): boolean { return this.m_loaded }

    load(onProgress?: (p: LoadProgress) => void): Promise<void> {
        this.m_loading ??= (async () => {
            const ctx = this.context()
            const module = this.mode === 'worker' ? WorkerSynthesizer.registerPlaybackWorklet(ctx, WORKER_QUEUE)
                : workletUrl().then(url => ctx.audioWorklet.addModule(url))
            const [soundFont] = await Promise.all([loadSoundFont(this.m_soundFontUrl, onProgress), module])
            let synth: BasicSynthesizer
            if (this.mode === 'worker') {
                const worker = createSynthWorker()
                const workerSynth = new WorkerSynthesizer(ctx, worker.postMessage.bind(worker))
                worker.onmessage = e => workerSynth.handleWorkerMessage(e.data)
                this.m_worker = worker
                synth = workerSynth
            } else {
                synth = new WorkletSynthesizer(ctx)
            }
            this.m_gain = ctx.createGain()
            this.m_gain.gain.value = this.m_muted ? 0 : this.m_outputGain
            this.m_panner = ctx.createStereoPanner()
            this.m_panner.pan.value = this.m_balance
            synth.connect(this.m_gain)
            this.m_gain.connect(this.m_panner)
            this.m_panner.connect(ctx.destination)
            await synth.soundBankManager.addSoundBank(soundFont, 'main')
            await synth.isReady
            this.m_synth = synth
            this.m_loaded = true
        })()
        this.m_loading.catch(() => { this.m_loading = null })
        return this.m_loading
    }

    async resume(): Promise<void> {
        const ctx = this.context()
        if (ctx.state !== 'running') {
            await ctx.resume()
        }
    }

    isRunning(): boolean {
        return this.m_context?.state === 'running'
    }

    private opts(time?: number): { time: number } | undefined {
        return time !== undefined ? { time } : undefined
    }

    private ensureChannel(channel: number): BasicSynthesizer | null {
        const s = this.m_synth
        if (!s) {
            return null
        }
        while (this.m_channelCount <= channel) {
            s.addNewChannel()
            resetAddedChannel(s, this.m_channelCount)
            ++this.m_channelCount
        }
        return s
    }

    setupChannel(channel: number, setup: SynthChannelSetup, time?: number): void {
        const s = this.ensureChannel(channel)
        if (!s) {
            return
        }
        const o = this.opts(time)
        s.midiChannels[channel]?.setDrums(setup.drum)
        if (!setup.drum) {
            // fluid_synth_bank_select of MuseScore 4's Fluid synth: the soundfont bank of the sound mapping
            s.controllerChange(channel, CC_BANK_MSB, setup.bank & 0x7f, o)
            s.controllerChange(channel, CC_BANK_LSB, 0, o)
        }
        s.programChange(channel, setup.program & 0x7f, o)
        // the MIDI renderer's pitch bends are for a range of 12 semitones (PitchWheelSpecs::mAmplitude)
        s.pitchWheelRange(channel, 12, o)
        s.controllerChange(channel, CC_VOLUME, setup.volume & 0x7f, o)
        s.controllerChange(channel, CC_PAN, setup.pan & 0x7f, o)
        s.controllerChange(channel, CC_REVERB, setup.reverb & 0x7f, o)
        s.controllerChange(channel, CC_CHORUS, setup.chorus & 0x7f, o)
    }

    noteOn(channel: number, pitch: number, velocity: number, time?: number): void {
        this.ensureChannel(channel)?.noteOn(channel, pitch, velocity, this.opts(time))
    }

    noteOff(channel: number, pitch: number, time?: number): void {
        this.ensureChannel(channel)?.noteOff(channel, pitch, this.opts(time))
    }

    controller(channel: number, controller: number, value: number, time?: number): void {
        this.ensureChannel(channel)?.controllerChange(channel, controller as never, value, this.opts(time))
    }

    programChange(channel: number, program: number, time?: number): void {
        this.ensureChannel(channel)?.programChange(channel, program & 0x7f, this.opts(time))
    }

    pitchBend(channel: number, value: number, time?: number): void {
        this.ensureChannel(channel)?.pitchWheel(channel, value, this.opts(time))
    }

    stopAll(force = false): void {
        this.m_synth?.stopAll(force)
    }

    setMuted(muted: boolean): void {
        this.m_muted = muted
        this.updateGain()
    }

    setOutputGain(gain: number, balance: number): void {
        this.m_outputGain = gain
        this.m_balance = balance
        this.updateGain()
        if (this.m_panner && this.m_context) {
            this.m_panner.pan.setTargetAtTime(balance, this.m_context.currentTime, 0.01)
        }
    }

    private updateGain(): void {
        if (this.m_gain && this.m_context) {
            this.m_gain.gain.setTargetAtTime(this.m_muted ? 0 : this.m_outputGain, this.m_context.currentTime, 0.01)
        }
    }
}
