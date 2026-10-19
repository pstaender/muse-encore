/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/accidentalslayout.h/.cpp
 */

import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsEqual, RealIsNull } from '../../../framework/global/realfn'
import { ElementType } from '../../types/types'
import { SymId } from '../../types/symid'
import { Shape, intersects, type ShapeElement } from '../../infrastructure/shape'
import { Sid } from '../../style/styledef'
import { AccidentalType } from '../../dom/accidentaldata'
import { AccidentalBracket, type Accidental } from '../../dom/accidental'
import type { Chord } from '../../dom/chord'
import type { EngravingItem } from '../../dom/engravingitem'
import { paddingTable } from '../paddingtable'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'

type AccidentalGroups = Accidental[][]

/** muse::VectorView: a shrinking view of a vector */
class AccidentalsVectorView {
    private m_items: Accidental[]

    constructor(vec: readonly Accidental[]) {
        this.m_items = [...vec]
    }

    empty(): boolean { return this.m_items.length === 0 }
    pop_front(): Accidental { return this.m_items.shift()! }
    pop_back(): Accidental { return this.m_items.pop()! }

    remove(v: Accidental): boolean {
        return this.remove_if(a => a === v)
    }

    remove_if(pred: (a: Accidental) => boolean): boolean {
        const before = this.m_items.length
        this.m_items = this.m_items.filter(a => !pred(a))
        return this.m_items.length !== before
    }

    reverse_remove_if(pred: (a: Accidental) => boolean): boolean {
        const before = this.m_items.length
        const kept: Accidental[] = []
        for (let i = this.m_items.length - 1; i >= 0; --i) {
            if (!pred(this.m_items[i])) {
                kept.push(this.m_items[i])
            }
        }
        this.m_items = kept.reverse()
        return this.m_items.length !== before
    }
}

class AccidentalsLayoutContext {
    allAccidentals: Accidental[]
    chords: readonly Chord[]
    accidentalSubChords: AccidentalGroups = []
    stackedAccidentals: Accidental[] = []
    stackedAccidentalsShape = new Shape()
    chordsShape = new Shape()
    subChordsCountBeforeOctaveMerge = 1

    private m_spatium = 0.0
    private m_verticalAccidentalToAccidentalClearance = 0.0
    private m_verticalSharpToSharpClearance = 0.0
    private m_verticalAccidentalToChordClearance = 0.0
    private m_accidentalAccidentalDistance = 0.0
    private m_additionalPaddingForVerticals = 0.0
    private m_xPosSplitThreshold = 0.0
    private m_xVerticalAlignmentThreshold = 0.0
    private m_sharpAndNaturalLedgerLinePadding = 0.0
    private m_reducedFlatToNotePadding = 0.0
    private m_flatKerningOfFourth = 0.0
    private m_naturalKerningOfFourth = 0.0
    private m_orderFollowNoteDisplacement = false
    private m_alignOctavesAcrossSubChords = false
    private m_keepSecondsTogether = false
    private m_alignOffsetOctaves = false

    constructor(acc: Accidental[], ch: readonly Chord[]) {
        this.allAccidentals = acc
        this.chords = ch
        AccidentalsLayout.sortTopDown(this.allAccidentals)
        this.initConstants()
    }

    spatium(): number { return this.m_spatium }
    verticalAccidentalToAccidentalClearance(): number { return this.m_verticalAccidentalToAccidentalClearance }
    verticalSharpToSharpClearance(): number { return this.m_verticalSharpToSharpClearance }
    verticalAccidentalToChordClearance(): number { return this.m_verticalAccidentalToChordClearance }
    accidentalAccidentalDistance(): number { return this.m_accidentalAccidentalDistance }
    additionalPaddingForVerticals(): number { return this.m_additionalPaddingForVerticals }
    xPosSplitThreshold(): number { return this.m_xPosSplitThreshold }
    xVerticalAlignmentThreshold(): number { return this.m_xVerticalAlignmentThreshold }
    sharpAndNaturalLedgerLinePadding(): number { return this.m_sharpAndNaturalLedgerLinePadding }
    reducedFlatToNotePadding(): number { return this.m_reducedFlatToNotePadding }
    flatKerningOfFourth(): number { return this.m_flatKerningOfFourth }
    naturalKerningOfFourth(): number { return this.m_naturalKerningOfFourth }
    orderFollowNoteDisplacement(): boolean { return this.m_orderFollowNoteDisplacement }
    alignOctavesAcrossSubChords(): boolean { return this.m_alignOctavesAcrossSubChords }
    keepSecondsTogether(): boolean { return this.m_keepSecondsTogether }
    alignOffsetOctaves(): boolean { return this.m_alignOffsetOctaves }
    largeGroupLimit(): number { return 6 }
    smallGroupLimit(): number { return 3 }

    private initConstants(): void {
        this.m_spatium = this.allAccidentals[0].spatium()
        const sp = this.m_spatium
        this.m_verticalAccidentalToAccidentalClearance = 0.15 * sp
        this.m_verticalSharpToSharpClearance = 0.05 * sp
        this.m_verticalAccidentalToChordClearance = 0.10 * sp
        this.m_additionalPaddingForVerticals = 0.1 * sp
        this.m_xPosSplitThreshold = 0.5 * sp
        this.m_xVerticalAlignmentThreshold = 0.75 * sp
        this.m_sharpAndNaturalLedgerLinePadding = 0.1 * sp
        this.m_reducedFlatToNotePadding = 0.15 * sp
        this.m_flatKerningOfFourth = -0.15 * sp
        this.m_naturalKerningOfFourth = -0.05 * sp

        const style = this.allAccidentals[0].style()
        this.m_accidentalAccidentalDistance = style.styleMM(Sid.accidentalDistance)
        this.m_orderFollowNoteDisplacement = style.styleB(Sid.accidentalOrderFollowsNoteDisplacement)
        this.m_alignOctavesAcrossSubChords = style.styleB(Sid.alignAccidentalOctavesAcrossSubChords)
        this.m_keepSecondsTogether = style.styleB(Sid.keepAccidentalSecondsTogether)
        this.m_alignOffsetOctaves = style.styleB(Sid.alignOffsetOctaveAccidentals)
    }
}

/** std::map<double, ...> keyed iteration in ascending key order */
function groupBy(keys: Map<number, Accidental[]>, key: number, acc: Accidental): void {
    let v = keys.get(key)
    if (!v) {
        v = []
        keys.set(key, v)
    }
    v.push(acc)
}

function sortedEntries(m: Map<number, Accidental[]>): [number, Accidental[]][] {
    return [...m.entries()].sort((a, b) => a[0] - b[0])
}

// std::round rounds half away from zero
const stdRound = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x))

export class AccidentalsLayout {
    static layoutAccidentals(chords: readonly Chord[], ctx: LayoutContext): void {
        const allAccidentals: Accidental[] = []
        const redundantAccidentals: Accidental[] = []
        const invisibleAccidentals: Accidental[] = []
        AccidentalsLayout.collectAccidentals(chords, allAccidentals, redundantAccidentals, invisibleAccidentals)

        for (const acc of invisibleAccidentals) {
            acc.computeMag()
            TLayout.layoutAccidental(acc, ctx)
            let x = -acc.ldata().bbox().width()
            x -= acc.note() ? acc.note()!.pos().x() : 0.0
            acc.setPos(x, 0.0)
        }

        if (allAccidentals.length === 0) {
            return
        }

        for (const acc of redundantAccidentals) {
            acc.setPos(0.0, 0.0)
            acc.setbbox(new RectF())
        }

        for (const acc of allAccidentals) {
            acc.setPos(0.0, 0.0)
            acc.computeMag()
            TLayout.layoutAccidental(acc, ctx)
        }

        const accidentalsLayoutContext = new AccidentalsLayoutContext(allAccidentals, chords)
        AccidentalsLayout.doAccidentalPlacement(accidentalsLayoutContext)
    }

    private static collectAccidentals(chords: readonly Chord[], allAccidentals: Accidental[], redundantAccidentals: Accidental[],
                                      invisibleAccidentals: Accidental[]): void {
        for (const chord of chords) {
            for (const note of chord.notes()) {
                const acc = note.accidental()
                if (!acc) {
                    continue
                }
                if (AccidentalsLayout.accidentalIsRedundant(acc, allAccidentals)) {
                    redundantAccidentals.push(acc)
                } else if (!acc.addToSkyline()) {
                    invisibleAccidentals.push(acc)
                } else {
                    allAccidentals.push(acc)
                }
            }
        }
    }

    private static accidentalIsRedundant(acc: Accidental, allAccidentals: readonly Accidental[]): boolean {
        for (const otherAcc of allAccidentals) {
            if (otherAcc.accidentalType() === acc.accidentalType() && otherAcc.line() === acc.line()) {
                return true
            }
        }
        return false
    }

    private static doAccidentalPlacement(ctx: AccidentalsLayoutContext): void {
        AccidentalsLayout.createChordsShape(ctx)

        AccidentalsLayout.findOctavesAndSeconds(ctx)

        AccidentalsLayout.splitIntoSubChords(ctx)

        for (const accidentalSubChord of ctx.accidentalSubChords) {
            AccidentalsLayout.layoutSubChord(accidentalSubChord, ctx)
        }

        AccidentalsLayout.verticallyAlignAccidentals(ctx)
    }

    private static findOctavesAndSeconds(ctx: AccidentalsLayoutContext): void {
        for (const acc1 of ctx.allAccidentals) {
            const octaves: Accidental[] = []
            const seconds: Accidental[] = []
            acc1.mutldata().octaves = octaves
            acc1.mutldata().seconds = seconds
            for (const acc2 of ctx.allAccidentals) {
                if (acc2 === acc1) {
                    continue
                }
                if (AccidentalsLayout.isOctave(acc1, acc2)) {
                    octaves.push(acc2)
                } else if (Math.abs(acc1.line() - acc2.line()) === 1) {
                    seconds.push(acc2)
                }
            }
        }
    }

    private static splitIntoSubChords(ctx: AccidentalsLayoutContext): void {
        ctx.accidentalSubChords.push([ctx.allAccidentals[0]])

        const LINE_DIFF_OF_SEVENTH = 6

        for (let i = 1; i < ctx.allAccidentals.length; ++i) {
            const prevAcc = ctx.allAccidentals[i - 1]
            const curAcc = ctx.allAccidentals[i]
            const startNewGroup = curAcc.line() - prevAcc.line() >= LINE_DIFF_OF_SEVENTH
            if (startNewGroup) {
                ctx.accidentalSubChords.push([curAcc])
            } else {
                ctx.accidentalSubChords[ctx.accidentalSubChords.length - 1].push(curAcc)
            }
        }

        AccidentalsLayout.mergeAdjacentSubGroupsIfTooSmall(ctx)

        ctx.subChordsCountBeforeOctaveMerge = ctx.accidentalSubChords.length

        if (ctx.alignOctavesAcrossSubChords()) {
            AccidentalsLayout.mergeSubGroupsWithOctavesAcross(ctx)
        }
    }

    private static mergeAdjacentSubGroupsIfTooSmall(ctx: AccidentalsLayoutContext): void {
        const approxOffsetNoteThreshold = 0.5 * ctx.spatium()
        let groupingChanged: boolean
        do {
            groupingChanged = false
            for (let i = 0; i < ctx.accidentalSubChords.length - 1; ++i) {
                const thisGroup = ctx.accidentalSubChords[i]
                const nextGroup = ctx.accidentalSubChords[i + 1]
                const groupIsSmall = thisGroup.length + nextGroup.length <= ctx.smallGroupLimit()
                const nextStartsWithOffsetNote = nextGroup[0].note()!.x() > approxOffsetNoteThreshold
                if (groupIsSmall && !nextStartsWithOffsetNote) {
                    groupingChanged = true
                    thisGroup.push(...nextGroup)
                    ctx.accidentalSubChords.splice(i + 1, 1)
                }
            }
        } while (groupingChanged)
    }

    private static mergeSubGroupsWithOctavesAcross(ctx: AccidentalsLayoutContext): void {
        const isOctaveAcrossGroups = (group1: readonly Accidental[], group2: readonly Accidental[]): boolean => {
            for (const acc1 of group1) {
                for (const octaveAcc of acc1.ldata().octaves) {
                    if (group2.includes(octaveAcc)) {
                        return true
                    }
                }
            }
            return false
        }

        let foundOctave: boolean
        do {
            foundOctave = false
            for (let i = 0; i < ctx.accidentalSubChords.length - 1; ++i) {
                const thisGroup = ctx.accidentalSubChords[i]
                for (let j = i + 1; j < ctx.accidentalSubChords.length; ++j) {
                    const nextGroup = ctx.accidentalSubChords[j]
                    foundOctave = isOctaveAcrossGroups(thisGroup, nextGroup)
                    if (foundOctave) {
                        thisGroup.push(...nextGroup)
                        ctx.accidentalSubChords.splice(j, 1)
                        break
                    }
                }
                if (foundOctave) {
                    break
                }
            }
        } while (foundOctave)
    }

    private static createChordsShape(ctx: AccidentalsLayoutContext): void {
        ctx.chordsShape.clear()
        for (const chord of ctx.chords) {
            const chordPos = AccidentalsLayout.keepAccidentalsCloseToChord(chord) ? new PointF() : chord.pos()
            for (const ledger of chord.ledgerLines()) {
                ctx.chordsShape.add(ledger.shape().translate(ledger.pos().plus(chordPos)))
            }
            for (const note of chord.notes()) {
                let noteSym = note.ldata().cachedNoteheadSym
                if (noteSym === SymId.noSym) {
                    noteSym = note.noteHead()
                }
                ctx.chordsShape.add(note.symShapeWithCutouts(noteSym).translate(note.pos().plus(chordPos)))
            }
            const stem = chord.stem()
            if (stem && stem.addToSkyline()) {
                ctx.chordsShape.add(stem.shape().translate(stem.pos().plus(chordPos)))
            }
        }
    }

    private static layoutSubChord(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        AccidentalsLayout.computeOrdering(accidentals, ctx)

        for (const acc of accidentals) {
            AccidentalsLayout.stackAccidental(acc, ctx)
        }
    }

    private static stackAccidental(acc: Accidental, ctx: AccidentalsLayoutContext): void {
        const accShape = acc.shape()
        accShape.translateY(acc.note()!.y())

        let x = AccidentalsLayout.minAccidentalToChordDistance(acc, accShape, ctx)
        accShape.translateX(-x)

        const minDistToAccidGroup = AccidentalsLayout.minAccidentalToAccidentalGroupDistance(acc, accShape, ctx.stackedAccidentalsShape, ctx)
        accShape.translateX(-minDistToAccidGroup)
        x += minDistToAccidGroup

        AccidentalsLayout.setXposRelativeToSegment(acc, -x)

        AccidentalsLayout.checkZeroColumn(acc, ctx)

        ctx.stackedAccidentalsShape.add(accShape)
        ctx.stackedAccidentals.push(acc)
    }

    private static checkZeroColumn(acc: Accidental, ctx: AccidentalsLayoutContext): void {
        // If this accidental is in column 0 but is completely to the left of any other accidental, it should go in the next column
        let column = acc.ldata().column
        if (column !== 0) {
            return
        }
        const thisBBox = acc.ldata().bbox().translated(new PointF(AccidentalsLayout.xPosRelativeToSegment(acc), 0.0))
        for (const stackedAcc of ctx.stackedAccidentals) {
            const placedBBox = stackedAcc.ldata().bbox().translated(new PointF(AccidentalsLayout.xPosRelativeToSegment(stackedAcc), 0.0))
            if (thisBBox.right() < placedBBox.left()) {
                column = Math.max(column, stackedAcc.ldata().column + 1)
            }
        }
        acc.mutldata().column = column
    }

    private static computeOrdering(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        const priorityGroups = AccidentalsLayout.splitIntoPriorityGroups(accidentals, ctx)

        accidentals.length = 0

        for (const group of priorityGroups) {
            AccidentalsLayout.determineStackingOrder(group, ctx)
            accidentals.push(...group)
        }

        AccidentalsLayout.applyOrderingOffsets(accidentals)
    }

    private static splitIntoPriorityGroups(accidentals: Accidental[], ctx: AccidentalsLayoutContext): AccidentalGroups {
        let groups: AccidentalGroups = []
        if (ctx.orderFollowNoteDisplacement()) {
            const noteSplitGroups = AccidentalsLayout.splitAccordingToNoteDisplacement(accidentals, ctx)
            for (const noteSplitGroup of noteSplitGroups) {
                const accidSplitGroups = AccidentalsLayout.splitAccordingToAccidDisplacement([...noteSplitGroup], ctx)
                groups.push(...accidSplitGroups)
            }
        } else {
            groups = AccidentalsLayout.splitAccordingToAccidDisplacement(accidentals, ctx)
        }

        const curGroupsCount = groups.length
        if (ctx.alignOctavesAcrossSubChords()) {
            // NOTE: C++ merges ctx.accidentalSubChords here (not groups)
            AccidentalsLayout.mergeSubGroupsWithOctavesAcross(ctx)
            if (groups.length !== curGroupsCount) {
                for (const subGroup of groups) {
                    AccidentalsLayout.sortTopDown(subGroup)
                }
            }
        }

        return groups
    }

    private static splitAccordingToAccidDisplacement(accidentals: Accidental[], ctx: AccidentalsLayoutContext): AccidentalGroups {
        const subGroups = AccidentalsLayout.groupAccidentalsByXPos(accidentals, ctx).filter(subGroup => subGroup.length !== 0)

        if (subGroups.length > 1 && subGroups[0].length > 1) {
            AccidentalsLayout.moveOctavesToSecondGroup(subGroups)
        }

        for (const subGroup of subGroups) {
            AccidentalsLayout.sortTopDown(subGroup)
        }

        return subGroups
    }

    private static groupAccidentalsByXPos(accidentals: readonly Accidental[], ctx: AccidentalsLayoutContext): AccidentalGroups {
        const groupsOfEqualX = new Map<number, Accidental[]>()
        for (const acc of accidentals) {
            const accRoughShape = new Shape(acc.symBbox(acc.symId()), acc)
            accRoughShape.translateY(acc.note()!.y())
            const x = -AccidentalsLayout.minAccidentalToChordDistance(acc, accRoughShape, ctx) + acc.symWidth(acc.symId())
            groupBy(groupsOfEqualX, stdRound(x), acc)
        }

        const entries = sortedEntries(groupsOfEqualX)
        let splitPoint = Number.MAX_VALUE
        let prevX = entries[0][0]
        for (const [curX] of entries) {
            if (curX - prevX > ctx.xPosSplitThreshold()) {
                splitPoint = curX
                break
            }
            prevX = curX
        }

        const subGroups: AccidentalGroups = [[], []]
        for (const [x, accs] of entries) {
            if (x >= splitPoint) {
                for (const acc of accs) {
                    subGroups[0].push(acc)
                    acc.mutldata().verticalSubgroup = 0
                }
            } else {
                for (const acc of accs) {
                    subGroups[1].push(acc)
                    acc.mutldata().verticalSubgroup = 1
                }
            }
        }

        return subGroups
    }

    private static moveOctavesToSecondGroup(subGroups: AccidentalGroups): void {
        if (subGroups.length !== 2) {
            return
        }
        const firstGroup = subGroups[0]
        const secondGroup = subGroups[1]
        let i = 0
        while (i < firstGroup.length) {
            const acc = firstGroup[i]
            let removeOne = false
            for (const octaveAcc of acc.ldata().octaves) {
                if (secondGroup.includes(octaveAcc)) {
                    removeOne = true
                    secondGroup.push(acc)
                    acc.mutldata().verticalSubgroup = 1
                    break
                }
            }
            if (removeOne) {
                firstGroup.splice(i, 1)
            } else {
                ++i
            }
        }
    }

    private static splitAccordingToNoteDisplacement(accidentals: readonly Accidental[], ctx: AccidentalsLayoutContext): AccidentalGroups {
        const subGroups = AccidentalsLayout.groupAccidentalsByNoteXPos(accidentals)

        if (ctx.keepSecondsTogether()) {
            AccidentalsLayout.moveSecondsInSameGroup(subGroups)
        }

        for (let i = 0; i < subGroups.length; ++i) {
            for (const acc of subGroups[i]) {
                acc.mutldata().verticalSubgroup = i
            }
        }

        return subGroups
    }

    private static groupAccidentalsByNoteXPos(accidentals: readonly Accidental[]): AccidentalGroups {
        const subGroups: AccidentalGroups = []

        const groupsOfEqualNoteX = new Map<number, Accidental[]>()
        for (const accidental of accidentals) {
            const note = accidental.note()!
            const x = stdRound(note.pos().x() + note.chord().pos().x())
            groupBy(groupsOfEqualNoteX, x, accidental)
        }

        const entries = sortedEntries(groupsOfEqualNoteX)
        for (let i = entries.length - 1; i >= 0; --i) {
            subGroups.push(entries[i][1])
        }

        return subGroups
    }

    private static moveSecondsInSameGroup(subGroups: AccidentalGroups): void {
        let secondMoved: boolean
        do {
            secondMoved = false
            for (let i = 0; i < subGroups.length - 1; ++i) {
                const thisGroup = subGroups[i]
                const nextGroup = subGroups[i + 1]
                for (let j = 0; j < thisGroup.length; ++j) {
                    const acc1 = thisGroup[j]
                    for (const secondAcc of acc1.ldata().seconds) {
                        const idx = nextGroup.indexOf(secondAcc)
                        if (idx >= 0) {
                            nextGroup.splice(idx, 1)
                            secondMoved = true
                            if (secondAcc.line() < acc1.line()) {
                                thisGroup.splice(j, 0, secondAcc)
                            } else {
                                thisGroup.splice(j + 1, 0, secondAcc)
                            }
                            break
                        }
                    }
                    if (secondMoved) {
                        break
                    }
                }
                if (nextGroup.length === 0) {
                    subGroups.splice(i + 1, 1)
                }
                if (secondMoved) {
                    break
                }
            }
        } while (secondMoved)
    }

    private static determineStackingOrder(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        const groupSize = accidentals.length
        if (groupSize <= ctx.smallGroupLimit()) {
            AccidentalsLayout.computeStandardOrdering(accidentals, ctx)
        } else if (groupSize > ctx.largeGroupLimit()
                   || (ctx.alignOctavesAcrossSubChords() && ctx.subChordsCountBeforeOctaveMerge > 1)) {
            AccidentalsLayout.computeCompactOrdering(accidentals, ctx)
        } else {
            AccidentalsLayout.computeOrderingWithLeastColumns(accidentals, ctx)
        }
    }

    private static computeOrderingWithLeastColumns(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        const standardOrdered = [...accidentals]
        AccidentalsLayout.computeStandardOrdering(standardOrdered, ctx)

        const compactOrdered = [...accidentals]
        AccidentalsLayout.computeCompactOrdering(compactOrdered, ctx)

        const totalColumns = (accGroup: readonly Accidental[]): number => {
            const accidentalColumn = new Map<Accidental, number>()
            accidentalColumn.set(accGroup[0], 0)
            let maxColumn = 0
            for (let i = 1; i < accGroup.length; ++i) {
                const acc1 = accGroup[i]
                accidentalColumn.set(acc1, maxColumn)
                for (let j = i - 1; j >= 0; --j) {
                    const acc2 = accGroup[j]
                    if ((accidentalColumn.get(acc2) ?? 0) < maxColumn) {
                        continue
                    }
                    if (!AccidentalsLayout.canFitInSameColumn(acc1, acc2, ctx)) {
                        maxColumn += 1
                        accidentalColumn.set(acc1, maxColumn)
                    }
                }
            }
            return maxColumn
        }

        const result = totalColumns(compactOrdered) < totalColumns(standardOrdered) ? compactOrdered : standardOrdered
        accidentals.splice(0, accidentals.length, ...result)
    }

    private static computeStandardOrdering(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        const accidentalsPlaced: Accidental[] = []
        const accidentalsToPlace = new AccidentalsVectorView(accidentals)

        let pickFromTop = true
        while (!accidentalsToPlace.empty()) {
            const acc = pickFromTop ? accidentalsToPlace.pop_front() : accidentalsToPlace.pop_back()
            accidentalsPlaced.push(acc)

            if (ctx.keepSecondsTogether()) {
                AccidentalsLayout.findAndInsertSecond(acc, accidentalsPlaced, accidentalsToPlace, ctx)
            }

            const foundOctave = AccidentalsLayout.findAndInsertOctave(acc, accidentalsPlaced, accidentalsToPlace, ctx)
            if (foundOctave) {
                pickFromTop = true
            } else {
                pickFromTop = !pickFromTop
            }
        }

        accidentals.splice(0, accidentals.length, ...accidentalsPlaced)
    }

    private static computeCompactOrdering(accidentals: Accidental[], ctx: AccidentalsLayoutContext): void {
        const totAccidNumber = accidentals.length
        const bottomAcc = accidentals[accidentals.length - 1]

        const accidentalsPlaced: Accidental[] = []
        const accidentalsToPlace = new AccidentalsVectorView(accidentals)

        let pickFromTop = true
        while (!accidentalsToPlace.empty()) {
            let acc = pickFromTop ? accidentalsToPlace.pop_front() : accidentalsToPlace.pop_back()
            accidentalsPlaced.push(acc)

            let foundOneThatFits = false
            let hitBottom = false

            if (AccidentalsLayout.findAndInsertOctave(acc, accidentalsPlaced, accidentalsToPlace, ctx, !pickFromTop, pickFromTop)) {
                foundOneThatFits = true
                acc = accidentalsPlaced[accidentalsPlaced.length - 1]
                if (acc === bottomAcc) {
                    hitBottom = true
                }
            }

            const pred = (acc2: Accidental): boolean => {
                if ((pickFromTop && acc2.line() < acc.line()) || (!pickFromTop && acc2.line() > acc.line())) {
                    return false
                }
                if (AccidentalsLayout.canFitInSameColumn(acc, acc2, ctx)) {
                    if (acc2.ldata().octaves.length > 0) {
                        return false
                    }
                    foundOneThatFits = true
                    accidentalsPlaced.push(acc2)
                    acc = acc2
                    if (acc2 === bottomAcc) {
                        hitBottom = true
                    }
                    return true
                }
                return false
            }

            if (pickFromTop) {
                accidentalsToPlace.remove_if(pred)
            } else {
                accidentalsToPlace.reverse_remove_if(pred)
            }

            if (ctx.keepSecondsTogether()) {
                for (const alreadyPlacedAcc of [...accidentalsPlaced]) {
                    AccidentalsLayout.findAndInsertSecond(alreadyPlacedAcc, accidentalsPlaced, accidentalsToPlace, ctx)
                }
            }

            if (hitBottom || (foundOneThatFits && totAccidNumber <= ctx.largeGroupLimit())) {
                pickFromTop = true
            } else {
                pickFromTop = !pickFromTop
            }
        }

        accidentals.splice(0, accidentals.length, ...accidentalsPlaced)
    }

    private static findAndInsertSecond(acc: Accidental, accidentalsPlaced: Accidental[], accidentalsToPlace: AccidentalsVectorView,
                                       ctx: AccidentalsLayoutContext): void {
        for (const secondAcc of acc.ldata().seconds) {
            const removed = accidentalsToPlace.remove(secondAcc)
            if (removed) {
                if (ctx.orderFollowNoteDisplacement() && secondAcc.note()!.x() > acc.note()!.x()) {
                    const position = accidentalsPlaced.indexOf(acc)
                    accidentalsPlaced.splice(position < 0 ? accidentalsPlaced.length : position, 0, secondAcc)
                } else {
                    accidentalsPlaced.push(secondAcc)
                }
            }
        }
    }

    private static findAndInsertOctave(acc: Accidental, accidentalsPlaced: Accidental[], accidentalsToPlace: AccidentalsVectorView,
                                       ctx: AccidentalsLayoutContext, acceptAbove = true, acceptBelow = true): boolean {
        let foundOctave = false
        const thisLine = acc.line()
        for (const octaveAcc of acc.ldata().octaves) {
            const removed = accidentalsToPlace.remove_if((a) => {
                if (a === octaveAcc) {
                    const octaveLine = octaveAcc.line()
                    const acceptOctave = (octaveLine < thisLine && acceptAbove) || (octaveLine > thisLine && acceptBelow)
                    if (acceptOctave) {
                        foundOctave = true
                        return true
                    }
                }
                return false
            })
            if (removed) {
                accidentalsPlaced.push(octaveAcc)
                if (ctx.keepSecondsTogether()) {
                    AccidentalsLayout.findAndInsertSecond(octaveAcc, accidentalsPlaced, accidentalsToPlace, ctx)
                }
            }
        }
        return foundOctave
    }

    private static applyOrderingOffsets(accidentals: Accidental[]): void {
        let stackingNumber = 0
        for (const acc of accidentals) {
            acc.mutldata().stackingNumber = stackingNumber
            ++stackingNumber
        }

        for (const acc of accidentals) {
            const actualStackingOrder = acc.stackingOrder()
            if (actualStackingOrder < 0) {
                acc.setStackingOrderOffset(acc.stackingOrderOffset() - actualStackingOrder)
            } else if (actualStackingOrder >= stackingNumber) {
                const diff = actualStackingOrder - stackingNumber
                acc.setStackingOrderOffset(acc.stackingOrderOffset() - diff - 1)
            }
        }

        accidentals.sort((acc1, acc2) => {
            const stackingOrder1 = acc1.stackingOrder()
            const stackingOrder2 = acc2.stackingOrder()
            return stackingOrder1 === stackingOrder2 ? acc1.stackingOrderOffset() - acc2.stackingOrderOffset() : stackingOrder1 - stackingOrder2
        })
    }

    private static minAccidentalToChordDistance(acc: Accidental, accShape: Shape, ctx: AccidentalsLayoutContext): number {
        let dist = -Number.MAX_VALUE
        for (const accidentalElement of accShape.elements()) {
            const accTop = accidentalElement.top()
            const accBottom = accidentalElement.bottom()
            for (const chordElement of ctx.chordsShape.elements()) {
                const chordElementTop = chordElement.top()
                const chordElementBottom = chordElement.bottom()
                if (intersects(accTop, accBottom, chordElementTop, chordElementBottom, ctx.verticalAccidentalToChordClearance())) {
                    let padding = AccidentalsLayout.computePadding(acc, chordElement.item()!, ctx)
                    padding += AccidentalsLayout.additionalPaddingForVerticals(acc, chordElement.item()!, ctx)
                    dist = Math.max(dist, accidentalElement.right() - chordElement.left() + padding)
                }
                dist = Math.max(dist, AccidentalsLayout.kerningLimitationsIntoChord(acc, accShape, chordElement, ctx))
            }
        }
        return dist
    }

    private static kerningLimitationsIntoChord(acc: Accidental, accShape: Shape, chordElement: ShapeElement,
                                               ctx: AccidentalsLayoutContext): number {
        const chordItem = chordElement.item()
        if (!chordItem) {
            return 0.0
        }
        const accType = acc.accidentalType()
        if (chordItem.isLedgerLine() && (accType === AccidentalType.NATURAL || accType === AccidentalType.SHARP)) {
            if (chordItem.y() > accShape.top() && chordItem.y() < accShape.bottom()) {
                return accShape.right() - chordElement.left() + ctx.sharpAndNaturalLedgerLinePadding()
            }
        }
        return 0.0
    }

    private static computePadding(acc: Accidental, chordElement: EngravingItem, ctx: AccidentalsLayoutContext): number {
        const accType = acc.accidentalType()
        const isFlat = accType === AccidentalType.FLAT || accType === AccidentalType.FLAT2

        const kernFlatIntoLedger = isFlat && chordElement.isLedgerLine() && chordElement.y() > acc.note()!.y()
        if (kernFlatIntoLedger) {
            return 0.0
        }

        const yApproxThresholdForSharpLedgerKerning = 1.1 * ctx.spatium()
        const kernSharpIntoLedger = accType === AccidentalType.SHARP && chordElement.isLedgerLine()
                                    && chordElement.y() > acc.note()!.y() + yApproxThresholdForSharpLedgerKerning
        if (kernSharpIntoLedger) {
            return 0.0
        }

        const kernFlatIntoNote = isFlat && chordElement.isNote() && chordElement.y() > acc.note()!.y()
        if (kernFlatIntoNote) {
            return ctx.reducedFlatToNotePadding()
        }

        const table = paddingTable(acc.score())
        return table.at(ElementType.ACCIDENTAL, chordElement.type()) * 0.5 * (acc.mag() + chordElement.mag())
    }

    private static minAccidentalToAccidentalGroupDistance(acc: Accidental, accShape0: Shape, accidentalsShape: Shape,
                                                          ctx: AccidentalsLayoutContext): number {
        const accShape = accShape0.clone()
        let dist = 0.0
        let column = acc.ldata().column

        let collisionFound: boolean
        let iter = 0
        const safetyNet = 50
        do {
            ++iter
            let curDist = 0.0
            collisionFound = false
            for (const groupElement of accidentalsShape.elements()) {
                const acc2 = groupElement.item() as Accidental
                if (AccidentalsLayout.isExceptionOfFourth(acc, acc2)) {
                    const distFourth = AccidentalsLayout.kerningOfFourth(accShape, groupElement, ctx)
                    if (!RealIsNull(distFourth) && distFourth > curDist) {
                        collisionFound = true
                        curDist = distFourth
                    }
                    column = Math.max(column, acc2.ldata().column + 1)
                    continue
                }

                const vertPadding = AccidentalsLayout.verticalPadding(acc, acc2, ctx)
                const horPadding = AccidentalsLayout.horizontalPadding(acc, acc2, ctx)
                const horPaddingWithTolerance = 0.999 * horPadding
                if (accShape.intersects(groupElement.adjusted(-horPaddingWithTolerance, -vertPadding, horPaddingWithTolerance, vertPadding))) {
                    collisionFound = true
                } else {
                    continue
                }

                if (!AccidentalsLayout.isExceptionOfNaturalsSixth(acc, acc2)) {
                    column = Math.max(column, acc2.ldata().column + 1)
                }

                const groupTop = groupElement.top()
                const groupBottom = groupElement.bottom()
                for (const accElement of accShape.elements()) {
                    if (intersects(accElement.top(), accElement.bottom(), groupTop, groupBottom, vertPadding)) {
                        let minDist = accElement.right() - groupElement.left() + horPadding
                        minDist += AccidentalsLayout.additionalPaddingForVerticals(acc, acc2, ctx)
                        curDist = Math.max(curDist, minDist)
                    }
                }
            }
            accShape.translateX(-curDist)
            dist += curDist
        } while (collisionFound && iter < safetyNet)

        acc.mutldata().column = column

        return dist
    }

    private static isExceptionOfFourth(acc1: Accidental | null, acc2: Accidental | null): boolean {
        if (!acc1 || !acc2) {
            return false
        }
        if ((acc1.bracket() === AccidentalBracket.BRACKET || acc2.bracket() === AccidentalBracket.BRACKET)
            && acc1.mag() === 1 && acc2.mag() === 1) {
            return false
        }
        const accType1 = acc1.accidentalType()
        const accType2 = acc2.accidentalType()
        return (accType1 === AccidentalType.FLAT || accType1 === AccidentalType.FLAT2)
               && (accType2 === AccidentalType.FLAT || accType2 === AccidentalType.FLAT2 || accType2 === AccidentalType.NATURAL)
               && acc1.line() - acc2.line() === 3
    }

    private static isExceptionOfNaturalsSixth(acc1: Accidental, acc2: Accidental): boolean {
        return acc1.accidentalType() === AccidentalType.NATURAL
               && acc2.accidentalType() === AccidentalType.NATURAL
               && Math.abs(acc2.line() - acc1.line()) === 5
    }

    private static canFitInSameColumn(acc1: Accidental, acc2: Accidental, ctx: AccidentalsLayoutContext): boolean {
        if (AccidentalsLayout.isExceptionOfNaturalsSixth(acc1, acc2)) {
            return true
        }
        const acc1Box = acc1.ldata().bbox().translated(new PointF(0.0, acc1.note()!.y()))
        const acc2Box = acc2.ldata().bbox().translated(new PointF(0.0, acc2.note()!.y()))
        return !intersects(acc1Box.top(), acc1Box.bottom(), acc2Box.top(), acc2Box.bottom(),
                           AccidentalsLayout.verticalPadding(acc1, acc2, ctx))
    }

    private static isOctave(acc1: Accidental, acc2: Accidental): boolean {
        return acc1.accidentalType() === acc2.accidentalType() && Math.abs(acc2.line() - acc1.line()) % 7 === 0
    }

    private static kerningOfFourth(accShape: Shape, accGroupShapeElement: ShapeElement, ctx: AccidentalsLayoutContext): number {
        const accType2 = (accGroupShapeElement.item() as Accidental).accidentalType()
        return accShape.right() - accGroupShapeElement.left()
               + (accType2 === AccidentalType.NATURAL ? ctx.naturalKerningOfFourth() : ctx.flatKerningOfFourth())
    }

    private static additionalPaddingForVerticals(acc: Accidental, item: EngravingItem, ctx: AccidentalsLayoutContext): number {
        if (acc.accidentalType() !== AccidentalType.NATURAL || acc.bracket() !== AccidentalBracket.NONE
            || (!item.isAccidental() && !item.isStem())) {
            return 0.0
        }

        if (item.isAccidental()) {
            const acc2 = item as Accidental
            const accType2 = acc2.accidentalType()
            if (accType2 !== AccidentalType.NATURAL && accType2 !== AccidentalType.FLAT && accType2 !== AccidentalType.FLAT2) {
                return 0.0
            }
            const lineDiff = acc2.line() - acc.line()
            if (lineDiff < -2 || lineDiff > 5) {
                return 0.0
            }
        }

        return ctx.additionalPaddingForVerticals()
    }

    private static verticallyAlignAccidentals(ctx: AccidentalsLayoutContext): void {
        const accidentalsAlreadyGrouped = new Set<Accidental>()
        // std::map<Accidental*, ...> iterates in pointer order; we keep insertion order
        const verticalSets = new Map<Accidental, Accidental[]>()

        if (ctx.alignOffsetOctaves()) {
            AccidentalsLayout.collectVerticalSetsOfOffsetOctaves(accidentalsAlreadyGrouped, verticalSets, ctx)
        }

        AccidentalsLayout.collectVerticalSets(accidentalsAlreadyGrouped, verticalSets, ctx)

        if (verticalSets.size === 0) {
            return
        }

        const vertSets: AccidentalGroups = [...verticalSets.values()]

        vertSets.sort((set1, set2) => set1[0].ldata().column - set2[0].ldata().column)

        AccidentalsLayout.alignVerticalSets(vertSets, ctx)
    }

    private static getSet(m: Map<Accidental, Accidental[]>, k: Accidental): Accidental[] {
        let v = m.get(k)
        if (!v) {
            v = []
            m.set(k, v)
        }
        return v
    }

    private static collectVerticalSetsOfOffsetOctaves(accidentalsAlreadyGrouped: Set<Accidental>,
                                                      verticalSets: Map<Accidental, Accidental[]>, ctx: AccidentalsLayoutContext): void {
        for (const accidentalGroup of ctx.accidentalSubChords) {
            for (let i = 0; i < accidentalGroup.length; ++i) {
                const acc1 = accidentalGroup[i]
                if (accidentalsAlreadyGrouped.has(acc1)) {
                    continue
                }
                const x1 = AccidentalsLayout.xPosRelativeToSegment(acc1)
                for (let j = i + 1; j < accidentalGroup.length; ++j) {
                    const acc2 = accidentalGroup[j]
                    if (!AccidentalsLayout.isOctave(acc1, acc2) || accidentalsAlreadyGrouped.has(acc2)) {
                        continue
                    }
                    const x2 = AccidentalsLayout.xPosRelativeToSegment(acc2)
                    const alignOctave = Math.abs(x1 - x2) < 2.0 * ctx.spatium()
                    if (alignOctave) {
                        const verticalSet = AccidentalsLayout.getSet(verticalSets, acc1)
                        if (verticalSet.length === 0) {
                            verticalSet.push(acc1)
                        }
                        verticalSet.push(acc2)
                        accidentalsAlreadyGrouped.add(acc1)
                        accidentalsAlreadyGrouped.add(acc2)
                        let maxColumn = 0
                        for (const acc of verticalSet) {
                            maxColumn = Math.max(maxColumn, acc.ldata().column)
                        }
                        for (const acc of verticalSet) {
                            acc.mutldata().column = maxColumn
                        }
                    }
                }
            }
        }
    }

    private static collectVerticalSets(accidentalsAlreadyGrouped: Set<Accidental>, verticalSets: Map<Accidental, Accidental[]>,
                                       ctx: AccidentalsLayoutContext): void {
        for (let i = 0; i < ctx.allAccidentals.length; ++i) {
            const acc1 = ctx.allAccidentals[i]
            if (accidentalsAlreadyGrouped.has(acc1)) {
                continue
            }
            const column1 = acc1.ldata().column
            const verticalSub1 = acc1.ldata().verticalSubgroup
            const x1 = AccidentalsLayout.xPosRelativeToSegment(acc1)
            for (let j = i + 1; j < ctx.allAccidentals.length; ++j) {
                const acc2 = ctx.allAccidentals[j]
                if (acc2.accidentalType() !== acc1.accidentalType() || accidentalsAlreadyGrouped.has(acc2)
                    || !RealIsEqual(acc1.mag(), acc2.mag())) {
                    continue
                }
                const column2 = acc2.ldata().column
                const verticalSub2 = acc2.ldata().verticalSubgroup
                const x2 = AccidentalsLayout.xPosRelativeToSegment(acc2)
                const alignAccidentals = column1 === column2 && verticalSub1 === verticalSub2
                                         && Math.abs(x1 - x2) < ctx.xVerticalAlignmentThreshold()
                if (alignAccidentals) {
                    const verticalSet = AccidentalsLayout.getSet(verticalSets, acc1)
                    if (verticalSet.length === 0) {
                        verticalSet.push(acc1)
                    }
                    verticalSet.push(acc2)
                    accidentalsAlreadyGrouped.add(acc1)
                    accidentalsAlreadyGrouped.add(acc2)
                }
            }
        }
    }

    private static alignVerticalSets(vertSets: AccidentalGroups, ctx: AccidentalsLayoutContext): void {
        const accidentalColumns: AccidentalGroups = []
        for (const group of ctx.accidentalSubChords) {
            for (const acc of group) {
                const column = acc.ldata().column
                while (accidentalColumns.length <= column) {
                    accidentalColumns.push([])
                }
                accidentalColumns[column].push(acc)
            }
        }

        for (const vertSet of vertSets) {
            let x = Number.MAX_VALUE
            for (const acc of vertSet) {
                const rightEdge = acc.ldata().bbox().right() + AccidentalsLayout.xPosRelativeToSegment(acc)
                x = Math.min(x, rightEdge)
            }
            for (const acc of vertSet) {
                const bboxRight = acc.ldata().bbox().right()
                AccidentalsLayout.setXposRelativeToSegment(acc, x - bboxRight)
            }
            const curColumn = vertSet[0].ldata().column
            const accidentalGroupShape = new Shape()
            for (let column = 0; column < accidentalColumns.length; ++column) {
                if (column < curColumn) {
                    continue
                }
                for (const acc of accidentalColumns[column]) {
                    const curXPos = AccidentalsLayout.xPosRelativeToSegment(acc)
                    const accShape = acc.shape().translate(new PointF(curXPos, acc.note()!.y()))
                    if (!vertSet.includes(acc)) {
                        const minDistToAccidGroup = AccidentalsLayout.minAccidentalToAccidentalGroupDistance(acc, accShape,
                                                                                                           accidentalGroupShape, ctx)
                        accShape.translateX(-minDistToAccidGroup)
                        AccidentalsLayout.setXposRelativeToSegment(acc, curXPos - minDistToAccidGroup)
                    }
                    accidentalGroupShape.add(accShape)
                }
            }
        }
    }

    private static setXposRelativeToSegment(accidental: Accidental, x: number): void {
        const note = accidental.note()
        const chord = note ? note.chord() : null
        if (note) {
            x -= note.pos().x()
        }
        if (chord && !AccidentalsLayout.keepAccidentalsCloseToChord(chord)) {
            x -= chord.pos().x()
        }
        accidental.mutldata().setPosX(x)
    }

    private static xPosRelativeToSegment(accidental: Accidental): number {
        const note = accidental.note()
        const chord = note ? note.chord() : null
        let x = accidental.ldata().pos().x()
        if (note) {
            x += note.pos().x()
        }
        if (chord && !AccidentalsLayout.keepAccidentalsCloseToChord(chord)) {
            x += chord.pos().x()
        }
        return x
    }

    static sortTopDown(accidentals: Accidental[]): void {
        accidentals.sort((acc1, acc2) => {
            const line1 = acc1.line()
            const line2 = acc2.line()
            if (line1 === line2) {
                const note1 = acc1.note()!
                const note2 = acc2.note()!
                return (note2.x() + note2.chord().x()) - (note1.x() + note1.chord().x())
            }
            return line1 - line2
        })
    }

    private static keepAccidentalsCloseToChord(chord: Chord): boolean {
        return chord.isTrillCueNote() || chord.isGraceAfter()
    }

    private static verticalPadding(acc1: Accidental, acc2: Accidental, ctx: AccidentalsLayoutContext): number {
        const verticalClearance = acc1.accidentalType() === AccidentalType.SHARP && acc2.accidentalType() === AccidentalType.SHARP
            ? ctx.verticalSharpToSharpClearance() : ctx.verticalAccidentalToAccidentalClearance()
        return verticalClearance * 0.5 * (acc1.mag() + acc2.mag())
    }

    private static horizontalPadding(acc1: Accidental, acc2: Accidental, ctx: AccidentalsLayoutContext): number {
        return ctx.accidentalAccidentalDistance() * (0.5 * (acc1.mag() + acc2.mag()))
    }
}
