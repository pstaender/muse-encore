/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/system.h/.cpp
 */

import { SystemDividerType, type SystemDivider } from './systemdivider'
import { RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { BracketType, ElementType, nidx, type staff_idx_t, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { Skyline, type SkylineLine } from '../infrastructure/skyline'
import { EngravingItem } from './engravingitem'
import { SpacerType } from './measure'
import type { MeasureBase } from './measurebase'
import type { Measure } from './measure'
import type { Page } from './page'
import type { Bracket } from './bracket'
import type { Spacer } from './spacer'
import type { ChordRest } from './chordrest'
import type { Part } from './part'
import type { Staff } from './staff'
import type { Box } from './box'
import type { SpannerSegment } from './spanner'
import type { InstrumentName } from './instrumentname'

export class SysStaff {
    instrumentNames: InstrumentName[] = []

    private m_bbox = new RectF() // Bbox of StaffLines.
    private m_skyline = new Skyline()
    private m_yOff = 0.0 // offset of top staff line within bbox
    private m_yPos = 0.0 // y position of bbox after System::layout2
    private m_height = 0.0 // height of bbox after System::layout2
    private m_continuousDist = -1.0 // distance for continuous mode
    private m_show = true // derived from Staff or false if empty

    bbox(): RectF { return this.m_bbox }
    setbbox(x: number | RectF, y?: number, w?: number, h?: number): void {
        if (x instanceof RectF) {
            this.m_bbox = x.clone()
        } else {
            this.m_bbox.setRect(x, y!, w!, h!)
        }
    }
    y(): number { return this.m_bbox.y() + this.m_yOff }
    setYOff(offset: number): void { this.m_yOff = offset }
    yOffset(): number { return this.m_yOff }

    yBottom(): number {
        return this.m_skyline.south().valid() ? this.m_skyline.south().max() : this.m_height
    }

    saveLayout(): void {
        this.m_height = this.m_bbox.height()
        this.m_yPos = this.m_bbox.y()
    }

    restoreLayout(): void {
        this.m_bbox.setTop(this.m_yPos)
        this.m_bbox.setHeight(this.m_height)
    }

    continuousDist(): number { return this.m_continuousDist }
    setContinuousDist(val: number): void { this.m_continuousDist = val }
    show(): boolean { return this.m_show }
    setShow(v: boolean): void { this.m_show = v }
    skyline(): Skyline { return this.m_skyline }
}

export class System extends EngravingItem {
    private m_systemDividerLeft: SystemDivider | null = null // to the next system
    private m_systemDividerRight: SystemDivider | null = null
    private m_ml: MeasureBase[] = []
    private m_staves: SysStaff[] = []
    private m_brackets: Bracket[] = []
    private m_spannerSegments: SpannerSegment[] = []
    private m_leftMargin = 0.0 // left margin for instrument name, brackets etc.
    private m_fixedDownDistance = false
    private m_distance = 0.0 // temp. variable used during layout
    private m_systemHeight = 0.0

    constructor(parent: EngravingItem | null) {
        super(ElementType.SYSTEM, parent)
    }

    moveToPage(parent: Page): void { this.setParent(parent) }

    page(): Page | null { return this.explicitParent() as unknown as Page | null }

    /** C++ ~System(): detaches the spanner segments and measures that still point to this system */
    destroy(): void {
        for (const ss of this.m_spannerSegments) {
            if (ss.system() === this) {
                ss.resetExplicitParent()
            }
        }
        for (const mb of this.m_ml) {
            if (mb.system() === this) {
                mb.resetExplicitParent()
            }
        }
        // ~EngravingObject moves the remaining children to the dummy, so their explicit parent is no longer this
        // system, e.g. a spanner segment that was removed from the system together with its spanner (System::remove
        // keeps its parent) and is reused when the spanner is added back by an undo
        for (const ch of [...this.children()]) {
            if (ch.explicitParent() === this) {
                ch.resetExplicitParent()
            }
        }
    }

    clear(): void {
        for (const mb of this.m_ml) {
            if (mb.system() === this) {
                mb.resetExplicitParent()
            }
        }
        this.m_ml = []
        for (const ss of this.m_spannerSegments) {
            if (ss.system() === this) {
                ss.resetExplicitParent()
            }
        }
        this.m_spannerSegments = []
    }

    appendMeasure(mb: MeasureBase): void {
        mb.setParent(this)
        this.m_ml.push(mb)
    }

    removeMeasure(mb: MeasureBase): void {
        this.m_ml = this.m_ml.filter(m => m !== mb)
        if (mb.system() === this) {
            mb.resetExplicitParent()
        }
    }

    removeLastMeasure(): void {
        if (!this.m_ml.length) {
            return
        }
        const mb = this.m_ml.pop()!
        if (mb.system() === this) {
            mb.resetExplicitParent()
        }
    }

    staves(): SysStaff[] { return this.m_staves }

    staffYpage(staffIdx: staff_idx_t): number {
        if (staffIdx < 0 || staffIdx >= this.m_staves.length) {
            return this.pagePos().y()
        }
        return this.m_staves[staffIdx].y() + this.y()
    }

    staffCanvasYpage(staffIdx: staff_idx_t): number {
        return this.m_staves[staffIdx].y() + this.y() + this.page()!.canvasPos().y()
    }

    override staff(): Staff | null
    override staff(staffIdx: number): SysStaff | null
    override staff(staffIdx?: number): SysStaff | Staff | null {
        if (staffIdx === undefined) {
            return super.staff()
        }
        return staffIdx >= 0 && staffIdx < this.m_staves.length ? this.m_staves[staffIdx] : null
    }

    pageBreak(): boolean {
        return this.m_ml.length ? this.m_ml[this.m_ml.length - 1].pageBreak() : false
    }

    insertStaff(idx: number): SysStaff {
        const staff = new SysStaff()
        if (idx) {
            // Set size of staff based on the previous staff
            staff.bbox().setTop(this.m_staves[idx - 1].y() + 6 * this.spatium())
        }
        this.m_staves.splice(idx, 0, staff)
        return staff
    }

    removeStaff(idx: number): void {
        this.m_staves.splice(idx, 1)
    }

    adjustStavesNumber(nstaves: number): void {
        for (let i = this.m_staves.length; i < nstaves; ++i) {
            this.insertStaff(i)
        }
        const dn = this.m_staves.length - nstaves
        for (let i = 0; i < dn; ++i) {
            this.removeStaff(this.m_staves.length - 1)
        }
    }

    measures(): MeasureBase[] { return this.m_ml }
    measure(idx: number): MeasureBase { return this.m_ml[idx] }
    first(): MeasureBase { return this.m_ml[0] }
    last(): MeasureBase { return this.m_ml[this.m_ml.length - 1] }

    firstMeasure(): Measure | null {
        const m = this.m_ml.find(mb => mb.isMeasure())
        return m ? m as unknown as Measure : null
    }

    lastMeasure(): Measure | null {
        for (let i = this.m_ml.length - 1; i >= 0; --i) {
            if (this.m_ml[i].isMeasure()) {
                return this.m_ml[i] as unknown as Measure
            }
        }
        return null
    }

    endTick(): Fraction { return this.m_ml[this.m_ml.length - 1].endTick() }

    nextMeasure(m: MeasureBase): MeasureBase | null {
        if (m === this.m_ml[this.m_ml.length - 1]) {
            return null
        }
        let nm = m.next()!
        if (nm.isMeasure() && this.style().styleB(Sid.createMultiMeasureRests) && (nm as unknown as Measure).hasMMRest()) {
            nm = (nm as unknown as Measure).mmRest()!
        }
        return nm
    }

    leftMargin(): number { return this.m_leftMargin }
    setLeftMargin(val: number): void { this.m_leftMargin = val }
    systemHeight(): number { return this.m_systemHeight }
    setSystemHeight(h: number): void { this.m_systemHeight = h }

    vbox(): Box | null {
        if (this.m_ml.length && this.m_ml[0].isVBoxBase()) {
            return this.m_ml[0] as unknown as Box
        }
        return null
    }

    brackets(): Bracket[] { return this.m_brackets }
    spannerSegments(): SpannerSegment[] { return this.m_spannerSegments }
    systemDividerLeft(): SystemDivider | null { return this.m_systemDividerLeft }
    systemDividerRight(): SystemDivider | null { return this.m_systemDividerRight }

    override add(el: EngravingItem): void {
        if (!el) {
            return
        }
        el.setParent(this)
        switch (el.type()) {
        case ElementType.INSTRUMENT_NAME: {
            const iname = el as InstrumentName
            this.m_staves[el.staffIdx()].instrumentNames.push(iname)
            iname.setSysStaff(this.m_staves[el.staffIdx()])
            break
        }
        case ElementType.BRACKET:
            this.m_brackets.push(el as Bracket)
            break
        case ElementType.SYSTEM_DIVIDER: {
            const sd = el as unknown as SystemDivider
            if (sd.dividerType() === SystemDividerType.LEFT) {
                this.m_systemDividerLeft = sd
            } else {
                this.m_systemDividerRight = sd
            }
            break
        }
        default:
            if (el.isSpannerSegment()) {
                const ss = el as unknown as SpannerSegment
                if (!this.m_spannerSegments.includes(ss)) {
                    this.m_spannerSegments.push(ss)
                }
            }
            break
        }
    }

    override remove(el: EngravingItem): void {
        switch (el.type()) {
        case ElementType.INSTRUMENT_NAME: {
            const iname = el as InstrumentName
            const names = this.m_staves[el.staffIdx()].instrumentNames
            const i = names.indexOf(iname)
            if (i >= 0) {
                names.splice(i, 1)
            }
            iname.setSysStaff(null)
            break
        }
        case ElementType.BRACKET: {
            const i = this.m_brackets.indexOf(el as Bracket)
            if (i >= 0) {
                this.m_brackets.splice(i, 1)
            }
            break
        }
        case ElementType.SYSTEM_DIVIDER:
            if (el === this.m_systemDividerLeft) {
                this.m_systemDividerLeft = null
            } else {
                // C++ assert(m_systemDividerRight == el)
                this.m_systemDividerRight = null
            }
            break
        default:
            if (el.isSpannerSegment()) {
                const i = this.m_spannerSegments.indexOf(el as unknown as SpannerSegment)
                if (i >= 0) {
                    this.m_spannerSegments.splice(i, 1)
                }
            }
            break
        }
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.vbox()) {
            return
        }
        for (const b of this.m_brackets) {
            func(b)
        }
        if (this.m_systemDividerLeft) {
            func(this.m_systemDividerLeft)
        }
        if (this.m_systemDividerRight) {
            func(this.m_systemDividerRight)
        }
        for (const st of this.m_staves) {
            if (st.show()) {
                for (const t of st.instrumentNames) {
                    func(t)
                }
            }
        }
        for (const ss of this.m_spannerSegments) {
            const spanner = ss.spanner()
            let staffIdx = spanner.staffIdx()
            if (staffIdx === nidx) {
                staffIdx = 0
            }
            let v = true
            if (spanner.anchor() === 0 /* SEGMENT */ || spanner.anchor() === 2 /* CHORD */) {
                const se = spanner.startElement()
                const ee = spanner.endElement()
                let v1 = true
                if (se && se.isChordRest()) {
                    const cr = se as ChordRest
                    v1 = cr.measure().visible(cr.staffIdx())
                }
                let v2 = true
                if (!v1 && ee && ee.isChordRest()) {
                    const cr = ee as ChordRest
                    v2 = cr.measure().visible(cr.staffIdx())
                }
                v = v1 || v2 // hide spanner if both chords are hidden
            }
            if ((this.score().staff(staffIdx)!.show() && this.m_staves[staffIdx].show() && v) || spanner.isVolta()
                || spanner.systemFlag()) {
                ss.scanElements(func)
            }
        }
    }

    topDistance(staffIdx: staff_idx_t, s: SkylineLine): number {
        // in continuous view, we only build a partial skyline for performance reasons
        // this means we cannot expect the minDistance calculation to produce meaningful results
        // so just give up on autoplace for spanners in continuous view
        // (or any other calculations that rely on this value)
        // (EngravingConfiguration::minDistanceForPartialSkylineCalculated() is false)
        if (this.score().lineMode()) {
            return 0.0
        }
        return s.minDistance(this.staff(staffIdx)!.skyline().north())
    }

    bottomDistance(staffIdx: staff_idx_t, s: SkylineLine): number {
        // see note on topDistance() above
        if (this.score().lineMode()) {
            return 0.0
        }
        return this.staff(staffIdx)!.skyline().south().minDistance(s)
    }

    private firstVisibleSysStaff(): staff_idx_t {
        for (let i = 0; i < this.m_staves.length; ++i) {
            if (this.m_staves[i].show()) {
                return i
            }
        }
        return nidx
    }

    private lastVisibleSysStaff(): staff_idx_t {
        for (let i = this.m_staves.length - 1; i >= 0; --i) {
            if (this.m_staves[i].show()) {
                return i
            }
        }
        return nidx
    }

    minTop(): number {
        const si = this.firstVisibleSysStaff()
        const s = si === nidx ? null : this.staff(si)
        if (s) {
            return -s.skyline().north().max()
        }
        return 0.0
    }

    minBottom(): number {
        const vb = this.vbox()
        if (vb) {
            return vb.absoluteFromSpatium(vb.bottomGap())
        }
        const si = this.lastVisibleSysStaff()
        const s = si === nidx ? null : this.staff(si)
        if (s) {
            return s.skyline().south().max() - s.bbox().height()
        }
        return 0.0
    }

    spacerDistance(up: boolean): number {
        const staff = up ? this.firstVisibleSysStaff() : this.lastVisibleSysStaff()
        if (staff === nidx) {
            return 0.0
        }
        let dist = 0.0
        for (const mb of this.measures()) {
            if (mb.isMeasure()) {
                const m = mb as unknown as Measure
                const sp = up ? m.vspacerUp(staff) : m.vspacerDown(staff)
                if (sp) {
                    if (sp.spacerType() === SpacerType.FIXED) {
                        dist = sp.absoluteGap()
                        break
                    } else {
                        dist = Math.max(dist, sp.absoluteGap())
                    }
                }
            }
        }
        return dist
    }

    upSpacer(staffIdx: staff_idx_t, prevDownSpacer: Spacer | null): Spacer | null {
        if (staffIdx === nidx) {
            return null
        }
        if (prevDownSpacer && (prevDownSpacer.spacerType() === SpacerType.FIXED)) {
            return prevDownSpacer
        }
        let spacer = prevDownSpacer
        for (const mb of this.measures()) {
            if (!(mb && mb.isMeasure())) {
                continue
            }
            const sp = (mb as unknown as Measure).vspacerUp(staffIdx)
            if (sp) {
                if (!spacer || ((spacer.spacerType() === SpacerType.UP) && (sp.gap().val() > spacer.gap().val()))) {
                    spacer = sp
                }
            }
        }
        return spacer
    }

    downSpacer(staffIdx: staff_idx_t): Spacer | null {
        if (staffIdx === nidx) {
            return null
        }
        let spacer: Spacer | null = null
        for (const mb of this.measures()) {
            if (!(mb && mb.isMeasure())) {
                continue
            }
            const sp = (mb as unknown as Measure).vspacerDown(staffIdx)
            if (sp) {
                if (sp.spacerType() === SpacerType.FIXED) {
                    return sp
                } else if (!spacer || (sp.gap().val() > spacer.gap().val())) {
                    spacer = sp
                }
            }
        }
        return spacer
    }

    firstNoteRestSegmentX(leading = false): number {
        let margin = this.style().styleMM(Sid.headerToLineStartDistance)
        for (const mb of this.measures()) {
            if (mb.isMeasure()) {
                margin = (mb as unknown as Measure).firstNoteRestSegmentX(leading)
                break
            }
        }
        return margin
    }

    endingXForOpenEndedLines(): number {
        const margin = this.style().styleMM(Sid.lineEndToBarlineDistance)
        const systemEndX = this.ldata().bbox().width()
        const lastMeas = this.lastMeasure()
        if (!lastMeas) {
            return systemEndX - margin
        }
        return lastMeas.endingXForOpenEndedLines()
    }

    lastChordRest(track: track_idx_t): ChordRest | null {
        for (let i = this.m_ml.length - 1; i >= 0; --i) {
            if (this.m_ml[i].isMeasure()) {
                return (this.m_ml[i] as unknown as Measure).lastChordRest(track)
            }
        }
        return null
    }

    firstChordRest(track: track_idx_t): ChordRest | null {
        for (const mb of this.m_ml) {
            if (mb.isMeasure()) {
                return (mb as unknown as Measure).firstChordRest(track)
            }
        }
        return null
    }

    hasFixedDownDistance(): boolean { return this.m_fixedDownDistance }
    setFixedDownDistance(val: boolean): void { this.m_fixedDownDistance = val }

    private firstVisibleStaffFrom(startStaffIdx: staff_idx_t): staff_idx_t {
        for (let i = startStaffIdx; i < this.m_staves.length; ++i) {
            const s = this.score().staff(i)!
            const ss = this.m_staves[i]
            if (s.show() && ss.show()) {
                return i
            }
        }
        return nidx
    }

    /** y: system relative; preferredStaff gets the whole space to the next staff (C++ default: invalid) */
    searchStaff(y: number, preferredStaff: staff_idx_t = nidx, spacingFactor = 0.5): staff_idx_t {
        let i = 0
        const nstaves = this.score().nstaves()
        for (; i < nstaves;) {
            const stff = this.m_staves[i]
            if (!stff.show() || !this.score().staff(i)!.show()) {
                ++i
                continue
            }
            let ni = i
            for (;;) {
                ++ni
                if (ni === nstaves || (this.m_staves[ni].show() && this.score().staff(ni)!.show())) {
                    break
                }
            }

            let sy2: number
            if (ni !== nstaves) {
                const nstaff = this.m_staves[ni]
                const s1y2 = stff.bbox().y() + stff.bbox().height()
                if (i === preferredStaff) {
                    sy2 = s1y2 + (nstaff.bbox().y() - s1y2)
                } else if (ni === preferredStaff) {
                    sy2 = s1y2
                } else {
                    sy2 = s1y2 + (nstaff.bbox().y() - s1y2) * spacingFactor
                }
            } else {
                sy2 = this.page()!.height() - this.pos().y()
            }
            if (y > sy2) {
                i = ni
                continue
            }
            break
        }
        return i
    }

    firstVisibleStaff(): staff_idx_t { return this.firstVisibleStaffFrom(0) }
    nextVisibleStaff(staffIdx: staff_idx_t): staff_idx_t { return this.firstVisibleStaffFrom(staffIdx + 1) }

    prevVisibleStaff(startStaffIdx: staff_idx_t): staff_idx_t {
        for (let i = startStaffIdx - 1; i >= 0; --i) {
            const s = this.score().staff(i)!
            if (s.show() && this.m_staves[i].show()) {
                return i
            }
        }
        return nidx
    }

    lastVisibleStaff(): staff_idx_t {
        const nstaves = this.score().nstaves()
        for (let i = nstaves - 1; i >= 0; --i) {
            const staff = this.score().staff(i)!
            if (staff.show() && this.m_staves[i].show()) {
                return i
            }
        }
        return nidx
    }

    distance(): number { return this.m_distance }
    setDistance(d: number): void { this.m_distance = d }

    firstSysStaffOfPart(part: Part): staff_idx_t {
        let staffIdx = 0
        for (const p of this.score().parts()) {
            if (p === part) {
                return staffIdx
            }
            staffIdx += p.nstaves()
        }
        return nidx // Part not found.
    }

    firstVisibleSysStaffOfPart(part: Part): staff_idx_t {
        const firstIdx = this.firstSysStaffOfPart(part)
        if (firstIdx === nidx) {
            return nidx
        }
        for (let idx = firstIdx; idx < firstIdx + part.nstaves(); ++idx) {
            const s = this.staff(idx)
            if (s && s.show()) {
                return idx
            }
        }
        return nidx // No visible staves on this part.
    }

    lastSysStaffOfPart(part: Part): staff_idx_t {
        const firstIdx = this.firstSysStaffOfPart(part)
        if (firstIdx === nidx) {
            return nidx
        }
        return firstIdx + part.nstaves() - 1
    }

    lastVisibleSysStaffOfPart(part: Part): staff_idx_t {
        const firstStaffIdx = this.firstSysStaffOfPart(part)
        if (firstStaffIdx === nidx) {
            return nidx
        }
        for (let idx = this.lastSysStaffOfPart(part); idx >= firstStaffIdx; --idx) {
            if (this.staff(idx)!.show()) {
                return idx
            }
        }
        return nidx // No visible staves on this part.
    }

    setBracketsXPosition(xPosition: number): void {
        for (const b1 of this.m_brackets) {
            const bracketType = b1.bracketType()
            let lineWidthCorrection = 0.0
            if (bracketType === BracketType.NORMAL || bracketType === BracketType.LINE) {
                lineWidthCorrection = this.style().styleMM(Sid.bracketWidth) / 2
            }
            let xOffset = 0
            for (const b2 of this.m_brackets) {
                if (!b2.bracketItem().visible()) {
                    continue
                }
                const b1FirstStaffInB2 = (b1.firstStaff() >= b2.firstStaff() && b1.firstStaff() <= b2.lastStaff())
                const b1LastStaffInB2 = (b1.lastStaff() >= b2.firstStaff() && b1.lastStaff() <= b2.lastStaff())
                if (b1.column() > b2.column() && (b1FirstStaffInB2 || b1LastStaffInB2)) {
                    xOffset += b2.ldata().bracketWidth
                }
            }
            const x = xPosition - xOffset - b1.ldata().bracketWidth + lineWidthCorrection
            b1.mutldata().setPosX(x)
        }
    }

    getBracketsColumnsCount(): number {
        let columns = 0
        for (const staff of this.score().staves()) {
            for (const bi of staff.brackets()) {
                columns = Math.max(columns, bi.column() + 1)
            }
        }
        return columns
    }

    // TODO(port): system locks, staff visibility indicators
    isLocked(): boolean { return false }
}
