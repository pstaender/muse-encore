/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's NotationSwitchPanel (notationscene NotationView.qml with NotationSwitchListModel): the tabs of the score
 * and its open parts above the score view. The score's tab closes the score, a part's tab closes the part.
 * TODO(port): the tabs' context menu (close tab / close other tabs / close all tabs: contextMenuItems)
 */
import { useReducer } from 'react'
import { createNotationSwitchListModel } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentMasterScore, useScoreView } from '../scoreview'
import { closeScore } from '../session'

export function NotationSwitchPanel(): React.JSX.Element | null {
    useLanguage()
    const v = useScoreView()
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const master = currentMasterScore()
    if (!v.hasScore || !master) {
        return null
    }
    const model = createNotationSwitchListModel(master)
    model.load()
    const current = model.currentNotationIndex()
    const closeTitle = qtrc('global', 'Close')

    return (
        <div className="notation-tabs" role="tablist" aria-label={qtrc('notation', 'Scores')}>
            {model.notations().map((n, i) => (
                <div key={i} className="notation-tab" role="tab" aria-selected={i === current} title={n.isMaster ? v.tooltip : n.title!}
                    onClick={() => model.setCurrentNotation(i)}>
                    {n.isMaster
                        ? <span id="title" className="notation-tab-title">{(v.modified ? '*' : '') + v.title}</span>
                        : <span className="notation-tab-title">{n.title}</span>}
                    <button id={n.isMaster ? 'clear' : undefined} className="icon" title={closeTitle} aria-label={closeTitle}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (!model.closeNotation(i)) {
                                closeScore() // the score's tab: "file-close"
                            }
                            rerender()
                        }}>
                        {''}
                    </button>
                </div>
            ))}
        </div>
    )
}
