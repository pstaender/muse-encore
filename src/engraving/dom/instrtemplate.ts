/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/engraving/dom/instrtemplate.cpp that the engraving needs: the instrument templates
 * of share/instruments/instruments.xml (generated into instrtemplatedata.ts) and the template searches.
 */

import { INSTRUMENT_TEMPLATE_DATA } from './instrtemplatedata'

export interface TemplateChannel {
    name: string
    bank: number
    program: number
}

export interface InstrumentTemplate {
    id: string
    familyId: string
    musicXmlId: string
    trackName: string
    longNames: readonly string[]
    shortNames: readonly string[]
    useDrumset: boolean
    minPitchA: number
    maxPitchA: number
    minPitchP: number
    maxPitchP: number
    channel: readonly TemplateChannel[]
}

let s_groups: InstrumentTemplate[][] | null = null
let s_templates: InstrumentTemplate[] | null = null

/** the templates of each group (C++ instrumentGroups[i]->instrumentTemplates) */
export function instrumentGroups(): readonly (readonly InstrumentTemplate[])[] {
    if (!s_groups) {
        s_groups = []
        for (const [group, id, familyId, musicXmlId, trackName, longNames, shortNames, useDrumset,
            minPitchA, maxPitchA, minPitchP, maxPitchP, channels] of INSTRUMENT_TEMPLATE_DATA) {
            (s_groups[group] ??= []).push({
                id, familyId, musicXmlId, trackName, longNames, shortNames, useDrumset: useDrumset !== 0,
                minPitchA, maxPitchA, minPitchP, maxPitchP,
                channel: channels.map(([name, bank, program]) => ({ name, bank, program })),
            })
        }
    }
    return s_groups
}

/** all templates in the order of the groups */
export function instrumentTemplates(): readonly InstrumentTemplate[] {
    s_templates ??= instrumentGroups().flat()
    return s_templates
}

export function searchTemplate(name: string): InstrumentTemplate | null {
    return instrumentTemplates().find(t => t.id === name) ?? null
}

export function searchTemplateForInstrNameList(nameList: readonly string[], useDrumset: boolean, caseSensitive = true): InstrumentTemplate | null {
    let bestMatch: InstrumentTemplate | null = null // default if no matches
    let bestMatchStrength = 0 // higher for better matches

    for (const name of nameList) {
        if (!name) {
            continue
        }
        const equalsName = caseSensitive
            ? (s: string): boolean => s === name
            : (s: string): boolean => s.toLowerCase() === name.toLowerCase()

        for (const it of instrumentTemplates()) {
            if (it.useDrumset !== useDrumset) {
                continue
            }
            const matchStrength = 0
                + (4 * (equalsName(it.trackName) ? 1 : 0)) // most weight to track name since there are fewer duplicates
                + (2 * (it.longNames.some(equalsName) ? 1 : 0))
                + (1 * (it.shortNames.some(equalsName) ? 1 : 0)) // least weight to short name
            const perfectMatchStrength = 7
            if (matchStrength > bestMatchStrength) {
                bestMatch = it
                bestMatchStrength = matchStrength
                if (bestMatchStrength === perfectMatchStrength) {
                    break // stop looking for matches (nothing can match better)
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
