/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Transpose (MuseScore's TransposeDialog, notationscene/widgets/transposedialog.ui/.cpp): chromatically to a key or by
 * an interval, or diatonically, with the options for key signatures, chord symbols and double accidentals. Opens with
 * the whole score selected if nothing is selected; the last settings are kept while the app runs (previousState).
 */
import { useEffect, useRef, useState } from 'react'
import { prepareTransposeSelection, transposeSelection, TransposeDirection, TransposeMode, type TransposeSelectionInfo } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'

const tr = (s: string): string => qtrc('TransposeDialogBase', s)

const KEYS = [
    'C♭ major / A♭ minor', 'G♭ major / E♭ minor', 'D♭ major / B♭ minor', 'A♭ major / F minor', 'E♭ major / C minor',
    'B♭ major / G minor', 'F major / D minor', 'C major / A minor', 'G major / E minor', 'D major / B minor',
    'A major / F♯ minor', 'E major / C♯ minor', 'B major / G♯ minor', 'F♯ major / D♯ minor', 'C♯ major / A♯ minor',
]

/** the order of Interval::allIntervals */
const INTERVALS = [
    'Perfect unison', 'Augmented unison', 'Diminished second', 'Minor second', 'Major second', 'Augmented second',
    'Diminished third', 'Minor third', 'Major third', 'Augmented third', 'Diminished fourth', 'Perfect fourth',
    'Augmented fourth', 'Diminished fifth', 'Perfect fifth', 'Augmented fifth', 'Diminished sixth', 'Minor sixth',
    'Major sixth', 'Augmented sixth', 'Diminished seventh', 'Minor seventh', 'Major seventh', 'Augmented seventh',
    'Diminished octave', 'Perfect octave',
]

const DEGREES = ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']

/** C++ TransposeDialogState */
interface TransposeDialogState {
    chromaticChecked: boolean
    transposeByKeyChecked: boolean
    closestKeyChecked: boolean
    upKeyChecked: boolean
    keyListIdx: number
    upIntervalChecked: boolean
    chromaticIntervalIdx: number
    upDiatonicChecked: boolean
    diatonicIntervalIdx: number
    keepDegreeAlterationsChecked: boolean
    needTransposeKeysChecked: boolean
    needTransposeChordNamesChecked: boolean
    needTransposeDoubleSharpsFlatsIdx: number
}

let s_previousState: TransposeDialogState = {
    chromaticChecked: true,
    transposeByKeyChecked: true,
    closestKeyChecked: true,
    upKeyChecked: false,
    keyListIdx: 7,
    upIntervalChecked: true,
    chromaticIntervalIdx: 0,
    upDiatonicChecked: true,
    diatonicIntervalIdx: 0,
    keepDegreeAlterationsChecked: true,
    needTransposeKeysChecked: true,
    needTransposeChordNamesChecked: true,
    needTransposeDoubleSharpsFlatsIdx: 1,
}

type KeyDirection = 'closest' | 'up' | 'down'

export function TransposeDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [info] = useState<TransposeSelectionInfo>(() => {
        const score = currentScore()
        const res = score ? prepareTransposeSelection(score) : { allSelected: false, rangeSelection: false, hasChordNames: false }
        if (res.allSelected) {
            scoreChanged(false)
        }
        return res
    })
    const [state, setState] = useState<TransposeDialogState>(() => ({
        ...s_previousState,
        // setEnableTransposeToKey: "To key" (and the key signatures) only for a range selection; MuseScore's restored
        // state can check the disabled "To key" box, here "By interval" is used then
        transposeByKeyChecked: info.rangeSelection && s_previousState.transposeByKeyChecked,
    }))
    const set = (patch: Partial<TransposeDialogState>): void => setState(s => ({ ...s, ...patch }))

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const keyDirection: KeyDirection = state.closestKeyChecked ? 'closest' : state.upKeyChecked ? 'up' : 'down'

    const apply = (): void => {
        const score = currentScore()
        if (!score) {
            return
        }
        // mode(), direction(), transposeKey(), transposeInterval(), getTransposeKeys(), ...
        const mode = state.chromaticChecked
            ? (state.transposeByKeyChecked ? TransposeMode.TO_KEY : TransposeMode.BY_INTERVAL)
            : TransposeMode.DIATONICALLY
        let direction: TransposeDirection
        switch (mode) {
        case TransposeMode.TO_KEY:
            direction = state.closestKeyChecked ? TransposeDirection.CLOSEST
                : state.upKeyChecked ? TransposeDirection.UP : TransposeDirection.DOWN
            break
        case TransposeMode.BY_INTERVAL:
            direction = state.upIntervalChecked ? TransposeDirection.UP : TransposeDirection.DOWN
            break
        default:
            direction = state.upDiatonicChecked ? TransposeDirection.UP : TransposeDirection.DOWN
            break
        }
        s_previousState = state
        transposeSelection(score, {
            mode,
            direction,
            key: state.keyListIdx - 7,
            interval: state.chromaticChecked ? state.chromaticIntervalIdx : state.diatonicIntervalIdx + 1,
            needTransposeKeys: state.chromaticChecked ? state.needTransposeKeysChecked : state.keepDegreeAlterationsChecked,
            needTransposeChordNames: state.needTransposeChordNamesChecked,
            needTransposeDoubleSharpsFlats: state.needTransposeDoubleSharpsFlatsIdx === 1,
        }, info.allSelected)
        scoreChanged()
    }

    const radio = (name: string, label: string, checked: boolean, onChange: () => void, disabled = false): React.JSX.Element => (
        <label className="check">
            <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
            {tr(label)}
        </label>
    )

    return (
        <dialog ref={ref} className="transpose" aria-labelledby="transpose-title" onClose={onClose}>
            <h2 id="transpose-title">{tr('Transpose')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                apply()
                ref.current?.close()
            }}>
                <fieldset className="groupbox" disabled={!state.chromaticChecked}>
                    <legend>{radio('transpose-kind', 'Transpose chromatically', state.chromaticChecked, () => set({ chromaticChecked: true }))}</legend>
                    <fieldset className="groupbox" disabled={!info.rangeSelection || !state.transposeByKeyChecked}
                        title={tr('Transpose to key (specified at concert pitch)')}>
                        <legend>{radio('transpose-chromatic', 'To Key', state.transposeByKeyChecked, () => set({ transposeByKeyChecked: true }),
                            !info.rangeSelection)}</legend>
                        <div className="groupbox-row">
                            <select value={state.keyListIdx} onChange={e => set({ keyListIdx: Number(e.target.value) })}>
                                {KEYS.map((k, i) => <option key={k} value={i}>{tr(k)}</option>)}
                            </select>
                            <div className="radio-rows">
                                {(['closest', 'up', 'down'] as const).map(d => (
                                    <label className="check" key={d}>
                                        <input type="radio" name="transpose-key-direction" checked={keyDirection === d}
                                            onChange={() => set({ closestKeyChecked: d === 'closest', upKeyChecked: d === 'up' })} />
                                        {tr(d === 'closest' ? 'Closest' : d === 'up' ? 'Up' : 'Down')}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </fieldset>
                    <fieldset className="groupbox" disabled={state.transposeByKeyChecked} title={tr('Transpose by interval')}>
                        <legend>{radio('transpose-chromatic', 'By interval', !state.transposeByKeyChecked, () => set({ transposeByKeyChecked: false }))}</legend>
                        <div className="groupbox-row">
                            <select aria-label={tr('Interval type')} value={state.chromaticIntervalIdx}
                                onChange={e => set({ chromaticIntervalIdx: Number(e.target.value) })}>
                                {INTERVALS.map((n, i) => <option key={n} value={i}>{tr(n)}</option>)}
                            </select>
                            <div className="radio-rows">
                                {radio('transpose-interval-direction', 'Up', state.upIntervalChecked, () => set({ upIntervalChecked: true }))}
                                {radio('transpose-interval-direction', 'Down', !state.upIntervalChecked, () => set({ upIntervalChecked: false }))}
                            </div>
                        </div>
                    </fieldset>
                    <label className="check">
                        <input type="checkbox" disabled={!info.rangeSelection} checked={state.needTransposeKeysChecked}
                            onChange={e => set({ needTransposeKeysChecked: e.target.checked })} />
                        {tr('Transpose key signatures')}
                    </label>
                </fieldset>
                <fieldset className="groupbox" disabled={state.chromaticChecked}>
                    <legend>{radio('transpose-kind', 'Transpose diatonically', !state.chromaticChecked, () => set({ chromaticChecked: false }))}</legend>
                    <div className="groupbox-row">
                        <select aria-label={tr('Degree type')} value={state.diatonicIntervalIdx}
                            onChange={e => set({ diatonicIntervalIdx: Number(e.target.value) })}>
                            {DEGREES.map((n, i) => <option key={n} value={i}>{tr(n)}</option>)}
                        </select>
                        <div className="radio-rows">
                            {radio('transpose-diatonic-direction', 'Up', state.upDiatonicChecked, () => set({ upDiatonicChecked: true }))}
                            {radio('transpose-diatonic-direction', 'Down', !state.upDiatonicChecked, () => set({ upDiatonicChecked: false }))}
                        </div>
                    </div>
                    <label className="check">
                        <input type="checkbox" checked={state.keepDegreeAlterationsChecked}
                            onChange={e => set({ keepDegreeAlterationsChecked: e.target.checked })} />
                        {tr('Keep degree alterations')}
                    </label>
                </fieldset>
                <fieldset className="groupbox">
                    <legend>{tr('Options')}</legend>
                    <label className="check">
                        <input type="checkbox" disabled={!info.hasChordNames} checked={state.needTransposeChordNamesChecked}
                            onChange={e => set({ needTransposeChordNamesChecked: e.target.checked })} />
                        {tr('Transpose chord symbols and fretboard diagrams')}
                    </label>
                    <label className="groupbox-row">
                        <span>{tr('Accidentals:')}</span>
                        <select value={state.needTransposeDoubleSharpsFlatsIdx}
                            onChange={e => set({ needTransposeDoubleSharpsFlatsIdx: Number(e.target.value) })}>
                            <option value={0}>{tr('Single ♯ and ♭ only')}</option>
                            <option value={1}>{tr('Use double ♯ and ♭')}</option>
                        </select>
                    </label>
                </fieldset>
                <div className="dialog-buttons">
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary" autoFocus>{qtrc('global', 'OK')}</button>
                </div>
            </form>
        </dialog>
    )
}
