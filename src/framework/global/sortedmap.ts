/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * A minimal replacement for std::map<number, T> / std::multimap<number, T>
 * with the iterator-free operations the engraving code uses.
 */

export class SortedMap<V> {
    protected m_keys: number[] = []
    protected m_values: V[] = []

    constructor(private readonly m_multi = false) {}

    size(): number { return this.m_keys.length }
    empty(): boolean { return this.m_keys.length === 0 }
    clear(): void { this.m_keys = []; this.m_values = [] }

    keys(): readonly number[] { return this.m_keys }
    values(): readonly V[] { return this.m_values }

    *entries(): IterableIterator<[number, V]> {
        for (let i = 0; i < this.m_keys.length; ++i) {
            yield [this.m_keys[i], this.m_values[i]]
        }
    }

    [Symbol.iterator](): IterableIterator<[number, V]> { return this.entries() }

    keyAt(i: number): number { return this.m_keys[i] }
    valueAt(i: number): V { return this.m_values[i] }
    setValueAt(i: number, v: V): void { this.m_values[i] = v }

    /** index of the first key >= k */
    lowerBound(k: number): number {
        let lo = 0
        let hi = this.m_keys.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_keys[mid] < k) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    /** index of the first key > k */
    upperBound(k: number): number {
        let lo = 0
        let hi = this.m_keys.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_keys[mid] <= k) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    find(k: number): number {
        const i = this.lowerBound(k)
        return i < this.m_keys.length && this.m_keys[i] === k ? i : -1
    }

    has(k: number): boolean { return this.find(k) >= 0 }

    get(k: number): V | undefined {
        const i = this.find(k)
        return i >= 0 ? this.m_values[i] : undefined
    }

    /** map[k] = v (for multi maps: insert after equal keys) */
    set(k: number, v: V): void {
        if (this.m_multi) {
            this.insert(k, v)
            return
        }
        const i = this.lowerBound(k)
        if (i < this.m_keys.length && this.m_keys[i] === k) {
            this.m_values[i] = v
        } else {
            this.m_keys.splice(i, 0, k)
            this.m_values.splice(i, 0, v)
        }
    }

    /** std::map::insert: does not overwrite (multi map: always inserts) */
    insert(k: number, v: V): void {
        if (this.m_multi) {
            const i = this.upperBound(k)
            this.m_keys.splice(i, 0, k)
            this.m_values.splice(i, 0, v)
            return
        }
        if (!this.has(k)) {
            this.set(k, v)
        }
    }

    eraseAt(i: number): void {
        this.m_keys.splice(i, 1)
        this.m_values.splice(i, 1)
    }

    erase(k: number): void {
        for (let i = this.find(k); i >= 0; i = this.find(k)) {
            this.eraseAt(i)
            if (!this.m_multi) {
                break
            }
        }
    }

    /** erase indices [first, last) */
    eraseRange(first: number, last: number): void {
        this.m_keys.splice(first, last - first)
        this.m_values.splice(first, last - first)
    }

    firstKey(): number | undefined { return this.m_keys[0] }
    lastKey(): number | undefined { return this.m_keys[this.m_keys.length - 1] }
}
