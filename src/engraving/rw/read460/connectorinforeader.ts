/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/read460/connectorinforeader.h/.cpp
 */

import { ElementType } from '../../types/types'
import { TConv } from '../../types/typesconv'
import { ConnectorInfo } from '../../dom/connector'
import { Factory } from '../../dom/factory'
import { Location } from '../../dom/location'
import { SpannerAnchor, type Spanner } from '../../dom/spanner'
import type { EngravingItem } from '../../dom/engravingitem'
import type { EngravingObject } from '../../dom/engravingobject'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Measure } from '../../dom/measure'
import type { Note } from '../../dom/note'
import type { Score } from '../../dom/score'
import type { Tie } from '../../dom/tie'
import type { XmlReader } from '../xmlreader'
import type { ReadContext } from './readcontext'
import { TRead } from './tread'

export class ConnectorInfoReader extends ConnectorInfo {
    private m_reader: XmlReader
    private m_ctx: ReadContext
    private m_connector: EngravingItem | null = null
    private m_connectorReceiver: EngravingObject

    constructor(e: XmlReader, ctx: ReadContext, current: EngravingItem | Score, track = -1) {
        if (current.isScore()) {
            // ConnectorInfoReader(XmlReader&, ReadContext*, Score*, int track)
            const info = ctx.location()
            info.setTrack(track)
            super(null, current as Score, -1, undefined, info)
            this.setCurrentUpdated(true)
        } else {
            super(current as EngravingItem, current.score(), track)
        }
        this.m_reader = e
        this.m_ctx = ctx
        this.m_connectorReceiver = current
    }

    override prev(): ConnectorInfoReader | null { return this.m_prev as ConnectorInfoReader | null }
    override next(): ConnectorInfoReader | null { return this.m_next as ConnectorInfoReader | null }

    read(): boolean {
        const e = this.m_reader
        const name = e.asciiAttribute('type')
        this.m_type = TConv.fromXmlElementType(name, ElementType.INVALID)

        this.m_ctx.fillLocation(this.m_currentLoc)

        while (e.readNextStartElement()) {
            const tag = e.name()
            if (tag === 'prev') {
                this.m_prevLoc = this.readEndpointLocation(this.m_prevLoc)
            } else if (tag === 'next') {
                this.m_nextLoc = this.readEndpointLocation(this.m_nextLoc)
            } else {
                if (tag === name) {
                    this.m_connector = Factory.createItemByName(tag, this.m_connectorReceiver.score())
                }
                if (!this.m_connector) {
                    // TODO(port): connector type not ported yet
                    e.skipCurrentElement()
                    return false
                }
                this.m_connector.setTrack(this.m_currentLoc.track())
                TRead.readItem(this.m_connector, e, this.m_ctx)
            }
        }
        return true
    }

    /** C++ assigns the read location to the passed reference; here it is returned */
    private readEndpointLocation(l: Location): Location {
        const e = this.m_reader
        while (e.readNextStartElement()) {
            if (e.name() === 'location') {
                l = Location.relative()
                TRead.readLocation(l, e, this.m_ctx)
            } else {
                e.unknown()
            }
        }
        return l
    }

    curTick(): ReturnType<ReadContext['tick']> { return this.m_ctx.tick() }

    update(): void {
        if (!this.currentUpdated()) {
            this.updateCurrentInfo(this.m_ctx.pasteMode())
        }
        if (this.hasPrevious()) {
            this.m_prevLoc.toAbsolute(this.m_currentLoc)
        }
        if (this.hasNext()) {
            this.m_nextLoc.toAbsolute(this.m_currentLoc)
        }
    }

    addToScore(pasteMode: boolean): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let r: ConnectorInfoReader | null = this
        while (r.prev()) {
            r = r.prev()!
        }
        while (r) {
            const recv = r.m_connectorReceiver
            if (recv.isChordRest()) {
                ConnectorInfoReader.readAddConnectorChordRest(recv as unknown as ChordRest, r, pasteMode)
            } else if (recv.isMeasure()) {
                ConnectorInfoReader.readAddConnectorMeasure(recv as unknown as Measure, r, pasteMode)
            } else if (recv.isNote()) {
                ConnectorInfoReader.readAddConnectorNote(recv as unknown as Note, r, pasteMode)
            } else if (recv.isScore()) {
                ConnectorInfoReader.readAddConnectorScore(recv as Score, r, pasteMode)
            }
            r = r.next()
        }
    }

    static readConnector(info: ConnectorInfoReader, e: XmlReader, ctx: ReadContext): void {
        if (!info.read()) {
            e.skipCurrentElement()
            return
        }
        ctx.addConnectorInfoLater(info)
    }

    connector(): EngravingItem | null {
        const i = this.findFirst() as ConnectorInfoReader | null
        return i ? i.m_connector : null
    }

    static readAddConnectorChordRest(item: ChordRest, info: ConnectorInfoReader, pasteMode: boolean): void {
        switch (info.type()) {
        case ElementType.SLUR:
        case ElementType.HAMMER_ON_PULL_OFF: {
            const spanner = info.connector() as unknown as Spanner
            const l = info.location()
            if (info.isStart()) {
                spanner.setTrack(l.track())
                const startTick = item.isChord() && (item as unknown as Chord).isTrillCueNote() ? info.curTick() : item.tick()
                spanner.setTick(startTick)
                spanner.setStartElement(item)
                if (pasteMode) {
                    item.score().undoAddElement(spanner)
                    // TODO(port): the linked spanners of parts (excerpts)
                } else {
                    item.score().addSpanner(spanner)
                }
            } else if (info.isEnd()) {
                spanner.setTrack2(l.track())
                spanner.setTick2(item.tick())
                spanner.setEndElement(item)
                // TODO(port): pasteMode: the linked spanners of parts (excerpts)
            }
            break
        }
        default:
            break
        }
    }

    static readAddConnectorMeasure(item: Measure, info: ConnectorInfoReader, pasteMode: boolean): void {
        switch (info.type()) {
        case ElementType.HAIRPIN:
        case ElementType.PEDAL:
        case ElementType.OTTAVA:
        case ElementType.TRILL:
        case ElementType.TEXTLINE:
        case ElementType.LET_RING:
        case ElementType.GRADUAL_TEMPO_CHANGE:
        case ElementType.VIBRATO:
        case ElementType.PALM_MUTE:
        case ElementType.PARTIAL_LYRICSLINE:
        case ElementType.WHAMMY_BAR:
        case ElementType.RASGUEADO:
        case ElementType.HARMONIC_MARK:
        case ElementType.PICK_SCRAPE:
        case ElementType.VOLTA: {
            const sp = info.connector() as unknown as Spanner
            const l = info.location()
            const lTick = l.frac()
            const spTick = pasteMode ? lTick : item.tick().plus(lTick)
            if (info.isStart()) {
                sp.setTrack(l.track())
                sp.setTrack2(sp.track())
                sp.setTick(spTick)
                item.score().addSpanner(sp)
            } else if (info.isEnd()) {
                sp.setTrack2(l.track())
                sp.setTick2(spTick)
            }
            break
        }
        default:
            break
        }
    }

    static readAddConnectorNote(item: Note, info: ConnectorInfoReader, pasteMode: boolean): void {
        const l = info.location()
        switch (info.type()) {
        case ElementType.TIE:
        case ElementType.TEXTLINE:
        case ElementType.GLISSANDO:
        case ElementType.GUITAR_BEND:
        case ElementType.NOTELINE: {
            const sp = info.connector() as unknown as Spanner
            if (info.isStart()) {
                sp.setTrack(l.track())
                sp.setTick(item.tick())
                if (sp.isTie()) {
                    let n = item
                    while (n.tieFor()) {
                        n = n.tieFor()!.endNote()!
                    }
                    const tie = sp as unknown as Tie
                    tie.setParent(n)
                    tie.setStartNote(n)
                    n.setTieFor(tie)
                } else {
                    sp.setAnchor(SpannerAnchor.NOTE)
                    sp.setStartElement(item)
                    item.addSpannerFor(sp)
                    sp.setParent(item)
                }
            } else if (info.isEnd()) {
                sp.setTrack2(l.track())
                sp.setTick2(item.tick())
                sp.setEndElement(item)
                if (sp.isTie()) {
                    item.setTieBack(sp as unknown as Tie)
                } else {
                    if ((sp.isGlissando() || sp.isGuitarBend()) && item.explicitParent()
                        && item.explicitParent()!.isChord()) {
                        (item.explicitParent() as unknown as Chord).setEndsNoteAnchoredLine(true)
                    }
                    item.addSpannerBack(sp)
                }

                // As spanners get added after being fully read, they
                // do not get cloned with the note when pasting to
                // linked staves. So add this spanner explicitly.
                if (pasteMode) {
                    // TODO(port): tie->updatePossibleJumpPoints() (tie jump points)
                    item.score().undoAddElement(sp)
                }
            }
            break
        }
        default:
            break
        }
    }

    static readAddConnectorScore(item: Score, info: ConnectorInfoReader, pasteMode: boolean): void {
        if (!pasteMode) {
            // How did we get there?
            return
        }

        if (info.connector()!.systemFlag()) {
            return
        }

        switch (info.type()) {
        case ElementType.HAIRPIN:
        case ElementType.PEDAL:
        case ElementType.OTTAVA:
        case ElementType.TRILL:
        case ElementType.TEXTLINE:
        case ElementType.PALM_MUTE:
        case ElementType.PARTIAL_LYRICSLINE:
        case ElementType.WHAMMY_BAR:
        case ElementType.RASGUEADO:
        case ElementType.HARMONIC_MARK:
        case ElementType.PICK_SCRAPE:
        case ElementType.LET_RING:
        case ElementType.VIBRATO: {
            const sp = info.connector() as unknown as Spanner
            const l = info.location()
            if (info.isStart()) {
                sp.setAnchor(SpannerAnchor.SEGMENT)
                sp.setTrack(l.track())
                sp.setTrack2(l.track())
                sp.setTick(l.frac())
            } else if (info.isEnd()) {
                sp.setTick2(l.frac())
                item.undoAddElement(sp)
                if (sp.isOttava()) {
                    sp.staff()!.updateOttava()
                }
            }
            break
        }
        default:
            break
        }
    }
}
