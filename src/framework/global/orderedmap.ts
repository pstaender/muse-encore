/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * A replacement for std::map<K, V> / std::multimap<K, V> with any key type and a comparison function: iteration is
 * in key order (like the C++ containers), unlike a JS Map. For number keys see SortedMap.
 */

import type { Fraction } from '../../engraving/types/fraction'

export type KeyCompare<K> = (a: K, b: K) => number

export function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}

export function compareNumbers(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0
}

export function compareFractions(a: Fraction, b: Fraction): number {
    return a.compare(b)
}

/** std::pair<int, int> (lexicographic) */
export function comparePairs(a: readonly [number, number], b: readonly [number, number]): number {
    return a[0] !== b[0] ? compareNumbers(a[0], b[0]) : compareNumbers(a[1], b[1])
}

export class OrderedMap<K, V> implements Iterable<[K, V]> {
    protected m_keys: K[] = []
    protected m_values: V[] = []

    constructor(protected readonly m_cmp: KeyCompare<K>, protected readonly m_multi = false) {}

    size(): number { return this.m_keys.length }
    empty(): boolean { return this.m_keys.length === 0 }
    clear(): void { this.m_keys = []; this.m_values = [] }

    keys(): readonly K[] { return this.m_keys }
    values(): readonly V[] { return this.m_values }

    *entries(): IterableIterator<[K, V]> {
        for (let i = 0; i < this.m_keys.length; ++i) {
            yield [this.m_keys[i], this.m_values[i]]
        }
    }

    [Symbol.iterator](): IterableIterator<[K, V]> { return this.entries() }

    keyAt(i: number): K { return this.m_keys[i] }
    valueAt(i: number): V { return this.m_values[i] }
    setValueAt(i: number, v: V): void { this.m_values[i] = v }

    /** index of the first key >= k */
    lowerBound(k: K): number {
        let lo = 0
        let hi = this.m_keys.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_cmp(this.m_keys[mid], k) < 0) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    /** index of the first key > k */
    upperBound(k: K): number {
        let lo = 0
        let hi = this.m_keys.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_cmp(this.m_keys[mid], k) <= 0) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    /** index of (the first entry with) the key, -1 if none */
    find(k: K): number {
        const i = this.lowerBound(k)
        return i < this.m_keys.length && this.m_cmp(this.m_keys[i], k) === 0 ? i : -1
    }

    has(k: K): boolean { return this.find(k) >= 0 }

    /** std::map::count */
    count(k: K): number { return this.upperBound(k) - this.lowerBound(k) }

    get(k: K): V | undefined {
        const i = this.find(k)
        return i >= 0 ? this.m_values[i] : undefined
    }

    /** the values of all entries with the key (muse::values(multimap, key)) */
    valuesOf(k: K): V[] {
        return this.m_values.slice(this.lowerBound(k), this.upperBound(k))
    }

    /** map[k] = v (multi maps: insert after the equal keys) */
    set(k: K, v: V): void {
        if (this.m_multi) {
            this.insert(k, v)
            return
        }
        const i = this.lowerBound(k)
        if (i < this.m_keys.length && this.m_cmp(this.m_keys[i], k) === 0) {
            this.m_values[i] = v
        } else {
            this.m_keys.splice(i, 0, k)
            this.m_values.splice(i, 0, v)
        }
    }

    /** std::map::insert: does not overwrite, returns true if inserted (multi maps: always inserts after equal keys) */
    insert(k: K, v: V): boolean {
        if (this.m_multi) {
            const i = this.upperBound(k)
            this.m_keys.splice(i, 0, k)
            this.m_values.splice(i, 0, v)
            return true
        }
        const i = this.lowerBound(k)
        if (i < this.m_keys.length && this.m_cmp(this.m_keys[i], k) === 0) {
            return false
        }
        this.m_keys.splice(i, 0, k)
        this.m_values.splice(i, 0, v)
        return true
    }

    eraseAt(i: number): void {
        this.m_keys.splice(i, 1)
        this.m_values.splice(i, 1)
    }

    /** erases all entries with the key, returns their number */
    erase(k: K): number {
        const first = this.lowerBound(k)
        const last = this.upperBound(k)
        this.eraseRange(first, last)
        return last - first
    }

    /** erase indices [first, last) */
    eraseRange(first: number, last: number): void {
        this.m_keys.splice(first, last - first)
        this.m_values.splice(first, last - first)
    }

    firstKey(): K | undefined { return this.m_keys[0] }
    lastKey(): K | undefined { return this.m_keys[this.m_keys.length - 1] }
}

/** std::map<String, V> */
export class StringMap<V> extends OrderedMap<string, V> {
    constructor(multi = false) { super(compareStrings, multi) }
}

/** std::map<int, V> (std::multimap<int, V> with multi = true) */
export class IntMap<V> extends OrderedMap<number, V> {
    constructor(multi = false) { super(compareNumbers, multi) }
}

/** std::map<Fraction, V> (keys compared by value) */
export class FractionMap<V> extends OrderedMap<Fraction, V> {
    constructor(multi = false) { super(compareFractions, multi) }
}

/** std::set<T>: the values in order */
export class OrderedSet<T> implements Iterable<T> {
    private m_map: OrderedMap<T, true>

    constructor(cmp: KeyCompare<T>) { this.m_map = new OrderedMap<T, true>(cmp) }

    size(): number { return this.m_map.size() }
    empty(): boolean { return this.m_map.empty() }
    clear(): void { this.m_map.clear() }
    has(v: T): boolean { return this.m_map.has(v) }
    /** returns true if inserted */
    insert(v: T): boolean { return this.m_map.insert(v, true) }
    erase(v: T): boolean { return this.m_map.erase(v) > 0 }
    values(): readonly T[] { return this.m_map.keys() }
    [Symbol.iterator](): IterableIterator<T> { return this.m_map.keys()[Symbol.iterator]() as IterableIterator<T> }
}
