/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrtemplate.h/.cpp: the instrument templates of share/instruments/instruments.xml
 * (generated into instrtemplatedata.ts by tools/gen/gen-instrumenttemplates.ts; C++ loadInstrumentTemplates()
 * reads the xml files at startup) and the score orders of orders.xml (scoreorderdata.ts).
 * TODO(port): MIDI actions (instruments.xml has none), user instrument files, translations of the names
 */

import { BracketType, ClefType, GlissandoStyle, StaffGroup, type staff_idx_t } from '../types/types'
import { TConv } from '../types/typesconv'
import { ClefTypeList } from './clefinfo'
import { Drumset, smDrumset } from './drumset'
import { Interval } from './interval'
import { StaffName, Trait, TraitType, type MidiArticulation, type StaffNameList } from './instrument'

export { Trait, TraitType }
import { StaffType } from './stafftype'
import { StringData } from './stringdata'
import { ScoreOrder } from './scoreorder'
import { INSTRUMENT_FAMILY_DATA, INSTRUMENT_GENRE_DATA, INSTRUMENT_GROUP_DATA, MIDI_ARTICULATION_DATA, type InstrumentTemplateData } from './instrtemplatedata'
import { SCORE_ORDERS_XML } from './scoreorderdata'
import { XmlReader } from '../rw/xmlreader'
import { TRead } from '../rw/read460/tread'

export const MAX_STAVES = 4
const MIN_PITCH = 0
const MAX_PITCH = 127

/** C++ InstrChannel of a template: only name, bank and program (no playback) */
export interface TemplateChannel {
    name: string
    bank: number
    program: number
}

export class InstrumentGenre {
    id = ''
    name = ''
}

export class InstrumentFamily {
    id = ''
    name = ''
}

export class InstrumentTemplate {
    id = ''
    soundId = ''
    trackName = ''
    longNames: StaffNameList = [] // shown on first system
    shortNames: StaffNameList = [] // shown on followup systems
    musicXmlId = '' // used in MusicXML 3.0
    description = '' // a longer description of the instrument

    staffCount = 1
    sequenceOrder = 0

    trait = new Trait()

    minPitchA = MIN_PITCH // pitch range playable by an amateur
    maxPitchA = MAX_PITCH
    minPitchP = MIN_PITCH // pitch range playable by professional
    maxPitchP = MAX_PITCH

    transpose = new Interval() // for transposing instruments

    staffGroup = StaffGroup.STANDARD
    /** the xml name of the preset; the presets need the tablature fonts, so it is looked up when needed */
    staffTypePresetName = ''
    get staffTypePreset(): StaffType | null {
        return this.staffTypePresetName ? StaffType.presetFromXmlName(this.staffTypePresetName) : null
    }

    useDrumset = false
    drumset: Drumset | null = null

    stringData = new StringData()

    channel: TemplateChannel[] = []
    midiArticulations: MidiArticulation[] = []
    genres: InstrumentGenre[] = [] // list of genres this instrument belongs to
    family: InstrumentFamily | null = null // family the instrument belongs to

    clefTypes: ClefTypeList[] = Array.from({ length: MAX_STAVES }, () => new ClefTypeList(ClefType.G, ClefType.G))
    staffLines: number[] = Array<number>(MAX_STAVES).fill(5)
    bracket: BracketType[] = Array<BracketType>(MAX_STAVES).fill(BracketType.NO_BRACKET)
    bracketSpan: number[] = Array<number>(MAX_STAVES).fill(0)
    barlineSpan: boolean[] = Array<boolean>(MAX_STAVES).fill(false)
    smallStaff: boolean[] = Array<boolean>(MAX_STAVES).fill(false)

    extended = false // belongs to extended instrument set if true
    singleNoteDynamics = true

    groupId = ''

    glissandoStyle = GlissandoStyle.CHROMATIC

    isValid(): boolean { return this.id.length > 0 }

    clefType(staffIdx: staff_idx_t): ClefTypeList {
        if (staffIdx < this.staffCount) {
            return this.clefTypes[staffIdx]
        }
        return this.clefTypes[0]
    }

    familyId(): string { return this.family ? this.family.id : '' }

    containsGenre(genreId: string): boolean {
        return this.genres.some(g => g.id === genreId)
    }

    /** the generated data of InstrumentTemplate::read() */
    static fromData(d: InstrumentTemplateData, groupId: string): InstrumentTemplate {
        const t = new InstrumentTemplate()
        t.id = d.id
        t.soundId = d.soundId ?? ''
        t.trackName = d.trackName
        t.longNames = d.longNames.map(([name, pos]) => new StaffName(name, pos ?? 0))
        t.shortNames = d.shortNames.map(([name, pos]) => new StaffName(name, pos ?? 0))
        t.musicXmlId = d.musicXmlId ?? ''
        t.description = d.description
        t.staffCount = d.staffCount ?? 1
        t.sequenceOrder = d.sequenceOrder
        if (d.trait) {
            const [type, name, isDefault, isHiddenOnScore] = d.trait
            t.trait.type = type === 'transposition' ? TraitType.Transposition : type === 'tuning' ? TraitType.Tuning
                : type === 'course' ? TraitType.Course : TraitType.Unknown
            t.trait.name = name
            t.trait.isDefault = isDefault !== 0
            t.trait.isHiddenOnScore = isHiddenOnScore !== 0
        }
        [t.minPitchA, t.maxPitchA, t.minPitchP, t.maxPitchP] = d.pitchRange
        if (d.transpose) {
            t.transpose = new Interval(d.transpose[0], d.transpose[1])
        }
        t.staffGroup = d.staffGroup === 'percussion' ? StaffGroup.PERCUSSION : d.staffGroup === 'tablature' ? StaffGroup.TAB : StaffGroup.STANDARD
        t.staffTypePresetName = d.staffTypePreset ?? ''
        t.useDrumset = !!d.useDrumset
        if (d.drumset) {
            // if we see one of these tags, a custom drumset will be created
            t.drumset = smDrumset().clone()
            t.drumset.clear()
            for (const xml of d.drumset) {
                const e = new XmlReader(xml)
                e.readNextStartElement()
                if (e.name() === 'Drum') {
                    t.drumset.loadDrum(e)
                } else {
                    t.drumset.setPercussionPanelColumns(e.readInt())
                }
            }
        }
        if (d.stringData) {
            const e = new XmlReader(d.stringData)
            e.readNextStartElement()
            TRead.readStringData(t.stringData, e)
        }
        t.channel = d.channels.map(([name, bank, program]) => ({ name, bank, program }))
        t.midiArticulations = (d.midiArticulations ?? MIDI_ARTICULATION_DATA).map(([name, velocity, gateTime]) => ({ name, descr: '', velocity, gateTime }))
        t.genres = (d.genres ?? []).map(id => searchInstrumentGenre(id)!).filter(g => g)
        t.family = d.family ? searchInstrumentFamily(d.family) : null
        if (d.clefs) {
            t.clefTypes = d.clefs.map(([c, tc]) => new ClefTypeList(TConv.fromXmlClefType(c, ClefType.G), TConv.fromXmlClefType(tc, ClefType.G)))
        }
        if (d.staffLines) {
            t.staffLines = [...d.staffLines]
        }
        if (d.bracket) {
            t.bracket = d.bracket.map(b => b as BracketType)
        }
        if (d.bracketSpan) {
            t.bracketSpan = [...d.bracketSpan]
        }
        if (d.barlineSpan) {
            t.barlineSpan = d.barlineSpan.map(b => b !== 0)
        }
        if (d.smallStaff) {
            t.smallStaff = d.smallStaff.map(b => b !== 0)
        }
        t.extended = !!d.extended
        t.singleNoteDynamics = d.singleNoteDynamics !== 0
        t.groupId = groupId
        if (d.glissandoStyle) {
            t.glissandoStyle = TConv.fromXmlGlissandoStyle(d.glissandoStyle, GlissandoStyle.CHROMATIC)
        }
        return t
    }
}

export class InstrumentGroup {
    id = ''
    name = ''
    extended = false // belongs to extended instruments set if true
    instrumentTemplates: InstrumentTemplate[] = []
}

export class InstrumentIndex {
    templateCount = 0

    constructor(public groupIndex: number, public instrIndex: number, public instrTemplate: InstrumentTemplate | null) {
        for (const ig of instrumentGroups()) {
            this.templateCount += ig.instrumentTemplates.length
        }
    }
}

let s_genres: InstrumentGenre[] | null = null
let s_families: InstrumentFamily[] | null = null
let s_groups: InstrumentGroup[] | null = null
let s_orders: ScoreOrder[] | null = null
let s_templates: InstrumentTemplate[] | null = null

/** C++ global instrumentGenres */
export function instrumentGenres(): readonly InstrumentGenre[] {
    s_genres ??= INSTRUMENT_GENRE_DATA.map(([id, name]) => Object.assign(new InstrumentGenre(), { id, name }))
    return s_genres
}

/** C++ global instrumentFamilies */
export function instrumentFamilies(): readonly InstrumentFamily[] {
    s_families ??= INSTRUMENT_FAMILY_DATA.map(([id, name]) => Object.assign(new InstrumentFamily(), { id, name }))
    return s_families
}

/** C++ global instrumentGroups (loadInstrumentTemplates of instruments.xml) */
export function instrumentGroups(): readonly InstrumentGroup[] {
    if (!s_groups) {
        const groups: InstrumentGroup[] = []
        for (const gd of INSTRUMENT_GROUP_DATA) {
            const g = new InstrumentGroup()
            g.id = gd.id
            g.name = gd.name
            g.extended = gd.extended
            g.instrumentTemplates = gd.templates.map(td => InstrumentTemplate.fromData(td, gd.id))
            groups.push(g)
        }
        s_groups = groups
    }
    return s_groups
}

/** C++ global instrumentOrders (loadInstrumentTemplates of orders.xml) */
export function instrumentOrders(): readonly ScoreOrder[] {
    if (!s_orders) {
        s_orders = []
        const e = new XmlReader(SCORE_ORDERS_XML)
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                while (e.readNextStartElement()) {
                    if (e.name() === 'Order') {
                        const order = new ScoreOrder()
                        order.read(e)
                        s_orders.push(order)
                    } else {
                        e.unknown()
                    }
                }
            }
        }
    }
    return s_orders
}

/** all templates in the order of the groups */
export function instrumentTemplates(): readonly InstrumentTemplate[] {
    s_templates ??= instrumentGroups().flatMap(g => g.instrumentTemplates)
    return s_templates
}

export function searchInstrumentGenre(id: string): InstrumentGenre | null {
    return instrumentGenres().find(ig => ig.id === id) ?? null
}

function searchInstrumentFamily(name: string): InstrumentFamily | null {
    return instrumentFamilies().find(fam => fam.id === name) ?? null
}

export function searchTemplate(name: string): InstrumentTemplate | null {
    for (const g of instrumentGroups()) {
        for (const it of g.instrumentTemplates) {
            if (it.id === name) {
                return it
            }
        }
    }
    return null
}

export function searchTemplateForMusicXmlId(mxmlId: string): InstrumentTemplate | null {
    return instrumentTemplates().find(it => it.musicXmlId === mxmlId) ?? null
}

export function searchTemplateForInstrNameList(nameList: readonly string[], useDrumset: boolean, caseSensitive = true): InstrumentTemplate | null {
    let bestMatch: InstrumentTemplate | null = null // default if no matches
    let bestMatchStrength = 0 // higher for better matches

    for (const name of nameList) {
        if (!name) {
            continue
        }
        const stringEqualsName = caseSensitive
            ? (s: string): boolean => s === name
            : (s: string): boolean => s.toLowerCase() === name.toLowerCase()
        const staffNameEqualsName = (sn: StaffName): boolean => stringEqualsName(sn.name())

        outer: for (const g of instrumentGroups()) {
            for (const it of g.instrumentTemplates) {
                if (it.useDrumset !== useDrumset) {
                    continue
                }
                const matchStrength = 0
                    + (4 * (stringEqualsName(it.trackName) ? 1 : 0)) // most weight to track name since there are fewer duplicates
                    + (2 * (it.longNames.some(staffNameEqualsName) ? 1 : 0))
                    + (1 * (it.shortNames.some(staffNameEqualsName) ? 1 : 0)) // least weight to short name
                const perfectMatchStrength = 7
                if (matchStrength > bestMatchStrength) {
                    bestMatch = it
                    bestMatchStrength = matchStrength
                    if (bestMatchStrength === perfectMatchStrength) {
                        break outer // stop looking for matches
                    }
                }
            }
        }
    }

    if (!bestMatch) {
        for (const name of nameList) {
            if (/drum ?(set|kit)/i.test(name)) {
                return searchTemplate('drumset') // Large Drum Kit
            }
            if (/drum|percussion/i.test(name)) {
                return searchTemplate('percussion-synthesizer') // General MIDI percussion
            }
            if (/piano/i.test(name)) {
                return searchTemplate('piano')
            }
        }
    }

    return bestMatch // null if no matches found
}

export function searchTemplateForMidiProgram(bank: number, program: number, useDrumset: boolean): InstrumentTemplate | null {
    for (const it of instrumentTemplates()) {
        if (it.useDrumset !== useDrumset) {
            continue
        }
        if (it.channel.some(c => c.bank === bank && c.program === program)) {
            return it
        }
    }
    return null
}

export function searchTemplateIndexForTrackName(trackName: string): InstrumentIndex {
    let instIndex = 0
    let grpIndex = 0
    for (const g of instrumentGroups()) {
        for (const it of g.instrumentTemplates) {
            if (it.trackName === trackName) {
                return new InstrumentIndex(grpIndex, instIndex, it)
            }
            ++instIndex
        }
        ++grpIndex
    }
    return new InstrumentIndex(-1, -1, null)
}

export function searchTemplateIndexForId(id: string): InstrumentIndex {
    let instIndex = 0
    let grpIndex = 0
    for (const g of instrumentGroups()) {
        for (const it of g.instrumentTemplates) {
            if (it.id === id) {
                return new InstrumentIndex(grpIndex, instIndex, it)
            }
            ++instIndex
        }
        ++grpIndex
    }
    return new InstrumentIndex(-1, instIndex, null)
}
