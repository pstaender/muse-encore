/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/volta.h/.cpp
 *
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SmuflAnchorId, SymId } from '../types/symid'
import { BarLineType, ElementType, HookType, PlacementV, TextPlace, TextStyleType, VOICES, nidx } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import { SpannerAnchor } from './spanner'
import type { BarLine } from './barline'
import type { KeySig } from './keysig'
import type { LineSegment } from './line'
import type { System } from './system'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'

const voltaStyle: ElementStyle = [
    { sid: Sid.voltaFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.voltaFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.voltaFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.voltaFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.voltaFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.voltaFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.voltaFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.voltaFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.voltaFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.voltaAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.voltaAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.voltaAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.voltaPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.voltaPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.voltaPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.voltaOffset, pid: Pid.BEGIN_TEXT_OFFSET },
    { sid: Sid.voltaOffset, pid: Pid.CONTINUE_TEXT_OFFSET },
    { sid: Sid.voltaOffset, pid: Pid.END_TEXT_OFFSET },
    { sid: Sid.voltaMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.voltaMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.voltaMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.voltaLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.voltaLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.voltaDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.voltaDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.voltaHook, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.voltaHook, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.voltaPosAbove, pid: Pid.OFFSET },
    { sid: Sid.voltaFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
]

const voltaSegmentStyle: ElementStyle = [
    { sid: Sid.voltaPosAbove, pid: Pid.OFFSET },
    { sid: Sid.voltaMinDistance, pid: Pid.MIN_DISTANCE },
]

export enum VoltaType {
    OPEN, CLOSED,
}

export class VoltaSegment extends TextLineBaseSegment {
    constructor(sp: Volta | null, parent: System | null) {
        super(ElementType.VOLTA_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF | ElementFlag.SYSTEM)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    volta(): Volta { return this.spanner() as Volta }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.BEGIN_HOOK_TYPE || pid === Pid.END_HOOK_TYPE || pid === Pid.VOLTA_ENDING) {
            return this.hasSpanner() ? this.spanner() : null
        }
        return super.propertyDelegate(pid)
    }
}

export class Volta extends TextLineBase {
    static readonly VOLTA_ANCHOR = SpannerAnchor.MEASURE

    private m_endings: number[] = []

    constructor(parent: EngravingObject | null) {
        super(ElementType.VOLTA, parent, ElementFlag.SYSTEM)
        this.setPlacement(PlacementV.ABOVE)
        this.initElementStyle(voltaStyle)
        this.setBeginTextPlace(TextPlace.BELOW)
        this.setContinueTextPlace(TextPlace.BELOW)
        this.setLineVisible(true)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT)
        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_HOOK_TYPE)
        this.resetProperty(Pid.END_HOOK_TYPE)
        this.setAnchor(Volta.VOLTA_ANCHOR)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const vs = new VoltaSegment(this, parent)
        vs.setTrack(this.track())
        vs.initElementStyle(voltaSegmentStyle)
        return vs
    }

    override allowTimeAnchor(): boolean { return false }

    endings(): number[] { return this.m_endings }
    setEndings(l: number[]): void { this.m_endings = [...l].sort((a, b) => a - b) }
    setText(s: string): void { this.setBeginText(s) }
    text(): string { return this.beginText() }
    hasEnding(repeat: number): boolean { return this.m_endings.includes(repeat) }
    firstEnding(): number { return this.m_endings.length ? this.m_endings[0] : 0 }
    lastEnding(): number { return this.m_endings.length ? this.m_endings[this.m_endings.length - 1] : 0 }
    isFirstVolta(): boolean { return this.m_endings.length === 1 && this.hasEnding(1) }

    /** deprecated */
    setVoltaType(val: VoltaType): void {
        this.setEndHookType(val === VoltaType.CLOSED ? HookType.HOOK_90 : HookType.NONE)
    }

    /** deprecated */
    voltaType(): VoltaType {
        return this.endHookType() !== HookType.NONE ? VoltaType.CLOSED : VoltaType.OPEN
    }

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.VOLTA_ENDING) {
            return [...this.m_endings] as unknown as PropertyValue
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        if (propertyId === Pid.VOLTA_ENDING) {
            this.setEndings(val as unknown as number[])
            return true
        }
        return super.setProperty(propertyId, val)
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.VOLTA_ENDING:
            return [] as unknown as PropertyValue
        case Pid.ANCHOR:
            return Volta.VOLTA_ANCHOR
        case Pid.BEGIN_HOOK_TYPE:
            return HookType.HOOK_90
        case Pid.END_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
        case Pid.END_TEXT:
            return ''
        case Pid.LINE_VISIBLE:
            return true
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.ABOVE
        case Pid.PLACEMENT:
            return PlacementV.ABOVE
        case Pid.TEXT_STYLE:
            return TextStyleType.VOLTA
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: // No arrow endings for voltas
        case Pid.BEGIN_FILLED_ARROW_WIDTH:
        case Pid.END_FILLED_ARROW_HEIGHT:
        case Pid.END_FILLED_ARROW_WIDTH:
        case Pid.BEGIN_LINE_ARROW_HEIGHT:
        case Pid.BEGIN_LINE_ARROW_WIDTH:
        case Pid.END_LINE_ARROW_HEIGHT:
        case Pid.END_LINE_ARROW_WIDTH:
            return 0.0
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        let segment: Segment | null = this.score().tick2leftSegment(start ? this.tick() : this.tick2(), true,
            SegmentType.ChordRest | SegmentType.StartRepeatBarLine | SegmentType.EndBarLine)
        if (!segment) {
            return { pos: new PointF(), system: null }
        }
        const measure = segment.measure()
        const isAtSystemStart = segment.rtick().isZero() && !!measure && !!measure.system() && measure.isFirstInSystem()
        const searchForPrevBarline = start ? segment.rtick().isZero() && (measure.repeatStart() || !isAtSystemStart) : true
        const barlineType = start ? (SegmentType.StartRepeatBarLine | SegmentType.EndBarLine) : SegmentType.EndBarLine
        if (searchForPrevBarline) {
            let prev: Segment | null = segment
            while (prev && !prev.isSegType(barlineType) && prev.tick().eq(segment.tick())) {
                prev = prev.prev1MMenabled()
            }
            if (prev && prev.isSegType(barlineType)) {
                segment = prev
            }
        }
        if (start && !segment.isSegType(SegmentType.BarLineType) && this.style().styleB(Sid.voltaAlignStartBeforeKeySig)) {
            let prev: Segment | null = segment
            while (prev && !prev.isSegType(SegmentType.KeySig) && prev.tick().eq(segment.tick())) {
                prev = prev.prev1MMenabled()
            }
            if (prev && prev.isSegType(SegmentType.KeySig)) {
                segment = prev
            }
        }
        const system = segment.measure().system()
        let x = segment.x() + segment.measure().x()
        if (start) {
            let alignLeftOfRepeatBarLine = false
            if (segment.isChordRestType()) {
                x -= this.style().styleMM(Sid.barNoteDistance)
            } else if (segment.isKeySigType()) {
                const sig = segment.element(this.track()) as KeySig | null
                if (sig && sig.ldata().keySymbols.length) {
                    const keySym = sig.ldata().keySymbols[0]
                    const cutoutNW = this.score().engravingFont().smuflAnchor(keySym.sym, SmuflAnchorId.cutOutNW, 1.0)
                    x += keySym.xPos + cutoutNW.x()
                }
            } else if ((segment.segmentType() & SegmentType.BarLineType) && !isAtSystemStart) {
                x += segment.width()
                const barline = segment.element(this.track()) as BarLine | null
                alignLeftOfRepeatBarLine = !!barline && barline.barLineType() === BarLineType.END_REPEAT
                                           && this.style().styleB(Sid.voltaAlignEndLeftOfBarline)
                if (alignLeftOfRepeatBarLine) {
                    x -= this.style().styleMM(Sid.endBarWidth)
                }
            }
            x += (isAtSystemStart || alignLeftOfRepeatBarLine ? 0.5 : -0.5) * this.absoluteFromSpatium(this.lineWidth())
        } else {
            if (system && segment.tick().eq(system.endTick())) {
                const si = this.backSegment().effectiveStaffIdx()
                if (si === nidx) {
                    return { pos: new PointF(x, 0.0), system }
                }
                x += segment.staffShape(si).right()
                x -= 0.5 * this.absoluteFromSpatium(this.lineWidth())
            } else if (segment.segmentType() & SegmentType.BarLineType) {
                const barLine = segment.element(this.track()) as BarLine
                if (barLine.barLineType() === BarLineType.END_REPEAT || barLine.barLineType() === BarLineType.END_START_REPEAT) {
                    x += this.symWidth(SymId.repeatDot) + this.style().styleMM(Sid.repeatBarlineDotSeparation)
                }
                x += 0.5 * this.absoluteFromSpatium(this.lineWidth())
            }
        }
        return { pos: new PointF(x, 0.0), system }
    }

    /** C++ Volta::setChannel: the channel before the volta is restored at its end */
    setChannel(): void {
        const startMeasure = this.startMeasure()
        const endMeasure = this.endMeasure()

        if (startMeasure && endMeasure) {
            if (!endMeasure.repeatEnd()) {
                return
            }

            const startTick = startMeasure.tick().minus(Fraction.eps())
            const endTick = endMeasure.endTick().minus(Fraction.eps())
            const st = this.staff()!
            for (let voice = 0; voice < VOICES; ++voice) {
                const channel = st.channel(startTick, voice)
                st.insertIntoChannelList(voice, endTick, channel)
            }
        }
    }

    /** C++ Volta::setTempo: the tempo at the end of the volta is the tempo before it (called by the layout) */
    setTempo(): void {
        const startMeasure = this.startMeasure()
        const endMeasure = this.endMeasure()

        if (startMeasure && endMeasure) {
            if (!endMeasure.repeatEnd()) {
                return
            }
            const startTick = startMeasure.tick().minus(Fraction.eps())
            const endTick = endMeasure.endTick().minus(Fraction.eps())
            const tempoBeforeVolta = this.score().tempomap().tempo(startTick.ticks())
            this.score().setTempo(endTick, tempoBeforeVolta)
        }
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.text()}`
    }
}
