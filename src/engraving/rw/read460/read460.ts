/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/read460.h/.cpp (paste functions are not ported)
 */

import { ElementType } from '../../types/types'
import { Sid } from '../../style/styledef'
import { engravingFonts } from '../../infrastructure/engravingfont'
import { Factory } from '../../dom/factory'
import { Part } from '../../dom/part'
import { LayoutMode, type Score } from '../../dom/score'
import type { MasterScore } from '../../dom/masterscore'
import type { Spanner } from '../../dom/spanner'
import type { Text } from '../../dom/text'
import type { XmlReader } from '../xmlreader'
import { ReadContext } from './readcontext'
import { StaffRead } from './staffread'
import { ScoreOrder } from '../../dom/scoreorder'
import { TRead } from './tread'
import { ReadChordListHook } from '../compat/readchordlisthook'

export class Read460 {
    readScoreFile(score: Score, e: XmlReader): boolean {
        const ctx = new ReadContext(score)
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'programVersion') {
                const ver = e.readText()
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreVersion(ver)
                }
            } else if (tag === 'programRevision') {
                const rev = parseInt(e.readText(), 16)
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreRevision(rev)
                }
            } else if (tag === 'Revision' || tag === 'LastEID') {
                e.skipCurrentElement()
            } else if (tag === 'Score') {
                if (!this.readScoreTag(score, e, ctx)) {
                    return false
                }
            } else if (tag === 'museScore') {
                // pass
            } else {
                e.skipCurrentElement()
            }
        }
        ctx.clearOrphanedConnectors()
        return true
    }

    readScoreTag(score: Score, e: XmlReader, ctx: ReadContext): boolean {
        const sysStaves: number[] = []
        while (e.readNextStartElement()) {
            ctx.setTrack(-1)
            const tag = e.name()
            if (tag === 'eid') {
                e.skipCurrentElement()
            } else if (tag === 'Staff') {
                StaffRead.readStaff(score, e, ctx)
            } else if (tag === 'Omr' || tag === 'Audio' || tag === 'showOmr' || tag === 'LayerTag' || tag === 'Layer'
                       || tag === 'currentLayer' || tag === 'Synthesizer' || tag === 'playMode' || tag === 'open') {
                e.skipCurrentElement()
            } else if (tag === 'page-offset') {
                score.setPageNumberOffset(e.readInt())
            } else if (tag === 'Division') {
                score.setFileDivision(e.readInt())
            } else if (tag === 'showInvisible') {
                score.setShowInvisible(e.readInt() !== 0)
            } else if (tag === 'showUnprintable') {
                score.setShowUnprintable(e.readInt() !== 0)
            } else if (tag === 'showFrames') {
                score.setShowFrames(e.readInt() !== 0)
            } else if (tag === 'showMargins') {
                score.setShowPageborders(e.readInt() !== 0)
            } else if (tag === 'showSoundFlags') {
                score.setShowSoundFlags(e.readInt() !== 0)
            } else if (tag === 'markIrregularMeasures') {
                score.setMarkIrregularMeasures(e.readInt() !== 0)
            } else if (tag === 'Style') {
                // compat::ReadStyleHook::readStyleTag(score, e);
                score.style().read(e, new ReadChordListHook(score), score.mscVersion())
                score.styleChanged()
                score.setEngravingFont(engravingFonts().fontByName(score.style().styleSt(Sid.musicalSymbolFont)))
            } else if (tag === 'copyright' || tag === 'rights') {
                const t = Factory.createItem(ElementType.TEXT, score) as Text
                TRead.readText(t, e, ctx)
                score.setMetaTag('copyright', t.xmlText())
            } else if (tag === 'movement-number') {
                score.setMetaTag('movementNumber', e.readText())
            } else if (tag === 'movement-title') {
                score.setMetaTag('movementTitle', e.readText())
            } else if (tag === 'work-number') {
                score.setMetaTag('workNumber', e.readText())
            } else if (tag === 'work-title') {
                score.setMetaTag('workTitle', e.readText())
            } else if (tag === 'source') {
                score.setMetaTag('source', e.readText())
            } else if (tag === 'metaTag') {
                const name = e.attribute('name')
                score.setMetaTag(name, e.readText())
            } else if (tag === 'Order') {
                const order = new ScoreOrder()
                order.read(e)
                if (order.isValid()) {
                    score.setScoreOrder(order)
                }
            } else if (tag === 'SystemObjects') {
                score.clearSystemObjectStaves()
                while (e.readNextStartElement()) {
                    if (e.name() === 'Instance') {
                        const staffIdx = parseInt(e.attribute('staffId'), 10) - 1
                        // TODO: Decide what to do with "position" attribute
                        if (staffIdx > 0) {
                            sysStaves.push(staffIdx)
                        }
                        e.skipCurrentElement()
                    } else {
                        e.skipCurrentElement()
                    }
                }
            } else if (tag === 'SystemLocks') {
                TRead.readSystemLocks(score, e)
            } else if (tag === 'SystemDividers') {
                e.skipCurrentElement() // TODO(port): system dividers
            } else if (tag === 'Part') {
                const part = new Part(score)
                TRead.readPart(part, e, ctx)
                score.appendPart(part)
            } else if (tag === 'HairPin' || tag === 'Ottava' || tag === 'TextLine' || tag === 'Volta' || tag === 'Trill'
                       || tag === 'Slur' || tag === 'Pedal') {
                const s = Factory.createItemByName(tag, score) as Spanner | null
                if (!s) {
                    e.skipCurrentElement() // TODO(port): line spanners
                    continue
                }
                TRead.readItem(s, e, ctx)
                score.addSpanner(s)
            } else if (tag === 'initialPartId' || tag === 'Tracklist' || tag === 'name') {
                e.skipCurrentElement()
            } else if (tag === 'Score') { // recursion (excerpts in old files)
                e.skipCurrentElement() // TODO(port): excerpts
            } else if (tag === 'layoutMode') {
                if (ctx.forcePageMode()) {
                    e.skipCurrentElement()
                    continue
                }
                const s = e.readText()
                if (s === 'line') {
                    score.setLayoutMode(LayoutMode.LINE)
                } else if (s === 'system') {
                    score.setLayoutMode(LayoutMode.SYSTEM)
                }
            } else {
                e.unknown()
            }
        }
        ctx.reconnectBrokenConnectors()
        if (e.isError()) {
            return false
        }

        score.connectTies()
        // TODO(port): lyrics lines (dashes)
        score.setFileDivision(480)
        // TODO(port): instrument ids
        score.setUpTempoMap()
        // TODO(port): harmony channels, midi mapping
        for (const staff of score.staves()) {
            staff.updateOttava()
        }
        for (const idx of sysStaves) {
            score.addSystemObjectStaff(score.staff(idx)!)
        }
        return true
    }
}
