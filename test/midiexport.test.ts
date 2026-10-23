// SPDX-License-Identifier: GPL-3.0-only
// The MIDI export (src/importexport/midi: ExportMidi, MidiFile, writeMidi) and the MIDI rendering against MuseScore's
// MIDI export: MuseScore/src/importexport/midi/tests/midiexport_tests.cpp (the reference files midiexport_data/*-ref.mid
// must be written byte by byte), the note events and tempo changes of the reference files whose C++ tests are disabled,
// the options of the export (expand repeats, RPNs), part scores and, when MuseScore 4 is installed, the output of
// `mscore -o out.mid` for some demo scores.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { layoutScore, loadScore, type MasterScore } from '../src/index'
import { writeMidi } from '../src/importexport/midi/api'
import { ExportMidi } from '../src/importexport/midi/internal/midiexport/exportmidi'
import { Excerpt } from '../src/engraving/dom/excerpt'
import type { Score } from '../src/engraving/dom/score'
import { CompatMidiRender } from '../src/engraving/compat/midi/compatmidirender'
import { Context, HarmonyChannelSetting } from '../src/engraving/compat/midi/compatmidirenderinternal'
import { EventsHolder } from '../src/engraving/compat/midi/event'
import { ME_NOTEON } from '../src/engraving/compat/midi/midicoreevent'
import { DEMOS, ROOT, VTEST, hasSubmodule, initFonts } from './helpers'

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

const MSCORE = '/Applications/MuseScore 4.app/Contents/MacOS/mscore'

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i])
}

/** TestUtils::createPart */
function createPart(masterScore: MasterScore, partNumber: number): Score {
    const parts = [masterScore.parts()[partNumber]]
    const nscore = masterScore.createScore()
    const ex = new Excerpt(masterScore)
    ex.setExcerptScore(nscore)
    ex.setParts(parts)
    ex.setName(parts[0].partName())
    Excerpt.createExcerpt(ex)
    masterScore.excerpts().push(ex)
    masterScore.setExcerptsChanged(true)
    nscore.doLayout()
    return nscore
}

describe.skipIf(!hasSubmodule)('MidiExportTests (midiexport_tests.cpp)', () => {
    // exportAndCompareWithRef: ExportMidi::write(name, expandRepeats: true, exportRPNs: true), byte by byte
    test.each([
        'midi01', 'midi02', 'midi03', 'testMidiPort', 'testArpeggio', 'testMutedUnison', 'testMeasureRepeats',
        'testInitialKeySigThenRepeatToMeas2', 'testRepeatsWithKeySigs', 'testRepeatsWithKeySigsExceptFirstMeas',
        'testVoltaTemp', 'testVoltaDynamic',
    ])('%s', (name) => {
        const score = readScore(name)
        const midi = new ExportMidi(score).write(true, true)
        expect(equalBytes(midi, new Uint8Array(readFileSync(`${DATA}${name}-ref.mid`)))).toBe(true)
    })
})

describe.skipIf(!hasSubmodule)('writeMidi', () => {
    test('header, track names, time and key signatures, tempo', () => {
        const score = readScore('midi03')
        const midi = readMidiFile(writeMidi(score))
        const bytes = writeMidi(score)
        expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd')
        expect((bytes[8] << 8) | bytes[9]).toBe(1) // format 1
        expect(midi.division).toBe(480)
        expect(midi.tracks.length).toBe(score.nstaves())
        const track0 = midi.tracks[0]
        const meta = (t: number): MidiFileEvent[] => track0.filter(e => e.status === 0xff && e.meta === t)
        expect(new TextDecoder().decode(meta(0x03)[0].data)).toBe(score.staff(0)!.partName())
        expect(meta(0x58).length).toBeGreaterThan(0)
        expect(meta(0x59).length).toBeGreaterThan(0)
        expect(meta(0x51)[0].tick).toBe(0)
        expect(track0.some(e => (e.status & 0xf0) === 0x90 && e.b > 0)).toBe(true)
    })

    test('expand repeats', () => {
        const score = readScore('testVoltaTemp')
        const noteOns = (bytes: Uint8Array): number => readMidiFile(bytes).tracks.flat()
            .filter(e => (e.status & 0xf0) === 0x90 && e.b > 0).length
        const expanded = noteOns(writeMidi(score))
        const notExpanded = noteOns(writeMidi(score, { expandRepeats: false }))
        expect(notExpanded).toBeGreaterThan(0)
        expect(expanded).toBeGreaterThan(notExpanded)
        // the default is "expand repeats"
        expect(equalBytes(writeMidi(score), writeMidi(score, { expandRepeats: true }))).toBe(true)
    })

    test('export RPNs', () => {
        const score = readScore('midi01')
        const rpns = (bytes: Uint8Array): number => readMidiFile(bytes).tracks.flat()
            .filter(e => (e.status & 0xf0) === 0xb0 && (e.a === 0x64 || e.a === 0x65)).length
        expect(rpns(writeMidi(score))).toBe(4 * score.parts().length)
        expect(rpns(writeMidi(score, { exportRPNs: false }))).toBe(0)
    })

    test('a part score: the tracks of its staves', async () => {
        await initFonts()
        const score = loadScore(readFileSync(`${DEMOS}/Amazing_grace.mscz`))
        layoutScore(score)
        const master = readMidiFile(writeMidi(score))
        for (const partIdx of [0, 1]) {
            const part = createPart(score, partIdx)
            const midi = readMidiFile(writeMidi(part))
            expect(midi.tracks.length).toBe(part.nstaves())
            const notes = (t: MidiFileEvent[]): string[] => t.filter(e => (e.status & 0xf0) === 0x90)
                .map(e => `${e.tick} ${e.status} ${e.a} ${e.b}`)
            const firstStaff = score.parts()[partIdx].staves()[0].idx()
            expect(notes(midi.tracks[0])).toEqual(notes(master.tracks[firstStaff]))
            expect(notes(midi.tracks[0]).length).toBeGreaterThan(0)
        }
    })
})

// `mscore -o out.mid` (MuseScore 4.7.5 with the default MIDI export settings) for some demo and vtest scores, byte by
// byte: choir with lyrics (adeste), piano (Amazing_grace), orchestra with instrument changes (Dawn), pedal, rehearsal
// marks and tempo texts, capo, guitar bends, drums
describe.skipIf(!hasSubmodule || !existsSync(MSCORE))('writeMidi like MuseScore 4.7.5', () => {
    const out = mkdtempSync(join(tmpdir(), 'midiexport-'))
    test.each([
        `${DEMOS}/adeste.mscx`, `${DEMOS}/Amazing_grace.mscz`, `${DEMOS}/Dawn.mscx`, `${DEMOS}/Fugue_1.mscx`,
        `${DEMOS}/Triumph.mscz`, `${VTEST}/pedal-1.mscx`, `${VTEST}/tempoText-1.mscz`, `${VTEST}/capo.mscz`,
        `${VTEST}/guitarBend-1.mscz`, `${VTEST}/drumset-custom-1.mscx`,
    ])('%s', async (file) => {
        await initFonts()
        const ref = join(out, `${file.replace(/.*\//, '')}.mid`)
        try {
            execFileSync(MSCORE, ['-o', ref, file], { stdio: 'ignore' })
        } catch {
            // mscore aborts after writing the file when it quits
        }
        const score = loadScore(readFileSync(file))
        layoutScore(score)
        expect(equalBytes(writeMidi(score), new Uint8Array(readFileSync(ref)))).toBe(true)
    }, 120000)
})
