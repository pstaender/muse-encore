/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/noteevent.h/.cpp (the play events of a note; only kept for reading and writing here)
 */

export class NoteEvent {
    static readonly NOTE_LENGTH = 1000
    static readonly GHOST_VELOCITY_MULTIPLIER = 0.6
    static readonly DEFAULT_VELOCITY_MULTIPLIER = 1.0
    static readonly SLIDE_AMOUNT = 3

    private m_pitch = 0 // relative pitch to note pitch
    private m_ontime = 0 // one unit is 1/1000 of nominal note len
    private m_len = NoteEvent.NOTE_LENGTH // one unit is 1/1000 of nominal note len
    private m_velocityMultiplier = NoteEvent.DEFAULT_VELOCITY_MULTIPLIER // can be used to lower sound (0-1)
    private m_play = true // when 'false', note event is used only for length calculation
    private m_offset = 0
    private m_slide = false // event is slide or glissando

    constructor(a = 0, b = 0, c = NoteEvent.NOTE_LENGTH, d = 1.0, play = true, offset = 0) {
        this.m_pitch = a
        this.m_ontime = b
        this.m_len = c
        this.m_velocityMultiplier = d
        this.m_play = play
        this.m_offset = offset
    }

    clone(): NoteEvent {
        const e = new NoteEvent(this.m_pitch, this.m_ontime, this.m_len, this.m_velocityMultiplier, this.m_play, this.m_offset)
        e.m_slide = this.m_slide
        return e
    }

    pitch(): number { return this.m_pitch }
    ontime(): number { return this.m_ontime }
    offtime(): number { return this.m_ontime + this.m_len }
    len(): number { return this.m_len }
    velocityMultiplier(): number { return this.m_velocityMultiplier }
    play(): boolean { return this.m_play }
    offset(): number { return this.m_offset }
    slide(): boolean { return this.m_slide }
    setPitch(v: number): void { this.m_pitch = v }
    setOntime(v: number): void { this.m_ontime = v }
    setLen(v: number): void { this.m_len = v }
    setVelocityMultiplier(v: number): void { this.m_velocityMultiplier = v }
    setOffset(v: number): void { this.m_offset = v }
    setSlide(slide: boolean): void { this.m_slide = slide }
}
