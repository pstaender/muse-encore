/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The handlers of the actions the app implements (like MuseScore's ApplicationActionController,
 * ProjectActionsController, NotationActionController), and the app's own actions (the page view toolbar of the
 * web viewer).
 */
import { removeAllScores } from '../db'
import { ICON_CODES } from './uiactiondata'
import {
    centerPage, goToPage, lastPage, onScoreViewChanged, print, scoreViewState, setFitMode, setOrientation,
    showShortcutsHelp, stepPage, toggleFullscreen, toggleSpread, zoomAt, zoomStep,
} from '../scoreview'
import {
    canSave, chooseFile, closeScore, forgetScore, onSessionChanged, saveCopy, saveScore, saveScoreAs, session, showDialog,
    showNewScoreDialog,
} from '../session'
import { isToolBarVisible, onToolBarLayoutChanged, restoreDefaultLayout, setStatusBarVisible, setToolBarVisible, toolBarLayout } from '../toolbars/layout'
import { currentLanguage } from '../i18n'
import { registerPanelActions } from '../panels/PanelDock'
import { isPanelOpen, onPanelsChanged, togglePanel } from '../panels/panels'
import { actionsChanged, isActionEnabled, registerAction, triggerAction } from './actions'
import { registerNotationActions } from './notationactions'
import { registerPlaybackActions } from '../playback/playbackcontroller'
import '../playback/playbackview'

const scoreShown = (): boolean => scoreViewState().hasScore && session().view === 'score'
const hasScore = (): boolean => !!session().current

function openUrl(url: string): void {
    window.open(url, '_blank', 'noopener')
}

export function registerAppActions(): void {
    // ---- file ----
    registerAction('file-new', { run: () => showNewScoreDialog(true) })
    registerAction('file-open', { run: () => void chooseFile() })
    registerAction('file-close', { run: closeScore, enabled: hasScore })
    // saving: in this browser (IndexedDB), and to the file on the computer the score was opened from or saved to;
    // a copy is saved on the computer (.mscz)
    registerAction('file-save', { run: () => void saveScore(), enabled: canSave })
    registerAction('file-save-as', { run: () => void saveScoreAs(), enabled: canSave })
    registerAction('file-save-a-copy', { run: () => void saveCopy(), enabled: canSave })
    registerAction('clear-recent', { run: () => showDialog('clearRecent') })
    registerAction('print', { run: () => void print(), enabled: scoreShown })

    // ---- edit ----
    registerAction('preference-dialog', { run: () => showDialog('preferences') })
    // the editing and note input actions (incl. undo/redo, select all, escape): notationactions.ts
    registerNotationActions()
    // ApplicationActionController::doGlobalUndo etc.: the global shortcuts go to the notation when it is shown
    for (const name of ['undo', 'redo', 'delete', 'cancel']) {
        const target = `action://notation/${name}`
        registerAction(`action://${name}`, { run: () => void triggerAction(target), enabled: () => isActionEnabled(target), context: 'notation' })
    }

    // ---- view ----
    registerAction('fullscreen', { run: toggleFullscreen, checked: () => scoreViewState().fullscreen }, { icon: ICON_CODES.SPLIT_OUT_ARROWS })
    registerAction('toggle-noteinput', {
        run: () => setToolBarVisible('noteInputBar', !isToolBarVisible('noteInputBar')),
        checked: () => isToolBarVisible('noteInputBar'),
    })
    registerAction('toggle-transport', {
        run: () => setToolBarVisible('playbackToolBar', !isToolBarVisible('playbackToolBar')),
        checked: () => isToolBarVisible('playbackToolBar'),
    })
    registerAction('toggle-viewtoolbar', {
        run: () => setToolBarVisible('viewToolBar', !isToolBarVisible('viewToolBar')),
        checked: () => isToolBarVisible('viewToolBar'),
    }, { title: [null, 'Page view toolbar'], checkable: true })
    registerAction('toggle-statusbar', {
        run: () => setStatusBarVisible(!toolBarLayout().statusBar),
        checked: () => toolBarLayout().statusBar,
    })
    registerAction('dock-restore-default-layout', { run: restoreDefaultLayout })
    // the panels (ApplicationActionController::toggleDock; enabled with a score: UiCtxProjectOpened)
    for (const [code, panel] of [['toggle-palettes', 'palettesPanel'], ['toggle-instruments', 'instrumentsPanel'], ['inspector', 'inspectorPanel']]) {
        registerAction(code, { run: () => togglePanel(panel), enabled: scoreShown, checked: () => isPanelOpen(panel) })
    }
    registerPanelActions()

    // ---- zoom and pages (MuseScore: NotationActionController) ----
    registerAction('zoomin', { run: () => zoomStep(1), enabled: scoreShown })
    registerAction('zoomout', { run: () => zoomStep(-1), enabled: scoreShown })
    registerAction('zoom100', { run: () => zoomAt(100), enabled: scoreShown })
    registerAction('zoom-page-width', { run: () => setFitMode('page-width'), enabled: scoreShown })
    registerAction('zoom-whole-page', { run: () => setFitMode('whole-page'), enabled: scoreShown })
    registerAction('page-prev', { run: () => stepPage(-1), enabled: () => scoreShown() && scoreViewState().canPrev },
        { title: [null, 'Previous page'], icon: ICON_CODES.CHEVRON_LEFT })
    registerAction('page-next', { run: () => stepPage(1), enabled: () => scoreShown() && scoreViewState().canNext },
        { title: [null, 'Next page'], icon: ICON_CODES.CHEVRON_RIGHT })
    registerAction('page-top', { run: () => goToPage(0), enabled: scoreShown })
    registerAction('page-end', { run: () => goToPage(lastPage()), enabled: scoreShown })

    // ---- the page view toolbar of the web viewer ----
    registerAction('view-pages-horizontal', {
        run: () => setOrientation('horizontal'), enabled: scoreShown, checked: () => scoreViewState().orientation === 'horizontal',
    }, { title: [null, 'Pages side by side'], icon: 0xEF1C, checkable: true })
    registerAction('view-pages-vertical', {
        run: () => setOrientation('vertical'), enabled: scoreShown, checked: () => scoreViewState().orientation === 'vertical',
    }, { title: [null, 'Pages vertically'], icon: 0xF3AF, checkable: true })
    registerAction('view-two-pages', {
        run: toggleSpread, enabled: () => scoreShown() && scoreViewState().spreadAvailable, checked: () => scoreViewState().spread,
    }, { title: [null, 'Two pages'], description: [null, 'Two pages (for scores with a two-sided page layout)'], icon: 0xEF7F, checkable: true })
    registerAction('view-center-page', { run: () => centerPage(), enabled: scoreShown },
        { title: [null, 'Center page'], icon: 0xF48C })
    registerAction('view-shortcuts-help', { run: showShortcutsHelp }, { title: [null, '?'], description: [null, 'Keyboard shortcuts'] })

    // ---- playback (PlaybackController) ----
    registerPlaybackActions()

    // ---- help (ApplicationActionController) ----
    registerAction('online-handbook', { run: () => openUrl(`https://handbook.musescore.org?tag=handbook&locale=${currentLanguage()}`) })
    registerAction('ask-help', { run: () => openUrl(`https://musescore.org/redirect/post/question?locale=${currentLanguage()}`) })
    registerAction('accessibility-statement', { run: () => openUrl('https://musescore.org/about/musescore-studio-accessibility-statement') })
    registerAction('about-musescore', { run: () => showDialog('about') })
    registerAction('revert-factory', { run: () => showDialog('revertFactory') })

    // the states depend on the session, the score view and the toolbars
    onSessionChanged(actionsChanged)
    onScoreViewChanged(actionsChanged)
    onToolBarLayoutChanged(actionsChanged)
    onPanelsChanged(actionsChanged)
}

/** "Clear recent" confirmed: the stored scores are removed (they are the recent list here) */
export async function clearRecentScores(): Promise<void> {
    const cur = session().current
    if (cur?.id) {
        forgetScore(cur.id)
    }
    await removeAllScores()
}
