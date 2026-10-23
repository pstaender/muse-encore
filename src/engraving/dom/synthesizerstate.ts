/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/synthesizerstate.h/.cpp
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

    group(name: string): SynthesizerGroup {
        for (const g of this.groups) {
            if (g.name() === name) {
                return g
            }
        }
        return new SynthesizerGroup()
    }

    /** check if synthesizer state uses default synth and default font only */
    isDefaultSynthSoundfont(): boolean {
        const fluid = this.group('Fluid')
        if (fluid.values.length === 1) {
            if (fluid.values[0].data === 'MS Basic.sf3') {
                return true
            }
        }
        return false
    }

    ccToUse(): number {
        const g = this.group('master')

        let method = 1
        let cc = -1

        for (const idVal of g.values) {
            if (idVal.id === 4) {
                method = parseInt(idVal.data, 10) || 0
            } else if (idVal.id === 5) {
                switch (parseInt(idVal.data, 10) || 0) {
                case 0:
                    cc = 1
                    break
                case 1:
                    cc = 2
                    break
                case 2:
                    cc = 4
                    break
                case 3:
                    cc = 11
                    break
                default:
                    break
                }
            }
        }

        if (method === 0) { // velocity only
            return -1
        }

        return cc
    }

    method(): number {
        const g = this.group('master')

        let method = -1

        for (const idVal of g.values) {
            if (idVal.id === 4) {
                method = parseInt(idVal.data, 10) || 0
                break
            }
        }

        return method
    }

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
