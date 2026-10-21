/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The list of palettes (port of src/palette/qml/MuseScore/Palette/internal/PaletteTree.qml with TreePaletteHeader.qml
 * and MoreElementsPopup.qml): each palette is a header (expand arrow, bold name, menu "…") and, when expanded, its
 * cells. While searching all palettes with matching cells are shown expanded, without "More".
 * Keyboard (MuseScore's tree navigation): Up/Down move between the headers, Right/Left expand/collapse,
 * Enter/Space toggle, Tab goes into the cells of an expanded palette.
 * The palette menu (TreePaletteHeader's menuModel): Hide palette (Hide/Delete palette for custom palettes), Insert new
 * palette, Enable editing, Reset palette, Save palette…, Load palette…, Palette properties….
 * Palettes are reordered by dragging their header (PaletteTree's drag of the palette delegates).
 */
import { useEffect, useRef, useState } from 'react'
import {
    RESET_PALETTE_QUESTION, addCellsToPalette, createCustomPalette, loadPaletteFile, morePaletteCells, movePalette,
    removePalette, removePaletteCells, resetPalette, savePaletteFile, setPaletteEditable, type PaletteInfo,
} from '../../../src/index'
import { registerAction } from '../../actions/actions'
import { ICON_CODES } from '../../actions/uiactiondata'
import { MenuPopup } from '../../components/Menu'
import { setDragData } from '../../dragcontroller'
import { arg, qtrc, useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { askPaletteQuestion, askRemove, openPaletteDialog } from './PaletteDialogs'
import { PaletteGridView } from './PaletteGridView'
import { palettesState, setPaletteExpanded, usePalettesState } from './palettestate'

const icon = (name: string): string => String.fromCodePoint(ICON_CODES[name] ?? 0)

/** the mime type of a palette dragged in the tree (Palette::mimeDataFormat) */
const PALETTE_DRAG_FORMAT = 'application/musescore/palette'

/** the "More" popup of a palette (MoreElementsPopup: the master palette's other elements and the hidden custom cells) */
function MorePopup({ palette, anchor, onClose }: { palette: PaletteInfo; anchor: HTMLElement; onClose: () => void }): React.JSX.Element {
    usePalettesState()
    const ref = useRef<HTMLDivElement>(null)
    const more = morePaletteCells(palette.id)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [customSelected, setCustomSelected] = useState<Set<string>>(new Set())
    useEffect(() => {
        const close = (e: PointerEvent): void => {
            if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)
                && !(e.target as Element).closest?.('dialog, .menu-popup')) {
                onClose()
            }
        }
        document.addEventListener('pointerdown', close)
        ref.current?.querySelector<HTMLElement>('.palette-cell')?.focus()
        return () => document.removeEventListener('pointerdown', close)
    }, [anchor, onClose])
    const toggle = (set: Set<string>, id: string, add: boolean): Set<string> => {
        const s = new Set(add ? set : [])
        if (add && set.has(id)) {
            s.delete(id)
        } else {
            s.add(id)
        }
        return s
    }
    const poolPalette = { ...palette, cells: more.pool }
    return (
        <div ref={ref} className="palette-more-popup" role="dialog" aria-label={`${palette.name}: ${qtrc('palette', 'More')}`}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation()
                    onClose()
                    anchor.focus()
                }
            }}>
            <button type="button" className="secondary palette-add-to" disabled={!palette.editable || (!selected.size && !customSelected.size)}
                onClick={() => {
                    addCellsToPalette(palette.id, [...selected])
                    addCellsToPalette(palette.id, [...customSelected])
                    setSelected(new Set())
                    setCustomSelected(new Set())
                }}>
                {arg(qtrc('palette', 'Add to %1'), palette.name)}
            </button>
            {palette.custom && more.poolName && <div className="palette-more-label">{more.poolName}</div>}
            <PaletteGridView palette={poolPalette} cells={more.pool} label={palette.name} paletteId={palette.id} pool="more"
                selected={selected} onSelect={(id, add) => setSelected(s => toggle(s, id, add))} />
            {more.custom.length > 0 && (
                <>
                    <div className="palette-more-custom-header">
                        <span className="palette-more-label">{qtrc('palette', 'Custom')}</span>
                        <button type="button" className="icon" disabled={!customSelected.size} aria-label={qtrc('palette', 'Delete')}
                            title={qtrc('palette', 'Delete')}
                            onClick={() => {
                                void removePaletteCells([...customSelected], askRemove, 'custom')
                                setCustomSelected(new Set())
                            }}>
                            {icon('DELETE_TANK')}
                        </button>
                    </div>
                    <PaletteGridView palette={{ ...palette, cells: more.custom }} cells={more.custom} label={qtrc('palette', 'Custom')}
                        paletteId={palette.id} pool="custom" selected={customSelected}
                        onSelect={(id, add) => setCustomSelected(s => toggle(s, id, add))} />
                </>
            )}
            <div className="palette-more-hint">{qtrc('palette', 'Drag items to the palette or directly on your score')}</div>
        </div>
    )
}

/** "Save palette…": downloads the palette as .mpal file */
function savePalette(id: string): void {
    const file = savePaletteFile(id)
    if (!file) {
        return
    }
    const url = URL.createObjectURL(new Blob([file.data as BlobPart], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${file.name.replace(/[\\/:*?"<>|]/g, '_') || 'palette'}.mpal`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Load palette…": a .mpal file inserted before the palette (as custom palette) */
function loadPalette(id: string): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mpal'
    input.addEventListener('change', () => {
        const f = input.files?.[0]
        if (f) {
            void f.arrayBuffer().then((buf) => {
                if (!loadPaletteFile(id, new Uint8Array(buf))) {
                    void askPaletteQuestion(qtrc('palette', 'Load palette') + ': ' + f.name,
                        [{ value: 'ok', label: qtrc('global', 'OK'), primary: true }])
                }
            })
        }
    })
    input.click()
}

/** "Reset palette" (PaletteProvider::resetPalette: asks first) */
function askResetPalette(id: string): void {
    void askPaletteQuestion(qtrc('palette', RESET_PALETTE_QUESTION), [
        { value: 'no', label: qtrc('global', 'No') },
        { value: 'yes', label: qtrc('global', 'Yes'), primary: true },
    ]).then((v) => {
        if (v === 'yes') {
            resetPalette(id)
        }
    })
}

/** TreePaletteHeader's menu */
function paletteMenu(palette: PaletteInfo, row: number): MenuItem[] {
    const id = palette.id
    registerAction(`palette-hide:${id}`, { run: () => void removePalette(id, askRemove) },
        { title: palette.custom ? ['palette', 'Hide/Delete palette'] : ['palette', 'Hide palette'] })
    registerAction(`palette-new:${id}`, {
        // QT_TRANSLATE_NOOP("palette", "Untitled palette")
        run: () => void createCustomPalette('Untitled palette', row),
    }, { title: ['palette', 'Insert new palette'] })
    registerAction(`palette-edit:${id}`, { run: () => setPaletteEditable(id, !palette.editable), checked: () => palette.editable },
        { title: ['palette', 'Enable editing'], checkable: true })
    registerAction(`palette-reset:${id}`, { run: () => askResetPalette(id) }, { title: ['palette', 'Reset palette'] })
    registerAction(`palette-save:${id}`, { run: () => savePalette(id) }, { title: ['palette', 'Save palette…'] })
    registerAction(`palette-load:${id}`, { run: () => loadPalette(id) }, { title: ['palette', 'Load palette…'] })
    registerAction(`palette-properties:${id}`, { run: () => openPaletteDialog({ kind: 'palette', paletteId: id }), enabled: () => palette.editable },
        { title: ['palette', 'Palette properties…'] })
    return [
        { kind: 'action', code: `palette-hide:${id}` },
        { kind: 'action', code: `palette-new:${id}` },
        { kind: 'separator' },
        { kind: 'action', code: `palette-edit:${id}` },
        { kind: 'separator' },
        { kind: 'action', code: `palette-reset:${id}` },
        { kind: 'action', code: `palette-save:${id}` },
        { kind: 'action', code: `palette-load:${id}` },
        { kind: 'separator' },
        { kind: 'action', code: `palette-properties:${id}` },
    ]
}

function TreePalette({ palette, searching, index, count, focusHeader, row, onMovePalette }: {
    palette: PaletteInfo
    searching: boolean
    index: number
    count: number
    focusHeader: (idx: number) => void
    /** the palette's row in the user palette tree */
    row: number
    /** a palette dragged onto this one: moved before the row `target` */
    onMovePalette: (id: string, target: number) => void
}): React.JSX.Element {
    usePalettesState()
    const expanded = searching || palette.expanded
    const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null)
    const [more, setMore] = useState<HTMLElement | null>(null)
    const [dropOver, setDropOver] = useState<'before' | 'after' | null>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const menuButton = useRef<HTMLButtonElement>(null)
    const toggle = (): void => {
        if (!searching) {
            setPaletteExpanded(palette.id, !palette.expanded)
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
    const isPaletteDrag = (e: React.DragEvent): boolean => !searching && e.dataTransfer.types.includes(PALETTE_DRAG_FORMAT)
    return (
        <div className={`palette-tree-item${expanded ? ' expanded' : ''}${dropOver ? ` drop-${dropOver}` : ''}`} data-palette={palette.id}
            data-palette-type={palette.type}>
            <div ref={headerRef} className="palette-header" tabIndex={0} role="button" aria-expanded={expanded}
                aria-label={searching ? arg(qtrc('palette', '%1, contains %Ln matching element(s)', '', palette.cells.length), label)
                    : expanded ? arg(qtrc('palette', '%1 expanded', 'tree item not collapsed'), label) : label}
                draggable={!searching}
                onDragStart={(e) => {
                    e.dataTransfer.setData(PALETTE_DRAG_FORMAT, palette.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragData(null)
                }}
                onDragOver={(e) => {
                    if (isPaletteDrag(e)) {
                        e.preventDefault()
                        const r = e.currentTarget.getBoundingClientRect()
                        setDropOver(e.clientY < r.top + r.height / 2 ? 'before' : 'after')
                    }
                }}
                onDragLeave={() => setDropOver(null)}
                onDrop={(e) => {
                    const id = e.dataTransfer.getData(PALETTE_DRAG_FORMAT)
                    const where = dropOver
                    setDropOver(null)
                    if (id && id !== palette.id && isPaletteDrag(e)) {
                        e.preventDefault()
                        const target = where === 'after' ? row + 1 : row
                        onMovePalette(id, target)
                    }
                }}
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
                        setMenu({ anchor: new DOMRect(e.clientX, e.clientY, 0, 0), items: paletteMenu(palette, row) })
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
                            setMenu(menu ? null : { anchor: menuButton.current!.getBoundingClientRect(), items: paletteMenu(palette, row) })
                        }}>
                        {icon('MENU_THREE_DOTS')}
                    </button>
                )}
            </div>
            {expanded && (
                <div className="palette-container" role="group">
                    <PaletteGridView palette={palette} label={label} showMoreButton={!searching}
                        moreExpanded={!!more} onMore={(a) => setMore(more ? null : a)}
                        onEscape={() => headerRef.current?.focus()}
                        paletteId={searching ? null : palette.id} pool="main" editable={!searching && palette.editable} />
                    {more && <MorePopup palette={palette} anchor={more} onClose={() => setMore(null)} />}
                </div>
            )}
            {menu && (
                <MenuPopup items={menu.items} anchor={menu.anchor} placement="below" label={label}
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

export function PaletteTree({ palettes, searching, rows }: {
    palettes: readonly PaletteInfo[]
    searching: boolean
    /** the rows of the palettes in the user palette tree (palette id -> row) */
    rows?: ReadonlyMap<string, number>
}): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDivElement>(null)
    /** moves a palette before the palette at `target` (rows of the user palette tree) */
    const onMovePalette = (id: string, target: number): void => {
        const from = rows?.get(id) ?? -1
        if (from >= 0 && target !== from && target !== from + 1) {
            movePalette(id, target > from ? target - 1 : target)
        }
    }
    const focusHeader = (idx: number): void => {
        const headers = ref.current?.querySelectorAll<HTMLElement>('.palette-header')
        if (headers?.length) {
            headers[Math.max(0, Math.min(headers.length - 1, idx))].focus()
        }
    }
    return (
        <div ref={ref} className="palette-tree" role="group" aria-label={qtrc('appshell', 'Palettes')}>
            {palettes.map((p, i) => (
                <TreePalette key={p.id} palette={p} searching={searching} index={i} count={palettes.length} focusHeader={focusHeader}
                    row={rows?.get(p.id) ?? i} onMovePalette={onMovePalette} />
            ))}
        </div>
    )
}
