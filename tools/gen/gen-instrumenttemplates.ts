/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Generates src/engraving/dom/instrtemplatedata.ts from share/instruments/instruments.xml: the instrument templates
 * with the data that the engraving needs (family, MusicXML id, names, pitch ranges, MIDI channels for recognizing
 * instruments of old scores). Reads the file like InstrumentGroup::read / InstrumentTemplate::read
 * (src/engraving/dom/instrtemplate.cpp), in the same order.
 *
 * usage: tsx tools/gen/gen-instrumenttemplates.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XmlReader } from '../../src/engraving/rw/xmlreader'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-instrumenttemplates.ts <MuseScore source dir>')
    process.exit(1)
}

interface Channel { name: string; bank: number; program: number }
interface Template {
    id: string
    trackName: string
    longNames: { pos: number; name: string }[]
    shortNames: { pos: number; name: string }[]
    musicXmlId: string
    family: string
    useDrumset: boolean
    minPitchA: number
    maxPitchA: number
    minPitchP: number
    maxPitchP: number
    channels: Channel[]
}

const groups: { id: string; templates: Template[] }[] = []

function newTemplate(): Template {
    return {
        id: '', trackName: '', longNames: [], shortNames: [], musicXmlId: '', family: '', useDrumset: false,
        minPitchA: 0, maxPitchA: 0, minPitchP: 0, maxPitchP: 0, channels: [],
    }
}

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

// InstrumentTemplate::setPitchRange
function pitchRange(s: string): [number, number] {
    const sl = s.split('-')
    return sl.length !== 2 ? [0, 127] : [parseInt(sl[0], 10) || 0, parseInt(sl[1], 10) || 0]
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

function readTemplate(t: Template, e: XmlReader): void {
    t.id = e.attribute('id')
    while (e.readNextStartElement()) {
        const tag = e.name()
        if (tag === 'longName' || tag === 'name' || tag === 'shortName' || tag === 'short-name') {
            const list = tag === 'longName' || tag === 'name' ? t.longNames : t.shortNames
            const pos = e.intAttribute('pos', 0)
            const i = list.findIndex(n => n.pos === pos)
            if (i >= 0) {
                list.splice(i, 1)
            }
            list.push({ pos, name: e.readText() })
        } else if (tag === 'trackName') {
            t.trackName = e.readText()
        } else if (tag === 'aPitchRange') {
            [t.minPitchA, t.maxPitchA] = pitchRange(e.readText())
        } else if (tag === 'pPitchRange') {
            [t.minPitchP, t.maxPitchP] = pitchRange(e.readText())
        } else if (tag === 'drumset') {
            t.useDrumset = e.readInt() !== 0
        } else if (tag === 'Channel' || tag === 'channel') {
            t.channels.push(readChannel(e))
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
            t.family = e.readText()
        } else {
            e.skipCurrentElement()
        }
    }
    if (t.channels.length === 0) {
        t.channels.push({ name: 'normal', bank: 0, program: 0 })
    }
    if (!t.trackName && t.longNames.length) {
        t.trackName = t.longNames[0].name
    }
    if (!t.id) {
        t.id = t.trackName.toLowerCase().replaceAll(' ', '-')
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
            const gid = e.attribute('id')
            let group = groups.find(g => g.id === gid)
            if (!group) {
                group = { id: gid, templates: [] }
                groups.push(group)
            }
            while (e.readNextStartElement()) {
                const t2 = e.name()
                if (t2 === 'instrument' || t2 === 'Instrument') {
                    let t = searchTemplate(e.attribute('id'))
                    if (!t) {
                        t = newTemplate()
                        group.templates.push(t)
                    }
                    readTemplate(t, e)
                } else if (t2 === 'ref') {
                    const ttt = searchTemplate(e.readText())
                    if (ttt) {
                        group.templates.push(copyTemplate(ttt))
                    }
                } else {
                    e.skipCurrentElement()
                }
            }
        } else {
            e.skipCurrentElement()
        }
    }
}

// compact rows: [group, id, family, musicXmlId, trackName, longNames, shortNames, useDrumset, minA, maxA, minP, maxP, channels]
const rows = groups.flatMap((g, gi) => g.templates.map(t => [gi, t] as const)).map(([gi, t]) => JSON.stringify([gi,
    t.id, t.family, t.musicXmlId, t.trackName, t.longNames.map(n => n.name), t.shortNames.map(n => n.name),
    t.useDrumset ? 1 : 0, t.minPitchA, t.maxPitchA, t.minPitchP, t.maxPitchP, t.channels.map(c => [c.name, c.bank, c.program]),
]))
writeFileSync('src/engraving/dom/instrtemplatedata.ts', `/*
 * SPDX-License-Identifier: GPL-3.0-only
 * GENERATED by tools/gen/gen-instrumenttemplates.ts from share/instruments/instruments.xml - do not edit
 */

/**
 * instrument templates in the order of instruments.xml (groups, then templates):
 * [group index, id, family, musicXmlId, trackName, longNames, shortNames, useDrumset, minPitchA, maxPitchA, minPitchP,
 *  maxPitchP, channels: [name, bank, program][]]
 */
export const INSTRUMENT_TEMPLATE_DATA: readonly (readonly [number, string, string, string, string, string[], string[], number, number,
    number, number, number, [string, number, number][]])[] = [
${rows.map(r => `    ${r},`).join('\n')}
]
`)
console.log(`${rows.length} instrument templates in ${groups.length} groups`)
