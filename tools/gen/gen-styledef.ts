/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Generates src/engraving/style/styledef.ts (Sid enum + default values) from
 * src/engraving/style/styledef.h/.cpp of the MuseScore sources.
 *
 * usage: tsx tools/gen/gen-styledef.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-styledef.ts <MuseScore source dir>')
    process.exit(1)
}

function stripComments(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// enums that live in dom headers which are not (yet) available as TS enums at this level:
// resolved to plain numbers
const NUMERIC_ENUMS: Record<string, Record<string, number>> = {
    FrameType: { NO_FRAME: 0, SQUARE: 1, CIRCLE: 2 },
    Voicing: { INVALID: -1, AUTO: 0, ROOT_ONLY: 1, CLOSE: 2, DROP_2: 3, SIX_NOTE: 4, FOUR_NOTE: 5, THREE_NOTE: 6 },
    HDuration: { INVALID: -1, UNTIL_NEXT_CHORD_SYMBOL: 0, STOP_AT_MEASURE_END: 1, SEGMENT_DURATION: 2 },
    TupletNumberType: { SHOW_NUMBER: 0, SHOW_RELATION: 1, NO_TEXT: 2 },
    TupletBracketType: { AUTO_BRACKET: 0, SHOW_BRACKET: 1, SHOW_NO_BRACKET: 2 },
    MMRestRangeBracketType: { BRACKETS: 0, PARENTHESES: 1, NONE: 2 },
    ShowTiedFret: { TIE_AND_FRET: 0, TIE: 1, NONE: 2 },
    ParenthesizeTiedFret: { START_OF_SYSTEM: 0, START_OF_MEASURE: 1, NEVER: 2 },
    ArticulationStemSideAlign: { STEM: 0, NOTEHEAD: 1, AVERAGE: 2 },
    ArticulationAnchor: { TOP: 0, BOTTOM: 1, AUTO: 2 },
}

// enums available in types.ts
const TYPES_ENUMS = new Set([
    'OffsetType', 'FontStyle', 'OrnamentStyle', 'TremoloStyle', 'Orientation', 'KeySigNatural',
    'InstrumentLabelVisibility', 'CourtesyBarlineMode', 'ClefType', 'LyricsDashSystemStart',
    'DisplayCapoChordType', 'LHTappingShowItems', 'AlignH', 'AlignV', 'PlacementV', 'PlacementH',
    'DirectionV', 'HookType', 'LineType', 'TiePlacement', 'TieDotsPlacement', 'TimeSigPlacement',
    'TimeSigStyle', 'TimeSigVSMargin', 'NoteSpellingType', 'ChordStylePreset', 'TextStyleType',
    'RepeatPlayCountPreset', 'MeasureNumberPlacement', 'GlissandoType', 'GlissandoStyle',
    'LHTappingSymbol', 'RHTappingSymbol', 'ParenthesesMode',
])

// enum name -> P_TYPE of a plain enum value
const ENUM_PTYPE: Record<string, string> = {
    AlignH: 'ALIGN_H',
    PlacementV: 'PLACEMENT_V',
    PlacementH: 'PLACEMENT_H',
    DirectionV: 'DIRECTION_V',
    HookType: 'HOOK_TYPE',
    LineType: 'LINE_TYPE',
    TiePlacement: 'TIE_PLACEMENT',
    TieDotsPlacement: 'TIE_DOTS_PLACEMENT',
    TimeSigPlacement: 'TIMESIG_PLACEMENT',
    TimeSigStyle: 'TIMESIG_STYLE',
    TimeSigVSMargin: 'TIMESIG_MARGIN',
    NoteSpellingType: 'NOTE_SPELLING_TYPE',
    ChordStylePreset: 'CHORD_PRESET_TYPE',
    TextStyleType: 'TEXT_STYLE',
    RepeatPlayCountPreset: 'PLAY_COUNT_PRESET',
    MeasureNumberPlacement: 'MEASURE_NUMBER_PLACEMENT',
    GlissandoType: 'GLISS_TYPE',
    GlissandoStyle: 'GLISS_STYLE',
    LHTappingSymbol: 'LH_TAPPING_SYMBOL',
    RHTappingSymbol: 'RH_TAPPING_SYMBOL',
    ParenthesesMode: 'PARENTHESES_MODE',
    ClefToBarlinePosition: 'CLEF_TO_BARLINE_POS',
}

const usedEnums = new Set<string>()

function enumRef(e: string): string {
    const m = e.match(/^(\w+)::(\w+)$/)
    if (!m) {
        throw new Error('not an enum ref: ' + e)
    }
    const [, en, val] = m
    if (NUMERIC_ENUMS[en]) {
        const v = NUMERIC_ENUMS[en][val]
        if (v === undefined) {
            throw new Error('unknown enum value ' + e)
        }
        return `${v} /* ${en}::${val} */`
    }
    if (!TYPES_ENUMS.has(en)) {
        throw new Error('unknown enum ' + en)
    }
    usedEnums.add(en)
    return `${en}.${val}`
}

function num(s: string): string {
    return s.replace(/^\+/, '')
}

function convert(v: string): [string, string] {
    v = v.trim()
    let m: RegExpMatchArray | null

    if ((m = v.match(/^PropertyValue::fromValue\((.*)\)$/))) { return convert(m[1]) }
    if ((m = v.match(/^PropertyValue\((.*)\)$/))) { return convert(m[1]) }
    if ((m = v.match(/^(-?[0-9.]+)_sp$/))) { return [`sp(${num(m[1])})`, 'SPATIUM'] }
    if ((m = v.match(/^double\((-?[0-9.]+)\)$/))) { return [m[1], 'REAL'] }
    if ((m = v.match(/^(-?[0-9.]+) \/ INCH$/))) { return [`${m[1]} / INCH`, 'REAL'] }
    if ((m = v.match(/^(-?[0-9.]+)\s+\* DPMM$/))) { return [`${m[1]} * DPMM`, "REAL"] }
    if ((m = v.match(/^-?[0-9]+$/))) { return [v, 'INT'] }
    if ((m = v.match(/^-?[0-9]*\.[0-9]*(e-?[0-9]+)?$/))) { return [v, 'REAL'] }
    if (v === 'true' || v === 'false') { return [v, 'BOOL'] }
    if ((m = v.match(/^"(.*)"$/))) { return [JSON.stringify(m[1]), 'STRING'] }
    if ((m = v.match(/^String\(u"(.*)"\)$/))) { return [JSON.stringify(m[1]), 'STRING'] }
    if (v === 'String()') { return ["''", 'STRING'] }
    if ((m = v.match(/^Color::(\w+)$/))) { return [`Color.${m[1]}`, 'COLOR'] }
    if (v === 'PointF()') { return ['new PointF()', 'POINT'] }
    if ((m = v.match(/^PointF\((.*),(.*)\)$/))) { return [`new PointF(${num(m[1].trim())}, ${num(m[2].trim())})`, 'POINT'] }
    if ((m = v.match(/^ScaleF\((.*),(.*)\)$/))) { return [`new ScaleF(${m[1].trim()}, ${m[2].trim()})`, 'SCALE'] }
    if ((m = v.match(/^Align\((\w+::\w+),\s*(\w+::\w+)\)$/))) { return [`new Align(${enumRef(m[1])}, ${enumRef(m[2])})`, 'ALIGN'] }
    if (v === 'Constants::MSC_VERSION') { return ['Constants.MSC_VERSION', 'INT'] }
    if ((m = v.match(/^int\((.*)\)$/))) {
        const inner = m[1].split('|').map(s => enumRef(s.trim())).join(' | ')
        return [inner, 'INT']
    }
    if ((m = v.match(/^(\w+)::(\w+)$/))) {
        const ptype = ENUM_PTYPE[m[1]]
        if (!ptype) {
            throw new Error('no P_TYPE for enum ' + v)
        }
        return [enumRef(v), ptype]
    }
    throw new Error('cannot convert: ' + v)
}

// --- Sid enum
const header = stripComments(readFileSync(join(src, 'src/engraving/style/styledef.h'), 'utf8'))
const sidBody = header.match(/enum class Sid : short \{([\s\S]*?)\};/)![1]
const sids = sidBody.split(',').map(s => s.trim()).filter(s => s.length > 0)

// --- values
const cpp = readFileSync(join(src, 'src/engraving/style/styledef.cpp'), 'utf8')
const block = stripComments(cpp.slice(cpp.indexOf('StyleDef::styleValues {')))
const entries: [string, string, string][] = []
let pos = 0
for (;;) {
    const i = block.indexOf('styleDef(', pos)
    if (i < 0) {
        break
    }
    let depth = 0
    let j = i + 'styleDef'.length
    let start = j + 1
    let args = ''
    for (; j < block.length; ++j) {
        const c = block[j]
        if (c === '"') {
            const k = block.indexOf('"', j + 1)
            j = k
            continue
        }
        if (c === '(') {
            depth++
        } else if (c === ')') {
            depth--
            if (depth === 0) {
                args = block.slice(start, j)
                break
            }
        }
    }
    pos = j
    const comma = args.indexOf(',')
    const name = args.slice(0, comma).trim()
    const [value, type] = convert(args.slice(comma + 1))
    entries.push([name, value, type])
}

const sidList = sids.filter(s => s !== 'NOSTYLE = -1' && s !== 'STYLES')
if (sidList.length !== entries.length) {
    throw new Error(`Sid count ${sidList.length} != styleDef count ${entries.length}`)
}
// The C++ table is positional; it is sorted here by Sid to be robust against
// (harmless) ordering mistakes in styledef.cpp
const byName = new Map(entries.map(e => [e[0], e]))
for (let i = 0; i < entries.length; ++i) {
    if (entries[i][0] !== sidList[i]) {
        console.warn(`warning: order mismatch at ${i}: ${entries[i][0]} != ${sidList[i]}`)
    }
}
entries.length = 0
for (const s of sidList) {
    const e = byName.get(s)
    if (!e) {
        throw new Error('no styleDef for ' + s)
    }
    entries.push(e)
}

const out = `/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * GENERATED by tools/gen/gen-styledef.ts from styledef.h/.cpp - do not edit manually!
 */

import { Color } from '../../framework/draw/types/color'
import { PointF, ScaleF } from '../../framework/draw/types/geometry'
import { Constants } from '../types/constants'
import { sp } from '../types/dimension'
import { P_TYPE, type PropertyValue } from '../types/propertyvalue'
import {
    Align, DPMM, INCH,
${[...usedEnums].sort().map(e => `    ${e},`).join('\n')}
} from '../types/types'

export enum Sid {
    NOSTYLE = -1,
${sidList.map(s => `    ${s},`).join('\n')}
    STYLES,
}

export interface StyleValue {
    sid: Sid
    xmlName: string
    type: P_TYPE
    defaultValue: PropertyValue
}

function styleDef(sid: Sid, type: P_TYPE, defaultValue: PropertyValue): StyleValue {
    return { sid, xmlName: Sid[sid], type, defaultValue }
}

export const STYLE_VALUES: readonly StyleValue[] = [
${entries.map(([n, v, t]) => `    styleDef(Sid.${n}, P_TYPE.${t}, ${v}),`).join('\n')}
]
`
writeFileSync('src/engraving/style/styledef.ts', out)
console.log(`generated ${entries.length} style values`)
