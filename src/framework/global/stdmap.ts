/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacements for std::multimap, std::map and std::set with C++ like iterators, for code that keeps iterators
 * (e.g. the MIDI import, which stores chord and tuplet iterators in its data).
 *
 * An iterator is a node of the map (C++ `it->first`, `it->second` = node.first, node.second); `++it` is
 * `it = it.next()`, `--it` is `it = it.prev()`, `std::next(it, n)` is `it.next(n)`. `map.end()` is a sentinel node
 * (`it === map.end()` or `it.isEnd()`); iterators stay valid until their element is erased (like the C++ tree
 * containers). Equal keys of a multimap keep their insertion order (insert at the upper bound like C++).
 */

export type Compare<K> = (a: K, b: K) => number

interface Comparable<K> {
    compare(o: K): number
}

/** numbers and strings by value, other keys by their compare() method */
export function defaultCompare<K>(a: K, b: K): number {
    if (typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean') {
        return a < b ? -1 : a > b ? 1 : 0
    }
    return (a as unknown as Comparable<K>).compare(b)
}

export class MapNode<K, V> {
    /** @internal */ _next: MapNode<K, V>
    /** @internal */ _prev: MapNode<K, V>
    /** @internal the container (null: erased or the sentinel) */ _tree: OrderedTree<K, V> | null = null
    /** @internal */ readonly _isEnd: boolean

    /** @internal */
    constructor(public readonly first: K, public second: V, isEnd = false) {
        this._next = this
        this._prev = this
        this._isEnd = isEnd
    }

    /** ++it (n times: std::next(it, n)) */
    next(n = 1): MapNode<K, V> {
        let it: MapNode<K, V> = this
        for (let i = 0; i < n; ++i) {
            it = it._next
        }
        for (let i = 0; i > n; --i) {
            it = it._prev
        }
        return it
    }

    /** --it (n times: std::prev(it, n)) */
    prev(n = 1): MapNode<K, V> { return this.next(-n) }

    isEnd(): boolean { return this._isEnd }
}

/** the common part of StdMultimap, StdMap and StdSet: a sorted array of nodes linked in a ring with a sentinel */
export abstract class OrderedTree<K, V> {
    protected m_nodes: MapNode<K, V>[] = []
    protected readonly m_end: MapNode<K, V>

    constructor(protected readonly m_compare: Compare<K> = defaultCompare) {
        this.m_end = new MapNode<K, V>(undefined as unknown as K, undefined as unknown as V, true)
    }

    compareKeys(a: K, b: K): number { return this.m_compare(a, b) }

    size(): number { return this.m_nodes.length }
    empty(): boolean { return this.m_nodes.length === 0 }

    begin(): MapNode<K, V> { return this.m_end._next }
    end(): MapNode<K, V> { return this.m_end }
    /** the last element (C++ std::prev(end()), *rbegin()); end() if empty */
    last(): MapNode<K, V> { return this.m_end._prev }

    clear(): void {
        for (const n of this.m_nodes) {
            n._tree = null
        }
        this.m_nodes = []
        this.m_end._next = this.m_end
        this.m_end._prev = this.m_end
    }

    /** the nodes in order (a snapshot: erasing while iterating is allowed) */
    nodes(): MapNode<K, V>[] { return this.m_nodes.slice() }

    *keys(): IterableIterator<K> {
        for (let it = this.begin(); it !== this.m_end; it = it._next) {
            yield it.first
        }
    }

    *values(): IterableIterator<V> {
        for (let it = this.begin(); it !== this.m_end; it = it._next) {
            yield it.second
        }
    }

    protected lowerIndex(k: K): number {
        let lo = 0
        let hi = this.m_nodes.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_compare(this.m_nodes[mid].first, k) < 0) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    protected upperIndex(k: K): number {
        let lo = 0
        let hi = this.m_nodes.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_compare(this.m_nodes[mid].first, k) <= 0) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    protected nodeAt(i: number): MapNode<K, V> {
        return i < this.m_nodes.length ? this.m_nodes[i] : this.m_end
    }

    protected indexOfNode(node: MapNode<K, V>): number {
        if (node._tree !== this) {
            return -1
        }
        for (let i = this.lowerIndex(node.first); i < this.m_nodes.length; ++i) {
            if (this.m_nodes[i] === node) {
                return i
            }
        }
        return -1
    }

    /** inserts a new node at index i of the sorted array */
    protected insertAt(i: number, k: K, v: V): MapNode<K, V> {
        const node = new MapNode<K, V>(k, v)
        node._tree = this
        const next = this.nodeAt(i)
        const prev = next._prev
        node._prev = prev
        node._next = next
        prev._next = node
        next._prev = node
        if (i === this.m_nodes.length) {
            this.m_nodes.push(node)
        } else {
            this.m_nodes.splice(i, 0, node)
        }
        return node
    }

    lowerBound(k: K): MapNode<K, V> { return this.nodeAt(this.lowerIndex(k)) }
    upperBound(k: K): MapNode<K, V> { return this.nodeAt(this.upperIndex(k)) }

    /** [lower bound, upper bound) */
    equalRange(k: K): [MapNode<K, V>, MapNode<K, V>] {
        return [this.lowerBound(k), this.upperBound(k)]
    }

    /** the first element with the key or end() */
    find(k: K): MapNode<K, V> {
        const i = this.lowerIndex(k)
        if (i < this.m_nodes.length && this.m_compare(this.m_nodes[i].first, k) === 0) {
            return this.m_nodes[i]
        }
        return this.m_end
    }

    count(k: K): number { return this.upperIndex(k) - this.lowerIndex(k) }
    contains(k: K): boolean { return this.find(k) !== this.m_end }

    /** erases the element of the iterator; returns the next iterator */
    erase(node: MapNode<K, V>): MapNode<K, V> {
        const i = this.indexOfNode(node)
        if (i < 0) {
            throw new Error('OrderedTree.erase: invalid iterator')
        }
        const next = node._next
        node._prev._next = next
        next._prev = node._prev
        node._tree = null
        this.m_nodes.splice(i, 1)
        return next
    }

    /** erases [first, last); returns last */
    eraseRange(first: MapNode<K, V>, last: MapNode<K, V>): MapNode<K, V> {
        let it = first
        while (it !== last) {
            it = this.erase(it)
        }
        return last
    }

    /** erases all elements with the key; returns their count */
    eraseKey(k: K): number {
        const lo = this.lowerIndex(k)
        const hi = this.upperIndex(k)
        for (let i = hi - 1; i >= lo; --i) {
            this.erase(this.m_nodes[i])
        }
        return hi - lo
    }

    /** true if the iterator is an element of this container */
    owns(node: MapNode<K, V>): boolean { return node._tree === this }
}

/** std::multimap<K, V> */
export class StdMultimap<K, V> extends OrderedTree<K, V> {
    [Symbol.iterator](): IterableIterator<MapNode<K, V>> { return this.iterate() }

    private *iterate(): IterableIterator<MapNode<K, V>> {
        for (let it = this.begin(); it !== this.m_end;) {
            const next = it._next
            yield it
            // like a C++ range for loop: the next node was taken after the body if the current one was not erased
            it = it._tree === this ? it._next : next
        }
    }

    /** inserts after the elements with an equal key; returns the iterator of the new element */
    insert(k: K, v: V): MapNode<K, V> {
        return this.insertAt(this.upperIndex(k), k, v)
    }

    /**
     * insert(hint, value): inserts as close as possible to the position just prior to hint (C++11). If the key does
     * not fit there, like insert(k, v).
     */
    insertHint(hint: MapNode<K, V>, k: K, v: V): MapNode<K, V> {
        const hintOk = (hint === this.m_end || this.m_compare(k, hint.first) <= 0)
            && (hint._prev === this.m_end || this.m_compare(hint._prev.first, k) <= 0)
        if (hintOk) {
            const i = hint === this.m_end ? this.m_nodes.length : this.indexOfNode(hint)
            if (i >= 0) {
                return this.insertAt(i, k, v)
            }
        }
        return this.insert(k, v)
    }

    /** a copy of the multimap; the values are copied with copyValue (default: the same objects) */
    copy(copyValue: (v: V) => V = v => v): StdMultimap<K, V> {
        const m = new StdMultimap<K, V>(this.m_compare)
        for (const n of this.m_nodes) {
            m.insertAt(m.m_nodes.length, n.first, copyValue(n.second))
        }
        return m
    }
}

/** std::map<K, V> */
export class StdMap<K, V> extends OrderedTree<K, V> {
    [Symbol.iterator](): IterableIterator<MapNode<K, V>> { return this.iterate() }

    private *iterate(): IterableIterator<MapNode<K, V>> {
        for (let it = this.begin(); it !== this.m_end;) {
            const next = it._next
            yield it
            it = it._tree === this ? it._next : next
        }
    }

    /** std::map::insert: does not overwrite; returns [iterator, inserted] */
    insert(k: K, v: V): [MapNode<K, V>, boolean] {
        const i = this.lowerIndex(k)
        if (i < this.m_nodes.length && this.m_compare(this.m_nodes[i].first, k) === 0) {
            return [this.m_nodes[i], false]
        }
        return [this.insertAt(i, k, v), true]
    }

    /** the value of the key or undefined (C++ find()->second) */
    get(k: K): V | undefined {
        const it = this.find(k)
        return it === this.m_end ? undefined : it.second
    }

    /** map[k] = v */
    set(k: K, v: V): MapNode<K, V> {
        const [it, inserted] = this.insert(k, v)
        if (!inserted) {
            it.second = v
        }
        return it
    }

    /** C++ map[k]: the value of the key, inserted with makeDefault() if the key is missing */
    getOrInsert(k: K, makeDefault: () => V): V {
        const i = this.lowerIndex(k)
        if (i < this.m_nodes.length && this.m_compare(this.m_nodes[i].first, k) === 0) {
            return this.m_nodes[i].second
        }
        return this.insertAt(i, k, makeDefault()).second
    }

    copy(copyValue: (v: V) => V = v => v): StdMap<K, V> {
        const m = new StdMap<K, V>(this.m_compare)
        for (const n of this.m_nodes) {
            m.insertAt(m.m_nodes.length, n.first, copyValue(n.second))
        }
        return m
    }
}

/** std::set<K>: iterates the keys; begin()/find()/... return nodes whose `first` is the key */
export class StdSet<K> extends OrderedTree<K, undefined> {
    constructor(compare: Compare<K> = defaultCompare, keys: Iterable<K> = []) {
        super(compare)
        for (const k of keys) {
            this.insert(k)
        }
    }

    [Symbol.iterator](): IterableIterator<K> { return this.keys() }

    /** returns [iterator, inserted] */
    insert(k: K): [MapNode<K, undefined>, boolean] {
        const i = this.lowerIndex(k)
        if (i < this.m_nodes.length && this.m_compare(this.m_nodes[i].first, k) === 0) {
            return [this.m_nodes[i], false]
        }
        return [this.insertAt(i, k, undefined), true]
    }

    copy(): StdSet<K> {
        const s = new StdSet<K>(this.m_compare)
        for (const n of this.m_nodes) {
            s.insertAt(s.m_nodes.length, n.first, undefined)
        }
        return s
    }

    /** C++ set1 == set2 */
    equals(o: StdSet<K>): boolean {
        if (o.size() !== this.size()) {
            return false
        }
        for (let i = 0; i < this.m_nodes.length; ++i) {
            if (this.m_compare(this.m_nodes[i].first, o.m_nodes[i].first) !== 0) {
                return false
            }
        }
        return true
    }
}
