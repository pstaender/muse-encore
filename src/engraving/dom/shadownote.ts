/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/shadownote.h/.cpp
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { DurationType, ElementType } from '../types/types'
import { SymId } from '../types/symid'
import { Sid } from '../style/styledef'
import { EngravingItem } from './engravingitem'
import { TDuration } from './durationtype'
import { AccidentalType } from './accidentaldata'
import { Hook } from './hook'
import type { Painter } from '../../framework/draw/painter'
import type { Score } from './score'

/** C++ Articulation::symId2ArticulationName(artic).contains(u"marcato") */
export function isMarcatoArticulation(id: SymId): boolean {
    switch (id) {
    case SymId.articMarcatoStaccatoAbove:
    case SymId.articMarcatoStaccatoBelow:
    case SymId.articMarcatoTenutoAbove:
    case SymId.articMarcatoTenutoBelow:
    case SymId.articMarcatoAbove:
    case SymId.articMarcatoBelow:
        return true
    default:
        return false
    }
}

/**
 * Graphic representation of a shadow note,
 * which shows the note insert position in note entry mode.
 */
export class ShadowNote extends EngravingItem {
    private m_tick = new Fraction(0, 1)
    private m_lineIndex = 1000
    private m_noteheadSymbol = SymId.noSym
    private m_duration = new TDuration(DurationType.V_INVALID)
    private m_isRest = false
    private m_accidentalType = AccidentalType.NONE
    private m_articulationIds = new Set<SymId>()

    private m_segmentSkylineTopY = 0.0
    private m_segmentSkylineBottomY = 0.0

    constructor(s: Score) {
        super(ElementType.SHADOW_NOTE, s)
    }

    isValid(): boolean {
        return this.m_noteheadSymbol !== SymId.noSym
    }

    override tick(): Fraction { return this.m_tick }
    setTick(t: Fraction): void { this.m_tick = t }

    lineIndex(): number { return this.m_lineIndex }
    setLineIndex(n: number): void { this.m_lineIndex = n }

    override isRest(): boolean { return this.m_isRest }

    duration(): TDuration { return this.m_duration }

    setState(noteSymbol: SymId, duration: TDuration, rest: boolean, segmentSkylineTopY: number, segmentSkylineBottomY: number,
        accidentalType: AccidentalType = AccidentalType.NONE, articulationIds: ReadonlySet<SymId> = new Set()): void {
        this.m_noteheadSymbol = noteSymbol
        this.m_duration = duration.clone()
        this.m_isRest = rest
        this.m_segmentSkylineTopY = segmentSkylineTopY
        this.m_segmentSkylineBottomY = segmentSkylineBottomY
        this.m_accidentalType = accidentalType
        this.m_articulationIds = new Set(articulationIds)
    }

    noteheadSymbol(): SymId { return this.m_noteheadSymbol }

    hasStem(): boolean {
        return !this.m_isRest && this.m_duration.hasStem()
    }

    hasFlag(): boolean {
        return this.hasStem() && this.m_duration.hooks() > 0
    }

    flagSym(): SymId {
        if (!this.hasStem()) {
            return SymId.noSym
        }

        const straight = this.style().styleB(Sid.useStraightNoteFlags)
        const hooks = this.computeUp() ? this.m_duration.hooks() : -this.m_duration.hooks()
        return Hook.symIdForHookIndex(hooks, straight)
    }

    accidentalType(): AccidentalType { return this.m_accidentalType }
    articulationIds(): ReadonlySet<SymId> { return this.m_articulationIds }

    segmentSkylineBottomY(): number { return this.m_segmentSkylineBottomY }
    segmentSkylineTopY(): number { return this.m_segmentSkylineTopY }

    ledgerLinesVisible(): boolean {
        return !this.m_isRest && this.m_lineIndex < 100 && this.m_lineIndex > -100
    }

    computeUp(): boolean {
        const staffType = this.staffType()
        const tabStaff = !!staffType && staffType.isTabStaff()

        if (tabStaff && (staffType!.stemless() || !staffType!.stemThrough())) {
            // if TAB staff with no stems or stem beside staff
            return true
        }

        if (this.score().tick2measure(this.m_tick)!.hasVoices(this.staffIdx()) || this.voice() !== 0) {
            return !(this.voice() & 1)
        } else {
            return this.m_lineIndex > (staffType ? staffType.middleLine() : 4)
        }
    }

    drawArticulations(painter: Painter): void {
        const noteheadWidth = this.symWidth(this.m_noteheadSymbol)
        let ms = this.spatium()
        const x1 = noteheadWidth * 0.5 - (ms * this.mag())
        const x2 = x1 + 2 * ms * this.mag()
        ms *= 0.5
        const y1 = -ms * this.m_lineIndex + this.m_segmentSkylineTopY
        const y2 = -ms * this.m_lineIndex + this.m_segmentSkylineBottomY

        const boundRect = RectF.fromPoints(new PointF(x1, y1), new PointF(x2, y2))

        for (const artic of this.m_articulationIds) {
            if (isMarcatoArticulation(artic)) {
                this.drawMarcato(painter, artic, boundRect)
            } else {
                this.drawArticulation(painter, artic, boundRect)
            }
        }
    }

    drawMarcato(painter: Painter, artic: SymId, boundRect: RectF): void {
        const coord = new PointF()
        const spacing = this.spatium()

        let topY = boundRect.y()
        if (topY > 0) {
            topY = 0
        }
        coord.setY(topY - this.symHeight(artic))

        boundRect.setTop(boundRect.y() - this.symHeight(artic) - spacing)
        this.drawSymbol(artic, painter, coord)
    }

    drawArticulation(painter: Painter, artic: SymId, boundRect: RectF): void {
        const coord = new PointF()
        const spacing = this.spatium()
        let articSym = artic

        const up = !this.computeUp()
        if (articSym === SymId.articLaissezVibrerAbove || articSym === SymId.articLaissezVibrerBelow) {
            articSym = up ? SymId.articLaissezVibrerAbove : SymId.articLaissezVibrerBelow
            const upDir = up ? -1 : 1
            const noteHeight = this.symHeight(this.m_noteheadSymbol)

            const center = 0.5 * this.symWidth(this.m_noteheadSymbol)
            const visualInset = 0.1 * spacing

            coord.setX(center + visualInset - this.symBbox(articSym).left())
            coord.setY((noteHeight / 2 + 0.2 * spacing) * upDir)
            boundRect.setWidth(boundRect.width() + this.symWidth(articSym))
        } else {
            if (up) {
                let topY = boundRect.y()
                if (topY > 0) {
                    topY = 0
                }
                coord.setY(topY - this.symHeight(articSym))
                boundRect.setTop(topY - this.symHeight(articSym) - spacing)
            } else {
                let bottomY = boundRect.bottomLeft().y()
                if (bottomY < 0) {
                    bottomY = this.symHeight(this.m_noteheadSymbol)
                }
                coord.setY(bottomY + this.symHeight(articSym))
                boundRect.setHeight(bottomY + this.symHeight(articSym) + spacing)
            }
        }

        this.drawSymbol(articSym, painter, coord)
    }
}
