/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's TupletDialog (notationscene/widgets/tupletdialog.ui/.cpp, "Create tuplet", the action tuplet-dialog):
 * the ratio and the number and bracket types (defaults from the score's style); OK puts the tuplet (custom-tuplet).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { TupletBracketType, TupletNumberType, addCustomTuplet, customTupletDefaults, type MasterScore } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

const tr = (s: string, disambiguation = ''): string => qtrc('TupletDialog', s, disambiguation)

function TupletDialog({ score, onClose }: { score: MasterScore; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [defaults] = useState(() => customTupletDefaults(score))
    const [actualNotes, setActualNotes] = useState(3)
    const [normalNotes, setNormalNotes] = useState(2)
    const [numberType, setNumberType] = useState(defaults.numberType)
    const [bracketType, setBracketType] = useState(defaults.bracketType)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const spin = (value: number, set: (v: number) => void, label: string): React.JSX.Element => (
        <input type="number" min={1} max={9999} value={value} aria-label={label}
            onChange={e => {
                const n = Math.round(Number(e.target.value))
                if (Number.isFinite(n)) {
                    set(Math.max(1, Math.min(9999, n)))
                }
            }} />
    )
    const radio = <T,>(name: string, value: T, current: T, set: (v: T) => void, label: string): React.JSX.Element => (
        <label className="check">
            <input type="radio" name={name} checked={current === value} onChange={() => set(value)} />
            {label}
        </label>
    )

    return (
        <dialog ref={ref} className="tuplet-dialog" aria-labelledby="tuplet-dialog-title"
            onClose={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="tuplet-dialog-title">{tr('Create tuplet')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                // TupletDialog::apply(): dispatch("custom-tuplet", options)
                if (addCustomTuplet(score, actualNotes, normalNotes, numberType, bracketType)) {
                    scoreChanged()
                }
                ref.current?.close()
            }}>
                <fieldset className="groupbox">
                    <legend>{tr('Type')}</legend>
                    <div className="ratio">
                        <span>{tr('Ratio:')}</span>
                        {spin(actualNotes, setActualNotes, tr('Ratio:'))}
                        <span>/</span>
                        {spin(normalNotes, setNormalNotes, '/')}
                    </div>
                </fieldset>
                <fieldset className="groupbox">
                    <legend>{tr('Format')}</legend>
                    <div className="format">
                        <fieldset className="groupbox" aria-label={`${tr('Format')} ${tr('Number')}`}>
                            <legend>{tr('Number')}</legend>
                            {radio('number', TupletNumberType.SHOW_NUMBER, numberType, setNumberType, tr('Number'))}
                            {radio('number', TupletNumberType.SHOW_RELATION, numberType, setNumberType, tr('Ratio'))}
                            {radio('number', TupletNumberType.NO_TEXT, numberType, setNumberType, tr('None', 'no tuplet number style'))}
                        </fieldset>
                        <fieldset className="groupbox" aria-label={`${tr('Format')} ${tr('Bracket')}`}>
                            <legend>{tr('Bracket')}</legend>
                            {radio('bracket', TupletBracketType.AUTO_BRACKET, bracketType, setBracketType, tr('Auto'))}
                            {radio('bracket', TupletBracketType.SHOW_BRACKET, bracketType, setBracketType, tr('Bracket'))}
                            {radio('bracket', TupletBracketType.SHOW_NO_BRACKET, bracketType, setBracketType, tr('None', 'no tuplet bracket style'))}
                        </fieldset>
                    </div>
                </fieldset>
                <div className="dialog-buttons">
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

/** NotationActionController::openTupletOtherDialog */
export function openTupletDialog(): void {
    const score = currentScore()
    if (score) {
        setOpen({ key: ++s_key, score })
    }
}

export function TupletDialogHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_open)
    return open ? <TupletDialog key={open.key} score={open.score} onClose={() => setOpen(null)} /> : null
}
