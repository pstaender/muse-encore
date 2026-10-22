/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/midicoreevent.h
 * The C++ uint8_t data members wrap like bytes (setDataA(v) stores v & 0xff).
 */

export class PitchWheelSpecs {
    /** amplitude of the pitch wheel in semitones */
    mAmplitude = 12
    /** absolute limit of the  wheel pitch value (thus, pitch shift can be set using values from {-mLimit, mLimit} interval */
    mLimit = 8192
    /** step of pith wheel in ticks */
    mStep = 10
}

// EventType
export const ME_INVALID = 0
export const ME_NOTEOFF = 0x80
export const ME_NOTEON = 0x90
export const ME_POLYAFTER = 0xa0
export const ME_CONTROLLER = 0xb0 // Control change message
export const ME_PROGRAM = 0xc0 // Program change message
export const ME_AFTERTOUCH = 0xd0 // Channel pressure message
export const ME_PITCHBEND = 0xe0
export const ME_SYSEX = 0xf0
export const ME_META = 0xff
export const ME_SONGPOS = 0xf2
export const ME_ENDSYSEX = 0xf7
export const ME_CLOCK = 0xf8
export const ME_START = 0xfa
export const ME_CONTINUE = 0xfb
export const ME_STOP = 0xfc
export const ME_SENSE = 0xfe // active sense (used by yamaha)

export const ME_NOTE = 0x1
export const ME_CHORD = 0x2
export const ME_TICK1 = 0x3 // metronome tick akzent
export const ME_TICK2 = 0x4 // metronome tick
export const ME_EOT = 0x5

// meta events
export const META_SEQUENCE_NUMBER = 0
export const META_TEXT = 1
export const META_COPYRIGHT = 2
export const META_TRACK_NAME = 3
export const META_INSTRUMENT_NAME = 4
export const META_LYRIC = 5
export const META_MARKER = 6
export const META_CUE_POINT = 7
export const META_PROGRAM_NAME = 8
export const META_DEVICE_NAME = 9
export const META_TRACK_COMMENT = 0xf
export const META_TITLE = 0x10 // mscore extension
export const META_SUBTITLE = 0x11 // mscore extension
export const META_COMPOSER = 0x12 // mscore extension
export const META_TRANSLATOR = 0x13 // mscore extension
export const META_POET = 0x14 // mscore extension
export const META_PORT_CHANGE = 0x21
export const META_CHANNEL_PREFIX = 0x22
export const META_EOT = 0x2f // end of track
export const META_TEMPO = 0x51
export const META_TIME_SIGNATURE = 0x58
export const META_KEY_SIGNATURE = 0x59
export const META_SPECIFIC = 0x7F // sequencer specific

// controller types (CntrType)
export const CTRL_HBANK = 0x00
export const CTRL_LBANK = 0x20
export const CTRL_HDATA = 0x06
export const CTRL_LDATA = 0x26
export const CTRL_HNRPN = 0x63
export const CTRL_LNRPN = 0x62
export const CTRL_HRPN = 0x65
export const CTRL_LRPN = 0x64
export const CTRL_MODULATION = 0x01
export const CTRL_BREATH = 0x02
export const CTRL_FOOT = 0x04
export const CTRL_PORTAMENTO_TIME_MSB = 0x05
export const CTRL_VOLUME = 0x07
export const CTRL_PANPOT = 0x0a
export const CTRL_EXPRESSION = 0x0b
export const CTRL_PORTAMENTO_TIME_LSB = 0x25
export const CTRL_SUSTAIN = 0x40
export const CTRL_PORTAMENTO = 0x41
export const CTRL_SOSTENUTO = 0x42
export const CTRL_SOFT_PEDAL = 0x43
export const CTRL_HARMONIC_CONTENT = 0x47
export const CTRL_RELEASE_TIME = 0x48
export const CTRL_ATTACK_TIME = 0x49
export const CTRL_BRIGHTNESS = 0x4a
export const CTRL_PORTAMENTO_CONTROL = 0x54
export const CTRL_REVERB_SEND = 0x5b
export const CTRL_CHORUS_SEND = 0x5d
export const CTRL_VARIATION_SEND = 0x5e
export const CTRL_ALL_SOUNDS_OFF = 0x78 // 120
export const CTRL_RESET_ALL_CTRL = 0x79 // 121
export const CTRL_LOCAL_OFF = 0x7a // 122
export const CTRL_ALL_NOTES_OFF = 0x7b // 123
// special midi events are mapped to internal controller
export const CTRL_PROGRAM = 0x81
export const CTRL_PRESS = 0x83
export const CTRL_POLYAFTER = 0x84

const u8 = (v: number): number => v & 0xff

export class MidiCoreEvent {
    protected _type = 0
    protected _channel = 0
    protected _a = 0
    protected _b = 0

    constructor(t = ME_INVALID, c = 0, a = 0, b = 0) {
        this._type = u8(t)
        this._channel = u8(c)
        this._a = u8(a)
        this._b = u8(b)
    }

    set(t: number, c: number, a: number, b: number): void {
        this._type = u8(t)
        this._channel = u8(c)
        this._a = u8(a)
        this._b = u8(b)
    }

    type(): number { return this._type }
    setType(t: number): void { this._type = u8(t) }
    channel(): number { return this._channel }
    setChannel(c: number): void { this._channel = u8(c) }

    dataA(): number { return this._a }
    pitch(): number { return this._a }
    controller(): number { return this._a }

    setDataA(v: number): void { this._a = u8(v) }
    setPitch(v: number): void { this._a = u8(v) }
    setController(v: number): void { this._a = u8(v) }

    dataB(): number { return this._b }
    velo(): number { return this._b }
    value(): number { return this._b }

    setDataB(v: number): void { this._b = u8(v) }
    setVelo(v: number): void { this._b = u8(v) }
    setValue(v: number): void { this._b = u8(v) }

    /** C++ setData(int a, int b) and setData(int t, int a, int b) */
    setData(t: number, a: number, b?: number): void {
        if (b === undefined) {
            this._a = u8(t)
            this._b = u8(a)
            return
        }
        this._type = u8(t)
        this._a = u8(a)
        this._b = u8(b)
    }

    isChannelEvent(): boolean {
        switch (this._type) {
        case ME_NOTEOFF:
        case ME_NOTEON:
        case ME_POLYAFTER:
        case ME_CONTROLLER:
        case ME_PROGRAM:
        case ME_AFTERTOUCH:
        case ME_PITCHBEND:
        case ME_NOTE:
        case ME_CHORD:
            return true
        default:
            break
        }
        return false
    }

    equals(e: MidiCoreEvent): boolean {
        return e._type === this._type && e._channel === this._channel && e._a === this._a && e._b === this._b
    }

    clone(): MidiCoreEvent { return new MidiCoreEvent(this._type, this._channel, this._a, this._b) }

    /** the bytes of the MIDI message as a little endian 32 bit number */
    toPackage(): number {
        const b: number[] = [0, 0, 0, 0]
        switch (this.type()) {
        case ME_NOTEOFF:
            b[0] = 0x80 | this.channel()
            b[1] = this.pitch()
            break
        case ME_NOTEON:
            b[0] = 0x90 | this.channel()
            b[1] = this.pitch()
            b[2] = this.velo()
            break
        case ME_CONTROLLER:
            b[0] = 0xB0 | this.channel()
            b[1] = this.controller()
            b[2] = this.value()
            break
        case ME_PROGRAM:
            b[0] = 0xC0 | this.channel()
            b[1] = this.value()
            break
        case ME_PITCHBEND:
            b[0] = 0xE0 | this.channel()
            b[1] = this.pitch() & 0x7F
            b[2] = this.pitch() >> 7
            break
        default:
            break
        }
        return ((b[0] & 0xff) | ((b[1] & 0xff) << 8) | ((b[2] & 0xff) << 16) | ((b[3] & 0xff) << 24)) >>> 0
    }
}
