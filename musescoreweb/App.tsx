/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app frame (like MuseScore's main window): menu bar, the tabs "Home" and "Score" with the main toolbars,
 * the toolbar rows, the home screen or the score (with its tab), the status bar and the dialogs.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { actionsChanged, registerAction, useActions } from './actions/actions'
import { clearRecentScores } from './actions/appactions'
import { ConcertPitchControl } from './components/ConcertPitchControl'
import { ViewModeControl } from './components/ViewModeControl'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MenuBar } from './components/Menu'
import { MigrationDialog } from './dialogs/MigrationDialog'
import { AboutDialog } from './dialogs/AboutDialog'
import { TransposeDialog } from './dialogs/TransposeDialog'
import { PreferencesDialog } from './dialogs/PreferencesDialog'
import { SaveScoreDialog } from './dialogs/SaveScoreDialog'
import { useScores } from './db'
import { ScoresPage } from './home/ScoresPage'
import { qtrc, useLanguage } from './i18n'
import { appMenu, setRecentScoresProvider, type MenuItem } from './menus/appmenu'
import { NewScoreDialog } from './newscore/NewScoreDialog'
import { PanelDock } from './panels/PanelDock'
import { resetPalettesState } from './panels/palettes/palettestate'
import { setChrome, useScoreView, viewport, viewShown } from './scoreview'
import { answerDialog, closeScore, openStored, saveChangesTitle, setView, showDialog, useSession } from './session'
import { resetSettings } from './settings'
import { ToolBarDock, ToolBarRows, toolbarMenuItems } from './toolbars/ToolBars'
import { restoreDefaultLayout, useToolBarLayout } from './toolbars/layout'

const MAX_RECENT_IN_MENU = 20

/** MuseScore's status bar shows the accessibility info as rich text: instrument names may contain markup */
function plainText(s: string): string {
    return new DOMParser().parseFromString(s, 'text/html').body.textContent ?? s
}

/** "Do you want to save changes … before closing?" (ProjectActionsController::askAboutSavingScore) */
function SaveChangesDialog({ onClose }: { onClose: (answer: unknown) => void }): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="confirm" aria-labelledby="save-changes-title"
            onClose={() => onClose(ref.current?.returnValue || 'cancel')}>
            <h2 id="save-changes-title">{saveChangesTitle()}</h2>
            <p>{qtrc('project', 'Your changes will be lost if you don’t save them.')}</p>
            <form method="dialog" className="dialog-buttons">
                <button className="secondary" value="dontSave">{qtrc('global', 'Don’t save')}</button>
                <button className="secondary" value="cancel">{qtrc('global', 'Cancel')}</button>
                <button className="primary" value="save" autoFocus>{qtrc('global', 'Save')}</button>
            </form>
        </dialog>
    )
}

/** StartupScenario::restoreLastSession: a question with the buttons No and Yes */
function RestoreSessionDialog({ onClose }: { onClose: (answer: unknown) => void }): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="confirm restore-session" aria-labelledby="restore-session-title"
            onClose={() => onClose(ref.current?.returnValue === 'yes')}>
            <h2 id="restore-session-title">{qtrc('appshell', 'The previous session quit unexpectedly.')}</h2>
            <p>{qtrc('appshell', 'Do you want to restore the session?')}</p>
            <form method="dialog" className="dialog-buttons">
                <button className="secondary" value="no">{qtrc('global', 'No')}</button>
                <button className="primary" value="yes" autoFocus>{qtrc('global', 'Yes')}</button>
            </form>
        </dialog>
    )
}

function StatusBar(): React.JSX.Element {
    const v = useScoreView()
    return (
        <footer className={`statusbar${v.statusError ? ' error' : ''}`}>
            <span id="status" aria-live="polite">{v.selection ? plainText(v.selection) : v.status}</span>
            <span className="statusbar-separator" aria-hidden="true" />
            <ConcertPitchControl />
            <span className="statusbar-separator" aria-hidden="true" />
            <ViewModeControl />
        </footer>
    )
}

/** the tab of the open score above the score (MuseScore's NotationSwitchPanel) */
function NotationTab(): React.JSX.Element | null {
    useLanguage()
    const v = useScoreView()
    if (!v.hasScore) {
        return null
    }
    return (
        <div className="notation-tabs" role="tablist" aria-label={qtrc('notation', 'Scores')}>
            <div className="notation-tab" role="tab" aria-selected="true" title={v.tooltip}>
                <span id="title" className="notation-tab-title">{(v.modified ? '*' : '') + v.title}</span>
                <button id="clear" className="icon" title={qtrc('global', 'Close')} aria-label={qtrc('global', 'Close')} onClick={closeScore}>
                    {''}
                </button>
            </div>
        </div>
    )
}

export function App(): React.JSX.Element {
    useLanguage()
    useActions()
    const session = useSession()
    // the answer of the shown question (answerDialog ignores the late close event of an earlier dialog)
    const question = session.question
    const answer = (a: unknown): void => answerDialog(a, question)
    const layout = useToolBarLayout()
    const scores = useScores()
    const chromeRef = useRef<HTMLDivElement>(null)
    const bottomRef = useRef<HTMLDivElement>(null)
    const sideRef = useRef<HTMLDivElement>(null)
    const viewportHost = useRef<HTMLDivElement>(null)

    // the score view (plain DOM, scoreview.ts) lives in this frame
    useLayoutEffect(() => {
        viewportHost.current?.appendChild(viewport)
        if (chromeRef.current) {
            setChrome(chromeRef.current)
        }
        if (bottomRef.current) {
            setChrome(bottomRef.current, 'bottom')
        }
        if (sideRef.current) {
            setChrome(sideRef.current, 'side')
        }
    }, [])

    // File > Open recent
    useEffect(() => {
        const recent = (scores ?? []).slice(0, MAX_RECENT_IN_MENU)
        for (const e of recent) {
            registerAction(`file-open-recent:${e.id}`, { run: () => void openStored(e.id) }, { title: [null, e.name] })
        }
        setRecentScoresProvider(() => recent.map((e): MenuItem => ({ kind: 'action', code: `file-open-recent:${e.id}` })))
        actionsChanged()
    }, [scores])

    // the layout of the toolbars changes the height of the score view
    useEffect(() => {
        if (session.view === 'score') {
            viewShown()
        }
    }, [layout, session.view])

    const score = session.view === 'score'
    return (
        <>
            <div id="chrome" ref={chromeRef} className="chrome">
                <MenuBar menus={appMenu(toolbarMenuItems)} />
                <div className="tabs-row">
                    <nav className="app-tabs" aria-label={qtrc('appshell', 'Main toolbar')}>
                        <div role="tablist">
                            <button role="tab" aria-selected={session.view === 'home'} onClick={() => setView('home')}>
                                {qtrc('appshell', 'Home')}
                            </button>
                            <button role="tab" aria-selected={score} disabled={!session.current}
                                title={session.current?.name} onClick={() => setView('score')}>
                                {qtrc('appshell', 'Score')}
                            </button>
                        </div>
                    </nav>
                    {score && <ToolBarDock dock="main" />}
                </div>
                {score && <ToolBarRows />}
            </div>
            {session.view === 'home' && <ScoresPage />}
            <div className="notation-row" hidden={!score}>
                <div ref={sideRef} className="side-chrome">{score && <PanelDock />}</div>
                <div className="score-area">
                    <NotationTab />
                    <div ref={viewportHost} className="viewport-host" />
                </div>
            </div>
            <div ref={bottomRef} className="bottom-chrome">
                {score && <ToolBarDock dock="bottom" />}
                {score && layout.statusBar && <StatusBar />}
            </div>

            {session.newScoreDialog && <NewScoreDialog />}
            {session.dialog === 'preferences' && <PreferencesDialog onClose={() => showDialog(null)} />}
            {session.dialog === 'about' && <AboutDialog onClose={() => showDialog(null)} />}
            {session.dialog === 'transpose' && <TransposeDialog onClose={() => showDialog(null)} />}
            {session.dialog === 'saveChanges' && <SaveChangesDialog key={session.question} onClose={answer} />}
            {session.dialog === 'saveAs' && <SaveScoreDialog key={session.question} name={session.saveAsName} onClose={answer} />}
            {session.dialog === 'restoreSession' && <RestoreSessionDialog key={session.question} onClose={answer} />}
            {session.dialog === 'migration' && session.migration && (
                <MigrationDialog key={session.question} question={session.migration} onClose={answer} />
            )}
            {session.dialog === 'clearRecent' && (
                <ConfirmDialog
                    title={qtrc('appshell/menu/file', 'Clear recent')}
                    message="All scores are removed from this browser. Scores created here cannot be restored, they are not saved anywhere else."
                    confirmLabel={qtrc('global', 'Remove')}
                    onClose={(ok) => {
                        showDialog(null)
                        if (ok) {
                            void clearRecentScores()
                        }
                    }} />
            )}
            {session.dialog === 'revertFactory' && (
                <ConfirmDialog
                    title={qtrc('appshell', 'Are you sure you want to revert to factory settings?')}
                    message={qtrc('appshell', 'This action will reset all your app preferences and delete all custom palettes and custom shortcuts. The list of recent scores will also be cleared.') + ' (Scores stored in this browser are kept.)'}
                    confirmLabel={qtrc('appshell', 'Revert')}
                    onClose={(ok) => {
                        showDialog(null)
                        if (ok) {
                            resetSettings()
                            restoreDefaultLayout()
                            resetPalettesState()
                        }
                    }} />
            )}
        </>
    )
}
