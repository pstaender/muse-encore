/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The logic of the instrument lists of the New Score dialog, after MuseScore's InstrumentListModel (the instruments
 * to choose from: genre, group, search, instruments combined by name with their traits) and
 * InstrumentsOnScoreListModel (the instruments of the new score, sorted by the score order until the user moves
 * them) in src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal.
 */
import {
    instrumentGenres, instrumentGroupList, instrumentSortingIndex, isScoreOrder, scoreOrders, type InstrumentTemplateInfo,
} from '../../src/index'
import { arg, qtrc } from '../i18n'

export const COMMON_GENRE_ID = 'common'
export const ALL_INSTRUMENTS_GENRE_ID = 'ALL_INSTRUMENTS'

type Trait = InstrumentTemplateInfo['trait']

/** formatInstrumentTitle (notationtypes.h); the names are translated */
export function formatInstrumentTitle(instrumentName: string, trait: Trait): string {
    switch (trait.type) {
        case 'tuning': return arg(qtrc('notation', '%1 %2', 'Tuned instrument displayed in the UI'), trait.name, instrumentName)
        case 'transposition': return arg(qtrc('notation', '%1 in %2', 'Transposing instrument displayed in the UI'), instrumentName, trait.name)
        case 'course': return arg(qtrc('notation', '%1 (%2)', 'String instrument displayed in the UI'), instrumentName, trait.name)
        default: return instrumentName
    }
}

/** the translated names of a template (InstrumentTemplate: TranslatableStrings with the id as disambiguation) */
export function trackName(t: InstrumentTemplateInfo): string {
    return qtrc('engraving/instruments', t.trackName, `${t.id} trackName`)
}

export function traitName(t: InstrumentTemplateInfo): string {
    return t.trait.name ? qtrc('engraving/instruments', t.trait.name, `${t.id} traitName`) : ''
}

export function templateDescription(t: InstrumentTemplateInfo): string {
    return t.description ? qtrc('engraving/instruments', t.description, `${t.id} description`) : ''
}

/** the title of a template in the lists (with its trait) */
export function templateTitle(t: InstrumentTemplateInfo): string {
    return formatInstrumentTitle(trackName(t), { ...t.trait, name: traitName(t) })
}

let s_templates: { all: InstrumentTemplateInfo[]; byId: Map<string, InstrumentTemplateInfo> } | null = null

function templates(): NonNullable<typeof s_templates> {
    if (!s_templates) {
        const all = instrumentGroupList().flatMap(g => g.templates)
        s_templates = {
            all,
            byId: new Map(all.map(t => [t.id, t])),
        }
    }
    return s_templates
}

export function templateById(id: string): InstrumentTemplateInfo | undefined {
    return templates().byId.get(id)
}

/** InstrumentListModel::loadGenres: "Common" first, then "All instruments", then the others */
export function genreList(): { id: string; name: string }[] {
    const list = [{ id: ALL_INSTRUMENTS_GENRE_ID, name: qtrc('instruments', 'All instruments') }]
    for (const g of instrumentGenres()) {
        const genre = { id: g.id, name: qtrc('engraving/instruments/genre', g.name) }
        if (g.id === COMMON_GENRE_ID) {
            list.unshift(genre)
        } else {
            list.push(genre)
        }
    }
    return list
}

/** InstrumentListModel::isInstrumentAccepted */
function isInstrumentAccepted(t: InstrumentTemplateInfo, genreId: string, groupId: string | null, search: string): boolean {
    if (search) {
        return trackName(t).toLowerCase().includes(search.toLowerCase())
    }
    if (groupId !== null && t.groupId !== groupId) {
        return false
    }
    return genreId === ALL_INSTRUMENTS_GENRE_ID || t.genres.includes(genreId)
}

/** InstrumentListModel::loadGroups: the groups with instruments of the genre */
export function groupList(genreId: string): { id: string; name: string }[] {
    return instrumentGroupList()
        .filter(g => g.templates.some(t => isInstrumentAccepted(t, genreId, null, '')))
        .map(g => ({ id: g.id, name: qtrc('engraving/instruments/group', g.name) }))
}

export interface CombinedInstrument {
    /** the track name (the key of the combined templates) */
    key: string
    /** the translated track name; with the trait if there is only one template */
    name: string
    /** the templates with this track name, the default trait first */
    templates: InstrumentTemplateInfo[]
}

/** InstrumentListModel::loadInstruments and sortInstruments (by the position of the search text, then by sequenceOrder) */
export function instrumentList(genreId: string, groupId: string | null, search: string): CombinedInstrument[] {
    const byName = new Map<string, InstrumentTemplateInfo[]>()
    for (const t of templates().all) {
        if (!isInstrumentAccepted(t, genreId, groupId, search)) {
            continue
        }
        const list = byName.get(t.trackName) ?? []
        if (t.trait.isDefault) {
            list.unshift(t)
        } else {
            list.push(t)
        }
        byName.set(t.trackName, list)
    }
    const instruments = [...byName].map(([key, list]) => ({
        key,
        name: list.length === 1 ? templateTitle(list[0]) : trackName(list[0]),
        templates: list,
    }))
    const s = search.toLowerCase()
    return instruments.sort((a, b) => {
        const p1 = a.name.toLowerCase().indexOf(s)
        const p2 = b.name.toLowerCase().indexOf(s)
        if (p1 === p2) {
            return a.templates[0].sequenceOrder - b.templates[0].sequenceOrder
        }
        return p1 - p2
    })
}

// ---------------------------------------------------------------------------------
//   the instruments of the new score
// ---------------------------------------------------------------------------------

export interface ScoreInstrument {
    key: number
    id: string
    soloist: boolean
}

export interface OrderChoice {
    id: string
    customized: boolean
}

/** the score orders and "Custom" (InstrumentsOnScoreListModel::loadOrders); the first one is the default */
export function orderList(): { id: string; name: string }[] {
    const list = scoreOrders().map(o => ({ id: o.id, name: qtrc('engraving/scoreorder', o.name) }))
    if (!list.some(o => o.id === 'custom')) {
        list.push({ id: 'custom', name: qtrc('engraving/scoreorder', 'Custom') })
    }
    return list
}

function sortingIndex(order: OrderChoice, i: ScoreInstrument): number {
    return instrumentSortingIndex(order.id, i.id, i.soloist)
}

/** InstrumentsOnScoreListModel::matchesScoreOrder */
function matchesOrder(order: OrderChoice, list: ScoreInstrument[]): boolean {
    return isScoreOrder(order.id, list.map(i => sortingIndex(order, i)))
}

/** InstrumentsOnScoreListModel::verifyScoreOrder: the order is customized while the list does not follow it */
export function verifyOrder(order: OrderChoice, list: ScoreInstrument[]): OrderChoice {
    const matching = matchesOrder(order, list)
    return matching === order.customized ? { id: order.id, customized: !matching } : order
}

/** InstrumentsOnScoreListModel::sortInstruments (stable) */
export function sortInstruments(order: OrderChoice, list: ScoreInstrument[]): ScoreInstrument[] {
    return [...list].sort((a, b) => sortingIndex(order, a) - sortingIndex(order, b))
}

/** InstrumentsOnScoreListModel::insertInstrument: before the first instrument that comes after it in the order */
export function insertInstrument(order: OrderChoice, list: ScoreInstrument[], item: ScoreInstrument): ScoreInstrument[] {
    const idx = sortingIndex(order, item)
    const pos = list.findIndex(i => sortingIndex(order, i) > idx)
    return pos < 0 ? [...list, item] : [...list.slice(0, pos), item, ...list.slice(pos)]
}
