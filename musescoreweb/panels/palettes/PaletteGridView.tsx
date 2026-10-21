/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The cells of a palette (port of src/palette/qml/MuseScore/Palette/internal/PaletteGridView.qml with
 * PaletteGridLinesCanvas.qml and the cell icons of PaletteCellIconEngine): a grid of cells of the palette's cell
 * size, stretched to fill the width, with grid lines; the "More" button (MoreElementsPopup) at the end.
 * A click (or Enter) applies the cell to the selection (PaletteRootModel / Palette::applyPaletteElement), the
 * tooltip is the cell's translated name. Keyboard: arrows move between the cells (a WAI-ARIA grid-like listbox),
 * Home/End, Enter/Space apply, Escape goes back to the palette's header.
 * TODO(port): drag and drop of cells (to the score and within palettes), editing (delete, cell properties).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { drawPaletteCell, paletteCellElement, type PaletteCellInfo, type PaletteInfo } from '../../../src/index'
import { actionDefinition, actionDescription } from '../../actions/actions'
import { qtrc, useLanguage } from '../../i18n'
import { currentScore } from '../../scoreview'
import { applyPaletteElement, canApplyPaletteElement, scoreChanged } from '../editbridge'
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
    if (applyPaletteElement(score, element, modifiers)) {
        scoreChanged()
        return true
    }
    return false
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
    }, [cell.id, palette.gridWidth, palette.gridHeight, palette.mag, lang, dark])
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

export function PaletteGridView({ palette, cells = palette.cells, label, showMoreButton = false, onMore, moreExpanded = false, onEscape }: {
    palette: PaletteInfo
    cells?: readonly PaletteCellInfo[]
    label: string
    showMoreButton?: boolean
    onMore?: (anchor: HTMLElement) => void
    moreExpanded?: boolean
    /** Escape in the grid (focus back to the header) */
    onEscape?: () => void
}): React.JSX.Element {
    useLanguage()
    const state = usePalettesState()
    const gridRef = useRef<HTMLDivElement>(null)
    const [focusIdx, setFocusIdx] = useState(0)
    const canApply = canApplyPaletteElement(currentScore())

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

    const tabIdx = Math.min(focusIdx, cells.length - 1)
    return (
        <div className={`palette-grid${palette.drawGrid ? ' draw-grid' : ''}`} ref={gridRef} role="listbox" aria-label={label}
            aria-orientation="horizontal"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${palette.gridWidth}px, 1fr))`, gridAutoRows: `${palette.gridHeight}px` }}>
            {cells.length === 0 && <div className="palette-empty">{qtrc('palette', 'No elements')}</div>}
            {cells.map((cell, i) => {
                const name = paletteCellName(cell)
                return (
                    <div key={cell.id} className={`palette-cell${state.currentCell === cell.id ? ' current' : ''}`} role="option"
                        data-cell={cell.id} data-element={cell.elementType} tabIndex={i === tabIdx ? 0 : -1}
                        aria-selected={state.currentCell === cell.id} aria-label={name} title={name}
                        aria-disabled={!canApply || undefined}
                        onFocus={() => { setFocusIdx(i); setCurrentCell(cell.id) }}
                        onClick={(e) => applyPaletteCell(cell.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
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
        </div>
    )
}
