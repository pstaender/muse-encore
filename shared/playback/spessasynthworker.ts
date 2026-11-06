/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The Web Worker of SpessaSynth's WorkerSynthesizer (spessasynth.ts, mode "worker"): the synthesizer renders here,
 * ahead of the audio output; a small playback worklet only plays the rendered chunks. The first message of the
 * WorkerSynthesizer configures it (sample rate, start time) and carries the port to the playback worklet.
 */
import { WorkerSynthesizerCore } from 'spessasynth_lib'

const scope = self as unknown as {
    postMessage: typeof Worker.prototype.postMessage
    onmessage: ((e: MessageEvent) => void) | null
}
let core: WorkerSynthesizerCore | null = null

scope.onmessage = (e: MessageEvent) => {
    if (!core) {
        core = new WorkerSynthesizerCore(e.data, e.ports[0], scope.postMessage.bind(scope))
        return
    }
    core.handleMessage(e.data)
}
