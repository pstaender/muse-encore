/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/addremoveelement.h/.cpp
 */

import type { TempoText } from '../dom/tempotext'
import { staffTextHooks } from '../dom/stafftextbase'
import { Fraction } from '../types/fraction'
import { VOICES, type staff_idx_t } from '../types/types'
import { EngravingObject, linkHooks } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { DurationElement } from '../dom/durationelement'
import type { ChordRest } from '../dom/chordrest'
import type { Chord } from '../dom/chord'
import type { Note } from '../dom/note'
import type { Segment } from '../dom/segment'
import type { Measure } from '../dom/measure'
import type { Spanner, SpannerSegment } from '../dom/spanner'
import type { KeySig } from '../dom/keysig'
import { CommandType, UndoCommand, UndoCommandFilter, compoundObjects, updateStaffTextCache } from './undo'
import type { EditData } from './editdata'
import { ChangeProperty } from './editproperty'
import type { Pid } from '../dom/property'
import type { PropertyValue } from '../types/propertyvalue'

function undoRemoveTuplet(cr: DurationElement): void {
    const tuplet = cr.tuplet()
    if (tuplet) {
        tuplet.remove(cr as unknown as EngravingItem)
        if (tuplet.elements().length === 0) {
            undoRemoveTuplet(tuplet)
        }
    }
}

function undoAddTuplet(cr: DurationElement): void {
    const tuplet = cr.tuplet()
    if (tuplet) {
        tuplet.add(cr as unknown as EngravingItem)
        if (tuplet.elements().length === 1) {
            undoAddTuplet(tuplet)
        }
    }
}

// ---------------------------------------------------------
//   AddElement
// ---------------------------------------------------------

export class AddElement extends UndoCommand {
    private element: EngravingItem | null

    constructor(e: EngravingItem) {
        super()
        // C++: DO_ASSERT_X(!e->generated()); DO_ASSERT_X(e->parent()->score() == e->score())
        this.element = e
    }

    getElement(): EngravingItem | null { return this.element }

    override cleanup(undo: boolean): void {
        if (!undo) {
            this.element = null // C++ deletes the element
        }
    }

    private endUndoRedo(isUndo: boolean): void {
        const element = this.element!
        if (element.isChordRest()) {
            if (isUndo) {
                undoRemoveTuplet(element as unknown as ChordRest)
            } else {
                undoAddTuplet(element as unknown as ChordRest)
            }
        } else if (element.isClef()) {
            element.triggerLayout()
            element.score().setLayout(element.staff()!.nextClefTick(element.tick()), element.staffIdx())
        } else if (element.isKeySig()) {
            element.triggerLayout()
            element.score().setLayout(element.staff()!.nextKeyTick(element.tick()), element.staffIdx())
        }
    }

    override undo(_ed: EditData | null): void {
        const element = this.element!
        const score = element.score()

        if (!element.isTuplet()) {
            score.removeElement(element)
        }

        if (element.isStaffTextBase()) {
            updateStaffTextCache(element, score)
        }

        this.endUndoRedo(true)
    }

    override redo(_ed: EditData | null): void {
        const element = this.element!
        const score = element.score()

        if (!element.isTuplet()) {
            score.addElement(element)
        }

        if (element.isStaffTextBase()) {
            updateStaffTextCache(element, score)
        }

        this.endUndoRedo(false)
    }

    override name(): string {
        return `Add:    <${this.element?.typeName() ?? ''}>`
    }

    override type(): CommandType { return CommandType.AddElement }

    override isFiltered(f: UndoCommandFilter, target: EngravingItem): boolean {
        switch (f) {
        case UndoCommandFilter.AddElement:
            return target === this.element
        case UndoCommandFilter.AddElementLinked:
            return !!this.element && target.linkList().includes(this.element)
        default:
            break
        }
        return false
    }

    override objectItems(): EngravingObject[] {
        return this.element ? compoundObjects(this.element) : []
    }
}

/** Helper function for RemoveElement class */
function removeNote(note: Note): void {
    const score = note.score()
    const tieFor = note.tieFor()
    const tieBack = note.tieBack()
    if (tieFor && tieFor.endNote()) {
        score.doUndoRemoveElement(tieFor)
    }
    if (tieBack) {
        // TODO(port): tie jump points (repeats): Tie::changeTieType(tieBack) if tieBack->tieJumpPoints()->size() > 1
        score.doUndoRemoveElement(tieBack)
    }
    for (const s of [...note.spannerBack()]) {
        score.doUndoRemoveElement(s)
    }
    for (const s of [...note.spannerFor()]) {
        score.doUndoRemoveElement(s)
    }
}

// ---------------------------------------------------------
//   RemoveElement
// ---------------------------------------------------------

export class RemoveElement extends UndoCommand {
    private element: EngravingItem | null

    constructor(e: EngravingItem) {
        super()
        // C++: DO_ASSERT_X(!e->generated())
        this.element = e

        const score = e.score()
        if (e.isChordRest()) {
            const cr = e as unknown as ChordRest
            if (cr.tuplet() && cr.tuplet()!.elements().length <= 1) {
                score.doUndoRemoveElement(cr.tuplet()!)
            }
            if (e.isChord()) {
                const chord = e as unknown as Chord
                // remove tremolo between 2 notes
                if (chord.tremoloTwoChord()) {
                    score.doUndoRemoveElement(chord.tremoloTwoChord()!)
                }
                // TODO(port): Arpeggio::rebaseStartAnchor/rebaseEndAnchor (move the arpeggio to the next chord)
                for (const note of chord.notes()) {
                    removeNote(note)
                }
            }
        } else if (e.isNote()) {
            // Removing an individual note within a chord
            removeNote(e as unknown as Note)
        }
    }

    getElement(): EngravingItem | null { return this.element }

    override cleanup(undo: boolean): void {
        if (undo) {
            this.element = null // C++ deletes the element
        }
    }

    override undo(_ed: EditData | null): void {
        const element = this.element!
        const score = element.score()

        if (!element.isTuplet()) {
            score.addElement(element)
        }

        if (element.isStaffTextBase()) {
            updateStaffTextCache(element, score)
        } else if (element.isChordRest()) {
            if (element.isChord()) {
                for (const note of (element as unknown as Chord).notes()) {
                    note.connectTiedNotes()
                }
            }
            undoAddTuplet(element as unknown as ChordRest)
        } else if (element.isClef()) {
            score.setLayout(element.staff()!.nextClefTick(element.tick()), element.staffIdx())
        } else if (element.isKeySig()) {
            score.setLayout(element.staff()!.nextKeyTick(element.tick()), element.staffIdx())
        }
    }

    override redo(_ed: EditData | null): void {
        const element = this.element!
        const score = element.score()

        if (!element.isTuplet()) {
            score.removeElement(element)
        }

        if (element.isStaffTextBase()) {
            updateStaffTextCache(element, score)
        } else if (element.isChordRest()) {
            undoRemoveTuplet(element as unknown as ChordRest)
            if (element.isChord()) {
                for (const note of (element as unknown as Chord).notes()) {
                    note.disconnectTiedNotes()
                }
            }
        } else if (element.isClef()) {
            score.setLayout(element.staff()!.nextClefTick(element.tick()), element.staffIdx())
        } else if (element.isKeySig()) {
            score.setLayout(element.staff()!.nextKeyTick(element.tick()), element.staffIdx())
        }
    }

    override name(): string {
        return `Remove: ${this.element?.typeName() ?? ''}`
    }

    override type(): CommandType { return CommandType.RemoveElement }

    override isFiltered(f: UndoCommandFilter, target: EngravingItem): boolean {
        switch (f) {
        case UndoCommandFilter.RemoveElement:
            return target === this.element
        case UndoCommandFilter.RemoveElementLinked:
            return !!this.element && target.linkList().includes(this.element)
        default:
            break
        }
        return false
    }

    override objectItems(): EngravingObject[] {
        return this.element ? compoundObjects(this.element) : []
    }
}

// ---------------------------------------------------------
//   ChangeElement
// ---------------------------------------------------------

export class ChangeElement extends UndoCommand {
    private oldElement: EngravingItem
    private newElement: EngravingItem

    constructor(oe: EngravingItem, ne: EngravingItem) {
        super()
        this.oldElement = oe
        this.newElement = ne
    }

    override type(): CommandType { return CommandType.ChangeElement }
    override name(): string { return 'ChangeElement' }
    override objectItems(): EngravingObject[] { return [this.oldElement, this.newElement] }

    protected override flip(_ed: EditData | null): void {
        const oldElement = this.oldElement
        const newElement = this.newElement
        if (oldElement.links()) {
            newElement.linkTo(oldElement)
            oldElement.unlink()
        }

        newElement.setTrack(oldElement.track())
        if (newElement.isSpanner()) {
            (newElement as unknown as Spanner).setTrack2((oldElement as unknown as Spanner).track2())
        }

        const score = oldElement.score()
        if (!score.selection().isRange()) {
            if (oldElement.selected()) {
                score.deselect(oldElement)
            }
            if (newElement.selected()) {
                score.select(newElement, 1 /* SelectType::ADD */)
            }
        }

        if (!oldElement.explicitParent()) {
            newElement.setScore(score)
            score.removeElement(oldElement)
            score.addElement(newElement)
        } else {
            oldElement.parentItem()!.change(oldElement, newElement)
        }

        if (newElement.isKeySig()) {
            const ks = newElement as unknown as KeySig
            if (!ks.generated()) {
                ks.staff()!.setKey(ks.tick(), ks.keySigEvent())
            }
        } else if (newElement.isTempoText()) {
            const t = oldElement as unknown as TempoText
            score.setTempo(t.segment().tick(), t.tempo())
        }

        if (newElement.isSpannerSegment()) {
            const os = oldElement as unknown as SpannerSegment
            const ns = newElement as unknown as SpannerSegment
            if (os.system()) {
                os.system()!.remove(os)
            }
            if (ns.system()) {
                ns.system()!.add(ns)
            }
        }

        if (newElement.isStaffTextBase()) {
            updateStaffTextCache(newElement, score)
        }

        this.oldElement = newElement
        this.newElement = oldElement
        this.oldElement.triggerLayout()
        this.newElement.triggerLayout()
    }
}

// ---------------------------------------------------------
//   ChangeParent
// ---------------------------------------------------------

export class ChangeParent extends UndoCommand {
    constructor(private element: EngravingItem, private parent: EngravingItem, private staffIdx: staff_idx_t) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeParent }
    override name(): string { return 'ChangeParent' }
    override objectItems(): EngravingObject[] { return [this.element] }

    protected override flip(_ed: EditData | null): void {
        const p = this.element.parentItem()!
        const si = this.element.staffIdx()
        p.remove(this.element)
        this.element.setParent(this.parent)
        this.element.setTrack(this.staffIdx * VOICES + this.element.voice())
        this.parent.add(this.element)
        this.staffIdx = si
        this.parent = p

        this.element.triggerLayout()
    }
}

// ---------------------------------------------------------
//   ChangeSegmentParent
// ---------------------------------------------------------

export class ChangeSegmentParent extends UndoCommand {
    constructor(private segment: Segment, private parent: Measure, private tick: Fraction) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeParent }
    override name(): string { return 'ChangeSegmentParent' }
    override objectItems(): EngravingObject[] { return [this.segment] }

    protected override flip(_ed: EditData | null): void {
        const p = this.segment.measure()
        const oldTick = this.segment.rtick()
        p.remove(this.segment)
        this.segment.setParent(this.parent)
        this.segment.setRtick(this.tick)
        this.parent.add(this.segment)

        this.parent = p
        this.tick = oldTick

        this.segment.triggerLayout()
    }
}

// ---------------------------------------------------------
//   LinkUnlink (the C++ LinkedObjects list is a shared array of the objects here)
// ---------------------------------------------------------

class LinkUnlink extends UndoCommand {
    protected le: EngravingObject[] = []
    protected e!: EngravingObject

    protected link(): void {
        if (this.le.length === 1) {
            this.le[0].setLinks(this.le)
        }
        this.le.push(this.e)
        this.e.setLinks(this.le)
    }

    protected unlink(): void {
        const i = this.le.indexOf(this.e)
        if (i >= 0) {
            this.le.splice(i, 1)
        }
        if (this.le.length === 1) {
            this.le[0].setLinks(null)
        }

        this.e.setLinks(null)
    }
}

export class Unlink extends LinkUnlink {
    constructor(e: EngravingObject) {
        super()
        this.e = e
        this.le = e.links() as EngravingObject[]
    }

    override undo(_ed: EditData | null): void { this.link() }
    override redo(_ed: EditData | null): void { this.unlink() }
    override type(): CommandType { return CommandType.Unlink }
    override name(): string { return 'Unlink' }
}

/** C++ EngravingObject::undoUnlink() (engravingobject.cpp; the DOM module cannot create undo commands) */
EngravingObject.prototype.undoUnlink = function (this: EngravingObject): void {
    if (this.links()) {
        this.score().undo(new Unlink(this))
    }
}

staffTextHooks.undoLink = (e1: EngravingItem, e2: EngravingItem): void => {
    e1.score().undo(new Link(e1, e2))
}

linkHooks.undoLink = (e1: EngravingObject, e2: EngravingObject): void => {
    e2.score().undo(new Link(e1, e2))
}

linkHooks.undoChangePropertyCommand = (e: EngravingObject, pid: Pid, v: PropertyValue): void => {
    e.score().undo(new ChangeProperty(e, pid, v))
}

/** link e1 to e2 */
export class Link extends LinkUnlink {
    constructor(e1: EngravingObject, e2: EngravingObject) {
        super()
        this.le = (e2.links() as EngravingObject[] | null) ?? [e2]
        this.e = e1
    }

    override undo(_ed: EditData | null): void { this.unlink() }
    override redo(_ed: EditData | null): void { this.link() }
    override type(): CommandType { return CommandType.Link }
    override name(): string { return 'Link' }

    override isFiltered(f: UndoCommandFilter, target: EngravingItem): boolean {
        if (f === UndoCommandFilter.Link) {
            return this.e === target || this.le.includes(target)
        }
        return false
    }
}
