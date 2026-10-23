/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editstaff.h/.cpp (the staff and MStaff undo commands) and of
 * Measure::cmdAddStaves / Measure::cmdRemoveStaves (measure.cpp), which create these commands: they are added to
 * Measure by this module (module augmentation).
 *
 * Deviation: the commands that insert, remove or sort staves lay out the whole score (setLayoutAll()); in C++ the
 * relayout of these changes is requested by the callers.
 */

import { Fraction } from '../types/fraction'
import { ElementType, VOICES, type AutoOnOff, type staff_idx_t } from '../types/types'
import { Measure, MStaff } from '../dom/measure'
import { SegmentType } from '../dom/segment'
import { StaffLines } from '../dom/stafflines'
import { Factory } from '../dom/factory'
import { allowRemoveWhenRemovingStaves } from '../dom/utils'
import { scoreDummy } from '../compat/dummyelement'
import { CommandType, UndoCommand } from './undo'
import { RemoveElement } from './addremoveelement'
import type { Spatium } from '../types/dimension'
import type { ClefTypeList } from '../dom/clefinfo'
import type { EngravingObject } from '../dom/engravingobject'
import type { Score } from '../dom/score'
import type { Staff } from '../dom/staff'
import type { StaffType } from '../dom/stafftype'
import type { TimeSig } from '../dom/timesig'
import type { BarLine } from '../dom/barline'
import type { EditData } from './editdata'
import './edit'

// ---------------------------------------------------------
//   InsertStaff
// ---------------------------------------------------------

export class InsertStaff extends UndoCommand {
    constructor(private staff: Staff, private ridx: staff_idx_t) {
        super()
    }

    override undo(_ed: EditData | null): void {
        this.staff.score().removeStaff(this.staff)
        this.staff.score().setLayoutAll()
    }

    override redo(_ed: EditData | null): void {
        this.staff.score().insertStaff(this.staff, this.ridx)
        this.staff.score().setLayoutAll()
    }

    override type(): CommandType { return CommandType.InsertStaff }
    override name(): string { return 'InsertStaff' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

// ---------------------------------------------------------
//   RemoveStaff
// ---------------------------------------------------------

export class RemoveStaff extends UndoCommand {
    private ridx: staff_idx_t
    private wasSystemObjectStaff: boolean

    constructor(private staff: Staff) {
        super()
        this.ridx = staff.rstaff()
        this.wasSystemObjectStaff = staff.isSystemObjectStaff()
    }

    override undo(_ed: EditData | null): void {
        this.staff.score().insertStaff(this.staff, this.ridx)
        if (this.wasSystemObjectStaff) {
            this.staff.score().addSystemObjectStaff(this.staff)
        }
        this.staff.score().setLayoutAll()
    }

    override redo(_ed: EditData | null): void {
        this.staff.score().removeStaff(this.staff)
        if (this.wasSystemObjectStaff) {
            this.staff.score().removeSystemObjectStaff(this.staff)
        }
        this.staff.score().setLayoutAll()
    }

    override type(): CommandType { return CommandType.RemoveStaff }
    override name(): string { return 'RemoveStaff' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

// ---------------------------------------------------------
//   AddSystemObjectStaff / RemoveSystemObjectStaff
// ---------------------------------------------------------

export class AddSystemObjectStaff extends UndoCommand {
    constructor(private staff: Staff) {
        super()
    }

    override undo(_ed: EditData | null): void { this.staff.score().removeSystemObjectStaff(this.staff) }
    override redo(_ed: EditData | null): void { this.staff.score().addSystemObjectStaff(this.staff) }
    override type(): CommandType { return CommandType.AddSystemObjectStaff }
    override name(): string { return 'AddSystemObjectStaff' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

export class RemoveSystemObjectStaff extends UndoCommand {
    constructor(private staff: Staff) {
        super()
    }

    override undo(_ed: EditData | null): void { this.staff.score().addSystemObjectStaff(this.staff) }
    override redo(_ed: EditData | null): void { this.staff.score().removeSystemObjectStaff(this.staff) }
    override type(): CommandType { return CommandType.RemoveSystemObjectStaff }
    override name(): string { return 'RemoveSystemObjectStaff' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

// ---------------------------------------------------------
//   InsertMStaff / RemoveMStaff
// ---------------------------------------------------------

export class InsertMStaff extends UndoCommand {
    constructor(private measure: Measure, private mstaff: MStaff, private idx: staff_idx_t) {
        super()
    }

    override undo(_ed: EditData | null): void { this.measure.removeMStaff(this.mstaff, this.idx) }
    override redo(_ed: EditData | null): void { this.measure.insertMStaff(this.mstaff, this.idx) }
    override type(): CommandType { return CommandType.InsertMStaff }
    override name(): string { return 'InsertMStaff' }
    override objectItems(): EngravingObject[] { return [this.measure] }
}

export class RemoveMStaff extends UndoCommand {
    constructor(private measure: Measure, private mstaff: MStaff, private idx: staff_idx_t) {
        super()
    }

    override undo(_ed: EditData | null): void { this.measure.insertMStaff(this.mstaff, this.idx) }
    override redo(_ed: EditData | null): void { this.measure.removeMStaff(this.mstaff, this.idx) }
    override type(): CommandType { return CommandType.RemoveMStaff }
    override name(): string { return 'RemoveMStaff' }
    override objectItems(): EngravingObject[] { return [this.measure] }
}

// ---------------------------------------------------------
//   InsertStaves / RemoveStaves
// ---------------------------------------------------------

export class InsertStaves extends UndoCommand {
    constructor(private measure: Measure, private a: staff_idx_t, private b: staff_idx_t) {
        super()
    }

    override undo(_ed: EditData | null): void { this.measure.removeStaves(this.a, this.b) }
    override redo(_ed: EditData | null): void { this.measure.insertStaves(this.a, this.b) }
    override type(): CommandType { return CommandType.InsertStaves }
    override name(): string { return 'InsertStaves' }
    override objectItems(): EngravingObject[] { return [this.measure] }
}

export class RemoveStaves extends UndoCommand {
    constructor(private measure: Measure, private a: staff_idx_t, private b: staff_idx_t) {
        super()
    }

    override undo(_ed: EditData | null): void { this.measure.insertStaves(this.a, this.b) }
    override redo(_ed: EditData | null): void { this.measure.removeStaves(this.a, this.b) }
    override type(): CommandType { return CommandType.RemoveStaves }
    override name(): string { return 'RemoveStaves' }
    override objectItems(): EngravingObject[] { return [this.measure] }
}

// ---------------------------------------------------------
//   SortStaves
// ---------------------------------------------------------

export class SortStaves extends UndoCommand {
    private list: staff_idx_t[]
    private rlist: staff_idx_t[] = []

    constructor(private score: Score, l: readonly staff_idx_t[]) {
        super()
        for (let i = 0; i < l.length; i++) {
            this.rlist.push(l.indexOf(i))
        }
        this.list = [...l]
    }

    override redo(_ed: EditData | null): void { this.score.sortStaves(this.list) }
    override undo(_ed: EditData | null): void { this.score.sortStaves(this.rlist) }
    override type(): CommandType { return CommandType.SortStaves }
    override name(): string { return 'SortStaves' }
    override objectItems(): EngravingObject[] { return [this.score] }
}

// ---------------------------------------------------------
//   ChangeStaff
//   TODO(port): reflectTranspositionInLinkedTab (not in the port's Staff)
// ---------------------------------------------------------

export class ChangeStaff extends UndoCommand {
    private visible: boolean
    private clefType: ClefTypeList
    private userDist: Spatium
    private cutaway: boolean
    private hideSystemBarLine: boolean
    private mergeMatchingRests: AutoOnOff
    private reflectTranspositionInLinkedTab: boolean

    constructor(private staff: Staff, visible?: boolean, clefType?: ClefTypeList, userDist?: Spatium, cutaway?: boolean,
        hideSystemBarLine?: boolean, mergeMatchingRests?: AutoOnOff, reflectTranspositionInLinkedTab?: boolean) {
        super()
        this.visible = visible ?? staff.visible()
        this.clefType = (clefType ?? staff.defaultClefType()).clone()
        this.userDist = userDist ?? staff.userDist()
        this.cutaway = cutaway ?? staff.cutaway()
        this.hideSystemBarLine = hideSystemBarLine ?? staff.hideSystemBarLine()
        this.mergeMatchingRests = mergeMatchingRests ?? staff.mergeMatchingRests()
        this.reflectTranspositionInLinkedTab = reflectTranspositionInLinkedTab ?? staff.reflectTranspositionInLinkedTab()
    }

    protected override flip(_ed: EditData | null): void {
        const staff = this.staff
        const oldVisible = staff.visible()
        const oldClefType = staff.defaultClefType().clone()
        const oldUserDist = staff.userDist()
        const oldCutaway = staff.cutaway()
        const oldHideSystemBarLine = staff.hideSystemBarLine()
        const oldMergeMatchingRests = staff.mergeMatchingRests()
        const oldReflectTranspositionInLinkedTab = staff.reflectTranspositionInLinkedTab()

        staff.setVisible(this.visible)
        staff.setDefaultClefType(this.clefType)
        staff.setUserDist(this.userDist)
        staff.setCutaway(this.cutaway)
        staff.setHideSystemBarLine(this.hideSystemBarLine)
        staff.setMergeMatchingRests(this.mergeMatchingRests)
        staff.setReflectTranspositionInLinkedTab(this.reflectTranspositionInLinkedTab)

        this.visible = oldVisible
        this.clefType = oldClefType
        this.userDist = oldUserDist
        this.cutaway = oldCutaway
        this.hideSystemBarLine = oldHideSystemBarLine
        this.mergeMatchingRests = oldMergeMatchingRests
        this.reflectTranspositionInLinkedTab = oldReflectTranspositionInLinkedTab

        staff.triggerLayout()
        staff.masterScore().rebuildMidiMapping()
        staff.masterScore().setPlaylistDirty()
    }

    override type(): CommandType { return CommandType.ChangeStaff }
    override name(): string { return 'ChangeStaff' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

// ---------------------------------------------------------
//   ChangeStaffType
// ---------------------------------------------------------

export class ChangeStaffType extends UndoCommand {
    private staffType: StaffType

    constructor(private staff: Staff, st: StaffType) {
        super()
        this.staffType = st.clone()
    }

    protected override flip(_ed: EditData | null): void {
        const staff = this.staff
        const oldStaffType = staff.staffType(new Fraction(0, 1)).clone() // TODO

        staff.setStaffType(new Fraction(0, 1), this.staffType)

        const invisibleChanged = oldStaffType.invisible() !== this.staffType.invisible()
        const fromTabToStandard = oldStaffType.isTabStaff() && !this.staffType.isTabStaff()

        this.staffType = oldStaffType

        const score = staff.score()
        if (invisibleChanged) {
            const staffIdx = staff.idx()
            for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
                m.staffLines(staffIdx).setVisible(!staff.isLinesInvisible(new Fraction(0, 1)))
            }
        }

        if (fromTabToStandard) {
            // TODO(port): GuitarBend::adaptBendsFromTabToStandardStaff(staff)
        }

        staff.triggerLayout()
    }

    override type(): CommandType { return CommandType.ChangeStaffType }
    override name(): string { return 'ChangeStaffType' }
    override objectItems(): EngravingObject[] { return [this.staff] }
}

// ---------------------------------------------------------
//   Measure::cmdRemoveStaves / Measure::cmdAddStaves (measure.cpp)
// ---------------------------------------------------------

declare module '../dom/measure' {
    interface Measure {
        cmdRemoveStaves(sStaff: staff_idx_t, eStaff: staff_idx_t): void
        cmdAddStaves(sStaff: staff_idx_t, eStaff: staff_idx_t, createRest: boolean): void
    }
}

Measure.prototype.cmdRemoveStaves = function (this: Measure, sStaff: staff_idx_t, eStaff: staff_idx_t): void {
    const sTrack = sStaff * VOICES
    const eTrack = eStaff * VOICES
    const score = this.score()

    for (let s = this.first(); s; s = s.next()) {
        for (let track = eTrack - 1; track >= sTrack; --track) {
            const el = s.element(track)
            if (el) {
                el.undoUnlink()
                if (el.isTimeTickAnchor()) {
                    // Deviation: C++ removes the generated anchor without undo (doUndoRemoveElement); the layout
                    // does not create it again for the empty TimeTick segment, so undo would not restore the layout
                    score.undo(new RemoveElement(el))
                } else {
                    score.doUndoRemoveElement(el)
                }
            }
        }

        // Create copy, because s->annotations() will be modified during the loop
        const annotations = [...s.annotations()]
        for (const e of annotations) {
            if (allowRemoveWhenRemovingStaves(e, sStaff, eStaff)) {
                e.undoUnlink()
                score.doUndoRemoveElement(e)
            }
        }
    }

    for (const e of [...this.el()]) {
        if (e.track() === -1) {
            continue
        }

        if (allowRemoveWhenRemovingStaves(e, sStaff, eStaff)) {
            e.undoUnlink()
            score.doUndoRemoveElement(e)
        }
    }

    score.undo(new RemoveStaves(this, sStaff, eStaff))

    for (let i = eStaff - 1; i >= sStaff; --i) {
        const ms = this.mstaves()[i]
        score.undo(new RemoveMStaff(this, ms, i))
    }
    score.undoUpdatePlayCountText(this)
}

Measure.prototype.cmdAddStaves = function (this: Measure, sStaff: staff_idx_t, eStaff: staff_idx_t, createRest: boolean): void {
    const score = this.score()
    score.undo(new InsertStaves(this, sStaff, eStaff))

    const ts = this.findSegment(SegmentType.TimeSig, this.tick())
    const bs = this.findSegmentR(SegmentType.EndBarLine, this.ticks())

    for (let i = sStaff; i < eStaff; ++i) {
        const staff = score.staff(i)!
        const ms = new MStaff()
        ms.setLines(new StaffLines(this)) // C++ Factory::createStaffLines(this)
        ms.lines().setTrack(i * VOICES)
        ms.lines().setParent(this)
        ms.lines().setVisible(!staff.isLinesInvisible(this.tick()))
        score.undo(new InsertMStaff(this, ms, i))
    }

    if (!createRest && !ts) {
        return
    }

    // collect unique staves (only one instance for linked staves):

    const sl: staff_idx_t[] = []
    for (let staffIdx = sStaff; staffIdx < eStaff; ++staffIdx) {
        const s = score.staff(staffIdx)!
        const links = s.links()
        if (links) {
            let alreadyInList = false
            for (const idx of sl) {
                if (links.includes(score.staff(idx)!)) {
                    alreadyInList = true
                    break
                }
            }
            if (alreadyInList) {
                continue
            }
        }
        sl.push(staffIdx)
    }

    for (const staffIdx of sl) {
        if (createRest) {
            score.setRest(this.tick(), staffIdx * VOICES, this.ticks(), false, null, this.timesig().eq(this.ticks()))
        }

        // replicate time signature
        if (ts) {
            let ots: TimeSig | null = null
            for (let track = 0; track < this.mstaves().length * VOICES; ++track) {
                const e = ts.element(track)
                if (e) {
                    ots = e as TimeSig
                    break
                }
            }
            if (!ots) {
                // no time signature found; use measure timesig to construct one
                ots = Factory.createItem(ElementType.TIMESIG, scoreDummy(score).segment()) as TimeSig
                ots.setSig(this.timesig())
            }
            // do no replicate local time signatures
            if (ots && !ots.isLocal()) {
                const timesig = ots.clone() as TimeSig // C++ Factory::copyTimeSig
                timesig.setTrack(staffIdx * VOICES)
                timesig.setParent(ts)
                timesig.setSig(ots.sig(), ots.timeSigType())
                score.undoAddElement(timesig)
            }
        }

        // replicate barline
        if (bs) {
            let obl: BarLine | null = null
            for (let track = 0; track < this.mstaves().length * VOICES; ++track) {
                const e = bs.element(track)
                if (e && !e.generated()) {
                    obl = e as BarLine
                    break
                }
            }
            if (obl) {
                const barline = obl.clone() as BarLine // C++ Factory::copyBarLine
                barline.setSpanStaff(score.staff(staffIdx)!.barLineSpan())
                barline.setTrack(staffIdx * VOICES)
                barline.setParent(bs)
                barline.setGenerated(false)
                score.undoAddElement(barline)
            }
        }
    }
}
