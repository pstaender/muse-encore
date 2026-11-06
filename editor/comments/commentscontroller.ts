/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Comments (not in MuseScore; the library's comments/api.ts): notes on a position of the score, saved in the
 * .mscz in a way MuseScore keeps (a metaTag). The actions add-comment (at the selection: the start of a range, else
 * the first selected element) and toggle-comments (the Comments panel); the markers above the staves (elements on
 * the page elements in percent of the page, like the playback cursor; show-comments hides them) open the comment in
 * the panel. Comments are
 * not on the undo stack; changing them makes the score modified.
 */
import { addCommentAtSelection, commentMarkers, hasSelection, scoreComments, selectCommentElement, type MasterScore } from '../../src/index'
import { registerAction } from '../actions/actions'
import { isPanelOpen, setCurrentPanel, setPanelOpen, togglePanel } from '../panels/panels'
import { currentScore, onPagesBuilt, onScoreViewChanged, pageElement, pageInches, scoreSaved, scoreViewState, selectionChanged } from '../scoreview'
import { settings, updateSettings } from '../settings'
import { COMMENT_ICON_PATH } from '../../shared/icons'

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

export function setActiveComment(id: string): void {
    if (id !== s_state.active) {
        publish({ active: id })
    }
}

export function focusDone(): void {
    s_state = { ...s_state, focus: '' }
}

/** opens the Comments panel with the comment current (a click on its marker) */
export function showComment(id: string, focusText = false): void {
    if (!isPanelOpen(COMMENTS_PANEL)) {
        setPanelOpen(COMMENTS_PANEL, true)
    } else {
        setCurrentPanel(COMMENTS_PANEL)
    }
    publish({ active: id, focus: focusText ? id : s_state.focus })
}

/** selects the position of a comment in the score and scrolls it into view */
export function goToComment(id: string): void {
    const s = currentScore()
    setActiveComment(id)
    if (s && selectCommentElement(s, id)) {
        selectionChanged(true)
    }
}

export function addComment(): void {
    const s = currentScore()
    if (!s) {
        return
    }
    const c = addCommentAtSelection(s)
    if (c) {
        showComment(c.id, true)
    }
}

export function setCommentText(id: string, text: string): void {
    const m = master()
    if (m) {
        scoreComments(m).setText(id, text)
    }
}

export function removeComment(id: string): void {
    const m = master()
    if (m) {
        scoreComments(m).removeComment(id)
        if (s_state.active === id) {
            publish({ active: '' })
        }
    }
}

export function registerCommentsActions(): void {
    const scoreShown = (): boolean => scoreViewState().hasScore
    registerAction('add-comment', {
        run: addComment,
        enabled: () => {
            const s = currentScore()
            return !!s && hasSelection(s)
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

const SVG_NS = 'http://www.w3.org/2000/svg'

let s_markers: HTMLElement[] = []

function makeMarker(id: string, text: string, active: boolean): HTMLElement {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'comment-marker'
    el.classList.toggle('active', active)
    el.dataset.comment = id
    el.title = text.length > 300 ? `${text.slice(0, 300)}…` : text
    el.setAttribute('aria-label', text || 'Comment')
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', COMMENT_ICON_PATH)
    svg.append(path)
    el.append(svg)
    // the score view must not select or start a drag
    for (const type of ['pointerdown', 'mousedown', 'dblclick', 'contextmenu'] as const) {
        el.addEventListener(type, e => e.stopPropagation())
    }
    el.addEventListener('click', (e) => {
        e.stopPropagation()
        showComment(id)
        goToComment(id)
    })
    return el
}

function updateMarkers(): void {
    for (const m of s_markers) {
        m.remove()
    }
    s_markers = []
    const s = currentScore()
    if (!s || !settings().comments.show) {
        return
    }
    const comments = scoreComments(s)
    for (const m of commentMarkers(s)) {
        const pageEl = pageElement(m.page)
        const size = pageInches(m.page)
        if (!pageEl || !size) {
            continue
        }
        const el = makeMarker(m.id, comments.comment(m.id)?.text ?? '', m.id === s_state.active)
        el.style.left = `${m.x / size.width * 100}%`
        el.style.top = `${m.y / size.height * 100}%`
        el.style.width = `${m.width / size.width * 100}%`
        el.style.height = `${m.height / size.height * 100}%`
        pageEl.appendChild(el)
        s_markers.push(el)
    }
}

let s_score: MasterScore | null = null
let s_unlisten: (() => void) | null = null
let s_scoreVersion = -1

function scoreComponentsChanged(): void {
    updateMarkers()
    scoreSaved() // the modified flag
    publish({})
}

onScoreViewChanged(() => {
    const m = master()
    if (m !== s_score) {
        s_unlisten?.()
        s_score = m
        s_unlisten = m ? scoreComments(m).onChanged(scoreComponentsChanged) : null
        publish({ active: '', focus: '' })
    }
    const v = scoreViewState().scoreVersion
    if (v !== s_scoreVersion) {
        s_scoreVersion = v
        updateMarkers()
        publish({}) // the measure numbers in the panel
    }
})

onPagesBuilt(updateMarkers)

let s_active = ''
onCommentsViewChanged(() => {
    if (s_state.active !== s_active) {
        s_active = s_state.active
        for (const el of s_markers) {
            el.classList.toggle('active', el.dataset.comment === s_active)
        }
    }
})
