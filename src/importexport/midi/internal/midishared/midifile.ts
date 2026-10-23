/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midishared/midifile.h/.cpp (writing)
 * The QIODevice is a growing byte buffer (MidiFile.write returns the bytes of the file).
 * TODO(port): reading (MidiFile::read, readTrack, readEvent), MidiTrack::mergeNoteOnOff and MidiFile::separateChannel
 * (MIDI import)
 */

import {
    CTRL_PRESS, CTRL_PROGRAM, ME_AFTERTOUCH, ME_CONTROLLER, ME_ENDSYSEX, ME_META, ME_NOTEOFF, ME_NOTEON, ME_PITCHBEND,
    ME_PROGRAM, ME_SYSEX,
} from '../../../../engraving/compat/midi/midicoreevent'
import type { MidiEvent } from './midievent'

interface MidiTrackEntry {
    tick: number
    event: MidiEvent
}

/** C++ std::multimap<int, MidiEvent>: kept in the order of the ticks, equal ticks in the order of insertion */
export class MidiTrack {
    private _events: MidiTrackEntry[] = []
    private _sorted = true
    private _outChannel = -1
    private _outPort = -1
    private _drumTrack = false

    empty(): boolean { return this._events.length === 0 }

    /** the events ordered by tick (stable: equal ticks in insertion order) */
    events(): readonly MidiTrackEntry[] {
        if (!this._sorted) {
            this._events.sort((a, b) => a.tick - b.tick)
            this._sorted = true
        }
        return this._events
    }

    outChannel(): number { return this._outChannel }
    setOutChannel(n: number): void {
        this._outChannel = n
        if (this._outChannel === 9) {
            this._drumTrack = true
        }
    }

    outPort(): number { return this._outPort }
    setOutPort(n: number): void { this._outPort = n }

    drumTrack(): boolean { return this._drumTrack }

    insert(tick: number, event: MidiEvent): void {
        const n = this._events.length
        if (n && this._events[n - 1].tick > tick) {
            this._sorted = false
        }
        this._events.push({ tick, event })
    }
}

/** the QIODevice of MidiFile::write: a growing buffer with a position */
class ByteBuffer {
    private m_data = new Uint8Array(1024)
    private m_size = 0
    private m_pos = 0

    pos(): number { return this.m_pos }
    seek(pos: number): void { this.m_pos = pos }

    putChar(c: number): void {
        if (this.m_pos >= this.m_data.length) {
            const d = new Uint8Array(this.m_data.length * 2)
            d.set(this.m_data)
            this.m_data = d
        }
        this.m_data[this.m_pos++] = c & 0xff
        this.m_size = Math.max(this.m_size, this.m_pos)
    }

    data(): Uint8Array { return this.m_data.slice(0, this.m_size) }
}

export class MidiFile {
    private fp = new ByteBuffer()
    private _tracks: MidiTrack[] = []
    private _division = 0
    private _isDivisionInTps = false // ticks per second, alternative - ticks per beat
    private _format = 1 // midi file format (0-2)
    private _noRunningStatus = false // do not use running status on output

    private status = 0 // running status

    tracks(): MidiTrack[] { return this._tracks }

    format(): number { return this._format }
    setFormat(fmt: number): void { this._format = fmt }

    division(): number { return this._division }
    isDivisionInTps(): boolean { return this._isDivisionInTps }
    setDivision(val: number): void { this._division = val }

    /** C++ write(QIODevice*) (returns true on error): the bytes of the file */
    write(): Uint8Array {
        this.fp = new ByteBuffer()
        this.writeBytes('MThd')
        this.writeLong(6) // header len
        this.writeShort(this._format) // format
        this.writeShort(this._tracks.length)
        this.writeShort(this._division)
        for (const t of this._tracks) {
            this.writeTrack(t)
        }
        return this.fp.data()
    }

    private writeEvent(event: MidiEvent): void {
        switch (event.type()) {
        case ME_NOTEON:
            this.writeStatus(ME_NOTEON, event.channel())
            this.put(event.pitch())
            this.put(event.velo())
            break

        case ME_NOTEOFF:
            this.writeStatus(ME_NOTEOFF, event.channel())
            this.put(event.pitch())
            this.put(event.velo())
            break

        case ME_PITCHBEND:
            this.writeStatus(ME_PITCHBEND, event.channel())
            this.put(event.dataA())
            this.put(event.dataB())
            break

        case ME_CONTROLLER:
            switch (event.controller()) {
            case CTRL_PROGRAM:
                this.writeStatus(ME_PROGRAM, event.channel())
                this.put(event.value() & 0x7f)
                break
            case CTRL_PRESS:
                this.writeStatus(ME_AFTERTOUCH, event.channel())
                this.put(event.value() & 0x7f)
                break
            default:
                this.writeStatus(ME_CONTROLLER, event.channel())
                this.put(event.controller())
                this.put(event.value() & 0x7f)
                break
            }
            break

        case ME_META:
            this.put(ME_META)
            this.put(event.metaType())
            // Don't null terminate text meta events
            if (event.metaType() >= 0x1 && event.metaType() <= 0x14) {
                this.putvl(event.len() - 1)
                this.writeBytes(event.edata(), event.len() - 1)
            } else {
                this.putvl(event.len())
                this.writeBytes(event.edata(), event.len())
            }
            this.resetRunningStatus() // really ?!
            break

        case ME_SYSEX:
            this.put(ME_SYSEX)
            this.putvl(event.len() + 1) // including 0xf7
            this.writeBytes(event.edata(), event.len())
            this.put(ME_ENDSYSEX)
            this.resetRunningStatus()
            break
        }
    }

    private writeTrack(t: MidiTrack): boolean {
        this.writeBytes('MTrk')
        const lenpos = this.fp.pos()
        this.writeLong(0) // dummy len

        this.status = -1
        let tick = 0
        for (const i of t.events()) {
            const ntick = i.tick
            this.putvl(ntick - tick) // write tick delta
            //
            // if track channel != -1, then use this
            //    channel for all events in this track
            //
            if (t.outChannel() !== -1) {
                this.writeEvent(i.event)
            }
            tick = ntick
        }

        //---------------------------------------------------
        //    write "End Of Track" Meta
        //    write Track Len
        //

        this.putvl(1)
        this.put(0xff) // Meta
        this.put(0x2f) // EOT
        this.putvl(0) // len 0
        const endpos = this.fp.pos()
        this.fp.seek(lenpos)
        this.writeLong(endpos - lenpos - 4) // tracklen
        this.fp.seek(endpos)
        return false
    }

    private writeStatus(nstat: number, c: number): void {
        nstat |= (c & 0xf)
        //
        //  running status; except for Sysex- and Meta Events
        //
        if (this._noRunningStatus || (((nstat & 0xf0) !== 0xf0) && (nstat !== this.status))) {
            this.status = nstat
            this.put(nstat)
        }
    }

    private resetRunningStatus(): void { this.status = -1 }

    /** C++ write(const void*, qint64): len bytes of the data (a string: its characters) */
    private writeBytes(p: Uint8Array | string, len = p.length): void {
        for (let i = 0; i < len; ++i) {
            this.fp.putChar(typeof p === 'string' ? p.charCodeAt(i) : (p[i] ?? 0))
        }
    }

    private writeShort(i: number): void {
        this.fp.putChar(i >> 8)
        this.fp.putChar(i)
    }

    private writeLong(i: number): void {
        this.fp.putChar(i >> 24)
        this.fp.putChar(i >> 16)
        this.fp.putChar(i >> 8)
        this.fp.putChar(i)
    }

    /** Write variable-length number (7 bits per byte, MSB first) */
    private putvl(val: number): void {
        val = val >>> 0
        const bytes: number[] = [val & 0x7f]
        while ((val >>>= 7) > 0) {
            bytes.push(0x80 | (val & 0x7f))
        }
        for (let i = bytes.length - 1; i >= 0; --i) {
            this.put(bytes[i])
        }
    }

    private put(c: number): void { this.fp.putChar(c) }
}
