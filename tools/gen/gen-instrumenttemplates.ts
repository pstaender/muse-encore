/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Generates src/engraving/dom/instrtemplatedata.ts from share/instruments/instruments.xml: the genres, families,
 * instrument groups and instrument templates. Reads the file like loadInstrumentTemplates / InstrumentGroup::read /
 * InstrumentTemplate::read (src/engraving/dom/instrtemplate.cpp), in the same order.
 * Not generated: MIDI actions and articulations, channel data other than name/bank/program (no playback).
 * <Drum>, <percussionPanelColumns> and <StringData> are stored as xml and read at runtime by the engraving readers.
 *
 * usage: tsx tools/gen/gen-instrumenttemplates.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XmlReader, toXmlEscaped } from '../../src/engraving/rw/xmlreader'
import { StaffType } from '../../src/engraving/dom/stafftype'
import { StaffGroup } from '../../src/engraving/types/types'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-instrumenttemplates.ts <MuseScore source dir>')
    process.exit(1)
}

// the staff type presets (lines of tablature presets etc.); C++ StaffType::initStaffTypes()
StaffType.readTabConfig(readFileSync('fonts/fonts_tablature.xml'))

const MAX_STAVES = 4
const MIN_PITCH = 0
const MAX_PITCH = 127

interface Channel { name: string; bank: number; program: number }
interface Template {
    id: string
    soundId: string
    trackName: string
    longNames: { pos: number; name: string }[]
    shortNames: { pos: number; name: string }[]
    musicXmlId: string
    description: string
    staffCount: number
    sequenceOrder: number
    trait: { type: string; name: string; isDefault: boolean; isHiddenOnScore: boolean }
    minPitchA: number
    maxPitchA: number
    minPitchP: number
    maxPitchP: number
    transposeDiatonic: number
    transposeChromatic: number
    staffGroup: string // 'standard' | 'percussion' | 'tablature'
    staffTypePreset: string // xml name, '' = none
    useDrumset: boolean
    drumset: string[] | null // xml of <Drum> / <percussionPanelColumns> elements
    stringData: string // xml of <StringData>
    channels: Channel[]
    genres: string[]
    family: string
    clefs: [string, string][] // concert, transposing (xml names)
    staffLines: number[]
    bracket: number[]
    bracketSpan: number[]
    barlineSpan: boolean[]
    smallStaff: boolean[]
    extended: boolean
    singleNoteDynamics: boolean
    groupId: string
    glissandoStyle: string
}

const genres: { id: string; name: string }[] = []
const families: { id: string; name: string }[] = []
const groups: { id: string; name: string; extended: boolean; templates: Template[] }[] = []

function newTemplate(): Template {
    return {
        id: '', soundId: '', trackName: '', longNames: [], shortNames: [], musicXmlId: '', description: '', staffCount: 1,
        sequenceOrder: 0, trait: { type: '', name: '', isDefault: false, isHiddenOnScore: false },
        minPitchA: MIN_PITCH, maxPitchA: MAX_PITCH, minPitchP: MIN_PITCH, maxPitchP: MAX_PITCH,
        transposeDiatonic: 0, transposeChromatic: 0, staffGroup: 'standard', staffTypePreset: '', useDrumset: false,
        drumset: null, stringData: '', channels: [], genres: [], family: '',
        clefs: Array.from({ length: MAX_STAVES }, () => ['G', 'G'] as [string, string]),
        staffLines: Array(MAX_STAVES).fill(5), bracket: Array(MAX_STAVES).fill(-1), bracketSpan: Array(MAX_STAVES).fill(0),
        barlineSpan: Array(MAX_STAVES).fill(false), smallStaff: Array(MAX_STAVES).fill(false),
        extended: false, singleNoteDynamics: true, groupId: '', glissandoStyle: 'chromatic',
    }
}

// InstrumentTemplate::init (copy constructor); midiArticulations are not copied in C++ either
function copyTemplate(t: Template): Template {
    return structuredClone(t)
}

function searchTemplate(id: string): Template | undefined {
    for (const g of groups) {
        const t = g.templates.find(t => t.id === id)
        if (t) {
            return t
        }
    }
    return undefined
}

function readStaffIdx(e: XmlReader): number {
    return Math.max(0, Math.min(MAX_STAVES - 1, e.intAttribute('staff', 1) - 1))
}

function traitType(s: string): string {
    const t = s.toLowerCase()
    return t === 'transposition' || t === 'tuning' || t === 'course' ? t : 'unknown'
}

// InstrumentTemplate::setPitchRange
function pitchRange(s: string): [number, number] {
    const sl = s.split('-')
    return sl.length !== 2 ? [MIN_PITCH, MAX_PITCH] : [parseInt(sl[0], 10) || 0, parseInt(sl[1], 10) || 0]
}

function attrs(e: XmlReader): string {
    return e.attributes().map(a => ` ${a.name}="${toXmlEscaped(a.value)}"`).join('')
}

/** the current element as xml */
function outerXml(e: XmlReader): string {
    const tag = e.name()
    const a = attrs(e)
    return `<${tag}${a}>${e.readXml()}</${tag}>`
}

// TRead::read(InstrChannel*): only name, bank and program
function readChannel(e: XmlReader): Channel {
    const c: Channel = { name: e.attribute('name') || 'normal', bank: 0, program: -1 }
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'program') {
            c.program = e.intAttribute('value', -1)
            if (c.program === -1) {
                c.program = e.readInt()
            } else {
                e.skipCurrentElement()
            }
        } else if (tag === 'controller') {
            const value = e.intAttribute('value', 0)
            const ctrl = e.intAttribute('ctrl', 0)
            if (ctrl === 0) { // CTRL_HBANK
                c.bank = (value << 7) + (c.bank & 0x7f)
            } else if (ctrl === 32) { // CTRL_LBANK
                c.bank = (c.bank & ~0x7f) + (value & 0x7f)
            }
            e.skipCurrentElement()
        } else {
            e.skipCurrentElement()
        }
    }
    return c
}

const groupNames = new Map<string, string>()

// InstrumentTemplate::read
function readTemplate(t: Template, e: XmlReader): void {
    t.id = e.attribute('id')
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'soundId') {
            t.soundId = e.readText()
        } else if (tag === 'longName' || tag === 'name' || tag === 'shortName' || tag === 'short-name') {
            const list = tag === 'longName' || tag === 'name' ? t.longNames : t.shortNames
            const pos = e.intAttribute('pos', 0)
            const i = list.findIndex(n => n.pos === pos)
            if (i >= 0) {
                list.splice(i, 1)
            }
            list.push({ pos, name: e.readText() })
        } else if (tag === 'trackName') {
            t.trackName = e.readText()
        } else if (tag === 'description') {
            t.description = e.readText()
        } else if (tag === 'extended') {
            t.extended = e.readInt() !== 0
        } else if (tag === 'staves') {
            t.staffCount = e.readInt()
            t.bracketSpan[0] = t.staffCount
        } else if (tag === 'clef') { // sets both transposing and concert clef
            const idx = readStaffIdx(e)
            const ct = e.readText()
            t.clefs[idx] = [ct, ct]
        } else if (tag === 'concertClef') {
            const idx = readStaffIdx(e)
            t.clefs[idx][0] = e.readText()
        } else if (tag === 'transposingClef') {
            const idx = readStaffIdx(e)
            t.clefs[idx][1] = e.readText()
        } else if (tag === 'stafflines') {
            const idx = readStaffIdx(e)
            t.staffLines[idx] = e.readInt()
        } else if (tag === 'smallStaff') {
            const idx = readStaffIdx(e)
            t.smallStaff[idx] = e.readInt() !== 0
        } else if (tag === 'bracket') {
            const idx = readStaffIdx(e)
            t.bracket[idx] = e.readInt()
        } else if (tag === 'bracketSpan') {
            const idx = readStaffIdx(e)
            t.bracketSpan[idx] = e.readInt()
        } else if (tag === 'barlineSpan') {
            const idx = readStaffIdx(e)
            const span = e.readInt()
            for (let i = 0; i < span - 1; ++i) {
                t.barlineSpan[idx + i] = true
            }
        } else if (tag === 'aPitchRange') {
            [t.minPitchA, t.maxPitchA] = pitchRange(e.readText())
        } else if (tag === 'pPitchRange') {
            [t.minPitchP, t.maxPitchP] = pitchRange(e.readText())
        } else if (tag === 'transposition') { // obsolete
            throw new Error('obsolete <transposition> is not supported by the generator')
        } else if (tag === 'transposeChromatic') {
            t.transposeChromatic = e.readInt()
        } else if (tag === 'transposeDiatonic') {
            t.transposeDiatonic = e.readInt()
        } else if (tag === 'traitName') {
            const type = traitType(e.attribute('type'))
            const traitName = e.readText()
            t.trait = {
                type,
                isDefault: traitName.includes('*'),
                isHiddenOnScore: traitName.includes('(') && traitName.includes(')'),
                name: traitName.replace(/[*()]/g, ''),
            }
        } else if (tag === 'StringData') {
            t.stringData = outerXml(e)
        } else if (tag === 'drumset') {
            t.useDrumset = e.readInt() !== 0
        } else if (tag === 'Drum' || tag === 'percussionPanelColumns') {
            // if we see one of these tags, a custom drumset will be created
            t.drumset ??= []
            t.drumset.push(outerXml(e))
        } else if (tag === 'Channel' || tag === 'channel') {
            t.channels.push(readChannel(e))
        } else if (tag === 'stafftype') {
            const staffIdx = readStaffIdx(e)
            const xmlPresetName = e.attribute('staffTypePreset')
            const stfGroup = e.readText()
            const group = stfGroup === 'percussion' ? StaffGroup.PERCUSSION : stfGroup === 'tablature' ? StaffGroup.TAB : StaffGroup.STANDARD
            t.staffGroup = group === StaffGroup.PERCUSSION ? 'percussion' : group === StaffGroup.TAB ? 'tablature' : 'standard'
            let preset = xmlPresetName ? StaffType.presetFromXmlName(xmlPresetName) : null
            if (!preset || preset.group() !== group) {
                preset = StaffType.getDefaultPreset(group)
            }
            t.staffTypePreset = preset.xmlName()
            t.staffLines[staffIdx] = preset.lines()
        } else if (tag === 'init') {
            const ttt = searchTemplate(e.readText())
            if (ttt) {
                const id = t.id
                Object.assign(t, copyTemplate(ttt))
                t.id = id
            }
        } else if (tag === 'musicXMLid') {
            t.musicXmlId = e.readText()
        } else if (tag === 'family') {
            const f = e.readText()
            t.family = families.some(fam => fam.id === f) ? f : '' // searchInstrumentFamily
        } else if (tag === 'genre') {
            const g = e.readText()
            if (genres.some(ig => ig.id === g)) { // linkGenre
                t.genres.push(g)
            }
        } else if (tag === 'singleNoteDynamics') {
            const v = e.readText().trim() // XmlReader::readBool
            t.singleNoteDynamics = v === 'true' || (parseInt(v, 10) || 0) !== 0
        } else if (tag === 'glissandoStyle') {
            t.glissandoStyle = e.readText()
        } else {
            e.skipCurrentElement() // MidiAction, Articulation: not used by the engraving
        }
    }
    if (t.channels.length === 0) {
        t.channels.push({ name: 'normal', bank: 0, program: 0 })
    }
    if (!t.trackName && t.longNames.length) {
        t.trackName = t.longNames[0].name
    }
    if (!t.description && t.longNames.length) {
        t.description = t.longNames[0].name
    }
    if (!t.id) {
        t.id = t.trackName.toLowerCase().replaceAll(' ', '-')
    }
}

function readNamed(e: XmlReader, list: { id: string; name: string }[]): void {
    const id = e.attribute('id')
    let item = list.find(i => i.id === id)
    if (!item) {
        item = { id, name: '' }
        list.push(item)
    }
    while (e.readNextStartElement()) {
        if (e.name() === 'name') {
            item.name = e.readText()
        } else {
            e.skipCurrentElement()
        }
    }
}

const e = new XmlReader(readFileSync(join(src, 'share/instruments/instruments.xml'), 'utf8'))
while (e.readNextStartElement()) {
    if (e.name() !== 'museScore') {
        e.skipCurrentElement()
        continue
    }
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'instrument-group' || tag === 'InstrumentGroup') {
            // InstrumentGroup::read
            const gid = e.attribute('id')
            let group = groups.find(g => g.id === gid)
            if (!group) {
                group = { id: gid, name: '', extended: false, templates: [] }
                groups.push(group)
            }
            group.name = e.attribute('name')
            group.extended = e.intAttribute('extended', 0) !== 0
            while (e.readNextStartElement()) {
                const t2 = e.name()
                if (t2 === 'instrument' || t2 === 'Instrument') {
                    let t = searchTemplate(e.attribute('id'))
                    if (!t) {
                        t = newTemplate()
                        t.sequenceOrder = group.templates.length
                        group.templates.push(t)
                    }
                    readTemplate(t, e)
                } else if (t2 === 'ref') {
                    const ttt = searchTemplate(e.readText())
                    if (ttt) {
                        group.templates.push(copyTemplate(ttt))
                    }
                } else if (t2 === 'name') {
                    group.name = e.readText()
                } else if (t2 === 'extended') {
                    group.extended = e.readInt() !== 0
                } else {
                    e.skipCurrentElement()
                }
            }
            if (!group.id) {
                group.id = group.name.toLowerCase().replaceAll(' ', '-')
            }
            for (const t of group.templates) {
                t.groupId = group.id
            }
            groupNames.set(group.id, group.name)
        } else if (tag === 'Genre') {
            readNamed(e, genres)
        } else if (tag === 'Family') {
            readNamed(e, families)
        } else {
            e.skipCurrentElement()
        }
    }
}

const SAME = (a: unknown[], v: unknown): boolean => a.every(x => x === v)

// one object per template; values equal to the InstrumentTemplate defaults are left out
function templateData(t: Template): Record<string, unknown> {
    const d: Record<string, unknown> = { id: t.id }
    if (t.soundId) { d.soundId = t.soundId }
    d.trackName = t.trackName
    d.longNames = t.longNames.map(n => n.pos ? [n.name, n.pos] : [n.name])
    d.shortNames = t.shortNames.map(n => n.pos ? [n.name, n.pos] : [n.name])
    if (t.musicXmlId) { d.musicXmlId = t.musicXmlId }
    d.description = t.description
    if (t.staffCount !== 1) { d.staffCount = t.staffCount }
    d.sequenceOrder = t.sequenceOrder
    if (t.trait.type) { d.trait = [t.trait.type, t.trait.name, t.trait.isDefault ? 1 : 0, t.trait.isHiddenOnScore ? 1 : 0] }
    d.pitchRange = [t.minPitchA, t.maxPitchA, t.minPitchP, t.maxPitchP]
    if (t.transposeDiatonic || t.transposeChromatic) { d.transpose = [t.transposeDiatonic, t.transposeChromatic] }
    if (t.staffGroup !== 'standard') { d.staffGroup = t.staffGroup }
    if (t.staffTypePreset) { d.staffTypePreset = t.staffTypePreset }
    if (t.useDrumset) { d.useDrumset = 1 }
    if (t.drumset) { d.drumset = t.drumset }
    if (t.stringData) { d.stringData = t.stringData }
    d.channels = t.channels.map(c => [c.name, c.bank, c.program])
    if (t.genres.length) { d.genres = t.genres }
    if (t.family) { d.family = t.family }
    if (!t.clefs.every(c => c[0] === 'G' && c[1] === 'G')) { d.clefs = t.clefs }
    if (!SAME(t.staffLines, 5)) { d.staffLines = t.staffLines }
    if (!SAME(t.bracket, -1)) { d.bracket = t.bracket }
    if (!SAME(t.bracketSpan, 0)) { d.bracketSpan = t.bracketSpan }
    if (!SAME(t.barlineSpan, false)) { d.barlineSpan = t.barlineSpan.map(b => b ? 1 : 0) }
    if (!SAME(t.smallStaff, false)) { d.smallStaff = t.smallStaff.map(b => b ? 1 : 0) }
    if (t.extended) { d.extended = 1 }
    if (!t.singleNoteDynamics) { d.singleNoteDynamics = 0 }
    if (t.glissandoStyle !== 'chromatic') { d.glissandoStyle = t.glissandoStyle }
    return d
}

const count = groups.reduce((n, g) => n + g.templates.length, 0)
writeFileSync('src/engraving/dom/instrtemplatedata.ts', `/*
 * SPDX-License-Identifier: GPL-3.0-only
 * GENERATED by tools/gen/gen-instrumenttemplates.ts from share/instruments/instruments.xml - do not edit
 */

/** an instrument template; left out values have the InstrumentTemplate defaults */
export interface InstrumentTemplateData {
    id: string
    soundId?: string
    trackName: string
    /** [name, pos?] */
    longNames: [string, number?][]
    shortNames: [string, number?][]
    musicXmlId?: string
    description: string
    staffCount?: number
    sequenceOrder: number
    /** [type, name, isDefault, isHiddenOnScore] */
    trait?: [string, string, number, number]
    /** [minPitchA, maxPitchA, minPitchP, maxPitchP] */
    pitchRange: [number, number, number, number]
    /** [diatonic, chromatic] */
    transpose?: [number, number]
    staffGroup?: 'percussion' | 'tablature'
    /** xml name of the staff type preset */
    staffTypePreset?: string
    useDrumset?: number
    /** xml of the <Drum> and <percussionPanelColumns> elements of a custom drumset */
    drumset?: string[]
    /** xml of the <StringData> element */
    stringData?: string
    /** [name, bank, program] */
    channels: [string, number, number][]
    genres?: string[]
    family?: string
    /** per staff (MAX_STAVES): [concert clef, transposing clef] (xml names) */
    clefs?: [string, string][]
    staffLines?: number[]
    /** BracketType values */
    bracket?: number[]
    bracketSpan?: number[]
    barlineSpan?: number[]
    smallStaff?: number[]
    extended?: number
    singleNoteDynamics?: number
    glissandoStyle?: string
}

/** [id, name] in the order of instruments.xml */
export const INSTRUMENT_GENRE_DATA: readonly (readonly [string, string])[] = ${JSON.stringify(genres.map(g => [g.id, g.name]))}

/** [id, name] in the order of instruments.xml */
export const INSTRUMENT_FAMILY_DATA: readonly (readonly [string, string])[] = ${JSON.stringify(families.map(f => [f.id, f.name]))}

/** instrument groups (${groups.length}) with their templates (${count}) in the order of instruments.xml */
export const INSTRUMENT_GROUP_DATA: readonly { id: string; name: string; extended: boolean; templates: readonly InstrumentTemplateData[] }[] = [
${groups.map(g => `    { id: ${JSON.stringify(g.id)}, name: ${JSON.stringify(g.name)}, extended: ${g.extended}, templates: [
${g.templates.map(t => `        ${JSON.stringify(templateData(t))},`).join('\n')}
    ] },`).join('\n')}
]
`)
console.log(`${count} instrument templates in ${groups.length} groups, ${genres.length} genres, ${families.length} families`)
