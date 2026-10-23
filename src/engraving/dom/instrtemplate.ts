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
import { StaffName, Trait, TraitType, type Instrument, type MidiArticulation, type StaffNameList } from './instrument'

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

/** C++ defaultClef(int program) */
export function defaultClef(program: number): ClefType {
    if (program >= 24 && program < 32) { // this are guitars
        return ClefType.G8_VB
    } else if (program >= 32 && program < 40) { // this is bass
        return ClefType.F8_VB
    }

    for (const g of instrumentGroups()) {
        for (const it of g.instrumentTemplates) {
            if (it.channel.length && it.channel[0].bank === 0 && it.channel[0].program === program) {
                return it.clefTypes[0].concertClef
            }
        }
    }
    return ClefType.G
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

/** C++ global midiArticulations (the articulations of instruments.xml) */
export function midiArticulations(): MidiArticulation[] {
    return MIDI_ARTICULATION_DATA.map(([name, velocity, gateTime]) => ({ name, descr: '', velocity, gateTime }))
}

/** muse::strings::levenshteinDistance (on the UTF-8 bytes) */
function levenshteinDistance(str1: string, str2: string): number {
    const s1 = new TextEncoder().encode(str1)
    const s2 = new TextEncoder().encode(str2)
    const N1 = s1.length
    const N2 = s2.length
    const V: number[] = []
    for (let i = 0; i <= N2; i++) {
        V[i] = i
    }
    for (let i = 0; i < N1; i++) {
        V[0] = i + 1
        let corner = i
        for (let j = 0; j < N2; j++) {
            const upper = V[j + 1]
            if (s1[i] === s2[j]) {
                V[j + 1] = corner
            } else {
                V[j + 1] = Math.min(V[j], Math.min(upper, corner)) + 1
            }
            corner = upper
        }
    }
    return V[N2]
}

/** C++ combinedTemplateSearch: the template best matching the instrument's names, MusicXML id, MIDI program and transposition */
export function combinedTemplateSearch(instrument: Instrument): InstrumentTemplate | null {
    const channel = instrument.channel(0)!
    const bank = channel.bank()
    const program = channel.program()
    const transposeChromatic = instrument.transpose().chromatic
    const transposeKey = (transposeChromatic % 12) + (transposeChromatic < 0 ? 12 : 0) // 0=C, 1=C#/Db, 2=D...
    const trackName = instrument.trackName()
    const traitName = instrument.trait().name
    let musicXmlId = instrument.musicXmlId()

    if (!musicXmlId && !trackName && bank === 0 && program === -1) {
        return null // Not enough information to find a matching template.
    }

    if (!musicXmlId) {
        if (trackName.toLowerCase().includes('drum')) {
            musicXmlId = 'drum.group.set'
        } else if (trackName === 'MusicXML Part' || trackName.toLowerCase().includes('piano')) {
            musicXmlId = 'keyboard.piano'
        }
    } else {
        // Workaround for old generic instrument templates.
        if ((musicXmlId === 'wind.reed.clarinet' || musicXmlId === 'brass.trumpet')
            && (traitName === 'B♭' || transposeKey === 10)) {
            musicXmlId += '.bflat'
        }
    }

    const TRACK_NAME_WEIGHT = 128
    const LONG_NAME_WEIGHT = 64
    const SHORT_NAME_WEIGHT = 16 // Not standardized outside MuseScore.
    const TRAIT_NAME_WEIGHT = 4 // More reliable than transposition interval.
    const MUSICXML_ID_WEIGHT = 32 // Not unique. Newer, more specialist IDs aren't in old files.
    const MIDI_WEIGHT = 8 // Standardization limited to General MIDI Level 2.
    const TRANSPOSITION_KEY_WEIGHT = 2 // Unreliable (e.g. in concert-pitch MusicXML).
    const TRANSPOSITION_OCTAVE_WEIGHT = 1
    const MIN_MATCH_STRENGTH = MIDI_WEIGHT
    const INITIAL_LEVENSHTEIN_DISTANCE = Number.MAX_SAFE_INTEGER

    const containsName = (list: readonly StaffName[], sn: StaffName): boolean =>
        list.some(n => n.pos() === sn.pos() && n.name() === sn.name())

    let bestMatch: InstrumentTemplate | null = null
    let bestMatchStrength = MIN_MATCH_STRENGTH
    let bestMatchLevDist = INITIAL_LEVENSHTEIN_DISTANCE

    for (const group of instrumentGroups()) {
        for (const templ of group.instrumentTemplates) {
            if (templ.trait.name === '[hide]') {
                continue
            }

            let matchStrength = 0

            if (trackName && trackName === templ.trackName) {
                matchStrength += TRACK_NAME_WEIGHT
            }

            for (const longStaffName of instrument.longNames()) {
                if (longStaffName.name() && containsName(templ.longNames, longStaffName)) {
                    matchStrength += LONG_NAME_WEIGHT
                    break
                }
            }

            for (const shortStaffName of instrument.shortNames()) {
                if (shortStaffName.name() && containsName(templ.shortNames, shortStaffName)) {
                    matchStrength += SHORT_NAME_WEIGHT
                    break
                }
            }

            if (traitName && traitName === templ.trait.name) {
                matchStrength += TRAIT_NAME_WEIGHT
            }

            if (musicXmlId && musicXmlId === templ.musicXmlId) {
                matchStrength += MUSICXML_ID_WEIGHT
            }

            for (const templChannel of templ.channel) {
                if (bank === templChannel.bank && program === templChannel.program) {
                    matchStrength += MIDI_WEIGHT
                    break
                }
            }

            const chromaticDiff = Math.abs(transposeChromatic - templ.transpose.chromatic)

            if (chromaticDiff % 12 === 0) { // Same key.
                matchStrength += TRANSPOSITION_KEY_WEIGHT
            }

            if (chromaticDiff < 12) { // Same octave.
                matchStrength += TRANSPOSITION_OCTAVE_WEIGHT
            }

            if (matchStrength < bestMatchStrength) {
                continue // Keep looking.
            }

            if (matchStrength > bestMatchStrength) {
                bestMatch = templ
                bestMatchStrength = matchStrength
                bestMatchLevDist = INITIAL_LEVENSHTEIN_DISTANCE // Reset.
            }

            // Find smallest lev. dist. among templates with match strength equal to best.
            let levDist = INITIAL_LEVENSHTEIN_DISTANCE

            if (trackName) {
                levDist = levenshteinDistance(trackName, templ.trackName)
            }

            for (const longStaffName of instrument.longNames()) {
                const longName = longStaffName.name()
                if (!longName) {
                    continue
                }
                for (const templLongStaffName of templ.longNames) {
                    const templLongName = templLongStaffName.name()
                    if (!templLongName) {
                        continue
                    }
                    levDist = Math.min(levDist, levenshteinDistance(longName, templLongName))
                }
            }

            if (levDist < bestMatchLevDist) {
                bestMatch = templ
                bestMatchLevDist = levDist
            }
        }
    }

    return bestMatch
}
