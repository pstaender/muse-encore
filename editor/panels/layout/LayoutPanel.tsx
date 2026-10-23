/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The layout panel (port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/LayoutPanel.qml with
 * LayoutControlPanel.qml, LayoutPanelAddButton.qml, LayoutPanelItemDelegate.qml / VisibilityControls.qml,
 * LayoutPanelItemControl.qml and LayoutPanelContextMenuModel): the tree of the library's LayoutPanelTreeModel.
 * Keyboard: a WAI-ARIA tree (arrows, Home/End, Left/Right collapse/expand, Enter/Space selects or adds a staff,
 * Shift extends the selection, Delete removes the selected rows).
 * The score selection selects the rows of its parts (LayoutPanelTreeModel::updateSelectedRows); like MuseScore,
 * selecting rows does not change the score selection.
 * The score changes go through editbridge (NotationParts, undoable); the model is reloaded after every change of the
 * score (scoreVersion), keeping the expanded and selected rows.
 * Rows are rearranged by dragging them (LayoutPanelTreeModel startActiveDrag / moveRows / endActiveDrag).
 */
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import {
    AutoOnOff, createInstrumentSettingsModel, createSystemObjectsLayerSettingsModel, createLayoutPanelModel, createStaffSettingsModel, InsertMode, LayoutPanelItemType, layoutPanelItemKey, layoutPanelPartNames, layoutPanelScoreOrder,
    scoreOrders, type AbstractLayoutPanelTreeItem, type LayoutPanelNotationParts, type LayoutPanelTreeModel, type PartTreeItem,
    type Score,
} from '../../../src/index'
import { actionsChanged, registerAction, shortcutText } from '../../actions/actions'
import { ICON_CODES } from '../../actions/uiactiondata'
import { MenuPopup } from '../../components/Menu'
import { arg, qtrc, useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { currentMasterScore, currentScore, scoreViewState, useScoreView } from '../../scoreview'
import {
    addInstruments, addStaff, addSystemObjects, canEditParts, insertPart, moveParts, moveStaves, moveSystemObjectLayerBottomStaff,
    moveSystemObjects, removeParts, removeStaves, removeSystemObjects, replacePart, replacePartInstrument, scoreChanged, setPartVisible,
    setScoreOrder, setStaffVisible,
} from '../editbridge'
import { setPanelOpen } from '../panels'
import { InstrumentsDialog } from './InstrumentsDialog'
import { askInstrument } from '../../dialogs/SelectInstrumentDialog'
import { showMessage } from '../../components/MessageBox'
import './layoutpanel.css'

const icon = (name: string): string => String.fromCodePoint(ICON_CODES[name])

// ---------------------------------------------------------------------------------
//   state kept while the panel is not shown: expanded rows, the instruments dialog
// ---------------------------------------------------------------------------------

let s_expanded = new Set<string>()
let s_dialogOpen = false
let s_version = 0
const s_listeners = new Set<() => void>()

function notify(): void {
    s_version++
    for (const l of s_listeners) {
        l()
    }
}

function useLayoutPanelState(): number {
    return useSyncExternalStore(
        (l) => {
            s_listeners.add(l)
            return () => s_listeners.delete(l)
        },
        () => s_version,
    )
}

function setExpanded(key: string, expanded: boolean): void {
    s_expanded = new Set(s_expanded)
    if (expanded) {
        s_expanded.add(key)
    } else {
        s_expanded.delete(key)
    }
    notify()
}

/** the model of the panel shown (for the actions) */
let s_model: LayoutPanelTreeModel | null = null
/** the keys of the selected rows (kept when the model is reloaded after a change requested by the panel) */
let s_selectedKeys: string[] = []
let s_keepSelection = false

function allItems(model: LayoutPanelTreeModel): AbstractLayoutPanelTreeItem[] {
    const res: AbstractLayoutPanelTreeItem[] = []
    const add = (item: AbstractLayoutPanelTreeItem): void => {
        res.push(item)
        item.childItems().forEach(add)
    }
    model.rootItem()?.childItems().forEach(add)
    return res
}

/** LayoutPanelTreeView.expandCollapseAll */
function expandCollapseAll(expand: boolean): void {
    if (!s_model) {
        return
    }
    const next = new Set(s_expanded)
    for (const item of s_model.rootItem()?.childItems() ?? []) {
        if (item.isExpandable()) {
            if (expand) {
                next.add(layoutPanelItemKey(item))
            } else {
                next.delete(layoutPanelItemKey(item))
            }
        }
    }
    s_expanded = next
    notify()
}

// ---------------------------------------------------------------------------------
//   actions: "instruments" (Add > New instrument), the context menu of the panel's tab
// ---------------------------------------------------------------------------------

const scoreShown = (): boolean => scoreViewState().hasScore

/** the orders of LayoutPanelContextMenuModel::loadInstrumentOrders: orders.xml, "custom" */
function instrumentOrders(): { id: string; name: string }[] {
    const orders = scoreOrders().map(o => ({ id: o.id, name: o.name }))
    if (!orders.some(o => o.id === 'custom')) {
        orders.push({ id: 'custom', name: 'Custom' })
    }
    return orders
}

function registerLayoutPanelActions(): void {
    registerAction('instruments', {
        run: () => {
            setPanelOpen('instrumentsPanel', true)
            s_dialogOpen = true
            notify()
        },
        enabled: () => scoreShown() && canEditParts(currentScore()),
    })
    registerAction('layoutpanel-add-system-markings', {
        run: () => s_model?.addSystemMarkings(),
        enabled: () => scoreShown() && canEditParts(currentScore()) && !!s_model?.isAddingSystemMarkingsAvailable(),
    }, { title: ['layoutpanel', 'System markings (tempo, rehearsal marks, etc.)'] })
    registerAction('collapse-all-instruments', { run: () => expandCollapseAll(false) },
        { title: ['layoutpanel', 'Collapse all instruments'] })
    registerAction('expand-all-instruments', { run: () => expandCollapseAll(true) },
        { title: ['layoutpanel', 'Expand all instruments'] })

    // set-instruments-order with the order id as argument; the customized current order is an extra item
    const currentOrder = (): { id: string; customized: boolean } | null => {
        const score = currentMasterScore()
        return score ? layoutPanelScoreOrder(score) : null
    }
    for (const order of instrumentOrders()) {
        const set = (): void => {
            const score = currentMasterScore()
            if (score && setScoreOrder(score, order.id)) {
                scoreChanged()
            }
        }
        const enabled = (): boolean => scoreShown() && canEditParts(currentScore())
        registerAction(`set-instruments-order:${order.id}`, {
            run: set, enabled, checked: () => { const c = currentOrder(); return !!c && !c.customized && c.id === order.id },
        }, { title: ['engraving/scoreorder', order.name], checkable: true })
        registerAction(`set-instruments-order:${order.id}:customized`, {
            run: set, enabled, checked: () => true,
        }, { title: ['engraving/scoreorder', '%1 (Customized)', '', [['engraving/scoreorder', order.name]]], checkable: true })
    }
}

registerLayoutPanelActions()

/** LayoutPanelContextMenuModel: "Instrument ordering" (in the main score), "Collapse all", "Expand all" */
export function layoutPanelMenu(): MenuItem[] {
    const score = currentScore()
    const items: MenuItem[] = []
    if (score?.isMaster()) {
        const current = layoutPanelScoreOrder(score)
        items.push({
            kind: 'menu', id: 'ordering-menu', title: ['layoutpanel', 'Instrument ordering'], items: () => instrumentOrders().flatMap((o): MenuItem[] => {
                const item: MenuItem = { kind: 'action', code: `set-instruments-order:${o.id}` }
                return current.customized && current.id === o.id ? [item, { kind: 'action', code: `set-instruments-order:${o.id}:customized` }] : [item]
            }),
        }, { kind: 'separator' })
    }
    items.push({ kind: 'action', code: 'collapse-all-instruments' }, { kind: 'action', code: 'expand-all-instruments' })
    return items
}

/** removeSelectedRows after the warning of LayoutPanelTreeModel::warnAboutRemovingInstrumentsIfNecessary (No/Yes) */
function removeSelectedRows(model: LayoutPanelTreeModel): void {
    const warning = model.removeWarning()
    if (!warning) {
        model.removeSelectedRows()
        return
    }
    void showMessage(warning.text, warning.detail, ['no', 'yes']).then(button => {
        if (button === 'yes') {
            model.removeSelectedRows()
        }
    })
}

// ---------------------------------------------------------------------------------
//   score changes requested by the model (INotationParts)
// ---------------------------------------------------------------------------------

function notationParts(score: Score): LayoutPanelNotationParts {
    const run = (changed: boolean): void => {
        if (changed) {
            s_keepSelection = true
            scoreChanged()
        }
    }
    return {
        setPartVisible: (id, visible) => run(setPartVisible(score, id, visible)),
        setStaffVisible: (id, visible) => run(setStaffVisible(score, id, visible)),
        removeParts: (ids) => run(ids.length > 0 && removeParts(score, ids)),
        removeStaves: (ids) => run(ids.length > 0 && removeStaves(score, ids)),
        moveParts: (ids, dest, mode) => run(moveParts(score, ids, dest, mode === InsertMode.After)),
        moveStaves: (ids, dest, mode) => run(moveStaves(score, ids, dest, mode === InsertMode.After)),
        appendStaff: (partId) => run(addStaff(score, partId)),
        insertPart: (part, index) => run(insertPart(score, part, index)),
        replacePart: (partId, part) => run(replacePart(score, partId, part)),
        addSystemObjects: (ids) => run(addSystemObjects(score, ids)),
        removeSystemObjects: (ids) => run(ids.length > 0 && removeSystemObjects(score, ids)),
        moveSystemObjects: (src, dst) => run(moveSystemObjects(score, src, dst)),
        moveSystemObjectLayerBelowBottomStaff: () => run(moveSystemObjectLayerBottomStaff(score, true)),
        moveSystemObjectLayerAboveBottomStaff: () => run(moveSystemObjectLayerBottomStaff(score, false)),
    }
}

// ---------------------------------------------------------------------------------
//   the tree
// ---------------------------------------------------------------------------------

interface Row {
    item: AbstractLayoutPanelTreeItem
    key: string
    depth: number
    expanded: boolean
}

function visibleRows(model: LayoutPanelTreeModel, expanded: ReadonlySet<string>): Row[] {
    const rows: Row[] = []
    const add = (item: AbstractLayoutPanelTreeItem, depth: number): void => {
        const key = layoutPanelItemKey(item)
        const isExpanded = item.isExpandable() && expanded.has(key)
        rows.push({ item, key, depth, expanded: isExpanded })
        if (isExpanded) {
            for (const c of item.childItems()) {
                add(c, depth + 1)
            }
        }
    }
    for (const item of model.rootItem()?.childItems() ?? []) {
        add(item, 0)
    }
    return rows
}

function moveTooltip(type: LayoutPanelItemType, dir: 'up' | 'down' | 'remove'): string {
    const texts: Partial<Record<LayoutPanelItemType, Record<typeof dir, string>>> = {
        [LayoutPanelItemType.PART]: {
            up: 'Move selected instruments up', down: 'Move selected instruments down', remove: 'Remove selected instruments',
        },
        [LayoutPanelItemType.STAFF]: {
            up: 'Move selected staves up', down: 'Move selected staves down', remove: 'Remove selected staves',
        },
        [LayoutPanelItemType.SYSTEM_OBJECTS_LAYER]: {
            up: 'Move selected system markings up', down: 'Move selected system markings down', remove: 'Remove selected system markings',
        },
    }
    const t = texts[type]?.[dir]
    return t ? qtrc('layoutpanel', t) : ''
}

/** LayoutControlPanel.qml: Add (menu), up, down, remove */
function LayoutControlPanel({ model, editable }: { model: LayoutPanelTreeModel; editable: boolean }): React.JSX.Element {
    const [menu, setMenu] = useState<DOMRect | null>(null)
    const addRef = useRef<HTMLButtonElement>(null)
    const type = model.selectedItemsType()
    const addItems: MenuItem[] = [
        { kind: 'action', code: 'instruments', title: ['layoutpanel', 'New instrument'] },
        { kind: 'separator' },
        { kind: 'action', code: 'layoutpanel-add-system-markings' },
    ]
    const button = (name: string, dir: 'up' | 'down' | 'remove', enabled: boolean, run: () => void): React.JSX.Element => {
        const tip = moveTooltip(type, dir)
        return (
            <button className="tool-button layout-control" data-control={dir} title={tip} aria-label={tip || dir} disabled={!editable || !enabled} onClick={run}>
                <span className="tool-icon" aria-hidden="true">{icon(name)}</span>
            </button>
        )
    }
    return (
        <div className="layout-controls">
            <button ref={addRef} className="layout-add-button" disabled={!editable || !model.isAddingAvailable()}
                aria-label={qtrc('layoutpanel', 'Add instruments or system markings')} aria-haspopup="menu" aria-expanded={!!menu}
                onClick={() => setMenu(menu ? null : addRef.current!.getBoundingClientRect())}>
                {qtrc('layoutpanel', 'Add')}
            </button>
            {button('ARROW_UP', 'up', model.isMovingUpAvailable(), () => model.moveSelectedRowsUp())}
            {button('ARROW_DOWN', 'down', model.isMovingDownAvailable(), () => model.moveSelectedRowsDown())}
            {button('DELETE_TANK', 'remove', model.isRemovingAvailable(), () => removeSelectedRows(model))}
            {menu && (
                <MenuPopup items={addItems} anchor={menu} placement="below" label={qtrc('layoutpanel', 'Add')}
                    onClose={(back) => {
                        setMenu(null)
                        if (back) {
                            addRef.current?.focus()
                        }
                    }} />
            )}
        </div>
    )
}

/** StyledPopupView of the settings popups: closed by a click outside and by Escape */
function SettingsPopup({ anchor, onClose, className = '', children }: {
    anchor: DOMRect; onClose: () => void; className?: string; children: React.ReactNode
}): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    const close = useRef(onClose)
    close.current = onClose
    useEffect(() => {
        ref.current?.querySelector<HTMLElement>('input')?.focus()
        const down = (e: PointerEvent): void => {
            if (!ref.current?.contains(e.target as Node)) {
                close.current()
            }
        }
        document.addEventListener('pointerdown', down, true)
        return () => document.removeEventListener('pointerdown', down, true)
    }, [])
    return (
        <div ref={ref} className={`layout-settings-popup ${className}`} role="dialog" aria-label={qtrc('layoutpanel', 'Settings')}
            style={{
                left: Math.max(4, Math.min(anchor.left, window.innerWidth - 268)), top: anchor.bottom + 4,
                maxHeight: Math.max(160, window.innerHeight - anchor.bottom - 12),
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation()
                    onClose()
                }
            }}>
            {children}
        </div>
    )
}

/**
 * InstrumentSettingsPopup.qml (the names of the part are read-only here) and its "Replace instrument" (main score) and
 * "Reset all formatting" (part score) buttons
 */
/** TextInputField with onTextEditingFinished: Enter, leaving the field or closing the popup commit the text */
function TextEditingField({ value, onFinished, label, className }: {
    value: string; onFinished: (text: string) => void; label: string; className?: string
}): React.JSX.Element {
    const [text, setText] = useState(value)
    const latest = useRef({ text, value, onFinished })
    latest.current = { text, value, onFinished }
    useEffect(() => () => {
        const l = latest.current
        if (l.text !== l.value) {
            l.onFinished(l.text)
        }
    }, [])
    return (
        <input type="text" className={className} aria-label={label} value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== value && onFinished(text)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    if (text !== value) {
                        onFinished(text)
                    }
                }
            }} />
    )
}

function InstrumentSettingsPopup({ item, anchor, onClose }: { item: AbstractLayoutPanelTreeItem; anchor: DOMRect; onClose: () => void }): React.JSX.Element {
    const names = layoutPanelPartNames(item)
    const [model] = useState(() => createInstrumentSettingsModel(item.score(), item.id()))
    const [, rerender] = useReducer((x: number) => x + 1, 0)
    const isMainScore = model.isMainScore()
    const tr = (text: string): string => qtrc('layoutpanel/instrumentsettingspopup', text)
    const change = (f: () => void): void => {
        f()
        s_keepSelection = true
        scoreChanged()
        rerender()
    }
    const nameLabel = isMainScore ? tr('Name on main score') : tr('Name on part score')
    const hideWhenEmpty = model.hideWhenEmpty()
    return (
        <SettingsPopup anchor={anchor} onClose={onClose}>
            <label className="field">
                <span>{nameLabel}</span>
                <TextEditingField className="instrument-name" label={nameLabel} value={model.instrumentName()}
                    onFinished={(text) => change(() => model.setInstrumentName(text))} />
            </label>
            <label className="field">
                <span>{tr('Abbreviated name')}</span>
                <TextEditingField className="instrument-abbreviature" label={tr('Abbreviated name')} value={model.abbreviature()}
                    onFinished={(text) => change(() => model.setAbbreviature(text))} />
            </label>
            <hr className="separator" />
            <div className="field" role="radiogroup" aria-label={tr('Hide empty staves')}>
                <span className="bold">{tr('Hide empty staves')}</span>
                {([[AutoOnOff.AUTO, 'Auto'], [AutoOnOff.ON, 'Always hide'], [AutoOnOff.OFF, 'Never hide']] as const).map(([value, text]) => (
                    <label key={value} className="check">
                        <input type="radio" name="instrument-hide-when-empty" checked={hideWhenEmpty === value}
                            onChange={() => change(() => model.setHideWhenEmpty(value))} />
                        {tr(text)}
                    </label>
                ))}
                {model.hasMultipleStaves() && (
                    <label className={`check${hideWhenEmpty === AutoOnOff.OFF ? ' disabled' : ''}`}>
                        <input type="checkbox" checked={!model.hideStavesWhenIndividuallyEmpty()} disabled={hideWhenEmpty === AutoOnOff.OFF}
                            onChange={() => change(() => model.setHideStavesWhenIndividuallyEmpty(!model.hideStavesWhenIndividuallyEmpty()))} />
                        {tr('Only hide staves on a system if the entire instrument is empty')}
                    </label>
                )}
            </div>
            {names && <>
                <hr className="separator" />
                {isMainScore ? (
                    <button type="button" className="secondary replace-instrument" onClick={() => {
                        // PartTreeItem::replaceInstrument (SelectInstrumentsScenario::selectInstrument): in the master score
                        const partId = item.id()
                        onClose()
                        void askInstrument().then(templateId => {
                            const score = currentMasterScore()
                            if (templateId && score && replacePartInstrument(score, partId, templateId)) {
                                scoreChanged()
                            }
                        })
                    }}>{qtrc('layoutpanel/instrumentsettingspopup', 'Replace instrument')}</button>
                ) : (
                    <button type="button" className="secondary reset-formatting" onClick={() => {
                        // PartTreeItem::resetAllFormatting
                        onClose()
                        void showMessage(qtrc('layoutpanel', 'Are you sure you want to reset all formatting?'),
                            qtrc('layoutpanel', 'This action can not be undone'), ['no', 'yes']).then(button => {
                            if (button === 'yes') {
                                (item as PartTreeItem).resetAllFormatting()
                            }
                        })
                    }}>{qtrc('layoutpanel/instrumentsettingspopup', 'Reset all formatting')}</button>
                )}
            </>}
        </SettingsPopup>
    )
}

/** SystemObjectsLayerSettingsPopup.qml with the library's SystemObjectsLayerSettingsModel (VisibilityBox rows) */
function SystemObjectsLayerSettingsPopup({ item, anchor, onClose }: { item: AbstractLayoutPanelTreeItem; anchor: DOMRect; onClose: () => void }): React.JSX.Element {
    const [model] = useState(() => createSystemObjectsLayerSettingsModel(item.score(), item.id()))
    const [, rerender] = useReducer((x: number) => x + 1, 0)
    return (
        <SettingsPopup anchor={anchor} onClose={onClose} className="system-objects-settings">
            <span className="bold">{qtrc('layoutpanel', 'Display at this position on the score')}</span>
            <div className="field">
                {model.groups().map((g, i) => (
                    <button key={i} type="button" className="visibility-box" aria-pressed={g.isGroupVisible}
                        onClick={() => {
                            model.setSystemObjectsGroupVisible(i, !g.isGroupVisible)
                            s_keepSelection = true
                            scoreChanged()
                            rerender()
                        }}>
                        <span className="tool-icon" aria-hidden="true">{icon(g.isGroupVisible ? 'EYE_OPEN' : 'EYE_CLOSED')}</span>
                        <span>{g.title}</span>
                    </button>
                ))}
            </div>
        </SettingsPopup>
    )
}

/** StaffSettingsPopup.qml with the library's StaffSettingsModel */
function StaffSettingsPopup({ item, anchor, onClose }: { item: AbstractLayoutPanelTreeItem; anchor: DOMRect; onClose: () => void }): React.JSX.Element {
    const [model] = useState(() => createStaffSettingsModel(item.score(), item.id()))
    const [, rerender] = useReducer((x: number) => x + 1, 0)
    const tr = (text: string): string => qtrc('layoutpanel/staffsettingspopup', text)
    // every change is a command of the score: the view and the panels are updated
    const change = (f: () => void): void => {
        f()
        s_keepSelection = true
        scoreChanged()
        rerender()
    }
    const hideWhenEmpty = model.hideWhenEmpty()
    const staffTypes = model.allStaffTypes()
    return (
        <SettingsPopup anchor={anchor} onClose={onClose} className="staff-settings">
            <label className="field">
                <span className="bold">{tr('Staff type')}</span>
                <select value={model.staffType()} disabled={staffTypes.length <= 1}
                    onChange={(e) => change(() => model.setStaffType(Number(e.target.value)))}>
                    {staffTypes.map(t => <option key={t.value} value={t.value}>{t.text}</option>)}
                </select>
            </label>
            {!model.isMainScore() && <>
                <hr className="separator" />
                <div className="field">
                    <span>{tr('Voices visible in the score')}</span>
                    <div className="voices">
                        {model.voices().map((v, i) => (
                            <label key={i} className="check">
                                <input type="checkbox" checked={v.isVoiceVisible}
                                    onChange={() => change(() => model.setVoiceVisible(i, !v.isVoiceVisible))} />
                                {v.title}
                            </label>
                        ))}
                    </div>
                </div>
            </>}
            <hr className="separator" />
            <label className="check">
                <input type="checkbox" checked={model.isSmallStaff()} onChange={() => change(() => model.setIsSmallStaff(!model.isSmallStaff()))} />
                {tr('Small staff')}
            </label>
            <label className="check">
                <input type="checkbox" checked={model.cutawayEnabled()}
                    onChange={() => change(() => model.setCutawayEnabled(!model.cutawayEnabled()))} />
                {tr('Hide all measures that do not contain notation (cutaway)')}
            </label>
            <hr className="separator" />
            <div className="field" role="radiogroup" aria-label={tr('Hide empty staves')}>
                <span className="bold">{tr('Hide empty staves')}</span>
                {([[AutoOnOff.AUTO, 'Follow instrument'], [AutoOnOff.ON, 'Always hide'], [AutoOnOff.OFF, 'Never hide']] as const).map(([value, text]) => (
                    <label key={value} className="check">
                        <input type="radio" name="hide-when-empty" checked={hideWhenEmpty === value}
                            onChange={() => change(() => model.setHideWhenEmpty(value))} />
                        {tr(text)}
                    </label>
                ))}
                <label className="check">
                    <input type="checkbox" checked={model.showIfEntireSystemEmpty()}
                        onChange={() => change(() => model.setShowIfEntireSystemEmpty(!model.showIfEntireSystemEmpty()))} />
                    {tr('If the entire system is empty, show this staff')}
                </label>
            </div>
            <hr className="separator" />
            <button type="button" className="secondary create-linked-staff" onClick={() => {
                change(() => model.createLinkedStaff())
                onClose()
            }}>{tr('Create a linked staff')}</button>
            <span className="hint">{tr('Linked staves contain identical notation (e.g. for guitar tablature)')}</span>
        </SettingsPopup>
    )
}

/** a click after a drag does not select */
let s_suppressClick = false

/**
 * LayoutPanelItemDelegate's drag (vertical) and the DropArea of the rows: dragging a row over another row that accepts
 * it moves the row (LayoutPanelTreeModel::moveRows while startActiveDrag), the drop changes the score (endActiveDrag)
 */
function startRowDrag(e: React.PointerEvent, model: LayoutPanelTreeModel, item: AbstractLayoutPanelTreeItem, key: string, expanded: boolean): void {
    const startY = e.clientY
    let dragging = false
    const rowOf = (x: number, y: number): AbstractLayoutPanelTreeItem | null => {
        const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.layout-tree [data-key]')
        const k = el?.dataset.key
        return k ? allItems(model).find(i => layoutPanelItemKey(i) === k) ?? null : null
    }
    const move = (ev: PointerEvent): void => {
        if (!dragging) {
            if (Math.abs(ev.clientY - startY) < 5) {
                return
            }
            dragging = true
            model.startActiveDrag()
            if (expanded) {
                setExpanded(key, false)
            }
            document.body.classList.add('layout-row-dragging')
        }
        const target = rowOf(ev.clientX, ev.clientY)
        if (!target || target === item || !target.canAcceptDrop(item) || item.row() < 0 || target.row() < 0) {
            return
        }
        model.moveRows(item.parentItem(), item.row(), 1, target.parentItem(), target.row())
    }
    const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (dragging) {
            document.body.classList.remove('layout-row-dragging')
            s_suppressClick = true
            setTimeout(() => { s_suppressClick = false }, 0)
            model.endActiveDrag()
        }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
}

function TreeRow({ row, model, editable, focused, setFocused, onSettings }: {
    row: Row
    model: LayoutPanelTreeModel
    editable: boolean
    focused: boolean
    setFocused: (key: string) => void
    onSettings: (item: AbstractLayoutPanelTreeItem, anchor: DOMRect) => void
}): React.JSX.Element {
    const { item, depth, expanded } = row
    const type = item.type()
    const isControl = type === LayoutPanelItemType.CONTROL_ADD_STAFF
    const isPart = type === LayoutPanelItemType.PART
    const visible = item.isVisible()
    const settingsRef = useRef<HTMLButtonElement>(null)

    const select = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void => {
        if (item.isSelectable()) {
            model.selectRow(item, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
        }
    }

    if (isControl) {
        // LayoutPanelItemControl.qml: "+ Add staff"
        return (
            <div role="treeitem" aria-level={depth + 1} aria-selected={item.isSelected()} tabIndex={focused ? 0 : -1}
                className={`layout-row control${item.isSelected() ? ' selected' : ''}`} data-key={row.key} data-type="control"
                style={{ '--depth': depth } as React.CSSProperties}
                onFocus={() => setFocused(row.key)}>
                <button className="layout-row-button add-staff" tabIndex={-1} disabled={!editable} aria-hidden="true"
                    onClick={() => item.appendNewItem()}>{icon('PLUS')}</button>
                <span className="layout-row-title">{item.title()}</span>
            </div>
        )
    }

    const toggleVisibility = (): void => {
        if (item.isSelected()) {
            model.changeVisibilityOfSelectedRows(!visible)
        } else {
            model.changeVisibility(item, !visible)
        }
    }

    return (
        <div role="treeitem" aria-level={depth + 1} aria-selected={item.isSelected()} aria-expanded={item.isExpandable() ? expanded : undefined}
            aria-label={item.title()} tabIndex={focused ? 0 : -1} data-key={row.key}
            data-type={isPart ? 'part' : type === LayoutPanelItemType.STAFF ? 'staff' : 'system-objects'}
            className={`layout-row${item.isSelected() ? ' selected' : ''}${isPart && expanded ? ' expanded' : ''}${depth > 0 ? ' child' : ''}${visible ? '' : ' hidden-item'}`}
            style={{ '--depth': depth } as React.CSSProperties}
            onFocus={() => setFocused(row.key)}
            onPointerDown={(e) => {
                if (editable && e.button === 0 && item.isSelectable() && !(e.target as HTMLElement).closest('button')) {
                    startRowDrag(e, model, item, row.key, expanded)
                }
            }}
            onClick={(e) => {
                e.stopPropagation()
                if (s_suppressClick) {
                    s_suppressClick = false
                    return
                }
                select(e)
            }}
            onDoubleClick={() => {
                if (item.isExpandable()) {
                    setExpanded(row.key, !expanded)
                }
            }}>
            {type === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER ? (
                <span className="layout-row-button dash" aria-hidden="true">{icon('MINUS')}</span>
            ) : (
                <button className="layout-row-button visibility" tabIndex={-1} disabled={!editable}
                    title={`${item.title()}, ${visible ? qtrc('ui', 'Visible') : qtrc('ui', 'Hidden')}`}
                    aria-label={`${item.title()}, ${visible ? qtrc('ui', 'Visible') : qtrc('ui', 'Hidden')}`} aria-pressed={visible}
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleVisibility()
                    }}>
                    {icon(visible ? 'EYE_OPEN' : 'EYE_CLOSED')}
                </button>
            )}
            <span className="layout-row-indent" />
            {item.isExpandable() || depth > 0 ? (
                <button className="layout-row-button expand" tabIndex={-1} hidden={!item.isExpandable()}
                    aria-label={expanded ? qtrc('global', 'Collapse') : qtrc('global', 'Expand')}
                    onClick={(e) => {
                        e.stopPropagation()
                        setExpanded(row.key, !expanded)
                    }}>
                    {icon(expanded ? 'SMALL_ARROW_DOWN' : 'SMALL_ARROW_RIGHT')}
                </button>
            ) : null}
            <span className={`layout-row-title${isPart && visible ? ' bold' : ''}`}>{item.title()}</span>
            {item.settingsAvailable() && (
                <button ref={settingsRef} className="layout-row-button settings" tabIndex={-1}
                    disabled={!item.settingsEnabled()}
                    title={qtrc('layoutpanel', 'Settings')} aria-label={qtrc('layoutpanel', 'Settings')}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSettings(item, settingsRef.current!.getBoundingClientRect())
                    }}>
                    {icon('SETTINGS_COG')}
                </button>
            )}
        </div>
    )
}

export function LayoutPanel(): React.JSX.Element {
    useLanguage()
    useLayoutPanelState()
    const view = useScoreView()
    const score = currentScore()
    const editable = canEditParts(score)
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    const [focusedKey, setFocusedKey] = useState('')
    const [settings, setSettings] = useState<{ item: AbstractLayoutPanelTreeItem; anchor: DOMRect } | null>(null)
    const treeRef = useRef<HTMLDivElement>(null)

    // C++ onNotationChanged / load(): a new model for each score and after changes of it
    const model = useMemo(() => {
        if (!score) {
            return null
        }
        const m = createLayoutPanelModel(score, notationParts(score), notationParts(score.masterScore()))
        m.updateSelectedRows()
        return m
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [score, view.scoreVersion])

    useEffect(() => {
        if (!model) {
            return
        }
        s_model = model
        model.onChanged = () => {
            s_selectedKeys = model.selectedItems().map(layoutPanelItemKey)
            forceUpdate()
            actionsChanged()
        }
        return () => {
            model.onChanged = null
            if (s_model === model) {
                s_model = null
            }
        }
    }, [model])

    // the score selection selects the rows of its parts; a model reloaded after a change of the score keeps the
    // selected rows (C++ updates the rows of the existing model)
    const lastModel = useRef<LayoutPanelTreeModel | null>(null)
    useEffect(() => {
        if (!model) {
            return
        }
        if (model !== lastModel.current) {
            const reloaded = lastModel.current?.score() === model.score() && s_keepSelection
            s_keepSelection = false
            lastModel.current = model
            if (reloaded && s_selectedKeys.length) {
                const items = allItems(model).filter(i => s_selectedKeys.includes(layoutPanelItemKey(i)))
                model.selectItems(items)
                return
            }
        }
        model.updateSelectedRows()
    }, [model, view.selectionVersion])

    if (!model) {
        return <div className="layout-panel" />
    }

    const rows = visibleRows(model, s_expanded)
    const focused = rows.some(r => r.key === focusedKey) ? focusedKey : rows.find(r => r.item.isSelected())?.key ?? rows[0]?.key ?? ''

    const focusRow = (idx: number): void => {
        const r = rows[Math.max(0, Math.min(rows.length - 1, idx))]
        if (r) {
            setFocusedKey(r.key)
            treeRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(r.key)}"]`)?.focus()
        }
    }

    const onKeyDown = (e: React.KeyboardEvent): void => {
        const idx = rows.findIndex(r => r.key === focused)
        const row = rows[idx]
        if (!row) {
            return
        }
        const rtl = document.documentElement.dir === 'rtl'
        const key = rtl && e.key === 'ArrowLeft' ? 'ArrowRight' : rtl && e.key === 'ArrowRight' ? 'ArrowLeft' : e.key
        let handled = true
        const moveTo = (i: number): void => {
            focusRow(i)
            // Shift+arrows extend the selection like a Shift+click
            const r = rows[Math.max(0, Math.min(rows.length - 1, i))]
            if (e.shiftKey && r?.item.isSelectable()) {
                model.selectRow(r.item, { shift: true })
            }
        }
        switch (key) {
        case 'ArrowDown': moveTo(idx + 1); break
        case 'ArrowUp': moveTo(idx - 1); break
        case 'Home': focusRow(0); break
        case 'End': focusRow(rows.length - 1); break
        case 'ArrowRight':
            if (row.item.isExpandable() && !row.expanded) {
                setExpanded(row.key, true)
            } else if (row.expanded) {
                focusRow(idx + 1)
            }
            break
        case 'ArrowLeft':
            if (row.expanded) {
                setExpanded(row.key, false)
            } else if (row.depth > 0) {
                let parent = idx - 1
                while (parent > 0 && rows[parent].depth >= row.depth) {
                    parent--
                }
                focusRow(parent)
            }
            break
        case 'Enter':
        case ' ':
            // onNavigationTriggered: like a click; on the "Add staff" row the button
            if (row.item.type() === LayoutPanelItemType.CONTROL_ADD_STAFF) {
                if (editable) {
                    row.item.appendNewItem()
                }
            } else if (row.item.isSelectable()) {
                model.selectRow(row.item, { shift: e.shiftKey })
            }
            break
        case 'Delete':
        case 'Backspace':
            if (editable) {
                removeSelectedRows(model)
            }
            break
        case 'Escape':
            handled = model.selectedItems().length > 0
            model.clearSelection()
            break
        default:
            handled = false
        }
        if (handled) {
            e.preventDefault()
            e.stopPropagation()
        }
    }

    const addShortcut = shortcutText('instruments')
    const emptyText = addShortcut
        //: Keep in sync with the text of the "Add" button at the top of the Layout panel (LayoutControlPanel.qml)
        ? arg(qtrc('layoutpanel', 'There are no instruments in your score. To choose some, press <b>Add</b>, or use the keyboard shortcut %1.'), `<b>${addShortcut}</b>`)
        : qtrc('layoutpanel', 'There are no instruments in your score. To choose some, press <b>Add</b>.')

    return (
        <div className="layout-panel" onClick={() => model.clearSelection()}>
            <div onClick={(e) => e.stopPropagation()}>
                <LayoutControlPanel model={model} editable={editable} />
            </div>
            {model.isEmpty() ? (
                // the text contains MuseScore's <b> markup
                <p className="layout-empty" dangerouslySetInnerHTML={{ __html: emptyText }} />
            ) : (
                <div ref={treeRef} className="layout-tree" role="tree" aria-label={qtrc('appshell', 'Layout')} aria-multiselectable="true"
                    onKeyDown={onKeyDown}>
                    {rows.map(r => (
                        <TreeRow key={r.key} row={r} model={model} editable={editable} focused={r.key === focused}
                            setFocused={setFocusedKey} onSettings={(item, anchor) => setSettings({ item, anchor })} />
                    ))}
                </div>
            )}
            {settings && (settings.item.type() === LayoutPanelItemType.STAFF
                ? <StaffSettingsPopup item={settings.item} anchor={settings.anchor} onClose={() => setSettings(null)} />
                : settings.item.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER
                    ? <SystemObjectsLayerSettingsPopup item={settings.item} anchor={settings.anchor} onClose={() => setSettings(null)} />
                    : <InstrumentSettingsPopup item={settings.item} anchor={settings.anchor} onClose={() => setSettings(null)} />)}
            {s_dialogOpen && (
                <InstrumentsDialog onClose={(ids) => {
                    s_dialogOpen = false
                    notify()
                    // InstrumentsActionsController::selectInstruments: the instruments are added to the master score
                    if (ids?.length && score && addInstruments(score.masterScore(), ids)) {
                        scoreChanged()
                    }
                }} />
            )}
        </div>
    )
}
