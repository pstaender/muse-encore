/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The palettes panel (port of src/palette/qml/MuseScore/Palette/PalettesPanel.qml with PalettesPanelHeader.qml,
 * AddPalettesPopup.qml and PalettesPanelContextMenuModel): "Add palettes" (the hidden palettes of the default tree)
 * and the search (all elements of the master palette by name), the palette tree. The palettes are the library's
 * (src/palette: PaletteCreator's default and master palettes), their cells drawn by the library.
 * TODO(port): custom palettes ("Create custom palette"), palette files, the master palette dialog, drag and drop.
 */
import { useEffect, useRef, useState } from 'react'
import { fontsInitialized } from '../../../src/index'
import { registerAction } from '../../actions/actions'
import { ICON_CODES } from '../../actions/uiactiondata'
import { arg, qtrc, useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { fontsReady, scoreViewState } from '../../scoreview'
import { setCurrentPanel, setPanelOpen } from '../panels'
import { applyPaletteCell, paletteCellName } from './PaletteGridView'
import { PaletteTree } from './PaletteTree'
import {
    endSearch, expandCollapseAll, hiddenPalettes, palettesState, searchPalettes, setPaletteVisible, setSearchText,
    setSingleClickToOpen, setSinglePalette, shownPalettes, startSearch, usePalettesState, userPalettes,
} from './palettestate'
import './palettes.css'

const icon = (name: string): string => String.fromCodePoint(ICON_CODES[name] ?? 0)

// ---------------------------------------------------------------------------------
//   actions: palette-search, apply-current-palette-element, the panel's menu (PalettesPanelContextMenuModel)
// ---------------------------------------------------------------------------------

const scoreShown = (): boolean => scoreViewState().hasScore

function registerPalettesActions(): void {
    // PaletteActionsController: opens the palettes and starts the search
    registerAction('palette-search', {
        run: () => {
            setPanelOpen('palettesPanel', true)
            setCurrentPanel('palettesPanel')
            startSearch()
        },
        enabled: scoreShown,
    })
    registerAction('apply-current-palette-element', {
        run: () => {
            const id = palettesState().currentCell
            if (id) {
                applyPaletteCell(id)
            }
        },
        enabled: () => scoreShown() && !!palettesState().currentCell,
    })
    registerAction('toggle-single-click-to-open-palette', {
        run: () => setSingleClickToOpen(!palettesState().singleClickToOpen), checked: () => palettesState().singleClickToOpen,
    }, { title: ['palette', 'Single-click to open a palette'], checkable: true })
    registerAction('toggle-single-palette', {
        run: () => setSinglePalette(!palettesState().singlePalette), checked: () => palettesState().singlePalette,
    }, { title: ['palette', 'Open only one palette at a time'], checkable: true })
    registerAction('collapse-all-palettes', { run: () => expandCollapseAll(false, []) }, { title: ['palette', 'Collapse all palettes'] })
    registerAction('expand-all-palettes', {
        run: () => expandCollapseAll(true, shownPalettes(userPalettes()).map(p => p.id)),
    }, { title: ['palette', 'Expand all palettes'] })
}

registerPalettesActions()

/** PalettesPanelContextMenuModel: the items of the tab's context menu before "Close" */
export function palettesPanelMenu(): MenuItem[] {
    // TODO(port): "Allow reordering palettes" (no drag and drop yet)
    return [
        { kind: 'action', code: 'toggle-single-click-to-open-palette' },
        { kind: 'action', code: 'toggle-single-palette' },
        { kind: 'separator' },
        { kind: 'action', code: 'collapse-all-palettes' },
        { kind: 'action', code: 'expand-all-palettes' },
    ]
}

// ---------------------------------------------------------------------------------
//   the header: "Add palettes", search
// ---------------------------------------------------------------------------------

/** AddPalettesPopup: the hidden palettes, each with a "+" button ("%1 added") */
function AddPalettesPopup({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }): React.JSX.Element {
    useLanguage()
    usePalettesState()
    const ref = useRef<HTMLDivElement>(null)
    const [added, setAdded] = useState<string[]>([])
    const all = userPalettes()
    // the palettes added while the popup is open stay in the list with their message
    const list = all.filter(p => hiddenPalettes(all).includes(p) || added.includes(p.id))
    useEffect(() => {
        const close = (e: PointerEvent): void => {
            if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('pointerdown', close)
        ref.current?.querySelector<HTMLElement>('button')?.focus()
        return () => document.removeEventListener('pointerdown', close)
    }, [anchor, onClose])
    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
            anchor.focus()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
            const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
            buttons[Math.max(0, Math.min(buttons.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
            e.preventDefault()
            e.stopPropagation()
        }
    }
    return (
        <div ref={ref} className="add-palettes-popup" role="dialog" aria-label={qtrc('palette', 'More palettes')} onKeyDown={onKeyDown}>
            <div className="add-palettes-title">{qtrc('palette', 'More palettes')}</div>
            {/* TODO(port): custom palettes */}
            <button type="button" className="secondary" disabled>{qtrc('palette', 'Create custom palette')}</button>
            {list.length === 0 && <div className="add-palettes-empty">{qtrc('palette', 'All palettes were added')}</div>}
            <ul>
                {list.map(p => (
                    <li key={p.id} data-palette={p.id}>
                        {added.includes(p.id)
                            ? <span className="add-palettes-added">{arg(qtrc('palette', '%1 added'), p.name)}</span>
                            : (
                                <>
                                    <span className="add-palettes-name">{p.name}</span>
                                    <button type="button" className="icon" aria-label={arg(qtrc('palette', 'Add %1 palette'), p.name)}
                                        title={arg(qtrc('palette', 'Add %1 palette'), p.name)}
                                        onClick={() => {
                                            setPaletteVisible(p.id, true)
                                            setAdded(a => [...a, p.id])
                                        }}>
                                        {icon('PLUS')}
                                    </button>
                                </>
                            )}
                    </li>
                ))}
            </ul>
        </div>
    )
}

function PalettesPanelHeader(): React.JSX.Element {
    useLanguage()
    const state = usePalettesState()
    const [popup, setPopup] = useState<HTMLElement | null>(null)
    const addButton = useRef<HTMLButtonElement>(null)
    const searchField = useRef<HTMLInputElement>(null)
    useEffect(() => {
        if (state.searchOpened) {
            searchField.current?.focus()
            searchField.current?.select()
        }
    }, [state.searchOpened])
    const end = (): void => {
        endSearch()
        setTimeout(() => addButton.current?.focus())
    }
    if (state.searchOpened) {
        return (
            <div className="palettes-header">
                <div className="search palette-search">
                    <span className="icon-glyph" aria-hidden="true">{icon('SEARCH')}</span>
                    <input ref={searchField} type="search" value={state.searchText} placeholder={qtrc('ui', 'Search')}
                        aria-label={qtrc('palette', 'Search palettes')}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault()
                                e.stopPropagation()
                                end()
                            } else if (e.key === 'Enter') {
                                // onAccepted: applyCurrentPaletteElementRequested
                                e.preventDefault()
                                const id = palettesState().currentCell
                                    ?? document.querySelector<HTMLElement>('.palette-tree .palette-cell')?.dataset.cell
                                if (id) {
                                    applyPaletteCell(id)
                                }
                            } else if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                document.querySelector<HTMLElement>('.palette-tree .palette-cell')?.focus()
                            }
                        }} />
                    <button type="button" className="icon" aria-label={qtrc('global', 'Clear')} title={qtrc('global', 'Clear')} onClick={end}>
                        {icon('CLOSE_X_ROUNDED')}
                    </button>
                </div>
            </div>
        )
    }
    return (
        <div className="palettes-header">
            <button ref={addButton} type="button" className="secondary add-palettes" aria-haspopup="dialog" aria-expanded={!!popup}
                onClick={() => setPopup(popup ? null : addButton.current)}>
                {qtrc('palette', 'Add palettes')}
            </button>
            <button type="button" className="icon palette-search-button" aria-label={qtrc('palette', 'Search palettes')}
                title={qtrc('palette', 'Search palettes')} onClick={() => { setPopup(null); startSearch() }}>
                {icon('SEARCH')}
            </button>
            {popup && <AddPalettesPopup anchor={popup} onClose={() => setPopup(null)} />}
        </div>
    )
}

// ---------------------------------------------------------------------------------
//   the panel
// ---------------------------------------------------------------------------------

function useFontsReady(): boolean {
    const [ready, setReady] = useState(fontsInitialized())
    useEffect(() => {
        let alive = true
        if (!ready) {
            void fontsReady.then(() => alive && setReady(true), () => {})
        }
        return () => { alive = false }
    }, [ready])
    return ready
}

export function PalettesPanel(): React.JSX.Element {
    useLanguage()
    const state = usePalettesState()
    const ready = useFontsReady()
    if (!ready) {
        return <div className="palettes-panel" />
    }
    const searching = state.searchOpened
    const palettes = searching ? searchPalettes(state.searchText, paletteCellName) : shownPalettes(userPalettes())
    return (
        <div className="palettes-panel">
            <PalettesPanelHeader />
            {searching && !state.searchText.trim() && (
                <div className="palettes-hint">{qtrc('palette', 'Start typing to search all palettes')}</div>
            )}
            {searching && state.searchText.trim() && palettes.length === 0 && (
                <div className="palettes-hint">{qtrc('global', 'No results found')}</div>
            )}
            <div className="palettes-scroll">
                <PaletteTree palettes={palettes} searching={searching} />
            </div>
        </div>
    )
}
