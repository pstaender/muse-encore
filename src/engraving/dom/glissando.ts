/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/glissando.h/.cpp
 *
 * TODO(port): pitchSteps (playback), guessInitialNote (1.x/2.0 files)
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
