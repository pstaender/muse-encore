/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Parts dialog (notationscene/qml/.../PartsDialog.qml with PartsTopPanel, PartsView and PartDelegate;
 * File > Parts…, action "parts"): the parts of the score (the existing ones and the potential ones of the instruments),
 * create, duplicate, rename, reset and delete parts, open them in tabs. The model is the library's PartListModel.
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { createPartListModel, type PartListModel, type Score } from '../../src/index'
import { ICON_CODES } from '../actions/uiactiondata'
import { showMessage } from '../components/MessageBox'
import { qtrc, useLanguage } from '../i18n'
import { currentMasterScore, scoreChanged } from '../scoreview'
import './parts.css'

const tr = (s: string): string => qtrc('notation', s)

function PartRow({ model, index, editing, onEdit, onChanged }: {
    model: PartListModel
    index: number
    editing: boolean
    onEdit: (editing: boolean) => void
    onChanged: () => void
}): React.JSX.Element {
    const item = model.items()[index]
    const [menuOpen, setMenuOpen] = useState(false)
    const [warning, setWarning] = useState('')
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) {
            return
        }
        const close = (e: PointerEvent): void => {
            if (!menuRef.current?.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('pointerdown', close, true)
        return () => document.removeEventListener('pointerdown', close, true)
    }, [menuOpen])

    // PartDelegate::endEditTitle: titleEditingFinished -> PartsView: setPartTitle
    const endEditTitle = (newTitle: string): void => {
        setWarning('')
        onEdit(false)
        model.setPartTitle(index, newTitle)
        onChanged()
    }

    const handleMenuItem = (itemId: string): void => {
        setMenuOpen(false)
        switch (itemId) {
        case 'duplicate':
            model.copyPart(index)
            onChanged()
            break
        case 'rename':
            onEdit(true)
            break
        case 'reset':
            void (async () => {
                if (model.resetPartNeedsQuestion(index)
                    && await showMessage(tr('Are you sure you want to reset this part?'), '', ['no', 'yes']) !== 'yes') {
                    return
                }
                model.doResetPart(index)
                onChanged()
            })()
            break
        case 'delete':
            void (async () => {
                if (model.removePartNeedsQuestion(index)
                    && await showMessage(tr('Are you sure you want to delete this part?'), '', ['no', 'yes']) !== 'yes') {
                    return
                }
                model.doRemovePart(index)
                onChanged()
            })()
            break
        }
    }

    const operations = [
        { id: 'duplicate', title: tr('Duplicate'), enabled: true },
        { id: 'rename', title: tr('Rename'), enabled: true },
        { id: 'reset', title: tr('Reset'), enabled: item.isInited },
    ]
    if (item.isCustom) {
        operations.push({ id: 'delete', title: tr('Delete'), enabled: true })
    }

    return (
        <div className="part-row" role="option" aria-selected={item.isSelected} data-index={index}
            onClick={(e) => {
                if (!editing) {
                    model.selectPart(index, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
                    onChanged()
                }
            }}
            onDoubleClick={() => onEdit(true)}>
            <span className="tool-icon part-icon" aria-hidden="true">{String.fromCodePoint(ICON_CODES.NEW_FILE)}</span>
            {editing
                ? (
                    <span className="part-title-edit">
                        <input type="text" maxLength={40} defaultValue={item.title} autoFocus aria-label={item.title}
                            onFocus={e => e.target.select()}
                            onChange={e => setWarning(model.validatePartTitle(index, e.target.value))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    endEditTitle((e.target as HTMLInputElement).value)
                                } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setWarning('')
                                    onEdit(false)
                                }
                            }}
                            onBlur={e => endEditTitle(e.target.value)} />
                        <span className="part-title-warning">{warning}</span>
                    </span>
                )
                : <span className="part-title">{item.title}</span>}
            <div className="part-menu" ref={menuRef}>
                <button type="button" className="icon-button" aria-label={item.title} aria-haspopup="menu" aria-expanded={menuOpen}
                    onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(!menuOpen)
                    }}>
                    <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(ICON_CODES.MENU_THREE_DOTS)}</span>
                </button>
                {menuOpen && (
                    <div className="part-menu-popup" role="menu">
                        {operations.map(op => (
                            <button key={op.id} type="button" role="menuitem" disabled={!op.enabled}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleMenuItem(op.id)
                                }}>{op.title}</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function PartsDialog({ score, onClose }: { score: Score; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [model] = useState(() => {
        const m = createPartListModel(score)
        m.load()
        return m
    })
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const [editingIndex, setEditingIndex] = useState(-1)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const changed = (): void => {
        rerender()
        scoreChanged(false)
    }
    const items = model.items()

    return (
        <dialog ref={ref} className="parts-dialog" aria-labelledby="parts-dialog-title"
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="parts-dialog-title" className="visually-hidden">{tr('Parts')}</h2>
            <div className="parts-top-panel" role="toolbar" aria-label={tr('Parts actions')}>
                <span className="parts-title" aria-hidden="true">{tr('Parts')}</span>
                <span className="spacer" />
                <button type="button" className="secondary"
                    onClick={() => {
                        // PartsView: partAdded -> the title of the new part is edited
                        setEditingIndex(model.createNewPart())
                        changed()
                    }}>{tr('Create new part')}</button>
            </div>
            <div className="parts-header">{tr('Name')}</div>
            <div className="parts-view" role="listbox" aria-label={tr('Parts view')} aria-multiselectable="true">
                {items.map((_, i) => (
                    <PartRow key={i} model={model} index={i} editing={editingIndex === i}
                        onEdit={e => setEditingIndex(e ? i : -1)} onChanged={changed} />
                ))}
            </div>
            <div className="dialog-buttons">
                <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Close')}</button>
                <span className="spacer" />
                <button type="button" className="secondary"
                    onClick={() => {
                        model.openAllParts()
                        ref.current?.close()
                    }}>{qtrc('global', 'Open all')}</button>
                <button type="button" className="primary" disabled={!model.hasSelection()}
                    onClick={() => {
                        model.openSelectedParts()
                        ref.current?.close()
                    }}>{qtrc('global', 'Open selected')}</button>
            </div>
        </dialog>
    )
}

let s_open: { key: number; score: Score } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** NotationActionController::openPartsDialog */
export function openPartsDialog(): void {
    const score = currentMasterScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function PartsDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <PartsDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
