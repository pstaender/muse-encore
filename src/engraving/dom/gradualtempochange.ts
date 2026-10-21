/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/gradualtempochange.h/.cpp
 *
 * TODO(port): tempo map (requestToRebuildTempo)
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { RealIsEqualOrLess, RealIsEqualOrMore } from '../../framework/global/realfn'
import type { PropertyValue } from '../types/propertyvalue'
import { ChangeMethod, ElementType, GradualTempoChangeType, HookType, TextPlace, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { LineSegment } from './line'
import { Pid } from './property'
import { SpannerAnchor } from './spanner'
import type { System } from './system'
import type { TempoText } from './tempotext'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'

const tempoStyle: ElementStyle = [
    { sid: Sid.tempoChangeSystemFlag, pid: Pid.SYSTEM_FLAG },
    { sid: Sid.tempoChangePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.tempoChangeMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.tempoChangeLineSpacing, pid: Pid.TEXT_LINE_SPACING },

    { sid: Sid.tempoChangeColor, pid: Pid.COLOR },
    { sid: Sid.tempoChangePosAbove, pid: Pid.OFFSET },

    { sid: Sid.tempoChangeFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.tempoChangeFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.tempoChangeFontFace, pid: Pid.END_FONT_FACE },

    { sid: Sid.tempoChangeFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.tempoChangeFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.tempoChangeFontSize, pid: Pid.END_FONT_SIZE },

    { sid: Sid.tempoChangeFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.tempoChangeFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.tempoChangeFontStyle, pid: Pid.END_FONT_STYLE },

    { sid: Sid.tempoChangeAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.tempoChangeAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.tempoChangeAlign, pid: Pid.END_TEXT_ALIGN },

    { sid: Sid.tempoChangePosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.tempoChangePosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.tempoChangePosition, pid: Pid.END_TEXT_POSITION },

    { sid: Sid.tempoChangeFontSpatiumDependent, pid: Pid.SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.tempoChangeLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.tempoChangeLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.tempoChangeDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.tempoChangeDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.tempoChangeFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },

    { sid: Sid.gradualTempoChangeEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.gradualTempoChangeEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.gradualTempoChangeBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.gradualTempoChangeBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.gradualTempoChangeEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.gradualTempoChangeEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.gradualTempoChangeBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.gradualTempoChangeBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },

    { sid: Sid.tempoChangeMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.tempoChangeMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.tempoChangeMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const tempoSegmentStyle: ElementStyle = [
    { sid: Sid.tempoChangePosAbove, pid: Pid.OFFSET },
    { sid: Sid.tempoChangeMinDistance, pid: Pid.MIN_DISTANCE },
]

const DEFAULT_FACTORS_MAP = new Map<GradualTempoChangeType, number>([
    [GradualTempoChangeType.Accelerando, 1.33],
    [GradualTempoChangeType.Allargando, 0.75],
    [GradualTempoChangeType.Calando, 0.5],
    [GradualTempoChangeType.Lentando, 0.75],
    [GradualTempoChangeType.Morendo, 0.5],
    [GradualTempoChangeType.Precipitando, 1.15],
    [GradualTempoChangeType.Rallentando, 0.75],
    [GradualTempoChangeType.Ritardando, 0.75],
    [GradualTempoChangeType.Smorzando, 0.5],
    [GradualTempoChangeType.Sostenuto, 0.95],
    [GradualTempoChangeType.Stringendo, 1.5],
])

export class GradualTempoChange extends TextLineBase {
    private m_tempoChangeType = GradualTempoChangeType.Undefined
    private m_tempoEasingMethod = ChangeMethod.NORMAL
    private m_tempoChangeFactor: number | null = null
    private m_snapToItemAfter = true
    private m_alignRightOfRehearsalMark = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.GRADUAL_TEMPO_CHANGE, parent, ElementFlag.SYSTEM)
        this.initElementStyle(tempoStyle)
        this.setAnchor(SpannerAnchor.SEGMENT)

        this.resetProperty(Pid.LINE_VISIBLE)
        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const lineSegment = new GradualTempoChangeSegment(this, parent)
        lineSegment.setTrack(this.track())
        return lineSegment
    }

    tempoChangeType(): GradualTempoChangeType { return this.m_tempoChangeType }
    easingMethod(): ChangeMethod { return this.m_tempoEasingMethod }
    setTempoChangeType(type: GradualTempoChangeType): void { this.m_tempoChangeType = type }

    tempoChangeFactor(): number {
        if (this.m_tempoChangeFactor !== null) {
            return this.m_tempoChangeFactor
        }
        return DEFAULT_FACTORS_MAP.get(this.m_tempoChangeType) ?? 1.0
    }

    snapToItemAfter(): boolean { return this.m_snapToItemAfter }
    setSnapToItemAfter(v: boolean): void { this.m_snapToItemAfter = v }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEMPO_CHANGE_TYPE:
            return this.m_tempoChangeType
        case Pid.TEMPO_EASING_METHOD:
            return this.m_tempoEasingMethod
        case Pid.TEMPO_CHANGE_FACTOR:
            return this.tempoChangeFactor()
        case Pid.SNAP_AFTER:
            return this.snapToItemAfter()
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK:
            return this.m_alignRightOfRehearsalMark
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, val: PropertyValue): boolean {
        switch (id) {
        case Pid.TEMPO_CHANGE_TYPE:
            this.m_tempoChangeType = val as GradualTempoChangeType
            break
        case Pid.TEMPO_EASING_METHOD:
            this.m_tempoEasingMethod = val as ChangeMethod
            break
        case Pid.TEMPO_CHANGE_FACTOR:
            this.m_tempoChangeFactor = val as number
            break
        case Pid.SNAP_AFTER:
            this.setSnapToItemAfter(!!val)
            break
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK:
            this.m_alignRightOfRehearsalMark = !!val
            break
        default:
            return super.setProperty(id, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.ALIGN:
            return this.style().styleV(Sid.tempoChangeAlign)

        case Pid.LINE_WIDTH:
            return this.style().styleV(Sid.tempoChangeLineWidth)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.tempoChangeLineStyle)
        case Pid.LINE_VISIBLE:
            return true

        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)

        case Pid.BEGIN_FONT_STYLE:
            return this.style().styleV(Sid.tempoChangeFontStyle)

        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
        case Pid.END_TEXT:
            return ''

        case Pid.BEGIN_HOOK_TYPE:
            return HookType.NONE

        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.AUTO

        case Pid.TEMPO_CHANGE_TYPE:
            return GradualTempoChangeType.Undefined
        case Pid.TEMPO_EASING_METHOD:
            return ChangeMethod.NORMAL
        case Pid.TEMPO_CHANGE_FACTOR:
            return DEFAULT_FACTORS_MAP.get(this.m_tempoChangeType) ?? 1.0

        case Pid.SNAP_AFTER:
            return true

        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK:
            return true

        case Pid.TEXT_STYLE:
            return TextStyleType.TEMPO_CHANGE

        default:
            return super.propertyDefault(propertyId)
        }
    }

    override getPropertyStyle(id: Pid): Sid {
        switch (id) {
        case Pid.PLACEMENT:
            return Sid.tempoChangePlacement
        case Pid.BEGIN_FONT_FACE:
        case Pid.CONTINUE_FONT_FACE:
        case Pid.END_FONT_FACE:
            return Sid.tempoChangeFontFace
        case Pid.BEGIN_FONT_SIZE:
        case Pid.CONTINUE_FONT_SIZE:
        case Pid.END_FONT_SIZE:
            return Sid.tempoChangeFontSize
        case Pid.BEGIN_FONT_STYLE:
        case Pid.CONTINUE_FONT_STYLE:
        case Pid.END_FONT_STYLE:
            return Sid.tempoChangeFontStyle
        case Pid.BEGIN_TEXT_ALIGN:
        case Pid.CONTINUE_TEXT_ALIGN:
        case Pid.END_TEXT_ALIGN:
            return Sid.tempoChangeAlign
        case Pid.BEGIN_TEXT:
            return Sid.letRingText
        case Pid.OFFSET:
            if (this.placeAbove()) {
                return Sid.tempoChangePosAbove
            } else {
                return Sid.tempoChangePosBelow
            }
        default:
            break
        }
        return super.getPropertyStyle(id)
    }

    adjustForRehearsalMark(start: boolean): boolean {
        const segment = start ? this.startSegment() : this.endSegment()
        if (!this.m_alignRightOfRehearsalMark || !segment) {
            return false
        }

        const rehearsalMark = segment.findAnnotation(ElementType.REHEARSAL_MARK, this.track(), this.track())
        if (!rehearsalMark) {
            return false
        }
        const thisBbox = this.ldata().bbox().translated(this.pos())
        const rehearsalMarkBbox = rehearsalMark.ldata().bbox().translated(rehearsalMark.pos())

        const sameSide = this.placeAbove() === rehearsalMark.placeAbove()
        const collision = this.placeAbove() ? RealIsEqualOrMore(rehearsalMarkBbox.bottom(), thisBbox.top())
            : RealIsEqualOrLess(rehearsalMarkBbox.top(), thisBbox.bottom())

        return sameSide && collision
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        const defaultPos = super.linePos(grip)
        if (!this.adjustForRehearsalMark(start)) {
            return defaultPos
        }

        const segment = (start ? this.startSegment() : this.endSegment())!
        const rehearsalMark = segment.findAnnotation(ElementType.REHEARSAL_MARK, this.track(), this.track())
        let rehearsalMarkBbox = rehearsalMark ? rehearsalMark.ldata().bbox().translated(rehearsalMark.pos()) : new RectF()

        const rehearsalMarkPos = segment.pos().plus(segment.measure().pos())
        rehearsalMarkBbox = rehearsalMarkBbox.translated(rehearsalMarkPos)

        const text = start ? (this.frontSegment() as GradualTempoChangeSegment).text()
            : (this.backSegment() as GradualTempoChangeSegment).endText()

        const sp = this.spatium()

        let padding = sp
        if (text) {
            const fontSizeScaleFactor = text.size() / 10.0
            padding = 0.5 * sp * fontSizeScaleFactor
        }

        padding *= start ? 1.0 : -1.0
        let x = (start ? rehearsalMarkBbox.right() : rehearsalMarkBbox.left()) + padding

        const system = segment.measure().system()

        x = start ? Math.max(x, defaultPos.pos.x()) : x

        return { pos: new PointF(x, 0.0), system }
    }

    override added(): void {
        this.requestToRebuildTempo()
    }

    override removed(): void {
        this.requestToRebuildTempo()
    }

    requestToRebuildTempo(): void {
        this.score().setUpTempoMapLater()
    }
}

export class GradualTempoChangeSegment extends TextLineBaseSegment {
    constructor(annotation: GradualTempoChange | null, parent: System | null) {
        super(ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT, annotation, parent,
            ElementFlag.MOVABLE | ElementFlag.ON_STAFF | ElementFlag.SYSTEM)
        this.initElementStyle(tempoSegmentStyle)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    tempoChange(): GradualTempoChange { return this.spanner() as GradualTempoChange }

    override getPropertyStyle(id: Pid): Sid {
        if (id === Pid.OFFSET) {
            if (this.placeAbove()) {
                return Sid.tempoPosAbove
            } else {
                return Sid.tempoPosBelow
            }
        }
        return super.getPropertyStyle(id)
    }

    findElementToSnapBefore(): GradualTempoChangeSegment | null {
        const sys = this.system()
        if (!sys) {
            return null
        }

        const thisTempoChange = this.tempoChange()
        const startTick = thisTempoChange.tick()
        if (sys.measures().length && startTick.eq(sys.measures()[0].tick())) {
            return null
        }

        for (const spanner of this.score().spannerMap().findOverlapping(startTick.ticks(), startTick.ticks())) {
            const isValidTempoChange = spanner.isGradualTempoChange() && !spanner.segmentsEmpty() && spanner.visible()
                                       && spanner !== thisTempoChange
            if (!isValidTempoChange) {
                continue
            }

            const precedingTempoChange = spanner as GradualTempoChange
            const endsMatch = precedingTempoChange.track() === thisTempoChange.track()
                              && precedingTempoChange.tick2().eq(startTick)
                              && precedingTempoChange.placeAbove() === thisTempoChange.placeAbove()

            if (endsMatch && precedingTempoChange.snapToItemAfter()) {
                return precedingTempoChange.backSegment() as GradualTempoChangeSegment
            }
        }

        return null
    }

    findElementToSnapAfter(): TempoText | null {
        if (!this.tempoChange().snapToItemAfter()) {
            return null
        }

        const sys = this.system()
        if (!sys) {
            return null
        }

        const refTick = this.tempoChange().tick2()
        const measure = this.score().tick2measureMM(refTick)
        if (!measure) {
            return null
        }

        for (let segment = measure.last(); segment; segment = segment.prev1()) {
            if (segment.system() !== sys) {
                continue
            }
            const segmentTick = segment.tick()
            if (segmentTick.gt(refTick)) {
                continue
            }
            if (segmentTick.lt(refTick)) {
                break
            }
            const tempoText = segment.findAnnotation(ElementType.TEMPO_TEXT, this.track(), this.track())
            if (tempoText && tempoText.placeAbove() === this.placeAbove() && tempoText.visible()) {
                return tempoText as TempoText
            }
        }

        return null
    }

    override added(): void {
        (this.spanner() as GradualTempoChange).requestToRebuildTempo()
    }

    override removed(): void {
        (this.spanner() as GradualTempoChange).requestToRebuildTempo()
    }
}
