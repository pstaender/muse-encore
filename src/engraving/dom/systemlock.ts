/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/systemlock.h/.cpp and EditSystemLocks::updateSystemLocksOnCreateMMRests
 *
 * TODO(port): system lock indicators (only shown in the editor)
 */

import type { Measure } from './measure'
import type { MeasureBase } from './measurebase'

export class SystemLock {
    constructor(private m_startMB: MeasureBase, private m_endMB: MeasureBase) {}

    startMB(): MeasureBase { return this.m_startMB }
    endMB(): MeasureBase { return this.m_endMB }

    contains(mb: MeasureBase): boolean {
        return this.m_startMB.isBeforeOrEqual(mb) && mb.isBeforeOrEqual(this.m_endMB)
    }
}

export class SystemLocks {
    // sorted by start measure (C++ std::map ordered by MeasureBase::isBefore)
    private m_systemLocks: SystemLock[] = []

    add(lock: SystemLock): void {
        this.removeLockStartingAt(lock.startMB())
        let i = 0
        while (i < this.m_systemLocks.length && this.m_systemLocks[i].startMB().isBefore(lock.startMB())) {
            ++i
        }
        this.m_systemLocks.splice(i, 0, lock)
    }

    remove(lock: SystemLock): void {
        this.removeLockStartingAt(lock.startMB())
    }

    removeLockStartingAt(mb: MeasureBase): void {
        this.m_systemLocks = this.m_systemLocks.filter(l => l.startMB() !== mb)
    }

    clear(): void { this.m_systemLocks = [] }

    lockStartingAt(mb: MeasureBase): SystemLock | null {
        return this.m_systemLocks.find(l => l.startMB() === mb) ?? null
    }

    lockContaining(mb: MeasureBase): SystemLock | null {
        // the last lock starting before or at mb
        let lock: SystemLock | null = null
        for (const l of this.m_systemLocks) {
            if (mb.isBefore(l.startMB())) {
                break
            }
            lock = l
        }
        if (!lock && this.m_systemLocks.length) {
            lock = this.m_systemLocks[0]
        }
        return lock && lock.contains(mb) ? lock : null
    }

    locksContainedInRange(start: MeasureBase, end: MeasureBase): SystemLock[] {
        const result: SystemLock[] = []
        for (const lock of this.m_systemLocks) {
            if (start.isBeforeOrEqual(lock.startMB()) && lock.endMB().isBeforeOrEqual(end)) {
                result.push(lock)
            }
            if (lock.startMB().isAfter(end)) {
                break
            }
        }
        return result
    }

    allLocks(): SystemLock[] { return [...this.m_systemLocks] }

    /** EditSystemLocks::updateSystemLocksOnCreateMMRests (without undo) */
    updateSystemLocksOnCreateMMRests(first: Measure, last: Measure): void {
        // NOTE: this must be done during layout as the mmRests get created.
        for (const lock of this.locksContainedInRange(first, last)) {
            // These locks are inside the range of the mmRest so remove them
            this.remove(lock)
        }

        const lockOnFirst = this.lockContaining(first)
        const lockOnLast = this.lockContaining(last)

        if (lockOnFirst) {
            let startMB = lockOnFirst.startMB()
            let endMB = lockOnFirst.endMB()
            if (startMB.isBefore(first)) {
                if (endMB.isBeforeOrEqual(last)) {
                    endMB = first.mmRest()!
                } else {
                    return
                }
            } else {
                startMB = first.mmRest()!
            }
            if (startMB !== lockOnFirst.startMB() || endMB !== lockOnFirst.endMB()) {
                this.remove(lockOnFirst)
                this.add(new SystemLock(startMB, endMB))
            }
        }

        if (!lockOnLast || lockOnLast === lockOnFirst) {
            return
        }

        const endMB = lockOnLast.endMB()
        this.remove(lockOnLast)
        const startMB = last.nextMM()
        if (startMB) {
            this.add(new SystemLock(startMB, endMB))
        }
    }
}
