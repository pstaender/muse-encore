/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's SearchPopup (notationscene/qml/.../internal/SearchPopup.qml with SearchPopupModel, action "find"): the
 * "Find / Go to" bar below the score; every change of the text selects what it names (searchNotation) and the view
 * shows the selection. Enter and Escape close the bar.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { searchNotation } from '../../src/index'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

let s_visible = false
let s_key = 0
const listeners = new Set<() => void>()

function setVisible(v: boolean): void {
    s_visible = v
    if (v) {
        ++s_key
    }
    for (const l of listeners) {
        l()
    }
}

/** SearchPopupModel: the action "find" shows the popup (and focuses its text field) */
export function showSearchPopup(): void {
    setVisible(true)
}

function hide(): void {
    setVisible(false)
    document.getElementById('viewport')?.focus({ preventScroll: true })
}

export function SearchPopup(): React.JSX.Element | null {
    useLanguage()
    const state = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => (s_visible ? s_key : 0))
    const input = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (state) {
            input.current?.focus()
            input.current?.select()
        }
    }, [state])

    if (!state) {
        return null
    }
    const title = qtrc('notation', 'Find / Go to:')
    return (
        <div className="search-popup" role="search">
            <button type="button" className="icon-button" aria-label={qtrc('notation', 'Close search')} onClick={hide}>
                <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(ICON_CODES.CLOSE_X_ROUNDED)}</span>
            </button>
            <label>
                <span>{title}</span>
                <input ref={input} type="text" aria-label={title}
                    onChange={(e) => {
                        const score = currentScore()
                        if (score) {
                            searchNotation(score, e.target.value)
                            scoreChanged(true)
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault()
                            e.stopPropagation()
                            hide()
                        }
                    }} />
            </label>
        </div>
    )
}
