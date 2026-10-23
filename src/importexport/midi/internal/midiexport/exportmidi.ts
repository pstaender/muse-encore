/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiexport/exportmidi.h/.cpp
 * write() returns the bytes of the MIDI file (C++ writes to a QIODevice or a file and returns false on error).
 */

import { CompatMidiRender } from '../../../../engraving/compat/midi/compatmidirender'
import { Context, HarmonyChannelSetting } from '../../../../engraving/compat/midi/compatmidirenderinternal'
import { EventsHolder } from '../../../../engraving/compat/midi/event'
import {
    CTRL_CHORUS_SEND, CTRL_HDATA, CTRL_HRPN, CTRL_LRPN, CTRL_PANPOT, CTRL_PROGRAM, CTRL_RESET_ALL_CTRL, CTRL_REVERB_SEND,
    CTRL_VOLUME, ME_CONTROLLER, ME_META, ME_NOTEON, ME_PITCHBEND, META_KEY_SIGNATURE, META_LYRIC, META_MARKER,
    META_PORT_CHANGE, META_TEMPO, META_TIME_SIGNATURE, META_TRACK_NAME,
} from '../../../../engraving/compat/midi/midicoreevent'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import type { RehearsalMark } from '../../../../engraving/dom/rehearsalmark'
import type { Score } from '../../../../engraving/dom/score'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType } from '../../../../engraving/dom/segment'
import { SynthesizerState } from '../../../../engraving/dom/synthesizerstate'
import { Constants } from '../../../../engraving/types/constants'
import { LyricsSyllabic } from '../../../../engraving/types/types'
import { lrint } from '../../../../framework/global/realfn'
import { MidiEvent } from '../midishared/midievent'
import { MidiFile, MidiTrack } from '../midishared/midifile'

const utf8 = new TextEncoder()

/** C++ QString::toUtf8() and the data of its constData() including the terminating null */
function nullTerminatedUtf8(s: string): Uint8Array {
    const bytes = utf8.encode(s)
    const data = new Uint8Array(bytes.length + 1)
    data.set(bytes)
    return data
}

export class ExportMidi {
    private m_midiFile = new MidiFile()
    private m_score: Score

    constructor(s: Score) {
        this.m_score = s
    }

    private writeHeader(context: Context): void {
        if (this.m_midiFile.tracks().length === 0) {
            return
        }
        const track = this.m_midiFile.tracks()[0]

        //--------------------------------------------
        //    write track names
        //--------------------------------------------

        let staffIdx = 0
        for (const track1 of this.m_midiFile.tracks()) {
            const staff = this.m_score.staff(staffIdx)!

            const data = nullTerminatedUtf8(staff.partName())

            const ev = new MidiEvent()
            ev.setType(ME_META)
            ev.setMetaType(META_TRACK_NAME)
            ev.setEData(data)
            ev.setLen(data.length)

            track1.insert(0, ev)

            ++staffIdx
        }

        //--------------------------------------------
        //    write time signature
        //--------------------------------------------

        const sigmap = this.m_score.sigmap()
        for (const rs of this.m_score.repeatList()) {
            const startTick = rs.tick
            const endTick = rs.endTick()
            const tickOffset = rs.utick - rs.tick

            const bs = sigmap.lowerBound(startTick)
            const es = sigmap.lowerBound(endTick)

            for (let is = bs; is !== es; ++is) {
                const se = sigmap.valueAt(is)
                const ts = se.timesig()
                let n: number
                switch (ts.denominator()) {
                case 1: n = 0
                    break
                case 2: n = 1
                    break
                case 4: n = 2
                    break
                case 8: n = 3
                    break
                case 16: n = 4
                    break
                case 32: n = 5
                    break
                default:
                    n = 2
                    break
                }

                const ev = new MidiEvent()
                ev.setType(ME_META)
                ev.setMetaType(META_TIME_SIGNATURE)
                ev.setLen(4)
                ev.setEData([ts.numerator(), n, 24, 8])
                track.insert(CompatMidiRender.tick(context, sigmap.keyAt(is) + tickOffset), ev)
            }
        }

        //---------------------------------------------------
        //    write key signatures
        //    assume every staff corresponds to a midi track
        //---------------------------------------------------

        staffIdx = 0
        for (const track1 of this.m_midiFile.tracks()) {
            const staff = this.m_score.staff(staffIdx)!
            const keys = staff.keyList()

            let initialKeySigFound = false
            for (const rs of this.m_score.repeatList()) {
                const startTick = rs.tick
                const endTick = startTick + rs.len()
                const tickOffset = rs.utick - rs.tick

                const sk = keys.lowerBound(startTick)
                const ek = keys.lowerBound(endTick)

                for (let ik = sk; ik !== ek; ++ik) {
                    const ev = new MidiEvent()
                    ev.setType(ME_META)
                    const key = keys.valueAt(ik).concertKey() // -7 -- +7
                    ev.setMetaType(META_KEY_SIGNATURE)
                    ev.setLen(2)
                    ev.setEData([key, 0 /* major */])
                    const tick = keys.keyAt(ik) + tickOffset
                    track1.insert(CompatMidiRender.tick(context, tick), ev)
                    if (tick === 0) {
                        initialKeySigFound = true
                    }
                }
            }

            // fall back write a default C keysig if no initial keysig found
            if (!initialKeySigFound) {
                const ev = new MidiEvent()
                ev.setType(ME_META)
                ev.setMetaType(META_KEY_SIGNATURE)
                ev.setLen(2)
                ev.setEData([0 /* key */, 0 /* major */])
                track1.insert(0, ev)
            }

            ++staffIdx
        }

        //--------------------------------------------
        //    write tempo changes from PauseMap
        //     don't need to unwind or add pauses as this was done already
        //--------------------------------------------

        if (!context.applyCaesuras) {
            return
        }

        const tempomap = context.pauseMap.tempomapWithPauses()!
        const tempoMultiplier = tempomap.tempoMultiplier()
        for (let it = 0; it < tempomap.size(); ++it) {
            const ev = new MidiEvent()
            ev.setType(ME_META)
            //
            // compute midi tempo: microseconds / quarter note
            //
            const tempo = lrint((1.0 / tempomap.valueAt(it).tempo * tempoMultiplier) * 1000000.0)

            ev.setMetaType(META_TEMPO)
            ev.setLen(3)
            ev.setEData([tempo >> 16, tempo >> 8, tempo])
            track.insert(tempomap.keyAt(it), ev)
        }
    }

    /**
     * export midi file
     *
     * The C++ versions without a synthesizer state create a temporary, uninitialized synth state (for tests); the
     * MIDI export of the app passes the score's synthesizer state.
     */
    write(midiExpandRepeats: boolean, exportRPNs: boolean, synthState: SynthesizerState = new SynthesizerState()): Uint8Array {
        this.m_midiFile.setDivision(Constants.DIVISION)
        this.m_midiFile.setFormat(1)
        const tracks = this.m_midiFile.tracks()

        for (let i = 0; i < this.m_score.nstaves(); ++i) {
            tracks.push(new MidiTrack())
        }

        const events = new EventsHolder()
        const context = new Context()
        context.eachStringHasChannel = false
        context.instrumentsHaveEffects = false
        context.harmonyChannelSetting = HarmonyChannelSetting.DEFAULT
        context.sndController = CompatMidiRender.getControllerForSnd(this.m_score, synthState.ccToUse())
        context.useDefaultArticulations = false
        context.applyCaesuras = true

        CompatMidiRender.renderScore(this.m_score, events, context, midiExpandRepeats)

        this.writeHeader(context)

        const masterScore = this.m_score.masterScore()
        let staffIdx = 0
        for (const track of tracks) {
            const staff = this.m_score.staff(staffIdx)!
            const part = staff.part()

            track.setOutPort(part.midiPort())
            track.setOutChannel(part.midiChannel())

            // Pass through the all instruments in the part
            for (const instrument of part.instruments().values()) {
                // Pass through the all channels of the instrument
                // "normal", "pizzicato", "tremolo" for Strings,
                // "normal", "mute" for Trumpet
                for (const instrChan of instrument.channels()) {
                    const ch = part.masterScore().midiMappingAt(instrChan.channel()).articulation() // playbackChannel
                    const port = part.masterScore().midiPort(ch.channel())
                    const channel = part.masterScore().midiChannel(ch.channel())

                    if (staff.isTop()) {
                        track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_RESET_ALL_CTRL, 0))
                        // We need this to get the correct pitch of bends
                        // Hidden under preferences because some software
                        // crashes when receiving RPNs: https://musescore.org/en/node/37431
                        if (channel !== 9 && exportRPNs) {
                            // set pitch bend sensitivity to 12 semitones:
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_LRPN, 0))
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_HRPN, 0))
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_HDATA, 12))

                            // deactivate rpn
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_LRPN, 127))
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_HRPN, 127))
                        }

                        if (ch.program() !== -1) {
                            track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_PROGRAM, ch.program()))
                        }
                        track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_VOLUME, ch.volume()))
                        track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_PANPOT, ch.pan()))
                        track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_REVERB_SEND, ch.reverb()))
                        track.insert(0, new MidiEvent(ME_CONTROLLER, channel, CTRL_CHORUS_SEND, ch.chorus()))
                    }

                    // Export port to MIDI META event
                    if (track.outPort() >= 0 && track.outPort() <= 127) {
                        const ev = new MidiEvent()
                        ev.setType(ME_META)
                        ev.setMetaType(META_PORT_CHANGE)
                        ev.setLen(1)
                        ev.setEData([track.outPort()])
                        track.insert(0, ev)
                    }

                    let equivalentStaffIdx = staffIdx
                    for (const st of masterScore.staves()) {
                        if (staff.id() === st.id()) {
                            equivalentStaffIdx = st.idx()
                        }
                    }

                    for (const multimap of events.channels()) {
                        for (const item of multimap.entries()) {
                            const event = item.event
                            if (event.isMuted()) {
                                continue
                            }
                            if (event.discard() === staffIdx + 1 && event.velo() > 0) {
                                // turn note off so we can restrike it in another track
                                track.insert(CompatMidiRender.tick(context, item.tick), new MidiEvent(ME_NOTEON, channel,
                                                                                                    event.pitch(), 0))
                            }

                            if (event.getOriginatingStaff() !== equivalentStaffIdx) {
                                continue
                            }

                            if (event.discard() && event.velo() === 0) {
                                // ignore noteoff but restrike noteon
                                continue
                            }

                            if (!exportRPNs && event.type() === ME_CONTROLLER && event.portamento()) {
                                // ignore portamento control events if exportRPN isn't switched on
                                continue
                            }

                            const eventPort = masterScore.midiPort(event.channel())
                            const eventChannel = masterScore.midiChannel(event.channel())
                            if (port !== eventPort || channel !== eventChannel) {
                                continue
                            }

                            if (event.type() === ME_NOTEON) {
                                // use the note values instead of the event values if portamento is suppressed
                                if (!exportRPNs && event.portamento()) {
                                    track.insert(CompatMidiRender.tick(context, item.tick), new MidiEvent(ME_NOTEON, channel,
                                                                                                        event.note()!.pitch(),
                                                                                                        event.velo()))
                                } else {
                                    track.insert(CompatMidiRender.tick(context, item.tick), new MidiEvent(ME_NOTEON, channel,
                                                                                                        event.pitch(), event.velo()))
                                }
                            } else if (event.type() === ME_CONTROLLER) {
                                track.insert(CompatMidiRender.tick(context, item.tick), new MidiEvent(ME_CONTROLLER, channel,
                                                                                                    event.controller(),
                                                                                                    event.value()))
                            } else if (event.type() === ME_PITCHBEND) {
                                track.insert(CompatMidiRender.tick(context, item.tick), new MidiEvent(ME_PITCHBEND, channel,
                                                                                                    event.dataA(), event.dataB()))
                            }
                        }
                    }
                }
            }

            // Export lyrics and RehearsalMarks as Meta events
            for (const rs of this.m_score.repeatList()) {
                const endTick = rs.endTick()
                const tickOffset = rs.utick - rs.tick

                // export Lyrics
                const st = SegmentType.ChordRest
                for (let seg = rs.firstMeasure()!.first(st); seg && seg.tick().ticks() < endTick; seg = seg.next1(st)) {
                    for (let i = part.startTrack(); i < part.endTrack(); ++i) {
                        const cr = seg.element(i) as ChordRest | null
                        if (cr) {
                            for (const lyric of cr.lyrics()) {
                                const syllabic = lyric.syllabic()
                                let lyricText = lyric.plainText()
                                if ((syllabic === LyricsSyllabic.SINGLE || syllabic === LyricsSyllabic.END)
                                    && (lyricText.length === 0 || !lyricText.endsWith(' '))) {
                                    lyricText += ' '
                                }

                                const data = nullTerminatedUtf8(lyricText)

                                const ev = new MidiEvent()
                                ev.setType(ME_META)
                                ev.setMetaType(META_LYRIC)
                                ev.setEData(data)
                                ev.setLen(data.length)

                                const tick = cr.tick().ticks() + tickOffset
                                track.insert(CompatMidiRender.tick(context, tick), ev)
                            }
                        }
                    }
                }

                // export RehearsalMarks only for first track
                if (staffIdx === 0) {
                    for (let seg = rs.firstMeasure()!.first(CHORD_REST_OR_TIME_TICK_TYPE);
                        seg && seg.tick().ticks() < endTick;
                        seg = seg.next1(CHORD_REST_OR_TIME_TICK_TYPE)) {
                        for (const e of seg.annotations()) {
                            if (e.isRehearsalMark()) {
                                const r = e as RehearsalMark
                                const data = nullTerminatedUtf8(r.plainText())

                                const ev = new MidiEvent()
                                ev.setType(ME_META)
                                ev.setMetaType(META_MARKER)
                                ev.setEData(data)
                                ev.setLen(data.length)

                                const tick = r.segment()!.tick().ticks() + tickOffset
                                track.insert(CompatMidiRender.tick(context, tick), ev)
                            }
                        }
                    }
                }
            }
            ++staffIdx
        }
        return this.m_midiFile.write()
    }
}
