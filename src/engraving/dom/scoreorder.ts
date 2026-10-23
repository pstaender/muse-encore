/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/scoreorder.h/.cpp
 */

import { RemoveBracket } from '../editing/editbrackets'
import { BracketType } from '../types/types'
import type { XmlReader } from '../rw/xmlreader'
import type { XmlWriter } from '../rw/xmlwriter'
import { Pid } from './property'
import { instrumentGroups, searchTemplate, searchTemplateIndexForId, type InstrumentTemplate } from './instrtemplate'
import type { Score } from './score'
import type { Staff } from './staff'

const SOLOISTS_ID = '<soloists>'
const UNSORTED_ID = '<unsorted>'

export class ScoreGroup {
    family = ''
    section = ''
    unsorted = '' // isEmpty()  : equal to <unsorted/>
                  // !isEmpty() : equal to <unsorted group="unsorted"/>
    notUnsorted = true // not an unsorted group

    bracket = false
    barLineSpan = true
    thinBracket = true

    clone(): ScoreGroup { return Object.assign(new ScoreGroup(), this) }
}

export interface InstrumentOverwrite {
    id: string
    name: string
}

export class ScoreOrder {
    id = ''
    name = ''
    instrumentMap = new Map<string, InstrumentOverwrite>()
    groups: ScoreGroup[] = []
    customized = false

    clone(): ScoreOrder {
        const newOrder = new ScoreOrder()
        newOrder.id = this.id
        newOrder.name = this.name
        newOrder.customized = this.customized
        newOrder.instrumentMap = new Map([...this.instrumentMap].map(([k, v]) => [k, { ...v }]))
        newOrder.groups = this.groups.map(sg => sg.clone())
        return newOrder
    }

    /** C++ operator== */
    equals(order: ScoreOrder): boolean { return this.id === order.id }

    readBoolAttribute(reader: XmlReader, attrName: string, defvalue: boolean): boolean {
        if (!reader.hasAttribute(attrName)) {
            return defvalue
        }
        const attr = reader.attribute(attrName).toLowerCase()
        if (attr === 'false') {
            return false
        } else if (attr === 'true') {
            return true
        }
        return defvalue
    }

    readInstrument(reader: XmlReader): void {
        const instrumentId = reader.attribute('id')
        if (!searchTemplate(instrumentId)) {
            reader.skipCurrentElement()
            return
        }
        while (reader.readNextStartElement()) {
            if (reader.name() === 'family') {
                const id = reader.attribute('id')
                const name = reader.readText()
                if (!this.instrumentMap.has(instrumentId)) { // std::map::insert does not overwrite
                    this.instrumentMap.set(instrumentId, { id, name })
                }
            } else {
                reader.unknown()
            }
        }
    }

    readSoloists(reader: XmlReader, section: string): void {
        reader.skipCurrentElement()
        if (this.hasGroup(SOLOISTS_ID)) {
            return
        }
        const sg = new ScoreGroup()
        sg.family = SOLOISTS_ID
        sg.section = section
        this.groups.push(sg)
    }

    readSection(reader: XmlReader): void {
        const sectionId = reader.attribute('id')
        const barLineSpan = this.readBoolAttribute(reader, 'barLineSpan', true)
        const thinBrackets = this.readBoolAttribute(reader, 'thinBrackets', true)
        while (reader.readNextStartElement()) {
            if (reader.name() === 'family') {
                const sg = new ScoreGroup()
                sg.family = reader.readText()
                sg.section = sectionId
                sg.bracket = true
                sg.barLineSpan = barLineSpan
                sg.thinBracket = thinBrackets
                this.groups.push(sg)
            } else if (reader.name() === 'unsorted') {
                const group = reader.attribute('group', '')

                if (this.hasGroup(UNSORTED_ID, group)) {
                    reader.skipCurrentElement()
                    return
                }

                const sg = new ScoreGroup()
                sg.family = UNSORTED_ID
                sg.section = sectionId
                sg.unsorted = group
                sg.notUnsorted = false
                sg.bracket = true
                sg.barLineSpan = this.readBoolAttribute(reader, 'barLineSpan', true)
                sg.thinBracket = this.readBoolAttribute(reader, 'thinBrackets', true)
                this.groups.push(sg)
                reader.skipCurrentElement()
            } else {
                reader.unknown()
            }
        }
    }

    hasGroup(familyId: string, group = ''): boolean {
        return this.groups.some(sg => sg.family === familyId && group === sg.unsorted)
    }

    isValid(): boolean { return this.id.length > 0 }

    isCustom(): boolean { return this.id === 'custom' }

    getName(): string {
        return this.customized ? `${this.name} (Customized)` : this.name
    }

    getFamilyName(instrTemplate: InstrumentTemplate | null, soloist: boolean): string {
        if (!instrTemplate) {
            return UNSORTED_ID
        }

        if (soloist) {
            return SOLOISTS_ID
        } else if (this.instrumentMap.has(instrTemplate.id)) {
            return this.instrumentMap.get(instrTemplate.id)!.id
        } else if (instrTemplate.family) {
            return instrTemplate.family.id
        }
        return UNSORTED_ID
    }

    newUnsortedGroup(group: string, section: string): ScoreGroup {
        const sg = new ScoreGroup()
        sg.family = UNSORTED_ID
        sg.section = section
        sg.unsorted = group
        sg.notUnsorted = false
        sg.bracket = false
        sg.barLineSpan = false
        sg.thinBracket = false
        return sg
    }

    getGroup(family: string, instrumentGroup: string): ScoreGroup {
        let unsortedScoreGroup = new ScoreGroup()
        for (const sg of this.groups) {
            if (sg.family === UNSORTED_ID && !sg.unsorted) {
                unsortedScoreGroup = sg
                break
            }
        }

        if (!family) {
            return unsortedScoreGroup
        }

        for (const sg of this.groups) {
            if (sg.family === family) {
                return sg
            }
            if (sg.family === UNSORTED_ID && sg.unsorted === instrumentGroup) {
                unsortedScoreGroup = sg
            }
        }
        return unsortedScoreGroup
    }

    instrumentSortingIndex(instrumentId: string, isSoloist: boolean): number {
        enum Priority {
            Undefined,
            Unsorted,
            UnsortedGroup,
            Family,
            Soloist,
        }

        const ii = searchTemplateIndexForId(instrumentId)
        if (!ii.instrTemplate) {
            return 0
        }
        const instrTemplate = ii.instrTemplate

        const family = this.instrumentMap.has(instrumentId) ? this.instrumentMap.get(instrumentId)!.id : instrTemplate.familyId()

        let index = this.groups.length

        const calculateIndex = (index: number): number => index * ii.templateCount + instrTemplate.sequenceOrder

        let priority = Priority.Undefined

        for (let i = 0; i < this.groups.length; ++i) {
            const sg = this.groups[i]

            if (sg.family === SOLOISTS_ID && isSoloist) {
                return calculateIndex(i)
            } else if (priority < Priority.Family && sg.family === family) {
                index = i
                priority = Priority.Family
            } else if (priority < Priority.UnsortedGroup && sg.family === UNSORTED_ID && sg.unsorted === instrTemplate.groupId) {
                index = i
                priority = Priority.UnsortedGroup
            } else if (priority < Priority.Unsorted && sg.family === UNSORTED_ID && !sg.unsorted) {
                index = i
                priority = Priority.Unsorted
            }
        }

        return calculateIndex(index)
    }

    isScoreOrder(indices: readonly number[]): boolean {
        if (this.isCustom()) {
            return true
        }

        let prvIndex = -1
        for (const curIndex of indices) {
            if (curIndex < prvIndex) {
                return false
            }
            prvIndex = curIndex
        }
        return true
    }

    isScoreOrderOfScore(score: Score): boolean {
        return this.isScoreOrder(score.parts().map(part => this.instrumentSortingIndex(part.instrument().id(), part.soloist())))
    }

    setBracketsAndBarlines(score: Score): void {
        if (this.groups.length <= 0) {
            return
        }

        let prvThnBracket = false
        let prvBarLineSpan = false
        let prvSection = ''
        let prvInstrument = -1
        let prvStaff: Staff | null = null

        let thkBracketStaff: Staff | null = null
        let thnBracketStaff: Staff | null = null
        let thkBracketSpan = 0
        let thnBracketSpan = 0

        for (const part of score.parts()) {
            const ii = searchTemplateIndexForId(part.instrument().id())
            if (!ii.instrTemplate) {
                continue
            }

            const family = this.getFamilyName(ii.instrTemplate, part.soloist())
            const sg = this.getGroup(family, instrumentGroups()[ii.groupIndex].id)

            let staffIdx = 0
            let blockThinBracket = false
            let braceSpan = 0
            for (const staff of part.staves()) {
                // Create copy, because the original is modified while we are iterating over it
                const brackets = [...staff.brackets()]

                for (const bi of brackets) {
                    if (bi.bracketType() === BracketType.BRACE) {
                        braceSpan = Math.max(braceSpan, bi.bracketSpan() - 1)
                    }
                    if (!braceSpan) {
                        score.undo(new RemoveBracket(staff, bi.column(), bi.bracketType(), bi.bracketSpan()))
                    }
                }
                if (!braceSpan) {
                    staff.undoChangeProperty(Pid.STAFF_BARLINE_SPAN, false)
                } else {
                    --braceSpan
                }

                if ((!prvSection || sg.section !== prvSection) && score.parts().length > 1) {
                    if (thkBracketStaff && thkBracketSpan > 1) {
                        score.undoAddBracket(thkBracketStaff, 0, BracketType.NORMAL, thkBracketSpan)
                    }
                    if (!staffIdx) {
                        thkBracketStaff = sg.bracket ? staff : null
                        thkBracketSpan = 0
                    }
                }
                if (sg.bracket && !staffIdx) {
                    thkBracketSpan += part.nstaves()
                }

                if (prvInstrument === -1 || ii.instrIndex !== prvInstrument) {
                    if (thnBracketStaff && thnBracketSpan > 1) {
                        score.undoAddBracket(thnBracketStaff, 1, BracketType.SQUARE, thnBracketSpan)
                    }
                    if (ii.instrIndex !== prvInstrument) {
                        thnBracketStaff = sg.thinBracket && !blockThinBracket ? staff : null
                        thnBracketSpan = 0
                    }
                }

                if (ii.instrTemplate.staffCount > 1) {
                    blockThinBracket = true
                    if (staffIdx < ii.instrTemplate.staffCount) {
                        ++staffIdx
                    }
                    prvStaff = null
                } else {
                    if (sg.thinBracket && !staffIdx) {
                        thnBracketSpan += part.nstaves()
                    }
                    if (prvStaff) {
                        const newBarlineSpan = prvBarLineSpan && (!!prvSection && sg.section === prvSection)
                        prvStaff.undoChangeProperty(Pid.STAFF_BARLINE_SPAN, newBarlineSpan)
                    }
                    prvStaff = staff
                    ++staffIdx
                }
                prvSection = sg.section
                prvBarLineSpan = sg.barLineSpan
                prvThnBracket = sg.thinBracket
            }

            prvInstrument = ii.instrIndex
        }

        if (thkBracketStaff && thkBracketSpan > 1) {
            score.undoAddBracket(thkBracketStaff, 0, BracketType.NORMAL, thkBracketSpan)
        }
        if (thnBracketStaff && thnBracketSpan > 1 && prvThnBracket) {
            score.undoAddBracket(thnBracketStaff, 1, BracketType.SQUARE, thnBracketSpan)
        }
    }

    read(reader: XmlReader): void {
        this.id = reader.attribute('id')
        const sectionId = ''
        while (reader.readNextStartElement()) {
            const tag = reader.name()
            if (tag === 'name') {
                this.name = reader.readText()
            } else if (tag === 'section') {
                this.readSection(reader)
            } else if (tag === 'instrument') {
                this.readInstrument(reader)
            } else if (tag === 'family') {
                const sg = new ScoreGroup()
                sg.family = reader.readText()
                sg.section = sectionId
                sg.bracket = false
                sg.barLineSpan = false
                sg.thinBracket = false
                this.groups.push(sg)
            } else if (tag === 'soloists') {
                this.readSoloists(reader, sectionId)
            } else if (tag === 'unsorted') {
                const group = reader.attribute('group', '')

                if (!this.hasGroup(UNSORTED_ID, group)) {
                    this.groups.push(this.newUnsortedGroup(group, sectionId))
                }

                reader.skipCurrentElement()
            } else {
                reader.unknown()
            }
        }

        if (!this.hasGroup(UNSORTED_ID, '')) {
            this.groups.push(this.newUnsortedGroup('', this.id))
        }
    }

    updateInstruments(score: Score): void {
        for (const part of score.parts()) {
            const ii = searchTemplateIndexForId(part.instrument().id())
            if (!ii.instrTemplate || !ii.instrTemplate.family) {
                continue
            }
            if (!this.instrumentMap.has(ii.instrTemplate.id)) { // std::map::emplace does not overwrite
                this.instrumentMap.set(ii.instrTemplate.id, { id: ii.instrTemplate.family.id, name: ii.instrTemplate.family.name })
            }
        }
    }

    write(xml: XmlWriter): void {
        if (!this.isValid()) {
            return
        }

        xml.startElement('Order', [['id', this.id]])
        xml.tag('name', this.name)

        // std::map: sorted by key
        for (const [key, io] of [...this.instrumentMap].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            xml.startElement('instrument', [['id', key]])
            xml.tag('family', [['id', io.id]], io.name)
            xml.endElement()
        }

        let section = ''
        for (const sg of this.groups) {
            if (sg.section !== section) {
                if (section) {
                    xml.endElement()
                }
                if (sg.section) {
                    xml.startElement('section', [['id', sg.section],
                        ['brackets', sg.bracket ? 'true' : 'false'],
                        ['barLineSpan', sg.barLineSpan ? 'true' : 'false'],
                        ['thinBrackets', sg.thinBracket ? 'true' : 'false']])
                }
                section = sg.section
            }
            if (sg.family === SOLOISTS_ID) {
                xml.tag('soloists')
            } else if (sg.notUnsorted) {
                xml.tag('family', sg.family)
            } else if (!sg.unsorted) {
                xml.tag('unsorted')
            } else {
                xml.tag('unsorted', [['group', sg.unsorted]])
            }
        }
        if (section) {
            xml.endElement()
        }
        xml.endElement()
    }
}
