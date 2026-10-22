/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's ViewModeControl (status bar): the current view mode and the menu of the view modes; also in the
 * page view toolbar.
 */
import { useRef, useState } from 'react'
import { actionDefinition, actionDescription, actionTitle, useActions } from '../actions/actions'
import { VIEW_MODE_ACTIONS } from '../actions/appactions'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, stripMnemonic, useLanguage } from '../i18n'
import type { MenuItem } from '../menus/appmenu'
import { useScoreView } from '../scoreview'
import { MenuPopup } from './Menu'

export const VIEW_MODE_ITEMS: MenuItem[] = [
    ...VIEW_MODE_ACTIONS.map(([code]): MenuItem => ({ kind: 'action', code })),
    { kind: 'action', code: 'view-mode-fit-width' },
]

/**
 * MuseScore's ViewModeControl: the current view mode (the continuous views as "Continuous view", like
 * NotationStatusBarModel::currentViewMode) and the menu of the view modes
 */
export function ViewModeControl({ className = 'statusbar-button', placement = 'below' }: {
    className?: string
    placement?: 'below' | 'right'
} = {}): React.JSX.Element {
    useLanguage()
    useActions()
    const v = useScoreView()
    const ref = useRef<HTMLButtonElement>(null)
    const [menu, setMenu] = useState<DOMRect | null>(null)
    const code = v.viewMode === 'fit-width' ? 'view-mode-fit-width'
        : VIEW_MODE_ACTIONS.find(([, mode]) => mode === v.viewMode)?.[0] ?? 'view-mode-page'
    const title = v.viewMode === 'continuous-horizontal' || v.viewMode === 'continuous-vertical'
        ? qtrc('notation', 'Continuous view') : stripMnemonic(actionTitle(code))
    const iconCode = actionDefinition(code)?.icon
    return (
        <>
            <button ref={ref} className={className} aria-haspopup="menu" aria-expanded={!!menu} title={actionDescription(code)}
                onClick={() => setMenu(menu ? null : ref.current!.getBoundingClientRect())}>
                {iconCode ? <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(iconCode)}</span> : null}
                <span>{title}</span>
                <span className="tool-icon small" aria-hidden="true">{String.fromCodePoint(ICON_CODES.SMALL_ARROW_DOWN)}</span>
            </button>
            {menu && (
                <MenuPopup items={VIEW_MODE_ITEMS} anchor={menu} placement={placement} label={title}
                    onClose={(back) => {
                        setMenu(null)
                        if (back) {
                            ref.current?.focus()
                        }
                    }} />
            )}
        </>
    )
}
