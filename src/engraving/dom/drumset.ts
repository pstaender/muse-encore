/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/drumset.h/.cpp
 *
 */

import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { DirectionV, NoteHeadGroup, NoteHeadType, TremoloType } from '../types/types'
import { TConv } from '../types/typesconv'
import type { XmlReader } from '../rw/xmlreader'
import type { XmlWriter } from '../rw/xmlwriter'
import type { Articulation } from './articulation'
import { STANDARD_DRUMSET } from './drumsetdata'
import { mtrc } from '../../framework/global/translation'

const INVALID_PITCH = -1

export interface DrumInstrumentVariant {
    pitch: number
    tremolo: TremoloType
    articulationName: string
}

export class DrumInstrument {
    name = ''
    // if notehead = HEAD_CUSTOM, custom, use noteheads
    notehead = NoteHeadGroup.HEAD_INVALID // notehead symbol set
    noteheads: SymId[] = [SymId.noteheadWhole, SymId.noteheadHalf, SymId.noteheadBlack, SymId.noteheadDoubleWhole]
    line = 0 // place notehead onto this line
    stemDirection = DirectionV.AUTO
    panelRow = -1
    panelColumn = -1
    voice = 0
    shortcut = ''
    variants: DrumInstrumentVariant[] = []

    clone(): DrumInstrument {
        const d = Object.assign(new DrumInstrument(), this)
        d.noteheads = [...this.noteheads]
        d.variants = this.variants.map(v => ({ ...v }))
        return d
    }
}

export const DRUM_INSTRUMENTS = 128

export class Drumset {
    private m_drums: DrumInstrument[] = Array.from({ length: DRUM_INSTRUMENTS }, () => new DrumInstrument())
    private m_percussionPanelColumns = 8

    clone(): Drumset {
        const d = new Drumset()
        d.m_drums = this.m_drums.map(di => di.clone())
        d.m_percussionPanelColumns = this.m_percussionPanelColumns
        return d
    }

    isValid(pitch: number): boolean {
        return pitch >= 0 && pitch < DRUM_INSTRUMENTS && this.m_drums[pitch].name !== ''
    }

    noteHead(pitch: number): NoteHeadGroup { return this.m_drums[pitch].notehead }
    noteHeads(pitch: number, t: NoteHeadType): SymId { return this.m_drums[pitch].noteheads[t] }
    line(pitch: number): number { return this.m_drums[pitch].line }
    voice(pitch: number): number { return this.m_drums[pitch].voice }
    stemDirection(pitch: number): DirectionV { return this.m_drums[pitch].stemDirection }
    name(pitch: number): string { return this.m_drums[pitch].name }
    translatedName(pitch: number): string { return mtrc('engraving/drumset', this.name(pitch)) }
    shortcut(pitch: number): string { return this.m_drums[pitch].shortcut }
    variants(pitch: number): DrumInstrumentVariant[] { return this.m_drums[pitch].variants }

    findVariant(p: number, articulations: readonly Articulation[], tremType: TremoloType): DrumInstrumentVariant {
        let div: DrumInstrumentVariant = { pitch: INVALID_PITCH, tremolo: TremoloType.INVALID_TREMOLO, articulationName: '' }
        const vs = this.variants(p)
        for (const v of vs) {
            const matchTremolo = ((tremType === TremoloType.INVALID_TREMOLO) && (v.tremolo === TremoloType.INVALID_TREMOLO))
                                 || (v.tremolo === tremType)
            let matchArticulation = v.articulationName === '' && articulations.length === 0
            for (const a of articulations) {
                matchArticulation = a.articulationName() === v.articulationName
                if (!matchArticulation) {
                    break
                }
            }
            if (matchArticulation && matchTremolo) {
                div = { ...v }
                break
            }
        }
        return div
    }
    panelRow(pitch: number): number { return this.m_drums[pitch].panelRow }
    panelColumn(pitch: number): number { return this.m_drums[pitch].panelColumn }

    percussionPanelColumns(): number { return this.m_percussionPanelColumns }
    setPercussionPanelColumns(columns: number): void { this.m_percussionPanelColumns = columns }

    drum(i: number): DrumInstrument { return this.m_drums[i] }
    setDrum(pitch: number, di: DrumInstrument): void { this.m_drums[pitch] = di.clone() }

    pitchForShortcut(shortcut: string): number {
        if (!shortcut) {
            return -1
        }
        for (let pitch = 0; pitch < DRUM_INSTRUMENTS; ++pitch) {
            if (this.isValid(pitch) && this.drum(pitch).shortcut === shortcut) {
                return pitch
            }
        }
        return -1
    }

    // defaultPitchForLine tries to find the pitch of a normal notehead at "line". If a normal notehead can't be found it will
    // instead return the "first valid pitch" (i.e. the lowest used midi note)
    defaultPitchForLine(val: number): number {
        let firstValidPitch = -1
        for (let pitch = 0; pitch < DRUM_INSTRUMENTS; ++pitch) {
            if (!this.isValid(pitch) || this.line(pitch) !== val) {
                continue
            }
            if (firstValidPitch < 0) {
                firstValidPitch = pitch
            }
            if (this.noteHead(pitch) === NoteHeadGroup.HEAD_NORMAL) {
                return pitch
            }
        }
        return firstValidPitch
    }

    save(xml: XmlWriter): void {
        xml.tag('percussionPanelColumns', this.m_percussionPanelColumns)
        for (let i = 0; i < DRUM_INSTRUMENTS; ++i) {
            if (!this.isValid(i)) {
                continue
            }
            xml.startElement('Drum', [['pitch', i]])
            const nh = this.noteHead(i)
            //write custom as Normal notehead group + noteheads tag to keep compatibility with 2.X versions
            const saveNHValue = (nh === NoteHeadGroup.HEAD_CUSTOM) ? NoteHeadGroup.HEAD_NORMAL : nh
            xml.tag('head', TConv.toXmlNoteHeadGroup(saveNHValue))
            if (nh === NoteHeadGroup.HEAD_CUSTOM) {
                xml.startElement('noteheads')
                for (let j = 0; j < NoteHeadType.HEAD_TYPES; j++) {
                    xml.tag(TConv.toXmlNoteHeadType(j as NoteHeadType), SymNames.nameForSymId(this.noteHeads(i, j as NoteHeadType)))
                }
                xml.endElement()
            }
            xml.tag('line', this.line(i))
            xml.tag('voice', this.voice(i))
            xml.tag('name', this.name(i))
            xml.tag('stem', this.stemDirection(i))
            if (this.shortcut(i)) {
                xml.tag('shortcut', this.shortcut(i))
            }
            const vs = this.variants(i)
            if (vs.length) {
                xml.startElement('variants')
                for (const v of vs) {
                    xml.startElement('variant', [['pitch', v.pitch]])
                    if (v.articulationName) {
                        xml.tag('articulation', v.articulationName)
                    }
                    if (v.tremolo !== TremoloType.INVALID_TREMOLO) {
                        xml.tag('tremolo', TConv.toXmlTremoloType(v.tremolo))
                    }
                    xml.endElement()
                }
                xml.endElement()
            }
            if (this.panelRow(i) > -1 && this.panelColumn(i) > -1) {
                xml.tag('panelRow', this.panelRow(i))
                xml.tag('panelColumn', this.panelColumn(i))
            }
            xml.endElement()
        }
    }

    readDrumProperties(e: XmlReader, pitch: number): boolean {
        if (pitch < 0 || pitch > DRUM_INSTRUMENTS - 1) {
            return false
        }
        const d = this.m_drums[pitch]
        const tag = e.name()
        if (tag === 'head') {
            d.notehead = TConv.fromXmlNoteHeadGroup(e.readAsciiText(), NoteHeadGroup.HEAD_NORMAL)
        } else if (tag === 'noteheads') {
            d.notehead = NoteHeadGroup.HEAD_CUSTOM
            while (e.readNextStartElement()) {
                const noteType = TConv.fromXmlNoteHeadType(e.name(), NoteHeadType.HEAD_AUTO)
                if (noteType > NoteHeadType.HEAD_TYPES - 1 || noteType < 0) {
                    return false
                }
                d.noteheads[noteType] = SymNames.symIdByName(e.readAsciiText())
            }
        } else if (tag === 'line') {
            d.line = e.readInt()
        } else if (tag === 'voice') {
            d.voice = e.readInt()
        } else if (tag === 'name') {
            d.name = e.readText()
        } else if (tag === 'stem') {
            d.stemDirection = e.readInt() as DirectionV
        } else if (tag === 'shortcut') {
            d.shortcut = e.readText()
        } else if (tag === 'variants') {
            while (e.readNextStartElement()) {
                if (e.name() === 'variant') {
                    const div: DrumInstrumentVariant = { pitch: INVALID_PITCH, tremolo: TremoloType.INVALID_TREMOLO, articulationName: '' }
                    div.pitch = parseInt(e.attribute('pitch'), 10) || 0
                    while (e.readNextStartElement()) {
                        const taga = e.name()
                        if (taga === 'articulation') {
                            div.articulationName = e.readText()
                        } else if (taga === 'tremolo') {
                            div.tremolo = TConv.fromXmlTremoloType(e.readAsciiText(), TremoloType.INVALID_TREMOLO)
                        } else {
                            e.skipCurrentElement()
                        }
                    }
                    d.variants.push(div)
                } else {
                    e.skipCurrentElement()
                }
            }
        } else if (tag === 'panelRow') {
            d.panelRow = e.readInt()
        } else if (tag === 'panelColumn') {
            d.panelColumn = e.readInt()
        } else {
            return false
        }
        return true
    }

    loadDrum(e: XmlReader): void {
        const pitch = e.intAttribute('pitch', -1)
        if (pitch < 0 || pitch > DRUM_INSTRUMENTS - 1) {
            e.skipCurrentElement()
            return
        }
        while (e.readNextStartElement()) {
            if (!this.readDrumProperties(e, pitch)) {
                e.unknown()
            }
        }
    }

    clear(): void {
        for (const d of this.m_drums) {
            d.name = ''
            d.notehead = NoteHeadGroup.HEAD_INVALID
            d.shortcut = ''
            d.variants = []
            d.panelRow = -1
            d.panelColumn = -1
        }
    }

    nextPitch(ii: number): number {
        for (let i = ii + 1; i < DRUM_INSTRUMENTS - 1; ++i) {
            if (this.isValid(i)) {
                return i
            }
        }
        for (let i = 0; i <= ii; ++i) {
            if (this.isValid(i)) {
                return i
            }
        }
        return 0
    }

    prevPitch(ii: number): number {
        for (let i = ii - 1; i >= 0; --i) {
            if (this.isValid(i)) {
                return i
            }
        }
        for (let i = DRUM_INSTRUMENTS - 1; i >= ii; --i) {
            if (this.isValid(i)) {
                return i
            }
        }
        return 0
    }

    // initialize standard midi drumset
    static initDrumset(): Drumset {
        const ds = new Drumset()
        for (const d of ds.m_drums) {
            d.stemDirection = DirectionV.UP
        }
        for (const entry of STANDARD_DRUMSET) {
            const d = ds.m_drums[entry.pitch]
            d.name = entry.name
            d.notehead = entry.notehead
            d.line = entry.line
            d.stemDirection = entry.stem
            d.panelRow = entry.panelRow
            d.panelColumn = entry.panelColumn
            d.voice = entry.voice
            if (entry.noteheads) {
                d.noteheads = [...entry.noteheads]
            }
        }
        return ds
    }
}

let s_smDrumset: Drumset | null = null

/** standard midi drumset (C++ global smDrumset) */
export function smDrumset(): Drumset {
    s_smDrumset ??= Drumset.initDrumset()
    return s_smDrumset
}
