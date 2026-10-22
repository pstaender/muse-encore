// SPDX-License-Identifier: GPL-3.0-only
// The soundfont presets of the playback channels: MuseScore 4's Fluid sound mapping (PlaybackSetupDataResolver +
// soundmapping.h), independent of the banks and programs of the instrument channels
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, test } from 'vitest'
import { loadScore, type MasterScore } from '../src/index'
import { CompatMidiRender } from '../src/engraving/compat/midi/compatmidirender'
import { Context } from '../src/engraving/compat/midi/compatmidirenderinternal'
import { EventsHolder } from '../src/engraving/compat/midi/event'
import { CTRL_PROGRAM, ME_CONTROLLER, ME_NOTEON } from '../src/engraving/compat/midi/midicoreevent'
import { NotationPlayback, synthChannel } from '../src/notation/internal/notationplayback'
import { PlaybackSetupDataResolver } from '../src/engraving/playback/playbacksetupdataresolver'
import { ROOT, hasSubmodule, initFonts } from './helpers'

function load(file: string, edit: (xml: string) => string = x => x): MasterScore {
    return loadScore(new TextEncoder().encode(edit(readFileSync(`${ROOT}MuseScore/vtest/scores/${file}`, 'utf8'))))
}

/** the presets of the instrument channels (their voice 0 synthesizer channels) */
function presets(score: MasterScore): string[] {
    return new NotationPlayback(score).channels().filter(c => c.voice === 0)
        .map(c => `${c.name} ${c.bank}/${c.program}${c.drum ? ' drum' : ''}`)
}

/** a staff text with a MIDI action of the instrument that changes the program (3.x score, one part, two voices) */
function withMidiAction(xml: string): string {
    return xml
        .replace('</Instrument>', '<MidiAction name="organ"><program value="19"/></MidiAction></Instrument>')
        .replace('<voice>', '<voice><StaffText><text>organ</text><MidiAction channel="0" name="organ"/></StaffText>')
}

describe.skipIf(!hasSubmodule)('Fluid sound mapping', () => {
    beforeAll(async () => {
        await initFonts()
    })

    test('instruments', () => {
        // flute, snare drum, congas, drumset, piano
        expect(presets(load('barline-1.mscx'))).toEqual([
            'normal 0/73', 'normal 128/48 drum', 'normal 128/48 drum', 'normal 128/0 drum', 'normal 0/0',
        ])
    })

    test('articulation channels', () => {
        // violin: pizzicato has its own sound (VIOLIN of articulationSounds), tremolo not
        expect(presets(load('custom-keysig-4.mscx')).slice(0, 3)).toEqual(['arco 0/40', 'pizzicato 20/45', 'tremolo 0/40'])
    })

    test('the bank and program of the channel are ignored', () => {
        // 2.x files: piano with the user bank MSB 2/LSB 5 (= 261) played a drum kit before
        const score = load('barline-1.mscx')
        const piano = score.parts().at(-1)!.instrument().channels()[0]
        piano.setBank(261)
        piano.setProgram(5)
        expect(presets(score).at(-1)).toBe('normal 0/0')
    })
    test('each voice has its own channel (ChannelMap)', () => {
        const score = load('layout-sequence-11.mscx')
        const r = new NotationPlayback(score).renderMidiEvents()
        const noteChannels = new Set(r.events.filter(e => e.type === ME_NOTEON).map(e => e.channel))
        const c = score.parts()[0].instrument().channels()[0].channel()
        expect([...noteChannels].sort()).toEqual([synthChannel(c, 0), synthChannel(c, 1)])
        expect(r.channels.map(ch => [ch.channel, ch.instrumentChannel, ch.voice])).toEqual([[synthChannel(c, 0), c, 0], [synthChannel(c, 1), c, 1]])
    })

    test('the MIDI actions of staff texts are not played', () => {
        const score = load('layout-sequence-11.mscx', withMidiAction)
        // the MIDI renderer (export) has the program change
        const events = new EventsHolder()
        CompatMidiRender.renderScore(score, events, new Context(), true)
        const programChanges = [...events.channels()].flatMap(m => [...m]).filter(([, e]) => e.type() === ME_CONTROLLER && e.dataA() === CTRL_PROGRAM)
        expect(programChanges.map(([, e]) => e.dataB())).toEqual([19])
        // the playback not
        const r = new NotationPlayback(score).renderMidiEvents()
        expect(r.events.some(e => e.type === ME_CONTROLLER && e.dataA === CTRL_PROGRAM)).toBe(false)
    })
    test('primary and secondary instruments (markInstrumentsAsPrimary)', () => {
        const score = load('custom-keysig-4.mscx')
        expect(score.parts().map(p => p.instrument().isPrimary())).toEqual([true, false, true])
        expect(score.parts().map(p => PlaybackSetupDataResolver.resolveSetupData(p.instrument()).toString())).toEqual([
            'strings.violin.orchestral:primary', 'strings.violin.orchestral:secondary', 'strings.violin.orchestral:primary',
        ])
        score.removePart(score.parts()[0])
        expect(score.parts().map(p => p.instrument().isPrimary())).toEqual([true, false])
    })
})
