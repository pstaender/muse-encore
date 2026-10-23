/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's ProjectPropertiesDialog (project/qml/MuseScore/Project/ProjectPropertiesDialog.qml with
 * ProjectPropertiesView, PropertyItem and ProjectPropertiesFileInfoPanel; File > Project properties…): the meta tags of
 * the score, saved as one undoable command on OK. (The browser cannot open the file's location: no such button.)
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { createProjectPropertiesModel, type MasterScore } from '../../src/index'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'
import { session } from '../session'

const tr = (s: string): string => qtrc('project/properties', s)

function ProjectPropertiesDialog({ score, onClose }: { score: MasterScore; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const list = useRef<HTMLDivElement>(null)
    const [model] = useState(() => {
        const m = createProjectPropertiesModel(score, session().current?.name ?? '')
        m.load()
        return m
    })
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    const [added, setAdded] = useState(-1)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    useEffect(() => {
        // propertyAdded: the new row's name field gets the focus
        if (added >= 0) {
            list.current?.querySelector<HTMLInputElement>(`[data-row="${added}"] input`)?.focus()
        }
    }, [added])

    const info = (name: string, value: string): React.JSX.Element => (
        <div className="property-info">
            <span className="property-name">{name}</span>
            <span className="property-value">{value}</span>
        </div>
    )

    return (
        <dialog ref={ref} className="project-properties" aria-labelledby="project-properties-title"
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="project-properties-title">{tr('Project properties')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                model.saveProperties()
                scoreChanged(false)
                ref.current?.close()
            }}>
                <div ref={list} className="property-list">
                    {model.properties().map((p, i) => (
                        <div key={i} className="property-row" data-row={i}>
                            {p.isStandardProperty
                                ? <label className="property-name" htmlFor={`project-property-${i}`}>{p.name}</label>
                                : <input type="text" className="property-name" value={p.name} placeholder={tr('Property')}
                                    aria-label={tr('Property')}
                                    onChange={(e) => {
                                        model.setPropertyName(i, e.target.value)
                                        rerender()
                                    }} />}
                            {p.isMultiLineEdit
                                ? <textarea id={`project-property-${i}`} rows={2} value={p.value}
                                    onChange={(e) => {
                                        model.setPropertyValue(i, e.target.value)
                                        rerender()
                                    }} />
                                : <input id={`project-property-${i}`} type="text" value={p.value}
                                    placeholder={p.isStandardProperty ? '' : tr('Value')}
                                    aria-label={p.isStandardProperty ? p.name : tr('Value')}
                                    onChange={(e) => {
                                        model.setPropertyValue(i, e.target.value)
                                        rerender()
                                    }} />}
                            <button type="button" className="icon-button" aria-label="Delete" disabled={p.isStandardProperty}
                                style={p.isStandardProperty ? { visibility: 'hidden' } : undefined}
                                onClick={() => {
                                    model.deleteProperty(i)
                                    rerender()
                                }}>
                                <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(ICON_CODES.DELETE_TANK)}</span>
                            </button>
                        </div>
                    ))}
                </div>
                <div className="file-info">
                    {info(tr('File path:'), model.filePath())}
                    <div className="file-info-row">
                        {info(tr('MuseScore Studio version:'), model.version())}
                        {info(tr('Revision:'), model.revision())}
                        {info(tr('API-Level:'), model.apiLevel())}
                    </div>
                </div>
                <div className="dialog-buttons">
                    <button type="button" className="secondary"
                        onClick={() => {
                            setAdded(model.newProperty())
                            rerender()
                        }}>{qtrc('project', 'New property')}</button>
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary">{qtrc('global', 'OK')}</button>
                </div>
            </form>
        </dialog>
    )
}

let s_open: { key: number; score: MasterScore } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_open): void {
    s_open = v
    for (const l of listeners) {
        l()
    }
}

/** ProjectActionsController::openProjectProperties */
export function openProjectPropertiesDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function ProjectPropertiesDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <ProjectPropertiesDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
