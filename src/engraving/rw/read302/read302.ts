/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read302/read302.h/.cpp
 *
 * C++ reads the elements of 3.x files with the read400 readers; here the shared (read460) readers are used,
 * which contain the read400/read410 compat code (see claude_history.md).
 * TODO(port): excerpts (<Score> recursion), Audio, Synthesizer, instrument id recognition
 * tempo map, MIDI mapping
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
import type { Instrument } from '../../dom/instrument'
import type { XmlReader } from '../xmlreader'
import { ReadContext } from '../read460/readcontext'
import { StaffRead } from '../read460/staffread'
import { TRead } from '../read460/tread'
import { ReadChordListHook } from '../compat/readchordlisthook'

export class Read302 {
    readScoreFile(score: Score, e: XmlReader): boolean {
        const ctx = new ReadContext(score)
        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'programVersion') {
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreVersion(e.readText())
                } else {
                    e.skipCurrentElement()
                }
            } else if (tag === 'programRevision') {
                const rev = parseInt(e.readText(), 16)
                if (score.isMaster()) {
                    (score as MasterScore).setMscoreRevision(rev)
                }
            } else if (tag === 'Score') {
                if (!Read302.readScoreTag(score, e, ctx)) {
                    return false
                }
            } else if (tag === 'Revision') {
                e.skipCurrentElement()
            } else {
                // C++ ignores (does not skip) other tags here
                e.skipCurrentElement()
            }
        }
        return true
    }

    static readScoreTag(score: Score, e: XmlReader, ctx: ReadContext): boolean {
        while (e.readNextStartElement()) {
            ctx.setTrack(-1)
            const tag = e.name()
            if (tag === 'Staff') {
                StaffRead.readStaff(score, e, ctx)
            } else if (tag === 'Omr' || tag === 'Audio' || tag === 'showOmr' || tag === 'playMode' || tag === 'LayerTag'
                       || tag === 'Layer' || tag === 'currentLayer' || tag === 'Synthesizer') {
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
            } else if (tag === 'markIrregularMeasures') {
                score.setMarkIrregularMeasures(e.readInt() !== 0)
            } else if (tag === 'Style') {
                // ReadStyleHook::readStyleTag(score, e)
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
                e.skipCurrentElement() // TODO(port): ScoreOrder
            } else if (tag === 'Part') {
                const part = new Part(score)
                TRead.readPart(part, e, ctx)
                score.appendPart(part)
            } else if (tag === 'HairPin' || tag === 'Ottava' || tag === 'TextLine' || tag === 'Volta' || tag === 'Trill'
                       || tag === 'Slur' || tag === 'Pedal') {
                const s = Factory.createItemByName(tag, score) as Spanner | null
                if (!s) {
                    e.skipCurrentElement()
                    continue
                }
                TRead.readItem(s, e, ctx)
                score.addSpanner(s)
            } else if (tag === 'Tracklist') {
                e.skipCurrentElement()
            } else if (tag === 'Score') { // recursion
                e.skipCurrentElement() // TODO(port): excerpts
            } else if (tag === 'name') {
                e.skipCurrentElement() // only used by excerpts
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

        score.setFileDivision(480) // Constants::DIVISION

        if (score.mscVersion() === 302) {
            // MuseScore 3.6.x scores had some wrong instrument IDs
            for (const part of score.parts()) {
                for (const instrument of part.instruments().values()) {
                    Read302.fixInstrumentId(instrument)
                }
            }
        } else {
            // Older scores had no IDs at all
            for (const part of score.parts()) {
                for (const instrument of part.instruments().values()) {
                    instrument.updateInstrumentId()
                }
            }
        }
        // TODO(port): tempo map, harmony channels, MIDI mapping

        for (const staff of score.staves()) {
            staff.updateOttava()
        }

        return true
    }

    static fixInstrumentId(instrument: Instrument): void {
        let id = instrument.id()
        const trackName = instrument.trackName().toLowerCase()

        // incorrect instrument IDs in 3.6.x
        if (id === 'Winds') {
            id = 'winds'
        } else if (id === 'harmonica-d12high-g') {
            id = 'harmonica-d10high-g'
        } else if (id === 'harmonica-d12f') {
            id = 'harmonica-d10f'
        } else if (id === 'harmonica-d12d') {
            id = 'harmonica-d10d'
        } else if (id === 'harmonica-d12c') {
            id = 'harmonica-d10c'
        } else if (id === 'harmonica-d12a') {
            id = 'harmonica-d10a'
        } else if (id === 'harmonica-d12-g') {
            id = 'harmonica-d10g'
        } else if (id === 'drumset' && trackName === 'percussion') {
            id = 'percussion'
        } else if (id === 'cymbal' && trackName === 'cymbals') {
            id = 'marching-cymbals'
        } else if (id === 'bass-drum' && trackName === 'bass drums') {
            id = 'marching-bass-drums'
        } else if (id.startsWith('mdl-')) {
            // See https://github.com/musescore/mdl/blob/master/resources/instruments/mdl_1_3_0.xml
            if (id === 'mdl-snareline' || id === 'mdl-snareline-a' || id === 'mdl-snaresolo' || id === 'mdl-snaresolo-a') {
                id = 'marching-snare'
            } else if (id === 'mdl-tenorline' || id === 'mdl-tenorsolo' || id === 'mdl-flubs') {
                id = 'marching-tenor-drums'
            } else if (id === 'mdl-bassline-10' || id === 'mdl-bassline-5') {
                id = 'marching-bass-drums'
            } else if (id === 'mdl-cymballine') {
                id = 'marching-cymbals'
            } else if (id === 'mdl-showtenorline' || id === 'mdl-rail' || id === 'mdl-drumset' || id === 'mdl-sampler') {
                id = 'drumset'
            }
        }

        instrument.setId(id)
    }
}
