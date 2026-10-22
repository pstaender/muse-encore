/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The score's context menu (MuseScore's NotationView contextMenuLoader with NotationContextMenuModel): opened by a
 * right click on the score (outside of note input) at the pointer, with the library's items for the clicked element.
 */
import { useSyncExternalStore } from 'react'
import { contextMenuItems, type ContextMenuItem, type MasterScore } from '../../src/index'
import type { MenuItem } from '../menus/appmenu'
import { MenuPopup } from './Menu'

let s_menu: { key: number; items: MenuItem[]; anchor: DOMRect } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setMenu(m: typeof s_menu): void {
    s_menu = m
    for (const l of listeners) {
        l()
    }
}

function toMenuItems(items: readonly ContextMenuItem[]): MenuItem[] {
    return items.map((it): MenuItem => {
        switch (it.kind) {
        case 'action':
            return { kind: 'action', code: it.code, title: it.title }
        case 'menu':
            return { kind: 'menu', id: it.title[1], title: it.title, items: toMenuItems(it.items) }
        default:
            return { kind: 'separator' }
        }
    })
}

/** shows the context menu of the score at the pointer (client coordinates) */
export function showScoreContextMenu(score: MasterScore, clientX: number, clientY: number): void {
    setMenu({ key: ++s_key, items: toMenuItems(contextMenuItems(score)), anchor: new DOMRect(clientX, clientY, 0, 0) })
}

export function ScoreContextMenuHost(): React.JSX.Element | null {
    const menu = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_menu)
    if (!menu) {
        return null
    }
    return (
        <MenuPopup key={menu.key} items={menu.items} anchor={menu.anchor} placement="below" label="Context menu"
            onClose={(back) => {
                setMenu(null)
                if (back) {
                    document.getElementById('viewport')?.focus({ preventScroll: true })
                }
            }} />
    )
}
