/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Menus: the menu bar and popup menus (also used for submenus and the menus of toolbar buttons), with the
 * keyboard handling of desktop menus (WAI-ARIA menubar/menu pattern). The search field of the Help menu (not in MuseScore,
 * like macOS): it lists the items of all menus whose title contains the typed words; the current result is shown in its
 * menu (opened beside, highlighted); Enter or a click runs it. Mod+Shift+/ (Cmd+? on macOS) opens it.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
    actionTitle, isActionChecked, isActionEnabled, isCheckable, shortcutText, triggerAction, useActions,
} from '../actions/actions'
import { qtrc, stripMnemonic, trString, useLanguage } from '../i18n'
import type { MenuItem } from '../menus/appmenu'

const ICON_CHECK = '' // TICK
const ICON_SUBMENU = '' // ARROW_RIGHT

type ActionItem = Extract<MenuItem, { kind: 'action' }>

interface SearchResult {
    item: ActionItem
    /** the indices of the menus and of the item from the menu bar */
    path: number[]
    /** the titles of its menus */
    location: string
}

/** the menu bar's menus for the search field and the menu that shows the current result */
const MenuSearchContext = createContext<{ menus: MenuItem[]; setReveal: (path: number[] | null) => void } | null>(null)

/** the action items of the menus whose title contains all words of the query; titles starting with it first */
function searchMenus(menus: MenuItem[], query: string): SearchResult[] {
    const q = query.trim().toLowerCase()
    const words = q.split(/\s+/).filter(Boolean)
    if (!words.length) {
        return []
    }
    const found: SearchResult[] = []
    const seen = new Set<string>()
    const walk = (items: MenuItem[], path: number[], location: string[]): void => {
        items.forEach((it, i) => {
            if (it.kind === 'menu') {
                walk(menuItems(it), [...path, i], [...location, itemTitle(it)])
            } else if (it.kind === 'action') {
                const title = itemTitle(it)
                const key = `${it.code}|${it.args?.join('|') ?? ''}|${title}`
                const t = title.toLowerCase()
                if (title && !seen.has(key) && words.every(w => t.includes(w))) {
                    seen.add(key)
                    found.push({ item: it, path: [...path, i], location: location.join(' \u203a ') })
                }
            }
        })
    }
    walk(menus, [], [])
    const starts = (r: SearchResult): number => itemTitle(r.item).toLowerCase().startsWith(q) ? 0 : 1
    return found.sort((a, b) => starts(a) - starts(b))
}

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
    return it.kind === 'search' || (it.kind === 'menu' && menuItems(it).some(isEnabled))
}

/** a menu at a position; submenus open beside their item */
export function MenuPopup({
    items, anchor, placement, onClose, onLeft, onRight, initialFocus = 'first', label, isSubmenu = false, reveal, passive = false, focusSearch = 0,
}: {
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
    /** the path of a search result in this menu: its submenus are opened, the item is highlighted */
    reveal?: readonly number[]
    /** shown for a search result: does not take the focus */
    passive?: boolean
    /** changed: the search field gets the focus (the shortcut while the menu is open) */
    focusSearch?: number
}): React.JSX.Element {
    useActions()
    useLanguage()
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
    const [active, setActive] = useState(-1)
    const [sub, setSub] = useState<{ index: number; focus: 'first' | 'none' } | null>(null)
    const itemRefs = useRef<(HTMLElement | null)[]>([])
    const search = useContext(MenuSearchContext)
    const [query, setQuery] = useState('')
    const [result, setResult] = useState(0)
    const hasSearch = items.some(it => it.kind === 'search')
    const results = useMemo(() => hasSearch && search ? searchMenus(search.menus, query) : [], [hasSearch, search?.menus.length, query])
    const revealKey = reveal?.join(',') ?? ''
    const searching = hasSearch && !!query.trim()

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
        // the Help menu while searching: at the side of the window (like macOS' Help menu), so the menus that show the
        // results are beside it
        if (searching && placement === 'below') {
            left = rtl ? 4 : vw - 4 - r.width
        }
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
    }, [anchor, placement, items.length, results.length, searching])

    useEffect(() => {
        if (passive) {
            return
        }
        // the search field gets the focus (like macOS)
        const s = items.findIndex(it => it.kind === 'search')
        if (s >= 0 && initialFocus !== 'last') {
            setActive(s)
            return
        }
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
        if (active >= 0 && !passive) {
            itemRefs.current[active]?.focus({ preventScroll: true })
        }
    }, [active, passive])

    useEffect(() => {
        const s = items.findIndex(it => it.kind === 'search')
        if (focusSearch && s >= 0) {
            setActive(s)
            itemRefs.current[s]?.focus({ preventScroll: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusSearch])

    // the current search result is shown in its menu
    const setReveal = search?.setReveal
    const current = query.trim() ? results[result] : undefined
    useEffect(() => {
        if (hasSearch) {
            setReveal?.(current ? current.path : null)
        }
    }, [setReveal, hasSearch, current])
    useEffect(() => () => {
        if (hasSearch) {
            setReveal?.(null)
        }
    }, [setReveal, hasSearch])

    // the highlighted item of a search result
    useEffect(() => {
        if (reveal?.length === 1) {
            itemRefs.current[reveal[0]]?.scrollIntoView({ block: 'nearest' })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revealKey])

    const runResult = (r: SearchResult | undefined): void => {
        if (!r || !isActionEnabled(r.item.code)) {
            return
        }
        onClose(true)
        setTimeout(() => triggerAction(r.item.code, r.item.args))
    }

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        e.stopPropagation() // not the type-ahead of the menu, not the score's shortcuts
        const n = query.trim() ? results.length : 0
        let handled = true
        switch (e.key) {
            case 'ArrowDown':
                if (n) {
                    setResult((result + 1) % n)
                } else {
                    move(1)
                }
                break
            case 'ArrowUp':
                if (n) {
                    setResult((result - 1 + n) % n)
                } else {
                    move(-1)
                }
                break
            case 'Enter':
                runResult(current)
                break
            case 'Escape':
                if (query) {
                    setQuery('')
                } else {
                    onClose(true)
                }
                break
            case 'Tab':
                onClose(false)
                handled = false
                break
            default:
                handled = false
        }
        if (handled) {
            e.preventDefault()
        }
    }

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
            setTimeout(() => triggerAction(it.code, it.args))
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

    const revealing = !!reveal && reveal.length > 1 && items[reveal[0]]?.kind === 'menu'
    const shownSub = revealing ? { index: reveal![0], focus: 'none' as const } : sub
    const subItem = shownSub ? items[shownSub.index] : null
    const highlighted = reveal?.length === 1 ? reveal[0] : -1

    return (
        <div ref={ref} className="menu-popup" role="menu" aria-label={label} tabIndex={-1} style={{ left: pos.left, top: pos.top }}
            onKeyDown={onKeyDown} onContextMenu={e => e.preventDefault()}>
            {items.map((it, i) => {
                if (it.kind === 'separator') {
                    return <div key={i} className="menu-separator" role="separator" />
                }
                if (it.kind === 'search') {
                    const shown = query.trim() ? results : null
                    return (
                        <div key={i} role="none">
                            <div className="menu-search" role="none">
                                <input ref={el => { itemRefs.current[i] = el }} type="search" value={query}
                                    placeholder={qtrc('ui', 'Search')} aria-label={qtrc('ui', 'Search')}
                                    role="searchbox" aria-controls={shown ? 'menu-search-results' : undefined}
                                    aria-activedescendant={shown?.length ? `menu-search-result-${result}` : undefined}
                                    tabIndex={i === active ? 0 : -1} autoComplete="off" spellCheck={false}
                                    onFocus={() => setActive(i)}
                                    onChange={(e) => { setQuery(e.target.value); setResult(0) }}
                                    onKeyDown={onSearchKeyDown} />
                            </div>
                            {shown && (
                                <div id="menu-search-results" role="group" aria-label={qtrc('ui', 'Search')} className="menu-search-results">
                                    {shown.length === 0 && (
                                        <div className="menu-item menu-search-empty" aria-disabled="true">{qtrc('global', 'No results found')}</div>
                                    )}
                                    {shown.map((r, k) => {
                                        const shortcut = shortcutText(r.item.code)
                                        return (
                                            <div key={k} id={`menu-search-result-${k}`} role="menuitem"
                                                className={`menu-item menu-search-result${k === result ? ' active' : ''}`}
                                                aria-disabled={!isActionEnabled(r.item.code)}
                                                onPointerEnter={() => setResult(k)}
                                                onMouseDown={e => e.preventDefault() /* the focus stays in the field */}
                                                onClick={() => runResult(r)}>
                                                <span className="menu-check" aria-hidden="true" />
                                                <span className="menu-title">
                                                    {itemTitle(r.item)}
                                                    <span className="menu-search-location">{r.location}</span>
                                                </span>
                                                {shortcut && <span className="menu-shortcut">{shortcut}</span>}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                }
                const enabled = isEnabled(it)
                const checkable = it.kind === 'action' && isCheckable(it.code)
                const checked = it.kind === 'action' && isActionChecked(it.code)
                const shortcut = it.kind === 'action' ? shortcutText(it.code) : ''
                return (
                    <div key={i} ref={el => { itemRefs.current[i] = el }}
                        className={`menu-item${i === active ? ' active' : ''}${i === highlighted ? ' search-highlight' : ''}`}
                        role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                        aria-checked={checkable ? checked : undefined}
                        aria-disabled={!enabled}
                        aria-haspopup={it.kind === 'menu' ? 'menu' : undefined}
                        aria-expanded={it.kind === 'menu' ? shownSub?.index === i : undefined}
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
            {subItem?.kind === 'menu' && itemRefs.current[shownSub!.index] && (
                <MenuPopup key={revealing ? `reveal-${shownSub!.index}` : shownSub!.index}
                    items={menuItems(subItem)} anchor={itemRefs.current[shownSub!.index]!.getBoundingClientRect()} placement="right"
                    label={itemTitle(subItem)} initialFocus={shownSub!.focus} isSubmenu
                    reveal={revealing ? reveal!.slice(1) : undefined} passive={passive || revealing}
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
    /** the path of the current result of the search field */
    const [reveal, setReveal] = useState<number[] | null>(null)
    const searchContext = useMemo(() => ({ menus, setReveal }), [menus])
    const [focusSearch, setFocusSearch] = useState(0)
    const helpIndex = useRef(-1)
    helpIndex.current = menus.findIndex(m => m.kind === 'menu' && menuItems(m).some(it => it.kind === 'search'))

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

    // Alt alone moves the focus to the menu bar (like desktop applications; F10 is MuseScore's shortcut of the mixer)
    useEffect(() => {
        let altAlone = false
        const down = (e: KeyboardEvent): void => {
            altAlone = e.key === 'Alt'
            // Mod+Shift+/ (Cmd+? on macOS): the search field of the Help menu
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.code === 'Slash' || e.key === '?')
                && helpIndex.current >= 0 && !document.querySelector('dialog[open]')) {
                e.preventDefault()
                e.stopPropagation()
                setFocused(helpIndex.current)
                setOpen({ index: helpIndex.current, focus: 'first' })
                setFocusSearch(n => n + 1)
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
        window.addEventListener('keydown', down, true)
        window.addEventListener('keyup', up)
        return () => {
            window.removeEventListener('keydown', down, true)
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
    const revealMenu = reveal && open && reveal[0] !== open.index ? menus[reveal[0]] : null

    return (
        <MenuSearchContext.Provider value={searchContext}>
        <div ref={bar} className="menubar" role="menubar" aria-label="Main menu">
            {menus.map((m, i) => (
                <button key={i} ref={el => { buttons.current[i] = el }} role="menuitem" aria-haspopup="menu"
                    aria-expanded={open?.index === i} tabIndex={i === focused ? 0 : -1}
                    className={open?.index === i || (revealMenu && reveal![0] === i) ? 'open' : ''}
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
            {revealMenu?.kind === 'menu' && buttons.current[reveal![0]] && (
                <MenuPopup key={`reveal-${reveal![0]}`} items={menuItems(revealMenu)}
                    anchor={buttons.current[reveal![0]]!.getBoundingClientRect()} placement="below"
                    label={stripMnemonic(trString(revealMenu.title))} isSubmenu passive reveal={reveal!.slice(1)}
                    onClose={close} />
            )}
            {openItem?.kind === 'menu' && buttons.current[open!.index] && (
                <MenuPopup key={open!.index} items={menuItems(openItem)} anchor={buttons.current[open!.index]!.getBoundingClientRect()}
                    placement="below" label={stripMnemonic(trString(openItem.title))}
                    initialFocus={open!.focus === 'none' ? 'none' : open!.focus}
                    reveal={reveal && reveal[0] === open!.index ? reveal.slice(1) : undefined} focusSearch={focusSearch}
                    onClose={close}
                    onLeft={() => openMenu(open!.index - 1, 'first')}
                    onRight={() => openMenu(open!.index + 1, 'first')} />
            )}
        </div>
        </MenuSearchContext.Provider>
    )
}
