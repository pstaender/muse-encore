/*
 * SPDX-License-Identifier: GPL-3.0-only
 * "Choose instruments" (MuseScore's ChooseInstrumentsPage.qml): families of a genre, the instruments of a family
 * (or the search results), and the instruments of the new score with their order.
 */
import { useMemo, useState } from 'react'
import {
    COMMON_GENRE_ID, formatInstrumentTitle, genreList, groupList, insertInstrument, instrumentList, orderList,
    sortInstruments, templateById, verifyOrder, type OrderChoice, type ScoreInstrument,
} from './instrumentmodels'

const ICON = { add: '', up: '', down: '', remove: '', search: '', solo: '' }

let s_key = 0

export function ChooseInstrumentsPage({ instruments, setInstruments, order, setOrder }: {
    instruments: ScoreInstrument[]
    setInstruments: (list: ScoreInstrument[]) => void
    order: OrderChoice
    setOrder: (order: OrderChoice) => void
}): React.JSX.Element {
    const genres = useMemo(genreList, [])
    const [genreId, setGenreId] = useState(() => genres.some(g => g.id === COMMON_GENRE_ID) ? COMMON_GENRE_ID : genres[0].id)
    const groups = useMemo(() => groupList(genreId), [genreId])
    const [groupId, setGroupId] = useState<string | null>(() => groups[0]?.id ?? null)
    const [search, setSearch] = useState('')
    const searching = !!search.trim()
    const currentGroup = groups.some(g => g.id === groupId) ? groupId : groups[0]?.id ?? null
    const list = useMemo(() => instrumentList(genreId, searching ? null : currentGroup, search.trim()),
        [genreId, currentGroup, search, searching])
    // selected instrument (by name) and the chosen trait of each combined instrument
    const [selected, setSelected] = useState<string | null>(null)
    const [traits, setTraits] = useState<Record<string, number>>({})
    const [selectedOnScore, setSelectedOnScore] = useState<number | null>(null)

    const orders = useMemo(orderList, [])
    const selectedInstrument = list.find(i => i.name === selected) ?? null
    const templateOf = (name: string): string | undefined => {
        const i = list.find(x => x.name === name)
        return i?.templates[Math.min(traits[name] ?? 0, i.templates.length - 1)]?.id
    }

    const update = (next: ScoreInstrument[], o = order): void => {
        setInstruments(next)
        setOrder(verifyOrder(o, next))
    }

    const add = (name: string | null = selected): void => {
        const id = name && templateOf(name)
        if (!id) {
            return
        }
        const item = { key: ++s_key, id, soloist: false }
        update(insertInstrument(order, instruments, item))
        setSelectedOnScore(item.key)
    }

    const selIdx = instruments.findIndex(i => i.key === selectedOnScore)
    const move = (dir: -1 | 1): void => {
        const j = selIdx + dir
        if (selIdx < 0 || j < 0 || j >= instruments.length) {
            return
        }
        const next = [...instruments]
        ;[next[selIdx], next[j]] = [next[j], next[selIdx]]
        update(next)
    }
    const remove = (): void => {
        if (selIdx < 0) {
            return
        }
        const next = instruments.filter((_, i) => i !== selIdx)
        update(next)
        setSelectedOnScore(next[Math.min(selIdx, next.length - 1)]?.key ?? null)
    }
    const toggleSoloist = (): void => {
        if (selIdx < 0) {
            return
        }
        update(instruments.map((x, i) => i === selIdx ? { ...x, soloist: !x.soloist } : x))
    }
    const changeOrder = (id: string): void => {
        // InstrumentsOnScoreListModel::setCurrentOrderIndex: the list is sorted by the new order
        const o = { id, customized: false }
        setInstruments(sortInstruments(o, instruments))
        setOrder(o)
    }

    const selectedTemplate = selectedInstrument
        ? templateById(selectedInstrument.templates[Math.min(traits[selectedInstrument.name] ?? 0, selectedInstrument.templates.length - 1)].id)
        : null

    return (
        <div className="choose-instruments">
            <section className="column families" aria-labelledby="families-title">
                <h3 id="families-title">Family</h3>
                <select aria-label="Genre" value={searching ? 'ALL_INSTRUMENTS' : genreId} disabled={searching}
                    onChange={e => setGenreId(e.target.value)}>
                    {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <ul className="list" role="listbox" aria-label="Families">
                    {groups.map(g => (
                        <li key={g.id} role="option" aria-selected={!searching && g.id === currentGroup} tabIndex={0}
                            onClick={() => { setGroupId(g.id); setSearch('') }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setGroupId(g.id)
                                    setSearch('')
                                }
                            }}>
                            {g.name}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="column instruments" aria-labelledby="instruments-title">
                <h3 id="instruments-title">Instruments</h3>
                <label className="search">
                    <span className="icon-glyph" aria-hidden="true">{ICON.search}</span>
                    <input type="search" placeholder="Search" aria-label="Search instruments" value={search}
                        onChange={e => setSearch(e.target.value)} />
                </label>
                <ul className="list" role="listbox" aria-label="Instruments">
                    {list.map(i => (
                        <li key={i.name} role="option" aria-selected={i.name === selected} tabIndex={0}
                            onClick={() => setSelected(i.name)}
                            onDoubleClick={() => add(i.name)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    add(i.name)
                                } else if (e.key === ' ') {
                                    e.preventDefault()
                                    setSelected(i.name)
                                }
                            }}>
                            <span className="item-name">{i.name}</span>
                            {i.templates.length > 1 && (
                                <select aria-label={`${i.name}: variant`} value={traits[i.name] ?? 0}
                                    onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                                    onKeyDown={e => e.stopPropagation()}
                                    onChange={e => {
                                        setTraits({ ...traits, [i.name]: Number(e.target.value) })
                                        setSelected(i.name)
                                    }}>
                                    {i.templates.map((t, k) => <option key={t.id} value={k}>{t.trait.name || t.trackName}</option>)}
                                </select>
                            )}
                        </li>
                    ))}
                    {!list.length && <li className="muted empty-item">No results found</li>}
                </ul>
                <p className="description muted" aria-live="polite">{selectedTemplate?.description ?? ''}</p>
            </section>

            <div className="add-column">
                <button className="icon" title="Add selected instrument to score" aria-label="Add selected instrument to score"
                    disabled={!selectedInstrument} onClick={() => add()}>{ICON.add}</button>
            </div>

            <section className="column on-score" aria-labelledby="on-score-title">
                <h3 id="on-score-title">Your score</h3>
                <select aria-label="Score order" value={order.customized ? `${order.id}:customized` : order.id}
                    onChange={e => changeOrder(e.target.value.replace(/:customized$/, ''))}>
                    {orders.map(o => [
                        <option key={o.id} value={o.id}>{o.name}</option>,
                        order.customized && o.id === order.id
                            ? <option key={`${o.id}:c`} value={`${o.id}:customized`}>{`${o.name} (Customized)`}</option>
                            : null,
                    ])}
                </select>
                <ul className="list" role="listbox" aria-label="Instruments of the score">
                    {instruments.map(i => {
                        const t = templateById(i.id)
                        return (
                            <li key={i.key} role="option" aria-selected={i.key === selectedOnScore} tabIndex={0}
                                onClick={() => setSelectedOnScore(i.key)}
                                onKeyDown={e => {
                                    if (e.key === 'Delete' || e.key === 'Backspace') {
                                        e.preventDefault()
                                        remove()
                                    } else if (e.key === ' ') {
                                        e.preventDefault()
                                        setSelectedOnScore(i.key)
                                    }
                                }}>
                                <span className="item-name">{t ? formatInstrumentTitle(t.trackName, t.trait) : i.id}</span>
                                {i.soloist && <span className="badge">Soloist</span>}
                            </li>
                        )
                    })}
                    {!instruments.length && <li className="muted empty-item">Choose instruments and add them to the score</li>}
                </ul>
                <div className="list-actions">
                    <button className="icon" title="Move up" aria-label="Move up" disabled={selIdx <= 0} onClick={() => move(-1)}>{ICON.up}</button>
                    <button className="icon" title="Move down" aria-label="Move down" disabled={selIdx < 0 || selIdx >= instruments.length - 1}
                        onClick={() => move(1)}>{ICON.down}</button>
                    <button className="icon" title={instruments[selIdx]?.soloist ? 'Undo soloist' : 'Make soloist'}
                        aria-label={instruments[selIdx]?.soloist ? 'Undo soloist' : 'Make soloist'}
                        aria-pressed={!!instruments[selIdx]?.soloist} disabled={selIdx < 0} onClick={toggleSoloist}>{ICON.solo}</button>
                    <button className="icon" title="Remove" aria-label="Remove" disabled={selIdx < 0} onClick={remove}>{ICON.remove}</button>
                </div>
            </section>
        </div>
    )
}
