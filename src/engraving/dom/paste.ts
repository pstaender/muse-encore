/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/paste.cpp: Score::pasteStaff, pasteChordRest, pasteSymbols, cmdRepeatListSelection,
 * cmdPaste (cmdPasteSymbol, cmdPasteStaffList, cmdPasteSymbolList) and of EngravingItem::readType / readMimeData
 * (engravingitem.cpp; here functions, the DOM classes cannot import the Factory: import cycles). The functions are
 * added to Score by this module (module augmentation).
 *
 * The clipboard data are the xml text of MuseScore's mime formats (C++ muse::ByteArray).
 *
 * TODO(port): system objects on other staves than the top one (AddSystemObjectStaff),
 * measure repeats spanning several measures (ChangeMeasureRepeatCount, undoSetNoBreak).
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { DirectionV, DurationType, ElementType, StaffGroup } from '../types/types'
import { NoteType } from './chordrest'
import { TConv } from '../types/typesconv'
import { XmlReader } from '../rw/xmlreader'
import { RWRegister } from '../rw/rwregister'
import { scoreDummy } from '../compat/dummyelement'
import { Transpose } from '../editing/transpose'
import { EditData } from '../editing/editdata'
import { Factory } from './factory'
import { Score } from './score'
import { SegmentType, type Segment } from './segment'
import { SelectType } from './select'
import { MScore, MsError, mimeStaffListFormat, mimeSymbolFormat, mimeSymbolListFormat } from './mscore'
import { MAX_DOTS, TDuration, toDurationList, toRhythmicDurationList } from './durationtype'
import { filterTargetElements } from './utils'
import { Pid } from './property'
import { Tie } from './tie'
import { Image, ImageType } from './image'
import type { EngravingItem } from './engravingitem'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Rest } from './rest'
import type { MeasureRepeat } from './measurerepeat'
import type { Parenthesis } from './parenthesis'
import type { SymId } from '../types/symid'
import type { staff_idx_t } from '../types/types'
import '../editing/edit'
import '../editing/cmd'
import './noteentry'

/** C++ IMimeData (the clipboard contents) */
export interface IMimeData {
    hasFormat(format: string): boolean
    data(format: string): string
    hasImage?(): boolean
    /** the encoded image (QMimeData::imageData) */
    imageData?(): Uint8Array | null
}

declare module './score' {
    interface Score {
        /** return false if paste fails */
        pasteStaff(e: XmlReader, dst: Segment, dstStaff: staff_idx_t, scale?: Fraction): boolean
        pasteChordRest(cr: ChordRest, t: Fraction): void
        /** pastes a list of symbols into cr and following ChordRest's */
        pasteSymbols(e: XmlReader, dst: ChordRest): void
        cmdRepeatListSelection(): boolean
        /** C++ cmdPaste(const IMimeData*, MuseScoreView*, Fraction scale) (no view) */
        cmdPaste(ms: IMimeData | null, scale?: Fraction): boolean
        cmdPasteSymbol(data: string, scale?: Fraction): boolean
        cmdPasteStaffList(data: string, scale?: Fraction): boolean
        cmdPasteSymbolList(data: string): boolean
    }
}

Score.prototype.pasteStaff = function (this: Score, e: XmlReader, dst: Segment, dstStaff: staff_idx_t,
    scale: Fraction = new Fraction(1, 1)): boolean {
    //! NOTE Needs refactoring - reading should be separated from insertion
    //! (we read the elements into some structure, then inserted them)
    return RWRegister.reader().pasteStaff(e, dst, dstStaff, scale)
}

Score.prototype.pasteChordRest = function (this: Score, cr: ChordRest, t: Fraction): void {
    let tick = t

    let measure = this.tick2measure(tick)
    if (!measure) {
        return
    }

    let twoNoteTremoloFactor = 1
    if (cr.isChord()) {
        const chord = cr as unknown as Chord
        if (chord.vStaffIdx() >= chord.score().nstaves()) {
            // check if staffMove moves a note to a
            // nonexistent staff
            chord.setStaffMove(0)
        }
        Transpose.transposeChord(chord, tick)
        if (chord.tremoloTwoChord()) {
            twoNoteTremoloFactor = 2
        } else if (cr.durationTypeTicks().eq(cr.ticks().times(2))) {
            // this could be the 2nd note of a two-note tremolo
            // check previous CR on same track, if it has a two-note tremolo, then set twoNoteTremoloFactor to 2
            const seg = measure.undoGetSegment(SegmentType.ChordRest, tick)
            const crt = seg.nextChordRest(cr.track(), true)
            if (crt && crt.isChord()) {
                const chrt = crt as unknown as Chord
                const tr = chrt.tremoloTwoChord()
                if (tr) {
                    twoNoteTremoloFactor = 2
                }
            }
        }
    }

    // we can paste a measure rest as such only at start of measure
    // and only if the lengths of the rest and measure match
    // otherwise, we need to convert to duration rest(s)
    // and potentially split the rest up (eg, 5/4 => whole + quarter)
    const convertMeasureRest = cr.isRest() && cr.durationType().type() === DurationType.V_MEASURE
        && (!tick.eq(measure.tick()) || !cr.actualTicksAt(tick).eq(measure.ticks()))

    const measureEnd = measure.endTick()
    const isGrace = cr.isChord() && (cr as unknown as Chord).noteType() !== NoteType.NORMAL

    // adjust measures for measure repeat
    if (cr.isMeasureRepeat()) {
        // TODO(port): ChangeMeasureRepeatCount and undoSetNoBreak for the measures of the group
    }

    // find out if the chordrest was only partially contained in the copied range
    let partialCopy = false
    if (cr.isMeasureRepeat()) {
        partialCopy = !(cr as unknown as MeasureRepeat).actualTicks().eq(measure.ticks())
    } else if (!isGrace && !cr.tuplet()) {
        partialCopy = !cr.durationTypeTicks().eq(cr.ticks().times(twoNoteTremoloFactor))
    }

    // if note is too long to fit in measure, split it up with a tie across the barline
    // exclude tuplets from consideration
    // we have already disallowed a tuplet from crossing the barline, so there is no problem here
    // but due to rounding, it might appear from actualTicks() that the last note is too long by a couple of ticks

    const stf = cr.staff()!
    if (!isGrace && !cr.tuplet() && (tick.plus(cr.actualTicksAt(tick)).gt(measureEnd) || partialCopy || convertMeasureRest)) {
        if (cr.isChord()) {
            // split Chord
            let c = cr as unknown as Chord
            let rest = c.ticks()
            let firstpart = true
            while (rest.isNotZero()) {
                measure = this.tick2measure(tick)!
                const c2 = firstpart ? c : c.clone() as Chord
                if (!firstpart) {
                    c2.removeMarkings(true)
                }
                const timeStretch = stf.timeStretch(tick)
                const mlen = measure.endTick().minus(tick).times(timeStretch)
                const len = mlen.gt(rest) ? rest : mlen
                const dl = toRhythmicDurationList(len, false, tick.minus(measure.tick()).times(timeStretch),
                    this.sigmap().timesig(tick).nominal(), measure, MAX_DOTS, timeStretch)
                if (dl.length === 0) {
                    // C++: LOGD("Could not make durations for: %d/%d", ...)
                    return
                }
                const d = dl[0]
                c2.setDurationType(d)
                c2.setTicks(d.fraction())
                this.undoAddCR(c2, measure, tick)

                const nl1 = c.notes()
                const nl2 = c2.notes()

                if (!firstpart) {
                    for (let i = 0; i < nl1.length; ++i) {
                        const tie = new Tie(nl1[i])
                        tie.setStartNote(nl1[i])
                        tie.setEndNote(nl2[i])
                        tie.setTick(tie.startNote()!.tick())
                        tie.setTick2(tie.endNote()!.tick())
                        tie.setTrack(c.track())
                        const tie2 = nl1[i].tieFor()
                        if (tie2) {
                            nl2[i].setTieFor(nl1[i].tieFor())
                            tie2.setStartNote(nl2[i])
                        }
                        nl1[i].setTieFor(tie)
                        nl2[i].setTieBack(tie)
                    }
                }
                rest = rest.minus(c2.ticks())
                tick = tick.plus(c2.actualTicksAt(tick))
                firstpart = false
                c = c2
            }
        } else if (cr.isRest()) {
            // split Rest
            const r = cr as unknown as Rest
            let rest = r.ticks()

            let firstpart = true
            while (!rest.isZero()) {
                const r2 = firstpart ? r : r.clone() as Rest
                measure = this.tick2measure(tick)!
                const timeStretch = stf.timeStretch(tick)
                const mlen = measure.endTick().minus(tick).times(timeStretch)
                const len = rest.gt(mlen) ? mlen : rest
                const dl = toRhythmicDurationList(len, true, tick.minus(measure.tick()).times(timeStretch),
                    this.sigmap().timesig(tick).nominal(), measure, MAX_DOTS, timeStretch)
                if (dl.length === 0) {
                    return
                }
                const d = dl[0]
                r2.setDurationType(d)
                r2.setTicks(d.isMeasure() ? measure.stretchedLen(stf) : d.fraction())
                this.undoAddCR(r2, measure, tick)
                rest = rest.minus(r2.ticks())
                tick = tick.plus(r2.actualTicksAt(tick))
                firstpart = false
            }
        } else if (cr.isMeasureRepeat()) {
            const mr = cr as unknown as MeasureRepeat
            const list = toDurationList(mr.ticks(), true)
            for (const dur of list) {
                const r = Factory.createItem(ElementType.REST, scoreDummy(this).segment()) as Rest
                r.setDurationType(dur)
                r.setTicks(dur.fraction())
                r.setTrack(cr.track())
                let rest = r.ticks()
                while (!rest.isZero()) {
                    const r2 = r.clone() as Rest
                    measure = this.tick2measure(tick)!
                    const timeStretch = stf.timeStretch(tick)
                    const mlen = measure.endTick().minus(tick).times(timeStretch)
                    const len = rest.gt(mlen) ? mlen : rest
                    const dl = toDurationList(len, false)
                    if (dl.length === 0) {
                        return
                    }
                    const d = dl[0]
                    r2.setTicks(d.fraction())
                    r2.setDurationType(d)
                    this.undoAddCR(r2, measure, tick)
                    rest = rest.minus(r2.ticks())
                    tick = tick.plus(r2.actualTicksAt(tick))
                }
            }
        }
    } else {
        this.undoAddCR(cr, measure, tick)
    }
}

Score.prototype.pasteSymbols = function (this: Score, e: XmlReader, dst: ChordRest): void {
    //! NOTE Needs refactoring - reading should be separated from insertion
    //! (we read the elements into some structure, then inserted them)
    RWRegister.reader().pasteSymbols(e, dst)
}

Score.prototype.cmdRepeatListSelection = function (this: Score): boolean {
    const is = this.inputState()

    const notes = [...this.selection().noteList()]
    notes.sort((a, b) => a.track() - b.track()) // C++ std::sort (not stable)

    const toSelect: EngravingItem[] = []
    const foundChords = new Set<Chord>()

    // Parenthesis logic: group new notes by the left parenthesis (if any) of their old equivalent. Once all
    // new notes have been created we can call cmdAddParentheses on each group then set their offset & visibility
    interface ParenGroup {
        notes: Note[]
        leftVisible: boolean
        rightVisible: boolean
        leftOffset: PointF
        rightOffset: PointF
    }
    const parenMap = new Map<Parenthesis, ParenGroup>()

    for (const n of notes) {
        if (n.isGrace() || n.incomingPartialTie() || n.outgoingPartialTie()) {
            continue
        }

        const sourceChord = n.chord()
        is.setTrack(sourceChord.track())

        const addFlag = foundChords.has(sourceChord)
        if (!addFlag) {
            // If the note doesn't belong to a chord we've seen before...
            foundChords.add(sourceChord)
            is.setSegment(sourceChord.segment())
            if (this.inputState().endOfScore()) {
                continue
            }
            is.moveToNextInputPos()

            if (is.noteEntryMode()) {
                // In note input mode - use the duration of from the note input panel (InputState)...
                if (!is.duration().isValid()) {
                    is.setDuration(sourceChord.durationType())
                }
            } else {
                // Otherwise set it based on the duration of the previous chord...
                is.setDuration(sourceChord.durationType())
            }
        }

        const nval = n.noteVal()
        const newNote = this.addPitch(nval, addFlag)
        if (!newNote) {
            continue
        }

        newNote.undoChangeProperty(Pid.VISIBLE, n.visible())

        const newChord = newNote.chord()

        newChord.updateArticulations(articulationSymbolIds(sourceChord))

        const oldTsc = sourceChord.tremoloSingleChord()
        if (!newChord.tremoloSingleChord() && oldTsc) {
            const newTsc = oldTsc.clone()
            newTsc.setParent(newChord)
            newTsc.setTrack(newChord.track())
            this.doUndoAddElement(newTsc)
        }

        toSelect.push(newNote)

        const parenInfo = n.parenthesisInfo()
        const leftParen = parenInfo ? parenInfo.leftParen() : null
        if (!leftParen) {
            continue
        }
        const rightParen = parenInfo!.rightParen()
        if (!rightParen) {
            continue
        }

        const notesForParen: Note[] = [newNote]

        // All tied notes should be parenthesized...
        let tie = newNote.tieBack()
        while (tie) {
            const tiedNote = tie.startNote()
            if (!tiedNote) {
                break
            }
            notesForParen.push(tiedNote)
            tie = tiedNote.tieBack()
        }

        const search = parenMap.get(leftParen)
        if (search) {
            search.notes.push(...notesForParen)
            continue
        }

        parenMap.set(leftParen, {
            notes: notesForParen,
            leftVisible: leftParen.visible(),
            rightVisible: rightParen.visible(),
            leftOffset: leftParen.offset().clone(),
            rightOffset: rightParen.offset().clone(),
        })
    }

    for (const group of parenMap.values()) {
        this.cmdAddParenthesesToNotes(group.notes)

        // Restore the original parentheses' visibility and offset on each newly-created pair...
        const processedParens = new Set<Parenthesis>()
        for (const note of group.notes) {
            const newParenInfo = note.parenthesisInfo()
            const newLeftParen = newParenInfo ? newParenInfo.leftParen() : null
            if (!newLeftParen || processedParens.has(newLeftParen)) {
                continue
            }
            processedParens.add(newLeftParen)

            newLeftParen.undoChangeProperty(Pid.VISIBLE, group.leftVisible)
            newLeftParen.undoChangeProperty(Pid.OFFSET, group.leftOffset)

            const newRightParen = newParenInfo!.rightParen()
            if (!newRightParen) {
                continue
            }

            newRightParen.undoChangeProperty(Pid.VISIBLE, group.rightVisible)
            newRightParen.undoChangeProperty(Pid.OFFSET, group.rightOffset)
        }
    }

    this.select(toSelect, SelectType.ADD)
    return toSelect.length > 0
}

/** C++ Chord::articulationSymbolIds() */
function articulationSymbolIds(chord: Chord): Set<SymId> {
    return new Set(chord.articulations().map(a => a.symId()))
}

function replaceWithRest(target: ChordRest): ChordRest {
    target.score().undoRemoveElement(target)
    return target.score().addRest(target.segment(), target.track(), new TDuration(target.ticks()), target.tuplet())
}

function prepareTargetChordRest(target: ChordRest, withNote: Note, duration: Fraction): Note | null {
    if (!target.segment().element(target.track())) {
        return null // target was removed by previous operation, ignore this
    }
    if (target.isChord() && target.ticks().gt(duration)) {
        target = replaceWithRest(target) // prevent unexpected note splitting
    }
    let segment: Segment = target.segment()
    if (segment.measure().isMMRest()) {
        const m = segment.measure().mmRestFirst()!
        segment = m.findSegment(SegmentType.ChordRest, m.tick())!
    }

    const staff = target.staff()!
    const staffGroup = staff.staffType(segment.tick()).group()
    let stemDirection = DirectionV.AUTO
    if (staffGroup === StaffGroup.PERCUSSION) {
        const ds = staff.part()!.instrument(segment.tick())!.drumset()
        if (ds) {
            stemDirection = ds.stemDirection(withNote.noteVal().pitch)
        }
    }

    const newSegment = target.score().setNoteRest(segment, target.track(),
        withNote.noteVal(), duration, stemDirection, false, new Set(), false, target.score().inputState())
    return (newSegment!.nextChordRest(target.track()) as unknown as Chord).upNote()
}

function prepareTarget(target: EngravingItem, withNote: Note, duration: Fraction): EngravingItem | null {
    if (target.isNote() && !(target as unknown as Note).chord().ticks().eq(duration)) {
        return prepareTargetChordRest((target as unknown as Note).chord(), withNote, duration)
    }
    if (target.isChordRest()
        && (!(target as unknown as ChordRest).ticks().eq(duration)
            || (target as unknown as ChordRest).durationType().type() === DurationType.V_MEASURE)) {
        return prepareTargetChordRest(target as unknown as ChordRest, withNote, duration)
    }
    return target
}

function pasteSystemObject(srcData: EditData, target: EngravingItem | null): EngravingItem | null {
    if (!target) {
        return null
    }

    if (srcData.element && srcData.element.isTimeSig()) {
        // Don't allow copypasting time signatures
        return null
    }

    const targetScore = target.score()
    let targetStaff = target.staff()
    if (!targetScore || !targetStaff) {
        return null
    }

    // System objects can only be pasted on the *top* staff of an instrument
    const targetPart = targetStaff.part()
    targetStaff = targetPart ? targetPart.staves()[0] : null
    if (!targetStaff) {
        return null
    }

    // TODO(port): pasting onto another staff than the top one adds it as a system object staff (AddSystemObjectStaff)
    // and copies the top system objects to it; the port drops the element onto the target
    return target.drop(srcData)
}

Score.prototype.cmdPaste = function (this: Score, ms: IMimeData | null, scale: Fraction = new Fraction(1, 1)): boolean {
    if (!ms) {
        // C++: LOGE() << "No MIME data given"
        return false
    }

    if (this.selection().isNone()) {
        // C++: LOGE() << "No target selection"
        MScore.setError(MsError.NO_DEST)
        return false
    }

    if (ms.hasFormat(mimeSymbolFormat)) {
        return this.cmdPasteSymbol(ms.data(mimeSymbolFormat), scale)
    }

    if (ms.hasFormat(mimeStaffListFormat)) {
        return this.cmdPasteStaffList(ms.data(mimeStaffListFormat), scale)
    }

    if (ms.hasFormat(mimeSymbolListFormat)) {
        return this.cmdPasteSymbolList(ms.data(mimeSymbolListFormat))
    }

    const ba = ms.hasImage?.() ? ms.imageData?.() : null
    if (ba) {
        // C++ converts the image data to PNG (imageProvider()->saveAsPng); here the clipboard has the encoded file

        const image = new Image(scoreDummy(this))
        image.setImageType(ImageType.RASTER)
        image.loadFromData('paste', ba)

        const droppedElements: EngravingItem[] = []
        const targetElements = [...this.selection().elements()]
        for (const target of targetElements) {
            const nel = image.clone()
            const ddata = new EditData()
            ddata.dropElement = nel

            if (target.acceptDrop(ddata)) {
                const dropped = target.drop(ddata)
                if (dropped) {
                    droppedElements.push(dropped)
                }
            }
        }

        this.select(droppedElements)
        return true
    }

    // C++: LOGE() << "Unsupported MIME data (formats: " << ms->formats() << ")"
    return false
}

Score.prototype.cmdPasteSymbol = function (this: Score, data: string, scale: Fraction = new Fraction(1, 1)): boolean {
    const droppedElements: EngravingItem[] = []

    const dragOffset = { v: new PointF() }
    const durationRef = { v: new Fraction(1, 4) }

    const el = readMimeData(this, data, dragOffset, durationRef)
    if (!el) {
        return false
    }

    const duration = durationRef.v.times(scale)
    if (!new TDuration(duration).isValid()) {
        return false
    }

    if (this.selection().isNone()) {
        return false
    }

    // TODO: make this as smart as `NotationInteraction::applyPaletteElement`,
    // without duplicating logic. (Currently, for range selections, we only
    // paste onto the "top-left corner" for non-measure based elements.)
    let { elements: targetElements, unique } = filterTargetElements(this.selection(), el)
    if (!unique && this.selection().isRange()) {
        // The usage of `firstElementForNavigation` is inspired by `NotationInteraction::applyPaletteElement`.
        const firstSegment = this.selection().startSegment()!
        const first = firstSegment.firstElementForNavigation(this.selection().staffStart())
        targetElements = first ? [first] : []
    }

    if (targetElements.length === 0) {
        // C++: LOGE() << "No valid target elements in selection"
        MScore.setError(MsError.NO_DEST)
        return false
    }

    const systemObj = el.systemFlag()

    for (let target of targetElements) {
        el.setTrack(target.track())

        const ddata = new EditData()
        ddata.pos = target.pagePos()
        ddata.dropElement = el
        ddata.track = target.track()

        if (!target.acceptDrop(ddata)) {
            continue
        }

        let t: EngravingItem | null = target
        if (!el.isNote() || (t = prepareTarget(target, el as unknown as Note, duration))) {
            target = t!
            const dropElement = el.clone()
            dropElement.setScore(this)
            ddata.dropElement = dropElement

            const dropped = systemObj ? pasteSystemObject(ddata, target) : target.drop(ddata)
            if (dropped) {
                droppedElements.push(dropped)
            }
        }
    }

    this.select(droppedElements)
    return true
}

Score.prototype.cmdPasteStaffList = function (this: Score, data: string, scale: Fraction = new Fraction(1, 1)): boolean {
    let cr: ChordRest | null = null
    if (this.selection().isRange()) {
        cr = this.selection().firstChordRest()
    } else if (this.selection().isSingle()) {
        const e = this.selection().element()!
        const measure = e.findMeasure()
        cr = measure ? measure.findChordRest(e.tick(), e.track()) : null
        if (!cr) {
            // C++: LOGE() << "Cannot paste staff list onto " << e->typeName()
            MScore.setError(MsError.DEST_NO_CR)
            return false
        }
    }

    if (!cr) {
        MScore.setError(MsError.NO_DEST)
        return false
    }

    if (cr.tuplet() && !cr.tick().eq(cr.topTuplet()!.tick())) {
        MScore.setError(MsError.DEST_TUPLET)
        return false
    }

    const xmlReader = new XmlReader(data)
    return this.pasteStaff(xmlReader, cr.segment(), cr.staffIdx(), scale)
}

Score.prototype.cmdPasteSymbolList = function (this: Score, data: string): boolean {
    let cr: ChordRest | null = null
    if (this.selection().isRange()) {
        cr = this.selection().firstChordRest()
    } else if (this.selection().isSingle()) {
        const e = this.selection().element()!
        const measure = e.findMeasure()
        cr = measure ? measure.findChordRest(e.tick(), e.track()) : null
        if (!cr) {
            // C++: LOGE() << "Cannot paste element list onto " << e->typeName()
            MScore.setError(MsError.DEST_NO_CR)
            return false
        }
    }

    if (!cr) {
        MScore.setError(MsError.NO_DEST)
        return false
    }

    const xmlReader = new XmlReader(data)
    this.pasteSymbols(xmlReader, cr)
    return true
}

// ---------------------------------------------------------------------------------------------------------------------
//   EngravingItem::readType / readMimeData (engravingitem.cpp)
// ---------------------------------------------------------------------------------------------------------------------

/** C++ EngravingItem::readType: return new position of QDomElement in e */
export function readType(e: XmlReader, dragOffset: { v: PointF }, duration: { v: Fraction }): ElementType {
    while (e.readNextStartElement()) {
        if (e.name() === 'EngravingItem') {
            while (e.readNextStartElement()) {
                const tag = e.name()
                if (tag === 'dragOffset') {
                    dragOffset.v = e.readPoint()
                } else if (tag === 'duration') {
                    duration.v = e.readFraction()
                } else {
                    const type = TConv.fromXmlElementType(tag)
                    if (type === ElementType.INVALID) {
                        break
                    }
                    return type
                }
            }
        } else {
            e.unknown()
        }
    }
    return ElementType.INVALID
}

/** C++ EngravingItem::readMimeData */
export function readMimeData(score: Score, data: string, dragOffset: { v: PointF }, duration: { v: Fraction }): EngravingItem | null {
    const e = new XmlReader(data)

    const type = readType(e, dragOffset, duration)
    if (type === ElementType.INVALID) {
        // C++: LOGD("cannot read type")
        return null
    }

    const el = Factory.createItem(type, scoreDummy(score))
    if (el) {
        RWRegister.reader().readItem(el, e)
    }

    return el
}
