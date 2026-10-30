# Note detection and Playalong: findings and adjustments

This file covers the microphone note detection (`shared/notedetection/`), the score follower (`editor/playalong/`) and
note input from the microphone. None of these exist in MuseScore. All tests so far used synthesized audio, simulated
playing and Chrome's test melody (`?playalong-input=test-melody`). **Nothing has been tested with a real piano or
another real instrument yet.**

## Architecture

```
microphone ─► AudioInput (recorder worklet, main thread)
                │ MessagePort (raw audio at the context's sample rate)
                ▼
             worker.ts (Web Worker)
                StreamResampler → 22050 Hz
                ├─► LevelGate.push        (level per hop, noise floor)
                └─► LiveTranscriber       (basic-pitch model on the last 2 s, every ~100 ms)
                       notes of the last 2.5 s → de-duplicated → LevelGate.accepts → {type:'update'}
                │ postMessage
                ▼
             BasicPitchDetector (NoteDetector) ─► PlayalongController
                                                   ├─ playalong:  ChordGrouper → PlayalongFollower → measure highlight
                                                   └─ note input: ChordGrouper → enterMidiNotes (NotationMidiInput)
```

- The app only knows the `NoteDetector` interface (`notedetector.ts`): `start(onNote)`, `stop()`, `activePitches()`,
  `stats()`. `createNoteDetector` loads the implementation with a dynamic import, so basic-pitch can be replaced or
  removed in that one place.
- basic-pitch (Spotify, Apache-2.0) is vendored from `../basic-pitch-ts` into `shared/notedetection/basicpitch/`. Each
  file has its license header and a note on what was changed. The model is 900 KB and is served at `basic-pitch/` by
  `vite-plugin-basicpitch.ts`. TensorFlow.js makes the worker chunk ~1.8 MB, and it loads only on first use.

## Findings and adjustments

### Detection

| Finding | Adjustment |
|---|---|
| Running the model on the main thread made the score view and the detection slow each other down (dropped updates, growing latency). | The detection moved into a Web Worker. The audio worklet sends the audio straight to the worker over a `MessagePort`, and the main thread only receives notes. Measured in Chrome: ~30 ms per update, latency 0.1–0.2 s. |
| basic-pitch's "melodia trick" (adding notes without an onset) scans the whole history once per remaining note. With many sustained notes this became far too slow. | `melodiaTrick: false`. Playalong and note input only need onsets. |
| The default minimum note length (11 frames) delays every note. | `minNoteLengthFrames: 7`. |
| Every update decodes the last seconds again, so the same note came back repeatedly. | Notes are de-duplicated per pitch: starts at most `SAME_NOTE_FRAMES` (6) frames apart count as one note. Old starts are forgotten. |
| Note times must line up with the audio level measurement. | Hop alignment: `round(endSample/256 − 15.3 − (lastFrame − startFrame))`. The model's output ends 15 frames before the end of its 2 s window. |
| Keys pressed without sounding, a key's thump and room noise were reported as notes. The model rates pitch, not loudness. | `LevelGate` (`levelgate.ts`), see below. |
| The browser's own audio processing would normalize the level. | The input asks for unprocessed audio (no auto gain, noise suppression or echo cancellation). Chrome follows this on the MacBook microphone. |

### Level gate

- The level is measured per hop: 256 samples at 22050 Hz, one model frame.
- The **noise floor** is the quietest non-silent block (8 hops, ~93 ms) of the last ~60 s, so it adapts to the
  microphone and the room. Blocks of digital silence (before the microphone delivers) are ignored.
- A note is accepted when its mean level over hops `[start−2, start+8)` (~100 ms) is
  - at least `overFloorDb` (15 dB) above the noise floor, **and**
  - at least `minDb` (−60 dBFS).
- A 5 ms click has little energy over 100 ms, while a struck note sustains.
- **Finding:** with music playing from the start or without a pause (the test melody), the quietest block is music, and
  real notes were rejected. **Adjustment:** the floor is capped at `FLOOR_CAP_DB` = −50 dBFS, so a note never needs to
  be louder than −35 dBFS. After this, the test melody had 0 rejected notes.
- Tuning: raise `overFloorDb` in `DEFAULT_LEVEL_GATE` to filter more. `__museencorePlayalong.stats()` in the console
  shows `rejected` and `floorDb`.
- Tests: `test/levelgate.test.ts` (floor measurement, click and quiet-note rejection, louder rooms, music without a
  pause, initial digital silence).

### Score following (`follower.ts`)

The follower runs an online Viterbi alignment of the detected chords against the measures in played order. The order
comes from `playalongMeasures` (`repeatList(true)` unrolled), so it respects repeats, voltas, D.S./D.C., coda and fine.

| Requirement / finding | Adjustment |
|---|---|
| Imprecise playing, wrong notes | `chordSimilarity` gives partial credit: exact 1, octave 0.35, semitone 0.45, with coverage and precision factors. Each state allows skipped events (SKIP), extra notes (STAY with `INSERT_EMISSION`) and repeated chords (REPEAT). `EMISSION_FLOOR` 0.02 keeps one bad chord from being fatal. |
| Out-of-tune instruments | A global **tuning offset** is learned once 4 consecutive good matches agree on the same semitone shift, and is then applied to the input. |
| "Don't jump too early": the end of a bar must be played to a certain degree | Skipping the last events of a measure costs extra (`SKIP_MEASURE_END` −3.5 instead of −1.2). Switching the displayed measure needs a score margin (`SWITCH_MARGIN` 1.5, `JUMP_SWITCH_MARGIN` 3 for non-sequential moves). |
| Practice mode (repeat bars, go back, skip ahead): it jumped from bar 2 to bar 15 | Jumps are only considered inside a window around the current measure (`PRACTICE_BACK_MEASURES` 3 back, `AHEAD_MEASURES` 2 ahead). The window counts only measures with events and is anchored on the best state. Jumps cost `JUMP` −5 plus −1 per measure. Restarting the current measure costs −4. |
| Practice mode then stopped moving on (too careful) | The penalties and margins were loosened until the simulations followed both repeats and steady playing. |
| With many notes the detection queue fell out of sync and the follower got lost | **Time-based skipping**: the follower tracks the tempo (median seconds per tick of good matches). When notes are missed, it can skip ahead up to `MAX_TIME_SKIP` (64) events, guided by the elapsed time (`TIME_SKIP_MATCH`, `TIME_SKIP_DISCOUNT`), so bars that were missed entirely are discarded instead of dragging behind. When the follower is lost, the window ahead grows up to `MAX_AHEAD_MEASURES` (8). |
| Chords arrive as separate notes | `ChordGrouper` merges notes within 0.1 s and flushes after 150 ms. Notes that arrive out of order are dropped. |
| Several staves / parts | The followed parts are those of the selection (a piano part includes both staves). With no selection, all parts are followed. |

Tests: `test/playalong.test.ts` (follower behaviour, real-score measures) and `test/playalongsim.test.ts` (simulated
noise, wrong notes, tempo changes and every 5th bar lost, on Reunion, goldberg, Triumph and Unclaimed_Gift; asserts that
the follower never runs ahead).

### View

- The current measure is highlighted (`.playalong-measure`) and scrolled into view with `showRectInView`.
- In the continuous horizontal view the measure is never hidden behind the left panel (its width is accounted for). In
  practice mode the previous measure is also shown if there is room.
- The view turns one measure early (when the measure played next would be cut off), so the next measure is visible
  before it is reached. In the continuous views it only moves along their direction: the vertical position in the
  horizontal view (the horizontal one in the vertical view) stays where the user put it.
- The notes heard appear in the status bar ("Notes heard: …", `aria-live="off"` so screen readers aren't flooded). The
  delay is shown on hover.

### Note input from the microphone

- In note input mode the microphone button enters the chords played, like MIDI input. It uses `enterMidiNotes` →
  `NotationMidiInput.onNoteOns`, a port of MuseScore's note-on handling (`Score.addMidiPitch` / `noteVal` from
  edit.cpp) that goes through the undo stack.
- Note durations come from the input duration. The detector reports onsets only.
- The mode ends when note input ends.

## Known limitations / next steps

- **Untested with real instruments and real microphones.** Thresholds (level gate, similarity, penalties) are tuned on
  synthesized audio and simulations.
- Polyphonic piano with pedal: basic-pitch can report overtones and sympathetic notes. The follower tolerates them, but
  note input will write them into the score.
- The displayed bar doesn't advance on its own (by time) while nothing is heard.
- No Web MIDI input. A MIDI keyboard would be an exact `NoteDetector` and could reuse the whole pipeline.
- Debugging: `window.__museencorePlayalong` exposes `{stats, state, tempo}`.
