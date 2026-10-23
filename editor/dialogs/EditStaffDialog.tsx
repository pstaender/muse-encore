/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's Staff/Part properties dialog (notationscene/widgets/editstaff.ui/.cpp, the action "staff-properties"):
 * the staff properties (lines, line distance, scale, extra distance, clef/time signature/barlines, staff line color,
 * merge matching rests) and the part properties (instrument, names, usable pitch ranges, transposition, sharps/flats,
 * string data); "Apply and go to previous/next staff", Cancel, Apply, OK. The logic is the library's EditStaff.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AutoOnOff, PreferSharpFlat, createEditStaff, type EditStaff, type EditStaffType, type EditStaffValues } from '../../src/index'
import { ICON_CODES } from '../actions/uiactiondata'
import { qtrc, useLanguage } from '../i18n'
import { currentScore, scoreChanged } from '../scoreview'
import { EditPitchDialog, pitchToString } from './EditPitchDialog'
import { EditStringDataDialog } from './EditStringDataDialog'
import { EditStaffTypeDialog } from './EditStaffTypeDialog'
import { askInstrument } from './SelectInstrumentDialog'

const tr = (s: string): string => qtrc('EditStaffBase', s)

/** the items of iList (the order of Interval::allIntervals: semitones - name) */
const INTERVALS = [
    '0 - Perfect unison', '1 - Augmented unison', '0 - Diminished second', '1 - Minor second', '2 - Major second',
    '3 - Augmented second', '2 - Diminished third', '3 - Minor third', '4 - Major third', '5 - Augmented third',
    '4 - Diminished fourth', '5 - Perfect fourth', '6 - Augmented fourth', '6 - Diminished fifth', '7 - Perfect fifth',
    '8 - Augmented fifth', '7 - Diminished sixth', '8 - Minor sixth', '9 - Major sixth', '10 - Augmented sixth',
    '9 - Diminished seventh', '10 - Minor seventh', '11 - Major seventh', '12 - Augmented seventh', '11 - Diminished octave',
    '12 - Perfect octave',
]

type PitchField = 'minPitchA' | 'maxPitchA' | 'minPitchP' | 'maxPitchP'

export function EditStaffDialog({ editStaff, onClose }: { editStaff: EditStaff; onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const [values, setValuesState] = useState<EditStaffValues>(() => editStaff.values())
    const [, setRevision] = useState(0)
    const [pitchEdit, setPitchEdit] = useState<PitchField | null>(null)
    const [stringEdit, setStringEdit] = useState(false)
    const [invalidName, setInvalidName] = useState(false)
    const [staffTypeEdit, setStaffTypeEdit] = useState<EditStaffType | null>(null)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    /** the dialog's controls follow the library's values */
    const sync = (): void => {
        setValuesState(editStaff.values())
        setRevision(r => r + 1)
    }
    const set = (patch: Partial<EditStaffValues>): void => {
        editStaff.setValues(patch)
        setValuesState(editStaff.values())
    }
    const apply = (): boolean => {
        const ok = editStaff.apply()
        setInvalidName(!ok)
        scoreChanged()
        sync()
        return ok
    }

    const number = (label: string, key: keyof EditStaffValues, opts: { min: number; max: number; step: number; suffix?: string }): React.JSX.Element => (
        <label className="field-row">
            <span>{tr(label)}</span>
            <span className="spin">
                <input type="number" min={opts.min} max={opts.max} step={opts.step} value={values[key] as number}
                    onChange={e => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) {
                            set({ [key]: Math.max(opts.min, Math.min(opts.max, n)) } as Partial<EditStaffValues>)
                        }
                    }} />
                {opts.suffix && <span className="suffix">{opts.suffix}</span>}
            </span>
        </label>
    )
    const check = (label: string, key: keyof EditStaffValues): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" checked={values[key] as boolean} onChange={e => set({ [key]: e.target.checked } as Partial<EditStaffValues>)} />
            {tr(label)}
        </label>
    )
    const pitch = (key: PitchField): React.JSX.Element => (
        <span className="pitch-field">
            <input type="text" readOnly value={pitchToString(values[key])} aria-label={key} />
            <button type="button" className="icon-button" title={tr('Edit')} aria-label={tr('Edit')}
                onClick={() => setPitchEdit(key)}>{String.fromCodePoint(ICON_CODES.EDIT)}</button>
        </span>
    )

    const strings = editStaff.strings()

    return (
        <dialog ref={ref} className="edit-staff" aria-labelledby="edit-staff-title"
            onClose={(e) => {
                // React passes the close events of the nested dialogs on to this one
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}>
            <h2 id="edit-staff-title">{tr('Staff/Part properties')}</h2>
            <form onSubmit={(e) => {
                e.preventDefault()
                if (apply()) {
                    ref.current?.close()
                }
            }}>
                <fieldset className="groupbox">
                    <legend>{tr('Staff properties')}</legend>
                    <div className="edit-staff-grid">
                        {number('Lines:', 'lines', { min: 1, max: 14, step: 1 })}
                        {number('Line distance:', 'lineDistance', { min: 0, max: 99, step: 0.25, suffix: tr('sp') })}
                        {number('Scale:', 'mag', { min: 10, max: 1000, step: 1, suffix: '%' })}
                        {number('Extra distance above staff:', 'extraDistance', { min: -50, max: 50, step: 0.25, suffix: tr('sp') })}
                        <div className="field-row">
                            <span>{tr('Style group:')}</span>
                            <span className="staff-group">{editStaff.staffGroupName()}</span>
                        </div>
                        <label className="field-row">
                            <span>{tr('Merge matching rests:')}</span>
                            <select value={values.mergeMatchingRests} onChange={e => set({ mergeMatchingRests: Number(e.target.value) as AutoOnOff })}>
                                <option value={AutoOnOff.AUTO}>{tr('Auto')}</option>
                                <option value={AutoOnOff.ON}>{tr('On')}</option>
                                <option value={AutoOnOff.OFF}>{tr('Off')}</option>
                            </select>
                        </label>
                        <label className="field-row">
                            <span>{tr('Staff line color:')}</span>
                            <input type="color" value={values.color} onChange={e => set({ color: e.target.value })} />
                        </label>
                    </div>
                    <div className="edit-staff-checks">
                        {check('Show clef', 'showClef')}
                        {check('Show time signature', 'showTimesig')}
                        {check('Show barlines', 'showBarlines')}
                        {check('Invisible staff lines', 'invisible')}
                        {check('Hide system barline', 'hideSystemBarLine')}
                    </div>
                    <div>
                        <button type="button" className="secondary advanced-style" onClick={() => setStaffTypeEdit(editStaff.createEditStaffType())}>
                            {tr('Advanced style properties…')}
                        </button>
                    </div>
                </fieldset>

                <fieldset className="groupbox">
                    <legend>{tr('Part properties')}</legend>
                    <div className="field-row instrument-row">
                        <span>{tr('Instrument:')}</span>
                        <span className="instrument-name">{editStaff.instrumentName()}</span>
                        <button type="button" className="secondary replace-instrument" onClick={() => {
                            void askInstrument().then(templateId => {
                                if (templateId && editStaff.replaceInstrument(templateId)) {
                                    sync()
                                }
                            })
                        }}>{tr('Replace instrument…')}</button>
                    </div>
                    <label className="field">
                        <span>{tr('Long instrument name:')}</span>
                        <textarea rows={2} value={values.longName} onChange={e => set({ longName: e.target.value })} />
                    </label>
                    <label className="field">
                        <span>{tr('Short instrument name:')}</span>
                        <textarea rows={2} value={values.shortName} onChange={e => set({ shortName: e.target.value })} />
                    </label>
                    {invalidName && (
                        <p className="error" role="alert">
                            {qtrc('notation/staffpartproperties', 'Invalid instrument name')}: {qtrc('notation/staffpartproperties', 'The instrument name is invalid.')}
                        </p>
                    )}
                    <div className="pitch-ranges">
                        <span>{tr('Usable pitch range:')}</span>
                        <span className="pitch-range">
                            <span>{tr('Amateur:')}</span>{pitch('minPitchA')}<span>-</span>{pitch('maxPitchA')}
                        </span>
                        <span className="pitch-range">
                            <span>{tr('Professional:')}</span>{pitch('minPitchP')}<span>-</span>{pitch('maxPitchP')}
                        </span>
                    </div>
                    <div className="transposition" title={tr('Interval from written to sounding pitch')}>
                        <span>{tr('Transposition:')}</span>
                        <select aria-label={tr('Interval')} value={values.intervalIndex}
                            onChange={e => set({ intervalIndex: Number(e.target.value) })}>
                            {INTERVALS.map((n, i) => <option key={i} value={i}>{tr(n)}</option>)}
                        </select>
                        <input type="number" aria-label={tr('Octave')} min={0} max={10} value={values.octave}
                            onChange={e => set({ octave: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
                        <span>{tr('Octave(s) +')}</span>
                        <label className="check">
                            <input type="radio" name="edit-staff-direction" checked={values.up} onChange={() => set({ up: true })} />
                            {tr('Up')}
                        </label>
                        <label className="check">
                            <input type="radio" name="edit-staff-direction" checked={!values.up} onChange={() => set({ up: false })} />
                            {tr('Down')}
                        </label>
                    </div>
                    {editStaff.showPreferSharpFlat() && (
                        <label className="field-row">
                            <span>{tr('Prefer sharps or flats for transposed key signatures:')}</span>
                            <select value={values.preferSharpFlat} onChange={e => set({ preferSharpFlat: Number(e.target.value) as PreferSharpFlat })}>
                                <option value={PreferSharpFlat.NONE}>{tr('None')}</option>
                                <option value={PreferSharpFlat.SHARPS}>{tr('Sharps')}</option>
                                <option value={PreferSharpFlat.FLATS}>{tr('Flats')}</option>
                                <option value={PreferSharpFlat.AUTO}>{tr('Auto')}</option>
                            </select>
                        </label>
                    )}
                    {strings.length > 0 && (
                        <div className="string-data-frame">
                            <span>{tr('Number of strings:')}</span>
                            <span className="num-strings">{strings.length}</span>
                            <button type="button" className="secondary" onClick={() => setStringEdit(true)}>{tr('Edit string data…')}</button>
                            {check('Don’t reflect transposition in linked tablature staves', 'noReflectTranspositionInLinkedTab')}
                        </div>
                    )}
                </fieldset>

                <div className="dialog-buttons">
                    <button type="button" className="icon-button" disabled={!editStaff.hasPreviousStaff()}
                        title={tr('Apply and go to previous staff')} aria-label={tr('Apply and go to previous staff')}
                        onClick={() => {
                            editStaff.gotoPreviousStaff()
                            scoreChanged()
                            sync()
                        }}>{String.fromCodePoint(ICON_CODES.ARROW_UP)}</button>
                    <button type="button" className="icon-button" disabled={!editStaff.hasNextStaff()}
                        title={tr('Apply and go to next staff')} aria-label={tr('Apply and go to next staff')}
                        onClick={() => {
                            editStaff.gotoNextStaff()
                            scoreChanged()
                            sync()
                        }}>{String.fromCodePoint(ICON_CODES.ARROW_DOWN)}</button>
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="button" className="secondary" onClick={() => apply()}>{qtrc('global', 'Apply')}</button>
                    <button type="submit" className="primary">{qtrc('global', 'OK')}</button>
                </div>
            </form>
            {pitchEdit && (
                <EditPitchDialog midiCode={values[pitchEdit]} onClose={(p) => {
                    const key = pitchEdit
                    setPitchEdit(null)
                    if (p !== null) {
                        set({ [key]: p } as Partial<EditStaffValues>)
                    }
                }} />
            )}
            {staffTypeEdit && (
                <EditStaffTypeDialog model={staffTypeEdit} onClose={(accepted) => {
                    const model = staffTypeEdit
                    setStaffTypeEdit(null)
                    if (accepted) {
                        editStaff.setStaffType(model.getStaffType())
                        sync()
                    }
                }} />
            )}
            {stringEdit && (
                <EditStringDataDialog value={{ strings, frets: editStaff.frets() }} onClose={(v) => {
                    setStringEdit(false)
                    if (v) {
                        editStaff.setStringData(v.frets, v.strings)
                        sync()
                    }
                }} />
            )}
        </dialog>
    )
}

let s_editStaff: { key: number; editStaff: EditStaff } | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setOpen(v: typeof s_editStaff): void {
    s_editStaff = v
    for (const l of listeners) {
        l()
    }
}

/** the staff of the selection can be edited (NotationActionController::openStaffProperties) */
export function canOpenStaffProperties(): boolean {
    const score = currentScore()
    return !!score && !!score.selection() && !score.selection().isNone()
}

/** opens the dialog for the staff of the selection */
export function openStaffProperties(): void {
    const score = currentScore()
    const editStaff = score ? createEditStaff(score) : null
    if (editStaff) {
        setOpen({ key: ++s_key, editStaff })
    }
}

export function EditStaffHost(): React.JSX.Element | null {
    const open = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_editStaff)
    return open ? <EditStaffDialog key={open.key} editStaff={open.editStaff} onClose={() => setOpen(null)} /> : null
}
