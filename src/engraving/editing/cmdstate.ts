/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of CmdState of src/engraving/editing/cmd.h/.cpp: a module of its own because the DOM (Score) uses it and
 * cmd.ts adds the commands to Score (module augmentation).
 */

import { Fraction } from '../types/fraction'
import { LayoutFlag, UpdateMode, nidx, type staff_idx_t } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'
import type { MeasureBase } from '../dom/measurebase'

export { LayoutFlag, UpdateMode }

export class CmdState {
    layoutFlags: number = LayoutFlag.NO_FLAGS

    excerptsChanged = false
    instrumentsChanged = false

    private m_updateMode = UpdateMode.DoNothing
    private m_startTick = new Fraction(-1, 1) // start tick for mode LayoutTick
    private m_endTick = new Fraction(-1, 1) // end tick for mode LayoutTick
    private m_startStaff: staff_idx_t = nidx
    private m_endStaff: staff_idx_t = nidx
    private m_el: EngravingItem | null = null
    private m_mb: MeasureBase | null = null
    private m_oneElement = true
    private m_oneMeasureBase = true

    private m_locked = false

    reset(): void {
        this.layoutFlags = LayoutFlag.NO_FLAGS
        this.m_updateMode = UpdateMode.DoNothing
        this.m_startTick = new Fraction(-1, 1)
        this.m_endTick = new Fraction(-1, 1)

        this.m_startStaff = nidx
        this.m_endStaff = nidx
        this.m_el = null
        this.m_oneElement = true
        this.m_mb = null
        this.m_oneMeasureBase = true
        this.m_locked = false
    }

    updateMode(): UpdateMode { return this.m_updateMode }

    setUpdateMode(m: UpdateMode): void {
        if (m > this.m_updateMode) {
            this._setUpdateMode(m)
        }
    }

    _setUpdateMode(m: UpdateMode): void { this.m_updateMode = m }

    layoutRange(): boolean { return this.m_updateMode === UpdateMode.Layout }
    updateAll(): boolean { return this.m_updateMode >= UpdateMode.UpdateAll }
    updateRange(): boolean { return this.m_updateMode === UpdateMode.Update }

    setTick(t: Fraction): void {
        if (this.m_locked) {
            return
        }

        if (this.m_startTick.eq(new Fraction(-1, 1)) || t.lt(this.m_startTick)) {
            this.m_startTick = t
        }
        if (this.m_endTick.eq(new Fraction(-1, 1)) || t.gt(this.m_endTick)) {
            this.m_endTick = t
        }
        this.setUpdateMode(UpdateMode.Layout)
    }

    setStaff(st: staff_idx_t): void {
        if (this.m_locked || st === nidx) {
            return
        }

        if (this.m_startStaff === nidx || st < this.m_startStaff) {
            this.m_startStaff = st
        }
        if (this.m_endStaff === nidx || st > this.m_endStaff) {
            this.m_endStaff = st
        }
    }

    setElement(e: EngravingItem | null): void {
        if (!e || this.m_el === e || this.m_locked) {
            return
        }

        this.m_oneElement = !this.m_el
        this.m_el = e

        if (this.m_oneMeasureBase) {
            this.setMeasureBase(e.findMeasureBase())
        }
    }

    unsetElement(e: EngravingItem): void {
        if (this.m_el === e) {
            this.m_el = null
        }
        if (this.m_mb === (e as unknown)) {
            this.m_mb = null
        }
    }

    startTick(): Fraction { return this.m_startTick }
    endTick(): Fraction { return this.m_endTick }
    startStaff(): staff_idx_t { return this.m_startStaff }
    endStaff(): staff_idx_t { return this.m_endStaff }

    element(): EngravingItem | MeasureBase | null {
        if (this.m_oneElement) {
            return this.m_el
        }
        if (this.m_oneMeasureBase) {
            return this.m_mb
        }
        return null
    }

    lock(): void { this.m_locked = true }
    unlock(): void { this.m_locked = false }

    private setMeasureBase(mb: MeasureBase | null): void {
        if (!mb || this.m_mb === mb || this.m_locked) {
            return
        }

        this.m_oneMeasureBase = !this.m_mb
        this.m_mb = mb
    }
}
