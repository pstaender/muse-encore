/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The Comments panel (not in MuseScore; commentscontroller.ts): the comments of the score in the order of their
 * positions, each with its position (measure, staff, the element it is attached to) and its text. A click on a comment
 * (not on its text) selects it (the score view keeps the focus: Delete/Backspace removes it, Ctrl+C/Ctrl+X
 * copy/cut it, scoreview.ts); a double click
 * edits its text. The text is set (one undoable command) when its field loses the focus (Enter; Shift+Enter: a new
 * line); a click on the position selects it in the score;
 * "Add comment" adds one at the selection. The text may use **bold**, *italic* and ~~strikethrough~~.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { commentList, type ScoreComment } from '../../src/index'
import { isActionEnabled, triggerAction, useActions } from '../actions/actions'
import { qtrc, useLanguage, webtr } from '../i18n'
import type { MenuItem } from '../menus/appmenu'
import { currentScore, useScoreView } from '../scoreview'
import {
    commentsViewState, focusDone, goToComment, onCommentsViewChanged, selectComment, setActiveComment,
    setCommentText,
} from './commentscontroller'

function useCommentsView(): ReturnType<typeof commentsViewState> {
    return useSyncExternalStore(onCommentsViewChanged, commentsViewState)
}

/** the menu of the panel's tab */
export function commentsPanelMenu(): MenuItem[] {
    return [{ kind: 'action', code: 'add-comment' }]
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
                selectComment('')
                editing.current = true
                setActiveComment(comment.id, true)
            }}
            onBlur={() => {
                editing.current = false
                commit()
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                // Enter (or Escape) sets the text and returns to the score with the comment selected (Ctrl+C copies
                // it); Shift+Enter: a new line
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
                    e.preventDefault()
                    selectComment(comment.id)
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
                        <li key={c.id}
                            className={`comment${c.id === state.active ? ' active' : ''}${c.id === state.selected ? ' selected' : ''}`}
                            onClick={(e) => {
                                if (!(e.target as Element).closest('textarea, button')) {
                                    selectComment(c.id)
                                }
                            }}
                            onDoubleClick={(e) => {
                                // edits the text
                                if (!(e.target as Element).closest('textarea, button')) {
                                    e.currentTarget.querySelector('textarea')?.focus()
                                }
                            }}
>
                            <div className="comment-header">
                                <button type="button" className="comment-position" title={position} onClick={() => goToComment(c.id)}>
                                    {position}
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
