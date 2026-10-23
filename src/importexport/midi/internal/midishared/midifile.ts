/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midishared/midifile.h/.cpp
 * The QIODevice is a growing byte buffer (MidiFile.write returns the bytes of the file) or, for reading, the bytes of
 * the file (MidiFile.read(data)). C++ throws a QString on bad files, here a MidiFileError.
 */

import {
    CTRL_HBANK, CTRL_HDATA, CTRL_HNRPN, CTRL_HRPN, CTRL_LBANK, CTRL_LDATA, CTRL_LNRPN, CTRL_LRPN, CTRL_POLYAFTER,
    CTRL_PRESS, CTRL_PROGRAM, ME_AFTERTOUCH, ME_CONTROLLER, ME_ENDSYSEX, ME_INVALID, ME_META, ME_NOTE, ME_NOTEOFF,
    ME_NOTEON, ME_PITCHBEND, ME_POLYAFTER, ME_PROGRAM, ME_SYSEX, META_EOT,
} from '../../../../engraving/compat/midi/midicoreevent'
import { MidiEvent } from './midievent'

/** the error of MidiFile.read (C++ throws a QString) */
export class MidiFileError extends Error {}

export interface MidiTrackEntry {
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

    /** a copy of the track (C++ copy constructor; the events are copied) */
    clone(): MidiTrack {
        const t = new MidiTrack()
        t._events = this.events().map(e => ({ tick: e.tick, event: e.event.clone() }))
        t._outChannel = this._outChannel
        t._outPort = this._outPort
        t._drumTrack = this._drumTrack
        return t
    }

    //---------------------------------------------------------
    //   mergeNoteOnOffAndFindMidiType
    //    - find matching note on / note off events and merge
    //      into a note event with tick duration
    //---------------------------------------------------------

    mergeNoteOnOff(): void {
        const el = new MidiTrack()

        let hbank = 0xff
        let lbank = 0xff
        let rpnh = -1
        let rpnl = -1
        let datah = 0
        let datal = 0
        let dataType = 0 // 0 : disabled, 0x20000 : rpn, 0x30000 : nrpn;

        const events = this.events()
        for (let i = 0; i < events.length; ++i) {
            const ev = events[i].event
            if (ev.type() === ME_INVALID) {
                continue
            }
            if ((ev.type() !== ME_NOTEON) && (ev.type() !== ME_NOTEOFF)) {
                if (ev.type() === ME_CONTROLLER) {
                    const val = ev.value()
                    const cn = ev.controller()
                    if (cn === CTRL_HBANK) {
                        hbank = val
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_LBANK) {
                        lbank = val
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_HDATA) {
                        datah = val

                        // check if a CTRL_LDATA follows
                        // e.g. wie have a 14 bit controller:
                        let found = false
                        for (let ii = i + 1; ii < events.length; ++ii) {
                            const ev1 = events[ii].event
                            if (ev1.type() === ME_CONTROLLER) {
                                if (ev1.controller() === CTRL_LDATA) {
                                    // handle later
                                    found = true
                                }
                                break
                            }
                        }
                        if (!found) {
                            if (rpnh === -1 || rpnl === -1) {
                                ev.setType(ME_INVALID)
                                continue
                            } else {
                                ev.setController(dataType | (rpnh << 8) | rpnl)
                                ev.setValue(datah)
                            }
                        } else {
                            ev.setType(ME_INVALID)
                            continue
                        }
                    } else if (cn === CTRL_LDATA) {
                        datal = val

                        if (rpnh === -1 || rpnl === -1) {
                            continue
                        }
                        // assume that the sequence is always
                        //    CTRL_HDATA - CTRL_LDATA
                        // eg. that LDATA is always send last

                        // 14 Bit RPN/NRPN
                        ev.setController((dataType + 0x30000) | (rpnh << 8) | rpnl)
                        ev.setValue((datah << 7) | datal)
                    } else if (cn === CTRL_HRPN) {
                        rpnh = val
                        dataType = 0x20000
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_LRPN) {
                        rpnl = val
                        dataType = 0x20000
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_HNRPN) {
                        rpnh = val
                        dataType = 0x30000
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_LNRPN) {
                        rpnl = val
                        dataType = 0x30000
                        ev.setType(ME_INVALID)
                        continue
                    } else if (cn === CTRL_PROGRAM) {
                        ev.setValue((hbank << 16) | (lbank << 8) | ev.value())
                        // TODO el.insert(ev);
                        ev.setType(ME_INVALID)
                        continue
                    }
                } else if (ev.type() === ME_SYSEX) {
                    const len = ev.len()
                    const buffer = ev.edata()
                    // Yamaha
                    if (buffer[0] === 0x43) {
                        const type = buffer[1] & 0xf0
                        if (type === 0x10) {
                            if (len === 7 && buffer[2] === 0x4c && buffer[3] === 0x08 && buffer[5] === 7) {
                                // part mode
                                // 0 - normal
                                // 1 - DRUM
                                // 2 - DRUM 1
                                // 3 - DRUM 2
                                // 4 - DRUM 3
                                // 5 - DRUM 4
                                if (buffer[6] !== 0 && buffer[4] === ev.channel()) {
                                    this._drumTrack = true
                                }
                                ev.setType(ME_INVALID)
                                continue
                            }
                        }
                    }
                }
                el.insert(events[i].tick, ev.clone())
                ev.setType(ME_INVALID)
                continue
            }
            const tick = events[i].tick
            if (ev.type() === ME_NOTEOFF || ev.velo() === 0) {
                ev.setType(ME_INVALID)
                continue
            }
            const note = new MidiEvent(ME_NOTE, ev.channel(), ev.dataA(), ev.dataB())

            let k = i + 1
            for (; k < events.length; ++k) {
                const e = events[k].event
                if (e.type() !== ME_NOTEON && e.type() !== ME_NOTEOFF) {
                    continue
                }
                if ((e.type() === ME_NOTEOFF || (e.type() === ME_NOTEON && e.velo() === 0))
                    && (e.pitch() === note.pitch())) {
                    let t = events[k].tick - tick
                    if (t <= 0) {
                        t = 1
                    }
                    note.setLen(t)
                    e.setType(ME_INVALID)
                    break
                }
            }
            if (k === events.length) {
                // no note-off for the note
                note.setLen(1)
            }
            el.insert(tick, note)
            ev.setType(ME_INVALID)
        }
        this._events = el.events().slice()
        this._sorted = true
    }

    /** erases the event at index i of events() (C++ events().erase(it)) */
    eraseEventAt(i: number): void {
        this.events()
        this._events.splice(i, 1)
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

    // values used during read()
    private sstatus = 0 // running status (not reset after meta or sysex events)
    private click = 0 // current tick position in file
    private curPos = 0 // current file byte position
    private inData: Uint8Array = new Uint8Array(0)

    tracks(): MidiTrack[] { return this._tracks }

    format(): number { return this._format }
    setFormat(fmt: number): void { this._format = fmt }

    division(): number { return this._division }
    isDivisionInTps(): boolean { return this._isDivisionInTps }
    setDivision(val: number): void { this._division = val }

    //---------------------------------------------------------
    //   read
    //    return false on error; throws a MidiFileError on bad files
    //---------------------------------------------------------

    read(data: Uint8Array): boolean {
        this.inData = data
        this.m_readPos = 0
        this._tracks = []
        this.curPos = 0

        // === Read header_chunk = "MThd" + <header_length> + <format> + <n> + <division>
        const tmp = this.readBytes(4)
        const len = this.readLong()
        if (String.fromCharCode(...tmp) !== 'MThd' || len < 6) {
            throw new MidiFileError('bad midifile: MThd expected')
        }

        if (len > 6) {
            throw new MidiFileError(`unsupported MIDI header data size: ${len} instead of 6`)
        }

        this._format = this.readShort()
        const ntracks = this.readShort()

        // ================ Read MIDI division =================
        //
        //                        2 bytes
        //  +-------+---+-------------------+-----------------+
        //  |  bit  |15 | 14              8 | 7             0 |
        //  +-------+---+-------------------------------------+
        //  |       | 0 |       ticks per quarter note        |
        //  | value +---+-------------------------------------+
        //  |       | 1 |  -frames/second   |   ticks/frame   |
        //  +-------+---+-------------------+-----------------+

        // C++ QIODevice::getChar into a (signed) char
        const firstByte = (this.getChar() << 24) >> 24
        const secondByte = (this.getChar() << 24) >> 24
        const topBit = (firstByte & 0x80) >> 7

        if (topBit === 0) { // ticks per beat
            this._isDivisionInTps = false
            this._division = (firstByte << 8) | (secondByte & 0xff)
        } else { // ticks per second = fps * ticks per frame
            this._isDivisionInTps = true
            const framesPerSecond = -firstByte
            const ticksPerFrame = secondByte
            if (framesPerSecond === 29) {
                this._division = Math.round(29.97 * ticksPerFrame)
            } else {
                this._division = framesPerSecond * ticksPerFrame
            }
        }

        // =====================================================

        switch (this._format) {
        case 0:
            if (this.readTrack()) {
                return false
            }
            break
        case 1:
            for (let i = 0; i < ntracks; i++) {
                if (this.readTrack()) {
                    return false
                }
            }
            break
        default:
            throw new MidiFileError(`midi file format ${this._format} not implemented`)
        }
        return true
    }

    //---------------------------------------------------------
    //   readTrack
    //    return true on error
    //---------------------------------------------------------

    private readTrack(): boolean {
        const tmp = this.readBytes(4)
        if (String.fromCharCode(...tmp) !== 'MTrk') {
            throw new MidiFileError('bad midifile: MTrk expected')
        }
        const len = this.readLong() // len
        const endPos = this.curPos + len
        this.status = -1
        this.sstatus = -1 // running status, will not be reset on meta or sysex
        this.click = 0
        const track = new MidiTrack()
        this._tracks.push(track)

        const port = 0
        track.setOutPort(port)
        track.setOutChannel(-1)

        for (;;) {
            const event = new MidiEvent()
            if (!this.readEvent(event)) {
                return true
            }

            // check for end of track:
            if ((event.type() === ME_META) && (event.metaType() === META_EOT)) {
                break
            }
            track.insert(this.click, event)
        }
        if (this.curPos !== endPos) {
            console.warn(`bad track len: ${endPos} != ${this.curPos}, ${endPos - this.curPos} bytes too much`)
            if (this.curPos < endPos) {
                // fp->skip(endPos - curPos): skips the device position, not curPos
                this.skip(endPos - this.curPos)
            }
        }
        return false
    }

    /** C++ read(void*, qint64): throws on EOF */
    private readBytes(len: number): Uint8Array {
        this.curPos += len
        if (this.m_readPos + len > this.inData.length) {
            this.m_readPos = this.inData.length
            throw new MidiFileError('bad midifile: unexpected EOF')
        }
        const d = this.inData.subarray(this.m_readPos, this.m_readPos + len)
        this.m_readPos += len
        return d
    }

    private m_readPos = 0

    /** QIODevice::getChar (does not advance curPos; 0 at the end of the data) */
    private getChar(): number {
        if (this.m_readPos >= this.inData.length) {
            return 0
        }
        return this.inData[this.m_readPos++]
    }

    private skip(n: number): void {
        this.m_readPos = Math.min(this.inData.length, this.m_readPos + n)
    }

    private readShort(): number {
        let val = 0
        for (let i = 0; i < 2; ++i) {
            val <<= 8
            val += this.getChar() & 0xff
        }
        return val
    }

    private readLong(): number {
        let val = 0
        for (let i = 0; i < 4; ++i) {
            val <<= 8
            val += this.getChar() & 0xff
        }
        return val | 0
    }

    /** Read variable-length number (7 bits per byte, MSB first) */
    private getvl(): number {
        let l = 0
        for (let i = 0; i < 16; i++) {
            const c = this.readBytes(1)[0]
            l += (c & 0x7f)
            if (!(c & 0x80)) {
                return l | 0
            }
            l = (l << 7) | 0
        }
        return -1
    }

    //---------------------------------------------------------
    //   readEvent
    //    return true on success
    //---------------------------------------------------------

    private readEvent(event: MidiEvent): boolean {
        let me: number
        let a: number
        let b: number

        const nclick = this.getvl()
        if (nclick === -1) {
            return false
        }
        this.click += nclick
        for (;;) {
            me = this.readBytes(1)[0]
            if (me >= 0xf1 && me <= 0xfe && me !== 0xf7) {
                // MIDI: Unknown Message
            } else {
                break
            }
        }

        let dataLen: number

        if (me === 0xf0 || me === 0xf7) {
            this.status = -1 // no running status
            const len = this.getvl()
            if (len < 1) {
                return false
            }
            dataLen = len
            const data = new Uint8Array(len + 1)
            data.set(this.readBytes(len))
            if (data[len - 1] !== 0xf7) {
                // SYSEX does not end with 0xf7!
                // more to come?
            } else {
                dataLen-- // don't count 0xf7
            }
            event.setType(ME_SYSEX)
            event.setEData(data)
            event.setLen(dataLen)
            return true
        }

        if (me === ME_META) {
            this.status = -1 // no running status
            const type = this.readBytes(1)[0]
            dataLen = this.getvl() // read len
            if (dataLen === -1) {
                return false
            }
            const data = new Uint8Array(dataLen + 1)
            if (dataLen) {
                data.set(this.readBytes(dataLen))
            }

            event.setType(ME_META)
            event.setMetaType(type)
            event.setLen(dataLen)
            event.setEData(data)
            return true
        }

        if (me & 0x80) { // status byte
            this.status = me
            this.sstatus = this.status
            a = this.readBytes(1)[0]
        } else {
            if (this.status === -1) {
                if (this.sstatus === -1) {
                    return false
                }
                this.status = this.sstatus
            }
            a = me
        }
        const channel = this.status & 0x0f
        b = 0
        switch (this.status & 0xf0) {
        case ME_NOTEOFF:
        case ME_NOTEON:
        case ME_POLYAFTER:
        case ME_CONTROLLER: // controller
        case ME_PITCHBEND: // pitch bend
            b = this.readBytes(1)[0]
            break
        }
        event.setType(this.status & 0xf0)
        event.setChannel(channel)
        switch (this.status & 0xf0) {
        case ME_NOTEOFF:
            event.setDataA(a & 0x7f)
            event.setDataB(b & 0x7f)
            break
        case ME_NOTEON:
            event.setDataA(a & 0x7f)
            event.setDataB(b & 0x7f)
            break
        case ME_POLYAFTER:
            event.setType(ME_CONTROLLER)
            event.setController(CTRL_POLYAFTER)
            event.setValue(((a & 0x7f) << 8) + (b & 0x7f))
            break
        case ME_CONTROLLER: // controller
            event.setController(a & 0x7f)
            event.setValue(b & 0x7f)
            break
        case ME_PITCHBEND: // pitch bend
            event.setDataA(a & 0x7f)
            event.setDataB(b & 0x7f)
            break
        case ME_PROGRAM:
            event.setValue(a & 0x7f)
            break
        case ME_AFTERTOUCH:
            event.setType(ME_CONTROLLER)
            event.setController(CTRL_PRESS)
            event.setValue(a & 0x7f)
            break
        default: // f1 f2 f3 f4 f5 f6 f7 f8 f9
            return false
        }

        if ((a & 0x80) || (b & 0x80)) {
            if (b & 0x80) {
                // Try to fix: interpret as channel byte
                this.status = b
                this.sstatus = this.status
                return true
            }
            return false
        }
        return true
    }

    //---------------------------------------------------------
    //   separateChannel
    //    if a track contains events for different midi channels,
    //    then split events into separate tracks
    //---------------------------------------------------------

    separateChannel(): void {
        for (let i = 0; i < this._tracks.length; ++i) {
            // create a list of channels used in current track
            const channel: number[] = []
            const midiTrack = this._tracks[i] // current track
            for (const ie of midiTrack.events()) {
                const e = ie.event
                if (e.isChannelEvent() && !channel.includes(e.channel())) {
                    channel.push(e.channel())
                }
            }
            midiTrack.setOutChannel(channel.length === 0 ? 0 : channel[0])
            const nn = channel.length
            if (nn <= 1) {
                continue
            }
            channel.sort((x, y) => x - y)
            // -- split --
            // insert additional tracks, assign to them found channels
            for (let ii = 1; ii < nn; ++ii) {
                const t = new MidiTrack()
                t.setOutChannel(channel[ii])
                this._tracks.splice(i + ii, 0, t)
            }

            // extract all different channel events from current track to inserted tracks
            const events = midiTrack.events()
            for (let ie = 0; ie < events.length;) {
                const e = events[ie].event
                if (e.isChannelEvent()) {
                    const ch = e.channel()
                    const idx = channel.indexOf(ch)
                    const t = this._tracks[i + idx]
                    if (t !== midiTrack) {
                        t.insert(events[ie].tick, e)
                        midiTrack.eraseEventAt(ie)
                        continue
                    }
                }
                ++ie
            }
            i += nn - 1
        }
    }

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
