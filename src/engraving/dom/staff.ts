/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/staff.h/.cpp (engraving relevant parts)
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { Color } from '../../framework/draw/types/color'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import {
    AutoOnOff, BracketType, ClefType, ElementType, Key, MeasureNumberPlacement, StaffGroup, VOICES, nidx,
    type staff_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem } from './engravingitem'
import { ClefList, ClefTypeList } from './clefinfo'
import { KeyList, KeySigEvent } from './key'
import { Pid } from './property'
import { Interval } from './interval'
import { Transpose } from '../editing/transpose'
import { StaffType, StaffTypeList } from './stafftype'
import type { Part } from './part'
import type { InstrumentTemplate } from './instrtemplate'
import type { BracketItem } from './bracketitem'
import type { Clef } from './clef'
import type { TimeSig } from './timesig'
import type { Groups } from './groups'
import type { Ottava } from './ottava'
import type { BarLine } from './barline'
import { SegmentType } from './segment'

/** set by bracketitem.ts (avoids a module cycle) */
export let createBracketItemHook: (staff: Staff) => BracketItem = () => { throw new Error('BracketItem not registered') }
export function setCreateBracketItemHook(f: (staff: Staff) => BracketItem): void { createBracketItemHook = f }

/** set by groups.ts */
export let groupsEndingsHook: (f: Fraction) => Groups = () => { throw new Error('Groups not registered') }
export function setGroupsEndingsHook(f: (f: Fraction) => Groups): void { groupsEndingsHook = f }

export class Staff extends EngravingItem {
    private m_id = ''
    private m_part: Part
    private m_clefs = new ClefList()
    private m_defaultClefType = new ClefTypeList()
    private m_keys = new KeyList()
    private m_timesigs = new SortedMap<TimeSig>()
    private m_brackets: BracketItem[] = []
    private m_barLineSpan = false // true - span barline to next staff
    private m_barLineFrom = 0 // line of start staff to draw the barline from (0 = staff top line, ...)
    private m_barLineTo = 0 // line of end staff to draw the bar line to (0= staff bottom line, ...)
    private m_cutaway = false
    private m_showIfEntireSystemEmpty = false // show this staff if system is empty and hideEmptyStaves is true
    private m_hideSystemBarLine = false // no system barline if not preceded by staff with barline
    private m_mergeMatchingRests: AutoOnOff = AutoOnOff.AUTO // merge matching rests in multiple voices
    private m_hideWhenEmpty: AutoOnOff = AutoOnOff.AUTO // hide empty staves
    private m_userDist = new Spatium(0) // user edited extra distance
    private m_staffTypeList = new StaffTypeList()
    private m_showMeasureNumbers: AutoOnOff = AutoOnOff.AUTO
    private m_visibilityVoices = [true, true, true, true]
    private m_pitchOffsetMap = new Map<number, number>()

    constructor(part: Part) {
        super(ElementType.STAFF, null)
        this.m_part = part
        this.setScore(part.score())
    }

    id(): string { return this.m_id }
    setId(id: string): void { this.m_id = id }

    idx(): staff_idx_t { return this.score().staves().indexOf(this) }
    rstaff(): staff_idx_t { return this.m_part.staves().indexOf(this) }
    isTop(): boolean { return this.m_part.staves().length > 0 && this.m_part.staves()[0] === this }

    override part(): Part { return this.m_part }
    setPart(p: Part): void { this.m_part = p }
    partName(): string { return this.m_part.partName() }

    // brackets

    private fillBrackets(idx: number): void {
        for (let i = this.m_brackets.length; i <= idx; ++i) {
            const bi = createBracketItemHook(this)
            bi.setColumn(i)
            this.m_brackets.push(bi)
        }
    }

    private cleanBrackets(): void {
        while (this.m_brackets.length && this.m_brackets[this.m_brackets.length - 1].bracketType() === BracketType.NO_BRACKET) {
            this.m_brackets.pop()
        }
    }

    bracketType(idx: number): BracketType {
        return idx < this.m_brackets.length ? this.m_brackets[idx].bracketType() : BracketType.NO_BRACKET
    }

    bracketSpan(idx: number): number {
        return idx < this.m_brackets.length ? this.m_brackets[idx].bracketSpan() : 0
    }

    setBracketType(idx: number, val: BracketType): void {
        this.fillBrackets(idx)
        this.m_brackets[idx].setBracketType(val)
        this.cleanBrackets()
    }

    setBracketSpan(idx: number, val: number): void {
        this.fillBrackets(idx)
        this.m_brackets[idx].setBracketSpan(val)
    }

    setBracketVisible(idx: number, v: boolean): void {
        this.fillBrackets(idx)
        this.m_brackets[idx].setVisible(v)
    }

    brackets(): BracketItem[] { return this.m_brackets }

    changeBracketColumn(oldColumn: number, newColumn: number): void {
        const idx = Math.max(oldColumn, newColumn)
        this.fillBrackets(idx)
        const step = newColumn > oldColumn ? 1 : -1
        for (let i = oldColumn; i !== newColumn; i += step) {
            const oldIdx = i
            const newIdx = i + step
            this.m_brackets[oldIdx].setColumn(newIdx)
            this.m_brackets[newIdx].setColumn(oldIdx)
            const b = this.m_brackets[oldIdx]
            this.m_brackets[oldIdx] = this.m_brackets[newIdx]
            this.m_brackets[newIdx] = b
        }
        this.cleanBrackets()
    }

    bracketLevels(): number {
        let columns = 0
        for (const bi of this.m_brackets) {
            columns = Math.max(columns, bi.column())
        }
        return columns
    }

    cleanupBrackets(): void {
        const index = this.idx()
        const n = this.score().nstaves()
        for (const b of this.m_brackets) {
            if (b.bracketType() === BracketType.NO_BRACKET) {
                continue
            }
            const span = b.bracketSpan()
            if (span > (n - index)) {
                b.setBracketSpan(n - index)
            }
        }
        for (let i = 0; i < this.m_brackets.length; ++i) {
            if (this.m_brackets[i].bracketType() === BracketType.NO_BRACKET) {
                continue
            }
            const span = this.m_brackets[i].bracketSpan()
            if (span <= 1) {
                this.m_brackets[i] = createBracketItemHook(this)
            } else {
                // delete all other brackets with same span
                for (let k = i + 1; k < this.m_brackets.length; ++k) {
                    if (span === this.m_brackets[k].bracketSpan()) {
                        this.m_brackets[k] = createBracketItemHook(this)
                    }
                }
            }
        }
    }

    /** Return type inner bracket. The bracket type determines the staff distance. */
    innerBracket(): BracketType {
        const staffIdx = this.idx()
        let t = BracketType.NO_BRACKET
        let level = 1000
        for (let i = 0; i < this.score().nstaves(); ++i) {
            const staff = this.score().staff(i)!
            for (let k = 0; k < staff.brackets().length; ++k) {
                const bi = staff.brackets()[k]
                if (bi.bracketType() !== BracketType.NO_BRACKET) {
                    if (i < staffIdx && ((i + bi.bracketSpan()) > staffIdx) && k < level) {
                        t = bi.bracketType()
                        level = k
                        break
                    }
                }
            }
        }
        return t
    }

    // clefs

    clefList(): ClefList { return this.m_clefs }

    clefType(tick: Fraction): ClefTypeList {
        let ct = this.m_clefs.clef(tick.ticks())
        if (ct.concertClef === ClefType.INVALID) {
            // Clef compatibility based on instrument (override StaffGroup)
            let staffGroup = this.staffType(tick).group()
            if (staffGroup !== StaffGroup.TAB) {
                staffGroup = this.part().instrument(tick).useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
            }
            switch (staffGroup) {
            case StaffGroup.TAB: {
                const sct = this.style().styleI(Sid.tabClef) as ClefType
                ct = this.staffType(tick).lines() <= 4
                    ? new ClefTypeList(sct === ClefType.TAB ? ClefType.TAB4 : ClefType.TAB4_SERIF)
                    : new ClefTypeList(sct === ClefType.TAB ? ClefType.TAB : ClefType.TAB_SERIF)
                break
            }
            case StaffGroup.STANDARD:
                ct = this.defaultClefType()
                break
            case StaffGroup.PERCUSSION:
                ct = new ClefTypeList(ClefType.PERC)
                break
            }
        }
        return ct
    }

    defaultClefType(): ClefTypeList { return this.m_defaultClefType }
    setDefaultClefType(l: ClefTypeList): void { this.m_defaultClefType = l.clone() }

    clef(tick: Fraction): ClefType {
        const c = this.clefType(tick)
        return this.style().styleB(Sid.concertPitch) ? c.concertClef : c.transposingClef
    }

    nextClefTick(tick: Fraction): Fraction {
        const t = Fraction.fromTicks(this.m_clefs.nextClefTick(tick.ticks()))
        return !t.eq(new Fraction(-1, 1)) ? t : this.score().endTick()
    }

    currentClefTick(tick: Fraction): Fraction {
        return Fraction.fromTicks(this.m_clefs.currentClefTick(tick.ticks()))
    }

    setClef(clef: Clef): void {
        if (clef.generated()) {
            return
        }
        const tick = clef.segment().tick()
        for (let s = clef.segment().next1(); s && s.tick().eq(tick); s = s.next1()) {
            if ((s.segmentType() === 0x400 /* Clef */ || s.segmentType() === 0x2 /* HeaderClef */)
                && s.element(clef.track())
                && !s.element(clef.track())!.generated()) {
                // adding this clef has no effect on the clefs list
                return
            }
        }
        this.m_clefs.setClef(clef.segment().tick().ticks(), clef.clefTypeList())
    }

    removeClef(clef: Clef): void {
        if (clef.generated()) {
            return
        }
        this.m_clefs.erase(clef.segment().tick().ticks())
    }

    // time signatures

    addTimeSig(timesig: TimeSig): void {
        if (timesig.segment().segmentType() === 0x20 /* SegmentType::TimeSig */) {
            this.m_timesigs.set(timesig.segment().tick().ticks(), timesig)
        }
    }

    removeTimeSig(timesig: TimeSig): void {
        if (timesig.segment().segmentType() === 0x20 /* SegmentType::TimeSig */) {
            const t = timesig.segment().tick().ticks()
            if (this.m_timesigs.get(t) === timesig) {
                this.m_timesigs.erase(t)
            }
        }
    }

    clearTimeSig(): void { this.m_timesigs.clear() }

    timeStretch(tick: Fraction): Fraction {
        const timesig = this.timeSig(tick)
        return timesig ? timesig.stretch() : new Fraction(1, 1)
    }

    /** lookup time signature before or at tick */
    timeSig(tick: Fraction): TimeSig | null {
        if (this.m_timesigs.empty()) {
            return null
        }
        let i = this.m_timesigs.upperBound(tick.ticks())
        if (i !== 0) {
            --i
        }
        if (tick.lt(Fraction.fromTicks(this.m_timesigs.keyAt(i)))) {
            return null
        }
        return this.m_timesigs.valueAt(i)
    }

    /** lookup time signature at tick or after */
    nextTimeSig(tick: Fraction): TimeSig | null {
        const i = this.m_timesigs.lowerBound(tick.ticks())
        return i === this.m_timesigs.size() ? null : this.m_timesigs.valueAt(i)
    }

    currentTimeSigTick(tick: Fraction): Fraction {
        if (this.m_timesigs.empty()) {
            return new Fraction(0, 1)
        }
        const i = this.m_timesigs.upperBound(tick.ticks())
        if (i === 0) {
            return new Fraction(0, 1)
        }
        return Fraction.fromTicks(this.m_timesigs.keyAt(i - 1))
    }

    group(tick: Fraction): Groups {
        const ts = this.timeSig(tick)
        if (ts) {
            if (!ts.groups().empty()) {
                return ts.groups()
            }
            return groupsEndingsHook(ts.sig())
        }
        const m = this.score().tick2measure(tick)
        return groupsEndingsHook(m ? m.timesig() : new Fraction(4, 4))
    }

    // keys

    keyList(): KeyList { return this.m_keys }
    key(tick: Fraction): Key { return this.keySigEvent(tick).key() }
    concertKey(tick: Fraction): Key { return this.keySigEvent(tick).concertKey() }
    /** get real transposition */
    transpose(tick: Fraction): Interval {
        const v = this.part().instrument(tick).transpose().clone()
        if (v.isZero()) {
            return v
        }
        const cKey = this.concertKey(tick)
        v.flip()
        const tKey = Transpose.transposeKey(cKey, v, this.part().preferSharpFlat())
        v.flip()

        let chromatic = (7 * (cKey - tKey)) % 12
        if (chromatic < 0) {
            chromatic += 12
        }
        let diatonic = (4 * (cKey - tKey)) % 7
        if (diatonic < 0) {
            diatonic += 7
        }
        if (v.chromatic < 0 || v.diatonic < 0) {
            chromatic -= 12
            diatonic -= 7
        }
        v.chromatic = v.chromatic - (v.chromatic % 12) + (chromatic % 12)
        v.diatonic = v.diatonic - (v.diatonic % 7) + (diatonic % 7)
        return v
    }

    keySigEvent(tick: Fraction): KeySigEvent { return this.m_keys.key(tick.ticks()) }
    setKey(tick: Fraction, k: KeySigEvent): void { this.m_keys.setKey(tick.ticks(), k) }
    removeKey(tick: Fraction): void { this.m_keys.erase(tick.ticks()) }
    prevKey(tick: Fraction): KeySigEvent { return this.m_keys.prevKey(tick.ticks()) }

    nextKeyTick(tick: Fraction): Fraction {
        const t = Fraction.fromTicks(this.m_keys.nextKeyTick(tick.ticks()))
        return !t.eq(new Fraction(-1, 1)) ? t : this.score().endTick()
    }

    currentKeyTick(tick: Fraction): Fraction {
        return Fraction.fromTicks(this.m_keys.currentKeyTick(tick.ticks()))
    }

    // visibility

    show(): boolean { return this.m_part.show() && this.visible() }

    stemless(tick: Fraction): boolean { return this.staffType(tick).stemless() }
    cutaway(): boolean { return this.m_cutaway }
    setCutaway(val: boolean): void { this.m_cutaway = val }
    showIfEntireSystemEmpty(): boolean { return this.m_showIfEntireSystemEmpty }
    setShowIfEntireSystemEmpty(val: boolean): void { this.m_showIfEntireSystemEmpty = val }
    hideSystemBarLine(): boolean { return this.m_hideSystemBarLine }
    setHideSystemBarLine(val: boolean): void { this.m_hideSystemBarLine = val }
    hideWhenEmpty(): AutoOnOff { return this.m_hideWhenEmpty }
    setHideWhenEmpty(v: AutoOnOff): void { this.m_hideWhenEmpty = v }
    mergeMatchingRests(): AutoOnOff { return this.m_mergeMatchingRests }
    setMergeMatchingRests(val: AutoOnOff): void { this.m_mergeMatchingRests = val }

    shouldMergeMatchingRests(): boolean {
        return this.mergeMatchingRests() === AutoOnOff.ON
               || (this.mergeMatchingRests() === AutoOnOff.AUTO && this.style().styleB(Sid.mergeMatchingRests))
    }

    barLineSpan(): boolean { return this.m_barLineSpan }
    barLineFrom(): number { return this.m_barLineFrom }
    barLineTo(): number { return this.m_barLineTo }
    setBarLineSpan(val: boolean): void { this.m_barLineSpan = val }
    setBarLineFrom(val: number): void { this.m_barLineFrom = val }
    setBarLineTo(val: number): void { this.m_barLineTo = val }

    staffHeight(tick: Fraction = new Fraction(0, 1)): number {
        return (this.lines(tick) - 1) * this.spatiumAt(tick) * this.staffType(tick).lineDistance().val()
    }

    // staff types

    override staffType(tick: Fraction = new Fraction(0, 1)): StaffType {
        return this.m_staffTypeList.staffType(tick)
    }

    constStaffType(tick: Fraction): StaffType { return this.staffType(tick) }

    staffTypeForElement(e: EngravingItem): StaffType {
        if (this.m_staffTypeList.uniqueStaffType()) {
            // if one staff type spans for the entire staff, optimize by omitting a call to `tick()`
            return this.m_staffTypeList.staffType(new Fraction(0, 1))
        }
        // Handle items at the last tick of measures as StaffTypeList::staffType rounds up
        const measure = e.findMeasure()
        const tick = measure ? measure.tick() : e.tick()
        return this.m_staffTypeList.staffType(tick)
    }

    setStaffType(tick: Fraction, nst: StaffType): StaffType {
        const st = this.m_staffTypeList.setStaffType(tick, nst)
        st.setStyle(this.m_score ? this.style() : null)
        return st
    }

    isStaffTypeStartFrom(tick: Fraction): boolean { return this.m_staffTypeList.isStaffTypeStartFrom(tick) }
    removeStaffType(tick: Fraction): void { this.m_staffTypeList.removeStaffType(tick) }

    /** C++ Staff::init(const InstrumentTemplate*, const StaffType*, int) */
    init(t: InstrumentTemplate, staffType: StaffType | null, cidx: number): void {
        // set staff-type-independent parameters
        let pst = staffType ? staffType : t.staffTypePreset
        if (!pst) {
            pst = StaffType.getDefaultPreset(t.staffGroup)
        }

        const stt = this.setStaffType(new Fraction(0, 1), pst)
        if (cidx >= 4 /* MAX_STAVES */) {
            stt.setSmall(false)
        } else {
            stt.setSmall(t.smallStaff[cidx])
            this.setBracketType(0, t.bracket[cidx])
            this.setBracketSpan(0, t.bracketSpan[cidx])
            this.setBarLineSpan(t.barlineSpan[cidx])
        }
        this.setDefaultClefType(t.clefType(cidx))
    }

    /** list of linked staves; TODO(port): linked staves (excerpts) */
    staffList(): Staff[] { return [this] }

    insertTime(tick: Fraction, len: Fraction): void {
        if (len.isZero()) {
            return
        }

        // move all keys and clefs >= tick

        if (len.lt(new Fraction(0, 1))) {
            // remove entries between tickpos >= tick and tickpos < (tick+len)
            this.m_keys.eraseRange(this.m_keys.lowerBound(tick.ticks()), this.m_keys.lowerBound(tick.minus(len).ticks()))
            this.m_clefs.eraseRange(this.m_clefs.lowerBound(tick.ticks()), this.m_clefs.lowerBound(tick.minus(len).ticks()))
        }

        const kl2 = new KeyList()
        for (let i = this.m_keys.lowerBound(tick.ticks()); i < this.m_keys.size();) {
            const kse = this.m_keys.valueAt(i)
            const t = Fraction.fromTicks(this.m_keys.keyAt(i))
            if (t.plus(len).lt(this.score().endTick())) {
                this.m_keys.eraseAt(i)
                kl2.set(t.plus(len).ticks(), kse)
            } else {
                ++i
            }
        }
        for (const [k, v] of kl2.entries()) { // std::map::insert: existing keys are kept
            if (!this.m_keys.has(k)) {
                this.m_keys.set(k, v)
            }
        }

        // check if there is a clef at the end of measure
        // before tick
        let clef: Clef | null = null
        let m = this.score().tick2measure(tick)
        if (m && m.tick().eq(tick) && m.prevMeasure()) {
            m = m.prevMeasure()!
            const s = m.findSegment(SegmentType.Clef, tick)
            if (s) {
                const track = this.idx() * VOICES
                clef = s.element(track) as Clef | null
            }
        }

        const cl2 = new ClefList()
        for (let i = this.m_clefs.lowerBound(tick.ticks()); i < this.m_clefs.size();) {
            const ctl = this.m_clefs.valueAt(i)
            const t = Fraction.fromTicks(this.m_clefs.keyAt(i))
            if (clef && tick.eq(t)) {
                ++i
                continue
            }
            this.m_clefs.eraseAt(i)
            cl2.setClef(t.plus(len).ticks(), ctl)
        }
        for (const [k, v] of cl2.entries()) {
            if (!this.m_clefs.has(k)) {
                this.m_clefs.set(k, v)
            }
        }

        // check if there is a clef at the end of measure
        // before tick: do not remove from clefs list

        if (clef) {
            this.setClef(clef)
        }

        this.updateOttava()
    }

    initFromStaffType(staffType: StaffType | null): void {
        // get staff type if given (if none, get default preset for default staff group)
        if (!staffType) {
            staffType = StaffType.getDefaultPreset(StaffGroup.STANDARD)
        }
        // use selected staff type
        this.setStaffType(new Fraction(0, 1), staffType)
    }

    isPitchedStaff(tick: Fraction): boolean {
        return this.staffType(tick).group() !== StaffGroup.TAB && !this.part().instrument(tick).useDrumset()
    }

    isTabStaff(tick: Fraction): boolean { return this.staffType(tick).group() === StaffGroup.TAB }
    isDrumStaff(tick: Fraction): boolean { return this.part().instrument(tick).useDrumset() }

    lines(tick: Fraction): number { return this.staffType(tick).lines() }
    setLines(tick: Fraction, lines: number): void { this.staffType(tick).setLines(lines) }
    lineDistance(tick: Fraction): number { return this.staffType(tick).lineDistance().val() }
    isLinesInvisible(tick: Fraction): boolean { return this.staffType(tick).invisible() }
    setIsLinesInvisible(tick: Fraction, val: boolean): void { this.staffType(tick).setInvisible(val) }
    middleLine(tick: Fraction): number { return this.staffType(tick).middleLine() }
    bottomLine(tick: Fraction): number { return this.staffType(tick).bottomLine() }
    showLedgerLines(tick: Fraction): boolean { return this.staffType(tick).showLedgerLines() }
    genKeySig(): boolean {
        const st = this.staffType(new Fraction(0, 1))
        return st.group() === StaffGroup.TAB ? false : st.genKeysig()
    }

    staffColor(tick: Fraction): Color { return this.staffType(tick).color() }

    private staffMagForType(stt: StaffType): number {
        return (stt.isSmall() ? this.style().styleD(Sid.smallStaffMag) : 1.0) * stt.userMag()
    }

    /** staffMag(const Fraction&) / staffMag(const EngravingItem*) */
    staffMag(arg: Fraction | EngravingItem): number {
        if (arg instanceof Fraction) {
            return this.staffMagForType(this.staffType(arg))
        }
        return this.staffMagForType(this.staffTypeForElement(arg))
    }

    spatiumAt(tick: Fraction): number {
        return this.style().spatium() * this.staffMag(tick)
    }

    /** Staff::spatium(const EngravingItem*) (EngravingItem::spatium() is overridden by this) */
    override spatium(e?: EngravingItem | Fraction): number {
        if (e === undefined) {
            return this.spatiumAt(new Fraction(0, 1))
        }
        if (e instanceof Fraction) {
            return this.spatiumAt(e)
        }
        return this.style().spatium() * this.staffMag(e)
    }

    userDist(): Spatium { return this.m_userDist }
    setUserDist(val: Spatium): void { this.m_userDist = val }

    isVoiceVisible(voice: number): boolean { return this.m_visibilityVoices[voice] }

    shouldShowMeasureNumbers(): boolean {
        const placementMode = this.style().styleV(Sid.measureNumberPlacementMode) as MeasureNumberPlacement
        switch (placementMode) {
        case MeasureNumberPlacement.ABOVE_SYSTEM:
            return this.score().staves()[0] === this
        case MeasureNumberPlacement.BELOW_SYSTEM:
            return this.score().staves()[this.score().staves().length - 1] === this
        case MeasureNumberPlacement.ON_SYSTEM_OBJECT_STAVES: {
            const isTopStave = this.score().staves()[0] === this
            return (isTopStave && this.m_showMeasureNumbers !== AutoOnOff.OFF)
                   || (this.isSystemObjectStaff() && this.m_showMeasureNumbers === AutoOnOff.ON)
        }
        case MeasureNumberPlacement.ON_ALL_STAVES:
            return this.show()
        }
        return false
    }

    isLastOfScore(): boolean {
        const staves = this.score().staves()
        return staves.length ? staves[staves.length - 1] === this : false
    }

    isSystemObjectStaff(): boolean {
        return !!this.m_score && this.score().systemObjectStaves().includes(this)
    }

    hasSystemObjectsBelowBottomStaff(): boolean {
        return this.isSystemObjectStaff() && this.isLastOfScore() && this.style().styleB(Sid.systemObjectsBelowBottomStaff)
    }

    isPrimaryStaff(): boolean { return true }

    updateOttava(): void {
        const staffIdx = this.idx()
        this.m_pitchOffsetMap.clear()
        for (const s of this.score().spanner()) {
            if (s.isOttava() && s.staffIdx() === staffIdx && s.playSpanner()) {
                const o = s as Ottava
                this.m_pitchOffsetMap.set(o.tick().ticks(), o.pitchShift())
                this.m_pitchOffsetMap.set(o.tick2().ticks(), 0)
            }
        }
    }

    pitchOffset(tick: Fraction): number {
        if (this.m_pitchOffsetMap.size === 0) {
            return 0
        }
        // C++ muse::findLessOrEqual
        let best = -1
        let val = 0
        for (const [t, v] of this.m_pitchOffsetMap) {
            if (t <= tick.ticks() && t > best) {
                best = t
                val = v
            }
        }
        return val
    }

    override getProperty(id: Pid): PropertyValue {
        const st0 = this.staffType(new Fraction(0, 1))
        switch (id) {
        case Pid.SMALL:
            return st0.isSmall()
        case Pid.MAG:
            return st0.userMag()
        case Pid.STAFF_INVISIBLE:
            return st0.invisible()
        case Pid.HIDE_WHEN_EMPTY:
            return this.m_hideWhenEmpty
        case Pid.STAFF_COLOR:
            return st0.color()
        case Pid.STAFF_BARLINE_SPAN:
            return this.barLineSpan()
        case Pid.STAFF_BARLINE_SPAN_FROM:
            return this.barLineFrom()
        case Pid.STAFF_BARLINE_SPAN_TO:
            return this.barLineTo()
        case Pid.STAFF_USERDIST:
            return this.userDist()
        case Pid.GENERATED:
            return false
        case Pid.SHOW_MEASURE_NUMBERS:
            return this.m_showMeasureNumbers
        case Pid.SHOW_IF_ENTIRE_SYSTEM_EMPTY:
            return this.m_showIfEntireSystemEmpty
        case Pid.VISIBLE:
            return this.visible()
        case Pid.STAFF_CUTAWAY:
            return this.cutaway()
        case Pid.STAFF_HIDE_SYSTEM_BARLINE:
            return this.hideSystemBarLine()
        case Pid.STAFF_MERGE_MATCHING_RESTS:
            return this.mergeMatchingRests()
        default:
            return undefined
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        const st0 = this.staffType(new Fraction(0, 1))
        switch (id) {
        case Pid.SMALL:
            st0.setSmall(!!v)
            break
        case Pid.MAG:
            st0.setUserMag(v as number)
            break
        case Pid.HIDE_WHEN_EMPTY:
            this.setHideWhenEmpty(v as AutoOnOff)
            break
        case Pid.STAFF_COLOR:
            st0.setColor(v as Color)
            break
        case Pid.STAFF_BARLINE_SPAN: {
            this.setBarLineSpan(!!v)
            // update non-generated barlines
            const track = this.idx() * VOICES
            const blList: EngravingItem[] = []
            for (let m = this.score().firstMeasure(); m; m = m.nextMeasure()) {
                const s = m.getSegmentR(SegmentType.EndBarLine, m.ticks())
                if (s && s.element(track)) {
                    blList.push(s.element(track)!)
                }
                const mm = m.mmRest()
                if (mm) {
                    const ss = mm.getSegmentR(SegmentType.EndBarLine, mm.ticks())
                    if (ss && ss.element(track)) {
                        blList.push(ss.element(track)!)
                    }
                }
            }
            for (const e of blList) {
                if (e && e.isBarLine() && !e.generated()) {
                    (e as BarLine).setSpanStaff(this.barLineSpan())
                }
            }
            break
        }
        case Pid.STAFF_BARLINE_SPAN_FROM:
            this.setBarLineFrom(v as number)
            break
        case Pid.STAFF_BARLINE_SPAN_TO:
            this.setBarLineTo(v as number)
            break
        case Pid.STAFF_USERDIST:
            this.setUserDist(v as Spatium)
            break
        case Pid.SHOW_MEASURE_NUMBERS:
            this.m_showMeasureNumbers = v as AutoOnOff
            break
        case Pid.SHOW_IF_ENTIRE_SYSTEM_EMPTY:
            this.m_showIfEntireSystemEmpty = !!v
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            break
        case Pid.STAFF_CUTAWAY:
            this.setCutaway(!!v)
            break
        case Pid.STAFF_HIDE_SYSTEM_BARLINE:
            this.setHideSystemBarLine(!!v)
            break
        case Pid.STAFF_MERGE_MATCHING_RESTS:
            this.setMergeMatchingRests(v as AutoOnOff)
            break
        default:
            return false
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SMALL:
            return false
        case Pid.MAG:
            return 1.0
        case Pid.HIDE_WHEN_EMPTY:
            return AutoOnOff.AUTO
        case Pid.STAFF_COLOR:
            return Color.BLACK
        case Pid.STAFF_BARLINE_SPAN:
            return false
        case Pid.STAFF_BARLINE_SPAN_FROM:
        case Pid.STAFF_BARLINE_SPAN_TO:
            return 0
        case Pid.STAFF_USERDIST:
            return new Spatium(0)
        case Pid.SHOW_MEASURE_NUMBERS:
            return AutoOnOff.AUTO
        case Pid.SHOW_IF_ENTIRE_SYSTEM_EMPTY:
            return false
        case Pid.VISIBLE:
            return true
        case Pid.STAFF_CUTAWAY:
        case Pid.STAFF_HIDE_SYSTEM_BARLINE:
            return false
        case Pid.STAFF_MERGE_MATCHING_RESTS:
            return AutoOnOff.AUTO
        default:
            return undefined
        }
    }
}

export { VOICES, nidx }
