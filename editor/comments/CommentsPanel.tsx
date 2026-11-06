/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The Comments panel (not in MuseScore; commentscontroller.ts): the comments of the score in the order of their
 * positions, each with its position (measure, staff, the element it is attached to), its text and a delete button. The
 * text is set (one undoable command) when its field loses the focus; a click on the position selects it in the score;
 * "Add comment" adds one at the selection. The text may use **bold**, *italic* and ~~strikethrough~~.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { commentList, type ScoreComment } from '../../src/index'
import { isActionEnabled, triggerAction, useActions } from '../actions/actions'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, useLanguage, webtr } from '../i18n'
import type { MenuItem } from '../menus/appmenu'
import { currentScore, useScoreView } from '../scoreview'
import {
    commentsViewState, focusDone, goToComment, onCommentsViewChanged, removeComment, setActiveComment, setCommentText,
} from './commentscontroller'

function useCommentsView(): ReturnType<typeof commentsViewState> {
    return useSyncExternalStore(onCommentsViewChanged, commentsViewState)
}

/** the menu of the panel's tab */
export function commentsPanelMenu(): MenuItem[] {
    return [{ kind: 'action', code: 'add-comment' }, { kind: 'action', code: 'show-comments' }]
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function CommentText({ comment, focus }: { comment: ScoreComment; focus: boolean }): React.JSX.Element {
    const ref = useRef<HTMLTextAreaElement>(null)
    const [text, setText] = useState(comment.text)
    const editing = useRef(false)
    const latest = useRef({ id: comment.id, text, saved: comment.text })
    latest.current = { id: comment.id, text, saved: comment.text }

    // undo/redo: the comment's text changed while the field is not edited
    useEffect(() => {
        if (!editing.current) {
            setText(comment.text)
        }
    }, [comment.text])
    // the panel is closed while the text is edited (no blur event)
    useEffect(() => () => {
        const l = latest.current
        if (editing.current && l.text !== l.saved) {
            setCommentText(l.id, l.text)
        }
    }, [])

    const grow = (): void => {
        const el = ref.current
        if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight + 2}px`
        }
    }
    useLayoutEffect(grow, [text])
    useEffect(() => {
        if (!focus) {
            return
        }
        // after the menu that triggered add-comment returned the focus to the score; the request ends when the field
        // has the focus (opening the panel can mount it again)
        const timers = [0, 100, 300].map(t => setTimeout(() => {
            if (ref.current && document.activeElement !== ref.current) {
                ref.current.focus()
                ref.current.scrollIntoView({ block: 'nearest' })
            }
        }, t))
        return () => timers.forEach(clearTimeout)
    }, [focus])
    const commit = (): void => {
        if (text !== comment.text) {
            setCommentText(comment.id, text)
        }
    }
    return (
        <textarea ref={ref} className="comment-text" rows={1} value={text} aria-label={webtr('Comments')}
            placeholder="…" spellCheck
            onFocus={() => {
                focusDone()
                editing.current = true
                setActiveComment(comment.id, true)
            }}
            onBlur={() => {
                editing.current = false
                commit()
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                // Escape (or Ctrl+Enter) sets the text and returns to the score
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault()
                    document.getElementById('viewport')?.focus({ preventScroll: true })
                }
                e.stopPropagation() // no score shortcuts while typing (Ctrl+Z is the text field's undo)
            }} />
    )
}

export function CommentsPanel(): React.JSX.Element {
    useLanguage()
    useActions()
    const view = useScoreView()
    const state = useCommentsView()
    const score = view.hasScore ? currentScore() : null
    const items = score ? commentList(score) : []

    return (
        <div className="comments-panel">
            <div className="comments-controls">
                <button type="button" className="comments-add-button" disabled={!isActionEnabled('add-comment')}
                    onClick={() => triggerAction('add-comment')}>
                    {webtr('Add comment')}
                </button>
            </div>
            {!items.length && <p className="comments-empty">{webtr('No comments. Select a note or a measure and add a comment.')}</p>}
            <ul className="comments-list">
                {items.map(({ comment: c, measureNo, staffName, elementName }) => {
                    const position = [measureNo ? qtrc('engraving', 'Measure: %1').replace('%1', String(measureNo)) : '', staffName, elementName]
                        .filter(Boolean).join(' · ')
                    return (
                        <li key={c.id} className={`comment${c.id === state.active ? ' active' : ''}`}>
                            <div className="comment-header">
                                <button type="button" className="comment-position" title={position} onClick={() => goToComment(c.id)}>
                                    {position}
                                </button>
                                <button type="button" className="tool-button comment-delete" title={qtrc('global', 'Delete')}
                                    aria-label={qtrc('global', 'Delete')} onClick={() => removeComment(c.id)}>
                                    <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(ICON_CODES.DELETE_TANK)}</span>
                                </button>
                            </div>
                            <CommentText comment={c} focus={state.focus === c.id} />
                            <div className="comment-date">{[c.author, formatDate(c.modified)].filter(Boolean).join(' · ')}</div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
