/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/synthesizerstate.h/.cpp (read and write only; not used for playback)
 */

import type { XmlReader } from '../rw/xmlreader'
import type { XmlWriter } from '../rw/xmlwriter'

export interface IdValue {
    id: number
    data: string
}

export class SynthesizerGroup {
    values: IdValue[] = []
    constructor(private m_name = '') {}
    name(): string { return this.m_name }
    setName(n: string): void { this.m_name = n }
}

export class SynthesizerState {
    groups: SynthesizerGroup[] = []
    private m_isDefault = true

    isDefault(): boolean { return this.m_isDefault }
    setIsDefault(v: boolean): void { this.m_isDefault = v }

    write(xml: XmlWriter, force = false): void {
        if (this.isDefault() && !force) {
            return
        }

        xml.startElement('Synthesizer')
        for (const g of this.groups) {
            if (g.name()) {
                xml.startElement(g.name())
                for (const v of g.values) {
                    xml.tag('val', [['id', v.id]], v.data)
                }
                xml.endElement()
            }
        }
        xml.endElement()
    }

    read(e: XmlReader): void {
        const tempGroups: SynthesizerGroup[] = []
        while (e.readNextStartElement()) {
            const group = new SynthesizerGroup(e.name())
            while (e.readNextStartElement()) {
                if (e.name() === 'val') {
                    const id = e.intAttribute('id', 0)
                    group.values.push({ id, data: e.readText() })
                } else {
                    e.unknown()
                }
            }
            tempGroups.push(group)
        }

        if (tempGroups.length) {
            // Replace any previously set state if we have read a new state
            this.groups = tempGroups
            this.setIsDefault(false)
        }
    }
}
