/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's NotationSwitchPanel (notationscene NotationView.qml with NotationSwitchListModel): the tabs of the score
 * and its open parts above the score view. The score's tab closes the score, a part's tab closes the part; the context
 * menu of a tab (NotationSwitchListModel::contextMenuItems / handleContextMenuItem) closes the tab, the other tabs or all.
 */
import { useReducer, useState } from 'react'
import { createNotationSwitchListModel } from '../../src/index'
import { registerAction } from '../actions/actions'
import { qtrc, useLanguage } from '../i18n'
import type { MenuItem } from '../menus/appmenu'
import { currentMasterScore, useScoreView } from '../scoreview'
import { closeScore } from '../session'
import { MenuPopup } from './Menu'
import { ICON_CODES } from '../actions/uiactiondata'

/** the model of the tabs of the current score */
function switchModel(): ReturnType<typeof createNotationSwitchListModel> | null {
    const master = currentMasterScore()
    if (!master) {
        return null
    }
    const model = createNotationSwitchListModel(master)
    model.load()
    return model
}

let s_rerender: (() => void) | null = null

/** NotationSwitchListModel::closeNotation: a part's tab closes the part, the score's tab the score ("file-close") */
function closeNotation(index: number): void {
    const model = switchModel()
    if (model && !model.closeNotation(index)) {
        closeScore()
    }
    s_rerender?.()
}

/** NotationSwitchListModel::handleContextMenuItem (the menu items are actions with the tab's index as argument) */
registerAction('notation-switch-close-tab', { run: (args) => closeNotation(Number(args?.[0])) },
    { title: ['notation', 'Close tab'] })
registerAction('notation-switch-close-other-tabs', {
    run: (args) => {
        switchModel()?.closeOtherNotations(Number(args?.[0]))
        s_rerender?.()
    },
}, { title: ['notation', 'Close other tabs'] })
registerAction('notation-switch-close-all-tabs', { run: () => closeScore() }, { title: ['notation', 'Close all tabs'] })

function contextMenu(index: number): MenuItem[] {
    return (switchModel()?.contextMenuItems(index) ?? []).map(item => ({
        kind: 'action', code: `notation-switch-${item.id}`, args: [String(index)],
    }))
}

export function NotationSwitchPanel(): React.JSX.Element | null {
    useLanguage()
    const v = useScoreView()
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null)
    s_rerender = rerender
    const model = switchModel()
    if (!v.hasScore || !model) {
        return null
    }
    const current = model.currentNotationIndex()
    const closeTitle = qtrc('global', 'Close')

    return (
        <div className="notation-tabs" role="tablist" aria-label={qtrc('notation', 'Scores')}>
            {model.notations().map((n, i) => (
                <div key={i} className="notation-tab" role="tab" aria-selected={i === current} title={n.isMaster ? v.tooltip : n.title!}
                    onClick={() => model.setCurrentNotation(i)}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ anchor: new DOMRect(e.clientX, e.clientY, 0, 0), items: contextMenu(i) })
                    }}>
                    {n.isMaster
                        ? <span id="title" className="notation-tab-title">{(v.modified ? '*' : '') + v.title}</span>
                        : <span className="notation-tab-title">{n.title}</span>}
                    <button id={n.isMaster ? 'clear' : undefined} className="icon" title={closeTitle} aria-label={closeTitle}
                        onClick={(e) => {
                            e.stopPropagation()
                            closeNotation(i)
                        }}>
                        {String.fromCodePoint(ICON_CODES.CLOSE_X_ROUNDED)}
                    </button>
                </div>
            ))}
            {menu && (
                <MenuPopup items={menu.items} anchor={menu.anchor} placement="below" label={qtrc('notation', 'Scores')}
                    onClose={() => setMenu(null)} />
            )}
        </div>
    )
}
