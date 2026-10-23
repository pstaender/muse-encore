/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/hammeronpulloff.h/.cpp
 *
 * C++ curColor() colors invalid hammer-ons/pull-offs only when MScore::warnGuitarBends is set (off by default).
 */

import { LineF, PointF } from '../../framework/draw/types/geometry'
import { propertyValueEquals, type PropertyValue } from '../types/propertyvalue'
import { textStyle } from '../style/textstyle'
import { ElementType, PlacementV, TextStyleType, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import type { Chord } from './chord'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Note } from './note'
import { Pid } from './property'
import { Slur, SlurSegment } from './slur'
import type { SlurTieSegment } from './slurtie'
import type { System } from './system'
import { TextBase } from './textbase'

const hopoStyle: ElementStyle = []

export class HammerOnPullOffText extends TextBase {
    private m_startChord: Chord | null = null
    private m_endChord: Chord | null = null
    private m_isValid = true
    private m_isHammerOn = true

    constructor(parent: HammerOnPullOffSegment | null) {
        super(ElementType.HAMMER_ON_PULL_OFF_TEXT, parent, TextStyleType.HAMMER_ON_PULL_OFF,
            ElementFlag.MOVABLE | ElementFlag.GENERATED | ElementFlag.ON_STAFF)
        this.resetProperty(Pid.PLACEMENT)
        this.initElementStyle(hopoStyle)
    }

    startChord(): Chord { return this.m_startChord! }
    endChord(): Chord { return this.m_endChord! }
    setStartChord(c: Chord | null): void { this.m_startChord = c }
    setEndChord(c: Chord | null): void { this.m_endChord = c }

    isValid(): boolean { return this.m_isValid }
    setIsValid(v: boolean): void { this.m_isValid = v }
    isHammerOn(): boolean { return this.m_isHammerOn }
    setIsHammerOn(v: boolean): void { this.m_isHammerOn = v }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLACEMENT:
            return PlacementV.ABOVE
        default:
            return super.propertyDefault(id)
        }
    }

    override positionRelativeToNoteheadRest(): boolean { return false }

    override isUserModified(): boolean {
        for (const p of textStyle(this.textStyleType()) ?? []) {
            if (!propertyValueEquals(this.getProperty(p.pid), this.propertyDefault(p.pid))) {
                return true
            }
        }
        return super.isUserModified()
    }

    override dragAnchorLines(): LineF[] {
        const result: LineF[] = []

        const p1 = this.canvasPos()

        const hopoSeg = this.parent() as unknown as HammerOnPullOffSegment
        const hopoSegShape = hopoSeg.ldata().shape()
        const x = this.ldata().pos().x() // + hopoSegShape.bbox().x();
        const y = hopoSeg.hammerOnPullOff().up() ? hopoSegShape.topAtX(x) : hopoSegShape.bottomAtX(x)

        const p2 = new PointF(x, y).plus(hopoSeg.canvasPos())

        result.push(new LineF(p1, p2))

        return result
    }
}

interface HopoTextRegion {
    startChord: Chord
    endChord: Chord
    isHammerOn: boolean
    isValid: boolean
}

export class HammerOnPullOffSegment extends SlurSegment {
    private m_hopoText: HammerOnPullOffText[] = []

    constructor(parent: System | null) {
        super(parent, ElementType.HAMMER_ON_PULL_OFF_SEGMENT)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_hopoText = []
    }

    hammerOnPullOff(): HammerOnPullOff { return this.spanner() as HammerOnPullOff }

    override scanElements(func: (item: EngravingItem) => void): void {
        for (const hopo of this.m_hopoText) {
            hopo.scanElements(func)
        }

        func(this) // C++ EngravingItem::scanElements
    }

    override setTrack(idx: track_idx_t): void {
        super.setTrack(idx)
        for (const hopo of this.m_hopoText ?? []) {
            hopo.setTrack(idx)
        }
    }

    updateHopoText(): void {
        let startChord: Chord | null = null
        if (this.isSingleBeginType()) {
            const startEl = this.hammerOnPullOff().startElement()
            startChord = startEl && startEl.isChord() ? startEl as Chord : null
        } else {
            const firstCR = this.system()!.firstChordRest(this.track())
            startChord = firstCR && firstCR.isChord() ? firstCR as Chord : null
        }

        let endChord: Chord | null = null
        if (this.isSingleEndType()) {
            const endEl = this.hammerOnPullOff().endElement()
            endChord = endEl && endEl.isChord() ? endEl as Chord : null
        } else {
            // If the segment doesn't end in this system, the endChord is the first chord of next system
            let lastCR = this.system()!.lastChordRest(this.track())
            if (lastCR) {
                const nextSeg = lastCR.segment()!.next1WithElemsOnTrack(this.track())
                lastCR = nextSeg ? nextSeg.element(this.track()) as typeof lastCR : null
            }
            endChord = lastCR && lastCR.isChord() ? lastCR as Chord : null
        }

        if (!startChord || !endChord) {
            this.m_hopoText = []
            return
        }

        const hopoTextRegions = this.computeHopoTextRegions(startChord, endChord)
        const regionCount = hopoTextRegions.length

        let curRegionIdx = 0
        for (; curRegionIdx < regionCount; ++curRegionIdx) {
            const curRegion = hopoTextRegions[curRegionIdx]

            let curHopoText: HammerOnPullOffText
            if (curRegionIdx < this.m_hopoText.length) {
                // Reuse existing, if available
                curHopoText = this.m_hopoText[curRegionIdx]
            } else {
                // Create new
                curHopoText = new HammerOnPullOffText(this)
                this.m_hopoText.push(curHopoText)
            }

            curHopoText.setParent(this)
            curHopoText.setTrack(this.track())
            curHopoText.setIsValid(curRegion.isValid)
            curHopoText.setIsHammerOn(curRegion.isHammerOn)
            curHopoText.setXmlText(this.style().styleB(Sid.hopoUpperCase) ? (curRegion.isHammerOn ? 'H' : 'P')
                : (curRegion.isHammerOn ? 'h' : 'p'))
            curHopoText.setStartChord(curRegion.startChord)
            curHopoText.setEndChord(curRegion.endChord)
        }

        // Delete unused
        this.m_hopoText.length = curRegionIdx
    }

    hopoText(): readonly HammerOnPullOffText[] { return this.m_hopoText }
    addHopoText(t: HammerOnPullOffText): void { this.m_hopoText.push(t) }

    override isUserModified(): boolean {
        for (const hopoText of this.m_hopoText) {
            if (hopoText.isUserModified()) {
                return true
            }
        }
        return super.isUserModified()
    }

    isValid(): boolean {
        for (const hopoText of this.m_hopoText) {
            if (!hopoText.isValid()) {
                return false
            }
        }
        return true
    }

    private computeHopoTextRegions(startChord: Chord, endChord: Chord): HopoTextRegion[] {
        const result: HopoTextRegion[] = []
        const isTabStaff = this.staffType()!.isTabStaff()
        if ((isTabStaff && !this.style().styleB(Sid.hopoShowOnTabStaves))
            || (!isTabStaff && !this.style().styleB(Sid.hopoShowOnStandardStaves))) {
            return result
        }

        for (let curChord: Chord = startChord; curChord !== endChord;) {
            if (curChord.tick().gt(endChord.tick())) {
                break
            }

            const nextChord = curChord.next()
            if (!nextChord) {
                break
            }

            const { startNote: curNote, endNote: nextNote } = HammerOnPullOffSegment.resolveStartEndNotes(curChord, nextChord, isTabStaff)

            const isValid = isTabStaff ? nextNote.string() === curNote.string() : nextNote.pitch() !== curNote.pitch()
            const isHammerOn = isTabStaff ? nextNote.fret() > curNote.fret() : nextNote.pitch() > curNote.pitch()

            const startNewRegion = result.length === 0 || this.style().styleB(Sid.hopoShowAll)
                                   || result[result.length - 1].isHammerOn !== isHammerOn

            if (startNewRegion) {
                result.push({ startChord: curChord, endChord: nextChord, isValid, isHammerOn })
            } else {
                const curRegion = result[result.length - 1]
                curRegion.endChord = nextChord
                curRegion.isValid = curRegion.isValid && isValid
            }

            curChord = nextChord
        }

        return result
    }

    /** C++ returns startNote/endNote through pointer arguments */
    private static resolveStartEndNotes(startChord: Chord, endChord: Chord, isTabStaff: boolean): { startNote: Note; endNote: Note } {
        // In future we need the ability to draw slurs between individual notes. For now, slurs are
        // attached to chords so we just try to guess which notes to consider for this HOPO

        const startNotes = startChord.notes()
        const endNotes = endChord.notes()
        const startNotesSize = startNotes.length
        const endNotesSize = endNotes.length
        const largerNoteCount = startNotesSize > endNotesSize ? startNotesSize : endNotesSize

        for (let i = largerNoteCount - 1; i >= 0; --i) {
            const startNoteIdx = Math.min(i, startNotesSize - 1)
            const endNoteIdx = Math.min(i, endNotesSize - 1)
            const sNote = startNotes[startNoteIdx]
            const eNote = endNotes[endNoteIdx]
            if (sNote.tieFor() && sNote.tieFor() === eNote.tieBack()) {
                continue
            }

            let usablePair = sNote.pitch() !== eNote.pitch()
            if (isTabStaff) {
                usablePair &&= sNote.string() === eNote.string()
            }

            if (usablePair) {
                return { startNote: sNote, endNote: eNote }
            }
        }

        // Couldn't find a usable pair
        return { startNote: startChord.upNote(), endNote: endChord.upNote() }
    }
}

export class HammerOnPullOff extends Slur {
    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.HAMMER_ON_PULL_OFF)
    }

    override newSlurTieSegment(parent: System | null): SlurTieSegment { return new HammerOnPullOffSegment(parent) }
}
