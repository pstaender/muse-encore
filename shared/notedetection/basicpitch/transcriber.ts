// SPDX-License-Identifier: Apache-2.0
// MuseEncore: demo/transcriber.ts of basic-pitch-ts (its live microphone demo); changed: the imports, the updates
// report the audio sample their window ends at (endSample) (see LICENSE).
/*
 * Copyright 2022 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as tf from '@tensorflow/tfjs';

import { BasicPitch } from './inference';
import {
  addPitchBendsToNoteEvents,
  type NoteEvent,
  outputToNotesPoly,
} from './notes';
import { MODEL_SAMPLE_RATE, RingBuffer } from './audioinput';

// See src/inference.ts / basic_pitch/constants.py
const FFT_HOP = 256;
const AUDIO_N_SAMPLES = MODEL_SAMPLE_RATE * 2 - FFT_HOP;
/** Frames the model produces per window after removing the overlap (172 - 30). */
const MAX_NEW_FRAMES = 142;
/**
 * The unwrapped output ends 15 frames before the end of the audio window,
 * which is the minimum latency of this approach.
 */
export const MODEL_LATENCY_SECONDS = (15 * FFT_HOP) / MODEL_SAMPLE_RATE;
export const FRAMES_PER_SECOND = MODEL_SAMPLE_RATE / FFT_HOP;
const ENERGY_TOLERANCE = 11;

export interface DetectionSettings {
  onsetThreshold: number;
  frameThreshold: number;
  minNoteLengthFrames: number;
  melodiaTrick: boolean;
}

export interface LiveNote {
  pitchMidi: number;
  /** Absolute frame index since the transcriber was started. */
  startFrame: number;
  durationFrames: number;
  amplitude: number;
  pitchBends?: number[];
  /** True if the note is still sounding at the most recent frame. */
  active: boolean;
  /** True if the note can't change anymore with new audio. */
  final: boolean;
}

export interface TranscriptionUpdate {
  /** All notes in the analyzed history. */
  notes: LiveNote[];
  /** The newest frame activations (88 values, one per piano key). */
  latestFrame: number[];
  /** Absolute index of the last frame. */
  lastFrame: number;
  /** The number of samples pushed when the window of this update was taken (its end). */
  endSample: number;
  inferenceMs: number;
}

/**
 * Runs basic pitch on a live audio stream: every time enough new audio has
 * arrived, the most recent 2s window is passed through the model and the new
 * frames are appended to a rolling history which is decoded into notes.
 */
export class LiveTranscriber {
  readonly frames: number[][] = [];
  readonly onsets: number[][] = [];
  readonly contours: number[][] = [];
  /** Absolute frame index of frames[0]. */
  historyStart = 0;

  private readonly ring = new RingBuffer(AUDIO_N_SAMPLES);
  private newSamples = 0;
  private totalSamples = 0;
  private frameRemainder = 0;
  private running = false;

  constructor(
    private readonly basicPitch: BasicPitch,
    private readonly getSettings: () => DetectionSettings,
    private readonly onUpdate: (update: TranscriptionUpdate) => void,
    /** Seconds of output to keep and decode into notes. */
    private readonly historySeconds = 6,
    /** Minimum new audio before running the model again. */
    private readonly hopSamples = 2048,
  ) {}

  /** Run the model once so the first real inference is fast. */
  static async warmUp(basicPitch: BasicPitch) {
    const input = tf.zeros<tf.Rank.R3>([1, AUDIO_N_SAMPLES, 1]);
    const results = await basicPitch.evaluateSingleFrame(input, 0);
    await results[0].data();
    tf.dispose([input, ...results]);
  }

  pushAudio(samples: Float32Array) {
    this.ring.push(samples);
    this.newSamples += samples.length;
    this.totalSamples += samples.length;
  }

  start() {
    this.reset();
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.ring.clear();
    this.frames.length = 0;
    this.onsets.length = 0;
    this.contours.length = 0;
    this.historyStart = 0;
    this.newSamples = 0;
    this.totalSamples = 0;
    this.frameRemainder = 0;
  }

  private async loop() {
    while (this.running) {
      if (this.newSamples < this.hopSamples) {
        await new Promise(resolve => setTimeout(resolve, 5));
        continue;
      }
      await this.step();
    }
  }

  private async step() {
    const t0 = performance.now();
    const window = this.ring.snapshot();
    const endSample = this.totalSamples;
    const newSamples = this.newSamples;
    this.newSamples = 0;

    const input = tf.tensor3d(window, [1, AUDIO_N_SAMPLES, 1]);
    const results = await this.basicPitch.evaluateSingleFrame(input, 0);
    const unwrapped = results.map(r => this.basicPitch.unwrapOutput(r));
    const [frames, onsets, contours] = await Promise.all(
      unwrapped.map(t => t.array()),
    );
    tf.dispose([input, ...results, ...unwrapped]);
    if (!this.running) return;

    // only append the frames that belong to audio we haven't seen yet
    this.frameRemainder += newSamples / FFT_HOP;
    const nNew = Math.min(MAX_NEW_FRAMES, Math.floor(this.frameRemainder));
    this.frameRemainder -= Math.floor(this.frameRemainder);
    if (nNew === 0) return;
    this.frames.push(...frames.slice(-nNew));
    this.onsets.push(...onsets.slice(-nNew));
    this.contours.push(...contours.slice(-nNew));

    const maxHistory = Math.round(this.historySeconds * FRAMES_PER_SECOND);
    const overflow = this.frames.length - maxHistory;
    if (overflow > 0) {
      this.frames.splice(0, overflow);
      this.onsets.splice(0, overflow);
      this.contours.splice(0, overflow);
      this.historyStart += overflow;
    }

    this.onUpdate({
      notes: this.detectNotes(),
      latestFrame: this.frames[this.frames.length - 1],
      lastFrame: this.historyStart + this.frames.length - 1,
      endSample,
      inferenceMs: performance.now() - t0,
    });
  }

  private detectNotes(): LiveNote[] {
    const nFrames = this.frames.length;
    if (nFrames < 20) return [];
    const settings = this.getSettings();
    // outputToNotesPoly may modify its inputs, so pass copies
    const notes: NoteEvent[] = addPitchBendsToNoteEvents(
      this.contours,
      outputToNotesPoly(
        this.frames.map(row => row.slice()),
        this.onsets.map(row => row.slice()),
        settings.onsetThreshold,
        settings.frameThreshold,
        settings.minNoteLengthFrames,
        true,
        null,
        null,
        settings.melodiaTrick,
        ENERGY_TOLERANCE,
      ),
    );
    return notes.map(note => {
      const end = note.startFrame + note.durationFrames;
      return {
        ...note,
        startFrame: this.historyStart + note.startFrame,
        // a note that is still on ends at the last frame (nFrames - 1)
        active: end >= nFrames - 3,
        final: end < nFrames - ENERGY_TOLERANCE - 2,
      };
    });
  }
}
