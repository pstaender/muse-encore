/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/measurebase.h/.cpp
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, LayoutBreakType, nidx } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, itemFactories } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Measure } from './measure'
import type { System } from './system'
import type { LayoutBreak } from './layoutbreak'
import type { SystemLock } from './systemlock'

export enum Repeat {
    NONE = 0,
    END = 1,
    START = 2,
    MEASURE = 4,
    JUMP = 8,
}

export abstract class MeasureBase extends EngravingItem {
    protected m_len = new Fraction(0, 1) // actual length of measure
    protected m_el: EngravingItem[] = [] // Measure(/tick) relative -elements: with defined start time

    private m_next: MeasureBase | null = null
    private m_prev: MeasureBase | null = null
    private m_tick = new Fraction(0, 1)
    private m_no = 0 // Measure number, counting from zero
    private m_noOffset = 0 // Offset to measure number

    constructor(type: ElementType, parent: EngravingObject | null) {
        super(type, parent)
        this.setIrregular(true)
    }

    system(): System | null { return this.explicitParent() as unknown as System | null }

    prevNonVBoxSystem(): System | null {
        const mmRests = this.score().style().styleB(Sid.createMultiMeasureRests)
        const curSystem = this.system()
        if (!curSystem) {
            return null
        }
        let prevSystem: System | null = curSystem
        for (let mb: MeasureBase | null = this; mb && prevSystem === curSystem; mb = mmRests ? mb.prevMM() : mb.prev()) {
            if (mb.isMeasure() || mb.isHBox()) {
                prevSystem = mb.system()
            } else {
                return null
            }
        }
        return prevSystem !== curSystem ? prevSystem : null
    }

    nextNonVBoxSystem(): System | null {
        const mmRests = this.score().style().styleB(Sid.createMultiMeasureRests)
        const curSystem = this.system()
        if (!curSystem) {
            return null
        }
        let nextSystem: System | null = curSystem
        for (let mb: MeasureBase | null = this; mb && nextSystem === curSystem; mb = mmRests ? mb.nextMM() : mb.next()) {
            if (mb.isMeasure() || mb.isHBox()) {
                nextSystem = mb.system()
            } else {
                return null
            }
        }
        return nextSystem !== curSystem ? nextSystem : null
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.isMeasure()) {
            for (const e of this.m_el) {
                const staffIdx = e.staffIdx()
                if ((e.track() === nidx) || e.systemFlag() || (this as unknown as Measure).visible(staffIdx)) {
                    e.scanElements(func)
                }
            }
        } else {
            for (const e of this.m_el) {
                e.scanElements(func)
            }
        }
        if (this.isBox()) {
            func(this)
        }
    }

    next(): MeasureBase | null { return this.m_next }
    setNext(e: MeasureBase | null): void { this.m_next = e }
    prev(): MeasureBase | null { return this.m_prev }
    setPrev(e: MeasureBase | null): void { this.m_prev = e }

    nextMM(): MeasureBase | null {
        if (this.m_next
            && this.m_next.isMeasure()
            && this.style().styleB(Sid.createMultiMeasureRests)
            && (this.m_next as unknown as Measure).hasMMRest()) {
            return (this.m_next as unknown as Measure).mmRest()
        }
        return this.m_next
    }

    prevMM(): MeasureBase | null {
        if (this.m_prev
            && this.m_prev.isMeasure()
            && this.style().styleB(Sid.createMultiMeasureRests)) {
            return (this.m_prev as unknown as Measure).coveringMMRestOrThis()
        }
        return this.m_prev
    }

    override triggerLayout(): void {
        // for measurebases within other measurebases (e.g., hbox within vbox), use top level
        const mb = this.top()
        // avoid triggering layout before getting added to a score
        if (mb.prev() || mb.next()) {
            this.score().setLayout(mb.tick(), nidx, mb)
        }
    }

    top(): MeasureBase {
        let mb: MeasureBase = this
        while (mb.explicitParent()) {
            if (mb.explicitParent()!.isMeasureBase()) {
                mb = mb.explicitParent() as unknown as MeasureBase
            } else {
                break
            }
        }
        return mb
    }

    nextMeasure(): Measure | null {
        let m = this.m_next
        for (;;) {
            if (m === null || m.isMeasure()) {
                break
            }
            m = m.m_next
        }
        return m as unknown as Measure | null
    }

    prevMeasure(): Measure | null {
        let m = this.prev()
        while (m) {
            if (m.isMeasure()) {
                return m as unknown as Measure
            }
            m = m.prev()
        }
        return null
    }

    nextMeasureMM(): Measure | null {
        const mm = this.nextMeasure()
        if (mm && this.style().styleB(Sid.createMultiMeasureRests) && mm.hasMMRest()) {
            return mm.mmRest()
        }
        return mm
    }

    prevMeasureMM(): Measure | null {
        const m = this.prevMeasure()
        if (m) {
            return m.coveringMMRestOrThis()
        }
        return null
    }

    el(): EngravingItem[] { return this.m_el }

    /**
     * we're trying to find the MeasureBase that determines
     * if the next one after this starts a new section
     */
    mbWithPrecedingSectionBreak(): MeasureBase | null {
        let mb: MeasureBase | null = this
        while (mb && !mb.isMeasure() && !mb.sectionBreak()) {
            mb = mb.prev()
        }
        return mb
    }

    sectionBreakElement(): LayoutBreak | null {
        if (this.sectionBreak()) {
            for (const e of this.el()) {
                if (e.isLayoutBreak() && (e as LayoutBreak).isSectionBreak()) {
                    return e as LayoutBreak
                }
            }
        }
        return null
    }

    moveTicks(diff: Fraction): void { this.setTick(this.tick().plus(diff)) }

    override add(e: EngravingItem): void {
        if (e.explicitParent() !== this) {
            e.setParent(this)
        }
        if (e.isLayoutBreak()) {
            const b = e as LayoutBreak
            switch (b.layoutBreakType()) {
            case LayoutBreakType.PAGE:
                this.setPageBreak(true)
                this.setLineBreak(false)
                this.setNoBreak(false)
                break
            case LayoutBreakType.LINE:
                this.setPageBreak(false)
                this.setLineBreak(true)
                this.setSectionBreak(false)
                this.setNoBreak(false)
                break
            case LayoutBreakType.SECTION:
                this.setLineBreak(false)
                this.setSectionBreak(true)
                this.setNoBreak(false)
                break
            case LayoutBreakType.NOBREAK:
                this.setPageBreak(false)
                this.setLineBreak(false)
                this.setSectionBreak(false)
                this.setNoBreak(true)
                break
            }
        }
        this.m_el.push(e)
    }

    override remove(el: EngravingItem): void {
        if (el.isLayoutBreak()) {
            const lb = el as LayoutBreak
            switch (lb.layoutBreakType()) {
            case LayoutBreakType.PAGE: this.setPageBreak(false); break
            case LayoutBreakType.LINE: this.setLineBreak(false); break
            case LayoutBreakType.SECTION: this.setSectionBreak(false); break
            case LayoutBreakType.NOBREAK: this.setNoBreak(false); break
            }
        }
        const i = this.m_el.indexOf(el)
        if (i >= 0) {
            this.m_el.splice(i, 1)
        }
    }

    override tick(): Fraction {
        const mb = this.top()
        return mb ? mb.m_tick : new Fraction(-1, 1)
    }

    setTick(f: Fraction): void { this.m_tick = f }
    ticks(): Fraction { return this.m_len }
    setTicks(f: Fraction): void { this.m_len = f }
    endTick(): Fraction { return this.m_tick.plus(this.m_len) }

    pause(): number {
        const layoutBreak = this.sectionBreakElement()
        return layoutBreak ? layoutBreak.pause() : 0.0
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.REPEAT_END:
            return this.repeatEnd()
        case Pid.REPEAT_START:
            return this.repeatStart()
        case Pid.REPEAT_JUMP:
            return this.repeatJump()
        case Pid.NO_OFFSET:
            return this.noOffset()
        case Pid.IRREGULAR:
            return this.irregular()
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, value: PropertyValue): boolean {
        switch (id) {
        case Pid.REPEAT_END:
            this.setRepeatEnd(!!value)
            break
        case Pid.REPEAT_START:
            this.setRepeatStart(!!value)
            break
        case Pid.REPEAT_JUMP:
            this.setRepeatJump(!!value)
            break
        case Pid.NO_OFFSET:
            this.setNoOffset(value as number)
            break
        case Pid.IRREGULAR:
            this.setIrregular(!!value)
            break
        default:
            return super.setProperty(id, value)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.REPEAT_END:
        case Pid.REPEAT_START:
        case Pid.REPEAT_JUMP:
            return false
        default:
            return super.propertyDefault(propertyId)
        }
    }

    clearElements(): void { this.m_el = [] }

    takeElements(): EngravingItem[] {
        const l = this.m_el
        this.m_el = []
        return l
    }

    no(): number { return this.m_no }
    setNo(n: number): void { this.m_no = n }
    noOffset(): number { return this.m_noOffset }
    setNoOffset(n: number): void { this.m_noOffset = n }

    repeatEnd(): boolean { return this.flag(ElementFlag.REPEAT_END) }
    setRepeatEnd(v: boolean): void { this.setFlag(ElementFlag.REPEAT_END, v) }
    repeatStart(): boolean { return this.flag(ElementFlag.REPEAT_START) }
    setRepeatStart(v: boolean): void { this.setFlag(ElementFlag.REPEAT_START, v) }
    repeatJump(): boolean { return this.flag(ElementFlag.REPEAT_JUMP) }
    setRepeatJump(v: boolean): void { this.setFlag(ElementFlag.REPEAT_JUMP, v) }
    irregular(): boolean { return this.flag(ElementFlag.IRREGULAR) }
    setIrregular(v: boolean): void { this.setFlag(ElementFlag.IRREGULAR, v) }
    /** remove unneeded layout breaks */
    cleanupLayoutBreaks(undo: boolean): void {
        const toDelete: EngravingItem[] = []
        for (const e of this.el()) {
            if (e.isLayoutBreak()) {
                switch ((e as unknown as LayoutBreak).layoutBreakType()) {
                case LayoutBreakType.LINE:
                    if (!this.lineBreak()) {
                        toDelete.push(e)
                    }
                    break
                case LayoutBreakType.PAGE:
                    if (!this.pageBreak()) {
                        toDelete.push(e)
                    }
                    break
                case LayoutBreakType.SECTION:
                    if (!this.sectionBreak()) {
                        toDelete.push(e)
                    }
                    break
                case LayoutBreakType.NOBREAK:
                    if (!this.noBreak()) {
                        toDelete.push(e)
                    }
                    break
                }
            }
        }
        for (const e of toDelete) {
            if (undo) {
                this.score().undoRemoveElement(e)
            } else {
                const i = this.el().indexOf(e)
                if (i >= 0) {
                    this.el().splice(i, 1)
                }
            }
        }
    }

    undoSetBreak(v: boolean, type: LayoutBreakType): void {
        switch (type) {
        case LayoutBreakType.LINE:
            if (this.lineBreak() === v) {
                return
            }
            this.setLineBreak(v)
            break
        case LayoutBreakType.PAGE:
            if (this.pageBreak() === v) {
                return
            }
            if (v && this.lineBreak()) {
                this.setLineBreak(false)
            }
            this.setPageBreak(v)
            break
        case LayoutBreakType.SECTION:
            if (this.sectionBreak() === v) {
                return
            }
            if (v && this.lineBreak()) {
                this.setLineBreak(false)
            }
            this.setSectionBreak(v)
            break
        case LayoutBreakType.NOBREAK:
            if (this.noBreak() === v) {
                return
            }
            if (v) {
                this.setLineBreak(false)
                this.setPageBreak(false)
                this.setSectionBreak(false)
            }
            this.setNoBreak(v)
            break
        }

        if (v) {
            const m = this as unknown as { isMMRest(): boolean; mmRestLast(): MeasureBase | null }
            const mb: MeasureBase = (this.isMeasure() && m.isMMRest()) ? m.mmRestLast()! : this
            const lb = itemFactories.createItem!(ElementType.LAYOUT_BREAK, mb) as LayoutBreak
            lb.setLayoutBreakType(type)
            lb.setTrack(0)
            lb.setParent(mb)
            this.score().undoAddElement(lb)
        }
        this.cleanupLayoutBreaks(true)
    }

    lineBreak(): boolean { return this.flag(ElementFlag.LINE_BREAK) }
    setLineBreak(v: boolean): void { this.setFlag(ElementFlag.LINE_BREAK, v) }
    pageBreak(): boolean { return this.flag(ElementFlag.PAGE_BREAK) }
    setPageBreak(v: boolean): void { this.setFlag(ElementFlag.PAGE_BREAK, v) }
    sectionBreak(): boolean { return this.flag(ElementFlag.SECTION_BREAK) }
    setSectionBreak(v: boolean): void { this.setFlag(ElementFlag.SECTION_BREAK, v) }
    noBreak(): boolean { return this.flag(ElementFlag.NO_BREAK) }
    setNoBreak(v: boolean): void { this.setFlag(ElementFlag.NO_BREAK, v) }
    hasCourtesyKeySig(): boolean { return this.flag(ElementFlag.COURTESY_KEYSIG) }
    setHasCourtesyKeySig(v: boolean): void { this.setFlag(ElementFlag.COURTESY_KEYSIG, v) }
    hasCourtesyTimeSig(): boolean { return this.flag(ElementFlag.COURTESY_TIMESIG) }
    setHasCourtesyTimeSig(v: boolean): void { this.setFlag(ElementFlag.COURTESY_TIMESIG, v) }
    hasCourtesyClef(): boolean { return this.flag(ElementFlag.COURTESY_CLEF) }
    setHasCourtesyClef(v: boolean): void { this.setFlag(ElementFlag.COURTESY_CLEF, v) }
    endOfMeasureChange(): boolean { return this.flag(ElementFlag.END_OF_MEASURE_CHANGE) }
    setEndOfMeasureChange(val: boolean): void { this.setFlag(ElementFlag.END_OF_MEASURE_CHANGE, val) }

    computeMinWidth(): void {}

    index(): number {
        let idx = 0
        let m = this.score().first()
        let mmRestFirst: Measure | null = null
        if (this.isMeasure() && (this as unknown as Measure).isMMRest()) {
            mmRestFirst = (this as unknown as Measure).mmRestFirst()
        }
        while (m) {
            if (m === this || m === mmRestFirst) {
                return idx
            }
            m = m.next()
            ++idx
        }
        return -1
    }

    measureIndex(): number {
        let idx = 0
        let m: MeasureBase | null = this.score().firstMeasure()
        let mmRestFirst: Measure | null = null
        if (this.isMeasure() && (this as unknown as Measure).isMMRest()) {
            mmRestFirst = (this as unknown as Measure).mmRestFirst()
        }
        while (m) {
            if (m === this || m === mmRestFirst) {
                return idx
            }
            m = m.next()
            if (m && m.isMeasure()) {
                ++idx
            }
        }
        return -1
    }

    override isBefore(other: EngravingItem | null): boolean {
        if (other && !other.isMeasureBase()) {
            return super.isBefore(other)
        }
        return this.isBeforeMeasureBase(other as MeasureBase)
    }

    isBeforeMeasureBase(other: MeasureBase): boolean {
        if (this === other) {
            return false
        }
        const otherTick = other.tick()
        if (!otherTick.eq(this.m_tick)) {
            return this.m_tick.lt(otherTick)
        }
        if (this.isMeasure() && other.isMeasure()) {
            // Let's set by convention that the mmRest isBefore the underlying measure.
            return (this as unknown as Measure).isMMRest()
        }
        const otherIsMMRest = other.isMeasure() && (other as unknown as Measure).isMMRest()
        for (let mb = otherIsMMRest ? this.nextMM() : this.next(); mb && mb.tick().eq(this.m_tick);
            mb = otherIsMMRest ? mb.nextMM() : mb.next()) {
            if (mb === other) {
                return true
            }
        }
        return false
    }

    isBeforeOrEqual(other: MeasureBase): boolean { return other === this || this.isBefore(other) }
    isAfter(other: MeasureBase): boolean { return !this.isBeforeOrEqual(other) }
    isAfterOrEqual(other: MeasureBase): boolean { return !this.isBefore(other) }

    systemLock(): SystemLock | null {
        return this.score().systemLocks().lockContaining(this)
    }

    isStartOfSystemLock(): boolean {
        return this.score().systemLocks().lockStartingAt(this) !== null
    }

    isEndOfSystemLock(): boolean {
        const lock = this.systemLock()
        return !!lock && lock.endMB() === this
    }
}

export class MeasureBaseList {
    private m_size = 0
    private m_first: MeasureBase | null = null
    private m_last: MeasureBase | null = null
    private m_tickIndex = new SortedMap<MeasureBase>(true)

    first(): MeasureBase | null { return this.m_first }
    last(): MeasureBase | null { return this.m_last }
    size(): number { return this.m_size }
    empty(): boolean { return this.m_size === 0 }

    clear(): void {
        this.m_first = null
        this.m_last = null
        this.m_size = 0
        this.m_tickIndex.clear()
    }

    private push_back(m: MeasureBase): void {
        ++this.m_size
        if (this.m_last) {
            this.m_last.setNext(m)
            m.setPrev(this.m_last)
            m.setNext(null)
        } else {
            this.m_first = m
            m.setPrev(null)
            m.setNext(null)
        }
        this.m_last = m
    }

    private push_front(m: MeasureBase): void {
        ++this.m_size
        if (this.m_first) {
            this.m_first.setPrev(m)
            m.setNext(this.m_first)
            m.setPrev(null)
        } else {
            this.m_last = m
            m.setPrev(null)
            m.setNext(null)
        }
        this.m_first = m
    }

    add(m: MeasureBase): void {
        const el = m.next()
        if (!el) {
            this.append(m)
            return
        }
        if (el === this.m_first) {
            this.push_front(m)
            return
        }
        ++this.m_size
        m.setPrev(el.prev())
        el.prev()!.setNext(m)
        el.setPrev(m)
    }

    /** insert the linked range fm..lm (fm.prev() and lm.next() are set); the tick index is updated by setUpTempoMap() */
    insert(fm: MeasureBase, lm: MeasureBase): void {
        for (let m: MeasureBase | null = fm; m !== lm; m = m!.next()) {
            ++this.m_size
        }
        ++this.m_size
        const pm = fm.prev()
        if (pm) {
            pm.setNext(fm)
        } else {
            this.m_first = fm
        }
        const nm = lm.next()
        if (nm) {
            nm.setPrev(lm)
        } else {
            this.m_last = lm
        }
    }

    remove(m: MeasureBase): void {
        --this.m_size
        if (m.prev()) {
            m.prev()!.setNext(m.next())
        } else {
            this.m_first = m.next()
        }
        if (m.next()) {
            m.next()!.setPrev(m.prev())
        } else {
            this.m_last = m.prev()
        }
    }

    append(m: MeasureBase): void {
        this.push_back(m)
        this.m_tickIndex.insert(m.tick().ticks(), m)
    }

    measureByTick(tick: number): Measure | null {
        if (this.empty() || tick > this.m_last!.endTick().ticks()) {
            return null
        }
        let it = this.m_tickIndex.upperBound(tick)
        if (it === 0) {
            const mb = this.m_tickIndex.valueAt(0)
            return mb.isMeasure() ? mb as unknown as Measure : null
        }
        --it
        for (;; --it) {
            const mb = this.m_tickIndex.valueAt(it)
            if (it === 0) {
                return mb.isMeasure() ? mb as unknown as Measure : null
            }
            if (!mb) {
                break
            }
            if (mb.isMeasure()) {
                return mb as unknown as Measure
            }
        }
        return null
    }

    measureBasesAtTick(tick: number): MeasureBase[] {
        if (this.empty() || tick > this.m_last!.endTick().ticks()) {
            return []
        }
        const result: MeasureBase[] = []
        for (let i = this.m_tickIndex.lowerBound(tick); i < this.m_tickIndex.size() && this.m_tickIndex.keyAt(i) === tick; ++i) {
            result.push(this.m_tickIndex.valueAt(i))
        }
        return result
    }

    updateTickIndex(): void {
        this.m_tickIndex.clear()
        for (let mb = this.m_first; mb; mb = mb.next()) {
            this.m_tickIndex.insert(mb.tick().ticks(), mb)
        }
    }
}
