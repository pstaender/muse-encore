/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/engraving/compat/midi/midicoreevent.h that the instrument data (read/write) needs
 */

// event types
export const ME_INVALID = 0
export const ME_NOTEOFF = 0x80
export const ME_NOTEON = 0x90
export const ME_CONTROLLER = 0xb0

// controller types
export const CTRL_HBANK = 0x00
export const CTRL_LBANK = 0x20
export const CTRL_VOLUME = 0x07
export const CTRL_PANPOT = 0x0a
export const CTRL_REVERB_SEND = 0x5b
export const CTRL_CHORUS_SEND = 0x5d
// special midi events
export const CTRL_PROGRAM = 0x81

export class MidiCoreEvent {
    constructor(private m_type = ME_INVALID, private m_channel = 0, private m_a = 0, private m_b = 0) {}

    type(): number { return this.m_type }
    setType(t: number): void { this.m_type = t }
    channel(): number { return this.m_channel }
    setChannel(c: number): void { this.m_channel = c }
    dataA(): number { return this.m_a }
    setDataA(v: number): void { this.m_a = v }
    dataB(): number { return this.m_b }
    setDataB(v: number): void { this.m_b = v }
    setData(t: number, a: number, b: number): void {
        this.m_type = t
        this.m_a = a
        this.m_b = b
    }

    pitch(): number { return this.m_a }
    velo(): number { return this.m_b }
    controller(): number { return this.m_a }
    value(): number { return this.m_b }

    clone(): MidiCoreEvent { return new MidiCoreEvent(this.m_type, this.m_channel, this.m_a, this.m_b) }
    equals(e: MidiCoreEvent): boolean {
        return e.m_type === this.m_type && e.m_channel === this.m_channel && e.m_a === this.m_a && e.m_b === this.m_b
    }
}
