/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Comments (not in MuseScore; the library's comments/api.ts): notes on the score, saved in the .mscz in a way MuseScore
 * keeps (a metaTag), changed through the undo stack. The actions add-comment (attached to the selected element, or to
 * the start of a range) and toggle-comments (View > Comments: the Comments panel; the markers are shown while it is
 * open); the markers above the staves (shared/comments/markers.ts: subtle, the text on hover, a click opens the comment
 * in the panel and selects it, a double click edits its text there, a drag moves the marker relative to its anchor, with a line to it). The active comment
 * (clicked, or edited in the panel) is highlighted and in front. A selected comment (its marker or its entry in the
 * panel clicked; the score's selection is cleared) takes the notation's delete (Delete/Backspace), copy and cut;
 * a copied comment is pasted at the score's selection (attached to the selected element).
 */
import {
    addCommentAtSelection, canAddCommentAtSelection, canPasteCommentAtSelection, clearSelection, COMMENT_MIME_FORMAT,
    commentMarkers, commentMimeData, hasSelection, moveComment, pasteCommentAtSelection, removeComment as removeScoreComment,
    scoreComments, selectCommentElement, setCommentText as setScoreCommentText, type MasterScore,
} from '../../src/index'
import { CommentMarkersView } from '../../shared/comments/markers'
import { registerAction } from '../actions/actions'
import { isPanelOpen, onPanelsChanged, setCurrentPanel, setPanelOpen, togglePanel } from '../panels/panels'
import {
    currentScore, onPagesBuilt, onScoreViewChanged, pageElement, pageInches, scoreChanged, scoreViewState, selectionChanged,
    setClipboardExtension, viewport,
} from '../scoreview'
import './comments.css'

export const COMMENTS_PANEL = 'commentsPanel'

interface CommentsViewState {
    /** the comment shown as current (highlighted in the panel and on the score) */
    active: string
    /** the selected comment (delete, copy and cut take it; the score has no selection then) */
    selected: string
    /** a comment whose text field gets the focus (a new comment) */
    focus: string
    version: number
}

let s_state: CommentsViewState = { active: '', selected: '', focus: '', version: 0 }
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

/**
 * selects a comment (and clears the score's selection: one selection at a time); '' = none. The score view gets the
 * focus: its keys (Delete/Backspace) and the clipboard events take the selected comment.
 */
export function selectComment(id: string): void {
    const s = currentScore()
    if (id) {
        viewport.focus({ preventScroll: true })
        // Firefox sends the clipboard events to the node of the page's selection (e.g. still in the text field of a
        // comment edited before), not to the focused element
        window.getSelection()?.removeAllRanges()
        setActiveComment(id, true)
        if (s && hasSelection(s) && clearSelection(s)) {
            selectionChanged()
        }
    }
    s_markers.setSelected(id)
    if (id !== s_state.selected) {
        publish({ selected: id })
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
        if (s_state.selected === id) {
            selectComment('')
        }
    }
}

// the notation's delete, copy, cut and paste of comments (scoreview.ts)
setClipboardExtension({
    formats: [COMMENT_MIME_FORMAT],
    selectedData: () => {
        const s = currentScore()
        return s && s_state.selected ? commentMimeData(s, s_state.selected) : null
    },
    removeSelected: () => removeComment(s_state.selected),
    canPaste: (data) => {
        const s = currentScore()
        return !!s && canPasteCommentAtSelection(s, data[COMMENT_MIME_FORMAT] ?? '')
    },
    paste: (data) => {
        const s = currentScore()
        const c = s ? pasteCommentAtSelection(s, data[COMMENT_MIME_FORMAT] ?? '') : null
        if (c && isPanelOpen(COMMENTS_PANEL)) {
            setActiveComment(c.id)
        }
        return !!c
    },
})

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
}

// ---------------------------------------------------------------------------------
//   the markers on the score
// ---------------------------------------------------------------------------------

const s_markers = new CommentMarkersView({
    pageElement,
    pageInches,
    onClick: (id) => {
        showComment(id)
        selectComment(id)
    },
    // the comment's text field in the panel
    onDoubleClick: id => showComment(id, true),
    onMove: (id, ddx, ddy) => {
        const s = currentScore()
        const c = s ? scoreComments(s).comment(id) : null
        if (s && c && moveComment(s, id, c.dx + ddx, c.dy + ddy)) {
            scoreChanged(false)
        }
        setActiveComment(id)
    },
})

function updateMarkers(): void {
    const s = currentScore()
    // View > Comments (the panel) shows and hides them
    if (!s || !isPanelOpen(COMMENTS_PANEL)) {
        s_markers.clear()
        return
    }
    const comments = scoreComments(s)
    s_markers.update(commentMarkers(s).map(m => ({ ...m, text: comments.comment(m.id)?.text ?? '' })))
}

let s_score: MasterScore | null = null
let s_unlisten: (() => void) | null = null
let s_scoreVersion = -1
let s_selectionVersion = -1

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
        selectComment('')
        publish({ focus: '' })
    }
    // something selected in the score: the comment is not selected any more
    const sel = scoreViewState().selectionVersion
    if (sel !== s_selectionVersion) {
        s_selectionVersion = sel
        const s = currentScore()
        if (s_state.selected && s && hasSelection(s)) {
            selectComment('')
        }
    }
    const v = scoreViewState().scoreVersion
    if (v !== s_scoreVersion) {
        s_scoreVersion = v
        updateMarkers()
        publish({}) // the measure numbers in the panel
    }
})

onPagesBuilt(updateMarkers)

let s_panelOpen = isPanelOpen(COMMENTS_PANEL)
onPanelsChanged(() => {
    if (isPanelOpen(COMMENTS_PANEL) !== s_panelOpen) {
        s_panelOpen = isPanelOpen(COMMENTS_PANEL)
        updateMarkers()
    }
})

// a click on the score ends the active comment (its text is hidden, its marker subtle again)
document.getElementById('viewport')?.addEventListener('pointerdown', () => {
    setActiveComment('')
    selectComment('')
})
