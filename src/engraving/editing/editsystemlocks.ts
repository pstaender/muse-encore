/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editsystemlocks.h/.cpp
 *
 * EditSystemLocks::updateSystemLocksOnCreateMMRests is SystemLocks.updateSystemLocksOnCreateMMRests (applied by the
 * layout without the undo stack).
 */

import { Sid } from '../style/styledef'
import { LayoutBreakType } from '../types/types'
import { SystemLock } from '../dom/systemlock'
import type { EngravingObject } from '../dom/engravingobject'
import type { Measure } from '../dom/measure'
import type { MeasureBase } from '../dom/measurebase'
import type { Score } from '../dom/score'
import type { System } from '../dom/system'
import type { SystemLockIndicator } from '../dom/indicatoricon'
import { UndoCommand } from './undo'
import type { EditData } from './editdata'

function addSystemLock(score: Score, lock: SystemLock): void {
    score.systemLocks().add(lock)
    lock.startMB().triggerLayout()
    lock.endMB().triggerLayout()
}

function removeSystemLock(score: Score, lock: SystemLock): void {
    score.systemLocks().remove(lock)
    lock.startMB().triggerLayout()
    lock.endMB().triggerLayout()
}

// ---------------------------------------------------------
//   AddSystemLock
// ---------------------------------------------------------

class AddSystemLock extends UndoCommand {
    constructor(private m_systemLock: SystemLock) {
        super()
    }

    override undo(_ed: EditData | null): void {
        removeSystemLock(this.m_systemLock.startMB().score(), this.m_systemLock)
    }

    override redo(_ed: EditData | null): void {
        addSystemLock(this.m_systemLock.startMB().score(), this.m_systemLock)
    }

    override name(): string { return 'AddSystemLock' }
    override objectItems(): EngravingObject[] { return [this.m_systemLock.startMB(), this.m_systemLock.endMB()] }
}

// ---------------------------------------------------------
//   RemoveSystemLock
// ---------------------------------------------------------

class RemoveSystemLock extends UndoCommand {
    constructor(private m_systemLock: SystemLock) {
        super()
    }

    override undo(_ed: EditData | null): void {
        addSystemLock(this.m_systemLock.startMB().score(), this.m_systemLock)
    }

    override redo(_ed: EditData | null): void {
        removeSystemLock(this.m_systemLock.startMB().score(), this.m_systemLock)
    }

    override name(): string { return 'RemoveSystemLock' }
    override objectItems(): EngravingObject[] { return [this.m_systemLock.startMB(), this.m_systemLock.endMB()] }
}

// ---------------------------------------------------------
//   EditSystemLocks
// ---------------------------------------------------------

export class EditSystemLocks {
    static undoAddSystemLock(score: Score, lock: SystemLock): void {
        EditSystemLocks.removeLayoutBreaksOnAddSystemLock(score, lock)
        score.undo(new AddSystemLock(lock))
    }

    static undoRemoveSystemLock(score: Score, lock: SystemLock): void {
        score.undo(new RemoveSystemLock(lock))
    }

    static undoRemoveAllLocks(score: Score): void {
        const allLocks = score.systemLocks().allLocks() // copy
        for (const lock of allLocks) {
            EditSystemLocks.undoRemoveSystemLock(score, lock)
        }
    }

    static toggleSystemLock(score: Score, systems: readonly System[]): void {
        let unlockAll = true
        for (const system of systems) {
            if (!system.isLocked()) {
                unlockAll = false
                break
            }
        }

        for (const system of systems) {
            const startMeas = system.first()
            const currentLock = score.systemLocks().lockStartingAt(startMeas)
            if (currentLock && unlockAll) {
                EditSystemLocks.undoRemoveSystemLock(score, currentLock)
                continue
            } else if (!currentLock && !unlockAll) {
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(startMeas, system.last()))
            }
        }
    }

    static toggleScoreLock(score: Score): void {
        let unlockAll = true
        for (const system of score.systems()) {
            const first = system.first()
            if (!(first.isMeasure() || first.isHBox())) {
                continue
            }
            if (!system.isLocked()) {
                unlockAll = false
                break
            }
        }

        for (const system of [...score.systems()]) {
            const startMeas = system.first()
            if (!(startMeas.isMeasure() || startMeas.isHBox())) {
                continue
            }
            const currentLock = score.systemLocks().lockStartingAt(startMeas)
            if (currentLock && unlockAll) {
                EditSystemLocks.undoRemoveSystemLock(score, currentLock)
                continue
            } else if (!currentLock && !unlockAll) {
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(startMeas, system.last()))
            }
        }
    }

    static addRemoveSystemLocks(score: Score, interval: number, lock: boolean): void {
        const mmrests = score.style().styleB(Sid.createMultiMeasureRests)

        const startMeasure = score.selection().startMeasureBase()
        let endMeasure = score.selection().endMeasureBase()
        if (!endMeasure) {
            endMeasure = mmrests ? score.lastMeasureMM() : score.lastMeasure()
        }

        if (!startMeasure || !endMeasure) {
            return
        }

        if (lock) {
            for (const system of [...score.systems()]) {
                if (system.last().isBefore(startMeasure)) {
                    continue
                }
                if (system.first().isAfter(endMeasure)) {
                    break
                }
                if (!system.isLocked()) {
                    EditSystemLocks.undoAddSystemLock(score, new SystemLock(system.first(), system.last()))
                }
            }
            return
        }

        const currentLocks = score.systemLocks().locksContainedInRange(startMeasure, endMeasure)
        for (const l of currentLocks) {
            EditSystemLocks.undoRemoveSystemLock(score, l)
        }

        if (interval === 0) {
            return
        }

        let count = 0
        let lockStart: MeasureBase | null = null
        for (let mb: MeasureBase | null = startMeasure; mb; mb = mmrests ? mb.nextMM() : mb.next()) {
            if (count === 0) {
                lockStart = mb
            }
            count++
            if (count === interval || mb === endMeasure) {
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(lockStart!, mb))
                lockStart = null
                count = 0
            }
            if (mb === endMeasure) {
                break
            }
        }
    }

    static makeIntoSystem(score: Score, first: MeasureBase, last: MeasureBase): void {
        const mmrests = score.style().styleB(Sid.createMultiMeasureRests)

        const lockContainingfirst = score.systemLocks().lockContaining(first)
        const lockContaininglast = score.systemLocks().lockContaining(last)

        if (lockContainingfirst) {
            EditSystemLocks.undoRemoveSystemLock(score, lockContainingfirst)
            if (lockContainingfirst.startMB().isBefore(first)) {
                const oneBeforeFirst = mmrests ? first.prevMM() : first.prev()
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(lockContainingfirst.startMB(), oneBeforeFirst!))
            }
        }

        if (lockContaininglast) {
            if (lockContaininglast !== lockContainingfirst) {
                EditSystemLocks.undoRemoveSystemLock(score, lockContaininglast)
            }
            if (last.isBefore(lockContaininglast.endMB())) {
                const oneAfterLast = mmrests ? last.nextMM() : last.next()
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(oneAfterLast!, lockContaininglast.endMB()))
            }
        }

        const locksContainedInRange = score.systemLocks().locksContainedInRange(first, last)
        for (const lock of locksContainedInRange) {
            if (lock !== lockContainingfirst && lock !== lockContaininglast) {
                EditSystemLocks.undoRemoveSystemLock(score, lock)
            }
        }

        EditSystemLocks.undoAddSystemLock(score, new SystemLock(first, last))
    }

    static moveMeasureToPrevSystem(score: Score, m: MeasureBase): void {
        const prevSystem = m.prevNonVBoxSystem()
        if (!prevSystem) {
            return
        }

        const prevSystemFirstMeas = prevSystem.first()

        const prevSystemLock = score.systemLocks().lockStartingAt(prevSystemFirstMeas)
        if (prevSystemLock) {
            EditSystemLocks.undoRemoveSystemLock(score, prevSystemLock)
        }

        const curSystem = m.system()!
        const curSystemLock = score.systemLocks().lockStartingAt(curSystem.first())
        if (curSystemLock) {
            EditSystemLocks.undoRemoveSystemLock(score, curSystemLock)
            if (curSystemLock.endMB() !== m) {
                const mmrests = score.style().styleB(Sid.createMultiMeasureRests)
                const nextMB = mmrests ? m.nextMM() : m.next()
                EditSystemLocks.undoAddSystemLock(score, new SystemLock(nextMB!, curSystemLock.endMB()))
            }
        }

        EditSystemLocks.undoAddSystemLock(score, new SystemLock(prevSystemFirstMeas, m))
    }

    static moveMeasureToNextSystem(score: Score, m: MeasureBase): void {
        const curSystem = m.system()!
        const startMeas = curSystem.first()
        const refMeasureIsStartOfSystem = m === startMeas

        const curLock = score.systemLocks().lockStartingAt(startMeas)
        if (curLock) {
            EditSystemLocks.undoRemoveSystemLock(score, curLock)
        }

        if (!refMeasureIsStartOfSystem) {
            const mmrests = score.style().styleB(Sid.createMultiMeasureRests)
            const prevMeas = mmrests ? m.prevMM() : m.prev()
            EditSystemLocks.undoAddSystemLock(score, new SystemLock(startMeas, prevMeas!))
        }

        const nextSystem = m.nextNonVBoxSystem()
        if (!nextSystem) {
            return
        }

        const nextSysLock = score.systemLocks().lockStartingAt(nextSystem.first())
        if (nextSysLock) {
            EditSystemLocks.undoRemoveSystemLock(score, nextSysLock)
        }

        if (nextSysLock || refMeasureIsStartOfSystem) {
            EditSystemLocks.undoAddSystemLock(score, new SystemLock(m, nextSystem.last()))
        }
    }

    static applyLockToSelection(score: Score): void {
        let first: MeasureBase | null = null
        let last: MeasureBase | null = null

        if (score.selection().isRange()) {
            first = score.selection().startMeasureBase()
            last = score.selection().endMeasureBase()
        } else {
            for (const el of score.selection().elements()) {
                if (el.isSystemLockIndicator()) {
                    const lock = (el as SystemLockIndicator).systemLock()
                    first = lock.startMB()
                    last = lock.endMB()
                    break
                }
                const mb = el.findMeasureBase()
                if (!mb) {
                    continue
                }
                if (!first || mb.isBefore(first)) {
                    first = mb
                }
                if (!last || mb.isAfter(last)) {
                    last = mb
                }
            }
        }

        if (!first || !last) {
            return
        }

        const lockOnLast = score.systemLocks().lockContaining(last)
        if (lockOnLast && lockOnLast.endMB() === last) {
            EditSystemLocks.undoRemoveSystemLock(score, lockOnLast)
        } else if (first !== last) {
            EditSystemLocks.makeIntoSystem(score, first, last)
        } else {
            EditSystemLocks.makeIntoSystem(score, first.system()!.first(), last)
        }
    }

    static removeSystemLocksOnAddLayoutBreak(score: Score, breakType: LayoutBreakType, measure: MeasureBase): void {
        if (breakType === LayoutBreakType.NOBREAK) {
            return // NOBREAK not allowed on locked measures
        }

        const lock = score.systemLocks().lockContaining(measure)
        if (lock && (breakType === LayoutBreakType.LINE || measure !== lock.endMB())) {
            EditSystemLocks.undoRemoveSystemLock(score, lock)
        }
    }

    static removeLayoutBreaksOnAddSystemLock(score: Score, lock: SystemLock): void {
        const mmrests = score.style().styleB(Sid.createMultiMeasureRests)
        for (let mb: MeasureBase | null = lock.startMB(); mb && mb.isBeforeOrEqual(lock.endMB());
            mb = mmrests ? mb.nextMM() : mb.next()) {
            mb.undoSetBreak(false, LayoutBreakType.LINE)
            mb.undoSetBreak(false, LayoutBreakType.NOBREAK)
            if (mb !== lock.endMB()) {
                mb.undoSetBreak(false, LayoutBreakType.SECTION)
                mb.undoSetBreak(false, LayoutBreakType.PAGE)
            }
        }
    }

    static removeSystemLocksOnRemoveMeasures(score: Score, m1: MeasureBase, m2: MeasureBase): void {
        const allSysLocks = score.systemLocks().allLocks()
        for (const lock of allSysLocks) {
            const lockStart = lock.startMB()
            const lockEnd = lock.endMB()
            const lockStartIsInRange = lockStart.isAfterOrEqual(m1) && lockStart.isBeforeOrEqual(m2)
            const lockEndIsInRange = lockEnd.isAfterOrEqual(m1) && lockEnd.isBeforeOrEqual(m2)
            if (lockStartIsInRange || lockEndIsInRange) {
                EditSystemLocks.undoRemoveSystemLock(score, lock)
            }
            if (lockStartIsInRange && !lockEndIsInRange) {
                const newLockStart = m2.nextMeasure()
                if (newLockStart) {
                    EditSystemLocks.undoAddSystemLock(score, new SystemLock(newLockStart, lockEnd))
                }
            } else if (!lockStartIsInRange && lockEndIsInRange) {
                const newLockEnd = m1.prevMeasure()
                if (newLockEnd) {
                    EditSystemLocks.undoAddSystemLock(score, new SystemLock(lockStart, newLockEnd))
                }
            }
        }
    }

    static removeSystemLocksContainingMMRests(score: Score): void {
        const allLocks = score.systemLocks().allLocks() // copy
        for (const lock of allLocks) {
            for (let mb: MeasureBase | null = lock.startMB(); mb; mb = mb.next()) {
                if (mb.isMeasure() && (mb as Measure).mmRest()) {
                    EditSystemLocks.undoRemoveSystemLock(score, lock)
                    break
                }
                if (mb.isAfter(lock.endMB())) {
                    break
                }
            }
        }
    }
}
