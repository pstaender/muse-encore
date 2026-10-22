// SPDX-License-Identifier: GPL-3.0-only
// The MIDI rendering against MuseScore's MIDI export: the note events and tempo changes of the reference files of
// MuseScore/src/importexport/midi/tests (midiexport_data/*-ref.mid, written by MuseScore 4.7.5's ExportMidi from the
// events of CompatMidiRender) must be produced from the same scores. ExportMidi::write is replicated for the compared
// parts (tracks per staff, MIDI port/channel of the mapping, PauseMap ticks and tempo map).
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, test } from 'vitest'
import { layoutScore, loadScore, type MasterScore } from '../src/index'
import { CompatMidiRender } from '../src/engraving/compat/midi/compatmidirender'
import { Context, HarmonyChannelSetting } from '../src/engraving/compat/midi/compatmidirenderinternal'
import { EventsHolder } from '../src/engraving/compat/midi/event'
import { ME_NOTEON } from '../src/engraving/compat/midi/midicoreevent'
import { ROOT, hasSubmodule, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/importexport/midi/tests/midiexport_data/`

interface MidiFileEvent { tick: number; status: number; a: number; b: number; meta?: number; data?: Uint8Array }

/** a minimal Standard MIDI File reader (running status, meta and sysex events) */
function readMidiFile(buf: Uint8Array): { division: number; tracks: MidiFileEvent[][] } {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let p = 0
    const str = (n: number): string => String.fromCharCode(...buf.subarray(p, p + n))
    if (str(4) !== 'MThd') {
        throw new Error('no MIDI file')
    }
    p += 8
    const ntracks = dv.getUint16(p + 2)
    const division = dv.getUint16(p + 4)
    p += 6
    const tracks: MidiFileEvent[][] = []
    for (let t = 0; t < ntracks; ++t) {
        if (str(4) !== 'MTrk') {
            throw new Error('no track')
        }
        const len = dv.getUint32(p + 4)
        p += 8
        const end = p + len
        const events: MidiFileEvent[] = []
        let tick = 0
        let running = 0
        const varlen = (): number => {
            let v = 0
            for (;;) {
                const c = buf[p++]
                v = (v << 7) | (c & 0x7f)
                if (!(c & 0x80)) {
                    return v
                }
            }
        }
        while (p < end) {
            tick += varlen()
            let status = buf[p]
            if (status & 0x80) {
                p++
                running = status < 0xf0 ? status : running
            } else {
                status = running
            }
            if (status === 0xff) {
                const meta = buf[p++]
                const n = varlen()
                events.push({ tick, status, a: 0, b: 0, meta, data: buf.subarray(p, p + n) })
                p += n
            } else if (status === 0xf0 || status === 0xf7) {
                p += varlen()
            } else {
                const type = status & 0xf0
                const a = buf[p++]
                const b = type === 0xc0 || type === 0xd0 ? 0 : buf[p++]
                events.push({ tick, status, a, b })
            }
        }
        p = end
        tracks.push(events)
    }
    return { division, tracks }
}

function readScore(name: string): MasterScore {
    const score = loadScore(readFileSync(`${DATA}${name}.mscx`))
    layoutScore(score)
    score.rebuildMidiMapping()
    return score
}

/** the note events and tempos of ExportMidi::write (expandRepeats, applyCaesuras) per track */
function exportMidi(score: MasterScore): { notes: string[][]; tempos: string[] } {
    const events = new EventsHolder()
    const context = new Context()
    context.eachStringHasChannel = false
    context.instrumentsHaveEffects = false
    context.harmonyChannelSetting = HarmonyChannelSetting.DEFAULT
    context.sndController = CompatMidiRender.getControllerForSnd(score, -1)
    context.useDefaultArticulations = false
    context.applyCaesuras = true

    CompatMidiRender.renderScore(score, events, context, true)

    const notes: string[][] = []
    for (let staffIdx = 0; staffIdx < score.nstaves(); ++staffIdx) {
        const staff = score.staff(staffIdx)!
        const part = staff.part()
        const track: string[] = []
        for (const instr of part.instruments().values()) {
            for (const instrChan of instr.channels()) {
                const port = score.midiPort(instrChan.channel())
                const channel = score.midiChannel(instrChan.channel())
                for (const multimap of events.channels()) {
                    for (const [tick, event] of multimap) {
                        if (event.type() !== ME_NOTEON) {
                            continue
                        }
                        if (event.discard() === staffIdx + 1 && event.velo() > 0) {
                            // turn note off so we can restrike it in another track
                            track.push(`${CompatMidiRender.tick(context, tick)} ${channel} ${event.pitch()} 0`)
                        }
                        if (event.getOriginatingStaff() !== staffIdx) {
                            continue
                        }
                        if (event.discard() && event.velo() === 0) {
                            continue
                        }
                        if (score.midiPort(event.channel()) !== port || score.midiChannel(event.channel()) !== channel) {
                            continue
                        }
                        track.push(`${CompatMidiRender.tick(context, tick)} ${channel} ${event.pitch()} ${event.velo()}`)
                    }
                }
            }
        }
        notes.push(track.sort())
    }

    const tempos: string[] = []
    const tm = context.pauseMap.tempomapWithPauses()!
    for (let i = 0; i < tm.size(); ++i) {
        const tempo = Math.round((1.0 / tm.valueAt(i).tempo * tm.tempoMultiplier()) * 1000000.0)
        tempos.push(`${tm.keyAt(i)} ${tempo}`)
    }
    return { notes, tempos }
}

/** the note events (tick channel pitch velocity) of each track and the tempo changes of the reference file */
function referenceMidi(name: string): { notes: string[][]; tempos: string[] } {
    const midi = readMidiFile(readFileSync(`${DATA}${name}-ref.mid`))
    const notes = midi.tracks.map(t => t.filter(e => (e.status & 0xf0) === 0x90 || (e.status & 0xf0) === 0x80)
        .map(e => `${e.tick} ${e.status & 0x0f} ${e.a} ${(e.status & 0xf0) === 0x80 ? 0 : e.b}`).sort())
    const tempos = midi.tracks.flatMap(t => t.filter(e => e.status === 0xff && e.meta === 0x51)
        .map(e => `${e.tick} ${(e.data![0] << 16) | (e.data![1] << 8) | e.data![2]}`))
    return { notes, tempos }
}

beforeAll(async () => {
    await initFonts()
})

describe.skipIf(!hasSubmodule)('MIDI export reference files (MuseScore 4.7.5)', () => {
    // the enabled tests of midiexport_tests.cpp, and the disabled ones whose notes and tempos match (C++: "FIXME: update
    // ref"; not testTimeStretchFermata: its reference has fewer fermatas)
    test.each([
        'midi01', 'midi02', 'midi03', 'testMidiPort', 'testArpeggio', 'testMutedUnison', 'testMeasureRepeats',
        'testInitialKeySigThenRepeatToMeas2', 'testRepeatsWithKeySigs', 'testRepeatsWithKeySigsExceptFirstMeas',
        'testVoltaTemp', 'testVoltaDynamic', 'testSingleNoteDynamics', 'testBends1', 'testBends2',
    ])('%s: the same notes and tempos', (name) => {
        const ours = exportMidi(readScore(name))
        const ref = referenceMidi(name)
        expect(ref.notes.flat().length + ref.tempos.length).toBeGreaterThan(0)
        expect(ours.tempos).toEqual(ref.tempos)
        expect(ours.notes).toEqual(ref.notes)
    })
})
