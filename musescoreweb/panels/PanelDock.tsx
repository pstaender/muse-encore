/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The panel area left of the score: the open panels as tabs (MuseScore's DockTabBar / DockPanelTab: the current tab
 * in bold with its context menu button "…": the panel's own items and "Close"), the current panel, and a splitter
 * to change the width (MuseScore's vertical panels have a fixed width of 300).
 */
import { useRef, useState } from 'react'
import { registerAction } from '../actions/actions'
import { ICON_CODES } from '../actions/uiactiondata'
import { MenuPopup } from '../components/Menu'
import { qtrc, trString, useLanguage } from '../i18n'
import type { MenuItem } from '../menus/appmenu'
import { InspectorForm, inspectorPanelMenu } from './inspector/InspectorForm'
import { LayoutPanel, layoutPanelMenu } from './layout/LayoutPanel'
import { PalettesPanel, palettesPanelMenu } from './palettes/PalettesPanel'
import './panels.css'
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, PANELS, setCurrentPanel, setPanelOpen, setPanelWidth, usePanels } from './panels'

const PANEL_CONTENT: Record<string, { component: () => React.JSX.Element; menu: () => MenuItem[] }> = {
    palettesPanel: { component: PalettesPanel, menu: palettesPanelMenu },
    instrumentsPanel: { component: LayoutPanel, menu: layoutPanelMenu },
    inspectorPanel: { component: InspectorForm, menu: inspectorPanelMenu },
}

/** DockPanelMenuModel: SET_DOCK_OPEN_ACTION_CODE with (name, false) -> "dock-close:<name>" */
export function registerPanelActions(): void {
    for (const p of PANELS) {
        registerAction(`dock-close:${p.id}`, { run: () => setPanelOpen(p.id, false) }, { title: ['appshell/dock', 'Close'] })
    }
}

function PanelTab({ id, title, current, index, count }: { id: string; title: string; current: boolean; index: number; count: number }): React.JSX.Element {
    const [menu, setMenu] = useState<DOMRect | null>(null)
    const menuButton = useRef<HTMLButtonElement>(null)
    const items = (): MenuItem[] => {
        const own = PANEL_CONTENT[id]?.menu() ?? []
        return [...own, ...(own.length ? [{ kind: 'separator' } as MenuItem] : []), { kind: 'action', code: `dock-close:${id}` }]
    }
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
        // tabs: arrows move between the tabs (and select them, like MuseScore's tab bar navigation)
        const tabs = [...(e.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])]
        const rtl = document.documentElement.dir === 'rtl'
        let next = -1
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            next = (index + ((e.key === 'ArrowRight') !== rtl ? 1 : count - 1)) % count
        } else if (e.key === 'Home') {
            next = 0
        } else if (e.key === 'End') {
            next = count - 1
        }
        if (next >= 0) {
            e.preventDefault()
            e.stopPropagation()
            tabs[next]?.focus()
            tabs[next]?.click()
        }
    }
    return (
        <div className={`panel-tab${current ? ' current' : ''}`}>
            <button role="tab" id={`panel-tab-${id}`} aria-selected={current} aria-controls={`panel-${id}`} tabIndex={current ? 0 : -1}
                onClick={() => setCurrentPanel(id)} onKeyDown={onKeyDown}>
                {title}
            </button>
            {current && (
                <button ref={menuButton} className="panel-tab-menu" aria-label={`${title}: ${qtrc('global', 'Menu')}`} title={qtrc('global', 'Menu')}
                    aria-haspopup="menu" aria-expanded={!!menu}
                    onClick={() => setMenu(menu ? null : menuButton.current!.getBoundingClientRect())}>
                    {String.fromCodePoint(ICON_CODES.MENU_THREE_DOTS)}
                </button>
            )}
            {menu && (
                <MenuPopup items={items()} anchor={menu} placement="below" label={title}
                    onClose={(back) => {
                        setMenu(null)
                        if (back) {
                            menuButton.current?.focus()
                        }
                    }} />
            )}
        </div>
    )
}

/** the splitter between the panels and the score: drag, or arrows/Home/End when focused (WAI-ARIA window splitter) */
function Splitter({ width }: { width: number }): React.JSX.Element {
    const drag = useRef<{ x: number; width: number; id: number } | null>(null)
    const rtl = document.documentElement.dir === 'rtl'
    return (
        <div className="panel-splitter" role="separator" aria-orientation="vertical" tabIndex={0}
            aria-label="Panel width" aria-valuenow={width} aria-valuemin={PANEL_MIN_WIDTH} aria-valuemax={PANEL_MAX_WIDTH}
            onPointerDown={(e) => {
                e.preventDefault()
                drag.current = { x: e.clientX, width, id: e.pointerId }
                e.currentTarget.setPointerCapture(e.pointerId)
                e.currentTarget.classList.add('dragging')
            }}
            onPointerMove={(e) => {
                const d = drag.current
                if (d && d.id === e.pointerId) {
                    setPanelWidth(d.width + (rtl ? d.x - e.clientX : e.clientX - d.x))
                }
            }}
            onPointerUp={(e) => {
                drag.current = null
                e.currentTarget.classList.remove('dragging')
            }}
            onPointerCancel={(e) => {
                drag.current = null
                e.currentTarget.classList.remove('dragging')
            }}
            onKeyDown={(e) => {
                const step = e.shiftKey ? 50 : 10
                const dir = rtl ? -1 : 1
                const w = e.key === 'ArrowLeft' ? width - step * dir : e.key === 'ArrowRight' ? width + step * dir
                    : e.key === 'Home' ? 0 : e.key === 'End' ? Infinity : null
                if (w !== null) {
                    e.preventDefault()
                    e.stopPropagation()
                    setPanelWidth(w)
                }
            }} />
    )
}

export function PanelDock(): React.JSX.Element | null {
    useLanguage()
    const state = usePanels()
    if (!state.open.length) {
        return null
    }
    const open = PANELS.filter(p => state.open.includes(p.id))
    const current = PANEL_CONTENT[state.current]
    const Content = current?.component
    return (
        <>
            <aside className="panel-dock" style={{ width: state.width }} aria-label={open.map(p => trString(p.title)).join(', ')}>
                <div className="panel-tabs" role="tablist">
                    {open.map((p, i) => (
                        <PanelTab key={p.id} id={p.id} title={trString(p.title)} current={p.id === state.current} index={i} count={open.length} />
                    ))}
                </div>
                <div className="panel-content" role="tabpanel" id={`panel-${state.current}`} aria-labelledby={`panel-tab-${state.current}`}>
                    {Content && <Content />}
                </div>
            </aside>
            <Splitter width={state.width} />
        </>
    )
}
