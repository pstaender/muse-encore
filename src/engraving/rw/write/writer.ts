/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/writer.h/.cpp (and compat/writescorehook.cpp)
 *
 * TODO(port): audio, synthesizer state
 */

import { Fraction } from '../../types/fraction'
import { VOICES, nidx } from '../../types/types'
import { LayoutMode } from '../../dom/score'
import { Constants } from '../../types/constants'
import { Sid } from '../../style/styledef'
import type { MasterScore } from '../../dom/masterscore'
import type { MeasureBase } from '../../dom/measurebase'
import type { Part } from '../../dom/part'
import type { Score } from '../../dom/score'
import { ScoreRenderer } from '../../rendering/score/scorerenderer'
import { XmlWriter } from '../xmlwriter'
import { TWrite } from './twrite'
import { StaffWrite } from './staffwrite'
import { WriteContext } from './writecontext'
import { RWRegister } from '../rwregister'
import type { track_idx_t } from '../../types/types'
import type { Segment } from '../../dom/segment'
import type { EngravingItem } from '../../dom/engravingitem'
import type { SelectionFilter } from '../../dom/selectionfilter'
import { MScore } from '../../dom/mscore'

/** the version MuseScore 4.7.5 writes (Constants::MSC_VERSION_STR, application version and revision) */
export const MSC_VERSION_STR = '4.70'
export const MSC_VERSION = 470
export const PROGRAM_VERSION = '4.7.5'
export const PROGRAM_REVISION = '3654226'

/** C++ rw::WriteInOutData (shared between the master score and its excerpts) */
export class WriteInOutData {
    ctx: WriteContext
    constructor(score: Score) {
        this.ctx = new WriteContext(score)
    }
}

/** C++ compat::WriteScoreHook */
class WriteScoreHook {
    onWriteStyle302(score: Score, xml: XmlWriter): void {
        //! NOTE If not the master score, because the Excerpts (parts) have not yet been write to separate files
        if (!score.isMaster()) {
            score.style().save(xml, true) // save only differences to builtin style (logic from 3.)
        }
    }

    onWriteExcerpts302(score: Score, xml: XmlWriter, ctx: WriteContext): void {
        let isWriteExcerpts = false

        //! NOTE If the test mode, because the tests have not yet been adapted to the new format
        if (MScore.testMode) {
            isWriteExcerpts = true
        }

        if (isWriteExcerpts && score.isMaster() && !ctx.shouldWriteRange()) {
            for (const excerpt of score.masterScore().excerpts()) {
                const es = excerpt.excerptScore()
                if (es && es !== score) {
                    Writer.write(es, xml, ctx, this) // recursion write
                }
            }
        }
    }
}

export class Writer {
    /** Writer::writeScore: the complete .mscx document */
    static writeScore(score: Score, inout: WriteInOutData | null = null): string {
        const xml = new XmlWriter()
        const ctx = new WriteContext(score)
        if (inout) {
            ctx.assign(inout.ctx)
        }

        xml.startDocument()

        xml.startElement('museScore', [['version', MSC_VERSION_STR]])

        xml.tag('programVersion', PROGRAM_VERSION)
        xml.tag('programRevision', PROGRAM_REVISION)

        const hook = new WriteScoreHook()
        Writer.write(score, xml, ctx, hook)

        xml.endElement()
        xml.flush()

        if (!inout || !inout.ctx.shouldWriteRange()) {
            //update version values for i.e. plugin access
            if (score.isMaster()) {
                const ms = score as MasterScore
                ms.setMscoreVersion(PROGRAM_VERSION)
                ms.setMscoreRevision(parseInt(PROGRAM_REVISION, 16))
            }
            score.setMscVersion(MSC_VERSION)
        }

        if (inout) {
            inout.ctx.assign(ctx)
        }

        return xml.text()
    }

    static write(score: Score, xml: XmlWriter, ctx: WriteContext, hook: WriteScoreHook): void {
        // if we have multi measure rests and some parts are hidden,
        // then some layout information is missing:
        // relayout with all parts set visible (but rollback at end)

        const hiddenParts: Part[] = []
        let unhide = false
        if (score.style().styleB(Sid.createMultiMeasureRests)) {
            for (const part of score.parts()) {
                if (!part.show()) {
                    unhide = true
                    part.setShow(true) // C++: part->undoChangeProperty(Pid::VISIBLE, true) in a command
                    hiddenParts.push(part)
                }
            }
        }
        if (unhide) {
            ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))
            for (const p of hiddenParts) {
                p.setShow(false)
            }
        }

        xml.startElement(score)

        TWrite.writeItemEid(score, xml, ctx)

        const e = score.excerpt()
        if (e) {
            if (e.name()) {
                xml.tag('name', e.name())
            }

            const tracks = e.tracksMapping()
            if (!(tracks.length === e.nstaves() * VOICES) && tracks.length) {
                for (const [sTrack, dstTrack] of tracks) {
                    xml.tag('Tracklist', [['sTrack', sTrack], ['dstTrack', dstTrack]])
                }
            }

            if (e.initialPartId()) {
                xml.tag('initialPartId', e.initialPartId())
            }
        }

        if (score.layoutMode() === LayoutMode.LINE) {
            xml.tag('layoutMode', 'line')
        }
        if (score.layoutMode() === LayoutMode.SYSTEM) {
            xml.tag('layoutMode', 'system')
        }

        // TODO(port): <playMode>, <Audio>

        if (score.isMaster()) {
            score.synthesizerState().write(xml)
        }

        if (score.pageNumberOffset()) {
            xml.tag('page-offset', score.pageNumberOffset())
        }
        xml.tag('Division', Constants.DIVISION)
        ctx.setCurTrack(nidx)

        hook.onWriteStyle302(score, xml)

        xml.tag('showInvisible', score.isShowInvisible())
        xml.tag('showUnprintable', score.showUnprintable())
        xml.tag('showFrames', score.showFrames())
        xml.tag('showMargins', score.showPageborders())
        xml.tag('markIrregularMeasures', score.markIrregularMeasures(), true)

        if (!score.showSoundFlags()) { // true by default
            xml.tag('showSoundFlags', score.showSoundFlags())
        }

        if (score.isOpen()) {
            xml.tag('open', score.isOpen())
        }

        // std::map: sorted by key
        const metaTags = [...score.metaTags()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        for (const [name, value] of metaTags) {
            // C++ does not output "platform" and "creationDate" in test and save template mode
            xml.tag('metaTag', [['name', XmlWriter.xmlString(name)]], value)
        }

        if (score.scoreOrder().isValid()) {
            const order = score.scoreOrder().clone()
            order.updateInstruments(score)
            order.write(xml)
        }

        let staffStart = 0
        let staffEnd = 0
        let measureStart: MeasureBase | null = null
        let measureEnd: MeasureBase | null = null

        const range = ctx.range()
        if (range) {
            staffStart = range.startStaffIdx
            staffEnd = range.endStaffIdx
            measureStart = range.startMeasure
            measureEnd = range.endMeasure
        } else {
            staffEnd = score.nstaves()
            measureStart = score.first()
        }

        const systemObjectStaves = score.systemObjectStaves()
        if (systemObjectStaves.length) {
            let saveSysObjStaves = false
            for (const s of systemObjectStaves) {
                if (s.idx() === nidx) {
                    continue
                }
                saveSysObjStaves = true
                break
            }

            if (saveSysObjStaves) {
                xml.startElement('SystemObjects')
                for (const s of systemObjectStaves) {
                    const idx = s.idx()
                    if (idx === nidx) {
                        continue
                    }

                    if (range) {
                        if (idx < staffStart || idx >= staffEnd) {
                            continue
                        }
                    }

                    xml.tag('Instance', [['staffId', idx + 1]])
                }
                xml.endElement()
            }
        }

        ctx.setCurTrack(0)

        score.masterScore().checkMidiMapping()

        const shouldWritePart = (part: Part): boolean => {
            if (!range) {
                return true
            }
            const firstStaffIdx = score.staffIdxOfPart(part)
            const lastStaffIdx = firstStaffIdx + part.nstaves() - 1
            return (firstStaffIdx >= staffStart && firstStaffIdx < staffEnd)
                || (lastStaffIdx >= staffStart && lastStaffIdx < staffEnd)
        }

        for (const part of score.parts()) {
            if (shouldWritePart(part)) {
                TWrite.writePart(part, xml, ctx)
            }
        }

        ctx.setCurTrack(0)
        ctx.setTrackDiff(-(staffStart * VOICES))
        if (measureStart) {
            for (let staffIdx = staffStart; staffIdx < staffEnd; ++staffIdx) {
                const st = score.staff(staffIdx)!
                StaffWrite.writeStaff(st, xml, ctx, measureStart, measureEnd, staffStart, staffIdx)
            }
        }
        ctx.setCurTrack(nidx)

        hook.onWriteExcerpts302(score, xml, ctx)

        TWrite.writeSystemLocks(score, xml)
        TWrite.writeSystemDividers(score, xml, ctx)

        xml.endElement() // score

        if (unhide) {
            // C++: score->endCmd(true) rolls the visibility change back and relayouts the score
            ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))
        }
    }

    // ---------------------------------------------------------
    //   clipboard (Selection::staffMimeData, symbolListMimeData, EngravingItem::mimeData)
    // ---------------------------------------------------------

    /** curTick is updated (C++ Fraction&) */
    static writeSegments(xml: XmlWriter, filter: SelectionFilter, strack: track_idx_t, etrack: track_idx_t,
        sseg: Segment, eseg: Segment | null, writeSystemElements: boolean, forceTimeSig: boolean, curTick: { v: Fraction }): void {
        const ctx = new WriteContext(sseg.score())
        ctx.setClipboardmode(true)
        ctx.setFilter(filter)
        ctx.setCurTrack(strack)
        ctx.setCurTick(curTick.v)
        TWrite.writeSegments(xml, ctx, strack, etrack, sseg, eseg, writeSystemElements, forceTimeSig)
        curTick.v = ctx.curTick()
    }

    /** C++ Writer::doWriteItem (IWriter::writeItem) */
    static doWriteItem(item: EngravingItem, xml: XmlWriter): void {
        const ctx = new WriteContext(item.score())
        ctx.setClipboardmode(true)
        TWrite.writeItem(item, xml, ctx)
    }
}

RWRegister.setWriter({
    writeSegments: Writer.writeSegments,
    writeItem: Writer.doWriteItem,
    createXmlWriter: () => new XmlWriter(),
})
