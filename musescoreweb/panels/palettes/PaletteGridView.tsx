/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The cells of a palette (port of src/palette/qml/MuseScore/Palette/internal/PaletteGridView.qml with
 * PaletteGridLinesCanvas.qml and the cell icons of PaletteCellIconEngine): a grid of cells of the palette's cell
 * size, stretched to fill the width, with grid lines; the "More" button (MoreElementsPopup) at the end.
 * A click (or Enter) applies the cell to the selection (PaletteRootModel / Palette::applyPaletteElement), the
 * tooltip is the cell's translated name. Keyboard: arrows move between the cells (a WAI-ARIA grid-like listbox),
 * Home/End, Enter/Space apply, Escape goes back to the palette's header, Delete removes the cell.
 * Drag and drop (the grid's DropArea and the cells' Drag): cells are dragged onto the score or into a palette (moved
 * inside their palette, added from "More" or other palettes); elements dragged out of the score with Shift+Ctrl
 * become custom cells (UserPaletteController::insert). The context menu of a cell: Delete, Properties….
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    canEditPaletteCell, canInsertPaletteCell, drawPaletteCell, insertPaletteCell, movePaletteCell, paletteCellCount,
    paletteCellElement, paletteCellMimeData, paletteCellRow, removePaletteCells, type PaletteCellInfo, type PaletteInfo,
} from '../../../src/index'
import { actionDefinition, actionDescription, registerAction } from '../../actions/actions'
import { MenuPopup } from '../../components/Menu'
import { ELEMENT_DROP_EVENT, dragData, setDragData, type AppDragData, type ElementDropDetail } from '../../dragcontroller'
import { qtrc, useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { currentScore } from '../../scoreview'
import { applyPaletteElement, canApplyPaletteElement, scoreChanged } from '../editbridge'
import { askRemove, openPaletteDialog } from './PaletteDialogs'
import { withSelectedInstrument } from '../../dialogs/instrumentchoice'
import { setCurrentCell, usePalettesState } from './palettestate'

/** the text color of the theme: PaletteConfiguration::elementsColor (ui.theme.fontPrimaryColor) */
function elementsColor(el: Element): string {
    const c = getComputedStyle(el).color
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
    return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : '#000000'
}

/** re-renders on theme changes (the cell icons are drawn in the text color) */
function useColorScheme(): boolean {
    const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
    useEffect(() => {
        const mq = matchMedia('(prefers-color-scheme: dark)')
        const on = (): void => setDark(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [])
    return dark
}

/** the cell's name: the translated name, or the action's description for ActionIcon cells (Palette::appendActionIcon) */
export function paletteCellName(cell: PaletteCellInfo): string {
    return cell.action ? actionDescription(cell.action) : cell.name
}

/** applies a cell to the selection of the open score */
export function applyPaletteCell(cellId: string, modifiers: { shift: boolean; ctrl: boolean } = { shift: false, ctrl: false }): boolean {
    const score = currentScore()
    const element = paletteCellElement(cellId)
    setCurrentCell(cellId)
    if (!score || !element || !canApplyPaletteElement(score)) {
        return false
    }
    if (element.isInstrumentChange()) {
        // the instrument of the instrument change is chosen first (NotationInteraction::selectInstrument)
        void withSelectedInstrument(() => {
            if (applyPaletteElement(score, element, modifiers)) {
                scoreChanged()
            }
        })
        return true
    }
    if (applyPaletteElement(score, element, modifiers)) {
        scoreChanged()
        return true
    }
    return false
}

/** "Delete" of a cell (UserPaletteController::remove: custom cells ask whether to hide or delete them) */
export function removePaletteCell(cellId: string): void {
    void removePaletteCells([cellId], askRemove)
}

/** the icon of a cell: the element drawn on a canvas, or a glyph of the icon font (actions, layout breaks) */
function CellIcon({ cell, palette }: { cell: PaletteCellInfo; palette: PaletteInfo }): React.JSX.Element {
    const lang = useLanguage()
    const dark = useColorScheme()
    const ref = useRef<HTMLCanvasElement>(null)
    const glyph = cell.action ? actionDefinition(cell.action)?.icon ?? 0 : cell.icon
    useLayoutEffect(() => {
        const canvas = ref.current
        if (!canvas) {
            return
        }
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(palette.gridWidth * dpr)
        canvas.height = Math.round(palette.gridHeight * dpr)
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        drawPaletteCell(cell.id, ctx, {
            width: palette.gridWidth, height: palette.gridHeight, dpr, color: elementsColor(canvas), extraMag: palette.mag,
        })
    }, [cell.id, cell.mag, cell.xoffset, cell.yoffset, cell.drawStaff, palette.gridWidth, palette.gridHeight, palette.mag, lang, dark])
    if (cell.action || cell.icon) {
        return (
            <span className="palette-cell-glyph" aria-hidden="true"
                style={{ fontSize: `${cell.iconSize * palette.mag}px`, width: palette.gridWidth, height: palette.gridHeight }}>
                {glyph ? String.fromCodePoint(glyph) : ''}
            </span>
        )
    }
    return <canvas ref={ref} className="palette-cell-canvas" style={{ width: palette.gridWidth, height: palette.gridHeight }} aria-hidden="true" />
}

/** the number of columns of a grid (its cells wrap) */
function columnCount(grid: HTMLElement): number {
    const cells = grid.querySelectorAll<HTMLElement>('.palette-cell')
    if (cells.length < 2) {
        return 1
    }
    const top = cells[0].offsetTop
    let n = 0
    for (const c of cells) {
        if (c.offsetTop !== top) {
            break
        }
        n++
    }
    return Math.max(1, n)
}

/**
 * The row of the user palette a drop at a client position inserts before (the cell under the pointer; its right half:
 * after it); -1: at the end
 */
function paletteDropRow(grid: HTMLElement, clientX: number, clientY: number): number {
    const cells = [...grid.querySelectorAll<HTMLElement>('.palette-cell')]
    const i = dropRow(grid, clientX, clientY)
    return i < cells.length ? paletteCellRow(cells[i].dataset.cell!) : -1
}

/** the index among the shown cells a drop at a client position inserts before */
function dropRow(grid: HTMLElement, clientX: number, clientY: number): number {
    const cells = [...grid.querySelectorAll<HTMLElement>('.palette-cell')]
    const rtl = document.documentElement.dir === 'rtl'
    for (let i = 0; i < cells.length; ++i) {
        const r = cells[i].getBoundingClientRect()
        if (clientY >= r.top && clientY < r.bottom && clientX >= r.left && clientX < r.right) {
            const after = rtl ? clientX < r.left + r.width / 2 : clientX >= r.left + r.width / 2
            return after ? i + 1 : i
        }
    }
    return cells.length
}

/** the cell context menu (PaletteGridView's ContextMenuLoader) */
function cellMenu(cellId: string): MenuItem[] {
    registerAction(`palette-cell-delete:${cellId}`, {
        run: () => removePaletteCell(cellId), enabled: () => canEditPaletteCell(cellId),
    }, { title: ['palette', 'Delete'] })
    registerAction(`palette-cell-properties:${cellId}`, {
        run: () => openPaletteDialog({ kind: 'cell', cellId }), enabled: () => canEditPaletteCell(cellId),
    }, { title: ['palette', 'Properties…'] })
    return [{ kind: 'action', code: `palette-cell-delete:${cellId}` }, { kind: 'action', code: `palette-cell-properties:${cellId}` }]
}

export function PaletteGridView({
    palette, cells = palette.cells, label, showMoreButton = false, onMore, moreExpanded = false, onEscape, paletteId = null,
    pool = 'main', editable = false, selected, onSelect,
}: {
    palette: PaletteInfo
    cells?: readonly PaletteCellInfo[]
    label: string
    showMoreButton?: boolean
    onMore?: (anchor: HTMLElement) => void
    moreExpanded?: boolean
    /** Escape in the grid (focus back to the header) */
    onEscape?: () => void
    /** the user palette shown (cells can be dropped and edited); null: search results, the master palette */
    paletteId?: string | null
    /** where the cells come from: the user palette, the pool of "More" or its custom cells */
    pool?: 'main' | 'more' | 'custom'
    /** the cells can be edited (the palette is editable, not searching) */
    editable?: boolean
    /** the selected cells ("More": "Add to %1"); a click selects them instead of only making them current */
    selected?: ReadonlySet<string>
    onSelect?: (cellId: string, add: boolean) => void
}): React.JSX.Element {
    useLanguage()
    const state = usePalettesState()
    const gridRef = useRef<HTMLDivElement>(null)
    const [focusIdx, setFocusIdx] = useState(0)
    const [menu, setMenu] = useState<{ cellId: string; anchor: DOMRect; items: MenuItem[] } | null>(null)
    const [dropAt, setDropAt] = useState<number | null>(null)
    const canApply = canApplyPaletteElement(currentScore())
    const acceptsDrops = pool === 'main' && !!paletteId && editable

    // an element dragged out of the score (Shift+Ctrl+drag) released over this palette: a new custom cell
    useEffect(() => {
        const grid = gridRef.current
        if (!grid || !acceptsDrops || !paletteId) {
            return
        }
        const onElementDrop = (e: Event): void => {
            const d = (e as CustomEvent<ElementDropDetail>).detail
            insertPaletteCell(paletteId, paletteDropRow(grid, d.clientX, d.clientY), { symbol: d.mimeData }, 'copy')
        }
        grid.addEventListener(ELEMENT_DROP_EVENT, onElementDrop)
        return () => grid.removeEventListener(ELEMENT_DROP_EVENT, onElementDrop)
    }, [acceptsDrops, paletteId])

    const focusCell = (idx: number): void => {
        const i = Math.max(0, Math.min(cells.length - 1, idx))
        setFocusIdx(i)
        gridRef.current?.querySelectorAll<HTMLElement>('.palette-cell')[i]?.focus()
        setCurrentCell(cells[i]?.id ?? null)
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number): void => {
        const cols = gridRef.current ? columnCount(gridRef.current) : 1
        const rtl = document.documentElement.dir === 'rtl'
        let next = -1
        switch (e.key) {
        case 'ArrowRight': next = idx + (rtl ? -1 : 1); break
        case 'ArrowLeft': next = idx + (rtl ? 1 : -1); break
        case 'ArrowDown': next = idx + cols; break
        case 'ArrowUp': next = idx - cols; break
        case 'Home': next = e.ctrlKey ? 0 : idx - (idx % cols); break
        case 'End': next = e.ctrlKey ? cells.length - 1 : Math.min(cells.length - 1, idx - (idx % cols) + cols - 1); break
        case 'Enter':
        case ' ':
            e.preventDefault()
            e.stopPropagation()
            applyPaletteCell(cells[idx].id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
            return
        case 'Delete':
        case 'Backspace':
            if (pool === 'main' && editable) {
                e.preventDefault()
                e.stopPropagation()
                removePaletteCell(cells[idx].id)
            }
            return
        case 'ContextMenu':
        case 'F10':
            if (pool === 'main' && paletteId && (e.key === 'ContextMenu' || e.shiftKey)) {
                e.preventDefault()
                setMenu({ cellId: cells[idx].id, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(), items: cellMenu(cells[idx].id) })
            }
            return
        case 'Escape':
            if (onEscape) {
                e.preventDefault()
                e.stopPropagation()
                onEscape()
            }
            return
        default:
            return
        }
        e.preventDefault()
        e.stopPropagation()
        if (next >= 0 && next < cells.length) {
            focusCell(next)
        }
    }

    // ---- drag and drop (the cells are drag sources, the grid of a user palette a drop area) ----

    const dropKind = (data: AppDragData | null): 'reorder' | 'move' | 'copy' | null => {
        if (!acceptsDrops || !paletteId || !data) {
            return null
        }
        if (data.cell && data.source?.paletteId === paletteId && data.source.pool === 'main') {
            return 'reorder'
        }
        if (data.cell && canInsertPaletteCell(paletteId, { cell: data.cell }, 'move')) {
            return 'move'
        }
        if (data.symbol && !data.source && canInsertPaletteCell(paletteId, { symbol: data.symbol }, 'copy')) {
            return 'copy'
        }
        return null
    }

    const onDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
        const kind = dropKind(dragData())
        if (!kind) {
            return
        }
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = kind === 'copy' ? 'copy' : 'move'
        setDropAt(dropRow(e.currentTarget, e.clientX, e.clientY))
    }

    const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
        const data = dragData()
        const kind = dropKind(data)
        setDropAt(null)
        if (!kind || !data || !paletteId) {
            return
        }
        e.preventDefault()
        e.stopPropagation()
        const row = paletteDropRow(e.currentTarget, e.clientX, e.clientY)
        if (kind === 'reorder') {
            const from = paletteCellRow(data.source!.cellId)
            const before = row < 0 ? paletteCellCount(paletteId) : row
            if (from >= 0 && before !== from && before !== from + 1) {
                movePaletteCell(data.source!.cellId, before > from ? before - 1 : before)
            }
        } else if (kind === 'move') {
            insertPaletteCell(paletteId, row, { cell: data.cell }, 'move')
        } else {
            insertPaletteCell(paletteId, row, { symbol: data.symbol }, 'copy')
        }
        setDragData(null)
    }

    const tabIdx = Math.min(focusIdx, cells.length - 1)
    return (
        <div className={`palette-grid${palette.drawGrid ? ' draw-grid' : ''}${dropAt !== null ? ' drop-active' : ''}`} ref={gridRef}
            role="listbox" aria-label={label} aria-orientation="horizontal" aria-multiselectable={onSelect ? true : undefined}
            data-palette-grid={paletteId ?? undefined}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${palette.gridWidth}px, 1fr))`, gridAutoRows: `${palette.gridHeight}px` }}
            onDragOver={onDragOver} onDragEnter={onDragOver}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDropAt(null)
                }
            }}
            onDrop={onDrop}>
            {cells.length === 0 && (
                <div className="palette-empty">
                    {acceptsDrops ? qtrc('palette', 'Drag and drop any element here') : qtrc('palette', 'No elements')}
                </div>
            )}
            {cells.map((cell, i) => {
                const name = paletteCellName(cell)
                const isSelected = selected ? selected.has(cell.id) : state.currentCell === cell.id
                return (
                    <div key={cell.id}
                        className={`palette-cell${state.currentCell === cell.id && !selected ? ' current' : ''}${selected?.has(cell.id) ? ' selected' : ''}`
                            + `${dropAt === i ? ' drop-before' : ''}${dropAt === i + 1 && i === cells.length - 1 ? ' drop-after' : ''}`}
                        role="option" data-cell={cell.id} data-element={cell.elementType} tabIndex={i === tabIdx ? 0 : -1}
                        aria-selected={isSelected} aria-label={name} title={name}
                        aria-disabled={!canApply || undefined}
                        draggable
                        onDragStart={(e) => {
                            const mime = paletteCellMimeData(cell.id)
                            if (mime.symbol) {
                                e.dataTransfer.setData('application/musescore/symbol', mime.symbol)
                            }
                            if (mime.cell) {
                                e.dataTransfer.setData('application/musescore/palette/cell', mime.cell)
                            }
                            e.dataTransfer.effectAllowed = 'copyMove'
                            setDragData({ ...mime, source: { paletteId, cellId: cell.id, pool } })
                        }}
                        onDragEnd={() => {
                            setDragData(null)
                            setDropAt(null)
                        }}
                        onFocus={() => { setFocusIdx(i); setCurrentCell(cell.id) }}
                        onClick={(e) => {
                            if (onSelect) {
                                onSelect(cell.id, e.ctrlKey || e.metaKey || e.shiftKey)
                            }
                            applyPaletteCell(cell.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
                        }}
                        onContextMenu={(e) => {
                            if (pool === 'main' && paletteId) {
                                e.preventDefault()
                                setMenu({ cellId: cell.id, anchor: new DOMRect(e.clientX, e.clientY, 0, 0), items: cellMenu(cell.id) })
                            }
                        }}
                        onKeyDown={(e) => onKeyDown(e, i)}>
                        <CellIcon cell={cell} palette={palette} />
                    </div>
                )
            })}
            {showMoreButton && (
                <button type="button" className="palette-more" aria-haspopup="dialog" aria-expanded={moreExpanded}
                    onClick={(e) => onMore?.(e.currentTarget)}>
                    {qtrc('palette', 'More')}
                </button>
            )}
            {menu && (
                <MenuPopup items={menu.items} anchor={menu.anchor} placement="below" label={label}
                    onClose={(back) => {
                        const id = menu.cellId
                        setMenu(null)
                        if (back) {
                            gridRef.current?.querySelector<HTMLElement>(`.palette-cell[data-cell="${id}"]`)?.focus()
                        }
                    }} />
            )}
        </div>
    )
}
