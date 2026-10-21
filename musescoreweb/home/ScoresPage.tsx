/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The home screen: the scores that were opened or created in this browser (like MuseScore's ScoresPage with the
 * "New & recent" tab), as a grid of thumbnails or as a list, with "New" and "Open other…".
 */
import { useEffect, useMemo, useState } from 'react'
import { removeAllScores, removeScore, useScores, type ScoreEntry } from '../db'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { qtrc, useLanguage } from '../i18n'
import { chooseFile, dismissError, forgetScore, openStored, showNewScoreDialog, useSession } from '../session'
import { updateSettings, useSettings } from '../settings'

const ICON = { grid: '', list: '', plus: '', close: '', search: '', score: '' }

function timeAgo(t: number): string {
    const relativeTime = new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: 'auto' })
    const s = (t - Date.now()) / 1000
    const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12]]
    let v = s
    for (const [unit, n] of steps) {
        if (Math.abs(v) < n) {
            return unit === 'second' ? relativeTime.format(0, 'second') : relativeTime.format(Math.round(v), unit)
        }
        v /= n
    }
    return relativeTime.format(Math.round(v), 'year')
}

function fileSize(bytes: number): string {
    if (!bytes) {
        return '–'
    }
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function displayName(e: ScoreEntry): string {
    // like MuseScore: the file name without extension
    return e.name.replace(/\.mscx?z?$/i, '')
}

function Thumbnail({ entry }: { entry: ScoreEntry }): React.JSX.Element {
    const [url, setUrl] = useState<string | null>(null)
    useEffect(() => {
        if (!entry.thumbnail) {
            setUrl(null)
            return
        }
        const u = URL.createObjectURL(entry.thumbnail)
        setUrl(u)
        return () => URL.revokeObjectURL(u)
    }, [entry.thumbnail])
    return url
        ? <img src={url} alt="" draggable={false} />
        : <span className="thumb-placeholder" aria-hidden="true">{ICON.score}</span>
}

export function ScoresPage(): React.JSX.Element {
    useLanguage()
    const scores = useScores()
    const session = useSession()
    const { home } = useSettings()
    const [query, setQuery] = useState('')
    const [confirm, setConfirm] = useState<{ kind: 'one'; entry: ScoreEntry } | { kind: 'all' } | null>(null)

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return (scores ?? []).filter(e => !q || [e.name, e.title, e.composer].some(s => s.toLowerCase().includes(q)))
    }, [scores, query])

    const open = (e: ScoreEntry): void => {
        void openStored(e.id).then(ok => {
            if (!ok) {
                void removeScore(e.id)
            }
        })
    }

    const remove = (e: ScoreEntry): void => {
        // a new score exists only here (there is no saving yet): ask first
        if (e.source === 'new') {
            setConfirm({ kind: 'one', entry: e })
        } else {
            forgetScore(e.id)
            void removeScore(e.id)
        }
    }

    const searching = !!query.trim()

    return (
        <section className="home" aria-labelledby="home-title">
            <div className="home-header">
                <h1 id="home-title">{qtrc('project', 'Scores')}</h1>
                <div className="home-tools">
                    <label className="search">
                        <span className="icon-glyph" aria-hidden="true">{ICON.search}</span>
                        <input type="search" placeholder={qtrc('ui', 'Search')} aria-label={qtrc('project', 'Search recent scores')} value={query}
                            onChange={e => setQuery(e.target.value)} />
                    </label>
                    <div className="segmented" role="radiogroup" aria-label="View">
                        <button className="icon" role="radio" aria-checked={home.layout === 'grid'} title={qtrc('project', 'Grid view')}
                            aria-label={qtrc('project', 'Grid view')} onClick={() => updateSettings('home', { layout: 'grid' })}>{ICON.grid}</button>
                        <button className="icon" role="radio" aria-checked={home.layout === 'list'} title={qtrc('project', 'List view')}
                            aria-label={qtrc('project', 'List view')} onClick={() => updateSettings('home', { layout: 'list' })}>{ICON.list}</button>
                    </div>
                </div>
            </div>

            {session.error && (
                <div className="home-error" role="alert">
                    <span>{session.error}</span>
                    <button className="icon" aria-label={qtrc('global', 'Close')} title={qtrc('global', 'Close')} onClick={dismissError}>{ICON.close}</button>
                </div>
            )}

            <div className="home-body">
                {scores === undefined ? null : searching && !shown.length ? (
                    <p className="no-results muted">{qtrc('global', 'No results found')}</p>
                ) : home.layout === 'grid' ? (
                    <ul className="score-grid" aria-label={qtrc('project', 'Recent scores grid')}>
                        {!searching && (
                            <li>
                                <button className="score-card new" onClick={() => showNewScoreDialog(true)}>
                                    <span className="thumb"><span className="new-plus" aria-hidden="true">{ICON.plus}</span></span>
                                    <span className="card-name">{qtrc('project', 'New score')}</span>
                                </button>
                            </li>
                        )}
                        {shown.map(e => (
                            <li key={e.id}>
                                <button className="score-card" onClick={() => open(e)} title={[e.title, e.composer].filter(Boolean).join(' – ') || undefined}>
                                    <span className="thumb" style={{ aspectRatio: String(e.aspect || 210 / 297) }}><Thumbnail entry={e} /></span>
                                    <span className="card-name">{displayName(e)}</span>
                                    <span className="card-time muted">{timeAgo(e.opened)}</span>
                                </button>
                                <button className="icon remove" title="Remove from list" aria-label={`Remove ${displayName(e)} from the list`}
                                    onClick={() => remove(e)}>{ICON.close}</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <table className="score-list" aria-label={qtrc('project', 'Recent scores list')}>
                        <thead>
                            <tr><th>{qtrc('notation', 'Name')}</th><th>{qtrc('project', 'Modified')}</th><th>{qtrc('global', 'Size', 'file size')}</th><th><span className="visually-hidden">Actions</span></th></tr>
                        </thead>
                        <tbody>
                            {!searching && (
                                <tr>
                                    <td colSpan={4}>
                                        <button className="list-item" onClick={() => showNewScoreDialog(true)}>
                                            <span className="list-thumb new"><span aria-hidden="true">{ICON.plus}</span></span>
                                            {qtrc('project', 'New score')}
                                        </button>
                                    </td>
                                </tr>
                            )}
                            {shown.map(e => (
                                <tr key={e.id}>
                                    <td>
                                        <button className="list-item" onClick={() => open(e)}>
                                            <span className="list-thumb"><Thumbnail entry={e} /></span>
                                            <span className="list-name">
                                                {displayName(e)}
                                                {e.title && e.title !== displayName(e) && <span className="muted"> · {e.title}</span>}
                                            </span>
                                        </button>
                                    </td>
                                    <td className="muted">{timeAgo(e.opened)}</td>
                                    <td className="muted">{e.source === 'new' && !e.size ? 'new score' : fileSize(e.size)}</td>
                                    <td>
                                        <button className="icon" title="Remove from list" aria-label={`Remove ${displayName(e)} from the list`}
                                            onClick={() => remove(e)}>{ICON.close}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {scores !== undefined && !scores.length && (
                    <p className="home-hint muted">
                        Scores you open or create are kept in this browser and appear here. You can also drop a
                        .mscz or .mscx file anywhere in this window.
                    </p>
                )}
            </div>

            <div className="home-footer">
                {!!scores?.length && (
                    <button className="secondary" onClick={() => setConfirm({ kind: 'all' })}>Clear list…</button>
                )}
                <span className="spacer" />
                <button className="secondary" onClick={chooseFile}>{qtrc('project', 'Open other…')}</button>
                <button className="primary" onClick={() => showNewScoreDialog(true)}>{qtrc('project', 'New')}</button>
            </div>

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === 'all' ? 'Clear the list of scores?' : `Remove “${displayName(confirm.entry)}”?`}
                    message={confirm.kind === 'all'
                        ? 'All scores are removed from this browser. Scores created here cannot be restored, they are not saved anywhere else.'
                        : 'This score was created here and is not saved anywhere else. It cannot be restored.'}
                    confirmLabel={qtrc('workspace', 'Remove')}
                    onClose={(ok) => {
                        if (ok) {
                            if (confirm.kind === 'all') {
                                for (const e of scores ?? []) {
                                    forgetScore(e.id)
                                }
                                void removeAllScores()
                            } else {
                                forgetScore(confirm.entry.id)
                                void removeScore(confirm.entry.id)
                            }
                        }
                        setConfirm(null)
                    }}
                />
            )}
        </section>
    )
}
