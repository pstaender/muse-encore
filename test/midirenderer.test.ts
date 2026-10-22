// SPDX-License-Identifier: GPL-3.0-only
// MIDI rendering (CompatMidiRender): the tests of MuseScore/src/engraving/tests/midi/midirenderer_tests.cpp and
// midirenderer_bend_tests.cpp with their test scores (same expected events as in C++)
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, test } from 'vitest'
import { layoutScore, loadScore } from '../src/index'
import { CompatMidiRender } from '../src/engraving/compat/midi/compatmidirender'
import { Context } from '../src/engraving/compat/midi/compatmidirenderinternal'
import { EventsHolder, NPlayEvent } from '../src/engraving/compat/midi/event'
import { CTRL_BREATH, ME_CONTROLLER, ME_NOTEON, PitchWheelSpecs } from '../src/engraving/compat/midi/midicoreevent'
import { MidiInstrumentEffect } from '../src/engraving/compat/midi/midiinstrumenteffects'
import { PitchWheelRenderer } from '../src/engraving/compat/midi/pitchwheelrenderer'
import { NoteEvent } from '../src/engraving/dom/noteevent'
import { ROOT, hasSubmodule, initFonts } from './helpers'

const MIDI_TESTS_DIR = `${ROOT}MuseScore/src/engraving/tests/midi/`
const DEFAULT_CHANNEL = 0
const NOTE_OFF_VOLUME = 0

function checkEventInterval(events: EventsHolder, tickStart: number, tickEnd: number, pitch: number, volume: number,
                            effect = MidiInstrumentEffect.NONE, channel = DEFAULT_CHANNEL): void {
    let it = events.at(channel).find(tickStart)
    expect(it, `event at ${tickStart}`).not.toBeNull()
    if (!it) {
        return
    }

    expect([tickStart, it.event.pitch(), it.event.velo(), it.event.channel(), it.event.effect()])
        .toEqual([tickStart, pitch, volume, channel, effect])

    events.at(channel).erase(it)

    it = events.at(channel).find(tickEnd)
    expect(it, `event at ${tickEnd}`).not.toBeNull()
    if (!it) {
        return
    }

    expect([tickEnd, it.event.pitch(), it.event.velo(), it.event.channel(), it.event.effect()])
        .toEqual([tickEnd, pitch, NOTE_OFF_VOLUME, channel, effect])

    events.at(channel).erase(it)
}

function checkPitchBend(events: EventsHolder, tick: number, pitchValue: number, effect = MidiInstrumentEffect.NONE,
                        channel = DEFAULT_CHANNEL): void {
    const it = events.at(channel).find(tick)
    expect(it, `pitch bend at ${tick}`).not.toBeNull()
    if (!it) {
        return
    }

    const dataA = pitchValue % 128
    const dataB = Math.trunc(pitchValue / 128)
    expect([tick, it.event.dataA(), it.event.dataB(), it.event.channel(), it.event.effect()])
        .toEqual([tick, dataA, dataB, channel, effect])

    events.at(channel).erase(it)
}

function checkPitchBendInterval(events: EventsHolder, startTick: number, endTick: number, step: number, pitchValue: number,
                                effect = MidiInstrumentEffect.NONE, channel = DEFAULT_CHANNEL): void {
    for (let tick = startTick; tick <= endTick; tick += step) {
        checkPitchBend(events, tick, pitchValue, effect, channel)
    }
}

function expectNoteEvent(entry: { event: NPlayEvent } | null, pitch: number, volume: number, channel: number): void {
    expect(entry).not.toBeNull()
    expect(entry!.event.equals(new NPlayEvent(ME_NOTEON, channel, pitch, volume))).toBe(true)
}

function readScore(path: string): ReturnType<typeof loadScore> {
    const score = loadScore(readFileSync(MIDI_TESTS_DIR + path))
    layoutScore(score)
    score.setPlaylistDirty()
    return score
}

function renderEvents(dir: string, fileName: string, eachStringHasChannel = false, instrumentsHaveEffects = false): EventsHolder {
    const score = readScore(dir + fileName)
    const events = new EventsHolder()
    const ctx = new Context()

    ctx.eachStringHasChannel = eachStringHasChannel
    ctx.instrumentsHaveEffects = instrumentsHaveEffects
    CompatMidiRender.renderScore(score, events, ctx, true)

    return events
}

function renderMidiEventsWithPause(fileName: string, ctx: Context): EventsHolder {
    const score = readScore('midirenderer_data/' + fileName)
    const events = new EventsHolder()
    ctx.applyCaesuras = true

    CompatMidiRender.renderScore(score, events, ctx, true)

    return events
}

function filterEvents(events: EventsHolder, type: number): EventsHolder {
    const filteredEventMap = new EventsHolder()
    for (let i = 0; i < events.size(); ++i) {
        for (const [tick, ev] of events.at(i)) {
            if (ev.type() !== type) {
                continue
            }
            filteredEventMap.at(i).insert(tick, ev)
        }
    }

    return filteredEventMap
}

const getNoteOnEvents = (events: EventsHolder): EventsHolder => filterEvents(events, ME_NOTEON)
const getControllerEvents = (events: EventsHolder): EventsHolder => filterEvents(events, ME_CONTROLLER)

beforeAll(async () => {
    await initFonts()
})

describe('PitchWheelRenderer / EventsHolder', () => {
    test('mergePitchWheelEvents', () => {
        const wheelSpec = new PitchWheelSpecs()
        const render = new PitchWheelRenderer(wheelSpec)

        //! y = ax + b
        const a = 1
        const b = 0
        const startTick = 0
        const linearFunc = (tick: number): number => Math.trunc(Math.fround(a * Math.fround(tick - startTick) + b))
        render.addPitchWheelFunction({ mStartTick: 0, mEndTick: 100, func: linearFunc }, 0, 0, MidiInstrumentEffect.NONE)

        const pitchWheelEvents = render.renderPitchWheel()
        const noteEvents = new EventsHolder()
        noteEvents.at(DEFAULT_CHANNEL).insert(0, new NPlayEvent(144, 0, 59, 96))
        noteEvents.at(DEFAULT_CHANNEL).insert(90, new NPlayEvent(144, 0, 59, 0))
        noteEvents.at(DEFAULT_CHANNEL).insert(200, new NPlayEvent(144, 0, 61, 96))
        noteEvents.at(DEFAULT_CHANNEL).insert(300, new NPlayEvent(144, 0, 61, 0))
        noteEvents.mergePitchWheelEvents(pitchWheelEvents)
        expect(noteEvents.at(DEFAULT_CHANNEL).find(190)).not.toBeNull()
    })

    test('subscriptOperator', () => {
        const events = new EventsHolder()
        events.at(0)
        expect(events.size()).toBe(1)
        events.at(1)
        expect(events.size()).toBe(2)
        events.at(3)
        expect(events.size()).toBe(4)
        events.at(50)
        expect(events.size()).toBe(51)
        const events2 = new EventsHolder()
        events2.at(10)
        expect(events2.size()).toBe(11)
        events2.at(192)
        expect(events2.size()).toBe(193)
    })
})

describe.skipIf(!hasSubmodule)('MidiRenderer', () => {
    const renderMidiEvents = (f: string, eachStringHasChannel = false, instrumentsHaveEffects = false): EventsHolder =>
        renderEvents('midirenderer_data/', f, eachStringHasChannel, instrumentsHaveEffects)
    void CTRL_BREATH
    void NoteEvent

    test('oneGuitarNote', async () => {
        const defVol = Math.trunc(96) // f

        const events = renderMidiEvents('one_guitar_note.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)

        checkEventInterval(events, 0, 479, 59, defVol)
    })

    test('onePercussionNote', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('one_percussion_note.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)

        expectNoteEvent(events.at(DEFAULT_CHANNEL).find(0), 41, defVol, DEFAULT_CHANNEL)
    })

    test('graceBeforeBeat', async () => {
        const defVol = Math.trunc(96) // f

        const events = renderMidiEvents('grace_before_beat.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(6)

        checkEventInterval(events, 0, 239, 59, defVol)
        checkEventInterval(events, 240, 479, 55, defVol)
        checkEventInterval(events, 480, 959, 57, defVol)
    })

    test('graceOnBeat', async () => {
        const defVol = Math.trunc(96) // f

        const events = renderMidiEvents('grace_on_beat.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(6)

        checkEventInterval(events, 0, 479, 59, defVol)
        checkEventInterval(events, 480, 719, 55, defVol)
        checkEventInterval(events, 720, 959, 57, defVol)
    })

    test('graceAfter', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('grace_after.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)

        checkEventInterval(events, 0, 239, 60, defVol)
        checkEventInterval(events, 240, 479, 62, defVol)
    })

    test('graceBeforeBeatGroup', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('grace_before_beat_group.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 0, 359, 60, defVol)
        checkEventInterval(events, 360, 419, 62, defVol)
        checkEventInterval(events, 420, 479, 63, defVol)
        checkEventInterval(events, 480, 959, 64, defVol)
    })

    test('graceOnBeatGroup', async () => {
        const defVol = Math.trunc(80) // f

        const events = renderMidiEvents('grace_on_beat_group.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 0, 479, 60, defVol)
        checkEventInterval(events, 480, 539, 62, defVol)
        checkEventInterval(events, 540, 599, 63, defVol)
        checkEventInterval(events, 600, 959, 64, defVol)
    })

    test('graceOnBeatAndGlissando', async () => {
        const defVol = Math.trunc(80) // f

        const events = renderMidiEvents('grace_on_beat_and_glissando.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(14)

        checkEventInterval(events, 960, 1199, 64, defVol)
        checkEventInterval(events, 1200, 1359, 60, defVol)
        checkEventInterval(events, 1360, 1378, 61, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1380, 1398, 62, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1400, 1418, 63, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1419, 1437, 64, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1440, 1919, 65, defVol)
    })

    test('graceBeforeBeatShortNote', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('grace_before_beat_short_note.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 0, 1799, 63, defVol)
        checkEventInterval(events, 1800, 1859, 58, defVol)
        checkEventInterval(events, 1860, 1919, 67, defVol)
        checkEventInterval(events, 1920, 2399, 69, defVol)
    })

    test('ghostNote', async () => {
        const defVol = Math.trunc(96) // f
        const ghostVol = Math.trunc(defVol * NoteEvent.GHOST_VELOCITY_MULTIPLIER)

        const events = renderMidiEvents('ghost_note.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)

        checkEventInterval(events, 0, 479, 59, defVol)
        checkEventInterval(events, 480, 959, 57, ghostVol)
    })

    test('simpleTremolo', async () => {
        const defVol = Math.trunc(96) // f

        const events = renderMidiEvents('simple_tremolo.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 0, 239, 59, defVol)
        checkEventInterval(events, 240, 479, 59, defVol)
        checkEventInterval(events, 480, 719, 59, defVol)
        checkEventInterval(events, 720, 959, 59, defVol)
    })

    test('legatoGlissando', async () => {
        const defVol = Math.trunc(96) // forte

        const events = getNoteOnEvents(renderMidiEvents('simple_glissando_legato.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 642, 59, defVol)
        checkEventInterval(events, 643, 747, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 748, 852, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 854, 958, 56, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 960, 1439, 55, defVol, MidiInstrumentEffect.SLIDE)
    })

    test('invalidGlissando', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('invalid_glissando.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)

        /// glissando is not played because of different start/end note strings
        checkEventInterval(events, 480, 959, 60, defVol)
        checkEventInterval(events, 960, 1439, 57, defVol)
    })

    test('sameStringNoEffects', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('channels.mscx', false, false))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(6)

        checkEventInterval(events, 0, 959, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 1439, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 960, 1919, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
    })

    test('sameStringWithEffects', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('channels.mscx', false, true))

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(2)

        checkEventInterval(events, 0, 959, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 1439, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 960, 1919, 60, defVol, MidiInstrumentEffect.PALM_MUTE, DEFAULT_CHANNEL + 1)
    })

    test('diffStringNoEffects', async () => {
        const defVol = Math.trunc(80) // mf

        const midievents = renderMidiEvents('channels.mscx', true, false)
        const events = getNoteOnEvents(midievents)

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(2)

        checkEventInterval(events, 0, 959, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 1439, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 960, 1919, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
    })

    test('diffStringWithEffects', async () => {
        const defVol = Math.trunc(80) // mf

        const midiEvents = renderMidiEvents('channels.mscx', true, true)
        const events = getNoteOnEvents(midiEvents)

        expect(events.size()).toBe(3)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 2).size()).toBe(2)

        checkEventInterval(events, 0, 959, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 1439, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 960, 1919, 60, defVol, MidiInstrumentEffect.PALM_MUTE, DEFAULT_CHANNEL + 2)
    })

    test('tremoloAndGlissando', async () => {
        const defVol = Math.trunc(96) // f

        const events = getNoteOnEvents(renderMidiEvents('tremolo_and_glissando.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(14)

        checkEventInterval(events, 0, 239, 59, defVol)
        checkEventInterval(events, 240, 479, 59, defVol)
        checkEventInterval(events, 480, 642, 59, defVol)
        checkEventInterval(events, 643, 747, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 748, 852, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 854, 958, 56, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 960, 1439, 55, defVol, MidiInstrumentEffect.SLIDE)
    })

    test('slideInFromBelow', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_in_from_below.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 419, 60, defVol)
        checkEventInterval(events, 420, 438, 60, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 440, 458, 61, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 460, 478, 62, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 959, 63, defVol)
    })

    test('slideInFromAbove', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_in_from_above.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 419, 60, defVol)
        checkEventInterval(events, 420, 438, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 440, 458, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 460, 478, 64, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 959, 63, defVol)
    })

    test('slideOutFromAbove', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_out_from_above.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 419, 60, defVol)
        checkEventInterval(events, 420, 438, 59, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 439, 457, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 459, 477, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 959, 60, defVol)
    })

    test('slideOutFromBelow', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_out_from_below.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 419, 60, defVol)
        checkEventInterval(events, 420, 438, 61, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 439, 457, 62, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 459, 477, 63, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 959, 60, defVol)
    })

    test('tremoloSlideIn', async () => {
        const defVol = Math.trunc(96) // f

        const events = getNoteOnEvents(renderMidiEvents('tremolo_and_slide_in.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(14)

        checkEventInterval(events, 0, 298, 59, defVol)
        checkEventInterval(events, 299, 597, 59, defVol)
        checkEventInterval(events, 599, 897, 59, defVol)
        checkEventInterval(events, 901, 919, 56, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 921, 939, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 940, 958, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 960, 1439, 59, defVol)
    })

    test('tremoloSlideOut', async () => {
        const defVol = Math.trunc(96) // f

        const events = getNoteOnEvents(renderMidiEvents('tremolo_and_slide_out.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(20)

        checkEventInterval(events, 0, 263, 59, defVol)
        checkEventInterval(events, 264, 527, 59, defVol)
        checkEventInterval(events, 529, 792, 59, defVol)
        checkEventInterval(events, 794, 1057, 59, defVol)
        checkEventInterval(events, 1059, 1322, 59, defVol)
        checkEventInterval(events, 1324, 1587, 59, defVol)
        checkEventInterval(events, 1589, 1852, 59, defVol)
        checkEventInterval(events, 1860, 1878, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1879, 1897, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1898, 1916, 56, defVol, MidiInstrumentEffect.SLIDE)
    })

    test('slideInAndOut', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_in_and_out.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(14)

        checkEventInterval(events, 420, 438, 64, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 440, 458, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 460, 478, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 899, 67, defVol)
        checkEventInterval(events, 900, 918, 68, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 919, 937, 69, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 939, 957, 70, defVol, MidiInstrumentEffect.SLIDE)
    })

    test('sameStringDifferentStaves', async () => {
        const defVol = Math.trunc(80) // mf

        const midiEvents = renderMidiEvents('same_string_diff_staves.mscx', true)
        const events = getNoteOnEvents(midiEvents)

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(2)

        checkEventInterval(events, 0, 239, 62, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 240, 479, 62, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 0, 1919, 35, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
    })

    test('trillOnHiddenStaff', async () => {
        const mfVol = Math.trunc(80)
        const fVol = Math.trunc(96)

        const midiEvents = renderMidiEvents('trill_on_hidden_staff.mscx')
        const events = getNoteOnEvents(midiEvents)

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(16)

        checkEventInterval(events, 0, 1919, 60, mfVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 1920, 1979, 79, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 1980, 2039, 81, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2040, 2099, 79, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2100, 2159, 81, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2160, 2219, 79, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2220, 2279, 81, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2280, 2339, 79, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 2340, 2399, 81, fVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
    })

    test('letRingRepeat', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('let_ring_repeat.mscx', true, false))

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(4)

        checkEventInterval(events, 1920, 3840, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 2880, 3840, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 5760, 7680, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 6720, 7680, 64, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
    })

    test('letRingLong', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('letring_long.mscx', true, true))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)

        checkEventInterval(events, 0, 7680, 69, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
    })

    test('slideInLetRing', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_in_letring.mscx', true, true))

        expect(events.size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(6)
        expect(events.at(DEFAULT_CHANNEL + 2).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 3).size()).toBe(2)

        checkEventInterval(events, 420, 438, 72, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 440, 458, 71, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 460, 478, 70, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 480, 1920, 69, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 960, 1920, 67, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 2)
        checkEventInterval(events, 1440, 1920, 62, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 3)
    })

    test('slideOutLetRing', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_out_letring.mscx', true, true))

        expect(events.size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(6)
        expect(events.at(DEFAULT_CHANNEL + 2).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 3).size()).toBe(2)

        checkEventInterval(events, 0, 419, 69, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 420, 438, 68, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 439, 457, 67, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 459, 477, 66, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 480, 1440, 52, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 2)
        checkEventInterval(events, 960, 1440, 50, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 3)
    })

    test('glissandoLetRing', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('glissando_letring.mscx', true, true))

        expect(events.size()).toBe(3)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(6)
        expect(events.at(DEFAULT_CHANNEL + 2).size()).toBe(2)

        checkEventInterval(events, 0, 320, 69, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 321, 399, 68, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 400, 478, 67, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 480, 1440, 66, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 960, 1440, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 2)
    })

    test('slideToTiedNote', async () => {
        const defVol = Math.trunc(96) // f

        const events = getNoteOnEvents(renderMidiEvents('slide_to_tied_note.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 420, 438, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 440, 458, 67, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 460, 478, 68, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 1919, 69, defVol)
    })

    test('twoSlides', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('two_slides.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(16)

        checkEventInterval(events, 1860, 1878, 56, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1880, 1898, 57, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1900, 1918, 58, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1920, 2339, 59, defVol)
        checkEventInterval(events, 2340, 2358, 60, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 2360, 2378, 61, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 2380, 2398, 62, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 2400, 2879, 63, defVol)
    })

    test('reducedSlides', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('reduced_slides.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(42)

        /// fret 0: no slides
        checkEventInterval(events, 0, 959, 60, defVol)
        checkEventInterval(events, 960, 1919, 64, defVol)

        /// fret 1: no slides
        checkEventInterval(events, 1920, 2879, 60, defVol)
        checkEventInterval(events, 2880, 3839, 65, defVol)

        /// fret 2: 1 slide
        checkEventInterval(events, 3840, 4739, 60, defVol)
        checkEventInterval(events, 4741, 4799, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 4800, 5759, 66, defVol)

        /// fret 3: 2 slides
        checkEventInterval(events, 5760, 6659, 60, defVol)
        checkEventInterval(events, 6661, 6689, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 6691, 6719, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 6720, 7679, 67, defVol)

        /// fret 4 (or more): 3 slides
        checkEventInterval(events, 7680, 8579, 60, defVol)
        checkEventInterval(events, 8581, 8599, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 8600, 8618, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 8619, 8637, 67, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 8640, 9599, 68, defVol)

        /// fret 0 (but slide in from above) : 3 slides
        checkEventInterval(events, 9600, 10499, 60, defVol)
        checkEventInterval(events, 10501, 10519, 67, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 10520, 10538, 66, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 10539, 10557, 65, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 10560, 11519, 64, defVol)
    })

    test('shortNoteBeforeSlide', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('short_note_before_slide.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(20)

        /// 32th note before slide
        checkEventInterval(events, 0, 29, 62, defVol)
        checkEventInterval(events, 31, 39, 72, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 40, 48, 71, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 50, 58, 70, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 60, 539, 69, defVol)

        /// 64th note before slide
        checkEventInterval(events, 1920, 1934, 62, defVol)
        checkEventInterval(events, 1936, 1939, 72, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1940, 1943, 71, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1945, 1948, 70, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1950, 2429, 69, defVol)
    })

    test('shortNoteWithSlide', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('short_note_with_slide.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(16)

        /// 32th note with slide
        checkEventInterval(events, 0, 29, 69, defVol)
        checkEventInterval(events, 30, 38, 68, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 39, 47, 67, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 49, 57, 66, defVol, MidiInstrumentEffect.SLIDE)

        /// 64th note with slide
        checkEventInterval(events, 1920, 1934, 69, defVol)
        checkEventInterval(events, 1935, 1938, 68, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1939, 1942, 67, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 1944, 1947, 66, defVol, MidiInstrumentEffect.SLIDE)
    })

    test('slideInAfterRest', async () => {
        const defVol = Math.trunc(80) // mf

        const events = getNoteOnEvents(renderMidiEvents('slide_in_after_rest.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 420, 438, 60, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 440, 458, 61, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 460, 478, 62, defVol, MidiInstrumentEffect.SLIDE)
        checkEventInterval(events, 480, 959, 63, defVol)
    })

    test('breathController', async () => {
        const events = getControllerEvents(renderMidiEvents('breath_controller.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(111)

        let prevBreathControllerVal = -1

        for (const ev of events.at(DEFAULT_CHANNEL).entries()) {
            expect(ev.event.dataA()).toBe(CTRL_BREATH)
            let breathControllerVal = ev.event.dataB()
            expect(breathControllerVal > prevBreathControllerVal).toBe(true)
            prevBreathControllerVal = breathControllerVal
        }
    })

    test('caesura', async () => {
        const defVol = Math.trunc(80) // mf
        const context = new Context()

        const events = getNoteOnEvents(renderMidiEventsWithPause('caesura.mscx', context))
        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)

        // caesuras check
        expect(CompatMidiRender.tick(context, 0)).toBe(0)
        expect(CompatMidiRender.tick(context, 911)).toBe(911)
        expect(CompatMidiRender.tick(context, 960)).toBe(2880)
        expect(CompatMidiRender.tick(context, 1871)).toBe(3791)

        checkEventInterval(events, 0, 911, 64, defVol)
        checkEventInterval(events, 960, 1871, 67, defVol)
    })

    test('hairpinSimple', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_simple.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)

        checkEventInterval(events, 0, 479, 59, 49)
        checkEventInterval(events, 480, 959, 60, 64)
        checkEventInterval(events, 960, 1439, 62, 80)
        checkEventInterval(events, 1440, 1919, 64, 96)
    })

    test('hairpinStartDynamicAway', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_start_dynamic_away.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(12)

        checkEventInterval(events, 0, 479, 60, 112)
        checkEventInterval(events, 480, 959, 59, 112)
        checkEventInterval(events, 960, 1439, 55, 112)
        checkEventInterval(events, 1440, 1919, 52, 91)
        checkEventInterval(events, 1920, 2399, 50, 70)
        checkEventInterval(events, 2400, 2879, 48, 49)
    })

    test('hairpinEndDynamicAway', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_end_dynamic_away.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(10)

        checkEventInterval(events, 0, 479, 60, 112)
        checkEventInterval(events, 480, 959, 59, 104)
        checkEventInterval(events, 960, 1439, 55, 96)
        checkEventInterval(events, 1440, 1919, 52, 96)
        checkEventInterval(events, 1920, 2399, 48, 49)
    })

    test('hairpinDynamicJump', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_dynamic_jump.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(20)

        checkEventInterval(events, 0, 479, 55, 96)
        checkEventInterval(events, 480, 959, 57, 100)
        checkEventInterval(events, 960, 1439, 60, 104)
        checkEventInterval(events, 1440, 1919, 62, 108)
        checkEventInterval(events, 1920, 3839, 60, 80)
        checkEventInterval(events, 3840, 4319, 55, 96)
        checkEventInterval(events, 4320, 4799, 57, 92)
        checkEventInterval(events, 4800, 5279, 60, 88)
        checkEventInterval(events, 5280, 5759, 62, 84)
        checkEventInterval(events, 5760, 7679, 60, 112)
    })

    test('hairpinDynamicInside', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_dynamic_inside.mscx'))

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(14)

        checkEventInterval(events, 0, 479, 60, 80)
        checkEventInterval(events, 480, 959, 62, 85)
        checkEventInterval(events, 960, 1439, 64, 90)
        checkEventInterval(events, 1440, 1919, 65, 49)
        checkEventInterval(events, 1920, 2399, 67, 49)
        checkEventInterval(events, 2400, 2879, 69, 96)
        checkEventInterval(events, 2880, 3359, 71, 96)
    })

    test('hairpinTwoInstruments', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hairpin_two_instruments.mscx'))

        expect(events.size()).toBe(2)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(8)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(8)

        checkEventInterval(events, 0, 479, 60, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 959, 64, 84, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 960, 1439, 67, 88, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 1440, 1919, 72, 92, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)

        checkEventInterval(events, 0, 479, 55, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 480, 959, 55, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 960, 1439, 55, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 1440, 1919, 55, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
    })

    test('hammerOnPullOff', async () => {
        const events = getNoteOnEvents(renderMidiEvents('hammer_on_pull_off.mscx', false, true))

        expect(events.size()).toBe(2)

        expect(events.at(DEFAULT_CHANNEL).size()).toBe(4)
        expect(events.at(DEFAULT_CHANNEL + 1).size()).toBe(8)

        checkEventInterval(events, 0, 479, 52, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 480, 959, 53, 80, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)

        checkEventInterval(events, 960, 1199, 52, 80, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL)
        checkEventInterval(events, 1200, 1439, 53, 80, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 1440, 1679, 55, 80, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 1680, 1919, 53, 80, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
    })

    test('vibrato', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)
        const events = renderMidiEvents('vibrato.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(DEFAULT_CHANNEL).size()).toBe(68)

        // smallest vibrato
        checkEventInterval(events, 0, 239, 52, defVol)
        checkPitchBend(events,    0, 8192)
        checkPitchBend(events,   10, 8226)
        checkPitchBend(events,   20, 8260)
        checkPitchBend(events,   30, 8294)
        checkPitchBend(events,   40, 8328)
        checkPitchBend(events,   50, 8294)
        checkPitchBend(events,   60, 8260)
        checkPitchBend(events,   70, 8226)
        checkPitchBend(events,   80, 8192)
        checkPitchBend(events,   90, 8158)
        checkPitchBend(events,  100, 8124)
        checkPitchBend(events,  110, 8090)
        checkPitchBend(events,  120, 8056)
        checkPitchBend(events,  130, 8090)
        checkPitchBend(events,  140, 8124)
        checkPitchBend(events,  150, 8158)

        // average vibrato
        checkPitchBend(events, 470, pwReset)
        checkEventInterval(events, 480, 719, 52, defVol)
        checkPitchBend(events,  480, 8192)
        checkPitchBend(events,  490, 8248)
        checkPitchBend(events,  500, 8305)
        checkPitchBend(events,  510, 8362)
        checkPitchBend(events,  520, 8419)
        checkPitchBend(events,  530, 8453)
        checkPitchBend(events,  540, 8396)
        checkPitchBend(events,  550, 8339)
        checkPitchBend(events,  560, 8283)
        checkPitchBend(events,  570, 8226)
        checkPitchBend(events,  580, 8170)
        checkPitchBend(events,  590, 8113)
        checkPitchBend(events,  600, 8056)
        checkPitchBend(events,  610, 7999)
        checkPitchBend(events,  620, 7942)
        checkPitchBend(events,  630, 7954)
        checkPitchBend(events,  640, 8010)
        checkPitchBend(events,  650, 8067)
        checkPitchBend(events,  660, 8124)
        checkPitchBend(events,  670, 8181)

        // wide vibrato
        checkPitchBend(events, 950, pwReset)
        checkEventInterval(events, 960, 1439, 52, defVol)
        checkPitchBend(events,  960, 8029)
        checkPitchBend(events,  970, 8083)
        checkPitchBend(events,  980, 8138)
        checkPitchBend(events,  990, 8192)
        checkPitchBend(events, 1000, 8246)
        checkPitchBend(events, 1010, 8301)
        checkPitchBend(events, 1020, 8355)
        checkPitchBend(events, 1030, 8301)
        checkPitchBend(events, 1040, 8246)
        checkPitchBend(events, 1050, 8192)
        checkPitchBend(events, 1060, 8138)
        checkPitchBend(events, 1070, 8083)
        checkPitchBend(events, 1080, 8029)
        checkPitchBend(events, 1090, 7974)
        checkPitchBend(events, 1100, 7919)
        checkPitchBend(events, 1110, 7865)
        checkPitchBend(events, 1120, 7810)
        checkPitchBend(events, 1130, 7756)
        checkPitchBend(events, 1140, 7701)
        checkPitchBend(events, 1150, 7756)
        checkPitchBend(events, 1160, 7810)
        checkPitchBend(events, 1170, 7865)
        checkPitchBend(events, 1180, 7919)
        checkPitchBend(events, 1190, 7974)

        expect(events.at(DEFAULT_CHANNEL).empty()).toBe(true)
    })
})

describe.skipIf(!hasSubmodule)('MidiRendererBend', () => {
    const renderMidiEvents = (f: string, eachStringHasChannel = false, instrumentsHaveEffects = false): EventsHolder =>
        renderEvents('midirenderer_bend_data/', f, eachStringHasChannel, instrumentsHaveEffects)

    test('simple', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('simple.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(79)

        /// bend with startFactor 0, endFactor 1
        checkEventInterval(events, 0, 239, 52, defVol)
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8201)
        checkPitchBend(events, 20, 8229)
        checkPitchBend(events, 30, 8277)
        checkPitchBend(events, 40, 8343)
        checkPitchBend(events, 50, 8429)
        checkPitchBend(events, 60, 8533)
        checkPitchBend(events, 70, 8656)
        checkPitchBend(events, 80, 8798)
        checkPitchBend(events, 90, 8960)
        checkPitchBend(events, 100, 9140)
        checkPitchBend(events, 110, 9339)

        checkPitchBendInterval(events, 120, 230, 10, 9557)

        /// bend with startFactor 0.25, endFactor 0.75
        checkPitchBend(events, 470, pwReset)
        checkEventInterval(events, 480, 719, 52, defVol)
        checkPitchBend(events, 510, 8192)
        checkPitchBend(events, 520, 8229)
        checkPitchBend(events, 530, 8343)
        checkPitchBend(events, 540, 8533)
        checkPitchBend(events, 550, 8798)
        checkPitchBend(events, 560, 9140)

        checkPitchBendInterval(events, 570, 710, 10, 9557)

        /// bend with 2+1/4 tones
        checkPitchBend(events, 950, pwReset)
        checkEventInterval(events, 960, 1199, 52, defVol)
        checkPitchBend(events, 960, 8192)
        checkPitchBend(events, 970, 8213)
        checkPitchBend(events, 980, 8277)
        checkPitchBend(events, 990, 8384)
        checkPitchBend(events, 1000, 8533)
        checkPitchBend(events, 1010, 8725)
        checkPitchBend(events, 1020, 8960)
        checkPitchBend(events, 1030, 9237)
        checkPitchBend(events, 1040, 9557)
        checkPitchBend(events, 1050, 9920)
        checkPitchBend(events, 1060, 10325)
        checkPitchBend(events, 1070, 10773)
        checkPitchBendInterval(events, 1080, 1190, 10, 11264)

        expect(events.at(0).size()).toBe(2)
    })

    test('combined', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('combined.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(131)

        /// bend+bend
        checkEventInterval(events, 0, 479, 52, defVol)
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8201)
        checkPitchBend(events, 20, 8229)
        checkPitchBend(events, 30, 8277)
        checkPitchBend(events, 40, 8343)
        checkPitchBend(events, 50, 8429)
        checkPitchBend(events, 60, 8533)
        checkPitchBend(events, 70, 8656)
        checkPitchBend(events, 80, 8798)
        checkPitchBend(events, 90, 8960)
        checkPitchBend(events, 100, 9140)
        checkPitchBend(events, 110, 9339)
        checkPitchBend(events, 120, 9557); /// 1 tone up
        checkPitchBend(events, 130, 9566)
        checkPitchBend(events, 140, 9595)
        checkPitchBend(events, 150, 9642)
        checkPitchBend(events, 160, 9709)
        checkPitchBend(events, 170, 9794)
        checkPitchBend(events, 180, 9898)
        checkPitchBend(events, 190, 10021)
        checkPitchBend(events, 200, 10164)
        checkPitchBend(events, 210, 10325)
        checkPitchBend(events, 220, 10505)
        checkPitchBend(events, 230, 10704)
        checkPitchBendInterval(events, 240, 470, 10, 10922); /// 2 tones up

        /// bend+release
        checkPitchBend(events, 710, pwReset)
        checkEventInterval(events, 720, 1199, 52, defVol)
        checkPitchBend(events, 750, 8192)
        checkPitchBend(events, 760, 8258)
        checkPitchBend(events, 770, 8457)
        checkPitchBend(events, 780, 8789)
        checkPitchBend(events, 790, 9253)
        checkPitchBend(events, 800, 9851)
        checkPitchBendInterval(events, 810, 840, 10, 10581)
        checkPitchBend(events, 850, 10576)
        checkPitchBend(events, 860, 10562)
        checkPitchBend(events, 870, 10538)
        checkPitchBend(events, 880, 10505)
        checkPitchBend(events, 890, 10462)
        checkPitchBend(events, 900, 10410)
        checkPitchBend(events, 910, 10349)
        checkPitchBend(events, 920, 10277)
        checkPitchBend(events, 930, 10197)
        checkPitchBend(events, 940, 10107)
        checkPitchBend(events, 950, 10007)
        checkPitchBendInterval(events, 960, 1190, 10, 9898)

        /// bend+note
        checkPitchBend(events, 1430, pwReset)
        checkEventInterval(events, 1440, 1679, 52, defVol)
        checkPitchBend(events, 1440, 8192)
        checkPitchBend(events, 1450, 8201)
        checkPitchBend(events, 1460, 8229)
        checkPitchBend(events, 1470, 8277)
        checkPitchBend(events, 1480, 8343)
        checkPitchBend(events, 1490, 8429)
        checkPitchBend(events, 1500, 8533)
        checkPitchBend(events, 1510, 8656)
        checkPitchBend(events, 1520, 8798)
        checkPitchBend(events, 1530, 8960)
        checkPitchBend(events, 1540, 9140)
        checkPitchBend(events, 1550, 9339)
        checkPitchBendInterval(events, 1560, 1670, 10, 9557)

        checkPitchBend(events, 1675, pwReset)
        checkEventInterval(events, 1680, 1919, 52, defVol)

        expect(events.at(0).size()).toBe(3)
    })

    test('tied', async () => {
        const defVol = Math.trunc(80) // mf
        const events = renderMidiEvents('tied.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(75)

        checkEventInterval(events, 0, 1919, 52, defVol)
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8196)
        checkPitchBend(events, 20, 8210)
        checkPitchBend(events, 30, 8234)
        checkPitchBend(events, 40, 8267)
        checkPitchBend(events, 50, 8310)
        checkPitchBend(events, 60, 8362)
        checkPitchBend(events, 70, 8424)
        checkPitchBend(events, 80, 8495)
        checkPitchBend(events, 90, 8576)

        checkPitchBend(events, 100, 8666)
        checkPitchBend(events, 110, 8765)
        checkPitchBend(events, 120, 8874)
        checkPitchBend(events, 130, 8993)
        checkPitchBend(events, 140, 9121)
        checkPitchBend(events, 150, 9258)
        checkPitchBend(events, 160, 9405)
        checkPitchBend(events, 170, 9562)
        checkPitchBend(events, 180, 9728)
        checkPitchBend(events, 190, 9903)

        checkPitchBend(events, 200, 10088)
        checkPitchBend(events, 210, 10282)
        checkPitchBend(events, 220, 10486)
        checkPitchBend(events, 230, 10699)
        checkPitchBendInterval(events, 240, 470, 10, 10922)

        checkPitchBend(events, 480, 10922)
        checkPitchBend(events, 490, 10917)
        checkPitchBend(events, 500, 10903)
        checkPitchBend(events, 510, 10880)
        checkPitchBend(events, 520, 10846)
        checkPitchBend(events, 530, 10804)
        checkPitchBend(events, 540, 10752)
        checkPitchBend(events, 550, 10690)
        checkPitchBend(events, 560, 10619)
        checkPitchBend(events, 570, 10538)
        checkPitchBend(events, 580, 10448)
        checkPitchBend(events, 590, 10349)

        checkPitchBend(events, 600, 10240)
        checkPitchBend(events, 610, 10121)
        checkPitchBend(events, 620, 9993)
        checkPitchBend(events, 630, 9856)
        checkPitchBend(events, 640, 9709)
        checkPitchBend(events, 650, 9552)
        checkPitchBend(events, 660, 9386)
        checkPitchBend(events, 670, 9211)
        checkPitchBend(events, 680, 9026)
        checkPitchBend(events, 690, 8832)

        checkPitchBend(events, 700, 8628)
        checkPitchBend(events, 710, 8414)
        checkPitchBend(events, 720, 8192)

        expect(events.at(0).size()).toBe(0)
    })

    test('prebend', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('prebend.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(57)

        /// prebend only
        checkEventInterval(events, 0, 239, 52, defVol)

        /// prebend+bend
        checkEventInterval(events, 480, 719, 52, defVol)
        checkPitchBend(events, 480, 8192)
        checkPitchBend(events, 490, 8201)
        checkPitchBend(events, 500, 8229)
        checkPitchBend(events, 510, 8277)
        checkPitchBend(events, 520, 8343)
        checkPitchBend(events, 530, 8429)
        checkPitchBend(events, 540, 8533)
        checkPitchBend(events, 550, 8656)
        checkPitchBend(events, 560, 8798)
        checkPitchBend(events, 570, 8960)
        checkPitchBend(events, 580, 9140)
        checkPitchBend(events, 590, 9339)
        checkPitchBendInterval(events, 600, 710, 10, 9557)

        /// prebend+tie+bend
        checkPitchBend(events, 950, pwReset)
        checkEventInterval(events, 960, 1319, 52, defVol)
        checkPitchBend(events, 1080, 8192)
        checkPitchBend(events, 1090, 8201)
        checkPitchBend(events, 1100, 8229)
        checkPitchBend(events, 1110, 8277)
        checkPitchBend(events, 1120, 8343)
        checkPitchBend(events, 1130, 8429)
        checkPitchBend(events, 1140, 8533)
        checkPitchBend(events, 1150, 8656)
        checkPitchBend(events, 1160, 8798)
        checkPitchBend(events, 1170, 8960)
        checkPitchBend(events, 1180, 9140)
        checkPitchBend(events, 1190, 9339)
        checkPitchBendInterval(events, 1200, 1319, 10, 9557)

        expect(events.at(0).size()).toBe(2)
    })

    test('slightbend', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('slightbend.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(47)

        /// slight bend 0 -> 1
        checkEventInterval(events, 0, 119, 52, defVol)
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8194)
        checkPitchBend(events, 20, 8201)
        checkPitchBend(events, 30, 8213)
        checkPitchBend(events, 40, 8229)
        checkPitchBend(events, 50, 8251)
        checkPitchBend(events, 60, 8277)
        checkPitchBend(events, 70, 8308)
        checkPitchBend(events, 80, 8343)
        checkPitchBend(events, 90, 8384)
        checkPitchBend(events, 100, 8429)
        checkPitchBend(events, 110, 8478)

        /// slight bend 0.25 -> 0.75
        checkPitchBend(events, 230, pwReset)
        checkEventInterval(events, 240, 359, 52, defVol)
        checkPitchBend(events, 270, 8192)
        checkPitchBend(events, 280, 8201)
        checkPitchBend(events, 290, 8229)
        checkPitchBend(events, 300, 8277)
        checkPitchBend(events, 310, 8343)
        checkPitchBend(events, 320, 8429)
        checkPitchBendInterval(events, 330, 350, 10, 8533)

        /// slight bend + note
        checkPitchBend(events, 470, pwReset)
        checkEventInterval(events, 480, 599, 52, defVol)
        checkPitchBend(events, 480, 8192)
        checkPitchBend(events, 490, 8194)
        checkPitchBend(events, 500, 8201)
        checkPitchBend(events, 510, 8213)
        checkPitchBend(events, 520, 8229)
        checkPitchBend(events, 530, 8251)
        checkPitchBend(events, 540, 8277)
        checkPitchBend(events, 550, 8308)
        checkPitchBend(events, 560, 8343)
        checkPitchBend(events, 570, 8384)
        checkPitchBend(events, 580, 8429)
        checkPitchBend(events, 590, 8478)
        checkPitchBend(events, 595, pwReset)
        checkEventInterval(events, 600, 719, 52, defVol)
        expect(events.at(0).size()).toBe(3)
    })

    test('slides', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('slides.mscx', true, true)

        expect(events.size()).toBe(4)
        expect(events.at(0).size()).toBe(51)
        expect(events.at(1).size()).toBe(18)
        expect(events.at(2).size()).toBe(3)
        expect(events.at(3).size()).toBe(9)

        checkEventInterval(events, 0, 179, 52, defVol)
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8201)
        checkPitchBend(events, 20, 8229)
        checkPitchBend(events, 30, 8277)
        checkPitchBend(events, 40, 8343)
        checkPitchBend(events, 50, 8429)
        checkPitchBend(events, 60, 8533)
        checkPitchBend(events, 70, 8656)
        checkPitchBend(events, 80, 8798)
        checkPitchBend(events, 90, 8960)
        checkPitchBend(events, 100, 9140)
        checkPitchBend(events, 110, 9339)
        checkPitchBendInterval(events, 120, 230, 10, 9557)
        checkEventInterval(events, 180, 198, 53, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 199, 217, 52, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 219, 237, 51, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)

        checkEventInterval(events, 420, 438, 55, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 440, 458, 54, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkEventInterval(events, 460, 478, 53, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 470, pwReset)
        checkEventInterval(events, 480, 719, 52, defVol)
        checkPitchBend(events, 510, 8192)
        checkPitchBend(events, 520, 8229)
        checkPitchBend(events, 530, 8343)
        checkPitchBend(events, 540, 8533)
        checkPitchBend(events, 550, 8798)
        checkPitchBend(events, 560, 9140)
        checkPitchBendInterval(events, 570, 710, 10, 9557)

        checkEventInterval(events, 960, 1019, 52, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 2)
        checkEventInterval(events, 1020, 1038, 53, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 3)
        checkEventInterval(events, 1039, 1057, 54, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 3)
        checkEventInterval(events, 1059, 1077, 55, defVol, MidiInstrumentEffect.SLIDE, DEFAULT_CHANNEL + 3)

        expect(events.at(0).size()).toBe(1)
        expect(events.at(1).size()).toBe(6)
        expect(events.at(2).size()).toBe(1)
        expect(events.at(3).size()).toBe(3)
    })

    test('gracebend', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('gracebend.mscx', true, true)

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(192)

        /// time factor: 0->1
        checkEventInterval(events, 360, 959, 52, defVol)
        checkPitchBend(events, 360, 8192)
        checkPitchBend(events, 370, 8201)
        checkPitchBend(events, 380, 8229)
        checkPitchBend(events, 390, 8277)
        checkPitchBend(events, 400, 8343)
        checkPitchBend(events, 410, 8429)
        checkPitchBend(events, 420, 8533)
        checkPitchBend(events, 430, 8656)
        checkPitchBend(events, 440, 8798)
        checkPitchBend(events, 450, 8960)
        checkPitchBend(events, 460, 9140)
        checkPitchBend(events, 470, 9339)
        checkPitchBendInterval(events, 480, 950, 10, 9557)

        /// time factor: 0.25->0.75 (ignoring factor)
        checkPitchBend(events, 1310, pwReset)
        checkEventInterval(events, 1320, 1919, 52, defVol)
        checkPitchBend(events, 1320, 8192)
        checkPitchBend(events, 1330, 8201)
        checkPitchBend(events, 1340, 8229)
        checkPitchBend(events, 1350, 8277)
        checkPitchBend(events, 1360, 8343)
        checkPitchBend(events, 1370, 8429)
        checkPitchBend(events, 1380, 8533)
        checkPitchBend(events, 1390, 8656)
        checkPitchBend(events, 1400, 8798)
        checkPitchBend(events, 1410, 8960)
        checkPitchBend(events, 1420, 9140)
        checkPitchBend(events, 1430, 9339)
        checkPitchBendInterval(events, 1440, 1910, 10, 9557)

        /// note + gracebend
        checkPitchBend(events, 1915, pwReset)
        checkEventInterval(events, 1920, 2279, 54, defVol)
        checkPitchBend(events, 2270, pwReset)
        checkEventInterval(events, 2280, 2879, 52, defVol)
        checkPitchBend(events, 2280, 8192)
        checkPitchBend(events, 2290, 8201)
        checkPitchBend(events, 2300, 8229)
        checkPitchBend(events, 2310, 8277)
        checkPitchBend(events, 2320, 8343)
        checkPitchBend(events, 2330, 8429)
        checkPitchBend(events, 2340, 8533)
        checkPitchBend(events, 2350, 8656)
        checkPitchBend(events, 2360, 8798)
        checkPitchBend(events, 2370, 8960)
        checkPitchBend(events, 2380, 9140)
        checkPitchBend(events, 2390, 9339)
        checkPitchBendInterval(events, 2400, 2870, 10, 9557)

        expect(events.at(0).size()).toBe(1)
    })

    test('bendGraceAfter', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('bend-grace-after.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(123)

        checkEventInterval(events, 0, 479, 60, defVol)

        checkPitchBend(events, 111, 8192)
        checkPitchBend(events, 121, 8202)
        checkPitchBend(events, 131, 8235)
        checkPitchBend(events, 141, 8289)
        checkPitchBend(events, 151, 8366)
        checkPitchBend(events, 161, 8464)
        checkPitchBend(events, 171, 8583)
        checkPitchBend(events, 181, 8725)
        checkPitchBend(events, 191, 8888)
        checkPitchBend(events, 201, 9073)
        checkPitchBend(events, 211, 9280)
        checkPitchBend(events, 221, 9508)
        checkPitchBendInterval(events, 231, 471, 10, 9557)

        checkPitchBend(events, 1910, pwReset)
        checkEventInterval(events, 1920, 2399, 60, defVol)

        checkPitchBend(events, 1988, 8192)
        checkPitchBend(events, 1998, 8229)
        checkPitchBend(events, 2008, 8343)
        checkPitchBend(events, 2018, 8533)
        checkPitchBend(events, 2028, 8798)
        checkPitchBend(events, 2038, 9140)
        checkPitchBendInterval(events, 2048, 2158, 10, 9557)
        checkPitchBend(events, 2168, 9550)
        checkPitchBend(events, 2178, 9522)
        checkPitchBend(events, 2188, 9472)
        checkPitchBend(events, 2198, 9401)
        checkPitchBend(events, 2208, 9308)
        checkPitchBend(events, 2218, 9194)
        checkPitchBend(events, 2228, 9058)
        checkPitchBend(events, 2238, 8901)
        checkPitchBend(events, 2248, 8721)
        checkPitchBend(events, 2258, 8521)
        checkPitchBend(events, 2268, 8299)
        checkPitchBend(events, 2278, 8192)

        checkPitchBend(events, 3830, pwReset)
        checkEventInterval(events, 3840, 4319, 64, defVol)

        checkPitchBend(events, 3840, 8192)
        checkPitchBend(events, 3850, 8199)
        checkPitchBend(events, 3860, 8221)
        checkPitchBend(events, 3870, 8258)
        checkPitchBend(events, 3880, 8310)
        checkPitchBend(events, 3890, 8377)
        checkPitchBend(events, 3900, 8458)
        checkPitchBend(events, 3910, 8554)
        checkPitchBend(events, 3920, 8666)
        checkPitchBend(events, 3930, 8792)
        checkPitchBendInterval(events, 3940, 4310, 10, 8874)

        expect(events.at(0).empty()).toBe(true)
    })

    test('bendGraceAfter2', async () => {
        const defVol = Math.trunc(80)   // mf
        const pwReset = Math.trunc(8192)
        const pitch = 52

        const events = renderMidiEvents('bend-grace-after-2.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(104)

        checkEventInterval(events, 0, 239, pitch, defVol)
        checkPitchBend(events, 0, pwReset)
        checkPitchBend(events, 10, 8194)
        checkPitchBend(events, 20, 8201)
        checkPitchBend(events, 30, 8213)
        checkPitchBend(events, 40, 8229)
        checkPitchBend(events, 50, 8251)
        checkPitchBend(events, 60, 8277)
        checkPitchBend(events, 70, 8308)
        checkPitchBend(events, 80, 8343)
        checkPitchBend(events, 90, 8384)
        checkPitchBend(events, 100, 8429)
        checkPitchBend(events, 110, 8478)
        checkPitchBend(events, 120, 8533)
        checkPitchBend(events, 130, 8592)
        checkPitchBend(events, 140, 8656)
        checkPitchBend(events, 150, 8725)
        checkPitchBend(events, 160, 8798)
        checkPitchBend(events, 170, 8877)
        checkPitchBend(events, 180, 8960)
        checkPitchBend(events, 190, 9047)
        checkPitchBend(events, 200, 9140)
        checkPitchBend(events, 210, 9237)
        checkPitchBend(events, 220, 9339)
        checkPitchBend(events, 230, 9445)

        checkPitchBend(events, 235, pwReset)
        checkEventInterval(events, 240, 719, pitch, defVol)
        checkPitchBend(events, 240, 8192)
        checkPitchBend(events, 250, 8194)
        checkPitchBend(events, 260, 8201)
        checkPitchBend(events, 270, 8213)
        checkPitchBend(events, 280, 8229)
        checkPitchBend(events, 290, 8251)
        checkPitchBend(events, 300, 8277)
        checkPitchBend(events, 310, 8308)
        checkPitchBend(events, 320, 8343)
        checkPitchBend(events, 330, 8384)
        checkPitchBend(events, 340, 8429)
        checkPitchBend(events, 350, 8478)
        checkPitchBend(events, 360, 8533)
        checkPitchBend(events, 370, 8592)
        checkPitchBend(events, 380, 8656)
        checkPitchBend(events, 390, 8725)
        checkPitchBend(events, 400, 8798)
        checkPitchBend(events, 410, 8877)
        checkPitchBend(events, 420, 8960)
        checkPitchBend(events, 430, 9047)
        checkPitchBend(events, 440, 9140)
        checkPitchBend(events, 450, 9237)
        checkPitchBend(events, 460, 9339)
        checkPitchBend(events, 470, 9445)
        checkPitchBend(events, 480, 9557)
        checkPitchBend(events, 490, 9559)
        checkPitchBend(events, 500, 9566)
        checkPitchBend(events, 510, 9578)
        checkPitchBend(events, 520, 9595)
        checkPitchBend(events, 530, 9616)
        checkPitchBend(events, 540, 9642)
        checkPitchBend(events, 550, 9673)
        checkPitchBend(events, 560, 9709)
        checkPitchBend(events, 570, 9749)
        checkPitchBend(events, 580, 9794)
        checkPitchBend(events, 590, 9844)
        checkPitchBend(events, 600, 9898)
        checkPitchBend(events, 610, 9957)
        checkPitchBend(events, 620, 10021)
        checkPitchBend(events, 630, 10090)
        checkPitchBend(events, 640, 10164)
        checkPitchBend(events, 650, 10242)
        checkPitchBend(events, 660, 10325)
        checkPitchBend(events, 670, 10413)
        checkPitchBend(events, 680, 10505)
        checkPitchBend(events, 690, 10602)
        checkPitchBend(events, 700, 10704)
        checkPitchBend(events, 710, 10811)

        checkPitchBend(events, 715, pwReset)
        checkEventInterval(events, 720, 959, pitch, defVol)
        checkPitchBend(events, 720, 8192)
        checkPitchBend(events, 730, 8201)
        checkPitchBend(events, 740, 8229)
        checkPitchBend(events, 750, 8277)
        checkPitchBend(events, 760, 8343)
        checkPitchBend(events, 770, 8429)
        checkPitchBend(events, 780, 8533)
        checkPitchBend(events, 790, 8656)
        checkPitchBend(events, 800, 8798)
        checkPitchBend(events, 810, 8960)
        checkPitchBend(events, 820, 9140)
        checkPitchBend(events, 830, 9339)
        checkPitchBend(events, 840, 9557)
        checkPitchBend(events, 850, 9709)
        checkPitchBend(events, 860, 10164)
        checkPitchBendInterval(events, 870, 950, 10, 10922)

        expect(events.at(0).empty()).toBe(true)
    })

    test('bendAfterHammer', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('bend_after_hammer.mscx', true, true)

        expect(events.size()).toBe(2)
        expect(events.at(0).size()).toBe(2)
        expect(events.at(1).size()).toBe(51)

        checkEventInterval(events, 0, 479, 62, defVol)
        checkEventInterval(events, 480, 1439, 66, defVol, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 960, pwReset, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 970, 8201, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 980, 8229, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 990, 8277, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1000, 8343, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1010, 8429, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1020, 8533, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1030, 8656, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1040, 8798, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1050, 8960, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1060, 9140, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1070, 9339, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBendInterval(events, 1080, 1430, 10, 9557, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)

        expect(events.at(0).size()).toBe(0)
        expect(events.at(1).size()).toBe(1)
    })

    test('bendAfterHammer2', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('bend_after_hammer_2.mscx', true, true)

        expect(events.size()).toBe(2)
        expect(events.at(0).size()).toBe(2)
        expect(events.at(1).size()).toBe(15)

        checkEventInterval(events, 0, 479, 47, defVol)

        checkEventInterval(events, 480, 599, 44, defVol, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 480, pwReset, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 490, 8595, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 500, 9807, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)
        checkPitchBendInterval(events, 510, 590, 10, 10922, MidiInstrumentEffect.HAMMER_PULL, DEFAULT_CHANNEL + 1)

        expect(events.at(0).size()).toBe(0)
        expect(events.at(1).size()).toBe(1)
    })

    test('bendOnHiddenStaff', async () => {
        const defVol = Math.trunc(80) // mf
        const pwReset = Math.trunc(8192)

        const events = renderMidiEvents('bend_on_hidden_staff.mscx', true, true)

        expect(events.size()).toBe(2)
        expect(events.at(0).size()).toBe(3)
        expect(events.at(1).size()).toBe(27)

        checkEventInterval(events, 480, 599, 67, defVol)

        checkEventInterval(events, 1440, 1679, 60, defVol, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1440, pwReset, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1450, 8220, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1460, 8305, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1470, 8448, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1480, 8647, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1490, 8903, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1500, 9216, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1510, 9585, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1520, 10012, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1530, 10496, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1540, 11036, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1550, 11633, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1560, 12288, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1570, 12259, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1580, 12174, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1590, 12032, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1600, 11832, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1610, 11576, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1620, 11264, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1630, 10894, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1640, 10467, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1650, 9984, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1660, 9443, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)
        checkPitchBend(events, 1670, 8846, MidiInstrumentEffect.NONE, DEFAULT_CHANNEL + 1)

        expect(events.at(0).size()).toBe(1)
        expect(events.at(1).size()).toBe(1)
    })

    test('bendAndVibrato', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('bend_and_vibrato.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(98)

        checkEventInterval(events, 0, 959, 52, defVol)
        checkPitchBend(events,   0, 8029)
        checkPitchBend(events,  10, 8084)
        checkPitchBend(events,  20, 8142)
        checkPitchBend(events,  30, 8202)
        checkPitchBend(events,  40, 8264)
        checkPitchBend(events,  50, 8330)
        checkPitchBend(events,  60, 8397)
        checkPitchBend(events,  70, 8359)
        checkPitchBend(events,  80, 8321)
        checkPitchBend(events,  90, 8288)
        checkPitchBend(events, 100, 8256)
        checkPitchBend(events, 110, 8226)
        checkPitchBend(events, 120, 8199)
        checkPitchBend(events, 130, 8174)
        checkPitchBend(events, 140, 8151)
        checkPitchBend(events, 150, 8131)
        checkPitchBend(events, 160, 8113)
        checkPitchBend(events, 170, 8098)
        checkPitchBend(events, 180, 8085)
        checkPitchBend(events, 190, 8183)
        checkPitchBend(events, 200, 8284)
        checkPitchBend(events, 210, 8387)
        checkPitchBend(events, 220, 8492)
        checkPitchBend(events, 230, 8600)
        checkPitchBend(events, 240, 8711)
        checkPitchBend(events, 250, 8768)
        checkPitchBend(events, 260, 8830)
        checkPitchBend(events, 270, 8896)
        checkPitchBend(events, 280, 8966)
        checkPitchBend(events, 290, 9042)
        checkPitchBend(events, 300, 9123)
        checkPitchBend(events, 310, 9099)
        checkPitchBend(events, 320, 9080)
        checkPitchBend(events, 330, 9066)
        checkPitchBend(events, 340, 9057)
        checkPitchBend(events, 350, 9052)
        checkPitchBend(events, 360, 9053)
        checkPitchBend(events, 370, 9057)
        checkPitchBend(events, 380, 9066)
        checkPitchBend(events, 390, 9081)
        checkPitchBend(events, 400, 9099)
        checkPitchBend(events, 410, 9123)
        checkPitchBend(events, 420, 9151)
        checkPitchBend(events, 430, 9294)
        checkPitchBend(events, 440, 9440)
        checkPitchBend(events, 450, 9593)
        checkPitchBend(events, 460, 9748)
        checkPitchBend(events, 470, 9910)
        checkPitchBend(events, 480, 10077)
        checkPitchBend(events, 490, 10131)
        checkPitchBend(events, 500, 10186)
        checkPitchBend(events, 510, 10240)
        checkPitchBend(events, 520, 10294)
        checkPitchBend(events, 530, 10349)
        checkPitchBend(events, 540, 10403)
        checkPitchBend(events, 550, 10349)
        checkPitchBend(events, 560, 10294)
        checkPitchBend(events, 570, 10240)
        checkPitchBend(events, 580, 10186)
        checkPitchBend(events, 590, 10131)
        checkPitchBend(events, 600, 10077)
        checkPitchBend(events, 610, 10022)
        checkPitchBend(events, 620, 9967)
        checkPitchBend(events, 630, 9913)
        checkPitchBend(events, 640, 9858)
        checkPitchBend(events, 650, 9804)
        checkPitchBend(events, 660, 9749)
        checkPitchBend(events, 670, 9804)
        checkPitchBend(events, 680, 9858)
        checkPitchBend(events, 690, 9913)
        checkPitchBend(events, 700, 9967)
        checkPitchBend(events, 710, 10022)
        checkPitchBend(events, 720, 10077)
        checkPitchBend(events, 730, 10131)
        checkPitchBend(events, 740, 10186)
        checkPitchBend(events, 750, 10240)
        checkPitchBend(events, 760, 10294)
        checkPitchBend(events, 770, 10349)
        checkPitchBend(events, 780, 10403)
        checkPitchBend(events, 790, 10349)
        checkPitchBend(events, 800, 10294)
        checkPitchBend(events, 810, 10240)
        checkPitchBend(events, 820, 10186)
        checkPitchBend(events, 830, 10131)
        checkPitchBend(events, 840, 10077)
        checkPitchBend(events, 850, 10022)
        checkPitchBend(events, 860, 9967)
        checkPitchBend(events, 870, 9913)
        checkPitchBend(events, 880, 9858)
        checkPitchBend(events, 890, 9804)
        checkPitchBend(events, 900, 9749)
        checkPitchBend(events, 910, 9804)
        checkPitchBend(events, 920, 9858)
        checkPitchBend(events, 930, 9913)
        checkPitchBend(events, 940, 9967)
        checkPitchBend(events, 950, 10022)

        expect(events.at(0).empty()).toBe(true)
    })

    test('bendReleaseTwice', async () => {
        const defVol = Math.trunc(80) // mf

        const events = renderMidiEvents('bend_release_twice.mscx')

        expect(events.size()).toBe(1)
        expect(events.at(0).size()).toBe(81)

        checkEventInterval(events, 0, 959, 60, defVol)

        /// ---- first bend ----
        checkPitchBend(events, 0, 8192)
        checkPitchBend(events, 10, 8194)
        checkPitchBend(events, 20, 8201)
        checkPitchBend(events, 30, 8213)
        checkPitchBend(events, 40, 8229)
        checkPitchBend(events, 50, 8251)
        checkPitchBend(events, 60, 8277)
        checkPitchBend(events, 70, 8308)
        checkPitchBend(events, 80, 8343)
        checkPitchBend(events, 90, 8384)
        checkPitchBend(events, 100, 8429)
        checkPitchBend(events, 110, 8478)
        checkPitchBend(events, 120, 8533)
        checkPitchBend(events, 130, 8592)
        checkPitchBend(events, 140, 8656)
        checkPitchBend(events, 150, 8725)
        checkPitchBend(events, 160, 8798)
        checkPitchBend(events, 170, 8877)
        checkPitchBend(events, 180, 8960)
        checkPitchBend(events, 190, 9047)
        checkPitchBend(events, 200, 9140)
        checkPitchBend(events, 210, 9237)
        checkPitchBend(events, 220, 9339)
        checkPitchBend(events, 230, 9445)
        checkPitchBend(events, 240, 9557)
        checkPitchBend(events, 250, 9554)
        checkPitchBend(events, 260, 9547)
        checkPitchBend(events, 270, 9536)
        checkPitchBend(events, 280, 9519)
        checkPitchBend(events, 290, 9498)
        checkPitchBend(events, 300, 9472)
        checkPitchBend(events, 310, 9441)
        checkPitchBend(events, 320, 9405)
        checkPitchBend(events, 330, 9365)
        checkPitchBend(events, 340, 9320)
        checkPitchBend(events, 350, 9270)
        checkPitchBend(events, 360, 9216)
        checkPitchBend(events, 370, 9156)
        checkPitchBend(events, 380, 9092)
        checkPitchBend(events, 390, 9024)
        checkPitchBend(events, 400, 8950)
        checkPitchBend(events, 410, 8872)
        checkPitchBend(events, 420, 8789)
        checkPitchBend(events, 430, 8701)
        checkPitchBend(events, 440, 8609)
        checkPitchBend(events, 450, 8512)
        checkPitchBend(events, 460, 8410)
        checkPitchBend(events, 470, 8303)

        /// ---- second bend (startFactor=0.25, endFactor=0.75) ----
        checkPitchBend(events, 540, 8192)
        checkPitchBend(events, 550, 8201)
        checkPitchBend(events, 560, 8229)
        checkPitchBend(events, 570, 8277)
        checkPitchBend(events, 580, 8343)
        checkPitchBend(events, 590, 8429)
        checkPitchBend(events, 600, 8533)
        checkPitchBend(events, 610, 8656)
        checkPitchBend(events, 620, 8798)
        checkPitchBend(events, 630, 8960)
        checkPitchBend(events, 640, 9140)
        checkPitchBend(events, 650, 9339)
        checkPitchBend(events, 660, 9557)
        checkPitchBendInterval(events, 670, 720, 10, 9557)
        checkPitchBend(events, 730, 9547)
        checkPitchBend(events, 740, 9519)
        checkPitchBend(events, 750, 9472)
        checkPitchBend(events, 760, 9405)
        checkPitchBend(events, 770, 9320)
        checkPitchBend(events, 780, 9216)
        checkPitchBend(events, 790, 9092)
        checkPitchBend(events, 800, 8950)
        checkPitchBend(events, 810, 8789)
        checkPitchBend(events, 820, 8609)
        checkPitchBend(events, 830, 8410)
        checkPitchBend(events, 840, 8192)

        expect(events.at(0).size()).toBe(0)
    })
})
