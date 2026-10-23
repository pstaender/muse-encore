/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/connectorinfowriter.h/.cpp
 */

import { Fraction } from '../../types/fraction'
import { ConnectorInfo } from '../../dom/connector'
import type { Location } from '../../dom/location'
import { SpannerAnchor, type Spanner } from '../../dom/spanner'
import type { EngravingItem } from '../../dom/engravingitem'
import type { MeasureBase } from '../../dom/measurebase'
import type { XmlWriter } from '../xmlwriter'
import type { WriteContext } from './writecontext'
import { TWrite } from './twrite'

/**
 * Helper class for writing connecting elements.
 * Subclasses should fill m_prevLoc and m_nextLoc with the proper information on the connector's endpoints.
 */
export abstract class ConnectorInfoWriter extends ConnectorInfo {
    protected m_connector: EngravingItem
    private m_xml: XmlWriter
    private m_ctx: WriteContext

    constructor(xml: XmlWriter, ctx: WriteContext, current: EngravingItem, connector: EngravingItem, track = -1,
                frac = new Fraction(-1, 1)) {
        super(current, current.score(), track, frac)
        this.m_connector = connector
        this.m_xml = xml
        this.m_ctx = ctx
        this.m_type = connector.type()
        this.updateCurrentInfo(this.m_ctx.clipboardmode())
    }

    protected abstract tagName(): string

    write(): void {
        const xml = this.m_xml
        const ctx = this.m_ctx
        if (!ctx.canWrite(this.m_connector)) {
            return
        }
        xml.startElement(this.tagName(), [['type', this.m_connector.typeName()]])
        if (this.isStart()) {
            TWrite.writeItem(this.m_connector, xml, ctx)
        }
        if (this.hasPrevious()) {
            xml.startElement('prev')
            this.m_prevLoc.toRelative(this.m_currentLoc)
            TWrite.writeLocation(this.m_prevLoc, xml, ctx)
            xml.endElement()
        }
        if (this.hasNext()) {
            xml.startElement('next')
            this.m_nextLoc.toRelative(this.m_currentLoc)
            TWrite.writeLocation(this.m_nextLoc, xml, ctx)
            xml.endElement()
        }
        xml.endElement()
    }
}

/** Helper class for writing Spanners */
export class SpannerWriter extends ConnectorInfoWriter {
    protected tagName(): string { return 'Spanner' }

    constructor(xml: XmlWriter, ctx: WriteContext, current: EngravingItem, sp: Spanner, track: number, frac: Fraction,
                start: boolean) {
        super(xml, ctx, current, sp, track, frac)
        const clipboardmode = ctx.clipboardmode()
        if ((!sp.startElement() || !sp.endElement())
            && (sp.anchor() === SpannerAnchor.CHORD || sp.anchor() === SpannerAnchor.NOTE)) {
            // C++ logs "SpannerWriter: spanner doesn't have an endpoint!"
            return
        }
        if (current.isMeasure() || current.isSegment() || !sp.startElement() || !sp.endElement()
            || (sp.startElement()!.type() !== current.type())) {
            // (The latter is the hairpins' case, for example, though they are
            // covered by the other checks too.)
            // We cannot determine position of the spanner from its start/end
            // elements and will try to obtain this info from the spanner itself.
            if (!start) {
                this.m_prevLoc.setTrack(sp.track())
                const m = sp.score().tick2measure(sp.tick())
                SpannerWriter.fillSpannerPosition(this.m_prevLoc, m, sp.tick(), clipboardmode)
            } else {
                const track2 = sp.track2() !== -1 ? sp.track2() : sp.track()
                this.m_nextLoc.setTrack(track2)
                const m = sp.score().tick2measure(sp.tick2())
                SpannerWriter.fillSpannerPosition(this.m_nextLoc, m, sp.tick2(), clipboardmode)
            }
        } else {
            // We can obtain the spanner position info from its start/end
            // elements and will prefer this source of information.
            // Reason: some spanners contain no or wrong information (e.g. Ties).
            if (!start) {
                this.updateLocation(sp.startElement()!, this.m_prevLoc, clipboardmode)
            } else {
                this.updateLocation(sp.endElement()!, this.m_nextLoc, clipboardmode)
            }
        }
    }

    static fillSpannerPosition(l: Location, m: MeasureBase | null, tick: Fraction, clipboardmode: boolean): void {
        if (clipboardmode) {
            l.setMeasure(0)
            l.setFrac(tick)
        } else {
            if (!m) {
                // C++ logs "fillSpannerPosition: couldn't find spanner's endpoint's measure"
                l.setMeasure(0)
                l.setFrac(tick)
                return
            }
            l.setMeasure(m.measureIndex())
            l.setFrac(tick.minus(m.tick()))
        }
    }
}
