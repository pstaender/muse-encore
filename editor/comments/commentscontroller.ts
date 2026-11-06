/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Comments (not in MuseScore; the library's comments/api.ts): notes on the score, saved in the .mscz in a way MuseScore
 * keeps (a metaTag), changed through the undo stack. The actions add-comment (attached to the selected element, or to
 * the start of a range), toggle-comments (the Comments panel) and show-comments; the markers above the staves
 * (shared/comments/markers.ts: the text on hover, a click opens the comment in the panel, a drag moves the marker
 * relative to its anchor). The markers are subtle (gray, behind the notation) unless the Comments panel is the
 * current panel; the active comment is highlighted and in front.
 */
import {
    addCommentAtSelection, canAddCommentAtSelection, commentMarkers, moveComment, removeComment as removeScoreComment,
    scoreComments, selectCommentElement, setCommentText as setScoreCommentText, type MasterScore,
} from '../../src/index'
import { CommentMarkersView } from '../../shared/comments/markers'
import { registerAction } from '../actions/actions'
import { isPanelOpen, onPanelsChanged, panelsState, setCurrentPanel, setPanelOpen, togglePanel } from '../panels/panels'
import {
    currentScore, onPagesBuilt, onScoreViewChanged, pageElement, pageInches, scoreChanged, scoreViewState, selectionChanged,
} from '../scoreview'
import { settings, updateSettings } from '../settings'
import './comments.css'

export const COMMENTS_PANEL = 'commentsPanel'

interface CommentsViewState {
    /** the comment shown as current (highlighted in the panel and on the score) */
    active: string
    /** a comment whose text field gets the focus (a new comment) */
    focus: string
    version: number
}

let s_state: CommentsViewState = { active: '', focus: '', version: 0 }
const listeners = new Set<() => void>()

function publish(next: Partial<CommentsViewState>): void {
    s_state = { ...s_state, ...next, version: s_state.version + 1 }
    for (const l of listeners) {
        l()
    }
}

export function commentsViewState(): CommentsViewState {
    return s_state
}

export function onCommentsViewChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function master(): MasterScore | null {
    return currentScore()?.masterScore() ?? null
}

/** the comment highlighted in the panel and on the score; `pin`: its text is shown next to the marker */
export function setActiveComment(id: string, pin = false): void {
    s_markers.setActive(id, pin)
    if (id !== s_state.active) {
        publish({ active: id })
    }
}

export function focusDone(): void {
    if (s_state.focus) {
        publish({ focus: '' })
    }
}

/** opens the Comments panel with the comment current */
export function showComment(id: string, focusText = false): void {
    if (!isPanelOpen(COMMENTS_PANEL)) {
        setPanelOpen(COMMENTS_PANEL, true)
    } else {
        setCurrentPanel(COMMENTS_PANEL)
    }
    s_markers.setActive(id, true)
    publish({ active: id, focus: focusText ? id : s_state.focus })
}

/** selects the position of a comment in the score and scrolls it into view */
export function goToComment(id: string): void {
    const s = currentScore()
    setActiveComment(id, true)
    if (s && selectCommentElement(s, id)) {
        selectionChanged(true)
    }
}

export function addComment(): void {
    const s = currentScore()
    const c = s ? addCommentAtSelection(s) : null
    if (c) {
        scoreChanged(false)
        showComment(c.id, true)
    }
}

/** the text of a comment (undoable; the panel sets it when its text field loses the focus) */
export function setCommentText(id: string, text: string): void {
    const s = currentScore()
    if (s && setScoreCommentText(s, id, text)) {
        scoreChanged(false)
    }
}

export function removeComment(id: string): void {
    const s = currentScore()
    if (s && removeScoreComment(s, id)) {
        scoreChanged(false)
        if (s_state.active === id) {
            setActiveComment('')
        }
    }
}

export function registerCommentsActions(): void {
    const scoreShown = (): boolean => scoreViewState().hasScore
    registerAction('add-comment', {
        run: addComment,
        enabled: () => {
            const s = currentScore()
            return !!s && canAddCommentAtSelection(s)
        },
    }, { title: [null, 'Add comment'], description: [null, 'Add comment'], icon: 0 })
    registerAction('toggle-comments', {
        run: () => togglePanel(COMMENTS_PANEL),
        enabled: scoreShown,
        checked: () => isPanelOpen(COMMENTS_PANEL),
    }, { title: [null, 'Comments'], checkable: true, icon: 0 })
    registerAction('show-comments', {
        run: () => {
            updateSettings('comments', { show: !settings().comments.show })
            updateMarkers()
        },
        enabled: scoreShown,
        checked: () => settings().comments.show,
    }, { title: [null, 'Show comments'], checkable: true, icon: 0 })
}

// ---------------------------------------------------------------------------------
//   the markers on the score
// ---------------------------------------------------------------------------------

const s_markers = new CommentMarkersView({
    pageElement,
    pageInches,
    onClick: (id) => {
        showComment(id)
        goToComment(id)
    },
    onMove: (id, ddx, ddy) => {
        const s = currentScore()
        const c = s ? scoreComments(s).comment(id) : null
        if (s && c && moveComment(s, id, c.dx + ddx, c.dy + ddy)) {
            scoreChanged(false)
        }
        setActiveComment(id)
    },
})

/** the Comments panel is shown: the markers are not subtle */
function commentsPanelShown(): boolean {
    const p = panelsState()
    return p.open.includes(COMMENTS_PANEL) && p.current === COMMENTS_PANEL && !p.collapsed
}

function updateMarkers(): void {
    const s = currentScore()
    if (!s || !settings().comments.show) {
        s_markers.clear()
        return
    }
    const comments = scoreComments(s)
    s_markers.update(commentMarkers(s).map(m => ({ ...m, text: comments.comment(m.id)?.text ?? '' })))
}

let s_score: MasterScore | null = null
let s_unlisten: (() => void) | null = null
let s_scoreVersion = -1

onScoreViewChanged(() => {
    const m = master()
    if (m !== s_score) {
        s_unlisten?.()
        s_score = m
        // undo/redo of a comment command
        s_unlisten = m ? scoreComments(m).onChanged(() => {
            updateMarkers()
            publish({})
        }) : null
        setActiveComment('')
        publish({ focus: '' })
    }
    const v = scoreViewState().scoreVersion
    if (v !== s_scoreVersion) {
        s_scoreVersion = v
        updateMarkers()
        publish({}) // the measure numbers in the panel
    }
})

onPagesBuilt(updateMarkers)

s_markers.setSubtle(!commentsPanelShown())
onPanelsChanged(() => s_markers.setSubtle(!commentsPanelShown()))

// a click on the score ends the active comment (its text is hidden, its marker subtle again)
document.getElementById('viewport')?.addEventListener('pointerdown', () => setActiveComment(''))
