/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The list of palettes (port of src/palette/qml/MuseScore/Palette/internal/PaletteTree.qml with TreePaletteHeader.qml
 * and MoreElementsPopup.qml): each palette is a header (expand arrow, bold name, menu "…") and, when expanded, its
 * cells. While searching all palettes with matching cells are shown expanded, without "More".
 * Keyboard (MuseScore's tree navigation): Up/Down move between the headers, Right/Left expand/collapse,
 * Enter/Space toggle, Tab goes into the cells of an expanded palette.
 * TODO(port): reordering palettes (drag and drop), custom palettes, editing (delete cells, reset, save/load,
 * palette and cell properties dialogs).
 */
import { useEffect, useRef, useState } from 'react'
import { morePaletteCells, type PaletteInfo } from '../../../src/index'
import { registerAction } from '../../actions/actions'
import { ICON_CODES } from '../../actions/uiactiondata'
import { MenuPopup } from '../../components/Menu'
import { arg, qtrc, useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { PaletteGridView } from './PaletteGridView'
import { isPaletteExpanded, palettesState, setPaletteExpanded, setPaletteVisible, usePalettesState } from './palettestate'

const icon = (name: string): string => String.fromCodePoint(ICON_CODES[name] ?? 0)

/** the "More" popup of a palette (MoreElementsPopup: the master palette's other elements) */
function MorePopup({ palette, anchor, onClose }: { palette: PaletteInfo; anchor: HTMLElement; onClose: () => void }): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    const cells = morePaletteCells(palette.id)
    useEffect(() => {
        const close = (e: PointerEvent): void => {
            if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('pointerdown', close)
        ref.current?.querySelector<HTMLElement>('.palette-cell')?.focus()
        return () => document.removeEventListener('pointerdown', close)
    }, [anchor, onClose])
    return (
        <div ref={ref} className="palette-more-popup" role="dialog" aria-label={`${palette.name}: ${qtrc('palette', 'More')}`}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation()
                    onClose()
                    anchor.focus()
                }
            }}>
            <PaletteGridView palette={palette} cells={cells} label={palette.name} />
        </div>
    )
}

function paletteMenu(id: string): MenuItem[] {
    registerAction(`palette-hide:${id}`, { run: () => setPaletteVisible(id, false) }, { title: ['palette', 'Hide palette'] })
    return [{ kind: 'action', code: `palette-hide:${id}` }]
}

function TreePalette({ palette, searching, index, count, focusHeader }: {
    palette: PaletteInfo
    searching: boolean
    index: number
    count: number
    focusHeader: (idx: number) => void
}): React.JSX.Element {
    const state = usePalettesState()
    const expanded = searching || state.expanded.includes(palette.id)
    const [menu, setMenu] = useState<DOMRect | null>(null)
    const [more, setMore] = useState<HTMLElement | null>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const menuButton = useRef<HTMLButtonElement>(null)
    const toggle = (): void => {
        if (!searching) {
            setPaletteExpanded(palette.id, !isPaletteExpanded(palette.id))
        }
    }
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.target !== e.currentTarget) {
            return
        }
        const rtl = document.documentElement.dir === 'rtl'
        switch (e.key) {
        case 'ArrowDown': focusHeader(index + 1); break
        case 'ArrowUp': focusHeader(index - 1); break
        case 'Home': focusHeader(0); break
        case 'End': focusHeader(count - 1); break
        case 'ArrowRight':
        case 'ArrowLeft': {
            const open = (e.key === 'ArrowRight') !== rtl
            if (!searching && open !== expanded) {
                setPaletteExpanded(palette.id, open)
            } else if (open && expanded) {
                headerRef.current?.parentElement?.querySelector<HTMLElement>('.palette-cell[tabindex="0"]')?.focus()
            }
            break
        }
        case 'Enter':
        case ' ':
            toggle()
            break
        default:
            return
        }
        e.preventDefault()
        e.stopPropagation()
    }
    const label = palette.name
    return (
        <div className={`palette-tree-item${expanded ? ' expanded' : ''}`} data-palette={palette.id}>
            <div ref={headerRef} className="palette-header" tabIndex={0} role="button" aria-expanded={expanded}
                aria-label={searching ? arg(qtrc('palette', '%1, contains %Ln matching element(s)', '', palette.cells.length), label)
                    : expanded ? arg(qtrc('palette', '%1 expanded', 'tree item not collapsed'), label) : label}
                onClick={() => {
                    if (palettesState().singleClickToOpen) {
                        toggle()
                    }
                }}
                onDoubleClick={() => {
                    if (!palettesState().singleClickToOpen) {
                        toggle()
                    }
                }}
                onKeyDown={onKeyDown}
                onContextMenu={(e) => {
                    if (!searching) {
                        e.preventDefault()
                        setMenu(new DOMRect(e.clientX, e.clientY, 0, 0))
                    }
                }}>
                <button type="button" className="palette-expand" tabIndex={-1}
                    aria-label={expanded ? qtrc('global', 'Collapse') : qtrc('global', 'Expand')}
                    onClick={(e) => {
                        e.stopPropagation()
                        toggle()
                    }}>
                    {icon(expanded ? 'SMALL_ARROW_DOWN' : 'SMALL_ARROW_RIGHT')}
                </button>
                <span className="palette-name">{palette.name}</span>
                {!searching && (
                    <button ref={menuButton} type="button" className="palette-menu-button" tabIndex={-1}
                        aria-label={`${label}: ${qtrc('global', 'Menu')}`} title={qtrc('global', 'Menu')} aria-haspopup="menu"
                        aria-expanded={!!menu}
                        onClick={(e) => {
                            e.stopPropagation()
                            setMenu(menu ? null : menuButton.current!.getBoundingClientRect())
                        }}>
                        {icon('MENU_THREE_DOTS')}
                    </button>
                )}
            </div>
            {expanded && (
                <div className="palette-container" role="group">
                    <PaletteGridView palette={palette} label={label} showMoreButton={!searching}
                        moreExpanded={!!more} onMore={(a) => setMore(more ? null : a)}
                        onEscape={() => headerRef.current?.focus()} />
                    {more && <MorePopup palette={palette} anchor={more} onClose={() => setMore(null)} />}
                </div>
            )}
            {menu && (
                <MenuPopup items={paletteMenu(palette.id)} anchor={menu} placement="below" label={label}
                    onClose={(back) => {
                        setMenu(null)
                        if (back) {
                            headerRef.current?.focus()
                        }
                    }} />
            )}
        </div>
    )
}

export function PaletteTree({ palettes, searching }: { palettes: readonly PaletteInfo[]; searching: boolean }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDivElement>(null)
    const focusHeader = (idx: number): void => {
        const headers = ref.current?.querySelectorAll<HTMLElement>('.palette-header')
        if (headers?.length) {
            headers[Math.max(0, Math.min(headers.length - 1, idx))].focus()
        }
    }
    return (
        <div ref={ref} className="palette-tree" role="group" aria-label={qtrc('appshell', 'Palettes')}>
            {palettes.map((p, i) => (
                <TreePalette key={p.id} palette={p} searching={searching} index={i} count={palettes.length} focusHeader={focusHeader} />
            ))}
        </div>
    )
}
