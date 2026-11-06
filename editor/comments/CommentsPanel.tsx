/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The Comments panel (not in MuseScore; commentscontroller.ts): the comments of the score in the order of their
 * positions, each with its position (measure, staff), its text to edit and a delete button. A click on the position
 * selects it in the score; "Add comment" adds one at the selection.
 */
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { commentInfo, scoreComments, type ScoreComment } from '../../src/index'
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
    const grow = (): void => {
        const el = ref.current
        if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight + 2}px`
        }
    }
    useLayoutEffect(grow, [comment.text])
    useEffect(() => {
        if (!focus) {
            return
        }
        // after the menu that triggered add-comment returned the focus to the score
        const timer = setTimeout(() => {
            ref.current?.focus()
            ref.current?.scrollIntoView({ block: 'nearest' })
            focusDone()
        })
        return () => clearTimeout(timer)
    }, [focus])
    return (
        <textarea ref={ref} className="comment-text" rows={1} value={comment.text} aria-label={webtr('Comments')}
            placeholder="…" spellCheck
            onFocus={() => setActiveComment(comment.id)}
            onChange={(e) => setCommentText(comment.id, e.target.value)}
            onKeyDown={(e) => {
                // Escape returns to the score
                if (e.key === 'Escape') {
                    e.preventDefault()
                    document.getElementById('viewport')?.focus({ preventScroll: true })
                }
                e.stopPropagation() // no score shortcuts while typing
            }} />
    )
}

export function CommentsPanel(): React.JSX.Element {
    useLanguage()
    useActions()
    const view = useScoreView()
    const state = useCommentsView()
    const score = view.hasScore ? currentScore() : null
    const comments = score ? scoreComments(score).sortedComments() : []

    return (
        <div className="comments-panel">
            <div className="comments-controls">
                <button type="button" className="comments-add-button" disabled={!isActionEnabled('add-comment')}
                    onClick={() => triggerAction('add-comment')}>
                    {webtr('Add comment')}
                </button>
            </div>
            {!comments.length && <p className="comments-empty">{webtr('No comments. Select a note or a measure and add a comment.')}</p>}
            <ul className="comments-list">
                {comments.map((c) => {
                    const info = commentInfo(score!, c)
                    const position = [info.measureNo ? qtrc('engraving', 'Measure: %1').replace('%1', String(info.measureNo)) : '', info.staffName]
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
