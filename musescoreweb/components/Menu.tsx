/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Menus: the menu bar and popup menus (also used for submenus and the menus of toolbar buttons), with the
 * keyboard handling of desktop menus (WAI-ARIA menubar/menu pattern).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    actionTitle, isActionChecked, isActionEnabled, isCheckable, shortcutText, triggerAction, useActions,
} from '../actions/actions'
import { stripMnemonic, trString, useLanguage } from '../i18n'
import type { MenuItem } from '../menus/appmenu'

const ICON_CHECK = '' // TICK
const ICON_SUBMENU = '' // ARROW_RIGHT

export function menuItems(m: Extract<MenuItem, { kind: 'menu' }>): MenuItem[] {
    return typeof m.items === 'function' ? m.items() : m.items
}

function itemTitle(it: MenuItem): string {
    if (it.kind === 'action') {
        return stripMnemonic(actionTitle(it.code, it.title))
    }
    return it.kind === 'menu' ? stripMnemonic(trString(it.title)) : ''
}

function isEnabled(it: MenuItem): boolean {
    if (it.kind === 'action') {
        return isActionEnabled(it.code)
    }
    return it.kind === 'menu' && menuItems(it).some(isEnabled)
}

/** a menu at a position; submenus open beside their item */
export function MenuPopup({ items, anchor, placement, onClose, onLeft, onRight, initialFocus = 'first', label, isSubmenu = false }: {
    items: MenuItem[]
    anchor: DOMRect
    placement: 'below' | 'right'
    /** closes this menu and its parents (after an action or Escape on the top level) */
    onClose: (focusBack: boolean) => void
    /** Left on a top-level menu of the menu bar: the previous menu; in a submenu: back to the parent */
    onLeft?: () => void
    onRight?: () => void
    initialFocus?: 'first' | 'last' | 'none'
    label: string
    /** a submenu (closed with its parent menu) */
    isSubmenu?: boolean
}): React.JSX.Element {
    useActions()
    useLanguage()
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
    const [active, setActive] = useState(-1)
    const [sub, setSub] = useState<{ index: number; focus: 'first' | 'none' } | null>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])

    const focusable = items.map((it, i) => it.kind !== 'separator' ? i : -1).filter(i => i >= 0)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) {
            return
        }
        const r = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const rtl = document.documentElement.dir === 'rtl'
        let left = placement === 'below' ? (rtl ? anchor.right - r.width : anchor.left) : (rtl ? anchor.left - r.width : anchor.right)
        let top = placement === 'below' ? anchor.bottom : anchor.top - 4
        if (left + r.width > vw - 4) {
            left = placement === 'right' ? anchor.left - r.width : vw - 4 - r.width
        }
        if (left < 4) {
            left = placement === 'right' ? anchor.right : 4
        }
        if (top + r.height > vh - 4) {
            top = Math.max(4, placement === 'right' ? vh - 4 - r.height : anchor.top - r.height)
        }
        setPos({ left, top })
    }, [anchor, placement, items.length])

    useEffect(() => {
        if (initialFocus === 'none') {
            ref.current?.focus({ preventScroll: true })
            return
        }
        const i = initialFocus === 'first' ? focusable[0] : focusable[focusable.length - 1]
        if (i !== undefined) {
            setActive(i)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // like MuseScore's popups: a click outside of the menu (and its submenus), Escape with the focus outside of the menu
    // or leaving the window closes it. A click on the menu's own button is left to the button (it toggles the menu).
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        if (isSubmenu) {
            return
        }
        const onPointerDown = (e: PointerEvent): void => {
            const t = e.target instanceof Element ? e.target : null
            if (!t?.closest('.menu-popup, [aria-haspopup][aria-expanded="true"]')) {
                closeRef.current(false)
            }
        }
        const onKeyDown = (e: KeyboardEvent): void => {
            // with the focus in the menu, its own key handling closes it (or the open submenu)
            if (e.key === 'Escape' && !document.activeElement?.closest('.menu-popup')) {
                e.preventDefault()
                e.stopPropagation()
                closeRef.current(true)
            }
        }
        const onBlur = (): void => closeRef.current(false)
        // capture: the score view captures the pointer and handles Escape itself
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('blur', onBlur)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true)
            document.removeEventListener('keydown', onKeyDown, true)
            window.removeEventListener('blur', onBlur)
        }
    }, [isSubmenu])

    useEffect(() => {
        if (active >= 0) {
            itemRefs.current[active]?.focus({ preventScroll: true })
        }
    }, [active])

    const activate = (i: number): void => {
        const it = items[i]
        if (!it || !isEnabled(it)) {
            return
        }
        if (it.kind === 'menu') {
            setSub({ index: i, focus: 'first' })
        } else if (it.kind === 'action') {
            onClose(true)
            // after the menu is closed (the action may open a dialog that takes the focus)
            setTimeout(() => triggerAction(it.code))
        }
    }

    const move = (dir: 1 | -1): void => {
        const pos = focusable.indexOf(active)
        const next = pos < 0 ? (dir > 0 ? 0 : focusable.length - 1) : (pos + dir + focusable.length) % focusable.length
        setActive(focusable[next])
        setSub(null)
    }

    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (sub) {
            return // the submenu has the keys
        }
        let handled = true
        switch (e.key) {
            case 'ArrowDown': move(1); break
            case 'ArrowUp': move(-1); break
            case 'Home': setActive(focusable[0]); break
            case 'End': setActive(focusable[focusable.length - 1]); break
            case 'ArrowRight':
                if (items[active]?.kind === 'menu' && isEnabled(items[active])) {
                    setSub({ index: active, focus: 'first' })
                } else {
                    onRight?.()
                }
                break
            case 'ArrowLeft':
                if (onLeft) {
                    onLeft()
                } else {
                    handled = false
                }
                break
            case 'Enter':
            case ' ':
                activate(active)
                break
            case 'Escape':
                onClose(true)
                break
            case 'Tab':
                onClose(false)
                handled = false
                break
            default: {
                // the first item that starts with the typed letter
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const k = e.key.toLowerCase()
                    const start = focusable.indexOf(active)
                    const order = [...focusable.slice(start + 1), ...focusable.slice(0, start + 1)]
                    const hit = order.find(i => itemTitle(items[i]).toLowerCase().startsWith(k))
                    if (hit !== undefined) {
                        setActive(hit)
                    }
                } else {
                    handled = false
                }
            }
        }
        if (handled) {
            e.preventDefault()
            e.stopPropagation()
        }
    }

    const subItem = sub ? items[sub.index] : null

    return (
        <div ref={ref} className="menu-popup" role="menu" aria-label={label} tabIndex={-1} style={{ left: pos.left, top: pos.top }}
            onKeyDown={onKeyDown} onContextMenu={e => e.preventDefault()}>
            {items.map((it, i) => {
                if (it.kind === 'separator') {
                    return <div key={i} className="menu-separator" role="separator" />
                }
                const enabled = isEnabled(it)
                const checkable = it.kind === 'action' && isCheckable(it.code)
                const checked = it.kind === 'action' && isActionChecked(it.code)
                const shortcut = it.kind === 'action' ? shortcutText(it.code) : ''
                return (
                    <div key={i} ref={el => { itemRefs.current[i] = el }}
                        className={`menu-item${i === active ? ' active' : ''}`}
                        role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                        aria-checked={checkable ? checked : undefined}
                        aria-disabled={!enabled}
                        aria-haspopup={it.kind === 'menu' ? 'menu' : undefined}
                        aria-expanded={it.kind === 'menu' ? sub?.index === i : undefined}
                        tabIndex={i === active ? 0 : -1}
                        onPointerEnter={() => {
                            setActive(i)
                            setSub(it.kind === 'menu' && enabled ? { index: i, focus: 'none' } : null)
                        }}
                        onClick={() => activate(i)}>
                        <span className="menu-check" aria-hidden="true">{checked ? ICON_CHECK : ''}</span>
                        <span className="menu-title">{itemTitle(it)}</span>
                        {shortcut && <span className="menu-shortcut">{shortcut}</span>}
                        {it.kind === 'menu' && <span className="menu-arrow" aria-hidden="true">{ICON_SUBMENU}</span>}
                    </div>
                )
            })}
            {subItem?.kind === 'menu' && itemRefs.current[sub!.index] && (
                <MenuPopup items={menuItems(subItem)} anchor={itemRefs.current[sub!.index]!.getBoundingClientRect()} placement="right"
                    label={itemTitle(subItem)} initialFocus={sub!.focus} isSubmenu
                    onClose={(back) => { setSub(null); onClose(back) }}
                    onLeft={() => {
                        const i = sub!.index
                        setSub(null)
                        setActive(i)
                        itemRefs.current[i]?.focus()
                    }}
                    onRight={onRight} />
            )}
        </div>
    )
}

/** the application menu bar */
export function MenuBar({ menus }: { menus: MenuItem[] }): React.JSX.Element {
    useActions()
    useLanguage()
    const [open, setOpen] = useState<{ index: number; focus: 'first' | 'last' | 'none' } | null>(null)
    const [focused, setFocused] = useState(0)
    const buttons = useRef<(HTMLButtonElement | null)[]>([])
    const bar = useRef<HTMLDivElement>(null)

    // a click outside closes the open menu
    useEffect(() => {
        if (!open) {
            return
        }
        const onDown = (e: PointerEvent): void => {
            if (!bar.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.menu-popup')) {
                setOpen(null)
            }
        }
        document.addEventListener('pointerdown', onDown, true)
        return () => document.removeEventListener('pointerdown', onDown, true)
    }, [open])

    // Alt alone or F10 moves the focus to the menu bar (like desktop applications)
    useEffect(() => {
        let altAlone = false
        const down = (e: KeyboardEvent): void => {
            altAlone = e.key === 'Alt'
            if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('dialog[open]')) {
                e.preventDefault()
                buttons.current[0]?.focus()
            }
        }
        const up = (e: KeyboardEvent): void => {
            if (e.key === 'Alt' && altAlone && !document.querySelector('dialog[open]')) {
                e.preventDefault()
                if (bar.current?.contains(document.activeElement)) {
                    (document.getElementById('viewport') as HTMLElement | null)?.focus()
                } else {
                    setFocused(0)
                    buttons.current[0]?.focus()
                }
            }
            altAlone = false
        }
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        return () => {
            window.removeEventListener('keydown', down)
            window.removeEventListener('keyup', up)
        }
    }, [])

    const openMenu = (i: number, focus: 'first' | 'last' | 'none'): void => {
        const n = (i + menus.length) % menus.length
        setFocused(n)
        setOpen({ index: n, focus })
    }

    const close = (focusBack: boolean): void => {
        const i = open?.index ?? focused
        setOpen(null)
        if (focusBack) {
            buttons.current[i]?.focus()
        }
    }

    const openItem = open ? menus[open.index] : null

    return (
        <div ref={bar} className="menubar" role="menubar" aria-label="Main menu">
            {menus.map((m, i) => (
                <button key={i} ref={el => { buttons.current[i] = el }} role="menuitem" aria-haspopup="menu"
                    aria-expanded={open?.index === i} tabIndex={i === focused ? 0 : -1}
                    className={open?.index === i ? 'open' : ''}
                    onClick={() => open?.index === i ? setOpen(null) : openMenu(i, 'none')}
                    onPointerEnter={() => { if (open && open.index !== i) { openMenu(i, 'none') } }}
                    onFocus={() => setFocused(i)}
                    onKeyDown={(e) => {
                        let handled = true
                        if (e.key === 'ArrowRight') {
                            buttons.current[(i + 1) % menus.length]?.focus()
                        } else if (e.key === 'ArrowLeft') {
                            buttons.current[(i - 1 + menus.length) % menus.length]?.focus()
                        } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                            openMenu(i, 'first')
                        } else if (e.key === 'ArrowUp') {
                            openMenu(i, 'last')
                        } else if (e.key === 'Escape') {
                            (document.getElementById('viewport') as HTMLElement | null)?.focus()
                        } else {
                            handled = false
                        }
                        if (handled) {
                            e.preventDefault()
                        }
                    }}>
                    {m.kind === 'menu' ? stripMnemonic(trString(m.title)) : ''}
                </button>
            ))}
            {openItem?.kind === 'menu' && buttons.current[open!.index] && (
                <MenuPopup key={open!.index} items={menuItems(openItem)} anchor={buttons.current[open!.index]!.getBoundingClientRect()}
                    placement="below" label={stripMnemonic(trString(openItem.title))}
                    initialFocus={open!.focus === 'none' ? 'none' : open!.focus}
                    onClose={close}
                    onLeft={() => openMenu(open!.index - 1, 'first')}
                    onRight={() => openMenu(open!.index + 1, 'first')} />
            )}
        </div>
    )
}
