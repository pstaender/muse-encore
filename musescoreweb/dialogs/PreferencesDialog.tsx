/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Preferences (MuseScore's PreferencesDialog.qml): pages in a side bar; for now "General" with the language and
 * "Save & publish" with the auto save (SaveAndPublishPreferencesPage.qml: AutoSaveSection).
 */
import { useEffect, useRef, useState } from 'react'
import { currentLanguage, languageList, qtrc, setLanguage, useLanguage } from '../i18n'
import { updateSettings, useSettings } from '../settings'

const PAGES = [
    { id: 'general', title: 'General', icon: '' }, // SETTINGS_COG
    { id: 'cloud', title: 'Save & publish', icon: '' }, // CLOUD_FILE
] as const

function GeneralPage(): React.JSX.Element {
    useLanguage()
    const { ui } = useSettings()
    const [loading, setLoading] = useState(false)
    const languages = languageList()
    return (
        <section className="preferences-section" aria-labelledby="pref-language">
            <h3 id="pref-language">{qtrc('preferences', 'Language')}</h3>
            <label className="field">
                <span className="visually-hidden">{qtrc('preferences', 'Language')}</span>
                <select value={ui.language} disabled={loading}
                    onChange={async (e) => {
                        setLoading(true)
                        try {
                            await setLanguage(e.target.value)
                        } finally {
                            setLoading(false)
                        }
                    }}>
                    <option value="system">{qtrc('preferences', 'System default')}</option>
                    {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
            </label>
            <p className="muted hint">
                {ui.language === 'system' ? `${qtrc('preferences', 'System default')}: ${languages.find(l => l.code === currentLanguage())?.name ?? 'English'}` : ''}
            </p>
        </section>
    )
}

/** AutoSaveSection.qml: "Auto save every [n] min" */
function SaveAndPublishPage(): React.JSX.Element {
    useLanguage()
    const { project } = useSettings()
    return (
        <section className="preferences-section" aria-labelledby="pref-autosave">
            <h3 id="pref-autosave">{qtrc('preferences', 'Auto save')}</h3>
            <div className="autosave-row">
                <label className="check">
                    <input type="checkbox" checked={project.autoSaveEnabled}
                        onChange={e => updateSettings('project', { autoSaveEnabled: e.target.checked })} />
                    {qtrc('preferences', 'Auto save every')}
                </label>
                <span className="number-with-unit">
                    <input type="number" min={1} max={100} step={1} disabled={!project.autoSaveEnabled}
                        aria-label={qtrc('preferences', 'Auto save every')}
                        value={Math.max(1, Math.round(project.autoSaveInterval))}
                        onChange={(e) => {
                            const v = Math.round(Number(e.target.value))
                            if (v >= 1 && v <= 100) {
                                updateSettings('project', { autoSaveInterval: v })
                            }
                        }} />
                    {' ' + qtrc('global', 'min', 'abbreviation of minutes')}
                </span>
            </div>
        </section>
    )
}

export function PreferencesDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [page, setPage] = useState<string>('general')
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="preferences" aria-labelledby="preferences-title" onClose={onClose}>
            <header className="dialog-header">
                <h2 id="preferences-title">{qtrc('preferences', 'Preferences')}</h2>
                <button className="icon" aria-label={qtrc('global', 'Close')} title={qtrc('global', 'Close')} onClick={() => ref.current?.close()}>{''}</button>
            </header>
            <div className="preferences-body">
                <ul className="preferences-pages" role="tablist" aria-orientation="vertical">
                    {PAGES.map(p => (
                        <li key={p.id} role="tab" aria-selected={page === p.id} tabIndex={0} onClick={() => setPage(p.id)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPage(p.id) } }}>
                            <span className="icon-glyph" aria-hidden="true">{p.icon}</span>
                            {qtrc('preferences', p.title)}
                        </li>
                    ))}
                </ul>
                <div className="preferences-page" role="tabpanel">
                    {page === 'general' && <GeneralPage />}
                    {page === 'cloud' && <SaveAndPublishPage />}
                </div>
            </div>
            <form method="dialog" className="dialog-buttons">
                <button className="primary" value="ok">{qtrc('global', 'OK')}</button>
            </form>
        </dialog>
    )
}
