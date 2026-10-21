/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/glissando.h/.cpp
 *
 * TODO(port): guessInitialNote (1.x/2.0 files)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, FontStyle, GlissandoStyle, GlissandoType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { LineSegment, SLine } from './line'
import { Pid } from './property'
import { SpannerAnchor } from './spanner'
import type { System } from './system'
import type { Spanner } from './spanner'
import type { Note } from './note'
import { PITCH_DELTA_OCTAVE, TPC_DELTA_ENHARMONIC, Tpc, tpc2pitch } from './pitchspelling'
import { chromaticPitchSteps } from './utils'

const glissandoElementStyle: ElementStyle = [
    { sid: Sid.glissandoFontFace, pid: Pid.FONT_FACE },
    { sid: Sid.glissandoFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.glissandoFontStyle, pid: Pid.FONT_STYLE },
    { sid: Sid.glissandoLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.glissandoShowText, pid: Pid.GLISS_SHOW_TEXT },
    { sid: Sid.glissandoText, pid: Pid.GLISS_TEXT },
    { sid: Sid.glissandoStyle, pid: Pid.GLISS_STYLE },
    { sid: Sid.glissandoLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.glissandoDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.glissandoDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.glissandoType, pid: Pid.GLISS_TYPE },
]

export class GlissandoSegment extends LineSegment {
    constructor(sp: Glissando | null, parent: System | null) {
        super(ElementType.GLISSANDO_SEGMENT, sp, parent, ElementFlag.MOVABLE)
    }

    glissando(): Glissando { return this.spanner() as Glissando }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        switch (pid) {
        case Pid.GLISS_TYPE:
        case Pid.GLISS_TEXT:
        case Pid.GLISS_SHOW_TEXT:
        case Pid.GLISS_STYLE:
        case Pid.GLISS_SHIFT:
        case Pid.GLISS_EASEIN:
        case Pid.GLISS_EASEOUT:
        case Pid.FONT_FACE:
        case Pid.FONT_SIZE:
        case Pid.FONT_STYLE:
        case Pid.LINE_WIDTH:
            return this.glissando()
        default:
            return super.propertyDelegate(pid)
        }
    }
}

export class Glissando extends SLine {
    static readonly GLISS_PALETTE_WIDTH = 4.0
    static readonly GLISS_PALETTE_HEIGHT = 4.0

    private m_text = ''
    private m_glissandoType = GlissandoType.STRAIGHT
    private m_glissandoStyle = GlissandoStyle.CHROMATIC
    private m_glissandoShift = false
    private m_fontFace = ''
    private m_fontSize = 0
    private m_showText = true
    private m_fontStyle = FontStyle.Normal
    private m_easeIn = 0
    private m_easeOut = 0
    private m_isHarpGliss: boolean | null = null

    constructor(parent: EngravingObject | null) {
        super(ElementType.GLISSANDO, parent, ElementFlag.MOVABLE)
        this.initElementStyle(glissandoElementStyle)

        for (const pid of [Pid.GLISS_SHIFT, Pid.GLISS_EASEIN, Pid.GLISS_EASEOUT, Pid.DIAGONAL, Pid.ANCHOR]) {
            this.resetProperty(pid)
        }
    }

    text(): string { return this.m_text }
    setText(v: string): void { this.m_text = v }
    glissandoType(): GlissandoType { return this.m_glissandoType }
    setGlissandoType(v: GlissandoType): void { this.m_glissandoType = v }
    glissandoStyle(): GlissandoStyle { return this.m_glissandoStyle }

    /**
     * C++ Glissando::pitchSteps: the pitch offsets (from the start note) of the notes played by the glissando;
     * returns false if the glissando is not played note by note
     */
    static pitchSteps(spanner: Spanner, pitchOffsets: number[]): boolean {
        if (!spanner.endElement()!.isNote()) {
            return false
        }
        const glissando = spanner as unknown as Glissando
        if (!glissando.playSpanner()) {
            return false
        }
        const glissandoStyle = glissando.glissandoStyle()
        if (glissandoStyle === GlissandoStyle.PORTAMENTO) {
            return false
        }
        // only consider glissando connected to NOTE.
        const noteStart = spanner.startElement() as unknown as Note
        const noteEnd = spanner.endElement() as unknown as Note
        const pitchStart = noteStart.ppitch()
        const pitchEnd = noteEnd.ppitch()
        if (pitchEnd === pitchStart) {
            return false
        }
        const direction = pitchEnd > pitchStart ? 1 : -1
        pitchOffsets.length = 0
        if (glissandoStyle === GlissandoStyle.DIATONIC) {
            // Obey harp pedal diagrams if on a harp staff
            if (glissando.isHarpGliss() ?? false) {
                const hd = spanner.part()!.currentHarpDiagram(spanner.tick())
                const playableTpcs: ReadonlySet<number> = hd ? hd.playableTpcs() : new Set([14, 16, 18, 13, 15, 17, 19])
                const playablePitches: number[] = []
                for (const t of [...playableTpcs].sort((a, b) => a - b)) {
                    playablePitches.push(tpc2pitch(t) % PITCH_DELTA_OCTAVE)
                }

                // Push starting note, then check for enharmonic on the next string.  If there is an enharmonic, 0 will be pushed back twice
                pitchOffsets.push(0)
                let en = noteStart.tpc() + TPC_DELTA_ENHARMONIC * -direction
                // Harp pedalling will only have 1 flat or sharp
                if (en >= Tpc.TPC_F_B && en <= Tpc.TPC_B_S && playableTpcs.has(en)) {
                    pitchOffsets.push(0)
                }

                for (let p = pitchStart + direction; p !== pitchEnd; p += direction) {
                    // Count times pitch occurs in harp pedalling - this accounts for enharmonics
                    const pitchOccurrences = playablePitches.filter(pp => pp === p % PITCH_DELTA_OCTAVE).length
                    for (let k = 0; k < pitchOccurrences; ++k) {
                        pitchOffsets.push(p - pitchStart)
                    }
                }

                // Check for enharmonic at end, in correct direction
                en = noteEnd.tpc() + TPC_DELTA_ENHARMONIC * direction
                if (en >= Tpc.TPC_F_B && en <= Tpc.TPC_B_S && playableTpcs.has(en)) {
                    pitchOffsets.push(pitchEnd - pitchStart)
                }

                return pitchOffsets.length > 0
            }

            // Regular diatonic mode
            const lineStart = noteStart.line()
            // scale obeying accidentals
            for (let line = lineStart, pitch = pitchStart; (direction === 1) ? (pitch < pitchEnd) : (pitch > pitchEnd); line -= direction) {
                const halfSteps = chromaticPitchSteps(noteStart, noteEnd, lineStart - line)
                pitch = pitchStart + halfSteps
                if ((direction === 1) ? (pitch < pitchEnd) : (pitch > pitchEnd)) {
                    pitchOffsets.push(halfSteps)
                }
            }
            return pitchOffsets.length > 0
        }
        if (glissandoStyle === GlissandoStyle.CHROMATIC) {
            for (let pitch = pitchStart; pitch !== pitchEnd; pitch += direction) {
                pitchOffsets.push(pitch - pitchStart)
            }
            return true
        }
        const whiteNotes = [true, false, true, false, true, true, false, true, false, true, false, true]
        const Cnote = 60 // pitch of middle C
        const notePick = glissandoStyle === GlissandoStyle.WHITE_KEYS
        for (let pitch = pitchStart; pitch !== pitchEnd; pitch += direction) {
            const idx = ((pitch - Cnote) + 1200) % 12
            if (whiteNotes[idx] === notePick) {
                pitchOffsets.push(pitch - pitchStart)
            }
        }
        return true
    }
    setGlissandoStyle(v: GlissandoStyle): void { this.m_glissandoStyle = v }
    glissandoShift(): boolean { return this.m_glissandoShift }
    setGlissandoShift(v: boolean): void { this.m_glissandoShift = v }
    fontFace(): string { return this.m_fontFace }
    setFontFace(v: string): void { this.m_fontFace = v }
    fontSize(): number { return this.m_fontSize }
    setFontSize(v: number): void { this.m_fontSize = v }
    showText(): boolean { return this.m_showText }
    setShowText(v: boolean): void { this.m_showText = v }
    fontStyle(): FontStyle { return this.m_fontStyle }
    setFontStyle(v: FontStyle): void { this.m_fontStyle = v }
    easeIn(): number { return this.m_easeIn }
    setEaseIn(v: number): void { this.m_easeIn = v }
    easeOut(): number { return this.m_easeOut }
    setEaseOut(v: number): void { this.m_easeOut = v }

    isHarpGliss(): boolean | null { return this.m_isHarpGliss }
    setIsHarpGliss(v: boolean | null): void { this.m_isHarpGliss = v }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new GlissandoSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.color())
        return seg
    }

    override allowTimeAnchor(): boolean { return false }

    override getPropertyStyle(id: Pid): Sid {
        if (id === Pid.GLISS_STYLE) {
            return this.isHarpGliss() ? Sid.glissandoStyleHarp : Sid.glissandoStyle
        }
        return super.getPropertyStyle(id)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GLISS_TYPE:
            return this.glissandoType()
        case Pid.GLISS_TEXT:
            return this.text()
        case Pid.GLISS_SHOW_TEXT:
            return this.showText()
        case Pid.GLISS_STYLE:
            return this.glissandoStyle()
        case Pid.GLISS_SHIFT:
            return this.glissandoShift()
        case Pid.GLISS_EASEIN:
            return this.easeIn()
        case Pid.GLISS_EASEOUT:
            return this.easeOut()
        case Pid.FONT_FACE:
            return this.m_fontFace
        case Pid.FONT_SIZE:
            return this.m_fontSize
        case Pid.FONT_STYLE:
            return this.m_fontStyle
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.GLISS_TYPE:
            this.setGlissandoType(v as GlissandoType)
            break
        case Pid.GLISS_TEXT:
            this.setText(v as string)
            break
        case Pid.GLISS_SHOW_TEXT:
            this.setShowText(!!v)
            break
        case Pid.GLISS_STYLE: {
            // Make sure harp glisses can only be diatonic and chromatic
            let glissStyle = v as GlissandoStyle
            if (this.isHarpGliss() && (glissStyle !== GlissandoStyle.DIATONIC && glissStyle !== GlissandoStyle.CHROMATIC)) {
                glissStyle = GlissandoStyle.DIATONIC
            }
            this.setGlissandoStyle(glissStyle)
            break
        }
        case Pid.GLISS_SHIFT:
            this.setGlissandoShift(!!v)
            break
        case Pid.GLISS_EASEIN:
            this.setEaseIn(v as number)
            break
        case Pid.GLISS_EASEOUT:
            this.setEaseOut(v as number)
            break
        case Pid.FONT_FACE:
            this.setFontFace(v as string)
            break
        case Pid.FONT_SIZE:
            this.setFontSize(v as number)
            break
        case Pid.FONT_STYLE:
            this.setFontStyle(v as FontStyle)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GLISS_TYPE:
            return this.style().styleV(Sid.glissandoType)
        case Pid.GLISS_SHOW_TEXT:
            return true
        case Pid.GLISS_STYLE:
            return this.style().styleV(this.getPropertyStyle(propertyId))
        case Pid.GLISS_SHIFT:
            return false
        case Pid.GLISS_EASEIN:
        case Pid.GLISS_EASEOUT:
            return 0
        case Pid.GLISS_TEXT:
            return this.style().styleV(Sid.glissandoText)
        case Pid.DIAGONAL:
            return true
        case Pid.ANCHOR:
            return SpannerAnchor.NOTE
        default:
            break
        }
        return super.propertyDefault(propertyId)
    }
}
