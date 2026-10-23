/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/verticalgapdata.h/.cpp
 */

import { RealIsNull } from '../../../framework/global/realfn'
import { Sid } from '../../style/styledef'
import type { MStyle } from '../../style/style'
import { SpacerType, type Spacer } from '../../dom/spacer'
import type { Staff } from '../../dom/staff'
import type { SysStaff, System } from '../../dom/system'

//---------------------------------------------------------
//   VerticalGapData
//    helper class for spreading staves over a page
//---------------------------------------------------------

export class VerticalGapData {
    private m_fixedHeight: boolean
    private m_fixedSpacer = false
    private m_factor = 1.0
    private m_normalisedSpacing = 0.0
    private m_maxActualSpacing = 0.0
    private m_addedNormalisedSpace = 0.0
    private m_fillSpacing = 0.0
    private m_lastStep = 0.0

    constructor(public style: MStyle, first: boolean, public system: System, public staff: Staff | null, public sysStaff: SysStaff | null,
                nextSpacer: Spacer | null, y: number) {
        this.m_fixedHeight = first
        if (this.m_fixedHeight) {
            this.m_normalisedSpacing = style.styleMM(Sid.staffUpperBorder)
            this.m_maxActualSpacing = this.m_normalisedSpacing
        } else {
            this.m_normalisedSpacing = system.y() + (sysStaff ? sysStaff.bbox().y() : 0.0) - y
            this.m_maxActualSpacing = style.styleMM(Sid.maxStaffSpread)

            const spacer = staff ? system.upSpacer(staff.idx(), nextSpacer) : null

            if (spacer) {
                this.m_fixedSpacer = spacer.spacerType() === SpacerType.FIXED
                this.m_normalisedSpacing = Math.max(this.m_normalisedSpacing, spacer.absoluteGap())
                if (this.m_fixedSpacer) {
                    this.m_maxActualSpacing = this.m_normalisedSpacing
                }
            }
        }
    }

    private updateFactor(factor: number): void {
        if (this.m_fixedHeight) {
            return
        }
        const f = Math.max(factor, this.m_factor)
        this.m_normalisedSpacing *= this.m_factor / f
        this.m_factor = f
    }

    addSpaceBetweenSections(): void {
        this.updateFactor(this.style.styleD(Sid.spreadSystem))
        if (!(this.m_fixedHeight || this.m_fixedSpacer)) {
            this.m_maxActualSpacing = this.style.styleMM(Sid.maxSystemSpread) / this.m_factor
        }
    }

    addSpaceAroundVBox(above: boolean): void {
        this.m_fixedHeight = true
        this.m_factor = 1.0
        this.m_normalisedSpacing = above ? this.style.styleMM(Sid.frameSystemDistance) : this.style.styleMM(Sid.systemFrameDistance)
        this.m_maxActualSpacing = this.m_normalisedSpacing / this.m_factor
    }

    addSpaceAroundNormalBracket(): void {
        this.updateFactor(this.style.styleD(Sid.spreadSquareBracket))
    }

    addSpaceAroundCurlyBracket(): void {
        this.updateFactor(this.style.styleD(Sid.spreadCurlyBracket))
    }

    insideCurlyBracket(): void {
        this.m_maxActualSpacing = this.style.styleMM(Sid.maxAkkoladeDistance) / this.m_factor
    }

    factor(): number { return this.m_factor }

    spacing(): number { return this.m_normalisedSpacing + this.m_addedNormalisedSpace }

    actualAddedSpace(): number { return this.m_addedNormalisedSpace * this.factor() }

    addSpacing(step: number): number {
        if (this.m_fixedHeight || this.m_fixedSpacer) {
            return 0.0
        }
        if (this.m_normalisedSpacing >= this.m_maxActualSpacing) {
            this.m_normalisedSpacing = this.m_maxActualSpacing
            step = 0.0
        } else {
            const newSpacing = this.m_normalisedSpacing + this.m_addedNormalisedSpace + step
            if (newSpacing >= this.m_maxActualSpacing) {
                step = this.m_maxActualSpacing - this.m_normalisedSpacing - this.m_addedNormalisedSpace
            }
        }
        this.m_addedNormalisedSpace += step
        this.m_lastStep = step
        return step
    }

    isFixedHeight(): boolean {
        return this.m_fixedHeight || RealIsNull(this.m_normalisedSpacing - this.m_maxActualSpacing)
    }

    undoLastAddSpacing(): void {
        this.m_addedNormalisedSpace -= this.m_lastStep
        this.m_lastStep = 0.0
    }

    addFillSpacing(step: number, maxFill: number): number {
        if (this.m_fixedSpacer) {
            return 0.0
        }
        const actStep = ((step + this.m_fillSpacing / this.m_factor) > maxFill) ? (maxFill - this.m_fillSpacing / this.m_factor) : step
        const res = this.addSpacing(actStep)
        this.m_fillSpacing += res * this.m_factor
        return res
    }

    setNormalisedSpacing(newNormalisedSpacing: number): void {
        this.m_normalisedSpacing = newNormalisedSpacing
    }
}

//---------------------------------------------------------
//   VerticalGapDataList
//    helper class for spreading staves over a page
//---------------------------------------------------------

export class VerticalGapDataList extends Array<VerticalGapData> {
    sumStretchFactor(): number {
        let sum = 0.0
        for (const vsd of this) {
            if (!vsd.isFixedHeight()) {
                sum += vsd.factor()
            }
        }
        return sum
    }

    smallest(limit = -1.0): number {
        let vdp: VerticalGapData | null = null
        for (const vgd of this) {
            if (vgd.isFixedHeight()) {
                continue
            }
            if (Math.ceil(limit) === Math.ceil(vgd.spacing())) {
                continue
            }
            if (!vdp || (vgd.spacing() < vdp.spacing())) {
                vdp = vgd
            }
        }
        return vdp ? vdp.spacing() : 0.0
    }
}
