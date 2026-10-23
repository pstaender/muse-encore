/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Preferences (MuseScore's PreferencesDialog.qml): pages in a side bar; for now "General" with the language,
 * "Save & publish" with the auto save (SaveAndPublishPreferencesPage.qml: AutoSaveSection) and "Note input" with the
 * note preview (NoteInputPreferencesPage.qml: NotePreviewSection; there is no MIDI input), "Import"
 * (ImportPreferencesPage.qml: the style for imports, MusicXML and MIDI; Overture, MEI and MNX are not ported) and "Web
 * version" with the settings of the web version (not in MuseScore).
 */
import { useEffect, useRef, useState } from 'react'
import { actionTitle, formatShortcut, shortcuts } from '../actions/actions'
import { ICON_CODES } from '../actions/uiactiondata'
import { arg, currentLanguage, languageList, qtrc, setLanguage, useLanguage, webtr } from '../i18n'
import { pickFile } from '../files'
import { updateSettings, useSettings } from '../settings'

const PAGES: readonly { id: string; title: string; icon: number; web?: boolean }[] = [
    { id: 'general', title: 'General', icon: ICON_CODES.SETTINGS_COG },
    { id: 'cloud', title: 'Save & publish', icon: ICON_CODES.CLOUD_FILE },
    { id: 'note-input', title: 'Note input', icon: ICON_CODES.EDIT },
    { id: 'import', title: 'Import', icon: ICON_CODES.IMPORT },
    { id: 'web', title: 'Web version', icon: ICON_CODES.GLOBE, web: true },
]

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

/** NotePreviewSection.qml */
function NoteInputPage(): React.JSX.Element {
    useLanguage()
    const { playback } = useSettings()
    const play = playback.playNotesWhenEditing
    const check = (key: 'playChordWhenEditing' | 'playHarmonyWhenEditing' | 'playPreviewNotesInInputByDuration' | 'playPreviewNotesWithScoreDynamics',
                   text: string): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" disabled={!play} checked={play && playback[key]}
                onChange={e => updateSettings('playback', { [key]: e.target.checked })} />
            {qtrc('preferences', text)}
        </label>
    )
    return (
        <section className="preferences-section" aria-labelledby="pref-note-preview">
            <h3 id="pref-note-preview">{qtrc('preferences', 'Note preview')}</h3>
            <label className="check">
                <input type="checkbox" checked={play} onChange={e => updateSettings('playback', { playNotesWhenEditing: e.target.checked })} />
                {qtrc('preferences', 'Hear playback when adding, editing, and selecting notes')}
            </label>
            <div className="autosave-row">
                <span>{qtrc('preferences', 'Playback duration')}</span>
                <span className="number-with-unit">
                    <input type="number" min={0} max={10000} step={1} disabled={!play} aria-label={qtrc('preferences', 'Playback duration')}
                        value={playback.notePlayDuration}
                        onChange={(e) => {
                            const v = Math.round(Number(e.target.value))
                            if (v >= 0 && v <= 10000) {
                                updateSettings('playback', { notePlayDuration: v })
                            }
                        }} />
                    {' ' + qtrc('global', 'ms')}
                </span>
            </div>
            {check('playChordWhenEditing', 'Play chord when editing')}
            {check('playHarmonyWhenEditing', 'Play chord symbols and Nashville numbers')}
            {check('playPreviewNotesInInputByDuration', 'Play when setting pitch (input by duration mode only)')}
            {check('playPreviewNotesWithScoreDynamics', 'Play preview notes with score dynamics')}
        </section>
    )
}

/** ImportPreferencesModel::shortestNotes: the shortest note of the MIDI import in ticks (Constants::DIVISION = 480) */
const SHORTEST_NOTES: readonly [string, number][] = [
    ['Quarter', 480], ['Eighth', 240], ['16th', 120], ['32nd', 60], ['64th', 30], ['128th', 15], ['256th', 7], ['512th', 3], ['1024th', 1],
]

/** ImportPreferencesPage.qml: ImportStyleSection, MusicXmlSection, MidiSection */
function ImportPage(): React.JSX.Element {
    useLanguage()
    const { import: imp } = useSettings()
    // ImportStyleSection: "Use style file" can be chosen before a file is chosen
    const [useStyleFileExplicitlySet, setUseStyleFileExplicitlySet] = useState(false)
    const useStyleFile = useStyleFileExplicitlySet || imp.styleFile !== null
    const chooseStyle = async (): Promise<void> => {
        const file = await pickFile({ description: qtrc('preferences', 'MuseScore style file'), accept: { 'application/octet-stream': ['.mss'] } })
        if (file) {
            updateSettings('import', { styleFile: { name: file.name, content: await file.text() } })
        }
    }
    const musicXml = (key: keyof typeof imp.musicXml, text: string): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" checked={imp.musicXml[key]}
                onChange={e => updateSettings('import', { musicXml: { ...imp.musicXml, [key]: e.target.checked } })} />
            {qtrc('preferences', text)}
        </label>
    )
    return (
        <>
            <section className="preferences-section" aria-labelledby="pref-import-style">
                <h3 id="pref-import-style">{qtrc('preferences', 'Style used for import')}</h3>
                <label className="check">
                    <input type="radio" name="import-style" checked={!useStyleFile}
                        onChange={() => {
                            setUseStyleFileExplicitlySet(false)
                            updateSettings('import', { styleFile: null })
                        }} />
                    {qtrc('preferences', 'Built-in style')}
                </label>
                <div className="autosave-row import-style-row">
                    <label className="check">
                        <input type="radio" name="import-style" checked={useStyleFile} onChange={() => setUseStyleFileExplicitlySet(true)} />
                        {qtrc('preferences', 'Use style file')}
                    </label>
                    <input type="text" readOnly className="import-style-path" disabled={!useStyleFile} value={imp.styleFile?.name ?? ''}
                        aria-label={qtrc('preferences', 'Use style file')} />
                    <button className="secondary" disabled={!useStyleFile} title={qtrc('preferences', 'Choose default style for imports')}
                        onClick={() => void chooseStyle()}>{qtrc('ui', 'Browse')}</button>
                </div>
            </section>
            <section className="preferences-section" aria-labelledby="pref-import-musicxml">
                <h3 id="pref-import-musicxml">{qtrc('preferences', 'MusicXML')}</h3>
                {musicXml('importLayout', 'Import layout')}
                {musicXml('importBreaks', 'Import system and page breaks')}
                {musicXml('needUseDefaultFont', 'Apply default typeface (Edwin) to imported scores')}
                {musicXml('inferTextType', 'Infer text type based on content where possible')}
            </section>
            <section className="preferences-section" aria-labelledby="pref-import-midi">
                <h3 id="pref-import-midi">{qtrc('preferences', 'MIDI')}</h3>
                <div className="autosave-row">
                    <span>{qtrc('preferences', 'Shortest note')}</span>
                    <select className="import-shortest-note" aria-label={qtrc('preferences', 'Shortest note')} value={imp.midi.midiShortestNote}
                        onChange={e => updateSettings('import', { midi: { ...imp.midi, midiShortestNote: Number(e.target.value) } })}>
                        {SHORTEST_NOTES.map(([title, ticks]) => <option key={ticks} value={ticks}>{qtrc('preferences', title)}</option>)}
                    </select>
                </div>
                <label className="check">
                    <input type="checkbox" checked={imp.midi.roundTempo}
                        onChange={e => updateSettings('import', { midi: { ...imp.midi, roundTempo: e.target.checked } })} />
                    {qtrc('appshell/preferences', 'Round tempos to nearest whole number')}
                </label>
            </section>
        </>
    )
}

/** the settings of the web version (not in MuseScore) */
function WebVersionPage(): React.JSX.Element {
    useLanguage()
    const { web } = useSettings()
    return (
        <section className="preferences-section" aria-labelledby="pref-web">
            <h3 id="pref-web">{webtr('Web version')}</h3>
            <label className="check">
                <input type="checkbox" checked={web.spacePan} onChange={e => updateSettings('web', { spacePan: e.target.checked })} />
                {webtr('Hold Space and drag to move the score')}
            </label>
            <p className="muted hint">
                {/* playback then starts with Shift+Space and stops with Escape */}
                {actionTitle('play-from-selection')}: {formatShortcut(shortcuts('play-from-selection')[0] ?? 'Shift+Space')},
                {' '}{actionTitle('stop')}: {formatShortcut('Esc')}.
                {' '}
                {webtr('Otherwise Space starts and stops playback and the middle mouse button moves the score.')}
            </p>
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
                            <span className="icon-glyph" aria-hidden="true">{String.fromCodePoint(p.icon)}</span>
                            {p.web ? webtr(p.title) : qtrc('preferences', p.title)}
                        </li>
                    ))}
                </ul>
                <div className="preferences-page" role="tabpanel">
                    {page === 'general' && <GeneralPage />}
                    {page === 'cloud' && <SaveAndPublishPage />}
                    {page === 'note-input' && <NoteInputPage />}
                    {page === 'import' && <ImportPage />}
                    {page === 'web' && <WebVersionPage />}
                </div>
            </div>
            <form method="dialog" className="dialog-buttons">
                <button className="primary" value="ok">{qtrc('global', 'OK')}</button>
            </form>
        </dialog>
    )
}
