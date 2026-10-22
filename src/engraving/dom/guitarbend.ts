/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/guitarbend.h/.cpp
 *
 * TODO(port): editing (changeBendAmount, setEndNotePitch, fretting fixes, createEndNote, grips)
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import { LineF, PointF, PolygonF } from '../../framework/draw/types/geometry'
import type { Grip } from '../editing/editdata'
import type { Color } from '../../framework/draw/types/color'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymIdList } from '../types/symid'
import {
    DirectionV, ElementType, GuitarBendShowHoldLine, GuitarBendType, LineType, TextStyleType, VibratoType,
} from '../types/types'
import { Sid } from '../style/styledef'
import { RealIsEqualOrLess } from '../../framework/global/realfn'
import { prevChordRest, nextChordRest, type Chord } from './chord'
import { ElementFlag, LayoutData, type EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { LineSegment, SLine } from './line'
import type { Note } from './note'
import { Pid } from './property'
import { SpannerAnchor, type Spanner } from './spanner'
import type { System } from './system'
import { TextBase } from './textbase'

export class GuitarBendLayoutData extends LayoutData {
    up = true
    isInside = false
    bendDigit = ''
    diveLevels: Set<number> = new Set()
    aboveStaff = false

    resetDiveLevels(): void { this.diveLevels = new Set() }
}

export class GuitarBend extends SLine {
    static readonly SLACK_BEND_AMOUNT = -33

    private m_direction = DirectionV.AUTO
    private m_bendAmountInQuarterTones = 4
    private m_showHoldLine = GuitarBendShowHoldLine.AUTO
    private m_startTimeFactor = 0.0
    private m_endTimeFactor = 1.0

    private m_bendType = GuitarBendType.BEND
    private m_holdLine: GuitarBendHold | null = null
    private m_isInvalid = false
    private m_isBorderlineUnplayable = false
    private m_diveTabPos = DirectionV.AUTO
    private m_dipVibratoType = VibratoType.NONE
    private m_isSlack = false
    private m_targetTimeFactor: number | null = null

    static fixNotesFrettingForStandardBend(startNote: Note, endNote: Note): void {
        const curStaff = startNote.staff()
        const curPart = startNote.part()
        if (!curStaff || !curPart) {
            return
        }

        const stringData = curPart.stringData(startNote.tick(), curStaff.idx())
        let startFret = startNote.fret()
        let startString = startNote.string()
        if (startFret === 0) {
            // Bend can't start from empty string
            startString += 1
            startFret = stringData.fretForStaff(startNote.pitch() + curStaff.pitchOffset(startNote.tick()), startString, curStaff)
            startNote.undoChangeProperty(Pid.STRING, startString)
            startNote.undoChangeProperty(Pid.FRET, startFret)
        }

        if (endNote.string() !== startString) {
            endNote.undoChangeProperty(Pid.STRING, startString)
            const endFret = stringData.fretForStaff(endNote.pitch() + curStaff.pitchOffset(endNote.tick()), startString, curStaff)
            endNote.undoChangeProperty(Pid.FRET, endFret)
        }
    }

    constructor(parent: EngravingObject | null) {
        super(ElementType.GUITAR_BEND, parent, ElementFlag.MOVABLE)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_holdLine = null
    }

    protected override createLayoutData(): GuitarBendLayoutData { return new GuitarBendLayoutData(this) }
    override ldata(): GuitarBendLayoutData { return super.ldata() as GuitarBendLayoutData }
    override mutldata(): GuitarBendLayoutData { return super.ldata() as GuitarBendLayoutData }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new GuitarBendSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.lineColor())
        return seg
    }

    override allowTimeAnchor(): boolean { return false }

    direction(): DirectionV { return this.m_direction }
    setDirection(v: DirectionV): void { this.m_direction = v }
    bendAmountInQuarterTones(): number { return this.m_bendAmountInQuarterTones }
    setBendAmountInQuarterTones(v: number): void { this.m_bendAmountInQuarterTones = v }
    showHoldLine(): GuitarBendShowHoldLine { return this.m_showHoldLine }
    setShowHoldLine(v: GuitarBendShowHoldLine): void { this.m_showHoldLine = v }
    startTimeFactor(): number { return this.m_startTimeFactor }
    setStartTimeFactor(v: number): void { this.m_startTimeFactor = v }
    endTimeFactor(): number { return this.m_endTimeFactor }
    setEndTimeFactor(v: number): void { this.m_endTimeFactor = v }

    startNote(): Note | null {
        const startEl = this.startElement()
        return startEl && startEl.isNote() ? startEl as Note : null
    }

    startNoteOfChain(): Note | null {
        let startOfChain = this.startNote()
        let prevBend = this.findPrecedingBend()
        while (startOfChain && prevBend) {
            startOfChain = prevBend.startNote()
            prevBend = prevBend.findPrecedingBend()
        }
        return startOfChain
    }

    endNote(): Note | null {
        const endEl = this.endElement()
        return endEl && endEl.isNote() ? endEl as Note : null
    }

    isReleaseBend(): boolean {
        return this.bendAmountInQuarterTones() < 0
    }

    isFullRelease(): boolean {
        return this.isReleaseBend() && this.totBendAmountIncludingPrecedingBends() === 0
    }

    angledPreBend(): boolean {
        const endN = this.endNote()!
        const endChord = endN.chord()
        return this.bendType() === GuitarBendType.PRE_BEND && endN.string() > endChord.upString()
    }

    isDive(): boolean {
        switch (this.bendType()) {
        case GuitarBendType.DIVE:
        case GuitarBendType.PRE_DIVE:
        case GuitarBendType.DIP:
        case GuitarBendType.SCOOP:
            return true
        default:
            return false
        }
    }

    isFullReleaseDive(): boolean {
        return this.isDive() && this.totBendAmountIncludingPrecedingBends() === 0
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.DIRECTION:
            return this.direction()
        case Pid.BEND_SHOW_HOLD_LINE:
            return this.showHoldLine()
        case Pid.BEND_START_TIME_FACTOR:
            return this.startTimeFactor()
        case Pid.BEND_TARGET_TIME_FACTOR:
            return this.m_targetTimeFactor !== null ? this.m_targetTimeFactor : undefined
        case Pid.BEND_END_TIME_FACTOR:
            return this.endTimeFactor()
        case Pid.GUITAR_DIVE_TAB_POS:
            return this.isDive() ? this.m_diveTabPos : DirectionV.AUTO
        case Pid.GUITAR_BEND_AMOUNT:
            return this.bendAmountInQuarterTones()
        case Pid.VIBRATO_LINE_TYPE:
            return this.dipVibratoType()
        case Pid.GUITAR_DIVE_IS_SLACK:
            return this.isSlack()
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.DIRECTION:
            this.setDirection(v as DirectionV)
            break
        case Pid.BEND_SHOW_HOLD_LINE:
            this.setShowHoldLine(v as GuitarBendShowHoldLine)
            break
        case Pid.BEND_START_TIME_FACTOR:
            this.setStartTimeFactor(v as number)
            break
        case Pid.BEND_TARGET_TIME_FACTOR:
            if (v !== undefined && v !== null) {
                this.setTargetTimeFactor(v as number)
            } else {
                this.m_targetTimeFactor = null
            }
            break
        case Pid.BEND_END_TIME_FACTOR:
            this.setEndTimeFactor(v as number)
            break
        case Pid.COLOR:
            this.setColor(v as Color)
            this.setLineColor(v as Color)
            break
        case Pid.GUITAR_DIVE_TAB_POS:
            if (!this.isDive()) {
                return false
            }
            this.setDiveTabPos(v as DirectionV)
            break
        case Pid.GUITAR_BEND_AMOUNT:
            this.setBendAmountInQuarterTones(v as number)
            break
        case Pid.VIBRATO_LINE_TYPE:
            if (this.bendType() !== GuitarBendType.DIP) {
                return false
            }
            this.setDipVibratoType(v as VibratoType)
            break
        case Pid.GUITAR_DIVE_IS_SLACK:
            this.setIsSlack(v as boolean)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.DIRECTION:
            return DirectionV.AUTO
        case Pid.BEND_SHOW_HOLD_LINE:
            return GuitarBendShowHoldLine.AUTO
        case Pid.BEND_START_TIME_FACTOR:
            return 0.0
        case Pid.BEND_TARGET_TIME_FACTOR:
            if (this.m_bendType === GuitarBendType.DIP) {
                return 0.25
            }
            return undefined
        case Pid.BEND_END_TIME_FACTOR:
            if (this.m_bendType === GuitarBendType.GRACE_NOTE_BEND) {
                return 0.25
            }
            if (this.m_bendType === GuitarBendType.SCOOP) {
                return 0.25
            }
            if (this.m_bendType === GuitarBendType.DIP) {
                return 0.5
            }
            return 1.0
        case Pid.GUITAR_DIVE_TAB_POS:
            return DirectionV.AUTO
        case Pid.GUITAR_BEND_AMOUNT:
            return this.m_bendType === GuitarBendType.DIP ? -2 : 0
        case Pid.VIBRATO_LINE_TYPE:
            return VibratoType.NONE
        case Pid.GUITAR_DIVE_IS_SLACK:
            return false
        default:
            return super.propertyDefault(id)
        }
    }

    computeBendAmount(): void {
        if (this.isSlack()) {
            let prevAmount = 0
            const prevBend = this.findPrecedingBend()
            if (prevBend) {
                prevAmount = prevBend.totBendAmountIncludingPrecedingBends()
            }
            this.setBendAmountInQuarterTones(GuitarBend.SLACK_BEND_AMOUNT - prevAmount)
            this.computeBendText()
            return
        }

        if (this.bendType() === GuitarBendType.DIP) {
            this.computeBendText()
            return
        }

        if (this.bendType() === GuitarBendType.SCOOP) {
            this.setBendAmountInQuarterTones(-2)
            this.computeBendText()
            return
        }

        if (this.bendType() === GuitarBendType.SLIGHT_BEND) {
            this.setBendAmountInQuarterTones(1)
            this.computeBendText()
            return
        }

        if (this.isDive() && this.overlappingBendOrDive()) {
            this.computeBendText()
            return
        }

        const prevBend = this.findPrecedingBend()
        const prevSlack = prevBend && prevBend.isSlack() ? prevBend : null

        const startN = prevSlack ? prevSlack.startNote()! : this.startNote()!
        const endN = this.endNote()!

        const startPitch = startN.pitch()
        const endPitch = endN.pitch()

        let pitchDiffInQuarterTones = 2 * (endPitch - startPitch)

        const startOffInQuarterTones = Math.round(startN.centOffset() / 50)
        const endOffInQuarterTones = Math.round(endN.centOffset() / 50)

        pitchDiffInQuarterTones += endOffInQuarterTones - startOffInQuarterTones

        if (prevSlack) {
            pitchDiffInQuarterTones -= GuitarBend.SLACK_BEND_AMOUNT
        }

        const overlappingDive = this.overlappingBendOrDive()
        if (overlappingDive) {
            pitchDiffInQuarterTones -= overlappingDive.bendAmountInQuarterTones()
        }

        this.setBendAmountInQuarterTones(pitchDiffInQuarterTones)

        this.computeBendText()

        this.computeIsInvalidOrNeedsWarning()
    }

    totBendAmountIncludingPrecedingBends(): number {
        let bendAmount = this.bendAmountInQuarterTones()
        if (this.bendType() === GuitarBendType.PRE_DIVE || this.bendType() === GuitarBendType.PRE_BEND
            || this.bendType() === GuitarBendType.DIP || this.bendType() === GuitarBendType.SCOOP) {
            return bendAmount
        }

        let prevBend = this.findPrecedingBend()
        while (prevBend) {
            bendAmount += prevBend.bendAmountInQuarterTones()
            if (prevBend.bendType() === GuitarBendType.PRE_DIVE || prevBend.bendType() === GuitarBendType.PRE_BEND) {
                return bendAmount
            }
            prevBend = prevBend.findPrecedingBend()
        }

        return bendAmount
    }

    computeBendText(): void {
        if (this.isSlack()) {
            this.mutldata().bendDigit = 'slack'
            return
        }

        if (this.bendType() === GuitarBendType.PRE_DIVE || this.bendType() === GuitarBendType.PRE_BEND) {
            const prevBend = this.findPrecedingBend()
            if (prevBend && prevBend.holdLine()) {
                this.mutldata().bendDigit = ''
                return
            }
        }

        const quarters = this.totBendAmountIncludingPrecedingBends()

        // C++ integer division and modulo truncate towards zero
        const fulls = Math.trunc(quarters / 4)
        const quarts = quarters % 4
        if (fulls === 0 && quarters === 0) {
            this.mutldata().bendDigit = ''
            return
        }

        let string = bendAmountToString(fulls, quarts, this.style().styleB(Sid.useFractionCharacters))

        if (this.isDive()) {
            if (quarters > 0) {
                string = '+' + string
            } else if (quarters < 0 && fulls === 0) {
                string = '-' + string
            }
        }

        if (string === '1' && this.style().styleB(Sid.guitarBendUseFull)) {
            string = 'full'
        }

        this.mutldata().bendDigit = string
    }

    computeIsInvalidOrNeedsWarning(): void {
        const totBendAmount = this.totBendAmountIncludingPrecedingBends()
        const UNPLAYABLE_THRESHOLD = 14
        const WARNING_THRESHOLD = 8
        const DIVE_MAX = 16
        const DIVE_MIN = -32

        if (this.isDive()) {
            this.m_isInvalid = this.bendAmountInQuarterTones() === 0 || totBendAmount < DIVE_MIN || totBendAmount > DIVE_MAX
            this.m_isBorderlineUnplayable = false
        } else {
            this.m_isInvalid = totBendAmount < 0 || totBendAmount > UNPLAYABLE_THRESHOLD || this.bendAmountInQuarterTones() === 0
            this.m_isBorderlineUnplayable = totBendAmount > WARNING_THRESHOLD && totBendAmount <= UNPLAYABLE_THRESHOLD
        }
    }

    isInvalid(): boolean { return this.m_isInvalid }
    isBorderlineUnplayable(): boolean { return this.m_isBorderlineUnplayable }

    overlappingBendOrDive(): GuitarBend | null {
        const overlappingBendOrDive = this.isDive() ? this.startNote()!.bendFor() : this.startNote()!.diveFor()

        if (overlappingBendOrDive && overlappingBendOrDive !== this
            && overlappingBendOrDive.endNote() === this.endNote()) {
            return overlappingBendOrDive
        }

        return null
    }

    findPrecedingBend(): GuitarBend | null {
        let startN = this.startNote()!
        while (startN.tieBack() && startN.tieBack()!.startNote()) {
            startN = startN.tieBack()!.startNote()!
        }

        const isValidType = (t: GuitarBendType): boolean => {
            switch (t) {
            case GuitarBendType.SLIGHT_BEND:
            case GuitarBendType.DIP:
            case GuitarBendType.SCOOP:
                return false
            default:
                return true
            }
        }

        // If this is a bend[dive], backtrack on the chain of previous dives[bends] as if they were ties
        let bendOrDiveBack = this.isDive() ? startN.bendBack() : startN.diveBack()
        while (bendOrDiveBack && bendOrDiveBack.isDive() !== this.isDive() && isValidType(bendOrDiveBack.bendType())
               && !bendOrDiveBack.overlappingBendOrDive()) {
            startN = bendOrDiveBack.startNote()!
            bendOrDiveBack = this.isDive() ? startN.bendBack() : startN.diveBack()
        }

        const precedingBend = this.isDive() ? startN.diveBack() : startN.bendBack()
        if (precedingBend && precedingBend.isDive() === this.isDive() && isValidType(precedingBend.bendType())) {
            return precedingBend
        }

        if (this.bendType() === GuitarBendType.PRE_DIVE || this.bendType() === GuitarBendType.PRE_BEND) {
            let prevCR = prevChordRest(startN.chord())
            if (prevCR && prevCR.isRest() && this.isDive()) {
                const whammyBar = this.findOverlappingWhammyBar(prevCR.tick(), this.tick2())
                if (whammyBar) {
                    while (prevCR && prevCR.isRest() && prevCR.tick().gt(whammyBar.tick())) {
                        prevCR = prevChordRest(prevCR)
                    }
                }
            }

            if (!prevCR || !prevCR.isChord()) {
                return null
            }

            const prevChord = prevCR as Chord
            for (let note of prevChord.notes()) {
                while (note.tieBack() && note.tieBack()!.startNote()) {
                    note = note.tieBack()!.startNote()!
                }
                const prevBend = note.bendBack()
                let isValid = false
                if (prevBend && prevBend.isDive() === this.isDive()
                    && isValidType(prevBend.bendType())
                    && prevBend.totBendAmountIncludingPrecedingBends() === this.bendAmountInQuarterTones()) {
                    isValid = true
                }
                if (isValid) {
                    if (this.bendType() === GuitarBendType.PRE_BEND) {
                        const sn = prevBend!.startNote()!
                        isValid &&= sn.fret() === this.startNote()!.fret() && sn.string() === this.startNote()!.string()
                    }
                    if (isValid) {
                        return prevBend
                    }
                }
            }
        }

        return null
    }

    findFollowingPreBendOrDive(): GuitarBend | null {
        let endN = this.endNote()!
        while (endN.tieFor() && endN.tieFor()!.endNote()) {
            endN = endN.tieFor()!.endNote()!
        }

        let nextCR = nextChordRest(endN.chord())
        if (this.isDive() && nextCR && nextCR.isRest()) {
            const whammyBar = this.findOverlappingWhammyBar(this.tick(), nextCR.endTick())
            if (whammyBar) {
                while (nextCR && nextCR.isRest() && nextCR.tick().lt(whammyBar.tick2())) {
                    nextCR = nextChordRest(nextCR)
                }
            }
        }

        if (!nextCR || !nextCR.isChord()) {
            return null
        }

        const nextChord = nextCR as Chord
        for (let note of nextChord.notes()) {
            while (note.tieFor() && note.tieFor()!.endNote()) {
                note = note.tieFor()!.endNote()!
            }
            const bend = note.bendFor()
            let isValid = false
            if (bend && bend.isDive() === this.isDive()
                && (bend.bendType() === GuitarBendType.PRE_DIVE || bend.bendType() === GuitarBendType.PRE_BEND)
                && bend.bendAmountInQuarterTones() === this.totBendAmountIncludingPrecedingBends()) {
                isValid = true
            }
            if (isValid) {
                if (bend!.bendType() === GuitarBendType.PRE_BEND) {
                    const startN = bend!.startNote()!
                    isValid &&= startN.fret() === this.startNote()!.fret() && startN.string() === this.startNote()!.string()
                }
                if (isValid) {
                    return bend
                }
            }
        }

        return null
    }

    /** TODO(port): WhammyBar is not ported yet, so none is ever found */
    findOverlappingWhammyBar(startTick: Fraction, endTick: Fraction): Spanner | null {
        const spanners = this.score().spannerMap().findOverlapping(startTick.ticks(), endTick.ticks())
        for (const spanner of spanners) {
            if (spanner.isWhammyBar() && spanner.tick().lt(startTick) && spanner.tick2().ge(endTick)) {
                const spannerStaff = spanner.staff()
                const thisStaff = this.staff()
                if (spannerStaff === thisStaff || (!!spannerStaff && spannerStaff.isLinked(thisStaff))) {
                    return spanner
                }
            }
        }

        return null
    }

    updateHoldLine(): void {
        let startOfHold: Note | null = null
        let endOfHold: Note | null = null

        const isDipWithVibrato = this.bendType() === GuitarBendType.DIP && this.dipVibratoType() !== VibratoType.NONE
        let canHaveHoldLine = isDipWithVibrato || (this.staffType()!.isTabStaff() && !this.isFullRelease()
                                                   && this.bendType() !== GuitarBendType.SCOOP
                                                   && this.bendType() !== GuitarBendType.DIP)
        if (this.isDive()) {
            canHaveHoldLine &&= !!this.startNote() && this.startNote() === this.startNote()!.chord().upNote()
        }

        let needsHoldLine = false
        if (canHaveHoldLine) {
            startOfHold = this.endNote()!
            endOfHold = startOfHold

            const followingPreDive = this.findFollowingPreBendOrDive()
            endOfHold = followingPreDive ? followingPreDive.startNote()! : startOfHold

            if (endOfHold === startOfHold) {
                while (endOfHold.tieFor() && endOfHold.tieFor()!.endNote()) {
                    endOfHold = endOfHold.tieFor()!.endNote()!
                }
            }

            if (this.isDive()) {
                let bendF = endOfHold.bendFor()
                while (bendF && !bendF.isDive() && !bendF.overlappingBendOrDive() && bendF.endNote() !== endOfHold) {
                    endOfHold = bendF.endNote()!
                    bendF = endOfHold.bendFor()
                }
            } else {
                let diveF = endOfHold.diveFor()
                while (diveF && !diveF.overlappingBendOrDive() && diveF.endNote() !== endOfHold) {
                    endOfHold = diveF.endNote()!
                    diveF = endOfHold.diveFor()
                }
            }

            if (this.showHoldLine() === GuitarBendShowHoldLine.AUTO) {
                needsHoldLine = endOfHold !== startOfHold
            } else {
                needsHoldLine = this.showHoldLine() === GuitarBendShowHoldLine.SHOW
            }
            needsHoldLine ||= isDipWithVibrato
        }

        if (!needsHoldLine) {
            if (this.m_holdLine) {
                if (!this.m_holdLine.segmentsEmpty()) {
                    this.m_holdLine.eraseSpannerSegments()
                }
                this.m_holdLine = null
            }
            return
        }

        if (endOfHold === startOfHold) {
            const guessedEndChord = startOfHold!.chord().next()
            if (guessedEndChord) {
                for (const note of guessedEndChord.notes()) {
                    if (note.isPreBendOrDiveStart()) {
                        endOfHold = note
                        break
                    }
                }
            }
        }

        if (!this.m_holdLine) {
            this.m_holdLine = new GuitarBendHold(this)
        }

        this.m_holdLine.setAnchor(SpannerAnchor.NOTE)
        this.m_holdLine.setStartElement(startOfHold)
        this.m_holdLine.setEndElement(endOfHold)
        this.m_holdLine.setTick(startOfHold!.tick())
        this.m_holdLine.setTick2(endOfHold!.tick())
        this.m_holdLine.setTrack(this.track())
        this.m_holdLine.setTrack2(this.track())
        this.m_holdLine.setGenerated(true)
        this.m_holdLine.setParent(this)
    }

    setHoldLine(hold: GuitarBendHold | null): void { this.m_holdLine = hold }
    holdLine(): GuitarBendHold | null { return this.m_holdLine }

    /** C++ double lineWidth() (hides SLine::lineWidth()) */
    bendLineWidth(): number {
        const st = this.staffType()
        if (this.isDive()) {
            return (st && st.isTabStaff())
                ? this.style().styleMM(Sid.guitarDiveLineWidthTab)
                : this.style().styleMM(Sid.guitarDiveLineWidth)
        }

        return (st && st.isTabStaff())
            ? this.style().styleMM(Sid.guitarBendLineWidthTab)
            : this.style().styleMM(Sid.guitarBendLineWidth)
    }

    // C++ curColor() colors invalid bends when MScore::warnGuitarBends is set, which is off by default

    diveTabPos(): DirectionV { return this.m_diveTabPos }
    setDiveTabPos(v: DirectionV): void { this.m_diveTabPos = v }

    bendType(): GuitarBendType { return this.m_bendType }
    setBendType(t: GuitarBendType): void {
        this.m_bendType = t

        this.resetProperty(Pid.GUITAR_BEND_AMOUNT)
        this.resetProperty(Pid.BEND_START_TIME_FACTOR)
        this.resetProperty(Pid.BEND_END_TIME_FACTOR)
        this.resetProperty(Pid.BEND_TARGET_TIME_FACTOR)
    }

    dipVibratoType(): VibratoType { return this.m_dipVibratoType }
    setDipVibratoType(v: VibratoType): void { this.m_dipVibratoType = v }

    isSlack(): boolean { return this.m_isSlack }
    setIsSlack(v: boolean): void { this.m_isSlack = v }

    targetTimeFactor(): number | null { return this.m_targetTimeFactor }
    setTargetTimeFactor(v: number): void {
        if (!RealIsEqualOrLess(v, this.endTimeFactor())) {
            return
        }
        this.m_targetTimeFactor = v
    }
}

export class GuitarBendSegmentLayoutData extends LayoutData {
    vertexPoint = new PointF() // Coordinates relative to pos()
    path = new PainterPath()
    arrow = new PolygonF()
}

export class GuitarBendSegment extends LineSegment {
    private m_vertexPointOff = new PointF()
    private m_text: GuitarBendText

    constructor(sp: GuitarBend | null, parent: System | null) {
        super(ElementType.GUITAR_BEND_SEGMENT, sp, parent, ElementFlag.MOVABLE)
        this.m_text = new GuitarBendText(this)
        this.m_text.setParent(this)
        this.setFlag(ElementFlag.ON_STAFF, true)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_text = new GuitarBendText(this)
        this.m_text.setParent(this)
    }

    protected override createLayoutData(): GuitarBendSegmentLayoutData { return new GuitarBendSegmentLayoutData(this) }
    override ldata(): GuitarBendSegmentLayoutData { return super.ldata() as GuitarBendSegmentLayoutData }
    override mutldata(): GuitarBendSegmentLayoutData { return super.ldata() as GuitarBendSegmentLayoutData }

    guitarBend(): GuitarBend { return this.spanner() as GuitarBend }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.BEND_VERTEX_OFF:
            return this.vertexPointOff()
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.BEND_VERTEX_OFF:
            this.setVertexPointOff(v as PointF)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.BEND_VERTEX_OFF:
            return new PointF()
        default:
            return super.propertyDefault(id)
        }
    }

    override propertyDelegate(id: Pid): EngravingObject | null {
        switch (id) {
        case Pid.DIRECTION:
        case Pid.BEND_SHOW_HOLD_LINE:
        case Pid.POSITION_LINKED_TO_MASTER:
        case Pid.APPEARANCE_LINKED_TO_MASTER:
        case Pid.GUITAR_DIVE_TAB_POS:
        case Pid.VIBRATO_LINE_TYPE:
            return this.guitarBend()
        default:
            return super.propertyDelegate(id)
        }
    }

    vertexPointOff(): PointF { return this.m_vertexPointOff }
    setVertexPointOff(p: PointF): void { this.m_vertexPointOff = p.clone() }

    /** C++ double lineWidth() (hides LineSegment::lineWidth()) */
    bendLineWidth(): number {
        return this.guitarBend().bendLineWidth()
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        func(this.m_text)
        super.scanElements(func)
    }

    bendText(): GuitarBendText { return this.m_text }
    setBendText(t: GuitarBendText): void { this.m_text = t }

    override isUserModified(): boolean {
        const modified = !this.vertexPointOff().isNull() || (this.m_text && this.m_text.isUserModified())
        return modified || super.isUserModified()
    }

    override gripAnchorLines(_grip: Grip): LineF[] { return [] }
}

export class GuitarBendHold extends SLine {
    constructor(parent: GuitarBend | null) {
        super(ElementType.GUITAR_BEND_HOLD, parent, ElementFlag.MOVABLE)
        this.resetProperty(Pid.LINE_STYLE)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new GuitarBendHoldSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.lineColor())
        return seg
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.LINE_STYLE:
            return LineType.DASHED
        default:
            return super.propertyDefault(id)
        }
    }

    override allowTimeAnchor(): boolean { return false }

    startNote(): Note {
        return this.startElement() as Note
    }

    endNote(): Note {
        return this.endElement() as Note
    }

    guitarBend(): GuitarBend { return this.explicitParent() as GuitarBend }

    /** C++ double lineWidth() (hides SLine::lineWidth()) */
    bendLineWidth(): number {
        const p = this.explicitParent()
        return this.style().styleMM(p && (p as GuitarBend).isDive() ? Sid.guitarDiveLineWidthTab : Sid.guitarBendLineWidthTab)
    }
}

export class GuitarBendHoldSegmentLayoutData extends LayoutData {
    symIds: SymIdList = []
}

export class GuitarBendHoldSegment extends LineSegment {
    private m_dashLength = 3.0
    private m_startBendSeg: GuitarBendSegment | null = null
    private m_endBendSeg: GuitarBendSegment | null = null

    constructor(sp: GuitarBendHold | null, parent: System | null) {
        super(ElementType.GUITAR_BEND_HOLD_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.setFlag(ElementFlag.ON_STAFF, true)
    }

    protected override createLayoutData(): GuitarBendHoldSegmentLayoutData { return new GuitarBendHoldSegmentLayoutData(this) }
    override ldata(): GuitarBendHoldSegmentLayoutData { return super.ldata() as GuitarBendHoldSegmentLayoutData }
    override mutldata(): GuitarBendHoldSegmentLayoutData { return super.ldata() as GuitarBendHoldSegmentLayoutData }

    guitarBendHold(): GuitarBendHold { return this.spanner() as GuitarBendHold }

    startBendSeg(): GuitarBendSegment | null { return this.m_startBendSeg }
    endBendSeg(): GuitarBendSegment | null { return this.m_endBendSeg }
    setStartBendSeg(s: GuitarBendSegment | null): void { this.m_startBendSeg = s }
    setEndBendSeg(s: GuitarBendSegment | null): void { this.m_endBendSeg = s }

    dashLength(): number { return this.m_dashLength }

    /** C++ double lineWidth() (hides LineSegment::lineWidth()) */
    bendLineWidth(): number { return this.guitarBendHold().bendLineWidth() }

    override gripAnchorLines(_grip: Grip): LineF[] { return [] }
}

const guitarBendStyle: ElementStyle = []

export class GuitarBendText extends TextBase {
    constructor(parent: GuitarBendSegment | null) {
        super(ElementType.GUITAR_BEND_TEXT, parent, TextStyleType.BEND)
        this.initElementStyle(guitarBendStyle)
    }

    override isEditable(): boolean { return false }

    override positionRelativeToNoteheadRest(): boolean { return false }
}

/** C++ dom/utils.cpp */
export function bendAmountToString(fulls: number, quarts: number, useFractions: boolean): string {
    let string = fulls !== 0 ? String(fulls) : ''

    if (useFractions) {
        switch (Math.abs(quarts)) {
        case 1:
            string += '¼'
            break
        case 2:
            string += '½'
            break
        case 3:
            string += '¾'
            break
        default:
            break
        }
    } else {
        if (string.length && quarts !== 0) {
            string += ' '
        }
        switch (Math.abs(quarts)) {
        case 1:
            string += '1/4'
            break
        case 2:
            string += '1/2'
            break
        case 3:
            string += '3/4'
            break
        default:
            break
        }
    }

    return string
}
